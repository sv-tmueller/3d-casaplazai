/**
 * Flat projections over the v2 floors[] nesting.
 *
 * Most consumers (geom compiler, viewer adapters, editor read paths)
 * reason about "all rooms/openings/furniture of the plan" without
 * caring which storey owns them. These helpers keep that code immune
 * to the nesting: flatMap (NOT floors[0]) so multi-floor plans (pkg
 * 7.3+) flow through unchanged.
 */
import type { FloorplanData, FurnitureItem, Opening, Room } from './types';

export function flatRooms(plan: FloorplanData): Room[] {
  return plan.floors.flatMap((f) => f.rooms);
}

export function flatOpenings(plan: FloorplanData): Opening[] {
  return plan.floors.flatMap((f) => f.openings);
}

export function flatFurniture(plan: FloorplanData): FurnitureItem[] {
  return plan.floors.flatMap((f) => f.furniture);
}
