// @vitest-environment happy-dom
/**
 * View switching (issue #178, design §6.1 / §8.5, gaps G1 / G3 / G4 /
 * G6 / G15, ruling C3) against a fake 3D engine port: the segment shows
 * the current view, keys 1 to 3 switch, Walk needs something to walk in,
 * the Plan engine only takes input in the Plan view, place camera seats
 * Walk without the pointer lock, and the viewer reads AppState settings.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountShell, type PlanOps, type Shell, type ViewerPort, type ViewerSink } from '../../src/app/shell';
import { createAppState, type AppState } from '../../src/app/state';
import { EditorStore, emptyPlan } from '../../src/editor/store';
import { publishPose, resetWalkerLink, type WalkerPose } from '../../src/shared/walkerLink';
import { fakeEngine, type FakeEngine } from './helpers/fakeEngine';

interface FakeViewer extends ViewerPort {
  calls: string[];
  walkable: boolean;
  isBusy: boolean;
  lastPose: WalkerPose | null | undefined;
  sink: ViewerSink;
}

let shell: Shell;
let engine: FakeEngine;
let app: AppState;
let viewer: FakeViewer;

const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const press = (key: string) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

function mount(search = ''): void {
  document.body.innerHTML = '<div id="root"></div>';
  engine = fakeEngine();
  app = createAppState({ storage: null, search });
  const plan: PlanOps = { importJson() {}, saveJson() {}, newPlan() {}, loadDemo() {}, share() {} };
  shell = mountShell({
    root: document.getElementById('root')!,
    app,
    store: new EditorStore(emptyPlan()),
    createEngine: () => engine,
    plan,
    createViewer: (_canvas, sink) => {
      viewer = {
        calls: [],
        walkable: true,
        isBusy: false,
        lastPose: undefined,
        sink,
        setActive(a) {
          viewer.calls.push(`active:${a}`);
        },
        requestMode(mode, opts) {
          viewer.calls.push(`mode:${mode}:${opts?.autoLock ?? true}`);
          viewer.lastPose = opts?.pose;
          return mode === 'overview' || viewer.walkable;
        },
        canWalk: () => viewer.walkable,
        busy: () => viewer.isBusy,
        gotoRoom(id) {
          viewer.calls.push(`goto:${id}`);
        },
        applySettings(s) {
          viewer.calls.push(`settings:${s.quality}:${s.roofs}`);
        },
        dispose() {
          viewer.calls.push('dispose');
        },
      };
      return viewer;
    },
  });
}

beforeEach(() => {
  resetWalkerLink();
  mount();
});
afterEach(() => shell.dispose());

describe('view segment and keys', () => {
  it('2 shows the 3D view: canvases swap, the plan engine stops taking keys', () => {
    press('2');
    expect(app.get().view).toBe('3d');
    expect(tid('ws-view-3d').getAttribute('aria-checked')).toBe('true');
    expect(tid('ws-plan').hidden).toBe(true);
    expect(tid('ws-3d').hidden).toBe(false);
    expect(engine.calls).toContain('input:false');
    expect(viewer.calls).toEqual(['active:true', 'mode:overview:true']);
    press('1');
    expect(app.get().view).toBe('plan');
    expect(tid('ws-plan').hidden).toBe(false);
    expect(engine.calls.at(-1)).not.toBe('input:false');
    expect(viewer.calls.slice(-1)).toEqual(['active:false']);
  });

  it('3 walks with the pointer lock and the parked pose', () => {
    const parked: WalkerPose = { x: 1, y: 2, yawRad: 0, floorIdx: 0, mode: 'overview' };
    publishPose(parked);
    press('3');
    expect(app.get().view).toBe('walk');
    expect(viewer.calls.at(-1)).toBe('mode:walk:true');
    expect(viewer.lastPose).toEqual(parked);
  });

  it('refuses Walk while there is nothing to walk in and says why', () => {
    viewer.walkable = false;
    shell.refresh();
    expect(tid('ws-view-walk').getAttribute('aria-disabled')).toBe('true');
    expect(shell.requestView('walk')).toBe(false);
    expect(app.get().view).toBe('plan');
  });

  it('re-renders the segment when the viewer reports walkability changes', () => {
    viewer.walkable = false;
    shell.refresh();
    expect(tid('ws-view-walk').getAttribute('aria-disabled')).toBe('true');
    viewer.walkable = true;
    viewer.sink.availabilityChanged();
    expect(tid('ws-view-walk').hasAttribute('aria-disabled')).toBe(false);
  });

  it('refuses a switch while the 3D engine is mid-transition (G3)', () => {
    press('2');
    viewer.isBusy = true;
    expect(shell.requestView('walk')).toBe(false);
    expect(app.get().view).toBe('3d');
  });

  it('the viewer leaving walk on its own updates the segment', () => {
    press('3');
    viewer.sink.modeChanged('overview');
    expect(app.get().view).toBe('3d');
    expect(tid('ws-view-3d').getAttribute('aria-checked')).toBe('true');
  });

  it('boots straight into 3D from ?view=3d (the /viewer redirect)', () => {
    shell.dispose();
    mount('?view=3d');
    expect(app.get().view).toBe('3d');
    expect(viewer.calls).toEqual(['active:true', 'mode:overview:true']);
  });
});

describe('place camera (G15) and go to room', () => {
  it('a placed walker seats Walk without the pointer lock, from that pose', () => {
    const pose: WalkerPose = { x: 3, y: 1, yawRad: 0.5, floorIdx: 0, mode: 'walk' };
    engine.emit('walkerPlaced', { pose, roomName: 'Living' });
    expect(app.get().view).toBe('walk');
    expect(app.get().walkPose).toEqual(pose);
    expect(viewer.calls.at(-1)).toBe('mode:walk:false');
    expect(viewer.lastPose).toEqual(pose);
  });

  it('the room pill menu routes through walk.gotoRoom', () => {
    press('3');
    shell.registry.run('walk.gotoRoom', 'kitchen');
    expect(viewer.calls.at(-1)).toBe('goto:kitchen');
  });
});

describe('viewer settings from AppState', () => {
  it('View tab changes reach the 3D engine', () => {
    shell.registry.run('viewer.quality', 'low');
    expect(viewer.calls.at(-1)).toBe('settings:low:true');
    shell.registry.run('viewer.roofs');
    expect(viewer.calls.at(-1)).toBe('settings:low:false');
  });
});

describe('ViewerSink', () => {
  it('drives the walk overlay and the 3D empty card', () => {
    press('3');
    viewer.sink.walkAffordances({ overlay: true, reticle: false });
    viewer.sink.hint('WASD to move · Esc to release');
    viewer.sink.roomReadout('Kitchen');
    viewer.sink.emptyState(true);
    expect(tid('ws-walk-prompt').hidden).toBe(false);
    expect(tid('ws-walk-reticle').hidden).toBe(true);
    expect(tid('ws-walk-hint').textContent).toBe('WASD to move · Esc to release');
    expect(tid('ws-walk-pill').getAttribute('aria-label')).toBe('Go to room: Kitchen');
    expect(tid('ws-3d-empty').hidden).toBe(false);
    viewer.sink.toast('Recompile failed', 'error');
    expect(document.querySelector('[data-testid="ws-toast"]')?.getAttribute('role')).toBe('alert');
  });

  it('mounts the perf overlay host on the 3D stage', () => {
    expect(tid('ws-3d').contains(viewer.sink.perfHost)).toBe(true);
  });
});
