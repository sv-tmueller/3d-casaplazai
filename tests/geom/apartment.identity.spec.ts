/**
 * Apartment byte-identity probe (pkg 8.1, issue #83): the roof package
 * must leave the LEAN-FREE apartment demo's compiled buffers BIT-IDENTICAL
 * to the pre-8.1 pipeline. We recompute the scene with the CURRENT code
 * and hash every buffer; the hashes below were captured from the SAME
 * fixture on main @ 1db9c8c (pre-roof) — a mismatch means the roof
 * package leaked geometry into the lean-free path.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compilePlan, parseValidatedPlan } from '../../src/geom';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';

const aptRaw: FloorplanData = parseValidatedPlan(
  migrate(JSON.parse(readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'))).data!,
);

function hashScene(scene: ReturnType<typeof compilePlan>): string {
  const h = createHash('sha256');
  const feed = (buf: Float32Array | Uint32Array): void => {
    h.update(Buffer.from(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)));
  };
  for (const rm of scene.rooms) {
    feed(rm.floor.positions); feed(rm.floor.indices);
    feed(rm.ceiling.positions); feed(rm.ceiling.indices);
    for (const w of rm.walls) { feed(w.positions); feed(w.indices); }
  }
  for (const c of scene.collisions) {
    h.update(`${c.minX},${c.minY},${c.minZ ?? ''},${c.maxX},${c.maxY},${c.maxZ ?? ''}|`);
  }
  for (const f of scene.furniture) {
    h.update(`${f.itemId}:${f.zMin}:${f.zMax}|`);
  }
  for (const s of scene.stairs ?? []) { feed(s.mesh.positions); feed(s.mesh.indices); }
  h.update(`roofs:${(scene.roofs ?? []).length}`);
  return h.digest('hex');
}

// Captured on main @ 1db9c8c (pre-roof pipeline) via the IDENTICAL
// hashScene routine — the roof guard must reproduce these bits.
const PRE_ROOF_HASH = 'a1c6cd32cf3ecbf12c00116f1b8931913fa9d9cbe4305f8b5f52d8d071632421';

describe('apartment byte-identity (pkg 8.1 regression)', () => {
  it('compiles with an empty roofs list', () => {
    const scene = compilePlan(aptRaw);
    expect(scene.roofs).toEqual([]);
  });

  it('buffer hash matches the pre-roof capture', () => {
    const hash = hashScene(compilePlan(aptRaw));
    expect(hash).toBe(PRE_ROOF_HASH);
  });
});
