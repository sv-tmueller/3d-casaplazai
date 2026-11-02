/**
 * Menu (issue #178): a popover list anchored to a trigger. The trigger
 * carries aria-haspopup/aria-expanded; opening focuses the first enabled
 * item; arrows, Home and End move between enabled items; Escape closes
 * and returns focus to the trigger; an outside pointerdown or Tab closes
 * without pulling focus back. Keys it handles never reach document
 * listeners (gap G1). Items may be a function so the list is rebuilt on
 * every open (e.g. the floor list).
 */
import './menu.css';
import { el, icon, uid } from './el';
import type { IconKey } from './icons';

export type MenuItem =
  | {
      id: string;
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      testid?: string;
      icon?: IconKey;
      danger?: boolean;
      /** Present = radio-style item (menuitemradio + aria-checked). */
      checked?: boolean;
      hint?: string;
      /** Extra data-* attributes for the item element. */
      data?: Record<string, string>;
    }
  | { separator: true }
  | { heading: string };

export interface MenuOptions {
  trigger: HTMLElement;
  label: string;
  items: ReadonlyArray<MenuItem> | (() => ReadonlyArray<MenuItem>);
  testid?: string;
  align?: 'start' | 'end';
  onOpenChange?: (open: boolean) => void;
}

export interface MenuHandle {
  readonly root: HTMLElement;
  open(): void;
  close(restoreFocus?: boolean): void;
  isOpen(): boolean;
  destroy(): void;
}

export function Menu(opts: MenuOptions): MenuHandle {
  const root = el('div', {
    class: 'ui-menu',
    attrs: { role: 'menu', id: uid('menu'), 'aria-label': opts.label, tabindex: '-1' },
    testid: opts.testid,
  });
  root.hidden = true;
  const trigger = opts.trigger;
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', root.id);
  let isOpen = false;

  const items = (): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter(
      (n) => n.getAttribute('aria-disabled') !== 'true',
    );

  const build = (): void => {
    root.replaceChildren();
    const list = typeof opts.items === 'function' ? opts.items() : opts.items;
    for (const item of list) {
      if ('separator' in item) {
        root.appendChild(el('div', { class: 'ui-menu-sep', attrs: { role: 'separator' } }));
        continue;
      }
      if ('heading' in item) {
        root.appendChild(el('div', { class: 'ui-menu-heading', attrs: { role: 'presentation' }, text: item.heading }));
        continue;
      }
      const node = el('button', {
        class: `ui-menu-item${item.danger ? ' ui-menu-item-danger' : ''}`,
        attrs: {
          type: 'button',
          role: item.checked === undefined ? 'menuitem' : 'menuitemradio',
          'aria-checked': item.checked === undefined ? undefined : String(item.checked),
          'aria-disabled': item.disabled ? 'true' : undefined,
          tabindex: '-1',
        },
        testid: item.testid,
        dataset: item.data,
      });
      if (item.icon) node.appendChild(icon(item.icon));
      node.appendChild(el('span', { class: 'ui-menu-label', text: item.label }));
      if (item.hint) node.appendChild(el('span', { class: 'ui-menu-hint', text: item.hint }));
      node.addEventListener('click', () => {
        if (item.disabled) return;
        close(true);
        item.onSelect();
      });
      root.appendChild(node);
    }
  };

  const place = (): void => {
    const r = trigger.getBoundingClientRect();
    root.style.top = `${r.bottom + 6}px`;
    if (opts.align === 'end') {
      root.style.left = '';
      root.style.right = `${Math.max(4, window.innerWidth - r.right)}px`;
    } else {
      root.style.right = '';
      root.style.left = `${Math.max(4, r.left)}px`;
    }
  };

  const onDocPointerDown = (ev: Event): void => {
    const t = ev.target as Node;
    if (root.contains(t) || trigger.contains(t)) return;
    close(false);
  };

  function open(): void {
    if (isOpen) return;
    build();
    if (!root.isConnected) document.body.appendChild(root);
    place();
    root.hidden = false;
    isOpen = true;
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDocPointerDown, true);
    (items()[0] ?? root).focus();
    opts.onOpenChange?.(true);
  }

  function close(restoreFocus = true): void {
    if (!isOpen) return;
    isOpen = false;
    root.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    if (restoreFocus && trigger.isConnected) trigger.focus();
    opts.onOpenChange?.(false);
  }

  const onTriggerClick = (): void => (isOpen ? close(true) : open());
  trigger.addEventListener('click', onTriggerClick);

  root.addEventListener('keydown', (ev) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (ev.key === 'ArrowDown') next = (i + 1) % list.length;
    else if (ev.key === 'ArrowUp') next = (i - 1 + list.length) % list.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = list.length - 1;
    else if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      close(true);
      return;
    } else if (ev.key === 'Tab') {
      close(false);
      return;
    } else if (ev.key.length === 1 || ev.key === 'Enter' || ev.key === ' ') {
      // Letters inside an open menu are not shortcuts; Enter/Space
      // activate the focused item natively (button click).
      ev.stopPropagation();
      return;
    } else return;
    ev.preventDefault();
    ev.stopPropagation();
    if (list.length > 0) list[next].focus();
  });

  return {
    root,
    open,
    close,
    isOpen: () => isOpen,
    destroy(): void {
      close(false);
      trigger.removeEventListener('click', onTriggerClick);
      root.remove();
    },
  };
}
