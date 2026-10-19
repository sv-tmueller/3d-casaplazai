/**
 * Inspector panel (issue #101, Pkg 12.3): a docked properties panel —
 * the Figma-style promotion of the secret-shortcut flows (wall lean,
 * opening dims) into a visible, keyboard-first surface.
 *
 * ARCHITECTURE (per the binding SUB_PLAN):
 * - PURE RENDERER: consume a resolved selection descriptor + store
 *   snapshot, rebuild the DOM. Owns NO state beyond the collapsed flag.
 * - NO new store commands: every field commits through the EXISTING
 *   reducers (setWallLean/clearWallLean, updateOpening, rotate /
 *   resizeFurniture) via the dispatch callback glue hands in — the
 *   popover paths keep their monopoly on validation, the panel merely
 *   reuses them.
 * - Walls are NOT entities: a wall segment is addressed
 *   {roomId, segmentIndex} and tracked UI-LOCALLY in glue (no store
 *   state, no schema churn). The descriptor is the seam #100 plugs
 *   its type-in dimensions into later.
 */

import type {
  FloorplanData,
  FurnitureItem,
  Opening,
  Room,
} from '../shared/schema';
import { roomAreaM2 } from './measures';
import { compassAngleBetween, polarEndpoint } from './model/angles';
import { mountDimFields } from './typeInDims';
import { ROOF_MAX_LEAN_EDITOR_DEG } from './store';

/** UI-local address of a wall segment (walls are not entities). */
export interface SegmentAddress {
  roomId: string;
  segIndex: number;
}

/**
 * Resolved selection descriptor. Built by glue from selectedId +
 * UI-local segment state; `kind: 'wall'` only when a segment address is
 * live for the selected room.
 */
export type SelectionDescriptor =
  | { kind: 'none' }
  | { kind: 'wall'; room: Room; segIndex: number }
  | { kind: 'opening'; opening: Opening; room: Room }
  | { kind: 'room'; room: Room }
  | { kind: 'furniture'; item: FurnitureItem };

/** Result of a dispatched command (subset of DispatchResult). */
export type PanelDispatch = (
  cmd: unknown,
) => { ok: true } | { ok: false; error: string };

/** Degrees formatter shared by the wall row ('30°' / '—'). */
function fmtDeg(deg: number | null): string {
  return deg === null ? '\u2014' : `${deg}\u00B0`;
}

/**
 * Equality for UI-local segment addresses (walls are not entities —
 * the address is compared BY VALUE everywhere it lives in glue).
 */
export function sameSegmentAddress(
  a: SegmentAddress | null,
  b: SegmentAddress | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.roomId === b.roomId && a.segIndex === b.segIndex;
}

/** Segment length + compass bearing of a room's polygon segment. */
function segmentMetrics(
  room: Room,
  segIndex: number,
): { lengthM: number; angleDeg: number } {
  const a = room.polygon[segIndex];
  const b = room.polygon[(segIndex + 1) % room.polygon.length];
  const lengthM = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // Issue #100: the bearing now derives from the SHARED compass helper
  // (angles.ts) — the same source the angle pills and the type-in
  // fields use, so all three surfaces can never diverge. Formula is
  // unchanged (atan2(dx, dy): 0° = north (+y), CW-positive).
  const angleDeg = compassAngleBetween(a, b);
  return { lengthM, angleDeg };
}

/** Row factory: <dt>label</dt><dd>value</dd> pairs for the dl. */
function kvRow(dl: HTMLDListElement, term: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.append(dt, dd);
}

/** Section heading inside the panel body. */
function sectionTitle(body: HTMLElement, text: string): void {
  const h = document.createElement('div');
  h.className = 'inspector-section-title';
  h.textContent = text;
  body.appendChild(h);
}

/**
 * Numeric field with a labelled input. Commits via `commit(parse(raw))`
 * on Enter or change/blur; NaN parses bounce through `flash` (the
 * existing flashMessage path — the panel never invents error UI).
 * `commit` returns whether the command took; a failed commit leaves
 * the field as typed (the flash explains why) but does NOT latch the
 * value, so a corrected retry commits cleanly.
 */
