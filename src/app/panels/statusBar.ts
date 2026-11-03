/**
 * Status bar (issue #178, design §6.5): selection summary or the armed
 * tool's hint on the left, the cursor in meters in the middle, the
 * livable-area total, units and zoom on the right. The overlap warning
 * rides the left zone. No entity-count debug string.
 */
import { el } from '../../ui/el';

export interface StatusBar {
  readonly root: HTMLElement;
  setHint(text: string): void;
  setCursor(world: readonly [number, number] | null): void;
  setTotal(text: string): void;
  setZoom(percent: number): void;
  setOverlaps(count: number): void;
}

export function mountStatusBar(): StatusBar {
  const hint = el('span', { class: 'ws-status-hint', testid: 'ws-status-hint' });
  const overlap = el('span', {
    class: 'ws-status-warn',
    testid: 'ws-overlap',
    attrs: { role: 'status' },
    text: 'Rooms overlap',
  });
  overlap.hidden = true;
  const cursor = el('span', { class: 'ws-status-cursor ui-num', testid: 'ws-status-cursor' });
  const total = el('span', { class: 'ws-status-total ui-num', testid: 'ws-status-total' });
  const zoom = el('span', { class: 'ws-status-zoom ui-num', testid: 'ws-status-zoom', text: '100 %' });
  const root = el(
    'footer',
    { class: 'ws-statusbar', testid: 'ws-statusbar' },
    el('div', { class: 'ws-status-start' }, hint, overlap),
    el('div', { class: 'ws-status-center' }, cursor),
    el(
      'div',
      { class: 'ws-status-end' },
      total,
      el('span', { class: 'ws-status-sep', attrs: { 'aria-hidden': 'true' }, text: '·' }),
      el('span', { class: 'ws-status-units', text: 'm', attrs: { title: 'Units: meters' } }),
      el('span', { class: 'ws-status-sep', attrs: { 'aria-hidden': 'true' }, text: '·' }),
      zoom,
    ),
  );
  return {
    root,
    setHint(text: string): void {
      hint.textContent = text;
      hint.title = text;
    },
    setCursor(world): void {
      cursor.textContent = world === null ? '' : `x ${world[0].toFixed(2)}  y ${world[1].toFixed(2)}`;
    },
    setTotal(text: string): void {
      total.textContent = text;
    },
    setZoom(percent: number): void {
      zoom.textContent = `${Math.round(percent)} %`;
    },
    setOverlaps(count: number): void {
      overlap.hidden = count === 0;
    },
  };
}
