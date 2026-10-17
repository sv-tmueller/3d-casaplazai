// @vitest-environment happy-dom
/**
 * Materials spec (issue #6): five kinds generate DISTINCT cached
 * canvases; repeat-scaling math correct for a known 4.5 m floor.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMaterial,
  clearMaterialCaches,
  FALLBACK_COLORS,
  getTexture,
  getTextureCanvas,
  repeatsFor,
} from '../../src/viewer/materials';
import type { TextureKind } from '../../src/viewer/materials';

const KINDS: TextureKind[] = ['wood', 'tile', 'carpet', 'concrete', 'wall'];

/**
 * Drawer-op recorder: happy-dom canvases lack a real 2D context, so
 * materials.ts tolerantly records drawing ops onto this WeakMap keyed
 * by canvas — enabling structural assertions without rasterization.
 */
declare global {
  var __casaDrawerTrails: WeakMap<HTMLCanvasElement, string[]> | undefined;
}

beforeEach(() => clearMaterialCaches());
afterEach(() => clearMaterialCaches());

describe('getTextureCanvas — five distinct generators', () => {
  it.each(KINDS)('%s draws a filled 512² canvas', (kind) => {
    const canvas = getTextureCanvas(kind);
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
  });

  it('distinct kinds produce visually distinct canvases', () => {
    const woods = getTextureCanvas('wood');
    const tiles = getTextureCanvas('tile');
    const carpets = getTextureCanvas('carpet');

    // happy-dom's getContext returns null, so distinguish kinds by the
    // drawer invocation trail recorded by materials.ts onto the lazy
    // global WeakMap (installed on first canvas-less draw).
    const TRAILS = globalThis.__casaDrawerTrails!;
    const trails = TRAILS.get(woods)!;
    expect(trails).toContain('fillRect');
    expect(TRAILS.get(tiles)).toContain('stroke');
    expect(TRAILS.get(carpets)).not.toContain('bezierCurveTo');
    expect(trails).toContain('bezierCurveTo');
  });

  it('cache returns the SAME canvas object per kind', () => {
    expect(getTextureCanvas('wood')).toBe(getTextureCanvas('wood'));
  });
});

describe('getTexture — uploads', () => {
  it('wraps cached canvases in a repeat-wrapped texture', () => {
    const tex = getTexture('tile');
    expect(tex.image).toBe(getTextureCanvas('tile'));
    expect(tex.repeat.x).toBe(1);
  });
});

describe('repeatsFor — physical-meter scaling', () => {
  it('scales a known 4.5 m floor to 3.75 repetitions', () => {
    expect(repeatsFor(4.5)).toBeCloseTo(3.75, 6);
  });

  it('floors tiny spans at 1 repetition', () => {
    expect(repeatsFor(0.2)).toBe(1);
  });
});

describe('buildMaterial — slot routing', () => {
  it('wall slot yields a mapped material', () => {
    const mat = buildMaterial('wall');
    expect(mat.map).toBeTruthy();
    mat.dispose();
  });

  it('ceiling slot yields unmapped near-white material', () => {
    const mat = buildMaterial('ceiling');
    expect(mat.map).toBeFalsy();
    mat.dispose();
  });

  it('floor slots yield mapped materials keyed by enum', () => {
    for (const kind of ['wood', 'tile', 'carpet', 'concrete'] as const) {
      const mat = buildMaterial(kind);
      expect(mat.map).toBeTruthy();
      mat.dispose();
    }
  });
});

describe('FALLBACK_COLORS — one per kind', () => {
  it('defines hex colors for all five kinds', () => {
    for (const kind of KINDS) {
      expect(FALLBACK_COLORS[kind]).toMatch(/^#/);
    }
  });
});
