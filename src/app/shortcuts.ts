/**
 * Shortcut rows (issue #7 registry, now backed by the command registry —
 * issue #178). Consumed by the Help cheat sheet and the README table
 * (kept in sync by tests/unit/readme.shortcuts.sync.spec.ts). The rows
 * keep the {keys, action} shape; one command may own several rows
 * (Redo owns Ctrl+Shift+Z and Ctrl+Y) and gesture rows (Esc, Enter,
 * Space, drags, Wheel) belong to display-only gesture commands.
 */
import { COMMAND_SPECS, type ShortcutGroup } from './commands';

export interface ShortcutEntry {
  keys: string;
  action: string;
  group: ShortcutGroup;
  /** Owning command id. */
  command: string;
}

export const SHORTCUTS: readonly ShortcutEntry[] = COMMAND_SPECS.flatMap((spec) =>
  (spec.rows ?? []).map((r) => ({ keys: r.keys, action: r.action, group: r.group, command: spec.id })),
);

/** Table rows for the README and the cheat sheet (same source). */
export function shortcutRows(): ReadonlyArray<readonly [string, string]> {
  return SHORTCUTS.map((s) => [s.keys, s.action] as const);
}
