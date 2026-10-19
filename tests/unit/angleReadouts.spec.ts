/**
 * Issue #67 (Pkg 2) — live angle readouts. Pins the world-frame angle
 * helper (cardinal directions, quadrant signs, 359.x wrap — NEVER 360,
 * zero-length convention) and the PURE selector rows for each gesture
 * phase, plus the Dimensions visibility gate in the painter.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Room, Vec2 } from '../../src/shared/schema';
import { emptyPlan } from '../../src/editor/store';
import type { Camera, InteractionPhase } from '../../src/editor/controller';
import {
  segmentAngleDegrees,
} from '../../src/editor/model/angles';
import {
  angleReadoutLabels,
  paintAngleReadouts,
} from '../../src/editor/render/angleReadouts';

function mkRoom(id: string, polygon: Vec2[]): Room {
  return { id, name: id, polygon, floorTexture: null };
}

function plan(...rooms: Room[]): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = rooms;
  return p;
}

const CAM: Camera = { originX: 0, originY: 0, scale: 100 };

describe('segmentAngleDegrees — world frame (issue #67)', () => {
  it.each([
    ['east', 0, 0, 1, 0, 0],
    ['north', 0, 0, 0, 1, 90],
    ['west', 0, 0, -1, 0, 180],
    ['south', 0, 0, 0, -1, 270],
    ['NE', 0, 0, 1, 1, 45],
    ['NW', 0, 0, -1, 1, 135],
    ['SW', 0, 0, -1, -1, 225],
    ['SE (negative-dy quadrant)', 0, 0, 1, -1, 315],
  ])('%s -> %p deg', (_name, ax, ay, bx, by, expected) => {
    expect(segmentAngleDegrees(ax, ay, bx, by)).toBeCloseTo(expected, 9);
  });

  it('wraps slightly-negative results to 359.x — NEVER 360', () => {
    const deg = segmentAngleDegrees(0, 0, 1, -1e-9);
    expect(deg).toBeGreaterThan(359);
    expect(deg).toBeLessThan(360);
  });

  it('zero-length segment -> 0 deg', () => {
    expect(segmentAngleDegrees(2, 3, 2, 3)).toBe(0);
  });
});

describe('angleReadoutLabels — pure selector (issue #67)', () => {
  const sq = plan(mkRoom('r', [[0, 0], [4, 0], [4, 3], [0, 3]]));
  const idle: InteractionPhase = { tag: 'idle' };

  it('drawingRect: one row at corner1->cursor midpoint', () => {
    const phase: InteractionPhase = {
      tag: 'drawingRect',
      corner1: [0, 0],
      cursor: [1, 1],
    };
    const rows = angleReadoutLabels(sq, phase, null);
    expect(rows).toHaveLength(1);
    expect(rows[0].mid[0]).toBeCloseTo(0.5, 9);
    expect(rows[0].mid[1]).toBeCloseTo(0.5, 9);
    expect(rows[0].text).toBe('45.0°');
  });

  it('resizing: two rows at the dragged vertex\'s adjacent segment midpoints', () => {
    const phase: InteractionPhase = {
      tag: 'resizing',
      vertexIndex: 1,
      selectedRoomId: 'r',
    };
    const rows = angleReadoutLabels(sq, phase, null);
    expect(rows).toHaveLength(2);
    // prev segment (0,0)->(4,0): east wall, 0.0°, mid (2,0)
    expect(rows[0].mid).toEqual([2, 0]);
    expect(rows[0].text).toBe('0.0°');
    // next segment (4,0)->(4,3): north wall, 90.0°, mid (4,1.5)
    expect(rows[1].mid).toEqual([4, 1.5]);
    expect(rows[1].text).toBe('90.0°');
  });

  it('hoverSeg (opening ghost): one row at that segment midpoint', () => {
    const rows = angleReadoutLabels(sq, idle, { roomId: 'r', segIndex: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].mid).toEqual([2, 0]);
    expect(rows[0].text).toBe('0.0°');
  });

  it('idle with no hover: no rows', () => {
    expect(angleReadoutLabels(sq, idle, null)).toEqual([]);
  });

  it('unknown room / bad indices degrade to no rows', () => {
    const resizing: InteractionPhase = {
      tag: 'resizing',
      vertexIndex: 9,
      selectedRoomId: 'missing',
    };
    expect(angleReadoutLabels(sq, resizing, null)).toEqual([]);
    expect(angleReadoutLabels(sq, idle, { roomId: 'missing', segIndex: 0 })).toEqual([]);
    expect(angleReadoutLabels(sq, idle, { roomId: 'r', segIndex: 9 })).toEqual([]);
  });
});

describe('paintAngleReadouts — Dimensions gate (issue #67)', () => {
  /** Recording stub: proxies every ctx member; measures usage. */
  function recorderCtx(): { ctx: CanvasRenderingContext2D; ops: string[] } {
    const ops: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'measureText') {
            return () => ({
              width: 10,
              actualBoundingBoxAscent: 5,
              actualBoundingBoxDescent: 5,
            });
          }
          ops.push(String(prop));
          return () => {};
        },
        set() {
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, ops };
  }

  const drawing: InteractionPhase = {
    tag: 'drawingRect',
    corner1: [0, 0],
    cursor: [1, 1],
  };

  it('invisible: ZERO ctx operations (early return, mirrors badges)', () => {
    const { ctx, ops } = recorderCtx();
    paintAngleReadouts(ctx, CAM, plan(), drawing, null, false);
    expect(ops).toEqual([]);
  });

  it('visible with a live gesture paints (touches the canvas)', () => {
    const { ctx, ops } = recorderCtx();
    paintAngleReadouts(ctx, CAM, plan(), drawing, null, true);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops).toContain('fillText');
  });

  it('visible but idle draws NOTHING', () => {
    const { ctx, ops } = recorderCtx();
    paintAngleReadouts(ctx, CAM, plan(), { tag: 'idle' }, null, true);
    expect(ops).toEqual([]);
  });
});
