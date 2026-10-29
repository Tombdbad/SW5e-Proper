# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-29 (Windows PC), branch `main`. Commits of that day: 867effa co-op, b7c47e2 shooter/nemesis/ammo, dc73724 notes; the work below is the commit after them. Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## Session 3 of 2026-10-29: the shooter's stuck defeat, walls, powers (REVIVAL_NOTES "Shooter: the stuck defeat ...")
The user: after dying and waking, the enemy did not attack or take damage and the doors did nothing; enemies stuck in walls after following into another room; do the "not done" list.
- Root cause of the stuck state: watch stayed "attacking" with no fight (autoFought spent, doors barred silently, Fight button only). Fixed in GameBoard (watch down to suspicious when left for dead,
  autoFought re-armed, shooter: no barred doors, weapons-out starts the fight, X starts one). Walls: `walk()` falsely reported steps (the real "stuck at a wall" bug), `unstick`, `route`/`chase` in
  shared/logic/shooter.ts; Follower (LocalMap) keyed by place + A* route. Added: crowd turns, crouch (C), powers on 1-4 (client/src/lib/sw5e/realtimePowers.ts), sounds (interiors/fx.ts), impacts, fall, foe sabers.
- Checked: `npm test` 467 pass / 3 skipped (DB tests); vite build to a scratch dir; browser (dev server PORT=5099 on sw5e_test, stopped again): e2e/shooter.mjs, shooter-extras.mjs, shooter-defeat.mjs (CROWD=1), followers.mjs.
- NOT done (all listed in the notes): class features/maneuvers in real time, companion/enemy casting, prone/sneak, road ambushes and the pit arena (turn-based), a co-op fight. The dist/ build and
  5000/5002/5057 do NOT have any of today's work. Fire sounds, saber swing and crouch were checked by state/screenshot, not by ear.
- Next: ask the user to try it on a fresh build (npm run build; restart), then the co-op fight, then real roles in the road minigame.

## Session 2 of 2026-10-29: CO-OP (REVIVAL_NOTES "Co-op"), uncommitted
The user: co-op for up to 4 on the local wi-fi; each walks the settlement alone or together; leaving the settlement/planet/system is the party's, through a "room"
(everyone presses Join, then picks ship(s) or speeder(s) and a role: pilot/gunner/...). DONE and checked:
- server/coop.ts (WebSocket /ws/coop, sessions by 4-letter code, live campaign + patches, per-member place, travel room state machine), shared/logic/coop.ts (pure: patches,
  room rules), client/src/lib/coop.ts (store `useCoop`, `saveShared`), components/Play/CoopUI.tsx (Co-op button/dialog, TravelRoomPanel), pages/CoopJoin.tsx (route /coop,
  Home links it), GameBoard (coopHere/coopPlace/coopCharacter, saveCampaign -> saveShared, travel()/flyShip() open a room, `craftsFor`, `openRoom`, launch effect), LocalMap `CoopPeers`.
- deploy/windows-start.ps1 `-Lan` (HOST=0.0.0.0 + private-network firewall rule + prints the wi-fi address). NOT run: it only parses. The server stays loopback-only without it.
- Tests: tests/world/coop.test.ts 13/13; tests/server/coop.test.ts 2/2 against the TEST db
  (`DATABASE_URL=<.../sw5e_test> node --import tsx --test --test-force-exit tests/server/coop.test.ts`; skipped on any other db); e2e/coop.mjs (two browsers) on a dev server
  (PORT=5099, sw5e_test): host, code, join, member list, the room on both screens, crew choice PASSED; the trip + arrival leg PASSED too (pilot drove the road trip, both ended at the far settlement, the room closed on both). The ship flow is covered only at protocol level (3rd server test, 3/3 pass). vite build to a scratch dir passes.
