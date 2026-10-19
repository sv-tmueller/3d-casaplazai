/**
 * Unit tests for furniture collision boxes (issue #18):
 * rotated-footprint AABBs expanded by the player radius, concatenated
 * into compiled.collisions while buildCollisions stays walls-only.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCollisions,
  expandPlayerRadius,
  furnitureCollisionBoxes,
  PLAYER_RADIUS,
} from '../../src/geom/collision';
import { compilePlan } from '../../src/geom/compile';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';

function basePlan(): FloorplanData {
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.5,
    wallThickness: 0.1,
    rooms: [
      {
        id: 'r1',
        name: 'Living',
        kind: 'living_room',
        height: 2.5,
        polygon: [
          [0, 0],
          [6, 0],
          [6, 5],
          [0, 5],
        ],
        floorFinish: 'laminate',
      },
    ] as unknown as FloorplanData['floors'][number]['rooms'],
    openings: [],
    furniture: [],
  }).data!;
}

describe('furnitureCollisionBoxes', () => {
  it('returns [] for plans without furniture', () => {
    expect(furnitureCollisionBoxes(basePlan())).toEqual([]);
  });

  it('expands an axis-aligned footprint by PLAYER_RADIUS on every side', () => {
    const plan = basePlan();
    plan.floors[0].furniture = [
      {
        id: 'f1',
        type: 'table',
        roomId: 'r1',
        position: [3, 2.5],
        rotationDeg: 0,
        footprint: [2, 1],
      },
    ];
    const boxes = furnitureCollisionBoxes(plan);
    expect(boxes).toHaveLength(1);
    const b = boxes[0];
    expect(b?.minX).toBeCloseTo(3 - 1 - PLAYER_RADIUS, 6);
    expect(b?.maxX).toBeCloseTo(3 + 1 + PLAYER_RADIUS, 6);
    expect(b?.minY).toBeCloseTo(2.5 - 0.5 - PLAYER_RADIUS, 6);
    expect(b?.maxY).toBeCloseTo(2.5 + 0.5 + PLAYER_RADIUS, 6);
  });

  it('computes the rotated-corner AABB for a diagonal footprint', () => {
    const plan = basePlan();
    plan.floors[0].furniture = [
      {
        id: 'f1',
        type: 'table',
        roomId: 'r1',
        position: [0, 0],
        rotationDeg: 90,
        footprint: [2, 1],
      },
    ];
    const b = furnitureCollisionBoxes(plan)[0];
    // Rotating [±1,±0.5] by 90° swaps components: extent x ∈ [-0.5,0.5].
    expect(b?.minX).toBeCloseTo(-0.5 - PLAYER_RADIUS, 6);
    expect(b?.maxX).toBeCloseTo(+0.5 + PLAYER_RADIUS, 6);
    expect(b?.minY).toBeCloseTo(-1 - PLAYER_RADIUS, 6);
    expect(b?.maxY).toBeCloseTo(+1 + PLAYER_RADIUS, 6);
  });

  it('compilePlan pipes furniture boxes AFTER the wall boxes', () => {
    const plan = basePlan();
    plan.floors[0].openings = [];
    plan.floors[0].furniture = [
      {
        id: 'f1',
        type: 'sofa',
        roomId: 'r1',
        position: [3, 1],
        rotationDeg: 0,
        footprint: [2, 0.8],
      },
    ];
    const scene = compilePlan(plan);
    const fb = furnitureCollisionBoxes(plan);
    expect(fb).toHaveLength(1);
    const last = scene.collisions.at(-1);
    expect(last).toEqual(expandPlayerRadius({
      minX: 3 - 1,
      minY: 1 - 0.4,
      maxX: 3 + 1,
      maxY: 1 + 0.4,
    }));
    // The tail of the combined stream equals the furniture boxes, values-wise.
    expect(scene.collisions.slice(-fb.length)).toEqual(fb);
    // And strictly MORE boxes than walls alone would emit.
    expect(scene.collisions.length).toBeGreaterThan(buildCollisions(plan).length);
  });
});
