# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-20 ~01:00 UTC by the previous session. Branch `revive`, last commit `62e1fc4` (pushed), CLAUDE.md edited and not yet committed with this file.

## What the last session did (all committed and pushed)
- Station-kit walls, recolour per room, Space Kit machines, caves, kitbash models: `f2dd4f1`..`7f79966`. Curved kit walls on round rooms: `b047926`. Details: REVIVAL_NOTES.md (the long 2026-10-19 bullets in "Interiors overhaul").
- Model coverage list and TODO (`npm run coverage:models`, notes section "Model coverage and TODO"): `22ec834`.
- Over-the-shoulder / first-person views with an aimed crosshair (on foot and in fights): `1a4ed07`, `62e1fc4`. Files: `interiors/aim.ts`, `interiors/ViewRig.tsx`; button "View:" in the map bar, key V.
- Walking animation (`interiors/limbs.ts`, `Kit.limb`, `Walker`/`Gait` in models.tsx): `b7eb0bb`.
- Gear on figures (weapons, shields, kits, medicine, prostheses, armour weight): `2040cdb`. Files: `interiors/gear.ts`, `gearOf` in characterCalculation.ts.
- The test copy (port 5001, `https://sw5e.tailb1e5d7.ts.net:8443`) was rebuilt from the last code change. The live `sw5e` service (5000) was never touched and is on an older build (promoting it needs the user's go-ahead).

## Running now / half done
- 2026-10-20 ~01:10: the run on 5001 (showcase on) finished: 78 pass, 11 fail (log `~/e2e-run4.log`). Started `sw5e-compare` (user unit, `deploy/compare-e2e.sh`): builds HEAD with the showcase OFF on port 5002, runs the play-through (`~/e2e-head.log`), then does the same for commit 6373324 (`~/e2e-base.log`). When it finishes it writes `~/e2e-compare.txt`. Compare the FAIL lines of the two logs (`grep ^FAIL`). Takes 1 to 2 hours; do not start other browser or build jobs meanwhile.
- (older note) 
- `sw5e-e2e` (user unit) was running the full play-through against 5001 since 00:08 UTC, log `~/e2e-run4.log`, screenshots `e2e/out/play`. Check `systemctl --user is-active sw5e-e2e`; do not build, run tsc/tsx or other browser jobs while it runs (the 3D steps fail under load).
- At 01:00 it had 75 pass, 11 fail (see below). Run 3 (`~/e2e-run3.log`, before the showcase world and before this session) had 72 steps, 6 failures, all of which were load or timing.

## Requested by the user, NOT STARTED (2026-10-20): stacked buildings, switchback stairs, Coruscant
Do not start while `sw5e-compare` runs (it needs the VM idle). Ask nothing before starting; the user gave the brief below.
1. **A logic check like the one that proves locations are accessible** (`tests/interiors/doors.test.ts`, `floors.test.ts` are the nearest; also the e2e "world checked against the rules data" step), for the generator's stacked rooms (`linkUpperFloors` was removed; upper rooms now take their ground partner's footprint one level up, `linkFloors`/`planBuilding` in `shared/logic/index.ts`). It must show, over many seeds and building types: every room is reachable from the way in by walking (doors, stairs, lifts, ladders), every door sits on a wall two rooms share on a floor both stand on, every stair or lift has a landing room on both floors with an open square at each end, and nothing is orphaned.
2. **Known breakage to fix (reported by the user, may be a test-server artefact but must not reach main):** not all stacked rooms have their access doors correctly situated, and the steps up to a mezzanine level are broken (placement). Reproduce first: the showcase world (`SW5E_SHOWCASE_SEED=34`) and `e2e/interiors-room.mjs`/the gallery `rooms` view help; write the failing test before fixing.
3. **Switchback stairwells** to reach a room directly above or below, working across two AND MORE levels (a stair that doubles back on itself, landing at each floor; a stack of 3+ rooms is reached by a continuous stairwell, not by one stair per pair). Update `Form`/`linkLevels`/`StairsAsset`/`Ascent` (LocalMap.tsx) and the footprint rules so a stairwell reserves the same squares on every floor it serves.
4. **Coruscant** (and any city-planet): its locations should mostly be the "stacked" type (towers of rooms), connected by **catwalks** between buildings and **speeder platforms** for travel between districts. Coruscant is a planet-wide metropolis, so the word "settlement" does not fit there: find the right word for the level (district, level, tower complex) in the generator's area kinds and UI text. It has **no caves**: introduce **sewers** (and perhaps under-levels) in their place, as the dungeon-like locations. Look at how world generation picks building and cave types per planet (`shared/logic/index.ts`, `BUILDINGS`/biome tables around the building plans, "urban" biome) and the e2e step that expands "Coruscant".
5. Keep the rule: rules content stays in `shared/data`; generation stays pure functions in `shared/logic`; update `REVIVAL_NOTES.md`, add tests, run the e2e on a copy with the showcase OFF (`deploy/compare-e2e.sh` shows how) before calling it done.

