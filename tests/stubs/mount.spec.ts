// @vitest-environment happy-dom
/**
 * Single-entry mount contract (issue #178): `mountWorkspace` fills #root
 * with the workspace (data-screen="workspace") and keeps the
 * window.__casaplaza bridge — getData (frozen v1 wire), getCurrent (v2)
 * and loadPlan — exactly as the e2e seeds and share links use it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountWorkspace, type Workspace } from '../../src/app/main';
import { AUTOSAVE_KEY } from '../../src/editor/autosave';
import { getPose, publishPose } from '../../src/shared/walkerLink';

let ws: Workspace | null = null;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  ws?.dispose();
  ws = null;
});

const TWO_ROOMS = {
  schemaVersion: 1,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.24,
  rooms: [
    { id: 'a', name: 'A', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]], floorTexture: 'wood' },
    { id: 'b', name: 'B', polygon: [[3, 0], [6, 0], [6, 3], [3, 3]], floorTexture: 'tile' },
  ],
  openings: [],
  furniture: [],
};

describe('mountWorkspace', () => {
  it('fills #root with the workspace', () => {
    const root = document.getElementById('root')!;
    ws = mountWorkspace(root);
    expect(root.children.length).toBeGreaterThan(0);
    expect((root.firstElementChild as HTMLElement).dataset.screen).toBe('workspace');
    expect(root.querySelector('canvas.editor-canvas')).not.toBeNull();
  });

  it('keeps the __casaplaza bridge: loadPlan persists, getData speaks v1, getCurrent v2', () => {
    ws = mountWorkspace(document.getElementById('root')!);
    const bridge = window.__casaplaza!;
    publishPose({ x: 1, y: 1, yawRad: 0, floorIdx: 0, mode: 'overview' });
    bridge.loadPlan(TWO_ROOMS);
    expect(bridge.getData().schemaVersion).toBe(1);
    expect(bridge.getData().rooms).toHaveLength(2);
    expect(bridge.getCurrent().schemaVersion).toBe(2);
    expect(bridge.getCurrent().floors[0].rooms).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).floors[0].rooms).toHaveLength(2);
    // G4: a replaced plan drops the stale walker pose.
    expect(getPose()).toBeNull();
  });

  it('hydrates from the autosave slot on boot', () => {
    ws = mountWorkspace(document.getElementById('root')!);
    window.__casaplaza!.loadPlan(TWO_ROOMS);
    ws.dispose();
    document.body.innerHTML = '<div id="root"></div>';
    ws = mountWorkspace(document.getElementById('root')!);
    expect(window.__casaplaza!.getCurrent().floors[0].rooms).toHaveLength(2);
  });

  it('marks the plan saved once autosave writes it (G8)', async () => {
    ws = mountWorkspace(document.getElementById('root')!, { autosaveDebounceMs: 5 });
    window.__casaplaza!.loadPlan(TWO_ROOMS);
    ws.store.dispatch({ type: 'deleteRoom', roomId: 'b' });
    expect(ws.store.dirty).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(ws.store.dirty).toBe(false);
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).floors[0].rooms).toHaveLength(1);
  });
});
