/**
 * Slider (issue #178): label, live value chip, optional tick labels,
 * native <input type="range"> underneath (arrow keys, Page keys and
 * Home/End come for free and stay accessible).
 */
import './slider.css';
import { el, uid } from './el';

export interface SliderTick {
  value: number;
  label: string;
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  format?: (value: number) => string;
  ticks?: ReadonlyArray<SliderTick>;
  onInput: (value: number) => void;
  /** Fired on release (native change event). */
  onChange?: (value: number) => void;
  testid?: string;
  disabled?: boolean;
}

export interface SliderHandle {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly chip: HTMLElement;
  value(): number;
  setValue(value: number): void;
  setDisabled(disabled: boolean): void;
}

export function Slider(opts: SliderOptions): SliderHandle {
  const format = opts.format ?? ((v: number) => String(v));
  const id = uid('slider');
  const input = el('input', {
    class: 'ui-slider-input',
    attrs: {
      id,
      type: 'range',
      min: opts.min,
      max: opts.max,
      step: opts.step ?? 1,
    },
    testid: opts.testid,
  });
  input.value = String(opts.value);
  input.disabled = opts.disabled ?? false;
  const chip = el('output', { class: 'ui-slider-chip ui-num', attrs: { for: id } });
  const root = el(
    'div',
    { class: 'ui-slider' },
    el('div', { class: 'ui-slider-head' }, el('label', { attrs: { for: id }, text: opts.label }), chip),
    input,
  );
  if (opts.ticks && opts.ticks.length > 0) {
    const ticks = el('div', { class: 'ui-slider-ticks', attrs: { 'aria-hidden': 'true' } });
    const span = opts.max - opts.min;
    for (const t of opts.ticks) {
      const tick = el('span', { class: 'ui-slider-tick', text: t.label });
      tick.style.left = `${((t.value - opts.min) / span) * 100}%`;
      ticks.appendChild(tick);
    }
    root.appendChild(ticks);
  }
  const syncChip = (): void => {
    chip.textContent = format(Number(input.value));
  };
  syncChip();
  input.addEventListener('input', () => {
    syncChip();
    opts.onInput(Number(input.value));
  });
  input.addEventListener('change', () => opts.onChange?.(Number(input.value)));
  return {
    root,
    input,
    chip,
    value: () => Number(input.value),
    setValue(value: number): void {
      input.value = String(value);
      syncChip();
    },
    setDisabled(disabled: boolean): void {
      input.disabled = disabled;
    },
  };
}
