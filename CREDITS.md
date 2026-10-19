# Credits

Everything downloaded into this game, and the work its design leans on. Each pack's own licence file sits beside it
under `client/public/assets/<pack>/License.txt`, and `tests/interiors/assets.test.ts` fails if a pack has none or is
missing from this list.

## Models and assets (downloaded)

| Pack | Author | Licence | Where from | What it is used for |
|---|---|---|---|---|
| `kenney-blaster` — Blaster Kit 2.1 | Kenney (kenney.nl) | CC0 1.0 (public domain) | https://kenney.nl/assets/blaster-kit | the blasters, clips, grenades and crates on weapon racks, shelves and in cases (hero and low detail) |
| `kenney-space` — Space Kit 2.0 | Kenney (kenney.nl) | CC0 1.0 (public domain) | https://kenney.nl/assets/space-kit | barrels, generators, desks and consoles, rocks and crystals for interiors |

The models are not used as downloaded. `tools/convert-assets.mjs` bakes each model's texture colours into vertex colours
(so there is no texture to fetch), rebuilds blasters in a steel ramp, quantises the meshes and writes a second,
low-detail file beside each (what a figure holds in a hand). The converted files are what is under `client/public/assets`.
CC0 asks for no credit; Kenney is credited here because the work is theirs.

## Libraries

three.js, @react-three/fiber, @react-three/drei, @react-three/postprocessing (MIT); glTF Transform and meshoptimizer
(MIT), used by the conversion tool only; pngjs (MIT).

## Research that shaped the design

Read for the interiors overhaul (2026-10-19); nothing of it is copied.

- Texture density on phones (256 to 512 texels per metre, 512 px maps for small props, consistent density across a scene):
  https://www.strayspark.studio/blog/texture-resolution-guide-games-512-1k-2k-4k and https://developer.android.com/games/optimize/textures
- Draw-call and triangle budgets for three.js on phones: https://www.utsubo.com/blog/threejs-best-practices-100-tips
  and https://digitalstrategyforce.com/journal/how-do-you-optimize-threejs-performance-for-mobile-devices/
- glTF compression (meshopt, Draco, KTX2): https://svilenkovic.com/3d/meshopt-compression, https://svilenkovic.com/3d/gltf-best-practices
  and Khronos' KTX 2.0 note https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets
- Cave generation (noise density fields, marching cubes, spline-guided sweeps, stalactites and columns):
  https://discourse.threejs.org/t/how-to-make-3d-perlin-noise-caves-in-this-proyect/63469,
  https://courses.cs.washington.edu/courses/cse557/09au/projects/final/artifacts/yuro and
  https://sol.sbc.org.br/index.php/sbgames/article/download/45405/45166/
- Round and domed architecture of the films (Theed, Jabba's palace, the Lars homestead):
  https://unwinnable.com/2017/07/17/the-architecture-of-a-generic-star-wars-planet/ and
  https://www.art-critique.com/en/2020/05/may-the-fourth-be-with-you-a-closer-look-at-the-architecture-of-star-wars/
- Asset sources surveyed: https://app.cinevva.com/guides/game-assets-guide.html, https://opengameart.org/content/lowpoly-modular-sci-fi-environments
  (Quaternius; not used) and https://opengameart.org/content/furniture-low-poly (not used)

Star Wars and its settings belong to Lucasfilm; the rules data come from the SW5e project (sw5e.com).
