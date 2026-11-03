// @vitest-environment happy-dom
/**
 * Walk-nav aids (issue #147 CP3; moved from the HUD to the Walk overlay
 * by #178, gaps G9 / G12): the live room readout and the Go-to-room list.
 *
 * Two layers, deliberately:
 *  - the Walk overlay in isolation (room pill naming, per-storey grouping
 *    of the Go-to-room menu, a pick runs the command), and
 *  - the full ViewerApp path through the UI sink: the readout reads the
 *    walker's ATTRIBUTED storey, the list carries every room, a pick
 *    teleports across storeys, and the readout clears when walk ends.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWalkOverlay, roomMenuItems } from '../../src/app/panels/walkOverlay';
import { Binder } from '../../src/app/panels/controls';
import { CommandRegistry, COMMAND_SPECS } from '../../src/app/commands';
import { getPose, resetWalkerLink } from '../../src/shared/walkerLink';
import type { FloorplanData } from '../../src/shared/schema';
import { bootViewer, type Harness } from './helpers/viewerHarness';

type Ring = [[number, number], [number, number], [number, number], [number, number]];
const ring = (x1: number, y1: number, x2: number, y2: number): Ring => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

function twoStoreyPlan(): FloorplanData {
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
          { id: 'living', name: 'Living', polygon: ring(0, 0, 6, 5), floorTexture: 'wood' },
          { id: 'kitchen', name: 'Kitchen', polygon: ring(0, 5, 3, 8), floorTexture: 'tile' },
        ],
        openings: [],
        furniture: [],
      },
      {
        id: 'floor-upper',
        name: 'Upper',
        elevation: 2.7,
        rooms: [{ id: 'belvedere', name: 'Belvedere', polygon: ring(0, 0, 4, 4), floorTexture: 'wood' }],
        openings: [],
        furniture: [],
      },
    ],
    stairs: [],
  } as unknown as FloorplanData;
}

describe('Walk overlay (issue #147 CP3 on the kit)', () => {
  const mk = () => {
    const pick = vi.fn();
    const registry = new CommandRegistry(
      COMMAND_SPECS.map((s) => (s.id === 'walk.gotoRoom' ? { ...s, run: (id?: unknown) => pick(id) } : { ...s })),
    );
    const overlay = mountWalkOverlay(new Binder(registry, () => 'walk'));
    document.body.appendChild(overlay.root);
    return { overlay, pick };
  };

  it('names the room pill after the walker room, Outside when null', () => {
    const { overlay } = mk();
    const pill = overlay.root.querySelector('[data-testid="ws-walk-pill"]')!;
    overlay.setRoom('Kitchen');
    expect(pill.getAttribute('aria-label')).toBe('Go to room: Kitchen');
    overlay.setRoom(null);
    expect(pill.getAttribute('aria-label')).toBe('Go to room: Outside');
    overlay.destroy();
  });

  it('groups the Go-to-room list per storey, one item per room', () => {
    const items = roomMenuItems(
      [
        { name: 'Ground', rooms: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
        { name: 'Empty', rooms: [] },
        { name: 'Upper', rooms: [{ id: 'c', name: 'C' }] },
      ],
      () => {},
    );
    expect(items.map((i) => ('heading' in i ? `#${i.heading}` : 'label' in i ? i.label : '-'))).toEqual([
      '#Ground', 'A', 'B', '#Upper', 'C',
    ]);
    expect(roomMenuItems([], () => {})).toEqual([{ heading: 'No rooms yet' }]);
  });

  it('a pick from the pill menu runs walk.gotoRoom with the room id', () => {
    const { overlay, pick } = mk();
    overlay.setRooms([{ name: 'Ground', rooms: [{ id: 'living', name: 'Living' }] }]);
    (overlay.root.querySelector('[data-testid="ws-walk-pill"]') as HTMLElement).click();
    (document.querySelector('[data-testid="ws-goto-living"]') as HTMLElement).click();
    expect(pick).toHaveBeenCalledWith('living');
    overlay.destroy();
  });
});

describe('viewer walk-nav aids end to end (issue #147 CP3)', () => {
  let h: Harness | null = null;
  afterEach(() => {
    h?.dispose();
    h = null;
    resetWalkerLink();
  });

  const place = async (x: number, y: number, floorIdx: number): Promise<void> => {
    h!.app.requestMode('walk', { autoLock: false, pose: { x, y, yawRad: 0, floorIdx, mode: 'walk' } });
    await h!.settle();
    h!.pump();
  };

  it('readout follows the walker storey; the list carries every room', async () => {
    h = bootViewer(twoStoreyPlan());
    h.pump();
    expect(h.sink.readouts.filter((r) => r !== null)).toEqual([]);
    expect(h.sink.roomLists.at(-1)).toEqual([
      { name: 'Ground', rooms: [{ id: 'living', name: 'Living' }, { id: 'kitchen', name: 'Kitchen' }] },
      { name: 'Upper', rooms: [{ id: 'belvedere', name: 'Belvedere' }] },
    ]);
    await place(4.25, 2.5, 0);
    expect(h.sink.readouts.at(-1)).toBe('Living');
    await place(1.5, 1.5, 1);
    expect(h.sink.readouts.at(-1)).toBe('Belvedere');
  });

  it('picking a room teleports across storeys and updates the readout', async () => {
    h = bootViewer(twoStoreyPlan());
    await place(1.5, 1.5, 0);
    expect(h.sink.readouts.at(-1)).toBe('Living');
    await h.app.gotoRoom('belvedere');
    h.pump();
    expect(getPose()?.floorIdx).toBe(1);
    expect(h.sink.readouts.at(-1)).toBe('Belvedere');
  });

  it('clears the readout when walk is left', async () => {
    h = bootViewer(twoStoreyPlan());
    await place(4.25, 2.5, 0);
    h.app.requestMode('overview');
    await h.settle();
    h.pump();
    expect(h.sink.readouts.at(-1)).toBeNull();
  });
});
