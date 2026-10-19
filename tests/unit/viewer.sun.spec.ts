/**
 * Solar-model spec (issue #121): the calibration PIN, the daily sweep,
 * north rotation, night clamps and the identity-at-noon coupling
 * factors.
 *
 * The PIN is the contract (AC3): the noon preset must reproduce the
 * pre-#121 hard-coded sun perch exactly — offset (8, −8, 12) metres
 * from the plan centre. The model derives its elevation / azimuth /
 * radius FROM that vector in renderConstants (never hand-tuned), so
 * the round trip's error stays float dust (< 1e-13 m).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUN_SETTINGS,
  normalizeBearingDeg,
  normalizeSunSettings,
  sunBearingDeg,
  sunElevationDeg,
  sunState,
} from '../../src/viewer/sun';
import {
  SUN_EL_NOON_RAD,
  SUN_NIGHT_ELEV_MIN_DEG,
  SUN_NIGHT_INTENSITY_FLOOR,
  SUN_PATH_RADIUS_M,
} from '../../src/viewer/renderConstants';

const deg = (radians: number): number => (radians * 180) / Math.PI;

describe('solar model — calibration pin (AC3)', () => {
  it('reproduces the pre-#121 noon perch EXACTLY at t=12, offset=0', () => {
    const { offset } = sunState(DEFAULT_SUN_SETTINGS);
    expect(offset.x).toBeCloseTo(8, 12);
    expect(offset.y).toBeCloseTo(-8, 12);
    expect(offset.z).toBeCloseTo(12, 12);
  });

  it('keeps the sun on the derived orbit radius at every hour', () => {
    for (let t = 0; t <= 24; t += 1.5) {
      const { offset } = sunState({ timeHours: t, northOffsetDeg: 0 });
      expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(
        SUN_PATH_RADIUS_M,
        9,
      );
    }
  });

  it('noon elevation and bearing match the derived constants', () => {
    expect(sunElevationDeg(12)).toBeCloseTo(deg(SUN_EL_NOON_RAD), 12);
    expect(sunBearingDeg(12, 0)).toBeCloseTo(135, 12);
  });
});

describe('solar model — daily sweep', () => {
  it('elevation rises to noon, falls after, and mirrors 8/16', () => {
    expect(sunElevationDeg(9)).toBeGreaterThan(sunElevationDeg(7));
    expect(sunElevationDeg(12)).toBeGreaterThan(sunElevationDeg(9));
    expect(sunElevationDeg(15)).toBeLessThan(sunElevationDeg(12));
    expect(sunElevationDeg(17)).toBeLessThan(sunElevationDeg(15));
    // The sine path is symmetric about noon.
    expect(sunElevationDeg(8)).toBeCloseTo(sunElevationDeg(16), 3);
    expect(sunElevationDeg(12)).toBeCloseTo(46.69, 1);
  });

  it('bearing sweeps 15°/h through noon (135° at 12:00)', () => {
    expect(sunBearingDeg(9, 0)).toBeCloseTo(90, 12);
    expect(sunBearingDeg(12, 0)).toBeCloseTo(135, 12);
    expect(sunBearingDeg(15, 0)).toBeCloseTo(180, 12);
    expect(sunBearingDeg(18, 0)).toBeCloseTo(225, 12);
  });

  it('night clamps: elevation floors at 2°, intensity at the dusk floor', () => {
    for (const t of [0, 3, 21, 24]) {
      const state = sunState({ timeHours: t, northOffsetDeg: 0 });
      expect(state.elevationDeg).toBeCloseTo(SUN_NIGHT_ELEV_MIN_DEG, 9);
      expect(state.intensityFactor).toBeCloseTo(
        SUN_NIGHT_INTENSITY_FLOOR,
        9,
      );
      expect(state.ambientFactor).toBeGreaterThan(1);
      expect(state.duskBlend).toBeCloseTo(1, 9);
    }
    // The raw sine hits zero AT 6/18 — already clamped to the floor.
    expect(sunElevationDeg(6)).toBeCloseTo(SUN_NIGHT_ELEV_MIN_DEG, 9);
    expect(sunElevationDeg(18)).toBeCloseTo(SUN_NIGHT_ELEV_MIN_DEG, 9);
  });

  it('identity factors at the noon preset (byte-identical default)', () => {
    const state = sunState(DEFAULT_SUN_SETTINGS);
    expect(state.intensityFactor).toBe(1);
    expect(state.ambientFactor).toBe(1);
    expect(state.duskBlend).toBe(0);
  });
});

describe('solar model — north offset', () => {
  it('shifts bearing by exactly δ (whole-path rotation)', () => {
    for (const t of [8, 12, 16]) {
      expect(sunBearingDeg(t, 30) - sunBearingDeg(t, 0)).toBeCloseTo(30, 12);
      expect(sunBearingDeg(t, -75) - sunBearingDeg(t, 0)).toBeCloseTo(
        -75,
        12,
      );
    }
  });

  it('rotates the 3D offset without touching elevation or radius', () => {
    const base = sunState({ timeHours: 12, northOffsetDeg: 0 }).offset;
    const baseAngle = (Math.atan2(base.x, base.y) * 180) / Math.PI;
    // atan2 wraps at ±180 — compare the wrapped delta, not raw angles.
    const wrap = (d: number): number =>
      ((((d + 180) % 360) + 360) % 360) - 180;
    for (const delta of [15, 90, -120]) {
      const state = sunState({ timeHours: 12, northOffsetDeg: delta });
      const angle = (Math.atan2(state.offset.x, state.offset.y) * 180) / Math.PI;
      expect(wrap(angle - baseAngle)).toBeCloseTo(delta, 6);
      expect(state.offset.z).toBeCloseTo(base.z, 12);
    }
  });
});

describe('solar model — helpers', () => {
  it('normalizes bearings into [0, 360)', () => {
    expect(normalizeBearingDeg(135)).toBe(135);
    expect(normalizeBearingDeg(-45)).toBe(315);
    expect(normalizeBearingDeg(495)).toBe(135);
  });

  it('clamps settings into the supported ranges', () => {
    expect(normalizeSunSettings({ timeHours: 30, northOffsetDeg: 400 })).toEqual(
      { timeHours: 24, northOffsetDeg: 180 },
    );
    expect(
      normalizeSunSettings({ timeHours: -3, northOffsetDeg: -400 }),
    ).toEqual({ timeHours: 0, northOffsetDeg: -180 });
    expect(normalizeSunSettings(DEFAULT_SUN_SETTINGS)).toEqual(
      DEFAULT_SUN_SETTINGS,
    );
  });
});
