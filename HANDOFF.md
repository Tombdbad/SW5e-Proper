# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-21 ~08:20 UTC. Branch `revive`; HEAD is the commit that carries this file. `main` and the live service (5000) are at `87304f8` (restarted 2026-10-20 23:05 UTC). Live campaign: 145. Nothing was built, restarted or deployed this session; 5001 and 5002 still run old builds (5002 from e40c73e).

## The task (user, 2026-10-21 ~00:00 UTC, "dont ask question, just carry on ... GO!"; again at ~06:50: "continue with unfinished changes ... ONLY run modular tests, not the full e2e")
Work through ALL of `ITEM_TODO.md`: every item does what the SW5e rules say. GO covers `revive` and the test copies only: ask before any merge/restart of live 5000. The user asked that only the module tests be run: NO browser was opened this session (no e2e, no gallery screenshots).

## Done (all committed; module tests pass)
- A ship upgrades, B droid shop, C classification, D ammunition, E food and water, F hazards, G encumbrance: earlier sessions (see REVIVAL_NOTES "Gear in play").
- H (this session: 21dbc94, 74970bc, bd7676d): the law's search of contraband; holster and weapon draws; fire extinguisher cone; mines (arm, trip, remote detonator, picked up after); propulsion pack and water speed; mirror, chronometer, shovel, hydrospanner = mechanic's kit, mess kit = chef's kit; notes (datapad/stylus), holorecorder, code cylinder, holotrace, translator/vocoder (haggling), scrambler; machinist's catalyzer; portable teleporter.
- I (dd6e4cd): surgeons sell prostheses and augmentations, technicians sell and fit modifications for a fee, chassis blueprints, instruments and cybernetics in caches, holders for parts bins, produce bins, tool racks, curio shelves, plinths and part stands.
- J (a0345c2, 282b914): saber halo, off_hand second hand, head/neck/chest/finger gear fitted to the skull and build, gloves, boots, bandolier, suits drawn (space, diving, hazard), fitted prostheses drawn, droid customizations drawn on droids.
- L (32d27be, extra, not in the old plan): armour and shield properties in play (speed, stealth, absorb, regulated, rigid, reactive, avoidant, insulated, imbalanced).
- Graded plain gear and blueprint items (binders, camtonos, clandestine clothes, jetpacks ... read as their plain item; a blueprint is learned in an hour): last commit.
- K (partly): `ITEM_TODO.md` regenerated from rewritten notes (`tools/item-audit.ts` CURATED); REVIVAL_NOTES "Gear in play" has the house rules of H, I, J, L.

## NOT done / not verified
- Nothing visual was seen in a browser: halo, off_hand hand placement, head/torso/neck fits, suits, gloves, boots, droid modules, bins and racks stock, the new panels (surgeon list, mod shop, notes, translator, hands/mines row in the fight panel). Do a look with `e2e/interiors.mjs` (Vite dev server; `/dev/models?section=gear|items|interiors`) and one run of `e2e/works.mjs` (BASE=http://127.0.0.1:5002) before trusting them. The user wants the full e2e (`sh deploy/test-plain.sh`, then the unit in "Things learned") only when they say so.
- `tests/world/layouts.test.ts` and the other `tests/world/*` were started as the user unit `sw5e-worldtests` (script in the session scratchpad; result below if it finished). The Dance floor got `L:stage` (a new cache), which changes new worlds' layouts.
- Left in ITEM_TODO (the list is the truth): weapon animation, thrown-weapon projectiles, weapon mods shown on the weapon, named armour tint, shield actives, mines drawn on the map, a game scene for gaming sets and instruments, chandler shop, item viewer, enhanced rows with a rule of their own (47 gear, 18 weapons, ...).

## Tests (run on this commit)
- `npm run test:items`: all pass (80 tests before the last two additions; run again). `npm run test:interiors`: pass (115+). `tests/items/fieldgear|comms|vendors|armor.test.ts` are new.
- `npm test` takes >10 min (layouts); use the per-folder scripts; layouts alone as a unit: `systemd-run --user --unit sw5e-worldtests --working-directory=$HOME/SW5e-Proper sh <script>` (a script of `node --import tsx --test tests/world/<name>.test.ts` lines).

## Standing rules from the user
- Speeder race is opt-in (`RACE=1`). No worktrees. One CPU: e2e one at a time, no build/tsc/tsx during a browser run.
- Asset budget 24 MB. Commits: `git -c user.name=Tombdbad -c user.email=<account email> commit` + Co-Authored-By trailer.
- No 2D maps; everything tapped on the 3D map. No DB migrations for this task (state in playState JSON).

## Things learned
- `pkill -f` with a pattern that is in your own command line kills your own shell (exit 144). A small `tsx` script run alone from the scratchpad hung once; put checks in a `tests/items/_x.test.ts` and delete it, with `timeout`.
- A fight test needs dice pinned (`Math.random = () => 0.5` while the trooper acts) or a natural 1 makes it flaky; `initiateCombat(..., surprise=false)` or the enemy does nothing in round 1.
- `useCombat` mines: `walk()` trips them per step (`tripMines`); paired mines ignore walkers; `beginTurn` arms the setter's mines and clears `untilStart` conditions, `reactiveFrom` and `open`.
- The page re-saves its clock: change a campaign's `timeElapsed` only after navigating the page to about:blank.
- Full e2e: `sh deploy/test-plain.sh`, then `systemd-run --user --unit sw5e-e2e-full --working-directory=$HOME/SW5e-Proper env BASE=http://127.0.0.1:5002 OUT=e2e/out/full3 node e2e/play.mjs` (~50 min; race skipped). Never `pkill -f` a pattern in your own command line. `bash deploy/backup.sh`, not `sh`.
