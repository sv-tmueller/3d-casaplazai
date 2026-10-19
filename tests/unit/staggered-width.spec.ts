/**
 * Issue #43 — WIDTH mutations on staggered (partially overlapping)
 * shared walls must respect hosting, exactly like MOVE mutations do.
 *
 * Audit spec (Pkg 13.3 order (a)): run against MAIN first. The #47
 * width-path FREEZE assigns the new width BEFORE findPartner and
 * re-tests pairMirrorT with the NEW width, so widening beyond the
 * partner's overlap SHOULD already copy nothing. These cases pin the
 * residual strands the audit called out: the widen path, and the
 * move-then-widen / widen-then-move interleavings on #41's staggered
 * geometry (partial overlap, projection-based mirrors).
 *
 * Geometry (borrowed from staggered-pairing.spec.ts / tolerance-hygiene):
 *   living (0,0)-(5,0)-(5,4)-(0,4), east wall seg 1 traversed UP;
 *   bed (5,1)-(8,1)-(8,3.5)-(5,3.5), west wall seg 3 traversed DOWN.
 * Shared overlap: y in [1, 3.5] (2.5 m of living's 4 m wall).
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Room, Vec2 } from '../../src/shared/schema';
import { EditorStore, emptyPlan } from '../../src/editor/store';

const DOOR = { kind: 'door' as const, width: 0.9, sillHeight: 0, headHeight: 2.05 };

function mkRoom(id: string, polygon: Vec2[]): Room {
  return { id, name: id, polygon, floorTexture: null };
}

const LIVING: Vec2[] = [[0, 0], [5, 0], [5, 4], [0, 4]];
const STAGGERED: Vec2[] = [[5, 1], [8, 1], [8, 3.5], [5, 3.5]];

function plan(): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = [mkRoom('living', LIVING), mkRoom('bed', STAGGERED)];
  return p;
}

/** Store with a paired door at living seg 1, t 0.5 (world y 2). */
function paired(): EditorStore {
  const store = new EditorStore(plan());
  store.dispatch({
    type: 'addOpening',
    roomId: 'living',
    segmentIndex: 1,
    tCenter: 0.5,
    ...DOOR,
  });
  return store;
}

describe('#43 staggered width strand — widen path', () => {
  it('widening beyond the partner overlap freezes the twin (no unhosted mirror)', () => {
    const store = paired();
    const [a, b0] = store.getState().data.floors[0].openings;
    expect(b0.width).toBeCloseTo(0.9);
    // t 0.5 -> world y 2; w 2.6 -> cut y [0.7, 3.3]... wait: bed hosts
    // y [1, 3.5]; cut [0.7, 3.3] extends BELOW 1 => unhosted.
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 2.6 },
      syncPair: true,
    });
    const [a2, b] = store.getState().data.floors[0].openings;
    expect(a2.width).toBeCloseTo(2.6);
    // Honest freeze: twin keeps its old width, never a wider-than-host cut.
    expect(b.width).toBeCloseTo(0.9);
  });

  it('widening WITHIN the partner overlap still syncs the twin', () => {
    const store = paired();
    const [a] = store.getState().data.floors[0].openings;
    // w 1.2 at world y 2 -> cut y [1.4, 2.6]: inside [1, 3.5] => hosted.
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 1.2 },
      syncPair: true,
    });
    const [, b] = store.getState().data.floors[0].openings;
    expect(b.width).toBeCloseTo(1.2);
  });

  it('narrowing keeps the pair synchronized (regression guard)', () => {
    const store = paired();
    const [a] = store.getState().data.floors[0].openings;
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 0.6 },
      syncPair: true,
    });
    const [, b] = store.getState().data.floors[0].openings;
    expect(b.width).toBeCloseTo(0.6);
  });
});

describe('#43 staggered width strand — move/widen interleavings', () => {
  it('move-then-widen: a hosted move re-syncs, then an unhostable widen freezes', () => {
    const store = paired();
    const [a] = store.getState().data.floors[0].openings;
    // Move deeper into the overlap: t 0.7 -> world y 2.8.
    store.dispatch({ type: 'moveOpening', openingId: a.id, tCenter: 0.7, syncPair: true });
    {
      const [, b] = store.getState().data.floors[0].openings;
      expect(b.tCenter).toBeCloseTo((3.5 - 2.8) / 2.5, 6); // projection
    }
    // Now widen: w 2.4 at y 2.8 -> cut y [1.6, 4.0]: extends ABOVE 3.5
    // => unhostable, twin must freeze.
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 2.4 },
      syncPair: true,
    });
    const [, b] = store.getState().data.floors[0].openings;
    expect(b.width).toBeCloseTo(0.9);
    expect(b.tCenter).toBeCloseTo(0.28, 6); // twin unmoved by the widen
  });

  it('widen-then-move: after an unhosted widen the pair is unlinked; the move does not cascade', () => {
    const store = paired();
    const [a, b0] = store.getState().data.floors[0].openings;
    const twinT0 = b0.tCenter;
    // Unhosted widen first (cut y [0.7, 3.3]).
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 2.6 },
      syncPair: true,
    });
    // Then move: w 2.6 at t 0.6 -> world y 2.4 -> cut y [1.1, 3.7]:
    // STILL unhosted (> 3.5) => no partner => no cascade.
    store.dispatch({ type: 'moveOpening', openingId: a.id, tCenter: 0.6, syncPair: true });
    const [a2, b] = store.getState().data.floors[0].openings;
    expect(a2.tCenter).toBeCloseTo(0.6);
    expect(b.tCenter).toBeCloseTo(twinT0);
    expect(b.width).toBeCloseTo(0.9);
  });

  it('widen-then-move-back: narrowing back into the overlap re-links and the move cascades', () => {
    const store = paired();
    const [a] = store.getState().data.floors[0].openings;
    // Desync with an unhosted widen...
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 2.6 },
      syncPair: true,
    });
    // ...then repair: narrow to 0.7 (cut y [1.65, 2.35] at world y 2 =>
    // hosted again) and MOVE in the same breath. findPartner must match
    // again and the twin must follow.
    store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 0.7 },
      syncPair: true,
    });
    store.dispatch({ type: 'moveOpening', openingId: a.id, tCenter: 0.7, syncPair: true });
    const [a2, b] = store.getState().data.floors[0].openings;
    expect(a2.tCenter).toBeCloseTo(0.7);
    expect(b.width).toBeCloseTo(0.7);
    expect(b.tCenter).toBeCloseTo(0.28, 6);
  });
});
