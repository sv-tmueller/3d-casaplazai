/**
 * Editor entry stub (Package 1). Rendering/UI arrives with Package 2;
 * this proves the mount-point wiring works end to end.
 */
import { SCHEMA_VERSION } from '../shared/schema';

export function mountEditor(root: HTMLElement): void {
  root.textContent = '';
  const pane = document.createElement('section');
  pane.className = 'pane pane-editor';
  pane.dataset.screen = 'editor';
  const label = document.createElement('strong');
  label.textContent = 'Editor';
  pane.appendChild(label);
  pane.appendChild(document.createTextNode(` — scaffold stub (schema v${SCHEMA_VERSION})`));
  root.appendChild(pane);
}

const el = document.getElementById('root');
if (el instanceof HTMLElement) {
  mountEditor(el);
  console.log(`[casa-plazaia] editor mounted, schema v${SCHEMA_VERSION}`);
}
