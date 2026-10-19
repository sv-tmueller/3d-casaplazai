/**
 * Buffer packing helpers (issue #5). Convert vertex-index output of
 * the triangulators into the MeshBuffer wire format consumed by pkg 5.
 * Deterministic: rounding to 1e-4 stabilizes snapshots.
 */

import type { MeshBuffer } from './types';
import { earClipIndices } from './earclip';
import { snapRound } from './mathutil';

/** Pack a polygon ring into a horizontal fan mesh at height z. */
export function packRingFan(
  ring: [number, number][],
  z: number,
  reversed: boolean,
): MeshBuffer {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const tris = earClipIndices(xs, ys);
  const positions = new Float32Array(ring.length * 3);
  ring.forEach(([x, y], i) => {
    positions[i * 3] = snapRound(x);
    positions[i * 3 + 1] = snapRound(y);
    positions[i * 3 + 2] = snapRound(z);
  });
  const flat: number[] = [];
  for (const tri of tris) {
    const [a, b, c] = tri;
    if (a === undefined || b === undefined || c === undefined) continue;
    if (reversed) flat.push(a, c, b);
    else flat.push(a, b, c);
  }
  return { positions, indices: new Uint32Array(flat) };
}

/**
 * Concatenate mesh buffers into one, rebasing indices (pkg 8.1, issue
 * #83 — roof planes are emitted as small per-face buffers and merged
 * per room, mirroring the stair step-box merge in compile.ts).
 */
export function mergeMeshBuffers(buffers: MeshBuffer[]): MeshBuffer {
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
      indices[idxCur + i] = b.indices[i]! + vertBase;
    }
    posCur += b.positions.length;
    idxCur += b.indices.length;
    vertBase += b.positions.length / 3;
  }
  return { positions, indices };
}
