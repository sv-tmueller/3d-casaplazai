/**
 * Collision resolver (issue #6): kinematic disc-vs-AABB movement with
 * swept-segment clipping → slide-along-wall semantics. Boxes arrive
 * ALREADY player-radius expanded from pkg-4, so the swept test treats
 * the mover as a POINT among fattened boxes.
 *
 * Swept detector per tick: clip the mover's displacement SEGMENT
 * (pos → pos + v·dt) against every broadphase box. On entry hit, pin
 * the ENTERING axis flush to the face (minus a tiny skin epsilon),
 * ZERO only the entering axis's velocity, and keep the FULL tangential
 * displacement — truncate neither component. Tangential motion resumes
 * sweeping from the pinned pose (bounded restart cap) so chained
 * contacts (corners) settle. Started-inside cases eject along the
 * shallowest axis via the depenetration rail.
 */

import type { CollisionBox } from './types';

/** Pull-back distance from a contacted face, meters (anti-JIT pad). */
export const FACE_SKIN = 1e-9;

/** Restart cap for chained-contact settling within one tick. */
const MAX_PASSES = 4;

/** Result of one resolver tick. */
export interface MoveOutcome {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** True when some velocity component was clipped this tick. */
  collided: boolean;
}

/**
 * Is the point inside the box? Boundary-exclusive: a point lying exactly
 * on an edge is OUTSIDE (post-eject flush-pinned discs must not read as
 * still-inside and re-trigger the depenetration rail forever).
 */
export function pointInside(box: CollisionBox, x: number, y: number): boolean {
  return x > box.minX && x < box.maxX && y > box.minY && y < box.maxY;
}

/** Signed penetration depths of a point inside a box, per axis. */
export function penetrations(
  box: CollisionBox,
  x: number,
  y: number,
): { px: number; py: number } {
  return {
    px: Math.min(x - box.minX, box.maxX - x),
    py: Math.min(y - box.minY, box.maxY - y),
  };
}

/** Push a point OUT of a box along its shallowest separating axis. */
export function ejectPoint(
  box: CollisionBox,
  x: number,
  y: number,
): { x: number; y: number; axis: 'x' | 'y' } {
  const { px, py } = penetrations(box, x, y);
  if (px <= py) {
    const midX = (box.minX + box.maxX) / 2;
    return { x: x < midX ? box.minX : box.maxX, y, axis: 'x' };
  }
  const midY = (box.minY + box.maxY) / 2;
  return { x, y: y < midY ? box.minY : box.maxY, axis: 'y' };
}

/** One swept-clip outcome: WHEN the segment enters, WHERE, and WHICH axis. */
interface SweepResult {
  /** Entry-time fraction along the segment (0=start, 1=end). */
  tEntry: number;
  /** Axis whose slab closed last (the entering axis). */
  enterAxis: 'x' | 'y';
  /** Face coordinate the entering axis lands on. */
  faceCoord: number;
}

/**
 * Clip the segment (sx,sy)+t·(dx,dy), t∈[0,1], against one box.
 * Reports the ENTRY event only: the largest lower bound over per-axis
 * slab closures, plus which axis contributed it. Returns null when the
 * segment never overlaps the box interior, INCLUDING when the overlap
 * already exists at t=0 (starts-touching/inside is not an entry — the
 * eject rail owns those cases).
 */
function sweepSegment(
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  box: CollisionBox,
): SweepResult | null {
  let tEnter = 0;
  let tExit = 1;
  let enterAxis: 'x' | 'y' = 'x';
  let faceCoord = 0;
  let advanced = false;

  const clipAxis = (
    f: number,
    d: number,
    lo: number,
    hi: number,
    axis: 'x' | 'y',
  ): boolean => {
    if (d === 0) {
      // Stationary on this axis: must already lie within the slab.
      return f >= lo && f <= hi;
    }
    const inv = 1 / d;
    let tNear = (lo - f) * inv;
    let tFar = (hi - f) * inv;
    let nearFace = lo;
    if (tNear > tFar) {
      [tNear, tFar] = [tFar, tNear];
      nearFace = hi;
    }
    if (tNear > tEnter) {
      tEnter = tNear;
      enterAxis = axis;
      faceCoord = nearFace;
      advanced = true;
    }
    if (tFar < tExit) tExit = tFar;
    return tEnter <= tExit;
  };

  if (!clipAxis(sx, dx, box.minX, box.maxX, 'x')) return null;
  if (!clipAxis(sy, dy, box.minY, box.maxY, 'y')) return null;
  if (tEnter > tExit || tEnter > 1 || tExit < 0) return null;
  // Overlap existed at t=0: not an ENTRY hit.
  if (!advanced) return null;

  return { tEntry: tEnter, enterAxis, faceCoord };
}

