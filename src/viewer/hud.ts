/**
 * HUD (issue #6, redesigned in #146): the viewer's DOM overlay kit — a
 * docked, collapsible control panel (Mode segment, Visibility/Sun/Floor
 * groups) over the 3D stage, plus the mode-transition fade curtain, the
 * toast stack (typed failures like SpawnFailureError surface HERE, never
 * as crashes), the bottom-center hint strip and the ?perf=1
 * rolling-percentile FPS/frame-time overlay fed by FrameStats samples.
 *
 * Pure DOM construction + imperative updates; single-owner wiring for
 * every control (onBind* attaches, reflect* publishes state back); no
 * framework, no three.js dependencies, so the whole thing unit-tests
 * under happy-dom.
 */

import type { FrameStats, SunSettings, ViewMode } from './types';
import { prefersReducedMotion } from '../shared/reducedMotion';

/** Toast lifetime before dismissal, ms. */
export const TOAST_TTL_MS = 4200;

/** Fade curtain duration for mode transitions, ms. */
export const FADE_DURATION_MS = 320;

/** Sample window feeding the perf overlay's percentiles. */
export const PERF_WINDOW_SAMPLES = 240;

/** Percentile anchor displayed beside the median (worst 5%). */
const PERCENTILE_HIGH = 95;

/** Root class hook for every HUD-managed subtree. */
const HUD_ROOT_CLASS = 'viewer-hud-root';

/**
 * Persisted HUD preferences (#146), keyed per browser. Versioned so a
 * future shape change can migrate (or ignore) older slots.
 */
export const HUD_STATE_STORAGE_KEY = 'casaplaza.viewer.hud.v1';

/** Placeholder for the floor readout before a plan is loaded. */
const FLOOR_READOUT_EMPTY = '—';

/** Monotonic suffix so generated ids never alias across HUD instances. */
let uidSeq = 0;

/** Everything the HUD owns, constructed lazily on mount. */
export interface HudHandles {
  root: HTMLDivElement;
  /** Docked control panel (#146); owns every control except the hint. */
  panel: HTMLDivElement;
  /** Collapsible panel body (hidden while collapsed). */
  panelBody: HTMLDivElement;
  /** Chevron button toggling the body (#146). */
  collapseBtn: HTMLButtonElement;
  /**
   * Mode segment group (#146). Keeps the legacy `hud-mode-toggle`
   * testid so pre-redesign locators still resolve; the active segment
   * is marked via aria-pressed + class, reflecting the CURRENT mode.
   */
  modeGroup: HTMLDivElement;
  /** Overview segment button (testid hud-mode-segment-overview). */
  overviewBtn: HTMLButtonElement;
  /** Walk segment button (testid hud-mode-segment-walk). */
  walkBtn: HTMLButtonElement;
  /** Bottom-center hint strip element (#146); sits outside the panel. */
  hint: HTMLSpanElement;
  /** Roof visibility toggle (issue #86); reflects the live state. */
  roofBtn: HTMLButtonElement;
  /** Walls-transparency slider (issue #120); 0..100 position. */
  wallsAlpha: HTMLInputElement;
  /** Live % readout beside the walls slider. */
  wallsAlphaLabel: HTMLSpanElement;
  /** Floor readout (#146): read-only name of the story being rendered. */
  floorReadout: HTMLSpanElement;
  fade: HTMLDivElement;
  toasts: HTMLDivElement;
  perfPanel: HTMLPreElement | null;
  /** Centered walk-entry prompt (issue #30); hidden unless unlocked-walk. */
  walkOverlay: HTMLDivElement;
  /** Subtle center reticle shown while pointer-locked in walk mode. */
  walkReticle: HTMLDivElement;
  /** Centered empty-plan prompt (issue #148); hidden unless room-less. */
  emptyState: HTMLDivElement;
  /** Time-of-day slider (issue #121): hours 0…24, keyboard-native. */
  sunTimeInput: HTMLInputElement;
  /** Clock readout beside the time slider (#146), e.g. "14:30". */
  sunTimeLabel: HTMLSpanElement;
  /** North-offset slider (issue #121): whole-path rotation, ±180°. */
  sunNorthInput: HTMLInputElement;
  /** Degrees readout beside the north slider (#146), e.g. "30°". */
  sunNorthLabel: HTMLSpanElement;
  /** Compass rose (issue #121): the static div rotated by −offset. */
  compass: HTMLDivElement;
  /** Storage seam resolved at build time (null when unavailable). */
  storage: Storage | null;
  /**
   * Walker room readout (issue #147 CP3): the room name the walker
   * stands in on its attributed storey, or "Outside". Hidden whenever
   * walk mode is not live (no walker ⇒ no room claim).
   */
  roomReadout: HTMLSpanElement;
  /**
   * "Go to room…" picker (issue #147 CP3): one optgroup per storey,
   * one option per room; choosing one teleports the walker. Disabled
   * until a plan with rooms arrives.
   */
  gotoRoomSelect: HTMLSelectElement;
}

/** Callback invoked when the user toggles Walk/Overview. */
export type ToggleListener = (next: ViewMode) => void;

