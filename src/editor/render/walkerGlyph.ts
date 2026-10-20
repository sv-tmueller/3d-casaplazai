/**
 * Walker glyph (issue #147 CP4) — the editor's 2D half of the walk-nav
 * link.
 *
 * The viewer publishes its walker's plan pose over walkerLink; glue
 * mirrors it and calls drawWalkerGlyph so the figure being steered in
 * 3D is also visible on the plan. Everything here is SCREEN space and
 * fixed-size on purpose: a marker that scales with the camera would
 * vanish at plan zoom-out and dwarf rooms at zoom-in.
 *
 * Purity: like the angle readouts (#100), this is a LIVE-canvas
 * affordance. It is painted from repaint() only — the export painter
 * and the share-link payload (FloorplanData) never see it, which
 * tests/unit/walkerGlyph.spec.ts pins structurally.
 */

import type { WalkerPose } from '../../shared/walkerLink';
import { worldToScreen, type Camera } from '../controller';
import type { Pt } from '../geom';

/** Dot radius, screen px (the walker's footprint stand-in). */
const GLYPH_RADIUS_PX = 5;

/** Heading wedge length beyond the dot, screen px. */
const GLYPH_HEAD_LEN_PX = 16;

/** Heading wedge half-width at its base, screen px. */
const GLYPH_HEAD_HALF_W_PX = 5;

/** Aim ring radius while a place-camera drag is in flight, screen px. */
const AIM_RING_RADIUS_PX = 7;

const GLYPH_FILL = '#f97316';
const GLYPH_EDGE = 'rgba(15, 23, 42, 0.9)';

/**
 * Paint the mirrored walker: a dot at its plan position plus a wedge
 * along its heading. Plan +Y is screen UP (worldToScreen flips), so a
 * plan yaw θ (CCW from +X) becomes the screen direction
 * (cos θ, −sin θ) — north points up the canvas.
 */
export function drawWalkerGlyph(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pose: WalkerPose,
): void {
  const [cx, cy] = worldToScreen(cam, [pose.x, pose.y]);
  const dx = Math.cos(pose.yawRad);
  const dy = -Math.sin(pose.yawRad);
  // Screen-space perpendicular of (dx, dy), for the wedge base.
  const px = -dy;
  const py = dx;

  ctx.save();

  ctx.beginPath();
  ctx.arc(cx, cy, GLYPH_RADIUS_PX, 0, Math.PI * 2);
  ctx.fillStyle = GLYPH_FILL;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = GLYPH_EDGE;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + dx * GLYPH_HEAD_LEN_PX, cy + dy * GLYPH_HEAD_LEN_PX);
  ctx.lineTo(cx + px * GLYPH_HEAD_HALF_W_PX, cy + py * GLYPH_HEAD_HALF_W_PX);
  ctx.lineTo(cx - px * GLYPH_HEAD_HALF_W_PX, cy - py * GLYPH_HEAD_HALF_W_PX);
  ctx.closePath();
  ctx.fillStyle = GLYPH_FILL;
  ctx.fill();
  ctx.strokeStyle = GLYPH_EDGE;
  ctx.stroke();

  ctx.restore();
}

/**
 * Paint the in-flight place-camera gesture: a ring on the landing point
 * (the click position, which becomes the walker's plan point) and a
 * dashed rubber band toward the pointer — the band's direction becomes
 * the walker's heading when the drag clears the commit threshold.
 * `from` and `to` are already SCREEN px (evPos), matching the pointer
 * handlers' own space. A bare click (to == from) shows the ring alone.
 */
export function drawPlaceAim(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
): void {
  ctx.save();

  // Landing ring.
  ctx.beginPath();
  ctx.arc(from[0], from[1], AIM_RING_RADIUS_PX, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = GLYPH_FILL;
  ctx.stroke();

  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len >= 1) {
    // Dashed aim band (screen-space, so dash lengths stay legible at any
    // zoom).
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = GLYPH_FILL;
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead at the pointer end.
    const ux = dx / len;
    const uy = dy / len;
    const perpX = -uy;
    const perpY = ux;
    const head = 8;
    ctx.beginPath();
    ctx.moveTo(to[0], to[1]);
    ctx.lineTo(
      to[0] - ux * head + perpX * head * 0.5,
      to[1] - uy * head + perpY * head * 0.5,
    );
    ctx.lineTo(
      to[0] - ux * head - perpX * head * 0.5,
      to[1] - uy * head - perpY * head * 0.5,
    );
    ctx.closePath();
    ctx.fillStyle = GLYPH_FILL;
    ctx.fill();
  }

  ctx.restore();
}
