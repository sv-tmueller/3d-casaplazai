/**
 * EditorStore — a pure reducer over FloorplanData with snapshot-stack
 * undo/redo (cap 100, one step per committed pointer gesture) and a
 * dirty flag for the autosave debouncer.
 *
 * Extended by pkg 3 (issue #4): opening + furniture commands join the
 * same reducer/undo/autosave stream. Gesture-streamable commands carry
 * STREAMABLE_CMD payloads; everything else commits atomically.
 */
import type { FloorplanData, Opening, Room, Vec2 } from '../shared/schema';
import { signedArea, vecAdd, vecEq } from './geom';
import { PAIR_TOLERANCE_M } from './model/constants';

export type Pt = Vec2;

/**
 * Payload kinds eligible for intra-gesture streaming (no snapshot
 * spam). Empty for pkg 3: furniture drags commit ONE atomic command
 * per pointerup (judgeMoveTarget verdict), so no opening/furniture
 * payload streams inside a gesture today. Rooms stream via their
 * dedicated moveRoom/resizeRoom handlers in dispatch().
 */

export type Command =
  | { type: 'drawRoom'; polygon: Pt[]; name?: string }
  | { type: 'moveRoom'; roomId: string; delta: Pt }
  | { type: 'resizeRoom'; roomId: string; vertexIndex: number; newPos: Pt }
  | { type: 'deleteRoom'; roomId: string }
  | { type: 'setSelection'; roomId: string | null }
  /** Generalized selection: any room, opening, or furniture id. */
  | { type: 'setEntitySelection'; entityId: string | null }
  /* -------- pkg 3 extensions (issue #4) -------- */
  /**
   * Commit an opening. Two-row shared-door convention: when the host
   * segment is coincident with a neighbor room's segment, the reducer
   * emits BOTH rows (mirror gets complementary tCenter) in ONE atomic,
   * ONE-step-undoable transaction.
   */
  | {
      type: 'addOpening';
      roomId: string;
      segmentIndex: number;
      kind: 'door' | 'window';
      tCenter: number;
      width: number;
      sillHeight: number;
      headHeight: number;
    }
  /** Reposition an opening along its segment; optionally mirror-sync the pair. */
  | { type: 'moveOpening'; openingId: string; tCenter: number; syncPair?: boolean }
  /** Bulk-edit opening props; optionally propagate width/sill/head to the pair. */
  | {
      type: 'updateOpening';
      openingId: string;
      fields: Partial<Pick<Opening, 'tCenter' | 'width' | 'sillHeight' | 'headHeight'>>;
      syncPair?: boolean;
    }
  /** Delete an opening; optionally cascade to its paired twin. */
  | { type: 'deleteOpening'; openingId: string; syncPair?: boolean }
  /** Place a furniture stamp inside a known room (validation upstream). */
  | {
      type: 'addFurniture';
      itemType: string;
      roomId: string;
      position: Pt;
      rotationDeg: number;
      footprint: Pt;
    }
  /** Move a stamp; streamed inside drags (single undo step via gesture). */
  | { type: 'moveFurniture'; furnitureId: string; position: Pt }
  /** Rotate a stamp; streamed inside drags. */
  | { type: 'rotateFurniture'; furnitureId: string; rotationDeg: number }
  /** Resize a stamp's footprint. */
  | { type: 'resizeFurniture'; furnitureId: string; footprint: Pt }
  /** Delete a stamp. */
  | { type: 'deleteFurniture'; furnitureId: string };

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
    // Pkg 1's validator requires non-empty names; unnamed drawn rooms get a
    // sequential default so autosave->reload hydration never discards them.
    name: cmd.name != null && cmd.name.trim() !== '' ? cmd.name : `Room ${st.data.rooms.length + 1}`,
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

function reduceSetEntitySelection(
  st: EditorState,
  entityId: string | null,
): DispatchResult {
  if (entityId === null) {
    st.selectedId = null;
    return { ok: true };
  }
  const known =
    st.data.rooms.some((r) => r.id === entityId) ||
    st.data.openings.some((o) => o.id === entityId) ||
    st.data.furniture.some((f) => f.id === entityId);
  if (!known) return { ok: false, error: `unknown entity "${entityId}"` };
  st.selectedId = entityId;
  return { ok: true };
}

function reduceSetSelection(st: EditorState, cmd: { roomId: string | null }): DispatchResult {
  if (cmd.roomId !== null && !st.data.rooms.some((r) => r.id === cmd.roomId)) {
    return { ok: false, error: `unknown room "${cmd.roomId}"` };
  }
  st.selectedId = cmd.roomId;
  return { ok: true };
}

