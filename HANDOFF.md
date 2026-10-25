# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-25 (third round), branch `main` (CLAUDE.md says `revive`; this PC works on `main`). Last commits: the test menu categories (on top of `8de16cf`), `8de16cf` the black-screen fix, `7c67ce4` (the dogfight arena and the earlier dogfight-related work: `shared/logic/dogfight*.ts`, `tunnel.ts`, `components/Map/dogfight/`, `DogfightLab.tsx`, `tests/ships/dogfight*`, the wood textures and the model changes) and the black-screen fix on top of it (see "Learned"), both pushed to `origin/main` at the user's request. **Not committed: the user's own `client/src/components/ui/Alert.tsx` change** (left alone; still an open question whether it should go out).

## Done after the push (committed, pushed and rebuilt into the 5002 test copy at the user's request)
- Test menu "Give items" (`Play/TestMenu.tsx`, `testMenu()` in `GameBoard.tsx`): the old quick buttons (blaster pistol, rifle, ..., "Every weapon") are gone. Now 13 category tabs: Weapons, Weapon upgrades, Armour, Armour upgrades, Misc gear, Ships, Ship upgrades, Speeders, Speeder upgrades, Droids, Droid upgrades, Prosthetics/cybernetics, Beasts; each has a name filter and a dropdown of every item of that kind in the rules data (255 / 367 / 44 / 162 / 1482 / 36 / 345 / 3 / 0 / 44 / 48 / 56 / 114). Items are carried by name; a ship is fitted by the book's role table (`roleShip` in `shared/logic/index.ts`, tested in `tests/ships/dogfight.test.ts`) and stands at the berth; ship upgrades go to the hold as ship parts (`playState.shipParts`); a speeder is parked; a droid or beast joins the party (limit of four holds). Speeder upgrades are empty on purpose: the books list none (note shown). Checked in a browser against a dev server on the `sw5e_test` database (every category gave what it should; saved state read back; reload shows it); `tests/ships` 34/34.
- Where each upgrade went (my choice, say if wrong): weapon mods and weapon chassis in Weapon upgrades; armor mods and armor/shield chassis in Armour upgrades; clothing, wristpad, focus-generator and augment mods and their chassis, consumables, gear and focus items in Misc gear.

## Done this round (the user's list; details in REVIVAL_NOTES "Dogfight, second round")
- Upgrades: the picked ship's sheet already had its mods and enhanced parts; the arena dropped some. Now in: weapon damage bonus (it was multiplied by 0), attack bonus, rerolled 1s and 2s, flares, feedback shields. The picker line and the countdown list the upgrades fitted. A ship with no shield is lent one (as before).
- Test button "unlimited hull and weapons": only in a `VITE_TEST_MENU=1` build (the 5002 test copy), so production never has it; no commenting out needed (see `TEST_TOOLS` in `DogfightGame.tsx`).
- A and D roll (real roll that eases to a stop about a quarter of a second after the key is let go, `ARENA.rollEase`, and holds; HUD indicator); the mouse and arrow keys turn the nose in the craft's frame; mouse steering is on by default. The lean into a yaw had the wrong sign: fixed.
- Throttle is a setting that holds: W/S and the wheel; HUD throttle bar + m/s; cockpit screen.
- Turrets: marked, targetable (Y / Part button, hidden ones are not targets), shot-out turrets are silent and look it (head blown off, burning wreck, muzzle glow before a shot).
- Tests: `tests/ships` 33 of 33 pass (new: upgrades, roll and lean, throttle, test tools, turrets). `e2e/play.mjs` dogfight step passes on a dev server (`ONLY=dogfight FORCE=0 BASE=http://127.0.0.1:5057 node e2e/play.mjs`). Looked at in a browser: HUD, roll, wheel and keys, test button, turret marks, the kill and the wreck.

## Running now
- Test copy rebuilt and restarted at the user's request (2026-10-25 17:15, `deploy/windows-start.ps1 -Mode test`, working tree snapshot, test flag so the dogfight test button is there): `http://127.0.0.1:5002/`, tailnet `https://desktop-dqdsn3q.tailb1e5d7.ts.net:10000` (pid 1444 at the time). It has the roll that eases to a stop and everything above.
- The black-screen fix (commit `8de16cf`, pushed; see "Learned" and REVIVAL_NOTES "Dogfight black screen") was rebuilt into the 5002 test copy at the user's request (2026-10-25 ~20:15, `deploy/windows-start.ps1 -Mode test`; pid 6632 afterwards). The test menu above was rebuilt into it right after (see the pid with `Get-NetTCPConnection -LocalPort 5002`).
- Production (5000, pid 10664, started 10-23) is NOT rebuilt: it does not have the dogfight arena. Promote with `deploy/windows-start.ps1 -Mode prod` when the user says so.
- My private servers on 5056 and 5057 are shut down.

## Not verified
- The feel: roll rate (turn rate x 1.4, a Small fighter does a full roll in about 2.4 s), mouse reach, throttle rate and wheel step are guesses to tune by playing.
- Roll on a phone: there is no roll control on touch (the pad is yaw and pitch only).
- The cockpit on a real phone or GPU (software rendering only so far).
- The full `npm test` (only `tests/ships` was run; the full run sticks in long interiors tests).

## Next (in order)
1. The user plays it on the test copy (mouse, wheel, A/D, a capital ship's turrets with Y) and says what to tune.
2. Decide about committing (top).
3. Not done: the picked ship's hull is not worn down by the fight (`ship.hull` ignored); the delivery run flies the first ship; no crew actions in the arena; a roll button for touch.

## Open questions for the user
- Earlier ones still open: the lent deflector (3/4 hull) as the shield they meant, W/S in the speeder race, the `Alert.tsx` change, `revive` vs `main`.

## Learned
- Long heredocs in the Bash tool sometimes fail with "unexpected EOF while looking for matching quote": write the script with the Write tool and run it, or use the Edit tool. Source files are mixed CRLF/LF (scripted edits: use `scratchpad/edit.cjs`-style matching that tries both, or the Edit tool).
- A distance sort of a pair of turrets flips with every step; anything that cycles through parts must use a stable order.
- The "THREE.WebGLAttributes: ... Resizing buffer attributes is not supported" flood was the map's `Motes` (a `<points>` whose count changed); fixed (keyed by count), and because R3F runs every canvas from one loop it had also starved the dogfight canvas (black scene, HUD alive). The arena now has its own guarded loop and rebuilds itself after a lost context. The race and the delivery run still use the shared loop.
- `ONLY=<regex>` runs single e2e steps; `FORCE=0` skips the second character; `VITE_TEST_MENU=1 npx vite --port N` serves `/dev/dogfight` with the test button, `PORT=N npm run dev` is what the e2e needs.
- To try the test menu (or anything needing the test build) without touching the real `sw5e` database: start `npm run dev` with `DATABASE_URL` = the `.env` URL with `/sw5e` changed to `/sw5e_test` (rewrite it in a small script; never print it), `VITE_TEST_MENU=1` and `PORT=5057`; delete the characters and campaigns a check makes (`DELETE /api/campaigns/:id`, `/api/characters/:id` answer 204).
- `equipment.json` lists the bo-rifle and the saberstaff twice (same row): lists keyed by name must drop duplicates or React keeps stale options.
