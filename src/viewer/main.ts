/**
 * Viewer entry stub (Package 1). Three.js rendering arrives with
 * Package 5; this proves the mount-point wiring works end to end.
 */
import { SCHEMA_VERSION } from '../shared/schema';

export function mountViewer(root: HTMLElement): void {
  root.textContent = '';
  const pane = document.createElement('section');
  pane.className = 'pane pane-viewer';
  pane.dataset.screen = 'viewer';
  const label = document.createElement('strong');
  label.textContent = 'Viewer';
  pane.appendChild(label);
  pane.appendChild(document.createTextNode(` — scaffold stub (schema v${SCHEMA_VERSION})`));
  root.appendChild(pane);
}

const el = document.getElementById('root');
if (el instanceof HTMLElement) {
  mountViewer(el);
  console.log(`[casa-plazaia] viewer mounted, schema v${SCHEMA_VERSION}`);
}
