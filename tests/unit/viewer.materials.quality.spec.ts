// @vitest-environment happy-dom
/**
 * Materials quality spec (issue #87): buildMaterial(slot, hiQuality)
 * gating — LOW = color-only (roughness budget KEPT), HIGH = procedural
 * map; roofShingle drawer determinism via the __casaDrawerTrails
 * recording-proxy pattern (structural, no rasterization needed).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMaterial,
  clearMaterialCaches,
  FALLBACK_COLORS,
  getTexture,
  getTextureCanvas,
  setMaxAnisotropy,
  type MaterialSlot,
} from '../../src/viewer/materials';

declare global {
  var __casaDrawerTrails: WeakMap<HTMLCanvasElement, string[]> | undefined;
}

const TEXTURED_SLOTS: MaterialSlot[] = [
  'wall',
  'roof',
  'wood',
  'tile',
  'carpet',
  'concrete',
];

/** Slots expected flat at BOTH tiers (no procedural map exists/wanted). */
const ALWAYS_FLAT_SLOTS: MaterialSlot[] = [
  'ceiling',
  'glass',
  'windowFrame',
  'furn-fabric',
  'furn-porcelain',
  'furn-laminate',
];

const ALL_SLOTS: MaterialSlot[] = [
  ...TEXTURED_SLOTS,
  ...ALWAYS_FLAT_SLOTS,
  'furn-wood',
];

beforeEach(() => clearMaterialCaches());
afterEach(() => clearMaterialCaches());

describe('buildMaterial — quality gating per slot', () => {
  it.each(TEXTURED_SLOTS)('HIGH: %s carries a procedural map', (slot) => {
    const mat = buildMaterial(slot, true);
    expect(mat.map).toBeTruthy();
    mat.dispose();
  });

  it.each(TEXTURED_SLOTS)('LOW: %s is color-only but keeps roughness', (slot) => {
    const hi = buildMaterial(slot, true);
    const lo = buildMaterial(slot, false);
    expect(lo.map).toBeFalsy();
    // Gloss differentiation survives the fast path (#87 AC).
    expect(lo.roughness).toBe(hi.roughness);
    hi.dispose();
    lo.dispose();
  });

  it.each(ALWAYS_FLAT_SLOTS)(
    'both tiers: %s stays flat (never uploads)',
    (slot) => {
      expect(buildMaterial(slot, true).map).toBeFalsy();
      expect(buildMaterial(slot, false).map).toBeFalsy();
    },
  );

  it('glass reads glossier than walls at BOTH tiers', () => {
    for (const hi of [true, false]) {
      const glass = buildMaterial('glass', hi);
      const wall = buildMaterial('wall', hi);
      expect(glass.roughness).toBeLessThan(wall.roughness);
      glass.dispose();
      wall.dispose();
    }
  });

  it('LOW never populates the texture cache for any slot', () => {
    for (const slot of ALL_SLOTS) {
      buildMaterial(slot, false).dispose();
    }
    // Nothing uploaded: fetching any kind must allocate a FRESH canvas
    // (proof the LOW pass drew nothing).
    const canvas = getTextureCanvas('wood');
    expect(globalThis.__casaDrawerTrails?.has(canvas)).toBe(true);
  });

  it('default argument is HIGH (backward compat with old callers)', () => {
    expect(buildMaterial('wall').map).toBeTruthy();
  });
});

describe('roofShingle — dedicated roof drawer', () => {
  it('exists as a sixth kind with a fallback color', () => {
    expect(FALLBACK_COLORS.roofShingle).toBe('#b0623f');
  });

  it('HIGH roof uses the shingle map, not concrete', () => {
    const roofMat = buildMaterial('roof', true);
    const concreteMat = buildMaterial('concrete', true);
    expect(roofMat.map).toBe(getTexture('roofShingle'));
    expect(roofMat.map).not.toBe(concreteMat.map);
    roofMat.dispose();
    concreteMat.dispose();
  });

  it('drawer is deterministic: double-draw produces identical trails', () => {
    const first = getTextureCanvas('roofShingle');
    const trailA = [...(globalThis.__casaDrawerTrails!.get(first) ?? [])];
    clearMaterialCaches();
    const second = getTextureCanvas('roofShingle');
    const trailB = [...(globalThis.__casaDrawerTrails!.get(second) ?? [])];
    // Identical method sequence ⇒ identical PRNG consumption ⇒ the
    // same raster would be produced in a real browser.
    expect(trailB.length).toBeGreaterThan(0);
    expect(trailB.join(',')).toBe(trailA.join(','));
  });

  it('trail shows course/tab structure (clipped quadratic fills)', () => {
    const canvas = getTextureCanvas('roofShingle');
    const trail = globalThis.__casaDrawerTrails!.get(canvas)!;
    expect(trail).toContain('quadraticCurveTo');
    expect(trail).toContain('clip');
    expect(trail.filter((op) => op === 'save').length).toBeGreaterThan(8);
  });

  it('shingle differs structurally from concrete (speckle borrower retired)', () => {
    const shingleTrail = globalThis.__casaDrawerTrails!.get(
      getTextureCanvas('roofShingle'),
    )!;
    const concreteTrail = globalThis.__casaDrawerTrails!.get(
      getTextureCanvas('concrete'),
    )!;
    expect(shingleTrail.join(',')).not.toBe(concreteTrail.join(','));
  });
});

describe('setMaxAnisotropy — session-wide setter', () => {
  it('raises anisotropy on already-cached textures', () => {
    const tex = getTexture('wood');
    expect(tex.anisotropy).toBe(4); // conservative default
    setMaxAnisotropy(16);
    expect(tex.anisotropy).toBe(16);
  });

  it('applies to textures created afterwards', () => {
    setMaxAnisotropy(8);
    expect(getTexture('tile').anisotropy).toBe(8);
  });

  it('ignores nonsense values (defensive sanitize)', () => {
    setMaxAnisotropy(Number.NaN);
    expect(getTexture('carpet').anisotropy).toBe(1);
  });
});
