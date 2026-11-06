# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-06 evening by a cloud session (no shell on the PC, no npm registry: the client is only syntax-checked here; the PC's tsc/npm test is the check).
Branch **`nov5-wiring`** on origin (last pushed b858653: stairwells with landings, open bridges, tree villages not backdrop). This session's work since is
UNCOMMITTED until the next commit lands; see `git log` for it. The user's own `client/src/components/ui/Alert.tsx` is modified on the PC: never commit it.

## Ship it
`powershell -ExecutionPolicy Bypass -File deploy\finish-2026-11-05.ps1` from the repo on `main` (it puts set-aside files back if it stops). Then restart prod as Administrator.

## The user's "not done" list (2026-11-06 16:07) and where each stands
1. Round multi-floor buildings: DONE in logic (round rooms host columns; floors are drums of the host's shape). Outside: an open-air stairwell (gantry landings,
   switchback ramps, tag "open-air"/layout.open, rails that climb: LocalMap SlopedRail). Bad air or station: a spiral stair up the middle (paths `spiral`,
   assets "Spiral stair up/down", LocalMap SpiralStair/SpiralWell). REVIVAL_NOTES "Round towers". New buildings only (saved ones keep their columns).
2. Drum walls any radius: DONE (architecture.ts baysFor/bayFit, models.tsx KitRoomBlock: bays stretched across, moved out; wall/doors not scaled; r >= 2.5).
3. Tube walkways: DONE (linkLevels "Covered walkway" tag tube, layout.tube, not openAir; models.tsx TubeWalk drawn inside and out; LIFE 21 converts saved ones).
4. Great-tree decks, catwalks/gantries: DONE (planDistrict: a "Deck" balcony off ground huts, "Rope bridge to X" walkways between huts of two buildings;
   siteAssets GreatTree at a hut's corner, CanopyPlatform; RoomShell `canopy` draws decks/bridges the same from on them). LIFE 21 replans tree villages.
5. Ladders: DONE (verticalMove for canopy huts, transit `off`, limbs Motion.climb pose). 6. Mount/dismount: DONE (limbs mountPose/mountPlace, LocalMap
   MOUNT_MS; strollers too; water craft helm not animated). 7. Beasts to scale: DONE (models.tsx BEAST_METRES/beastScale; seatFor/figureTop follow).

## Tests here
All logic tests that can run here pass (access, round, climbing, stairs, security, expand, ...); layouts and a last re-run were still going at commit.
Interior/combat/items tests needing three/zustand/express/sharp and voice (Piper) only run on the PC. New PC-only tests: body.test.ts (climb, mount,
beast scale), architecture.test.ts (drum fit).
tests/interiors/architecture.test.ts needs `three` (PC only): it has a new drum-fit test.

## Notes for the next agent
- Logic tests run here with the global `tsx --test <file>`; layouts.test.ts takes ~10 minutes. Logic type-check: scratchpad tsc2.json (only structuredClone error).
- Commits: identity Tombdbad / sjerps.nadine@gmail.com, end with the Co-Authored-By and Claude-Session lines.
- Nothing here has been looked at in a browser: every visual change needs the user's look after the finish script.
