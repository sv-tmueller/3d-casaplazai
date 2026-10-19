/**
 * Issue #67 (Pkg 2): world-frame segment angle helper.
 *
 * MERGE FLAG (coordination with Pkg 1 / #66): semantics are
 * BYTE-IDENTICAL to Pkg 1's helper — same formula, same zero-length
 * convention — so the lead can swap this module for the shared one
 * (or vice versa) during the merge pass with no behavioural change.
 */
import type { Vec2 } from '../../shared/schema';

const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * Counter-clockwise angle of the segment (ax,ay) -> (bx,by), measured
 * in WORLD space from the +X axis, normalized to [0, 360).
 *
 * WORLD FRAME ONLY: canvas Y grows downward, so callers must pass
 * WORLD coordinates (never screen deltas) or north/south invert.
 * A zero-length segment is DEFINED as 0 degrees.
 */
export function segmentAngleDegrees(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dy, dx) * DEGREES_PER_RADIAN + 360) % 360;
}

/** Point-pair convenience wrapper around {@link segmentAngleDegrees}. */
export function segmentAngleBetween(a: Vec2, b: Vec2): number {
  return segmentAngleDegrees(a[0], a[1], b[0], b[1]);
}

/**
 * Issue #100 (Pkg 12.2): the UNIFIED house convention — COMPASS
 * BEARING, 0° = north (+y), clockwise-positive, normalized to
 * [0, 360). Lead-decided (issue #100 NEEDS_DECISION, Interpretation A):
 * the type-in fields speak the same dialect as the inspector wall row,
 * and every display (angle pills, inspector, typed entry) derives from
 * THESE two helpers so pill and field can never diverge again.
 *
 * Still WORLD-frame only (canvas Y grows downward — pass world
 * coordinates, never screen deltas). Zero-length stays 0°.
 */
export function compassAngleDegrees(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return 0;
  // atan2(dx, dy): due-north (+dy) → 0°, due-east (+dx) → 90°,
  // south → 180°, west → 270° — CW-positive headings.
  return (Math.atan2(dx, dy) * DEGREES_PER_RADIAN + 360) % 360;
}

/** Point-pair convenience wrapper around {@link compassAngleDegrees}. */
export function compassAngleBetween(a: Vec2, b: Vec2): number {
  return compassAngleDegrees(a[0], a[1], b[0], b[1]);
}

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * Polar inverse of {@link compassAngleDegrees}: the endpoint `len`
 * meters from `origin` along compass bearing `bearingDeg` (CW from
 * north). Angles outside [0, 360) are accepted and normalized.
 */
export function polarEndpoint(origin: Vec2, len: number, bearingDeg: number): Vec2 {
  const rad = ((bearingDeg % 360) + 360) % 360 * RADIANS_PER_DEGREE;
  // sin/cos of the bearing give the (dx, dy) components: 0° → +dy
  // (north), 90° → +dx (east) — the compass convention, kept in world
  // space (callers render through worldToScreen).
  return [
    origin[0] + len * Math.sin(rad),
    origin[1] + len * Math.cos(rad),
  ];
}

/**
 * Display tolerance for the #100 round-trip guarantee ("metrics/pill
 * reproduce the typed numbers exactly"): metric formatting rounds to
 * 1–2 decimals, so equality is asserted at HALF the finest displayed
 * ulp — tighter than any visible glyph difference, looser than float
 * noise. Kept public so the unit spec pins the same constant.
 */
export const METRIC_DISPLAY_EPS = 0.05;
