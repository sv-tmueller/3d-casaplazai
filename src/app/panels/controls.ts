/**
 * Command-bound controls (issue #178): every button, toggle, slider and
 * segment in the shell is built here from a registry command, so its
 * accessible name is the command label, its tooltip carries the
 * command's shortcut, and its pressed / disabled state is re-read from
 * the command on every refresh. Each control is stamped
 * data-command="<id>" (and data-arg for value commands).
 */
import { Button, type ButtonVariant } from '../../ui/button';
import { Segment, type SegmentOption } from '../../ui/segment';
import { Slider, type SliderTick } from '../../ui/slider';
import { Toggle } from '../../ui/toggle';
import type { IconKey } from '../../ui/icons';
import { shortcutHint, type CommandRegistry } from '../commands';
import type { ViewId } from '../state';

export class Binder {
  private readonly syncs: Array<() => void> = [];

  constructor(
    readonly registry: CommandRegistry,
    readonly view: () => ViewId,
  ) {}

  add(fn: () => void): void {
    this.syncs.push(fn);
    fn();
  }

  sync(): void {
    for (const fn of this.syncs) fn();
  }

  enabled(id: string): boolean {
    return this.registry.available(id, this.view());
  }
}

export interface CommandButtonOptions {
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  class?: string;
  icon?: IconKey;
  testid?: string;
  /** Value-command argument (stamped as data-arg). */
  arg?: string;
  /** Visible label for value commands (the option name, e.g. "Sofa"). */
  text?: string;
  /** Override the pressed predicate (value commands). */
  pressed?: () => boolean;
  /** Render as a toggle button even without a pressed predicate. */
  toggle?: boolean;
}

export function commandButton(b: Binder, id: string, opts: CommandButtonOptions = {}): HTMLButtonElement {
  const cmd = b.registry.get(id);
  const label = opts.text ?? cmd.label;
  const pressed = opts.pressed ?? cmd.pressed;
  const btn = Button({
    label,
    icon: opts.icon ?? cmd.icon,
    iconOnly: opts.iconOnly,
    variant: opts.variant,
    size: opts.size,
    class: opts.class,
    testid: opts.testid,
    shortcut: shortcutHint(cmd),
    pressed: pressed || opts.toggle ? false : undefined,
    onClick: () => cmd.run?.(opts.arg),
  });
  btn.root.dataset.command = id;
  if (opts.arg !== undefined) btn.root.dataset.arg = opts.arg;
  b.add(() => {
    btn.setDisabled(!b.enabled(id));
    if (pressed) btn.setPressed(pressed());
  });
  return btn.root;
}

export function commandToggle(b: Binder, id: string, testid?: string): HTMLElement {
  const cmd = b.registry.get(id);
  const t = Toggle({
    label: cmd.label,
    checked: cmd.pressed?.() ?? false,
    testid,
    onChange: () => {
      cmd.run?.();
      t.setChecked(cmd.pressed?.() ?? false);
    },
  });
  t.control.dataset.command = id;
  b.add(() => {
    t.setChecked(cmd.pressed?.() ?? false);
    t.setDisabled(!b.enabled(id));
  });
  return t.root;
}

export interface CommandSegmentOptions<V extends string> {
  options: ReadonlyArray<SegmentOption<V>>;
  value: () => V;
  testid?: string;
  size?: 'sm' | 'md';
}

export function commandSegment<V extends string>(
  b: Binder,
  id: string,
  opts: CommandSegmentOptions<V>,
): HTMLElement {
  const cmd = b.registry.get(id);
  const seg = Segment<V>({
    label: cmd.label,
    options: opts.options,
    value: opts.value(),
    testid: opts.testid,
    size: opts.size ?? 'sm',
    onChange: (v) => {
      if (!b.enabled(id)) return;
      cmd.run?.(v);
      seg.setValue(opts.value());
    },
  });
  seg.root.dataset.command = id;
  b.add(() => {
    seg.setValue(opts.value());
    const on = b.enabled(id);
    for (const o of opts.options) seg.setDisabled(o.value, !on || Boolean(o.disabled));
  });
  return seg.root;
}

export interface CommandSliderOptions {
  min: number;
  max: number;
  step: number;
  /** Command value → slider position. */
  value: () => number;
  /** Slider position → command argument. */
  toArg?: (position: number) => number;
  format: (position: number) => string;
  ticks?: ReadonlyArray<SliderTick>;
  testid?: string;
  chipTestid?: string;
  /** Commit on release instead of on every input. */
  commitOnChange?: boolean;
}

export function commandSlider(b: Binder, id: string, opts: CommandSliderOptions): HTMLElement {
  const cmd = b.registry.get(id);
  const toArg = opts.toArg ?? ((p: number) => p);
  const s = Slider({
    label: cmd.label,
    min: opts.min,
    max: opts.max,
    step: opts.step,
    value: opts.value(),
    format: opts.format,
    ticks: opts.ticks,
    testid: opts.testid,
    onInput: (p) => {
      if (!opts.commitOnChange) cmd.run?.(toArg(p));
    },
    onChange: (p) => {
      if (opts.commitOnChange) cmd.run?.(toArg(p));
    },
  });
  s.input.dataset.command = id;
  if (opts.chipTestid) s.chip.dataset.testid = opts.chipTestid;
  b.add(() => {
    if (document.activeElement !== s.input) s.setValue(opts.value());
    s.setDisabled(!b.enabled(id));
  });
  return s.root;
}
