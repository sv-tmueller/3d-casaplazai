/**
 * Ear-clipping triangulation for simple CCW polygons (issue #5).
 * Deterministic: ties resolve by lowest index; no randomness, no
 * sorting instability. ~80 LOC, zero dependencies.
 */

import { EPSILON } from './mathutil';

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** True when the CCW ring corner at `idx` is convex (< pi turn). */
function isConvex(idx: number, xs: number[], ys: number[]): boolean {
  const n = xs.length;
  const px = xs[(idx - 1 + n) % n];
  const py = ys[(idx - 1 + n) % n];
  const cx = xs[idx];
  const cy = ys[idx];
  const qx = xs[(idx + 1) % n];
  const qy = ys[(idx + 1) % n];
  return cross(cx - px, cy - py, qx - cx, qy - cy) > EPSILON;
}



/**
 * Clip ears from a SIMPLE CCW polygon; returns vertex-index triples
 * referencing the INPUT vertex order (caller packs coordinates).
 * Throws on degenerate input (collinear spikes collapsing the ring).
 */
export function earClipIndices(xs: number[], ys: number[]): number[][] {
  const n = xs.length;
  const tris: number[][] = [];

  const alive = Array.from({ length: n }, (_, i) => i);
  let guard = n * n;

  while (alive.length > 3) {
    guard -= 1;
    if (guard < 0) {
      throw new Error(
        'ear clipping stalled: polygon is degenerate or self-intersecting',
      );
    }
    let clippedEarIdx = -1;
    for (let li = 0; li < alive.length; li += 1) {
      const vi = alive[li];
      if (!isConvex(li, ...ringCoords(alive, xs, ys))) continue;
      // Convex corner candidate; test containment against OTHER vertices.
      const ia = alive[(li - 1 + alive.length) % alive.length];
      const ib = vi;
      const ic = alive[(li + 1) % alive.length];
      if (anyVertexInsideExcept(ia, ib, ic, li, alive, xs, ys)) continue;
      clippedEarIdx = li;
      break;
    }
    if (clippedEarIdx < 0) {
      throw new Error(
        'ear clipping stalled: polygon is degenerate or self-intersecting',
      );
    }
    const li = clippedEarIdx;
    const ia = alive[(li - 1 + alive.length) % alive.length];
    const ib = alive[li];
    const ic = alive[(li + 1) % alive.length];
    tris.push([ia, ib, ic]);
    alive.splice(li, 1);
  }
  if (alive.length === 3) {
    tris.push([alive[0], alive[1], alive[2]]);
  }
  return tris;

  function ringCoords(localAlive: number[], localXs: number[], localYs: number[]): [number[], number[]] {
    const rx: number[] = [];
    const ry: number[] = [];
    for (const vi of localAlive) {
      rx.push(localXs[vi]);
      ry.push(localYs[vi]);
    }
    return [rx, ry];
  }

  function anyVertexInsideExcept(
    ia: number,
    ib: number,
    ic: number,
    exceptLi: number,
    localAlive: number[],
    localXs: number[],
    localYs: number[],
  ): boolean {
    for (let lj = 0; lj < localAlive.length; lj += 1) {
      if (lj === exceptLi || lj === (exceptLi - 1 + localAlive.length) % localAlive.length || lj === (exceptLi + 1) % localAlive.length) continue;
      const vj = localAlive[lj];
      const vx = localXs[vj];
      const vy = localYs[vj];
      const d1 = cross(xs[ib] - xs[ia], ys[ib] - ys[ia], vx - xs[ia], vy - ys[ia]);
      const d2 = cross(xs[ic] - xs[ib], ys[ic] - ys[ib], vx - xs[ib], vy - ys[ib]);
      const d3 = cross(xs[ia] - xs[ic], ys[ia] - ys[ic], vx - xs[ic], vy - ys[ic]);
      const hasNeg = d1 < -EPSILON || d2 < -EPSILON || d3 < -EPSILON;
      const hasPos = d1 > EPSILON || d2 > EPSILON || d3 > EPSILON;
      if (!(hasNeg && hasPos)) return true;
    }
    return false;
  }
}
