/**
 * Issue #99 (Pkg 12.1): blueprint underlay — a traced floor-plan IMAGE
 * painted beneath the grid so walls can be drawn over it.
 *
 * ARCHITECTURE RULING (SUB_PLAN, binding): the underlay is EDITOR
 * state, NOT schema. It deliberately does NOT live in FloorplanData,
 * mirroring the snap-settings precedent (model/settings.ts): the
 * editor persists it under its own versioned localStorage key
 * (casaplaza.underlay.v1) as a per-floor map keyed by floor.id —
 * SEPARATE from AUTOSAVE_KEY, whose slot carries raw FloorplanData.
 *
 * SHARE-LINK OMISSION IS SATISFIED BY CONSTRUCTION: since underlay ∉
 * FloorplanData, encodeShare() can never carry it and the viewer never
 * sees it — the issue's "graceful omission acceptable" clause needs
 * zero shareLink.ts changes. Documented here and in docs/schema.md.
 */
import type { Pt } from '../geom';

/** One floor's placed image. Units: meters (world), degrees, percent. */
export interface UnderlayState {
  /** data: URL (PNG/JPEG/WebP). Avoids object-URL lifetime + CSP issues. */
  dataUrl: string;
  /** World-space center of the image. */
  cx: number;
  cy: number;
  /** World-space size (unrotated extents), meters. */
  w: number;
  h: number;
  /** Rotation, degrees CCW. */
  rotDeg: number;
  /** Paint opacity, 0-100. */
  opacity: number;
  /** Locked ⇒ no handles, no nudge — pointer passes through trivially. */
  locked: boolean;
  /** Hidden ⇒ not painted, not interactable. */
  hidden: boolean;
}

/** Versioned editor-scoped slot (snap-settings precedent; NOT autosave). */
export const UNDERLAY_STORAGE_KEY = 'casaplaza.underlay.v1';

/** Debounce mirroring autosave.ts's DEBOUNCE_MS_DEFAULT. */
export const UNDERLAY_DEBOUNCE_MS = 800;

/** Grab radius for corner handles, screen px (mirrors HANDLE_HIT_PX). */
export const UNDERLAY_HANDLE_HIT_PX = 12;

/** Arrow-key nudge step, meters (Shift ×10 for coarse jumps). */
export const UNDERLAY_NUDGE_M = 0.1;
export const UNDERLAY_NUDGE_LARGE_M = 1;

/** Popover rotate-buttons step, degrees. */
export const UNDERLAY_ROTATE_STEP_DEG = 5;

/** Floor on corner resize; smaller extents clamp here, meters. */
export const UNDERLAY_MIN_SIDE_M = 0.1;

/** Larger side of a freshly imported image, meters. */
export const UNDERLAY_FIT_M = 6;

/** Fresh imports start semi-transparent so walls read through them. */
export const UNDERLAY_DEFAULT_OPACITY = 60;

/** Local-frame corner sign pairs: TL, TR, BR, BL (world y is up). */
const CORNER_SIGNS: ReadonlyArray<readonly [number, number]> = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

/** data: URL whitelist — the same families the file input accepts. */
const DATA_URL_RE =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Best-effort localStorage accessor. Storage can throw (privacy mode /
 * sandboxed iframe); callers degrade gracefully to in-memory state.
 * (Copied from settings.ts — same rationale.)
 */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Strict parse of one floor's underlay of unknown provenance. Unlike
 * loadSnapSettings we infer NOTHING: a slot row is all-or-nothing, so a
 * half-corrupt entry never resurrects with a bogus transform.
 */
export function parseUnderlayState(raw: unknown): UnderlayState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.dataUrl !== 'string' ||
    !DATA_URL_RE.test(o.dataUrl)
  ) {
    return null;
  }
  if (
    !isFiniteNumber(o.cx) ||
    !isFiniteNumber(o.cy) ||
    !isFiniteNumber(o.w) ||
    !isFiniteNumber(o.h) ||
    !isFiniteNumber(o.rotDeg)
  ) {
    return null;
  }
  if (o.w <= 0 || o.h <= 0) return null;
  if (
    typeof o.opacity !== 'number' ||
    !Number.isInteger(o.opacity) ||
    o.opacity < 0 ||
    o.opacity > 100
  ) {
    return null;
  }
  if (typeof o.locked !== 'boolean' || typeof o.hidden !== 'boolean') {
    return null;
  }
  return {
    dataUrl: o.dataUrl,
    cx: o.cx,
    cy: o.cy,
    w: o.w,
    h: o.h,
    rotDeg: o.rotDeg,
    opacity: o.opacity,
    locked: o.locked,
    hidden: o.hidden,
  };
}

/**
 * Load the per-floor map from storage. Junk rows are dropped (kept rows
 * stay untouched); a corrupt slot overall is discarded like the
 * snap-settings loader does.
 */
