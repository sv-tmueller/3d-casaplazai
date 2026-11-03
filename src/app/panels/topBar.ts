/**
 * Top bar (issue #178, design §6.1): logo mark (file menu), project
 * name with the unsaved dot, the Plan / 3D / Walk segment, the level
 * stepper (minus, level menu, plus), history, share, export, inspector,
 * help, theme and fullscreen.
 */
import { el, icon } from '../../ui/el';
import { Menu, type MenuItem } from '../../ui/menu';
import { Segment } from '../../ui/segment';
import { DEMOS } from '../../editor/demos';
import type { EditorStore } from '../../editor/store';
import type { AppState, ViewId } from '../state';
import { Binder, commandButton } from './controls';

export interface TopBar {
  readonly root: HTMLElement;
  sync(): void;
  destroy(): void;
}

export interface TopBarDeps {
  binder: Binder;
  app: AppState;
  store: EditorStore;
  isDirty: () => boolean;
  /** Jump to a floor by index (level menu). */
  gotoFloor(index: number): void;
}

export function mountTopBar(deps: TopBarDeps): TopBar {
  const { binder: b, app, store } = deps;
  const reg = b.registry;

  /* ---- logo + file menu ---- */
  const logo = el(
    'button',
    {
      class: 'ws-logo',
      attrs: { type: 'button', 'aria-label': 'CasaPlazAI menu' },
      testid: 'ws-logo-menu',
    },
    icon('logo'),
    el('span', { class: 'ws-logo-word', text: 'CasaPlazAI' }),
  );
  const menuItem = (id: string, arg?: string, text?: string): MenuItem => {
    const cmd = reg.get(id);
    return {
      id: arg ? `${id}:${arg}` : id,
      label: text ?? cmd.label,
      icon: cmd.icon,
      testid: `ws-menu-${arg ?? id.replace('.', '-')}`,
      disabled: !b.enabled(id),
      data: arg ? { command: id, arg } : { command: id },
      onSelect: () => cmd.run?.(arg),
    };
  };
  const logoMenu = Menu({
    trigger: logo,
    label: 'File',
    testid: 'ws-file-menu',
    items: () => [
      menuItem('file.import'),
      menuItem('file.saveJson'),
      { separator: true },
      menuItem('file.new'),
      { heading: 'Demo plans' },
      ...DEMOS.map((d) => menuItem('file.demo', d.id, d.label)),
    ],
  });

  /* ---- project name + unsaved dot ---- */
  const name = el('input', {
    class: 'ws-project-name',
    attrs: { type: 'text', 'aria-label': 'Project name', spellcheck: 'false', autocomplete: 'off' },
    testid: 'ws-project-name',
  });
  name.value = app.get().projectName;
  const commitName = (): void => {
    const next = name.value.trim();
    if (next === '') name.value = app.get().projectName;
    else app.set({ projectName: next });
  };
  name.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commitName();
      name.blur();
    } else if (ev.key === 'Escape') {
      name.value = app.get().projectName;
      name.blur();
    }
  });
  name.addEventListener('blur', commitName);
  const dot = el('span', {
    class: 'ws-unsaved-dot',
    attrs: { role: 'img', 'aria-label': 'Unsaved changes', title: 'Unsaved changes' },
    testid: 'ws-unsaved',
  });

  /* ---- view segment ---- */
  const views: Array<{ value: ViewId; id: string }> = [
    { value: 'plan', id: 'view.plan' },
    { value: '3d', id: 'view.3d' },
    { value: 'walk', id: 'view.walk' },
  ];
  const segment = Segment<ViewId>({
    label: 'View',
    value: app.get().view,
    testid: 'ws-view',
    options: views.map((v) => {
      const cmd = reg.get(v.id);
      return {
        value: v.value,
        label: cmd.label,
        icon: cmd.icon,
        testid: `ws-view-${v.value}`,
        title: `${cmd.label} (${cmd.rows?.[0]?.keys ?? ''})`,
      };
    }),
    onChange: (v) => reg.run(`view.${v}`),
  });
  for (const v of views) segment.item(v.value).dataset.command = v.id;

  /* ---- level stepper ---- */
  const levelBtn = el(
    'button',
    { class: 'ui-btn ui-btn-ghost ws-level', attrs: { type: 'button' }, testid: 'ws-level-menu' },
    el('span', { class: 'ws-level-name' }),
    icon('chevron-down'),
  );
  const levelName = levelBtn.querySelector('.ws-level-name') as HTMLElement;
  const levelMenu = Menu({
    trigger: levelBtn,
    label: 'Levels',
    testid: 'ws-level-list',
    align: 'end',
    items: () => {
      const st = store.getState();
      const floors: MenuItem[] = st.data.floors.map((f, i) => ({
        id: `floor:${i}`,
        label: `${f.name} · Level ${i + 1}`,
        checked: i === st.activeFloorIdx,
        testid: `ws-level-${i}`,
        onSelect: () => deps.gotoFloor(i),
      }));
      const item = (id: string): MenuItem => ({
        id,
        label: reg.get(id).label,
        icon: reg.get(id).icon,
        disabled: !b.enabled(id),
        danger: id === 'floor.delete',
        testid: `ws-menu-${id.replace('.', '-')}`,
        data: { command: id },
        onSelect: () => reg.run(id),
      });
      return [{ heading: 'Levels' }, ...floors, { separator: true }, item('floor.rename'), item('floor.add'), item('floor.delete')];
    },
  });

  const iconBtn = (id: string, testid: string): HTMLButtonElement =>
    commandButton(b, id, { iconOnly: true, testid });

  const root = el(
    'header',
    { class: 'ws-topbar', testid: 'ws-topbar' },
    el('div', { class: 'ws-topbar-start' }, logo, el('div', { class: 'ws-project' }, name, dot)),
    el('div', { class: 'ws-topbar-center' }, segment.root),
    el(
      'div',
      { class: 'ws-topbar-end' },
      el(
        'div',
        { class: 'ws-stepper', attrs: { role: 'group', 'aria-label': 'Level' } },
        iconBtn('floor.prev', 'ws-floor-prev'),
        levelBtn,
        iconBtn('floor.next', 'ws-floor-next'),
      ),
      el('span', { class: 'ws-divider', attrs: { 'aria-hidden': 'true' } }),
      iconBtn('history.undo', 'ws-undo'),
      iconBtn('history.redo', 'ws-redo'),
      el('span', { class: 'ws-divider', attrs: { 'aria-hidden': 'true' } }),
      commandButton(b, 'file.share', { size: 'sm', testid: 'ws-share', text: 'Share' }),
      commandButton(b, 'file.export', { size: 'sm', variant: 'primary', testid: 'ws-export', text: 'Export' }),
      el('span', { class: 'ws-divider', attrs: { 'aria-hidden': 'true' } }),
      iconBtn('inspector.toggle', 'ws-inspector-toggle'),
      iconBtn('help.shortcuts', 'ws-help'),
      iconBtn('theme.toggle', 'ws-theme'),
      iconBtn('app.fullscreen', 'ws-fullscreen'),
    ),
  );

  const sync = (): void => {
    const st = store.getState();
    const floor = st.data.floors[Math.min(st.activeFloorIdx, st.data.floors.length - 1)];
    levelName.textContent = `${floor?.name ?? 'Floor'} · Level ${st.activeFloorIdx + 1}`;
    levelBtn.setAttribute('aria-label', `Level: ${levelName.textContent}`);
    segment.setValue(app.get().view);
    for (const v of views) segment.setDisabled(v.value, !b.enabled(v.id));
    dot.hidden = !deps.isDirty();
    if (document.activeElement !== name) name.value = app.get().projectName;
  };
  sync();
  return {
    root,
    sync,
    destroy(): void {
      logoMenu.destroy();
      levelMenu.destroy();
    },
  };
}
