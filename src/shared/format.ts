/**
 * Readout formatters shared by the workspace View tab and the viewer
 * (issue #178; moved out of the retired viewer HUD, #121 / #120 / #146).
 */

/**
 * Slider hours (0…24) as a wall clock ("14:30"). Hostile values clamp:
 * the readout never shows NaN and 24:00 is the ceiling.
 */
export function hoursToClock(hours: number): string {
  if (!Number.isFinite(hours)) return '00:00';
  const minutes = Math.min(24 * 60, Math.max(0, Math.round(hours * 60)));
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** North offset as integer degrees ('30°', '-45°'). */
export function formatNorth(northOffsetDeg: number): string {
  if (!Number.isFinite(northOffsetDeg)) return '0°';
  return `${Math.round(northOffsetDeg)}°`;
}

/**
 * Slider position (0..100) → SH3D wallsAlpha (0..1): one mapping, the
 * slider is the UI and the viewer stores the normalised value.
 */
export function wallsAlphaFromSlider(sliderValue: number): number {
  if (!Number.isFinite(sliderValue)) return 0;
  return Math.min(1, Math.max(0, sliderValue / 100));
}
