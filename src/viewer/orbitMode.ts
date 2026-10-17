/**
 * Overview rig (issue #6): OrbitControls with damping plus an idle
 * azimuth drift that RESUMES exactly IDLE_SPIN_DELAY_MS after the last
 * user camera input (pointer/wheel/key on the canvas). Drift pauses
 * instantly on any input and hands back smoothly — no snap jumps.
 */

import {
  Clock,
  OrthographicCamera,
  Raycaster,
  Vector2,
  type Intersection,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { IDLE_SPIN_DELAY_MS, IDLE_SPIN_RATE } from './types';
import type { AdaptedScene, CameraRig, ViewMode } from './types';

/** Vertical margin fraction reserved above/below the plan when framing. */
const FRAME_MARGIN = 1.35;

/** Damped-control inertia factor (higher snappier). */
const DAMPING = 0.08;

/** How slowly idle-drift ramps up/down, per second (fraction of rate). */
const SPIN_RAMP_HZ = 1.6;

/** Interaction events that pause idle drift. */
const INPUT_EVENTS = [
  'pointerdown',
  'wheel',
  'keydown',
  'touchstart',
] as const;

/** Overview camera rig: orbit + idle spin. */
export class OrbitRig implements CameraRig {
  public readonly mode: ViewMode = 'overview';

  public readonly camera: OrthographicCamera;
  public readonly controls: OrbitControls;

  private readonly clock = new Clock();
  private readonly disposers: Array<() => void> = [];

  private lastInputAt = Number.NEGATIVE_INFINITY;
  private spinLevel = 0;

  /**
   * @param canvas listening surface for input detection
   * @param adapted adapted scene (bounds drive the framing)
   * @param initialAzimuthDegrees restore point after leaving walk mode
   */
  public constructor(
    canvas: HTMLCanvasElement,
    adapted: AdaptedScene,
    initialAzimuthDegrees?: number,
  ) {
    const aspect =
      canvas.clientWidth > 0 && canvas.clientHeight > 0
        ? canvas.clientWidth / canvas.clientHeight
        : 4 / 3;
    const camHalfWidth = this.frameHalfExtent(adapted) * aspect;

    this.camera = new OrthographicCamera(
      -camHalfWidth,
      camHalfWidth,
      this.frameHalfExtent(adapted),
      -this.frameHalfExtent(adapted),
      0.1,
      400,
    );
    this.placeCamera(adapted, initialAzimuthDegrees);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = DAMPING;
    this.controls.zoomSpeed = 0.9;
    this.controls.mouseButtons = {
      LEFT: 2, // MOUSE.PAN — left-drag pans the floorplan.
      MIDDLE: 1, // MOUSE.DOLLY
      RIGHT: 0, // MOUSE.ROTATE
    };

    for (const evt of INPUT_EVENTS) {
      const handler = (): void => {
        this.lastInputAt = performance.now();
      };
      canvas.addEventListener(evt, handler, { passive: true });
      this.disposers.push(() =>
        canvas.removeEventListener(evt, handler),
      );
    }
  }

  /** Half-extent (meters) framing the plan with breathing room. */
  private frameHalfExtent(adapted: AdaptedScene): number {
    const extX = adapted.bounds.maxX - adapted.bounds.minX;
    const extY = adapted.bounds.maxY - adapted.bounds.minY;
    return (Math.max(extX, extY) / 2) * FRAME_MARGIN;
  }

  /** Park the camera looking straight down at the plan centroid. */
  private placeCamera(
    adapted: AdaptedScene,
    azimuthDegrees?: number,
  ): void {
    const cx = (adapted.bounds.minX + adapted.bounds.maxX) / 2;
    const cy = (adapted.bounds.minY + adapted.bounds.maxY) / 2;
    const az = ((azimuthDegrees ?? 0) * Math.PI) / 180;
    const hover = 120; // Far above the ortho frustum's far plane.

    this.camera.up.set(Math.sin(az), Math.cos(az), 0);
    this.camera.position.set(
      cx + Math.sin(az) * 0.001,
      cy + Math.cos(az) * 0.001,
      hover,
    );
    this.camera.lookAt(cx, cy, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Current orbit azimuth in degrees (restore seam for mode swaps). */
  public get azimuthDegrees(): number {
    const off = this.camera.position.clone().sub(this.controls.target);
    return (Math.atan2(off.y, off.x) * 180) / Math.PI;
  }

  /** Pan/zoom the camera so the given plan fills the viewport. */
  public reframe(adapted: AdaptedScene): void {
    const half = this.frameHalfExtent(adapted);
    const elem = this.controls.domElement;
    const rect = elem?.getBoundingClientRect();
    const vpAspect =
      rect && rect.height > 0 ? rect.width / rect.height : 4 / 3;
    this.camera.left = -half * vpAspect;
    this.camera.right = half * vpAspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();

    const cx = (adapted.bounds.minX + adapted.bounds.maxX) / 2;
    const cy = (adapted.bounds.minY + adapted.bounds.maxY) / 2;
    this.controls.target.set(cx, cy, 0);
    this.camera.position.set(cx, cy, 120);
    this.camera.lookAt(cx, cy, 0);
  }

  /** Advance damping + idle spin. */
  public update(_dt: number): void {
    const sinceInput = performance.now() - this.lastInputAt;
    const idleReady = sinceInput >= IDLE_SPIN_DELAY_MS;
    const rampDelta = idleReady ? SPIN_RAMP_HZ : -SPIN_RAMP_HZ * 3;
    this.spinLevel = Math.min(
      1,
      Math.max(0, this.spinLevel + rampDelta * this.clock.getDelta()),
    );

    if (idleReady && this.spinLevel > 0) {
      this.controls.rotateLeft(IDLE_SPIN_RATE * this.spinLevel * _dt);
    }
    this.controls.update();
  }

  /** Tear down listeners + controls (rig swapped out or disposed). */
  public deactivate(): void {
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    this.controls.dispose();
  }

  /** Pick the first intersected object under a pointer event. */
  public raycastAt(
    ndcXY: Vector2,
    roots: Object3D[],
  ): Intersection[] {
    const rc = new Raycaster();
    rc.setFromCamera(ndcXY, this.camera);
    const hits: Intersection[] = [];
    for (const root of roots) {
      hits.push(...rc.intersectObject(root, true));
    }
    return hits;
  }
}

