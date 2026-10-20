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
- `sw5e-e2e` (user unit) was running the full play-through against 5001 since 00:08 UTC, log `~/e2e-run4.log`, screenshots `e2e/out/play`. Check `systemctl --user is-active sw5e-e2e`; do not build, run tsc/tsx or other browser jobs while it runs (the 3D steps fail under load).
- At 01:00 it had 75 pass, 11 fail (see below). Run 3 (`~/e2e-run3.log`, before the showcase world and before this session) had 72 steps, 6 failures, all of which were load or timing.

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
