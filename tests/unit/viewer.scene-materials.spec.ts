// @vitest-environment happy-dom
/**
 * Scene-builder spec for the materials and lighting package (issue #179):
 * per-face UV projection on the architectural slots, the bounded ground
 * plot, tone mapping, and the room environment wiring.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  Mesh,
  SRGBColorSpace,
  Scene,
  Texture,
  type WebGLRenderer,
} from 'three';
import { clearAssetCaches, setTextureFetcher } from '../../src/viewer/assets/loader';
import {
  applySunPose,
  buildViewerScene,
  configureRenderer,
  emptyAdaptedScene,
  ensureEnvironment,
  TONE_MAPPING_EXPOSURE,
} from '../../src/viewer/sceneBuilder';
import { SHADOW_FRUSTUM_PAD_M } from '../../src/viewer/renderConstants';
import type { AdaptedScene, MaterialBucket } from '../../src/viewer/types';
import type { MaterialSlotId } from '../../src/viewer/types';

const BOUNDS = { minX: 0, minY: 0, maxX: 6, maxY: 4 };

function scene(buckets: MaterialBucket[], elevation = 0): AdaptedScene {
  return { ...emptyAdaptedScene(), buckets, bounds: BOUNDS, activeFloorElevation: elevation };
}

function bucket(
  slot: MaterialSlotId,
  positions: number[],
  indices: number[],
): MaterialBucket {
  return {
    slot,
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

/** Vertical quad in the x-z plane at y=0, 2 m wide, 2.7 m tall. */
const WALL_QUAD = bucket(
  'wall',
  [0, 0, 0, 2, 0, 0, 2, 0, 2.7, 0, 0, 2.7],
  [0, 1, 2, 0, 2, 3],
);

/** Horizontal quad on the floor, 3 x 2 m, offset from the origin. */
const FLOOR_QUAD = bucket(
  'wood',
  [1, 2, 0, 4, 2, 0, 4, 4, 0, 1, 4, 0],
  [0, 1, 2, 0, 2, 3],
);

/** Pitched quad rising 2 m over a 3 m run (slope length sqrt(13)). */
const ROOF_QUAD = bucket(
  'roof',
  [0, 0, 3, 4, 0, 3, 4, 3, 5, 0, 3, 5],
  [0, 1, 2, 0, 2, 3],
);

function meshFor(built: ReturnType<typeof buildViewerScene>, slot: string): Mesh {
  const mesh = built.meshes.find((m) => m.userData.slot === slot);
  if (!mesh) throw new Error(`no mesh for ${slot}`);
  return mesh;
}

function uvOf(mesh: Mesh, i: number): [number, number] {
  const uv = mesh.geometry.getAttribute('uv') as BufferAttribute;
  return [uv.getX(i), uv.getY(i)];
}

beforeEach(() => {
  clearAssetCaches();
  setTextureFetcher(() => Promise.resolve(new Texture()));
});
afterEach(() => {
  setTextureFetcher(null);
  clearAssetCaches();
});

