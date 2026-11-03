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
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PMREMGenerator,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  WebGLRenderer,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { buildGroundMaterial, buildMaterial } from './materials';
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
  SKY_DUSK_BOTTOM_HEX,
  SKY_DUSK_TOP_HEX,
  SKY_GRADIENT_BOTTOM_HEX,
  SKY_GRADIENT_BOTTOM_Z,
  SKY_GRADIENT_TOP_HEX,
  SKY_GRADIENT_TOP_Z,
  SKY_SOLID_HEX,
  SUN_COLOR,
  SUN_DUSK_COLOR_HEX,
  SUN_INTENSITY,
  SUN_NIGHT_INTENSITY_FLOOR,
  type QualityLevel,
} from './renderConstants';
import { DEFAULT_SUN_SETTINGS, sunState, type SunState } from './sun';
import type { AdaptedScene, MaterialBucket, SunSettings } from './types';

/** The light trio every built scene carries (issue #121 controller seam). */
export interface ViewerLights {
  sun: DirectionalLight;
  hemi: HemisphereLight;
  amb: AmbientLight;
}

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
  /**
   * The live light trio (issue #121): sun-settings changes repaint
   * these in place via applySunPose — no scene-graph traversal.
   */
  lights: ViewerLights;
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

/**
 * Slots whose geometry is split per face and projected per face (#179).
 * Furniture is excluded (its vertex count is read as volumes * 8 by the
 * stats probe), as are glass and window frames (flat colour, no maps).
 */
const PROJECTED_SLOTS: ReadonlySet<string> = new Set([
  'wall',
  'ceiling',
  'roof',
  'wood',
  'tile',
  'carpet',
  'concrete',
]);

/** |n.z| at or above which a face counts as horizontal (u=x, v=y, as for floors). */
const HORIZONTAL_NZ = 0.999;

/**
 * Per-face UV projection (issue #179). Horizontal faces keep u=x, v=y,
 * identical to the floor mapping before this change. Every other face
 * takes u along its horizontal tangent (up x normal) and v along its
 * up direction: z on a vertical wall, the slope on a pitched roof, so
 * one texture repeat spans the asset's real size and the pattern never
 * smears into a one-dimensional stripe. The tangent follows the
 * winding normal, so the two triangles of a quad share one mapping and
 * (tangent x up) points along the face normal, which keeps normal-map
 * relief from flipping.
 *
 * Wall slabs are eight-corner prisms whose shared vertices would blend
 * normals across corners, so a mesh with any non-horizontal face is
 * split to three vertices per triangle (flat normals) behind a
 * sequential index. The index count never changes: the roof and glass
 * triangle probes read it. Returns null when every face is horizontal
 * and the shared-vertex geometry can stay as it is.
 */
function projectFaceUvs(
  positions: Float32Array,
  indices: Uint32Array,
): { positions: Float32Array; indices: Uint32Array; uvs: Float32Array } | null {
  const triCount = Math.floor(indices.length / 3);
  const outPos = new Float32Array(triCount * 9);
  const outUv = new Float32Array(triCount * 6);
  let anyTilted = false;

  for (let t = 0; t < triCount; t += 1) {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];

    // Winding normal (unnormalised).
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = cx - ax, fy = cy - ay, fz = cz - az;
    let nx = ey * fz - ez * fy;
    let ny = ez * fx - ex * fz;
    let nz = ex * fy - ey * fx;
    const len = Math.hypot(nx, ny, nz);
    const horizontal = len === 0 || Math.abs(nz) / len >= HORIZONTAL_NZ;

    // Tangent T = z x n, up V = n x T (so T x V = n).
    let tx = 0, ty = 0, tz = 0, vx = 0, vy = 0, vz = 1;
    if (!horizontal) {
      anyTilted = true;
      nx /= len; ny /= len; nz /= len;
      const tl = Math.hypot(nx, ny);
      tx = -ny / tl; ty = nx / tl; tz = 0;
      vx = ny * tz - nz * ty;
      vy = nz * tx - nx * tz;
      vz = nx * ty - ny * tx;
    }

    const base = t * 9;
    const uvBase = t * 6;
    const corners = [
      [ax, ay, az],
      [bx, by, bz],
      [cx, cy, cz],
    ];
    for (let k = 0; k < 3; k += 1) {
      const [px, py, pz] = corners[k];
      outPos[base + k * 3] = px;
      outPos[base + k * 3 + 1] = py;
      outPos[base + k * 3 + 2] = pz;
      if (horizontal) {
        outUv[uvBase + k * 2] = px;
        outUv[uvBase + k * 2 + 1] = py;
      } else {
        outUv[uvBase + k * 2] = px * tx + py * ty + pz * tz;
        outUv[uvBase + k * 2 + 1] = px * vx + py * vy + pz * vz;
      }
    }
  }
  if (!anyTilted) return null;

  const seq = new Uint32Array(triCount * 3);
  for (let i = 0; i < seq.length; i += 1) seq[i] = i;
  return { positions: outPos, indices: seq, uvs: outUv };
}