/** Callback invoked when the user toggles roof visibility (issue #86). */
export type RoofToggleListener = (visible: boolean) => void;

/** Callback invoked with the NORMALIZED (0..1) wallsAlpha (#120). */
export type WallsAlphaListener = (alpha: number) => void;

/** Callback invoked when the user slides the time of day (hours 0…24). */
export type SunTimeListener = (timeHours: number) => void;

/** Callback invoked when the user rotates the sun path (degrees ±180). */
export type SunNorthListener = (northOffsetDeg: number) => void;

/** Callback invoked with the NEXT collapse state (#146). */
export type CollapseListener = (collapsed: boolean) => void;

/** Persisted HUD state shape (#146). */
export interface HudPersistedState {
  collapsed: boolean;
}

/** Fresh defaults: the panel is expanded until the user says otherwise. */
function defaultHudState(): HudPersistedState {
  return { collapsed: false };
}

/** Generate an element id unique within this document. */
function nextDomId(prefix: string): string {
  uidSeq += 1;
  return `${prefix}-${uidSeq}`;
}

/**
 * Localstorage accessor following the editor/model/settings.ts
 * precedent (#146): storage can THROW in privacy mode or sandboxed
 * frames, so resolution is best-effort and may legitimately be null.
 */
export function safeHudStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Access denied (privacy mode): run without persistence.
    return null;
  }
}

/**
 * Read the persisted HUD state. Hostile slots — unreadable storage,
 * corrupt JSON, wrong shapes — fail OPEN to expanded and drop the junk
 * rather than trapping the panel closed.
 */
export function loadHudState(storage: Storage | null): HudPersistedState {
  if (!storage) return defaultHudState();
  let raw: string | null;
  try {
    raw = storage.getItem(HUD_STATE_STORAGE_KEY);
  } catch {
    // Unreadable slot: default, and don't try to clean it up.
    return defaultHudState();
  }
  if (raw === null) return defaultHudState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    dropHudState(storage);
    return defaultHudState();
  }
  if (typeof parsed !== 'object' || parsed === null) {
    dropHudState(storage);
    return defaultHudState();
  }
  const collapsed = (parsed as Record<string, unknown>).collapsed;
  if (typeof collapsed !== 'boolean') {
    dropHudState(storage);
    return defaultHudState();
  }
  return { collapsed };
}

/** Persist the HUD state; every failure mode is a silent no-op. */
export function saveHudState(
  storage: Storage | null,
  state: HudPersistedState,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      HUD_STATE_STORAGE_KEY,
      JSON.stringify({ collapsed: state.collapsed }),
    );
  } catch {
    // Quota exceeded / storage disabled: persistence is best-effort.
  }
}

/** Remove a corrupt slot (best-effort). */
function dropHudState(storage: Storage): void {
  try {
    storage.removeItem(HUD_STATE_STORAGE_KEY);
  } catch {
    // Nothing else to do — reads already failed open.
  }
}

/** Small helper: an element with a class and optional testid. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  testid?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (testid !== undefined) node.dataset.testid = testid;
  return node;
}

/** Section heading inside the panel body. */
function groupTitle(text: string): HTMLDivElement {
  const title = el('div', 'hud-group-title');
  title.textContent = text;
  return title;
}

/** Visible <label for=…> paired with a generated control id. */
function fieldLabel(forId: string, text: string): HTMLLabelElement {
  const label = el('label', 'hud-field-label');
  label.htmlFor = forId;
  label.textContent = text;
  return label;
}

/**
 * Construct the HUD overlay inside the given viewer pane. The optional
 * storage seam (#146) defaults to window.localStorage so units can
 * inject a fake; resolution may yield null on sandboxed browsers.
 */
