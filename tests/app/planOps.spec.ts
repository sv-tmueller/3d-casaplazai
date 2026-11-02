// @vitest-environment happy-dom
/**
 * Plan operations (issue #178; ports the #144 first-run swaps and the
 * #91 share/JSON transfer out of the canvas engine). Every wholesale
 * swap persists synchronously, clears the walk pose (G4) and fits the
 * plan (G14); New plan also clears underlays and measurements.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlanOps } from '../../src/app/planOps';
import { AUTOSAVE_KEY, AutosaveManager } from '../../src/editor/autosave';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import { loadDemoPlan } from '../../src/editor/demos';
import { fakeEngine, type FakeEngine } from './helpers/fakeEngine';

let store: EditorStore;
let engine: FakeEngine;
let notes: Array<[string, string | undefined]>;
let replaced: number;
let confirmAnswer: boolean;
let confirms: number;
let ops: ReturnType<typeof createPlanOps>;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  store = new EditorStore(emptyPlan());
  engine = fakeEngine();
  notes = [];
  replaced = 0;
  confirmAnswer = true;
  confirms = 0;
  ops = createPlanOps({
    store,
    autosave: new AutosaveManager(localStorage),
    engine: () => engine,
    notify: (t, v) => notes.push([t, v]),
    onPlanReplaced: () => {
      replaced += 1;
    },
    confirm: async () => {
      confirms += 1;
      return confirmAnswer;
    },
  });
});

const rooms = () => store.getState().data.floors.reduce((n, f) => n + f.rooms.length, 0);

describe('demo and new plan', () => {
  it('loads a demo onto an empty plan without asking, persists and fits', async () => {
    await ops.loadDemo('apartment');
    expect(confirms).toBe(0);
    expect(rooms()).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).floors[0].rooms.length).toBeGreaterThan(0);
    expect(engine.calls).toContain('fitPlan');
    expect(replaced).toBe(1);
    expect(notes.at(-1)?.[0]).toBe('Loaded the Apartment demo.');
  });

  it('asks before replacing a non-empty plan; a refusal keeps it', async () => {
    store.replaceAll(loadDemoPlan('duplex'));
    const before = rooms();
    confirmAnswer = false;
    await ops.loadDemo('townhouse');
    expect(confirms).toBe(1);
    expect(rooms()).toBe(before);
    expect(replaced).toBe(0);
  });

  it('New plan resets to an empty plan and clears underlays and measurements', async () => {
    store.replaceAll(loadDemoPlan('apartment'));
    await ops.newPlan();
    expect(rooms()).toBe(0);
    expect(engine.calls).toContain('reset:true:true');
    expect(notes.at(-1)?.[0]).toBe('Started a new plan.');
  });
});

describe('JSON import', () => {
  const file = (text: string, name = 'plan.json') => new File([text], name, { type: 'application/json' });

  it('imports a valid plan file', async () => {
    await ops.importFile(file(JSON.stringify(loadDemoPlan('apartment')), 'flat.json'));
    expect(rooms()).toBeGreaterThan(0);
    expect(notes.at(-1)?.[0]).toBe('Imported “flat.json”.');
    expect(engine.calls).toContain('fitPlan');
  });

  it('rejects broken JSON and leaves the store untouched', async () => {
    store.replaceAll(loadDemoPlan('apartment'));
    const before = rooms();
    await ops.importFile(file('{nope'));
    expect(rooms()).toBe(before);
    expect(notes.at(-1)).toEqual(['Not a valid JSON file.', 'error']);
  });

  it('rejects an invalid plan with the validator message', async () => {
    await ops.importFile(file(JSON.stringify({ schemaVersion: 2, floors: 'x' })));
    expect(notes.at(-1)?.[1]).toBe('error');
    expect(rooms()).toBe(0);
  });
});

describe('save JSON', () => {
  it('downloads the live plan as pretty JSON', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    ops.saveJson();
    expect(click).toHaveBeenCalledTimes(1);
    expect(notes.at(-1)?.[0]).toBe('Plan exported as JSON.');
    click.mockRestore();
  });
});

describe('share', () => {
  it('copies a workspace 3D link carrying the plan fragment', async () => {
    store.replaceAll(loadDemoPlan('apartment'));
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t: string) => void (copied = t) },
    });
    await ops.share();
    expect(copied).toMatch(/\/\?view=3d#plan=v1\./);
    expect(notes.at(-1)?.[0]).toBe('Share link copied to clipboard.');
  });
});
