/**
 * Plan ingestion for the geometry compiler (issue #5).
 *
 * Wraps pkg 1\'s canonical FloorplanData validator
 * (../shared/schema) — the compiler adds NOTHING to schema rules;
 * it merely lifts the collector-style rejections into our typed
 * FloorplanCompileError taxonomy so callers get one error surface.
 *
 * Beyond the schema, this layer enforces GEOMETRIC validity the
 * schema deliberately leaves open:
 *   - opening overflow on its host segment (OpeningOverflowError,
 *     reporting the widest width that fits at that tCenter)
 *   - pairwise longitudinal overlap of openings on one segment
 *     (OverlappingOpeningsError)
 *   - furniture footprint containment inside its room
 *     (FurnitureOutOfBoundsError)
 */

import type { FloorplanData, Opening, Room } from '../shared/schema';
import { flatFurniture, flatOpenings, flatRooms, openingFitsSegment, validateFloorplan } from '../shared/schema';
import {
  FurnitureOutOfBoundsError,
  InvalidPolygonError,
  MissingRoomReferenceError,
  OpeningOverflowError,
  OverlappingOpeningsError,
  OverlappingStairHolesError,
  StairGapMismatchError,
  StairOutOfBoundsException,
  UnknownStairRoomError,
} from './errors';
import { EPSILON, makeSegments, signArea } from './mathutil';
import { stairFootprint, stairHoleRect } from './stairs';

/** Lift pkg 1\'s validation into the compile-error taxonomy. */
export function parseValidatedPlan(raw: unknown): FloorplanData {
  const result = validateFloorplan(raw);
  if (result.ok) return result.value;
  const first = result.errors[0];
  const detail = first
    ? `${first.path}: ${first.message}`
    : 'unknown schema violation';
  throw new InvalidPolygonError(
    `plan rejected by schema validator (${detail}; ` +
      `${result.errors.length} total violation(s))`,
  );
}

/** Longitudinal span of an opening along its segment, in meters. */
function openingSpan(opening: Opening, segLen: number): [number, number] {
  const center = opening.tCenter * segLen;
  return [center - opening.width / 2, center + opening.width / 2];
}

/** Widest opening that fits at this tCenter (0 when nothing fits). */
export function maxOpeningWidth(tCenter: number, segLen: number): number {
  return Math.max(0, 2 * Math.min(tCenter, 1 - tCenter) * segLen);
}

