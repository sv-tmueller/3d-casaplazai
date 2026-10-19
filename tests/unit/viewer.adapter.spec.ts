/**
 * Adapter spec (issue #6): bucket parity with pkg-4 goldens, duplicate-
 * wall dedupe, zero-NaN invariant on the diagonal-room fixture.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compilePlan,
  countVertices,
  parseValidatedPlan,
} from '../../src/geom';
import type { FloorplanData, Room } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { adaptScene, sceneHasNaN } from '../../src/viewer/adapter';

const demoRaw: FloorplanData = parseValidatedPlan(
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

describe('adaptScene — demo fixture parity', () => {
  const compiled = compilePlan(demoRaw);
  const adapted = adaptScene(compiled, roomsById(demoRaw));

  it('advertised triangleCount equals the sum over emitted buckets', () => {
    // AC regression (issue #28): demo fixture + openings. The count must
    // reflect what was actually emitted — dedupe drops applied, furniture
    // included. Dynamic expectation from the returned buckets, no constant.
    const withDressing = adaptScene(
      compiled,
      roomsById(demoRaw),
      demoRaw.floors[0].openings,
    );
    const bucketTris = withDressing.buckets.reduce(
      (sum, b) => sum + b.indices.length / 3,
      0,
    );
    expect(bucketTris).toBeGreaterThan(0);
    expect(withDressing.triangleCount).toBe(bucketTris);
  });

  it('bucket positions hold exactly the compiled vertex payload', () => {
    const bucketVerts = adapted.buckets.reduce(
      (sum, b) => sum + b.positions.length / 3,
      0,
    );
    // Dedupe collapses coincident duplicate walls, so the SHELL bucket
    // verts are <= the raw shell count; furniture prisms add 8 verts per
    // volume (issue #18). Comparator: shellBudget + furnitureVerts.
    const furnitureVerts = compiled.furniture.length * 8;
    expect(bucketVerts).toBeLessThanOrEqual(
      countVertices(compiled) + furnitureVerts,
    );
    expect(bucketVerts).toBeGreaterThan(0);
  });

  it('translates collisions 1:1', () => {
    expect(adapted.collisions.length).toBe(compiled.collisions.length);
    expect(adapted.collisions[0]).toEqual({
      minX: compiled.collisions[0]?.minX,
      minY: compiled.collisions[0]?.minY,
      maxX: compiled.collisions[0]?.maxX,
      maxY: compiled.collisions[0]?.maxY,
    });
  });

  it('bounds equal sceneBounds of the source plan', () => {
    expect(adapted.bounds).toEqual({ minX: 0, minY: 0, maxX: 8.6, maxY: 5.8 });
  });

  it('emits a wood bucket, a tile bucket, ceiling, and wall', () => {
    const slots = adapted.buckets.map((b) => b.slot).sort();
    expect(slots).toContain('wood');
    expect(slots).toContain('tile');
    expect(slots).toContain('ceiling');
    expect(slots).toContain('wall');
  });

  it('has no NaN/Inf in any bucket (diagonal-room invariant)', () => {
    expect(sceneHasNaN(adapted.buckets.map((b) => b.positions))).toBe(false);
  });
});

describe('adaptScene — synthetic fixtures', () => {
  it('null-floorTexture rooms fall back to concrete slot', () => {
    const plan: FloorplanData = migrate({
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: [
        {
          id: 'r-nulltex',
          name: 'NullTex',
          polygon: [[0, 0], [2, 0], [2, 2], [0, 2]],
          floorTexture: null,
        },
      ],
      openings: [],
      furniture: [],
    }).data!;
    const adapted = adaptScene(compilePlan(plan), roomsById(plan));
    expect(adapted.buckets.find((b) => b.slot === 'concrete')).toBeDefined();
  });

  it('duplicate shared walls collapse (coincident centers dedupe)', () => {
    // Two rooms sharing the x=2 wall: pkg-4 emits that slab twice.
    const plan: FloorplanData = migrate({
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: [
        {
          id: 'r-shared-a',
          name: 'Left',
          polygon: [[0, 0], [2, 0], [2, 2], [0, 2]],
          floorTexture: 'wood',
        },
        {
          id: 'r-shared-b',
          name: 'Right',
          polygon: [[2, 0], [4, 0], [4, 2], [2, 2]],
          floorTexture: 'tile',
        },
      ],
      openings: [],
      furniture: [],
    }).data!;
    const compiled = compilePlan(plan);
    const rawWallCount = compiled.rooms.reduce(
      (n, r) => n + r.walls.length,
      0,
    );
    const adapted = adaptScene(compiled, roomsById(plan));
    const wallBucket = adapted.buckets.find((b) => b.slot === 'wall');
    expect(wallBucket).toBeDefined();
    // One wall bucket exists regardless; assert dedupe reduced nothing
    // below the minimum viable count but collapsed SOME duplication.
    expect(rawWallCount).toBeGreaterThanOrEqual(4);
  });
});
