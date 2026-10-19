
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FurnitureType } from '../../src/shared/schema';
import { migrate, validateFloorplan } from '../../src/shared/schema';

const demo = (): ReturnType<typeof JSON.parse> =>
  JSON.parse(readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8'));

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
