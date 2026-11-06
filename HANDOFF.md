# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-06 early by a cloud session (it reached the PC only through a file bridge and the open Mixar window: no shell, no npm registry).
Branch **`nov5-wiring`** on origin, one commit on top of main 60d3b34. main on origin was fast-forwarded from 97a6034 to 60d3b34 (the PC's nine unpushed
commits: heads, hair, faces, weapons, the Mixar skill, the architecture kit) by copying the PC's git objects; nothing was rewritten.
The user's own `client/src/components/ui/Alert.tsx` is still modified on the PC: leave it, never commit it.

## To finish (the user asked: "wired into the game, committed, pushed, merged to main, and rebuilt - ready to play")
Run on the PC, in the repo: `powershell -ExecutionPolicy Bypass -File deploy\finish-2026-11-05.ps1`. It sets aside the files the session copied into the
working tree by hand (saved under %TEMP%\sw5e-finish-*), checks out origin/nov5-wiring, runs `npx tsc --noEmit`, `npm test` and a scratch Vite build,
and only if all pass fast-forwards main, pushes it and runs `deploy\windows-start.ps1 -Mode prod`. Log: tools\refs\cache\finish-2026-11-05.log.
If it stops: read the log, fix on the branch (this code was never type-checked against the real packages), push, run it again.

## What the branch has (REVIVAL_NOTES.md: "Round rooms of wall bays, ..., and the species' own heads")
- Architecture kit, 47 pieces in figures/architecture.glb (exported from the open Mixar session, `builtins.ARCH_EXPORT=True`), architecture.ts layout rules
  (storeyPlan, rampPlan, gantryPlan, parapetPlan) and village layout (treeVillageSpots, villagePieces), regions 5 leaf and 6 thatch.
- In the game: round rooms of radius 3.75-6 built of bays with doors cut through (models.tsx KitRoomBlock/drumPlan, used in LocalMap BuildingScene);
  tree villages in the backdrop of forest/jungle/swamp settlements (siteAssets.tsx TreeVillages).
- Species heads: figures/species.glb, textures/figure/species, shared/art/speciesHeads.json, finish `species`; Mon Calamari, Rodian, Trandoshan, Besalisk,
  Sullustan, Toydarian heads; Zabrak/Devaronian/Iktotchi horns and Nautolan head-tails as sculpted parts (Look.speciesHead, Look.hornStyle).
- Tests: tests/interiors/species-sculpts.test.ts (new), three more in tests/interiors/architecture.test.ts.
- Tools: tools/blender/build-species.py, tools/build-species-textures.py, tools/refs/species.py and moodboard.py (reference stills, gitignored folders).
- Skills: .claude/skills/sw5e-architecture (new), mixar failure-modes rows (computer use: "Mixar.exe", paste into the console, export naming).

## Not seen
Nothing of this was looked at in a browser. After the deploy, check: the gallery `?section=architecture`; a desert or temperate town with a round room
(cantina, medcenter); a forest settlement's backdrop; a Mon Calamari, Rodian, Zabrak and Nautolan NPC close up (eyes in the sockets, horns on the skull).

## Since (night, same branch): chin, hair, round rooms, square walls cut (REVIVAL_NOTES "Chin, hair, round rooms kept round, square rooms cut through")
- head/hair .glb re-exported from Mixar (`builtins.HEAD_EXPORT=True`), head diffuse and strand map rebuilt (tools/build-head-textures.mjs, build-hair-textures.mjs).
- Planner: corridors slide to keep round rooms round (1111 of 1476 round). tests/world/layouts.test.ts passes (4 of 4).
- Square rooms' openings cut through their walls (models.tsx cutShell, LocalMap `holes`). Never type-checked here: the finish script's tsc will tell.

## First finish run (2026-11-06 03:21) stopped on two tests; fixed
- tests/interiors/round.test.ts: a round room was joined straight to a plain room (the slide change let it); now a room joined to a plain room by a
  door of its own stays square, and a round room still cut off after the doors are laid is made square and joined again (joinStranded).
- tests/interiors/hair.test.ts: hair inside the test's ellipsoid (0.969 < 0.97); the hair is rooted on the real head now, which comes in to 0.94 of it,
  so the bound is 0.93. tsc passed on the PC. The user must run the finish script again; production is still the old main until it passes.

## The overhaul the user asked for (2026-11-06 04:34), and their answers (AskUserQuestion)
"I want the tree villages to REPLACE the standard square rooms on relevant planets ... round buildings, rooms, and gantries to REPLACE the VAST majority
of old square buildings (square buildings should be RARE) ... furniture ... to respect these new circular buildings (aisles of shelving in shops in the
centre of the rooms, and curved shelving matching the room radius around the edge) ... a FULL OVERHAUL of the way districts and rooms are procedurally
generated. Consider we may need a new suite of interior meshes/assets."
- Saved campaigns: RE-PLAN EVERYTHING (buildings already entered are rebuilt too; people, loot and furniture re-placed).
- Tree villages on forest AND jungle worlds, and on swamp worlds on stilts over the water; they replace the settlement's ordinary buildings.
- Square stays allowed only for hangars and warehouses, and slums and shanties.
- Delivered in playable stages: 1 generator (round buildings, tree/stilt villages, re-plan), 2 furniture that fits the curves, 3 curved interior models (Mixar).
  Each stage deployed with a finish script.

## Next, in order (the overhaul first)
1. The gantry form in the planner (round rooms now exist to hang it on): gantryPlan/rampPlan in interiors/architecture.ts, kit pieces in architecture.glb.
2. Heads for Ithorian (a sphere), Duros, Bith, Gran, Kel Dor, Quarren, Weequay, Cerean (tools/blender/build-species.py, SPECIES_EXPORT).
3. Look in a browser after the deploy: a square cantina's doorway (cut wall), a round medcenter, a close-up of a human face side-on, curly and messy hair.
