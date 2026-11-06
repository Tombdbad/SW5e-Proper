# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-06 (late) by a PC session. Branch **`stairwell`** (from main 86fa040); the user's own `client/src/components/ui/Alert.tsx` is modified: never commit it.

## State of main / production
- `nov5-wiring` is merged into `main` and pushed (86fa040: the finish run passed tsc, 697 tests and the scratch build after the juvenile-rancor fix, floor 0.15 in beastMetres).
- The finish script's last step FAILED: `windows-start.ps1 -Mode prod` could not stop the node on port 5000 (PID 2548/13396, "Access is denied": it runs elevated).
  So **production is still the old build**. The user must restart it as Administrator (`deploy\windows-start.ps1 -Mode prod`), then it serves main.

## This session, on `stairwell` (not merged yet; see `git log`)
The user's 2026-11-06 stairwell feedback (screenshot of a round tower on Kashyyyk): a tree's foliage drawn inside the stairwell; doors between each landing
and flight; the stairwell not matching the settlement (should be wooden and rustic). Done (REVIVAL_NOTES "Stairwells without doors, in wood"):
1. Seams: `RoomAsset.seam` on the doorways between a landing and its flights (stairBlock doors whose key is not `floor<n>`, and roofStairs' up/mid). No frame, no
   wall, no rail on a side that is only seams (LocalMap RoomShell `seamed`); walking onto one goes on into the next part (the walk loop, `onAct go`), so a tap
   on the head of a flight climbs it and the next landing in one go (checked in the browser: Gantry floor 1 -> flight -> Roof landing). Their paths are labelled
   "Stairwell". LIFE 22 `markSeams` marks saved stairwells.
2. Wood: in a tree or timber village the open-air stairwell is planks on log stringers, log rails (RUSTIC colours; Switchback `rustic`, SlopedRail/Balustrade
   `color`), posts of logs; steel stays elsewhere. Not made in Mixar: plain boxes were enough; a kit piece would be the next step if the user wants carved detail.
3. Trees: hut great trees take the corner farthest from the stairwell/bridges/neighbours and no more crown than there is room (architecture.ts `treeCorner`,
   GreatTree `clear`, FOLIAGE_REACH 7); ambient trees keep 5 squares off a stairwell (LocalMap `clear`). A small blot of foliage may still touch the lowest flight
   seen from above in campaign seed 23: not tracked down (which tree it is).
4. Bug found and fixed: a tap on a tree-village deck or bridge always landed on the middle row (the turned tap plane's local z is 0): now a box.
Tests: access.test.ts (seams, life 22), architecture.test.ts (treeCorner). tsc clean. Full `npm test` was running at the time of writing.

## Next, in order
1. If the full test run passed: commit, merge `stairwell` into main (ff), push, then the user restarts prod as Administrator.
2. The user's list still open: gantry rings round round rooms (gantryPlan is radius 4 only); kit ramp/bridge/pylon/tier pieces as real pieces; Mixar stage 3
   curved furniture; heads for Ithorian, Duros, Bith, Gran, Kel Dor, Quarren, Weequay, Cerean; water-craft helm mount animation; saved buildings keep old columns.
3. Browser checks not yet done: drum walls at several radii, tube walkway from outside and inside, mount/climb animations, beast sizes against riders (dewback
   may be under 1.8 m: raise MAX_SPAN.large), inside spiral stair on a station.

## Learned
- Dev server for the browser pane: `.claude/launch.json` "dev-5001" (untracked); make a campaign with scratchpad scripts through POST /api/world/generate and /api/campaigns
  (seed 23 has a round tower with floors in a Kashyyyk cantina; start at area "Gantry, floor 1").
- `window.__map3d.at("sq:X,Y")` gives page coordinates of a grid square, `.world(key)` its world position (world = grid - (32, 36) in that world), `.look(from, to)`
  poses the camera (call it twice, the rig resets it once). The page's `__street().party` is the party's square; `__street.act({type:"go",areaId})` moves it.
- The overhead camera in a tiny room looks at the room's neighbours; look from the north (z more negative) to see a stairwell.
- No python on the PC: use sed/node for scripted edits.
