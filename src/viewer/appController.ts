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

import { PerspectiveCamera, Vector3, WebGLRenderer, type Camera } from 'three';

import { compilePlan, parseValidatedPlan } from '../geom';
import type { FloorplanData, Room } from '../shared/schema';
import { adaptScene, sceneHasNaN } from './adapter';
import {
  buildHud,
  destroyHud,
  onBindToggle,
  PerfOverlay,
  playFade,
  reflectMode,
  showHint,
  toast,
  type HudHandles,
} from './hud';
import { OrbitRig } from './orbitMode';
import { solveSpawn, SpawnFailureError } from './spawn';
import {
  buildViewerScene,
  configureRenderer,
  disposeObject,
  paintSky,
} from './sceneBuilder';
import {
  RECOMPILE_DEBOUNCE_MS,
  type AdaptedScene,
  type CameraRig,
  type ViewMode,
} from './types';
import { WalkRig } from './walkMode';

/** Shape of the pkg-2 bridge hung off window.__casaplaza. */
export interface DataBridge {
  getData(): FloorplanData;
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
  private readonly disposers: Array<() => void> = [];

  public constructor(opts: ControllerOpts) {
    this.canvas = opts.canvas;
    this.pane = opts.pane;
    this.bridgeSupplier = opts.bridge;
    this.scheduleTick = opts.scheduleTick ?? defaultSchedule;
    this.setTimeoutFn = opts.setTimeoutFn ?? window.setTimeout.bind(window);
    this.perf = new PerfOverlay(isPerfEnabled());
  }

  /** Boot: renderer, HUD, initial adaptation, RAF loop, poll timer. */
  public start(): void {
    this.renderer = makeRenderer(this.canvas);

    this.hud = buildHud(this.pane);
    this.perf.mount(this.hud);
    this.unbindToggle = onBindToggle(
      this.hud,
      () => (this.phase === 'walk' ? 'walk' : 'overview'),
      (next) => this.requestMode(next),
    );

    this.refreshAdaptation(true);
    reflectMode(this.hud, 'overview');
    this.seatRig('overview');
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

  private async swapModes(next: ViewMode): Promise<void> {
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
      showHint(this.hud, 'Click to walk');
    } else {
      this.orbitCam = this.makeOrbitRig(adapted);
      this.rig = this.orbitCam;
      this.phase = 'overview';
      showHint(this.hud, '');
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
        spawn = solveSpawn(plan.rooms, adapted.collisions);
      } catch (err) {
        if (err instanceof SpawnFailureError) {
          toast(this.hud, err.message, 'error');
        } else {
          throw err;
        }
      }
    }
    const rig = new WalkRig(this.canvas, adapted, spawn.x, spawn.y, spawn.yaw);
    rig.onUnlock(() => {
      // ESC (or any unlock) RETURNS TO OVERVIEW per issue #6's AC
      // ("ESC returns to orbit, lock released cleanly"). The prior
      // auto-relock behavior trapped the user in walk mode.
      void this.requestMode('overview');
    });

    // Canvas click re-attempt locking (cooldown-gated inside the rig).
    const onClick = (): void => {
      if (this.phase === 'walk' && !rig.locked) rig.requestLock();
    };
    this.canvas.addEventListener('click', onClick);
    this.disposers.push(() =>
      this.canvas.removeEventListener('click', onClick),
    );
    return rig;
  }

  /* ------------------------------- adaptation ------------------------------- */

  /** Latest plan from the bridge (undefined when unavailable/dirty). */
  private currentPlanSafe(): FloorplanData | undefined {
    const bridge = this.bridgeSupplier();
    if (!bridge) return undefined;
    try {
      return bridge.getData();
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
    if (!initial && sig === this.lastAcceptedSignature) {
      return; // unchanged since the last accepted compile
    }

    try {
      const validated = parseValidatedPlan(plan);
      const compiled = compilePlan(validated);
      const adapted = adaptScene(compiled, roomsById(validated));

      if (sceneHasNaN(adapted.buckets.map((b) => b.positions))) {
        throw new Error('compiled scene contains NaN coordinates');
      }

      const changedShape = this.lastGood !== null;
      this.lastGood = { adapted, planSignature: sig };
      this.lastAcceptedSignature = sig;
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

  /** Swap the drawn scene graph for a freshly adapted one. */
  private renderScene(adapted: AdaptedScene, preservePose: boolean): void {
    if (!this.renderer) return;

    if (preservePose && this.orbitCam) {
      this.preservedAzimuth = this.orbitCam.azimuthDegrees;
    }

    const rebuilt = buildViewerScene(adapted);
    paintSky(rebuilt.scene);

    if (this.sceneRoot) {
      disposeObject(this.sceneRoot.lightGroup);
      disposeObject(this.sceneRoot.scene);
    }
    this.sceneRoot = rebuilt;

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
    if (isStandingLegal(x, y, adapted)) return;

    try {
      const spawn = solveSpawn(plan.rooms, adapted.collisions);
      this.replaceWalkRig(spawn.x, spawn.y, spawn.yaw);
    } catch (err) {
      if (err instanceof SpawnFailureError) {
        toast(this.hud, err.message, 'error');
      }
    }
  }

  /** Fresh walk rig at a new spawn (old one torn down first). */
  private replaceWalkRig(x: number, y: number, yaw: number): void {
    const adapted = this.lastGood?.adapted;
    if (!adapted) return;
    this.walkCam?.deactivate();
    const rig = new WalkRig(this.canvas, adapted, x, y, yaw);
    this.walkCam = rig;
    this.rig = rig;
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
      configureRenderer(this.renderer);
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
      const dt = Math.min(Math.max(dtMs, 0) / 1000, 0.1);

      this.rig?.update(dt);
      if (this.perf.panel && dtMs > 0) this.perf.record(dtMs);

      const camera = this.liveCamera();
      if (this.renderer && this.sceneRoot && camera) {
        this.renderer.render(this.sceneRoot.scene, camera);
      }
      this.publishDebugSeams(camera);
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
    w.__viewerStats = () => ({
      meshCount: this.countMeshes(),
      slotCount: this.sceneRoot?.meshes.length ?? 0,
      furnitureMeshCount: 0, // adapter emits collisions only, no furniture meshes
    });
  }

  private countMeshes(): number {
    if (!this.sceneRoot) return 0;
    let n = 0;
    this.sceneRoot.scene.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh === true) n++;
    });
    return n;
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
    this.perf.destroy();
    destroyHud(this.hud);
    this.renderer?.dispose();
    this.renderer = null;
  }
}

/* ------------------------------- helpers ------------------------------------ */

/** Legal iff the disc point clears every collision volume. */
export function isStandingLegal(
  x: number,
  y: number,
  adapted: AdaptedScene,
): boolean {
  for (const box of adapted.collisions) {
    if (x > box.minX && x < box.maxX && y > box.minY && y < box.maxY) {
      return false;
    }
  }
  return true;
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
  return new Map(plan.rooms.map((r) => [r.id, r]));
}

/** Parse location.search for the perf flag (?perf=1). */
export function isPerfEnabled(search = window.location.search): boolean {
  return /[?&]perf=1/.test(search);
}
