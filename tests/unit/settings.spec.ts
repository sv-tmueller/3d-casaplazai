/**
 * Issue #68 — snap settings model: defaults, localStorage roundtrip via
 * an injected fake Storage, corrupt-slot recovery, and the resolveSnap
 * policy matrix (pure seam consumed by glue.ts).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pt } from '../../src/editor/geom';
import {
  DEFAULT_SNAP_SETTINGS,
  loadSnapSettings,
  parsePitch,
  resolveSnap,
  saveSnapSettings,
  SNAP_SETTINGS_STORAGE_KEY,
  type SnapSettings,
} from '../../src/editor/model/settings';

class FakeStorage implements Storage {
  map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

describe('snap settings (issue #68)', () => {
  describe('defaults', () => {
    it('ships 0.5 m pitch + master on (= legacy GRID_M behavior)', () => {
      expect(DEFAULT_SNAP_SETTINGS).toEqual({ pitch: 0.5, master: true });
    });

    it('parses only the four legal pitches', () => {
      for (const ok of [0.1, 0.25, 0.5, 1]) {
        expect(parsePitch(ok)).toBe(ok);
      }
      for (const bad of [0.3, 0, 2, NaN, Infinity, '0.5', null]) {
        expect(parsePitch(bad)).toBeNull();
      }
    });
  });

  describe('localStorage roundtrip', () => {
    let storage: FakeStorage;

    beforeEach(() => {
      storage = new FakeStorage();
    });

    it('loads defaults from an empty slot', () => {
      expect(loadSnapSettings(storage)).toEqual(DEFAULT_SNAP_SETTINGS);
    });

    it('survives save -> load with every pitch', () => {
      for (const pitch of [0.1, 0.25, 0.5, 1] as const) {
        const s: SnapSettings = { pitch, master: !DEFAULT_SNAP_SETTINGS.master };
        saveSnapSettings(storage, s);
        expect(loadSnapSettings(storage)).toEqual(s);
      }
    });

    it('uses the editor-scoped versioned key', () => {
      saveSnapSettings(storage, DEFAULT_SNAP_SETTINGS);
      expect([...storage.map.keys()]).toEqual([SNAP_SETTINGS_STORAGE_KEY]);
      expect(SNAP_SETTINGS_STORAGE_KEY).toMatch(/^casaplaza\./);
    });

    it('discards a corrupt slot and cleans it up', () => {
      storage.setItem(SNAP_SETTINGS_STORAGE_KEY, '{not json');
      expect(loadSnapSettings(storage)).toEqual(DEFAULT_SNAP_SETTINGS);
      expect(storage.getItem(SNAP_SETTINGS_STORAGE_KEY)).toBeNull();
    });

    it('falls back to defaults on an illegal pitch', () => {
      storage.setItem(
        SNAP_SETTINGS_STORAGE_KEY,
        JSON.stringify({ pitch: 0.75, master: true }),
      );
      expect(loadSnapSettings(storage)).toEqual(DEFAULT_SNAP_SETTINGS);
    });

    it('tolerates a null storage backend', () => {
      expect(loadSnapSettings(null)).toEqual(DEFAULT_SNAP_SETTINGS);
      expect(() => saveSnapSettings(null, DEFAULT_SNAP_SETTINGS)).not.toThrow();
    });
  });

  describe('resolveSnap matrix', () => {
    const on = (pitch: SnapSettings['pitch']): SnapSettings => ({ pitch, master: true });
    const off: SnapSettings = { pitch: 0.5, master: false };

    it('master OFF: raw point passes through untouched (free float)', () => {
      const raw: Pt = [1.234, 2.345];
      expect(resolveSnap(raw, [1, 2], off)).toBe(raw);
      expect(resolveSnap(raw, null, off)).toBe(raw);
    });

    it('snapped point takes precedence over the grid', () => {
      // Magnet hit at an off-grid location beats grid rounding.
      const result = resolveSnap([1.234, 2.345], [1.25, 2.25], on(0.5));
      expect(result).toEqual([1.25, 2.25]);
    });

    it('no magnet: rounds onto the pitch grid', () => {
      expect(resolveSnap([1.234, 2.345], null, on(0.5))).toEqual([1, 2.5]);
      expect(resolveSnap([1.04, 1.06], null, on(1))).toEqual([1, 1]);
    });

    it('decimeter pitch rounds to 0.1 increments', () => {
      const p = resolveSnap([1.234, 2.378], null, on(0.1));
      expect(p[0]).toBeCloseTo(1.2, 10);
      expect(p[1]).toBeCloseTo(2.4, 10);
      const q = resolveSnap([-0.04, -0.06], null, on(0.1));
      expect(q[0]).toBeCloseTo(0, 10);
      expect(q[1]).toBeCloseTo(-0.1, 10);
    });

    it('quarter-meter pitch rounds to 0.25 increments', () => {
      const p = resolveSnap([1.13, 0.63], null, on(0.25));
      expect(p[0]).toBeCloseTo(1.25, 10);
      expect(p[1]).toBeCloseTo(0.75, 10);
    });
  });
});
