/**
 * ViewerApp harness (issue #178): a fake plan source standing in for the
 * EditorStore subscription (in-place mutation + notify, like the real
 * reducers), a recording UI sink (gap G9), a manual clock for the
 * rebuild debounce and a manual frame pump. Happy-dom has no WebGL, so
 * the renderer is null and only the pipeline runs.
 */
import { vi } from 'vitest';
import { ViewerApp } from '../../../src/viewer/appController';
import type { RoomPickerFloor, ViewerSettings, ViewerUiSink } from '../../../src/viewer/uiSink';
import type { ViewMode } from '../../../src/viewer/types';
import type { FloorplanData } from '../../../src/shared/schema';

export interface RecordingSink extends ViewerUiSink {
  toasts: Array<{ text: string; variant: 'info' | 'error' }>;
  hints: string[];
  affordances: Array<{ overlay: boolean; reticle: boolean }>;
  readouts: Array<string | null>;
  roomLists: RoomPickerFloor[][];
  empty: boolean[];
  modes: ViewMode[];
  dismissed: number;
}

export function recordingSink(): RecordingSink {
  const sink: RecordingSink = {
    toasts: [],
    hints: [],
    affordances: [],
    readouts: [],
    roomLists: [],
    empty: [],
    modes: [],
    dismissed: 0,
    toast: (text, variant) => void sink.toasts.push({ text, variant }),
    dismissErrors: () => {
      sink.dismissed += 1;
    },
    hint: (text) => void sink.hints.push(text),
    walkAffordances: (s) => void sink.affordances.push({ ...s }),
    roomReadout: (name) => void sink.readouts.push(name),
    roomList: (floors) => void sink.roomLists.push(floors),
    emptyState: (visible) => void sink.empty.push(visible),
    fade: () => Promise.resolve(),
    modeChanged: (mode) => void sink.modes.push(mode),
    perfHost: null,
  };
  return sink;
}

export interface Harness {
  app: ViewerApp;
  canvas: HTMLCanvasElement;
  sink: RecordingSink;
  /** The live plan object (mutate in place, then notify()). */
  plan: () => FloorplanData;
  setPlan(next: FloorplanData): void;
  notify(): void;
  advance(ms: number): void;
  pump(): void;
  /** Let queued fades / async swaps settle. */
  settle(): Promise<void>;
  setBusy(busy: boolean): void;
  requestLock: ReturnType<typeof vi.fn>;
  ticks: () => number;
  dispose(): void;
}

export const DEFAULT_SETTINGS: ViewerSettings = {
  roofs: true,
  ceilings: 'auto',
  wallsAlpha: 0,
  quality: 'high',
  sun: { timeHours: 12, northOffsetDeg: 0 },
};

export function bootViewer(
  initial: FloorplanData,
  opts: { active?: boolean; settings?: Partial<ViewerSettings> } = {},
): Harness {
  let plan = initial;
  const listeners = new Set<() => void>();
  const timers: Array<{ at: number; cb: () => void }> = [];
  let now = 0;
  let busy = false;
  const advance = (ms: number): void => {
    now += ms;
    for (let i = 0; i < timers.length; ) {
      if (timers[i].at <= now) {
        const { cb } = timers.splice(i, 1)[0];
        cb();
      } else i += 1;
    }
  };
  const setTimeoutFn = ((cb: () => void, ms: number) => {
    timers.push({ at: now + ms, cb });
    return timers.length;
  }) as unknown as typeof window.setTimeout;

  let tick: ((t: number) => void) | null = null;
  let tickCount = 0;
  const pump = (): void => {
    const cb = tick;
    tick = null;
    if (cb) {
      tickCount += 1;
      cb(now);
    }
  };

  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const requestLock = vi.fn();
  (canvas as unknown as { requestPointerLock: unknown }).requestPointerLock = requestLock;
  const sink = recordingSink();
  const app = new ViewerApp({
    canvas,
    sink,
    source: {
      current: () => plan,
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    },
    settings: { ...DEFAULT_SETTINGS, ...(opts.settings ?? {}) },
    gestureInProgress: () => busy,
    scheduleTick: (cb) => {
      tick = cb;
      return () => {
        if (tick === cb) tick = null;
      };
    },
    setTimeoutFn,
  });
  app.start();
  if (opts.active ?? true) app.setActive(true);
  return {
    app,
    canvas,
    sink,
    plan: () => plan,
    setPlan(next) {
      plan = next;
      for (const l of [...listeners]) l();
    },
    notify() {
      for (const l of [...listeners]) l();
    },
    advance,
    pump,
    async settle() {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    },
    setBusy(b) {
      busy = b;
    },
    requestLock,
    ticks: () => tickCount,
    dispose() {
      app.dispose();
      canvas.remove();
    },
  };
}

export function viewerStats(): Record<string, unknown> {
  const w = window as unknown as { __viewerStats?: () => Record<string, unknown> };
  return w.__viewerStats?.() ?? {};
}
