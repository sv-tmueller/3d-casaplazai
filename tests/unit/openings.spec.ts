/**
 * Unit tests for the openings model layer (pkg 3).
 * Covers: fit rules incl. edge margin, sill epsilon rules (AC3),
 * overlap checks, two-row shared-door derivation + complementarity +
 * consistency audit (AC1 groundwork), nearest-segment picking.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Opening, Room } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import {
  WINDOW_SILL_EPSILON_M,
  clampTForDrag,
  derivePairRows,
  nearestSegment,
  openingAt,
  openingDragClash,
  openingFitError,
  openingTwinIds,
  openingsOverlap,
  pairConsistencyErrors,
  pointAtT,
  projectOntoSegment,
  roomSegments,
  validateOpeningCandidate,
} from '../../src/editor/model/openings';
import { validateOpeningDraft } from '../../src/editor/controller';

function squareRoom(id: string, x0 = 0, y0 = 0, w = 5, h = 4): Room {
  return {
    id,
    name: id,
    polygon: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]],
    floorTexture: null,
  };
}

function twoRoomSharedWall(): FloorplanData {
  // Living room: (0,0)-(5,0)-(5,4)-(0,4). Kitchen: (5,0)-(8,0)-(8,4)-(5,4).
  // Shared wall x=5 traversed UP by living (seg 1) and DOWN by kitchen (seg 3).
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [squareRoom('living', 0, 0, 5, 4), squareRoom('kitchen', 5, 0, 3, 4)],
    openings: [],
    furniture: [],
  }).data!;
}

describe('roomSegments basics', () => {
  it('produces correct lengths and indices', () => {
    const room = squareRoom('r');
    const segs = roomSegments(room);
    expect(segs.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(segs[0].length).toBeCloseTo(5);
    expect(segs[1].length).toBeCloseTo(4);
  });

  it('maps tCenter to world points', () => {
    const seg = roomSegments(squareRoom('r'))[0];
    expect(pointAtT(seg, 0)).toEqual([0, 0]);
    expect(pointAtT(seg, 1)).toEqual([5, 0]);
    expect(pointAtT(seg, 0.5)[0]).toBeCloseTo(2.5);
  });

  it('projects a point onto the segment param space', () => {
    const seg = roomSegments(squareRoom('r'))[0];
    expect(projectOntoSegment([2, 1], seg)).toBeCloseTo(0.4);
    expect(projectOntoSegment([-3, 1], seg)).toBe(0);
    expect(projectOntoSegment([9, 1], seg)).toBe(1);
  });
});

describe('fit rules (AC2)', () => {
  it('mid-span fitting width passes', () => {
    expect(openingFitError(5, 0.5, 0.9)).toBeNull();
  });

  it('width larger than the segment rejects with overflow', () => {
    expect(openingFitError(5, 0.5, 5.1)).toMatch(/OVERFLOW_(START|END)/);
  });

  it('cutout hitting the exact segment end rejects', () => {
    // t=0.5, w=5 → touches both ends
    expect(openingFitError(5, 0.5, 5)).toMatch(/OVERFLOW|CORNER/);
  });

  it('violating EDGE_MARGIN rejects with TOO_CLOSE_TO_CORNER', () => {
    // segLen 5, margin .05 → safe zone [.05, 4.95]; w=.9 centered at t=.03
    // puts interval [.03*5-.45=-.3 … ] → overflow start actually. Choose
    // interval ending exactly at margin boundary: center t such that
    // hi = 4.95 → t=(4.95+.45)/5=1.08 impossible; use smaller width:
    // w=0.9, hi=4.95 → t=(4.95+0.45)/5=1.08 nope. Simpler: segLen=1,
    // w=0.8, center t=0.5 → [.1,.9]: inside [.05,.95]? yes → ok
    expect(openingFitError(1, 0.5, 0.8)).toBeNull();
    // w=0.92 → [.04,.96] violates margins
    expect(openingFitError(1, 0.5, 0.92)).toBe('TOO_CLOSE_TO_CORNER');
  });

  it('validateOpeningCandidate encodes door sill 0 legality (AC3)', () => {
    expect(validateOpeningCandidate({
      kind: 'door', segLen: 5, tCenter: 0.5, width: 0.9, sillHeight: 0, headHeight: 2.05,
    })).toBeNull();
  });

  it('window sill below epsilon rejects (AC3)', () => {
    expect(validateOpeningCandidate({
      kind: 'window', segLen: 5, tCenter: 0.5, width: 1.2, sillHeight: 0.001, headHeight: 2.3,
    })).toBe('WINDOW_SILL_TOO_LOW');
    expect(WINDOW_SILL_EPSILON_M).toBeGreaterThan(0);
    expect(validateOpeningCandidate({
      kind: 'window', segLen: 5, tCenter: 0.5, width: 1.2, sillHeight: WINDOW_SILL_EPSILON_M, headHeight: 2.3,
    })).toBeNull();
  });

  it('head below sill rejects', () => {
    expect(validateOpeningCandidate({
      kind: 'door', segLen: 5, tCenter: 0.5, width: 0.9, sillHeight: 0.5, headHeight: 0.4,
    })).toBe('HEAD_BELOW_SILL');
  });
});

describe('overlap on same segment', () => {
  const mk = (over: Partial<Opening>): Opening => ({
    id: 'x', roomId: 'r', kind: 'door', segmentIndex: 0,
    tCenter: 0.5, width: 1, sillHeight: 0, headHeight: 2, ...over,
  });
  it('detects overlapping intervals', () => {
    expect(openingsOverlap(mk({}), mk({ id: 'y', tCenter: 0.55 }), 5)).toBe(true);
  });
  it('allows disjoint neighbors', () => {
    expect(openingsOverlap(mk({ tCenter: 0.2, width: 0.5 }), mk({ id: 'y', tCenter: 0.8, width: 0.5 }), 5)).toBe(false);
  });
});

describe('two-row shared-door convention (AC1)', () => {
  it('derives a mirrored companion row with complementary tCenter', () => {
    const plan = twoRoomSharedWall();
    const rows = derivePairRows(plan, { roomId: 'living', segmentIndex: 1, tCenter: 0.55 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ roomId: 'living', segmentIndex: 1, tCenter: 0.55 });
    expect(rows[1].roomId).toBe('kitchen');
    expect(rows[1].segmentIndex).toBe(3);
    expect(rows[1].tCenter).toBeCloseTo(0.45);
  });

  it('non-shared walls yield a single row', () => {
    const plan = twoRoomSharedWall();
    const rows = derivePairRows(plan, { roomId: 'living', segmentIndex: 0, tCenter: 0.5 });
    expect(rows).toHaveLength(1);
  });

  it('pair consistency audit passes aligned rows and flags drifted widths', () => {
    const plan = twoRoomSharedWall();
    const rows = derivePairRows(plan, { roomId: 'living', segmentIndex: 1, tCenter: 0.55 });
    const mkOpening = (spec: typeof rows[number]): Opening => ({
      id: 'x', kind: 'door', width: 0.85, sillHeight: 0, headHeight: 2.05, ...spec,
    });
    expect(pairConsistencyErrors(rows.map(mkOpening))).toEqual([]);
    const bad = rows.map(mkOpening);
    bad[1].width = 1.2;
    expect(pairConsistencyErrors(bad)).toContain('PAIR_WIDTH_MISMATCH');
  });

  it('world alignment: both rows resolve to the same physical gap', () => {
    const plan = twoRoomSharedWall();
    const rows = derivePairRows(plan, { roomId: 'living', segmentIndex: 1, tCenter: 0.55 });
    const w = 0.85;
    // living seg 1 goes (5,0)->(5,4) upward; kitchen seg 3 goes (5,4)->(5,0) downward.
    const livingSeg = roomSegments(plan.floors[0].rooms[0])[1];
    const kitchenSeg = roomSegments(plan.floors[0].rooms[1])[3];
    const aLo = rows[0].tCenter * livingSeg.length - w / 2; // meters from (5,0)
    const aHi = rows[0].tCenter * livingSeg.length + w / 2;
    const bLo = rows[1].tCenter * kitchenSeg.length - w / 2; // meters from (5,4)
    const bHi = rows[1].tCenter * kitchenSeg.length + w / 2;
    // Convert kitchen distances-from-(5,4) into distances-from-(5,0):
    const bLoFlipped = kitchenSeg.length - bHi;
    const bHiFlipped = kitchenSeg.length - bLo;
    expect(Math.abs(aLo - bLoFlipped)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(aHi - bHiFlipped)).toBeLessThanOrEqual(0.01);
    // And the shared point on the wall matches:
    const pl = pointAtT(livingSeg, rows[0].tCenter);
    const pk = pointAtT(kitchenSeg, rows[1].tCenter);
    expect(pl[0]).toBeCloseTo(pk[0]);
    expect(pl[1]).toBeCloseTo(pk[1]);
  });

  it('tolerates a 5 mm-offset shared wall (#36)', () => {
    const plan = twoRoomSharedWall();
    plan.floors[0].rooms[1].polygon = [
      [5.005, 0],
      [8.005, 0],
      [8.005, 4],
      [5.005, 4],
    ];
    const rows = derivePairRows(plan, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.55,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].roomId).toBe('kitchen');
    expect(rows[1].segmentIndex).toBe(3);
    expect(rows[1].tCenter).toBeCloseTo(0.45);
  });

  it('does not pair at a 2 cm offset (#36 boundary)', () => {
    const plan = twoRoomSharedWall();
    plan.floors[0].rooms[1].polygon = [
      [5.02, 0],
      [8.02, 0],
      [8.02, 4],
      [5.02, 4],
    ];
    const rows = derivePairRows(plan, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.55,
    });
    expect(rows).toHaveLength(1);
  });
});

describe('nearestSegment picking', () => {
  it('highlights the closest segment within radius', () => {
    const room = squareRoom('r');
    expect(nearestSegment(room, [2.5, -0.1])?.index).toBe(0);
    expect(nearestSegment(room, [4.9, 2])?.index).toBe(1);
    expect(nearestSegment(room, [2.5, 2])).toBeNull(); // middle: no wall nearby
  });
});

describe('openingAt hit-testing (issue #52)', () => {
  function opening(over: Partial<Opening>): Opening {
    return {
      id: 'op',
      roomId: 'living',
      kind: 'door',
      segmentIndex: 0,
      tCenter: 0.5,
      width: 1,
      sillHeight: 0,
      headHeight: 2.1,
      ...over,
    };
  }

  it('hits inside the cutout span', () => {
    const plan = twoRoomSharedWall();
    plan.floors[0].openings = [opening({})];
    // Living south wall y=0 from x=0..5; span 1 m ⇒ x ∈ [2.0, 3.0].
    expect(openingAt([2.6, 0.05], plan)?.id).toBe('op');
  });

  it('misses outside the span (same wall, within radius)', () => {
    const plan = twoRoomSharedWall();
    plan.floors[0].openings = [opening({})];
    // t=0.98 ⇒ 2.4 m from tCenter, far beyond width/2 = 0.5 m.
    expect(openingAt([4.9, 0], plan)).toBeNull();
  });

  it('misses when the click is off the wall (>0.3 m)', () => {
    const plan = twoRoomSharedWall();
    plan.floors[0].openings = [opening({})];
    expect(openingAt([2.5, 0.5], plan)).toBeNull(); // 0.5 m from wall
    expect(openingAt([2.5, 0.25], plan)?.id).toBe('op'); // inside radius
  });

  it('treats the clamped span edges inclusively and rejects just past', () => {
    const plan = twoRoomSharedWall();
    plan.floors[0].openings = [opening({})];
    expect(openingAt([2.0, 0], plan)?.id).toBe('op'); // exact lo edge
    expect(openingAt([3.0, 0], plan)?.id).toBe('op'); // exact hi edge
    expect(openingAt([1.95, 0], plan)).toBeNull(); // 5 cm past lo
    expect(openingAt([3.05, 0], plan)).toBeNull(); // 5 cm past hi
  });

  it('picks the intended kind when door and window share the wall', () => {
    const plan = twoRoomSharedWall();
    plan.floors[0].openings = [
      opening({ id: 'door1', kind: 'door', tCenter: 0.2, width: 1 }),
      opening({ id: 'win1', kind: 'window', tCenter: 0.8, width: 1 }),
    ];
    expect(openingAt([1.0, 0], plan)?.kind).toBe('door'); // t=0.2
    expect(openingAt([4.0, 0], plan)?.kind).toBe('window'); // t=0.8
  });

  it('returns null when the room/segment cannot be resolved', () => {
    const plan = twoRoomSharedWall();
    plan.floors[0].openings = [opening({ roomId: 'ghost' })];
    expect(openingAt([2.5, 0], plan)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Issue #61: drag-time clash exclusion + corner clamp                *
 * ------------------------------------------------------------------ */

