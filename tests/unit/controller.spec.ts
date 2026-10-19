/**
 * Controller unit tests (DOM-free core): tool FSM, snapping, overlap eval.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyCorner,
  computeOverlaps,
  evaluateSnapCandidates,
  finalizeRectangle,
  rectCorners,
  resizeHandleAt,
} from '../../src/editor/controller';
import { vecAdd, vecSub, type Pt } from '../../src/editor/geom';
import { emptyPlan } from '../../src/editor/store';
import type { Room } from '../../src/shared/schema';

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
    p.floors[0].rooms.push({
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
    plan.floors[0].rooms.push(
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
    plan.floors[0].rooms.push(
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

describe('drag anchor math (regression: interior grab jumped the room)', () => {
  it('grabbing the CENTER leaves the room stationary; dragging moves it by exactly the cursor delta', () => {
    // Contract: grabOffset = anchor(vertex0) - grabPoint, and the drag loop
    // targets anchor = worldPt + grabOffset. Net: vertex0 tracks cursor
    // displacement 1:1 with zero initial jump.
    const poly: Pt[] = [[0, 0], [3, 0], [3, 3], [0, 3]];
    const grabPoint: Pt = [1.5, 1.5]; // interior
    const grabOffset = vecSub(poly[0], grabPoint); // [-1.5, -1.5]
    // Cursor moves +1 east, 0.5 south (south = NEGATIVE y) from the grab point:
    const newCursor: Pt = [grabPoint[0] + 1, grabPoint[1] - 0.5];
    const desiredAnchor = vecAdd(newCursor, grabOffset); // [1, -0.5]
    const delta = vecSub(desiredAnchor, poly[0]); // [1, -0.5]
    const moved = poly.map((p) => vecAdd(p, delta));
    // Whole polygon translated by exactly the cursor delta — no jump.
    expect(moved[0]).toEqual([1, -0.5]);
    expect(moved[2]).toEqual([4, 2.5]);
  });
});

/* --------------- issue #53: resize-handle picking + corner cursor --------- */

const RECT: Room = {
  id: 'r',
  name: 'R',
  polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
  floorTexture: null,
};

describe('resizeHandleAt rectangle path (#53)', () => {
  it('returns the vertex index when the point is within tolerance', () => {
    expect(resizeHandleAt([0.1, 0.1], RECT, 0.3)).toBe(0);
    expect(resizeHandleAt([3.95, 2.9], RECT, 0.3)).toBe(2);
    expect(resizeHandleAt([0.05, 2.9], RECT, 0.3)).toBe(3);
  });

  it('returns null for an interior point or a miss outside tolerance', () => {
    expect(resizeHandleAt([2, 1.5], RECT, 0.3)).toBeNull();
    expect(resizeHandleAt([4.6, 0], RECT, 0.3)).toBeNull();
  });
});

describe('classifyCorner (#53)', () => {
  it('maps NW/SE to nwse and NE/SW to nesw', () => {
    // World SW (0,0) = screen bottom-left -> anti-diagonal.
    expect(classifyCorner([0, 0], RECT)).toBe('nesw-resize');
    // World SE (4,0) = screen bottom-right -> main diagonal.
    expect(classifyCorner([4, 0], RECT)).toBe('nwse-resize');
    // World NE (4,3) = screen top-right -> anti-diagonal.
    expect(classifyCorner([4, 3], RECT)).toBe('nesw-resize');
    // World NW (0,3) = screen top-left -> main diagonal.
    expect(classifyCorner([0, 3], RECT)).toBe('nwse-resize');
  });

  it('returns null for a degenerate corner on the bbox centre axes', () => {
    const degenerate: Room = {
      id: 'd',
      name: 'D',
      polygon: [[0, 0], [4, 0], [4, 4], [0, 4]],
      floorTexture: null,
    };
    // Centre column corner (x == centre) -> no diagonal.
    expect(classifyCorner([2, 0], degenerate)).toBeNull();
  });
});
