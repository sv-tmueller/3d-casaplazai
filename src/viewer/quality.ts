/**
 * Quality knob (issue #87): owns the ?quality= URL-param read for the
 * viewer. Issue #178 moved the live setting into AppState (the View tab's
 * Quality segment switches it at runtime); this module keeps the boot
 * parser that seeds it.
 *
 * Semantics (ratified on batch #85): default HIGH when the param is
 * absent — preserves today's textured look with zero visual churn;
 * ?quality=low is the OPT-IN fast path that flattens procedural
 * textures (color-only materials, same roughness budget).
 */

/** The scene builder's quality union (sceneBuilder.QualityLevel). */
export type QualityLevel = 'high' | 'low';

/**
 * True when the viewer should render the expensive material pass
 * (procedural textures, anisotropic filtering). Accepts an explicit
 * search string for testability; defaults to the live location.
 */
export function isHighQuality(
  search: string = window.location.search,
): boolean {
  // Mirror of isPerfEnabled's regex tolerance (appController.ts): match
  // "?quality=" and "&quality=" alike, trailing params included. The
  // lookahead END-ANCHORS the value (#86's stricter parse, adopted
  // during the batch-#85 parser absorption): "?quality=lowest" no
  // longer degrades to LOW — unrecognized ⇒ HIGH, per the doc comment.
  const m = /[?&]quality=(low|high)(?=&|$)/.exec(search);
  // Absent/unrecognized ⇒ HIGH (ratified default); only an explicit
  // "low" opts OUT of the textured pass.
  return !(m && m[1] === 'low');
}

/** Boot quality level for AppState (issue #178). */
export function qualityFromSearch(search: string = window.location.search): QualityLevel {
  return isHighQuality(search) ? 'high' : 'low';
}
