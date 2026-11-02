// @vitest-environment happy-dom
/**
 * Kit Dialog and Toast (issue #178). Ports the behaviour pinned for the
 * retired confirmDialog / exportDialog / helpModal and the viewer HUD
 * toast stack (gap G12): focus on open, Escape, Tab wrap, a second
 * dialog cancelling the first, invoker focus return; toast
 * de-duplication with the xN counter, TTL reset, fresh node mid-fade,
 * live-region politeness, dismissErrors, reduced motion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { el } from '../../src/ui/el';
import { isDialogOpen, openDialog } from '../../src/ui/dialog';
import { TOAST_LEAVE_MS, TOAST_TTL_MS, ToastStack } from '../../src/ui/toast';

function key(target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

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

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Dialog', () => {
  const open = () => {
    const invoker = el('button', { text: 'Open' });
    document.body.appendChild(invoker);
    invoker.focus();
    const handle = openDialog<string>({
      title: 'Replace the current plan?',
      body: el('p', { text: 'Body copy' }),
      testid: 'dlg',
      actions: [
        { label: 'Cancel', value: null, testid: 'dlg-cancel' },
        { label: 'Replace plan', value: 'ok', variant: 'primary', testid: 'dlg-ok' },
      ],
    });
    return { invoker, handle };
  };

  it('is a labelled modal and focuses its first control', () => {
    const { handle } = open();
    expect(isDialogOpen()).toBe(true);
    const dlg = handle.root.querySelector('[role="dialog"]')!;
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    const titleId = dlg.getAttribute('aria-labelledby')!;
    expect(document.getElementById(titleId)?.textContent).toBe('Replace the current plan?');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('dlg-cancel');
  });

  it('resolves with the clicked action value and returns focus', async () => {
    const { invoker, handle } = open();
    (handle.root.querySelector('[data-testid="dlg-ok"]') as HTMLElement).click();
    await expect(handle.result).resolves.toBe('ok');
    expect(isDialogOpen()).toBe(false);
    expect(handle.root.isConnected).toBe(false);
    expect(document.activeElement).toBe(invoker);
  });

  it('Escape cancels with null', async () => {
    const { handle } = open();
    key(document.activeElement!, 'Escape');
    await expect(handle.result).resolves.toBeNull();
  });

  it('Tab wraps inside the dialog in both directions', () => {
    const { handle } = open();
    const cancel = handle.root.querySelector<HTMLElement>('[data-testid="dlg-cancel"]')!;
    const ok = handle.root.querySelector<HTMLElement>('[data-testid="dlg-ok"]')!;
    ok.focus();
    key(ok, 'Tab');
    expect(document.activeElement).toBe(cancel);
    key(cancel, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(ok);
  });

  it('a backdrop click cancels; a click inside the card does not', async () => {
    const { handle } = open();
    const card = handle.root.querySelector<HTMLElement>('[role="dialog"]')!;
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(isDialogOpen()).toBe(true);
    handle.root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(handle.result).resolves.toBeNull();
  });

  it('a second dialog cancels the first', async () => {
    const first = open().handle;
    const second = openDialog({ title: 'Second', body: el('p'), actions: [{ label: 'OK', value: 1 }] });
    await expect(first.result).resolves.toBeNull();
    expect(first.root.isConnected).toBe(false);
    expect(second.root.isConnected).toBe(true);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    second.close(null);
  });

  it('keyboard events inside the dialog never reach document listeners', () => {
    open();
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    key(document.activeElement!, 'v');
    expect(spy).not.toHaveBeenCalled();
    document.removeEventListener('keydown', spy);
  });
});

describe('ToastStack', () => {
  let stack: ReturnType<typeof ToastStack>;
  const nodes = (): HTMLElement[] => [...stack.root.querySelectorAll<HTMLElement>('.ui-toast')];
  const badge = (n: HTMLElement): HTMLElement | null => n.querySelector('.ui-toast-count');

  beforeEach(() => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    stack = ToastStack();
    document.body.appendChild(stack.root);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a polite live region; errors announce assertively', () => {
    expect(stack.root.getAttribute('role')).toBe('status');
    expect(stack.root.getAttribute('aria-live')).toBe('polite');
    stack.show('Render failed', 'error');
    stack.show('Mode switched');
    const [err, info] = nodes();
    expect(err.getAttribute('role')).toBe('alert');
    expect(info.getAttribute('role')).toBe('status');
  });

  it('stacks distinct messages oldest first', () => {
    stack.show('first');
    stack.show('second');
    expect(nodes().map((n) => n.querySelector('.ui-toast-text')?.textContent)).toEqual([
      'first',
      'second',
    ]);
  });

  it('collapses a repeat into one node with an xN counter', () => {
    stack.show('boom', 'error');
    stack.show('boom', 'error');
    expect(nodes()).toHaveLength(1);
    expect(badge(nodes()[0])?.textContent).toBe('×2');
    stack.show('boom', 'error');
    expect(badge(nodes()[0])?.textContent).toBe('×3');
    stack.show('boom', 'info');
    expect(nodes()).toHaveLength(2);
  });

  it('resets the TTL on a repeat', () => {
    stack.show('still here');
    vi.advanceTimersByTime(TOAST_TTL_MS - 50);
    stack.show('still here');
    vi.advanceTimersByTime(TOAST_TTL_MS - 50);
    expect(nodes()[0].classList.contains('ui-toast-leaving')).toBe(false);
    vi.advanceTimersByTime(50);
    expect(nodes()[0].classList.contains('ui-toast-leaving')).toBe(true);
    vi.advanceTimersByTime(TOAST_LEAVE_MS);
    expect(nodes()).toHaveLength(0);
  });

  it('starts a fresh uncounted node when a repeat lands mid-fade', () => {
    stack.show('cycle');
    vi.advanceTimersByTime(TOAST_TTL_MS + 10);
    stack.show('cycle');
    expect(nodes()).toHaveLength(2);
    const fresh = nodes()[1];
    expect(badge(fresh)).toBeNull();
    vi.advanceTimersByTime(TOAST_LEAVE_MS);
    expect(nodes()).toEqual([fresh]);
  });

  it('dismissErrors drops error nodes now and forgets them', () => {
    stack.show('fyi', 'info');
    stack.show('boom', 'error');
    stack.dismissErrors();
    expect(nodes()).toHaveLength(1);
    stack.show('boom', 'error');
    expect(nodes()).toHaveLength(2);
    expect(badge(nodes()[1])).toBeNull();
  });

  it('caps the stack, dropping the oldest', () => {
    for (const t of ['a', 'b', 'c', 'd', 'e']) stack.show(t);
    expect(nodes()).toHaveLength(4);
    expect(nodes()[0].querySelector('.ui-toast-text')?.textContent).toBe('b');
  });

  it('honours a per-toast TTL', () => {
    stack.show('long', 'info', { ttlMs: 10_000 });
    vi.advanceTimersByTime(TOAST_TTL_MS + TOAST_LEAVE_MS + 10);
    expect(nodes()).toHaveLength(1);
  });

  it('removes at once under reduced motion (no leaving fade)', () => {
    stubReducedMotion(true);
    stack.show('quick');
    vi.advanceTimersByTime(TOAST_TTL_MS);
    expect(nodes()).toHaveLength(0);
  });

  it('a dismiss button closes the toast', () => {
    stack.show('closable');
    nodes()[0].querySelector<HTMLButtonElement>('.ui-toast-close')!.click();
    expect(nodes()).toHaveLength(0);
  });
});
