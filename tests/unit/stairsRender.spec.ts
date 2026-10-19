/**
 * Pkg 13.4 (issue #118) — stair painters. Pins the persistent stair
 * rendering (footprint outline + stepCount-1 tread ticks + uphill arrow),
 * the selected/multi-selected affordances, the ghost color contract
 * (GHOST_OK / GHOST_BAD), and the active-floor host filter that keeps
 * upper-storey flights out of the lower storey's canvas. Recording-2D-
 * context stub, the gridPitch.render.spec pattern.
 */
import { describe, expect, it } from 'vitest';
import type { Camera } from '../../src/editor/controller';
import type { FloorplanData, Room, Staircase } from '../../src/shared/schema';
import { paintScene, stairsOfActiveFloor } from '../../src/editor/render';
import { RecordingCtx } from './helpers/recordingContext';

const CAM: Camera = { originX: 0, originY: 5, scale: 20 };

const GROUND_ROOM: Room = {
  id: 'living',
  name: 'Living',
  polygon: [[0, 0], [5, 0], [5, 4], [0, 4]],
  floorTexture: null,
};

const UPPER_ROOM: Room = {
  id: 'loft',
  name: 'Loft',
  polygon: [[0, 0], [5, 0], [5, 4], [0, 4]],
  floorTexture: null,
};

function stair(patch: Partial<Staircase> = {}): Staircase {
  return {
    id: 'st-1',
    roomId: 'living',
    position: [2.5, 2],
    rotationDeg: 0,
    width: 1,
    run: 2.8,
    rise: 3,
    stepCount: 10,
    ...patch,
  };
}

/** Single-floor view (as glue hands paintScene: the ACTIVE storey only). */
function groundView(stairs: Staircase[]): FloorplanData {
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
        rooms: [GROUND_ROOM],
        openings: [],
        furniture: [],
      },
    ],
    stairs,
  };
}

function paint(
  plan: FloorplanData,
  selectedId: string | null = null,
  ghost: Parameters<typeof paintScene>[7] = null,
  multiSelectedIds: string[] = [],
): RecordingCtx {
  const ctx = new RecordingCtx();
  paintScene(
    ctx as unknown as CanvasRenderingContext2D,
    800,
    600,
    CAM,
    plan,
    { tag: 'idle' },
    null,
    ghost,
    null,
    null,
    selectedId,
    0.5,
    null,
    null,
    false,
    null,
    multiSelectedIds,
  );
  return ctx;
}

const countStyle = (ctx: RecordingCtx, style: string): number =>
  ctx.strokes.filter((s) => s.style === style).length;

const OUTLINE = '#64748b';
const TICK = '#94a3b8';
const ARROW = '#334155';
const SELECTED = '#e67e22';
const MULTI = '#7c3aed';
const GHOST_OK = 'rgba(46, 204, 113, 0.5)';
const GHOST_BAD = 'rgba(231, 76, 60, 0.5)';

describe('persistent stair painting (issue #118)', () => {
  it('draws outline + stepCount-1 tread ticks + uphill arrow', () => {
    const ctx = paint(groundView([stair()]));
    expect(countStyle(ctx, OUTLINE)).toBe(1);
    expect(countStyle(ctx, TICK)).toBe(9); // 10 steps -> 9 risers
    expect(countStyle(ctx, ARROW)).toBe(3); // shaft + 2 chevron legs
  });

  it('step count drives the tick count', () => {
    expect(countStyle(paint(groundView([stair({ stepCount: 4 })])), TICK)).toBe(3);
    expect(countStyle(paint(groundView([stair({ stepCount: 16 })])), TICK)).toBe(15);
  });

  it('selection paints the heavy amber outline (and no grey one)', () => {
    const ctx = paint(groundView([stair()]), 'st-1');
    expect(countStyle(ctx, SELECTED)).toBe(1);
    expect(countStyle(ctx, OUTLINE)).toBe(0);
  });

  it('marquee membership paints the violet outline', () => {
    const ctx = paint(groundView([stair()]), null, null, ['st-1']);
    expect(countStyle(ctx, MULTI)).toBe(1);
  });

  it('paints only stairs whose host room is on the shown floor', () => {
    const upper: Staircase = stair({ id: 'st-upper', roomId: 'loft', position: [2.5, 2] });
    const twoFloorView: FloorplanData = {
      ...groundView([stair(), upper]),
      floors: [
        ...groundView([]).floors,
        {
          id: 'floor-2',
          name: 'Floor 2',
          elevation: 3,
          rooms: [UPPER_ROOM],
          openings: [],
          furniture: [],
        },
      ],
    };
    // Two-floor view: both flights satisfy the host filter.
    expect(countStyle(paint(twoFloorView), OUTLINE)).toBe(2);
    // Active-floor view (ground only): ONLY the ground-hosted flight paints.
    expect(countStyle(paint(groundView([stair(), upper])), OUTLINE)).toBe(1);
  });

  it('stairsOfActiveFloor filters by host room', () => {
    const upper = stair({ id: 'st-upper', roomId: 'loft' });
    const view = groundView([stair(), upper]);
    expect(stairsOfActiveFloor(view).map((s) => s.id)).toEqual(['st-1']);
  });
});

describe('stair ghost (issue #118)', () => {
  it('valid candidate strokes in GHOST_OK green', () => {
    const ctx = paint(groundView([]), null, { kind: 'stairs', stair: stair(), valid: true });
    expect(countStyle(ctx, GHOST_OK)).toBe(1);
    expect(countStyle(ctx, GHOST_BAD)).toBe(0);
  });

  it('invalid candidate strokes in GHOST_BAD red', () => {
    const ctx = paint(groundView([]), null, { kind: 'stairs', stair: stair(), valid: false });
    expect(countStyle(ctx, GHOST_BAD)).toBe(1);
  });

  it('a stair-less ghost paints nothing stair-shaped', () => {
    const ctx = paint(groundView([]), null, { kind: 'stairs', valid: true });
    expect(countStyle(ctx, GHOST_OK) + countStyle(ctx, GHOST_BAD)).toBe(0);
  });
});
