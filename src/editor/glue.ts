/**
 * Wire-up: binds DOM events to the controller primitives and paints on
 * every state change. Lives here (not in controller.ts) so the gesture
 * math stays unit-testable without a real canvas/browser.
 */
import type { FloorplanData } from '../shared/schema';
import { validateFloorplan } from '../shared/schema';
import { AutosaveManager } from './autosave';
import {
  computeOverlaps,
  evaluateSnapCandidates,
  finalizeRectangle,
  GRID_M,
  resizeHandleAt,
  roomAt,
  screenToWorld,
  SNAP_TOL_PX,
  type Camera,
  type InteractionPhase,
  type ToolMode,
} from './controller';
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
  let tool: ToolMode = 'select';
  let phase: InteractionPhase = { tag: 'idle' };
  let hoverRoomId: string | null = null;

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
    paintScene(ctx, rect.width, rect.height, cam, store.getState().data, phase, hoverRoomId);
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
  function setActiveTool(next: ToolMode): void {
    tool = next;
    if (next === 'select') {
      phase = { tag: 'idle' };
    } else {
      store.dispatch({ type: 'setSelection', roomId: null });
      phase = { tag: 'idle' };
    }
    for (const [btn, val] of [
      [refs.btnSelect, 'select'],
      [refs.btnRect, 'rectangle'],
      [refs.btnPoly, 'polygon'],
    ] as Array<[HTMLButtonElement, ToolMode]>) {
      btn.classList.toggle('active', val === tool);
      btn.setAttribute('aria-pressed', String(val === tool));
    }
    refreshStatus();
    repaint();
  }

  refs.btnSelect.addEventListener('click', () => setActiveTool('select'));
  refs.btnRect.addEventListener('click', () => setActiveTool('rectangle'));
  refs.btnPoly.addEventListener('click', () => setActiveTool('polygon'));

  refs.btnUndo.addEventListener('click', () => {
    store.undo();
  });
  refs.btnRedo.addEventListener('click', () => {
    store.redo();
  });
  refs.btnDelete.addEventListener('click', () => {
    const sel = store.getState().selectedId;
    if (sel !== null) store.dispatch({ type: 'deleteRoom', roomId: sel });
  });

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
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && !ev.ctrlKey && !ev.metaKey) {
      const sel = store.getState().selectedId;
      if (sel !== null) {
        ev.preventDefault();
        store.dispatch({ type: 'deleteRoom', roomId: sel });
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