export function buildHud(
  hostPane: HTMLElement,
  storage: Storage | null = safeHudStorage(),
): HudHandles {
  const root = document.createElement('div');
  root.className = HUD_ROOT_CLASS;

  const collapsed = loadHudState(storage).collapsed;

  // ---- Docked control panel (#146) --------------------------------
  const panel = el('div', 'hud-panel', 'hud-panel');

  const header = el('div', 'hud-panel-header');
  const title = el('span', 'hud-panel-title');
  title.textContent = 'View';

  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'hud-collapse-toggle';
  collapseBtn.dataset.testid = 'hud-collapse-toggle';
  const chevron = el('span', 'hud-chevron');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';
  collapseBtn.appendChild(chevron);
  header.append(title, collapseBtn);

  // Mode segment (#146): always visible — even collapsed — so the two
  // top-level modes stay one keystroke away. Buttons are native; the
  // active segment carries aria-pressed + a class reflecting the
  // CURRENT mode (reflectMode publishes it).
  const modeGroup = el('div', 'hud-segment', 'hud-mode-toggle');
  modeGroup.setAttribute('role', 'group');
  modeGroup.setAttribute('aria-label', 'View mode');

  const overviewBtn = document.createElement('button');
  overviewBtn.type = 'button';
  overviewBtn.className = 'hud-segment-btn';
  overviewBtn.dataset.testid = 'hud-mode-segment-overview';
  overviewBtn.textContent = 'Overview';

  const walkBtn = document.createElement('button');
  walkBtn.type = 'button';
  walkBtn.className = 'hud-segment-btn';
  walkBtn.dataset.testid = 'hud-mode-segment-walk';
  walkBtn.textContent = 'Walk';

  modeGroup.append(overviewBtn, walkBtn);

  // Collapsible body: the controls below the fold. The Mode segment
  // deliberately stays OUTSIDE it (always-on control).
  const panelBody = el('div', 'hud-panel-body', 'hud-panel-body');
  panelBody.id = nextDomId('hud-panel-body');
  collapseBtn.setAttribute('aria-controls', panelBody.id);

  // ---- Visibility group -------------------------------------------
  const visGroup = el('div', 'hud-group');

  // Roof visibility toggle (issue #86): keyboard-focusable like its
  // siblings (plain buttons tab naturally — the mouseless mandate), and
  // aria-pressed mirrors the live state for screen readers.
  const roofBtn = document.createElement('button');
  roofBtn.type = 'button';
  roofBtn.className = 'hud-toggle';
  roofBtn.dataset.testid = 'hud-roof-toggle';
  roofBtn.textContent = 'Hide roofs';
  roofBtn.setAttribute('aria-label', 'Toggle roof visibility');
  roofBtn.setAttribute('aria-pressed', 'false');

  // Walls-transparency slider (issue #120): a NATIVE range input — the
  // arrow keys operate it for free (mouseless mandate; no custom key
  // handling). Position is the 0..100 percent; STATE is normalized 0..1
  // (SH3D wallsAlpha convention) and lives in the controller.
  const wallsField = el('div', 'hud-field');
  const wallsAlpha = document.createElement('input');
  wallsAlpha.type = 'range';
  wallsAlpha.min = '0';
  wallsAlpha.max = '100';
  wallsAlpha.step = '1';
  wallsAlpha.value = '0';
  wallsAlpha.className = 'hud-slider';
  wallsAlpha.id = nextDomId('hud-walls-alpha');
  wallsAlpha.dataset.testid = 'hud-walls-alpha';
  wallsAlpha.setAttribute('aria-label', 'Wall transparency');

  const wallsAlphaLabel = el('span', 'hud-slider-value');
  wallsAlphaLabel.dataset.testid = 'hud-walls-alpha-label';
  wallsAlphaLabel.textContent = '0%';

  wallsField.append(
    fieldLabel(wallsAlpha.id, 'Walls transparency'),
    wallsAlpha,
    wallsAlphaLabel,
  );
  visGroup.append(groupTitle('Visibility'), roofBtn, wallsField);

  // ---- Sun group (issue #121, grouped in #146) ---------------------
  // Range inputs are keyboard-native (arrow keys) per the mouseless
  // mandate; the compass rose is the 2D read of the north offset. The
  // cluster keeps its legacy testid for pre-redesign locators.
  const sunGroup = el('div', 'hud-group', 'hud-sun-cluster');
  const sunGroupTitle = groupTitle('Sun');
  sunGroupTitle.dataset.testid = 'hud-sun-cluster-title';

  const timeField = el('div', 'hud-field');
  const sunTimeInput = document.createElement('input');
  sunTimeInput.type = 'range';
  sunTimeInput.className = 'hud-sun-time';
  sunTimeInput.dataset.testid = 'hud-sun-time';
  sunTimeInput.min = '0';
  sunTimeInput.max = '24';
  sunTimeInput.step = '0.5';
  sunTimeInput.value = '12';
  sunTimeInput.id = nextDomId('hud-sun-time');
  sunTimeInput.setAttribute('aria-label', 'Time of day (hours)');

  const sunTimeLabel = el('span', 'hud-field-value');
  sunTimeLabel.dataset.testid = 'hud-sun-time-label';
  sunTimeLabel.textContent = hoursToClock(12);

  timeField.append(
    fieldLabel(sunTimeInput.id, 'Time of day'),
    sunTimeInput,
    sunTimeLabel,
  );

  const northField = el('div', 'hud-field');
  const sunNorthInput = document.createElement('input');
  sunNorthInput.type = 'range';
  sunNorthInput.className = 'hud-sun-north';
  sunNorthInput.dataset.testid = 'hud-sun-north';
  sunNorthInput.min = '-180';
  sunNorthInput.max = '180';
  sunNorthInput.step = '5';
  sunNorthInput.value = '0';
  sunNorthInput.id = nextDomId('hud-sun-north');
  sunNorthInput.setAttribute('aria-label', 'North offset (degrees)');

  const sunNorthLabel = el('span', 'hud-field-value');
  sunNorthLabel.dataset.testid = 'hud-sun-north-label';
  sunNorthLabel.textContent = formatNorth(0);

  // Decorative: the offset value reaches screen readers through the
  // slider above; the rose just rotates to match.
  const compass = el('div', 'hud-compass', 'hud-compass');
  compass.setAttribute('aria-hidden', 'true');

  northField.append(
    fieldLabel(sunNorthInput.id, 'North offset'),
    sunNorthInput,
    sunNorthLabel,
    compass,
  );
  sunGroup.append(sunGroupTitle, timeField, northField);

  // ---- Floor readout (#146) ---------------------------------------
  // Read-only: the viewer pins the lowest storey (adapter decision), so
  // this mirrors the floor ACTUALLY being rendered — never a control.
  const floorGroup = el('div', 'hud-group');
  const floorField = el('div', 'hud-field');
  const floorFieldLabel = el('span', 'hud-field-label');
  floorFieldLabel.textContent = 'Floor';
  const floorReadout = el('span', 'hud-field-value', 'hud-floor-readout');
  floorReadout.textContent = FLOOR_READOUT_EMPTY;
  floorField.append(floorFieldLabel, floorReadout);
  floorGroup.append(groupTitle('Floor'), floorField);

  // Walk navigation aids (issue #147 CP3), appended AFTER the sun
  // cluster (append-only discipline — the sibling #120/#121 DOM order
  // is untouched): the live room readout sits beside a "Go to room…"
  // select. The select is a NATIVE control (arrow keys operate it for
  // free, mouseless mandate); its options are rebuilt whenever the
  // accepted plan changes (populateRoomPicker), never by hand here.
  // #146 integration: mounted inside the docked panel's body (the old
  // `bar` is retired) as its own group.
  const navCluster = document.createElement('div');
  navCluster.className = 'hud-walk-nav';
  navCluster.dataset.testid = 'hud-walk-nav';

  const roomReadout = document.createElement('span');
  roomReadout.className = 'hud-room-readout';
  roomReadout.dataset.testid = 'hud-room-readout';
  roomReadout.textContent = '';
  roomReadout.hidden = true; // no walker yet ⇒ no room claim

  const gotoRoomSelect = document.createElement('select');
  gotoRoomSelect.className = 'hud-goto-room';
  gotoRoomSelect.dataset.testid = 'hud-goto-room';
  gotoRoomSelect.setAttribute('aria-label', 'Go to room');
  gotoRoomSelect.disabled = true; // enabled once a plan with rooms arrives
  const gotoPlaceholder = document.createElement('option');
  gotoPlaceholder.value = '';
  gotoPlaceholder.textContent = 'Go to room…';
  gotoRoomSelect.appendChild(gotoPlaceholder);

  navCluster.append(roomReadout, gotoRoomSelect);

  panelBody.append(visGroup, sunGroup, floorGroup, navCluster);
  panel.append(header, modeGroup, panelBody);

  // ---- Bottom-center hint strip (#146) ----------------------------
  // Moved out of the control panel: the walking hints belong to the
  // stage, not to the dock. Strip and toasts share one bottom-anchored
  // column (see .hud-bottom) so the two can never collide.
  const strip = el('div', 'hud-strip');
  const hint = el('span', 'hud-hint', 'hud-hint');
  hint.textContent = '';
  strip.appendChild(hint);

  const fade = el('div', 'hud-fade', 'hud-fade');
  const toasts = el('div', 'hud-toasts', 'hud-toasts');
  // Pkg 155 (issue #155): the stack is a polite live region; error
  // toasts override it per message with role="alert" (see toast()).
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');

  // #146 fix round: ONE bottom-anchored column for the transient toast
  // stack and the persistent hint strip. The strip pins to the bottom
  // edge and the toasts grow UPWARD above it, so no stack height can
  // reach the hint — a fixed offset cannot do this (the toast count is
  // unbounded: a plan that keeps failing re-toasts on every recompile
  // poll, measured up to 14 stacked). The strip is LAST in the DOM, so
  // it also paints above the toasts instead of being obscured by them.
  const bottom = el('div', 'hud-bottom', 'hud-bottom');
  bottom.append(toasts, strip);

  root.append(panel, fade, bottom);

  // Walk-entry affordances (issue #30): a prominent click prompt and a
  // subtle reticle, both hidden by default; setWalkAffordances toggles.
  const walkOverlay = el('div', 'hud-walk-overlay', 'walk-entry-overlay');
  walkOverlay.textContent = 'Click to walk';
  walkOverlay.hidden = true;

  const walkReticle = el('div', 'hud-reticle', 'walk-reticle');
  walkReticle.hidden = true;

  root.append(walkOverlay, walkReticle);

  // Empty-plan prompt (issue #148): while the plan has no rooms the
  // viewer stands the scene down to a sky/ground backdrop and shows
  // this centered line instead of toasting a validator failure.
  const emptyState = document.createElement('div');
  emptyState.className = 'hud-empty-state';
  emptyState.dataset.testid = 'hud-empty-state';
  emptyState.textContent = 'Draw a room in the plan to see it here';
  emptyState.hidden = true;
  root.append(emptyState);

  hostPane.appendChild(root);

  const handles: HudHandles = {
    root,
    panel,
    panelBody,
    collapseBtn,
    modeGroup,
    overviewBtn,
    walkBtn,
    hint,
    roofBtn,
    wallsAlpha,
    wallsAlphaLabel,
    floorReadout,
    fade,
    toasts,
    perfPanel: null,
    walkOverlay,
    walkReticle,
    emptyState,
    sunTimeInput,
    sunTimeLabel,
    sunNorthInput,
    sunNorthLabel,
    compass,
    storage,
    roomReadout,
    gotoRoomSelect,
  };

  // Apply the persisted preference (a reload boots into place; no flash
  // of the wrong state, since the class is set before first paint).
  reflectCollapsed(handles, collapsed);

  return handles;
}

