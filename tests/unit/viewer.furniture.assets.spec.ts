/**
 * Committed furniture model assets (issue #180): budgets, meshopt
 * compression, and the normalised orientation contract the runtime
 * (place.ts) relies on, checked against the real GLBs headlessly.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Box3, Group, Vector3, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FurnitureType } from '../../src/shared/schema';
import { createFurnitureLibrary, placeFurniture } from '../../src/viewer/furniture';

const TYPES: FurnitureType[] = [
  'bed',
  'sofa',
  'table',
  'chair',
  'counter',
  'bathtub',
  'toilet',
];

const DIR = join(process.cwd(), 'public', 'assets', 'models');
const file = (t: FurnitureType): string => join(DIR, `${t}.glb`);

/** Types whose front is identifiable: backrest, headboard or tank at the back. */
const HAS_BACK: FurnitureType[] = ['sofa', 'bed', 'chair', 'toilet'];

function glbJson(path: string): { extensionsRequired?: string[]; extensionsUsed?: string[] } {
  const buf = readFileSync(path);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const len = buf.readUInt32LE(12);
  expect(buf.readUInt32LE(16)).toBe(0x4e4f534a); // 'JSON'
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

/** Parsed scene in plan orientation (the same axis fix place.ts applies). */
const planSpace = new Map<FurnitureType, Object3D>();
const scenes = new Map<FurnitureType, Object3D>();

beforeAll(async () => {
  await MeshoptDecoder.ready;
  for (const t of TYPES) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const bytes = readFileSync(file(t));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await loader.parseAsync(ab as ArrayBuffer, '');
    scenes.set(t, gltf.scene);
    const fix = new Group();
    fix.rotation.x = Math.PI / 2;
    fix.add(gltf.scene);
    fix.updateMatrixWorld(true);
    planSpace.set(t, fix);
  }
});

describe('furniture model assets', () => {
  it('has all seven files, each under 500 KB and together under 4 MB', () => {
    let total = 0;
    for (const t of TYPES) {
      const size = statSync(file(t)).size;
      expect(size, `${t}.glb`).toBeGreaterThan(0);
      expect(size, `${t}.glb`).toBeLessThan(500_000);
      total += size;
    }
    expect(total).toBeLessThan(4_000_000);
  });

  for (const t of TYPES) {
    it(`${t}: EXT_meshopt_compression is required`, () => {
      expect(glbJson(file(t)).extensionsRequired).toContain('EXT_meshopt_compression');
    });

    it(`${t}: base at z=0 and centred on x/y within 1 mm after the axis fix`, () => {
      const box = new Box3().setFromObject(planSpace.get(t)!);
      expect(box.min.z).toBeCloseTo(0, 3);
      expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 3);
      expect((box.min.y + box.max.y) / 2).toBeCloseTo(0, 3);
      expect(box.max.z - box.min.z).toBeGreaterThan(0.3); // metres, not millimetres
      expect(box.max.x - box.min.x).toBeLessThan(3);
      expect(box.max.y - box.min.y).toBeLessThan(3);
    });
  }

  for (const t of HAS_BACK) {
    it(`${t}: backrest / headboard / tank sits at the back (plan +y)`, () => {
      const root = planSpace.get(t)!;
      const box = new Box3().setFromObject(root);
      const cut = box.min.z + 0.7 * (box.max.z - box.min.z);
      let sum = 0;
      let n = 0;
      const v = new Vector3();
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          if (v.z > cut) {
            sum += v.y;
            n++;
          }
        }
      });
      expect(n).toBeGreaterThan(0);
      expect(sum / n).toBeGreaterThan(0);
    });
  }
});

describe('placeFurniture with the real GLBs', () => {
  for (const t of TYPES) {
    it(`${t}: fits the footprint and sits on zMin`, async () => {
      const lib = createFurnitureLibrary(async (url) => {
        const name = url.split('/').pop()!.replace('.glb', '');
        return scenes.get(name as FurnitureType)!;
      });
      await lib.load(t);
      const g = placeFurniture(
        {
          furniture: [
            {
              itemId: 'x',
              type: t,
              position: [4, -2],
              rotationDeg: 0,
              footprint: [1.5, 0.9],
              zMin: 2.6,
              zMax: 3.4,
            },
          ],
        },
        { library: lib },
      );
      g.updateMatrixWorld(true);
      const box = new Box3().setFromObject(g);
      expect(box.min.x).toBeCloseTo(4 - 0.75, 3);
      expect(box.max.x).toBeCloseTo(4 + 0.75, 3);
      expect(box.min.y).toBeCloseTo(-2 - 0.45, 3);
      expect(box.max.y).toBeCloseTo(-2 + 0.45, 3);
      expect(box.min.z).toBeCloseTo(2.6, 3);
    });
  }
});
