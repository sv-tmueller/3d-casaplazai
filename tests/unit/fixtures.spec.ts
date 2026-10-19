
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FurnitureType } from '../../src/shared/schema';
import { migrate, validateFloorplan } from '../../src/shared/schema';
import { validateGeometry } from '../../src/geom';

const demo = (): ReturnType<typeof JSON.parse> =>
  JSON.parse(readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'));

const townhouse = (): ReturnType<typeof JSON.parse> =>
  JSON.parse(readFileSync(join(process.cwd(), 'demo', 'demo-townhouse.json'), 'utf8'));

const duplex = (): ReturnType<typeof JSON.parse> =>
  JSON.parse(readFileSync(join(process.cwd(), 'demo', 'demo-duplex.json'), 'utf8'));

const ALL_FURNITURE_TYPES: FurnitureType[] = ['bed', 'sofa', 'table', 'chair', 'counter', 'bathtub', 'toilet'];

describe('demo/demo-apartment.json — AC coverage', () => {
  const fixture = demo();

  it('validates cleanly after v1→v2 migration (issue #74)', () => {
    const result = validateFloorplan(migrate(fixture).data);
    expect(result).toMatchObject({ ok: true });
  });

  it('has at least 3 rooms', () => {
    expect(fixture.rooms.length).toBeGreaterThanOrEqual(3);
  });

  it('includes at least one non-axis-aligned polygon', () => {
    const axisAligned = (poly: number[][]): boolean =>
      poly.every(([x, y], i) => {
        const [nx, ny] = poly[(i + 1) % poly.length]!;
        return nx === x || ny === y;
      });
    expect(fixture.rooms.some((r: { polygon: number[][] }) => !axisAligned(r.polygon))).toBe(true);
  });

  it('contains at least one door and one window', () => {
    const kinds = new Set(fixture.openings.map((o: { kind: string }) => o.kind));
    expect(kinds.has('door')).toBe(true);
    expect(kinds.has('window')).toBe(true);
  });

  it('shows furniture of every type', () => {
    const present = new Set(fixture.furniture.map((f: { type: string }) => f.type));
    for (const t of ALL_FURNITURE_TYPES) expect(present, `missing furniture type ${t}`).toContain(t);
  });

  it('uses meter-consistent dimensions (positions/extents sane)', () => {
    for (const f of fixture.furniture as { footprint: number[]; position: number[] }[]) {
      expect(Math.abs(f.position[0])).toBeLessThan(100);
      expect(Math.abs(f.position[1])).toBeLessThan(100);
      expect(f.footprint[0]).toBeGreaterThan(0);
      expect(f.footprint[1]).toBeGreaterThan(0);
    }
  });
})

describe('demo/demo-townhouse.json — AC coverage (issue #76)', () => {
  const fixture = townhouse();

  it('validates NATIVELY as schema v2 (no migration involved)', () => {
    const result = validateFloorplan(fixture);
    expect(result).toMatchObject({ ok: true });
  });

  it('declares exactly two floors with elevations 0 and 2.7', () => {
    expect(fixture.floors).toHaveLength(2);
    expect(fixture.floors[0].elevation).toBe(0);
    expect(fixture.floors[1].elevation).toBe(2.7);
  });

  it('mostly NON-overlapping footprints + exactly one aligned pair', () => {
    // Ground: living/kitchen/entry; upper: bedroom(=living footprint)/
    // office/bath/landing. Identical xy footprints must occur ONLY for
    // the aligned pair (master-bedroom ≡ living) — the z-dedupe
    // exerciser. Any other identical pair would be an accident.
    const polys: Array<[string, number[][]]> = fixture.floors.flatMap(
      (fl: { rooms: { id: string; polygon: number[][] }[] }) =>
        fl.rooms.map((r) => [r.id, r.polygon]),
    );
    const canon = (p: number[][]): string => JSON.stringify(p);
    const counts = new Map<string, number>();
    for (const [, poly] of polys) {
      const key = canon(poly);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const duplicated = [...counts.entries()].filter(([, n]) => n > 1);
    expect(duplicated).toHaveLength(1);
    expect(duplicated[0]![1]).toBe(2);
  });

  it('carries ONE staircase with the #69 shape, anchored to ground', () => {
    expect(fixture.stairs).toHaveLength(1);
    const stair = fixture.stairs[0];
    expect(stair.id).toBe('stair-main');
    expect(typeof stair.roomId).toBe('string');
    expect(fixture.floors[0].rooms.some((r: { id: string }) => r.id === stair.roomId))
      .toBe(true);
    expect(stair.stepCount).toBeGreaterThanOrEqual(3);
    expect(stair.rise).toBeCloseTo(fixture.floors[1].elevation, 6);
  });

  it('declares NO roof field (RoofSpec arrives with 8.1)', () => {
    expect(fixture.roof).toBeUndefined();
    expect(fixture.floors.every((f: { roof?: unknown }) => f.roof === undefined))
      .toBe(true);
  });

  it('entity ids are unique across BOTH floors (v2 namespace)', () => {
    const ids: string[] = [
      ...fixture.floors.flatMap((fl: { id: string }) => [fl.id]),
      ...fixture.floors.flatMap((fl: { rooms: { id: string }[] }) => fl.rooms.map((r) => r.id)),
      ...fixture.floors.flatMap((fl: { openings: { id: string }[] }) => fl.openings.map((o) => o.id)),
      ...fixture.floors.flatMap((fl: { furniture: { id: string }[] }) => fl.furniture.map((f) => f.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
})

describe('demo/demo-duplex.json — AC coverage (issue #118)', () => {
  const fixture = duplex();

  it('validates NATIVELY as schema v2 (no migration involved)', () => {
    expect(validateFloorplan(fixture)).toMatchObject({ ok: true });
  });

  it('passes the DEEP geometry validation: stair gap match, containment, holes', () => {
    // The strongest fixture guarantee: the compiler's own validator
    // accepts the committed plan without any editor mediation.
    expect(() => validateGeometry(fixture)).not.toThrow();
  });

  it('ground floor is the apartment, carried verbatim through v1→v2', () => {
    // Interpretation B (ratified): demo-apartment.json stays v1 pristine;
    // the duplex's ground storey is exactly what migrate-at-the-door
    // makes of it — arrays carried by reference, nothing rewritten.
    const converted = migrate(demo()).data!;
    expect(fixture.floors[0].rooms).toEqual(converted.floors[0].rooms);
    expect(fixture.floors[0].openings).toEqual(converted.floors[0].openings);
    expect(fixture.floors[0].furniture).toEqual(converted.floors[0].furniture);
  });

  it('second storey sits at the addFloor pitch (wallHeight + 0.3)', () => {
    // The editor round-trip contract: accepting the stair tool's
    // "Add floor" offer mints this exact elevation, so the committed
    // fixture mirrors what the UI produces.
    expect(fixture.floors).toHaveLength(2);
    expect(fixture.floors[0].elevation).toBe(0);
    expect(fixture.floors[1].elevation).toBeCloseTo(fixture.wallHeight + 0.3, 9);
  });

  it('carries exactly ONE staircase, gap-matched to the upper storey', () => {
    expect(fixture.stairs).toHaveLength(1);
    const stair = fixture.stairs[0];
    expect(stair.roomId).toBe('room-kitchen');
    expect(
      fixture.floors[0].rooms.some((r: { id: string }) => r.id === stair.roomId),
    ).toBe(true);
    expect(stair.stepCount).toBeGreaterThanOrEqual(3);
    // rise == arrival − departure, exactly (the never-defaulted rule).
    expect(stair.rise).toBeCloseTo(
      fixture.floors[1].elevation - fixture.floors[0].elevation,
      9,
    );
  });

  it('the arrival slab carries a room over the landing hole', () => {
    // The upper kitchen mirrors the ground kitchen footprint, so the
    // stair's derived landing hole carves a real slab (compile-time
    // floorHole catch) rather than a void.
    const upperKitchen = fixture.floors[1].rooms.find(
      (r: { id: string }) => r.id === 'room-loft-kitchen',
    );
    expect(upperKitchen).toBeDefined();
    expect(upperKitchen.polygon).toEqual(
      fixture.floors[0].rooms.find((r: { id: string }) => r.id === 'room-kitchen')
        .polygon,
    );
  });

  it('entity ids are unique across every collection INCLUDING stairs', () => {
    const ids: string[] = [
      ...fixture.floors.flatMap((fl: { id: string }) => [fl.id]),
      ...fixture.floors.flatMap((fl: { rooms: { id: string }[] }) => fl.rooms.map((r) => r.id)),
      ...fixture.floors.flatMap((fl: { openings: { id: string }[] }) => fl.openings.map((o) => o.id)),
      ...fixture.floors.flatMap((fl: { furniture: { id: string }[] }) => fl.furniture.map((f) => f.id)),
      ...fixture.stairs.map((s: { id: string }) => s.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