- NOT done / known gaps (all in the notes): gunner/passenger/co-pilot roles are recorded but do not act (the pilot's minigame is the trip; no shared real-time flight);
  fights are per member; no text chat; a journey whose pilot never arrives must be called off by hand ("Call it off"); other members' figures only when in the same room/area;
  the peers' figure was NOT looked at in a screenshot yet; ship flow (helm -> room -> aboard -> fly) has NOT been run in a browser (only the speeder flow and the protocol test).
- Needs the user's decision: (1) turning on `-Lan` (the game has no login, so anyone on that wi-fi can open it); (2) whether co-op members should get shared real-time seats later.
- Next: browser-check the ship flow (needs a ship berthed in the start settlement: seed `starships` in the campaign like e2e/coop.mjs seeds `vehicles`), look at CoopPeers,
  then the shooter's co-op fight (a fight everyone is in), then real roles in the road minigame (gunner aims, passenger rides).
- Process: dev server on 5099 (sw5e_test, started this session, Claude's: stop it with Stop-Process on its pid; it runs server code from before the last server edits).
  5000 (prod), 5002 (test copy), 5057 (the user's dev server) were not touched and do NOT have co-op or the shooter. No `dist/` rebuild was done.

## Session 1 of 2026-10-29: ammo on corpses, Nemeses, MODE SELECT and the real-time SHOOTER, uncommitted
(REVIVAL_NOTES "Ammunition on the fallen and Nemeses", "Modes and the real-time shooter")
- DONE: ammo drops, Nemeses (shared/logic/nemesis.ts, components/Play/NemesisPanel.tsx), mode select (tabletop vs shooter, `campaign.specialRules.mode`), a first shooter
  (blaster, grenades, saber, guard, enemy AI). Shooter files: shared/logic/shooter.ts, client interiors/Shooter.tsx, shoot.ts, ShooterHud.tsx, ViewRig.tsx, aim.ts, useCombat.ts
  (`realtime`), LocalMap.tsx (`ShooterLayer`), GameBoard.tsx (`startFight`, mode dialog), shared/schema.ts (`specialRules`). Tests: tests/combat (ammodrops 4, nemesis 13, shooter 19, shooterview 2);
  e2e/shooter.mjs and e2e/mode-tabletop.mjs on a separate dev server. `npm test` was 444/444 then (before co-op tests).
- NOT browser-tested: the Enemies tab, toasts, the alley hunt, mercy buttons. Shooter gaps (Force powers first) are in the notes.
- OPEN QUESTION for the user: can a real-time defeat be death? (now: left for dead, wakes with 1 HP, no death saves).
- scripts/NemesisMod.dll is a compiled RDR mod with no source; only its structure was read.

## Earlier (2026-10-26..28), condensed; details in REVIVAL_NOTES
- Speeder travel opens the road trip (legs, roadblocks, gunner seat swap); spoken dialogue from Ollama (server/dialogue.ts, needs gemma4:e2b on 127.0.0.1:11434);
  jumping/hook/jetpack outside fights; games (Sabacc, Pazaak, Dejarik), contracts, pit bets; skies and horizons. Test copy on 5002 (tailnet :10000) was built before most of it.

## Learned
- Bash heredocs/`node -e` mangle backticks, `${}` and apostrophes here: write patches with the scratchpad `patch.cjs` (blocks `@@@ FILE path`, `@@@ OLD`, `@@@ NEW`, `@@@ END`; CRLF-safe,
  exactly one match) and files with the Write tool. Python is not installed. `sleep` is blocked: wait with Monitor.
- A WebSocket test has two queues (one per socket): let each step in before the next (the test's `quiet()`), or "ready" and "seat" race.
- `<fog attach="fog">` inside a group attaches to the group: set `scene.fog`. A ShaderMaterial needs `#include <tonemapping_fragment>` and `<colorspace_fragment>`.
- The ride buttons in Play have testids `ride-<rideId>` (`ride-vehicle-<id>`); the old e2e text "Fly it yourself" no longer exists.
