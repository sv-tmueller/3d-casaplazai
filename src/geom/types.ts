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
}
