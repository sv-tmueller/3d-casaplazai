/**
 * EditorEngine (issue #178, design §8.3): the ONLY way into the 2D
 * canvas engine. The shell holds this interface and never the
 * implementation (canvasEngine.ts) or a bag of DOM refs; the engine
 * owns its canvas, its pointer/gesture machinery and its paint loop.
 *
 * Events carry only state the EditorStore does not hold (tool, cursor,
 * zoom, hint, messages, measurements, underlay, selection descriptors
 * with the UI-local wall-segment address, snapping, overlays, the
 * place-camera gesture). Plan content reaches the shell through its own
 * store subscription.
 */
import type { AnyToolMode, Camera } from './controller';
import type { SelectionDescriptor } from './inspectorPanel';
import type { Measurement } from './model/measure';
import type { SnapSettings } from './model/settings';
import type { ThemePreference } from './model/theme';
import type { UnderlayState } from './model/underlay';
import type { ExportFormat, ExportScale } from './export';
import type { WalkerPose } from '../shared/walkerLink';

export type EditorTool = AnyToolMode;
export type MessageLevel = 'polite' | 'assertive';

/** Space reserved by floating panels over the canvas, CSS px. */
export interface ViewportInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface EngineEvents {
  tool: { tool: EditorTool };
  /** Fired on every store notify and on segment / multi-set changes. */
  selection: { descriptor: SelectionDescriptor };
  /** World cursor in meters (null when the pointer left the canvas). */
  cursor: { world: readonly [number, number] | null };
  /** Zoom as a percentage of the neutral 80 px/m scale. */
  zoom: { percent: number };
  hint: { text: string };
  message: { text: string; level: MessageLevel; ttlMs?: number };
  /** The ACTIVE floor's measure annotations. */
  measurements: { items: readonly Measurement[] };
  underlay: { underlay: UnderlayState | null; selected: boolean };
  furniture: { type: string };
  snap: { settings: SnapSettings };
  overlays: { dimensions: boolean; grid: boolean };
  /** Number of overlapping room pairs on the active floor. */
  overlaps: { count: number };
  placeCamera: { armed: boolean };
  /** A committed place-camera click: the walker should stand here. */
  walkerPlaced: { pose: WalkerPose; roomName: string };
}

export type EngineEventName = keyof EngineEvents;

export interface ExportChoice {
  format: ExportFormat;
  scale: ExportScale;
}

export interface EditorEngine {
  readonly canvas: HTMLCanvasElement;
  on<K extends EngineEventName>(event: K, handler: (payload: EngineEvents[K]) => void): () => void;

  /* tools */
  tool(): EditorTool;
  setTool(tool: EditorTool): void;
  armedFurniture(): string;
  armFurniture(type: string): void;
  /** True while any pointer gesture or draft is in flight. */
  gestureInProgress(): boolean;
  /** The armed tool's status-bar hint (also published as `hint`). */
  hint(): string;

  /* camera */
  camera(): Camera;
  zoomBy(factor: number): void;
  /** Frame the active floor; deferred while the canvas is hidden. */
  fitPlan(): void;
  setViewportInsets(insets: ViewportInsets): void;
  /** Re-measure the canvas (after a show / layout change). */
  resize(): void;

  /* overlays and snapping */
  dimensionsVisible(): boolean;
  setDimensionsVisible(visible: boolean): void;
  gridVisible(): boolean;
  setGridVisible(visible: boolean): void;
  snapSettings(): SnapSettings;
  setSnapSettings(settings: SnapSettings): void;

  /* underlay (active floor) */
  underlay(): UnderlayState | null;
  importUnderlay(file: File): Promise<void>;
  setUnderlayOpacity(percent: number): void;
  rotateUnderlay(deltaDeg: number): void;
  setUnderlayLocked(locked: boolean): void;
  setUnderlayHidden(hidden: boolean): void;
  removeUnderlay(): void;

  /* measurements */
  measurements(): readonly Measurement[];
  clearMeasurements(): void;
  removeMeasurement(id: string): void;
  revealMeasurement(id: string): void;

  /* selection */
  selection(): SelectionDescriptor;
  hasDeletableSelection(): boolean;
  deleteSelection(): void;
  /** R on a selected furniture piece; false when nothing rotatable. */
  rotateSelectedFurniture(): boolean;
  /** L: address the selected room's lean wall; false with no room. */
  addressLeanWall(): boolean;
  /** Drop a pending measure anchor / marquee; true when one was live. */
  cancelTransient(): boolean;
  /** The wall-segment overlay paints only while the inspector shows. */
  setInspectorVisible(visible: boolean): void;

  /* floors */
  switchFloor(delta: number): void;

  /* walker glyph and place camera */
  placeCameraArmed(): boolean;
  setPlaceCameraArmed(armed: boolean): void;

  /* shell plumbing */
  setInputEnabled(enabled: boolean): void;
  setTheme(theme: ThemePreference): void;
  exportImage(choice: ExportChoice): Promise<{ filename: string; width: number; height: number }>;
  /** Clean slate for New plan: drop underlays and/or measurements. */
  resetEditorState(opts: { underlays?: boolean; measurements?: boolean }): void;
  dispose(): void;
}

/** Zoom factor of the Zoom in / Zoom out controls (issue #46 button step). */
export const ZOOM_BUTTON_FACTOR = 1.2;
