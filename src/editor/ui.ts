/**
 * Toolbar/status/badge/message DOM for the editor pane. Kept dumb:
 * buildUi returns refs; controller.ts wires behavior.
 */
import { FURNITURE_DEFAULTS } from "./model/constants";
import { iconMarkup, type IconKey } from "./icons";
import { TOOL_HINTS } from "./polish";

export interface EditorDomRefs {
  toolbar: HTMLDivElement;
  canvas: HTMLCanvasElement;
  badge: HTMLDivElement;
  msg: HTMLDivElement;
  status: HTMLSpanElement;
  statusTotal: HTMLSpanElement;
  btnExport: HTMLButtonElement;
  /* pkg 10.1 (issue #91): share/import/export-JSON trio beside Export. */
  btnShare: HTMLButtonElement;
  btnImport: HTMLButtonElement;
  btnExportJson: HTMLButtonElement;
  importFileInput: HTMLInputElement;
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
  /* pkg 12.1 (issue #99): blueprint underlay — import button, hidden
   * file input, and the controls popover anchored to the button. */
  btnUnderlay: HTMLButtonElement;
  underlayFileInput: HTMLInputElement;
  underlayPopover: HTMLDivElement;
  underlayOpacity: HTMLInputElement;
  underlayOpacityValue: HTMLSpanElement;
  btnUnderlayRotateCCW: HTMLButtonElement;
  btnUnderlayRotateCW: HTMLButtonElement;
  underlayLock: HTMLInputElement;
  underlayHide: HTMLInputElement;
  btnUnderlayRemove: HTMLButtonElement;
  btnSnap: HTMLButtonElement;
  snapPopover: HTMLDivElement;
  btnAddMeasure: HTMLButtonElement;
  btnClearMeasure: HTMLButtonElement;
  /* pkg 7.2 (issue #75): floor selector group. */
  btnPrevFloor: HTMLButtonElement;
  btnNextFloor: HTMLButtonElement;
  btnAddFloor: HTMLButtonElement;
  floorBadge: HTMLButtonElement;
  floorPopover: HTMLDivElement;
  floorRenameForm: HTMLFormElement;
  floorRenameInput: HTMLInputElement;
  btnDeleteFloor: HTMLButtonElement;
  /* pkg 8.1 (issue #83): wall-lean popover (roof authoring). */
  leanPopover: HTMLDivElement;
  leanForm: HTMLFormElement;
  leanSegFieldset: HTMLFieldSetElement;
  leanSlider: HTMLInputElement;
  leanValue: HTMLSpanElement;
  btnClearLean: HTMLButtonElement;
  /* Pkg 12.3 (issue #101): inspector panel — toggle + dock. */
  btnInspector: HTMLButtonElement;
  inspectorDock: HTMLDivElement;
  /* Pkg 13.1 (issue #109): mini-3D inset — toggle (dock lives in glue). */
  btnMini3d: HTMLButtonElement;
}