## Next steps, in order
1. Decide whether the 11 e2e failures are mine. Suspect cause for most: the test copy runs the fixed showcase world (`SW5E_SHOWCASE=1`, `deploy/test-copy.sh`), so tests that expect their own seeded world fail (no second planet, no off-world exits, no seed-7 areas). Failures: unvisited planet built on demand; short/long rest (Long rest button disabled); off-world shuttle; level-up on the character page; 3D map double taps galaxy to building ("nothing on the map for area:a94"); 3D map fight tap moves the character; 3D map people in the cantina "nobody moved in 20 seconds"; trade bartender; sites; streets x2.
   Worrying ones, which could be this session's changes (Hit meshes now register in a registry, `Figure` now wraps humanoids in `Walker` and others in `Gait`, fight figures are inside a `Turner` group): the fight tap, the cantina movement, trade, sites and streets.
2. To settle it: when the run has ended, build a copy with the showcase OFF and run `e2e/play.mjs` on it twice, once from HEAD and once from `6373324` (the commit before this work; use `git worktree` or a clean checkout in a scratch directory, not the working tree). Compare failure lists. Showcase off: copy `deploy/test-copy.sh`, drop `SW5E_SHOWCASE=1`/`SEED`, use another port (5002) and another unit name, keep the `sw5e_test` database. Run each as a systemd user unit (`systemd-run --user`), 45 to 60 minutes each.
3. If the fight/cantina/trade/sites/streets failures are caused by this work, fix them (look first at `Hit`'s effect in LocalMap.tsx, `Turner`, and `Walker` in models.tsx; `window.__map3d` Probe locate keys).
4. Update REVIVAL_NOTES.md "Play-through test" with the result, commit, push.
5. Model TODO list (notes): sabers/bows/whips/thrown weapons still code-drawn; 18 worn accessories (jetpack, holster, bandolier...) and most storage/utility items have no model; ear/facial/throat/torso prostheses; named armour suits look alike per weight.

## Not decided / worth asking the user
- Promote the test build to the live service (`sudo systemctl restart sw5e` after `npm run build` in `~/SW5e-Proper`)? The user plays live; ask first.
- The accent colour makes a whole bunk or generator one colour (loud in barracks); fix or leave?

## Things learned
- The test copy build: `sh deploy/test-copy.sh` (about 1 minute); gallery shots: `BASE=http://127.0.0.1:5001 node e2e/interiors.mjs <view>` (views: racks wealth caves moods rounds packs tones rooms kitbash shops walk gear, `CAM=`/`LOOK=`/`LOADOUT=` env). Real room in a view: `VIEWMODE=first KEYS="KeyW,1500" node e2e/interiors-room.mjs armsmith`; fights: `e2e/fight-view.mjs`.
- Kenney kits are not kept; re-download from kenney.nl to rebuild converted models or kitbash (`tools/convert-assets.mjs`, `tools/kitbash.mjs`).
- Commit with `git -c user.name=Tombdbad -c user.email=sjerps.nadine@gmail.com commit ...` and the Co-Authored-By trailer given in the session.
