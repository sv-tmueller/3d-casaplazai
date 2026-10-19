/**
 * Internal geometry types for the compiler pipeline (issue #5).
 *
 * Positions are meters throughout. Triangle soup is emitted as packed
 * Float32Arrays (xyz triples) so pkg 5 can upload them to GPU buffers
 * directly; no DOM or THREE types appear anywhere in src/geom.
 */

import type { Vec2 } from '../shared/schema';

/**
 * Axis-aligned bounding box in 2D (xy plane), inclusive corners.
 *
 * OPTIONAL z bounds (issue #76): present when a plan storey's
 * elevation is nonzero — the compiler bakes floor.elevation into them
 * so collision consumers can tell which storey a box fences. Absent
 * (undefined) means "ground plane, z ∈ [0, ∞)" — the pre-floors shape
 * every existing consumer assumes.
 */
export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Lower fence of the box's z range, world meters (optional storey). */
  minZ?: number;
  /** Upper fence of the box's z range, world meters (optional storey). */
  maxZ?: number;
}

/** Oriented bounding volume for one furniture stamp. */
export interface FurnitureVolume {
  itemId: string;
  typeId: string;
  /** Footprint corner ring, CCW, starting nearest the item's local origin. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** Bottom/top heights in meters. */
  zMin: number;
  zMax: number;
}

/** One mesh buffer group (positions + per-triangle indices). */
export interface MeshBuffer {
  /**
   * Flat xyz vertex triples: [x0,y0,z0,x1,y1,z1,...].
   * Length divisible by 3.
   */
  positions: Float32Array;
  /** Vertex indices, 3 per triangle. */
  indices: Uint32Array;
}

/**
 * A quadrilateral in plan coordinates, corners CCW starting at the
 * downhill/left corner (stair footprints + landing holes, pkg 7.4).
 */
export type QuadCorners = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

/**
 * Surfaces belonging to a single room. Additive (issue #76): the owning
 * floor's elevation is carried per-room so the viewer can attribute
 * rooms to storeys WITHOUT re-deriving the mapping from plan.floors.
 * The compiler applies it as a baked z offset (see compile.ts), meaning
 * every position inside these buffers is already world-z, not floor-
 * local z.
 */
export interface RoomMeshes {
  roomId: string;
  /**
   * Walking-surface elevation of the floor this room was compiled at,
   * meters (dz already baked into floor/ceiling/walls positions).
   */
  elevation: number;
  floor: MeshBuffer;
  ceiling: MeshBuffer;
  /** Extruded wall slab meshes carved around this room's openings. */
  walls: MeshBuffer[];
}

/** Everything the compiler emits for one plan. */
export interface CompiledScene {
  rooms: RoomMeshes[];
  /** Player-radius-expanded collision volumes for solid wall pieces. */
  collisions: Aabb[];
  /** Oriented volumes for furniture stamps. */
  furniture: FurnitureVolume[];
  /**
   * Walkable staircases (pkg 7.4): footprint rect + grounding
   * parameters + merged step-box mesh, one per Staircase, in plan
   * order. OPTIONAL only so hand-built CompiledScene literals in
   * pre-7.4 tests stay valid — compilePlan ALWAYS emits it ([] for
   * stair-free plans) and the adapter normalizes absence to [].
   */
  stairs?: StairSolid[];
}

/**
 * One straight-flight staircase as the walk resolver consumes it
 * (pkg 7.4): world-space footprint rect plus the z parameters the
 * grounding interpolates over, bundled with the merged step-box MESH
 * (already world-z; the adapter routes it into the wood floor slot).
 */
export interface StairSolid {
  /** Footprint corners, CCW, downhill-left first (stairWorldRect). */
  rect: QuadCorners;
  /**
   * Landing-hole corners (footprint extended one tread past the top
   * riser — stairHoleRect). The grounding resolver works in THIS
   * rect: the arrival slab is holed across it and the ramp spans the
   * extension level with the arrival plane (seamless cresting).
   */
  hole: QuadCorners;
  /** Uphill unit direction (stair local +x). */
  ux: number;
  uy: number;
  /** Downhill edge midpoint (progress 0). */
  ax: number;
  ay: number;
  /** Elevation of the departure (lower) floor, meters. */
  zLower: number;
  /** Vertical climb to the arrival floor, meters. */
  rise: number;
  /** Horizontal length of the flight, meters. */
  run: number;
  /** Merged solid step boxes (stepCount prisms), world z. */
  mesh: MeshBuffer;
}
