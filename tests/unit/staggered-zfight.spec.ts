/**
 * Issue #45 — staggered shared walls must not leave coplanar z-fighting
 * wall slabs after adaptation.
 *
 * A room pair sharing a collinear wall of DIFFERENT length (A east wall
 * y[0,4], B west wall y[1,3.5]) each emits a full-thickness slab across
 * the shared plane. Where their solid spans only PARTIALLY coincide the
 * centroid dedupe keeps both, leaving overlapping coplanar prisms —
 * exactly the surfaces that z-fight. adaptScene's coplanar-span pass
 * must reduce the wall bucket to exactly-once tangential coverage.
 *
 * The descriptor here reads the prism's TRUE face planes (it does NOT
 * pre-trim half a thickness), so it is valid for real-thickness slabs.
 */
import { describe, expect, it } from 'vitest';
import { adaptScene } from '../../src/viewer/adapter';
import { compilePlan } from '../../src/geom';
import type { MeshBuffer } from '../../src/geom';
import type { FloorplanData, Opening, Room } from '../../src/shared/schema';

const W = 0.24;

function staggerPlan(): FloorplanData {
  const rooms: Room[] = [
    { id: 'A', name: 'A', polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], floorTexture: null },
    { id: 'B', name: 'B', polygon: [[5, 1], [8, 1], [8, 3.5], [5, 3.5]], floorTexture: null },
  ];
  const door = (id: string, roomId: string, tCenter: number): Opening => ({
    id, roomId, kind: 'door', segmentIndex: roomId === 'A' ? 1 : 3, tCenter,
    width: 0.9, headHeight: 2.05, sillHeight: 0,
  });
  const openings: Opening[] = [
    door('A-hi', 'A', 2.8 / 4), door('B-hi', 'B', (3.5 - 2.8) / 2.5),
    door('A-lo', 'A', 1.8 / 4), door('B-lo', 'B', (3.5 - 1.8) / 2.5),
  ];
  return {
    schemaVersion: 1, units: 'meters', wallHeight: 2.7, wallThickness: W,
    rooms, openings, furniture: [],
  };
}

function roomsById(plan: FloorplanData): Map<string, Room> {
  return new Map(plan.rooms.map((r) => [r.id, r]));
}

interface Slab {
  nx: number; ny: number; offA: number; offB: number;
  t0: number; t1: number; z0: number; z1: number;
}

/** Exact prism descriptor: face planes from the inner/outer vertex pair. */
function describeSlab(p: Float32Array, off = 0): Slab | null {
  if (p.length - off < 24) return null;
  const g = (k: number, c: number): number => p[off + k * 3 + c] as number;
  const ax = g(4, 0) - g(0, 0);
  const ay = g(4, 1) - g(0, 1);
  const L = Math.hypot(ax, ay);
  if (L < 1e-9) return null;
  let nx = ax / L; let ny = ay / L;
  if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && ny < 0)) { nx = -nx; ny = -ny; }
  const oA = nx * g(0, 0) + ny * g(0, 1);
  const oB = nx * g(4, 0) + ny * g(4, 1);
  const ex = -ny; const ey = nx;
  let t0 = Infinity; let t1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (let k = 0; k < 8; k += 1) {
    const t = ex * g(k, 0) + ey * g(k, 1);
    if (t < t0) t0 = t; if (t > t1) t1 = t;
    const z = g(k, 2);
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return {
    nx, ny, offA: Math.min(oA, oB), offB: Math.max(oA, oB),
    t0, t1, z0, z1,
  };
}

function coplanarOverlaps(bucket: MeshBuffer): number {
  const slabs: Slab[] = [];
  for (let o = 0; o + 24 <= bucket.positions.length; o += 24) {
    const s = describeSlab(bucket.positions, o);
    if (s) slabs.push(s);
  }
  let pairs = 0;
  for (let i = 0; i < slabs.length; i += 1) {
    for (let j = i + 1; j < slabs.length; j += 1) {
      const a = slabs[i] as Slab; const b = slabs[j] as Slab;
      if (Math.abs(a.nx * b.ny - a.ny * b.nx) > 1e-6) continue;
      if (Math.abs(a.offA - b.offA) > 1e-6 || Math.abs(a.offB - b.offB) > 1e-6) continue;
      const tOv = Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0);
      const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (tOv > 1e-6 && zOv > 1e-6) pairs += 1;
    }
  }
  return pairs;
}

describe('issue #45 staggered shared wall — no coplanar z-fighting', () => {
  it('the raw compile DOES overlap (guards the fixture is a real repro)', () => {
    const plan = staggerPlan();
    const scene = compilePlan(plan);
    const all: Slab[] = [];
    for (const rm of scene.rooms) {
      for (const b of rm.walls) {
        const s = describeSlab(b.positions);
        if (s) all.push(s);
      }
    }
    let pairs = 0;
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i] as Slab; const b = all[j] as Slab;
        if (Math.abs(a.nx * b.ny - a.ny * b.nx) > 1e-6) continue;
        if (Math.abs(a.offA - b.offA) > 1e-6 || Math.abs(a.offB - b.offB) > 1e-6) continue;
        if (Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0) > 1e-6 &&
            Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6) pairs += 1;
      }
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it('leaves ZERO coplanar overlapping wall slabs after adaptation', () => {
    const plan = staggerPlan();
    const adapted = adaptScene(compilePlan(plan), roomsById(plan), plan.openings);
    const wall = adapted.buckets.find((b) => b.slot === 'wall');
    expect(wall).toBeDefined();
    expect(coplanarOverlaps(wall as MeshBuffer)).toBe(0);
  });

  it('emits exactly FOUR door-frame slabs per shared doorway (no dupes)', () => {
    const plan = staggerPlan();
    const adapted = adaptScene(compilePlan(plan), roomsById(plan), plan.openings);
    const frames = adapted.buckets.find((b) => b.slot === 'windowFrame') as MeshBuffer;
    const perDoor = new Map<string, number>();
    for (let o = 0; o + 24 <= frames.positions.length; o += 24) {
      let cy = 0;
      for (let i = 0; i < 8; i += 1) cy += frames.positions[o + i * 3 + 1] as number;
      const key = cy / 8 > 2.3 ? 'hi' : 'lo';
      perDoor.set(key, (perDoor.get(key) ?? 0) + 1);
    }
    // doorRects emits ONE rect per paired doorway; nothing to dedupe.
    expect([...perDoor.values()].sort((a, b) => a - b)).toEqual([4, 4]);
  });
});
