/**
 * Stair geometry + validator + hole-subtraction specs (issue #80).
 *
 * Covers the pkg-7.4 probes demanded by the sub-plan:
 *   - stairWorldRect / stairHoleRect rotation math;
 *   - buildStairSteps: stepCount boxes, tread/riser progression,
 *     triangle count == stepCount × 12;
 *   - stairFlankBoxes: two thin rails with the right z band;
 *   - validateStairs: gap mismatch, unknown room, out-of-bounds
 *     footprint, overlapping holes — plus the empty-stairs skip;
 *   - buildFloorWithHoles: interior / flush / disjoint placements.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFloorWithHoles,
  buildStairSteps,
  compilePlan,
  countTriangles,
  OverlappingStairHolesError,
  parseValidatedPlan,
  StairGapMismatchError,
  StairOutOfBoundsException,
  stairFlankBoxes,
  stairFootprint,
  stairHoleRect,
  stairProgress,
  stairWorldRect,
  UnknownStairRoomError,
  validateStairs,
} from '../../src/geom';
import type { FloorplanData, Room, Staircase } from '../../src/shared/schema';
import { flatRooms, migrate } from '../../src/shared/schema';

/** Load the committed townhouse fixture through the migration door. */
function townhouse(): FloorplanData {
  return parseValidatedPlan(
    migrate(
      JSON.parse(
        readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8'),
      ),
    ).data!,
  );
}

/** The committed stair, extracted for focused tests. */
function townhouseStair(): Staircase {
  const plan = townhouse();
  const stair = plan.stairs[0];
  if (!stair) throw new Error('fixture lost its stair');
  return stair;
}

function makeStair(over: Partial<Staircase> = {}): Staircase {
  return {
    id: 'stair-x',
    roomId: 'room-a',
    position: [5, 5],
    rotationDeg: 0,
    width: 1,
    run: 3,
    rise: 2.7,
    stepCount: 10,
    ...over,
  };
}

describe('stairWorldRect — rotated footprint math', () => {
  it('axis-aligned stair yields the run × width rect centred on position', () => {
    const rect = stairWorldRect(makeStair());
    expect(rect).toEqual([
      [3.5, 4.5],
      [6.5, 4.5],
      [6.5, 5.5],
      [3.5, 5.5],
    ]);
  });

  it('90° rotation marches +y (uphill = plan north)', () => {
    const rect = stairWorldRect(makeStair({ rotationDeg: 90 }));
    // u=(0,1), v=(-1,0): downhill-left corner = pos - 1.5·u - 0.5·v.
    expect(rect).toEqual([
      [5.5, 3.5],
      [5.5, 6.5],
      [4.5, 6.5],
      [4.5, 3.5],
    ]);
  });

  it('45° rotation rotates the half-extents symmetrically', () => {
    const rect = stairWorldRect(makeStair({ rotationDeg: 45 }));
    const c = Math.SQRT1_2;
    // Downhill-left corner: -(1.5u + 0.5v) with u=(c,c), v=(-c,c).
    // 4 dp: coordinates are snapRound-ed to 1e-4 (golden stability).
    expect(rect[0]![0]).toBeCloseTo(5 - 1.5 * c + 0.5 * c, 4);
    expect(rect[0]![1]).toBeCloseTo(5 - 1.5 * c - 0.5 * c, 4);
  });
});

describe('stairHoleRect — one-tread landing extension', () => {
  it('extends the rect one tread past the top riser, uphill side only', () => {
    const stair = makeStair(); // tread = 3/10 = 0.3
    const hole = stairHoleRect(stair);
    expect(hole).toEqual([
      [3.5, 4.5],
      [6.8, 4.5],
      [6.8, 5.5],
      [3.5, 5.5],
    ]);
  });

  it('extension follows the rotation (90° stair extends +y)', () => {
    const hole = stairHoleRect(makeStair({ rotationDeg: 90 }));
    expect(hole[1]![1]).toBeCloseTo(6.8, 6);
    expect(hole[0]![1]).toBeCloseTo(3.5, 6);
  });
});

