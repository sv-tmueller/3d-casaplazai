/**
 * EditorStore — a pure reducer over FloorplanData with snapshot-stack
 * undo/redo (cap 100, one step per committed pointer gesture) and a
 * dirty flag for the autosave debouncer.
 *
 * Extended by pkg 3 (issue #4): opening + furniture commands join the
 * same reducer/undo/autosave stream. Gesture-streamable commands carry
 * STREAMABLE_CMD payloads; everything else commits atomically.
 */
import type { FloorplanData, Floor, FloorTexture, Opening, Room, Staircase, Vec2 } from '../shared/schema';
import { FLOOR_TEXTURES, flatFurniture, flatOpenings, flatRooms } from '../shared/schema';
import { stairFootprint } from '../geom';
import { signedArea, vecAdd, vecEq } from './geom';
import type { UnderlayState } from './model/underlay';
import { PLAN_EXTENT_LIMIT_M } from './model/constants';
import {
  mirrorCounterparts,
  mirrorT,
  overlapHosts,
  pointAtT,
  roomSegments,
  sharedWallOverlap,
  type SegmentInfo,
} from './model/openings';

export type Pt = Vec2;

/**
 * Payload kinds eligible for intra-gesture streaming (no snapshot
 * spam). Furniture drags commit ONE atomic command per pointerup
 * (judgeMoveTarget verdict); ROOM drags stream moveRoom/resizeRoom and
 * pkg 3 (issue #61) OPENING drags stream moveOpening with syncPair so
 * the twin row follows in lockstep — all three stream via their
 * dedicated handlers in dispatch(). Everything else commits atomically.
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
  | { type: 'deleteFurniture'; furnitureId: string }
  /* -------- pkg 7.2 extensions (issue #75): floor commands -------- */
  /**
   * Switch the edited floor. NOT a mutating command: activeFloorIdx
   * lives outside `data`, so floor switches never enter undo history
   * (add/delete/rename DO snapshot, like any other mutation).
   */
  | { type: 'setActiveFloor'; index: number }
  /**
   * Append a floor above the current top storey: elevation =
   * max(elevation) + wallHeight + 0.3 (issue #69 §D — the stored number,
   * not a derived level×constant). Activates the new floor.
   */
  | { type: 'addFloor'; name?: string }
  /** Rename the ACTIVE floor (non-empty name required). */
  | { type: 'renameFloor'; name: string }
  /** Delete the ACTIVE floor; the sole floor is refused. */
  | { type: 'deleteFloor' }
  /* ---- pkg 8.1 additions (issue #83) ---- */
  /** Set one wall segment's roof lean (degrees, [0,75]); 0 REMOVES the row. */
  | { type: 'setWallLean'; roomId: string; segmentIndex: number; leanDeg: number }
  /** Remove one wall segment's lean row outright. */
  | { type: 'clearWallLean'; roomId: string; segmentIndex: number }
  /* ---- pkg 12.1 additions (issue #99): blueprint underlay ---- */
  /**
   * Replace (or, with null, DELETE) one floor's underlay slot. NON-
   * undoable by construction: the underlay is EDITOR state living
   * outside `data` (snap-settings lane, see model/underlay.ts) — undo
   * must NOT rewind image nudges/drags. Keyed by floor.id so each
   * storey traces its own blueprint.
   */
  | { type: 'setUnderlaySlot'; floorId: string; state: UnderlayState | null }
  /* ---- pkg 13.2 addition (issue #110): bulk marquee delete ---- */
  /**
   * Atomically delete MANY entities (marquee bulk-delete). ONE command,
   * ONE undo step: per-kind reducers are reused for validation +
   * mutation; unknown ids are skipped, an empty effective batch
   * refuses without snapshotting.
   */
  | { type: 'deleteEntities'; ids: string[] }

  /* ---- pkg 13.4 additions (issue #118): stairs editor ---- */
  /**
   * Place a staircase inside a known room. Deep geometric legality (gap
   * match, room containment, hole overlap) is validated by the CALLER on
   * a candidate plan copy via validateGeometry() — the glue commit path
   * and the inspector's guarded commits; this reducer keeps structural
   * sanity only (same split as the opening reducers).
   */
  | {
      type: 'addStair';
      roomId: string;
      position: Pt;
      rotationDeg: number;
      width: number;
      run: number;
      rise: number;
      stepCount: number;
    }
  /** Edit stair scalars; rotation re-orients the flight about its centre. */
  | {
      type: 'updateStair';
      stairId: string;
      fields: Partial<Pick<Staircase, 'rotationDeg' | 'width' | 'run' | 'rise' | 'stepCount'>>;
    }
  /** Flip the flight end-for-end (rotationDeg + 180 mod 360); centre stays. */
  | { type: 'flipStair'; stairId: string }
  /** Delete one staircase (stairs are leaves — nothing cascades off them). */
  | { type: 'deleteStair'; stairId: string }
  /* ---- pkg 14.4 addition (issue #119): floor-material picker ---- */
  /**
   * Set a room's floor material (null clears it). ORDINARY mutating
   * command — dispatch() snapshots like any other mutation, so each
   * pick is exactly one undo step. First writer of the dormant
   * Room.floorTexture field (drawRoom has hardcoded null since pkg 2).
   */
  | { type: 'setRoomFloorTexture'; roomId: string; texture: FloorTexture }
  /* ---- pkg #145 (issue #145): inspector room rename + plan wall settings ---- */
  /**
   * Rename a room; the name is trimmed and an empty result is rejected
   * (mirrors renameFloor). Ordinary mutating command — one undo step.
   */
  | { type: 'renameRoom'; roomId: string; name: string }
  /** Plan-global clear interior height (metres); UI bounds EDITOR_WALL_HEIGHT_*. */
  | { type: 'setWallHeight'; value: number }
  /** Plan-global wall thickness (metres); UI bounds EDITOR_WALL_THICKNESS_*. */
  | { type: 'setWallThickness'; value: number };

