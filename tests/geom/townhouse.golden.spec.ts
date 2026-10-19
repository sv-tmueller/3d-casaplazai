/**
 * Townhouse goldens (issue #76): vertex/triangle/bound counts of
 * compiling the committed TWO-STOREY fixture. Constants were MEASURED
 * from a real run of compilePlan on demo/demo-townhouse.json (never
 * hand-computed), rounded to 1e-4 to kill float flakiness.
 *
 * Freeze policy: these constants may only change by a DELIBERATE
 * follow-up that alters townhouse geometry; incidental refactors of
 * the compile pipeline must keep them byte-stable (the apartment
 * goldens in golden.spec.ts police the single-storey path; these
 * police the per-floor lift).
 *
 * Regeneration recipe: instrument a scratch vitest spec that logs
 * countVertices/countTriangles/sceneBounds of compilePlan(the parsed
 * fixture), paste the printed constants below, delete the scratch.
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
import { migrate, validateFloorplan } from '../../src/shared/schema';

const townhouseRaw: FloorplanData = parseValidatedPlan(
  migrate(
    JSON.parse(
      readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8'),
    ),
  ).data!,
);

// MEASURED (real run, 2026-10-19): 3 ground rooms (living/kitchen/
// entry) + 4 upper rooms (bedroom/office/bath/landing).
const GOLDEN = {
  vertices: 504,
  triangles: 700,
  bounds: { minX: 0, minY: 0, maxX: 9.6, maxY: 5.6 },
};

const round4 = (v: number): number => Number(v.toFixed(4));

describe('golden — demo townhouse compile metrics (issue #76)', () => {
  it('fixture validates natively as v2 (no migration needed)', () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8'),
    );
    expect(validateFloorplan(raw).ok).toBe(true);
  });

  it('compiles the committed two-storey fixture', () => {
    expect(() => compilePlan(townhouseRaw)).not.toThrow();
  });

  it('pins measured vertex count', () => {
    const scene = compilePlan(townhouseRaw);
    expect(round4(countVertices(scene))).toBe(GOLDEN.vertices);
  });

  it('pins measured triangle count', () => {
    const scene = compilePlan(townhouseRaw);
    expect(round4(countTriangles(scene))).toBe(GOLDEN.triangles);
  });

  it('pins measured scene bounds (rounded 1e-4)', () => {
    const b = sceneBounds(townhouseRaw);
    expect(round4(b.minX)).toBe(GOLDEN.bounds.minX);
    expect(round4(b.minY)).toBe(GOLDEN.bounds.minY);
    expect(round4(b.maxX)).toBe(GOLDEN.bounds.maxX);
    expect(round4(b.maxY)).toBe(GOLDEN.bounds.maxY);
  });

  it('emits seven rooms across two storeys with pinned wall counts', () => {
    const scene = compilePlan(townhouseRaw);
    expect(scene.rooms.map((r) => r.roomId)).toEqual([
      'room-living',
      'room-kitchen',
      'room-entry',
      'room-master-bedroom',
      'room-office',
      'room-bath',
      'room-landing',
    ]);
    expect(scene.rooms.map((r) => r.walls.length)).toEqual([
      11, 9, 6, 9, 11, 6, 4,
    ]);
  });

  it('attributes every room to its storey via RoomMeshes.elevation', () => {
    const scene = compilePlan(townhouseRaw);
    expect(scene.rooms.map((r) => r.elevation)).toEqual([
      0, 0, 0, 2.7, 2.7, 2.7, 2.7,
    ]);
  });

  it('lifts upper-storey surfaces: floor at 2.7, ceiling at 5.4', () => {
    const scene = compilePlan(townhouseRaw);
    const bedroom = scene.rooms.find(
      (r) => r.roomId === 'room-master-bedroom',
    )!;
    expect(bedroom.floor.positions[2]).toBeCloseTo(2.7, 6);
    expect(bedroom.ceiling.positions[2]).toBeCloseTo(5.4, 6);
    // Ground storey stays pinned at 0.
    const living = scene.rooms.find((r) => r.roomId === 'room-living')!;
    expect(living.floor.positions[2]).toBeCloseTo(0, 6);
  });

  it('collision boxes carry storey-correct z bands', () => {
    const scene = compilePlan(townhouseRaw);
    expect(scene.collisions).toHaveLength(50);
    const groundBand = scene.collisions.filter(
      (c) => (c.maxZ ?? 0) <= 2.7 + 1e-9,
    );
    const upperBand = scene.collisions.filter(
      (c) => (c.minZ ?? 0) >= 2.7 - 1e-9,
    );
    // Every box belongs wholly to exactly one storey's band.
    expect(groundBand.length + upperBand.length).toBe(scene.collisions.length);
    expect(groundBand.length).toBeGreaterThan(0);
    expect(upperBand.length).toBeGreaterThan(0);
    for (const box of upperBand) {
      expect(box.minZ).toBeGreaterThanOrEqual(2.7 - 1e-9);
    }
  });

  it('furniture render volumes ride their storey (bed tops out at 2.7+0.55)', () => {
    const scene = compilePlan(townhouseRaw);
    expect(scene.furniture).toHaveLength(6);
    const bed = scene.furniture.find((f) => f.itemId === 'furn-bed')!;
    expect(bed.zMin).toBeCloseTo(2.7, 6);
    expect(bed.zMax).toBeCloseTo(2.7 + 0.55, 6);
    const sofa = scene.furniture.find((f) => f.itemId === 'furn-sofa')!;
    expect(sofa.zMin).toBeCloseTo(0, 6);
  });

  it('the committed Staircase is INERT: compile output ignores it', () => {
    // pkg 7.4 consumes stairs; until then the compiler must not emit
    // anything for them. Proof by subtraction: stripping stairs[]
    // changes NOTHING in the compiled scene sizes.
    const scene = compilePlan(townhouseRaw);
    const sansStairs = compilePlan({
      ...townhouseRaw,
      stairs: [],
    });
    expect(countVertices(sansStairs)).toBe(countVertices(scene));
    expect(countTriangles(sansStairs)).toBe(countTriangles(scene));
    expect(sansStairs.collisions.length).toBe(scene.collisions.length);
    expect(sansStairs.furniture.length).toBe(scene.furniture.length);
  });
});
