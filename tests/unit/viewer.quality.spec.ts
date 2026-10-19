/**
 * Quality parser spec (issue #87): ?quality= reads — default HIGH
 * (ratified on batch #85), explicit opt-outs, hostile inputs.
 */

import { describe, expect, it } from 'vitest';
import { isHighQuality } from '../../src/viewer/quality';

describe('isHighQuality — ratified default-HIGH semantics', () => {
  it('defaults HIGH when the param is absent', () => {
    expect(isHighQuality('?perf=1')).toBe(true);
    expect(isHighQuality('')).toBe(true);
  });

  it('explicit low opts OUT of the textured pass', () => {
    expect(isHighQuality('?quality=low')).toBe(false);
    expect(isHighQuality('?foo=1&quality=low')).toBe(false);
    expect(isHighQuality('?quality=low&bar=2')).toBe(false);
  });

  it('explicit high stays HIGH', () => {
    expect(isHighQuality('?quality=high')).toBe(true);
    expect(isHighQuality('?a=b&quality=high&c=d')).toBe(true);
  });

  it('hostile/unknown values fall back HIGH (fail-open to pretty)', () => {
    expect(isHighQuality('?quality=LOW')).toBe(true); // case-sensitive
    expect(isHighQuality('?quality=medium')).toBe(true);
    expect(isHighQuality('?quality=')).toBe(true);
    expect(isHighQuality('?quantity=low')).toBe(true); // different param
  });
});
