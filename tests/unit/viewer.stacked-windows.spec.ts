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
import { adaptScene } from '../../src/viewer/adapter';

const EPS = 1e-3;

function roomsById(plan: FloorplanData): Map<string, Room> {
  return new Map(plan.rooms.map((r) => [r.id, r]));
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
  const plan: FloorplanData = {
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [room],
    openings,
    furniture: [],
  };

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

  it('keeps both windows’ slabs in the wall bucket', () => {
    const wall = adapted.buckets.find((b) => b.slot === 'wall');
    expect(wall).toBeDefined();
    // 9 raw slabs (3 solid perimeter + 2 solid spans in the carved wall
    // + 4 window pieces) survive verbatim: nothing here is coincident
    // in all three axes.
    expect(wall?.positions.length).toBe(9 * 8 * 3);

    const zs = zValues(wall?.positions as Float32Array);
    const has = (target: number): boolean =>
      zs.some((z) => Math.abs(z - target) < EPS);
    // win-low above-head bottom, win-high below-sill top / above-head
    // bottom — present only when the stacked bands are NOT collapsed.
    expect(has(0.9)).toBe(true);
    expect(has(1.4)).toBe(true);
    expect(has(1.9)).toBe(true);
  });
});

describe('dedupeWalls — demo parity (issue #29)', () => {
  const demo: FloorplanData = parseValidatedPlan(
    JSON.parse(
      readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
    ),
  );
  const compiled = compilePlan(demo);
  const adapted = adaptScene(compiled, roomsById(demo));
  const rawWallVerts = compiled.rooms.reduce(
    (n, r) => n + r.walls.reduce((m, w) => m + w.positions.length / 3, 0),
    0,
  );
  const wall = adapted.buckets.find((b) => b.slot === 'wall');
  const keptVerts = wall ? wall.positions.length / 3 : -1;

  it('pins the demo wall-bucket vertex count (208)', () => {
    // Post-#29 figure was 224 (xy-only key collapsed 3 stacked-window
    // slab pairs). Issue #45 lowered it to 208: with walls now
    // full-thickness, the demo's shared interior walls produce
    // PARTIALLY-overlapping coplanar spans (not just identical copies)
    // that z-fight; adaptScene's coplanar-span pass removes the 16
    // doubly-covered verts. All counts are MEASURED from a real run.
    expect(keptVerts).toBe(208);
  });

  it('still drops genuinely coincident duplicates', () => {
    // Interior shared walls are emitted twice with matching xy AND z —
    // dedupe removes them (3 slabs = 24 verts); the coplanar pass then
    // removes the further 16 verts of partial overlaps (#45).
    expect(rawWallVerts).toBe(248);
    expect(keptVerts).toBe(rawWallVerts - 24 - 16);
  });
});
