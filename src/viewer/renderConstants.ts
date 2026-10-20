/**
 * Render tunables (issue #86, pkg 9.1). Single home for every lighting /
 * sky / shadow / roof-affordance constant the viewer uses — precedent:
 * src/editor/model/constants.ts. Values were LIVE-DIRECTED from the
 * pre-9.1 sceneBuilder (retrofit, not redesign): byte-identical output
 * for the default (high) path except the sky gradient.
 */

/* ------------------------------ quality knob ------------------------------ */

/**
 * Render quality preset (?quality=low|high). LOW trades the expensive
 * flourishes for integrated-GPU headroom: shadow mapping OFF, solid
 * sky (no gradient dome), roof-autofade SNAPS instead of tweening.
 */
export type QualityLevel = 'low' | 'high';

/** Exhaustive runtime tuple of {@link QualityLevel} members. */
export const QUALITY_LEVELS = ['low', 'high'] as const;

/* ---------------------------------- sky ----------------------------------- */

/** Solid page-backdrop sky tone (LOW quality + legacy paintSky path). */
export const SKY_SOLID_HEX = 0xbcd6ea;

/** Gradient dome: zenith tone (upper mix stop). */
export const SKY_GRADIENT_TOP_HEX = 0x5f9edb;

/** Gradient dome: horizon tone (lower mix stop, matched to the sun haze). */
export const SKY_GRADIENT_BOTTOM_HEX = 0xcfe3ef;

/** Dome sphere radius, meters (must clear the orbit camera's z≈120 apex). */
export const SKY_DOME_RADIUS_M = 300;

/** Dome tessellation (cheap: it is a smooth two-tone ramp). */
export const SKY_DOME_SEGMENTS = 32;

/**
 * World-z band the gradient ramps across. Below BOTTOM the dome is the
 * horizon tone, above TOP the zenith tone; the walker (z ≤ ~10) always
 * sees the full ramp, the orbiter (z ≤ ~120) never crosses the top.
 */
export const SKY_GRADIENT_BOTTOM_Z = 0;
export const SKY_GRADIENT_TOP_Z = 120;

/* --------------------------------- lights --------------------------------- */

/** Hemisphere fill: sky tone (cool wash from above). */
export const HEMI_SKY_COLOR = 0xdfeaff;

/** Hemisphere fill: ground bounce tone (warm soil). */
export const HEMI_GROUND_COLOR = 0xb8a888;

/** Hemisphere fill intensity. */
export const HEMI_INTENSITY = 1.35;

/** Warm-white sun tone. */
export const SUN_COLOR = 0xfff4e0;

/** Sun (directional) intensity. */
export const SUN_INTENSITY = 2.1;

/** Tiny ambient lift so downward-facing ceilings aren't pitch black. */
export const AMBIENT_COLOR = 0xffffff;
export const AMBIENT_INTENSITY = 0.25;

/* ---------------------------- interior lights ----------------------------- */

/**
 * Interior fill lights (issue #152): a fixed pool of soft, shadowless
 * point lights, one per room, sitting just under the room's ceiling.
 * Dusk-only — `interiorFillIntensity` parks the pool at zero in
 * daylight, so the noon picture stays byte-identical to pre-#152.
 */
/** Pool cap. Rooms beyond it fall back to the existing ambient dusk boost. */
export const MAX_INTERIOR_LIGHTS = 4;
/** Full-dusk intensity, candela (three's physical point-light units).
 *  Tuned against the CP0 walk probe: the 22:00 interior reads 117.6 luma
 *  pre-change, so the pool adds ~a quarter-stop of warm light, not a sun. */
export const INTERIOR_LIGHT_MAX_INTENSITY = 2;
/** Warm-white tone: a slight amber tilt, matching the dusk haze. */
export const INTERIOR_LIGHT_COLOR = 0xfff1dd;
/** Extra drop below the ceiling underside so the slab never clips the light. */
export const INTERIOR_LIGHT_Z_OFFSET_M = 0.12;
/** Re-pick the nearest-N rooms every Nth walk tick (assignment throttle). */
export const INTERIOR_LIGHTS_INTERVAL_TICKS = 5;

