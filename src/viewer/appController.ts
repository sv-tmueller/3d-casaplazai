/**
 * App controller (issue #6; reworked for the workspace by #178): the
 * SINGLE OWNER of the 3D runtime — requestAnimationFrame loop, the
 * OVERVIEW⇄WALK FSM, validate-before-render with LAST-GOOD retention (an
 * INVALID intermediate keeps rendering the previous good scene and raises
 * a toast — never a crash), camera-pose preservation across recompiles,
 * respawn only when the disc's footing goes illegal, and the full dispose
 * chain.
 *
 * Issue #178 (design §8.4 / §8.5):
 *  - the plan arrives through a PlanSource subscription on the editor
 *    store (debounced; the 250 ms JSON poll over window.__casaplaza is
 *    gone). Reducers mutate the plan in place, so the signature decides
 *    and the compiler works on a snapshot (gap G7); rebuilds wait while a
 *    2D gesture is in flight;
 *  - every piece of UI goes to a ViewerUiSink the shell implements (the
 *    HUD is retired, gap G9); the 3D settings (roofs, ceilings, walls
 *    transparency, quality, sun) come from AppState via applySettings and
 *    survive rebuilds (gap G5);
 *  - the viewer only ticks while its view is shown (gap G6); leaving Walk
 *    parks the walker pose instead of retracting it (gap G4); Esc releases
 *    the pointer and stays in Walk (lead ruling C3).
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
import { OrbitRig } from './orbitMode';
import { setMaxAnisotropy } from './materials';
import { PerfOverlay } from './perf';
import type { QualityLevel } from './quality';
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
import type { ViewerSettings, ViewerUiSink } from './uiSink';
import { publishPose, type WalkerPose } from '../shared/walkerLink';
import { attributeFloorIdx, roomReadoutAt } from './walkNav';
import {
  activeCollisions,
  fadeStepOpacity,
  isIndoorFromRay,
  WalkRig,
} from './walkMode';

/**
 * Where the plan comes from (issue #178): the editor store in the
 * workspace, a fake in unit tests. `current()` may return the plan
 * object the store mutates in place.
 */
export interface PlanSource {
  current(): unknown;
  subscribe(listener: () => void): () => void;
}

/** Runtime knobs injected for testability (defaults = production). */
export interface ControllerOpts {
  readonly source: PlanSource;
  /** Canvas hosting the GL context. */
  readonly canvas: HTMLCanvasElement;
  /** UI reports (toasts, walk overlay, empty card, fade). */
  readonly sink: ViewerUiSink;
  /** Initial 3D settings (AppState.viewer). */
  readonly settings: ViewerSettings;
  /** True while a 2D gesture is in flight (rebuilds wait). */
  readonly gestureInProgress?: () => boolean;
  /** rAF-like scheduler seam (unit tests inject manual pumps). */
  readonly scheduleTick?: (cb: (now: number) => void) => (() => void) | void;
  /** Timer seam for the debounce (tests advance manually). */
  readonly setTimeoutFn?: typeof window.setTimeout;
}

