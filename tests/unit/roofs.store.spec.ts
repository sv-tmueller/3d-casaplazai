/**
 * pkg 8.1 (issue #83) store coverage: setWallLean / clearWallLean
 * reducers — topmost-floor guard, bounds/range rejections, lean-0 row
 * stripping, clear-absent refusal, undo round-trips.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData } from '../../src/shared/schema';
import { EditorStore, emptyPlan } from '../../src/editor/store';

function plan(): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = [
    {
      id: 'living',
      name: 'Living',
      polygon: [
        [0, 0],
        [5, 0],
        [5, 4],
        [0, 4],
      ],
      floorTexture: null,
    },
  ];
  return p;
}

function twoStoreyStore(): EditorStore {
  const store = new EditorStore(plan());
  store.dispatch({ type: 'addFloor' });
  store.dispatch({ type: 'setActiveFloor', index: 1 });
  return store;
}

describe('setWallLean / clearWallLean (pkg 8.1)', () => {
  it('adds a lean row to the topmost floor', () => {
    const store = new EditorStore(plan());
    const res = store.dispatch({
      type: 'setWallLean',
      roomId: 'living',
      segmentIndex: 0,
      leanDeg: 30,
    });
    expect(res.ok).toBe(true);
    expect(store.getState().data.floors[0].rooms[0].roofs).toEqual([
      { segmentIndex: 0, leanDeg: 30 },
    ]);
  });

  it('updates an existing row in place (no duplicates)', () => {
    const store = new EditorStore(plan());
    store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 0, leanDeg: 30 });
    store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 0, leanDeg: 45 });
    expect(store.getState().data.floors[0].rooms[0].roofs).toEqual([
      { segmentIndex: 0, leanDeg: 45 },
    ]);
  });

  it('strips the row when the lean drops to 0', () => {
    const store = new EditorStore(plan());
    store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 0, leanDeg: 30 });
    const res = store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 0, leanDeg: 0 });
    expect(res.ok).toBe(true);
    expect(store.getState().data.floors[0].rooms[0].roofs).toEqual([]);
  });

  it('refuses leans on a NON-topmost floor', () => {
    const store = new EditorStore(plan());
    store.dispatch({ type: 'addFloor' });
    // addFloor SWITCHES to the new storey; return to the ground floor.
    store.dispatch({ type: 'setActiveFloor', index: 0 });
    const res = store.dispatch({
      type: 'setWallLean',
      roomId: 'living',
      segmentIndex: 0,
      leanDeg: 30,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('topmost');
  });

  it('allows leans on the topmost floor of a two-storey plan', () => {
    const store = twoStoreyStore();
    // Upper floor has NO rooms — add one first via the plan itself.
    const st = store.getState();
    st.data.floors[1].rooms.push({
      id: 'attic',
      name: 'Attic',
      polygon: [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ],
      floorTexture: null,
    });
    const res = store.dispatch({
      type: 'setWallLean',
      roomId: 'attic',
      segmentIndex: 0,
      leanDeg: 35,
    });
    expect(res.ok).toBe(true);
    expect(store.getState().data.floors[1].rooms[0].roofs).toEqual([
      { segmentIndex: 0, leanDeg: 35 },
    ]);
  });

  it('rejects out-of-range segmentIndex and leanDeg', () => {
    const store = new EditorStore(plan());
    expect(
      store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 4, leanDeg: 30 }).ok,
    ).toBe(false);
    expect(
      store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 0, leanDeg: 76 }).ok,
    ).toBe(false);
    expect(
      store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 0, leanDeg: -1 }).ok,
    ).toBe(false);
    expect(
      store.dispatch({ type: 'setWallLean', roomId: 'ghost', segmentIndex: 0, leanDeg: 30 }).ok,
    ).toBe(false);
  });

  it('clearWallLean removes the row; refuses an absent one', () => {
    const store = new EditorStore(plan());
    store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 2, leanDeg: 35 });
    const res = store.dispatch({ type: 'clearWallLean', roomId: 'living', segmentIndex: 2 });
    expect(res.ok).toBe(true);
    expect(store.getState().data.floors[0].rooms[0].roofs).toEqual([]);
    const absent = store.dispatch({ type: 'clearWallLean', roomId: 'living', segmentIndex: 2 });
    expect(absent.ok).toBe(false);
    if (!absent.ok) expect(absent.error).toContain('no lean');
  });

  it('undo restores the pre-lean plan (atomic snapshot)', () => {
    const store = new EditorStore(plan());
    store.dispatch({ type: 'setWallLean', roomId: 'living', segmentIndex: 0, leanDeg: 30 });
    store.undo();
    expect(store.getState().data.floors[0].rooms[0].roofs).toBeUndefined();
  });
});
