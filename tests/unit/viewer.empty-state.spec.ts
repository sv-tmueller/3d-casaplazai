// @vitest-environment happy-dom
/**
 * Empty-plan state spec (issue #148): a plan with zero rooms anywhere is
 * a calm EMPTY STATE — sky/ground backdrop + centered prompt, Walk
 * parked — never an error toast. The first real room restores the
 * rendered scene; real validator failures still toast (once).
 *
 * Harness mirrors viewer.recompile.spec.ts (fake clock + swappable
 * bridge); the empty-plan path is the only variable under test.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isEmptyPlan,
  planSignature,
  ViewerApp,
  type DataBridge,
} from '../../src/viewer/appController';
import { emptyAdaptedScene } from '../../src/viewer/sceneBuilder';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';

/** A plan with not a single room on any storey (fresh profile). */
function emptyPlan(): FloorplanData {
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [],
    openings: [],
    furniture: [],
  }).data!;
}

function roomPlan(name = 'Big'): FloorplanData {
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [
      {
        id: 'big',
        name,
        polygon: [[0, 0], [6, 0], [6, 5], [0, 5]],
        floorTexture: 'wood',
      },
    ],
    openings: [],
    furniture: [],
  }).data!;
}

/** Valid rooms, one invalid door: fails the real validator (issue #6). */
function invalidPlan(): FloorplanData {
  const bad = roomPlan();
  bad.floors[0].openings.push({
    id: 'boom',
    kind: 'door',
    roomId: 'big',
    segmentIndex: 0,
    tCenter: 0.5,
    width: -1,
    sillHeight: 0,
    headHeight: 2.05,
  });
  return bad;
}

/** Happy-dom has no WebGL: stub the renderer factory seam. */
vi.mock('../../src/viewer/sceneBuilder', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/viewer/sceneBuilder')>();
  return {
    ...mod,
    makeRenderer: () => ({
      render: vi.fn(),
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      dispose: vi.fn(),
      domElement: undefined,
      shadowMap: {},
    }),
  };
});

interface Harness {
  app: ViewerApp;
  bridges: DataBridge[];
  pane: HTMLElement;
  advance: (ms: number) => void;
  pump: () => void;
  /** HUD nodes of THIS harness only (pane-scoped). */
  toasts: () => HTMLElement[];
  emptyStateEl: () => HTMLElement | null;
  toggle: () => HTMLButtonElement;
  stats: () => { emptyState?: boolean; meshCount?: number; wallOpacity?: number | null };
  dispose: () => void;
}

function boot(initial: FloorplanData): Harness {
  const bridges: DataBridge[] = [{ getData: () => initial }];
  const current = 0;
  const bridgeAt = (): DataBridge | undefined => bridges[current];

  const timers: Array<{ at: number; cb: () => void }> = [];
  let now = 0;
  const advance = (ms: number): void => {
    now += ms;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= now) {
        const cb = timers[i].cb;
        timers.splice(i, 1);
        cb();
      }
    }
  };
  const setTimeoutFn = ((cb: () => void, ms: number) => {
    timers.push({ at: now + ms, cb });
    return timers.length;
  }) as unknown as typeof window.setTimeout;

  const ticks: Array<(t: number) => void> = [];
  const pump = (): void => {
    for (const cb of [...ticks]) cb(now);
  };

  const pane = document.createElement('div');
  const canvas = document.createElement('canvas');
  pane.appendChild(canvas);
  document.body.appendChild(pane);

  const app = new ViewerApp({
    bridge: bridgeAt,
    canvas,
    pane,
    scheduleTick: (cb) => {
      ticks.push(cb);
      return () => {};
    },
    setTimeoutFn,
  });
  app.start();

  const scope = (): ParentNode => pane;
  return {
    app,
    bridges,
    pane,
    advance,
    pump,
    toasts: () => [...scope().querySelectorAll<HTMLElement>('.hud-toast')],
    emptyStateEl: () =>
      scope().querySelector<HTMLElement>('[data-testid="hud-empty-state"]'),
    toggle: () => scope().querySelector<HTMLButtonElement>('.hud-toggle')!,
    stats: () => {
      const win = window as unknown as {
        __viewerStats?: () => { emptyState?: boolean; meshCount?: number; wallOpacity?: number | null };
      };
      return win.__viewerStats?.() ?? {};
    },
    dispose: () => {
      app.dispose();
      pane.remove();
    },
  };
}

/** Poll the bridge once (250ms cadence + debounce), then let RAF run. */
function cycle(h: Harness, ms = 300): void {
  h.advance(ms);
  h.pump();
}

