# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-31 (Windows PC). Branch **`babylon`** (made from main at 379299c; main is untouched and still three.js). Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-10-31: Babylon.js draws the 3D map (REVIVAL_NOTES "Babylon draws the 3D map")
- The user: overhaul graphics, shadows and lighting with Babylon.js, **every 3D scene, a full move**, on a branch of its own, three.js kept for geometry, the old /map viewers and the dead 3D files ported too. Plan file: `~/.claude/plans/sequential-yawning-wombat.md` (its "own React components" route was replaced, with the user's yes, by the one below).
- **Route**: R3F still builds the scenes, runs the loop, cameras and taps; `client/src/components/Map/babylon.ts` is the renderer given to `<Canvas gl={babylonGl}>`, mirroring the three scene into Babylon each frame (meshes, PBR materials, cascaded sun shadows, lamps, thin instances, points, lines, sprites, drei Text, a limb material plugin). Packages added (approved): `@babylonjs/core` 9.33.1, `cannon-es` 0.20.0 (for the dice page, not used yet).
- Done so far: the bridge, with a point-sprite shader of its own; EVERY `<Canvas>` given `gl={babylonGl}` (GameBoard, ModelGallery, PitArena, GalacticMapView, GalacticMap3D, SystemMap, LocalAreaMap, FlightScene x3, DogfightGame, ui/dice, PlanetaryExploration); `limbMaterial` sets `userData.limbParents`; siteAssets.tsx hands its quality tier to `setRenderTier`; tests/interiors/babylon.test.ts (5, NullEngine). Seen in the browser: gallery (furniture, moves, walk, interiors), the game (a fight in a shop, campaign 498), the dogfight lab, /map. NOT yet seen: flight scenes, pit, cockpit view, old /map viewers.
- Learned: Babylon 9's PBR divides direct light by π as three does (only the hemisphere needs 1/π); a right-handed Babylon scene shows three's meshes inside out unless `mesh.sideOrientation = 1`; a material plugin's code is asked for inside its base constructor (pass data beside it, `JOINTS`).

## Running
- A dev server of mine on 5099 (test database) may be running (`node --import tsx server/index.ts`, started from the scratchpad `devtest.cjs`); stop it if it is. The user's own server on 5000 is the three.js build: compare against it.
- The browser pane loads a gallery page slowly (10-20 s); `window.__babylon` is the last renderer made (`.mirrors`, `.mirrorOf(scene)`).

## TODO / next, in order
1. Look at the flight scenes (race, road, chase, convoy), the pit, the dogfight's cockpit view (Cockpit draws a second scene with `autoClear` off) and a settlement street by day and by night, against 5000.
2. Port the other shader patches as plugins: parallax (surfaces.tsx, siteAssets groundShader), hull wear (models.tsx), fur shells (gl_InstanceID), sea waves; ShaderMaterials (scenery planet, ArenaScene/CapitalShip shields, drei Stars) via a `userData` hook; limb shadows (shadow depth wrapper).
3. The look: environment light from the sky (a reflection probe of WorldSky), bloom/glow for glow finishes, SSAO on full, clustered street lamps at night; tune against 5000.
4. The dice roller page (public/dice/roller.html, three r128 + cannon from cdnjs) → a Babylon + cannon-es component; port the dead files; e2e (`__arena.gl.info.render.frame` is kept by the bridge's info counters).
5. Full `npm test` + `npm run build` + `npm run e2e` (desktop and phone), then ask the user to check on their phone, then ask before merging into main.

## Open questions for the user
- (Earlier, still open) every daytime theft to ring at once (security tags)? Piper voices sorted by low/high?
