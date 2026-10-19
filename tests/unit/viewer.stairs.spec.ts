// @vitest-environment happy-dom
/**
 * Stair walk-traversal specs (issue #80): the grounding resolver and
 * the WalkRig climbing/descending the committed townhouse stair.
 *
 * Probes demanded by the sub-plan:
 *   - resolver: enter rect → monotone rise → exit at upper plane;
 *     descent reversed; hole zone drops the arrival plane.
 *   - rig: simulated climb reaches eye 2.7+EYE_HEIGHT and walks ONTO
 *     the landing; descent reverses; flank boxes block lateral escape.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { compilePlan, parseValidatedPlan } from '../../src/geom';
import { adaptScene } from '../../src/viewer/adapter';
import { activeCollisions, resolveGroundZ, WalkRig } from '../../src/viewer/walkMode';
import { solveSpawn } from '../../src/viewer/spawn';
import { EYE_HEIGHT } from '../../src/viewer/types';
import type { FloorplanData, Room } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The committed townhouse, compiled + adapted through the real door. */
function adaptedTownhouse() {
  const raw: FloorplanData = parseValidatedPlan(
    migrate(
      JSON.parse(
        readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8'),
      ),
    ).data!,
  );
  const compiled = compilePlan(raw);
  const roomsById = new Map<string, Room>();
  for (const f of raw.floors) for (const r of f.rooms) roomsById.set(r.id, r);
  const adapted = adaptScene(compiled, roomsById, undefined, raw.wallThickness, raw);
  return { adapted, plan: raw };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveGroundZ — pure resolver probes', () => {
  const { adapted } = adaptedTownhouse();
  const stair = adapted.stairs[0]!;
  // Stair: centre (9,3), rotation 90° (uphill = +y), run 2.6, rise 2.7.
  // Footprint y ∈ [1.7, 4.3]; hole y ∈ [1.7, 4.4857].

  it('monotone rise along the run: enter at 0, exit at 2.7', () => {
    // Walker ascending: curZ tracks the ramp, so sample curZ = ramp.
    let prev = -Infinity;
    for (let y = 1.75; y <= 4.4; y += 0.1) {
      const z = resolveGroundZ(9.0, y, prev === -Infinity ? 0 : prev, 0, adapted.stairs);
      expect(z).toBeGreaterThanOrEqual(prev);
      prev = z;
    }
    // Past the top riser (hole extension, progress clamped): arrival.
    expect(prev).toBeCloseTo(2.7, 2);
  });

  it('descent reversed: entering from the top walks the ramp down', () => {
    // Start at the upper plane (curZ 2.7) INSIDE the hole near the top:
    // the arrival plane is holed there, so the ramp must win.
    const z = resolveGroundZ(9.0, 4.2, 2.7, 0, adapted.stairs);
    expect(z).toBeLessThan(2.7);
    expect(z).toBeGreaterThan(2.0);
    // Progress at y=4.2: (4.2-1.7)/2.6 = 0.9615 → z ≈ 2.596.
    expect(z).toBeCloseTo(2.7 * ((4.2 - 1.7) / 2.6), 2);
  });

  it('outside the hole the arrival plane stands (walker on floor 2)', () => {
    // On the landing, north of the hole (y > 4.4857): plane at 2.7.
    const z = resolveGroundZ(9.0, 5.0, 2.7, 0, adapted.stairs);
    expect(z).toBeCloseTo(2.7, 6);
  });

  it('ground walker under the stairwell stays on the ground plane', () => {
    // curZ 0, inside the hole zone: the ramp candidate at this x,y is
    // HIGH above (unreachable), the arrival plane is holed, the
    // departure plane (0) is the winner.
    const z = resolveGroundZ(9.0, 3.0, 0, 0, adapted.stairs);
    expect(z).toBeCloseTo(0, 6);
  });

  it('upper-storey walker stepping INTO the hole finds no plane to hover on', () => {
    // Standing on the landing (curZ 2.7) and stepping over the hole:
    // the only candidates are the ramp (below) and the ground plane
    // (way below) — the resolver returns the ramp so the rig FALLS.
    const z = resolveGroundZ(9.0, 4.0, 2.7, 0, adapted.stairs);
    expect(z).toBeLessThan(2.7);
  });

  it('stair-free scenes resolve the base plane everywhere', () => {
    expect(resolveGroundZ(3, 3, 0, 0, [])).toBe(0);
    expect(resolveGroundZ(3, 3, 2.7, 0, [])).toBe(0);
  });

  it('hole rect is the footprint plus the one-tread crest extension', () => {
    // Footprint y ∈ [1.7, 4.3]; hole extends to 4.3 + 2.6/14 ≈ 4.4857.
    const ys = stair.hole.map((c) => c[1]);
    expect(Math.min(...ys)).toBeCloseTo(1.7, 4);
    expect(Math.max(...ys)).toBeCloseTo(4.4857, 3);
  });
});

