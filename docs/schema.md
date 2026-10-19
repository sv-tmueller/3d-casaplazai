# FloorplanData schema (v1)

Frozen interchange contract between the 2D editor and the 3D viewer
(batch issue #1). Source of truth: `src/shared/schema/types.ts`
(types), `validate.ts` (rules), `migrate.ts` (evolution). Everything
imports via the barrel `src/shared/schema/index.ts`.

## Top level

| Field | Type | Rules |
| --- | --- | --- |
| `schemaVersion` | `1` | Exactly the constant `SCHEMA_VERSION`. Older payloads ride `migrate()`; newer ones are rejected. |
| `units` | `"meters"` | Only meters is defined. All lengths/coordinates below are meters. |
| `wallHeight` | number | Positive, finite. Default clear interior height. |
| `wallThickness` | number | Positive, finite. Visual/metrical thickness of walls. |
| `rooms` | `Room[]` | At least one room. |
| `openings` | `Opening[]` | May be empty. |
| `furniture` | `FurnitureItem[]` | May be empty. |

## Coordinate conventions

- Positions are meters on a ground-plane XY grid.
- **Polygons wind counter-clockwise**: the shoelace signed area must be
  strictly positive. Clockwise or degenerate (zero-area) polygons are
  rejected with code `non-ccw-polygon`.
- Polygons do NOT repeat the first vertex at the end; segment *i*
  connects `polygon[i]` to `polygon[(i+1) mod n]`.
- **`tCenter` is normalized along its segment**: distance from the
  segment start divided by the segment length, so it lies in `[0, 1]`.
  The absolute cutout interval is
  `[tCenter*L - width/2, tCenter*L + width/2]` where `L` is the segment
  length; validators check this interval fits inside `[0, L]`
  (`opening-too-wide` otherwise).
- **`wallsOverride` takes precedence** over the global `wallHeight` for
  the overridden segments; unspecified segments inherit `wallHeight`.
- **Footprint x rotationDeg**: `footprint` is the UNROTATED
  `[extentA, extentB]` rectangle of the piece, centered on `position`;
  `rotationDeg` rotates that rectangle counter-clockwise around
  `position`. Consumers compute corners as
  `rotate(position +/- R(theta)*diag(offsets))`.

## Room

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique among ALL entities, non-empty. Slugs encouraged; NOT required to be an RFC-4122 UUID (advisor ruling #5). |
| `name` | string | Non-empty display name. |
| `polygon` | `[x,y][]` | >= 3 vertices, CCW, finite coords. |
| `floorTexture` | `"wood" \| "tile" \| "carpet" \| "concrete" \| null` | Enum or explicit null (null = unset/default renderer choice). |
| `wallsOverride` | `{segmentIndex, height}[]` | Optional. `segmentIndex` indexes the room's OWN polygon segments, `0 <= segmentIndex < nVertices`; `height` positive. |
| `roofs` | `{segmentIndex, leanDeg}[]` | Optional (pkg 8.1, issue #83). Per-wall lean, degrees from horizontal, `0 <= leanDeg <= 75`; one row per segment; only rooms of the TOPMOST floor may carry roofs. Composition: at most one shed lean or one gable pair (two opposing, parallel, equal-length, aligned segments whose planes meet inside the room). Ridge is DERIVED at compile time — never stored. |

### Roof-derived error codes

| Code | Meaning |
| --- | --- |
| `roof-not-top-floor` | `roofs` set on a non-topmost floor's room. |
| `duplicate-roof-segment` | Two `RoofSpec` rows on the same segment. |
| `bad-lean` | `leanDeg` outside `[0, 75]` or not finite. |
| `roof-plate-too-low` | Leaned segment's effective plate (wallsOverride-aware) dips below `wallHeight` — the plane would enter the walkable volume. |
| `roof-unsupported-config` | 3+ positive leans (valleys/hips out of scope). |
| `roof-invalid-gable` | Two leans that are not opposing/parallel, misaligned along the ridge, or non-facing. |
| `roof-length-mismatch` | Opposing pair unequal in length beyond tolerance. |
| `roof-no-ridge` | Pair planes never meet inside the room span. |

## Opening

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique, non-empty. |
| `roomId` | string | Must reference an existing room id (else `dangling-ref`). |
| `kind` | `"door" \| "window"` | |
| `segmentIndex` | int | Valid index into the referenced room's polygon segments. |
| `tCenter` | number | Normalized position along the segment, `[0, 1]`. |
| `width` | number | Positive; must fit within the segment (see conventions). |
| `sillHeight` | number | Bottom edge height above floor, `>= 0`. Doors: `0`. |
| `headHeight` | number | Top edge height above floor, `> 0`. |

Two-row shared door convention (advisor ruling #2): a door on a wall
shared by two rooms is emitted as two opening rows referencing each
side's room, with mirrored `segmentIndex` values and complementary
`tCenter` positions so both sides align.

## FurnitureItem

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique, non-empty. |
| `type` | `"bed" \| "sofa" \| "table" \| "chair" \| "counter" \| "bathtub" \| "toilet"` | Closed enum of seven types. |
| `roomId` | string | Existing room id. |
| `position` | `[x, y]` | Center of the piece, meters. |
| `rotationDeg` | number | Degrees CCW; unconstrained range (mod 360 at consumption). |
| `footprint` | `[a, b]` | Both extents positive; interpreted per Footprint x rotationDeg above. |

## Validation error codes

Stable machine identifiers carried by `{path, code, message}`:

| Code | Meaning |
| --- | --- |
| `unsupported-version` | `schemaVersion` != 1 for the validator (older data goes through `migrate()` first). |
| `bad-units` | units missing/not meters. |
| `bad-wall-height` / `bad-wall-thickness` | Missing, non-number, or <= 0. |
| `missing-array` / `empty-collection` | Structural collection faults. |
| `bad-id` / `duplicate-id` | Entity id missing/empty or reused. |
| `bad-name` | Empty room name. |
| `invalid-type` / `invalid-point` | Wrong JSON shape. |
| `too-few-vertices` | Polygon with fewer than 3 usable vertices. |
| `non-ccw-polygon` | Signed area <= 0. |
| `unknown-floor-texture` | Texture outside the enum/null. |
| `unknown-opening-kind` | Kind outside door/window. |
| `unknown-furniture-type` | Type outside the seven-member enum. |
| `dangling-ref` | `roomId` pointing at no room. |
| `segment-out-of-range` | Bad `segmentIndex` (openings or wallsOverride). |
| `tcenter-out-of-range` | `tCenter` outside [0, 1]. |
| `negative-width` / `negative-sill` | Negative physical sizes. |
| `bad-head-height` / `bad-height` | Non-positive heights. |
| `opening-too-wide` | Cutout interval escapes its segment. |
| `bad-rotation` | Non-numeric `rotationDeg`. |
| `degenerate-footprint` | Non-positive footprint extent. |
| `roof-*` | Family of roof composition faults — see the Room section above. |

## Migration hook convention

Evolve the schema ONLY through `migrate.ts`: register a pure transform
under the outgoing version,

```ts
registerTransform(1, (v1Data) => ({ ...v1Data, /* upgrades */, schemaVersion: 2 }));
```

and bump `SCHEMA_VERSION` in `types.ts` atomically with the registration.
`migrate(parsed)` chains registered steps from the payload's
`schemaVersion` up to the reader's current version; gaps between
versions fail loudly (`migration-gap`) instead of guessing, and data
NEWER than the reader fails with `future-version`. Breaking edits to
shipped types are forbidden — the barrel API stays additive.