export type DispatchResult =
  | { ok: true }
  | { ok: false; error: string };

/* ------------------------------ State shape ------------------------------ */

export interface EditorState {
  data: FloorplanData;
  selectedId: string | null;
  /**
   * pkg 7.2 (issue #75): index into data.floors of the floor being
   * edited. Lives OUTSIDE `data` on purpose — undo snapshots stringify
   * `data` only, so floor SWITCHES never pollute history while
   * add/delete/rename floor snapshot as ordinary mutating commands.
   * Always read through activeFloor()/clampActiveFloorIdx().
   */
  activeFloorIdx: number;
  /**
   * pkg 12.1 (issue #99): per-floor blueprint underlays, keyed by
   * floor.id. Lives OUTSIDE `data` like activeFloorIdx — the underlay
   * is EDITOR state, never FloorplanData (share links omit it BY
   * CONSTRUCTION; persistence goes through the separate
   * casaplaza.underlay.v1 localStorage lane, see model/underlay.ts).
   * Access through underlayFor()/setUnderlaySlot only.
   */
  underlays: Record<string, UnderlayState>;
}

/**
 * Central clamp of activeFloorIdx. History can legally shrink floors[]
 * beneath the index (undo of deleteFloor, redo of addFloor), and an
 * unclamped index would corrupt every subsequent reducer — so every
 * entry point funnels through here.
 */
function clampActiveFloorIdx(st: EditorState): void {
  if (!Number.isInteger(st.activeFloorIdx) || st.activeFloorIdx < 0) {
    st.activeFloorIdx = 0;
  }
  if (st.activeFloorIdx >= st.data.floors.length) {
    st.activeFloorIdx = st.data.floors.length - 1;
  }
  // Selection reconciliation (reviewer #75): a selected entity that does
  // not live on the (new) active floor is a phantom — the UI would show
  // "selected: 1" with an enabled Delete that error-flashes on use.
  // Drop it, mirroring the dangling-selection drop undo already performs.
  if (st.selectedId !== null) {
    const fl = st.data.floors[st.activeFloorIdx];
    const onFloor =
      fl !== undefined &&
      (fl.rooms.some((r) => r.id === st.selectedId) ||
        fl.openings.some((o) => o.id === st.selectedId) ||
        fl.furniture.some((f) => f.id === st.selectedId) ||
        // pkg 13.4 (issue #118): stairs are PLAN-level (data.stairs) —
        // a selected stair counts as "on" this floor when its host
        // (departure) room lives here; leaving the departure floor
        // drops the selection like any other cross-floor phantom.
        st.data.stairs.some(
          (s) => s.id === st.selectedId && fl.rooms.some((r) => r.id === s.roomId),
        ));
    if (!onFloor) st.selectedId = null;
  }
}

/**
 * The ACTIVE floor of a plan (pkg 7.2): the storey addressed by
 * activeFloorIdx, never floors[0]. Callers must have clamped the state
 * first (dispatch/undo/redo/replaceAll do).
 */
function activeFloor(st: EditorState): Floor {
  return st.data.floors[st.activeFloorIdx];
}

/**
 * SINGLE-FLOOR VIEW of the plan: every entity of the plan replaced by
 * the active floor's collections. Editor read paths (drawing,
 * hit-testing, snapping, rendering) operate on this projection so a
 * multi-floor plan behaves exactly like a single-floor plan of the
 * active storey (pkg 7.2 retarget; export.ts keeps full-plan scope).
 */
export function activeFloorPlan(st: EditorState): FloorplanData {
  const fl = activeFloor(st);
  return {
    ...st.data,
    floors: [
      { ...fl, rooms: fl.rooms.slice(), openings: fl.openings.slice(), furniture: fl.furniture.slice() },
    ],
  };
}

export function emptyPlan(): FloorplanData {
  return {
    schemaVersion: 2,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    floors: [
      {
        id: 'floor-ground',
        name: 'Ground',
        elevation: 0,
        rooms: [],
        openings: [],
        furniture: [],
      },
    ],
    stairs: [],
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
    name: cmd.name != null && cmd.name.trim() !== '' ? cmd.name : `Room ${activeFloor(st).rooms.length + 1}`,
    polygon: ccw,
    floorTexture: null,
  };
  activeFloor(st).rooms.push(room);
  return { ok: true };
}

/*
 * Issue #139 (stranding guard): a room transform must not move/reshape a
 * host room out from under its stair. The stranded flight fails the next
 * compile with UnknownStairRoomError/containment violations and NO inline
 * rejection — the delete paths got the cascade fix; transforms get the
 * REJECT posture instead (mirroring the #107 sane-extent guard): the
 * reducer refuses the frame, the drag keeps the last valid pose, and the
 * Result plumbing surfaces the reason (typed inspector fields flash
 * res.error; streamed drag frames simply hold position). Containment is
 * the SAME corner-projection test validateStairs() runs (convex-room
 * assumption documented there), evaluated on the POST-transform polygon.
 */
