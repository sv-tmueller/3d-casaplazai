/**
 * Toolbar/status/badge/message DOM for the editor pane. Kept dumb:
 * buildUi returns refs; controller.ts wires behavior.
 */
import { FURNITURE_DEFAULTS } from './model/constants';
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
}

export function buildEditorUi(parent: HTMLElement): EditorDomRefs {
  const pane = document.createElement('section');
  pane.className = 'pane pane-editor';
  pane.dataset.screen = 'editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');

  const mkBtn = (label: string, extraCls: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `editor-btn ${extraCls}`.trim();
    b.textContent = label;
    return b;
  };

  // Issue #7: every tool button advertises its purpose via tooltip +
  // aria-label sourced from the TOOL_HINTS registry.
  const mkHintedBtn = (label: string, hintKey: string, extraCls = ''): HTMLButtonElement => {
    const b = mkBtn(label, extraCls);
    const hint = TOOL_HINTS[hintKey];
    if (hint) {
      // Hint lives in `title` ONLY: an aria-label would REPLACE the
      // button's accessible name (breaking getByRole('button', {name})
      // locators in e2e specs and for screen-reader users).
      b.title = hint;
    }
    return b;
  };

  const btnSelect = mkHintedBtn('Select', 'select');
  const btnRect = mkHintedBtn('Rectangle', 'rectangle');
  const btnPoly = mkHintedBtn('Polygon', 'polygon');

  // pkg 3 (issue #4): opening + furniture tools.
  const sep2 = document.createElement('span');
  sep2.className = 'toolbar-sep';
  const btnDoor = mkHintedBtn('Door', 'door', 'editor-door');
  const btnWindow = mkHintedBtn('Window', 'window', 'editor-window');
  const btnStamp = mkHintedBtn('Furnish', 'stamp', 'editor-stamp');

  // pkg 6 (issue #7): export + help buttons.
  const sep3 = document.createElement('span');
  sep3.className = 'toolbar-sep';
  const btnExport = mkBtn('Export', 'editor-export');
  btnExport.title = 'Download the plan as a PNG or JPEG image.';
  btnExport.setAttribute(
    'aria-label',
    'Export — Download the plan as a PNG or JPEG image.',
  );
  btnExport.setAttribute('data-testid', 'btn-export');
  const btnHelp = mkBtn('? Help', 'editor-help');
  btnHelp.title = 'Keyboard shortcuts';
  btnHelp.setAttribute('aria-label', 'Keyboard shortcuts');
  btnHelp.setAttribute('data-testid', 'btn-help');

  const sep = document.createElement('span');
  sep.className = 'toolbar-sep';
  const btnUndo = mkBtn('Undo', 'editor-undo');
  const btnRedo = mkBtn('Redo', 'editor-redo');
  const btnDelete = mkBtn('Delete Selected', 'editor-delete');
  btnDelete.disabled = true;
  btnUndo.disabled = true;
  btnRedo.disabled = true;
  [
    btnSelect, btnRect, btnPoly, sep2, btnDoor, btnWindow, btnStamp, sep,
    btnUndo, btnRedo, btnDelete, sep3, btnExport, btnHelp,
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
    btnUndo, btnRedo, btnDelete,
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
