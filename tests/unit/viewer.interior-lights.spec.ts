/**
 * Interior fill lights (issue #152): the pure dusk curve and the nearest-N
 * room picker the walk-mode pool feeds from. No three, no DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  INTERIOR_LIGHT_MAX_INTENSITY,
  MAX_INTERIOR_LIGHTS,
} from '../../src/viewer/renderConstants';
import {
  DEFAULT_SUN_SETTINGS,
  interiorFillIntensity,
  selectNearestRoomLights,
  sunState,
} from '../../src/viewer/sun';
import type { RoomLightSpot } from '../../src/viewer/types';

const spot = (x: number, y: number, z: number): RoomLightSpot => ({ x, y, z });

describe('interiorFillIntensity (issue #152)', () => {
  it('is hard off at noon and full at 22:00', () => {
    // The AC3 pair: the daylight shot must not change, dusk must light up.
    const noon = sunState({ ...DEFAULT_SUN_SETTINGS, timeHours: 12 });
    const night = sunState({ ...DEFAULT_SUN_SETTINGS, timeHours: 22 });
    expect(interiorFillIntensity(noon.duskBlend)).toBe(0);
    expect(interiorFillIntensity(night.duskBlend)).toBeCloseTo(
      INTERIOR_LIGHT_MAX_INTENSITY,
      6,
    );
  });

  it('snaps the daylight plateau to a hard zero (park condition)', () => {
    expect(interiorFillIntensity(0)).toBe(0);
    expect(interiorFillIntensity(0.001)).toBe(0);
    expect(interiorFillIntensity(0.002)).toBeGreaterThan(0);
  });

  it('is monotone across the dusk ramp and clamps junk', () => {
    let previous = -1;
    for (let blend = 0; blend <= 1.0001; blend += 0.05) {
      const value = interiorFillIntensity(blend);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(interiorFillIntensity(1)).toBe(INTERIOR_LIGHT_MAX_INTENSITY);
    expect(interiorFillIntensity(4)).toBe(INTERIOR_LIGHT_MAX_INTENSITY);
    expect(interiorFillIntensity(-4)).toBe(0);
  });
});

describe('selectNearestRoomLights (issue #152)', () => {
  it('returns the nearest spots first, capped at maxCount', () => {
    const spots = [spot(10, 0, 0), spot(1, 0, 0), spot(4, 0, 0)];
    expect(selectNearestRoomLights(spots, spot(0, 0, 0), 2)).toEqual([
      spot(1, 0, 0),
      spot(4, 0, 0),
    ]);
    expect(selectNearestRoomLights(spots, spot(0, 0, 0), MAX_INTERIOR_LIGHTS))
      .toHaveLength(3);
  });

  it('picks in 3D, so the storey below never wins through the slab', () => {
    // Plan distance favours the room below (2.5 m vs 3 m) but its 3D
    // distance is larger — the walker upstairs stays on its own storey.
    const upstairs = spot(3, 0, 2.5);
    const below = spot(2.5, 0, 0.1);
    expect(selectNearestRoomLights([below, upstairs], spot(0, 0, 2.5), 1))
      .toEqual([upstairs]);
  });

  it('breaks distance ties on plan order (stable, no shimmer)', () => {
    const a = spot(1, 0, 0);
    const b = spot(-1, 0, 0);
    expect(selectNearestRoomLights([a, b], spot(0, 0, 0), 1)).toEqual([a]);
    expect(selectNearestRoomLights([b, a], spot(0, 0, 0), 1)).toEqual([b]);
  });

  it('floors zero/negative caps and never mutates the input', () => {
    const spots = [spot(5, 0, 0), spot(1, 0, 0)];
    const copy = spots.map((s) => ({ ...s }));
    expect(selectNearestRoomLights(spots, spot(0, 0, 0), 0)).toEqual([]);
    expect(selectNearestRoomLights(spots, spot(0, 0, 0), -2)).toEqual([]);
    expect(selectNearestRoomLights([], spot(0, 0, 0), 4)).toEqual([]);
    expect(spots).toEqual(copy);
  });
});
