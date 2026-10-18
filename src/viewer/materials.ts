/**
 * Materials (issue #6): procedural canvas texture factory keyed by the
 * schema's floorTexture enum + wall/ceiling paints. Five generator
 * kinds total, each drawn ONCE per session into a cached 512² canvas —
 * RepeatWrapping tiles it physically (UV repeat = meters / TILE_METERS),
 * SRGBColorSpace, mipmaps on. No downloads, no asset files.
 */

import {
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { TEXTURE_SIZE, TILE_METERS } from './types';

/** Kinds the factory supports (four floor enums + wall). */
export type TextureKind = 'wood' | 'tile' | 'carpet' | 'concrete' | 'wall';

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

const DRAWERS: Record<
  TextureKind,
  (ctx: CanvasRenderingContext2D, rng: () => number) => void
> = {
  wood: drawWood,
  tile: drawTile,
  carpet: drawCarpet,
  concrete: drawConcrete,
  wall: drawWall,
};

/** Base colors backing each kind when textures can't upload (fallback). */
export const FALLBACK_COLORS: Record<TextureKind, string> = {
  wood: '#a06a3c',
  tile: '#ccd3d8',
  carpet: '#6b7f8f',
  concrete: '#9aa0a6',
  wall: '#e8e2d8',
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

/** Upload (or fetch) the THREE.CanvasTexture wrapping a cached canvas. */
export function getTexture(kind: TextureKind): Texture {
  const cached = textureCache.get(kind);
  if (cached) return cached;
  const tex = new CanvasTexture(getTextureCanvas(kind));
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.magFilter = NearestFilter;
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

/** Build the diffuse material for a bucket slot. */
export function buildMaterial(
  slot:
    | 'wall'
    | 'ceiling'
    | TextureKind
    | 'glass'
    | 'windowFrame'
    | 'furn-wood'
    | 'furn-fabric'
    | 'furn-porcelain'
    | 'furn-laminate',
): MeshStandardMaterial {
  if (slot === 'glass') {
    // Translucent pane: pale blue, cheap transparency, no depth write
    // (avoids sorting artifacts against wall rims). Must NOT cast
    // shadows — sceneBuilder only enables castShadow for 'wall'.
    const mat = new MeshStandardMaterial({
      color: new Color('#aac8dd'),
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      roughness: 0.15,
      metalness: 0,
    });
    return mat;
  }
  if (slot === 'windowFrame') {
    return new MeshStandardMaterial({
      color: new Color('#3a3f44'),
      roughness: 0.6,
      metalness: 0.1,
    });
  }
  if (slot === 'furn-wood') {
    return new MeshStandardMaterial({
      map: getTexture('wood'),
      roughness: 0.7,
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
    const mat = new MeshStandardMaterial({
      map: getTexture('wall'),
      roughness: 0.92,
      metalness: 0,
    });
    return mat;
  }
  if (slot === 'ceiling') {
    return new MeshStandardMaterial({
      color: new Color('#fafafa'),
      roughness: 1,
      metalness: 0,
    });
  }
  return new MeshStandardMaterial({
    map: getTexture(slot),
    roughness: slot === 'carpet' ? 1 : 0.72,
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
