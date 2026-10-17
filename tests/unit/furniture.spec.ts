/**
 * Unit tests for the furniture model layer (pkg 3).
 * Covers: default footprints, rotated-extent correctness for non-square
 * rotations (AC5), containment judgment (AC4), clamp solver.
 */
import { describe, expect, it } from 'vitest';
import type { Room, Vec2 } from '../../src/shared/schema';
import {
  clampPoseIntoRoom,
  containedByRoom,
  FURNITURE_DEFAULTS,
  itemCorners,
  judgeContainment,
  pointInPolygon,
  rotatedExtent,
} from '../../src/editor/model/furniture';

function squareRoom(id = 'r', x0 = 0, y0 = 0, w = 5, h = 4): Room {
  return {
    id,
    name: id,
    polygon: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]],
    floorTexture: null,
  };
}

describe('defaults', () => {
  it('covers all seven types with sane footprints', () => {
    const expected = ['bed', 'sofa', 'table', 'chair', 'counter', 'bathtub', 'toilet'];
    for (const t of expected) {
      expect(FURNITURE_DEFAULTS[t], t).toBeDefined();
      expect(FURNITURE_DEFAULTS[t].footprint.every((d) => d > 0), t).toBe(true);
    }
    expect(Object.keys(FURNITURE_DEFAULTS)).toHaveLength(expected.length);
  });
});

describe('rotatedExtent (AC5)', () => {
  it('identity at 0°, swapped axes at 90° for non-square beds', () => {
    const bed: Vec2 = [1.6, 2.0];
    expect(rotatedExtent(bed, 0)).toEqual([1.6, 2.0]);
    const ninety = rotatedExtent(bed, 90);
    expect(ninety[0]).toBeCloseTo(2.0);
    expect(ninety[1]).toBeCloseTo(1.6);
  });

  it('computes diagonal AABB correctly at 45° for a 3-4-5-like rect', () => {
    // Rect 4 x 3 rotated 45°: AABB = (4cos45+3sin45, 4sin45+3cos45)
    const ext = rotatedExtent([4, 3], 45);
    const c = Math.SQRT1_2;
    expect(ext[0]).toBeCloseTo((4 + 3) * c);
    expect(ext[1]).toBeCloseTo((4 + 3) * c);
  });

  it('handles negative/unnormalized rotation via trig periodicity', () => {
    const a = rotatedExtent([1.6, 2.0], -90);
    expect(a[0]).toBeCloseTo(2.0);
    expect(a[1]).toBeCloseTo(1.6);
  });
});

describe('containment (AC4)', () => {
  it('all corners inside → ok', () => {
    const room = squareRoom();
    expect(containedByRoom([2.5, 2], [1, 1], 0, room)).toBe(true);
    expect(judgeContainment([2.5, 2], [1, 1], 0, room)).toBe('ok');
  });

  it('partially escaped with center inside → warn', () => {
    const room = squareRoom();
    // Sofa 2x0.9 centered at x=0.5 sticks out the west wall, center inside.
    expect(judgeContainment([0.5, 2], [2, 0.9], 0, room)).toBe('warn');
  });

  it('center outside any room → reject', () => {
    const room = squareRoom();
    expect(judgeContainment([10, 10], [1, 1], 0, room)).toBe('reject');
    expect(judgeContainment([10, 10], [1, 1], 0, undefined)).toBe('reject');
  });

  it('corner-touching poses remain legal within slack', () => {
    const room = squareRoom();
    // Chair 0.45² tucked exactly into the SW corner.
    expect(containedByRoom([0.225, 0.225], [0.45, 0.45], 0, room)).toBe(true);
  });

  it('corners reflect rotation in world space', () => {
    const item = {
      id: 'x', type: 'bed' as const, roomId: 'r',
      position: [0, 0] as Vec2, rotationDeg: 90, footprint: [1.6, 2.0] as Vec2,
    };
    const cs = itemCorners(item);
    // 90° CCW: x/y swap sign appropriately; extremes ≈ ±1.0 x, ±0.8 y
    expect(Math.max(...cs.map((p) => p[0]))).toBeCloseTo(1.0);
    expect(Math.max(...cs.map((p) => p[1]))).toBeCloseTo(0.8);
  });
});

describe('clamp solver', () => {
  it('pushes an overflowing pose back inside', () => {
    const room = squareRoom();
    const solved = clampPoseIntoRoom([0.1, 2], [1, 1], 0, room);
    expect(solved).not.toBeNull();
    expect(containedByRoom(solved!, [1, 1], 0, room)).toBe(true);
  });

  it('honors the ROTATED extent when clamping (AC5 tie-in)', () => {
    const room = squareRoom();
    // Bed 1.6x2.0 rotated 90° occupies 2.0 x 1.6; near south wall the
    // y-clearance demanded is 0.8 (not 1.0).
    const solved = clampPoseIntoRoom([2.5, 0.2], [1.6, 2.0], 90, room);
    expect(solved).not.toBeNull();
    expect(solved![1]).toBeGreaterThanOrEqual(0.8 - 1e-9);
    expect(containedByRoom(solved!, [1.6, 2.0], 90, room)).toBe(true);
  });

  it('returns null when the piece cannot physically fit', () => {
    const room = squareRoom('', 0, 0, 1, 1);
    expect(clampPoseIntoRoom([0.5, 0.5], [3, 3], 0, room)).toBeNull();
  });
});

describe('pointInPolygon sanity', () => {
  it('basic membership', () => {
    const poly: Vec2[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
    expect(pointInPolygon([2, 2], poly)).toBe(true);
    expect(pointInPolygon([5, 2], poly)).toBe(false);
  });
});
