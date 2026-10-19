/**
 * Pointer/keyboard controller for the 2D editor canvas.
 *
 * Owns: camera (pan/zoom), the tool FSM, snap logic, and translation of
 * gestures into store Commands. Deliberately split so the gesture math
 * and FSM transitions stay unit-testable without a real canvas.
 */
import type { FloorplanData, Floor, FurnitureItem, Room, Staircase } from '../shared/schema';
import { flatFurniture, flatOpenings, flatRooms } from '../shared/schema';
import {
  convexHull,
  nearestVertexWithin,
  pointInPolygon,
  polygonsOverlapSAT,
  projectPointOntoSegment,
  snapVec,
  signedArea,
} from './geom';
import type { Pt } from './geom';
import { OPENING_DEFAULTS, ROTATION_STEP_DEG } from './model/constants';
import { stairWorldRect } from '../geom';
import {
  clampPoseIntoRoom,
  itemCorners,
  judgeContainment,
} from './model/furniture';
import {
  pointAtT,
  roomSegments,
  segmentNormal,
  validateOpeningCandidate,
  type SegmentInfo,
} from './model/openings';
export const SNAP_TOL_PX = 8;
/**
 * Issue #53: grab tolerance for a resize handle, in SCREEN pixels.
 * Deliberately decoupled from SNAP_TOL_PX — picking a handle is a coarse
 * click target (~12 px feels comfortable at any zoom), while draw-time
 * snap tolerance is a finer magnet. Convert to world units at the call
 * site with `HANDLE_HIT_PX / cam.scale`.
 */
export const HANDLE_HIT_PX = 12;

export interface Camera {
  originX: number;
  originY: number;
  scale: number;
}

export type ToolMode = 'select' | 'rectangle' | 'polygon';

export type InteractionPhase =
  | { tag: 'idle' }
  | { tag: 'drawingRect'; corner1: Pt; cursor: Pt }
  | { tag: 'drawingPoly'; points: Pt[]; cursor: Pt }
  /* pkg 13.4 (issue #118): staircase drag. `anchor` is the bottom step's
   * downhill edge centre (fixed at pointerdown), `cursor` the uphill
   * end; `roomId` is the host room captured at pointerdown. */
  | { tag: 'drawingStair'; anchor: Pt; cursor: Pt; roomId: string }
  | { tag: 'dragging'; grabOffset: Pt; selectedRoomId: string }
  | { tag: 'resizing'; vertexIndex: number; selectedRoomId: string }
  | { tag: 'draggingFurniture'; furnitureId: string }
  | { tag: 'panning'; startX: number; startY: number };

/* ----------------------------- Coordinate transforms ---------------------- */

export function worldToScreen(cam: Camera, p: Pt): Pt {
  return [(p[0] - cam.originX) * cam.scale, (cam.originY - p[1]) * cam.scale];
}

export function screenToWorld(cam: Camera, p: Pt): Pt {
  return [p[0] / cam.scale + cam.originX, cam.originY - p[1] / cam.scale];
}

/* ------------------------- Rectangle construction -------------------------- */

/** Opposite corners → CCW rectangular ring. */
export function finalizeRectangle(c1: Pt, c2: Pt): Pt[] {
  const minX = Math.min(c1[0], c2[0]);
  const maxX = Math.max(c1[0], c2[0]);
  const minY = Math.min(c1[1], c2[1]);
  const maxY = Math.max(c1[1], c2[1]);
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}

/** Axis-aligned rectangle corners in CCW order (helper for previews). */
export function rectCorners(c1: Pt, c2: Pt): Pt[] {
  return finalizeRectangle(c1, c2);
}

/* ------------------------------ Snapping ---------------------------------- */

export interface SnapOutcome {
  point: Pt;
  snapped: boolean;
  /** Room id whose vertex/edge attracted us, when snapped. */
  sourceRoomId?: string;
}

/**
 * Magnetize a candidate point to nearby FOREIGN room geometry:
 * 1. vertex attraction within tol,
 * 2. else orthogonal projection onto the nearest foreign edge within tol.
 * Rooms listed in excludeIds (the room being manipulated) are ignored.
 */
