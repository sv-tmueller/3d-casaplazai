// @vitest-environment happy-dom
/**
 * Issue #144 (Pkg: First-run experience) — unit coverage for the four new
 * editor modules:
 *
 *   1. src/editor/demos.ts        — demo registry + lazy normalization
 *   2. src/editor/confirmDialog.ts — modal discard gate
 *   3. src/editor/emptyStateCard.ts — planIsEmpty predicate + prefilled card
 *   4. src/editor/planMenu.ts      — floating "Plans" button + popover
 *
 * DOM-free assertions live where they can (planIsEmpty, demo normalization);
 * the interactive bits run under happy-dom.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, validateFloorplan } from '../../src/shared/schema';
import { emptyPlan } from '../../src/editor/store';
import { DEMOS, demoById, loadDemoPlan } from '../../src/editor/demos';
import { CONFIRM_MSG, confirmDialog, isConfirmDialogOpen } from '../../src/editor/confirmDialog';
import { mountEmptyStateCard, planIsEmpty } from '../../src/editor/emptyStateCard';
import type { FloorplanData } from '../../src/shared/schema';
import { mountPlanMenu } from '../../src/editor/planMenu';

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

/* ---------------------------- confirmDialog.ts --------------------------- */

describe('confirmDialog (issue #144)', () => {
  it('CONFIRM_MSG names the Save JSON lifeline (the issue AC)', () => {
    expect(CONFIRM_MSG).toMatch(/Save JSON/);
    expect(CONFIRM_MSG).toMatch(/Replace the current plan\?/);
  });

  it('renders the title + message and focuses Cancel on open', async () => {
    const p = confirmDialog({ title: 'Replace the current plan?', message: CONFIRM_MSG });
    expect(isConfirmDialogOpen()).toBe(true);
    expect(
      document.querySelector('[data-testid="confirm-message"]')?.textContent,
    ).toBe(CONFIRM_MSG);
    const cancel = document.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]');
    expect(document.activeElement).toBe(cancel);
    cancel?.click();
    await expect(p).resolves.toBe(false);
  });

  it('Escape resolves false and unmounts the dialog', async () => {
    const p = confirmDialog({ title: 'T', message: 'M' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(p).resolves.toBe(false);
    expect(isConfirmDialogOpen()).toBe(false);
    expect(document.querySelector('[data-testid="confirm-backdrop"]')).toBeNull();
  });

  it('Cancel resolves false, Confirm resolves true', async () => {
    const a = confirmDialog({ title: 'T', message: 'M' });
    document.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')?.click();
    await expect(a).resolves.toBe(false);

    const b = confirmDialog({ title: 'T', message: 'M' });
    document.querySelector<HTMLButtonElement>('[data-testid="confirm-confirm"]')?.click();
    await expect(b).resolves.toBe(true);
    expect(document.querySelector('[data-testid="confirm-backdrop"]')).toBeNull();
  });

  it('confines Tab to Cancel <-> Confirm (wraps both ways)', async () => {
    const p = confirmDialog({ title: 'T', message: 'M' });
    const cancel = document.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!;
    const confirm = document.querySelector<HTMLButtonElement>('[data-testid="confirm-confirm"]')!;
    expect(document.activeElement).toBe(cancel);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(confirm);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(cancel);
    cancel.click();
    await expect(p).resolves.toBe(false);
  });

  it('a second call while open cancels the first (no orphaned promise)', async () => {
    const first = confirmDialog({ title: 'T', message: 'M' });
    const second = confirmDialog({ title: 'T', message: 'M' });
    await expect(first).resolves.toBe(false);
    expect(document.querySelectorAll('[data-testid="confirm-backdrop"]').length).toBe(1);
    document.querySelector<HTMLButtonElement>('[data-testid="confirm-confirm"]')?.click();
    await expect(second).resolves.toBe(true);
  });
});

/* --------------------------- emptyStateCard.ts --------------------------- */

/** Room-shaped stub: the predicate only reads `.rooms.length`. */
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

describe('emptyStateCard mount (issue #144)', () => {
  type Actions = Parameters<typeof mountEmptyStateCard>[1];
  function mountSpy(): { card: ReturnType<typeof mountEmptyStateCard>; calls: string[]; host: HTMLDivElement } {
    const calls: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const actions: Actions = {
      onDrawRoom: () => calls.push('draw'),
      onLoadDemo: (id) => calls.push(`demo:${id}`),
      onImportJson: () => calls.push('import'),
    };
    return { card: mountEmptyStateCard(host, actions), calls, host };
  }

  it('is visible by default and toggles idempotently via update()', () => {
    const { card } = mountSpy();
    expect(card.root.hidden).toBe(false);
    card.update(false);
    expect(card.root.hidden).toBe(true);
    card.update(false);
    expect(card.root.hidden).toBe(true);
    card.update(true);
    expect(card.root.hidden).toBe(false);
  });

  it('"Draw a room" fires onDrawRoom', () => {
    const { calls } = mountSpy();
    document.querySelector<HTMLButtonElement>('[data-testid="empty-draw-room"]')?.click();
    expect(calls).toEqual(['draw']);
  });

  it('"Load a demo plan" reveals one button per registry demo; each fires onLoadDemo(id)', () => {
    const { calls } = mountSpy();
    const row = document.querySelector<HTMLDivElement>('[data-testid="empty-demo-row"]');
    expect(row?.hidden).toBe(true);
    const reveal = document.querySelector<HTMLButtonElement>('[data-testid="empty-load-demo"]')!;
    reveal.click();
    expect(row?.hidden).toBe(false);
    expect(reveal.getAttribute('aria-expanded')).toBe('true');
    for (const demo of DEMOS) {
      const btn = document.querySelector<HTMLButtonElement>(`[data-testid="empty-demo-${demo.id}"]`);
      expect(btn, demo.id).not.toBeNull();
      btn!.click();
    }
    expect(calls).toEqual(DEMOS.map((d) => `demo:${d.id}`));
  });

  it('"Load a JSON file" fires onImportJson (forwards to the hidden import input)', () => {
    const { calls } = mountSpy();
    document.querySelector<HTMLButtonElement>('[data-testid="empty-import"]')?.click();
    expect(calls).toEqual(['import']);
  });
});

/* ------------------------------ planMenu.ts ------------------------------ */

describe('planMenu mount (issue #144)', () => {
  type MenuActions = Parameters<typeof mountPlanMenu>[1];
  function mountSpy(): {
    menu: ReturnType<typeof mountPlanMenu>;
    calls: string[];
    btn: HTMLButtonElement;
    popover: HTMLDivElement;
  } {
    const calls: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const actions: MenuActions = {
      onNewPlan: () => calls.push('new'),
      onLoadDemo: (id) => calls.push(`demo:${id}`),
    };
    const menu = mountPlanMenu(host, actions);
    return {
      menu,
      calls,
      btn: document.querySelector<HTMLButtonElement>('[data-testid="plans-button"]')!,
      popover: document.querySelector<HTMLDivElement>('[data-testid="plans-popover"]')!,
    };
  }

  it('starts closed and toggles via the Plans button (aria-expanded follows)', () => {
    const { btn, popover } = mountSpy();
    expect(popover.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(popover.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click();
    expect(popover.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('setOpen() drives hidden + aria-expanded directly', () => {
    const { menu, btn, popover } = mountSpy();
    menu.setOpen(true);
    expect(popover.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    menu.setOpen(false);
    expect(popover.hidden).toBe(true);
  });

  it('offers New plan + one item per demo; clicking fires the action and closes', () => {
    const { calls, btn, popover } = mountSpy();
    btn.click();
    document.querySelector<HTMLButtonElement>('[data-testid="plan-new"]')?.click();
    expect(calls).toEqual(['new']);
    expect(popover.hidden).toBe(true);

    btn.click();
    for (const demo of DEMOS) {
      const item = document.querySelector<HTMLButtonElement>(`[data-testid="plan-demo-${demo.id}"]`);
      expect(item, demo.id).not.toBeNull();
      item!.click();
      expect(popover.hidden).toBe(true);
      btn.click();
    }
    expect(calls).toEqual(['new', ...DEMOS.map((d) => `demo:${d.id}`)]);
  });

  it('closes on an outside pointerdown but not on one inside the menu', () => {
    const { btn, popover, menu } = mountSpy();
    btn.click();
    menu.root.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(popover.hidden).toBe(false);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(popover.hidden).toBe(true);
  });

  it('closes on Escape', () => {
    const { btn, popover } = mountSpy();
    btn.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(popover.hidden).toBe(true);
  });
});

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  document.body.innerHTML = '';
});
