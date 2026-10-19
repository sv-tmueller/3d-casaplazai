/**
 * Roof plane geometry (issue #83, pkg 8.1).
 *
 * Consumes the VALIDATED per-wall RoofSpec leans (the schema validator
 * has already guaranteed: at most one shed lean or one gable pair per
 * room, opposing/parallel/equal-length/aligned pairs, plates clearing
 * wallHeight, top-floor-only). Emits per-room roof-plane MESH BUFFERS
 * in WORLD z (the caller passes the top floor's elevation; positions
 * here are already world z like the stair emitters).
 *
 * Shape contract (deterministic, golden-stable; coordinates snap to
 * 1e-4 like every other emitter):
 *   - SINGLE lean (shed): ONE quad sloping inward-UP from the leaned
 *     wall's top edge (the eave, at the wallsOverride-aware plate
 *     height) at leanDeg above horizontal, terminating at the station
 *     of the room's farthest inland vertex along the segment's inward
 *     normal. Convex rooms: the plane exactly spans wall-to-wall.
 *   - PAIR of leans (gable): two quads rising from both eaves to the
 *     DERIVED ridge line (never a schema field — #69
 *     no-unconsumed-fields) + two TRIANGULAR end caps closing the
 *     gable's open ends.
 *
 * Orientation: every triangle is emitted with an UPWARD plan-space
 * normal (nz > 0 after the winding fix below), matching the floor
 * fans' convention; the material's sidedness is a viewer concern.
 */

import type { Room } from '../shared/schema';
import type { MeshBuffer } from './types';
import { makeSegments, snapRound } from './mathutil';

/**
 * Plate height of segment si honouring wallsOverride duplicates with
 * MIN WINS (#69): the LOWER plate governs, so a rogue taller duplicate
 * can never hide one that dips into walkable space. Mirrors the
 * schema validator's own plateOf so geometry and validation agree.
 */
export function roofPlateHeight(
  room: Room,
  wallHeight: number,
  si: number,
): number {
  let plate: number | undefined;
  for (const w of room.wallsOverride ?? []) {
    if (w.segmentIndex === si) {
      plate = plate === undefined ? w.height : Math.min(plate, w.height);
    }
  }
  return plate ?? wallHeight;
}

/** Positive (>0) lean rows of one room, sorted by segment index. */
export function positiveLeans(
  room: Room,
): Array<{ si: number; leanDeg: number }> {
  const rows = (room.roofs ?? [])
    .filter((r) => r.leanDeg > 0)
    .map((r) => ({ si: r.segmentIndex, leanDeg: r.leanDeg }));
  rows.sort((a, b) => a.si - b.si);
  return rows;
}

/**
 * Whole-plan predicate gating every roof computation in compile.ts
 * (mirrors the stairs length>0 guard): roof-free plans must compile
 * BYTE-IDENTICALLY to the pre-8.1 pipeline — apartment goldens.
 */
export function hasAnyRoof(
  plan: { floors: Array<{ rooms: Room[] }> },
): boolean {
  return plan.floors.some((f) =>
    f.rooms.some((r) => (r.roofs ?? []).some((spec) => spec.leanDeg > 0)),
  );
}

/**
 * Build one room's roof plane buffers (pkg 8.1). Returns [] for
 * lean-free rooms — the common case pays only the positiveLeans scan.
 * Caller merges the returned buffers into the room's RoofSolid.
 */
export function buildRoomRoofs(
  room: Room,
  planWallHeight: number,
  /** World z of the room's walking surface (top floor's elevation). */
  zFloor: number,
): MeshBuffer[] {
  const leans = positiveLeans(room);
  if (leans.length === 0) return [];
  if (leans.length === 1) {
    const { si, leanDeg } = leans[0]!;
    return [shedQuad(room, planWallHeight, si, leanDeg, zFloor)];
  }
  // The validator guarantees exactly two positive leans form a gable
  // (opposing, parallel, equal-length, aligned) — anything else never
  // reaches the compiler.
  return gableBuffers(room, planWallHeight, leans, zFloor);
}

/** One shed plane: eave quad rising inland to the farthest vertex station. */
function shedQuad(
  room: Room,
  wallHeight: number,
  si: number,
  leanDeg: number,
  zFloor: number,
): MeshBuffer {
  const segs = makeSegments(room.polygon);
  const seg = segs[si]!;
  const plate = roofPlateHeight(room, wallHeight, si);
  const tan = Math.tan((leanDeg * Math.PI) / 180);

  // Farthest inland station along the segment's inward normal: the
  // plane's terminus. For convex rooms this is exactly the opposite
  // wall's line, so the plane spans the room wall-to-wall; for odd
  // outlines it deterministically overshoots to the deepest vertex
  // (never undershoots — the eave edge always closes the leaned wall).
  let depth = 0;
  for (const v of room.polygon) {
    const d = seg.nx * (v[0] - seg.ax) + seg.ny * (v[1] - seg.ay);
    if (d > depth) depth = d;
  }
  if (depth <= 1e-9) return emptyBuffer();

  const eaveZ = zFloor + plate;
  const termZ = zFloor + plate + tan * depth;
  // Eave edge on the polygon line (the wall's inner face — the plane
  // never leaves the room footprint; the slab's outer rim stays
  // visible as the parapet lip).
  const a: V3 = [seg.ax, seg.ay, eaveZ];
  const b: V3 = [seg.bx, seg.by, eaveZ];
  const a2: V3 = [seg.ax + seg.nx * depth, seg.ay + seg.ny * depth, termZ];
  const b2: V3 = [seg.bx + seg.nx * depth, seg.by + seg.ny * depth, termZ];
  return quad(a, b, b2, a2);
}

