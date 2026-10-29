# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-30 (Windows PC), branch `main`, last commit e55d59a. EVERYTHING BELOW IS UNCOMMITTED (the user has not asked to commit yet). Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## 2026-10-30: the first real co-op play on two devices (REVIVAL_NOTES "Co-op, the first real play")
The user played co-op over Tailscale (pixel phone + this PC) and reported: wi-fi address fails; lag; jump not seen; an NPC job-giver followed both players; a beast not seen on the other screen;
speeder hit box; the gunner got a menu and could cancel and be left behind; roadblocks with no guards. DONE in the working tree:
- Co-op dialog says the wi-fi needs `-Lan` and shows each address in its own box; firewall rule in windows-start.ps1 is now "local subnet, any profile". The phone on wi-fi still gets
  ERR_TOO_MANY_RETRIES on http://192.168.0.156:5002 (cause NOT found; Tailscale works and is a direct LAN path). Suggest: phone's Tailscale off + same URL; router client isolation.
- Position stream 12/s with height (jump/flight seen); peers' companions/beasts drawn (`pets` message, `PeerPets`); the encounter stranger follows ONE member (`leader` in LocalMap);
  parked speeders block three squares.
- Gunner seat is real on speeders: `RoadRide` + `lib/roadBus.ts` (the pilot streams the road race; the gunner aims/fires back via `gun`); a gunner and gun are drawn on the speeder; riders cannot cancel
  a journey under way. Ships' co-pilot/navigator/engineer/gunner in a starship fight are NOT done.
- Roadblock guards fire at a crashing speeder; on 55% of blocks they board speeders kept at the roadside and chase (`shared/logic/index.ts` `blockGuards`, `Racer.idle`).
- Checked: `npm test` 469 pass/3 skipped; tests/server/coop.test.ts 3/3 on sw5e_test; browser e2e/coop.mjs, coop-followers.mjs, followers.mjs, roadblock.mjs (dev server PORT=5099 on sw5e_test).
- NOT checked: two real phones; the encounter stranger across two screens; the 3D look of guards beyond one screenshot (e2e/out/roadblock-look.png).
- 5002 (test copy) was last built BEFORE all of this. The user restarts it themselves with an administrator PowerShell:
  `powershell -ExecutionPolicy Bypass -File deploy\windows-start.ps1 -Mode test -Lan` (my own run with -Lan was refused by the permission check; without -Lan it would turn the wi-fi off again).
- Process: dev server on 5099 (sw5e_test) is Claude's; stop it (Stop-Process on the pid listening on 5099) when done.

## Next, in order
1. The user tries 5002 on two devices (gunner on the road, guards, followers, jump). 2. Real roles on SHIPS (a gunner in a starship fight). 3. The co-op shooter fight (a fight everyone is in).
4. The wi-fi mystery if the user needs non-Tailscale friends. 5. Open questions: can a real-time defeat be death?; road ambushes and the pit arena are still turn-based.

## Earlier today (2026-10-29), condensed: see REVIVAL_NOTES
- Commits 867effa co-op, b7c47e2 shooter/nemesis/ammo, dc73724 notes, e55d59a shooter fixes (stuck defeat, walls, powers, crouch, sounds). Co-op server/client/rules in server/coop.ts, shared/logic/coop.ts,
  client/src/lib/coop.ts, components/Play/CoopUI.tsx, pages/CoopJoin.tsx.

## Learned
- Bash heredocs/`node -e` mangle backticks, `${}` and `\r\n` here: write patch scripts with the Write tool into the scratchpad (see `fs2.cjs`: CRLF-aware `rep`, exactly one match) and run them with node.
  FlightScene.tsx and CoopUI.tsx are CRLF files. Python is not installed. `sleep` is blocked: wait with an until-loop.
- A WebSocket test has two queues (one per socket): let each step in before the next (the test's `quiet()`).
- Vite HMR makes `import("/src/...")` from a test script return a second module instance: restart the dev server before a run.
- Dev server on the test DB: scratchpad `dev5099.cjs` (reads .env, swaps /sw5e for /sw5e_test, spawns `npx tsx server/index.ts` with PORT=5099 VITE_TEST_MENU=1).
- Companions are the character's (`companionData`), not the campaign's: other screens only know them through `pets`.
