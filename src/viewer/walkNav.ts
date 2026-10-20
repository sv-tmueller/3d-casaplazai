/**
 * Walk-mode navigation aids — pure plan queries (issue #147).
 *
 * Both the viewer HUD (room readout, go-to-room picker) and the editor
 * glyph need the same two answers about a walker pose held in plan
 * space: WHICH STOREY is it on, and WHICH ROOM does its point fall in?
 * Kept three-free and DOM-free here so both panes can unit-pin the
 * answers (CP2 introduces floor attribution; CP3 adds the readout).
 *
 * "Active floor" language: the plan's floors[] are sorted with strictly
 * increasing elevations (schema guarantee), so attribution is a scan.
 */

import type { Floor, FloorplanData, Room } from '../shared/schema';
import { pointInRing } from '../geom';

/**
 * Elevation tolerance for floor attribution, meters. Foot z lands on its
 * plane via resolveGroundZ, but float noise from the ramp integration
 * can park it a hair BELOW the plane (2.6999999 on 2.7) and a strict
 * comparison would strand the walker on the wrong storey.
 */
const FLOOR_ATTRIBUTION_EPS = 1e-3;

/**
 * Storey index the walker's FEET belong to: the highest floor whose
 * elevation is at or below z. Mid-stair walkers keep the DEPARTURE
 * storey until they crest (elevations are planes, not slabs) — the same
 * convention the grounding resolver uses for fencing. Clamped to 0 for
 * an empty plan or a z below the lowest floor: never returns -1.
 */
export function attributeFloorIdx(
  floors: readonly Floor[],
  z: number,
): number {
  let idx = 0;
  for (let i = 0; i < floors.length; i += 1) {
    const elevation = floors[i]?.elevation ?? 0;
    if (elevation <= z + FLOOR_ATTRIBUTION_EPS) idx = i;
    else break; // strictly increasing: nothing further can qualify
  }
  return idx;
}

/**
 * The room of ONE floor whose polygon contains (x, y), or null. Pure
 * ray-casting through the shared src/geom predicate — concave rooms
 * behave.
 */
export function roomAt(
  floor: Floor | undefined,
  x: number,
  y: number,
): Room | null {
  if (!floor) return null;
  for (const room of floor.rooms) {
    if (pointInRing(x, y, room.polygon)) return room;
  }
  return null;
}

/**
 * The HUD readout string: the name of the room the walker stands in on
 * its ATTRIBUTED storey, or the string `Outside` — honest rather than
 * blank, so an out-of-room walker (a walled yard, mid-stair) is
 * distinguishable from "no walker at all" (the readout is cleared by
 * the caller when walk mode is not live).
 */
export function roomReadoutAt(
  plan: Pick<FloorplanData, 'floors'>,
  x: number,
  y: number,
  z: number,
): string {
  const floor = plan.floors[attributeFloorIdx(plan.floors, z)];
  return roomAt(floor, x, y)?.name ?? 'Outside';
}
