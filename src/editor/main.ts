/**
 * Editor entry point (Package 2). Builds the editor pane, hydrates from
 * autosave, wires pointer/keyboard interaction, and exposes the
 * window.__casaplaza bridge for tests/embedders.
 *
 * Keeps the `.pane[data-screen=editor]` mount contract asserted by
 * tests/stubs/mount.spec.ts.
 *
 * Wire-format note (pkg 7.1, rescoped 7.2): the store is v2-native and
 * the autosave SLOT carries raw v2 data (multi-floor round-trips, per
 * issue #75's ratified decision (a)); only the __casaplaza bridge
 * keeps speaking the frozen v1 shape (see editor/wire.ts).
 */
import { SCHEMA_VERSION, type FloorplanData, type FloorplanDataV1 } from '../shared/schema';
import './../style.css';
import { AutosaveManager } from './autosave';
import { hydrateFromAutosave, initEditorInteraction } from './glue';
import { buildEditorUi, type EditorDomRefs } from './ui';
import { EditorStore, emptyPlan } from './store';
import { prefersReducedMotion } from '../shared/reducedMotion';
import { normalizeIncoming, toLegacyWire } from './wire';

declare global {
  interface Window {
    __casaplaza?: CasaplazaBridge;
  }
}

export interface CasaplazaBridge {
  getData(): FloorplanDataV1;
  /**
   * CURRENT-schema view of the store (issue #76), ADDITIVE to the
   * frozen v1 getData surface: the viewer's multi-floor pipeline needs
   * every storey, which the flattened v1 wire shape cannot carry.
   * Existing v1 consumers (e2e seeds, embedders, autosave) are
   * unaffected — getData still speaks v1 exactly as before.
   */
  getCurrent(): FloorplanData;
  loadPlan(plan: unknown): void;
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
    getData: () => toLegacyWire(store.getState().data),
    getCurrent: () => store.getState().data,
    loadPlan: (plan: unknown) => {
      const normalized = normalizeIncoming(plan);
      store.replaceAll(normalized);
      autosave.stop();
      // Raw v2 in the slot (decision (a)): upper floors survive reload.
      autosave.persistSync(normalized);
    },
  };

  window.addEventListener('beforeunload', () => autosave.flush());

  return { store, refs };
}

const el = document.getElementById('root');
if (el instanceof HTMLElement) {
  mountEditor(el);
  console.log(`[casa-plazaia] editor mounted, schema v${SCHEMA_VERSION}`);

  // pkg 6 (issue #7): fade out the static loading splash once the
  // editor is live (CSS-transition exit, then drop from the DOM).
  const splash = document.getElementById('splash');
  if (splash) {
    // Pkg 155 (issue #155): reduced motion means no slide-out ceremony —
    // drop the splash synchronously instead of waiting on the 400 ms
    // exit transition (style.css also kills the bar's keyframe).
    if (prefersReducedMotion()) {
      splash.remove();
    } else {
      splash.classList.add('leaving');
      window.setTimeout(() => splash.remove(), 400);
    }
  }
}
