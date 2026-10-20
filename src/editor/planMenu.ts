/**
 * Issue #144 (Pkg 15.1) — floating "Plans" button + popover.
 *
 * The sanctioned deviation from the issue's "File menu (or the toolbar)"
 * wording (batch issue #160, advisor-ratified): #142 reworks the toolbar
 * and homes Import/Export in a File menu there, so mounting anything in
 * the toolbar would collide. This module ships a self-contained floating
 * corner button instead; #142 later absorbs it by deleting ONE mount
 * call in glue.ts.
 *
 * Discipline mirrors snapPopover (glue.ts): a plain toggle button with
 * aria-haspopup/aria-expanded, outside-clicks and Escape close it, and
 * an item click closes BEFORE firing its action (the action may open the
 * confirm dialog or swap the plan — the stale popover must not linger).
 */
import { DEMOS, type DemoId } from './demos';

export interface PlanMenuActions {
  onNewPlan(): void;
  onLoadDemo(id: DemoId): void;
}

export interface PlanMenu {
  root: HTMLDivElement;
  setOpen(open: boolean): void;
}

export function mountPlanMenu(
  container: HTMLElement,
  actions: PlanMenuActions,
): PlanMenu {
  const root = document.createElement('div');
  root.className = 'plan-menu';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'editor-btn plans-button';
  btn.setAttribute('data-testid', 'plans-button');
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.textContent = 'Plans';

  const popover = document.createElement('div');
  popover.className = 'plan-menu-popover';
  popover.setAttribute('data-testid', 'plans-popover');
  popover.setAttribute('role', 'menu');
  popover.hidden = true;

  const isOpen = (): boolean => popover.hidden === false;
  const setOpen = (open: boolean): void => {
    popover.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };

  const addItem = (testid: string, label: string, hint: string, run: () => void): void => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'plan-menu-item';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-testid', testid);
    item.title = hint;
    item.textContent = label;
    item.addEventListener('click', () => {
      setOpen(false);
      run();
    });
    popover.appendChild(item);
  };

  addItem('plan-new', 'New plan', 'Start over from an empty single-floor plan', () =>
    actions.onNewPlan(),
  );
  for (const demo of DEMOS) {
    addItem(`plan-demo-${demo.id}`, demo.label, demo.hint, () => actions.onLoadDemo(demo.id));
  }

  btn.addEventListener('click', () => setOpen(!isOpen()));

  // snapPopover discipline: outside pointerdown closes. Registered on
  // document capture so a click that lands on the canvas (and starts a
  // draw gesture) still dismisses the menu first.
  document.addEventListener(
    'pointerdown',
    (ev) => {
      if (!isOpen()) return;
      if (ev.target instanceof Node && root.contains(ev.target)) return;
      setOpen(false);
    },
    true,
  );

  // Window capture for Escape: the popover must pre-empt the editor's
  // document-capture Escape handlers, which is also why it only acts
  // while actually open (a closed menu must not swallow Escape).
  window.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'Escape' || !isOpen()) return;
      ev.stopPropagation();
      setOpen(false);
    },
    true,
  );

  root.append(btn, popover);
  container.appendChild(root);

  return { root, setOpen };
}
