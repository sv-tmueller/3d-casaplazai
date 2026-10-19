/**
 * Openings model layer (pkg 3) — pure geometry + validation helpers,
 * zero DOM. Segment semantics follow docs/schema.md: segment i joins
 * polygon[i] -> polygon[(i+1) % n], CCW winding, tCenter normalized
 * from the segment START along ITS OWN traversal direction.
 */
import type { FloorplanData, Opening, Room, Vec2 } from '../../shared/schema';
import { flatOpenings, flatRooms } from '../../shared/schema';
import { pointInPolygon } from './furniture';
import {
  EDGE_MARGIN_M,
  PAIR_TOLERANCE_M,
  WALL_PICK_RADIUS_M,
  WINDOW_SILL_EPSILON_M,
} from './constants';

export { EDGE_MARGIN_M, PAIR_TOLERANCE_M, WALL_PICK_RADIUS_M, WINDOW_SILL_EPSILON_M };

export interface SegmentInfo {
  /** Index into the room's polygon segments. */
  index: number;
  /** Segment start vertex. */
  a: Vec2;
  /** Segment end vertex. */
  b: Vec2;
  /** Euclidean length in meters. */
  length: number;
}

/** All segments of a room, in polygon order. */
export function roomSegments(room: Room): SegmentInfo[] {
  const out: SegmentInfo[] = [];
  const poly = room.polygon;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    out.push({ index: i, a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  }
  return out;
}

/** World midpoint of a segment. */
export function segmentMidpoint(seg: SegmentInfo): Vec2 {
  return [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
}

/** Unit vector along the segment direction (a -> b). */
export function segmentDirection(seg: SegmentInfo): Vec2 {
  const l = seg.length || 1;
  return [(seg.b[0] - seg.a[0]) / l, (seg.b[1] - seg.a[1]) / l];
}

/** Inward unit normal (points INTO the room for CCW polygons). */
export function segmentNormal(seg: SegmentInfo): Vec2 {
  const [dx, dy] = segmentDirection(seg);
  // Rotating direction +90° CCW gives (−dy, dx), the OUTWARD normal for
  // CCW-wound interiors; negate to face into the room.
  return [dy, -dx];
}

/** Squared distance from point p to the closest point on segment ab. */
export function sqDistToSegment(px: number, py: number, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = px - a[0];
  const wy = py - a[1];
  const vv = vx * vx + vy * vy;
  let t = vv > 0 ? (wx * vx + wy * vy) / vv : 0;
  t = Math.min(1, Math.max(0, t));
  const cx = a[0] + t * vx;
  const cy = a[1] + t * vy;
  return (cx - px) * (cx - px) + (cy - py) * (cy - py);
}

/**
 * Nearest segment to a world point, picked only when the closest
 * distance is within `radius` (default WALL_PICK_RADIUS_M).
 */
export function nearestSegment(
  room: Room,
  p: Vec2,
  radius: number = WALL_PICK_RADIUS_M,
): SegmentInfo | null {
  let best: SegmentInfo | null = null;
  let bestSq = Infinity;
  for (const seg of roomSegments(room)) {
    const sq = sqDistToSegment(p[0], p[1], seg.a, seg.b);
    if (sq < bestSq) {
      bestSq = sq;
      best = seg;
    }
  }
  if (best && bestSq <= radius * radius) return best;
  return null;
}

/** Projection scalar t ∈ [0,1] of point p onto the segment (clamp). */
export function projectOntoSegment(p: Vec2, seg: SegmentInfo): number {
  const vx = seg.b[0] - seg.a[0];
  const vy = seg.b[1] - seg.a[1];
  const vv = vx * vx + vy * vy;
  if (vv === 0) return 0;
  const t = ((p[0] - seg.a[0]) * vx + (p[1] - seg.a[1]) * vy) / vv;
  return Math.min(1, Math.max(0, t));
}

/** World point at parameter t along a segment. */
export function pointAtT(seg: SegmentInfo, t: number): Vec2 {
  return [
    seg.a[0] + (seg.b[0] - seg.a[0]) * t,
    seg.a[1] + (seg.b[1] - seg.a[1]) * t,
  ];
}

/**
 * Hit-test an opening under a world point (issue #52, pkg 1).
 *
 * For every opening, resolve its room + segment (`op.segmentIndex`) and
 * reject it when the click lies farther than `tol` (default
 * WALL_PICK_RADIUS_M, reusing nearestSegment semantics) from that
 * segment. Otherwise reject it when the projected parameter falls
 * outside its cutout span: |t − tCenter| · segLen > width/2 + ε. Among
 * the survivors the one with the smallest perpendicular distance wins;
 * COLLINEAR rows (e.g. a shared-wall pair on the same wall line) share
 * that distance, so they tie-break by LIST ORDER — either row of a
 * pair deletes the same pair, so the tie is harmless. Pure —
 * geometry only, no DOM, no store.
 */
export function openingAt(
  worldPt: Vec2,
  plan: FloorplanData,
  tol: number = WALL_PICK_RADIUS_M,
): Opening | null {
  let best: Opening | null = null;
  let bestSq = Infinity;
  for (const op of flatOpenings(plan)) {
    const room = flatRooms(plan).find((r) => r.id === op.roomId);
    if (!room) continue;
    const seg = roomSegments(room)[op.segmentIndex];
    if (!seg || seg.length === 0) continue;
    const sq = sqDistToSegment(worldPt[0], worldPt[1], seg.a, seg.b);
    if (sq > tol * tol) continue;
    const t = projectOntoSegment(worldPt, seg);
    const along = Math.abs(t - op.tCenter) * seg.length;
    if (along > op.width / 2 + 1e-9) continue;
    if (sq < bestSq) {
      bestSq = sq;
      best = op;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Fit rules                                                          *
 * ------------------------------------------------------------------ */

/**
 * Placement-time fit check. Returns null when the cutout
 * [tc·L − w/2, tc·L + w/2] sits inside [EDGE_MARGIN, L − EDGE_MARGIN],
 * else a stable reason code for the inline message.
 */
export function openingFitError(segLen: number, tCenter: number, width: number): string | null {
  if (!Number.isFinite(width) || width <= 0) return 'WIDTH_POSITIVE';
  const lo = tCenter * segLen - width / 2;
  const hi = tCenter * segLen + width / 2;
  if (lo < -1e-9) return 'OVERFLOW_START';
  if (hi > segLen + 1e-9) return 'OVERFLOW_END';
  if (lo < EDGE_MARGIN_M - 1e-9 || hi > segLen - EDGE_MARGIN_M + 1e-9) {
    return 'TOO_CLOSE_TO_CORNER';
  }
  return null;
}

/**
 * Full candidate validity for placing an opening. Null = valid; else a
 * stable reason code. Encodes the AC rules: width must fit the
 * segment, window sill ≥ ε, door sill 0 legal, head > sill.
 */
export function validateOpeningCandidate(opts: {
  kind: 'door' | 'window';
  segLen: number;
  tCenter: number;
  width: number;
  sillHeight: number;
  headHeight: number;
}): string | null {
  const { kind, segLen, tCenter, width, sillHeight, headHeight } = opts;
  const fitErr = openingFitError(segLen, tCenter, width);
  if (fitErr) return fitErr;
  if (!Number.isFinite(headHeight) || headHeight <= 0) return 'BAD_HEAD_HEIGHT';
  if (!Number.isFinite(sillHeight) || sillHeight < 0) return 'NEGATIVE_SILL';
  if (kind === 'window' && sillHeight < WINDOW_SILL_EPSILON_M) {
    return 'WINDOW_SILL_TOO_LOW';
  }
  if (headHeight <= sillHeight) return 'HEAD_BELOW_SILL';
  return null;
}

/**
 * True when two openings on the SAME segment overlap in projected
 * meter intervals. Distinct segments never collide.
 */
export function openingsOverlap(a: Opening, b: Opening, segLen: number): boolean {
  if (a.segmentIndex !== b.segmentIndex) return false;
  const alo = a.tCenter * segLen - a.width / 2;
  const ahi = a.tCenter * segLen + a.width / 2;
  const blo = b.tCenter * segLen - b.width / 2;
  const bhi = b.tCenter * segLen + b.width / 2;
  return alo < bhi - 1e-9 && blo < ahi - 1e-9;
}

/**
 * Whether a proposed opening overlaps ANY existing opening of its room
 * on the same segment. (Passive check used by the tools.)
 */
export function clashesWithExisting(
  plan: FloorplanData,
  roomId: string,
  candidate: Opening,
): boolean {
  const room = flatRooms(plan).find((r) => r.id === roomId);
  if (!room) return false;
  const seg = roomSegments(room)[candidate.segmentIndex];
  if (!seg) return true;
  return flatOpenings(plan).some(
    (o) =>
      o.roomId === roomId &&
      openingsOverlap(o, candidate, seg.length),
  );
}

/* ------------------------------------------------------------------ *
 * Paired shared-wall doors (advisor ruling #2)                       *
 * ------------------------------------------------------------------ */

export interface PairRowSpec {
  roomId: string;
  segmentIndex: number;
  tCenter: number;
  /** Cutout width in meters; when given, the partner's overlap must host it. */
  width?: number;
}

/**
 * Overlap of two COLLINEAR-reaching segments, expressed in meters along
 * `seg`'s own axis (from seg.a towards seg.b).
 *
 * Issue #41: shared-wall pairing is collinear-OVERLAP based, not
 * endpoint based. Two walls pair when the candidate's endpoints lie
 * within PAIR_TOLERANCE_M of the host's LINE (perpendicular distance,
 * so a wall drawn a few millimeters off still pairs — #36) AND their
 * extents overlap. Endpoint coincidence is then just the special case
 * where the overlap equals both full lengths.
 *
 * Tolerance tie semantics (issue #47, convention #40c): the pairing
 * test is INCLUSIVE — an endpoint exactly `tol` from the line still
 * pairs (`perp <= tol`). One convention wherever tolerance is compared;
 * specs pin exact-10 mm pairing and a 10.0001 µm-plus reject here.
 */
export function sharedWallOverlap(
  seg: SegmentInfo,
  cand: SegmentInfo,
  tol: number = PAIR_TOLERANCE_M,
): { lo: number; hi: number } | null {
  const len = seg.length;
  if (!(len > 0)) return null;
  const ux = (seg.b[0] - seg.a[0]) / len;
  const uy = (seg.b[1] - seg.a[1]) / len;
  // Perpendicular distance of each candidate endpoint from seg's line.
  const perp = (p: Vec2): number =>
    Math.abs(-uy * (p[0] - seg.a[0]) + ux * (p[1] - seg.a[1]));
  if (perp(cand.a) > tol || perp(cand.b) > tol) return null;
  const sA = ux * (cand.a[0] - seg.a[0]) + uy * (cand.a[1] - seg.a[1]);
  const sB = ux * (cand.b[0] - seg.a[0]) + uy * (cand.b[1] - seg.a[1]);
  const lo = Math.max(0, Math.min(sA, sB));
  const hi = Math.min(len, Math.max(sA, sB));
  if (hi - lo <= 0) return null; // distinct spans on the same line
  return { lo, hi };
}

/** True when an overlap interval can host a cutout given in meters. */
export function overlapHosts(
  ov: { lo: number; hi: number },
  cutLo: number,
  cutHi: number,
  eps = 1e-9,
): boolean {
  return ov.lo <= cutLo + eps && ov.hi >= cutHi - eps;
}

/**
 * Mirror tCenter for a partner segment: the partner's own parameter of
 * the SAME physical world point (issue #41). Projection handles
 * arbitrary overlap fractions and both traversal directions, so a
 * simple complement is only its same-length special case.
 */
export function mirrorT(worldPoint: Vec2, cand: SegmentInfo): number {
  return projectOntoSegment(worldPoint, cand);
}

/**
 * Depth of `room`'s interior along the wall-normal line through the
 * cut point (issue #40, part b): the length of the FIRST interior
 * band the normal line crosses, taken as the max over both normal
 * orientations (so the measure is independent of the segment's
 * traversal winding).
 *
 * Computed EXACTLY by ray-edge crossing (no sampling): the cut sits
 * on the host wall, so the first band the line meets is the interior
 * stretch adjacent to the candidate wall — the honest measure of
 * "can a doorway breathe on this side". A sub-tolerance sliver
 * closet (band < PAIR_TOLERANCE_M) therefore can never host a mirror
 * row: the cut walks through to the real room across the sliver
 * instead of stamping faces on both closet walls. Offset walls are
 * handled naturally — the band starts at the wall, not at the cut.
 */
export function interiorDepthThrough(
  room: Room,
  cutWorld: Vec2,
  cand: SegmentInfo,
): number {
  const [nx, ny] = segmentNormal(cand);
  const band = (dx: number, dy: number): number => {
    const ts: number[] = [];
    const poly = room.polygon;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      // Half-open crossing rule (PNPOLY heritage): each genuine
      // crossing of the line {cutWorld + t*(dx,dy)} counts exactly
      // once, immune to vertex-grazing double counts.
      const ca = dx * (a[1] - cutWorld[1]) - dy * (a[0] - cutWorld[0]);
      const cb = dx * (b[1] - cutWorld[1]) - dy * (b[0] - cutWorld[0]);
      if (ca > 0 === cb > 0) continue;
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const denom = dx * ey - dy * ex;
      if (denominatorZero(denom)) continue;
      const t = ((a[0] - cutWorld[0]) * ey - (a[1] - cutWorld[1]) * ex) / denom;
      if (t >= -1e-9) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    // Dedupe near-identical crossings (corner grazes).
    const uniq: number[] = [];
    for (const t of ts) {
      if (uniq.length === 0 || t - uniq[uniq.length - 1] > 1e-9) uniq.push(t);
    }
    // The cut lies on the candidate room's boundary line (never
    // strictly inside), so the first interior band is [ts0, ts1].
    return uniq.length >= 2 ? uniq[1] - uniq[0] : 0;
  };
  return Math.max(band(nx, ny), band(-nx, -ny));
}

/** Denominator guard for the ray-edge solve (parallel / degenerate). */
function denominatorZero(d: number): boolean {
  return Math.abs(d) < 1e-12;
}

/** Vertex-average centroid proxy (stable side probe for gate 1). */
function vertexAverage(poly: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const v of poly) {
    x += v[0];
    y += v[1];
  }
  return [x / poly.length, y / poly.length];
}

/**
 * Overlap-guard epsilon: a distance (or orientation determinant)
 * below this scale counts as ON the line — boundary CONTACT, not
 * interior overlap. Same 1e-12 order as denominatorZero; deliberately
 * NOT PAIR_TOLERANCE_M (a centimetre-scale guard would make boundary
 * contact indistinguishable from a wall genuinely drawn into the
 * neighbouring room).
 */
const OVERLAP_EPS = 1e-12;

/** Distance from p to the segment a→b. */
function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = denominatorZero(l2)
    ? 0
    : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Point strictly inside: ray-cast inside AND clear of the boundary by
 * more than OVERLAP_EPS (a vertex sitting on — or grazing — the
 * boundary is contact, not overlap; ray-casting alone is
 * ill-conditioned exactly there).
 */
function pointStrictlyInside(p: Vec2, poly: Vec2[]): boolean {
  if (!pointInPolygon(p, poly)) return false;
  for (let i = 0; i < poly.length; i += 1) {
    if (distanceToSegment(p, poly[i], poly[(i + 1) % poly.length]) <= OVERLAP_EPS) {
      return false;
    }
  }
  return true;
}

/** Strict proper crossing: each segment's INTERIOR pierced by the
 *  other. Shared endpoints, T-junctions and collinear overlaps are
 *  boundary contact and do not count. */
function segmentsProperlyCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const sideOf = (p: Vec2, q: Vec2, r: Vec2): number => {
    const cr = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return cr > OVERLAP_EPS ? 1 : cr < -OVERLAP_EPS ? -1 : 0;
  };
  return (
    sideOf(a1, a2, b1) * sideOf(a1, a2, b2) < 0 &&
    sideOf(b1, b2, a1) * sideOf(b1, b2, a2) < 0
  );
}

/**
 * True when an interior stretch of segment p→q lies strictly inside
 * `poly`. Split the segment at every boundary contact (crossings and
 * T-junctions alike, so a wall lying ALONG the inside of another
 * room's wall is still split) and probe each gap's midpoint.
 */
function segmentProbesInterior(p: Vec2, q: Vec2, poly: Vec2[]): boolean {
  const ex = q[0] - p[0];
  const ey = q[1] - p[1];
  const ts: number[] = [0, 1];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const denom = ex * dy - ey * dx;
    if (denominatorZero(denom)) continue; // parallel/collinear: no param break
    const wx = a[0] - p[0];
    const wy = a[1] - p[1];
    const t = (wx * dy - wy * dx) / denom;
    const u = (wx * ey - wy * ex) / denom;
    if (u >= -1e-9 && u <= 1 + 1e-9) ts.push(Math.max(0, Math.min(1, t)));
  }
  ts.sort((x, y) => x - y);
  for (let i = 1; i < ts.length; i += 1) {
    if (ts[i] - ts[i - 1] <= 1e-9) continue;
    const mid = (ts[i - 1] + ts[i]) / 2;
    const probe: Vec2 = [p[0] + ex * mid, p[1] + ey * mid];
    if (pointStrictlyInside(probe, poly)) return true;
  }
  return false;
}

/**
 * True interior overlap between two room polygons (issue #112): the
 * impostor purge's honest probe, replacing the vertex-AVERAGE
 * containment proxy, which misses overlaps whose centroids happen to
 * fall outside each other (the mutually-exterior-centroid slab
 * repro). Boundary CONTACT does not count — genuine multi-neighbour
 * rooms share an edge and must keep their rows. Overlap is reported
 * when
 *   (a) two edges properly cross (interior pierced), or
 *   (b) a vertex of one lies strictly inside the other (covers full
 *       containment), or
 *   (c) an interior stretch of one's edge lies strictly inside the
 *       other — the T-junction impostor signature (a wall floating
 *       just inside a neighbour's footprint, both endpoints on the
 *       neighbour's boundary), which produces NO proper crossings
 *       and NO interior vertices (the 8 mm-east cross-pair repro).
 * A cheap AABB pre-filter rejects disjoint pairs first (rectilinear
 * plans resolve instantly).
 */
function roomsOverlap(polyA: Vec2[], polyB: Vec2[]): boolean {
  const bounds = (poly: Vec2[]): [number, number, number, number] => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return [minX, minY, maxX, maxY];
  };
  const [ax0, ay0, ax1, ay1] = bounds(polyA);
  const [bx0, by0, bx1, by1] = bounds(polyB);
  if (ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0) return false;

  for (let i = 0; i < polyA.length; i += 1) {
    for (let j = 0; j < polyB.length; j += 1) {
      if (
        segmentsProperlyCross(
          polyA[i],
          polyA[(i + 1) % polyA.length],
          polyB[j],
          polyB[(j + 1) % polyB.length],
        )
      ) {
        return true;
      }
    }
  }
  for (const v of polyA) if (pointStrictlyInside(v, polyB)) return true;
  for (const v of polyB) if (pointStrictlyInside(v, polyA)) return true;
  for (let i = 0; i < polyA.length; i += 1) {
    if (segmentProbesInterior(polyA[i], polyA[(i + 1) % polyA.length], polyB)) return true;
  }
  for (let i = 0; i < polyB.length; i += 1) {
    if (segmentProbesInterior(polyB[i], polyB[(i + 1) % polyB.length], polyA)) return true;
  }
  return false;
}

/**
 * Candidate-segment qualification for mirror emission (issue #40):
 * the candidate must represent the FAR face of a genuine shared-edge
 * relationship, not merely a wall that happens to sit within
 * PAIR_TOLERANCE_M of the host line.
 *
 * Gates, in order:
 *  1. opposite-sided: the origin room and the candidate room must lie
 *     on OPPOSITE sides of the candidate's line — the two rooms meet
 *     ACROSS the wall, the defining trait of a shared edge.
 *  2. depth: the candidate room's interior must reach at least
 *     PAIR_TOLERANCE_M deep along the wall normal at the cut — a
 *     sub-tolerance sliver closet cannot host a doorway on this face.
 *
 * Returns the mirror tCenter when the candidate qualifies, else null.
 */
export function qualifyMirrorCandidate(
  seg: SegmentInfo,
  cand: SegmentInfo,
  originRoom: Room,
  candRoom: Room,
  tCenter: number,
  width: number,
): number | null {
  const t = pairMirrorTHosted(seg, cand, tCenter, width);
  if (t === null) return null;

  // Gate 1 — opposite-sided across the candidate's line.
  const [ux, uy] = segmentDirection(cand);
  const side = (p: Vec2): number =>
    -uy * (p[0] - cand.a[0]) + ux * (p[1] - cand.a[1]);
  if (side(vertexAverage(originRoom.polygon)) * side(vertexAverage(candRoom.polygon)) >= 0) {
    return null;
  }

  // Gate 2 — interior depth at the cut beats the pairing tolerance.
  if (interiorDepthThrough(candRoom, pointAtT(seg, tCenter), cand) < PAIR_TOLERANCE_M) {
    return null;
  }

  return t;
}

/** Hosted mirror tCenter (pure geometric hosting test), or null. */
function pairMirrorTHosted(
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

/**
 * The honest mirror set for a freshly committed cut (issue #40):
 * for every OTHER room, the SINGLE nearest qualifying counterpart
 * segment (if any), then an IMPOSTOR PURGE — in a valid plan the
 * rooms sharing a wall have disjoint interiors, so when two
 * surviving candidate rooms overlap each other (an unrelated wall
 * floated within the pairing tolerance of a genuine shared wall, as
 * in the 8 mm-east cross-pair repro), the one FARTHER from the host
 * line is spurious and is dropped. Genuine multi-neighbor walls
 * (two rooms adjoining different stretches of the host wall) have
 * disjoint interiors and both keep their rows.
 *
 * Single source of truth: derivePairRows (model) and the store's
 * addOpening emission loop BOTH route through here, so the two layers
 * agree by construction.
 */
export function mirrorCounterparts(
  plan: FloorplanData,
  originRoomId: string,
  seg: SegmentInfo,
  tCenter: number,
  width: number,
): Array<{ roomId: string; segmentIndex: number; t: number }> {
  const originRoom = flatRooms(plan).find((r) => r.id === originRoomId);
  if (!originRoom) return [];

  // Per-room nearest qualifying counterpart.
  const perRoom = new Map<
    string,
    { segmentIndex: number; t: number; perp: number }
  >();
  for (const other of flatRooms(plan)) {
    if (other.id === originRoomId) continue;
    let best: { segmentIndex: number; t: number; perp: number } | null = null;
    for (const cand of roomSegments(other)) {
      const t = qualifyMirrorCandidate(seg, cand, originRoom, other, tCenter, width);
      if (t === null) continue;
      // Perpendicular distance of the candidate wall from the host
      // line: nearer (smaller) = more likely the genuine shared edge.
      const mx = (cand.a[0] + cand.b[0]) / 2;
      const my = (cand.a[1] + cand.b[1]) / 2;
      const hl = seg.length || 1;
      const hx = (seg.b[0] - seg.a[0]) / hl;
      const hy = (seg.b[1] - seg.a[1]) / hl;
      const perp = Math.abs(-hy * (mx - seg.a[0]) + hx * (my - seg.a[1]));
      if (!best || perp < best.perp) best = { segmentIndex: cand.index, t, perp };
    }
    if (best) perRoom.set(other.id, best);
  }

  // Impostor purge: overlapping candidate rooms cannot both be genuine
  // neighbours of the host wall — keep the nearer to the host line.
  // Overlap is TRUE INTERIOR intersection (issue #112): genuine
  // neighbours merely sharing a boundary edge do not register.
  const drop = new Set<string>();
  for (const [idA, a] of perRoom) {
    if (drop.has(idA)) continue;
    const roomA = flatRooms(plan).find((r) => r.id === idA)!;
    for (const [idB, b] of perRoom) {
      if (idB === idA || drop.has(idB)) continue;
      const roomB = flatRooms(plan).find((r) => r.id === idB)!;
      if (!roomsOverlap(roomA.polygon, roomB.polygon)) continue;
      // Farther from the host line is the impostor; ties drop the
      // higher id for determinism.
      if (a.perp < b.perp) drop.add(idB);
      else if (b.perp < a.perp) drop.add(idA);
      else if (idA < idB) drop.add(idB);
      else drop.add(idA);
    }
  }

  return [...perRoom.entries()]
    .filter(([id]) => !drop.has(id))
    .map(([roomId, v]) => ({ roomId, segmentIndex: v.segmentIndex, t: v.t }));
}

/**
 * Emit BOTH rows for a door committed on a possibly-shared wall:
 * the originating row plus the honest mirror set (issue #40 — see
 * mirrorCounterparts: opposite-sided across the overlap, interior-
 * deep enough to host a doorway, nearest counterpart per room,
 * overlapping-room impostors purged).
 */
export function derivePairRows(plan: FloorplanData, origin: PairRowSpec): PairRowSpec[] {
  const originRoom = flatRooms(plan).find((r) => r.id === origin.roomId);
  if (!originRoom) return [origin];
  const seg = roomSegments(originRoom)[origin.segmentIndex];
  if (!seg) return [origin];

  const rows: PairRowSpec[] = [origin];
  for (const m of mirrorCounterparts(plan, origin.roomId, seg, origin.tCenter, origin.width ?? 0)) {
    const mirror: PairRowSpec = {
      roomId: m.roomId,
      segmentIndex: m.segmentIndex,
      tCenter: m.t,
    };
    if (origin.width !== undefined) mirror.width = origin.width;
    rows.push(mirror);
  }
  return rows;
}

/**
 * Consistency audit across a paired group: equal width/sill/head
 * (≤ PAIR_TOLERANCE_M apart) and — since each row stores its own
 * traversal frame — matching world interval implied by mirrored
 * geometry. Returns de-duplicated stable error codes ([] = good).
 */
export function pairConsistencyErrors(rows: Opening[], tol = PAIR_TOLERANCE_M): string[] {
  if (rows.length < 2) return [];
  const errs: string[] = [];
  const base = rows[0];
  for (const r of rows.slice(1)) {
    if (Math.abs(base.width - r.width) > tol) errs.push('PAIR_WIDTH_MISMATCH');
    if (Math.abs(base.sillHeight - r.sillHeight) > tol) errs.push('PAIR_SILL_MISMATCH');
    if (Math.abs(base.headHeight - r.headHeight) > tol) errs.push('PAIR_HEAD_MISMATCH');
  }
  return [...new Set(errs)];
}

/**
 * Group openings into connected components representing one physical
 * doorway: rows whose ROOMS share a coincident wall segment carrying
 * equivalent cutouts. Used by tests and the pairing-aware prop editor.
 */
export function groupedPairs(plan: FloorplanData): Opening[][] {
  const groups: Opening[][] = [];
  const consumed = new Set<number>();
  const openings = flatOpenings(plan);
  for (let i = 0; i < openings.length; i += 1) {
    if (consumed.has(i)) continue;
    const seed = openings[i];
    const group = [seed];
    consumed.add(i);
    const seedRoom = flatRooms(plan).find((r) => r.id === seed.roomId);
    if (seedRoom) {
      const seedSeg = roomSegments(seedRoom)[seed.segmentIndex];
      if (seedSeg) {
        for (let j = i + 1; j < openings.length; j += 1) {
          if (consumed.has(j)) continue;
          const other = openings[j];
          const otherRoom = flatRooms(plan).find((r) => r.id === other.roomId);
          if (!otherRoom) continue;
          const otherSeg = roomSegments(otherRoom)[other.segmentIndex];
          if (!otherSeg) continue;
          const ov = sharedWallOverlap(seedSeg, otherSeg);
          // Need #41: collinear-overlap walls pair; the two rows are the
          // same physical cutout, so their world points coincide — which
          // projection expresses directly, independent of orientation.
          const seedWorld = pointAtT(seedSeg, seed.tCenter);
          const tMatch =
            other.kind === seed.kind &&
            ov !== null &&
            Math.abs(mirrorT(seedWorld, otherSeg) - other.tCenter) <
              PAIR_TOLERANCE_M;
          if (tMatch) {
            group.push(other);
            consumed.add(j);
          }
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/* ------------------------------------------------------------------ *
 * Drag-time helpers (issue #61) — pure, no DOM, no store            *
 * ------------------------------------------------------------------ */

/**
 * Ids of the structural twin GROUP of an opening: the row itself plus
 * every row paired to it by `groupedPairs` (the other face of the same
 * physical cut on a shared wall). Returns just `{openingId}` when the
 * row is unpaired. Used to keep the dragged pair out of its OWN clash
 * set — otherwise every drag frame would flag the twin (architect trap
 * for issue #61).
 */
export function openingTwinIds(plan: FloorplanData, openingId: string): Set<string> {
  const ids = new Set<string>([openingId]);
  for (const group of groupedPairs(plan)) {
    if (group.some((o) => o.id === openingId)) {
      for (const o of group) ids.add(o.id);
      return ids;
    }
  }
  return ids;
}

/**
 * Clamp a drag parameter t so the cutout keeps EDGE_MARGIN_M clear of
 * BOTH corners of a segment of length `segLen`. Inverts to t ∈
 * [margin/L + w/2L, 1 − margin/L − w/2L]; a wall too short to host the
 * cutout collapses to t = 0.5 (the fit validator then rejects it).
 */
export function clampTForDrag(segLen: number, width: number, t: number): number {
  if (!(segLen > 0)) return 0.5;
  const half = width / 2 / segLen;
  const margin = EDGE_MARGIN_M / segLen;
  const lo = margin + half;
  const hi = 1 - margin - half;
  if (lo > hi) return 0.5;
  return Math.min(hi, Math.max(lo, t));
}

/**
 * Self/twin-aware clash test for a DRAGGED opening (issue #61). True
 * when the cutout at `tCenter` overlaps a DIFFERENT opening row of the
 * SAME room/segment — the dragged row and its structural twin
 * (`openingTwinIds`) are excluded, so a lone pair sliding along its own
 * shared wall never red-flags itself. Pure — geometry only.
 */
export function openingDragClash(
  plan: FloorplanData,
  openingId: string,
  tCenter: number,
): boolean {
  const dragged = flatOpenings(plan).find((o) => o.id === openingId);
  if (!dragged) return false;
  const room = flatRooms(plan).find((r) => r.id === dragged.roomId);
  if (!room) return false;
  const seg = roomSegments(room)[dragged.segmentIndex];
  if (!seg || seg.length === 0) return false;
  const excluded = openingTwinIds(plan, openingId);
  const cand: Opening = { ...dragged, tCenter };
  return flatOpenings(plan).some(
    (o) =>
      !excluded.has(o.id) &&
      o.roomId === dragged.roomId &&
      openingsOverlap(o, cand, seg.length),
  );
}
