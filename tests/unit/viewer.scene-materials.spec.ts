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
  Color,
  Mesh,
  type MeshStandardMaterial,
  SRGBColorSpace,
  Scene,
  Texture,
  type WebGLRenderer,
} from 'three';
import { clearAssetCaches, setTextureFetcher } from '../../src/viewer/assets/loader';
import { setFileUrls } from '../../src/viewer/assets/manifest';
import {
  applySunPose,
  buildViewerScene,
  configureRenderer,
  emptyAdaptedScene,
  ensureEnvironment,
  GROUND_SHADE_NOON,
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

const GLASS_QUAD = bucket(
  'glass',
  [0, 0, 0, 2, 0, 0, 2, 0, 2.7, 0, 0, 2.7],
  [0, 1, 2, 0, 2, 3],
);
const FRAME_QUAD = bucket(
  'windowFrame',
  [0, 0, 0, 2, 0, 0, 2, 0, 2.7, 0, 0, 2.7],
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

describe('LOW tier keeps the unsplit geometry (no maps, so no per-face UVs)', () => {
  it('shares the four corners of a vertical wall quad', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'low', true);
    expect(meshFor(built, 'wall').geometry.getAttribute('position').count).toBe(4);
  });

  it('keeps the averaged corner normals of a box instead of flat faces', () => {
    const box = bucket(
      'wall',
      [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
      [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4,
        7, 0, 7, 3,
      ],
    );
    const built = buildViewerScene(scene([box]), 'low', true);
    const geo = meshFor(built, 'wall').geometry;
    expect(geo.getAttribute('position').count).toBe(8);
    expect(geo.index!.count).toBe(36);
  });
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

  it('HIGH: grass-mapped, unlit (it covers a large share of the screen), with a contact-shadow overlay', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'high');
    const plot = built.scene.getObjectByName('ground-plot') as Mesh;
    expect((plot.material as { map?: unknown }).map).toBeTruthy();
    expect((plot.material as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial).toBe(true);
    expect(built.scene.getObjectByName('ground-contact')).toBeDefined();
  });

  it('HIGH: requests only the grass colour file, no normal or roughness map', () => {
    const requested: string[] = [];
    setTextureFetcher((url) => {
      requested.push(url);
      return Promise.resolve(new Texture());
    });
    buildViewerScene(emptyAdaptedScene(), 'high');
    expect(requested).toEqual([setFileUrls('grass').color]);
  });

  it('LOW: no plot and no contact overlay (a full-screen fill the flat tier does not pay)', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'low', true);
    expect(built.scene.getObjectByName('ground-plot')).toBeUndefined();
    expect(built.scene.getObjectByName('ground-contact')).toBeUndefined();
  });

  it('HIGH: dims toward night with the sun and restores at noon', () => {
    const built = buildViewerScene(scene([WALL_QUAD]), 'high');
    const mat = (built.scene.getObjectByName('ground-plot') as Mesh).material as unknown as {
      color: Color;
    };
    const noon = mat.color.getHex();
    expect(mat.color.r).toBeCloseTo(GROUND_SHADE_NOON, 6);
    applySunPose(built.lights, { timeHours: 22, northOffsetDeg: 0 }, BOUNDS);
    expect(mat.color.r).toBeLessThan(GROUND_SHADE_NOON);
    expect(mat.color.r).toBeGreaterThan(0);
    applySunPose(built.lights, { timeHours: 12, northOffsetDeg: 0 }, BOUNDS);
    expect(mat.color.getHex()).toBe(noon);
  });

  it('the empty-plan scene carries the plot too', () => {
    const built = buildViewerScene(emptyAdaptedScene());
    expect(built.scene.getObjectByName('ground-plot')).toBeDefined();
    expect(built.meshes).toHaveLength(0);
  });
});