/**
 * Build one BufferGeometry from a bucket's flat arrays. The per-face
 * metre projection (which splits shared vertices) is only for textured
 * (HIGH) materials; flat LOW keeps the shared vertices and averaged
 * normals of the plain merge, at its old cost and look.
 */
function bucketGeometry(
  slot: string,
  positions: Float32Array,
  indices: Uint32Array,
  textured: boolean,
): BufferGeometry {
  const geo = new BufferGeometry();
  const projected =
    textured && PROJECTED_SLOTS.has(slot) ? projectFaceUvs(positions, indices) : null;
  if (projected) {
    geo.setAttribute('position', new BufferAttribute(projected.positions, 3));
    geo.setIndex(new BufferAttribute(projected.indices, 1));
    geo.setAttribute('uv', new BufferAttribute(projected.uvs, 2));
  } else {
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex(new BufferAttribute(indices, 1));
    attachMeterUvs(geo);
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Fit an orthographic shadow camera snugly over the plan bounds. The
 * sun's POSE is not set here (issue #121 split): applySunPose() owns
 * position/target so frustum fitting stays pose-independent.
 */
export function fitShadowFrustum(
  light: DirectionalLight,
  bounds: AdaptedScene['bounds'],
): void {
  const cam = light.shadow.camera as OrthographicCamera;
  const halfExtent =
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 +
    SHADOW_FRUSTUM_PAD_M;

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

/* ------------------------- lighting tunables (#179) ----------------------- */

/**
 * Renderer exposure under ACES filmic tone mapping. Light intensities
 * are pinned by the sun e2e (SUN_INTENSITY * intensityFactor to six
 * decimals), so the picture is tuned here and in the environment
 * intensity only.
 */
export const TONE_MAPPING_EXPOSURE = 0.9;

/** Room-environment intensity at full daylight and at the night floor. */
export const ENV_INTENSITY_NOON = 0.5;
export const ENV_INTENSITY_NIGHT = 0.12;

/** The room environment is Y-up; the viewer's world is Z-up. */
const ENV_ROTATION_X_RAD = Math.PI / 2;

/**
 * Slots that read a specular environment: the glass and window frames.
 * The lookup is the costliest PBR term under software GL (about 15 ms
 * a frame when floors and furniture read it too, #179 fix round 1) and
 * a polished-floor reflection of a generic room is hardly seen, while
 * glass is where a specular environment actually shows.
 */
const ENV_SLOTS: ReadonlySet<string> = new Set(['glass', 'windowFrame']);

/**
 * The ground plot is unlit, so its shade (a grey multiplier on the grass
 * colour) stands in for the lighting a lit grass would receive: close to
 * 1 at noon, where the sun, hemisphere and ambient sum to about the
 * albedo, and dimmer toward night with the sun. Tuned against the lit
 * plot's pixels in the overview.
 */
export const GROUND_SHADE_NOON = 0.98;
export const GROUND_SHADE_NIGHT = 0.5;

/** Ground plot: how far below the active floor it sits, meters (clears floor slabs). */
export const GROUND_PLOT_DROP_M = 0.04;
/** Contact darkening: peak opacity at the building edge, and its lift above the plot. */
const CONTACT_SHADOW_MAX_ALPHA = 0.55;
const CONTACT_SHADOW_LIFT_M = 0.005;
/** Contact-shadow texture resolution (square, texels). */
const CONTACT_SHADOW_TEXELS = 128;

/** The environment-lit materials of one built scene, keyed by its lights. */
interface EnvBinding {
  materials: MeshStandardMaterial[];
  /** The unlit ground plot (HIGH only). */
  ground: { material: MeshBasicMaterial } | null;
  /** The environment texture the materials currently carry. */
  attached: Texture | null;
}
const envByLights = new WeakMap<ViewerLights, EnvBinding>();

/** Daylight fraction for a sun intensity factor: 0 at the night floor, 1 at noon. */
function daylight(intensityFactor: number): number {
  const span = 1 - SUN_NIGHT_INTENSITY_FLOOR;
  return Math.min(1, Math.max(0, (intensityFactor - SUN_NIGHT_INTENSITY_FLOOR) / span));
}

/** Environment intensity for a sun intensity factor (night floor to 1). */
function environmentIntensityFor(intensityFactor: number): number {
  return ENV_INTENSITY_NIGHT + (ENV_INTENSITY_NOON - ENV_INTENSITY_NIGHT) * daylight(intensityFactor);
}

/** Show the ground plot at the shade a given daylight fraction earns. */
function shadeGround(ground: NonNullable<EnvBinding['ground']>, t: number): void {
  const shade = GROUND_SHADE_NIGHT + (GROUND_SHADE_NOON - GROUND_SHADE_NIGHT) * t;
  ground.material.color.setScalar(shade);
}

/** The session's one room environment (HIGH tier), tied to its renderer. */
let sessionEnvironment: { renderer: WebGLRenderer; texture: Texture } | null = null;

/** Prefiltered RoomEnvironment: the default environment builder. */
function buildRoomEnvironment(renderer: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return target.texture;
}

/**
 * Build the room environment once per renderer and keep it for the
 * session (never disposed on scene rebuilds: scenes only borrow it).
 * Returns null when the renderer has no usable GL context, so a
 * context-less environment degrades to direct lighting only.
 */
export function ensureEnvironment(
  renderer: WebGLRenderer,
  make: (renderer: WebGLRenderer) => Texture = buildRoomEnvironment,
): Texture | null {
  if (sessionEnvironment && sessionEnvironment.renderer === renderer) {
    return sessionEnvironment.texture;
  }
  try {
    const texture = make(renderer);
    sessionEnvironment = { renderer, texture };
    return texture;
  } catch {
    return null;
  }
}

/* ------------------------------- sun pose (#121) -------------------------- */

/** Dusk targets for the pose lerps (module singletons — lerp only reads). */
const SUN_DUSK_COLOR = new Color(SUN_DUSK_COLOR_HEX);
const SKY_DUSK_BOTTOM_COLOR = new Color(SKY_DUSK_BOTTOM_HEX);
const SKY_DUSK_TOP_COLOR = new Color(SKY_DUSK_TOP_HEX);

/**
 * Write a sun-settings pose onto the live lights (issue #121): hang the
 * directional sun around the plan centre, aim it, and scale
 * intensity/colour from the solar model's coupling curves. Every curve
 * is identity at the noon preset, so the default build reproduces the
 * pre-#121 light state exactly. Returns the computed state so callers
 * can drive the sky blend and shadow refresh from the same evaluation.
 */
export function applySunPose(
  lights: ViewerLights,
  settings: SunSettings,
  bounds: AdaptedScene['bounds'],
): SunState {
  const state = sunState(settings);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  lights.sun.position.set(
    centerX + state.offset.x,
    centerY + state.offset.y,
    state.offset.z,
  );
  lights.sun.target.position.set(centerX, centerY, 0);
  lights.sun.target.updateMatrixWorld();
  lights.sun.intensity = SUN_INTENSITY * state.intensityFactor;
  lights.sun.color.set(SUN_COLOR).lerp(SUN_DUSK_COLOR, state.duskBlend);
  lights.amb.intensity = AMBIENT_INTENSITY * state.ambientFactor;
  const binding = envByLights.get(lights);
  if (binding) {
    const intensity = environmentIntensityFor(state.intensityFactor);
    for (const m of binding.materials) m.envMapIntensity = intensity;
    if (binding.ground) shadeGround(binding.ground, daylight(state.intensityFactor));
  }
  return state;
}

/**
 * Blend the sky-dome gradient toward the dusk stops (issue #121): the
 * uniforms are re-seated to the day stops before every lerp so the
 * blend stays absolute, and blend 0 restores the day sky. No-op on a
 * null dome (LOW quality keeps its solid backdrop — degrade
 * gracefully, no tier special-casing).
 */
export function applySkyDusk(
  skyDome: BuiltScene['skyDome'],
  duskBlend: number,
): void {
  if (!skyDome) return;
  const { uniforms } = skyDome.material;
  const bottom = uniforms.uBottomColor.value as Color;
  const top = uniforms.uTopColor.value as Color;
  bottom.set(SKY_GRADIENT_BOTTOM_HEX).lerp(SKY_DUSK_BOTTOM_COLOR, duskBlend);
  top.set(SKY_GRADIENT_TOP_HEX).lerp(SKY_DUSK_TOP_COLOR, duskBlend);
}

/**
 * Configure the renderer once per session: DPR clamp, MSAA, HP GPU
 * preference, PCFSoft shadows with autoUpdate disabled (static scene —
 * shadowAtlas refresh happens only via renderer.shadowMap.needsUpdate).
 * LOW quality (issue #86) turns shadow mapping OFF entirely — the
 * biggest single perf lever for integrated GPUs. Issue #179 adds ACES
 * filmic tone mapping + sRGB output (both tiers) and the HIGH-tier room
 * environment map.
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
  // Filmic tone mapping and sRGB output on both tiers (#179). Lights are
  // physically based by default since three r165, so nothing to switch.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  renderer.outputColorSpace = SRGBColorSpace;
  // The specular environment is the HIGH tier's luxury; scenes pick it up
  // through scene.onBeforeRender (they are built before this runs).
  if (quality === 'high') ensureEnvironment(renderer);
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
 * Ground plot (issue #179): a flat quad just below the active floor,
 * the plan bounds plus the shadow-frustum pad on every side, so it
 * stays inside the sun's shadow camera and leaves the viewport corners
 * to the sky. Built in world coordinates, so its UVs are meters and the
 * grass tiles at its real size. Kept out of `meshes` and slot counting
 * like the sky dome. The grass colour map, unlit (see buildGroundMaterial),
 * so it receives no shadows. HIGH tier only: buildViewerScene skips it
 * on LOW, where a full-screen fill is cost the flat tier does not pay.
 */
export function buildGroundPlot(
  bounds: AdaptedScene['bounds'],
  floorElevation: number,
): Mesh {
  const x0 = bounds.minX - SHADOW_FRUSTUM_PAD_M;
  const x1 = bounds.maxX + SHADOW_FRUSTUM_PAD_M;
  const y0 = bounds.minY - SHADOW_FRUSTUM_PAD_M;
  const y1 = bounds.maxY + SHADOW_FRUSTUM_PAD_M;
  const z = floorElevation - GROUND_PLOT_DROP_M;

  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]), 3),
  );
  geo.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), 2),
  );
  geo.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const plot = new Mesh(geo, buildGroundMaterial());
  plot.name = 'ground-plot';
  return plot;
}

