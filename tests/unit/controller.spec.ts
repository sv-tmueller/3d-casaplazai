/**
 * Controller unit tests (DOM-free core): tool FSM, snapping, overlap eval.
 */
import { describe, expect, it } from 'vitest';
import {
  computeOverlaps,
  evaluateSnapCandidates,
  finalizeRectangle,
  rectCorners,
} from '../../src/editor/controller';
import { emptyPlan } from '../../src/editor/store';

describe('finalizeRectangle', () => {
  it('orders opposite corners into a CCW ring', () => {
    const poly = finalizeRectangle([0, 3], [4, 0]);
    expect(poly).toEqual([[0, 0], [4, 0], [4, 3], [0, 3]]);
  });

  it('works corner-order agnostic', () => {
    expect(finalizeRectangle([4, 0], [0, 3])).toEqual([[0, 0], [4, 0], [4, 3], [0, 3]]);
  });
});

describe('evaluateSnapCandidates', () => {
  const plan = (() => {
    const p = emptyPlan();
    p.rooms.push({
      id: 'room-a',
      name: 'A',
      polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
      floorTexture: null,
    });
    return p;
  })();

  it('magnetizes to a nearby foreign VERTEX', () => {
    const snapped = evaluateSnapCandidates(plan, [4.02, 2.97], 0.1, []);
    expect(snapped.point).toEqual([4, 3]);
    expect(snapped.snapped).toBe(true);
  });

  it('ignores the dragged room\'s own vertices', () => {
    const snapped = evaluateSnapCandidates(plan, [4.02, 2.97], 0.1, ['room-a']);
    expect(snapped.snapped).toBe(false);
  });

  it('projects onto a foreign EDGE when beyond vertex radius', () => {
    // Right edge of room-a runs x=4, y∈[0,3]; aim beside its midpoint.
    const snapped = evaluateSnapCandidates(plan, [4.05, 1.5], 0.1, []);
    expect(snapped.point).toEqual([4, 1.5]);
    expect(snapped.snapped).toBe(true);
  });

  it('reports unsnapped when far from everything', () => {
    const snapped = evaluateSnapCandidates(plan, [8, 8], 0.1, []);
    expect(snapped.snapped).toBe(false);
    expect(snapped.point).toEqual([8, 8]);
  });
});

describe('computeOverlaps', () => {
  it('flags two overlapping rooms, not disjoint ones', () => {
    const plan = emptyPlan();
    plan.rooms.push(
      { id: 'r1', name: '', polygon: [[0, 0], [2, 0], [2, 2], [0, 2]], floorTexture: null },
      { id: 'r2', name: '', polygon: [[1, 1], [3, 1], [3, 3], [1, 3]], floorTexture: null },
      { id: 'r3', name: '', polygon: [[10, 0], [12, 0], [12, 2], [10, 2]], floorTexture: null },
    );
    const overlaps = computeOverlaps(plan);
    expect(overlaps).toContainEqual(['r1', 'r2']);
    expect(overlaps).not.toContainEqual(['r1', 'r3']);
    expect(overlaps).not.toContainEqual(['r2', 'r3']);
  });

  it('touching (shared-wall) rooms are NOT overlaps', () => {
    const plan = emptyPlan();
    plan.rooms.push(
      { id: 'r1', name: '', polygon: [[0, 0], [2, 0], [2, 2], [0, 2]], floorTexture: null },
      { id: 'r2', name: '', polygon: [[2, 0], [4, 0], [4, 2], [2, 2]], floorTexture: null },
    );
    expect(computeOverlaps(plan)).toEqual([]);
  });
});

describe('rectCorners', () => {
  it('derives the four corners of an axis-aligned rectangle', () => {
    expect(rectCorners([1, 1], [3, 4])).toEqual([[1, 1], [3, 1], [3, 4], [1, 4]]);
  });
});
