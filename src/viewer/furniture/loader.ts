/**
 * Lazy furniture model loader (issue #180).
 *
 * One cached promise per furniture type: concurrent callers share one
 * fetch, and a failure is cached as null for the session so a rebuild
 * does not retry. The default fetcher imports GLTFLoader and the meshopt
 * decoder on first use, keeping both out of the main bundle.
 */
import type { Material, Mesh, Object3D, Texture } from 'three';
import type { FurnitureType } from '../../shared/schema';
import type { FurnitureLibrary, ModelFetcher } from './types';

export function modelUrl(type: FurnitureType): string {
  return `${import.meta.env.BASE_URL}assets/models/${type}.glb`;
}

/** Default fetcher: GLTFLoader + meshopt, imported lazily. */
export const gltfFetcher: ModelFetcher = async (url) => {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
};

const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
] as const;

function disposeMaterial(m: Material): void {
  const rec = m as unknown as Record<string, Texture | null | undefined>;
  for (const key of TEXTURE_KEYS) rec[key]?.dispose();
  m.dispose();
}

function disposeTemplate(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) disposeMaterial(m);
  });
}

export function createFurnitureLibrary(
  fetcher: ModelFetcher = gltfFetcher,
): FurnitureLibrary {
  const pending = new Map<FurnitureType, Promise<Object3D | null>>();
  const ready = new Map<FurnitureType, Object3D>();

  function load(type: FurnitureType): Promise<Object3D | null> {
    let p = pending.get(type);
    if (!p) {
      let started: Promise<Object3D>;
      try {
        started = fetcher(modelUrl(type));
      } catch (e) {
        started = Promise.reject(e);
      }
      p = started.then(
        (tpl) => {
          // dispose() may have run while the fetch was in flight.
          if (pending.get(type) === p) ready.set(type, tpl);
          return tpl;
        },
        () => null,
      );
      pending.set(type, p);
    }
    return p;
  }

  return {
    peek(type) {
      void load(type);
      return ready.get(type) ?? null;
    },
    load,
    dispose() {
      for (const tpl of ready.values()) disposeTemplate(tpl);
      ready.clear();
      pending.clear();
    },
  };
}
