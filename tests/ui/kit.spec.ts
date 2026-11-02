// @vitest-environment happy-dom
/**
 * Component kit (issue #178, design §5.2 / §9): keyboard behaviour and
 * accessible names of the framework-free controls in src/ui/. Every
 * component returns its root element plus a small handle; the tests
 * drive the real DOM through happy-dom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { el } from '../../src/ui/el';
import { Button } from '../../src/ui/button';
import { Segment } from '../../src/ui/segment';
import { Toggle } from '../../src/ui/toggle';
import { Slider } from '../../src/ui/slider';
import { Field } from '../../src/ui/field';
import { Tabs } from '../../src/ui/tabs';
import { Card } from '../../src/ui/card';
import { attachTooltip } from '../../src/ui/tooltip';
import { Menu } from '../../src/ui/menu';

function key(target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('el()', () => {
  it('builds an element with class, attributes, dataset and children', () => {
    const node = el(
      'div',
      { class: 'a b', attrs: { 'aria-label': 'Box', hidden: false }, dataset: { testid: 'box' } },
      el('span', { text: 'hi' }),
      'tail',
      null,
    );
    expect(node.className).toBe('a b');
    expect(node.getAttribute('aria-label')).toBe('Box');
    expect(node.hasAttribute('hidden')).toBe(false);
    expect(node.dataset.testid).toBe('box');
    expect(node.textContent).toBe('hitail');
  });

  it('wires event listeners from the on map', () => {
    const spy = vi.fn();
    const btn = el('button', { on: { click: spy } });
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('Button', () => {
  it('icon-only variant carries the label as aria-label and hides the icon', () => {
    const b = Button({ label: 'Undo', icon: 'undo', iconOnly: true });
    expect(b.root.tagName).toBe('BUTTON');
    expect(b.root.type).toBe('button');
    expect(b.root.getAttribute('aria-label')).toBe('Undo');
    expect(b.root.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('labelled variant shows visible text and toggles pressed/disabled', () => {
    const onClick = vi.fn();
    const b = Button({ label: 'Rectangle', icon: 'rectangle', pressed: false, onClick });
    expect(b.root.textContent).toContain('Rectangle');
    expect(b.root.getAttribute('aria-pressed')).toBe('false');
    b.setPressed(true);
    expect(b.root.getAttribute('aria-pressed')).toBe('true');
    b.root.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    b.setDisabled(true);
    expect(b.root.disabled).toBe(true);
  });

  it('applies the variant class', () => {
    expect(Button({ label: 'Go', variant: 'primary' }).root.classList).toContain('ui-btn-primary');
    expect(Button({ label: 'Kill', variant: 'danger' }).root.classList).toContain('ui-btn-danger');
  });
});

describe('Segment', () => {
  const mk = (onChange = vi.fn()) => {
    const seg = Segment({
      label: 'View',
      value: 'plan',
      options: [
        { value: 'plan', label: 'Plan' },
        { value: '3d', label: '3D' },
        { value: 'walk', label: 'Walk' },
      ],
      onChange,
    });
    document.body.appendChild(seg.root);
    return { seg, onChange };
  };

  it('is a radiogroup of radios with one tab stop on the checked item', () => {
    const { seg } = mk();
    expect(seg.root.getAttribute('role')).toBe('radiogroup');
    expect(seg.root.getAttribute('aria-label')).toBe('View');
    const radios = [...seg.root.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('is controlled: a click requests the value but does not check it', () => {
    const { seg, onChange } = mk();
    (seg.root.querySelectorAll<HTMLElement>('[role="radio"]')[1]).click();
    expect(onChange).toHaveBeenCalledWith('3d');
    expect(seg.value()).toBe('plan');
    seg.setValue('3d');
    expect(seg.value()).toBe('3d');
    const radios = [...seg.root.querySelectorAll('[role="radio"]')];
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[1].getAttribute('tabindex')).toBe('0');
  });

  it('arrow keys move focus and request the neighbour, wrapping, and stop propagation', () => {
    const { seg, onChange } = mk();
    const radios = [...seg.root.querySelectorAll<HTMLElement>('[role="radio"]')];
    radios[0].focus();
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    key(radios[0], 'ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('3d');
    expect(document.activeElement).toBe(radios[1]);
    key(radios[1], 'ArrowLeft');
    key(radios[0], 'ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith('walk');
    expect(document.activeElement).toBe(radios[2]);
    expect(docSpy).not.toHaveBeenCalled();
    document.removeEventListener('keydown', docSpy);
  });

  it('skips disabled options on click and arrow', () => {
    const { seg, onChange } = mk();
    seg.setDisabled('3d', true);
    const radios = [...seg.root.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios[1].getAttribute('aria-disabled')).toBe('true');
    radios[1].click();
    expect(onChange).not.toHaveBeenCalled();
    radios[0].focus();
    key(radios[0], 'ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('walk');
  });

  it('leaves unrelated keys to bubble (letters reach the document)', () => {
    const { seg } = mk();
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    key(seg.root.querySelector('[role="radio"]')!, 'v');
    expect(docSpy).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', docSpy);
  });
});

describe('Toggle', () => {
  it('is a switch named by its visible label and flips on click', () => {
    const onChange = vi.fn();
    const t = Toggle({ label: 'Grid', checked: true, onChange });
    document.body.appendChild(t.root);
    expect(t.control.getAttribute('role')).toBe('switch');
    expect(t.control.getAttribute('aria-checked')).toBe('true');
    expect(t.control.textContent).toContain('Grid');
    t.control.click();
    expect(onChange).toHaveBeenCalledWith(false);
    expect(t.control.getAttribute('aria-checked')).toBe('false');
    t.setChecked(true);
    expect(t.control.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Slider', () => {
  it('wraps a labelled native range with a live value chip and ticks', () => {
    const onInput = vi.fn();
    const s = Slider({
      label: 'Time of day',
      min: 0,
      max: 24,
      step: 0.25,
      value: 12,
      format: (v) => `${v}:00`,
      ticks: [{ value: 6, label: '6:00' }, { value: 18, label: '18:00' }],
      onInput,
    });
    document.body.appendChild(s.root);
    expect(s.input.type).toBe('range');
    const label = s.root.querySelector('label');
    expect(label?.getAttribute('for')).toBe(s.input.id);
    expect(label?.textContent).toBe('Time of day');
    expect(s.chip.textContent).toBe('12:00');
    expect([...s.root.querySelectorAll('.ui-slider-tick')].map((t) => t.textContent)).toEqual([
      '6:00',
      '18:00',
    ]);
    s.input.value = '18';
    s.input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith(18);
    expect(s.chip.textContent).toBe('18:00');
    s.setValue(6);
    expect(s.input.value).toBe('6');
    expect(s.chip.textContent).toBe('6:00');
  });
});

describe('Field', () => {
  it('labels the input, shows the unit suffix and commits on Enter', () => {
    const onCommit = vi.fn(() => true);
    const f = Field({ label: 'Width', value: '0.9', unit: 'm', onCommit });
    document.body.appendChild(f.root);
    expect(f.root.querySelector('label')?.getAttribute('for')).toBe(f.input.id);
    expect(f.root.querySelector('.ui-field-unit')?.textContent).toBe('m');
    f.input.value = '1.2';
    const ev = key(f.input, 'Enter');
    expect(onCommit).toHaveBeenCalledWith('1.2');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('restores the last value on Escape and on a refused commit', () => {
    const f = Field({ label: 'Name', value: 'Living', onCommit: () => false });
    document.body.appendChild(f.root);
    f.input.value = 'x';
    key(f.input, 'Enter');
    expect(f.input.value).toBe('Living');
    f.input.value = 'y';
    key(f.input, 'Escape');
    expect(f.input.value).toBe('Living');
  });
});

describe('Tabs', () => {
  const mk = () => {
    const onSelect = vi.fn();
    const tabs = Tabs({
      label: 'Tools',
      selected: 'build',
      tabs: [
        { id: 'build', label: 'Build', panel: el('div', { text: 'B' }) },
        { id: 'view', label: 'View', panel: el('div', { text: 'V' }) },
        { id: 'measure', label: 'Measure', panel: el('div', { text: 'M' }) },
      ],
      onSelect,
    });
    document.body.appendChild(tabs.root);
    return { tabs, onSelect };
  };

  it('renders a tablist wired to its panels', () => {
    const { tabs } = mk();
    const list = tabs.root.querySelector('[role="tablist"]')!;
    expect(list.getAttribute('aria-label')).toBe('Tools');
    const tab = list.querySelectorAll('[role="tab"]');
    expect(tab).toHaveLength(3);
    const panel = document.getElementById(tab[0].getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab[0].id);
    expect(panel.hidden).toBe(false);
    expect(tabs.panel('view').parentElement?.hidden).toBe(true);
  });

  it('arrow keys select the next tab (automatic activation) and wrap', () => {
    const { tabs, onSelect } = mk();
    const tab = [...tabs.root.querySelectorAll<HTMLElement>('[role="tab"]')];
    tab[0].focus();
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    key(tab[0], 'ArrowRight');
    expect(tabs.selected()).toBe('view');
    expect(onSelect).toHaveBeenLastCalledWith('view');
    expect(document.activeElement).toBe(tab[1]);
    key(tab[1], 'End');
    expect(tabs.selected()).toBe('measure');
    key(tab[2], 'ArrowRight');
    expect(tabs.selected()).toBe('build');
    key(tab[0], 'ArrowLeft');
    expect(tabs.selected()).toBe('measure');
    expect(docSpy).not.toHaveBeenCalled();
    document.removeEventListener('keydown', docSpy);
    expect(tab[2].getAttribute('aria-selected')).toBe('true');
    expect(tab[2].getAttribute('tabindex')).toBe('0');
    expect(tab[0].getAttribute('tabindex')).toBe('-1');
  });
});

describe('Card', () => {
  it('collapses its body through an aria-expanded header button', () => {
    const onToggle = vi.fn();
    const card = Card({ title: 'Inspector', collapsible: true, onToggle }, el('p', { text: 'x' }));
    document.body.appendChild(card.root);
    const btn = card.root.querySelector<HTMLButtonElement>('.ui-card-collapse')!;
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click();
    expect(card.collapsed()).toBe(true);
    expect(card.body.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('appears after a delay on hover and at once on focus; Escape hides it', () => {
    const target = el('button', { text: 'B' });
    document.body.appendChild(target);
    const tip = attachTooltip(target, 'Undo (Ctrl+Z)', { delayMs: 400 });
    target.dispatchEvent(new Event('mouseenter'));
    expect(tip.element.hidden).toBe(true);
    vi.advanceTimersByTime(400);
    expect(tip.element.hidden).toBe(false);
    expect(tip.element.getAttribute('role')).toBe('tooltip');
    target.dispatchEvent(new Event('mouseleave'));
    expect(tip.element.hidden).toBe(true);
    target.dispatchEvent(new Event('focus'));
    expect(tip.element.hidden).toBe(false);
    expect(target.getAttribute('aria-describedby')).toBe(tip.element.id);
    key(target, 'Escape');
    expect(tip.element.hidden).toBe(true);
    tip.destroy();
    expect(tip.element.isConnected).toBe(false);
  });
});

describe('Menu', () => {
  const mk = () => {
    const trigger = el('button', { text: 'File' });
    document.body.appendChild(trigger);
    const onA = vi.fn();
    const onB = vi.fn();
    const menu = Menu({
      trigger,
      label: 'File',
      items: [
        { id: 'a', label: 'Import JSON', onSelect: onA },
        { separator: true },
        { id: 'b', label: 'Save JSON', onSelect: onB },
        { id: 'c', label: 'Disabled', onSelect: vi.fn(), disabled: true },
      ],
    });
    return { trigger, menu, onA, onB };
  };

  it('opens from its trigger, focuses the first item and wires aria', () => {
    const { trigger, menu } = mk();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    expect(menu.isOpen()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu.root.getAttribute('role')).toBe('menu');
    const items = menu.root.querySelectorAll<HTMLElement>('[role="menuitem"]');
    expect(document.activeElement).toBe(items[0]);
  });

  it('arrow keys cycle enabled items and stop propagation', () => {
    const { trigger, menu } = mk();
    trigger.click();
    const items = [...menu.root.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    key(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key(items[1], 'ArrowDown'); // skips the disabled item, wraps
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'ArrowUp');
    expect(document.activeElement).toBe(items[1]);
    expect(docSpy).not.toHaveBeenCalled();
    document.removeEventListener('keydown', docSpy);
  });

  it('Escape closes and returns focus to the trigger', () => {
    const { trigger, menu } = mk();
    trigger.click();
    key(document.activeElement!, 'Escape');
    expect(menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('an outside pointerdown closes without stealing focus back', () => {
    const { trigger, menu } = mk();
    const other = el('input');
    document.body.appendChild(other);
    trigger.click();
    other.focus();
    other.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(other);
  });

  it('choosing an item closes the menu and runs it', () => {
    const { trigger, menu, onB } = mk();
    trigger.click();
    const items = [...menu.root.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    items[1].click();
    expect(menu.isOpen()).toBe(false);
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it('a second trigger click toggles the menu closed', () => {
    const { trigger, menu } = mk();
    trigger.click();
    trigger.click();
    expect(menu.isOpen()).toBe(false);
  });
});
