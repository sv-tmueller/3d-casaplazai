/**
 * Pkg 155 (issue #155): keyboard focus management for the editor popovers
 * (Snap / Floor / Underlay / Lean) and the export dialog. Small and
 * generic on purpose — the caller owns open/close state, this module
 * only moves focus into a container, cycles Tab within it, and hands
 * focus back to the invoking control on release.
 *
 * #143-safe by construction: the Tab listener is attached to the
 * CONTAINER element (never `document`) and Escape handling stays in
 * glue.ts's existing capture-phase listeners, so nothing here can
 * swallow keys meant for the canvas/draw machinery.
 */

export interface FocusTrap {
  /** Detach the Tab handler and restore focus to the invoker. */
  release(): void;
}

export interface TrapOptions {
  /**
   * Move focus to the first focusable control on activation (default
   * true). Pass false when the caller already focuses a specific
   * control on open — e.g. the floor popover selects its rename field,
   * which must keep both the focus AND the selection.
   */
  focusInitial?: boolean;
}

/** Tab-reachable, enabled controls, in document order. */
const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Radios sharing a name form ONE tab stop in the browser's own tab order
 * — the checked one (the first when none is checked). Without this the
 * trap turned a single Tab into "next radio" inside a group, which broke
 * the issue-#83 keyboard flow in e2e/roofs.spec.ts when the trap landed.
 */
function isRadioTabStop(el: HTMLInputElement, scope: HTMLElement): boolean {
  if (el.name === '') return true; // ungrouped radio: a stop of its own
  const group = Array.from(
    scope.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).filter((radio) => radio.name === el.name);
  if (group.length < 2) return true;
  const checked = group.find((radio) => radio.checked);
  return checked === undefined ? group[0] === el : checked === el;
}

function isFocusable(el: Element, scope: HTMLElement): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.hidden) return false;
  if (el.closest('[hidden]') !== null) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
  if (el instanceof HTMLInputElement && el.type === 'radio' && !isRadioTabStop(el, scope)) {
    return false;
  }
  const tabindex = el.getAttribute('tabindex');
  if (tabindex !== null && Number(tabindex) < 0) return false;
  return true;
}

/** Every control inside `container` that Tab should reach, in order. */
export function focusablesWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => isFocusable(el, container));
}

/**
 * Trap Tab inside `container` until `release()`; on release, return
 * focus to `invoker` — but only when focus is still inside the popover
 * (or on the body), so a close caused by clicking somewhere else never
 * yanks focus back.
 */
export function trapFocus(
  container: HTMLElement,
  invoker: HTMLElement | null,
  opts: TrapOptions = {},
): FocusTrap {
  const { focusInitial = true } = opts;
  // Dialogs are expected to be focusable themselves; this also gives
  // keyboard users a landing spot when the popover has no controls yet.
  if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Tab') return;
    const items = focusablesWithin(container);
    if (items.length === 0) {
      ev.preventDefault();
      container.focus();
      return;
    }
    const active = container.ownerDocument.activeElement;
    const idx = active === null ? -1 : items.indexOf(active as HTMLElement);
    const step = ev.shiftKey ? -1 : 1;
    const next = idx === -1
      ? (ev.shiftKey ? items.length - 1 : 0)
      : (idx + step + items.length) % items.length;
    // Take over from the browser's own (unbounded) tab order.
    ev.preventDefault();
    items[next].focus();
  };
  container.addEventListener('keydown', onKeyDown, true);

  if (focusInitial) {
    const first = focusablesWithin(container)[0];
    if (first) first.focus();
    else container.focus();
  }

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    container.removeEventListener('keydown', onKeyDown, true);
    const doc = container.ownerDocument;
    const active = doc.activeElement;
    const focusStayed = active !== null && (active === doc.body || container.contains(active));
    if (focusStayed && invoker !== null && invoker.isConnected) invoker.focus();
  };

  return { release };
}
