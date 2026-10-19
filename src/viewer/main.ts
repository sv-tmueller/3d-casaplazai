/**
 * Viewer entry point (Package 5). Mounts EDITOR + VIEWER side-by-side:
 * the editor boots in its pane (owning window.__casaplaza) and the
 * ViewerApp polls that bridge on the debounced cadence. Proves the
 * pkg-1 mount contract end to end with the real 3D pipeline.
 */
import './../style.css';
import { mountEditor } from '../editor/main';
import { ViewerApp } from './appController';
import { decodeShare } from '../shared/shareLink';

/**
 * Boot-param precedence (issue #91 reality-check): #plan= is the ONLY
 * plan-bearing boot parameter — ?demo= does not exist anywhere in the
 * codebase (grep-verified at SUB_PLAN time). Should a demo param ever
 * land, the fragment WINS (an explicitly shared link overrides any
 * ambient fixture); this ordering is deliberate and documented here.
 */
const PLAN_FRAGMENT_PARAM = '#plan=';

/** Small dismissible banner over the stage — friendly, never a white-screen. */
function showBootNotice(stage: HTMLElement, text: string): void {
  const notice = document.createElement('div');
  notice.className = 'boot-notice';
  notice.setAttribute('role', 'alert');
  notice.dataset.testid = 'boot-notice';
  notice.textContent = text;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'boot-notice-dismiss';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', () => notice.remove());
  notice.appendChild(dismiss);
  stage.prepend(notice);
}

/**
 * Decode the #plan= fragment (when present) into a validated plan.
 * Returns null when the boot URL carries no share payload.
 */
async function planFromLocationHash(): Promise<
  { ok: true; plan: unknown } | { ok: false; message: string } | null
> {
  const hash = window.location.hash;
  const idx = hash.indexOf(PLAN_FRAGMENT_PARAM);
  if (idx === -1) return null;
  const fragment = hash.slice(idx + PLAN_FRAGMENT_PARAM.length);
  const res = await decodeShare(fragment);
  if (res.ok) return { ok: true, plan: res.plan };
  return { ok: false, message: res.message };
}

export function mountViewer(root: HTMLElement): {
  app: ViewerApp;
} {
  root.textContent = '';
  const stage = document.createElement('div');
  stage.className = 'stage';
  root.appendChild(stage);

  const editorPane = document.createElement('section');
  editorPane.className = 'pane pane-editor';
  editorPane.dataset.screen = 'editor';
  stage.appendChild(editorPane);

  const viewerPane = document.createElement('section');
  viewerPane.className = 'pane pane-viewer';
  viewerPane.dataset.screen = 'viewer';
  stage.appendChild(viewerPane);

  // Editor first — it OWNS window.__casaplaza.
  mountEditor(editorPane);

  // Issue #91: a #plan= fragment overrides autosave hydration AFTER
  // the editor mounts (loadPlan swaps the plan + persists). Failures
  // render a friendly banner — the app ALWAYS continues to boot.
  void (async () => {
    const shared = await planFromLocationHash();
    if (shared === null) return;
    if (shared.ok) {
      window.__casaplaza?.loadPlan(shared.plan);
    } else {
      showBootNotice(stage, `Shared link could not be opened. ${shared.message}`);
    }
  })();

  const canvas = document.createElement('canvas');
  canvas.className = 'viewer-gl-canvas';
  viewerPane.insertBefore(canvas, viewerPane.firstChild);

  const app = new ViewerApp({
    canvas,
    pane: viewerPane,
    bridge: () => window.__casaplaza,
  });
  app.start();

  return { app };
}

const el = document.getElementById('root');
if (el instanceof HTMLElement) {
  const booted = mountViewer(el);
  console.log('[casa-plazaia] viewer mounted (side-by-side)');
  window.addEventListener('beforeunload', () => booted.app.dispose());
}
