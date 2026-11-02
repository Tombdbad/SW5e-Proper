# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-02 (Windows PC). Branch **`main`**. origin/main is at 1277668 (pushed this session at the user's request); the commit with this file is local, not pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
Do not push, rebuild 5000 or merge without the user's go-ahead.

## Running
- The prod server on port 5000 runs build 1277668, started BY HAND (`node dist/index.js`, NODE_ENV=production, loopback only, no HOST) because `deploy/windows-start.ps1 -Mode prod` stopped at an old test server on 5002 (pid 9468) it could not kill (Access denied: started from an administrator window). The auto-mode classifier refused HOST=0.0.0.0, so LAN co-op is off until the user runs the script from an administrator window. Tailscale Serve still reaches it (200).
- No dev server is running (the 5099 one was stopped).

## 2026-11-02 (7): no tabletop in the shooter outside a fight
The user: "ensure we do not have any bleed from the tabletop game into the FPS game (I have been getting a prompt to roll when landing from a jetpack, this is WRONG)". Full write-up: REVIVAL_NOTES "Shooter: no tabletop outside the fight" (and a "Play rules" line).
- Cause: the clock runs a minute a real second and a jetpack lasts 1 minute a cell, so it went out after a second; the fall asked for the tabletop burst check (check dialog + dice table).
- Done (shooter mode only): passive checks with no dialog (`askCheck`/`performCheck`, `passiveD20`); `useDice.passive` makes `rollOnTable` answer middle faces with no dice table; own silent rolls passive (`ownD20`, `checkFor`); downtime texts without d100 (`toldRoll`); falls: no burst check, Space in the air lights the pack (LocalMap airStep), average damage (`passiveDamage`); flight gear burns in real time (`burnRate`) and fits a carried power cell by itself (`switchOn`); sea beasts and road ambushes in real time on the map (`fightAroundParty`, `roadPending`).
- Tests: tests/combat/nodice.test.ts; npm test 555 pass + 3 skipped; tsc 0; build clean.
- Browser (dev 5099, test DB, campaign 625 shooter): a cell fitted by itself and the flight held; switched off at 16 ft: no dialog, no dice, 3 damage. NOT checked: Space in mid-fall, a sea beast or road ambush in real time, phone, e2e. The test character 510 now carries a Jetpack and power cells (test DB only).

## TODO / next, in order
1. Ask the user: build and restart 5000 with this; push.
2. Still turn-based in the shooter: the pit arena (PitArena + PlayCombat) and starship Engage (ShipCombatPanel). Each is its own piece of work; the user has not been asked.
3. Same one-second jetpack exists in the TABLETOP mode (left as it was): ask the user whether to burn flight gear in real time there too.
4. `npm run e2e` against a build (not run). Older items: see REVIVAL_NOTES.

## Learned
- The browser pane must be shown (`show_pane` preview) or the page runs about one frame a second; `window.__air()` shows the jump/flight state; holding Space = dispatch KeyboardEvent keydown/keyup with code "Space" on window.
- The jetpack's power toggle is behind Inventory > its row's "Use" button (`power-toggle`).
- No python on this PC; sed patterns with `\b` and `${...}` are fragile in Git Bash: use the Edit tool.

## Open questions for the user
- Should a real-time defeat ever be death (still open from 2026-10-29)? Should bonds between people change with play?
