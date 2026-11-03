# Asset attribution

Every bundled file under `public/assets/` is listed with its source URL and license.

## Materials (public/assets/materials/)

Physically based texture sets (1K JPG) for the 3D viewer, loaded lazily by
`src/viewer/assets/`. Each set is a colour map (`color.jpg`), an OpenGL normal map
(`normal.jpg`) and either an ARM map (`arm.jpg`: ambient occlusion in R, roughness in G,
metalness in B) or a plain roughness map (`roughness.jpg`). Files are the unmodified
downloads from the source (Poly Haven `Diffuse`, `nor_gl` and `arm` JPGs; ambientCG
`Color`, `NormalGL` and `Roughness` JPGs), renamed only.

| File | Source URL (asset page) | Author | License (CC0 1.0) |
| --- | --- | --- | --- |
| `public/assets/materials/oak-planks/color.jpg` | https://polyhaven.com/a/oak_wood_planks | Dimitrios Savva | CC0 1.0 |
| `public/assets/materials/oak-planks/normal.jpg` | https://polyhaven.com/a/oak_wood_planks | Dimitrios Savva | CC0 1.0 |
| `public/assets/materials/oak-planks/arm.jpg` | https://polyhaven.com/a/oak_wood_planks | Dimitrios Savva | CC0 1.0 |
| `public/assets/materials/herringbone-oak/color.jpg` | https://polyhaven.com/a/herringbone_parquet | Jenelle van Heerden, Sergej Majboroda | CC0 1.0 |
| `public/assets/materials/herringbone-oak/normal.jpg` | https://polyhaven.com/a/herringbone_parquet | Jenelle van Heerden, Sergej Majboroda | CC0 1.0 |
| `public/assets/materials/herringbone-oak/arm.jpg` | https://polyhaven.com/a/herringbone_parquet | Jenelle van Heerden, Sergej Majboroda | CC0 1.0 |
| `public/assets/materials/ceramic-tile/color.jpg` | https://polyhaven.com/a/long_white_tiles | Jenelle van Heerden, Sergej Majboroda | CC0 1.0 |
| `public/assets/materials/ceramic-tile/normal.jpg` | https://polyhaven.com/a/long_white_tiles | Jenelle van Heerden, Sergej Majboroda | CC0 1.0 |
| `public/assets/materials/ceramic-tile/arm.jpg` | https://polyhaven.com/a/long_white_tiles | Jenelle van Heerden, Sergej Majboroda | CC0 1.0 |
| `public/assets/materials/stone-tile/color.jpg` | https://polyhaven.com/a/large_grey_tiles | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/stone-tile/normal.jpg` | https://polyhaven.com/a/large_grey_tiles | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/stone-tile/arm.jpg` | https://polyhaven.com/a/large_grey_tiles | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/wool-carpet/color.jpg` | https://ambientcg.com/a/Carpet016 | ambientCG | CC0 1.0 |
| `public/assets/materials/wool-carpet/normal.jpg` | https://ambientcg.com/a/Carpet016 | ambientCG | CC0 1.0 |
| `public/assets/materials/wool-carpet/roughness.jpg` | https://ambientcg.com/a/Carpet016 | ambientCG | CC0 1.0 |
| `public/assets/materials/polished-concrete/color.jpg` | https://polyhaven.com/a/concrete_floor_02 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/polished-concrete/normal.jpg` | https://polyhaven.com/a/concrete_floor_02 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/polished-concrete/arm.jpg` | https://polyhaven.com/a/concrete_floor_02 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/plaster-white/color.jpg` | https://polyhaven.com/a/white_stucco | Amal Kumar | CC0 1.0 |
| `public/assets/materials/plaster-white/normal.jpg` | https://polyhaven.com/a/white_stucco | Amal Kumar | CC0 1.0 |
| `public/assets/materials/plaster-white/arm.jpg` | https://polyhaven.com/a/white_stucco | Amal Kumar | CC0 1.0 |
| `public/assets/materials/plaster-warm/color.jpg` | https://polyhaven.com/a/beige_wall_001 | Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `public/assets/materials/plaster-warm/normal.jpg` | https://polyhaven.com/a/beige_wall_001 | Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `public/assets/materials/plaster-warm/arm.jpg` | https://polyhaven.com/a/beige_wall_001 | Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `public/assets/materials/plaster-ceiling/color.jpg` | https://polyhaven.com/a/plastered_wall_04 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/plaster-ceiling/normal.jpg` | https://polyhaven.com/a/plastered_wall_04 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/plaster-ceiling/arm.jpg` | https://polyhaven.com/a/plastered_wall_04 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/roof-shingles/color.jpg` | https://polyhaven.com/a/roof_3 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/roof-shingles/normal.jpg` | https://polyhaven.com/a/roof_3 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/roof-shingles/arm.jpg` | https://polyhaven.com/a/roof_3 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/exterior-render/color.jpg` | https://polyhaven.com/a/exterior_wall_cladding_03 | Charlotte Baglioni | CC0 1.0 |
| `public/assets/materials/exterior-render/normal.jpg` | https://polyhaven.com/a/exterior_wall_cladding_03 | Charlotte Baglioni | CC0 1.0 |
| `public/assets/materials/exterior-render/arm.jpg` | https://polyhaven.com/a/exterior_wall_cladding_03 | Charlotte Baglioni | CC0 1.0 |
| `public/assets/materials/grass/color.jpg` | https://polyhaven.com/a/aerial_grass_rock | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/grass/normal.jpg` | https://polyhaven.com/a/aerial_grass_rock | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/grass/arm.jpg` | https://polyhaven.com/a/aerial_grass_rock | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/pavement/color.jpg` | https://polyhaven.com/a/pavement_01 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/pavement/normal.jpg` | https://polyhaven.com/a/pavement_01 | Rob Tuytel | CC0 1.0 |
| `public/assets/materials/pavement/arm.jpg` | https://polyhaven.com/a/pavement_01 | Rob Tuytel | CC0 1.0 |

