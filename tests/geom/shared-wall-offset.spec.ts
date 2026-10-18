/**
 * Issue #36 — compiler-level proof that a shared wall drawn a few
 * millimeters off still pairs: the mirror row derived for the offset
 * neighbour compiles to a hole in BOTH rooms' wall slabs, so a straight
 * walk passes through the shared doorway. Mirrors the passage assertion
 * in tests/geom/connectivity.spec.ts, but with a NOT-exactly-coincident
 * (5 mm) shared wall.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Opening, Room } from '../../src/shared/schema';
import { buildCollisions, segmentHitsBoxes } from '../../src/geom/collision';
import { derivePairRows } from '../../src/editor/model/openings';

function room(
  id: string,
  x0: number,
  y0: number,
  w: number,
  h: number,
): Room {
  return {
    id,
    name: id,
    polygon: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]],
    floorTexture: null,
  };
}

/** Two rooms sharing the wall near x=4, kitchen shifted +5 mm east. */
function offsetSharedPlan(openings: Opening[]): FloorplanData {
  return {
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [room('living', 0, 0, 4, 4), room('kitchen', 4.005, 0, 3, 4)],
    openings,
    furniture: [],
  };
}

describe('geom shared-wall offset (#36): pairing survives a 5 mm gap', () => {
  it('derived mirror rows carve a passage through BOTH walls', () => {
    const base = offsetSharedPlan([]);
    // Door on living's east wall (seg 1: (4,0)->(4,4)), mid-span.
    const rows = derivePairRows(base, {
      roomId: 'living',
      segmentIndex: 1,
      tCenter: 0.5,
    });
    // The offset neighbour must pair — two rows, mirror on kitchen seg 3.
    expect(rows).toHaveLength(2);
    expect(rows[1].roomId).toBe('kitchen');
    expect(rows[1].segmentIndex).toBe(3);

    const w = 0.9;
    const openings: Opening[] = rows.map((r, i) => ({
      id: `door-${i}`,
      roomId: r.roomId,
      kind: 'door',
      segmentIndex: r.segmentIndex,
      tCenter: r.tCenter,
      width: w,
      sillHeight: 0,
      headHeight: 2.05,
    }));

    const boxes = buildCollisions(offsetSharedPlan(openings));
    // Walk east-west at y=2 (inside both door mouths): open in both walls.
    expect(segmentHitsBoxes(3, 2, 5.5, 2, boxes)).toBe(false);
    // Same walk at y=1 (wall pier below the doors): blocked.
    expect(segmentHitsBoxes(3, 1, 5.5, 1, boxes)).toBe(true);
  });
});
