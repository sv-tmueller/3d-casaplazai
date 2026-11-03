/**
 * placeFurniture spec (issue #180): pivot origin, rotation, front
 * direction and footprint fit for every furniture type, using a fake
 * template (a box with a `front` marker on glTF +Z) so no GLB or browser
 * is needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Mesh as MeshT,
  type Object3D,
} from 'three';
import { describe, expect, it } from 'vitest';
import { compilePlan, parseValidatedPlan } from '../../src/geom';
import { migrate, type FurnitureType } from '../../src/shared/schema';
import {
  placeFurniture,
  type FurnitureLibrary,
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

/** Native fake size in metres: width (x) 1.0, height (y) 0.5, depth (z) 0.8. */
const NATIVE = { w: 1.0, h: 0.5, d: 0.8 };

/** glTF-oriented template: Y up, base at 0, centred on x/z, front +Z. */
function fakeTemplate(): Object3D {
  const root = new Group();
  const body = new Mesh(
    new BoxGeometry(NATIVE.w, NATIVE.h, NATIVE.d),
    new MeshBasicMaterial(),
  );
  body.position.y = NATIVE.h / 2;
  root.add(body);
  const front = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial());
  front.name = 'front';
  front.position.set(0, NATIVE.h / 2, NATIVE.d / 2 - 0.05);
  root.add(front);
  return root;
}

/** Library fake: everything already cached (templates are synchronous). */
function readyLibrary(): FurnitureLibrary {
  const cache = new Map<FurnitureType, Object3D>();
  const get = (t: FurnitureType): Object3D => {
    let tpl = cache.get(t);
    if (!tpl) {
      tpl = fakeTemplate();
      cache.set(t, tpl);
    }
    return tpl;
  };
  return {
    peek: (t) => get(t),
    load: (t) => Promise.resolve(get(t)),
    dispose: () => {},
  };
}

/** Library fake: nothing ever loads (box fallback only). */
const emptyLibrary: FurnitureLibrary = {
  peek: () => null,
  load: () => new Promise(() => {}),
  dispose: () => {},
};

function placement(over: Partial<FurniturePlacement> = {}): FurniturePlacement {
  return {
    itemId: 'f1',
    type: 'sofa',
    position: [3, 2],
    rotationDeg: 0,
    footprint: [2.0, 0.9],
    zMin: 0.1,
    zMax: 0.9,
    ...over,
  };
}

function place(
  ps: FurniturePlacement[],
  library: FurnitureLibrary = readyLibrary(),
): Group {
  const g = placeFurniture({ furniture: ps }, { library });
  g.updateMatrixWorld(true);
  return g;
}

function worldPos(o: Object3D): Vector3 {
  return o.getWorldPosition(new Vector3());
}

function findFront(root: Object3D): Object3D {
  const f = root.getObjectByName('front');
  if (!f) throw new Error('front marker missing');
  return f;
}

