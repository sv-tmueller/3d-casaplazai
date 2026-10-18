/**
 * Inline SVG icon set for the editor toolbar (issue #54, Pkg 3).
 *
 * Dependency-free by design: each entry is the INNER markup of a 24x24
 * `currentColor` icon. `iconMarkup` wraps it in an `<svg>` that carries
 * `aria-hidden="true"` so an icon never contributes to a button's
 * accessible name (e2e relies on getByRole button names — append-not-
 * replace is mandatory).
 */

export type IconKey =
  | 'select'
  | 'rectangle'
  | 'polygon'
  | 'door'
  | 'window'
  | 'furnish'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'export'
  | 'help'
  | 'center'
  | 'zoom-in'
  | 'zoom-out';

const S = 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"';

/** Inner SVG markup per icon key. */
export const ICONS: Record<IconKey, string> = {
  // Arrow cursor — the Select tool.
  select: `<path ${S} d="M5 3l6.5 15 2.2-5.6L19 9.5z" fill="none"/>`,
  // Axis-aligned room.
  rectangle: `<rect ${S} x="4" y="5" width="16" height="14" rx="1.5"/>`,
  // Editable closed polygon.
  polygon: `<path ${S} d="M12 4l7 5-2.6 8.2H7.6L5 9z"/><circle cx="12" cy="4" r="1.4" fill="currentColor" stroke="none"/>`,
  // Door: frame + swing arc.
  door: `<path ${S} d="M7 4v16"/><path ${S} d="M7 4h9v16H7"/><path ${S} d="M7 20a13 13 0 0 0 9-13"/>`,
  // Window: pane with mullions.
  window: `<rect ${S} x="4" y="5" width="16" height="14" rx="1.5"/><path ${S} d="M12 5v14M4 12h16"/>`,
  // Furnish: armchair.
  furnish: `<path ${S} d="M6 11V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3"/><path ${S} d="M4 11h16v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>`,
  // Undo: arrow curving back-left.
  undo: `<path ${S} d="M8 7H15a4 4 0 0 1 0 8H6"/><path ${S} d="M8 4L5 7l3 3"/>`,
  // Redo: arrow curving forward-right.
  redo: `<path ${S} d="M16 7H9a4 4 0 0 0 0 8h9"/><path ${S} d="M16 4l3 3-3 3"/>`,
  // Delete: trash can.
  delete: `<path ${S} d="M5 7h14"/><path ${S} d="M9 7V5h6v2"/><path ${S} d="M7 7l1 12h8l1-12"/>`,
  // Export: download into tray.
  export: `<path ${S} d="M12 4v10"/><path ${S} d="M8 11l4 4 4-4"/><path ${S} d="M5 19h14"/>`,
  // Help: circled question mark.
  help: `<circle ${S} cx="12" cy="12" r="8"/><path ${S} d="M9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.7.3-.9.8-.9 1.5"/><circle cx="12" cy="16.4" r="1" fill="currentColor" stroke="none"/>`,
  // Center: reticle with dot.
  center: `<circle ${S} cx="12" cy="12" r="7"/><path ${S} d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>`,
  // Zoom in: magnifier + plus.
  'zoom-in': `<circle ${S} cx="11" cy="11" r="6"/><path ${S} d="M15.5 15.5L20 20"/><path ${S} d="M8.5 11h5M11 8.5v5"/>`,
  // Zoom out: magnifier + minus.
  'zoom-out': `<circle ${S} cx="11" cy="11" r="6"/><path ${S} d="M15.5 15.5L20 20"/><path ${S} d="M8.5 11h5"/>`,
};

/** Full `<svg>` markup for an icon; `aria-hidden` keeps names text-only. */
export function iconMarkup(key: IconKey): string {
  return (
    `<svg class="editor-btn-icon" viewBox="0 0 24 24" width="16" height="16" ` +
    `aria-hidden="true" focusable="false">${ICONS[key]}</svg>`
  );
}
