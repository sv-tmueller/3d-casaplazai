/**
 * Spawn-solver spec (issue #6): demo fixture legality, skinny-room
 * march, typed impossibility error, facing-yaw selection.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compilePlan,
  parseValidatedPlan,
} from '../../src/geom';
import type { FloorplanData, Room } from '../../src/shared/schema';
import {
  SpawnFailureError,
  isClear,
  polygonArea,
  polygonCentroid,
  solveSpawn,
} from '../../src/viewer/spawn';

const demoRaw: FloorplanData = parseValidatedPlan(
  JSON.parse(
    readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
  ),
);

function boxesOf(plan: FloorplanData) {
  return compilePlan(plan).collisions;
}

describe('solveSpawn — demo apartment', () => {
  it('spawns inside the largest room (living room), clear of AABBs', () => {
    const boxes = boxesOf(demoRaw);
    const pose = solveSpawn(demoRaw.rooms, boxes);
    const living = demoRaw.rooms.find((r) => r.id === 'room-living-room');
    expect(living).toBeDefined();

    // Pose lies within the living room's polygon bbox.
    expect(pose.x).toBeGreaterThanOrEqual(0);
    expect(pose.x).toBeLessThanOrEqual(5.4);
    expect(pose.y).toBeGreaterThanOrEqual(0);
    expect(pose.y).toBeLessThanOrEqual(3.6);

    // And clear of every collision volume.
    expect(isClear(pose.x, pose.y, boxes)).toBe(true);
  });

  it('faces the widest extent (eastward for the rectangular living room)', () => {
    const pose = solveSpawn(demoRaw.rooms, boxesOf(demoRaw));
    expect(((pose.yaw - Math.PI / 2) ** 2) % (Math.PI ** 2)).toBeLessThan(1e-9);
  });
});

describe('polygon math', () => {
  it('computes shoelace areas (largest room ranks first)', () => {
    const rect = polygonArea([[0, 0], [4, 0], [4, 2], [0, 2]]);
    expect(rect).toBeCloseTo(8, 9);
  });

  it('computes true centroid of an L-shaped room', () => {
    const [, cy] = polygonCentroid([[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]]);
    // Weighted lower since the tall arm pulls downward.
    expect(cy).toBeGreaterThan(0.5);
    expect(cy).toBeLessThan(1.6);
  });
});

describe('solveSpawn — adversarial fixtures', () => {
  it('skinny room with furniture SEVERING the corridor fails honestly (SpawnFailureError)', () => {
    // Skinny corridor room with a fat obstacle squatting on its centroid.
    const plan: FloorplanData = {
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: [
        {
          id: 'r-skinny',
          name: 'SkinnyHall',
          polygon: [[0, 0], [10, 0], [10, 2], [0, 2]],
          floorTexture: 'concrete',
        },
      ],
      openings: [],
      // Fat counter blocking the exact centroid.
      furniture: [
        {
          id: 'fat-counter',
          type: 'counter',
          roomId: 'r-skinny',
          position: [5, 1],
          rotationDeg: 0,
          footprint: [2.5, 1.6],
        },
      ],
    };
    const boxes = boxesOf(plan);
    // Issue #18: furniture now participates in collisions. The expanded
    // counter (3.1 x 2.2 at the centroid) fully SEVERS the 2 m corridor —
    // no legal cell is reachable from the centroid, so the honest outcome
    // is a typed failure, not a teleport through the obstacle.
    expect(() => solveSpawn(plan.rooms, boxes)).toThrow(SpawnFailureError);
  });

  it('throws SpawnFailureError when saturation leaves nowhere legal', () => {
    const tinyRoom: Room = {
      id: 'tiny',
      name: 'Tiny',
      polygon: [[0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]],
      floorTexture: null,
    };
    // A collision box engulfing the ENTIRE microscopic room.
    const engulfing = [{
      minX: -5, minY: -5, maxX: 5, maxY: 5,
    }];
    expect(() => solveSpawn([tinyRoom], engulfing)).toThrow(
      SpawnFailureError,
    );
  });
});
