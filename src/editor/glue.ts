/**
 * Wire-up: binds DOM events to the controller primitives and paints on
 * every state change. Lives here (not in controller.ts) so the gesture
 * math stays unit-testable without a real canvas/browser.
 */
import type { FloorplanData } from '../shared/schema';
import { validateFloorplan } from '../shared/schema';
import { AutosaveManager } from './autosave';
import {
  attemptDrop,
  computeOverlaps,
  evaluateSnapCandidates,
  finalizeRectangle,
  GRID_M,
  judgeMoveTarget,
  nextRotation,
  openingErrorMessage,
  resizeHandleAt,
  roomAt,
  screenToWorld,
  SNAP_TOL_PX,
  validateOpeningDraft,
  type AnyToolMode,
  type Camera,
  type GhostPreview,
  type InteractionPhase,
} from './controller';
import { FURNITURE_DEFAULTS, OPENING_DEFAULTS } from './model/constants';
import { nearestSegment, pointAtT, projectOntoSegment } from './model/openings';
import { itemCorners } from './model/furniture';
import type { Pt } from './geom';
import { flashMessage, type EditorDomRefs } from './ui';
import { paintScene } from './render';
import { EditorStore, emptyPlan } from './store';
import { snapVec, vecAdd, vecSub } from './geom';

const POLYGON_MIN_POINTS = 3;
const CLOSE_HIT_RADIUS_PX = 10; // click-near-start closes the polygon
const INITIAL_SCALE = 80; // px per meter
const ZOOM_STEP = 1.1;
const MIN_ZOOM_SCALE = 12;
const MAX_ZOOM_SCALE = 480;

