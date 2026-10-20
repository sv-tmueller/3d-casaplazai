// @vitest-environment happy-dom
/**
 * Walk-nav pure helpers + rig telemetry (issue #147 CP2): floor
 * attribution, room readout, per-room spawn solving, the z-banded
 * legality test, and the rig's heading/elevation seams.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Floor, FloorplanData, Room } from '../../src/shared/schema';
import { attributeFloorIdx, roomAt, roomReadoutAt } from '../../src/viewer/walkNav';
import { solveSpawn, solveSpawnInRoom } from '../../src/viewer/spawn';
import { activeCollisions, WalkRig } from '../../src/viewer/walkMode';
import { adaptScene } from '../../src/viewer/adapter';
import { compilePlan } from '../../src/geom';
import { isStandingLegal } from '../../src/viewer/appController';
import { EYE_HEIGHT, VIEWER_PLAYER_RADIUS } from '../../src/viewer/types';
import type { AdaptedScene } from '../../src/viewer/types';

function room(id: string, name: string, poly: Array<[number, number]>): Room {
  return {
    id,
    name,
    polygon: poly,
    floorTexture: 'wood',
  } as unknown as Room;
}

/** Ground floor with a big hall + a kitchen; upper floor with one room. */
function twoFloorPlan(): FloorplanData {
  return {
    schemaVersion: 2,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    floors: [
      {
        id: 'floor-ground',
        name: 'Ground',
        elevation: 0,
        rooms: [
          room('r-hall', 'Hall', [
            [0, 0],
            [6, 0],
            [6, 5],
            [0, 5],
          ]),
          room('r-kitchen', 'Kitchen', [
            [0, 5],
            [3, 5],
            [3, 8],
            [0, 8],
          ]),
        ],
        openings: [],
        furniture: [],
      },
      {
        id: 'floor-upper',
        name: 'Upper',
        elevation: 2.7,
        rooms: [
          room('r-belvedere', 'Belvedere', [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ]),
        ],
        openings: [],
        furniture: [],
      },
    ],
    stairs: [],
  };
}

const PLAN = twoFloorPlan();
const FLOORS = PLAN.floors as unknown as Floor[];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('attributeFloorIdx — which storey is the walker on?', () => {
  it('attributes the ground storey at z = 0', () => {
    expect(attributeFloorIdx(FLOORS, 0)).toBe(0);
  });

  it('attributes the upper storey once the feet reach its elevation', () => {
    expect(attributeFloorIdx(FLOORS, 2.7)).toBe(1);
    expect(attributeFloorIdx(FLOORS, 2.71)).toBe(1);
  });

  it('keeps a mid-stair walker on the DEPARTURE storey (highest floor ≤ z)', () => {
    expect(attributeFloorIdx(FLOORS, 1.4)).toBe(0);
    expect(attributeFloorIdx(FLOORS, 2.69)).toBe(0);
  });

  it('clamps below the lowest floor to storey 0 (no -1 index)', () => {
    expect(attributeFloorIdx(FLOORS, -3)).toBe(0);
  });

  it('survives a floorless plan', () => {
    expect(attributeFloorIdx([], 0)).toBe(0);
  });
});

