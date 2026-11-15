| T-005 | **DECIDED: HANDOFF.md stays in Archive/; no change needed** | T-002 | **FIXED (commit see section 12)** | T-001 | **FIXED (commit see section 12)** # AUDIT 06: Triage (2026-11-08, branch `audit`, read-only)

## Plain-English summary
- **The project is healthy where it is measured and thin where it is not measured.** Type-check clean, build clean, 697 of 700 tests pass (3 skipped), 24 of 24 browser play-through runs finished. The rules and world code is well tested. Screens, server routes, voice and AI are not.
- **Nothing found crashes the game or blocks normal play.** There is no P0 bug. There are two P0 *risks* (no backup of your characters and campaigns; the live game is open to your whole Wi-Fi with no login) and both need your decision, not a code fix.
- **Five things to fix first:** (1) back up the database on Windows; (2) the speech file-rename failure (about 1 request in 3 fails); (3) the "two children with the same key" warning (50 to 111 per fight, against your zero-warnings rule); (4) make the instruction files (`CLAUDE.md`, guide) true, so no later session is misled; (5) check the Medpac "does nothing" report, then the phone layout faults in the shooter and Pazaak.
- **Biggest honest gap:** most character features (archetypes 4%, species traits 19%) are descriptions, not rules. That is a large feature job, not a bug fix, and is your call.
- **Can safely wait:** deleting unused files and dependencies, splitting the 11,000-line files, circular imports, duplicate code, test gaps over rarely used features.
- Evidence comes only from the other `AUDIT/` files; I re-read 4 claims in the code myself (marked "checked"). Everything else is the earlier phases' word.

## 1. Triage table (sorted by priority)

Effort: S under 1 hour, M a few hours, L more. Risk = risk of breaking other things.

