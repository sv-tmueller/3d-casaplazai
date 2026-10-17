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
import { openingFitsSegment, validateFloorplan } from '../shared/schema';
import {
  FurnitureOutOfBoundsError,
  InvalidPolygonError,
  MissingRoomReferenceError,
  OpeningOverflowError,
  OverlappingOpeningsError,
} from './errors';
import { EPSILON, makeSegments, signArea } from './mathutil';

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
  for (const room of plan.rooms) roomsById.set(room.id, room);

  for (const room of plan.rooms) {
    if (!(signArea(room.polygon) > 0)) {
      throw new InvalidPolygonError(
        `room "${room.id}" polygon winds clockwise; rewind CCW`,
      );
    }
  }

  const perSegment = new Map<string, Opening[]>();
  for (const opening of plan.openings) {
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

  for (const item of plan.furniture) {
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
}
