# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-04 (Windows PC). Branch **`main`**. origin/main is at 1277668; everything after it is local, NOT pushed (the last commit is the slither one: `git log -1`).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
`.claude/launch.json` (untracked) starts a dev server on PORT 5001 for browser checks (port 5000 is not running; nothing built or deployed).
Do not push, rebuild 5000 or merge without the user's go-ahead.

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
