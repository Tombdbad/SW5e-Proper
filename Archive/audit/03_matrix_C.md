# AUDIT 03b: Feature trace, AREA C (World & exploration), 2026-11-07, branch `audit`, read-only

## Plain-English summary
- 30 features traced. **WIRED 25, PARTIAL 4, MISSING 1, DEAD 0, UNKNOWN 0.** (PARTIAL: C-02, 20, 22, 24; MISSING: C-30.)
- This is the best-tested part of the game for *building* things: 18 unit-test files in `tests/world/` (about 113 tests by `test(` count) and a 70-step browser play-through (`e2e/play.mjs`) that generates 25 worlds and validates each one against the rules data, creates a campaign, walks the 3D map, trades, rests, travels, mines and races.
- **Status rule used (same in all areas):** WIRED = data + logic + UI + reachable from the Home screen + at least one test that checks the effect (a unit test, or a browser step that checks a result). PARTIAL = something is missing (say which). I did not run any test; "has a test" means the test exists and its title or steps match, not that it passes.
- **Five most important problems in this area:**
  1. **Many gameplay rules exist only inside `GameBoard.tsx`.** Passage fares, hangars, quest advancing, search by the law, slave market, scripted exchanges and the clock are called only from that one 10,000-line component and have no unit test (their coverage is the browser script only) (C-07, C-15, C-22, C-24).
  2. **Faction renown (`factionInfluence`) has no test** and is changed in six places in `GameBoard.tsx` (C-20).
  3. **Scripted exchanges ("a few, to be filled out later")** are wired but thin by the code's own comment (`shared/logic/index.ts:6280`) (C-24).
  4. **The guide's list of browser checks not done** (drum walls at several radii, tube walkway, spiral stair on a station, beast sizes) matches areas where `e2e` files exist but the guide says the check was not made (C-11, C-29). I did not re-run them.
  5. **Older saved campaigns** lack genders and families, and need the `livenWorld` migration; tests call it on fresh worlds, but I found no test that loads a *real old save* (C-02, C-30).
- Integration note: the world generator is deterministic and validated in the e2e on 25 seeds (`play.mjs` step 2), which is strong evidence the generator and the rules data agree.


## Matrix

