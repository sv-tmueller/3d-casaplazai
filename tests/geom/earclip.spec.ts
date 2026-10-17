import { describe, expect, it } from 'vitest';
import { earClipIndices } from '../../src/geom/earclip';

const XY = (poly: [number, number][]): { xs: number[]; ys: number[] } => ({
  xs: poly.map((p) => p[0]),
  ys: poly.map((p) => p[1]),
});

const TRIANGLE: [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
];

const CONCAVE_L: [number, number][] = [
  [0, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
];

describe('geom/earclip', () => {
  it('triangulates a triangle trivially', () => {
    const { xs, ys } = XY(TRIANGLE);
    expect(earClipIndices(xs, ys)).toEqual([[0, 1, 2]]);
  });

  it('produces n - 2 triangles covering the polygon area', () => {
    const { xs, ys } = XY(CONCAVE_L);
    const tris = earClipIndices(xs, ys);
    expect(tris).toHaveLength(4);
    let areaSum = 0;
    for (const [a, b, c] of tris) {
      areaSum +=
        (xs[b] - xs[a]) * (ys[c] - ys[a]) -
        (xs[c] - xs[a]) * (ys[b] - ys[a]);
    }
    expect(areaSum / 2).toBeCloseTo(3, 10); // L pentagon-minus-notch = 3 m^2
  });

  it('handles a fan diagonal (convex quadrilateral)', () => {
    const diamond: [number, number][] = [
      [0, 1],
      [1, 0],
      [2, 1],
      [1, 2],
    ];
    const { xs, ys } = XY(diamond);
    const tris = earClipIndices(xs, ys);
    expect(tris).toHaveLength(2);
    const areaSum = tris.reduce((sum, [a, b, c]) => {
      return (
        sum +
        ((xs[b] - xs[a]) * (ys[c] - ys[a]) -
          (xs[c] - xs[a]) * (ys[b] - ys[a]))
      );
    }, 0);
    expect(areaSum / 2).toBeCloseTo(2, 10);
  });

  it('survives a collinear spike vertex', () => {
    const spiked: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0], // collinear midpoint
      [2, 1],
      [0, 1],
    ];
    const { xs, ys } = XY(spiked);
    const tris = earClipIndices(xs, ys);
    expect(tris).toHaveLength(3);
    let areaSum = 0;
    for (const [a, b, c] of tris) {
      areaSum +=
        (xs[b] - xs[a]) * (ys[c] - ys[a]) -
        (xs[c] - xs[a]) * (ys[b] - ys[a]);
    }
    expect(areaSum / 2).toBeCloseTo(2, 10);
  });

  it('is deterministic across invocations', () => {
    const { xs, ys } = XY(CONCAVE_L);
    const a = earClipIndices(xs, ys);
    const b = earClipIndices(xs, ys);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
})
