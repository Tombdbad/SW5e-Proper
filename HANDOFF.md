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

## Next: item models (in progress, nothing in the repo yet)
- Blender 4.0.2 is installed (apt, headless, numpy added). The user-level skill `blender-sw5e` (`~/.claude/skills/blender-sw5e/`: SKILL.md + `scripts/sw5e_bpy.py`, `convert_pack.py`) holds the conventions, the library and the animation rules. Read it before touching models.
- Sources: `~/asset-sources/` (MANIFEST.md, SELECTION.md = which asset becomes which Star Wars item, reference/ = 10 Databank images; Wookieepedia images are behind a Cloudflare bot check, do not retry). Kenney packs are CC0 glb; Quaternius medieval weapons are CC0 FBX.
- Staged (outside the repo, `~/asset-sources/staged/`, each model has `.glb`, `.png` preview, `.rig.json`): 235 models in `quaternius-weapons-raw/` (24), `built/{sabers 10, gear 10, weapons2 13, worn 14, instruments 15, props 42, suits 24, consumables 64, gaps 19}`. `INDEX.json` maps all 253 missing rules-data items to a model (saber names to a hilt variant plus `bladeScale`; the four whip names share `electrowhip`; Holocron has jedi and sith variants). Builders: `~/asset-sources/builders/*.py` (copy into `tools/` when wired).
- Not done / known weak: LOD files (`.lod.glb`) not made; holocrons are plain solids; xantha and fizzz instruments are rough; saber variants beyond the 10 hilts differ only by `bladeScale` (axe, ring, baton, club shapes would need blade shapes in code); worn straps and gloves wrap the body and should be generated in code (bandolier, shock gloves, friction grip, tracker vest, rocket boots are display models); named armour suits and the droid customizations / enhanced items are out of scope.
- Type-coloured models (ammunition, mines, drinks, spice, suits) must be exempt from palette toning when wired (saturated colours would all become the room accent).
- Species: figures are scaled as one group by `look.scale`, so models are built at human size. Wrapping straps (belts, bandoliers, gloves) must be generated in code from body width; rigid models carry `meta.slot` and a `mount`/`grip` socket in their rig.json. The attach logic in models.tsx (`inHand` guesses the grip; hip/back anchors are fixed offsets) needs a per-species pass when wiring: hunched, winged, tailed, four-armed.
- Animation later: models keep moving parts as separate named nodes (`blade`, `wire`, `limbs`, `orb_L`...), pivots at hinges, sockets `grip`/`off_hand`/`tip`/`muzzle`, positions in `<name>.rig.json`. `tools/convert-assets.mjs` flattens and joins everything: it needs a keep-parts mode for these before they ship.
- Still to do: wire models into `interiors/gear.ts` and `kitbash.ts` (catalogue, `.lod.glb`, credits, `test:assets`), next: wire the models in (`interiors/gear.ts` maps item to model from INDEX.json, `kitbash.ts` catalogue, keep-parts mode in `convert-assets.mjs`, `.lod.glb`, CREDITS.md, tests), the per-species attach pass, then e2e on a test copy, then e2e on a test copy. Nothing was changed in the repo or on the live service.

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
