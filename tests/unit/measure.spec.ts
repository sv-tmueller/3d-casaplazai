/**
 * Specs for the measure annotation model + painter gating
 * (issue #66, Pkg 1 checkpoints 2/4/6).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MEASURE_STORAGE_KEY,
  clampAngleLabel,
  formatDistanceLabel,
  labelHitTest,
  loadMeasurements,
  makeMeasureId,
  measureLabelScreenPos,
  measurementAngle,
  measurementDistance,
  measurementLabelText,
  saveMeasurements,
  type Measurement,
} from '../../src/editor/model/measure';
import { paintMeasureAnnotations } from '../../src/editor/render/measurementBadges';
import type { Camera } from '../../src/editor/controller';

const CAM: Camera = { originX: 0, originY: 0, scale: 80 };
const M: Measurement = { id: 'm1', a: [0, 0], b: [3, 4] };

function memStorage(initial = new Map<string, string>()): Storage {
  return {
    getItem: (k: string) => (initial.has(k) ? initial.get(k)! : null),
    setItem: (k: string, v: string) => void initial.set(k, v),
    removeItem: (k: string) => void initial.delete(k),
    length: initial.size,
    clear: () => initial.clear(),
    key: () => null,
  } as Storage;
}

describe('measure model (issue #66)', () => {
  it('3-4-5 measurement: distance 5, angle 53.13°', () => {
    expect(measurementDistance(M)).toBe(5);
    expect(measurementAngle(M)).toBeCloseTo(53.13, 2);
  });

  it('formats distance with two decimals and angle with one', () => {
    expect(formatDistanceLabel(4.236)).toBe('4.24 m');
    expect(clampAngleLabel(53.13)).toBe('53.1\u00B0');
    expect(measurementLabelText(M)).toBe('5.00 m \u00B7 53.1\u00B0');
  });

  // Issue #94: clampAngleLabel is the SINGLE angle formatter (the
  // gesture-live readouts ride the same helper), so the wrap/clamp
  // contract is pinned here for both call sites at once.
  it.each([
    [359.96, '0.0\u00B0'], // rounds to 360.0 → wraps to 0.0, never "360.0"
    [359.94, '359.9\u00B0'],
    [-0.04, '0.0\u00B0'], // tiny negative rounds to -0.0 → 0.0
    [-53.13, '-53.1\u00B0'], // larger negatives pass through modulo intact
    [720.04, '0.0\u00B0'], // multi-turn wraps
    [45.0, '45.0\u00B0'],
  ])('clampAngleLabel(%p) -> %p', (deg, expected) => {
    expect(clampAngleLabel(deg)).toBe(expected);
  });

  it('label pill sits above the segment midpoint, offset perpendicular', () => {
    // a(0,0)→(0,0), b(3,4)→(240,-320); midpoint (120,-160); unit normal
    // (0.8,0.6) flips up-screen → (-0.8,-0.6); ×16 px ⇒ (107.2,-169.6).
    const lp = measureLabelScreenPos(M, CAM);
    expect(lp[0]).toBeCloseTo(107.2, 3);
    expect(lp[1]).toBeCloseTo(-169.6, 3);
  });

  it('labelHitTest hits at the pill and misses far away (screen space)', () => {
    const lp = measureLabelScreenPos(M, CAM);
    expect(labelHitTest(lp, [M], CAM)).toBe(M);
    expect(labelHitTest([lp[0] + 500, lp[1]], [M], CAM)).toBeNull();
  });

  it('labelHitTest world fallback hits near the segment', () => {
    expect(labelHitTest([1.5, 2], [M])).toBe(M);
    expect(labelHitTest([50, 50], [M])).toBeNull();
  });

  it('makeMeasureId yields unique ids', () => {
    expect(makeMeasureId()).not.toBe(makeMeasureId());
  });
});

describe('measure persistence (issue #66)', () => {
  it('save/load roundtrip', () => {
    const s = memStorage();
    saveMeasurements(s, [M]);
    expect(loadMeasurements(s)).toEqual([M]);
    expect(s.getItem(MEASURE_STORAGE_KEY)).toBeTruthy();
  });

  it('missing key, corrupt JSON, and non-array payloads all yield []', () => {
    const empty = memStorage();
    expect(loadMeasurements(empty)).toEqual([]);
    const corrupt = memStorage(new Map([[MEASURE_STORAGE_KEY, '{oops']]));
    expect(loadMeasurements(corrupt)).toEqual([]);
    const shaped = memStorage(new Map([[MEASURE_STORAGE_KEY, '{"a":1}']]));
    expect(loadMeasurements(shaped)).toEqual([]);
  });

  it('filters malformed rows but keeps valid ones', () => {
    const s = memStorage(new Map([[MEASURE_STORAGE_KEY, '[{"id":"ok","a":[0,0],"b":[1,1]},{"id":42}]']]));
    const loaded = loadMeasurements(s);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('ok');
  });

  it('no-storage environments: load → [], save does not throw', () => {
    const boom = {
      getItem: (): string => {
        throw new Error('denied');
      },
      setItem: (): void => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(loadMeasurements(boom)).toEqual([]);
    expect(() => saveMeasurements(boom, [M])).not.toThrow();
  });
});

describe('paintMeasureAnnotations gating (issue #66)', () => {
  function mockCtx(): CanvasRenderingContext2D {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      roundRect: vi.fn(),
      measureText: vi.fn(() => ({
        width: 40,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      })),
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
  }

  it('hidden → no draw calls at all', () => {
    const ctx = mockCtx();
    paintMeasureAnnotations(ctx, CAM, [M], false);
    expect(ctx.beginPath).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('visible → draws the pill text "5.00 m · 53.1°"', () => {
    const ctx = mockCtx();
    paintMeasureAnnotations(ctx, CAM, [M], true);
    expect(ctx.fillText).toHaveBeenCalledWith(
      '5.00 m \u00B7 53.1\u00B0',
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('empty list is a no-op even when visible', () => {
    const ctx = mockCtx();
    paintMeasureAnnotations(ctx, CAM, [], true);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
