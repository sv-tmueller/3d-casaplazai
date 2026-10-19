/**
 * Adapter (issue #6): translate pkg-4's `CompiledScene` into the
 * viewer-neutral `{buckets, collisions, ...}` shape. THIS FILE IS THE
 * ONLY PLACE ALLOWED TO IMPORT FROM ../geom — everything downstream
 * speaks the AdaptedScene dialect (sub-plan constraint).
 *
 * Bucket assignment:
 *   - floors   → keyed by the SOURCE ROOM's floorTexture enum member
 *   - ceilings → 'ceiling'
 *   - walls    → 'wall'
 * Duplicate-wall dedupe: pkg-4 emits interior shared walls twice (once
 * per adjoining room). Coincident-center copies collapse to one bucket
 * entry so coplanar rim strips can't shimmer (planned mitigation).
 */

import {
  type CompiledScene,
  type FurnitureVolume,
  type MeshBuffer,
  windowPaneRects,
} from '../geom';
import type { Opening, Room } from '../shared/schema';
import type {
  AdaptedScene,
  CollisionBox,
  MaterialBucket,
  MaterialSlotId,
} from './types';

/** Centers closer than this (meters) count as duplicated wall slabs. */
const DUPLICATE_EPS = 1e-3;

function concatBuffers(buffers: MeshBuffer[]): {
  positions: Float32Array;
  indices: Uint32Array;
} {
  let posTotal = 0;
  let idxTotal = 0;
  for (const b of buffers) {
    posTotal += b.positions.length;
    idxTotal += b.indices.length;
  }
  const positions = new Float32Array(posTotal);
  const indices = new Uint32Array(idxTotal);

  let posCursor = 0;
  let vertBase = 0;
  let idxCursor = 0;
  for (const b of buffers) {
    positions.set(b.positions, posCursor);
    const vertexCount = b.positions.length / 3;
    for (let i = 0; i < b.indices.length; i += 1) {
      indices[idxCursor + i] = b.indices[i] + vertBase;
    }
    idxCursor += b.indices.length;
    vertBase += vertexCount;
    posCursor += b.positions.length;
  }
  return { positions, indices };
}

/** Deduplicate wall slabs whose centers coincide within epsilon.
 *
 * Key widened to (cx, cy, cz) by issue #29: coincident-xy slabs from
 * DIFFERENT height bands (stacked windows carved into one wall span)
 * are NOT duplicates and must survive, so the centroid triple — not the
 * pair — is what identifies a true coincident copy. */
function dedupeWalls(walls: MeshBuffer[]): MeshBuffer[] {
  const kept: MeshBuffer[] = [];
  const centers: Array<[number, number, number]> = [];

  for (const w of walls) {
    const cx = avgCoordinate(w.positions, 0);
    const cy = avgCoordinate(w.positions, 1);
    const cz = avgCoordinate(w.positions, 2);
    let dup = false;
    for (let k = 0; k < centers.length; k += 1) {
      const kc = centers[k];
      if (
        kc &&
        Math.abs(kc[0] - cx) < DUPLICATE_EPS &&
        Math.abs(kc[1] - cy) < DUPLICATE_EPS &&
        Math.abs(kc[2] - cz) < DUPLICATE_EPS
      ) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      centers.push([cx, cy, cz]);
      kept.push(w);
    }
  }

  return kept;
}

/** Mean of one positional coordinate channel (axis = 0|1|2). */
function avgCoordinate(positions: Float32Array, axis: number): number {
  let sum = 0;
  const n = positions.length / 3;
  for (let i = 0; i < n; i += 1) {
    sum += positions[i * 3 + axis];
  }
  return n === 0 ? 0 : sum / n;
}

/* --------- coplanar wall-span overlap resolution (issue #45) ------------- */

const SPAN_EPS = 1e-6;

/** Planar prism descriptor for one 8-vertex (24-float) wall slab. */
interface WallPrismSpan {
  nx: number;
  ny: number;
  ex: number;
  ey: number;
  /** Signed plane offsets of the two faces, along (nx,ny). */
  offA: number;
  offB: number;
  t0: number;
  t1: number;
  z0: number;
  z1: number;
}

