/**
 * Spawn solver (issue #6): analytic placement of the walk-camera inside
 * the LARGEST room (shoelace area), at its true polygon centroid, faced
 * along the room's widest principal extent. Centroid colliding with a
 * collision AABB triggers a clearance march through candidate interior
 * points (fan-cell centroids) until a legally clear spot is found;
 * impossibility throws a typed SpawnFailureError (HUD-toastable).
 */

import type { Room } from '../shared/schema';
import type { CollisionBox } from './types';
import { VIEWER_PLAYER_RADIUS } from './types';
import { pointInside } from './collision';

/** Typed failure surfaced as a HUD toast, never a crash. */
export class SpawnFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpawnFailureError';
  }
}

/** Shoelace signed area (positive for CCW rings). */
export function polygonArea(polygon: readonly [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/** Area-weighted polygon centroid (handles non-rectangular rings). */
export function polygonCentroid(
  polygon: readonly [number, number][],
): [number, number] {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate ring: fall back to vertex average.
    let sx = 0;
    let sy = 0;
    for (const p of polygon) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / polygon.length, sy / polygon.length];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

/** Fan-cell centroids of the room polygon (clearance march targets). */
function fanCellCentroids(
  polygon: readonly [number, number][],
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 1; i < polygon.length - 1; i += 1) {
    const a = polygon[0];
    const b = polygon[i];
    const c = polygon[i + 1];
    if (!a || !b || !c) continue;
    pts.push([
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
    ]);
  }
  return pts.sort(byDistanceFromOrigin);
}

function byDistanceFromOrigin(
  a: [number, number],
  b: [number, number],
): number {
  return Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]);
}

/** Widest-axis facing yaw: compare extents along the two extreme segment dirs. */
function facingYaw(polygon: readonly [number, number][]): number {
  let exX = -Infinity;
  let eyY = -Infinity;
  for (const p of polygon) {
    if (!p) continue;
    exX = Math.max(exX, p[0]);
    eyY = Math.max(eyY, p[1]);
  }
  let minX = Infinity;
  let minY = Infinity;
  for (const p of polygon) {
    if (!p) continue;
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
  }
  const extX = exX - minX;
  const extY = eyY - minY;
  // Face the wider extent (+X eastward or +Y northward).
  return extX >= extY ? Math.PI / 2 : 0;
}

/** Is the candidate point legally clear of every collision box? */
export function isClear(
  x: number,
  y: number,
  boxes: readonly CollisionBox[],
  marginFactor = 1.0,
): boolean {
  const pad = VIEWER_PLAYER_RADIUS * marginFactor - VIEWER_PLAYER_RADIUS;
  for (const box of boxes) {
    if (
      x >= box.minX - pad &&
      x <= box.maxX + pad &&
      y >= box.minY - pad &&
      y <= box.maxY + pad
    ) {
      return false;
    }
  }
  return true;
}

/** Resolve a spawn pose for a plan's rooms + collision boxes. */
export function solveSpawn(
  rooms: readonly Room[],
  boxes: readonly CollisionBox[],
): { x: number; y: number; yaw: number } {
  if (rooms.length === 0) {
    throw new SpawnFailureError('No rooms to spawn into.');
  }

  let best: Room | undefined;
  let bestArea = -Infinity;
  for (const room of rooms) {
    const area = polygonArea(room.polygon);
    if (area > bestArea) {
      bestArea = area;
      best = room;
    }
  }
  if (!best) throw new SpawnFailureError('Could not rank rooms.');

  return solveSpawnInRoom(best, boxes);
}

/**
 * Resolve a spawn pose inside ONE room (issue #147 CP2): the same
 * centroid → clearance-march → bisection ladder solveSpawn runs, with
 * the room choice made by the caller. The go-to-room teleport needs
 * exactly this — the largest-room ranking would otherwise yank the
 * walker into a different room than the one the user picked.
 */
export function solveSpawnInRoom(
  room: Room,
  boxes: readonly CollisionBox[],
): { x: number; y: number; yaw: number } {
  const [cx, cy] = polygonCentroid(room.polygon);
  const yaw = facingYaw(room.polygon);

  if (isClear(cx, cy, boxes)) {
    return { x: cx, y: cy, yaw };
  }

  // March: fan-cell centroids, ordered near-origin first for determinism.
  for (const [mx, my] of fanCellCentroids(room.polygon)) {
    if (isClear(mx, my, boxes, 1.5)) {
      return { x: mx, y: my, yaw };
    }
  }

  // Last resort: bisect from centroid toward each polygon vertex.
  for (const p of room.polygon) {
    if (!p) continue;
    for (let t = 0.25; t <= 0.75; t += 0.25) {
      const px = cx + (p[0] - cx) * t;
      const py = cy + (p[1] - cy) * t;
      if (isClear(px, py, boxes, 1.5)) {
        return { x: px, y: py, yaw };
      }
    }
  }

  throw new SpawnFailureError(
    `No clear spawn found in room "${room.name}" — collision volumes saturate it.`,
  );
}

/** Convenience predicate for callers wanting point-legality checks. */
export function pointLegallyClear(
  x: number,
  y: number,
  boxes: readonly CollisionBox[],
): boolean {
  return !boxes.some((box) => pointInside(box, x, y));
}
