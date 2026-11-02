/**
 * Readout formatters (issue #178, ported from the retired viewer HUD
 * spec, gap G12): wall clock, north offset and walls-slider
 * normalisation clamp hostile values instead of rendering garbage.
 */
import { describe, expect, it } from 'vitest';
import { formatNorth, hoursToClock, wallsAlphaFromSlider } from '../../src/shared/format';

describe('hoursToClock (#146)', () => {
  it('formats slider hours as a wall clock readout', () => {
    expect(hoursToClock(0)).toBe('00:00');
    expect(hoursToClock(7.5)).toBe('07:30');
    expect(hoursToClock(12)).toBe('12:00');
    expect(hoursToClock(14.5)).toBe('14:30');
    expect(hoursToClock(23.5)).toBe('23:30');
    expect(hoursToClock(24)).toBe('24:00');
    expect(hoursToClock(9.25)).toBe('09:15');
  });

  it('clamps hostile values', () => {
    expect(hoursToClock(Number.NaN)).toBe('00:00');
    expect(hoursToClock(Number.POSITIVE_INFINITY)).toBe('00:00');
    expect(hoursToClock(-3)).toBe('00:00');
    expect(hoursToClock(99)).toBe('24:00');
    expect(hoursToClock(23.999)).toBe('24:00');
  });
});

describe('formatNorth (#121)', () => {
  it('rounds to integer degrees and survives NaN', () => {
    expect(formatNorth(30)).toBe('30°');
    expect(formatNorth(-44.6)).toBe('-45°');
    expect(formatNorth(Number.NaN)).toBe('0°');
  });
});

describe('wallsAlphaFromSlider (#120)', () => {
  it('normalises 0..100 into 0..1 and clamps', () => {
    expect(wallsAlphaFromSlider(0)).toBe(0);
    expect(wallsAlphaFromSlider(40)).toBeCloseTo(0.4);
    expect(wallsAlphaFromSlider(100)).toBe(1);
    expect(wallsAlphaFromSlider(140)).toBe(1);
    expect(wallsAlphaFromSlider(-5)).toBe(0);
    expect(wallsAlphaFromSlider(Number.NaN)).toBe(0);
  });
});
