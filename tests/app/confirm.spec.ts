// @vitest-environment happy-dom
/**
 * Confirm / prompt dialogs on the kit (issue #178; ported from the
 * retired editor/confirmDialog cases of #144, gap G12): copy carries the
 * Save JSON lifeline, focus lands on Cancel, Escape and Cancel resolve
 * false, Tab wraps, and a second dialog cancels the first.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIRM_MSG, confirmDialog, promptDialog } from '../../src/app/dialogs/confirm';
import { isDialogOpen } from '../../src/ui/dialog';

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const key = (t: Element, k: string, init: KeyboardEventInit = {}) =>
  t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('confirmDialog', () => {
  it('CONFIRM_MSG names the Save JSON lifeline', () => {
    expect(CONFIRM_MSG).toContain('Save JSON');
  });

  it('renders title and message and focuses Cancel', () => {
    void confirmDialog({ title: 'Replace?', message: CONFIRM_MSG, confirmLabel: 'Replace plan' });
    expect(q('ws-confirm-message')?.textContent).toBe(CONFIRM_MSG);
    expect(document.activeElement).toBe(q('ws-confirm-cancel'));
  });

  it('Escape resolves false and unmounts', async () => {
    const p = confirmDialog({ title: 'T', message: 'M', confirmLabel: 'OK' });
    key(document.activeElement!, 'Escape');
    await expect(p).resolves.toBe(false);
    expect(isDialogOpen()).toBe(false);
    expect(q('ws-confirm')).toBeNull();
  });

  it('Cancel resolves false, Confirm resolves true', async () => {
    const a = confirmDialog({ title: 'T', message: 'M', confirmLabel: 'OK' });
    q('ws-confirm-cancel')!.click();
    await expect(a).resolves.toBe(false);
    const b = confirmDialog({ title: 'T', message: 'M', confirmLabel: 'OK' });
    q('ws-confirm-ok')!.click();
    await expect(b).resolves.toBe(true);
  });

  it('confines Tab to Cancel and Confirm, both ways', () => {
    void confirmDialog({ title: 'T', message: 'M', confirmLabel: 'OK' });
    const cancel = q('ws-confirm-cancel')!;
    const ok = q('ws-confirm-ok')!;
    key(cancel, 'Tab');
    expect(document.activeElement).toBe(ok);
    key(ok, 'Tab');
    expect(document.activeElement).toBe(cancel);
    key(cancel, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(ok);
  });

  it('a second call cancels the first (no orphaned promise)', async () => {
    const first = confirmDialog({ title: 'T', message: 'M', confirmLabel: 'OK' });
    const second = confirmDialog({ title: 'T2', message: 'M2', confirmLabel: 'OK' });
    await expect(first).resolves.toBe(false);
    expect(document.querySelectorAll('[data-testid="ws-confirm"]')).toHaveLength(1);
    q('ws-confirm-ok')!.click();
    await expect(second).resolves.toBe(true);
  });
});

describe('promptDialog', () => {
  it('focuses the field and resolves the trimmed text on Enter', async () => {
    const p = promptDialog({ title: 'Rename floor', label: 'Floor name', value: 'Ground', confirmLabel: 'Rename' });
    const input = q('ws-prompt-input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    input.value = '  Attic ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    key(input, 'Enter');
    await expect(p).resolves.toBe('Attic');
  });

  it('Cancel resolves null', async () => {
    const p = promptDialog({ title: 'Rename', label: 'Name', value: 'x', confirmLabel: 'OK' });
    q('ws-prompt-cancel')!.click();
    await expect(p).resolves.toBeNull();
  });
});
