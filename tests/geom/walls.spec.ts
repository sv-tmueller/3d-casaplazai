import { describe, expect, it } from 'vitest';
import type { Opening, Room } from '../../src/shared/schema';
import {
  buildSlab,
  partitionLongitudinal,
  partitionVertical,
  wallEffectiveHeight,
  wallHeightForSegment,
} from '../../src/geom/walls';

function mkRoom(wallsOverride?: Room['wallsOverride']): Room {
  return {
    id: 'rw',
    name: 'Wall Room',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ],
    floorTexture: null,
    ...(wallsOverride ? { wallsOverride } : {}),
  };
}

function mkOpening(over: Partial<Opening>): Opening {
  return {
    id: 'o-default',
    roomId: 'rw',
    kind: 'door',
    segmentIndex: 0,
    tCenter: 0.5,
    width: 0.9,
    sillHeight: 0,
    headHeight: 2.1,
    ...over,
  };
}

describe('geom/walls — wallEffectiveHeight', () => {
  it('honors wallsOverride for segment 0 and defers otherwise', () => {
    const room = mkRoom([{ segmentIndex: 0, height: 2.2 }]);
    expect(wallEffectiveHeight(room, 2.7)).toBe(2.2);
    expect(wallHeightForSegment(room, 2.7, 1)).toBe(2.7);
    expect(wallEffectiveHeight(mkRoom(), 2.7)).toBe(2.7);
  });
});

describe('geom/walls — partitionLongitudinal', () => {
  it('whole-solid segment with no openings', () => {
    const parts = partitionLongitudinal(4, []);
    expect(parts).toEqual([{ s0: 0, s1: 4, rimSide: 'none' }]);
  });

  it('partitions around a single middle opening', () => {
    const parts = partitionLongitudinal(4, [mkOpening({ tCenter: 0.5, width: 0.9 })]);
    expect(parts).toEqual([
      { s0: 0, s1: 1.55, rimSide: 'high' },
      { s0: 2.45, s1: 4, rimSide: 'low' },
    ]);
  });

  it('chains two openings with a pillar between', () => {
    const parts = partitionLongitudinal(4, [
      mkOpening({ id: 'a', tCenter: 0.125, width: 0.5 }),
      mkOpening({ id: 'b', tCenter: 0.625, width: 0.5 }),
    ]);
    expect(parts).toEqual([
      { s0: 0, s1: 0.25, rimSide: 'high' },
      { s0: 0.75, s1: 2.25, rimSide: 'high' },
      { s0: 2.75, s1: 4, rimSide: 'low' },
    ]);
  });

  it('wall-spanning opening leaves no solid pieces', () => {
    const parts = partitionLongitudinal(2, [mkOpening({ tCenter: 0.5, width: 2 })]);
    expect(parts).toEqual([]);
  });
});

describe('geom/walls — partitionVertical', () => {
  it('door: lintel slab above head only (hole rises from floor)', () => {
    const span = { s0: 1, s1: 2, rimSide: 'high' as const };
    const slabs = partitionVertical(span, mkOpening({}), 2.7);
    expect(slabs).toEqual([
      { s0: 1, s1: 2, z0: 2.1, z1: 2.7, segIndex: 0, rimSide: 'high' },
    ]);
  });

  it('window: below-sill + above-head slabs', () => {
    const span = { s0: 1, s1: 2, rimSide: 'high' as const };
    const slabs = partitionVertical(span, mkOpening({ kind: 'window', sillHeight: 0.9, headHeight: 2.3 }), 2.7);
    expect(slabs).toEqual([
      { s0: 1, s1: 2, z0: 0, z1: 0.9, segIndex: 0, rimSide: 'high' },
      { s0: 1, s1: 2, z0: 2.3, z1: 2.7, segIndex: 0, rimSide: 'high' },
    ]);
  });

  it('skips empty bands (full-height window)', () => {
    const span = { s0: 1, s1: 2, rimSide: 'low' as const };
    const slabs = partitionVertical(span, mkOpening({ sillHeight: 0, headHeight: 2.7 }), 2.7);
    expect(slabs).toEqual([]);
  });
});

describe('geom/walls — buildSlab', () => {
  it('emits 8 verts, 36 indices, correct bbox coords', () => {
    const spec = { s0: 0, s1: 2, z0: 0, z1: 2.7, segIndex: 0, rimSide: 'none' as const };
    const mesh = buildSlab(spec, 0, 0, 1, 0, 0.24, 0, 1);
    expect(mesh.positions.length).toBe(24);
    expect(mesh.indices.length).toBe(36);
    const zs = Array.from(mesh.positions).filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBeCloseTo(2.7, 6); // f32 storage rounds ulps
  });

  it('diagonal wall slants the prism without NaNs', () => {
    const spec = { s0: 0, s1: 1, z0: 0, z1: 2.7, segIndex: 0, rimSide: 'none' as const };
    const mesh = buildSlab(spec, 0, 0, Math.SQRT1_2, Math.SQRT1_2, 0.24, -Math.SQRT1_2, Math.SQRT1_2);
    const vals = Array.from(mesh.positions);
    expect(vals.every(Number.isFinite)).toBe(true);
    expect(mesh.positions.length).toBe(24);
  });
});
