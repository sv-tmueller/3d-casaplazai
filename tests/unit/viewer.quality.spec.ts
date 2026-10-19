/**
 * Quality parser spec (issue #87): ?quality= reads — default HIGH
 * (ratified on batch #85), explicit opt-outs, hostile inputs.
 */

import { describe, expect, it } from 'vitest';
import { isHighQuality } from '../../src/viewer/quality';
import { isPerfEnabled } from '../../src/viewer/appController';

describe('isPerfEnabled — end-anchored parse (issue #94)', () => {
  it('enables on the exact flag, solo or among peers', () => {
    expect(isPerfEnabled('?perf=1')).toBe(true);
    expect(isPerfEnabled('?foo=2&perf=1')).toBe(true);
    expect(isPerfEnabled('?perf=1&bar=3')).toBe(true);
  });

  it('does NOT enable on perf=10 — a different value, not our flag', () => {
    expect(isPerfEnabled('?perf=10')).toBe(false);
    expect(isPerfEnabled('?perf=10&foo=1')).toBe(false);
  });

  it('stays off when absent', () => {
    expect(isPerfEnabled('')).toBe(false);
    expect(isPerfEnabled('?quality=low')).toBe(false);
  });
});

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
