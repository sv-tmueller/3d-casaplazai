/**
 * Walk rig (issue #6): pointer-locked mouse-look plus physics-driven
 * locomotion. Key intents feed a smoothed acceleration which
 * integrates through `moveDiscStepped` (player-radius-expanded AABBs
 * from the adapter).
 *
 * AXIS CONVENTION (bug-history note): the scene is AUTHORED Z-UP
 * (floors [x, y, 0], walls extruded on +z) — the same convention the
 * orbit overview rig already uses (ortho camera hovers at z=120
 * looking down). three.js's stock PointerLockControls hardcodes a
 * Y-up euler ('YXZ' pitch on camera.rotation.x), which fights a Z-up
 * camera: after the eye-height fix the view stared at the floor /
 * spun wildly. We therefore keep PLC-style POINTER-LOCK plumbing
 * (lock / unlock / cooldown UX) but roll our OWN Z-up look math:
 *   yaw   = rotation about world +Z (mouse X)
 *   pitch = rotation about the camera-local right axis (mouse Y)
 * composed as quaternion multiply — no euler order traps.
 *
 * Unlock handling: ESC (or any unlock) fires the pointerlockchange
 * event, reported to the controller ONCE per episode; a short
 * cooldown then suppresses accidental instant re-locks while the
 * 'Click to walk' affordance invites the user back in.
 */

import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

import { moveDiscStepped } from './collision';
import {
  EYE_HEIGHT,
  MOVE_ACCEL_ALPHA,
  MOVE_SPEED,
  SPRINT_FACTOR,
  VIEWER_PLAYER_RADIUS,
} from './types';
import type { AdaptedScene, CameraRig, StairWalkSurface, ViewMode } from './types';

/** Mouse sensitivity: radians of yaw/pitch per CSS pixel. */
const LOOK_SENSITIVITY = 0.0024;

/** Pitch limits for mouse-look (±85° feels right indoors). */
export const CAM_PITCH_LIMIT_RAD = (85 * Math.PI) / 180;

/** Re-lock suppression window after an unlock episode, ms. */
export const RELOCK_COOLDOWN_MS = 1000;

/** Movement intent bindings (event.code values). */
const KEYS_FORWARD = ['KeyW', 'ArrowUp'];
const KEYS_BACK = ['KeyS', 'ArrowDown'];
const KEYS_LEFT = ['KeyA', 'ArrowLeft'];
const KEYS_RIGHT = ['KeyD', 'ArrowRight'];

/** Held-shift sprint binding. */
const KEYS_SPRINT = 'ShiftLeft';

/** All codes the rig reacts to (preventDefault candidates). */
const HANDLED_CODES = new Set([
  ...KEYS_FORWARD,
  ...KEYS_BACK,
  ...KEYS_LEFT,
  ...KEYS_RIGHT,
  KEYS_SPRINT,
]);

/** Smoothed-acceleration response rate (per-second exp constant). */
const ACCEL_RESPONSE = MOVE_ACCEL_ALPHA;

/** Deceleration relaxes somewhat softer than accel engages. */
const DECEL_DAMP = 0.82;

/** Deadzone (m/s) below which the smoothed velocity snaps to zero. */
const VELOCITY_SNAP = 0.01;

/** Clamp for pathological frame spikes (tab-switch resume), seconds. */
const MAX_FRAME_DT = 0.1;

/** One unlocked-pointer episode reported to the controller. */
export type UnlockListener = () => void;

/**
 * Indoor predicate (issue #86, kept PURE for unit tests): the walker
 * counts as under cover iff the upward eye ray met a roof plane at a
 * STRICTLY POSITIVE distance (null = the ray escaped to the sky).
 */
export function isIndoorFromRay(distanceToRoof: number | null): boolean {
  return distanceToRoof !== null && distanceToRoof > 0;
}

/**
 * One exponential-tween step of the roof autofade opacity (issue #86,
 * PURE for unit tests): decays toward the fade floor while indoors and
 * rises back toward 1 outdoors. LOW quality never calls this — it
 * snaps straight to the target instead.
 */
