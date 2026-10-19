/**
 * pkg 8.1 (issue #83) adapter coverage: compiled roof meshes must land
 * in the dedicated 'roof' material bucket (terracotta), absent roofs
 * must emit NO roof bucket, and the advertised triangleCount must
 * include the roof triangles (golden-count parity).
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData, Room } from '../../src/shared/schema';
import { migrate } from '../../src/shared/schema';
import { compilePlan } from '../../src/geom';
import { adaptScene } from '../../src/viewer/adapter';

/** Rect room (0,0)-(4,3): segments 0 south, 1 east, 2 north, 3 west. */
function plan(roofs?: Array<{ segmentIndex: number; leanDeg: number }>): FloorplanData {
  const room: Record<string, unknown> = {
    id: 'r1',
    name: 'Bed',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ],
    floorTexture: null,
  };
  if (roofs) room.roofs = roofs;
  const mig = migrate({
    schemaVersion: 1,
    units: 'meters',
    wallHeight: 2.7,
    wallThickness: 0.24,
    rooms: [room],
    openings: [],
    furniture: [],
  });
  if (!mig.ok || !mig.data) throw new Error('builder migrate failed');
  return mig.data;
}

function roomsById(p: FloorplanData): Map<string, Room> {
  return new Map(p.floors[0].rooms.map((r) => [r.id, r]));
}

describe('adaptScene — roof bucket routing (pkg 8.1)', () => {
  it('gable leans route to the dedicated roof bucket (6 triangles)', () => {
    const p = plan([
      { segmentIndex: 0, leanDeg: 35 },
      { segmentIndex: 2, leanDeg: 35 },
    ]);
    const adapted = adaptScene(compilePlan(p), roomsById(p));
    const roofBucket = adapted.buckets.find((b) => b.slot === 'roof');
    expect(roofBucket).toBeDefined();
    // Symmetric gable: 2 slope quads (4 tris) + 2 end caps (2 tris).
    expect(roofBucket!.indices.length / 3).toBe(6);
  });

  it('a shed lean routes to the roof bucket (2 triangles)', () => {
    const p = plan([{ segmentIndex: 0, leanDeg: 30 }]);
    const adapted = adaptScene(compilePlan(p), roomsById(p));
    const roofBucket = adapted.buckets.find((b) => b.slot === 'roof');
    expect(roofBucket).toBeDefined();
    expect(roofBucket!.indices.length / 3).toBe(2);
  });

  it('lean-free plans emit NO roof bucket', () => {
    const p = plan();
    const adapted = adaptScene(compilePlan(p), roomsById(p));
    expect(adapted.buckets.find((b) => b.slot === 'roof')).toBeUndefined();
  });

  it('triangleCount includes the roof triangles', () => {
    const leanFree = adaptScene(compilePlan(plan()), roomsById(plan()));
    const gabled = adaptScene(
      compilePlan(
        plan([
          { segmentIndex: 0, leanDeg: 35 },
          { segmentIndex: 2, leanDeg: 35 },
        ]),
      ),
      roomsById(
        plan([
          { segmentIndex: 0, leanDeg: 35 },
          { segmentIndex: 2, leanDeg: 35 },
        ]),
      ),
    );
    expect(gabled.triangleCount - leanFree.triangleCount).toBe(6);
  });
});
