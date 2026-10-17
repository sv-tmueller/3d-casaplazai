/**
 * Measures tests (issue #7): per-room areas, totals, formatting, and the
 * GOLDEN area-sum assertion derived from the demo fixture. Constants are
 * MEASURED from demo/demo-apartment.json (analytic rectangles/trapezoid),
 * not guessed:
 *   Living Room  5.4 × 3.6        = 19.44 m²
 *   Kitchen      3.2 × 3.6        = 11.52 m²
 *   Bed Nook     trapezoid        =  5.72 m²
 *                                 ----------
 *                        TOTAL     = 36.68 m²
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FloorplanData } from '../../src/shared/schema';
import {
  formatRoomLabel,
  formatTotal,
  measureRooms,
  roomAreaM2,
  totalLivableAreaM2,
} from '../../src/editor/measures';

const DEMO_TOTAL_M2 = 36.68;

function loadDemo(): FloorplanData {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'),
  ) as FloorplanData;
}

describe('measures — golden demo-fixture area sum (issue #7)', () => {
  it('totals the demo apartment to exactly 36.68 m²', () => {
    expect(totalLivableAreaM2(loadDemo())).toBeCloseTo(DEMO_TOTAL_M2, 6);
  });

  it('computes each demo room analytically', () => {
    const demo = loadDemo();
    const areas = measureRooms(demo);
    expect(areas.map((m) => Number(m.areaM2.toFixed(4)))).toEqual([
      19.44, 11.52, 5.72,
    ]);
    expect(areas.map((m) => m.name)).toEqual([
      'Living Room', 'Kitchen', 'Bed Nook',
    ]);
  });

  it('formats labels and totals with one decimal + m² suffix', () => {
    expect(
      formatRoomLabel({ roomId: 'r', name: 'Hall', areaM2: 4.5 }),
    ).toBe('Hall: 4.5 m²');
    expect(formatTotal(DEMO_TOTAL_M2)).toBe('Total: 36.7 m²');
  });

  it('ignores polygon winding (CW vs CCW) via abs()', () => {
    const cw = {
      id: 'cw',
      name: 'CW',
      polygon: [[0, 0], [0, 3], [3, 3], [3, 0]],
      floorTexture: null,
    } as Parameters<typeof roomAreaM2>[0];
    expect(roomAreaM2(cw)).toBeCloseTo(9, 6);
  });
});
