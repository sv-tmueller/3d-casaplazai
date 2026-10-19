/**
 * Toolbar/status/badge/message DOM for the editor pane. Kept dumb:
 * buildUi returns refs; controller.ts wires behavior.
 */
import { FURNITURE_DEFAULTS } from './model/constants';
import { iconMarkup, type IconKey } from './icons';
import { TOOL_HINTS } from './polish';

export interface EditorDomRefs {
  toolbar: HTMLDivElement;
  canvas: HTMLCanvasElement;
  badge: HTMLDivElement;
  msg: HTMLDivElement;
  status: HTMLSpanElement;
  statusTotal: HTMLSpanElement;
  btnExport: HTMLButtonElement;
  btnHelp: HTMLButtonElement;
  btnSelect: HTMLButtonElement;
  btnRect: HTMLButtonElement;
  btnPoly: HTMLButtonElement;
  btnDoor: HTMLButtonElement;
  btnWindow: HTMLButtonElement;
  btnStamp: HTMLButtonElement;
  palette: HTMLDivElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnDelete: HTMLButtonElement;
  btnCenter: HTMLButtonElement;
  btnZoomIn: HTMLButtonElement;
  btnZoomOut: HTMLButtonElement;
  btnDimensions: HTMLButtonElement;
}

export function buildEditorUi(parent: HTMLElement): EditorDomRefs {
  const pane = document.createElement('section');
  pane.className = 'pane pane-editor';
  pane.dataset.screen = 'editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');

  // Issue #54 (Pkg 3): buttons may carry an inline SVG icon. The icon is
  // APPENDED (aria-hidden) alongside a <span> holding the label, so the
  // accessible name stays the label text (e2e getByRole names depend on
  // this — never replace the text node).
  const mkBtn = (
    label: string,
    extraCls: string,
    icon?: IconKey,
  ): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `editor-btn ${extraCls}`.trim();
    if (icon) b.innerHTML = iconMarkup(icon);
    const span = document.createElement('span');
    span.className = 'editor-btn-label';
    span.textContent = label;
    b.appendChild(span);
    return b;
  };

  // Issue #7: every tool button advertises its purpose via tooltip +
  // aria-label sourced from the TOOL_HINTS registry.
  const mkHintedBtn = (
    label: string,
    hintKey: string,
    extraCls = '',
    icon?: IconKey,
  ): HTMLButtonElement => {
    const b = mkBtn(label, extraCls, icon);
    const hint = TOOL_HINTS[hintKey];
    if (hint) {
      // Hint lives in `title` ONLY: an aria-label would REPLACE the
      // button's accessible name (breaking getByRole('button', {name})
      // locators in e2e specs and for screen-reader users).
      b.title = hint;
    }
    return b;
  };

  const btnSelect = mkHintedBtn('Select', 'select', '', 'select');
  const btnRect = mkHintedBtn('Rectangle', 'rectangle', '', 'rectangle');
  const btnPoly = mkHintedBtn('Polygon', 'polygon', '', 'polygon');

  // pkg 3 (issue #4): opening + furniture tools.
  const sep2 = document.createElement('span');
  sep2.className = 'toolbar-sep';
  const btnDoor = mkHintedBtn('Door', 'door', 'editor-door', 'door');
  const btnWindow = mkHintedBtn('Window', 'window', 'editor-window', 'window');
  const btnStamp = mkHintedBtn('Furnish', 'stamp', 'editor-stamp', 'furnish');

  // pkg 6 (issue #7): export + help buttons.
  const sep3 = document.createElement('span');
  sep3.className = 'toolbar-sep';
  const btnExport = mkBtn('Export', 'editor-export', 'export');
  btnExport.title = 'Download the plan as a PNG or JPEG image.';
  btnExport.setAttribute(
    'aria-label',
    'Export — Download the plan as a PNG or JPEG image.',
  );
  btnExport.setAttribute('data-testid', 'btn-export');
  const btnHelp = mkBtn('? Help', 'editor-help', 'help');
  btnHelp.title = 'Keyboard shortcuts';
  btnHelp.setAttribute('aria-label', 'Keyboard shortcuts');
  btnHelp.setAttribute('data-testid', 'btn-help');

  // pkg 2 (issue #46): 2D navigation — center + zoom buttons. Hints live
  // in `title` only (an aria-label would replace the accessible name).
  const sep4 = document.createElement('span');
  sep4.className = 'toolbar-sep';
  const btnCenter = mkBtn('Center', 'editor-center', 'center');
  btnCenter.title = 'Fit the whole plan inside the viewport.';
  btnCenter.setAttribute('data-testid', 'btn-center');
  const btnZoomIn = mkBtn('Zoom in', 'editor-zoom-in', 'zoom-in');
  btnZoomIn.title = 'Zoom in around the canvas centre.';
  btnZoomIn.setAttribute('data-testid', 'btn-zoom-in');
  const btnZoomOut = mkBtn('Zoom out', 'editor-zoom-out', 'zoom-out');
  btnZoomOut.title = 'Zoom out around the canvas centre.';
  btnZoomOut.setAttribute('data-testid', 'btn-zoom-out');

  const sep = document.createElement('span');
  sep.className = 'toolbar-sep';
  const btnUndo = mkBtn('Undo', 'editor-undo', 'undo');
  const btnRedo = mkBtn('Redo', 'editor-redo', 'redo');
  const btnDelete = mkBtn('Delete Selected', 'editor-delete', 'delete');
  btnDelete.disabled = true;
  btnUndo.disabled = true;
  btnRedo.disabled = true;
  // Issue #60: one "Dimensions" toggle gates wall length labels AND
  // room-area badges together (heartbeat of the measurement overlay).
  const sep5 = document.createElement('span');
  sep5.className = 'toolbar-sep';
  const btnDimensions = mkBtn('Dimensions', 'editor-dimensions', 'dimensions');
  btnDimensions.title = 'Show or hide wall lengths and room areas.';
  btnDimensions.setAttribute('aria-pressed', 'true');
  btnDimensions.setAttribute('data-testid', 'btn-dimensions');
  [
    btnSelect, btnRect, btnPoly, sep2, btnDoor, btnWindow, btnStamp, sep,
    btnUndo, btnRedo, btnDelete, sep3, btnExport, btnHelp,
    sep4, btnCenter, btnZoomIn, btnZoomOut, sep5, btnDimensions,
  ].forEach((el) =>
    toolbar.appendChild(el),
  );

  // Furniture palette (visible only while the Furnish tool is armed).
  const palette = document.createElement('div');
  palette.className = 'editor-palette';
  palette.hidden = true;
  for (const [type, def] of Object.entries(FURNITURE_DEFAULTS)) {
    const chip = mkBtn(def.label, 'palette-chip');
    chip.dataset.stampType = type;
    palette.appendChild(chip);
  }

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'editor-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'editor-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Floorplan canvas');

  const badge = document.createElement('div');
  badge.className = 'overlap-badge';
  badge.hidden = true;
  badge.textContent = '\u26a0\uFE0F Rooms overlap';

  const msg = document.createElement('div');
  msg.className = 'inline-msg';
  msg.hidden = true;

  const statusBar = document.createElement('div');
  statusBar.className = 'editor-statusbar';
  const status = document.createElement('span');
  status.className = 'editor-status';
  const statusTotal = document.createElement('span');
  statusTotal.className = 'editor-status-total';
  statusTotal.setAttribute('data-testid', 'status-total');
  statusTotal.textContent = 'Total: 0.0 m\u00B2';
  statusBar.append(status, statusTotal);

  canvasWrap.append(canvas, badge, msg);
  pane.append(toolbar, palette, canvasWrap, statusBar);
  parent.appendChild(pane);

  return {
    toolbar, canvas, badge, msg, status, statusTotal,
    btnExport, btnHelp,
    btnSelect, btnRect, btnPoly, btnDoor, btnWindow, btnStamp, palette,
    btnDimensions,
    btnUndo, btnRedo, btnDelete,
    btnCenter, btnZoomIn, btnZoomOut,
  };
}

/** Show an ephemeral inline message (auto-clears after ms). */
export function flashMessage(refs: EditorDomRefs, text: string, ttlMs = 3200): void {
  refs.msg.textContent = text;
  refs.msg.hidden = false;
  window.setTimeout(() => {
    if (refs.msg.textContent === text) refs.msg.hidden = true;
  }, ttlMs);
}

export function hideMessage(refs: EditorDomRefs): void {
  refs.msg.hidden = true;
}
