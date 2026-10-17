import { describe, expect, it } from 'vitest';
import { approxEq, clamp, EPSILON, intervalOverlap, makeSegments, signArea, snapRound } from '../../src/geom/mathutil';

const SQUARE: [number, number][] = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
];

describe('geom/mathutil', () => {
  it('signArea is positive for CCW rings, negative for CW', () => {
    expect(signArea(SQUARE)).toBeCloseTo(4, 12);
    expect(signArea([...SQUARE].reverse())).toBeCloseTo(-4, 12);
  });

  it('makeSegments caches length, tangent, inward normal', () => {
    const segs = makeSegments(SQUARE);
    expect(segs).toHaveLength(4);
    const s0 = segs[0];
    expect(s0.len).toBeCloseTo(2, 12);
    expect(approxEq(s0.ux, 1) && approxEq(s0.uy, 0)).toBe(true);
    // CCW square: bottom edge normal points up (+y).
    expect(approxEq(s0.nx, 0) && approxEq(s0.ny, 1)).toBe(true);
  });

  it('clamp saturates', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('intervalOverlap empties disjoint ranges', () => {
    expect(intervalOverlap(0, 1, 2, 3)).toBeNull();
    expect(intervalOverlap(0, 2, 1, 3)).toEqual([1, 2]);
  });

  it('snapRound kills float dust at 1e-4', () => {
    expect(EPSILON).toBeLessThan(1e-8);
    expect(snapRound(0.19999999999999993)).toBe(0.2);
    expect(snapRound(2.7000000000000002)).toBe(2.7);
  });
});
