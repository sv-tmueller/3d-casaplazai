/**
 * Materials (issue #179): the material factory behind the scene builder.
 * Textured slots are physically based: colour, normal and roughness/AO
 * maps from the CC0 sets committed under `public/assets/materials/`,
 * loaded lazily by `./assets/loader` (the surface starts as its flat
 * colour and upgrades in place when the files arrive; a failed download
 * keeps the flat colour). The procedural canvas drawers of #6/#87 are
 * retired.
 *
 * Quality knob (#87): buildMaterial(slot, hiQuality). LOW renders flat
 * colours, keeps HIGH's roughness budget so gloss differentiation
 * survives, and issues no texture request. Anisotropy is a
 * session-wide setter owned by the loader and re-exported here.
 */

import { Color, MeshStandardMaterial } from 'three';
import { createPbrMaterial } from './assets/loader';
import { setForSlot } from './assets/manifest';
import type { MaterialSlotId } from './types';

export { setMaxAnisotropy } from './assets/loader';

/** Every bucket slot buildMaterial accepts: the adapter's slot union, no more. */
export type MaterialSlot = MaterialSlotId;

/**
 * Flat roughness per slot: the shipped budget (glass 0.15 well below
 * wall 0.92), identical on both quality tiers so gloss differentiation
 * survives the LOW fast path.
 */
const FLAT_ROUGHNESS: Record<MaterialSlot, number> = {
  wall: 0.92,
  ceiling: 1,
  roof: 0.85,
  glass: 0.15,
  windowFrame: 0.6,
  'furn-wood': 0.72,
  'furn-fabric': 0.95,
  'furn-porcelain': 0.25,
  'furn-laminate': 0.55,
  wood: 0.72,
  tile: 0.72,
  carpet: 1,
  concrete: 0.72,
};

/** Flat colours: the LOW look, and the HIGH look until a set arrives. */
const SLOT_FLAT_COLORS: Record<MaterialSlot, string> = {
  wall: '#e8e2d8',
  ceiling: '#fafafa',
  roof: '#b0623f',
  glass: '#aac8dd',
  windowFrame: '#3a3f44',
  'furn-wood': '#a06a3c',
  'furn-fabric': '#7a8ba0',
  'furn-porcelain': '#f4f4f0',
  'furn-laminate': '#c8b89a',
  wood: '#a06a3c',
  tile: '#ccd3d8',
  carpet: '#6b7f8f',
  concrete: '#9aa0a6',
};

/**
 * Linear albedo gain once a set has loaded, for sets whose scanned
 * albedo sits darker than the surface should read. Absent = 1 (the map
 * as shot). Values above 1 brighten: three.js does not clamp `color`.
 * The ceiling set is a mid-grey painted plaster; ceilings are white.
 */
const UPGRADED_GAIN: Partial<Record<MaterialSlot, number>> = {
  ceiling: 3,
};

/** Matte slots: no AO sampler (indirect light there is a flat hemisphere). */
const MATTE_SLOTS: ReadonlySet<MaterialSlot> = new Set<MaterialSlot>([
  'wall',
  'ceiling',
  'roof',
  'carpet',
]);

/** Tint colour for a linear gain; undefined keeps the loader's white. */
function gainColor(gain: number | undefined): Color | undefined {
  return gain === undefined ? undefined : new Color().setScalar(gain);
}

/** Roughness scalar once the roughness map is in. Absent = 1 (map drives it). */
const UPGRADED_ROUGHNESS: Partial<Record<MaterialSlot, number>> = {};

/** Flat colour + roughness of the ground plot (LOW, and HIGH before the grass loads). */
export const GROUND_FLAT_COLOR = '#6f8a4e';
const GROUND_ROUGHNESS = 0.95;

/** Material for the ground plot: grass on HIGH, flat colour on LOW. */
export function buildGroundMaterial(hiQuality = true): MeshStandardMaterial {
  if (!hiQuality) {
    return new MeshStandardMaterial({
      color: new Color(GROUND_FLAT_COLOR),
      roughness: GROUND_ROUGHNESS,
      metalness: 0,
    });
  }
  return createPbrMaterial('grass', {
    color: GROUND_FLAT_COLOR,
    roughness: GROUND_ROUGHNESS,
    ao: false,
  });
}

/**
 * Build the material for a bucket slot. `hiQuality` gates the texture
 * pass: HIGH returns a mapped material at once (placeholders, flat
 * look) that upgrades in place; LOW returns flat colour and never
 * touches the loader. Glass, window frames and the non-wood furniture
 * stay flat at both tiers.
 */
export function buildMaterial(slot: MaterialSlot, hiQuality = true): MeshStandardMaterial {
  if (slot === 'glass') {
    // Translucent pane: pale blue, cheap transparency, no depth write
    // (avoids sorting artifacts against wall rims). Must NOT cast
    // shadows: sceneBuilder only enables castShadow for 'wall'.
    return new MeshStandardMaterial({
      color: new Color(SLOT_FLAT_COLORS.glass),
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      roughness: FLAT_ROUGHNESS.glass,
      metalness: 0,
    });
  }
  if (slot === 'windowFrame') {
    return new MeshStandardMaterial({
      color: new Color(SLOT_FLAT_COLORS.windowFrame),
      roughness: FLAT_ROUGHNESS.windowFrame,
      metalness: 0.1,
    });
  }

  const setId = hiQuality ? setForSlot(slot) : null;
  if (setId) {
    return createPbrMaterial(setId, {
      color: SLOT_FLAT_COLORS[slot],
      roughness: FLAT_ROUGHNESS[slot],
      upgradedColor: gainColor(UPGRADED_GAIN[slot]),
      upgradedRoughness: UPGRADED_ROUGHNESS[slot],
      ao: !MATTE_SLOTS.has(slot),
    });
  }
  return new MeshStandardMaterial({
    color: new Color(SLOT_FLAT_COLORS[slot]),
    roughness: FLAT_ROUGHNESS[slot],
    metalness: 0,
  });
}
