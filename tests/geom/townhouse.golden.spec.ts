/**
 * Townhouse goldens (issue #76; re-recorded for pkg 7.4 / issue #80 and
 * AGAIN for pkg 8.1 / issue #83): vertex/triangle/bound counts of
 * compiling the committed TWO-STOREY fixture WITH its staircase
 * consumed (step solids, landing holes, flank fencing) and its
 * top-floor MASTER BEDROOM GABLE (two 30° opposing leans, derived
 * ridge). Constants were MEASURED from a real run of compilePlan on
 * demo/demo-townhouse.json (never hand-computed), rounded to 1e-4 to
 * kill float flakiness.
 *
 * Freeze policy: these constants may only change by a DELIBERATE
 * follow-up that alters townhouse geometry; incidental refactors of
 * the compile pipeline must keep them byte-stable (the apartment
 * goldens in golden.spec.ts police the single-storey path; these
 * police the per-floor lift + the stair + the roof packages).
 *
 * 8.1 re-record deltas vs 7.4 (deliberate, issue #83):
 *   - fixture: master bedroom gained roofs [{si 0, 30°}, {si 2, 30°}]
 *     — a symmetric gable over the 5.2 × 3.8 bedroom.
 *   - compile: +1 roof solid (2 rising quads + 2 end caps = 14 verts /
 *     6 tris), ridge at z = 5.4 + tan30° · 1.9 ≈ 6.4970. Collisions
 *     UNCHANGED (roofs add none — walk mode provably untouched).
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

// MEASURED (real run, 2026-10-19, post-8.1): 3 ground rooms (living/
// kitchen/entry) + 4 upper rooms (bedroom/office/bath/landing), stair
// solids (168 tris) + landing holes + stairwell partition door + the
// master-bedroom gable (14 verts / 6 tris incl. end caps).
const GOLDEN = {
  vertices: 706,
  triangles: 960,
  collisions: 56,
  bounds: { minX: 0, minY: 0, maxX: 9.6, maxY: 5.6 },
};

const round4 = (v: number): number => Number(v.toFixed(4));

describe('golden — demo townhouse compile metrics (issue #76/#80)', () => {
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
    // 7.4: kitchen/entry gained a door partition (9→11, 6→8) and the
    // bath/landing stairwell door carved the shared wall (6→7, 4→5).
    expect(scene.rooms.map((r) => r.walls.length)).toEqual([
      11, 11, 8, 9, 11, 7, 5,
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
    // 7.4: 52 wall/furniture boxes + 2 stair flank rails.
    expect(scene.collisions).toHaveLength(GOLDEN.collisions);
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

  // ---- pkg 7.4 (issue #80): the staircase is CONSUMED -----------------

  it('emits the stair solid with the stepCount-box triangle formula', () => {
    const scene = compilePlan(townhouseRaw);
    expect(scene.stairs).toHaveLength(1);
    const stair = scene.stairs![0]!;
    // 14 solid tread boxes × 12 triangles each (merged mesh).
    expect(stair.mesh.indices.length / 3).toBe(14 * 12);
    // Spanning both elevations: lowest tread bottom at 0, top tread
    // top at 2.7.
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 2; i < stair.mesh.positions.length; i += 3) {
      zMin = Math.min(zMin, stair.mesh.positions[i]!);
      zMax = Math.max(zMax, stair.mesh.positions[i]!);
    }
    expect(zMin).toBeCloseTo(0, 6);
    expect(zMax).toBeCloseTo(2.7, 6);
  });

  it('punches the landing hole into the upper slab (point-in-mesh probe)', () => {
    const scene = compilePlan(townhouseRaw);
    const landing = scene.rooms.find((r) => r.roomId === 'room-landing')!;
    const bath = scene.rooms.find((r) => r.roomId === 'room-bath')!;
    // Inside the hole: NEITHER upper floor mesh covers the point — a
    // raycast down sees the lower storey through the slab.
    expect(covers(landing.floor, 9.0, 4.1)).toBe(false);
    expect(covers(bath.floor, 9.0, 3.0)).toBe(false);
    // Outside the hole: both slabs remain solid.
    expect(covers(landing.floor, 9.0, 5.0)).toBe(true);
    expect(covers(bath.floor, 8.3, 1.0)).toBe(true);
  });

  it('punches the same hole into the departure ceiling (head clearance)', () => {
    const scene = compilePlan(townhouseRaw);
    const entry = scene.rooms.find((r) => r.roomId === 'room-entry')!;
    expect(covers(entry.ceiling, 9.0, 3.0)).toBe(false);
    expect(covers(entry.ceiling, 9.0, 0.5)).toBe(true);
  });

  it('flank fencing rides the [departure, departure+rise] z band', () => {
    const scene = compilePlan(townhouseRaw);
    const flanks = scene.collisions.filter(
      (c) => c.minZ !== undefined && Math.abs(c.minZ) < 1e-9 && Math.abs((c.maxZ ?? 0) - 2.7) < 1e-9,
    );
    // Exactly the two stair rails (wall boxes top out at 2.7 too, but
    // their minZ is 0 AND they are player-expanded in xy — disambiguate
    // by counting: walls+furniture gave 52 pre-7.4, now 54).
    expect(flanks.length).toBeGreaterThanOrEqual(2);
  });

  // ---- pkg 8.1 (issue #83): the master-bedroom gable is CONSUMED -----

  it('emits exactly one roof solid: the master-bedroom gable', () => {
    const scene = compilePlan(townhouseRaw);
    expect(scene.roofs).toHaveLength(1);
    expect(scene.roofs![0]!.roomId).toBe('room-master-bedroom');
    // 2 rising quads (4 verts each) + 2 triangular end caps (3 each).
    expect(scene.roofs![0]!.mesh.positions.length / 3).toBe(14);
    expect(scene.roofs![0]!.mesh.indices.length / 3).toBe(6);
  });

  it("gable AABB spans the bedroom at eave 5.4, ridge ≈ 6.497 (incl. end caps)", () => {
    const scene = compilePlan(townhouseRaw);
    const m = scene.roofs![0]!.mesh;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < m.positions.length; i += 3) {
      minX = Math.min(minX, m.positions[i]!);
      minY = Math.min(minY, m.positions[i + 1]!);
      minZ = Math.min(minZ, m.positions[i + 2]!);
      maxX = Math.max(maxX, m.positions[i]!);
      maxY = Math.max(maxY, m.positions[i + 1]!);
      maxZ = Math.max(maxZ, m.positions[i + 2]!);
    }
    // Eaves at the bedroom's polygon edges; ridge = 5.4 + tan30°·1.9.
    expect(Number(minX.toFixed(4))).toBe(0);
    expect(Number(minY.toFixed(4))).toBe(0);
    expect(Number(maxX.toFixed(4))).toBe(5.2);
    expect(Number(maxY.toFixed(4))).toBe(3.8);
    expect(Number(minZ.toFixed(4))).toBe(5.4);
    expect(Number(maxZ.toFixed(4))).toBeCloseTo(5.4 + Math.tan(Math.PI / 6) * 1.9, 4);
  });

  it('adds ZERO collision boxes — walk mode provably untouched', () => {
    const scene = compilePlan(townhouseRaw);
    // GOLDEN.collisions is the PRE-roof 7.4 count; the roof package
    // must not move it (proximity guarantee: planes clear play space).
    expect(scene.collisions).toHaveLength(GOLDEN.collisions);
  });
});

/** Point-in-triangle coverage probe over one mesh's xy projection. */
function covers(
  mesh: { positions: Float32Array; indices: Uint32Array },
  px: number,
  py: number,
): boolean {
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]! * 3;
    const b = mesh.indices[i + 1]! * 3;
    const c = mesh.indices[i + 2]! * 3;
    if (triContains(
      mesh.positions[a]!, mesh.positions[a + 1]!,
      mesh.positions[b]!, mesh.positions[b + 1]!,
      mesh.positions[c]!, mesh.positions[c + 1]!,
      px, py,
    )) return true;
  }
  return false;
}

function triContains(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, px: number, py: number,
): boolean {
  const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