describe('roomAt / roomReadoutAt — the HUD readout source', () => {
  it('names the room containing the point', () => {
    expect(roomReadoutAt(PLAN, 3, 2, 0)).toBe('Hall');
    expect(roomReadoutAt(PLAN, 1.5, 6.5, 0)).toBe('Kitchen');
  });

  it('reads the ATTRIBUTED floor, not the ground floor', () => {
    // (3, 2) is inside the upper room's polygon but OUTSIDE the ground
    // hall only if the storey differs — assert with an upper-storey z.
    expect(roomReadoutAt(PLAN, 3, 2, 2.7)).toBe('Belvedere');
  });

  it('says Outside (not "") when no room contains the walker', () => {
    expect(roomReadoutAt(PLAN, 20, 20, 0)).toBe('Outside');
    // Inside the kitchen footprint but attributed upstairs: the upper
    // floor has no room there ⇒ Outside, honestly reported.
    expect(roomReadoutAt(PLAN, 1.5, 6.5, 2.7)).toBe('Outside');
  });

  it('handles concave rooms and boundary points without throwing', () => {
    const concave: FloorplanData = {
      ...PLAN,
      floors: [
        {
          ...PLAN.floors[0]!,
          rooms: [
            room('r-l', 'Ell', [
              [0, 0],
              [4, 0],
              [4, 2],
              [2, 2],
              [2, 4],
              [0, 4],
            ]),
          ],
        },
      ],
    };
    expect(roomReadoutAt(concave, 3, 1, 0)).toBe('Ell');
    expect(roomReadoutAt(concave, 3, 3, 0)).toBe('Outside');
    expect(() => roomReadoutAt(concave, 0, 0, 0)).not.toThrow();
    expect(roomAt(concave.floors[0], 3, 1)?.id).toBe('r-l');
    expect(roomAt(undefined, 0, 0)).toBeNull();
  });
});

describe('solveSpawnInRoom — the same clearance march, scoped to one room', () => {
  const boxes = [
    { minX: 1, minY: 1, maxX: 3, maxY: 3 },
  ];

  it('spawns at the room centroid when clear, facing the wide axis', () => {
    const pose = solveSpawnInRoom(room('r', 'R', [
      [0, 0],
      [6, 0],
      [6, 4],
      [0, 4],
    ]), []);
    expect(pose.x).toBeCloseTo(3, 6);
    expect(pose.y).toBeCloseTo(2, 6);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2, 6);
    // North-facing when the room is taller than wide.
    const tall = solveSpawnInRoom(room('r', 'R', [
      [0, 0],
      [3, 0],
      [3, 9],
      [0, 9],
    ]), []);
    expect(tall.yaw).toBeCloseTo(0, 6);
  });

  it('marches off a collided centroid but stays inside the requested room', () => {
    const r = room('r', 'R', [
      [0, 0],
      [6, 0],
      [6, 4],
      [0, 4],
    ]);
    const pose = solveSpawnInRoom(r, boxes as never);
    expect(pose.x).toBeGreaterThanOrEqual(0);
    expect(pose.x).toBeLessThanOrEqual(6);
    expect(pose.y).toBeGreaterThanOrEqual(0);
    expect(pose.y).toBeLessThanOrEqual(4);
    const insideBox =
      pose.x >= 1 - VIEWER_PLAYER_RADIUS &&
      pose.x <= 3 + VIEWER_PLAYER_RADIUS &&
      pose.y >= 1 - VIEWER_PLAYER_RADIUS &&
      pose.y <= 3 + VIEWER_PLAYER_RADIUS;
    expect(insideBox).toBe(false);
  });

  it('is the SAME march that solveSpawn runs (largest room delegated)', () => {
    const floors = PLAN.floors;
    const direct = solveSpawnInRoom(floors[0]!.rooms[0]!, []);
    const ranked = solveSpawn([floors[0]!.rooms[0]!], []);
    expect(ranked).toEqual(direct);
  });

  it('throws the typed failure when a room is saturated', () => {
    const saturated = room('r', 'R', [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]);
    expect(() =>
      solveSpawnInRoom(saturated, [
        { minX: -5, minY: -5, maxX: 5, maxY: 5 },
      ] as never),
    ).toThrow(/No clear spawn/);
  });
});

