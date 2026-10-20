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
 *   4. #112 FIX ROUND — STACKED COINCIDENCE: room-master-bedroom
 *      (floor-upper) reuses room-living's footprint exactly in the
 *      shipped demo/demo-townhouse.json. Treating full coincidence as
 *      mere boundary contact let the stacked twin leak a phantom
 *      cross-storey row (3 rows) that carves real geometry through
 *      compile.ts flatOpenings roomId resolution across floors.
 *      Fix: exact footprint coincidence counts as overlap (clause (d)).
 *
 * Unregressed guarantees pinned here too: the legitimate 5 mm-offset
 * shared wall still pairs, and the inclusive-at-exactly-10 mm pairing
 * boundary holds at the EMISSION level.
 *
 * RED on main @52ab4e9: cases 1, 2 and the derivePairRows agreement
 * fail (3 rows / 4 rows emitted where 2 are honest). The round-4
 * stacked pin is RED at the pre-fix tip of feat/112-adjacency-purge
 * (3 rows) and GREEN at BASE (2 rows), matching the tester's
 * BASE = 2 rows report.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Room, Vec2 } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { parseValidatedPlan } from '../../src/geom';
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

describe('#112 fix round: stacked coincident footprints (townhouse)', () => {
  // The shipped demo/demo-townhouse.json stacks room-master-bedroom
  // (floor-upper) EXACTLY on room-living (floor-ground) — identical
  // footprints on two storeys. A door committed on kitchen's west wall
  // legitimately mirrors to the ground-floor neighbour; treating the
  // exact coincidence as mere boundary CONTACT let the stacked upper
  // room leak a phantom third row, which carves real geometry through
  // compile.ts flatOpenings roomId resolution across floors.
  // Pinned: exactly 2 fresh rows — kitchen + living, never the twin.
  const townhouse = (): FloorplanData =>
    parseValidatedPlan(
      migrate(
        JSON.parse(readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8')),
      ).data!,
    );

  function freshRows(dispatch: (store: EditorStore) => void): Array<{ roomId: string }> {
    const store = new EditorStore(townhouse());
    const before = store.getState().data.floors.map((f) => f.openings.length);
    dispatch(store);
    return store.getState().data.floors.flatMap((f, i) => f.openings.slice(before[i]));
  }

  it('one commit emits exactly 2 rows: kitchen + living, no phantom upper row', () => {
    const fresh = freshRows((store) => {
      const res = store.dispatch({
        type: 'addOpening',
        roomId: 'room-kitchen',
        segmentIndex: 3,
        tCenter: 0.5,
        ...DOOR,
      });
      expect(res.ok).toBe(true);
    });
    expect(fresh).toHaveLength(2);
    expect(fresh.map((o) => o.roomId).sort()).toEqual(['room-kitchen', 'room-living']);
    expect(fresh.filter((o) => o.roomId === 'room-master-bedroom')).toHaveLength(0);
  });

  it('derivePairRows (model layer) agrees: stacked twin stays purged', () => {
    const rows = derivePairRows(townhouse(), {
      roomId: 'room-kitchen',
      segmentIndex: 3,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.roomId).sort()).toEqual(['room-kitchen', 'room-living']);
  });
});

describe('#140: coincidence epsilon widened to 1e-9 (boundary pin)', () => {
  // Clause (d) used OVERLAP_EPS (1e-12): a coincident stacked twin with
  // one vertex perturbed by >=1e-12 m escaped coincidence detection and
  // (clauses (a)-(c) being blind to near-coincidence — everything sits
  // ON the boundary, contact not overlap) leaked a phantom cross-storey
  // row. COINCIDE_EPS widens the match to 1e-9 (SAT-touch convention).
  // Pin the boundary THROUGH the public derivePairRows channel: a
  // 1e-10 perturbation (inside the new window, outside the old) purges
  // the twin exactly like the exact-coincidence pins above.
  //
  // Residual window (documented on polygonsCoincide): perturbations
  // strictly between 1e-9 and (a)-(c)-visibility remain undetected at
  // any finite epsilon — geometrically unavoidable, and no float
  // coordinate input path produces displacements that small.

  // Fixture-derived (guard against drift): the twin copies
  // room-living's footprint [[0,0],[5.2,0],[5.2,3.8],[0,3.8]]
  // vertex-for-vertex; the nudge lands on vertex 2 (0.1 nm east).
  const NUDGED_VERTEX_IDX = 2;
  const NUDGE = 1e-10;

  function perturbedTownhouse(): FloorplanData {
    const plan = parseValidatedPlan(
      migrate(
        JSON.parse(
          readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8'),
        ),
      ).data!,
    );
    const upper = plan.floors
      .flatMap((f) => f.rooms)
      .find((r) => r.id === 'room-master-bedroom');
    // Sanity: the fixture's twin starts EXACTLY coincident; clone the
    // perturbation onto the upper twin's own vertices (same footprint
    // as room-living modulo the nudge).
    expect(upper).toBeDefined();
    const living = plan.floors
      .flatMap((f) => f.rooms)
      .find((r) => r.id === 'room-living');
    expect(living).toBeDefined();
    // Perturbing the twin's own cloned vertices keeps the pin honest
    // against fixture drift (no hand-typed coordinates involved).
    upper!.polygon = upper!.polygon.map(
      (v, i) =>
        (i === NUDGED_VERTEX_IDX
          ? ([v[0] + NUDGE, v[1]] as Vec2)
          : ([v[0], v[1]] as Vec2)),
    );
    // Twin and living agreed exactly BEFORE the nudge — precondition.
    expect(upper!.polygon.length).toBe(living!.polygon.length);
    const maxDrift = Math.max(
      ...upper!.polygon.map(
        (v, i) =>
          Math.max(
            Math.abs(v[0] - living!.polygon[i][0]),
            Math.abs(v[1] - living!.polygon[i][1]),
          ),
      ),
    );
    // Float rounding at 5.2 realizes the nudge as ~1.0000001e-10; any
    // drift within 2e-10 satisfies the pin (still 5000x inside the
    // 1e-9 window, and far outside the OLD 1e-12 one).
    expect(maxDrift).toBeLessThanOrEqual(2 * NUDGE);
    expect(maxDrift).toBeGreaterThan(0);
    return plan;
  }

  it('a 1e-10 vertex perturbation still purges the stacked twin (2 rows)', () => {
    const rows = derivePairRows(perturbedTownhouse(), {
      roomId: 'room-kitchen',
      segmentIndex: 3,
      tCenter: 0.5,
      width: 0.9,
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.roomId).sort()).toEqual([
      'room-kitchen',
      'room-living',
    ]);
  });

  it('one commit through the store never grants the twin a fresh row', () => {
    const store = new EditorStore(perturbedTownhouse());
    const before = store
      .getState()
      .data.floors.map((f) => f.openings.length);
    const res = store.dispatch({
      type: 'addOpening',
      roomId: 'room-kitchen',
      segmentIndex: 3,
      tCenter: 0.5,
      ...DOOR,
    });
    expect(res.ok).toBe(true);
    const fresh = store
      .getState()
      .data.floors.flatMap((f, i) => f.openings.slice(before[i]));
    expect(fresh).toHaveLength(2);
    expect(fresh.map((o) => o.roomId).sort()).toEqual([
      'room-kitchen',
      'room-living',
    ]);
  });
});
