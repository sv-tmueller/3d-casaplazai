/**
 * The 3D engine's UI contract (issue #178, gap G9): instead of writing
 * into its own HUD DOM, ViewerApp reports to a sink the workspace shell
 * implements (toasts, the walk overlay, the 3D empty card, the fade
 * veil). Unit tests inject a recording sink.
 */
import type { SunSettings, ViewMode } from './types';
import type { QualityLevel } from './quality';

/** One storey of the Go-to-room list. */
export interface RoomPickerFloor {
  name: string;
  rooms: ReadonlyArray<{ id: string; name: string }>;
}

export interface ViewerUiSink {
  toast(text: string, variant: 'info' | 'error'): void;
  dismissErrors(): void;
  /** Walk hint strip ('' hides it). */
  hint(text: string): void;
  walkAffordances(s: { overlay: boolean; reticle: boolean }): void;
  /** Room the walker stands in ('Outside'), null when no walker. */
  roomReadout(name: string | null): void;
  roomList(floors: RoomPickerFloor[]): void;
  emptyState(visible: boolean): void;
  /** Mode-transition veil; resolves when the camera may jump. */
  fade(): Promise<void>;
  /** The live mode after every swap (and on the viewer's own exits). */
  modeChanged(mode: ViewMode): void;
  /** Mount point for the ?perf=1 overlay. */
  readonly perfHost?: HTMLElement | null;
}

/** Runtime 3D settings (mirrors AppState.viewer). */
export interface ViewerSettings {
  roofs: boolean;
  ceilings: 'auto' | 'on' | 'off';
  /** Normalised walls transparency (0 opaque … 1 invisible). */
  wallsAlpha: number;
  quality: QualityLevel;
  sun: SunSettings;
}

/** A sink that drops everything (headless use). */
export const NULL_SINK: ViewerUiSink = {
  toast: () => {},
  dismissErrors: () => {},
  hint: () => {},
  walkAffordances: () => {},
  roomReadout: () => {},
  roomList: () => {},
  emptyState: () => {},
  fade: () => Promise.resolve(),
  modeChanged: () => {},
  perfHost: null,
};
