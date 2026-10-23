# Ground textures (1K)

From Poly Haven (https://polyhaven.com), licensed CC0: no attribution required, credited here anyway.

| Folder | Source | Intended use |
| --- | --- | --- |
| `dirt_floor/` | https://polyhaven.com/a/dirt_floor | bare earth for forest and jungle ground; recolour for desert and volcanic |
| `dense_sand/` | https://polyhaven.com/a/dense_sand | desert ground |
| `dark_rock/` | https://polyhaven.com/a/dark_rock | volcanic ground |
| `brown_mud_03/` | https://polyhaven.com/a/brown_mud_03 | sewer sludge (Coruscant, the only place parallax is used there) |

Each folder holds `diffuse.jpg`, `normal.jpg` (OpenGL convention, `nor_gl` on Poly Haven), `height.jpg` (displacement) and `rough.jpg`, all 1K JPEGs.
Wired in `siteAssets.tsx` (`groundTexture`). The floors of rooms and the hull wear textures are in `../floor` and `../hull` (see CREDITS.md).