describe('placeFurniture — pivot and footprint fit (model)', () => {
  for (const type of TYPES) {
    it(`${type}: pivot at (x, y, zMin); shape spans the footprint, base at pivot`, () => {
      const p = placement({ type, footprint: [1.6, 0.7], zMin: 0.25, zMax: 1.0 });
      const g = place([p]);
      expect(g.children).toHaveLength(1);
      const pivot = g.children[0];
      expect(pivot.position.x).toBeCloseTo(3, 9);
      expect(pivot.position.y).toBeCloseTo(2, 9);
      expect(pivot.position.z).toBeCloseTo(0.25, 9);
      const box = new Box3().setFromObject(pivot);
      expect(box.min.x).toBeCloseTo(3 - 0.8, 6);
      expect(box.max.x).toBeCloseTo(3 + 0.8, 6);
      expect(box.min.y).toBeCloseTo(2 - 0.35, 6);
      expect(box.max.y).toBeCloseTo(2 + 0.35, 6);
      // Model keeps its own height (z scale 1), base on zMin.
      expect(box.min.z).toBeCloseTo(0.25, 6);
      expect(box.max.z).toBeCloseTo(0.25 + NATIVE.h, 6);
    });
  }

  it('scales x and y independently of the footprint, never the pivot', () => {
    const g = place([placement({ footprint: [2, 0.4] })]);
    const pivot = g.children[0];
    expect(pivot.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('yields one pivot per placement, named after the item id', () => {
    const g = place([placement({ itemId: 'a' }), placement({ itemId: 'b', type: 'bed' })]);
    expect(g.children.map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('an empty list yields an empty group', () => {
    expect(place([]).children).toHaveLength(0);
  });
});

describe('placeFurniture — forward axis is local -y', () => {
  const centre = new Vector3(3, 2, 0);
  const cases: [number, [number, number]][] = [
    [0, [0, -1]],
    [90, [1, 0]],
    [180, [0, 1]],
    [-90, [-1, 0]],
    [270, [-1, 0]],
    [450, [1, 0]],
  ];
  for (const [deg, [dx, dy]] of cases) {
    it(`rotationDeg ${deg}: front marker faces (${dx}, ${dy})`, () => {
      const g = place([placement({ rotationDeg: deg })]);
      const front = worldPos(findFront(g));
      const v = front.clone().sub(centre);
      const len = Math.hypot(v.x, v.y);
      expect(v.x / len).toBeCloseTo(dx, 6);
      expect(v.y / len).toBeCloseTo(dy, 6);
    });
  }

  it('model is not mirrored: marker height stays positive', () => {
    const g = place([placement({ zMin: 0.1 })]);
    expect(worldPos(findFront(g)).z).toBeCloseTo(0.1 + NATIVE.h / 2, 6);
  });

  it('rotated pieces keep the footprint fit (swapped extents at 90 degrees)', () => {
    const g = place([placement({ rotationDeg: 90, footprint: [2.0, 0.9] })]);
    const box = new Box3().setFromObject(g.children[0]);
    expect(box.max.x - box.min.x).toBeCloseTo(0.9, 6);
    expect(box.max.y - box.min.y).toBeCloseTo(2.0, 6);
  });
});

describe('placeFurniture — box fallback', () => {
  for (const type of TYPES) {
    it(`${type}: box spans footprint and zMin..zMax when no model is cached`, () => {
      const g = place(
        [placement({ type, footprint: [1.4, 0.6], zMin: 0.2, zMax: 0.95 })],
        emptyLibrary,
      );
      const box = new Box3().setFromObject(g.children[0]);
      expect(box.min.x).toBeCloseTo(3 - 0.7, 6);
      expect(box.max.x).toBeCloseTo(3 + 0.7, 6);
      expect(box.min.y).toBeCloseTo(2 - 0.3, 6);
      expect(box.max.y).toBeCloseTo(2 + 0.3, 6);
      expect(box.min.z).toBeCloseTo(0.2, 6);
      expect(box.max.z).toBeCloseTo(0.95, 6);
    });
  }

  it('boxes share one geometry and one material per type', () => {
    const g = place(
      [
        placement({ itemId: 'a', type: 'bed' }),
        placement({ itemId: 'b', type: 'bed' }),
        placement({ itemId: 'c', type: 'sofa' }),
      ],
      emptyLibrary,
    );
    const mesh = (i: number): MeshT => g.children[i].children[0] as MeshT;
    expect(mesh(0).geometry).toBe(mesh(1).geometry);
    expect(mesh(0).geometry).toBe(mesh(2).geometry);
    expect(mesh(0).material).toBe(mesh(1).material);
    expect(mesh(0).material).not.toBe(mesh(2).material);
  });

  it('uses the injected boxMaterial per type', () => {
    const mats = new Map<FurnitureType, MeshBasicMaterial>(
      TYPES.map((t) => [t, new MeshBasicMaterial()]),
    );
    const g = placeFurniture(
      { furniture: [placement({ type: 'chair' })] },
      { library: emptyLibrary, boxMaterial: (t) => mats.get(t)! },
    );
    expect((g.children[0].children[0] as MeshT).material).toBe(mats.get('chair'));
  });
});

describe('placeFurniture — matches the compiler boxes on the demo apartment', () => {
  const plan = parseValidatedPlan(
    migrate(
      JSON.parse(readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8')),
    ).data,
  );
  const compiled = compilePlan(plan);
  const items = new Map(plan.floors.flatMap((f) => f.furniture).map((i) => [i.id, i]));

  it('box world corners and z band equal each FurnitureVolume within 1e-6', () => {
    expect(compiled.furniture.length).toBeGreaterThan(0);
    const placements: FurniturePlacement[] = compiled.furniture.map((vol) => {
      const item = items.get(vol.itemId)!;
      return {
        itemId: vol.itemId,
        type: item.type,
        position: [item.position[0], item.position[1]],
        rotationDeg: item.rotationDeg,
        footprint: [item.footprint[0], item.footprint[1]],
        zMin: vol.zMin,
        zMax: vol.zMax,
      };
    });
    const g = place(placements, emptyLibrary);
    compiled.furniture.forEach((vol, i) => {
      const mesh = g.children[i].children[0] as MeshT;
      const pos = mesh.geometry.getAttribute('position');
      const world: Vector3[] = [];
      for (let k = 0; k < pos.count; k++) {
        world.push(new Vector3().fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld));
      }
      const box = new Box3().setFromObject(mesh);
      expect(box.min.z).toBeCloseTo(vol.zMin, 6);
      expect(box.max.z).toBeCloseTo(vol.zMax, 6);
      for (const [cx, cy] of vol.corners) {
        const hit = world.some(
          (v) =>
            Math.abs(v.x - cx) < 1e-6 &&
            Math.abs(v.y - cy) < 1e-6 &&
            Math.abs(v.z - vol.zMin) < 1e-6,
        );
        expect(hit, `corner ${cx},${cy} of ${vol.itemId}`).toBe(true);
      }
    });
  });
});

describe('placeFurniture — async model swap', () => {
  it('swaps the box for the model once load resolves', async () => {
    let resolve!: (o: Object3D | null) => void;
    const pending = new Promise<Object3D | null>((r) => (resolve = r));
    const lib: FurnitureLibrary = {
      peek: () => null,
      load: () => pending,
      dispose: () => {},
    };
    const g = place([placement()], lib);
    const pivot = g.children[0];
    const box = pivot.children[0];
    expect(box.type).toBe('Mesh');
    resolve(fakeTemplate());
    await pending;
    await Promise.resolve();
    expect(pivot.children).toHaveLength(1);
    expect(pivot.children[0]).not.toBe(box);
    pivot.updateMatrixWorld(true);
    expect(pivot.getObjectByName('front')).toBeTruthy();
    const b = new Box3().setFromObject(pivot);
    expect(b.max.x - b.min.x).toBeCloseTo(2.0, 6);
    expect(b.max.y - b.min.y).toBeCloseTo(0.9, 6);
  });
});
