/**
 * pkg 8.1 (issue #83) schema-validator coverage: every roof-* rejection
 * code, plus the accepted compositions (shed, symmetric + asymmetric
 * gable). Built on the same migrate-wrapped v1 builder pattern the rest
 * of the validator specs use.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, RoofSpec } from '../../src/shared/schema';
import { migrate, validateFloorplan } from '../../src/shared/schema';

/** Rect room (0,0)-(4,3): segments 0 south, 1 east, 2 north, 3 west. */
const RECT_POLY: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];

function plan(opts: {
  roofs?: RoofSpec[];
  wallsOverride?: Array<{ segmentIndex: number; height: number }>;
  twoFloors?: boolean;
}): FloorplanData {
  const room: Record<string, unknown> = {
    id: 'r1',
    name: 'Bed',
    polygon: RECT_POLY,
    floorTexture: null,
  };
  if (opts.roofs) room.roofs = opts.roofs;
  if (opts.wallsOverride) room.wallsOverride = opts.wallsOverride;
  const v1 = {
    schemaVersion: 1 as const,
    units: 'meters' as const,
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [room],
    openings: [],
    furniture: [],
  };
  const mig = migrate(v1);
  if (!mig.ok || !mig.data) throw new Error('builder migrate failed');
  if (opts.twoFloors) {
    // Duplicate the room onto a second storey (fresh id).
    const upper = { ...(mig.data.floors[0].rooms[0] as object) } as Record<
      string,
      unknown
    >;
    upper.id = 'r2';
    mig.data.floors.push({
      id: 'floor-upper',
      name: 'Upper',
      elevation: 2.7,
      rooms: [upper as never],
      openings: [],
      furniture: [],
    });
  }
  return mig.data;
}

function codes(plan: FloorplanData): string[] {
  const res = validateFloorplan(plan);
  return res.ok ? [] : res.errors.map((e) => e.code);
}

