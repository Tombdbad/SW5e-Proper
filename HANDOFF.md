# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-02 (Windows PC). Branch **`main`**. origin/main is at 1277668; the commits after it (5240b30 "no tabletop outside a fight", and this session's commit with this file) are local, NOT pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
Do not push, rebuild 5000 or merge without the user's go-ahead.

## Running
- The prod server on port 5000 runs build 1277668 (OLD: none of 5240b30 or this session), started BY HAND (`node dist/index.js`, NODE_ENV=production, loopback only) because `deploy/windows-start.ps1 -Mode prod` stopped at an old test server on 5002 (pid 9468) it could not kill (Access denied). LAN co-op is off until the user runs the script from an administrator window. Tailscale Serve reaches it.
- No dev server is running (the 5099 test one was stopped).

## 2026-11-02 (8): zero turns in the shooter, the jetpack with the clock, the item audit
The user: "There should be ZERO turn based mechanics in the shooter mode. Also fix the RPG mode jetpack implementation so it works with the game clock. There are also still game items that currently have no logic to support their intended function. Please conduct a deep audit and report". Full write-up: REVIVAL_NOTES "Shooter: no tabletop outside the fight" (the "No turns either" bullet) and "Items without logic: the audit"; two "Play rules" lines.
- Pit (shooter): `openPit` walks onto the Arena floor; bouts are real-time (`pitPending`, `startPitBout`, `fightAroundParty(enemies, false)`, `pitBout`); `PitArena realtime` is a banner. Fixed in both modes: the card's opponent is the one fought (`opponentOf`).
- Engage (shooter): the dogfight against the ships in orbit (`StartOptions.foes`, `Vessel.ref`, `ship.hull`; `spaceFight`, `finishSpaceFight`); both fights end through `settleShipFight`.
- Practice fight hidden in the shooter.
- Jetpack, both modes: `burnRate` removed; flight gear on slows the clock to real time (`flightOn`, `slow` in the tick; also runs in a real-time fight).
- Checked: tsc 0, npm test 556 + 3 skipped, vite build clean (scratch dir). Browser (test DB, campaign 625): pit loss, win, leave, opponent; clock 0 min/10 s with the pack on, 11 min/11 s off. NOT checked: Engage's dogfight in a browser, the tabletop pack (same code), phone, e2e.
- Test DB side effects: campaign 625 is at Rakessos Arena's pens on day 7; character 510 has a Chronometer, a Shocking Oscillator, +200 cr.

## TODO / next, in order
1. Ask the user: build and restart 5000 with all this; push.
2. Item gaps from the audit (the user has not chosen). Biggest: the shooter's fight has no item use (medpacs, stims, mines, charges and thermal detonators, teleporter, extinguisher); 776 enhanced items read no effect (regular wordings: proficiency steps, foci's +N, save DC +N); Tracker utility vest's carry; Rocketpack launcher; plain Focus generator.
3. `npm run e2e` against a build (not run).

## Learned
- Patch the test campaign from a NON-game page (`http://localhost:5099/`): leaving Play saves its own clock over a patched `timeElapsed`.
- In the shooter sim, a foe ends only when `dead` is set (setting `hp` 0 by hand is not enough): `window.__shooter.units`.
- The browser pane must be shown (`show_pane` preview) or the page runs about a frame a second. No python on this PC; use the Edit tool, not sed.

## Open questions for the user
- Which item gaps first? Should a real-time defeat ever be death (open since 2026-10-29)?
