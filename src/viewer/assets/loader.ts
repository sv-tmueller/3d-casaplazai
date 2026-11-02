/**
 * Lazy texture-set loader (issue #179). `createPbrMaterial` hands back a
 * MeshStandardMaterial at once, already in its final shader shape: the
 * colour, normal, roughness and AO slots hold shared 1x1 placeholders
 * (white, flat normal, full AO and roughness), so the surface reads as
 * its flat colour. When a set's three files arrive the SAME material is
 * mutated in place: maps swapped in, tint reset. The controller's
 * walls-alpha and roof autofade mutate those instances, so the mesh's
 * `material` is never replaced and only the map fields, `color` and
 * `roughness` are touched.
 *
 * Why placeholders rather than attaching pending textures: three.js
 * binds an empty (black) texture for an image that has not loaded yet.
 * A failed download keeps the placeholders, so a surface can never go
 * black or vanish.
 *
 * One session-wide cache holds each set (fetched once, reused by every
 * rebuild). Failures are not cached, so the next build retries.
 */

import {
  DataTexture,
  MeshStandardMaterial,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  UnsignedByteType,
  type ColorRepresentation,
} from 'three';
import {
  setFileUrls,
  textureSetSpec,
  type TextureSetId,
} from './manifest';

/** Fetch seam: resolves one URL to a decoded texture (tests stub it). */
export type TextureFetcher = (url: string) => Promise<Texture>;

const defaultFetcher: TextureFetcher = (url) => new TextureLoader().loadAsync(url);

let fetcher: TextureFetcher = defaultFetcher;

/** Swap the fetch seam; `null` restores the real TextureLoader. */
export function setTextureFetcher(next: TextureFetcher | null): void {
  fetcher = next ?? defaultFetcher;
}

/* ------------------------------ anisotropy ------------------------------- */

/** Session-wide anisotropy; conservative 4 until the app wires the renderer's real capability. */
const DEFAULT_ANISOTROPY = 4;
let maxAniso = DEFAULT_ANISOTROPY;

/** Every texture a set has loaded, so a later anisotropy change reaches them. */
const loadedSets = new Map<TextureSetId, LoadedSet>();

/**
 * Raise the anisotropy of every loaded texture (call once after renderer
 * init with renderer.capabilities.getMaxAnisotropy()). Applies to
 * textures loaded LATER too, since the value lives in this module.
 */
export function setMaxAnisotropy(n: number): void {
  const sane = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  if (sane === maxAniso) return;
  maxAniso = sane;
  for (const set of loadedSets.values()) {
    set.color.anisotropy = sane;
    set.normal.anisotropy = sane;
    set.roughness.anisotropy = sane;
  }
}

/* ------------------------------ placeholders ----------------------------- */

interface Placeholders {
  white: Texture;
  normal: Texture;
  arm: Texture;
}

let placeholders: Placeholders | null = null;

