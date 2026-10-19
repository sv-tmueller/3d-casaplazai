/**
 * Walls-transparency applier spec (issue #120): the pure alpha →
 * material-settings mapping behind the dollhouse slider. 0 keeps the
 * opaque fast path, (0,1) switches to the glass-style transparent pass
 * (opacity = 1 - alpha), ≥1 skips the mesh entirely (draw gone ⇒ its
 * shadow contribution is gone too).
 */
import { describe, expect, it } from 'vitest';

import { wallAlphaSettings } from '../../src/viewer/appController';

describe('wallAlphaSettings — threshold mapping (issue #120)', () => {
  it('alpha 0: restores the opaque fast path (depth writes back ON)', () => {
    expect(wallAlphaSettings(0)).toEqual({
      visible: true,
      transparent: false,
      depthWrite: true,
      opacity: 1,
    });
  });

  it('alpha in (0,1): transparent pass, opacity = 1 - alpha, no depth writes', () => {
    expect(wallAlphaSettings(0.4)).toEqual({
      visible: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.6,
    });
  });

  it('alpha ≥ 1: fully invisible — the skipped draw kills the shadows', () => {
    const s = wallAlphaSettings(1);
    expect(s.visible).toBe(false);
    expect(s.opacity).toBe(0);
    // Parked back on the opaque classification while skipped.
    expect(s.transparent).toBe(false);
    expect(s.depthWrite).toBe(true);
  });

  it('clamps hostile inputs into the unit range', () => {
    expect(wallAlphaSettings(2)).toEqual(wallAlphaSettings(1));
    expect(wallAlphaSettings(-1)).toEqual(wallAlphaSettings(0));
    expect(wallAlphaSettings(Number.NaN)).toEqual(wallAlphaSettings(0));
  });
});
