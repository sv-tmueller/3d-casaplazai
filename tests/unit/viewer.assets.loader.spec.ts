/**
 * Texture-set loader spec (issue #179): the material renders at once with
 * placeholder maps, upgrades IN PLACE when the files arrive, falls back to
 * flat colour on any failed download, releases pending upgrades when the
 * material is disposed, and fetches each set once per session.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Color,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';
import {
  clearAssetCaches,
  createPbrMaterial,
  pendingUpgradeCount,
  setMaxAnisotropy,
  setTextureFetcher,
} from '../../src/viewer/assets/loader';
import { setFileUrls } from '../../src/viewer/assets/manifest';

interface Deferred {
  url: string;
  texture: Texture;
  resolve: () => void;
  reject: (err: Error) => void;
}

/** A fetcher whose requests the test settles by hand. */
function manualFetcher(): { requests: Deferred[]; fetcher: (url: string) => Promise<Texture> } {
  const requests: Deferred[] = [];
  return {
    requests,
    fetcher: (url) =>
      new Promise<Texture>((resolve, reject) => {
        const texture = new Texture();
        requests.push({
          url,
          texture,
          resolve: () => resolve(texture),
          reject: (err) => reject(err),
        });
      }),
  };
}

/** Let queued promise continuations run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

const FLAT = '#a06a3c';

beforeEach(() => clearAssetCaches());
afterEach(() => {
  setTextureFetcher(null);
  clearAssetCaches();
});

describe('createPbrMaterial — synchronous flat start', () => {
  it('returns at once with placeholder maps wired and the flat colour', () => {
    const { fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });

    expect(mat.map).toBeTruthy();
    expect(mat.normalMap).toBeTruthy();
    expect(mat.roughnessMap).toBeTruthy();
    expect(mat.aoMap).toBeTruthy();
    expect(mat.color.getHexString()).toBe(new Color(FLAT).getHexString());
    expect(mat.roughness).toBe(0.72);
  });

  it('placeholders are 1x1 neutral textures: white colour, flat normal, full AO and roughness', () => {
    const { fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });

    const px = (t: Texture | null): number[] => Array.from((t!.image as { data: Uint8Array }).data);
    expect(px(mat.map)).toEqual([255, 255, 255, 255]);
    expect(px(mat.normalMap)).toEqual([128, 128, 255, 255]);
    expect(px(mat.roughnessMap)).toEqual([255, 255, 0, 255]);
    expect(mat.map!.colorSpace).toBe(SRGBColorSpace);
    expect(mat.normalMap!.colorSpace).toBe(NoColorSpace);
  });

  it('requests the set colour, normal and roughness files', () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });

    const urls = setFileUrls('oak-planks');
    expect(requests.map((r) => r.url).sort()).toEqual(
      [urls.color, urls.normal, urls.roughness].sort(),
    );
  });
});

describe('createPbrMaterial — in-place upgrade', () => {
  it('swaps the fetched maps into the SAME material instance', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    const id = mat.uuid;
    const placeholder = mat.map;

    for (const r of requests) r.resolve();
    await flush();

    const urls = setFileUrls('oak-planks');
    const byUrl = new Map(requests.map((r) => [r.url, r.texture]));
    expect(mat.uuid).toBe(id);
    expect(mat.map).toBe(byUrl.get(urls.color));
    expect(mat.map).not.toBe(placeholder);
    expect(mat.normalMap).toBe(byUrl.get(urls.normal));
    expect(mat.roughnessMap).toBe(byUrl.get(urls.roughness));
  });

  it('colours the albedo map sRGB, leaves normal and roughness linear, and tiles at the real size', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    for (const r of requests) r.resolve();
    await flush();

    expect(mat.map!.colorSpace).toBe(SRGBColorSpace);
    expect(mat.normalMap!.colorSpace).toBe(NoColorSpace);
    expect(mat.roughnessMap!.colorSpace).toBe(NoColorSpace);
    for (const t of [mat.map!, mat.normalMap!, mat.roughnessMap!]) {
      expect(t.wrapS).toBe(RepeatWrapping);
      expect(t.wrapT).toBe(RepeatWrapping);
      expect(t.repeat.x).toBeCloseTo(1 / 1.2, 6);
      expect(t.repeat.y).toBeCloseTo(1 / 1.2, 6);
    }
  });

  it('resets the tint to white and lets the roughness map drive the surface', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    for (const r of requests) r.resolve();
    await flush();

    expect(mat.color.getHexString()).toBe('ffffff');
    expect(mat.roughness).toBe(1);
  });

  it('honours a custom upgraded tint and roughness gain', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('grass', {
      color: '#6f8a4e',
      roughness: 0.95,
      upgradedColor: '#e0f0d0',
      upgradedRoughness: 0.8,
    });
    for (const r of requests) r.resolve();
    await flush();

    expect(mat.color.getHexString()).toBe('e0f0d0');
    expect(mat.roughness).toBe(0.8);
  });

  it('packed ARM sets reuse the roughness texture as the AO map', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    for (const r of requests) r.resolve();
    await flush();

    expect(mat.aoMap).toBe(mat.roughnessMap);
  });

  it('plain-roughness sets keep the neutral AO placeholder', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('wool-carpet', { color: '#6b7f8f', roughness: 1 });
    const placeholderAo = mat.aoMap;
    for (const r of requests) r.resolve();
    await flush();

    expect(mat.roughnessMap).not.toBe(placeholderAo);
    expect(mat.aoMap).toBe(placeholderAo);
  });
});

describe('createPbrMaterial — failure fallback', () => {
  it('a failed download leaves the flat colour and placeholders, never an empty map', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    const placeholders = [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap];

    requests[0].resolve();
    requests[1].reject(new Error('404'));
    requests[2].resolve();
    await flush();

    expect([mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap]).toEqual(placeholders);
    expect(mat.color.getHexString()).toBe(new Color(FLAT).getHexString());
    expect(mat.roughness).toBe(0.72);
  });

  it('a synchronous fetcher throw is treated as a failed download', async () => {
    setTextureFetcher(() => {
      throw new Error('no network');
    });
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    await flush();

    expect(mat.color.getHexString()).toBe(new Color(FLAT).getHexString());
    expect(mat.map).toBeTruthy();
  });

  it('retries a failed set on the next material, since failures are not cached', async () => {
    let attempt = 0;
    const settled: Texture[] = [];
    setTextureFetcher(async () => {
      attempt += 1;
      if (attempt <= 3) throw new Error('offline');
      const t = new Texture();
      settled.push(t);
      return t;
    });
    const first = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    await flush();
    expect(first.color.getHexString()).not.toBe('ffffff');

    const second = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    await flush();
    expect(second.color.getHexString()).toBe('ffffff');
    expect(settled).toContain(second.map);
  });
});

describe('createPbrMaterial — lifetime', () => {
  it('a material disposed before the files land is not upgraded', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    const placeholder = mat.map;
    expect(pendingUpgradeCount()).toBe(1);

    mat.dispose();
    expect(pendingUpgradeCount()).toBe(0);
    for (const r of requests) r.resolve();
    await flush();

    expect(mat.map).toBe(placeholder);
  });

  it('settled upgrades drop out of the pending set', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    expect(pendingUpgradeCount()).toBe(1);
    for (const r of requests) r.resolve();
    await flush();
    expect(pendingUpgradeCount()).toBe(0);
  });

  it('fetches each set once per session; rebuilds reuse the cache', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const a = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    const b = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    expect(requests).toHaveLength(3);

    for (const r of requests) r.resolve();
    await flush();
    const c = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    await flush();

    expect(requests).toHaveLength(3);
    expect(a.map).toBe(b.map);
    expect(c.map).toBe(a.map);
  });

  it('different sets fetch independently', () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    createPbrMaterial('ceramic-tile', { color: '#ccd3d8', roughness: 0.72 });
    expect(requests).toHaveLength(6);
  });
});

describe('setMaxAnisotropy', () => {
  it('applies to textures that load afterwards and to cached ones when raised', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    setMaxAnisotropy(8);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    for (const r of requests) r.resolve();
    await flush();
    expect(mat.map!.anisotropy).toBe(8);

    setMaxAnisotropy(16);
    expect(mat.map!.anisotropy).toBe(16);
    expect(mat.normalMap!.anisotropy).toBe(16);
  });

  it('defaults to 4 and sanitises nonsense input to 1', async () => {
    const { requests, fetcher } = manualFetcher();
    setTextureFetcher(fetcher);
    const mat = createPbrMaterial('oak-planks', { color: FLAT, roughness: 0.72 });
    for (const r of requests) r.resolve();
    await flush();
    expect(mat.map!.anisotropy).toBe(4);

    setMaxAnisotropy(Number.NaN);
    expect(mat.map!.anisotropy).toBe(1);
  });
});
