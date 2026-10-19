/**
 * Tunable constants for the openings + furniture layers (pkg 3).
 * Values fixed by the sub-plan / advisor rulings; keep in one spot.
 */

/** Minimum clearance from either end of a wall segment to a cutout. */
export const EDGE_MARGIN_M = 0.05;

/** Windows must sit at least this high above the floor (doors exempt). */
export const WINDOW_SILL_EPSILON_M = 0.02;

/** Hover pick radius for selecting a wall segment, meters. */
export const WALL_PICK_RADIUS_M = 0.3;

/** Rotation step for the R-key rotate gesture, degrees CCW. */
export const ROTATION_STEP_DEG = 90;

/** localStorage slot for the debounced autosave blob. */
export const AUTOSAVE_STORAGE_KEY = 'casaplaza.autosave.v1';

/** Debounce window for autosave persistence, ms. */
export const AUTOSAVE_DEBOUNCE_MS = 300;

/** Undo-history cap (per advisor decision #3, applies to snapshots). */
export const UNDO_STACK_CAP = 100;

/**
 * Tolerance for deciding two things are "the same physical wall",
 * meters. Covers both paired-opening world-interval agreement and the
 * vertex/segment pairing (<1 cm) that lets a shared wall drawn a few
 * millimeters off still emit its mirrored companion row.
 */
export const PAIR_TOLERANCE_M = 0.01;

/**
 * Absolute sane-extent bound for plan vertices, meters (issue #107).
 * Deliberately NOT relative to the current bounding box — a bbox-
 * coupled bound would make a legit outward drag near the edge flake
 * depending on unrelated rooms. Deterministic, far beyond any real
 * floorplan, and catches the typed-99999 case. INCLUSIVE: a vertex at
 * exactly ±this limit is a legal reshape; beyond it resizeRoom
 * rejects with 'vertex beyond plan extent limit'.
 */
export const PLAN_EXTENT_LIMIT_M = 1000;

/** Sensible default footprints [extentA, extentB] in meters. */
export const FURNITURE_DEFAULTS: Record<
  string,
  { label: string; footprint: [number, number] }
> = {
  bed: { label: 'Bed', footprint: [1.6, 2.0] },
  sofa: { label: 'Sofa', footprint: [2.0, 0.9] },
  table: { label: 'Table', footprint: [1.2, 0.8] },
  chair: { label: 'Chair', footprint: [0.45, 0.45] },
  counter: { label: 'Counter', footprint: [0.6, 2.0] },
  bathtub: { label: 'Bathtub', footprint: [1.7, 0.75] },
  toilet: { label: 'Toilet', footprint: [0.4, 0.7] },
};

export type FurnitureTypeName = keyof typeof FURNITURE_DEFAULTS;

/** Default opening dimensions for the door/window tools. */
export const OPENING_DEFAULTS = {
  door: { width: 0.9, sillHeight: 0, headHeight: 2.05 },
  window: { width: 1.2, sillHeight: 0.9, headHeight: 2.3 },
} as const;
