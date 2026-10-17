/**
 * Canvas-drawn measurement badges (issue #7). Drawn ON the canvas (not
 * HTML overlays) so they ride the export path for free and survive
 * pan/zoom. Anchored at each room's polygon centroid.
 */
import type { FloorplanData } from '../../shared/schema';
import type { Pt } from '../geom';
import { signedArea } from '../geom';
import { worldToScreen, type Camera } from '../controller';
import { formatRoomLabel } from '../measures';

const BADGE_FONT = '600 11px sans-serif';
const BADGE_TEXT_COLOR = '#1e3a5f';
const BADGE_BG = 'rgba(255, 255, 255, 0.82)';
const BADGE_BORDER = '#93c5fd';
const PAD_X = 5;
const PAD_Y = 3;

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

/** Paint one "{name}: {area} m²" pill at each room's centroid. */
export function paintMeasurementBadges(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  plan: FloorplanData,
): void {
  ctx.save();
  ctx.font = BADGE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const room of plan.rooms) {
    const area = Math.abs(signedArea(room.polygon));
    if (!(area > 0)) continue;
    const label = formatRoomLabel({
      roomId: room.id,
      name: room.name,
      areaM2: area,
    });
    const c = polygonCentroid(room.polygon);
    const s = worldToScreen(cam, c);

    const metrics = ctx.measureText(label);
    const tw = metrics.width;
    const th =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const bx = s[0] - tw / 2 - PAD_X;
    const by = s[1] - th / 2 - PAD_Y;
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
    ctx.fillText(label, s[0], s[1]);
  }
  ctx.restore();
}
