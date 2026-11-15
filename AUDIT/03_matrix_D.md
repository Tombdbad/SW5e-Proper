# AUDIT 03b: Feature trace, AREA D (Combat & vehicles), 2026-11-07, branch `audit`, read-only

## Plain-English summary
- 28 features traced. **WIRED 21, PARTIAL 6, MISSING 1, DEAD 0, UNKNOWN 0.** (PARTIAL: D-04, 05, 06, 23, 25, 26; MISSING: D-16.)
- Combat is heavily tested: `tests/combat/` (63 tests by `test(` count), `tests/ships/` (46), `tests/games/` (34), and the item-fight rules in `tests/items/fightrules.test.ts` (10). Six browser scripts drive fights (`shooter*.mjs`, `mode-tabletop.mjs`, `fight-view.mjs`, `followers.mjs`) plus play steps 18, 31, 37, 44, 45, 48-51.
- Status rule is the same as areas B and C: a unit test or a browser step that checks the result counts as a test. Nothing was run in this session.
- **Five most important problems:**
  1. **The guide is wrong about opportunity attacks.** GUIDE §11 lists them as not done. The tabletop fight implements them: `provoke()` in `client/src/lib/stores/useCombat.ts:1874-1888`, with a "disengage" that cancels them (`useCombat.ts:3009`). No test mentions "opportunity" (D-06).
  2. **The ship heist (taking a ship that isn't the party's) has no test and no browser step**: `startHeist`/`heistStep`/`takeShip` are called only from `GameBoard.tsx` (D-26).
  3. **Mounted combat does not exist** (D-16; matches the guide).
  4. **Encounter generation (`rollEncounter`, `encounterResult`) and the encounter budget have no direct test** (`encounterBudget` LI:701 is used only inside `shared/logic/index.ts`). The guide says budgets use 5e numbers (D-04).
  5. **Crew roles in starship fights**: seats exist (`shipSeats`, called from `GameBoard.tsx` only, no test); the guide lists crew roles in starship fights under unfinished co-op work (D-25).
- Nemesis system has 13 unit tests but **no browser step** (grep for "nemes" in `e2e/` finds nothing) (D-13).

## Matrix

