/**
 * Wire-up: binds DOM events to the controller primitives and paints on
 * every state change. Lives here (not in controller.ts) so the gesture
 * math stays unit-testable without a real canvas/browser.
 */
import type { FloorplanData, FurnitureItem } from '../shared/schema';
import { flatFurniture, flatOpenings, flatRooms, migrate, validateFloorplan } from '../shared/schema';
import { AutosaveManager } from './autosave';
import {
  attemptDrop,
  classifyCorner,
  computeOverlaps,
  evaluateSnapCandidates,
  finalizeRectangle,
  HANDLE_HIT_PX,
  judgeMoveTarget,
  nextRotation,
  openingErrorMessage,
  resizeHandleAt,
  resizeHandlesOf,
  roomAt,
  screenToWorld,
  SNAP_TOL_PX,
  validateOpeningDraft,
  worldToScreen,
  type AnyToolMode,
  type Camera,
  type GhostPreview,
  type InteractionPhase,
} from './controller';
import { FURNITURE_DEFAULTS, OPENING_DEFAULTS } from './model/constants';
import {
  loadSnapSettings,
  parsePitch,
  resolveSnap,
  safeLocalStorage,
  saveSnapSettings,
  type SnapSettings,
} from './model/settings';
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
import { flashMessage, type EditorDomRefs } from './ui';
import { paintScene } from './render';
import { paintMeasureAnnotations, paintMeasurementBadges } from './render/measurementBadges';
import { paintAngleReadouts } from './render/angleReadouts';
import { totalLivableAreaM2, formatTotal } from './measures';
import { renderOffscreen, downloadExport, type ExportScale } from './export';
import { openExportDialog } from './exportDialog';
import { initShortcuts, toolHint, GLOBAL_TOOL_HINT } from './polish';
import { closeHelpModal, toggleHelpModal } from './helpModal';
import { EditorStore, emptyPlan } from './store';
import { toLegacyWire } from './wire';
import { vecAdd, vecSub } from './geom';
import {
  labelHitTest,
  loadMeasurements,
  makeMeasureId,
  saveMeasurements,
  type Measurement,
} from './model/measure';

const POLYGON_MIN_POINTS = 3;
const CLOSE_HIT_RADIUS_PX = 10; // click-near-start closes the polygon
const INITIAL_SCALE = 80; // px per meter
/** Issue #61: pointer travel (screen px) before a click becomes a drag. */
const OPENING_DRAG_THRESHOLD_PX = 3;

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
  kind: 'door' | 'window';
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
  return rowsAfter - rowsBefore === 1 ? 'Opening pierces only this wall' : null;
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
export function computeFitCamera(plan: FloorplanData, w: number, h: number): Camera {
  const b = planBounds(plan);
  if (b === null || !(w > 0) || !(h > 0)) return { ...NEUTRAL_CAMERA };
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  if (!(bw > 0) || !(bh > 0)) return { ...NEUTRAL_CAMERA };
  const scale = clampScale(Math.min(w / bw, h / bh) * (1 - FIT_MARGIN));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { originX: cx - (w / 2) / scale, originY: cy + (h / 2) / scale, scale };
}

/**
 * Zoom about the canvas midpoint: the world point under the centre stays
 * put, so the buttons read as a viewport zoom rather than a pan. Clamped
 * to the shared MIN/MAX zoom scales.
 */
