/**
 * Empty state (issue #178, restyled from #144; design §6.4): a centered
 * card in the Plan view while the plan has no rooms and Select is armed
 * — Draw a room, Load a demo plan, Load a JSON file. The card body is
 * transparent to canvas gestures; only its buttons catch the pointer.
 * The 3D views show a matching card over the empty plot.
 */
import { el, icon } from '../../ui/el';
import { DEMOS, type DemoId } from '../../editor/demos';
import type { FloorplanData } from '../../shared/schema';

/** No rooms on any storey (stairs need rooms, so rooms decide). */
export function planIsEmpty(plan: FloorplanData): boolean {
  return plan.floors.every((f) => f.rooms.length === 0);
}

export interface EmptyStateActions {
  drawRoom(): void;
  loadDemo(id: DemoId): void;
  importJson(): void;
}

export interface EmptyState {
  readonly root: HTMLElement;
  setVisible(visible: boolean): void;
}

export function mountEmptyState(actions: EmptyStateActions): EmptyState {
  const demoRow = el(
    'div',
    { class: 'ws-empty-demos', testid: 'ws-empty-demo-row', attrs: { role: 'group', 'aria-label': 'Demo plans' } },
    ...DEMOS.map((d) =>
      el(
        'button',
        {
          class: 'ui-btn ui-btn-secondary ui-btn-sm',
          attrs: { type: 'button', title: d.hint },
          testid: `ws-empty-demo-${d.id}`,
          on: { click: () => actions.loadDemo(d.id) },
        },
        d.label,
      ),
    ),
  );
  demoRow.hidden = true;
  const demoBtn = el(
    'button',
    {
      class: 'ui-btn ui-btn-secondary',
      attrs: { type: 'button', 'aria-expanded': 'false' },
      testid: 'ws-empty-demo',
      on: {
        click: () => {
          demoRow.hidden = !demoRow.hidden;
          demoBtn.setAttribute('aria-expanded', String(!demoRow.hidden));
        },
      },
    },
    icon('plan'),
    'Load a demo plan',
  );
  const root = el(
    'div',
    { class: 'ws-empty ui-card', testid: 'ws-empty', attrs: { role: 'region', 'aria-label': 'Get started' } },
    el('h2', { class: 'ws-empty-title', text: 'Start your floor plan' }),
    el('p', { class: 'ws-empty-text', text: 'Draw a room, open a demo, or load a plan you saved earlier.' }),
    el(
      'div',
      { class: 'ws-empty-actions' },
      el(
        'button',
        {
          class: 'ui-btn ui-btn-primary',
          attrs: { type: 'button' },
          testid: 'ws-empty-draw',
          on: { click: () => actions.drawRoom() },
        },
        icon('rectangle'),
        'Draw a room',
      ),
      demoBtn,
      el(
        'button',
        {
          class: 'ui-btn ui-btn-secondary',
          attrs: { type: 'button' },
          testid: 'ws-empty-import',
          on: { click: () => actions.importJson() },
        },
        icon('upload'),
        'Load a JSON file',
      ),
    ),
    demoRow,
  );
  return {
    root,
    setVisible(visible: boolean): void {
      root.hidden = !visible;
      if (!visible) {
        demoRow.hidden = true;
        demoBtn.setAttribute('aria-expanded', 'false');
      }
    },
  };
}

/** The 3D views' counterpart over the empty plot. */
export function mountEmpty3d(goToPlan: () => void): EmptyState {
  const root = el(
    'div',
    { class: 'ws-empty ws-empty-3d ui-card', testid: 'ws-3d-empty', attrs: { role: 'region', 'aria-label': 'Nothing to show' } },
    el('h2', { class: 'ws-empty-title', text: 'Nothing to show in 3D yet' }),
    el('p', { class: 'ws-empty-text', text: 'Draw a room in the Plan view and it appears here.' }),
    el(
      'div',
      { class: 'ws-empty-actions' },
      el(
        'button',
        { class: 'ui-btn ui-btn-primary', attrs: { type: 'button' }, testid: 'ws-3d-empty-plan', on: { click: goToPlan } },
        icon('plan'),
        'Go to the Plan view',
      ),
    ),
  );
  root.hidden = true;
  return {
    root,
    setVisible(visible: boolean): void {
      root.hidden = !visible;
    },
  };
}
