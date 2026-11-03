/**
 * Materials quality spec (issue #87, reworked for #179): buildMaterial's
 * `hiQuality` gate. LOW is flat colour only, issues no texture request
 * and keeps the roughness budget of HIGH, so gloss differentiation
 * survives the fast path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Texture } from 'three';
import {
  clearAssetCaches,
  setTextureFetcher,
} from '../../src/viewer/assets/loader';
import {
  buildGroundMaterial,
  buildMaterial,
  setMaxAnisotropy,
  type MaterialSlot,
} from '../../src/viewer/materials';

const ALL_SLOTS: MaterialSlot[] = [
  'wall',
  'ceiling',
  'roof',
  'wood',
  'tile',
  'carpet',
  'concrete',
  'glass',
  'windowFrame',
  'furn-wood',
  'furn-fabric',
  'furn-porcelain',
  'furn-laminate',
];

let fetchCalls = 0;

beforeEach(() => {
  clearAssetCaches();
  fetchCalls = 0;
  setTextureFetcher(() => {
    fetchCalls += 1;
    return Promise.resolve(new Texture());
  });
});
afterEach(() => {
  setTextureFetcher(null);
  clearAssetCaches();
});

describe('buildMaterial — quality gating', () => {
  it('LOW makes zero loader calls and wires no map for any slot', () => {
    for (const slot of ALL_SLOTS) {
      const mat = buildMaterial(slot, false);
      expect(mat.map, slot).toBeFalsy();
      expect(mat.normalMap, slot).toBeFalsy();
      expect(mat.roughnessMap, slot).toBeFalsy();
      expect(mat.aoMap, slot).toBeFalsy();
      mat.dispose();
    }
    expect(fetchCalls).toBe(0);
  });

  it.each(ALL_SLOTS)('low and high roughness agree for %s', (slot) => {
    const hi = buildMaterial(slot, true);
    const lo = buildMaterial(slot, false);
    expect(lo.roughness).toBe(hi.roughness);
    hi.dispose();
    lo.dispose();
  });

  it('low and high flat colours agree, so a not-yet-loaded HIGH surface matches LOW', () => {
    for (const slot of ALL_SLOTS) {
      const hi = buildMaterial(slot, true);
      const lo = buildMaterial(slot, false);
      expect(hi.color.getHexString(), slot).toBe(lo.color.getHexString());
      hi.dispose();
      lo.dispose();
    }
  });

  it('glass reads glossier than walls at BOTH tiers', () => {
    for (const hi of [true, false]) {
      const glass = buildMaterial('glass', hi);
      const wall = buildMaterial('wall', hi);
      expect(glass.roughness).toBeLessThan(wall.roughness);
      glass.dispose();
      wall.dispose();
    }
  });
});

describe('buildGroundMaterial', () => {
  it('is mapped synchronously and requests only the grass colour map', () => {
    const mat = buildGroundMaterial();
    expect(mat.map).toBeTruthy();
    expect(fetchCalls).toBe(1);
  });

  it('is unlit (the shade is owned by applySunPose)', () => {
    expect(buildGroundMaterial().isMeshBasicMaterial).toBe(true);
  });
});

describe('setMaxAnisotropy (re-exported)', () => {
  it('reaches textures loaded afterwards through the material factory', async () => {
    setMaxAnisotropy(8);
    const mat = buildMaterial('wall');
    await new Promise((r) => setTimeout(r, 0));
    expect(mat.map!.anisotropy).toBe(8);
  });
});
