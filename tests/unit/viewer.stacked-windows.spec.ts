/**
 * Stacked-window dedupe spec (issue #29, Pkg 3).
 *
 * Regression: dedupeWalls keyed duplicate wall slabs on (cx, cy) only,
 * so two slabs carved from the SAME wall span into DISJOINT height bands
 * (the below-sill and above-head pieces of stacked windows) shared an
 * xy-centroid and one was silently dropped. The key must include cz.
 *
 * Kept in its own file (not viewer.adapter.spec.ts) so sibling Pkg 2 can
 * grow that spec without merge contention.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCeiling,
  buildFloor,
  compilePlan,
  parseValidatedPlan,
  type CompiledScene,
} from '../../src/geom';
import { buildRoomWalls } from '../../src/geom/compile';
import type { FloorplanData, Opening, Room } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { adaptScene } from '../../src/viewer/adapter';

const EPS = 1e-3;

function roomsById(plan: FloorplanData): Map<string, Room> {
  return new Map(plan.floors[0].rooms.map((r) => [r.id, r]));
}

/** Distinct z coordinates present in a bucket's positions. */
function zValues(positions: Float32Array): number[] {
  const zs: number[] = [];
  for (let i = 2; i < positions.length; i += 3) zs.push(positions[i] as number);
  return zs;
}

describe('dedupeWalls — stacked windows (issue #29)', () => {
  // One wall span (segment 0, y=0 edge) hosts two windows stacked in
  // disjoint sill/head bands on a 2.7 m wall. Because they share the
  // span, their below-sill / above-head slabs all share an xy-centroid
  // and differ only in z.
  const room: Room = {
    id: 'r-stack',
    name: 'Stack',
    polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
    floorTexture: 'wood',
  };
  const openings: Opening[] = [
    { id: 'win-low', roomId: 'r-stack', kind: 'window', segmentIndex: 0, tCenter: 0.5, width: 1, sillHeight: 0.4, headHeight: 0.9 },
    { id: 'win-high', roomId: 'r-stack', kind: 'window', segmentIndex: 0, tCenter: 0.5, width: 1, sillHeight: 1.4, headHeight: 1.9 },
  ];
  const plan: FloorplanData = migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [room],
    openings,
    furniture: [],
  }).data!;

  // Two stacked openings share a span, which validateGeometry rejects
  // (openings may not overlap longitudinally). Build the room's wall
  // meshes straight from the compiler's white-box builder instead of
  // compilePlan so the geometry under test is the real slab output.
  const compiled: CompiledScene = {
    rooms: [
      {
        roomId: room.id,
        floor: buildFloor(room),
        ceiling: buildCeiling(room, 2.7),
        walls: buildRoomWalls(room, plan),
      },
    ],
    collisions: [],
    furniture: [],
  };
  const adapted = adaptScene(compiled, roomsById(plan));

  it('covers the carved span exactly once (stacked bands not collapsed)', () => {
    const wall = adapted.buckets.find((b) => b.slot === 'wall');
    expect(wall).toBeDefined();
    // This fixture stacks two openings on ONE span — rejectable input
    // (validateGeometry forbids longitudinal opening overlap), so the
    // white-box compiler emits REDUNDANT slabs: win-high's below-sill
    // span z[0,1.4] redraws win-low's hole band, and win-low's
    // above-head span z[0.9,2.7] CONTAINS win-high's above-head
    // z[1.9,2.7] on the same t-range — the same coincident shape as the
    // cross-z-band finding on PR #50. The coplanar pass now merges that
    // pair (it is a real z-fight), so 8 slabs / 64 verts remain, and the
    // span is covered exactly once: [0,0.4], [0.4,1.4], [1.4,2.7].
    expect(wall?.positions.length).toBe(8 * 8 * 3);

    const zs = zValues(wall?.positions as Float32Array);
    const has = (target: number): boolean =>
      zs.some((z) => Math.abs(z - target) < EPS);
    // Seams of the exactly-once cover of the carved span: the band that
    // win-low's hole interrupts, win-high's below-sill top, and the
    // surviving above-head band. None of the stacked bands collapsed.
    expect(has(0.4)).toBe(true);
    expect(has(1.4)).toBe(true);
    expect(has(2.7)).toBe(true);
  });
});

describe('dedupeWalls — demo parity (issue #29)', () => {
  const demo: FloorplanData = parseValidatedPlan(
    // Demo stays v1 on disk; migrate first (mirrors the loaders).
    migrate(
      JSON.parse(
          readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
        ),
    ).data,
    )
  const compiled = compilePlan(demo);
  const adapted = adaptScene(compiled, roomsById(demo));
  const rawWallVerts = compiled.rooms.reduce(
    (n, r) => n + r.walls.reduce((m, w) => m + w.positions.length / 3, 0),
    0,
  );
  const wall = adapted.buckets.find((b) => b.slot === 'wall');
  const keptVerts = wall ? wall.positions.length / 3 : -1;

  it('pins the demo wall-bucket vertex count (184)', () => {
    // Post-#29 figure was 224 (xy-only key collapsed 3 stacked-window
    // slab pairs). Issue #45 lowered it to 208 (full-thickness walls ⇒
    // partially-overlapping coplanar spans). The PR #50 fix round
    // generalized the pass from z-band-keyed to 2-D (t,z) coverage on
    // the shared plane, which also merges the demo's CROSS-Z-BAND
    // coincidences (door above-head z[2.05,2.70] vs a neighbour's
    // full-height z[0,2.70]) — measured 184. All counts are MEASURED
    // from a real run.
    expect(keptVerts).toBe(184);
  });

  it('still drops genuinely coincident duplicates', () => {
    // Interior shared walls are emitted twice with matching xy AND z —
    // dedupe removes them (3 slabs = 24 verts); the coplanar pass then
    // nets a further 40 verts of overlaps/splits (#45 + PR #50).
    expect(rawWallVerts).toBe(248);
    expect(keptVerts).toBe(rawWallVerts - 24 - 40);
  });
});
