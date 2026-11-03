/**
 * Command registry (issue #178, design §8.2). Every user action is a
 * command; the top bar, tool card, inspector actions, menus, keyboard
 * dispatcher, cheat sheet and README table all read from here, so a
 * control cannot drift from its shortcut or its accessible name.
 *
 * Two layers: COMMAND_SPECS is static metadata (id, label, icon, views,
 * key bindings, shortcut rows) — the README sync test and the cheat
 * sheet need it without a running app — and createCommands() binds the
 * behaviour (run / enabled / pressed) to a live app.
 *
 * Gap G1: `views` scopes a command (and its keys) to the views it makes
 * sense in, so WASD in Walk never arms a Plan tool.
 */
import type { IconKey } from '../ui/icons';
import type { EditorEngine, EditorTool } from '../editor/engine';
import { ZOOM_BUTTON_FACTOR } from '../editor/engine';
import type { EditorStore } from '../editor/store';
import { parsePitch } from '../editor/model/settings';
import { UNDERLAY_ROTATE_STEP_DEG } from '../editor/model/underlay';
import type { DemoId } from '../editor/demos';
import type { AppState, CeilingsMode, QualityLevel, ViewId } from './state';

export interface KeyBinding {
  /** KeyboardEvent.key, compared case-insensitively for letters. */
  key: string;
  /** Requires Ctrl or Meta (absent = neither may be held). */
  ctrl?: boolean;
  /** Absent = either; true/false = must match. */
  shift?: boolean;
}

export type ShortcutGroup = 'General' | 'Tools' | 'Views' | 'Plan' | 'Canvas';

export interface ShortcutRow {
  keys: string;
  action: string;
  group: ShortcutGroup;
}

export type CommandKind = 'action' | 'toggle' | 'value' | 'gesture';

export interface CommandSpec {
  id: string;
  label: string;
  icon?: IconKey;
  kind?: CommandKind;
  /** Views where the command and its keys are live (default: all). */
  views?: readonly ViewId[];
  keys?: readonly KeyBinding[];
  rows?: readonly ShortcutRow[];
  /** Keys still fire while a draw gesture is in flight. */
  allowMidGesture?: boolean;
}

export interface Command extends CommandSpec {
  enabled?: () => boolean;
  pressed?: () => boolean;
  run?: (arg?: unknown) => void;
  /** Keyboard path when it differs from a click (R rotates furniture). */
  onKey?: () => void;
}

const PLAN: readonly ViewId[] = ['plan'];
const PLAN_3D: readonly ViewId[] = ['plan', '3d'];

const row = (keys: string, action: string, group: ShortcutGroup): ShortcutRow => ({ keys, action, group });
const k = (key: string, extra: Omit<KeyBinding, 'key'> = {}): KeyBinding => ({ key, ...extra });

