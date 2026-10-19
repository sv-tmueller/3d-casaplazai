/**
 * Pkg 14.4 (issue #119): procedural 2D floor fills — the editor-canvas
 * counterpart of the viewer's material pass (pkg 9.2, materials.ts).
 *
 * One small offscreen canvas per texture kind, drawn ONCE per session
 * with a seeded PRNG (never Math.random — reloads and share-link
 * recipients must paint identically); the canvases are wrapped via
 * ctx.createPattern and memoized per 2D context.
 *
 * happy-dom (unit specs) has no 2D rasterizer: getContext('2d') returns
 * null, so — exactly like src/viewer/materials.ts — the draw falls back
 * to a recording proxy whose call trail lands on
 * globalThis.__casaFloorTrails for structural assertions.
 */
import { FLOOR_TEXTURES } from '../../shared/schema';

/**
 * FIX ROUND 1 (issue #119, finding 2 — drift): the kind union and the
 * picker list are DERIVED from the schema's FLOOR_TEXTURES tuple. The
 * previous hand-written literals could silently drift when a 5th
 * material lands; DRAWERS below is a Record over the same union, so a
 * NEW tuple member fails compilation until its drawer exists.
 */
export type FloorPatternKind = (typeof FLOOR_TEXTURES)[number];

/** Pattern cell edge, CSS px (screen-space fill — no camera scaling). */
export const FLOOR_PATTERN_CELL_PX = 48;

/** The kinds in picker order — the schema tuple IS the order. */
export const FLOOR_PATTERN_KINDS: readonly FloorPatternKind[] = FLOOR_TEXTURES;

const canvasCache = new Map<FloorPatternKind, HTMLCanvasElement>();
let patternCache = new WeakMap<
  CanvasRenderingContext2D,
  Map<FloorPatternKind, CanvasPattern | null>
>();

/* -------------------------------- PRNG ---------------------------------- */

/** mulberry32 — same generator family as the viewer's material pass. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — stable per-kind seeds, so every kind draws a fixed pattern. */
function seedFor(kind: string): number {
  let h = 2166136261;
  for (let i = 0; i < kind.length; i += 1) {
    h ^= kind.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------- drawers -------------------------------- */

function drawWood(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const S = FLOOR_PATTERN_CELL_PX;
  ctx.fillStyle = '#c9a06b';
  ctx.fillRect(0, 0, S, S);
  const rows = 4;
  const rowH = S / rows;
  for (let r = 0; r < rows; r += 1) {
    const shade = 0.86 + rng() * 0.24;
    ctx.fillStyle = `rgb(${Math.round(201 * shade)}, ${Math.round(160 * shade)}, ${Math.round(107 * shade)})`;
    ctx.fillRect(0, r * rowH + 1, S, rowH - 2);
    // Grain: one wavy stroke per plank.
    ctx.strokeStyle = 'rgba(90, 58, 28, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, r * rowH + rowH / 2);
    ctx.bezierCurveTo(
      S * 0.3,
      r * rowH + rowH / 2 - 2,
      S * 0.7,
      r * rowH + rowH / 2 + 2,
      S,
      r * rowH + rowH / 2,
    );
    ctx.stroke();
  }
  // Staggered plank joints, offset every other row.
  ctx.fillStyle = 'rgba(60, 38, 18, 0.5)';
  for (let r = 0; r < rows; r += 1) {
    const x = ((r % 2) * S) / 2 + S / 4;
    ctx.fillRect(x - 1, r * rowH + 1, 2, rowH - 2);
  }
}

function drawTile(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const S = FLOOR_PATTERN_CELL_PX;
  ctx.fillStyle = '#dde3e7';
  ctx.fillRect(0, 0, S, S);
  const cells = 4;
  const cw = S / cells;
  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      const shade = 0.94 + rng() * 0.08;
      ctx.fillStyle = `rgb(${Math.round(221 * shade)}, ${Math.round(227 * shade)}, ${Math.round(231 * shade)})`;
      ctx.fillRect(gx * cw + 1.5, gy * cw + 1.5, cw - 3, cw - 3);
      ctx.strokeStyle = 'rgba(150, 160, 168, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(gx * cw + 1.5, gy * cw + 1.5, cw - 3, cw - 3);
    }
  }
  // Grout grid over the cells.
  ctx.strokeStyle = 'rgba(130, 140, 148, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < cells; i += 1) {
    ctx.moveTo(i * cw, 0);
    ctx.lineTo(i * cw, S);
    ctx.moveTo(0, i * cw);
    ctx.lineTo(S, i * cw);
  }
  ctx.stroke();
}

