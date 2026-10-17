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
  type MeshBuffer,
} from '../geom';
import type { Room } from '../shared/schema';
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

/** Deduplicate wall slabs whose centers coincide within epsilon. */
function dedupeWalls(walls: MeshBuffer[]): MeshBuffer[] {
  const kept: MeshBuffer[] = [];
  const centers: Array<[number, number]> = [];

  for (const w of walls) {
    const cx = avgCoordinate(w.positions, 0);
    const cy = avgCoordinate(w.positions, 1);
    let dup = false;
    for (let k = 0; k < centers.length; k += 1) {
      const kc = centers[k];
      if (
        kc &&
        Math.abs(kc[0] - cx) < DUPLICATE_EPS &&
        Math.abs(kc[1] - cy) < DUPLICATE_EPS
      ) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      centers.push([cx, cy]);
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

/** Translate a compiled scene into viewer-facing buckets + collisions. */
export function adaptScene(
  compiled: CompiledScene,
  roomsById: ReadonlyMap<string, Room>,
): AdaptedScene {
  const wallBufs: MeshBuffer[] = [];
  const ceilBufs: MeshBuffer[] = [];
  const floorByTex = new Map<MaterialSlotId, MeshBuffer[]>();
  let triangleCount = 0;

  for (const roomMeshes of compiled.rooms) {
    const tex = roomsById.get(roomMeshes.roomId)?.floorTexture ?? null;
    const slot: MaterialSlotId = tex ?? 'concrete';
    const arr = floorByTex.get(slot) ?? [];
    arr.push(roomMeshes.floor);
    floorByTex.set(slot, arr);
    ceilBufs.push(roomMeshes.ceiling);
    wallBufs.push(...dedupeWalls(roomMeshes.walls));
    for (const buf of [
      roomMeshes.floor,
      roomMeshes.ceiling,
      ...roomMeshes.walls,
    ]) {
      triangleCount += buf.indices.length / 3;
    }
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
  pushBucket('wall', dedupeWalls(wallBufs));

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

/** True when any positional coordinate is NaN/Inf (parity invariant). */
export function sceneHasNaN(bucketPositions: Iterable<Float32Array>): boolean {
  for (const arr of bucketPositions) {
    for (let i = 0; i < arr.length; i += 1) {
      if (!Number.isFinite(arr[i])) return true;
    }
  }
  return false;
}