export function fadeStepOpacity(
  current: number,
  indoor: boolean,
  params: { minOpacity: number; ratePerSecond: number; dt: number },
): number {
  const target = indoor ? params.minOpacity : 1;
  const blend = 1 - Math.exp(-params.ratePerSecond * params.dt);
  return current + (target - current) * blend;
}

/** Scratch vectors/quaternions reused per frame (allocation discipline). */
const FWD_SCRATCH = new Vector3();
const Q_YAW_SCRATCH = new Quaternion();
const Q_PITCH_SCRATCH = new Quaternion();
const AXIS_Z = new Vector3(0, 0, 1);
const LOCAL_RIGHT = new Vector3(1, 0, 0);

/**
 * Boxes fencing the walker's CURRENT z band (issue #76, made per-frame
 * by issue #80): a box qualifies when its z band overlaps the walker's
 * body band [floorZ, floorZ + EYE_HEIGHT]. A ground-storey walker
 * standing beneath an upstairs wall shares no z range with it and walks
 * freely; mid-stair the band slides continuously, handing fencing
 * from the departure storey's boxes to the arrival storey's. Boxes
 * lacking z fences are storey-less (legacy data) and always qualify.
 */
export function activeCollisions(
  adapted: Pick<AdaptedScene, 'collisions' | 'activeFloorElevation'>,
  floorZ: number = adapted.activeFloorElevation,
): AdaptedScene['collisions'] {
  const lo = floorZ;
  const hi = lo + EYE_HEIGHT;
  return adapted.collisions.filter((box) => {
    if (box.minZ === undefined || box.maxZ === undefined) return true;
    return box.maxZ > lo && box.minZ < hi;
  });
}

/* ---------------- stair grounding (issue #80) --------------------------- */

/** Max instantaneous STEP-UP the resolver accepts, meters. */
const STEP_UP_MAX = 0.35;

/** Fall speed when the ground drops away (walked into a stairwell), m/s. */
const FALL_SPEED = 5;

/** Inside test for a CCW convex quad (stair rects), boundary-inclusive. */
function pointInQuad(
  quad: readonly (readonly [number, number])[],
  x: number,
  y: number,
): boolean {
  const EPS = 1e-9;
  for (let i = 0; i < quad.length; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    if (!a || !b) return false;
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross < -EPS) return false;
  }
  return true;
}

/**
 * Per-frame grounding resolver (issue #80): the walking z under a plan
 * point, given the walker's current z. Candidate surfaces:
 *   - every storey plane the plan offers (lowest floor + each stair's
 *     departure/arrival elevations);
 *   - each stair's RAMP: z = zLower + clamp(progress) · rise while the
 *     point lies inside the stair's LANDING-HOLE rect (footprint +
 *     one-tread extension; the ramp spans the extension with progress
 *     clamped to 1 so cresting onto the arrival plane is seamless).
 * The ARRIVAL plane is EXCLUDED inside its stair's hole rect (the slab
 * is literally holed there) — walking into the stairwell from the
 * upper storey therefore drops onto the treads instead of hovering.
 * Among candidates with z <= curZ + STEP_UP_MAX (reachable without a
 * jump), the HIGHEST wins; none ⇒ the lowest floor (void fallback).
 */
export function resolveGroundZ(
  x: number,
  y: number,
  curZ: number,
  baseFloorZ: number,
  stairs: readonly StairWalkSurface[],
): number {
  // Distinct storey planes: lowest floor + every stair endpoint. A
  // storey without a stair never needs a plane (unreachable by walk).
  const planes = new Set<number>([baseFloorZ]);
  for (const s of stairs) {
    planes.add(s.zLower);
    planes.add(s.zLower + s.rise);
  }

  let best: number | null = null;
  const reachable = (z: number): boolean => z <= curZ + STEP_UP_MAX;

  for (const z of planes) {
    // Holed arrival planes do not exist over their stairwell.
    const holed = stairs.some(
      (s) =>
        Math.abs(z - (s.zLower + s.rise)) <= 1e-3 &&
        pointInQuad(s.hole, x, y),
    );
    if (holed) continue;
    if (!reachable(z)) continue;
    if (best === null || z > best) best = z;
  }

  for (const s of stairs) {
    // Ramp candidate: active across the whole hole rect (footprint +
    // one-tread landing extension), progress clamped to [0, 1] so the
    // extension sits level with the arrival plane.
    if (!pointInQuad(s.hole, x, y)) continue;
    const along = (x - s.ax) * s.ux + (y - s.ay) * s.uy;
    const progress = Math.max(0, Math.min(1, along / s.run));
    const z = s.zLower + progress * s.rise;
    if (!reachable(z)) continue;
    if (best === null || z > best) best = z;
  }

  return best ?? baseFloorZ;
}

