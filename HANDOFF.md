# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-21 ~10:30 UTC. Branch `revive`; HEAD is the commit that carries this file. `main` and the live service (5000) are at `87304f8`: nothing was merged, built for or restarted on 5000. 5002 was rebuilt from this commit (`sh deploy/test-plain.sh`, has the test menu) and is on the tailnet at https://sw5e.tailb1e5d7.ts.net:10000 (`tailscale serve --https=10000`). 5001 still runs an old build.

## The task (user, 2026-10-21, a list of fixes; "DO NOT run end to end tests, run relevant modular tests")
Vendor stock into the menu (tabs, the menu was cluttered); weapons held back to front; shelving facing the wall; an on-screen compass; the on-screen stick slow and wrong-way, 10% smaller; a URL for 5002; a god-mode test menu.

## Done (all committed; details in REVIVAL_NOTES "HUD tabs, compass, stick, facing, test menu")
- HUD tabs and the Trade tab (GameBoard.tsx), compass (Map/Compass.tsx), stick (stick.ts, ViewRig.tsx, LocalMap stepToward -> stickWalk), codeTurn for code-built furniture and Stock, 18 blasters turned (tools/turn-models.mjs), TestMenu.tsx, deploy/test-plain.sh builds with VITE_TEST_MENU=1.
- Module tests: `npm run test:interiors` 129 pass (new: stick, compass, packs codeTurn, assets blaster turn), `npm run test:items` 83 pass. `tsc` has no new errors in touched files (baseline 363 legacy).

## NOT verified in a browser (no browser was opened; the user asked for none)
- Everything visual: tabs layout, the Trade tab, the compass dial, the stick feel and its size, shelves on every wall, held blasters (rifle pose points across the body, `poses.rifle` in models.tsx: left hand only a little ahead of the right; check it looks like a rifle held forward), the Test tab.
- The stick cause (pad touches leaking to the map as taps) is read from the R3F event code, not observed.
- e2e scripts still click tabs by role name and read dealer panels from `[data-testid=map-card], [data-testid=hud-trade]`; the next full e2e may need other tab clicks (Location content is in "Here", the default; Quests was the default tab before).

## Next / open
- The user tests on 5002, then says what to fix; deploy to 5000 only on their go-ahead (check `journalctl -u sw5e --since "15 minutes ago"` for saves first).
- ITEM_TODO.md list remains (weapon animation, thrown projectiles, mods shown on weapons, ...).

## Things learned
- `tools/_orient.mjs`-style scripts must live in the repo to resolve `@gltf-transform`. Blender can import the converted blasters but not the item-catalogue glbs (custom `_MARK` attribute: KeyError 5121). Render previews with the `blender-sw5e` skill (a red ball at +z marks the barrel end).
- `tailscale serve --https=` ports allowed: 443 (live), 8443 (5001), 10000 (5002).
- Standing rules: no worktrees; one CPU, one browser run at a time; asset budget 24 MB; commits via `git -c user.name=Tombdbad -c user.email=<account email>` + trailer.
