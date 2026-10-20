/**
 * Solar model (issue #121): the pure time-of-day → sun-pose math behind
 * the viewer's day cycle. No three.js imports — unit-testable like the
 * geom modules.
 *
 * CALIBRATION (AC3): at the noon preset (t = 12 h, northOffsetDeg = 0)
 * the model reproduces the pre-#121 hard-coded sun perch EXACTLY —
 * offset (8, −8, 12) m from the plan centre. Elevation, azimuth and
 * radius are DERIVED from that vector in renderConstants; the unit pin
 * test (tests/unit/viewer.sun.spec.ts) is the contract.
 *
 * Path shape (pragmatic, not astronomical):
 *   elevation  el(t) = EL_NOON · sin(π·(t − 6) / 12), clamped ≥ 2° at
 *              night so a grazing sun keeps the night readable;
 *   bearing    β(t)  = 135° + 15°/h · (t − 12) + northOffsetDeg;
 *   position   plan centre + R·(cos el · sin β, cos el · cos β, sin el).
 *
 * Coupling curves — ALL identity at the noon preset (factor 1, blend 0)
 * so the default scene renders byte-identical to pre-#121:
 *   - intensityFactor: dusk floor at night → 1 at noon;
 *   - ambientFactor:   1 at noon → boosted at dusk (fade compensation);
 *   - duskBlend:       colour warmth (sun tint + dome stops) 0 → 1.
 */

import {
  AMBIENT_DUSK_BOOST_MAX,
  INTERIOR_LIGHT_MAX_INTENSITY,
  SUN_AZ_NOON_DEG,
  SUN_EL_NOON_RAD,
  SUN_NIGHT_ELEV_MIN_DEG,
  SUN_NIGHT_INTENSITY_FLOOR,
  SUN_PATH_RADIUS_M,
} from './renderConstants';
import type { RoomLightSpot, SunSettings } from './types';

/** Default sun settings — the pre-#121 noon perch. */
export const DEFAULT_SUN_SETTINGS: SunSettings = {
  timeHours: 12,
  northOffsetDeg: 0,
};

/** Hour of local noon (the elevation curve's peak). */
export const SUN_NOON_HOUR = 12;

/** Sunrise/sunset anchor: el(t) = EL_NOON · sin(π·(t − 6) / 12). */
export const SUNRISE_HOUR = 6;

/** Daily bearing sweep: 15°/h = one full turn per 24 h. */
export const SUN_BEARING_RATE_DEG_PER_H = 15;

/** Night elevation floor, radians (mirror of the DEG constant). */
const NIGHT_ELEV_MIN_RAD = (SUN_NIGHT_ELEV_MIN_DEG * Math.PI) / 180;

/** Precomputed sine anchors of the noon-progress normalisation. */
const SIN_NOON = Math.sin(SUN_EL_NOON_RAD);
const SIN_NIGHT_MIN = Math.sin(NIGHT_ELEV_MIN_RAD);

