/**
 * Small deterministic vector helpers shared by the geom modules.
 * Epsilon tuned for meter-scale houseplans (micrometer precision).
 */

export const EPSILON = 1e-9;

export interface Segment {
  /** Start vertex. */
  ax: number;
  ay: number;
  /** End vertex. */
  bx: number;
  by: number;
  /** Cached euclidean length. */
  len: number;
  /** Unit tangent (b - a) / len. */
  ux: number;
  uy: number;
  /** Left-facing unit normal (-uy, ux). Points INTO a CCW polygon. */
  nx: number;
  ny: number;
}

export function makeSegments(polygon: readonly [number, number][]): Segment[] {
  const out: Segment[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    out.push({
      ax: a[0],
      ay: a[1],
      bx: b[0],
      by: b[1],
      len,
      ux: dx / len,
      uy: dy / len,
      nx: -dy / len,
      ny: dx / len,
    });
  }
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function approxEq(a: number, b: number, eps = EPSILON): boolean {
  return Math.abs(a - b) <= eps;
}

export function signArea(polygon: readonly [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/** Snap near-round floats to integers (guards 1e-4-rounded snapshots). */
export function snapRound(v: number, decimals = 4): number {
  const q = 10 ** decimals;
  return Math.round(v * q) / q;
}

/** Interval intersection; empty interval collapses to null. */
export function intervalOverlap(
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): [number, number] | null {
  const lo = Math.max(aLo, bLo);
  const hi = Math.min(aHi, bHi);
  return lo < hi ? [lo, hi] : null;
}