function pixel(r: number, g: number, b: number, sRGB: boolean): DataTexture {
  const tex = new DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  tex.colorSpace = sRGB ? SRGBColorSpace : NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** The shared neutral maps every material starts with. */
function getPlaceholders(): Placeholders {
  placeholders ??= {
    white: pixel(255, 255, 255, true),
    normal: pixel(128, 128, 255, false),
    // ARM: AO 1 in R, roughness multiplier 1 in G, metalness 0 in B.
    arm: pixel(255, 255, 0, false),
  };
  return placeholders;
}

/* --------------------------------- sets ---------------------------------- */

interface LoadedSet {
  color: Texture;
  normal: Texture;
  roughness: Texture;
}

/** In-flight and settled loads, one entry per set. */
const setLoads = new Map<TextureSetId, Promise<LoadedSet>>();

function safeFetch(url: string): Promise<Texture> {
  try {
    return fetcher(url);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

function configure(tex: Texture, tileMeters: number, sRGB: boolean): void {
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  // UVs are in meters, so one repetition spans the asset's real size.
  tex.repeat.set(1 / tileMeters, 1 / tileMeters);
  tex.colorSpace = sRGB ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
}

function requestSet(id: TextureSetId): Promise<LoadedSet> {
  const cached = setLoads.get(id);
  if (cached) return cached;

  const urls = setFileUrls(id);
  const { tileMeters } = textureSetSpec(id);
  const pending = Promise.allSettled([
    safeFetch(urls.color),
    safeFetch(urls.normal),
    safeFetch(urls.roughness),
  ]).then((results) => {
    const textures = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (textures.length !== results.length) {
      // Partial sets are useless (a normal map without its colour map
      // would mismatch): drop what arrived and let the next build retry.
      for (const t of textures) t.dispose();
      setLoads.delete(id);
      throw new Error(`texture set ${id} failed to load`);
    }
    const [color, normal, roughness] = textures;
    configure(color, tileMeters, true);
    configure(normal, tileMeters, false);
    configure(roughness, tileMeters, false);
    const loaded: LoadedSet = { color, normal, roughness };
    loadedSets.set(id, loaded);
    return loaded;
  });
  setLoads.set(id, pending);
  return pending;
}

/* ------------------------------- materials ------------------------------- */

export interface PbrMaterialOptions {
  /** Flat colour shown until (and unless) the set arrives. */
  color: ColorRepresentation;
  /** Flat roughness shown until (and unless) the set arrives. */
  roughness: number;
  /** Tint once the albedo map is in; defaults to white (map as shot). */
  upgradedColor?: ColorRepresentation;
  /** Roughness scalar once the map is in; defaults to 1 (map drives it). */
  upgradedRoughness?: number;
  /**
   * Wire the packed AO channel (default true). Matte surfaces skip it:
   * the extra sampler costs real time for little visible gain.
   */
  ao?: boolean;
}

/** Materials still waiting for their set (disposed ones are removed). */
const pendingUpgrades = new Set<MeshStandardMaterial>();

/** Materials whose upgrade is queued; drives the leak assertion in tests. */
export function pendingUpgradeCount(): number {
  return pendingUpgrades.size;
}

/**
 * Build a textured material that starts flat and upgrades in place.
 * The returned instance is final: callers may tweak side, opacity and
 * the like, and the upgrade will not undo it.
 */
export function createPbrMaterial(
  setId: TextureSetId,
  options: PbrMaterialOptions,
): MeshStandardMaterial {
  const ph = getPlaceholders();
  const withAo = options.ao ?? true;
  const mat = new MeshStandardMaterial({
    color: options.color,
    roughness: options.roughness,
    metalness: 0,
    map: ph.white,
    normalMap: ph.normal,
    roughnessMap: ph.arm,
    ...(withAo ? { aoMap: ph.arm } : {}),
  });

  pendingUpgrades.add(mat);
  const release = (): void => {
    pendingUpgrades.delete(mat);
  };
  mat.addEventListener('dispose', release);

  requestSet(setId).then(
    (set) => {
      if (!pendingUpgrades.has(mat)) return; // disposed while loading
      release();
      mat.map = set.color;
      mat.normalMap = set.normal;
      mat.roughnessMap = set.roughness;
      if (withAo && textureSetSpec(setId).packedArm) mat.aoMap = set.roughness;
      mat.color.set(options.upgradedColor ?? 0xffffff);
      mat.roughness = options.upgradedRoughness ?? 1;
      mat.needsUpdate = true;
    },
    () => {
      // Failed download: keep the flat colour over the placeholders.
      release();
    },
  );
  return mat;
}

/** Drop every cache (test seam + hot-reload hygiene). */
export function clearAssetCaches(): void {
  setLoads.clear();
  loadedSets.clear();
  pendingUpgrades.clear();
  maxAniso = DEFAULT_ANISOTROPY;
}
