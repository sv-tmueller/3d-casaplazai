/**
 * FloorplanData schema v1 — the frozen interchange contract between the
 * 2D editor and the 3D viewer (batch issue #1). Mirrors the contract
 * verbatim; evolve only via migrate.ts, never by breaking edits.
 */

export const SCHEMA_VERSION = 1;

export type Units = 'meters';

export type FloorTexture = 'wood' | 'tile' | 'carpet' | 'concrete' | null;

export type OpeningKind = 'door' | 'window';

export type FurnitureType =
  | 'bed'
  | 'sofa'
  | 'table'
  | 'chair'
  | 'counter'
  | 'bathtub'
  | 'toilet';

/** Point in meters, [x, y]. */
export type Vec2 = [number, number];

export interface WallOverride {
  /** Index into the owning room's polygon segments (0..segments.length-1). */
  segmentIndex: number;
  height: number;
}

export interface Room {
  /** Unique, non-empty string (slugs encouraged; not necessarily a UUID). */
  id: string;
  name: string;
  /**
   * Polygon vertices in meters, wound counter-clockwise (positive signed
   * area). At least 3 distinct vertices; no repeating closing point.
   */
  polygon: Vec2[];
  floorTexture: FloorTexture;
  /** Per-segment wall-height overrides; omit for uniform wallHeight. */
  wallsOverride?: WallOverride[];
}

export interface Opening {
  id: string;
  /** Id of the room whose wall segment hosts this opening. */
  roomId: string;
  kind: OpeningKind;
  /** Which polygon segment of the room this opening sits on. */
  segmentIndex: number;
  /**
   * Center position along the segment, normalized: distance from the
   * segment start divided by segment length, in [0, 1].
   */
  tCenter: number;
  /** Width of the cutout along the wall, in meters. */
  width: number;
  /** Height of the bottom edge above the floor, in meters. Doors: 0. */
  sillHeight: number;
  /** Height of the top edge above the floor, in meters. */
  headHeight: number;
}

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  /** Id of the room containing this piece. */
  roomId: string;
  /** Center position in meters. */
  position: Vec2;
  /** Rotation of the footprint rectangle around `position`, degrees CCW. */
  rotationDeg: number;
  /** Unrotated footprint size [depthAlongWallAxis?, width], meters. */
  footprint: Vec2;
}

export interface FloorplanData {
  schemaVersion: typeof SCHEMA_VERSION;
  units: Units;
  /** Clear interior height, meters. */
  wallHeight: number;
  wallThickness: number;
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureItem[];
}
