/**
 * Furniture model layer (pkg 3) — pure helpers: default footprints,
 * rotated-extent math (correct for NON-SQUARE rotations), point-in-
 * polygon containment, and the clamp solver used by move/drag.
 * Zero DOM.
 */
import type { FloorplanData, FurnitureItem, Room, Vec2 } from '../../shared/schema';
import { FURNITURE_DEFAULTS } from './constants';

export { FURNITURE_DEFAULTS };
export type { FurnitureTypeName } from './constants';

/** Four corners of the UNROTATED footprint rect centered at origin. */
function unrotatedCorners(w: number, h: number): Vec2[] {
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
}

/** Rotate a point θ radians CCW around the origin. */
function rot(pt: Vec2, thetaRad: number): Vec2 {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  return [pt[0] * c - pt[1] * s, pt[0] * s + pt[1] * c];
}

/**
 * Effective AXIS-ALIGNED occupied extent [extentX, extentY] of a
 * footprint rotated by rotationDeg CCW. Correct for non-square
 * footprints at arbitrary angles (uses all four rotated corners).
 */
export function rotatedExtent(
  footprint: Vec2,
  rotationDeg: number,
): [number, number] {
  const theta = (rotationDeg * Math.PI) / 180;
  const corners = unrotatedCorners(footprint[0], footprint[1]).map((p) => rot(p, theta));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

/** World-space corners of a placed item (rotated around position). */
export function itemCorners(item: FurnitureItem): Vec2[] {
  const theta = (item.rotationDeg * Math.PI) / 180;
  return unrotatedCorners(item.footprint[0], item.footprint[1])
    .map((p) => rot(p, theta))
    .map(([x, y]) => [x + item.position[0], y + item.position[1]]);
}

/** Ray-casting point-in-polygon test. Boundary handling irrelevant here. */
export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Strict containment: EVERY rotated corner must lie inside the room
 * polygon (with a small outward slack so touching-the-wall poses pass).
 */
export function containedByRoom(
  pos: Vec2,
  footprint: Vec2,
  rotationDeg: number,
  room: Room,
  slack = 1e-6,
): boolean {
  const theta = (rotationDeg * Math.PI) / 180;
  return unrotatedCorners(footprint[0], footprint[1])
    .map((p) => rot(p, theta))
    .every(([ox, oy]) => {
      const wx = ox + pos[0];
      const wy = oy + pos[1];
      return pointInPolygonSlack(wx, wy, room.polygon, slack);
    });
}

function pointInPolygonSlack(x: number, y: number, poly: Vec2[], slack: number): boolean {
  // Cheap approach: shrink nothing; expand the polygon test by nudging
  // the sample toward the polygon centroid proportionally to slack.
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  cx /= poly.length;
  cy /= poly.length;
  const nx = x + (cx - x) * slack;
  const ny = y + (cy - y) * slack;
  return pointInPolygon([nx, ny], poly);
}

/** Resolve a room by id (undefined when dangling). */
export function roomById(plan: FloorplanData, roomId: string): Room | undefined {
  return plan.rooms.find((r) => r.id === roomId);
}

/**
 * Clamp solver: given an intended pose and its hosting room, find the
 * NEAREST fully-contained pose (axis-aligned AABB of the rotated
 * footprint pushed back inside the polygon bbox refined per-axis).
 * Returns null when even the bbox-centered pose cannot contain it.
 */
export function clampPoseIntoRoom(
  pos: Vec2,
  footprint: Vec2,
  rotationDeg: number,
  room: Room,
): Vec2 | null {
  const ext = rotatedExtent(footprint, rotationDeg);
  const xs = room.polygon.map((p) => p[0]);
  const ys = room.polygon.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Feasibility via bounding-box: AABB must fit the room bbox.
  if (ext[0] > maxX - minX || ext[1] > maxY - minY) return null;

  const clampedX = Math.min(maxX - ext[0] / 2, Math.max(minX + ext[0] / 2, pos[0]));
  const clampedY = Math.min(maxY - ext[1] / 2, Math.max(minY + ext[1] / 2, pos[1]));

  const attempt: Vec2 = [clampedX, clampedY];
  if (containedByRoom(attempt, footprint, rotationDeg, room)) return attempt;

  // Concave-room fallback: march from the attempted pose toward the
  // centroid until containment succeeds (bounded iterations).
  let cx = 0;
  let cy = 0;
  for (const p of room.polygon) {
    cx += p[0];
    cy += p[1];
  }
  cx /= room.polygon.length;
  cy /= room.polygon.length;
  for (let k = 1; k <= 64; k += 1) {
    const f = k / 64;
    const probe: Vec2 = [attempt[0] + (cx - attempt[0]) * f, attempt[1] + (cy - attempt[1]) * f];
    if (containedByRoom(probe, footprint, rotationDeg, room)) return probe;
  }
  return null;
}

/**
 * Placement adjudication for a candidate pose. Mirrors the AC wording:
 * 'fully outside any room' → PREVENT (snap-back); escaping while still
 * overlapping the room → WARN + accept (clamped variant chosen by the
 * caller). Returns a stable verdict.
 */
export type ContainmentVerdict = 'ok' | 'warn' | 'reject';

export function judgeContainment(
  pos: Vec2,
  footprint: Vec2,
  rotationDeg: number,
  room: Room | undefined,
): ContainmentVerdict {
  if (!room) return 'reject';
  if (containedByRoom(pos, footprint, rotationDeg, room)) return 'ok';
  // Partial escape: does the CENTER still sit inside?
  if (pointInPolygon(pos, room.polygon)) return 'warn';
  return 'reject';
}
