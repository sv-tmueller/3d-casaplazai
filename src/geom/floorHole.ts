/**
 * Stairwell hole subtraction (issue #80, pkg 7.4).
 *
 * A horizontal room surface (floor OR ceiling) gains RECT holes where
 * staircases land. The holes are DERIVED from the stair footprints
 * (extended one tread past the top riser — see stairs.ts
 * stairHoleRect), never schema fields (#69 §A.2), and they subtract
 * from the RENDERED mesh only: room.polygon — the 2-D data
 * livable-area accounting reads — is untouched, so the measures specs
 * stay green by construction.
 *
 * Both surfaces at the arrival elevation need the punch: the upper
 * floor's slab (the visible landing hole) AND the departure room's
 * CEILING at the same absolute z (without it the walker's head would
 * pierce the ceiling while cresting, and the top tread would z-fight
 * the coplanar ceiling fan).
 *
 * Subtraction strategy: deterministic GUILLOTINE PEEL, not the classic
 * two-vertex bridge. Why: fixtures place holes flush with room rims /
 * poking across room boundaries, where a bridged single-ring earclip
 * degenerates — bridge vertices coincide with ring vertices and the
 * collinear spikes stall the clipper. The peel instead slices the ring
 * by each hole edge's OUTER half-plane in order, collecting the
 * sliced-off side each time:
 *
 *   piece_i = core_i ∩ {p : dot(N_i, p) >= off_i}   (outer side)
 *   core_{i+1} = core_i ∩ {p : dot(N_i, p) <= off_i}
 *
 * The final core IS the hole and is discarded. Multiple holes apply
 * sequentially to the surviving ring list. All arithmetic is
 * vertex-order-linear — byte-stable across runs (golden requirement).
 */

import type { MeshBuffer, QuadCorners } from './types';
import { earClipIndices } from './earclip';
import { snapRound } from './mathutil';

/** Closed CCW polyline (last vertex != first). */
type Ring = Array<[number, number]>;

/**
 * Clip ring against one half-plane: keep the side where
 * dot(normal, p) >= off. Sutherland-Hodgman step; vertices are visited
 * in ring order, so output order is deterministic. Crossing points
 * snap to 1e-4 so shared corners stay bit-identical across slices.
 */
function clipHalfPlane(
  ring: Ring,
  nx: number,
  ny: number,
  off: number,
): Ring {
  const EPS = 1e-9;
  const side = (p: [number, number]): number => nx * p[0] + ny * p[1] - off;
  const out: Ring = [];
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (!a || !b) continue;
    const da = side(a);
    const db = side(b);
    if (da >= -EPS) out.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db);
      out.push([
        snapRound(a[0] + (b[0] - a[0]) * t),
        snapRound(a[1] + (b[1] - a[1]) * t),
      ]);
    }
  }
  return out;
}

/** Intersection of a ring with a rect (hole ring, CCW), as a ring. */
function clipRingToRect(ring: Ring, hole: QuadCorners): Ring {
  let acc = ring;
  for (let i = 0; i < 4; i += 1) {
    const a = hole[i];
    const b = hole[(i + 1) % 4];
    if (!a || !b) continue;
    // Hole ring is CCW: rotating the edge +90° gives the INWARD
    // normal — keep that side.
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const nx = -ey;
    const ny = ex;
    const off = nx * a[0] + ny * a[1];
    acc = clipHalfPlane(acc, nx, ny, off);
    if (acc.length < 3) return [];
  }
  return acc;
}

/**
 * Guillotine peel of one hole out of one ring: returns the side pieces
 * covering ring-minus-hole. Each slice keeps the OUTER side of one
 * hole edge and shrinks the working core toward the hole; the
 * discarded final core IS the hole.
 */
function peelRectOutOfRing(ring: Ring, hole: QuadCorners): Ring[] {
  const pieces: Ring[] = [];
  let core = ring;
  for (let i = 0; i < 4; i += 1) {
    const a = hole[i];
    const b = hole[(i + 1) % 4];
    if (!a || !b) continue;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    // CCW hole: outward normal = rotate edge -90°.
    const nx = ey;
    const ny = -ex;
    const off = nx * a[0] + ny * a[1];
    const outer = clipHalfPlane(core, nx, ny, off);
    if (outer.length >= 3) pieces.push(outer);
    core = clipHalfPlane(core, -nx, -ny, -off);
    if (core.length < 3) break;
  }
  return pieces;
}

/**
 * Triangulate one ring into a horizontal fan mesh at height z.
 * `reversed` flips the winding so ceilings wind DOWN into the room
 * (mirrors packRingFan's contract).
 */
function packRing(ring: Ring, z: number, reversed: boolean): MeshBuffer {
  const xs = ring.map((p) => snapRound(p[0]));
  const ys = ring.map((p) => snapRound(p[1]));
  const tris = earClipIndices(xs, ys);
  const positions = new Float32Array(ring.length * 3);
  ring.forEach((_p, i) => {
    positions[i * 3] = xs[i];
    positions[i * 3 + 1] = ys[i];
    positions[i * 3 + 2] = snapRound(z);
  });
  const flat: number[] = [];
  for (const tri of tris) {
    const a = tri[0];
    const b = tri[1];
    const c = tri[2];
    if (a === undefined || b === undefined || c === undefined) continue;
    if (reversed) flat.push(a, c, b);
    else flat.push(a, b, c);
  }
  return { positions, indices: new Uint32Array(flat) };
}

/**
 * Horizontal surface mesh of one room with RECT holes punched out
 * (issue #80). Returns null when NO hole overlaps the room (callers
 * keep the plain fan — protects stair-free goldens byte-for-byte).
 *
 * Guarantees: room.polygon untouched (copy-in, mesh-out); deterministic
 * output (slice order fixed by hole order, then ring order); snapped
 * crossings; one concatenated buffer per room regardless of peel count.
 */
export function buildFloorWithHoles(
  roomPolygon: readonly [number, number][],
  holes: readonly QuadCorners[],
  z: number,
  reversed: boolean,
): MeshBuffer | null {
  if (holes.length === 0) return null;
  let rings: Ring[] = [roomPolygon.map((p) => [p[0], p[1]] as [number, number])];
  let punched = false;
  for (const hole of holes) {
    const next: Ring[] = [];
    for (const ring of rings) {
      if (clipRingToRect(ring, hole).length < 3) {
        next.push(ring); // hole misses this ring entirely
        continue;
      }
      punched = true;
      next.push(...peelRectOutOfRing(ring, hole));
    }
    rings = next;
  }
  if (!punched) return null;

  const buffers = rings.map((ring) => packRing(ring, z, reversed));
  let posTotal = 0;
  let idxTotal = 0;
  for (const b of buffers) {
    posTotal += b.positions.length;
    idxTotal += b.indices.length;
  }
  const positions = new Float32Array(posTotal);
  const indices = new Uint32Array(idxTotal);
  let posCur = 0;
  let idxCur = 0;
  let vertBase = 0;
  for (const b of buffers) {
    positions.set(b.positions, posCur);
    for (let i = 0; i < b.indices.length; i += 1) {
      indices[idxCur + i] = b.indices[i] + vertBase;
    }
    posCur += b.positions.length;
    idxCur += b.indices.length;
    vertBase += b.positions.length / 3;
  }
  return { positions, indices };
}
