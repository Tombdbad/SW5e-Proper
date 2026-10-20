# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-20 ~18:30 UTC. Branch `revive`, HEAD is the commit that carries this file (pushed). `main` and the live service are at `bb61494` (item models, accent fix); the stairs work below is on `revive` only.

## Decisions from the user today (2026-10-20, afternoon)
- Merged `revive` into `main` (fast-forward, pushed, `3aa0586` -> `3bfd72a`) and promoted the live service: backup `~/sw5e-backups/sw5e-20261020-155415.sql.gz`, `npm run build`, `sudo systemctl restart sw5e` 15:55 UTC, served 200 (page, `/api/campaigns`, a saber glb), journal clean. No schema change.
- Licence text of the 14 `sw5e-*` packs: confirmed fine. Each `License.txt` credits Kenney (Survival, Food, Pirate Kits) and Quaternius (LowPoly Medieval Weapons), CC0, which are exactly the packs the Blender builders read; `CREDITS.md` lists all 14 packs.
- Accent colour: fix it (done, below, and live).
- Second go-ahead ("merge it and restart live", ~16:20 UTC): `main` fast-forwarded to `bb61494` and pushed, backup `~/sw5e-backups/sw5e-20261020-162244.sql.gz`, build, `sudo systemctl restart sw5e` 16:23 UTC, page / `/api/campaigns` / a glb all 200, journal clean. No schema change.
- Each go-ahead covers that run only; ask again before the next merge or restart.

## Done this session
- **Accent fix** (`client/src/components/Map/interiors/tones.ts`, `tools/tones.mjs`, `tests/interiors/tones.test.ts`, REVIVAL_NOTES "Interiors"): saturation is a band (below 0.5 ramp, from 0.75 accent, mixed between), coloured materials sit lower in the ramp, `holdOf` holds the accent back on a model that is mostly coloured. A barracks bunk is now a khaki frame with an ochre blanket; tables, sofas and crystals keep several colours; stripes on grey bodies are as before. Looked at in the gallery (`e2e/out/accent0` before, `accent3` after, `accent3b` the barracks); `npm run test:interiors` 106 pass before the two new tests, `tones.test.ts` 7 pass. Not run: the full e2e (50 min) on this commit.
- Earlier this session (already on `main`): item models for all items, figures holding and wearing gear, `ITEM_TODO.md`, generator fix `ffd24b5`, 20 s countdown waits `ce1914c`; full e2e of `b14b6d7` 86/88 (both failures fixed, see REVIVAL_NOTES).

## State of the machines
- **Live `sw5e` (5000)**: `main` at `bb61494`, restarted 16:23 UTC. Has the item models and the accent fix.
- Plain copy `sw5e-plain` (5002, DB `sw5e_test`) and test copy `sw5e-test` (5001, showcase) run the stairs work (rebuilt ~18:45 UTC; 5001 again after the last commit): `sh deploy/test-plain.sh` / `sh deploy/test-copy.sh` rebuild them. Vite 5173 stopped (start with `systemd-run --user --unit sw5e-vite --working-directory=$HOME/SW5e-Proper sh -c 'exec npx vite --port 5173 --host 127.0.0.1'`).