/**
 * Toggle the walk-entry affordances (issue #30): the centered overlay is
 * up while walk mode is seated but unlocked; the reticle appears once
 * pointer lock is held. One setter — no new callback machinery.
 */
export function setWalkAffordances(
  handles: HudHandles,
  state: { overlay: boolean; reticle: boolean },
): void {
  handles.walkOverlay.hidden = !state.overlay;
  handles.walkReticle.hidden = !state.reticle;
}

/**
 * Reveal/hide the empty-plan prompt (issue #148). */
export function setEmptyState(handles: HudHandles, visible: boolean): void {
  handles.emptyState.hidden = !visible;
}

/**
 * Park the Walk toggle while the plan has no rooms to walk in (issue
 * #148): the real `disabled` attribute stops the click, aria-disabled
 * announces why to assistive tech, and the class carries the styling.
 */
export function setWalkDisabled(handles: HudHandles, disabled: boolean): void {
  // #146 replaced the single Walk toggle with the Overview/Walk segment;
  // the Walk SEGMENT button is what gets parked when there is nothing to
  // walk in (issue #148).
  handles.walkBtn.disabled = disabled;
  handles.walkBtn.setAttribute('aria-disabled', String(disabled));
  handles.walkBtn.classList.toggle('hud-toggle-disabled', disabled);
}

