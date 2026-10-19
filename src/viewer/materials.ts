/**
 * Materials (issue #6): procedural canvas texture factory keyed by the
 * schema's floorTexture enum + wall/ceiling paints. Six generator
 * kinds total, each drawn ONCE per session into a cached 512² canvas —
 * RepeatWrapping tiles it physically (UV repeat = meters / TILE_METERS),
 * SRGBColorSpace, mipmaps on. No downloads, no asset files.
 *
 * Issue #87 quality knob: buildMaterial(slot, hiQuality) gates the
 * texture upload — LOW renders color-only materials (keeping the same
 * roughness/metalness budget so gloss differentiation survives the
 * fast path), HIGH attaches the procedural map. Anisotropy is a
 * session-wide setter over the shared texture cache.
 */

import {
  CanvasTexture,
  Color,
  LinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { TEXTURE_SIZE, TILE_METERS } from './types';

/** Kinds the factory supports (four floor enums + wall + roof shingle). */
export type TextureKind =
  | 'wood'
  | 'tile'
  | 'carpet'
  | 'concrete'
  | 'wall'
  | 'roofShingle';

/** Cache: one canvas allocation per kind per session. */
const canvasCache = new Map<TextureKind, HTMLCanvasElement>();

/** Cache of uploaded THREE textures per kind. */
const textureCache = new Map<TextureKind, Texture>();

/** Deterministic tiny PRNG so textures render identically everywhere. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw planked hardwood: horizontal boards + faint grain streaks. */
function drawWood(ctx: CanvasRenderingContext2D, rng: () => number): void {
  ctx.fillStyle = '#a06a3c';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const boardRows = 8;
  const rowH = TEXTURE_SIZE / boardRows;
  for (let r = 0; r < boardRows; r += 1) {
    const shade = 0.82 + rng() * 0.3;
    ctx.fillStyle = `rgb(${Math.round(160 * shade)}, ${Math.round(106 * shade)}, ${Math.round(60 * shade)})`;
    ctx.fillRect(0, r * rowH, TEXTURE_SIZE, rowH - 1);
    // Grain streaks.
    for (let s = 0; s < 14; s += 1) {
      const gy = r * rowH + rng() * rowH;
      ctx.strokeStyle = `rgba(70, 40, 18, ${0.04 + rng() * 0.09})`;
      ctx.beginPath();
      ctx.moveTo(rng() * TEXTURE_SIZE, gy);
      ctx.bezierCurveTo(
        TEXTURE_SIZE * 0.3, gy + (rng() - 0.5) * 6,
        TEXTURE_SIZE * 0.7, gy + (rng() - 0.5) * 6,
        TEXTURE_SIZE, gy + (rng() - 0.5) * 4,
      );
      ctx.stroke();
    }
    // Board separation groove.
    ctx.fillStyle = 'rgba(40, 22, 10, 0.55)';
    ctx.fillRect(0, r * rowH + rowH - 1, TEXTURE_SIZE, 1);
  }
}

/** Draw ceramic grid: squares with recessed grout lines. */
function drawTile(ctx: CanvasRenderingContext2D, rng: () => number): void {
  ctx.fillStyle = '#cfd6db';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const cells = 4;
  const cw = TEXTURE_SIZE / cells;
  for (let gx = 0; gx < cells; gx += 1) {
    for (let gy = 0; gy < cells; gy += 1) {
      const shade = 0.92 + rng() * 0.12;
      ctx.fillStyle = `rgb(${Math.round(225 * shade)}, ${Math.round(228 * shade)}, ${Math.round(232 * shade)})`;
      ctx.fillRect(gx * cw + 3, gy * cw + 3, cw - 6, cw - 6);
    }
  }
  // Grout lines.
  ctx.strokeStyle = 'rgba(120, 128, 136, 0.9)';
  ctx.lineWidth = 6;
  for (let i = 0; i <= cells; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cw, 0);
    ctx.lineTo(i * cw, TEXTURE_SIZE);
    ctx.moveTo(0, i * cw);
    ctx.lineTo(TEXTURE_SIZE, i * cw);
    ctx.stroke();
  }
}

/** Draw carpet: layered soft noise fibers. */
function drawCarpet(ctx: CanvasRenderingContext2D, rng: () => number): void {
  ctx.fillStyle = '#6b7f8f';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let layer = 0; layer < 3; layer += 1) {
    for (let dot = 0; dot < 3800; dot += 1) {
      const x = rng() * TEXTURE_SIZE;
      const y = rng() * TEXTURE_SIZE;
      const lum = 118 + Math.round((layer / 3) * 44 + rng() * 26);
      ctx.fillStyle = `rgba(${lum}, ${lum + 10}, ${lum + 22}, ${(0.25 + rng() * 0.3).toFixed(2)})`;
      ctx.fillRect(x, y, 2 + rng() * 3, 2 + rng() * 3);
    }
  }
}