## Stairs and multi-level buildings (2026-10-20 evening; user: "go, ask no questions", no full e2e, saved games do not matter)
Plan: `~/.claude/plans/we-have-an-issue-wise-mango.md`. LIVE: user said "push to live, rebuild and restart 5000" (~19:20 UTC): `main` fast-forwarded to `82c9762`, backup `~/sw5e-backups/sw5e-20261020-192400.sql.gz`, build, `sudo systemctl restart sw5e` 19:25 UTC; page, `/api/campaigns`, `/api/world/generate` 200, journal clean. No schema change.
- `f762739` hotfix: the mezzanine (and stacked floors) could not be reached because a stairs tap walked onto the stairs' own blocked squares; now it walks to the flight's foot (`stairsApproach`, `stairsGoals`) and arrival is at the way back (`arrivalSquares`). Old saved worlds (campaign 144) keep their old layouts; the gallery flight there has no `toward`, so a tap walks to any square beside it (not tested on that save).
- `fdb1689` stair blocks (the user's design, see REVIVAL_NOTES "World generator", point "Stair blocks"): columns (`linkColumns`: rooms over a ground host `stack:`, a basement `under:`, a storeroom added where a column lacks one), a 5-lane block beside the host (`stairBlock`: upReturn, upStart, hall, downStart, downReturn; mirrored in some buildings), each switchback ONE room climbing a level (`layout.switchback`; `climbAt`, `canStep` = no step across the well but on the landing), doorway at the foot and head of every flight, the hall's far end goes on to the next room or is a dead end; lift only if no block fits (never in the test worlds); in-room stairwells and 3x7 stair rooms gone in built buildings (wild keeps rising passages, hangars lifts). Map: `Switchback` drawing, mezzanine doorways, the step rule in tap routes and the stick. Gateways stay on the ground (`levelsOf`).
- `0c5a5ff` notes + city-planet test (counts rooms two floors up).
- Then (advisor review): the flights' doorways open from the room on their floor, not from the hall (three doors on the hall's first square could not be told apart by a tap: a real tap went down the stairs instead of back to the host), so the host's wall has three doorways side by side (flight up, hall, flight down); `stairsGoals` shared by the map and the walk; the map probe gives positions up the climb; overhead walls of a switchback stop at its landing; treads take taps; a tower's flight below no longer covers the one above. `e2e/stairs.mjs` (new, targeted, ~4 min): taps the real stairs and doors on 5002 and checks the HUD room after each: mezzanine up and down, host -> switchback up -> room over it and back, host -> switchback down -> basement and back, host -> hall and back: PASS.
- Tests run (only the touched modules, as the user asked): `tests/world/access.test.ts` (new: block geometry, switchback heights and well, walk check catches a removed door, 11 worlds walked room by room + validateWorld, column stats), `stairs`, `layouts` (23 worlds, audit now includes `walkBuilding` and door heights), `expand`, `city-planets`, `decks`, `caves`, `tests/interiors/{floors,round,doors}`, `tests/server/showcase`: all pass. `tsc` clean in touched files. Browser look (not the e2e): `e2e/interiors-room.mjs` on 5002: `e2e/out/stairs3` (first person up a switchback), `stairs5` (from the landing), `stairs6` (mezzanine flight with doorways).
- Test copies: 5002 (plain) and 5001 (showcase) rebuilt from this work; a NEW campaign there gets the new buildings.
- Cost: a world with its starting planet built has 290 areas (274 before), ~2 s as before; seed 1 fully built 9027 areas (7596 before, +19%), 59 s (49 s before), 13.7 MB of JSON.
- Known gap: a fight that starts on a switchback (a squad walking in on the party on the stairs) uses the room's flat squares, so it could cross the well; not handled. The landing can take a door to a half-level room, none is generated yet.

## Taller stacks, roof stairs, windows, balconies (2026-10-20 evening, on `revive`, NOT merged or live: ask first)
- `b73152e` stair blocks stack both ways (`stairBlock(..., ups, downs)`): city towers 3-5 floors over the ground (`MAX_HEIGHT`), sub-basements (`MAX_DEPTH` 2; vaults, crypts, cells go deep), filler floors named by building (`upperFloorOf`). `11f587f`: a building of five rooms or more always has a column (gateways stay on the ground now).
- `8384745` roof stairs (`roofStairs` in planDistrict): a roof on a column top gets a switchback from the top floor, roof door at its head (locked in hostile buildings, 2 in 5 elsewhere). ~1 roof in 3 has them in the test worlds.
- `a175887` windows (`Pane`: slit/small/large/wide; open/latched/locked; alarmed; `paneFor`, `setPane`, window card in GameBoard: look, climb in/out, jimmy DC 12, pick, break DC 10 noisy, disable sensor DC 13) and balconies (form `balcony`, open air; palace/estates/manor upper rooms over the street; patio doors locked/`alarmed` path). USER (21:20 UTC): balconies are NOT climbable as standard; grapple hooks (items exist, logic unwritten) are meant to reach them later. Climbing removed: no exit, not a gateway, no climb in `exitsOf`, no trellis, no street-fight link. All labelled house rules; REVIVAL_NOTES "Play rules" has the list.
- `4bacc2f` camera fix: the street's follow point was cleared a frame late, so climbing from the street to a balcony or roof aimed the camera at the street (old bug for roof ladders too). Room behind a stood-on balcony drawn open.
- Tests: `tests/world/access.test.ts` (8 tests: block geometry incl. towers and sub-basements, walk, windows, balconies, roof ways) and the world/interiors/showcase suites pass (final rerun on `4bacc2f`: 33 + layouts 3, all pass). Browser: `e2e/stairs.mjs` PASS end to end on 5002 (final build); 5001 rebuilt too (mezzanine, block up/down/hall, roof -> stairs -> Offices floor 5, window climb-in, balcony climb + patio doors).

