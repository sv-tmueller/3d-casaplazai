import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FloorplanData } from '../../src/shared/schema';
import { signedArea, validateFloorplan } from '../../src/shared/schema';

function loadDemo(): FloorplanData {
  const raw = readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8');
  return JSON.parse(raw) as FloorplanData;
}

describe('validateFloorplan — happy path', () => {
  it('accepts the committed demo fixture', () => {
    const result = validateFloorplan(loadDemo());
    expect(result.ok).toBe(true);
  });

  it('reports no errors for a minimal valid plan', () => {
    const plan: FloorplanData = {
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: [{
        id: 'r1',
        name: 'Hall',
        polygon: [[0, 0], [2, 0], [2, 2], [0, 2]],
        floorTexture: null,
      }],
      openings: [],
      furniture: [],
    };
    expect(validateFloorplan(plan)).toMatchObject({ ok: true });
  });
});

describe('validateFloorplan — mandated rejections', () => {
  it.each([
    ['negative width', (p: FloorplanData) => { p.openings![0]!.width = -0.9; }, 'negative-width'],
    ['unknown floor texture', (p: FloorplanData) => { p.rooms[0]!.floorTexture = 'marble' as never; }, 'unknown-floor-texture'],
    ['unknown furniture type', (p: FloorplanData) => { p.furniture[0]!.type = 'lamp' as never; }, 'unknown-furniture-type'],
    ['tCenter below 0', (p: FloorplanData) => { p.openings[0]!.tCenter = -0.01; }, 'tcenter-out-of-range'],
    ['tCenter above 1', (p: FloorplanData) => { p.openings[0]!.tCenter = 1.01; }, 'tcenter-out-of-range'],
    ['clockwise (non-CCW) polygon', (p: FloorplanData) => { p.rooms[0]!.polygon.reverse(); }, 'non-ccw-polygon'],
    ['dangling roomId on opening', (p: FloorplanData) => { p.openings[0]!.roomId = 'ghost-room'; }, 'dangling-ref'],
    ['dangling roomId on furniture', (p: FloorplanData) => { p.furniture[0]!.roomId = 'ghost-room'; }, 'dangling-ref'],
    ['duplicate entity ids', (p: FloorplanData) => { p.furniture[0]!.id = p.rooms[0]!.id; }, 'duplicate-id'],
    ['opening wider than its segment', (p: FloorplanData) => { p.openings[0]!.width = 99; }, 'opening-too-wide'],
    ['segmentIndex out of bounds', (p: FloorplanData) => { p.openings[0]!.segmentIndex = 999; }, 'segment-out-of-range'],
    ['non-positive wallHeight', (p: FloorplanData) => { p.wallHeight = 0; }, 'bad-wall-height'],
    ['non-positive footprint extent', (p: FloorplanData) => { p.furniture[0]!.footprint = [0, 1]; }, 'degenerate-footprint'],
  ])('rejects %s with expected code', (_label, mutate, expectedCode) => {
    const plan = loadDemo();
    mutate(plan);
    const result = validateFloorplan(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(expectedCode);
    }
  });
});

describe('validator primitives', () => {
  it('shoelace sign distinguishes winding', () => {
    const ccw = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(signedArea(ccw as [number, number][])).toBeCloseTo(1);
    expect(signedArea([...ccw].reverse() as [number, number][])).toBeCloseTo(-1);
  });
});
