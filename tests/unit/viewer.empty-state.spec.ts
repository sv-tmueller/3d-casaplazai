// @vitest-environment happy-dom
/**
 * Empty-plan state (issue #148; reported through the UI sink since #178,
 * gap G9): a plan with zero rooms on every storey is a calm EMPTY STATE —
 * backdrop + the 3D empty card, Walk unavailable — never an error toast.
 * The first real room restores the scene; real validator failures still
 * toast.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isEmptyPlan, planSignature } from '../../src/viewer/appController';
import { emptyAdaptedScene } from '../../src/viewer/sceneBuilder';
import { RECOMPILE_DEBOUNCE_MS } from '../../src/viewer/types';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { bootViewer, viewerStats, type Harness } from './helpers/viewerHarness';

function emptyPlan(): FloorplanData {
  return migrate({ schemaVersion: 1, units: 'meters', wallHeight: 2.7, wallThickness: 0.24, rooms: [], openings: [], furniture: [] }).data!;
}

function roomPlan(name = 'Big'): FloorplanData {
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [{ id: 'big', name, polygon: [[0, 0], [6, 0], [6, 5], [0, 5]], floorTexture: 'wood' }],
    openings: [],
    furniture: [],
  }).data!;
}

function invalidPlan(): FloorplanData {
  const bad = roomPlan();
  bad.floors[0].openings.push({
    id: 'boom', kind: 'door', roomId: 'big', segmentIndex: 0, tCenter: 0.5, width: -1, sillHeight: 0, headHeight: 2.05,
  });
  return bad;
}

const cycle = (h: Harness): void => h.advance(RECOMPILE_DEBOUNCE_MS);

describe('viewer empty-plan state (issue #148)', () => {
  let h: Harness | null = null;
  afterEach(() => h?.dispose());

  it('classifies a room-less plan as empty on every storey', () => {
    expect(isEmptyPlan(emptyPlan())).toBe(true);
    expect(isEmptyPlan(roomPlan())).toBe(false);
    const twoFloors = emptyPlan();
    twoFloors.floors.push({ ...twoFloors.floors[0]!, id: 'second' });
    expect(isEmptyPlan(twoFloors)).toBe(true);
    twoFloors.floors[1]!.rooms.push({ id: 'up', name: 'Up', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]], floorTexture: 'wood' });
    expect(isEmptyPlan(twoFloors)).toBe(false);
  });

  it('hands sceneBuilder a neutral, geometry-free backdrop scene', () => {
    const adapted = emptyAdaptedScene();
    expect(adapted.buckets).toHaveLength(0);
    expect(adapted.triangleCount).toBe(0);
    expect(adapted.bounds.minX).toBe(-adapted.bounds.maxX);
    expect(adapted.bounds.minY).toBe(-adapted.bounds.maxY);
  });

  it('boots a room-less profile into the empty state, no toast, no walk', () => {
    h = bootViewer(emptyPlan());
    expect(h.sink.empty.at(-1)).toBe(true);
    expect(h.sink.toasts).toHaveLength(0);
    expect(h.app.canWalk()).toBe(false);
    expect(viewerStats().emptyState).toBe(true);
    expect(viewerStats().meshCount).toBe(0);
    expect(viewerStats().wallOpacity).toBeNull();
    expect(h.app.currentSignature()).toBeNull();
  });

  it('the first real room leaves the empty state and is accepted', () => {
    h = bootViewer(emptyPlan());
    const plan = roomPlan();
    h.setPlan(plan);
    cycle(h);
    expect(h.app.currentSignature()).toBe(planSignature(plan));
    expect(h.sink.empty.at(-1)).toBe(false);
    expect(h.app.canWalk()).toBe(true);
    // The shell is told walking just became possible (segment re-render).
    expect(h.sink.availability).toBeGreaterThan(0);
    expect(viewerStats().emptyState).toBe(false);
    expect(h.sink.toasts).toHaveLength(0);
  });

  it('deleting the last room returns to the empty state without a toast', () => {
    h = bootViewer(roomPlan());
    h.setPlan(emptyPlan());
    cycle(h);
    expect(h.sink.empty.at(-1)).toBe(true);
    expect(h.app.canWalk()).toBe(false);
    expect(h.sink.toasts).toHaveLength(0);
    expect(h.app.currentSignature()).toBeNull();
  });

  it('an invalid plan toasts once per rebuild and keeps the scene (the kit stack de-duplicates)', () => {
    h = bootViewer(roomPlan());
    const good = h.app.currentSignature();
    h.setPlan(invalidPlan());
    cycle(h);
    h.notify();
    cycle(h);
    expect(h.app.currentSignature()).toBe(good);
    expect(h.sink.toasts.map((t) => t.text)).toEqual([
      'Recompile failed — keeping last good view',
      'Recompile failed — keeping last good view',
    ]);
    expect(viewerStats().emptyState).toBe(false);
  });

  it('a valid plan clears the failure toast it superseded', () => {
    h = bootViewer(roomPlan());
    h.setPlan(invalidPlan());
    cycle(h);
    const before = h.sink.dismissed;
    h.setPlan(roomPlan('Renamed'));
    cycle(h);
    expect(h.sink.dismissed).toBeGreaterThan(before);
  });

  it('still reports a REAL validator failure while empty', () => {
    h = bootViewer(emptyPlan());
    h.setPlan(invalidPlan());
    cycle(h);
    expect(h.sink.toasts.at(-1)?.text).toContain('Cannot render plan');
  });

  it('refuses a walk request while there is nothing to walk in', () => {
    h = bootViewer(emptyPlan());
    expect(h.app.requestMode('walk')).toBe(false);
    expect(viewerStats().emptyState).toBe(true);
    expect(h.sink.modes.includes('walk')).toBe(false);
  });
});
