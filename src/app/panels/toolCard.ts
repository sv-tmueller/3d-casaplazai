/**
 * Tool card (issue #178, design §6.2): the floating left card with the
 * Build, View and Measure tabs. Every control is a registry command
 * (controls.ts). The card remembers its tab (AppState.tab, persisted);
 * in the Walk view it collapses to its tab strip and reopens on hover
 * or focus (CSS, keyed off the workspace's data-view).
 */
import { el, icon } from '../../ui/el';
import { Tabs } from '../../ui/tabs';
import { FURNITURE_DEFAULTS } from '../../editor/model/constants';
import { measurementLabelText, type Measurement } from '../../editor/model/measure';
import type { EditorEngine } from '../../editor/engine';
import { formatNorth, hoursToClock, wallsAlphaFromSlider } from '../../shared/format';
import type { AppState, ToolTab } from '../state';
import { Binder, commandButton, commandSegment, commandSlider, commandToggle } from './controls';

export interface ToolCard {
  readonly root: HTMLElement;
  sync(): void;
  /** Expand + reveal the Snapping section; focus it unless told not to. */
  revealSnapping(focus: boolean): void;
  renderMeasurements(items: readonly Measurement[]): void;
}

const TOOL_GRID = [
  'tool.select',
  'tool.pan',
  'tool.rectangle',
  'tool.polygon',
  'tool.door',
  'tool.window',
  'tool.stairs',
  'tool.stamp',
];

function section(title: string, testid: string, ...children: Node[]): HTMLElement {
  return el(
    'section',
    { class: 'ws-section', testid, attrs: { 'aria-label': title } },
    el('h3', { class: 'ws-section-title', text: title }),
    ...children,
  );
}