/** Slots that are not floor surfaces (everything else in the union is a floor texture). */
const NON_FLOOR_SLOTS: ReadonlySet<string> = new Set(['wall', 'ceiling', 'roof', 'glass', 'windowFrame']);
/** Triangles within this height of the lowest floor count as the ground-floor footprint, meters. */
const GROUND_FLOOR_BAND_M = 0.5;

/** A footprint triangle in plan space: x0,y0,x1,y1,x2,y2. */
type FootprintTri = readonly [number, number, number, number, number, number];

/**
 * The ground-floor footprint in plan space (issue #179, review round 1):
 * the floor-bucket triangles within a band of the lowest floor, i.e. the
 * room union the contact shadow should hug. Empty when there are no
 * floor buckets.
 */
export function groundFootprint(buckets: readonly MaterialBucket[]): FootprintTri[] {
  const tris: { z: number; tri: FootprintTri }[] = [];
  let minZ = Infinity;
  for (const bucket of buckets) {
    if (NON_FLOOR_SLOTS.has(bucket.slot) || bucket.slot.startsWith('furn-')) continue;
    const p = bucket.positions;
    const idx = bucket.indices;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const z = Math.max(p[a + 2], p[b + 2], p[c + 2]);
      if (z < minZ) minZ = z;
      tris.push({ z, tri: [p[a], p[a + 1], p[b], p[b + 1], p[c], p[c + 1]] });
    }
  }
  return tris.filter((t) => t.z <= minZ + GROUND_FLOOR_BAND_M).map((t) => t.tri);
}

