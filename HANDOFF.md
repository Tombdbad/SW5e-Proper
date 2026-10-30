# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-30 (Windows PC), branch `main`. Today's commits: 5f2761e co-op, 2b51591 walk/crouch/prone/kick/full screen, 29a5861 jointed figures, e4dd2ce caves/ceilings/vaults/round rooms/water worlds, and the commit after it (sea crossings and water craft). Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## 2026-10-30, fifth batch (REVIVAL_NOTES "Sea crossings and water craft"; Play rules "Over the water")
- Rides over the sea (shared/logic "Over the water": `waterwayOf`, `groundRides` `waterway`): every route on an ocean world is open sea; foot, beasts and land speeders blocked, water craft and a water taxi go, only flying lifts. Water craft blocked on dry worlds' roads; swamp worlds allow both.
- The crossing: `planTrip` `water` (all legs the planet's own, no roadblock), course `RaceScenery.sea` (flat, buoys, sea stacks), drawn as `Sea` in FlightScene; the craft drawn as its make (`look`). Lab: `/dev/dogfight?game=road&water&look=bongo&biome=ocean&chase`.
- In a place on the water (LocalMap `boats`, `afloatRef`, `wetAt`, `moor`; playState `afloat`; PartyVehicle `berth`; panel button "Take the helm"): moored craft on the water, steered at the helm (3x pace, out to 14 squares past the ground), moored by tapping the decking or a door. Submersible at the helm: no underwater hazard; arriving under the sea in one puts the party at its helm.
- Fixed in passing: trees and rocks stood in the open water of sea places (ambient pieces, cover and backdrop now left out on and under the sea); the scene memo in GameBoard now redraws on `playState.afloat`.
- Tests: tests/world/water.test.ts gained rides, crossing and sea-course tests (on a hand-made world: generating worlds to find one is far too slow).
- Checked in the browser (dev server 5099, test DB, campaign 443 Kamino): Monarrin (sea) rides, hydrospeeder moored/helm/steer/moor; the whole crossing to Catotine (5 legs, ambush run from); Catotine (under the sea) Aquadon helm, steer, moored by going in at the gate.

## Open question for the user
- Arriving under the sea without a submersible, the party holds its breath in the water and drowns in a game minute or two (the clock runs while the page loads). Proposed house rule: a water taxi or surface craft sets the party down inside the first dome. Not done; asked.

## Running
- Dev server on 5099 (sw5e_test) is Claude's: scratchpad `dev5099.cjs`; stop it (Stop-Process on the pid listening on 5099) when done.
- Old dev servers from 26/10 and 27/10 (tsx server/index.ts) and `node dist/index.js` from 23/10 are running on this PC; not started this session, left alone.
- 5002 (test copy) is an OLD build. The user restarts it in an administrator PowerShell: `powershell -ExecutionPolicy Bypass -File deploy\windows-start.ps1 -Mode test -Lan`.

## Next, in order
1. The user tries an ocean world on a new campaign (Kamino-like): crossing by water craft, helm in a place.
2. Not done: followers ride along in the craft (they swim after it); co-op peer at the helm drawn walking; the town overview map on an ocean world is sand; encounter beasts in the water; species' swimming speed (`swimPace` not wired); a submersible under the sea not seen in play.
3. Earlier: tune poses; real roles on ships; the co-op shooter fight; the followers-attack report; the wi-fi mystery (phone on 192.168.0.156:5002 fails, Tailscale works).

## Learned
- A "detail all" world takes about a minute to generate in a test: build a small world by hand (as roadtrip.test.ts `worldIn` and water.test.ts do) when only a few areas matter; `--test-name-pattern` runs the quick tests alone.
- Test campaign 443 on sw5e_test now has a hydrospeeder and an Aquadon at Catotine (Kamino); the character is in Catotine's Gate. `window.__street.water()` is the test hook for the helm.
- `sed -i` in Git Bash drops CRLF (FlightScene.tsx is CRLF): write patch scripts with the Write tool into the scratchpad (exactly-one-match `rep`) and run them with node.
- CRLF files: CaveRoom.tsx, aim.ts, FlightScene.tsx, CoopUI.tsx, ViewRig.tsx, stick.ts, Shooter.tsx, ModelGallery.tsx. LF: LocalMap.tsx, GameBoard.tsx, index.ts, roadtrip.ts, limbs.ts, siteAssets.tsx, models.tsx, GalaxyMap.tsx.
- The browser pane throttles when hidden: a road leg under autopilot takes ~1 min there.
- Vite HMR can hold a second module instance: reload the page when a change seems not to take.
