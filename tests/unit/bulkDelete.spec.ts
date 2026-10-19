/**
 * Unit tests for the pkg 13.2 atomic bulk delete (issue #110, SUB_PLAN
 * step 2): deleteEntities {ids} — mixed-kind batch, ONE undo step,
 * unknown-id tolerance, room cascade, selectedId reconciliation
 * (listed ids AND cascade victims), synced opening pairs, refusal on
 * empty/all-unknown batches.
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
      polygon: [[0, 0], [5, 0], [5, 4], [0, 4]],
      floorTexture: null,
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      polygon: [[5, 0], [8, 0], [8, 4], [5, 4]],
      floorTexture: null,
    },
  ];
  p.floors[0].furniture = [
    {
      id: 'chair1',
      type: 'table',
      roomId: 'living',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [0.6, 0.6],
    },
    {
      id: 'chair2',
      type: 'table',
      roomId: 'kitchen',
      position: [6, 2],
      rotationDeg: 0,
      footprint: [0.6, 0.6],
    },
  ];
  return p;
}

function newStore(): EditorStore {
  return new EditorStore(plan());
}

describe('deleteEntities (issue #110)', () => {
  it('deletes a mixed batch atomically and undoes it in ONE step', () => {
    const store = newStore();

    // Seed one undo step so depth deltas are attributable to the batch.
    store.dispatch({ type: 'addFurniture', itemType: 'bed', roomId: 'living', position: [1, 1], rotationDeg: 0, footprint: [1, 1] });
    const depthBefore = (store as unknown as { _undoStack: string[] })._undoStack.length;

    const res = store.dispatch({
      type: 'deleteEntities',
      ids: ['chair1', 'kitchen'],
    });
    expect(res.ok).toBe(true);

    const st = store.getState();
    expect(st.data.floors[0].furniture.some((f) => f.id === 'chair1')).toBe(false);
    expect(st.data.floors[0].rooms.some((r) => r.id === 'kitchen')).toBe(false);
    // kitchen cascade: chair2 was anchored there and goes with the room.
    expect(st.data.floors[0].furniture.some((f) => f.id === 'chair2')).toBe(false);
    expect(st.data.floors[0].rooms.some((r) => r.id === 'living')).toBe(true);

    const depthMid = (store as unknown as { _undoStack: string[] })._undoStack.length;
    expect(depthMid).toBe(depthBefore + 1); // ONE undo entry for the batch

    expect(store.undo()).toBe(true); // rolls the WHOLE batch back at once
    const restored = store.getState();
    expect(restored.data.floors[0].furniture.some((f) => f.id === 'chair1')).toBe(true);
    expect(restored.data.floors[0].rooms.some((r) => r.id === 'kitchen')).toBe(true);
    expect(restored.data.floors[0].furniture.some((f) => f.id === 'chair2')).toBe(true);
  });

  it('purges selectedId when a LISTED id was selected', () => {
    const store = newStore();
    store.dispatch({ type: 'setEntitySelection', entityId: 'chair1' });
    const res = store.dispatch({ type: 'deleteEntities', ids: ['chair1'] });
    expect(res.ok).toBe(true);
    expect(store.getState().selectedId).toBeNull();
  });

  it('purges selectedId when a CASCADE victim was selected (not listed)', () => {
    const store = newStore();
    store.dispatch({ type: 'setEntitySelection', entityId: 'chair2' });
    // Deleting kitchen cascades chair2 away although it is not in ids.
    const res = store.dispatch({ type: 'deleteEntities', ids: ['kitchen'] });
    expect(res.ok).toBe(true);
    expect(store.getState().selectedId).toBeNull();
  });

  it('takes an opening pair along (syncPair parity with single delete)', () => {
    const store = newStore();
    // Shared-wall door on x=5: emits two rows (two-row AC1 precedent).
    const addRes = store.dispatch({
      type: 'addOpening',
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.55,
      ...{
        kind: 'door',
        width: 0.85,
        sillHeight: 0,
        headHeight: 2.05,
      },
    });
    expect(addRes.ok).toBe(true);
    const openings = store.getState().data.floors[0].openings;
    expect(openings.length).toBeGreaterThanOrEqual(2);

    const doorIds = openings.map((o) => o.id);
    const res = store.dispatch({ type: 'deleteEntities', ids: [...doorIds] });
    expect(res.ok).toBe(true);
    expect(store.getState().data.floors[0].openings.length).toBe(0);
  });

  it('skips unknown ids and refuses an all-unknown batch without snapshotting', () => {
    const store = newStore();
    const res = store.dispatch({ type: 'deleteEntities', ids: ['chair1', 'ghost'] });
    expect(res.ok).toBe(true); // ghost skipped, chair1 gone
    expect(store.getState().data.floors[0].furniture.length).toBe(1);

    const bad = store.dispatch({ type: 'deleteEntities', ids: ['ghost2'] });
    expect(bad.ok).toBe(false);
    const badEmpty = store.dispatch({ type: 'deleteEntities', ids: [] });
    expect(badEmpty.ok).toBe(false);
  });
});