describe('stairProgress — longitudinal parametrization', () => {
  it('runs 0 at the downhill edge to 1 at the top riser', () => {
    const stair = makeStair();
    expect(stairProgress(stair, 3.5, 5)).toBe(0);
    expect(stairProgress(stair, 5, 5)).toBeCloseTo(0.5, 9);
    expect(stairProgress(stair, 6.5, 5)).toBe(1);
  });

  it('null outside the footprint (either axis)', () => {
    const stair = makeStair();
    expect(stairProgress(stair, 7, 5)).toBeNull();
    expect(stairProgress(stair, 5, 6)).toBeNull();
  });
});

describe('buildStairSteps — solid tread boxes', () => {
  it('emits stepCount boxes with the tread/riser progression', () => {
    const stair = makeStair(); // tread 0.3, riser 0.27
    const steps = buildStairSteps(stair, 0);
    expect(steps).toHaveLength(10);
    // Box i: longitudinal [i*tread, (i+1)*tread], top at (i+1)*riser.
    const first = steps[0]!;
    expect(first.positions[0]).toBeCloseTo(3.5, 6); // s0 = 0
    expect(first.positions[3]).toBeCloseTo(3.8, 6); // s1 = tread
    expect(first.positions[2]).toBe(0); // z0 = zLower
    expect(first.positions[14]).toBeCloseTo(0.27, 6); // top of box 0
    const last = steps[9]!;
    expect(last.positions[0]).toBeCloseTo(6.2, 6);
    expect(last.positions[14]).toBeCloseTo(2.7, 6);
  });

  it('triangle count == stepCount × 12 (golden formula)', () => {
    for (const n of [3, 7, 14]) {
      const steps = buildStairSteps(makeStair({ stepCount: n }), 2.7);
      const tris = steps.reduce((s, b) => s + b.indices.length / 3, 0);
      expect(tris).toBe(n * 12);
    }
  });

  it('zLower lifts the whole stack (departure elevation)', () => {
    const steps = buildStairSteps(makeStair(), 2.7);
    expect(steps[0]!.positions[2]).toBeCloseTo(2.7, 6);
    expect(steps[9]!.positions[14]).toBeCloseTo(5.4, 6);
  });
});

describe('stairFlankBoxes — flank fencing', () => {
  it('two rails flanking the run, z-band [zLower, zLower+rise]', () => {
    const stair = makeStair();
    const boxes = stairFlankBoxes(stair, 0);
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.minZ).toBe(0);
      expect(box.maxZ).toBe(2.7);
    }
    // Rails hug the footprint sides: y ranges just outside [4.5, 5.5].
    const ys = boxes.map((b) => [b.minY, b.maxY]).sort((a, b) => a[0]! - b[0]!);
    expect(ys[0]![1]).toBeCloseTo(4.5, 6);
    expect(ys[1]![0]).toBeCloseTo(5.5, 6);
    // Rails span the full run longitudinally.
    for (const box of boxes) {
      expect(box.minX).toBeCloseTo(3.5, 6);
      expect(box.maxX).toBeCloseTo(6.5, 6);
    }
  });
});

describe('validateStairs — compile-time geometric checks', () => {
  function planWith(stairs: Staircase[], rooms?: Room[]): FloorplanData {
    const base = townhouse();
    return {
      ...base,
      floors: rooms
        ? base.floors.map((f, i) => (i === 0 ? { ...f, rooms } : f))
        : base.floors,
      stairs,
    };
  }

  it('rejects a rise that matches no higher floor', () => {
    const stair = { ...townhouseStair(), rise: 2.5 };
    const plan = planWith([stair]);
    expect(() =>
      validateStairs(plan, new Map(flatRooms(plan).map((r) => [r.id, r]))),
    ).toThrow(StairGapMismatchError);
  });

  it('rejects an unknown host room', () => {
    const stair = { ...townhouseStair(), roomId: 'room-nope' };
    const plan = planWith([stair]);
    expect(() =>
      validateStairs(plan, new Map(flatRooms(plan).map((r) => [r.id, r]))),
    ).toThrow(UnknownStairRoomError);
  });

  it('rejects a footprint escaping its host room', () => {
    // Park the stair mostly outside the entry hall.
    const stair = { ...townhouseStair(), position: [20, 3] as [number, number] };
    const plan = planWith([stair]);
    expect(() =>
      validateStairs(plan, new Map(flatRooms(plan).map((r) => [r.id, r]))),
    ).toThrow(StairOutOfBoundsException);
  });

  it('rejects overlapping landing holes', () => {
    const a = townhouseStair();
    const b = { ...a, id: 'stair-b', position: [9.02, 3.02] as [number, number] };
    const plan = planWith([a, b]);
    expect(() =>
      validateStairs(plan, new Map(flatRooms(plan).map((r) => [r.id, r]))),
    ).toThrow(OverlappingStairHolesError);
  });

  it('accepts the committed fixture stair', () => {
    const plan = townhouse();
    expect(() =>
      validateStairs(plan, new Map(flatRooms(plan).map((r) => [r.id, r]))),
    ).not.toThrow();
  });

  it('skips everything for empty stairs[] (golden protection)', () => {
    const plan = planWith([]);
    expect(() =>
      validateStairs(plan, new Map()),
    ).not.toThrow();
  });
});

