/**
 * Issue #47 — Pkg 3 tolerance hygiene. Pins the RATIFIED semantics of the
 * pairing tolerance (batch #44 decision log; architect-probed on main @
 * cf296cf) so a future refactor cannot silently change them:
 *
 *   - width-path FREEZE: widening a cut beyond the partner's collinear
 *     overlap copies NOTHING and implicitly unlinks the pair; narrowing
 *     back into the overlap re-syncs. Residual effects are a SILENT
 *     DESYNC (implicit unlink), not an unhosted mirror cut.
 *   - #40a SUPERSEDED by #111 (still holds): an 8 mm-east same-span
 *     impostor wall still receives a mirror row WHEN it is the only
 *     neighbour — sub-1 cm pairing is the documented purpose of
 *     PAIR_TOLERANCE_M; the cross-pair variant (impostor NEXT TO a
 *     genuine shared wall) is killed in emission-honesty.spec.ts.
 *   - #40b RESCINDED by #111 (issue #40 fix): a 5 mm sliver room no
 *     longer acquires rows on BOTH faces from one commit — the
 *     interior-depth gate (< PAIR_TOLERANCE_M cannot host) kills the
 *     closet double-face; the cut walks through to the real room
 *     across the sliver (now 2 rows, pinned in emission-honesty).
 *   - #40c INCLUSIVE: the perpendicular tie pairs (`perp <= tol`), one
 *     convention everywhere; exact-10 mm pairs, 10.0001 mm-plus rejects.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Room, Vec2 } from '../../src/shared/schema';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import {
  derivePairRows,
  roomSegments,
  sharedWallOverlap,
} from '../../src/editor/model/openings';

const DOOR = { kind: 'door' as const, width: 0.9, sillHeight: 0, headHeight: 2.05 };

function mkRoom(id: string, polygon: Vec2[]): Room {
  return { id, name: id, polygon, floorTexture: null };
}

const LIVING: Vec2[] = [[0, 0], [5, 0], [5, 4], [0, 4]];
// bed overlaps living's east wall (seg 1, up) only over y 1..3.5 (2.5 m of 4).
const STAGGERED: Vec2[] = [[5, 1], [8, 1], [8, 3.5], [5, 3.5]];

function plan(bed: Vec2[]): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = [mkRoom('living', LIVING), mkRoom('bed', bed)];
  return p;
}

describe('#47 width-path FREEZE (widening does not propagate; implicit unlink)', () => {
  function paired(): EditorStore {
    const store = new EditorStore(plan(STAGGERED));
    store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      ...DOOR,
    });
    return store;
  }

  it('widening beyond the partner overlap leaves the twin width frozen', () => {
    const store = paired();
    const [a, b] = store.getState().data.floors[0].openings;
    expect(b.width).toBeCloseTo(0.9);
    // t 0.5 -> world y 2; new w 2.6 -> cut y [0.7, 3.3]; bed hosts y [1, 3.5].
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 2.6 },
      syncPair: true,
    });
    // getState() returns the LIVE store state (store.ts reduceMutateOpening
    // mutates in place): pre-dispatch refs happen to work today only by
    // accident of that in-place mutation. Re-fetch AFTER the dispatch so
    // these assertions survive a future snapshot/immutable-store refactor
    // (reviewer #95: the old "snapshots" wording was false).
    const [a2, b2] = store.getState().data.floors[0].openings;
    expect(a2.width).toBeCloseTo(2.6);
    expect(b2.width).toBeCloseTo(0.9); // frozen: nothing copied to the twin
  });

  it('narrowing back into the overlap re-syncs the twin', () => {
    const store = paired();
    const [a] = store.getState().data.floors[0].openings;
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 2.6 },
      syncPair: true,
    });
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 0.7 },
      syncPair: true,
    });
    const [, b] = store.getState().data.floors[0].openings;
    expect(b.width).toBeCloseTo(0.7);
  });

  it('after the desync, moving the cut does NOT cascade to the twin', () => {
    const store = paired();
    const [a, b0] = store.getState().data.floors[0].openings;
    const twinT = b0.tCenter;
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 2.6 },
      syncPair: true,
    });
    // w 2.6 at t 0.6 -> cut y [1.1, 3.7]: still unhosted (> 3.5) => no partner.
    store.dispatch({
      type: 'moveOpening',
      openingId: a.id,
      tCenter: 0.6,
      syncPair: true,
    });
    // Same live-state hazard as above (reviewer #95): re-fetch AFTER the
    // dispatches so the assertions survive a snapshot/immutable-store
    // refactor instead of riding on in-place-mutation luck.
    const [a2, b] = store.getState().data.floors[0].openings;
    expect(a2.tCenter).toBeCloseTo(0.6);
    expect(b.tCenter).toBeCloseTo(twinT); // implicit unlink: no cascade
  });
});

describe('#47 #40a — 8 mm-east impostor as SOLE neighbour still pairs (superseded nuance)', () => {
  it('a wall 8 mm east of a same-span host still receives a mirror row', () => {
    const p = plan([[5.008, 0], [8.008, 0], [8.008, 4], [5.008, 4]]);
    const rows = derivePairRows(p, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      width: 0.9,
    });
    // 0.008 m < PAIR_TOLERANCE_M: the impostor row IS emitted by design.
    expect(rows).toHaveLength(2);
    expect(rows[1].roomId).toBe('bed');
  });
});

describe('#47 #40b — 5 mm sliver: closet double-face KILLED by #111', () => {
  it('one commit yields 2 rows; the sliver acquires NOTHING', () => {
    const p = emptyPlan();
    p.floors[0].rooms = [
        mkRoom('living', LIVING),
        // 5 mm sliver wedged between living and kitchen.
        mkRoom('sliver', [[5.005, 0], [5.01, 0], [5.01, 4], [5.005, 4]]),
        mkRoom('kitchen', [[5.01, 0], [8.01, 0], [8.01, 4], [5.01, 4]]),
    ];
    const store = new EditorStore(p);
    store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
      ...DOOR,
    });
    const ops = store.getState().data.floors[0].openings;
    // Issue #40 fix (Pkg 13.3): the sliver's interior depth (5 mm <
    // PAIR_TOLERANCE_M) cannot host a doorway, so neither face gets a
    // row — the cut walks through to the kitchen across the sliver.
    expect(ops).toHaveLength(2);
    expect(ops.filter((o) => o.roomId === 'sliver')).toHaveLength(0);
  });
});

describe('#47 #40c — tolerance tie is INCLUSIVE at the model layer', () => {
  const host = (): ReturnType<typeof roomSegments>[number] =>
    roomSegments(mkRoom('living', LIVING))[1];
  const candAt = (dx: number): ReturnType<typeof roomSegments>[number] =>
    roomSegments(
      mkRoom('x', [[5 + dx, 0], [8 + dx, 0], [8 + dx, 4], [5 + dx, 4]]),
    )[3];

  it('a wall exactly 10 mm off the host line still pairs', () => {
    expect(sharedWallOverlap(host(), candAt(0.01))).not.toBeNull();
  });

  it('10.0001 mm off rejects', () => {
    expect(sharedWallOverlap(host(), candAt(0.0100001))).toBeNull();
  });
});
