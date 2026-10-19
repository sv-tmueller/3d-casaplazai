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

/**
 * Roof validation (pkg 8.1, issue #83). Scoped per room, exhaustive and
 * REJECTING (never degrading — determinism over repair):
 *   - leanDeg ∈ [0, 75];
 *   - segmentIndex in the room's segment bounds (wallsOverride precedent);
 *   - one RoofSpec per segment (duplicate rows are a modelling error);
 *   - roofs only on rooms of the TOPMOST floor (nothing can sit above a
 *     mid-storey room's "roof");
 *   - proximity sanity: a leaned wall's plate (wallsOverride aware) must
 *     sit at or above the GLOBAL wallHeight, so the derived plane's
 *     lowest point (the eave) clears the top-floor play space — walk
 *     mode provably needs no collision change;
 *   - configuration scope (#83 risk ruling): exactly ONE positive lean
 *     (shed) or exactly one OPPOSING pair (gable). Anything else — 3+
 *     leans, non-opposing pairs — would demand valley synthesis, which
 *     is excluded from this package;
 *   - gable pair consistency: opposing segments must be antiparallel,
 *     equal-length and tangentially coincident within tolerance, and
 *     their planes must MEET inside the room span (derived ridge).
 */
const ROOF_MAX_LEAN_DEG = 75;
/** Antiparallel tolerance for gable pairing, degrees of angle error. */
const ROOF_PARALLEL_TOL_DEG = 0.5;
/** Length/offset coincidence tolerance for gable pairs, meters. */
const ROOF_PAIR_TOL_M = 1e-3;

