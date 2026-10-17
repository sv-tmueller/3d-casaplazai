import { describe, expect, it } from 'vitest';
import type { FloorplanData, Opening } from '../../src/shared/schema';
import { buildCollisions, expandPlayerRadius, PLAYER_RADIUS, segmentHitsBoxes } from '../../src/geom/collision';

function planOf(openings: Opening[]): FloorplanData {
  return {
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [
      {
        id: 'ra',
        name: 'Alpha',
        polygon: [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
        ],
        floorTexture: null,
      },
    ],
    openings,
    furniture: [],
  };
}

const FRONT_DOOR: Opening = {
  id: 'door-front',
  roomId: 'ra',
  kind: 'door',
  segmentIndex: 0,
  tCenter: 0.5,
  width: 0.9,
  sillHeight: 0,
  headHeight: 2.05,
};

describe('geom/collision — primitives', () => {
  it('expands boxes symmetrically by player radius', () => {
    const grown = expandPlayerRadius({ minX: 1, minY: 2, maxX: 3, maxY: 4 });
    expect(grown).toEqual({
      minX: 1 - PLAYER_RADIUS,
      minY: 2 - PLAYER_RADIUS,
      maxX: 3 + PLAYER_RADIUS,
      maxY: 4 + PLAYER_RADIUS,
    });
  });

  it('segmentHitsBoxes discriminates hit vs miss', () => {
    const box = { minX: 2, minY: 0, maxX: 2.24, maxY: 2 };
    expect(segmentHitsBoxes(1, 1, 3, 1, [box])).toBe(true);
    expect(segmentHitsBoxes(1, 3, 3, 3, [box])).toBe(false);
  });
});

describe('geom/collision — connectivity (AC: door opens passage)', () => {
  it('straight line THROUGH the doorway crosses zero wall AABBs', () => {
    const boxes = buildCollisions(planOf([FRONT_DOOR]));
    // Walk west->east through the door mouth at x=2, y=0 (outside below south wall).
    expect(segmentHitsBoxes(2, -1, 2, 1, boxes)).toBe(false);
  });

  it('solid wall flank beside the door BLOCKS the same walk', () => {
    const boxes = buildCollisions(planOf([FRONT_DOOR]));
    // Offset path hits the wall pier east of the door.
    expect(segmentHitsBoxes(3.5, -1, 3.5, 1, boxes)).toBe(true);
  });

  it('window keeps a below-sill barrier (cannot walk through glass)', () => {
    const win: Opening = {
      id: 'win-low',
      roomId: 'ra',
      kind: 'window',
      segmentIndex: 0,
      tCenter: 0.5,
      width: 1.0,
      sillHeight: 0.9,
      headHeight: 2.3,
    };
    const boxes = buildCollisions(planOf([win]));
    expect(segmentHitsBoxes(2, -1, 2, 1, boxes)).toBe(true);
  });

  it('mirror-paired shared-door rows both carve their own side', () => {
    const twinEast: Opening = {
      ...FRONT_DOOR,
      id: 'door-twin-east',
      roomId: 'ra',
      segmentIndex: 1,
      tCenter: 0.55,
      width: 0.85,
    };
    const boxes = buildCollisions(planOf([FRONT_DOOR, twinEast]));
    // Through front door (south wall): open.
    expect(segmentHitsBoxes(2, -1, 2, 1, boxes)).toBe(false);
    // Through east shared wall door: open.
    expect(segmentHitsBoxes(5, 1, 3, 1, boxes)).toBe(false);
    // East wall pier north of the twin door: blocked.
    expect(segmentHitsBoxes(5, 1.9, 3, 1.9, boxes)).toBe(true);
  });
});
