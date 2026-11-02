/**
 * Tabs (issue #178): role="tablist" with automatic activation — arrow
 * keys, Home and End select and focus the neighbour (roving tabindex).
 * Keys it handles never reach document listeners (gap G1).
 */
import './tabs.css';
import { el, uid } from './el';

export interface TabSpec<I extends string> {
  id: I;
  label: string;
  panel: HTMLElement;
  testid?: string;
}

export interface TabsOptions<I extends string> {
  label: string;
  tabs: ReadonlyArray<TabSpec<I>>;
  selected: I;
  onSelect?: (id: I) => void;
  testid?: string;
}

export interface TabsHandle<I extends string> {
  readonly root: HTMLElement;
  readonly list: HTMLElement;
  selected(): I;
  select(id: I, focus?: boolean): void;
  /** The caller's panel content element for a tab. */
  panel(id: I): HTMLElement;
  tab(id: I): HTMLButtonElement;
}

export function Tabs<I extends string>(opts: TabsOptions<I>): TabsHandle<I> {
  const list = el('div', { class: 'ui-tabs-list', attrs: { role: 'tablist', 'aria-label': opts.label } });
  const root = el('div', { class: 'ui-tabs', testid: opts.testid }, list);
  const tabs = new Map<I, HTMLButtonElement>();
  const panels = new Map<I, HTMLElement>();
  const order = opts.tabs.map((t) => t.id);
  let current = opts.selected;

  for (const spec of opts.tabs) {
    const tabId = uid('tab');
    const panelId = uid('tabpanel');
    const tab = el('button', {
      class: 'ui-tab',
      attrs: { type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId },
      testid: spec.testid,
      dataset: { tab: spec.id },
      text: spec.label,
    });
    const wrap = el('div', {
      class: 'ui-tabpanel',
      attrs: { role: 'tabpanel', id: panelId, 'aria-labelledby': tabId },
    }, spec.panel);
    tab.addEventListener('click', () => select(spec.id));
    tabs.set(spec.id, tab);
    panels.set(spec.id, wrap);
    list.appendChild(tab);
    root.appendChild(wrap);
  }

  const sync = (): void => {
    for (const [id, tab] of tabs) {
      const on = id === current;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels.get(id)!.hidden = !on;
    }
  };

  function select(id: I, focus = false): void {
    if (!tabs.has(id)) return;
    const changed = id !== current;
    current = id;
    sync();
    if (focus) tabs.get(id)!.focus();
    if (changed) opts.onSelect?.(id);
  }

  list.addEventListener('keydown', (ev) => {
    const i = order.indexOf(current);
    let next: number;
    if (ev.key === 'ArrowRight') next = (i + 1) % order.length;
    else if (ev.key === 'ArrowLeft') next = (i - 1 + order.length) % order.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = order.length - 1;
    else return;
    ev.preventDefault();
    ev.stopPropagation();
    select(order[next], true);
  });

  sync();
  return {
    root,
    list,
    selected: () => current,
    select,
    panel: (id: I) => opts.tabs.find((t) => t.id === id)!.panel,
    tab: (id: I) => tabs.get(id)!,
  };
}
