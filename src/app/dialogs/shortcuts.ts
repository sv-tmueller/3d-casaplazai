/**
 * Shortcuts cheat sheet (issue #178; replaces editor/helpModal, #7 /
 * #143). Rendered from the same rows as the README table, one section
 * row per group.
 */
import { el } from '../../ui/el';
import { openDialog } from '../../ui/dialog';
import { SHORTCUTS } from '../shortcuts';

export function openShortcutsDialog(): Promise<null> {
  const body = el('tbody');
  let group: string | null = null;
  for (const s of SHORTCUTS) {
    if (s.group !== group) {
      group = s.group;
      body.appendChild(el('tr', { class: 'ws-shortcuts-group' }, el('th', { attrs: { colspan: 2, scope: 'colgroup' }, text: group })));
    }
    body.appendChild(
      el('tr', {}, el('td', {}, el('kbd', { text: s.keys })), el('td', { text: s.action })),
    );
  }
  const table = el(
    'table',
    { class: 'ws-shortcuts-table' },
    el('thead', {}, el('tr', {}, el('th', { attrs: { scope: 'col' }, text: 'Keys' }), el('th', { attrs: { scope: 'col' }, text: 'Action' }))),
    body,
  );
  const handle = openDialog<null>({
    title: 'Keyboard shortcuts',
    testid: 'ws-shortcuts',
    size: 'lg',
    body: table,
    actions: [{ label: 'Close', value: null, testid: 'ws-shortcuts-close' }],
  });
  return handle.result.then(() => null);
}
