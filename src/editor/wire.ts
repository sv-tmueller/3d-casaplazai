/**
 * Wire-format converters for pkg 7.1 (schema v2 core).
 *
 * The editor STORE is v2-native, but the public surfaces — the
 * window.__casaplaza bridge and the casaplaza.autosave.v1 localStorage
 * slot — keep speaking the frozen v1 wire shape (consumed by the e2e
 * suite and by every v1 autosave already in users' browsers). All
 * conversion happens here, at the door: outgoing data flattens the
 * ground floor; incoming data is migrated (v1 -> v2) before it enters
 * the store.
 */
import type { FloorplanData, FloorplanDataV1 } from '../shared/schema';
import { migrate } from '../shared/schema';
import { emptyPlan } from './store';

/** Flatten the (ground-)floor-nested plan into the v1 wire shape. */
export function toLegacyWire(plan: FloorplanData): FloorplanDataV1 {
  const ground = plan.floors[0];
  return {
    schemaVersion: 1,
    units: plan.units,
    wallHeight: plan.wallHeight,
    wallThickness: plan.wallThickness,
    rooms: ground.rooms,
    openings: ground.openings,
    furniture: ground.furniture,
  };
}

/**
 * Normalize ANY incoming plan (v1 wire or v2 native) to current v2.
 * Falls back to the empty plan when the payload is unusable — mirrors
 * the pre-v2 behavior where a bad loadPlan simply swapped the plan.
 */
export function normalizeIncoming(plan: unknown): FloorplanData {
  const migrated = migrate(plan);
  if (migrated.ok && migrated.data) return migrated.data;
  return emptyPlan();
}