export function evaluateSnapCandidates(
  plan: FloorplanData,
  candidate: Pt,
  tolM: number,
  excludeIds: string[],
): SnapOutcome {
  const others = flatRooms(plan).filter((r) => !excludeIds.includes(r.id));

  const vertexHit = nearestVertexWithin(candidate, others.flatMap((r) => r.polygon), tolM);
  if (vertexHit) {
    const owner = others.find((r) => r.polygon.some((v) => v === vertexHit || (v[0] === vertexHit[0] && v[1] === vertexHit[1])));
    return { point: [vertexHit[0], vertexHit[1]], snapped: true, sourceRoomId: owner?.id };
  }

  let bestProj: Pt | null = null;
  let bestOwner: string | undefined;
  let bestDist = tolM;
  for (const r of others) {
    for (let i = 0; i < r.polygon.length; i += 1) {
      const a = r.polygon[i];
      const b = r.polygon[(i + 1) % r.polygon.length];
      const proj = projectPointOntoSegment(candidate, a, b);
      const d = Math.hypot(candidate[0] - proj[0], candidate[1] - proj[1]);
      if (d <= bestDist) {
        bestDist = d;
        bestProj = proj;
        bestOwner = r.id;
      }
    }
  }
  if (bestProj) return { point: bestProj, snapped: true, sourceRoomId: bestOwner };
  return { point: [candidate[0], candidate[1]], snapped: false };
}

/* ------------------------------ Hit testing ------------------------------- */

export function roomAt(worldPt: Pt, plan: FloorplanData): Room | null {
  const rooms = flatRooms(plan);
  for (let i = rooms.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(worldPt, rooms[i].polygon)) return rooms[i];
  }
  return null;
}

/* ------------------------------ Overlap eval ------------------------------ */

/** Sorted [idA, idB] pairs whose convex hulls positively intersect. */
export function computeOverlaps(plan: FloorplanData): [string, string][] {
  const pairs: [string, string][] = [];
  const hullCache = new Map<string, Pt[]>();
  for (const r of flatRooms(plan)) {
    const hull = convexHull(r.polygon);
    if (hull.length >= 3) hullCache.set(r.id, hull);
  }
  const ids = [...hullCache.keys()];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      if (polygonsOverlapSAT(hullCache.get(ids[i])!, hullCache.get(ids[j])!)) {
        pairs.push([ids[i], ids[j]].sort() as [string, string]);
      }
    }
  }
  return pairs.sort(comparePairs);
}

function comparePairs(a: [string, string], b: [string, string]): number {
  return a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]);
}

/* ------------------- pkg 13.2 marquee band geometry (issue #110) --------- */

/**
 * Axis-aligned world rectangle swept by a marquee band (either corner
 * order). Kept as a struct (not a Pt[]) so membership predicates read
 * plainly; pure — unit spec'd.
 */
export interface BandRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bandRect(a: Pt, b: Pt): BandRect {
  return {
    minX: Math.min(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxX: Math.max(a[0], b[0]),
    maxY: Math.max(a[1], b[1]),
  };
}

/** Strict overlap of two axis-aligned intervals (touching ≠ overlap). */
function intervalsOverlap(aLo: number, aHi: number, bLo: number, bHi: number): boolean {
  return aLo < bHi && bLo < aHi;
}

/**
 * Point-in-band test (half-open like interval overlap: a point exactly
 * on the max edge is OUTSIDE — symmetric with the rect predicates).
 */
export function pointInBand(rect: BandRect, p: Pt): boolean {
  return (
    p[0] >= rect.minX && p[0] < rect.maxX && p[1] >= rect.minY && p[1] < rect.maxY
  );
}

/**
 * Marquee membership for a furniture stamp: AABB of the item's rotated
 * corners ∩ band AABB. DELIBERATELY LOOSE for rotated items (a 45°
 * sofa's AABB exceeds its true footprint) — acceptable selection UX,
 * exact SAT deferred (issue #110 non-goals). Pure — unit spec'd.
 */
export function furnitureInBand(
  item: FurnitureItem,
  rect: BandRect,
): boolean {
  const corners = itemCorners(item);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    if (c[0] < minX) minX = c[0];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[1] > maxY) maxY = c[1];
  }
  return intervalsOverlap(minX, maxX, rect.minX, rect.maxX) &&
    intervalsOverlap(minY, maxY, rect.minY, rect.maxY);
}

/**
 * Marquee membership for a room: bbox-overlap OR any polygon vertex
 * inside the band — either leg admits (SUB_PLAN formula). The vertex
 * leg guarantees a thin band crossing the interior selects the room
 * even when it misses every extreme. Loose by design — exact
 * polygon∩rect is a non-goal (issue #110). Pure — unit spec'd.
 */
export function roomInBand(room: Room, rect: BandRect): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of room.polygon) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
    if (pointInBand(rect, p)) return true;
  }
  return intervalsOverlap(minX, maxX, rect.minX, rect.maxX) &&
    intervalsOverlap(minY, maxY, rect.minY, rect.maxY);
}