describe('buildFloorWithHoles — rect-hole subtraction', () => {
  const SQUARE: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];

  it('returns null when the hole misses the ring (plain fan survives)', () => {
    const far: [[number, number], [number, number], [number, number], [number, number]] = [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
    ];
    expect(buildFloorWithHoles(SQUARE, [far], 0, false)).toBeNull();
  });

  it('interior hole: mesh covers the ring but not the hole', () => {
    const hole: [[number, number], [number, number], [number, number], [number, number]] = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ];
    const mesh = buildFloorWithHoles(SQUARE, [hole], 0, false);
    expect(mesh).not.toBeNull();
    expect(covers(mesh!, 0.5, 0.5)).toBe(true);
    expect(covers(mesh!, 3.9, 3.9)).toBe(true);
    expect(covers(mesh!, 1.5, 1.5)).toBe(false);
  });

  it('flush hole (sharing the ring\'s north edge) still punches', () => {
    const hole: [[number, number], [number, number], [number, number], [number, number]] = [
      [1, 3],
      [3, 3],
      [3, 4],
      [1, 4],
    ];
    const mesh = buildFloorWithHoles(SQUARE, [hole], 0, false);
    expect(mesh).not.toBeNull();
    expect(covers(mesh!, 2, 3.5)).toBe(false);
    expect(covers(mesh!, 2, 2.9)).toBe(true);
  });

  it('hole straddling the rim halves cleanly', () => {
    const hole: [[number, number], [number, number], [number, number], [number, number]] = [
      [1, 3],
      [3, 3],
      [3, 5],
      [1, 5],
    ];
    const mesh = buildFloorWithHoles(SQUARE, [hole], 0, false);
    expect(mesh).not.toBeNull();
    expect(covers(mesh!, 2, 3.5)).toBe(false);
    expect(covers(mesh!, 2, 2.5)).toBe(true);
  });

  it('deterministic: two runs produce identical buffers', () => {
    const hole: [[number, number], [number, number], [number, number], [number, number]] = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ];
    const a = buildFloorWithHoles(SQUARE, [hole], 0, false);
    const b = buildFloorWithHoles(SQUARE, [hole], 0, false);
    expect([...a!.positions]).toEqual([...b!.positions]);
    expect([...a!.indices]).toEqual([...b!.indices]);
  });
});

describe('compile integration — stair-free plans stay byte-identical', () => {
  it('stripping stairs[] removes EXACTLY the stair artefacts', () => {
    const withStairs = compilePlan(townhouse());
    const sansStairs = compilePlan({ ...townhouse(), stairs: [] });
    // Stair solid: 14 boxes × 12 triangles (merged mesh, formula-pinned).
    expect(withStairs.stairs).toHaveLength(1);
    expect(withStairs.stairs![0]!.mesh.indices.length / 3).toBe(168);
    // Sans stairs: no solids, two fewer collision boxes (the flanks).
    expect(sansStairs.stairs).toHaveLength(0);
    expect(withStairs.collisions.length - sansStairs.collisions.length)
      .toBe(2);
    // Room meshes differ ONLY through the landing-hole punch (the
    // total counts are pinned exhaustively in townhouse.golden.spec).
    expect(countTriangles(sansStairs)).toBeLessThan(countTriangles(withStairs));
  });

  it('stair footprint axes agree between compile output and pure math', () => {
    const scene = compilePlan(townhouse());
    const solid = scene.stairs![0]!;
    const fp = stairFootprint(townhouseStair());
    expect(solid.ux).toBeCloseTo(fp.ux, 9);
    expect(solid.uy).toBeCloseTo(fp.uy, 9);
    expect(solid.zLower).toBe(0);
    expect(solid.rise).toBe(2.7);
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