/** Options for a mode request. */
export interface ModeRequest {
  /**
   * Try to lock the pointer straight away (a user gesture: the Walk
   * segment or key 3). Seated walks (place camera, go to room) pass false
   * — no requestPointerLock until the user clicks the 3D view (#147).
   */
  autoLock?: boolean;
  /** Spawn from this pose when it is legal (G4 / G15). */
  pose?: WalkerPose | null;
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
 * any plan was composed. Live-only channels (quality, frame median, sun
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

const WALK_HINT = 'WASD to move · Esc to release';

/**
 * The 3D engine. Instantiate once per page; call dispose() on teardown.
 */
export class ViewerApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly source: PlanSource;
  private readonly sink: ViewerUiSink;
  private readonly gestureGate: () => boolean;
  private readonly scheduleTick: (
    cb: (now: number) => void,
  ) => (() => void) | void;
  private readonly setTimeoutFn: typeof window.setTimeout;

  private renderer: WebGLRenderer | null = null;
  private sceneRoot: ReturnType<typeof buildViewerScene> | null = null;
  private perf: PerfOverlay;

  /** Live 3D settings (AppState.viewer, gap G5). */
  private current: ViewerSettings;
  /** Quality level the current scene was built at. */
  private quality: QualityLevel;

  /** Manual roof-visibility state (View tab toggle, issue #86). */
  private roofsShown = true;

  /** Empty-plan state (issue #148). */
  private emptyStateActive = false;

  /** Canvas-click listener of the LIVE walk rig (issue #147 CP2). */
  private walkClickDisposer: (() => void) | null = null;

  /** Newest plan that passed validation (issue #147 CP3). */
  private lastGoodPlan: FloorplanData | null = null;

  /** Last value sent to the room readout (write-on-change). */
  private lastRoomReadout: string | null | undefined = undefined;

  /** Walls transparency (issue #120), normalised. */
  private wallsAlpha = 0;

  /** Interior fill lights (issue #152). */
  private roomLightSpots: readonly RoomLightSpot[] = [];
  private interiorLights: PointLight[] = [];
  private interiorFillLevel = 0;
  private interiorAssigned = 0;
  private interiorAssignDirty = true;
  private interiorTick = 0;

  /** Sun/time-of-day settings (issue #121). */
  private sunSettings: SunSettings;

  /** Shadow-atlas generation counter (issue #121 fix round). */
  private shadowAtlasGenerations = 0;

  /** Roof autofade machinery (issue #86). */
  private readonly roofRaycaster = new Raycaster();
  private roofFadeState: 'shown' | 'fading' | 'hidden' = 'shown';
  private tickCounter = 0;
  private indoor = false;

  private phase: Phase = 'overview';
  private rig: CameraRig | null = null;
  private orbitCam: OrbitRig | null = null;
  private walkCam: WalkRig | null = null;
  private preservedAzimuth: number | undefined;

  private lastGood: GoodSnapshot | null = null;
  private lastAcceptedSignature: string | null = null;
  private accepted = 0;

  /** Store-driven rebuild debounce (gap G7). */
  private rebuildTimer: ReturnType<Window['setTimeout']> | null = null;

  /** Gap G6: the view is shown (the loop ticks only while true). */
  private active = false;
  private rafCancel: (() => void) | null = null;
  private disposed = false;
  private lastFrameTime = -1;
  private readonly frameTimes: number[] = [];
  private readonly disposers: Array<() => void> = [];

  public constructor(opts: ControllerOpts) {
    this.canvas = opts.canvas;
    this.source = opts.source;
    this.sink = opts.sink;
    this.gestureGate = opts.gestureInProgress ?? (() => false);
    this.scheduleTick = opts.scheduleTick ?? defaultSchedule;
    this.setTimeoutFn = opts.setTimeoutFn ?? window.setTimeout.bind(window);
    this.perf = new PerfOverlay(isPerfEnabled());
    this.current = { ...opts.settings, sun: { ...opts.settings.sun } };
    this.quality = opts.settings.quality;
    this.roofsShown = opts.settings.roofs;
    this.wallsAlpha = opts.settings.wallsAlpha;
    this.sunSettings = normalizeSunSettings(opts.settings.sun);
  }

  /** Boot: renderer, initial adaptation, store subscription, seams. */
  public start(): void {
    this.renderer = makeRenderer(this.canvas);
    // Wire the renderer's real anisotropy ceiling into the texture
    // cache (#87). Harmless no-op without a GL context.
    if (this.renderer) {
      setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
      configureRenderer(this.renderer, this.quality);
    }
    this.perf.mount(this.sink.perfHost);

    // Issue #178 (G7): the editor store drives rebuilds.
    const off = this.source.subscribe(() => this.onPlanChanged());
    this.disposers.push(off);
    this.disposers.push(() => {
      if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    });

    this.refreshAdaptation(true);
    this.seatRig('overview');

    // Issue #30: on lock the entry prompt gives way to the reticle; the
    // unlock side is the rig's onUnlock path (wireWalkRig).
    const onLockChange = (): void => {
      if (this.phase !== 'walk' || !this.walkCam) return;
      if (this.walkCam.locked) {
        this.sink.walkAffordances({ overlay: false, reticle: true });
        this.sink.hint(WALK_HINT);
      }
    };
    document.addEventListener('pointerlockchange', onLockChange);
    this.disposers.push(() => document.removeEventListener('pointerlockchange', onLockChange));

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resizeRenderer()) : null;
    ro?.observe(this.canvas);
    this.disposers.push(() => ro?.disconnect());

    // Publish the debug seams before the first frame so a probe arriving
    // early never observes them missing.
    this.publishDebugSeams(this.liveCamera());
  }