function stairEscapedRoom(
  stair: Staircase,
  roomPolygon: Vec2[],
): boolean {
  const fp = stairFootprint(stair);
  const corners: Array<[number, number]> = [
    [-fp.halfRun, -fp.halfWidth],
    [fp.halfRun, -fp.halfWidth],
    [fp.halfRun, fp.halfWidth],
    [-fp.halfRun, fp.halfWidth],
  ].map(([l, w]) => [
    fp.cx + fp.ux * l + fp.vx * w,
    fp.cy + fp.uy * l + fp.vy * w,
  ]);
  // Convex CCW polygon: a point is inside iff it is never strictly on
  // the OUTER side of any edge (cross < -EPSILON — the same tolerance
  // validateStairs() uses).
  for (let i = 0; i < roomPolygon.length; i += 1) {
    const a = roomPolygon[i];
    const b = roomPolygon[(i + 1) % roomPolygon.length];
    for (const [cx, cy] of corners) {
      const cross = (b[0] - a[0]) * (cy - a[1]) - (b[1] - a[1]) * (cx - a[0]);
      if (cross < -1e-9) return true;
    }
  }
  return false;
}

function reduceMoveRoom(st: EditorState, cmd: { roomId: string; delta: Pt }): DispatchResult {
  const room = flatRooms(st.data).find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  // Issue #139: reject the frame when a hosted stair would end up
  // outside the translated polygon (strand guard — see stairEscapedRoom).
  const moved = room.polygon.map((p) => vecAdd(p, cmd.delta));
  for (const stair of st.data.stairs.filter((s) => s.roomId === cmd.roomId)) {
    if (stairEscapedRoom(stair, moved)) {
      return {
        ok: false,
        error: 'moving this room would strand its staircase — move the stair first or delete it',
      };
    }
  }
  room.polygon = moved;
  return { ok: true };
}

function reduceResizeRoom(
  st: EditorState,
  cmd: { roomId: string; vertexIndex: number; newPos: Pt },
): DispatchResult {
  const room = flatRooms(st.data).find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  if (cmd.vertexIndex < 0 || cmd.vertexIndex >= room.polygon.length) {
    return { ok: false, error: `vertexIndex ${cmd.vertexIndex} out of range` };
  }
  // Issue #107: shared sane-extent guard. Both commit paths (typed
  // inspector fields AND drag frames) funnel into this reducer, so the
  // bound here rejects both IDENTICALLY by construction — no per-path
  // code. REJECT, not clamp: clamping a typed 99999 to 1000 would
  // silently lie about the geometry; rejection rides the existing
  // Result plumbing (typed path flashes res.error, drag keeps the old
  // vertex) and stays undo-rescuable. Inclusive at the limit.
  if (
    Math.abs(cmd.newPos[0]) > PLAN_EXTENT_LIMIT_M ||
    Math.abs(cmd.newPos[1]) > PLAN_EXTENT_LIMIT_M
  ) {
    return { ok: false, error: 'vertex beyond plan extent limit' };
  }
  // Issue #139: reject the frame when a hosted stair would end up
  // outside the reshaped polygon (strand guard — see stairEscapedRoom).
  const reshaped = room.polygon.map((p, i) =>
    i === cmd.vertexIndex ? ([cmd.newPos[0], cmd.newPos[1]] as Vec2) : p,
  );
  for (const stair of st.data.stairs.filter((s) => s.roomId === cmd.roomId)) {
    if (stairEscapedRoom(stair, reshaped)) {
      return {
        ok: false,
        error: 'resizing this wall would strand its staircase — move the stair first or delete it',
      };
    }
  }
  room.polygon[cmd.vertexIndex] = [cmd.newPos[0], cmd.newPos[1]];
  return { ok: true };
}

function reduceDeleteRoom(st: EditorState, cmd: { roomId: string }): DispatchResult {
  const floor = activeFloor(st);
  const idx = floor.rooms.findIndex((r) => r.id === cmd.roomId);
  if (idx === -1) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  floor.rooms.splice(idx, 1);
  // Cascade-remove any openings/furniture anchored to the deleted room.
  floor.openings = floor.openings.filter((o: Opening) => o.roomId !== cmd.roomId);
  floor.furniture = floor.furniture.filter((f) => f.roomId !== cmd.roomId);
  // pkg 13.4 (issue #118): stairs anchor to their host (departure) room
  // via roomId — a stranded row throws UnknownStairRoomError at the next
  // compile, so the cascade purges them HERE (fix the class, not the
  // site: every room-removing path routes through this reducer).
  st.data.stairs = st.data.stairs.filter((s) => s.roomId !== cmd.roomId);
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
    flatRooms(st.data).some((r) => r.id === entityId) ||
    flatOpenings(st.data).some((o) => o.id === entityId) ||
    flatFurniture(st.data).some((f) => f.id === entityId) ||
    // pkg 13.4 (issue #118): stairs are plan-level entities too — the
    // click-select path addresses them through this same command.
    st.data.stairs.some((s) => s.id === entityId);
  if (!known) return { ok: false, error: `unknown entity "${entityId}"` };
  st.selectedId = entityId;
  return { ok: true };
}

function reduceSetSelection(st: EditorState, cmd: { roomId: string | null }): DispatchResult {
  if (cmd.roomId !== null && !flatRooms(st.data).some((r) => r.id === cmd.roomId)) {
    return { ok: false, error: `unknown room "${cmd.roomId}"` };
  }
  st.selectedId = cmd.roomId;
  return { ok: true };
}

/* --------------------- pkg 3 reducer internals (issue #4) ------------------ */

/**
 * Tolerant geometric predicate for shared-wall pairing (issues #36/#41):
 * a candidate segment pairs with the host when it is COLLINEAR within
 * PAIR_TOLERANCE_M (perpendicular distance from the host's line — a wall
 * drawn a few millimeters off still pairs) AND the collinear overlap
 * hosts the cutout. Complement-only mirroring is replaced by PROJECTION
 * of the door's world point onto the partner segment, which handles
 * staggered (partially overlapping, different-length) walls and both
 * traversal directions. Returns the mirror tCenter, or null when the
 * partner cannot host this cut (honest single-cut).
 */
