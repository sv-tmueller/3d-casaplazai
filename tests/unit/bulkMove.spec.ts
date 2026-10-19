/**
 * Unit tests for the pkg 14.2 per-follower bulk-move adjudication
 * (issue #117, SUB_PLAN step 2): judgeBulkFollow — every selected
 * furniture member rides the grabbed delta only as far as ITS OWN
 * room allows (judgeMoveTarget per follower): contained followers
 * keep the raw delta, wall-bound followers clamp to the nearest
 * contained pose, reject-sized / homeless followers park, and
 * non-furniture members (rooms/openings, or ids a delete raced) are
 * skipped.
 */
import { describe, expect, it } from 'vitest';
import type { FloorplanData } from '../../src/shared/schema';
import { emptyPlan } from '../../src/editor/store';
import { judgeBulkFollow } from '../../src/editor/controller';

function plan(): FloorplanData {
  const p = emptyPlan();
  p.floors[0].rooms = [
    {
      id: 'living',
      name: 'Living',
      polygon: [[0, 0], [6, 0], [6, 6], [0, 6]],
      floorTexture: null,
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      polygon: [[6, 0], [10, 0], [10, 6], [6, 6]],
      floorTexture: null,
    },
    {
      id: 'tiny',
      name: 'Tiny',
      polygon: [[20, 0], [20.8, 0], [20.8, 0.8], [20, 0.8]],
      floorTexture: null,
    },
  ];
  p.floors[0].furniture = [
    {
      id: 'bed1',
      type: 'table',
      roomId: 'living',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [1, 2],
    },
    {
      id: 'bed2',
      type: 'table',
      roomId: 'kitchen',
      position: [8, 2],
      rotationDeg: 0,
      footprint: [1, 2],
    },
    {
      id: 'huge',
      type: 'table',
      roomId: 'tiny',
      position: [20.4, 0.4],
      rotationDeg: 0,
      footprint: [1, 2],
    },
    {
      id: 'drift',
      type: 'table',
      roomId: 'nope',
      position: [2, 2],
      rotationDeg: 0,
      footprint: [1, 2],
    },
  ];
  return p;
}

describe('judgeBulkFollow (issue #117)', () => {
  it('contained followers ride the raw delta exactly', () => {
    const out = judgeBulkFollow(plan(), ['bed1', 'bed2'], [0.5, 0.25]);
    expect(out).toEqual([
      { id: 'bed1', pos: [2.5, 2.25] },
      { id: 'bed2', pos: [8.5, 2.25] },
    ]);
  });

  it('clamps a follower whose target would cross its room wall', () => {
    // bed1's target (5.8, 2) pokes past living's east wall (usable
    // center x <= 6 - 0.5) -> nearest contained pose, NOT the target.
    const out = judgeBulkFollow(plan(), ['bed1'], [3.8, 0]);
    expect(out).toEqual([{ id: 'bed1', pos: [5.5, 2] }]);
    // Legality: the clamped pose keeps the whole footprint inside.
    expect(5.5 + 0.5).toBeLessThanOrEqual(6);
  });

  it('parks reject-sized or homeless followers at their current position', () => {
    // 'huge' cannot fit 'tiny' (1x2 footprint vs a 0.8 m room bbox) and
    // 'drift' points at a dangling room with a target outside every
    // room - both reject, so both PARK rather than clip.
    const out = judgeBulkFollow(plan(), ['huge', 'drift'], [20, 20]);
    expect(out).toEqual([
      { id: 'huge', pos: [20.4, 0.4] },
      { id: 'drift', pos: [2, 2] },
    ]);
  });

  it('skips non-furniture members and raced deletes, preserving order', () => {
    // 'living' is a room id, 'ghost' raced a delete - neither may abort
    // or reorder the furniture entries.
    const out = judgeBulkFollow(
      plan(),
      ['living', 'bed1', 'ghost', 'bed2'],
      [0.5, 0.25],
    );
    expect(out).toEqual([
      { id: 'bed1', pos: [2.5, 2.25] },
      { id: 'bed2', pos: [8.5, 2.25] },
    ]);
    expect(judgeBulkFollow(plan(), [], [1, 1])).toEqual([]);
  });
});
