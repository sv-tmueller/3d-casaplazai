/**
 * Issue #68 (Pkg 3): editor-local snap settings — grid pitch selector +
 * snap master switch.
 *
 * Scope notes (recorded decisions):
 * - COMBINED master switch only (no separate grid/magnetic toggles),
 *   per the issue's delegation. Turning the master OFF kills BOTH the
 *   grid fallback AND the magnetic attraction to neighboring geometry
 *   ("magnetic death with off"): resolveSnap returns the raw pointer
 *   point untouched, so vertices float freely. This is intentional and
 *   shipped as the designed behavior.
 * - These settings are EDITOR preferences, not plan data: they live in
 *   localStorage under an editor-scoped key and are deliberately NOT
 *   part of FloorplanData (mirrors autosave.ts storage-injection style).
 */
import { snapVec, type Pt } from '../geom';

/** Allowed grid pitches, meters. */
export type SnapPitch = 0.1 | 0.25 | 0.5 | 1;

export interface SnapSettings {
  pitch: SnapPitch;
  master: boolean;
}

/**
 * Today's behavior, frozen: 0.5 m pitch with snapping on. Keeping this
 * the DEFAULT guarantees e2e invariance for the existing suites.
 */
export const DEFAULT_SNAP_PITCH_M = 0.5;

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  pitch: DEFAULT_SNAP_PITCH_M,
  master: true,
};

/** Editor-scoped localStorage slot (versioned like the autosave key). */
export const SNAP_SETTINGS_STORAGE_KEY = 'casaplaza.snap.settings.v1';

const VALID_PITCHES: readonly SnapPitch[] = [0.1, 0.25, 0.5, 1];

/** Parse a pitch value of unknown provenance; null when invalid. */
export function parsePitch(value: unknown): SnapPitch | null {
  if (
    typeof value === 'number' &&
    VALID_PITCHES.includes(value as SnapPitch)
  ) {
    return value as SnapPitch;
  }
  return null;
}

/**
 * Best-effort localStorage accessor. Storage can throw (privacy mode /
 * sandboxed iframe); callers degrade gracefully to in-memory defaults.
 */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Pure snap policy (the unit-test seam):
 * - master OFF  → raw point, untouched (free float, magnets dead);
 * - snapped hit → the magnetized point wins over the grid;
 * - otherwise   → raw rounded onto the pitch grid.
 */
export function resolveSnap(
  raw: Pt,
  snapped: Pt | null,
  s: SnapSettings,
): Pt {
  if (!s.master) return raw;
  if (snapped !== null) return snapped;
  return snapVec(raw, s.pitch);
}

/** Load settings from a (possibly null/unavailable) Storage backend. */
export function loadSnapSettings(storage: Storage | null): SnapSettings {
  if (!storage) return { ...DEFAULT_SNAP_SETTINGS };
  let raw: string | null;
  try {
    raw = storage.getItem(SNAP_SETTINGS_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_SNAP_SETTINGS };
  }
  if (raw === null) return { ...DEFAULT_SNAP_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad');
    const obj = parsed as Record<string, unknown>;
    const pitch = parsePitch(obj.pitch);
    const master =
      typeof obj.master === 'boolean' ? obj.master : DEFAULT_SNAP_SETTINGS.master;
    if (pitch === null) throw new Error('bad');
    return { pitch, master };
  } catch {
    // Corrupt slot: discard like autosave's loadStoredPlan does.
    try {
      storage.removeItem(SNAP_SETTINGS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_SNAP_SETTINGS };
  }
}

/** Persist settings; silently degrades when storage is unavailable. */
export function saveSnapSettings(
  storage: Storage | null,
  s: SnapSettings,
): void {
  if (!storage) return;
  try {
    storage.setItem(SNAP_SETTINGS_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / privacy mode: keep running on the in-memory copy */
  }
}
