/**
 * Toolbar/status/badge/message DOM for the editor pane. Kept dumb:
 * buildUi returns refs; controller.ts wires behavior.
 */
import { FURNITURE_DEFAULTS } from './model/constants';

export interface EditorDomRefs {
  toolbar: HTMLDivElement;
  canvas: HTMLCanvasElement;
  badge: HTMLDivElement;
  msg: HTMLDivElement;
  status: HTMLSpanElement;
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

  const btnSelect = mkBtn('Select', '');
  const btnRect = mkBtn('Rectangle', '');
  const btnPoly = mkBtn('Polygon', '');

  // pkg 3 (issue #4): opening + furniture tools.
  const sep2 = document.createElement('span');
  sep2.className = 'toolbar-sep';
  const btnDoor = mkBtn('Door', 'editor-door');
  const btnWindow = mkBtn('Window', 'editor-window');
  const btnStamp = mkBtn('Furnish', 'editor-stamp');

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
    btnUndo, btnRedo, btnDelete,
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
  statusBar.appendChild(status);

  canvasWrap.append(canvas, badge, msg);
  pane.append(toolbar, palette, canvasWrap, statusBar);
  parent.appendChild(pane);

  return {
    toolbar, canvas, badge, msg, status,
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
