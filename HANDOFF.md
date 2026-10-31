# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-31 (Windows PC). Branch **`main`** (the checkout is on main). Nothing is pushed: main is ahead of origin/main by 29 commits plus the notes commit after this.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-10-31: Babylon.js draws the 3D map, now on main (REVIVAL_NOTES "Babylon draws the 3D map" has it all)
- R3F builds the scenes; `client/src/components/Map/babylon.ts` is the renderer (`<Canvas gl={babylonGl}>`), mirroring each three scene into Babylon every frame. The user's "not done yet" list is worked through (shader ports, posed shadows, cheaper cascades, sky reflections, bloom, SSAO, clustered street lamps, the dice table in the app, e2e).
- e2e compared with three.js on the same test, desktop and phone view: Babylon fails only steps three.js fails too (cantina people, trade, speeders, road trip; phone adds the map trail's Galaxy click and the dogfight's right click).
- The user said "Merge and rebuild": main fast-forwarded to `babylon` (4c3a8d8; no merge commit), `npm run build`, migrations (none pending), and the server on 5000 restarted as `deploy/windows-start.ps1 -Mode prod` does (hidden, logs in %LOCALAPPDATA%\sw5e\logs\prod.*.log; the old server's log kept as prod.out.2026-10-23.log). Checked on 5000: gallery drawn by Babylon, home page lists, no console errors. Tailscale Serve still sends 443 to 5000.
- The `babylon` branch is left in place (fully merged).

## Running
- 5000: the user's server, `node dist/index.js` built from main at 4c3a8d8 (Babylon), pid at restart 14012. To restart after a build: `deploy/windows-start.ps1 -Mode prod` (also opens the browser).
- 5098, 5097, 5099 stopped; `.babylon-dist/` and `.main-wt/` deleted (and their lines in .git/info/exclude).
- Not ours, left alone: tsx dev servers on 3000 and 5057.
- The browser pane counts as automated (dice: set `useDice.setState({table})` directly). Night in the game: the HUD's "Until evening" then "Wait 1 h".

## TODO / next, in order
1. The user checks on their phone (lite and full) over Tailscale.
2. Push main (and babylon) to origin only when the user asks.
3. Older e2e failures (also with three.js): cantina people not moving in 20 s, speeders "did not travel", road-trip guards not chasing.
4. Fat lines (drei Line) with their width.
5. The real database (`sw5e`) holds e2e leftovers (7 "Gear mvo…" fighters and "E2E gear …" campaigns from an earlier run against 5000): ask the user before deleting.

## Open questions for the user
- Push to GitHub?
- (Earlier, still open) every daytime theft to ring at once (security tags)? Piper voices sorted by low/high?