export function zoomAboutCenter(cam: Camera, factor: number, w: number, h: number): Camera {
  const scale = clampScale(cam.scale * factor);
  const center = screenToWorld(cam, [w / 2, h / 2]);
  return { originX: center[0] - (w / 2) / scale, originY: center[1] + (h / 2) / scale, scale };
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
  const ctx = canvas.getContext('2d'); // null in stub/happy-dom environments
  const cam: Camera = { originX: 0, originY: 0, scale: INITIAL_SCALE };
  let tool: AnyToolMode = 'select';
  let phase: InteractionPhase = { tag: 'idle' };
  let hoverRoomId: string | null = null;
  /** Issue #53: index of the resize handle under the cursor, if any. */
  let hoverHandle: number | null = null;
  // pkg 3 (issue #4):
  let stampType: string = 'bed';
  let ghost: GhostPreview | null = null;
  let hoverSeg: { roomId: string; segIndex: number } | null = null;
  let draggingFurnitureId: string | null = null;
  // Issue #61: opening drag candidate (null = no opening drag in flight).
  let dragOpening: OpeningDragCandidate | null = null;
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
    const rect = canvas.getBoundingClientRect();
    paintScene(
      ctx, rect.width, rect.height, cam, store.getState().data, phase, hoverRoomId,
      ghost, hoverSeg, hoverHandle, store.getState().selectedId, snapSettings.pitch,
    );
    // pkg 6 (issue #7): measurement badges painted on TOP of the scene
    // so they ride pan/zoom and appear in exports.
    paintMeasurementBadges(ctx, cam, store.getState().data, dimensionsVisible);
    // Issue #66: measure annotations ride the same Dimensions toggle.
    paintMeasureAnnotations(ctx, cam, measurements, dimensionsVisible);
    // pkg 2 (issue #67): live angle readouts during gestures.
    // Deliberately ABSENT from the export path below — these are
    // gesture-live affordances, not plan content.
    paintAngleReadouts(
      ctx, cam, store.getState().data, phase, hoverSeg, dimensionsVisible,
    );
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

  /**
   * Full snap policy (issue #68): magnetize to foreign room geometry
   * first; fall back to the pitch grid from snap settings when nothing
   * attracts within tolerance. Master OFF disables both.
   */
  function snapPoint(worldPt: Pt, excludeIds: string[] = []): Pt {
    const geo = evaluateSnapCandidates(
      store.getState().data,
      worldPt,
      snapToleranceWorld(),
      excludeIds,
    );
    return resolveSnap(
      worldPt,
      geo.snapped ? geo.point : null,
      snapSettings,
    );
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
    const parts: string[] = [`rooms: ${flatRooms(st.data).length}`, `tool: ${tool}`];
    if (flatOpenings(st.data).length > 0) parts.push(`openings: ${flatOpenings(st.data).length}`);
    if (flatFurniture(st.data).length > 0) parts.push(`furniture: ${flatFurniture(st.data).length}`);
    if (st.selectedId) parts.push('selected: 1');
    if (store.canUndo()) parts.push('undo ↺');
    if (store.canRedo()) parts.push('redo ↻');
    refs.status.textContent = parts.join(' · ');
    // pkg 6 (issue #7): livable-area total + contextual tool hint.
    refs.statusTotal.textContent = formatTotal(totalLivableAreaM2(st.data));
    const hint = toolHint(tool) || GLOBAL_TOOL_HINT;
    refs.status.title = hint;
  }

  function refreshBadgeAndButtons(): void {
    const overlaps = computeOverlaps(store.getState().data);
    refs.badge.hidden = overlaps.length === 0;
    const st = store.getState();
    refs.btnDelete.disabled = st.selectedId === null;
    refs.btnUndo.disabled = !store.canUndo();
    refs.btnRedo.disabled = !store.canRedo();
  }

  store.subscribe((_s) => {
    if (_s === undefined) return;
    // Slot speaks the frozen v1 wire (wire.ts contract): flatten through
    // toLegacyWire so every writer agrees on the format (reviewer #74).
    if (store.dirty) autosave.scheduleSave(toLegacyWire(_s.data));
    refreshBadgeAndButtons();
    refreshStatus();
    repaint();
  });

  /* ---------- toolbar ---------- */
  function setActiveTool(next: AnyToolMode): void {
    tool = next;
    dragOpening = null; // #61: switching tools abandons any opening candidate
    measureDraft = null; // #66: switching tools abandons a pending anchor
    if (next === 'select') {
      phase = { tag: 'idle' };
    } else {
      store.dispatch({ type: 'setEntitySelection', entityId: null });
      phase = { tag: 'idle' };
    }

    // Furniture palette rides shotgun with the stamp tool.
    refs.palette.hidden = tool !== 'stamp';

    for (const [btn, val] of [
      [refs.btnSelect, 'select'],
      [refs.btnRect, 'rectangle'],
      [refs.btnPoly, 'polygon'],
      [refs.btnDoor, 'door'],
      [refs.btnWindow, 'window'],
      [refs.btnStamp, 'stamp'],
      [refs.btnAddMeasure, 'measure'],
    ] as Array<[HTMLButtonElement, AnyToolMode]>) {
      btn.classList.toggle('active', val === tool);
      btn.setAttribute('aria-pressed', String(val === tool));
    }
    refreshStatus();
    repaint();
  }

  refs.btnSelect.addEventListener('click', () => setActiveTool('select'));
  // Issue #60: "Dimensions" toggle — flips aria-pressed, repaints.
  refs.btnDimensions.addEventListener('click', () => {
    dimensionsVisible = !dimensionsVisible;
    refs.btnDimensions.setAttribute('aria-pressed', String(dimensionsVisible));
    refs.btnDimensions.classList.toggle('active', dimensionsVisible);
    repaint();
  });

  /* ---------- Issue #68: snap settings popover ---------- */

  /** Sync popover controls from the current settings. */
  const syncSnapControls = (): void => {
    refs.snapPopover.querySelectorAll<HTMLInputElement>(
      'input[name="snap-pitch"]',
    ).forEach((r) => {
      r.checked = parsePitch(Number(r.value)) === snapSettings.pitch;
    });
    const masterCb = refs.snapPopover.querySelector<HTMLInputElement>(
      '[data-testid="snap-master"]',
    );
    if (masterCb) masterCb.checked = snapSettings.master;
  };

  const setSnapPopoverOpen = (open: boolean): void => {
    refs.snapPopover.hidden = !open;
    refs.btnSnap.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  refs.btnSnap.addEventListener('click', () => {
    // hidden===true means the popover is closed, i.e. we are OPENING it.
    const opening = refs.snapPopover.hidden === true;
    if (opening) syncSnapControls();
    setSnapPopoverOpen(opening);
  });

  refs.snapPopover.addEventListener('change', (ev) => {
    const target = ev.target as HTMLInputElement;
    if (target.name === 'snap-pitch') {
      const pitch = parsePitch(Number(target.value));
      if (pitch !== null) updateSnapSettings({ ...snapSettings, pitch });
    } else if (target.dataset.testid === 'snap-master') {
      updateSnapSettings({ ...snapSettings, master: target.checked });
    }
  });

  // Outside click closes the popover (first-popover discipline: dumb
  // listeners, no focus trap).
  document.addEventListener('pointerdown', (ev) => {
    if (refs.snapPopover.hidden) return;
    if (refs.snapPopover.contains(ev.target as Node)) return;
    if (refs.btnSnap.contains(ev.target as Node)) return;
    setSnapPopoverOpen(false);
  });
  // Escape closes it too (capture phase so canvas key handling is moot).
  document.addEventListener('keydown', (ev) => {
    if (!refs.snapPopover.hidden && ev.key === 'Escape') {
      ev.stopPropagation();
      setSnapPopoverOpen(false);
    }
  }, true);
  refs.btnRect.addEventListener('click', () => setActiveTool('rectangle'));
  refs.btnPoly.addEventListener('click', () => setActiveTool('polygon'));
  refs.btnDoor.addEventListener('click', () => setActiveTool('door'));
  refs.btnWindow.addEventListener('click', () => setActiveTool('window'));
  refs.btnStamp.addEventListener('click', () => setActiveTool('stamp'));
  refs.btnAddMeasure.addEventListener('click', () => setActiveTool('measure'));
  // Issue #66: wipe all annotations (persists immediately).
  refs.btnClearMeasure.addEventListener('click', () => {
    measurements = [];
    saveMeasurements(window.localStorage, measurements);
    repaint();
  });

  for (const chip of Array.from(refs.palette.querySelectorAll<HTMLButtonElement>('.palette-chip'))) {
    chip.addEventListener('click', () => {
      const t = chip.dataset.stampType;
      if (t && FURNITURE_DEFAULTS[t]) {
        stampType = t;
        for (const c of Array.from(refs.palette.querySelectorAll<HTMLButtonElement>('.palette-chip'))) {
          c.classList.toggle('active', c === chip);
        }
      }
    });
  }

  refs.btnUndo.addEventListener('click', () => {
    store.undo();
  });
  refs.btnRedo.addEventListener('click', () => {
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
      paintScene(ctx, w, h, scaledCam, store.getState().data, { tag: 'idle' }, null);
      paintMeasurementBadges(ctx, scaledCam, store.getState().data, dimensionsVisible);
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
      flashMessage(refs, `Exported ${result.filename} (${result.width}\u00D7${result.height}).`);
    } catch (err) {
      flashMessage(refs, `Export failed: ${(err as Error).message}`);
    }
  }
  refs.btnExport.addEventListener('click', () => {
    void runExportFlow();
  });

  refs.btnHelp.addEventListener('click', () => toggleHelpModal());
  initShortcuts();
  window.addEventListener('beforeunload', closeHelpModal, { once: true });

  /**
   * Delete routes by WHAT is selected: furniture stamp → deleteFurniture,
   * opening → deleteOpening (+ its pair), room → deleteRoom.
   */
  function routeDelete(): void {
    const sel = store.getState().selectedId;
    if (sel === null) return;
    const st = store.getState();
    if (flatFurniture(st.data).some((f) => f.id === sel)) {
      store.dispatch({ type: 'deleteFurniture', furnitureId: sel });
      return;
    }
    if (flatOpenings(st.data).some((o) => o.id === sel)) {
      store.dispatch({ type: 'deleteOpening', openingId: sel, syncPair: true });
      return;
    }
    store.dispatch({ type: 'deleteRoom', roomId: sel });
  }
  refs.btnDelete.addEventListener('click', () => routeDelete());

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

  refs.btnCenter.addEventListener('click', () => {
    const { w, h } = viewportSize();
    applyCamera(computeFitCamera(store.getState().data, w, h));
  });
  refs.btnZoomIn.addEventListener('click', () => {
    const { w, h } = viewportSize();
    applyCamera(zoomAboutCenter(cam, ZOOM_BUTTON_STEP, w, h));
  });
  refs.btnZoomOut.addEventListener('click', () => {
    const { w, h } = viewportSize();
    applyCamera(zoomAboutCenter(cam, 1 / ZOOM_BUTTON_STEP, w, h));
  });

  // Read-only debug seam for e2e: main.ts's __casaplaza bridge is out of
  // Pkg 2's grant, so the camera is exposed from glue instead.
  (window as unknown as { __editorCam?: () => Camera }).__editorCam = () => ({ ...cam });

  // Issue #53 read-only seam: screen-space resize-handle centres of the
  // currently-selected room (empty when nothing is selected). Same
  // precedent as __editorCam — lets e2e assert handle count + aim grabs.
  (window as unknown as { __editorHandles?: () => Pt[] }).__editorHandles = () => {
    const st = store.getState();
    if (st.selectedId === null) return [];
    const room = flatRooms(st.data).find((r) => r.id === st.selectedId);
    if (!room) return [];
    return resizeHandlesOf(room).map((p) => worldToScreen(cam, p));
  };

  // Issue #66 read-only seams (same precedent as __editorHandles): the
  // annotation list and the Dimensions flag are canvas-drawn, so e2e
  // observes them through here.
  (window as unknown as { __editorMeasurements?: () => Measurement[] }).__editorMeasurements =
    () => measurements.slice();
  (window as unknown as { __editorDimsVisible?: () => boolean }).__editorDimsVisible =
    () => dimensionsVisible;




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
    if (tool !== 'door' && tool !== 'window') return;
    const kind = tool;
    const plan = store.getState().data;
    let bestRoomId: string | null = null;
    let bestSeg: ReturnType<typeof nearestSegment> = null;
    let bestDist = Infinity;
    for (const room of flatRooms(plan)) {
      const seg = nearestSegment(room, worldPt);
      if (!seg) continue;
      const a = seg.a;
      const b = seg.b;
      const proj = projectOntoSegment(worldPt, { index: seg.index, a, b, length: seg.length });
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
      plan, bestRoomId, bestSeg.index, kind, t,
      defs.width, defs.sillHeight, defs.headHeight,
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
  function commitOpening(kind: 'door' | 'window'): void {
    if (!ghost || !ghost.seg || ghost.t === undefined || !ghost.valid || !hoverSeg) {
      return;
    }
    const defs = OPENING_DEFAULTS[kind];
    const err = validateOpeningDraft(
      store.getState().data, hoverSeg.roomId, hoverSeg.segIndex, kind,
      ghost.t, defs.width, defs.sillHeight, defs.headHeight,
    );
    if (err !== null) {
      flashMessage(refs, openingErrorMessage(err, kind));
      return;
    }
    const rowsBefore = flatOpenings(store.getState().data).length;
    const res = store.dispatch({
      type: 'addOpening',
      roomId: hoverSeg.roomId,
      segmentIndex: hoverSeg.segIndex,
      kind,
      tCenter: ghost.t,
      width: defs.width,
      sillHeight: defs.sillHeight,
      headHeight: defs.headHeight,
    });
    if (!res.ok) {
      flashMessage(refs, res.error);
      return;
    }
    const notice = openingCommitNotice(
      rowsBefore,
      flatOpenings(store.getState().data).length,
    );
    if (notice !== null) flashMessage(refs, notice);
  }

  /* ---------- pointer interactions ---------- */
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button === 1 || ev.altKey) {
      // Middle-button or alt-drag pans.
      const pos = evPos(ev);
      phase = { tag: 'panning', startX: pos[0], startY: pos[1] };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.button !== 0) return;

    const worldPt = evWorld(ev);

    // Issue #66 (Pkg 1): the measure tool runs OUTSIDE the phase
    // machine — first click anchors, second click commits, and a click
    // on an existing label REMOVES that annotation. Both points snap via
    // the shared snapPoint() policy.
    if (tool === 'measure') {
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
          { id: makeMeasureId(), a: measureDraft.a, b: snapped },
        ];
        measureDraft = null;
        saveMeasurements(window.localStorage, measurements);
      }
      repaint();
      return;
    }

    if (tool === 'rectangle') {
      // Snap the anchor corner to grid/foreign geometry like any other gesture.
      phase = { tag: 'drawingRect', corner1: snapPoint(worldPt), cursor: snapPoint(worldPt) };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    if (tool === 'door' || tool === 'window') {
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
          store.getState().data,
          hoverSeg!.roomId,
          hoverSeg!.segIndex,
          tool,
          ghost.t!,
          OPENING_DEFAULTS[tool].width,
          OPENING_DEFAULTS[tool].sillHeight,
          OPENING_DEFAULTS[tool].headHeight,
        );
        flashMessage(refs, openingErrorMessage(code ?? 'UNKNOWN', tool));
      } else {
        flashMessage(refs, `Move closer to a wall to place the ${tool}.`);
      }
      repaint();
      return;
    }

    if (tool === 'stamp') {
      const def = FURNITURE_DEFAULTS[stampType];
      if (!def) return;
      const outcome = attemptDrop(store.getState().data, def.footprint, worldPt);
      if (outcome.verdict === 'rejected') {
        flashMessage(
          refs,
          outcome.reason === 'NO_ROOM_AT_POINT'
            ? 'Click inside a room to place furniture.'
            : 'That piece does not fit anywhere in this room — placement cancelled.',
        );
        repaint();
        return;
      }
      const host = roomAt(worldPt, store.getState().data)!;
      const pos = outcome.verdict === 'warn' ? outcome.snappedTo : worldPt;
      const res = store.dispatch({
        type: 'addFurniture',
        itemType: stampType,
        roomId: host.id,
        position: pos,
        rotationDeg: 0,
        footprint: [def.footprint[0], def.footprint[1]],
      });
      if (!res.ok) {
        flashMessage(refs, res.error);
      } else if (outcome.verdict === 'warn') {
        flashMessage(refs, 'Placed, but adjusted inward to stay inside the room.');
      }
      repaint();
      return;
    }

    if (tool === 'polygon') {
      const cur = phase.tag === 'drawingPoly' ? phase : null;
      if (cur === null) {
        const first = snapPoint(worldPt);
        phase = { tag: 'drawingPoly', points: [first], cursor: first };
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
      }
      repaint();
      return;
    }

    // --- select tool ---
    const st = store.getState();

    // Furniture takes grab priority over rooms (smaller primitive).
    const grabbed = furnitureItemAt(worldPt, st.data);
    if (grabbed) {
      store.dispatch({ type: 'setEntitySelection', entityId: grabbed.id });
      draggingFurnitureId = grabbed.id;
      store.beginGesture();
      phase = { tag: 'draggingFurniture', furnitureId: grabbed.id };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    // pkg 1 (issue #52): an opening under the cursor wins over the room
    // wall it is cut into. pkg 3 (issue #61): select immediately, then
    // stash a drag candidate — the gesture only begins once the pointer
    // clears the click threshold, so a plain click stays a click.
    const openingHit = openingAt(worldPt, st.data);
    if (openingHit) {
      const hitRoom = flatRooms(st.data).find((r) => r.id === openingHit.roomId);
      const hitSeg = hitRoom ? roomSegments(hitRoom)[openingHit.segmentIndex] : undefined;
      store.dispatch({ type: 'setEntitySelection', entityId: openingHit.id });
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
      phase = { tag: 'idle' };
      return;
    }

    const clicked = roomAt(worldPt, st.data);
    if (clicked) {
      // Priority: resize handle on ALREADY-selected room > begin drag > plain select.
      if (st.selectedId === clicked.id) {
        const handle = resizeHandleAt(worldPt, clicked, handleToleranceWorld());
        if (handle !== null) {
          store.beginGesture();
          phase = { tag: 'resizing', vertexIndex: handle, selectedRoomId: clicked.id };
          canvas.setPointerCapture(ev.pointerId);
          return;
        }
      }
      store.dispatch({ type: 'setSelection', roomId: clicked.id });
      // Offset from the grabbed POINT to the room's anchor vertex, so the
      // vertex follows the cursor exactly (no teleport on first move).
      const grabOffset = vecSub(clicked.polygon[0], worldPt);
      store.beginGesture();
      phase = { tag: 'dragging', grabOffset, selectedRoomId: clicked.id };
      canvas.setPointerCapture(ev.pointerId);
    } else {
      store.dispatch({ type: 'setSelection', roomId: null });
      phase = { tag: 'idle' };
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
    const plan = store.getState().data;
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
      (openingDragClash(plan, d.id, t) ? 'CLASHES_EXISTING_OPENING' : null);
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
        type: 'moveOpening',
        openingId: d.id,
        tCenter: t,
        syncPair: true,
      });
    }
    repaint();
  }

  canvas.addEventListener('pointermove', (ev) => {
    const worldPt = evWorld(ev);

    // Issue #61: an in-flight opening drag owns the pointer.
    if (dragOpening) {
      handleOpeningDrag(ev, worldPt);
      return;
    }

    // pkg 3: opening-tool ghost slide + wall highlight (any phase-less move).
    if (tool === 'door' || tool === 'window') {
      updateOpeningHover(worldPt);
      repaint();
      return;
    }

    if (tool === 'stamp') {
      // Live ghost rect under the cursor for the armed stamp type.
      const def = FURNITURE_DEFAULTS[stampType];
      if (def) {
        const outcome = attemptDrop(store.getState().data, def.footprint, worldPt);
        ghost = {
          kind: 'stamp',
          pos: outcome.verdict === 'warn' ? outcome.snappedTo : worldPt,
          footprint: [def.footprint[0], def.footprint[1]],
          rotationDeg: 0,
          valid: outcome.verdict !== 'rejected',
        };
      }
      repaint();
      return;
    }

    if (phase.tag === 'draggingFurniture') {
      const fid = draggingFurnitureId;
      if (fid) {
        const verdict = judgeMoveTarget(store.getState().data, fid, worldPt);
        if (verdict.verdict === 'rejected') {
          // Snap-back: revert to the item's last committed position.
          const item = flatFurniture(store.getState().data).find((f) => f.id === fid);
          if (item) {
            store.dispatch({ type: 'moveFurniture', furnitureId: fid, position: item.position });
            flashMessage(refs, 'Piece pulled outside the room — snapped back to its last valid spot.');
          }
        } else {
          store.dispatch({
            type: 'moveFurniture',
            furnitureId: fid,
            position: verdict.resolved,
          });
          if (verdict.verdict === 'warn') {
            flashMessage(refs, 'Moved, but clamped to keep the piece inside the room.');
          }
        }
      }
      repaint();
      return;
    }

    if (phase.tag === 'panning') {
      const pos = evPos(ev);
      cam.originX -= (pos[0] - phase.startX) / cam.scale;
      cam.originY += (pos[1] - phase.startY) / cam.scale;
      phase.startX = pos[0];
      phase.startY = pos[1];
      repaint();
      return;
    }

    if (phase.tag === 'drawingRect') {
      phase = { ...phase, cursor: snapPoint(worldPt) };
      repaint();
      return;
    }

    if (phase.tag === 'drawingPoly') {
      phase = { ...phase, cursor: snapPoint(worldPt) };
      repaint();
      return;
    }

    if (phase.tag === 'dragging') {
      const rid = phase.selectedRoomId;
      const room = flatRooms(store.getState().data).find((r) => r.id === rid);
      if (!room) return;
      // Cursor's target for the anchor vertex = worldPt + grabOffset
      // (grabOffset = anchor - grabPoint at pickup).
      const desiredAnchor = vecAdd(worldPt, phase.grabOffset);
      const sn = evaluateSnapCandidates(
        store.getState().data,
        desiredAnchor,
        snapToleranceWorld(),
        [room.id],
      );
      const delta = vecSub(sn.point, room.polygon[0]);
      store.dispatch({ type: 'moveRoom', roomId: room.id, delta });
      repaint();
      return;
    }

    if (phase.tag === 'resizing') {
      const vid = phase.vertexIndex;
      const rid = phase.selectedRoomId;
      const room = flatRooms(store.getState().data).find((r) => r.id === rid);
      if (!room) return;
      // Issue #53: route the dragged vertex through the SAME snap policy
      // as draw-time (snapPoint = foreign geometry, else 0.5 m grid), so
      // corner drags snap identically to how they were drawn.
      store.dispatch({
        type: 'resizeRoom',
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
    const selId = st.selectedId;
    const selRoom = selId !== null ? flatRooms(st.data).find((r) => r.id === selId) : undefined;
    if (tool === 'select' && selRoom) {
      const handleIdx = resizeHandleAt(worldPt, selRoom, handleToleranceWorld());
      if (handleIdx !== null) {
        hoverHandle = handleIdx;
        canvas.style.cursor = classifyCorner(selRoom.polygon[handleIdx], selRoom) ?? 'default';
      } else if (roomAt(worldPt, st.data)?.id === selId) {
        hoverHandle = null;
        canvas.style.cursor = 'move';
      } else {
        hoverHandle = null;
        canvas.style.cursor = 'default';
      }
    } else {
      hoverHandle = null;
      canvas.style.cursor = '';
    }
    const hit = roomAt(worldPt, st.data);
    const hid = hit?.id ?? null;
    if (hid !== hoverRoomId || prevHandle !== hoverHandle) {
      hoverRoomId = hid;
      repaint();
    }
  });

  function endDrag(): void {
    dragOpening = null;
    store.endGesture();
    phase = { tag: 'idle' };
    repaint();
  }

  canvas.addEventListener('pointerup', (ev) => {
    // Issue #61: release an in-flight opening drag. Never streamed an
    // invalid frame, so state already sits at lastValidT; flash the
    // banner when the release frame was invalid.
    if (dragOpening) {
      const d = dragOpening;
      dragOpening = null;
      if (d.engaged) {
        if (d.lastErr !== null) {
          flashMessage(refs, openingErrorMessage(d.lastErr, d.kind));
        }
        store.endGesture();
        ghost = null;
        repaint();
      }
      phase = { tag: 'idle' };
      return;
    }
    if (phase.tag === 'drawingRect' && ev.button === 0) {
      const worldPt = snapPoint(evWorld(ev));
      const minSide = Math.abs(worldPt[0] - phase.corner1[0]) * cam.scale;
      const minSideY = Math.abs(worldPt[1] - phase.corner1[1]) * cam.scale;
      if (Math.min(minSide, minSideY) < 2) {
        // Degenerate sliver — ignore rather than create a hairline room.
        phase = { tag: 'idle' };
        repaint();
        return;
      }
      const res = store.dispatch({
        type: 'drawRoom',
        polygon: finalizeRectangle(phase.corner1, worldPt),
      });
      if (!res.ok) flashMessage(refs, res.error);
      phase = { tag: 'idle' };
      repaint();
      return;
    }
    if (phase.tag === 'draggingFurniture') {
      draggingFurnitureId = null;
      endDrag();
      return;
    }
    if (phase.tag === 'dragging' || phase.tag === 'resizing' || phase.tag === 'panning') {
      endDrag();
    }
  });
  canvas.addEventListener('pointercancel', endDrag);

  /* ---------- wheel zoom ---------- */
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newScale = Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, cam.scale * factor));
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
  canvas.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && phase.tag === 'drawingPoly') {
      closePolygon();
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') {
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
      phase = { tag: 'idle' };
      repaint();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
      ev.preventDefault();
      if (ev.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) {
      ev.preventDefault();
      store.redo();
      return;
    }
    if ((ev.key === 'r' || ev.key === 'R') && !ev.ctrlKey && !ev.metaKey) {
      const sel = store.getState().selectedId;
      if (sel === null) return;
      const item = flatFurniture(store.getState().data).find((f) => f.id === sel);
      if (item) {
        ev.preventDefault();
        store.dispatch({
          type: 'rotateFurniture',
          furnitureId: item.id,
          rotationDeg: nextRotation(item.rotationDeg),
        });
      }
      return;
    }
    // Issue #68: "S" toggles the snap-settings popover. Registered in
    // shortcuts.ts (feeds the "?" help modal + README sync spec).
    if ((ev.key === 's' || ev.key === 'S') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const opening = refs.snapPopover.hidden === true;
      if (opening) syncSnapControls();
      setSnapPopoverOpen(opening);
      ev.preventDefault();
      return;
    }
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && !ev.ctrlKey && !ev.metaKey) {
      const sel = store.getState().selectedId;
      if (sel !== null) {
        ev.preventDefault();
        routeDelete();
      }
    }
  });

  function closePolygon(): void {
    if (phase.tag !== 'drawingPoly') return;
    const pts = phase.points;
    if (pts.length < POLYGON_MIN_POINTS) {
      flashMessage(refs, `Need at least ${POLYGON_MIN_POINTS} points to close a polygon`);
      phase = { tag: 'idle' };
      repaint();
      return;
    }
    const res = store.dispatch({ type: 'drawRoom', polygon: pts });
    if (!res.ok) {
      flashMessage(refs, res.error);
    }
    phase = { tag: 'idle' };
    repaint();
  }

  canvas.addEventListener('dblclick', () => {
    if (phase.tag === 'drawingPoly') closePolygon();
  });

  /* ---------- boot ---------- */
  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(canvas.parentElement!);
  resizeCanvas();
  refreshBadgeAndButtons();
  refreshStatus();
}

/** Hydrate the store from autosaved data (validated) or start clean. */
export function hydrateFromAutosave(store: EditorStore, autosave: AutosaveManager): void {
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
