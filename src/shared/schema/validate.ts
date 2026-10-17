/**
 * Pure, dependency-free validator for FloorplanData.
 *
 * Every rejection produces a machine-readable error object:
 *   { path, code, message }
 * Codes are stable identifiers suitable for tests and UI surfacing.
 * Validation is exhaustive: all violations are reported, not just the first.
 */
import type { FloorplanData, Vec2 } from './types';
import { SCHEMA_VERSION } from './types';

export interface ValidationError {
  /** Dot-path to the offending location, e.g. "rooms[0].polygon". */
  path: string;
  /** Stable machine-readable identifier. */
  code: string;
  /** Human-readable explanation. */
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationError[] };

const TEXTURES = ['wood', 'tile', 'carpet', 'concrete'] as const;
const OPENING_KINDS = ['door', 'window'] as const;
const FURNITURE_TYPES = ['bed', 'sofa', 'table', 'chair', 'counter', 'bathtub', 'toilet'] as const;

class Collector {
  readonly errors: ValidationError[] = [];
  add(path: string, code: string, message: string): void {
    this.errors.push({ path, code, message });
  }
  get failed(): boolean {
    return this.errors.length > 0;
  }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInt(v: unknown): v is number {
  return isNum(v) && Number.isInteger(v);
}

function isPoint(v: unknown): v is Vec2 {
  return Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
}

/** Signed area via the shoelace formula; positive implies CCW winding. */
export function signedArea(polygon: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function validatePolygonPoints(raw: unknown, path: string, c: Collector): Vec2[] | undefined {
  if (!Array.isArray(raw)) {
    c.add(path, 'invalid-type', 'polygon must be an array of [x, y] points');
    return undefined;
  }
  const pts: Vec2[] = [];
  let malformed = false;
  raw.forEach((p, i) => {
    if (isPoint(p)) pts.push([p[0], p[1]]);
    else {
      c.add(`${path}[${i}]`, 'invalid-point', 'expected [x, y] pair of finite numbers');
      malformed = true;
    }
  });
  if (malformed) return undefined;
  if (pts.length < 3) {
    c.add(path, 'too-few-vertices', 'polygon needs at least 3 vertices');
    return undefined;
  }
  const area = signedArea(pts);
  if (!(area > 0)) {
    c.add(
      path,
      'non-ccw-polygon',
      `polygon must wind counter-clockwise (signed area ${area.toFixed(4)})`,
    );
    return undefined;
  }
  return pts;
}

interface Seg { len: number }

function segmentLengths(poly: Vec2[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    out.push({ len: Math.hypot(bx - ax, by - ay) });
  }
  return out;
}

/** An opening fits iff it lies entirely within its segment. */
export function openingFitsSegment(tCenter: number, width: number, segLen: number): boolean {
  return tCenter * segLen - width / 2 >= 0 && tCenter * segLen + width / 2 <= segLen;
}

function checkUniqueId(id: unknown, path: string, seen: Set<string>, c: Collector): void {
  if (typeof id !== 'string' || id.trim() === '') {
    c.add(`${path}.id`, 'bad-id', 'id must be a non-empty string');
  } else if (seen.has(id)) {
    c.add(`${path}.id`, 'duplicate-id', `duplicate id "${id}"`);
  } else {
    seen.add(id);
  }
}

function checkRefToRoom(roomId: unknown, path: string, known: Set<string>, c: Collector): boolean {
  if (typeof roomId !== 'string' || !known.has(roomId)) {
    c.add(`${path}.roomId`, 'dangling-ref', `"${String(roomId)}" does not match any room id`);
    return false;
  }
  return true;
}

function checkSegmentBounds(segmentIndex: unknown, path: string, nSeg: number, c: Collector): boolean {
  if (!isInt(segmentIndex) || segmentIndex < 0 || segmentIndex >= nSeg) {
    c.add(`${path}.segmentIndex`, 'segment-out-of-range', `segmentIndex must be an integer in [0, ${Math.max(nSeg - 1, 0)}]`);
    return false;
  }
  return true;
}

interface ParsedEntities {
  roomIds: Set<string>;
  segLens: Map<string, Seg[]>;
}

function parseRooms(raw: unknown, c: Collector): ParsedEntities {
  const entities: ParsedEntities = { roomIds: new Set(), segLens: new Map() };
  if (!Array.isArray(raw)) {
    c.add('rooms', 'missing-array', '"rooms" must be an array');
    return entities;
  }
  if (raw.length === 0) {
    c.add('rooms', 'empty-collection', '"rooms" must contain at least one room');
  }
  raw.forEach((r: Record<string, unknown> | null, i: number) => {
    const rp = `rooms[${i}]`;
    checkUniqueId(r?.id, rp, entities.roomIds, c);
    if (typeof r?.name !== 'string' || r.name.trim() === '') {
      c.add(`${rp}.name`, 'bad-name', 'room name must be a non-empty string');
    }
    const id = typeof r?.id === 'string' ? r.id : undefined;
    const poly = validatePolygonPoints(r?.polygon, `${rp}.polygon`, c);
    if (id && poly) entities.segLens.set(id, segmentLengths(poly));

    const tex = r?.floorTexture;
    if (tex !== null && !TEXTURES.includes(tex as (typeof TEXTURES)[number])) {
      c.add(`${rp}.floorTexture`, 'unknown-floor-texture', `floorTexture must be null or one of ${TEXTURES.join('|')} (got ${JSON.stringify(tex)})`);
    }

    if (r?.wallsOverride !== undefined && r.wallsOverride !== null) {
      if (!Array.isArray(r.wallsOverride)) {
        c.add(`${rp}.wallsOverride`, 'invalid-type', 'wallsOverride must be an array');
      } else {
        r.wallsOverride.forEach((wo: Record<string, unknown> | null, j: number) => {
          const wp = `${rp}.wallsOverride[${j}]`;
          const nSeg = poly?.length ?? 0;
          checkSegmentBounds(wo?.segmentIndex, wp, nSeg, c);
          if (!isNum(wo?.height) || wo.height <= 0) {
            c.add(`${wp}.height`, 'bad-height', 'override height must be a positive finite number');
          }
        });
      }
    }
  });
  return entities;
}

function parseOpenings(raw: unknown, ents: ParsedEntities, c: Collector): void {
  if (!Array.isArray(raw)) {
    c.add('openings', 'missing-array', '"openings" must be an array');
    return;
  }
  const seen = new Set(ents.roomIds);
  raw.forEach((o: Record<string, unknown> | null, i: number) => {
    const op = `openings[${i}]`;
    checkUniqueId(o?.id, op, seen, c);
    if (!checkRefToRoom(o?.roomId, op, ents.roomIds, c)) return;

    if (!OPENING_KINDS.includes(o?.kind as (typeof OPENING_KINDS)[number])) {
      c.add(`${op}.kind`, 'unknown-opening-kind', `kind must be "door" or "window" (got ${JSON.stringify(o?.kind)})`);
    }
    const oo = o as Record<string, unknown>; // narrowed non-null after the roomId guard
    const segs = ents.segLens.get(oo.roomId as string);
    const nSeg = segs?.length ?? 0;
    if (checkSegmentBounds(oo.segmentIndex, op, nSeg, c) && segs) {
      const { len } = segs[oo.segmentIndex as number];
      if (isNum(oo.tCenter) && isNum(oo.width) && !openingFitsSegment(oo.tCenter, oo.width, len)) {
        c.add(op, 'opening-too-wide', `opening exceeds its segment (len ${len.toFixed(3)}, tCenter ${oo.tCenter}, width ${oo.width})`);
      }
    }
    if (!isNum(o?.tCenter) || o.tCenter < 0 || o.tCenter > 1) {
      c.add(`${op}.tCenter`, 'tcenter-out-of-range', 'tCenter must lie in [0, 1]');
    }
    if (!isNum(o?.width) || o.width <= 0) {
      c.add(`${op}.width`, 'negative-width', 'width must be a positive finite number');
    }
    if (!isNum(o?.sillHeight) || o.sillHeight < 0) {
      c.add(`${op}.sillHeight`, 'negative-sill', 'sillHeight must be >= 0');
    }
    if (!isNum(o?.headHeight) || o.headHeight <= 0) {
      c.add(`${op}.headHeight`, 'bad-head-height', 'headHeight must be > 0');
    }
  });
}

function parseFurniture(raw: unknown, ents: ParsedEntities, c: Collector): void {
  if (!Array.isArray(raw)) {
    c.add('furniture', 'missing-array', '"furniture" must be an array');
    return;
  }
  const seen = new Set(ents.roomIds);
  raw.forEach((f: Record<string, unknown> | null, i: number) => {
    const fp = `furniture[${i}]`;
    checkUniqueId(f?.id, fp, seen, c);
    if (!FURNITURE_TYPES.includes(f?.type as never)) {
      c.add(`${fp}.type`, 'unknown-furniture-type', `type must be one of ${FURNITURE_TYPES.join('|')} (got ${JSON.stringify(f?.type)})`);
    }
    checkRefToRoom(f?.roomId, fp, ents.roomIds, c);
    if (!isPoint(f?.position)) {
      c.add(`${fp}.position`, 'invalid-point', 'expected [x, y] pair of finite numbers');
    }
    if (!isNum(f?.rotationDeg)) {
      c.add(`${fp}.rotationDeg`, 'bad-rotation', 'rotationDeg must be a finite number');
    }
    if (isPoint(f?.footprint)) {
      if ((f.footprint as Vec2)[0] <= 0 || (f.footprint as Vec2)[1] <= 0) {
        c.add(`${fp}.footprint`, 'degenerate-footprint', 'both footprint extents must be > 0');
      }
    } else {
      c.add(`${fp}.footprint`, 'invalid-point', 'expected [x, y] pair of finite numbers');
    }
  });
}

/**
 * Validate arbitrary parsed JSON as FloorplanData. Reports ALL violations.
 */
export function validateFloorplan(json: unknown): ValidationResult<FloorplanData> {
  const c = new Collector();
  const d = (json ?? {}) as Record<string, unknown>;

  if (d.schemaVersion !== SCHEMA_VERSION) {
    c.add('schemaVersion', 'unsupported-version', `expected ${SCHEMA_VERSION}; got ${JSON.stringify(d.schemaVersion)}. Did you mean to run migrate()?`);
  }
  if (d.units !== 'meters') {
    c.add('units', 'bad-units', 'units must be "meters"');
  }
  if (!isNum(d.wallHeight) || d.wallHeight <= 0) {
    c.add('wallHeight', 'bad-wall-height', 'wallHeight must be a positive finite number');
  }
  if (!isNum(d.wallThickness) || d.wallThickness <= 0) {
    c.add('wallThickness', 'bad-wall-thickness', 'wallThickness must be a positive finite number');
  }

  const ents = parseRooms(d.rooms, c);
  parseOpenings(d.openings, ents, c);
  parseFurniture(d.furniture, ents, c);

  if (c.failed) return { ok: false, errors: c.errors };
  return { ok: true, value: json as FloorplanData };
}
