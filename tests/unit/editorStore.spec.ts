/**
 * Unit tests for the EditorStore command layer (adapted from the old
 * applyCommand/StoreState spec to the class API — issue #4 final mile,
 * step 4). Covers: reducer purity, snapshot-stack undo (incl. cap),
 * TWO-ROW shared-door emission + pairing regressions (dispatch
 * routing), furniture command cycles, and gesture streaming.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Opening, Vec2 } from '../../src/shared/schema';
import {
  EditorStore,
  emptyPlan,
  type EditorState,
} from '../../src/editor/store';

function plan(): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = [
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
  ];
  return p;
}

function newStore(): EditorStore {
  return new EditorStore(plan());
}

function openingsOf(st: EditorState): Opening[] {
  return st.data.floors[0].openings;
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

describe('tolerance based shared-wall pairing (#36)', () => {
  /** Two-room plan with the kitchen's shared wall shifted by dx meters. */
  function offsetPlan(dx: number): FloorplanData {
    const p = plan();
    p.floors[0].rooms[1].polygon = [
      [5 + dx, 0],
      [8 + dx, 0],
      [8 + dx, 4],
      [5 + dx, 4],
    ];
    return p;
  }

  function addDoor(store: EditorStore, segmentIndex: number, tCenter: number) {
    return store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex,
      tCenter,
      ...DOOR_BASE,
    });
  }

  it('5 mm-offset counterpart still emits the mirror row', () => {
    const store = new EditorStore(offsetPlan(0.005));
    expect(addDoor(store, 1, 0.55).ok).toBe(true);
    const ops = openingsOf(store.getState());
    expect(ops).toHaveLength(2);
    expect(ops[0].roomId).toBe('living');
    expect(ops[1].roomId).toBe('kitchen');
    expect(ops[1].segmentIndex).toBe(3);
    expect(ops[1].tCenter).toBeCloseTo(0.45);
  });

  it('findPartner still finds the partner across a 5 mm gap', () => {
    const store = new EditorStore(offsetPlan(0.005));
    expect(addDoor(store, 1, 0.55).ok).toBe(true);
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

  it('2 cm offset does NOT pair (guards the tolerance boundary)', () => {
    const store = new EditorStore(offsetPlan(0.02));
    expect(addDoor(store, 1, 0.55).ok).toBe(true);
    const ops = openingsOf(store.getState());
    expect(ops).toHaveLength(1);
    // Editing the lone row must not conjure a partner.
    expect(
      store.dispatch({
        type: 'moveOpening',
        openingId: ops[0].id,
        tCenter: 0.7,
        syncPair: true,
      }).ok,
    ).toBe(true);
    expect(openingsOf(store.getState())).toHaveLength(1);
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
    expect(st0.data.floors[0].furniture).toHaveLength(1);
    const fid = st0.data.floors[0].furniture[0].id;
    expect(st0.data.floors[0].furniture[0].roomId).toBe('living');

    expect(
      store.dispatch({
        type: 'moveFurniture',
        furnitureId: fid,
        position: [3, 2],
      }).ok,
    ).toBe(true);
    expect(store.getState().data.floors[0].furniture[0].position).toEqual([3, 2]);

    expect(
      store.dispatch({
        type: 'rotateFurniture',
        furnitureId: fid,
        rotationDeg: 90,
      }).ok,
    ).toBe(true);
    expect(store.getState().data.floors[0].furniture[0].rotationDeg).toBe(90);

    // Each atomic command is one undo step.
    expect(store.undo()).toBe(true);
    expect(store.getState().data.floors[0].furniture[0].rotationDeg).toBe(0);
    expect(store.undo()).toBe(true);
    expect(store.getState().data.floors[0].furniture[0].position).toEqual([2, 2]);
    expect(store.undo()).toBe(true);
    expect(store.getState().data.floors[0].furniture).toHaveLength(0);
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
    const fid = store.getState().data.floors[0].furniture[0].id;

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
    expect(store.getState().data.floors[0].furniture[0].footprint).toEqual([1.8, 0.9]);

    expect(
      store.dispatch({ type: 'deleteFurniture', furnitureId: fid }).ok,
    ).toBe(true);
    expect(store.getState().data.floors[0].furniture).toHaveLength(0);
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
    expect(store.getState().data.floors[0].furniture).toHaveLength(0);
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
    expect(store.getState().data.floors[0].furniture).toHaveLength(130);
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
    const fid = store.getState().data.floors[0].furniture[0].id;
    store.markSaved();

    store.beginGesture();
    for (const p of [[2.2, 2], [2.4, 2], [2.6, 2]] as Vec2[]) {
      expect(
        store.dispatch({ type: 'moveFurniture', furnitureId: fid, position: p })
          .ok,
      ).toBe(true);
    }
    store.endGesture();
    expect(store.getState().data.floors[0].furniture[0].position).toEqual([2.6, 2]);

    // Whole drag = one undo step back to the committed start.
    expect(store.undo()).toBe(true);
    expect(store.getState().data.floors[0].furniture[0].position).toEqual([2, 2]);
    // Underneath the collapsed drag step sits the original addFurniture
    // snapshot — one MORE undo erases the piece entirely.
    expect(store.canUndo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.getState().data.floors[0].furniture).toHaveLength(0);
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
    expect(store.getState().data.floors[0].furniture).toHaveLength(0);
    expect(store.redo()).toBe(true);
    expect(store.getState().data.floors[0].furniture).toHaveLength(1);
    expect(store.getState().data.floors[0].furniture[0].type).toBe('table');
  });
});