export const COMMAND_SPECS: readonly CommandSpec[] = [
  {
    id: 'help.shortcuts', label: 'Keyboard shortcuts', icon: 'help',
    keys: [k('?'), k('/', { shift: true })],
    rows: [row('?', 'Show keyboard shortcuts', 'General')],
  },
  { id: 'canvas.cancel', label: 'Cancel', kind: 'gesture', rows: [row('Esc', 'Cancel current gesture / deselect', 'Canvas')] },
  { id: 'canvas.closePolygon', label: 'Close polygon', kind: 'gesture', rows: [row('Enter', 'Close polygon while drawing', 'Canvas')] },
  {
    id: 'history.undo', label: 'Undo', icon: 'undo',
    keys: [k('z', { ctrl: true, shift: false })],
    rows: [row('Ctrl+Z', 'Undo', 'General')],
  },
  {
    id: 'history.redo', label: 'Redo', icon: 'redo',
    keys: [k('z', { ctrl: true, shift: true }), k('y', { ctrl: true })],
    rows: [row('Ctrl+Shift+Z', 'Redo', 'General'), row('Ctrl+Y', 'Redo', 'General')],
  },
  { id: 'tool.select', label: 'Select', icon: 'select', kind: 'toggle', views: PLAN, keys: [k('v')], rows: [row('V', 'Arm the Select tool', 'Tools')] },
  {
    id: 'tool.rectangle', label: 'Rectangle', icon: 'rectangle', kind: 'toggle', views: PLAN, keys: [k('r')],
    rows: [row('R', 'Arm Rectangle (rotates selected furniture 90° while one is selected)', 'Tools')],
  },
  { id: 'tool.polygon', label: 'Polygon', icon: 'polygon', kind: 'toggle', views: PLAN, keys: [k('p')], rows: [row('P', 'Arm the Polygon tool', 'Tools')] },
  { id: 'tool.door', label: 'Door', icon: 'door', kind: 'toggle', views: PLAN, keys: [k('d')], rows: [row('D', 'Arm the Door tool', 'Tools')] },
  { id: 'tool.window', label: 'Window', icon: 'window', kind: 'toggle', views: PLAN, keys: [k('w')], rows: [row('W', 'Arm the Window tool', 'Tools')] },
  { id: 'tool.stamp', label: 'Furniture', icon: 'furnish', kind: 'toggle', views: PLAN, keys: [k('f')], rows: [row('F', 'Arm the Furniture (stamp) tool', 'Tools')] },
  { id: 'tool.stairs', label: 'Stairs', icon: 'stairs', kind: 'toggle', views: PLAN, keys: [k('t')], rows: [row('T', 'Arm the Stairs tool', 'Tools')] },
  { id: 'tool.measure', label: 'Measure', icon: 'measure', kind: 'toggle', views: PLAN, keys: [k('m')], rows: [row('M', 'Arm the Measure tool', 'Tools')] },
  {
    id: 'snap.open', label: 'Snapping', icon: 'snap', views: PLAN, keys: [k('s')], allowMidGesture: true,
    rows: [row('S', 'Open the Build tab’s Snapping section', 'Plan')],
  },
  {
    id: 'inspector.lean', label: 'Wall lean', icon: 'polygon', views: PLAN, keys: [k('l')],
    rows: [row('L', 'Set the selected room’s wall lean (roof) in the inspector', 'Plan')],
  },
  {
    id: 'inspector.toggle', label: 'Inspector', icon: 'inspector', kind: 'toggle', views: PLAN, keys: [k('i')],
    rows: [row('I', 'Toggle the inspector panel', 'Plan')],
  },
  { id: 'view.plan', label: 'Plan', icon: 'plan', kind: 'toggle', keys: [k('1')], rows: [row('1', 'Switch to the Plan view', 'Views')] },
  { id: 'view.3d', label: '3D', icon: 'cube', kind: 'toggle', keys: [k('2')], rows: [row('2', 'Switch to the 3D view', 'Views')] },
  { id: 'view.walk', label: 'Walk', icon: 'walk', kind: 'toggle', keys: [k('3')], rows: [row('3', 'Switch to the Walk view', 'Views')] },
  {
    id: 'camera.place', label: 'Place walk camera', icon: 'camera', kind: 'toggle', views: PLAN, keys: [k('c')],
    rows: [row('C', 'Place the walk camera (click a room, drag to aim), then walk', 'Plan')],
  },
  {
    id: 'floor.prev', label: 'Floor below', icon: 'minus', views: PLAN_3D, keys: [k('PageUp'), k('[')],
    rows: [row('PageUp / [', 'Switch to the floor below', 'Plan')],
  },
  {
    id: 'floor.next', label: 'Floor above', icon: 'plus', views: PLAN_3D, keys: [k('PageDown'), k(']')],
    rows: [row('PageDown / ]', 'Switch to the floor above', 'Plan')],
  },
  {
    id: 'edit.delete', label: 'Delete', icon: 'delete', views: PLAN, keys: [k('Delete'), k('Backspace')],
    rows: [row('Del / Backspace', 'Delete selected room, opening, or furniture', 'Plan')],
  },
  { id: 'view.fit', label: 'Fit plan', icon: 'center', views: PLAN, keys: [k('0')], rows: [row('0', 'Fit the whole plan in the viewport', 'Plan')] },
  { id: 'tool.pan', label: 'Pan', icon: 'pan', kind: 'toggle', views: PLAN, rows: [row('Space (hold)', 'Temporarily switch to the Pan tool', 'Canvas')] },
  {
    id: 'canvas.marquee', label: 'Marquee select', kind: 'gesture',
    rows: [row('Drag on empty space', 'Marquee multi-select (bulk delete; bulk DRAG moves rooms and furniture — staircases stay put)', 'Canvas')],
  },
  { id: 'canvas.dragPan', label: 'Pan the canvas', kind: 'gesture', rows: [row('Alt+Drag / Middle-Drag', 'Pan the canvas', 'Canvas')] },
  { id: 'canvas.wheel', label: 'Zoom at cursor', kind: 'gesture', rows: [row('Wheel', 'Zoom at cursor', 'Canvas')] },

  /* ---- controls without a keyboard row ---- */
  { id: 'view.zoomIn', label: 'Zoom in', icon: 'zoom-in', views: PLAN },
  { id: 'view.zoomOut', label: 'Zoom out', icon: 'zoom-out', views: PLAN },
  { id: 'view.dimensions', label: 'Dimensions', icon: 'dimensions', kind: 'toggle', views: PLAN },
  { id: 'view.grid', label: 'Grid', icon: 'grid', kind: 'toggle', views: PLAN },
  { id: 'snap.master', label: 'Snap to grid and geometry', kind: 'toggle', views: PLAN },
  { id: 'snap.pitch', label: 'Grid pitch', kind: 'value', views: PLAN },
  { id: 'underlay.import', label: 'Import underlay image', icon: 'image', views: PLAN },
  { id: 'underlay.opacity', label: 'Underlay opacity', kind: 'value', views: PLAN },
  { id: 'underlay.rotateCcw', label: 'Rotate underlay left', icon: 'rotate-ccw', views: PLAN },
  { id: 'underlay.rotateCw', label: 'Rotate underlay right', icon: 'rotate-cw', views: PLAN },
  { id: 'underlay.lock', label: 'Lock underlay', icon: 'lock', kind: 'toggle', views: PLAN },
  { id: 'underlay.hide', label: 'Hide underlay', icon: 'eye', kind: 'toggle', views: PLAN },
  { id: 'underlay.remove', label: 'Remove underlay', icon: 'delete', views: PLAN },
  { id: 'measure.clear', label: 'Clear measurements', icon: 'delete', views: PLAN },
  { id: 'file.import', label: 'Import JSON', icon: 'upload' },
  { id: 'file.saveJson', label: 'Save JSON', icon: 'download' },
  { id: 'file.new', label: 'New plan', icon: 'new' },
  { id: 'file.demo', label: 'Load demo', kind: 'value' },
  { id: 'file.export', label: 'Export image', icon: 'export' },
  { id: 'file.share', label: 'Share link', icon: 'share' },
  { id: 'theme.toggle', label: 'Dark theme', icon: 'theme', kind: 'toggle' },
  { id: 'app.fullscreen', label: 'Fullscreen', icon: 'fullscreen', kind: 'toggle' },
  { id: 'floor.add', label: 'Add floor', icon: 'plus' },
  { id: 'floor.rename', label: 'Rename floor' },
  { id: 'floor.delete', label: 'Delete floor', icon: 'delete' },
  { id: 'furniture.arm', label: 'Furniture piece', kind: 'value', views: PLAN },
  { id: 'viewer.roofs', label: 'Roofs', kind: 'toggle' },
  { id: 'viewer.ceilings', label: 'Ceilings', kind: 'value' },
  { id: 'viewer.wallsAlpha', label: 'Walls transparency', kind: 'value' },
  { id: 'viewer.quality', label: 'Quality', kind: 'value' },
  { id: 'sun.time', label: 'Time of day', kind: 'value' },
  { id: 'sun.north', label: 'North offset', kind: 'value' },
  { id: 'walk.gotoRoom', label: 'Go to room', kind: 'value', views: ['walk'] },
];

