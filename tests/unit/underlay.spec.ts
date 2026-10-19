/**
 * Issue #99 (Pkg 12.1) — blueprint underlay: model parse/validate,
 * per-floor isolation, lock semantics, and the geometry seams
 * (corners / nudge / rotate / corner-resize / handle hit-test).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pt } from '../../src/editor/geom';
import {
  loadUnderlayMap,
  nudgeUnderlay,
  parseUnderlayState,
  resizeUnderlayFromCorner,
  rotateUnderlayBy,
  saveUnderlayMap,
  underlayCorners,
  underlayHandleAt,
  underlayInteractable,
  UNDERLAY_MIN_SIDE_M,
  UNDERLAY_STORAGE_KEY,
  type UnderlayState,
} from '../../src/editor/model/underlay';
import { EditorStore, underlayFor } from '../../src/editor/store';
import { emptyPlan } from '../../src/editor/store';

class FakeStorage implements Storage {
  map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

const PNG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AL+kQ==';

function sample(overrides: Partial<UnderlayState> = {}): UnderlayState {
  return {
    dataUrl: PNG_URL,
    cx: 1,
    cy: -2,
    w: 4,
    h: 2,
    rotDeg: 0,
    opacity: 60,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

describe('underlay model (issue #99)', () => {
  describe('parseUnderlayState', () => {
    it('accepts a well-formed row', () => {
      expect(parseUnderlayState(sample())).toEqual(sample());
    });

    it('rejects junk of every shape', () => {
      for (const bad of [
        null,
        undefined,
        42,
        'x',
        {},
        { ...sample(), dataUrl: 'javascript:alert(1)' },
        { ...sample(), dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw==' },
        { ...sample(), dataUrl: 'data:image/png;base64,!!not-base64!!' },
        { ...sample(), cx: '1' },
        { ...sample(), w: 0 },
        { ...sample(), h: -3 },
        { ...sample(), opacity: 101 },
        { ...sample(), opacity: 33.5 },
        { ...sample(), opacity: '60' },
        { ...sample(), locked: 'yes' },
        { ...sample(), hidden: 1 },
        { ...sample(), rotDeg: Number.NaN },
      ]) {
        expect(parseUnderlayState(bad)).toBeNull();
      }
    });
  });

  describe('localStorage roundtrip', () => {
    let storage: FakeStorage;
    beforeEach(() => {
      storage = new FakeStorage();
    });

    it('uses the dedicated versioned key (never the autosave key)', () => {
      saveUnderlayMap(storage, { 'floor-ground': sample() });
      expect(storage.map.has(UNDERLAY_STORAGE_KEY)).toBe(true);
      expect(storage.map.has('casaplaza.autosave.v1')).toBe(false);
    });

    it('round-trips a per-floor map', () => {
      const map = { a: sample(), b: sample({ cx: 9, locked: true }) };
      saveUnderlayMap(storage, map);
      expect(loadUnderlayMap(storage)).toEqual(map);
    });

    it('drops junk rows but keeps good ones', () => {
      storage.setItem(
        UNDERLAY_STORAGE_KEY,
        JSON.stringify({ good: sample(), bad: { cx: 1 }, worse: 'nope' }),
      );
      const loaded = loadUnderlayMap(storage);
      expect(Object.keys(loaded)).toEqual(['good']);
    });

    it('discards a corrupt slot wholesale', () => {
      storage.setItem(UNDERLAY_STORAGE_KEY, '{{{not json');
      expect(loadUnderlayMap(storage)).toEqual({});
      expect(storage.map.has(UNDERLAY_STORAGE_KEY)).toBe(false);
    });

    it('stores nothing (removes the key) for an empty map', () => {
      storage.setItem(UNDERLAY_STORAGE_KEY, '{}');
      saveUnderlayMap(storage, {});
      expect(storage.map.has(UNDERLAY_STORAGE_KEY)).toBe(false);
    });

    it('tolerates a null storage backend', () => {
      expect(loadUnderlayMap(null)).toEqual({});
      expect(() => saveUnderlayMap(null, { a: sample() })).not.toThrow();
    });
  });

  describe('lock semantics', () => {
    it('locked and hidden rows are never interactable', () => {
      expect(underlayInteractable(null)).toBe(false);
      expect(underlayInteractable(sample())).toBe(true);
      expect(underlayInteractable(sample({ locked: true }))).toBe(false);
      expect(underlayInteractable(sample({ hidden: true }))).toBe(false);
    });
  });

  describe('geometry seams', () => {
    it('axis-aligned corners are TL/TR/BR/BL (world y up)', () => {
      const u = sample({ cx: 0, cy: 0, w: 2, h: 4 });
      expect(underlayCorners(u)).toEqual([
        [-1, 2],
        [1, 2],
        [1, -2],
        [-1, -2],
      ]);
    });

    it('90° rotation maps TL onto the old TR side', () => {
      const u = sample({ cx: 0, cy: 0, w: 2, h: 4, rotDeg: 90 });
      const [tl] = underlayCorners(u);
      // CCW quarter-turn: the old TL (−1, 2) lands at (−y, x) = (−2, −1).
      expect(tl[0]).toBeCloseTo(-2);
      expect(tl[1]).toBeCloseTo(-1);
    });

    it('nudge translates the center only', () => {
      const u = nudgeUnderlay(sample(), 0.5, -0.25);
      expect(u.cx).toBe(1.5);
      expect(u.cy).toBe(-2.25);
      expect(u.w).toBe(4);
    });

    it('rotate wraps into [0, 360) and preserves handedness', () => {
      const cw = rotateUnderlayBy(sample({ rotDeg: 10 }), -15);
      expect(cw.rotDeg).toBeCloseTo(355);
      const ccw = rotateUnderlayBy(sample({ rotDeg: 10 }), 15);
      expect(ccw.rotDeg).toBe(25);
    });

    it('corner resize anchors the opposite corner and measures in the local frame', () => {
      const u = sample({ cx: 0, cy: 0, w: 2, h: 2, rotDeg: 0 });
      // Drag the TR corner (index 1) outward: anchor is BL (-1,-1).
      const grown = resizeUnderlayFromCorner(u, 1, [3, 3]);
      expect(grown.w).toBeCloseTo(4);
      expect(grown.h).toBeCloseTo(4);
      expect(grown.cx).toBeCloseTo(1);
      expect(grown.cy).toBeCloseTo(1);
      // Anchor (BL of the OLD rect) stays put in the NEW rect's frame.
      const blNew = underlayCorners(grown)[3];
      expect(blNew[0]).toBeCloseTo(-1);
      expect(blNew[1]).toBeCloseTo(-1);
    });

    it('corner resize honors rotation (edges stay glued to the angle)', () => {
      const u = sample({ cx: 0, cy: 0, w: 2, h: 2, rotDeg: 90 });
      // Rotated corners: TL(−1,−1) TR(−1,1) BR(1,1) BL(1,−1). Drag TR
      // to (−3, 1): the world-x shift is the image's h-axis at 90°, so
      // h doubles while w stays; anchor BL stays put.
      const grown = resizeUnderlayFromCorner(u, 1, [-3, 1]);
      expect(grown.w).toBeCloseTo(2);
      expect(grown.h).toBeCloseTo(4);
      const corners = underlayCorners(grown);
      expect(corners[3][0]).toBeCloseTo(1);
      expect(corners[3][1]).toBeCloseTo(-1);
      expect(corners[1][0]).toBeCloseTo(-3);
      expect(corners[1][1]).toBeCloseTo(1);
    });

    it('crossing the anchor clamps to the minimum side instead of flipping', () => {
      const u = sample({ cx: 0, cy: 0, w: 2, h: 2, rotDeg: 0 });
      const flipped = resizeUnderlayFromCorner(u, 1, [-5, -5]);
      expect(flipped.w).toBeCloseTo(UNDERLAY_MIN_SIDE_M);
      expect(flipped.h).toBeCloseTo(UNDERLAY_MIN_SIDE_M);
    });

    it('handle hit test is screen-space radius matching', () => {
      const corners: Pt[] = [[10, 10], [110, 10], [110, 90], [10, 90]];
      expect(underlayHandleAt([12, 11], corners)).toBe(0);
      expect(underlayHandleAt([108, 90], corners)).toBe(2);
      expect(underlayHandleAt([60, 50], corners)).toBeNull();
    });
  });
});

describe('underlay store slice (issue #99)', () => {
  let store: EditorStore;
  beforeEach(() => {
    store = new EditorStore(emptyPlan());
  });

  it('starts with no underlay on any floor', () => {
    expect(underlayFor(store.getState())).toBeNull();
  });

  it('setUnderlaySlot stores per floor and deletes with null', () => {
    expect(store.dispatch({ type: 'setUnderlaySlot', floorId: 'floor-ground', state: sample() }).ok).toBe(true);
    expect(underlayFor(store.getState())?.cx).toBe(1);
    expect(store.dispatch({ type: 'setUnderlaySlot', floorId: 'floor-ground', state: null }).ok).toBe(true);
    expect(underlayFor(store.getState())).toBeNull();
  });

  it('per-floor isolation: switching floors switches slots', () => {
    store.dispatch({ type: 'addFloor' });
    const ground = store.getState().data.floors[0].id;
    const second = store.getState().data.floors[1].id;
    store.dispatch({ type: 'setUnderlaySlot', floorId: ground, state: sample({ cx: 5 }) });
    store.dispatch({ type: 'setUnderlaySlot', floorId: second, state: sample({ cx: -5 }) });
    expect(underlayFor(store.getState())?.cx).toBe(-5); // addFloor activated floor 2
    store.dispatch({ type: 'setActiveFloor', index: 0 });
    expect(underlayFor(store.getState())?.cx).toBe(5);
  });

  it('refuses unknown floor ids', () => {
    const res = store.dispatch({ type: 'setUnderlaySlot', floorId: 'nope', state: sample() });
    expect(res.ok).toBe(false);
  });

  it('underlay writes NEVER enter undo history (nor dirty the plan)', () => {
    store.dispatch({ type: 'setUnderlaySlot', floorId: 'floor-ground', state: sample() });
    expect(store.canUndo()).toBe(false);
    expect(store.dirty).toBe(false);
    // Plan mutations still undo normally afterwards.
    store.dispatch({ type: 'drawRoom', polygon: [[0, 0], [2, 0], [2, 2]] });
    expect(store.undo()).toBe(true);
    // …and the undo did NOT rewind the underlay.
    expect(underlayFor(store.getState())?.cx).toBe(1);
  });

  it('replaceAll keeps the underlay slice (editor state, not plan data)', () => {
    store.dispatch({ type: 'setUnderlaySlot', floorId: 'floor-ground', state: sample() });
    store.replaceAll(emptyPlan());
    expect(underlayFor(store.getState())?.cx).toBe(1);
  });

  it('hydrateUnderlays replaces the whole map', () => {
    store.hydrateUnderlays({ 'floor-ground': sample({ cx: 42 }) });
    expect(underlayFor(store.getState())?.cx).toBe(42);
  });
});
