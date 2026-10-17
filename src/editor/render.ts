/**
 * Canvas painter: grid, rooms, selection affordances, in-progress shapes.
 * All drawing happens in CSS-pixel space; world→screen via the camera.
 */
import type { FloorplanData, Room } from '../shared/schema';
import { finalizeRectangle, resizeHandlesOf, worldToScreen, type Camera, type InteractionPhase } from './controller';
import type { Pt } from './geom';

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

export function paintScene(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  cam: Camera,
  plan: FloorplanData,
  phase: InteractionPhase,
  hoverRoomId: string | null,
): void {
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cssW, cssH);

  drawGrid(ctx, cssW, cssH, cam);

  for (const room of plan.rooms) {
    drawRoomShape(ctx, cam, room, isSelected(phase, room), hoverRoomId === room.id);
  }

  drawInProgress(ctx, cam, phase);
}

function isSelected(phase: InteractionPhase, room: Room): boolean {
  return 'selectedRoomId' in phase && phase.selectedRoomId === room.id;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  cam: Camera,
): void {
  if (cam.scale < 6) return; // too zoomed out for meaningful grid
  const stepMinor = 0.5 * cam.scale;
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
    for (const hp of resizeHandlesOf(room)) {
      const s = worldToScreen(cam, hp);
      ctx.fillStyle = HANDLE_FILL;
      ctx.strokeStyle = HANDLE_STROKE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(s[0] - 4, s[1] - 4, 8, 8);
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
