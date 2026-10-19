/**
 * Canvas painter: grid, rooms, selection affordances, in-progress shapes.
 * All drawing happens in CSS-pixel space; world→screen via the camera.
 */
import type { FloorplanData, FurnitureItem, Opening, Room, Staircase } from '../shared/schema';
import { flatFurniture, flatRooms } from '../shared/schema';
import { stairFootprint, stairWorldRect } from '../geom';
import {
  finalizeRectangle,
  resizeHandlesOf,
  worldToScreen,
  type Camera,
  type GhostPreview,
  type InteractionPhase,
} from './controller';
import type { Pt } from './geom';
import { itemCorners } from './model/furniture';
import { DEFAULT_SNAP_PITCH_M } from './model/settings';
import { underlayCorners, type UnderlayState } from './model/underlay';
import { groupedPairs, pointAtT, roomSegments, segmentNormal } from './model/openings';

export interface SegHighlight {
  roomId: string;
  segIndex: number;
}

const BG = '#fafafa';
const GRID_MINOR = '#ececec';
const GRID_MAJOR = '#dedede';
const ROOM_FILL = 'rgba(147, 197, 253, 0.28)';
const ROOM_STROKE = '#2563eb';
const SELECTED_STROKE = '#d97706';
const HOVER_STROKE = '#60a5fa';
const PREVIEW_STROKE = '#111827';
const HANDLE_FILL = '#ffffff';
const HANDLE_STROKE = '#d97706';
const HANDLE_HOVER_FILL = '#d97706';
const HANDLE_HOVER_STROKE = '#7c2d12';
/** Issue #53: base handle side (px); hovered handle grows for emphasis. */
const HANDLE_SIZE_PX = 10;
const HANDLE_HOVER_SIZE_PX = 14;

export function paintScene(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  cam: Camera,
  plan: FloorplanData,
  phase: InteractionPhase,
  hoverRoomId: string | null,
  ghost: GhostPreview | null = null,
  segHighlight: SegHighlight | null = null,
  hoverHandle: number | null = null,
  selectedId: string | null = null,
  gridPitch: number = DEFAULT_SNAP_PITCH_M,
  underlay: UnderlayState | null = null,
  underlayImg: HTMLImageElement | null = null,
  underlaySelected = false,
  // pkg 13.2 (issue #110): marquee band (screen px, already engaged) +
  // multi-select member ids (highlight stroke). Optional trailing pair
  // on the ghost/underlaySelected precedent — callers predating #110
  // paint unchanged.
  marquee: { start: Pt; cur: Pt } | null = null,
  multiSelectedIds: string[] = [],
): void {
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cssW, cssH);

  // pkg 12.1 (issue #99): the blueprint image paints FIRST — below the
  // grid and every wall — enforcing the trace-over guarantee. Skipping
  // entirely when hidden keeps the canvas bit-identical to pre-#99.
  if (underlay && !underlay.hidden) drawUnderlay(ctx, cam, underlay, underlayImg, underlaySelected);

  drawGrid(ctx, cssW, cssH, cam, gridPitch);

  for (const room of flatRooms(plan)) {
    drawRoomShape(
      ctx,
      cam,
      room,
      isSelected(phase, room),
      hoverRoomId === room.id,
      hoverHandle,
    );
    // pkg 13.2 (issue #110): multi-select members wear a violet stroke
    // (distinct from the amber single-selection affordance).
    if (multiSelectedIds.includes(room.id)) {
      strokeRoomOutline(ctx, cam, room, MULTI_MEMBER_STROKE);
    }
  }

  // pkg 3 (issue #4): openings belong to rooms; draw AFTER room strokes so
  // gaps/leaves read on top of the wall lines.
  //
  // Issue #59 — render-only dedupe. One physical cutout is stored as one
  // Opening row PER room (symmetric rows, see derivePairRows), so painting
  // row-by-row drew a paired door/window twice (two leaves, two glass bars
  // on the same span). Instead we paint one symbol per grouped pair, keyed
  // on groupedPairs(). Dedupe never reaches the store: hit-testing (#52)
  // and pair-delete still operate on individual rows.
  for (const group of groupedPairs(plan)) {
    const row = pickCanonRow(group);
    const room = flatRooms(plan).find((r) => r.id === row.roomId);
    if (!room) continue;
    // Selection threads per GROUP: highlighted iff ANY member row is the
    // selected one, so selecting either side yields the same span highlight.
    const selected = group.some((o) => o.id === selectedId);
    drawOpening(ctx, cam, room, row, selected);
  }

  for (const f of flatFurniture(plan)) {
    drawStamp(ctx, cam, f, phase.tag === 'idle' && false);
    // pkg 13.2 (issue #110): multi-select member highlight.
    if (multiSelectedIds.includes(f.id)) {
      strokeFootprintOutline(ctx, cam, f, MULTI_MEMBER_STROKE);
    }
  }

  // pkg 13.4 (issue #118): staircases DEPARTING the floor this view
  // shows — footprint outline + tread ticks + uphill arrow; selected
  // wears the amber affordance, marquee members the violet one (same
  // vocabulary as rooms/furniture).
  for (const stair of stairsOfActiveFloor(plan)) {
    drawStair(ctx, cam, stair, stair.id === selectedId);
    if (multiSelectedIds.includes(stair.id)) {
      strokeStairOutline(ctx, cam, stair, MULTI_MEMBER_STROKE);
    }
  }

  if (segHighlight) drawSegHighlight(ctx, cam, plan, segHighlight);
  // pkg 8.1 (issue #83): lean chips ride on top of everything static so
  // they stay legible over shared walls.
  drawLeanBadges(ctx, cam, plan);
  if (ghost) drawGhost(ctx, cam, ghost);
  drawInProgress(ctx, cam, phase);
  // pkg 13.2 (issue #110): the marquee band paints LAST — the dashed
  // guide must read over every shape it sweeps.
  if (marquee) drawMarqueeBand(ctx, marquee.start, marquee.cur);
}