/**
 * Reflect the CURRENT mode on the segment (#146): the active button is
 * marked with aria-pressed + a class instead of the old button labeling
 * the opposite mode.
 */
export function reflectMode(handles: HudHandles, mode: ViewMode): void {
  markSegment(handles.overviewBtn, mode === 'overview');
  markSegment(handles.walkBtn, mode === 'walk');
}

/** Publish one segment's active state (aria + class). */
function markSegment(btn: HTMLButtonElement, active: boolean): void {
  btn.setAttribute('aria-pressed', String(active));
  btn.classList.toggle('hud-segment-active', active);
}

/**
 * Attach the mode-segment handlers (#146, single-owner wiring). Each
 * click requests the mode of the CLICKED segment — not a blind flip —
 * so double clicks stay idempotent.
 */
export function onBindModeSegment(
  handles: HudHandles,
  listener: ToggleListener,
): () => void {
  const onOverview = (): void => listener('overview');
  const onWalk = (): void => listener('walk');
  handles.overviewBtn.addEventListener('click', onOverview);
  handles.walkBtn.addEventListener('click', onWalk);
  return () => {
    handles.overviewBtn.removeEventListener('click', onOverview);
    handles.walkBtn.removeEventListener('click', onWalk);
  };
}

/** Show the contextual affordance hint ('Click to walk', etc.). */
export function showHint(handles: HudHandles, text: string): void {
  handles.hint.textContent = text;
}

/**
 * Reflect the collapse state (#146): hide the body, flip aria-expanded,
 * and toggle the class that rotates the chevron. The panel stays
 * mounted — the Mode segment remains reachable.
 */
export function reflectCollapsed(
  handles: HudHandles,
  collapsed: boolean,
): void {
  handles.panelBody.hidden = collapsed;
  handles.collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  handles.collapseBtn.setAttribute(
    'aria-label',
    collapsed ? 'Expand controls' : 'Collapse controls',
  );
  handles.panel.classList.toggle('hud-panel-collapsed', collapsed);
}

/** Read the live collapse state off the DOM (single source of truth). */
export function isHudCollapsed(handles: HudHandles): boolean {
  return isHidden(handles.panelBody);
}

/**
 * Normalize the DOM `hidden` property (boolean, or the `until-found`
 * string in newer lib.dom typings) into a plain boolean.
 */
function isHidden(node: HTMLElement): boolean {
  return node.hidden !== false;
}

/** Attach the collapse-toggle handler (#146, single-owner wiring). */
export function onBindCollapse(
  handles: HudHandles,
  listener: CollapseListener,
): () => void {
  const onClick = (): void => {
    listener(!isHudCollapsed(handles));
  };
  handles.collapseBtn.addEventListener('click', onClick);
  return () => handles.collapseBtn.removeEventListener('click', onClick);
}

/**
 * Format slider hours (0…24, 0.5 step) as a wall clock readout
 * ("14:30"). Hostile values clamp instead of rendering garbage: the
 * readout never shows NaN, and 24:00 is the ceiling.
 */
