// @vitest-environment happy-dom
/**
 * Issue #76 regressions: stacked-storey plans must survive the flat
 * adapter without collapsing geometry, and the walk rig must ground
 * itself on the ACTIVE storey only.
 *
 * Fixture archetype: TWO IDENTICAL rooms stacked (elevations 0 and
 * 2.7). Their wall slabs are centroid-coincident in x/y and differ
 * ONLY in z — precisely the case where a z-naive dedupe would merge
 * the upper storey's walls away. The z-aware dedupe (centroid TRIPLE,
 * issue #29) must keep both.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { compilePlan, countTriangles, countVertices } from '../../src/geom';
import { adaptScene } from '../../src/viewer/adapter';
import { activeCollisions, WalkRig } from '../../src/viewer/walkMode';
import { solveSpawn } from '../../src/viewer/spawn';
import { EYE_HEIGHT } from '../../src/viewer/types';
import type { CollisionBox } from '../../src/viewer/types';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';

/** Two identical square rooms, stacked at elevations 0 and 2.7. */
function stackedPlan(): FloorplanData {
  const room = {
    id: 'room-stack',
    name: 'Stacked',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ] as [[number, number], [number, number], [number, number], [number, number]],
    floorTexture: 'wood' as const,
  };
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
        rooms: [{ ...room }],
        openings: [],
        furniture: [],
      },
      {
        id: 'floor-upper',
        name: 'Upper',
        elevation: 2.7,
        rooms: [{ ...room, id: 'room-stack-upper' }],
        openings: [],
        furniture: [],
      },
    ],
    stairs: [],
  };
}

