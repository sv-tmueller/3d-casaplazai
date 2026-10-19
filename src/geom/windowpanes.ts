/**
 * Window-pane geometry (issue #19): pure derivation of the glass-pane
 * rectangle for every `kind:'window'` opening. Mirrors the hole-span
 * math in `compile.buildRoomWalls` (partitionLongitudinal +
 * partitionVertical) so the pane fills EXACTLY the carved hole.
 *
 * Convention recap (validated against the compiled demo slabs):
 *   - `makeSegments(poly)[i]` connects polygon[i] → polygon[i+1 mod n].
 *   - `tCenter` is measured along the SEGMENT (not the polygon arc),
 *     so the hole center = a + u·(tCenter·len), spanning ± width/2.
 */

import type { FloorplanData, Vec2 } from '../shared/schema';
import { flatOpenings, flatRooms } from '../shared/schema';
import { makeSegments } from './mathutil';

/** One glass pane: a vertical rectangle filling a window's hole. */
export interface PaneRect {
  /** Owning opening's id (traceability/debug seams). */
  openingId: string;
  /**
   * Corner XYs ordered [bottomLeft, bottomRight, topRight, topLeft]
   * along the host segment's tangent. Indices 0/1 sit at `zBottom`,
   * 2/3 at `zTop`; for a vertical pane the top pair's XY equals the
   * matching bottom pair's XY (the sheet stands upright in the wall
   * plane).
   */
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** Bottom edge elevation (equals opening.sillHeight), meters. */
  zBottom: number;
  /** Top edge elevation (equals opening.headHeight), meters. */
  zTop: number;
}

/**
 * Compute the glass-pane rectangle for every window opening in the
 * plan. Doors are excluded entirely. Unknown rooms / out-of-range
 * segment indexes are skipped defensively (validation normally rejects
 * them upstream).
 */
export function windowPaneRects(plan: FloorplanData): PaneRect[] {
  const panes: PaneRect[] = [];
  const windows = flatOpenings(plan).filter((o) => o.kind === 'window');
  if (windows.length === 0) return panes;

  const byId = new Map(
    flatRooms(plan)
      .filter((r) => windows.some((o) => o.roomId === r.id))
      .map((r) => [r.id, r] as const),
  );

  for (const opening of windows) {
    const room = byId.get(opening.roomId);
    if (!room) continue;

    const segs = makeSegments(room.polygon);
    const seg = segs[opening.segmentIndex];
    if (!seg) continue;

    const centerDist = opening.tCenter * seg.len;
    const s0 = centerDist - opening.width / 2;
    const s1 = centerDist + opening.width / 2;

    const bl: Vec2 = [seg.ax + seg.ux * s0, seg.ay + seg.uy * s0];
    const br: Vec2 = [seg.ax + seg.ux * s1, seg.ay + seg.uy * s1];

    panes.push({
      openingId: opening.id,
      corners: [bl, br, [br[0], br[1]], [bl[0], bl[1]]],
      zBottom: opening.sillHeight,
      zTop: opening.headHeight,
    });
  }

  return panes;
}
