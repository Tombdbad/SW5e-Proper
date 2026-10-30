# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-30 (Windows PC), branch `main`. Last commit 17fc336 (sea crossings and water craft). Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## 2026-10-30, sixth batch (committed; REVIVAL_NOTES "Seats, gunners, the convoy, the rest of the water list")
The user asked: dome drop-off (yes, the house rule), the whole "not done" list of batch 5, seats for every speeder and water craft by its seat
count with characters drawn accurately in them, turrets/gunners that follow the operator's aim (yaw and pitch), and a new minigame "convoy":
the party pilots convoy vehicles and fires their turrets at attacking ships, with bot ships defending the convoy.
Done so far (uncommitted):
- Dome: shared/logic `domeOf`; GameBoard `travel` sets the party down in the first dome's way in when it arrives under the sea by anything
  but a submersible (toast says house rule).
- Seats: models.tsx `craftLayout` (seats per make, bench seats past the body's own, lent pintle gun), `CraftCrew`, `GunMount`, Figure `crew`
  prop, Mover crew mode (hips on the seat), limbs.ts `crewPose`. SpeederModel takes `seats`, `crew`, `aims`, `gunner`.
- Map: the party and followers who fit sit in the craft at the helm (LocalMap `aboard`, `crewOf`); co-op `pos` carries `r` (the craft,
  `rideKey`), PeerFigure draws the peer in it (server/coop.ts, lib/coop.ts, CoopUI).
- Race scene: real figures in the seats (FlightScene `riderOf`, RaceGame `crew`, `aimRefs`), Racer `gun`, RaceInput `pitch`.
Next: the user tries the convoy (Downtime > Convoy guard) and the water list; open: co-op seats in the convoy, the breath-in-seconds clock (see REVIVAL_NOTES).

## Running
- No dev server of mine is running. 5002 (test copy) is an OLD build; the user restarts it themselves (`deploy\windows-start.ps1 -Mode test -Lan`).

## Learned
- A heredoc with an apostrophe in it breaks the Bash tool's quoting: write patch scripts with the Write tool into the scratchpad.
- FlightScene.tsx is LF now (not CRLF).
- A "detail all" world takes about a minute to generate in a test: build a small world by hand (water.test.ts) when only a few areas matter.
