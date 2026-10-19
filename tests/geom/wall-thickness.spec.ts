/**
 * Issue #45 — wall slabs must be FULL-thickness prisms.
 *
 * Regression for the compile bug where buildRoomWalls passed the negated
 * TANGENT where buildSlab expects the OUTWARD NORMAL, collapsing every
 * wall to a zero-thickness sheet stretched along its own length. The
 * checks below fail hard on that geometry and pass only when slabs
 * genuinely straddle their polygon edge by ±wallThickness/2.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Room } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { buildRoomWalls } from '../../src/geom/compile';
import { buildCollisions, segmentHitsBoxes } from '../../src/geom/collision';
import { derivePairRows } from '../../src/editor/model/openings';

const W = 0.24;

function room(id: string, x0: number, y0: number, w: number, h: number): Room {
  return {
    id,
    name: id,
    polygon: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]],
    floorTexture: null,
  };
}

function squarePlan(): FloorplanData {
  return migrate({
    schemaVersion: 1, units: 'meters', wallHeight: 2.7, wallThickness: W,
    rooms: [room('sq', 0, 0, 4, 4)], openings: [], furniture: [],
  }).data!;
}

/** xy AABB of a slab's 8 vertices. */
function aabb(positions: Float32Array) {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]!); maxX = Math.max(maxX, positions[i]!);
    minY = Math.min(minY, positions[i + 1]!); maxY = Math.max(maxY, positions[i + 1]!);
  }
  return { minX, maxX, minY, maxY };
}

describe('#45 wall slabs have real thickness (square room)', () => {
  const plan = squarePlan();
  const walls = buildRoomWalls(plan.floors[0].rooms[0] as Room, plan);

  it('every wall slab spans exactly wallThickness across the wall', () => {
    expect(walls).toHaveLength(4);
    for (const w of walls) {
      const b = aabb(w.positions);
      const dx = b.maxX - b.minX;
      const dy = b.maxY - b.minY;
      // Exactly one axis is the cross-wall axis; it must be the thickness.
      const cross = Math.min(dx, dy);
      expect(cross).toBeCloseTo(W, 6);
      // ...and the other axis is the 4 m wall length (not stretched).
      expect(Math.max(dx, dy)).toBeCloseTo(4, 6);
    }
  });

  it('slabs extend OUTWARD from the polygon (corner test)', () => {
    // Segment 0 is the south edge y=0 of a CCW square: its slab must
    // straddle the line, y[-0.12, +0.12] — never y[0, 0].
    const south = walls[0];
    const sb = aabb(south!.positions);
    expect(sb.minY).toBeCloseTo(-W / 2, 6);
    expect(sb.maxY).toBeCloseTo(W / 2, 6);
    expect(sb.minX).toBeCloseTo(0, 6);

    // Segment 1 is the east edge x=4: slab straddles x[3.88, 4.12].
    const east = aabb(walls[1]!.positions);
    expect(east.minX).toBeCloseTo(4 - W / 2, 6);
    expect(east.maxX).toBeCloseTo(4 + W / 2, 6);
  });
});

describe('#45 door hole still carves through a staggered shared wall', () => {
  it('a walk crosses the doorway but not the flanking wall', () => {
    const plan: FloorplanData = migrate({
      schemaVersion: 1, units: 'meters', wallHeight: 2.7, wallThickness: W,
      rooms: [room('living', 0, 0, 5, 4), room('bed', 5, 1, 3, 2.5)],
      openings: [], furniture: [],
    }).data!;
    // Pair a door on living's east wall with the staggered bed wall (#41).
    const rows = derivePairRows(plan, {
      roomId: 'living', segmentIndex: 1, tCenter: 0.5,
    });
    expect(rows).toHaveLength(2);
    const openings = rows.map((r, i) => ({
      id: `door-${i}`, roomId: r.roomId, kind: 'door' as const,
      segmentIndex: r.segmentIndex, tCenter: r.tCenter,
      width: 0.9, sillHeight: 0, headHeight: 2.05,
    }));
    const boxes = buildCollisions({ ...plan, floors: [{ ...plan.floors[0], openings }] });
    // Door centre: living seg 1 t=0.5 -> world (5, 2). Passable eastward.
    expect(segmentHitsBoxes(4, 2, 6, 2, boxes)).toBe(false);
    // Flank 0.7 m north of the door is solid wall in BOTH rooms.
    expect(segmentHitsBoxes(4, 2.7, 6, 2.7, boxes)).toBe(true);
  });
});
