/**
 * Segment (issue #178): a radio group of pills (role="radiogroup").
 * CONTROLLED: a click or arrow key requests a value through onChange;
 * the owner decides and calls setValue, so the segment shows the
 * current state, never the requested one (the view segment relies on
 * this — design §6.1). Arrow keys it handles never reach document
 * listeners (gap G1).
 */
import './segment.css';
import { el, icon } from './el';
import type { IconKey } from './icons';

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: IconKey;
  disabled?: boolean;
  testid?: string;
  /** Tooltip / title text (e.g. the shortcut). */
  title?: string;
}

export interface SegmentOptions<V extends string> {
  /** Accessible name of the group. */
  label: string;
  options: ReadonlyArray<SegmentOption<V>>;
  value: V;
  onChange: (value: V) => void;
  testid?: string;
  size?: 'sm' | 'md';
}

export interface SegmentHandle<V extends string> {
  readonly root: HTMLElement;
  value(): V;
  setValue(value: V): void;
  setDisabled(value: V, disabled: boolean): void;
  item(value: V): HTMLButtonElement;
}

export function Segment<V extends string>(opts: SegmentOptions<V>): SegmentHandle<V> {
  const root = el('div', {
    class: `ui-segment${opts.size === 'sm' ? ' ui-segment-sm' : ''}`,
    attrs: { role: 'radiogroup', 'aria-label': opts.label },
    testid: opts.testid,
  });
  let current = opts.value;
  const disabled = new Set<V>();
  const items = new Map<V, HTMLButtonElement>();

  for (const opt of opts.options) {
    const btn = el('button', {
      class: 'ui-segment-item',
      attrs: { type: 'button', role: 'radio', title: opt.title },
      testid: opt.testid,
      dataset: { value: opt.value },
    });
    if (opt.icon) btn.appendChild(icon(opt.icon));
    btn.appendChild(el('span', { text: opt.label }));
    btn.addEventListener('click', () => {
      if (disabled.has(opt.value)) return;
      opts.onChange(opt.value);
    });
    items.set(opt.value, btn);
    root.appendChild(btn);
    if (opt.disabled) disabled.add(opt.value);
  }

  const order = opts.options.map((o) => o.value);

  const sync = (): void => {
    for (const [value, btn] of items) {
      const checked = value === current;
      btn.setAttribute('aria-checked', String(checked));
      btn.tabIndex = checked ? 0 : -1;
      if (disabled.has(value)) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
    }
  };
  sync();

  root.addEventListener('keydown', (ev) => {
    const from = order.indexOf((ev.target as HTMLElement).dataset.value as V);
    if (from === -1) return;
    let step: number;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') step = 1;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') step = -1;
    else if (ev.key === 'Home' || ev.key === 'End') step = ev.key === 'Home' ? -Infinity : Infinity;
    else return;
    ev.preventDefault();
    ev.stopPropagation();
    const enabled = order.filter((v) => !disabled.has(v));
    if (enabled.length === 0) return;
    let target: V;
    if (step === -Infinity) target = enabled[0];
    else if (step === Infinity) target = enabled[enabled.length - 1];
    else {
      let i = from;
      do {
        i = (i + step + order.length) % order.length;
      } while (disabled.has(order[i]) && i !== from);
      target = order[i];
    }
    items.get(target)?.focus();
    opts.onChange(target);
  });

  return {
    root,
    value: () => current,
    setValue(value: V): void {
      current = value;
      sync();
    },
    setDisabled(value: V, isDisabled: boolean): void {
      if (isDisabled) disabled.add(value);
      else disabled.delete(value);
      sync();
    },
    item: (value: V) => items.get(value)!,
  };
}
