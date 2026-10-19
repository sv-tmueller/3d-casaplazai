/**
 * Straight-flight staircase geometry (issue #80, pkg 7.4).
 *
 * Pure plan-space math + solid tread-box emission — no Three, no DOM
 * (imports audit). A Stair (schema v2) anchors to its DEPARTURE (lower)
 * floor via roomId; the caller (compile.ts) supplies that floor's
 * elevation and every z emitted here is already world z.
 *
 * Geometry contract (deterministic, golden-stable):
 *   - footprint: rotated rect, center = stair.position, local +x is
 *     the UPHILL direction (rotationDeg CCW), extents run × width.
 *   - steps: stepCount SOLID boxes marching local +x; box i spans tread
 *     i longitudinally and rises (i+1) risers from the departure plane
 *     — a closed-riser stack. No stringers (declared optional in #69
 *     §A; simplicity first), no railings (batch 9 candidate).
 *   - landing hole: the footprint extended ONE TREAD past the top
 *     riser (landing clearance — the extension is an implementation
 *     choice noted in the townhouse golden). The hole is DERIVED from
 *     the footprint, never a schema field (#69 §A.2).
 */

import type { Staircase } from '../shared/schema';
import type { Aabb, MeshBuffer, QuadCorners } from './types';
import { clamp, snapRound } from './mathutil';

/**
 * Thickness of the flank fencing boxes, meters. Thin on purpose: the
 * boxes only need to stop the walker's DISC CENTRE from leaving the
 * footprint sideways (the resolver treats the walker as a point among
 * boxes), so wall-grade thickness would just eat corridor width.
 */
export const STAIR_FLANK_THICKNESS = 0.08;

/** Rotated footprint of one stair in plan coordinates. */
export interface StairFootprint {
  /** Footprint centre (== stair.position). */
  cx: number;
  cy: number;
  /** Uphill unit direction (stair local +x). */
  ux: number;
  uy: number;
  /** Across-run unit direction (stair local +y). */
  vx: number;
  vy: number;
  /** Half extent along (ux, uy): run / 2. */
  halfRun: number;
  /** Half extent along (vx, vy): width / 2. */
  halfWidth: number;
}

/** Resolve the stair's rotated footprint axes and half extents. */
export function stairFootprint(stair: Staircase): StairFootprint {
  const rad = (stair.rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    cx: stair.position[0],
    cy: stair.position[1],
    ux: c,
    uy: s,
    vx: -s,
    vy: c,
    halfRun: stair.run / 2,
    halfWidth: stair.width / 2,
  };
}

/**
 * World-space footprint rect corners, CCW, starting at the
 * downhill-left corner (local (-halfRun, -halfWidth)).
 */
export function stairWorldRect(stair: Staircase): QuadCorners {
  const fp = stairFootprint(stair);
  return rectCorners(fp, -fp.halfRun, fp.halfRun);
}

/**
 * Landing-hole rect (issue #80): the footprint extended ONE TREAD past
 * the TOP riser (uphill side only — landing clearance for the cresting
 * walker's head). Derived per #69 §A.2 — the Stair type carries no gap
 * field.
 */
export function stairHoleRect(stair: Staircase): QuadCorners {
  const fp = stairFootprint(stair);
  const tread = stair.run / stair.stepCount;
  return rectCorners(fp, -fp.halfRun, fp.halfRun + tread);
}

/**
 * CCW rect corners of a footprint with an asymmetric longitudinal
 * extent [lo, hi] (metres along the uphill axis from the centre).
 */
function rectCorners(fp: StairFootprint, lo: number, hi: number): QuadCorners {
  const p = (l: number, w: number): [number, number] => [
    snapRound(fp.cx + fp.ux * l + fp.vx * w),
    snapRound(fp.cy + fp.uy * l + fp.vy * w),
  ];
  // Basis (u, v) is positively oriented (det = 1), so touring
  // l then w in increasing order traces the ring CCW.
  return [
    [lo, -fp.halfWidth],
    [hi, -fp.halfWidth],
    [hi, fp.halfWidth],
    [lo, fp.halfWidth],
  ].map(([l, w]) => p(l, w)) as QuadCorners;
}

/**
 * Longitudinal progress of a plan point inside the footprint, in
 * [0, 1] (0 = downhill edge, 1 = top riser). Null when the point lies
 * outside the footprint. Shared by the compile-time validators and the
 * viewer's grounding resolver, so geometry and walking agree exactly.
 */