/** Draw concrete: blotchy grey washes + darker speckles. */
function drawConcrete(ctx: CanvasRenderingContext2D, rng: () => number): void {
  ctx.fillStyle = '#9aa0a6';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let blob = 0; blob < 60; blob += 1) {
    const x = rng() * TEXTURE_SIZE;
    const y = rng() * TEXTURE_SIZE;
    const rr = 24 + rng() * 90;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rr);
    const dark = rng() > 0.5;
    const rgb = dark ? '58, 62, 68' : '210, 214, 218';
    grad.addColorStop(0, `rgba(${rgb}, ${0.10 + rng() * 0.14})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  for (let sp = 0; sp < 2400; sp += 1) {
    const lum = 70 + Math.round(rng() * 150);
    ctx.fillStyle = `rgba(${lum}, ${lum}, ${lum}, ${(rng() * 0.5).toFixed(2)})`;
    ctx.fillRect(rng() * TEXTURE_SIZE, rng() * TEXTURE_SIZE, 1.4, 1.4);
  }
}

/** Draw warm plaster for walls: gentle tonal noise, no strong pattern. */
function drawWall(ctx: CanvasRenderingContext2D, rng: () => number): void {
  ctx.fillStyle = '#e8e2d8';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let i = 0; i < 5200; i += 1) {
    const lum = 216 + Math.round(rng() * 30 - 15);
    ctx.fillStyle = `rgba(${lum}, ${Math.round(lum * 0.98)}, ${Math.round(lum * 0.93)}, ${(rng() * 0.16).toFixed(2)})`;
    ctx.fillRect(rng() * TEXTURE_SIZE, rng() * TEXTURE_SIZE, 2.5, 2.5);
  }
}

/**
 * Draw asphalt/clay shingles (issue #87): horizontal COURSES of rounded
 * tabs with a per-row half-tab STAGGER (brick bond) over a terracotta
 * luminance ramp. Courses wrap seamlessly horizontally (stagger offsets
 * are multiples of the tab width) and vertically (row height divides
 * 512), so RepeatWrapping shows no seams.
 */
function drawRoofShingle(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
): void {
  // Terracotta base slightly deeper than the flat #b0623f so painted
  // tabs can rise ABOVE it toward lighter clay tones.
  ctx.fillStyle = '#8f4a2e';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const rows = 8;
  const rowH = TEXTURE_SIZE / rows;
  const tabs = 8;
  const tabW = TEXTURE_SIZE / tabs;

  for (let r = 0; r < rows; r += 1) {
    // Brick-bond stagger: shift alternate rows by HALF a tab — a
    // multiple of tabW, so the pattern wraps horizontally.
    const stagger = (r % 2) * (tabW / 2);
    // Per-course terracotta ramp: subtle luminance wave, never pure
    // random, so adjacent courses stay in-family.
    const ramp = 0.88 + 0.24 * ((r * 7919) % 97) / 97;
    for (let t = 0; t < tabs; t += 1) {
      const tx = t * tabW + stagger;
      // Wrap the overshooting half-tab back to x=0 (RepeatWrapping
      // equivalence: the canvas must be seamless on its own).
      const drawTab = (x: number): void => {
        const inset = 2 + rng() * 2.5;
        const w = tabW - inset * 2;
        const h = rowH - 3 - rng() * 2;
        // Clay tone: hue-stable ramp × per-tab jitter (kept small so
        // the roof reads as one material, not confetti).
        const jit = 0.94 + rng() * 0.12;
        const cr = Math.round(196 * ramp * jit);
        const cg = Math.round(98 * ramp * jit);
        const cb = Math.round(63 * ramp * jit);
        ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
        // Rounded-bottom tab (arc) clipped to its cell.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + inset, r * rowH, w, rowH);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(x + inset, r * rowH);
        ctx.lineTo(x + inset, r * rowH + h);
        ctx.quadraticCurveTo(
          x + tabW / 2,
          r * rowH + h + 8,
          x + inset + w,
          r * rowH + h,
        );
        ctx.lineTo(x + inset + w, r * rowH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      drawTab(tx);
      if (tx + tabW > TEXTURE_SIZE) drawTab(tx - TEXTURE_SIZE);
    }
    // Course shadow gap: thin dark seam under each row sells depth.
    ctx.fillStyle = 'rgba(52, 24, 14, 0.45)';
    ctx.fillRect(0, r * rowH, TEXTURE_SIZE, 2);
  }

  // Sparse granule flecks (weathering) — few enough to stay subtle.
  for (let sp = 0; sp < 900; sp += 1) {
    const lum = 120 + Math.round(rng() * 110);
    ctx.fillStyle = `rgba(${lum}, ${Math.round(lum * 0.55)}, ${Math.round(lum * 0.4)}, ${(rng() * 0.28).toFixed(2)})`;
    ctx.fillRect(rng() * TEXTURE_SIZE, rng() * TEXTURE_SIZE, 1.6, 1.6);
  }
}

const DRAWERS: Record<
  TextureKind,
  (ctx: CanvasRenderingContext2D, rng: () => number) => void
> = {
  wood: drawWood,
  tile: drawTile,
  carpet: drawCarpet,
  concrete: drawConcrete,
  wall: drawWall,
  roofShingle: drawRoofShingle,
};

/** Base colors backing each kind when textures can't upload (fallback). */
export const FALLBACK_COLORS: Record<TextureKind, string> = {
  wood: '#a06a3c',
  tile: '#ccd3d8',
  carpet: '#6b7f8f',
  concrete: '#9aa0a6',
  wall: '#e8e2d8',
  roofShingle: '#b0623f',
};

/** Render (or fetch from cache) the 512² canvas for a texture kind. */
export function getTextureCanvas(kind: TextureKind): HTMLCanvasElement {
  const cached = canvasCache.get(kind);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  let ctx = canvas.getContext('2d');
  if (!ctx) {
    // Environments lacking a real 2D context (happy-dom unit tests):
    // substitute a RECORDING proxy that accepts every drawing call,
    // logs invoked method names onto a globally-visible trail map, and
    // returns benign values. Real browsers always have a real context.
    const trail: string[] = [];
    const gradientStub = { addColorStop(): void { /* noop */ } };
    ctx = new Proxy({} as CanvasRenderingContext2D, {
      get(_target, prop) {
        if (prop === 'createRadialGradient') {
          return (): { addColorStop(offset: number, color: string): void } =>
            gradientStub;
        }
        if (typeof prop === 'string') {
          trail.push(prop);
        }
        return (): unknown => undefined;
      },
      set(_target, prop, _value) {
        if (typeof prop === 'string') trail.push(`set:${prop}`);
        return true;
      },
    }) as CanvasRenderingContext2D;
    (globalThis).__casaDrawerTrails ??= new WeakMap<
      HTMLCanvasElement,
      string[]
    >();
    (globalThis).__casaDrawerTrails!.set(canvas, trail);
  }
  DRAWERS[kind](ctx, mulberry(hashSeed(kind)));
  canvasCache.set(kind, canvas);
  return canvas;
}

/** Session-wide anisotropy sample count; conservative 4 until the app wires the renderer's real capability. */
let maxAniso = 4;

/**
 * Raise the anisotropy of every cached texture (call once after renderer
 * init with renderer.capabilities.getMaxAnisotropy()). Applies to
 * textures created LATER too — the value lives in this module's closure.
 */
export function setMaxAnisotropy(n: number): void {
  const sane = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  if (sane === maxAniso) return;
  maxAniso = sane;
  for (const tex of textureCache.values()) tex.anisotropy = sane;
}

/** Upload (or fetch) the THREE.CanvasTexture wrapping a cached canvas. */
export function getTexture(kind: TextureKind): Texture {
  const cached = textureCache.get(kind);
  if (cached) return cached;
  const tex = new CanvasTexture(getTextureCanvas(kind));
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  // Linear magnification (#87): NearestFilter fought the mipmapped
  // minification chain (aliasing shimmer at grazing angles). Linear
  // complements the mipmap pyramid; only reachable on the HIGH path
  // since LOW materials carry no map at all.
  tex.magFilter = LinearFilter;
  tex.anisotropy = maxAniso;
  textureCache.set(kind, tex);
  return tex;
}

/** Drop caches (test seam + hot-reload hygiene). */
export function clearMaterialCaches(): void {
  canvasCache.clear();
  textureCache.clear();
}

/** Repetition count covering `meters` of physical span. */
export function repeatsFor(meters: number): number {
  return Math.max(1, meters / TILE_METERS);
}

/** Union of every bucket slot buildMaterial accepts (mirrors the adapter's MaterialSlotId usage). 'roofShingle' is a TEXTURE kind only — never a bucket slot. */
export type MaterialSlot =
  | 'wall'
  | 'ceiling'
  | 'roof'
  | Exclude<TextureKind, 'roofShingle'>
  | 'glass'
  | 'windowFrame'
  | 'furn-wood'
  | 'furn-fabric'
  | 'furn-porcelain'
  | 'furn-laminate';

/**
 * Flat roughness per slot — the shipped budget (glass 0.15 ≪ wall
 * 0.92) kept IDENTICAL on both quality tiers so gloss differentiation
 * survives the LOW fast path (#87 requirement).
 */
const FLAT_ROUGHNESS: Record<MaterialSlot, number> = {
  wall: 0.92,
  ceiling: 1,
  roof: 0.85,
  glass: 0.15,
  windowFrame: 0.6,
  'furn-wood': 0.72,
  'furn-fabric': 0.95,
  'furn-porcelain': 0.25,
  'furn-laminate': 0.55,
  wood: 0.72,
  tile: 0.72,
  carpet: 1,
  concrete: 0.72,
};

/** Flat colors for the LOW (untextured) fast path, per slot. */
const SLOT_FLAT_COLORS: Record<MaterialSlot, string> = {
  wall: '#e8e2d8',
  ceiling: '#fafafa',
  roof: '#b0623f',
  glass: '#aac8dd',
  windowFrame: '#3a3f44',
  'furn-wood': '#a06a3c',
  'furn-fabric': '#7a8ba0',
  'furn-porcelain': '#f4f4f0',
  'furn-laminate': '#c8b89a',
  wood: '#a06a3c',
  tile: '#ccd3d8',
  carpet: '#6b7f8f',
  concrete: '#9aa0a6',
};

/**
 * Build the diffuse material for a bucket slot. `hiQuality` (issue #87)
 * gates the procedural texture pass: HIGH attaches the cached canvas map
 * (plus slight roughness retune); LOW renders a flat color while
 * KEEPING the roughness/metalness budget — the gloss differentiation
 * (glass 0.15 ≪ wall 0.92) survives the fast path, only the surface
 * variation drops off.
 */
export function buildMaterial(slot: MaterialSlot, hiQuality = true): MeshStandardMaterial {
  if (slot === 'glass') {
    // Translucent pane: pale blue, cheap transparency, no depth write
    // (avoids sorting artifacts against wall rims). Must NOT cast
    // shadows — sceneBuilder only enables castShadow for 'wall'.
    return new MeshStandardMaterial({
      color: new Color('#aac8dd'),
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      roughness: 0.15,
      metalness: 0,
    });
  }
  if (slot === 'windowFrame') {
    return new MeshStandardMaterial({
      color: new Color('#3a3f44'),
      roughness: 0.6,
      metalness: 0.1,
    });
  }
  if (slot === 'ceiling') {
    // Ceiling stays flat white at BOTH tiers — no texture exists for
    // it and none is wanted (overhead uniformity reads cleaner).
    return new MeshStandardMaterial({
      color: new Color('#fafafa'),
      roughness: 1,
      metalness: 0,
    });
  }
  if (!hiQuality) {
    // LOW fast path: flat color, same roughness family. No texture
    // upload happens for ANY slot, keeping the tier measurably cheap.
    return new MeshStandardMaterial({
      color: new Color(SLOT_FLAT_COLORS[slot]),
      roughness: FLAT_ROUGHNESS[slot],
      metalness: 0,
    });
  }
  if (slot === 'furn-wood') {
    // Reuse the cached wood texture — free realism win.
    return new MeshStandardMaterial({
      map: getTexture('wood'),
      roughness: 0.72,
      metalness: 0,
    });
  }
  if (slot === 'furn-fabric') {
    return new MeshStandardMaterial({
      color: new Color('#7a8ba0'),
      roughness: 0.95,
      metalness: 0,
    });
  }
  if (slot === 'furn-porcelain') {
    return new MeshStandardMaterial({
      color: new Color('#f4f4f0'),
      roughness: 0.25,
      metalness: 0,
    });
  }
  if (slot === 'furn-laminate') {
    return new MeshStandardMaterial({
      color: new Color('#c8b89a'),
      roughness: 0.55,
      metalness: 0,
    });
  }
  if (slot === 'wall') {
    return new MeshStandardMaterial({
      map: getTexture('wall'),
      roughness: 0.92,
      metalness: 0,
    });
  }
  if (slot === 'roof') {
    // Exterior shingle plane (pkg 8.1 + #87): now textured with the
    // DEDICATED roofShingle drawer (courses + staggered tabs +
    // terracotta ramp) instead of borrowing concrete's mineral speckle.
    // Still decoupled from interior plaster so painting walls never
    // touches roof planes.
    return new MeshStandardMaterial({
      map: getTexture('roofShingle'),
      color: new Color('#ffffff'),
      roughness: 0.85,
      metalness: 0,
    });
  }
  // Remaining slots are the floor TextureKinds only (glass/windowFrame/
  // furn-*/ceiling arms all returned above); narrow exhaustively.
  const kind: TextureKind =
    slot === 'wood' || slot === 'tile' || slot === 'carpet' || slot === 'concrete'
      ? slot
      : 'wood';
  return new MeshStandardMaterial({
    map: getTexture(kind),
    roughness: kind === 'carpet' ? 1 : 0.72,
    metalness: 0,
  });
}

/** Stable per-kind seeds so regenerated canvases are identical. */
function hashSeed(kind: TextureKind): number {
  let h = 2166136261;
  for (const ch of kind) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
