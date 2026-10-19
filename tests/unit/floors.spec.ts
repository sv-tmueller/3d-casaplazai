/**
 * Pkg 7.2 (issue #75) — editor floors. Pins the store refactor:
 * activeFloorIdx lives OUTSIDE `data` (switches never pollute undo
 * history; add/delete/rename DO snapshot), the central clamp after
 * undo/redo, addFloor's elevation default (max+wallHeight+0.3, #69 §D),
 * sole-floor refusal, and floor-switch isolation (draws land on the
 * ACTIVE floor only).
 */
import { describe, expect, it } from 'vitest';
import type { Room } from '../../src/shared/schema';
import { validateFloorplan } from '../../src/shared/schema';
import {
  EditorStore,
  activeFloorPlan,
  emptyPlan,
} from '../../src/editor/store';

function room(id: string, name: string): Room {
  return {
    id,
    name,
    polygon: [[0, 0], [3, 0], [3, 3], [0, 3]],
    floorTexture: null,
  };
}

function twoFloorStore(): EditorStore {
  const p = emptyPlan();
  p.floors[0].rooms = [room('r-ground', 'Ground room')];
  const store = new EditorStore(p);
  expect(store.dispatch({ type: 'addFloor' }).ok).toBe(true);
  const upper = store.getState().data.floors[1];
  upper.rooms = [room('r-upper', 'Upper room')];
  return store;
}

/** Boot plan seeded with a room so validator's non-empty rule holds. */
function seededStore(): EditorStore {
  const p = emptyPlan();
  p.floors[0].rooms = [room('r-boot', 'Boot room')];
  return new EditorStore(p);
}

describe('floor-switch isolation (issue #75)', () => {
  it('drawRoom lands on the ACTIVE floor only', () => {
    const store = twoFloorStore();
    expect(store.dispatch({ type: 'setActiveFloor', index: 1 }).ok).toBe(true);
    const res = store.dispatch({
      type: 'drawRoom',
      polygon: [[5, 0], [8, 0], [8, 3], [5, 3]],
    });
    expect(res.ok).toBe(true);
    const floors = store.getState().data.floors;
    expect(floors[0].rooms).toHaveLength(1); // untouched ground floor
    expect(floors[1].rooms).toHaveLength(2); // drew upstairs
  });

  it('activeFloorPlan exposes ONLY the active storey to read paths', () => {
    const store = twoFloorStore();
    expect(store.dispatch({ type: 'setActiveFloor', index: 1 }).ok).toBe(true);
    const view = activeFloorPlan(store.getState());
    expect(view.floors).toHaveLength(1);
    expect(view.floors[0].rooms.map((r) => r.id)).toEqual(['r-upper']);
  });

  it('setActiveFloor rejects out-of-range indices', () => {
    const store = twoFloorStore();
    store.dispatch({ type: 'setActiveFloor', index: 0 });
    expect(store.dispatch({ type: 'setActiveFloor', index: 2 }).ok).toBe(false);
    expect(store.dispatch({ type: 'setActiveFloor', index: -1 }).ok).toBe(false);
    expect(store.getState().activeFloorIdx).toBe(0);
  });
});

/** Two-floor store built WITHOUT dispatching (history starts empty). */
function pristineTwoFloorStore(): EditorStore {
  const p = emptyPlan();
  p.floors[0].rooms = [room('r-ground', 'Ground room')];
  p.floors.push({
    id: 'floor-upper',
    name: 'Floor 2',
    elevation: 3.0,
    rooms: [room('r-upper', 'Upper room')],
    openings: [],
    furniture: [],
  });
  return new EditorStore(p);
}

