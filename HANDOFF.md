# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-20 ~09:00 UTC. Branch `revive`. `main` is at `3aa0586` (the full e2e run, merged as a fast-forward).

## State now
- **Live service `sw5e` (port 5000)** runs a build of `main` at `3aa0586`, restarted 08:55 UTC on the user's go-ahead. Backup taken first: `~/sw5e-backups/sw5e-20261020-085534.sql.gz`. Migrations 0001-0003 are applied.
- **Test copies are stopped:** `sw5e-test` (5001, showcase seed 34, DB `sw5e_test`) and `sw5e-plain` (5002). Start again with `sh deploy/test-copy.sh` or `sh deploy/test-plain.sh` when testing new features.
- **Nothing else is running.** The background agent `cc71904b` has stood down.
- **Full play-through (`e2e/play.mjs`, plain copy, no showcase, speeder race skipped): 88 of 88 steps pass.** Run 08:25 UTC, log `~/e2e-full.log`.

## Done (all on `revive`, merged to `main`)
- Stacked rooms and stairs: `auditBuildings` (shared/logic) with `tests/world/layouts.test.ts` and `stairs.test.ts`; switchback stairwells; galleries.
- Ship decks: fixed plans per size, `tests/world/decks.test.ts`.
- Caves: organic masks (`shared/logic/caves.ts`), passages 2-6 squares wide.
- City planets: sewers instead of caves, speeder platforms as district ways (`tests/world/city-planets.test.ts`).
- Eye views: ceilings over roofed rooms; `interiors/aim.ts` and `ViewRig.tsx` reticle.
- Stick: `interiors/stick.ts`, one size and expo curve for walking, race and dogfight; Run/Walk button (key R).
- Walking animation (`interiors/limbs.ts`); gear on figures (`interiors/gear.ts`).
- Details: REVIVAL_NOTES.md, the 2026-10-20 bullet under "Interiors overhaul".

## Still open
- **Item models** (TODO in REVIVAL_NOTES.md, "Model coverage and TODO"): 184 of 507 equipment items have no model; 69 weapons are code-only. Next: find and download free packs, then deconstruct, rescale, recolour and low-poly-build hybrids. Sources manifest: `~/asset-sources/MANIFEST.md`.
- Coruscant catwalks between buildings are not built (only platforms and roof catwalks exist).
- Fight-view ceilings: drawn but not looked at in a browser.
- The Run/Walk ratio is unit-tested only.
- Accent colour makes a whole bunk or generator one colour (loud in barracks). Fix or leave? (user's call)

## Item models: wired (2026-10-20), see REVIVAL_NOTES "Item models" and ITEM_TODO.md
- Done and pushed (`658bffb`, `041f8df`, `b35fc7f` and later): 392 models in 14 packs `client/public/assets/sw5e-*`, `shared/art/itemModels.json` + `itemIndex.json`, `tools/build-item-assets.mjs` (`npm run build:items <staged-dir>`), finish + part per vertex, `interiors/items.ts`, `anchors.ts`, `ItemModel.tsx`, gear/stock wiring, tests (`npm run test:interiors`, 102 pass), `tools/item-audit.ts` -> `ITEM_TODO.md` (`npm run audit:items`). Asset budget raised to 24 MB. Nothing is on the live service or the test copy yet (the Vite dev server `sw5e-vite` on 5173 serves the gallery: `systemctl --user stop sw5e-vite` when done).
- The models are rebuilt from the staged Blender files in `~/asset-sources/staged` (outside the repo; the skill `blender-sw5e` and `~/asset-sources/builders/*.py` make them; `tools/flag_tones.py` re-sets tone flags after a rebuild; `tools/resolve_enhanced.py` rewrites INDEX_ENHANCED.json). If those are lost the repo's packs and JSON still work, but cannot be rebuilt.
- Next: look at `?section=worn`, `hunter`, `items` in the gallery (`BASE=http://127.0.0.1:5173 node e2e/interiors.mjs worn`) and fix what looks wrong; then work down ITEM_TODO.md by group (personal ammunition, hazards and life support, encumbrance, accessory effects, enhanced explosives, cache and vendor gaps, droid modules on droids, instruments in musicians' hands, head/neck/feet/hands slots, saber blade colour, `grip` socket, animation). Each group: check the code, update `CURATED` in the audit tool, regenerate.
- Species: figures are scaled as one group by `look.scale`, so models are built at human size; `bodyAnchor` (anchors.ts) handles bulk, hunch, wings; wrapping straps (belt, bandolier) are drawn by code from `b` and exist already.
- Type-coloured models carry `meta.tone: "none"` and are never palette-toned (KitLook `plain`).

## Decisions from the user
- Speeder race is opt-in (`RACE=1`).
- The consular fight step waits 60 s for the Fight button (its first 3D frame blocks the page).
- No separate worktrees. One CPU: run e2e one at a time, on an idle VM.
- Commits: `git -c user.name=Tombdbad -c user.email=<account email> commit`, with the Co-Authored-By trailer.
- Future builds for the live service: `npm run build && sudo systemctl restart sw5e`, after checking the journal for recent saves.

## Things learned
- `bash deploy/backup.sh`: `sh` fails on `pipefail`.
- Gallery shots: `BASE=http://127.0.0.1:5001 node e2e/interiors.mjs <view>`; a real room: `VIEWMODE=first KEYS="KeyW,1500" node e2e/interiors-room.mjs armsmith`; fights: `e2e/fight-view.mjs`.
- Modular e2e: `ONLY="<regex>" node e2e/play.mjs` on port 5002 (`sh deploy/test-plain.sh` rebuilds it).
- Do not build, run `tsc`/`tsx` or start a browser while the full run is going: the 3D steps fail under load.
- `npx tsc --noEmit` shows hundreds of errors in legacy files; only fix errors in code the app uses.