/** Shell-side effects the commands delegate to (implemented by shell/main). */
export interface ShellActions {
  requestView(view: ViewId): boolean;
  canEnterView(view: ViewId): boolean;
  openShortcuts(): void;
  openExport(): void;
  openSnapping(): void;
  openLean(): void;
  toggleInspector(): void;
  importJson(): void;
  saveJson(): void;
  newPlan(): void;
  loadDemo(id: DemoId): void;
  share(): void;
  toggleFullscreen(): void;
  isFullscreen(): boolean;
  addFloor(): void;
  renameFloor(): void;
  deleteFloor(): void;
  gotoRoom(roomId: string): void;
  importUnderlay(): void;
  toast(text: string, variant?: 'info' | 'error'): void;
}

export interface CommandDeps {
  app: AppState;
  engine: EditorEngine;
  store: EditorStore;
  actions: ShellActions;
}

export class CommandRegistry {
  private readonly byId = new Map<string, Command>();

  constructor(private readonly commands: Command[]) {
    for (const c of commands) this.byId.set(c.id, c);
  }

  list(): readonly Command[] {
    return this.commands;
  }

  get(id: string): Command {
    const c = this.byId.get(id);
    if (!c) throw new Error(`unknown command: ${id}`);
    return c;
  }

  /** Live in `view` and enabled right now. */
  available(id: string, view: ViewId): boolean {
    const c = this.get(id);
    if (c.views && !c.views.includes(view)) return false;
    return c.enabled ? c.enabled() : true;
  }

