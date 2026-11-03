/**
 * AppState (issue #178, design §8.2): the small observable store the
 * shell renders from. Persists view, tab, theme and project name; a
 * persisted Walk view restores as 3D (gap G15); ?view= and ?quality=
 * boot params override.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  APP_STATE_STORAGE_KEY,
  DEFAULT_PROJECT_NAME,
  PROJECT_STORAGE_KEY,
  createAppState,
} from '../../src/app/state';
import { THEME_STORAGE_KEY } from '../../src/editor/model/theme';

class MemStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

describe('AppState defaults', () => {
  it('boots in the Plan view on the Build tab with an untitled project', () => {
    const s = createAppState({ storage: new MemStorage(), search: '' }).get();
    expect(s.view).toBe('plan');
    expect(s.tab).toBe('build');
    expect(s.projectName).toBe(DEFAULT_PROJECT_NAME);
    expect(DEFAULT_PROJECT_NAME).toBe('Untitled plan');
    expect(s.theme).toBe('light');
    expect(s.inspectorOpen).toBe(false);
    expect(s.walkPose).toBeNull();
    expect(s.viewer).toEqual({
      roofs: true,
      ceilings: 'auto',
      wallsAlpha: 0,
      quality: 'high',
      sun: { timeHours: 12, northOffsetDeg: 0 },
    });
  });

  it('reads ?quality=low (end-anchored) and ?view=3d at boot', () => {
    expect(createAppState({ storage: null, search: '?quality=low' }).get().viewer.quality).toBe('low');
    expect(createAppState({ storage: null, search: '?quality=lowest' }).get().viewer.quality).toBe('high');
    expect(createAppState({ storage: null, search: '?a=1&view=3d' }).get().view).toBe('3d');
    expect(createAppState({ storage: null, search: '?view=walk' }).get().view).toBe('3d');
    expect(createAppState({ storage: null, search: '?view=bogus' }).get().view).toBe('plan');
  });
});

describe('AppState observability', () => {
  it('notifies subscribers on change and stays quiet on a no-op patch', () => {
    const app = createAppState({ storage: null, search: '' });
    const fn = vi.fn();
    const off = app.subscribe(fn);
    app.set({ tab: 'view' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].tab).toBe('view');
    app.set({ tab: 'view' });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    app.set({ tab: 'measure' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('merges viewer settings patches', () => {
    const app = createAppState({ storage: null, search: '' });
    app.setViewer({ roofs: false });
    app.setViewer({ sun: { timeHours: 18, northOffsetDeg: 30 } });
    expect(app.get().viewer.roofs).toBe(false);
    expect(app.get().viewer.sun).toEqual({ timeHours: 18, northOffsetDeg: 30 });
    expect(app.get().viewer.ceilings).toBe('auto');
  });
});

describe('AppState persistence', () => {
  it('persists view, tab and project name; Walk restores as 3D', () => {
    const storage = new MemStorage();
    const app = createAppState({ storage, search: '' });
    app.set({ view: 'walk', tab: 'measure', projectName: 'Flat 4B' });
    expect(JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!)).toEqual({ view: 'walk', tab: 'measure' });
    expect(JSON.parse(storage.getItem(PROJECT_STORAGE_KEY)!)).toEqual({ name: 'Flat 4B' });
    const again = createAppState({ storage, search: '' }).get();
    expect(again.view).toBe('3d');
    expect(again.tab).toBe('measure');
    expect(again.projectName).toBe('Flat 4B');
  });

  it('persists the theme under the existing casaplaza.theme.v1 key', () => {
    const storage = new MemStorage();
    createAppState({ storage, search: '' }).set({ theme: 'dark' });
    expect(storage.getItem(THEME_STORAGE_KEY)).toContain('dark');
    expect(createAppState({ storage, search: '' }).get().theme).toBe('dark');
  });

  it('a ?view= boot param beats the persisted view', () => {
    const storage = new MemStorage();
    createAppState({ storage, search: '' }).set({ view: '3d' });
    expect(createAppState({ storage, search: '?view=plan' }).get().view).toBe('plan');
  });

  it('fails open on corrupt slots and blank names', () => {
    const storage = new MemStorage();
    storage.setItem(APP_STATE_STORAGE_KEY, '{nope');
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ name: '   ' }));
    const s = createAppState({ storage, search: '' }).get();
    expect(s.view).toBe('plan');
    expect(s.projectName).toBe(DEFAULT_PROJECT_NAME);
  });

  it('survives a storage that throws', () => {
    const storage = new MemStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    const app = createAppState({ storage, search: '' });
    expect(() => app.set({ tab: 'view' })).not.toThrow();
  });
});