describe('isStandingLegal — z-banded (the CP0 pitfall)', () => {
  it('ignores boxes that do not overlap the walker’s z band', () => {
    const adapted = {
      collisions: [{ minX: 1, minY: 1, maxX: 3, maxY: 3, minZ: 0, maxZ: 2.7 }],
    } as unknown as AdaptedScene;
    // Standing upstairs: the ground-floor wall box shares no z band.
    expect(isStandingLegal(2, 2, adapted, 2.7)).toBe(true);
    // Standing downstairs: same point, same box — illegal.
    expect(isStandingLegal(2, 2, adapted, 0)).toBe(false);
    // No z given: historical behaviour (any overlapping box is illegal).
    expect(isStandingLegal(2, 2, adapted)).toBe(false);
  });

  it('still judges a storey-less (legacy) box illegal on every storey', () => {
    const adapted = {
      collisions: [{ minX: 1, minY: 1, maxX: 3, maxY: 3 }],
    } as unknown as AdaptedScene;
    expect(isStandingLegal(2, 2, adapted, 2.7)).toBe(false);
  });

  it('agrees with activeCollisions on a real adapted two-storey scene', () => {
    const plan = twoFloorPlan();
    const compiled = compilePlan(plan as never);
    const adapted = adaptScene(
      compiled,
      new Map(
        plan.floors.flatMap((f) => f.rooms.map((r) => [r.id, r])),
      ) as never,
    );
    // A point on a ground-floor wall outside the upper storey's
    // footprint (the upper room spans y ≤ 4; the kitchen walls at y ≈ 5
    // have no upstairs counterpart): illegal downstairs, legal upstairs.
    const wallBox = adapted.collisions.find(
      (b) =>
        (b.minZ ?? 0) === 0 &&
        b.maxZ !== undefined &&
        (b.minY + b.maxY) / 2 > 4.5,
    );
    expect(wallBox).toBeDefined();
    const px = (wallBox!.minX + wallBox!.maxX) / 2;
    const py = (wallBox!.minY + wallBox!.maxY) / 2;
    expect(isStandingLegal(px, py, adapted, 0)).toBe(false);
    expect(isStandingLegal(px, py, adapted, 2.7)).toBe(true);
    // Sanity: the helper and the filter agree on the band.
    expect(
      activeCollisions(adapted, 2.7).some(
        (b) =>
          px > b.minX && px < b.maxX && py > b.minY && py < b.maxY,
      ),
    ).toBe(false);
  });
});

describe('WalkRig telemetry (heading + elevation seed)', () => {
  function minimalAdapted(): AdaptedScene {
    return {
      buckets: [],
      collisions: [],
      triangleCount: 0,
      bounds: { minX: 0, minY: 0, maxX: 6, maxY: 8 },
      activeFloorElevation: 0,
      stairs: [],
    } as unknown as AdaptedScene;
  }

  it('seeds curZ at the requested spawn elevation (upper-floor teleport)', () => {
    const rig = new WalkRig(
      document.createElement('canvas'),
      minimalAdapted(),
      1,
      2,
      0,
      2.7,
    );
    try {
      expect(rig.currentZ).toBe(2.7);
      expect(rig.eyePosition.z).toBeCloseTo(2.7 + EYE_HEIGHT, 9);
      // Grounding resolves against the seeded storey, not the lowest one.
      rig.update(1 / 60);
      expect(rig.currentZ).toBeCloseTo(2.7, 6);
    } finally {
      rig.deactivate();
    }
  });

  it('defaults to the adapted active-floor elevation when unseeded', () => {
    const rig = new WalkRig(
      document.createElement('canvas'),
      minimalAdapted(),
      1,
      2,
      0,
    );
    try {
      expect(rig.currentZ).toBe(0);
    } finally {
      rig.deactivate();
    }
  });

  it('exposes the runtime heading yaw (plan space, CCW from +X)', () => {
    const rig = new WalkRig(
      document.createElement('canvas'),
      minimalAdapted(),
      1,
      2,
      0,
    );
    try {
      expect(rig.headingYaw).toBeCloseTo(0, 6);
      rig.setYaw(Math.PI / 2); // north
      expect(rig.headingYaw).toBeCloseTo(Math.PI / 2, 6);
      rig.setYaw(-Math.PI / 4);
      expect(rig.headingYaw).toBeCloseTo(-Math.PI / 4, 6);
    } finally {
      rig.deactivate();
    }
  });
});
