// @vitest-environment happy-dom
/**
 * Canvas engine behind the EditorEngine interface (issue #178, design
 * §8.3; gaps G1, G6, G10, G14). The engine owns its canvas and talks to
 * the shell only through methods and events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeFitCamera,
  createCanvasEngine,
  FIT_MARGIN,
  ZOOM_BUTTON_STEP,
} from '../../src/editor/canvasEngine';
import { ZOOM_BUTTON_FACTOR, type EditorEngine } from '../../src/editor/engine';
import { worldToScreen } from '../../src/editor/controller';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import type { FloorplanData } from '../../src/shared/schema';
import { paintScene } from '../../src/editor/render';
import { RecordingCtx } from './helpers/recordingContext';

function squarePlan(): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms.push({
    id: 'r1',
    name: 'Living',
    polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
    floorTexture: null,
    wallsOverride: [],
  } as never);
  return p;
}

describe('computeFitCamera with panel insets (issue #178)', () => {
  it('centres the plan in the region the floating panels leave free', () => {
    const plan = squarePlan();
    const insets = { left: 304, right: 0, top: 0, bottom: 0 };
    const cam = computeFitCamera(plan, 1304, 600, insets);
    const free = 1304 - 304;
    const expectScale = Math.min(free / 4, 600 / 3) * (1 - FIT_MARGIN);
    expect(cam.scale).toBeCloseTo(expectScale, 6);
    const centre = worldToScreen(cam, [2, 1.5]);
    expect(centre[0]).toBeCloseTo(304 + free / 2, 6);
    expect(centre[1]).toBeCloseTo(300, 6);
  });

  it('ignores insets that would leave no room', () => {
    const plan = squarePlan();
    expect(computeFitCamera(plan, 400, 300, { left: 380, right: 0, top: 0, bottom: 0 })).toEqual(
      computeFitCamera(plan, 400, 300),
    );
  });

  it('the shell zoom factor is the engine button step', () => {
    expect(ZOOM_BUTTON_FACTOR).toBe(ZOOM_BUTTON_STEP);
  });
});

describe('paintScene grid flag (View tab Grid toggle)', () => {
  const grid = (show: boolean): number => {
    const ctx = new RecordingCtx();
    paintScene(
      ctx as unknown as CanvasRenderingContext2D, 800, 600, { originX: 0, originY: 5, scale: 20 },
      emptyPlan(), { tag: 'idle' }, null, null, null, null, null, 0.5, null, null, false, null, [], 'light', show,
    );
    return ctx.strokes.filter((s) => s.style === '#ececec' || s.style === '#dedede').length;
  };
  it('skips the grid when hidden and draws it by default', () => {
    expect(grid(true)).toBeGreaterThan(0);
    expect(grid(false)).toBe(0);
  });
});

describe('createCanvasEngine', () => {
  let engine: EditorEngine;
  let store: EditorStore;
  let wrap: HTMLDivElement;
  let size = { width: 0, height: 0 };

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="wrap"><canvas></canvas></div>';
    wrap = document.getElementById('wrap') as HTMLDivElement;
    size = { width: 0, height: 0 };
    const rect = () => ({ ...size, left: 0, top: 0, right: size.width, bottom: size.height, x: 0, y: 0, toJSON() {} }) as DOMRect;
    wrap.getBoundingClientRect = rect;
    const canvas = wrap.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = rect;
    store = new EditorStore(emptyPlan());
    engine = createCanvasEngine({ canvas, store });
  });
  afterEach(() => engine.dispose());

  it('emits tool and hint events on setTool', () => {
    const tools: string[] = [];
    const hints: string[] = [];
    engine.on('tool', ({ tool }) => tools.push(tool));
    engine.on('hint', ({ text }) => hints.push(text));
    engine.setTool('door');
    expect(engine.tool()).toBe('door');
    expect(tools).toEqual(['door']);
    expect(hints.at(-1)).toMatch(/door/i);
  });

  it('emits a selection descriptor on every store notify', () => {
    const kinds: string[] = [];
    engine.on('selection', ({ descriptor }) => kinds.push(descriptor.kind));
    store.replaceAll(squarePlan());
    store.dispatch({ type: 'setEntitySelection', entityId: 'r1' });
    expect(kinds.at(-1)).toBe('room');
    expect(engine.hasDeletableSelection()).toBe(true);
  });

  it('defers fitPlan while the canvas is hidden, then fits on the next resize', () => {
    store.replaceAll(squarePlan());
    const before = engine.camera();
    engine.fitPlan();
    expect(engine.camera()).toEqual(before);
    size = { width: 800, height: 600 };
    engine.resize();
    expect(engine.camera()).toEqual(computeFitCamera(squarePlan(), 800, 600, { left: 0, right: 0, top: 0, bottom: 0 }));
  });

  it('fits on a floor change but not on a plan swap (bridge loadPlan, G14)', () => {
    size = { width: 800, height: 600 };
    engine.resize();
    const plan = squarePlan();
    plan.floors.push({ ...plan.floors[0], id: 'f1', name: 'Upper', elevation: 3, rooms: [{ ...plan.floors[0].rooms[0], id: 'r2', polygon: [[10, 10], [12, 10], [12, 12], [10, 12]] }] } as never);
    const neutral = engine.camera();
    store.replaceAll(plan);
    expect(engine.camera()).toEqual(neutral);
    store.dispatch({ type: 'setActiveFloor', index: 1 });
    expect(engine.camera()).not.toEqual(neutral);
    expect(engine.camera().originX).toBeGreaterThan(5);
  });

  it('gates the Space-hold pan on setInputEnabled (G1)', () => {
    engine.setInputEnabled(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(engine.tool()).toBe('select');
    engine.setInputEnabled(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(engine.tool()).toBe('pan');
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(engine.tool()).toBe('select');
  });

  it('owns no tool hotkeys any more (the shell dispatcher does)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    expect(engine.tool()).toBe('select');
  });

  it('overlay, snap and furniture setters emit events', () => {
    const seen: string[] = [];
    engine.on('overlays', (o) => seen.push(`o:${o.dimensions}:${o.grid}`));
    engine.on('snap', (s) => seen.push(`s:${s.settings.pitch}`));
    engine.on('furniture', (f) => seen.push(`f:${f.type}`));
    engine.setGridVisible(false);
    engine.setDimensionsVisible(false);
    engine.setSnapSettings({ pitch: 1, master: true });
    engine.armFurniture('sofa');
    expect(seen).toEqual(['o:true:false', 'o:false:false', 's:1', 'f:sofa']);
    expect(engine.armedFurniture()).toBe('sofa');
  });

  it('clears measurements through resetEditorState and emits them', () => {
    const counts: number[] = [];
    engine.on('measurements', ({ items }) => counts.push(items.length));
    engine.resetEditorState({ measurements: true });
    expect(counts.at(-1)).toBe(0);
  });

  it('addressLeanWall needs a selected room', () => {
    expect(engine.addressLeanWall()).toBe(false);
    store.replaceAll(squarePlan());
    store.dispatch({ type: 'setEntitySelection', entityId: 'r1' });
    expect(engine.addressLeanWall()).toBe(true);
    expect(engine.selection().kind).toBe('wall');
  });

  it('place camera arms without a viewer and emits its state', () => {
    const armed = vi.fn();
    engine.on('placeCamera', armed);
    engine.setPlaceCameraArmed(true);
    expect(engine.placeCameraArmed()).toBe(true);
    expect(armed).toHaveBeenLastCalledWith({ armed: true });
  });

  it('dispose detaches the window listeners', () => {
    engine.dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(engine.tool()).toBe('select');
  });
});
