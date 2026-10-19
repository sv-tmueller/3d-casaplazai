/**
 * Unit tests (issue #86): render constants presence + quality parser +
 * the pure roof-affordance seams (indoor predicate, fade tween step).
 * Pure modules only — no three.js WebGL surface needed here.
 */
import { describe, expect, it } from 'vitest';

import { isHighQuality } from '../../src/viewer/quality';
import {
  fadeStepOpacity,
  isIndoorFromRay,
} from '../../src/viewer/walkMode';
import {
  HEMI_INTENSITY,
  QUALITY_LEVELS,
  ROOFS_FADE_MIN_OPACITY,
  ROOFS_FADE_RATE_PER_S,
  ROOFS_RAYCAST_INTERVAL_TICKS,
  SHADOW_BIAS,
  SHADOW_MAP_SIZE,
  SKY_DOME_RADIUS_M,
  SKY_GRADIENT_BOTTOM_HEX,
  SKY_GRADIENT_TOP_HEX,
  SKY_SOLID_HEX,
  SUN_INTENSITY,
} from '../../src/viewer/renderConstants';

describe('renderConstants (issue #86 CP1)', () => {
  it('exports the relocated lighting/sky/shadow tunables', () => {
    // Values live-directed from the pre-9.1 sceneBuilder: retrofit,
    // not redesign — these pins catch accidental rebalancing.
    expect(SUN_INTENSITY).toBe(2.1);
    expect(HEMI_INTENSITY).toBe(1.35);
    expect(SHADOW_MAP_SIZE).toBe(1024);
    expect(SHADOW_BIAS).toBe(-0.0015);
    expect(SKY_SOLID_HEX).toBe(0xbcd6ea);
  });

  it('defines a coherent gradient palette (bottom lighter than top)', () => {
    // Sanity: a daytime sky ramps darker toward the zenith.
    expect(SKY_GRADIENT_BOTTOM_HEX).toBeGreaterThan(SKY_GRADIENT_TOP_HEX);
    // And the dome comfortably encloses the orbit camera (z ≈ 120).
    expect(SKY_DOME_RADIUS_M).toBeGreaterThan(120);
  });

  it('declares exactly the two quality presets', () => {
    expect(QUALITY_LEVELS).toEqual(['low', 'high']);
  });

  it('keeps the autofade floor translucent and the cadence throttled', () => {
    expect(ROOFS_FADE_MIN_OPACITY).toBeGreaterThan(0);
    expect(ROOFS_FADE_MIN_OPACITY).toBeLessThan(1);
    expect(ROOFS_FADE_RATE_PER_S).toBeGreaterThan(0);
    expect(ROOFS_RAYCAST_INTERVAL_TICKS).toBeGreaterThan(1);
  });
});

describe('isHighQuality (issue #86 CP2 — absorbed into #87 quality.ts per batch-#85 arbitration)', () => {
  it('parses low and high explicitly', () => {
    expect(isHighQuality('?quality=low')).toBe(false);
    expect(isHighQuality('?quality=high')).toBe(true);
  });

  it('parses alongside other query parameters', () => {
    expect(isHighQuality('?perf=1&quality=low')).toBe(false);
    expect(isHighQuality('?quality=high&perf=1')).toBe(true);
  });

  it('defaults to high when absent or unrecognized (end-anchored)', () => {
    expect(isHighQuality('')).toBe(true);
    expect(isHighQuality('?foo=1')).toBe(true);
    expect(isHighQuality('?quality=medium')).toBe(true);
    // End-anchor (adopted from #86's stricter parse): prefixed values
    // no longer degrade to LOW — unrecognized ⇒ HIGH.
    expect(isHighQuality('?quality=lower')).toBe(true);
    expect(isHighQuality('?quality=lowest')).toBe(true);
  });
});

describe('isIndoorFromRay (issue #86 CP5, pure predicate)', () => {
  it('counts a strictly positive roof hit as indoor', () => {
    expect(isIndoorFromRay(0.42)).toBe(true);
    expect(isIndoorFromRay(12.3)).toBe(true);
  });

  it('treats a sky escape (null) as outdoor', () => {
    expect(isIndoorFromRay(null)).toBe(false);
  });

  it('rejects degenerate zero-distance hits (ray origin on the mesh)', () => {
    expect(isIndoorFromRay(0)).toBe(false);
  });
});

describe('fadeStepOpacity (issue #86 CP5, pure tween step)', () => {
  const params = {
    minOpacity: ROOFS_FADE_MIN_OPACITY,
    ratePerSecond: ROOFS_FADE_RATE_PER_S,
    dt: 1 / 60,
  };

  it('moves an opaque roof toward the fade floor when indoors', () => {
    const next = fadeStepOpacity(1, true, params);
    expect(next).toBeLessThan(1);
    expect(next).toBeGreaterThan(params.minOpacity);
  });

  it('monotonically converges to the floor over repeated indoor steps', () => {
    let opacity = 1;
    for (let i = 0; i < 600; i += 1) opacity = fadeStepOpacity(opacity, true, params);
    expect(opacity).toBeCloseTo(params.minOpacity, 3);
  });

  it('restores toward full opacity when outdoors', () => {
    let opacity = params.minOpacity;
    for (let i = 0; i < 600; i += 1) opacity = fadeStepOpacity(opacity, false, params);
    expect(opacity).toBeCloseTo(1, 3);
  });

  it('never overshoots its target', () => {
    const down = fadeStepOpacity(1, true, params);
    expect(down).toBeGreaterThanOrEqual(params.minOpacity);
    const up = fadeStepOpacity(params.minOpacity, false, params);
    expect(up).toBeLessThanOrEqual(1);
  });
});