/** Cross-cutting geometric checks the schema cannot express. */
export function validateGeometry(plan: FloorplanData): void {
  const roomsById = new Map<string, Room>();
  const rooms = flatRooms(plan);
  for (const room of rooms) roomsById.set(room.id, room);

  for (const room of rooms) {
    if (!(signArea(room.polygon) > 0)) {
      throw new InvalidPolygonError(
        `room "${room.id}" polygon winds clockwise; rewind CCW`,
      );
    }
  }

  const perSegment = new Map<string, Opening[]>();
  for (const opening of flatOpenings(plan)) {
    const room = roomsById.get(opening.roomId);
    if (!room) {
      throw new MissingRoomReferenceError('opening', opening.id, opening.roomId);
    }
    if (opening.segmentIndex >= room.polygon.length) {
      throw new InvalidPolygonError(
        `opening "${opening.id}" cites segment ${opening.segmentIndex} of ` +
          `room "${room.id}", which has ${room.polygon.length}`,
      );
    }
    const seg = makeSegments(room.polygon)[opening.segmentIndex];
    if (seg && !openingFitsSegment(opening.tCenter, opening.width, seg.len)) {
      throw new OpeningOverflowError(
        opening.id,
        maxOpeningWidth(opening.tCenter, seg.len),
      );
    }
    const key = `${opening.roomId}:${opening.segmentIndex}`;
    const bucket = perSegment.get(key);
    if (bucket) bucket.push(opening);
    else perSegment.set(key, [opening]);
  }

  for (const bucket of perSegment.values()) {
    const sorted = [...bucket].sort((a, b) =>
      a.tCenter - b.tCenter || (a.id < b.id ? -1 : 1),
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (!prev || !curr) continue;
      const owner = roomsById.get(curr.roomId);
      const segLen = (owner ? makeSegments(owner.polygon)[curr.segmentIndex]?.len : undefined) ?? 0;
      const [, prevEnd] = openingSpan(prev, segLen);
      const [currStart] = openingSpan(curr, segLen);
      if (prevEnd > currStart + EPSILON) {
        throw new OverlappingOpeningsError(prev.id, curr.id);
      }
    }
  }

  for (const item of flatFurniture(plan)) {
    const room = roomsById.get(item.roomId);
    if (!room) {
      throw new MissingRoomReferenceError('furniture', item.id, item.roomId);
    }
    const rad = (item.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = item.footprint[0] / 2;
    const hh = item.footprint[1] / 2;
    const localCorners: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    const corners: [number, number][] = localCorners.map(([lx, ly]): [number, number] => [
      item.position[0] + lx * cos - ly * sin,
      item.position[1] + lx * sin + ly * cos,
    ]);
    // Rooms are assumed convex (validated assumption documented in the
    // sub-plan): all four footprint corners inside <=> whole quad inside.
    const segs = makeSegments(room.polygon);
    const outsideCorner = corners.find(([cx, cy]) =>
      segs.some((s) => {
        const cross =
          (s.bx - s.ax) * (cy - s.ay) - (s.by - s.ay) * (cx - s.ax);
        return cross < -EPSILON;
      }),
    );
    if (outsideCorner) {
      throw new FurnitureOutOfBoundsError(item.id, item.roomId);
    }
  }

  validateStairs(plan, roomsById);
}

/**
 * Stair geometric checks (pkg 7.4, #80): each stair must depart from a
 * KNOWN room on a KNOWN floor, sit fully inside that room, and climb
 * exactly onto a HIGHER floor's elevation (tolerance 1 mm). Landing
 * holes derived from two stairs may not overlap (no unions in v2).
 * Empty stairs[] skips everything — mirrors the skip-when-0 guard in
 * compile.ts, keeping stair-free plans (apartment goldens) untouched.
 */
export function validateStairs(
  plan: FloorplanData,
  roomsById: ReadonlyMap<string, Room>,
): void {
  if (plan.stairs.length === 0) return;

  // roomId -> owning floor's elevation (stairs depart from the LOWER
  // floor; the walk resolver + compile use the same lookup).
  const elevationByRoom = new Map<string, number>();
  for (const floor of plan.floors) {
    for (const room of floor.rooms) {
      elevationByRoom.set(room.id, floor.elevation);
    }
  }

  for (const stair of plan.stairs) {
    const room = roomsById.get(stair.roomId);
    if (!room) {
      throw new UnknownStairRoomError(stair.id, stair.roomId);
    }
    const departure = elevationByRoom.get(stair.roomId)!;
    const higherFloors = plan.floors
      .map((f) => f.elevation)
      .filter((e) => e > departure + EPSILON);
    const arrivalOk = higherFloors.some(
      (e) => Math.abs(e - (departure + stair.rise)) <= 1e-3,
    );
    if (!arrivalOk) {
      throw new StairGapMismatchError(stair.id, departure, stair.rise, higherFloors);
    }

    // Footprint containment: all four corners inside the host room
    // (convex-room assumption, same as the furniture check). The HOST
    // room check uses the raw footprint; the landing hole MAY cross
    // into neighbouring rooms on the arrival floor (holes are punched
    // per-room by overlap, not by ownership).
    const segs = makeSegments(room.polygon);
    const fp = stairFootprint(stair);
    const escaped = (
      [
        [-fp.halfRun, -fp.halfWidth],
        [fp.halfRun, -fp.halfWidth],
        [fp.halfRun, fp.halfWidth],
        [-fp.halfRun, fp.halfWidth],
      ] as Array<[number, number]>
    ).some(([l, w]) => {
      const cx = fp.cx + fp.ux * l + fp.vx * w;
      const cy = fp.cy + fp.uy * l + fp.vy * w;
      return segs.some((s) => {
        const cross =
          (s.bx - s.ax) * (cy - s.ay) - (s.by - s.ay) * (cx - s.ax);
        return cross < -EPSILON;
      });
    });
    if (escaped) {
      throw new StairOutOfBoundsException(stair.id, stair.roomId);
    }
  }

  // Pairwise hole-overlap rejection (deterministic order: plan order).
  // Grouped by ARRIVAL elevation (reviewer #80): two stacked flights in a
  // duplex (arrivals 2.7 and 5.4) punch DIFFERENT slabs — their plan
  // projections may legitimately overlap. #69 forbids overlapping holes
  // per SURFACE, not per plan.
  const holes = plan.stairs.map((s) => ({
    id: s.id,
    rect: stairHoleRect(s),
    arrival: elevationByRoom.get(s.roomId)! + s.rise,
  }));
  for (let i = 0; i < holes.length; i += 1) {
    for (let j = i + 1; j < holes.length; j += 1) {
      const sameArrivalPlane =
        Math.abs(holes[i]!.arrival - holes[j]!.arrival) <= 1e-3;
      if (sameArrivalPlane && rectsOverlap(holes[i]!.rect, holes[j]!.rect)) {
        throw new OverlappingStairHolesError(holes[i]!.id, holes[j]!.id);
      }
    }
  }
}

/** SAT overlap of two convex quads (conservative: separating-axis test). */
function rectsOverlap(a: QuadCornersLike, b: QuadCornersLike): boolean {
  const axesOf = (q: QuadCornersLike): Array<[number, number]> =>
    [0, 1].map((i) => {
      const p = q[i]!;
      const n = q[(i + 1) % 4]!;
      return [-(n[1] - p[1]), n[0] - p[0]] as [number, number];
    });
  const proj = (q: QuadCornersLike, ax: [number, number]): [number, number] => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of q) {
      const d = p[0] * ax[0] + p[1] * ax[1];
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return [lo, hi];
  };
  for (const q of [a, b]) {
    for (const ax of axesOf(q)) {
      const [alo, ahi] = proj(a, ax);
      const [blo, bhi] = proj(b, ax);
      if (ahi <= blo + 1e-9 || bhi <= alo + 1e-9) return false;
    }
  }
  return true;
}

type QuadCornersLike = ReadonlyArray<readonly [number, number]>;