| ID | Feature | Data | Logic (path:line) | Server | UI (component) | Reachable? | Test(s) | Browser-verified | Status | Evidence / notes |
|---|---|---|---|---|---|---|---|---|---|---|
| D-01 | Tabletop combat | `conditions.json`, stat blocks | `useCombat.ts` (store); `dyingDamage` :1095; `provoke` :1874 | PATCH character | `PlayCombat.tsx`, `FightScene` in LocalMap | YES (Play; mode "tabletop") | `tests/items/fightrules.test.ts` (10), `combat/nodice.test.ts` (4) | YES: play steps 18, 31, 45; `mode-tabletop.mjs` | **WIRED** | |
| D-02 | Dice and dice roller | n/a | `lib/sw5e/dice.ts`, `useDice.ts` | n/a | `DiceRoller.tsx`, `dice.tsx` (3D table dice) | YES | `tests/dice/tableRolls.test.ts` (7) | YES: play step 69 (the player picks who rolls and with which skill) | **WIRED** | |
| D-03 | Stat blocks in a fight (271) | `monsters.json` (271) | `statProfile` LI:945 (used inside LI; tested via `fightrules.test.ts`) | n/a | `PlayCombat` | YES | `fightrules.test.ts` ("a stat block's grapple is read with its escape DC") | YES: play step 18 "the fight uses their stat block" | **WIRED** | Share of the 271 whose actions are read: not measured. |
| D-04 | Encounters and budgets | `monsters.json` | `encounterBudget` LI:701, `rollEncounter` LI:10496, `encounterResult` LI:10452 | n/a | GB (street encounters) | YES | **none** | YES: play steps 18, 63, 64 (encounter on the street, a gang) | **PARTIAL** | No direct test; budget uses 5e numbers (GUIDE §11). |
| D-05 | Powers in tabletop combat | `powers.json` (465) | `castPower` in `useCombat.ts` / `PlayCombat.tsx`; `realtimePowers.ts` | n/a | `PlayCombat` | YES | `realtimepowers.test.ts` (2), `fieldgear.test.ts` | YES: play step 37 (powers chosen in creation are cast in a fight), 38-39 (Force Push/Pull) | **PARTIAL** | GUIDE §11: ~283 of 465 "only cast and described". Not independently counted. |
| D-06 | Cover, range, opportunity attacks, area powers | PHB | `provoke` useCombat.ts:1874 (opportunity attacks), 26 mentions of "cover" in `useCombat.ts` | n/a | `PlayCombat` | YES | cover: `fightrules.test.ts` (penetrating reduces cover step); **opportunity attacks: no test**; area powers: UNVERIFIED | NO | **PARTIAL** | **Contradiction with GUIDE §11** (opportunity attacks "not done"): they are in code. Area powers not checked. |
| D-07 | Gear in a fight | `equipment.json` | `useCombat.ts`, `gear.ts`; grenades, mines, medpacs | n/a | `PlayCombat`, GB | YES | `fightrules.test.ts`, `ammo.test.ts` (7), `consumables.test.ts` | YES: play steps 40 (medpac, kit), 44 (a grenade hits two) | **WIRED** | |
| D-08 | Shooter mode (real-time) | n/a | `shared/logic/shooter.ts`: `newSim` :668, `step` :1478, `firePlayer` :932, `reloadPlayer` :974 | n/a | `Shooter.tsx`, `ShooterHud.tsx` | YES | `combat/shooter.test.ts` (27), `aim.test.ts` (6), `shooterview.test.ts` (2) | YES: `shooter.mjs` (fire, reload, grenade, saber, guard, end) | **WIRED** | |
| D-09 | Mode choice per campaign | n/a | `modeOf` shooter.ts:13 (callers: GB, shooter.ts) | PATCH campaign `specialRules.mode` | mode dialog after world generation | YES | `shooter.test.ts` | YES: `mode-tabletop.mjs`, `shooter.mjs` | **WIRED** | |
| D-10 | Shooter gear and powers | equipment, powers | `applyGear` shooter.ts:1261, `castPower` :994, `gunOf` :213, `grenadeOf` :257 | n/a | `Shooter.tsx` (keys 1-4) | YES | `shootergear.test.ts` (13), `shooteritems.test.ts` (10), `realtimepowers.test.ts` | YES: `shooter-extras.mjs` (powers on keys 1-4, crouch, a foe in a wall) | **WIRED** | Only the first 18 known powers are taken (`realtimepowers.test.ts`). |
| D-11 | Shooter AI and senses | n/a | `sees` shooter.ts:675, `route` :714, `noise` :911, `step` | n/a | `Shooter.tsx` | YES | `shooter.test.ts` (27) | YES: `shooter-defeat.mjs` (the stuck-enemy bug) | **WIRED** | GUIDE §10.6: foes can stick behind walls (path-finding not done). |
| D-12 | Lightsaber play | `lightsaberForms.json` (20) | `swingPlayer` shooter.ts:1222; `interiors/saberplay.ts` | n/a | `Shooter.tsx`, FightScene | YES | `tests/interiors/saberplay.test.ts` | `moves.mjs` (gallery of saber styles: header comment) | **WIRED** | Enemy saber swings: not done (GUIDE §9.2). |
| D-13 | Nemesis system | n/a | `nemesis.ts`: `settleFight` :395, `tickNemeses` :633, `beginHunt` :710, `resolveMercy` :546 | stored in `galaxyMap.nemeses` | `NemesisPanel.tsx`, GB tab "Enemies" | YES | `combat/nemesis.test.ts` (13); `relations.test.ts` | **NO** (no e2e mentions it) | **WIRED** | Strong unit tests, no browser step. |
| D-14 | The watch (stealth detection) | n/a | LI:4826 | n/a | GB, LocalMap | YES | via `security.test.ts` (UNVERIFIED which test) | YES: play step 18 "enemies watch the party but do not bar the way" | **WIRED** | |
| D-15 | Companions | stat blocks | LI:8074 | PATCH character/campaign | GB companion panel | YES | `droids.test.ts` (4) | YES: play steps 41, 42, 44, 56 | **WIRED** | Single best attack, no companion leveling or powers (GUIDE §11). |
| D-16 | Mounted combat | n/a | no function found; "mounted" appears only in a road-ambush context | n/a | n/a | n/a | none | NO | **MISSING** | Matches the guide. |
| D-17 | Pit arena and betting | n/a | `pitbets.ts`: `boutsFor` :87, `settle` :105, `matchState` :174, `ticketFor` :257 | n/a | `PitBets.tsx`, `PitArena.tsx` | YES | `tests/games/pitbets.test.ts` (8) | YES: play step 50 | **WIRED** | |
| D-18 | Street and road fights | n/a | LI:11391; `roadFight` in GB | n/a | LocalMap, GB | YES | `roadchase.test.ts` (4), `roadtrip.test.ts` (12) | YES: play step 64 (gang), `roadblock.mjs` | **WIRED** | |
| D-19 | Starship stat blocks and sizes | `ships.json`, `starshipSizes.json`, `starshipDeployments.json`, `starshipVentures.json` | `shipSheet` LI:9195, `shipCombatant` :9445; `lib/sw5e/starships.ts` | `/api/sw5e/:dataset` | GB ship panel | YES | `shipyard.test.ts` (10) | YES: play step 51 | **WIRED** | |
| D-20 | Starship combat (turn-based) | rules starships | `startShipFight` LI:10165, `shipFire` :9792, `shipHelm` :9929, `shipAi` :10113 | n/a | `useCombat.ts`, 3D map | YES (ship in orbit) | `shipyard.test.ts` (imports `startShipFight`, `shipFire`); `shipAi`: none | YES: play step 51 (weapons, helm action, move, enemy turns) | **WIRED** | |
| D-21 | Dogfight (real-time space) | n/a | `dogfight.ts`: `dogfightStart` :938; `dogfightSim.ts`: `stepDogfight` :1116, `dogfightPayout` :1485 | n/a | `DogfightGame.tsx`, `/dev/dogfight` | YES | `ships/dogfight.test.ts` (30), `dogfightBot.ts` | YES: play step 48 | **WIRED** | |
| D-22 | Air battles in atmosphere | n/a | `airStart` dogfight.ts:1044, `groundVessel` :1018 | n/a | `DogfightGame.tsx`, GB | YES | `ships/airfight.test.ts` (8) | partly: step 48 is a space dogfight on a planet; defend/bomb/convoy modes: NO | **WIRED** | |
| D-23 | Capital ships, corvettes, station interior | n/a | `hullSpec` dogfight.ts:528, `makeVessel` :725 | n/a | `CapitalShip.tsx`, `Cockpit.tsx`, `StationInterior.tsx` | YES | `dogfight.test.ts` may use them via `dogfightStart`; **no test names `hullSpec` or `makeVessel`** | NO (GUIDE §11: spiral stair on a station not checked) | **PARTIAL** | |
| D-24 | Shipyard: mods, equipment, upgrades | `starshipModifications.json` (257), `starshipEquipment.json` (104) | `shipyard.ts`: `canInstall` :446, `installDC` :405, `modCost` :394, `partsStock` :582 | n/a | `ShipWorks.tsx` | YES | `shipyard.test.ts` (10) | YES: `works.mjs` | **WIRED** | |
| D-25 | Ship crew and seats | n/a | `shipSeats` coop.ts:298 (GB only), `crewIssues` :247, `SHIP_ROLES` :228 | `server/coop.ts` | `CoopUI.tsx`, GB | YES | `tests/world/coop.test.ts` (13: crew issues); `shipSeats`: none | NO | **PARTIAL** | GUIDE §10.11: crew roles in starship fights not done. |
| D-26 | Taking a ship that isn't the party's (heist) | house | `startHeist` LI:5741, `heistStep` :5749, `takeShip` :5776, `boardShip` :5653 | n/a | GB | YES | **none** | **NO** | **PARTIAL** | Wired (GB calls it), untested anywhere. |
| D-27 | Racing and convoy | house | `raceCourse` LI:13806, `stepRace` :14852, `raceResult` :14884; `convoyStart` :15497 | n/a | `MinigamePage` / FlightScene | YES | `convoy.test.ts` (3), `skies.test.ts`, `roadtrip.test.ts`, `roadchase.test.ts` use `stepRace` | YES: play step 49 (three-lap race, four rivals) | **WIRED** | |
| D-28 | Taxi, delivery, flying jobs | house | LI:13142 | n/a | FlightScene | YES | `water.test.ts` (names taxi) | YES: play step 47 (taxi run paid by rings) | **WIRED** | |

## Tally
WIRED: D-01, 02, 03, 07, 08, 09, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 24, 27, 28 = **21**.
PARTIAL: D-04, 05, 06, 23, 25, 26 = **6**. MISSING: D-16 = **1**. DEAD 0. UNKNOWN 0. Total 28.

## Contradictions
- GUIDE §11 "opportunity attacks" not done vs `useCombat.ts:1874-1888` (D-06).
- GUIDE §4 says "217 weapons played in fights"; not independently counted here (B-02 gives the property reading status).

## UNVERIFIED:
- No test or e2e was run; no pass/fail claim.
- Which tests cover the watch (D-14), area powers (D-06), and what `dogfight.test.ts`'s 30 tests assert about capital ships.
- How many of the 271 stat blocks have every action read.
- Defend/bomb/convoy air-battle modes in a browser.
- Contents of the `e2e/*.mjs` files beyond their header comments and step titles.

## REMAINING:
- Read the 30 dogfight tests' titles to settle D-23.
- Read `provoke` and `disengage` to see if reach and flying (`flyby`) are right.
- Check whether the heist is reachable in the normal build: it is wired in `GameBoard.tsx` but I did not follow the menu path.
