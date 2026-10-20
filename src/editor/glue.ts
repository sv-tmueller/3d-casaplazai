/**
 * Wire-up: binds DOM events to the controller primitives and paints on
 * every state change. Lives here (not in controller.ts) so the gesture
 * math stays unit-testable without a real canvas/browser.
 */
import type { FloorplanData, FurnitureItem, Room, Staircase } from "../shared/schema";
import {
  flatFurniture,
  flatOpenings,
  flatRooms,
  migrate,
  validateFloorplan,
} from "../shared/schema";
import { AutosaveManager } from "./autosave";
import {
  attemptDrop,
  bandRect,
  classifyCorner,
  computeOverlaps,
  deriveStepCount,
  evaluateSnapCandidates,
  finalizeRectangle,
  furnitureInBand,
  HANDLE_HIT_PX,
  judgeBulkFollow,
  judgeMoveTarget,
  nearestArrivalFloor,
  nextRotation,
  openingErrorMessage,
  resizeHandleAt,
  resizeHandlesOf,
  roomAt,
  roomInBand,
  screenToWorld,
  SNAP_TOL_PX,
  STAIR_DEFAULT_WIDTH_M,
  stairDepartureElevation,
  stairFromDrag,
  stairInBand,
  validateOpeningDraft,
  worldToScreen,
  type AnyToolMode,
  type Camera,
  type GhostPreview,
  type InteractionPhase,
} from "./controller";
import { FURNITURE_DEFAULTS, OPENING_DEFAULTS } from "./model/constants";
import {
  loadSnapSettings,
  parsePitch,
  resolveSnap,
  safeLocalStorage,
  saveSnapSettings,
  type SnapSettings,
} from "./model/settings";
import {
  DEFAULT_THEME,
  loadTheme,
  saveTheme,
  type ThemePreference,
} from "./model/theme";
import {
  clampTForDrag,
  nearestSegment,
  openingAt,
  openingDragClash,
  pointAtT,
  projectOntoSegment,
  roomSegments,
  validateOpeningCandidate,
} from './model/openings';
import { itemCorners } from './model/furniture';
import type { Pt } from './geom';
import {
  loadUnderlayMap,
  nudgeUnderlay,
  resizeUnderlayFromCorner,
  rotateUnderlayBy,
  saveUnderlayMap,
  underlayCorners,
  underlayHandleAt,
  underlayInteractable,
  UNDERLAY_DEBOUNCE_MS,
  UNDERLAY_FIT_M,
  UNDERLAY_DEFAULT_OPACITY,
  UNDERLAY_NUDGE_LARGE_M,
  UNDERLAY_NUDGE_M,
  UNDERLAY_ROTATE_STEP_DEG,
  type UnderlayState,
} from './model/underlay';
import {
  mountInspectorPanel,
  sameSegmentAddress,
  type InspectorPanel,
  type SelectionDescriptor,
  type SegmentAddress,
} from './inspectorPanel';
import { flashMessage, type EditorDomRefs } from './ui';
import { trapFocus, type FocusTrap } from './popoverFocus';
import { paintScene, paintSelectedSegmentOverlay, stairsOfActiveFloor as activeFloorStairs } from './render';
import { paintMeasureAnnotations, paintMeasurementBadges } from './render/measurementBadges';
import { paintAngleReadouts } from './render/angleReadouts';
import { angleReadoutLabels } from './render/angleReadouts';
import { totalLivableAreaM2, formatTotal } from './measures';
import { renderOffscreen, downloadExport, type ExportScale } from './export';
import { encodeShare } from '../shared/shareLink';
import { isExportDialogOpen, openExportDialog } from './exportDialog';
import { initShortcuts, toolHint, GLOBAL_TOOL_HINT } from './polish';
import { closeHelpModal, isHelpModalOpen, toggleHelpModal } from './helpModal';
/* Issue #144 (Pkg 15.1): first-run experience — demo registry, modal
 * discard gate, empty-state card, floating Plans menu. */
import { CONFIRM_MSG, confirmDialog } from './confirmDialog';
import { mountEmptyStateCard, planIsEmpty, type EmptyStateCard } from './emptyStateCard';
import { mountPlanMenu } from './planMenu';
import { demoById, loadDemoPlan, type DemoId } from './demos';
import { EditorStore, activeFloorPlan, emptyPlan, nextFloorElevation, underlayFor } from './store';
import { stairProgress, validateGeometry } from '../geom';
import { vecAdd, vecSub } from './geom';
import {
  labelHitTest,
  loadMeasurements,
  makeMeasureId,
  saveMeasurements,
  type Measurement,
} from "./model/measure";
import { compassAngleBetween, polarEndpoint } from "./model/angles";
import { mountDimFields, type DimFields } from "./typeInDims";
import type { Mini3DInset } from "./mini3d";
import {
  getPose,
  hasViewerSubscriber,
  sendCommand,
  subscribePose,
  type WalkerPose,
} from "../shared/walkerLink";
import { drawPlaceAim, drawWalkerGlyph } from "./render/walkerGlyph";

const POLYGON_MIN_POINTS = 3;
const CLOSE_HIT_RADIUS_PX = 10; // click-near-start closes the polygon
const INITIAL_SCALE = 80; // px per meter
/** Issue #61: pointer travel (screen px) before a click becomes a drag. */
const OPENING_DRAG_THRESHOLD_PX = 3;
/** Issue #118: pointer travel (screen px) before a stair drag commits. */
const STAIR_MIN_DRAG_PX = 12;

/**
 * Glue-local drag candidate for an opening (issue #61). Mirrors the
 * `draggingFurnitureId` precedent: no InteractionPhase variant is added
 * to controller.ts — the candidate lives here and only becomes a live
 * drag (beginGesture) once the pointer clears the click threshold.
 */
interface OpeningDragCandidate {
  id: string;
  roomId: string;
  segIndex: number;
  kind: "door" | "window";
  width: number;
  sillHeight: number;
  headHeight: number;
  /** tCenter at pick-up (used for the click-vs-drag decision). */
  startT: number;
  /** Last t that validated + streamed — the fallback on invalid release. */
  lastValidT: number;
  /** Pointer-down screen position. */
  startXY: Pt;
  /** True once beginGesture() has fired (threshold crossed). */
  engaged: boolean;
  /** Reason code of the most recent frame (null = valid), for flash-on-release. */
  lastErr: string | null;
}

/**
 * Notice text for a just-committed opening, derived from the opening-row
 * count before/after the addOpening dispatch (issue #36). The reducer
 * emits ONE row for a solo wall and TWO (origin + mirror) for a paired
 * shared wall, so a delta of 1 means this cut pierces only the host
 * wall. Returns null when no warning is warranted (paired success or any
 * non-add outcome).
 */
export function openingCommitNotice(
  rowsBefore: number,
  rowsAfter: number,
): string | null {
  return rowsAfter - rowsBefore === 1 ? "Opening pierces only this wall" : null;
}

/* -------------------- pkg 12.1 helpers (issue #99) ------------------------ */

/** File → data URL (rejects on read failure). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('read failed'));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}

/** Decoded pixel size of a data-URL image (0×0 on decode failure). */
function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  });
}

/**
 * Issue #46 (Pkg 2 nav): pure camera math, kept here so it is unit
 * testable without a canvas (same precedent as openingCommitNotice).
 */

const NEUTRAL_CAMERA: Camera = { originX: 0, originY: 0, scale: INITIAL_SCALE };

function clampScale(scale: number): number {
  return Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, scale));
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Axis-aligned world bbox over every room vertex and every furniture
 * footprint corner. Null when the plan holds no geometry at all.
 */
function planBounds(plan: FloorplanData): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const acc = (p: Pt): void => {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  };
  for (const room of flatRooms(plan)) for (const p of room.polygon) acc(p);
  for (const f of flatFurniture(plan)) for (const p of itemCorners(f)) acc(p);
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/**
 * Camera framing the whole plan inside a w×h CSS-pixel viewport, with
 * FIT_MARGIN breathing room and the bbox midpoint parked on the canvas
 * centre. Missing or zero-extent geometry yields the neutral boot camera
 * (no division by zero).
 */
export function computeFitCamera(
  plan: FloorplanData,
  w: number,
  h: number,
): Camera {
  const b = planBounds(plan);
  if (b === null || !(w > 0) || !(h > 0)) return { ...NEUTRAL_CAMERA };
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  if (!(bw > 0) || !(bh > 0)) return { ...NEUTRAL_CAMERA };
  const scale = clampScale(Math.min(w / bw, h / bh) * (1 - FIT_MARGIN));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { originX: cx - w / 2 / scale, originY: cy + h / 2 / scale, scale };
}

/**
 * Zoom about the canvas midpoint: the world point under the centre stays
 * put, so the buttons read as a viewport zoom rather than a pan. Clamped
 * to the shared MIN/MAX zoom scales.
 */
export function zoomAboutCenter(
  cam: Camera,
  factor: number,
  w: number,
  h: number,
): Camera {
  const scale = clampScale(cam.scale * factor);
  const center = screenToWorld(cam, [w / 2, h / 2]);
  return {
    originX: center[0] - w / 2 / scale,
    originY: center[1] + h / 2 / scale,
    scale,
  };
}

const ZOOM_STEP = 1.1;
export const MIN_ZOOM_SCALE = 12;
export const MAX_ZOOM_SCALE = 480;

/** Button zoom step — deliberately distinct from the wheel's 1.1 (#46). */
export const ZOOM_BUTTON_STEP = 1.2;
/** Fraction of the viewport left clear around the fitted plan bbox (#46). */
export const FIT_MARGIN = 0.1;

