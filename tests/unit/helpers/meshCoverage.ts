/**
 * Mesh-coverage probe shared by the geom specs (issue #95, pkg 11.2).
 *
 * Verbatim twin extracted from tests/geom/stairs.spec.ts and
 * tests/geom/townhouse.golden.spec.ts, which carried byte-identical local
 * copies. Zero behavioral change: pure relocation.
 */

/** Point-in-triangle coverage probe over one mesh's xy projection. */
export function covers(
  mesh: { positions: Float32Array; indices: Uint32Array },
  px: number,
  py: number,
): boolean {
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]! * 3;
    const b = mesh.indices[i + 1]! * 3;
    const c = mesh.indices[i + 2]! * 3;
    if (triContains(
      mesh.positions[a]!, mesh.positions[a + 1]!,
      mesh.positions[b]!, mesh.positions[b + 1]!,
      mesh.positions[c]!, mesh.positions[c + 1]!,
      px, py,
    )) return true;
  }
  return false;
}

function triContains(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, px: number, py: number,
): boolean {
  const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
