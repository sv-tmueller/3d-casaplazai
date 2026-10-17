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
