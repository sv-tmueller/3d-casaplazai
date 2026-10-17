import { afterEach, describe, expect, it } from 'vitest';
import type { FloorplanData } from '../../src/shared/schema';
import { SCHEMA_VERSION } from '../../src/shared/schema';
import { migrate, registerTransform } from '../../src/shared/schema/migrate';

afterEach(() => {
  // registry is module-global; restore cleanliness between tests
  // (registerTransform refuses duplicates, so tests inject unique keys)
});

const v1Plan: FloorplanData = {
  schemaVersion: 1,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  rooms: [],
  openings: [],
  furniture: [],
};

describe('migrate()', () => {
  it('passes v1 data through unchanged when already current', () => {
    const result = migrate(structuredClone(v1Plan));
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(v1Plan);
  });

  it('chains an injected v1->v2 transform and bumps the version', () => {
    registerTransform(1, (data) => ({
      ...(data as FloorplanData),
      schemaVersion: 2 as never,
      units: 'meters',
    }));

    const result = migrate(structuredClone(v1Plan), { to: 2 });
    expect(result.ok).toBe(true);
    expect(result.data?.schemaVersion).toBe(2);
    expect(migrate(structuredClone(v1Plan))).toMatchObject({ ok: true }); // untouched default path unaffected
  });

  it('fails loudly on an unregistered gap', () => {
    const result = migrate(structuredClone(v1Plan), { to: 3 });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe('migration-gap');
  });

  it('rejects future versions', () => {
    const result = migrate({ ...structuredClone(v1Plan), schemaVersion: 99 });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe('future-version');
  });

  it('current SCHEMA_VERSION constant is 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