describe('activeCollisions — sliding z band', () => {
  const { adapted } = adaptedTownhouse();

  it('mid-stair band admits both storeys’ boxes and the flanks', () => {
    const mid = activeCollisions(adapted, 1.35);
    // Ground walls (band [0,2.7]) qualify…
    expect(mid.some((b) => (b.minZ ?? 0) === 0)).toBe(true);
    // …and so do the upper storey's (band [2.7,…]).
    expect(mid.some((b) => (b.minZ ?? 0) >= 2.7)).toBe(true);
  });

  it('ground band excludes the upper storey’s boxes', () => {
    const ground = activeCollisions(adapted, 0);
    expect(ground.every((b) => (b.maxZ ?? Infinity) > 0)).toBe(true);
    expect(ground.some((b) => (b.minZ ?? 0) >= 2.7)).toBe(false);
  });
});

describe('WalkRig — simulated stair traversal', () => {
  it('climbs the stair and walks onto the upper landing', () => {
    const { adapted, plan } = adaptedTownhouse();
    const spawn = solveSpawn(plan.floors[0]!.rooms, adapted.collisions);
    const canvas = document.createElement('canvas');
    const rig = new WalkRig(canvas, adapted, spawn.x, spawn.y, spawn.yaw);
    try {
      // Stage 1: steer to the stair base (kitchen→entry door then the
      // stair mouth at ~(9.0, 1.6)). Simplified: teleport-free steering
      // is the e2e's job; here we verify PHYSICS by planting the disc
      // at the stair mouth through successive W presses facing north.
      rig.setYaw(Math.PI / 2); // face +y (uphill)
      // Plant at the stair mouth (legal: entry hall floor).
      rig['posX'] = 9.0;
      rig['posY'] = 1.5;
      let rose = false;
      let prevZ = rig.camera.position.z;
      for (let i = 0; i < 400; i += 1) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
        );
        rig.update(1 / 60);
        const z = rig.camera.position.z;
        if (z > prevZ + 1e-6) rose = true;
        prevZ = Math.max(prevZ, z);
      }
      expect(rose).toBe(true);
      // Crested: eye at 2.7 + EYE_HEIGHT (±2 cm), disc on the landing
      // north of the stair (y > 4.3).
      expect(rig.camera.position.z).toBeCloseTo(2.7 + EYE_HEIGHT, 2);
      expect(rig.discPosition.y).toBeGreaterThan(4.3);
    } finally {
      rig.deactivate();
    }
  });

  it('descending reverses: climb, turn around, walk back down', () => {
    const { adapted } = adaptedTownhouse();
    const canvas = document.createElement('canvas');
    const rig = new WalkRig(canvas, adapted, 9.0, 1.5, Math.PI / 2);
    try {
      // Climb first (same route as the ascent test).
      for (let i = 0; i < 260; i += 1) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
        );
        rig.update(1 / 60);
      }
      expect(rig.camera.position.z).toBeCloseTo(2.7 + EYE_HEIGHT, 2);
      // Turn around (south) and descend the flight.
      rig.setYaw(-Math.PI / 2);
      for (let i = 0; i < 500; i += 1) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
        );
        rig.update(1 / 60);
      }
      // Back on the ground storey, south of the stair mouth.
      expect(rig.camera.position.z).toBeCloseTo(EYE_HEIGHT, 2);
      expect(rig.discPosition.y).toBeLessThan(1.7);
    } finally {
      rig.deactivate();
    }
  });

  it('flank fencing blocks lateral escape mid-flight', () => {
    const { adapted } = adaptedTownhouse();
    const canvas = document.createElement('canvas');
    // Face WEST (-x): walking sideways off the stair's west flank.
    const rig = new WalkRig(canvas, adapted, 9.0, 3.0, Math.PI);
    try {
      for (let i = 0; i < 120; i += 1) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
        );
        rig.update(1 / 60);
      }
      // West flank rail sits at x ∈ [8.46, 8.54]; the disc must be
      // stopped east of it (cannot pass through the fence).
      expect(rig.discPosition.x).toBeGreaterThan(8.54 - 1e-6);
      // ...and actually reached it (travelled west from 9.0).
      expect(rig.discPosition.x).toBeLessThan(9.0);
    } finally {
      rig.deactivate();
    }
  });
});
