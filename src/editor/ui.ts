/**
 * Toolbar/status/badge/message DOM for the editor pane. Kept dumb:
 * buildUi returns refs; controller.ts wires behavior.
 */

export interface EditorDomRefs {
  toolbar: HTMLDivElement;
  canvas: HTMLCanvasElement;
  badge: HTMLDivElement;
  msg: HTMLDivElement;
  status: HTMLSpanElement;
  btnSelect: HTMLButtonElement;
  btnRect: HTMLButtonElement;
  btnPoly: HTMLButtonElement;
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
  const sep = document.createElement('span');
  sep.className = 'toolbar-sep';
  const btnUndo = mkBtn('Undo', 'editor-undo');
  const btnRedo = mkBtn('Redo', 'editor-redo');
  const btnDelete = mkBtn('Delete Selected', 'editor-delete');
  btnDelete.disabled = true;
  btnUndo.disabled = true;
  btnRedo.disabled = true;
  [btnSelect, btnRect, btnPoly, sep, btnUndo, btnRedo, btnDelete].forEach((el) =>
    toolbar.appendChild(el),
  );

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
  pane.append(toolbar, canvasWrap, statusBar);
  parent.appendChild(pane);

  return {
    toolbar, canvas, badge, msg, status,
    btnSelect, btnRect, btnPoly, btnUndo, btnRedo, btnDelete,
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