/** Two linked rows for a door on the shared wall x=5 (living seg 1). */
function pairedDoorPlan(): FloorplanData {
  const plan = twoRoomSharedWall();
  const rows = derivePairRows(plan, {
    roomId: 'living',
    segmentIndex: 1,
    tCenter: 0.55,
    width: 1,
  });
  plan.floors[0].openings = rows.map((r, i) => ({
    id: i === 0 ? 'd-living' : `d-pair-${i}`,
    roomId: r.roomId,
    kind: 'door' as const,
    segmentIndex: r.segmentIndex,
    tCenter: r.tCenter,
    width: r.width ?? 1,
    sillHeight: 0,
    headHeight: 2.1,
  }));
  return plan;
}

/** Minimal solo door row on the living room's south wall (seg 0). */
function soloDoor(plan: FloorplanData, id: string): FloorplanData {
  plan.floors[0].openings = [
    {
      id,
      roomId: 'living',
      kind: 'door',
      segmentIndex: 0,
      tCenter: 0.5,
      width: 1,
      sillHeight: 0,
      headHeight: 2.1,
    },
  ];
  return plan;
}

describe('openingTwinIds (issue #61)', () => {
  it('returns just the id for an unpaired row', () => {
    const plan = soloDoor(twoRoomSharedWall(), 'solo');
    expect(openingTwinIds(plan, 'solo')).toEqual(new Set(['solo']));
  });

  it('includes the collinear partner row of a paired door', () => {
    const plan = pairedDoorPlan();
    expect(plan.floors[0].openings).toHaveLength(2);
    expect(openingTwinIds(plan, 'd-living')).toEqual(
      new Set(['d-living', 'd-pair-1']),
    );
  });
});

