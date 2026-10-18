/**
 * Openings model layer (pkg 3) — pure geometry + validation helpers,
 * zero DOM. Segment semantics follow docs/schema.md: segment i joins
 * polygon[i] -> polygon[(i+1) % n], CCW winding, tCenter normalized
 * from the segment START along ITS OWN traversal direction.
 */
import type { FloorplanData, Opening, Room, Vec2 } from '../../shared/schema';
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
 * the survivors the CLOSEST one wins (ties broken by list order), so a
 * click near a shared corner still picks the intended row. Pure —
 * geometry only, no DOM, no store.
 */
export function openingAt(
  worldPt: Vec2,
  plan: FloorplanData,
  tol: number = WALL_PICK_RADIUS_M,
): Opening | null {
  let best: Opening | null = null;
  let bestSq = Infinity;
  for (const op of plan.openings) {
    const room = plan.rooms.find((r) => r.id === op.roomId);
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
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return false;
  const seg = roomSegments(room)[candidate.segmentIndex];
  if (!seg) return true;
  return plan.openings.some(
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
 * Emit BOTH rows for a door committed on a possibly-shared wall:
 * the originating row plus, for each OTHER room holding a coincident
 * counterpart segment, a mirrored row with complementary tCenter when
 * that segment traverses the shared edge in the opposite direction
 * (canonical shared-wall case) or identical t when co-directed.
 */
export function derivePairRows(plan: FloorplanData, origin: PairRowSpec): PairRowSpec[] {
  const originRoom = plan.rooms.find((r) => r.id === origin.roomId);
  if (!originRoom) return [origin];
  const seg = roomSegments(originRoom)[origin.segmentIndex];
  if (!seg) return [origin];

  const cutHalf = (origin.width ?? 0) / 2;
  const cutLo = origin.tCenter * seg.length - cutHalf;
  const cutHi = origin.tCenter * seg.length + cutHalf;
  const world = pointAtT(seg, origin.tCenter);

  const rows: PairRowSpec[] = [origin];
  for (const other of plan.rooms) {
    if (other.id === origin.roomId) continue;
    for (const cand of roomSegments(other)) {
      const ov = sharedWallOverlap(seg, cand);
      if (!ov || !overlapHosts(ov, cutLo, cutHi)) continue;
      const mirror: PairRowSpec = {
        roomId: other.id,
        segmentIndex: cand.index,
        tCenter: mirrorT(world, cand),
      };
      if (origin.width !== undefined) mirror.width = origin.width;
      rows.push(mirror);
    }
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
  for (let i = 0; i < plan.openings.length; i += 1) {
    if (consumed.has(i)) continue;
    const seed = plan.openings[i];
    const group = [seed];
    consumed.add(i);
    const seedRoom = plan.rooms.find((r) => r.id === seed.roomId);
    if (seedRoom) {
      const seedSeg = roomSegments(seedRoom)[seed.segmentIndex];
      if (seedSeg) {
        for (let j = i + 1; j < plan.openings.length; j += 1) {
          if (consumed.has(j)) continue;
          const other = plan.openings[j];
          const otherRoom = plan.rooms.find((r) => r.id === other.roomId);
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
