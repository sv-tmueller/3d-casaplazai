/**
 * Window-dress adapter spec (issue #19, amended #37): glass + frame
 * buckets emitted per window opening; doors now contribute frame slabs
 * (issue #37) into the same windowFrame bucket; triangle accounting
 * stays consistent, and the backward-compat guard holds (no openings
 * param ⇒ no new buckets).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compilePlan,
  parseValidatedPlan,
} from '../../src/geom';
import type { FloorplanData, Room } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { adaptScene, sceneHasNaN } from '../../src/viewer/adapter';

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

/**
 * AMENDED (#37): the shared `windowFrame` bucket now also carries door
 * slabs, so the frame totals must be derived from the fixture rather
 * than pinned. A "unique doorway" = one rounded hole-centre; the demo
 * carves its living↔kitchen door from both rooms (2 openings, 1 hole).
 */
function uniqueDoorwayCount(plan: FloorplanData): number {
  const byId = new Map(plan.floors[0].rooms.map((r) => [r.id, r] as const));
  const centers = new Set<string>();
  for (const o of plan.floors[0].openings) {
    if (o.kind !== 'door') continue;
    const room = byId.get(o.roomId);
    if (!room) continue;
    const a = room.polygon[o.segmentIndex];
    const b = room.polygon[(o.segmentIndex + 1) % room.polygon.length];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const d = o.tCenter * len;
    centers.add(
      `${(a[0] + (dx / len) * d).toFixed(3)},${(a[1] + (dy / len) * d).toFixed(3)}`,
    );
  }
  return centers.size;
}

describe('adaptScene — window dressing buckets (demo)', () => {
  const compiled = compilePlan(demo);
  const adapted = adaptScene(compiled, roomsById(demo), demo.floors[0].openings);

  it('emits exactly one glass bucket + one windowFrame bucket', () => {
    const glass = adapted.buckets.filter((b) => b.slot === 'glass');
    const frames = adapted.buckets.filter((b) => b.slot === 'windowFrame');
    expect(glass.length).toBe(1);
    expect(frames.length).toBe(1);
  });

  it('glass bucket holds exactly 4 quads (one per window)', () => {
    const glass = adapted.buckets.find((b) => b.slot === 'glass')!;
    expect(glass.indices.length / 6).toBe(4);
  });

  it('frame bucket holds 4 slabs per window + 4 per unique doorway', () => {
    const frames = adapted.buckets.find((b) => b.slot === 'windowFrame')!;
    // AMENDED (#37): runtime-derived, no pin. 4 slabs/window +
    // 4 slabs/unique doorway, each slab a 12-triangle prism.
    const windows = demo.floors[0].openings.filter((o) => o.kind === 'window').length;
    const doorways = uniqueDoorwayCount(demo);
    expect(frames.indices.length / 3).toBe((4 * windows + 4 * doorways) * 12);
  });

  it('glass panes sit exactly in the carved holes (east window)', () => {
    const glass = adapted.buckets.find((b) => b.slot === 'glass')!;
    // Gather glass verts near y≈3.6 (north wall of living room).
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k < glass.positions.length; k += 3) {
      pts.push([
        glass.positions[k],
        glass.positions[k + 1],
        glass.positions[k + 2],
      ]);
    }
    const eastPts = pts.filter(
      ([x, y]) =>
        Math.abs(y - 3.6) < 0.03 &&
        x > 2.0 &&
        x < 4.4,
    );
    expect(eastPts.length).toBeGreaterThan(0);
    const zs = eastPts.map(([, , z]) => z);
    expect(Math.min(...zs)).toBeCloseTo(0.9, 3);
    expect(Math.max(...zs)).toBeCloseTo(2.3, 3);
    const xs = eastPts.map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(2.54 - 0.02);
    expect(Math.max(...xs)).toBeLessThanOrEqual(3.94 + 0.02);
  });

  it('frames lie inside the wall thickness (±0.12 envelope)', () => {
    const frames = adapted.buckets.find((b) => b.slot === 'windowFrame')!;
    const ysNorth: number[] = [];
    for (let k = 0; k < frames.positions.length; k += 3) {
      const y = frames.positions[k + 1];
      // North-wall frames of living+kitchen sit near y=3.6.
      if (
        Math.abs(y - 3.6) < 0.2 &&
        Math.abs(y - 3.6) > 0.02
      )
        ysNorth.push(y);
    }
    expect(ysNorth.length).toBeGreaterThan(0);
    for (const y of ysNorth) {
      expect(Math.abs(y - 3.6)).toBeLessThanOrEqual(0.12 + 1e-6);
    }
  });

  it('adds glass+window+door frame tris to triangleCount beyond the wall baseline', () => {
    const baseline = adaptScene(compiled, roomsById(demo));
    expect(adapted.triangleCount).toBeGreaterThan(baseline.triangleCount);
    // AMENDED (#37): runtime-derived delta, no pin.
    //   glass: 2 tris/pane
    //   frames: 12 tris/slab × (4 slabs/window + 4 slabs/unique doorway)
    const windows = demo.floors[0].openings.filter((o) => o.kind === 'window').length;
    const doorways = uniqueDoorwayCount(demo);
    const expected = 2 * windows + (4 * windows + 4 * doorways) * 12;
    expect(adapted.triangleCount - baseline.triangleCount).toBe(expected);
  });

  it('counts match the plan-derived window count (runtime derivation)', () => {
    const windowsInPlan = demo.floors[0].openings.filter((o) => o.kind === 'window')
      .length;
    const glass = adapted.buckets.find((b) => b.slot === 'glass')!;
    expect(glass.indices.length / 6).toBe(windowsInPlan);
  });

  it('no NaN in the new buckets', () => {
    expect(
      sceneHasNaN(
        adapted.buckets
          .filter((b) => b.slot === 'glass' || b.slot === 'windowFrame')
          .map((b) => b.positions),
      ),
    ).toBe(false);
  });
});

describe('adaptScene — backward compatibility', () => {
  it('without openings param: no glass/frame buckets, triangleCount unchanged', () => {
    const compiled = compilePlan(demo);
    const adaptedLegacy = adaptScene(compiled, roomsById(demo));
    expect(
      adaptedLegacy.buckets.some(
        (b) => b.slot === 'glass' || b.slot === 'windowFrame',
      ),
    ).toBe(false);
    // Issue #28: the advertised count is the sum over emitted buckets
    // (dedupe drops + furniture included), not the compiler's pre-dedupe
    // shell total — so assert the identity, not countTriangles(compiled).
    expect(adaptedLegacy.triangleCount).toBe(
      adaptedLegacy.buckets.reduce(
        (sum, b) => sum + b.indices.length / 3,
        0,
      ),
    );
  });

  it('doors-only plan emits door frames but no glass (issue #37)', () => {
    const doorsOnly: FloorplanData = {
      ...demo,
      floors: [{ ...demo.floors[0], openings: demo.floors[0].openings.filter((o) => o.kind === 'door') }],
    };
    const compiled = compilePlan(doorsOnly);
    const adapted = adaptScene(compiled, roomsById(doorsOnly), doorsOnly.floors[0].openings);
    // Doors draw no glass…
    expect(adapted.buckets.some((b) => b.slot === 'glass')).toBe(false);
    // …but they DO contribute frames (4 slabs per unique doorway) to the
    // shared windowFrame bucket. AMENDED (#37): previously asserted empty.
    const frames = adapted.buckets.find((b) => b.slot === 'windowFrame');
    expect(frames).toBeDefined();
    expect(frames!.indices.length / 3).toBe(
      4 * uniqueDoorwayCount(doorsOnly) * 12,
    );
  });
});