/* --------------------- pkg 3 reducer internals (issue #4) ------------------ */

/**
 * Coincident-vertex comparator used for shared-wall pairing. Tolerance
 * defaults to PAIR_TOLERANCE_M so a wall drawn a few millimeters off
 * still pairs (issue #36); it is the SAME tolerance the model layer's
 * derivePairRows() uses, keeping emission, mutate, undo and select in
 * agreement.
 */
function vertsCoincide(
  p: Vec2 | undefined,
  q: Vec2 | undefined,
  tol: number = PAIR_TOLERANCE_M,
): boolean {
  return (
    !!p &&
    !!q &&
    Math.abs(p[0] - q[0]) < tol &&
    Math.abs(p[1] - q[1]) < tol
  );
}

/** Segment (a,b) of a room in traversal order; undefined when out of range. */
function roomSegment(room: Room, segmentIndex: number): { a: Vec2; b: Vec2 } | undefined {
  const a = room.polygon[segmentIndex];
  const b = room.polygon[(segmentIndex + 1) % room.polygon.length];
  if (!a || !b) return undefined;
  return { a, b };
}

/**
 * Find the paired twin of an opening: another opening of the SAME KIND
 * whose room holds a coincident (co- or reversely-directed) copy of the
 * same wall segment. Structural (geometry-based) so it agrees with the
 * model layer's derivePairRows()/groupedPairs().
 */
function findPartner(plan: FloorplanData, opening: Opening): Opening | undefined {
  const room = plan.rooms.find((r) => r.id === opening.roomId);
  const seg = room ? roomSegment(room, opening.segmentIndex) : undefined;
  if (!room || !seg) return undefined;
  return plan.openings.find((o) => {
    if (o.id === opening.id || o.kind !== opening.kind) return false;
    const oroom = plan.rooms.find((r) => r.id === o.roomId);
    if (!oroom) return false;
    const oseg = roomSegment(oroom, o.segmentIndex);
    if (!oseg) return false;
    const rev = vertsCoincide(oseg.a, seg.b) && vertsCoincide(oseg.b, seg.a);
    const fwd = vertsCoincide(oseg.a, seg.a) && vertsCoincide(oseg.b, seg.b);
    return rev || fwd;
  });
}

/**
 * Mirror tCenter for a reversely-traversed partner segment: the same
 * PHYSICAL point measured from the partner's own segment start.
 */
function complementT(t: number): number {
  return Math.min(1, Math.max(0, 1 - t));
}

function reduceAddOpening(
  st: EditorState,
  cmd: Extract<Command, { type: 'addOpening' }>,
): DispatchResult {
  const room = st.data.rooms.find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  const seg = roomSegment(room, cmd.segmentIndex);
  if (!seg) return { ok: false, error: `segmentIndex ${cmd.segmentIndex} out of range` };

  const base: Opening = {
    id: makeId(cmd.kind),
    roomId: room.id,
    kind: cmd.kind,
    segmentIndex: cmd.segmentIndex,
    tCenter: cmd.tCenter,
    width: cmd.width,
    sillHeight: cmd.sillHeight,
    headHeight: cmd.headHeight,
  };
  st.data.openings.push(base);

  // Two-row shared-door convention: emit the mirror row for every OTHER
  // room sharing this wall segment, atomically in the same transaction.
  for (const other of st.data.rooms) {
    if (other.id === room.id) continue;
    for (let si = 0; si < other.polygon.length; si += 1) {
      const oseg = roomSegment(other, si);
      if (!oseg) continue;
      const rev = vertsCoincide(oseg.a, seg.b) && vertsCoincide(oseg.b, seg.a);
      const fwd = vertsCoincide(oseg.a, seg.a) && vertsCoincide(oseg.b, seg.b);
      if (!(rev || fwd)) continue;
      st.data.openings.push({
        ...base,
        id: makeId(cmd.kind),
        roomId: other.id,
        segmentIndex: si,
        tCenter: rev ? complementT(cmd.tCenter) : cmd.tCenter,
      });
    }
  }

  st.selectedId = base.id;
  return { ok: true };
}

