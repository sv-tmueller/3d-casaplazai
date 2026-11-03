/**
 * Inline SVG icon set (issue #54, Pkg 3; moved into the component kit by
 * issue #178 and extended for the workspace actions).
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
  | 'zoom-out'
  | 'dimensions'
  | 'snap'
  | 'measure'
  /* pkg 13.4 (issue #118): staircase tool. */
  | 'stairs'
  /* pkg #142 (issue #142): File menu owner glyph. */
  | 'file'
  /* pkg #142 fix round (reviewer finding 1): floor-nav trio glyphs. */
  | 'chevron-up'
  | 'chevron-down'
  /* pkg 14.x (issue #126): pan tool + dark-theme toggle. */
  | 'pan'
  | 'theme'
  | 'plus'
  /* issue #178: workspace shell actions. */
  | 'logo'
  | 'minus'
  | 'share'
  | 'fullscreen'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'menu'
  | 'cube'
  | 'walk'
  | 'plan'
  | 'grid'
  | 'sun'
  | 'image'
  | 'upload'
  | 'download'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'lock'
  | 'eye'
  | 'camera'
  | 'inspector'
  | 'new';

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
  // Dimensions: ruler with tick marks (issue #60).
  dimensions: `<rect ${S} x="3" y="8" width="18" height="8" rx="1"/><path ${S} d="M7 8v3M11 8v4M15 8v3M19 8v4"/>`,
  // Snap: magnet over a dotted lattice (issue #68).
  snap: `<path ${S} d="M6 4v5a6 6 0 0 0 12 0V4"/><path ${S} d="M6 4h4M14 4h4"/><path ${S} d="M3 20h2M9 20h2M15 20h2M21 20h2M6 20h.01M12 20h.01M18 20h.01" stroke-width="1.3"/>`,
  // Measure: diagonal dimension with endpoint dots + tick marks (#66).
  measure: `<path ${S} d="M5 19L19 5"/><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="5" r="1.5" fill="currentColor" stroke="none"/><path ${S} d="M9.5 12l2.5 2.5M12.5 9l2.5 2.5"/>`,
  // Stairs: stepped flight profile with an uphill arrow (issue #118).
  stairs: `<path ${S} d="M3 19h4v-4h4v-4h4V7h6"/><path ${S} d="M15.5 3.5L19 7l-3.5 3.5"/>`,
  // pkg #142: sheet-of-paper glyph for the File menu owner.
  file: `<path ${S} d="M7 3h7l4 4v14H7z"/><path ${S} d="M14 3v4h4"/>`,
  // Floor nav: chevron-up = up a storey, chevron-down = down a storey,
  // plus = append a floor. Prevents the blank icon-only squares.
  'chevron-up': `<path ${S} d="M6 15l6-6 6 6"/>`,
  'chevron-down': `<path ${S} d="M6 9l6 6 6-6"/>`,
  plus: `<path ${S} d="M12 5v14M5 12h14"/>`,
  // Pan (issue #126): four-way move cross.
  pan: `<path ${S} d="M12 3v18M3 12h18"/><path ${S} d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>`,
  // Theme (issue #126): crescent moon (dark mode).
  theme: `<path ${S} d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z"/>`,
  // Issue #178: logo mark — a roofed house outline with a plaza dot.
  logo: `<path ${S} d="M3.5 11L12 4l8.5 7"/><path ${S} d="M6 9.5V20h12V9.5"/><circle cx="12" cy="14.5" r="2" fill="currentColor" stroke="none"/>`,
  minus: `<path ${S} d="M5 12h14"/>`,
  share: `<circle ${S} cx="6" cy="12" r="2.4"/><circle ${S} cx="17.5" cy="6" r="2.4"/><circle ${S} cx="17.5" cy="18" r="2.4"/><path ${S} d="M8.2 10.9l7.1-3.7M8.2 13.1l7.1 3.7"/>`,
  fullscreen: `<path ${S} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
  close: `<path ${S} d="M6 6l12 12M18 6L6 18"/>`,
  'chevron-left': `<path ${S} d="M15 6l-6 6 6 6"/>`,
  'chevron-right': `<path ${S} d="M9 6l6 6-6 6"/>`,
  menu: `<path ${S} d="M4 7h16M4 12h16M4 17h16"/>`,
  cube: `<path ${S} d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path ${S} d="M4 7.5l8 4.5 8-4.5M12 12v9"/>`,
  walk: `<circle cx="13" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path ${S} d="M10 21l2.2-6.2L15 17v4M9 12l1.6-4.6L14 8.5l2 3.5 2.5 1"/><path ${S} d="M12.2 14.8l-1.6-7.4"/>`,
  plan: `<rect ${S} x="4" y="4" width="16" height="16" rx="1.5"/><path ${S} d="M4 12h7v8M11 4v5M15 12h5"/>`,
  grid: `<rect ${S} x="4" y="4" width="16" height="16" rx="1.5"/><path ${S} d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>`,
  sun: `<circle ${S} cx="12" cy="12" r="3.6"/><path ${S} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>`,
  image: `<rect ${S} x="4" y="5" width="16" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none"/><path ${S} d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/>`,
  upload: `<path ${S} d="M12 16V5"/><path ${S} d="M8 9l4-4 4 4"/><path ${S} d="M5 19h14"/>`,
  download: `<path ${S} d="M12 4v11"/><path ${S} d="M8 11l4 4 4-4"/><path ${S} d="M5 19h14"/>`,
  'rotate-cw': `<path ${S} d="M19 12a7 7 0 1 1-2.05-4.95"/><path ${S} d="M19 4.5v3.5h-3.5"/>`,
  'rotate-ccw': `<path ${S} d="M5 12a7 7 0 1 0 2.05-4.95"/><path ${S} d="M5 4.5v3.5h3.5"/>`,
  lock: `<rect ${S} x="5.5" y="10.5" width="13" height="9.5" rx="1.5"/><path ${S} d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>`,
  eye: `<path ${S} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle ${S} cx="12" cy="12" r="2.8"/>`,
  camera: `<path ${S} d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z"/><circle ${S} cx="12" cy="13.2" r="3.4"/>`,
  inspector: `<rect ${S} x="4" y="4" width="16" height="16" rx="1.5"/><path ${S} d="M14 4v16M16.5 8h1.5M16.5 11h1.5"/>`,
  new: `<path ${S} d="M7 3h7l4 4v14H7z"/><path ${S} d="M12.5 10.5v6M9.5 13.5h6"/>`,
};

/** Full `<svg>` markup for an icon; `aria-hidden` keeps names text-only. */
export function iconMarkup(key: IconKey): string {
  return (
    `<svg class="editor-btn-icon ui-icon" viewBox="0 0 24 24" width="16" height="16" ` +
    `aria-hidden="true" focusable="false">${ICONS[key]}</svg>`
  );
}
