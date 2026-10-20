# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-20 ~14:30 UTC, result added 2026-10-20 14:26 UTC. Branch `revive`, HEAD `b14b6d7` (pushed). `main` is still at `3aa0586` (the previous clean full run); this session's work is NOT merged.

## Running now / result of the full e2e (read this first)
<!-- E2E-RESULT -->
**FINISHED 2026-10-20 14:26 UTC** (started Tue 2026-10-20 13:36:15 UTC). HEAD `b14b6d7`, plain copy 5002, speeder race skipped. Unit result: exit-code. **86/88 steps passed** (86 PASS lines, 2 FAIL lines).
Log `~/e2e-full2.log`, screenshots `e2e/out/full2`.
Failed steps (message cut to 260 characters; the full line is in the log, with diagnostics above it):
- [2s] world: an unvisited planet is built on demand  :: {"world":{"version":1,"seed":170810146,"name":"The Galaxy","partyLevel":1,"partySize":1,"antagonist":"Black Sun","rootId":"a1","startId":"a220","areas":{"a1":{"id":"a1","kind":"galaxy","parentId":null,"des
- [33s] flying games: the downtime menu is in groups; a taxi run is flown on the 3D map with the drag pad and boost, and paid by the rings it takes  :: locator.waitFor: Timeout 5000ms exceeded. | Call log: |   - waiting for getByTestId('countdown') to be visible
Neither of the two failures seen mid-run involved models; check each against the clean run of `3aa0586` (88/88) before blaming this session's work.
<!-- /E2E-RESULT -->

## State of the machines
- **Live service `sw5e` (port 5000)** runs `main` at `3aa0586` (restarted 08:55 UTC). Backup `~/sw5e-backups/sw5e-20261020-085534.sql.gz`. It has none of this session's work; promoting needs the user's go-ahead (`npm run build && sudo systemctl restart sw5e`, after a backup and a look at the journal).
- Plain copy `sw5e-plain` (5002, DB `sw5e_test`) runs HEAD for the e2e. `sw5e-test` (5001, showcase) and the Vite gallery server `sw5e-vite` (5173) are stopped; `sh deploy/test-copy.sh` rebuilds 5001 (the real server is needed for the gallery: species bodies come from `/api/sw5e/species`; a bare Vite server shows every species as the same human).
- Merging `revive` into `main` was authorised only for the previous run; ask again after this run is clean.

## Done this session (all pushed on `revive`)
- Item models for all 507 equipment items and all 1,918 enhanced items: 392 models in 14 packs `client/public/assets/sw5e-*` (commits `658bffb` ...). `tools/build-item-assets.mjs` (`npm run build:items <staged-dir>`), `shared/art/itemModels.json` + `itemIndex.json`, per-vertex finish+part (`_MARK`), `interiors/items.ts` (catalogue, `composeSaber`, `tintGlow`), `anchors.ts` (`bodyAnchor` per species, `holdAt` grip), `ItemModel.tsx`, `gear.ts`, `stock.ts`/`Stock.tsx` (goods, devices, droid parts, clothing, instruments, vials, bar, ammunition, named armour on stands). See REVIVAL_NOTES "Item models".
- Figures: weapons held by their `grip` socket, saber blades take the wielder's colour, NPC Force users hold the saber model, enhanced weapons use their base design, cantina musicians hold an instrument (pose `play`), worn gear on hips, back, belt, shoulder, wrist (checked on real species: hunched, winged, long-necked), worn look = frontier palette, `gearOf` knows enhanced items with a model.
- `tools/item-audit.ts` -> **`ITEM_TODO.md`** (`npm run audit:items`): per category what the game does with each item (use, vendors, loot, model) and the gaps by group, computed from `gearUse`, `itemFactsOf`, `WARES`, `LOOT`, `coverageOf`; the notes are in the tool's `CURATED`.
- Asset budget raised from 10 to 24 MB (the 14 packs are 7.2 MB). Gallery: `/dev/models?section=worn|hands|items` (`e2e/interiors.mjs worn|hunter|hands|items`).
- Tests: `npm run test:interiors` (106 pass, about 60 s). Use it, not `npm test` (see below).

## Next steps, in order
1. Read the result block above. Investigate the failed steps (compare with `3aa0586`, which was 88/88: build it with `sh deploy/test-plain.sh <dir>` from a clean checkout if needed). If only flakes, rerun that step: `ONLY="<regex>" BASE=http://127.0.0.1:5002 node e2e/play.mjs`.
2. If clean: rebuild the test copy (`sh deploy/test-copy.sh`) for the user to look at; ask before merging to `main` or touching the live service.
3. Work down `ITEM_TODO.md` by group, each time checking the code first and updating `CURATED` in the tool: personal ammunition and special ammunition effects, environmental hazards for life support, encumbrance, effects of the 18 weapon/armour accessories, enhanced explosives and spice (450 enhanced consumables have no facts), loot and vendor gaps (no cache holds instruments, cybernetics or ship items), droid modules drawn on droids, head/neck/finger/feet/hands/torso slots (per-species fitting), blade halo, `off_hand` socket for the second hand, animation.
4. Open decisions for the user: the packs' `License.txt` offers the models as CC0 (original shapes plus CC0 pieces): confirm; accent colour makes a whole bunk or generator one colour (fix or leave?).

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
