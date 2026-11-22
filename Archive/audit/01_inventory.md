# AUDIT 01: Inventory (2026-11-07, branch `audit`, read-only)

## Plain-English summary
- The project folder is about **1.56 GB**. Only about **0.2 GB is the actual project** (code, art, rules data, 80 MB of art in `client/public`). The rest is `node_modules` (707 MB, normal) and regenerable clutter: test screenshots (244 MB), a speech cache (202 MB), downloaded reference images (100 MB) and the last build (97 MB). None of that is tracked by git.
- Git itself is healthy: `.git` is 121 MB, no huge blobs (largest single file ever committed 1.7 MB), and nothing that should be ignored is tracked. The history is just many versions of textures and models.
- "Dead code" is smaller than the guide says. By my static-import method **56 of 234** client source files are unreachable (the guide says 85 of 205); 33 of the 56 are unused stock UI components (shadcn). Everything in `shared/` and `server/` is used except 2 files.
- There are 8 root-level legacy scripts plus Replit leftovers, all unreferenced by anything real. Safe to remove later, but nothing was deleted.
- **3 biggest risks:** (1) `GameBoard.tsx` is one React component about 10,000 lines long (lines 231 to 10229) inside an 11,375-line file; `shared/logic/index.ts` is 15,749 lines. Changes there are hard to review. (2) `CLAUDE.md` still tells agents to read `REVIVAL_NOTES.md`/`HANDOFF.md` in the root and restart a systemd service. The notes now live in `Archive/` and the project runs on Windows, so any new agent gets wrong instructions. (3) `RoomPlan.tsx` (a 2D SVG room plan, forbidden by the project's own "no 2D maps" rule) still exists; it is unreachable, so harmless today but a trap.

Method note: sizes are from PowerShell file sums (MB = 1,048,576 bytes). Reachability is my own script (`scratchpad/reach.mjs`, not added to the project), static imports only.

---

## 1. Size breakdown

Total measured: about **1,560 MB**.

| Bucket | MB | Share | Tracked by git? |
|---|---|---|---|
| `node_modules` (53,034 files) | 707.1 | 45% | no (ignored) |
| `e2e/out` (test screenshots) | 243.9 | 16% | no (ignored) |
| `.cache/speech` (TTS wav cache) | 202.3 | 13% | no (ignored) |
| `.git` (history; pack 116.6 MiB) | 121.4 | 8% | n/a |
| `tools/refs` (reference images, scans) | 100.4 | 6% | only 5 small files tracked; rest ignored |
| `dist` (last build) | 96.7 | 6% | no (ignored) |
| `client/public` (glb, textures, sounds, fonts) | 75.5 | 5% | yes. textures 57.5 MB (149 files), `assets/` 9.0 MB (1,074 Kenney glb), figures 8.1 MB |
| `client/src` | 4.1 | | yes |
| `shared` (rules data 9.4 + logic 1.6) | 11.3 | 1% | yes |
| everything else (`tests`, `Archive`, `server`, `deploy`, `package-lock`, root scripts, `generated-icon.png` 1.06) | about 3.5 | | yes |
| `attached_assets/` | 0.03 | | yes, 8 small text files. **Not a size problem.** |

Tracked content in HEAD by top folder: client 79.6 MB (1,498 files), shared 11.2, root 1.5, tests 0.8, Archive 0.6, tools 0.5, e2e 0.3.

**Top 25 files excluding `node_modules` and `.git`** (the biggest are all generated or ignored):
dist/index.js 9.9; tools/refs/moodboard/coruscant/04-…png 3.5; dist assets characterCalculation 3.1; Text 2.5; tools/refs/moodboard/jedha 2.4; shared/data rulesExpandedContent.json 1.7; enhancedItems.json 1.6; client/public/textures/figure/head/normal.jpg 1.6 (also in dist); e2e/out/dogfight/in-shaft.png 1.4; rocks_ground_02/normal.jpg 1.4; creature.glb 1.3; hair.glb 1.3; weapons.glb 1.3; archetypes.json 1.3; several more moodboard PNGs 1.3 to 1.4. (Full list was read from the command output; the same file appears twice where `dist/public` mirrors `client/public`.)

**Largest files inside `node_modules`:** UNVERIFIED. The scan timed out; not needed for the conclusion.

## 2. Git hygiene

- Tracked files in ignored-type folders (`dist`, `e2e/out`, `.cache`, `tools/refs/cache|moodboard|species|snips`): **0**. `git check-ignore` confirms `e2e/out`, `.cache`, `dist`, `tools/refs/moodboard` are ignored (`.gitignore` lines 6, 7, 2, 15).
- `.gitignore` gaps: none found for the folders above. Minor: `tools/out` is not listed (empty, 0 KB); `AUDIT/` is new and untracked-by-design.
- Tracked, probably should not be: `.replit`, `replit.nix`, `generated-icon.png` (1.06 MB; `client/index.html:5` uses `/favicon.svg`, so the PNG is unused by the page; UNVERIFIED whether anything else reads it), `attached_assets/*` (8 pasted chat logs).
- `.claude/launch.json` is tracked (added in my snapshot commit; it is the user's preview config, so harmless).
- **10 biggest blobs in history:** rulesExpandedContent.json 1.7 MB; enhancedItems.json 1.6; `textures/figure/head/normal.jpg` four versions 1.5 to 1.6 each; `rocks_ground_02/normal.jpg` 1.4; `creature.glb` 1.3; archetypes.json 1.3; `hair.glb` 1.3. Repo: 8,427 objects in packs, pack 116.6 MiB, 4.18 MiB loose. No blob over 2 MB, so no history rewrite is warranted.
- Identity note: `git config` already has user `Tombdbad` / `<the git config email>`, but `CLAUDE.md` says to commit with the account email, so my snapshot commit `433fd1e` used `<the account email>`. Author email in history now differs between commits; the user may want to confirm which they want.

## 3. Entry points and reachability

**Entry points used:** client `client/src/main.tsx`; server `server/index.ts` (also bundled by `npm run build`); `vite.config.ts`; `drizzle.config.ts`; `shared/scripts/import-sw5e.ts`; test entries `tests/*/*.test.ts` (`npm test`); `e2e/*.mjs` (26 files, `npm run e2e` runs `e2e/play.mjs`); `tools/*` scripts named in `package.json`.

**Method:** a script reads every `.ts/.tsx/.js/.mjs` file, extracts `import … from`, `export … from`, `import()`, `require()` and `new URL(…, import.meta.url)`, resolves `@/` and `@shared/` aliases (from `tsconfig.json`/`vite.config.ts`), relative paths, extensions and `index` files, and walks from the entries. Lazy pages in `App.tsx` (9 `lazy(() => import(...))`) are followed as normal imports. Limits: string-built paths and `import.meta.glob` would be missed. The only file mentioning glob/lazy is `App.tsx`, which is resolved.

| Area | Source files | Reachable from app entries | Unreachable |
|---|---|---|---|
| `client/src` | 234 | 178 | **56** |
| `server` | 13 | 12 | 1 (`server/middleware/validation.ts`, 80 lines) |
| `shared` | 27 | 26 | 1 (`shared/compatSchema.ts`, 106 lines) |

Tests and tools add nothing: no file is reachable only through tests/tools (0).
**Guide claim "~85 of 205 client files unreachable" is wrong by this method: 56 of 234.** (The guide may have counted `.tsx` only or used a different entry list; I could not reproduce 85.)

Unreachable client files (56; none imports them except where noted):
- **33 stock UI components** in `components/ui/`: accordion, alert-dialog, aspect-ratio, avatar, breadcrumb, calendar, carousel, chart (366 lines), collapsible, command, context-menu, drawer, dropdown-menu, hover-card, input-otp, menubar, navigation-menu, pagination, popover, progress, resizable, sheet, **sidebar (780 lines)**, slider, switch, table, toggle-group, toggle, tooltip, plus `SaveControls`, `StarfieldBackground`, `with-loading` (sheet/toggle/tooltip are used only by other dead files).
- **Character creation legacy:** `CharacterCreation/ArchetypeSelection.tsx` (182), `TestCard.tsx`, `CharacterCreator/CharacterCreatorMain.tsx`, `CharacterManagement/CharacterExportImport.tsx` (123), `contexts/CharacterCreationContext.tsx` (512).
- **Map leftovers:** `Map/RoomPlan.tsx` (153, a 2D SVG plan, see risk 3), `GalacticMap3D/GalaxyBackground.tsx` (239), `GalacticMap3D/StarSystem.tsx`, `LocalAreaMap/LocationMarker.tsx`, `SystemMap/Planet.tsx`.
- **lib:** `api/campaign.ts`, `core/performance.ts`, `data/{backgrounds,classes,species}.ts` (3-line stubs), `stores/useGame.tsx`, `hooks/use-is-mobile.tsx`; `lib/sw5e/{droids,exploits,monsters,npcs,vehicles,weaponProperties}.ts`.
- `client/src/utils/formatSpeed.ts`: reachable only from root script `bulkFormatSpeedFix.ts`'s directory scan (not an import), so effectively dead.

**Possibly dynamic (not dead):** 29 files are loaded by `import()`: the 9 lazy pages, `useCombat.ts`, `dice.tsx`, `campaignGenerator.ts`, `shooter.ts`, `models.tsx`, `footprint.ts`, `Walls.tsx`, `assets.ts`, `comms.ts`, `logic/index.ts`, `server/coop|db|showcase|sw5eData|dialogue.ts`, `contracts/nemesis/relations.ts`, plus test/tool helpers. These are reachable either way.

## 4. Duplicates and legacy

| Item | Used by | Other copy | Looks safe to remove? |
|---|---|---|---|
| `shared/schema.ts` vs `shared/unifiedSchema.ts` vs `shared/compatSchema.ts` | `schema.ts` is the server DB schema. `unifiedSchema.ts` is imported by `PowersSelection.tsx`, `hooks/useCharacterForm.ts`, `lib/api/character.ts`, `lib/stores/useCharacter.ts` (live code) and root `convertSpecies.ts`. | `compatSchema.ts`: **imported by nothing** | `compatSchema.ts`: yes (high). `unifiedSchema.ts`: **no**, still in use |
| Two campaign generators | `lib/sw5e/campaignGenerator.ts` is the one `Archive/REVIVAL_NOTES.md:970` says the UI uses; `lib/llm/campaignGenerator.ts` is lazy-imported (by `useCampaign`) | each other | UNVERIFIED which is live today; do not remove either yet |
| Character stores | `lib/stores/useCharacter.ts` used. `useCharacterStore.ts` named in notes no longer exists. `client/src/stores/` is an empty directory | | notes are stale; empty folder harmless |
| `lib/data/{backgrounds,classes,species}.ts` vs `lib/sw5e/*` | nothing imports the `lib/data` stubs | `lib/sw5e/*` | yes (high), 3 lines each |
| `migrate.ts` (postgres-js) | nothing references it | project uses `drizzle-kit` plus node-postgres (`server/db.ts:2`) | probably (medium) |
| `migrations.ts`, `run-migrations.ts`, `verify-schema.ts` (neon-serverless) | nothing references them; server does not use neon | `migrations/` SQL + drizzle-kit | probably (medium); they look like Replit-era |
| `fixSpeciesData.ts` + `fixSpeciesData.js`, `convertSpecies.ts`, `db-fix-script.js`, `bulkFormatSpeedFix.ts` | nothing references them; `convertSpecies.ts` imports `unifiedSchema` | rules data is now generated by `npm run import:sw5e` | probably (medium); one-off fixers |
| `.replit`, `replit.nix`, `attached_assets/` | Replit only | | yes (high); harmless text |
| `deploy/sw5e.service`, `sw5e-backup.*`, `backup.sh`, `test-*.sh` | Linux/VM only; `deploy/windows-start.ps1` is current | | keep until user decides (backups may still matter) |
| `server/middleware/validation.ts` | nothing imports it | | probably (medium) |
| `tsc` coverage | `tsconfig.json` `include` has client, shared, server, tests, `tools/**/*.ts` but **not root `*.ts` scripts** | | so the legacy root scripts are never type-checked: they may be broken |

## 5. Large files (over 1,500 lines)

| File | Lines | Mixed responsibilities (evidence: section banners) | Natural split points (list only) |
|---|---|---|---|
| `shared/logic/index.ts` | 15,749 | World model, seeded random, generation tables, sites and buildings, eras and law, room layouts, stairs, windows, levels, arena, the watch and law response, passage fares, ships and crew, then the later gear/tools/downtime/starship rules sections | model/types; random; generation; room layouts; stairs/levels; law and watch; travel/fares; ships/crew; downtime and starship rules |
| `client/src/pages/GameBoard.tsx` | 11,375 | One `GameBoard` component spanning lines 231 to 10229, then Downtime/Flight/Week/Trade/Crafting/Training panels | the component's tabs/panels; the six panels at 10317+ as their own files; helpers (`ClockLine`) |
| `client/src/components/Map/LocalMap.tsx` | 6,596 | Solids, room rendering, "Life" (people going about), search officers, building and ground, district fight, room fight, starship fight, system view | rooms; life/people; search; site/ground; three fight scenes; system view |
| `client/src/components/Map/models.tsx` | 6,366 | Fur, hull materials, colours, furniture, architecture, caches, street and wild, ships and speeders, people, droids, creatures, war machines, figure rings, settlement view, curved pieces | one file per family: furniture, architecture, vehicles, people, droids, creatures, war machines |
| `client/src/lib/stores/useCombat.ts` | 3,628 | Grapple/shove, dice and damage, attack choice, reactions, turn flow | dice; attack selection; reactions; grapple |
| `client/src/components/Map/babylon.ts` | 2,247 | Look tiers, camera, limb shaders, shader patches, scene mirror, LOD, renderer | look; camera; limb shader; scene mirror |
| `shared/logic/shooter.ts` | 2,160 | Numbers, dice, weapons, scopes, units/field, buffs, hurting, shooting, gear, frame step, foes, bolts/grenades | weapons/scopes; hurting; shooting; foes; frame step |
| `client/src/components/Map/siteAssets.tsx` | 1,886 | Asset library, door shapes, tags, trees, site building | library; trees; sites |
| `client/src/components/Map/FlightScene.tsx` | 1,631 | Course rings, scene, ground oil/terrain | course; scene; terrain |
| `shared/logic/dogfightSim.ts` | 1,509 | Dice, hulls, damage, aim, firing, foes, in-atmosphere air rules, party craft, shots, step | hulls; aim/firing; atmosphere; step |

## 6. Docs vs reality (spot-check; 22 items)

| # | Statement (source) | Reality | Verdict |
|---|---|---|---|
| 1 | "Read `REVIVAL_NOTES.md` first" and "`HANDOFF.md` in the repo root" (CLAUDE.md) | Root copies deleted; files are in `Archive/` (3 files) | **Contradicted** |
| 2 | Hosted on Oracle VM; `sudo systemctl restart sw5e` (CLAUDE.md) | `deploy/windows-start.ps1` is current; guide §1 says moved to Windows 2026-10-23 | **Contradicted/stale** |
| 3 | "No git identity is configured" (CLAUDE.md) | `git config`: Tombdbad / <the git config email> | **Contradicted** |
| 4 | "Work on branch `revive`" (CLAUDE.md) | work is on `main` (this audit on `audit`); `origin/revive` exists | **Stale** |
| 5 | Server loopback unless `HOST` set (CLAUDE.md) | `server/index.ts:78` `process.env.HOST \|\| "127.0.0.1"` | Confirmed |
| 6 | "~85 of 205 client files unreachable" (guide §10) | 56 of 234 | **Contradicted** |
| 7 | "36 datasets" (guide §1) | `manifest.json` lists 41 datasets; 41 `.json` files plus manifest | **Contradicted** |
| 8 | "9.5 MB" rules data; data version 199 (guide) | 9,688 KB; `dataVersion: 199` | Confirmed |
| 9 | 507 items, 1,918 enhanced, 271 monsters, 465 powers (guide) | equipment 507, enhancedItems 1,918, monsters 271, powers 465 | Confirmed |
| 10 | Line sizes: index 15.7k, GameBoard 11.4k, LocalMap 6.6k, models 6.4k (guide) | 15,749 / 11,375 / 6,596 / 6,366 | Confirmed |
| 11 | "~119k lines" (guide) | 121,295 lines in tracked ts/tsx under client/server/shared/tests | Roughly right |
| 12 | "~697 tests" (guide) | 700 `test(`/`it(` declarations (static count; **not run**) | Plausible, UNVERIFIED |
| 13 | LIFE version ~22 (guide) | `shared/logic/index.ts:2999` `LIFE = 22` | Confirmed |
| 14 | Gemma model `gemma4:e2b`, `think:false` (guide §7) | `server/dialogue.ts:17`, `:159` | Confirmed |
| 15 | Skills dir has mixar, septabee, sw5e-architecture (guide) | `.claude/skills/` has exactly those | Confirmed |
| 16 | Stairwell commit a658f7b is on `main` (guide §14) | `git branch --contains` lists `main` and `stairwell` | Confirmed |
| 17 | Babylon 9 draws, three builds (guide) | `@babylonjs/core 9.33.1` and three 0.170 both in `package.json`; `babylon.ts` is 2,247 lines | Plausible, mechanism UNVERIFIED |
| 18 | "No 2D maps; do not bring back SVG or flat plan" (CLAUDE.md) | `Map/RoomPlan.tsx` is a 2-`<svg>` flat plan, plus `sprites.tsx` still imported by it; unreachable today | **Violates the rule on disk** (dead) |
| 19 | "`lib/sw5e/*.ts` are views over the rules data" (CLAUDE.md) | 6 of them (droids, exploits, monsters, npcs, vehicles, weaponProperties) are never imported | Partly stale |
| 20 | "tsc reports nothing, tests and tools included" (CLAUDE.md) | `tsconfig.json` include omits root scripts; **not run** this phase | Incomplete / UNVERIFIED |
| 21 | Notes B8: "two character stores `useCharacterStore.ts`" (Archive/REVIVAL_NOTES.md:970) | `useCharacterStore.ts` does not exist | Stale (fixed) |
| 22 | Notes: "unifiedSchema and compatSchema … used by some client code" (same line) | unifiedSchema yes; compatSchema nobody | Half true |

## 7. Safe-to-delete shortlist (nothing deleted)

| Path | Size | Why it seems safe | Confidence | How to double-check |
|---|---|---|---|---|
| `e2e/out/` | 244 MB | ignored test screenshots, recreated by `npm run e2e` | high | `git check-ignore e2e/out`; make sure no e2e run is active |
| `.cache/speech/` | 202 MB | ignored TTS cache; rebuilt on demand (first lines slower) | high | server running? ok either way; per guide §8 |
| `tools/refs/moodboard`, `species`, `cache`, `snips` | about 100 MB | ignored; re-fetched by `tools/refs/*.py` (needs network and Python; the guide says no Python on the PC) | medium | confirm the user still wants the reference images; `cache/wp-out/weapons.glb` might be a build output |
| `dist/` | 97 MB | rebuilt by `npm run build` | medium | do not remove while the production service runs from it |
| `compatSchema.ts` | 4 KB | no importer | high | `grep -r compatSchema` returns only itself |
| `lib/data/{backgrounds,classes,species}.ts` | tiny | no importer, 3 lines | high | grep imports |
| 33 unused `components/ui/*` | about 4,500 lines | no importer | high (but a future feature might want them) | re-run `reach.mjs`; `vite build` size check |
| `RoomPlan.tsx` (and `sprites.tsx` if nothing else needs it) | 153+ lines | forbidden 2D plan; unreachable. **`sprites.tsx` is also imported by LocalMap, GameBoard, Shooter, ModelGallery**, so keep it | high for RoomPlan | project rule: ask first before removing large code |
| other unreachable client files (section 3) | about 3,000 lines | no importer | medium | reach.mjs + check against `tests/` |
| `migrate.ts`, `migrations.ts`, `run-migrations.ts`, `verify-schema.ts`, `fixSpeciesData.{ts,js}`, `convertSpecies.ts`, `db-fix-script.js`, `bulkFormatSpeedFix.ts` | under 100 KB | unreferenced, Replit/Neon era | medium | grep `package.json`, deploy scripts and docs; ask the user |
| `.replit`, `replit.nix`, `attached_assets/` | under 0.1 MB | Replit-only | high | none |
| `generated-icon.png` | 1.06 MB | page uses `favicon.svg` | medium | grep for the name in client/server |
| `client/src/stores/` (empty dir) | 0 | empty | high | `ls` |
| `deploy/sw5e*.service`, timers, `backup.sh` | tiny | VM-only | low | the user must decide on Windows backups first |

## UNVERIFIED
- Largest files inside `node_modules` (scan timed out).
- Whether `npm test` really runs about 697 tests; whether `tsc` and `vite build` are clean (both are Phase 2).
- Which of the two campaign generators the UI uses today.
- Whether any code outside `client/src`, `server`, `shared` (e.g. `tools/*.mjs`) reads `generated-icon.png` or the legacy root scripts via a path string.
- The Babylon-draws/three-builds statement was checked only at the dependency level.
- The reach.mjs regex does not understand `import.meta.glob` or paths built from strings; none were found in `App.tsx`, but other files were not individually scanned for it.

## REMAINING
- None for the seven tasks. Phase 2 (type-check, build, tests, unused code, cycles) is the next step and would also settle the UNVERIFIED items above.
