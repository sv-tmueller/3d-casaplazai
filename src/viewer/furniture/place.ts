/**
 * placeFurniture (issue #180): one pivot per piece, positioned at the
 * footprint centre on its base height and rotated CCW about +Z. The
 * shape inside is either the model (fitted to the footprint) or, while
 * the model loads or after a load failure, the box volume.
 *
 * Pieces own no GPU resources: boxes share one geometry and a material
 * per type, and model clones share their template's geometry. Dispose
 * the FurnitureLibrary (templates) on teardown; the shared box geometry
 * and default box materials live for the page session.
 */
import {
  BoxGeometry,
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three';
import type { FurnitureType } from '../../shared/schema';
import { createFurnitureLibrary } from './loader';
import type { FurnitureLibrary, FurniturePlacement, FurnitureSource } from './types';

export interface PlaceOptions {
  library?: FurnitureLibrary;
  boxMaterial?: (type: FurnitureType) => Material;
}

const DEG = Math.PI / 180;

/** glTF Y-up/front +Z to plan Z-up/front -y (no mirroring). */
const AXIS_FIX_X = Math.PI / 2;

/** Unit footprint box, base at z=0, shared by every fallback box. */
let unitBox: BoxGeometry | null = null;
function sharedUnitBox(): BoxGeometry {
  if (!unitBox) {
    unitBox = new BoxGeometry(1, 1, 1);
    unitBox.translate(0, 0, 0.5);
  }
  return unitBox;
}

const BOX_COLORS: Record<FurnitureType, number> = {
  bed: 0xc9b79c,
  sofa: 0x8a9bb0,
  table: 0xa9825a,
  chair: 0xb5895c,
  counter: 0xd8d4cc,
  bathtub: 0xe8eef0,
  toilet: 0xf2f4f5,
};

const defaultBoxMaterials = new Map<FurnitureType, Material>();
function defaultBoxMaterial(type: FurnitureType): Material {
  let m = defaultBoxMaterials.get(type);
  if (!m) {
    m = new MeshStandardMaterial({ color: BOX_COLORS[type], roughness: 0.9 });
    defaultBoxMaterials.set(type, m);
  }
  return m;
}

interface NativeSize {
  w: number;
  d: number;
}

/** Native plan-space width/depth per template, measured once. */
const nativeSizes = new WeakMap<Object3D, NativeSize | null>();

function nativeSize(template: Object3D): NativeSize | null {
  const cached = nativeSizes.get(template);
  if (cached !== undefined) return cached;
  const fix = new Group();
  fix.rotation.x = AXIS_FIX_X;
  fix.add(template.clone(true));
  fix.updateMatrixWorld(true);
  const box = new Box3().setFromObject(fix);
  const w = box.max.x - box.min.x;
  const d = box.max.y - box.min.y;
  const size = w > 1e-9 && d > 1e-9 ? { w, d } : null;
  nativeSizes.set(template, size);
  return size;
}

function buildBox(p: FurniturePlacement, material: Material): Mesh {
  const mesh = new Mesh(sharedUnitBox(), material);
  mesh.name = 'furniture-box';
  mesh.scale.set(p.footprint[0], p.footprint[1], p.zMax - p.zMin);
  return mesh;
}

/** Model shape, or null when the template has no usable footprint. */
function buildModel(p: FurniturePlacement, template: Object3D): Object3D | null {
  const native = nativeSize(template);
  if (!native) return null;
  // Scale lives on the shape, never on the pivot.
  const shape = new Group();
  shape.name = 'furniture-model';
  shape.scale.set(p.footprint[0] / native.w, p.footprint[1] / native.d, 1);
  const fix = new Group();
  fix.rotation.x = AXIS_FIX_X;
  fix.add(template.clone(true));
  shape.add(fix);
  return shape;
}

export function placeFurniture(adapted: FurnitureSource, opts: PlaceOptions = {}): Group {
  const library = opts.library ?? createFurnitureLibrary();
  const boxMaterial = opts.boxMaterial ?? defaultBoxMaterial;
  const root = new Group();
  root.name = 'furniture';

  for (const p of adapted.furniture) {
    const pivot = new Group();
    pivot.name = p.itemId;
    pivot.position.set(p.position[0], p.position[1], p.zMin);
    pivot.rotation.z = p.rotationDeg * DEG;

    const cached = library.peek(p.type);
    const model = cached ? buildModel(p, cached) : null;
    if (model) {
      pivot.add(model);
    } else {
      const box = buildBox(p, boxMaterial(p.type));
      pivot.add(box);
      void library.load(p.type).then((tpl) => {
        // Swap only if the pivot still holds the box this call placed.
        if (!tpl || pivot.children[0] !== box) return;
        const swapped = buildModel(p, tpl);
        if (!swapped) return;
        pivot.remove(box);
        pivot.add(swapped);
      });
    }
    root.add(pivot);
  }
  return root;
}
