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
  /**
   * Issue #143: optional grouping label. The help modal (helpModal.ts)
   * renders one full-width section row before each run of consecutive
   * entries sharing a group; the README table stays flat (the sync spec
   * only reads keys/action cells). The registry stays the single source
   * of truth for both surfaces.
   */
  group?: 'Tools';
}

export const SHORTCUTS: ShortcutEntry[] = [
  { keys: '?', action: 'Show keyboard shortcuts', surface: 'editor' },
  { keys: 'Esc', action: 'Cancel current gesture / deselect', surface: 'editor' },
  { keys: 'Enter', action: 'Close polygon while drawing', surface: 'editor' },
  { keys: 'Ctrl+Z', action: 'Undo', surface: 'editor' },
  { keys: 'Ctrl+Shift+Z', action: 'Redo', surface: 'editor' },
  { keys: 'Ctrl+Y', action: 'Redo', surface: 'editor' },
  // Issue #143: single-key tool hotkeys (V R P D W F T M). R is
  // dual-purpose — it rotates the selected furniture piece, and arms
  // Rectangle when nothing (rotatable) is selected.
  { keys: 'V', action: 'Arm the Select tool', surface: 'editor', group: 'Tools' },
  {
    keys: 'R',
    action: 'Arm Rectangle (rotates selected furniture 90° while one is selected)',
    surface: 'editor',
    group: 'Tools',
  },
  { keys: 'P', action: 'Arm the Polygon tool', surface: 'editor', group: 'Tools' },
  { keys: 'D', action: 'Arm the Door tool', surface: 'editor', group: 'Tools' },
  { keys: 'W', action: 'Arm the Window tool', surface: 'editor', group: 'Tools' },
  {
    keys: 'F',
    action: 'Arm the Furnish (stamp) tool',
    surface: 'editor',
    group: 'Tools',
  },
  { keys: 'T', action: 'Arm the Stairs tool', surface: 'editor', group: 'Tools' },
  { keys: 'M', action: 'Arm the Measure tool', surface: 'editor', group: 'Tools' },
  {
    keys: 'S',
    action: 'Toggle the Snapping settings popover',
    surface: 'editor',
  },
  {
    keys: 'L',
    action: 'Set the selected room\u2019s wall lean (roof)',
    surface: 'editor',
  },
  {
    keys: 'I',
    action: 'Toggle the selection inspector panel',
    surface: 'editor',
  },
  {
    keys: '3',
    action: 'Toggle the 3D inset preview',
    surface: 'editor',
  },
  {
    keys: 'PageUp / [',
    action: 'Switch to the floor below',
    surface: 'editor',
  },
  {
    keys: 'PageDown / ]',
    action: 'Switch to the floor above',
    surface: 'editor',
  },
  {
    keys: 'Del / Backspace',
    action: 'Delete selected room, opening, or furniture',
    surface: 'editor',
  },
  {
    keys: '0',
    action: 'Fit the whole plan in the viewport',
    surface: 'editor',
  },
  {
    keys: 'Space (hold)',
    action: 'Temporarily switch to the Pan tool',
    surface: 'editor',
  },
  {
    keys: 'Alt+Drag / Middle-Drag',
    action: 'Pan the canvas',
    surface: 'editor',
  },
  { keys: 'Wheel', action: 'Zoom at cursor', surface: 'editor' },
];

/** Table rows for README + modal (same source of truth). */
export function shortcutRows(): ReadonlyArray<readonly [string, string]> {
  return SHORTCUTS.map((s) => [s.keys, s.action] as const);
}