export function initEditorInteraction(
  refs: EditorDomRefs,
  store: EditorStore,
  autosave: AutosaveManager,
): void {
  const canvas = refs.canvas;
  const ctx = canvas.getContext("2d"); // null in stub/happy-dom environments
  const cam: Camera = { originX: 0, originY: 0, scale: INITIAL_SCALE };
  let tool: AnyToolMode = "select";
  // Issue #168 (#126 fix round): true while the Pan tool is armed BY the
  // Space-hold. Every explicit pick funnels through setActiveTool, which
  // drops this flag, so an explicit tool choice beats the Space-release
  // restore at the bottom of this section.
  let spacePanOwnsTool = false;
  let phase: InteractionPhase = { tag: "idle" };
  // Issue #126 (Pkg 14.x): editor theme preference (light/dark), loaded at
  // boot from its own localStorage slot and mirrored onto <html> by
  // applyTheme() below. EDITOR state only — never part of the plan.
  let theme: ThemePreference = DEFAULT_THEME;
  let hoverRoomId: string | null = null;
  /** Issue #53: index of the resize handle under the cursor, if any. */
  let hoverHandle: number | null = null;
  // pkg 3 (issue #4):
  let stampType: string = "bed";
  let ghost: GhostPreview | null = null;
  /*
   * Issue #139 (ghost throttle): memo for updateStairGhost — at most
   * one validateGeometry per distinct snapped cursor cell. Declared
   * NEXT TO `ghost` (well before the store subscriber that clears it)
   * so a notify firing mid-init never trips the TDZ.
   */
  let stairGhostCache: {
    anchor: Pt;
    cursorCell: string;
    roomId: string;
    stair: Staircase | null;
    valid: boolean;
  } | null = null;
  /** Issue #139 seam: full verdict computations since boot. */
  let stairVerdictComputations = 0;
  let hoverSeg: { roomId: string; segIndex: number } | null = null;
  let draggingFurnitureId: string | null = null;
  // Issue #61: opening drag candidate (null = no opening drag in flight).
  let dragOpening: OpeningDragCandidate | null = null;
  // pkg 13.2 (issue #110): multi-select marquee. GLUE-LOCAL state on the
  // #61 candidate precedent — no InteractionPhase variant, no store
  // slice. `multiSelected` mirrors underlaySelected: a plain Set the
  // store knows nothing about (commands carry explicit id arrays), so
  // membership changes never touch history. `marquee` is the armed
  // band candidate (SCREEN px; it only engages past the click
  // threshold, so a plain empty-space click keeps today's deselect).
  let multiSelected = new Set<string>();
  let marquee: { start: Pt; cur: Pt; engaged: boolean } | null = null;
  /** Furniture ids participating in an in-flight bulk drag (null = single). */
  let bulkDragIds: string[] | null = null;
  /** Issue #110: pointer travel (screen px) before a marquee band engages. */
  const MARQUEE_ENGAGE_PX = 3;

  // Issue #147 CP4: the mirrored walker pose published by the viewer pane
  // (null = no live walker, including the retraction when walk mode ends).
  // GLUE-LOCAL on the #61/#110 candidate precedent — no store slice, no
  // InteractionPhase variant; it is display state, not plan content.
  let walkerPose: WalkerPose | null = null;
  /**
   * Coalesced repaint handle for pose ticks. The pose can arrive every
   * viewer frame; the editor repaints at most once per animation frame
   * (same discipline as mini3d's requestRender).
   */
  let walkerGlyphRaf: number | null = null;
  /** Issue #147 CP4: "C" armed the place-camera gesture. */
  let placeCameraArmed = false;
  /** In-flight place-camera aim (screen px a→b), null when not dragging. */
  let placeDrag: { from: Pt; to: Pt } | null = null;
  /**
   * Issue #147 CP4: last pose floorIdx the editor FOLLOWED (edge trigger
   * for the cross-storey floor switch — see the subscribePose block).
   */
  let lastPoseFloorIdx: number | null = null;
  /**
   * Issue #147 CP4: screen-px travel before a place click is read as an
   * aim (the drag sets the walker's heading; a bare click keeps the
   * current one). Mirrors the opening/stair thresholds.
   */
  const PLACE_DRAG_MIN_PX = 8;

  // pkg 13.4 (issue #118): staircase draft + the "no floor above" offer.
  // The draft rides the phase machine (drawingStair); the offer element +
  // its FROZEN draft live here (the drawDims precedent — a canvas-overlay
  // widget whose lifetime is the interaction).
  let stairOffer: HTMLElement | null = null;
  let stairOfferDraft: { anchor: Pt; cursor: Pt; roomId: string } | null = null;
  // Issue #60: single "Dimensions" toggle — gates wall length labels AND
  // room-area badges (one overlay, one switch).
  let dimensionsVisible = true;
  // Issue #68: snap settings (pitch + master). Editor preference, not
  // plan data — hydrated from localStorage and persisted on change.
  const snapStorage = safeLocalStorage();
  let snapSettings: SnapSettings = loadSnapSettings(snapStorage);

  /** Apply + persist a settings mutation, then repaint the grid. */
  function updateSnapSettings(next: SnapSettings): void {
    snapSettings = next;
    saveSnapSettings(snapStorage, snapSettings);
    repaint();
  }
  // Issue #66 (Pkg 1): measure-tool annotations. Editor-local state kept
  // OUT of the phase machine (Pkg 2 churns phase wiring) and OUT of
  // FloorplanData/autosave — persisted under a separate localStorage key
  // (see model/measure.ts header for the rationale).
  let measurements: Measurement[] = [];
  try {
    measurements = loadMeasurements(window.localStorage);
  } catch {
    measurements = []; // no-storage stub environments
  }
  let measureDraft: { a: Pt } | null = null;
  // Pkg 12.3 (issue #101): UI-LOCAL wall-segment selection. Walls are
  // NOT entities — a segment is addressed {roomId, segmentIndex} and
  // lives here only (no store state, no schema churn). Populated by the
  // hover-segment path (door/window tools) and by proximity clicks on a
  // selected room; cleared whenever the selection moves elsewhere.
  let selectedSegment: SegmentAddress | null = null;
  // The inspector panel (pure renderer — mounted below, rendered on
  // every store notify + segment change).
  let inspector: InspectorPanel | null = null;
  // Issue #100 (Pkg 12.2): the FLOATING type-in dim fields shown while
  // drawingPoly has ≥1 committed point. Mounted lazily inside the
  // canvas wrap (position:absolute, bottom-right); torn down when the
  // gesture ends. NULL whenever the widget is off-screen.
  let drawDims: DimFields | null = null;
  function drawDimsMount(): HTMLElement {
    return canvas.parentElement as HTMLElement;
  }
  /**
   * Issue #144 fix-round: keep the first-run layers (empty-state card,
   * Plans button) AFTER every canvas overlay in the wrap. ui.ts mounts
   * them before this lazily-mounted widget, and an overlay button sitting
   * between the canvas and the fields would steal the Tab stop the
   * pointer+keyboard flow depends on (remountDrawDims: "the widget is one
   * Tab away"). appendChild MOVES the existing nodes, so the card's
   * pointer-events scheme (style.css) is untouched — this is pure DOM
   * order: Tab sequencing + paint order.
   */
  function keepFirstRunLayersLast(): void {
    const wrap = drawDimsMount();
    wrap.appendChild(refs.emptyStateMount);
    wrap.appendChild(refs.planMenuMount);
  }

  /* ---------- pkg 12.1 (issue #99): blueprint underlay ---------- */

  /**
   * The underlay is EDITOR state (snap-settings lane — see
   * model/underlay.ts): a per-floor map persisted under its OWN
   * versioned key casaplaza.underlay.v1 with debounced writes
   * (AUTOSAVE_KEY's slot carries raw FloorplanData and must stay
   * untainted). Loaded on boot; floor SWITCHES need no special code —
   * repaint derives the active floor's slot through underlayFor().
   */
  const underlayStorage = safeLocalStorage();
  store.hydrateUnderlays(loadUnderlayMap(underlayStorage));

  let underlayTimer: ReturnType<typeof setTimeout> | null = null;
  let underlayPersistWarned = false;
  function scheduleUnderlayPersist(): void {
    if (underlayTimer !== null) clearTimeout(underlayTimer);
    underlayTimer = setTimeout(() => {
      underlayTimer = null;
      const ok = saveUnderlayMap(underlayStorage, store.getState().underlays);
      // Reviewer #99 should-fix: a failed persist (quota/privacy) used to
      // be silent — the user's scan vanished on reload with no clue.
      // Warn ONCE per session; beforeunload stays silent (no UI timing).
      if (!ok && !underlayPersistWarned) {
        underlayPersistWarned = true;
        flashMessage(
          refs,
          'Underlay not saved — storage quota exceeded. It will be lost on reload.',
        );
      }
    }, UNDERLAY_DEBOUNCE_MS);
  }
  window.addEventListener('beforeunload', () => {
    if (underlayTimer !== null) {
      clearTimeout(underlayTimer);
      underlayTimer = null;
    }
    saveUnderlayMap(underlayStorage, store.getState().underlays);
  });

  /** Decode cache: dataUrl → HTMLImageElement (recreated on swap). */
  let underlayImg: HTMLImageElement | null = null;
  function loadImage(dataUrl: string): HTMLImageElement {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => repaint();
    return img;
  }

  let underlaySelected = false;
  /**
   * In-flight corner resize. The BASE rect is captured at pointerdown:
   * every streamed frame recomputes from the ORIGINAL rect (computing
   * from the evolving state would let a momentary axis-cross collapse
   * the image to the minimum and then REGROW from the corrupted basis
   * on the next frame).
   */
  let resizingUnderlay: { corner: number; base: UnderlayState } | null = null;

  function activeFloorId(): string {
    const st = store.getState();
    const fl = st.data.floors[
      Math.min(Math.max(st.activeFloorIdx, 0), st.data.floors.length - 1)
    ];
    return fl?.id ?? '';
  }

  /** Active floor's underlay, or null (clamped access). */
  function activeUnderlay(): UnderlayState | null {
    return underlayFor(store.getState());
  }

  /** Mutate the ACTIVE floor's slot (or delete with null), then persist. */
  function setUnderlay(next: UnderlayState | null): void {
    const res = store.dispatch({
      type: 'setUnderlaySlot',
      floorId: activeFloorId(),
      state: next,
    });
    if (res.ok) {
      if (next === null) underlaySelected = false;
      scheduleUnderlayPersist();
    }
  }

  /** Screen-space corners of the active underlay ([] when none). */
  function underlayScreenCorners(): Pt[] {
    const u = activeUnderlay();
    return u ? underlayCorners(u).map((p) => worldToScreen(cam, p)) : [];
  }

  /* ---------- sizing (devicePixelRatio aware) ---------- */
  function resizeCanvas(): void {
    const wrap = canvas.parentElement!;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    repaint();
  }

  function repaint(): void {
    if (!ctx) return; // stub environment: DOM/state still fully functional
    // pkg 12.1 (issue #99): keep the decode cache pointed at the ACTIVE
    // floor's image — covers boot hydration, floor switches, and
    // imports with one seam (dispatch notifies → repaint → prime).
    const au = activeUnderlay();
    if (au !== null && underlayImg?.src !== au.dataUrl) {
      underlayImg = loadImage(au.dataUrl);
    }
    const rect = canvas.getBoundingClientRect();
    // pkg 7.2 (issue #75): the canvas shows the ACTIVE floor only —
    // paintScene receives the single-floor view, never the whole plan.
    const view = activeFloorPlan(store.getState());
    paintScene(
      ctx, rect.width, rect.height, cam, view, phase, hoverRoomId,
      ghost, hoverSeg, hoverHandle, store.getState().selectedId, snapSettings.pitch,
      // pkg 12.1 (issue #99): active floor's underlay paints beneath the
      // grid (trace-over guarantee); handles only while selected.
      activeUnderlay(),
      underlayImg,
      underlaySelected && underlayInteractable(activeUnderlay()),
      // pkg 13.2 (issue #110): marquee band + multi-member highlight.
      marquee !== null && marquee.engaged ? marquee : null,
      [...multiSelected],
      // Issue #126: canvas theme (light default keeps pre-#126 paints
      // bit-identical; the export painter omits it and stays white).
      theme,
    );
    // Pkg 12.3 (issue #101, fix round): the WALL case paints WHICH
    // segment the inspector is addressing (yellow, same readout path as
    // the hoverSeg highlight) — the near-wall click upgrade is otherwise
    // invisible on canvas. Shown only when the panel can actually be
    // seen (open) so the select-tool idle canvas stays unpolluted.
    if (
      inspector !== null &&
      inspector.isOpen() &&
      selectedSegment &&
      selectedSegment.roomId === store.getState().selectedId
    ) {
      paintSelectedSegmentOverlay(ctx, cam, view, selectedSegment);
    }
    // pkg 6 (issue #7): measurement badges painted on TOP of the scene
    // so they ride pan/zoom and appear in exports.
    paintMeasurementBadges(ctx, cam, view, dimensionsVisible);
    // Issue #66: measure annotations ride the same Dimensions toggle.
    // pkg 7.2 (reviewer #75): live canvas shows only the ACTIVE floor's
    // annotations (legacy untagged ones read as ground); the export
    // painter below keeps whole-plan scope.
    const activeFloorIdx = store.getState().activeFloorIdx;
    paintMeasureAnnotations(
      ctx,
      cam,
      measurements.filter((m) => (m.floorIdx ?? 0) === activeFloorIdx),
      dimensionsVisible,
    );
    // pkg 2 (issue #67): live angle readouts during gestures.
    // Deliberately ABSENT from the export path below — these are
    // gesture-live affordances, not plan content.
    paintAngleReadouts(ctx, cam, view, phase, hoverSeg, dimensionsVisible);

    // Issue #147 CP4: walk-nav overlays — the in-flight place-camera aim
    // band first (it belongs UNDER the glyph), then the mirrored walker.
    // Same purity rule as the angle readouts above: LIVE canvas only,
    // never the export painter / share-link payload.
    if (placeDrag !== null) {
      drawPlaceAim(ctx, placeDrag.from, placeDrag.to);
    }
    if (walkerPose !== null && walkerPose.floorIdx === activeFloorIdx) {
      drawWalkerGlyph(ctx, cam, walkerPose);
    }
  }

  function snapToleranceWorld(): number {
    return SNAP_TOL_PX / cam.scale;
  }

  /**
   * Issue #53: resize-handle grab radius in world units. Decoupled from
   * snapToleranceWorld() so a coarse, zoom-stable click target is used
   * for BOTH handle picking (pointerdown) and hover classification.
   */
  function handleToleranceWorld(): number {
    return HANDLE_HIT_PX / cam.scale;
  }

  /* ------------------ walk-nav: glyph + place camera (#147 CP4) ------------------ */

  /**
   * Coalesced repaint for pose ticks: the viewer can publish every
   * frame, so the editor learns of a pose change immediately but
   * repaints at most once per animation frame (the mini3d requestRender
   * discipline). Timer fallback covers stub/happy-dom environments.
   */
  function requestWalkerGlyphRepaint(): void {
    if (walkerGlyphRaf !== null) return;
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (cb: FrameRequestCallback): number =>
            window.setTimeout(() => cb(0), 16);
    walkerGlyphRaf = schedule(() => {
      walkerGlyphRaf = null;
      repaint();
    });
  }

  /**
   * Arm/disarm the place-camera gesture. Arming needs a live viewer
   * subscriber — the standalone editor has no 3D pane to place a camera
   * into, and a silently-dead "C" would be a lie; answer honestly.
   */
  function setPlaceCameraArmed(armed: boolean): void {
    if (armed && !hasViewerSubscriber()) {
      flashMessage(refs, "Place camera needs the 3D pane \u2014 open /viewer.");
      return;
    }
    placeCameraArmed = armed;
    placeDrag = null;
    ghost = null;
    flashMessage(
      refs,
      armed
        ? "Place camera: click a room to move the walker \u2014 drag to aim, Esc cancels."
        : "Place camera cancelled.",
    );
    repaint();
  }

  /**
   * Commit an armed place-camera gesture. The press point becomes the
   * walker's plan position — required to land inside a room on the
   * ACTIVE floor, because the command carries that floorIdx and a point
   * outside every room would drop the walker into the fences. The drag
   * direction becomes the heading once travel clears
   * PLACE_DRAG_MIN_PX; a bare click keeps the walker's current heading
   * (read off the last published pose). An invalid click stays armed so
   * the user can simply click again.
   */
  function commitPlaceCamera(drag: { from: Pt; to: Pt }): void {
    const world = screenToWorld(cam, drag.from);
    const st = store.getState();
    const room = flatRooms(activeFloorPlan(st)).find((r) =>
      pointInPolygonGeom(world, r.polygon),
    );
    if (!room) {
      flashMessage(
        refs,
        "Place camera: click inside a room (Esc cancels).",
      );
      repaint();
      return;
    }
    const travelPx = Math.hypot(
      drag.to[0] - drag.from[0],
      drag.to[1] - drag.from[1],
    );
    let yaw = getPose()?.yawRad ?? 0;
    if (travelPx >= PLACE_DRAG_MIN_PX) {
      const end = screenToWorld(cam, drag.to);
      yaw = Math.atan2(end[1] - world[1], end[0] - world[0]);
    }
    sendCommand({
      kind: "place",
      x: world[0],
      y: world[1],
      yaw,
      floorIdx: st.activeFloorIdx,
    });
    placeCameraArmed = false;
    flashMessage(refs, `Camera placed in ${room.name}.`);
    repaint();
  }

  /**
   * Full snap policy (issue #68): magnetize to foreign room geometry
   * first; fall back to the pitch grid from snap settings when nothing
   * attracts within tolerance. Master OFF disables both.
   */
  function snapPoint(worldPt: Pt, excludeIds: string[] = []): Pt {
    // pkg 7.2: snapping sees the ACTIVE floor's geometry only.
    const geo = evaluateSnapCandidates(
      activeFloorPlan(store.getState()),
      worldPt,
      snapToleranceWorld(),
      excludeIds,
    );
    return resolveSnap(worldPt, geo.snapped ? geo.point : null, snapSettings);
  }

  /* ---------- pointer helpers ---------- */
  function evPos(ev: PointerEvent | MouseEvent): Pt {
    const rect = canvas.getBoundingClientRect();
    return [ev.clientX - rect.left, ev.clientY - rect.top];
  }

  function evWorld(ev: PointerEvent | MouseEvent): Pt {
    return screenToWorld(cam, evPos(ev));
  }

  function refreshStatus(): void {
    const st = store.getState();
    // pkg 7.2: counts + total describe the ACTIVE floor (the storey
    // being edited); the floor indicator badge carries the floor name.
    const view = activeFloorPlan(st);
    // pkg #142 (Toolbar IA): the `rooms: n · tool: x · undo ↺` debug
    // string is retired. Left zone = the contextual tool hint (moved
    // from the tooltip), middle zone = live cursor (pointermove
    // listener below), right zone = the area total (format unchanged).
    const hint = toolHint(tool) || GLOBAL_TOOL_HINT;
    refs.status.textContent = hint;
    refs.status.title = hint;
    refs.statusTotal.textContent = formatTotal(totalLivableAreaM2(view));
  }

  function refreshBadgeAndButtons(): void {
    // pkg 7.2: overlap warnings are per-storey — rooms on different
    // floors legitimately stack atop each other in plan coordinates.
    const overlaps = computeOverlaps(activeFloorPlan(store.getState()));
    refs.badge.hidden = overlaps.length === 0;
    const st = store.getState();
    refs.btnDelete.disabled = st.selectedId === null;
    refs.btnUndo.disabled = !store.canUndo();
    refs.btnRedo.disabled = !store.canRedo();
  }

  /** pkg 7.2 (issue #75): sync the floor-indicator badge + nav buttons. */
  function refreshFloorIndicator(): void {
    const st = store.getState();
    const floor =
      st.data.floors[Math.min(st.activeFloorIdx, st.data.floors.length - 1)];
    refs.floorBadge.textContent = `${floor.name} · Level ${st.activeFloorIdx + 1}`;
    refs.btnPrevFloor.disabled = st.activeFloorIdx <= 0;
    refs.btnNextFloor.disabled = st.activeFloorIdx >= st.data.floors.length - 1;
    // Deleting the sole floor is refused by the reducer; reflect that.
    refs.btnDeleteFloor.disabled = st.data.floors.length <= 1;
  }

  /* ---------- pkg 12.3 (issue #101): inspector panel ---------- */

  /**
   * Resolve the CURRENT selection into a kind-tagged descriptor.
   * selectedId is a bare string (store.ts:117) — the KIND comes from
   * scanning the active floor's flats (mirrors the undo reconciliation
   * scan in store.ts). A selected ROOM upgrades to the WALL case when
   * a UI-local segment address is live (walls are not entities).
   */
  function resolveSelection(): SelectionDescriptor {
    // pkg 13.2 (issue #110): an armed MULTI set outranks the single
    // selection — the panel shows the aggregate counts instead.
    if (multiSelected.size > 1) {
      const view = activeFloorPlan(store.getState());
      const counts: Record<string, number> = {};
      let total = 0;
      for (const id of multiSelected) {
        const kind = flatRooms(view).some((r) => r.id === id)
          ? 'rooms'
          : flatOpenings(view).some((o) => o.id === id)
            ? 'openings'
            : flatFurniture(view).some((f) => f.id === id)
              ? 'furniture'
              : activeFloorStairs(view).some((s) => s.id === id)
                ? 'stairs'
                : null;
        if (kind === null) continue; // raced a delete; purge reaps it
        counts[kind] = (counts[kind] ?? 0) + 1;
        total += 1;
      }
      if (total > 1) return { kind: 'multi', counts };
    }
    const st = store.getState();
    const sel = st.selectedId;
    // pkg #145 (issue #145): the no-selection descriptor carries the active
    // Floor — the panel's Plan/Floor settings sections render under it.
    const activeFl = st.data.floors[st.activeFloorIdx];
    if (sel === null) return { kind: "none", floor: activeFl };
    const view = activeFloorPlan(st);
    const room = flatRooms(view).find((r) => r.id === sel);
    if (room) {
      if (
        selectedSegment &&
        selectedSegment.roomId === room.id &&
        selectedSegment.segIndex >= 0 &&
        selectedSegment.segIndex < room.polygon.length
      ) {
        return { kind: "wall", room, segIndex: selectedSegment.segIndex };
      }
      return { kind: "room", room };
    }
    const opening = flatOpenings(view).find((o) => o.id === sel);
    if (opening) {
      const host = flatRooms(view).find((r) => r.id === opening.roomId);
      // Host room always exists (deleteRoom cascades openings), but a
      // defensive bail beats constructing a fake Room.
      if (!host) return { kind: "none", floor: activeFl };
      return { kind: "opening", opening, room: host };
    }
    const item = flatFurniture(view).find((f) => f.id === sel);
    if (item) return { kind: "furniture", item };
    // pkg 13.4 (issue #118): plan-level stairs — resolved only while the
    // flight departs the ACTIVE floor (its host room is visible here).
    const stair = activeFloorStairs(view).find((s) => s.id === sel);
    if (stair) return { kind: "stair", stair };
    return { kind: "none", floor: activeFl };
  }

  /** Re-render the inspector IF it is open (cheap no-op collapsed). */
  function refreshInspector(): void {
    if (inspector === null || !inspector.isOpen()) return;
    inspector.render(resolveSelection(), store.getState().data);
  }

  /** Assign the UI-local segment address + re-render the panel. */
  function setSelectedSegment(addr: SegmentAddress | null): void {
    if (sameSegmentAddress(selectedSegment, addr)) return;
    selectedSegment = addr;
    refreshInspector();
    // Repaint so the canvas segment overlay (affordance for the WALL
    // case) tracks the panel's address.
    repaint();
  }

  /* ------- pkg 13.2 (issue #110): marquee multi-select helpers ------- */

  /**
   * Sweep the marquee band (SCREEN px) through the camera into a world
   * rect and collect the member ids it covers on the ACTIVE floor:
   * furniture by SAT-exact oriented-quad ∩ band (issue #117 — the #110
   * AABB looseness is retired), rooms by bbox-overlap OR
   * any-vertex-in-rect (rooms stay loose by design).
   */
  function marqueeMembers(start: Pt, cur: Pt): Set<string> {
    const rect = bandRect(screenToWorld(cam, start), screenToWorld(cam, cur));
    const view = activeFloorPlan(store.getState());
    const ids = new Set<string>();
    for (const f of flatFurniture(view)) {
      if (furnitureInBand(f, rect)) ids.add(f.id);
    }
    for (const r of flatRooms(view)) {
      if (roomInBand(r, rect)) ids.add(r.id);
    }
    // pkg 13.4 (issue #118): stairs join the sweep — rect-simple
    // membership (stairInBand), restricted to flights departing the
    // ACTIVE floor (the ones on screen).
    for (const s of activeFloorStairs(view)) {
      if (stairInBand(s, rect)) ids.add(s.id);
    }
    return ids;
  }

  /**
   * Reap multi-set members the plan no longer has (bulk delete, undo,
   * floor switch raced the glue-local set). Runs on every store notify,
   * BEFORE the inspector re-renders, so the panel never counts ghosts.
   */
  function purgeStaleMulti(): void {
    if (multiSelected.size === 0) return;
    const view = activeFloorPlan(store.getState());
    const alive = (id: string): boolean =>
      flatRooms(view).some((r) => r.id === id) ||
      flatOpenings(view).some((o) => o.id === id) ||
      flatFurniture(view).some((f) => f.id === id) ||
      activeFloorStairs(view).some((s) => s.id === id);
    let changed = false;
    for (const id of [...multiSelected]) {
      if (!alive(id)) {
        multiSelected.delete(id);
        changed = true;
      }
    }
    if (changed) refreshInspector();
  }

  /** Toggle one id's multi-set membership (shift-click, issue #110). */
  function toggleMultiMember(id: string): void {
    if (multiSelected.has(id)) multiSelected.delete(id);
    else multiSelected.add(id);
    refreshInspector();
    repaint();
  }

  store.subscribe((_s) => {
    if (_s === undefined) return;
    // Issue #139: any store notify invalidates the stair-ghost memo —
    // reducers mutate `data` IN PLACE, so identity checks cannot detect
    // revisions. Cleared here, wholesale, on every notify.
    stairGhostCache = null;
    // Ratified decision (a) on issue #75: the autosave slot carries RAW
    // v2 data (hydration migrates-at-the-door, so both shapes load).
    // Renaming the KEY would orphan every existing save — key stays.
    // toLegacyWire remains ONLY for the __casaplaza bridge (wire.ts).
    if (store.dirty) autosave.scheduleSave(_s.data);
    // Issue #110: reap multi-set members a command removed before the
    // inspector re-renders (bulk delete, undo, floor switch).
    purgeStaleMulti();
    refreshBadgeAndButtons();
    refreshFloorIndicator();
    refreshStatus();
    refreshInspector();
    repaint();
    // Issue #144: one cheap predicate call per notify drives the card.
    refreshEmptyState();
    // Pkg 13.1 (#109): live plan → mini-3D inset. Cheap reference hop;
    // the inset debounces (150 ms) + skips unchanged signatures + gates
    // on in-flight draw gestures INTERNALLY (mini3d.ts).
    mini3d?.notifyPlanChanged(_s.data);
  });

  /* ---------- Pkg 13.1 (issue #109): mini-3D inset ---------- */

  /*
   * The inset mounts as a flex SIBLING of the inspector panel inside
   * inspectorDock (the #101 mount precedent two lines below — the dock
   * is .editor-main-area, a flex row, so the 2D canvas auto-narrows
   * with ZERO sizing math). Deps load via DYNAMIC import on FIRST
   * enable: three.js + the viewer pipeline stay OUT of the editor's
   * initial chunk (layering law: editor→viewer is the legal direction).
   */
  let mini3d: Mini3DInset | null = null;
  let mini3dLoading = false;
  let mini3dPendingOpen = false;

  async function ensureMini3d(): Promise<Mini3DInset | null> {
    if (mini3d !== null) return mini3d;
    if (mini3dLoading) return null;
    mini3dLoading = true;
    try {
      // Dynamic import on FIRST toggle only: three.js + the viewer
      // pipeline stay OUT of the editor's initial chunk (SUB_PLAN §3).
      // Both bindings come from the dynamic import — glue holds only a
      // TYPE import statically, so rolldown can actually split it.
      const { Mini3DInset: Ctor, loadViewerDeps } = await import(
        './mini3d'
      );
      const deps = await loadViewerDeps();
      mini3d = new Ctor(refs.inspectorDock, deps, {
        gestureGate: drawGestureInProgress,
      });
      return mini3d;
    } catch {
      return null; // chunk load failure behaves like a GL-less stub
    } finally {
      mini3dLoading = false;
    }
  }

  async function setMini3dOpen(open: boolean): Promise<void> {
    if (open) {
      mini3dPendingOpen = true;
      const inset = await ensureMini3d();
      if (inset === null || !mini3dPendingOpen) return; // collapsed while loading
      inset.notifyPlanChanged(store.getState().data, { immediate: true });
      inset.setOpen(true);
      refs.btnMini3d.setAttribute('aria-pressed', 'true');
    } else {
      mini3dPendingOpen = false;
      refs.btnMini3d.setAttribute('aria-pressed', 'false');
      mini3d?.setOpen(false);
    }
  }

  refs.btnMini3d.addEventListener("click", () => {
    void setMini3dOpen(mini3d === null || !mini3d.isOpen());
  });

  /**
   * Pkg 12.3 (issue #101): mount + toggle the inspector panel. The panel
   * is a PURE RENDERER (inspectorPanel.ts) fed by resolveSelection(); it
   * commits through the SAME store commands the popovers use — no new
   * commands, no forked validation (errors surface via flashMessage).
   */
  /**
   * Pkg 155 (issue #155): error flashes announce ASSERTIVELY (screen
   * readers interrupt) while routine notices keep the default polite
   * channel. Every error call site funnels through this adapter — the
   * inspector's flash callback is error-only.
   */
  function flashError(text: string): void {
    flashMessage(refs, text, undefined, 'assertive');
  }

  inspector = mountInspectorPanel(
    (cmd) => store.dispatch(cmd as Parameters<typeof store.dispatch>[0]),
    (msg) => flashError(msg),
  );
  refs.inspectorDock.appendChild(inspector.root);

  function setInspectorOpen(open: boolean): void {
    inspector!.setOpen(open);
    refs.btnInspector.setAttribute('aria-pressed', String(open));
    // Repaint: the canvas segment overlay draws only while the panel is
    // open (visibility tied to the affordance it explains).
    repaint();
    if (open) {
      refreshInspector();
      // Heading into the panel body puts focus INSIDE the dock — the
      // precondition for the panel-scoped Esc handler below.
      inspector!.root.setAttribute("tabindex", "-1");
      inspector!.root.focus();
    }
  }

  refs.btnInspector.addEventListener("click", () => {
    setInspectorOpen(!inspector!.isOpen());
  });

  // Pkg 12.3 (issue #101): Esc / I act on the panel ONLY while focus
  // sits INSIDE it (capture phase + containment gate) — canvas-focused
  // strokes pass straight through to the canvas handler, so the panel
  // never eats the drawing-Esc path. In-flight gestures always win the
  // key (same drawGestureInProgress guard as the popovers). Letter keys
  // typed into the panel's own INPUTS are ignored (typing ≠ toggling).
  document.addEventListener(
    "keydown",
    (ev) => {
      if (!inspector!.isOpen()) return;
      if (!inspector!.root.contains(document.activeElement)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const target = ev.target as HTMLElement;
      const typingIntoField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (ev.key === "Escape") {
        if (drawGestureInProgress()) return;
        // Issue #117: a pending measure anchor outranks the panel close
        // — the first Escape drops the draft (panel stays open, focus
        // unmoved), the second closes the panel. Same precedence the
        // canvas strand already honors.
        if (measureDraft !== null) {
          measureDraft = null;
          repaint();
          ev.stopPropagation();
          return;
        }
        ev.stopPropagation();
        setInspectorOpen(false);
        refs.btnInspector.focus();
      } else if ((ev.key === "i" || ev.key === "I") && !typingIntoField) {
        if (drawGestureInProgress()) return;
        ev.stopPropagation();
        setInspectorOpen(false);
        refs.btnInspector.focus();
      }
    },
    true,
  );

  /* ---------- toolbar ---------- */
  function setActiveTool(next: AnyToolMode): void {
    tool = next;
    spacePanOwnsTool = false; // #168: an explicit pick ends any Space claim
    dragOpening = null; // #61: switching tools abandons any opening candidate
    measureDraft = null; // #66: switching tools abandons a pending anchor
    // Issue #100: tool switch also abandons a live poly draw (and its
    // floating dim fields) — same lifetime rule as Esc.
    destroyDrawDims();
    // pkg 13.4 (issue #118): a tool switch also abandons a staircase draft
    // and closes any open "add floor" offer (same lifetime rule).
    abandonStairDraft();
    if (next === "select") {
      phase = { tag: "idle" };
    } else {
      store.dispatch({ type: "setEntitySelection", entityId: null });
      phase = { tag: "idle" };
    }

    // Furniture palette rides shotgun with the stamp tool.
    refs.palette.hidden = tool !== "stamp";

    // Issue #126: the Pan tool (Space-hold funnels through here too)
    // owns the grab cursor on the canvas.
    canvas.classList.toggle("pan-armed", tool === "pan");
    for (const [btn, val] of [
      [refs.btnSelect, "select"],
      [refs.btnRect, "rectangle"],
      [refs.btnPoly, "polygon"],
      [refs.btnDoor, "door"],
      [refs.btnWindow, "window"],
      [refs.btnStamp, "stamp"],
      [refs.btnStairs, "stairs"],
      [refs.btnAddMeasure, "measure"],
      [refs.btnPan, "pan"],
    ] as Array<[HTMLButtonElement, AnyToolMode]>) {
      btn.classList.toggle("active", val === tool);
      btn.setAttribute("aria-pressed", String(val === tool));
    }
    refreshStatus();
    repaint();
    // Arm-context change: a drawing tool dismisses the card (AC).
    refreshEmptyState();
  }

  refs.btnSelect.addEventListener("click", () => setActiveTool("select"));
  // Issue #60: "Dimensions" toggle — flips aria-pressed, repaints.
  refs.btnDimensions.addEventListener("click", () => {
    dimensionsVisible = !dimensionsVisible;
    refs.btnDimensions.setAttribute("aria-pressed", String(dimensionsVisible));
    refs.btnDimensions.classList.toggle("active", dimensionsVisible);
    repaint();
  });

  /* ---------- Issue #68: snap settings popover ---------- */

  /** Sync popover controls from the current settings. */
  const syncSnapControls = (): void => {
    refs.snapPopover
      .querySelectorAll<HTMLInputElement>('input[name="snap-pitch"]')
      .forEach((r) => {
        r.checked = parsePitch(Number(r.value)) === snapSettings.pitch;
      });
    const masterCb = refs.snapPopover.querySelector<HTMLInputElement>(
      '[data-testid="snap-master"]',
    );
    if (masterCb) masterCb.checked = snapSettings.master;
  };

  /** Focus trap + invoker for the open Snap popover (pkg 155). */
  let snapTrap: FocusTrap | null = null;
  const setSnapPopoverOpen = (open: boolean): void => {
    refs.snapPopover.hidden = !open;
    refs.btnSnap.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      // Pkg 155: Snap used to focus NOTHING on open — land on the first
      // control (the pitch radios) so the popover is keyboard-usable.
      // FIX ROUND (tester finding 1): NOT while a draw gesture is in
      // flight. "S" opens this popover mid-draw; a focus move here puts
      // the canvas Escape handler out of reach, so the #94 guard below
      // never sees a cancelled draft and the rect COMMITS on release.
      // The popover still opens; focus-on-open resumes for idle opens.
      snapTrap = trapFocus(refs.snapPopover, refs.btnSnap, {
        focusInitial: !drawGestureInProgress(),
      });
    } else {
      // EVERY close path (button, outside pointerdown, Escape) funnels
      // through here, so the invoker restore is unconditional.
      snapTrap?.release();
      snapTrap = null;
    }
  };

  refs.btnSnap.addEventListener("click", () => {
    // hidden===true means the popover is closed, i.e. we are OPENING it.
    const opening = refs.snapPopover.hidden === true;
    if (opening) syncSnapControls();
    setSnapPopoverOpen(opening);
  });

  refs.snapPopover.addEventListener("change", (ev) => {
    const target = ev.target as HTMLInputElement;
    if (target.name === "snap-pitch") {
      const pitch = parsePitch(Number(target.value));
      if (pitch !== null) updateSnapSettings({ ...snapSettings, pitch });
    } else if (target.dataset.testid === "snap-master") {
      updateSnapSettings({ ...snapSettings, master: target.checked });
    }
  });

  // Outside click closes the popover (dumb listeners; pkg 155 SUPERSEDES
  // the old "no focus trap" note — the trap lives on the popover ELEMENT
  // and these paths just funnel into the setter that releases it).
  document.addEventListener("pointerdown", (ev) => {
    if (refs.snapPopover.hidden) return;
    if (refs.snapPopover.contains(ev.target as Node)) return;
    if (refs.btnSnap.contains(ev.target as Node)) return;
    setSnapPopoverOpen(false);
  });
  // Escape closes it too (capture phase so canvas key handling is moot).
  // Issue #94: but NEVER while a draw gesture is mid-flight — swallowing
  // Escape there would starve the canvas draw-cancel path (below), the
  // exact bug this guard exists for. The popover may stay open; the
  // gesture always wins the key.
  const drawGestureInProgress = (): boolean => phase.tag !== "idle";
  document.addEventListener(
    "keydown",
    (ev) => {
      if (
        !refs.snapPopover.hidden &&
        ev.key === "Escape" &&
        !drawGestureInProgress()
      ) {
        ev.stopPropagation();
        setSnapPopoverOpen(false);
        // FIX ROUND (tester finding 1): a keyboard dismissal hands focus
        // back to the invoker. release() only restores while focus sat
        // INSIDE the popover — never true for a popover opened mid-draw,
        // where focus deliberately stayed on the canvas.
        refs.btnSnap.focus();
      }
    },
    true,
  );
  /* ---------- pkg #142: File menu popover ---------- */

  // Snapshot of the #68 snapPopover pattern: visibility-toggled div,
  // pointerdown-outside + capture-phase Escape dismissal. The items were
  // wired long before this block (Import → hidden input, Share/Export/
  // Save JSON) and keep their listeners — this only governs open/close.
  const setFileMenuOpen = (open: boolean): void => {
    refs.fileMenu.hidden = !open;
    refs.btnFile.setAttribute("aria-expanded", open ? "true" : "false");
  };

  refs.btnFile.addEventListener("click", () => {
    setFileMenuOpen(refs.fileMenu.hidden === true);
  });

  document.addEventListener("pointerdown", (ev) => {
    if (refs.fileMenu.hidden) return;
    const t = ev.target as Node;
    if (refs.fileMenu.contains(t) || refs.btnFile.contains(t)) return;
    setFileMenuOpen(false);
  });

  document.addEventListener(
    "keydown",
    (ev) => {
      if (
        !refs.fileMenu.hidden &&
        ev.key === "Escape" &&
        !drawGestureInProgress()
      ) {
        ev.stopPropagation();
        setFileMenuOpen(false);
      }
    },
    true,
  );

  // Choosing an item acts immediately, so the menu closes behind it —
  // Export is the exception: its dialog anchors to the item's rect, so
  // the menu stays open until the dialog resolves (its backdrop covers
  // the open menu; Escape closes both).
  for (const item of [refs.btnImport, refs.btnExportJson, refs.btnShare]) {
    item.addEventListener("click", () => setFileMenuOpen(false));
  }

  refs.btnRect.addEventListener("click", () => setActiveTool("rectangle"));

  /* ---------- pkg 12.1 (issue #99): underlay UI ---------- */

  /** Seed popover controls from the ACTIVE floor's underlay. */
  function syncUnderlayControls(): void {
    const u = activeUnderlay();
    refs.underlayOpacity.value = String(u?.opacity ?? UNDERLAY_DEFAULT_OPACITY);
    refs.underlayOpacityValue.textContent = `${refs.underlayOpacity.value}%`;
    refs.underlayLock.checked = u?.locked ?? false;
    refs.underlayHide.checked = u?.hidden ?? false;
  }

  /** Focus trap + invoker for the open Underlay popover (pkg 155). */
  let underlayTrap: FocusTrap | null = null;
  const setUnderlayPopoverOpen = (open: boolean): void => {
    refs.underlayPopover.hidden = !open;
    refs.btnUnderlay.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      syncUnderlayControls();
      // FIX ROUND (tester finding 1): same mid-gesture focus-steal guard
      // as Snap — the popover opens, the draw gesture keeps the keyboard.
      if (!drawGestureInProgress()) refs.underlayOpacity.focus();
      // Pkg 155: trap Tab + remember the invoker. focusInitial=false
      // keeps the existing slider-first focus above authoritative.
      underlayTrap = trapFocus(refs.underlayPopover, refs.btnUnderlay, {
        focusInitial: false,
      });
    } else {
      underlayTrap?.release();
      underlayTrap = null;
    }
  };

  refs.btnUnderlay.addEventListener('click', () => {
    const u = activeUnderlay();
    if (u === null) {
      // No image yet: the button IS the import affordance (picker
      // opens; choosing a file places + selects the underlay).
      refs.underlayFileInput.value = '';
      refs.underlayFileInput.click();
      return;
    }
    setUnderlayPopoverOpen(refs.underlayPopover.hidden === true);
  });

  refs.underlayFileInput.addEventListener('change', () => {
    const file = refs.underlayFileInput.files?.[0];
    if (!file) return;
    void (async () => {
      let dataUrl: string;
      try {
        dataUrl = await readFileAsDataUrl(file);
      } catch {
        flashError('Could not read the selected image.');
        return;
      }
      // Reject non-images defensively (the accept filter is advisory).
      if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(dataUrl)) {
        flashError('Unsupported image type — use PNG, JPG, or WebP.');
        return;
      }
      const aspect = await imageSize(dataUrl);
      // Fit the larger side to UNDERLAY_FIT_M preserving aspect ratio;
      // degenerate (zero-dimension) decodes are refused.
      if (aspect.w === 0 || aspect.h === 0) {
        flashError('That image could not be decoded.');
        return;
      }
      const k = UNDERLAY_FIT_M / Math.max(aspect.w, aspect.h);
      // Land mid-viewport, not at world (0,0) — the neutral camera puts
      // the origin at the canvas' top-left corner, so a (0,0)-centered
      // image would arrive half off-screen.
      const rect = canvas.getBoundingClientRect();
      const center = screenToWorld(cam, [rect.width / 2, rect.height / 2]);
      setUnderlay({
        dataUrl,
        cx: center[0],
        cy: center[1],
        w: aspect.w * k,
        h: aspect.h * k,
        rotDeg: 0,
        opacity: UNDERLAY_DEFAULT_OPACITY,
        locked: false,
        hidden: false,
      });
      underlaySelected = true;
      flashMessage(refs, `Underlay imported — arrow keys nudge, corners resize.`);
      repaint();
    })();
  });

  // Opacity slider: live readout, committed on change (pointer release).
  refs.underlayOpacity.addEventListener('input', () => {
    refs.underlayOpacityValue.textContent = `${refs.underlayOpacity.value}%`;
  });
  refs.underlayOpacity.addEventListener('change', () => {
    const u = activeUnderlay();
    if (!u) return;
    setUnderlay({ ...u, opacity: Number(refs.underlayOpacity.value) });
  });

  refs.btnUnderlayRotateCCW.addEventListener('click', () => {
    const u = activeUnderlay();
    if (!u) return;
    setUnderlay(rotateUnderlayBy(u, -UNDERLAY_ROTATE_STEP_DEG));
  });
  refs.btnUnderlayRotateCW.addEventListener('click', () => {
    const u = activeUnderlay();
    if (!u) return;
    setUnderlay(rotateUnderlayBy(u, UNDERLAY_ROTATE_STEP_DEG));
  });

  refs.underlayLock.addEventListener('change', () => {
    const u = activeUnderlay();
    if (!u) return;
    // Locking deselects: locked ⇒ no handles, no nudge (pass-through
    // is then trivially guaranteed — nothing intercepts).
    if (refs.underlayLock.checked) underlaySelected = false;
    setUnderlay({ ...u, locked: refs.underlayLock.checked });
    repaint();
  });

  refs.underlayHide.addEventListener('change', () => {
    const u = activeUnderlay();
    if (!u) return;
    if (refs.underlayHide.checked) underlaySelected = false;
    setUnderlay({ ...u, hidden: refs.underlayHide.checked });
    repaint();
  });

  refs.btnUnderlayRemove.addEventListener('click', () => {
    if (activeUnderlay() === null) return;
    setUnderlay(null);
    setUnderlayPopoverOpen(false);
    flashMessage(refs, 'Underlay removed.');
  });

  // Outside click closes the popover (first-popover discipline).
  document.addEventListener('pointerdown', (ev) => {
    if (refs.underlayPopover.hidden) return;
    if (refs.underlayPopover.contains(ev.target as Node)) return;
    if (refs.btnUnderlay.contains(ev.target as Node)) return;
    setUnderlayPopoverOpen(false);
  });
  // Escape closes it too (capture phase), except mid-gesture (#94).
  document.addEventListener('keydown', (ev) => {
    if (
      !refs.underlayPopover.hidden &&
      ev.key === 'Escape' &&
      !drawGestureInProgress()
    ) {
      ev.stopPropagation();
      // Issue #117 (ratified amendment): a pending measure anchor dies
      // FIRST — the popover stays open for a second Escape.
      if (measureDraft !== null) {
        measureDraft = null;
        repaint();
        return;
      }
      setUnderlayPopoverOpen(false);
    }
  }, true);


  /* ---------- pkg 7.2 (issue #75): floor selector ---------- */

  /**
   * Mouseless floor navigation (trackpad-only constraint): Prev/Next
   * buttons + a name/level indicator badge in the toolbar; rename and
   * delete live in a popover (role=dialog) reachable from the badge —
   * same first-popover discipline as the #68 snap popover. Every
   * control is a real button/input: the whole flow is Tab-reachable.
   */
  function switchFloor(delta: number): void {
    const st = store.getState();
    const next = st.activeFloorIdx + delta;
    if (next < 0 || next >= st.data.floors.length) return;
    store.dispatch({ type: 'setActiveFloor', index: next });
    // Reviewer #99 nit: the underlay selection is floor-independent —
    // leaving it armed across a switch pointed invisible arrow-nudges
    // at the NEW floor's underlay. Deselect on every switch.
    underlaySelected = false;
  }

  /** Focus trap + invoker for the open Floor popover (pkg 155). */
  let floorTrap: FocusTrap | null = null;
  const setFloorPopoverOpen = (open: boolean): void => {
    refs.floorPopover.hidden = !open;
    refs.floorBadge.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      // Seed the rename field with the active floor's current name.
      const name =
        store.getState().data.floors[store.getState().activeFloorIdx]?.name ??
        "";
      refs.floorRenameInput.value = name;
      // FIX ROUND (tester finding 1): same mid-gesture focus-steal guard
      // as Snap (focus AND selection together — the field is not focused
      // mid-gesture, so a lone selection would be invisible state).
      if (!drawGestureInProgress()) {
        refs.floorRenameInput.focus();
        refs.floorRenameInput.select();
      }
      // Pkg 155: trap Tab; focusInitial=false keeps the rename field's
      // focus AND selection (typing straight away) authoritative.
      floorTrap = trapFocus(refs.floorPopover, refs.floorBadge, {
        focusInitial: false,
      });
    } else {
      floorTrap?.release();
      floorTrap = null;
    }
  };

  refs.btnPrevFloor.addEventListener("click", () => switchFloor(-1));
  refs.btnNextFloor.addEventListener("click", () => switchFloor(1));
  refs.btnAddFloor.addEventListener("click", () => {
    const res = store.dispatch({ type: "addFloor" });
    if (!res.ok) flashError(res.error);
  });

  // The badge doubles as the popover toggle (aria-expanded + popup).
  refs.floorBadge.addEventListener("click", () => {
    setFloorPopoverOpen(refs.floorPopover.hidden === true);
  });

  refs.floorRenameForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const res = store.dispatch({
      type: "renameFloor",
      name: refs.floorRenameInput.value,
    });
    if (!res.ok) {
      flashError(res.error);
      return;
    }
    setFloorPopoverOpen(false);
  });

  refs.btnDeleteFloor.addEventListener("click", () => {
    const res = store.dispatch({ type: "deleteFloor" });
    if (!res.ok) flashError(res.error);
    else setFloorPopoverOpen(false);
  });

  // Outside click closes the popover (dumb listeners, no focus trap).
  document.addEventListener("pointerdown", (ev) => {
    if (refs.floorPopover.hidden) return;
    if (refs.floorPopover.contains(ev.target as Node)) return;
    if (refs.floorBadge.contains(ev.target as Node)) return;
    setFloorPopoverOpen(false);
  });
  // Escape closes it too (capture phase so canvas key handling is moot),
  // except mid-gesture (Issue #94 — see drawGestureInProgress above).
  document.addEventListener(
    "keydown",
    (ev) => {
      if (
        !refs.floorPopover.hidden &&
        ev.key === "Escape" &&
        !drawGestureInProgress()
      ) {
        ev.stopPropagation();
        // Issue #117 (ratified amendment): a pending measure anchor dies
        // FIRST — the popover stays open for a second Escape.
        if (measureDraft !== null) {
          measureDraft = null;
          repaint();
          return;
        }
        setFloorPopoverOpen(false);
      }
    },
    true,
  );

  /* ---------- pkg 8.1 (issue #83): wall-lean popover ---------- */

  /**
   * Populate the lean popover for a room: one radio per wall segment
   * (labels "Wall 1..n"), preselecting the FIRST leaned segment (else
   * segment 0) and syncing the slider to that segment's stored lean.
   * Radios are rebuilt per open — rooms gain/lose segments constantly.
   */
  function populateLeanPopover(room: Room): void {
    refs.leanSegFieldset.replaceChildren(
      refs.leanSegFieldset.querySelector("legend")!,
    );
    const rows = room.roofs ?? [];
    let anyChecked = false;
    for (let i = 0; i < room.polygon.length; i += 1) {
      const label = document.createElement("label");
      label.className = "snap-radio";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "lean-seg";
      radio.value = String(i);
      radio.dataset.testid = `lean-seg-${i}`;
      const row = rows.find((r) => r.segmentIndex === i);
      if (row) {
        radio.checked = true;
        anyChecked = true;
      }
      label.append(radio, document.createTextNode(` Wall ${i + 1}`));
      refs.leanSegFieldset.appendChild(label);
    }
    // Nothing leaned yet: preselect Wall 1 so keyboard flow starts sane.
    if (!anyChecked) {
      refs.leanSegFieldset
        .querySelector<HTMLInputElement>('input[name="lean-seg"]')
        ?.setAttribute("checked", "checked");
    }
    // Checked segment drives the slider seed (stored lean, else 0).
    syncLeanSlider();
  }

  /** Slider ← checked radio segment's stored lean (0 when none). */
  function syncLeanSlider(): void {
    const st = store.getState();
    const room =
      st.selectedId !== null
        ? flatRooms(activeFloorPlan(st)).find((r) => r.id === st.selectedId)
        : undefined;
    const checked = refs.leanSegFieldset.querySelector<HTMLInputElement>(
      'input[name="lean-seg"]:checked',
    );
    const si = checked ? Number(checked.value) : 0;
    const row = room?.roofs?.find((r) => r.segmentIndex === si);
    refs.leanSlider.value = String(row?.leanDeg ?? 0);
    refs.leanValue.textContent = `${refs.leanSlider.value}\u00B0`;
  }

  /** Focus trap + invoker for the open Lean popover (pkg 155). */
  let leanTrap: FocusTrap | null = null;
  const setLeanPopoverOpen = (open: boolean): void => {
    refs.leanPopover.hidden = !open;
    if (open) {
      // Pkg 155: no toolbar button opens this popover (the L shortcut
      // does), so the invoker is whatever held focus a moment ago — the
      // canvas in practice. Captured BEFORE the radio focus below.
      const previous = document.activeElement;
      const invoker =
        previous instanceof HTMLElement && previous !== document.body
          ? previous
          : refs.canvas;
      const firstRadio = refs.leanSegFieldset.querySelector<HTMLInputElement>(
        'input[name="lean-seg"]',
      );
      // FIX ROUND (tester finding 1): same mid-gesture focus-steal guard
      // as Snap — the draw gesture keeps the keyboard.
      if (!drawGestureInProgress()) firstRadio?.focus();
      // focusInitial=false keeps the first-radio focus above.
      leanTrap = trapFocus(refs.leanPopover, invoker, { focusInitial: false });
    } else {
      leanTrap?.release();
      leanTrap = null;
    }
  };

  /** Checked radio's segment index, or null when the room has no walls. */
  function checkedLeanSeg(): number | null {
    const checked = refs.leanSegFieldset.querySelector<HTMLInputElement>(
      'input[name="lean-seg"]:checked',
    );
    if (!checked) return null;
    const si = Number(checked.value);
    return Number.isInteger(si) ? si : null;
  }

  refs.leanSegFieldset.addEventListener("change", () => {
    syncLeanSlider();
  });

  // Live degree readout while the slider moves (committed on Apply).
  refs.leanSlider.addEventListener("input", () => {
    refs.leanValue.textContent = `${refs.leanSlider.value}\u00B0`;
  });

  refs.leanForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const st = store.getState();
    const roomId = st.selectedId;
    if (roomId === null) return;
    const si = checkedLeanSeg();
    if (si === null) return;
    const leanDeg = Math.round(Number(refs.leanSlider.value));
    // Lean 0 strips the row (reduceSetWallLean treats it as clear too,
    // but routing through clearWallLean exercises the explicit path).
    const res =
      leanDeg === 0
        ? store.dispatch({ type: "clearWallLean", roomId, segmentIndex: si })
        : store.dispatch({
            type: "setWallLean",
            roomId,
            segmentIndex: si,
            leanDeg,
          });
    if (!res.ok) {
      flashError(res.error);
      return;
    }
    setLeanPopoverOpen(false);
  });

  refs.btnClearLean.addEventListener("click", () => {
    const st = store.getState();
    const roomId = st.selectedId;
    if (roomId === null) return;
    const si = checkedLeanSeg();
    if (si === null) return;
    const res = store.dispatch({
      type: "clearWallLean",
      roomId,
      segmentIndex: si,
    });
    if (!res.ok) {
      flashError(res.error);
      return;
    }
    setLeanPopoverOpen(false);
  });

  // Outside click closes the popover (dumb listeners, no focus trap).
  document.addEventListener("pointerdown", (ev) => {
    if (refs.leanPopover.hidden) return;
    if (refs.leanPopover.contains(ev.target as Node)) return;
    setLeanPopoverOpen(false);
  });
  // Escape closes it too (capture phase so canvas key handling is moot),
  // except mid-gesture (Issue #94 — see drawGestureInProgress above).
  document.addEventListener(
    "keydown",
    (ev) => {
      if (
        !refs.leanPopover.hidden &&
        ev.key === "Escape" &&
        !drawGestureInProgress()
      ) {
        ev.stopPropagation();
        // Issue #117 (ratified amendment): a pending measure anchor dies
        // FIRST — the popover stays open for a second Escape.
        if (measureDraft !== null) {
          measureDraft = null;
          repaint();
          return;
        }
        setLeanPopoverOpen(false);
      }
    },
    true,
  );

  refs.btnPoly.addEventListener("click", () => setActiveTool("polygon"));
  refs.btnDoor.addEventListener("click", () => setActiveTool("door"));
  refs.btnWindow.addEventListener("click", () => setActiveTool("window"));
  refs.btnStamp.addEventListener("click", () => setActiveTool("stamp"));
  refs.btnStairs.addEventListener("click", () => setActiveTool("stairs"));
  refs.btnAddMeasure.addEventListener("click", () => setActiveTool("measure"));

  /* ---------- issue #143: single-key tool hotkeys ---------- */

  /**
   * The 8 tool hotkeys live in ONE document-level handler (NOT the
   * canvas listener) so they fire from anywhere in the editor while the
   * exact-match map lookup keeps every other key structurally outside
   * the decision path — Space (#126 pan) can never be intercepted
   * because there is no catch-all single-letter branch, ever.
   */
  const TOOL_HOTKEYS: Record<string, AnyToolMode> = {
    v: "select",
    r: "rectangle",
    p: "polygon",
    d: "door",
    w: "window",
    f: "stamp",
    t: "stairs",
    m: "measure",
  };

  document.addEventListener("keydown", (ev) => {
    // Chords stay untouched (undo/redo, browser combos).
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    // Typing wins: the inspector fields, the floor-rename input, and
    // every #155 popover input are excluded here (letter keys are text
    // while a field owns focus — never a tool switch, never a rotate).
    const target = ev.target as HTMLElement | null;
    if (
      target !== null &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }
    // Mid-gesture keys are swallowed, same discipline as I/3: a tool
    // switch now would kill the live draw via setActiveTool's cleanup.
    // Review round 2 (#143): drawGestureInProgress() reads `phase`, so it
    // is BLIND to the phase-less pointer-owned interactions the canvas
    // Escape strand recognizes — marquee band, underlay resize, opening
    // drag (same three branches below). The opening drag is the corrosive
    // one: pointerdown arms `dragOpening` while `phase` stays "idle" and
    // the store gesture only opens once the pointer clears the threshold
    // (handleOpeningDrag). Retooling mid-drag reached setActiveTool,
    // which nulls dragOpening WITHOUT endGesture(): the leaked
    // _gestureBase made the next atomic command throw ("non-streamable
    // command inside gesture") and poisoned undo (silently for V, which
    // dispatches nothing).
    if (
      drawGestureInProgress() ||
      dragOpening !== null ||
      marquee !== null ||
      resizingUnderlay !== null
    ) {
      return;
    }
    // Never retool behind an open dialog sheet. The "?" cheat sheet owns
    // the keyboard, and so does the export popover — its capture handler
    // stops only Escape, so D used to arm Door and R used to rotate the
    // selected furniture INVISIBLY behind it (a following export could
    // capture the unseen rotation).
    if (isHelpModalOpen() || isExportDialogOpen()) return;
    const next = TOOL_HOTKEYS[ev.key.toLowerCase()];
    if (next === undefined) return; // exact match only (Space is not here)
    if (next === "rectangle") {
      // R is dual-purpose: it rotates the selected furniture piece (the
      // former canvas-local R strand, folded in here so R can never
      // double-fire — canvas keydown bubbles up to this listener), and
      // arms Rectangle when nothing rotatable is selected.
      const sel = store.getState().selectedId;
      const item =
        sel === null
          ? undefined
          : flatFurniture(activeFloorPlan(store.getState())).find(
              (f) => f.id === sel,
            );
      if (item) {
        ev.preventDefault();
        store.dispatch({
          type: "rotateFurniture",
          furnitureId: item.id,
          rotationDeg: nextRotation(item.rotationDeg),
        });
        return;
      }
    }
    ev.preventDefault();
    setActiveTool(next);
  });

  // Issue #126: the Pan tool button (Space-hold arms it without a click).
  refs.btnPan.addEventListener("click", () => setActiveTool("pan"));
  // Issue #66: wipe all annotations (persists immediately).
  // Issue #138: the pending anchor dies WITH them — a stale draft
  // otherwise ate one Escape press under the guarded popovers
  // (user-visible as "popover ignored Esc once").
  refs.btnClearMeasure.addEventListener("click", () => {
    measurements = [];
    measureDraft = null;
    saveMeasurements(window.localStorage, measurements);
    repaint();
  });

  for (const chip of Array.from(
    refs.palette.querySelectorAll<HTMLButtonElement>(".palette-chip"),
  )) {
    chip.addEventListener("click", () => {
      const t = chip.dataset.stampType;
      if (t && FURNITURE_DEFAULTS[t]) {
        stampType = t;
        for (const c of Array.from(
          refs.palette.querySelectorAll<HTMLButtonElement>(".palette-chip"),
        )) {
          c.classList.toggle("active", c === chip);
        }
      }
    });
  }

  refs.btnUndo.addEventListener("click", () => {
    store.undo();
  });
  refs.btnRedo.addEventListener("click", () => {
    store.redo();
  });

  /* ---------- pkg 6 (issue #7): export + help ---------- */

  /**
   * Offscreen re-render for export: draws the plan with the LIVE camera
   * settings into a scratch 2D context at the requested pixel density.
   * Badges included (white-bg composite handled by renderOffscreen).
   */
  function exportPainterFactory(scale: ExportScale) {
    return (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
      const scaledCam: Camera = { ...cam, scale: cam.scale * scale };
      // pkg 7.2 scope ruling (SUB_PLAN): image export is a WHOLE-PLAN
      // writer — unlike the live canvas, it keeps full-plan scope.
      paintScene(
        ctx,
        w,
        h,
        scaledCam,
        store.getState().data,
        { tag: "idle" },
        null,
      );
      paintMeasurementBadges(
        ctx,
        scaledCam,
        store.getState().data,
        dimensionsVisible,
      );
      paintMeasureAnnotations(ctx, scaledCam, measurements, dimensionsVisible);
    };
  }

  async function runExportFlow(): Promise<void> {
    const choice = await openExportDialog(refs.btnExport);
    if (!choice) return;
    const rect = refs.canvas.getBoundingClientRect();
    try {
      const result = await renderOffscreen(
        exportPainterFactory(choice.scale),
        rect.width,
        rect.height,
        choice,
      );
      downloadExport(result);
      flashMessage(
        refs,
        `Exported ${result.filename} (${result.width}\u00D7${result.height}).`,
      );
    } catch (err) {
      flashMessage(refs, `Export failed: ${(err as Error).message}`);
    }
  }
  refs.btnExport.addEventListener("click", () => {
    void runExportFlow();
  });

  /* ---------- pkg 10.1 (issue #91): share link + JSON transfer ---------- */

  /**
   * Copy text with a graceful degradation ladder: async Clipboard API
   * first, then the legacy textarea/select/execCommand path (deprecated
   * but the accepted fallback for non-secure/insecure contexts).
   * Returns false when BOTH rungs fail — callers flash, never throw.
   */
  async function copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* fall through to the legacy rung */
      }
    }
    const ta = document.createElement("textarea");
    try {
      ta.value = text;
      // Position off-screen but NOT display:none — detached/hidden
      // editors are excluded from some browsers' copy paths.
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      // Reviewer #91 should-fix: ALWAYS detach — a thrown select()/
      // execCommand previously leaked the (invisible, focusable,
      // plan-carrying) textarea into the DOM.
      ta.remove();
    }
  }

  refs.btnShare.addEventListener("click", () => {
    void (async () => {
      // Feature-detect AT THE BUTTON (codec stays native-only by
      // design): browsers lacking CompressionStream get a clear
      // message instead of a half-encoded link.
      if (typeof CompressionStream === "undefined") {
        flashMessage(refs, "Sharing is unavailable in this browser.");
        return;
      }
      let out: Awaited<ReturnType<typeof encodeShare>>;
      try {
        out = await encodeShare(store.getState().data);
      } catch (err) {
        flashMessage(refs, (err as Error).message);
        return;
      }
      // Fragments never hit servers: the plan rides in location.hash.
      // Links target the VIEWER route — the recipient gets the 3D
      // rendering (which is the decode/boot consumer of #plan=), not
      // the sender's editor page.
      const url = `${location.origin}/viewer#plan=${out.fragment}`;
      const copied = await copyToClipboard(url);
      if (!copied) {
        flashMessage(refs, "Could not copy — clipboard unavailable.");
        return;
      }
      if (out.warning) {
        flashMessage(
          refs,
          `Link copied (${out.warning.length.toLocaleString()} chars — some chats may truncate it).`,
          5000,
        );
      } else {
        flashMessage(refs, "Share link copied to clipboard.");
      }
    })();
  });

  refs.btnExportJson.addEventListener("click", () => {
    // Symmetric counterpart to Import: pretty-printed JSON of the live
    // store, downloaded through the same Blob dance as export.ts.
    const blob = new Blob([JSON.stringify(store.getState().data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `floorplan-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    flashMessage(refs, "Plan exported as JSON.");
  });

  const importFileInputEl = refs.importFileInput;
  refs.btnImport.addEventListener("click", () => {
    importFileInputEl.value = ""; // re-picking the same file must re-fire change
    importFileInputEl.click();
  });

  importFileInputEl.addEventListener("change", () => {
    const file = importFileInputEl.files?.[0];
    if (!file) return;
    void (async () => {
      let text: string;
      try {
        text = await file.text();
      } catch {
        flashError("Could not read the selected file.");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        flashError("Not a valid JSON file.");
        return;
      }
      // migrate + validate DIRECTLY (NOT normalizeIncoming — it silently
      // falls back to emptyPlan, which would wipe the user's work on a
      // typo'd import). Failure leaves the store untouched.
      const migrated = migrate(parsed);
      if (!migrated.ok || !migrated.data) {
        flashMessage(refs, "Import failed: unsupported schema version.");
        return;
      }
      const validated = validateFloorplan(migrated.data);
      if (!validated.ok) {
        flashError(`Import failed: ${validated.errors[0].message}`);
        return;
      }
      // Success: the loadPlan sequence from editor/main.ts — swap the
      // plan, then persist synchronously so a reload keeps it.
      store.replaceAll(validated.value);
      autosave.stop();
      autosave.persistSync(validated.value);
      flashMessage(refs, `Imported “${file.name}”.`);
    })();
  });

  refs.btnHelp.addEventListener("click", () => toggleHelpModal());
  initShortcuts();
  window.addEventListener("beforeunload", closeHelpModal, { once: true });

  /**
   * Delete routes by WHAT is selected: furniture stamp → deleteFurniture,
   * opening → deleteOpening (+ its pair), room → deleteRoom.
   */
  function routeDelete(): void {
    // Issue #110: an armed multi-set routes to the ATOMIC bulk command
    // (ONE undo step). Issued OUTSIDE any open gesture — pointerup
    // commits the marquee first; deleteEntities is non-streamable and
    // would throw mid-drag (store gesture guard).
    if (multiSelected.size > 0) {
      const res = store.dispatch({
        type: 'deleteEntities',
        ids: [...multiSelected],
      });
      if (!res.ok) flashError(res.error);
      multiSelected.clear();
      refreshInspector();
      repaint();
      return;
    }
    const sel = store.getState().selectedId;
    if (sel === null) return;
    // pkg 7.2: selection is plan-wide (ids are plan-unique), but only
    // the ACTIVE floor is clickable — route against its view.
    const view = activeFloorPlan(store.getState());
    if (flatFurniture(view).some((f) => f.id === sel)) {
      store.dispatch({ type: "deleteFurniture", furnitureId: sel });
      return;
    }
    if (flatOpenings(view).some((o) => o.id === sel)) {
      store.dispatch({ type: "deleteOpening", openingId: sel, syncPair: true });
      return;
    }
    // pkg 13.4 (issue #118): stairs are plan-level — route BEFORE the
    // room fallback (a stair id never matches a room, but the explicit
    // branch keeps the routing honest).
    if (store.getState().data.stairs.some((s) => s.id === sel)) {
      store.dispatch({ type: "deleteStair", stairId: sel });
      return;
    }
    store.dispatch({ type: "deleteRoom", roomId: sel });
  }
  refs.btnDelete.addEventListener("click", () => routeDelete());

  /* ---------- pkg 2 (issue #46): center + zoom buttons ---------- */

  /** Viewport extent in CSS pixels (canvas is DPR-scaled internally). */
  function viewportSize(): { w: number; h: number } {
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function applyCamera(next: Camera): void {
    cam.originX = next.originX;
    cam.originY = next.originY;
    cam.scale = next.scale;
    repaint();
  }

  /**
   * Issue #126: fit-to-plan framing — shared by the Center button and the
   * "0" shortcut (pkg 7.2: frames the ACTIVE floor; whole-plan writers
   * like export keep full scope).
   */
  function fitToPlan(): void {
    const { w, h } = viewportSize();
    applyCamera(computeFitCamera(activeFloorPlan(store.getState()), w, h));
  }

  refs.btnCenter.addEventListener("click", () => {
    fitToPlan();
  });
  refs.btnZoomIn.addEventListener("click", () => {
    const { w, h } = viewportSize();
    applyCamera(zoomAboutCenter(cam, ZOOM_BUTTON_STEP, w, h));
  });
  refs.btnZoomOut.addEventListener("click", () => {
    const { w, h } = viewportSize();
    applyCamera(zoomAboutCenter(cam, 1 / ZOOM_BUTTON_STEP, w, h));
  });

  /* ---------- Issue #126: dark theme (editor preference) ---------- */

  /**
   * Apply a theme: mirror it onto <html data-theme> (style.css overrides
   * the #54 tokens there), sync the toolbar button, and repaint (the
   * canvas palette is a TS record in render.ts, not CSS).
   */
  function applyTheme(next: ThemePreference): void {
    theme = next;
    document.documentElement.dataset.theme = next;
    refs.btnTheme.setAttribute("aria-pressed", String(next === "dark"));
    refs.btnTheme.classList.toggle("active", next === "dark");
    repaint();
  }

  refs.btnTheme.addEventListener("click", () => {
    const next: ThemePreference = theme === "dark" ? "light" : "dark";
    saveTheme(safeLocalStorage(), next);
    applyTheme(next);
  });

  /* ---------- Issue #126: Space-hold temporary pan ---------- */

  /**
   * Holding Space arms the Pan tool; releasing restores the previous tool
   * (Figma/Photoshop muscle memory). Guards mirror the canvas key strand:
   * ignored while typing, mid-gesture, on auto-repeat, with modifiers, or
   * when a button has focus (native Space activation must keep working).
   */
  const blocksSpacePan = (t: EventTarget | null): boolean => {
    const el = t as HTMLElement | null;
    if (el === null) return false;
    return (
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.tagName === "BUTTON" ||
      el.isContentEditable
    );
  };
  let spacePanArmed = false;
  let toolBeforeSpace: AnyToolMode | null = null;
  const releaseSpacePan = (): void => {
    if (!spacePanArmed) return;
    spacePanArmed = false;
    const restore = toolBeforeSpace;
    toolBeforeSpace = null;
    // Unwind only if Space armed the pan AND the user has not switched
    // tools meanwhile (an explicit pick always wins: it funnels through
    // setActiveTool, which drops the ownership flag — issue #168).
    if (restore === null || !spacePanOwnsTool) return;
    spacePanOwnsTool = false;
    if (phase.tag === "panning") {
      // Issue #168: Space released MID-drag. Without this, the
      // setActiveTool below resets the phase to idle and the pointerup
      // branch that clears .pan-dragging never runs — the drag is
      // stranded (frozen camera + stuck grabbing cursor). Finalize it
      // here instead; the camera keeps its current position.
      canvas.classList.remove("pan-dragging");
      endDrag();
    }
    if (restore !== "pan") setActiveTool(restore);
  };
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== " ") return;
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
    if (blocksSpacePan(ev.target)) return;
    if (drawGestureInProgress()) return;
    ev.preventDefault(); // kill page scroll while panning
    if (spacePanArmed) return;
    spacePanArmed = true;
    toolBeforeSpace = tool;
    if (tool !== "pan") {
      setActiveTool("pan");
      // Claimed AFTER the arm call, because setActiveTool clears it (#168).
      spacePanOwnsTool = true;
    }
  });
  window.addEventListener("keyup", (ev) => {
    if (ev.key !== " ") return;
    releaseSpacePan();
  });
  // Safety net: focus loss while Space is held (alt-tab) must not leave
  // the pan tool wedged.
  window.addEventListener("blur", releaseSpacePan);

  // Read-only debug seam for e2e: main.ts's __casaplaza bridge is out of
  // Pkg 2's grant, so the camera is exposed from glue instead.
  (window as unknown as { __editorCam?: () => Camera }).__editorCam = () => ({
    ...cam,
  });

  // Issue #53 read-only seam: screen-space resize-handle centres of the
  // currently-selected room (empty when nothing is selected). Same
  // precedent as __editorCam — lets e2e assert handle count + aim grabs.
  // Issue #139 read-only seam: full stair-verdict computations (the
  // throttle pin divides by distinct snapped cells visited).
  (window as unknown as { __editorStairVerdicts?: () => number })
    .__editorStairVerdicts = () => stairVerdictComputations;

  (window as unknown as { __editorHandles?: () => Pt[] }).__editorHandles =
    () => {
      const st = store.getState();
      if (st.selectedId === null) return [];
      const room = flatRooms(activeFloorPlan(st)).find(
        (r) => r.id === st.selectedId,
      );
      if (!room) return [];
      return resizeHandlesOf(room).map((p) => worldToScreen(cam, p));
    };

  // Issue #66 read-only seams (same precedent as __editorHandles): the
  // annotation list and the Dimensions flag are canvas-drawn, so e2e
  // observes them through here.
  (
    window as unknown as { __editorMeasurements?: () => Measurement[] }
  ).__editorMeasurements = () => measurements.slice();
  (
    window as unknown as { __editorDimsVisible?: () => boolean }
  ).__editorDimsVisible = () => dimensionsVisible;
  // Issue #117 read-only seam (same precedent): the pending measure
  // anchor (null when none, copied out) — canvas-drawn state, so e2e
  // pins the Escape precedence (anchor first, panel/popover second).
  (
    window as unknown as { __editorMeasureDraft?: () => { a: Pt } | null }
  ).__editorMeasureDraft = () =>
    measureDraft === null ? null : { a: [measureDraft.a[0], measureDraft.a[1]] };

  // Issue #100 (Pkg 12.2) read-only seam (same precedent): the live
  // angle-pill TEXTS for the current gesture — canvas-drawn, so e2e
  // asserts pill==typed-value consistency through here.
  (window as unknown as { __editorAnglePills?: () => string[] })
    .__editorAnglePills = () =>
    angleReadoutLabels(
      activeFloorPlan(store.getState()),
      phase,
      hoverSeg,
    ).map((r) => r.text);

  // pkg 8.1 (issue #83) read-only seam (same precedent): the v1 wire
  // bridge DROPS the roofs field, so e2e asserts the active floor's
  // leans through here instead.
  (
    window as unknown as {
      __editorLeans?: () => Array<{
        roomId: string;
        segmentIndex: number;
        leanDeg: number;
      }>;
    }
  ).__editorLeans = () =>
    flatRooms(activeFloorPlan(store.getState())).flatMap((room) =>
      (room.roofs ?? []).map((row) => ({
        roomId: room.id,
        segmentIndex: row.segmentIndex,
        leanDeg: row.leanDeg,
      })),
    );

  // Issue #147 CP4: mirror the viewer's walker pose — the editor's half
  // of the walk-nav link, and the substrate for both the glyph and the
  // place-camera commit (which reads the last pose for "keep heading").
  //
  // The active floor FOLLOWS the walker across storeys (a go-to-room
  // teleport upstairs must bring that storey into view or the walker
  // appears to vanish) — but EDGE-triggered on the pose's floorIdx, not
  // on every tick: a viewer publishing per frame must not pin the
  // editor's floor and make manual browsing impossible.
  subscribePose((pose) => {
    walkerPose = pose;
    if (pose === null) {
      lastPoseFloorIdx = null;
    } else {
      const floorCount = store.getState().data.floors.length;
      const clamped = Math.min(
        Math.max(pose.floorIdx, 0),
        Math.max(floorCount - 1, 0),
      );
      if (clamped !== lastPoseFloorIdx) {
        lastPoseFloorIdx = clamped;
        if (clamped !== store.getState().activeFloorIdx) {
          store.dispatch({ type: "setActiveFloor", index: clamped });
        }
      }
    }
    requestWalkerGlyphRepaint();
  });

  // Issue #147 CP4 read-only seam (the __editorCam precedent): the
  // mirrored glyph state + place-camera arming — canvas-drawn and
  // partially off-DOM, so e2e asserts through here.
  (
    window as unknown as {
      __walkerGlyph?: () => {
        visible: boolean;
        armed: boolean;
        hasViewer: boolean;
        pose: WalkerPose | null;
        screenX: number | null;
        screenY: number | null;
      };
    }
  ).__walkerGlyph = () => {
    const st = store.getState();
    const visible =
      walkerPose !== null && walkerPose.floorIdx === st.activeFloorIdx;
    const screen =
      walkerPose === null
        ? null
        : worldToScreen(cam, [walkerPose.x, walkerPose.y]);
    return {
      visible,
      armed: placeCameraArmed,
      hasViewer: hasViewerSubscriber(),
      pose: walkerPose === null ? null : { ...walkerPose },
      screenX: screen === null ? null : screen[0],
      screenY: screen === null ? null : screen[1],
    };
  };

  // pkg 12.1 (issue #99) read-only seams (same __editorHandles
  // precedent): e2e aims corner grabs through the screen-space handle
  // centers and asserts the active floor's underlay state.
  (window as unknown as { __editorUnderlayHandles?: () => Pt[] })
    .__editorUnderlayHandles = () =>
      // Gated exactly like the paint condition (selected + interactable)
      // so e2e only aims at handles that are really on screen.
      underlaySelected && underlayInteractable(activeUnderlay())
        ? underlayScreenCorners()
        : [];
  (window as unknown as { __editorUnderlay?: () => UnderlayState | null })
    .__editorUnderlay = () => {
      const u = activeUnderlay();
      // Strip the bulky dataUrl from the observable view (assertions
      // target transform/flags; presence travels via dataUrl !== '').
      return u === null
        ? null
        : { ...u, dataUrl: u.dataUrl.startsWith('data:') ? 'data:' : '' };
    };
  /* ---------- pkg 3 helpers (issue #4) ---------- */

  /** Top-most furniture whose rotated rect contains the world point. */
  function furnitureItemAt(
    worldPt: Pt,
    plan: FloorplanData,
  ): FurnitureItem | null {
    const items = flatFurniture(plan);
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const corners = itemCorners(items[i]);
      if (pointInPolygonGeom(worldPt, corners)) return items[i];
    }
    return null;
  }

  function pointInPolygonGeom(pt: Pt, poly: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      const intersects =
        yi > pt[1] !== yj > pt[1] &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  /** Recompute the door/window ghost + wall highlight for a hover point. */
  function updateOpeningHover(worldPt: Pt): void {
    ghost = null;
    hoverSeg = null;
    if (tool !== "door" && tool !== "window") return;
    const kind = tool;
    // pkg 7.2: ghosts pair against the ACTIVE floor's walls only.
    const plan = activeFloorPlan(store.getState());
    let bestRoomId: string | null = null;
    let bestSeg: ReturnType<typeof nearestSegment> = null;
    let bestDist = Infinity;
    for (const room of flatRooms(plan)) {
      const seg = nearestSegment(room, worldPt);
      if (!seg) continue;
      const a = seg.a;
      const b = seg.b;
      const proj = projectOntoSegment(worldPt, {
        index: seg.index,
        a,
        b,
        length: seg.length,
      });
      const cp = pointAtT(seg, proj);
      const d = Math.hypot(cp[0] - worldPt[0], cp[1] - worldPt[1]);
      if (d < bestDist) {
        bestDist = d;
        bestRoomId = room.id;
        bestSeg = seg;
      }
    }
    if (!bestRoomId || !bestSeg) return;
    const t = projectOntoSegment(worldPt, bestSeg);
    hoverSeg = { roomId: bestRoomId, segIndex: bestSeg.index };
    const defs = OPENING_DEFAULTS[kind];
    const err = validateOpeningDraft(
      plan,
      bestRoomId,
      bestSeg.index,
      kind,
      t,
      defs.width,
      defs.sillHeight,
      defs.headHeight,
    );
    ghost = { kind, seg: bestSeg, t, width: defs.width, valid: err === null };
  }

  /**
   * Commit the currently-hovered opening, bouncing invalid drafts.
   *
   * Single-sided warning (issue #36): the reducer emits a MIRROR row
   * when the host segment pairs with a neighbour's wall. We don't widen
   * the dispatch result shape — instead we diff the opening count
   * across the dispatch: +1 row means the cut pierces only this wall,
   * +2 rows is the silent shared-door success.
   */
  function commitOpening(kind: "door" | "window"): void {
    if (
      !ghost ||
      !ghost.seg ||
      ghost.t === undefined ||
      !ghost.valid ||
      !hoverSeg
    ) {
      return;
    }
    const defs = OPENING_DEFAULTS[kind];
    const err = validateOpeningDraft(
      activeFloorPlan(store.getState()),
      hoverSeg.roomId,
      hoverSeg.segIndex,
      kind,
      ghost.t,
      defs.width,
      defs.sillHeight,
      defs.headHeight,
    );
    if (err !== null) {
      flashError(openingErrorMessage(err, kind));
      return;
    }
    // pkg 7.2: the notice diffs the ACTIVE floor's opening rows.
    const rowsBefore = flatOpenings(activeFloorPlan(store.getState())).length;
    const res = store.dispatch({
      type: "addOpening",
      roomId: hoverSeg.roomId,
      segmentIndex: hoverSeg.segIndex,
      kind,
      tCenter: ghost.t,
      width: defs.width,
      sillHeight: defs.sillHeight,
      headHeight: defs.headHeight,
    });
    if (!res.ok) {
      flashError(res.error);
      return;
    }
    const notice = openingCommitNotice(
      rowsBefore,
      flatOpenings(activeFloorPlan(store.getState())).length,
    );
    if (notice !== null) flashMessage(refs, notice);
  }

  /* ---------- pkg 13.4 (issue #118): staircase tool ---------- */

  // The active-floor stair filter lives in render.ts (single source: the
  // painter and every glue membership site must agree on what "visible
  // stairs" means) — imported above as activeFloorStairs.

  /**
   * Candidate flight for a draft drag. RISE IS DERIVED, NEVER DEFAULTED:
   * the nearest storey above the departure, or — when the plan has none —
   * the elevation the addFloor offer would mint (nextFloorElevation), so
   * the ghost reads green exactly when accepting that offer validates.
   */
  function stairDraftCandidate(draft: {
    anchor: Pt;
    cursor: Pt;
    roomId: string;
  }): Staircase | null {
    const drag = stairFromDrag(draft.anchor, draft.cursor);
    if (drag === null) return null;
    const data = store.getState().data;
    const departure = stairDepartureElevation(data, draft.roomId);
    if (departure === null) return null;
    const arrival = nearestArrivalFloor(data, departure);
    const rise =
      (arrival !== null ? arrival.elevation : nextFloorElevation(data)) -
      departure;
    return {
      id: '__draft-stair',
      roomId: draft.roomId,
      position: drag.position,
      rotationDeg: drag.rotationDeg,
      width: STAIR_DEFAULT_WIDTH_M,
      run: drag.run,
      rise,
      stepCount: deriveStepCount(drag.run),
    };
  }

  /**
   * Placement legality (issue #118): build a candidate plan copy and run
   * the EXISTING validateGeometry() — never a forked rule set. When no
   * storey sits above the departure, a synthetic floor at
   * nextFloorElevation joins the copy so the verdict predicts the
   * accept-offer outcome. Failures carry the validator's own message
   * (StairOutOfBounds / OverlappingStairHoles / … — already actionable)
   * for the inline banner.
   */
  function stairCandidateVerdict(
    stair: Staircase,
  ): { ok: true; noArrival: boolean } | { ok: false; message: string; noArrival: boolean } {
    const data = store.getState().data;
    const departure = stairDepartureElevation(data, stair.roomId);
    const noArrival =
      departure === null || nearestArrivalFloor(data, departure) === null;
    const candidate: FloorplanData = {
      ...data,
      floors: noArrival
        ? [
            ...data.floors,
            {
              id: '__stair-draft-floor',
              name: 'Draft floor',
              elevation: nextFloorElevation(data),
              rooms: [],
              openings: [],
              furniture: [],
            },
          ]
        : data.floors,
      stairs: [...data.stairs, stair],
    };
    // Issue #139: test seam — counts FULL verdict computations (the
    // validateGeometry call below), letting the throttle pin assert
    // at-most-one-per-snapped-cell. Read-only exposure via
    // __editorStairVerdicts (same precedent as __editorHandles).
    stairVerdictComputations += 1;
    try {
      validateGeometry(candidate);
      return { ok: true, noArrival };
    } catch (err) {
      return { ok: false, message: (err as Error).message, noArrival };
    }
  }

  /**
   * Live ghost for the in-flight stair drag: green/red via the verdict.
   *
   * Issue #139 (ghost throttle): this runs on EVERY pointermove and
   * stairCandidateVerdict() costs a full validateGeometry() on a fresh
   * candidate copy — O(plan) at pointer-event frequency. Memoize on the
   * snapped cursor CELL: the verdict depends only on (anchor, cursor,
   * roomId, plan revision), and both inputs are snapped, so a verdict
   * computed for one cell is valid for every pointermove inside it —
   * AT MOST ONE validateGeometry per distinct cell, and consecutive
   * pointermoves inside the same cell cost nothing. The cache is
   * invalidated wholesale when the plan data changes identity (any
   * store mutation replaces the data object) or the draft restarts.
   */
  function updateStairGhost(draft: { anchor: Pt; cursor: Pt; roomId: string }): void {
    const cursorCell = `${draft.cursor[0]},${draft.cursor[1]}`;
    const cached = stairGhostCache;
    if (
      cached !== null &&
      cached.anchor[0] === draft.anchor[0] &&
      cached.anchor[1] === draft.anchor[1] &&
      cached.cursorCell === cursorCell &&
      cached.roomId === draft.roomId
    ) {
      ghost = cached.stair === null ? null : { kind: 'stairs', stair: cached.stair, valid: cached.valid };
      return;
    }
    const stair = stairDraftCandidate(draft);
    const valid = stair === null ? false : stairCandidateVerdict(stair).ok;
    stairGhostCache = {
      anchor: [draft.anchor[0], draft.anchor[1]],
      cursorCell,
      roomId: draft.roomId,
      stair: stair === null ? null : { ...stair },
      valid,
    };
    ghost = stair === null ? null : { kind: 'stairs', stair, valid };
  }

  function destroyStairOffer(): void {
    stairOffer?.remove();
    stairOffer = null;
    stairOfferDraft = null;
  }

  /** Tear down every stair-tool affordance (Esc / tool switch / commit). */
  function abandonStairDraft(): void {
    destroyStairOffer();
    ghost = null;
    phase = { tag: 'idle' };
    repaint();
  }

  /** Dispatch the drafted flight; teardown regardless of outcome. */
  function commitStairDraft(stair: Staircase, notice?: string): void {
    const res = store.dispatch({
      type: 'addStair',
      roomId: stair.roomId,
      position: stair.position,
      rotationDeg: stair.rotationDeg,
      width: stair.width,
      run: stair.run,
      rise: stair.rise,
      stepCount: stair.stepCount,
    });
    if (!res.ok) {
      flashError(res.error);
    } else {
      flashMessage(
        refs,
        notice ??
          `Staircase added — ${stair.stepCount} steps climbing ${stair.rise.toFixed(2)} m.`,
      );
    }
    abandonStairDraft();
  }

  /**
   * "No floor above" inline offer (issue #118): the tool never mints
   * storeys silently — it offers the EXISTING addFloor flow as an inline,
   * Tab-reachable button (mouseless chain: the button autofocuses, Enter
   * accepts, Esc abandons).
   */
  function showStairOffer(draft: { anchor: Pt; cursor: Pt; roomId: string }): void {
    destroyStairOffer();
    stairOfferDraft = draft;
    const el = document.createElement('div');
    el.className = 'stair-offer';
    el.dataset.testid = 'stair-addfloor-offer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Add a floor for the staircase');

    const text = document.createElement('span');
    text.textContent =
      'No floor above yet — add one and the staircase will climb to it.';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'editor-btn';
    accept.dataset.testid = 'btn-stair-addfloor';
    accept.textContent = 'Add floor';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'editor-btn';
    cancel.dataset.testid = 'btn-stair-cancel';
    cancel.textContent = 'Cancel';
    el.append(text, accept, cancel);
    (canvas.parentElement as HTMLElement).appendChild(el);
    stairOffer = el;

    accept.addEventListener('click', () => acceptStairOffer());
    cancel.addEventListener('click', () => {
      abandonStairDraft();
      flashMessage(refs, 'Staircase cancelled — no floor above to climb to.');
    });
    // Mouseless chain: the offer lands focused, Enter accepts.
    accept.focus();
    repaint();
  }

  /**
   * Accept: run the EXISTING addFloor flow, re-derive the flight against
   * the post-add plan (rise = the minted Δ exactly — a hand-defaulted
   * 2.7 m would fail the 1 mm gap match against the 3.0 m storey pitch),
   * commit, then return to the departure floor so the fresh flight is
   * visible AND selected where the user drew it.
   */
  function acceptStairOffer(): void {
    const draft = stairOfferDraft;
    if (draft === null) return;
    if (stairDepartureElevation(store.getState().data, draft.roomId) === null) {
      abandonStairDraft();
      return;
    }
    const added = store.dispatch({ type: 'addFloor' });
    if (!added.ok) {
      flashMessage(refs, added.error);
      abandonStairDraft();
      return;
    }
    const stair = stairDraftCandidate(draft);
    if (stair === null) {
      abandonStairDraft();
      return;
    }
    const verdict = stairCandidateVerdict(stair);
    if (!verdict.ok) {
      flashMessage(refs, verdict.message);
      abandonStairDraft();
      return;
    }
    const hostIdx = store
      .getState()
      .data.floors.findIndex((f) => f.rooms.some((r) => r.id === draft.roomId));
    commitStairDraft(
      stair,
      `Floor added and staircase committed (${stair.stepCount} steps).`,
    );
    if (hostIdx !== -1) {
      store.dispatch({ type: 'setActiveFloor', index: hostIdx });
    }
  }

  /* ---------- pointer interactions ---------- */
  canvas.addEventListener("pointerdown", (ev) => {
    // Issue #126: the dedicated Pan tool pans on plain left-drag exactly
    // like alt/middle-drag (Space-hold arms the same mode temporarily).
    if (ev.button === 1 || ev.altKey || (tool === "pan" && ev.button === 0)) {
      // Middle-button or alt-drag pans.
      const pos = evPos(ev);
      phase = { tag: "panning", startX: pos[0], startY: pos[1] };
      canvas.classList.add("pan-dragging");
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.button !== 0) return;

    // Issue #147 CP4: an armed place-camera press owns the gesture — it
    // never becomes a tool interaction or a deselect.
    if (placeCameraArmed) {
      placeDrag = { from: evPos(ev), to: evPos(ev) };
      canvas.setPointerCapture(ev.pointerId);
      repaint();
      return;
    }

    const worldPt = evWorld(ev);

    // Issue #66 (Pkg 1): the measure tool runs OUTSIDE the phase
    // machine — first click anchors, second click commits, and a click
    // on an existing label REMOVES that annotation. Both points snap via
    // the shared snapPoint() policy.
    if (tool === "measure") {
      const hit = labelHitTest(evPos(ev), measurements, cam);
      if (hit) {
        measurements = measurements.filter((m) => m.id !== hit.id);
        saveMeasurements(window.localStorage, measurements);
        repaint();
        return;
      }
      const snapped = snapPoint(worldPt);
      if (measureDraft === null) {
        measureDraft = { a: snapped };
      } else {
        measurements = [
          ...measurements,
          // Tag with the floor it was drawn on (reviewer #75): the live
          // canvas filters to the active floor; the export painter keeps
          // whole-plan scope.
          {
            id: makeMeasureId(),
            a: measureDraft.a,
            b: snapped,
            floorIdx: store.getState().activeFloorIdx,
          },
        ];
        measureDraft = null;
        saveMeasurements(window.localStorage, measurements);
      }
      repaint();
      return;
    }

    if (tool === "rectangle") {
      // Snap the anchor corner to grid/foreign geometry like any other gesture.
      phase = {
        tag: "drawingRect",
        corner1: snapPoint(worldPt),
        cursor: snapPoint(worldPt),
      };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    if (tool === "door" || tool === "window") {
      // Refresh the ghost at the CLICK point (touch devices skip hover),
      // then commit when the draft validates.
      updateOpeningHover(worldPt);
      if (ghost && ghost.valid && hoverSeg) {
        commitOpening(tool);
        ghost = null;
        hoverSeg = null;
        repaint();
        return;
      }
      if (ghost && !ghost.valid) {
        const code = validateOpeningDraft(
          activeFloorPlan(store.getState()),
          hoverSeg!.roomId,
          hoverSeg!.segIndex,
          tool,
          ghost.t!,
          OPENING_DEFAULTS[tool].width,
          OPENING_DEFAULTS[tool].sillHeight,
          OPENING_DEFAULTS[tool].headHeight,
        );
        flashError(openingErrorMessage(code ?? "UNKNOWN", tool));
      } else {
        flashMessage(refs, `Move closer to a wall to place the ${tool}.`);
      }
      repaint();
      return;
    }

    if (tool === "stamp") {
      const def = FURNITURE_DEFAULTS[stampType];
      if (!def) return;
      // pkg 7.2: stamps land on the ACTIVE floor.
      const view = activeFloorPlan(store.getState());
      const outcome = attemptDrop(view, def.footprint, worldPt);
      if (outcome.verdict === "rejected") {
        flashMessage(
          refs,
          outcome.reason === "NO_ROOM_AT_POINT"
            ? "Click inside a room to place furniture."
            : "That piece does not fit anywhere in this room — placement cancelled.",
        );
        repaint();
        return;
      }
      const host = roomAt(worldPt, view)!;
      const pos = outcome.verdict === "warn" ? outcome.snappedTo : worldPt;
      const res = store.dispatch({
        type: "addFurniture",
        itemType: stampType,
        roomId: host.id,
        position: pos,
        rotationDeg: 0,
        footprint: [def.footprint[0], def.footprint[1]],
      });
      if (!res.ok) {
        flashError(res.error);
      } else if (outcome.verdict === "warn") {
        flashMessage(
          refs,
          "Placed, but adjusted inward to stay inside the room.",
        );
      }
      repaint();
      return;
    }

    if (tool === "stairs") {
      // pkg 13.4 (issue #118): drag a flight. The anchor (downhill edge
      // centre) must start inside a room — its host for the whole draft.
      destroyStairOffer();
      const anchor = snapPoint(worldPt);
      const host = roomAt(anchor, activeFloorPlan(store.getState()));
      if (!host) {
        flashMessage(refs, "Start the staircase inside a room.");
        return;
      }
      phase = { tag: "drawingStair", anchor, cursor: anchor, roomId: host.id };
      canvas.setPointerCapture(ev.pointerId);
      repaint();
      return;
    }

    if (tool === "polygon") {
      const cur = phase.tag === "drawingPoly" ? phase : null;
      if (cur === null) {
        const first = snapPoint(worldPt);
        phase = { tag: "drawingPoly", points: [first], cursor: first };
        // Issue #100: first point committed — arm the floating type-in
        // fields (autofocused, mouseless chain continues from here).
        mountDrawDims();
      } else if (
        dist(cur.points[0], worldPt) * cam.scale <= CLOSE_HIT_RADIUS_PX &&
        cur.points.length >= POLYGON_MIN_POINTS
      ) {
        closePolygon();
        return;
      } else {
        // Snap at COMMIT time so stored geometry matches the snapped preview.
        const pushed = snapPoint(worldPt);
        cur.points.push(pushed);
        cur.cursor = pushed;
        // Issue #100: the NEXT pending segment starts here — reseed the
        // floating fields from the freshly committed geometry.
        remountDrawDims(false);
      }
      repaint();
      return;
    }

    // --- select tool ---
    const st = store.getState();
    // pkg 7.2: hit-testing sees the ACTIVE floor only.
    const view = activeFloorPlan(st);

    // pkg 12.1 (issue #99): underlay corner handles hit-test FIRST, in
    // SCREEN coordinates (handles are screen-sized squares regardless
    // of zoom — same reasoning as the room-resize handles). Intercepts
    // ONLY at the four corners: everything else passes through to
    // normal wall/opening selection (locked/hidden ⇒ no handles here,
    // so the underlay can never swallow a click — trivially true).
    if (tool === 'select' && underlayInteractable(activeUnderlay())) {
      const handleIdx = underlayHandleAt(evPos(ev), underlayScreenCorners());
      if (handleIdx !== null) {
        underlaySelected = true;
        const base = activeUnderlay();
        if (base) resizingUnderlay = { corner: handleIdx, base };
        canvas.setPointerCapture(ev.pointerId);
        return;
      }
    }

    // Furniture takes grab priority over rooms (smaller primitive).
    const grabbed = furnitureItemAt(worldPt, view);
    if (grabbed) {
      // Issue #110: shift-click toggles multi-set membership instead of
      // single-selecting (no modifier handling existed before — verified).
      if (ev.shiftKey) {
        toggleMultiMember(grabbed.id);
        return;
      }
      store.dispatch({ type: "setEntitySelection", entityId: grabbed.id });
      draggingFurnitureId = grabbed.id;
      // Issue #110: a member of an armed multi-set drags the WHOLE set
      // (bulk move rides the existing gesture collapse — one undo step).
      // Issue #139: stairs are EXCLUDED from the bulk-drag set — there
      // is no moveStair yet, so riding them along would silently strand
      // the flight outside its host; leaving them behind without a word
      // was the original dishonesty. Visible hint, once per drag.
      const stairIds = new Set(
        activeFloorStairs(store.getState().data).map((s) => s.id),
      );
      const rideAlong = [...multiSelected].filter((id) => !stairIds.has(id));
      if (rideAlong.length !== multiSelected.size) {
        flashMessage(
          refs,
          "Staircases stay put in a bulk drag — move or redraw them individually.",
        );
      }
      bulkDragIds =
        multiSelected.size > 1 && multiSelected.has(grabbed.id)
          ? rideAlong
          : null;
      store.beginGesture();
      phase = { tag: "draggingFurniture", furnitureId: grabbed.id };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    // pkg 1 (issue #52): an opening under the cursor wins over the room
    // wall it is cut into. pkg 3 (issue #61): select immediately, then
    // stash a drag candidate — the gesture only begins once the pointer
    // clears the click threshold, so a plain click stays a click.
    const openingHit = openingAt(worldPt, view);
    if (openingHit) {
      // Issue #110: shift-click toggles membership; skips single-select.
      if (ev.shiftKey) {
        toggleMultiMember(openingHit.id);
        phase = { tag: "idle" };
        return;
      }
      const hitRoom = flatRooms(view).find((r) => r.id === openingHit.roomId);
      const hitSeg = hitRoom
        ? roomSegments(hitRoom)[openingHit.segmentIndex]
        : undefined;
      store.dispatch({ type: "setEntitySelection", entityId: openingHit.id });
      dragOpening = hitSeg
        ? {
            id: openingHit.id,
            roomId: openingHit.roomId,
            segIndex: openingHit.segmentIndex,
            kind: openingHit.kind,
            width: openingHit.width,
            sillHeight: openingHit.sillHeight,
            headHeight: openingHit.headHeight,
            startT: openingHit.tCenter,
            lastValidT: openingHit.tCenter,
            startXY: evPos(ev),
            engaged: false,
            lastErr: null,
          }
        : null;
      phase = { tag: "idle" };
      return;
    }

    // pkg 13.4 (issue #118): a staircase under the cursor (inside the
    // footprint, stairProgress semantics) selects like other entities;
    // the smaller primitives above win when they overlap.
    const stairHit = activeFloorStairs(view).find(
      (s) => stairProgress(s, worldPt[0], worldPt[1]) !== null,
    );
    if (stairHit) {
      if (ev.shiftKey) {
        toggleMultiMember(stairHit.id);
        phase = { tag: "idle" };
        return;
      }
      store.dispatch({ type: "setEntitySelection", entityId: stairHit.id });
      phase = { tag: "idle" };
      return;
    }

    const clicked = roomAt(worldPt, view);
    if (clicked) {
      // Issue #110: shift-click toggles membership; skips single-select.
      if (ev.shiftKey) {
        toggleMultiMember(clicked.id);
        phase = { tag: "idle" };
        return;
      }
      // Priority: resize handle on ALREADY-selected room > begin drag > plain select.
      if (st.selectedId === clicked.id) {
        const handle = resizeHandleAt(worldPt, clicked, handleToleranceWorld());
        if (handle !== null) {
          store.beginGesture();
          phase = {
            tag: "resizing",
            vertexIndex: handle,
            selectedRoomId: clicked.id,
          };
          canvas.setPointerCapture(ev.pointerId);
          return;
        }
      }
      store.dispatch({ type: "setSelection", roomId: clicked.id });
      // Pkg 12.3 (issue #101): a click NEAR a wall upgrades the room
      // selection to the WALL case in the inspector (UI-local segment
      // address — walls are not entities). Far-from-walls clicks keep
      // the plain room view.
      const nearSeg = nearestSegment(clicked, worldPt);
      setSelectedSegment(
        nearSeg ? { roomId: clicked.id, segIndex: nearSeg.index } : null,
      );
      // Offset from the grabbed POINT to the room's anchor vertex, so the
      // vertex follows the cursor exactly (no teleport on first move).
      const grabOffset = vecSub(clicked.polygon[0], worldPt);
      store.beginGesture();
      phase = { tag: "dragging", grabOffset, selectedRoomId: clicked.id };
      canvas.setPointerCapture(ev.pointerId);
    } else {
      // Issue #110: empty space ARMS the marquee candidate (screen px).
      // Engagement waits for the click threshold in pointermove — a
      // plain click still deselects below (byte-identical #61 lesson),
      // and only a crossed threshold arms the band.
      marquee = { start: evPos(ev), cur: evPos(ev), engaged: false };
      store.dispatch({ type: "setSelection", roomId: null });
      setSelectedSegment(null);
      phase = { tag: "idle" };
    }
  });

  function dist(a: Pt, b: Pt): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  /**
   * Issue #61: advance an in-flight opening drag. Below the click
   * threshold this is a no-op (pointerdown already selected). Past it:
   * begin the gesture once, project the cursor onto the opening's OWN
   * segment, clamp t to the corner margins, validate (self/twin-aware
   * clash), and stream moveOpening{syncPair} for VALID frames only —
   * invalid frames keep the last streamed position and paint a red ghost
   * band under the raw cursor as the invalid feedback.
   */
  function handleOpeningDrag(ev: PointerEvent, worldPt: Pt): void {
    const d = dragOpening;
    if (!d) return;
    // Reviewer should-fix (#61): a stale candidate (pointer released off-canvas
    // before engage, capture only taken at engage) must not arm a button-less
    // drag on the next hover — tear it down instead.
    if ((ev.buttons & 1) === 0) {
      dragOpening = null;
      ghost = null;
      repaint();
      return;
    }
    if (!d.engaged) {
      const s = evPos(ev);
      if (dist(s, d.startXY) < OPENING_DRAG_THRESHOLD_PX) return;
      store.beginGesture();
      canvas.setPointerCapture(ev.pointerId);
      d.engaged = true;
    }
    // pkg 7.2: the dragged opening lives on the ACTIVE floor.
    const plan = activeFloorPlan(store.getState());
    const room = flatRooms(plan).find((r) => r.id === d.roomId);
    const seg = room ? roomSegments(room)[d.segIndex] : undefined;
    if (!seg || seg.length === 0) return;
    const rawT = projectOntoSegment(worldPt, seg);
    const t = clampTForDrag(seg.length, d.width, rawT);
    const fitErr = validateOpeningCandidate({
      kind: d.kind,
      segLen: seg.length,
      tCenter: t,
      width: d.width,
      sillHeight: d.sillHeight,
      headHeight: d.headHeight,
    });
    const err =
      fitErr ??
      (openingDragClash(plan, d.id, t) ? "CLASHES_EXISTING_OPENING" : null);
    d.lastErr = err;
    ghost = {
      kind: d.kind,
      seg,
      t: err === null ? t : rawT,
      width: d.width,
      valid: err === null,
    };
    if (err === null) {
      d.lastValidT = t;
      store.dispatch({
        type: "moveOpening",
        openingId: d.id,
        tCenter: t,
        syncPair: true,
      });
    }
    repaint();
  }

  // pkg #142: status bar middle zone — live cursor position in meters.
  // Cleared on leave so a stale coordinate never sits next to the total.
  canvas.addEventListener("pointerleave", () => {
    refs.statusCoords.textContent = "";
  });

  canvas.addEventListener("pointermove", (ev) => {
    const worldPt = evWorld(ev);
    // pkg #142: the readout rides the EXISTING per-frame pointermove
    // handler — no extra listener, no extra frame cost.
    refs.statusCoords.textContent = `${worldPt[0].toFixed(2)}, ${worldPt[1].toFixed(2)} m`;

    // Issue #147 CP4: an in-flight place-camera aim owns the pointer. A
    // buttonless move (release missed the window pre-capture) disarms.
    if (placeDrag !== null) {
      if ((ev.buttons & 1) === 0) {
        placeDrag = null;
        return;
      }
      placeDrag.to = evPos(ev);
      repaint();
      return;
    }

    // pkg 12.1 (issue #99): an in-flight underlay corner resize owns
    // the pointer (plain capture, no store gesture — the underlay is
    // non-undoable editor state). Frames stream from the CAPTURED base
    // rect, not the evolving state.
    if (resizingUnderlay !== null) {
      setUnderlay(
        resizeUnderlayFromCorner(resizingUnderlay.base, resizingUnderlay.corner, worldPt),
      );
      return;
    }

    // Issue #61: an in-flight opening drag owns the pointer.
    if (dragOpening) {
      handleOpeningDrag(ev, worldPt);
      return;
    }

    // Issue #110: an armed marquee candidate advances once the pointer
    // crosses the engage threshold, then tracks the band every frame.
    if (marquee !== null) {
      // Reviewer #110 should-fix: a marquee candidate that missed its
      // pointerup (released outside the window pre-engage — no capture
      // is held yet) would turn the next hover-move into a buttonless
      // band; disarm instead.
      if ((ev.buttons & 1) === 0) {
        marquee = null;
        return;
      }
      marquee.cur = evPos(ev);
      if (!marquee.engaged) {
        if (dist(marquee.cur, marquee.start) < MARQUEE_ENGAGE_PX) return;
        marquee.engaged = true;
        canvas.setPointerCapture(ev.pointerId);
      }
      repaint();
      return;
    }

    // pkg 3: opening-tool ghost slide + wall highlight (any phase-less move).
    if (tool === "door" || tool === "window") {
      updateOpeningHover(worldPt);
      repaint();
      return;
    }

    if (tool === "stamp") {
      // Live ghost rect under the cursor for the armed stamp type.
      const def = FURNITURE_DEFAULTS[stampType];
      if (def) {
        // pkg 7.2: the ghost judges placement against the ACTIVE floor.
        const outcome = attemptDrop(
          activeFloorPlan(store.getState()),
          def.footprint,
          worldPt,
        );
        ghost = {
          kind: "stamp",
          pos: outcome.verdict === "warn" ? outcome.snappedTo : worldPt,
          footprint: [def.footprint[0], def.footprint[1]],
          rotationDeg: 0,
          valid: outcome.verdict !== "rejected",
        };
      }
      repaint();
      return;
    }

    if (phase.tag === "drawingStair") {
      // pkg 13.4 (issue #118): track the uphill end; the ghost re-derives
      // pose + rise + step count and re-runs the legality verdict.
      const cursor = snapPoint(worldPt);
      phase = { ...phase, cursor };
      updateStairGhost(phase);
      repaint();
      return;
    }

    if (phase.tag === "draggingFurniture") {
      const fid = draggingFurnitureId;
      if (fid) {
        // Issue #110: bulk drag — move every member by the world delta
        // the single-item path resolves for the grabbed piece.
        // Issue #117: followers are re-judged PER ITEM (judgeBulkFollow)
        // so a follower clamps near a wall or parks when rejected,
        // instead of clipping through. Streams moveFurniture ×N inside
        // the one open gesture; the collapse at endGesture() yields ONE
        // undo step (ratified deviation: no dedicated bulk-move command).
        if (bulkDragIds !== null) {
          const plan = activeFloorPlan(store.getState());
          const grabbedItem = flatFurniture(plan).find((f) => f.id === fid);
          if (grabbedItem) {
            const verdict = judgeMoveTarget(plan, fid, worldPt);
            if (verdict.verdict === "rejected") {
              flashMessage(
                refs,
                "Bulk move stopped — the grabbed piece left its room.",
              );
            } else {
              const dx = verdict.resolved[0] - grabbedItem.position[0];
              const dy = verdict.resolved[1] - grabbedItem.position[1];
              if (dx !== 0 || dy !== 0) {
                // Issue #117: per-follower judgment — each member rides
                // the delta only as far as ITS OWN room allows.
                for (const { id, pos } of judgeBulkFollow(
                  plan,
                  bulkDragIds,
                  [dx, dy],
                )) {
                  store.dispatch({
                    type: "moveFurniture",
                    furnitureId: id,
                    position: pos,
                  });
                }
              }
            }
          }
          repaint();
          return;
        }
        const verdict = judgeMoveTarget(
          activeFloorPlan(store.getState()),
          fid,
          worldPt,
        );
        if (verdict.verdict === "rejected") {
          // Snap-back: revert to the item's last committed position.
          const item = flatFurniture(activeFloorPlan(store.getState())).find(
            (f) => f.id === fid,
          );
          if (item) {
            store.dispatch({
              type: "moveFurniture",
              furnitureId: fid,
              position: item.position,
            });
            flashMessage(
              refs,
              "Piece pulled outside the room — snapped back to its last valid spot.",
            );
          }
        } else {
          store.dispatch({
            type: "moveFurniture",
            furnitureId: fid,
            position: verdict.resolved,
          });
          if (verdict.verdict === "warn") {
            flashMessage(
              refs,
              "Moved, but clamped to keep the piece inside the room.",
            );
          }
        }
      }
      repaint();
      return;
    }

    if (phase.tag === "panning") {
      const pos = evPos(ev);
      cam.originX -= (pos[0] - phase.startX) / cam.scale;
      cam.originY += (pos[1] - phase.startY) / cam.scale;
      phase.startX = pos[0];
      phase.startY = pos[1];
      repaint();
      return;
    }

    if (phase.tag === "drawingRect") {
      phase = { ...phase, cursor: snapPoint(worldPt) };
      repaint();
      return;
    }

    if (phase.tag === "drawingPoly") {
      phase = { ...phase, cursor: snapPoint(worldPt) };
      repaint();
      return;
    }

    if (phase.tag === "dragging") {
      const rid = phase.selectedRoomId;
      const room = flatRooms(activeFloorPlan(store.getState())).find(
        (r) => r.id === rid,
      );
      if (!room) return;
      // Cursor's target for the anchor vertex = worldPt + grabOffset
      // (grabOffset = anchor - grabPoint at pickup).
      const desiredAnchor = vecAdd(worldPt, phase.grabOffset);
      const sn = evaluateSnapCandidates(
        activeFloorPlan(store.getState()),
        desiredAnchor,
        snapToleranceWorld(),
        [room.id],
      );
      const delta = vecSub(sn.point, room.polygon[0]);
      store.dispatch({ type: "moveRoom", roomId: room.id, delta });
      repaint();
      return;
    }

    if (phase.tag === "resizing") {
      const vid = phase.vertexIndex;
      const rid = phase.selectedRoomId;
      const room = flatRooms(activeFloorPlan(store.getState())).find(
        (r) => r.id === rid,
      );
      if (!room) return;
      // Issue #53: route the dragged vertex through the SAME snap policy
      // as draw-time (snapPoint = foreign geometry, else 0.5 m grid), so
      // corner drags snap identically to how they were drawn.
      store.dispatch({
        type: "resizeRoom",
        roomId: rid,
        vertexIndex: vid,
        newPos: snapPoint(worldPt, [rid]),
      });
      repaint();
      return;
    }

    // idle: hover highlight + cursor affordance (issue #53).
    const prevHandle = hoverHandle;
    const st = store.getState();
    // pkg 7.2: hover affordances read the ACTIVE floor.
    const view = activeFloorPlan(st);
    const selId = st.selectedId;
    const selRoom =
      selId !== null ? flatRooms(view).find((r) => r.id === selId) : undefined;
    if (tool === "select" && selRoom) {
      const handleIdx = resizeHandleAt(
        worldPt,
        selRoom,
        handleToleranceWorld(),
      );
      if (handleIdx !== null) {
        hoverHandle = handleIdx;
        canvas.style.cursor =
          classifyCorner(selRoom.polygon[handleIdx], selRoom) ?? "default";
      } else if (roomAt(worldPt, view)?.id === selId) {
        hoverHandle = null;
        canvas.style.cursor = "move";
      } else {
        hoverHandle = null;
        canvas.style.cursor = "default";
      }
    } else {
      hoverHandle = null;
      canvas.style.cursor = "";
    }
    const hit = roomAt(worldPt, view);
    const hid = hit?.id ?? null;
    if (hid !== hoverRoomId || prevHandle !== hoverHandle) {
      hoverRoomId = hid;
      repaint();
    }
  });

  function endDrag(): void {
    dragOpening = null;
    resizingUnderlay = null; // pkg 12.1: pointercancel safety net
    marquee = null; // Issue #110: a cancelled pointer disarms the band.
    bulkDragIds = null; // Issue #110: retire any bulk drag remainder.
    store.endGesture();
    phase = { tag: "idle" };
    repaint();
  }

  canvas.addEventListener('pointerup', (ev) => {
    // Issue #147 CP4: release an in-flight place-camera aim → commit it.
    // Checked FIRST: arming claims the press before any other candidate
    // could be created, so nothing else can be in flight.
    if (placeDrag !== null) {
      const drag = placeDrag;
      placeDrag = null;
      commitPlaceCamera(drag);
      return;
    }
    // Issue #110: release an armed marquee. Below the threshold this is
    // the plain empty-space click — pointerdown already deselected, so
    // disarm quietly (today's behavior byte-identical). Engaged: sweep
    // the band, commit the member set, refresh the panel.
    if (marquee !== null) {
      const band = marquee;
      marquee = null;
      if (band.engaged) {
        multiSelected = marqueeMembers(band.start, band.cur);
      } else {
        // Plain empty-space click: today's deselect, extended — an
        // armed multi-set dissolves too (clicking blank canvas is the
        // conventional dismissal; Escape is the keyboard equivalent).
        multiSelected.clear();
        refreshInspector();
      }
      repaint();
      return;
    }
    // pkg 12.1 (issue #99): release an in-flight underlay corner
    // resize (capture released implicitly with the pointer).
    if (resizingUnderlay !== null) {
      resizingUnderlay = null;
      return;
    }
    // Issue #61: release an in-flight opening drag. Never streamed an
    // invalid frame, so state already sits at lastValidT; flash the
    // banner when the release frame was invalid.
    if (dragOpening) {
      const d = dragOpening;
      dragOpening = null;
      if (d.engaged) {
        if (d.lastErr !== null) {
          flashError(openingErrorMessage(d.lastErr, d.kind));
        }
        store.endGesture();
        ghost = null;
        repaint();
      }
      phase = { tag: "idle" };
      return;
    }
    if (phase.tag === "drawingStair" && ev.button === 0) {
      // pkg 13.4 (issue #118): release commits the draft. A click-sized
      // travel abandons quietly; invalid geometry flashes the validator's
      // own message; a valid flight with no storey above raises the
      // addFloor offer instead of minting one silently.
      const draft = phase;
      if (dist(draft.cursor, draft.anchor) * cam.scale < STAIR_MIN_DRAG_PX) {
        abandonStairDraft();
        return;
      }
      const stair = stairDraftCandidate(draft);
      if (stair === null) {
        abandonStairDraft();
        return;
      }
      const verdict = stairCandidateVerdict(stair);
      if (!verdict.ok) {
        flashMessage(refs, verdict.message);
        abandonStairDraft();
        return;
      }
      if (verdict.noArrival) {
        phase = { tag: "idle" };
        ghost = null;
        showStairOffer(draft);
        return;
      }
      commitStairDraft(stair);
      return;
    }
    if (phase.tag === "drawingRect" && ev.button === 0) {
      const worldPt = snapPoint(evWorld(ev));
      const minSide = Math.abs(worldPt[0] - phase.corner1[0]) * cam.scale;
      const minSideY = Math.abs(worldPt[1] - phase.corner1[1]) * cam.scale;
      if (Math.min(minSide, minSideY) < 2) {
        // Degenerate sliver — ignore rather than create a hairline room.
        phase = { tag: "idle" };
        repaint();
        return;
      }
      const res = store.dispatch({
        type: "drawRoom",
        polygon: finalizeRectangle(phase.corner1, worldPt),
      });
      if (!res.ok) flashError(res.error);
      phase = { tag: "idle" };
      repaint();
      return;
    }
    if (phase.tag === "draggingFurniture") {
      draggingFurnitureId = null;
      bulkDragIds = null; // Issue #110: bulk drag retired with the gesture.
      endDrag();
      return;
    }
    if (phase.tag === "dragging") {
      // Pkg 12.3 (issue #101): releasing a room DRAG re-probes the
      // pointer for wall proximity — the drag moved the geometry under
      // the cursor, so the pre-drag segment address may be stale. The
      // RELEASE point decides the inspector's wall-vs-room view.
      if (tool === "select") {
        const rid = phase.selectedRoomId;
        const room = flatRooms(activeFloorPlan(store.getState())).find(
          (r) => r.id === rid,
        );
        if (room) {
          const nearSeg = nearestSegment(room, evWorld(ev));
          setSelectedSegment(
            nearSeg ? { roomId: room.id, segIndex: nearSeg.index } : null,
          );
        }
      }
      endDrag();
      return;
    }
    if (phase.tag === "resizing" || phase.tag === "panning") {
      canvas.classList.remove("pan-dragging");
      endDrag();
    }
  });
  canvas.addEventListener("pointercancel", endDrag);

  /* ---------- wheel zoom ---------- */
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newScale = Math.min(
        MAX_ZOOM_SCALE,
        Math.max(MIN_ZOOM_SCALE, cam.scale * factor),
      );
      const pos = evPos(ev);
      const worldUnderCursor = screenToWorld(cam, pos);
      cam.originX = worldUnderCursor[0] - pos[0] / newScale;
      cam.originY = worldUnderCursor[1] + pos[1] / newScale;
      cam.scale = newScale;
      repaint();
    },
    { passive: false },
  );

  /* ---------- keyboard ---------- */
  canvas.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && phase.tag === "drawingPoly") {
      closePolygon();
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') {
      // pkg 13.2 (issue #110): marquee-clear PREPENDS the strand — an
      // armed band dies first, before any rescue duty runs (prepend-
      // only insertion; the #99/#101/#100 strand-then-rescue order
      // below is untouched).
      if (marquee !== null) {
        marquee = null;
        repaint();
        return;
      }
      // Issue #147 CP4: an armed place-camera (or its in-flight aim) dies
      // next — prepend-only insertion, the strand below is untouched.
      if (placeDrag !== null || placeCameraArmed) {
        placeDrag = null;
        placeCameraArmed = false;
        repaint();
        return;
      }
      // Multi-set clear precedes the in-flight rescues: Escape with an
      // armed set (but no band) drops the selection first; a SECOND
      // Escape resumes the strand.
      if (multiSelected.size > 0) {
        multiSelected.clear();
        refreshInspector();
        repaint();
        return;
      }
      // pkg 12.1 (issue #99): abort an in-flight underlay resize (no
      // gesture to close — non-undoable editor state; the resize
      // simply freezes at the last streamed frame).
      if (resizingUnderlay !== null) {
        resizingUnderlay = null;
        repaint();
        return;
      }
      // Pkg 12.3 (issue #101): when focus sits INSIDE the inspector
      // panel, Esc collapses the panel — but never steals the key from
      // an in-flight gesture (the canvas handlers below outrank the
      // panel). The panel-scoped document handler in glue's inspector
      // section covers the panel-focused case; reaching THIS handler
      // means focus is on the canvas, so the panel never eats the
      // drawing-Esc path (handler-order pitfall from the SUB_PLAN).
      //
      // Abandoning an in-flight furniture drag MUST close the gesture,
      // else the leaked _gestureBase makes later atomic commands throw
      // ("non-streamable command inside gesture").
      if (phase.tag === 'draggingFurniture') {
        draggingFurnitureId = null;
        endDrag();
        return;
      }
      // Issue #61: abandoning an opening drag closes its gesture too
      // (a leaked _gestureBase would make later atomic commands throw).
      if (dragOpening) {
        ghost = null;
        endDrag();
        return;
      }
      // Issue #66: abandon a pending measure anchor (no gesture to close).
      if (measureDraft) {
        measureDraft = null;
        repaint();
        return;
      }
      // pkg 13.4 (issue #118): Esc abandons a staircase draft — or closes
      // an open "add floor" offer (the offer can outlive the drag).
      if (stairOffer !== null || phase.tag === "drawingStair") {
        abandonStairDraft();
        return;
      }
      // Issue #100: dropping a drawingPoly gesture kills the floating
      // dim fields with it (widget lifetime == gesture lifetime).
      destroyDrawDims();
      phase = { tag: "idle" };
      repaint();
      // Issue #143: the idle Esc fallthrough also disarms the active
      // tool back to Select (second Esc lands on the safe tool once no
      // gesture/selection rescue above claimed the key).
      if (tool !== "select") setActiveTool("select");
      return;
    }
    // pkg 12.1 (issue #99): arrow keys nudge the SELECTED underlay
    // (mouseless-first: positioning never needs a pointer). Shift
    // widens the step for coarse alignment. Unselected ⇒ keys fall
    // through untouched.
    if (
      (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' ||
        ev.key === 'ArrowUp' || ev.key === 'ArrowDown') &&
      !ev.ctrlKey && !ev.metaKey && !ev.altKey
    ) {
      const u = activeUnderlay();
      if (underlaySelected && underlayInteractable(u)) {
        ev.preventDefault();
        const step = ev.shiftKey ? UNDERLAY_NUDGE_LARGE_M : UNDERLAY_NUDGE_M;
        const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
        const dy = ev.key === 'ArrowUp' ? step : ev.key === 'ArrowDown' ? -step : 0;
        setUnderlay(nudgeUnderlay(u, dx, dy));
        return;
      }
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
      ev.preventDefault();
      if (ev.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "y" || ev.key === "Y")) {
      ev.preventDefault();
      store.redo();
      return;
    }
    // Issue #143: the R strand MOVED to the document-level tool-hotkey
    // handler (installed with the toolbar wiring). Canvas keydown
    // bubbles up to it, so R keeps rotating the selected furniture with
    // canvas focus AND arms Rectangle with nothing selected — deleting
    // the old branch here is what keeps R from double-firing.
    //
    // Issue #147 CP4: "C" arms the place-camera gesture — click a room
    // to move the 3D walker there, drag to aim it. Needs the viewer
    // (hasViewerSubscriber check inside setPlaceCameraArmed) and refuses
    // mid-gesture like the other letter keys; pressing "C" again
    // disarms. Registered in shortcuts.ts (sheet + README sync duty).
    if (
      (ev.key === "c" || ev.key === "C") &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      if (drawGestureInProgress()) return;
      ev.preventDefault();
      setPlaceCameraArmed(!placeCameraArmed);
      return;
    }
    // Issue #68: "S" toggles the snap-settings popover. Registered in
    // shortcuts.ts (feeds the "?" help modal + README sync spec).
    if (
      (ev.key === "s" || ev.key === "S") &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      const opening = refs.snapPopover.hidden === true;
      if (opening) syncSnapControls();
      setSnapPopoverOpen(opening);
      ev.preventDefault();
      return;
    }
    // pkg 8.1 (issue #83): "L" opens the wall-lean popover for the
    // SELECTED room (keyboard-first authoring — trackpad-only user).
    // Registered in shortcuts.ts (shortcut-sheet + README sync duty).
    if (
      (ev.key === "l" || ev.key === "L") &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      // Typing inside the popover's own inputs must not re-trigger.
      if (!refs.leanPopover.hidden) return;
      const sel = store.getState().selectedId;
      const room =
        sel !== null
          ? flatRooms(activeFloorPlan(store.getState())).find(
              (r) => r.id === sel,
            )
          : undefined;
      if (!room) {
        flashMessage(
          refs,
          "Select a room first, then press L to set a wall lean.",
        );
        return;
      }
      populateLeanPopover(room);
      setLeanPopoverOpen(true);
      ev.preventDefault();
      return;
    }
    // pkg 7.2 (issue #75): floor switching. PageUp/PageDown with [ / ]
    // aliases (brackets need no Fn key — friendlier on laptops).
    // Registered in shortcuts.ts (shortcut-sheet duty).
    if (
      (ev.key === "PageUp" ||
        ev.key === "PageDown" ||
        ev.key === "[" ||
        ev.key === "]") &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      const down = ev.key === "PageDown" || ev.key === "]";
      switchFloor(down ? 1 : -1);
      ev.preventDefault();
      return;
    }
    // Pkg 12.3 (issue #101): "I" toggles the inspector panel (canvas-
    // focused stroke; the panel-scoped handler above covers focus
    // inside the panel). Registered in shortcuts.ts (sheet duty).
    // Mid-gesture 'I' is swallowed (same guard as the panel handler +
    // popovers): opening the panel mid-draw would steal focus and strand
    // Esc/Enter for the rest of the gesture.
    if (
      (ev.key === "i" || ev.key === "I") &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      if (drawGestureInProgress()) return;
      setInspectorOpen(!inspector!.isOpen());
      ev.preventDefault();
      return;
    }
    // Pkg 13.1 (issue #109): "3" toggles the mini-3D inset (canvas-
    // focused stroke — the inset owns NO window-level keydown listener,
    // so the pinned Esc/Enter/I/L canvas discipline is untouched).
    // Registered in shortcuts.ts (sheet + README sync duty). Mid-gesture
    // "3" is swallowed (same guard as I): enabling the inset mid-draw
    // would recompile the 3D scene under a streaming gesture.
    if (
      (ev.key === "3") &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      if (drawGestureInProgress()) return;
      void setMini3dOpen(mini3d === null || !mini3d.isOpen());
      ev.preventDefault();
      return;
    }
    // Issue #126: "0" fits the whole plan in the viewport (the Center
    // button's framing, shared via fitToPlan; registered in shortcuts.ts
    // for the sheet + README sync). Same guards as "3"/"I": swallowed
    // mid-gesture, and Ctrl/Cmd+0 stays the browser's zoom reset.
    if (ev.key === "0" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (drawGestureInProgress()) return;
      fitToPlan();
      ev.preventDefault();
      return;
    }
    if (
      (ev.key === "Backspace" || ev.key === "Delete") &&
      !ev.ctrlKey &&
      !ev.metaKey
    ) {
      // Issue #100 (Pkg 12.2): typing dims into a field must never
      // DELETE the selection — Backspace is an EDIT key whenever
      // focus sits in an input/textarea/select (the floating draw
      // widget, the inspector, the popovers). Guard before routing.
      const t = ev.target as HTMLElement | null;
      if (
        t !== null &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const sel = store.getState().selectedId;
      // Issue #110: an armed multi-set also owns the Delete key (even
      // with no single selection live).
      if (sel !== null || multiSelected.size > 0) {
        ev.preventDefault();
        routeDelete();
      }
    }
  });

  /* ---------- pkg 12.2 (issue #100): mid-draw type-in dims ---------- */

  /** Tear the floating widget down (gesture ended / cancelled). */
  function destroyDrawDims(): void {
    if (drawDims === null) return;
    drawDims.root.remove();
    drawDims = null;
  }

  /**
   * (Re)build the floating length/angle pair against the CURRENT
   * pending segment (last committed point → phase.cursor). Called on
   * the first committed point and after every push (pointer click or
   * typed Enter). Fresh mount each time keeps the seeding single-path
   * (no imperative reconcile) and resets focus to the length field —
   * the chain-alive, mouseless rhythm.
   *
   * `focusSync`: KEYBOARD-initiated remounts (Enter/Esc inside the
   * field's own keydown) focus the fresh fields SYNCHRONOUSLY so the
   * typing chain never breaks. POINTER-initiated remounts pass false:
   * the click's default action focuses the canvas, and stealing focus
   * back would break the canvas-focused shortcut flows mid-draw (the
   * pinned #101 Esc/I discipline) — the widget is one Tab away for
   * the mixed pointer+keyboard flow.
   */
  function remountDrawDims(focusSync: boolean): void {
    if (phase.tag !== "drawingPoly") {
      destroyDrawDims();
      return;
    }
    const last = phase.points[phase.points.length - 1];
    destroyDrawDims();
    drawDims = mountDimFields({
      lengthM: Math.hypot(
        phase.cursor[0] - last[0],
        phase.cursor[1] - last[1],
      ),
      angleDeg: compassAngleBetween(last, phase.cursor),
      onLive: (dims) => {
        if (phase.tag !== "drawingPoly") return;
        // AS-YOU-TYPE ghost preview: the pending cursor becomes the
        // typed polar point. NO snapPoint here — the typed value
        // overrides snap for the PENDING segment only; the next
        // pointer move/click re-engages snapPoint naturally.
        phase = {
          ...phase,
          cursor: polarEndpoint(last, dims.lengthM, dims.angleDeg),
        };
        repaint();
      },
      onCommit: (dims) => {
        if (phase.tag !== "drawingPoly") return;
        // Push the typed point VERBATIM (typed overrides snap for this
        // segment — the whole point of #100), keep the chain alive,
        // reseed the fields for the next segment.
        const pt = polarEndpoint(last, dims.lengthM, dims.angleDeg);
        phase.points.push(pt);
        phase.cursor = pt;
        // Keyboard-initiated: focus the fresh fields synchronously so
        // the very next keystroke is already aimed at them.
        remountDrawDims(true);
        repaint();
      },
      onInvalid: () => {
        // Reject-with-flash; state untouched (ghost keeps last preview).
        flashMessage(refs, "Length must be a positive number.");
      },
      onCancel: () => {
        if (phase.tag !== "drawingPoly") return;
        // Esc: drop the PENDING cursor back onto the last committed
        // point (fields reseed, chain INTACT — nothing discarded but
        // the uncommitted preview).
        phase = { ...phase, cursor: last };
        remountDrawDims(true);
        repaint();
      },
      testidPrefix: "draw-dims",
      lengthLabel: "Pending length (m)",
      angleLabel: "Pending angle (\u00B0)",
    });
    drawDimsMount().appendChild(drawDims.root);
    // Issue #144 fix-round: the widget must stay the FIRST focusable
    // stop after the canvas (remountDrawDims contract); re-assert the
    // first-run layers' last-in-DOM position now that the widget exists.
    keepFirstRunLayersLast();
    // Degenerate pending segment (fresh point, or right after Esc):
    // seed the fields CLEAR (brief: "fields cleared, chain intact")
    // instead of a meaningless 0/0 — typing starts from scratch.
    const seededLen = Math.hypot(
      phase.cursor[0] - last[0],
      phase.cursor[1] - last[1],
    );
    if (seededLen < 1e-9) {
      drawDims.lengthInput.value = "";
      drawDims.angleInput.value = "";
    }
    if (focusSync) {
      drawDims.focus();
    }
  }

  function mountDrawDims(): void {
    remountDrawDims(false);
  }

  function closePolygon(): void {
    if (phase.tag !== "drawingPoly") return;
    destroyDrawDims();
    const pts = phase.points;
    if (pts.length < POLYGON_MIN_POINTS) {
      flashMessage(
        refs,
        `Need at least ${POLYGON_MIN_POINTS} points to close a polygon`,
      );
      phase = { tag: "idle" };
      repaint();
      return;
    }
    const res = store.dispatch({ type: "drawRoom", polygon: pts });
    if (!res.ok) {
      flashError(res.error);
    }
    phase = { tag: "idle" };
    repaint();
  }

  canvas.addEventListener("dblclick", () => {
    if (phase.tag === "drawingPoly") closePolygon();
  });

  /* ---------- Pkg 15.1 (issue #144): first-run experience ---------- */

  /*
   * Three surfaces, one gate: the empty-state card (prefill), the
   * floating Plans button + popover (replacement), and the in-app
   * confirm dialog (discard guard). Everything mounts OUTSIDE the
   * toolbar — sibling #142 reworks the toolbar, and the batch collision
   * constraint forbids touching it. The sanctioned deviation from the
   * issue's "File menu (or the toolbar)" wording is advisor-ratified
   * (batch issue #160).
   */

  let card: EmptyStateCard | null = null;

  /** Card visibility: empty plan AND no armed drawing tool. */
  function refreshEmptyState(): void {
    card?.update(planIsEmpty(store.getState().data) && tool === 'select');
  }

  /**
   * Wholesale plan swap — the EXACT loadPlan/import sequence
   * (replaceAll → autosave.stop() → persistSync, see the import handler
   * above) so the autosave slot reflects the new plan across a reload.
   *
   * `replaceAll` deliberately KEEPS the underlay slice and the
   * measurement lane: both are editor state persisted under their own
   * keys (store.ts replaceAll comment), so New plan — which promises a
   * clean slate — has to clear them explicitly. Demo loads keep them
   * (only the plan is replaced), per the issue's wording.
   *
   * One-way: history resets with the swap and CONFIRM_MSG says so.
   */
  function swapPlan(
    plan: FloorplanData,
    opts: { clearUnderlays?: boolean; clearMeasurements?: boolean } = {},
  ): void {
    store.replaceAll(plan);
    autosave.stop();
    autosave.persistSync(plan);
    if (opts.clearUnderlays) {
      store.hydrateUnderlays({});
      saveUnderlayMap(underlayStorage, {});
    }
    if (opts.clearMeasurements) {
      measurements = [];
      saveMeasurements(window.localStorage, measurements);
    }
  }

  /**
   * Destructive-swap guard. Empty plans load WITHOUT a prompt (AC);
   * non-empty plans ask through the in-app dialog (never window.confirm)
   * whose copy carries the Save JSON lifeline.
   */
  async function confirmDiscardIfNeeded(): Promise<boolean> {
    if (planIsEmpty(store.getState().data)) return true;
    return confirmDialog({
      title: 'Replace the current plan?',
      message: CONFIRM_MSG,
      confirmLabel: 'Replace plan',
    });
  }

  /** Demo load: guard → swap (underlays/measurements survive) → flash. */
  async function loadDemoById(id: DemoId): Promise<void> {
    if (!(await confirmDiscardIfNeeded())) return;
    swapPlan(loadDemoPlan(id));
    flashMessage(refs, `Loaded the ${demoById(id).label} demo.`);
  }

  /** New plan: guard → empty single-floor plan, clean slate. */
  async function startNewPlan(): Promise<void> {
    if (!(await confirmDiscardIfNeeded())) return;
    swapPlan(emptyPlan(), { clearUnderlays: true, clearMeasurements: true });
    flashMessage(refs, 'Started a new plan.');
  }

  card = mountEmptyStateCard(refs.emptyStateMount, {
    onDrawRoom: () => setActiveTool('rectangle'),
    onLoadDemo: (id) => void loadDemoById(id),
    onImportJson: () => {
      // Mirror the toolbar Import button: clearing the value makes
      // re-picking the same file re-fire change (no new machinery).
      refs.importFileInput.value = '';
      refs.importFileInput.click();
    },
  });

  mountPlanMenu(refs.planMenuMount, {
    onNewPlan: () => void startNewPlan(),
    onLoadDemo: (id) => void loadDemoById(id),
  });

  /* ---------- boot ---------- */
  // Issue #126: load the stored theme and mirror it onto <html> before the
  // first paint (the canvas palette and the CSS tokens read it).
  applyTheme(loadTheme(safeLocalStorage()));
  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(canvas.parentElement!);
  resizeCanvas();
  refreshBadgeAndButtons();
  refreshFloorIndicator();
  refreshStatus();
  refreshEmptyState();
}

/** Hydrate the store from autosaved data (validated) or start clean. */
export function hydrateFromAutosave(
  store: EditorStore,
  autosave: AutosaveManager,
): void {
  let hydrated: FloorplanData | null = null;
  const restored = autosave.loadStoredPlan((raw) => {
    // Migrate-at-the-door: the slot may hold a LEGACY v1 payload (older
    // browsers, pre-v2 exports). migrate() runs BEFORE validate() so the
    // validator only ever sees current-shape data — raw v1 is still
    // rejected by validateFloorplan itself (unsupported-version).
    const mig = migrate(raw);
    if (!mig.ok || !mig.data) return false;
    const res = validateFloorplan(mig.data);
    if (!res.ok) return false;
    hydrated = res.value;
    return true;
  });
  if (hydrated !== null && restored !== null) {
    store.replaceAll(hydrated);
  }
}

export { emptyPlan };
