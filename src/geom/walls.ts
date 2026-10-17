/**
 * Segmented-wall assembly (issue #5, sub-plan strategy).
 *
 * Strategy: rectangular slabs partitioned around openings — CSG-lite
 * declined per advisor decision (fewer failure modes, deterministic,
 * collision AABBs fall out for free).
 *
 * Algorithm per wall segment:
 *   1. Sort the segment's openings by tCenter.
 *   2. Partition longitudinally into alternating solid gaps and
 *      opening spans.
 *   3. Vertically partition each span into slabs: below-sill (iff
 *      sillHeight > 0), above-head (iff headHeight < effHeight).
 *   4. Emit each solid piece as a parallelepiped along the segment
 *      direction (works for diagonal walls identically) with quads on
 *      both faces + rims, triangulated deterministically.
 *
 * Accepted v1 limitation (logged in sub-plan): interior shared walls
 * emit thin duplicate slabs (one per adjoining room); harmless visually.
 */

import type { Opening, Room } from '../shared/schema';
import type { MeshBuffer } from './types';
import { snapRound } from './mathutil';

/** Effective wall height honoring wallsOverride for one segment. */
export function wallEffectiveHeight(room: Room, wallHeight: number): number {
  return wallHeightForSegment(room, wallHeight, 0);
}

/** Override-aware wall height for ARBITRARY segment. */
export function wallHeightForSegment(room: Room, wallHeight: number, segmentIndex: number): number {
  const ov = room.wallsOverride?.find((w) => w.segmentIndex === segmentIndex);
  return ov ? ov.height : wallHeight;
}

/** Longitudinal solid interval descriptor for one segment. */
export interface WallPieceSpec {
  /** Along-segment start/end in METERS from segment start. */
  s0: number;
  s1: number;
  /** Vertical extents. */
  z0: number;
  z1: number;
  /** Host segment info. */
  segIndex: number;
  /** Whether this piece borders an opening horizontally (rim face). */
  rimSide: 'none' | 'low' | 'high';
}

/** Partition one segment's longitudinal axis around openings. */
export function partitionLongitudinal(segLen: number, openings: Opening[]): { s0: number; s1: number; rimSide: 'none' | 'low' | 'high' }[] {
  const sorted = [...openings].sort((a, b) => a.tCenter - b.tCenter);
  const pieces: { s0: number; s1: number; rimSide: 'none' | 'low' | 'high' }[] = [];
  let cursor = 0;
  for (const o of sorted) {
    const lo = o.tCenter * segLen - o.width / 2;
    const hi = o.tCenter * segLen + o.width / 2;
    if (lo > cursor + 1e-9) {
      pieces.push({ s0: cursor, s1: lo, rimSide: 'high' });
    }
    cursor = hi;
  }
  if (cursor < segLen - 1e-9) {
    pieces.push({ s0: cursor, s1: segLen, rimSide: pieces.length === 0 ? 'none' : 'low' });
  }
  return pieces;
}

/** Vertical slabs for one opening span. */
export function partitionVertical(span: { s0: number; s1: number; rimSide: 'none' | 'low' | 'high' }, opening: Opening, effHeight: number): WallPieceSpec[] {
  const specs: WallPieceSpec[] = [];
  const { sillHeight, headHeight } = opening;
  if (sillHeight > 1e-9) {
    specs.push({ ...span, z0: 0, z1: sillHeight, segIndex: opening.segmentIndex });
  }
  if (headHeight < effHeight - 1e-9) {
    specs.push({ ...span, z0: headHeight, z1: effHeight, segIndex: opening.segmentIndex });
  }
  return specs;
}

/** Build a wall prism mesh from a longitudinal+vertical spec. */
export function buildSlab(spec: WallPieceSpec, ax: number, ay: number, ux: number, uy: number, thickness: number, outwardNx: number, outwardNy: number): MeshBuffer {
  const hx = outwardNx * (thickness / 2);
  const hy = outwardNy * (thickness / 2);
  const p0x = ax + ux * spec.s0;
  const p0y = ay + uy * spec.s0;
  const p1x = ax + ux * spec.s1;
  const p1y = ay + uy * spec.s1;

  // Eight corners: inner face (room side) and outer face.
  const ix0y0 = [p0x - hx, p0y - hy];
  const ix1y0 = [p1x - hx, p1y - hy];
  const ox0y0 = [p0x + hx, p0y + hy];
  const ox1y0 = [p1x + hx, p1y + hy];

  const verts: number[] = [];
  const push = (x: number, y: number, z: number): number => {
    const idx = verts.length / 3;
    verts.push(snapRound(x), snapRound(y), snapRound(z));
    return idx;
  };

  const i00 = push(ix0y0[0], ix0y0[1], spec.z0);
  const i01 = push(ix0y0[0], ix0y0[1], spec.z1);
  const i10 = push(ix1y0[0], ix1y0[1], spec.z0);
  const i11 = push(ix1y0[0], ix1y0[1], spec.z1);
  const o00 = push(ox0y0[0], ox0y0[1], spec.z0);
  const o01 = push(ox0y0[0], ox0y0[1], spec.z1);
  const o10 = push(ox1y0[0], ox1y0[1], spec.z0);
  const o11 = push(ox1y0[0], ox1y0[1], spec.z1);

  const quad = (a: number, b: number, c: number, d: number): void => {
    verts_out_indices.push(a, b, c, a, c, d);
  };
  const verts_out_indices: number[] = [];
  // Inner face (normal into room = -outwardNormal)
  quad(i00, i10, i11, i01);
  // Outer face
  quad(o00, o01, o11, o10);
  // Rim faces (bottom, top, low-x rim, high-x rim)
  quad(i00, o00, o10, i10); // bottom
  quad(i01, i11, o11, o01); // top
  quad(i00, i01, o01, o00); // s0 rim
  quad(i10, o10, o11, i11); // s1 rim

  return {
    positions: new Float32Array(verts),
    indices: new Uint32Array(verts_out_indices),
  };
}