function checkRoomRoofs(
  rp: string,
  room: Record<string, unknown>,
  poly: Vec2[],
  wallHeight: number,
  isTopFloor: boolean,
  c: Collector,
): void {
  const roofs = room.roofs;
  if (roofs === undefined || roofs === null) return;
  if (!Array.isArray(roofs)) {
    c.add(`${rp}.roofs`, 'invalid-type', 'roofs must be an array');
    return;
  }
  if (Number.isFinite(wallHeight) && !isTopFloor && roofs.length > 0) {
    c.add(
      `${rp}.roofs`,
      'roof-not-top-floor',
      'roofs may only be set on rooms of the topmost floor',
    );
  }

  /**
   * Effective plate height of segment si. Min-wins across duplicate
   * wallsOverride rows (per #69): the LOWER plate governs, so a rogue
   * taller duplicate can never mask one that dips into walkable space.
   */
  const plateOf = (si: number): number => {
    const ov = Array.isArray(room.wallsOverride)
      ? (room.wallsOverride as Array<Record<string, unknown>>)
      : [];
    let plate: number | undefined;
    for (const w of ov) {
      if (w?.segmentIndex === si && isNum(w.height)) {
        plate = plate === undefined ? w.height : Math.min(plate, w.height);
      }
    }
    return plate ?? wallHeight;
  };

  const nSeg = poly.length;
  const seenSeg = new Set<number>();
  // First pass: shallow rules on every row (even zero leans).
  for (let j = 0; j < roofs.length; j += 1) {
    const spec = roofs[j] as Record<string, unknown> | null;
    const spp = `${rp}.roofs[${j}]`;
    if (
      !checkSegmentBounds(spec?.segmentIndex, spp, nSeg, c) ||
      spec?.segmentIndex === undefined
    ) {
      continue;
    }
    const si = spec.segmentIndex as number;
    if (seenSeg.has(si)) {
      c.add(
        `${spp}.segmentIndex`,
        'duplicate-roof-segment',
        `segment ${si} already carries a roof lean`,
      );
    } else {
      seenSeg.add(si);
    }
    if (!isNum(spec?.leanDeg) || spec.leanDeg < 0 || spec.leanDeg > ROOF_MAX_LEAN_DEG) {
      c.add(
        `${spp}.leanDeg`,
        'bad-lean',
        `leanDeg must be a finite number in [0, ${ROOF_MAX_LEAN_DEG}]`,
      );
    } else if (spec.leanDeg > 0) {
      // Proximity sanity: the eave (= effective plate height) must not
      // dip below the global wallHeight, else the roof plane enters the
      // walkable volume (wallsOverride "min wins" would sink it).
      const plate = plateOf(si);
      if (plate < wallHeight - 1e-9) {
        c.add(
          spp,
          'roof-plate-too-low',
          `leaned segment ${si} has a wallsOverride plate (${plate}) below wallHeight ` +
            `(${wallHeight}); the roof would dip into the walkable space`,
        );
      }
    }
  }

  if (!Number.isFinite(wallHeight)) return; // wallHeight fault already reported

  // Second pass: composition analysis over POSITIVE leans only (a 0
  // lean contributes nothing — flat parapet per #83).
  const leans: Array<{ si: number; leanDeg: number }> = [];
  for (const spec of roofs) {
    const s = spec as Record<string, unknown> | null;
    if (isNum(s?.leanDeg) && (s.leanDeg as number) > 0 && isInt(s?.segmentIndex)) {
      leans.push({ si: s.segmentIndex as number, leanDeg: s.leanDeg as number });
    }
  }
  if (leans.length === 0 || leans.length === 1) return; // flat or shed: OK
  if (leans.length > 2) {
    c.add(
      `${rp}.roofs`,
      'roof-unsupported-config',
      'a room supports at most one shed lean or one gable pair (2 leans); ' +
        'valleys/hips are out of scope',
    );
    return;
  }

  // Exactly two leans: they must form a valid gable pair.
  const [a, b] = leans as [{ si: number; leanDeg: number }, { si: number; leanDeg: number }];
  const segA = segInfo(poly, a.si);
  const segB = segInfo(poly, b.si);
  if (!segA || !segB) return; // bounds fault already reported
  const dot = segA.ux * segB.ux + segA.uy * segB.uy;
  const minDot = -Math.cos((ROOF_PARALLEL_TOL_DEG * Math.PI) / 180);
  if (dot > minDot) {
    c.add(
      `${rp}.roofs`,
      'roof-invalid-gable',
      `segments ${a.si} and ${b.si} are not opposing (tangent dot ${dot.toFixed(4)}); ` +
        'two leans must form a gable',
    );
    return;
  }
  if (Math.abs(segA.len - segB.len) > ROOF_PAIR_TOL_M) {
    c.add(
      `${rp}.roofs`,
      'roof-length-mismatch',
      `gable segments ${a.si} (${segA.len.toFixed(3)} m) and ${b.si} ` +
        `(${segB.len.toFixed(3)} m) must be equal-length within ${ROOF_PAIR_TOL_M} m`,
    );
    return;
  }
  // Tangential coincidence: the pair's spans must align along the ridge
  // axis (a staggered pair would twist the ridge). NOTE the crossed
  // pairing: an opposing segment traverses the ridge axis in the
  // OPPOSITE direction, so A's START shares the ridge station with B's
  // END (and vice versa) — pairing start↔start would reject every
  // legitimate rectangle gable.
  const alongRidge = (p: Vec2): number => segA.ux * p[0] + segA.uy * p[1];
  if (
    Math.abs(alongRidge(segA.start) - alongRidge(segB.end)) > ROOF_PAIR_TOL_M ||
    Math.abs(alongRidge(segA.end) - alongRidge(segB.start)) > ROOF_PAIR_TOL_M
  ) {
    c.add(
      `${rp}.roofs`,
      'roof-invalid-gable',
      `gable segments ${a.si} and ${b.si} are staggered along the ridge; ` +
        'their spans must coincide',
    );
    return;
  }
  // Derived ridge existence: solve for the meeting point of the two
  // planes along the span between the walls; it must land strictly
  // inside the room so both planes rise to a shared ridge.
  const dist = (from: SegInfo, to: Vec2): number =>
    from.nx * (to[0] - from.start[0]) + from.ny * (to[1] - from.start[1]);
  const midB: Vec2 = [
    (segB.start[0] + segB.end[0]) / 2,
    (segB.start[1] + segB.end[1]) / 2,
  ];
  const midA: Vec2 = [
    (segA.start[0] + segA.end[0]) / 2,
    (segA.start[1] + segA.end[1]) / 2,
  ];
  const spanA = dist(segA, midB);
  const spanB = dist(segB, midA);
  if (spanA <= ROOF_PAIR_TOL_M || spanB <= ROOF_PAIR_TOL_M) {
    c.add(
      `${rp}.roofs`,
      'roof-invalid-gable',
      `gable segments ${a.si} and ${b.si} do not face each other`,
    );
    return;
  }
  const pa = plateOf(a.si);
  const pb = plateOf(b.si);
  const ta = Math.tan((a.leanDeg * Math.PI) / 180);
  const tb = Math.tan((b.leanDeg * Math.PI) / 180);
  const span = (spanA + spanB) / 2;
  const meet = (pb - pa + tb * span) / (ta + tb);
  if (meet <= ROOF_PAIR_TOL_M || meet >= span - ROOF_PAIR_TOL_M) {
    c.add(
      `${rp}.roofs`,
      'roof-no-ridge',
      `leans on segments ${a.si}/${b.si} produce no ridge inside the room ` +
        `(meeting point ${meet.toFixed(3)} m of ${span.toFixed(3)} m span)`,
    );
  }
}

