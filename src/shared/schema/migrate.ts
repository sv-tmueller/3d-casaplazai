/**
 * Version-keyed migration registry for FloorplanData.
 *
 * Convention: to introduce schema v(N+1), register a pure transform
 *   transforms[N] = (data: FloorplanData_N) => FloorplanData_{N+1};
 * migrate() chains registered steps from the incoming schemaVersion up
 * to the current SCHEMA_VERSION. Data newer than the reader’s version is
 * rejected (forward-compat is a manual upgrade concern).
 */
import type { Floor, FloorplanData, FloorplanDataV1 } from './types';
import { SCHEMA_VERSION } from './types';
import type { ValidationError } from './validate';

type Transform = (data: FloorplanData) => FloorplanData;

/**
 * Wrap v1's three flat collections into one ground Floor. The wrap is
 * geometrically transparent: arrays are carried BY REFERENCE (no copy,
 * no reorder), so compiling a migrated plan reproduces byte-identical
 * geometry — that identity is the acceptance bar for this transform.
 */
function v1ToV2(data: FloorplanDataV1): FloorplanData {
  const ground: Floor = {
    id: 'floor-ground',
    name: 'Ground',
    elevation: 0,
    rooms: data.rooms,
    openings: data.openings,
    furniture: data.furniture,
  };
  return {
    schemaVersion: 2,
    units: data.units,
    wallHeight: data.wallHeight,
    wallThickness: data.wallThickness,
    floors: [ground],
    stairs: [],
  };
}

/** Ordered map: fromVersion -> transform producing fromVersion + 1. */
const transforms: Record<number, Transform> = {};

/**
 * Register a migration step. Exported for tests and future versions;
 * production code registers at module init only.
 */
export function registerTransform(fromVersion: number, fn: Transform): void {
  if (transforms[fromVersion]) {
    throw new Error(`transform from v${fromVersion} already registered`);
  }
  transforms[fromVersion] = fn as Transform;
}

export interface MigrationResult {
  ok: boolean;
  data?: FloorplanData;
  errors?: ValidationError[];
}

export interface MigrateOptions {
  /** Target version override; defaults to SCHEMA_VERSION. Test seam. */
  to?: number;
}

/**
 * Bring `parsed` up to SCHEMA_VERSION by chaining registered transforms.
 * Unknown/unregistered intermediate versions fail loudly rather than
 * guessing.
 */
export function migrate(parsed: unknown, options: MigrateOptions = {}): MigrationResult {
  const target = options.to ?? SCHEMA_VERSION;
  const obj = parsed as { schemaVersion?: unknown } | null;
  const from = typeof obj?.schemaVersion === 'number' ? obj.schemaVersion : NaN;

  if (!Number.isInteger(from) || from < 1) {
    return {
      ok: false,
      errors: [{
        path: 'schemaVersion',
        code: 'migration-invalid-version',
        message: `cannot migrate: schemaVersion must be a positive integer, got ${obj?.schemaVersion}`,
      }],
    };
  }

  let data = obj as unknown as FloorplanData;
  let v = from;
  while (v < target) {
    const step = transforms[v];
    if (!step) {
      return {
        ok: false,
        errors: [{
          path: 'schemaVersion',
          code: 'migration-gap',
          message: `no registered transform from schemaVersion ${v} toward ${SCHEMA_VERSION}`,
        }],
      };
    }
    data = step(data);
    v += 1;
  }

  if (from > target) {
    return {
      ok: false,
      errors: [{
        path: 'schemaVersion',
        code: 'future-version',
        message: `data written by schema v${from}; this reader understands up to v${target}`,
      }],
    };
  }

  return { ok: true, data };
}

// Registered at module init: v1 is a frozen historical shape, so the
// transform is statically known (tests may register FUTURE steps only).
registerTransform(1, v1ToV2 as unknown as Transform);
