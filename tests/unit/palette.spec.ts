/**
 * Issue #126 (Pkg 14.x): the trailing `theme` param on paintScene selects
 * the dark canvas palette. A no-argument call stays the frozen light
 * palette (gridPitch/render.dedupe specs pin the same literals), so every
 * pre-#126 caller and test paints bit-identically.
 */
import { describe, expect, it } from 'vitest';
import type { Camera } from '../../src/editor/controller';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  paintScene,
} from '../../src/editor/render';
import type { ThemePreference } from '../../src/editor/model/theme';
import { RecordingCtx } from './helpers/recordingContext';

const CAM: Camera = { originX: 0, originY: 5, scale: 20 };

function emptyPlan(): FloorplanData {
  return migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [],
    openings: [],
    furniture: [],
  }).data!;
}

/** Records the fillStyle of every fillRect (BG is the first fill). */
class BgRecordingCtx extends RecordingCtx {
  fills: string[] = [];
  override fillRect(): void {
    this.fills.push(String(this.fillStyle));
  }
}

function paint(theme?: ThemePreference): BgRecordingCtx {
  const ctx = new BgRecordingCtx();
  if (theme === undefined) {
    paintScene(
      ctx as unknown as CanvasRenderingContext2D,
      800,
      600,
      CAM,
      emptyPlan(),
      { tag: 'idle' },
      null,
    );
  } else {
    paintScene(
      ctx as unknown as CanvasRenderingContext2D,
      800,
      600,
      CAM,
      emptyPlan(),
      { tag: 'idle' },
      null,
      null,
      null,
      null,
      null,
      undefined, // gridPitch: default
      null, // underlay
      null, // underlayImg
      false, // underlaySelected
      null, // marquee
      [], // multiSelectedIds
      theme,
    );
  }
  return ctx;
}

const gridStyles = (ctx: BgRecordingCtx): string[] =>
  ctx.strokes.map((s) => s.style);

describe('paintScene palettes (issue #126)', () => {
  it('keeps the frozen light palette for the default call', () => {
    const ctx = paint();
    expect(ctx.fills[0]).toBe(LIGHT_PALETTE.bg);
    expect(gridStyles(ctx)).toContain(LIGHT_PALETTE.gridMinor);
    expect(gridStyles(ctx)).not.toContain(DARK_PALETTE.gridMinor);
  });

  it('paints the dark palette when theme="dark"', () => {
    const ctx = paint('dark');
    expect(ctx.fills[0]).toBe(DARK_PALETTE.bg);
    expect(gridStyles(ctx)).toContain(DARK_PALETTE.gridMinor);
    expect(gridStyles(ctx)).not.toContain(LIGHT_PALETTE.gridMinor);
  });

  it('keeps both palettes fully distinct', () => {
    expect(LIGHT_PALETTE.bg).not.toBe(DARK_PALETTE.bg);
    expect(LIGHT_PALETTE.gridMinor).not.toBe(DARK_PALETTE.gridMinor);
    expect(LIGHT_PALETTE.gridMajor).not.toBe(DARK_PALETTE.gridMajor);
  });
});