/** Minimal segment descriptor used by the roof gable checks. */
interface SegInfo {
  start: Vec2;
  end: Vec2;
  len: number;
  ux: number;
  uy: number;
  /** Left-facing unit normal (-uy, ux): points INTO a CCW polygon. */
  nx: number;
  ny: number;
}

function segInfo(poly: Vec2[], si: number): SegInfo | undefined {
  const a = poly[si];
  const b = poly[(si + 1) % poly.length];
  if (!a || !b) return undefined;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return undefined;
  return {
    start: a,
    end: b,
    len,
    ux: dx / len,
    uy: dy / len,
    nx: -dy / len,
    ny: dx / len,
  };
}


function parseRooms(
  raw: unknown,
  basePath: string,
  c: Collector,
  /** Shared plan-wide id namespace (issue #74): entity ids are unique
   * across the WHOLE plan, so callers pass one Set walked floor by floor. */
  roomIds: Set<string>,
  /** Global wallHeight (NaN-safe: roof checks self-guard on finiteness). */
  wallHeight: number,
  /** Whether THIS floor is the plan's topmost (only it may carry roofs). */
  isTopFloor: boolean,
): ParsedEntities {
  const entities: ParsedEntities = { roomIds, segLens: new Map() };
  if (!Array.isArray(raw)) {
    c.add(basePath, 'missing-array', `"${basePath}" must be an array`);
    return entities;
  }
  // pkg 7.2 (issue #75): only the GROUND floor demands >= 1 room (an
  // entirely empty plan stays invalid). Upper floors may legitimately
  // sit empty right after "Add floor" — rejecting them turned a benign
  // reload into wholesale autosave discard.
  if (raw.length === 0 && basePath === 'floors[0].rooms') {
    c.add(basePath, 'empty-collection', `"${basePath}" must contain at least one room`);
  }
  raw.forEach((r: Record<string, unknown> | null, i: number) => {
    const rp = `${basePath}[${i}]`;
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

    checkRoomRoofs(rp, r ?? {}, poly ?? [], wallHeight, isTopFloor, c);
  });
  return entities;
}

