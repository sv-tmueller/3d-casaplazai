/**
 * Horizontal surfaces per room: floor at z=0, ceiling at effective
 * wall height (issue #5). Both are ear-clipped fans of the room ring;
 * the ceiling reverses winding so normals face DOWN (into the room).
 */

import type { Room } from '../shared/schema';
import type { MeshBuffer } from './types';
import { packRingFan } from './meshio';
import { wallHeightForSegment } from './walls';

/**
 * Ceiling rides the LOWEST overridden wall so no room leaks above its
 * shortest enclosing wall (accepted v1 cosmetic-gap tradeoff).
 */
export function effectiveCeilingHeight(room: Room, wallHeight: number): number {
  const n = room.polygon.length;
  let minH = Infinity;
  for (let si = 0; si < n; si += 1) {
    minH = Math.min(minH, wallHeightForSegment(room, wallHeight, si));
  }
  return minH;
}

/** Floor mesh at z = 0 (normals up, CCW viewed from above). */
export function buildFloor(room: Room): MeshBuffer {
  return packRingFan(room.polygon.map((p) => [p[0], p[1]]) as [number, number][], 0, false);
}

/** Ceiling mesh at z = effectiveHeight (normals down). */
export function buildCeiling(room: Room, wallHeight: number): MeshBuffer {
  return packRingFan(
    room.polygon.map((p) => [p[0], p[1]]) as [number, number][],
    effectiveCeilingHeight(room, wallHeight),
    true,
  );
}