export function initEditorInteraction(
  refs: EditorDomRefs,
  store: EditorStore,
  autosave: AutosaveManager,
): void {
  const canvas = refs.canvas;
  const ctx = canvas.getContext('2d'); // null in stub/happy-dom environments
  const cam: Camera = { originX: 0, originY: 0, scale: INITIAL_SCALE };
  let tool: AnyToolMode = 'select';
  let phase: InteractionPhase = { tag: 'idle' };
  let hoverRoomId: string | null = null;
  // pkg 3 (issue #4):
  let stampType: string = 'bed';
  let ghost: GhostPreview | null = null;
  let hoverSeg: { roomId: string; segIndex: number } | null = null;
  let draggingFurnitureId: string | null = null;

  /* ---------- sizing (devicePixelRatio aware) ---------- */
  function resizeCanvas(): void {
    const wrap = canvas.parentElement!;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    repaint();
  }

  function repaint(): void {
    if (!ctx) return; // stub environment: DOM/state still fully functional
    const rect = canvas.getBoundingClientRect();
    paintScene(
      ctx, rect.width, rect.height, cam, store.getState().data, phase, hoverRoomId,
      ghost, hoverSeg,
    );
  }

  function snapToleranceWorld(): number {
    return SNAP_TOL_PX / cam.scale;
  }

  /**
   * Full snap policy: magnetize to foreign room geometry first; fall
   * back to the 0.5 m grid when nothing attracts within tolerance.
   */
  function snapPoint(worldPt: Pt, excludeIds: string[] = []): Pt {
    const geo = evaluateSnapCandidates(
      store.getState().data,
      worldPt,
      snapToleranceWorld(),
      excludeIds,
    );
    return geo.snapped ? geo.point : snapVec(worldPt, GRID_M);
  }

  /* ---------- pointer helpers ---------- */
  function evPos(ev: PointerEvent | MouseEvent): Pt {
    const rect = canvas.getBoundingClientRect();
    return [ev.clientX - rect.left, ev.clientY - rect.top];
  }

  function evWorld(ev: PointerEvent | MouseEvent): Pt {
    return screenToWorld(cam, evPos(ev));
  }

  function refreshStatus(): void {
    const st = store.getState();
    const parts: string[] = [`rooms: ${st.data.rooms.length}`, `tool: ${tool}`];
    if (st.data.openings.length > 0) parts.push(`openings: ${st.data.openings.length}`);
    if (st.data.furniture.length > 0) parts.push(`furniture: ${st.data.furniture.length}`);
    if (st.selectedId) parts.push('selected: 1');
    if (store.canUndo()) parts.push('undo ↺');
    if (store.canRedo()) parts.push('redo ↻');
    refs.status.textContent = parts.join(' · ');
  }

  function refreshBadgeAndButtons(): void {
    const overlaps = computeOverlaps(store.getState().data);
    refs.badge.hidden = overlaps.length === 0;
    const st = store.getState();
    refs.btnDelete.disabled = st.selectedId === null;
    refs.btnUndo.disabled = !store.canUndo();
    refs.btnRedo.disabled = !store.canRedo();
  }

  store.subscribe((_s) => {
    if (_s === undefined) return;
    if (store.dirty) autosave.scheduleSave(_s.data);
    refreshBadgeAndButtons();
    refreshStatus();
    repaint();
  });

  /* ---------- toolbar ---------- */
  function setActiveTool(next: AnyToolMode): void {
    tool = next;
    if (next === 'select') {
      phase = { tag: 'idle' };
    } else {
      store.dispatch({ type: 'setEntitySelection', entityId: null });
      phase = { tag: 'idle' };
    }

    // Furniture palette rides shotgun with the stamp tool.
    refs.palette.hidden = tool !== 'stamp';

    for (const [btn, val] of [
      [refs.btnSelect, 'select'],
      [refs.btnRect, 'rectangle'],
      [refs.btnPoly, 'polygon'],
      [refs.btnDoor, 'door'],
      [refs.btnWindow, 'window'],
      [refs.btnStamp, 'stamp'],
    ] as Array<[HTMLButtonElement, AnyToolMode]>) {
      btn.classList.toggle('active', val === tool);
      btn.setAttribute('aria-pressed', String(val === tool));
    }
    refreshStatus();
    repaint();
  }

  refs.btnSelect.addEventListener('click', () => setActiveTool('select'));
  refs.btnRect.addEventListener('click', () => setActiveTool('rectangle'));
  refs.btnPoly.addEventListener('click', () => setActiveTool('polygon'));
  refs.btnDoor.addEventListener('click', () => setActiveTool('door'));
  refs.btnWindow.addEventListener('click', () => setActiveTool('window'));
  refs.btnStamp.addEventListener('click', () => setActiveTool('stamp'));

  for (const chip of Array.from(refs.palette.querySelectorAll<HTMLButtonElement>('.palette-chip'))) {
    chip.addEventListener('click', () => {
      const t = chip.dataset.stampType;
      if (t && FURNITURE_DEFAULTS[t]) {
        stampType = t;
        for (const c of Array.from(refs.palette.querySelectorAll<HTMLButtonElement>('.palette-chip'))) {
          c.classList.toggle('active', c === chip);
        }
      }
    });
  }

  refs.btnUndo.addEventListener('click', () => {
    store.undo();
  });
  refs.btnRedo.addEventListener('click', () => {
    store.redo();
  });

  /**
   * Delete routes by WHAT is selected: furniture stamp → deleteFurniture,
   * opening → deleteOpening (+ its pair), room → deleteRoom.
   */
  function routeDelete(): void {
    const sel = store.getState().selectedId;
    if (sel === null) return;
    const st = store.getState();
    if (st.data.furniture.some((f) => f.id === sel)) {
      store.dispatch({ type: 'deleteFurniture', furnitureId: sel });
      return;
    }
    if (st.data.openings.some((o) => o.id === sel)) {
      store.dispatch({ type: 'deleteOpening', openingId: sel, syncPair: true });
      return;
    }
    store.dispatch({ type: 'deleteRoom', roomId: sel });
  }
  refs.btnDelete.addEventListener('click', () => routeDelete());




  /* ---------- pkg 3 helpers (issue #4) ---------- */

  /** Top-most furniture whose rotated rect contains the world point. */
  function furnitureItemAt(
    worldPt: Pt,
    plan: FloorplanData,
  ): FloorplanData['furniture'][number] | null {
    for (let i = plan.furniture.length - 1; i >= 0; i -= 1) {
      const corners = itemCorners(plan.furniture[i]);
      if (pointInPolygonGeom(worldPt, corners)) return plan.furniture[i];
    }
    return null;
  }

  function pointInPolygonGeom(pt: Pt, poly: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      const intersects =
        yi > pt[1] !== yj > pt[1] &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  /** Recompute the door/window ghost + wall highlight for a hover point. */
  function updateOpeningHover(worldPt: Pt): void {
    ghost = null;
    hoverSeg = null;
    if (tool !== 'door' && tool !== 'window') return;
    const kind = tool;
    const plan = store.getState().data;
    let bestRoomId: string | null = null;
    let bestSeg: ReturnType<typeof nearestSegment> = null;
    let bestDist = Infinity;
    for (const room of plan.rooms) {
      const seg = nearestSegment(room, worldPt);
      if (!seg) continue;
      const a = seg.a;
      const b = seg.b;
      const proj = projectOntoSegment(worldPt, { index: seg.index, a, b, length: seg.length });
      const cp = pointAtT(seg, proj);
      const d = Math.hypot(cp[0] - worldPt[0], cp[1] - worldPt[1]);
      if (d < bestDist) {
        bestDist = d;
        bestRoomId = room.id;
        bestSeg = seg;
      }
    }
    if (!bestRoomId || !bestSeg) return;
    const t = projectOntoSegment(worldPt, bestSeg);
    hoverSeg = { roomId: bestRoomId, segIndex: bestSeg.index };
    const defs = OPENING_DEFAULTS[kind];
    const err = validateOpeningDraft(
      plan, bestRoomId, bestSeg.index, kind, t,
      defs.width, defs.sillHeight, defs.headHeight,
    );
    ghost = { kind, seg: bestSeg, t, width: defs.width, valid: err === null };
  }

  /** Commit the currently-hovered opening, bouncing invalid drafts. */
  function commitOpening(kind: 'door' | 'window'): void {
    if (!ghost || !ghost.seg || ghost.t === undefined || !ghost.valid || !hoverSeg) {
      return;
    }
    const defs = OPENING_DEFAULTS[kind];
    const err = validateOpeningDraft(
      store.getState().data, hoverSeg.roomId, hoverSeg.segIndex, kind,
      ghost.t, defs.width, defs.sillHeight, defs.headHeight,
    );
    if (err !== null) {
      flashMessage(refs, openingErrorMessage(err, kind));
      return;
    }
    const res = store.dispatch({
      type: 'addOpening',
      roomId: hoverSeg.roomId,
      segmentIndex: hoverSeg.segIndex,
      kind,
      tCenter: ghost.t,
      width: defs.width,
      sillHeight: defs.sillHeight,
      headHeight: defs.headHeight,
    });
    if (!res.ok) flashMessage(refs, res.error);
  }

  /* ---------- pointer interactions ---------- */
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button === 1 || ev.altKey) {
      // Middle-button or alt-drag pans.
      const pos = evPos(ev);
      phase = { tag: 'panning', startX: pos[0], startY: pos[1] };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.button !== 0) return;

    const worldPt = evWorld(ev);

    if (tool === 'rectangle') {
      // Snap the anchor corner to grid/foreign geometry like any other gesture.
      phase = { tag: 'drawingRect', corner1: snapPoint(worldPt), cursor: snapPoint(worldPt) };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    if (tool === 'door' || tool === 'window') {
      // Refresh the ghost at the CLICK point (touch devices skip hover),
      // then commit when the draft validates.
      updateOpeningHover(worldPt);
      if (ghost && ghost.valid && hoverSeg) {
        commitOpening(tool);
        ghost = null;
        hoverSeg = null;
        repaint();
        return;
      }
      if (ghost && !ghost.valid) {
        const code = validateOpeningDraft(
          store.getState().data,
          hoverSeg!.roomId,
          hoverSeg!.segIndex,
          tool,
          ghost.t!,
          OPENING_DEFAULTS[tool].width,
          OPENING_DEFAULTS[tool].sillHeight,
          OPENING_DEFAULTS[tool].headHeight,
        );
        flashMessage(refs, openingErrorMessage(code ?? 'UNKNOWN', tool));
      } else {
        flashMessage(refs, `Move closer to a wall to place the ${tool}.`);
      }
      repaint();
      return;
    }

    if (tool === 'stamp') {
      const def = FURNITURE_DEFAULTS[stampType];
      if (!def) return;
      const outcome = attemptDrop(store.getState().data, def.footprint, worldPt);
      if (outcome.verdict === 'rejected') {
        flashMessage(
          refs,
          outcome.reason === 'NO_ROOM_AT_POINT'
            ? 'Click inside a room to place furniture.'
            : 'That piece does not fit anywhere in this room — placement cancelled.',
        );
        repaint();
        return;
      }
      const host = roomAt(worldPt, store.getState().data)!;
      const pos = outcome.verdict === 'warn' ? outcome.snappedTo : worldPt;
      const res = store.dispatch({
        type: 'addFurniture',
        itemType: stampType,
        roomId: host.id,
        position: pos,
        rotationDeg: 0,
        footprint: [def.footprint[0], def.footprint[1]],
      });
      if (!res.ok) {
        flashMessage(refs, res.error);
      } else if (outcome.verdict === 'warn') {
        flashMessage(refs, 'Placed, but adjusted inward to stay inside the room.');
      }
      repaint();
      return;
    }

    if (tool === 'polygon') {
      const cur = phase.tag === 'drawingPoly' ? phase : null;
      if (cur === null) {
        const first = snapPoint(worldPt);
        phase = { tag: 'drawingPoly', points: [first], cursor: first };
      } else if (
        dist(cur.points[0], worldPt) * cam.scale <= CLOSE_HIT_RADIUS_PX &&
        cur.points.length >= POLYGON_MIN_POINTS
      ) {
        closePolygon();
        return;
      } else {
        // Snap at COMMIT time so stored geometry matches the snapped preview.
        const pushed = snapPoint(worldPt);
        cur.points.push(pushed);
        cur.cursor = pushed;
      }
      repaint();
      return;
    }

    // --- select tool ---
    const st = store.getState();

    // Furniture takes grab priority over rooms (smaller primitive).
    const grabbed = furnitureItemAt(worldPt, st.data);
    if (grabbed) {
      store.dispatch({ type: 'setEntitySelection', entityId: grabbed.id });
      draggingFurnitureId = grabbed.id;
      store.beginGesture();
      phase = { tag: 'draggingFurniture', furnitureId: grabbed.id };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    const clicked = roomAt(worldPt, st.data);
    if (clicked) {
      // Priority: resize handle on ALREADY-selected room > begin drag > plain select.
      if (st.selectedId === clicked.id) {
        const handle = resizeHandleAt(worldPt, clicked, snapToleranceWorld());
        if (handle !== null) {
          store.beginGesture();
          phase = { tag: 'resizing', vertexIndex: handle, selectedRoomId: clicked.id };
          canvas.setPointerCapture(ev.pointerId);
          return;
        }
      }
      store.dispatch({ type: 'setSelection', roomId: clicked.id });
      // Offset from the grabbed POINT to the room's anchor vertex, so the
      // vertex follows the cursor exactly (no teleport on first move).
      const grabOffset = vecSub(clicked.polygon[0], worldPt);
      store.beginGesture();
      phase = { tag: 'dragging', grabOffset, selectedRoomId: clicked.id };
      canvas.setPointerCapture(ev.pointerId);
    } else {
      store.dispatch({ type: 'setSelection', roomId: null });
      phase = { tag: 'idle' };
    }
  });

  function dist(a: Pt, b: Pt): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  canvas.addEventListener('pointermove', (ev) => {
    const worldPt = evWorld(ev);

    // pkg 3: opening-tool ghost slide + wall highlight (any phase-less move).
    if (tool === 'door' || tool === 'window') {
      updateOpeningHover(worldPt);
      repaint();
      return;
    }

    if (tool === 'stamp') {
      // Live ghost rect under the cursor for the armed stamp type.
      const def = FURNITURE_DEFAULTS[stampType];
      if (def) {
        const outcome = attemptDrop(store.getState().data, def.footprint, worldPt);
        ghost = {
          kind: 'stamp',
          pos: outcome.verdict === 'warn' ? outcome.snappedTo : worldPt,
          footprint: [def.footprint[0], def.footprint[1]],
          rotationDeg: 0,
          valid: outcome.verdict !== 'rejected',
        };
      }
      repaint();
      return;
    }

    if (phase.tag === 'draggingFurniture') {
      const fid = draggingFurnitureId;
      if (fid) {
        const verdict = judgeMoveTarget(store.getState().data, fid, worldPt);
        if (verdict.verdict === 'rejected') {
          // Snap-back: revert to the item's last committed position.
          const item = store.getState().data.furniture.find((f) => f.id === fid);
          if (item) {
            store.dispatch({ type: 'moveFurniture', furnitureId: fid, position: item.position });
            flashMessage(refs, 'Piece pulled outside the room — snapped back to its last valid spot.');
          }
        } else {
          store.dispatch({
            type: 'moveFurniture',
            furnitureId: fid,
            position: verdict.resolved,
          });
          if (verdict.verdict === 'warn') {
            flashMessage(refs, 'Moved, but clamped to keep the piece inside the room.');
          }
        }
      }
      repaint();
      return;
    }

    if (phase.tag === 'panning') {
      const pos = evPos(ev);
      cam.originX -= (pos[0] - phase.startX) / cam.scale;
      cam.originY += (pos[1] - phase.startY) / cam.scale;
      phase.startX = pos[0];
      phase.startY = pos[1];
      repaint();
      return;
    }

    if (phase.tag === 'drawingRect') {
      phase = { ...phase, cursor: snapPoint(worldPt) };
      repaint();
      return;
    }

    if (phase.tag === 'drawingPoly') {
      phase = { ...phase, cursor: snapPoint(worldPt) };
      repaint();
      return;
    }

    if (phase.tag === 'dragging') {
      const rid = phase.selectedRoomId;
      const room = store.getState().data.rooms.find((r) => r.id === rid);
      if (!room) return;
      // Cursor's target for the anchor vertex = worldPt + grabOffset
      // (grabOffset = anchor - grabPoint at pickup).
      const desiredAnchor = vecAdd(worldPt, phase.grabOffset);
      const sn = evaluateSnapCandidates(
        store.getState().data,
        desiredAnchor,
        snapToleranceWorld(),
        [room.id],
      );
      const delta = vecSub(sn.point, room.polygon[0]);
      store.dispatch({ type: 'moveRoom', roomId: room.id, delta });
      repaint();
      return;
    }

    if (phase.tag === 'resizing') {
      const vid = phase.vertexIndex;
      const rid = phase.selectedRoomId;
      const room = store.getState().data.rooms.find((r) => r.id === rid);
      if (!room) return;
      const sn = evaluateSnapCandidates(
        store.getState().data,
        worldPt,
        snapToleranceWorld(),
        [rid],
      );
      store.dispatch({
        type: 'resizeRoom',
        roomId: rid,
        vertexIndex: vid,
        newPos: sn.point,
      });
      repaint();
      return;
    }

    // idle: hover highlight
    const hit = roomAt(worldPt, store.getState().data);
    const hid = hit?.id ?? null;
    if (hid !== hoverRoomId) {
      hoverRoomId = hid;
      repaint();
    }
  });

  function endDrag(): void {
    store.endGesture();
    phase = { tag: 'idle' };
    repaint();
  }

  canvas.addEventListener('pointerup', (ev) => {
    if (phase.tag === 'drawingRect' && ev.button === 0) {
      const worldPt = snapPoint(evWorld(ev));
      const minSide = Math.abs(worldPt[0] - phase.corner1[0]) * cam.scale;
      const minSideY = Math.abs(worldPt[1] - phase.corner1[1]) * cam.scale;
      if (Math.min(minSide, minSideY) < 2) {
        // Degenerate sliver — ignore rather than create a hairline room.
        phase = { tag: 'idle' };
        repaint();
        return;
      }
      const res = store.dispatch({
        type: 'drawRoom',
        polygon: finalizeRectangle(phase.corner1, worldPt),
      });
      if (!res.ok) flashMessage(refs, res.error);
      phase = { tag: 'idle' };
      repaint();
      return;
    }
    if (phase.tag === 'draggingFurniture') {
      draggingFurnitureId = null;
      endDrag();
      return;
    }
    if (phase.tag === 'dragging' || phase.tag === 'resizing' || phase.tag === 'panning') {
      endDrag();
    }
  });
  canvas.addEventListener('pointercancel', endDrag);

  /* ---------- wheel zoom ---------- */
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newScale = Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, cam.scale * factor));
      const pos = evPos(ev);
      const worldUnderCursor = screenToWorld(cam, pos);
      cam.originX = worldUnderCursor[0] - pos[0] / newScale;
      cam.originY = worldUnderCursor[1] + pos[1] / newScale;
      cam.scale = newScale;
      repaint();
    },
    { passive: false },
  );

  /* ---------- keyboard ---------- */
  canvas.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && phase.tag === 'drawingPoly') {
      closePolygon();
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') {
      // Abandoning an in-flight furniture drag MUST close the gesture,
      // else the leaked _gestureBase makes later atomic commands throw
      // ("non-streamable command inside gesture").
      if (phase.tag === 'draggingFurniture') {
        draggingFurnitureId = null;
        endDrag();
        return;
      }
      phase = { tag: 'idle' };
      repaint();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
      ev.preventDefault();
      if (ev.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) {
      ev.preventDefault();
      store.redo();
      return;
    }
    if ((ev.key === 'r' || ev.key === 'R') && !ev.ctrlKey && !ev.metaKey) {
      const sel = store.getState().selectedId;
      if (sel === null) return;
      const item = store.getState().data.furniture.find((f) => f.id === sel);
      if (item) {
        ev.preventDefault();
        store.dispatch({
          type: 'rotateFurniture',
          furnitureId: item.id,
          rotationDeg: nextRotation(item.rotationDeg),
        });
      }
      return;
    }
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && !ev.ctrlKey && !ev.metaKey) {
      const sel = store.getState().selectedId;
      if (sel !== null) {
        ev.preventDefault();
        routeDelete();
      }
    }
  });

  function closePolygon(): void {
    if (phase.tag !== 'drawingPoly') return;
    const pts = phase.points;
    if (pts.length < POLYGON_MIN_POINTS) {
      flashMessage(refs, `Need at least ${POLYGON_MIN_POINTS} points to close a polygon`);
      phase = { tag: 'idle' };
      repaint();
      return;
    }
    const res = store.dispatch({ type: 'drawRoom', polygon: pts });
    if (!res.ok) {
      flashMessage(refs, res.error);
    }
    phase = { tag: 'idle' };
    repaint();
  }

  canvas.addEventListener('dblclick', () => {
    if (phase.tag === 'drawingPoly') closePolygon();
  });

  /* ---------- boot ---------- */
  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(canvas.parentElement!);
  resizeCanvas();
  refreshBadgeAndButtons();
  refreshStatus();
}

/** Hydrate the store from autosaved data (validated) or start clean. */
export function hydrateFromAutosave(store: EditorStore, autosave: AutosaveManager): void {
  let hydrated: FloorplanData | null = null;
  const restored = autosave.loadStoredPlan((raw) => {
    const res = validateFloorplan(raw);
    if (!res.ok) return false;
    hydrated = res.value;
    return true;
  });
  if (hydrated !== null && restored !== null) {
    store.replaceAll(hydrated);
  }
}

export { emptyPlan };
