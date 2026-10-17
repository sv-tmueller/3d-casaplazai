/**
 * Unit tests for the EditorStore command layer (adapted from the old
 * applyCommand/StoreState spec to the class API — issue #4 final mile,
 * step 4). Covers: reducer purity, snapshot-stack undo (incl. cap),
 * TWO-ROW shared-door emission + pairing regressions (dispatch
 * routing), furniture command cycles, and gesture streaming.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Opening, Vec2 } from '../../src/shared/schema';
import {
  EditorStore,
  emptyPlan,
  type EditorState,
} from '../../src/editor/store';

function plan(): FloorplanData {
  return {
    ...emptyPlan(),
    rooms: [
      // Living: (0,0)->(5,0)->(5,4)->(0,4). Segments: 0 south, 1 EAST
      // (x=5, traversed UP), 2 north, 3 west.
      {
        id: 'living',
        name: 'Living',
        polygon: [[0, 0], [5, 0], [5, 4], [0, 4]],
        floorTexture: null,
      },
      // Kitchen: (5,0)->(8,0)->(8,4)->(5,4). Segments: 0 south, 1 east,
      // 2 north, 3 WEST (x=5, traversed DOWN — reversed vs living seg 1).
      {
        id: 'kitchen',
        name: 'Kitchen',
        polygon: [[5, 0], [8, 0], [8, 4], [5, 4]],
        floorTexture: null,
      },
    ],
  };
}

function newStore(): EditorStore {
  return new EditorStore(plan());
}

function openingsOf(st: EditorState): Opening[] {
  return st.data.openings;
}

const DOOR_BASE = {
  kind: 'door' as const,
  width: 0.85,
  sillHeight: 0,
  headHeight: 2.05,
};

describe('addOpening two-row emission (AC1)', () => {
  it('commits BOTH rows for a shared-wall door', () => {
    const store = newStore();
    const res = store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.55,
      ...DOOR_BASE,
    });
    expect(res.ok).toBe(true);
    const ops = openingsOf(store.getState());
    expect(ops).toHaveLength(2);

    const [a, b] = ops;
    expect(a.roomId).toBe('living');
    expect(b.roomId).toBe('kitchen');
    // Kitchen traverses the shared wall DOWN, so the mirror row lands on
    // segment 3 with the complementary t.
    expect(b.segmentIndex).toBe(3);
    expect(b.tCenter).toBeCloseTo(0.45);
    expect(b.width).toBe(DOOR_BASE.width);
    expect(b.sillHeight).toBe(DOOR_BASE.sillHeight);
    expect(b.headHeight).toBe(DOOR_BASE.headHeight);
    // Distinct ids, selection lands on the originating row.
    expect(a.id).not.toBe(b.id);
    expect(store.getState().selectedId).toBe(a.id);
  });

  it('outer (unshared) wall emits exactly ONE row', () => {
    const store = newStore();
    const res = store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 0, // outer south wall — nobody shares it
      tCenter: 0.5,
      ...DOOR_BASE,
    });
    expect(res.ok).toBe(true);
    expect(openingsOf(store.getState())).toHaveLength(1);
    expect(openingsOf(store.getState())[0].roomId).toBe('living');
  });

  it('undo removes both rows in one step', () => {
    const store = newStore();
    store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.55,
      ...DOOR_BASE,
    });
    expect(store.canUndo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(openingsOf(store.getState())).toHaveLength(0);
    expect(store.getState().selectedId).toBeNull();
  });
});

describe('pair sync on edit', () => {
  function withPair(): EditorStore {
    const store = newStore();
    const res = store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.55,
      ...DOOR_BASE,
    });
    expect(res.ok).toBe(true);
    return store;
  }

  it('moving one row moves the partner complementarily', () => {
    const store = withPair();
    const a = openingsOf(store.getState())[0];
    const res = store.dispatch({
      type: 'moveOpening',
      openingId: a.id,
      tCenter: 0.7,
      syncPair: true,
    });
    expect(res.ok).toBe(true);
    const [rowA, rowB] = openingsOf(store.getState());
    expect(rowA.tCenter).toBeCloseTo(0.7);
    expect(rowB.tCenter).toBeCloseTo(0.3);
  });

  it('editing width propagates to the partner', () => {
    const store = withPair();
    const a = openingsOf(store.getState())[0];
    const res = store.dispatch({
      type: 'updateOpening',
      openingId: a.id,
      fields: { width: 1.0 },
      syncPair: true,
    });
    expect(res.ok).toBe(true);
    expect(openingsOf(store.getState()).every((o) => o.width === 1.0)).toBe(
      true,
    );
  });

  it('updating an orphan opening succeeds without a partner', () => {
    const store = newStore();
    store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 0, // outer south wall — nobody shares it
      tCenter: 0.5,
      ...DOOR_BASE,
    });
    const solo = openingsOf(store.getState())[0];
    const res = store.dispatch({
      type: 'moveOpening',
      openingId: solo.id,
      tCenter: 0.4,
      syncPair: true,
    });
    expect(res.ok).toBe(true);
    expect(openingsOf(store.getState())).toHaveLength(1);
    expect(openingsOf(store.getState())[0].tCenter).toBeCloseTo(0.4);
  });

  it('deleting one row deletes both', () => {
    const store = withPair();
    const a = openingsOf(store.getState())[0];
    const res = store.dispatch({
      type: 'deleteOpening',
      openingId: a.id,
      syncPair: true,
    });
    expect(res.ok).toBe(true);
    expect(openingsOf(store.getState())).toHaveLength(0);
  });

  it('routing regression: moveOpening reaches the reducer via dispatch()', () => {
    const store = withPair();
    const a = openingsOf(store.getState())[0];
    // Unknown id must FAIL ROUTING (proves the command reached the
    // opening handler rather than being swallowed elsewhere).
    const bad = store.dispatch({
      type: 'moveOpening',
      openingId: 'nope',
      tCenter: 0.1,
    });
    expect(bad.ok).toBe(false);
    const good = store.dispatch({
      type: 'moveOpening',
      openingId: a.id,
      tCenter: 0.5,
    });
    expect(good.ok).toBe(true);
    expect(openingsOf(store.getState())[0].tCenter).toBeCloseTo(0.5);
  });
});

describe('furniture commands', () => {
  it('add/move/rotate/delete cycle with undo granularity', () => {
    const store = newStore();
    const add = store.dispatch({
      type: 'addFurniture',
      itemType: 'bed',
      roomId: 'living',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [1.6, 2.0],
    });
    expect(add.ok).toBe(true);
    const st0 = store.getState();
    expect(st0.data.furniture).toHaveLength(1);
    const fid = st0.data.furniture[0].id;
    expect(st0.data.furniture[0].roomId).toBe('living');

    expect(
      store.dispatch({
        type: 'moveFurniture',
        furnitureId: fid,
        position: [3, 2],
      }).ok,
    ).toBe(true);
    expect(store.getState().data.furniture[0].position).toEqual([3, 2]);

    expect(
      store.dispatch({
        type: 'rotateFurniture',
        furnitureId: fid,
        rotationDeg: 90,
      }).ok,
    ).toBe(true);
    expect(store.getState().data.furniture[0].rotationDeg).toBe(90);

    // Each atomic command is one undo step.
    expect(store.undo()).toBe(true);
    expect(store.getState().data.furniture[0].rotationDeg).toBe(0);
    expect(store.undo()).toBe(true);
    expect(store.getState().data.furniture[0].position).toEqual([2, 2]);
    expect(store.undo()).toBe(true);
    expect(store.getState().data.furniture).toHaveLength(0);
  });

  it('resize + delete + unknown-id routing', () => {
    const store = newStore();
    store.dispatch({
      type: 'addFurniture',
      itemType: 'sofa',
      roomId: 'kitchen',
      position: [6.5, 2],
      rotationDeg: 0,
      footprint: [2.0, 0.9],
    });
    const fid = store.getState().data.furniture[0].id;

    expect(
      store.dispatch({
        type: 'resizeFurniture',
        furnitureId: 'nope',
        footprint: [1, 1],
      }).ok,
    ).toBe(false);
    expect(
      store.dispatch({
        type: 'resizeFurniture',
        furnitureId: fid,
        footprint: [1.8, 0.9],
      }).ok,
    ).toBe(true);
    expect(store.getState().data.furniture[0].footprint).toEqual([1.8, 0.9]);

    expect(
      store.dispatch({ type: 'deleteFurniture', furnitureId: fid }).ok,
    ).toBe(true);
    expect(store.getState().data.furniture).toHaveLength(0);
    expect(store.getState().selectedId).toBeNull();

    const gone = store.dispatch({
      type: 'deleteFurniture',
      furnitureId: fid,
    });
    expect(gone.ok).toBe(false);
  });

  it('adding furniture into an unknown room is rejected', () => {
    const store = newStore();
    const res = store.dispatch({
      type: 'addFurniture',
      itemType: 'chair',
      roomId: 'attic',
      position: [1, 1],
      rotationDeg: 0,
      footprint: [0.45, 0.45],
    });
    expect(res.ok).toBe(false);
    expect(store.getState().data.furniture).toHaveLength(0);
  });

  it('undo stack respects the 100-cap', () => {
    const store = newStore();
    for (let i = 0; i < 130; i += 1) {
      store.dispatch({
        type: 'addFurniture',
        itemType: 'chair',
        roomId: 'living',
        position: [0.5 + (i % 4) * 0.6, 0.5 + Math.floor(i / 4) * 0.6],
        rotationDeg: 0,
        footprint: [0.45, 0.45],
      });
    }
    expect(store.getState().data.furniture).toHaveLength(130);
    let undos = 0;
    while (store.undo()) undos += 1;
    expect(undos).toBeLessThanOrEqual(100);
    expect(undos).toBeGreaterThan(90);
  });

  it('streamed moveFurniture inside a gesture collapses to ONE undo step', () => {
    const store = newStore();
    store.dispatch({
      type: 'addFurniture',
      itemType: 'bed',
      roomId: 'living',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [1.6, 2.0],
    });
    const fid = store.getState().data.furniture[0].id;
    store.markSaved();

    store.beginGesture();
    for (const p of [[2.2, 2], [2.4, 2], [2.6, 2]] as Vec2[]) {
      expect(
        store.dispatch({ type: 'moveFurniture', furnitureId: fid, position: p })
          .ok,
      ).toBe(true);
    }
    store.endGesture();
    expect(store.getState().data.furniture[0].position).toEqual([2.6, 2]);

    // Whole drag = one undo step back to the committed start.
    expect(store.undo()).toBe(true);
    expect(store.getState().data.furniture[0].position).toEqual([2, 2]);
    // Underneath the collapsed drag step sits the original addFurniture
    // snapshot — one MORE undo erases the piece entirely.
    expect(store.canUndo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.getState().data.furniture).toHaveLength(0);
    expect(store.dirty).toBe(true);
  });

  it('redoundo roundtrip preserves furniture rows', () => {
    const store = newStore();
    store.dispatch({
      type: 'addFurniture',
      itemType: 'table',
      roomId: 'living',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [1.2, 0.8],
    });
    expect(store.undo()).toBe(true);
    expect(store.getState().data.furniture).toHaveLength(0);
    expect(store.redo()).toBe(true);
    expect(store.getState().data.furniture).toHaveLength(1);
    expect(store.getState().data.furniture[0].type).toBe('table');
  });
});

describe('reducer purity / store plumbing', () => {
  it('does not mutate the plan instance handed to the constructor', () => {
    const initial = plan();
    const frozenRooms = JSON.stringify(initial.rooms);
    const store = new EditorStore(initial);
    store.dispatch({
      type: 'addFurniture',
      itemType: 'sofa',
      roomId: 'living',
      position: [1, 1],
      rotationDeg: 0,
      footprint: [2, 0.9],
    });
    expect(JSON.stringify(initial.rooms)).toBe(frozenRooms);
    expect(store.getState().data.furniture).toHaveLength(1);
  });

  it('failed commands neither mutate nor grow the undo stack', () => {
    const store = newStore();
    store.markSaved();
    const before = JSON.stringify(store.getState().data);
    const res = store.dispatch({
      type: 'addOpening',
      roomId: 'nowhere',
      segmentIndex: 0,
      tCenter: 0.5,
      ...DOOR_BASE,
    });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(store.getState().data)).toBe(before);
    expect(store.canUndo()).toBe(false);
    expect(store.dirty).toBe(false);
  });

  it('replaceAll clears history and dirty flag', () => {
    const store = newStore();
    store.dispatch({
      type: 'addFurniture',
      itemType: 'chair',
      roomId: 'living',
      position: [1, 1],
      rotationDeg: 0,
      footprint: [0.45, 0.45],
    });
    expect(store.canUndo()).toBe(true);
    store.replaceAll(plan());
    expect(store.canUndo()).toBe(false);
    expect(store.dirty).toBe(false);
    expect(store.getState().data.furniture).toHaveLength(0);
  });

  it('subscribe sees every notified state change', () => {
    const store = newStore();
    const seen: EditorState[] = [];
    const unsub = store.subscribe((s) => seen.push(s));
    store.dispatch({
      type: 'addFurniture',
      itemType: 'bed',
      roomId: 'living',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [1.6, 2.0],
    });
    store.undo();
    unsub();
    store.dispatch({
      type: 'addFurniture',
      itemType: 'bed',
      roomId: 'living',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [1.6, 2.0],
    });
    expect(seen).toHaveLength(2);
  });

  it('selection survives undo of unrelated commands', () => {
    const store = newStore();
    store.dispatch({ type: 'setSelection', roomId: 'kitchen' });
    store.dispatch({
      type: 'addFurniture',
      itemType: 'bed',
      roomId: 'living',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [1.6, 2.0],
    });
    store.undo();
    expect(store.getState().selectedId).toBe('kitchen');
  });
});
function planWithFurniture(): FloorplanData {
  const p = plan();
  p.furniture = [{
    id: 'fx1', type: 'chair', roomId: 'living',
    position: [2, 2], rotationDeg: 0, footprint: [0.45, 0.45],
  }];
  return p;
}

describe('escape-abandoned furniture drag (regression: stuck gesture base)', () => {
  it('endGesture after abandoned drag restores normal atomic dispatch', () => {
    const store = new EditorStore(planWithFurniture());
    const fid = store.getState().data.furniture[0].id;
    store.markSaved();

    // Simulate the glue's abandon path: beginGesture, mutate, then
    // endGesture WITHOUT committing further (what Escape now triggers).
    store.beginGesture();
    store.dispatch({ type: 'moveFurniture', furnitureId: fid, position: [2.5, 2] as Vec2 });
    store.endGesture();

    // A subsequent ATOMIC command must not throw.
    expect(() =>
      store.dispatch({ type: 'addOpening', opening: {
        id: 'ox-regress', kind: 'door', roomId: 'living',
        segmentIndex: 1, tCenter: 0.5, width: 0.9, sillHeight: 0, headHeight: 2.05,
      } } as never),
    ).not.toThrow();
  });
});
