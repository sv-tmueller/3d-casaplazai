/**
 * Furniture model library contracts (issue #180).
 *
 * `FurniturePlacement` is this module's own per-piece record. It is
 * shaped so batch 2's adapter can lift it unchanged into an
 * `AdaptedScene.furniture` field; until then the module owns it and
 * `placeFurniture` accepts any object carrying a `furniture` array.
 *
 * Conventions (mirroring geom/compile.ts and the schema):
 * - plan space is Z-up, metres;
 * - `footprint[0]` is the width along local +x, `footprint[1]` the depth
 *   along local +y;
 * - `rotationDeg` is counter-clockwise about +Z;
 * - a piece's front faces local -y (at rotationDeg 90 it faces world +x).
 */
import type { Object3D } from 'three';
import type { FurnitureType } from '../../shared/schema';

export interface FurniturePlacement {
  itemId: string;
  type: FurnitureType;
  /** Footprint centre, plan metres. */
  position: [number, number];
  /** CCW about +Z, schema semantics; any value. */
  rotationDeg: number;
  /** [width along local x, depth along local y], metres. */
  footprint: [number, number];
  /** World z of the base (floor elevation already added). */
  zMin: number;
  /** World z of the top of the fallback box. */
  zMax: number;
}

/** Anything that can supply placements (batch 2's AdaptedScene will). */
export interface FurnitureSource {
  readonly furniture: readonly FurniturePlacement[];
}

/** Resolves a model URL to a template in glTF orientation (Y up, front +Z). */
export type ModelFetcher = (url: string) => Promise<Object3D>;

export interface FurnitureLibrary {
  /** Cached template, or null while loading / after failure. Starts the load. */
  peek(type: FurnitureType): Object3D | null;
  /** Never rejects; resolves null when the model failed to load. */
  load(type: FurnitureType): Promise<Object3D | null>;
  /** Frees GPU resources of every cached template and empties the cache. */
  dispose(): void;
}