/** Aspect ratio of a canvas, safe against zero-sized elements. */
function aspectOf(canvas: HTMLCanvasElement): number {
  const w = canvas.clientWidth || canvas.offsetWidth;
  const h = canvas.clientHeight || canvas.offsetHeight;
  return w > 0 && h > 0 ? w / h : 4 / 3;
}

/**
 * Lay the camera FLAT in the Z-up world and aim it along a plan-space
 * yaw. A stock three.js camera looks along its local −Z; in a Z-up
 * world "level gaze" means local −Z lies IN the XY plane and local +Y
 * points UP (+Z world). Recipe: rotate −90° about local X (tips the
 * forward from "down" to "north"), then rotate about WORLD Z by the
 * yaw. Premultiplication applies the world-Z rotation OUTSIDE the
 * tipping rotation — the correct order.
 */
function seedYaw(camera: PerspectiveCamera, yawRad: number): void {
  // Tip +90° about local X: forward (0,0,−1) → +Y (north), camera-up
  // (0,1,0) → +Z (world up — the −90° variant pointed up DOWN, flipping
  // the image vertically: ceiling at the bottom of the screen).
  const layFlat = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    Math.PI / 2,
  );
  // Positive plan yaw = CCW from +X (east). North = yaw π/2, so spinning
  // CLOCKWISE from north by (π/2 − yaw) lands on the yaw direction:
  // equivalently rotate about world Z by (yaw − π/2).
  const spin = new Quaternion().setFromAxisAngle(AXIS_Z, yawRad - Math.PI / 2);
  camera.quaternion.copy(spin.multiply(layFlat));
}

/**
 * Walk-mode camera rig. Owns a perspective camera seated at
 * (discX, discY, EYE_HEIGHT) in Z-up world coords; the disc slides in
 * PLAN space under the collision resolver and is lifted back into
 * world space each frame.
 */
export class WalkRig implements CameraRig {
  public readonly mode: ViewMode = 'walk';

  public readonly camera: PerspectiveCamera;

  /**
   * Pointer-lock surface shim. Stock PointerLockControls couples its
   * euler math with locking; we need only the locking. This minimal
   * adapter exposes lock()/unlock()/isLocked/event wiring directly on
   * the canvas, so the rest of the app keeps speaking the same verbs.
   */
  public readonly controls: {
    lock(): void;
    unlock(): void;
    readonly isLocked: boolean;
  };

  /** Plan-space disc position (meters). */
  private posX: number;
  private posY: number;

  /**
   * Current walking-surface z, meters (issue #80). Formerly the
   * READ-ONLY activeFloorElevation (issue #76); now seeded at spawn
   * (lowest floor) and re-resolved EVERY FRAME by resolveGroundZ:
   * inside a stair's hole rect the walker rides the ramp
   * zLower + clamp(progress)·rise, otherwise the highest reachable
   * storey plane. Falls (ground below curZ) integrate downward at
   * FALL_SPEED until grounded — walking into a stairwell from the
   * upper storey lands on the treads.
   */
  private curZ: number;

  /** Stair surfaces for the grounding resolver ([] = stair-free plan). */
  private readonly stairs: readonly StairWalkSurface[];

  /** Lowest floor's elevation (resolver fallback + spawn plane). */
  private readonly baseFloorZ: number;

  /** Smoothed plan-space velocity (m/s). */
  private velX = 0;
  private velY = 0;

  /** Live key-intent state. */
  private fwd = false;
  private back = false;
  private left = false;
  private right = false;
  private sprint = false;

