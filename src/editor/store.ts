/**
 * EditorStore — a pure reducer over FloorplanData with snapshot-stack
 * undo/redo (cap 100, one step per committed pointer gesture) and a
 * dirty flag for the autosave debouncer.
 */
import type { FloorplanData, Opening, Room, Vec2 } from '../shared/schema';
import { signedArea, vecAdd, vecEq } from './geom';

export type Pt = Vec2;

/* ------------------------------- Commands -------------------------------- */

export type Command =
  | { type: 'drawRoom'; polygon: Pt[]; name?: string }
  | { type: 'moveRoom'; roomId: string; delta: Pt }
  | { type: 'resizeRoom'; roomId: string; vertexIndex: number; newPos: Pt }
  | { type: 'deleteRoom'; roomId: string }
  | { type: 'setSelection'; roomId: string | null };

export type DispatchResult =
  | { ok: true }
  | { ok: false; error: string };

/* ------------------------------ State shape ------------------------------ */

export interface EditorState {
  data: FloorplanData;
  selectedId: string | null;
}

export function emptyPlan(): FloorplanData {
  return {
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [],
    openings: [],
    furniture: [],
  };
}

let uidCounter = 0;
function makeId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

const MIN_VERTICES = 3;
const MAX_UNDO_DEPTH = 100;

/* --------------------------- Reducer internals ---------------------------- */

function reduceDrawRoom(st: EditorState, cmd: { polygon: Pt[]; name?: string }): DispatchResult {
  const pts = cmd.polygon.filter(
    (p, i, arr) => !(i > 0 && vecEq(p, arr[i - 1])),
  );

  if (pts.length < MIN_VERTICES) {
    return { ok: false, error: `need at least ${MIN_VERTICES} points to close a polygon` };
  }

  let ccw = pts.slice();
  if (signedArea(ccw) < 0) ccw = ccw.reverse();

  if (signedArea(ccw) <= 0) {
    return { ok: false, error: 'degenerate polygon (zero area)' };
  }

  const room: Room = {
    id: makeId('room'),
    name: cmd.name ?? '',
    polygon: ccw,
    floorTexture: null,
  };
  st.data.rooms.push(room);
  return { ok: true };
}

function reduceMoveRoom(st: EditorState, cmd: { roomId: string; delta: Pt }): DispatchResult {
  const room = st.data.rooms.find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  room.polygon = room.polygon.map((p) => vecAdd(p, cmd.delta));
  return { ok: true };
}

function reduceResizeRoom(
  st: EditorState,
  cmd: { roomId: string; vertexIndex: number; newPos: Pt },
): DispatchResult {
  const room = st.data.rooms.find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  if (cmd.vertexIndex < 0 || cmd.vertexIndex >= room.polygon.length) {
    return { ok: false, error: `vertexIndex ${cmd.vertexIndex} out of range` };
  }
  room.polygon[cmd.vertexIndex] = [cmd.newPos[0], cmd.newPos[1]];
  return { ok: true };
}

function reduceDeleteRoom(st: EditorState, cmd: { roomId: string }): DispatchResult {
  const idx = st.data.rooms.findIndex((r) => r.id === cmd.roomId);
  if (idx === -1) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  st.data.rooms.splice(idx, 1);
  // Cascade-remove any openings/furniture anchored to the deleted room.
  st.data.openings = st.data.openings.filter((o: Opening) => o.roomId !== cmd.roomId);
  st.data.furniture = st.data.furniture.filter((f) => f.roomId !== cmd.roomId);
  return { ok: true };
}

function reduceSetSelection(st: EditorState, cmd: { roomId: string | null }): DispatchResult {
  if (cmd.roomId !== null && !st.data.rooms.some((r) => r.id === cmd.roomId)) {
    return { ok: false, error: `unknown room "${cmd.roomId}"` };
  }
  st.selectedId = cmd.roomId;
  return { ok: true };
}

/* ------------------------------ Store class ------------------------------- */

export class EditorStore {
  private _state: EditorState;
  private _undoStack: string[] = [];
  private _redoStack: string[] = [];
  private _listeners = new Set<(s: EditorState) => void>();
  private _gestureBase: string | null = null;
  public dirty = false;

  constructor(initial: FloorplanData) {
    this._state = { data: clone(initial), selectedId: null };
  }

  getState(): EditorState {
    return this._state;
  }

  /**
   * Apply a command through the reducer. Mutating commands snapshot the
   * CURRENT state onto the undo stack BEFORE the change; the redo stack is
   * cleared on every new mutating command.
   */
  dispatch(cmd: Command): DispatchResult {
    if (cmd.type === 'setSelection') {
      const selRes = reduceSetSelection(this._state, cmd);
      if (selRes.ok) this.notify();
      return selRes;
    }

    const snapshot =
      this._gestureBase !== null ? this._gestureBase : JSON.stringify(this._state.data);
    const res =
      cmd.type === 'drawRoom'
        ? reduceDrawRoom(this._state, cmd)
        : cmd.type === 'moveRoom'
          ? reduceMoveRoom(this._state, cmd)
          : cmd.type === 'resizeRoom'
            ? reduceResizeRoom(this._state, cmd)
            : reduceDeleteRoom(this._state, cmd);

    if (!res.ok) return res;

    this._undoStack.push(snapshot);
    if (this._undoStack.length > MAX_UNDO_DEPTH) this._undoStack.shift();
    this._redoStack = []; // invalidate redo on divergence
    this.dirty = true;
    this.notify();
    return res;
  }

  /**
   * Batch consecutive mutations into ONE undo step (an ongoing pointer
   * drag streams moveRoom/resizeRoom frames). Call beginGesture() on
   * pointerdown and endGesture() on pointerup/cancel.
   */
  beginGesture(): void {
    if (this._gestureBase === null) this._gestureBase = JSON.stringify(this._state.data);
  }

  endGesture(): void {
    this._gestureBase = null;
  }

  /** Roll the plan back one snapshot; returns false when nothing to undo. */
  undo(): boolean {
    const prev = this._undoStack.pop();
    if (prev === undefined) return false;
    this._redoStack.push(JSON.stringify(this._state.data));
    this._state = { ...this._state, data: JSON.parse(prev) };
    // Selection may reference a room undone away — drop it if dangling.
    if (
      this._state.selectedId !== null &&
      !this._state.data.rooms.some((r) => r.id === this._state.selectedId)
    ) {
      this._state = { ...this._state, selectedId: null };
    }
    this.dirty = true;
    this.notify();
    return true;
  }

  /** Advance the plan one snapshot forward; false when nothing to redo. */
  redo(): boolean {
    const nxt = this._redoStack.pop();
    if (nxt === undefined) return false;
    this._undoStack.push(JSON.stringify(this._state.data));
    this._state = { ...this._state, data: JSON.parse(nxt) };
    this.dirty = true;
    this.notify();
    return true;
  }

  canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  markSaved(): void {
    this.dirty = false;
  }

  /** Swap in a wholly different plan (autosave hydration); resets history. */
  replaceAll(plan: FloorplanData): void {
    this._state = { data: clone(plan), selectedId: null };
    this._undoStack = [];
    this._redoStack = [];
    this.dirty = false;
    this.notify();
  }

  subscribe(fn: (s: EditorState) => void): () => void {
    this._listeners.add(fn);
    return () => {
      this._listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this._listeners) fn(this._state);
  }
}

function clone(plan: FloorplanData): FloorplanData {
  return JSON.parse(JSON.stringify(plan));
}
