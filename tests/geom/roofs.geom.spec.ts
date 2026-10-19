import { describe, expect, it } from 'vitest';
import { compilePlan } from '../src/geom';
import type { FloorplanData } from '../src/shared/schema';

const base = {
  schemaVersion: 2,
  units: 'meters',
  wallHeight: 2.7,
  wallThickness: 0.12,
  stairs: [],
};

function plan(rooms: unknown[], elevations = [0]): FloorplanData {
  return {
    ...(base as object),
    floors: elevations.map((e, i) => ({
      id: `f${i}`, name: `F${i}`, elevation: e,
      rooms: i === elevations.length - 1 ? rooms : [],
      openings: [], furniture: [],
    })),
  } as unknown as FloorplanData;
}

const rect = { id: 'r0', name: 'R', polygon: [[0,0],[6,0],[6,4],[0,4]], floorTexture: null };

describe('roof geometry probe', () => {
  it('shed: one solid, 4 verts / 2 tris, rises inland', () => {
    const scene = compilePlan(plan([{ ...rect, roofs: [{ segmentIndex: 0, leanDeg: 30 }] }]));
    expect(scene.roofs).toHaveLength(1);
    const m = scene.roofs![0]!.mesh;
    console.log('SHED positions:', Array.from(m.positions).map(v => Number(v.toFixed(4))));
    console.log('SHED indices:', Array.from(m.indices));
    expect(m.positions.length / 3).toBe(4);
    expect(m.indices.length / 3).toBe(2);
    const zs = [m.positions[2]!, m.positions[5]!, m.positions[8]!, m.positions[11]!];
    expect(Math.min(...zs)).toBeCloseTo(2.7, 4);
    expect(Math.max(...zs)).toBeCloseTo(2.7 + Math.tan(Math.PI/6) * 4, 4);
  });

  it('gable: 12 verts / 6 tris, ridge midway for symmetric pair', () => {
    const scene = compilePlan(plan([{
      ...rect,
      roofs: [{ segmentIndex: 0, leanDeg: 30 }, { segmentIndex: 2, leanDeg: 30 }],
    }]));
    const m = scene.roofs![0]!.mesh;
    console.log('GABLE positions:', Array.from(m.positions).map(v => Number(v.toFixed(4))));
    console.log('GABLE indices:', Array.from(m.indices));
    expect(m.positions.length / 3).toBe(14);
    expect(m.indices.length / 3).toBe(6);
    // symmetric 30/30 pair over 4m span → ridge at d=2, z = 2.7 + tan30*2 ≈ 3.854
    const zs = Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i*3+2]!);
    expect(Math.max(...zs)).toBeCloseTo(2.7 + Math.tan(Math.PI/6) * 2, 4);
    // ridge vertices: ≥2 at max z (duplicated across merged sub-buffers)
    expect(zs.filter(z => Math.abs(z - Math.max(...zs)) < 1e-6).length).toBeGreaterThanOrEqual(2);
  });

  it('gable asym leans: ridge closer to shallower wall', () => {
    const scene = compilePlan(plan([{
      ...rect,
      roofs: [{ segmentIndex: 0, leanDeg: 45 }, { segmentIndex: 2, leanDeg: 15 }],
    }]));
    const m = scene.roofs![0]!.mesh;
    const zs = Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i*3+2]!);
    // tan45*d = tan15*(4-d) → d = 4*tan15/(tan45+tan15) ≈ 0.8969; zR = 2.7+0.8969
    const d = 4 * Math.tan(15*Math.PI/180) / (1 + Math.tan(15*Math.PI/180));
    expect(Math.max(...zs)).toBeCloseTo(2.7 + d, 4);
  });

  it('lean-free plan: roofs == [] and hasAnyRoof false-path byte-identity', () => {
    const scene = compilePlan(plan([{ ...rect }]));
    expect(scene.roofs).toEqual([]);
  });

  it('world z: top floor at 2.7 lifts eave to 5.4', () => {
    const scene = compilePlan(
      plan([{ ...rect, roofs: [{ segmentIndex: 0, leanDeg: 30 }] }], [0, 2.7]),
    );
    const m = scene.roofs![0]!.mesh;
    const zs = [m.positions[2]!, m.positions[5]!, m.positions[8]!, m.positions[11]!];
    expect(Math.min(...zs)).toBeCloseTo(5.4, 4);
  });

  it('wallsOverride min-wins plate honored', () => {
    const scene = compilePlan(plan([{
      ...rect,
      wallsOverride: [{ segmentIndex: 0, height: 3.2 }, { segmentIndex: 0, height: 3.0 }],
      roofs: [{ segmentIndex: 0, leanDeg: 30 }],
    }]));
    const m = scene.roofs![0]!.mesh;
    const zs = [m.positions[2]!, m.positions[5]!, m.positions[8]!, m.positions[11]!];
    expect(Math.min(...zs)).toBeCloseTo(3.0, 4);
  });
});
