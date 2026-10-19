/**
 * Issue #40 (lead-trimmed, Pkg 13.3 part b) — over-emission honesty.
 * Two pinned behaviors:
 *
 *   1. CROSS-PAIR: a door committed on a shared wall must NOT also emit a
 *      mirror row for an unrelated room whose distinct wall sits within
 *      PAIR_TOLERANCE_M of the host and overlaps the same span (repro:
 *      living/kitchen shared wall at x=5 plus an extra room 8 mm east
 *      with the same y-span -> one commit emitted 3 rows). Fix: the
 *      counterpart must be the NEAREST qualifying segment.
 *   2. CLOSET DOUBLE-FACE: a sub-2 cm closet between two rooms must not
 *      acquire opening rows on BOTH faces from one neighboring commit
 *      (was 4 rows). Fix: a room whose interior chord depth at the cut
 *      is below PAIR_TOLERANCE_M cannot host a doorway — the cut walks
 *      through to the real room across.
 *   3. #112 SLAB IMPOSTOR: the impostor purge must not rely on the
 *      vertex-AVERAGE centroid proxy — a slab whose centroid falls
 *      outside the room it physically overlaps (and vice versa) still
 *      evaded the purge (3 rows). Fix: true interior-overlap predicate.
 *
 * Unregressed guarantees pinned here too: the legitimate 5 mm-offset
 * shared wall still pairs, and the inclusive-at-exactly-10 mm pairing
 * boundary holds at the EMISSION level.
 *
 * RED on main @52ab4e9: cases 1, 2 and the derivePairRows agreement
 * fail (3 rows / 4 rows emitted where 2 are honest).
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Room, Vec2 } from '../../src/shared/schema';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import { derivePairRows } from '../../src/editor/model/openings';

const DOOR = { kind: 'door' as const, width: 0.9, sillHeight: 0, headHeight: 2.05 };

function mkRoom(id: string, polygon: Vec2[]): Room {
  return { id, name: id, polygon, floorTexture: null };
}

const LIVING: Vec2[] = [[0, 0], [5, 0], [5, 4], [0, 4]];

function planWith(rooms: Room[]): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = rooms;
  return p;
}

/** Commit a door on living's EAST wall (seg 1, world y 2) and return rows. */
function commitEastDoor(store: EditorStore) {
  const res = store.dispatch({
    type: 'addOpening',
    roomId: 'living',
    segmentIndex: 1,
    tCenter: 0.5,
    ...DOOR,
  });
  expect(res.ok).toBe(true);
  return store.getState().data.floors[0].openings;
}

describe('#40 cross-pair: nearest counterpart wins (3 -> 2)', () => {
  const CROSS: FloorplanData = planWith([
    mkRoom('living', LIVING),
    mkRoom('kitchen', [[5, 0], [8, 0], [8, 4], [5, 4]]),
    // Unrelated impostor 8 mm east of the shared wall, same y-span,
    // overlapping kitchen's footprint (physically impossible plan).
    mkRoom('extra', [[5.008, 0], [8.008, 0], [8.008, 4], [5.008, 4]]),
  ]);

  it('one commit emits exactly 2 rows: living + kitchen, none for extra', () => {
    const ops = commitEastDoor(new EditorStore(CROSS));
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.roomId).sort()).toEqual(['kitchen', 'living']);
    expect(ops.filter((o) => o.roomId === 'extra')).toHaveLength(0);
  });

  it('derivePairRows (model layer) agrees with the store emission', () => {
    const rows = derivePairRows(CROSS, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].roomId).toBe('kitchen');
  });
});

describe('#40 closet: sub-tolerance room cannot host (4 -> 2)', () => {
  const CLOSET: FloorplanData = planWith([
    mkRoom('living', LIVING),
    // 5 mm sliver closet wedged between living and kitchen.
    mkRoom('sliver', [[5.005, 0], [5.01, 0], [5.01, 4], [5.005, 4]]),
    mkRoom('kitchen', [[5.01, 0], [8.01, 0], [8.01, 4], [5.01, 4]]),
  ]);

  it('one commit emits exactly 2 rows and the closet acquires NOTHING', () => {
    const ops = commitEastDoor(new EditorStore(CLOSET));
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.roomId).sort()).toEqual(['kitchen', 'living']);
    expect(ops.filter((o) => o.roomId === 'sliver')).toHaveLength(0);
  });

  it('derivePairRows (model layer) agrees: 2 rows, no sliver face', () => {
    const rows = derivePairRows(CLOSET, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].roomId).toBe('kitchen');
  });
});

describe('#112 mutually-exterior-centroid impostor: slab must still be purged', () => {
  // Slab [5.008,0]-[6.008,9] straddles the shared wall and physically
  // overlaps kitchen's footprint, but NEITHER room's vertex-average
  // centroid is inside the other: slab centroid ≈ (5.508, 4.5) sits
  // north of kitchen's y ≤ 4, kitchen centroid (6.5, 2) sits east of
  // the slab's x ≤ 6.008. The vertex-average containment probe saw no
  // overlap -> 3 rows emitted where 2 are honest.
  const SLAB: FloorplanData = planWith([
    mkRoom('living', LIVING),
    mkRoom('kitchen', [[5, 0], [8, 0], [8, 4], [5, 4]]),
    mkRoom('slab', [[5.008, 0], [6.008, 0], [6.008, 9], [5.008, 9]]),
  ]);

  it('one commit emits exactly 2 rows: living + kitchen, none for slab', () => {
    const ops = commitEastDoor(new EditorStore(SLAB));
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.roomId).sort()).toEqual(['kitchen', 'living']);
    expect(ops.filter((o) => o.roomId === 'slab')).toHaveLength(0);
  });

  it('derivePairRows (model layer) agrees with the store emission', () => {
    const rows = derivePairRows(SLAB, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].roomId).toBe('kitchen');
  });
});

describe('#40 legit pairing unregressed + boundary pin', () => {
  it('a 5 mm-offset shared wall still pairs (core #38 guarantee)', () => {
    const p = planWith([
      mkRoom('living', LIVING),
      // Bed 5 mm east, flush-shifted span (staggered-pairing FLUSH case).
      mkRoom('bed', [[5.005, 0.5], [8.005, 0.5], [8.005, 3], [5.005, 3]]),
    ]);
    const ops = commitEastDoor(new EditorStore(p));
    expect(ops).toHaveLength(2);
    expect(ops[1].roomId).toBe('bed');
  });

  it('a wall exactly 10 mm off still pairs (inclusive boundary, emission level)', () => {
    const p = planWith([
      mkRoom('living', LIVING),
      mkRoom('bed', [[5.01, 0.5], [8.01, 0.5], [8.01, 3], [5.01, 3]]),
    ]);
    const ops = commitEastDoor(new EditorStore(p));
    expect(ops).toHaveLength(2);
    expect(ops[1].roomId).toBe('bed');
  });

  it('10.0001 mm off does not pair (exclusive just past the boundary)', () => {
    const p = planWith([
      mkRoom('living', LIVING),
      mkRoom('bed', [[5.0100001, 0.5], [8.0100001, 0.5], [8.0100001, 3], [5.0100001, 3]]),
    ]);
    const ops = commitEastDoor(new EditorStore(p));
    expect(ops).toHaveLength(1); // honest single cut
  });
});
