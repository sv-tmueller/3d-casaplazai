// @vitest-environment happy-dom
/**
 * Issue #144 (Pkg: First-run experience) — the demo registry and the
 * planIsEmpty predicate. Issue #178 moved the discard gate, the empty-state
 * card and the Plans menu into the workspace (kit Dialog / Menu); their
 * cases live in tests/ui/dialog-toast.spec.ts, tests/app/confirm.spec.ts
 * and tests/app/shell.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, validateFloorplan } from '../../src/shared/schema';
import { emptyPlan } from '../../src/editor/store';
import { DEMOS, demoById, loadDemoPlan } from '../../src/editor/demos';
import { planIsEmpty } from '../../src/app/panels/emptyState';
import type { FloorplanData } from '../../src/shared/schema';

/* ------------------------------- demos.ts -------------------------------- */

describe('demo registry (issue #144)', () => {
  it('registers exactly three demos with stable ids + labels', () => {
    expect(DEMOS.map((d) => d.id)).toEqual(['apartment', 'duplex', 'townhouse']);
    for (const d of DEMOS) expect(d.label.length).toBeGreaterThan(0);
  });

  it('demoById resolves every registered id and throws on unknown ids', () => {
    for (const d of DEMOS) expect(demoById(d.id)).toBe(d);
    expect(() => demoById('nope' as never)).toThrow(/unknown demo/i);
  });

  it.each(DEMOS.map((d) => [d.id] as const))(
    'loadDemoPlan(%s) normalizes to a validated v2 plan',
    (id) => {
      const plan = loadDemoPlan(id);
      expect(plan.schemaVersion).toBe(SCHEMA_VERSION);
      const res = validateFloorplan(plan);
      expect(res.ok, res.ok ? '' : JSON.stringify(res.errors)).toBe(true);
      // Every room carries an EXPLICIT floorTexture (string | null): the
      // #119 lesson — never persist a payload its own reader refuses.
      for (const floor of plan.floors) {
        for (const room of floor.rooms) {
          expect(room.floorTexture === null || typeof room.floorTexture === 'string').toBe(true);
          expect('floorTexture' in room).toBe(true);
        }
      }
    },
  );

  it('the apartment demo is a single-storey plan with rooms', () => {
    const plan = loadDemoPlan('apartment');
    expect(plan.floors.length).toBe(1);
    expect(plan.floors[0].rooms.length).toBeGreaterThanOrEqual(3);
    expect(plan.floors[0].openings.length).toBeGreaterThan(0);
  });

  it('duplex + townhouse are multi-floor plans with rooms on upper floors', () => {
    for (const id of ['duplex', 'townhouse'] as const) {
      const plan = loadDemoPlan(id);
      expect(plan.floors.length, id).toBeGreaterThanOrEqual(2);
      const upper = plan.floors.slice(1);
      expect(
        upper.some((f) => f.rooms.length > 0),
        id,
      ).toBe(true);
    }
  });

  it('returns a fresh object per call (callers may mutate freely)', () => {
    const a = loadDemoPlan('apartment');
    const b = loadDemoPlan('apartment');
    expect(a).not.toBe(b);
    a.floors[0].rooms.length = 0;
    expect(loadDemoPlan('apartment').floors[0].rooms.length).toBeGreaterThan(0);
  });
});

/* --------------------------- planIsEmpty helpers ------------------------- */

function mkRoom(id: string): FloorplanData['floors'][number]['rooms'][number] {
  return { id, name: id, polygon: [[0, 0], [2, 0], [2, 2], [0, 2]] } as FloorplanData['floors'][number]['rooms'][number];
}

function planWithRoomOn(floorIdx: number): FloorplanData {
  const plan = emptyPlan();
  while (plan.floors.length <= floorIdx) {
    plan.floors.push({
      id: `floor-${plan.floors.length}`,
      name: `Floor ${plan.floors.length}`,
      elevation: 2.7 * plan.floors.length,
      rooms: [],
      openings: [],
      furniture: [],
    });
  }
  plan.floors[floorIdx].rooms.push(mkRoom('room-1'));
  return plan;
}

describe('planIsEmpty (issue #144)', () => {
  it('is true for the empty single-floor plan', () => {
    expect(planIsEmpty(emptyPlan())).toBe(true);
  });

  it('is false when any floor carries a room', () => {
    expect(planIsEmpty(planWithRoomOn(0))).toBe(false);
    expect(planIsEmpty(planWithRoomOn(1))).toBe(false);
  });

  it('ignores furniture-only floors (rooms are the anchor for everything)', () => {
    const plan = emptyPlan();
    plan.floors[0].furniture.push({ id: 'f1' } as FloorplanData['floors'][number]['furniture'][number]);
    expect(planIsEmpty(plan)).toBe(true);
  });
});