export function stairProgress(
  stair: Staircase,
  x: number,
  y: number,
): number | null {
  const fp = stairFootprint(stair);
  const rx = x - fp.cx;
  const ry = y - fp.cy;
  const s = rx * fp.ux + ry * fp.uy + fp.halfRun; // along-run, 0..run
  const w = rx * fp.vx + ry * fp.vy + fp.halfWidth; // across, 0..width
  const EPS = 1e-9;
  if (s < -EPS || s > stair.run + EPS) return null;
  if (w < -EPS || w > stair.width + EPS) return null;
  return clamp(s / stair.run, 0, 1);
}

/**
 * Build the step boxes of one stair (issue #80): stepCount solid
 * tread boxes, tread = run/N, riser = rise/N, marching local +x from
 * the departure plane zLower. Each box spans tread i longitudinally
 * and stands (i+1) risers tall — a closed-riser stack whose silhouette
 * is the classical stair profile. Deterministic: coordinates snap to
 * 1e-4 like every other emitter (golden-stable).
 */
export function buildStairSteps(
  stair: Staircase,
  zLower: number,
): MeshBuffer[] {
  const fp = stairFootprint(stair);
  const n = stair.stepCount;
  const tread = stair.run / n;
  const riser = stair.rise / n;
  const buffers: MeshBuffer[] = [];
  for (let i = 0; i < n; i += 1) {
    const s0 = i * tread;
    const s1 = (i + 1) * tread;
    const zTop = zLower + (i + 1) * riser;
    buffers.push(stepPrism(fp, s0, s1, zLower, zTop));
  }
  return buffers;
}

/**
 * Flank fencing boxes for one stair (issue #80): two thin rails along
 * the run's sides, z-band [zLower, zLower + rise] via the Aabb
 * minZ/maxZ seam so the walk rig's storey filter activates them only
 * while the walker is INSIDE the band (ascending or descending).
 *
 * Deliberately NOT player-radius expanded (unlike every wall box):
 * the resolver models the walker as a POINT among fattened boxes, so
 * raw flanks already stop the disc centre from exiting the footprint
 * sideways. Expanding by the full 0.3 m radius would pinch a 0.9 m
 * stair to a 0.28 m-centre corridor — impassable. compile.ts pushes
 * these as-is.
 */
export function stairFlankBoxes(stair: Staircase, zLower: number): Aabb[] {
  const fp = stairFootprint(stair);
  const off = fp.halfWidth + STAIR_FLANK_THICKNESS / 2;
  const boxes: Aabb[] = [];
  for (const side of [-1, 1] as const) {
    const cx = fp.cx + fp.vx * side * off;
    const cy = fp.cy + fp.vy * side * off;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [l, w] of [
      [-fp.halfRun, -STAIR_FLANK_THICKNESS / 2],
      [fp.halfRun, -STAIR_FLANK_THICKNESS / 2],
      [fp.halfRun, STAIR_FLANK_THICKNESS / 2],
      [-fp.halfRun, STAIR_FLANK_THICKNESS / 2],
    ] as const) {
      xs.push(cx + fp.ux * l + fp.vx * w);
      ys.push(cy + fp.uy * l + fp.vy * w);
    }
    boxes.push({
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
      minZ: zLower,
      maxZ: zLower + stair.rise,
    });
  }
  return boxes;
}

/**
 * One 8-vertex tread box: footprint-local longitudinal span [s0, s1]
 * (metres from the downhill edge) × full width × z band. Corner and
 * index layout mirror the furniture prisms (bottom ring 0..3 CCW, top
 * ring 4..7, 12 triangles).
 */
function stepPrism(
  fp: StairFootprint,
  s0: number,
  s1: number,
  z0: number,
  z1: number,
): MeshBuffer {
  const l0 = s0 - fp.halfRun;
  const l1 = s1 - fp.halfRun;
  const ring: Array<[number, number]> = (
    [
      [l0, -fp.halfWidth],
      [l1, -fp.halfWidth],
      [l1, fp.halfWidth],
      [l0, fp.halfWidth],
    ] as const
  ).map(([l, w]) => [
    fp.cx + fp.ux * l + fp.vx * w,
    fp.cy + fp.uy * l + fp.vy * w,
  ]);

  const positions = new Float32Array(8 * 3);
  ring.forEach(([x, y], i) => {
    positions[i * 3] = snapRound(x);
    positions[i * 3 + 1] = snapRound(y);
    positions[i * 3 + 2] = snapRound(z0);
    const t = (i + 4) * 3;
    positions[t] = snapRound(x);
    positions[t + 1] = snapRound(y);
    positions[t + 2] = snapRound(z1);
  });

  const indices = new Uint32Array([
    // bottom (faces down: reverse winding)
    0, 3, 2, 0, 2, 1,
    // top (faces up)
    4, 5, 6, 4, 6, 7,
    // sides
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ]);
  return { positions, indices };
}
