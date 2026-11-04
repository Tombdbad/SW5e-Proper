# Credits

Everything downloaded into this game, and the work its design leans on. Each pack's own licence file sits beside it
under `client/public/assets/<pack>/License.txt`, and `tests/interiors/assets.test.ts` fails if a pack has none or is
missing from this list.

## Models and assets (downloaded)

| Pack | Author | Licence | Where from | What it is used for |
|---|---|---|---|---|
| `kenney-blaster` — Blaster Kit 2.1 | Kenney (kenney.nl) | CC0 1.0 (public domain) | https://kenney.nl/assets/blaster-kit | the blasters, clips, grenades and crates on weapon racks, shelves and in cases (hero and low detail), baked in steel (`tone=gunmetal`) |
| `kenney-space` — Space Kit 2.0 | Kenney (kenney.nl) | CC0 1.0 (public domain) | https://kenney.nl/assets/space-kit | the machines, consoles, chairs, barrels, masts and pipes of workshops, hangars, garrisons, sickbays and ships (`interiors/packs.ts`); the crystals and rocks of caves (`interiors/CaveRoom.tsx`); the astronaut suits, arms and legs that the armour and prostheses are built from |
| `kenney-station` — Space Station Kit | Kenney (kenney.nl) | CC0 1.0 (public domain) | https://kenney.nl/assets/space-station-kit | the straight walls of palaces, garrisons, workshops, sickbays, hangars and ships (`interiors/Walls.tsx`), and the beds, tables, lockers and chairs of their rooms (`interiors/packs.ts`) |
| `kenney-furniture` — Furniture Kit (21 pieces: beds, sofas, tables, cabinets, bunks) | Kenney (kenney.nl) | CC0 1.0 (public domain) | https://kenney.nl/assets/furniture-kit | the furniture of servants' quarters, residences, hideouts, barracks and palace suites (`packs.ts`) |
| `kenney-kitbash` — built from pieces of the Space Kit and Space Station Kit | Kenney (kenney.nl), assembled here | CC0 1.0 (public domain) | https://kenney.nl/assets/space-kit | armour on stands, shields, kit cases, medpacs, prostheses, tool rolls and the melee weapons and launcher the Blaster Kit lacks (`tools/kitbash-recipes.mjs`; `interiors/stock.ts`, `weapons.ts`) |
| `sw5e-sabers` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | the lightsaber hilts (ten designs: straight, shoto, curved, guard, crossguard, sith, double, whip, pike, wrist), each with a blade of its own that can be swapped |
| `sw5e-blades` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | fifteen saber blade shapes (standard, broad, foil, dagger, baton, club, mace, axe, cutlass, katana, sickle, spear, ring, fist, serrated) |
| `sw5e-hybrids` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | the bowcaster, vibroshield, thermal detonator, camtono, datapad, holocrons, electrowhip, bolas and jetpack |
| `sw5e-weapons` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | bows, bolt-thrower, flail, knives, atlatl, dart, chakram, net and slingshot (bows and knives re-dressed from Quaternius' LowPoly Medieval Weapons) |
| `sw5e-worn` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | holsters, pouches, quiver, packs, power belt buckle, generators and bipod/tripod |
| `sw5e-instruments` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | the fifteen musical instruments |
| `sw5e-props` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | bottles, buckets, chests, tents, tools, devices, gaming sets (tent, chest, bucket, pot, mug, jug, flask, bedroll and shovel from Kenney's Survival, Food and Pirate Kits) |
| `sw5e-suits` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | life-support suits on stands, respirators, tanks, rafts, rations and clothing |
| `sw5e-ordnance` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | ammunition, missiles, mines, charges, spice, drinks and prostheses |
| `sw5e-devices` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | communication and data devices, tools and worn odds and ends |
| `sw5e-armour` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | the named armours, shields and shield generators (shields re-dressed from Quaternius' LowPoly Medieval Weapons) |
| `sw5e-droid` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | the droid customizations (plating, protocols, lifts, vocoders and special modules) |
| `sw5e-mods` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | the component families for item modifications and augments |
| `sw5e-gear` | Built for this project in Blender (original shapes, with pieces of the CC0 packs named in its licence file) | CC0 1.0 (public domain) | `tools/build-item-assets.mjs` from the `blender-sw5e` work | injectors, grenades, cartridges, cells, robes, helmets, rings, belts, boots, bracers and a few weapons |
| `figures/body` | Built for this project in Blender (original shapes: lofted sections and a displaced sphere, no third-party pieces) | CC0 1.0 (public domain) | `tools/blender/build-body.py` | the sculpted body of a person: trunk, arm, forearm and hand, thigh, shin and boot, and the head (a lower-detail file for a phone) |
| `figures/creature` | Built for this project in Blender (original shapes: lofted sections, smoothed and pushed in with small displacements, no third-party pieces) | CC0 1.0 (public domain) | `tools/blender/build-creature.py` | the heads, ears, a jaw and a beak of beasts (quadrupeds, brutes, runners), with a lower-detail file for a phone |

The models are not used as downloaded. `tools/convert-assets.mjs` bakes each model's texture colours into vertex colours
(so there is no texture to fetch), quantises the meshes and writes a second, low-detail file beside each (what a figure holds in
a hand); the blasters are baked in a steel ramp. The other packs keep their own colours on disk and are recoloured when they
load, into the palette of the room they stand in (`shared/art/tones.json`, `interiors/tones.ts`). `tools/kitbash.mjs` takes
converted models apart (islands of a mesh: a helmet, a limb) and builds new ones from the pieces. The converted files are what is
under `client/public/assets`; the downloads themselves are not kept (fetch the three kits again from kenney.nl to rebuild).

The `sw5e-*` packs (2026-10-20) are the models of the rules data's items (shared/art/itemModels.json is their catalogue, shared/art/itemIndex.json says which item has which). They were built headless in Blender from primitives and from pieces of Kenney's Survival Kit, Food Kit and Pirate Kit and Quaternius' LowPoly Medieval Weapons (all CC0), and converted by `tools/build-item-assets.mjs` (vertex colours, a finish and a part number for every vertex, a low-detail file beside each). Their `License.txt` offers the models as CC0; the owner of the project can change that for the parts that are original.
CC0 asks for no credit; Kenney is credited here because the work is theirs.

## Textures (downloaded)

Poly Haven (https://polyhaven.com), CC0 1.0, 1K maps fetched with `tools/fetch-polyhaven.mjs` into `client/public/textures`; each folder has `diffuse.jpg`, `normal.jpg` (OpenGL) and `height.jpg`. The sets: `floor/` (concrete_floor_worn_02, deck_plate, dirty_carpet, hangar_concrete_floor, marble_tiles, metal_plate, stone_tiles, terracotta_floor_tiles), `ground/` (brown_mud_03, dark_rock, dense_sand, dirt_floor, snow_02, rocks_ground_02), `wall/` (painted_plaster_wall, brick_wall_001, concrete_wall_003, corrugated_iron_02, rusty_metal_02, sandstone_blocks_05), `wear/` (the sources of the hull textures, see `tools/build-hull-textures.mjs`), `stone/` (rock_face_03: cave rock, boulders and stone walls), `bark/` (bark_brown_02: trunks and logs), `leaves/` (forest_leaves_02: canopies, fronds and shrubs; `diffuse-cutout.webp` is its alpha-cut version, made by `tools/build-leaf-cutout.mjs`), `needles/spray.webp` (a conifer branch spray, drawn by `tools/build-needle-spray.mjs`, this project's own).

| Folder | Sets | Used for |
|---|---|---|
| `ground/` | `dirt_floor`, `dense_sand`, `dark_rock`, `brown_mud_03` | the ground round a building (`siteAssets.tsx` `groundTexture`) |
| `floor/` | `metal_plate`, `hangar_concrete_floor`, `dirty_carpet`, `marble_tiles`, `stone_tiles`, `terracotta_floor_tiles`, `concrete_floor_worn_02` | the floors of rooms and rooftops (`siteAssets.tsx` `floorLook`) |
| `wear/` | `rusty_painted_metal`, `rust_coarse_01`, `peeling_painted_wall`, `painted_metal_shutter`, `metal_plate_02` | not drawn: the sources of the hull wear masks |
| `hull/` | made here by `tools/build-hull-textures.mjs` from `wear/` and drawn patterns (CC0) | the wear, scorch and panel plates of ships and speeders (`models.tsx` `hullMaterials`) |
| `figure/` | `skin`, `face`, `fabric`, `leather`, `plate`, `scales`, `fur` (+ `fur/strands.png`): made here from noise by `tools/build-figure-textures.mjs` (CC0, nothing downloaded) | the skin, faces, clothes, leather, armour, droid plating, scales and fur of the figures, and the strands of the shell fur (`models.tsx` `MATERIALS`, `FurShells`) |
| `figure/{fabric,weave,mesh,leather}` | Poly Haven scans (`rough_linen`, `hessian_230`, `ribbed_corduroy`, `brown_leather`), reduced to a pale detail map, a normal map and a height map by `tools/build-ref-textures.mjs` | CC0 1.0 (public domain) | `tools/refs/figure-sets.json` | the cloth, coarse weave, ribbed knit and leather of the figures (replacing the noise-made sets of the same names) |
| `figures/head`, `figures/hair`, `figure/head`, `figure/hair` | Built for this project in Blender (original shapes: a skull pushed into features, hair cards along walked guide curves; the maps baked from a high-polygon version of the same head) and by `tools/build-head-textures.mjs`, `tools/build-hair-textures.mjs` (made from noise and the project's own figure/face set) | CC0 1.0 (public domain) | `tools/blender/build-head.py`, `tools/blender/build-hair.py` | the heads of people (masculine and feminine, with a baked normal map), their hair styles, beards and brows |
| `figure/eye`, and the masks, machine head and head-tails in `figures/head` | Built for this project (the iris picture by `tools/build-eye-textures.mjs` from noise; the masks and head-tails in Blender by `tools/blender/build-gear.py`: lofts, patches over the face, tubes) | CC0 1.0 (public domain) | `tools/build-eye-textures.mjs`, `tools/blender/build-gear.py` | the eyes of the new heads; a droid person's head, a Tusken's wraps, rebreather, bone mask, goggles, Twi'lek lekku and Togruta montrals |

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

- Dejarik rules (shared/logic/dejarik.ts): "Dejarik Holochess" v1.0 by No Name Publishing, copyleft 2017 ("may be freely reproduced or distributed so long
  as original authorship credit is provided to No Name Publishing"), revised from HOLOCHESS by Mike Kelly (starwars-rpg.net). The board, the
  eight creatures' ratings, the two actions a turn, flanking, push and kill, and the Corellian and Imperial variants are theirs; the play is ours.
- Sabacc (shared/logic/sabacc.ts): the procedure of M. Brent Sleeper's 1995 rules for the 76-card deck (pagat.com/docs/sabacc_instructions.txt),
  with the face-card values agreed by Sleeper, Ryan B. (pagat.com/invented/sabacc.html) and Star Wars Report. Pazaak (shared/logic/pazaak.ts): the
  rules of Knights of the Old Republic as the project owner wrote them out. No card art or text from any of them is used.

Star Wars and its settings belong to Lucasfilm; the rules data come from the SW5e project (sw5e.com).
