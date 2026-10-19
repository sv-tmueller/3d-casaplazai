/**
 * Migration specs for schema v2 (pkg 7.1, issue #74).
 *
 * Coverage demanded by the issue/sub-plan:
 *  - the registered v1->v2 transform wraps collections into floors[0]
 *    WITHOUT copying/reordering (reference-transparent);
 *  - real v1 payloads travel through BOTH loader paths (editor autosave
 *    hydration, viewer bridge ingestion) and come out valid v2;
 *  - raw v1 is still REJECTED by validateFloorplan (unsupported-version)
 *    — unmigrated data must never pass;
 *  - emptyPlan() emits v2;
 *  - registry machinery behaves (gaps, future versions, dupes).
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, FloorplanDataV1 } from '../../src/shared/schema';
import { SCHEMA_VERSION, migrate, registerTransform, validateFloorplan } from '../../src/shared/schema';
import { AUTOSAVE_KEY, AutosaveManager } from '../../src/editor/autosave';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import { hydrateFromAutosave } from '../../src/editor/glue';

/** Minimal but REAL v1 payload (localStorage-autosave shaped). */
function v1Payload(): FloorplanDataV1 {
  return {
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [{
      id: 'room-living',
      name: 'Living',
      polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
      floorTexture: 'wood',
    }],
    openings: [{
      id: 'door-1',
      roomId: 'room-living',
      kind: 'door',
      segmentIndex: 0,
      tCenter: 0.5,
      width: 0.9,
      sillHeight: 0,
      headHeight: 2.05,
    }],
    furniture: [{
      id: 'sofa-1',
      type: 'sofa',
      roomId: 'room-living',
      position: [2, 1],
      rotationDeg: 0,
      footprint: [1.8, 0.9],
    }],
  };
}

describe('migrate() — v1->v2 transform (registered at module init)', () => {
  it('current SCHEMA_VERSION constant is 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('wraps v1 collections into a single ground floor', () => {
    const v1 = v1Payload();
    const result = migrate(structuredClone(v1));
    expect(result.ok).toBe(true);
    const data = result.data as FloorplanData;
    expect(data.schemaVersion).toBe(2);
    expect(data.floors).toHaveLength(1);
    const ground = data.floors[0];
    expect(ground.id).toBe('floor-ground');
    expect(ground.name).toBe('Ground');
    expect(ground.elevation).toBe(0);
    expect(ground.rooms).toEqual(v1.rooms);
    expect(ground.openings).toEqual(v1.openings);
    expect(ground.furniture).toEqual(v1.furniture);
    expect(data.stairs).toEqual([]);
  });

  it('is reference-transparent: arrays are carried by reference', () => {
    const v1 = v1Payload();
    const result = migrate(v1);
    expect(result.ok).toBe(true);
    const data = result.data as FloorplanData;
    // Byte-identity of the migration depends on NO copying/reordering.
    expect(data.floors[0].rooms).toBe(v1.rooms);
    expect(data.floors[0].openings).toBe(v1.openings);
    expect(data.floors[0].furniture).toBe(v1.furniture);
  });

  it('migrated v1 passes the current validator', () => {
    const result = migrate(v1Payload());
    expect(result.ok).toBe(true);
    expect(validateFloorplan(result.data)).toMatchObject({ ok: true });
  });

  it('passes already-current v2 data through unchanged', () => {
    const v2 = emptyPlan();
    const result = migrate(structuredClone(v2));
    expect(result).toMatchObject({ ok: true });
    expect(result.data).toEqual(v2);
  });

  it('raw v1 is REJECTED by validateFloorplan directly (unsupported-version)', () => {
    const res = validateFloorplan(v1Payload());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.map((e) => e.code)).toContain('unsupported-version');
    }
  });

  it('fails loudly on an unregistered gap', () => {
    const result = migrate(v1Payload(), { to: 3 });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe('migration-gap');
  });

  it('rejects future versions', () => {
    const result = migrate({ ...v1Payload(), schemaVersion: 99 });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe('future-version');
  });

  it('refuses duplicate registration of the v1 step', () => {
    expect(() =>
      registerTransform(1, (d) => d as FloorplanData),
    ).toThrow(/already registered/);
  });
});

describe('loader path 1 — editor autosave hydration (glue.hydrateFromAutosave)', () => {
  class FakeStorage implements Storage {
    private backing = new Map<string, string>();
    get length(): number { return this.backing.size; }
    getItem(k: string): string | null { return this.backing.get(k) ?? null; }
    setItem(k: string, v: string): void { this.backing.set(k, String(v)); }
    removeItem(k: string): void { this.backing.delete(k); }
    clear(): void { this.backing.clear(); }
    key(i: number): string | null { return Array.from(this.backing.keys())[i] ?? null; }
  }

  it('restores a v1 autosave as a valid v2 store plan', () => {
    const storage = new FakeStorage();
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(v1Payload()));
    const autosave = new AutosaveManager(storage);
    const store = new EditorStore(emptyPlan());
    hydrateFromAutosave(store, autosave);
    const data = store.getState().data;
    expect(data.schemaVersion).toBe(2);
    expect(data.floors[0].rooms).toHaveLength(1);
    expect(data.floors[0].openings).toHaveLength(1);
    expect(data.floors[0].furniture).toHaveLength(1);
    expect(validateFloorplan(data)).toMatchObject({ ok: true });
  });

  it('still restores a v2 autosave natively', () => {
    const storage = new FakeStorage();
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(emptyPlan()));
    const autosave = new AutosaveManager(storage);
    const store = new EditorStore(emptyPlan());
    hydrateFromAutosave(store, autosave);
    expect(store.getState().data.schemaVersion).toBe(2);
  });

  it('discards an unmigratable slot (corrupt payload)', () => {
    const storage = new FakeStorage();
    storage.setItem(AUTOSAVE_KEY, '{"garbage":true}');
    const autosave = new AutosaveManager(storage);
    const store = new EditorStore(emptyPlan());
    hydrateFromAutosave(store, autosave);
    expect(store.getState().data.floors[0].rooms).toHaveLength(0);
    expect(storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });
});

describe('validateFloorplan — plan-wide entity id namespace (issue #74)', () => {
  const twoFloorBase = () => ({
    schemaVersion: 2,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    floors: [
      {
        id: 'floor-0', name: 'Ground', elevation: 0,
        rooms: [{
          id: 'room-x', name: 'A', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
          floorTexture: null,
        }],
        openings: [],
        furniture: [],
      },
      {
        id: 'floor-1', name: 'Upper', elevation: 3,
        rooms: [{
          id: 'room-y', name: 'B', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
          floorTexture: null,
        }],
        openings: [],
        furniture: [],
      },
    ],
    stairs: [],
  });

  it('rejects the same room id appearing on two different floors', () => {
    const plan = twoFloorBase() as unknown as Record<string, unknown>;
    const floors = plan.floors as Array<{ rooms: Array<{ id: string }> }>;
    floors[1].rooms[0].id = 'room-x'; // duplicate across floors
    const result = validateFloorplan(plan);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.some((e) =>
      e.code === 'duplicate-id')).toBe(true);
  });

  it('accepts distinct ids across floors', () => {
    expect(validateFloorplan(twoFloorBase()).ok).toBe(true);
  });
});
