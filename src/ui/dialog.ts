/**
 * Dialog (issue #178): a modal card over a scrim, replacing the
 * confirm / export / help modals. Focus moves inside on open (first
 * control, or `initialFocus`), Tab wraps (focusTrap), Escape and a
 * scrim click cancel with null, and focus returns to whatever held it
 * before. One dialog at a time: opening a second cancels the first.
 * Every key pressed inside stays inside — document-level shortcut and
 * engine listeners never see it.
 */
import './dialog.css';
import { append, el, uid, type Child } from './el';
import { trapFocus } from './focusTrap';
import type { ButtonVariant } from './button';

export interface DialogAction<T> {
  label: string;
  value: T | null;
  variant?: ButtonVariant;
  testid?: string;
}

export interface DialogOptions<T> {
  title: string;
  body: Child | Child[];
  actions?: ReadonlyArray<DialogAction<T>>;
  testid?: string;
  /** Element inside `body` to focus first (default: first control). */
  initialFocus?: HTMLElement;
  size?: 'sm' | 'md' | 'lg';
}

export interface DialogHandle<T> {
  readonly root: HTMLElement;
  readonly card: HTMLElement;
  readonly result: Promise<T | null>;
  close(value: T | null): void;
}

let current: DialogHandle<unknown> | null = null;

export function isDialogOpen(): boolean {
  return current !== null;
}

/** Cancel the open dialog (if any) with null. */
export function closeDialog(): void {
  current?.close(null);
}

export function openDialog<T>(opts: DialogOptions<T>): DialogHandle<T> {
  current?.close(null);
  const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleId = uid('dlg-title');
  const body = el('div', { class: 'ui-dialog-body' });
  append(body, ...(Array.isArray(opts.body) ? opts.body : [opts.body]));
  const card = el(
    'div',
    {
      class: `ui-dialog ui-dialog-${opts.size ?? 'md'}`,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      testid: opts.testid,
    },
    el('h2', { class: 'ui-dialog-title', attrs: { id: titleId }, text: opts.title }),
    body,
  );
  const root = el('div', { class: 'ui-dialog-scrim', testid: opts.testid ? `${opts.testid}-backdrop` : undefined }, card);

  let resolve!: (v: T | null) => void;
  const result = new Promise<T | null>((r) => {
    resolve = r;
  });
  let closed = false;

  if (opts.actions && opts.actions.length > 0) {
    const footer = el('div', { class: 'ui-dialog-actions' });
    for (const action of opts.actions) {
      const btn = el('button', {
        class: `ui-btn ui-btn-${action.variant ?? 'secondary'}`,
        attrs: { type: 'button' },
        testid: action.testid,
        text: action.label,
      });
      btn.addEventListener('click', () => handle.close(action.value));
      footer.appendChild(btn);
    }
    card.appendChild(footer);
  }

  document.body.appendChild(root);
  const trap = trapFocus(card, invoker, { focusInitial: opts.initialFocus === undefined });
  opts.initialFocus?.focus();

  root.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') {
      ev.preventDefault();
      handle.close(null);
    }
  });
  root.addEventListener('click', (ev) => {
    if (ev.target === root) handle.close(null);
  });

  const handle: DialogHandle<T> = {
    root,
    card,
    result,
    close(value: T | null): void {
      if (closed) return;
      closed = true;
      if (current === (handle as DialogHandle<unknown>)) current = null;
      trap.release();
      root.remove();
      resolve(value);
    },
  };
  current = handle as DialogHandle<unknown>;
  return handle;
}
