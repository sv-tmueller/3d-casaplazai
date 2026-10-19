/**
 * Measurement utilities (issue #7): per-room area in m², polygon
 * centroid for badge anchoring, and the livable-area total.
 *
 * Areas derive from the shoelace formula (already owned by geom.ts);
 * this module only aggregates + formats. Overlapping rooms ARE
 * double-counted in the total (accepted, documented in README),
 * consistent with the warn-not-prevent overlap stance.
 */
import type { FloorplanData, Room } from '../shared/schema';
import { flatRooms } from '../shared/schema';
import { signedArea } from './geom';

export interface RoomMeasure {
  roomId: string;
  name: string;
  /** Absolute area in m² (sign-independent). */
  areaM2: number;
}

/** Signed-area magnitude of one room's polygon, rounded to 0.1 m². */
export function roomAreaM2(room: Room): number {
  return Math.abs(signedArea(room.polygon));
}

/** Measurements for every room in the plan. */
export function measureRooms(plan: FloorplanData): RoomMeasure[] {
  return flatRooms(plan).map((room) => ({
    roomId: room.id,
    name: room.name,
    areaM2: roomAreaM2(room),
  }));
}

/** Sum of all room areas (overlaps double-counted by design). */
export function totalLivableAreaM2(plan: FloorplanData): number {
  return flatRooms(plan).reduce((sum, room) => sum + roomAreaM2(room), 0);
}

/** Badge label, e.g. "Living Room: 19.4 m²". */
export function formatRoomLabel(measure: RoomMeasure): string {
  return `${measure.name}: ${measure.areaM2.toFixed(1)} m\u00B2`;
}

/** Status-bar total, e.g. "Total: 36.7 m²". */
export function formatTotal(totalM2: number): string {
  return `Total: ${totalM2.toFixed(1)} m\u00B2`;
}
