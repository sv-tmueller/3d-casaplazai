import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FloorplanData } from '../../src/shared/schema';
import { FLOOR_TEXTURES, migrate, signedArea, validateFloorplan } from '../../src/shared/schema';

// Demo stays v1 on disk; migrate first (mirrors the loaders).
function loadDemo(): FloorplanData {
  const raw = readFileSync(join(process.cwd(), 'demo', 'demo-apartment.json'), 'utf8');
  const mig = migrate(JSON.parse(raw));
  if (!mig.ok || !mig.data) throw new Error('demo failed to migrate');
  return mig.data;
}

describe('validateFloorplan — happy path', () => {
  it('accepts the committed demo fixture', () => {
    const result = validateFloorplan(loadDemo());
    expect(result.ok).toBe(true);
  });

  it('reports no errors for a minimal valid plan', () => {
    const plan: FloorplanData = {
      schemaVersion: 2,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      floors: [{
        id: 'floor-ground',
        name: 'Ground',
        elevation: 0,
        rooms: [{
          id: 'r1',
          name: 'Hall',
          polygon: [[0, 0], [2, 0], [2, 2], [0, 2]],
          floorTexture: null,
        }],
        openings: [],
        furniture: [],
      }],
      stairs: [],
    };
    expect(validateFloorplan(plan)).toMatchObject({ ok: true });
  });
});

describe('validateFloorplan — mandated rejections', () => {
  it.each([
    ['negative width', (p: FloorplanData) => { p.floors[0].openings[0]!.width = -0.9; }, 'negative-width'],
    ['unknown floor texture', (p: FloorplanData) => { p.floors[0].rooms[0]!.floorTexture = 'marble' as never; }, 'unknown-floor-texture'],
    ['unknown furniture type', (p: FloorplanData) => { p.floors[0].furniture[0]!.type = 'lamp' as never; }, 'unknown-furniture-type'],
    ['tCenter below 0', (p: FloorplanData) => { p.floors[0].openings[0].tCenter = -0.01; }, 'tcenter-out-of-range'],
    ['tCenter above 1', (p: FloorplanData) => { p.floors[0].openings[0].tCenter = 1.01; }, 'tcenter-out-of-range'],
    ['clockwise (non-CCW) polygon', (p: FloorplanData) => { p.floors[0].rooms[0]!.polygon.reverse(); }, 'non-ccw-polygon'],
    ['dangling roomId on opening', (p: FloorplanData) => { p.floors[0].openings[0].roomId = 'ghost-room'; }, 'dangling-ref'],
    ['dangling roomId on furniture', (p: FloorplanData) => { p.floors[0].furniture[0]!.roomId = 'ghost-room'; }, 'dangling-ref'],
    ['duplicate entity ids', (p: FloorplanData) => { p.floors[0].furniture[0]!.id = p.floors[0].rooms[0]!.id; }, 'duplicate-id'],
    ['opening wider than its segment', (p: FloorplanData) => { p.floors[0].openings[0].width = 99; }, 'opening-too-wide'],
    ['segmentIndex out of bounds', (p: FloorplanData) => { p.floors[0].openings[0].segmentIndex = 999; }, 'segment-out-of-range'],
    ['non-positive wallHeight', (p: FloorplanData) => { p.wallHeight = 0; }, 'bad-wall-height'],
    ['non-positive footprint extent', (p: FloorplanData) => { p.floors[0].furniture[0]!.footprint = [0, 1]; }, 'degenerate-footprint'],
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

describe('floor textures (pkg 14.4, issue #119)', () => {
  it('exposes the canonical four through the barrel', () => {
    expect(FLOOR_TEXTURES).toEqual(['wood', 'tile', 'carpet', 'concrete']);
  });

  it('accepts every variant — and null — on any room', () => {
    // The four kinds are the picker's whole vocabulary; null is "no
    // material". All five must sail through the validator untouched.
    for (const texture of [...FLOOR_TEXTURES, null]) {
      const plan = loadDemo();
      plan.floors[0].rooms[0]!.floorTexture = texture;
      expect(validateFloorplan(plan)).toMatchObject({ ok: true });
    }
  });
});
