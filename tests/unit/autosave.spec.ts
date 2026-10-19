/**
 * Unit tests for the autosave debouncer (fake timers).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FloorplanData } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { AUTOSAVE_KEY, AutosaveManager } from '../../src/editor/autosave';

class FakeStorage implements Storage {
  private backing = new Map<string, string>();
  get length(): number {
    return this.backing.size;
  }
  getItem(k: string): string | null {
    return this.backing.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.backing.set(k, String(v));
  }
  removeItem(k: string): void {
    this.backing.delete(k);
  }
  clear(): void {
    this.backing.clear();
  }
  key(i: number): string | null {
    return Array.from(this.backing.keys())[i] ?? null;
  }
}

const PLAN: FloorplanData = migrate({
  schemaVersion: 1,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  rooms: [{
    id: 'room-1',
    name: 'Hallway',
    polygon: [[0, 0], [2, 0], [2, 1], [0, 1]],
    floorTexture: null,
  }],
  openings: [],
  furniture: [],
}).data!;

describe('AutosaveManager', () => {
  let storage: FakeStorage;
  let mgr: AutosaveManager;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = new FakeStorage();
    mgr = new AutosaveManager(storage, 800);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not write before the debounce interval elapses', () => {
    mgr.scheduleSave(PLAN);
    storage.setItem(AUTOSAVE_KEY, '{"sentinel":"untouched"}');
    vi.advanceTimersByTime(500);
    expect(storage.getItem(AUTOSAVE_KEY)).toContain('sentinel');
  });

  it('writes after the debounce interval', () => {
    mgr.scheduleSave(PLAN);
    vi.advanceTimersByTime(850);
    expect(JSON.parse(storage.getItem(AUTOSAVE_KEY)!)).toEqual(PLAN);
  });

  it('coalesces bursts into one final write', () => {
    const spy = vi.spyOn(storage, 'setItem');
    mgr.scheduleSave(PLAN);
    vi.advanceTimersByTime(300);
    mgr.scheduleSave({ ...PLAN, wallHeight: 3.0 });
    vi.advanceTimersByTime(900);
    const writes = spy.mock.calls.filter(([k]) => k === AUTOSAVE_KEY);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(storage.getItem(AUTOSAVE_KEY)!).wallHeight).toBe(3.0);
  });

  it('loads a valid stored plan', () => {
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(PLAN));
    expect(mgr.loadStoredPlan(validateOk)).toEqual(PLAN);
  });

  it('discards an INVALID stored plan and clears it', () => {
    storage.setItem(AUTOSAVE_KEY, '{"garbage":true}');
    expect(mgr.loadStoredPlan(validateFail)).toBeNull();
    expect(storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('tolerates a totally empty storage', () => {
    expect(mgr.loadStoredPlan(validateOk)).toBeNull();
  });

  it('flush forces immediate persistence and stops the timer', () => {
    mgr.scheduleSave(PLAN);
    mgr.flush();
    expect(JSON.parse(storage.getItem(AUTOSAVE_KEY)!)).toEqual(PLAN);
    vi.advanceTimersByTime(5000); // late tick must be harmless
    const spy = vi.spyOn(storage, 'setItem');
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('stop suppresses the pending write', () => {
    mgr.scheduleSave(PLAN);
    mgr.stop();
    vi.advanceTimersByTime(5000);
    expect(storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('serializes with pretty spacing', () => {
    const spy = vi.spyOn(storage, 'setItem');
    mgr.scheduleSave(PLAN);
    mgr.flush();
    expect(spy.mock.calls[0][1]).toContain('\n');
  });
});

function validateOk(p: unknown): boolean {
  // v2 shape check (issue #74): migrated plans nest entities under floors[].
  return !!p && typeof p === 'object' && Array.isArray((p as { floors?: unknown }).floors);
}
function validateFail(_p: unknown): boolean {
  return false;
}
