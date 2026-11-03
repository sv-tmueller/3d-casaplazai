/**
 * Toast stack (issue #178; semantics ported from the viewer HUD, #148 and
 * pkg 155). A polite live region; error toasts announce assertively
 * (role="alert"). An identical variant+text repeat collapses onto the
 * live node with a ×N counter and a fresh TTL; a repeat landing during
 * the leaving fade starts a fresh node. Reduced motion skips the fade.
 */
import './toast.css';
import { el, icon } from './el';
import { prefersReducedMotion } from '../shared/reducedMotion';

export const TOAST_TTL_MS = 4200;
export const TOAST_LEAVE_MS = 350;
export const TOAST_MAX = 4;

export type ToastVariant = 'info' | 'error' | 'success';

interface LiveToast {
  node: HTMLElement;
  count: number;
  timer: ReturnType<typeof setTimeout> | null;
  ttl: number;
}

export interface ToastStackHandle {
  readonly root: HTMLElement;
  show(text: string, variant?: ToastVariant, opts?: { ttlMs?: number }): void;
  dismissErrors(): void;
  clear(): void;
}

export function ToastStack(opts: { testid?: string } = {}): ToastStackHandle {
  const root = el('div', {
    class: 'ui-toasts',
    attrs: { role: 'status', 'aria-live': 'polite' },
    testid: opts.testid,
  });
  const live = new Map<string, LiveToast>();
  const keyOf = (variant: string, text: string): string => `${variant}\u0000${text}`;

  const remove = (key: string, entry: LiveToast): void => {
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = null;
    if (live.get(key) === entry) live.delete(key);
    entry.node.remove();
  };

  const arm = (key: string, entry: LiveToast): void => {
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (live.get(key) === entry) live.delete(key);
      if (prefersReducedMotion()) {
        entry.node.remove();
        return;
      }
      entry.node.classList.add('ui-toast-leaving');
      setTimeout(() => entry.node.remove(), TOAST_LEAVE_MS);
    }, entry.ttl);
  };

  return {
    root,
    show(text: string, variant: ToastVariant = 'info', showOpts: { ttlMs?: number } = {}): void {
      const key = keyOf(variant, text);
      const existing = live.get(key);
      if (existing) {
        existing.count += 1;
        let badge = existing.node.querySelector('.ui-toast-count');
        if (!badge) {
          badge = el('span', { class: 'ui-toast-count ui-num' });
          existing.node.insertBefore(badge, existing.node.querySelector('.ui-toast-close'));
        }
        badge.textContent = `×${existing.count}`;
        existing.ttl = showOpts.ttlMs ?? existing.ttl;
        arm(key, existing);
        return;
      }
      const close = el('button', {
        class: 'ui-toast-close',
        attrs: { type: 'button', 'aria-label': 'Dismiss' },
      }, icon('close'));
      const node = el(
        'div',
        {
          class: `ui-toast ui-toast-${variant}`,
          attrs: { role: variant === 'error' ? 'alert' : 'status' },
          dataset: { variant },
          testid: 'ws-toast',
        },
        el('span', { class: 'ui-toast-text', text }),
        close,
      );
      const entry: LiveToast = { node, count: 1, timer: null, ttl: showOpts.ttlMs ?? TOAST_TTL_MS };
      close.addEventListener('click', () => remove(key, entry));
      root.appendChild(node);
      live.set(key, entry);
      arm(key, entry);
      while (root.children.length > TOAST_MAX) {
        const oldest = root.firstElementChild as HTMLElement;
        for (const [k, e] of live) if (e.node === oldest) remove(k, e);
        oldest.remove();
      }
    },
    dismissErrors(): void {
      for (const [key, entry] of [...live]) {
        if (entry.node.dataset.variant === 'error') remove(key, entry);
      }
    },
    clear(): void {
      for (const [key, entry] of [...live]) remove(key, entry);
      root.replaceChildren();
    },
  };
}
