// @vitest-environment happy-dom
/**
 * Floor-pattern spec (pkg 14.4, issue #119): the 2D editor paints a
 * room's floor material as a procedural pattern canvas — one cached
 * canvas per texture kind, wrapped per-2D-context via createPattern.
 *
 * happy-dom has no real 2D rasterizer, so the module (like the viewer
 * materials pass) falls back to a recording proxy whose call trail we
 * assert on: the four drawers must be PAIRWISE DISTINCT (a copy-paste
 * drawer bug would otherwise ship invisible in unit-land), and the
 * cache must hand back the same canvas object per kind.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFloorPatternCaches,
  FLOOR_PATTERN_KINDS,
  getFloorPattern,
  getFloorPatternCanvas,
  type FloorPatternKind,
} from '../../src/editor/render/floorPatterns';

/** Mutable copy (vitest's it.each prefers plain arrays). */
const KINDS: FloorPatternKind[] = [...FLOOR_PATTERN_KINDS];

declare global {
  var __casaFloorTrails: WeakMap<HTMLCanvasElement, string[]> | undefined;
}

/** CanvasPattern factory double: real createPattern needs a real ctx. */
function fakeCtx(): { ctx: CanvasRenderingContext2D; createPattern: ReturnType<typeof vi.fn> } {
  const createPattern = vi.fn((canvas: HTMLCanvasElement, repeat: string) => ({
    _canvas: canvas,
    _repeat: repeat,
  }));
  return { ctx: { createPattern } as unknown as CanvasRenderingContext2D, createPattern };
}

beforeEach(() => {
  clearFloorPatternCaches();
});

describe('getFloorPatternCanvas — four distinct generators', () => {
  it.each(KINDS)('%s draws a full-cell canvas', (kind) => {
    const canvas = getFloorPatternCanvas(kind);
    expect(canvas.width).toBe(48);
    expect(canvas.height).toBe(48);
  });

  it('records a distinct drawer trail per kind (and distinct canvas objects)', () => {
    const trail = (kind: FloorPatternKind): string[] | undefined =>
      globalThis.__casaFloorTrails?.get(getFloorPatternCanvas(kind));
    const wood = trail('wood');
    const tile = trail('tile');
    const carpet = trail('carpet');
    const concrete = trail('concrete');
    expect(wood).toBeDefined();
    expect(wood!).toContain('bezierCurveTo'); // grain
    expect(tile!).toContain('strokeRect'); // grout cell borders
    expect(carpet!).not.toContain('stroke'); // speckle-only fill
    expect(concrete!).toContain('arc'); // aggregate speckles
    // Pairwise-distinct canvases, one per kind.
    const canvases = KINDS.map((kind) => getFloorPatternCanvas(kind));
    expect(new Set(canvases).size).toBe(KINDS.length);
  });

  it('cache hands back the SAME canvas object per kind', () => {
    expect(getFloorPatternCanvas('wood')).toBe(getFloorPatternCanvas('wood'));
  });
});

describe('getFloorPattern — per-context memoized CanvasPattern', () => {
  it.each(KINDS)('%s yields a non-null pattern', (kind) => {
    const { ctx } = fakeCtx();
    expect(getFloorPattern(kind, ctx)).not.toBeNull();
  });

  it('creates ONCE per kind per context, then reuses', () => {
    const { ctx, createPattern } = fakeCtx();
    const first = getFloorPattern('tile', ctx);
    const second = getFloorPattern('tile', ctx);
    expect(second).toBe(first);
    expect(createPattern).toHaveBeenCalledTimes(1);
    expect(createPattern).toHaveBeenCalledWith(getFloorPatternCanvas('tile'), 'repeat');
  });

  it('degrades to null when the context lacks createPattern (stub contexts)', () => {
    const stub = {} as CanvasRenderingContext2D;
    expect(getFloorPattern('wood', stub)).toBeNull();
  });

  it('unknown or MISSING kinds yield no pattern (raw payloads may omit the field)', () => {
    // loadPlan accepts payloads that the validator would later refuse:
    // a room may carry floorTexture === undefined (key omitted) or a
    // value outside the enum. Neither may CRASH the painter — both must
    // degrade to the plain room fill (null pattern).
    const { ctx } = fakeCtx();
    expect(getFloorPattern('marble' as FloorPatternKind, ctx)).toBeNull();
    expect(getFloorPattern(undefined as unknown as FloorPatternKind, ctx)).toBeNull();
  });

  it('a cleared cache still serves a valid pattern', () => {
    const { ctx } = fakeCtx();
    expect(getFloorPattern('carpet', ctx)).not.toBeNull();
    clearFloorPatternCaches();
    expect(getFloorPattern('carpet', ctx)).not.toBeNull();
  });
});