function drawCarpet(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const S = FLOOR_PATTERN_CELL_PX;
  ctx.fillStyle = '#8b96a6';
  ctx.fillRect(0, 0, S, S);
  // Two-tone speckle field — short flecks, seeded placement.
  for (let i = 0; i < 240; i += 1) {
    const x = rng() * S;
    const y = rng() * S;
    const light = rng() > 0.5;
    ctx.fillStyle = light ? 'rgba(186, 196, 208, 0.7)' : 'rgba(96, 106, 122, 0.7)';
    ctx.fillRect(x, y, 1.6, 1.6);
  }
}

function drawConcrete(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const S = FLOOR_PATTERN_CELL_PX;
  ctx.fillStyle = '#b9bdc2';
  ctx.fillRect(0, 0, S, S);
  // Tonal blotches: pour unevenness.
  for (let i = 0; i < 14; i += 1) {
    const w = 6 + rng() * 14;
    const h = 4 + rng() * 10;
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(70, 74, 80, 0.10)';
    ctx.fillRect(rng() * S - w / 2, rng() * S - h / 2, w, h);
  }
  // Aggregate speckles.
  ctx.fillStyle = 'rgba(90, 94, 100, 0.5)';
  for (let i = 0; i < 70; i += 1) {
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, 0.6 + rng() * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

const DRAWERS: Record<
  FloorPatternKind,
  (ctx: CanvasRenderingContext2D, rng: () => number) => void
> = {
  wood: drawWood,
  tile: drawTile,
  carpet: drawCarpet,
  concrete: drawConcrete,
};

/* ------------------------- canvas + pattern API -------------------------- */

declare global {
  var __casaFloorTrails: WeakMap<HTMLCanvasElement, string[]> | undefined;
}

/** Recording proxy for context-less environments (mirrors materials.ts). */
function recordingProxy(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const trails = (globalThis.__casaFloorTrails ??= new WeakMap());
  const trail: string[] = [];
  trails.set(canvas, trail);
  return new Proxy(
    {},
    {
      get:
        (_target, prop) =>
        (..._args: unknown[]): unknown => {
          trail.push(String(prop));
          return undefined;
        },
      set: (_target, prop, _value): boolean => {
        trail.push(`set:${String(prop)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

/** The cached pattern canvas for a kind (drawn on first use). Kind must
 * be a KNOWN FLOOR_PATTERN_KIND — getFloorPattern() is the guarded entry
 * point; everything downstream may assume a real drawer. */
export function getFloorPatternCanvas(kind: FloorPatternKind): HTMLCanvasElement {
  const cached = canvasCache.get(kind);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = FLOOR_PATTERN_CELL_PX;
  canvas.height = FLOOR_PATTERN_CELL_PX;
  const real = canvas.getContext('2d');
  const ctx = (real ?? recordingProxy(canvas)) as CanvasRenderingContext2D;
  DRAWERS[kind](ctx, mulberry(seedFor(kind)));
  canvasCache.set(kind, canvas);
  return canvas;
}

/**
 * Membership guard. Raw payloads (the loadPlan bridge, rogue JSON) can
 * omit the floorTexture key entirely (=> undefined) or carry a value
 * outside the enum — the painter must degrade to the plain room fill,
 * never crash (pkg 14.4 fix round: the mini-3D specs seed exactly such
 * a plan).
 */
function isFloorPatternKind(value: unknown): value is FloorPatternKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DRAWERS, value);
}

/**
 * A repeat pattern for the kind, memoized per 2D context. Returns null
 * when the kind is unknown/missing OR the context cannot create
 * patterns (unit-spec stubs) — callers fall back to the plain room
 * fill.
 */
export function getFloorPattern(
  kind: FloorPatternKind,
  ctx: CanvasRenderingContext2D,
): CanvasPattern | null {
  if (!isFloorPatternKind(kind)) return null;
  let perCtx = patternCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    patternCache.set(ctx, perCtx);
  }
  const cached = perCtx.get(kind);
  if (cached !== undefined) return cached;
  const pattern =
    typeof ctx.createPattern === 'function'
      ? (ctx.createPattern(getFloorPatternCanvas(kind), 'repeat') ?? null)
      : null;
  perCtx.set(kind, pattern);
  return pattern;
}

/** Test/hygiene seam: drop the session canvases (patterns live per ctx). */
export function clearFloorPatternCaches(): void {
  canvasCache.clear();
  patternCache = new WeakMap();
}
