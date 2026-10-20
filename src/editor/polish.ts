/**
 * Issue #7: global shortcut wiring + toolbar hint strings.
 *
 * - Global keydown listener toggles the "?" cheat-sheet modal.
 * - TOOL_HINTS supplies per-tool status-bar hint text sourced from the
 *   same registry family as the modal.
 */
import { toggleHelpModal } from './helpModal';

/** Contextual hint shown in the status bar per active tool. */
export const TOOL_HINTS: Record<string, string> = {
  select: 'Click a room or piece to select; drag to move.',
  rectangle: 'Drag to draw a rectangular room (snaps to 0.5 m grid).',
  polygon: 'Click vertices; press Enter or dbl-click to close.',
  door: 'Hover a wall, then click to place a door.',
  window: 'Hover a wall, then click to place a window.',
  stamp: 'Pick a piece below, then click inside a room to place it.',
  measure: 'Click two points to add a dimension; click a label to remove it.',
  stairs: 'Drag inside a room to draw a staircase up to the floor above.',
  pan: 'Drag to pan the canvas (or hold Space for a temporary pan).',
};

/** Hint for bindings not tied to a tool. */
export const GLOBAL_TOOL_HINT = 'Press ? for keyboard shortcuts.';

export function toolHint(tool: string): string {
  return TOOL_HINTS[tool] ?? '';
}

/** Install the global "?" toggle. Returns its disposer. */
export function initShortcuts(): () => void {
  const onGlobalKeyDown = (ev: KeyboardEvent): void => {
    // Shift+/ yields "?"; accept both spellings. Ignore chords with
    // Ctrl/Meta/Alt so browser/devtools combos never trip the modal.
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === '?' || (ev.shiftKey && ev.key === '/')) {
      ev.preventDefault();
      toggleHelpModal();
    }
  };
  document.addEventListener('keydown', onGlobalKeyDown);
  return () => document.removeEventListener('keydown', onGlobalKeyDown);
}