export function hoursToClock(hours: number): string {
  if (!Number.isFinite(hours)) return '00:00';
  const minutes = Math.min(24 * 60, Math.max(0, Math.round(hours * 60)));
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Format a north offset as integer degrees ('30°', '-45°'). */
export function formatNorth(northOffsetDeg: number): string {
  if (!Number.isFinite(northOffsetDeg)) return '0°';
  return `${Math.round(northOffsetDeg)}°`;
}

/** Publish the name of the floor the viewer is rendering (#146). */
export function reflectFloorName(handles: HudHandles, name: string): void {
  const trimmed = name.trim();
  handles.floorReadout.textContent =
    trimmed === '' ? FLOOR_READOUT_EMPTY : trimmed;
}

/**
 * Attach the roof-visibility click handler (issue #86). The button is a
 * momentary toggle: each click flips the state the listener receives.
 */
export function onBindRoofToggle(
  handles: HudHandles,
  isVisible: () => boolean,
  listener: RoofToggleListener,
): () => void {
  const onClick = (): void => {
    listener(!isVisible());
  };
  handles.roofBtn.addEventListener('click', onClick);
  return () => handles.roofBtn.removeEventListener('click', onClick);
}

/**
 * Reflect the roof-visibility state on the HUD button (issue #86):
 * label announces the ACTION, aria-pressed announces the STATE.
 */
export function reflectRoofVisibility(
  handles: HudHandles,
  visible: boolean,
): void {
  handles.roofBtn.textContent = visible ? 'Hide roofs' : 'Show roofs';
  handles.roofBtn.setAttribute('aria-pressed', String(visible));
}

/**
 * Normalize a slider position (0..100) into SH3D's wallsAlpha (0..1).
 * The slider is the UI; the controller stores the normalized value —
 * ONE mapping, pinned by the unit spec. Hostile values clamp.
 */
export function wallsAlphaFromSlider(sliderValue: number): number {
  if (!Number.isFinite(sliderValue)) return 0;
  return Math.min(1, Math.max(0, sliderValue / 100));
}

/**
 * Attach the walls-transparency slider input handler (issue #120,
 * single-owner wiring). Fires with the NORMALIZED 0..1 alpha.
 */
export function onBindWallsAlpha(
  handles: HudHandles,
  listener: WallsAlphaListener,
): () => void {
  const onInput = (): void => {
    listener(wallsAlphaFromSlider(Number(handles.wallsAlpha.value)));
  };
  handles.wallsAlpha.addEventListener('input', onInput);
  return () => handles.wallsAlpha.removeEventListener('input', onInput);
}

/**
 * Reflect the (normalized) wallsAlpha state onto the slider position and
 * % readout — the init/reset sync point (a plan rebuild resets alpha).
 */
export function reflectWallsAlpha(handles: HudHandles, alpha: number): void {
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
  const percent = Math.round(a * 100);
  handles.wallsAlpha.value = String(percent);
  handles.wallsAlphaLabel.textContent = `${percent}%`;
}

/**
 * Attach the time-of-day slider handler (issue #121). Each `input`
 * event carries the hour value; the controller owns normalisation.
 */
export function onBindSunTime(
  handles: HudHandles,
  listener: SunTimeListener,
): () => void {
  const onInput = (): void => {
    listener(Number(handles.sunTimeInput.value));
  };
  handles.sunTimeInput.addEventListener('input', onInput);
  return () => handles.sunTimeInput.removeEventListener('input', onInput);
}

/** Attach the north-offset slider handler (issue #121). */
export function onBindSunNorth(
  handles: HudHandles,
  listener: SunNorthListener,
): () => void {
  const onInput = (): void => {
    listener(Number(handles.sunNorthInput.value));
  };
  handles.sunNorthInput.addEventListener('input', onInput);
  return () => handles.sunNorthInput.removeEventListener('input', onInput);
}

/**
 * Reflect a set of sun settings on the HUD (issue #121, readouts added
 * in #146): slider values, the clock/degree readouts and the compass
 * rose rotated by −northOffsetDeg (a CSS transform on the static div —
 * the only moving part).
 */
export function reflectSunSettings(
  handles: HudHandles,
  settings: SunSettings,
): void {
  handles.sunTimeInput.value = String(settings.timeHours);
  handles.sunTimeLabel.textContent = hoursToClock(settings.timeHours);
  handles.sunNorthInput.value = String(settings.northOffsetDeg);
  handles.sunNorthLabel.textContent = formatNorth(settings.northOffsetDeg);
  handles.compass.style.transform = `rotate(${-settings.northOffsetDeg}deg)`;
}

/**
 * Fire the mode-transition fade: brief white veil dipping in and out so
 * the camera jump between overview/walk reads as intentional.
 */
export function playFade(handles: HudHandles): Promise<void> {
  // Pkg 155 (issue #155): reduced motion means no veil flicker — resolve
  // synchronously so swapModes (appController.ts) proceeds immediately.
  if (prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    handles.fade.classList.add('hud-fade-active');
    window.setTimeout(() => {
      handles.fade.classList.remove('hud-fade-active');
      resolve();
    }, FADE_DURATION_MS);
  });
}

/** Leaving-fade removal delay (ms); must match .hud-toast transition. */
const TOAST_LEAVE_MS = 350;

