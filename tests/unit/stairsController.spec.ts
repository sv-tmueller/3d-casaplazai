/**
 * Pkg 13.4 (issue #118) — stairs tool math (DOM-free): drag → flight
 * pose, deterministic step counts, arrival-floor resolution, departure
 * lookup, and the rect-simple marquee predicate. Mirrors the
 * controller.spec pattern.
 */
import { describe, expect, it } from 'vitest';
import {
  deriveStepCount,
  nearestArrivalFloor,
  STAIR_MIN_STEPS,
  STAIR_TREAD_TARGET_M,
  stairDepartureElevation,
  stairFromDrag,
  stairInBand,
} from '../../src/editor/controller';
import { emptyPlan } from '../../src/editor/store';
import type { Floor, FloorplanData, Room, Staircase, Vec2 } from '../../src/shared/schema';

function room(id: string, name: string): Room {
  return { id, name, polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], floorTexture: null };
}

function floor(id: string, name: string, elevation: number, roomId: string): Floor {
  return { id, name, elevation, rooms: [room(roomId, name)], openings: [], furniture: [] };
}

/** Ground (0) / Floor 2 (3.0) / Floor 3 (6.0) — addFloor's 3 m pitch. */
function threeStoreyPlan(): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = [room('g', 'Ground')];
  p.floors.push(floor('f2', 'Floor 2', 3.0, 'loft'), floor('f3', 'Floor 3', 6.0, 'attic'));
  return p;
}

describe('stairFromDrag (issue #118)', () => {
  it('east drag: uphill axis +x, centre at the drag midpoint', () => {
    const drag = stairFromDrag([0, 0], [4, 0]);
    expect(drag).not.toBeNull();
    expect(drag?.run).toBeCloseTo(4, 9);
    expect(drag?.rotationDeg).toBeCloseTo(0, 9);
    expect(drag?.position).toEqual([2, 0]);
  });

  it('north drag: 90° CCW', () => {
    const drag = stairFromDrag([0, 0], [0, 3]);
    expect(drag?.rotationDeg).toBeCloseTo(90, 9);
    expect(drag?.position).toEqual([0, 1.5]);
  });

  it('reversed drag keeps the anchor as the downhill edge (180°)', () => {
    const drag = stairFromDrag([2, 0], [0, 0]);
    expect(drag?.run).toBeCloseTo(2, 9);
    expect(drag?.rotationDeg).toBeCloseTo(180, 9);
    expect(drag?.position).toEqual([1, 0]);
  });

  it('diagonal drag: 45°', () => {
    const drag = stairFromDrag([0, 0], [1, 1]);
    expect(drag?.rotationDeg).toBeCloseTo(45, 9);
    expect(drag?.run).toBeCloseTo(Math.SQRT2, 9);
  });

  it('degenerate zero-length drag returns null', () => {
    expect(stairFromDrag([2, 2], [2, 2])).toBeNull();
  });
});

describe('deriveStepCount (issue #118)', () => {
  it('tread ≈ 0.28 m, rounded', () => {
    expect(deriveStepCount(2.8)).toBe(10);
    expect(deriveStepCount(5.6)).toBe(20);
    expect(deriveStepCount(STAIR_TREAD_TARGET_M * 7)).toBe(7);
  });

  it('clamps to the schema floor', () => {
    expect(deriveStepCount(0.28)).toBe(STAIR_MIN_STEPS);
    expect(deriveStepCount(0)).toBe(STAIR_MIN_STEPS);
    expect(deriveStepCount(-4)).toBe(STAIR_MIN_STEPS);
    expect(deriveStepCount(Number.NaN)).toBe(STAIR_MIN_STEPS);
  });

  it('is deterministic for the e2e waypoint contract', () => {
    expect(deriveStepCount(2.24)).toBe(8);
  });
});

describe('nearestArrivalFloor (issue #118)', () => {
  it('picks the nearest storey strictly above the departure', () => {
    const plan = threeStoreyPlan();
    expect(nearestArrivalFloor(plan, 0)?.id).toBe('f2');
    expect(nearestArrivalFloor(plan, 0)?.elevation).toBeCloseTo(3.0, 9);
    expect(nearestArrivalFloor(plan, 3.0)?.id).toBe('f3');
  });

  it('returns null when nothing is above (offer-addFloor signal)', () => {
    const plan = threeStoreyPlan();
    expect(nearestArrivalFloor(plan, 6.0)).toBeNull();
    expect(nearestArrivalFloor(emptyPlan(), 0)).toBeNull();
  });
});

describe('stairDepartureElevation (issue #118)', () => {
  it('resolves the hosting storey per room; null when unknown', () => {
    const plan = threeStoreyPlan();
    expect(stairDepartureElevation(plan, 'g')).toBe(0);
    expect(stairDepartureElevation(plan, 'loft')).toBe(3.0);
    expect(stairDepartureElevation(plan, 'nope')).toBeNull();
  });
});

describe('stairInBand — rect-simple marquee membership (issue #118)', () => {
  function stair(patch: Partial<Staircase>): Staircase {
    return {
      id: 'st-1',
      roomId: 'g',
      position: [5, 5] as Vec2,
      rotationDeg: 0,
      width: 1,
      run: 2,
      rise: 3,
      stepCount: 10,
      ...patch,
    };
  }

  it('axis-aligned footprint overlaps a sweeping band', () => {
    // Rect x∈[4,6], y∈[4.5,5.5].
    expect(stairInBand(stair({}), { minX: 5, minY: 5, maxX: 7, maxY: 7 })).toBe(true);
    expect(stairInBand(stair({}), { minX: 0, minY: 0, maxX: 1, maxY: 1 })).toBe(false);
  });

  it('rotated footprints are tested by their AABB (deliberately loose)', () => {
    // 90°: rect x∈[4.5,5.5], y∈[4,6].
    expect(
      stairInBand(stair({ rotationDeg: 90 }), { minX: 0, minY: 4, maxX: 4.6, maxY: 6 }),
    ).toBe(true);
    expect(
      stairInBand(stair({ rotationDeg: 90 }), { minX: 5.6, minY: 0, maxX: 9, maxY: 4 }),
    ).toBe(false);
  });

  it('touching edges do not count as overlap (half-open intervals)', () => {
    expect(stairInBand(stair({}), { minX: 6, minY: 4.5, maxX: 9, maxY: 9 })).toBe(false);
  });
});