| ID | Feature | Data | Logic (path:line) | Server | UI (component) | Reachable? | Test(s) | Browser-verified | Status | Evidence / notes |
|---|---|---|---|---|---|---|---|---|---|---|
| C-01 | World generator (galaxy→room) | `lookups.json`, `monsters.json`, `equipment.json`, `travel.json` | `generateWorld` LI:1736 | `POST /api/world/generate` sw5eRoutes.ts:62 | `CampaignGenerator.tsx` in `CampaignView.tsx:119` | YES: Home "Create campaign" link (Home.tsx:98) | used by ~10 test files (`decks`, `layouts`, `city-planets`, `round`, `doors`, `floors`...) | YES: play step 2 (25 seeds, all sound), step 8 | **WIRED** | |
| C-02 | Expand / populate / liven / editor | same | `expandArea` LI:1846, `populateArea` LI:1861, `livenWorld` LI:3000 | `/api/world/expand`, `/populate`, `/liven`, `/occupant`, `/gang` sw5eRoutes.ts:94-116 | world editor panel (`CampaignManager.tsx`, uses `validateWorld`) | YES | `expand.test.ts` (1); `livenWorld` in `access`, `layouts`, `round`, `droids` tests; **`populateArea` and `/gang` have no test** | YES: play steps 10-13 (place a stat block and cache, add a room, refuse a cut, "an unvisited planet is built on demand") | **PARTIAL** | No test of loading a real old save through the LIFE migrations. |
| C-03 | World validation and building audit | rules data | `validateWorld` LI:7227, `auditBuildings` :7300, `walkBuilding` :7486 | `POST /api/world/validate` sw5eRoutes.ts:123 | `CampaignManager.tsx` | YES | `access`, `layouts`, `windows`, `round`, `expand`, `showcase` tests | YES: play step 2, 12 | **WIRED** | Strongest-tested item in the game. |
| C-04 | Campaign create/list/delete | n/a | store `useCampaign.ts`; `campaignGenerator.ts` | `/api/campaigns` routes.ts:175-262 | `CampaignView.tsx`, `CampaignManager.tsx`, Home | YES (`/campaigns/create?characterId=`, Home.tsx:98) | none unit | YES: play steps 8, 9, 16, 70 (delete) | **WIRED** | The link goes to `/campaigns/:id` with id "create" (App.tsx:98-99); works in the e2e (play:198, 255). |
| C-05 | Galaxy, system, planet map views | generated world | `GalacticMap3D`, `SystemMap`, `PlanetGlobe`/`globeOf` | n/a | `/map` (`GalacticMapView.tsx`) from Home.tsx:180; in play, double-tap drill-down | YES | none unit | YES: play step 30 "double taps open galaxy > system > planet > settlement > building" | **WIRED** | `/map` page itself: not opened by e2e (UNVERIFIED). |
| C-06 | Hyperspace and sublight travel | `travel.json` (4 keys) | `jumpsBetween` contracts.ts:162; "Travel" LI:5785; `journeyMinutes` LI:8422 (no callers outside LI) | PATCH campaign | GB exits, `FlightScene`, orbital party craft | YES | `roadtrip.test.ts` (12, roads); jump planning: UNVERIFIED | YES: play step 20 "travel along a path, kept after reload", 23 | **WIRED** | |
| C-07 | Passage off world (fares) | house | `passageOffers` LI:5486, `passageFare` LI:7051 (GB only) | n/a | GB exits "Take off ... by shuttle" | YES | none unit | YES: play step 23 (fare charged, "by shuttle") | **WIRED** | Logic only reachable through GameBoard. |
| C-08 | One continuous 3D local map | n/a | `LocalMap.tsx`, `babylon.ts` | n/a | `LocalMap` in GB | YES | `tests/interiors/babylon.test.ts`, `walls`, `floors`, `doors` etc. | YES: steps 27-31, `interiors.mjs`, `walls.mjs` | **WIRED** | |
| C-09 | Settlements, districts, sites | house | `districtsOf` LI:10246, `planDistrict` :10830, `planDistricts` :11385; `siteAssets.tsx` | n/a | LocalMap | YES | `layouts.test.ts` (4) | YES: play step 59, 60 | **WIRED** | |
| C-10 | Buildings, floors, stairwells | house | `planBuilding` LI:4098; stair blocks LI:2277 | n/a | LocalMap | YES | `stairs.test.ts` (3), `decks.test.ts` (2), `layouts.test.ts` | YES: play step 3, `stairs.mjs` | **WIRED** | |
| C-11 | Round buildings, tree/stilt villages, water worlds | house | `footprint.ts`, LI:15356 (water), architecture kit | n/a | LocalMap | YES | `tests/interiors/round.test.ts`, `footprint.test.ts`, `tests/world/water.test.ts` (8), `city-planets.test.ts` (5) | PARTIAL: `walls.mjs` exists; the guide (§11) says drum walls at several radii and the tube walkway were **not** checked in a browser | **WIRED** | Browser claim limited. |
| C-12 | Windows, balconies, rooftops | house | LI:2353 (windows), LI:10756 (balconies) | n/a | LocalMap | YES | `windows.test.ts` (2) | `walls.mjs` (windows on a round room) | **WIRED** | |
| C-13 | Caves, tunnels, vaults | house | `caves.ts` (`caveMask` :216), `tunnel.ts`; `interiors/cave.ts`, `CaveRoom.tsx` | n/a | LocalMap (imports `CaveRoom`, LocalMap.tsx:23) | YES | `caves.test.ts` (4) | NO (no cave step found) | **WIRED** | `makeTunnel` is called by `dogfightSim.ts` (the dogfight tunnel), not by the world. |
| C-14 | Arena district | house | LI:3965; `pitbets.ts`; `PitArena.tsx` | n/a | PitArena, PitBets | YES | `tests/games/pitbets.test.ts` | YES: play step 50 (a bout on the 3D arena) | **WIRED** | |
| C-15 | Hangars and ships coming/going | house | `hangarsOf` LI:6906, `hangarOpen` :6917 (GB only) | n/a | GB, LocalMap | YES | none unit | YES: play steps 57, 58, 61, 62 | **WIRED** | |
| C-16 | Skies, horizons, day/night | house | `landformsOf` LI:15255 (scenery.tsx); `WorldSky` | n/a | LocalMap | YES | `skies.test.ts` (5) | partly: step 32 (clock shows era) | **WIRED** | |
| C-17 | World clock, eras, routines | house | `eraOf` LI:643, `lawAt` LI:652, routines LI:6321 | `timeElapsed` in campaign (GB:727-732) | GB clock | YES | `security.test.ts` (8) | YES: play steps 32, 35 | **WIRED** | |
| C-18 | People: homes, jobs, errands, families | house | LI:915, 6321; `families`, `errands` | n/a | LocalMap Life | YES | `relations.test.ts` (9), `layouts` | YES: play step 33, 63 | **WIRED** | Old saves lack genders/families (GUIDE §10.10). |
| C-19 | Regard, reputation, kin | house | `regardOf` relations.ts:77, `bump` :83, `reputation` :92, `sheetFor` :148 | n/a | `TalkPanel.tsx`, GB | YES | `relations.test.ts` (9) | NO | **WIRED** | |
| C-20 | Factions and standing | house | `addRenown` (LI), used GB:1580,1906,1962,1989,2875 | `factionInfluence` in campaign PATCH | GB trade tab (renown, dealings) | YES | **none** (`addRenown` imported by no test) | NO | **PARTIAL** | Used and saved, but no test. |
| C-21 | Law, crime, security | house | `lawAt` LI:652, `lawSearch` :5963, `lawmenAt` :5396, `turnLawmen` :5409 | n/a | GB, LocalMap | YES | `security.test.ts` (8), `search.test.ts` (3), `access.test.ts` (12) | partly: step 32 shows the law; step 60 night locks | **WIRED** | |
| C-22 | Slave trade and stop-and-search | house | `slaveMarket` LI:6021 (GB only); stop and search LI:5979 | n/a | GB | YES | `search.test.ts` for the search; **none for `slaveMarket`** | NO | **PARTIAL** | |
| C-23 | Quests, jobs, contracts | house | `worldQuests` LI:7092, `advanceQuests` :7170 (GB only); `makeOffers` contracts.ts:189, `accept` :256, `progress` :322 | `worldQuests` called from sw5eRoutes (campaign create) | GB tab "Quests", jobs panel | YES | `contracts.test.ts` (10); `worldQuests` in `water.test.ts` | YES: play steps 9, 22 | **WIRED** | |
| C-24 | Scripted exchanges | house | `scriptsFor` LI:6317 (`RoleScript`, GB:6620 `runScript`) | n/a | GB (role scripts) | YES | none | NO | **PARTIAL** | The code says "a few, to be filled out later" (LI:6280). |
| C-25 | Economy: prices, rarity, stock | see B-05, B-17 | `stockOf`, `tradeTop`, `gearRarity` | n/a | Trade tab | YES | `vendors.test.ts` | YES: play step 34 | **WIRED** | Cross-reference to area B. |
| C-26 | Bases | house | `claimBase` bases.ts:131, `setDown` :145, `store` :191 (`foundBase` :121 has no outside caller) | stored in world | GB (`claimBase`, `setDown`), LocalMap `piecesIn` | YES | `bases.test.ts` (5) | `bases.mjs` (28 mentions of "base") | **WIRED** | |
| C-27 | Road trip | house | `planTrip` roadtrip.ts:44, `legCount` :30, `blockPursuit` :115 | n/a | GB, FlightScene | YES | `roadtrip.test.ts` (12), `convoy.test.ts` (3), `roadchase.test.ts` (4) | YES: play step 54, `roadblock.mjs` | **WIRED** | |
| C-28 | Ground transport, mounts, sea crossings | `transport.json` | LI:8380, 15408 | n/a | GB, LocalMap | YES | `water.test.ts`, `roadtrip.test.ts` | YES: play steps 52, 53 | **WIRED** | |
| C-29 | Jump, jetpack, hook, climb, gravity | house on PHB numbers | `gravityOf` LI:2534, `jumpReach` :2547, `jumpOf`, `fireHook` | n/a | LocalMap keys (Space, F, Shift), stick | YES | `jumping.test.ts` (7), `climbing.test.ts` (7) | YES: play step 55; `moves.mjs` | **WIRED** | Mount/climb animations not checked in a browser (GUIDE §11). |
| C-30 | Existing-world gaps (genders/families on old saves, chandler shop, witness interception, family-tree view) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | **MISSING** | From GUIDE §10.10; not re-verified. |

## Tally
WIRED: C-01, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 23, 25, 26, 27, 28, 29 = **25**.
PARTIAL: C-02, 20, 22, 24 = **4**. MISSING: C-30 = **1**. DEAD 0. UNKNOWN 0. Total 30.

## Contradictions
- GUIDE §4 says worlds are migrated by "LIFE versions, currently ~22"; I did not find the current number (UNVERIFIED).
- GUIDE §11 lists browser checks not done (C-11, C-29) while `e2e/walls.mjs`, `stairs.mjs` exist; they cover some of it (round-room doors/windows, stairs) but not drum walls at several radii.

## UNVERIFIED:
- Nothing was run: no test or e2e pass/fail claim.
- Contents of `e2e/interiors.mjs`, `walls.mjs`, `roadblock.mjs` beyond their header comments.
- The `/map` page opening; `journeyMinutes` use (no outside callers; called inside `index.ts`, not checked).
- Caller analysis found callers outside `shared/logic/index.ts` only; functions used inside that 15,000-line file by other functions are not shown.
- The current LIFE version number.

## REMAINING:
- Check `e2e/play.mjs` steps 3, 12, 20 in detail for what they assert.
- Look for a test using a real saved old-format world.
- Count tests per function for the `GameBoard`-only functions.
