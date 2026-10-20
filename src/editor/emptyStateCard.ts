/**
 * Issue #144 (Pkg 15.1) — first-run empty-state card.
 *
 * Shown centred on the canvas whenever the active plan has zero rooms on
 * every floor AND no drawing tool is armed (the two-term rule lives in
 * glue.ts: `planIsEmpty(...) && tool === 'select'`). The card is a
 * PREFILL, not a gate: the layer that covers the canvas is
 * `pointer-events: none` and only the card box itself re-enables
 * pointer events, so a user can still draw straight through the empty
 * background (pinned by editor.spec.ts, which drags through the canvas
 * centre on an empty plan).
 *
 * Actions are injected callbacks — the module knows nothing about the
 * store, the toolbar, or the import pipeline; glue.ts owns that wiring.
 * "Load a JSON file" forwards a `.click()` to the EXISTING hidden
 * `importFileInput` (the underlay/import precedent: no new file
 * machinery, no second change handler).
 */
import type { FloorplanData } from '../shared/schema';
import { DEMOS, type DemoId } from './demos';

/**
 * Pure visibility predicate — the single definition of "empty plan":
 * at least one room on ANY floor. Openings, furniture and stairs all
 * anchor to rooms, so a plan without rooms has nothing to keep.
 */
export function planIsEmpty(plan: FloorplanData): boolean {
  return plan.floors.every((floor) => floor.rooms.length === 0);
}

export interface EmptyStateCardActions {
  onDrawRoom(): void;
  onLoadDemo(id: DemoId): void;
  onImportJson(): void;
}

export interface EmptyStateCard {
  root: HTMLDivElement;
  /** Idempotent visibility toggle (driven by store.subscribe). */
  update(visible: boolean): void;
}

function mkButton(testid: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'editor-btn empty-state-action';
  btn.setAttribute('data-testid', testid);
  btn.textContent = label;
  return btn;
}

export function mountEmptyStateCard(
  container: HTMLElement,
  actions: EmptyStateCardActions,
): EmptyStateCard {
  const root = document.createElement('div');
  root.className = 'empty-state-layer';

  const card = document.createElement('div');
  card.className = 'empty-state-card';
  card.setAttribute('data-testid', 'empty-state-card');

  const heading = document.createElement('h2');
  heading.className = 'empty-state-title';
  heading.textContent = 'Start your floor plan';

  const copy = document.createElement('p');
  copy.className = 'empty-state-copy';
  copy.textContent =
    'Draw a room, load one of the bundled demo plans, or bring your own JSON file.';

  const drawBtn = mkButton('empty-draw-room', 'Draw a room');
  drawBtn.classList.add('primary');
  drawBtn.addEventListener('click', () => actions.onDrawRoom());

  const demoBtn = mkButton('empty-load-demo', 'Load a demo plan');
  demoBtn.setAttribute('aria-expanded', 'false');

  const importBtn = mkButton('empty-import', 'Load a JSON file');
  importBtn.addEventListener('click', () => actions.onImportJson());

  const actionsRow = document.createElement('div');
  actionsRow.className = 'empty-state-actions';
  actionsRow.append(drawBtn, demoBtn, importBtn);

  // Inline reveal (not a popover): the card is the one place a
  // first-run user is looking, so the three demo names stay in it.
  const demoRow = document.createElement('div');
  demoRow.className = 'empty-state-demos';
  demoRow.setAttribute('data-testid', 'empty-demo-row');
  demoRow.hidden = true;
  for (const demo of DEMOS) {
    const btn = mkButton(`empty-demo-${demo.id}`, demo.label);
    btn.classList.add('empty-state-demo');
    btn.title = demo.hint;
    btn.addEventListener('click', () => actions.onLoadDemo(demo.id));
    demoRow.appendChild(btn);
  }
  demoBtn.addEventListener('click', () => {
    demoRow.hidden = !demoRow.hidden;
    demoBtn.setAttribute('aria-expanded', String(!demoRow.hidden));
  });

  const footer = document.createElement('div');
  footer.className = 'empty-state-footer';
  footer.textContent = 'Your plan autosaves in this browser.';

  card.append(heading, copy, actionsRow, demoRow, footer);
  root.appendChild(card);
  container.appendChild(root);

  const update = (visible: boolean): void => {
    root.hidden = !visible;
  };
  update(true);

  return { root, update };
}
