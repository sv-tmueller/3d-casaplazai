// @vitest-environment happy-dom
/**
 * Walk view behaviour of the 3D engine (issue #147 CP2, reworked by #178):
 *  - seated walk from a pose (place camera, G15) never requests pointer
 *    lock and lands on the pose's storey;
 *  - leaving walk PARKS the pose (mode 'overview') instead of retracting
 *    it, so the Plan glyph keeps showing where the camera stood (G4);
 *  - an illegal pose falls back to the spawn solver; floorIdx clamps;
 *  - Esc (pointer unlock) stays in Walk with the prompt (lead ruling C3);
 *  - rebuilds re-apply the 3D settings (G5); a hidden viewer does not
 *    tick (G6).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPose, resetWalkerLink } from '../../src/shared/walkerLink';
import { EYE_HEIGHT, RECOMPILE_DEBOUNCE_MS } from '../../src/viewer/types';
import type { FloorplanData } from '../../src/shared/schema';
import { bootViewer, viewerStats, type Harness } from './helpers/viewerHarness';

type Ring = [[number, number], [number, number], [number, number], [number, number]];
const ring = (x1: number, y1: number, x2: number, y2: number): Ring => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

function twoStoreyPlan(): FloorplanData {
  return {
    schemaVersion: 2,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    floors: [
      {
        id: 'floor-ground',
        name: 'Ground',
        elevation: 0,
        rooms: [
          { id: 'living', name: 'Living', polygon: ring(0, 0, 6, 5), floorTexture: 'wood' },
          { id: 'kitchen', name: 'Kitchen', polygon: ring(0, 5, 3, 8), floorTexture: 'tile' },
        ],
        openings: [],
        furniture: [],
      },
      {
        id: 'floor-upper',
        name: 'Upper',
        elevation: 2.7,
        rooms: [{ id: 'belvedere', name: 'Belvedere', polygon: ring(0, 0, 4, 4), floorTexture: 'wood' }],
        openings: [],
        furniture: [],
      },
    ],
    stairs: [],
  } as unknown as FloorplanData;
}

const cam = () =>
  (window as unknown as { __viewerCam?: () => { posZ: number; discX?: number; discY?: number } }).__viewerCam?.();

describe('walk view (issue #147 CP2, #178)', () => {
  let h: Harness | null = null;
  beforeEach(() => resetWalkerLink());
  afterEach(() => {
    h?.dispose();
    h = null;
  });

  it('publishes no pose before anyone walked', () => {
    h = bootViewer(twoStoreyPlan());
    h.pump();
    expect(getPose()).toBeNull();
  });

  it('seats walk from a placed pose without pointer lock, on the pose storey', async () => {
    h = bootViewer(twoStoreyPlan());
    expect(h.app.requestMode('walk', { autoLock: false, pose: { x: 2.25, y: 2.5, yawRad: 0.6, floorIdx: 1, mode: 'walk' } })).toBe(true);
    await h.settle();
    h.pump();
    const pose = getPose();
    expect(pose?.mode).toBe('walk');
    expect(pose?.x).toBeCloseTo(2.25, 6);
    expect(pose?.y).toBeCloseTo(2.5, 6);
    expect(pose?.yawRad).toBeCloseTo(0.6, 6);
    expect(pose?.floorIdx).toBe(1);
    expect(h.requestLock).not.toHaveBeenCalled();
    expect(cam()?.posZ).toBeCloseTo(2.7 + EYE_HEIGHT, 3);
    expect(h.sink.modes.at(-1)).toBe('walk');
    expect(h.sink.affordances.at(-1)).toEqual({ overlay: true, reticle: false });
  });

  it('a user-initiated walk asks for the lock straight away', async () => {
    h = bootViewer(twoStoreyPlan());
    h.app.requestMode('walk');
    await h.settle();
    expect(h.requestLock).toHaveBeenCalled();
  });

  it('clamps an out-of-range floor and falls back to the solver for an illegal pose', async () => {
    h = bootViewer(twoStoreyPlan());
    // Far outside every room on a floor index that does not exist.
    h.app.requestMode('walk', { autoLock: false, pose: { x: 2.0, y: -0.0, yawRad: 0, floorIdx: 9, mode: 'overview' } });
    await h.settle();
    h.pump();
    const pose = getPose();
    expect(pose).not.toBeNull();
    expect(pose!.floorIdx).toBeLessThanOrEqual(1);
  });

  it('goto-room resolves the room storey and spawns inside that room', async () => {
    h = bootViewer(twoStoreyPlan());
    await h.app.gotoRoom('belvedere');
    await h.settle();
    h.pump();
    const pose = getPose();
    expect(pose?.floorIdx).toBe(1);
    expect(pose?.x).toBeGreaterThan(0);
    expect(pose?.x).toBeLessThan(4);
    expect(pose?.y).toBeGreaterThan(0);
    expect(pose?.y).toBeLessThan(4);
    expect(h.requestLock).not.toHaveBeenCalled();
  });

  it('ignores an unknown room without moving the walker', async () => {
    h = bootViewer(twoStoreyPlan());
    h.app.requestMode('walk', { autoLock: false, pose: { x: 2, y: 2, yawRad: 0, floorIdx: 0, mode: 'walk' } });
    await h.settle();
    h.pump();
    const placed = getPose();
    await h.app.gotoRoom('does-not-exist');
    h.pump();
    expect(getPose()?.x).toBeCloseTo(placed!.x, 6);
    expect(h.sink.toasts.at(-1)?.text).toBe('That room is not in the current plan.');
  });

  it('PARKS the pose when walk is left, so the plan glyph stays (G4)', async () => {
    h = bootViewer(twoStoreyPlan());
    h.app.requestMode('walk', { autoLock: false, pose: { x: 2, y: 2, yawRad: 0.3, floorIdx: 0, mode: 'walk' } });
    await h.settle();
    h.pump();
    h.app.requestMode('overview');
    await h.settle();
    h.pump();
    const parked = getPose();
    expect(parked).not.toBeNull();
    expect(parked?.mode).toBe('overview');
    expect(parked?.x).toBeCloseTo(2, 6);
    expect(h.sink.modes.at(-1)).toBe('overview');
  });

  it('hiding the viewer mid-walk ends walking at once and parks the pose', async () => {
    h = bootViewer(twoStoreyPlan());
    h.app.requestMode('walk', { autoLock: false, pose: { x: 2, y: 2, yawRad: 0, floorIdx: 0, mode: 'walk' } });
    await h.settle();
    h.pump();
    h.app.setActive(false);
    expect(h.app.mode()).toBe('overview');
    expect(getPose()?.mode).toBe('overview');
  });

  it('Esc (unlock) keeps the Walk view and brings the prompt back (ruling C3)', async () => {
    h = bootViewer(twoStoreyPlan());
    h.app.requestMode('walk', { autoLock: false });
    await h.settle();
    h.pump();
    document.dispatchEvent(new Event('pointerlockchange'));
    await h.settle();
    expect(h.app.mode()).toBe('walk');
    expect(h.sink.affordances.at(-1)).toEqual({ overlay: true, reticle: false });
  });

  it('refuses requests mid-transition and reports busy', () => {
    h = bootViewer(twoStoreyPlan());
    h.app.requestMode('walk', { autoLock: false });
    expect(h.app.busy()).toBe(true);
    expect(h.app.requestMode('overview')).toBe(false);
  });
});

describe('3D settings (G5) and activity (G6)', () => {
  let h: Harness | null = null;
  afterEach(() => {
    h?.dispose();
    h = null;
  });

  it('keeps the applied settings across a rebuild', () => {
    h = bootViewer(twoStoreyPlan(), { settings: { wallsAlpha: 0.5, roofs: false } });
    expect(h.app.settings().wallsAlpha).toBe(0.5);
    h.plan().floors[0].rooms[0].name = 'Renamed';
    h.notify();
    h.advance(RECOMPILE_DEBOUNCE_MS);
    expect(h.app.settings()).toMatchObject({ wallsAlpha: 0.5, roofs: false });
  });

  it('applySettings switches quality at runtime (the stats channel follows)', () => {
    h = bootViewer(twoStoreyPlan());
    expect(viewerStats().qualityLevel).toBe('high');
    h.app.applySettings({ ...h.app.settings(), quality: 'low' });
    expect(viewerStats().qualityLevel).toBe('low');
  });

  it('does not tick while hidden and resumes when shown', () => {
    h = bootViewer(twoStoreyPlan(), { active: false });
    h.pump();
    h.pump();
    expect(h.ticks()).toBe(0);
    h.app.setActive(true);
    h.pump();
    h.pump();
    expect(h.ticks()).toBe(2);
  });

  it('keeps rebuilding from store changes while hidden', () => {
    h = bootViewer(twoStoreyPlan(), { active: false });
    h.plan().floors[0].rooms[0].name = 'Hidden edit';
    h.notify();
    h.advance(RECOMPILE_DEBOUNCE_MS);
    expect(h.app.currentSignature()).toContain('Hidden edit');
  });
});