function parseOpenings(raw: unknown, basePath: string, ents: ParsedEntities, c: Collector): void {
  if (!Array.isArray(raw)) {
    c.add(basePath, 'missing-array', `"${basePath}" must be an array`);
    return;
  }
  const seen = new Set(ents.roomIds);
  raw.forEach((o: Record<string, unknown> | null, i: number) => {
    const op = `${basePath}[${i}]`;
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

function parseFurniture(raw: unknown, basePath: string, ents: ParsedEntities, c: Collector): void {
  if (!Array.isArray(raw)) {
    c.add(basePath, 'missing-array', `"${basePath}" must be an array`);
    return;
  }
  const seen = new Set(ents.roomIds);
  raw.forEach((f: Record<string, unknown> | null, i: number) => {
    const fp = `${basePath}[${i}]`;
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
 * Shallow stair sanity rules (pkg 7.1). Deep geometric checks — rise/gap
 * matching against a higher floor, stairwell overlap — arrive with 7.4.
 */
function parseStairs(raw: unknown, c: Collector): void {
  if (!Array.isArray(raw)) {
    c.add('stairs', 'missing-array', '"stairs" must be an array');
    return;
  }
  const seen = new Set<string>();
  raw.forEach((s: Record<string, unknown> | null, i: number) => {
    const sp = `stairs[${i}]`;
    checkUniqueId(s?.id, sp, seen, c);
    if (typeof s?.roomId !== 'string' || s.roomId.trim() === '') {
      c.add(`${sp}.roomId`, 'bad-room-id', 'roomId must be a non-empty string');
    }
    if (!isPoint(s?.position)) {
      c.add(`${sp}.position`, 'invalid-point', 'expected [x, y] pair of finite numbers');
    }
    if (!isNum(s?.rotationDeg)) {
      c.add(`${sp}.rotationDeg`, 'bad-rotation', 'rotationDeg must be a finite number');
    }
    for (const field of ['width', 'run', 'rise'] as const) {
      if (!isNum(s?.[field]) || (s[field] as number) <= 0) {
        c.add(
          `${sp}.${field}`,
          `bad-${field}`,
          `${field} must be a positive finite number`,
        );
      }
    }
    if (!isInt(s?.stepCount) || (s.stepCount as number) < 3) {
      c.add(`${sp}.stepCount`, 'bad-step-count', 'stepCount must be an integer >= 3');
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

  if (!Array.isArray(d.floors)) {
    c.add('floors', 'missing-array', '"floors" must be an array');
  } else if (d.floors.length === 0) {
    c.add('floors', 'empty-collection', '"floors" must contain at least one floor');
  } else {
    // Entity ids are unique across the WHOLE plan: one shared namespace
    // walked floor by floor (also admits floor ids into the namespace,
    // preventing floor/entity collisions).
    const idNamespace = new Set<string>();
    let prevElevation: number | undefined;
    d.floors.forEach((fl: Record<string, unknown> | null, fi: number) => {
      const bp = `floors[${fi}]`;
      checkUniqueId(fl?.id, bp, idNamespace, c);
      if (typeof fl?.name !== 'string' || fl.name.trim() === '') {
        c.add(`${bp}.name`, 'bad-name', 'floor name must be a non-empty string');
      }
      if (!isNum(fl?.elevation)) {
        c.add(`${bp}.elevation`, 'bad-elevation', 'elevation must be a finite number');
      } else if (prevElevation !== undefined && fl.elevation <= prevElevation) {
        c.add(
          `${bp}.elevation`,
          'non-monotonic-elevation',
          `elevations must strictly increase across floors[] (${fl.elevation} after ${prevElevation})`,
        );
      }
      if (isNum(fl?.elevation)) prevElevation = fl.elevation;

      const isTopFloor = fi === (d.floors as unknown[]).length - 1;
      const wh = isNum(d.wallHeight) ? (d.wallHeight as number) : NaN;
      const ents = parseRooms(fl?.rooms, `${bp}.rooms`, c, idNamespace, wh, isTopFloor);
      parseOpenings(fl?.openings, `${bp}.openings`, ents, c);
      parseFurniture(fl?.furniture, `${bp}.furniture`, ents, c);
    });
  }

  parseStairs(d.stairs, c);

  if (c.failed) return { ok: false, errors: c.errors };
  return { ok: true, value: json as FloorplanData };
}
