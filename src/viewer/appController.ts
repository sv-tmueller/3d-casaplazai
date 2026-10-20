/**
 * App controller (issue #6): the SINGLE OWNER of the viewer runtime —
 * requestAnimationFrame loop, the OVERVIEW⇄WALK FSM, the 250 ms
 * debounced polling of the pkg-2 bridge (window.__casaplaza.getData()),
 * validate-before-render with LAST-GOOD retention (an INVALID
 * intermediate state keeps rendering the previous good scene and raises
 * a toast — never a crash), camera-pose preservation across recompiles,
 * respawn only when the disc's footing goes illegal, and the full
 * dispose chain (renderer → scene graph → HUD → listeners → timers).
 */

import {
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';

import { compilePlan, parseValidatedPlan } from '../geom';
import type { FloorplanData, Room } from '../shared/schema';
import { flatOpenings, flatRooms, migrate } from '../shared/schema';
import { adaptScene, sceneHasNaN } from './adapter';
import {
  buildHud,
  destroyHud,
  onBindCollapse,
  onBindModeSegment,
  onBindGotoRoom,
  onBindRoofToggle,
  dismissErrorToasts,
  onBindSunNorth,
  onBindSunTime,
  onBindWallsAlpha,
  PerfOverlay,
  playFade,
  reflectCollapsed,
  reflectFloorName,
  populateRoomPicker,
  reflectMode,
  reflectRoomReadout,
  reflectRoofVisibility,
  reflectSunSettings,
  reflectWallsAlpha,
  saveHudState,
  setEmptyState,
  setWalkAffordances,
  setWalkDisabled,
  showHint,
  toast,
  type HudHandles,
} from './hud';
import { OrbitRig } from './orbitMode';
import { setMaxAnisotropy } from './materials';
import { isHighQuality } from './quality';
import {
  INTERIOR_LIGHT_COLOR,
  INTERIOR_LIGHTS_INTERVAL_TICKS,
  INTERIOR_LIGHT_Z_OFFSET_M,
  MAX_INTERIOR_LIGHTS,
  ROOFS_FADE_MIN_OPACITY,
  ROOFS_FADE_RATE_PER_S,
  ROOFS_RAYCAST_FAR_M,
  ROOFS_RAYCAST_INTERVAL_TICKS,
} from './renderConstants';
import { solveSpawn, solveSpawnInRoom, SpawnFailureError } from './spawn';
import {
  applySkyDusk,
  applySunPose,
  buildViewerScene,
  configureRenderer,
  disposeObject,
  emptyAdaptedScene,
  paintSky,
} from './sceneBuilder';
import {
  DEFAULT_SUN_SETTINGS,
  interiorFillIntensity,
  normalizeBearingDeg,
  normalizeSunSettings,
  selectNearestRoomLights,
} from './sun';
import {
  RECOMPILE_DEBOUNCE_MS,
  type AdaptedScene,
  type CameraRig,
  type RoomLightSpot,
  type SunSettings,
  type ViewMode,
} from './types';
import {
  publishPose,
  subscribeCommands,
  type WalkerCommand,
} from '../shared/walkerLink';
import { attributeFloorIdx, roomReadoutAt } from './walkNav';
import {
  activeCollisions,
  fadeStepOpacity,
  isIndoorFromRay,
  WalkRig,
} from './walkMode';

/** Shape of the pkg-2 bridge hung off window.__casaplaza. */
export interface DataBridge {
  /**
   * Current plan. May arrive in EITHER shape: the bridge's published
   * wire format is frozen v1 (converted at the editor door), so the
   * consumer migrates before validating (see refreshAdaptation).
   */
  getData(): unknown;
  /**
   * CURRENT-schema (v2) plan, all storeys (issue #76 bridge addition).
   * Preferred when present: the frozen v1 getData flattens to the
   * ground floor, dropping upper storeys the multi-floor viewer needs.
   */
  getCurrent?(): unknown;
}

/** Runtime knobs injected for testability (defaults = production). */
export interface ControllerOpts {
  /** Bridge supplier; sampled on the debounced cadence. */
  readonly bridge: () => DataBridge | undefined;
  /** Canvas hosting the GL context. */
  readonly canvas: HTMLCanvasElement;
  /** Pane hosting the HUD overlay. */
  readonly pane: HTMLElement;
  /** rAF-like scheduler seam (unit tests inject manual pumps). */
  readonly scheduleTick?: (cb: (now: number) => void) => (() => void) | void;
  /** Timer seam for the debounce (tests advance manually). */
  readonly setTimeoutFn?: typeof window.setTimeout;
}

/** Internal FSM phases; 'transition' parks input during fades. */
type Phase = 'overview' | 'walk' | 'transition';

/** Retained last-known-good adaptation across bad intermediates. */
interface GoodSnapshot {
  adapted: AdaptedScene;
  planSignature: string;
}

/** Cheap-but-total revision fingerprint of a plan. */
export function planSignature(plan: FloorplanData): string {
  return JSON.stringify(plan);
}

/**
 * True when the plan holds no rooms on ANY storey (issue #148): the
 * viewer's EMPTY STATE, not a validation error. The schema's
 * "at least one room" rule stays untouched — this predicate only keeps
 * the viewer from feeding the validator a plan it is meant to reject.
 */
export function isEmptyPlan(plan: FloorplanData): boolean {
  return flatRooms(plan).length === 0;
}

/**
 * Not-composed readings for the plan-parity probes (issue #148). While
 * the empty state is up the scene holds the sky/ground backdrop — scenery,
 * NOT a plan — so `__viewerStats` reports exactly what it reported before
 * any plan was composed: no meshes, no slots, null wall/roof, −1
 * roughness. The e2e waits gate on `meshCount > 0`, so this keeps that
 * predicate meaning "the real plan is on screen" instead of latching onto
 * the backdrop at boot. Live-only channels (quality, frame median, sun
 * pose, atlas generations) are never masked.
 */
const EMPTY_VIEWER_STATS = {
  meshCount: 0,
  slotCount: 0,
  glassQuadCount: 0,
  furnitureVolumeCount: 0,
  roofTriangleCount: 0,
  texturedSlotCount: 0,
  glassRoughness: -1,
  wallRoughness: -1,
  roofOpacity: null,
  roofVisible: null,
  wallOpacity: null,
  wallVisible: null,
};

/**
 * The viewer application controller. Instantiate once per page; call
 * dispose() on teardown.
 */
export class ViewerApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly pane: HTMLElement;
  private readonly bridgeSupplier: () => DataBridge | undefined;
  private readonly scheduleTick: (
    cb: (now: number) => void,
  ) => (() => void) | void;
  private readonly setTimeoutFn: typeof window.setTimeout;

  private renderer: WebGLRenderer | null = null;
  private sceneRoot: ReturnType<typeof buildViewerScene> | null = null;
  private hud!: HudHandles;
  private perf: PerfOverlay;
  private unbindToggle: (() => void) | null = null;
  private unbindCollapse: (() => void) | null = null;

  /**
   * Quality tier resolved at boot (#87's quality.ts — absorbed #86's
   * inline parse per the batch-#85 arbitration); surfaces in
   * __viewerStats. HIGH default, hostile values fail open to HIGH.
   */
  private readonly hiQuality: boolean;
  private unbindRoofToggle: (() => void) | null = null;
  private unbindSunTime: (() => void) | null = null;
  private unbindSunNorth: (() => void) | null = null;

  /**
   * Manual roof-visibility state (HUD toggle, issue #86).
   */
  private roofsShown = true;

  /**
   * Empty-plan state (issue #148): true while the plan has no rooms and
   * the sky/ground backdrop + centered prompt stand in for the scene.
   * Entered from refreshAdaptation BEFORE the validator sees the plan;
   * left on the first successful compile.
   */
  private emptyStateActive = false;

  /**
   * Canvas-click listener of the LIVE walk rig (issue #147 CP2): rigs
   * are swapped on respawn/teleport, so the previous listener's teardown
   * is tracked here instead of accumulating in `disposers` (a stale
   * listener would keep the dead rig reachable).
   */
  private walkClickDisposer: (() => void) | null = null;

  /** Unsubscribe thunk for the walkerLink command feed (issue #147). */
  private unsubscribeWalkerCommands: (() => void) | null = null;

  /** Unbind thunk for the go-to-room picker (issue #147 CP3). */
  private unbindGotoRoom: (() => void) | null = null;

  /**
   * Newest plan that passed validation (issue #147 CP3): the readout and
   * the room picker both describe ACCEPTED geometry, so they read from
   * here instead of re-migrating the bridge's raw plan every frame.
   * Main's `lastGood.adapted` already caches the ADAPTED scene; this
   * field keeps the RAW validated plan for name/geometry lookups.
   */
  private lastGoodPlan: FloorplanData | null = null;

  /**
   * Last string written to the HUD room readout (issue #147 CP3). The
   * pump runs every frame, so the DOM only hears about transitions —
   * write-on-change, same discipline as the walker pose publish.
   */
  private lastRoomReadout: string | null = null;

  /** Walls-transparency slider (issue #120): unbind + normalized state. */
  private unbindWallsAlpha: (() => void) | null = null;
  private wallsAlpha = 0;

  /**
   * Interior fill lights (issue #152): a FIXED pool of shadowless point
   * lights, at most MAX_INTERIOR_LIGHTS of them, created once per scene
   * build. Lights are only ever MOVED (position + intensity) — adding or
   * removing one re-compiles every material in the scene.
   */
  private roomLightSpots: readonly RoomLightSpot[] = [];
  private interiorLights: PointLight[] = [];
  /** Dusk-derived pool level (0 while the sun is up); see paintSun. */
  private interiorFillLevel = 0;
  /** Pool lights currently carrying a room (stats + AC3 probe). */
  private interiorAssigned = 0;
  /** Forces the next walk frame to re-pick the nearest rooms. */
  private interiorAssignDirty = true;
  private interiorTick = 0;

  /** Sun/time-of-day settings (issue #121); defaults = the noon perch. */
  private sunSettings: SunSettings = { ...DEFAULT_SUN_SETTINGS };

  /**
   * Shadow-atlas generation counter (issue #121 fix round): increments
   * once per rendered frame that regenerates the shadow atlas. The atlas
   * is static unless needsUpdate asks (autoUpdate is OFF, #86) and the
   * frame's render() consumes that flag; reading it immediately before
   * render() therefore counts real regenerations, not intent — a stale
   * refresh freezes this counter while the light pose still moves.
   */
  private shadowAtlasGenerations = 0;

  /**
   * Autofade machinery (issue #86): upward-eye-ray raycaster against
   * roof-slot meshes only, throttled to every Nth tick. Opacity tweens
   * on the roof material; `transparent` is flipped on ONLY while an
   * actual fade is in flight (restored to false at the extremes so the
   * opaque fast path keeps its draw order).
   */
  private readonly roofRaycaster = new Raycaster();
  private roofFadeState: 'shown' | 'fading' | 'hidden' = 'shown';
  private tickCounter = 0;
  /** Cached indoor verdict between throttled raycasts. */
  private indoor = false;

  private phase: Phase = 'overview';
  private rig: CameraRig | null = null;
  private orbitCam: OrbitRig | null = null;
  private walkCam: WalkRig | null = null;
  private preservedAzimuth: number | undefined;

  private lastGood: GoodSnapshot | null = null;
  private lastAcceptedSignature: string | null = null;

  /** Debounced poll machinery. */
  private pollTimer: ReturnType<Window['setTimeout']> | null = null;

  private rafCancel: (() => void) | null = null;
  private disposed = false;
  private lastFrameTime = -1;
  /**
   * Rolling RAW frame-time samples (#87), most recent last, capped at
   * 60 — feeds the medianFrameMs stats probe. Raw (uncapped) values:
   * the 0.1 s simulation-clamp must not hide real render cost.
   */
  private readonly frameTimes: number[] = [];
  private readonly disposers: Array<() => void> = [];

  public constructor(opts: ControllerOpts) {
    this.canvas = opts.canvas;
    this.pane = opts.pane;
    this.bridgeSupplier = opts.bridge;
    this.scheduleTick = opts.scheduleTick ?? defaultSchedule;
    this.setTimeoutFn = opts.setTimeoutFn ?? window.setTimeout.bind(window);
    // Absorb #86's inline parse into #87's shared resolver (batch-#85
    // arbitration): one owner of the ?quality param. Boot-time state.
    this.perf = new PerfOverlay(isPerfEnabled());
    this.hiQuality = isHighQuality();
  }

  /** Boot: renderer, HUD, initial adaptation, RAF loop, poll timer. */
  public start(): void {
    this.renderer = makeRenderer(this.canvas);
    // Wire the renderer's real anisotropy ceiling into the texture
    // cache (#87). Conservative baked-in 4 until this point; harmless
    // no-op when the environment lacks a GL context.
    if (this.renderer) {
      setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    }

    this.hud = buildHud(this.pane);
    this.perf.mount(this.hud);
    // Mode segment (#146): each click requests the CLICKED mode — not a
    // blind flip — so double clicks stay idempotent; reflectMode (boot
    // and post-swap) marks the CURRENT segment.
    this.unbindToggle = onBindModeSegment(this.hud, (next: ViewMode) =>
      this.requestMode(next),
    );
    // Panel collapse (#146): reflect + persist per browser. buildHud
    // already applied the persisted state, so a reload boots collapsed.
    this.unbindCollapse = onBindCollapse(this.hud, (collapsed) => {
      reflectCollapsed(this.hud, collapsed);
      saveHudState(this.hud.storage, { collapsed });
    });
    // Roof visibility toggle (issue #86): flips every roof-slot mesh;
    // reflection keeps the button label/aria in step with reality.
    this.unbindRoofToggle = onBindRoofToggle(
      this.hud,
      () => this.roofsShown,
      (visible) => this.setRoofsVisible(visible),
    );
    reflectRoofVisibility(this.hud, this.roofsShown);
    // Walls-transparency slider (issue #120): normalized alpha →
    // wall-material applier; reflect the boot state like the roof pair.
    this.unbindWallsAlpha = onBindWallsAlpha(this.hud, (alpha) =>
      this.setWallsAlpha(alpha),
    );
    reflectWallsAlpha(this.hud, this.wallsAlpha);
    // Sun controls (issue #121): time-of-day + north-offset sliders —
    // the same single-owner binder pattern; reflect so the HUD always
    // mirrors the controller's state.
    this.unbindSunTime = onBindSunTime(this.hud, (hours) => {
      this.applySunSettings({ timeHours: hours });
    });
    this.unbindSunNorth = onBindSunNorth(this.hud, (deg) => {
      this.applySunSettings({ northOffsetDeg: deg });
    });
    reflectSunSettings(this.hud, this.sunSettings);

    // Issue #147 CP3: go-to-room picker. The editor's teleports have a
    // keyboard path; the viewer needs one of its own — a native select
    // fed from the ACCEPTED plan (populateRoomPicker runs inside
    // refreshAdaptation). Choices ride the same walkerLink command feed
    // the 2D pane uses, so the teleport semantics (autoLock=false,
    // storey resolution) are shared, never duplicated.
    this.unbindGotoRoom = onBindGotoRoom(this.hud, (roomId) => {
      void this.handleWalkerCommand({ kind: 'gotoRoom', roomId });
    });
    this.disposers.push(() => {
      this.unbindGotoRoom?.();
      this.unbindGotoRoom = null;
    });

    // Tab toggles overview ⇄ walk (README-promised; formerly unwired —
    // the e2e descended vacuously). Skipped while typing in form fields.
    const onTabKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Tab' || ev.ctrlKey || ev.altKey || ev.metaKey) return;
      const tgt = ev.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.isContentEditable)
      ) {
        return; // let accessibility-focused Tab behave normally
      }
      ev.preventDefault();
      this.requestMode(this.phase === 'walk' ? 'overview' : 'walk');
    };
    window.addEventListener('keydown', onTabKey);
    this.disposers.push(() =>
      window.removeEventListener('keydown', onTabKey),
    );

    // Issue #147 CP2: listen for 2D-pane walk commands (place camera,
    // go-to-room). Subscribed at start, so a command arriving before the
    // first frame is still honoured; the initial null publication tells a
    // late editor subscriber that no walker exists yet.
    this.unsubscribeWalkerCommands = subscribeCommands((cmd) => {
      void this.handleWalkerCommand(cmd);
    });
    this.disposers.push(() => {
      this.unsubscribeWalkerCommands?.();
      this.unsubscribeWalkerCommands = null;
      publishPose(null);
    });

    this.refreshAdaptation(true);
    reflectMode(this.hud, 'overview');
    this.seatRig('overview');

    // Issue #30: controller-level pointer-lock watcher. On lock the walk
    // entry prompt gives way to the reticle; the unlock side is handled
    // by the rig's onUnlock→overview path (which clears both).
    const onLockChange = (): void => {
      if (this.phase !== 'walk' || !this.walkCam) return;
      if (this.walkCam.locked) {
        setWalkAffordances(this.hud, { overlay: false, reticle: true });
        // Entry prompt gives way to the controls hint (#146); the strip
        // stays bottom-center, OUTSIDE the docked panel.
        showHint(this.hud, 'WASD to move · Esc to release');
      }
    };
    document.addEventListener('pointerlockchange', onLockChange);
    this.disposers.push(() =>
      document.removeEventListener('pointerlockchange', onLockChange),
    );
    // Publish the debug seams BEFORE the first RAF so a probe arriving
    // between start() and frame one never observes them missing.
    this.publishDebugSeams(this.liveCamera());
    this.startLoop();
    this.armDebouncePoll();
  }

  /* ---------------------------------- FSM ---------------------------------- */

  /** Mode request from the HUD toggle (ignored mid-transition). */
  public requestMode(next: ViewMode): void {
    if (this.disposed || this.phase === 'transition') return;
    // Issue #148: nothing to walk in while the plan has no rooms. The
    // toggle is parked in the empty state; this guard holds the same
    // invariant for the Tab handler and programmatic callers.
    if (next === 'walk' && this.lastGood === null) return;
    if (next === this.viewMode()) return;
    void this.swapModes(next);
  }

  /** Test/observability seam: signature of the currently ACCEPTED plan. */
  public currentSignature(): string | null {
    return this.lastAcceptedSignature;
  }

  private viewMode(): ViewMode {
    return this.phase === 'walk' ? 'walk' : 'overview';
  }

  /**
   * Swap rigs across the fade.
   *
   * `autoLock` (issue #147 CP2): the Walk-button path is a user gesture
   * and tries to lock immediately; the command path (place-camera /
   * go-to-room, seated from the 2D pane) must NOT — AC "pointer lock is
   * not requested until the user clicks the 3D pane" — so it seats the
   * rig with the overlay up and leaves the click-to-lock flow to the
   * user.
   */
  private async swapModes(next: ViewMode, autoLock = true): Promise<void> {
    this.phase = 'transition';
    await playFade(this.hud);
    if (this.disposed) return;

    // Pose preservation across the seam (orbit azimuth survives walks).
    if (this.orbitCam && next === 'walk') {
      this.preservedAzimuth = this.orbitCam.azimuthDegrees;
    }

    this.rig?.deactivate();
    this.walkCam = null;
    this.orbitCam = null;
    this.rig = null;

    const adapted = this.lastGood?.adapted ?? null;
    if (!adapted) {
      this.phase = 'overview';
      this.seatRig('overview');
      return;
    }

    if (next === 'walk') {
      this.walkCam = this.makeWalkRig(adapted);
      this.rig = this.walkCam;
      this.phase = 'walk';
      // Ceilings policy (#152): the walker is inside the building, so the
      // slats overhead are visible again (fresh meshes arrive visible;
      // this re-shows them after an overview spell).
      this.setCeilingsVisible(true);
      showHint(this.hud, 'Click to walk');
      // Issue #30: prompt for entry; reticle comes up on lock.
      setWalkAffordances(this.hud, { overlay: true, reticle: false });
      // The Walk-button click is a user gesture, so try to lock straight
      // away. If the browser defers/refuses, the promise throws (or the
      // call no-ops) and the overlay stays up — graceful fallback to the
      // existing canvas-click re-lock flow below.
      //
      // Command-seated swaps (issue #147) pass autoLock=false and skip
      // this entirely: no requestPointerLock attempt until the user
      // clicks the 3D pane.
      if (autoLock) {
        try {
          this.walkCam.requestLock();
        } catch {
          /* lock refused/deferred: overlay remains the entry affordance */
        }
      }
    } else {
      this.orbitCam = this.makeOrbitRig(adapted);
      this.rig = this.orbitCam;
      this.phase = 'overview';
      // Ceilings policy (#152): the dollhouse overview never shows the
      // ceiling lid — roofs/upper-storey slabs are the overview lid, and
      // hiding the slats is what lets the top-down camera see inside.
      this.setCeilingsVisible(false);
      // Exiting walk lifts any autofade: overview spectators always see
      // the roofs at full opacity (manual-hide via the HUD still works).
      for (const mesh of this.roofMeshes()) {
        const mat = mesh.material as MeshStandardMaterial;
        mat.opacity = 1;
        mat.transparent = false;
      }
      this.roofFadeState = 'shown';
      this.indoor = false;
      showHint(this.hud, '');
      // Leaving walk clears both affordances (toggling out is not an
      // unlock event, so the pointerlockchange path cannot cover it).
      setWalkAffordances(this.hud, { overlay: false, reticle: false });
    }
    reflectMode(this.hud, this.phase as ViewMode);
  }

  private makeOrbitRig(adapted: AdaptedScene): OrbitRig {
    return new OrbitRig(this.canvas, adapted, this.preservedAzimuth);
  }

  /** Fabricate a walk rig; solves spawn, surfacing typed failure. */
  private makeWalkRig(adapted: AdaptedScene): WalkRig {
    const plan = this.currentPlanSafe();
    let spawn = { x: 0, y: 0, yaw: 0 };
    if (plan) {
      try {
        // Solve ONLY within the active storey's rooms (issue #76): the
        // largest room ACROSS ALL FLOORS could sit upstairs, stranding
        // the walker on the wrong storey. The walk rig grounds itself
        // at the same floor via adapted.activeFloorElevation.
        spawn = solveSpawn(activeRooms(plan), adapted.collisions);
      } catch (err) {
        if (err instanceof SpawnFailureError) {
          toast(this.hud, err.message, 'error');
        } else {
          throw err;
        }
      }
    }
    const rig = new WalkRig(this.canvas, adapted, spawn.x, spawn.y, spawn.yaw);
    this.wireWalkRig(rig);
    return rig;
  }

  /**
   * Attach the walk-rig interaction wiring (issue #147 CP2 extraction):
   * the unlock⇄overview path plus canvas-click re-lock. Shared by the
   * fresh walk rig and every rig the teleports swap in — before the
   * extraction a replaced rig lost its onUnlock wiring, which silently
   * killed "ESC returns to orbit" after a respawn or a teleport.
   */
  private wireWalkRig(rig: WalkRig): void {
    rig.onUnlock(() => {
      // ESC (or any unlock) RETURNS TO OVERVIEW per issue #6's AC
      // ("ESC returns to orbit, lock released cleanly"). The prior
      // auto-relock behavior trapped the user in walk mode.
      setWalkAffordances(this.hud, { overlay: false, reticle: false });
      void this.requestMode('overview');
    });

    // Canvas click re-attempt locking (cooldown-gated inside the rig).
    // Only the LIVE rig keeps a listener: rigs are swapped on respawn
    // and teleport, and stacked listeners would pin the dead rig (and
    // its camera) in memory.
    this.walkClickDisposer?.();
    const onClick = (): void => {
      if (this.phase === 'walk' && !rig.locked) rig.requestLock();
    };
    this.canvas.addEventListener('click', onClick);
    this.walkClickDisposer = () =>
      this.canvas.removeEventListener('click', onClick);
  }

  /* --------------------------- walker telemetry ---------------------------- */

  /**
   * Editor → viewer walk commands (issue #147 CP2): teleport the walker
   * from the 2D plan. Handlers are fire-and-forget — the editor cannot
   * await the mode fade and must not block its own UI — so the viewer's
   * guards (disposed / mid-transition) drop commands that arrive during
   * a swap.
   *
   * Sub-plan judgment: seating walk mode from a command passes
   * autoLock=false, i.e. it performs ZERO requestPointerLock attempts
   * (AC: pointer lock is not requested until the user clicks the 3D
   * pane). The 'Click to walk' overlay stays up as the invitation —
   * the same affordance the Walk button leaves behind when the browser
   * defers the lock.
   */
  private async handleWalkerCommand(cmd: WalkerCommand): Promise<void> {
    if (this.disposed || this.phase === 'transition') return;
    if (this.phase !== 'walk') {
      await this.swapModes('walk', false);
    }
    if (this.disposed || this.phase !== 'walk' || !this.walkCam) return;
    if (cmd.kind === 'place') {
      this.placeWalker(cmd.x, cmd.y, cmd.yaw, cmd.floorIdx);
    } else {
      this.gotoRoom(cmd.roomId);
    }
  }

  /** Place-camera teleport: an explicit plan point on an explicit storey. */
  private placeWalker(
    x: number,
    y: number,
    yaw: number,
    floorIdx: number,
  ): void {
    const adapted = this.lastGood?.adapted;
    if (!adapted) return;
    const plan = this.currentPlanSafe();
    const elevation =
      plan?.floors[floorIdx]?.elevation ?? adapted.activeFloorElevation;
    this.replaceWalkRig(x, y, yaw, elevation);
  }

  /**
   * Go-to-room teleport: resolve the room's OWN storey, solve a spawn
   * inside that room (never the plan-wide largest room) and seat the
   * walker there. Satisfies "choosing one spawns the walker at that
   * room's centroid, switching floors as needed".
   */
  private gotoRoom(roomId: string): void {
    const adapted = this.lastGood?.adapted;
    const plan = this.currentPlanSafe();
    if (!adapted || !plan) return;

    let floor: FloorplanData['floors'][number] | undefined;
    let room: FloorplanData['floors'][number]['rooms'][number] | undefined;
    for (const f of plan.floors) {
      const hit = f.rooms.find((r) => r.id === roomId);
      if (hit) {
        floor = f;
        room = hit;
        break;
      }
    }
    if (!floor || !room) {
      toast(this.hud, 'That room is not in the current plan.', 'error');
      return;
    }

    try {
      const pose = solveSpawnInRoom(
        room,
        activeCollisions(adapted, floor.elevation),
      );
      this.replaceWalkRig(pose.x, pose.y, pose.yaw, floor.elevation);
    } catch (err) {
      if (err instanceof SpawnFailureError) {
        toast(this.hud, err.message, 'error');
      } else {
        throw err;
      }
    }
  }

  /**
   * Publish the walker pose to the 2D pane (issue #147 CP2): disc x/y,
   * runtime heading yaw, attributed storey, mode. Publishing null while
   * no walk rig is live RETRACTS the editor glyph — leaving walk mode
   * must not strand a marker on the plan.
   */
  private publishWalkerPose(): void {
    const walk = this.walkCam;
    if (this.phase !== 'walk' || !walk) {
      publishPose(null);
      return;
    }
    const plan = this.currentPlanSafe();
    const disc = walk.discPosition;
    const z = walk.currentZ;
    publishPose({
      x: disc.x,
      y: disc.y,
      yawRad: walk.headingYaw,
      floorIdx: plan ? attributeFloorIdx(plan.floors, z) : 0,
      mode: 'walk',
    });
  }

  /**
   * Issue #147 CP3: HUD room readout. Shows the name of the room the
   * walker stands in on its ATTRIBUTED storey (walkNav.roomReadoutAt —
   * the same query the pose publish uses, never a second copy of the
   * rule), or hides entirely when there is no live walker. Runs per
   * frame but writes only on change.
   */
  private updateRoomReadout(): void {
    const walk = this.walkCam;
    let text: string | null = null;
    if (this.phase === 'walk' && walk && this.lastGoodPlan) {
      const disc = walk.discPosition;
      text = roomReadoutAt(this.lastGoodPlan, disc.x, disc.y, walk.currentZ);
    }
    if (text === this.lastRoomReadout) return;
    this.lastRoomReadout = text;
    reflectRoomReadout(this.hud, text);
  }

  /**
   * Issue #147 CP5: programmatic twin of the room readout for the e2e
   * seam (`__viewerStats`). Shares roomReadoutAt/attributeFloorIdx with
   * the HUD path — one attribution rule, two readers. Null/blank when
   * walk mode is not live (mirrors the hidden span).
   */
  private walkNavProbe(): { roomName: string | null; floorIdx: number | null } {
    const walk = this.walkCam;
    const plan = this.lastGoodPlan;
    if (this.phase !== 'walk' || !walk || !plan) {
      return { roomName: null, floorIdx: null };
    }
    const disc = walk.discPosition;
    return {
      roomName: roomReadoutAt(plan, disc.x, disc.y, walk.currentZ),
      floorIdx: attributeFloorIdx(plan.floors, walk.currentZ),
    };
  }

  /** Issue #147 CP3: rebuild the go-to-room picker from an accepted plan. */
  private populateRoomPickerFrom(plan: FloorplanData): void {
    populateRoomPicker(
      this.hud,
      plan.floors.map((floor) => ({
        name: floor.name,
        rooms: floor.rooms.map((room) => ({ id: room.id, name: room.name })),
      })),
    );
  }

  /* ------------------------------- adaptation ------------------------------- */

  /**
   * Latest plan from the bridge, MIGRATED to the current schema
   * (undefined when unavailable/dirty/unmigratable). Single choke
   * point: every internal consumer gets current-shape v2 data.
   * Prefers getCurrent() (all storeys, issue #76); falls back to the
   * frozen v1 getData() for bridges that predate it.
   */
  private currentPlanSafe(): FloorplanData | undefined {
    const bridge = this.bridgeSupplier();
    if (!bridge) return undefined;
    try {
      const raw =
        bridge.getCurrent !== undefined
          ? bridge.getCurrent()
          : bridge.getData();
      const mig = migrate(raw);
      return mig.ok && mig.data ? mig.data : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Validate-before-render: compile+adapt the freshest plan; on ANY
   * failure retain the last GOOD adaptation (toast + keep rendering),
   * never propagate upward.
   */
  private refreshAdaptation(initial: boolean): void {
    const plan = this.currentPlanSafe();
    if (!plan) {
      if (initial) toast(this.hud, 'Waiting for the editor bridge…', 'info');
      return;
    }

    const sig = planSignature(plan);

    // Issue #148: a room-less plan is NOT an error. Classify before the
    // validator is consulted (its ≥1-room rule stays intact) and stand
    // the scene down to the empty state instead of re-toasting every
    // 250ms poll.
    if (isEmptyPlan(plan)) {
      this.enterEmptyState();
      return;
    }

    if (!initial && sig === this.lastAcceptedSignature) {
      return; // unchanged since the last accepted compile
    }

    try {
      // currentPlanSafe() already ran migrate-at-the-door (the bridge's
      // wire format is frozen v1 — see editor/wire.ts), so the
      // validator only ever sees current-shape data; raw v1 is still
      // rejected by validateFloorplan itself (unsupported-version).
      const validated = parseValidatedPlan(plan);
      const compiled = compilePlan(validated);
      const adapted = adaptScene(
        compiled,
        roomsById(validated),
        flatOpenings(validated),
        validated.wallThickness,
        validated,
      );

      if (sceneHasNaN(adapted.buckets.map((b) => b.positions))) {
        throw new Error('compiled scene contains NaN coordinates');
      }

      const changedShape = this.lastGood !== null;
      // Issue #148: a successful compile means the plan is valid again —
      // leave the empty state if it was active, retract the failure toast
      // it superseded, and seat an eye when none survived the empty or
      // failed stretch, so the accepted scene is really in frame.
      this.exitEmptyState();
      this.lastGood = { adapted, planSignature: sig };
      this.lastAcceptedSignature = sig;
      // Floor readout (#146): the viewer pins floors[0] — the lowest
      // storey the adapter grounds every rig on — so the readout names
      // THAT floor: truthful about what is RENDERED (sub-plan decision a).
      reflectFloorName(this.hud, validated.floors[0]?.name ?? '');
      // Issue #148: the plan is valid again — retract the stale failure
      // toast and reseat the overview rig if the empty stretch unseated it.
      dismissErrorToasts(this.hud);
      if (this.phase === 'overview' && !this.orbitCam) {
        this.seatRig('overview');
      }
      // Issue #147 CP3: the ACCEPTED plan feeds the walk-nav aids. Kept
      // beside lastGood (same acceptance point) so an invalid
      // intermediate never moves the room readout or the picker.
      this.lastGoodPlan = validated;
      this.populateRoomPickerFrom(validated);
      this.renderScene(adapted, changedShape);
    } catch (err) {
      // INVALID INTERMEDIATE: keep rendering the last good scene.
      const msg = err instanceof Error ? err.message : String(err);
      if (this.lastGood === null) {
        toast(this.hud, `Cannot render plan: ${msg}`, 'error');
      } else {
        toast(this.hud, 'Recompile failed — keeping last good view', 'error');
      }
    }
  }

  /**
   * Enter the empty-plan state (issue #148): a room-less plan gets the
   * sky/ground backdrop, the centered prompt and a parked Walk toggle —
   * never a validator toast. Idempotent: the poll reaches this branch on
   * every cycle while the plan stays empty.
   *
   * lastGood/lastAcceptedSignature are cleared so the first real room
   * re-seats fully instead of reframing a scene the user has deleted.
   */
  private enterEmptyState(): void {
    if (this.emptyStateActive) return;
    this.emptyStateActive = true;

    this.lastGood = null;
    this.lastAcceptedSignature = null;

    // Tear the live rig down FIRST — a walk rig has no rooms to stand in
    // (same deactivate pattern as a mode swap). The rebuilt backdrop rig
    // below takes its place.
    this.rig?.deactivate();
    this.walkCam = null;
    this.orbitCam = null;
    this.rig = null;
    this.phase = 'overview';
    // Mirrors the walk-exit reset: no autofade can be mid-flight.
    this.roofFadeState = 'shown';
    this.indoor = false;

    setEmptyState(this.hud, true);
    setWalkDisabled(this.hud, true);
    setWalkAffordances(this.hud, { overlay: false, reticle: false });
    showHint(this.hud, '');
    reflectMode(this.hud, 'overview');

    // Backdrop: the normal builder fed the neutral, geometry-free scene
    // (defined in sceneBuilder), then an orbit rig framed on its plot so
    // the empty stage still renders and orbits.
    const empty = emptyAdaptedScene();
    this.renderScene(empty, false);
    this.orbitCam = this.makeOrbitRig(empty);
    this.rig = this.orbitCam;
  }

  /**
   * Leave the empty state (issue #148): the prompt goes away, Walk
   * becomes available again and the toggle mirrors overview. Returns
   * true only when this call actually left the state.
   */
  private exitEmptyState(): boolean {
    if (!this.emptyStateActive) return false;
    this.emptyStateActive = false;

    // The backdrop rig is display-only scenery, not the plan's camera.
    // Tear it down (and drop the azimuth it carried), so the first real
    // plan re-seats from the cold-boot path — otherwise the backdrop's
    // plot-derived pose leaks into the plan's overview framing.
    this.rig?.deactivate();
    this.orbitCam = null;
    this.walkCam = null;
    this.rig = null;
    this.phase = 'overview';
    this.preservedAzimuth = undefined;

    setEmptyState(this.hud, false);
    setWalkDisabled(this.hud, false);
    reflectMode(this.hud, this.phase as ViewMode);
    return true;
  }

  /** Swap the drawn scene graph for a freshly adapted one. */
  private renderScene(adapted: AdaptedScene, preservePose: boolean): void {
    if (!this.renderer) return;

    if (preservePose && this.orbitCam) {
      this.preservedAzimuth = this.orbitCam.azimuthDegrees;
    }

    // Quality as #87's boolean resolver → the builder's level union
    // (absorbed inline parse, batch-#85 arbitration).
    const rebuilt = buildViewerScene(adapted, this.hiQuality ? 'high' : 'low');
    paintSky(rebuilt.scene);

    if (this.sceneRoot) {
      disposeObject(this.sceneRoot.lightGroup);
      disposeObject(this.sceneRoot.scene);
    }
    this.sceneRoot = rebuilt;
    // Re-apply the live sun settings onto the fresh lights (issue #121):
    // every rebuild recreates the light group, so the pose — and the
    // HIGH-tier shadow atlas (autoUpdate is OFF, #86) — must be rewired.
    this.paintSun();

    // Walls transparency (#120): fresh materials arrive opaque, so the
    // viewer-local slider state resets to 0 with them — keeps the UI
    // and the scene honest after every rebuild (no schema coupling).
    this.setWallsAlpha(0);

    // Interior fill lights (#152): the rebuild disposed the old pool with
    // the old light group, so stand a fresh fixed-size pool up against the
    // fresh spots. Fresh meshes also arrive VISIBLE, so the ceiling policy
    // must be re-applied to them (issue #152) — and the fill level carries
    // over from the sun settings that paintSun() just rewired.
    this.roomLightSpots = adapted.roomLights;
    this.rebuildInteriorLightPool(rebuilt.lightGroup);
    this.setCeilingsVisible(this.phase === 'walk');

    // Reframe/refoot whatever rig is live against the new geometry.
    if (this.orbitCam) this.orbitCam.reframe(adapted);
    if (this.walkCam) this.respawnIfNeeded(adapted);
  }

  /**
   * Respawn ONLY when the disc's current footing went illegal (its room
   * vanished or collisions swallowed it); otherwise HOLD the pose.
   */
  private respawnIfNeeded(adapted: AdaptedScene): void {
    const walk = this.walkCam;
    if (!walk) return;
    const plan = this.currentPlanSafe();
    if (!plan) return;
    const { x, y } = walk.discPosition;
    // Issue #147 CP2: judge legality on the walker's OWN storey — the
    // unbanded test called an upper-floor spot illegal whenever a
    // ground-floor slab shared its x/y footprint.
    if (isStandingLegal(x, y, adapted, walk.currentZ)) return;

    try {
      const spawn = solveSpawn(activeRooms(plan), adapted.collisions);
      this.replaceWalkRig(spawn.x, spawn.y, spawn.yaw);
    } catch (err) {
      if (err instanceof SpawnFailureError) {
        toast(this.hud, err.message, 'error');
      }
    }
  }

  /**
   * Fresh walk rig at a new spawn (old one torn down first).
   *
   * `elevation` (issue #147 CP2) seeds the rig's storey plane — omit it
   * for the recompile-respawn path, which returns the walker to the
   * adapted ground floor, and pass the target storey for a teleport.
   */
  private replaceWalkRig(
    x: number,
    y: number,
    yaw: number,
    elevation?: number,
  ): void {
    const adapted = this.lastGood?.adapted;
    if (!adapted) return;
    this.walkCam?.deactivate();
    const rig = new WalkRig(this.canvas, adapted, x, y, yaw, elevation);
    this.wireWalkRig(rig);
    this.walkCam = rig;
    this.rig = rig;
    // A replacement rig always starts OUTSIDE pointer lock (and the old
    // rig's unlock is not routed into the new one), so re-seat the walk
    // entry affordance: overlay up, reticle down.
    setWalkAffordances(this.hud, { overlay: true, reticle: false });
  }

  /* --------------------- roof affordances (issue #86) ---------------------- */

  /** Roof-slot meshes of the live scene (usually 0–1 merged meshes). */
  private roofMeshes(): Mesh[] {
    const roots = this.sceneRoot?.meshes ?? [];
    return roots.filter((m) => m.userData.slot === 'roof');
  }

  /**
   * HUD toggle handler: flip visibility on every roof-slot mesh. While
   * HIDDEN the autofade driver stays parked (manual intent wins until
   * reversed); re-showing restores full opacity immediately.
   */
  private setRoofsVisible(visible: boolean): void {
    this.roofsShown = visible;
    reflectRoofVisibility(this.hud, visible);
    for (const mesh of this.roofMeshes()) {
      mesh.visible = visible;
      const mat = mesh.material as MeshStandardMaterial;
      if (visible) {
        mat.opacity = 1;
        mat.transparent = false;
      }
    }
    if (!visible) this.roofFadeState = 'shown'; // park the driver
  }

  /**
   * Autofade driver (issue #86), pumped once per animation frame while
   * in WALK mode. Every Nth tick an upward ray from the walker's eye
   * tests ONLY the roof-slot meshes (~free: one merged mesh typical).
   * Hit ⇒ tween opacity down to the fade floor; miss ⇒ tween back to 1.
   * LOW quality skips the tween and SNAPS instead. The fade runs only
   * while the roofs are manually shown; a manually hidden roof stays
   * hidden.
   */
  private updateRoofAutofade(dt: number): void {
    if (this.phase !== 'walk' || !this.roofsShown) return;
    const roofs = this.roofMeshes();
    if (roofs.length === 0) return;
    const walk = this.walkCam;
    if (!walk) return;

    this.tickCounter += 1;
    if (this.tickCounter % ROOFS_RAYCAST_INTERVAL_TICKS === 0) {
      const eye = walk.eyePosition;
      const dir = new Vector3(0, 0, 1);
      const orig = new Vector3(eye.x, eye.y, eye.z);
      this.roofRaycaster.set(orig, dir);
      this.roofRaycaster.far = ROOFS_RAYCAST_FAR_M;
      const hits = this.roofRaycaster.intersectObjects(roofs, false);
      this.indoor = isIndoorFromRay(hits.length > 0 ? hits[0]!.distance : null);
    }

    const indoor = this.indoor;
    for (const mesh of roofs) {
      const mat = mesh.material as MeshStandardMaterial;
      const target = indoor ? ROOFS_FADE_MIN_OPACITY : 1;
      if (
        this.hiQuality === false ||
        this.roofFadeState === (indoor ? 'hidden' : 'shown')
      ) {
        // Snap: LOW quality, or the tween already finished — avoid
        // per-frame material writes at the extremes.
        if (mat.opacity !== target) {
          mat.opacity = target;
          mat.transparent = target < 1;
        }
        this.roofFadeState = indoor ? 'hidden' : 'shown';
        continue;
      }
      this.roofFadeState = 'fading';
      mat.transparent = true;
      mat.opacity = fadeStepOpacity(mat.opacity, indoor, {
        minOpacity: ROOFS_FADE_MIN_OPACITY,
        ratePerSecond: ROOFS_FADE_RATE_PER_S,
        dt,
      });
      // Tween reached its extreme: settle it (drops `transparent`
      // again on the outdoor side so opaque roofs keep draw order).
      if (indoor && mat.opacity <= ROOFS_FADE_MIN_OPACITY + 0.005) {
        mat.opacity = ROOFS_FADE_MIN_OPACITY;
        this.roofFadeState = 'hidden';
      } else if (!indoor && mat.opacity >= 0.995) {
        mat.opacity = 1;
        mat.transparent = false;
        this.roofFadeState = 'shown';
      }
    }
  }

  /* ------------------ walls transparency (issue #120) ---------------------- */

  /** Wall-slot meshes of the live scene (ONE merged mesh typical). */
  private wallMeshes(): Mesh[] {
    const roots = this.sceneRoot?.meshes ?? [];
    return roots.filter((m) => m.userData.slot === 'wall');
  }

  /**
   * Apply the normalized wallsAlpha (SH3D convention: 0 = opaque,
   * 1 = invisible) to every wall mesh; the threshold mapping lives in
   * the pure wallAlphaSettings export (unit-pinned). Also reflects the
   * state back onto the slider — one sync point for init/reset/drag.
   */
  private setWallsAlpha(alpha: number): void {
    this.wallsAlpha = alpha;
    reflectWallsAlpha(this.hud, alpha);
    const settings = wallAlphaSettings(alpha);
    for (const mesh of this.wallMeshes()) {
      mesh.visible = settings.visible;
      const mat = mesh.material as MeshStandardMaterial;
      mat.transparent = settings.transparent;
      mat.depthWrite = settings.depthWrite;
      mat.opacity = settings.opacity;
    }
  }

  /* ------------------- ceilings visibility (issue #152) -------------------- */

  /** Ceiling-slot meshes of the live scene (ONE merged mesh typically). */
  private ceilingMeshes(): Mesh[] {
    const roots = this.sceneRoot?.meshes ?? [];
    return roots.filter((m) => m.userData.slot === 'ceiling');
  }

  /**
   * Ceilings visibility policy (issue #152, sub-plan ruling): ceilings are
   * visible IFF the walk phase is live. The overview hides them
   * unconditionally — the issue's literal "hidden while roofs are hidden
   * or walls are translucent" clause folds into that, because the roof
   * planes (or the upper-storey floor slabs on roofs-free plans) already
   * act as the overview lid, so the dollhouse reading survives every
   * roofs/walls combination. Idempotent: safe after any rebuild.
   */
  private setCeilingsVisible(visible: boolean): void {
    for (const mesh of this.ceilingMeshes()) mesh.visible = visible;
  }

  /** First ceiling-slot mesh's live visibility (e2e probe, #152). */
  private ceilingProbe(): boolean | null {
    const mesh = this.ceilingMeshes()[0];
    return mesh ? mesh.visible : null;
  }

  /* -------------------- interior fill lights (issue #152) ------------------ */

  /**
   * Stand up the interior fill pool for a fresh scene build. Fixed size
   * for the life of the scene — a light-count change re-compiles every
   * material — so the pool holds at most MAX_INTERIOR_LIGHTS point lights
   * and each one is only ever MOVED afterwards. The lights ride in the
   * scene's light group, so the rebuild path disposes them with the rest
   * of the rig and this runs again for the new scene.
   */
  private rebuildInteriorLightPool(group: Group): void {
    this.interiorLights = [];
    this.interiorAssigned = 0;
    this.interiorAssignDirty = true;
    const count = Math.min(MAX_INTERIOR_LIGHTS, this.roomLightSpots.length);
    for (let i = 0; i < count; i += 1) {
      // Shadowless and soft: a dusk fill, not a second sun. Intensity
      // stays 0 until the first walk tick assigns it a room — and at noon
      // the pool stays parked, so the daylight shot is untouched.
      const light = new PointLight(INTERIOR_LIGHT_COLOR, 0);
      light.name = `interior-fill-${i}`;
      light.castShadow = false;
      group.add(light);
      this.interiorLights.push(light);
    }
  }

  /**
   * Fold the dusk blend into the pool level (issue #152). Zero from
   * sunrise to sundown: nothing lights up until the sky starts to dim, so
   * AC3's noon half reads the pre-change picture.
   */
  private applyInteriorFillLevel(duskBlend: number): void {
    this.interiorFillLevel = interiorFillIntensity(duskBlend);
    this.interiorAssignDirty = true;
  }

  /**
   * Interior fill pump (#152), one call per rendered frame. Walk-only and
   * throttled: overview (and daylight) parks the whole pool at zero, and
   * while walking the pool re-picks the nearest MAX_INTERIOR_LIGHTS rooms
   * every INTERIOR_LIGHTS_INTERVAL_TICKS frames. Selection is 3D, so an
   * upstairs walker never lights the room below it through the slab;
   * rooms beyond the cap keep the existing ambient dusk boost.
   */
  private updateInteriorLights(): void {
    const pool = this.interiorLights;
    if (pool.length === 0) return;

    if (this.phase !== 'walk' || this.interiorFillLevel <= 0) {
      // Parked: the dollhouse has no person-space interior, and the
      // daylight half of the day needs no fill.
      for (const light of pool) light.intensity = 0;
      this.interiorAssigned = 0;
      this.interiorAssignDirty = true;
      return;
    }

    this.interiorTick += 1;
    const due =
      this.interiorAssignDirty ||
      this.interiorTick % INTERIOR_LIGHTS_INTERVAL_TICKS === 0;
    if (!due) return;
    this.interiorAssignDirty = false;

    const eye = this.walkCam?.eyePosition ?? { x: 0, y: 0, z: 0 };
    const spots = selectNearestRoomLights(
      this.roomLightSpots,
      eye,
      pool.length,
    );
    for (let i = 0; i < pool.length; i += 1) {
      const light = pool[i]!;
      const spot = spots[i];
      if (spot === undefined) {
        light.intensity = 0;
        continue;
      }
      light.position.set(spot.x, spot.y, spot.z - INTERIOR_LIGHT_Z_OFFSET_M);
      light.intensity = this.interiorFillLevel;
    }
    this.interiorAssigned = spots.length;
  }

  /** Max live pool intensity (e2e probe, #152). */
  private interiorIntensity(): number {
    return this.interiorLights.reduce(
      (max, light) => Math.max(max, light.intensity),
      0,
    );
  }

  /* --------------------- sun affordances (issue #121) ---------------------- */

  /**
   * Funnel for every sun-settings change: normalise, store, reflect on
   * the HUD, then repaint the live scene.
   */
  private applySunSettings(patch: Partial<SunSettings>): void {
    this.sunSettings = normalizeSunSettings({ ...this.sunSettings, ...patch });
    reflectSunSettings(this.hud, this.sunSettings);
    this.paintSun();
  }

  /**
   * Write the current sun settings onto the live scene: light pose +
   * coupling curves, the sky-dome dusk blend, and (HIGH tier) a one-shot
   * shadow-atlas refresh — shadowMap.autoUpdate is OFF (#86), so
   * without needsUpdate the shadows would silently stay frozen while
   * the sun moves.
   */
  private paintSun(): void {
    const root = this.sceneRoot;
    // Empty-plan state (issue #148): no snapshot to read bounds off, but
    // the backdrop still owes the live sun a pose — fall back to the
    // neutral plot so the time/north sliders stay live while empty.
    const adapted = this.lastGood?.adapted ?? emptyAdaptedScene();
    if (!root) return;
    const state = applySunPose(root.lights, this.sunSettings, adapted.bounds);
    applySkyDusk(root.skyDome, state.duskBlend);
    // Interior fill lights (#152): the pool level rides the same dusk
    // blend the sky dome uses, so the fill fades in exactly as the sky
    // dims. Zero while the sun is up — the daylight shot stays untouched.
    this.applyInteriorFillLevel(state.duskBlend);
    if (this.hiQuality && this.renderer) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  /** Live sun-lighting probe for the e2e stats (issue #121). */
  private sunProbe(): {
    sunBearingDeg: number | null;
    sunElevationDeg: number | null;
    sunIntensity: number | null;
    ambientIntensity: number | null;
  } {
    const lights = this.sceneRoot?.lights;
    if (!lights) {
      return {
        sunBearingDeg: null,
        sunElevationDeg: null,
        sunIntensity: null,
        ambientIntensity: null,
      };
    }
    // Read the LIVE light pose (not the settings) — the geometry
    // assertion channel for the e2e AC2 probe.
    const sun = lights.sun;
    const dx = sun.position.x - sun.target.position.x;
    const dy = sun.position.y - sun.target.position.y;
    return {
      sunBearingDeg: normalizeBearingDeg((Math.atan2(dx, dy) * 180) / Math.PI),
      sunElevationDeg:
        (Math.atan2(sun.position.z, Math.hypot(dx, dy)) * 180) / Math.PI,
      sunIntensity: sun.intensity,
      ambientIntensity: lights.amb.intensity,
    };
  }
  /* --------------------------------- seats ---------------------------------- */

  private seatRig(mode: ViewMode): void {
    const adapted = this.lastGood?.adapted;
    if (!adapted) return;
    if (mode === 'walk') {
      this.walkCam = this.makeWalkRig(adapted);
      this.rig = this.walkCam;
    } else {
      this.orbitCam = this.makeOrbitRig(adapted);
      this.rig = this.orbitCam;
    }
  }

  /* --------------------------------- loop ----------------------------------- */

  private startLoop(): void {
    // Size the renderer ONCE to the canvas's laid-out CSS size, then keep
    // it synced on resize. Without this the drawing buffer stays at the
    // canvas default (300x150) and the picture stretches/blanks.
    if (this.renderer) {
      configureRenderer(this.renderer, this.hiQuality ? 'high' : 'low');
      this.resizeRenderer();
    }
    const ro = new ResizeObserver(() => this.resizeRenderer());
    ro.observe(this.canvas);
    this.disposers.push(() => ro.disconnect());

    const pump = (now: number): void => {
      if (this.disposed) return;
      if (this.lastFrameTime < 0) this.lastFrameTime = now;
      const dtMs = now - this.lastFrameTime;
      this.lastFrameTime = now;
      // Frame-cost sample (#87): AFTER the timestamp bookkeeping, BEFORE
      // the sim clamp — the probe measures render cadence, not physics.
      this.frameTimes.push(dtMs);
      if (this.frameTimes.length > 60) this.frameTimes.shift();
      const dt = Math.min(Math.max(dtMs, 0) / 1000, 0.1);

      this.rig?.update(dt);
      this.updateRoofAutofade(dt);
      this.updateInteriorLights();
      if (this.perf.panel && dtMs > 0) this.perf.record(dtMs);

      const camera = this.liveCamera();
      if (this.renderer && this.sceneRoot && camera) {
        // Atlas-refresh accounting (#121 fix round): mirrors
        // WebGLShadowMap.render's own gate, evaluated just before the
        // frame's render() — a set flag here means THIS frame
        // regenerates the atlas (the flag is consumed by that call).
        const shadowMap = this.renderer.shadowMap;
        if (
          shadowMap.enabled &&
          (shadowMap.autoUpdate || shadowMap.needsUpdate)
        ) {
          this.shadowAtlasGenerations += 1;
        }
        this.renderer.render(this.sceneRoot.scene, camera);
      }
      this.publishDebugSeams(camera);
      this.publishWalkerPose();
      // Issue #147 CP3: the room readout rides the same frame tick as the
      // pose publish (write-on-change; the DOM sees transitions only).
      this.updateRoomReadout();
      this.rafCancel = this.scheduleTick(pump) ?? null;
    };
    this.rafCancel = this.scheduleTick(pump) ?? null;
  }

  /** Sync the drawing buffer to the canvas's current CSS box. */
  private resizeRenderer(): void {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w > 0 && h > 0) {
      this.renderer.setSize(w, h, false);
      for (const rig of [this.orbitCam, this.walkCam]) {
        if (rig && 'camera' in rig) {
          const cam = rig.camera as PerspectiveCamera & { aspect?: number };
          if (cam.isPerspectiveCamera) {
            cam.aspect = w / h;
            cam.updateProjectionMatrix();
          }
        }
      }
    }
  }

  /**
   * Test/e2e seams (sanctioned by advisor decision: pkg 6 may rely on a
   * small camera getter). Published each frame; nulls when inactive.
   */
  private publishDebugSeams(camera: Camera | null): void {
    const w = window as unknown as Record<string, unknown>;
    if (camera) {
      const walk = this.walkCam;
      w.__viewerCam = () => {
        const fwd = new Vector3(0, 0, -1).applyQuaternion(
          camera.quaternion,
        );
        return {
          posX: camera.position.x,
          posY: camera.position.y,
          posZ: camera.position.z,
          eyeY: camera.position.z,
          fwdX: fwd.x,
          fwdY: fwd.y,
          fwdZ: fwd.z,
          // Walk diagnostics: plan-space disc + velocity (movement proof).
          ...(walk
            ? {
                discX: walk.discPosition.x,
                discY: walk.discPosition.y,
                velX: walk.velocity.x,
                velY: walk.velocity.y,
                locked: walk.locked,
              }
            : {}),
        };
      };
    }
    // TEST-ONLY steering seam (issue #27): face the walk rig at a
    // plan-space yaw (radians, CCW from +X). Guarded on walkCam so orbit
    // mode no-ops harmlessly — the e2e traversal spec drives this instead
    // of synthesizing mouse deltas (headless pointer lock is unreliable).
    w.__viewerYaw = (yaw: number): void => {
      this.walkCam?.setYaw(yaw);
    };
    w.__viewerStats = () => ({
      meshCount: this.countMeshes(),
      slotCount: this.sceneRoot?.meshes.length ?? 0,
      // Glass arrives as ONE merged bucket (draw-call budget); the
      // meaningful window-parity figure is the QUAD count.
      glassQuadCount: this.countSlotQuads('glass'),
      // Furniture ships as ONE merged mesh per material family (draw-call
      // budget); the plan-parity figure is the VOLUME count (8 verts each).
      furnitureVolumeCount: this.countPrefixVerts('furn-', 8),
      // Roof planes (pkg 8.1): triangles in the dedicated 'roof' slot —
      // the e2e parity figure for shed/gable presence (0 when absent).
      roofTriangleCount: this.countSlotTriangles('roof'),
      // Quality tier (#87): 'high' unless ?quality=low opted out.
      qualityLevel: this.hiQuality ? 'high' : 'low',
      // Populated slots carrying a procedural MAP (#87): the high-tier
      // texture probe — 0 on the low path (nothing uploads).
      texturedSlotCount: this.countMappedSlots(),
      // Median of the rolling frame-time window over the last 60
      // rendered frames (#87): robust-ish central tendency for the
      // low<high cost probe (median shrugs off GC spikes and
      // compositor hiccups).
      medianFrameMs: this.medianFrameMs(),
      // Glass/wall roughness probes (#87): glass must read GLOSSIER than
      // matte walls on BOTH tiers (e2e visual-gloss proxy — reading
      // live materials beats re-deriving constants in the spec).
      glassRoughness: this.firstSlotRoughness('glass'),
      wallRoughness: this.firstSlotRoughness('wall'),
      // Roof affordances (issue #86): live opacity + visibility of the
      // (merged) roof mesh — the e2e autofade/toggle probes. Null when
      // the plan carries no roof slot at all.
      roofOpacity: this.roofProbe()?.opacity ?? null,
      roofVisible: this.roofProbe()?.visible ?? null,
      // Walls transparency (issue #120): live opacity/visibility of the
      // (merged) wall mesh — the e2e dollhouse-slider probes. Null when
      // the plan carries no wall slot at all.
      wallOpacity: this.wallProbe()?.opacity ?? null,
      wallVisible: this.wallProbe()?.visible ?? null,
      // Ceilings policy probes (#152): how many ceiling-slot meshes the
      // build emitted, and the live visibility of the merged one (null
      // only when the plan carries no ceiling slot at all).
      ceilingMeshCount: this.ceilingMeshes().length,
      ceilingVisible: this.ceilingProbe(),
      // Interior fill probes (#152): the pool's live maximum intensity
      // (0 while parked — overview, and the whole daylight half of the
      // day) and how many rooms it currently lights (≤ MAX_INTERIOR_LIGHTS).
      interiorLightIntensity: this.interiorIntensity(),
      litRoomCount: this.interiorAssigned,
      // Geometry budget (#152 AC4): adapter triangles, straight off the
      // last accepted build. The fill-light work adds no geometry, so
      // this pin is what says the triangle count did not move.
      totalTriangleCount: this.lastGood?.adapted.triangleCount ?? 0,
      // Sun/time-of-day probes (#121): the LIVE directional-light pose
      // (bearing/elevation derived from position − target) plus the
      // current intensities — the AC1/AC2/AC3 e2e channel.
      ...this.sunProbe(),
      // Empty-plan state (issue #148): true while the sky/ground
      // backdrop + prompt stand in for the scene (fresh-profile probe).
      emptyState: this.emptyStateActive,
      // No plan composed (issue #148): applied LAST so the mask wins over
      // the live reads above while the backdrop stands in for a plan.
      ...(this.emptyStateActive ? EMPTY_VIEWER_STATS : {}),
      // Shadow-atlas generations (#121 fix round): without this, a
      // frozen refresh is only visible as a few-percent pixel delta —
      // far inside the screenshot noise. A deleted needsUpdate parks
      // this counter at its boot value across every change path.
      shadowAtlasGenerations: this.shadowAtlasGenerations,
      // Walk-nav probes (issue #147 CP5): the walker's ATTRIBUTED storey
      // and room readout — the programmatic twin of the HUD span, sharing
      // roomReadoutAt/attributeFloorIdx so the rule never forks. Null
      // room/floor when no walker is live.
      ...this.walkNavProbe(),
    });
  }

  /** First wall-slot mesh's observable state (e2e probe backing). */
  private wallProbe(): { opacity: number; visible: boolean } | null {
    const mesh = this.sceneRoot?.meshes.find(
      (m) => m.userData.slot === 'wall',
    );
    if (!mesh) return null;
    return {
      opacity: (mesh.material as MeshStandardMaterial).opacity,
      visible: mesh.visible,
    };
  }

  /** First roof-slot mesh's observable state (e2e probe backing). */
  private roofProbe(): { opacity: number; visible: boolean } | null {
    const mesh = this.sceneRoot?.meshes.find(
      (m) => m.userData.slot === 'roof',
    );
    if (!mesh) return null;
    return {
      opacity: (mesh.material as MeshStandardMaterial).opacity,
      visible: mesh.visible,
    };
  }

  /** Count triangles/6 within meshes whose userData.slot matches. */
  private countSlotQuads(slot: string): number {
    if (!this.sceneRoot) return 0;
    let quads = 0;
    this.sceneRoot.scene.traverse((obj) => {
      const mesh = obj as {
        isMesh?: boolean;
        userData?: { slot?: string };
        geometry?: { index?: { count: number } | null };
      };
      if (mesh.isMesh === true && mesh.userData?.slot === slot) {
        const idx = mesh.geometry?.index;
        if (idx) quads += idx.count / 6;
      }
    });
    return quads;
  }

  /** Count raw triangles within meshes whose userData.slot matches. */
  private countSlotTriangles(slot: string): number {
    if (!this.sceneRoot) return 0;
    let tris = 0;
    this.sceneRoot.scene.traverse((obj) => {
      const mesh = obj as {
        isMesh?: boolean;
        userData?: { slot?: string };
        geometry?: { index?: { count: number } | null };
      };
      if (mesh.isMesh === true && mesh.userData?.slot === slot) {
        const idx = mesh.geometry?.index;
        if (idx) tris += idx.count / 3;
      }
    });
    return tris;
  }

  /** Sum verts/stride across meshes whose userData.slot starts with prefix. */
  private countPrefixVerts(prefix: string, stride: number): number {
    if (!this.sceneRoot) return 0;
    let total = 0;
    this.sceneRoot.scene.traverse((obj) => {
      const mesh = obj as {
        isMesh?: boolean;
        userData?: { slot?: string };
        geometry?: { attributes?: { position?: { count: number } } };
      };
      if (mesh.isMesh === true && mesh.userData?.slot?.startsWith(prefix)) {
        const pos = mesh.geometry?.attributes?.position;
        if (pos) total += pos.count / stride;
      }
    });
    return total;
  }

  private countMeshes(): number {
    if (!this.sceneRoot) return 0;
    let n = 0;
    this.sceneRoot.scene.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh === true) n++;
    });
    return n;
  }

  /**
   * Populated slots whose material carries a procedural map (#87): the
   * high-tier texture probe. 0 on the low path — buildMaterial(true)
   * is the only place maps attach.
   */
  private countMappedSlots(): number {
    if (!this.sceneRoot) return 0;
    let n = 0;
    this.sceneRoot.scene.traverse((obj) => {
      const mesh = obj as {
        isMesh?: boolean;
        material?: { map?: unknown } | { map?: unknown }[];
      };
      if (mesh.isMesh !== true) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((m) => m && m.map)) n += 1;
    });
    return n;
  }

  /** Median of the rolling frame-time window (-1 before frames exist). */
  private medianFrameMs(): number {
    if (this.frameTimes.length === 0) return -1;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /** Roughness of the first mesh in a slot (-1 when the slot is absent). */
  private firstSlotRoughness(slot: string): number {
    if (!this.sceneRoot) return -1;
    let rough = -1;
    this.sceneRoot.scene.traverse((obj) => {
      const mesh = obj as {
        isMesh?: boolean;
        userData?: { slot?: string };
        material?: { roughness?: number };
      };
      if (
        rough < 0 &&
        mesh.isMesh === true &&
        mesh.userData?.slot === slot &&
        mesh.material &&
        typeof mesh.material.roughness === 'number'
      ) {
        rough = mesh.material.roughness;
      }
    });
    return rough;
  }

  private liveCamera(): Camera | null {
    if (this.walkCam) return this.walkCam.camera;
    if (this.orbitCam) return this.orbitCam.camera;
    return null;
  }

  /* -------------------------------- polling --------------------------------- */

  /** Self-rescheduling 250 ms debounced bridge poll. */
  private armDebouncePoll(): void {
    const cycle = (): void => {
      this.pollTimer = this.setTimeoutFn(() => {
        if (this.disposed) return;
        this.refreshAdaptation(false);
        cycle();
      }, RECOMPILE_DEBOUNCE_MS);
    };
    cycle();
    this.disposers.push(() => {
      if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    });
  }

  /* -------------------------------- dispose --------------------------------- */

  /** Full teardown: rig → RAF → timers/listeners → scene → HUD → GL. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rig?.deactivate();
    this.rafCancel?.();
    for (const off of this.disposers.splice(0, this.disposers.length)) off();
    if (this.sceneRoot) {
      disposeObject(this.sceneRoot.lightGroup);
      disposeObject(this.sceneRoot.scene);
      this.sceneRoot = null;
    }
    this.unbindToggle?.();
    this.unbindCollapse?.();
    this.unbindRoofToggle?.();
    this.unbindWallsAlpha?.();
    this.unbindSunTime?.();
    this.unbindSunNorth?.();
    this.perf.destroy();
    destroyHud(this.hud);
    this.renderer?.dispose();
    this.renderer = null;
  }
}

/* ------------------------------- helpers ------------------------------------ */

/**
 * Legal iff the disc point clears every collision volume it can touch.
 *
 * Pass the walker's FEET z (issue #147 CP2) to judge only the boxes
 * sharing his z band (activeCollisions, walkMode.ts) — on a two-storey
 * plan a ground-floor wall slab shares its x/y footprint with free
 * upper-storey air, and the unbanded test would call a perfectly legal
 * upstairs spot illegal. Callers with no storey context (legacy tests,
 * single-storey plans) omit z and keep the historical all-boxes rule,
 * which is what a plan with no z fences at all implies anyway.
 */
export function isStandingLegal(
  x: number,
  y: number,
  adapted: AdaptedScene,
  z?: number,
): boolean {
  const boxes =
    z === undefined ? adapted.collisions : activeCollisions(adapted, z);
  for (const box of boxes) {
    if (x > box.minX && x < box.maxX && y > box.minY && y < box.maxY) {
      return false;
    }
  }
  return true;
}

/** Material settings produced by the walls-transparency applier (#120). */
export interface WallAlphaSettings {
  visible: boolean;
  transparent: boolean;
  depthWrite: boolean;
  opacity: number;
}

/**
 * Map the normalized wallsAlpha (SH3D convention: 0 = opaque,
 * 1 = invisible) onto merged-wall material settings (issue #120): pure
 * and exported so the thresholds are unit-pinned.
 *
 *  - 0     : opaque fast path (transparent off, depth writes ON) — the
 *            same settle the roof autofade uses (#86).
 *  - (0,1) : glass-style transparent pass; opacity = 1 - alpha, depth
 *            writes OFF (the transparent pass sorts after opaque
 *            furniture/floors; coplanar wall overlaps are already
 *            deduped in the adapter — no intra-mesh z-fight).
 *  - >= 1  : fully invisible — the skipped draw removes the mesh's
 *            shadow contribution for free; parked on the opaque
 *            classification while skipped, opacity clamped to 0 so the
 *            published probe stays monotone.
 */
export function wallAlphaSettings(alpha: number): WallAlphaSettings {
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
  const opaque = a === 0;
  const invisible = a >= 1;
  return {
    visible: !invisible,
    transparent: !opaque && !invisible,
    depthWrite: opaque || invisible,
    opacity: 1 - a,
  };
}

/** Default rAF scheduler returning a canceller. */
function defaultSchedule(cb: (now: number) => void): () => void {
  const id = requestAnimationFrame(cb);
  return () => cancelAnimationFrame(id);
}

/** Make a WebGL renderer; null when the environment lacks a GL context. */
function makeRenderer(canvas: HTMLCanvasElement): WebGLRenderer | null {
  try {
    return new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }
}

/** Rooms lookup map for the adapter. */
function roomsById(
  plan: FloorplanData,
): Map<string, Room> {
  return new Map(flatRooms(plan).map((r) => [r.id, r]));
}

/**
 * Rooms of the ACTIVE storey (issue #76): the lowest floor, mirroring
 * the adapter's activeFloorElevation resolver. Walk spawning solves
 * within THESE rooms only — a bigger room upstairs must not strand the
 * walker on the wrong storey. (7.4 replaces this with the
 * user-selected floor.)
 */
function activeRooms(plan: FloorplanData): Room[] {
  return plan.floors[0]?.rooms ?? [];
}

/** Parse location.search for the perf flag (?perf=1). */
export function isPerfEnabled(search = window.location.search): boolean {
  // End-anchored like quality.ts's parser (issue #94): "?perf=10" is a
  // DIFFERENT parameter value and must not light the overlay.
  return /[?&]perf=1(?=&|$)/.test(search);
}
