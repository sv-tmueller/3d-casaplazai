/**
 * Issue #68 — the grid painter honors the snap-settings pitch: the
 * number of grid strokes scales inversely with the pitch, and the
 * default (no argument) stays the legacy 0.5 m behavior. Mock pattern
 * mirrors render.dedupe.spec (recording 2D-context stub).
 */
import { describe, expect, it } from 'vitest';
import type { Camera } from '../../src/editor/controller';
import type { FloorplanData } from '../../src/shared/schema';
import { paintScene } from '../../src/editor/render';
import { RecordingCtx } from './helpers/recordingContext';

const CAM: Camera = { originX: 0, originY: 5, scale: 20 };

function emptyPlan(): FloorplanData {
  return {
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [],
    openings: [],
    furniture: [],
  };
}

function paint(gridPitch?: number): RecordingCtx {
  const ctx = new RecordingCtx();
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
    gridPitch,
  );
  return ctx;
}

/** Strokes painted in grid colors (minor + major lines). */
const gridStrokeCount = (ctx: RecordingCtx): number =>
  ctx.strokes.filter((s) => s.style === '#ececec' || s.style === '#dedede')
    .length;

describe('grid painter receives the snap pitch (issue #68)', () => {
  it('finer pitch draws proportionally more grid lines', () => {
    const half = gridStrokeCount(paint(0.5));
    const tenth = gridStrokeCount(paint(0.1));
    // Halving the pitch roughly doubles the line count on both axes.
    expect(tenth).toBeGreaterThan(half * 4);
  });

  it('quarter pitch lands between half and tenth densities', () => {
    const half = gridStrokeCount(paint(0.5));
    const quarter = gridStrokeCount(paint(0.25));
    const tenth = gridStrokeCount(paint(0.1));
    expect(quarter).toBeGreaterThan(half);
    expect(quarter).toBeLessThan(tenth);
  });

  it('default argument keeps the legacy 0.5 m grid', () => {
    expect(gridStrokeCount(paint())).toBe(gridStrokeCount(paint(0.5)));
  });

  it('coarse 1 m pitch draws the sparsest grid', () => {
    expect(gridStrokeCount(paint(1))).toBeLessThan(gridStrokeCount(paint(0.5)));
  });
});