  private readonly collisions: AdaptedScene['collisions'];
  private readonly disposers: Array<() => void> = [];
  private unlockListeners: UnlockListener[] = [];

  /** Epoch gate suppressing re-lock attempts during cooldown. */
  private relockBlockedUntil = 0;

  /**
   * @param canvas pointer-lock surface + listener host
   * @param adapted adapted scene (collisions filtered to the active
   *   storey's z band — see activeCollisions)
   * @param spawnX plan-space spawn/disc x
   * @param spawnY plan-space spawn/disc y
   * @param yawRad initial facing yaw around plan +Z (radians)
   */
  public constructor(
    canvas: HTMLCanvasElement,
    adapted: AdaptedScene,
    spawnX: number,
    spawnY: number,
    yawRad: number,
  ) {
    this.posX = spawnX;
    this.posY = spawnY;
    this.baseFloorZ = adapted.activeFloorElevation;
    this.curZ = this.baseFloorZ;
    this.stairs = adapted.stairs;
    this.collisions = adapted.collisions;

    this.camera = new PerspectiveCamera(60, aspectOf(canvas), 0.05, 400);
    this.applyDiscToCamera();
    seedYaw(this.camera, yawRad);

    const ownerDoc = canvas.ownerDocument;
    this.controls = {
      // Swallow async lock denials: the Walk-button/canvas-click flows
      // treat refusal as "stay unlocked, keep the overlay up" (graceful
      // fallback). Sync throws propagate to the caller's try/catch.
      lock: () => {
        try {
          const req: unknown = canvas.requestPointerLock();
          if (
            typeof req === 'object' &&
            req !== null &&
            typeof (req as { catch?: unknown }).catch === 'function'
          ) {
            (req as { catch: (onErr: () => void) => void }).catch(() => {
              /* async denial: stay unlocked, overlay stays up */
            });
          }
        } catch {
          /* sync refusal: let the caller's try/catch apply the fallback */
          throw new Error('pointer-lock request refused synchronously');
        }
      },
      unlock: () => {
        if (ownerDoc.pointerLockElement === canvas) ownerDoc.exitPointerLock();
      },
      get isLocked(): boolean {
        return ownerDoc.pointerLockElement === canvas;
      },
    };

    const onPointerLockChange = (): void => {
      if (!this.controls.isLocked) this.notifyUnlock();
    };
    ownerDoc.addEventListener('pointerlockchange', onPointerLockChange);
    this.disposers.push(() =>
      ownerDoc.removeEventListener('pointerlockchange', onPointerLockChange),
    );

    const onMouseMove = (ev: MouseEvent): void => {
      if (!this.controls.isLocked) return;
      this.applyLook(ev.movementX, ev.movementY);
    };
    ownerDoc.addEventListener('mousemove', onMouseMove);
    this.disposers.push(() =>
      ownerDoc.removeEventListener('mousemove', onMouseMove),
    );

    this.bindKeys();
  }

  /** Register a callback fired whenever pointer lock drops. */
  public onUnlock(listener: UnlockListener): void {
    this.unlockListeners.push(listener);
  }

  private notifyUnlock(): void {
    this.relockBlockedUntil = performance.now() + RELOCK_COOLDOWN_MS;
    for (const fn of this.unlockListeners) fn();
  }

  /** Attempt a pointer lock (subject to the re-lock cooldown). */
  public requestLock(): void {
    if (performance.now() < this.relockBlockedUntil) return;
    this.controls.lock();
  }

  /** Current plan-space disc position (diagnostic/e2e seam). */
  public get discPosition(): { x: number; y: number } {
    return { x: this.posX, y: this.posY };
  }

  /**
   * Current world-space EYE position (issue #86 autofade seam): disc
   * x/y lifted to the per-frame grounding z + EYE_HEIGHT. Fresh copy —
   * callers may mutate without corrupting rig state.
   */
  public get eyePosition(): { x: number; y: number; z: number } {
    return { x: this.posX, y: this.posY, z: this.curZ + EYE_HEIGHT };
  }

