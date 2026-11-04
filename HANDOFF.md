# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-04 (Windows PC). Branch **`main`**. origin/main is at 1277668; everything after it is local, NOT pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
`.claude/launch.json` (untracked) starts a dev server on PORT 5001 for browser checks (port 5000 is not running; nothing built or deployed).
Do not push, rebuild 5000 or merge without the user's go-ahead.

## This session (the user: "a more AAA graphical feel to the NPCs/characters/beasts and their animations", then "you have blender available")
Full write-up: REVIVAL_NOTES.md "A sculpted body and a person's own way of moving". Summary:
- Blender 5.2 (C:\Program Files\Blender Foundation\Blender 5.2\blender.exe) builds the body headless: `tools/blender/build-body.py` ->
  `client/public/figures/body.glb` + `body.lo.glb` (trunk, arm, forearm+hand, thigh, shin+boot, head; per-vertex `_AO` and `_REGION`).
- `interiors/body.ts` loads and fits it; `buildHumanoid` (models.tsx) draws a person from it once loaded, else the old primitives.
- `interiors/limbs.ts`: `Persona`/`personaOf` (a person's own stride, sway, slump, fidget), idle breathing + weight shift, walk hip drop/sway/twist,
  elbow follow-through, lean into starts/stops (`Stride.accel`), bank into turns (`Stride.turn`); `Root` has `sway`, `roll`, `pitch`.
- tests/interiors/body.test.ts (8 new). `npx tsc --noEmit` clean. Full `npm test`: 598 tests, the 3 asset-folder failures (an `sw5e-` folder is scanned as an item pack) were fixed by putting the body in client/public/figures; vite build to a scratch folder: no warnings.
- Committed locally (not pushed) as the last commit "Sculpted bodies from Blender, ...". The "outdoor daylight like a roof" report from the previous handoff is still open (outdoor brightness was not reproduced; ask where and when).

## Next, in order
1. Look at it moving in the browser (gallery `?section=walk`, then a real campaign in Play), tune the sign and size of sway/roll if anything
   reads wrong (they are small numbers in `humanPose`'s tail: `sway`, `roll`, `pitch`, `spin`). Look at a heavy-armour trooper and a Wookiee close up.
2. Beasts: head/neck bob, breathing, ear and tail secondary motion in `gaitPose`/`bodyOf` (not touched yet). Blinking (the eyes are baked spheres).
3. A skin finish with a soft rim/subsurface look in `MATERIALS.skin`/`face` (babylon.ts plugin) if the faces still look flat under the sun.
4. Ask: build, restart 5000, push (new campaign worlds are life 18: no migrations).

## Useful
- Dev server for checks: `mcp preview_start dev-5001`; a syntax error in a file while editing kills the dev server (restart it). The page compiles
  shaders for 30 to 60 s on this machine (black frame first); the gallery is `/dev/models?section=roles|people|walk&cam=x,y,z&look=x,y,z`
  (a person at row i of `roles` stands at x = -4.9 + 1.4 i, z = 0 for the first row; cam=-4.2,1.2,2.2&look=-4.9,1,0 frames the first).
- Blender previews: render the glb parts with a small Cycles script (see the scratchpad idea in the notes: import glb, material with attributes `_AO`/`_REGION`).
- Files are CRLF in the working tree: the Edit tool handles it; scripts must normalise (`\r\n` -> `\n`) before matching multi-line text.