function reduceMutateOpening(
  st: EditorState,
  openingId: string,
  fields: Partial<Pick<Opening, 'tCenter' | 'width' | 'sillHeight' | 'headHeight'>>,
  syncPair: boolean,
): DispatchResult {
  const target = st.data.openings.find((o) => o.id === openingId);
  if (!target) return { ok: false, error: `unknown opening "${openingId}"` };
  Object.assign(target, fields);
  if (syncPair) {
    const partner = findPartner(st.data, target);
    if (partner) {
      if ('tCenter' in fields) {
        const room = st.data.rooms.find((r) => r.id === target.roomId);
        const seg = room ? roomSegment(room, target.segmentIndex) : undefined;
        const proom = st.data.rooms.find((r) => r.id === partner.roomId);
        const pseg = proom ? roomSegment(proom, partner.segmentIndex) : undefined;
        const rev =
          !!seg && !!pseg && vertsCoincide(pseg.a, seg.b) && vertsCoincide(pseg.b, seg.a);
        partner.tCenter = rev ? complementT(fields.tCenter!) : fields.tCenter!;
      }
      for (const key of ['width', 'sillHeight', 'headHeight'] as const) {
        if (key in fields) partner[key] = fields[key]!;
      }
    }
  }
  return { ok: true };
}

function reduceDeleteOpening(
  st: EditorState,
  openingId: string,
  syncPair: boolean,
): DispatchResult {
  const target = st.data.openings.find((o) => o.id === openingId);
  if (!target) return { ok: false, error: `unknown opening "${openingId}"` };
  let ids = new Set([openingId]);
  if (syncPair) {
    const partner = findPartner(st.data, target);
    if (partner) ids = new Set([...ids, partner.id]);
  }
  st.data.openings = st.data.openings.filter((o) => !ids.has(o.id));
  if (st.selectedId !== null && ids.has(st.selectedId)) st.selectedId = null;
  return { ok: true };
}

function reduceAddFurniture(
  st: EditorState,
  cmd: Extract<Command, { type: 'addFurniture' }>,
): DispatchResult {
  if (!st.data.rooms.some((r) => r.id === cmd.roomId)) {
    return { ok: false, error: `unknown room "${cmd.roomId}"` };
  }
  st.data.furniture.push({
    id: makeId(cmd.itemType),
    type: cmd.itemType as never,
    roomId: cmd.roomId,
    position: [cmd.position[0], cmd.position[1]],
    rotationDeg: cmd.rotationDeg,
    footprint: [cmd.footprint[0], cmd.footprint[1]],
  });
  return { ok: true };
}

function findFurniture(
  st: EditorState,
  furnitureId: string,
):
  | { ok: true; item: { position: Pt; rotationDeg: number; footprint: Pt } & { id: string } }
  | { ok: false; error: string } {
  const item = st.data.furniture.find((f) => f.id === furnitureId);
  if (!item) return { ok: false, error: `unknown furniture "${furnitureId}"` };
  return { ok: true, item };
}

function reduceMoveFurniture(
  st: EditorState,
  furnitureId: string,
  position: Pt,
): DispatchResult {
  const found = findFurniture(st, furnitureId);
  if (!found.ok) return found;
  found.item.position = [position[0], position[1]];
  return { ok: true };
}

function reduceRotateFurniture(
  st: EditorState,
  furnitureId: string,
  rotationDeg: number,
): DispatchResult {
  const found = findFurniture(st, furnitureId);
  if (!found.ok) return found;
  found.item.rotationDeg = rotationDeg;
  return { ok: true };
}

function reduceResizeFurniture(
  st: EditorState,
  furnitureId: string,
  footprint: Pt,
): DispatchResult {
  const found = findFurniture(st, furnitureId);
  if (!found.ok) return found;
  found.item.footprint = [footprint[0], footprint[1]];
  return { ok: true };
}

