/**
 * Scene builder (issue #6): merge adapter buckets into one
 * BufferGeometry-per-material-slot mesh set, add hemi + directional
 * lighting with a PCFSoft 1024² shadow map (autoUpdate OFF — static
 * scene; refresh only on rebuild), fit the shadow frustum to the plan,
 * and hand back a disposable scene graph. Target ≤ ~25 draw calls for
 * the demo: one mesh per populated slot.
 *
 * Bucket positions arrive FLAT (no uv attribute) from the adapter, so
 * each slot's concatenated arrays become one indexed BufferGeometry
 * with synthetic per-position UVs computed here (world-meter scaling
 * so textures tile at physical size regardless of bucket composition).
 */

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  PCFSoftShadowMap,
  Scene,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';

import { buildMaterial } from './materials';
import type { AdaptedScene } from './types';

/** Shadow map resolution, squared texels. */
export const SHADOW_MAP_SIZE = 1024;

/** Padding added around the plan bounds for the shadow frustum, meters. */
const SHADOW_FRUSTUM_PAD = 1.5;

/** Sky/ground tones for the hemisphere fill. */
const SKY_COLOR = 0xdfeaff;
const GROUND_COLOR = 0xb8a888;

/** Warm-white sun tone. */
const SUN_COLOR = 0xfff4e0;

/** Page-background sky tone behind the model. */
export const SKY_BACKGROUND_HEX = '#bcd6ea';

/** One assembled, disposable viewer scene. */
export interface BuiltScene {
  scene: Scene;
  /** Lights live here so rebuilds can drop them with the group. */
  lightGroup: Group;
  /** One mesh per populated material slot (≤ ~25 draw calls). */
  meshes: Mesh[];
  /** Milliseconds spent assembling (rebuild-budget assertion seam). */
  buildMs: number;
}

/** Dispose a geometry/material tree recursively (dispose-chain leaf). */
export function disposeObject(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh & { material?: Material | Material[] };
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material;
    if (Array.isArray(mats)) {
      for (const m of mats) m.dispose();
    } else if (mats) {
      mats.dispose();
    }
  });
  if (root.parent) root.parent.remove(root);
}

/** World-meter UVs derived from flat xyz positions (u=x, v=y). */
function attachMeterUvs(geo: BufferGeometry): void {
  const posAttr = geo.getAttribute('position') as BufferAttribute;
  const count = posAttr.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    uvs[i * 2] = posAttr.getX(i);
    uvs[i * 2 + 1] = posAttr.getY(i);
  }
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
}

/** Build one BufferGeometry from a bucket's flat arrays. */
function bucketGeometry(
  positions: Float32Array,
  indices: Uint32Array,
): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setIndex(new BufferAttribute(indices, 1));
  attachMeterUvs(geo);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Fit an orthographic shadow camera snugly over the plan bounds. */
export function fitShadowFrustum(
  light: DirectionalLight,
  bounds: AdaptedScene['bounds'],
): void {
  const cam = light.shadow.camera as OrthographicCamera;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const halfExtent =
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 +
    SHADOW_FRUSTUM_PAD;

  // Sun hangs south-east-above, mildly tilted so wall faces catch
  // shading gradients instead of a flat ambient wash.
  light.position.set(centerX + 8, centerY - 8, 12);
  light.target.position.set(centerX, centerY, 0);
  light.target.updateMatrixWorld();

  cam.left = -halfExtent;
  cam.right = halfExtent;
  cam.top = halfExtent;
  cam.bottom = -halfExtent;
  cam.near = 0.5;
  cam.far = 60;
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0015;
  light.shadow.normalBias = 0.02;
}

/**
 * Configure the renderer once per session: DPR clamp, MSAA, HP GPU
 * preference, PCFSoft shadows with autoUpdate disabled (static scene —
 * shadowAtlas refresh happens only via renderer.shadowMap.needsUpdate).
 */
export function configureRenderer(renderer: WebGLRenderer): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(
    renderer.domElement.clientWidth || 800,
    renderer.domElement.clientHeight || 600,
    false,
  );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}

/** Paint the scene backdrop sky color. */
export function paintSky(scene: Scene): void {
  scene.background = new Color(SKY_BACKGROUND_HEX);
}

/**
 * Assemble the full static scene from an adapted scene. Every populated
 * slot becomes ONE merged mesh; lights ride in their own group so a
 * rebuild disposes geometry/materials/light targets atomically.
 */
export function buildViewerScene(adapted: AdaptedScene): BuiltScene {
  const tStart = performance.now();

  const scene = new Scene();
  const lightGroup = new Group();
  lightGroup.name = 'lights';
  scene.add(lightGroup);

  const hemi = new HemisphereLight(SKY_COLOR, GROUND_COLOR, 1.35);
  lightGroup.add(hemi);

  const sun = new DirectionalLight(SUN_COLOR, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  fitShadowFrustum(sun, adapted.bounds);
  lightGroup.add(sun);
  lightGroup.add(sun.target);

  // Tiny ambient lift so downward-facing ceilings aren't pitch black.
  const amb = new AmbientLight(0xffffff, 0.25);
  lightGroup.add(amb);

  const meshes: Mesh[] = [];

  for (const bucket of adapted.buckets) {
    const geo = bucketGeometry(bucket.positions, bucket.indices);
    const mat = buildMaterial(
      bucket.slot === 'wall' || bucket.slot === 'ceiling'
        ? bucket.slot
        : (bucket.slot as Parameters<typeof buildMaterial>[0]),
    );

    // Walls are seen from both sides (outer rim + inner face) and
    // merged fan windings vary per triangle; double-sided removes any
    // missing-face flicker for negligible cost at this poly count.
    mat.side = DoubleSide;

    const mesh = new Mesh(geo, mat);
    mesh.name = `slot-${bucket.slot}`;
    mesh.receiveShadow = true;
    mesh.castShadow = bucket.slot === 'wall';
    mesh.userData.slot = bucket.slot;
    scene.add(mesh);
    meshes.push(mesh);
  }

  paintSky(scene);

  return {
    scene,
    lightGroup,
    meshes,
    buildMs: performance.now() - tStart,
  };
}
