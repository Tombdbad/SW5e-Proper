# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-06 afternoon by a cloud session (no shell on the PC, no npm registry: the client is only syntax-checked here; the PC's tsc/npm test is the check).
Branch **`nov5-wiring`** on origin. main on the PC was fast-forwarded to the stage 1+2 build (c9745b3 + the two fixes 04dbeab, f3e8350); the user ran the finish
script (tests 687 pass, 0 fail) and was restarting production from an Administrator PowerShell (`deploy\windows-start.ps1 -Mode prod`; taskkill /F /PID if "access denied").
The user's own `client/src/components/ui/Alert.tsx` is modified on the PC: never commit it.

## Ship it
`powershell -ExecutionPolicy Bypass -File deploy\finish-2026-11-05.ps1` from the repo on `main` (it puts set-aside files back if it stops). Then restart prod as Administrator.

## The user's feedback on the first look (2026-11-06 15:26, with four screenshots) and what this session did
1. Bridges between rooms in a stilted settlement drew walls + ceiling from inside; gantries/catwalks/rooftops must stay open air. DONE: `openAir` true for an
   aloft corridor (shared/logic), RoomShell rails for it, ground height for it (LocalMap). Needs a look.
2. Stairwells: one large stairwell with a landing and ONE door on every floor, flights stacked, no entering a room to reach the next flight, fewer doors and no stair hall.
   DONE in the logic (stairBlock/linkColumns/placeBlock/roofStairs/audit rewritten, LIFE 20 migrates saved worlds); tests/world/access.test.ts rewritten and passing here.
   The client draws each flight/landing as before (rooms), so only a look is needed: landings are 2x2 corridor rooms, flights unchanged. See REVIVAL_NOTES "Stairwells, redone".
3. Tree villages as aesthetic backdrop were WRONG, and the trunk/cabin colour. DONE: TreeVillages removed (siteAssets, LocalMap, architecture.ts village layout, its test);
   canopy huts use a timber colour (LocalMap TIMBER). NOT DONE: the great-tree kit pieces as the real decks, gantries/catwalks round and between huts.
4. Round multi-floor buildings: exterior ramps, internal spiral stairs, wall segments that scale to room size, covered (tube) walkways drawn the same inside as out.
   NOT DONE (see below).

## Next, in order
1. Run the finish script, restart prod, LOOK: forest/jungle/swamp town (huts timber, bridge open from inside), any tower (stairwell landings), a roof with its door.
2. Round towers: `hostable` still excludes round rooms, so a round room has no upper floors. Plan: allow round hosts, join their floors by a spiral stair asset inside
   (a `stairs` asset like the mezzanine's, drawn as a helix) and by a ramp up the outside (kit ramps + gantry ring, needs gantryPlan in the planner: form "gantry", open air).
3. Drum walls for any radius: KitRoomBlock scales the r4 bays uniformly for 3.75-6 (thickness and doors scale too). Make bay count/tangent scale follow the radius, keep
   thickness and door size, drop the 3.75-6 limit.
4. Tube walkways: kit tube piece in the game; their interior shell must match (glazed ribs), not a plain corridor.
5. Ladders you can climb (character goes from the platform to the ground at once); tree decks from kit pieces; Mixar stage 3 (curved shelves, bar, tables, ring benches).
6. Heads: Ithorian, Duros, Bith, Gran, Kel Dor, Quarren, Weequay, Cerean.

## Notes for the next agent
- Logic tests run here with the global `tsx --test <file>` (not `node --import tsx`); tests/world/layouts.test.ts takes minutes. Client tests need `three` (not here).
- Logic type-check: scratchpad tsconfig on shared/logic/index.ts: only the old structuredClone lib error shows.
- Commits end with Co-Authored-By Claude Sonnet 5.5 and the Claude-Session line; identity Tombdbad / sjerps.nadine@gmail.com.
