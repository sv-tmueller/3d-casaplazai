/**
 * Issue #60 (Pkg 2) — per-wall length labels. Pins the run-merging
 * (interval union, NOT per-segment suppression: staggered shared walls
 * must print ONE maximal run), the px-threshold hiding and the single
 * "Dimensions" visibility gate (wall + room badges together).
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Room, Vec2 } from '../../src/shared/schema';
import { emptyPlan } from '../../src/editor/store';
import type { Camera } from '../../src/editor/controller';
import {
  paintMeasurementBadges,
  wallLengthLabels,
} from '../../src/editor/render/measurementBadges';

function mkRoom(id: string, polygon: Vec2[]): Room {
  return { id, name: id, polygon, floorTexture: null };
}

function plan(...rooms: Room[]): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = rooms;
  return p;
}

const CAM: Camera = { originX: 0, originY: 0, scale: 100 };

describe('wallLengthLabels — run merging (issue #60)', () => {
  it('emits ONE label for a fully-shared wall', () => {
    // bed shares PART of living's y=3 wall: the union is still one run.
    // bed is inset so no other wall pair is collinear (isolates the line).
    const p = plan(
      mkRoom('living', [[0, 0], [4, 0], [4, 3], [0, 3]]),
      mkRoom('bed', [[1, 3], [3, 3], [3, 7], [1, 7]]),
    );
    const labels = wallLengthLabels(p);
    const shared = labels.filter((l) => Math.abs(l.mid[1] - 3) < 1e-9);
    expect(shared).toHaveLength(1);
    expect(shared[0].lengthM).toBeCloseTo(4, 9);
    expect(shared[0].text).toBe('4.00 m');
  });

  it('emits ONE run label for a staggered 3.5m / 2.0m overlap', () => {
    // A's east wall (x=5, 0..3.5) and B's west wall (x=5, 1.0..3.0):
    // the union is 0..3.5 -> one "3.50 m" label, never a second "2.00 m".
    // B's horizontals (y=1.0, y=3.0) avoid A's (y=0, y=3.5) so x=5 is
    // the only merged line.
    const p = plan(
      mkRoom('a', [[2, 0], [5, 0], [5, 3.5], [2, 3.5]]),
      mkRoom('b', [[5, 1.0], [7, 1.0], [7, 3.0], [5, 3.0]]),
    );
    const onSharedLine = wallLengthLabels(p).filter(
      (l) => Math.abs(l.mid[0] - 5) < 1e-9,
    );
    expect(onSharedLine).toHaveLength(1);
    expect(onSharedLine[0].lengthM).toBeCloseTo(3.5, 9);
    expect(onSharedLine[0].text).toBe('3.50 m');
  });

  it('gives a freestanding wall its own label', () => {
    const labels = wallLengthLabels(
      plan(mkRoom('solo', [[0, 0], [4, 0], [4, 3], [0, 3]])),
    );
    expect(labels).toHaveLength(4); // four independent walls
    expect(labels.map((l) => l.text).sort()).toEqual([
      '3.00 m', '3.00 m', '4.00 m', '4.00 m',
    ]);
  });

  it('points the label normal away from the room', () => {
    const labels = wallLengthLabels(
      plan(mkRoom('solo', [[0, 0], [4, 0], [4, 3], [0, 3]])),
    );
    // South wall (y=0) label must sit BELOW the room (normal −y).
    const south = labels.find((l) => Math.abs(l.mid[1]) < 1e-9);
    expect(south).toBeDefined();
    expect(south!.normal[1]).toBeLessThan(0);
  });
});

/* ---------- rendering: px threshold + single visibility gate ---------- */

interface FakeCtx {
  ctx: CanvasRenderingContext2D;
  texts: string[];
}

function fakeCtx(): FakeCtx {
  const texts: string[] = [];
  const ctx = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    fill: () => {},
    stroke: () => {},
    roundRect: () => {},
    measureText: () => ({
      width: 40,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    }),
    fillText: (t: string) => {
      texts.push(t);
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

const ONE_METER = plan(mkRoom('tiny', [[0, 0], [1, 0], [1, 1], [0, 1]]));

describe('paintMeasurementBadges — hiding + toggle (issue #60)', () => {
  it('hides a wall label below the 60px screen threshold', () => {
    const small = fakeCtx();
    // 1 m * 30 px/m = 30 px < 60 px -> wall labels suppressed.
    paintMeasurementBadges(small.ctx, { ...CAM, scale: 30 }, ONE_METER);
    expect(small.texts.filter((t) => /^[\d.]+ m$/.test(t))).toHaveLength(0);
    // Room badge still drawn.
    expect(small.texts.some((t) => t.includes('m²'))).toBe(true);

    const big = fakeCtx();
    // 1 m * 100 px/m = 100 px -> four wall labels drawn.
    paintMeasurementBadges(big.ctx, CAM, ONE_METER);
    expect(big.texts.filter((t) => t === '1.00 m')).toHaveLength(4);
  });

  it('gates wall AND room badges behind one visible flag', () => {
    const hidden = fakeCtx();
    paintMeasurementBadges(hidden.ctx, CAM, ONE_METER, false);
    expect(hidden.texts).toHaveLength(0);

    const shown = fakeCtx();
    paintMeasurementBadges(shown.ctx, CAM, ONE_METER);
    expect(shown.texts.length).toBeGreaterThan(0);
    expect(shown.texts.some((t) => t.includes('m²'))).toBe(true);
  });

  it('defaults to visible when the flag is omitted', () => {
    const dflt = fakeCtx();
    paintMeasurementBadges(dflt.ctx, CAM, ONE_METER);
    const off = fakeCtx();
    paintMeasurementBadges(off.ctx, CAM, ONE_METER, true);
    expect(dflt.texts).toEqual(off.texts);
  });
});
