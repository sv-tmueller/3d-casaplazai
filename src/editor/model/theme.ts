/**
 * Issue #126 (Pkg 14.x): editor-local theme preference (light/dark).
 *
 * Scope notes (recorded decisions, mirrors model/settings.ts):
 * - The theme is an EDITOR preference, not plan data: it lives in
 *   localStorage under its own editor-scoped versioned key and is
 *   deliberately NOT part of FloorplanData (no schema evolution).
 * - This module stays PURE (parse/load/save only). Applying the theme
 *   to the DOM (`document.documentElement.dataset.theme`) and selecting
 *   the canvas palette (render.ts) happen in glue.ts.
 * - Dark-mode look: style.css overrides the EXISTING #54 tokens under
 *   `:root[data-theme="dark"]`; the canvas paints a TS palette pair so
 *   `paintScene` stays deterministic and unit-testable.
 */

export type ThemePreference = 'light' | 'dark';

/** Today's behavior, frozen: the light canvas is the ship default. */
export const DEFAULT_THEME: ThemePreference = 'light';

/** Editor-scoped localStorage slot (versioned like the autosave key). */
export const THEME_STORAGE_KEY = 'casaplaza.theme.v1';

/** Parse a theme value of unknown provenance; null when invalid. */
export function parseTheme(value: unknown): ThemePreference | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/**
 * Load the theme from a (possibly null/unavailable) Storage backend.
 * Corrupt or unknown slots are discarded (the loadSnapSettings
 * precedent) so a bad write can never wedge the editor.
 */
export function loadTheme(storage: Storage | null): ThemePreference {
  if (!storage) return DEFAULT_THEME;
  let raw: string | null;
  try {
    raw = storage.getItem(THEME_STORAGE_KEY);
  } catch {
    return DEFAULT_THEME;
  }
  if (raw === null) return DEFAULT_THEME;
  try {
    const theme = parseTheme(JSON.parse(raw) as unknown);
    if (theme === null) throw new Error('bad');
    return theme;
  } catch {
    try {
      storage.removeItem(THEME_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return DEFAULT_THEME;
  }
}

/** Persist the theme; silently degrades when storage is unavailable. */
export function saveTheme(storage: Storage | null, theme: ThemePreference): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* quota / privacy mode: keep running on the in-memory copy */
  }
}