  /** Current smoothed plan-space velocity (diagnostic/e2e seam). */
  public get velocity(): { x: number; y: number } {
    return { x: this.velX, y: this.velY };
  }

  /** True while pointer lock is engaged. */
  public get locked(): boolean {
    return this.controls.isLocked;
  }

  /**
   * TEST-ONLY: face the rig along a plan-space yaw (radians, CCW from
   * +X, so north = π/2) by seeding the camera quaternion. Exists solely
   * for e2e steering (issue #27): headless pointer lock is unreliable,
   * so the spec sets yaw directly instead of synthesizing mouse deltas.
   * No gameplay path calls this — runtime yaw is owned by applyLook.
   * The camera is laid flat and reseated at eye height every frame, so
   * the seeded yaw persists across update() ticks.
   */
  public setYaw(yawRad: number): void {
    seedYaw(this.camera, yawRad);
  }

  /**
   * Seat the world camera from the plan-space disc pose.
   * WORLD IS Z-UP (floors at z=curZ, ceilings at curZ+wallHeight):
   * the eye rides at curZ + EYE_HEIGHT (issue #80 — curZ is the
   * per-frame grounding: storey plane or stair ramp). Position is reset
   * every frame; the LOOK orientation is owned by the quaternion
   * (applyLook/seedYaw), never clobbered here.
   */
  private applyDiscToCamera(): void {
    this.camera.position.set(
      this.posX,
      this.posY,
      this.curZ + EYE_HEIGHT,
    );
  }

  /** Z-up mouse-look: yaw about world +Z, pitch about local right. */
  private applyLook(dxPx: number, dyPx: number): void {
    const cam = this.camera;

    // Yaw about the WORLD up axis (premultiply = outside current pose).
    Q_YAW_SCRATCH.setFromAxisAngle(AXIS_Z, -dxPx * LOOK_SENSITIVITY);
    cam.quaternion.premultiply(Q_YAW_SCRATCH);

    // Pitch about the camera's local right axis (= local +X, since the
    // camera was laid flat: local X stays in the ground plane).
    const forward = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const horizLen = Math.hypot(forward.x, forward.y);
    const curPitch = Math.atan2(forward.z, horizLen);
    const wanted = curPitch - dyPx * LOOK_SENSITIVITY;
    const applied = Math.max(
      -CAM_PITCH_LIMIT_RAD,
      Math.min(CAM_PITCH_LIMIT_RAD, wanted),
    ) - curPitch;
    if (Math.abs(applied) > 1e-9) {
      Q_PITCH_SCRATCH.setFromAxisAngle(LOCAL_RIGHT, applied);
      cam.quaternion.multiply(Q_PITCH_SCRATCH);
    }
  }

