/**
 * Golden measurements (issue #5, sub-plan): vertex/triangle/bound counts
 * of compiling the committed demo fixture. Every constant here was
 * MEASURED from a real run of compilePlan on demo/demo-apartment.json
 * (never hand-computed), rounded to 1e-4 to kill float flakiness.
 *
 * Regeneration recipe: instrument a scratch vitest spec that logs
 * countVertices/countTriangles/sceneBounds of compilePlan(demoRaw),
 * paste the printed constants below, delete the scratch.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compilePlan,
  countTriangles,
  countVertices,
  parseValidatedPlan,
  sceneBounds,
} from '../../src/geom';
import type { FloorplanData } from '../../src/shared/schema';

const demoRaw: FloorplanData = parseValidatedPlan(
  JSON.parse(
    readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
  ) as unknown,
);

// MEASURED (real run, 2026-10-17): living/kitchen/bed-nook emit 13/11/7
// wall slabs respectively; 6 surface fans (floor+ceiling per room).
const GOLDEN = {
  vertices: 272,
  triangles: 384,
  bounds: { minX: 0, minY: 0, maxX: 8.6, maxY: 5.8 },
};

const round4 = (v: number): number => Number(v.toFixed(4));

describe('golden — demo apartment compile metrics', () => {
  it('compiles the committed demo fixture', () => {
    expect(() => compilePlan(demoRaw)).not.toThrow();
  });

  it('pins measured vertex count', () => {
    const scene = compilePlan(demoRaw);
    expect(round4(countVertices(scene))).toBe(GOLDEN.vertices);
  });

  it('pins measured triangle count', () => {
    const scene = compilePlan(demoRaw);
    expect(round4(countTriangles(scene))).toBe(GOLDEN.triangles);
  });

  it('pins measured scene bounds (rounded 1e-4)', () => {
    const b = sceneBounds(demoRaw);
    expect(round4(b.minX)).toBe(GOLDEN.bounds.minX);
    expect(round4(b.minY)).toBe(GOLDEN.bounds.minY);
    expect(round4(b.maxX)).toBe(GOLDEN.bounds.maxX);
    expect(round4(b.maxY)).toBe(GOLDEN.bounds.maxY);
  });

  it('produces three rooms with expected wall-slab counts', () => {
    const scene = compilePlan(demoRaw);
    expect(scene.rooms.map((r) => r.walls.length)).toEqual([13, 11, 7]);
    expect(scene.rooms.map((r) => r.roomId)).toEqual([
      'room-living-room',
      'room-kitchen',
      'room-bed-nook',
    ]);
  });

  it('emits collision boxes and furniture volumes', () => {
    const scene = compilePlan(demoRaw);
    expect(scene.collisions.length).toBe(24);
    expect(scene.furniture.length).toBe(8);
  });
});

describe('pipeline composition', () => {
  it('every wall slab contributes 8 vertices / 12 triangles', () => {
    const scene = compilePlan(demoRaw);
    for (const room of scene.rooms) {
      for (const wall of room.walls) {
        expect(wall.positions.length).toBe(24);
        expect(wall.indices.length).toBe(36);
      }
    }
  });

  it('surface fans carry 4 vertices / 2 triangles per room', () => {
    const scene = compilePlan(demoRaw);
    for (const room of scene.rooms) {
      expect(room.floor.positions.length).toBe(12);
      expect(room.floor.indices.length).toBe(6);
      expect(room.ceiling.positions.length).toBe(12);
      expect(room.ceiling.indices.length).toBe(6);
    }
  });
});
