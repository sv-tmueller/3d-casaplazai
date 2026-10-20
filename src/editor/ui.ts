/**
 * Toolbar/status/badge/message DOM for the editor pane. Kept dumb:
 * buildUi returns refs; controller.ts wires behavior.
 *
 * pkg #142 (Toolbar IA): the old single flat `.editor-toolbar` row is
 * split into a top APP BAR (plan name · history · floor nav · File menu ·
 * view cluster · toggles · help) and a left TOOL RAIL (the 8 tools).
 * Every button keeps its element identity, data-testid and accessible
 * name, so glue.ts listeners keep firing with zero rewiring — only DOM
 * positions changed. Popover owners are wrapped in `.pop-anchor` spans
 * (position:relative) and OWN their popover, so a single CSS rule
 * relocates every popover; glue's outside-click dismissal is
 * contains()-based and therefore location-blind.
 */
import { FURNITURE_DEFAULTS } from "./model/constants";
import { iconMarkup, type IconKey } from "./icons";
import { TOOL_HINTS } from "./polish";

export interface EditorDomRefs {
  /* pkg #142: the retired `toolbar` ref is now appbar + rail; both keep
   * role="toolbar" with distinct aria-labels. */
  appbar: HTMLDivElement;
  rail: HTMLDivElement;
  /* pkg #142: static plan-name label (the schema has no plan-name field
   * and the batch forbids schema evolution — read-only for now). */
  planName: HTMLSpanElement;
  canvas: HTMLCanvasElement;
  badge: HTMLDivElement;
  msg: HTMLDivElement;
  status: HTMLSpanElement;
  /* pkg #142: middle status-bar zone — live cursor position in meters. */
  statusCoords: HTMLSpanElement;
  statusTotal: HTMLSpanElement;
  btnExport: HTMLButtonElement;
  /* pkg #142: File menu owner + the popover it toggles. */
  btnFile: HTMLButtonElement;
  fileMenu: HTMLDivElement;
  /* pkg 10.1 (issue #91): share/import/export-JSON trio — now the File
   * menu's items (same elements, same names). */
  btnShare: HTMLButtonElement;
  btnImport: HTMLButtonElement;
  btnExportJson: HTMLButtonElement;
  importFileInput: HTMLInputElement;
  btnHelp: HTMLButtonElement;
  btnSelect: HTMLButtonElement;
  btnRect: HTMLButtonElement;
  btnPoly: HTMLButtonElement;
  /* pkg 14.x (issue #126): pan tool + dark-theme toggle. */
  btnPan: HTMLButtonElement;
  btnTheme: HTMLButtonElement;
  btnDoor: HTMLButtonElement;
  btnWindow: HTMLButtonElement;
  btnStamp: HTMLButtonElement;
  /* pkg 13.4 (issue #118): staircase tool button. */
  btnStairs: HTMLButtonElement;
  palette: HTMLDivElement;
  /* pkg #142: Measure-tool flyout holding the clear button (palette
   * pattern: shown only while the Measure tool is armed). */
  measureFlyout: HTMLDivElement;
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

  // pkg #142: two surfaces replace the one flat toolbar row. The app bar
  // carries document-level actions; the rail carries the drawing tools.
  const appbar = document.createElement("div");
  appbar.className = "editor-appbar";
  appbar.setAttribute("role", "toolbar");
  appbar.setAttribute("aria-label", "Editor actions");

  const rail = document.createElement("div");
  rail.className = "editor-rail";
  rail.setAttribute("role", "toolbar");
  rail.setAttribute("aria-label", "Tools");
  rail.setAttribute("aria-orientation", "vertical");

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

