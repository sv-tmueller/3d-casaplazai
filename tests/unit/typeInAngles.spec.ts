/**
 * Issue #100 (Pkg 12.2) checkpoint 1 — CONVENTION UNIFICATION.
 *
 * Pins the unified COMPASS convention (lead-decided Interpretation A):
 * 0° = north (+y), CW-positive, [0, 360) EVERYWHERE — pills, inspector
 * metrics, and (via the shared field component) typed entry. The
 * headline is the ROUND-TRIP guarantee: a typed (length, bearing)
 * inverted through polarEndpoint must be reproduced EXACTLY (within
 * display precision) by the metric/pill derivations, so the field and
 * the pill can never disagree.
 */
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../src/shared/schema';
import {
  compassAngleDegrees,
  compassAngleBetween,
  polarEndpoint,
  METRIC_DISPLAY_EPS,
} from '../../src/editor/model/angles';
import { clampAngleLabel } from '../../src/editor/model/measure';
import { emptyPlan } from '../../src/editor/store';
import {
  angleReadoutLabels,
} from '../../src/editor/render/angleReadouts';
import type { InteractionPhase } from '../../src/editor/controller';

describe('compassAngleDegrees — unified convention (issue #100)', () => {
  it.each([
    ['north', 0, 0, 0, 1, 0],
    ['east', 0, 0, 1, 0, 90],
    ['south', 0, 0, 0, -1, 180],
    ['west', 0, 0, -1, 0, 270],
    ['NE', 0, 0, 1, 1, 45],
    ['SE', 0, 0, 1, -1, 135],
    ['SW', 0, 0, -1, -1, 225],
    ['NW', 0, 0, -1, 1, 315],
  ])('%s -> %p deg (CW from north)', (_n, ax, ay, bx, by, exp) => {
    expect(compassAngleDegrees(ax, ay, bx, by)).toBeCloseTo(exp, 9);
  });

  it('wraps slightly-negative results to 359.x — NEVER 360', () => {
    const deg = compassAngleDegrees(0, 0, -1e-9, 1);
    expect(deg).toBeGreaterThan(359);
    expect(deg).toBeLessThan(360);
  });

  it('zero-length segment -> 0 deg', () => {
    expect(compassAngleDegrees(2, 3, 2, 3)).toBe(0);
  });
});

describe('polarEndpoint — compass polar inverse (issue #100)', () => {
  const o: Vec2 = [3, -2];

  it('0° walks NORTH (+y), 90° EAST (+x)', () => {
    const n = polarEndpoint(o, 4, 0);
    expect(n[0]).toBeCloseTo(3, 9);
    expect(n[1]).toBeCloseTo(2, 9);
    const e = polarEndpoint(o, 4, 90);
    expect(e[0]).toBeCloseTo(7, 9);
    expect(e[1]).toBeCloseTo(-2, 9);
  });

  it('normalizes out-of-range bearings (mod 360, negatives)', () => {
    expect(polarEndpoint(o, 2, 450)).toEqual(polarEndpoint(o, 2, 90));
    expect(polarEndpoint(o, 2, -90)).toEqual(polarEndpoint(o, 2, 270));
    expect(polarEndpoint(o, 2, 720 + 45)).toEqual(polarEndpoint(o, 2, 45));
  });

  it('round-trips through compassAngleDegrees for a dense bearing sweep', () => {
    for (let b = 0; b < 360; b += 7.5) {
      const ep = polarEndpoint(o, 3.25, b);
      expect(compassAngleBetween(o, ep)).toBeCloseTo(b, 6);
    }
  });
});

describe('typed (len, ang) -> endpoint -> metrics/pill round-trip (issue #100)', () => {
  it.each([
    [4, 0],
    [3.5, 90],
    [2.25, 45],
    [5.75, 180],
    [1.2, 270],
    [3.05, 137.5],
    [6.4, 352.5],
  ])('len=%p ang=%p reproduces the typed numbers exactly', (len, ang) => {
    const origin: Vec2 = [1, -1];
    const ep = polarEndpoint(origin, len, ang);

    // Metric derivation (inspectorPanel.segmentMetrics' formulas —
    // now sourced from the same shared helpers).
    const lengthM = Math.hypot(ep[0] - origin[0], ep[1] - origin[1]);
    const angleDeg = compassAngleBetween(origin, ep);
    expect(Math.abs(lengthM - len)).toBeLessThan(METRIC_DISPLAY_EPS);
    expect(Math.abs(angleDeg - ang)).toBeLessThan(METRIC_DISPLAY_EPS);

    // Pill derivation (angleReadouts.rowFor — same helper + formatter).
    const phase: InteractionPhase = {
      tag: 'drawingRect',
      corner1: origin,
      cursor: ep,
    };
    const rows = angleReadoutLabels(
      // Empty plan suffices: drawingRect emits its row without rooms.
      emptyPlan(),
      phase,
      null,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe(clampAngleLabel(ang));
    expect(rows[0].text).toBe(`${ang.toFixed(1)}\u00B0`);
  });
});
