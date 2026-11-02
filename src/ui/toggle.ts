/**
 * Toggle (issue #178): a switch with a visible label. The control is a
 * button with role="switch" whose accessible name is its own label text.
 */
import './toggle.css';
import { el } from './el';

export interface ToggleOptions {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testid?: string;
}

export interface ToggleHandle {
  readonly root: HTMLElement;
  readonly control: HTMLButtonElement;
  checked(): boolean;
  setChecked(checked: boolean): void;
  setDisabled(disabled: boolean): void;
}

export function Toggle(opts: ToggleOptions): ToggleHandle {
  let state = opts.checked;
  const control = el(
    'button',
    { class: 'ui-toggle', attrs: { type: 'button', role: 'switch' }, testid: opts.testid },
    el('span', { class: 'ui-toggle-label', text: opts.label }),
    el('span', { class: 'ui-toggle-track', attrs: { 'aria-hidden': 'true' } }, el('span', { class: 'ui-toggle-thumb' })),
  );
  const root = el('div', { class: 'ui-toggle-row' }, control);
  const sync = (): void => control.setAttribute('aria-checked', String(state));
  sync();
  control.disabled = opts.disabled ?? false;
  control.addEventListener('click', () => {
    state = !state;
    sync();
    opts.onChange(state);
  });
  return {
    root,
    control,
    checked: () => state,
    setChecked(checked: boolean): void {
      state = checked;
      sync();
    },
    setDisabled(disabled: boolean): void {
      control.disabled = disabled;
    },
  };
}
