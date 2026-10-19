/**
 * Pkg 13.4 (issue #118) — stairs editor foundation. Pins the store
 * commands (addStair / updateStair / flipStair / deleteStair), the
 * PLAN-level membership sites (setEntitySelection known-set, the central
 * clamp's selected-stair reconciliation, undo's dangling drop), and the
 * delete cascades that purge stranded flights (deleteRoom / deleteFloor /
 * deleteEntities). Deep geometric legality — gap match, containment, hole
 * overlap — is validateGeometry()'s job and stays pinned by the geom
 * suite; here the store answers for structural sanity only.
 */
import { describe, expect, it } from 'vitest';
import type { Room, Staircase, Vec2 } from '../../src/shared/schema';
import { validateFloorplan } from '../../src/shared/schema';
import {
  EditorStore,
  emptyPlan,
  nextFloorElevation,
} from '../../src/editor/store';

function room(
  id: string,
  name: string,
  polygon: Vec2[] = [[0, 0], [5, 0], [5, 4], [0, 4]],
): Room {
  return { id, name, polygon, floorTexture: null };
}

/**
 * Three-storey plan — Ground (0 m), Floor 2 (3.0 m), Floor 3 (6.0 m),
 * all via addFloor's own pitch (wallHeight + 0.3 per storey) — with one
 * room per storey. Built by DISPATCH so the elevations come from the
 * reducer, never hand-typed.
 */
function threeFloorStore(): EditorStore {
  const p = emptyPlan();
  p.floors[0].rooms = [
    room('living', 'Living'),
    room('kitchen', 'Kitchen', [[5, 0], [9, 0], [9, 4], [5, 4]]),
  ];
  const store = new EditorStore(p);
  store.dispatch({ type: 'addFloor' }); // Floor 2 @ wallHeight + 0.3
  store.getState().data.floors[1].rooms = [room('loft', 'Loft')];
  store.dispatch({ type: 'addFloor' }); // Floor 3
  store.getState().data.floors[2].rooms = [room('attic', 'Attic')];
  store.dispatch({ type: 'setActiveFloor', index: 0 });
  return store;
}

const STAIR_BASE = {
  roomId: 'living',
  position: [2.5, 2] as Vec2,
  rotationDeg: 0,
  width: 1,
  run: 2.8,
  rise: 3,
  stepCount: 10,
};

function stairsOf(store: EditorStore): Staircase[] {
  return store.getState().data.stairs;
}

/** Ground-room stair climbing onto Floor 2 (departure 0, rise 3). */
function addGroundStair(store: EditorStore): Staircase {
  const res = store.dispatch({ type: 'addStair', ...STAIR_BASE });
  expect(res.ok).toBe(true);
  const stair = stairsOf(store).at(-1);
  if (!stair) throw new Error('addStair did not push a row');
  return stair;
}

describe('addStair (issue #118)', () => {
  it('places the flight, selects it, and undoes in ONE step', () => {
    const store = threeFloorStore();
    const res = store.dispatch({ type: 'addStair', ...STAIR_BASE });
    expect(res.ok).toBe(true);
    const stairs = stairsOf(store);
    expect(stairs).toHaveLength(1);
    const s = stairs[0];
    expect(s.roomId).toBe('living');
    expect(s.position).toEqual([2.5, 2]);
    expect(s.rotationDeg).toBe(0);
    expect(s.width).toBe(1);
    expect(s.run).toBe(2.8);
    expect(s.rise).toBe(3);
    expect(s.stepCount).toBe(10);
    // Selection lands on the fresh flight (addOpening precedent).
    expect(store.getState().selectedId).toBe(s.id);
    // One undo step: the plan is back to stair-free.
    expect(store.undo()).toBe(true);
    expect(stairsOf(store)).toHaveLength(0);
    expect(store.getState().selectedId).toBeNull();
  });

  it('never mints a plan the schema would reject', () => {
    const store = threeFloorStore();
    addGroundStair(store);
    expect(validateFloorplan(store.getState().data).ok).toBe(true);
  });

  it('rejects unknown rooms and non-finite poses', () => {
    const store = threeFloorStore();
    expect(store.dispatch({ type: 'addStair', ...STAIR_BASE, roomId: 'nope' }).ok).toBe(false);
    expect(
      store.dispatch({ type: 'addStair', ...STAIR_BASE, position: [NaN, 0] as Vec2 }).ok,
    ).toBe(false);
    expect(store.dispatch({ type: 'addStair', ...STAIR_BASE, rotationDeg: Infinity }).ok).toBe(
      false,
    );
    expect(stairsOf(store)).toHaveLength(0);
  });

  it('rejects non-positive scalars and stepCount below the schema floor', () => {
    const store = threeFloorStore();
    const cases: Array<Partial<typeof STAIR_BASE>> = [
      { width: 0 },
      { width: -1 },
      { run: 0 },
      { rise: -2.7 },
      { stepCount: 2 },
      { stepCount: 4.5 },
    ];
    for (const patch of cases) {
      const res = store.dispatch({ type: 'addStair', ...STAIR_BASE, ...patch });
      expect(res.ok).toBe(false);
    }
    expect(stairsOf(store)).toHaveLength(0);
  });
});

