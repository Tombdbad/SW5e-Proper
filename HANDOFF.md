# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-31 (Windows PC). Branch **`babylon`** (made from main at 379299c; main is untouched and still three.js). Last commit 549fe50 (the bridge). Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-10-31: Babylon.js draws the 3D map (REVIVAL_NOTES "Babylon draws the 3D map")
- The user: overhaul graphics, shadows and lighting with Babylon.js, every 3D scene, on a branch of its own. Route: R3F builds the scenes; `client/src/components/Map/babylon.ts` is the renderer (`<Canvas gl={babylonGl}>`) that mirrors each three scene into Babylon every frame. Committed in 549fe50.
- Then the user asked to work through the "not done yet" list. UNCOMMITTED, in progress (all in the working tree):
  - shader ports: `shaderPatch(material, patch)` / `patchOf` in babylon.ts (a WeakMap beside the material). Parallax = Babylon's own (height packed into the normal map's alpha, `packed`), hull wear / fur shells / sea waves = `CodePlugin`s; three ShaderMaterials (planet, shields, drei Stars, galaxy) run their own GLSL (`threeShader`, `shaderOf`). Hooks in surfaces.tsx, siteAssets.tsx (ground, floors, sea), models.tsx (fur, hull wear), dogfight/hullSurface.ts, interiors/limbs.ts (copies its base's patch).
  - posed limb shadows: `ShadowDepthWrapper` on limb materials.
  - look fixes: three's ACES exposure is /0.6 (Babylon's is not), Lambert diffuse (Babylon 9 defaults to Oren-Nayar), a map's alpha needs `hasAlpha` (was drawing see-through cards opaque).
  - shadow cost: per-cascade culling (`getCustomRenderList`, far cascades skip casters under 1/150 of their width), lamp cube shadows only within reach, thin-instance bounds refreshed. Sites gallery 2608 -> 1194 calls.
  - the look (full tier, `Mirror.look`): ReflectionProbe of rendering group 0 (the sky backdrop) as environment, its spherical polynomial zeroed (shine only); DefaultRenderingPipeline bloom (threshold 0.93, image processing off); SSAO2 on desktop. Lamps: `useLamps` + `LampLight` (models.tsx), Sky sets lit at dusk, street Decor lamps and garden lamps get a pointLight with `userData.cluster`, the bridge puts these in a `ClusteredLightContainer`.
  - dice table: public/dice/roller.html ported into `ui/dice.tsx` `diceTable()` (three geometry, cannon-es, BabylonRenderer); `ui/DiceRoller.tsx` lazy-loads it (no iframe, no CDN). Seen working. roller.html still to delete.
  - e2e/lib.mjs: answers the newer "How will this campaign be played?" dialog (addLocatorHandler), which made every self-contained step fail.
- Seen in the browser (dev 5099, test DB): hull wear, sea waves, fur shells, parallax, ships/player/sites gallery vs 5000; the game street (campaign 499) by day and night with probe+bloom+SSAO on. NOT yet: lamp light visibly reaching the deck (12 lamps clustered, materials have CLUSTLIGHT defines; checking), flights, pit, cockpit.

## Running
- My dev server on 5099 (test DB, `node --import tsx server/index.ts` from scratchpad `devtest.cjs`). The user's 5000 is `node dist/index.js` (three.js PRODUCTION build): do NOT `npm run build` into dist/ (it would change what 5000 serves). Plan: build into `.babylon-dist/` (add to .git/info/exclude) and serve it on 5098 for e2e.
- The browser pane counts as automated (no dice table via the store's request: set `useDice.setState({table})` directly). After HMR edits, import app modules by their `?t=` URL (performance resource entries) or you get a second instance.

## TODO / next, in order
1. Confirm the lamps light the ground; commit the work above in a few commits.
2. Build to .babylon-dist, serve on 5098, run e2e slices (race, pit, dogfight, road trip, taxi, starship combat, streets) and look at their screenshots; the cockpit view in /dev/dogfight.
3. Delete public/dice/roller.html; tests for the patches and the shader port in tests/interiors/babylon.test.ts; full npm test; REVIVAL_NOTES.
4. Full e2e (desktop and VIEW=phone) on 5098, then ask the user to check on their phone, then ask before merging into main.

## Open questions for the user
- (Earlier, still open) every daytime theft to ring at once (security tags)? Piper voices sorted by low/high?
