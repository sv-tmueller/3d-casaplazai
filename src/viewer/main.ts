/**
 * Viewer entry point (Package 5). Mounts EDITOR + VIEWER side-by-side:
 * the editor boots in its pane (owning window.__casaplaza) and the
 * ViewerApp polls that bridge on the debounced cadence. Proves the
 * pkg-1 mount contract end to end with the real 3D pipeline.
 */
import './../style.css';
import { mountEditor } from '../editor/main';
import { ViewerApp } from './appController';

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