/** Gable: two rising quads + two end caps meeting at the derived ridge. */
function gableBuffers(
  room: Room,
  wallHeight: number,
  leans: Array<{ si: number; leanDeg: number }>,
  zFloor: number,
): MeshBuffer[] {
  const segs = makeSegments(room.polygon);
  const la = leans[0]!;
  const lb = leans[1]!;
  const segA = segs[la.si]!;
  const segB = segs[lb.si]!;
  const pa = roofPlateHeight(room, wallHeight, la.si);
  const pb = roofPlateHeight(room, wallHeight, lb.si);
  const ta = Math.tan((la.leanDeg * Math.PI) / 180);
  const tb = Math.tan((lb.leanDeg * Math.PI) / 180);

  // Between two opposing segments, dA + dB is constant (= the wall-line
  // separation measured along A's inward normal); solving the plane
  // intersection pa + ta*d = pb + tb*(sep - d) yields the ridge station.
  // Identical algebra to the validator's checkRoomRoofs — geometry and
  // validation can never disagree on where the ridge sits.
  const sep =
    segA.nx * (segB.ax - segA.ax) + segA.ny * (segB.ay - segA.ay);
  const dRidge = (pb - pa + tb * sep) / (ta + tb);
  const zRidge = zFloor + pa + ta * dRidge;

  // Ridge endpoints: A's endpoints marched inland by dRidge. Because
  // the validator pinned the pair equal-length and aligned, these are
  // simultaneously B's corresponding endpoints marched by (sep - dRidge).
  const rid0: V3 = [
    segA.ax + segA.nx * dRidge,
    segA.ay + segA.ny * dRidge,
    zRidge,
  ];
  const rid1: V3 = [
    segA.bx + segA.nx * dRidge,
    segA.by + segA.ny * dRidge,
    zRidge,
  ];

  const ea0: V3 = [segA.ax, segA.ay, zFloor + pa];
  const eb0: V3 = [segA.bx, segA.by, zFloor + pa];
  // B's eave corners CROSS-paired: an opposing segment traverses the
  // ridge axis backwards, so B's END shares A's START station.
  const fb0: V3 = [segB.bx, segB.by, zFloor + pb];
  const ff0: V3 = [segB.ax, segB.ay, zFloor + pb];

  return [
    // A-side plane (rising quad).
    quad(ea0, eb0, rid1, rid0),
    // B-side plane.
    quad(fb0, ff0, rid0, rid1),
    // End caps (vertical closers at the gable's open ends).
    tri(ea0, rid0, fb0),
    tri(eb0, ff0, rid1),
  ];
}

/** Position triple, meters. */
type V3 = [number, number, number];

/**
 * Indexed quad (4 shared vertices, 2 triangles), corners supplied in
 * plan-space CCW order viewed from OUTSIDE/above; winding is FIXED to
 * an upward normal (matching the floor fans' convention) by flipping
 * the diagonal when the cross product points down.
 */
function quad(p0: V3, p1: V3, p2: V3, p3: V3): MeshBuffer {
  const nz =
    (p1[0] - p0[0]) * (p3[1] - p0[1]) - (p1[1] - p0[1]) * (p3[0] - p0[0]);
  const positions = new Float32Array(12);
  const pts = [p0, p1, p2, p3];
  for (let i = 0; i < 4; i += 1) {
    positions[i * 3] = snapRound(pts[i]![0]);
    positions[i * 3 + 1] = snapRound(pts[i]![1]);
    positions[i * 3 + 2] = snapRound(pts[i]![2]);
  }
  const indices =
    nz >= 0
      ? new Uint32Array([0, 1, 2, 0, 2, 3])
      : new Uint32Array([0, 3, 2, 0, 2, 1]);
  return { positions, indices };
}

/**
 * Single-triangle buffer with UPWARD-fixed winding: if the plan-space
 * cross product points down, the corner order flips. Keeps every roof
 * triangle consistent with the floor fans regardless of which side of
 * the ridge it came from.
 */
function tri(p0: V3, p1: V3, p2: V3): MeshBuffer {
  const nz =
    (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
  const [q1, q2] = nz < 0 ? [p2, p1] : [p1, p2];
  const positions = new Float32Array(9);
  const pts = [p0, q1, q2];
  for (let i = 0; i < 3; i += 1) {
    positions[i * 3] = snapRound(pts[i]![0]);
    positions[i * 3 + 1] = snapRound(pts[i]![1]);
    positions[i * 3 + 2] = snapRound(pts[i]![2]);
  }
  return { positions, indices: new Uint32Array([0, 1, 2]) };
}

/** Degenerate fallback (zero-area room outline): empty buffer, no tris. */
function emptyBuffer(): MeshBuffer {
  return { positions: new Float32Array(0), indices: new Uint32Array(0) };
}