/** One live toast node plus its de-dupe bookkeeping (issue #148). */
interface LiveToast {
  node: HTMLDivElement;
  count: number;
  badge: HTMLSpanElement | null;
  timer: number | null;
}

/**
 * Live toasts per HUD, keyed by variant+message (issue #148): an
 * identical repeat collapses onto the node already on screen instead of
 * stacking a duplicate every poll. WeakMap — the registry dies with its
 * HUD (unit tests build many).
 */
const liveToasts = new WeakMap<HudHandles, Map<string, LiveToast>>();

/** De-dupe key: variant and message are both significant. */
function toastKey(variant: string, message: string): string {
  return `${variant}\u0000${message}`;
}

function toastRegistry(handles: HudHandles): Map<string, LiveToast> {
  let registry = liveToasts.get(handles);
  if (!registry) {
    registry = new Map();
    liveToasts.set(handles, registry);
  }
  return registry;
}

/** Render/refresh the optional ×N badge (count 1 keeps the node bare). */
function renderToastCount(live: LiveToast): void {
  if (live.count < 2) return;
  const badge = document.createElement('span');
  badge.className = 'hud-toast-count';
  badge.dataset.testid = 'hud-toast-count';
  badge.textContent = `×${live.count}`;
  if (live.badge) live.badge.replaceWith(badge);
  else live.node.appendChild(badge);
  live.badge = badge;
}

/** Arm (or re-arm) the TTL → leaving-fade → removal chain. */
function armToastDismissal(
  handles: HudHandles,
  live: LiveToast,
  key: string,
): number {
  return window.setTimeout(() => {
    live.timer = null;
    // On its way out: forget the entry so a repeat during the fade
    // starts a FRESH node instead of resurrecting a dying one.
    const registry = liveToasts.get(handles);
    if (registry?.get(key) === live) registry.delete(key);
    live.node.classList.add('hud-toast-leaving');
    window.setTimeout(() => live.node.remove(), TOAST_LEAVE_MS);
  }, TOAST_TTL_MS);
}

/**
 * Raise one toast; auto-dismisses after TTL. Errors styled distinctly.
 * An identical (variant+message) repeat is NOT a second node (issue
 * #148): it resets the dismissal timer and steps the ×N badge, so a
 * failure that recurs on every poll reads as one incident rather than a
 * toast storm.
 */
export function toast(
  handles: HudHandles,
  message: string,
  variant: 'info' | 'error' = 'info',
): void {
  const key = toastKey(variant, message);
  const registry = toastRegistry(handles);
  const live = registry.get(key);
  if (live) {
    if (live.timer !== null) window.clearTimeout(live.timer);
    live.timer = armToastDismissal(handles, live, key);
    live.count += 1;
    renderToastCount(live);
    return;
  }
  const el = document.createElement('div');
  el.className = `hud-toast hud-toast-${variant}`;
  el.dataset.testid = 'hud-toast';
  el.dataset.variant = variant;
  // Pkg 155: errors interrupt (role="alert" implies assertive); info
  // rides the stack's polite channel.
  el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  el.textContent = message;
  handles.toasts.appendChild(el);
  const entry: LiveToast = { node: el, count: 1, badge: null, timer: null };
  registry.set(key, entry);
  entry.timer = armToastDismissal(handles, entry, key);
}

/**
 * Drop every live ERROR toast immediately (issue #148): the plan became
 * valid again, so the failure it announced is stale. Info toasts carry
 * standing guidance and survive.
 */
export function dismissErrorToasts(handles: HudHandles): void {
  const registry = liveToasts.get(handles);
  if (!registry) return;
  for (const [key, live] of [...registry]) {
    if (live.node.dataset.variant !== 'error') continue;
    if (live.timer !== null) window.clearTimeout(live.timer);
    registry.delete(key);
    live.node.remove();
  }
}

/** Cap concurrent toasts (drop oldest beyond this many). */
export function trimToasts(handles: HudHandles, max = 3): void {
  while (handles.toasts.children.length > max) {
    handles.toasts.firstElementChild?.remove();
  }
}

/**
 * Perf overlay plumbing. Created only when ?perf=1 is present; the
 * controller pushes raw frame durations and this panel publishes the
 * rolling stats (median + low/high percentile bands).
 */
export class PerfOverlay {
  public readonly panel: HTMLPreElement | null;

  private readonly samplesMs: number[] = [];

  public constructor(enabled: boolean) {
    this.panel = enabled ? document.createElement('pre') : null;
    if (this.panel) {
      this.panel.className = 'hud-perf-panel';
      this.panel.dataset.testid = 'hud-perf-panel';
      this.panel.textContent = 'sampling…';
    }
  }

  /** Append this panel to the HUD root (call once after construct). */
  public mount(handles: HudHandles): void {
    if (this.panel) handles.root.appendChild(this.panel);
  }

