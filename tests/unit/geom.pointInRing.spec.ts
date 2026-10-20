/**
 * pointInRing (issue #147 CP1): the shared, three-free point-in-polygon
 * predicate that both surfaces consume — the viewer's room readout and
 * the editor's glyph/place-camera validity. Lives in src/geom so the
 * viewer never imports src/editor (layering law, mini3d.ts header).
 */
import { describe, expect, it } from 'vitest';
import { pointInRing } from '../../src/geom';
import { pointInPolygon } from '../../src/editor/geom';

/** 4×3 rectangle, CCW. */
const RECT: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];

/** L-shaped concave ring (proves ray-casting, not convexity). */
const L_SHAPE: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
];

describe('pointInRing (issue #147 CP1)', () => {
  it('accepts interior points and rejects points outside', () => {
    expect(pointInRing(2, 1.5, RECT)).toBe(true);
    expect(pointInRing(-0.1, 1.5, RECT)).toBe(false);
    expect(pointInRing(4.1, 1.5, RECT)).toBe(false);
    expect(pointInRing(2, 3.1, RECT)).toBe(false);
  });

  it('handles concave rings (the notch is OUTSIDE)', () => {
    // Inside the L's long arm…
    expect(pointInRing(3, 1, L_SHAPE)).toBe(true);
    expect(pointInRing(1, 3, L_SHAPE)).toBe(true);
    // …but the notch corner is not.
    expect(pointInRing(3, 3, L_SHAPE)).toBe(false);
  });

  it('reads x/y as separate scalars (no Pt tuple to allocate)', () => {
    // Same answer as the tuple-based editor predicate for a sample set:
    // one implementation behind both surfaces.
    for (const [x, y] of [
      [2, 1.5],
      [3, 3],
      [-1, 0],
      [0.5, 3.5],
    ] as Array<[number, number]>) {
      expect(pointInRing(x, y, RECT)).toBe(pointInPolygon([x, y], RECT));
    }
  });

  it('treats a degenerate ring as empty (no throw)', () => {
    expect(pointInRing(0, 0, [])).toBe(false);
    expect(pointInRing(0, 0, [[1, 1]])).toBe(false);
  });

  it('accepts readonly rings (schema polygons are readonly-compatible)', () => {
    const frozen = Object.freeze(RECT.map((p) => Object.freeze(p))) as unknown as ReadonlyArray<
      readonly [number, number]
    >;
    expect(pointInRing(2, 1, frozen)).toBe(true);
  });
});