  /* ---------------------------- workspace API ------------------------------ */

  /**
   * Show / hide the 3D view (gap G6). Hidden: the loop stops ticking (the
   * scene keeps rebuilding from store changes so a switch is instant)
   * and a live walk ends at once, parking the pose (G4). Shown: resize,
   * reframe the orbit rig against the real canvas, start ticking.
   */
  public setActive(active: boolean): void {
    if (this.disposed || active === this.active) return;
    this.active = active;
    if (!active) {
      this.rafCancel?.();
      this.rafCancel = null;
      if (this.phase === 'walk' || this.walkCam) this.leaveWalkNow();
      return;
    }
    this.resizeRenderer();
    const adapted = this.lastGood?.adapted ?? (this.emptyStateActive ? emptyAdaptedScene() : null);
    if (adapted && this.orbitCam) this.orbitCam.reframe(adapted);
    this.lastFrameTime = -1;
    this.startLoop();
  }

  /** Mode request (Walk segment, keys 2/3, place camera). */
  public requestMode(next: ViewMode, opts: ModeRequest = {}): boolean {
    if (this.disposed || this.phase === 'transition') return false;
    // Issue #148: nothing to walk in while the plan has no rooms.
    if (next === 'walk' && this.lastGood === null) return false;
    if (next === this.viewMode()) {
      // Already walking: a pose request re-seats the walker there.
      if (next === 'walk' && opts.pose) this.seatWalkerAt(opts.pose);
      return true;
    }
    void this.swapModes(next, opts.autoLock ?? true, opts.pose ?? null);
    return true;
  }

  /** Something can be walked in and no swap is under way. */
  public canWalk(): boolean {
    return !this.disposed && this.lastGood !== null && this.phase !== 'transition';
  }

  /** A mode transition is in flight. */
  public busy(): boolean {
    return this.phase === 'transition';
  }

  public mode(): ViewMode {
    return this.viewMode();
  }

  /** Live 3D settings (copy). */
  public settings(): ViewerSettings {
    return { ...this.current, sun: { ...this.current.sun } };
  }

  /** Accepted compiles since boot (observability seam). */
  public rebuildCount(): number {
    return this.accepted;
  }

  /** Test/observability seam: signature of the currently ACCEPTED plan. */
  public currentSignature(): string | null {
    return this.lastAcceptedSignature;
  }

  /** AppState.viewer changed (View tab). */
  public applySettings(next: ViewerSettings): void {
    const prev = this.current;
    this.current = { ...next, sun: { ...next.sun } };
    if (next.quality !== this.quality) {
      this.quality = next.quality;
      if (this.renderer) configureRenderer(this.renderer, this.quality);
      const adapted = this.lastGood?.adapted ?? (this.emptyStateActive ? emptyAdaptedScene() : null);
      if (adapted) this.renderScene(adapted, true);
    }
    if (next.roofs !== prev.roofs) this.setRoofsVisible(next.roofs);
    if (next.wallsAlpha !== prev.wallsAlpha) this.setWallsAlpha(next.wallsAlpha);
    if (next.ceilings !== prev.ceilings) this.applyCeilings();
    if (next.sun.timeHours !== prev.sun.timeHours || next.sun.northOffsetDeg !== prev.sun.northOffsetDeg) {
      this.applySunSettings(next.sun);
    }
  }

