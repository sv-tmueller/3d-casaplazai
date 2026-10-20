/**
 * Shared point-in-ring predicate (issue #147 CP1).
 *
 * Both surfaces need "is this plan point inside that room polygon?":
 * the viewer's room readout ("Outside" when no room contains the
 * walker) and the editor's place-camera / glyph validity checks.
 * Point-in-polygon historically lived in src/editor/geom.ts, but the
 * viewer may NOT import editor code (layering law, mini3d.ts header) —
 * so the canonical implementation lives here, three-free and shared.
 * src/editor/geom.ts re-exports/wraps it so no existing call site or
 * test has to move.
 *
 * Ray-casting (even-odd rule) so concave rings behave — the wall-lean
 * and L-shaped rooms in real plans are not convex.
 */

/** A ring vertex. Readonly-tolerant: schema polygons arrive frozen. */
export type RingPoint = readonly [number, number];

/**
 * True when (x, y) lies inside the closed ring. Boundary points fall
 * out of the even-odd rule exactly as the editor's long-standing
 * pointInPolygon did — one implementation now backs both.
 */
export function pointInRing(
  x: number,
  y: number,
  ring: readonly RingPoint[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