function numberField(
  body: HTMLElement,
  labelText: string,
  testid: string,
  value: number,
  commit: (parsed: number) => boolean,
  flash: (msg: string) => void,
  parseError: string,
  step = 'any',
): HTMLInputElement {
  const wrap = document.createElement('label');
  wrap.className = 'inspector-field';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = step;
  input.value = String(value);
  input.dataset.testid = testid;
  // Textual label keeps the accessible name stable for getByRole.
  input.setAttribute('aria-label', labelText);
  wrap.append(document.createTextNode(labelText), input);
  body.appendChild(wrap);

  let lastCommitted = value;
  const run = (): void => {
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) {
      flash(parseError);
      input.value = String(lastCommitted);
      return;
    }
    // Equal-to-last skips the duplicate dispatch Enter+change would
    // otherwise produce (two undo steps for one edit).
    if (parsed === lastCommitted) return;
    if (commit(parsed)) lastCommitted = parsed;
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      run();
    }
  });
  // change (not input): commit on blur/steppers only after the user
  // settles a value — mirrors the popover's commit-on-submit feel.
  input.addEventListener('change', run);
  return input;
}

export interface InspectorPanel {
  /** Root element (append into the editor layout). */
  readonly root: HTMLElement;
  /** True while the panel occupies layout (expanded). */
  isOpen(): boolean;
  /** Expand/collapse; collapsing returns focus to the toggle button. */
  setOpen(open: boolean): void;
  /**
   * Pure re-render: descriptor + snapshot in, DOM out. Focus inside the
   * panel is PRESERVED across rebuilds (fields keep keystroke continuity
   * while store updates stream in).
   */
  render(desc: SelectionDescriptor, plan: FloorplanData): void;
}

/**
 * Mount the inspector panel. `dispatch` proxies to the store (typed as
 * unknown at this seam — the panel is a renderer, not a store client),
 * `flash` is glue's flashMessage adapter.
 */
