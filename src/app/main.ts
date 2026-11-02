/**
 * Workspace entry point (issue #178, design §8.1): the single page. Mounts
 * the shell over one EditorStore, hydrates from autosave, keeps the
 * window.__casaplaza bridge, and decodes a #plan= share fragment (the
 * /viewer redirect forwards it here with ?view=3d).
 *
 * Wire-format note (pkg 7.1, rescoped 7.2): the store is v2-native and the
 * autosave SLOT carries raw v2 data (multi-floor round-trips, per issue
 * #75's ratified decision (a)); only the __casaplaza bridge keeps
 * speaking the frozen v1 shape (see editor/wire.ts).
 */
import '../ui/tokens.css';
import '../ui/base.css';
import { SCHEMA_VERSION, type FloorplanData, type FloorplanDataV1 } from '../shared/schema';
import { decodeShare } from '../shared/shareLink';
import { planFragmentFromHash } from '../shared/viewerRoute';
import { prefersReducedMotion } from '../shared/reducedMotion';
import { publishPose } from '../shared/walkerLink';
import { AutosaveManager, DEBOUNCE_MS_DEFAULT } from '../editor/autosave';
import { createCanvasEngine, hydrateFromAutosave } from '../editor/canvasEngine';
import { safeLocalStorage } from '../editor/model/settings';
import { EditorStore, emptyPlan } from '../editor/store';
import { normalizeIncoming, toLegacyWire } from '../editor/wire';
import { createAppState, type AppState } from './state';
import { createPlanOps } from './planOps';
import { mountShell, type Shell, type ViewerPort, type ViewerSink } from './shell';

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

export interface WorkspaceOptions {
  storage?: Storage;
  search?: string;
  hash?: string;
  autosaveDebounceMs?: number;
  /** The 3D engine factory (stage 4); absent = Plan view only. */
  createViewer?: (canvas: HTMLCanvasElement, sink: ViewerSink, ctx: { store: EditorStore; app: AppState; shell: () => Shell | null }) => ViewerPort;
}

export interface Workspace {
  readonly store: EditorStore;
  readonly app: AppState;
  readonly shell: Shell;
  readonly autosave: AutosaveManager;
  /** Resolves once a #plan= fragment (if any) has been applied. */
  readonly booted: Promise<void>;
  dispose(): void;
}

export function mountWorkspace(root: HTMLElement, opts: WorkspaceOptions = {}): Workspace {
  const storage = opts.storage ?? window.localStorage;
  const store = new EditorStore(emptyPlan());
  let shell: Shell | null = null;
  // Gap G8: a landed write clears the dirty flag and the unsaved dot.
  const autosave = new AutosaveManager(storage, opts.autosaveDebounceMs ?? DEBOUNCE_MS_DEFAULT, () => {
    store.markSaved();
    shell?.refresh();
  });
  const app = createAppState({ storage: opts.storage ?? safeLocalStorage(), search: opts.search ?? location.search });

  const clearWalkPose = (): void => {
    // Gap G4: the parked pose belongs to the plan it was taken in.
    publishPose(null);
    app.set({ walkPose: null });
  };

  const plan = createPlanOps({
    store,
    autosave,
    engine: () => shell!.engine,
    notify: (text, variant) => shell?.notify(text, variant),
    onPlanReplaced: clearWalkPose,
  });

  const unsubscribeSave = store.subscribe((s) => {
    // Ratified decision (a) on issue #75: the slot carries RAW v2 data.
    if (store.dirty) autosave.scheduleSave(s.data);
  });

  shell = mountShell({
    root,
    app,
    store,
    plan,
    createEngine: (canvas) => createCanvasEngine({ canvas, store, theme: app.get().theme }),
    createViewer: opts.createViewer
      ? (canvas, sink) => opts.createViewer!(canvas, sink, { store, app, shell: () => shell })
      : undefined,
  });
  const theShell = shell;

  hydrateFromAutosave(store, autosave);
  // Gap G14: the plan is fitted to the viewport on load.
  theShell.engine.fitPlan();

  window.__casaplaza = {
    getData: () => toLegacyWire(store.getState().data),
    getCurrent: () => store.getState().data,
    loadPlan: (raw: unknown) => {
      const normalized = normalizeIncoming(raw);
      store.replaceAll(normalized);
      autosave.stop();
      // Raw v2 in the slot (decision (a)): upper floors survive reload.
      autosave.persistSync(normalized);
      clearWalkPose();
    },
  };

  const onUnload = (): void => autosave.flush();
  window.addEventListener('beforeunload', onUnload);

  // Issue #91: a #plan= fragment overrides autosave hydration. Failures
  // raise an error toast — the app always continues to boot.
  const fragment = planFragmentFromHash(opts.hash ?? location.hash);
  const booted = (async () => {
    if (fragment === null) return;
    const res = await decodeShare(fragment);
    if (res.ok) {
      window.__casaplaza?.loadPlan(res.plan);
      theShell.engine.fitPlan();
    } else {
      theShell.notify(`Shared link could not be opened. ${res.message}`, 'error');
    }
  })();

  return {
    store,
    app,
    shell: theShell,
    autosave,
    booted,
    dispose(): void {
      window.removeEventListener('beforeunload', onUnload);
      unsubscribeSave();
      autosave.stop();
      theShell.dispose();
    },
  };
}

const el = document.getElementById('root');
if (el instanceof HTMLElement && !import.meta.env?.VITEST) {
  const ws = mountWorkspace(el);
  window.addEventListener('beforeunload', () => ws.shell.viewer?.dispose());
  console.log(`[casa-plazaia] workspace mounted, schema v${SCHEMA_VERSION}`);
  // Fade out the static loading splash once the workspace is live; under
  // reduced motion it is dropped at once (pkg 155).
  const splash = document.getElementById('splash');
  if (splash) {
    if (prefersReducedMotion()) {
      splash.remove();
    } else {
      splash.classList.add('leaving');
      window.setTimeout(() => splash.remove(), 400);
    }
  }
}
