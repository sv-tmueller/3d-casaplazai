/**
 * Canvas-drawn measurement badges (issue #7). Drawn ON the canvas (not
 * HTML overlays) so they ride the export path for free and survive
 * pan/zoom. Anchored at each room's polygon centroid.
 */
import type { FloorplanData } from '../../shared/schema';
import { flatRooms } from '../../shared/schema';
import type { Pt } from '../geom';
import { signedArea } from '../geom';
import { worldToScreen, type Camera } from '../controller';
import { formatRoomLabel } from '../measures';
import {
  PAIR_TOLERANCE_M,
  roomSegments,
  segmentNormal,
  type SegmentInfo,
} from '../model/openings';
import {
  measureLabelScreenPos,
  measurementLabelText,
  type Measurement,
} from '../model/measure';

const BADGE_FONT = '600 11px sans-serif';
const BADGE_TEXT_COLOR = '#1e3a5f';
const BADGE_BG = 'rgba(255, 255, 255, 0.82)';
const BADGE_BORDER = '#93c5fd';
const PAD_X = 5;
const PAD_Y = 3;

/** Issue #60: per-wall length labels. */
/** Outward normal offset of a wall label, in screen px. */
const WALL_LABEL_OFFSET_PX = 12;
/** Hide a wall label whose on-screen run length falls below this (px). */
const WALL_LABEL_MIN_PX = 60;
/** Intervals closer than this in meters are one contiguous run. */
const RUN_MERGE_EPS_M = 1e-9;
/** Segments shorter than this are ignored (degenerate vertices). */
const MIN_SEG_M = 1e-9;

/** Area-weighted polygon centroid (correct for non-rectangular rings). */
export function polygonCentroid(poly: Pt[]): Pt {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate ring: fall back to vertex average.
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / poly.length, sy / poly.length];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

/**
 * Issue #60 (Pkg 2): per-wall length labels.
 *
 * LIMITATION: labels derive from ROOM POLYGON SEGMENTS only. Walls
 * described by `wallsOverride` or curved/arc geometry have no polygon
 * segment to measure, so they are not labelled — consistent with how
 * snapping and collinear pairing already treat walls.
 *
 * Every room's segments are gathered, collinear ones (endpoints within
 * PAIR_TOLERANCE_M of a shared line — the same perpendicular predicate
 * `sharedWallOverlap` uses for pairing) are grouped, and each group's
 * intervals are projected onto the shared line and UNIONed. One label is
 * emitted per CONTIGUOUS union run. Interval-union (not per-segment
 * suppression) guarantees a staggered shared wall prints a single,
 * maximal run length instead of two different per-room lengths.
 */

/** One contiguous wall run, ready to draw. */
export interface WallLengthLabel {
  /** World midpoint of the run. */
  mid: Pt;
  /** Outward unit normal at the run mid (points away from the room). */
  normal: Pt;
  /** Physical run length in meters. */
  lengthM: number;
  /** Formatted label, e.g. "3.50 m". */
  text: string;
}

interface ProjectedInterval {
  lo: number;
  hi: number;
}

/** True when `cand`'s endpoints lie within `tol` of `ref`'s LINE. */
function collinearWithin(
  ref: SegmentInfo,
  cand: SegmentInfo,
  tol: number,
): boolean {
  const len = ref.length;
  if (!(len > 0)) return false;
  const ux = (ref.b[0] - ref.a[0]) / len;
  const uy = (ref.b[1] - ref.a[1]) / len;
  const perp = (p: Pt): number =>
    Math.abs(-uy * (p[0] - ref.a[0]) + ux * (p[1] - ref.a[1]));
  return perp(cand.a) <= tol && perp(cand.b) <= tol;
}

/** Union collinear intervals into contiguous [lo,hi] runs (sorted). */
function unionIntervals(list: ProjectedInterval[]): ProjectedInterval[] {
  const sorted = [...list].sort((a, b) => a.lo - b.lo);
  const merged: ProjectedInterval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.lo <= last.hi + RUN_MERGE_EPS_M) {
      last.hi = Math.max(last.hi, iv.hi);
    } else {
      merged.push({ lo: iv.lo, hi: iv.hi });
    }
  }
  return merged;
}

/** Emit one label per contiguous run of a collinear group. */
function runLabels(
  anchor: SegmentInfo,
  group: SegmentInfo[],
  centroid: Pt,
): WallLengthLabel[] {
  const len = anchor.length;
  const ux = (anchor.b[0] - anchor.a[0]) / len;
  const uy = (anchor.b[1] - anchor.a[1]) / len;
  const along = (p: Pt): number =>
    ux * (p[0] - anchor.a[0]) + uy * (p[1] - anchor.a[1]);
  const n0 = segmentNormal(anchor);
  const runs = unionIntervals(
    group.map((s) => {
      const a = along(s.a);
      const b = along(s.b);
      return { lo: Math.min(a, b), hi: Math.max(a, b) };
    }),
  );
  const out: WallLengthLabel[] = [];
  for (const run of runs) {
    const lengthM = run.hi - run.lo;
    if (!(lengthM > 0)) continue;
    const t = (run.lo + run.hi) / 2;
    const mid: Pt = [anchor.a[0] + ux * t, anchor.a[1] + uy * t];
    const dx = mid[0] - centroid[0];
    const dy = mid[1] - centroid[1];
    // Outward: flip the anchor's inward normal when it points at the room.
    const normal: Pt =
      n0[0] * dx + n0[1] * dy >= 0 ? [n0[0], n0[1]] : [-n0[0], -n0[1]];
    out.push({ mid, normal, lengthM, text: `${lengthM.toFixed(2)} m` });
  }
  return out;
}

