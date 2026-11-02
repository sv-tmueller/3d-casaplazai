/**
 * Workspace shell (issue #178, design §6 / §8): one page, three views
 * (Plan / 3D / Walk) over one stage. Mounts the top bar, the floating
 * tool card and inspector, the status bar, toasts, the empty states and
 * the walk overlay; owns the view switch; binds every control to the
 * command registry. Talks to the 2D engine through the EditorEngine
 * interface only and to the 3D engine through ViewerPort.
 */
import '../ui/card.css';
import '../ui/button.css';
import './shell.css';
import { el } from '../ui/el';
import { ToastStack, type ToastStackHandle } from '../ui/toast';
import { confirmDialog, promptDialog } from './dialogs/confirm';
import { openExportDialog } from './dialogs/export';
import { openShortcutsDialog } from './dialogs/shortcuts';
import { createCommands, type CommandRegistry, type ShellActions } from './commands';
import { installKeyboard } from './keyboard';
import type { AppState, ViewerSettings, ViewId } from './state';
import { Binder } from './panels/controls';
import { mountTopBar } from './panels/topBar';
import { mountToolCard } from './panels/toolCard';
import { describeSelection, mountInspector } from './panels/inspector';
import { mountStatusBar } from './panels/statusBar';
import { mountEmpty3d, mountEmptyState, planIsEmpty } from './panels/emptyState';
import { mountWalkOverlay } from './panels/walkOverlay';
import { playFade } from './panels/fade';
import type { EditorEngine } from '../editor/engine';
import type { EditorStore } from '../editor/store';
import { activeFloorPlan } from '../editor/store';
import { formatTotal, totalLivableAreaM2 } from '../editor/measures';
import type { DemoId } from '../editor/demos';
import { getPose, type WalkerPose } from '../shared/walkerLink';
import type { ViewerUiSink } from '../viewer/uiSink';

/** File operations implemented by the app entry (autosave-aware). */
export interface PlanOps {
  importJson(): void;
  saveJson(): void;
  newPlan(): void | Promise<void>;
  loadDemo(id: DemoId): void | Promise<void>;
  share(): void | Promise<void>;
}

/** What the 3D engine tells the shell (gap G9: replaces the HUD writes). */
export type ViewerSink = ViewerUiSink & { readonly perfHost: HTMLElement };

export interface ViewerPort {
  setActive(active: boolean): void;
  /** Ask for orbit or walk; false when refused (busy / nothing to walk). */
  requestMode(mode: 'overview' | 'walk', opts?: { autoLock?: boolean; pose?: WalkerPose | null }): boolean;
  canWalk(): boolean;
  busy(): boolean;
  gotoRoom(roomId: string): void;
  applySettings(settings: ViewerSettings): void;
  dispose(): void;
}

export interface ShellOptions {
  root: HTMLElement;
  app: AppState;
  store: EditorStore;
  createEngine(canvas: HTMLCanvasElement): EditorEngine;
  plan: PlanOps;
  createViewer?(canvas: HTMLCanvasElement, sink: ViewerSink): ViewerPort;
  /** Unsaved-dot source (default: the store's dirty flag). */
  isDirty?(): boolean;
}

export interface Shell {
  readonly root: HTMLElement;
  readonly engine: EditorEngine;
  readonly registry: CommandRegistry;
  readonly toasts: ToastStackHandle;
  readonly viewer: ViewerPort | null;
  requestView(view: ViewId, opts?: { seated?: boolean; pose?: WalkerPose | null }): boolean;
  refresh(): void;
  notify(text: string, variant?: 'info' | 'error'): void;
  dispose(): void;
}

/** Floating-panel geometry (mirrors --toolcard-w / --inspector-w). */
const PANEL_GAP = 12;
const TOOLCARD_W = 280;
const INSPECTOR_W = 300;

