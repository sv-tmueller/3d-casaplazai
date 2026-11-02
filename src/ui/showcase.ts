/**
 * Component kit showcase (issue #178, design §5.2): a dev-only page at
 * /dev/kit.html (npm run dev) that renders every kit component in the
 * current theme so the design can be reviewed without the app. Not a
 * build input (vite.config.ts lists its entries explicitly), but kept
 * under src/ so tsc and eslint cover it.
 */
import './tokens.css';
import './base.css';
import './showcase.css';
import { el } from './el';
import { Button } from './button';
import { Segment } from './segment';
import { Toggle } from './toggle';
import { Slider } from './slider';
import { Field } from './field';
import { Tabs } from './tabs';
import { Card } from './card';
import { Menu } from './menu';
import { openDialog } from './dialog';
import { ToastStack } from './toast';
import { ICONS, type IconKey } from './icons';
import { icon } from './el';

function section(title: string, ...children: Node[]): HTMLElement {
  return el('section', { class: 'kit-section' }, el('h2', { text: title }), el('div', { class: 'kit-row' }, ...children));
}

export function mountShowcase(root: HTMLElement): void {
  const toasts = ToastStack();
  const theme = Segment({
    label: 'Theme',
    value: 'light',
    options: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
    onChange: (v) => {
      theme.setValue(v);
      document.documentElement.dataset.theme = v;
    },
  });

  const view = Segment({
    label: 'View',
    value: 'plan',
    options: [
      { value: 'plan', label: 'Plan', icon: 'plan' },
      { value: '3d', label: '3D', icon: 'cube' },
      { value: 'walk', label: 'Walk', icon: 'walk' },
    ],
    onChange: (v) => view.setValue(v),
  });

  const menuTrigger = Button({ label: 'File', icon: 'file' }).root;
  Menu({
    trigger: menuTrigger,
    label: 'File',
    items: [
      { id: 'import', label: 'Import JSON', icon: 'upload', onSelect: () => toasts.show('Import chosen') },
      { id: 'save', label: 'Save JSON', icon: 'download', onSelect: () => toasts.show('Saved') },
      { separator: true },
      { id: 'new', label: 'New plan', icon: 'new', danger: true, onSelect: () => toasts.show('New plan') },
    ],
  });

  const tabs = Tabs({
    label: 'Tools',
    selected: 'build',
    tabs: [
      { id: 'build', label: 'Build', panel: el('p', { class: 'kit-pad', text: 'Build tools' }) },
      { id: 'view', label: 'View', panel: el('p', { class: 'kit-pad', text: 'View settings' }) },
      { id: 'measure', label: 'Measure', panel: el('p', { class: 'kit-pad', text: 'Measurements' }) },
    ],
  });

  root.append(
    el('h1', { text: 'CasaPlazAI component kit' }),
    section('Theme', theme.root),
    section(
      'Buttons',
      Button({ label: 'Primary', variant: 'primary' }).root,
      Button({ label: 'Secondary' }).root,
      Button({ label: 'Ghost', variant: 'ghost' }).root,
      Button({ label: 'Delete', variant: 'danger', icon: 'delete' }).root,
      Button({ label: 'Undo', icon: 'undo', iconOnly: true, shortcut: 'Ctrl+Z' }).root,
      Button({ label: 'Rectangle', icon: 'rectangle', pressed: true }).root,
      Button({ label: 'Disabled', disabled: true }).root,
    ),
    section('Segment', view.root),
    section(
      'Toggle and slider',
      Toggle({ label: 'Grid', checked: true, onChange: () => {} }).root,
      Slider({
        label: 'Time of day',
        min: 0,
        max: 24,
        step: 0.25,
        value: 12,
        format: (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`,
        ticks: [
          { value: 6, label: '6:00' },
          { value: 12, label: '12:00' },
          { value: 18, label: '18:00' },
        ],
        onInput: () => {},
      }).root,
    ),
    section('Field', Field({ label: 'Width', value: '0.90', unit: 'm', onCommit: () => true }).root),
    section('Tabs in a card', Card({ title: 'Tool card' }, tabs.root).root),
    section('Card', Card({ title: 'Collapsible', collapsible: true }, el('p', { class: 'kit-pad', text: 'Body' })).root),
    section(
      'Menu, dialog, toast',
      menuTrigger,
      Button({
        label: 'Open dialog',
        onClick: () =>
          openDialog({
            title: 'Replace the current plan?',
            body: el('p', { text: 'This cannot be undone.' }),
            actions: [
              { label: 'Cancel', value: null },
              { label: 'Replace plan', value: true, variant: 'primary' },
            ],
          }),
      }).root,
      Button({ label: 'Info toast', onClick: () => toasts.show('Saved to this browser.') }).root,
      Button({ label: 'Error toast', onClick: () => toasts.show('Could not read the file.', 'error') }).root,
    ),
    section(
      'Icons',
      ...(Object.keys(ICONS) as IconKey[]).map((k) =>
        el('span', { class: 'kit-icon', attrs: { title: k } }, icon(k), el('small', { text: k })),
      ),
    ),
    el('div', { class: 'kit-toasts' }, toasts.root),
  );
}

const host = document.getElementById('kit');
if (host instanceof HTMLElement) mountShowcase(host);
