/**
 * Field (issue #178): label plus input with an optional unit suffix.
 * Commits on Enter and on blur; a refused commit (onCommit returns
 * false) and Escape restore the last committed value.
 */
import './field.css';
import { el, uid } from './el';

export interface FieldOptions {
  label: string;
  value: string;
  type?: 'text' | 'number';
  unit?: string;
  placeholder?: string;
  testid?: string;
  /** Visually hide the label (it still names the input). */
  hideLabel?: boolean;
  /** Return false to refuse (the input reverts). */
  onCommit: (value: string) => boolean | void;
}

export interface FieldHandle {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  setValue(value: string): void;
  focus(): void;
}

export function Field(opts: FieldOptions): FieldHandle {
  const id = uid('field');
  const input = el('input', {
    class: 'ui-field-input',
    attrs: { id, type: opts.type ?? 'text', placeholder: opts.placeholder, autocomplete: 'off', spellcheck: 'false' },
    testid: opts.testid,
  });
  if (opts.type === 'number') input.step = 'any';
  let committed = opts.value;
  input.value = committed;
  const label = el('label', { class: `ui-field-label${opts.hideLabel ? ' ui-sr-only' : ''}`, attrs: { for: id }, text: opts.label });
  const box = el('div', { class: 'ui-field-box' }, input);
  if (opts.unit) box.appendChild(el('span', { class: 'ui-field-unit', text: opts.unit }));
  const root = el('div', { class: 'ui-field' }, label, box);

  const commit = (): void => {
    if (input.value === committed) return;
    const ok = opts.onCommit(input.value);
    if (ok === false) input.value = committed;
    else committed = input.value;
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commit();
    } else if (ev.key === 'Escape') {
      input.value = committed;
    }
  });
  input.addEventListener('blur', commit);

  return {
    root,
    input,
    setValue(value: string): void {
      committed = value;
      input.value = value;
    },
    focus(): void {
      input.focus();
      input.select();
    },
  };
}
