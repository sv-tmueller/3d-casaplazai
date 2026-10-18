/**
 * Window-pane geometry spec (issue #19): rect correctness against the
 * demo fixture's known window coordinates, plus defensive behaviors.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseValidatedPlan } from '../../src/geom';
import { windowPaneRects } from '../../src/geom/windowpanes';
import type { FloorplanData } from '../../src/shared/schema';

const demo: FloorplanData = parseValidatedPlan(
  JSON.parse(
    readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
  ),
);

describe('windowPaneRects — demo fixture', () => {
  const panes = windowPaneRects(demo);

  it('emits one pane per WINDOW opening (doors excluded)', () => {
    const windowsInPlan = demo.openings.filter((o) => o.kind === 'window');
    expect(panes.length).toBe(windowsInPlan.length);
    expect(panes.map((p) => p.openingId).sort()).toEqual([
      'window-bed-skylight',
      'window-kitchen-north',
      'window-living-east',
      'window-living-west',
    ]);
  });

  it('east window fills exactly the carved hole (x∈[2.54,3.94], y=3.6, z∈[0.9,2.3])', () => {
    const east = panes.find((p) => p.openingId === 'window-living-east');
    expect(east).toBeDefined();
    if (!east) return;

    const xs = east.corners.map((c) => c[0]);
    const ys = east.corners.map((c) => c[1]);
    expect(Math.min(...xs)).toBeCloseTo(2.54, 5);
    expect(Math.max(...xs)).toBeCloseTo(3.94, 5);
    // East window rides the living room's NORTH wall (y=3.6).
    for (const y of ys) expect(y).toBeCloseTo(3.6, 5);
    expect(east.zBottom).toBeCloseTo(0.9, 5);
    expect(east.zTop).toBeCloseTo(2.3, 5);
  });

  it('corner pairing is sane: BL/BR at sill, TL/TR at head, widths match', () => {
    for (const p of panes) {
      const [[blx, bly], [brx, bry], [trx, try_], [tlx, tly]] = p.corners;
      // Top pair shares XY with the bottom pair (vertical sheet).
      expect(trx).toBe(brx);
      expect(try_).toBe(bry);
      expect(tlx).toBe(blx);
      expect(tly).toBe(bly);
      // Span along the wall equals the opening width.
      expect(Math.hypot(brx - blx, bry - bly)).toBeCloseTo(
        demo.openings.find((o) => o.id === p.openingId)!.width,
        5,
      );
    }
  });

  it('covers every demo window with sensible elevations (no NaN)', () => {
    expect(panes.every((p) => Number.isFinite(p.zBottom))).toBe(true);
    expect(panes.every((p) => Number.isFinite(p.zTop))).toBe(true);
    expect(panes.every((p) => p.zTop > p.zBottom)).toBe(true);
  });
});

describe('windowPaneRects — defensive edges', () => {
  it('returns [] for plans without windows', () => {
    const doorsOnly: FloorplanData = {
      ...demo,
      openings: demo.openings.filter((o) => o.kind === 'door'),
    };
    expect(windowPaneRects(doorsOnly)).toEqual([]);
  });

  it('skips openings referencing unknown rooms (no crash)', () => {
    const orphan: FloorplanData = {
      ...demo,
      openings: [
        {
          id: 'ghost-window',
          roomId: 'room-nonexistent',
          kind: 'window',
          segmentIndex: 0,
          tCenter: 0.5,
          width: 1,
          sillHeight: 0.9,
          headHeight: 2.1,
        },
      ],
    };
    expect(windowPaneRects(orphan)).toEqual([]);
  });

  it('skips out-of-range segmentIndex entries (no crash)', () => {
    const badIdx: FloorplanData = {
      ...demo,
      openings: [
        {
          id: 'bad-window',
          roomId: 'room-living-room',
          kind: 'window',
          segmentIndex: 99,
          tCenter: 0.5,
          width: 1,
          sillHeight: 0.9,
          headHeight: 2.1,
        },
      ],
    };
    expect(windowPaneRects(badIdx)).toEqual([]);
  });
});
