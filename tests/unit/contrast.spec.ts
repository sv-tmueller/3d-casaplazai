/**
 * Pkg 155 (issue #155) — WCAG contrast pins for the measurement pill.
 *
 * Premise correction (ratified in batch #160): the pill TEXT was already
 * fine (#1e3a5f on the 0.82-alpha white fill: 9.0-11.4:1 over every
 * editor backdrop). The failure was the BORDER — #93c5fd scored 1.53:1
 * against the grid minor lines, far under the 3:1 non-text minimum.
 *
 * The spec imports the REAL constants from measurementBadges.ts and
 * composites them over every surface the pill can sit on: the canvas,
 * both grid weights, all four floor patterns (issue #119 painters) and
 * each pattern's finish passes — including the SHADED cells those passes
 * are drawn over (floorPatterns.ts shades planks 0.86-1.10 and tile
 * cells 0.94-1.02 BEFORE the grain/joint/edge/grout marks land on them).
 * Two numbers are pinned:
 *   - TEXT  >= 4.5:1 (WCAG 1.4.3, normal text) on the composited fill.
 *   - BORDER >= 3:1  (WCAG 1.4.11, non-text) against BOTH adjacencies:
 *     the fill it encloses and the backdrop it sits on.
 *
 * KNOWN LIMITS (pinned, not hidden): the pattern detail marks darker than
 * any blue that still reads as an outline. The wood joint bars score
 * 2.09:1 over the BASE fill (rgba(60, 38, 18, .5) over wood), but the
 * painter shades every plank (0.86 + rng*0.24, floorPatterns.ts:71) and
 * strokes the bars over the SHADED plank — so the real worst adjacency is
 * the bars over the DARKEST plank at 1.76:1 (grain there 2.47:1; bars
 * over the lightest plank 2.37:1). The carpet dark flecks
 * (rgba(96, 106, 122, .7) over carpet) sit at 2.54:1. Clearing 3:1 there
 * would need a near-black border, which contradicts the "darken the
 * light-blue outline" intent; the pill edge over those marks is carried
 * by the fill (>= 9:1 against the border). The test below pins the FULL
 * sub-3:1 list — shaded-plank composites included — so a palette change
 * cannot silently widen it.
 */
import { describe, expect, it } from 'vitest';

import {
  BADGE_BG,
  BADGE_BORDER,
  BADGE_TEXT_COLOR,
} from '../../src/editor/render/measurementBadges';

/** WCAG 2.x contrast, all in sRGB (relative luminance, no gamma fudge). */
function parse(css: string): { rgb: [number, number, number]; alpha: number } {
  const text = css.trim();
  if (text.startsWith('#')) {
    const hex = text.length === 4
      ? text.slice(1).split('').map((c) => c + c).join('')
      : text.slice(1);
    return {
      rgb: [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
        number, number, number,
      ],
      alpha: 1,
    };
  }
  const nums = text.replace(/^rgba?\(|\)$/gi, '').split(',').map((p) => Number.parseFloat(p));
  return {
    rgb: [nums[0], nums[1], nums[2]],
    alpha: nums.length > 3 ? nums[3] : 1,
  };
}

