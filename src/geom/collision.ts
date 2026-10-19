/**
 * Collision assembly (issue #5): axis-aligned bounding boxes per SOLID
 * wall piece, expanded by PLAYER_RADIUS so capsule-style movement
 * clips before touching plaster. Door/window holes therefore become
 * walk-through gaps: a straight corridor through a doorway crosses
 * zero wall AABBs (probe-tested).
 */

import type { FloorplanData, FurnitureItem, Opening, Room } from '../shared/schema';
import { flatFurniture, flatOpenings, flatRooms } from '../shared/schema';
import type { Aabb } from './types';
import {
  partitionLongitudinal,
  partitionVertical,
  wallHeightForSegment,
  type WallPieceSpec,
} from './walls';
import { makeSegments } from './mathutil';

/** Clearance added to every collision box, meters. */
export const PLAYER_RADIUS = 0.3;

/**
 * AABB of one solid wall-piece spec positioned along a segment. Carries
 * the piece's z range (issue #76) so per-floor compilation can lift the
 * box to its storey and walk-confinement can respect the visitor's
 * elevation band.
 */
export function collideWallPiece(
  spec: WallPieceSpec,
  ax: number,
  ay: number,
  ux: number,
  uy: number,
  thickness: number,
): Aabb {
  // Half-extents perpendicular to the segment direction.
  const hx = (thickness / 2) * Math.abs(uy);
  const hy = (thickness / 2) * Math.abs(ux);
  const p0x = ax + ux * spec.s0;
  const p0y = ay + uy * spec.s0;
  const p1x = ax + ux * spec.s1;
  const p1y = ay + uy * spec.s1;
  const xs = [p0x - hx, p0x + hx, p1x - hx, p1x + hx];
  const ys = [p0y - hy, p0y + hy, p1y - hy, p1y + hy];
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minZ: spec.z0,
    maxZ: spec.z1,
  };
}

/** Expand an AABB by the player clearance. */
export function expandPlayerRadius(box: Aabb, radius = PLAYER_RADIUS): Aabb {
  return {
    minX: box.minX - radius,
    minY: box.minY - radius,
    maxX: box.maxX + radius,
    maxY: box.maxY + radius,
    ...(box.minZ !== undefined && box.maxZ !== undefined
      ? { minZ: box.minZ, maxZ: box.maxZ }
      : {}),
  };
}

/** Does the xy segment p->q cross any (expanded) collision box? */
export function segmentHitsBoxes(px: number, py: number, qx: number, qy: number, boxes: readonly Aabb[]): boolean {
  for (const box of boxes) {
    // Liang-Barsky style param clip of the segment against the box.
    const dx = qx - px;
    const dy = qy - py;
    let tEnter = 0;
    let tExit = 1;
    let missed = false;
    const axes: [number, number, number, number][] = [
      [px, dx, box.minX, box.maxX],
      [py, dy, box.minY, box.maxY],
    ];
    for (const [p, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-12) {
        if (p < lo || p > hi) {
          missed = true;
          break;
        }
        continue;
      }
      let t0 = (lo - p) / d;
      let t1 = (hi - p) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tEnter = Math.max(tEnter, t0);
      tExit = Math.min(tExit, t1);
      if (tEnter > tExit) {
        missed = true;
        break;
      }
    }
    if (!missed) return true;
  }
  return false;
}

/** Raw (unexpanded) AABBs for one room's solid wall pieces. */
export function roomCollisionPieces(room: Room, plan: FloorplanData): Aabb[] {
  const out: Aabb[] = [];
  const segs = makeSegments(room.polygon);
  const openingsHere = flatOpenings(plan).filter((o) => o.roomId === room.id);
  const bySeg = new Map<number, Opening[]>();
  for (const o of openingsHere) {
    const arr = bySeg.get(o.segmentIndex);
    if (arr) arr.push(o);
    else bySeg.set(o.segmentIndex, [o]);
  }
  for (let si = 0; si < segs.length; si += 1) {
    const seg = segs[si];
    if (!seg) continue;
    const effHeight = wallHeightForSegment(room, plan.wallHeight, si);
    const openings = bySeg.get(si) ?? [];
    const spans = partitionLongitudinal(seg.len, openings);
    for (const span of spans) {
      const spec: WallPieceSpec = { ...span, z0: 0, z1: effHeight, segIndex: si };
      out.push(collideWallPiece(spec, seg.ax, seg.ay, seg.ux, seg.uy, plan.wallThickness));
    }
    // Raised openings contribute their below-sill slab as a barrier.
    for (const opening of openings) {
      const center = opening.tCenter * seg.len;
      const span = {
        s0: center - opening.width / 2,
        s1: center + opening.width / 2,
        rimSide: 'none' as const,
      };
      for (const slab of partitionVertical(span, opening, effHeight)) {
        if (slab.z0 <= 1e-9) {
          out.push(collideWallPiece(slab, seg.ax, seg.ay, seg.ux, seg.uy, plan.wallThickness));
        }
      }
    }
  }
  return out;
}

/** Collect expanded collision boxes for every solid wall piece. */
export function buildCollisions(plan: FloorplanData): Aabb[] {
  const boxes: Aabb[] = [];
  for (const room of flatRooms(plan)) {
    boxes.push(...roomCollisionPieces(room, plan));
  }
  return boxes.map((box) => expandPlayerRadius(box));
}

/**
 * Bottom/top heights of one furniture type's oriented volume, meters.
 * Single source shared by the render volumes (compile.ts) and the
 * collision boxes so the two can never disagree (issue #76: the
 * invisible-breakage trap — furniture collision boxes must fence the
 * SAME z band the rendered prism occupies, on the SAME storey).
 */
export function furnitureZRange(type: FurnitureItem['type']): [number, number] {
  switch (type) {
    case 'bed':
      return [0, 0.55];
    case 'sofa':
      return [0, 0.8];
    case 'table':
      return [0, 0.75];
    case 'chair':
      return [0, 0.45];
    case 'counter':
      return [0, 0.9];
    case 'bathtub':
      return [0, 0.6];
    default:
      return [0, 0.75]; // toilet
  }
}

/**
 * Expanded collision box for ONE furniture footprint (issue #76 split
 * out of furnitureCollisionBoxes so per-floor compilation can lift each
 * box to its owning storey): the rotated-corner AABB of the stamped
 * item, grown by PLAYER_RADIUS, carrying the type's z band.
 */
export function furnitureCollisionBox(item: FurnitureItem): Aabb {
  const [fx, fy] = item.footprint;
  const hw = fx / 2;
  const hh = fy / 2;
  const rad = (item.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [lx, ly] of [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]) {
    xs.push(item.position[0] + lx * cos - ly * sin);
    ys.push(item.position[1] + lx * sin + ly * cos);
  }
  const [zMin, zMax] = furnitureZRange(item.type);
  return expandPlayerRadius({
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minZ: zMin,
    maxZ: zMax,
  });
}

/**
 * Expanded collision boxes for furniture footprints (issue #18), flat
 * across all floors at their plan-local z. Kept for flat consumers;
 * per-floor compilation (compile.ts) lifts each box individually via
 * furnitureCollisionBox.
 */
export function furnitureCollisionBoxes(plan: FloorplanData): Aabb[] {
  return flatFurniture(plan).map(furnitureCollisionBox);
}
