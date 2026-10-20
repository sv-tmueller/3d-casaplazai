// @vitest-environment happy-dom
/**
 * Walk-nav aids in the viewer HUD (issue #147 CP3): the live room
 * readout and the "Go to room…" picker.
 *
 * Two layers, deliberately:
 *  - the HUD helpers in isolation (DOM construction, write-on-change
 *    semantics, picker rebuild + reset), and
 *  - the full ViewerApp path (the same harness viewer.teleport.spec.ts
 *    uses): a placed walker drives the readout, and a picker choice
 *    rides the walkerLink command feed to a cross-storey teleport.
 * The second layer is the AC-bearing one — it proves the readout reads
 * the walker's ATTRIBUTED storey, not the plan's ground floor.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHud,
  onBindGotoRoom,
  populateRoomPicker,
  reflectRoomReadout,
  type HudHandles,
} from '../../src/viewer/hud';
import {
  ViewerApp,
  type DataBridge,
} from '../../src/viewer/appController';
import {
  getPose,
  resetWalkerLink,
  sendCommand,
} from '../../src/shared/walkerLink';
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
 * footprint OVERLAPS the ground floor's — the stacked-storey case that
 * breaks z-naive attribution (same fixture shape as CP2's spec).
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
    wallThickness: 0.2,
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

function mountHud(): { handles: HudHandles; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { handles: buildHud(host), host };
}

describe('HUD walk-nav helpers (issue #147 CP3)', () => {
  it('starts hidden: no walker ⇒ no room claim', () => {
    const { handles, host } = mountHud();
    expect(handles.roomReadout.hidden).toBe(true);
    expect(handles.roomReadout.textContent).toBe('');
    host.remove();
  });

  it('reflects a room name and hides again on null', () => {
    const { handles, host } = mountHud();
    reflectRoomReadout(handles, 'Kitchen');
    expect(handles.roomReadout.hidden).toBe(false);
    expect(handles.roomReadout.textContent).toBe('Kitchen');
    // "Outside" is a real readout (a walker with no room); only null,
    // meaning no walker at all, clears it.
    reflectRoomReadout(handles, 'Outside');
    expect(handles.roomReadout.textContent).toBe('Outside');
    reflectRoomReadout(handles, null);
    expect(handles.roomReadout.hidden).toBe(true);
    expect(handles.roomReadout.textContent).toBe('');
    host.remove();
  });

  it('builds one optgroup per storey and one option per room', () => {
    const { handles, host } = mountHud();
    populateRoomPicker(handles, [
      {
        name: 'Ground',
        rooms: [
          { id: 'living', name: 'Living' },
          { id: 'kitchen', name: 'Kitchen' },
        ],
      },
      { name: 'Upper', rooms: [{ id: 'belvedere', name: 'Belvedere' }] },
    ]);
    expect(handles.gotoRoomSelect.disabled).toBe(false);
    const groups = [...handles.gotoRoomSelect.querySelectorAll('optgroup')];
    expect(groups.map((g) => g.label)).toEqual(['Ground', 'Upper']);
    const options = [
      ...handles.gotoRoomSelect.querySelectorAll('option'),
    ].filter((o) => o.value !== '');
    expect(options.map((o) => o.value)).toEqual([
      'living',
      'kitchen',
      'belvedere',
    ]);
    expect(options.map((o) => o.textContent)).toEqual([
      'Living',
      'Kitchen',
      'Belvedere',
    ]);
    host.remove();
  });

  it('disables the picker for a plan without rooms', () => {
    const { handles, host } = mountHud();
    populateRoomPicker(handles, []);
    expect(handles.gotoRoomSelect.disabled).toBe(true);
    host.remove();
  });

  it('fires on pick and resets to the placeholder (re-pick re-fires)', () => {
    const { handles, host } = mountHud();
    populateRoomPicker(handles, [
      { name: 'Upper', rooms: [{ id: 'belvedere', name: 'Belvedere' }] },
    ]);
    const seen: string[] = [];
    const off = onBindGotoRoom(handles, (roomId) => seen.push(roomId));

    handles.gotoRoomSelect.value = 'belvedere';
    handles.gotoRoomSelect.dispatchEvent(new Event('change'));
    // Placeholder selected again, so choosing the same room twice works.
    expect(handles.gotoRoomSelect.value).toBe('');
    handles.gotoRoomSelect.value = 'belvedere';
    handles.gotoRoomSelect.dispatchEvent(new Event('change'));
    expect(seen).toEqual(['belvedere', 'belvedere']);

    off();
    handles.gotoRoomSelect.value = 'belvedere';
    handles.gotoRoomSelect.dispatchEvent(new Event('change'));
    expect(seen).toEqual(['belvedere', 'belvedere']); // unbound
    host.remove();
  });
});

interface Harness {
  app: ViewerApp;
  pane: HTMLElement;
  pump: () => void;
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
    pane,
    pump,
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

const readout = (pane: HTMLElement): HTMLSpanElement => {
  const el = pane.querySelector<HTMLSpanElement>(
    '[data-testid="hud-room-readout"]',
  );
  if (!el) throw new Error('hud-room-readout missing');
  return el;
};

const picker = (pane: HTMLElement): HTMLSelectElement => {
  const el = pane.querySelector<HTMLSelectElement>(
    '[data-testid="hud-goto-room"]',
  );
  if (!el) throw new Error('hud-goto-room missing');
  return el;
};

describe('viewer walk-nav aids end to end (issue #147 CP3)', () => {
  let h: Harness | null = null;
  afterEach(() => {
    h?.dispose();
    h = null;
    resetWalkerLink();
  });

  it('readout follows the walker storey; picker lists every room', async () => {
    h = boot(twoStoreyPlan());
    h.pump();
    expect(readout(h.pane).hidden).toBe(true);

    // Populated from the ACCEPTED plan (start() ran refreshAdaptation).
    expect(picker(h.pane).disabled).toBe(false);
    expect(
      [...picker(h.pane).querySelectorAll('option')].map((o) => o.value),
    ).toEqual(['', 'living', 'kitchen', 'belvedere']);

    // Ground-floor placement reads the ground room…
    sendCommand({ kind: 'place', x: 4.25, y: 2.5, yaw: 0.6, floorIdx: 0 });
    await settleFade();
    h.pump();
    expect(readout(h.pane).hidden).toBe(false);
    expect(readout(h.pane).textContent).toBe('Living');

    // …and the stacked upper room wins once the walker moves upstairs
    // (the same x/y footprint deliberately overlaps the ground floor).
    sendCommand({ kind: 'place', x: 1.5, y: 1.5, yaw: 0, floorIdx: 1 });
    await settleFade();
    h.pump();
    expect(readout(h.pane).textContent).toBe('Belvedere');
  });

  it('picking a room teleports the walker there and updates the readout', async () => {
    h = boot(twoStoreyPlan());
    h.pump();

    // Seat the walker downstairs first, so the storey SWITCH is the thing
    // under test (AC: "switching floors as needed").
    sendCommand({ kind: 'place', x: 1.5, y: 1.5, yaw: 0, floorIdx: 0 });
    await settleFade();
    h.pump();
    expect(readout(h.pane).textContent).toBe('Living');
    expect(getPose()?.floorIdx).toBe(0);

    picker(h.pane).value = 'belvedere';
    picker(h.pane).dispatchEvent(new Event('change'));
    await settleFade();
    h.pump();

    expect(getPose()?.floorIdx).toBe(1);
    expect(readout(h.pane).textContent).toBe('Belvedere');
    // Teleports never grab the pointer (CP2 semantics, shared feed).
    expect(picker(h.pane).value).toBe('');
  });

  it('hides the readout again when walk mode is left', async () => {
    h = boot(twoStoreyPlan());
    h.pump();
    sendCommand({ kind: 'place', x: 4.25, y: 2.5, yaw: 0, floorIdx: 0 });
    await settleFade();
    h.pump();
    expect(readout(h.pane).hidden).toBe(false);

    h.app.requestMode('overview');
    await settleFade();
    h.pump();
    expect(readout(h.pane).hidden).toBe(true);
  });
});
