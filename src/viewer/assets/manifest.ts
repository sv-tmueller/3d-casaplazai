/**
 * Material asset manifest (issue #179): the physically based texture
 * sets committed under `public/assets/materials/`, their real-world tile
 * sizes, and the mapping from the schema's floorTexture enum and the
 * viewer's material slots onto those sets.
 *
 * Every set is three 1K JPGs: `color.jpg` (sRGB albedo), `normal.jpg`
 * (OpenGL tangent space) and either `arm.jpg` (ambient occlusion in R,
 * roughness in G, metalness in B, the channel layout three.js reads for
 * `aoMap` and `roughnessMap`) or a plain `roughness.jpg`. Sources and
 * licenses live in `public/assets/ATTRIBUTION.md`.
 */

import type { FloorTexture } from '../../shared/schema';
import type { MaterialSlotId } from '../types';

/** Repo-size budget for the committed material files, bytes. */
export const ASSET_BUDGET_BYTES = 25_000_000;

/** Every committed texture set. */
export const TEXTURE_SET_IDS = [
  'oak-planks',
  'herringbone-oak',
  'ceramic-tile',
  'stone-tile',
  'wool-carpet',
  'polished-concrete',
  'plaster-white',
  'plaster-warm',
  'plaster-ceiling',
  'roof-shingles',
  'exterior-render',
  'grass',
  'pavement',
] as const;

export type TextureSetId = (typeof TEXTURE_SET_IDS)[number];

/** One set's loader-facing facts. */
export interface TextureSetSpec {
  /** Real-world span of one texture repetition, meters. */
  tileMeters: number;
  /** True when the roughness file is a packed ARM map (AO in R). */
  packedArm: boolean;
}

/** Tile sizes are the source assets' scanned dimensions. */
const SETS: Record<TextureSetId, TextureSetSpec> = {
  'oak-planks': { tileMeters: 1.2, packedArm: true },
  'herringbone-oak': { tileMeters: 3.4, packedArm: true },
  'ceramic-tile': { tileMeters: 1.27, packedArm: true },
  'stone-tile': { tileMeters: 3, packedArm: true },
  'wool-carpet': { tileMeters: 1.7, packedArm: false },
  'polished-concrete': { tileMeters: 2, packedArm: true },
  'plaster-white': { tileMeters: 2, packedArm: true },
  'plaster-warm': { tileMeters: 3, packedArm: true },
  'plaster-ceiling': { tileMeters: 3.2, packedArm: true },
  'roof-shingles': { tileMeters: 2, packedArm: true },
  'exterior-render': { tileMeters: 1.96, packedArm: true },
  grass: { tileMeters: 15, packedArm: true },
  pavement: { tileMeters: 1.5, packedArm: true },
};

export function textureSetSpec(id: TextureSetId): TextureSetSpec {
  return SETS[id];
}

/** File names of one set, relative to the materials folder. */
function setFileNames(id: TextureSetId): { color: string; normal: string; roughness: string } {
  return {
    color: `${id}/color.jpg`,
    normal: `${id}/normal.jpg`,
    roughness: `${id}/${SETS[id].packedArm ? 'arm' : 'roughness'}.jpg`,
  };
}

/** Every file the manifest declares, relative to `public/assets/materials/`. */
export function manifestFiles(): string[] {
  return TEXTURE_SET_IDS.flatMap((id) => {
    const f = setFileNames(id);
    return [f.color, f.normal, f.roughness];
  });
}

/** Served URL root of the material files (honours the Vite base path). */
const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/materials/`;

/** Served URLs of one set's three maps. */
export function setFileUrls(id: TextureSetId): { color: string; normal: string; roughness: string } {
  const f = setFileNames(id);
  return {
    color: ASSET_ROOT + f.color,
    normal: ASSET_ROOT + f.normal,
    roughness: ASSET_ROOT + f.roughness,
  };
}

/**
 * Default set per schema floorTexture. `null` lands on polished
 * concrete: the adapter already folds a null floor into the concrete
 * slot, so the scene builder cannot tell the two apart this round.
 */
export function setForFloorTexture(texture: FloorTexture): TextureSetId {
  switch (texture) {
    case 'wood':
      return 'oak-planks';
    case 'tile':
      return 'ceramic-tile';
    case 'carpet':
      return 'wool-carpet';
    case 'concrete':
    case null:
      return 'polished-concrete';
  }
}

/**
 * Texture set behind a material slot, or null for the slots that stay
 * flat colour (glass, window frames, upholstery, porcelain, laminate).
 */
export function setForSlot(slot: MaterialSlotId): TextureSetId | null {
  switch (slot) {
    case 'wall':
      return 'plaster-white';
    case 'ceiling':
      return 'plaster-ceiling';
    case 'roof':
      return 'roof-shingles';
    case 'wood':
    case 'tile':
    case 'carpet':
    case 'concrete':
      return setForFloorTexture(slot);
    case 'furn-wood':
      return 'oak-planks';
    case 'glass':
    case 'windowFrame':
    case 'furn-fabric':
    case 'furn-porcelain':
    case 'furn-laminate':
      return null;
  }
}
