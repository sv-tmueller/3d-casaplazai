/**
 * Pure geometry helpers for the 2D editor. World-space coordinates are
 * meters ([x, y]); screen mapping happens in controller.ts, not here.
 */

export type Pt = [number, number];

// Issue #147 CP1: the shared point-in-polygon predicate (src/geom owns
// it; the viewer consumes the same implementation — see the re-export
// at pointInPolygon below).
import { pointInRing } from '../geom';

export function vecAdd(a: Pt, b: Pt): Pt {
  return [a[0] + b[0], a[1] + b[1]];
}

export function vecSub(a: Pt, b: Pt): Pt {
  return [a[0] - b[0], a[1] - b[1]];
}

export function vecScale(a: Pt, k: number): Pt {
  return [a[0] * k, a[1] * k];
}

const EPSILON = 1e-9;

export function vecEq(a: Pt, b: Pt): boolean {
  return (
    Math.abs(a[0] - b[0]) < EPSILON &&
    Math.abs(a[1] - b[1]) < EPSILON
  );
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function centroid(vertices: Pt[]): Pt {
  let sx = 0;
  let sy = 0;
  for (const v of vertices) {
    sx += v[0];
    sy += v[1];
  }
  return [sx / vertices.length, sy / vertices.length];
}

/**
 * Absolute angle of the segment a→b in degrees, measured CCW-positive
 * from the +X axis: (atan2(dy, dx) · 180/π + 360) % 360. A zero-length
 * segment is DEFINED as 0° (atan2(0,0) is 0 anyway; kept explicit).
 * Exported for reuse by Pkg 2 (issue #66 sub-plan).
 */
export function segmentAngleDegrees(a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
}

/** Shoelace-signed area; positive = counter-clockwise winding. */
export function signedArea(poly: Pt[]): number {
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

export function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapVec(pt: Pt, gridSize: number): Pt {
  return [snap(pt[0], gridSize), snap(pt[1], gridSize)];
}

/** Minimum distance from pt to the segment ab (including endpoints). */
export function distancePointSegment(
  pt: Pt,
  a: Pt,
  b: Pt,
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  let t =
    ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) /
    lenSq;
  t = clamp(t, 0, 1);
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(pt[0] - projX, pt[1] - projY);
}

/** Nearest vertex to pt within `radius` (inclusive), or null. */
export function nearestVertexWithin(
  pt: Pt,
  vertices: Pt[],
  radius: number,
): Pt | null {
  let best: Pt | null = null;
  let bestDist = Infinity;
  for (const v of vertices) {
    const d = Math.hypot(pt[0] - v[0], pt[1] - v[1]);
    if (d <= radius && d < bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

/** Orthogonal projection of pt onto segment ab (clamped to the segment). */
export function projectPointOntoSegment(pt: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [a[0], a[1]];
  const t = clamp(((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq, 0, 1);
  return [a[0] + t * dx, a[1] + t * dy];
}

/**
 * Ray-casting point-in-polygon test (works for concave rings).
 *
 * Issue #147 CP1: DELEGATES to src/geom's shared pointInRing — the
 * viewer needs the same predicate (room readout) and may not import
 * editor code (layering law). This wrapper keeps every historical call
 * site and spec unchanged while one implementation serves both panes.
 */
export function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  return pointInRing(pt[0], pt[1], poly);
}

/** Issue #147 CP1: the shared predicate, re-exported for editor callers. */
export { pointInRing } from '../geom';

/** Convex hull (Andrew monotone chain), CCW output, no collinear points. */
export function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points.slice();
  const sorted = points.slice().sort((p, q) => (p[0] === q[0] ? p[1] - q[1] : p[0] - q[0]));
  const cross = (o: Pt, a: Pt, b: Pt): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Pt[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Separating-Axis-Theorem overlap test between two CONVEX polygons.
 *
 * Degeneracy handling: callers must guarantee non-zero-area inputs
 * (>= 3 distinct vertices forming a proper ring). Zero-area rings are
 * treated as NON-OVERLAPPING here (nothing solid to intersect) — the
 * caller decides whether to reject degenerate shapes before rendering.
 */
export function polygonsOverlapSAT(a: Pt[], b: Pt[]): boolean {
  const axesFrom = (poly: Pt[]): Pt[] =>
    poly.map((_, i) => {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const ex = x2 - x1;
      const ey = y2 - y1;
      const len = Math.hypot(ex, ey);
      return len === 0 ? [1, 0] : [-ey / len, ex / len];
    });

  const separates = (axis: Pt): boolean => {
    const pa = a.map((p) => p[0] * axis[0] + p[1] * axis[1]);
    const pb = b.map((p) => p[0] * axis[0] + p[1] * axis[1]);
    const minA = Math.min(...pa);
    const maxA = Math.max(...pa);
    const minB = Math.min(...pb);
    const maxB = Math.max(...pb);
    // Epsilon-slack separation: MERELY TOUCHING edges (shared wall) do not
    // count as overlap — interiors must positively intersect.
    return maxA < minB + EPSILON || maxB < minA + EPSILON;
  };

  // Reject degenerate (zero-area) inputs defensively.
  if (Math.abs(signedArea(a)) < EPSILON || Math.abs(signedArea(b)) < EPSILON) {
    return false;
  }

  for (const axis of [...axesFrom(a), ...axesFrom(b)]) {
    if (separates(axis)) return false;
  }
  return true;
}