function pairMirrorT(
  seg: SegmentInfo,
  cand: SegmentInfo,
  tCenter: number,
  width: number,
): number | null {
  const ov = sharedWallOverlap(seg, cand);
  if (!ov) return null;
  const half = width / 2;
  const cutLo = tCenter * seg.length - half;
  const cutHi = tCenter * seg.length + half;
  if (!overlapHosts(ov, cutLo, cutHi)) return null;
  return mirrorT(pointAtT(seg, tCenter), cand);
}

/** SegmentInfo view of one room segment (length included), or undefined. */
function segInfo(room: Room, segmentIndex: number): SegmentInfo | undefined {
  return roomSegments(room)[segmentIndex];
}

/**
 * Find the paired twin of an opening: another opening of the SAME KIND
 * whose room holds a collinear-overlapping copy of this wall segment
 * able to host the same cutout. Structural (geometry-based) so it agrees
 * with the model layer's derivePairRows()/groupedPairs().
 */
function findPartner(plan: FloorplanData, opening: Opening): Opening | undefined {
  const rooms = flatRooms(plan);
  const room = rooms.find((r) => r.id === opening.roomId);
  const seg = room ? segInfo(room, opening.segmentIndex) : undefined;
  if (!room || !seg) return undefined;
  return flatOpenings(plan).find((o) => {
    if (o.id === opening.id || o.kind !== opening.kind) return false;
    const oroom = rooms.find((r) => r.id === o.roomId);
    if (!oroom) return false;
    const oseg = segInfo(oroom, o.segmentIndex);
    if (!oseg) return false;
    return pairMirrorT(seg, oseg, opening.tCenter, opening.width) !== null;
  });
}