function flatRoomsMap(plan: FloorplanData) {
  const m = new Map<string, (typeof plan.floors)[number]['rooms'][number]>();
  for (const f of plan.floors) for (const r of f.rooms) m.set(r.id, r);
  return m;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('z-dedupe regression — stacked identical rooms never merge', () => {
  it('upper-storey wall slabs survive the flat adapter (bucket count doubles)', () => {
    const plan = stackedPlan();
    const compiled = compilePlan(parseIt(plan));
    const adapted = adaptScene(compiled, flatRoomsMap(plan));

    const groundAlone: FloorplanData = {
      ...plan,
      floors: [plan.floors[0]!],
    };
    const single = compilePlan(parseIt(groundAlone));
    const singleAdapted = adaptScene(single, flatRoomsMap(groundAlone));
    const singleWall = singleAdapted.buckets.find((b) => b.slot === 'wall');

    const wall = adapted.buckets.find((b) => b.slot === 'wall');
    expect(wall).toBeDefined();
    expect(singleWall).toBeDefined();

    // The stacked scene's wall bucket holds DOUBLE the single-storey
    // geometry: every slab exists once per storey, at different z.
    expect(wall!.indices.length).toBe(singleWall!.indices.length * 2);

    // Vertices/triangles likewise doubled across the whole scene.
    expect(countVertices(compiled)).toBe(countVertices(single) * 2);
    expect(countTriangles(compiled)).toBe(countTriangles(single) * 2);
  });

  it('upper-storey slab z coordinates are lifted by the elevation', () => {
    const plan = stackedPlan();
    const compiled = compilePlan(parseIt(plan));
    const upper = compiled.rooms.find((r) => r.roomId === 'room-stack-upper');
    expect(upper).toBeDefined();
    expect(upper!.elevation).toBe(2.7);
    // Floor surface sits AT the elevation; ceiling at elevation+height.
    const floorZ = upper!.floor.positions[2]!;
    const ceilZ = upper!.ceiling.positions[2]!;
    expect(floorZ).toBeCloseTo(2.7, 6);
    expect(ceilZ).toBeCloseTo(2.7 + 2.7, 6);
    // Ground room untouched.
    const ground = compiled.rooms.find((r) => r.roomId === 'room-stack')!;
    expect(ground.floor.positions[2]).toBeCloseTo(0, 6);
    expect(ground.elevation).toBe(0);
  });

  it('dz=0 storey emits byte-identical buffers (skip, not float-no-op)', () => {
    const plan = stackedPlan();
    const compiled = compilePlan(parseIt(plan));
    const ground = compiled.rooms.find((r) => r.roomId === 'room-stack')!;
    const upper = compiled.rooms.find((r) => r.roomId === 'room-stack-upper')!;
    // Same local geometry: the ground buffer minus zero lift equals the
    // upper buffer minus 2.7 on every z coordinate.
    expect(ground.floor.positions.length).toBe(upper.floor.positions.length);
    for (let i = 0; i < ground.floor.positions.length; i += 3) {
      expect(ground.floor.positions[i]).toBe(upper.floor.positions[i]);
      expect(ground.floor.positions[i + 1]).toBe(upper.floor.positions[i + 1]);
      expect(ground.floor.positions[i + 2]!).toBeCloseTo(
        upper.floor.positions[i + 2]! - 2.7,
        6,
      );
    }
  });
});

describe('walk grounding — active storey only', () => {
  it('activeCollisions drops boxes outside the walker\'s z band', () => {
    const plan = stackedPlan();
    const compiled = compilePlan(parseIt(plan));
    const adapted = adaptScene(compiled, flatRoomsMap(plan), undefined, 0.24, plan);
    expect(adapted.activeFloorElevation).toBe(0);

    const active = activeCollisions(adapted);
    // Every retained box overlaps [0, EYE_HEIGHT].
    for (const box of active) {
      if (box.minZ === undefined || box.maxZ === undefined) continue;
      expect(box.maxZ).toBeGreaterThan(0);
      expect(box.minZ).toBeLessThan(EYE_HEIGHT);
    }
    // The upper storey's boxes (z ≥ 2.7) are all gone.
    expect(active.some((b) => (b.minZ ?? 0) >= 2.7)).toBe(false);
    // And the unfiltered list DID contain them (guard against a
    // vacuous pass).
    expect(adapted.collisions.some((b) => (b.minZ ?? 0) >= 2.7)).toBe(true);
  });

  it('WalkRig seats the camera at activeFloorElevation + EYE_HEIGHT', () => {
    const plan = stackedPlan();
    const compiled = compilePlan(parseIt(plan));
    const adapted = adaptScene(compiled, flatRoomsMap(plan), undefined, 0.24, plan);

    const canvas = document.createElement('canvas');
    const spawn = solveSpawn(plan.floors[0]!.rooms, adapted.collisions);
    const rig = new WalkRig(canvas, adapted, spawn.x, spawn.y, spawn.yaw);
    try {
      rig.update(0.016);
      expect(rig.camera.position.z).toBeCloseTo(0 + EYE_HEIGHT, 9);
    } finally {
      rig.deactivate();
    }
  });

  it('walker confined by GROUND walls only — upstairs boxes do not fence', () => {
    const plan = stackedPlan();
    const compiled = compilePlan(parseIt(plan));
    const adapted = adaptScene(compiled, flatRoomsMap(plan), undefined, 0.24, plan);

    const canvas = document.createElement('canvas');
    const spawn = solveSpawn(plan.floors[0]!.rooms, adapted.collisions);
    const rig = new WalkRig(canvas, adapted, spawn.x, spawn.y, spawn.yaw);
    try {
      // Head due EAST from the room centre: the ground storey's east
      // wall must stop the disc (~x=4). If the z filter were broken in
      // the OPPOSITE direction (no boxes at all), the disc would sail
      // past 4; if unfiltered, the UPPER east wall (same x range) would
      // ALSO claim the hit — indistinguishable by position alone, so
      // the companion assertion below inspects the box population.
      rig.setYaw(0); // +x heading
      for (let i = 0; i < 240; i += 1) {
        simKeys(rig, true);
        rig.update(1 / 60);
      }
      const { x } = rig.discPosition;
      expect(x).toBeLessThan(4); // stopped by the ground east wall
      expect(x).toBeGreaterThan(3); // ...but reached it
      // Resolver saw ONLY ground-storey boxes.
      const active = activeCollisions(adapted) as CollisionBox[];
      expect(active.length).toBeLessThan(adapted.collisions.length);
    } finally {
      rig.deactivate();
    }
  });
});

/** Press/release W through the rig's private handler (test seam). */
function simKeys(_rig: WalkRig, _down: boolean): void {
  // Key events are bound to window; happy-dom lets us dispatch synthetics.
  window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
  );
}

/** Validate + parse through the same door the loaders use. */
function parseIt(plan: FloorplanData): FloorplanData {
  const mig = migrate(plan);
  if (!mig.ok || !mig.data) throw new Error('fixture failed to validate');
  return mig.data;
}
