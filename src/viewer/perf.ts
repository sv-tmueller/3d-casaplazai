/**
 * ?perf=1 overlay (issue #87; moved out of the retired viewer HUD by
 * issue #178, gap G9). Created only when the param is present; the
 * controller pushes raw frame durations and the panel publishes rolling
 * stats (median + 95th-percentile band). Mounted on the 3D stage.
 */
import type { FrameStats } from './types';

/** Rolling window length (frames). */
export const PERF_WINDOW_SAMPLES = 240;

const PERCENTILE_HIGH = 95;

export class PerfOverlay {
  public readonly panel: HTMLPreElement | null;

  private readonly samplesMs: number[] = [];

  public constructor(enabled: boolean) {
    this.panel = enabled ? document.createElement('pre') : null;
    if (this.panel) {
      this.panel.className = 'ws-perf-panel';
      this.panel.dataset.testid = 'ws-perf-panel';
      this.panel.textContent = 'sampling…';
    }
  }

  /** Append the panel to its host (call once after construct). */
  public mount(host: HTMLElement | null | undefined): void {
    if (this.panel && host) host.appendChild(this.panel);
  }

  /** Feed one raw frame duration (ms); recomputes published stats. */
  public record(frameMs: number): FrameStats {
    this.samplesMs.push(frameMs);
    while (this.samplesMs.length > PERF_WINDOW_SAMPLES) this.samplesMs.shift();
    const stats = summarizeFrames(this.samplesMs);
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

/** Median + percentile band over a copy of frame times. */
export function summarizeFrames(samplesMs: readonly number[]): FrameStats {
  const n = samplesMs.length;
  if (n === 0) {
    return { fpsMedian: 0, fpsPercentileLow: 0, frameMsMedian: 0, frameMsPercentileHigh: 0, framesSampled: 0 };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const at = (i: number): number => sorted[Math.min(i, sorted.length - 1)] ?? 0;
  const medianMs = at(Math.floor(n / 2));
  const highMs = at(Math.min(n - 1, Math.ceil((PERCENTILE_HIGH / 100) * n) - 1));
  const msToFps = (ms: number): number => (ms > 0 ? 1000 / ms : 0);
  return {
    fpsMedian: msToFps(medianMs),
    fpsPercentileLow: msToFps(highMs),
    frameMsMedian: medianMs,
    frameMsPercentileHigh: highMs,
    framesSampled: n,
  };
}