describe('validateFloorplan — roof leans (pkg 8.1)', () => {
  it('accepts a shed (single lean)', () => {
    expect(validateFloorplan(plan({ roofs: [{ segmentIndex: 0, leanDeg: 30 }] })).ok).toBe(true);
  });

  it('accepts a symmetric gable pair', () => {
    expect(
      validateFloorplan(
        plan({
          roofs: [
            { segmentIndex: 0, leanDeg: 35 },
            { segmentIndex: 2, leanDeg: 35 },
          ],
        }),
      ).ok,
    ).toBe(true);
  });

  it('accepts an asymmetric gable pair (unequal leans)', () => {
    expect(
      validateFloorplan(
        plan({
          roofs: [
            { segmentIndex: 0, leanDeg: 45 },
            { segmentIndex: 2, leanDeg: 15 },
          ],
        }),
      ).ok,
    ).toBe(true);
  });

  it('rejects a lean above 75 (bad-lean)', () => {
    expect(codes(plan({ roofs: [{ segmentIndex: 0, leanDeg: 76 }] }))).toContain('bad-lean');
  });

  it('rejects a negative lean (bad-lean)', () => {
    expect(codes(plan({ roofs: [{ segmentIndex: 0, leanDeg: -1 }] }))).toContain('bad-lean');
  });

  it('rejects an out-of-bounds segmentIndex (segment-out-of-range)', () => {
    expect(codes(plan({ roofs: [{ segmentIndex: 4, leanDeg: 30 }] }))).toContain(
      'segment-out-of-range',
    );
  });

  it('rejects duplicate rows for one segment (duplicate-roof-segment)', () => {
    expect(
      codes(
        plan({
          roofs: [
            { segmentIndex: 0, leanDeg: 30 },
            { segmentIndex: 0, leanDeg: 40 },
          ],
        }),
      ),
    ).toContain('duplicate-roof-segment');
  });

  it('rejects adjacent (non-opposing) leans (roof-invalid-gable)', () => {
    expect(
      codes(
        plan({
          roofs: [
            { segmentIndex: 0, leanDeg: 30 },
            { segmentIndex: 1, leanDeg: 30 },
          ],
        }),
      ),
    ).toContain('roof-invalid-gable');
  });

  it('rejects unequal-length gable pairs (roof-length-mismatch)', () => {
    // Pentagon: south wall 4 m, north wall 2 m — opposing, not equal.
    const pent: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 3],
      [3, 3],
      [0, 3],
    ];
    const p = plan({ roofs: [{ segmentIndex: 0, leanDeg: 30 }] });
    (p.floors[0].rooms[0] as { polygon: Array<[number, number]> }).polygon = pent;
    (p.floors[0].rooms[0] as { roofs?: RoofSpec[] }).roofs = [
      { segmentIndex: 0, leanDeg: 30 },
      { segmentIndex: 2, leanDeg: 30 },
    ];
    expect(codes(p)).toContain('roof-length-mismatch');
  });

  it('rejects three leans (roof-unsupported-config)', () => {
    expect(
      codes(
        plan({
          roofs: [
            { segmentIndex: 0, leanDeg: 30 },
            { segmentIndex: 1, leanDeg: 30 },
            { segmentIndex: 2, leanDeg: 30 },
          ],
        }),
      ),
    ).toContain('roof-unsupported-config');
  });

  it('rejects a plate sunk below wallHeight (roof-plate-too-low)', () => {
    expect(
      codes(
        plan({
          roofs: [{ segmentIndex: 0, leanDeg: 30 }],
          wallsOverride: [{ segmentIndex: 0, height: 1.2 }],
        }),
      ),
    ).toContain('roof-plate-too-low');
  });

  it('rejects roofs on a NON-top floor (roof-not-top-floor)', () => {
    const p = plan({ roofs: [{ segmentIndex: 0, leanDeg: 30 }], twoFloors: true });
    // Move the lean to the GROUND storey's copy.
    const upper = p.floors[1].rooms[0] as { roofs?: RoofSpec[] };
    const ground = p.floors[0].rooms[0] as { roofs?: RoofSpec[] };
    ground.roofs = upper.roofs;
    delete upper.roofs;
    expect(codes(p)).toContain('roof-not-top-floor');
  });

  // ---- reviewer #83 should-fix: the three previously-untested arms ----

  it('rejects extreme-asymmetry leans whose planes meet outside the span (roof-no-ridge)', () => {
    // 75° meets 0.05°: the near-flat plane crosses essentially the whole
    // span before the steep one rises — the meeting point collapses to
    // the 75° wall, inside the 1 mm collar, so no ridge exists.
    expect(
      codes(
        plan({
          roofs: [
            { segmentIndex: 0, leanDeg: 75 },
            { segmentIndex: 2, leanDeg: 0.05 },
          ],
        }),
      ),
    ).toContain('roof-no-ridge');
  });

  it('rejects gable segments staggered along the ridge (roof-invalid-gable)', () => {
    // Trapezoid: south and north walls parallel + equal-ish but offset
    // along their own direction, so spans do not coincide.
    const trap: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [5, 3],
      [1, 3],
    ];
    const p = plan({});
    (p.floors[0].rooms[0] as { polygon: Array<[number, number]> }).polygon = trap;
    (p.floors[0].rooms[0] as { roofs?: RoofSpec[] }).roofs = [
      { segmentIndex: 0, leanDeg: 30 },
      { segmentIndex: 2, leanDeg: 30 },
    ];
    expect(codes(p)).toContain('roof-invalid-gable');
  });

  it('rejects parallel-leaning segments that are not opposing (roof-invalid-gable)', () => {
    // Step-top outline: segments 2 ([10,5]->[6,5]) and 4 ([6,3]->[3,3])
    // are parallel with the SAME traversal direction (tangent dot +1),
    // not antiparallel — the opposition check must fire.
    const step: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 5],
      [6, 5],
      [6, 3],
      [3, 3],
      [3, 5],
      [0, 5],
    ];
    const p = plan({});
    (p.floors[0].rooms[0] as { polygon: Array<[number, number]> }).polygon = step;
    (p.floors[0].rooms[0] as { roofs?: RoofSpec[] }).roofs = [
      { segmentIndex: 2, leanDeg: 30 },
      { segmentIndex: 4, leanDeg: 30 },
    ];
    expect(codes(p)).toContain('roof-invalid-gable');
  });
});
