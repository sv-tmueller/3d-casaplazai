/**
 * Furniture library / loader spec (issue #180): lazy per-type cache,
 * box-while-loading, model-after-load, failure fallback without retry.
 * Uses fake fetchers with hand-resolved promises; no GLB, no browser.
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { FurnitureType } from '../../src/shared/schema';
import {
  createFurnitureLibrary,
  placeFurniture,
  type FurniturePlacement,
} from '../../src/viewer/furniture';

const TYPES: FurnitureType[] = [
  'bed',
  'sofa',
  'table',
  'chair',
  'counter',
  'bathtub',
  'toilet',
];

function tpl(): Object3D {
  const g = new Group();
  const m = new Mesh(new BoxGeometry(1, 0.5, 0.8), new MeshBasicMaterial());
  m.position.y = 0.25;
  m.name = 'body';
  g.add(m);
  return g;
}

function placement(type: FurnitureType, id: string): FurniturePlacement {
  return {
    itemId: id,
    type,
    position: [1, 1],
    rotationDeg: 0,
    footprint: [1, 1],
    zMin: 0,
    zMax: 0.8,
  };
}

interface Deferred {
  url: string;
  resolve: (o: Object3D) => void;
  reject: (e: unknown) => void;
}

function manualFetcher() {
  const calls: Deferred[] = [];
  const fetcher = (url: string): Promise<Object3D> =>
    new Promise<Object3D>((resolve, reject) => {
      calls.push({ url, resolve, reject });
    });
  return { fetcher, calls };
}

describe('createFurnitureLibrary', () => {
  it('requests <BASE_URL>assets/models/<type>.glb for every type', async () => {
    const urls: string[] = [];
    const lib = createFurnitureLibrary(async (url) => {
      urls.push(url);
      return tpl();
    });
    await Promise.all(TYPES.map((t) => lib.load(t)));
    const base = import.meta.env.BASE_URL;
    expect(urls.sort()).toEqual(TYPES.map((t) => `${base}assets/models/${t}.glb`).sort());
  });

  it('is lazy: nothing is fetched until peek or load', () => {
    const fetcher = vi.fn(async () => tpl());
    createFurnitureLibrary(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('peek returns null while loading and starts exactly one fetch', () => {
    const { fetcher, calls } = manualFetcher();
    const lib = createFurnitureLibrary(fetcher);
    expect(lib.peek('bed')).toBeNull();
    expect(lib.peek('bed')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('peek returns the cached template once loaded; load resolves the same one', async () => {
    const { fetcher, calls } = manualFetcher();
    const lib = createFurnitureLibrary(fetcher);
    const p = lib.load('sofa');
    const t = tpl();
    calls[0].resolve(t);
    expect(await p).toBe(t);
    expect(lib.peek('sofa')).toBe(t);
    expect(await lib.load('sofa')).toBe(t);
    expect(calls).toHaveLength(1);
  });

  it('concurrent loads of one type share a single fetch', async () => {
    const { fetcher, calls } = manualFetcher();
    const lib = createFurnitureLibrary(fetcher);
    const a = lib.load('chair');
    const b = lib.load('chair');
    expect(calls).toHaveLength(1);
    calls[0].resolve(tpl());
    expect(await a).toBe(await b);
  });

  it('a rejected fetch resolves null, never rejects, and is not retried', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const fetcher = vi.fn(async (): Promise<Object3D> => {
      throw new Error('404');
    });
    const lib = createFurnitureLibrary(fetcher);
    expect(await lib.load('toilet')).toBeNull();
    expect(await lib.load('toilet')).toBeNull();
    expect(lib.peek('toilet')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('dispose frees geometry and materials of cached templates and clears the cache', async () => {
    const t = tpl();
    const mesh = t.getObjectByName('body') as Mesh;
    const geoDispose = vi.spyOn(mesh.geometry, 'dispose');
    const matDispose = vi.spyOn(mesh.material as MeshBasicMaterial, 'dispose');
    const fetcher = vi.fn(async () => t);
    const lib = createFurnitureLibrary(fetcher);
    await lib.load('table');
    lib.dispose();
    expect(geoDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);
    expect(lib.peek('table')).toBeNull();
    await lib.load('table');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('placeFurniture with a lazy library', () => {
  it('shows the box while loading, then the model replaces it', async () => {
    const { fetcher, calls } = manualFetcher();
    const lib = createFurnitureLibrary(fetcher);
    const g = placeFurniture({ furniture: [placement('bed', 'a')] }, { library: lib });
    const pivot = g.children[0];
    const box = pivot.children[0];
    expect(pivot.getObjectByName('body')).toBeUndefined();
    calls[0].resolve(tpl());
    await lib.load('bed');
    await Promise.resolve();
    expect(pivot.getObjectByName('body')).toBeDefined();
    expect(pivot.children).not.toContain(box);
  });

  it('fetches once per type even with several pieces and repeated placements', async () => {
    const fetcher = vi.fn(async () => tpl());
    const lib = createFurnitureLibrary(fetcher);
    const ps = [placement('bed', 'a'), placement('bed', 'b'), placement('sofa', 'c')];
    placeFurniture({ furniture: ps }, { library: lib });
    placeFurniture({ furniture: ps }, { library: lib });
    await Promise.all([lib.load('bed'), lib.load('sofa')]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses the cached model immediately on a later placement', async () => {
    const lib = createFurnitureLibrary(async () => tpl());
    await lib.load('table');
    const g = placeFurniture({ furniture: [placement('table', 'a')] }, { library: lib });
    expect(g.children[0].getObjectByName('body')).toBeDefined();
  });

  it('a failed fetch leaves the box in place, with no unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const lib = createFurnitureLibrary(async () => {
      throw new Error('offline');
    });
    const g = placeFurniture({ furniture: [placement('chair', 'a')] }, { library: lib });
    const box = g.children[0].children[0];
    await lib.load('chair');
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(g.children[0].children[0]).toBe(box);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('does not swap into a pivot whose shape was already replaced', async () => {
    const { fetcher, calls } = manualFetcher();
    const lib = createFurnitureLibrary(fetcher);
    const g = placeFurniture({ furniture: [placement('bed', 'a')] }, { library: lib });
    const pivot = g.children[0];
    pivot.clear();
    calls[0].resolve(tpl());
    await lib.load('bed');
    await Promise.resolve();
    expect(pivot.children).toHaveLength(0);
  });
});