export function mountToolCard(b: Binder, app: AppState, engine: EditorEngine): ToolCard {
  const reg = b.registry;

  /* ------------------------------ Build ------------------------------ */
  const grid = el(
    'div',
    { class: 'ws-tool-grid', attrs: { role: 'group', 'aria-label': 'Tools' } },
    ...TOOL_GRID.map((id) => commandButton(b, id, { class: 'ws-tool' })),
  );

  const chips = Object.entries(FURNITURE_DEFAULTS).map(([type, def]) =>
    commandButton(b, 'furniture.arm', {
      arg: type,
      text: def.label,
      icon: 'furnish',
      size: 'sm',
      class: 'ws-chip',
      testid: `ws-furniture-${type}`,
      pressed: () => engine.tool() === 'stamp' && engine.armedFurniture() === type,
    }),
  );
  const furniture = section(
    'Furniture',
    'ws-furniture',
    el('div', { class: 'ws-chip-grid', attrs: { role: 'group', 'aria-label': 'Furniture pieces' } }, ...chips),
  );
  b.add(() => {
    furniture.hidden = engine.tool() !== 'stamp';
  });

  const snapCmd = reg.get('snap.open');
  const snapHeader = el(
    'button',
    {
      class: 'ws-disclosure',
      attrs: { type: 'button', 'aria-controls': 'ws-snap-body', title: `${snapCmd.label} (${snapCmd.rows?.[0]?.keys})` },
      testid: 'ws-snap-toggle',
      dataset: { command: 'snap.open' },
    },
    icon('snap'),
    el('span', { class: 'ws-disclosure-label', text: snapCmd.label }),
    icon('chevron-down'),
  );
  snapHeader.addEventListener('click', () => app.set({ snapOpen: !app.get().snapOpen }));
  const pitchSeg = commandSegment(b, 'snap.pitch', {
    value: () => String(engine.snapSettings().pitch),
    options: [
      { value: '0.1', label: '0.1 m', testid: 'ws-snap-pitch-0.1' },
      { value: '0.25', label: '0.25 m', testid: 'ws-snap-pitch-0.25' },
      { value: '0.5', label: '0.5 m', testid: 'ws-snap-pitch-0.5' },
      { value: '1', label: '1 m', testid: 'ws-snap-pitch-1' },
    ],
  });
  const snapBody = el(
    'div',
    { class: 'ws-section-body', attrs: { id: 'ws-snap-body' }, testid: 'ws-snap-body' },
    el('div', { class: 'ws-field-row' }, el('span', { class: 'ws-field-label', text: 'Grid pitch' }), pitchSeg),
    commandToggle(b, 'snap.master', 'ws-snap-master'),
  );
  const snapping = el('section', { class: 'ws-section', testid: 'ws-snapping', attrs: { 'aria-label': 'Snapping' } }, snapHeader, snapBody);
  b.add(() => {
    const open = app.get().snapOpen;
    snapBody.hidden = !open;
    snapHeader.setAttribute('aria-expanded', String(open));
  });

  const build = el('div', { class: 'ws-tab-body' }, grid, furniture, snapping);

  /* ------------------------------ View ------------------------------- */
  const planSection = section(
    'Plan',
    'ws-view-plan-section',
    commandToggle(b, 'view.dimensions', 'ws-dimensions'),
    commandToggle(b, 'view.grid', 'ws-grid'),
    el(
      'div',
      { class: 'ws-button-row' },
      commandButton(b, 'view.zoomOut', { iconOnly: true, testid: 'ws-zoom-out' }),
      commandButton(b, 'view.zoomIn', { iconOnly: true, testid: 'ws-zoom-in' }),
      commandButton(b, 'view.fit', { size: 'sm', testid: 'ws-fit' }),
    ),
  );

  const underlayEmpty = el(
    'div',
    { class: 'ws-button-row' },
    commandButton(b, 'underlay.import', { size: 'sm', testid: 'ws-underlay-import' }),
  );
  const underlayLive = el(
    'div',
    { class: 'ws-section-body' },
    commandSlider(b, 'underlay.opacity', {
      min: 0,
      max: 100,
      step: 5,
      value: () => engine.underlay()?.opacity ?? 50,
      format: (v) => `${Math.round(v)}%`,
      testid: 'ws-underlay-opacity',
      commitOnChange: true,
    }),
    el(
      'div',
      { class: 'ws-button-row' },
      commandButton(b, 'underlay.rotateCcw', { iconOnly: true, testid: 'ws-underlay-ccw' }),
      commandButton(b, 'underlay.rotateCw', { iconOnly: true, testid: 'ws-underlay-cw' }),
      commandButton(b, 'underlay.remove', { iconOnly: true, testid: 'ws-underlay-remove' }),
    ),
    commandToggle(b, 'underlay.lock', 'ws-underlay-lock'),
    commandToggle(b, 'underlay.hide', 'ws-underlay-hide'),
  );
  const underlaySection = section('Underlay', 'ws-underlay', underlayEmpty, underlayLive);
  b.add(() => {
    const has = engine.underlay() !== null;
    underlayEmpty.hidden = has;
    underlayLive.hidden = !has;
  });

  const threeD = section(
    '3D',
    'ws-view-3d-section',
    commandToggle(b, 'viewer.roofs', 'ws-roofs'),
    el(
      'div',
      { class: 'ws-field-row' },
      el('span', { class: 'ws-field-label', text: reg.get('viewer.ceilings').label }),
      commandSegment(b, 'viewer.ceilings', {
        value: () => app.get().viewer.ceilings,
        testid: 'ws-ceilings',
        options: [
          { value: 'auto', label: 'Auto', testid: 'ws-ceilings-auto' },
          { value: 'on', label: 'On', testid: 'ws-ceilings-on' },
          { value: 'off', label: 'Off', testid: 'ws-ceilings-off' },
        ],
      }),
    ),
    commandSlider(b, 'viewer.wallsAlpha', {
      min: 0,
      max: 100,
      step: 1,
      value: () => Math.round(app.get().viewer.wallsAlpha * 100),
      toArg: wallsAlphaFromSlider,
      format: (v) => `${Math.round(v)}%`,
      testid: 'ws-walls-alpha',
      chipTestid: 'ws-walls-alpha-chip',
    }),
    el(
      'div',
      { class: 'ws-field-row' },
      el('span', { class: 'ws-field-label', text: reg.get('viewer.quality').label }),
      commandSegment(b, 'viewer.quality', {
        value: () => app.get().viewer.quality,
        testid: 'ws-quality',
        options: [
          { value: 'low', label: 'Low', testid: 'ws-quality-low' },
          { value: 'high', label: 'High', testid: 'ws-quality-high' },
        ],
      }),
    ),
  );

  const compass = el(
    'span',
    { class: 'ws-compass', attrs: { 'aria-hidden': 'true' }, testid: 'ws-compass' },
    el('span', { class: 'ws-compass-n', text: 'N' }),
  );
  const sun = section(
    'Sun',
    'ws-sun',
    commandSlider(b, 'sun.time', {
      min: 0,
      max: 24,
      step: 0.5,
      value: () => app.get().viewer.sun.timeHours,
      format: hoursToClock,
      ticks: [
        { value: 6, label: '6:00' },
        { value: 12, label: '12:00' },
        { value: 18, label: '18:00' },
      ],
      testid: 'ws-sun-time',
      chipTestid: 'ws-sun-time-chip',
    }),
    el(
      'div',
      { class: 'ws-north-row' },
      commandSlider(b, 'sun.north', {
        min: -180,
        max: 180,
        step: 5,
        value: () => app.get().viewer.sun.northOffsetDeg,
        format: formatNorth,
        testid: 'ws-sun-north',
        chipTestid: 'ws-sun-north-chip',
      }),
      compass,
    ),
  );
  b.add(() => {
    compass.style.transform = `rotate(${-app.get().viewer.sun.northOffsetDeg}deg)`;
  });

  const walk = section(
    'Walk',
    'ws-walk-section',
    commandButton(b, 'camera.place', { size: 'sm', testid: 'ws-place-camera' }),
  );

  const viewTab = el('div', { class: 'ws-tab-body' }, planSection, underlaySection, threeD, sun, walk);

  /* ----------------------------- Measure ----------------------------- */
  const list = el('ul', { class: 'ws-measure-list', testid: 'ws-measure-list', attrs: { 'aria-label': 'Measurements' } });
  const emptyNote = el('p', { class: 'ws-note', text: 'No measurements on this floor yet. Arm Measure and click two points.' });
  const measureTab = el(
    'div',
    { class: 'ws-tab-body' },
    el(
      'div',
      { class: 'ws-button-row' },
      commandButton(b, 'tool.measure', { class: 'ws-tool' }),
      commandButton(b, 'measure.clear', { size: 'sm', variant: 'ghost', testid: 'ws-measure-clear' }),
    ),
    section('On this floor', 'ws-measurements', emptyNote, list),
  );

  const renderMeasurements = (items: readonly Measurement[]): void => {
    list.replaceChildren(
      ...items.map((m) =>
        el(
          'li',
          { class: 'ws-measure-row', testid: 'ws-measure-row' },
          el(
            'button',
            {
              class: 'ws-measure-show',
              attrs: { type: 'button', title: 'Show on the plan' },
              on: { click: () => engine.revealMeasurement(m.id) },
            },
            el('span', { class: 'ui-num', text: measurementLabelText(m) }),
          ),
          el(
            'button',
            {
              class: 'ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm',
              attrs: { type: 'button', 'aria-label': `Remove measurement ${measurementLabelText(m)}` },
              on: { click: () => engine.removeMeasurement(m.id) },
            },
            icon('close'),
          ),
        ),
      ),
    );
    emptyNote.hidden = items.length > 0;
  };
  renderMeasurements(engine.measurements());

  /* ------------------------------ card ------------------------------- */
  const tabs = Tabs<ToolTab>({
    label: 'Tools',
    selected: app.get().tab,
    onSelect: (id) => app.set({ tab: id }),
    tabs: [
      { id: 'build', label: 'Build', panel: build, testid: 'ws-tab-build' },
      { id: 'view', label: 'View', panel: viewTab, testid: 'ws-tab-view' },
      { id: 'measure', label: 'Measure', panel: measureTab, testid: 'ws-tab-measure' },
    ],
  });

  const root = el(
    'section',
    { class: 'ws-toolcard ui-card', testid: 'ws-toolcard', attrs: { 'aria-label': 'Tool card' } },
    tabs.root,
  );

  return {
    root,
    sync(): void {
      if (tabs.selected() !== app.get().tab) tabs.select(app.get().tab);
    },
    revealSnapping(focus: boolean): void {
      app.set({ tab: 'build', snapOpen: true });
      if (tabs.selected() !== 'build') tabs.select('build');
      b.sync();
      snapping.scrollIntoView?.({ block: 'nearest' });
      if (focus) pitchSeg.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    },
    renderMeasurements,
  };
}