## Models (public/assets/models/)

Furniture models for the 3D view, normalised by `scripts/normalize-models.mjs`
(see `scripts/normalize-models.md`): front on +Z, real-world metres, origin at
the floor centre, meshopt-compressed. All seven come from one source: Kenney's
"Furniture Kit" (Furniture Pack 1.0), dedicated to the public domain under CC0
1.0 (<http://creativecommons.org/publicdomain/zero/1.0/>). Credit is not
required; given here anyway. The pack is taken from Kenney's own upload on
OpenGameArt, archive
`https://opengameart.org/sites/default/files/kenney_furniturePack.zip`
(sha256 `68afa4e6dc8a53942379fb47f1e84ec735d46b77bb1c1ceb968e245693dde067`).

| File | Source URL (asset page) | Original model | Author | License |
| --- | --- | --- | --- | --- |
| `models/bed.glb` | https://opengameart.org/content/furniture-kit | `bedDouble` | Kenney (kenney.nl) | CC0 1.0 |
| `models/sofa.glb` | https://opengameart.org/content/furniture-kit | `loungeSofa` | Kenney (kenney.nl) | CC0 1.0 |
| `models/table.glb` | https://opengameart.org/content/furniture-kit | `table` | Kenney (kenney.nl) | CC0 1.0 |
| `models/chair.glb` | https://opengameart.org/content/furniture-kit | `chair` | Kenney (kenney.nl) | CC0 1.0 |
| `models/counter.glb` | https://opengameart.org/content/furniture-kit | `kitchenCabinet` | Kenney (kenney.nl) | CC0 1.0 |
| `models/bathtub.glb` | https://opengameart.org/content/furniture-kit | `bathtub` | Kenney (kenney.nl) | CC0 1.0 |
| `models/toilet.glb` | https://opengameart.org/content/furniture-kit | `toilet` | Kenney (kenney.nl) | CC0 1.0 |