/** Exact descriptor of a buildSlab prism; null when the shape is unknown. */
function describeWallPrism(p: Float32Array): WallPrismSpan | null {
  if (p.length !== 24) return null;
  const ax = p[12] - p[0];
  const ay = p[13] - p[1];
  const L = Math.hypot(ax, ay);
  if (L < 1e-9) return null;
  let nx = ax / L;
  let ny = ay / L;
  if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && ny < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const ex = -ny;
  const ey = nx;
  const offA0 = nx * p[0] + ny * p[1];
  const offB0 = nx * p[12] + ny * p[13];
  // Canonicalize face order (lower offset first) so a wall emitted by two
  // adjoining rooms — whose outward normals point opposite ways — lands in
  // the SAME overlap group.
  const offA = Math.min(offA0, offB0);
  const offB = Math.max(offA0, offB0);
  let t0 = Infinity;
  let t1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    const x = p[i * 3];
    const y = p[i * 3 + 1];
    const z = p[i * 3 + 2];
    const t = ex * x + ey * y;
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { nx, ny, ex, ey, offA, offB, t0, t1, z0, z1 };
}

/** Re-emit a prism of the SAME thickness/plane, clipped in t and in z. */
function emitWallPrism(
  s: WallPrismSpan,
  t0: number,
  t1: number,
  z0: number = s.z0,
  z1: number = s.z1,
): MeshBuffer {
  const q = 1e4;
  const v = (off: number, t: number, z: number): number[] => [
    Math.round((s.nx * off + s.ex * t) * q) / q,
    Math.round((s.ny * off + s.ey * t) * q) / q,
    Math.round(z * q) / q,
  ];
  const positions = new Float32Array([
    ...v(s.offA, t0, z0), ...v(s.offA, t0, z1),
    ...v(s.offA, t1, z0), ...v(s.offA, t1, z1),
    ...v(s.offB, t0, z0), ...v(s.offB, t0, z1),
    ...v(s.offB, t1, z0), ...v(s.offB, t1, z1),
  ]);
  const indices = new Uint32Array([
    0, 2, 3, 0, 3, 1,
    4, 5, 7, 4, 7, 6,
    0, 4, 6, 0, 6, 2,
    1, 3, 7, 1, 7, 5,
    0, 1, 5, 0, 5, 4,
    2, 6, 7, 2, 7, 3,
  ]);
  return { positions, indices };
}

/**
 * Kill coplanar wall-span duplicates that dedupeWalls cannot catch.
 * Two rooms sharing a wall each emit a full-thickness slab across the
 * shared plane; where their solid spans differ (staggered neighbours,
 * #45) the slabs coincide partially instead of exactly, so the centroid
 * dedupe keeps both and they z-fight. Within a group of slabs on the
 * same plane + z-band, each tangential interval is subtracted from the
 * coverage already emitted, so every physical region is drawn EXACTLY
 * once. No overlaps ⇒ identical output (legacy/parity path).
 */