describe('undo semantics (issue #75)', () => {
  it('floor SWITCHES never enter undo history', () => {
    const store = pristineTwoFloorStore();
    store.markSaved();
    expect(store.dispatch({ type: 'setActiveFloor', index: 1 }).ok).toBe(true);
    expect(store.dispatch({ type: 'setActiveFloor', index: 0 }).ok).toBe(true);
    expect(store.canUndo()).toBe(false);
    expect(store.dirty).toBe(false);
  });

  it('undo-after-swap restores the UPPER floor\'s prior state', () => {
    const store = twoFloorStore();
    store.dispatch({ type: 'setActiveFloor', index: 1 });
    store.dispatch({
      type: 'drawRoom',
      polygon: [[5, 0], [8, 0], [8, 3], [5, 3]],
    });
    expect(store.getState().data.floors[1].rooms).toHaveLength(2);
    expect(store.undo()).toBe(true);
    // Floor 2 is back to its single room; the ground floor never moved.
    expect(store.getState().data.floors[1].rooms).toHaveLength(1);
    expect(store.getState().data.floors[1].rooms[0].id).toBe('r-upper');
    expect(store.getState().data.floors[0].rooms).toHaveLength(1);
    // The switch itself was NOT a history step: nothing left to undo
    // except the pre-suite addFloor snapshot chain.
  });

  it('addFloor/renameFloor/deleteFloor snapshot as ordinary commands', () => {
    const store = new EditorStore(emptyPlan());
    store.dispatch({ type: 'addFloor' });
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.getState().data.floors).toHaveLength(1);

    store.dispatch({ type: 'addFloor' });
    store.dispatch({ type: 'renameFloor', name: 'Attic' });
    expect(store.getState().data.floors[1].name).toBe('Attic');
    store.undo();
    expect(store.getState().data.floors[1].name).toBe('Floor 2');
  });

  it('activeFloorIdx CLAMPS after undo shrinks floors[] beneath it', () => {
    const store = new EditorStore(emptyPlan());
    store.dispatch({ type: 'addFloor' }); // now 2 floors, active = 1
    expect(store.getState().activeFloorIdx).toBe(1);
    store.undo(); // floors shrinks to 1 beneath idx 1
    const st = store.getState();
    expect(st.data.floors).toHaveLength(1);
    expect(st.activeFloorIdx).toBe(0);
    // And the store stays usable: a draw goes to the surviving floor.
    expect(
      store.dispatch({ type: 'drawRoom', polygon: [[0, 0], [2, 0], [2, 2], [0, 2]] }).ok,
    ).toBe(true);
    expect(st.data.floors[0].rooms).toHaveLength(1);
  });
});

describe('addFloor elevation default (#69 §D)', () => {
  it('elevation = max(elevation) + wallHeight + 0.3 (stored number)', () => {
    const store = new EditorStore(emptyPlan());
    store.dispatch({ type: 'addFloor' });
    const f2 = store.getState().data.floors[1];
    expect(f2.elevation).toBeCloseTo(2.7 + 0.3, 9);
    store.dispatch({ type: 'addFloor' });
    const f3 = store.getState().data.floors[2];
    expect(f3.elevation).toBeCloseTo(3.0 + 2.7 + 0.3, 9);
  });

  it('activates the new floor; empty upper floors validate (7.2)', () => {
    // pkg 7.2: an upper floor may sit empty right after "Add floor"
    // (rejecting it discarded the whole autosaved plan on reload).
    // The GROUND floor still demands >= 1 room.
    const store = seededStore();
    store.dispatch({ type: 'addFloor' });
    const st = store.getState();
    expect(st.activeFloorIdx).toBe(1);
    expect(validateFloorplan(st.data).ok).toBe(true);
  });

  it('sequential default names; explicit names win', () => {
    const store = seededStore();
    store.dispatch({ type: 'addFloor' });
    expect(store.getState().data.floors[1].name).toBe('Floor 2');
    store.dispatch({ type: 'addFloor', name: ' Loft ' });
    expect(store.getState().data.floors[2].name).toBe('Loft');
  });
});

describe('deleteFloor sole-floor refusal (issue #75)', () => {
  it('refuses to delete the only floor', () => {
    const store = new EditorStore(emptyPlan());
    const res = store.dispatch({ type: 'deleteFloor' });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain('only floor');
    expect(store.getState().data.floors).toHaveLength(1);
    expect(store.canUndo()).toBe(false);
  });

  it('deletes the ACTIVE floor and clamps to a survivor', () => {
    const store = twoFloorStore();
    store.dispatch({ type: 'setActiveFloor', index: 1 });
    expect(store.dispatch({ type: 'deleteFloor' }).ok).toBe(true);
    const st = store.getState();
    expect(st.data.floors).toHaveLength(1);
    expect(st.activeFloorIdx).toBe(0);
    expect(st.data.floors[0].rooms.map((r) => r.id)).toEqual(['r-ground']);
  });
});