describe('updateStair (issue #118)', () => {
  it('edits the scalars in place (one snapshot per commit)', () => {
    const store = threeFloorStore();
    const s = addGroundStair(store);
    const res = store.dispatch({
      type: 'updateStair',
      stairId: s.id,
      fields: { rotationDeg: 90, width: 1.2, run: 3.2, rise: 3, stepCount: 12 },
    });
    expect(res.ok).toBe(true);
    const row = stairsOf(store)[0];
    expect(row.rotationDeg).toBe(90);
    expect(row.width).toBe(1.2);
    expect(row.run).toBe(3.2);
    expect(row.stepCount).toBe(12);
    expect(store.undo()).toBe(true);
    expect(stairsOf(store)[0].run).toBe(2.8);
  });

  it('rejects unknown stairs and invalid fields', () => {
    const store = threeFloorStore();
    const s = addGroundStair(store);
    expect(
      store.dispatch({ type: 'updateStair', stairId: 'nope', fields: { run: 3 } }).ok,
    ).toBe(false);
    const bad = store.dispatch({
      type: 'updateStair',
      stairId: s.id,
      fields: { stepCount: 2 },
    });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain('stepCount');
    expect(stairsOf(store)[0].stepCount).toBe(10); // untouched
  });
});

describe('flipStair (issue #118)', () => {
  it('rotates +180° mod 360, position unchanged', () => {
    const store = threeFloorStore();
    const s = addGroundStair(store);
    const before = stairsOf(store)[0].position;

    expect(store.dispatch({ type: 'flipStair', stairId: s.id }).ok).toBe(true);
    expect(stairsOf(store)[0].rotationDeg).toBe(180);
    expect(stairsOf(store)[0].position).toEqual(before);

    expect(store.dispatch({ type: 'flipStair', stairId: s.id }).ok).toBe(true);
    expect(stairsOf(store)[0].rotationDeg).toBe(0);

    store.dispatch({ type: 'updateStair', stairId: s.id, fields: { rotationDeg: 350 } });
    store.dispatch({ type: 'flipStair', stairId: s.id });
    expect(stairsOf(store)[0].rotationDeg).toBe(170);
  });

  it('rejects unknown stairs', () => {
    const store = threeFloorStore();
    expect(store.dispatch({ type: 'flipStair', stairId: 'nope' }).ok).toBe(false);
  });
});

describe('deleteStair (issue #118)', () => {
  it('removes the flight, clears a matching selection, undoes cleanly', () => {
    const store = threeFloorStore();
    const s = addGroundStair(store);
    expect(store.getState().selectedId).toBe(s.id);

    expect(store.dispatch({ type: 'deleteStair', stairId: s.id }).ok).toBe(true);
    expect(stairsOf(store)).toHaveLength(0);
    expect(store.getState().selectedId).toBeNull();

    expect(store.undo()).toBe(true);
    expect(stairsOf(store)).toHaveLength(1);

    expect(store.dispatch({ type: 'deleteStair', stairId: 'nope' }).ok).toBe(false);
  });
});

describe('plan-level membership sites (issue #118)', () => {
  it('setEntitySelection accepts a live stair id, rejects a deleted one', () => {
    const store = threeFloorStore();
    const s = addGroundStair(store);
    store.dispatch({ type: 'setEntitySelection', entityId: null });
    expect(store.dispatch({ type: 'setEntitySelection', entityId: s.id }).ok).toBe(true);
    expect(store.getState().selectedId).toBe(s.id);

    store.dispatch({ type: 'deleteStair', stairId: s.id });
    expect(store.dispatch({ type: 'setEntitySelection', entityId: s.id }).ok).toBe(false);
  });

  it('the central clamp reaps a stair selection from another floor', () => {
    const store = threeFloorStore();
    const s = addGroundStair(store);
    // Switch to Floor 2 (selection-like: no clamp yet)…
    store.dispatch({ type: 'setActiveFloor', index: 1 });
    expect(store.getState().selectedId).toBe(s.id);
    // …the next MUTATING command funnels through clampActiveFloorIdx,
    // where the stair is a cross-floor phantom (its host sits on Ground).
    store.dispatch({ type: 'renameFloor', name: 'Loft' });
    expect(store.getState().selectedId).toBeNull();
    // The flight itself is untouched — only the selection moved.
    expect(stairsOf(store)).toHaveLength(1);
  });

  it('keeps a stair selection while its departure floor is active', () => {
    const store = threeFloorStore();
    const s = addGroundStair(store);
    store.dispatch({ type: 'renameFloor', name: 'Parterre' });
    expect(store.getState().selectedId).toBe(s.id);
  });
});

