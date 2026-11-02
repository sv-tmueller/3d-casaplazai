// @vitest-environment happy-dom
/**
 * Command registry + keyboard dispatcher (issue #178, design §8.2, gaps
 * G1 / G15 and lead ruling C1). Every user action is a command; the
 * dispatcher scopes keys by view, ignores fields and Alt/Ctrl/Meta
 * chords it does not bind, does nothing while a Dialog is open, and
 * swallows keys mid-gesture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommands, type CommandDeps, type ShellActions } from '../../src/app/commands';
import { installKeyboard } from '../../src/app/keyboard';
import { SHORTCUTS, shortcutRows } from '../../src/app/shortcuts';
import { createAppState, type ViewId } from '../../src/app/state';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import { openDialog } from '../../src/ui/dialog';
import { fakeEngine, type FakeEngine } from './helpers/fakeEngine';

function actions(): ShellActions & { calls: string[] } {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(args.length ? `${name}:${args.join(',')}` : name);
    };
  return {
    calls,
    requestView: (v: ViewId) => {
      calls.push(`view:${v}`);
      return true;
    },
    canEnterView: () => true,
    openShortcuts: rec('shortcuts'),
    openExport: rec('export'),
    openSnapping: rec('snapping'),
    openLean: rec('lean'),
    toggleInspector: rec('inspector'),
    importJson: rec('importJson'),
    saveJson: rec('saveJson'),
    newPlan: rec('newPlan'),
    loadDemo: rec('demo'),
    share: rec('share'),
    toggleFullscreen: rec('fullscreen'),
    isFullscreen: () => false,
    addFloor: rec('addFloor'),
    renameFloor: rec('renameFloor'),
    deleteFloor: rec('deleteFloor'),
    gotoRoom: rec('gotoRoom'),
    importUnderlay: rec('importUnderlay'),
    toast: rec('toast'),
  };
}

let engine: FakeEngine;
let deps: CommandDeps;
let acts: ReturnType<typeof actions>;
let dispose: () => void;

function setup(view: ViewId = 'plan') {
  document.body.innerHTML = '<canvas tabindex="0"></canvas><input id="field">';
  engine = fakeEngine();
  acts = actions();
  const app = createAppState({ storage: null, search: '' });
  app.set({ view });
  const store = new EditorStore(emptyPlan());
  deps = { app, engine, store, actions: acts };
  const registry = createCommands(deps);
  dispose = installKeyboard({ registry, view: () => app.get().view, gestureInProgress: () => engine.busy });
  return { app, store, registry };
}

function press(key: string, init: KeyboardEventInit = {}, target: Element = document.body): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

afterEach(() => dispose?.());

describe('shortcut rows (README + cheat sheet source)', () => {
  it('derives every row from the registry with the gesture rows kept', () => {
    const keys = SHORTCUTS.map((s) => s.keys);
    for (const k of ['Esc', 'Enter', 'Space (hold)', 'Drag on empty space', 'Alt+Drag / Middle-Drag', 'Wheel']) {
      expect(keys).toContain(k);
    }
    expect(SHORTCUTS.filter((s) => s.action === 'Redo').map((s) => s.keys)).toEqual(['Ctrl+Shift+Z', 'Ctrl+Y']);
    expect(shortcutRows()[0]).toEqual(['?', 'Show keyboard shortcuts']);
  });

  it('retires the 3D inset: 1 to 3 switch views (lead ruling C1)', () => {
    const byKey = Object.fromEntries(SHORTCUTS.map((s) => [s.keys, s.action]));
    expect(byKey['1']).toBe('Switch to the Plan view');
    expect(byKey['2']).toBe('Switch to the 3D view');
    expect(byKey['3']).toBe('Switch to the Walk view');
    expect(SHORTCUTS.some((s) => /inset/i.test(s.action))).toBe(false);
    expect(byKey.S).toMatch(/Snapping section/);
    expect(SHORTCUTS.some((s) => /popover/i.test(s.action))).toBe(false);
  });
});

describe('keyboard dispatcher', () => {
  beforeEach(() => setup());

  it('V R P D W F T M arm their tools', () => {
    const map: Record<string, string> = {
      v: 'select', r: 'rectangle', p: 'polygon', d: 'door', w: 'window', f: 'stamp', t: 'stairs', m: 'measure',
    };
    for (const [k, t] of Object.entries(map)) {
      const ev = press(k);
      expect(engine.tool()).toBe(t);
      expect(ev.defaultPrevented).toBe(true);
    }
    press('V', { shiftKey: true });
    expect(engine.tool()).toBe('select');
  });

  it('R rotates a selected furniture piece instead of arming Rectangle', () => {
    engine.furnitureSelected = true;
    press('r');
    expect(engine.calls).toContain('rotateFurniture');
    expect(engine.tool()).toBe('select');
  });

  it('ignores keys typed into fields and Alt/Meta chords', () => {
    press('d', {}, document.getElementById('field')!);
    press('d', { altKey: true });
    press('d', { metaKey: true });
    press('d', { ctrlKey: true });
    expect(engine.tool()).toBe('select');
  });

  it('swallows hotkeys mid-gesture', () => {
    engine.busy = true;
    const ev = press('d');
    expect(engine.tool()).toBe('select');
    expect(ev.defaultPrevented).toBe(false);
    engine.busy = false;
    press('d');
    expect(engine.tool()).toBe('door');
  });

  it('does nothing while a dialog is open', async () => {
    const dlg = openDialog({ title: 'x', body: 'y', actions: [{ label: 'OK', value: 1 }] });
    press('d');
    expect(engine.tool()).toBe('select');
    dlg.close(null);
    await dlg.result;
    press('d');
    expect(engine.tool()).toBe('door');
  });

  it('Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y drive history', () => {
    const undo = vi.spyOn(deps.store, 'undo');
    const redo = vi.spyOn(deps.store, 'redo');
    vi.spyOn(deps.store, 'canUndo').mockReturnValue(true);
    vi.spyOn(deps.store, 'canRedo').mockReturnValue(true);
    press('z', { ctrlKey: true });
    press('Z', { ctrlKey: true, shiftKey: true });
    press('y', { metaKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('1 2 3 request the views; ? opens the cheat sheet', () => {
    press('2');
    press('3');
    press('1');
    expect(acts.calls.filter((c) => c.startsWith('view:'))).toEqual(['view:3d', 'view:walk', 'view:plan']);
    press('?', { shiftKey: true });
    expect(acts.calls).toContain('shortcuts');
  });

  it('S opens the Snapping section; L the lean section; I toggles the inspector', () => {
    press('s');
    expect(acts.calls).toContain('snapping');
    engine.roomSelected = true;
    press('l');
    expect(acts.calls).toContain('lean');
    press('i');
    expect(acts.calls).toContain('inspector');
  });

  it('L without a room asks for one instead of opening anything', () => {
    press('l');
    expect(acts.calls).not.toContain('lean');
    expect(acts.calls.some((c) => c.startsWith('toast:'))).toBe(true);
  });

  it('C toggles place camera; [ ] PageUp PageDown switch floors; 0 fits', () => {
    press('c');
    expect(engine.placeCameraArmed()).toBe(true);
    // Three floors with the middle one active: both directions enabled.
    deps.store.dispatch({ type: 'addFloor' });
    deps.store.dispatch({ type: 'addFloor' });
    deps.store.dispatch({ type: 'setActiveFloor', index: 1 });
    press('[');
    press(']');
    press('PageUp');
    press('PageDown');
    expect(engine.calls.filter((c) => c.startsWith('switchFloor'))).toEqual([
      'switchFloor:-1', 'switchFloor:1', 'switchFloor:-1', 'switchFloor:1',
    ]);
    press('0');
    expect(engine.calls).toContain('fitPlan');
    press('0', { ctrlKey: true });
    expect(engine.calls.filter((c) => c === 'fitPlan')).toHaveLength(1);
  });

  it('Delete and Backspace delete a deletable selection only', () => {
    press('Delete');
    expect(engine.calls).not.toContain('deleteSelection');
    engine.deletable = true;
    press('Backspace');
    expect(engine.calls).toContain('deleteSelection');
  });
});

describe('view scoping (gap G1)', () => {
  it('plan-only keys are inert in the Walk view, view keys stay live', () => {
    setup('walk');
    for (const k of ['w', 'a', 's', 'd', 'c', 'v', 'r', '0', 'Delete', '[']) press(k);
    expect(engine.tool()).toBe('select');
    expect(engine.calls.filter((c) => !c.startsWith('insets'))).toEqual([]);
    expect(acts.calls).toEqual([]);
    press('1');
    expect(acts.calls).toEqual(['view:plan']);
  });

  it('the 3D view keeps history and help but not tools', () => {
    setup('3d');
    press('d');
    expect(engine.tool()).toBe('select');
    press('?');
    expect(acts.calls).toContain('shortcuts');
  });
});

describe('registry shape', () => {
  it('every command has an id, a label, and a unique id', () => {
    const { registry } = setup();
    const ids = registry.list().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of registry.list()) expect(c.label.trim().length).toBeGreaterThan(0);
  });

  it('tool commands report pressed state from the engine', () => {
    const { registry } = setup();
    expect(registry.get('tool.select').pressed?.()).toBe(true);
    registry.run('tool.door');
    expect(registry.get('tool.door').pressed?.()).toBe(true);
    expect(registry.get('tool.select').pressed?.()).toBe(false);
  });

  it('view commands are pressed for the current view', () => {
    const { registry, app } = setup('3d');
    expect(registry.get('view.3d').pressed?.()).toBe(true);
    expect(app.get().view).toBe('3d');
    expect(registry.get('view.plan').pressed?.()).toBe(false);
  });

  it('runs arg commands (furniture, demo, viewer settings)', () => {
    const { registry, app } = setup();
    registry.run('furniture.arm', 'sofa');
    expect(engine.armedFurniture()).toBe('sofa');
    expect(engine.tool()).toBe('stamp');
    registry.run('file.demo', 'duplex');
    expect(acts.calls).toContain('demo:duplex');
    registry.run('viewer.ceilings', 'on');
    registry.run('viewer.quality', 'low');
    registry.run('viewer.wallsAlpha', 0.5);
    registry.run('viewer.roofs');
    registry.run('sun.time', 18);
    registry.run('sun.north', 30);
    expect(app.get().viewer).toEqual({
      roofs: false,
      ceilings: 'on',
      wallsAlpha: 0.5,
      quality: 'low',
      sun: { timeHours: 18, northOffsetDeg: 30 },
    });
  });

  it('theme.toggle flips the app theme', () => {
    const { registry, app } = setup();
    registry.run('theme.toggle');
    expect(app.get().theme).toBe('dark');
  });
});