  // pkg #142 (Toolbar IA) — AUTHORIZED aria-label exception. The app bar
  // cannot honour "never wraps at 1280px" with every label spelled out,
  // so a fixed set of actions renders icon-only. Their `aria-label` is
  // the EXACT former visible label, so the accessible name (and every
  // getByRole locator) is byte-identical: the house rule "hints in
  // `title` only" exists to protect the NAME, and this preserves it.
  const iconOnly = (b: HTMLButtonElement, label: string): HTMLButtonElement => {
    b.setAttribute("aria-label", label);
    b.classList.add("icon-only");
    return b;
  };

  // Issue #7: every tool button advertises its purpose via tooltip +
  // aria-label sourced from the TOOL_HINTS registry.
  // Issue #143: the tool's single-key hotkey rides the tooltip — the
  // TOOL_HINTS sentences stay untouched (status bar + #142 own those).
  // Behavior side of the same contract: TOOL_HOTKEYS in glue.ts.
  const HINT_HOTKEYS: Record<string, string> = {
    select: "V",
    rectangle: "R",
    polygon: "P",
    door: "D",
    window: "W",
    stamp: "F",
    stairs: "T",
    measure: "M",
  };
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
      const key = HINT_HOTKEYS[hintKey];
      b.title = key ? `${hint} (${key})` : hint;
    }
    // pkg #142: rail tools additionally carry an aria-label IDENTICAL to
    // the visible label. Below 1100px (container query) the rail
    // collapses to icon-only, and an icon-only button must keep its
    // accessible name — equal-string aria-label does exactly that.
    b.setAttribute("aria-label", label);
    return b;
  };

  const btnSelect = mkHintedBtn("Select", "select", "", "select");
  const btnRect = mkHintedBtn("Rectangle", "rectangle", "", "rectangle");
  const btnPoly = mkHintedBtn("Polygon", "polygon", "", "polygon");
  // pkg 14.x (issue #126): dedicated Pan tool. Alt/middle-drag already
  // pans anywhere; this makes panning a first-class, Tab-reachable mode
  // (and holding Space arms it temporarily — glue.ts).
  const btnPan = mkHintedBtn("Pan", "pan", "", "pan");
  btnPan.setAttribute("data-testid", "btn-pan");

  // pkg 3 (issue #4): opening + furniture tools.
  const btnDoor = mkHintedBtn("Door", "door", "editor-door", "door");
  const btnWindow = mkHintedBtn("Window", "window", "editor-window", "window");
  const btnStamp = mkHintedBtn("Furnish", "stamp", "editor-stamp", "furnish");

  // pkg 13.4 (issue #118): staircase tool — a structural sibling of the
  // door/window/furnish trio. Label span is mandatory (e2e getByRole
  // names depend on it); hint lives in `title` only.
  const btnStairs = mkHintedBtn("Stairs", "stairs", "editor-stairs", "stairs");
  btnStairs.setAttribute("data-testid", "btn-stairs");

  // Issue #66 (Pkg 1): two-point measure tool.
  const btnMeasure = mkHintedBtn(
    "Measure",
    "measure",
    "editor-measure",
    "measure",
  );

  // pkg 6 (issue #7): export + help buttons.
  const btnExport = mkBtn("Export", "editor-export", "export");
  btnExport.title = "Download the plan as a PNG or JPEG image.";
  btnExport.setAttribute(
    "aria-label",
    "Export — Download the plan as a PNG or JPEG image.",
  );
  btnExport.setAttribute("data-testid", "btn-export");

  // pkg 10.1 (issue #91): share-link + JSON transfer trio — now the File
  // menu's items. Plain buttons: the mkBtn precedent keeps the
  // accessible name purely textual (Tab-reachable, getByRole-friendly;
  // hints in `title` only, never aria-label).
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

  // pkg #142: File menu — one owner button ("File", icon-only) whose
  // popover holds Import / Save JSON / Export image / Share. The items
  // are the SAME elements as before, so their glue listeners, testids
  // and accessible names are unchanged.
  const btnFile = iconOnly(mkBtn("File", "editor-file", "file"), "File");
  btnFile.title = "Import, save, export or share this plan.";
  btnFile.setAttribute("aria-haspopup", "dialog");
  btnFile.setAttribute("aria-expanded", "false");
  btnFile.setAttribute("data-testid", "btn-file");

  const fileMenu = document.createElement("div");
  fileMenu.className = "snap-popover file-menu";
  fileMenu.setAttribute("role", "dialog");
  fileMenu.setAttribute("aria-label", "File");
  fileMenu.setAttribute("data-testid", "file-menu");
  fileMenu.hidden = true;
  fileMenu.append(btnImport, btnExportJson, btnExport, btnShare);

  const btnHelp = iconOnly(mkBtn("? Help", "editor-help", "help"), "Help");
  btnHelp.title = "Keyboard shortcuts";
  // Name preserved verbatim: the accessible name was (and stays) the
  // aria-label, which every existing locator keys on.
  btnHelp.setAttribute("aria-label", "Keyboard shortcuts");
  btnHelp.setAttribute("data-testid", "btn-help");
  // pkg 14.x (issue #126): dark-theme toggle — an EDITOR preference
  // (localStorage casaplaza.theme.v1), never plan data. The label stays
  // "Dark"; aria-pressed carries the state (glue.ts syncs it against
  // <html data-theme>).
  const btnTheme = mkBtn("Dark", "editor-theme", "theme");
  btnTheme.title = "Toggle the dark editor theme.";
  btnTheme.setAttribute("aria-pressed", "false");
  btnTheme.setAttribute("data-testid", "btn-theme");

  // pkg 2 (issue #46): 2D navigation — center + zoom buttons.
  const btnCenter = iconOnly(mkBtn("Center", "editor-center", "center"), "Center");
  btnCenter.title = "Fit the whole plan inside the viewport.";
  btnCenter.setAttribute("data-testid", "btn-center");
  const btnZoomIn = iconOnly(
    mkBtn("Zoom in", "editor-zoom-in", "zoom-in"),
    "Zoom in",
  );
  btnZoomIn.title = "Zoom in around the canvas centre.";
  btnZoomIn.setAttribute("data-testid", "btn-zoom-in");
  const btnZoomOut = iconOnly(
    mkBtn("Zoom out", "editor-zoom-out", "zoom-out"),
    "Zoom out",
  );
  btnZoomOut.title = "Zoom out around the canvas centre.";
  btnZoomOut.setAttribute("data-testid", "btn-zoom-out");

  // pkg #142: history cluster — icon-only, names preserved.
  const btnUndo = iconOnly(mkBtn("Undo", "editor-undo", "undo"), "Undo");
  const btnRedo = iconOnly(mkBtn("Redo", "editor-redo", "redo"), "Redo");
  const btnDelete = mkBtn("Delete Selected", "editor-delete", "delete");
  btnDelete.disabled = true;
  btnUndo.disabled = true;
  btnRedo.disabled = true;
  // Issue #60: one "Dimensions" toggle gates wall length labels AND
  // room-area badges together (heartbeat of the measurement overlay).
  const btnDimensions = mkBtn("Dimensions", "editor-dimensions", "dimensions");
  btnDimensions.title = "Show or hide wall lengths and room areas.";
  btnDimensions.setAttribute("aria-pressed", "true");
  btnDimensions.setAttribute("data-testid", "btn-dimensions");
  // Issue #68: snap settings (grid pitch + master switch).
  const btnSnap = mkBtn("Snap", "editor-snap", "snap");
  btnSnap.title = "Grid pitch and snapping on/off.";
  btnSnap.setAttribute("aria-expanded", "false");
  btnSnap.setAttribute("aria-haspopup", "dialog");
  btnSnap.setAttribute("data-testid", "btn-snap");
  // Issue #66: wipe-all for measure annotations — lives with the Measure
  // tool in the rail (pkg #142 judgment call; see the sub-row note below
  // on why it is NOT a floating flyout). aria-label keeps the full
  // accessible name while the visible chip stays short enough for the
  // rail's width.
  const btnClearMeasure = mkBtn("Clear", "editor-clear-measure");
  btnClearMeasure.setAttribute("aria-label", "Clear measurements");
  btnClearMeasure.title = "Remove every dimension annotation.";
  btnClearMeasure.setAttribute("data-testid", "btn-clear-measurements");

  // pkg 12.1 (issue #99): blueprint underlay. Button toggles the controls
  // popover; importing happens through the hidden file input (mouseless:
  // the button is Tab-reachable, the picker opens via its click
  // forwarding).
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
  const btnPrevFloor = iconOnly(
    mkBtn("Previous floor", "editor-prev-floor", "chevron-down"),
    "Previous floor",
  );
  btnPrevFloor.title = "Switch to the floor below (PageUp).";
  btnPrevFloor.setAttribute("data-testid", "btn-prev-floor");
  const floorBadge = mkBtn("Ground · Level 1", "editor-floor-badge");
  floorBadge.title = "Active floor. Click to rename or delete it.";
  floorBadge.setAttribute("aria-expanded", "false");
  floorBadge.setAttribute("aria-haspopup", "dialog");
  floorBadge.setAttribute("data-testid", "floor-badge");
  const btnNextFloor = iconOnly(
    mkBtn("Next floor", "editor-next-floor", "chevron-up"),
    "Next floor",
  );
  btnNextFloor.title = "Switch to the floor above (PageDown).";
  btnNextFloor.setAttribute("data-testid", "btn-next-floor");
  const btnAddFloor = iconOnly(
    mkBtn("Add floor", "editor-add-floor", "plus"),
    "Add floor",
  );
  btnAddFloor.title = "Append a new floor above the current one.";
  btnAddFloor.setAttribute("data-testid", "btn-add-floor");

  // Pkg 12.3 (issue #101): Inspector toggle. The panel it toggles
  // promotes the secret-shortcut flows (wall lean, opening dims) into a
  // visible, keyboard-first surface.
  const btnInspector = mkBtn("Inspector", "editor-inspector");
  btnInspector.title = "Toggle the selection inspector panel (I).";
  btnInspector.setAttribute("aria-pressed", "false");
  btnInspector.setAttribute("data-testid", "btn-inspector");

  // Pkg 13.1 (issue #109): mini-3D inset toggle. Heavy 3D modules load
  // lazily on FIRST enable (glue.ts) so the editor chunk stays lean.
  const btnMini3d = mkBtn("3D inset", "editor-mini3d");
  btnMini3d.title = "Toggle the live 3D inset preview (3).";
  btnMini3d.setAttribute("aria-pressed", "false");
  btnMini3d.setAttribute("data-testid", "btn-mini3d");

  // pkg #142: static plan-name label (read-only until the schema grows
  // a name field; the batch forbids schema evolution).
  const planName = document.createElement("span");
  planName.className = "appbar-plan-name";
  planName.textContent = "Untitled plan";
  planName.title = "Plan name (read-only for now).";

  /* ---------- pkg #142: popover anchors ---------- */

  // Each popover owner gets a `.pop-anchor` wrapper (position:relative)
  // and the popover later moves INSIDE it — one CSS rule then relocates
  // every popover. glue.ts dismissal is contains()-based, so this
  // regrouping is invisible to the behavior layer.
  const mkAnchor = (btn: HTMLButtonElement, cls = ""): HTMLSpanElement => {
    const a = document.createElement("span");
    a.className = `pop-anchor ${cls}`.trim();
    a.appendChild(btn);
    return a;
  };

  const snapAnchor = mkAnchor(btnSnap);
  const underlayAnchor = mkAnchor(btnUnderlay);
  const floorAnchor = mkAnchor(floorBadge, "floor-anchor");
  const fileAnchor = mkAnchor(btnFile, "file-anchor");
  // The menu LIVES inside its anchor so one `.pop-anchor` rule positions
  // it; an orphaned node would never render (and would strand the four
  // file actions out of the document).
  fileAnchor.appendChild(fileMenu);

  /* ---------- pkg #142: app bar assembly ---------- */

  const mkGroup = (cls: string, els: HTMLElement[]): HTMLDivElement => {
    const g = document.createElement("div");
    g.className = `appbar-group ${cls}`.trim();
    g.append(...els);
    return g;
  };

  const spacer = document.createElement("div");
  spacer.className = "appbar-spacer";

  appbar.append(
    planName,
    mkGroup("group-edit", [btnUndo, btnRedo, btnDelete]),
    mkGroup("group-floor", [
      btnPrevFloor,
      floorAnchor,
      btnNextFloor,
      btnAddFloor,
    ]),
    mkGroup("group-file", [fileAnchor]),
    spacer,
    mkGroup("group-view", [btnCenter, btnZoomIn, btnZoomOut]),
    mkGroup("group-toggles", [
      btnDimensions,
      snapAnchor,
      underlayAnchor,
      btnMini3d,
      btnInspector,
      // #126: theme toggle rides with the view toggles.
      btnTheme,
    ]),
    btnHelp,
  );

  /* ---------- pkg #142: tool rail assembly ---------- */

  // Furniture palette (visible only while the Furnish tool is armed) —
  // now a FLYOUT beside the rail: `refs.palette.hidden` (glue.ts) is the
  // single visibility truth, only its CSS position changed.
  const palette = document.createElement("div");
  palette.className = "editor-palette";
  palette.hidden = true;
  for (const [type, def] of Object.entries(FURNITURE_DEFAULTS)) {
    const chip = mkBtn(def.label, "palette-chip");
    chip.dataset.stampType = type;
    palette.appendChild(chip);
  }

  // Measure sub-row: holds the clear button, revealed by CSS only while
  // the Measure tool is armed (`aria-pressed="true"`, set by glue's tool
  // loop) — zero glue wiring. It sits INLINE inside the rail's width, not
  // as a floating flyout beside it: an always-armed overlay there covers
  // the canvas exactly where annotation labels get clicked and swallows
  // those clicks (caught by e2e measure.spec's label-click flow). Class
  // and testid keep the draft's `flyout` wording.
  const measureFlyout = document.createElement("div");
  measureFlyout.className = "measure-flyout";
  measureFlyout.setAttribute("data-testid", "measure-flyout");
  measureFlyout.hidden = true;
  measureFlyout.appendChild(btnClearMeasure);
  const measureAnchor = mkAnchor(btnMeasure, "measure-anchor");
  measureAnchor.classList.add("rail-measure");
  measureAnchor.appendChild(measureFlyout);

  rail.append(
    btnSelect,
    btnRect,
    btnPoly,
    // #126: Pan sits between the shape tools and the openings — the
    // drafting order (draw, navigate, place).
    btnPan,
    btnDoor,
    btnWindow,
    btnStamp,
    btnStairs,
    measureAnchor,
    palette,
  );

  // Issue #68: snap-settings popover — kept deliberately dumb: a
  // visibility-toggled div absolutely positioned relative to its
  // `.pop-anchor` wrapper, closed on outside click / Escape (listeners
  // wired in glue.ts). Radio group for the pitch + a master checkbox;
  // #54 token palette styling.
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

  snapAnchor.appendChild(snapPopover);

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

  floorAnchor.appendChild(floorPopover);

  // pkg 8.1 (issue #83): wall-lean popover — #68/#75 precedent (visibility-
  // toggled div, role=dialog, Escape/outside close in glue.ts). Populated
  // per selected room by glue.ts (one radio per wall segment + a degree
  // slider); fully keyboard-operable (radios + range input + form submit).
  // pkg #142: its opener is NOT a rail/app-bar button (the inspector path
  // owns it), so it stays a direct child of the app bar — where it still
  // hangs from the bar's bottom edge, as before.
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

  appbar.appendChild(leanPopover);

  // pkg 12.1 (issue #99): underlay controls popover — #68/#75/#83
  // precedent (visibility-toggled div, role=dialog, Escape/outside
  // close wired in glue.ts). Controls are seeded from the active floor's
  // underlay on each open.
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

  underlayAnchor.appendChild(underlayPopover);

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "editor-canvas-wrap";

  const canvas = document.createElement("canvas");
  canvas.className = "editor-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Floorplan canvas");

  const badge = document.createElement("div");
  badge.className = "overlap-badge";
  badge.hidden = true;
  badge.textContent = "\u26a0\ufe0f Rooms overlap";

  const msg = document.createElement("div");
  msg.className = "inline-msg";
  msg.hidden = true;
  // Pkg 155 (issue #155): the flash container is a live region. The
  // default level is polite ("status"); error flashes flip it to
  // "alert" via flashMessage's `level` param.
  msg.setAttribute("role", "status");
  msg.setAttribute("aria-live", "polite");

  const statusBar = document.createElement("div");
  statusBar.className = "editor-statusbar";
  const status = document.createElement("span");
  status.className = "editor-status";
  // pkg #142: three-zone status bar — tool hint | cursor (m) | area total.
  const statusCoords = document.createElement("span");
  statusCoords.className = "editor-status-coords";
  statusCoords.setAttribute("data-testid", "status-coords");
  const statusTotal = document.createElement("span");
  statusTotal.className = "editor-status-total";
  statusTotal.setAttribute("data-testid", "status-total");
  statusTotal.textContent = "Total: 0.0 m\u00B2";
  statusBar.append(status, statusCoords, statusTotal);

  // Pkg 12.3 (issue #101): inspector dock — a flex ROW wrapping the
  // canvas wrapper with the panel mount as a SIBLING. The canvas sizes
  // from its wrapper's box (ResizeObserver in glue.ts), so docking the
  // panel narrows the wrapper AUTOMATICALLY: zero sizing-math edits.
  // pkg #142: the tool rail leads the row, so the rail, canvas and
  // inspector panel stack horizontally without any overlap.
  const inspectorDock = document.createElement("div");
  inspectorDock.className = "editor-main-area";

  canvasWrap.append(canvas, badge, msg);
  inspectorDock.append(rail, canvasWrap);
  // The hidden import input must live IN the document for .click() to
  // summon the file picker; `hidden` keeps it out of layout + a11y tree.
  pane.append(appbar, inspectorDock, statusBar, importFileInput, underlayFileInput);
  parent.appendChild(pane);

  return {
    appbar, rail, planName,
    canvas, badge, msg, status, statusCoords, statusTotal,
    btnExport, btnFile, fileMenu,
    btnShare, btnImport, btnExportJson, importFileInput, btnHelp,
    btnSelect, btnRect, btnPoly, btnPan, btnDoor, btnWindow, btnStamp, palette,
    btnTheme,
    measureFlyout,
    btnStairs,
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

/** Announcement priority for the flash live region (pkg 155). */
export type FlashLevel = 'polite' | 'assertive';

/** Show an ephemeral inline message (auto-clears after ms). */
export function flashMessage(
  refs: EditorDomRefs,
  text: string,
  ttlMs = 3200,
  level: FlashLevel = 'polite',
): void {
  // Pkg 155 (issue #155): set the level BEFORE the text so the message
  // is announced at the right priority (role follows: alert == assertive,
  // status == polite). Container-level, so no per-message DOM forks.
  refs.msg.setAttribute('role', level === 'assertive' ? 'alert' : 'status');
  refs.msg.setAttribute('aria-live', level);
  refs.msg.textContent = text;
  refs.msg.hidden = false;
  window.setTimeout(() => {
    if (refs.msg.textContent === text) refs.msg.hidden = true;
  }, ttlMs);
}

export function hideMessage(refs: EditorDomRefs): void {
  refs.msg.hidden = true;
}