describe('viewer empty-plan state (issue #148)', () => {
  let h: Harness | null = null;
  afterEach(() => h?.dispose());

  it('classifies a room-less plan as empty on every storey', () => {
    expect(isEmptyPlan(emptyPlan())).toBe(true);
    expect(isEmptyPlan(roomPlan())).toBe(false);
    // Multi-storey: one room anywhere is enough to be non-empty.
    const twoFloors = emptyPlan();
    twoFloors.floors.push({ ...twoFloors.floors[0]!, id: 'second' });
    expect(isEmptyPlan(twoFloors)).toBe(true);
    twoFloors.floors[1]!.rooms.push({
      id: 'up',
      name: 'Up',
      polygon: [[0, 0], [3, 0], [3, 3], [0, 3]],
      floorTexture: 'wood',
    });
    expect(isEmptyPlan(twoFloors)).toBe(false);
  });

  it('hands sceneBuilder a neutral, geometry-free backdrop scene', () => {
    const adapted = emptyAdaptedScene();
    expect(adapted.buckets).toHaveLength(0);
    expect(adapted.triangleCount).toBe(0);
    // A finite, non-degenerate plot so the orbit frame has something
    // to fit and the shadow frustum stays valid.
    expect(adapted.bounds.maxX).toBeGreaterThan(adapted.bounds.minX);
    expect(adapted.bounds.maxY).toBeGreaterThan(adapted.bounds.minY);
    expect(Number.isFinite(adapted.bounds.minX)).toBe(true);
    expect(adapted.bounds.minX).toBe(-adapted.bounds.maxX);
    expect(adapted.bounds.minY).toBe(-adapted.bounds.maxY);
  });

  it('boots a fresh (room-less) profile into the empty state, no toast', () => {
    h = boot(emptyPlan());
    h.pump();

    expect(h.emptyStateEl()).not.toBeNull();
    expect(h.emptyStateEl()!.hidden).toBe(false);
    expect(h.emptyStateEl()!.textContent).toBe(
      'Draw a room in the plan to see it here',
    );
    expect(h.toasts()).toHaveLength(0);
    expect(h.toggle().disabled).toBe(true);
    expect(h.stats().emptyState).toBe(true);
    // The backdrop is scenery, not a plan: plan-parity probes must keep
    // reading as "nothing composed" (e2e boot waits gate on meshCount).
    expect(h.stats().meshCount).toBe(0);
    expect(h.stats().wallOpacity).toBeNull();
    expect(h.app.currentSignature()).toBeNull();
  });

  it('the first real room leaves the empty state and is accepted', () => {
    h = boot(emptyPlan());
    h.pump();
    expect(h.emptyStateEl()!.hidden).toBe(false);

    const plan = roomPlan();
    h.bridges.unshift({ getData: () => plan });
    cycle(h);

    expect(h.app.currentSignature()).toBe(planSignature(plan));
    expect(h.emptyStateEl()!.hidden).toBe(true);
    expect(h.toggle().disabled).toBe(false);
    expect(h.stats().emptyState).toBe(false);
    expect(h.toasts()).toHaveLength(0);
  });

  it('deleting the last room returns to the empty state without a toast', () => {
    h = boot(roomPlan());
    h.pump();
    expect(h.app.currentSignature()).toBe(planSignature(roomPlan()));

    h.bridges.unshift({ getData: () => emptyPlan() });
    cycle(h);

    expect(h.emptyStateEl()!.hidden).toBe(false);
    expect(h.toggle().disabled).toBe(true);
    expect(h.stats().emptyState).toBe(true);
    expect(h.toasts()).toHaveLength(0);
    // Nothing lingers to be reframed: the snapshot was cleared.
    expect(h.app.currentSignature()).toBeNull();
  });

  it('keeps one error toast for an invalid plan across poll cycles', () => {
    h = boot(roomPlan());
    h.pump();
    const goodSig = h.app.currentSignature();

    h.bridges.unshift({ getData: () => invalidPlan() });
    cycle(h);
    cycle(h); // a second cycle must NOT stack a duplicate node

    expect(h.app.currentSignature()).toBe(goodSig);
    expect(h.emptyStateEl()!.hidden).toBe(true);
    const nodes = h.toasts();
    expect(nodes).toHaveLength(1);
    // A good scene is still on screen, so the wording is the retained-view
    // one (unchanged by #148 — only its frequency changed) and the second
    // cycle folded into the same node instead of stacking a duplicate.
    expect(nodes[0]!.textContent).toContain('Recompile failed');
    expect(
      nodes[0]!.querySelector('[data-testid="hud-toast-count"]')?.textContent,
    ).toBe('×2');
    expect(h.stats().emptyState).toBe(false);
  });

  it('a valid plan clears the failure toast it superseded', () => {
    h = boot(roomPlan());
    h.pump();
    h.bridges.unshift({ getData: () => invalidPlan() });
    cycle(h);
    expect(h.toasts()).toHaveLength(1);

    const recovered = roomPlan('Renamed');
    h.bridges.unshift({ getData: () => recovered });
    cycle(h);

    expect(h.app.currentSignature()).toBe(planSignature(recovered));
    expect(h.toasts()).toHaveLength(0);
  });

  it('still reports a REAL validator failure while empty (once)', () => {
    h = boot(emptyPlan());
    h.pump();
    expect(h.toasts()).toHaveLength(0);

    h.bridges.unshift({ getData: () => invalidPlan() });
    cycle(h);
    cycle(h);

    expect(h.toasts()).toHaveLength(1);
    expect(h.toasts()[0]!.textContent).toContain('Cannot render plan');
    // The empty backdrop stays up under the toast (nothing was replaced).
    expect(h.emptyStateEl()!.hidden).toBe(false);
    expect(h.app.currentSignature()).toBeNull();
  });

  it('refuses a walk-mode request while there is nothing to walk in', () => {
    h = boot(emptyPlan());
    h.pump();

    h.app.requestMode('walk');
    cycle(h);

    // No rig swap happened, no walk affordance lit up, HUD stays calm.
    expect(h.stats().emptyState).toBe(true);
    expect(h.toggle().disabled).toBe(true);
    expect(h.toasts()).toHaveLength(0);
  });
});