/** Squared distance from (px, py) to segment (ax, ay)-(bx, by). */
function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const ex = px - (ax + u * dx);
  const ey = py - (ay + u * dy);
  return ex * ex + ey * ey;
}

/** Distance from (px, py) to the footprint: 0 inside, else to the nearest edge; capped at `cap`. */
function footprintDistance(px: number, py: number, tris: readonly FootprintTri[], cap: number): number {
  let best = cap * cap;
  for (const [ax, ay, bx, by, cx, cy] of tris) {
    // Cheap reject: the triangle's box, grown by the current best distance, misses the point.
    const r = Math.sqrt(best);
    if (
      px < Math.min(ax, bx, cx) - r ||
      px > Math.max(ax, bx, cx) + r ||
      py < Math.min(ay, by, cy) - r ||
      py > Math.max(ay, by, cy) + r
    ) {
      continue;
    }
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return 0; // inside (or on an edge)
    best = Math.min(
      best,
      segDistSq(px, py, ax, ay, bx, by),
      segDistSq(px, py, bx, by, cx, cy),
      segDistSq(px, py, cx, cy, ax, ay),
    );
  }
  return Math.sqrt(best);
}

/**
 * Soft contact darkening around the building (issue #179): a black
 * overlay whose alpha peaks inside the ground-floor footprint and fades
 * to nothing over the pad width beyond its edge. Alpha comes from a
 * small procedural texture, so no asset ships for it. The fade follows
 * the footprint (floor triangles), not the plan bounding box, so a notch
 * or an empty plot stays clear. With no floor triangles but a non-empty
 * scene it falls back to the bounding box; with no buckets there is no
 * overlay (null). HIGH tier only; the texture is released with the
 * material.
 */