describe('per-face UV projection (architectural slots)', () => {
  it('maps a vertical wall face as u along the wall, v along z in meters', () => {
    const built = buildViewerScene(scene([WALL_QUAD]));
    const mesh = meshFor(built, 'wall');
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const [u, v] = uvOf(mesh, i);
      expect(u).toBeCloseTo(pos.getX(i), 5);
      expect(v).toBeCloseTo(pos.getZ(i), 5);
    }
  });

  it('keeps both triangles of a wall quad on one continuous mapping', () => {
    const built = buildViewerScene(scene([WALL_QUAD]));
    const mesh = meshFor(built, 'wall');
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    const byCorner = new Map<string, Set<string>>();
    for (let i = 0; i < pos.count; i += 1) {
      const key = `${pos.getX(i)},${pos.getZ(i)}`;
      const [u, v] = uvOf(mesh, i);
      const set = byCorner.get(key) ?? new Set<string>();
      set.add(`${u.toFixed(5)},${v.toFixed(5)}`);
      byCorner.set(key, set);
    }
    for (const set of byCorner.values()) expect(set.size).toBe(1);
  });

  it('wall UVs vary with z (no one-dimensional smear)', () => {
    const built = buildViewerScene(scene([WALL_QUAD]));
    const mesh = meshFor(built, 'wall');
    const vs: number[] = [];
    for (let i = 0; i < mesh.geometry.getAttribute('position').count; i += 1) {
      vs.push(uvOf(mesh, i)[1]);
    }
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2.7, 5);
  });

  it('preserves index.count when splitting shared vertices', () => {
    const built = buildViewerScene(scene([WALL_QUAD]));
    const mesh = meshFor(built, 'wall');
    expect(mesh.geometry.index!.count).toBe(6);
    // Per-face vertices: three per triangle.
    expect(mesh.geometry.getAttribute('position').count).toBe(6);
    const idx = Array.from(mesh.geometry.index!.array);
    expect(idx).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('gives faces their own flat normals instead of averaging across corners', () => {
    // A unit box with eight shared corners and twelve triangles.
    const box = bucket(
      'wall',
      [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
      [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4,
        7, 0, 7, 3,
      ],
    );
    const built = buildViewerScene(scene([box]));
    const normals = meshFor(built, 'wall').geometry.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < normals.count; i += 1) {
      const comps = [normals.getX(i), normals.getY(i), normals.getZ(i)].map(Math.abs);
      expect(Math.max(...comps)).toBeCloseTo(1, 5);
    }
  });

  it('measures a pitched roof along the slope, not the plan', () => {
    const built = buildViewerScene(scene([ROOF_QUAD]));
    const mesh = meshFor(built, 'roof');
    const vs: number[] = [];
    for (let i = 0; i < mesh.geometry.getAttribute('position').count; i += 1) {
      vs.push(uvOf(mesh, i)[1]);
    }
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(Math.hypot(3, 2), 4);
  });

  it('leaves horizontal floors at u=x, v=y with shared vertices intact', () => {
    const built = buildViewerScene(scene([FLOOR_QUAD]));
    const mesh = meshFor(built, 'wood');
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    expect(pos.count).toBe(4);
    for (let i = 0; i < pos.count; i += 1) {
      const [u, v] = uvOf(mesh, i);
      expect(u).toBeCloseTo(pos.getX(i), 6);
      expect(v).toBeCloseTo(pos.getY(i), 6);
    }
  });

  it.each<MaterialSlotId>(['furn-wood', 'furn-fabric', 'glass', 'windowFrame'])(
    'never re-vertexes %s',
    (slot) => {
      const built = buildViewerScene(scene([bucket(slot, [0, 0, 0, 2, 0, 0, 2, 0, 2.7, 0, 0, 2.7], [0, 1, 2, 0, 2, 3])]));
      const mesh = meshFor(built, slot);
      expect(mesh.geometry.getAttribute('position').count).toBe(4);
      const [u, v] = uvOf(mesh, 2);
      expect(u).toBeCloseTo(2, 6);
      expect(v).toBeCloseTo(0, 6);
    },
  );
});

describe('ground plot', () => {
  it('is a separate mesh outside meshes with no slot identity', () => {
    const built = buildViewerScene(scene([WALL_QUAD]));
    const plot = built.scene.getObjectByName('ground-plot') as Mesh;
    expect(plot).toBeDefined();
    expect(built.meshes).not.toContain(plot);
    expect(plot.userData.slot).toBeUndefined();
  });

  it('spans the plan bounds plus the shadow-frustum pad and sits just below the floor', () => {
    const built = buildViewerScene(scene([WALL_QUAD], 2.8));
    const plot = built.scene.getObjectByName('ground-plot') as Mesh;
    plot.geometry.computeBoundingBox();
    const box = plot.geometry.boundingBox!;
    // The plot is built in world coordinates, so its UVs are meters.
    expect(box.min.x).toBeCloseTo(0 - SHADOW_FRUSTUM_PAD_M, 5);
    expect(box.max.x).toBeCloseTo(6 + SHADOW_FRUSTUM_PAD_M, 5);
    expect(box.min.y).toBeCloseTo(0 - SHADOW_FRUSTUM_PAD_M, 5);
    expect(box.max.y).toBeCloseTo(4 + SHADOW_FRUSTUM_PAD_M, 5);
    expect(box.min.z).toBeLessThan(2.8);
    expect(box.min.z).toBeGreaterThan(2.7);
  });

  it('HIGH: grass-mapped, shadow-receiving, with a contact-shadow overlay', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'high');
    const plot = built.scene.getObjectByName('ground-plot') as Mesh;
    expect((plot.material as { map?: unknown }).map).toBeTruthy();
    expect(plot.receiveShadow).toBe(true);
    expect(built.scene.getObjectByName('ground-contact')).toBeDefined();
  });

  it('LOW: flat colour with no map of any kind and no contact overlay', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'low', true);
    const plot = built.scene.getObjectByName('ground-plot') as Mesh;
    const mat = plot.material as {
      map?: unknown;
      normalMap?: unknown;
      roughnessMap?: unknown;
      aoMap?: unknown;
    };
    expect(mat.map).toBeFalsy();
    expect(mat.normalMap).toBeFalsy();
    expect(mat.roughnessMap).toBeFalsy();
    expect(mat.aoMap).toBeFalsy();
    expect(built.scene.getObjectByName('ground-contact')).toBeUndefined();
  });

  it('the empty-plan scene carries the plot too', () => {
    const built = buildViewerScene(emptyAdaptedScene());
    expect(built.scene.getObjectByName('ground-plot')).toBeDefined();
    expect(built.meshes).toHaveLength(0);
  });
});