export function loadUnderlayMap(
  storage: Storage | null,
): Record<string, UnderlayState> {
  if (!storage) return {};
  let raw: string | null;
  try {
    raw = storage.getItem(UNDERLAY_STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      storage.removeItem(UNDERLAY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const map: Record<string, UnderlayState> = {};
  for (const [floorId, row] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    const u = parseUnderlayState(row);
    if (u !== null) map[floorId] = u;
  }
  return map;
}

/** Persist the whole per-floor map; silently degrades without storage. */
export function saveUnderlayMap(
  storage: Storage | null,
  map: Record<string, UnderlayState>,
): boolean {
  if (!storage) return false;
  try {
    if (Object.keys(map).length === 0) {
      // Removing (vs storing "{}") keeps the slot absent in the common
      // never-used case — same shape as a pristine browser profile.
      storage.removeItem(UNDERLAY_STORAGE_KEY);
    } else {
      storage.setItem(UNDERLAY_STORAGE_KEY, JSON.stringify(map));
    }
    return true;
  } catch {
    // Quota exceeded / privacy mode: keep running on the in-memory copy.
    // Caller flashes a message (reviewer #99 should-fix) — silent loss
    // of a large scan on reload was the failure mode this return fixes.
    return false;
  }
}

/** Interactable iff present, unlocked, and visible (glue seam policy). */
export function underlayInteractable(u: UnderlayState | null): u is UnderlayState {
  return u !== null && !u.locked && !u.hidden;
}

/** World-space corners TL, TR, BR, BL (CCW) of the placed image. */
export function underlayCorners(u: UnderlayState): Pt[] {
  const rad = (u.rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return CORNER_SIGNS.map(([sx, sy]) => [
    u.cx + (cos * sx * u.w - sin * sy * u.h) / 2,
    u.cy + (sin * sx * u.w + cos * sy * u.h) / 2,
  ]);
}

/** Translate the underlay, meters. */
export function nudgeUnderlay(u: UnderlayState, dx: number, dy: number): UnderlayState {
  return { ...u, cx: u.cx + dx, cy: u.cy + dy };
}

/** Rotate by a delta, degrees CCW, normalized into (-360, 360]. */
export function rotateUnderlayBy(u: UnderlayState, deltaDeg: number): UnderlayState {
  const raw = u.rotDeg + deltaDeg;
  const wrapped = ((raw % 360) + 360) % 360;
  return { ...u, rotDeg: wrapped };
}

/**
 * Corner-drag resize: the OPPOSITE corner stays anchored and the dragged
 * corner follows the cursor, measured in the image's LOCAL (rotated)
 * frame so the edges stay glued to the rotation. Crossing the anchor
 * clamps the extent to UNDERLAY_MIN_SIDE_M instead of flipping.
 */
export function resizeUnderlayFromCorner(
  u: UnderlayState,
  cornerIndex: number,
  worldPt: Pt,
): UnderlayState {
  const idx = ((cornerIndex % 4) + 4) % 4;
  const [sx, sy] = CORNER_SIGNS[idx];
  const anchor = underlayCorners(u)[(idx + 2) % 4];
  const vx = worldPt[0] - anchor[0];
  const vy = worldPt[1] - anchor[1];
  // world → local: rotate by -rotDeg.
  const rad = (u.rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = cos * vx + sin * vy;
  const ly = -sin * vx + cos * vy;
  // Healthy drag: the corner stays on ITS side of the anchor (lx shares
  // sx's sign, ly shares sy's) and follows the cursor, floored at the
  // minimum side. CROSSING the anchor on an axis clamps that axis to
  // the minimum instead of ballooning via abs(); a drag running exactly
  // PARALLEL to an edge (component 0) keeps the current extent so a
  // one-dimension adjustment never pinches the other dimension flat.
  let w = u.w;
  let h = u.h;
  if (lx * sx < 0) w = UNDERLAY_MIN_SIDE_M;
  else if (lx !== 0) w = Math.max(Math.abs(lx), UNDERLAY_MIN_SIDE_M);
  if (ly * sy < 0) h = UNDERLAY_MIN_SIDE_M;
  else if (ly !== 0) h = Math.max(Math.abs(ly), UNDERLAY_MIN_SIDE_M);
  // New center: anchor + local offset (sx·w/2, sy·h/2) rotated back.
  const ox = (cos * sx * w - sin * sy * h) / 2;
  const oy = (sin * sx * w + cos * sy * h) / 2;
  return { ...u, w, h, cx: anchor[0] + ox, cy: anchor[1] + oy };
}

/**
 * Screen-space hit test for the corner handles (index into the
 * underlayCorners order, or null). Geometry only — lock/hide gating is
 * the caller's policy (underlayInteractable).
 */
export function underlayHandleAt(
  screenPt: Pt,
  screenCorners: Pt[],
): number | null {
  for (let i = 0; i < screenCorners.length; i += 1) {
    const c = screenCorners[i];
    if (Math.hypot(c[0] - screenPt[0], c[1] - screenPt[1]) <= UNDERLAY_HANDLE_HIT_PX) {
      return i;
    }
  }
  return null;
}
