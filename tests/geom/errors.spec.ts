import { describe, expect, it } from 'vitest';
import {
  FloorplanCompileError,
  FurnitureOutOfBoundsError,
  InvalidPolygonError,
  MissingRoomReferenceError,
  OpeningOverflowError,
  OverlappingOpeningsError,
} from '../../src/geom/errors';

describe('geom/error taxonomy', () => {
  it('derives every subclass from FloorplanCompileError', () => {
    const subs = [
      new InvalidPolygonError('deg'),
      new MissingRoomReferenceError('opening', 'o1', 'ghost'),
      new OpeningOverflowError('o1', 1),
      new OverlappingOpeningsError('a', 'b'),
      new FurnitureOutOfBoundsError('f1', 'r1'),
    ];
    for (const e of subs) {
      expect(e instanceof FloorplanCompileError).toBe(true);
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it('names the offender and remedy in messages', () => {
    expect(new MissingRoomReferenceError('opening', 'o1', 'ghost').message)
      .toContain('"ghost"');
    expect(new OpeningOverflowError('o-win', 1.25).message)
      .toContain('1.2500');
  });
});
