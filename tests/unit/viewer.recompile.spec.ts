// @vitest-environment happy-dom
/**
 * Recompile pipeline spec (issue #6): the debounced bridge poll must
 * reflect unsaved editor edits, and an INVALID intermediate plan must
 * retain the last-good scene (toast, no crash).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { planSignature, ViewerApp, type DataBridge } from '../../src/viewer/appController';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';

function basePlan(): FloorplanData {
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [
      {
        id: 'big',
        name: 'Big',
        polygon: [[0, 0], [6, 0], [6, 5], [0, 5]],
        floorTexture: 'wood',
      },
    ],
    openings: [],
    furniture: [],
  }).data!;
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
  advance: (ms: number) => void;
  pump: () => void;
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
  return {
    app,
    bridges,
    advance,
    pump,
    dispose: () => {
      app.dispose();
      pane.remove();
    },
  };
}

describe('viewer recompile pipeline', () => {
  let h: Harness | null = null;
  afterEach(() => h?.dispose());

  it('boots on the initial plan and adapts it', () => {
    h = boot(basePlan());
    h.pump();
    expect(h.app.currentSignature()).toBe(planSignature(basePlan()));
  });

  it('reflects an UNSAVED editor edit after the 250ms debounce', () => {
    h = boot(basePlan());
    h.pump();
    const sigBefore = h.app.currentSignature();

    // Editor mutates (unsaved): swap the plan the bridge hands out.
    const edited = basePlan();
    edited.floors[0].rooms[0].polygon = [[0, 0], [8, 0], [8, 5], [0, 5]];
    h.bridges.unshift({ getData: () => edited });
    h.advance(300); // > RECOMPILE_DEBOUNCE_MS
    h.pump();

    expect(h.app.currentSignature()).toBe(planSignature(edited));
    expect(sigBefore).not.toBe(h.app.currentSignature());
  });

  it('INVALID intermediate retains the last-good scene with a toast', () => {
    h = boot(basePlan());
    h.pump();
    const goodSig = h.app.currentSignature();

    // Break the plan: negative width opening violates the schema.
    const bad = basePlan();
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
    h.bridges.unshift({ getData: () => bad });
    h.advance(300);
    h.pump();

    // Signature stays pinned to the last GOOD plan.
    expect(h.app.currentSignature()).toBe(goodSig);
    // Toast surfaced.
    const toasts = [...document.querySelectorAll('.hud-toast')];
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('recovers when the bridge returns a valid plan again', () => {
    h = boot(basePlan());
    h.pump();

    const bad = basePlan();
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
    h.bridges.unshift({ getData: () => bad });
    h.advance(300);
    h.pump();

    const good2 = basePlan();
    good2.floors[0].rooms[0].name = 'Renamed';
    h.bridges.unshift({ getData: () => good2 });
    h.advance(300);
    h.pump();

    expect(h.app.currentSignature()).toBe(planSignature(good2));
  });
});
