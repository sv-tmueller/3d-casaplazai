/**
 * Button (issue #178): primary, secondary, ghost and danger variants;
 * an icon-only variant names itself through aria-label and shows a
 * tooltip (label plus shortcut hint). Toggle buttons carry aria-pressed.
 */
import './button.css';
import { el, icon } from './el';
import type { IconKey } from './icons';
import { attachTooltip, type TooltipHandle } from './tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  icon?: IconKey;
  /** Render the icon only; the label becomes aria-label + tooltip. */
  iconOnly?: boolean;
  /** Shortcut hint appended to the tooltip, e.g. "Ctrl+Z". */
  shortcut?: string;
  /** Present = toggle button (aria-pressed). */
  pressed?: boolean;
  disabled?: boolean;
  testid?: string;
  /** Extra class names. */
  class?: string;
  size?: 'sm' | 'md';
  onClick?: (ev: MouseEvent) => void;
}

export interface ButtonHandle {
  readonly root: HTMLButtonElement;
  setPressed(pressed: boolean): void;
  setDisabled(disabled: boolean): void;
  setLabel(label: string): void;
  destroy(): void;
}

export function Button(opts: ButtonOptions): ButtonHandle {
  const variant = opts.variant ?? (opts.iconOnly ? 'ghost' : 'secondary');
  const classes = ['ui-btn', `ui-btn-${variant}`];
  if (opts.iconOnly) classes.push('ui-btn-icon');
  if (opts.size === 'sm') classes.push('ui-btn-sm');
  if (opts.class) classes.push(opts.class);
  const root = el('button', {
    class: classes.join(' '),
    attrs: { type: 'button' },
    testid: opts.testid,
  });
  if (opts.icon) root.appendChild(icon(opts.icon));
  const text = el('span', { class: 'ui-btn-label' });
  if (!opts.iconOnly) root.appendChild(text);

  let tooltip: TooltipHandle | null = null;
  const tooltipText = (label: string): string =>
    opts.shortcut ? `${label} (${opts.shortcut})` : label;

  const setLabel = (label: string): void => {
    if (opts.iconOnly) {
      root.setAttribute('aria-label', label);
      if (tooltip) tooltip.setText(tooltipText(label));
      else tooltip = attachTooltip(root, tooltipText(label));
    } else {
      text.textContent = label;
      if (opts.shortcut) root.title = tooltipText(label);
    }
  };
  setLabel(opts.label);

  const setPressed = (pressed: boolean): void => {
    root.setAttribute('aria-pressed', String(pressed));
  };
  if (opts.pressed !== undefined) setPressed(opts.pressed);
  root.disabled = opts.disabled ?? false;
  const onClick = opts.onClick;
  if (onClick) root.addEventListener('click', onClick);

  return {
    root,
    setPressed,
    setDisabled(disabled: boolean): void {
      root.disabled = disabled;
    },
    setLabel,
    destroy(): void {
      if (onClick) root.removeEventListener('click', onClick);
      tooltip?.destroy();
      root.remove();
    },
  };
}
