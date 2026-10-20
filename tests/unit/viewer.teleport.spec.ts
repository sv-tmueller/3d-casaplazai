// @vitest-environment happy-dom
/**
 * Walker teleports from the 2D pane (issue #147 CP2): the viewer
 * subscribes to walkerLink commands, seats walk mode WITHOUT requesting
 * pointer lock, teleports the rig to the requested pose/storey, and
 * publishes the resulting pose back for the editor glyph.
 *
 * The pointer-lock assertion is the load-bearing one (AC: "the pointer
 * lock is not requested until the user clicks the 3D pane"): the
 * pre-#147 wiring would have used the Walk-button path, which calls
 * requestLock as a user gesture.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ViewerApp,
  type DataBridge,
} from '../../src/viewer/appController';
import {
  getPose,
  hasViewerSubscriber,
  resetWalkerLink,
  sendCommand,
  subscribePose,
} from '../../src/shared/walkerLink';
import { EYE_HEIGHT } from '../../src/viewer/types';
import type { FloorplanData } from '../../src/shared/schema';

/** Happy-dom has no WebGL: stub the renderer factory seam. */
vi.mock('../../src/viewer/sceneBuilder', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('../../src/viewer/sceneBuilder')>();
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

/**
 * Two-storey home: ground living + kitchen, one upper room whose
 * footprint overlaps the ground floor's (the stacked-storey case that
 * breaks z-naive attribution).
 */
function twoStoreyPlan(): FloorplanData {
  const ring = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): [[number, number], [number, number], [number, number], [number, number]] => [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];
  return {
    schemaVersion: 2,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    floors: [
      {
        id: 'floor-ground',
        name: 'Ground',
        elevation: 0,
        rooms: [
          {
            id: 'living',
            name: 'Living',
            polygon: ring(0, 0, 6, 5),
            floorTexture: 'wood',
          },
          {
            id: 'kitchen',
            name: 'Kitchen',
            polygon: ring(0, 5, 3, 8),
            floorTexture: 'tile',
          },
        ],
        openings: [],
        furniture: [],
      },
      {
        id: 'floor-upper',
        name: 'Upper',
        elevation: 2.7,
        rooms: [
          {
            id: 'belvedere',
            name: 'Belvedere',
            polygon: ring(0, 0, 4, 4),
            floorTexture: 'wood',
          },
        ],
        openings: [],
        furniture: [],
      },
    ],
    stairs: [],
  } as unknown as FloorplanData;
}

interface Harness {
  app: ViewerApp;
  canvas: HTMLCanvasElement;
  pump: () => void;
  requestLock: ReturnType<typeof vi.fn>;
  dispose: () => void;
}

function boot(initial: FloorplanData): Harness {
  const bridge: DataBridge = {
    getData: () => initial,
    getCurrent: () => initial,
  };

  const timers: Array<{ at: number; cb: () => void }> = [];
  const now = 0;
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

  const requestLock = vi.fn();
  (canvas as unknown as { requestPointerLock: unknown }).requestPointerLock =
    requestLock;

  const app = new ViewerApp({
    bridge: () => bridge,
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
    canvas,
    pump,
    requestLock,
    dispose: () => {
      app.dispose();
      pane.remove();
    },
  };
}

/** Wait out the mode-swap fade (hud.playFade uses real 320 ms timers). */
async function settleFade(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 420));
}

describe('walker teleports from the plan (issue #147 CP2)', () => {
  let h: Harness | null = null;
  afterEach(() => {
    h?.dispose();
    h = null;
    resetWalkerLink();
  });

  it('registers as a viewer subscriber for the editor C-key gate', () => {
    h = boot(twoStoreyPlan());
    expect(hasViewerSubscriber()).toBe(true);
    h.dispose();
    h = null;
    expect(hasViewerSubscriber()).toBe(false);
  });

  it('publishes no pose while the walker does not exist', () => {
    h = boot(twoStoreyPlan());
    h.pump();
    expect(getPose()).toBeNull();

    // A late editor subscriber must not receive a stale pose either:
    // subscribing replays only a LIVE pose, so "no walker" means no
    // callback at all (the editor's initial state is already glyph-less).
    const seen: Array<unknown> = [];
    subscribePose((pose) => seen.push(pose));
    expect(seen).toEqual([]);
  });

  it('seats walk without pointer lock and follows the place command', async () => {
    h = boot(twoStoreyPlan());
    h.pump();

    sendCommand({ kind: 'place', x: 4.25, y: 2.5, yaw: 0.6, floorIdx: 1 });
    await settleFade();
    h.pump();

    const pose = getPose();
    expect(pose).not.toBeNull();
    expect(pose?.mode).toBe('walk');
    expect(pose?.x).toBeCloseTo(4.25, 6);
    expect(pose?.y).toBeCloseTo(2.5, 6);
    expect(pose?.yawRad).toBeCloseTo(0.6, 6);
    expect(pose?.floorIdx).toBe(1);

    // AC: the teleport path must not ask for pointer lock.
    expect(h.requestLock).not.toHaveBeenCalled();

    // The rig materialised on the TARGET storey, not the ground floor.
    const stats = (
      window as unknown as Record<string, () => { posZ?: number } | null>
    ).__viewerCam?.() as { posZ?: number } | undefined;
    expect(stats?.posZ).toBeCloseTo(2.7 + EYE_HEIGHT, 3);
  });

  it('goto-room resolves the room storey and spawns inside that room', async () => {
    h = boot(twoStoreyPlan());
    h.pump();

    sendCommand({ kind: 'gotoRoom', roomId: 'belvedere' });
    await settleFade();
    h.pump();

    const pose = getPose();
    expect(pose?.floorIdx).toBe(1);
    expect(pose?.x).toBeGreaterThan(0);
    expect(pose?.x).toBeLessThan(4);
    expect(pose?.y).toBeGreaterThan(0);
    expect(pose?.y).toBeLessThan(4);
    expect(h.requestLock).not.toHaveBeenCalled();
  });

  it('ignores an unknown room without moving the walker', async () => {
    h = boot(twoStoreyPlan());
    h.pump();

    sendCommand({ kind: 'place', x: 2, y: 2, yaw: 0, floorIdx: 0 });
    await settleFade();
    h.pump();
    const placed = getPose();

    sendCommand({ kind: 'gotoRoom', roomId: 'does-not-exist' });
    await settleFade();
    h.pump();
    expect(getPose()?.x).toBeCloseTo(placed!.x, 6);
    expect(getPose()?.y).toBeCloseTo(placed!.y, 6);
  });

  it('retracts the pose when walk mode is left', async () => {
    h = boot(twoStoreyPlan());
    h.pump();

    sendCommand({ kind: 'place', x: 2, y: 2, yaw: 0, floorIdx: 0 });
    await settleFade();
    h.pump();
    expect(getPose()).not.toBeNull();

    h.app.requestMode('overview');
    await settleFade();
    h.pump();
    expect(getPose()).toBeNull();
  });
});