export function buildEditorUi(parent: HTMLElement): EditorDomRefs {
  const pane = document.createElement("section");
  pane.className = "pane pane-editor";
  pane.dataset.screen = "editor";

  const toolbar = document.createElement("div");
  toolbar.className = "editor-toolbar";
  toolbar.setAttribute("role", "toolbar");

  // Issue #54 (Pkg 3): buttons may carry an inline SVG icon. The icon is
  // APPENDED (aria-hidden) alongside a <span> holding the label, so the
  // accessible name stays the label text (e2e getByRole names depend on
  // this — never replace the text node).
  const mkBtn = (
    label: string,
    extraCls: string,
    icon?: IconKey,
  ): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `editor-btn ${extraCls}`.trim();
    if (icon) b.innerHTML = iconMarkup(icon);
    const span = document.createElement("span");
    span.className = "editor-btn-label";
    span.textContent = label;
    b.appendChild(span);
    return b;
  };

  // Issue #7: every tool button advertises its purpose via tooltip +
  // aria-label sourced from the TOOL_HINTS registry.
  const mkHintedBtn = (
    label: string,
    hintKey: string,
    extraCls = "",
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

  const btnSelect = mkHintedBtn("Select", "select", "", "select");
  const btnRect = mkHintedBtn("Rectangle", "rectangle", "", "rectangle");
  const btnPoly = mkHintedBtn("Polygon", "polygon", "", "polygon");

  // pkg 3 (issue #4): opening + furniture tools.
  const sep2 = document.createElement("span");
  sep2.className = "toolbar-sep";
  const btnDoor = mkHintedBtn("Door", "door", "editor-door", "door");
  const btnWindow = mkHintedBtn("Window", "window", "editor-window", "window");
  const btnStamp = mkHintedBtn("Furnish", "stamp", "editor-stamp", "furnish");

  // Issue #66 (Pkg 1): two-point measure tool.
  const btnMeasure = mkHintedBtn(
    "Measure",
    "measure",
    "editor-measure",
    "measure",
  );

  // pkg 6 (issue #7): export + help buttons.
  const sep3 = document.createElement("span");
  sep3.className = "toolbar-sep";
  const btnExport = mkBtn("Export", "editor-export", "export");
  btnExport.title = "Download the plan as a PNG or JPEG image.";
  btnExport.setAttribute(
    "aria-label",
    "Export — Download the plan as a PNG or JPEG image.",
  );
  btnExport.setAttribute("data-testid", "btn-export");

  // pkg 10.1 (issue #91): share-link + JSON transfer trio. Plain
  // buttons beside Export — the mkBtn precedent keeps the accessible
  // name purely textual (Tab-reachable, getByRole-friendly; hints in
  // `title` only, never aria-label).
  const btnShare = mkBtn("Share", "editor-share");
  btnShare.title = "Copy a shareable link to this plan (works offline).";
  btnShare.setAttribute("data-testid", "btn-share");
  const btnImport = mkBtn("Import", "editor-import");
  btnImport.title = "Load a plan from an exported JSON file.";
  btnImport.setAttribute("data-testid", "btn-import");
  const btnExportJson = mkBtn("Save JSON", "editor-export-json");
  btnExportJson.title = "Download the plan as a JSON file.";
  btnExportJson.setAttribute("data-testid", "btn-export-json");

  // Hidden file input backing Import: clicking the button forwards to
  // it (mouseless flows activate the same button via Enter/Space, so
  // the picker opens identically for keyboard users).
  const importFileInput = document.createElement("input");
  importFileInput.type = "file";
  importFileInput.accept = "application/json,.json";
  importFileInput.dataset.testid = "import-file-input";
  importFileInput.setAttribute("aria-hidden", "true");
  importFileInput.tabIndex = -1;
  importFileInput.hidden = true;

  const btnHelp = mkBtn("? Help", "editor-help", "help");
  btnHelp.title = "Keyboard shortcuts";
  btnHelp.setAttribute("aria-label", "Keyboard shortcuts");
  btnHelp.setAttribute("data-testid", "btn-help");

  // pkg 2 (issue #46): 2D navigation — center + zoom buttons. Hints live
  // in `title` only (an aria-label would replace the accessible name).
  const sep4 = document.createElement("span");
  sep4.className = "toolbar-sep";
  const btnCenter = mkBtn("Center", "editor-center", "center");
  btnCenter.title = "Fit the whole plan inside the viewport.";
  btnCenter.setAttribute("data-testid", "btn-center");
  const btnZoomIn = mkBtn("Zoom in", "editor-zoom-in", "zoom-in");
  btnZoomIn.title = "Zoom in around the canvas centre.";
  btnZoomIn.setAttribute("data-testid", "btn-zoom-in");
  const btnZoomOut = mkBtn("Zoom out", "editor-zoom-out", "zoom-out");
  btnZoomOut.title = "Zoom out around the canvas centre.";
  btnZoomOut.setAttribute("data-testid", "btn-zoom-out");

  const sep = document.createElement("span");
  sep.className = "toolbar-sep";
  const btnUndo = mkBtn("Undo", "editor-undo", "undo");
  const btnRedo = mkBtn("Redo", "editor-redo", "redo");
  const btnDelete = mkBtn("Delete Selected", "editor-delete", "delete");
  btnDelete.disabled = true;
  btnUndo.disabled = true;
  btnRedo.disabled = true;
  // Issue #60: one "Dimensions" toggle gates wall length labels AND
  // room-area badges together (heartbeat of the measurement overlay).
  const sep5 = document.createElement("span");
  sep5.className = "toolbar-sep";
  const btnDimensions = mkBtn("Dimensions", "editor-dimensions", "dimensions");
  btnDimensions.title = "Show or hide wall lengths and room areas.";
  btnDimensions.setAttribute("aria-pressed", "true");
  btnDimensions.setAttribute("data-testid", "btn-dimensions");
  // Issue #68: snap settings (grid pitch + master switch).
  const sep6 = document.createElement("span");
  sep6.className = "toolbar-sep";
  const btnSnap = mkBtn("Snap", "editor-snap", "snap");
  btnSnap.title = "Grid pitch and snapping on/off.";
  btnSnap.setAttribute("aria-expanded", "false");
  btnSnap.setAttribute("aria-haspopup", "dialog");
  btnSnap.setAttribute("data-testid", "btn-snap");
  // Issue #66: wipe-all for measure annotations, next to the toggle.
  const btnClearMeasure = mkBtn("Clear measurements", "editor-clear-measure");
  btnClearMeasure.title = "Remove every dimension annotation.";
  btnClearMeasure.setAttribute("data-testid", "btn-clear-measurements");

  // pkg 12.1 (issue #99): blueprint underlay. Agreed insertion point vs
  // #101 — directly AFTER the Dimensions cluster, before the snap
  // group, so the two PRs' toolbar hunks stay disjoint. Button toggles
  // the controls popover; importing happens through the hidden file
  // input (mouseless: the button is Tab-reachable, the picker opens
  // via its click forwarding).
  const btnUnderlay = mkBtn('Underlay', 'editor-underlay');
  btnUnderlay.title = 'Import a blueprint image to trace walls over.';
  btnUnderlay.setAttribute('aria-expanded', 'false');
  btnUnderlay.setAttribute('aria-haspopup', 'dialog');
  btnUnderlay.setAttribute('data-testid', 'btn-underlay');

  // Hidden file input backing the underlay import (importFileInput
  // precedent): must live in the document for .click() to summon the
  // picker; hidden keeps it out of layout + a11y tree.
  const underlayFileInput = document.createElement('input');
  underlayFileInput.type = 'file';
  underlayFileInput.accept = 'image/png,image/jpeg,image/webp';
  underlayFileInput.dataset.testid = 'underlay-file-input';
  underlayFileInput.setAttribute('aria-hidden', 'true');
  underlayFileInput.tabIndex = -1;
  underlayFileInput.hidden = true;

  // pkg 7.2 (issue #75): floor selector group — Prev / indicator+menu /
  // Next / Add. Fully mouseless: plain buttons, Tab-reachable, with
  // PageUp/PageDown + [ / ] keyboard aliases (glue.ts).
  const sep7 = document.createElement("span");
  sep7.className = "toolbar-sep";
  const btnPrevFloor = mkBtn("Previous floor", "editor-prev-floor");
  btnPrevFloor.title = "Switch to the floor below (PageUp).";
  btnPrevFloor.setAttribute("data-testid", "btn-prev-floor");
  const floorBadge = mkBtn("Ground · Level 1", "editor-floor-badge");
  floorBadge.title = "Active floor. Click to rename or delete it.";
  floorBadge.setAttribute("aria-expanded", "false");
  floorBadge.setAttribute("aria-haspopup", "dialog");
  floorBadge.setAttribute("data-testid", "floor-badge");
  const btnNextFloor = mkBtn("Next floor", "editor-next-floor");
  btnNextFloor.title = "Switch to the floor above (PageDown).";
  btnNextFloor.setAttribute("data-testid", "btn-next-floor");
  const btnAddFloor = mkBtn("Add floor", "editor-add-floor");
  btnAddFloor.title = "Append a new floor above the current one.";
  btnAddFloor.setAttribute("data-testid", "btn-add-floor");

  // Pkg 12.3 (issue #101): Inspector toggle — deliberately LAST in the
  // toolbar (agreed insertion point vs #99's Dimensions-cluster rows).
  // The panel it toggles promotes the secret-shortcut flows (wall lean,
  // opening dims) into a visible, keyboard-first surface.
  const btnInspector = mkBtn("Inspector", "editor-inspector");
  btnInspector.title = "Toggle the selection inspector panel (I).";
  btnInspector.setAttribute("aria-pressed", "false");
  btnInspector.setAttribute("data-testid", "btn-inspector");

  // Pkg 13.1 (issue #109): mini-3D inset toggle — inserted IMMEDIATELY
  // BEFORE the Inspector button (pre-agreed anchor vs #110/#111; the
  // inset docks as a flex sibling of the inspector panel). Heavy 3D
  // modules load lazily on FIRST enable (glue.ts) so the editor chunk
  // stays lean.
  const btnMini3d = mkBtn("3D inset", "editor-mini3d");
  btnMini3d.title = "Toggle the live 3D inset preview (3).";
  btnMini3d.setAttribute("aria-pressed", "false");
  btnMini3d.setAttribute("data-testid", "btn-mini3d");

  [
    btnSelect, btnRect, btnPoly, sep2, btnDoor, btnWindow, btnStamp,
    btnMeasure, sep,
    btnUndo, btnRedo, btnDelete, sep3, btnExport, btnShare, btnImport,
    btnExportJson, btnHelp,
    sep4, btnCenter, btnZoomIn, btnZoomOut, sep5, btnDimensions,
    btnClearMeasure, btnUnderlay, sep6, btnSnap,
    sep7, btnPrevFloor, floorBadge, btnNextFloor, btnAddFloor,
    // #101 agreed insertion point: Inspector toggle LAST in the toolbar.
    // #109: mini-3D toggle sits immediately BEFORE it (pre-agreed).
    btnMini3d,
    btnInspector,
  ].forEach((el) =>
    toolbar.appendChild(el),
  );

  // Issue #68: snap-settings popover — the first popover in the
  // codebase, kept deliberately dumb: a visibility-toggled div
  // absolutely positioned relative to the toolbar, closed on outside
  // click / Escape (listeners wired in glue.ts). Radio group for the
  // pitch + a master checkbox; #54 token palette styling.
  const snapPopover = document.createElement("div");
  snapPopover.className = "snap-popover";
  snapPopover.setAttribute("role", "dialog");
  snapPopover.setAttribute("aria-label", "Snapping settings");
  snapPopover.setAttribute("data-testid", "snap-popover");
  snapPopover.hidden = true;

  const snapTitle = document.createElement("div");
  snapTitle.className = "snap-popover-title";
  snapTitle.textContent = "Snapping";
  snapPopover.appendChild(snapTitle);

  const pitchGroup = document.createElement("fieldset");
  pitchGroup.className = "snap-fieldset";
  const pitchLegend = document.createElement("legend");
  pitchLegend.textContent = "Grid pitch (m)";
  pitchGroup.appendChild(pitchLegend);
  for (const value of [0.1, 0.25, 0.5, 1] as const) {
    const label = document.createElement("label");
    label.className = "snap-radio";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "snap-pitch";
    radio.value = String(value);
    radio.dataset.testid = `snap-pitch-${String(value).replace(".", "-")}`;
    label.append(
      radio,
      document.createTextNode(` ${value.toFixed(value < 1 ? 2 : 1)} m`),
    );
    pitchGroup.appendChild(label);
  }
  snapPopover.appendChild(pitchGroup);

  const masterLabel = document.createElement("label");
  masterLabel.className = "snap-master";
  const masterCheckbox = document.createElement("input");
  masterCheckbox.type = "checkbox";
  masterCheckbox.dataset.testid = "snap-master";
  masterLabel.append(
    masterCheckbox,
    document.createTextNode(" Enable snapping"),
  );
  snapPopover.appendChild(masterLabel);

  toolbar.appendChild(snapPopover);

  // pkg 7.2 (issue #75): floor rename/delete popover — #68 snapPopover
  // precedent (visibility-toggled div, role=dialog, Escape/outside
  // close wired in glue.ts). Holds the rename form + delete button.
  const floorPopover = document.createElement("div");
  floorPopover.className = "snap-popover floor-popover";
  floorPopover.setAttribute("role", "dialog");
  floorPopover.setAttribute("aria-label", "Floor settings");
  floorPopover.setAttribute("data-testid", "floor-popover");
  floorPopover.hidden = true;

  const floorTitle = document.createElement("div");
  floorTitle.className = "snap-popover-title";
  floorTitle.textContent = "Floor";
  floorPopover.appendChild(floorTitle);

  const floorRenameForm = document.createElement("form");
  floorRenameForm.className = "floor-rename-form";
  const floorRenameInput = document.createElement("input");
  floorRenameInput.type = "text";
  floorRenameInput.name = "floor-name";
  floorRenameInput.dataset.testid = "floor-rename-input";
  floorRenameInput.setAttribute("aria-label", "Floor name");
  const renameSubmit = document.createElement("button");
  renameSubmit.type = "submit";
  renameSubmit.className = "editor-btn";
  renameSubmit.textContent = "Rename";
  renameSubmit.setAttribute("data-testid", "btn-rename-floor");
  floorRenameForm.append(floorRenameInput, renameSubmit);
  floorPopover.appendChild(floorRenameForm);

  const btnDeleteFloor = document.createElement("button");
  btnDeleteFloor.type = "button";
  btnDeleteFloor.className = "editor-btn editor-delete-floor";
  btnDeleteFloor.textContent = "Delete floor";
  btnDeleteFloor.title = "Delete the active floor and its contents.";
  btnDeleteFloor.setAttribute("data-testid", "btn-delete-floor");
  floorPopover.appendChild(btnDeleteFloor);

  toolbar.appendChild(floorPopover);

  // pkg 8.1 (issue #83): wall-lean popover — #68/#75 precedent (visibility-
  // toggled div, role=dialog, Escape/outside close in glue.ts). Populated
  // per selected room by glue.ts (one radio per wall segment + a degree
  // slider); fully keyboard-operable (radios + range input + form submit).
  const leanPopover = document.createElement("div");
  leanPopover.className = "snap-popover lean-popover";
  leanPopover.setAttribute("role", "dialog");
  leanPopover.setAttribute("aria-label", "Wall lean (roof)");
  leanPopover.setAttribute("data-testid", "lean-popover");
  leanPopover.hidden = true;

  const leanTitle = document.createElement("div");
  leanTitle.className = "snap-popover-title";
  leanTitle.textContent = "Wall lean (roof)";
  leanPopover.appendChild(leanTitle);

  const leanForm = document.createElement("form");
  leanForm.className = "lean-form";

  const leanSegFieldset = document.createElement("fieldset");
  leanSegFieldset.className = "snap-fieldset";
  const leanLegend = document.createElement("legend");
  leanLegend.textContent = "Wall";
  leanSegFieldset.appendChild(leanLegend);
  leanForm.appendChild(leanSegFieldset);

  const leanSliderLabel = document.createElement("label");
  leanSliderLabel.className = "snap-master";
  const leanSlider = document.createElement("input");
  leanSlider.type = "range";
  leanSlider.name = "lean-deg";
  leanSlider.min = "0";
  leanSlider.max = "75";
  leanSlider.step = "1";
  leanSlider.value = "0";
  leanSlider.dataset.testid = "lean-slider";
  leanSlider.setAttribute("aria-label", "Lean degrees");
  const leanValue = document.createElement("span");
  leanValue.dataset.testid = "lean-value";
  leanValue.textContent = "0°";
  leanSliderLabel.append(leanSlider, leanValue);
  leanForm.appendChild(leanSliderLabel);

  const leanApply = document.createElement("button");
  leanApply.type = "submit";
  leanApply.className = "editor-btn";
  leanApply.textContent = "Apply";
  leanApply.setAttribute("data-testid", "btn-apply-lean");
  leanForm.appendChild(leanApply);

  leanPopover.appendChild(leanForm);

  const btnClearLean = document.createElement("button");
  btnClearLean.type = "button";
  btnClearLean.className = "editor-btn editor-clear-lean";
  btnClearLean.textContent = "Clear lean";
  btnClearLean.title = "Remove the lean from the selected wall.";
  btnClearLean.setAttribute("data-testid", "btn-clear-lean");
  leanPopover.appendChild(btnClearLean);

  toolbar.appendChild(leanPopover);

  // pkg 12.1 (issue #99): underlay controls popover — #68/#75/#83
  // precedent (visibility-toggled div, role=dialog, Escape/outside
  // close wired in glue.ts). Anchored to the toolbar like its siblings
  // (NO side panel — deliberate, keeps #101's docking work disjoint).
  // Controls are seeded from the active floor's underlay on each open.
  const underlayPopover = document.createElement('div');
  underlayPopover.className = 'snap-popover underlay-popover';
  underlayPopover.setAttribute('role', 'dialog');
  underlayPopover.setAttribute('aria-label', 'Blueprint underlay');
  underlayPopover.setAttribute('data-testid', 'underlay-popover');
  underlayPopover.hidden = true;

  const underlayTitle = document.createElement('div');
  underlayTitle.className = 'snap-popover-title';
  underlayTitle.textContent = 'Blueprint underlay';
  underlayPopover.appendChild(underlayTitle);

  const opacityLabel = document.createElement('label');
  opacityLabel.className = 'snap-master';
  const underlayOpacity = document.createElement('input');
  underlayOpacity.type = 'range';
  underlayOpacity.name = 'underlay-opacity';
  underlayOpacity.min = '0';
  underlayOpacity.max = '100';
  underlayOpacity.step = '1';
  underlayOpacity.value = '60';
  underlayOpacity.dataset.testid = 'underlay-opacity';
  underlayOpacity.setAttribute('aria-label', 'Underlay opacity percent');
  const underlayOpacityValue = document.createElement('span');
  underlayOpacityValue.dataset.testid = 'underlay-opacity-value';
  underlayOpacityValue.textContent = '60%';
  opacityLabel.append(underlayOpacity, underlayOpacityValue);
  underlayPopover.appendChild(opacityLabel);

  const rotateRow = document.createElement('div');
  rotateRow.className = 'underlay-rotate-row';
  const btnUnderlayRotateCCW = document.createElement('button');
  btnUnderlayRotateCCW.type = 'button';
  btnUnderlayRotateCCW.className = 'editor-btn';
  btnUnderlayRotateCCW.textContent = '↺ 5°';
  btnUnderlayRotateCCW.title = 'Rotate the underlay 5° counter-clockwise.';
  btnUnderlayRotateCCW.setAttribute('data-testid', 'btn-underlay-rotate-ccw');
  const btnUnderlayRotateCW = document.createElement('button');
  btnUnderlayRotateCW.type = 'button';
  btnUnderlayRotateCW.className = 'editor-btn';
  btnUnderlayRotateCW.textContent = '↻ 5°';
  btnUnderlayRotateCW.title = 'Rotate the underlay 5° clockwise.';
  btnUnderlayRotateCW.setAttribute('data-testid', 'btn-underlay-rotate-cw');
  rotateRow.append(btnUnderlayRotateCCW, btnUnderlayRotateCW);
  underlayPopover.appendChild(rotateRow);

  const lockLabel = document.createElement('label');
  lockLabel.className = 'snap-radio';
  const underlayLock = document.createElement('input');
  underlayLock.type = 'checkbox';
  underlayLock.dataset.testid = 'underlay-lock';
  lockLabel.append(underlayLock, document.createTextNode(' Lock'));
  underlayPopover.appendChild(lockLabel);

  const hideLabel = document.createElement('label');
  hideLabel.className = 'snap-radio';
  const underlayHide = document.createElement('input');
  underlayHide.type = 'checkbox';
  underlayHide.dataset.testid = 'underlay-hide';
  hideLabel.append(underlayHide, document.createTextNode(' Hide'));
  underlayPopover.appendChild(hideLabel);

  const btnUnderlayRemove = document.createElement('button');
  btnUnderlayRemove.type = 'button';
  btnUnderlayRemove.className = 'editor-btn editor-underlay-remove';
  btnUnderlayRemove.textContent = 'Remove image';
  btnUnderlayRemove.title = 'Remove this floor\u2019s underlay image.';
  btnUnderlayRemove.setAttribute('data-testid', 'btn-underlay-remove');
  underlayPopover.appendChild(btnUnderlayRemove);

  toolbar.appendChild(underlayPopover);

  // Furniture palette (visible only while the Furnish tool is armed).
  const palette = document.createElement("div");
  palette.className = "editor-palette";
  palette.hidden = true;
  for (const [type, def] of Object.entries(FURNITURE_DEFAULTS)) {
    const chip = mkBtn(def.label, "palette-chip");
    chip.dataset.stampType = type;
    palette.appendChild(chip);
  }

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "editor-canvas-wrap";

  const canvas = document.createElement("canvas");
  canvas.className = "editor-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Floorplan canvas");

  const badge = document.createElement("div");
  badge.className = "overlap-badge";
  badge.hidden = true;
  badge.textContent = "\u26a0\uFE0F Rooms overlap";

  const msg = document.createElement("div");
  msg.className = "inline-msg";
  msg.hidden = true;

  const statusBar = document.createElement("div");
  statusBar.className = "editor-statusbar";
  const status = document.createElement("span");
  status.className = "editor-status";
  const statusTotal = document.createElement("span");
  statusTotal.className = "editor-status-total";
  statusTotal.setAttribute("data-testid", "status-total");
  statusTotal.textContent = "Total: 0.0 m\u00B2";
  statusBar.append(status, statusTotal);

  // Pkg 12.3 (issue #101): inspector dock — a flex ROW wrapping the
  // canvas wrapper with the panel mount as a SIBLING. The canvas sizes
  // from its wrapper's box (ResizeObserver in glue.ts), so docking the
  // panel narrows the wrapper AUTOMATICALLY: zero sizing-math edits.
  const inspectorDock = document.createElement("div");
  inspectorDock.className = "editor-main-area";

  canvasWrap.append(canvas, badge, msg);
  inspectorDock.append(canvasWrap);
  // The hidden import input must live IN the document for .click() to
  // summon the file picker; `hidden` keeps it out of layout + a11y tree.
  pane.append(toolbar, palette, inspectorDock, statusBar, importFileInput, underlayFileInput);
  parent.appendChild(pane);

  return {
    toolbar, canvas, badge, msg, status, statusTotal,
    btnExport, btnShare, btnImport, btnExportJson, importFileInput, btnHelp,
    btnSelect, btnRect, btnPoly, btnDoor, btnWindow, btnStamp, palette,
    btnDimensions, btnSnap, snapPopover,
    btnUnderlay, underlayFileInput, underlayPopover, underlayOpacity,
    underlayOpacityValue, btnUnderlayRotateCCW, btnUnderlayRotateCW,
    underlayLock, underlayHide, btnUnderlayRemove,
    btnAddMeasure: btnMeasure, btnClearMeasure,
    btnUndo, btnRedo, btnDelete,
    btnCenter, btnZoomIn, btnZoomOut,
    btnPrevFloor, btnNextFloor, btnAddFloor, floorBadge,
    floorPopover, floorRenameForm, floorRenameInput, btnDeleteFloor,
    leanPopover, leanForm, leanSegFieldset, leanSlider, leanValue, btnClearLean,
    btnInspector, inspectorDock,
    btnMini3d,
  };
}

/** Show an ephemeral inline message (auto-clears after ms). */
export function flashMessage(
  refs: EditorDomRefs,
  text: string,
  ttlMs = 3200,
): void {
  refs.msg.textContent = text;
  refs.msg.hidden = false;
  window.setTimeout(() => {
    if (refs.msg.textContent === text) refs.msg.hidden = true;
  }, ttlMs);
}

export function hideMessage(refs: EditorDomRefs): void {
  refs.msg.hidden = true;
}
