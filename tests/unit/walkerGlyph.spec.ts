/**
 * Walker glyph (issue #147 CP4): the editor's 2D half of the walk-nav
 * link. Pins the screen-space geometry (position, heading direction,
 * zoom-independent size) with a recording 2D context — the module takes
 * a raw CanvasRenderingContext2D, so a plain recording object stands in
 * for one, no canvas needed.
 *
 * The last block is an ANTI-DRIFT pin on the purity rule: the glyph and
 * the place-camera aim are LIVE-canvas affordances (the angle-readout
 * precedent, #100) and must never leak into the export painter — and
 * therefore never into PNG/JPEG exports or share links.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  drawPlaceAim,
  drawWalkerGlyph,
} from '../../src/editor/render/walkerGlyph';
import type { Camera } from '../../src/editor/controller';
import type { WalkerPose } from '../../src/shared/walkerLink';

interface Op {
  op: string;
  args: unknown[];
}

function recordingCtx(): {
  ctx: CanvasRenderingContext2D;
  ops: Op[];
} {
  const ops: Op[] = [];
  const push =
    (op: string) =>
    (...args: unknown[]): void => {
      ops.push({ op, args });
    };
  const ctx = {
    save: push('save'),
    restore: push('restore'),
    beginPath: push('beginPath'),
    closePath: push('closePath'),
    moveTo: push('moveTo'),
    lineTo: push('lineTo'),
    arc: push('arc'),
    fill: push('fill'),
    stroke: push('stroke'),
    setLineDash: push('setLineDash'),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const pose = (over: Partial<WalkerPose> = {}): WalkerPose => ({
  x: 1.5,
  y: 2,
  yawRad: 0,
  floorIdx: 0,
  mode: 'walk',
  ...over,
});

/** Camera whose world→screen maps (1.5, 2) to (150, 300). */
const cam: Camera = { originX: 0, originY: 5, scale: 100 };

describe('drawWalkerGlyph (issue #147 CP4)', () => {
  it('places the dot at the walker position with a fixed radius', () => {
    const { ctx, ops } = recordingCtx();
    drawWalkerGlyph(ctx, cam, pose());
    const arc = ops.find((o) => o.op === 'arc');
    expect(arc?.args).toEqual([150, 300, 5, 0, Math.PI * 2]);
    expect(ops.at(0)?.op).toBe('save');
    expect(ops.at(-1)?.op).toBe('restore');
  });

  it('points the heading wedge along the plan yaw (screen-up = plan north)', () => {
    const { ctx, ops } = recordingCtx();
    // yaw 0 ⇒ +X ⇒ screen-right, level.
    drawWalkerGlyph(ctx, cam, pose({ yawRad: 0 }));
    expect(ops.find((o) => o.op === 'moveTo')?.args).toEqual([166, 300]);
    const level = ops.filter((o) => o.op === 'lineTo').map((o) => o.args);
    expect(level).toEqual([
      [150, 305],
      [150, 295],
    ]);

    // yaw π/2 ⇒ +Y ⇒ plan north ⇒ screen UP (worldToScreen flips y).
    const up = recordingCtx();
    drawWalkerGlyph(up.ctx, cam, pose({ yawRad: Math.PI / 2 }));
    const upTip = up.ops.find((o) => o.op === 'moveTo')?.args ?? [];
    expect(upTip[0]).toBeCloseTo(150, 6);
    expect(upTip[1]).toBeCloseTo(284, 6);
  });

  it('keeps its screen size across zoom levels', () => {
    // Same walker, same target screen point, camera 4× in (the origin
    // compensates: originX = wx − sx/scale, originY = wy + sy/scale) —
    // the op stream must be identical, i.e. the glyph is screen-sized.
    const a = recordingCtx();
    drawWalkerGlyph(a.ctx, cam, pose());
    const b = recordingCtx();
    drawWalkerGlyph(
      b.ctx,
      // originX = 1.5 − 150/400, originY = 2 + 300/400
      { originX: 1.125, originY: 2.75, scale: 400 },
      pose(),
    );
    expect(b.ops).toEqual(a.ops);
  });
});

describe('drawPlaceAim (issue #147 CP4)', () => {
  it('rings the landing point and rubber-bands to the pointer', () => {
    const { ctx, ops } = recordingCtx();
    drawPlaceAim(ctx, [10, 10], [40, 50]);
    expect(ops.find((o) => o.op === 'arc')?.args).toEqual([10, 10, 7, 0, Math.PI * 2]);
    expect(ops.find((o) => o.op === 'setLineDash')?.args).toEqual([[6, 4]]);
    const moves = ops.filter((o) => o.op === 'moveTo').map((o) => o.args);
    expect(moves).toContainEqual([10, 10]);
    expect(ops.filter((o) => o.op === 'lineTo')).toContainEqual(
      expect.objectContaining({ args: [40, 50] }),
    );
    // Arrowhead closed and filled.
    expect(ops.filter((o) => o.op === 'closePath').length).toBe(1);
    expect(ops.filter((o) => o.op === 'fill').length).toBeGreaterThan(0);
  });

  it('shows the ring alone for a bare click (no aim band)', () => {
    const { ctx, ops } = recordingCtx();
    drawPlaceAim(ctx, [10, 10], [10, 10]);
    expect(ops.filter((o) => o.op === 'lineTo')).toEqual([]);
    expect(ops.filter((o) => o.op === 'setLineDash')).toEqual([]);
  });
});

describe('glyph purity anti-drift (issue #147 CP4)', () => {
  const read = (rel: string): string =>
    readFileSync(join(process.cwd(), rel), 'utf8');

  it('paints the glyph from repaint() only — never from the export painter', () => {
    const glue = read('src/editor/glue.ts');

    // Exactly one call site…
    const calls = [...glue.matchAll(/drawWalkerGlyph\(/g)].map((m) => m.index ?? -1);
    expect(calls).toHaveLength(1);

    // …and it lives inside repaint() (up to the next member declaration).
    const repaintStart = glue.indexOf('function repaint(): void {');
    expect(repaintStart).toBeGreaterThan(-1);
    const afterRepaint = glue.indexOf('\n  function ', repaintStart);
    expect(afterRepaint).toBeGreaterThan(repaintStart);
    expect(calls[0]).toBeGreaterThan(repaintStart);
    expect(calls[0]).toBeLessThan(afterRepaint);

    // The export painter (defined in the same file) knows nothing of it.
    const exportStart = glue.indexOf('function exportPainterFactory(');
    expect(exportStart).toBeGreaterThan(-1);
    const exportEnd = glue.indexOf('\n  function ', exportStart);
    const exportBody = glue.slice(exportStart, exportEnd);
    expect(exportBody).not.toContain('drawWalkerGlyph');
    expect(exportBody).not.toContain('walkerPose');
  });

  it('keeps walker wording out of the export + share-link modules', () => {
    for (const rel of ['src/editor/export.ts', 'src/editor/wire.ts']) {
      expect(read(rel).toLowerCase()).not.toContain('walker');
    }
  });
});
