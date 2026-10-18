// @vitest-environment happy-dom
/**
 * Issue #46 — Pkg 2 navigation. Pure camera math lives as exported pure
 * functions in glue.ts (precedent: openingCommitNotice): computeFitCamera
 * fits the plan bbox with a margin, zoomAboutCenter scales about the
 * canvas midpoint with the shared zoom clamps.
 */
import { describe, expect, it } from 'vitest';
import {
  computeFitCamera,
  FIT_MARGIN,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  openingCommitNotice,
  ZOOM_BUTTON_STEP,
  zoomAboutCenter,
} from '../../src/editor/glue';
import { worldToScreen, type Camera } from '../../src/editor/controller';
import { emptyPlan } from '../../src/editor/store';
import type { FloorplanData, FurnitureItem, Room } from '../../src/shared/schema';
// #46 e2e constants — asserting these equal the real glue exports keeps the
// Playwright spec's hand-mirrored numbers honest (drift fails loudly here).
import * as e2eCam from '../../e2e/fixtures/camConstants';

describe('openingCommitNotice (#36 single-sided warning)', () => {
  it('warns when a single row was emitted (pierces only this wall)', () => {
    const notice = openingCommitNotice(0, 1);
    expect(notice).not.toBeNull();
    expect(notice).toContain('only this wall');
  });

  it('stays silent when the shared door emitted two rows', () => {
    expect(openingCommitNotice(0, 2)).toBeNull();
    expect(openingCommitNotice(3, 5)).toBeNull();
  });

  it('is silent for a no-op (no row added)', () => {
    expect(openingCommitNotice(2, 2)).toBeNull();
  });
});

describe('e2e camera constants sync guard (#46)', () => {
  it('mirrors the real glue constants so e2e drift fails loudly', () => {
    // CAM_SCALE mirrors glue's unexported INITIAL_SCALE: the neutral scale
    // computeFitCamera returns for an empty plan (see the fallback test).
    expect(e2eCam.CAM_SCALE).toBe(computeFitCamera(emptyPlan(), 800, 600).scale);
    expect(e2eCam.FIT_MARGIN).toBe(FIT_MARGIN);
    expect(e2eCam.BTN_ZOOM).toBe(ZOOM_BUTTON_STEP);
  });
});

const room = (id: string, polygon: Array<[number, number]>): Room => ({
  id,
  name: id,
  polygon,
  floorTexture: null,
  wallsOverride: [],
});

const item = (
  id: string,
  roomId: string,
  position: [number, number],
  footprint: [number, number],
): FurnitureItem => ({
  id,
  type: 'bed',
  roomId,
  position,
  rotationDeg: 0,
  footprint,
});

const planWith = (rooms: Room[], furniture: FurnitureItem[] = []): FloorplanData => ({
  ...emptyPlan(),
  rooms,
  furniture,
});

describe('computeFitCamera (#46 center)', () => {
  it('fits the plan bbox with margin and centers the origins', () => {
    // Room spans x:[0,4], y:[0,2]; canvas 800x600 -> scale = min(200,300)*0.9.
    const plan = planWith([room('r1', [[0, 0], [4, 0], [4, 2], [0, 2]])]);
    const w = 800;
    const h = 600;
    const cam = computeFitCamera(plan, w, h);

    const expectedScale = Math.min(w / 4, h / 2) * (1 - FIT_MARGIN);
    expect(cam.scale).toBeCloseTo(expectedScale, 6);
    // World bbox center (2,1) must land on the canvas midpoint.
    const [sx, sy] = worldToScreen(cam, [2, 1]);
    expect(sx).toBeCloseTo(w / 2, 6);
    expect(sy).toBeCloseTo(h / 2, 6);
    // Every corner stays inside the canvas.
    for (const [x, y] of [[0, 0], [4, 0], [4, 2], [0, 2]] as Array<[number, number]>) {
      const [px, py] = worldToScreen(cam, [x, y]);
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThanOrEqual(w);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThanOrEqual(h);
    }
  });

  it('unions every room and the furniture footprints into the bbox', () => {
    const plan = planWith(
      [room('r1', [[0, 0], [4, 0], [4, 2], [0, 2]])],
      [item('f1', 'r1', [5, 1], [1, 1])], // extends maxX to 5.5
    );
    const cam = computeFitCamera(plan, 800, 600);
    const bw = 5.5;
    const bh = 2;
    expect(cam.scale).toBeCloseTo(Math.min(800 / bw, 600 / bh) * (1 - FIT_MARGIN), 6);
  });

  it('falls back to the neutral camera for an empty plan', () => {
    expect(computeFitCamera(emptyPlan(), 800, 600)).toEqual({
      originX: 0,
      originY: 0,
      scale: 80,
    });
  });

  it('falls back to neutral for a zero-extent (degenerate) bbox', () => {
    const plan = planWith([room('r1', [[1, 1], [1, 1], [1, 1]])]);
    const cam = computeFitCamera(plan, 800, 600);
    expect(Number.isFinite(cam.scale)).toBe(true);
    expect(Number.isNaN(cam.originX)).toBe(false);
    expect(cam).toEqual({ originX: 0, originY: 0, scale: 80 });
  });
});

describe('zoomAboutCenter (#46 zoom buttons)', () => {
  const boot: Camera = { originX: 0, originY: 0, scale: 80 };

  it('uses a 1.2 step (distinct from the wheel 1.1)', () => {
    expect(ZOOM_BUTTON_STEP).toBeCloseTo(1.2, 6);
    const next = zoomAboutCenter(boot, ZOOM_BUTTON_STEP, 800, 600);
    expect(next.scale / boot.scale).toBeCloseTo(1.2, 6);
  });

  it('keeps the world point under the canvas midpoint invariant', () => {
    const w = 800;
    const h = 600;
    const before = zoomAboutCenter(boot, 1.4, w, h);
    const after = zoomAboutCenter(before, 1 / 1.2, w, h);
    // Midpoint world coords are stable across the pair of transforms.
    const midWorld = (cam: Camera): [number, number] => [
      (w / 2) / cam.scale + cam.originX,
      cam.originY - (h / 2) / cam.scale,
    ];
    expect(midWorld(after)[0]).toBeCloseTo(midWorld(boot)[0], 6);
    expect(midWorld(after)[1]).toBeCloseTo(midWorld(boot)[1], 6);
  });

  it('clamps to the existing MIN/MAX zoom scales', () => {
    const zoomedIn = zoomAboutCenter({ ...boot, scale: MAX_ZOOM_SCALE - 1 }, ZOOM_BUTTON_STEP, 800, 600);
    expect(zoomedIn.scale).toBe(MAX_ZOOM_SCALE);
    const zoomedOut = zoomAboutCenter({ ...boot, scale: MIN_ZOOM_SCALE + 1 }, 1 / ZOOM_BUTTON_STEP, 800, 600);
    expect(zoomedOut.scale).toBe(MIN_ZOOM_SCALE);
  });
});