/**
 * Marquee membership for a stair (issue #118): AABB of the rotated
 * footprint (stairWorldRect) ∩ band AABB — deliberately LOOSE, the same
 * posture as furnitureInBand. "Rect-simple" by ruling: the exact-SAT
 * marquee upgrade (#117) can absorb stairs after; no SAT here. Pure —
 * unit spec'd.
 */
export function stairInBand(stair: Staircase, rect: BandRect): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of stairWorldRect(stair)) {
    if (c[0] < minX) minX = c[0];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[1] > maxY) maxY = c[1];
  }
  return intervalsOverlap(minX, maxX, rect.minX, rect.maxX) &&
    intervalsOverlap(minY, maxY, rect.minY, rect.maxY);
}

/* --------------------------- Resize-handle picking ------------------------ */

export function resizeHandleAt(
  worldPt: Pt,
  room: Room,
  tolM: number,
): number | null {
  const candidates = nearestVertexWithin(worldPt, room.polygon, tolM);
  if (!candidates) return null;
  const idx = room.polygon.findIndex((v) => v[0] === candidates[0] && v[1] === candidates[1]);
  return idx === -1 ? null : idx;
}

/** Vertex positions of the selected room, for painting resize handles. */
export function resizeHandlesOf(room: Room): Pt[] {
  return room.polygon.map((p) => [p[0], p[1]] as Pt);
}

/** Diagonal-resize CSS cursors (issue #53). */
export type ResizeCursor = 'nwse-resize' | 'nesw-resize';

/**
 * Classify which diagonal a vertex drags along, using the room's
 * axis-aligned bbox centre. NW/SE corners (main diagonal) -> nwse-resize;
 * NE/SW corners (anti-diagonal) -> nesw-resize. Returns null for a
 * degenerate corner sitting on the centre column/row. Pure — unit spec'd.
 */