export function mountInspectorPanel(
  dispatch: PanelDispatch,
  flash: (msg: string) => void,
): InspectorPanel {
  const root = document.createElement('aside');
  root.className = 'inspector-panel';
  root.setAttribute('data-testid', 'inspector-panel');
  root.setAttribute('aria-label', 'Inspector');

  const heading = document.createElement('div');
  heading.className = 'inspector-heading';
  const title = document.createElement('span');
  title.className = 'inspector-title';
  title.textContent = 'Inspector';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'editor-btn inspector-close';
  closeBtn.textContent = 'Close';
  closeBtn.title = 'Collapse the inspector panel.';
  closeBtn.dataset.testid = 'btn-close-inspector';
  heading.append(title, closeBtn);
  root.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'inspector-body';
  root.appendChild(body);

  let open = false;
  // Issue #100 (Pkg 12.2): autofocus the wall dim pair when the wall
  // case ACTIVATES (descriptor transition into it). Steady-state
  // re-renders (store notifies while typing) must NOT steal focus —
  // hence the key comparison, not a blanket focus() in renderWall.
  let lastDescKey: string | null = null;
  // The OPEN transition keeps the #101 contract (panel ROOT focused
  // so Tab lands on Close first — pinned by inspector-panel.spec);
  // the first render after setOpen(true) therefore suppresses the
  // wall-case autofocus.
  let suppressAutofocus = false;

  const api: InspectorPanel = {
    root,
    isOpen: (): boolean => open,
    setOpen(next: boolean): void {
      open = next;
      root.classList.toggle('collapsed', !open);
      // hidden attr (not display:none) keeps the [hidden] UA rule as the
      // single source of hiding truth — same discipline as the palettes.
      root.hidden = !open;
      if (next) suppressAutofocus = true;
    },
    render(desc, plan): void {
      // Preserve focus identity across re-renders: typing in a field
      // triggers store notifies that re-enter render(); rebuilding the
      // DOM under the caret would break keystroke continuity.
      const active = root.contains(document.activeElement)
        ? (document.activeElement as HTMLElement)
        : null;
      const focusedTestid =
        active instanceof HTMLInputElement && active.dataset.testid
          ? active.dataset.testid
          : null;
      body.replaceChildren();

      if (desc.kind === 'none') {
        renderNone(body, plan);
      } else if (desc.kind === 'wall') {
        renderWall(body, desc.room, desc.segIndex, dispatch, flash);
      } else if (desc.kind === 'opening') {
        renderOpening(body, desc.opening, desc.room, dispatch, flash);
      } else if (desc.kind === 'room') {
        renderRoom(body, desc.room);
      } else {
        renderFurniture(body, desc.item, dispatch, flash);
      }

      // Issue #100: on TRANSITION into the wall case, autofocus the
      // length field (mouseless activation; Tab then hops to angle).
      // Deferred a microtask: the OPEN transition's root.focus()
      // (setInspectorOpen) runs AFTER this render synchronously — the
      // queue hop lets the #101 root-focus win when the panel just
      // opened, while a LATER wall-case transition takes the field.
      const descKey =
        desc.kind === 'wall'
          ? `wall:${desc.room.id}:${desc.segIndex}`
          : desc.kind;
      const wallActivated = descKey.startsWith('wall:') && descKey !== lastDescKey;
      lastDescKey = descKey;
      if (wallActivated && !suppressAutofocus) {
        queueMicrotask(() => {
          body
            .querySelector<HTMLInputElement>("[data-testid='insp-wall-length']")
            ?.focus();
        });
      }
      if (suppressAutofocus) suppressAutofocus = false;

      if (focusedTestid !== null) {
        const again = body.querySelector<HTMLInputElement>(
          `[data-testid='${focusedTestid}']`,
        );
        if (again !== null) {
          again.focus();
          // Caret to end: the field re-seeded from the store value.
          // Number inputs REJECT setSelectionRange (throws) — the caret
          // position is cosmetic, so degrade silently there.
          try {
            const len = again.value.length;
            again.setSelectionRange(len, len);
          } catch {
            /* type=number has no selection API — focus is enough */
          }
        }
      }
    },
  };

  closeBtn.addEventListener('click', () => api.setOpen(false));

  api.setOpen(false);
  return api;
}

/* -------------------------- no-selection summary -------------------------- */

function renderNone(body: HTMLElement, plan: FloorplanData): void {
  sectionTitle(body, 'Nothing selected');
  const dl = document.createElement('dl');
  dl.className = 'inspector-summary';
  kvRow(dl, 'Floors', String(plan.floors.length));
  const rooms = plan.floors.reduce((n, f) => n + f.rooms.length, 0);
  const openings = plan.floors.reduce((n, f) => n + f.openings.length, 0);
  const furniture = plan.floors.reduce((n, f) => n + f.furniture.length, 0);
  kvRow(dl, 'Rooms', String(rooms));
  kvRow(dl, 'Openings', String(openings));
  kvRow(dl, 'Furniture', String(furniture));
  const total = plan.floors.reduce(
    (sum, f) => sum + f.rooms.reduce((s, r) => s + roomAreaM2(r), 0),
    0,
  );
  kvRow(dl, 'Livable area', `${total.toFixed(1)} m\u00B2`);
  body.appendChild(dl);
}

/* -------------------------------- wall ----------------------------------- */

