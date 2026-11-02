/**
 * Enum-to-set mapping spec (issue #179): the schema's floorTexture values
 * and every material slot resolve to a texture set. `null` is read
 * through the adapter, which already folds it to the concrete slot.
 */
import { describe, expect, it } from 'vitest';
import { compilePlan } from '../../src/geom';
import { migrate } from '../../src/shared/schema';
import type { FloorTexture, FloorplanData, Room } from '../../src/shared/schema';
import { adaptScene } from '../../src/viewer/adapter';
import {
  setForFloorTexture,
  setForSlot,
} from '../../src/viewer/assets/manifest';
import type { MaterialSlot } from '../../src/viewer/materials';

describe('floorTexture -> texture set', () => {
  it('maps each named floor texture to its own default set', () => {
    expect(setForFloorTexture('wood')).toBe('oak-planks');
    expect(setForFloorTexture('tile')).toBe('ceramic-tile');
    expect(setForFloorTexture('carpet')).toBe('wool-carpet');
    expect(setForFloorTexture('concrete')).toBe('polished-concrete');
  });

  it('gives the four named floor values four distinct sets', () => {
    const textures: Exclude<FloorTexture, null>[] = ['wood', 'tile', 'carpet', 'concrete'];
    expect(new Set(textures.map(setForFloorTexture)).size).toBe(4);
  });

  it('null renders the polished-concrete set through the adapter fallback', () => {
    const plan: FloorplanData = migrate({
      schemaVersion: 1,
      units: 'meters',
      wallHeight: 2.7,
      wallThickness: 0.24,
      rooms: [
        {
          id: 'r-null',
          name: 'Null',
          polygon: [[0, 0], [2, 0], [2, 2], [0, 2]],
          floorTexture: null,
        },
      ],
      openings: [],
      furniture: [],
    }).data!;
    const rooms = new Map<string, Room>(plan.floors[0].rooms.map((r) => [r.id, r]));
    const adapted = adaptScene(compilePlan(plan), rooms);
    const floor = adapted.buckets.find(
      (b) => b.slot !== 'wall' && b.slot !== 'ceiling' && b.slot !== 'roof',
    );
    expect(floor).toBeDefined();
    expect(setForSlot(floor!.slot)).toBe(setForFloorTexture(null));
    expect(setForFloorTexture(null)).toBe('polished-concrete');
  });
});

describe('slot -> texture set', () => {
  it('routes the architectural slots to their sets', () => {
    expect(setForSlot('wall')).toBe('plaster-white');
    expect(setForSlot('ceiling')).toBe('plaster-ceiling');
    expect(setForSlot('roof')).toBe('roof-shingles');
    expect(setForSlot('wood')).toBe('oak-planks');
    expect(setForSlot('tile')).toBe('ceramic-tile');
    expect(setForSlot('carpet')).toBe('wool-carpet');
    expect(setForSlot('concrete')).toBe('polished-concrete');
    expect(setForSlot('furn-wood')).toBe('oak-planks');
  });

  it.each<MaterialSlot>([
    'glass',
    'windowFrame',
    'furn-fabric',
    'furn-porcelain',
    'furn-laminate',
  ])('%s stays flat (no set)', (slot) => {
    expect(setForSlot(slot)).toBeNull();
  });
});
