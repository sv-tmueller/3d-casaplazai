/**
 * Materials spec (issue #179): slot routing onto the PBR texture sets.
 * HIGH returns a mapped material synchronously (placeholders until the
 * files land); flat slots never touch the loader; four floor slots
 * request four distinct sets; the slot list is the adapter's slot list.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Texture } from 'three';
import {
  clearAssetCaches,
  setTextureFetcher,
} from '../../src/viewer/assets/loader';
import { setFileUrls } from '../../src/viewer/assets/manifest';
import {
  buildMaterial,
  type MaterialSlot,
} from '../../src/viewer/materials';
import type { MaterialSlotId } from '../../src/viewer/types';

/** Compile-time pin: MaterialSlot and MaterialSlotId are the same union. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
const slotListsAgree: Equals<MaterialSlot, MaterialSlotId> = true;

let requested: string[] = [];

beforeEach(() => {
  clearAssetCaches();
  requested = [];
  setTextureFetcher((url) => {
    requested.push(url);
    return Promise.resolve(new Texture());
  });
});
afterEach(() => {
  setTextureFetcher(null);
  clearAssetCaches();
});

describe('MaterialSlot', () => {
  it('equals the adapter slot union (no members added)', () => {
    expect(slotListsAgree).toBe(true);
  });
});

describe('buildMaterial — slot routing', () => {
  it.each<MaterialSlot>([
    'wall',
    'ceiling',
    'roof',
    'wood',
    'tile',
    'carpet',
    'concrete',
    'furn-wood',
  ])('HIGH: %s is mapped synchronously', (slot) => {
    const mat = buildMaterial(slot);
    expect(mat.map).toBeTruthy();
    expect(mat.normalMap).toBeTruthy();
    expect(mat.roughnessMap).toBeTruthy();
    mat.dispose();
  });

  it.each<MaterialSlot>([
    'glass',
    'windowFrame',
    'furn-fabric',
    'furn-porcelain',
    'furn-laminate',
  ])('%s stays flat at HIGH and fetches nothing', (slot) => {
    const mat = buildMaterial(slot, true);
    expect(mat.map).toBeFalsy();
    expect(mat.normalMap).toBeFalsy();
    expect(requested).toHaveLength(0);
    mat.dispose();
  });

  it('the four floor slots request four distinct colour maps', () => {
    for (const slot of ['wood', 'tile', 'carpet', 'concrete'] as const) {
      buildMaterial(slot).dispose();
    }
    const colorUrls = requested.filter((u) => u.endsWith('/color.jpg'));
    expect(new Set(colorUrls).size).toBe(4);
    expect(colorUrls).toContain(setFileUrls('oak-planks').color);
    expect(colorUrls).toContain(setFileUrls('ceramic-tile').color);
    expect(colorUrls).toContain(setFileUrls('wool-carpet').color);
    expect(colorUrls).toContain(setFileUrls('polished-concrete').color);
  });

  it('walls, ceilings and roofs request their own sets', () => {
    buildMaterial('wall').dispose();
    buildMaterial('ceiling').dispose();
    buildMaterial('roof').dispose();
    expect(requested).toContain(setFileUrls('plaster-white').color);
    expect(requested).toContain(setFileUrls('plaster-ceiling').color);
    expect(requested).toContain(setFileUrls('roof-shingles').color);
  });

  it('furniture wood reuses the oak set rather than fetching it twice', () => {
    buildMaterial('wood').dispose();
    const before = requested.length;
    buildMaterial('furn-wood').dispose();
    expect(requested).toHaveLength(before);
  });

  it('default argument is HIGH and returns a mapped material synchronously', () => {
    const mat = buildMaterial('wall');
    expect(mat.map).toBeTruthy();
    expect(requested.length).toBeGreaterThan(0);
  });

  it('starts as the slot flat colour so the first frame is never blank', () => {
    expect(buildMaterial('wall').color.getHexString()).toBe('e8e2d8');
    expect(buildMaterial('wood').color.getHexString()).toBe('a06a3c');
    expect(buildMaterial('ceiling').color.getHexString()).toBe('fafafa');
  });

  it('skips the AO sampler on the matte architectural slots and keeps it on floors', () => {
    for (const slot of ['wall', 'ceiling', 'roof', 'carpet'] as const) {
      expect(buildMaterial(slot).aoMap, slot).toBeNull();
    }
    for (const slot of ['wood', 'tile', 'concrete'] as const) {
      expect(buildMaterial(slot).aoMap, slot).toBeTruthy();
    }
  });

  it('brightens the ceiling set once loaded: the scanned plaster is a mid grey', async () => {
    const ceiling = buildMaterial('ceiling');
    const wall = buildMaterial('wall');
    await new Promise((r) => setTimeout(r, 0));
    expect(ceiling.color.r).toBeGreaterThan(1);
    expect(wall.color.getHexString()).toBe('ffffff');
  });
});