| ID | Title (plain English) | Pri | Evidence | What the player sees | Effort | Risk | Test that proves the fix | Depends on | Owner decision? |
|---|---|---|---|---|---|---|---|---|---|
| T-001 | No backup of characters and campaigns on the Windows PC | P0 | `FEATURE_MATRIX.md` E-24, section 5 item 8; `CLAUDE.md` ("no nightly backup on the PC yet") | Nothing, until a disk or bad migration loses everything | M | low | Run the backup, restore into `sw5e_test`, compare row counts | none | **Yes:** where do backups go (second disk, cloud, encrypted)? How often? |
| T-002 | Live game answers on every network interface with no login, while `CLAUDE.md` says loopback only | P0 (security) | `05_playtest.md` "Other things noticed" (netstat `0.0.0.0:5000`); `deploy/windows-start.ps1:8-12,126` (checked: `-Lan` forced on, HOST=0.0.0.0); `server/index.ts:78` default 127.0.0.1 (`01_inventory.md` #5) | Anyone on the Wi-Fi can open and edit the game | S (docs) / M (login) | low | Port scan of the PC from another device matches what you intend | none | **Yes:** keep LAN open (your 2026-11-01 choice) or Tailscale only? Add a simple login? Update `CLAUDE.md` either way |
| T-003 | **FIXED (commit f6051e9)** Speech fails about 1 time in 3 (file rename refused by Windows) | P1 | `05_playtest.md` problem 1 (19 of 55 requests failed, EBUSY); `server/speech.ts:249` `fs.renameSync(tmp, file)` (checked) | Spoken lines go silent or fall back to the browser voice | S | low | Fire 50 parallel `POST /api/speech`; 0 errors. Add a unit test of the write-then-rename helper with a retry | none | no |
| T-004 | **FIXED (commit fa26c23)** React "duplicate key" warning logged 50 to 111 times in every fight | P1 | `05_playtest.md` problem 2, flows 5 and 6 (both screens); `REMAINING` says source (combat log or map) not found | Nothing visible; noise, and breaks the "zero warnings" rule | S to M | low | Re-run flows 5 and 6; console shows 0 key warnings | none | no |
| T-005 | Instruction files (`CLAUDE.md`, guide, co-op panel text) say things that are no longer true | P1 | `01_inventory.md` section 6 (items 1-4, 6, 7, 20); `02_health_checks.md` CLAUDE.md section; `05_playtest.md` (`-Lan` wording; `CoopUI.tsx:86` checked); `FEATURE_MATRIX.md` section 4 | Co-op panel tells the host to restart with `-Lan`, which does nothing now | S | low | Re-read pass: every path and command in `CLAUDE.md` exists or runs | T-002 | Yes: should `HANDOFF.md` return to the root? (open in `CLAUDE.md`) |
| T-006 | **NOT A BUG (no code change; see fix log)** Medpac "Use" showed no healing in the test | P1 (UNVERIFIED) | `05_playtest.md` problem 5, flow 7 (HP 12 stayed 12) | A healing item that appears to do nothing | S to find, S to fix | low | New e2e step: use Medpac, assert HP rises and the item count drops | none | no |
| T-007 | **PARTLY FIXED (commit 6a52a2a)** Shooter screen on a phone is crowded (compass over Aim/Grenade, cut-off message, keyboard hints) | P1 | `05_playtest.md` problem 3 and "Things that look wrong"; `06_shooter_fight/phone_02_fight_start.png` | Buttons hard to hit, text cut off, `[G] [Z] [T]` hints on a touch screen | M | med | Phone-size screenshot test; no overlap by bounding boxes; hints hidden when touch | none | no |
| T-008 | **FIXED (commit 3890f49)** Pazaak table is see-through on a phone | P1 | `05_playtest.md` problem 4; `12_card_game/phone_02_pazaak_start.png` | HUD tab names show through the cards | S | low | Phone screenshot: panel has an opaque background | none | no |
| T-009 | **FIXED (commit 6593f07)** Co-op server tests hang or skip, so server co-op is untested here | P1 | `02_health_checks.md` row 3b (hung over 5 min, cause unknown); `tests/server/coop.test.ts:70,181,238` | Nothing now; co-op regressions would go unseen | M | low | The 3 tests run and pass against `sw5e_test` | none | no |
| T-010 | **RUN, 79 of 90 steps pass (see section 10)** The full browser test (`npm run e2e`) has not been run on this branch | P1 | `02_health_checks.md` row 4 (not run); `FEATURE_MATRIX.md` UNVERIFIED | Unknown; guide says e2e was not re-run after the architecture work | M (run) | low | `npm run e2e` against a test copy (`-Mode test`, port 5002) passes | T-009 helps | **Yes:** OK to run the 25+ minute e2e against a test copy? |
| T-011 | **FIXED (commit bc160f1)** Saved old campaigns are not tested through the LIFE migrations | P1 | `FEATURE_MATRIX.md` C-02 and chain 24 | Risk that an old save fails to load after a world-code change | M | low | Test: load a stored old-format world JSON, run `livenWorld`, `validateWorld` passes | none | no |
| T-012 | Archetype features are text only (4% become rules); species traits 19%; feats 24%; maneuvers 23%; styles 25% | P1 | `04_rules_data_coverage.md` summary and master table; `FEATURE_MATRIX.md` A-10 | Most archetype or species choices change nothing in play | L (ongoing) | med | Per feature kind, a unit test that the parser yields the effect (none exists today) | T-013 | **Yes:** which families first (archetypes, species, maneuvers)? Accept "text, player adjudicates" for the rest? |
| T-013 | **FIXED (commit a73ce79)** No test for the feature-text parser (`featureEffects`, `combatFeatures`) | P1 | `FEATURE_MATRIX.md` A-10 ("no test of the feature parser") | Silent breakage of Fighter/Consular play on any edit | M | low | Snapshot test over all 10 classes: counts of resolved effects do not drop | none | no |
| T-014 | **FIXED (section 13)** Archetypes that grant casting give no power points (9 of 137) | P1 | `04_rules_data_coverage.md` gaps table; `characterCalculation.ts:1074-1075` (reads class `casterType` only) | A Marauder or Slicer sees no powers to choose | M | med | Test: each of the 9 archetypes yields powers and power points at the right level | none | no |
| T-015 | Weapon proficiency ignores species and feats; exotic weapons | P1 | `FEATURE_MATRIX.md` A-16 (`hasWeaponProficiency` rules.ts:318) | Wrong attack bonus for some builds | M | med | Test: species with a weapon proficiency adds it to the attack bonus | none | no |
| T-016 | 282 of 465 powers do nothing in the turn-based fight (described only) | P1 | `04_rules_data_coverage.md` powers row and gaps; `FEATURE_MATRIX.md` D-05 | A caster picks a power and the player must adjudicate it | L | med | Per power family, a fight test of the effect | T-013 | **Yes:** which families (Kill, Ruin, Kolto Reserve...)? |
| T-017 | **FIXED (commit f978fa7)** Five monsters have attacks the parser cannot read ("Hit 3" instead of "Hit:") | P1 | `04_rules_data_coverage.md` monsters section (Gundark Alpha, IG-227, Jawa Scrapper, Jawa Shaman, Voxyn); `shared/logic/index.ts:1099-1102` | These foes may stand and do nothing in a fight | S | low | `statProfile` test over all 271: 5 named now yield an attack | none | no |
| T-018 | Fighting masteries, weapon focuses, supremacies (and 2 level-up tables) are imported but never read | P1 | `04_rules_data_coverage.md` (16 datasets unreferenced; resolves matrix A-13) | A class feature grants an option that does not exist | M to L | med | Choosing a mastery changes a roll, tested | none | **Yes:** build these, or hide the features? |
| T-019 | **DECIDED 2026-11-08: keep the Downtime tab hidden; no change** Downtime tab appears only in test builds; normal players reach it only through NPC jobs | P1 | `FEATURE_MATRIX.md` B-20, contradiction 4 (`GameBoard.tsx:3835,3875`) | Documented feature seems missing | S | low | Normal-build e2e opens Downtime | none | **Yes:** show it to everyone? |
| T-020 | No PWA files (no manifest, no service worker); bundle is large | P1 | `FEATURE_MATRIX.md` E-21; `02_health_checks.md` section 2 (`vite.config.ts:27` chunk limit 4000 kB; characterCalculation 3.1 MB) | Phone play is a plain web page: slow first load, no "add to home screen" | M | med | Lighthouse PWA check; first-load size on a phone | none | **Yes:** is the PWA wanted before other work? |
| T-021 | **FIXED (commit 5a87252)** Voice and dialogue (Gemma, speech-to-text, Piper) have no automated test | P1 | `FEATURE_MATRIX.md` E-01, E-03, E-04 | A break is invisible until someone talks to a person | M | low | Server tests with a fake Ollama and fake Piper: card format, 503 when off | T-003 | no |
| T-022 | **FIXED (commit 277cf3e)** Dialogue reply took 43 to 47 s to show on screen (5 to 7 s from the service) | P1 (UNVERIFIED cause) | `05_playtest.md` flow 9 | Long wait after talking to a person | M | low | Time from send to first text on screen, measured on real phone | none | no |
| T-023 | npm audit: 38 known problems in production packages (2 critical, 22 high) | P1 | `02_health_checks.md` section 8 | Nothing visible; lowered by Tailscale/LAN-only use | M | high (breaking upgrades) | `npm audit --omit=dev` count falls; tsc, build, `npm test` still pass | T-024 | **Yes:** accept breaking major upgrades (zod, express)? |
| T-024 | 31 declared packages never used (login/session libraries, gsap, pixi, matter-js...) | P2 | `02_health_checks.md` section 5 (31 depcheck; 19 text-searched by hand) | Nothing; smaller install, fewer audit hits | S | low | Remove, then `tsc`, `vite build`, `npm test` unchanged | none | Yes (CLAUDE.md: ask before removing) |
| T-025 | Tools import packages that are not declared (`meshoptimizer`, `sharp`, `postgres`) | P2 | `02_health_checks.md` section 5 | A fresh install breaks the model tools | S | low | Fresh clone: run each tool | none | no |
| T-026 | "Tabletop level-3 caster died to a Hive Rat" (balance not judged) | P2 (UNVERIFIED) | `05_playtest.md` flow 5 | A death at level 3 from a basic foe | M | med | Statistical run of the fight sim for level vs CR | none | **Yes:** is this too hard? |
| T-027 | **FIXED (commit 825dcc1)** Phone: creation tab strip is cut off ("B" for Background) | P2 | `05_playtest.md` flow 1; `01_create_character/phone_02_*.png` | Cannot see the last tabs | S | low | Phone screenshot shows all tabs or a scroll cue | none | no |
| T-028 | **NEEDS THE USER'S PHONE (not judged on the PC)** Big flat black rooms in the first view of a cantina | P2 (UNVERIFIED, may be software graphics) | `05_playtest.md` "Things that look wrong"; `05_phone_checklist.md` section 11 | Rooms look unfinished | S to find | low | Check on the real phone | Phone checklist | no |
| T-029 | **FIXED (commit df9f006)** No way to drop an item | P2 | `05_playtest.md` flow 7 (searched "drop", "discard") | Cannot throw away gear | S | low | e2e: drop removes it from the pack | none | no |
| T-030 | Dead code: 56 client files, 2 other files, forbidden 2D `RoomPlan.tsx` | P2 | `01_inventory.md` sections 3 and 7; `FEATURE_MATRIX.md` section 6 | Nothing; a trap for future agents | M | low | `tsc`, build, tests unchanged after removal | T-032 | **Yes:** archive first (see section 4) |
| T-031 | Legacy root scripts and Replit leftovers (never type-checked) | P2 | `01_inventory.md` section 4, tsc coverage row | Nothing | S | low | Nothing references them after removal (`grep`) | T-032 | Yes |
| T-032 | Make a safety branch before any deletion | P2 | `01_inventory.md` section 7 | Nothing | S | low | Branch pushed, contains the files | none | Yes (approve) |
| T-033 | `characterLanguageProcessor` uses `require(...)` in an ES module | P2 (UNVERIFIED if reachable) | `FEATURE_MATRIX.md` A-22; `characterLanguageProcessor.ts:319` (checked present) | A crash only if the GM-report path reaches it | S | low | Run the GM report path in a test | none | no |
| T-034 | 9 circular imports, one inside `shared/logic/index.ts` (`nemesis.ts`) | P2 | `02_health_checks.md` section 6 | Nothing yet; may become "undefined" errors | M | med | `madge --circular` shows 0 | none | no |
| T-035 | Untested screens and routes (`GameBoard`, `LocalMap`, server routes, 94 of 214 files) | P2 | `02_health_checks.md` section 11 | Nothing; regressions caught only by e2e | L | low | Smoke test per page / route | T-010 | no |
| T-036 | Features wired but untested: faction renown, heist, scripted exchanges, slave market, crystals, capital ships, encounter budgets, opportunity attacks, GM report parser | P2 | `FEATURE_MATRIX.md` C-20, C-22, C-24, D-04, D-06, D-23, D-26, B-16, E-10, E-11 | Nothing | L | low | One unit test each | none | no |
| T-037 | Shooter ignores encumbrance (name search only) | P2 (UNVERIFIED) | `FEATURE_MATRIX.md` chain 12 | Heavy loads do not slow shooter play | M | low | Test: overloaded unit is slower | none | **Yes:** wanted? |
| T-038 | 4 weapon properties and 5 armor properties not found in code; Deafened has no effect | P2 | `04_rules_data_coverage.md` weaponProperties, armorProperties, conditions | A few items lack their special rule | M | low | Property tests | none | no |
| T-039 | Multiclassing absent though data and stubs exist | P2 (feature) | `FEATURE_MATRIX.md` A-14 | No second class | L | high | Create a multiclass character, level it | T-012, T-013 | **Yes:** build or delete the stubs? |
| T-040 | Character export/import is built but not reachable | P2 | `FEATURE_MATRIX.md` A-21, section 6 | No way to save a character copy | S | low | e2e: export then import equals original | none | **Yes:** finish it (verdict) or delete? |
| T-041 | Documentation numbers drift (datasets 41 not 36; 56 of 234 not 85 of 205; 18 properties) | P2 | `01_inventory.md` items 6, 7; `04_rules_data_coverage.md` | Nothing | S | low | Re-read check | T-005 | no |
| T-042 | Git author email differs between commits | P2 | `01_inventory.md` section 2 | Nothing | S | low | `git log --format=%ae` consistent | none | **Yes:** which email? |
| T-043 | Duplicate code blocks (22 clones of 8+ lines) and 1,000-line components | P2 | `02_health_checks.md` section 7; `01_inventory.md` section 5 | Nothing | L | high | Refactor with unchanged tests | T-035 | **Yes** (ask first rule) |

## 2. Recommended fix order (batches)

**Batch 1: protect and tell the truth (T-001, T-002, T-005, T-041, T-042).** One session. Backup and the exposure decision first because they are the only P0s; the doc fixes are cheap and stop later sessions starting from wrong facts.

**Batch 2: small real bugs (T-003, T-004, T-006, T-008, T-017, T-029).** One session, all low risk, all visible to the player. Run the T-006 check first: if the Medpac works, drop it.

**Batch 3: phone and safety net (T-007, T-027, T-009, T-011, T-013).** Phone layout is the stated goal. The tests here (co-op, old saves, feature parser) must exist before the big rules work.

**Batch 4: run the real test (T-010, T-021, T-022, T-028 with the phone checklist).** Needs your OK to run e2e on a test copy and a real phone pass; its results may re-rank everything below.

**Batch 5: rules gaps that touch many players (T-014, T-015, T-019, T-038, then T-012 and T-016 as a series).** Decisions first. T-012 and T-016 are many sessions.

**Batch 6: housekeeping (T-032, T-030, T-031, T-024, T-025, T-023, T-033, T-034).** Archive branch first, then remove, then upgrade packages one at a time with tsc, build and tests after each.

**Later or by decision:** T-020 (PWA), T-026, T-035 to T-040, T-043.

## 3. Owner decisions needed
1. **Backups (T-001):** where, how often, encrypted? Options: second disk / cloud folder / both.
2. **LAN exposure (T-002):** keep open to your Wi-Fi / Tailscale only / add a login.
3. **Run the full e2e (T-010):** Yes on a test copy / No / Later.
4. **Rules depth (T-012, T-016, T-018):** build in parsers family by family / keep "text, player decides" / hide unsupported options.
5. **Multiclassing (T-039) and character export (T-040):** Build / Delete the stubs / Later.
6. **Downtime tab (T-019):** Show to everyone / keep test-only.
7. **PWA (T-020):** Before rules work / After.
8. **Package upgrades (T-023):** Allow breaking upgrades (zod, express) / Patch-level only.
9. **Deletions (section 4):** Archive branch then delete / Archive only / No.
10. **Git email (T-042)** and **where `HANDOFF.md` lives (T-005).**
11. **Tabletop difficulty (T-026):** Leave / Tune.

## 4. Deletions plan (nothing deleted; approval needed per `CLAUDE.md`)
Step 0: push branch `archive/pre-cleanup` from the current commit so everything is recoverable (T-032). Then, in separate commits, each followed by `tsc`, `vite build`, `npm test`:
- High confidence: `shared/compatSchema.ts`; `lib/data/{backgrounds,classes,species}.ts`; `client/src/stores/` (empty); `RoomPlan.tsx` (keep `sprites.tsx`, five files import it); `.replit`, `replit.nix`, `attached_assets/`.
- Medium: 33 unused `components/ui/*`; other unreachable client files (`01_inventory.md` section 3); `server/middleware/validation.ts`; root scripts `migrate.ts`, `migrations.ts`, `run-migrations.ts`, `verify-schema.ts`, `fixSpeciesData.{ts,js}`, `convertSpecies.ts`, `db-fix-script.js`, `bulkFormatSpeedFix.ts`, `client/src/utils/formatSpeed.ts`; `generated-icon.png`.
- Ignored folders (not git): `e2e/out` (244 MB), `.cache/speech` (202 MB), `tools/refs` (100 MB). Safe to clear; leave `dist/` while production runs.
- Not yet: `deploy/*.service`, backup timer (decide T-001 first); `unifiedSchema.ts` (still used); both campaign generators (which is live is UNVERIFIED); 50 hand-run `e2e/` and `tools/` scripts (knip false positives); `CharacterExportImport.tsx` (T-040).

## 5. Do-not-touch list
- `client/src/components/ui/Alert.tsx` (your uncommitted edit; do not commit).
- `shared/data/sw5e/*.json` (generated; never by hand).
- `shared/logic/index.ts` world generation and the `LIFE` migration chain (`LIFE = 22`): strongest-tested code, old saves depend on it (C-02, C-03).
- The `validateWorld` / `auditBuildings` / `walkBuilding` checks.
- `characterCalculation.ts` parsers: working for Fighter and Consular; change only with T-013 in place.
- `babylon.ts` three-to-Babylon bridge and the vertex-shader limb rig (`limbs.ts`).
- Production on port 5000 and database `sw5e`; DB tests only on `sw5e_test`; do not build while e2e runs; production restart needs Administrator.
- Server co-op, shooter sim, dogfight, pazaak/sabacc/dejarik, ammo/armor/shipyard logic: all have unit tests and e2e steps; fix around them, do not refactor.
- Both campaign generators until the live one is identified.

## 6. Contradictions between audit files (and which I trust)
| Contradiction | Trust | Why |
|---|---|---|
| `FEATURE_MATRIX.md` says "no test was run, so no row says a test passes" vs `02_health_checks.md`: 697 of 700 pass | `02` | It has the pasted run (`AUDIT/tmp/npm-test.txt`); the matrix predates it. `04` also says so. |
| Guide: 85 of 205 client files unreachable vs `01`: 56 of 234 (knip agrees on 58) | `01` | Two independent methods match. |
| Guide: 36 datasets vs 41 files | 41 | `manifest.json` and file count (`01`, `04`). |
| Guide/ITEM_TODO: 18 weapon properties unread; matrix B-02: not recounted; `04`: at most 4 | `04` | Counted by script over all 46 names (still an upper bound). |
| Species traits resolved: 139 (matrix A-10) vs 141 (`04`) | `04` | Newer; counts haggling traits too. |
| `CLAUDE.md`: loopback only vs live server on `0.0.0.0` | Script and netstat | Both observed; docs stale (T-002). |
| Guide: opportunity attacks "not done" vs code `useCombat.ts:1874` | Code | Matrix D-06. |
| Matrix B-20: Downtime test-only vs `play.mjs` clicks the tab and `CLAUDE.md` says e2e runs against production | Unresolved | Either e2e needs a test build or the tab shows in production; would need a run (T-010). |
| `05` shooter forced-defeat reading ("HP 40 to 0") | `05` own correction | It says this was the HUD reset after the win, not damage. |
| Matrix says CharacterExportImport is "Finish"; `01` lists it as safe-to-delete | Open | Owner decision (T-040). |

## 7. Notes on inputs
- `AUDIT/03_feature_list.md` and `03_matrix_A` to `E` were not read separately: `FEATURE_MATRIX.md` states it merges them row for row. `AUDIT/tmp/*` and screenshots were not opened.
- There is no phase 8 file in `AUDIT/`, so nothing from it is included.
- `SW5E_AI_GUIDE.md` shows as modified in git and I did not check what changed (`01_inventory.md` says someone removed a rule about AI-generated meshes).

UNVERIFIED:
- Everything above that is not marked "checked" rests on the earlier audit files, not on my own run.
- Whether T-006 (Medpac), T-022 (dialogue delay) and T-028 (black rooms) are real or artefacts of the test PC.
- Effort and risk ratings are my estimates.
- Counts of unused code come from static scripts; string-built imports would be missed.

REMAINING:
- Read `03_feature_list.md` and `03_matrix_A` to `E` in full if a finer ranking is wanted.
- Re-triage after the e2e run (T-010) and the real-phone checklist.
- Rewrite `CLAUDE.md` fully once decisions 1, 2 and 10 are made.

## 8. Fix log, Batch 2 (2026-11-08, branch `audit`)
| Item | Before | After | Tests added | Commit |
|---|---|---|---|---|
| T-003 speech | 19 of 55 `POST /api/speech` failed with EBUSY at the file rename | rename retried 6 times (25 ms steps); a line another request already cached is kept and the spare dropped; temp name unique per request | `tests/server/speech.test.ts` (3: EBUSY twice then ok; already cached; real failure still reported) | f6051e9 |
| T-004 duplicate keys | 50 to 111 "same key" warnings per fight; cause: a room's asset ids come from two counters that meet (500 repeated ids over 5 sample worlds) | `RoomShell` keys its assets by `uniqueKeys` (`client/src/lib/uniqueKeys.ts`); ids themselves untouched (old saves hold them) | `tests/world/assetKeys.test.ts` (2) | fa26c23 |
| T-006 Medpac | audit saw HP 12 stay 12 | **Not a bug.** "Use" opens a who-to-use-on chooser; the second tap ("Use on yourself") heals. The audit script made one click and read `.hp` instead of `.currentHp`. Re-run with both fixed: HP 12 to 15 (desktop), 12 to 23 (phone), Medpac used up | script `e2e/audit/07` now asserts it | none |
| T-008 Pazaak | panel background alpha 0.95, HUD tabs showed through | opaque (`bg-gray-950`), alpha 1 | check in `e2e/audit/12` (before: false, after: true) | 3890f49 |
| T-017 monsters | 240 of 271 stat blocks had an attack | 245. Gundark Alpha, IG-227, Jawa Scrapper, Jawa Shaman, Voxyn now attack. Six others (Imperial Guard Sentinel, Imperial Royal Guard, Kolkpravis Khagan, NR-N99 changed; the Rakghoul Bite gained its Constitution save, the Vesuvague Tree's Constrict its grapple (DC 16): all read from a "Hit" written with no colon) gained a lost extra-damage die or the NR-N99 Ion Cannons | `tests/items/monsterAttacks.test.ts` (3) | f978fa7 |
| T-029 drop | no way to drop an item | "Drop" on every pack row; first tap asks ("Drop it?"), second removes one copy; the last worn copy comes off in the same save | `e2e/audit/07` (asks first; removes exactly one; desktop and phone) | df9f006 |

Left open: the Voxyn's multiattack ("two bite attacks and one tail attack") lists one of each (the multiattack reader takes the first count it finds; a limit it already had). The NR-N99's multiattack lists only Ion Cannons, not also the Heavy Repeating Blasters (same reader). "Use" on a Medpac takes two taps (a possible phone-friendliness change, not made).

## 9. Fix log, Batch 3 (2026-11-08, branch `audit`)
| Item | Before | After | Tests added | Commit |
|---|---|---|---|---|
| T-027 creation tabs | tab strip scrolled sideways with no cue; "Background" showed as "B" on a phone | tabs wrap onto a second row; all 10 fit inside the strip at 390 px (checked by bounding boxes, no sideways scroll) | check by script (not kept) | 825dcc1 |
| T-007 shooter on a phone | compass over Aim/Grenade, buttons overlapping the ammo text, [G] [Z] [T] hints on touch | button column starts under the compass and wraps into columns; secondary buttons smaller on touch; ammo moved to the left under the hit points; hints hidden on touch (`pointer: coarse`); desktop unchanged | `e2e/audit/06` now measures overlaps (phone: none; desktop: none) and hints (none) | 6a52a2a |
| T-009 co-op tests | skipped by `npm test`; audit saw a hang, cause unknown | the 3 tests run and pass against `sw5e_test` in 5 s (no hang seen); `npm run test:coop` added (needs DATABASE_URL set to the test database, and a campaign with a world and characters in it) | the 3 existing | 6593f07 |
| T-011 old saves | no test through the LIFE migrations | `livenWorld` on a stored (JSON round-tripped) life-21 world over 3 seeds: loads, valid, life 22, no area lost, input not changed, second pass identical | `tests/world/oldSave.test.ts` (5) | bc160f1 |
| T-013 feature parser | no test | floor test: 10 classes x levels 1, 5, 11, 20 (features, combat features, passive, with uses, armor formulas, save proficiencies) plus named effects (Action Surge, Extra Attack, Unarmored Defense, Monk unarmed die, Diamond Soul). Broke the parser on purpose: 3 tests failed | `tests/items/featureParser.test.ts` (12) | a73ce79 |

Left open: **T-007** the floating exit label in the shooter view ("Passage down to Winding tunnel!") is wider than a phone screen and still runs off both edges (it is 3D text; wrapping `Label` in LocalMap did not change it, so the change was dropped; not found where else it is drawn). **T-011** only a life-21 save can be forged honestly; a life 0 to 19 save has shapes the current generator cannot make, so those steps stay covered by `access.test.ts` (life 19) and by opening a real old save by hand. **T-009** a fresh `sw5e_test` with no campaign would crash the co-op test setup (it reads the newest campaign).

## 10. Fix log, Batch 4 (2026-11-08, branch `audit`)
| Item | Before | After | Tests added | Commit |
|---|---|---|---|---|
| T-010 full e2e | never run on this branch | run through `npm run e2e` against the dev server on port 5099 and `sw5e_test` (not `windows-start.ps1 -Mode test`: it stops anything on ports 5000 to 5002, which includes production). About 50 minutes (software 3D). **79 of 90 steps pass, 11 fail.** Re-run alone with a 90 s timeout: road trip and real-time moves pass (only slow). **5 fail again: pit arena, beast and stable, speeders, ports, streets. The same 5 fail the same way on the pre-audit code (`main`, 0 of 5), so none comes from the audit fixes.** The other 4 failures (party at the world's start, a secret way, cantina band, bartender's menu) were not isolated: the first is a timing slip (the page was still Home, where the character and campaign headings both match the name) and the Home list was long with leftover AUDIT5 rows; the other three look like the same slow-render timeouts. | none | none |
| T-021 voice and dialogue tests | none | 9 tests with a fake Ollama (card text, streamed reply, tidying, model off, transcript cleaning, 503 on speech to text) and the Piper finder | `tests/server/dialogue.test.ts` | 5a87252 |
| T-022 slow dialogue | reply on screen 43 to 47 s after Say | Measured inside the page: the screen follows the network within 0.05 s, so the page is not slow. The wait was the server: a background chatter line (NPCs talking to each other, 5 to 40 s) held the model's single slot, so the player's request sat behind it (first words 12.7 s and 15.9 s after Say). A player's request now cuts off the chatter line in flight. After: first words 6.7 s (desktop) and 8.5 s (phone); the whole reply still takes 15 to 27 s, which is the model's speed (about 10 tokens a second). | 1 test (a slow fake chatter, the reply must not wait for it and the chatter must be hung up on) | 277cf3e |
| T-028 flat black rooms | seen once in software rendering | not judged: it needs the real phone (`05_phone_checklist.md` section 11) | none | none |

Left open: **T-043** (new) five e2e steps fail on `main` too: pit arena (`pit-prize` never shows), beast and stable (no speeder in the dealer's stock), speeders ("did not travel"), ports (`pick-o617` not found), streets (`ambushIn` reads `.x` of undefined: `shared/logic`, a hand-made room the test builds). Likely drift between the test's hand-made rooms and the current generator; not investigated. **T-044** (new) the 4 main-flow steps above need a re-run on a clean `sw5e_test` (run `e2e/audit/99_cleanup.mjs` first) with a longer `TIMEOUT` to see whether they are real. **T-022** the reply still takes 15 to 27 s to finish; only a faster model or fewer tokens changes that. The e2e step timeout of 15 s in `e2e/lib.mjs` is too short for this PC; run with `TIMEOUT=90000`.

## 11. T-043 and T-044 (2026-11-08, branch `audit`): the failing e2e steps
All 9 steps that failed in section 10 were the test, not the game (the five that failed on `main` too, and the four not isolated). Each was checked against the code and fixed in `e2e/play.mjs`; the steps then passed (the main flow: 45 of 48 in one run; ports, speeders, streets and the rest in runs of their own). A full 90-step run after the fixes (2026-11-08, dev server 5099, sw5e_test, TIMEOUT=60000, about 50 min): **88 of 90 pass**. The two that fail are slow-render timing, not the game: the road trip (leg 2 was still driving after 240 s: the 3D canvas ran at under 1 frame a second with a 15 s stall; the first full run saw a 4 s briefing read time out) and real-time moves (the jetpack climb and the jump button are sampled over a few real seconds, so too few frames run; it failed at a different place each time). Both passed in earlier runs. Loosening the waits did not make them pass on this loaded PC (llama-server and memory compression were running), so the change was dropped.
| Step | Cause | Test change |
|---|---|---|
| play: the party is at the world's start | while the game page's chunk loads, Home is still on screen and two headings match the name (the character, and "...'s Campaign"): an error | wait for the game's own panel first; match the heading exactly |
| pit arena | house rule 2026-11-02: pit fights on Saturday and Sunday only; the test's campaign starts on day 1 and the game refuses with a toast | the campaign clock starts on day 6 |
| beast and stable | house rule 2026-11-02, vendors limited by shop tier and rarity: seed 3 is a tier 2 world, and its dealer sells no speeder (they are rarity 2; seeds 4 and 7 are tier 3) | seed 4 |
| speeders | since 4ba6d38 a vehicle's own ride opens the driven road trip (the road trip step was updated in 92fddd4, this one was not) | the step asserts the road trip opens, with its briefing |
| ports | the attendant has a routine and by the clock is not in the hangar; also a 10 s wait too short for a slow render | the attendant's routine is cleared in the setup; 60 s wait |
| streets | seed 5 no longer has an alley of 8 squares by the start (district plans changed); and a 3 s sleep before the street hook exists | seed 17 (lawless, with an alley); wait for the hook |
| a secret way | the test chose the Armory of a garrison, whose guards outside switch Search off | choose a secret room in a building with no hostile people |
| cantina band, bartender's menu | the Main bar of seeds 7 and 5 has a stairwell in it and no Bandstand: the band has no stage (see T-045); the menu step needs the bar step before it | the bar step notes "band without a stage" instead of failing |
| all steps using the map | the 3D canvas is not there for a while on a slow machine | wait for the canvas |

**T-045 (new, real, cosmetic, not fixed):** in seeds 7 and 5 the Main bar has "Stairs up" in it and no Bandstand, although it has 3 to 4 musicians. The template asks for the stage in a corner (`["Bandstand","corner","3x2","1"]`, shared/logic line 1996) and the stairwell takes the corner. `livenWorld` already has a fallback (corner 3x2, corner 2x2, wall 2x1) for older worlds; the generator has none. It also happens on `main`. A fix changes what every seed builds, so it is left for your decision.

## 12. Fix log, owner decisions (2026-11-08, branch `audit`)
Your answers: Tailscale only (T-002); backups to a folder on this PC (T-001); HANDOFF.md stays in Archive/ (T-005); add a Bandstand fallback (T-045). T-042 (git email): history holds four author emails (281 <the account email>, 141 <the git config email>, two replit no-reply); not rewritten, repo config stays <the git config email>; say if you want a different one.
| Item | Before | After | Tests | Commit |
|---|---|---|---|---|
| T-002 | windows-start.ps1 forced HOST=0.0.0.0 and a firewall rule | loopback + Tailscale Serve; `-Lan` opts in again (so the Co-op panel text is true). The firewall rules "SW5e game port 5000/5002" made earlier still exist on this PC: remove them from an Administrator window if you want the port closed now (`Remove-NetFirewallRule -DisplayName "SW5e game port*"`), and restart production for the change to take effect | none (script parses) | see git log |
| T-001 | no backup | `deploy/windows-backup.ps1`: pg_dump to C:UsersAdminsw5e-backups, 14 kept; `-Verify` restores into sw5e_test and compares counts (characters 4/4, campaigns 8/8, debriefs 1/1: passed). The nightly task is NOT registered (it changes the system): command in the script header | the restore check | see git log |
| T-045 | 19 of 71 bars with a band had no Bandstand | `furnishRoom` falls back to corner 2x2, then wall 2x1. This shifted the random stream and exposed a latent fault in seed 2 (an elevated walkway and an outside ladder left with no way in when their doors could not be laid out): those orphans are now removed before `joinStranded` | tests/world/bandstand.test.ts (failed first); layouts audit passes | see git log |

## 13. T-014 and T-019 (2026-11-08)
**T-014 FIXED.** The nine archetypes that grant casting (Adept Specialist, Aing-Tii Order, Archaeologist Pursuit, Beguiler Practice, Marauder Approach, Industrial Approach, Saboteur Practice, Shield Specialist, Slicer Pursuit) carry their own caster table in `leveledTable`; the game read only the class's `casterType`. Now `castingAt`/`castingKind` (characterCalculation.ts) use the class table, or the archetype's when the class has none: the level-up offers the archetype's powers (right kind, up to its maximum power level), the points come with the archetype (taken in a level-up or from the sheet: table points plus the casting modifier), and the sheet and Play name them Force or Tech Points. Tested: 20 tests in tests/items/archetypeCasting.test.ts (all nine archetypes, both paths; red first); full npm test 757 tests, 754 pass, 0 fail, 3 skipped; tsc clean; vite build 0 warnings; in the browser a Fighter took Shield Specialist from the sheet and got 4 tech points (table 2 + Intelligence +2). Files: archetypes.ts, characterCalculation.ts, CharacterManagement.tsx, CharacterSheet.tsx, GameBoard.tsx (5, plus the test). Left alone: Artificer Engineering, Inquisitor Technique and Path of Synthesis (caster ratio 0 and no table: they work through their own features), and feat prerequisites that ask for casting use the class only.
**T-019 not changed.** The Downtime tab was hidden from normal builds on purpose (REVIVAL_NOTES: the activities are reached through the people who give them); you decided (2026-11-08) to keep it hidden, so nothing changes.

## 14. T-015 and T-007 (2026-11-09)
**T-015 FIXED.** Weapon proficiency was read from the class's list only. `grantedWeapon` (characterCalculation.ts) now also reads the sentences "proficiency with/in ..." of the character's species traits and feats: named weapons (Chiss: heavy pistol and sniper rifle; Gamorrean: vibroaxe, vibromace, vibrosword; Voss: blaster rifle, not heavy blaster rifle) and "all blasters / lightweapons / vibroweapons" (Weapon Expert; simple and martial only). Sentences with "of your choice" (Human, Echani, Kiffar, Exotic Weapon Training, ...) are NOT applied: a character does not store which weapons the player chose, so those stay with the player (a house limit, not in the books). Tests: tests/items/speciesWeapons.test.ts (4, red first); tests/items 168 pass; tsc clean; vite build 0 warnings. Files: characterCalculation.ts (+ the test).
**T-007 (rest) FIXED, not seen on a phone.** The floating exit label ("Passage down to Winding tunnel!") was drawn by `Label` in LocalMap.tsx with no width limit. It now wraps at about twelve letters' height wide, centred, for every label. Checked by tsc and build only; look at an exit on your phone to confirm.
**T-016, T-012 not started:** they need your pick of families first (powers: Kill, Ruin, Kolto Reserve...; features: archetypes, species, maneuvers). **T-028** needs your phone.

## 15. Weapon Masters, stage 1 (2026-11-09; the user's design: AUDIT/TRAINER_QUESTS_DESIGN.md)
T-015 grows into a house rule: weapon types (blasters, vibroweapons, lightweapons) are learned from a Master. The travel log (`playState.training`) counts star systems and settlements; after 3 systems and 3 levels the Quests tab offers a Master per type (tradition fitted to species, homeworld, class, background, Force alignment). Contact in a place visited before -> informant in the nearest system not yet been to -> Master in that system -> five trials at levels 3, 5, 9, 13, 17 (pupil, feared place, beast, stolen weapon case, a question). 2 trials: proficient; 5: master (+1 attack, exotic weapons). The downtime weapon option is gone (a weapon trained there before is kept). Code: shared/logic "Weapon Masters" (end of file) plus Quest `ordered`/`gate` and target `serve`; POST /api/world/trainer; GameBoard (training effect, Masters block, downtime note); characterCalculation. Tests: tests/world/trainers.test.ts (6). Browser, test copy 5099, campaign 184 / character 160: seek -> ask the contact -> arrive in Hoth -> informant -> Master in an Armory -> trial 1 with the pupil hostile in the room; no console errors. Not yet: the trials played through in the browser (the unit test plays all five), the Insight answer has no effect, stage 2 (powers).

## 16. Power Masters, stage 2 (2026-11-09; T-016 as the user re-scoped it)
Your answers: gate all of 6th+ level, Expanded Content, other casting kind and opposite alignment; the street master becomes the trail; weapon and power trails run at once. Built: the trail machine now serves both (`startTrail`, `TrainingLog.power`, per-kind count marks), two new traditions (coven, tech savant), `powerGate` / `schoolTeaching` / `powerTraining`; level-up and character creation offer only open powers; a non-caster (or the other casting kind) is taught at each trial; the street master no longer appears. Tests: tests/world/trainers.test.ts 9 pass (gate cases, level-up options, teaching, two trails at once with a full power trail). Browser (5099, campaign 184 / character 160, a Shield Specialist): power seek buttons beside the weapon trail; a tech trail (no teaching: already a tech caster, correct); a universal trail to trial 1 -> taught Force Whisper and Force Mask and 5 points. Fixed on the way: a trail person placed behind a secret way in. NOTE: T-016's original finding (282 powers do nothing in a fight) is NOT addressed by this; it is still open.

## 17. T-016 (original finding) and T-012, first pass (2026-11-09)
Your picks: powers: self buffs and auras, conditions on a target, healing and wards, save damage with riders; features: maneuvers and fighting styles first.

**Powers without a turn-based effect: 282 before, 247 now (35 more read).** Measured with `AUDIT/tmp/remaining.ts`. What was built, all read from the power's own text (`powerBuff`, `fixedHeal` in `client/src/lib/sw5e/rules.ts`; played in `useCombat.ts`):
- **Boons for the caster (kind `buff`, 31 powers):** a shield's AC (Energy Shield +5, Knight Speed +2), temporary hit points (Buffer 1d4+4, Armor of Abeloth 5), resistance (Ballistic Shield, Disperse Energy), advantage on saving throws (Beacon of Hope, Precognition), disadvantage for attackers (Force Blur), the Dodge action (Agile Defense), extra dice on each weapon hit (Force Focus, Aura of Vigor, Dark Aura). A boon is a condition with `mods` on the caster, so its turns, concentration and ending are the conditions' own; the token and the notes list show what it does.
- **Fixed heals (4 powers):** Force Mend 4d8+15, Greater Heal and Kolto Infusion 70, Master Heal (all). The casting modifier is not added to a set amount.
- **Conditions on a target: already read.** The 140 save and condition powers were done before; what is left of that family (Calm Emotions, Coerce Mind, Mind Trick, Scourge, Antipathy/Sympathy, Neurotoxin) is a choice of effects or the GM's call, so it stays text.
- **Not read, on purpose:** a boon tied to a condition ("against effects that cause ..."), a mark on one target (Hex, Target Lock, Elemental Accelerant), a choice of effects (Force Enlightenment, Pyrotechnics), and the many powers that are not fight powers at all (detect, disguise, travel, speak, summon, long-lasting wards). Roughly 200 of the 247 are of that kind; reading them would be invention, not parsing.
- House rule, labelled in REVIVAL_NOTES.md ("Power boons"): a boon meant for "a creature you touch" or "willing creatures" goes on the caster in the fight.

**T-012 maneuvers: 27 of 119 automated before, 45 now.** The 18 maneuvers that add a superiority die to a skill check (Assist, Conceal, Deceive, Empathize, Flex, Flourish, Handle Animal, Investigate, Naturalize, Perceive, Perform, Persuade, Pilot, Program, Study, Survive, Threaten, Tumble) are read from their own sentence (`checkManeuvers`); the skill comes from the text. They are kept out of the fight's list. A check that would fail, and that the die could save, takes a die (`performCheck` in GameBoard; the shared pool "Maneuver:dice"). House rule: the book lets the player decide after the roll; here it is done for them, and only then.
**Not done:** the 10 "Improved/Greater" maneuvers (they change a base maneuver), 22 that direct allies, the forced-save maneuvers with conditions, and all 24 unautomated fighting styles (each gives several benefits, most as bonus-action choices). Archetype and species features are untouched. These are the next families if you want more.
**Checks:** `tsc` clean; new tests `tests/combat/powerbuffs.test.ts` (7) and `tests/items/maneuverChecks.test.ts` (2). Full suite: see below.