/** Pure computation: per-wall length labels for a plan (issue #60). */
export function wallLengthLabels(
  plan: FloorplanData,
  tol: number = PAIR_TOLERANCE_M,
): WallLengthLabel[] {
  const entries: Array<{ seg: SegmentInfo; centroid: Pt }> = [];
  for (const room of flatRooms(plan)) {
    if (room.polygon.length < 3) continue;
    const centroid = polygonCentroid(room.polygon);
    for (const seg of roomSegments(room)) {
      if (seg.length > MIN_SEG_M) entries.push({ seg, centroid });
    }
  }
  const used = entries.map(() => false);
  const out: WallLengthLabel[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    if (used[i]) continue;
    used[i] = true;
    const anchor = entries[i];
    const group: SegmentInfo[] = [anchor.seg];
    for (let j = i + 1; j < entries.length; j += 1) {
      if (used[j]) continue;
      if (collinearWithin(anchor.seg, entries[j].seg, tol)) {
        used[j] = true;
        group.push(entries[j].seg);
      }
    }
    out.push(...runLabels(anchor.seg, group, anchor.centroid));
  }
  return out;
}

/** Paint one rounded pill with centred text at (x, y). */
export function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
): void {
  const metrics = ctx.measureText(label);
  const tw = metrics.width;
  const th = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  const bx = x - tw / 2 - PAD_X;
  const by = y - th / 2 - PAD_Y;
  const bw = tw + PAD_X * 2;
  const bh = th + PAD_Y * 2;
  ctx.fillStyle = BADGE_BG;
  ctx.strokeStyle = BADGE_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BADGE_TEXT_COLOR;
  ctx.fillText(label, x, y);
}

/**
 * Paint room-area pills at each room centroid AND per-wall length pills
 * (issue #60). `visible` gates BOTH kinds: one "Dimensions" toggle
 * governs wall labels and room badges together. Wall labels are hidden
 * once their on-screen run length drops below WALL_LABEL_MIN_PX.
 */
export function paintMeasurementBadges(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  plan: FloorplanData,
  visible = true,
): void {
  if (!visible) return;
  ctx.save();
  ctx.font = BADGE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Issue #60: wall length labels, offset along the outward normal.
  for (const lbl of wallLengthLabels(plan)) {
    if (lbl.lengthM * cam.scale < WALL_LABEL_MIN_PX) continue;
    const s = worldToScreen(cam, lbl.mid);
    const x = s[0] + lbl.normal[0] * WALL_LABEL_OFFSET_PX;
    // worldToScreen flips Y, so the screen normal is (nx, -ny).
    const y = s[1] - lbl.normal[1] * WALL_LABEL_OFFSET_PX;
    drawPill(ctx, x, y, lbl.text);
  }

  for (const room of flatRooms(plan)) {
    const area = Math.abs(signedArea(room.polygon));
    if (!(area > 0)) continue;
    const label = formatRoomLabel({
      roomId: room.id,
      name: room.name,
      areaM2: area,
    });
    const c = polygonCentroid(room.polygon);
    const s = worldToScreen(cam, c);
    drawPill(ctx, s[0], s[1], label);
  }
  ctx.restore();
}

/* ========== issue #66 (Pkg 1): measure-tool annotations ========== */

/** Half-length of the dimension end ticks, in screen px. */
const DIM_TICK_PX = 5;

/**
 * Issue #66: two-point dimension annotations — main line, end ticks,
 * and an offset label pill "4.24 m · 53.1°". Gated by the SAME
 * Dimensions toggle as the wall/room badges (hide criterion).
 */
export function paintMeasureAnnotations(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  measurements: Measurement[],
  visible = true,
): void {
  if (!visible || measurements.length === 0) return;
  ctx.save();
  ctx.font = BADGE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.5;
  for (const m of measurements) {
    const sa = worldToScreen(cam, m.a);
    const sb = worldToScreen(cam, m.b);
    ctx.beginPath();
    ctx.moveTo(sa[0], sa[1]);
    ctx.lineTo(sb[0], sb[1]);
    ctx.stroke();
    const dx = sb[0] - sa[0];
    const dy = sb[1] - sa[1];
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      for (const s of [sa, sb]) {
        ctx.beginPath();
        ctx.moveTo(s[0] - nx * DIM_TICK_PX, s[1] - ny * DIM_TICK_PX);
        ctx.lineTo(s[0] + nx * DIM_TICK_PX, s[1] + ny * DIM_TICK_PX);
        ctx.stroke();
      }
    }
    const lp = measureLabelScreenPos(m, cam);
    drawPill(ctx, lp[0], lp[1], measurementLabelText(m));
  }
  ctx.restore();
}
