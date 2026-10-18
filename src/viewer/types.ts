/**
 * Viewer-internal contracts (issue #6). These decouple the renderer,
 * rigs, and controller from pkg-4's raw `CompiledScene` shape — the
 * translation happens exclusively in `src/viewer/adapter.ts`, the only
 * file allowed to touch pkg-4 types.
 */

import type { FloorTexture } from '../shared/schema';

/** How far the player's eyes stand above the floor, meters. */
export const EYE_HEIGHT = 1.65;

/** Player disc radius, meters (must mirror pkg-4's PLAYER_RADIUS). */
export const VIEWER_PLAYER_RADIUS = 0.3;

/** Normal walking speed, meters/second. */
export const MOVE_SPEED = 2.6;

/** Sprint modifier (Shift held), multiply base speed. */
export const SPRINT_FACTOR = 1.8;

/** Acceleration smoothing factor (lerp alpha per second). */
export const MOVE_ACCEL_ALPHA = 8;

/** Debounce window for editor-store recompiles, milliseconds. */
export const RECOMPILE_DEBOUNCE_MS = 250;

/** Idle-spin resumes this long after the last user camera input. */
export const IDLE_SPIN_DELAY_MS = 5000;

/** Idle spin angular speed, radians/second. */
export const IDLE_SPIN_RATE = 0.08;

/** Camera FOV, degrees. */
export const CAMERA_FOV = 60;

/** Device pixel ratio clamp (integrated-GPU friendliness). */
export const MAX_DEVICE_PIXEL_RATIO = 1.5;

/** Texture atlas square size, pixels. */
export const TEXTURE_SIZE = 512;

/** Physical world scale of one tiled texture repetition, meters. */
export const TILE_METERS = 1.2;

/** View modes of the OVERVIEW⇄WALK state machine. */
export type ViewMode = 'overview' | 'walk';

/** A resolved spawn point + facing yaw. */
export interface SpawnPose {
  x: number;
  y: number;
  /** Facing angle around +Z (yaw), radians. */
  yaw: number;
}

/**
 * Player collision volumes handed over by the adapter. Already
 * player-radius expanded by pkg-4; expressed in floor-plane XY.
 */
export interface CollisionBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** One drawable bucket of similarly-shaded geometry. */
export interface MaterialBucket {
  /**
   * Stable slot identity the materials factory keys off: 'wall',
   * 'ceiling', a floorTexture enum member, window dressing
   * ('glass'/'windowFrame'), or a furniture family ('furn-*').
   */
  slot: MaterialSlotId;
  /** Plain positions (xyz triples), pkg-4 wire format. */
  positions: Float32Array;
  /** Per-triangle indices referencing positions. */
  indices: Uint32Array;
}

/** Union of material-slot identities the builder recognizes. */
export type MaterialSlotId =
  | 'wall'
  | 'ceiling'
  | Exclude<FloorTexture, null>
  | 'glass'
  | 'windowFrame'
  | 'furn-wood'
  | 'furn-fabric'
  | 'furn-porcelain'
  | 'furn-laminate';

/** Fully translated scene the renderer consumes. */
export interface AdaptedScene {
  buckets: MaterialBucket[];
  collisions: CollisionBox[];
  /** Total triangles across buckets (diagnostics/e2e assertions). */
  triangleCount: number;
  /** Plan-space xy bounds (light-frustum fitting, orbit framing). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Rolling-frame statistics shown by the ?perf=1 overlay. */
export interface FrameStats {
  fpsMedian: number;
  fpsPercentileLow: number;
  frameMsMedian: number;
  frameMsPercentileHigh: number;
  framesSampled: number;
}

/** Contract every camera rig fulfills. */
export interface CameraRig {
  readonly mode: ViewMode;
  /** Called once per animation frame with the elapsed dt (seconds). */
  update(dt: number): void;
  /** Release listeners/locks; called on teardown and mode swap-out. */
  deactivate(): void;
}
