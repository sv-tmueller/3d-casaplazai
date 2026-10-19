/**
 * HUD (issue #6): the viewer's DOM overlay kit — Walk/Overview toggle,
 * mode-transition fade curtain, toast stack (typed failures like
 * SpawnFailureError surface HERE, never as crashes), and the ?perf=1
 * rolling-percentile FPS/frame-time overlay fed by FrameStats samples.
 *
 * Pure DOM construction + imperative updates; no framework, no three.js
 * dependencies, so the whole thing unit-tests under happy-dom.
 */

import type { FrameStats, ViewMode } from './types';

/** Toast lifetime before dismissal, ms. */
export const TOAST_TTL_MS = 4200;

/** Fade curtain duration for mode transitions, ms. */
export const FADE_DURATION_MS = 320;

/** Sample window feeding the perf overlay's percentiles. */
export const PERF_WINDOW_SAMPLES = 240;

/** Percentile anchor displayed beside the median (worst 5%). */
const PERCENTILE_HIGH = 95;

/** Root class hook for every HUD-managed subtree. */
const HUD_ROOT_CLASS = 'viewer-hud-root';

/** Everything the HUD owns, constructed lazily on mount. */
export interface HudHandles {
  root: HTMLDivElement;
  toggleBtn: HTMLButtonElement;
  /** Roof visibility toggle (issue #86); reflects the live state. */
  roofBtn: HTMLButtonElement;
  fade: HTMLDivElement;
  toasts: HTMLDivElement;
  perfPanel: HTMLPreElement | null;
  /** Centered walk-entry prompt (issue #30); hidden unless unlocked-walk. */
  walkOverlay: HTMLDivElement;
  /** Subtle center reticle shown while pointer-locked in walk mode. */
  walkReticle: HTMLDivElement;
}

/** Callback invoked when the user toggles Walk/Overview. */
export type ToggleListener = (next: ViewMode) => void;

/** Callback invoked when the user toggles roof visibility (issue #86). */
export type RoofToggleListener = (visible: boolean) => void;

/** Construct the HUD overlay inside the given viewer pane. */
export function buildHud(hostPane: HTMLElement): HudHandles {
  const root = document.createElement('div');
  root.className = HUD_ROOT_CLASS;

  const bar = document.createElement('div');
  bar.className = 'hud-bar';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'hud-toggle hud-btn-overview';
  toggleBtn.dataset.testid = 'hud-mode-toggle';
  toggleBtn.textContent = 'Walk';
  toggleBtn.setAttribute('aria-label', 'Toggle walk mode');

  // Roof visibility toggle (issue #86): keyboard-focusable like its
  // sibling (plain buttons tab naturally — the mouseless mandate), and
  // aria-pressed mirrors the live state for screen readers.
  const roofBtn = document.createElement('button');
  roofBtn.type = 'button';
  roofBtn.className = 'hud-toggle';
  roofBtn.dataset.testid = 'hud-roof-toggle';
  roofBtn.textContent = 'Hide roofs';
  roofBtn.setAttribute('aria-label', 'Toggle roof visibility');
  roofBtn.setAttribute('aria-pressed', 'false');

  const hint = document.createElement('span');
  hint.className = 'hud-hint';
  hint.dataset.testid = 'hud-hint';
  hint.textContent = '';

  bar.append(toggleBtn, roofBtn, hint);

  const fade = document.createElement('div');
  fade.className = 'hud-fade';
  fade.dataset.testid = 'hud-fade';

  const toasts = document.createElement('div');
  toasts.className = 'hud-toasts';
  toasts.dataset.testid = 'hud-toasts';

  root.append(bar, fade, toasts);

  // Walk-entry affordances (issue #30): a prominent click prompt and a
  // subtle reticle, both hidden by default; setWalkAffordances toggles.
  const walkOverlay = document.createElement('div');
  walkOverlay.className = 'hud-walk-overlay';
  walkOverlay.dataset.testid = 'walk-entry-overlay';
  walkOverlay.textContent = 'Click to walk';
  walkOverlay.hidden = true;

  const walkReticle = document.createElement('div');
  walkReticle.className = 'hud-reticle';
  walkReticle.dataset.testid = 'walk-reticle';
  walkReticle.hidden = true;

  root.append(walkOverlay, walkReticle);
  hostPane.appendChild(root);

  return {
    root,
    toggleBtn,
    roofBtn,
    fade,
    toasts,
    perfPanel: null,
    walkOverlay,
    walkReticle,
  };
}

/**
 * Toggle the walk-entry affordances (issue #30): the centered overlay is
 * up while walk mode is seated but unlocked; the reticle appears once
 * pointer lock is held. One setter — no new callback machinery.
 */
export function setWalkAffordances(
  handles: HudHandles,
  state: { overlay: boolean; reticle: boolean },
): void {
  handles.walkOverlay.hidden = !state.overlay;
  handles.walkReticle.hidden = !state.reticle;
}

/** Reflect the CURRENT mode on the toggle (shows the OTHER mode's name). */
export function reflectMode(handles: HudHandles, mode: ViewMode): void {
  if (mode === 'overview') {
    handles.toggleBtn.textContent = 'Walk';
    handles.toggleBtn.classList.add('hud-btn-overview');
    handles.toggleBtn.classList.remove('hud-btn-walking');
  } else {
    handles.toggleBtn.textContent = 'Overview';
    handles.toggleBtn.classList.add('hud-btn-walking');
    handles.toggleBtn.classList.remove('hud-btn-overview');
  }
}

/** Show the contextual affordance hint ('Click to walk', etc.). */
export function showHint(handles: HudHandles, text: string): void {
  const hint = handles.root.querySelector<HTMLSpanElement>(
    '[data-testid=hud-hint]',
  );
  if (hint) hint.textContent = text;
}