function reduceAddOpening(
  st: EditorState,
  cmd: Extract<Command, { type: 'addOpening' }>,
): DispatchResult {
  const room = flatRooms(st.data).find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  const seg = segInfo(room, cmd.segmentIndex);
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
  activeFloor(st).openings.push(base);

  // Two-row shared-door convention: emit the honest mirror set (issue
  // #40 — mirrorCounterparts: opposite-sided across the overlap,
  // interior-deep enough to host a doorway, nearest counterpart per
  // room, overlapping-room impostors purged), atomically in the same
  // transaction (issue #41: pairing is overlap-based, the mirror
  // tCenter comes from projecting the door's world point onto that
  // partner segment). Model layer and store share the ONE routine.
  for (const m of mirrorCounterparts(st.data, room.id, seg, cmd.tCenter, cmd.width)) {
    activeFloor(st).openings.push({
      ...base,
      id: makeId(cmd.kind),
      roomId: m.roomId,
      segmentIndex: m.segmentIndex,
      tCenter: m.t,
    });
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
  const target = flatOpenings(st.data).find((o) => o.id === openingId);
  if (!target) return { ok: false, error: `unknown opening "${openingId}"` };
  // Width-path semantics (issue #47, ratified on #44): FREEZE. The
  // fields are assigned BEFORE findPartner runs, and the partner search
  // re-runs pairMirrorT with the NEW width — so widening a cut beyond the
  // partner's collinear overlap finds NO partner and copies NOTHING to the
  // twin (which keeps its old width). The pair implicitly UNLINKS: a later
  // move/delete of this cut no longer cascades to the twin. Narrowing back
  // into the overlap re-syncs (findPartner matches again). This silent
  // desync is intentional; specs pin it (tests/unit/tolerance-hygiene.spec.ts).
  Object.assign(target, fields);
  if (syncPair) {
    const partner = findPartner(st.data, target);
    if (partner) {
      if ('tCenter' in fields) {
        const room = flatRooms(st.data).find((r) => r.id === target.roomId);
        const seg = room ? segInfo(room, target.segmentIndex) : undefined;
        const proom = flatRooms(st.data).find((r) => r.id === partner.roomId);
        const pseg = proom ? segInfo(proom, partner.segmentIndex) : undefined;
        const t =
          seg && pseg
            ? pairMirrorT(seg, pseg, target.tCenter, target.width)
            : null;
        // Keep the partner put when the moved cut no longer fits the
        // partner's overlap (honest single-cut wins over a bogus pair).
        if (t !== null) partner.tCenter = t;
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
  const target = flatOpenings(st.data).find((o) => o.id === openingId);
  if (!target) return { ok: false, error: `unknown opening "${openingId}"` };
  let ids = new Set([openingId]);
  if (syncPair) {
    const partner = findPartner(st.data, target);
    if (partner) ids = new Set([...ids, partner.id]);
  }
  const floor = activeFloor(st);
  floor.openings = floor.openings.filter((o) => !ids.has(o.id));
  if (st.selectedId !== null && ids.has(st.selectedId)) st.selectedId = null;
  return { ok: true };
}

function reduceAddFurniture(
  st: EditorState,
  cmd: Extract<Command, { type: 'addFurniture' }>,
): DispatchResult {
  if (!flatRooms(st.data).some((r) => r.id === cmd.roomId)) {
    return { ok: false, error: `unknown room "${cmd.roomId}"` };
  }
  activeFloor(st).furniture.push({
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
  const item = flatFurniture(st.data).find((f) => f.id === furnitureId);
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
  const floor = activeFloor(st);
  const idx = floor.furniture.findIndex((f) => f.id === furnitureId);
  if (idx === -1) return { ok: false, error: `unknown furniture "${furnitureId}"` };
  floor.furniture.splice(idx, 1);
  if (st.selectedId === furnitureId) st.selectedId = null;
  return { ok: true };
}

/* -------------------- pkg 7.2 floor reducers (issue #75) ------------------- */

/**
 * Extra clearance layered on top of the wall height when suggesting the
 * next storey's elevation (issue #69 §D: "+3m" resolves to 2.7+0.3).
 */
const FLOOR_GAP_M = 0.3;

/**
 * Elevation the next addFloor would mint: max(elevation) + wallHeight +
 * FLOOR_GAP_M (issue #69 §D). Exported so the stairs tool can derive the
 * arrival rise / preview a pending storey WITHOUT duplicating the
 * formula — a hand-defaulted 2.7 m rise would fail StairGapMismatchError
 * against the real 3.0 m storey pitch (derive, never default).
 */
export function nextFloorElevation(plan: FloorplanData): number {
  const top = plan.floors.reduce((m, f) => Math.max(m, f.elevation), 0);
  return top + plan.wallHeight + FLOOR_GAP_M;
}

function reduceSetActiveFloor(st: EditorState, index: number): DispatchResult {
  if (!Number.isInteger(index) || index < 0 || index >= st.data.floors.length) {
    return { ok: false, error: `floor index ${index} out of range` };
  }
  st.activeFloorIdx = index;
  return { ok: true };
}

function reduceAddFloor(st: EditorState, cmd: { name?: string }): DispatchResult {
  // Trim like renameFloor does, so " Loft " == "Loft".
  const wanted = cmd.name?.trim();
  // Issue #94: derive the sequential name from the highest EXISTING
  // "Floor N" suffix, not floors.length+1 alone — deleting the middle
  // storey of [Ground, Floor 2, Floor 3] leaves [Ground, Floor 3],
  // where naive length+1 (= 3) would mint a DUPLICATE "Floor 3". The
  // floors.length leg keeps the HISTORICAL numbering intact (ground is
  // "Ground", so the second storey has always been "Floor 2"); renamed
  // floors simply don't match the pattern and don't lower the ceiling.
  let maxSuffix = 0;
  for (const f of st.data.floors) {
    const m = /^Floor (\d+)$/.exec(f.name);
    if (m) maxSuffix = Math.max(maxSuffix, Number(m[1]));
  }
  const floor: Floor = {
    id: makeId('floor'),
    // Sequential display name ("Floor 2" for storey #2, etc.);
    // explicit names win when non-empty.
    name: wanted ? wanted : `Floor ${Math.max(maxSuffix, st.data.floors.length) + 1}`,
    elevation: nextFloorElevation(st.data),
    rooms: [],
    openings: [],
    furniture: [],
  };
  st.data.floors.push(floor);
  st.activeFloorIdx = st.data.floors.length - 1;
  return { ok: true };
}

function reduceRenameFloor(st: EditorState, cmd: { name: string }): DispatchResult {
  const name = cmd.name.trim();
  if (name === '') return { ok: false, error: 'floor name cannot be empty' };
  activeFloor(st).name = name;
  return { ok: true };
}

function reduceDeleteFloor(st: EditorState): DispatchResult {
  if (st.data.floors.length <= 1) {
    return { ok: false, error: 'cannot delete the only floor' };
  }
  const doomed = st.data.floors[st.activeFloorIdx];
  const doomedRooms = new Set(doomed.rooms.map((r) => r.id));
  const doomedElevation = doomed.elevation;
  st.data.floors.splice(st.activeFloorIdx, 1);
  // pkg 13.4 (issue #118): stairs are PLAN-level — purge every flight the
  // removed storey strands: departing from one of its rooms, or arriving
  // at its elevation (a survivor's rise would then match no floor).
  st.data.stairs = st.data.stairs.filter(
    (s) => !stairStrandedByFloor(st.data, s, doomedRooms, doomedElevation),
  );
  clampActiveFloorIdx(st);
  return { ok: true };
}

/** Elevation of the floor hosting a room, or null when the room is gone. */
function roomElevation(data: FloorplanData, roomId: string): number | null {
  for (const floor of data.floors) {
    if (floor.rooms.some((r) => r.id === roomId)) return floor.elevation;
  }
  return null;
}

/**
 * pkg 13.4 (issue #118): true when the removed storey leaves this stair
 * standing on nothing — its host room departed that storey, the host room
 * is already gone (defensive: dangling), or its arrival elevation
 * (departure + rise) was that storey's walking level. Mirrors
 * validateStairs' 1 mm gap tolerance so store-side purges and compile-side
 * rejections speak one language.
 */
function stairStrandedByFloor(
  data: FloorplanData,
  stair: Staircase,
  doomedRooms: ReadonlySet<string>,
  doomedElevation: number,
): boolean {
  if (doomedRooms.has(stair.roomId)) return true;
  const departure = roomElevation(data, stair.roomId);
  if (departure === null) return true;
  return Math.abs(departure + stair.rise - doomedElevation) <= 1e-3;
}

/* ------------- pkg 14.4 floor-material picker (issue #119) ----------------- */

/**
 * Assign a room's floor material. Dispatch is the only caller path; the
 * enum is mirrored from the schema barrel so the store never emits a
 * plan its own validator would reject at the door (belt + suspenders).
 */
function reduceSetRoomFloorTexture(
  st: EditorState,
  cmd: { roomId: string; texture: FloorTexture },
): DispatchResult {
  const room = activeFloor(st).rooms.find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  // Runtime guard for non-TS callers (bridge/console): FLOOR_TEXTURES is
  // the single source of truth for what a texture value may be.
  if (cmd.texture !== null && !FLOOR_TEXTURES.includes(cmd.texture)) {
    return { ok: false, error: `unknown floor texture "${String(cmd.texture)}"` };
  }
  room.floorTexture = cmd.texture;
  return { ok: true };
}

/* ------- pkg #145 (issue #145): room rename + plan wall settings -------- */

/**
 * Inclusive UI bounds for the plan-global wall settings. The schema
 * validator only demands positive finite numbers (validate.ts), so every
 * value the inspector admits is validatable by construction; the bounds
 * keep the panel inside the range the editor can meaningfully express.
 */
export const EDITOR_WALL_HEIGHT_MIN = 2.0;
export const EDITOR_WALL_HEIGHT_MAX = 6.0;
export const EDITOR_WALL_THICKNESS_MIN = 0.05;
export const EDITOR_WALL_THICKNESS_MAX = 0.6;

function reduceRenameRoom(
  st: EditorState,
  cmd: { roomId: string; name: string },
): DispatchResult {
  const room = activeFloor(st).rooms.find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  const name = cmd.name.trim();
  if (name === '') return { ok: false, error: 'room name cannot be empty' };
  room.name = name;
  return { ok: true };
}

function reduceSetWallHeight(st: EditorState, cmd: { value: number }): DispatchResult {
  if (
    !Number.isFinite(cmd.value) ||
    cmd.value < EDITOR_WALL_HEIGHT_MIN ||
    cmd.value > EDITOR_WALL_HEIGHT_MAX
  ) {
    return {
      ok: false,
      error: `wall height must lie in [${EDITOR_WALL_HEIGHT_MIN}, ${EDITOR_WALL_HEIGHT_MAX}]`,
    };
  }
  st.data.wallHeight = cmd.value;
  return { ok: true };
}

function reduceSetWallThickness(st: EditorState, cmd: { value: number }): DispatchResult {
  if (
    !Number.isFinite(cmd.value) ||
    cmd.value < EDITOR_WALL_THICKNESS_MIN ||
    cmd.value > EDITOR_WALL_THICKNESS_MAX
  ) {
    return {
      ok: false,
      error: `wall thickness must lie in [${EDITOR_WALL_THICKNESS_MIN}, ${EDITOR_WALL_THICKNESS_MAX}]`,
    };
  }
  st.data.wallThickness = cmd.value;
  return { ok: true };
}

/* ------------------- pkg 8.1 roof reducers (issue #83) -------------------- */

/** Maximum lean from horizontal the editor will express, degrees. */
export const ROOF_MAX_LEAN_EDITOR_DEG = 75;

function reduceSetWallLean(
  st: EditorState,
  cmd: { roomId: string; segmentIndex: number; leanDeg: number },
): DispatchResult {
  // Roofs are only legal on the TOPMOST floor (schema validator rule);
  // refusing here keeps the store from ever emitting an invalid plan.
  if (st.activeFloorIdx !== st.data.floors.length - 1) {
    return { ok: false, error: 'roofs may only be set on the topmost floor' };
  }
  const room = activeFloor(st).rooms.find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  if (
    !Number.isInteger(cmd.segmentIndex) ||
    cmd.segmentIndex < 0 ||
    cmd.segmentIndex >= room.polygon.length
  ) {
    return { ok: false, error: `segmentIndex ${cmd.segmentIndex} out of range` };
  }
  if (!Number.isFinite(cmd.leanDeg) || cmd.leanDeg < 0 || cmd.leanDeg > ROOF_MAX_LEAN_EDITOR_DEG) {
    return { ok: false, error: `leanDeg must lie in [0, ${ROOF_MAX_LEAN_EDITOR_DEG}]` };
  }
  const rows = room.roofs ?? [];
  const existing = rows.find((row) => row.segmentIndex === cmd.segmentIndex);
  // A lean of 0 CONTRIBUTES NOTHING (flat parapet) — clearWallLean's
  // territory; storing a 0 row would be dead data the exporter would
  // faithfully persist.
  if (cmd.leanDeg === 0) {
    if (existing) {
      room.roofs = rows.filter((row) => row.segmentIndex !== cmd.segmentIndex);
    }
    return { ok: true };
  }
  if (existing) {
    existing.leanDeg = cmd.leanDeg;
  } else {
    room.roofs = [...rows, { segmentIndex: cmd.segmentIndex, leanDeg: cmd.leanDeg }];
  }
  return { ok: true };
}

function reduceClearWallLean(
  st: EditorState,
  cmd: { roomId: string; segmentIndex: number },
): DispatchResult {
  const room = activeFloor(st).rooms.find((r) => r.id === cmd.roomId);
  if (!room) return { ok: false, error: `unknown room "${cmd.roomId}"` };
  const rows = room.roofs ?? [];
  if (!rows.some((row) => row.segmentIndex === cmd.segmentIndex)) {
    return { ok: false, error: `segment ${cmd.segmentIndex} carries no lean` };
  }
  room.roofs = rows.filter((row) => row.segmentIndex !== cmd.segmentIndex);
  return { ok: true };
}

/* ------------- pkg 13.2 bulk delete (issue #110) ----------------------- */

/**
 * Atomically delete MANY entities (rooms, openings, furniture - any mix).
 * Routes EACH id through its per-kind reducer (reuse = same validation +
 * cascade semantics as the single-delete commands) but commits as ONE
 * command / ONE undo step: dispatch() snapshots once around the whole
 * batch. Unknown ids are SKIPPED (bulk selection races a concurrent
 * delete gracefully); an empty EFFECTIVE batch (nothing recognized)
 * refuses so no junk snapshot enters history. selectedId drops when it
 * was among the deleted ids (extended reconciliation, SUB_PLAN step 2).
 */
function reduceDeleteEntities(st: EditorState, cmd: { ids: string[] }): DispatchResult {
  if (cmd.ids.length === 0) return { ok: false, error: 'no entities to delete' };
  const idSet = new Set(cmd.ids);
  const floor = activeFloor(st);
  let acted = 0;

  for (const id of idSet) {
    if (floor.rooms.some((r) => r.id === id)) {
      const res = reduceDeleteRoom(st, { roomId: id });
      if (res.ok) acted += 1;
    } else if (floor.openings.some((o) => o.id === id)) {
      // syncPair mirrors the single-delete route (glue deletes doors with
      // their pair): a marquee-deleted door takes its partner along,
      // keeping shared-wall cutouts consistent.
      const res = reduceDeleteOpening(st, id, true);
      if (res.ok) acted += 1;
    } else if (floor.furniture.some((f) => f.id === id)) {
      const res = reduceDeleteFurniture(st, id);
      if (res.ok) acted += 1;
    } else if (st.data.stairs.some((s) => s.id === id)) {
      // pkg 13.4 (issue #118): stairs join the marquee set (rect-simple
      // hit test) — bulk delete routes them like any other kind.
      const res = reduceDeleteStair(st, { stairId: id });
      if (res.ok) acted += 1;
    }
    // Unknown id: skipped (selection raced a delete; not an error).
  }

  if (acted === 0) return { ok: false, error: 'no deletable entities in batch' };
  // Single-selection reconciliation: purge the deleted ids AND anything a
  // room cascade took with it (furniture/openings anchored to a deleted
  // room vanish without appearing in `ids` — selectedId must not dangle).
  if (
    st.selectedId !== null &&
    (idSet.has(st.selectedId) ||
      !(
        floor.rooms.some((r) => r.id === st.selectedId) ||
        floor.openings.some((o) => o.id === st.selectedId) ||
        floor.furniture.some((f) => f.id === st.selectedId) ||
        st.data.stairs.some((s) => s.id === st.selectedId)
      ))
  ) {
    st.selectedId = null;
  }
  return { ok: true };
}

/* ---------------- pkg 13.4 stair reducers (issue #118) ------------------ */

/** Minimum step count the schema accepts (mirrors the validator rule). */
const MIN_STAIR_STEPS = 3;

function findStair(
  st: EditorState,
  stairId: string,
): { ok: true; stair: Staircase } | { ok: false; error: string } {
  const stair = st.data.stairs.find((s) => s.id === stairId);
  if (!stair) return { ok: false, error: `unknown stair "${stairId}"` };
  return { ok: true, stair };
}

/**
 * Structural sanity for the stair scalars (deep geometry — gap match,
 * containment, hole overlap — belongs to validateGeometry() on the commit
 * paths). Returns an error message, or null when every present field is
 * sane. Mirrors the schema's shallow rules so the store can never mint a
 * plan the schema would reject.
 */
function stairScalarError(fields: {
  width?: number;
  run?: number;
  rise?: number;
  stepCount?: number;
}): string | null {
  if (fields.width !== undefined && (!Number.isFinite(fields.width) || fields.width <= 0)) {
    return 'stair width must be greater than zero';
  }
  if (fields.run !== undefined && (!Number.isFinite(fields.run) || fields.run <= 0)) {
    return 'stair run must be greater than zero';
  }
  if (fields.rise !== undefined && (!Number.isFinite(fields.rise) || fields.rise <= 0)) {
    return 'stair rise must be greater than zero';
  }
  if (
    fields.stepCount !== undefined &&
    (!Number.isInteger(fields.stepCount) || fields.stepCount < MIN_STAIR_STEPS)
  ) {
    return `stair stepCount must be an integer >= ${MIN_STAIR_STEPS}`;
  }
  return null;
}

function reduceAddStair(
  st: EditorState,
  cmd: Extract<Command, { type: 'addStair' }>,
): DispatchResult {
  if (!flatRooms(st.data).some((r) => r.id === cmd.roomId)) {
    return { ok: false, error: `unknown room "${cmd.roomId}"` };
  }
  const scalarErr = stairScalarError(cmd);
  if (scalarErr !== null) return { ok: false, error: scalarErr };
  if (
    !Number.isFinite(cmd.position[0]) ||
    !Number.isFinite(cmd.position[1]) ||
    !Number.isFinite(cmd.rotationDeg)
  ) {
    return { ok: false, error: 'stair pose must be finite' };
  }
  const stair: Staircase = {
    id: makeId('stair'),
    roomId: cmd.roomId,
    position: [cmd.position[0], cmd.position[1]],
    rotationDeg: cmd.rotationDeg,
    width: cmd.width,
    run: cmd.run,
    rise: cmd.rise,
    stepCount: cmd.stepCount,
  };
  st.data.stairs.push(stair);
  // Selection lands on the fresh flight (addOpening precedent) so the
  // inspector immediately shows its fields.
  st.selectedId = stair.id;
  return { ok: true };
}

function reduceUpdateStair(
  st: EditorState,
  cmd: Extract<Command, { type: 'updateStair' }>,
): DispatchResult {
  const found = findStair(st, cmd.stairId);
  if (!found.ok) return found;
  const scalarErr = stairScalarError(cmd.fields);
  if (scalarErr !== null) return { ok: false, error: scalarErr };
  if (cmd.fields.rotationDeg !== undefined && !Number.isFinite(cmd.fields.rotationDeg)) {
    return { ok: false, error: 'stair rotation must be a finite number' };
  }
  Object.assign(found.stair, cmd.fields);
  return { ok: true };
}

function reduceFlipStair(
  st: EditorState,
  cmd: { stairId: string },
): DispatchResult {
  const found = findStair(st, cmd.stairId);
  if (!found.ok) return found;
  // Pure data op: +180° mod 360. The footprint CENTRE is unchanged (the
  // rotated rect maps onto itself); only the uphill axis reverses.
  found.stair.rotationDeg = (((found.stair.rotationDeg + 180) % 360) + 360) % 360;
  return { ok: true };
}

function reduceDeleteStair(
  st: EditorState,
  cmd: { stairId: string },
): DispatchResult {
  const idx = st.data.stairs.findIndex((s) => s.id === cmd.stairId);
  if (idx === -1) return { ok: false, error: `unknown stair "${cmd.stairId}"` };
  st.data.stairs.splice(idx, 1);
  if (st.selectedId === cmd.stairId) st.selectedId = null;
  return { ok: true };
}

/* ---------------- pkg 12.1 underlay slice (issue #99) ------------------- */

/**
 * Underlay of the ACTIVE floor (null when none). Clamp mirrors
 * activeFloor()'s defensive posture: an out-of-range index reads as
 * floor 0 rather than throwing.
 */
export function underlayFor(st: EditorState): UnderlayState | null {
  const idx = Math.min(
    Math.max(st.activeFloorIdx, 0),
    st.data.floors.length - 1,
  );
  const floor = st.data.floors[idx];
  return floor ? (st.underlays[floor.id] ?? null) : null;
}

function reduceSetUnderlaySlot(
  st: EditorState,
  cmd: { floorId: string; state: UnderlayState | null },
): DispatchResult {
  if (!st.data.floors.some((f) => f.id === cmd.floorId)) {
    return { ok: false, error: `unknown floor "${cmd.floorId}"` };
  }
  if (cmd.state === null) {
    delete st.underlays[cmd.floorId];
  } else {
    st.underlays[cmd.floorId] = cmd.state;
  }
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
    this._state = {
      data: clone(initial),
      selectedId: null,
      activeFloorIdx: 0,
      underlays: {},
    };
  }

  /**
   * pkg 12.1 (issue #99): hydrate persisted underlays (boot, and after
   * a plan import wiped the slots). Rows failing parseUnderlayState
   * were already dropped by the loader; this trusts its caller.
   */
  hydrateUnderlays(map: Record<string, UnderlayState>): void {
    this._state = { ...this._state, underlays: { ...map } };
    this.notify();
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
   *
   * pkg 7.2: setActiveFloor is selection-like (mutates state OUTSIDE
   * `data`, never snapshots, never dirties the plan).
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
    if (cmd.type === 'setActiveFloor') {
      const flRes = reduceSetActiveFloor(this._state, cmd.index);
      if (flRes.ok) this.notify();
      return flRes;
    }
    // pkg 12.1 (issue #99): underlay writes bypass history entirely —
    // the slice lives outside `data`, so undo must never rewind them
    // (mirrors the activeFloorIdx exclusion).
    if (cmd.type === 'setUnderlaySlot') {
      const ulRes = reduceSetUnderlaySlot(this._state, cmd);
      if (ulRes.ok) this.notify();
      return ulRes;
    }
    clampActiveFloorIdx(this._state);

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
                : cmd.type === 'moveOpening'
                  ? reduceMutateOpening(
                      this._state,
                      cmd.openingId,
                      { tCenter: cmd.tCenter },
                      cmd.syncPair === true,
                    )
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
      | { type: 'setSelection' }
      | { type: 'setEntitySelection' }
      | { type: 'setActiveFloor' }
      | { type: 'setUnderlaySlot' }
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
      /* ---- pkg 7.2 additions (issue #75) ---- */
      case 'addFloor':
        return reduceAddFloor(this._state, cmd);
      case 'renameFloor':
        return reduceRenameFloor(this._state, cmd);
      case 'deleteFloor':
        return reduceDeleteFloor(this._state);
      case 'setWallLean':
        return reduceSetWallLean(this._state, cmd);
      case 'clearWallLean':
        return reduceClearWallLean(this._state, cmd);
      /* ---- pkg 13.2 addition (issue #110) ---- */
      case 'deleteEntities':
        return reduceDeleteEntities(this._state, cmd);
      /* ---- pkg 13.4 additions (issue #118) ---- */
      case 'addStair':
        return reduceAddStair(this._state, cmd);
      case 'updateStair':
        return reduceUpdateStair(this._state, cmd);
      case 'flipStair':
        return reduceFlipStair(this._state, cmd);
      case 'deleteStair':
        return reduceDeleteStair(this._state, cmd);
      /* ---- pkg 14.4 addition (issue #119) ---- */
      case 'setRoomFloorTexture':
        return reduceSetRoomFloorTexture(this._state, cmd);
      /* ---- pkg #145 (issue #145) additions ---- */
      case 'renameRoom':
        return reduceRenameRoom(this._state, cmd);
      case 'setWallHeight':
        return reduceSetWallHeight(this._state, cmd);
      case 'setWallThickness':
        return reduceSetWallThickness(this._state, cmd);
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
    // pkg 7.2: undo of deleteFloor can shrink floors[] beneath the
    // index (and undo of addFloor grows it back) — clamp centrally.
    clampActiveFloorIdx(this._state);
    // Selection may reference a room undone away — drop it if dangling.
    if (
      this._state.selectedId !== null &&
      !flatRooms(this._state.data).some((r) => r.id === this._state.selectedId) &&
      !flatOpenings(this._state.data).some((o) => o.id === this._state.selectedId) &&
      !flatFurniture(this._state.data).some((f) => f.id === this._state.selectedId) &&
      !this._state.data.stairs.some((s) => s.id === this._state.selectedId)
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
    // pkg 7.2: mirrored clamp (redo of deleteFloor shrinks floors[]).
    clampActiveFloorIdx(this._state);
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
    // pkg 12.1 (issue #99): the underlay slice is EDITOR state, not
    // plan data — a wholesale plan swap KEEPS the per-floor images
    // (matching localStorage, which lives under its own key).
    this._state = {
      ...this._state,
      data: clone(plan),
      selectedId: null,
      activeFloorIdx: 0,
    };
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
