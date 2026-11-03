/**
 * Card (issue #178): the floating surface every panel sits on, with an
 * optional header and an optional collapse button (aria-expanded).
 */
import './card.css';
import { append, el, icon, uid, type Child } from './el';

export interface CardOptions {
  title?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  testid?: string;
  class?: string;
  /** Landmark role + label for the card root (e.g. "complementary"). */
  role?: string;
  ariaLabel?: string;
}

export interface CardHandle {
  readonly root: HTMLElement;
  readonly header: HTMLElement | null;
  readonly body: HTMLElement;
  collapsed(): boolean;
  setCollapsed(collapsed: boolean): void;
  setTitle(title: string): void;
}

export function Card(opts: CardOptions, ...children: Child[]): CardHandle {
  const root = el('section', {
    class: `ui-card${opts.class ? ` ${opts.class}` : ''}`,
    testid: opts.testid,
    attrs: { role: opts.role, 'aria-label': opts.ariaLabel },
  });
  const body = el('div', { class: 'ui-card-body', attrs: { id: uid('card') } });
  append(body, ...children);
  let header: HTMLElement | null = null;
  let titleEl: HTMLElement | null = null;
  let collapseBtn: HTMLButtonElement | null = null;
  let collapsed = opts.collapsed ?? false;

  if (opts.title !== undefined || opts.collapsible) {
    titleEl = el('h2', { class: 'ui-card-title', text: opts.title ?? '' });
    header = el('header', { class: 'ui-card-header' }, titleEl);
    if (opts.collapsible) {
      collapseBtn = el('button', {
        class: 'ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm ui-card-collapse',
        attrs: { type: 'button', 'aria-controls': body.id, 'aria-label': `Collapse ${opts.title ?? 'panel'}` },
      }, icon('chevron-up'));
      collapseBtn.addEventListener('click', () => {
        setCollapsed(!collapsed);
        opts.onToggle?.(collapsed);
      });
      header.appendChild(collapseBtn);
    }
    root.appendChild(header);
  }
  root.appendChild(body);

  function setCollapsed(next: boolean): void {
    collapsed = next;
    body.hidden = collapsed;
    root.classList.toggle('ui-card-collapsed', collapsed);
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
      collapseBtn.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${opts.title ?? 'panel'}`);
    }
  }
  setCollapsed(collapsed);

  return {
    root,
    header,
    body,
    collapsed: () => collapsed,
    setCollapsed,
    setTitle(title: string): void {
      if (titleEl) titleEl.textContent = title;
    },
  };
}