export function classifyCorner(vertex: Pt, room: Room): ResizeCursor | null {
  const poly = room.polygon;
  if (poly.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const dx = vertex[0] - (minX + maxX) / 2;
  const dy = vertex[1] - (minY + maxY) / 2;
  const prod = dx * dy;
  if (prod < 0) return 'nwse-resize';
  if (prod > 0) return 'nesw-resize';
  return null;
}

/* ------------------------------ Winding util ------------------------------ */

export function ensureCCW(poly: Pt[]): Pt[] {
  return signedArea(poly) < 0 ? poly.slice().reverse() : poly;
}

export { snapVec };

/* ====================== pkg 3 additions (issue #4) ======================= */

/**
 * Extended tool set: door/window anchor to wall segments; stamp places
 * furniture from the palette. Extends (not replaces) pkg 2's trio.
 */
export type Pkg3ToolMode = 'door' | 'window' | 'stamp';
/**
 * Issue #66 (Pkg 1): two-point measure tool. Added ADDITIVELY so Pkg 2
 * can keep churning the phase wiring undisturbed.
 */
export type MeasureToolMode = 'measure';
/**
 * Issue #118 (Pkg 13.4): staircase tool — drag inside a room to draw a
 * straight flight climbing onto the next storey. Added ADDITIVELY (the
 * #66 MeasureToolMode precedent) so earlier tool wiring stays untouched.
 */
export type StairsToolMode = 'stairs';
export type AnyToolMode = ToolMode | Pkg3ToolMode | MeasureToolMode | StairsToolMode;

export interface GhostPreview {
  kind: 'door' | 'window' | 'stamp' | 'stairs';
  seg?: SegmentInfo;
  t?: number;
  width?: number;
  footprint?: Pt;
  rotationDeg?: number;
  pos?: Pt;
  /** Issue #118: the full candidate flight (render derives its rect). */
  stair?: Staircase;
  valid: boolean;
}

/** Result of attempting a stamp drop at a world point. */
export type DropOutcome =
  | { verdict: 'ok' }
  | { verdict: 'warn'; snappedTo: Pt }
  | { verdict: 'rejected'; reason: 'NO_ROOM_AT_POINT' | 'ITEM_DOES_NOT_FIT' };

/**
 * Attempt to place a furniture stamp of `dims` centred at `pos`,
 * hosted by whatever room contains that point. Enforces the prevent/
 * warn arms of AC4 WITHOUT mutating anything — the caller translates
 * the outcome into a command + message.
 */
export function attemptDrop(
  plan: FloorplanData,
  dims: Pt,
  pos: Pt,
  rotationDeg = 0,
): DropOutcome {
  const host = flatRooms(plan).find((r) => pointInPolygon(pos, r.polygon));
  if (!host) return { verdict: 'rejected', reason: 'NO_ROOM_AT_POINT' };
  const v = judgeContainment(pos, dims, rotationDeg, host);
  if (v === 'ok') return { verdict: 'ok' };
  const solved = clampPoseIntoRoom(pos, dims, rotationDeg, host);
  return solved
    ? { verdict: 'warn', snappedTo: solved }
    : { verdict: 'rejected', reason: 'ITEM_DOES_NOT_FIT' };
}

/**
 * Adjudicate a DRAG TARGET for an existing item. Judged against the
 * item's CURRENT room as host: a drag fully outside yields 'rejected'
 * → the shell snaps back to the item's last committed position.
 */
export function judgeMoveTarget(
  plan: FloorplanData,
  itemId: string,
  target: Pt,
): { verdict: 'ok' | 'warn' | 'rejected'; resolved: Pt } {
  const item = flatFurniture(plan).find((f) => f.id === itemId);
  if (!item) return { verdict: 'rejected', resolved: target };
  const host =
    flatRooms(plan).find((r) => r.id === item.roomId) ??
    flatRooms(plan).find((r) => pointInPolygon(target, r.polygon));
  if (!host) return { verdict: 'rejected', resolved: item.position };
  const v = judgeContainment(target, item.footprint, item.rotationDeg, host);
  if (v === 'ok') return { verdict: 'ok', resolved: target };
  const solved = clampPoseIntoRoom(target, item.footprint, item.rotationDeg, host);
  if (solved) return { verdict: 'warn', resolved: solved };
  return { verdict: 'rejected', resolved: item.position };
}

/** Advance rotation by one R-key step (mod 360, CCW). */
export function nextRotation(current: number): number {
  return (((current + ROTATION_STEP_DEG) % 360) + 360) % 360;
}

/**
 * Validate a prospective opening commitment BEFORE dispatching. Wraps
 * validateOpeningCandidate with the room's concrete segment length and
 * adds the same-segment clash check. Reason codes feed the inline msg.
 */
export function validateOpeningDraft(
  plan: FloorplanData,
  roomId: string,
  segmentIndex: number,
  kind: 'door' | 'window',
  tCenter: number,
  width: number,
  sillHeight: number,
  headHeight: number,
): string | null {
  const room = flatRooms(plan).find((r) => r.id === roomId);
  if (!room) return 'UNKNOWN_ROOM';
  const a = room.polygon[segmentIndex];
  const b = room.polygon[(segmentIndex + 1) % room.polygon.length];
  if (!a || !b) return 'UNKNOWN_SEGMENT';
  const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const err = validateOpeningCandidate({
    kind,
    segLen,
    tCenter,
    width,
    sillHeight,
    headHeight,
  });
  if (err) return err;
  const clashes = flatOpenings(plan).some(
    (o) =>
      o.roomId === roomId &&
      o.segmentIndex === segmentIndex &&
      Math.abs(o.tCenter - tCenter) * segLen <
        (o.width + width) / 2 - 1e-9,
  );
  return clashes ? 'CLASHES_EXISTING_OPENING' : null;
}

/** Friendly copy for the inline banner, keyed by validator reason code. */
export function openingErrorMessage(code: string, kind: string): string {
  switch (code) {
    case 'WIDTH_POSITIVE':
      return `${kind}: width must be greater than zero.`;
    case 'OVERFLOW_START':
    case 'OVERFLOW_END':
      return `${kind} is wider than this wall segment — bounced.`;
    case 'TOO_CLOSE_TO_CORNER':
      return `${kind} must keep 0.05 m clear of the wall corners — bounced.`;
    case 'WINDOW_SILL_TOO_LOW':
      return 'Windows need a sill of at least 0.02 m.';
    case 'HEAD_BELOW_SILL':
      return 'Head height must exceed the sill height.';
    case 'NEGATIVE_SILL':
      return 'Sill height cannot be negative.';
    case 'BAD_HEAD_HEIGHT':
      return 'Head height must be positive.';
    case 'CLASHES_EXISTING_OPENING':
      return 'Another opening already occupies this part of the wall.';
    case 'UNKNOWN_ROOM':
    case 'UNKNOWN_SEGMENT':
      return 'Cannot attach this opening to that wall.';
    default:
      return `${kind} rejected (${code}).`;
  }
}

export const FURNITURE_REJECT_COPY =
  'That piece does not fit anywhere in this room — placement cancelled.';
export const MOVE_SNAP_BACK_COPY =
  'Piece pulled outside the room — snapped back to its last valid spot.';
export const DROP_WARN_ADJUSTED_COPY =
  'Placed, but adjusted inward to stay inside the room.';
export const MOVE_WARN_CLAMPED_COPY =
  'Moved, but clamped to keep the piece inside the room.';

/** Recompute the ghost segment info for a hovering opening-tool cursor. */
export function openingGhostFor(
  plan: FloorplanData,
  roomId: string,
  segIndex: number,
  t: number,
  kind: 'door' | 'window',
): GhostPreview {
  const room = flatRooms(plan).find((r) => r.id === roomId);
  const seg = room ? roomSegments(room)[segIndex] : undefined;
  if (!room || !seg) return { kind, valid: false };
  const defs = OPENING_DEFAULTS[kind];
  const err = validateOpeningDraft(
    plan, roomId, segIndex, kind, t, defs.width, defs.sillHeight, defs.headHeight,
  );
  return { kind, seg, t, width: defs.width, valid: err === null };
}

/** Swing-arc geometry for rendering a committed door. */
export function doorSwingGeometry(
  seg: SegmentInfo,
  tCenter: number,
  width: number,
): { hinge: Pt; angleRad: number; radiusPxPerMeterRadius: number; normal: Pt } {
  const hinge = pointAtT(seg, Math.max(0, Math.min(1, tCenter - width / (2 * seg.length))));
  const far = pointAtT(seg, Math.min(1, tCenter + width / (2 * seg.length)));
  return {
    hinge,
    angleRad: Math.atan2(far[1] - hinge[1], far[0] - hinge[0]),
    radiusPxPerMeterRadius: width,
    normal: segmentNormal(seg),
  };
}

/* ================== pkg 13.4 stairs tool math (issue #118) ================ */

/** Default flight width for a fresh drag, meters. */
export const STAIR_DEFAULT_WIDTH_M = 1.0;

/** Preferred tread depth (run per step), meters — drives deriveStepCount. */
export const STAIR_TREAD_TARGET_M = 0.28;

/** Minimum step count (schema floor; the schema itself demands >= this). */
export const STAIR_MIN_STEPS = 3;

/**
 * Drag → flight pose. The ANCHOR is the bottom step's downhill edge
 * centre; the drag vector is the uphill axis, so `run` is the drag
 * length and the footprint centre sits halfway along it (position =
 * anchor + drag/2). rotationDeg is the CCW angle of that axis from +x —
 * the exact convention stairFootprint() consumes. Returns null for a
 * degenerate (zero-length) drag. Pure — unit spec'd.
 */
export function stairFromDrag(
  anchor: Pt,
  cursor: Pt,
): { position: Pt; rotationDeg: number; run: number } | null {
  const dx = cursor[0] - anchor[0];
  const dy = cursor[1] - anchor[1];
  const run = Math.hypot(dx, dy);
  if (!(run > 1e-9)) return null;
  return {
    position: [anchor[0] + dx / 2, anchor[1] + dy / 2],
    rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    run,
  };
}

/**
 * Step count for a given run: tread ≈ STAIR_TREAD_TARGET_M, rounded to
 * an integer, clamped up to the schema floor (>= STAIR_MIN_STEPS).
 * Deterministic so fixtures/e2e can derive exact step counts. Pure.
 */
export function deriveStepCount(run: number): number {
  if (!Number.isFinite(run) || run <= 0) return STAIR_MIN_STEPS;
  return Math.max(STAIR_MIN_STEPS, Math.round(run / STAIR_TREAD_TARGET_M));
}

/**
 * Nearest storey STRICTLY above the departure elevation, or null when
 * the plan has none (the tool then offers the existing addFloor flow).
 * The stair's rise is ALWAYS this Δ — rise is derived, never a freehand
 * number, because validateStairs' gap match (1 mm) demands the flight
 * land exactly on this storey's elevation. Pure — unit spec'd.
 */
export function nearestArrivalFloor(
  plan: FloorplanData,
  departureElevation: number,
): Floor | null {
  let best: Floor | null = null;
  for (const floor of plan.floors) {
    if (floor.elevation <= departureElevation) continue;
    if (best === null || floor.elevation < best.elevation) best = floor;
  }
  return best;
}

/**
 * Elevation of the storey hosting a room (a stair's DEPARTURE level), or
 * null when the room is unknown. Mirrors validateStairs' own lookup so
 * the tool and the compiler always agree on "departure". Pure.
 */
export function stairDepartureElevation(
  plan: FloorplanData,
  roomId: string,
): number | null {
  for (const floor of plan.floors) {
    if (floor.rooms.some((r) => r.id === roomId)) return floor.elevation;
  }
  return null;
}