describe('contact overlay follows the building footprint (review round 1, finding 2)', () => {
  /** Alpha (0..255) of the contact overlay at plan point (x, y). */
  function overlayAlpha(built: ReturnType<typeof buildViewerScene>, bounds: AdaptedScene['bounds'], x: number, y: number): number {
    const mesh = built.scene.getObjectByName('ground-contact') as Mesh;
    const map = (mesh.material as unknown as { map: { image: { data: Uint8Array; width: number } } }).map;
    const n = map.image.width;
    const x0 = bounds.minX - SHADOW_FRUSTUM_PAD_M;
    const y0 = bounds.minY - SHADOW_FRUSTUM_PAD_M;
    const span = (bounds.maxX - bounds.minX) + 2 * SHADOW_FRUSTUM_PAD_M;
    const spanY = (bounds.maxY - bounds.minY) + 2 * SHADOW_FRUSTUM_PAD_M;
    const i = Math.min(n - 1, Math.floor(((x - x0) / span) * n));
    const j = Math.min(n - 1, Math.floor(((y - y0) / spanY) * n));
    return map.image.data[(j * n + i) * 4 + 3];
  }

  const LBOUNDS = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  // L-shaped footprint: the 10 x 10 box minus its upper-right 6 x 6 notch.
  const L_BOTTOM = bucket('wood', [0, 0, 0, 10, 0, 0, 10, 4, 0, 0, 4, 0], [0, 1, 2, 0, 2, 3]);
  const L_LEFT = bucket('wood', [0, 4, 0, 4, 4, 0, 4, 10, 0, 0, 10, 0], [0, 1, 2, 0, 2, 3]);

  function lScene(): AdaptedScene {
    return { ...emptyAdaptedScene(), buckets: [L_BOTTOM, L_LEFT, WALL_QUAD], bounds: LBOUNDS };
  }

  it('builds no overlay when there are no buckets (the empty-plan plot)', () => {
    const built = buildViewerScene(emptyAdaptedScene(), 'high');
    expect(built.scene.getObjectByName('ground-plot')).toBeDefined();
    expect(built.scene.getObjectByName('ground-contact')).toBeUndefined();
  });

  it('is clear in a bounding-box notch the building does not cover', () => {
    const built = buildViewerScene(lScene(), 'high');
    // (8, 8) is 4 m from the footprint, beyond the 1.5 m pad, yet inside the plan bounding box.
    expect(overlayAlpha(built, LBOUNDS, 8, 8)).toBe(0);
    // Far outside the box stays clear too.
    expect(overlayAlpha(built, LBOUNDS, 11.4, 11.4)).toBe(0);
  });

  it('still darkens under the building and just outside its edge', () => {
    const built = buildViewerScene(lScene(), 'high');
    expect(overlayAlpha(built, LBOUNDS, 2, 2)).toBeGreaterThan(100);
    // 0.2 m off the notch edge (x = 4): close to the peak, fading with distance.
    const near = overlayAlpha(built, LBOUNDS, 4.2, 7);
    const far = overlayAlpha(built, LBOUNDS, 5.2, 7);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
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

  it('reaches the glass and frames of a scene built BEFORE the renderer was configured', () => {
    const built = buildViewerScene(scene([GLASS_QUAD, FRAME_QUAD, WALL_QUAD]), 'high');
    const mats = [GLASS_QUAD, FRAME_QUAD].map(
      (b) => meshFor(built, b.slot).material as MeshStandardMaterial,
    );
    for (const m of mats) expect(m.envMap).toBeNull();

    const env = new Texture();
    ensureEnvironment(fakeRenderer(), () => env);
    renderTick(built.scene);
    for (const m of mats) expect(m.envMap).toBe(env);
  });

  it('turns the environment Y-up to the viewer Z-up', () => {
    const built = buildViewerScene(scene([GLASS_QUAD]), 'high');
    const glass = meshFor(built, 'glass').material as MeshStandardMaterial;
    expect(glass.envMapRotation.x).toBeCloseTo(Math.PI / 2, 6);
  });

  it('keeps floors, furniture and the matte slots out of the environment lookup', () => {
    // The lookup is the costliest PBR term on software GL and these slots
    // cover most of the screen; #179 fix round 1 measured it at ~15 ms.
    const quad = (slot: MaterialSlotId): MaterialBucket =>
      bucket(slot, [0, 0, 0, 2, 0, 0, 2, 0, 2.7, 0, 0, 2.7], [0, 1, 2, 0, 2, 3]);
    const slots: MaterialSlotId[] = [
      'wall', 'ceiling', 'roof', 'carpet', 'wood', 'tile', 'concrete',
      'furn-wood', 'furn-porcelain', 'furn-laminate', 'furn-fabric',
    ];
    const built = buildViewerScene(scene(slots.map(quad)), 'high');
    ensureEnvironment(fakeRenderer(), () => new Texture());
    renderTick(built.scene);
    for (const slot of slots) {
      expect((meshFor(built, slot).material as MeshStandardMaterial).envMap, slot).toBeNull();
    }
  });

  it('LOW scenes never pick the environment up', () => {
    const built = buildViewerScene(scene([GLASS_QUAD]), 'low', true);
    ensureEnvironment(fakeRenderer(), () => new Texture());
    renderTick(built.scene);
    expect((meshFor(built, 'glass').material as MeshStandardMaterial).envMap).toBeNull();
  });

  it('applySunPose dims the environment toward night', () => {
    const built = buildViewerScene(scene([GLASS_QUAD]), 'high');
    const glass = meshFor(built, 'glass').material as MeshStandardMaterial;
    const noon = glass.envMapIntensity;
    applySunPose(built.lights, { timeHours: 22, northOffsetDeg: 0 }, BOUNDS);
    const night = glass.envMapIntensity;
    expect(night).toBeLessThan(noon);
    expect(night).toBeGreaterThan(0);
    applySunPose(built.lights, { timeHours: 12, northOffsetDeg: 0 }, BOUNDS);
    expect(glass.envMapIntensity).toBeCloseTo(noon, 6);
  });
});
