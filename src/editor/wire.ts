/**
 * Wire-format converters for pkg 7.1 (schema v2 core), rescoped by pkg
 * 7.2 (issue #75, ratified decision (a)).
 *
 * The editor STORE is v2-native and — since 7.2 — the
 * casaplaza.autosave.v1 localStorage SLOT ALSO carries raw v2 data
 * (multi-floor plans must round-trip; hydration migrates-at-the-door
 * so older v1 payloads keep loading). toLegacyWire therefore serves
 * the window.__casaplaza BRIDGE ONLY: getData/loadPlan keep speaking
 * the frozen v1 wire shape consumed by the e2e suite and embedders.
 */
import type { FloorplanData, FloorplanDataV1 } from '../shared/schema';
import { migrate } from '../shared/schema';
import { emptyPlan } from './store';

/** Flatten the (ground-)floor-nested plan into the v1 wire shape (BRIDGE ONLY). */
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