/** Issue #110: multi-select member outline color (vs amber selection). */
const MULTI_MEMBER_STROKE = '#7c3aed';

/** Stroke a room polygon outline in the given color (screen space). */
function strokeRoomOutline(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  room: Room,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  room.polygon.forEach((p, i) => {
    const s = worldToScreen(cam, p);
    if (i === 0) ctx.moveTo(s[0], s[1]);
    else ctx.lineTo(s[0], s[1]);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Stroke a furniture stamp's rotated footprint outline (screen space). */
function strokeFootprintOutline(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  f: FurnitureItem,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  itemCorners(f).forEach((p, i) => {
    const s = worldToScreen(cam, p);
    if (i === 0) ctx.moveTo(s[0], s[1]);
    else ctx.lineTo(s[0], s[1]);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * pkg 13.2 (issue #110): dashed marquee band, screen px (both corner
 * orders normalized). Painted last so it reads over swept shapes.
 */
function drawMarqueeBand(
  ctx: CanvasRenderingContext2D,
  start: Pt,
  cur: Pt,
): void {
  const x = Math.min(start[0], cur[0]);
  const y = Math.min(start[1], cur[1]);
  const w = Math.abs(cur[0] - start[0]);
  const h = Math.abs(cur[1] - start[1]);
  ctx.save();
  ctx.strokeStyle = MULTI_MEMBER_STROKE;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function isSelected(phase: InteractionPhase, room: Room): boolean {
  return 'selectedRoomId' in phase && phase.selectedRoomId === room.id;
}

/**
 * Canonical row for a grouped pair (issue #59) — CANON DOCUMENTED IN CODE.
 * The authored origin is NOT persisted in the store (paired rows are
 * symmetric Openings; derivePairRows emits the origin first but nothing
 * records that), so we pick deterministically: the row whose roomId sorts
 * lexicographically first, ties broken by id for a total order. Both rows
 * of a pair project to the same world span, so the choice is visually inert.
 */
function pickCanonRow(
  group: Opening[],
): Opening {
  return [...group].sort(
    (a, b) => a.roomId.localeCompare(b.roomId) || a.id.localeCompare(b.id),
  )[0];
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  cam: Camera,
  pitch: number,
): void {
  if (cam.scale < 6) return; // too zoomed out for meaningful grid
  const stepMinor = pitch * cam.scale;
  const stepMajor = stepMinor * 10;
  const ox = modCss((-cam.originX * cam.scale) % stepMinor, stepMinor);
  const oy = modCss((cam.originY * cam.scale) % stepMinor, stepMinor);

  ctx.lineWidth = 1;
  for (let x = ox; x < cssW; x += stepMinor) {
    const isMajor = nearMultiple(x - ox, stepMajor, stepMinor);
    ctx.strokeStyle = isMajor ? GRID_MAJOR : GRID_MINOR;
    ctx.beginPath();
    ctx.moveTo(roundHalf(x), 0);
    ctx.lineTo(roundHalf(x), cssH);
    ctx.stroke();
  }
  for (let y = oy; y < cssH; y += stepMinor) {
    const isMajor = nearMultiple(y - oy, stepMajor, stepMinor);
    ctx.strokeStyle = isMajor ? GRID_MAJOR : GRID_MINOR;
    ctx.beginPath();
    ctx.moveTo(0, roundHalf(y));
    ctx.lineTo(cssW, roundHalf(y));
    ctx.stroke();
  }
}

function modCss(v: number, step: number): number {
  return ((v % step) + step) % step;
}

/* ==================== pkg 12.1 painters (issue #99) ===================== */

const UNDERLAY_SELECTED_STROKE = '#d97706';

/**
 * Blueprint underlay: ONE ctx.drawImage carrying translate/rotate/
 * globalAlpha (data URL decodes straight into drawImage — no object
 * URL to manage, no CSP concern). Called FIRST from paintScene, below
 * drawGrid, so grid + walls + rooms always paint over the image
 * (trace-over guarantee). Handles draw afterwards when selected.
 */
function drawUnderlay(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  u: UnderlayState,
  img: HTMLImageElement | null,
  selected: boolean,
): void {
  const c = worldToScreen(cam, [u.cx, u.cy]);
  const wPx = u.w * cam.scale;
  const hPx = u.h * cam.scale;
  ctx.save();
  ctx.translate(c[0], c[1]);
  // Screen y grows downward, so CCW-in-world equals CW-on-screen.
  ctx.rotate((u.rotDeg * Math.PI) / 180);
  ctx.globalAlpha = u.opacity / 100;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx);
  } else {
    // Placeholder outline while decoding (or when the image failed to
    // load): the transform stays visible/graspable either way.
    ctx.strokeStyle = UNDERLAY_SELECTED_STROKE;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);
    ctx.setLineDash([]);
  }
  ctx.restore();

  // Corner handles ride ON TOP of everything (paintScene draws the
  // underlay first) so they stay graspable over dense imagery. Handle
  // HIT-TESTING is screen-space in glue.ts; this is paint-only.
  if (selected) {
    for (const p of underlayCorners(u)) {
      const s = worldToScreen(cam, p);
      ctx.fillStyle = HANDLE_FILL;
      ctx.strokeStyle = UNDERLAY_SELECTED_STROKE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(s[0] - HANDLE_SIZE_PX / 2, s[1] - HANDLE_SIZE_PX / 2, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function nearMultiple(offset: number, _major: number, minor: number): boolean {
  const k = Math.round(offset / minor);
  return k % 10 === 0;
}

function roundHalf(v: number): number {
  return Math.floor(v) + 0.5;
}

function drawRoomShape(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  room: Room,
  selected: boolean,
  hovered: boolean,
  hoverHandle: number | null = null,
): void {
  const scrPts = room.polygon.map((p) => worldToScreen(cam, p));
  ctx.beginPath();
  ctx.moveTo(scrPts[0][0], scrPts[0][1]);
  for (let i = 1; i < scrPts.length; i += 1) ctx.lineTo(scrPts[i][0], scrPts[i][1]);
  ctx.closePath();

  ctx.fillStyle = ROOM_FILL;
  ctx.fill();

  ctx.lineJoin = 'bevel';
  ctx.lineWidth = selected ? 2.5 : hovered ? 2 : 1.5;
  ctx.strokeStyle = selected ? SELECTED_STROKE : hovered ? HOVER_STROKE : ROOM_STROKE;
  ctx.stroke();

  // Vertex dots give users graspable handles visually.
  for (const p of scrPts) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.globalAlpha = 0.65;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (selected) {
    const handles = resizeHandlesOf(room);
    for (let i = 0; i < handles.length; i += 1) {
      const s = worldToScreen(cam, handles[i]);
      // Issue #53: hover emphasis — the dragged/hovered handle grows and
      // inverts its fill so it reads as the grabbed target.
      const emph = hoverHandle === i;
      const half = (emph ? HANDLE_HOVER_SIZE_PX : HANDLE_SIZE_PX) / 2;
      ctx.fillStyle = emph ? HANDLE_HOVER_FILL : HANDLE_FILL;
      ctx.strokeStyle = emph ? HANDLE_HOVER_STROKE : HANDLE_STROKE;
      ctx.lineWidth = emph ? 2 : 1.5;
      ctx.beginPath();
      ctx.rect(s[0] - half, s[1] - half, half * 2, half * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawInProgress(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  phase: InteractionPhase,
): void {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PREVIEW_STROKE;

  if (phase.tag === 'drawingRect') {
    const corners = finalizeRectangle(phase.corner1, phase.cursor).map((p) => worldToScreen(cam, p));
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    corners.slice(1).forEach((p) => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    ctx.stroke();
  } else if (phase.tag === 'drawingPoly') {
    const pts = [...phase.points, phase.cursor].map((p) => worldToScreen(cam, p));
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach((p) => ctx.lineTo(p[0], p[1]));
    ctx.stroke();
    ctx.setLineDash([]);
    // Highlight the closure vertex.
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();
  }
  ctx.restore();
}

export type { Pt };

/* ==================== pkg 3 painters (issue #4) ===================== */

const DOOR_LEAF = '#8b5a2b';
const SWING_ARC = 'rgba(139, 90, 43, 0.35)';
const WINDOW_GLASS = '#7ec8ff';
const FURNITURE_FILL = '#cfd8dc';
const FURNITURE_STROKE = '#546e7a';
const GHOST_OK = 'rgba(46, 204, 113, 0.5)';
const GHOST_BAD = 'rgba(231, 76, 60, 0.5)';
const SEG_HIGHLIGHT = '#f1c40f';

/** One opening row: gap + (door: jambs/leaf/swing arc | window: glass bar). */
function drawOpening(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  room: Room,
  op: Opening,
  selected = false,
): void {
  const seg = roomSegments(room)[op.segmentIndex];
  if (!seg || seg.length === 0) return;

  const half = op.width / (2 * seg.length);
  const pStart = pointAtT(seg, Math.max(0, op.tCenter - half));
  const pEnd = pointAtT(seg, Math.min(1, op.tCenter + half));
  const a = worldToScreen(cam, pStart);
  const b = worldToScreen(cam, pEnd);

  // Selection affordance (issue #52): heavier orange span, mirroring the
  // furniture-selection convention (see drawStamp below).
  if (selected) {
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 3;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  if (op.kind === 'door') {
    // Jambs: dark posts bracketing the gap.
    ctx.strokeStyle = DOOR_LEAF;
    ctx.lineWidth = 3;
    for (const [ja, jb] of [
      [pStart, pointAtT(seg, Math.max(0, op.tCenter - half - 0.04))] as const,
      [pEnd, pointAtT(seg, Math.min(1, op.tCenter + half + 0.04))] as const,
    ]) {
      const jaS = worldToScreen(cam, ja);
      const jbS = worldToScreen(cam, jb);
      ctx.beginPath();
      ctx.moveTo(jaS[0], jaS[1]);
      ctx.lineTo(jbS[0], jbS[1]);
      ctx.stroke();
    }

    // Leaf: perpendicular into the room from the hinge at pStart.
    const norm = segmentNormal(seg);
    const leafPx = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tip: [number, number] = [a[0] + norm[0] * leafPx, a[1] + norm[1] * leafPx];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();

    // Swing arc from leaf-tip sweeping to the far jamb.
    const ang0 = Math.atan2(norm[1], norm[0]);
    ctx.strokeStyle = SWING_ARC;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(a[0], a[1], leafPx, ang0, ang0 + Math.PI / 2);
    ctx.stroke();
  } else {
    // Window: thick cyan glass bar spanning the cutout.
    ctx.strokeStyle = WINDOW_GLASS;
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
}

/** Rotated furniture rect + icon letter at its centroid. */
function drawStamp(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  f: FurnitureItem,
  selected: boolean,
): void {
  const corners = itemCorners(f).map((p) => worldToScreen(cam, p));
  ctx.fillStyle = FURNITURE_FILL;
  ctx.strokeStyle = selected ? '#e67e22' : FURNITURE_STROKE;
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.beginPath();
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const ctr = worldToScreen(cam, f.position);
  ctx.fillStyle = '#37474f';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(f.type.charAt(0).toUpperCase(), ctr[0], ctr[1]);
}

/**
 * pkg 8.1 (issue #83): per-wall lean badges — for every leaned segment of
 * a room, draw a small amber chip at the segment's midpoint carrying the
 * lean in degrees ("30°"). Drawn on top of room strokes so it reads even
 * when the wall is shared; skips degenerate segments.
 */
function drawLeanBadges(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  plan: FloorplanData,
): void {
  for (const room of flatRooms(plan)) {
    const rows = room.roofs ?? [];
    if (rows.length === 0) continue;
    const segs = roomSegments(room);
    for (const row of rows) {
      const seg = segs[row.segmentIndex];
      if (!seg || seg.length === 0) continue;
      const mid = pointAtT(seg, 0.5);
      const s = worldToScreen(cam, mid);
      const label = `${row.leanDeg}\u00B0`;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + 8;
      const h = 14;
      ctx.fillStyle = '#fef3c7';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(s[0] - w / 2, s[1] - h / 2, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#92400e';
      ctx.fillText(label, s[0], s[1]);
    }
  }
}

/** Yellow glow over the wall segment currently attracting the tool. */
function drawSegHighlight(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  plan: FloorplanData,
  hl: SegHighlight,
): void {
  const room = flatRooms(plan).find((r) => r.id === hl.roomId);
  if (!room) return;
  const seg = roomSegments(room)[hl.segIndex];
  if (!seg) return;
  const sa = worldToScreen(cam, seg.a);
  const sb = worldToScreen(cam, seg.b);
  ctx.strokeStyle = SEG_HIGHLIGHT;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sa[0], sa[1]);
  ctx.lineTo(sb[0], sb[1]);
  ctx.stroke();
}

/**
 * Pkg 12.3 (issue #101, fix round): paint the inspector-addressed wall
 * segment ON TOP of the composed scene (called from glue's repaint AFTER
 * paintScene). Distinct stroke from the hoverSeg yellow so the two
 * affordances never read as one: thicker + dashed teal marks the segment
 * the PANEL is editing; thin solid yellow stays the tool-hover readout.
 */
export function paintSelectedSegmentOverlay(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  plan: FloorplanData,
  hl: SegHighlight,
): void {
  const room = flatRooms(plan).find((r) => r.id === hl.roomId);
  if (!room) return;
  const seg = roomSegments(room)[hl.segIndex];
  if (!seg) return;
  const sa = worldToScreen(cam, seg.a);
  const sb = worldToScreen(cam, seg.b);
  ctx.save();
  ctx.strokeStyle = '#0d9488';
  ctx.lineWidth = 5;
  ctx.setLineDash([8, 4]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sa[0], sa[1]);
  ctx.lineTo(sb[0], sb[1]);
  ctx.stroke();
  ctx.restore();
}

/** Magnetic ghost: sliding opening band or translucent stamp rect. */
function drawGhost(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ghost: GhostPreview,
): void {
  ctx.save();
  const color = ghost.valid ? GHOST_OK : GHOST_BAD;
  if ((ghost.kind === 'door' || ghost.kind === 'window') && ghost.seg && ghost.t !== undefined) {
    const w = ghost.width ?? 0.9;
    const ps = pointAtT(ghost.seg, Math.max(0, ghost.t - w / (2 * ghost.seg.length)));
    const pe = pointAtT(ghost.seg, Math.min(1, ghost.t + w / (2 * ghost.seg.length)));
    const a = worldToScreen(cam, ps);
    const b = worldToScreen(cam, pe);
    ctx.strokeStyle = color;
    ctx.lineWidth = ghost.kind === 'door' ? 8 : 6;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  } else if (ghost.kind === 'stamp' && ghost.pos && ghost.footprint) {
    const fp = ghost.footprint;
    const tl = worldToScreen(cam, [ghost.pos[0] - fp[0] / 2, ghost.pos[1] - fp[1] / 2]);
    const br = worldToScreen(cam, [ghost.pos[0] + fp[0] / 2, ghost.pos[1] + fp[1] / 2]);
    ctx.fillStyle = color;
    ctx.fillRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
  } else if (ghost.kind === 'stairs' && ghost.stair) {
    // pkg 13.4 (issue #118): translucent candidate footprint — green when
    // validateGeometry accepts the candidate plan, red when it does not.
    const corners = stairWorldRect(ghost.stair).map((p) => worldToScreen(cam, p));
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/* ==================== pkg 13.4 painters (issue #118) ===================== */

const STAIR_FILL = 'rgba(148, 163, 184, 0.30)';
const STAIR_STROKE = '#64748b';
const STAIR_SELECTED_STROKE = '#e67e22';
const STAIR_TICK = '#94a3b8';
const STAIR_ARROW = '#334155';

/**
 * Staircases DEPARTING the floor `plan` shows (its rooms host them).
 * Shared by the painter and glue's hit-testing/purge paths — one filter,
 * one meaning of "the stairs you can see here".
 */
export function stairsOfActiveFloor(plan: FloorplanData): Staircase[] {
  const rooms = flatRooms(plan);
  return plan.stairs.filter((s) => rooms.some((r) => r.id === s.roomId));
}

/** Screen-space outline of a stair's rotated footprint rect. */
function stairScreenCorners(cam: Camera, stair: Staircase): Pt[] {
  return stairWorldRect(stair).map((p) => worldToScreen(cam, p));
}

function traceStairPath(ctx: CanvasRenderingContext2D, corners: Pt[]): void {
  ctx.beginPath();
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
}

/** Violet marquee-member outline (the strokeRoomOutline sibling). */
function strokeStairOutline(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  stair: Staircase,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  traceStairPath(ctx, stairScreenCorners(cam, stair));
  ctx.stroke();
  ctx.restore();
}

/**
 * pkg 13.4 (issue #118): one staircase — footprint outline (grey, amber
 * when selected), tread ticks at every riser bar the first, and an
 * uphill arrow along local +x (rotationDeg CCW). Pure readout: geometry
 * comes from the shared stairFootprint(), never recomputed here.
 */
function drawStair(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  stair: Staircase,
  selected = false,
): void {
  const fp = stairFootprint(stair);
  ctx.save();
  traceStairPath(ctx, stairScreenCorners(cam, stair));
  ctx.fillStyle = STAIR_FILL;
  ctx.fill();
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.strokeStyle = selected ? STAIR_SELECTED_STROKE : STAIR_STROKE;
  ctx.stroke();

  // Tread ticks: stepCount - 1 dividers across the flight.
  ctx.strokeStyle = STAIR_TICK;
  ctx.lineWidth = 1;
  for (let i = 1; i < stair.stepCount; i += 1) {
    const s = (i * stair.run) / stair.stepCount - fp.halfRun; // from centre
    const a = worldToScreen(cam, [
      fp.cx + fp.ux * s + fp.vx * fp.halfWidth,
      fp.cy + fp.uy * s + fp.vy * fp.halfWidth,
    ]);
    const b = worldToScreen(cam, [
      fp.cx + fp.ux * s - fp.vx * fp.halfWidth,
      fp.cy + fp.uy * s - fp.vy * fp.halfWidth,
    ]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  // Uphill arrow: centre → 60% of the way to the top riser.
  const tail = worldToScreen(cam, [fp.cx, fp.cy]);
  const tip = worldToScreen(cam, [
    fp.cx + fp.ux * fp.halfRun * 0.6,
    fp.cy + fp.uy * fp.halfRun * 0.6,
  ]);
  ctx.strokeStyle = STAIR_ARROW;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tail[0], tail[1]);
  ctx.lineTo(tip[0], tip[1]);
  ctx.stroke();
  const ang = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
  const head = 7;
  for (const d of [-Math.PI / 6, Math.PI / 6]) {
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(tip[0] - head * Math.cos(ang - d), tip[1] - head * Math.sin(ang - d));
    ctx.stroke();
  }
  ctx.restore();
}
