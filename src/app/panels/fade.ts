/**
 * Mode-transition veil (issue #178; ported from the viewer HUD, #6 /
 * pkg 155): a brief dip so the camera jump between orbit and walk reads
 * as intentional. Reduced motion resolves at once with no veil and no
 * timer.
 */
import { prefersReducedMotion } from '../../shared/reducedMotion';

export const FADE_DURATION_MS = 320;

export function playFade(veil: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    veil.classList.add('ws-fade-active');
    window.setTimeout(() => {
      veil.classList.remove('ws-fade-active');
      resolve();
    }, FADE_DURATION_MS);
  });
}
