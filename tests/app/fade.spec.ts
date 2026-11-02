// @vitest-environment happy-dom
/**
 * Mode-transition veil (issue #178; ported from the HUD spec, pkg 155,
 * gap G12): reduced motion resolves at once with no veil and no timer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FADE_DURATION_MS, playFade } from '../../src/app/panels/fade';

const stubReducedMotion = (reduced: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

afterEach(() => vi.useRealTimers());

describe('playFade', () => {
  it('resolves immediately under reduced motion (no veil, no timer)', async () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    const veil = document.createElement('div');
    let settled = false;
    void playFade(veil).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(veil.classList.contains('ws-fade-active')).toBe(false);
  });

  it('plays the veil when motion is allowed', async () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    const veil = document.createElement('div');
    const done = playFade(veil);
    expect(veil.classList.contains('ws-fade-active')).toBe(true);
    vi.advanceTimersByTime(FADE_DURATION_MS);
    await done;
    expect(veil.classList.contains('ws-fade-active')).toBe(false);
  });
});