/** Attach the toggle click handler (single-owner wiring). */
export function onBindToggle(
  handles: HudHandles,
  current: () => ViewMode,
  listener: ToggleListener,
): () => void {
  const onClick = (): void => {
    listener(current() === 'overview' ? 'walk' : 'overview');
  };
  handles.toggleBtn.addEventListener('click', onClick);
  return () => handles.toggleBtn.removeEventListener('click', onClick);
}

/**
 * Attach the roof-visibility click handler (issue #86). The button is a
 * momentary toggle: each click flips the state the listener receives.
 */
export function onBindRoofToggle(
  handles: HudHandles,
  isVisible: () => boolean,
  listener: RoofToggleListener,
): () => void {
  const onClick = (): void => {
    listener(!isVisible());
  };
  handles.roofBtn.addEventListener('click', onClick);
  return () => handles.roofBtn.removeEventListener('click', onClick);
}

/**
 * Reflect the roof-visibility state on the HUD button (issue #86):
 * label announces the ACTION, aria-pressed announces the STATE.
 */
export function reflectRoofVisibility(
  handles: HudHandles,
  visible: boolean,
): void {
  handles.roofBtn.textContent = visible ? 'Hide roofs' : 'Show roofs';
  handles.roofBtn.setAttribute('aria-pressed', String(visible));
}

/**
 * Fire the mode-transition fade: brief white veil dipping in and out so
 * the camera jump between overview/walk reads as intentional.
 */
export function playFade(handles: HudHandles): Promise<void> {
  return new Promise((resolve) => {
    handles.fade.classList.add('hud-fade-active');
    window.setTimeout(() => {
      handles.fade.classList.remove('hud-fade-active');
      resolve();
    }, FADE_DURATION_MS);
  });
}

/** Raise one toast; auto-dismisses after TTL. Errors styled distinctly. */
export function toast(
  handles: HudHandles,
  message: string,
  variant: 'info' | 'error' = 'info',
): void {
  const el = document.createElement('div');
  el.className = `hud-toast hud-toast-${variant}`;
  el.dataset.testid = 'hud-toast';
  el.textContent = message;
  handles.toasts.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('hud-toast-leaving');
    window.setTimeout(() => el.remove(), 350);
  }, TOAST_TTL_MS);
}

/** Cap concurrent toasts (drop oldest beyond this many). */
export function trimToasts(handles: HudHandles, max = 3): void {
  while (handles.toasts.children.length > max) {
    handles.toasts.firstElementChild?.remove();
  }
}

/**
 * Perf overlay plumbing. Created only when ?perf=1 is present; the
 * controller pushes raw frame durations and this panel publishes the
 * rolling stats (median + low/high percentile bands).
 */
export class PerfOverlay {
  public readonly panel: HTMLPreElement | null;

  private readonly samplesMs: number[] = [];

  public constructor(enabled: boolean) {
    this.panel = enabled ? document.createElement('pre') : null;
    if (this.panel) {
      this.panel.className = 'hud-perf-panel';
      this.panel.dataset.testid = 'hud-perf-panel';
      this.panel.textContent = 'sampling…';
    }
  }

  /** Append this panel to the HUD root (call once after construct). */
  public mount(handles: HudHandles): void {
    if (this.panel) handles.root.appendChild(this.panel);
  }

  /** Feed one raw frame duration (ms); recomputes published stats. */
  public record(frameMs: number): FrameStats {
    this.samplesMs.push(frameMs);
    while (this.samplesMs.length > PERF_WINDOW_SAMPLES) {
      this.samplesMs.shift();
    }
    const stats = summarizeFrames([...this.samplesMs]);
    if (this.panel) {
      this.panel.textContent =
        `fps med ${stats.fpsMedian.toFixed(0)} · ` +
        `p-low ${stats.fpsPercentileLow.toFixed(0)}\n` +
        `frame ms med ${stats.frameMsMedian.toFixed(1)} · ` +
        `p-high ${stats.frameMsPercentileHigh.toFixed(1)} · ` +
        `n=${stats.framesSampled}`;
    }
    return stats;
  }

  /** Reset the sampling window (mode swaps invalidate continuity). */
  public reset(): void {
    this.samplesMs.length = 0;
  }

  /** Detach the panel (dispose chain). */
  public destroy(): void {
    this.panel?.remove();
  }
}

/** Compute median + percentile band over a copy of frame times. */
export function summarizeFrames(samplesMs: readonly number[]): FrameStats {
  const n = samplesMs.length;
  if (n === 0) {
    return {
      fpsMedian: 0,
      fpsPercentileLow: 0,
      frameMsMedian: 0,
      frameMsPercentileHigh: 0,
      framesSampled: 0,
    };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const medianIdx = Math.floor(n / 2);
  const highIdx = Math.min(n - 1, Math.ceil((PERCENTILE_HIGH / 100) * n) - 1);
  const medianMs = nth(sorted, medianIdx);
  const highMs = nth(sorted, highIdx);
  const msToFps = (ms: number): number => (ms > 0 ? 1000 / ms : 0);
  return {
    fpsMedian: msToFps(medianMs),
    fpsPercentileLow: msToFps(highMs),
    frameMsMedian: medianMs,
    frameMsPercentileHigh: highMs,
    framesSampled: n,
  };
}

/** Safe ordinal accessor (sorted ascending frame-duration samples). */
function nth(sorted: readonly number[], i: number): number {
  const v = sorted[Math.min(i, sorted.length - 1)];
  return v ?? 0;
}

/** Remove every HUD node (dispose chain leaf). */
export function destroyHud(handles: HudHandles): void {
  handles.perfPanel?.remove();
  handles.root.remove();
}
