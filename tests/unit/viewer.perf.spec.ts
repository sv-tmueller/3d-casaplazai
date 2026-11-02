// @vitest-environment happy-dom
/**
 * ?perf=1 overlay (issue #87; moved out of the retired HUD by #178, gap
 * G9): rolling frame statistics in a panel mounted on the 3D stage.
 */
import { describe, expect, it } from 'vitest';
import { PERF_WINDOW_SAMPLES, PerfOverlay, summarizeFrames } from '../../src/viewer/perf';

describe('summarizeFrames', () => {
  it('reports zeros for an empty window', () => {
    expect(summarizeFrames([])).toEqual({
      fpsMedian: 0,
      fpsPercentileLow: 0,
      frameMsMedian: 0,
      frameMsPercentileHigh: 0,
      framesSampled: 0,
    });
  });

  it('computes the median and the 95th-percentile frame time', () => {
    const samples = Array.from({ length: 100 }, (_, i) => (i < 95 ? 16 : 40));
    const s = summarizeFrames(samples);
    expect(s.frameMsMedian).toBe(16);
    expect(s.fpsMedian).toBeCloseTo(62.5, 6);
    expect(s.frameMsPercentileHigh).toBe(16);
    expect(s.framesSampled).toBe(100);
    const worse = summarizeFrames(Array.from({ length: 100 }, (_, i) => (i < 90 ? 16 : 40)));
    expect(worse.frameMsPercentileHigh).toBe(40);
    expect(worse.fpsPercentileLow).toBeCloseTo(25, 6);
  });
});

describe('PerfOverlay', () => {
  it('stays absent unless enabled', () => {
    const host = document.createElement('div');
    const off = new PerfOverlay(false);
    off.mount(host);
    expect(off.panel).toBeNull();
    expect(host.children).toHaveLength(0);
  });

  it('mounts into the given host and publishes rolling stats', () => {
    const host = document.createElement('div');
    const on = new PerfOverlay(true);
    on.mount(host);
    expect(host.querySelector('[data-testid="ws-perf-panel"]')).toBe(on.panel);
    for (let i = 0; i < PERF_WINDOW_SAMPLES + 10; i += 1) on.record(20);
    expect(on.panel?.textContent).toContain('fps med 50');
    expect(on.panel?.textContent).toContain(`n=${PERF_WINDOW_SAMPLES}`);
    on.destroy();
    expect(host.children).toHaveLength(0);
  });
});
