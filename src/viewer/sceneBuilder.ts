/**
 * Scene builder (issue #6): merge adapter buckets into one
 * BufferGeometry-per-material-slot mesh set, add hemi + directional
 * lighting with a PCFSoft 1024² shadow map (autoUpdate OFF — static
 * scene; refresh only on rebuild), fit the shadow frustum to the plan,
 * and hand back a disposable scene graph. Target ≤ ~25 draw calls for
 * the demo: one mesh per populated slot.
 *
 * Pkg 9.1 (issue #86) retrofit: every tunable moved to
 * ./renderConstants.ts, and the sky gained a gradient dome (high
 * quality) over the former solid backdrop. LOW quality disables
 * shadows + the dome. The material-bucket loop below is intentionally
 * UNTOUCHED territory (owned by the parallel materials package).
 *
 * Bucket positions arrive FLAT (no uv attribute) from the adapter, so
 * each slot's concatenated arrays become one indexed BufferGeometry
 * with synthetic per-position UVs computed here (world-meter scaling
 * so textures tile at physical size regardless of bucket composition).
 */

import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  PCFSoftShadowMap,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';

import { buildMaterial } from './materials';
import { isHighQuality } from './quality';
import {
  AMBIENT_COLOR,
  AMBIENT_INTENSITY,
  HEMI_GROUND_COLOR,
  HEMI_INTENSITY,
  HEMI_SKY_COLOR,
  SHADOW_BIAS,
  SHADOW_CAMERA_FAR_M,
  SHADOW_CAMERA_NEAR_M,
  SHADOW_FRUSTUM_PAD_M,
  SHADOW_MAP_SIZE,
  SHADOW_NORMAL_BIAS,
  SKY_DOME_RADIUS_M,
  SKY_DOME_SEGMENTS,
  SKY_GRADIENT_BOTTOM_HEX,
  SKY_GRADIENT_BOTTOM_Z,
  SKY_GRADIENT_TOP_HEX,
  SKY_GRADIENT_TOP_Z,
  SKY_SOLID_HEX,
  SUN_COLOR,
  SUN_INTENSITY,
  type QualityLevel,
} from './renderConstants';
import type { AdaptedScene } from './types';

/** One assembled, disposable viewer scene. */
export interface BuiltScene {
  scene: Scene;
  /** Lights live here so rebuilds can drop them with the group. */
  lightGroup: Group;
  /** One mesh per populated material slot (≤ ~25 draw calls). */
  meshes: Mesh[];
  /**
   * Sky-gradient dome (issue #86), or null on LOW quality (the solid
   * scene.background takes over). Kept separate from `meshes` so slot
   * counting/stats never see it; disposed with the scene graph.
   */
  skyDome: Mesh<SphereGeometry, ShaderMaterial> | null;
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
    SHADOW_FRUSTUM_PAD_M;

  // Sun hangs south-east-above, mildly tilted so wall faces catch
  // shading gradients instead of a flat ambient wash.
  light.position.set(centerX + 8, centerY - 8, 12);
  light.target.position.set(centerX, centerY, 0);
  light.target.updateMatrixWorld();

  cam.left = -halfExtent;
  cam.right = halfExtent;
  cam.top = halfExtent;
  cam.bottom = -halfExtent;
  cam.near = SHADOW_CAMERA_NEAR_M;
  cam.far = SHADOW_CAMERA_FAR_M;
  cam.updateProjectionMatrix();
  light.shadow.bias = SHADOW_BIAS;
  light.shadow.normalBias = SHADOW_NORMAL_BIAS;
}

/**
 * Configure the renderer once per session: DPR clamp, MSAA, HP GPU
 * preference, PCFSoft shadows with autoUpdate disabled (static scene —
 * shadowAtlas refresh happens only via renderer.shadowMap.needsUpdate).
 * LOW quality (issue #86) turns shadow mapping OFF entirely — the
 * biggest single perf lever for integrated GPUs.
 */
export function configureRenderer(
  renderer: WebGLRenderer,
  quality: QualityLevel = 'high',
): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(
    renderer.domElement.clientWidth || 800,
    renderer.domElement.clientHeight || 600,
    false,
  );
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}

/**
 * Paint the SOLID scene backdrop (LOW-quality sky + the pre-9.1 look).
 * HIGH quality also mounts the gradient dome via buildSkyDome, which
 * renders in front of this anyway.
 */
export function paintSky(scene: Scene): void {
  scene.background = new Color(SKY_SOLID_HEX);
}

/**
 * Build the sky-gradient dome (issue #86): a huge inward-facing sphere
 * mixing horizon→zenith tones by world z. Vertex-stage mixing (no
 * per-fragment work), depth-write off, rendered first by renderOrder -
 * 1. Fog tone deliberately unused — the scene has no fog; the horizon
 * stop is colour-matched to the sun haze instead.
 */