  /** Bind WASD/arrow intents + shift sprint; released keys decay out. */
  private bindKeys(): void {
    // Issue #134: a focused HUD control (walls-transparency or sun
    // sliders) must KEEP its arrow keys — the walker must not race the
    // slider it sits under. Same INPUT-target guard the Tab path
    // (appController.onTabKey) already honours; without it every
    // HANDLED_CODE preventDefault swallowed the keystroke before the
    // native range input could act on it.
    const typingIntoField = (ev: KeyboardEvent): boolean => {
      const tgt = ev.target as HTMLElement | null;
      return Boolean(
        tgt &&
          (tgt.tagName === 'INPUT' ||
            tgt.tagName === 'TEXTAREA' ||
            tgt.isContentEditable),
      );
    };
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (!HANDLED_CODES.has(ev.code)) return;
      if (typingIntoField(ev)) return; // #134: let the control have it
      ev.preventDefault();
      this.handleKey(ev.code, true);
    };
    const onKeyUp = (ev: KeyboardEvent): void => {
      if (!HANDLED_CODES.has(ev.code)) return;
      if (typingIntoField(ev)) return; // symmetric with keydown (#134)
      this.handleKey(ev.code, false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  private handleKey(code: string, down: boolean): void {
    if (KEYS_FORWARD.includes(code)) this.fwd = down;
    else if (KEYS_BACK.includes(code)) this.back = down;
    else if (KEYS_LEFT.includes(code)) this.left = down;
    else if (KEYS_RIGHT.includes(code)) this.right = down;
    else if (code === KEYS_SPRINT) this.sprint = down;
  }

  /**
   * Integrate one frame: intent → target velocity → exponentially
   * smoothed acceleration → swept collision stepping in plan space →
   * camera re-seat at eye height.
   */
  public update(dtRaw: number): void {
    const dt = Math.min(dtRaw, MAX_FRAME_DT);

    // Desired heading in PLAN space derives from the camera's world
    // forward projected onto the ground plane.
    const forward = this.camera.getWorldDirection(FWD_SCRATCH);
    const flen = Math.hypot(forward.x, forward.y);
    const normFx = flen > 1e-6 ? forward.x / flen : 0;
    const normFy = flen > 1e-6 ? forward.y / flen : 0;
    // Right = forward rotated +90° (clockwise seen from above, since
    // plan yaw is CCW-positive): north (0,1) → east (1,0).
    const rx = normFy;
    const ry = -normFx;

    let ix = 0;
    let iy = 0;
    if (this.fwd) {
      ix += normFx;
      iy += normFy;
    }
    if (this.back) {
      ix -= normFx;
      iy -= normFy;
    }
    if (this.right) {
      ix += rx;
      iy += ry;
    }
    if (this.left) {
      ix -= rx;
      iy -= ry;
    }
    const ilen = Math.hypot(ix, iy);
    if (ilen > 1e-6) {
      ix /= ilen;
      iy /= ilen;
    }

    const speedCap = MOVE_SPEED * (this.sprint ? SPRINT_FACTOR : 1);
    const moving = ilen > 1e-6;
    const tx = moving ? ix * speedCap : 0;
    const ty = moving ? iy * speedCap : 0;

    // Exponential smoothing toward the target velocity (α per second).
    const rate = moving ? ACCEL_RESPONSE : ACCEL_RESPONSE * DECEL_DAMP;
    const blend = 1 - Math.exp(-rate * dt);
    this.velX += (tx - this.velX) * blend;
    this.velY += (ty - this.velY) * blend;
    if (
      Math.abs(this.velX) < VELOCITY_SNAP &&
      Math.abs(this.velY) < VELOCITY_SNAP
    ) {
      this.velX = 0;
      this.velY = 0;
    }

    if (this.velX !== 0 || this.velY !== 0) {
      // Fence with the boxes overlapping the walker's CURRENT z band
      // (issue #80): mid-stair the band slides, handing fencing from
      // the departure storey's walls to the arrival storey's. Filtering
      // per frame costs little (≤ few hundred boxes).
      const fenced = activeCollisions(
        { collisions: this.collisions, activeFloorElevation: this.baseFloorZ },
        this.curZ,
      );
      const out = moveDiscStepped(
        this.posX,
        this.posY,
        this.velX,
        this.velY,
        dt,
        fenced,
        VIEWER_PLAYER_RADIUS,
      );
      this.posX = out.x;
      this.posY = out.y;
      // Adopt resolver-zeroed components so pressing into a wall does
      // not accumulate jitter across frames.
      this.velX = out.vx;
      this.velY = out.vy;
    }

    // ---- Per-frame grounding (issue #80) ---------------------------
    // Resolve the surface under the (moved) disc; adopt it when it is
    // at/above the feet (step-up onto treads/planes), otherwise fall
    // toward it at FALL_SPEED (stairwell drop from the upper storey).
    const groundZ = resolveGroundZ(
      this.posX,
      this.posY,
      this.curZ,
      this.baseFloorZ,
      this.stairs,
    );
    if (groundZ >= this.curZ) {
      this.curZ = groundZ;
    } else {
      const drop = Math.min(this.curZ - groundZ, FALL_SPEED * dt);
      this.curZ -= drop;
    }

    this.applyDiscToCamera();
  }

  /** Drop listeners + pointer lock (teardown / mode swap). */
  public deactivate(): void {
    if (this.controls.isLocked) this.controls.unlock();
    for (const off of this.disposers.splice(0, this.disposers.length)) off();
    this.unlockListeners = [];
  }
}
