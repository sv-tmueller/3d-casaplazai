// @vitest-environment happy-dom
/**
 * Pkg 155 (issue #155) — keyboard focus management for the editor's
 * popovers. Pins the four promises the a11y pass makes: focus lands on
 * the first control when the popover opens, Tab cycles forward with
 * wrap, Shift+Tab cycles backward with wrap, and releasing the trap
 * returns focus to the invoking control.
 *
 * The trap listens on the POPOVER ELEMENT (never the document), so the
 * "Tab outside the popover is untouched" case is pinned too — that is
 * the #143-safe property the sub-plan calls out.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  focusablesWithin,
  trapFocus,
  type FocusTrap,
} from '../../src/editor/popoverFocus';

interface Fixture {
  invoker: HTMLButtonElement;
  container: HTMLDivElement;
  first: HTMLInputElement;
  second: HTMLInputElement;
  last: HTMLButtonElement;
  disabled: HTMLButtonElement;
  hidden: HTMLInputElement;
}

function mkFixture(): Fixture {
  document.body.innerHTML = '';
  const invoker = document.createElement('button');
  invoker.textContent = 'Snap';
  document.body.appendChild(invoker);

  const container = document.createElement('div');
  container.hidden = true;
  const first = document.createElement('input');
  first.type = 'radio';
  const second = document.createElement('input');
  second.type = 'radio';
  const disabled = document.createElement('button');
  disabled.disabled = true;
  const hidden = document.createElement('input');
  hidden.hidden = true;
  const last = document.createElement('button');
  last.textContent = 'Apply';
  container.append(first, second, disabled, hidden, last);
  document.body.appendChild(container);
  return { invoker, container, first, second, last, disabled, hidden };
}

function pressTab(from: HTMLElement, shift = false): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  from.dispatchEvent(ev);
  return ev;
}

describe('focusablesWithin (pkg 155)', () => {
  it('skips disabled and hidden controls, keeps document order', () => {
    const f = mkFixture();
    f.container.hidden = false;
    expect(focusablesWithin(f.container)).toEqual([f.first, f.second, f.last]);
  });
});

describe('trapFocus (pkg 155)', () => {
  let f: Fixture;
  let trap: FocusTrap;

  beforeEach(() => {
    f = mkFixture();
    f.container.hidden = false;
    trap = trapFocus(f.container, f.invoker);
  });

  it('focuses the first focusable control when the popover opens', () => {
    expect(document.activeElement).toBe(f.first);
  });

  it('leaves focus untouched when focusInitial is false', () => {
    const g = mkFixture();
    g.container.hidden = false;
    g.last.focus();
    trapFocus(g.container, g.invoker, { focusInitial: false });
    expect(document.activeElement).toBe(g.last);
  });

  it('Tab from the last control wraps to the first', () => {
    f.last.focus();
    const ev = pressTab(f.last);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(f.first);
  });

  it('Shift+Tab from the first control wraps to the last', () => {
    f.first.focus();
    const ev = pressTab(f.first, true);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(f.last);
  });

  it('Tab advances to the next control in document order', () => {
    f.first.focus();
    pressTab(f.first);
    expect(document.activeElement).toBe(f.second);
  });

  it('Shift+Tab steps back to the previous control', () => {
    f.second.focus();
    pressTab(f.second, true);
    expect(document.activeElement).toBe(f.first);
  });

  it('ignores Tab pressed outside the popover (element-scoped, #143-safe)', () => {
    f.first.focus();
    pressTab(f.invoker);
    expect(document.activeElement).toBe(f.first);
  });

  it('release() restores focus to the invoker', () => {
    f.second.focus();
    trap.release();
    expect(document.activeElement).toBe(f.invoker);
  });

  it('release() leaves focus alone once it moved outside the popover', () => {
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    document.body.appendChild(canvas);
    canvas.focus();
    trap.release();
    expect(document.activeElement).toBe(canvas);
  });

  it('release() detaches the Tab handler', () => {
    trap.release();
    f.invoker.focus();
    f.first.focus();
    pressTab(f.first);
    expect(document.activeElement).toBe(f.first);
    expect(f.invoker.getAttribute('aria-expanded')).toBeNull();
  });

  it('marks the popover with a tabindex so it is a reachable dialog', () => {
    expect(f.container.getAttribute('tabindex')).toBe('-1');
  });
});

describe('radio groups are one tab stop (issue #155 e2e regression)', () => {
  function mkRadioPopover(): {
    popover: HTMLElement;
    radios: HTMLInputElement[];
    slider: HTMLInputElement;
  } {
    document.body.innerHTML = '';
    const popover = document.createElement('div');
    const fieldset = document.createElement('fieldset');
    const radios = [0, 1, 2, 3].map((i) => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'lean-seg';
      radio.value = String(i);
      radio.dataset.testid = `lean-seg-${i}`;
      fieldset.appendChild(radio);
      return radio;
    });
    radios[0].checked = true;
    popover.appendChild(fieldset);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.dataset.testid = 'lean-slider';
    popover.appendChild(slider);
    document.body.appendChild(popover);
    return { popover, radios, slider };
  }

  it('counts a checked radio group once, keeping the native Tab order', () => {
    const { popover, slider } = mkRadioPopover();
    // Was [radio, radio, radio, radio, slider] before the fix — one Tab
    // then landed on the next radio and the #83 flow stalled.
    expect(focusablesWithin(popover)).toEqual([popover.querySelector('[data-testid="lean-seg-0"]'), slider]);
  });

  it('Tab from the checked radio reaches the control after the group', () => {
    const { popover, radios, slider } = mkRadioPopover();
    const trap: FocusTrap = trapFocus(popover, null, { focusInitial: false });
    radios[0].focus();
    pressTab(radios[0]);
    expect(document.activeElement).toBe(slider);
    trap.release();
  });

  it('falls back to the first radio when none is checked', () => {
    const { popover, radios } = mkRadioPopover();
    radios[0].checked = false;
    expect(focusablesWithin(popover)[0]).toBe(radios[0]);
  });
});