  /**
   * Go-to-room (the room pill's menu, issue #147 CP3): enters Walk seated
   * when needed, then teleports into that room on its own storey.
   */
  public async gotoRoom(roomId: string): Promise<void> {
    if (this.disposed || this.phase === 'transition') return;
    if (this.phase !== 'walk') {
      if (this.lastGood === null) return;
      await this.swapModes('walk', false, null);
    }
    if (this.disposed || this.phase !== 'walk' || !this.walkCam) return;
    this.gotoRoomNow(roomId);
  }

  /* ---------------------------------- FSM ---------------------------------- */

  private viewMode(): ViewMode {
    return this.phase === 'walk' ? 'walk' : 'overview';
  }

  /** Swap rigs across the fade. */
  private async swapModes(next: ViewMode, autoLock: boolean, pose: WalkerPose | null): Promise<void> {
    this.phase = 'transition';
    this.sink.availabilityChanged();
    await this.sink.fade();
    if (this.disposed) return;

    // Pose preservation across the seam (orbit azimuth survives walks).
    if (this.orbitCam && next === 'walk') {
      this.preservedAzimuth = this.orbitCam.azimuthDegrees;
    }
    const leavingWalk = this.walkCam !== null;
    if (leavingWalk) this.parkPose();

    this.rig?.deactivate();
    this.walkCam = null;
    this.orbitCam = null;
    this.rig = null;

    const adapted = this.lastGood?.adapted ?? null;
    if (!adapted) {
      this.phase = 'overview';
      this.seatRig('overview');
      this.sink.modeChanged('overview');
      this.sink.availabilityChanged();
      return;
    }

    if (next === 'walk') {
      this.walkCam = this.makeWalkRig(adapted, pose);
      this.rig = this.walkCam;
      this.phase = 'walk';
      this.applyCeilings();
      this.sink.hint('');
      this.sink.walkAffordances({ overlay: true, reticle: false });
      if (autoLock) {
        try {
          this.walkCam.requestLock();
        } catch {
          /* lock refused/deferred: the prompt remains the entry affordance */
        }
      }
    } else {
      this.orbitCam = this.makeOrbitRig(adapted);
      this.rig = this.orbitCam;
      this.phase = 'overview';
      this.applyCeilings();
      this.resetRoofFade();
      this.sink.hint('');
      this.sink.walkAffordances({ overlay: false, reticle: false });
    }
    this.updateRoomReadout();
    this.sink.modeChanged(this.viewMode());
    this.sink.availabilityChanged();
  }

  /** Leave walk without a fade (the view was hidden). */
  private leaveWalkNow(): void {
    if (this.walkCam) this.parkPose();
    this.rig?.deactivate();
    this.walkCam = null;
    this.orbitCam = null;
    this.rig = null;
    this.phase = 'overview';
    const adapted = this.lastGood?.adapted ?? (this.emptyStateActive ? emptyAdaptedScene() : null);
    if (adapted) {
      this.orbitCam = this.makeOrbitRig(adapted);
      this.rig = this.orbitCam;
    }
    this.applyCeilings();
    this.resetRoofFade();
    this.sink.hint('');
    this.sink.walkAffordances({ overlay: false, reticle: false });
    this.updateRoomReadout();
    this.sink.modeChanged('overview');
  }

  /** Exiting walk lifts any roof autofade (overview sees full roofs). */
  private resetRoofFade(): void {
    for (const mesh of this.roofMeshes()) {
      const mat = mesh.material as MeshStandardMaterial;
      mat.opacity = 1;
      mat.transparent = false;
    }
    this.roofFadeState = 'shown';
    this.indoor = false;
  }

