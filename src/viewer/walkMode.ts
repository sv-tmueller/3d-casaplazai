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
import type { AdaptedScene, CameraRig, ViewMode } from './types';

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

/** Scratch vectors/quaternions reused per frame (allocation discipline). */
const FWD_SCRATCH = new Vector3();
const Q_YAW_SCRATCH = new Quaternion();
const Q_PITCH_SCRATCH = new Quaternion();
const AXIS_Z = new Vector3(0, 0, 1);
const LOCAL_RIGHT = new Vector3(1, 0, 0);

/**
 * Boxes fencing the ACTIVE storey (issue #76). A box qualifies when its
 * z band overlaps the walker's body band [floorZ, floorZ + EYE_HEIGHT]:
 * a ground-storey walker standing beneath an upstairs wall shares no z
 * range with it and walks freely. Boxes lacking z fences are
 * storey-less (legacy data) and always qualify.
 */
export function activeCollisions(
  adapted: Pick<AdaptedScene, 'collisions' | 'activeFloorElevation'>,
): AdaptedScene['collisions'] {
  const lo = adapted.activeFloorElevation;
  const hi = lo + EYE_HEIGHT;
  return adapted.collisions.filter((box) => {
    if (box.minZ === undefined || box.maxZ === undefined) return true;
    return box.maxZ > lo && box.minZ < hi;
  });
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
   * Walking-surface elevation of the active storey, meters (issue #76).
   * The camera rides at activeFloorElevation + EYE_HEIGHT; collisions
   * are pre-filtered to this storey's z band so upstairs walls never
   * fence a downstairs walker (and vice versa).
   */
  private readonly floorZ: number;

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
    this.floorZ = adapted.activeFloorElevation;
    this.collisions = activeCollisions(adapted);

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

  /** Seat the world camera from the plan-space disc pose.
   * WORLD IS Z-UP (floors at z=floorZ, ceilings at floorZ+wallHeight):
   * the eye rides at activeFloorElevation + EYE_HEIGHT (issue #76 —
   * formerly hardcoded 0 + EYE_HEIGHT). Position is reset every frame;
   * the LOOK orientation is owned by the quaternion
   * (applyLook/seedYaw), never clobbered here.
   */
  private applyDiscToCamera(): void {
    this.camera.position.set(
      this.posX,
      this.posY,
      this.floorZ + EYE_HEIGHT,
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
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (!HANDLED_CODES.has(ev.code)) return;
      ev.preventDefault();
      this.handleKey(ev.code, true);
    };
    const onKeyUp = (ev: KeyboardEvent): void => {
      if (!HANDLED_CODES.has(ev.code)) return;
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
      const out = moveDiscStepped(
        this.posX,
        this.posY,
        this.velX,
        this.velY,
        dt,
        this.collisions,
        VIEWER_PLAYER_RADIUS,
      );
      this.posX = out.x;
      this.posY = out.y;
      // Adopt resolver-zeroed components so pressing into a wall does
      // not accumulate jitter across frames.
      this.velX = out.vx;
      this.velY = out.vy;
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