## Next steps, in order
1. The stairs are live; the user makes a new campaign to get the new buildings (campaign 144 keeps its old ones). Next merge or restart: ask again.
1b. The accent fix is live; if the user dislikes it in play, the tuning is the constants in `interiors/tones.ts` (`SATURATED`, `FULL`, `LOUD`, the 0.45 in `toned`).
2. Full e2e when the user wants one: `sh deploy/test-plain.sh`, then `BASE=http://127.0.0.1:5002 OUT=e2e/out/full3 node e2e/play.mjs` as a user unit (`systemd-run --user --unit sw5e-e2e-full ...`), VM idle, about 50 min.
3. Work down `ITEM_TODO.md` by group, each time checking the code first and updating `CURATED` in `tools/item-audit.ts`: personal and special ammunition, environmental hazards for life support, encumbrance, the 18 weapon/armour accessories, enhanced explosives and spice (450 enhanced consumables have no facts), loot and vendor gaps (no cache holds instruments, cybernetics or ship items), droid modules drawn on droids, head/neck/finger/feet/hands/torso slots (per-species fitting), blade halo, `off_hand` socket, animation.

## Standing rules from the user
- Speeder race is opt-in (`RACE=1`). The consular fight step waits 60 s for the Fight button.
- No separate worktrees. One CPU: run e2e one at a time on an idle VM; no build, `tsc`/`tsx` or browser meanwhile.
- Asset budget is 24 MB (the 14 packs are 7.2 MB). Extra timeouts in tests are my call.
- Commits: `git -c user.name=Tombdbad -c user.email=<account email> commit`, with the Co-Authored-By trailer.

## Things learned
- `npm test` takes more than ten minutes (`tests/world/layouts.test.ts`); use `npm run test:interiors` (about 60 s).
- To look at recolouring or models without a build: the Vite server above plus `BASE=http://127.0.0.1:5173 WAIT=30000 node e2e/interiors.mjs tones rooms` (`CAM=x,y,z LOOK=x,y,z` for a close view; `OUT=` for the folder). About 1 min a view in software rendering.
- Shop stock models load lazily: about 30 s to appear in software rendering (`WAIT=30000`).
- A slice of the e2e (`ONLY=`) must keep the steps a later step depends on ("enough experience offers a level" needs Play opened by "home: campaign listed, Play opens the game").
- Never `pkill -f` a pattern in your own command line (it kills the shell). `bash deploy/backup.sh`, not `sh`.
- Blender work is outside the repo: skill `blender-sw5e`, `~/asset-sources/` (MANIFEST.md, SELECTION.md, `builders/*.py`, `staged/`). Rebuild: edit a builder, `blender -b --python X.py -- <out>`, `python3 ~/asset-sources/tools/flag_tones.py`, `npm run build:items ~/asset-sources/staged`.
- `npx tsc --noEmit` shows errors only in legacy files (`CharacterCreator.tsx`, `lib/game/index.ts`); fix errors only in code the app uses.