  run(id: string, arg?: unknown): void {
    this.get(id).run?.(arg);
  }
}

/** First shortcut row's keys, for tooltips ("Undo (Ctrl+Z)"). */
export function shortcutHint(spec: CommandSpec): string | undefined {
  return spec.rows?.[0]?.keys;
}

export function createCommands(deps: CommandDeps): CommandRegistry {
  const { app, engine, store, actions } = deps;
  const idle = (): boolean => !engine.gestureInProgress();
  const tool = (t: EditorTool): Partial<Command> => ({
    pressed: () => engine.tool() === t,
    run: () => engine.setTool(t),
  });
  const view = (v: ViewId): Partial<Command> => ({
    pressed: () => app.get().view === v,
    enabled: () => app.get().view === v || actions.canEnterView(v),
    run: () => {
      actions.requestView(v);
    },
  });
  const floors = () => store.getState().data.floors.length;
  const viewer = app.setViewer.bind(app);

  const behaviour: Record<string, Partial<Command>> = {
    'help.shortcuts': { run: () => actions.openShortcuts() },
    'history.undo': { enabled: () => store.canUndo() && idle(), run: () => store.undo() },
    'history.redo': { enabled: () => store.canRedo() && idle(), run: () => store.redo() },
    'tool.select': tool('select'),
    'tool.rectangle': {
      ...tool('rectangle'),
      onKey: () => {
        if (!engine.rotateSelectedFurniture()) engine.setTool('rectangle');
      },
    },
    'tool.polygon': tool('polygon'),
    'tool.door': tool('door'),
    'tool.window': tool('window'),
    'tool.stamp': tool('stamp'),
    'tool.stairs': tool('stairs'),
    'tool.measure': tool('measure'),
    'tool.pan': tool('pan'),
    'snap.open': { pressed: () => app.get().snapOpen, run: () => actions.openSnapping() },
    'inspector.lean': {
      run: () => {
        if (engine.addressLeanWall()) actions.openLean();
        else actions.toast('Select a room first, then press L to set a wall lean.');
      },
    },
    'inspector.toggle': { pressed: () => app.get().inspectorOpen, run: () => actions.toggleInspector() },
    'view.plan': view('plan'),
    'view.3d': view('3d'),
    'view.walk': view('walk'),
    'camera.place': {
      pressed: () => engine.placeCameraArmed(),
      run: () => engine.setPlaceCameraArmed(!engine.placeCameraArmed()),
    },
    'floor.prev': { enabled: () => store.getState().activeFloorIdx > 0, run: () => engine.switchFloor(-1) },
    'floor.next': { enabled: () => store.getState().activeFloorIdx < floors() - 1, run: () => engine.switchFloor(1) },
    'edit.delete': { enabled: () => engine.hasDeletableSelection(), run: () => engine.deleteSelection() },
    'view.fit': { run: () => engine.fitPlan() },
    'view.zoomIn': { run: () => engine.zoomBy(ZOOM_BUTTON_FACTOR) },
    'view.zoomOut': { run: () => engine.zoomBy(1 / ZOOM_BUTTON_FACTOR) },
    'view.dimensions': {
      pressed: () => engine.dimensionsVisible(),
      run: () => engine.setDimensionsVisible(!engine.dimensionsVisible()),
    },
    'view.grid': { pressed: () => engine.gridVisible(), run: () => engine.setGridVisible(!engine.gridVisible()) },
    'snap.master': {
      pressed: () => engine.snapSettings().master,
      run: () => engine.setSnapSettings({ ...engine.snapSettings(), master: !engine.snapSettings().master }),
    },
    'snap.pitch': {
      run: (arg) => {
        const pitch = parsePitch(Number(arg));
        if (pitch !== null) engine.setSnapSettings({ ...engine.snapSettings(), pitch });
      },
    },
    'underlay.import': { run: () => actions.importUnderlay() },
    'underlay.opacity': {
      enabled: () => engine.underlay() !== null,
      run: (arg) => engine.setUnderlayOpacity(Number(arg)),
    },
    'underlay.rotateCcw': { enabled: () => engine.underlay() !== null, run: () => engine.rotateUnderlay(-UNDERLAY_ROTATE_STEP_DEG) },
    'underlay.rotateCw': { enabled: () => engine.underlay() !== null, run: () => engine.rotateUnderlay(UNDERLAY_ROTATE_STEP_DEG) },
    'underlay.lock': {
      enabled: () => engine.underlay() !== null,
      pressed: () => engine.underlay()?.locked ?? false,
      run: () => engine.setUnderlayLocked(!(engine.underlay()?.locked ?? false)),
    },
    'underlay.hide': {
      enabled: () => engine.underlay() !== null,
      pressed: () => engine.underlay()?.hidden ?? false,
      run: () => engine.setUnderlayHidden(!(engine.underlay()?.hidden ?? false)),
    },
    'underlay.remove': { enabled: () => engine.underlay() !== null, run: () => engine.removeUnderlay() },
    'measure.clear': { enabled: () => engine.measurements().length > 0, run: () => engine.clearMeasurements() },
    'file.import': { run: () => actions.importJson() },
    'file.saveJson': { run: () => actions.saveJson() },
    'file.new': { run: () => actions.newPlan() },
    'file.demo': { run: (arg) => actions.loadDemo(arg as DemoId) },
    'file.export': { run: () => actions.openExport() },
    'file.share': { run: () => actions.share() },
    'theme.toggle': {
      pressed: () => app.get().theme === 'dark',
      run: () => app.set({ theme: app.get().theme === 'dark' ? 'light' : 'dark' }),
    },
    'app.fullscreen': { pressed: () => actions.isFullscreen(), run: () => actions.toggleFullscreen() },
    'floor.add': { run: () => actions.addFloor() },
    'floor.rename': { run: () => actions.renameFloor() },
    'floor.delete': { enabled: () => floors() > 1, run: () => actions.deleteFloor() },
    'furniture.arm': {
      run: (arg) => {
        engine.armFurniture(String(arg));
        engine.setTool('stamp');
      },
    },
    'viewer.roofs': { pressed: () => app.get().viewer.roofs, run: () => viewer({ roofs: !app.get().viewer.roofs }) },
    'viewer.ceilings': { run: (arg) => viewer({ ceilings: arg as CeilingsMode }) },
    'viewer.wallsAlpha': {
      run: (arg) => {
        const a = Number(arg);
        viewer({ wallsAlpha: Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 0 });
      },
    },
    'viewer.quality': { run: (arg) => viewer({ quality: arg === 'low' ? 'low' : ('high' as QualityLevel) }) },
    'sun.time': { run: (arg) => viewer({ sun: { ...app.get().viewer.sun, timeHours: Number(arg) } }) },
    'sun.north': { run: (arg) => viewer({ sun: { ...app.get().viewer.sun, northOffsetDeg: Number(arg) } }) },
    'walk.gotoRoom': { run: (arg) => actions.gotoRoom(String(arg)) },
  };

  return new CommandRegistry(COMMAND_SPECS.map((spec) => ({ ...spec, ...(behaviour[spec.id] ?? {}) })));
}
