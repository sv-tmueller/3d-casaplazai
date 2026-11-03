/**
 * Recording fake of the EditorEngine interface (issue #178): the shell
 * and command tests run against this instead of the canvas engine, so
 * they prove the shell talks to the interface only.
 */
import type {
  EditorEngine,
  EditorTool,
  EngineEventName,
  EngineEvents,
} from '../../../src/editor/engine';
import type { SelectionDescriptor } from '../../../src/editor/inspectorPanel';
import type { Measurement } from '../../../src/editor/model/measure';
import type { SnapSettings } from '../../../src/editor/model/settings';
import type { UnderlayState } from '../../../src/editor/model/underlay';
import type { Floor } from '../../../src/shared/schema';

export interface FakeEngine extends EditorEngine {
  calls: string[];
  emit<K extends EngineEventName>(event: K, payload: EngineEvents[K]): void;
  busy: boolean;
  furnitureSelected: boolean;
  roomSelected: boolean;
  deletable: boolean;
  underlayState: UnderlayState | null;
  measureList: Measurement[];
}

const FLOOR: Floor = {
  id: 'f0',
  name: 'Ground',
  elevation: 0,
  rooms: [],
  openings: [],
  furniture: [],
} as unknown as Floor;

export function fakeEngine(): FakeEngine {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  let tool: EditorTool = 'select';
  let furniture = 'bed';
  let dims = true;
  let grid = true;
  let snap: SnapSettings = { pitch: 0.5, master: true } as SnapSettings;
  let armed = false;
  const canvas = document.createElement('canvas');
  canvas.className = 'editor-canvas';
  const eng: FakeEngine = {
    canvas,
    calls: [],
    busy: false,
    furnitureSelected: false,
    roomSelected: false,
    deletable: false,
    underlayState: null,
    measureList: [],
    emit(event, payload) {
      for (const h of handlers.get(event) ?? []) h(payload);
    },
    on(event, handler) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as (p: unknown) => void);
      handlers.set(event, set);
      return () => set.delete(handler as (p: unknown) => void);
    },
    tool: () => tool,
    setTool(t) {
      eng.calls.push(`setTool:${t}`);
      tool = t;
      eng.emit('tool', { tool: t });
    },
    armedFurniture: () => furniture,
    armFurniture(t) {
      eng.calls.push(`armFurniture:${t}`);
      furniture = t;
      eng.emit('furniture', { type: t });
    },
    gestureInProgress: () => eng.busy,
    hint: () => 'Press ? for keyboard shortcuts.',
    camera: () => ({ originX: 0, originY: 0, scale: 80 }),
    zoomBy(f) {
      eng.calls.push(`zoomBy:${f}`);
    },
    fitPlan() {
      eng.calls.push('fitPlan');
    },
    setViewportInsets(i) {
      eng.calls.push(`insets:${i.left},${i.right}`);
    },
    resize() {
      eng.calls.push('resize');
    },
    dimensionsVisible: () => dims,
    setDimensionsVisible(v) {
      eng.calls.push(`dims:${v}`);
      dims = v;
      eng.emit('overlays', { dimensions: dims, grid });
    },
    gridVisible: () => grid,
    setGridVisible(v) {
      eng.calls.push(`grid:${v}`);
      grid = v;
      eng.emit('overlays', { dimensions: dims, grid });
    },
    snapSettings: () => snap,
    setSnapSettings(s) {
      eng.calls.push(`snap:${s.pitch}:${s.master}`);
      snap = s;
      eng.emit('snap', { settings: s });
    },
    underlay: () => eng.underlayState,
    async importUnderlay() {
      eng.calls.push('importUnderlay');
    },
    setUnderlayOpacity(p) {
      eng.calls.push(`underlayOpacity:${p}`);
    },
    rotateUnderlay(d) {
      eng.calls.push(`rotateUnderlay:${d}`);
    },
    setUnderlayLocked(b) {
      eng.calls.push(`underlayLocked:${b}`);
    },
    setUnderlayHidden(b) {
      eng.calls.push(`underlayHidden:${b}`);
    },
    removeUnderlay() {
      eng.calls.push('removeUnderlay');
    },
    measurements: () => eng.measureList,
    clearMeasurements() {
      eng.calls.push('clearMeasurements');
    },
    removeMeasurement(id) {
      eng.calls.push(`removeMeasurement:${id}`);
    },
    revealMeasurement(id) {
      eng.calls.push(`revealMeasurement:${id}`);
    },
    selection: (): SelectionDescriptor => ({ kind: 'none', floor: FLOOR }),
    hasDeletableSelection: () => eng.deletable,
    deleteSelection() {
      eng.calls.push('deleteSelection');
    },
    rotateSelectedFurniture() {
      if (!eng.furnitureSelected) return false;
      eng.calls.push('rotateFurniture');
      return true;
    },
    addressLeanWall() {
      eng.calls.push('addressLeanWall');
      return eng.roomSelected;
    },
    cancelTransient() {
      return false;
    },
    setInspectorVisible(v) {
      eng.calls.push(`inspectorVisible:${v}`);
    },
    switchFloor(d) {
      eng.calls.push(`switchFloor:${d}`);
    },
    placeCameraArmed: () => armed,
    setPlaceCameraArmed(b) {
      eng.calls.push(`placeCamera:${b}`);
      armed = b;
      eng.emit('placeCamera', { armed: b });
    },
    setInputEnabled(b) {
      eng.calls.push(`input:${b}`);
    },
    setTheme(t) {
      eng.calls.push(`theme:${t}`);
    },
    async exportImage(choice) {
      eng.calls.push(`export:${choice.format}:${choice.scale}`);
      return { filename: 'floorplan.png', width: 10, height: 10 };
    },
    resetEditorState(o) {
      eng.calls.push(`reset:${Boolean(o.underlays)}:${Boolean(o.measurements)}`);
    },
    dispose() {
      eng.calls.push('dispose');
    },
  };
  return eng;
}