/**
 * Advance the disc one tick under SWEPT semantics: clip the full
 * displacement segment against the pre-expanded boxes; the earliest
 * entry hit pins the entering axis flush, kills only that axis's
 * velocity, and PRESERVES the full tangential displacement. Tangential
 * motion resumes sweeping from the pinned pose (restart cap bounds
 * chained contacts). Velocities in m/s, dt in seconds.
 */
export function moveDisc(
  startX: number,
  startY: number,
  vx: number,
  vy: number,
  dt: number,
  boxes: readonly CollisionBox[],
  _radius: number,
): MoveOutcome {
  let px = startX;
  let py = startY;
  let cvx = vx;
  let cvy = vy;
  let collided = false;

  // Tick-start basis for exact-arithmetic reconstruction of tangential
  // coordinates (no compound rounding across pinned passes).
  const bx = startX;
  const by = startY;

  // Remaining time this tick still has to integrate. Each pinned pass
  // consumes the fraction absT of the REMAINING time (the sweep clips the
  // remaining displacement, so its tEntry is relative to that remainder).
  let remainingDt = Math.max(dt, 0);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const dxRem = cvx * remainingDt;
    const dyRem = cvy * remainingDt;
    if (dxRem === 0 && dyRem === 0) break;

    // Nearest entry hit across all boxes.
    let best: SweepResult | null = null;
    for (const box of boxes) {
      const s = sweepSegment(px, py, dxRem, dyRem, box);
      if (s !== null && (best === null || s.tEntry < best.tEntry)) {
        best = s;
      }
    }

    if (best === null) {
      // Free path: consume the entire remaining displacement.
      px += dxRem;
      py += dyRem;
      break;
    }

    // Pin flush at the face, kill ONLY the entering axis's velocity, and
    // rebase BOTH coordinates on the tick-start basis so the tangential
    // coordinate carries no compound-rounding residue:
    //   pos_tangent = startPos_tangent + vel_tangent * elapsed_full_tick
    // where elapsed = (dt - remainingDt) + tEntry * remainingDt.
    const elapsed = Math.max(dt, 0) - remainingDt + best.tEntry * remainingDt;
    if (best.enterAxis === 'x') {
      // Pin EXACTLY at the face: pointInside is boundary-exclusive, so a
      // flush-resting disc reads as outside and cannot re-trigger the
      // eject rail. A skin offset would leak fp dust into the pinned
      // coordinate (spec pins demand exact face equality).
      px = best.faceCoord;
      py = by + vy * elapsed;
      cvx = 0;
    } else {
      py = best.faceCoord;
      px = bx + vx * elapsed;
      cvy = 0;
    }
    remainingDt *= 1 - best.tEntry;
    collided = true;
  }

  // Depenetration safety rail: a numerical corner pocket (float dust)
  // still gets ejected along its shallowest axis.
  for (const box of boxes) {
    if (!pointInside(box, px, py)) continue;
    const ej = ejectPoint(box, px, py);
    px = ej.x;
    py = ej.y;
    if (ej.axis === 'x') cvx = 0;
    else cvy = 0;
    collided = true;
  }

  return { x: px, y: py, vx: cvx, vy: cvy, collided };
}

/**
 * Multi-tick convenience wrapper: integrate a desired velocity over a
 * full frame by slicing dt into fixed micro-steps (robust against fast
 * speeds grazing thin oblique slabs). Honors the caller's dt fully —
 * clamping of pathological frames happens upstream, not here.
 */
export function moveDiscStepped(
  startX: number,
  startY: number,
  vx: number,
  vy: number,
  dt: number,
  boxes: readonly CollisionBox[],
  radius: number,
  stepHz = 120,
): MoveOutcome {
  const stepDt = 1 / stepHz;
  const total = Math.max(dt, 0);
  let x = startX;
  let y = startY;
  let cvx = vx;
  let cvy = vy;
  let collided = false;
  let consumed = 0;
  while (consumed < total - 1e-9) {
    const slice = Math.min(stepDt, total - consumed);
    const out = moveDisc(x, y, cvx, cvy, slice, boxes, radius);
    x = out.x;
    y = out.y;
    cvx = out.vx;
    cvy = out.vy;
    collided = collided || out.collided;
    consumed += slice;
    if (cvx === 0 && cvy === 0) break;
  }
  return { x, y, vx: cvx, vy: cvy, collided };
}
