/**
 * Door-frame adapter spec (issue #37, Pkg 2): door openings emit 4 frame
 * slabs per UNIQUE doorway into the shared `windowFrame` bucket, doors
 * reuse the charcoal slot, mirrored shared-door pairs dedupe, and the
 * scene-wide triangle accounting stays consistent. Window behaviour is
 * untouched (see viewer.windowdress.spec.ts for the amended window pins).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compilePlan, parseValidatedPlan } from '../../src/geom';
import type { FloorplanData, Room } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { adaptScene } from '../../src/viewer/adapter';

const demo: FloorplanData = parseValidatedPlan(
  // Demo stays v1 on disk; migrate first (mirrors the loaders).
  migrate(
    JSON.parse(
        readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
      ),
  ).data,
  )

function roomsById(plan: FloorplanData): Map<string, Room> {
  return new Map(plan.floors[0].rooms.map((r) => [r.id, r]));
}

/** K doors spread along the south wall of one 2·K m wide room. */
function kDoorPlan(k: number): FloorplanData {
  const w = k * 2;
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [
      {
        id: 'r',
        name: 'R',
        polygon: [[0, 0], [w, 0], [w, 3], [0, 3]],
        floorTexture: 'wood',
      },
    ],
    openings: Array.from({ length: k }, (_, i) => ({
      id: `d${i}`,
      roomId: 'r',
      kind: 'door' as const,
      segmentIndex: 0,
      tCenter: (i + 0.5) / k,
      width: 0.85,
      sillHeight: 0,
      headHeight: 2.05,
    })),
    furniture: [],
  }).data!;
}

/** Two rooms carving the SAME doorway out of their shared x=3 wall. */
function sharedDoorPlan(): FloorplanData {
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [
      { id: 'L', name: 'L', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]], floorTexture: 'wood' },
      { id: 'R', name: 'R', polygon: [[3, 0], [6, 0], [6, 3], [3, 3]], floorTexture: 'tile' },
    ],
    openings: [
      { id: 'dL', roomId: 'L', kind: 'door', segmentIndex: 1, tCenter: 0.5, width: 0.9, sillHeight: 0, headHeight: 2.05 },
      { id: 'dR', roomId: 'R', kind: 'door', segmentIndex: 3, tCenter: 0.5, width: 0.9, sillHeight: 0, headHeight: 2.05 },
    ],
    furniture: [],
  }).data!;
}

/** Frame-bucket triangle count for a plan (0 when no bucket emitted). */
function frameTris(plan: FloorplanData): number {
  const adapted = adaptScene(compilePlan(plan), roomsById(plan), plan.floors[0].openings);
  const frames = adapted.buckets.find((b) => b.slot === 'windowFrame');
  return frames ? frames.indices.length / 3 : 0;
}

describe('adaptScene — door frames (issue #37)', () => {
  it('emits exactly 4 slabs (1 doorway) per K doors with no windows', () => {
    for (const k of [1, 2, 3]) {
      // 4 slabs/doorway × k doorways × 12 tris/slab.
      expect(frameTris(kDoorPlan(k))).toBe(k * 4 * 12);
    }
  });

  it('mirrored shared-door pair dedupes 8 → 4 slabs', () => {
    // Both rooms carve the identical doorway; naive emission = 8 slabs,
    // centroid dedupe collapses them to 4.
    expect(frameTris(sharedDoorPlan())).toBe(4 * 12);
  });

  it('demo: door frame z-extents span sill 0 → headHeight (2.05)', () => {
    const adapted = adaptScene(compilePlan(demo), roomsById(demo), demo.floors[0].openings);
    const frames = adapted.buckets.find((b) => b.slot === 'windowFrame')!;
    // Front door (living seg0) sits on the south wall y≈0, x∈[2.23,3.17].
    const zs: number[] = [];
    for (let k = 0; k < frames.positions.length; k += 3) {
      const x = frames.positions[k];
      const y = frames.positions[k + 1];
      const z = frames.positions[k + 2];
      if (Math.abs(y) < 0.12 && x > 2.2 && x < 3.2) zs.push(z);
    }
    expect(zs.length).toBeGreaterThan(0);
    const head = 2.05;
    // FRAME_OVERLAP_M = 0.008 wraps the member ends past the hole edge.
    expect(Math.min(...zs)).toBeLessThanOrEqual(0);
    expect(Math.min(...zs)).toBeGreaterThan(-0.02);
    expect(Math.max(...zs)).toBeGreaterThanOrEqual(head);
    expect(Math.max(...zs)).toBeLessThan(head + 0.02);
  });

  it('door frames do not add glass quads (glass count == window count)', () => {
    const adapted = adaptScene(compilePlan(demo), roomsById(demo), demo.floors[0].openings);
    const glass = adapted.buckets.find((b) => b.slot === 'glass')!;
    const windows = demo.floors[0].openings.filter((o) => o.kind === 'window').length;
    expect(glass.indices.length / 6).toBe(windows);
  });

  it('triangleCount equals the sum over emitted buckets', () => {
    const adapted = adaptScene(compilePlan(demo), roomsById(demo), demo.floors[0].openings);
    const sum = adapted.buckets.reduce(
      (acc, b) => acc + b.indices.length / 3,
      0,
    );
    expect(adapted.triangleCount).toBe(sum);
  });
});
