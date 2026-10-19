/**
 * Issue #67 (Pkg 2): LIVE angle readouts during gestures — one pill at
 * the drawn segment's midpoint while drawing a rectangle, two pills at
 * the dragged vertex's ADJACENT segments while resizing, one pill on
 * the hovered wall while an opening ghost is active.
 *
 * Gesture-live ONLY: the export path deliberately skips these (they
 * are transient affordances, not plan content). Gated by the same
 * "Dimensions" toggle as the measurement badges.
 */
import type { FloorplanData } from '../../shared/schema';
import type { Pt } from '../geom';
import { worldToScreen, type Camera, type InteractionPhase } from '../controller';
import { roomSegments } from '../model/openings';
import { segmentAngleDegrees } from '../model/angles';
import { drawPill } from './measurementBadges';

const ANGLE_FONT = '600 11px sans-serif';

/** One angle pill, computed purely in WORLD space. */
export interface AngleReadoutRow {
  /** World-space midpoint where the pill anchors. */
  mid: Pt;
  /** Formatted label, e.g. "45.0°". */
  text: string;
}

/** Hovered wall reference while an opening ghost is active. */
export interface HoverSegRef {
  roomId: string;
  segIndex: number;
}

function rowFor(a: Pt, b: Pt): AngleReadoutRow | null {
  // WORLD-frame angle: computed from world deltas BEFORE any
  // worldToScreen conversion — canvas Y is flipped, so deriving the
  // angle from screen deltas would invert north/south.
  const deg = segmentAngleDegrees(a[0], a[1], b[0], b[1]);
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { mid, text: `${deg.toFixed(1)}°` };
}

/**
 * PURE selector: which angle pills should be shown for the current
 * gesture state. Canvas-free, unit-specable.
 */
export function angleReadoutLabels(
  plan: FloorplanData,
  phase: InteractionPhase,
  hoverSeg: HoverSegRef | null,
): AngleReadoutRow[] {
  const rows: AngleReadoutRow[] = [];

  if (phase.tag === 'drawingRect') {
    const row = rowFor(phase.corner1, phase.cursor);
    if (row) rows.push(row);
  } else if (phase.tag === 'resizing') {
    const room = plan.rooms.find((r) => r.id === phase.selectedRoomId);
    if (room) {
      const poly = room.polygon;
      const n = poly.length;
      const vi = phase.vertexIndex;
      if (Number.isInteger(vi) && vi >= 0 && vi < n) {
        const prev = rowFor(poly[(vi - 1 + n) % n], poly[vi]);
        const next = rowFor(poly[vi], poly[(vi + 1) % n]);
        if (prev) rows.push(prev);
        if (next) rows.push(next);
      }
    }
  }

  if (rows.length === 0 && hoverSeg) {
    const room = plan.rooms.find((r) => r.id === hoverSeg.roomId);
    if (room) {
      const seg = roomSegments(room)[hoverSeg.segIndex];
      if (seg) {
        const row = rowFor(seg.a, seg.b);
        if (row) rows.push(row);
      }
    }
  }

  return rows;
}

/**
 * Paint the live angle pills. Mirrors paintMeasurementBadges: early
 * return when the Dimensions toggle hides measurements.
 */
export function paintAngleReadouts(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  plan: FloorplanData,
  phase: InteractionPhase,
  hoverSeg: HoverSegRef | null,
  visible = true,
): void {
  if (!visible) return;
  const rows = angleReadoutLabels(plan, phase, hoverSeg);
  if (rows.length === 0) return;
  ctx.save();
  ctx.font = ANGLE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const row of rows) {
    const s = worldToScreen(cam, row.mid);
    drawPill(ctx, s[0], s[1], row.text);
  }
  ctx.restore();
}