export function mountShell(opts: ShellOptions): Shell {
  const { app, store } = opts;
  opts.root.textContent = '';
  const disposers: Array<() => void> = [];

  /* ------------------------------ skeleton ------------------------------ */
  const planCanvas = el('canvas', {
    class: 'editor-canvas',
    attrs: { tabindex: '0', 'aria-label': 'Floor plan canvas' },
  });
  const planPane = el('div', { class: 'ws-plan-pane editor-canvas-wrap', testid: 'ws-plan' }, planCanvas);
  const canvas3d = el('canvas', { class: 'viewer-gl-canvas', attrs: { tabindex: '0', 'aria-label': '3D view' } });
  const perfHost = el('div', { class: 'ws-perf' });
  const pane3d = el('div', { class: 'ws-3d-pane', testid: 'ws-3d' }, canvas3d, perfHost);
  const veil = el('div', { class: 'ws-fade', attrs: { 'aria-hidden': 'true' } });
  const toasts = ToastStack({ testid: 'ws-toast-stack' });
  const toastHost = el('div', { class: 'ws-toasts', testid: 'ws-toasts' }, toasts.root);
  const stage = el('main', { class: 'ws-stage', testid: 'ws-stage' }, planPane, pane3d);
  const root = el('div', { class: 'ws', dataset: { screen: 'workspace' } });
  opts.root.appendChild(root);
  root.appendChild(stage);

  const engine = opts.createEngine(planCanvas);
  if (engine.canvas.parentElement !== planPane) planPane.appendChild(engine.canvas);

  const notify = (text: string, variant: 'info' | 'error' = 'info'): void => toasts.show(text, variant);

  /* --------------------------- viewer bridge ---------------------------- */
  let viewer: ViewerPort | null = null;
  // Late-bound panels referenced by the sink / actions.
  let walkOverlayRef: ReturnType<typeof mountWalkOverlay> | null = null;
  let empty3dRef: ReturnType<typeof mountEmpty3d> | null = null;

  /* ------------------------------ actions ------------------------------- */
  const underlayInput = el('input', {
    class: 'ui-sr-only',
    attrs: { type: 'file', accept: 'image/png,image/jpeg,image/webp', tabindex: '-1', 'aria-hidden': 'true' },
    testid: 'ws-underlay-file',
  });
  underlayInput.addEventListener('change', () => {
    const file = underlayInput.files?.[0];
    if (file) void engine.importUnderlay(file);
  });
  root.appendChild(underlayInput);

  const actions: ShellActions = {
    requestView: (v) => requestView(v),
    canEnterView: (v) => canEnterView(v),
    openShortcuts: () => void openShortcutsDialog(),
    openExport: () => {
      void openExportDialog().then(async (choice) => {
        if (!choice) return;
        try {
          const res = await engine.exportImage(choice);
          notify(`Exported ${res.filename} (${res.width}×${res.height}).`);
        } catch (err) {
          notify(`Export failed: ${(err as Error).message}`, 'error');
        }
      });
    },
    openSnapping: () => toolCard.revealSnapping(!engine.gestureInProgress()),
    openLean: () => inspector.focusLean(),
    toggleInspector: () => app.set({ inspectorOpen: !app.get().inspectorOpen }),
    importJson: () => opts.plan.importJson(),
    saveJson: () => opts.plan.saveJson(),
    newPlan: () => void opts.plan.newPlan(),
    loadDemo: (id) => void opts.plan.loadDemo(id),
    share: () => void opts.plan.share(),
    toggleFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void document.documentElement.requestFullscreen?.()?.catch(() => notify('Fullscreen is not available here.'));
    },
    isFullscreen: () => Boolean(document.fullscreenElement),
    addFloor: () => {
      const res = store.dispatch({ type: 'addFloor' });
      if (!res.ok) notify(res.error, 'error');
    },
    renameFloor: () => {
      const st = store.getState();
      const floor = st.data.floors[st.activeFloorIdx];
      void promptDialog({ title: 'Rename floor', label: 'Floor name', value: floor?.name ?? '', confirmLabel: 'Rename' }).then(
        (name) => {
          if (name === null) return;
          const res = store.dispatch({ type: 'renameFloor', name });
          if (!res.ok) notify(res.error, 'error');
        },
      );
    },
    deleteFloor: () => {
      const st = store.getState();
      const floor = st.data.floors[st.activeFloorIdx];
      void confirmDialog({
        title: 'Delete this floor?',
        message: `“${floor?.name ?? 'This floor'}” and everything on it will be removed. Undo brings it back.`,
        confirmLabel: 'Delete floor',
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        const res = store.dispatch({ type: 'deleteFloor' });
        if (!res.ok) notify(res.error, 'error');
      });
    },
    gotoRoom: (id) => viewer?.gotoRoom(id),
    importUnderlay: () => {
      underlayInput.value = '';
      underlayInput.click();
    },
    toast: notify,
  };

  const registry = createCommands({ app, engine, store, actions });
  const binder = new Binder(registry, () => app.get().view);

  /* ------------------------------- panels ------------------------------- */
  const topBar = mountTopBar({
    binder,
    app,
    store,
    isDirty: opts.isDirty ?? (() => store.dirty),
    gotoFloor: (i) => engine.switchFloor(i - store.getState().activeFloorIdx),
  });
  const toolCard = mountToolCard(binder, app, engine);
  const inspector = mountInspector({ binder, app, store, engine, flashError: (t) => notify(t, 'error') });
  const status = mountStatusBar();
  const empty = mountEmptyState({
    drawRoom: () => engine.setTool('rectangle'),
    loadDemo: (id) => void opts.plan.loadDemo(id),
    importJson: () => opts.plan.importJson(),
  });
  const walkOverlay = mountWalkOverlay(binder);
  const empty3d = mountEmpty3d(() => requestView('plan'));
  walkOverlayRef = walkOverlay;
  empty3dRef = empty3d;
  pane3d.append(walkOverlay.root, empty3d.root);
  stage.append(toolCard.root, inspector.root, empty.root, toastHost, veil);
  root.prepend(topBar.root);
  root.appendChild(status.root);

  /* --------------------------- the view switch -------------------------- */
  function canEnterView(v: ViewId): boolean {
    if (v === 'plan') return true;
    if (!viewer || viewer.busy()) return false;
    return v === '3d' || viewer.canWalk();
  }

  function applyView(v: ViewId): void {
    root.dataset.view = v;
    planPane.hidden = v !== 'plan';
    pane3d.hidden = v === 'plan';
    engine.setInputEnabled(v === 'plan');
    if (v === 'plan') engine.resize();
  }

  function requestView(v: ViewId, o: { seated?: boolean; pose?: WalkerPose | null } = {}): boolean {
    const cur = app.get().view;
    if (v === cur && !o.seated) return true;
    if (!canEnterView(v)) {
      if (v === 'walk' && viewer && !viewer.busy()) notify('Draw a room first — there is nothing to walk in yet.');
      return false;
    }
    if (v === 'plan') {
      // Leaving the 3D views ends walking (the viewer parks the pose).
      viewer?.setActive(false);
    } else if (viewer) {
      // Show the 3D pane first so the viewer measures a real canvas (G6).
      applyView(v);
      viewer.setActive(true);
      if (v === 'walk') {
        // G4 / G15: spawn from the placed pose, else the parked one.
        const ok = viewer.requestMode('walk', { autoLock: !o.seated, pose: o.pose ?? getPose() ?? app.get().walkPose });
        if (!ok) return false;
      } else {
        viewer.requestMode('overview');
      }
    }
    app.set({ view: v, walkPose: getPose() ?? app.get().walkPose });
    applyView(v);
    refresh();
    if (v === 'plan') engine.canvas.focus();
    return true;
  }

  /* ------------------------------- refresh ------------------------------ */
  let lastHint = engine.hint();
  let selectionText = '';
  const paintStatusLeft = (): void => status.setHint(selectionText || lastHint);

  function reportInsets(): void {
    engine.setViewportInsets({
      left: PANEL_GAP + TOOLCARD_W + PANEL_GAP,
      right: app.get().inspectorOpen ? PANEL_GAP + INSPECTOR_W + PANEL_GAP : 0,
      top: 0,
      bottom: 0,
    });
  }

  let lastInspectorOpen: boolean | null = null;
  function refresh(): void {
    binder.sync();
    topBar.sync();
    toolCard.sync();
    inspector.sync();
    const st = store.getState();
    status.setTotal(formatTotal(totalLivableAreaM2(activeFloorPlan(st))));
    empty.setVisible(app.get().view === 'plan' && planIsEmpty(st.data) && engine.tool() === 'select');
    if (lastInspectorOpen !== app.get().inspectorOpen) {
      lastInspectorOpen = app.get().inspectorOpen;
      reportInsets();
    }
  }

  /* ------------------------------- wiring ------------------------------- */
  const on = engine.on.bind(engine);
  disposers.push(
    on('tool', () => refresh()),
    on('selection', ({ descriptor }) => {
      inspector.onSelection(descriptor);
      selectionText = descriptor.kind === 'none' ? '' : `${describeSelection(descriptor)} selected`;
      paintStatusLeft();
      binder.sync();
    }),
    on('cursor', ({ world }) => status.setCursor(world)),
    on('zoom', ({ percent }) => status.setZoom(percent)),
    on('hint', ({ text }) => {
      lastHint = text;
      paintStatusLeft();
    }),
    on('message', ({ text, level, ttlMs }) =>
      toasts.show(text, level === 'assertive' ? 'error' : 'info', ttlMs ? { ttlMs } : {}),
    ),
    on('measurements', ({ items }) => {
      toolCard.renderMeasurements(items);
      binder.sync();
    }),
    on('underlay', () => binder.sync()),
    on('furniture', () => binder.sync()),
    on('snap', () => binder.sync()),
    on('overlays', () => binder.sync()),
    on('placeCamera', () => binder.sync()),
    on('overlaps', ({ count }) => status.setOverlaps(count)),
    on('walkerPlaced', ({ pose, roomName }) => {
      app.set({ walkPose: pose });
      if (requestView('walk', { seated: true, pose })) notify(`Camera placed in ${roomName}.`);
      else notify(`Walker placed in ${roomName}.`);
    }),
  );
  disposers.push(store.subscribe(() => refresh()));

  let lastTheme: string | null = null;
  let lastViewer: ViewerSettings | null = null;
  disposers.push(
    app.subscribe((s) => {
      if (s.theme !== lastTheme) {
        lastTheme = s.theme;
        document.documentElement.dataset.theme = s.theme;
        engine.setTheme(s.theme);
      }
      if (viewer && s.viewer !== lastViewer) {
        lastViewer = s.viewer;
        viewer.applySettings(s.viewer);
      }
      refresh();
    }),
  );

  const onFullscreen = (): void => binder.sync();
  document.addEventListener('fullscreenchange', onFullscreen);
  disposers.push(() => document.removeEventListener('fullscreenchange', onFullscreen));

  const keyboardOff = installKeyboard({
    registry,
    view: () => app.get().view,
    gestureInProgress: () => engine.gestureInProgress(),
  });
  disposers.push(keyboardOff);

  /* ------------------------------- viewer -------------------------------- */
  if (opts.createViewer) {
    const sink: ViewerSink = {
      toast: (text, variant) => toasts.show(text, variant),
      dismissErrors: () => toasts.dismissErrors(),
      hint: (text) => walkOverlayRef?.setHint(text),
      walkAffordances: (s) => walkOverlayRef?.setAffordances(s),
      roomReadout: (name) => walkOverlayRef?.setRoom(name),
      roomList: (floors) => walkOverlayRef?.setRooms(floors),
      emptyState: (visible) => {
        empty3dRef?.setVisible(visible);
        binder.sync();
        topBar.sync();
      },
      fade: () => playFade(veil),
      modeChanged: (mode) => {
        if (mode === 'overview' && app.get().view === 'walk') {
          app.set({ view: '3d', walkPose: getPose() });
          applyView('3d');
        }
        refresh();
      },
      perfHost,
    };
    viewer = opts.createViewer(canvas3d, sink);
    lastViewer = app.get().viewer;
  }

  /* -------------------------------- boot --------------------------------- */
  lastTheme = app.get().theme;
  document.documentElement.dataset.theme = lastTheme;
  engine.setTheme(app.get().theme);
  // A booted 3D view (persisted or ?view=3d) needs the viewer awake.
  const bootView = canEnterView(app.get().view) ? app.get().view : 'plan';
  if (bootView !== app.get().view) app.set({ view: bootView });
  applyView(bootView);
  if (bootView !== 'plan' && viewer) {
    viewer.setActive(true);
    viewer.requestMode('overview');
  }
  reportInsets();
  toolCard.renderMeasurements(engine.measurements());
  paintStatusLeft();
  refresh();

  return {
    root,
    engine,
    registry,
    toasts,
    get viewer() {
      return viewer;
    },
    requestView,
    refresh,
    notify,
    dispose(): void {
      for (const off of disposers.splice(0)) off();
      topBar.destroy();
      walkOverlay.destroy();
      viewer?.dispose();
      engine.dispose();
    },
  };
}
