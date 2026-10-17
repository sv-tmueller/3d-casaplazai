/**
 * Help modal (issue #7): keyboard-shortcut cheat-sheet driven ENTIRELY by
 * the shortcuts.ts registry. Opens on "?" (Shift+/) or the Help button;
 * closes on Escape, "?", backdrop click, or the Close button.
 */
import { SHORTCUTS } from '../editor/shortcuts';

const MODAL_CLASS = 'help-modal';
const TITLE = 'Keyboard shortcuts';

let instance: { root: HTMLDivElement; close: () => void } | null = null;

export function isHelpModalOpen(): boolean {
  return instance !== null;
}

export function closeHelpModal(): void {
  instance?.close();
}

/** Build (once) and show the modal. Safe to call repeatedly. */
export function openHelpModal(): void {
  if (instance) return;

  const root = document.createElement('div');
  root.className = MODAL_CLASS;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', TITLE);

  const panel = document.createElement('div');
  panel.className = 'help-modal-panel';

  const heading = document.createElement('h2');
  heading.textContent = TITLE;
  panel.appendChild(heading);

  const table = document.createElement('table');
  table.className = 'help-modal-table';
  const tbody = document.createElement('tbody');

  for (const entry of SHORTCUTS) {
    const row = document.createElement('tr');
    row.dataset.surface = entry.surface;
    const keysCell = document.createElement('td');
    keysCell.className = 'help-keys';
    keysCell.textContent = entry.keys;
    const actionCell = document.createElement('td');
    actionCell.textContent = entry.action;
    row.append(keysCell, actionCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  panel.appendChild(table);

  const footer = document.createElement('div');
  footer.className = 'help-modal-footer';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'editor-btn help-close';
  closeBtn.textContent = 'Close';
  closeBtn.setAttribute('data-testid', 'help-close');
  footer.appendChild(closeBtn);
  panel.appendChild(footer);

  root.appendChild(panel);
  document.body.appendChild(root);

  const close = (): void => {
    root.remove();
    document.removeEventListener('keydown', onDocKeyDown, true);
    instance = null;
  };
  const onDocKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' || ev.key === '?' || ev.key === '/') {
      ev.stopPropagation();
      close();
    }
  };

  closeBtn.addEventListener('click', close);
  root.addEventListener('mousedown', (ev) => {
    if (ev.target === root) close();
  });
  document.addEventListener('keydown', onDocKeyDown, true);

  instance = { root, close };
}

/**
 * Toggle wired globally: pressing "?" (which produces shift+'/') flips
 * the modal. Installed by initShortcuts().
 */
export function toggleHelpModal(): void {
  if (instance) closeHelpModal();
  else openHelpModal();
}
