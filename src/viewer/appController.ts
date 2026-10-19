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
  Raycaster,
  Vector3,
  WebGLRenderer,
  type Camera,
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
  onBindRoofToggle,
  onBindSunNorth,
  onBindSunTime,
  onBindToggle,
  onBindWallsAlpha,
  PerfOverlay,
  playFade,
  reflectMode,
  reflectRoofVisibility,
  reflectSunSettings,
  reflectWallsAlpha,
  setWalkAffordances,
  showHint,
  toast,
  type HudHandles,
} from './hud';
import { OrbitRig } from './orbitMode';
import { setMaxAnisotropy } from './materials';
import { isHighQuality } from './quality';
import {
  ROOFS_FADE_MIN_OPACITY,
  ROOFS_FADE_RATE_PER_S,
  ROOFS_RAYCAST_FAR_M,
  ROOFS_RAYCAST_INTERVAL_TICKS,
} from './renderConstants';
import { solveSpawn, SpawnFailureError } from './spawn';
import {
  applySkyDusk,
  applySunPose,
  buildViewerScene,
  configureRenderer,
  disposeObject,
  paintSky,
} from './sceneBuilder';
import {
  DEFAULT_SUN_SETTINGS,
  normalizeBearingDeg,
  normalizeSunSettings,
} from './sun';
import {
  RECOMPILE_DEBOUNCE_MS,
  type AdaptedScene,
  type CameraRig,
  type SunSettings,
  type ViewMode,
} from './types';
import { fadeStepOpacity, isIndoorFromRay, WalkRig } from './walkMode';

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

  /**
   * Quality tier resolved at boot (#87's quality.ts — absorbed #86's
   * inline parse per the batch-#85 arbitration); surfaces in
   * __viewerStats. HIGH default, hostile values fail open to HIGH.
   */
  private readonly hiQuality: boolean;
  private unbindRoofToggle: (() => void) | null = null;
  private unbindSunTime: (() => void) | null = null;
  private unbindSunNorth: (() => void) | null = null;

  /** Manual roof-visibility state (HUD toggle, issue #86). */
  private roofsShown = true;

  /** Walls-transparency slider (issue #120): unbind + normalized state. */
  private unbindWallsAlpha: (() => void) | null = null;
  private wallsAlpha = 0;

  /** Sun/time-of-day settings (issue #121); defaults = the noon perch. */
  private sunSettings: SunSettings = { ...DEFAULT_SUN_SETTINGS };

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
    this.unbindToggle = onBindToggle(
      this.hud,
      () => (this.phase === 'walk' ? 'walk' : 'overview'),
      (next) => this.requestMode(next),
    );
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
      // Issue #30: prompt for entry; reticle comes up on lock.
      setWalkAffordances(this.hud, { overlay: true, reticle: false });
      // The Walk-button click is a user gesture, so try to lock straight
      // away. If the browser defers/refuses, the promise throws (or the
      // call no-ops) and the overlay stays up — graceful fallback to the
      // existing canvas-click re-lock flow below.
      try {
        this.walkCam.requestLock();
      } catch {
        /* lock refused/deferred: overlay remains the entry affordance */
      }
    } else {
      this.orbitCam = this.makeOrbitRig(adapted);
      this.rig = this.orbitCam;
      this.phase = 'overview';
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
    rig.onUnlock(() => {
      // ESC (or any unlock) RETURNS TO OVERVIEW per issue #6's AC
      // ("ESC returns to orbit, lock released cleanly"). The prior
      // auto-relock behavior trapped the user in walk mode.
      setWalkAffordances(this.hud, { overlay: false, reticle: false });
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
      const spawn = solveSpawn(activeRooms(plan), adapted.collisions);
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
    const adapted = this.lastGood?.adapted;
    if (!root || !adapted) return;
    const state = applySunPose(root.lights, this.sunSettings, adapted.bounds);
    applySkyDusk(root.skyDome, state.duskBlend);
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
      // Sun/time-of-day probes (#121): the LIVE directional-light pose
      // (bearing/elevation derived from position − target) plus the
      // current intensities — the AC1/AC2/AC3 e2e channel.
      ...this.sunProbe(),
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