function reduceDeleteFurniture(st: EditorState, furnitureId: string): DispatchResult {
  const idx = st.data.furniture.findIndex((f) => f.id === furnitureId);
  if (idx === -1) return { ok: false, error: `unknown furniture "${furnitureId}"` };
  st.data.furniture.splice(idx, 1);
  if (st.selectedId === furnitureId) st.selectedId = null;
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
   *
   * Gesture mode: only room-transform payloads stream (moveRoom /
   * resizeRoom) — pkg 3's furniture drags intentionally DON'T stream;
   * they commit one atomic judged command per pointerup.
   */
  dispatch(cmd: Command): DispatchResult {
    if (cmd.type === 'setSelection') {
      const selRes = reduceSetSelection(this._state, cmd);
      if (selRes.ok) this.notify();
      return selRes;
    }
    if (cmd.type === 'setEntitySelection') {
      const entSelRes = reduceSetEntitySelection(this._state, cmd.entityId);
      if (entSelRes.ok) this.notify();
      return entSelRes;
    }

    const snapshot =
      this._gestureBase !== null ? this._gestureBase : JSON.stringify(this._state.data);
    // During an active gesture, mutate WITHOUT stacking: the gesture's
    // single base snapshot is pushed once, at endGesture().
    if (this._gestureBase !== null) {
      const res =
        cmd.type === 'moveRoom'
          ? reduceMoveRoom(this._state, cmd)
          : cmd.type === 'resizeRoom'
            ? reduceResizeRoom(this._state, cmd)
            : cmd.type === 'moveFurniture'
              ? reduceMoveFurniture(this._state, cmd.furnitureId, cmd.position)
              : cmd.type === 'rotateFurniture'
                ? reduceRotateFurniture(this._state, cmd.furnitureId, cmd.rotationDeg)
                : (() => {
                    throw new Error(
                      `non-streamable command "${cmd.type}" inside gesture`,
                    );
                  })();
      if (!res.ok) return res;
      this.dirty = true;
      this.notify();
      return res;
    }

    const res = this.reduceAtomic(cmd);
    if (!res.ok) return res;

    this._undoStack.push(snapshot);
    if (this._undoStack.length > MAX_UNDO_DEPTH) this._undoStack.shift();
    this._redoStack = []; // invalidate redo on divergence
    this.dirty = true;
    this.notify();
    return res;
  }

  /** Route an atomic (committed, non-streamed) command through its reducer. */
  private reduceAtomic(
    cmd: Exclude<
      Command,
      { type: 'setSelection' } | { type: 'setEntitySelection' }
    >,
  ): DispatchResult {
    switch (cmd.type) {
      case 'drawRoom':
        return reduceDrawRoom(this._state, cmd);
      case 'moveRoom':
        return reduceMoveRoom(this._state, cmd);
      case 'resizeRoom':
        return reduceResizeRoom(this._state, cmd);
      case 'deleteRoom':
        return reduceDeleteRoom(this._state, cmd);
      /* ---- pkg 3 additions (issue #4) ---- */
      case 'addOpening':
        return reduceAddOpening(this._state, cmd);
      case 'moveOpening':
        return reduceMutateOpening(
          this._state,
          cmd.openingId,
          { tCenter: cmd.tCenter },
          cmd.syncPair === true,
        );
      case 'updateOpening':
        return reduceMutateOpening(this._state, cmd.openingId, cmd.fields, cmd.syncPair === true);
      case 'deleteOpening':
        return reduceDeleteOpening(this._state, cmd.openingId, cmd.syncPair === true);
      case 'addFurniture':
        return reduceAddFurniture(this._state, cmd);
      case 'moveFurniture':
        return reduceMoveFurniture(this._state, cmd.furnitureId, cmd.position);
      case 'rotateFurniture':
        return reduceRotateFurniture(this._state, cmd.furnitureId, cmd.rotationDeg);
      case 'resizeFurniture':
        return reduceResizeFurniture(this._state, cmd.furnitureId, cmd.footprint);
      case 'deleteFurniture':
        return reduceDeleteFurniture(this._state, cmd.furnitureId);
    }
  }

  /**
   * Batch consecutive mutations into ONE undo step (an ongoing pointer
   * drag streams moveRoom/resizeRoom frames). Call beginGesture() on
   * pointerdown and endGesture() on pointerup/cancel.
   */
  beginGesture(): void {
    if (this._gestureBase === null) this._gestureBase = JSON.stringify(this._state.data);
  }

  /**
   * Close a pointer gesture: collapse the whole gesture into ONE undo
   * step by pushing its base snapshot (captured at beginGesture) if the
   * gesture actually mutated anything.
   */
  endGesture(): void {
    const base = this._gestureBase;
    this._gestureBase = null;
    if (base === null) return;
    const current = JSON.stringify(this._state.data);
    if (current !== base) {
      this._undoStack.push(base);
      if (this._undoStack.length > MAX_UNDO_DEPTH) this._undoStack.shift();
      this._redoStack = [];
    }
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
      !this._state.data.rooms.some((r) => r.id === this._state.selectedId) &&
      !this._state.data.openings.some((o) => o.id === this._state.selectedId) &&
      !this._state.data.furniture.some((f) => f.id === this._state.selectedId)
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
