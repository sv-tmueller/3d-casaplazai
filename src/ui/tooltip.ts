/**
 * Tooltip (issue #178): delayed on hover, immediate on keyboard focus,
 * dismissed by Escape, mouse-leave or blur. The bubble is a
 * role="tooltip" element referenced by aria-describedby, mounted on
 * <body> and positioned below (or above, near the bottom edge) the
 * target.
 */
import './tooltip.css';
import { el, uid } from './el';

export interface TooltipOptions {
  /** Hover delay before showing (ms). Focus shows immediately. */
  delayMs?: number;
}

export interface TooltipHandle {
  readonly element: HTMLElement;
  setText(text: string): void;
  hide(): void;
  destroy(): void;
}

export function attachTooltip(
  target: HTMLElement,
  text: string,
  opts: TooltipOptions = {},
): TooltipHandle {
  const delay = opts.delayMs ?? 500;
  const tip = el('div', { class: 'ui-tooltip', attrs: { role: 'tooltip', id: uid('tip') }, text });
  tip.hidden = true;
  target.setAttribute('aria-describedby', tip.id);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const place = (): void => {
    if (!tip.isConnected) document.body.appendChild(tip);
    const r = target.getBoundingClientRect();
    const below = r.bottom + 40 < window.innerHeight;
    tip.style.left = `${Math.max(4, r.left + r.width / 2)}px`;
    tip.style.top = below ? `${r.bottom + 6}px` : `${r.top - 6}px`;
    tip.dataset.side = below ? 'below' : 'above';
  };
  const show = (): void => {
    if (tip.textContent === '') return;
    place();
    tip.hidden = false;
  };
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const hide = (): void => {
    clear();
    tip.hidden = true;
  };
  const onEnter = (): void => {
    clear();
    timer = setTimeout(show, delay);
  };
  const onFocus = (): void => {
    clear();
    show();
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' && !tip.hidden) hide();
  };
  target.addEventListener('mouseenter', onEnter);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', hide);
  target.addEventListener('pointerdown', hide);
  target.addEventListener('keydown', onKey);

  return {
    element: tip,
    setText(next: string): void {
      tip.textContent = next;
    },
    hide,
    destroy(): void {
      hide();
      target.removeEventListener('mouseenter', onEnter);
      target.removeEventListener('mouseleave', hide);
      target.removeEventListener('focus', onFocus);
      target.removeEventListener('blur', hide);
      target.removeEventListener('pointerdown', hide);
      target.removeEventListener('keydown', onKey);
      if (target.getAttribute('aria-describedby') === tip.id) {
        target.removeAttribute('aria-describedby');
      }
      tip.remove();
    },
  };
}
