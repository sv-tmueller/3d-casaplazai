/**
 * Registry of every implemented keyboard binding (issue #7). Consumed by
 * (a) the "?" cheat-sheet modal, (b) the README shortcuts table (kept in
 * sync by a vitest), and (c) potential future journey assertions.
 * Adding a binding WITHOUT registering it here breaks the build-time
 * anti-drift check — that is the point.
 */

export interface ShortcutEntry {
  /** Human-readable key chord, e.g. "Ctrl+Z". */
  keys: string;
  /** What the binding does. */
  action: string;
  /** Surface the binding lives on: canvas or viewer HUD. */
  surface: 'editor' | 'viewer';
}

export const SHORTCUTS: ShortcutEntry[] = [
  { keys: '?', action: 'Show keyboard shortcuts', surface: 'editor' },
  { keys: 'Esc', action: 'Cancel current gesture / deselect', surface: 'editor' },
  { keys: 'Enter', action: 'Close polygon while drawing', surface: 'editor' },
  { keys: 'Ctrl+Z', action: 'Undo', surface: 'editor' },
  { keys: 'Ctrl+Shift+Z', action: 'Redo', surface: 'editor' },
  { keys: 'Ctrl+Y', action: 'Redo', surface: 'editor' },
  { keys: 'R', action: 'Rotate selected furniture 90°', surface: 'editor' },
  { keys: 'S', action: 'Toggle the Snapping settings popover', surface: 'editor' },
  { keys: 'Del / Backspace', action: 'Delete selected room, opening, or furniture', surface: 'editor' },
  { keys: 'Alt+Drag / Middle-Drag', action: 'Pan the canvas', surface: 'editor' },
  { keys: 'Wheel', action: 'Zoom at cursor', surface: 'editor' },
];

/** Table rows for README + modal (same source of truth). */
export function shortcutRows(): ReadonlyArray<readonly [string, string]> {
  return SHORTCUTS.map((s) => [s.keys, s.action] as const);
}