/** Fully-computed sun state for one settings value. */
export interface SunState {
  /** Offset from the plan centre, metres (the former hard-code at noon). */
  offset: { x: number; y: number; z: number };
  /** Clamped elevation above the horizon, degrees (2° … 46.69°). */
  elevationDeg: number;
  /** Raw model bearing, degrees CW from +Y (plan north); unwrapped. */
  bearingDeg: number;
  /** Multiplier on SUN_INTENSITY: dusk floor at night, exactly 1 at noon. */
  intensityFactor: number;
  /** Multiplier on AMBIENT_INTENSITY: exactly 1 at noon, boosted at dusk. */
  ambientFactor: number;
  /** Blend toward the dusk colour stops: 0 at noon, → 1 at night. */
  duskBlend: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Clamp sun settings into the supported ranges (HUD aliasing guard). */
export function normalizeSunSettings(settings: SunSettings): SunSettings {
  return {
    timeHours: clamp(settings.timeHours, 0, 24),
    northOffsetDeg: clamp(settings.northOffsetDeg, -180, 180),
  };
}

/** Normalise a bearing into [0, 360) for display/stats. */
export function normalizeBearingDeg(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

/** Clamped elevation of the sun at a time of day, radians. */
export function sunElevationRad(timeHours: number): number {
  const raw =
    SUN_EL_NOON_RAD * Math.sin((Math.PI * (timeHours - SUNRISE_HOUR)) / 12);
  return clamp(raw, NIGHT_ELEV_MIN_RAD, SUN_EL_NOON_RAD);
}

/** Clamped elevation of the sun at a time of day, degrees. */
export function sunElevationDeg(timeHours: number): number {
  return (sunElevationRad(timeHours) * 180) / Math.PI;
}

/** Model bearing at a time of day (degrees CW from plan north, unwrapped). */
export function sunBearingDeg(
  timeHours: number,
  northOffsetDeg: number,
): number {
  return (
    SUN_AZ_NOON_DEG +
    SUN_BEARING_RATE_DEG_PER_H * (timeHours - SUN_NOON_HOUR) +
    northOffsetDeg
  );
}

/** Day progress 0 (night floor) → 1 (noon), shared by the coupling curves. */
function noonProgress(elevationRad: number): number {
  const sinEl = Math.sin(elevationRad);
  return clamp((sinEl - SIN_NIGHT_MIN) / (SIN_NOON - SIN_NIGHT_MIN), 0, 1);
}

/** Full sun state (pose + coupling factors) for one settings value. */
export function sunState(settings: SunSettings): SunState {
  const elevationRad = sunElevationRad(settings.timeHours);
  const bearingDeg = sunBearingDeg(settings.timeHours, settings.northOffsetDeg);
  const cosEl = Math.cos(elevationRad);
  const azimuthRad = (bearingDeg * Math.PI) / 180;
  const progress = noonProgress(elevationRad);

  return {
    offset: {
      x: SUN_PATH_RADIUS_M * cosEl * Math.sin(azimuthRad),
      y: SUN_PATH_RADIUS_M * cosEl * Math.cos(azimuthRad),
      z: SUN_PATH_RADIUS_M * Math.sin(elevationRad),
    },
    elevationDeg: (elevationRad * 180) / Math.PI,
    bearingDeg,
    intensityFactor: 1 + (SUN_NIGHT_INTENSITY_FLOOR - 1) * (1 - progress),
    ambientFactor: 1 + AMBIENT_DUSK_BOOST_MAX * (1 - progress),
    duskBlend: 1 - progress,
  };
}

/* ------------------------------ interior fill ----------------------------- */

/**
 * Interior fill-light intensity for a dusk blend (issue #152): zero from
 * sunrise through noon — the daylight shot renders exactly as before —
 * ramping to the pool maximum as progress → 0 (full night). Pure.
 */
export function interiorFillIntensity(duskBlend: number): number {
  const blend = clamp(duskBlend, 0, 1);
  // Snap the daylight plateau (and any float dust) to a hard off: the
  // pool's park condition is `<= 0`, and AC3 pins an exact zero at noon.
  return blend <= 0.001 ? 0 : INTERIOR_LIGHT_MAX_INTENSITY * blend;
}

/**
 * The nearest `maxCount` room spots to a walker eye, nearest first
 * (issue #152). Distance is 3D on purpose: an upstairs walker must not
 * light the room below it THROUGH the slab. Ties break on plan order,
 * so a stationary eye re-picks the same rooms every throttled tick (no
 * flicker between equally close rooms). Pure — no three, no state.
 */
export function selectNearestRoomLights(
  spots: readonly RoomLightSpot[],
  eye: RoomLightSpot,
  maxCount: number,
): RoomLightSpot[] {
  return spots
    .map((spot, index) => ({
      spot,
      index,
      d2:
        (spot.x - eye.x) ** 2 + (spot.y - eye.y) ** 2 + (spot.z - eye.z) ** 2,
    }))
    .sort((a, b) => a.d2 - b.d2 || a.index - b.index)
    .slice(0, Math.max(0, maxCount))
    .map((entry) => entry.spot);
}
