/**
 * Furniture-mesh adapter spec (issue #18): per-slot prisms, 12 tris per
 * volume, demo emits 8 volumes, room-only triangleCount preserved.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compilePlan,
  countTriangles,
  parseValidatedPlan,
} from '../../src/geom';
import type { FloorplanData, Room } from '../../src/shared/schema';
import { adaptScene, sceneHasNaN } from '../../src/viewer/adapter';

const demo: FloorplanData = parseValidatedPlan(
  JSON.parse(
    readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
  ),
);

function roomsById(plan: FloorplanData): Map<string, Room> {
  return new Map(plan.rooms.map((r) => [r.id, r]));
}

describe('adaptScene — furniture buckets (issue #18)', () => {
  const compiled = compilePlan(demo);
  const adapted = adaptScene(compiled, roomsById(demo));

  it('emits >=1 bucket per POPULATED furn slot', () => {
    const furnSlots = adapted.buckets
      .map((b) => b.slot)
      .filter((s) => s.startsWith('furn-'));
    expect(furnSlots.length).toBeGreaterThan(0);
    for (const s of furnSlots) {
      const bucket = adapted.buckets.find((b) => b.slot === s)!;
      expect(bucket.positions.length).toBeGreaterThan(0);
    }
  });

  it('12 triangles per furniture volume', () => {
    const totalTris = adapted.buckets
      .filter((b) => b.slot.startsWith('furn-'))
      .reduce((acc, b) => acc + b.indices.length / 3, 0);
    expect(totalTris).toBe(compiled.furniture.length * 12);
  });

  it('demo emits 8 furniture volumes', () => {
    expect(compiled.furniture.length).toBe(8);
  });

  it('triangleCount stays ROOM-ONLY (equals the compiler golden count)', () => {
    // Parity with the pre-dedupe room shell (the golden metric); furniture
    // tris ride in buckets but are NOT added to the count.
    expect(adapted.triangleCount).toBe(countTriangles(compiled));
  });

  it('furniture verts are finite (NaN guard)', () => {
    expect(
      sceneHasNaN(
        adapted.buckets
          .filter((b) => b.slot.startsWith('furn-'))
          .map((b) => b.positions),
      ),
    ).toBe(false);
  });

  it('furniture sits above its floor (zMin >= 0, zMax > zMin)', () => {
    for (const vol of compiled.furniture) {
      expect(vol.zMin).toBeGreaterThanOrEqual(0);
      expect(vol.zMax).toBeGreaterThan(vol.zMin);
    }
  });
});
