// @vitest-environment happy-dom
/**
 * Recompile pipeline (issue #6; store-driven since #178, gap G7): the 3D
 * engine subscribes to the EditorStore instead of polling the window
 * bridge. A notify debounces a rebuild; reducers mutate the plan IN
 * PLACE, so the signature (not the reference) decides; an INVALID
 * intermediate keeps the last-good scene with a toast; rebuilds wait
 * while a 2D drag is in flight (ported from the retired mini 3D inset).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { planSignature } from '../../src/viewer/appController';
import { RECOMPILE_DEBOUNCE_MS } from '../../src/viewer/types';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { bootViewer, type Harness } from './helpers/viewerHarness';

function basePlan(): FloorplanData {
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [{ id: 'big', name: 'Big', polygon: [[0, 0], [6, 0], [6, 5], [0, 5]], floorTexture: 'wood' }],
    openings: [],
    furniture: [],
  }).data!;
}

function breakPlan(plan: FloorplanData): void {
  plan.floors[0].openings.push({
    id: 'boom',
    kind: 'door',
    roomId: 'big',
    segmentIndex: 0,
    tCenter: 0.5,
    width: -1,
    sillHeight: 0,
    headHeight: 2.05,
  });
}

describe('viewer recompile pipeline', () => {
  let h: Harness | null = null;
  afterEach(() => h?.dispose());

  it('boots on the initial plan and adapts it', () => {
    h = bootViewer(basePlan());
    expect(h.app.currentSignature()).toBe(planSignature(basePlan()));
  });

  it('rebuilds on a store notify after the debounce, catching IN-PLACE edits', () => {
    h = bootViewer(basePlan());
    const before = h.app.currentSignature();
    // Reducers mutate state.data in place: same object, new content.
    h.plan().floors[0].rooms[0].polygon = [[0, 0], [8, 0], [8, 5], [0, 5]];
    h.notify();
    h.advance(RECOMPILE_DEBOUNCE_MS - 1);
    expect(h.app.currentSignature()).toBe(before);
    h.advance(1);
    expect(h.app.currentSignature()).toBe(planSignature(h.plan()));
    expect(h.app.currentSignature()).not.toBe(before);
  });

  it('coalesces a burst of notifies into one rebuild', () => {
    h = bootViewer(basePlan());
    const rebuilds = h.app.rebuildCount();
    for (let i = 0; i < 5; i += 1) {
      h.plan().floors[0].rooms[0].name = `Big ${i}`;
      h.notify();
      h.advance(50);
    }
    h.advance(RECOMPILE_DEBOUNCE_MS);
    expect(h.app.rebuildCount()).toBe(rebuilds + 1);
  });

  it('skips the rebuild when a notify leaves the plan unchanged (selection)', () => {
    h = bootViewer(basePlan());
    const rebuilds = h.app.rebuildCount();
    h.notify();
    h.advance(RECOMPILE_DEBOUNCE_MS);
    expect(h.app.rebuildCount()).toBe(rebuilds);
  });

  it('flush() applies a pending rebuild at once (a Walk request cannot wait)', () => {
    h = bootViewer(basePlan());
    h.plan().floors[0].rooms[0].name = 'Flushed';
    h.notify();
    h.app.flush();
    expect(h.app.currentSignature()).toBe(planSignature(h.plan()));
    h.advance(RECOMPILE_DEBOUNCE_MS);
    expect(h.app.rebuildCount()).toBe(2);
  });

  it('postpones the rebuild while a 2D gesture is in progress', () => {
    h = bootViewer(basePlan());
    h.setBusy(true);
    h.plan().floors[0].rooms[0].name = 'Dragging';
    h.notify();
    h.advance(RECOMPILE_DEBOUNCE_MS * 4);
    expect(h.app.currentSignature()).toBe(planSignature(basePlan()));
    h.setBusy(false);
    h.advance(RECOMPILE_DEBOUNCE_MS);
    expect(h.app.currentSignature()).toBe(planSignature(h.plan()));
  });

  it('compiles a snapshot, so a later in-place edit cannot reach the built scene', () => {
    h = bootViewer(basePlan());
    const accepted = h.app.currentSignature();
    h.plan().floors[0].rooms[0].name = 'Mutated after';
    expect(h.app.currentSignature()).toBe(accepted);
  });

  it('INVALID intermediate retains the last-good scene with a toast', () => {
    h = bootViewer(basePlan());
    const good = h.app.currentSignature();
    breakPlan(h.plan());
    h.notify();
    h.advance(RECOMPILE_DEBOUNCE_MS);
    expect(h.app.currentSignature()).toBe(good);
    expect(h.sink.toasts.at(-1)).toEqual({ text: 'Recompile failed — keeping last good view', variant: 'error' });
  });

  it('recovers when the plan becomes valid again', () => {
    h = bootViewer(basePlan());
    breakPlan(h.plan());
    h.notify();
    h.advance(RECOMPILE_DEBOUNCE_MS);
    const good2 = basePlan();
    good2.floors[0].rooms[0].name = 'Renamed';
    h.setPlan(good2);
    h.advance(RECOMPILE_DEBOUNCE_MS);
    expect(h.app.currentSignature()).toBe(planSignature(good2));
    expect(h.sink.dismissed).toBeGreaterThan(0);
  });
});
