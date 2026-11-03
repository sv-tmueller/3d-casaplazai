/**
 * Walk overlay (issue #178, design §6.4): the centered "Click to walk"
 * prompt, the room pill top-center (its menu is Go to room, grouped per
 * storey), the hint strip bottom-center and the reticle. Driven by the
 * viewer through the shell's UI sink.
 */
import { el, icon } from '../../ui/el';
import { Menu, type MenuItem } from '../../ui/menu';
import type { Binder } from './controls';

export interface RoomPickerFloor {
  name: string;
  rooms: ReadonlyArray<{ id: string; name: string }>;
}

export interface WalkOverlay {
  readonly root: HTMLElement;
  setAffordances(s: { overlay: boolean; reticle: boolean }): void;
  setHint(text: string): void;
  setRoom(name: string | null): void;
  setRooms(floors: readonly RoomPickerFloor[]): void;
  destroy(): void;
}

/** Menu items for the Go-to-room list: one heading per storey. */
export function roomMenuItems(
  floors: readonly RoomPickerFloor[],
  pick: (roomId: string) => void,
): MenuItem[] {
  const items: MenuItem[] = [];
  for (const f of floors) {
    if (f.rooms.length === 0) continue;
    items.push({ heading: f.name });
    for (const r of f.rooms) {
      items.push({ id: r.id, label: r.name, testid: `ws-goto-${r.id}`, onSelect: () => pick(r.id) });
    }
  }
  if (items.length === 0) items.push({ heading: 'No rooms yet' });
  return items;
}

export function mountWalkOverlay(b: Binder): WalkOverlay {
  const cmd = b.registry.get('walk.gotoRoom');
  let floors: readonly RoomPickerFloor[] = [];
  const prompt = el(
    'div',
    { class: 'ws-walk-prompt', testid: 'ws-walk-prompt', attrs: { 'aria-live': 'polite' } },
    icon('walk'),
    el('span', { text: 'Click to walk' }),
  );
  const reticle = el('div', { class: 'ws-walk-reticle', testid: 'ws-walk-reticle', attrs: { 'aria-hidden': 'true' } });
  const roomName = el('span', { class: 'ws-walk-room', testid: 'ws-walk-room', text: 'Outside' });
  const pill = el(
    'button',
    {
      class: 'ws-walk-pill',
      attrs: { type: 'button', 'aria-label': `${cmd.label}: Outside` },
      testid: 'ws-walk-pill',
      dataset: { command: 'walk.gotoRoom' },
    },
    icon('walk'),
    roomName,
    icon('chevron-down'),
  );
  const menu = Menu({
    trigger: pill,
    label: cmd.label,
    testid: 'ws-goto-menu',
    items: () => roomMenuItems(floors, (id) => cmd.run?.(id)),
  });
  const hint = el('div', { class: 'ws-walk-hint', testid: 'ws-walk-hint', attrs: { 'aria-live': 'polite' } });
  const root = el('div', { class: 'ws-walk', testid: 'ws-walk' }, pill, prompt, reticle, hint);
  prompt.hidden = true;
  reticle.hidden = true;
  hint.hidden = true;
  return {
    root,
    setAffordances(s): void {
      prompt.hidden = !s.overlay;
      reticle.hidden = !s.reticle;
    },
    setHint(text: string): void {
      hint.textContent = text;
      hint.hidden = text === '';
    },
    setRoom(name: string | null): void {
      const shown = name ?? 'Outside';
      roomName.textContent = shown;
      pill.setAttribute('aria-label', `${cmd.label}: ${shown}`);
    },
    setRooms(next: readonly RoomPickerFloor[]): void {
      floors = next;
    },
    destroy(): void {
      menu.destroy();
    },
  };
}