export function buildContactShadow(
  bounds: AdaptedScene['bounds'],
  floorElevation: number,
  buckets: readonly MaterialBucket[],
): Mesh | null {
  if (buckets.length === 0) return null;
  let footprint = groundFootprint(buckets);
  if (footprint.length === 0) {
    const { minX, minY, maxX, maxY } = bounds;
    footprint = [
      [minX, minY, maxX, minY, maxX, maxY],
      [minX, minY, maxX, maxY, minX, maxY],
    ];
  }
  const x0 = bounds.minX - SHADOW_FRUSTUM_PAD_M;
  const x1 = bounds.maxX + SHADOW_FRUSTUM_PAD_M;
  const y0 = bounds.minY - SHADOW_FRUSTUM_PAD_M;
  const y1 = bounds.maxY + SHADOW_FRUSTUM_PAD_M;
  const z = floorElevation - GROUND_PLOT_DROP_M + CONTACT_SHADOW_LIFT_M;

  const n = CONTACT_SHADOW_TEXELS;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j += 1) {
    const y = y0 + ((j + 0.5) / n) * (y1 - y0);
    for (let i = 0; i < n; i += 1) {
      const x = x0 + ((i + 0.5) / n) * (x1 - x0);
      const dist = footprintDistance(x, y, footprint, SHADOW_FRUSTUM_PAD_M);
      const falloff = Math.max(0, 1 - dist / SHADOW_FRUSTUM_PAD_M);
      data[(j * n + i) * 4 + 3] = Math.round(255 * CONTACT_SHADOW_MAX_ALPHA * falloff * falloff);
    }
  }
  const texture = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]), 3),
  );
  geo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const mat = new MeshBasicMaterial({
    color: 0x000000,
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  mat.addEventListener('dispose', () => texture.dispose());
  const mesh = new Mesh(geo, mat);
  mesh.name = 'ground-contact';
  mesh.renderOrder = 1; // after the opaque plot it darkens
  return mesh;
}

/**
 * Neutral plot half-extent, meters (issue #148): a finite, non-degenerate
 * square so the empty backdrop still has a valid orbit frame and a valid
 * shadow frustum — double its HALF (12 m) is the framed plot.
 */
export const EMPTY_PLOT_HALF_EXTENT_M = 6;

/**
 * Geometry-free scene description for the empty-plan state (issue #148):
 * the sky/ground backdrop IS the normal builder fed with zero buckets, so
 * the dome, lighting and shadow-frustum fitting all keep working while
 * the plan has no rooms, and the day/night + sun controls stay live.
 * Lives here (not in the controller) so there is exactly one definition
 * of what a viewer scene is.
 */
export function emptyAdaptedScene(): AdaptedScene {
  const half = EMPTY_PLOT_HALF_EXTENT_M;
  return {
    buckets: [],
    collisions: [],
    // #152: no rooms → no ceiling spotlights; the field is required on
    // AdaptedScene, so the empty scene carries the empty set.
    roomLights: [],
    triangleCount: 0,
    bounds: { minX: -half, minY: -half, maxX: half, maxY: half },
    activeFloorElevation: 0,
    stairs: [],
  };
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

  const lights: ViewerLights = { sun, hemi, amb };
  // Environment (#179): the scene is built before configureRenderer
  // makes the session's room environment, so the glossy materials
  // borrow it lazily on the first render. applySunPose retunes their
  // intensity by time of day through this binding.
  const envBinding: EnvBinding = { materials: [], ground: null, attached: null };
  envByLights.set(lights, envBinding);
  scene.onBeforeRender = () => {
    const env = sessionEnvironment?.texture;
    if (!env || envBinding.attached === env) return;
    for (const m of envBinding.materials) {
      m.envMap = env;
      m.needsUpdate = true;
    }
    envBinding.attached = env;
  };
  // Default sun pose (issue #121): identity at DEFAULT_SUN_SETTINGS —
  // the noon perch (8, −8, 12) the pre-#121 build hard-coded — so the
  // default output stays byte-identical. The controller re-applies the
  // live settings on every rebuild and on every HUD change.
  applySunPose(lights, DEFAULT_SUN_SETTINGS, adapted.bounds);

  const meshes: Mesh[] = [];

  // Quality knob (#87): read ONCE per build — every bucket shares the
  // same tier so a scene never mixes textured and flattened slots.
  // #109: the inset's force-low override wins over the URL tier.
  const hiQuality = forceLowMaterials ? false : isHighQuality();

  for (const bucket of adapted.buckets) {
    const geo = bucketGeometry(bucket.slot, bucket.positions, bucket.indices, hiQuality);
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
    if (hiQuality && quality === 'high' && ENV_SLOTS.has(bucket.slot)) {
      mat.envMapIntensity = ENV_INTENSITY_NOON;
      mat.envMapRotation.x = ENV_ROTATION_X_RAD;
      envBinding.materials.push(mat);
    }

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

  // Ground plot and contact shadow (#179): HIGH only. On LOW the plot
  // was a fill cost of ~3 ms a frame under software GL (a third of a
  // flat frame), against a LOW promise of costing no more than before.
  if (hiQuality) {
    const plot = buildGroundPlot(adapted.bounds, adapted.activeFloorElevation);
    envBinding.ground = { material: plot.material as MeshBasicMaterial };
    shadeGround(envBinding.ground, 1); // default pose is noon; applySunPose retunes
    scene.add(plot);
    const contact = buildContactShadow(
      adapted.bounds,
      adapted.activeFloorElevation,
      adapted.buckets,
    );
    if (contact) scene.add(contact);
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
    lights,
  };
}
