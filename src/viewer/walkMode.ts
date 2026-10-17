/**
 * Walk rig (issue #6): PointerLockControls mouse-look plus physics-
 * driven locomotion. Key intents feed a smoothed acceleration which
 * integrates through `moveDiscStepped` (player-radius-expanded AABBs
 * from the adapter). The scene is AUTHORED Z-UP (floors [x, y, 0],
 * walls extruded on +z) but three.js cameras are Y-up, so the rig
 * converts on the seams: plan-space (x, y) ↔ world-space (x, z↑, y)
 * and the eye height lifts the camera above the ground plane.
 *
 * Unlock handling: ESC (or any unlock) fires PLC's 'unlock' event,
 * reported to the controller ONCE per episode; a short cooldown then
 * suppresses accidental instant re-locks while the 'Click to walk'
 * affordance invites the user back in.
 */

import { PerspectiveCamera, Vector3 } from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

import { moveDiscStepped } from './collision';
import {
  EYE_HEIGHT,
  MOVE_ACCEL_ALPHA,
  MOVE_SPEED,
  SPRINT_FACTOR,
  VIEWER_PLAYER_RADIUS,
} from './types';
import type { AdaptedScene, CameraRig, ViewMode } from './types';

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

/** Scratch vectors reused per frame (allocation discipline). */
const FWD_SCRATCH = new Vector3();

/** Aspect ratio of a canvas, safe against zero-sized elements. */
function aspectOf(canvas: HTMLCanvasElement): number {
  const w = canvas.clientWidth || canvas.offsetWidth;
  const h = canvas.clientHeight || canvas.offsetHeight;
  return w > 0 && h > 0 ? w / h : 4 / 3;
}

/**
 * Aim the camera along a plan-space yaw WITHOUT engaging PLC: plan yaw
 * measures CCW from +X in plan space; through the Z-up→Y-up mapping the
 * world forward becomes (cos yaw · x̂, 0, sin yaw · ŷ_plan).
 */
function seedYaw(camera: PerspectiveCamera, yawRad: number): void {
  camera.rotation.order = 'YXZ';
  camera.rotation.y = -yawRad;
  camera.rotation.x = 0;
  camera.updateProjectionMatrix();
}

/**
 * Walk-mode camera rig. Owns a perspective camera seated at
 * (discX, EYE_HEIGHT, discY) in world coords; the disc slides in PLAN
 * space under the collision resolver and is lifted back into world
 * space each frame.
 */
export class WalkRig implements CameraRig {
  public readonly mode: ViewMode = 'walk';

  public readonly camera: PerspectiveCamera;
  public readonly controls: PointerLockControls;

  /** Plan-space disc position (meters). */
  private posX: number;
  private posY: number;

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
   * @param adapted adapted scene (collisions drive the resolver)
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
    this.collisions = adapted.collisions;

    this.camera = new PerspectiveCamera(60, aspectOf(canvas), 0.05, 400);
    this.applyDiscToCamera();
    seedYaw(this.camera, yawRad);

    this.controls = new PointerLockControls(this.camera, canvas);
    this.controls.maxPolarAngle = Math.PI / 2 + CAM_PITCH_LIMIT_RAD;
    this.controls.pointerSpeed = 1;

    this.controls.addEventListener('unlock', () => this.notifyUnlock());

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

  /** True while pointer lock is engaged. */
  public get locked(): boolean {
    return this.controls.isLocked;
  }

  /** Seat the world camera from the plan-space disc pose. */
  private applyDiscToCamera(): void {
    this.camera.position.set(this.posX, EYE_HEIGHT, this.posY);
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
    const flen = Math.hypot(forward.x, forward.z);
    const normFx = flen > 1e-6 ? forward.x / flen : 0;
    const normFz = flen > 1e-6 ? forward.z / flen : 0;
    // Right = forward rotated −90° about world up.
    const rx = -normFz;
    const rz = normFx;

    let ix = 0;
    let iy = 0;
    if (this.fwd) {
      ix += normFx;
      iy += normFz;
    }
    if (this.back) {
      ix -= normFx;
      iy -= normFz;
    }
    if (this.right) {
      ix += rx;
      iy += rz;
    }
    if (this.left) {
      ix -= rx;
      iy -= rz;
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
