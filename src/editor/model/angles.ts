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