describe('delete cascades purge stranded flights (issue #118)', () => {
  it('deleteRoom purges stairs hosted by the removed room', () => {
    const store = threeFloorStore();
    addGroundStair(store); // hosted by 'living'
    expect(store.dispatch({ type: 'deleteRoom', roomId: 'kitchen' }).ok).toBe(true);
    expect(stairsOf(store)).toHaveLength(1); // kitchen hosted nothing
    expect(store.dispatch({ type: 'deleteRoom', roomId: 'living' }).ok).toBe(true);
    expect(stairsOf(store)).toHaveLength(0);
  });

  it('deleteEntities purges dependent stairs in the SAME atomic step', () => {
    const store = threeFloorStore();
    addGroundStair(store);
    expect(store.dispatch({ type: 'deleteEntities', ids: ['living'] }).ok).toBe(true);
    expect(stairsOf(store)).toHaveLength(0);
    // ONE undo restores room AND flight together.
    expect(store.undo()).toBe(true);
    expect(stairsOf(store)).toHaveLength(1);
    expect(
      store.getState().data.floors[0].rooms.some((r) => r.id === 'living'),
    ).toBe(true);
  });

  it('deleteEntities routes a stair id directly (marquee bulk delete)', () => {
    const store = threeFloorStore();
    const s = addGroundStair(store);
    expect(store.dispatch({ type: 'deleteEntities', ids: [s.id] }).ok).toBe(true);
    expect(stairsOf(store)).toHaveLength(0);
  });

  it('deleteFloor purges flights departing OR arriving at the storey', () => {
    const store = threeFloorStore();
    // Ground → Floor 2 (arrival 3.0): arrival plane = the deleted storey.
    const viaFloor2 = addGroundStair(store);
    // Loft → Floor 3 (departure on Floor 2): departure room departs.
    expect(
      store.dispatch({
        type: 'addStair',
        ...STAIR_BASE,
        roomId: 'loft',
        position: [2.5, 2],
        rise: 3.0,
      }).ok,
    ).toBe(true);
    // Ground → Floor 3 (long flight, arrival 6.0): survives.
    expect(
      store.dispatch({ type: 'addStair', ...STAIR_BASE, rise: 6.0 }).ok,
    ).toBe(true);
    expect(stairsOf(store)).toHaveLength(3);

    store.dispatch({ type: 'setActiveFloor', index: 1 }); // Floor 2
    expect(store.dispatch({ type: 'deleteFloor' }).ok).toBe(true);
    const survivors = stairsOf(store);
    expect(survivors).toHaveLength(1);
    expect(survivors[0].rise).toBe(6.0);
    expect(survivors[0].id).not.toBe(viaFloor2.id);

    // Undo restores the storey AND both purged flights.
    expect(store.undo()).toBe(true);
    expect(stairsOf(store)).toHaveLength(3);
  });

  it('deleteFloor leaves unrelated flights alone', () => {
    const store = threeFloorStore();
    addGroundStair(store); // arrival 3.0 — the deleted storey is Floor 3
    store.dispatch({ type: 'setActiveFloor', index: 2 });
    expect(store.dispatch({ type: 'deleteFloor' }).ok).toBe(true);
    expect(stairsOf(store)).toHaveLength(1);
  });
});

describe('nextFloorElevation (issue #118)', () => {
  it('equals the elevation addFloor actually mints', () => {
    const store = threeFloorStore();
    const predicted = nextFloorElevation(store.getState().data);
    store.dispatch({ type: 'addFloor' });
    const minted = store.getState().data.floors.at(-1);
    expect(minted?.elevation).toBeCloseTo(predicted, 9);
    expect(predicted).toBeCloseTo(6.0 + 2.7 + 0.3, 9);
  });
});
