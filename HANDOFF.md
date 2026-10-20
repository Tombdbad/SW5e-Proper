# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-20 ~14:50 UTC. Branch `revive`, HEAD is the commit that carries this file (pushed). `main` is still at `3aa0586` (the previous clean full run); this session's work is NOT merged.

## Result of the full e2e (read this first)
<!-- E2E-RESULT -->
**Full e2e of `b14b6d7` finished 2026-10-20 14:26 UTC** (started 13:36:15; plain copy 5002, speeder race skipped): **86/88 steps passed**. Log `~/e2e-full2.log`, screenshots `e2e/out/full2`. Both failures are explained and neither came from the item models:
- `world: an unvisited planet is built on demand` was a **generator bug, older than this session**: `addTower` in `shared/logic/index.ts` joined a third-floor room to the room it is stacked on without checking that they already shared a door, and the server then said "Duplicate or looping Stairs at East tower". It depends on the random seed (campaign seed 170810146 hit it on 2 of 40 expansions of Coruscant), so the clean run of `3aa0586` was lucky. Fixed in `ffd24b5` (same shuffle, so sound worlds generate as before); test `tests/world/expand.test.ts` fails without the fix; 576 expansions over 8 seeds are sound.
- `flying games: ... taxi run` timed out waiting 5 s for the countdown, with a 4.9 s page stall (`maxGap` 4867) in software rendering. The step alone passes in 76 s. The three countdown waits are now 20 s (`ce1914c`).
Not rerun since the fixes: a full e2e (50 min). The plain copy 5002 still runs the build before them.
<!-- /E2E-RESULT -->

## State of the machines
- **Live service `sw5e` (port 5000)** runs `main` at `3aa0586` (restarted 08:55 UTC). Backup `~/sw5e-backups/sw5e-20261020-085534.sql.gz`. It has none of this session's work; promoting needs the user's go-ahead (`npm run build && sudo systemctl restart sw5e`, after a backup and a look at the journal).
- Plain copy `sw5e-plain` (5002, DB `sw5e_test`) still runs `b14b6d7` (before the two fixes). **Test copy `sw5e-test` (5001, showcase) was rebuilt 14:5x UTC from `ce1914c` and is running: the user can look at it.** The Vite gallery server `sw5e-vite` (5173) is stopped; `sh deploy/test-copy.sh` rebuilds 5001 (the real server is needed for the gallery: species bodies come from `/api/sw5e/species`; a bare Vite server shows every species as the same human).
- Merging `revive` into `main` was authorised only for the previous run; ask again.

## Done this session (all pushed on `revive`)
- Item models for all 507 equipment items and all 1,918 enhanced items: 392 models in 14 packs `client/public/assets/sw5e-*` (commits `658bffb` ...). `tools/build-item-assets.mjs` (`npm run build:items <staged-dir>`), `shared/art/itemModels.json` + `itemIndex.json`, per-vertex finish+part (`_MARK`), `interiors/items.ts` (catalogue, `composeSaber`, `tintGlow`), `anchors.ts` (`bodyAnchor` per species, `holdAt` grip), `ItemModel.tsx`, `gear.ts`, `stock.ts`/`Stock.tsx` (goods, devices, droid parts, clothing, instruments, vials, bar, ammunition, named armour on stands). See REVIVAL_NOTES "Item models".
- Figures: weapons held by their `grip` socket, saber blades take the wielder's colour, NPC Force users hold the saber model, enhanced weapons use their base design, cantina musicians hold an instrument (pose `play`), worn gear on hips, back, belt, shoulder, wrist (checked on real species: hunched, winged, long-necked), worn look = frontier palette, `gearOf` knows enhanced items with a model.
- `tools/item-audit.ts` -> **`ITEM_TODO.md`** (`npm run audit:items`): per category what the game does with each item (use, vendors, loot, model) and the gaps by group, computed from `gearUse`, `itemFactsOf`, `WARES`, `LOOT`, `coverageOf`; the notes are in the tool's `CURATED`.
- Asset budget raised from 10 to 24 MB (the 14 packs are 7.2 MB). Gallery: `/dev/models?section=worn|hands|items` (`e2e/interiors.mjs worn|hunter|hands|items`).
- Tests: `npm run test:interiors` (106 pass, about 60 s). Use it, not `npm test` (see below).

## Next steps, in order
1. The test copy 5001 (showcase) was rebuilt from the commit with this file for the user to look at (`sh deploy/test-copy.sh`). Next full e2e, when the user wants one: `BASE=http://127.0.0.1:5002 OUT=e2e/out/full3 node e2e/play.mjs` as a user unit (`systemd-run --user --unit sw5e-e2e-full ...`), after `sh deploy/test-plain.sh` for the fixes; it takes about 50 min, VM idle.
2. Ask the user before merging `revive` into `main` or touching the live service.
3. Work down `ITEM_TODO.md` by group, each time checking the code first and updating `CURATED` in the tool: personal ammunition and special ammunition effects, environmental hazards for life support, encumbrance, effects of the 18 weapon/armour accessories, enhanced explosives and spice (450 enhanced consumables have no facts), loot and vendor gaps (no cache holds instruments, cybernetics or ship items), droid modules drawn on droids, head/neck/finger/feet/hands/torso slots (per-species fitting), blade halo, `off_hand` socket for the second hand, animation.
4. **Decisions for the user (not made yet; ask at the start of the next session):**
   - Merge `revive` into `main`? `main` is still at `3aa0586`; the earlier go-ahead covered the previous run only.
   - Promote the live service `sw5e` (port 5000) to this build? Back up the database and check the journal first (`bash deploy/backup.sh`, then `npm run build && sudo systemctl restart sw5e`).
   - Confirm the CC0 licence text in the 14 packs' `License.txt` (original shapes plus CC0 pieces).
   - Accent colour makes a whole bunk or generator one colour: fix it or leave it?

## Decisions from the user
- Speeder race is opt-in (`RACE=1`). The consular fight step waits 60 s for the Fight button.
- No separate worktrees. One CPU: run e2e one at a time, on an idle VM; do not build, run `tsc`/`tsx` or a browser meanwhile.
- Asset budget may be raised (done); extra timeouts in tests are my call.
- Commits: `git -c user.name=Tombdbad -c user.email=<account email> commit`, with the Co-Authored-By trailer.

## Things learned
- `npm test` takes more than ten minutes (`tests/world/layouts.test.ts`, 23 generated worlds); use `npm run test:interiors`.
- Shop stock models load lazily: in software rendering they took about 30 s to appear (`WAIT=30000` for `e2e/interiors.mjs`).
- A slice of the e2e (`ONLY=`) must keep the steps a later step depends on: "enough experience offers a level" needs Play opened by "home: campaign listed, Play opens the game".
- Never `pkill -f` a pattern in your own command line (it kills the shell). `bash deploy/backup.sh`, not `sh`.
- The Blender work (outside the repo): skill `blender-sw5e`, `~/asset-sources/` (MANIFEST.md, SELECTION.md, `builders/*.py`, `staged/`, `tools/flag_tones.py`, `tools/resolve_enhanced.py`). Rebuild: edit a builder, run it with `blender -b --python X.py -- <out>`, `python3 ~/asset-sources/tools/flag_tones.py`, then `npm run build:items ~/asset-sources/staged`.
- `npx tsc --noEmit` shows errors only in legacy files (`CharacterCreator.tsx`, `lib/game/index.ts`); fix errors only in code the app uses.
