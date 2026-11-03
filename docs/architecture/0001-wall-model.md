# 0001. Wall model: room-first versus wall-first

Status: Proposed
Date: 2026-11-03
Deciders: project owner
Base commit: 91c948e (main)

Issue: #157, part of batch #185. Introduced in PR #189.

## 1. Context

The data model is room-first. A wall is not an entity: it is one edge of a room polygon plus one
plan-wide `wallThickness`. A wall that two rooms share exists twice and is merged later by
geometric coincidence. Anything that is not a room edge cannot be expressed. Several queued features
press on this at once, so the question is decided before any is built: do walls become first-class
entities, or do rooms gain per-segment attributes? Code is cited by file and symbol at base commit
91c948e, never by line number.

### 1.1 How the model works today

**Schema** (`src/shared/schema/types.ts`). `Room.polygon` is a counter-clockwise ring in metres;
edge `i` runs from vertex `i` to vertex `i + 1` and `segmentIndex` addresses it everywhere.
`wallThickness` and `wallHeight` are global. Per-edge height is `WallOverride { segmentIndex, height }`
and per-edge roof lean is `RoofSpec { segmentIndex, leanDeg }`, so Option A's per-segment row
already exists twice. `Opening { roomId, segmentIndex, tCenter }` hosts a door or window on one
room's edge. `SCHEMA_VERSION = 2`; `FloorplanDataV1` is the frozen v1 shape.

**Migration and validation.**

- `src/shared/schema/migrate.ts`: `registerTransform` throws if the same `fromVersion` is registered
  twice, so there is exactly one 2 to 3 transform and two features cannot each claim it. The
  `v1ToV2` wrap carries arrays by reference; byte-identical compiled output is its acceptance bar.
- `src/shared/schema/validate.ts`: `validateFloorplan` ignores unknown keys and returns its input,
  so a field added without a version bump would render silently wrong in an older reader; that is
  why every field addition bumps the version. Override heights must be positive (`bad-height`), so
  a wall-less terrace edge cannot be expressed. `src/geom/validate.ts` (`parseValidatedPlan`) wraps
  it with geometric checks.

**Compiler and collision.**

- `src/geom/walls.ts`: `buildSlab` spans plus and minus `t/2` around the polygon edge, so the edge is
  the wall centreline. Slabs end exactly at polygon vertices with no corner joins: at a convex 90
  degree corner each slab leaves the `t/2` by `t/2` square beyond the vertex uncovered (a notch); at
  a reflex corner two slabs overlap in that square. The header's "duplicate slabs" limitation calls
  them "thin", a word that has been wrong since #45.
- `src/geom/compile.ts`: `buildRoomWalls` builds walls per room and per segment with
  `plan.wallThickness`. Its skip-when-absent guards (stairs, roofs, the `dz = 0` lift) are the
  pattern that has kept goldens byte-identical across v2.
- `src/geom/collision.ts`: `roomCollisionPieces` and `collideWallPiece` use the global thickness and
  emit duplicate boxes for a shared wall.

