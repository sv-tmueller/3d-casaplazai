/**
 * Collision-resolver spec (issue #6): head-on stop, tangent slide,
 * doorway passage, corner-pocket depenetration.
 */

import { describe, expect, it } from 'vitest';
import {
  ejectPoint,
  moveDisc,
  moveDiscStepped,
  pointInside,
} from '../../src/viewer/collision';
import type { CollisionBox } from '../../src/viewer/types';

const WALL_X: CollisionBox = { minX: 4.76, minY: -10, maxX: 5.24, maxY: 10 };
const SIDE_WALL_Y: CollisionBox = { minX: -10, minY: 2.76, maxX: 10, maxY: 3.24 };
const CORNER_BOX: CollisionBox = { minX: 4.76, minY: 2.76, maxX: 5.24, maxY: 3.24 };

describe('moveDisc — head-on wall stop', () => {
  it('stops the walker flush against the wall face', () => {
    const out = moveDisc(3, 1, 3, 0, 1, [WALL_X], 0.3);
    expect(out.x).toBeCloseTo(WALL_X.minX, 6);
    expect(out.vx).toBe(0);
    expect(out.collided).toBe(true);
  });
});

describe('moveDisc — tangent slide', () => {
  it('slides along the wall carrying FULL tangential displacement', () => {
    // Diagonal velocity into the wall (vx=6 covers the 1.76 m to the face
    // within dt=0.5): x-component dies at the face, y travels the full dt.
    const dt = 0.5;
    const out = moveDisc(3, 1, 6, 2, dt, [WALL_X], 0.3);
    expect(out.x).toBeCloseTo(WALL_X.minX, 6);
    expect(out.y).toBeCloseTo(1 + 2 * dt, 6);
    expect(out.vx).toBe(0);
    expect(out.vy).toBe(2);
  });

  it('slides along a y-oriented wall killing only vy', () => {
    const out = moveDisc(0, 2, 1.5, 4, 0.25, [SIDE_WALL_Y], 0.3);
    expect(out.y).toBe(SIDE_WALL_Y.minY);
    expect(out.vy).toBe(0);
    expect(out.vx).toBe(1.5);
  });
});

describe('moveDisc — doorway passage', () => {
  it('passes through a 0.9m door gap unimpeded', () => {
    // Walls flank a doorway gap x∈[2, 2.9].
    const leftJamb: CollisionBox = { minX: -10, minY: -10, maxX: 2, maxY: 10 };
    const rightJamb: CollisionBox = { minX: 2.9, minY: -10, maxX: 10, maxY: 10 };
    // Walk straight through the middle of the gap.
    const out = moveDiscStepped(2.45, 0, 0, 3, 1, [leftJamb, rightJamb], 0.3);
    expect(out.y).toBeGreaterThan(0.9);
    expect(out.collided).toBe(false);
  });
});

describe('moveDisc — corner pockets', () => {
  it('ejects diagonally from a corner box along the shallower axis', () => {
    const out = moveDisc(5.0, 3.0, 1, 1, 0.1, [CORNER_BOX], 0.3);
    const insideStill = pointInside(CORNER_BOX, out.x, out.y);
    expect(insideStill).toBe(false);
    expect(out.collided).toBe(true);
  });

  it('ejectPoint picks the x-axis when x-penetration is smaller', () => {
    const ej = ejectPoint(CORNER_BOX, 5.0, 3.0);
    expect(ej.axis).toBe('x');
  });
});

describe('moveDisc — safety rails', () => {
  it('negative dt is treated as zero movement', () => {
    const out = moveDisc(1, 1, 5, 5, -1, [], 0.3);
    expect(out.x).toBe(1);
    expect(out.y).toBe(1);
  });

  it('huge dt is clamped to prevent tunneling', () => {
    const out = moveDisc(1, 1, 100, 0, 999, [WALL_X], 0.3);
    expect(pointInside(WALL_X, out.x, out.y)).toBe(false);
  });
});
