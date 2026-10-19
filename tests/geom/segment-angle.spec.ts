/**
 * Specs for segmentAngleDegrees (issue #66, Pkg 1 checkpoint 1).
 * Contract: CCW-positive from +X, (atan2(dy,dx)·180/π + 360) % 360,
 * zero-length → 0° (defined, documented).
 */
import { describe, expect, it } from 'vitest';
import { segmentAngleDegrees, type Pt } from '../../src/editor/geom';

describe('segmentAngleDegrees (issue #66)', () => {
  it('east → 0.0°', () => {
    const a: Pt = [0, 0];
    expect(segmentAngleDegrees(a, [1, 0])).toBe(0);
  });

  it('north → 90.0°', () => {
    expect(segmentAngleDegrees([0, 0], [0, 1])).toBe(90);
  });

  it('south → 270.0°', () => {
    expect(segmentAngleDegrees([0, 0], [0, -1])).toBe(270);
  });

  it('due-west → 180.0°', () => {
    expect(segmentAngleDegrees([0, 0], [-1, 0])).toBe(180);
  });

  it('negative dy lands in the fourth quadrant (303.x)', () => {
    const ang = segmentAngleDegrees([0, 0], [1, -1.5]);
    expect(ang).toBeGreaterThanOrEqual(303);
    expect(ang).toBeLessThan(304);
    expect(ang.toFixed(1)).toBe('303.7');
  });

  it('360-boundary: dy ≈ −ε on +X sits at the 359.9/0.0 seam', () => {
    const below = segmentAngleDegrees([0, 0], [1, -1e-9]);
    expect(below).toBeGreaterThan(359.9);
    expect(below).toBeLessThanOrEqual(360);
    const above = segmentAngleDegrees([0, 0], [1, 1e-9]);
    expect(above).toBeGreaterThanOrEqual(0);
    expect(above).toBeLessThan(0.1);
  });

  it('zero-length segment is defined as 0°', () => {
    expect(segmentAngleDegrees([2, 3], [2, 3])).toBe(0);
  });

  it('is translation-invariant (3-4-5 leg → 53.1°)', () => {
    expect(segmentAngleDegrees([10, -4], [13, 0])).toBeCloseTo(53.13, 2);
  });
});
