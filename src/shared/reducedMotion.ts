/**
 * Pkg 155 (issue #155): single source of truth for the user's "reduce
 * motion" preference. The editor (splash exit, canvas) and the viewer
 * (idle camera drift, mode-transition fade) both read this instead of
 * each calling matchMedia, so the query string lives in exactly one
 * place.
 *
 * Everything degrades to "motion allowed" when the API is missing
 * (happy-dom, SSR-ish test seams), which keeps the helpers pure and
 * unit-testable without a real media engine.
 */

/** The media query backing every reduced-motion decision in the app. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface MotionQuery {
  matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

/** The live MediaQueryList, or null where matchMedia is unavailable. */
function motionQuery(): MotionQuery | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY) as unknown as MotionQuery;
  } catch {
    return null;
  }
}

/** True when the OS/browser asks for reduced motion. Default: false. */
export function prefersReducedMotion(): boolean {
  return motionQuery()?.matches ?? false;
}

/**
 * Subscribe to preference flips (the user toggles "Reduce motion" while
 * the app is open). Returns an unsubscribe function; a no-op when the
 * media query is unavailable. Uses the modern listener API with the
 * legacy addListener fallback.
 */
export function onReducedMotionChange(
  listener: (reduced: boolean) => void,
): () => void {
  const mq = motionQuery();
  if (!mq) return () => {};
  const onChange = (): void => listener(mq.matches);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }
  if (typeof mq.addListener === 'function') {
    mq.addListener(onChange);
    return () => mq.removeListener?.(onChange);
  }
  return () => {};
}
