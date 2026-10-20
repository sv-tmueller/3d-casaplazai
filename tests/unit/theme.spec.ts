/**
 * Issue #126 — editor theme preference model: defaults, localStorage
 * roundtrip via an injected fake Storage, corrupt-slot discard, and
 * null-storage degradation (the model/settings.spec.ts pattern).
 * Pure module: DOM application of the theme happens in glue.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  loadTheme,
  parseTheme,
  saveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '../../src/editor/model/theme';

class FakeStorage implements Storage {
  map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

describe('theme preference (issue #126)', () => {
  describe('defaults + parsing', () => {
    it('ships light as the frozen default (today\'s canvas)', () => {
      expect(DEFAULT_THEME).toBe('light');
    });

    it('parses exactly the two legal themes', () => {
      expect(parseTheme('light')).toBe('light');
      expect(parseTheme('dark')).toBe('dark');
    });

    it('rejects every other provenance with null', () => {
      for (const bad of ['Light', 'DARK', '', 'system', 0, 1, true, null, undefined, {}, []]) {
        expect(parseTheme(bad)).toBeNull();
      }
    });
  });

  describe('localStorage roundtrip', () => {
    let storage: FakeStorage;

    beforeEach(() => {
      storage = new FakeStorage();
    });

    it('loads the default from an empty slot', () => {
      expect(loadTheme(storage)).toBe(DEFAULT_THEME);
    });

    it('survives save -> load for both themes', () => {
      for (const theme of ['light', 'dark'] as const) {
        saveTheme(storage, theme);
        expect(loadTheme(storage)).toBe(theme);
      }
    });

    it('uses the editor-scoped versioned key', () => {
      saveTheme(storage, DEFAULT_THEME);
      expect([...storage.map.keys()]).toEqual([THEME_STORAGE_KEY]);
      expect(THEME_STORAGE_KEY).toMatch(/^casaplaza\./);
    });

    it('discards a corrupt slot and cleans it up', () => {
      storage.setItem(THEME_STORAGE_KEY, '{not json');
      expect(loadTheme(storage)).toBe(DEFAULT_THEME);
      expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it('discards an unknown theme value in a well-formed slot', () => {
      storage.setItem(THEME_STORAGE_KEY, JSON.stringify('sepia'));
      expect(loadTheme(storage)).toBe(DEFAULT_THEME);
      expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it('tolerates a null storage backend', () => {
      expect(loadTheme(null)).toBe(DEFAULT_THEME);
      expect(() => saveTheme(null, 'dark')).not.toThrow();
    });

    it('never throws when the backing store throws', () => {
      const hostile = {
        get length(): number { throw new Error('nope'); },
        clear(): void { throw new Error('nope'); },
        getItem(): string | null { throw new Error('nope'); },
        key(): string | null { throw new Error('nope'); },
        removeItem(): void { throw new Error('nope'); },
        setItem(): void { throw new Error('nope'); },
      } as unknown as Storage;
      expect(loadTheme(hostile)).toBe(DEFAULT_THEME);
      expect(() => saveTheme(hostile, 'dark' as ThemePreference)).not.toThrow();
    });
  });
});