  /** Feed one raw frame duration (ms); recomputes published stats. */
  public record(frameMs: number): FrameStats {
    this.samplesMs.push(frameMs);
    while (this.samplesMs.length > PERF_WINDOW_SAMPLES) {
      this.samplesMs.shift();
    }
    const stats = summarizeFrames([...this.samplesMs]);
    if (this.panel) {
      this.panel.textContent =
        `fps med ${stats.fpsMedian.toFixed(0)} · ` +
        `p-low ${stats.fpsPercentileLow.toFixed(0)}\n` +
        `frame ms med ${stats.frameMsMedian.toFixed(1)} · ` +
        `p-high ${stats.frameMsPercentileHigh.toFixed(1)} · ` +
        `n=${stats.framesSampled}`;
    }
    return stats;
  }

  /** Reset the sampling window (mode swaps invalidate continuity). */
  public reset(): void {
    this.samplesMs.length = 0;
  }

  /** Detach the panel (dispose chain). */
  public destroy(): void {
    this.panel?.remove();
  }
}

/** Compute median + percentile band over a copy of frame times. */
export function summarizeFrames(samplesMs: readonly number[]): FrameStats {
  const n = samplesMs.length;
  if (n === 0) {
    return {
      fpsMedian: 0,
      fpsPercentileLow: 0,
      frameMsMedian: 0,
      frameMsPercentileHigh: 0,
      framesSampled: 0,
    };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const medianIdx = Math.floor(n / 2);
  const highIdx = Math.min(n - 1, Math.ceil((PERCENTILE_HIGH / 100) * n) - 1);
  const medianMs = nth(sorted, medianIdx);
  const highMs = nth(sorted, highIdx);
  const msToFps = (ms: number): number => (ms > 0 ? 1000 / ms : 0);
  return {
    fpsMedian: msToFps(medianMs),
    fpsPercentileLow: msToFps(highMs),
    frameMsMedian: medianMs,
    frameMsPercentileHigh: highMs,
    framesSampled: n,
  };
}

/** Safe ordinal accessor (sorted ascending frame-duration samples). */
function nth(sorted: readonly number[], i: number): number {
  const v = sorted[Math.min(i, sorted.length - 1)];
  return v ?? 0;
}

/** Remove every HUD node (dispose chain leaf). */
export function destroyHud(handles: HudHandles): void {
  const registry = liveToasts.get(handles);
  if (registry) {
    for (const live of registry.values()) {
      if (live.timer !== null) window.clearTimeout(live.timer);
    }
    registry.clear();
    liveToasts.delete(handles);
  }
  handles.perfPanel?.remove();
  handles.root.remove();
}

/* ------------------- walk navigation aids (issue #147 CP3) ------------------- */

/**
 * Display the walker's room readout. `null` means "no walker" — the
 * span hides entirely (rather than showing a stale room or a dash), so
 * leaving walk mode never leaves a phantom room claim on screen. The
 * string itself ("Outside" included) is computed by walkNav's
 * roomReadoutAt; this function only puts it on the DOM.
 */
export function reflectRoomReadout(
  handles: HudHandles,
  text: string | null,
): void {
  handles.roomReadout.hidden = text === null;
  handles.roomReadout.textContent = text ?? '';
}

/** One storey's worth of picker data (structurally a Floor subset). */
export interface RoomPickerFloor {
  name: string;
  rooms: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * Rebuild the "Go to room…" picker from the ACCEPTED plan: one optgroup
 * per storey (labelled with the floor name) and one option per room.
 * Called on plan acceptance, not per frame — the option set is plan
 * content, and rebuilding a focused native select mid-interaction would
 * be hostile. A plan with no rooms leaves the control disabled (it has
 * nothing honest to offer) and the placeholder value resets so picking
 * the same room twice in a row still fires a change event.
 */
export function populateRoomPicker(
  handles: HudHandles,
  floors: ReadonlyArray<RoomPickerFloor>,
): void {
  const select = handles.gotoRoomSelect;
  select.textContent = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Go to room…';
  select.appendChild(placeholder);

  let roomCount = 0;
  for (const floor of floors) {
    const group = document.createElement('optgroup');
    group.label = floor.name;
    for (const room of floor.rooms) {
      const option = document.createElement('option');
      option.value = room.id;
      option.textContent = room.name;
      group.appendChild(option);
      roomCount += 1;
    }
    select.appendChild(group);
  }

  select.disabled = roomCount === 0;
  select.value = '';
}

/** Callback invoked with the chosen room id (issue #147 CP3). */
export type GotoRoomListener = (roomId: string) => void;

/**
 * Bind the picker's teleport handler. Returns an unsubscribe function.
 * After firing, the select resets to its placeholder: the control is a
 * button-like "go" affordance, not a persistent current-room state (the
 * readout span owns that claim) — so re-picking the same room re-fires.
 */
export function onBindGotoRoom(
  handles: HudHandles,
  listener: GotoRoomListener,
): () => void {
  const onChange = (): void => {
    const roomId = handles.gotoRoomSelect.value;
    if (roomId === '') return;
    handles.gotoRoomSelect.value = '';
    listener(roomId);
  };
  handles.gotoRoomSelect.addEventListener('change', onChange);
  return () => handles.gotoRoomSelect.removeEventListener('change', onChange);
}
