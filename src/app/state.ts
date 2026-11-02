/**
 * AppState (issue #178, design §8.2): the workspace's small observable
 * store — the view, the tool-card tab, panel state, theme, project name,
 * the last walker pose and the 3D settings the viewer reads (roofs,
 * ceilings, walls transparency, quality, sun). Same subscribe pattern as
 * EditorStore. Persists view + tab (casaplaza.workspace.v1), the project
 * name (casaplaza.project.v1, outside the schema) and the theme (the
 * existing casaplaza.theme.v1 key via model/theme.ts).
 */
import { loadTheme, saveTheme, type ThemePreference } from '../editor/model/theme';
import { isHighQuality } from '../viewer/quality';
import { DEFAULT_SUN_SETTINGS } from '../viewer/sun';
import type { SunSettings } from '../viewer/types';
import type { WalkerPose } from '../shared/walkerLink';

export type ViewId = 'plan' | '3d' | 'walk';
export type ToolTab = 'build' | 'view' | 'measure';
export type CeilingsMode = 'auto' | 'on' | 'off';
export type QualityLevel = 'high' | 'low';

export const VIEW_IDS: readonly ViewId[] = ['plan', '3d', 'walk'];
export const TOOL_TABS: readonly ToolTab[] = ['build', 'view', 'measure'];

export interface ViewerSettings {
  roofs: boolean;
  ceilings: CeilingsMode;
  /** Normalised walls transparency (0 opaque … 1 invisible). */
  wallsAlpha: number;
  quality: QualityLevel;
  sun: SunSettings;
}

export interface AppStateData {
  view: ViewId;
  tab: ToolTab;
  inspectorOpen: boolean;
  /** Build tab Snapping section expanded. */
  snapOpen: boolean;
  theme: ThemePreference;
  projectName: string;
  /** Last walker pose of the session (Plan glyph + Walk spawn). */
  walkPose: WalkerPose | null;
  viewer: ViewerSettings;
}

export const APP_STATE_STORAGE_KEY = 'casaplaza.workspace.v1';
export const PROJECT_STORAGE_KEY = 'casaplaza.project.v1';
export const DEFAULT_PROJECT_NAME = 'Untitled plan';

type Listener = (state: Readonly<AppStateData>) => void;

export class AppState {
  private state: AppStateData;
  private readonly listeners = new Set<Listener>();

  constructor(
    initial: AppStateData,
    private readonly storage: Storage | null,
  ) {
    this.state = initial;
  }

  get(): Readonly<AppStateData> {
    return this.state;
  }

  set(patch: Partial<AppStateData>): void {
    let changed = false;
    for (const key of Object.keys(patch) as Array<keyof AppStateData>) {
      if (patch[key] !== undefined && this.state[key] !== patch[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    const prev = this.state;
    this.state = { ...prev, ...patch };
    this.persist(prev);
    for (const fn of [...this.listeners]) fn(this.state);
  }

  setViewer(patch: Partial<ViewerSettings>): void {
    const cur = this.state.viewer;
    const next = { ...cur, ...patch };
    const same = (Object.keys(next) as Array<keyof ViewerSettings>).every((k) => next[k] === cur[k]);
    if (!same) this.set({ viewer: next });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private persist(prev: AppStateData): void {
    const s = this.state;
    if (s.view !== prev.view || s.tab !== prev.tab) {
      write(this.storage, APP_STATE_STORAGE_KEY, JSON.stringify({ view: s.view, tab: s.tab }));
    }
    if (s.projectName !== prev.projectName) {
      write(this.storage, PROJECT_STORAGE_KEY, JSON.stringify({ name: s.projectName }));
    }
    if (s.theme !== prev.theme) saveTheme(this.storage, s.theme);
  }
}

function write(storage: Storage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    /* quota / privacy mode: preferences are best-effort */
  }
}

function read(storage: Storage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** ?view= boot param (the /viewer redirect sends view=3d). */
export function viewFromSearch(search: string): ViewId | null {
  const m = /[?&]view=([a-z0-9]+)(?=&|$)/.exec(search);
  if (!m) return null;
  const v = m[1] as ViewId;
  if (!VIEW_IDS.includes(v)) return null;
  return v === 'walk' ? '3d' : v;
}

export function createAppState(opts: { storage: Storage | null; search?: string }): AppState {
  const search = opts.search ?? '';
  const saved = read(opts.storage, APP_STATE_STORAGE_KEY) as { view?: unknown; tab?: unknown } | null;
  let view: ViewId = 'plan';
  if (saved && VIEW_IDS.includes(saved.view as ViewId)) {
    // Gap G15: a persisted Walk restores as 3D — walking needs a click.
    view = saved.view === 'walk' ? '3d' : (saved.view as ViewId);
  }
  view = viewFromSearch(search) ?? view;
  const tab: ToolTab =
    saved && TOOL_TABS.includes(saved.tab as ToolTab) ? (saved.tab as ToolTab) : 'build';
  const project = read(opts.storage, PROJECT_STORAGE_KEY) as { name?: unknown } | null;
  const name =
    project && typeof project.name === 'string' && project.name.trim() !== ''
      ? project.name.trim()
      : DEFAULT_PROJECT_NAME;
  return new AppState(
    {
      view,
      tab,
      inspectorOpen: false,
      snapOpen: false,
      theme: loadTheme(opts.storage),
      projectName: name,
      walkPose: null,
      viewer: {
        roofs: true,
        ceilings: 'auto',
        wallsAlpha: 0,
        quality: isHighQuality(search) ? 'high' : 'low',
        sun: { ...DEFAULT_SUN_SETTINGS },
      },
    },
    opts.storage,
  );
}