describe('forced-low materials issue no texture requests', () => {
  it('buildViewerScene(…, forceLowMaterials) never reaches the fetcher', () => {
    let calls = 0;
    setTextureFetcher(() => {
      calls += 1;
      return Promise.resolve(new Texture());
    });
    const built = buildViewerScene(scene([WALL_QUAD, FLOOR_QUAD]), 'high', true);
    for (const mesh of built.meshes) {
      expect((mesh.material as { map?: unknown }).map).toBeFalsy();
    }
    expect(calls).toBe(0);
  });
});

/** Fire the scene's pre-render hook the way renderer.render() does. */
function renderTick(target: Scene): void {
  (target.onBeforeRender as unknown as () => void)();
}

/** The slice of WebGLRenderer configureRenderer touches. */
function fakeRenderer(): WebGLRenderer {
  return {
    domElement: { clientWidth: 800, clientHeight: 600 },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    shadowMap: {},
  } as unknown as WebGLRenderer;
}

describe('configureRenderer — tone mapping and environment', () => {
  it('turns on ACES filmic tone mapping with sRGB output on both tiers', () => {
    for (const quality of ['high', 'low'] as const) {
      const r = fakeRenderer();
      configureRenderer(r, quality);
      expect(r.toneMapping).toBe(ACESFilmicToneMapping);
      expect(r.toneMappingExposure).toBe(TONE_MAPPING_EXPOSURE);
      expect(r.outputColorSpace).toBe(SRGBColorSpace);
    }
  });

  it('survives a renderer without a GL context (PMREM step is guarded)', () => {
    const r = fakeRenderer();
    expect(() => configureRenderer(r, 'high')).not.toThrow();
  });
});

describe('room environment', () => {
  it('is built once per renderer and reused', () => {
    const r = fakeRenderer();
    let builds = 0;
    const make = (): Texture => {
      builds += 1;
      return new Texture();
    };
    const first = ensureEnvironment(r, make);
    const second = ensureEnvironment(r, make);
    expect(first).toBe(second);
    expect(builds).toBe(1);
  });

  it('is attached to a scene built BEFORE the renderer was configured', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'high');
    expect(built.scene.environment).toBeNull();

    const env = new Texture();
    ensureEnvironment(fakeRenderer(), () => env);
    renderTick(built.scene);
    expect(built.scene.environment).toBe(env);
  });

  it('LOW scenes never pick the environment up', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'low');
    ensureEnvironment(fakeRenderer(), () => new Texture());
    renderTick(built.scene);
    expect(built.scene.environment).toBeNull();
  });

  it('applySunPose dims the environment toward night', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'high');
    const noon = built.scene.environmentIntensity;
    applySunPose(built.lights, { timeHours: 22, northOffsetDeg: 0 }, BOUNDS);
    const night = built.scene.environmentIntensity;
    expect(night).toBeLessThan(noon);
    expect(night).toBeGreaterThan(0);
    applySunPose(built.lights, { timeHours: 12, northOffsetDeg: 0 }, BOUNDS);
    expect(built.scene.environmentIntensity).toBeCloseTo(noon, 6);
  });
});
