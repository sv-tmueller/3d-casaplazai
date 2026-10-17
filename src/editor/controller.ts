/**
 * Pointer/keyboard controller for the 2D editor canvas.
 *
 * Owns: camera (pan/zoom), the tool FSM, snap logic, and translation of
 * gestures into store Commands. Deliberately split so the gesture math
 * and FSM transitions stay unit-testable without a real canvas.
 */
import type { FloorplanData, Room } from '../shared/schema';
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
export const GRID_M = 0.5; // meter grid pitch
export const SNAP_TOL_PX = 8;

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
  | { tag: 'dragging'; grabOffset: Pt; selectedRoomId: string }
  | { tag: 'resizing'; vertexIndex: number; selectedRoomId: string }
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
  const others = plan.rooms.filter((r) => !excludeIds.includes(r.id));

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
  for (let i = plan.rooms.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(worldPt, plan.rooms[i].polygon)) return plan.rooms[i];
  }
  return null;
}

/* ------------------------------ Overlap eval ------------------------------ */

/** Sorted [idA, idB] pairs whose convex hulls positively intersect. */
export function computeOverlaps(plan: FloorplanData): [string, string][] {
  const pairs: [string, string][] = [];
  const hullCache = new Map<string, Pt[]>();
  for (const r of plan.rooms) {
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

/* ------------------------------ Winding util ------------------------------ */

export function ensureCCW(poly: Pt[]): Pt[] {
  return signedArea(poly) < 0 ? poly.slice().reverse() : poly;
}

export { snapVec };
