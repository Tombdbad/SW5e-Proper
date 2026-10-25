# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-25 (third round), branch `main` (CLAUDE.md says `revive`; this PC works on `main`). Last commit: `7c67ce4`, pushed to `origin/main` at the user's request (it holds the dogfight arena and the earlier dogfight-related work: the new `shared/logic/dogfight*.ts`, `tunnel.ts`, `components/Map/dogfight/`, `DogfightLab.tsx`, `tests/ships/dogfight*`, the wood textures and the model changes). **Not committed: the user's own `client/src/components/ui/Alert.tsx` change** (left alone; still an open question whether it should go out).

## Done this round (the user's list; details in REVIVAL_NOTES "Dogfight, second round")
- Upgrades: the picked ship's sheet already had its mods and enhanced parts; the arena dropped some. Now in: weapon damage bonus (it was multiplied by 0), attack bonus, rerolled 1s and 2s, flares, feedback shields. The picker line and the countdown list the upgrades fitted. A ship with no shield is lent one (as before).
- Test button "unlimited hull and weapons": only in a `VITE_TEST_MENU=1` build (the 5002 test copy), so production never has it; no commenting out needed (see `TEST_TOOLS` in `DogfightGame.tsx`).
- A and D roll (real roll that eases to a stop about a quarter of a second after the key is let go, `ARENA.rollEase`, and holds; HUD indicator); the mouse and arrow keys turn the nose in the craft's frame; mouse steering is on by default. The lean into a yaw had the wrong sign: fixed.
- Throttle is a setting that holds: W/S and the wheel; HUD throttle bar + m/s; cockpit screen.
- Turrets: marked, targetable (Y / Part button, hidden ones are not targets), shot-out turrets are silent and look it (head blown off, burning wreck, muzzle glow before a shot).
- Tests: `tests/ships` 33 of 33 pass (new: upgrades, roll and lean, throttle, test tools, turrets). `e2e/play.mjs` dogfight step passes on a dev server (`ONLY=dogfight FORCE=0 BASE=http://127.0.0.1:5057 node e2e/play.mjs`). Looked at in a browser: HUD, roll, wheel and keys, test button, turret marks, the kill and the wreck.

## Running now
- Test copy rebuilt and restarted at the user's request (2026-10-25 17:15, `deploy/windows-start.ps1 -Mode test`, working tree snapshot, test flag so the dogfight test button is there): `http://127.0.0.1:5002/`, tailnet `https://desktop-dqdsn3q.tailb1e5d7.ts.net:10000` (pid 1444 at the time). It has the roll that eases to a stop and everything above.
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
- The game map's own 3D canvas throws "THREE.WebGLAttributes: ... Resizing buffer attributes is not supported" a few hundred times in the first seconds of the e2e (also on the older 5002 build); e2e steps that act right then must wait for the effect rather than sleep. Cause not looked for.
- `ONLY=<regex>` runs single e2e steps; `FORCE=0` skips the second character; `VITE_TEST_MENU=1 npx vite --port N` serves `/dev/dogfight` with the test button, `PORT=N npm run dev` is what the e2e needs.
