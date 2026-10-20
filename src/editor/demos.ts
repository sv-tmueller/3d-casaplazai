/**
 * Issue #144 (Pkg: First-run experience) — the demo-plan registry.
 *
 * The three shipped fixtures (demo/demo-*.json) are EMBEDDED at build
 * time (static JSON imports; `resolveJsonModule` + Vite bundle them into
 * both the dev server and dist/) so a first-run user needs no network
 * round-trip and the built app is self-contained. No new asset-pipeline
 * switch is introduced.
 *
 * Normalization is LAZY — every loadDemoPlan() call runs the payload
 * through the exact intake door the import/loadPlan paths use:
 *
 *     migrate() → backfillFloorTextures() → validateFloorplan()
 *
 * NOT normalizeIncoming(), which silently degrades to emptyPlan(): a demo
 * that stopped validating would otherwise wipe the user's plan with a
 * shrug. `validateFloorplan` is the gate the fixtures spec already runs,
 * and callers persistSync() the result immediately, so the plan that
 * leaves here is the plan the next boot's hydrate validation accepts.
 *
 * Wire-format note: demo-apartment.json is still schema v1 (the
 * multi-floor packages produced duplex/townhouse at v2) — migrate()
 * upgrades it at the door, exactly like a legacy autosave slot.
 */
import type { FloorplanData } from '../shared/schema';
import { migrate, validateFloorplan } from '../shared/schema';
import { backfillFloorTextures } from './wire';
import apartmentJson from '../../demo/demo-apartment.json';
import duplexJson from '../../demo/demo-duplex.json';
import townhouseJson from '../../demo/demo-townhouse.json';

export type DemoId = 'apartment' | 'duplex' | 'townhouse';

export interface DemoEntry {
  readonly id: DemoId;
  /** Menu / card label, e.g. "Apartment". */
  readonly label: string;
  /** One-line description for the card's demo row (title attribute). */
  readonly hint: string;
  /** Raw fixture payload — normalized on load, never handed out directly. */
  readonly json: unknown;
}

/** Display order everywhere (card demo row + Plans popover). */
export const DEMOS: readonly DemoEntry[] = [
  {
    id: 'apartment',
    label: 'Apartment',
    hint: 'Compact one-bedroom flat',
    json: apartmentJson as unknown,
  },
  {
    id: 'duplex',
    label: 'Duplex',
    hint: 'Two-storey home with stairs',
    json: duplexJson as unknown,
  },
  {
    id: 'townhouse',
    label: 'Townhouse',
    hint: 'Narrow two-storey footprint',
    json: townhouseJson as unknown,
  },
];

/** Registry lookup; throws on an unknown id (a programming error, not UX). */
export function demoById(id: DemoId): DemoEntry {
  const entry = DEMOS.find((d) => d.id === id);
  if (!entry) throw new Error(`unknown demo id: ${String(id)}`);
  return entry;
}

/**
 * Normalize demo `id` into a validated current-schema plan.
 *
 * Throws when the embedded fixture cannot be normalized/validated: that
 * means the SHIPPED ASSET is broken, so failing loudly (rather than
 * swapping in an empty plan) is the honest behavior — the unit spec
 * `tests/unit/firstRun.spec.ts` guards every fixture the same way
 * `tests/unit/fixtures.spec.ts` guards demo-apartment.json.
 *
 * Order note: backfill runs BEFORE validateFloorplan because the
 * validator rejects `floorTexture: undefined` (issue #119: migrate()
 * leaves the key absent). Backfilling first makes validation strictly
 * more likely to pass and never changes an accepted plan's meaning.
 */
export function loadDemoPlan(id: DemoId): FloorplanData {
  const entry = demoById(id);
  const migrated = migrate(entry.json);
  if (!migrated.ok || !migrated.data) {
    throw new Error(`demo "${entry.id}" failed to migrate to the current schema`);
  }
  const validated = validateFloorplan(backfillFloorTextures(migrated.data));
  if (!validated.ok) {
    throw new Error(`demo "${entry.id}" is invalid: ${validated.errors[0].message}`);
  }
  // Fresh copy per call: callers hand the result to the store (which
  // clones) and to persistSync, and tests mutate what they get back.
  return JSON.parse(JSON.stringify(validated.value)) as FloorplanData;
}
