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
}

function near(a: Vec2, b: Vec2): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

/** Complementary tCenter for reversed traversal, clamped into [0,1]. */
export function complement(t: number): number {
  return Math.min(1, Math.max(0, 1 - t));
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

  const rows: PairRowSpec[] = [origin];
  for (const other of plan.rooms) {
    if (other.id === origin.roomId) continue;
    for (const cand of roomSegments(other)) {
      const rev = near(cand.a, seg.b) && near(cand.b, seg.a);
      const fwd = near(cand.a, seg.a) && near(cand.b, seg.b);
      if (rev || fwd) {
        rows.push({
          roomId: other.id,
          segmentIndex: cand.index,
          tCenter: rev ? complement(origin.tCenter) : origin.tCenter,
        });
      }
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
          const rev = near(otherSeg.a, seedSeg.b) && near(otherSeg.b, seedSeg.a);
          const fwd = near(otherSeg.a, seedSeg.a) && near(otherSeg.b, seedSeg.b);
          // Operator precedence: the guarded disjunction below replaces an
          // older unguarded `||` chain that short-circuited past the
          // kind/coincidence guards (fixed late in pkg 3's life).
          const tMatch =
            other.kind === seed.kind &&
            ((rev && Math.abs(complement(seed.tCenter) - other.tCenter) < PAIR_TOLERANCE_M) ||
              (fwd && Math.abs(seed.tCenter - other.tCenter) < PAIR_TOLERANCE_M));
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