export function buildSkyDome(): Mesh<
  SphereGeometry,
  ShaderMaterial
> {
  const vert = `
varying float vWorldZ;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldZ = worldPos.z;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;
  const frag = `
uniform vec3 uBottomColor;
uniform vec3 uTopColor;
uniform float uBottomZ;
uniform float uTopZ;
varying float vWorldZ;
void main() {
  // Outside the band: clamp (below = horizon haze, above = zenith).
  float t = clamp((vWorldZ - uBottomZ) / (uTopZ - uBottomZ), 0.0, 1.0);
  gl_FragColor = vec4(mix(uBottomColor, uTopColor, t), 1.0);
}`;

  const geo = new SphereGeometry(SKY_DOME_RADIUS_M, SKY_DOME_SEGMENTS, SKY_DOME_SEGMENTS / 2);
  const mat = new ShaderMaterial({
    uniforms: {
      uBottomColor: { value: new Color(SKY_GRADIENT_BOTTOM_HEX) },
      uTopColor: { value: new Color(SKY_GRADIENT_TOP_HEX) },
      uBottomZ: { value: SKY_GRADIENT_BOTTOM_Z },
      uTopZ: { value: SKY_GRADIENT_TOP_Z },
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: BackSide,
    depthWrite: false,
  });

  const dome = new Mesh(geo, mat);
  dome.name = 'sky-dome';
  dome.frustumCulled = false; // encloses the camera; never cull it
  dome.renderOrder = -1; // painted before every opaque slot mesh
  return dome;
}

/**
 * Assemble the full static scene from an adapted scene. Every populated
 * slot becomes ONE merged mesh; lights ride in their own group so a
 * rebuild disposes geometry/materials/light targets atomically.
 *
 * Pkg 13.1 (issue #109) ADDITIVE param: `forceLowMaterials` overrides
 * the URL-derived material tier DOWN to LOW (flattened colors) without
 * touching the caller's quality level — the editor's mini-3D inset pays
 * texture-setup costs neither in CPU nor VRAM. Absent/default false ⇒
 * the viewer's behavior is BYTE-IDENTICAL (tier still isHighQuality()).
 */
export function buildViewerScene(
  adapted: AdaptedScene,
  quality: QualityLevel = 'high',
  forceLowMaterials = false,
): BuiltScene {
  const tStart = performance.now();

  const scene = new Scene();
  const lightGroup = new Group();
  lightGroup.name = 'lights';
  scene.add(lightGroup);

  const hemi = new HemisphereLight(
    HEMI_SKY_COLOR,
    HEMI_GROUND_COLOR,
    HEMI_INTENSITY,
  );
  lightGroup.add(hemi);

  const sun = new DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  // Shadows are the HIGH-quality luxury (issue #86): the sun itself
  // stays (diffuse shading is nearly free) but its shadow casting is
  // gated so LOW skips the 1024² depth pass entirely.
  sun.castShadow = quality === 'high';
  if (sun.castShadow) {
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    fitShadowFrustum(sun, adapted.bounds);
  }
  lightGroup.add(sun);
  lightGroup.add(sun.target);

  // Tiny ambient lift so downward-facing ceilings aren't pitch black.
  const amb = new AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY);
  lightGroup.add(amb);

  const meshes: Mesh[] = [];

  // Quality knob (#87): read ONCE per build — every bucket shares the
  // same tier so a scene never mixes textured and flattened slots.
  // #109: the inset's force-low override wins over the URL tier.
  const hiQuality = forceLowMaterials ? false : isHighQuality();

  for (const bucket of adapted.buckets) {
    const geo = bucketGeometry(bucket.positions, bucket.indices);
    const mat = buildMaterial(
      bucket.slot === 'wall' || bucket.slot === 'ceiling'
        ? bucket.slot
        : (bucket.slot as Parameters<typeof buildMaterial>[0]),
      hiQuality,
    );

    // Walls are seen from both sides (outer rim + inner face) and
    // merged fan windings vary per triangle; double-sided removes any
    // missing-face flicker for negligible cost at this poly count.
    mat.side = DoubleSide;

    const mesh = new Mesh(geo, mat);
    mesh.name = `slot-${bucket.slot}`;
    mesh.receiveShadow = quality === 'high';
    mesh.castShadow =
      quality === 'high' &&
      (bucket.slot === 'wall' || bucket.slot.startsWith('furn-'));
    mesh.userData.slot = bucket.slot;
    scene.add(mesh);
    meshes.push(mesh);
  }

  paintSky(scene);
  const skyDome = quality === 'high' ? buildSkyDome() : null;
  if (skyDome) scene.add(skyDome);

  return {
    scene,
    lightGroup,
    meshes,
    skyDome,
    buildMs: performance.now() - tStart,
  };
}
