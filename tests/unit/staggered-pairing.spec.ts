/**
 * Issue #41 — staggered shared walls (collinear, partially overlapping,
 * different lengths) must pair. The #38 pairing was ENDPOINT-based, so
 * hand-drawn staggered geometries never emitted the mirror row and a
 * door pierced only one wall. Pairing is now COLLINEAR-OVERLAP based and
 * the mirror tCenter comes from PROJECTION of the door's world point.
 *
 * RED on main @ a33eb47: every case below that expects two rows gets one.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Opening, Room, Vec2 } from '../../src/shared/schema';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import { derivePairRows, roomSegments } from '../../src/editor/model/openings';
import { buildCollisions, segmentHitsBoxes } from '../../src/geom/collision';

const DOOR = {
  kind: 'door' as const,
  width: 0.9,
  sillHeight: 0,
  headHeight: 2.05,
};

function mkRoom(id: string, polygon: Vec2[]): Room {
  return { id, name: id, polygon, floorTexture: null };
}

function plan(bed: Vec2[]): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = [
      // Living (0,0)->(5,0)->(5,4)->(0,4); seg 1 is the EAST wall, up.
      mkRoom('living', [[0, 0], [5, 0], [5, 4], [0, 4]]),
      // Bed tucked against PART of that east wall.
      mkRoom('bed', bed),
  ];
  return p;
}

function addDoor(store: EditorStore, tCenter: number) {
  return store.dispatch({
    type: 'addOpening',
    roomId: 'living',
    segmentIndex: 1,
    tCenter,
    ...DOOR,
  });
}

// Case 1 — partial overlap, one shared corner region: bed spans y 1..3.5.
const STAGGERED: Vec2[] = [[5, 1], [8, 1], [8, 3.5], [5, 3.5]];
// Case 2 — flush-shifted, ZERO shared vertices: bed spans y 0.5..3.
const FLUSH: Vec2[] = [[5, 0.5], [8, 0.5], [8, 3], [5, 3]];

describe('#41 staggered shared walls pair (model layer)', () => {
  it('case 1: partial overlap emits a mirror row for BOTH rooms', () => {
    const rows = derivePairRows(plan(STAGGERED), {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].roomId).toBe('bed');
    expect(rows[1].segmentIndex).toBe(3);
    // Projection of world point (5,2) onto bed seg 3 (5,3.5)->(5,1):
    // 1.5 m down a 2.5 m wall => t 0.6 (Naive complement(0.5)=0.5 is wrong).
    expect(rows[1].tCenter).toBeCloseTo(0.6);
  });

  it('case 2: flush-shifted (zero shared vertices) also emits both rows', () => {
    const rows = derivePairRows(plan(FLUSH), {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].roomId).toBe('bed');
    expect(rows[1].segmentIndex).toBe(3);
    // (5,2) on bed seg 3 (5,3)->(5,0.5): 1.0 m down 2.5 m => t 0.4.
    expect(rows[1].tCenter).toBeCloseTo(0.4);
  });
});

describe('#41 staggered pairing through the store (dispatch)', () => {
  it('case 1: door on the shared stretch commits two rows', () => {
    const store = new EditorStore(plan(STAGGERED));
    expect(addDoor(store, 0.5).ok).toBe(true);
    const ops = store.getState().data.floors[0].openings;
    expect(ops.map((o) => o.roomId)).toEqual(['living', 'bed']);
    expect(ops[1].tCenter).toBeCloseTo(0.6);
  });

  it('case 2: flush-shifted commits two rows', () => {
    const store = new EditorStore(plan(FLUSH));
    expect(addDoor(store, 0.5).ok).toBe(true);
    expect(store.getState().data.floors[0].openings.map((o) => o.roomId)).toEqual([
      'living',
      'bed',
    ]);
  });

  it('door on the NON-overlapping stretch is an honest single cut', () => {
    // t 0.25 -> cutout y [0.55, 1.45]; bed's overlap is y 1..3.5, so the
    // cutout is NOT hosted: one honest row (glue() then warns single-cut).
    const store = new EditorStore(plan(STAGGERED));
    expect(addDoor(store, 0.25).ok).toBe(true);
    expect(store.getState().data.floors[0].openings).toHaveLength(1);
  });

  it('editing a staggered row still syncs its partner by projection', () => {
    const store = new EditorStore(plan(STAGGERED));
    addDoor(store, 0.5);
    const a = store.getState().data.floors[0].openings[0];
    expect(
      store.dispatch({
        type: 'moveOpening',
        openingId: a.id,
        tCenter: 0.7,
        syncPair: true,
      }).ok,
    ).toBe(true);
    const [, b] = store.getState().data.floors[0].openings;
    // (5,2.8) projected onto bed seg 3 => (3.5-2.8)/2.5 = 0.28.
    expect(b.tCenter).toBeCloseTo(0.28);
  });

  it('reversed-orientation partner lands the same physical point', () => {
    // Bed wall drawn the OTHER way round (bottom->top): seg 3 (5,1)->(5,3.5).
    const revPlan = plan([[5, 3.5], [8, 3.5], [8, 1], [5, 1]]);
    const store = new EditorStore(revPlan);
    addDoor(store, 0.5);
    const [a, b] = store.getState().data.floors[0].openings;
    expect(b.roomId).toBe('bed');
    const livingSeg = roomSegments(revPlan.floors[0].rooms[0])[1];
    const bedSeg = roomSegments(revPlan.floors[0].rooms[1])[b.segmentIndex];
    const wa = [
      livingSeg.a[0] + (livingSeg.b[0] - livingSeg.a[0]) * a.tCenter,
      livingSeg.a[1] + (livingSeg.b[1] - livingSeg.a[1]) * a.tCenter,
    ];
    const wb = [
      bedSeg.a[0] + (bedSeg.b[0] - bedSeg.a[0]) * b.tCenter,
      bedSeg.a[1] + (bedSeg.b[1] - bedSeg.a[1]) * b.tCenter,
    ];
    expect(wa[1]).toBeCloseTo(wb[1]);
  });
});

describe('#41 probes: nearby-but-distinct walls still do NOT pair', () => {
  it('collinear walls with DISJOINT spans never pair (guard #40)', () => {
    // Bed wall sits on the same line x=5 but 1 m north of living's span.
    const p = plan([[5, 5], [8, 5], [8, 7], [5, 7]]);
    const rows = derivePairRows(p, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(1);
  });

  it('a 2 cm perpendicular offset on a staggered wall does not pair', () => {
    const p = plan([[5.02, 1], [8.02, 1], [8.02, 3.5], [5.02, 3.5]]);
    const rows = derivePairRows(p, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(1);
  });
});

describe('#41 compiler-level: staggered pair carves a passage through BOTH walls', () => {
  it('a straight walk crosses both staggered walls where the door sits', () => {
    const base = plan(STAGGERED);
    const rows = derivePairRows(base, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(2);
    const openings: Opening[] = rows.map((r, i) => ({
      id: `door-${i}`,
      roomId: r.roomId,
      kind: 'door',
      segmentIndex: r.segmentIndex,
      tCenter: r.tCenter,
      width: 0.9,
      sillHeight: 0,
      headHeight: 2.05,
    }));
    const boxes = buildCollisions({ ...base, floors: [{ ...base.floors[0], openings }] });
    // y=2 sits inside both door mouths: passage open.
    expect(segmentHitsBoxes(3, 2, 5.5, 2, boxes)).toBe(false);
    // y=3.2 is bed wall yet solid floor-to-ceiling: blocked.
    expect(segmentHitsBoxes(3, 3.2, 5.5, 3.2, boxes)).toBe(true);
  });
});