function renderWall(
  body: HTMLElement,
  room: Room,
  segIndex: number,
  dispatch: PanelDispatch,
  flash: (msg: string) => void,
): void {
  const { lengthM, angleDeg } = segmentMetrics(room, segIndex);
  sectionTitle(body, `Wall ${segIndex + 1} \u00B7 ${room.name}`);

  // Lean degrees: the L-popover functionality promoted to a visible
  // control. Reuses the IDENTICAL commit path (incl. the clear-on-empty
  // convention: 0 routes through clearWallLean).
  //
  // NOTE (issue #100): the lean section renders BEFORE the dim pair so
  // the pinned #101 Tab walk (root → Close → lean field) survives the
  // added fields unchanged; the dim pair joins the Tab order right
  // after it, and activation AUTOFOCUS lands directly on the length
  // field anyway (mouseless path needs no Tabbing to arrive).
  const leanRow = (room.roofs ?? []).find((r) => r.segmentIndex === segIndex);
  sectionTitle(body, 'Roof lean');
  const input = numberField(
    body,
    'Lean degrees',
    'insp-lean-deg',
    leanRow?.leanDeg ?? 0,
    (deg) => {
      const rounded = Math.round(deg);
      if (rounded === 0) {
        // Reduce treats 0 as clear anyway; the explicit command exercises
        // the same path the popover's Clear button uses.
        const res = dispatch({
          type: 'clearWallLean',
          roomId: room.id,
          segmentIndex: segIndex,
        });
        if (!res.ok) {
          flash(res.error);
          return false;
        }
        return true;
      }
      const res = dispatch({
        type: 'setWallLean',
        roomId: room.id,
        segmentIndex: segIndex,
        leanDeg: rounded,
      });
      if (!res.ok) {
        flash(res.error);
        return false;
      }
      return true;
    },
    flash,
    'Lean must be a number.',
    '1',
  );
  input.min = '0';
  input.max = String(ROOF_MAX_LEAN_EDITOR_DEG);

  // Issue #100 (Pkg 12.2): the read-only Length/Angle kv rows are now
  // the EDITABLE shared dim pair. Commit computes the segment's far
  // endpoint via the shared polar helper and moves it with the SAME
  // resizeRoom command the vertex-drag path streams (glue.ts ~:2135)
  // — clamping/validation identical by construction. Errors surface
  // through the existing flash plumbing.
  //
  // ACCEPTED SIDE-EFFECT (non-goal: constraint solving): moving the
  // shared vertex also bends the FOLLOWING wall (k+1) — the price of
  // reusing the vertex-move command instead of inventing a new one.
  sectionTitle(body, 'Dimensions');
  const a = room.polygon[segIndex];
  const fields = mountDimFields({
    lengthM,
    angleDeg,
    onLive: () => {
      /* selection case: no live preview, commit-only (see below) */
    },
    onCommit: (dims) => {
      const n = room.polygon.length;
      const newPos = polarEndpoint(a, dims.lengthM, dims.angleDeg);
      const res = dispatch({
        type: 'resizeRoom',
        roomId: room.id,
        vertexIndex: (segIndex + 1) % n,
        newPos,
      });
      if (!res.ok) flash(res.error);
    },
    onInvalid: () => {
      flash('Length must be a positive number.');
    },
    commitOnBlur: true,
    testidPrefix: 'insp-wall',
    lengthLabel: 'Wall length (m)',
    angleLabel: 'Wall angle (\u00B0)',
  });
  body.appendChild(fields.root);
}

/* ------------------------------- opening --------------------------------- */

