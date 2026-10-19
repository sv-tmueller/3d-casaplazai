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
  StairSolid,
} from './types';
import { buildCeiling, buildFloor, effectiveCeilingHeight } from './surfaces';
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
import { mergeMeshBuffers } from './meshio';
import type { Aabb, QuadCorners } from './types';
import { buildFloorWithHoles } from './floorHole';
import {
  buildStairSteps,
  stairFlankBoxes,
  stairFootprint,
  stairHoleRect,
  stairWorldRect,
} from './stairs';
import { buildRoomRoofs, hasAnyRoof } from './roofs';
import type { RoofSolid } from './types';

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
  // Stair solids (pkg 7.4) are scene geometry too — the honest count
  // includes their merged step meshes (empty for stair-free plans).
  for (const s of scene.stairs ?? []) {
    n += s.mesh.indices.length / 3;
  }
  // Roof planes (pkg 8.1) likewise: lean-free plans contribute nothing.
  for (const r of scene.roofs ?? []) {
    n += r.mesh.indices.length / 3;
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
  for (const s of scene.stairs ?? []) {
    n += s.mesh.positions.length / 3;
  }
  for (const r of scene.roofs ?? []) {
    n += r.mesh.positions.length / 3;
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

  // ---- Stair preprocessing (issue #80) -------------------------------
  // STRICTLY GUARDED by plan.stairs.length > 0: stair-free plans (the
  // apartment demo and every single-storey fixture) compile
  // BYTE-IDENTICALLY to the pre-7.4 pipeline — the guard mirrors the
  // skip-when-0 pattern the floors lift uses to protect goldens.
  const elevationByRoom = new Map<string, number>();
  if (plan.stairs.length > 0) {
    for (const floor of plan.floors) {
      for (const room of floor.rooms) {
        elevationByRoom.set(room.id, floor.elevation);
      }
    }
  }
  // Landing holes grouped by the WORLD z of the plane they punch
  // (insertion order = plan order ⇒ deterministic). Both surfaces at
  // the arrival elevation take the punch: the upper floor's slab (the
  // visible hole) AND the departure room's ceiling at the same z —
  // without the latter the stair's top tread z-fights the coplanar
  // ceiling fan and the walker's head pierces it mid-crest.
  const holesByArrivalZ = new Map<number, QuadCorners[]>();
  for (const stair of plan.stairs) {
    const departureZ = elevationByRoom.get(stair.roomId)!;
    const arrivalZ = departureZ + stair.rise;
    const list = holesByArrivalZ.get(arrivalZ);
    if (list) list.push(stairHoleRect(stair));
    else holesByArrivalZ.set(arrivalZ, [stairHoleRect(stair)]);
  }
  /** Holes destined for a horizontal plane at world z (tol 1 mm). */
  const holesForPlane = (z: number): QuadCorners[] => {
    for (const [arrivalZ, holes] of holesByArrivalZ) {
      if (Math.abs(arrivalZ - z) <= 1e-3) return holes;
    }
    return [];
  };

  // PER-FLOOR COMPILE (issue #76): each floor's rooms are built in the
  // floor's own plan-local frame (surfaces/walls/windowpanes internals
  // stay elevation-blind) and then POST-LIFTED by dz = floor.elevation.
  // Elevations are strictly increasing (validator), so the ground floor
  // is always the lowest; a dz of 0 skips lifting entirely, which keeps
  // single-storey plans byte-identical to the pre-floors pipeline.
  const rooms: RoomMeshes[] = [];
  for (const floor of plan.floors) {
    for (const room of floor.rooms) {
      // Landing-hole punch (issue #80): floors at the arrival elevation
      // and ceilings whose plane coincides with it lose the hole rect.
      // buildFloorWithHoles returns null when the hole misses the room
      // (or stairs[] is empty) — the plain fan keeps byte-identity.
      const floorHoles = holesForPlane(floor.elevation);
      const floorMesh =
        (floorHoles.length > 0
          ? buildFloorWithHoles(room.polygon, floorHoles, 0, false)
          : null) ?? buildFloor(room);
      const ceilZLocal = effectiveCeilingHeight(room, plan.wallHeight);
      const ceilHoles = holesForPlane(floor.elevation + ceilZLocal);
      const ceilMesh =
        (ceilHoles.length > 0
          ? buildFloorWithHoles(room.polygon, ceilHoles, ceilZLocal, true)
          : null) ?? buildCeiling(room, plan.wallHeight);
      rooms.push(
        offsetRoomMeshesZ(
          {
            roomId: room.id,
            elevation: floor.elevation,
            floor: floorMesh,
            ceiling: ceilMesh,
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

  // ---- Stair solids + flank fencing (issue #80) ----------------------
  // Step boxes + grounding descriptors, in plan order (deterministic).
  // STRICTLY inside the length>0 guard so stair-free plans compile
  // byte-identically (apartment goldens).
  const stairSolids: StairSolid[] = [];
  if (plan.stairs.length > 0) {
    for (const stair of plan.stairs) {
      const departureZ = elevationByRoom.get(stair.roomId)!;
      const fp = stairFootprint(stair);
      stairSolids.push({
        rect: stairWorldRect(stair),
        hole: stairHoleRect(stair),
        ux: fp.ux,
        uy: fp.uy,
        ax: fp.cx - fp.ux * fp.halfRun,
        ay: fp.cy - fp.uy * fp.halfRun,
        zLower: departureZ,
        rise: stair.rise,
        run: stair.run,
        mesh: mergeMeshBuffers(buildStairSteps(stair, departureZ)),
      });
      // Flank fencing: thin boxes along the run's sides, z-band
      // [departureZ, departureZ+rise] via the minZ/maxZ seam. RAW
      // (unexpanded) — see stairFlankBoxes for the radius rationale.
      collisions.push(...stairFlankBoxes(stair, departureZ));
    }
  }

  // ---- Roof solids (pkg 8.1, issue #83) -------------------------------
  // STRICTLY GUARDED by hasAnyRoof (mirrors the stairs length>0 guard
  // at the top of this function): lean-free plans (the apartment demo
  // and every pre-8.1 fixture) compile BYTE-IDENTICALLY to the
  // pre-roof pipeline — the apartment goldens police this.
  // Roofs attach to the TOP floor's rooms only (validator-enforced);
  // buildRoomRoofs receives the floor's elevation so every emitted z
  // is already world z.
  const roofSolids: RoofSolid[] = [];
  if (hasAnyRoof(plan)) {
    const topFloor = plan.floors[plan.floors.length - 1]!;
    for (const room of topFloor.rooms) {
      const buffers = buildRoomRoofs(room, plan.wallHeight, topFloor.elevation);
      if (buffers.length > 0) {
        roofSolids.push({
          roomId: room.id,
          // Shared exported merge (meshio.ts, reviewer #83 dedup): same
          // rebasing merge the stair step boxes use.
          mesh: mergeMeshBuffers(buffers),
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
    stairs: stairSolids,
    roofs: roofSolids,
  };
}
