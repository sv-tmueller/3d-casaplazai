/**
 * Unit tests for the pure geometry helpers (RED phase).
 */
import { describe, expect, it } from 'vitest';
import {
  centroid,
  clamp,
  convexHull,
  distancePointSegment,
  nearestVertexWithin,
  pointInPolygon,
  polygonsOverlapSAT,
  projectPointOntoSegment,
  signedArea,
  snap,
  snapVec,
  vecAdd,
  vecEq,
  vecScale,
  vecSub,
  type Pt,
} from '../../src/editor/geom';

describe('vector basics', () => {
  it('adds, subtracts, scales', () => {
    expect(vecAdd([1, 2], [3, 4])).toEqual([4, 6]);
    expect(vecSub([3, 4], [1, 2])).toEqual([2, 2]);
    expect(vecScale([2, -3], 2)).toEqual([4, -6]);
  });

  it('compares vectors with epsilon', () => {
    expect(vecEq([1, 2], [1, 2])).toBe(true);
    expect(vecEq([1, 2], [1 + 1e-10, 2])).toBe(true);
    expect(vecEq([1, 2], [1.01, 2])).toBe(false);
  });
});

describe('clamp', () => {
  it('clamps to [lo, hi]', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('centroid (vertex average)', () => {
  it('averages vertices', () => {
    expect(centroid([[0, 0], [2, 0]])).toEqual([1, 0]);
  });
});

describe('signedArea', () => {
  it('square CCW positive', () => {
    expect(signedArea([[0, 0], [2, 0], [2, 2], [0, 2]])).toBeCloseTo(4);
  });

  it('CW negative', () => {
    expect(signedArea([[0, 0], [0, 2], [2, 2], [2, 0]])).toBeCloseTo(-4);
  });

  it('triangle area', () => {
    expect(signedArea([[0, 0], [4, 0], [0, 3]])).toBeCloseTo(6);
  });
});

describe('snap', () => {
  it('rounds to multiples of the grid size', () => {
    expect(snap(0.4, 0.5)).toBeCloseTo(0.5);
    expect(snap(1.74, 0.5)).toBeCloseTo(1.5);
    expect(snap(1.76, 0.5)).toBeCloseTo(2.0);
    expect(snap(2.5, 0.5)).toBeCloseTo(2.5);
  });
});

describe('snapVec', () => {
  it('snaps both components', () => {
    const s = snapVec([0.31, 0.69], 0.5);
    expect(s[0]).toBeCloseTo(0.5);
    expect(s[1]).toBeCloseTo(0.5);
  });
});

describe('distancePointSegment', () => {
  it('perpendicular distance to middle of segment', () => {
    expect(distancePointSegment([1, 1], [0, 0], [2, 0])).toBeCloseTo(1);
  });

  it('endpoint distance beyond segment ends', () => {
    expect(distancePointSegment([-1, 0], [0, 0], [2, 0])).toBeCloseTo(1);
    expect(distancePointSegment([3, 0], [0, 0], [2, 0])).toBeCloseTo(1);
  });
});

describe('nearestVertexWithin', () => {
  const verts: Pt[] = [
    [0, 0],
    [4, 0],
    [4, 4],
  ];

  it('finds a vertex within radius', () => {
    expect(nearestVertexWithin([0.2, 0.1], verts, 0.5)).toEqual([0, 0]);
  });

  it('returns null when nothing is close', () => {
    expect(nearestVertexWithin([2, 2], verts, 0.5)).toBeNull();
  });
});

describe('projectPointOntoSegment', () => {
  it('projects perpendicular feet and clamps to endpoints', () => {
    expect(projectPointOntoSegment([1, 5], [0, 0], [2, 0])).toEqual([1, 0]);
    expect(projectPointOntoSegment([-3, 0], [0, 0], [2, 0])).toEqual([0, 0]);
    expect(projectPointOntoSegment([9, 1], [0, 0], [2, 0])).toEqual([2, 0]);
  });
});

describe('pointInPolygon', () => {
  const sq: Pt[] = [[0, 0], [4, 0], [4, 4], [0, 4]];

  it('inside/outside/boundary-adjacent', () => {
    expect(pointInPolygon([2, 2], sq)).toBe(true);
    expect(pointInPolygon([5, 2], sq)).toBe(false);
    expect(pointInPolygon([-1, -1], sq)).toBe(false);
  });

  it('works for concave rings', () => {
    const notch: Pt[] = [[0, 0], [4, 0], [4, 4], [3, 4], [3, 1], [1, 1], [1, 4], [0, 4]];
    expect(pointInPolygon([2, 0.5], notch)).toBe(true);
    expect(pointInPolygon([2, 3], notch)).toBe(false); // inside the notch
  });
});

describe('convexHull', () => {
  it('drops interior points and orders CCW', () => {
    const pts: Pt[] = [[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 1]];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
    expect(signedArea(hull)).toBeGreaterThan(0);
  });

  it('handles triangle', () => {
    const hull = convexHull([[0, 0], [4, 0], [0, 3]] as Pt[]);
    expect(hull).toHaveLength(3);
  });
});

describe('polygonsOverlapSAT', () => {
  it('detects separated rectangles', () => {
    const a: Pt[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const b: Pt[] = [[5, 0], [7, 0], [7, 2], [5, 2]];
    expect(polygonsOverlapSAT(a, b)).toBe(false);
  });

  it('detects overlapping rectangles', () => {
    const a: Pt[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const b: Pt[] = [[1, 1], [3, 1], [3, 3], [1, 3]];
    expect(polygonsOverlapSAT(a, b)).toBe(true);
  });

  it('touching edges do not count as overlap', () => {
    const a: Pt[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const b: Pt[] = [[2, 0], [4, 0], [4, 2], [2, 2]];
    expect(polygonsOverlapSAT(a, b)).toBe(false);
  });

  it('handles triangles', () => {
    const a: Pt[] = [[0, 0], [4, 0], [0, 3]];
    const b: Pt[] = [[1, 1], [5, 1], [1, 4]];
    expect(polygonsOverlapSAT(a, b)).toBe(true);
  });
});