function resolveCoplanarWallOverlaps(bufs: MeshBuffer[]): MeshBuffer[] {
  if (bufs.length < 2) return bufs;
  const descs = bufs.map((b) => describeWallPrism(b.positions));
  if (descs.some((d) => d === null)) return bufs;
  const d = descs as WallPrismSpan[];
  const groups = new Map<string, number[]>();
  d.forEach((s, i) => {
    // Group by PLANE ONLY (normal + face offsets), not by z-band: two rooms
    // sharing a wall may carve openings at different heights, so their
    // coplanar slabs need not share a z-band yet still coincide on the
    // shared plane (cross-z-band z-fighting, tester finding on PR #50).
    // Disjoint z-bands are handled by the z-intersection test below, so
    // same-room stacked slabs (below-sill / above-head around a window)
    // never eat each other.
    const key =
      `${s.nx.toFixed(4)}|${s.ny.toFixed(4)}|${s.offA.toFixed(4)}|` +
      `${s.offB.toFixed(4)}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  });

  const kept: Array<MeshBuffer | null> = bufs.slice();
  const extra: MeshBuffer[] = [];
  let touched = false;

  /** Emitted (t0,t1,z0,z1) rectangles already drawn on this plane. */
  type Rect = [number, number, number, number];

  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const covered: Rect[] = [];
    const ordered = [...idxs].sort(
      (a, b) =>
        d[a]!.t0 - d[b]!.t0 ||
        d[a]!.t1 - d[b]!.t1 ||
        d[a]!.z0 - d[b]!.z0,
    );
    for (const i of ordered) {
      const s = d[i] as WallPrismSpan;
      let pieces: Rect[] = [[s.t0, s.t1, s.z0, s.z1]];
      for (const [c0, c1, cz0, cz1] of covered) {
        const next: Rect[] = [];
        for (const [a0, a1, az0, az1] of pieces) {
          const z0 = Math.max(az0, cz0);
          const z1 = Math.min(az1, cz1);
          // Disjoint in z or t ⇒ the whole piece survives untouched.
          if (
            z1 <= z0 + SPAN_EPS ||
            c1 <= a0 + SPAN_EPS ||
            c0 >= a1 - SPAN_EPS
          ) {
            next.push([a0, a1, az0, az1]);
            continue;
          }
          // t-outside parts keep the full z-band.
          if (c0 > a0 + SPAN_EPS) next.push([a0, c0, az0, az1]);
          if (c1 < a1 - SPAN_EPS) next.push([c1, a1, az0, az1]);
          // t-inside part keeps only the z-runs outside the covered band.
          const lo = Math.max(a0, c0);
          const hi = Math.min(a1, c1);
          if (cz0 > az0 + SPAN_EPS) next.push([lo, hi, az0, cz0]);
          if (cz1 < az1 - SPAN_EPS) next.push([lo, hi, cz1, az1]);
        }
        pieces = next;
      }
      const p0 = pieces[0];
      const whole =
        pieces.length === 1 &&
        p0 !== undefined &&
        p0[0] <= s.t0 + SPAN_EPS &&
        p0[1] >= s.t1 - SPAN_EPS &&
        p0[2] <= s.z0 + SPAN_EPS &&
        p0[3] >= s.z1 - SPAN_EPS;
      if (!whole) {
        touched = true;
        kept[i] = null;
        for (const p of pieces) {
          if (p[1] - p[0] > SPAN_EPS && p[3] - p[2] > SPAN_EPS) {
            extra.push(emitWallPrism(s, p[0], p[1], p[2], p[3]));
          }
        }
      }
      covered.push([s.t0, s.t1, s.z0, s.z1]);
    }
  }

  if (!touched) return bufs;
  const out: MeshBuffer[] = [];
  for (const b of kept) if (b) out.push(b);
  return [...out, ...extra];
}

/** Translate a compiled scene into viewer-facing buckets + collisions. */
export function adaptScene(
  compiled: CompiledScene,
  roomsById: ReadonlyMap<string, Room>,
  openings?: Opening[],
  wallThickness = 0.24,
): AdaptedScene {
  const wallBufs: MeshBuffer[] = [];
  const ceilBufs: MeshBuffer[] = [];
  const floorByTex = new Map<MaterialSlotId, MeshBuffer[]>();

  for (const roomMeshes of compiled.rooms) {
    const tex = roomsById.get(roomMeshes.roomId)?.floorTexture ?? null;
    const slot: MaterialSlotId = tex ?? 'concrete';
    const arr = floorByTex.get(slot) ?? [];
    arr.push(roomMeshes.floor);
    floorByTex.set(slot, arr);
    ceilBufs.push(roomMeshes.ceiling);
    wallBufs.push(...dedupeWalls(roomMeshes.walls));
  }

  const buckets: MaterialBucket[] = [];
  const pushBucket = (
    slot: MaterialSlotId,
    bufs: MeshBuffer[],
  ): void => {
    if (bufs.length === 0) return;
    const joined = concatBuffers(bufs);
    buckets.push({
      slot,
      positions: joined.positions,
      indices: joined.indices,
    });
  };

  for (const [slot, bufs] of [...floorByTex.entries()].sort(sortSlots)) {
    pushBucket(slot, bufs);
  }
  pushBucket('ceiling', ceilBufs);
  pushBucket('wall', resolveCoplanarWallOverlaps(dedupeWalls(wallBufs)));

  // ---- Window dressing (issue #19): glass panes + frames --------------
  // Emitted AFTER the wall bucket; doors are skipped entirely by
  // windowPaneRects. Undefined openings ⇒ no new buckets (legacy
  // callers keep their exact shape).
  const dressGlass: MeshBuffer[] = [];
  const dressFrames: MeshBuffer[] = [];
  if (openings && openings.length > 0) {
    const panes = windowPaneRects(planFromRooms(roomsById, openings));
    const thickness = wallThickness;
    for (const pane of panes) {
      dressGlass.push(buildGlassQuad(pane));
      dressFrames.push(...buildFrameSlabs(pane, thickness));
    }
    // ---- Door frames (issue #37) -------------------------------------
    // Doors reuse the EXISTING windowFrame slot (charcoal #3a3f44) — the
    // slot doc tolerates it; no new slot / materials / types edits. Door
    // members are wider (DOOR_MEMBER_M) and slabs are deduped by xyz
    // centroid so a doorway carved from BOTH adjoining rooms (the demo's
    // living↔kitchen shared door) emits one set instead of two
    // coincident, z-fighting sets.
    const doorSlabs = doorRects(roomsById, openings).flatMap((rect) =>
      buildFrameSlabs(rect, thickness, DOOR_MEMBER_M),
    );
    dressFrames.push(...dedupeWalls(doorSlabs));
  }
  pushBucket('glass', dressGlass);
  pushBucket('windowFrame', dressFrames);

  // ---- Furniture meshes (issue #18) ------------------------------------
  // Oriented 12-triangle prisms from the compiler's furniture volumes,
  // bucketed per material family. Furniture tris participate in the
  // scene-wide triangleCount (issue #28): the count is defined as the
  // sum over ALL emitted buckets, so no post-bucket exclusion applies.
  const furnBufs = new Map<Extract<MaterialSlotId, `furn-${string}`>, MeshBuffer[]>();
  for (const vol of compiled.furniture) {
    const slot = furnitureSlot(vol.typeId);
    const arr = furnBufs.get(slot) ?? [];
    arr.push(furniturePrism(vol));
    furnBufs.set(slot, arr);
  }
  for (const [slot, bufs] of [...furnBufs.entries()].sort(sortSlots)) {
    pushBucket(slot, bufs);
  }

  // Scene-wide triangle count (issue #28): the honest sum over EVERY
  // emitted bucket, computed post-emission so dedupe drops and all
  // bucket families (shell, dressing, furniture) are accounted once.
  const triangleCount = buckets.reduce(
    (sum, b) => sum + b.indices.length / 3,
    0,
  );

  const collisions: CollisionBox[] = compiled.collisions.map((c) => ({
    minX: c.minX,
    minY: c.minY,
    maxX: c.maxX,
    maxY: c.maxY,
  }));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of roomsById.values()) {
    for (const pt of room.polygon) {
      minX = Math.min(minX, pt[0]);
      minY = Math.min(minY, pt[1]);
      maxX = Math.max(maxX, pt[0]);
      maxY = Math.max(maxY, pt[1]);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    buckets,
    collisions,
    triangleCount,
    bounds: { minX, minY, maxX, maxY },
  };
}

/** Sort helper keeping bucket emission deterministic. */
function sortSlots(
  a: [MaterialSlotId, MeshBuffer[]],
  b: [MaterialSlotId, MeshBuffer[]],
): number {
  return a[0].localeCompare(b[0]);
}

/** Map a furniture type onto its material slot family (issue #18). */
function furnitureSlot(typeId: string): Extract<MaterialSlotId, `furn-${string}`> {
  switch (typeId) {
    case 'bed':
    case 'table':
      return 'furn-wood';
    case 'sofa':
    case 'chair':
      return 'furn-fabric';
    case 'bathtub':
    case 'toilet':
      return 'furn-porcelain';
    default: // counter
      return 'furn-laminate';
  }
}

/**
 * Build a 12-triangle outward-wound prism from one furniture volume:
 * 4 footprint corners (CCW plan ring) extruded zMin→zMax. Bottom 2 +
 * top 2 + 4 sides × 2 triangles. Outward winding matters for shadow
 * acne only lightly here (materials are DoubleSide), but keep it clean.
 */
function furniturePrism(vol: FurnitureVolume): MeshBuffer {
  const [c0, c1, c2, c3] = vol.corners;
  const zLo = vol.zMin;
  const zHi = vol.zMax;

  const ring: Array<[number, number]> = [c0, c1, c2, c3];

  // Ensure CCW (positive signed area) so side faces wind outward.
  let area2 = 0;
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % 4];
    area2 += ax * by - bx * ay;
  }
  if (area2 < 0) ring.reverse();

  const positions = new Float32Array(8 * 3);
  // Bottom verts 0..3, top verts 4..7 (ring order preserved).
  ring.forEach(([x, y], i) => {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = zLo;
    const t = (i + 4) * 3;
    positions[t] = x;
    positions[t + 1] = y;
    positions[t + 2] = zHi;
  });

  const indices = new Uint32Array([
    // bottom (faces down: reverse winding)
    0, 3, 2, 0, 2, 1,
    // top (faces up)
    4, 5, 6, 4, 6, 7,
    // sides
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ]);

  return { positions, indices };
}

/** True when any positional coordinate is NaN/Inf (parity invariant). */
export function sceneHasNaN(bucketPositions: Iterable<Float32Array>): boolean {
  for (const arr of bucketPositions) {
    for (let i = 0; i < arr.length; i += 1) {
      if (!Number.isFinite(arr[i])) return true;
    }
  }
  return false;
}

/* -------------------- window dressing (issue #19) ----------------------- */

/**
 * Minimal plan-shaped view for `windowPaneRects`: it only reads
 * `openings` and the polygons of rooms hosting windows.
 */
function planFromRooms(
  roomsById: ReadonlyMap<string, Room>,
  openings: Opening[],
): Parameters<typeof windowPaneRects>[0] {
  const hostedIds = new Set(openings.map((o) => o.roomId));
  // The window-pane projector only consults rooms/openings; synthesize
  // a minimal plan carrying both flats (cast: a deliberate partial view).
  const rooms = [...roomsById.values()].filter((r) => hostedIds.has(r.id));
  return {
    floors: [{ rooms, openings, furniture: [] }],
  } as unknown as Parameters<typeof windowPaneRects>[0];
}

/** Build ONE glass quad filling the pane rect (2 triangles). */
function buildGlassQuad(pane: {
  corners: [[number, number], [number, number], [number, number], [number, number]];
  zBottom: number;
  zTop: number;
}): MeshBuffer {
  const [[bx, by], [jx, jy]] = [pane.corners[0], pane.corners[1]];
  const verts = [
    bx, by, pane.zBottom,
    jx, jy, pane.zBottom,
    jx, jy, pane.zTop,
    bx, by, pane.zTop,
  ];
  return {
    positions: new Float32Array(verts),
    // Quad fan: (0,1,2),(0,2,3) — both facets exist implicitly because
    // sceneBuilder sets DoubleSide on every material.
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

/**
 * Build FOUR thin frame slabs ringing the pane hole, inset INSIDE the
 * wall thickness (members ~FRAME_MEMBER_M thick), each overlapping the
 * hole edge slightly (FRAME_OVERLAP_M) so no coplanar z-fighting with
 * the wall rims occurs.
 */
function buildFrameSlabs(pane: {
  corners: [[number, number], [number, number], [number, number], [number, number]];
  zBottom: number;
  zTop: number;
}, thickness: number, member: number = FRAME_MEMBER_M): MeshBuffer[] {
  const MEMBER = member;
  const OVER = FRAME_OVERLAP_M;

  const [[bx, by], [jx, jy]] = [pane.corners[0], pane.corners[1]];

  // Tangential (along-wall) + normal (through-wall) unit vectors.
  const wx = jx - bx;
  const wy = jy - by;
  const wLen = Math.hypot(wx, wy) || 1;
  const ux = wx / wLen;
  const uy = wy / wLen;
  // Through-wall normal: rotate tangent 90°.
  const nx = -uy;
  const ny = ux;

  const halfThick = thickness / 2;
  // Frames occupy the INNER portion of the wall thickness, leaving
  // OUTER_THICK of the outer skin uncovered on each side.
  const OUTER_THICK = 0.04;
  const innerHalf = Math.max(0.01, halfThick - OUTER_THICK);

  const slabs: MeshBuffer[] = [];

  /** Prism from tangential span [ta,tb] × normal span [na,nb] × z span. */
  const prism = (
    ta: number, tb: number,
    na: number, nb: number,
    za: number, zb: number,
  ): MeshBuffer => {
    const px = (t: number, n: number): [number, number] => [
      bx + ux * t + nx * n,
      by + uy * t + ny * n,
    ];
    const v = (t: number, n: number, z: number): number[] => {
      const [qx, qy] = px(t, n);
      return [qx, qy, z];
    };
    // 8 corners: (t,n) grid × z extremes.
    const c00a = v(ta, na, za);
    const c10a = v(tb, na, za);
    const c11a = v(tb, nb, za);
    const c01a = v(ta, nb, za);
    const c00b = v(ta, na, zb);
    const c10b = v(tb, na, zb);
    const c11b = v(tb, nb, zb);
    const c01b = v(ta, nb, zb);
    const positions = new Float32Array([
      ...c00a, ...c10a, ...c11a, ...c01a,
      ...c00b, ...c10b, ...c11b, ...c01b,
    ]);
    const indices = new Uint32Array([
      // bottom
      0, 1, 2, 0, 2, 3,
      // top
      4, 6, 5, 4, 7, 6,
      // sides
      0, 4, 5, 0, 5, 1,
      1, 5, 6, 1, 6, 2,
      2, 6, 7, 2, 7, 3,
      3, 7, 4, 3, 4, 0,
    ]);
    return { positions, indices };
  };

  const zBot = pane.zBottom;
  const zTop = pane.zTop;
  // Tangential coords measured from BL corner (t=0) to BR (t=wLen).

  // LEFT member: hugs the hole's left edge, extends inward (overlap).
  slabs.push(prism(-OVER, MEMBER, -innerHalf, innerHalf, zBot - OVER, zTop + OVER));
  // RIGHT member: hugs the right edge.
  slabs.push(prism(wLen - MEMBER, wLen + OVER, -innerHalf, innerHalf, zBot - OVER, zTop + OVER));
  // BOTTOM member: spans between the side members.
  slabs.push(prism(MEMBER - OVER, wLen - MEMBER + OVER, -innerHalf, innerHalf, zBot - OVER, zBot + MEMBER));
  // TOP member: ditto at head height.
  slabs.push(prism(MEMBER - OVER, wLen - MEMBER + OVER, -innerHalf, innerHalf, zTop - MEMBER, zTop + OVER));

  return slabs;
}

/** Frame member thickness, meters (slim dark border). */
const FRAME_MEMBER_M = 0.05;
/** Wider member for door casings, meters (issue #37). */
const DOOR_MEMBER_M = 0.07;
/** Frame overlap onto the hole edge, meters (anti-z-fighting). */
const FRAME_OVERLAP_M = 0.008;

/**
 * Door-hole rectangle per `kind:'door'` opening (issue #37): same
 * segment/tCenter math as `windowPaneRects` (geom/windowpanes.ts), but
 * doors are selected instead of windows and the vertical span runs
 * `sillHeight` (0) → `headHeight`. Local to the adapter: geom/ is
 * outside Pkg 2's ownership.
 */
function doorRects(
  roomsById: ReadonlyMap<string, Room>,
  openings: Opening[],
): Array<{
  corners: [[number, number], [number, number], [number, number], [number, number]];
  zBottom: number;
  zTop: number;
}> {
  const rects: ReturnType<typeof doorRects> = [];
  for (const opening of openings) {
    if (opening.kind !== 'door') continue;
    const room = roomsById.get(opening.roomId);
    if (!room) continue;
    const poly = room.polygon;
    const n = poly.length;
    const idx = opening.segmentIndex;
    if (n === 0 || idx < 0 || idx >= n) continue;
    const a = poly[idx];
    const b = poly[(idx + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const centerDist = opening.tCenter * len;
    const s0 = centerDist - opening.width / 2;
    const s1 = centerDist + opening.width / 2;
    const bl: [number, number] = [a[0] + ux * s0, a[1] + uy * s0];
    const br: [number, number] = [a[0] + ux * s1, a[1] + uy * s1];
    rects.push({
      corners: [bl, br, [br[0], br[1]], [bl[0], bl[1]]],
      zBottom: opening.sillHeight,
      zTop: opening.headHeight,
    });
  }
  return rects;
}
