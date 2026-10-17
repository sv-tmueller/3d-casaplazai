/**
 * Editor entry point (Package 2). Builds the editor pane, hydrates from
 * autosave, wires pointer/keyboard interaction, and exposes the
 * window.__casaplaza bridge for tests/embedders.
 *
 * Keeps the `.pane[data-screen=editor]` mount contract asserted by
 * tests/stubs/mount.spec.ts.
 */
import { SCHEMA_VERSION, type FloorplanData } from '../shared/schema';
import './../style.css';
import { AutosaveManager } from './autosave';
import { hydrateFromAutosave, initEditorInteraction } from './glue';
import { buildEditorUi, type EditorDomRefs } from './ui';
import { EditorStore, emptyPlan } from './store';

declare global {
  interface Window {
    __casaplaza?: CasaplazaBridge;
  }
}

export interface CasaplazaBridge {
  getData(): FloorplanData;
  loadPlan(plan: FloorplanData): void;
}

export function mountEditor(
  root: HTMLElement,
  opts: { storage?: Storage } = {},
): { store: EditorStore; refs: EditorDomRefs } {
  root.textContent = '';
  const store = new EditorStore(emptyPlan());
  const autosave = new AutosaveManager(opts.storage ?? window.localStorage);

  const refs = buildEditorUi(root);
  initEditorInteraction(refs, store, autosave);
  hydrateFromAutosave(store, autosave);

  window.__casaplaza = {
    getData: () => store.getState().data,
    loadPlan: (plan: FloorplanData) => {
      store.replaceAll(plan);
      autosave.stop();
      autosave.persistSync(plan);
    },
  };

  window.addEventListener('beforeunload', () => autosave.flush());

  return { store, refs };
}

const el = document.getElementById('root');
if (el instanceof HTMLElement) {
  mountEditor(el);
  console.log(`[casa-plazaia] editor mounted, schema v${SCHEMA_VERSION}`);
}
