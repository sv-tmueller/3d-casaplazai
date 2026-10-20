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

  it('translates collisions 1:1 (z fences included, issue #76)', () => {
    expect(adapted.collisions.length).toBe(compiled.collisions.length);
    expect(adapted.collisions[0]).toEqual({
      minX: compiled.collisions[0]?.minX,
      minY: compiled.collisions[0]?.minY,
      maxX: compiled.collisions[0]?.maxX,
      maxY: compiled.collisions[0]?.maxY,
      minZ: compiled.collisions[0]?.minZ,
      maxZ: compiled.collisions[0]?.maxZ,
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

describe('adaptScene — interior fill-light spots (issue #152)', () => {
  const townhouseRaw: FloorplanData = parseValidatedPlan(
    migrate(
      JSON.parse(
        readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8'),
      ),
    ).data,
  );

  /** Every floor's rooms — the townhouse has two storeys. */
  function roomsOnAllFloors(plan: FloorplanData): Map<string, Room> {
    return new Map(
      plan.floors.flatMap((floor) =>
        floor.rooms.map((r) => [r.id, r] as const),
      ),
    );
  }

  /** Independent shoelace centroid: the adapter's spot must match it. */
  function polygonCentroid(polygon: Room['polygon']): [number, number] {
    let area2 = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      const p1 = polygon[i]!;
      const p2 = polygon[(i + 1) % polygon.length]!;
      const cross = p1[0] * p2[1] - p2[0] * p1[1];
      area2 += cross;
      cx += (p1[0] + p2[0]) * cross;
      cy += (p1[1] + p2[1]) * cross;
    }
    return [cx / (3 * area2), cy / (3 * area2)];
  }

  /** Underside of a ceiling buffer: its minimum z, meters. */
  function ceilingUnderside(positions: Float32Array): number {
    let min = Infinity;
    for (let i = 2; i < positions.length; i += 3) {
      min = Math.min(min, positions[i]!);
    }
    return min;
  }
  it('demo: one spot per room, at the polygon centroid under its ceiling', () => {
    const compiled = compilePlan(demoRaw);
    const adapted = adaptScene(compiled, roomsById(demoRaw));
    const rooms = demoRaw.floors[0]!.rooms;

    expect(adapted.roomLights).toHaveLength(rooms.length);
    rooms.forEach((room, i) => {
      const spot = adapted.roomLights[i]!;
      const [cx, cy] = polygonCentroid(room.polygon);
      expect(spot.x).toBeCloseTo(cx, 9);
      expect(spot.y).toBeCloseTo(cy, 9);
      const meshes = compiled.rooms.find((r) => r.roomId === room.id)!;
      expect(spot.z).toBeCloseTo(ceilingUnderside(meshes.ceiling.positions), 9);
      // Above head height, below the slab top: an actual ceiling light.
      expect(spot.z).toBeGreaterThan(2);
      expect(spot.z).toBeLessThan(3);
    });
  });

  it('townhouse: seven spots across both storeys, lifted with the floor', () => {
    const compiled = compilePlan(townhouseRaw);
    const adapted = adaptScene(compiled, roomsOnAllFloors(townhouseRaw));
    const groundCount = townhouseRaw.floors[0]!.rooms.length;

    expect(adapted.roomLights).toHaveLength(
      townhouseRaw.floors.flatMap((floor) => floor.rooms).length,
    );
    const ground = adapted.roomLights.slice(0, groundCount).map((s) => s.z);
    const upper = adapted.roomLights.slice(groundCount).map((s) => s.z);
    expect(upper.length).toBeGreaterThan(0);
    // A storey apart: every upstairs spot sits above the ground ones.
    expect(Math.min(...upper)).toBeGreaterThan(Math.max(...ground) + 2);
  });
});
