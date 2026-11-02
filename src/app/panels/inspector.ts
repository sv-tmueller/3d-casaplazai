/**
 * Inspector (issue #178, design §6.3): the floating right card. It
 * appears when a selection starts and hides when it ends; `I` (or the
 * top-bar toggle) shows it at any time, including the no-selection plan
 * and floor settings. The property fields are the existing inspector
 * panel (editor/inspectorPanel.ts) mounted through its PanelDispatch
 * seam and re-skinned; its actions (Wall lean, Delete) are commands.
 * Escape inside the card closes it (a pending measure anchor dies
 * first), `I` typed outside a field inside it closes it too.
 */
import { el } from '../../ui/el';
import { mountInspectorPanel, type SelectionDescriptor } from '../../editor/inspectorPanel';
import { FURNITURE_DEFAULTS } from '../../editor/model/constants';
import type { EditorEngine } from '../../editor/engine';
import type { EditorStore } from '../../editor/store';
import type { AppState } from '../state';
import { isTypingTarget } from '../keyboard';
import { Binder, commandButton } from './controls';

export interface Inspector {
  readonly root: HTMLElement;
  onSelection(desc: SelectionDescriptor): void;
  sync(): void;
  /** After `L`: focus the lean field (never mid-gesture). */
  focusLean(): void;
}

export function selectionKey(desc: SelectionDescriptor): string {
  switch (desc.kind) {
    case 'room':
      return `room:${desc.room.id}`;
    case 'wall':
      return `room:${desc.room.id}`;
    case 'opening':
      return `opening:${desc.opening.id}`;
    case 'furniture':
      return `furniture:${desc.item.id}`;
    case 'stair':
      return `stair:${desc.stair.id}`;
    case 'multi':
      return 'multi';
    default:
      return 'none';
  }
}

/** One-line description for the card title and the status bar. */
export function describeSelection(desc: SelectionDescriptor): string {
  switch (desc.kind) {
    case 'room':
      return desc.room.name;
    case 'wall':
      return `Wall ${desc.segIndex + 1} · ${desc.room.name}`;
    case 'opening':
      return desc.opening.kind === 'door' ? 'Door' : 'Window';
    case 'furniture':
      return FURNITURE_DEFAULTS[desc.item.type]?.label ?? 'Furniture';
    case 'stair':
      return 'Staircase';
    case 'multi': {
      const n = Object.values(desc.counts).reduce((a, c) => a + c, 0);
      return `${n} items selected`;
    }
    default:
      return 'Plan';
  }
}

export interface InspectorDeps {
  binder: Binder;
  app: AppState;
  store: EditorStore;
  engine: EditorEngine;
  flashError(text: string): void;
}

export function mountInspector(deps: InspectorDeps): Inspector {
  const { binder: b, app, store, engine } = deps;
  const panel = mountInspectorPanel(
    (cmd) => store.dispatch(cmd as Parameters<typeof store.dispatch>[0]),
    (msg) => deps.flashError(msg),
  );
  panel.setOpen(true);
  const title = el('h2', { class: 'ui-card-title ws-inspector-title', testid: 'ws-inspector-title', text: 'Plan' });
  const leanBtn = commandButton(b, 'inspector.lean', { size: 'sm', variant: 'ghost', testid: 'ws-inspector-lean' });
  const deleteBtn = commandButton(b, 'edit.delete', { iconOnly: true, variant: 'ghost', testid: 'ws-inspector-delete' });
  const root = el(
    'aside',
    { class: 'ws-inspector ui-card', testid: 'ws-inspector', attrs: { 'aria-label': 'Inspector', tabindex: '-1' } },
    el('header', { class: 'ui-card-header' }, title, el('div', { class: 'ws-inspector-actions' }, leanBtn, deleteBtn)),
    el('div', { class: 'ui-card-body ws-inspector-body' }, panel.root),
  );
  root.hidden = true;

  let lastKey: string | null = null;
  let lastDesc: SelectionDescriptor = engine.selection();

  const render = (): void => {
    if (!app.get().inspectorOpen) return;
    panel.render(lastDesc, store.getState().data);
    title.textContent = describeSelection(lastDesc);
    leanBtn.hidden = !(lastDesc.kind === 'room' || lastDesc.kind === 'wall');
  };

  root.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const closeKey = ev.key === 'Escape' || ((ev.key === 'i' || ev.key === 'I') && !isTypingTarget(ev.target));
    if (!closeKey) return;
    if (engine.gestureInProgress()) return;
    ev.stopPropagation();
    if (ev.key === 'Escape' && engine.cancelTransient()) return;
    app.set({ inspectorOpen: false });
    engine.canvas.focus();
  });

  return {
    root,
    onSelection(desc: SelectionDescriptor): void {
      lastDesc = desc;
      const key = selectionKey(desc);
      if (key !== lastKey) {
        lastKey = key;
        app.set({ inspectorOpen: desc.kind !== 'none' });
      }
      render();
    },
    sync(): void {
      const open = app.get().inspectorOpen;
      if (root.hidden === open) {
        root.hidden = !open;
        engine.setInspectorVisible(open);
        if (open) render();
      }
    },
    focusLean(): void {
      app.set({ inspectorOpen: true });
      render();
      if (engine.gestureInProgress()) return;
      queueMicrotask(() => {
        root.querySelector<HTMLInputElement>('[data-testid="insp-lean-deg"]')?.focus();
      });
    },
  };
}
