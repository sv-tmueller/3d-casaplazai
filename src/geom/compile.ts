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
import { flatOpenings, flatRooms } from '../shared/schema';
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
import {
  expandPlayerRadius,
  furnitureCollisionBox,
  furnitureZRange,
  roomCollisionPieces,
} from './collision';
import { validateGeometry } from './validate';
import { makeSegments } from './mathutil';
import type { Aabb } from './types';

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
  for (const room of flatRooms(plan)) {
    for (const [x, y] of room.polygon) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Bake a floor's elevation (dz) into one mesh buffer by shifting every
 * z coordinate. The pivot of issue #76's transparency strategy: when
 * dz is 0 the buffer is RETURNED AS-IS — no allocation, no arithmetic —
 * so single-storey plans (every existing fixture) compile
 * BYTE-IDENTICALLY to the pre-floors pipeline. Only elevated floors pay
 * for the lift.
 */
function offsetBufferZ(buffer: MeshBuffer, dz: number): MeshBuffer {
  if (dz === 0) return buffer;
  const shifted = new Float32Array(buffer.positions);
  for (let i = 2; i < shifted.length; i += 3) {
    shifted[i] += dz;
  }
  return { positions: shifted, indices: buffer.indices };
}

/** Apply the floor lift to one room's whole surface set (meshes only). */
function offsetRoomMeshesZ(
  room: RoomMeshes,
  dz: number,
): RoomMeshes {
  if (dz === 0) return room;
  return {
    roomId: room.roomId,
    elevation: room.elevation,
    floor: offsetBufferZ(room.floor, dz),
    ceiling: offsetBufferZ(room.ceiling, dz),
    walls: room.walls.map((w) => offsetBufferZ(w, dz)),
  };
}

/** Assemble one room's wall slab meshes around its openings. */
export function buildRoomWalls(room: Room, plan: FloorplanData): MeshBuffer[] {
  const meshes: MeshBuffer[] = [];
  const segs = makeSegments(room.polygon);
  // Openings are addressed by roomId, which is UNIQUE across the whole
  // plan (v2 id namespace), so the flat projection finds them wherever
  // the owning floor parked them.
  const openingsHere = flatOpenings(plan).filter((o) => o.roomId === room.id);
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
          -seg.nx,
          -seg.ny,
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
            -seg.nx,
            -seg.ny,
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
    // Shared with the collision boxes (collision.ts furnitureZRange):
    // render and fencing must agree on every type's band (issue #76).
    const [zMin, zMax] = furnitureZRange(item.type);
    return {
      itemId: item.id,
      typeId: item.type,
      corners: [
        corners[0] as [number, number],
        corners[1] as [number, number],
        corners[2] as [number, number],
        corners[3] as [number, number],
      ],
      zMin,
      zMax,
    };
  });
}

/** Full compile: validated plan -> CompiledScene. Throws typed errors. */
export function compilePlan(plan: FloorplanData): CompiledScene {
  validateGeometry(plan);

  // PER-FLOOR COMPILE (issue #76): each floor's rooms are built in the
  // floor's own plan-local frame (surfaces/walls/windowpanes internals
  // stay elevation-blind) and then POST-LIFTED by dz = floor.elevation.
  // Elevations are strictly increasing (validator), so the ground floor
  // is always the lowest; a dz of 0 skips lifting entirely, which keeps
  // single-storey plans byte-identical to the pre-floors pipeline.
  const rooms: RoomMeshes[] = [];
  for (const floor of plan.floors) {
    for (const room of floor.rooms) {
      rooms.push(
        offsetRoomMeshesZ(
          {
            roomId: room.id,
            elevation: floor.elevation,
            floor: buildFloor(room),
            ceiling: buildCeiling(room, plan.wallHeight),
            walls: buildRoomWalls(room, plan),
          },
          floor.elevation,
        ),
      );
    }
  }

  // Collisions carry the SAME per-floor lift (xz planes are baked into
  // wall slabs; forgetting this would confine walkers with invisible
  // boxes floating a storey up/down — tested in the townhouse specs).
  const collisions: Aabb[] = [];
  for (const floor of plan.floors) {
    for (const room of floor.rooms) {
      const pieces = roomCollisionPieces(room, plan);
      if (floor.elevation === 0) {
        // NB: wrap expandPlayerRadius in a lambda — map's (elem, index)
        // arity would feed the INDEX in as the radius.
        collisions.push(...pieces.map((piece) => expandPlayerRadius(piece)));
      } else {
        collisions.push(
          ...pieces.map((piece) =>
            expandPlayerRadius({
              minX: piece.minX,
              minY: piece.minY,
              minZ: (piece.minZ ?? 0) + floor.elevation,
              maxX: piece.maxX,
              maxY: piece.maxY,
              maxZ: (piece.maxZ ?? plan.wallHeight) + floor.elevation,
            }),
          ),
        );
      }
    }
  }
  // Furniture collision boxes ride their floor identically.
  for (const floor of plan.floors) {
    for (const item of floor.furniture) {
      const box = furnitureCollisionBox(item);
      if (floor.elevation === 0) {
        collisions.push(box);
      } else {
        collisions.push({
          minX: box.minX,
          minY: box.minY,
          minZ: (box.minZ ?? 0) + floor.elevation,
          maxX: box.maxX,
          maxY: box.maxY,
          maxZ: (box.maxZ ?? 0) + floor.elevation,
        });
      }
    }
  }

  return {
    rooms,
    // Walls first (unchanged contract), then furniture boxes (issue #18).
    collisions,
    // Render volumes ride their floor's elevation too (issue #76):
    // zMin/zMax are WORLD z, lifted identically to the collision boxes
    // so an upstairs bed renders on the upstairs floor, not sunken into
    // the ground storey.
    furniture: plan.floors.flatMap((floor) =>
      furnitureVolumes(floor.furniture).map((vol) => ({
        ...vol,
        zMin: vol.zMin + floor.elevation,
        zMax: vol.zMax + floor.elevation,
      })),
    ),
  };
}
