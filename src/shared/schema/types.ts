/**
 * FloorplanData schema v2 — the frozen interchange contract between the
 * 2D editor and the 3D viewer (batch issue #1; v2 shaping per issue #69).
 *
 * v2 wraps the three entity collections into per-Floor containers and
 * introduces the top-level stairs[] (schema evolution lives in
 * migrate.ts, never by breaking edits here).
 */

export const SCHEMA_VERSION = 2;

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

/**
 * Per-wall lean specification (pkg 8.1, issue #83): one wall segment of
 * the owning room slopes INWARD from its top plate at `leanDeg` degrees
 * from horizontal. NO style enum, NO ridge fields — a gable is the
 * composition of two leaning OPPOSING segments and the ridge is always
 * DERIVED at compile time (ratified per-wall ruling on batch #82),
 * satisfying the #69 no-unconsumed-fields constraint.
 */
export interface RoofSpec {
  /** Index into the owning room's polygon segments (0..segments.length-1). */
  segmentIndex: number;
  /** Lean from horizontal, degrees. 0 = flat parapet (no roof contribution). */
  leanDeg: number;
}

export interface Room {
  /** Unique, non-empty string (slug encouraged; not necessarily a UUID). */
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
  /**
   * Per-wall roof leans (pkg 8.1, issue #83). Absent/empty = flat
   * (invisible from above — the pre-8.1 rendering of every plan).
   * Only meaningful on rooms of the TOPMOST floor (validator rejects
   * elsewhere); a lean of 0 contributes nothing and is discouraged
   * (clearWallLean removes the row instead).
   */
  roofs?: RoofSpec[];
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

/**
 * One storey of the house: its own collection of rooms, openings and
 * furniture. Entity ids remain unique across the WHOLE plan (validator
 * walks all floors) so the two-row shared-door convention and any
 * cross-floor future stay intact.
 */
export interface Floor {
  /** Unique among all entities in the plan, non-empty. */
  id: string;
  /** Display name, e.g. "Ground". */
  name: string;
  /** z of this floor's walking surface, meters. Strictly increasing across floors[]. */
  elevation: number;
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureItem[];
}

/**
 * Straight-flight staircase primitive (deep geometric checks — rise/gap
 * matching, stairwell overlap — arrive with pkg 7.4; the validator ships
 * shallow sanity rules only).
 */
export interface Staircase {
  id: string;
  /** Host room on the DEPARTURE (lower) floor. */
  roomId: string;
  /** Footprint center in plan coordinates. */
  position: Vec2;
  /** Degrees CCW; the +x local axis is the uphill direction. */
  rotationDeg: number;
  /** Flight width, meters (> 0). */
  width: number;
  /** Horizontal length of the flight, meters (> 0). */
  run: number;
  /** Vertical climb, meters (> 0). */
  rise: number;
  /** Integer >= 3; tread = run/N, riser = rise/N (deterministic). */
  stepCount: number;
}

export interface FloorplanData {
  schemaVersion: typeof SCHEMA_VERSION;
  units: Units;
  /** Clear interior height, meters. Global in v2 (per-floor heights scope-guarded out). */
  wallHeight: number;
  wallThickness: number;
  /** At least one floor; elevations strictly increase. */
  floors: Floor[];
  /** Anchored to their departure floor via roomId. */
  stairs: Staircase[];
}

/**
 * Historical v1 wire shape (flat collections, no floors). FROZEN: it is
 * the published contract of the window.__casaplaza bridge, the
 * casaplaza.autosave.v1 localStorage slot, and every exported v1 JSON —
 * all of which keep speaking v1 externally while the editor store is
 * v2-native (converters live at the door; see editor/wire.ts).
 */
export interface FloorplanDataV1 {
  schemaVersion: 1;
  units: Units;
  wallHeight: number;
  wallThickness: number;
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureItem[];
}
