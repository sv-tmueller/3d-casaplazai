/**
 * Issue #59 — render-only dedupe of paired openings.
 *
 * One physical cutout is stored as ONE Opening row per room (derivePairRows),
 * so the old per-row paint loop drew a paired door/window twice on the same
 * span. paintScene now paints one symbol per groupedPairs() group.
 *
 * We observe the painter through a recording canvas stub: each stroke/arc
 * captures the strokeStyle active at call time, so the door swing arc
 * (SWING_ARC) and the window glass bar (WINDOW_GLASS) are countable.
 */
import { describe, expect, it } from 'vitest';
import type { Camera } from '../../src/editor/controller';
import type { FloorplanData, Opening, OpeningKind, Room } from '../../src/shared/schema';
import { derivePairRows } from '../../src/editor/model/openings';
import { paintScene } from '../../src/editor/render';

const SWING_ARC = 'rgba(139, 90, 43, 0.35)';
const DOOR_LEAF = '#8b5a2b';
const WINDOW_GLASS = '#7ec8ff';
const SELECTED_SPAN = '#e67e22';

type Stroke = { style: string; lineWidth: number; from: [number, number]; to: [number, number] };

class RecordingCtx {
  strokeStyle = '';
  fillStyle = '';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  globalAlpha = 1;
  font = '';
  textAlign = 'left';
  textBaseline = 'alphabetic';
  strokes: Stroke[] = [];
  private cur: [number, number] = [0, 0];
  private from: [number, number] = [0, 0];
  clearRect(): void {}
  fillRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  save(): void {}
  restore(): void {}
  setLineDash(): void {}
  fill(): void {}
  fillText(): void {}
  rect(): void {}
  arc(): void {}
  moveTo(x: number, y: number): void {
    this.cur = [x, y];
    this.from = [x, y];
  }
  lineTo(x: number, y: number): void {
    this.cur = [x, y];
  }
  stroke(): void {
    this.strokes.push({
      style: String(this.strokeStyle),
      lineWidth: this.lineWidth,
      from: [...this.from] as [number, number],
      to: [...this.cur] as [number, number],
    });
  }
}

function squareRoom(id: string, x0: number, y0: number, w: number, h: number): Room {
  return {
    id,
    name: id,
    polygon: [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + h],
      [x0, y0 + h],
    ],
    floorTexture: null,
  };
}

/** Living (0,0)-(5,4) + Kitchen (5,0)-(8,4): shared wall x=5. */
function sharedWallPlan(openings: Opening[]): FloorplanData {
  return {
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [squareRoom('living', 0, 0, 5, 4), squareRoom('kitchen', 5, 0, 3, 4)],
    openings,
    furniture: [],
  };
}

function row(id: string, spec: { roomId: string; segmentIndex: number; tCenter: number }, kind: OpeningKind): Opening {
  return { id, kind, width: 0.9, sillHeight: 0, headHeight: 2.05, ...spec };
}

/** Paired rows on the shared wall: living seg 1 (up) + kitchen seg 3 (down). */
function pairedRows(kind: OpeningKind): Opening[] {
  const specs = derivePairRows(sharedWallPlan([]), {
    roomId: 'living',
    segmentIndex: 1,
    tCenter: 0.55,
    width: 0.9,
  });
  return specs.map((s, i) => row(`row-${i}`, s, kind));
}

const CAM: Camera = { originX: 0, originY: 5, scale: 20 };

function paint(openings: Opening[], selectedId: string | null = null): RecordingCtx {
  const ctx = new RecordingCtx();
  paintScene(
    ctx as unknown as CanvasRenderingContext2D,
    800,
    600,
    CAM,
    sharedWallPlan(openings),
    { tag: 'idle' },
    null,
    null,
    null,
    null,
    selectedId,
  );
  return ctx;
}

const countStyle = (ctx: RecordingCtx, style: string): number =>
  ctx.strokes.filter((s) => s.style === style).length;

describe('paintScene paired-opening dedupe (#59)', () => {
  it('paints a paired door group exactly once', () => {
    const rows = pairedRows('door');
    expect(rows).toHaveLength(2); // sanity: the fixture really pairs
    const ctx = paint(rows);
    // One swing arc per door symbol: 2 would mean the pair was drawn twice.
    expect(countStyle(ctx, SWING_ARC)).toBe(1);
    expect(countStyle(ctx, WINDOW_GLASS)).toBe(0);
  });

  it('paints an unpaired (single-row) door exactly once', () => {
    const solo = [row('solo-0', { roomId: 'living', segmentIndex: 0, tCenter: 0.5 }, 'door')];
    const ctx = paint(solo);
    expect(countStyle(ctx, SWING_ARC)).toBe(1);
  });

  it('paints a paired window group once (one glass bar per physical cutout)', () => {
    const ctx = paint(pairedRows('window'));
    expect(countStyle(ctx, WINDOW_GLASS)).toBe(1);
    expect(countStyle(ctx, SWING_ARC)).toBe(0);
  });

  it('highlights the whole span when EITHER paired row is selected', () => {
    const rows = pairedRows('door');
    const viaLiving = paint(rows, rows[0].id);
    const viaKitchen = paint(rows, rows[1].id);

    expect(countStyle(viaLiving, SELECTED_SPAN)).toBe(1);
    expect(countStyle(viaKitchen, SELECTED_SPAN)).toBe(1);

    const spanOf = (ctx: RecordingCtx): Stroke =>
      ctx.strokes.find((s) => s.style === SELECTED_SPAN) as Stroke;
    // Both selections resolve to the identical highlighted span.
    expect(spanOf(viaKitchen).from).toEqual(spanOf(viaLiving).from);
    expect(spanOf(viaKitchen).to).toEqual(spanOf(viaLiving).to);
    expect(spanOf(viaLiving).lineWidth).toBe(3);
  });

  it('draws no span highlight when nothing is selected', () => {
    const ctx = paint(pairedRows('door'), null);
    expect(countStyle(ctx, SELECTED_SPAN)).toBe(0);
    expect(countStyle(ctx, DOOR_LEAF)).toBeGreaterThan(0); // door still painted
  });

  it('does not mutate the openings array (store/hit-test rows untouched)', () => {
    const rows = pairedRows('door');
    const before = rows.map((r) => ({ ...r }));
    paint(rows);
    expect(rows).toEqual(before);
    expect(rows).toHaveLength(2);
  });
});