/** Alpha-composite `fg` over `bg` (both must be opaque after this). */
function over(fg: string, bg: string): string {
  const f = parse(fg);
  const b = parse(bg);
  const mix = [0, 1, 2].map((i) => Math.round(f.alpha * f.rgb[i] + (1 - f.alpha) * b.rgb[i]));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(css: string): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const { rgb } = parse(css);
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Backdrops, read from their owning modules (render.ts / style.css / patterns). */
const BACKDROPS = [
  { name: 'canvas', color: '#fafafa' }, // style.css .editor-canvas-wrap
  { name: 'grid minor', color: '#ececec' }, // render.ts GRID_MINOR
  { name: 'grid major', color: '#dedede' }, // render.ts GRID_MAJOR
  { name: 'wood base', color: '#c9a06b' }, // floorPatterns.ts wood fill
  { name: 'wood plank dark', color: '#ad8a5c' }, // base * darkest plank shade (0.86)
  { name: 'wood plank light', color: '#ddb076' }, // base * lightest plank shade (1.10)
  { name: 'tile base', color: '#dde3e7' },
  { name: 'tile cell dark', color: '#d0d5d9' }, // base * darkest cell shade (0.94)
  { name: 'carpet base', color: '#8b96a6' },
  { name: 'concrete base', color: '#b9bdc2' },
] as const;

/** Finish passes, composited exactly as the painters stroke them. */
const FINISHES = [
  { name: 'wood grain', color: over('rgba(90, 58, 28, 0.35)', '#c9a06b') },
  { name: 'wood joints', color: over('rgba(60, 38, 18, 0.5)', '#c9a06b') },
  // Shaded-plank composites (fix round, tester finding 2): the grain and
  // joint passes are stroked over the PLANK (floorPatterns.ts:71-93),
  // which the painter shades by 0.86 + rng*0.24 — the marks never sit on
  // the base fill. Bracketing BOTH ends of that range is what pulls the
  // worst adjacency (joints over the darkest plank) inside the matrix.
  { name: 'wood grain on dark plank', color: over('rgba(90, 58, 28, 0.35)', '#ad8a5c') },
  { name: 'wood joints on dark plank', color: over('rgba(60, 38, 18, 0.5)', '#ad8a5c') },
  { name: 'wood grain on light plank', color: over('rgba(90, 58, 28, 0.35)', '#ddb076') },
  { name: 'wood joints on light plank', color: over('rgba(60, 38, 18, 0.5)', '#ddb076') },
  { name: 'tile cell edge', color: over('rgba(150, 160, 168, 0.55)', '#dde3e7') },
  { name: 'tile grout', color: over('rgba(130, 140, 148, 0.8)', '#dde3e7') },
  // Tile cells are shaded too (0.94 + rng*0.08, floorPatterns.ts:105) —
  // the worst end still clears 3:1 (edge 5.7:1, grout 4.1:1), so this
  // bracket adds no exception but keeps the shading model complete.
  { name: 'tile cell edge on dark cell', color: over('rgba(150, 160, 168, 0.55)', '#d0d5d9') },
  { name: 'tile grout on dark cell', color: over('rgba(130, 140, 148, 0.8)', '#d0d5d9') },
  { name: 'carpet light fleck', color: over('rgba(186, 196, 208, 0.7)', '#8b96a6') },
  { name: 'carpet dark fleck', color: over('rgba(96, 106, 122, 0.7)', '#8b96a6') },
  { name: 'concrete blotch light', color: over('rgba(255, 255, 255, 0.12)', '#b9bdc2') },
  { name: 'concrete blotch dark', color: over('rgba(70, 74, 80, 0.1)', '#b9bdc2') },
  { name: 'concrete speckle', color: over('rgba(90, 94, 100, 0.5)', '#b9bdc2') },
] as const;

const EVERYTHING = [...BACKDROPS, ...FINISHES];

describe('measurement pill contrast (pkg 155)', () => {
  it('text clears AA (4.5:1) on the composited fill over every backdrop', () => {
    for (const surface of EVERYTHING) {
      const fill = over(BADGE_BG, surface.color);
      expect(ratio(BADGE_TEXT_COLOR, fill), `text on ${surface.name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('border clears the 3:1 graphics minimum against the fill it encloses', () => {
    for (const surface of EVERYTHING) {
      const fill = over(BADGE_BG, surface.color);
      expect(ratio(BADGE_BORDER, fill), `border vs fill on ${surface.name}`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('border clears 3:1 against every backdrop base it sits on', () => {
    for (const surface of BACKDROPS) {
      expect(ratio(BADGE_BORDER, surface.color), `border on ${surface.name}`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('border clears 3:1 against the pattern finish passes it crosses', () => {
    // The marks pinned by the limits test below — including the
    // shaded-plank composites the review found missing from the matrix.
    const details = new Set([
      'wood joints',
      'wood grain on dark plank',
      'wood joints on dark plank',
      'wood joints on light plank',
      'carpet dark fleck',
    ]);
    for (const surface of FINISHES) {
      if (details.has(surface.name)) continue; // pinned by the limits test below
      expect(ratio(BADGE_BORDER, surface.color), `border on ${surface.name}`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('regression rationale: the pre-#155 border failed the grid (1.53:1)', () => {
    expect(ratio('#93c5fd', '#ececec')).toBeCloseTo(1.53, 1);
    expect(ratio('#93c5fd', '#ececec')).toBeLessThan(3);
  });

  it('known limits: the pinned sub-3:1 marks (shaded planks included)', () => {
    const below = EVERYTHING
      .filter((surface) => ratio(BADGE_BORDER, surface.color) < 3)
      .map((surface) => surface.name)
      .sort();
    // The joint bars (over the base fill AND over both ends of the plank
    // shade range), the grain over the darkest plank, and the carpet dark
    // flecks: darker than any blue that still reads as an outline (see the
    // header note). A new entry here means the border needs re-thinking,
    // not a bumped threshold.
    expect(below).toEqual([
      'carpet dark fleck',
      'wood grain on dark plank',
      'wood joints',
      'wood joints on dark plank',
      'wood joints on light plank',
    ]);
  });

  it('worst composite: joint bars over the DARKEST plank (1.76:1)', () => {
    // What the plank shading costs: 2.09:1 over the base fill, 1.76:1 over
    // the darkest plank — the true floor of the border's adjacency range.
    const worst = over('rgba(60, 38, 18, 0.5)', '#ad8a5c');
    expect(ratio(BADGE_BORDER, worst)).toBeCloseTo(1.76, 1);
    expect(ratio(BADGE_BORDER, worst)).toBeLessThan(2);
  });

  it('records why the plan example (#2563eb) was rejected', () => {
    // It only clears 3:1 on the light editor surfaces; measured live:
    expect(ratio('#2563eb', '#c9a06b')).toBeLessThan(3); // wood 2.15:1
    expect(ratio('#2563eb', '#8b96a6')).toBeLessThan(3); // carpet 1.73:1
  });

  it('sanity: the exported constants are the ones under test', () => {
    expect(BADGE_BORDER).toBe(BADGE_TEXT_COLOR);
    expect(parse(BADGE_BG).alpha).toBeLessThan(1);
  });
});
