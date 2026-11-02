// @vitest-environment happy-dom
/**
 * Workspace shell (issue #178, design §6): top bar, tool card, inspector,
 * status bar, empty state, dialogs — all mounted against a FAKE engine,
 * proving the shell only talks to the EditorEngine interface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountShell, type PlanOps, type Shell } from '../../src/app/shell';
import { createAppState, type AppState } from '../../src/app/state';
import { SHORTCUTS } from '../../src/app/shortcuts';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import { isDialogOpen } from '../../src/ui/dialog';
import type { Room } from '../../src/shared/schema';
import { fakeEngine, type FakeEngine } from './helpers/fakeEngine';

let shell: Shell;
let engine: FakeEngine;
let app: AppState;
let store: EditorStore;
let plan: PlanOps & { calls: string[] };

const q = <T extends Element = HTMLElement>(sel: string): T => {
  const n = document.querySelector<T>(sel);
  if (!n) throw new Error(`missing ${sel}`);
  return n;
};
const tid = <T extends Element = HTMLElement>(id: string): T => q<T>(`[data-testid="${id}"]`);

function accessibleName(n: Element): string {
  const aria = n.getAttribute('aria-label');
  if (aria) return aria;
  if (n.id) {
    const label = document.querySelector(`label[for="${n.id}"]`);
    if (label?.textContent) return label.textContent;
  }
  return n.textContent ?? '';
}

const ROOM: Room = {
  id: 'r1',
  name: 'Living',
  polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
  floorTexture: 'wood',
} as Room;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  delete document.documentElement.dataset.theme;
  engine = fakeEngine();
  app = createAppState({ storage: null, search: '' });
  store = new EditorStore(emptyPlan());
  const calls: string[] = [];
  const rec = (c: string) => (): void => {
    calls.push(c);
  };
  plan = {
    calls,
    importJson: rec('importJson'),
    saveJson: rec('saveJson'),
    newPlan: rec('newPlan'),
    loadDemo: (id) => {
      calls.push(`demo:${id}`);
    },
    share: rec('share'),
  };
  shell = mountShell({ root: q('#root'), app, store, createEngine: () => engine, plan });
});

afterEach(() => shell.dispose());

describe('layout', () => {
  it('mounts the workspace anatomy into the root', () => {
    const root = q('#root');
    expect((root.firstElementChild as HTMLElement).dataset.screen).toBe('workspace');
    for (const id of ['ws-topbar', 'ws-stage', 'ws-toolcard', 'ws-statusbar', 'ws-inspector', 'ws-toasts']) {
      expect(tid(id)).toBeTruthy();
    }
    expect(q('.ws-plan-pane').contains(engine.canvas)).toBe(true);
    expect(q('canvas.viewer-gl-canvas')).toBeTruthy();
  });

  it('every registry command renders a control with an accessible name', () => {
    // Menus build their items on open.
    tid('ws-logo-menu').click();
    document.dispatchEvent(new Event('pointerdown'));
    const levelBtn = tid('ws-level-menu');
    levelBtn.click();
    const missing: string[] = [];
    for (const cmd of shell.registry.list()) {
      if (cmd.kind === 'gesture') continue;
      const controls = document.querySelectorAll(`[data-command="${cmd.id}"]`);
      if (controls.length === 0) {
        missing.push(cmd.id);
        continue;
      }
      for (const c of controls) {
        expect(accessibleName(c).trim(), `${cmd.id} has no name`).not.toBe('');
      }
    }
    expect(missing).toEqual([]);
  });

  it('reports the floating panel insets to the engine', () => {
    expect(engine.calls.some((c) => c.startsWith('insets:'))).toBe(true);
  });
});

describe('view segment', () => {
  it('reflects the current view and requests on click', () => {
    const plan3d = tid<HTMLButtonElement>('ws-view-3d');
    expect(tid('ws-view-plan').getAttribute('aria-checked')).toBe('true');
    // No viewer attached yet: 3D and Walk cannot be entered.
    expect(plan3d.getAttribute('aria-disabled')).toBe('true');
    plan3d.click();
    expect(app.get().view).toBe('plan');
  });
});

describe('tool card', () => {
  it('tool buttons follow the engine tool', () => {
    const door = q<HTMLButtonElement>('[data-command="tool.door"]');
    door.click();
    expect(engine.tool()).toBe('door');
    expect(door.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-command="tool.select"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the furniture pieces only while the Furniture tool is armed', () => {
    const section = tid('ws-furniture');
    expect(section.hidden).toBe(true);
    q<HTMLButtonElement>('[data-command="tool.stamp"]').click();
    expect(section.hidden).toBe(false);
    const sofa = q<HTMLButtonElement>('[data-command="furniture.arm"][data-arg="sofa"]');
    sofa.click();
    expect(engine.armedFurniture()).toBe('sofa');
    expect(sofa.getAttribute('aria-pressed')).toBe('true');
  });

  it('switches tabs and remembers the tab in app state', () => {
    q<HTMLButtonElement>('[data-tab="view"]').click();
    expect(app.get().tab).toBe('view');
    app.set({ tab: 'measure' });
    expect(q('[data-tab="measure"]').getAttribute('aria-selected')).toBe('true');
  });

  it('S opens the Build tab Snapping section without moving focus mid-gesture', () => {
    app.set({ tab: 'view' });
    engine.canvas.tabIndex = 0;
    engine.canvas.focus();
    engine.busy = true;
    shell.registry.run('snap.open');
    expect(app.get().tab).toBe('build');
    expect(app.get().snapOpen).toBe(true);
    expect(tid('ws-snap-body').hidden).toBe(false);
    expect(document.activeElement).toBe(engine.canvas);
  });

  it('snap pitch and master controls write engine snap settings', () => {
    q<HTMLButtonElement>('[data-testid="ws-snap-pitch-1"]').click();
    expect(engine.snapSettings().pitch).toBe(1);
    q<HTMLButtonElement>('[data-command="snap.master"]').click();
    expect(engine.snapSettings().master).toBe(false);
  });

  it('View tab toggles drive the engine overlays and the viewer settings', () => {
    q<HTMLButtonElement>('[data-command="view.dimensions"]').click();
    expect(engine.dimensionsVisible()).toBe(false);
    q<HTMLButtonElement>('[data-command="view.grid"]').click();
    expect(engine.gridVisible()).toBe(false);
    q<HTMLButtonElement>('[data-command="viewer.roofs"]').click();
    expect(app.get().viewer.roofs).toBe(false);
    const sun = q<HTMLInputElement>('input[data-command="sun.time"]');
    sun.value = '18';
    sun.dispatchEvent(new Event('input', { bubbles: true }));
    expect(app.get().viewer.sun.timeHours).toBe(18);
    expect(tid('ws-sun-time-chip').textContent).toBe('18:00');
  });

  it('the Measure tab lists measurements from the engine', () => {
    engine.measureList = [{ id: 'm1', a: [0, 0], b: [3, 4], floorIdx: 0 } as never];
    engine.emit('measurements', { items: engine.measureList });
    const rows = document.querySelectorAll('[data-testid="ws-measure-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('5.00');
  });
});

describe('inspector', () => {
  it('appears while something is selected and hides when nothing is', () => {
    const insp = tid('ws-inspector');
    expect(insp.hidden).toBe(true);
    engine.emit('selection', { descriptor: { kind: 'room', room: ROOM } });
    expect(insp.hidden).toBe(false);
    expect(app.get().inspectorOpen).toBe(true);
    expect(engine.calls).toContain('inspectorVisible:true');
    engine.emit('selection', { descriptor: { kind: 'none', floor: store.getState().data.floors[0] } });
    expect(insp.hidden).toBe(true);
  });

  it('I toggles it, Escape inside closes it', () => {
    shell.registry.run('inspector.toggle');
    const insp = tid('ws-inspector');
    expect(insp.hidden).toBe(false);
    insp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(insp.hidden).toBe(true);
  });
});

describe('status bar', () => {
  it('shows the armed tool hint from boot', () => {
    expect(tid('ws-status-hint').textContent).toBe('Press ? for keyboard shortcuts.');
  });

  it('shows the hint, the cursor, the zoom and the area total', () => {
    engine.emit('hint', { text: 'Drag to draw a rectangular room.' });
    expect(tid('ws-status-hint').textContent).toBe('Drag to draw a rectangular room.');
    engine.emit('cursor', { world: [4.5, 2] });
    expect(tid('ws-status-cursor').textContent).toBe('x 4.50  y 2.00');
    engine.emit('cursor', { world: null });
    expect(tid('ws-status-cursor').textContent).toBe('');
    engine.emit('zoom', { percent: 150 });
    expect(tid('ws-status-zoom').textContent).toBe('150 %');
    expect(tid('ws-status-total').textContent).toContain('0.0');
  });

  it('flags overlaps', () => {
    engine.emit('overlaps', { count: 1 });
    expect(tid('ws-overlap').hidden).toBe(false);
    engine.emit('overlaps', { count: 0 });
    expect(tid('ws-overlap').hidden).toBe(true);
  });
});

describe('top bar', () => {
  it('edits the project name into app state', () => {
    const input = tid<HTMLInputElement>('ws-project-name');
    expect(input.value).toBe('Untitled plan');
    input.value = 'Flat 4B';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(app.get().projectName).toBe('Flat 4B');
  });

  it('shows the unsaved dot while the store is dirty', () => {
    const dot = tid('ws-unsaved');
    expect(dot.hidden).toBe(true);
    store.dirty = true;
    shell.refresh();
    expect(dot.hidden).toBe(false);
    store.markSaved();
    shell.refresh();
    expect(dot.hidden).toBe(true);
  });

  it('names the active level and routes the logo menu to plan ops', () => {
    expect(tid('ws-level-menu').textContent).toContain('Level 1');
    tid('ws-logo-menu').click();
    q<HTMLButtonElement>('[data-command="file.demo"][data-arg="duplex"]').click();
    expect(plan.calls).toEqual(['demo:duplex']);
  });

  it('the theme toggle mirrors onto <html> and the canvas palette', () => {
    q<HTMLButtonElement>('[data-command="theme.toggle"]').click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(engine.calls).toContain('theme:dark');
  });
});

describe('messages and dialogs', () => {
  it('engine messages become toasts; assertive ones are errors', () => {
    engine.emit('message', { text: 'Move closer to a wall.', level: 'assertive' });
    const t = q('[data-testid="ws-toast"]');
    expect(t.textContent).toContain('Move closer to a wall.');
    expect(t.getAttribute('role')).toBe('alert');
  });

  it('the shortcuts dialog lists every registry row', () => {
    shell.registry.run('help.shortcuts');
    const dlg = tid('ws-shortcuts');
    const rows = dlg.querySelectorAll('tbody tr:not(.ws-shortcuts-group)');
    expect(rows).toHaveLength(SHORTCUTS.length);
    expect(isDialogOpen()).toBe(true);
    dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isDialogOpen()).toBe(false);
  });

  it('the export dialog exports with the chosen format and scale', async () => {
    shell.registry.run('file.export');
    tid<HTMLButtonElement>('ws-export-format-jpeg').click();
    tid<HTMLButtonElement>('ws-export-scale-3').click();
    tid<HTMLButtonElement>('ws-export-confirm').click();
    await vi.waitFor(() => expect(engine.calls).toContain('export:jpeg:3'));
  });
});

describe('empty state', () => {
  it('shows on an empty plan; Draw a room arms Rectangle and hides it', () => {
    const card = tid('ws-empty');
    expect(card.hidden).toBe(false);
    tid<HTMLButtonElement>('ws-empty-draw').click();
    expect(engine.tool()).toBe('rectangle');
    expect(card.hidden).toBe(true);
  });

  it('offers the demos and routes them through plan ops', () => {
    tid<HTMLButtonElement>('ws-empty-demo').click();
    expect(tid('ws-empty-demo-row').hidden).toBe(false);
    tid<HTMLButtonElement>('ws-empty-demo-apartment').click();
    expect(plan.calls).toContain('demo:apartment');
  });
});
