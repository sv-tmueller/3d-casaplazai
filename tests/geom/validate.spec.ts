import { describe, expect, it } from 'vitest';
import type { FloorplanData } from '../../src/shared/schema';
import { parseValidatedPlan, validateGeometry } from '../../src/geom/validate';
import {
  FurnitureOutOfBoundsError,
  InvalidPolygonError,
  MissingRoomReferenceError,
  OpeningOverflowError,
  OverlappingOpeningsError,
} from '../../src/geom/errors';

function basePlan(): FloorplanData {
  return {
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [
      {
        id: 'r1',
        name: 'Hallway',
        polygon: [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
        ],
        floorTexture: null,
      },
    ],
    openings: [],
    furniture: [],
  };
}

describe('geom/validate — parseValidatedPlan', () => {
  it('passes pkg 1-clean plans straight through', () => {
    expect(parseValidatedPlan(basePlan()).rooms).toHaveLength(1);
  });

  it('lifts schema violations into InvalidPolygonError', () => {
    const bad = basePlan() as unknown as Record<string, unknown>;
    bad.wallHeight = -1;
    expect(() => parseValidatedPlan(bad)).toThrow(InvalidPolygonError);
    expect(() => parseValidatedPlan(null)).toThrow(/schema validator/);
  });
});

describe('geom/validate — validateGeometry', () => {
  it('throws MissingRoomReferenceError for dangling opening refs', () => {
    const plan = basePlan();
    plan.openings = [
      { id: 'o1', roomId: 'ghost', kind: 'door', segmentIndex: 0, tCenter: 0.5, width: 0.9, sillHeight: 0, headHeight: 2.1 },
    ];
    expect(() => validateGeometry(plan)).toThrow(MissingRoomReferenceError);
  });

  it('throws OpeningOverflowError reporting maximal width', () => {
    const plan = basePlan();
    plan.openings = [
      { id: 'o-big', roomId: 'r1', kind: 'door', segmentIndex: 0, tCenter: 0.5, width: 5, sillHeight: 0, headHeight: 2.1 },
    ];
    expect(() => validateGeometry(plan)).toThrow(OpeningOverflowError);
    try {
      validateGeometry(plan);
    } catch (err) {
      expect(err instanceof OpeningOverflowError ? String(err.message) : '').toContain('4.0000');
    }
  });

  it('detects longitudinal overlap of two openings on one segment', () => {
    const plan = basePlan();
    plan.openings = [
      { id: 'oa', roomId: 'r1', kind: 'door', segmentIndex: 0, tCenter: 0.3, width: 1.0, sillHeight: 0, headHeight: 2.1 },
      { id: 'ob', roomId: 'r1', kind: 'door', segmentIndex: 0, tCenter: 0.5, width: 1.0, sillHeight: 0, headHeight: 2.1 },
    ];
    expect(() => validateGeometry(plan)).toThrow(OverlappingOpeningsError);
  });

  it('tolerates kissing (touching) openings', () => {
    const plan = basePlan();
    plan.openings = [
      { id: 'ok1', roomId: 'r1', kind: 'door', segmentIndex: 0, tCenter: 0.25, width: 1.0, sillHeight: 0, headHeight: 2.1 },
      { id: 'ok2', roomId: 'r1', kind: 'door', segmentIndex: 0, tCenter: 0.5, width: 1.0, sillHeight: 0, headHeight: 2.1 },
    ];
    expect(() => validateGeometry(plan)).not.toThrow();
  });

  it('flags clockwise rewound polygons', () => {
    const plan = basePlan();
    plan.rooms[0].polygon.reverse();
    expect(() => validateGeometry(plan)).toThrow(/clockwise/);
  });

  it('throws FurnitureOutOfBoundsError for escaped furniture', () => {
    const plan = basePlan();
    plan.furniture = [
      { id: 'f1', type: 'sofa', roomId: 'r1', position: [3.9, 1], rotationDeg: 0, footprint: [0.5, 0.5] },
    ];
    expect(() => validateGeometry(plan)).toThrow(FurnitureOutOfBoundsError);
  });

  it('accepts contained furniture', () => {
    const plan = basePlan();
    plan.furniture = [
      { id: 'f-ok', type: 'sofa', roomId: 'r1', position: [2, 1], rotationDeg: 33, footprint: [0.5, 0.5] },
    ];
    expect(() => validateGeometry(plan)).not.toThrow();
  });
});