describe('reducer purity / store plumbing', () => {
  it('does not mutate the plan instance handed to the constructor', () => {
    const initial = plan();
    const frozenRooms = JSON.stringify(initial.floors[0].rooms);
    const store = new EditorStore(initial);
    store.dispatch({
      type: 'addFurniture',
      itemType: 'sofa',
      roomId: 'living',
      position: [1, 1],
      rotationDeg: 0,
      footprint: [2, 0.9],
    });
    expect(JSON.stringify(initial.floors[0].rooms)).toBe(frozenRooms);
    expect(store.getState().data.floors[0].furniture).toHaveLength(1);
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
    expect(store.getState().data.floors[0].furniture).toHaveLength(0);
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
  p.floors[0].furniture = [{
    id: 'fx1', type: 'chair', roomId: 'living',
    position: [2, 2], rotationDeg: 0, footprint: [0.45, 0.45],
  }];
  return p;
}

describe('escape-abandoned furniture drag (regression: stuck gesture base)', () => {
  it('endGesture after abandoned drag restores normal atomic dispatch', () => {
    const store = new EditorStore(planWithFurniture());
    const fid = store.getState().data.floors[0].furniture[0].id;
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

/**
 * Regression guard (#23 disposition): loading the demo fixture TWICE in
 * a row must be idempotent — no throw, and getState().data deep-equals
 * the fixture after each replaceAll. Pins the double-loadPlan path.
 */
describe('double replaceAll is idempotent (regression: double-loadPlan)', () => {
  const fixture = (): FloorplanData =>
    JSON.parse(
      readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
    ) as FloorplanData;

  it('replaceAll(fixture) twice: no throw, data deep-equals both times', () => {
    const store = new EditorStore(emptyPlan());
    const demo = fixture();
    expect(() => store.replaceAll(demo)).not.toThrow();
    expect(store.getState().data).toStrictEqual(demo);
    // Second consecutive load — the historical double-loadPlan crash.
    expect(() => store.replaceAll(fixture())).not.toThrow();
    expect(store.getState().data).toStrictEqual(demo);
  });
});

/* --------------- issue #94: floor-name collision on delete-then-add --------- */

describe('addFloor default-name derivation (issue #94)', () => {
  it('delete-then-add reuses NO vacated suffix (names stay unique)', () => {
    const store = newStore();
    store.dispatch({ type: 'addFloor' }); // Floor 2
    store.dispatch({ type: 'addFloor' }); // Floor 3
    // Delete the middle floor, leaving [Ground, Floor 3]: naive
    // length+1 (= 3) would mint a DUPLICATE "Floor 3" here.
    store.dispatch({ type: 'setActiveFloor', index: 1 });
    store.dispatch({ type: 'deleteFloor' });
    store.dispatch({ type: 'addFloor' });
    const names = store.getState().data.floors.map((f) => f.name);
    expect(names).toEqual(['Ground', 'Floor 3', 'Floor 4']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('renamed floors never collide with derived defaults', () => {
    const store = newStore();
    store.dispatch({ type: 'addFloor', name: 'Loft' }); // renamed: no match
    store.dispatch({ type: 'addFloor' });
    const names = store.getState().data.floors.map((f) => f.name);
    expect(names).toEqual(['Ground', 'Loft', 'Floor 3']);
    expect(new Set(names).size).toBe(names.length);
  });
});


describe('resizeRoom dispatch (#53)', () => {
  const livingPoly = (store: EditorStore): number[][] =>
    store.getState().data.floors[0].rooms.find((r) => r.id === 'living')!.polygon;

  it('atomic resize changes the vertex then undo restores it', () => {
    const store = newStore();
    const before = JSON.parse(JSON.stringify(livingPoly(store)));
    // living vertex 1 is (5,0) — the SE corner of the rectangle.
    const res = store.dispatch({
      type: 'resizeRoom',
      roomId: 'living',
      vertexIndex: 1,
      newPos: [6.5, 0],
    });
    expect(res.ok).toBe(true);
    expect(livingPoly(store)[1]).toEqual([6.5, 0]);
    // Bounding-box width grew from 5 to 6.5 m.
    expect(Math.max(...livingPoly(store).map((p) => p[0]))).toBeCloseTo(6.5);
    expect(store.undo()).toBe(true);
    expect(livingPoly(store)).toEqual(before);
  });

  it('gesture-streamed resize is ONE undo step (drag frames collapse)', () => {
    const store = newStore();
    const before = JSON.parse(JSON.stringify(livingPoly(store)));
    store.beginGesture();
    store.dispatch({ type: 'resizeRoom', roomId: 'living', vertexIndex: 2, newPos: [5, 4.5] });
    store.dispatch({ type: 'resizeRoom', roomId: 'living', vertexIndex: 2, newPos: [5, 5] });
    store.endGesture();
    expect(livingPoly(store)[2]).toEqual([5, 5]);
    expect(store.undo()).toBe(true);
    expect(livingPoly(store)).toEqual(before);
    // One gesture = one undo entry, so no further undo is available.
    expect(store.canUndo()).toBe(false);
  });

  it('rejects an out-of-range vertex index without mutating', () => {
    const store = newStore();
    const before = JSON.parse(JSON.stringify(livingPoly(store)));
    const res = store.dispatch({
      type: 'resizeRoom',
      roomId: 'living',
      vertexIndex: 99,
      newPos: [0, 0],
    });
    expect(res.ok).toBe(false);
    expect(livingPoly(store)).toEqual(before);
  });

  // Issue #107: shared plan-extent guard. Both commit paths (typed
  // inspector fields and drag frames) funnel into THIS reducer, so the
  // bound lives here and both paths are rejected identically by
  // construction. The typed path is simulated exactly as
  // inspectorPanel.ts does it: polarEndpoint(anchor, len, bearing).
  it('rejects a typed 99999 m wall length (inspector path simulation)', async () => {
    const { polarEndpoint } = await import('../../src/editor/model/angles');
    const store = newStore();
    const before = JSON.parse(JSON.stringify(livingPoly(store)));
    // Wall row for living seg 1 anchors at vertex 1 (5,0); typing 99999
    // at bearing 90° (due east) lands the far vertex at ~(100004, 0).
    const newPos = polarEndpoint([5, 0], 99999, 90);
    const res = store.dispatch({
      type: 'resizeRoom',
      roomId: 'living',
      vertexIndex: 2,
      newPos,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('vertex beyond plan extent limit');
    expect(livingPoly(store)).toEqual(before);
  });

  it('rejects a programmatic extreme drag identically (no typed parse involved)', () => {
    const store = newStore();
    const before = JSON.parse(JSON.stringify(livingPoly(store)));
    const res = store.dispatch({
      type: 'resizeRoom',
      roomId: 'living',
      vertexIndex: 2,
      newPos: [1, -1e6],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('vertex beyond plan extent limit');
    expect(livingPoly(store)).toEqual(before);
  });

  it('a vertex AT the extent limit is still a legit reshape (boundary inclusive)', () => {
    const store = newStore();
    const res = store.dispatch({
      type: 'resizeRoom',
      roomId: 'living',
      vertexIndex: 1,
      newPos: [1000, 0],
    });
    expect(res.ok).toBe(true);
    expect(livingPoly(store)[1]).toEqual([1000, 0]);
  });

  it('just past the limit rejects (1000 + 1mm)', () => {
    const store = newStore();
    const before = JSON.parse(JSON.stringify(livingPoly(store)));
    const res = store.dispatch({
      type: 'resizeRoom',
      roomId: 'living',
      vertexIndex: 1,
      newPos: [1000.001, 0],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('vertex beyond plan extent limit');
    expect(livingPoly(store)).toEqual(before);
  });
});

/* ------------------------------------------------------------------ *
 * Issue #61: moveOpening streams inside a gesture (whitelist)        *
 * ------------------------------------------------------------------ */

describe('gesture-streamed moveOpening (issue #61)', () => {
  function doorStore(): { store: EditorStore; ids: [string, string] } {
    const store = newStore();
    store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.55,
      ...DOOR_BASE,
    });
    const ids = store.getState().data.floors[0].openings.map((o) => o.id) as [string, string];
    return { store, ids };
  }

  it('streams moveOpening without throwing "non-streamable"', () => {
    const { store, ids } = doorStore();
    store.beginGesture();
    expect(() =>
      store.dispatch({
        type: 'moveOpening',
        openingId: ids[0],
        tCenter: 0.6,
        syncPair: true,
      }),
    ).not.toThrow();
    store.endGesture();
  });

  it('N streamed frames collapse to ONE undo step that restores both rows', () => {
    const { store, ids } = doorStore();
    const before = store.getState().data.floors[0].openings.map((o) => o.tCenter);
    store.beginGesture();
    for (const t of [0.4, 0.45, 0.5, 0.55, 0.6]) {
      store.dispatch({ type: 'moveOpening', openingId: ids[0], tCenter: t, syncPair: true });
    }
    store.endGesture();
    // Twin stays in lockstep: both rows moved in one gesture.
    const after = store.getState().data.floors[0].openings;
    expect(after).toHaveLength(2);
    expect(after[0].tCenter).toBeCloseTo(0.6, 6);
    // ONE undo restores the pre-gesture positions of BOTH rows.
    expect(store.undo()).toBe(true);
    expect(store.getState().data.floors[0].openings.map((o) => o.tCenter)).toEqual(before);
    // The NEXT undo is the addOpening step (not another drag frame), which
    // proves the N streamed frames formed exactly one history entry.
    expect(store.undo()).toBe(true);
    expect(store.getState().data.floors[0].openings).toHaveLength(0);
    expect(store.canUndo()).toBe(false);
  });

  it('an engaged-but-unstreamed gesture leaves no undo step', () => {
    const store = newStore();
    store.beginGesture();
    store.endGesture(); // endGesture is a no-op when nothing changed
    expect(store.canUndo()).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Issue #119 (Pkg 14.4): floor-material command                       *
 * ------------------------------------------------------------------ */

describe('setRoomFloorTexture (issue #119)', () => {
  it('assigns the material to the addressed room only', () => {
    const store = newStore();
    const res = store.dispatch({ type: 'setRoomFloorTexture', roomId: 'living', texture: 'wood' });
    expect(res.ok).toBe(true);
    const rooms = store.getState().data.floors[0].rooms;
    expect(rooms.find((r) => r.id === 'living')!.floorTexture).toBe('wood');
    expect(rooms.find((r) => r.id === 'kitchen')!.floorTexture).toBeNull();
  });

  it('round-trips back to null and treats EVERY pick as one undo step', () => {
    const store = newStore();
    store.dispatch({ type: 'setRoomFloorTexture', roomId: 'living', texture: 'tile' });
    store.dispatch({ type: 'setRoomFloorTexture', roomId: 'living', texture: 'carpet' });
    store.dispatch({ type: 'setRoomFloorTexture', roomId: 'living', texture: null });
    const living = (): string | null => store.getState().data.floors[0].rooms[0]!.floorTexture;
    expect(living()).toBeNull();
    expect(store.undo()).toBe(true);
    expect(living()).toBe('carpet');
    expect(store.undo()).toBe(true);
    expect(living()).toBe('tile');
    expect(store.redo()).toBe(true);
    expect(living()).toBe('carpet');
    expect(store.canRedo()).toBe(true);
  });

  it('refuses an unknown room without mutating or snapshotting', () => {
    const store = newStore();
    const res = store.dispatch({ type: 'setRoomFloorTexture', roomId: 'ghost', texture: 'wood' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('unknown room');
    expect(store.canUndo()).toBe(false);
  });

  it('refuses an out-of-enum texture (the store never emits unvalidatable data)', () => {
    const store = newStore();
    const res = store.dispatch({
      type: 'setRoomFloorTexture',
      roomId: 'living',
      texture: 'marble' as never,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('unknown floor texture');
    expect(store.getState().data.floors[0].rooms[0]!.floorTexture).toBeNull();
    expect(store.canUndo()).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Issue #145: inspector room rename + plan wall settings              *
 * ------------------------------------------------------------------ */

describe('renameRoom (issue #145)', () => {
  it('renames the addressed room only, trimming whitespace', () => {
    const store = newStore();
    const res = store.dispatch({
      type: 'renameRoom',
      roomId: 'living',
      name: '  Lounge  ',
    });
    expect(res.ok).toBe(true);
    const rooms = store.getState().data.floors[0].rooms;
    expect(rooms.find((r) => r.id === 'living')!.name).toBe('Lounge');
    expect(rooms.find((r) => r.id === 'kitchen')!.name).toBe('Kitchen');
  });

  it('rejects an empty (or whitespace-only) name without mutating or snapshotting', () => {
    const store = newStore();
    const res = store.dispatch({ type: 'renameRoom', roomId: 'living', name: '   ' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('room name cannot be empty');
    expect(store.getState().data.floors[0].rooms[0]!.name).toBe('Living');
    expect(store.canUndo()).toBe(false);
  });

  it('refuses an unknown room without mutating or snapshotting', () => {
    const store = newStore();
    const res = store.dispatch({ type: 'renameRoom', roomId: 'ghost', name: 'Nope' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('unknown room');
    expect(store.canUndo()).toBe(false);
  });

  it('is exactly one undo step', () => {
    const store = newStore();
    store.dispatch({ type: 'renameRoom', roomId: 'living', name: 'Lounge' });
    expect(store.undo()).toBe(true);
    expect(store.getState().data.floors[0].rooms[0]!.name).toBe('Living');
    expect(store.canUndo()).toBe(false);
  });
});

describe('setWallHeight / setWallThickness (issue #145)', () => {
  it('sets plan-global values, each edit exactly one undo step', () => {
    const store = newStore();
    expect(store.dispatch({ type: 'setWallHeight', value: 3.2 }).ok).toBe(true);
    expect(store.dispatch({ type: 'setWallThickness', value: 0.3 }).ok).toBe(true);
    expect(store.getState().data.wallHeight).toBeCloseTo(3.2, 6);
    expect(store.getState().data.wallThickness).toBeCloseTo(0.3, 6);
    // Undo unwinds ONE edit at a time (thickness first, then height).
    expect(store.undo()).toBe(true);
    expect(store.getState().data.wallThickness).toBeCloseTo(0.24, 6);
    expect(store.getState().data.wallHeight).toBeCloseTo(3.2, 6);
    expect(store.undo()).toBe(true);
    expect(store.getState().data.wallHeight).toBeCloseTo(2.7, 6);
    expect(store.canUndo()).toBe(false);
  });

  it('accepts the inclusive UI bounds', () => {
    const store = newStore();
    for (const value of [2.0, 6.0]) {
      expect(store.dispatch({ type: 'setWallHeight', value }).ok).toBe(true);
    }
    for (const value of [0.05, 0.6]) {
      expect(store.dispatch({ type: 'setWallThickness', value }).ok).toBe(true);
    }
    expect(store.getState().data.wallHeight).toBe(6.0);
    expect(store.getState().data.wallThickness).toBe(0.6);
  });

  it('rejects out-of-range / non-finite values without mutating or snapshotting', () => {
    const store = newStore();
    for (const value of [1.9, 6.1, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = store.dispatch({ type: 'setWallHeight', value });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain('wall height');
    }
    for (const value of [0.04, 0.61, 0, -0.1, Number.NaN]) {
      const res = store.dispatch({ type: 'setWallThickness', value });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain('wall thickness');
    }
    expect(store.getState().data.wallHeight).toBeCloseTo(2.7, 6);
    expect(store.getState().data.wallThickness).toBeCloseTo(0.24, 6);
    expect(store.canUndo()).toBe(false);
  });
});