  private makeOrbitRig(adapted: AdaptedScene): OrbitRig {
    return new OrbitRig(this.canvas, adapted, this.preservedAzimuth);
  }

  /**
   * Fabricate a walk rig. Gap G4: spawn from the given pose when its
   * storey exists (floorIdx clamped) and its footing is legal; otherwise
   * solve a spawn on the ground storey as before.
   */
  private makeWalkRig(adapted: AdaptedScene, pose: WalkerPose | null = null): WalkRig {
    const plan = this.currentPlanSafe();
    if (pose && plan && plan.floors.length > 0) {
      const idx = Math.min(Math.max(Math.round(pose.floorIdx), 0), plan.floors.length - 1);
      const elevation = plan.floors[idx]?.elevation ?? adapted.activeFloorElevation;
      if (Number.isFinite(pose.x) && Number.isFinite(pose.y) && isStandingLegal(pose.x, pose.y, adapted, elevation)) {
        const rig = new WalkRig(this.canvas, adapted, pose.x, pose.y, pose.yawRad, elevation);
        this.wireWalkRig(rig);
        return rig;
      }
    }
    let spawn = { x: 0, y: 0, yaw: 0 };
    if (plan) {
      try {
        // Solve ONLY within the active storey's rooms (issue #76).
        spawn = solveSpawn(activeRooms(plan), adapted.collisions);
      } catch (err) {
        if (err instanceof SpawnFailureError) this.sink.toast(err.message, 'error');
        else throw err;
      }
    }
    const rig = new WalkRig(this.canvas, adapted, spawn.x, spawn.y, spawn.yaw);
    this.wireWalkRig(rig);
    return rig;
  }

  /**
   * Walk-rig wiring shared by every rig (fresh, respawned, teleported).
   * Lead ruling C3: an unlock (Esc) releases the pointer and STAYS in the
   * Walk view with the "Click to walk" prompt; leaving Walk happens only
   * through the view segment or keys 1 and 2.
   */
  private wireWalkRig(rig: WalkRig): void {
    rig.onUnlock(() => {
      if (this.walkCam !== rig) return;
      this.sink.walkAffordances({ overlay: true, reticle: false });
      this.sink.hint('');
    });
    this.walkClickDisposer?.();
    const onClick = (): void => {
      if (this.phase === 'walk' && !rig.locked) rig.requestLock();
    };
    this.canvas.addEventListener('click', onClick);
    this.walkClickDisposer = () => this.canvas.removeEventListener('click', onClick);
  }

  /** Re-seat a live walker at a pose (place camera while walking). */
  private seatWalkerAt(pose: WalkerPose): void {
    const adapted = this.lastGood?.adapted;
    if (!adapted) return;
    this.walkCam?.deactivate();
    const rig = this.makeWalkRig(adapted, pose);
    this.walkCam = rig;
    this.rig = rig;
    this.sink.walkAffordances({ overlay: true, reticle: false });
  }