**Shared walls are merged in the viewer, not the compiler.** In `src/viewer/adapter.ts`,
`dedupeWalls` drops slabs with coincident centroids and `resolveCoplanarWallOverlaps` (#45) groups
slabs by plane, keyed on the normal and both face offsets from `describeWallPrism`, and draws each
region once. This works only because both rooms emit the same thickness; with different thickness
the groups differ and the merge stops. `describeWallPrism` also requires a box with a constant z
band. The adapter is frozen in batch 1.

**Pairing lives in the editor layer.** `src/editor/model/openings.ts` and `constants.ts` there hold
`sharedWallOverlap`, `qualifyMirrorCandidate`, `mirrorCounterparts`, `derivePairRows`,
`groupedPairs`, `openingTwinIds`, `pairConsistencyErrors` and `PAIR_TOLERANCE_M = 0.01`. A door on a
shared wall is stored as two rows kept in step by the store. The defect history around shared walls
and pairing is #36, #40, #41, #43, #45, #47, #111, #112 and #140: nine closed issues. The compiler
cannot reuse the predicate, which lives in `src/editor/model`.

**Editor, bridge and share links.**

- `src/editor/store.ts`: `resizeRoom` moves one room's vertex only, so a shared wall splits.
  `addOpening` emits two rows; `moveOpening`, `updateOpening` and `deleteOpening` take `syncPair`.
  `setWallLean` and `clearWallLean` are the per-segment row commands; `setWallThickness` is
  plan-wide, bounded 0.05 to 0.6.
- `src/editor/render.ts` draws room outlines as strokes, so thickness is invisible in 2D.
  `src/editor/measures.ts` totals polygon areas for the status bar.
- `src/editor/wire.ts`: `toLegacyWire` produces the v1 bridge from floor 0 only; #178 keeps
  `window.__casaplaza` getData, getCurrent and loadPlan.
- `src/shared/shareLink.ts`: `SHARE_PREFIX = 'v1.'` versions the fragment format, not the schema.
  Decoding runs `migrate` then `validateFloorplan`. `SHARE_WARN_LENGTH` is 2000 and
  `SHARE_MAX_LENGTH` is 8000; measured on the demo fixtures, an encoded plan is about 960 characters
  (apartment) to 1250 (townhouse).

**Pins.** `tests/geom/golden.spec.ts` ("13/11/7 wall slabs" per room), `apartment.identity.spec.ts`
(SHA-256 byte identity), `townhouse.golden.spec.ts` (freeze policy), `wall-thickness.spec.ts`,
`shared-wall-offset.spec.ts`; `tests/unit/staggered-pairing.spec.ts`, `fixtures.spec.ts`,
`migrate.spec.ts`. `demo/demo-apartment.json` stays v1 on disk permanently (#69);
`demo-townhouse.json` and `demo-duplex.json` are v2.

**A live example of the two-row failure mode.** In `demo/demo-apartment.json`, kitchen edge 2 runs
from [8.6, 3.6] to [5.4, 3.6] and bed-nook edge 0 from [5.4, 3.6] to [8.6, 3.6]: the same wall,
fully overlapping. `door-bedroom` and `window-kitchen-north` sit on the kitchen's row and no row on
the bed-nook's edge 0 mirrors them. The golden's 7 slabs for the bed-nook (edges 0, 2 and 3 as one
slab each, plus four around its skylight on edge 1) include one uncut slab across that wall. A
scratch run at the base commit confirmed that the adapter's merge leaves a full-height slab across
the doorway and that a straight walk through it is blocked. Recorded, not fixed: fixing it
re-records the frozen v1 goldens, the owner's call.

**The user interface is being replaced.** Gestures are named by store command and by functions in
`src/editor/model/openings.ts`; surfaces by their redesign names, the Build tab tool grid and the
contextual inspector (design spec `docs/superpowers/specs/2026-10-20-workspace-redesign-design.md`,
sections 6.2 and 6.3). Issue #178 retires the current rail, popovers, mini 3D inset and HUD (spec
section 8.1), and `src/editor/glue.ts` becomes `src/editor/canvasEngine.ts` behind
`src/editor/engine.ts`; those paths and `src/app/` are introduced by #178, which leaves the store
and `src/geom` alone.

### 1.2 Cases the model cannot express

| Case | What it looks like today | What breaks |
| --- | --- | --- |
| Exterior walls thicker than interior | One `wallThickness` for every edge | A real plan has 0.36 outside and 0.12 inside |
| Per-wall thickness | None | A half-brick partition cannot sit beside a 0.24 wall |
| Balcony, garage, terrace | A room with walls all round and a ceiling | Open edges and no ceiling cannot be stated; `bad-height` rejects a zero-height edge |
| A wall that bounds nothing (garden wall, half-wall) | No representation; only a sliver room | A sliver gets a floor, a ceiling and a name it should not have |
| Door hinge on a shared wall (#151) | Two rows run in opposite directions | `hinge: 'start'` means different physical sides on the two rows; `swing: 'in'` points into different rooms |
| Sloped walls, `heightAtEnd` (#127 item 1) | `WallOverride.height` is one value per edge | A taper needs a value per end; `describeWallPrism` assumes a box |
| Per-side materials (#127 item 2) | Room-level `floorTexture` only | A shared wall has two faces owned by two rows; the outside face of an unpaired edge has no owner |
| A future wall-drawing tool | None; walls appear only by drawing rooms | The tool needs something to draw and select that is not a room |

### 1.3 Prior art and precedents

**Research** (`docs/research/competitor-scan-2026-10/`; behaviour only, Sweet Home 3D is GPL so no
code is copied): `README.md` says both competitors are wall-first and that 3D House Planner does
not merge shared walls. `round2/sh3d/06d-schema-gap-table.md` (section 2.3, sketch M3)
recommends `walls[]` with explicit joins; 5.2 answers it. `round2/sh3d/03c-room-detection.md` (rooms
derived from a wall loop), `03d-wall-editing.md` (`heightAtEnd`, split, join) and
`round2/3dhp/03c-wall-geometry.md` (the alignment switch is the reference-line question).

**Precedents in this repo.** From the #69 design comment: derived values are never stored (ridge,
stairwell), no schema field the compiler does not consume, byte identity of the migrated apartment
is the migration bar, and a whole-building roof outline was rejected as research-sized. From the
redesign spec: wall-first is a non-goal (section 2), there is no wall tool (6.2), the inspector
carries wall height and thickness (6.3), the interior and exterior face split is batch-2 compiler
work (7.1, 7.3), and `src/geom` and the adapter are frozen in batch 1 (10).

## 2. Options

Type sketches are illustrative and non-normative.

### 2.1 Option A: stay room-first, add per-segment attribute rows

`Room.polygon` stays the only source of wall geometry. Add optional per-edge rows, generalising
`wallsOverride` and `roofs`, and keep pairing as the merge rule, moved where the compiler can use it.

```ts
interface SegmentRow {           // non-normative
  segmentIndex: number;
  thickness?: number;            // metres; absent = plan or exterior default
  open?: boolean;                // no wall on this edge (terrace, balcony)
  heightAtEnd?: number;          // taper to this height at the segment end
  faces?: { room?: MaterialRef; outside?: MaterialRef };
}
interface Room { /* ... */ segments?: SegmentRow[]; }
```

**Migration path.** Additive. Register the next transform with an identity body, so older readers
reject the new version instead of ignoring fields. No data is rewritten; `wallsOverride` and `roofs`
keep their meaning, and folding them into `segments[]` is an optional, byte-transparent cleanup.

**Impact.**

- Compiler: a derived wall graph in `src/geom` classifies each edge interval (shared or exterior)
  and resolves an effective thickness per row and interval. With no new field, `buildRoomWalls`
  takes the legacy path unchanged.
- Collision: `roomCollisionPieces` reads the same resolved thickness; sloped tops stay conservative.
- Validator: row bounds and positive values in `validateFloorplan`. `open` is its own flag, so
  `bad-height` is untouched. `validateGeometry` gains no checks.
- Editor gestures: the inspector gains a thickness field per selected segment beside wall lean, and
  a `setSegmentThickness` command mirrors `setWallLean` and `clearWallLean`. `resizeRoom` and
  `moveRoom` are unchanged. No add-vertex or delete-vertex command exists, so `segmentIndex` stays
  stable; a future one must remap rows, as it must already remap `wallsOverride`, `roofs`, openings.
- Share links: the payload grows by the rows only; old links decode through `migrate` and
  `SHARE_PREFIX` stays. The v1 bridge passes `ground.rooms` by reference, so room rows ride along;
  plan-level fields are lost, as stairs and upper floors already are.
- Goldens: absent fields mean byte identity; apartment goldens and the SHA test do not move.
  Townhouse and duplex re-record deliberately when their fixtures gain rows.

**How the cases land.** Thickness, hinge (flip rule, 3.4), sloped walls, per-side materials: yes,
as row fields. Balcony, terrace, garage: rooms with open edges. A wall that bounds nothing, and a
wall tool: no.

**Package estimate.** Extract the pairing predicate (size:S). First proof, exterior thickness with
derived classification (size:M, section 7). Per-segment `thickness` rows, sloped walls, per-side
materials (size:M each, the last after the wall-face split). One S and three to four M.

**Risks.** The derived graph is new geometry code with its own tolerance policy. A staggered overlap
splits one edge into intervals, so slab counts change for plans using the new fields. Corner joins
at a thickness change need a mitre rule that does not exist. Pairing is relocated, not removed, so
its defect class stays.

### 2.2 Option B: walls become entities

```ts
interface Wall {                 // non-normative
  id: string; a: Vec2; b: Vec2;
  thickness: number; height?: number; heightAtEnd?: number;
  joinStart?: string; joinEnd?: string;
}
interface Floor { /* ... */ walls: Wall[]; }       // rooms derived, or explicit with wallIds
interface Opening { /* ... */ wallId: string; }    // replaces roomId + segmentIndex
```

**Migration path.** The transform derives one wall per distinct undirected polygon edge. Rooms that
share an edge map to one wall id. Edges 5 mm apart (inside `PAIR_TOLERANCE_M`) snap together,
staggered edges split into several walls, and each pair of mirror opening rows collapses into one
opening. The result is neither byte-transparent nor reversible: `segmentIndex` addressing is lost.
The owner would have to sign off an exception to the #69 byte-identity bar.

**Impact.**

- Compiler and collision: slabs and boxes per wall, with explicit joins and mitres;
  `buildRoomWalls` is replaced and the per-room slab counts pinned by `golden.spec.ts` stop meaning
  anything. The duplicate collision boxes disappear.
- Validator: walls, symmetric joins, openings on walls, rooms bounded by walls; the opening-fit
  checks in `src/geom/validate.ts` move from segments to walls.
- Editor gestures: all 31 store commands are reviewed. `drawRoom` must reuse walls it snaps onto;
  `moveRoom` and `resizeRoom` must decide whether a shared wall travels with the neighbour;
  `addOpening` stops emitting two rows, so `syncPair`, `derivePairRows` and `groupedPairs` retire.
  A wall tool becomes natural. 15 source files and 31 test and e2e files reference `segmentIndex`.
- Share links: the payload grows by the wall table. A rough estimate (not measured): the 7-room
  townhouse gains about 20 walls of about 110 bytes, roughly 0.8 kB of fragment, near
  `SHARE_WARN_LENGTH`. The v1 bridge needs a reverse projection or loses wall data.
- Goldens: every geometry golden and the SHA identity test are re-recorded.

**How the cases land.** All land cleanly; balcony and garage are still rooms. Hinge needs no flip,
since there is one opening on one wall.

**Package estimate.** Schema plus derive-and-snap migration, compiler with joins, editor command
rewrite (size:L each, to split). Collision and validator, opening re-anchoring with pairing
retirement, bridge and share projection, golden re-record, wall tool (size:M each). Seven or more,
at least one L.

**Risks.** A lossy, irreversible migration; every editor gesture rewritten while #178 rewrites the
shell around the same commands; larger payloads.

### 2.3 Option C: hybrid, explicit exterior and freestanding walls plus derived interior walls

As the issue defines it: exterior and freestanding walls become `walls[]` entities; interior walls
stay derived.

**Migration path.** The transform derives the exterior edges (no neighbour) and stores them as wall
entities: classification happens at migration time and its result is stored, and those room edges
stop emitting slabs.

**Impact.**

- Compiler and collision: two emission paths (room slabs for interior edges, wall slabs for
  entities) plus joins between them; derived interior walls still depend on pairing.
- Validator: wall entities, plus a rule that every exterior wall still lies on an unpaired edge.
- Editor gestures: `resizeRoom`, `moveRoom` and `drawRoom` must keep exterior wall entities in step
  with polygons, or the stored classification is stale after the first edit; `addOpening` has two
  hosting forms.
- Share links: the payload grows by the exterior walls; the bridge needs a projection for them.
- Goldens: not byte-transparent, because exterior edges stop emitting from their rooms.

**How the cases land.** Exterior thickness, freestanding walls and a wall tool: yes. Interior
thickness, hinge and per-side materials on shared walls still need Option A rows, so C does not
remove the need for A and adds a second source of truth.

**Package estimate.** Schema plus exterior derivation, collision and validator, editor
synchronisation (size:M each); compiler dual path with joins (size:L, to split); goldens and
fixtures (size:S). Five packages, one needing a split.

**Risks.** A stored classification that goes stale; two hosting forms for openings; the merge
problem is moved, not removed.

## 3. Questions this record must answer

### 3.1 Reference line (question 1)

The polygon edge stays the wall centreline. Extra exterior thickness grows symmetrically about the
edge, not outward, so existing data keeps its meaning, the shared-wall merge keeps one plane for
both rows, and `buildSlab` is unchanged in kind. Net interior area is smaller than polygon area by
half a thickness per side, and the status-bar total (`src/editor/measures.ts`, polygon area) stays
a gross-to-centreline figure. Net area is a later derived display, not a silent change to the
number users see. An alignment switch (inside, centre, outside), as in 3D House Planner, is
deferred and would be a row field.

### 3.2 Exterior classification (question 2)

Exterior is derived per interval at compile time and never stored. An edge is cut at the endpoints
of every coincident, opposite-side neighbour edge (the `sharedWallOverlap` and
`qualifyMirrorCandidate` predicates, tolerance `PAIR_TOLERANCE_M`). A staggered overlap splits one
edge into an interior and an exterior stretch. Classification is per floor: an upper-floor wall
over a lower room is still exterior to its own floor. A stored flag would go stale on `resizeRoom`
and `moveRoom`, which split shared walls, and would put derivable state in the file, against #69.

This is not the whole-building outline #69 rejected, which needs a watertight 2D union of
overlapping polygons. Per-interval classification is a one-dimensional subtraction on each edge; it
tolerates gaps and overlaps between rooms and fails locally. Legacy plans need derivation under
every option, because none stores the flag.

### 3.3 Shared-wall merge rule (question 3)

One rule: the merged wall is the union of the solids each row contributes. Thickness is the larger
of the two rows, height is the larger, and a hole exists only where every contributing row cuts
one. This is what the adapter does today, region by region, and the legacy path is unchanged, so
apartment output stays byte-identical. Each row emits slabs at the merged thickness, so coincident
slabs that the adapter already dedupes stay coincident.

Where it runs: effective thickness and height are resolved in a derived wall graph in `src/geom`,
because only the compiler sees both rows at once. The adapter's merge stays as a safety net for the
legacy path and moves into `src/geom` once the wall-face split (spec section 7.3) needs per-face
information the adapter cannot see. A disagreement between rows is a warning for the problems panel
(#153), not an error.

### 3.4 Directional attributes under the mirror (question 4)

The two rows of a shared wall run in opposite directions, so direction-relative fields flip:

| Field | Row on room A (edge P to Q) | Mirror row on room B (edge Q to P) |
| --- | --- | --- |
| `hinge` | `start` | `end` |
| `swing` | `in` (toward A) | `out` (away from B, toward A) |
| `heightAtEnd` | taper at Q | taper at the mirror's start |

`derivePairRows` and the `syncPair` paths must write flipped values to the mirror row. Per-side
material avoids this by construction: a row's `faces.room` is the face toward its own room, so each
side of a shared wall authors its own face; `faces.outside` is read only on exterior intervals.
Under Option B none of this is needed (one opening on one wall), a point for B weighed in section 5.

### 3.5 Non-room spaces (question 5)

Balcony, terrace and garage are rooms. They need attributes the compiler can consume (no ceiling,
open or parapet edges, an exterior floor material), as a `kind` or per-room toggles; #127 item 3
overlaps, and the building package decides. A wall that bounds nothing needs a freestanding-wall
entity, the one case room rows cannot express: the narrowed Option C of section 5.

### 3.6 Schema versions (question 6)

Every added field bumps the version. #151 (hinge and swing) and the wall follow-up both want a 2 to
3 transform, and `registerTransform` throws on a duplicate. Each registers the version current at its
own merge: whichever lands first takes v3 and the other rebases onto v4. They combine only if they
land in the same pull request; the conflict on `SCHEMA_VERSION` is the safety net.

### 3.7 Golden policy per option (question 7)

A: an absent field means the legacy path, guarded and byte-identical (the roofs precedent), so
apartment goldens and `apartment.identity.spec.ts` must not move; fixtures that adopt rows re-record
deliberately under the `townhouse.golden.spec.ts` freeze policy. B is not transparent (walls 5 mm
apart snap, staggered walls split, mirror rows collapse): every golden and the SHA test are
re-recorded, and the owner must sign off an exception to the #69 bar first. C is not transparent
either, because exterior edges stop emitting from rooms.

### 3.8 The v1 bridge and `SHARE_PREFIX` (question 8)

`SHARE_PREFIX` stays under every option, since decoding migrates; only an envelope change would move
it. Bridge: A, room rows ride along by reference and plan-level fields are dropped. B, a reverse
projection (walls to edges and `segmentIndex` openings) or wall data is lost. C, a projection for
exterior walls.

## 4. Comparison

| Aspect | A: room-first rows | B: wall entities | C: hybrid as defined |
| --- | --- | --- | --- |
| Migration transparency | Yes, identity transform | No, derive and snap, lossy | No, exterior edges move |
| Golden impact | None unless fixtures adopt rows | All re-recorded | Exterior geometry re-recorded |
| Compiler | Derived graph; legacy path guarded | Slabs per wall, joins, mitres | Two emission paths plus joins |
| Collision | Resolved thickness; duplicates stay | Per wall; duplicates gone | Two paths |
| Validator | Row bounds only | Walls, joins, bounded rooms | Walls plus consistency rule |
| Editor gestures | One field and command per row type | 31 commands reviewed | Sync exterior walls on edit |
| Share links and v1 bridge | Rows ride along; prefix stays | Reverse projection; payload grows | Projection for exterior walls |
| Door pairing | Stays, predicate relocated | Retired | Stays for interior |
| Per-wall thickness | Yes | Yes | Exterior only |
| Exterior thickness | Yes, derived | Yes | Yes |
| Per-side materials | Yes, `faces` rows | Yes | Partial |
| Sloped walls | Row field; trapezoid slab | Wall field; same slab work | Exterior only |
| Hinge (#151) | Yes, with explicit flip rule | Yes, no flip needed | Interior still needs flip |
| Non-room spaces | Rooms with open edges | Rooms with open edges | Rooms with open edges |
| Freestanding walls | No | Yes | Yes |
| Wall tool | No | Yes | Partial |
| Package estimate | 1 S plus 3 to 4 M | 7 or more, at least one L | 5, one needs a split |
| Risk | Tolerance policy; corner joins | Lossy migration; editor rewrite | Stale classification |

## 5. Decision

Recommendation (proposed; it binds only if the owner accepts it): **Option A, refined, with a
narrowed Option C as the later extension path. Option B is rejected for now.**

The refined Option A has four parts: (1) per-segment rows that generalise `wallsOverride` and
`roofs`, added only as a feature needs a field the compiler consumes; (2) exterior classification
derived at compile time, per interval, never stored (3.2); (3) the shared-wall merge resolved in a
derived wall graph in `src/geom` under the union rule of 3.3, the adapter merge retiring in stages;
(4) the pairing predicate moved out of `src/editor/model` into a module the compiler and the editor
can both import.

The narrowed Option C is a `walls[]` list only for walls that bound no room: additive, empty by
default, and not built until a feature needs it.

### 5.1 Why not B

- The migration cannot meet the #69 bar: derive-and-snap is lossy and irreversible (3.7).
- The cost lands on the busiest code at the worst moment. The 31 store commands all need review, 15
  source files and 31 test and e2e files carry `segmentIndex`, and #178 is rewriting the shell
  around those same commands.
- B's payoff is a wall tool and room detection. Neither is committed: the spec lists wall-first as
  a non-goal and has no wall tool (sections 2 and 6.2). Payloads also grow (2.2).

### 5.2 Answering research recommendation M3

`06d-schema-gap-table.md` recommends `walls[]` with explicit joins, for three reasons.

- Per-wall thickness is needed for real plans. Option A provides it without a new entity.
- Explicit joins remove the coincident-vertex bug class. This is the real concession: the pairing
  defect history (nine closed issues) is genuine evidence for B. The refined A shrinks that
  subsystem to one predicate with one tolerance shared by compiler and editor; if that does not
  hold, the reopen triggers below fire.
- The shared-door convention would become unnecessary. It stays under A, a cost accepted for the
  migration and editor savings.

M3 itself derives one wall per distinct room segment and resolves `segmentIndex` openings "onto the
derived wall at read time": a read-time derived wall graph, which is the refined A's compiler piece.
The two differ only in whether the graph is stored.

### 5.3 Reopen triggers

Reopen this record, by a new superseding record, if any of these happens:

- The owner commits to a wall-drawing tool, or to room detection from walls.
- Pairing defects recur: two more of the #36, #40, #41, #43, #112 or #140 class within one quarter
  after the derived graph has landed.
- An importer for a wall-first format (Sweet Home 3D, DXF) is committed; it arrives wall-first.
- The derived graph cannot produce correct corners at a thickness change without stored joins.

## 6. Consequences

**Positive.** No migration risk: legacy plans and apartment goldens stay byte-identical. Features
land as small packages whose fields the compiler consumes. Shared-wall logic gets one home
(compiler, editor, problems panel #153). Options B and the narrowed C stay open.

**Negative.** The two-row shared-door convention survives, with its flip rule (3.4) and defect
class. Freestanding walls and a wall tool wait for the narrowed C. Corner joins at a thickness
change stay open work, as does the trapezoid merge for a shared sloped wall.

**What binds once Accepted.**

- No `walls[]` entity before a trigger in 5.3 fires, apart from the narrowed C.
- New per-segment attributes are optional rows, each consumed by the compiler in the same package,
  each bumping the schema version through the migration registry; with none present, output is
  byte-identical.
- Exterior status is derived, never stored. The merge rule is the union of solids (3.3).

## 7. First follow-up package

**Title.** Exterior wall thickness with derived exterior classification (described here, not filed).

**Scope.** The smallest schema delta the compiler fully consumes:

- Extract the pairing predicate (`sharedWallOverlap`, `qualifyMirrorCandidate`) into a module that
  `src/geom` and `src/editor` may both import, with no behaviour change; split it off as a size:S
  package if it runs long.
- A new `src/geom` module: a derived wall graph that classifies each edge interval as shared or
  exterior, per floor, and resolves an effective thickness per row and interval.
- Schema: optional `FloorplanData.exteriorWallThickness` (absent = `wallThickness`), validated
  positive, with the version bump and an identity transform registered in the migration registry.
  `buildRoomWalls` and `roomCollisionPieces` consume it; with it absent they take the legacy path.
- Editor: an inspector field beside the plan wall settings and a `setExteriorWallThickness`
  command (precedent: `setWallThickness`, bounds 0.05 to 0.6), one undo step.
- Fixture: `demo/demo-townhouse.json` adopts the field and its goldens are re-recorded
  deliberately. Corner joins at a thickness change are out of scope.

**Acceptance criteria sketch.**

- [ ] With the field absent, `tests/geom/golden.spec.ts` and `tests/geom/apartment.identity.spec.ts`
      pass unchanged.
- [ ] A staggered pair splits one edge into an exterior and an interior stretch, and both rows of
      a shared edge emit identical slabs, so the adapter still dedupes them.
- [ ] The validator rejects a non-positive value with a stable error code; undo restores the
      previous thickness; the share link round-trips the field.
- [ ] `npm run verify` is green.

**Size.** size:M, plus an optional size:S if the predicate extraction is split off.

**Blocked by.** #178 (it owns the inspector and `src/editor`, and its batch-1 ownership rules keep
`src/geom` and the adapter frozen, spec section 10); the owner accepting this record. Sequenced
against #151 for the schema version (3.6).

## 8. Batch 2 implications

- **#151 and #127.** #151 proceeds under any option, applying the flip rule of 3.4 and taking the
  next free schema version (3.6). #127 order: the section 7 package, sloped walls, then per-side
  materials (9.1); ceiling toggles are independent and curved walls are not assessed.
- **Wall-face split (spec section 7.3).** The face split and the skirting boards "along every
  interior wall base" both need the classification of 3.2. Build the derived graph once, in the
  section 7 package, and order it before the face-split and trim packages.

## 9. Issue annotations

Posted on #127 and #151 word for word as below; a review that changes the recommendation edits
both comments in the same fix round.

### 9.1 Annotation on #127

```
ADR 0001 (wall model) annotation. Proposed in PR #189 (docs/architecture/0001-wall-model.md). It
does not bind until the owner flips its status to Accepted. Under the recommended option
(room-first, per-segment rows, a derived wall graph in src/geom), this issue lands as follows.

1. Sloped walls (heightAtEnd). An optional heightAtEnd on a per-segment row, generalising
   WallOverride; absent means constant. First slice: exterior and unpaired edges only, because a
   sloped shared wall needs the merge rule extended from boxes to trapezoids, which is its own
   package. Compiler: buildSlab gets a trapezoid slab; collision keeps the higher end (an AABB, so
   conservative); the roof validator's plate-height lookup must read the tapered height so it
   composes with RoofSpec leans; describeWallPrism in the viewer adapter assumes a box, so sloped
   slabs bypass it. Editor: an inspector field only. One package, size:M.

2. Per-side wall materials and baseboards. A faces row on the segment: room is the face toward the
   row's own room; outside is read only on exterior intervals, which are derived, never stored.
   Blocked by the material catalogue in #179 and by the interior and exterior wall-face split
   (redesign spec section 7.3), which needs the same derived classification. Baseboards follow the
   face split. One to two packages, size:M each.

3. Ceiling toggles. Independent of the wall model; they land the same under any option.
4. Curved walls (arcExtent). Not assessed.

Suggested order: the exterior-thickness proof package in ADR section 7, then sloped walls, then
per-side materials. This issue stays the parking lot.
```

### 9.2 Annotation on #151

```
ADR 0001 (wall model) annotation. Proposed in PR #189 (docs/architecture/0001-wall-model.md). It
does not bind until the owner flips its status to Accepted. This feature does not depend on the
wall model decision: under the recommended option (room-first, per-segment rows) Opening stays on
roomId, segmentIndex and tCenter, and hinge and swing are the optional Opening fields as written.
Two requirements follow from the two-row shared-door convention.

1. The mirror row runs in the opposite direction, so hinge and swing must flip when written to it:
   hinge start becomes end and end becomes start, and swing in becomes out and out becomes in (in
   means toward the owning room, and the mirror row is owned by the other room). The syncPair
   paths in the store and derivePairRows in src/editor/model/openings.ts must write the flipped
   values; that is what makes "paired shared-wall doors keep a single consistent leaf" hold. It
   needs a test for a flip from either side.

2. Schema version. The wall follow-up in ADR section 7 also wants a 2 to 3 transform, and
   registerTransform throws on a duplicate fromVersion. Whichever lands first takes v3; the other
   rebases onto v4. They do not need to combine.
```

## 10. References

- Code at 91c948e: the files named in section 1.1; absent at the base commit and introduced by
  #178: `src/editor/canvasEngine.ts`, `src/editor/engine.ts`, `src/app/`.
- Design: the redesign spec; the #69 design comment; `docs/schema.md` (v1 only; the v2 shape is in
  `src/shared/schema/types.ts`).
- Research, under `docs/research/competitor-scan-2026-10/`: `README.md`,
  `round2/sh3d/06d-schema-gap-table.md`, `round2/sh3d/03c-room-detection.md`,
  `round2/sh3d/03d-wall-editing.md`, `round2/3dhp/03c-wall-geometry.md`.
- Issues: #36, #40, #41, #43, #45, #47, #111, #112, #140 (pairing defects), #69, #83, #127, #151,
  #153, #157, #178, #179, #185.