/* --------------------------------- shadows -------------------------------- */

/** Shadow map resolution, squared texels (HIGH quality only). */
export const SHADOW_MAP_SIZE = 1024;

/** Padding added around the plan bounds for the shadow frustum, meters. */
export const SHADOW_FRUSTUM_PAD_M = 1.5;

/** Fitted shadow-camera clip planes, meters. */
export const SHADOW_CAMERA_NEAR_M = 0.5;
export const SHADOW_CAMERA_FAR_M = 60;

/** Peter-panning/acne tuning (values carried over from pkg 4 verbatim). */
export const SHADOW_BIAS = -0.0015;
export const SHADOW_NORMAL_BIAS = 0.02;

/* ---------------------------- roof affordances ---------------------------- */

/**
 * Indoor autofade: opacity floor the roof planes tween down to while
 * the walker stands under them (kept > 0 so a slanted glance still
 * reads "there is a roof here").
 */
export const ROOFS_FADE_MIN_OPACITY = 0.12;

/** Autofade tween rate (exponential decay constant, per second). */
export const ROOFS_FADE_RATE_PER_S = 4;

/**
 * Upward-ray cadence: the eye ray recasts every Nth animation tick.
 * The ray tests ONLY the roof-slot meshes (typically one merged mesh),
 * so amortized cost is ~free.
 */
export const ROOFS_RAYCAST_INTERVAL_TICKS = 5;

/** Upward-ray cutoff, meters (covers any legal roof height). */
export const ROOFS_RAYCAST_FAR_M = 60;

/* ---------------------------- sun path (issue #121) ----------------------- */

/**
 * Noon sun perch offset from the plan centre, metres — the pre-#121
 * hard-code, now the solar model's calibration anchor. Do NOT retune:
 * sun.ts derives its elevation / azimuth / radius from these values, so
 * the noon preset reproduces the old vector exactly (the pin test in
 * tests/unit/viewer.sun.spec.ts is the contract).
 */
export const SUN_NOON_OFFSET_X_M = 8;
export const SUN_NOON_OFFSET_Y_M = -8;
export const SUN_NOON_OFFSET_Z_M = 12;

/** Sun-orbit radius, metres: |(8, −8, 12)| ≈ 16.49 (derived). */
export const SUN_PATH_RADIUS_M = Math.hypot(
  SUN_NOON_OFFSET_X_M,
  SUN_NOON_OFFSET_Y_M,
  SUN_NOON_OFFSET_Z_M,
);

/** Noon elevation, radians: atan2(z, hypot(x, y)) ≈ 0.8148 (46.69°). */
export const SUN_EL_NOON_RAD = Math.atan2(
  SUN_NOON_OFFSET_Z_M,
  Math.hypot(SUN_NOON_OFFSET_X_M, SUN_NOON_OFFSET_Y_M),
);

/** Noon bearing, degrees CW from +Y (plan north) — the +X/−Y quadrant. */
export const SUN_AZ_NOON_DEG = 135;

/** Night floor: elevation clamp (degrees) and sun-intensity factor. */
export const SUN_NIGHT_ELEV_MIN_DEG = 2;
export const SUN_NIGHT_INTENSITY_FLOOR = 0.15;

/** Dusk colour stops: sun tint, sky-dome bottom, sky-dome top. */
export const SUN_DUSK_COLOR_HEX = 0xff9e54;
export const SKY_DUSK_BOTTOM_HEX = 0xf0b27a;
export const SKY_DUSK_TOP_HEX = 0x2e3a6e;

/** Ambient dusk boost cap: AMBIENT_INTENSITY × (1 + this) at full dusk. */
export const AMBIENT_DUSK_BOOST_MAX = 0.6;
