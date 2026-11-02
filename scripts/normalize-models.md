# normalize-models

Reproduces the committed furniture models `public/assets/models/<type>.glb`
(bed, sofa, table, chair, counter, bathtub, toilet) from the raw CC0
download. Issue #180; design in
`docs/superpowers/specs/2026-10-20-workspace-redesign-design.md` section 7.4.

## Run

```bash
node scripts/normalize-models.mjs            # rebuild public/assets/models/*.glb
node scripts/normalize-models.mjs --check    # rebuild to a temp dir, compare sha256
                                             # with the committed files (exit 1 on drift)
```

Options: `--raw <dir>` raw download cache (default
`<tmpdir>/casaplazai-model-sources`, kept outside the repo), `--out <dir>`
output folder.

Prerequisites: Node 20+, `npm ci` (the `@gltf-transform/*` devDependencies),
and `unzip` on the PATH. The first run downloads the source archive; its
sha256 is pinned in the script, so a changed upstream file fails loudly.
Byte-identical output assumes the versions pinned in `package-lock.json`.

## Source

Kenney "Furniture Kit" (Furniture Pack 1.0), CC0 1.0, as uploaded by Kenney
to OpenGameArt: <https://opengameart.org/content/furniture-kit>
(archive `https://opengameart.org/sites/default/files/kenney_furniturePack.zip`).
kenney.nl itself rejects scripted downloads, so the identical pack is taken
from Kenney's own OpenGameArt upload. The pack ships OBJ + MTL; the script
reads those directly.

| Type    | Source model     | Yaw  | Scale reference | Result w x d x h (m) |
| ------- | ---------------- | ---- | --------------- | -------------------- |
| bed     | `bedDouble`      | 180  | width 1.60 m    | 1.60 x 1.88 x 0.63   |
| sofa    | `loungeSofa`     | 180  | width 2.00 m    | 2.00 x 0.84 x 0.94   |
| table   | `table`          | 180  | height 0.75 m   | 1.93 x 1.03 x 0.75   |
| chair   | `chair`          | 180  | width 0.45 m    | 0.45 x 0.45 x 1.06   |
| counter | `kitchenCabinet` | 180  | height 0.90 m   | 0.86 x 0.90 x 0.90   |
| bathtub | `bathtub`        | 180  | width 1.70 m    | 1.70 x 0.80 x 0.60   |
| toilet  | `toilet`         | 180  | height 0.75 m   | 0.52 x 0.79 x 0.75   |

## What it does

1. Downloads the archive (sha256-verified) and extracts each model's OBJ and
   MTL with `unzip`.
2. Parses the OBJ (triangulated, per-material groups, source normals) and
   the MTL diffuse colours (converted sRGB to linear base colour factors).
3. Bakes one transform into the vertices:
   - yaw about +Y so the front faces **+Z** (Kenney's front faces -Z, with
     backrest, headboard or tank at +Z, hence 180 degrees for every type),
   - one uniform scale to real-world metres from the table's reference
     dimension (the schema has no per-type footprint),
   - origin at the floor centre: centred on x and z, lowest point at y = 0.
4. Writes a plain glTF-Transform document, then compresses it with the
   glTF-Transform CLI (`meshopt`, level high: quantisation plus
   `EXT_meshopt_compression`). Each file must stay under 500 KB; the script
   fails otherwise.

## Output contract

The committed GLBs use plain glTF orientation: **Y up, front faces +Z,
metres, base at y = 0, centred on x and z**. No textures, only base colour
factors, so they load without a KTX2 or image decoder.

`src/viewer/furniture/place.ts` turns this into plan space: a +90 degree
rotation about x maps glTF `(x, y, z)` to plan `(x, -z, y)`, so Y becomes up
(plan +Z) and the front (+Z) points to plan **-y**, the schema's forward axis
(`rotationDeg` 0 faces -y; at 90 the front faces +x). Per piece, x and y are
scaled to the schema footprint (`footprint[0]` along x, `footprint[1]` along
y); height keeps the model's own.

## Why the compression step shells out

`meshopt()` in `@gltf-transform/functions` needs the `meshoptimizer` package,
which is not a declared dependency (it only arrives through the CLI), so the
script runs the CLI's executable for that one step instead.
