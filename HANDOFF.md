# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-04 (Windows PC). Branch **`main`**. Pushed to origin (97a6034 was the last saber commit; `dist/` rebuilt from it on this PC, nothing is serving port 5000 here: the production service is on the VM).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
`.claude/launch.json` (untracked) starts a dev server on PORT 5001 for browser checks (port 5000 is not running; nothing built or deployed).
Do not push, rebuild or merge without the user's go-ahead (the user said "push, merge, rebuild" for the saber work: done).

## This session (the user: "a more AAA graphical feel to the NPCs/characters/beasts and their animations", "you have blender available", then "focus on the old primitives, species and beast types that have not been touched yet")
Full write-ups in REVIVAL_NOTES.md: "A sculpted body and a person's own way of moving" (earlier commit 9f149a6) and "Beasts and the species with a muzzle" (this step).
- Blender 5.2 (C:\Program Files\Blender Foundation\Blender 5.2\blender.exe), headless: `blender --background --python tools/blender/build-body.py -- client/public/figures [--lo]`
  and `.../build-creature.py` (the shared helpers are in `tools/blender/shape.py`). Rebuild both files (with and without `--lo`) after changing a script.
- People: `body.glb` (trunk, limbs, hand, boot, head) plus now the heads of the species with a muzzle (`head_muzzle/long/short/pig/flat`) and a `beak`.
- Beasts: `creature.glb` (1.3 MB) has the heads of every quad, brute, runner and serpent plan, ears, the rancor's jaw, a beak, the quadrupeds' barrel and legs, the brutes' trunk, arms, hands and legs, a runner's legs, a hutt, three wings, a bug's body and legs. `interiors/body.ts` loads them (`shelf`: `creatureParts`/`useCreatureParts`); `quadruped`, `brute`, `runner`, `serpent`, `flyer`, `bug`, `critter`, `slug` in models.tsx draw them, the old primitives until the file is in. `Kit.add` multiplies a `mark` attribute (paler/darker) into the colour.
- limbs.ts: four new limbs (`earR`, `earL`, `tail2`, `jaw`; `LIMBS` 24) and `creatureLife` (breathing, head dip and look-about, ear flicks, the tail's tip, panting)
  called by `gaitPose(..., persona)` for the quad and walk gaits; a beast's neck is `chest`, a brute's whole trunk is `chest`.
- tests/interiors/body.test.ts has 13 tests (the people and the beasts). `npx tsc --noEmit` clean. See the last run of `npm test` below.

## Latest (the user: "serpent-like slithering for the opee sea killer and exogorth, a basic version for bi-ped beast tails and lizards, Krayt dragon, monkey lizard, Ysalamir; the Krayt has no feet, the Hutt no hands")
- New last pose slot `LIMB.wave` (24, `LIMBS` 25): a body's undulation done in both vertex shaders (`WAVE_GLSL` in babylon.ts, used by `limbMaterial` and `LimbPlugin`); `Wave` + `setWave` + `waveOf(plan)`; gaits `slither` and `crawl`; `FigureSpec.wave`. Krayt dragon: legs with thigh and reptile foot, lifted; hutt: `hutt_upper`/`hutt_fore` (hands with fingers) in creature.glb (rebuilt, both sizes); monkey-lizard regex now matches before the lizard's; tests in tests/interiors/body.test.ts (19 pass), tsc and vite build clean.
- Checked in the browser gallery (`?section=walk&cam=0,16,27&look=0,0,28.5`): the exogorth and snake undulate, the Krayt stands on feet, the hutt has hands, the lizard sprawls. Not seen: the Krayt's legs stepping while it walks, a kaadu's tail wave, in a real campaign. Tune `waveOf` numbers by eye.

## Latest 12 (the user: faces' nostrils, lips, brows; Zabrak skin; Besalisk arms; trooper armour; weapons, an aim button and scopes)
- Written up in REVIVAL_NOTES.md ("Faces told apart, four arms, weapons built whole, aiming and scopes"). Commits: 87dee0a (faces, Zabrak, Besalisk) and the one after it (weapons, aim, scopes, shell armour, gaze, head-tail sway). Nothing pushed, nothing built for 5000.
- New: `tools/blender/build-weapons.py` (run: `blender --background --python tools/blender/build-weapons.py -- <abs out> [--lo] [--preview <dir>]`, a few seconds; writes `shared/art/weaponKit.json` on the full run), `tools/weapon-audit.mjs`, `tools/weapon-fix.mjs`, `tools/build-figure-textures.mjs shell`, tests `tests/interiors/faces.test.ts`, `weapon-kit.test.ts`, `tests/combat/aim.test.ts`; limbs 39 to 41 (armR2/armL2/foreR2/foreL2, gazeR/gazeL).
- The model key now carries 16 bits of the seed (`faces & 262140`): `hue` is below 360, the face bits are `faceBits(name)` above it.
- The dev server dies if a file is half written (a Vite pre-transform error ended it once): restart it with the preview tool; a gallery page takes 25 to 40 seconds to show after the server starts.
- Not done: see the last bullet of the section. Keys: H aims (right mouse holds the aim), Y holds the zoom of binoculars and far eyes.

## Latest 11 (the user: "lets deal with species with a muzzle, a mask or a machine head, and the other items not done")
- Written up in REVIVAL_NOTES.md ("Heads, second pass"). New: `tools/blender/build-gear.py` (machine head, masks, head-tails; imported by build-head.py), snout heads in head.glb and a 2048 x 2048 atlas (`node tools/build-head-textures.mjs` after a bake: the Blender run takes about 8 minutes, give it ABSOLUTE paths and run it in the background), `tools/build-eye-textures.mjs`, finishes `eye`, limbs `hairA`/`hairB`/`lids` (LIMBS 35; `Kit.jointMaskHi`), tests `tests/interiors/species-heads.test.ts`.
- After rebuilding a file the browser may keep the old one: `fetch(url, {cache: "reload"})` in the page, then reload.
- Not done: hair for other skull shapes and crests, far-away hair, head-tails swaying, sheet masks' edges. Nothing pushed, nothing built for 5000.

## Latest 10 (the user: "lets start with humanoid heads and realistic looking hair styles")
- Written up in REVIVAL_NOTES.md ("Heads and hair"). Blender scripts `tools/blender/build-head.py` and `build-hair.py` (run with ABSOLUTE paths: a relative `--maps` went somewhere else), textures by `tools/build-head-textures.mjs` and `tools/build-hair-textures.mjs`; files `client/public/figures/head{,.lo}.glb`, `hair{,.lo}.glb`, `client/public/textures/figure/{head,hair}`. Gallery: `/dev/models?section=hair[&row=0..2&cam=..&look=..]`.
- New finishes `head` and `strand` (models.tsx), shelves `faceParts`/`hairParts` (interiors/body.ts), gender from the name (`genderOf`), tests `tests/interiors/hair.test.ts` (5).
- Not done: eyes, hair motion, hair shading, species' hair, LOD of the hair; see the notes. Nothing pushed, nothing built for 5000.

## Latest 9 (the user: "refactor the characters to AAA game standards: web search for reference images, snippets (snipping tool) into textures and normal maps, Blender, beautiful but few triangles, playable on this hardware"; chosen: everything at once, about 8k triangles with LODs, crop costume and face details too)
- This PC: Intel HD 530 (1 GB), i7-6700, 32 GB. The gallery's people section is 63k triangles at 29 fps in the preview pane: the budget is real. A person is about 5k triangles now.
- Found: Wookieepedia's image CDN answers a script with a Cloudflare challenge (do not spoof a browser; it was refused): open the image in the built-in browser pane (it loads), click it to natural size, `zoom` a region: that saves a native-pixel PNG (the "snipping tool"; at most about 800x600 a shot, and film stills are only 1-3k pixels, so a snip of a material is 100-300 px, dark and soft). So snips cannot give crisp normal maps: they give colour, markings and where the wear is.
- Done: `tools/build-ref-textures.mjs` + `tools/refs/figure-sets.json`: a figure finish's detail map, normal map and height made from Poly Haven scans (CC0): fabric <- rough_linen, weave <- hessian_230, mesh <- ribbed_corduroy, leather <- brown_leather (512, colour taken out, large shade divided out, mean 0.9; `node tools/build-ref-textures.mjs [set]`). Raw scans go to tools/refs/cache (ignored). Seen in the gallery: the burlap of a mendicant's robe is a real weave now. Not yet: plate, droid, skin, face, scales (no good scan; skin and faces want a different source), the LODs, the Blender head and garment work, and any snip used.
- Next, in order: (1) look at fabric/leather/mesh tiling scale (`SURFACE_GRAIN` in surfaces.tsx) on a robe, a trooper's undersuit and a belt; (2) plate and droid from metal scans, tinted by a snip's colour; (3) Blender: a proper head with a baked normal map (high-poly sculpt to the low head), garments as modelled pieces (robe, tunic, vest, armour plates) with an unwrapped atlas, droids; (4) LODs by distance and a triangle/fps check on the 5001 gallery after each step.

## Latest 8 (the user: "slow the sabre animations 15%; the staff's bottom half and the dual off hand are drawn differently (dim or invisible); the staff is not held right; the whip should droop like cloth; combos of up to 10; every weapon a spin; a page /dev/models?section=saberCombo with attacker and defender dropdowns")
- Root cause of the dim blades: the saber pack's blade models have triangles wound both ways, so the one-sided `glow` material lost faces from some sides: `MATERIALS.glow` is DoubleSide now (models.tsx). Off hand drawn with the main hand's model. `PACE` 1.15 in saberplay.ts. Staff: `STAFF_ARMS` + `gripStaff` (left hand reached to the hilt each frame) + `STAFF_TURN`. Whip: curved 7-piece lash, `lashBend` hangs it (`HANG`), low guard. Spins (`pirouette`, `whirlHead`, `whirlwind`, `lashSpin`), combos to ten. `planDuel` + `Motion.play` + `?section=saberCombo` (ModelGallery.tsx `SaberDuel`, `SaberComboPanel`). Details: REVIVAL_NOTES.md "Saber fights", "Second pass". 24 tests in saberplay.test.ts; tsc clean.
- Not seen: a real fight; the numbers are by eye. Nothing pushed (the saber commits are local). Debug tip: the Babylon meshes are in `window.__babylon.engine.scenes[0].meshes` (`getVerticesData("limb")`), a material's `backFaceCulling` and `wireframe` can be toggled there to see what is culled.

## Latest 7 (the user: "refactor the lightsabre strike animations: AAA combos, slow heavy and light fast, jumping, crouching, blocks and Force, by form and by weapon: broadsabre, crossguard, double staff, dual wield, whip")
- New pure module `interiors/saberplay.ts`: moves (light, heavy, leap, low, guard, force, spin; eased, hit-stop, lunge `step`), combos per weapon kit (`SaberKit`: single, broad, crossguard, staff, dual, whip) and per form (`FLAVOUR`, `TEMPO`), chain state (`beginSwing`, `Motion.chain/combo/prevAt`), `styleFor(kit, form)`. limbs.ts `humanPose` plays them (chained moves blend from the last pose); 3 new limbs (`weaponL`, `whip1`, `whip2`, LIMBS 32, shader chain 5 deep in three and Babylon). models.tsx: `npcSaberKit`, `FigureSpec.kit`, `whipAt`, `saberAt`, crossguard fallback blades, staff grip; gear.ts `KIT_WEAPON`. Scenes call `beginSwing`. Gallery `?section=sabers` (see REVIVAL_NOTES.md "Saber fights"). tests 17 new (saberplay.test.ts), full suite 619 pass before them, tsc and vite build clean.
- Not seen: a real fight (only the gallery's films and stills); first-person `placeSaber` unchanged; every number is by eye. Nothing pushed.

## Latest 6 (the user: "hailfire camber 25, rims -35%, struts -50%, nothing floating; AT-AT is running, AT-ST knee bends the wrong way")
- Hailfire revised (25 degrees, slim rims, struts half as long, racks and antenna attached; a test joins every piece). New gaits in limbs.ts: `birdwalk` (AT-ST, AT-RT: shin flex reversed) and `walker` (AT-AT: four-beat walk, feet placed by `walkerLeg` IK from `WALKER`, never more than one foot up). tests 216 pass.
- Not seen: the walkers moving in a real fight (the old trot had all four feet off the ground in 128 of 160 phases; the new walk at most one).

## Latest 5 (the user: "the Hailfire has EXTREME camber; the AT-AT, AT-ST and hexapod animations are FAR too fast")
- Hailfire hoops lean out 35 degrees (`HAILFIRE_CAMBER`), each its own limb (`wingL`/`wingR`) turning about its tilted axle (`Mover` `camber`). Stride cycle was multiplied by scale (my bug: bigger = faster); now `strideCycle` = cycle / scale^0.6. tests 213 pass, tsc and vite build clean.
- Not seen in a real fight; the pace of the walkers is by the formula, not looked at moving.

## Latest 4 (the user: "match the Hailfire to this image; you missed the AAT, AT-AT, AT-ST and others")
- Hailfire rebuilt to the reference (open ribbed hoops, drive pods, struts, small dome, missile fans). The 14 `construct` blocks (AT-ST, AT-RT, AT-AT, AT-TE, AAT, Occupier, turrets, P-Tower, DF.9, sonic cannon, sentry, 74-Z, brain walker) are now drawn to `MACHINE_METRES` (stat-block text, else databank), each its own model, the walkers on jointed legs that walk. AAT and Occupier are no longer one model. `machineFit`, `figureTop`. tests 212 pass, tsc and vite build clean. Gallery `?section=machines` (`&hold=1`).
- The AT-AT is 16 units tall: it will not fit most arenas. Sizes for sonic cannon, sentry gun, brain walker are estimates. Speeders/ships not looked at.

## Latest 3 (the user: "deep analysis of the scales of droids: SIGNIFICANT mis-matches")
- Measured all 46 droid stat blocks: probes 2.2 m tall, B1 shorter than a person, B2 shorter than B1, Small medical droid a person's height, Large/Huge/Garg all x1.5, droid size ignored. Fixed: `DROID_METRES`/`droidStature`/`droidBuilt` give each a stature, `figureSpec` returns `scale`/`foot`/`height`, `Figure` uses it (ring = footprint), `Mover` scales the stride, labels use `figureTop`. Hailfire, Vulture, Hyena, Persuader are droid models now (`constructKind` lost the first two). SD-K4 is a probe, JK-13 a spider. See REVIVAL_NOTES.md "The scales of droids". tests 209 pass, tsc and vite build clean. Gallery `?section=scale&cam=0,6,26&look=0,1,6`.
- Heights are from memory (canon), the table `DROID_METRES` is where to change them. Not done: war machines (AT-ST etc.) and beasts are still x1.5 for any size from Large up.

## Latest 2 (the user: "quadrupeds and bi-peds, incl. humanoid droids, need knees; the acklay's 4 legs animated as a quadruped; the droideka must be ONE model that folds onto the wheel")
- Knees: limbs `shinHR/HL/MR/ML` (LIMBS 29, `SHIN_OF`, PARENT); quad, brute, runner, krayt, acklay, bug and the humanoid and four-legged droids are built with a shin on a joint (`kneed`); gaits bend them (walk, quad, crawl, slither). Acklay is on `quad` gait.
- Droideka: ONE model (`DEKA`, `DEKA_LEGS`, `dekaPose` in limbs.ts; `Droideka` in models.tsx), gait `droideka` (was `tripod`), `destroyer-ball` removed. Gallery `?section=droideka&cam=0,3.2,5.5&look=0,0.4,0.3`. See REVIVAL_NOTES.md "Knees, and a droideka that folds". tests 207 pass, tsc and vite build clean.
- Not seen: a droideka in a real campaign (its pace and the fold in `Stepper`/follower code in LocalMap.tsx are unchanged); the shadow stays the standing form's while it rolls.

## Next, in order
1. Look at it in the browser (gallery `?section=beasts|people|walk`) and in a real campaign, in motion: the brutes and quads walking, the hutt's face, the wings
   (thin; the bat's and manta's are rough), a Wookiee and a Gamorrean close up; tune the bumps and marks in the Blender scripts if a part reads wrong.
2. Still primitives: tentacles (dianoga, rathtar, sarlacc), frog, monkey, plants, the spirit; a cone or hammer head and a trunk or
   pig's disc on a person; blinking; cloth that follows the body. Lekku and head-tails could swing on `earR`/`earL`.
3. A skin finish with a soft rim/subsurface look in `MATERIALS.skin`/`face` (babylon.ts plugin) if the faces still look flat under the sun.
4. Ask: build, restart 5000, push (new campaign worlds are life 18: no migrations).
5. The "outdoor daylight like a roof" report from before is still open (not reproduced; ask where and when).

## Useful
- Dev server for checks: `mcp preview_start dev-5001`; a syntax error in a file while editing kills the dev server (restart it). The page compiles
  shaders for 30 to 60 s on this machine (black frame first); the gallery is `/dev/models?section=roles|people|walk|beasts&cam=x,y,z&look=x,y,z`
  (rows of 8: person i of `people` at x = -4.9 + 1.4 i; beast i of `beasts` at x = -6.3 + 1.8 i, z = 0 for the first row).
- Blender previews: scratchpad scripts import a glb and colour by `_AO`/`_REGION`/`_MARK` (not in the repo).
- Files are CRLF in the working tree: the Edit tool handles it; scripts must normalise (`\r\n` -> `\n`) before matching multi-line text. Bash heredocs
  with backticks in them can fail: write the script to a file and run it.
- `python` is not on this machine's PATH (use node for scripts, Blender's own Python for Blender).
