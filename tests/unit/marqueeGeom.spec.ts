/**
 * Unit tests for pkg 13.2 marquee band geometry (issue #110, SUB_PLAN
 * step 1; SAT-exact furniture membership since issue #117). Pure
 * predicates in controller.ts: bandRect normalization, pointInBand
 * half-open edges, furniture SAT ∩ oriented quad (the #110 AABB
 * looseness is retired), room bbox-overlap OR any-vertex-in-rect.
 */
import { describe, expect, it } from 'vitest';
import type { FurnitureItem, Room } from '../../src/shared/schema';
import {
  bandRect,
  furnitureInBand,
  pointInBand,
  roomInBand,
} from '../../src/editor/controller';

function furn(id: string, pos: [number, number], rot = 0, fp: [number, number] = [1, 2]): FurnitureItem {
  return {
    id,
    type: 'sofa',
    roomId: 'r1',
    position: pos,
    rotationDeg: rot,
    footprint: fp,
  };
}

function room(id: string, poly: [number, number][]): Room {
  return { id, name: id, polygon: poly, floorTexture: null };
}

describe('bandRect (issue #110)', () => {
  it('normalizes either corner order', () => {
    expect(bandRect([3, 4], [-1, 0])).toEqual({
      minX: -1,
      minY: 0,
      maxX: 3,
      maxY: 4,
    });
    expect(bandRect([-1, 0], [3, 4])).toEqual(bandRect([3, 4], [-1, 0]));
  });

  it('collapses to a degenerate rect when corners coincide', () => {
    const r = bandRect([2, 2], [2, 2]);
    expect(r.minX).toBe(2);
    expect(r.maxX).toBe(2);
  });
});

describe('pointInBand (issue #110)', () => {
  const r = bandRect([0, 0], [4, 4]);

  it('admits interior points', () => {
    expect(pointInBand(r, [1, 1])).toBe(true);
    expect(pointInBand(r, [3.999, 3.999])).toBe(true);
  });

  it('rejects points on the max edges (half-open)', () => {
    expect(pointInBand(r, [4, 2])).toBe(false);
    expect(pointInBand(r, [2, 4])).toBe(false);
  });

  it('admits points on the min edges', () => {
    expect(pointInBand(r, [0, 2])).toBe(true);
    expect(pointInBand(r, [2, 0])).toBe(true);
  });
});

describe('furnitureInBand (issue #110; SAT-exact since #117)', () => {
  it('selects an axis-aligned stamp whose AABB overlaps the band', () => {
    // Sofa centered at (5,5), 1x2 footprint → AABB roughly [4.5,4]-[5.5,6].
    const f = furn('f1', [5, 5]);
    expect(furnitureInBand(f, bandRect([4, 4], [6, 6]))).toBe(true);
    expect(furnitureInBand(f, bandRect([0, 0], [4.4, 10]))).toBe(false);
  });

  it('rejects touching-at-an-edge AABBs (strict overlap)', () => {
    // Band ending exactly at the AABB edge ([5.5,...]) must NOT select.
    const f = furn('f1', [5, 5]);
    expect(furnitureInBand(f, bandRect([5.5, 0], [10, 10]))).toBe(false);
  });

  it('excludes a band that only clips the inflated rotated AABB (SAT pin)', () => {
    // 45°-rotated 1x2 stamp at (5,5): its (+,+) edge lies on the
    // diagonal x + y = 10 + √2/2 ≈ 10.707. The band corner (5.8,5.8)
    // sums 11.6 — strictly beyond the true footprint — so SAT excludes
    // it even though the old AABB filter admitted it (the #110 "loose"
    // pin, deliberately INVERTED by #117).
    const f = furn('f1', [5, 5], 45);
    expect(furnitureInBand(f, bandRect([5.8, 5.8], [7, 7]))).toBe(false);
  });

  it('selects a band clipping the actual rotated footprint', () => {
    const f = furn('f1', [5, 5], 45);
    expect(furnitureInBand(f, bandRect([5, 5], [7, 7]))).toBe(true);
  });

  it('excludes a band edge lying exactly on the rotated edge (degenerate touch)', () => {
    // Min corner placed ON the (+,+) edge: minX + minY = 10 + √2/2.
    // Touching ≠ hit (half-open, as intervalsOverlap); the 1e-9 SAT
    // slack absorbs float noise from the cos(45°) projections.
    const f = furn('f1', [5, 5], 45);
    const r = bandRect([5, 5 + Math.SQRT1_2], [7, 7]);
    expect(furnitureInBand(f, r)).toBe(false);
  });
});

describe('roomInBand (issue #110)', () => {
  const sq = room('rm', [
    [0, 0],
    [6, 0],
    [6, 4],
    [0, 4],
  ]);

  it('admits on bbox overlap', () => {
    // Band overlapping the room's extents but containing no vertex.
    expect(roomInBand(sq, bandRect([1, 1], [2, 2]))).toBe(true);
  });

  it('admits on the vertex leg (belt-and-braces with bbox overlap)', () => {
    // Band catching the (0,0) corner: both legs agree — kept as a pin of
    // the SUB_PLAN formula (bbox-overlap OR any-vertex-in-rect).
    expect(roomInBand(sq, bandRect([-1, -1], [0.5, 0.5]))).toBe(true);
  });

  it('admits a thin band crossing the interior (vertex leg)', () => {
    // Vertical sliver through the middle: misses extremes, catches no
    // vertex — relies on bbox overlap admitting it.
    expect(roomInBand(sq, bandRect([3, -10], [3.001, 10]))).toBe(true);
  });

  it('rejects a fully disjoint band', () => {
    expect(roomInBand(sq, bandRect([10, 10], [12, 12]))).toBe(false);
  });
});
