/**
 * Compile facade (issue #5): turns validated FloorplanData into a
 * CompiledScene ready for pkg 5's renderer.
 *
 * Pipeline: validate (geometric) -> per-room surfaces -> per-room walls ->
 * collision expansion -> furniture oriented volumes.
 */

import type {
  FloorplanData,
  FurnitureItem,
  Room,
} from '../shared/schema';
import type {
  CompiledScene,
  FurnitureVolume,
  MeshBuffer,
  RoomMeshes,
} from './types';
import { buildFloor, buildCeiling } from './surfaces';
import {
  partitionLongitudinal,
  partitionVertical,
  wallHeightForSegment,
  buildSlab,
} from './walls';
import { buildCollisions } from './collision';
import { validateGeometry } from './validate';
import { makeSegments } from './mathutil';

/** Rotate a vector by deg degrees CCW. */
function rot(deg: number, x: number, y: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c - y * s, x * s + y * c];
}

/** Count total triangles across all mesh buffers of one scene. */
export function countTriangles(scene: CompiledScene): number {
  let n = 0;
  for (const rm of scene.rooms) {
    for (const buf of [rm.floor, rm.ceiling, ...rm.walls]) {
      n += buf.indices.length / 3;
    }
  }
  return n;
}

/** Count total vertices across all mesh buffers of one scene. */
export function countVertices(scene: CompiledScene): number {
  let n = 0;
  for (const rm of scene.rooms) {
    for (const buf of [rm.floor, rm.ceiling, ...rm.walls]) {
      n += buf.positions.length / 3;
    }
  }
  return n;
}

/** Scene-wide xy AABB spanning every room polygon in the source plan. */
export function sceneBounds(
  plan: FloorplanData,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of plan.rooms) {
    for (const [x, y] of room.polygon) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Assemble one room's wall slab meshes around its openings. */
export function buildRoomWalls(room: Room, plan: FloorplanData): MeshBuffer[] {
  const meshes: MeshBuffer[] = [];
  const segs = makeSegments(room.polygon);
  const openingsHere = plan.openings.filter((o) => o.roomId === room.id);
  const bySeg = new Map<number, typeof openingsHere>();
  for (const o of openingsHere) {
    const arr = bySeg.get(o.segmentIndex);
    if (arr) arr.push(o);
    else bySeg.set(o.segmentIndex, [o]);
  }

  for (let si = 0; si < segs.length; si += 1) {
    const seg = segs[si];
    if (!seg) continue;
    const effHeight = wallHeightForSegment(room, plan.wallHeight, si);

    // Solid spans BETWEEN openings: full-height slabs.
    const spans = partitionLongitudinal(seg.len, bySeg.get(si) ?? []);
    for (const span of spans) {
      meshes.push(
        buildSlab(
          { ...span, z0: 0, z1: effHeight, segIndex: si },
          seg.ax,
          seg.ay,
          seg.ux,
          seg.uy,
          plan.wallThickness,
          -seg.ny,
          seg.nx,
        ),
      );
    }

    // Slabs ABOVE/BELLOW raised openings (windows: below-sill, above-head).
    for (const opening of bySeg.get(si) ?? []) {
      const center = opening.tCenter * seg.len;
      const holeSpan = {
        s0: center - opening.width / 2,
        s1: center + opening.width / 2,
        rimSide: 'none' as const,
      };
      for (const slab of partitionVertical(holeSpan, opening, effHeight)) {
        meshes.push(
          buildSlab(
            slab,
            seg.ax,
            seg.ay,
            seg.ux,
            seg.uy,
            plan.wallThickness,
            -seg.ny,
            seg.nx,
          ),
        );
      }
    }
  }
  return meshes;
}


function furnitureVolumes(items: FurnitureItem[]): FurnitureVolume[] {
  return items.map((item) => {
    const [fx, fy] = item.footprint;
    const hw = fx / 2;
    const hh = fy / 2;
    const local: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    const rotated = local.map(([lx, ly]) =>
      rot(item.rotationDeg, lx, ly),
    );
    const corners = rotated.map(
      ([rx, ry]) => [item.position[0] + rx, item.position[1] + ry] as [number, number],
    );
    const zs =
      item.type === 'bed'
        ? [0, 0.55]
        : item.type === 'sofa'
          ? [0, 0.8]
          : item.type === 'table'
            ? [0, 0.75]
            : item.type === 'chair'
              ? [0, 0.45]
              : item.type === 'counter'
                ? [0, 0.9]
                : item.type === 'bathtub'
                  ? [0, 0.6]
                  : [0, 0.75]; // toilet
    return {
      itemId: item.id,
      typeId: item.type,
      corners: [
        corners[0] as [number, number],
        corners[1] as [number, number],
        corners[2] as [number, number],
        corners[3] as [number, number],
      ],
      zMin: zs[0] as number,
      zMax: zs[1] as number,
    };
  });
}

/** Full compile: validated plan -> CompiledScene. Throws typed errors. */
export function compilePlan(plan: FloorplanData): CompiledScene {
  validateGeometry(plan);

  const rooms: RoomMeshes[] = plan.rooms.map((room) => ({
    roomId: room.id,
    floor: buildFloor(room),
    ceiling: buildCeiling(room, plan.wallHeight),
    walls: buildRoomWalls(room, plan),
  }));

  return {
    rooms,
    collisions: buildCollisions(plan),
    furniture: furnitureVolumes(plan.furniture),
  };
}
