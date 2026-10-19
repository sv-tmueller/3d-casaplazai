/**
 * Quality knob (issue #87): owns the ?quality= URL-param read for the
 * viewer. Kept in a tiny standalone module (rather than inside
 * appController) so #86's upcoming lighting knob can consume the same
 * parser without either package owning the other's call sites.
 *
 * Semantics (ratified on batch #85): default HIGH when the param is
 * absent — preserves today's textured look with zero visual churn;
 * ?quality=low is the OPT-IN fast path that flattens procedural
 * textures (color-only materials, same roughness budget).
 */

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
