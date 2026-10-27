# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-26 (late night), branch `main`. Last commit: `c1495fe` (the earlier work of the day). **This session's work is not
committed** (the user has not asked). The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## Done this session (details in REVIVAL_NOTES, "Skies, horizons, globes and the land across a course")
The user's request: geographical features in distant views from settlements, clouds, suns/moons/planets in the sky, features met on
the way and in speeder races (gorges, hills, bridges over water/lava), the globe from orbit showing the land, the party drawn as its
ship in space (not standing), and the dogfight's big ships matching the map models.
- shared/logic "Skies and landforms" (`skyLook`, `worldLook`, `landformsOf`, `biomeSky`) + new `components/Map/scenery.tsx`
  (`WorldSky`, `PlanetGlobe`, `PlanetBall`). Used by LocalMap `Sky` (street + settlement, with fog), the planet view's globe,
  FlightScene race/chase, ArenaScene air and space backdrops.
- LocalMap `PartyCraft`: the party in orbit/at a jump point is its ship (campaign `starships` passed in GameBoard's `scene`) or a shuttle.
- Race courses: `layCrossings` (gorge, hill, river/lava + bridges with rails, lava burns), `groundAt` = `landAt` + rivers, `raceWater`.
- Dogfight: `hullSpec(cls, role, imperial)` styles "corvette"/"wedge" after models.tsx; compound hull volume; new capitalGeometry;
  calmer liveries (`busy`), vertex-colour paint, `worldUV` keeps normals.
- Test hooks: atlas `?here=&view=`, `/dev/dogfight?game=race|chase&biome=&seed=`, `window.__raceTrack`, `window.__raceWarp`.

## Checked
- `npm test`: 346/346 (new tests/world/skies.test.ts 4; dogfight hull tests rewritten for wedge + corvette).
- tsc: no errors in touched files.
- Screens (scratchpad scripts, dev server 5057): dogfight cruiser/battleship both looks, orbit globes (volcanic, forest), settlement and
  street horizons (forest, volcanic, swamp), races (volcanic lava bridge, forest river bridge, desert gorge, forest hill), air battles.
- Bot races over the new courses: rivals finish 2:34-2:48.
- e2e on the dev server (5057): 86/88. The two failures (cantina: the bartender called to the bar; trade, which needs it) also fail on the
  pre-session build (5002 baseline: 85/88, the same two plus "a tap on the way out"): frame-rate-bound under software rendering, not new.
  A first run had 83/88 (droid, captive, allies too) before the sky was made cheaper (vertex-coloured dome, fewer clouds, FarGround).
- Frame-rate checks on the dev server are noisy: the first (cold) runs after a change read 3 fps where warm runs read 11-17.

## Processes
- Dev server on 5057 (sw5e_test, VITE_TEST_MENU=1) still running (from the session before). 5000 (prod) and 5002 untouched.
- No e2e running.

## Next
1. The user looks; rebuild 5002 (`deploy/windows-start.ps1 -Mode test`) when asked. Commit only when asked.
2. Not done (in the notes): the street's own ground stays flat (no river or hill on the street map); the horizon is not placed from the
   globe's mountains; the pilot's route and taxi run fly the old flight model over flat ground.

## Learned
- Bash heredocs/`node -e` mangle backticks and `${}`: write patches with the scratchpad `patch.cjs` (blocks @@@ FILE/OLD/NEW/END, CRLF-safe).
- `<fog attach="fog">` inside a group attaches to the group: set `scene.fog` (WorldSky does, and restores it).
- A ShaderMaterial needs `#include <tonemapping_fragment>` and `<colorspace_fragment>` or its colours come out unconverted.
