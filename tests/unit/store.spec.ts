import type { Pt } from '../../src/editor/geom';
/**
 * Unit tests for EditorStore: reducer commands, undo/redo, dirty flag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorStore, emptyPlan } from '../../src/editor/store';

const RECT_A: Pt[] = [[0, 0], [4, 0], [4, 3], [0, 3]];

function emptyState() {
  return emptyPlan();
}

describe('EditorStore basics', () => {
  let store: EditorStore;
  beforeEach(() => {
    store = new EditorStore(emptyState());
  });

  it('starts with no rooms, no selection, not dirty', () => {
    expect(store.getState().data.rooms).toHaveLength(0);
    expect(store.getState().selectedId).toBeNull();
    expect(store.dirty).toBe(false);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it('drawRoom adds a CCW room with a unique id', () => {
    const res = store.dispatch({ type: 'drawRoom', polygon: RECT_A, name: 'Kitchen' });
    expect(res.ok).toBe(true);
    const rooms = store.getState().data.rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0].id).toBeTruthy();
    expect(rooms[0].name).toBe('Kitchen');
    expect(rooms[0].floorTexture).toBeNull();
    // Stored polygon must be CCW regardless of input winding.
    expect(rooms[0].polygon[0]).toEqual(RECT_A[0]);
  });

  it('rejects a polygon with fewer than 3 distinct points', () => {
    const res = store.dispatch({ type: 'drawRoom', polygon: [[0, 0], [1, 0]] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/at least 3/i);
    expect(store.getState().data.rooms).toHaveLength(0);
  });

  it('rejects a degenerate zero-area polygon', () => {
    const res = store.dispatch({
      type: 'drawRoom',
      polygon: [[0, 0], [1, 0], [2, 0]],
    });
    expect(res.ok).toBe(false);
  });

  it('generates distinct ids across many rooms', () => {
    for (let i = 0; i < 5; i++) {
      store.dispatch({
        type: 'drawRoom',
        polygon: [[i * 10, 0], [(i + 1) * 10, 0], [(i + 1) * 10, 3], [i * 10, 3]] as Pt[],
      });
    }
    const ids = store.getState().data.rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
  });
});

describe('selection', () => {
  let store: EditorStore;
  beforeEach(() => {
    store = new EditorStore(emptyState());
    store.dispatch({ type: 'drawRoom', polygon: RECT_A });
  });

  it('setSelection stores the room id', () => {
    const id = store.getState().data.rooms[0].id;
    store.dispatch({ type: 'setSelection', roomId: id });
    expect(store.getState().selectedId).toBe(id);
  });

  it('null clears selection', () => {
    const id = store.getState().data.rooms[0].id;
    store.dispatch({ type: 'setSelection', roomId: id });
    store.dispatch({ type: 'setSelection', roomId: null });
    expect(store.getState().selectedId).toBeNull();
  });
});

describe('moveRoom', () => {
  let store: EditorStore;
  let id: string;
  beforeEach(() => {
    store = new EditorStore(emptyState());
    store.dispatch({ type: 'drawRoom', polygon: RECT_A });
    id = store.getState().data.rooms[0].id;
  });

  it('moves all vertices by delta', () => {
    const res = store.dispatch({ type: 'moveRoom', roomId: id, delta: [1, -0.5] });
    expect(res.ok).toBe(true);
    const poly = store.getState().data.rooms[0].polygon;
    expect(poly[0]).toEqual([1, -0.5]);
    expect(poly[2]).toEqual([5, 2.5]);
  });

  it('errors on unknown room id', () => {
    const res = store.dispatch({ type: 'moveRoom', roomId: 'ghost', delta: [1, 0] });
    expect(res.ok).toBe(false);
  });
});

describe('resizeRoom', () => {
  let store: EditorStore;
  let id: string;
  beforeEach(() => {
    store = new EditorStore(emptyState());
    store.dispatch({ type: 'drawRoom', polygon: RECT_A });
    id = store.getState().data.rooms[0].id;
  });

  it('moves a single vertex', () => {
    const res = store.dispatch({ type: 'resizeRoom', roomId: id, vertexIndex: 2, newPos: [5, 4] });
    expect(res.ok).toBe(true);
    const poly = store.getState().data.rooms[0].polygon;
    expect(poly[2]).toEqual([5, 4]);
    expect(poly[1]).toEqual([4, 0]);
  });

  it('rejects an out-of-range vertexIndex', () => {
    const res = store.dispatch({ type: 'resizeRoom', roomId: id, vertexIndex: 9, newPos: [0, 0] });
    expect(res.ok).toBe(false);
  });
});

describe('deleteRoom', () => {
  let store: EditorStore;
  let id: string;
  beforeEach(() => {
    store = new EditorStore(emptyState());
    store.dispatch({ type: 'drawRoom', polygon: RECT_A });
    id = store.getState().data.rooms[0].id;
  });

  it('removes the room and clears dangling refs', () => {
    // Seed an opening + furniture referencing the room directly in data.
    const st = store.getState();
    st.data.openings.push({
      id: 'op1', roomId: id, kind: 'door', segmentIndex: 0,
      tCenter: 0.5, width: 0.9, sillHeight: 0, headHeight: 2.1,
    });
    st.data.furniture.push({
      id: 'fu1', type: 'bed', roomId: id, position: [1, 1],
      rotationDeg: 0, footprint: [1, 2],
    });
    const res = store.dispatch({ type: 'deleteRoom', roomId: id });
    expect(res.ok).toBe(true);
    const data = store.getState().data;
    expect(data.rooms).toHaveLength(0);
    expect(data.openings).toHaveLength(0);
    expect(data.furniture).toHaveLength(0);
  });

  it('errors on unknown id', () => {
    expect(store.dispatch({ type: 'deleteRoom', roomId: 'zzz' }).ok).toBe(false);
  });
});

describe('dirty flag', () => {
  it('flips on mutating command, clears on markSaved, unaffected by selection', () => {
    const store2 = new EditorStore(emptyState());
    store2.dispatch({ type: 'drawRoom', polygon: RECT_A });
    expect(store2.dirty).toBe(true);
    store2.markSaved();
    expect(store2.dirty).toBe(false);

    const id = store2.getState().data.rooms[0].id;
    store2.dispatch({ type: 'setSelection', roomId: id });
    expect(store2.dirty).toBe(false); // selection is not plan data

    store2.dispatch({ type: 'moveRoom', roomId: id, delta: [0.5, 0] });
    expect(store2.dirty).toBe(true);
  });
});

describe('undo/redo', () => {
  it('undoes drawRoom exactly (bit-exact JSON roundtrip)', () => {
    const store2 = new EditorStore(emptyState());
    const before = JSON.stringify(store2.getState().data);
    store2.dispatch({ type: 'drawRoom', polygon: RECT_A });
    expect(JSON.parse(JSON.stringify(store2.getState().data))).not.toEqual(JSON.parse(before));
    expect(store2.undo()).toBe(true);
    expect(JSON.stringify(store2.getState().data)).toBe(before);
  });

  it('undo/redo roundtrips move', () => {
    const store2 = new EditorStore(emptyState());
    store2.dispatch({ type: 'drawRoom', polygon: RECT_A });
    const id = store2.getState().data.rooms[0].id;
    const orig = JSON.stringify(store2.getState().data);
    store2.dispatch({ type: 'moveRoom', roomId: id, delta: [2, 2] });
    store2.undo();
    expect(JSON.stringify(store2.getState().data)).toBe(orig);
    store2.redo();
    const moved = store2.getState().data.rooms[0].polygon;
    expect(moved[0]).toEqual([2, 2]);
  });

  it('cannot undo past empty stack', () => {
    const store2 = new EditorStore(emptyState());
    expect(store2.undo()).toBe(false);
    store2.dispatch({ type: 'drawRoom', polygon: RECT_A });
    expect(store2.undo()).toBe(true);
    expect(store2.undo()).toBe(false);
    expect(store2.redo()).toBe(true);
    expect(store2.redo()).toBe(false);
  });

  it('a new command clears the redo stack', () => {
    const store2 = new EditorStore(emptyState());
    store2.dispatch({ type: 'drawRoom', polygon: RECT_A });
    store2.undo();
    expect(store2.canRedo()).toBe(true);
    store2.dispatch({ type: 'drawRoom', polygon: [[10, 0], [12, 0], [12, 2], [10, 2]] as Pt[] });
    expect(store2.canRedo()).toBe(false);
  });

  it('caps the undo stack at 100', () => {
    const store2 = new EditorStore(emptyState());
    for (let i = 0; i < 105; i++) {
      store2.dispatch({
        type: 'drawRoom',
        polygon: [[i, 0], [i + 0.5, 0], [i + 0.5, 0.5], [i, 0.5]],
      });
    }
    let undos = 0;
    while (store2.undo()) undos++;
    expect(undos).toBeLessThanOrEqual(100);
    expect(undos).toBeGreaterThanOrEqual(98); // far from flooding
  });

  it('failed commands do not pollute the undo stack', () => {
    const store2 = new EditorStore(emptyState());
    store2.dispatch({ type: 'drawRoom', polygon: RECT_A });
    const bad = store2.dispatch({ type: 'drawRoom', polygon: [[0, 0], [1, 0]] });
    expect(bad.ok).toBe(false);
    expect(store2.undo()).toBe(true); // undoes the good draw…
    expect(store2.undo()).toBe(false); // …then stack is empty
  });

  it('subscribe notifies listeners on mutations', () => {
    const store2 = new EditorStore(emptyState());
    const listener = vi.fn();
    store2.subscribe(listener);
    store2.dispatch({ type: 'drawRoom', polygon: RECT_A });
    expect(listener).toHaveBeenCalled();
  });
});
