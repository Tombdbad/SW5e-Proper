# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-21 ~01:25 UTC. Branch `revive`, HEAD is the commit that carries this file (pushed). `main` and the live service (5000) are at `87304f8` (stairs, towers, roof stairs, windows, balconies; restarted 2026-10-20 23:05 UTC). Live campaign: 145.

## CURRENT TASK (user, 2026-10-21 ~00:00 UTC, "dont ask question, just carry on ... GO!")
Work through ALL of `ITEM_TODO.md`: every item must do what the SW5e rules say. Specifics from the user:
- Ship upgrade parts sold at junkyards/scrap dealers (low rarity only, relevant territories/settlements); rarer ones at ship mechanics / spaceport-complex vendors in richer areas.
- Droid vendors in a SHOP (not a market stall) with real model assets on display: full droids AND droid upgrade parts.
- Variety of ways to get work done: pay a mechanic, or assign a party member to do the upgrade, etc. My judgment on the rest.
- Modular tests per step; when the list is done and all module tests pass, run the full e2e.
GO covers `revive` and the test copies only: ask before any merge/restart of live 5000.

## Item logic progress
- [x] A. Ship upgrades (28bb931 rules, def9090 play; `shared/logic/shipyard.ts`; `components/Play/ShipWorks.tsx`): SotG modifications, equipment, enhanced ship parts; scrap dealers/junkyards sell salvage (grade <= 1) where a port is and the region is not rich; shipyards sell up to a grade set by wealth; install by yard (fee) or crew (half cost, workforce, Int (mechanic's kit), hired hands 20 cr/day).
- [x] B. Droid shop (def9090): droid dealer a shop in every city, droids on plinths, parts shelves, buy and fit.
- [x] C. Every equipment row classified (`gearUse`/`gearRole`, gear.ts, derived `gear.json`).
- [x] D. Ammunition in fights (loads, reload, riders, burst/rapid, zones, calibrators).
- [x] E. Food and water (passDays, lifestyle, camp gear rests).
- [x] F. Hazards (e40c73e): hazardsAt, exposure hourly, air timers, deadly-entry refusal, suits worn, lights/generators, darkness in fights.
- [x] G. Encumbrance (e40c73e): load line, variant toggle, fight speed, over-capacity travel refused.
- [ ] H. 1304f36: enhanced consumables (`enhancedConsumableUse`), graded heal dice/spice, calibrators, shock gloves, stealth field, repulsor/friction gear, flight in fights. LEFT: holster/draw, extinguisher in fights, mines + detonator, grapple to balconies/roofs (user: grapple hooks are how balconies are reached), propulsion pack in water, mirror/chronometer/shovel/mess kit/hydrospanner, data/comms (datapad, holorecorder, code cylinder, translator, scrambler, holotrace), contraband searches vs smugglepack/clandestine pockets, catalyzer/teleporter.
- [ ] I. Cybernetics/prostheses vendors, item mods bought/installed, vendor/loot holders.
- [ ] J. Visual items (time-boxed): halo, off_hand, slots, garments, droid parts on droids.
- [ ] K. Module tests, `e2e/works.mjs` + `e2e/stairs.mjs`, then full e2e on 5002 (user unit, idle VM). Report; ask before live.
- Also: regenerate `ITEM_TODO.md` (`npm run audit:items`, CURATED in `tools/item-audit.ts`), REVIVAL_NOTES "Play rules" bullets for C-H house rules.

## Tests
- `npm run test:items` (tests/items/*.test.ts, ~2 min): 35/35 pass on 1304f36.
- `e2e/works.mjs` (BASE=http://127.0.0.1:5002, ONLY=ships|droids): PASS on e40c73e build.
- 5002 (`sw5e-plain`, DB `sw5e_test`) built from e40c73e; 5001 not rebuilt.

## Standing rules from the user
- Speeder race is opt-in (`RACE=1`). No worktrees. One CPU: e2e one at a time, no build/tsc/tsx during a browser run.
- Asset budget 24 MB. Commits: `git -c user.name=Tombdbad -c user.email=<account email> commit` + Co-Authored-By trailer.
- No 2D maps; everything tapped on the 3D map. No DB migrations for this task (state in playState JSON).

## Things learned
- `npm test` takes >10 min (layouts); use the per-folder scripts (`test:items`, `test:interiors`).
- The page re-saves its clock: change a campaign's `timeElapsed` only after navigating the page to about:blank.
- Tapping a moving NPC can hit furniture; works.mjs falls back to `window.__play.pick`.
- A waiter `until ! pgrep -f "X"` matches its own command line and never ends: use a pid instead.
- Full e2e: `sh deploy/test-plain.sh`, then `systemd-run --user --unit sw5e-e2e-full --working-directory=$HOME/SW5e-Proper env BASE=http://127.0.0.1:5002 OUT=e2e/out/full3 node e2e/play.mjs` (~50 min; race skipped).
- Never `pkill -f` a pattern in your own command line. `bash deploy/backup.sh`, not `sh`.
