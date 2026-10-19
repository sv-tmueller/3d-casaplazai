/**
 * Issue #66 (Pkg 1): measure-tool annotation model.
 *
 * WHY THIS IS NOT IN FloorplanData: measurements are EDITOR-LOCAL
 * annotations. autosave.ts is strictly FloorplanData-shaped
 * (persistSync serializes the plan wholesale), so wedging annotations
 * into it would couple editor-local state to the undo/stream machinery.
 * They therefore persist SEPARATELY under localStorage key
 * `casaplaza.measurements.v1`, loaded once at mount and saved on every
 * mutation. No schema import beyond Pt — the interchange contract is
 * untouched.
 */
import type { Pt } from '../geom';
import { distancePointSegment, segmentAngleDegrees } from '../geom';
import { worldToScreen, type Camera } from '../controller';

export interface Measurement {
  id: string;
  a: Pt;
  b: Pt;
}

export const MEASURE_STORAGE_KEY = 'casaplaza.measurements.v1';

/** Euclidean distance between the two anchors, in meters. */
export function measurementDistance(m: Measurement): number {
  return Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
}

/** CCW-from-+X angle of a→b in degrees (see segmentAngleDegrees). */
export function measurementAngle(m: Measurement): number {
  return segmentAngleDegrees(m.a, m.b);
}

/** "4.24 m" — two decimals, mirroring the #60 wall-length labels. */
export function formatDistanceLabel(meters: number): string {
  return `${meters.toFixed(2)} m`;
}

/** "53.1°" — one decimal, clamped to [0, 360) after rounding (a raw
 * angle in [~359.95, 360) would otherwise format as "360.0°"; same
 * clamp as angleReadouts.ts — reviewer should-fix, cross-package parity). */
export function formatAngleLabel(degrees: number): string {
  const shown = Number(degrees.toFixed(1)) % 360;
  return `${shown.toFixed(1)}\u00B0`;
}

/** Combined pill text, e.g. "5.00 m · 53.1°". */
export function measurementLabelText(m: Measurement): string {
  return `${formatDistanceLabel(measurementDistance(m))} \u00B7 ${formatAngleLabel(measurementAngle(m))}`;
}

/** Screen offset of the label pill from the segment midpoint (px). */
export const LABEL_OFFSET_PX = 16;
/** Rough per-character advance for hit-testing an 11px label. */
const LABEL_CHAR_PX = 3.1;
/** Pill half-height used for hit-testing (px). */
const LABEL_HALF_H_PX = 10;
/** World-space hit radius for the no-camera fallback (meters). */
const LABEL_HIT_WORLD_M = 0.35;

/**
 * Screen position of the measurement's label pill: segment midpoint
 * offset perpendicular to the line, preferring the upside.
 */
export function measureLabelScreenPos(m: Measurement, cam: Camera): Pt {
  const sa = worldToScreen(cam, m.a);
  const sb = worldToScreen(cam, m.b);
  const mx = (sa[0] + sb[0]) / 2;
  const my = (sa[1] + sb[1]) / 2;
  const dx = sb[0] - sa[0];
  const dy = sb[1] - sa[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return [mx, my - LABEL_OFFSET_PX];
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny; // keep the pill above the line
  }
  return [mx + nx * LABEL_OFFSET_PX, my + ny * LABEL_OFFSET_PX];
}

/**
 * Hit-test a click against the measurement label pills. With `cam` the
 * point is in SCREEN px (the editor pointer path); without it the point
 * is WORLD meters and a click NEAR the segment hits. Returns the
 * topmost (last-added) hit, or null.
 */
export function labelHitTest(
  pt: Pt,
  measurements: Measurement[],
  cam?: Camera,
): Measurement | null {
  for (let i = measurements.length - 1; i >= 0; i -= 1) {
    const m = measurements[i];
    if (!cam) {
      if (distancePointSegment(pt, m.a, m.b) <= LABEL_HIT_WORLD_M) return m;
      continue;
    }
    const lp = measureLabelScreenPos(m, cam);
    const halfW = (measurementLabelText(m).length * LABEL_CHAR_PX) / 2 + 4;
    if (
      Math.abs(pt[0] - lp[0]) <= halfW &&
      Math.abs(pt[1] - lp[1]) <= LABEL_HALF_H_PX
    ) {
      return m;
    }
  }
  return null;
}

let idSeq = 0;
/** Fresh unique annotation id (editor-local; never a schema entity id). */
export function makeMeasureId(): string {
  idSeq += 1;
  return `measure-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

function isMeasurement(v: unknown): v is Measurement {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const ptOk = (p: unknown): p is Pt =>
    Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number');
  return typeof o.id === 'string' && ptOk(o.a) && ptOk(o.b);
}

/** Load persisted annotations; corrupt/missing data yields []. */
export function loadMeasurements(storage: Storage): Measurement[] {
  let raw: string | null;
  try {
    raw = storage.getItem(MEASURE_STORAGE_KEY);
  } catch {
    return []; // no-storage environments (stubs) are fine
  }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMeasurement);
  } catch {
    return [];
  }
}

/** Persist annotations; swallowing quota/security errors is intentional. */
export function saveMeasurements(storage: Storage, list: Measurement[]): void {
  try {
    storage.setItem(MEASURE_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* no-storage environments: dropping the save is harmless */
  }
}