describe('openingDragClash — self/twin exclusion (issue #61)', () => {
  it('does NOT flag the dragged pair against itself (the trap)', () => {
    const plan = pairedDoorPlan();
    // Sanity: the naive draft validator DOES flag the dragged row as a
    // clash with itself — exactly the false positive this helper avoids.
    expect(
      validateOpeningDraft(plan, 'living', 1, 'door', 0.55, 1, 0, 2.1),
    ).toBe('CLASHES_EXISTING_OPENING');
    // Sliding along its own wall to a free spot stays clash-free.
    expect(openingDragClash(plan, 'd-living', 0.6)).toBe(false);
    expect(openingDragClash(plan, 'd-living', 0.55)).toBe(false);
  });

  it('still flags a genuine overlap with ANOTHER opening on the segment', () => {
    const plan = pairedDoorPlan();
    plan.floors[0].openings.push({
      id: 'other',
      roomId: 'living',
      kind: 'door',
      segmentIndex: 1,
      tCenter: 0.2,
      width: 0.85,
      sillHeight: 0,
      headHeight: 2.1,
    });
    expect(openingDragClash(plan, 'd-living', 0.6)).toBe(false);
    expect(openingDragClash(plan, 'd-living', 0.2)).toBe(true);
  });

  it('is false for an unknown id', () => {
    expect(openingDragClash(pairedDoorPlan(), 'nope', 0.5)).toBe(false);
  });
});

describe('clampTForDrag (issue #61)', () => {
  it('keeps the cutout inside the corner margins', () => {
    // segLen 4, width 1 → half 0.125, margin 0.0125 ⇒ band [.1375,.8625].
    expect(clampTForDrag(4, 1, 0)).toBeCloseTo(0.1375, 6);
    expect(clampTForDrag(4, 1, 1)).toBeCloseTo(0.8625, 6);
    expect(clampTForDrag(4, 1, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('collapses to mid-span on a degenerate/too-short wall', () => {
    expect(clampTForDrag(0, 1, 0.3)).toBe(0.5);
    expect(clampTForDrag(0.5, 4, 0.3)).toBe(0.5); // cutout wider than wall
  });
});