function renderOpening(
  body: HTMLElement,
  opening: Opening,
  room: Room,
  dispatch: PanelDispatch,
  flash: (msg: string) => void,
): void {
  sectionTitle(
    body,
    `${opening.kind === 'door' ? 'Door' : 'Window'} \u00B7 ${room.name}`,
  );

  const seg = room.polygon[opening.segmentIndex];
  const segEnd = room.polygon[(opening.segmentIndex + 1) % room.polygon.length];
  const segLen =
    seg && segEnd ? Math.hypot(segEnd[0] - seg[0], segEnd[1] - seg[1]) : 0;
  const dl = document.createElement('dl');
  dl.className = 'inspector-summary';
  kvRow(dl, 'Wall', `Wall ${opening.segmentIndex + 1}`);
  if (segLen > 0)
    kvRow(dl, 'Position', `${Math.round(opening.tCenter * 100)}%`);
  body.appendChild(dl);

  // Width: reused reducer (updateOpening{syncPair}), validated by the
  // same validateOpeningCandidate the drag path trusts — a bad width
  // flashes through the shared banner, never a fork.
  numberField(
    body,
    'Width (m)',
    'insp-opening-width',
    opening.width,
    (w) => {
      const res = dispatch({
        type: 'updateOpening',
        openingId: opening.id,
        fields: { width: w },
        syncPair: true,
      });
      if (!res.ok) {
        flash(res.error);
        return false;
      }
      return true;
    },
    flash,
    'Width must be a number.',
    '0.05',
  );

  // Sill height: only meaningful where applicable (doors sit at 0 by
  // convention; windows carry the raised sill).
  if (opening.kind === 'window') {
    numberField(
      body,
      'Sill height (m)',
      'insp-opening-sill',
      opening.sillHeight,
      (s) => {
        const res = dispatch({
          type: 'updateOpening',
          openingId: opening.id,
          fields: { sillHeight: s },
          syncPair: true,
        });
        if (!res.ok) {
          flash(res.error);
          return false;
        }
        return true;
      },
      flash,
      'Sill height must be a number.',
      '0.05',
    );
  }

  // Head height: shared by doors/windows (lintel line).
  numberField(
    body,
    'Head height (m)',
    'insp-opening-head',
    opening.headHeight,
    (h) => {
      const res = dispatch({
        type: 'updateOpening',
        openingId: opening.id,
        fields: { headHeight: h },
        syncPair: true,
      });
      if (!res.ok) {
        flash(res.error);
        return false;
      }
      return true;
    },
    flash,
    'Head height must be a number.',
    '0.05',
  );
}

/* --------------------------------- room ---------------------------------- */

function renderRoom(body: HTMLElement, room: Room): void {
  sectionTitle(body, room.name);
  const dl = document.createElement('dl');
  dl.className = 'inspector-summary';
  // Livable area REUSES measures.ts (shoelace stays owned by geom.ts —
  // the panel never recomputes polygon math).
  kvRow(dl, 'Livable area', `${roomAreaM2(room).toFixed(1)} m\u00B2`);
  kvRow(dl, 'Vertices', String(room.polygon.length));
  const leaned = (room.roofs ?? []).length;
  if (leaned > 0) kvRow(dl, 'Leaned walls', String(leaned));
  body.appendChild(dl);
  const hint = document.createElement('p');
  hint.className = 'inspector-hint';
  hint.textContent = 'Click near a wall to inspect that wall segment.';
  body.appendChild(hint);
}

/* ------------------------------- furniture ------------------------------- */

function renderFurniture(
  body: HTMLElement,
  item: FurnitureItem,
  dispatch: PanelDispatch,
  flash: (msg: string) => void,
): void {
  sectionTitle(body, 'Furniture');
  const dl = document.createElement('dl');
  dl.className = 'inspector-summary';
  kvRow(dl, 'Type', item.type);
  kvRow(dl, 'Rotation', fmtDeg(Math.round(item.rotationDeg)));
  body.appendChild(dl);

  numberField(
    body,
    'Width (m)',
    'insp-furn-width',
    item.footprint[0],
    (w) => {
      const res = dispatch({
        type: 'resizeFurniture',
        furnitureId: item.id,
        footprint: [w, item.footprint[1]],
      });
      if (!res.ok) {
        flash(res.error);
        return false;
      }
      return true;
    },
    flash,
    'Width must be a number.',
    '0.05',
  );
  numberField(
    body,
    'Depth (m)',
    'insp-furn-depth',
    item.footprint[1],
    (d) => {
      const res = dispatch({
        type: 'resizeFurniture',
        furnitureId: item.id,
        footprint: [item.footprint[0], d],
      });
      if (!res.ok) {
        flash(res.error);
        return false;
      }
      return true;
    },
    flash,
    'Depth must be a number.',
    '0.05',
  );
}
