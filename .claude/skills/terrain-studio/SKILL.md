---
name: terrain-studio
description: Making realistic terrain for SW5e's outdoor scenes - the ground round settlements, districts and wild places, the land under atmospheric dogfights, speeder races and road trips, and the globe seen from orbit - with the Terrain Studio method (sculpt, stream-power rivers, droplet erosion, thermal talus, polish, level pads and roads, colour from slope and drainage). Use for any work on height fields, hills, mountains, valleys, rivers, dunes, mesas, craters, ground colour, trees and rocks on the ground, or `shared/logic/terrain.ts`.
---

# Terrain Studio for SW5e

**Terrain Studio** (HowdyMoto/terrain-tools, MIT, 2026; <https://github.com/HowdyMoto/terrain-tools>) is a Three.js terrain authoring toolkit and local browser editor: sculpt brushes, hydraulic and thermal erosion with preview, four-layer PBR surface rules by altitude and slope, foliage brushes, water, PNG16/RAW16 heightmap exchange, first-person walk-through. It needs Node 22.12+ and Chrome or Edge with WebGPU (no WebGL fallback). It was cloned on 2026-11-10 to a scratch folder (not in this repo; 205 MB with its assets). Its code is not a dependency of the game: it edits one landscape at a time, by hand, in WebGPU. **What the game takes from it is its method**, and its erosion maths (the droplet loop and the conservative thermal step are ported, credited in CREDITS.md), as `shared/logic/terrain.ts`: pure, seeded, nothing stored but the spec.

Use the editor when you want to *look* at a landform and learn what a setting does: `git clone https://github.com/HowdyMoto/terrain-tools.git <scratch>/terrain-tools`, `npm ci`, `npm run dev`, open the printed URL, **Sculpt -> Terrain -> Generate** (Alpine, Dunes, Islands), **Weather landscape** (hydraulic, thermal or both; Original/Result toggle), **Heightmap exchange** (export a 16-bit PNG to compare against our `terrainFor` output). Clone into its own new folder, run `npm ci` there, never from inside a folder of ours.

## The order (do not merge passes, do not drop one)

`makeTerrain(spec)` runs these in this order. Each undoes something the one before did.

1. **Sculpt.** Warped, slope-damped fractal noise for the base (Quilez: each octave is damped by the slope the coarser ones made, so steep ground is smooth and flat ground gets detail); ridged multifractal for mountain ranges (each octave weighted by the one before: rough peaks, smooth valleys), mixed in only where a low-frequency mask allows; `pow(h, power)` so valleys are flat and tops sharp; dunes (long windward side, short slip face), terraces (mesas), craters (rim and bowl). **Domain-warp every lookup** or the ridges align with the grid. Rotate and shift every octave. Normalise to 0..relief only after mixing.
2. **Stream power** (Braun and Willett 2013). Receiver = steepest of 8 neighbours; sort high to low, accumulate drainage area; incise low to high so the receiver already has its new height: `F = k * min(A, cap)^m / dist; h = (h + F * h_recv) / (1 + F)`. This is what makes valleys *branch*. Droplets alone only scratch slopes. `k` 0.12 and `m` 0.5 behave; bigger stays stable and still looks wrong (knife ridges). Cap the area or one basin carves a canyon.
3. **Droplets** (Lague; Beyer; Terrain Studio's `erodeTerrain`). Inertia 0.15, capacity 4, erode 0.3, deposit 0.3, evaporation 0.04, radius 2, up to 48 steps. **Gate the erosion by slope** (`smoothstep(tan 18 deg, tan 30 deg)`): flats that get scratched look like noise again. Spread the take over a small radial kernel (single-cell trenches read as scratches). Keep the outer ring fixed.
4. **Thermal.** Past the angle of repose (talus 28-38 degrees) the excess slides to the lower neighbour, an eighth to each at most, so no ground is lost and nothing overshoots.
5. **Polish.** Blur the flat ground, weighted by flatness, with a radius that varies by place. A fixed radius makes soft ground look like a filter.
6. **Level** where something is built: `levelDisc` (a pad: flat to `r`, blended back over `blend`) and `levelRoad` (the road follows the contour: the heights along it are smoothed over about 260 m and the ground within half the width is brought to that). **Any pass that cuts must be followed by "put the wash back"**: the flat the player or a vehicle uses is applied after the erosion, never before it.
7. **Colour** from where the water went and how steep the ground is (`terrainSplat`, `terrainColorAt`): rock on steep, convex, high ground; sand on flats and in concave, wet places; snow above the biome's line, less on steep ground; soil greener low and drier high; wet where the flow is big and the slope small; hollows darkened (ambient occlusion from the curve). Never paint a slope mask that ignores where the water went.
8. **Dress** (`scatterOn`): a jittered grid thinned by density, kept where slope, height and flow allow. Trees on gentle ground below the tree line, rocks on the in-between slopes. Never noise thresholds for placement (they clump in rows).

## Realism rules (the expert list)

- Real ground is about 1/f: if a band of frequency is loud for its wavelength the land looks cartoony. Gain 0.5 per octave is the floor; damped fbm lowers the loud bands further.
- A map needs flat places and sharp places. One exponent (`power` 1.2 to 2.4) does it. Hills everywhere read as a pillow.
- Gullies, rills and rivers go downhill. Isotropic noise on a slope reads as static.
- Rivers first, land second, where you can (Bremen CGI 2022): fill depressions, route D8, count the area, call large areas rivers and filled pits lakes. Rivers carved after the land run uphill at the joins; carve with the same height function the vehicles and the mesh use (`groundAt`).
- Scale sanity (1 square = 1.4 m, `UNITS_PER_M` 0.711): a hover race wants slope under about 1 in 10 where it runs; a settlement wants a level pad; a hillside a fighter flies along wants 1 in 3 to 1 in 1; real talus is 30-38 degrees; a mountain range at a settlement's horizon is 100-400 m up, 2-10 km off.
- `Math.pow` of a negative is NaN and nothing throws: the mesh, the colours and the camera go to NaN and the page is a sky. Clamp every `pow`.
- One basin must not drain the map: cap the drainage area.
- Skirts: ease the rim of a finite map to a flat level (`rim`), so the plain that goes on to the horizon joins it; a visible frame means the rim is too wide or too steep.
- Everything seeded and integer-hashed (no `Math.sin` in the noise): the server and every browser must agree to the metre, because ground vessels, bombs and speeders are placed on it.
- Heavy passes are cached (`terrainFor`, 6 kept). Budget: n=129 about 0.3 s, n=257 "light" about 0.4 s, "full" 1.6 s. Pick the grid by use, not by habit; tests start dozens of courses.

## Where it is in the game

| Place | What | Where |
|---|---|---|
| Round a settlement, a district, a wild place (open sky) | `ReliefGround`: the biome's land, flat under the ground the party can walk, rising to its height over `RISE` squares, vertex-coloured, with trees (green biomes) or rocks (bare) | `client/src/components/Map/terrain.tsx`, used by `LocalMap.tsx` (the place's ground, and the settlement view's), seed `look.seed` |
| Speeder race, chase, road trip, convoy | `RaceTrack.land` (n=129, scale 0.35 of the style's relief): `landAt` takes a tenth of it near the track and all of it from about 340 m out, then the gorge, hill, dips, ramps and rivers as before; `RaceGround` colours it from slope and altitude | `shared/logic/index.ts` `raceCourse`, `landAt`; `FlightScene.tsx` `RaceGround` |
| Atmospheric dogfight | `AirField.land` {biome, seed, discs, roads}: `airTerrain` (9.6 km, n=257, scale 2.4, light erosion, rim 0.07), level under a settlement (r 330, blend 520) and along the convoy road (60 m wide, blend 240); every flyer, bomb, vehicle and building uses `airGround`; foes look 200 and 420 m ahead to climb a ridge (`keepUp`); a strike is scored along the ground's normal; `bombFall` takes the ground | `shared/logic/dogfight.ts`, `dogfightSim.ts`; `ArenaScene.tsx` `AirBackdrop` |
| The planet from orbit | the globe's noise is domain-warped (continents and ranges bend) | `scenery.tsx` `landHeight` |

Styles: `TERRAIN_STYLES[biome]` (relief, wave, octaves, warp, ridges, power, terrace, dunes, craters, stream, droplets, thermal, talus, snow, sandy, palette). Change a world's land there, not in the callers. A new biome needs a style, a palette and a look in `scenery.tsx` RECIPES and `siteAssets.tsx` `groundTexture`.

## Tuning recipes

- Flatter, softer land: lower `relief`, raise `power`, raise `polish` passes. Craggier: lower `power` toward 1, raise `ridges` to 0.6, lower `warp`.
- A mesa country: `terrace` 4-6, `ridges` 0.2, thermal high (the steps keep their cliffs only if the talus is steep).
- Dunes: `dunes` 0.4-0.6, `sandy` 0.7, droplets 0.3, thermal 14. Keep `power` near 1.2.
- A river valley with a walkable floor: sculpt a path, stream power, then `levelRoad` along the path (the wash back), then droplets (gated), then polish.
- Cliffs that overhang cannot be stored in a height field; fold vertices on slopes past about 45 degrees downhill in XZ for the camera (Vault 80's "fold"), keep it small, it reads from the path only. Not done in the game.
- More detail at no cost: sample the field with extra octaves in the colour and the normal, not in the mesh (the mesh only smooths what the field has).

## How to check a change

1. `npx tsx --test tests/world/terrain.test.ts tests/ships/airfight.test.ts tests/world/skies.test.ts tests/world/roadtrip.test.ts tests/world/convoy.test.ts`; then `npx tsc --noEmit` and a scratch `vite build` (no warnings).
2. Look at it without a campaign: `/dev/terrain?biome=forest&seed=5&view=high|low|top&inner=120` (the relief round a flat place), `/dev/dogfight?scenario=defend|raid|escort|strike&biome=desert&seed=9`, `/dev/dogfight?game=race&biome=jungle&seed=3`. Dev server on a test port only (see CLAUDE.md), never the production port.
3. For the *shape* of a landform (not the colours) a shaded-relief PNG from a node script is faster than any scene: sample `terrainHeight`, light by the gradient, write a PNG (a 40-line script with `zlib`); judge the drainage, the flats and the rim there. Do this before tuning a style.
4. Compare with the Terrain Studio editor's own output for the same style when something looks wrong: if its Alpine at the same relief looks better, the difference is usually a missing pass (stream power, the slope gate, polish).

## Failure log (add a row when something goes wrong)

| Date | Symptom | Cause | Fix |
|---|---|---|---|
| 2026-11-10 | stream power took 200+ ms on 129 x 129 | `Uint32Array.sort` with a comparator | sort a `Float64Array` of `quantised height * 2^20 + index` (no comparator) |
| 2026-11-10 | an air fight test failed: "on the ground" at y = half | the old rule was ground at y = 0 | ground vessels stand at `airGround + half`; the tests ask the ground |
| 2026-11-10 | a speeder track's steepest 0.196 | a crossing's hill and gorge are steep on purpose | test the land with `crossings: []` |
| 2026-11-10 | `str.replace` of `\n` strings did nothing in `siteAssets.tsx` | CRLF file | use the Edit tool there (the shared logic files are LF) |
| 2026-11-10 | R3F scene unreachable from the page's React fiber (no store on the canvas) | R3F has its own reconciler root | look through `/dev/terrain` instead of poking the app |

## Sources

Terrain Studio (docs: SCULPTING, EROSION, MATERIALS, ENVIRONMENT, WATER) - Red Blob Games, "Making maps with noise functions" - Inigo Quilez, "More noise" (derivatives), "Domain warping" - Vault 80, "Stream-power heightmap erosion in Three.js" and its `terrain-erosion` SKILL.md (the order above, the wash, the fold) - Procedural Pixels, "Fastest erosion algorithm ever" (a slab filter: fast, but it melts crags; not used) - Sebastian Lague, Hydraulic-Erosion (droplets) - Musgrave, Kolb and Mace 1989 (thermal) - Braun and Willett 2013 (stream power) - Bremen CGI 2022 (rivers first) - symbios-ground and Polyphase Terrain3D docs (default splat rules: grass low and gentle, dirt mid, rock steep at any height, snow high and flat).
