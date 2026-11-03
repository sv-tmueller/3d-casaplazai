/**
 * Confirm and prompt dialogs (issue #178; replaces editor/confirmDialog,
 * #144). Built on the kit Dialog: focus lands on Cancel, Escape and the
 * scrim cancel, Tab wraps, a second dialog cancels the first.
 */
import { el } from '../../ui/el';
import { Field } from '../../ui/field';
import { openDialog } from '../../ui/dialog';

/** Discard-guard copy: names the Save JSON lifeline (#144 AC). */
export const CONFIRM_MSG = 'Replace the current plan? Save JSON first — this cannot be undone.';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const handle = openDialog<boolean>({
    title: opts.title,
    testid: 'ws-confirm',
    size: 'sm',
    body: el('p', { class: 'ws-dialog-text', testid: 'ws-confirm-message', text: opts.message }),
    actions: [
      { label: 'Cancel', value: false, testid: 'ws-confirm-cancel' },
      { label: opts.confirmLabel, value: true, variant: opts.danger ? 'danger' : 'primary', testid: 'ws-confirm-ok' },
    ],
  });
  return handle.result.then((v) => v === true);
}

export interface PromptOptions {
  title: string;
  label: string;
  value: string;
  confirmLabel: string;
}

/** One-field prompt (floor rename). Resolves the trimmed text or null. */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  let current = opts.value;
  const field = Field({
    label: opts.label,
    value: opts.value,
    testid: 'ws-prompt-input',
    onCommit: (v) => {
      current = v;
    },
  });
  field.input.addEventListener('input', () => {
    current = field.input.value;
  });
  const handle = openDialog<string>({
    title: opts.title,
    testid: 'ws-prompt',
    size: 'sm',
    body: field.root,
    initialFocus: field.input,
    actions: [
      { label: 'Cancel', value: null, testid: 'ws-prompt-cancel' },
      { label: opts.confirmLabel, value: '\u0000ok', variant: 'primary', testid: 'ws-prompt-ok' },
    ],
  });
  field.input.select();
  field.input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') handle.close('\u0000ok');
  });
  return handle.result.then((v) => (v === null ? null : current.trim()));
}