  /**
   * Go-to-room teleport: resolve the room's OWN storey, solve a spawn
   * inside that room and seat the walker there.
   */
  private gotoRoomNow(roomId: string): void {
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
      this.sink.toast('That room is not in the current plan.', 'error');
      return;
    }
    try {
      const pose = solveSpawnInRoom(room, activeCollisions(adapted, floor.elevation));
      this.replaceWalkRig(pose.x, pose.y, pose.yaw, floor.elevation);
    } catch (err) {
      if (err instanceof SpawnFailureError) this.sink.toast(err.message, 'error');
      else throw err;
    }
  }

  /* --------------------------- walker telemetry ---------------------------- */

  /** The live walker's pose (null when not walking). */
  private livePose(): WalkerPose | null {
    return this.phase === 'walk' ? this.rigPose() : null;
  }

  /** The walk rig's pose in plan space, whatever the phase. */
  private rigPose(): WalkerPose | null {
    const walk = this.walkCam;
    if (!walk) return null;
    const plan = this.currentPlanSafe();
    const disc = walk.discPosition;
    return {
      x: disc.x,
      y: disc.y,
      yawRad: walk.headingYaw,
      floorIdx: plan ? attributeFloorIdx(plan.floors, walk.currentZ) : 0,
      mode: 'walk',
    };
  }

  /** Publish the walker pose to the Plan glyph every walk frame. */
  private publishWalkerPose(): void {
    const pose = this.livePose();
    if (pose) publishPose(pose);
  }

  /** Gap G4: leaving walk keeps the last pose, marked as parked. */
  private parkPose(): void {
    const pose = this.rigPose();
    if (pose) publishPose({ ...pose, mode: 'overview' });
  }

  /** Room readout (issue #147 CP3): write-on-change, null off walk. */
  private updateRoomReadout(): void {
    const walk = this.walkCam;
    let text: string | null = null;
    if (this.phase === 'walk' && walk && this.lastGoodPlan) {
      const disc = walk.discPosition;
      text = roomReadoutAt(this.lastGoodPlan, disc.x, disc.y, walk.currentZ);
    }
    if (text === this.lastRoomReadout) return;
    this.lastRoomReadout = text;
    this.sink.roomReadout(text);
  }

  /** Programmatic twin of the room readout for `__viewerStats`. */
  private walkNavProbe(): { roomName: string | null; floorIdx: number | null } {
    const walk = this.walkCam;
    const plan = this.lastGoodPlan;
    if (this.phase !== 'walk' || !walk || !plan) return { roomName: null, floorIdx: null };
    const disc = walk.discPosition;
    return {
      roomName: roomReadoutAt(plan, disc.x, disc.y, walk.currentZ),
      floorIdx: attributeFloorIdx(plan.floors, walk.currentZ),
    };
  }

  /* ------------------------------- adaptation ------------------------------- */

  /** Store notify → debounced rebuild; waits out 2D gestures (G7). */
  private onPlanChanged(): void {
    if (this.disposed) return;
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    const fire = (): void => {
      this.rebuildTimer = null;
      if (this.disposed) return;
      if (this.gestureGate()) {
        this.rebuildTimer = this.setTimeoutFn(fire, RECOMPILE_DEBOUNCE_MS);
        return;
      }
      this.refreshAdaptation(false);
    };
    this.rebuildTimer = this.setTimeoutFn(fire, RECOMPILE_DEBOUNCE_MS);
  }

  /** Latest plan, migrated to the current schema (undefined if unusable). */
  private currentPlanSafe(): FloorplanData | undefined {
    try {
      const mig = migrate(this.source.current());
      return mig.ok && mig.data ? mig.data : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Validate-before-render: compile + adapt a SNAPSHOT of the freshest
   * plan; on ANY failure keep the last GOOD adaptation (toast) and never
   * propagate upward.
   */
  private refreshAdaptation(initial: boolean): void {
    const live = this.currentPlanSafe();
    if (!live) return;
    const sig = planSignature(live);

    // Issue #148: a room-less plan is the empty state, not an error.
    if (isEmptyPlan(live)) {
      this.enterEmptyState();
      return;
    }
    if (!initial && sig === this.lastAcceptedSignature) return;

    // Gap G7: reducers mutate the store's plan in place — compile a copy.
    const plan = JSON.parse(sig) as FloorplanData;
    try {
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
      this.exitEmptyState();
      this.lastGood = { adapted, planSignature: sig };
      this.lastAcceptedSignature = sig;
      this.accepted += 1;
      this.sink.dismissErrors();
      if (this.phase === 'overview' && !this.orbitCam) this.seatRig('overview');
      this.lastGoodPlan = validated;
      this.sink.roomList(
        validated.floors.map((floor) => ({
          name: floor.name,
          rooms: floor.rooms.map((room) => ({ id: room.id, name: room.name })),
        })),
      );
      this.renderScene(adapted, changedShape);
      this.sink.availabilityChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.lastGood === null) this.sink.toast(`Cannot render plan: ${msg}`, 'error');
      else this.sink.toast('Recompile failed — keeping last good view', 'error');
    }
  }

  /**
   * Enter the empty-plan state (issue #148): the backdrop scene, the 3D
   * empty card, no walk. Idempotent.
   */
  private enterEmptyState(): void {
    if (this.emptyStateActive) return;
    this.emptyStateActive = true;
    if (this.walkCam) this.parkPose();
    this.lastGood = null;
    this.lastAcceptedSignature = null;
    this.rig?.deactivate();
    this.walkCam = null;
    this.orbitCam = null;
    this.rig = null;
    const wasWalk = this.phase === 'walk';
    this.phase = 'overview';
    this.roofFadeState = 'shown';
    this.indoor = false;
    this.sink.emptyState(true);
    this.sink.walkAffordances({ overlay: false, reticle: false });
    this.sink.hint('');
    this.sink.roomList([]);
    this.updateRoomReadout();
    if (wasWalk) this.sink.modeChanged('overview');
    const empty = emptyAdaptedScene();
    this.renderScene(empty, false);
    this.orbitCam = this.makeOrbitRig(empty);
    this.rig = this.orbitCam;
    this.sink.availabilityChanged();
  }

  /** Leave the empty state (issue #148); true when it was active. */
  private exitEmptyState(): boolean {
    if (!this.emptyStateActive) return false;
    this.emptyStateActive = false;
    this.rig?.deactivate();
    this.orbitCam = null;
    this.walkCam = null;
    this.rig = null;
    this.phase = 'overview';
    this.preservedAzimuth = undefined;
    this.sink.emptyState(false);
    return true;
  }

  /** Swap the drawn scene graph for a freshly adapted one. */
  private renderScene(adapted: AdaptedScene, preservePose: boolean): void {
    if (!this.renderer) return;
    if (preservePose && this.orbitCam) this.preservedAzimuth = this.orbitCam.azimuthDegrees;

    // buildViewerScene(adapted, quality, forceLowMaterials) — the quality
    // level now comes from AppState (View tab), seeded by ?quality=.
    const rebuilt = buildViewerScene(adapted, this.quality);
    paintSky(rebuilt.scene);
    if (this.sceneRoot) {
      disposeObject(this.sceneRoot.lightGroup);
      disposeObject(this.sceneRoot.scene);
    }
    this.sceneRoot = rebuilt;
    // Every rebuild recreates the light group: rewire the sun (#121).
    this.paintSun();
    // Gap G5: fresh materials arrive opaque and visible — re-apply the
    // View tab's walls transparency and roofs state, not a reset.
    this.setWallsAlpha(this.wallsAlpha);
    this.setRoofsVisible(this.roofsShown);
    // Interior fill pool (#152) for the fresh scene.
    this.roomLightSpots = adapted.roomLights;
    this.rebuildInteriorLightPool(rebuilt.lightGroup);
    this.applyCeilings();
    // Reframe/refoot whatever rig is live against the new geometry.
    if (this.orbitCam) this.orbitCam.reframe(adapted);
    if (this.walkCam) this.respawnIfNeeded(adapted);
  }

  /** Respawn ONLY when the disc's footing went illegal. */
  private respawnIfNeeded(adapted: AdaptedScene): void {
    const walk = this.walkCam;
    if (!walk) return;
    const plan = this.currentPlanSafe();
    if (!plan) return;
    const { x, y } = walk.discPosition;
    if (isStandingLegal(x, y, adapted, walk.currentZ)) return;
    try {
      const spawn = solveSpawn(activeRooms(plan), adapted.collisions);
      this.replaceWalkRig(spawn.x, spawn.y, spawn.yaw);
    } catch (err) {
      if (err instanceof SpawnFailureError) this.sink.toast(err.message, 'error');
    }
  }

  /** Fresh walk rig at a new spawn (old one torn down first). */
  private replaceWalkRig(x: number, y: number, yaw: number, elevation?: number): void {
    const adapted = this.lastGood?.adapted;
    if (!adapted) return;
    this.walkCam?.deactivate();
    const rig = new WalkRig(this.canvas, adapted, x, y, yaw, elevation);
    this.wireWalkRig(rig);
    this.walkCam = rig;
    this.rig = rig;
    // A replacement rig starts OUTSIDE pointer lock.
    this.sink.walkAffordances({ overlay: true, reticle: false });
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
        this.quality === 'low' ||
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
   * the pure wallAlphaSettings export (unit-pinned). The View tab owns
   * the slider; rebuilds re-apply the value (issue #178, G5).
   */
  private setWallsAlpha(alpha: number): void {
    this.wallsAlpha = alpha;
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

  /**
   * Issue #178: the View tab's Ceilings segment. 'auto' keeps the #152
   * policy (visible iff walking); 'on' / 'off' force it either way.
   */
  private applyCeilings(): void {
    const mode = this.current.ceilings;
    this.setCeilingsVisible(mode === 'on' || (mode === 'auto' && this.phase === 'walk'));
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
    if (this.quality === 'high' && this.renderer) {
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

  /** Gap G6: the pump runs only while the 3D view is shown. */
  private startLoop(): void {
    if (this.rafCancel !== null || !this.active) return;
    const pump = (now: number): void => {
      this.rafCancel = null;
      if (this.disposed || !this.active) return;
      if (this.lastFrameTime < 0) this.lastFrameTime = now;
      const dtMs = now - this.lastFrameTime;
      this.lastFrameTime = now;
      // Frame-cost sample (#87): render cadence, not physics.
      this.frameTimes.push(dtMs);
      if (this.frameTimes.length > 60) this.frameTimes.shift();
      const dt = Math.min(Math.max(dtMs, 0) / 1000, 0.1);

      this.rig?.update(dt);
      this.updateRoofAutofade(dt);
      this.updateInteriorLights();
      if (this.perf.panel && dtMs > 0) this.perf.record(dtMs);

      const camera = this.liveCamera();
      if (this.renderer && this.sceneRoot && camera) {
        // Atlas-refresh accounting (#121 fix round).
        const shadowMap = this.renderer.shadowMap;
        if (shadowMap.enabled && (shadowMap.autoUpdate || shadowMap.needsUpdate)) {
          this.shadowAtlasGenerations += 1;
        }
        this.renderer.render(this.sceneRoot.scene, camera);
      }
      this.publishDebugSeams(camera);
      this.publishWalkerPose();
      this.updateRoomReadout();
      this.rafCancel = this.scheduleTick(pump) ?? (() => {});
    };
    this.rafCancel = this.scheduleTick(pump) ?? (() => {});
  }

  /** Sync the drawing buffer to the canvas's current CSS box. */
  private resizeRenderer(): void {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w > 0 && h > 0) {
      this.renderer.setSize(w, h, false);
      // Issue #178 (G6): an orbit rig seated while the canvas was hidden
      // took a fallback aspect; keep its frustum in step with the canvas.
      if (this.orbitCam) {
        const ortho = this.orbitCam.camera;
        const half = ortho.top;
        ortho.left = -half * (w / h);
        ortho.right = half * (w / h);
        ortho.updateProjectionMatrix();
      }
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
      qualityLevel: this.quality,
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

  /* -------------------------------- dispose --------------------------------- */

  /** Full teardown: rig → RAF → timers/listeners → scene → GL. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.walkCam) this.parkPose();
    this.rig?.deactivate();
    this.walkClickDisposer?.();
    this.rafCancel?.();
    this.rafCancel = null;
    for (const off of this.disposers.splice(0, this.disposers.length)) off();
    if (this.sceneRoot) {
      disposeObject(this.sceneRoot.lightGroup);
      disposeObject(this.sceneRoot.scene);
      this.sceneRoot = null;
    }
    this.perf.destroy();
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
