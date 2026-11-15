# AUDIT 03a: Master feature list (2026-11-07, branch `audit`, read-only)

## Plain-English summary
- This is a **list only**. It says what the game has, or is meant to have. It does **not** say whether each thing works (that is Phase 3b).
- 128 features in five areas: **A Character 22, B Items & gear 24, C World & exploration 30, D Combat & vehicles 28, E Social, AI & systems 24**.
- I built the list from file and section **names, headings and exported function names** (grep and directory listings), plus the guide and the archived notes. I did **not read function bodies**. So "where found" proves the feature has a name in the code or docs, not that it is complete. Rows that rest only on a document are marked `(doc)`.
- 14 rows are labelled `PLANNED/NOT DONE (doc says)`. Only 4 rows are labelled `UNDOCUMENTED` (A-21, A-22, C-26, E-23: seen in code, not named in the guide's section 4). That is a low number because I worked mostly from the guide's own headings; a deeper pass on `client/src/lib/sw5e/*.ts` would likely find more.
- One contradiction found: the guide (section 11) says multiclassing is a rules gap. A grep for "multiclass" in `characterCalculation.ts` and the CharacterManagement components found **nothing**, which agrees. But `multiclassImprovements.json` (10 entries) is imported, so the data is there and the feature is not wired (row A-14).
- Another: the guide says "36 datasets". `shared/data/sw5e/` holds **41** JSON files (the guide's number may exclude manifest/lookups/derived files; not resolved).
- Row format: `ID | feature | description | rules source | entry point | where found`. "Entry point" is the first place to look, taken from names; it is not a tested route.

Abbreviations: GB = `client/src/pages/GameBoard.tsx`; LI = `shared/logic/index.ts`; CC = `client/src/lib/sw5e/characterCalculation.ts`; RN = `Archive/REVIVAL_NOTES.md`; GUIDE = `SW5E_AI_GUIDE.md`.

---

## A: Character (22)

| ID | Feature | Description | Rules source | Entry point | Where found |
|---|---|---|---|---|---|
| A-01 | Character creation wizard | Step-by-step builder, saves to DB | species/classes/etc. datasets | `/characters/create` (`CharacterCreation.tsx`, `components/CharacterCreation/*`) | App.tsx:94; GUIDE §4 |
| A-02 | Species (141 entries) | Picks species, ability bonuses and traits | `species.json` | `SpeciesSelection.tsx`, `lib/sw5e/species.ts` | dataset count; GUIDE §4 |
| A-03 | Classes (10) | Class choice and level table | `classes.json` | `ClassSelection.tsx`, `lib/sw5e/classes.ts` | dataset count |
| A-04 | Archetypes (137) | Subclass choice at the class's level | `archetypes.json` | `archetypeOptions`, `chooseArchetype` | CC:1042, 1049 |
| A-05 | Backgrounds (61) | Background skills/gear/personality | `backgrounds.json` | `BackgroundSelection.tsx` | dataset count |
| A-06 | Ability scores | Point buy / standard array / rolled; modifiers | PHB rules | `AbilityScores.tsx`, `getStandardAbilityArray` | CC:1191 |
| A-07 | Skills and tools proficiency (18 skills) | Skill picks, checks with proficiency | `skills.json`, `tools.json` | `SkillsSelection.tsx`; `abilityCheck`, `toolRoll` | RN "Gathering and materials" |
| A-08 | Feats (119) with prerequisites | Pick feats at ability-increase levels, prerequisites checked | `feats.json` | `FeatsSelection.tsx`; `featPrerequisiteUnmet`, `featAbilityOptions` | CC:993, 1001 |
| A-09 | Powers: force and tech (465) | Power choice, power points, casting, levels | `powers.json` | `PowersSelection.tsx`; `powerOptions`; `forcePowers.ts`, `techPowers.ts` | CC:1073 |
| A-10 | Class features parsed from text | Feature effects read from rules wording, not hard-coded by name | classes/archetypes text | `featureEffects`, `evalAmount`, `characterFeatures` | CC:55, 96, 247 |
| A-11 | Derived stats | HP, AC (`armorClassOf`), saves, speed, attack bonuses | PHB | `derivedStats`, `armorClassOf` | CC:827, 838 |
| A-12 | Leveling and XP | XP table, level-up plan, applying a level | `characterAdvancement.json`, `classImprovements.json` | `levelUpPlan`, `applyLevelUp`, `experienceForLevel`, `canLevelUp` | CC:1060, 1063, 1095, 1123 |
| A-13 | Fighting styles / masteries / maneuvers / weapon focus & supremacy | Combat options chosen per class (32, 32, 119, 8, 8) | `fightingStyles`, `fightingMasteries`, `maneuvers`, `weaponFocuses`, `weaponSupremacies` | `combatChoicesOf`, `combatChoiceSlots`, `superiorityDice`, `maneuverModifier` | CC:591, 602, 613, 627 |
| A-14 | Multiclassing | Taking a second class (table of improvements exists) | `multiclassImprovements.json`, `splashclassImprovements.json` | none found | GUIDE §11 says "rules gap"; **PLANNED/NOT DONE (doc says)**; grep of CC found no "multiclass" |
| A-15 | Archetypes that grant casting to non-casters | 9 of 137 give no power points | `archetypes.json` | none | GUIDE §11; **PLANNED/NOT DONE (doc says)** |
| A-16 | Weapon proficiency from species/feats; exotic weapons | Proficiency sources beyond class | species/feats | none | GUIDE §11; **PLANNED/NOT DONE (doc says)** |
| A-17 | Rests, Hit Dice, death saves | Short/long rest, dying | PHB | `PlayCombat.tsx`, GB (HP panel) | GUIDE §4 `(doc)` |
| A-18 | Conditions (16) | Status effects applied and tracked | `conditions.json`; `lib/sw5e/conditions.ts` | `useCombat`, `PlayCombat` | dataset count; GUIDE §4 |
| A-19 | Personality, appearance, name | Traits tables, face/hair/body look | PHB personality tables; original | `PersonalityTraitForm.tsx`, `CharacterDetails.tsx`, `appearance` column | GUIDE §4, §6 |
| A-20 | Character sheet and management | View/edit saved character, delete, list on Home | original | `/characters/:id` (`CharacterManagement.tsx`, `CharacterSheet.tsx`); `Home.tsx` | App.tsx:93-97 |
| A-21 | Character export/import | JSON export and import of a character | original | `CharacterExportImport.tsx` | file listing (**UNDOCUMENTED** in GUIDE) |
| A-22 | Character profile parser / language processor | Parses pasted profile text into a character | original | `characterProfileParser.ts`, `characterLanguageProcessor.ts` | file listing (**UNDOCUMENTED**) |

## B: Items & gear (24)

| ID | Feature | Description | Rules source | Entry point | Where found |
|---|---|---|---|---|---|
| B-01 | Equipment catalogue (507) | Weapons, armor, gear, with price and weight | `equipment.json` | `/api/sw5e/:dataset`, `lib/sw5e/equipment.ts`, `items.ts` | dataset count; sw5eRoutes.ts:42 |
| B-02 | Weapons and their properties (46) | Damage, range, properties applied in fights; 18 properties still unread | `weaponProperties.json` | `carriedWeapons`; `weaponProperties.ts` | CC:889; ITEM_TODO "Weapons" |
| B-03 | Armor (26) and armor properties (30), shields | AC, Strength requirement, Cumbersome, shield properties | `armorProperties.json` | `armorClassOf`, `armorTraits`, `isShield` | CC:827, 707; gear.ts:654 |
| B-04 | Enhanced items (1,918 rows) | Rarity, attunement, effects read from wording | `enhancedItems.json` | `activeEffects`, `isAttuned`, `withItemEffects`, `enhancedRows` | CC:731, 736, 1197; LI:11695 |
| B-05 | Item rarity and what a place deals in | Rarity tiers by place and vendor | house rule | `gearRarity`, `tradeTop` | RN "Rarity, smaller stock" |
| B-06 | Ammunition and reloading | Ammo families, special rounds, drops from the fallen | `gear.json`/equipment; house rule drops | `ammoFamilyOf`, `reloadOf`, `ammoDrops` | gear.ts:26-76; RN "Ammunition on the fallen" |
| B-07 | Adventuring gear uses | Every item has a "use" (food, light, container, suit, air, generator...) | equipment text | `foodOf`, `lightOf`, `containerOf`, `suitOf`, `airOf`, `generatorOf` | gear.ts:264-331 |
| B-08 | Weight, encumbrance, carrying | Strength x 15 lb, size multipliers, loose pounds | PHB + Variant: Encumbrance | `loadOf`, `weightOf`, `carryRule` | gear.ts:360, 576, 595 |
| B-09 | Containers and storage (17) | Packs, chests, smugglepack compartments | equipment text; house rule | `containerOf`; `Inventory.tsx` | gear.ts:305 |
| B-10 | Inventory UI | Pack tab: equip, attune, use | original | GB tab "Inventory", `Inventory.tsx`, `GearPanels.tsx` | GB:227, 9453 |
| B-11 | Survival: food, water, exposure, hazards | Rations, lifestyle cost, forage DC, cold/heat/air/radiation | PHB + house | `foodRule`, `breathRule`, `exposure`, `hazardsAt`, `passDays` | gear.ts:342-519 |
| B-12 | Kits and tools (36) | Tool checks and boons | `tools.json` | `toolRoll`, `boonOf`, `kitAlias` | RN "Gathering"; ITEM_TODO |
| B-13 | Modifiable items and mod sockets | Common-mods variant, 4 slots per chassis | Wretched Hives | LI "Modifiable items" (≈12265); GB `modsPanel` | LI:12265; RN "Rarity..." |
| B-14 | Cybernetics and prostheses | Replace body parts, installed by surgeons | Wretched Hives; house (no numbers) | `PROSTHESES`, `BODY_PARTS`; surgeons' shops | LI:12394, 12794 |
| B-15 | Droid customizations and droid dealers | Droid motor supports 2 upgraded to 6; droid shops with house prices | Wretched Hives; house | LI:12318, 12675 | LI banners |
| B-16 | Color crystals, information gear | Crystal check DC; reading chips/datacards/holocrons | Forcecasting book; house | LI:12307, 12323 | LI banners |
| B-17 | Trade and shops | Vendor kinds, daily stock, limited quantity, buy/sell | house rule | LI "Trade" (5863); GB tab "Trade" | LI:5863; RN "Rarity..." |
| B-18 | Master artificers | Rare NPCs who apply upgrades | house rule | `artificerIn`, `artificerStock` | RN "Rarity..." |
| B-19 | Loot and salvage | Carcasses, hides, wreck parts, ore, plants | house rule | `makeRemains`, `familiesForTool`, `wreckParts` | RN "Gathering and materials" |
| B-20 | Crafting and downtime activities | Craft, research, train etc. (10 activities) | `downtime.json` | LI "Downtime" (8650); GB `Downtime` tab (test build only in prod) | LI:8650; RN "Games, jobs" (doc) |
| B-21 | Gambling | Five checks vs house | Wretched Hives | LI:8039 | LI banner |
| B-22 | Substances, spice, drinks | High/low, addiction saves | Wretched Hives | `foodOf`, `liquidOf`; `gearUse` | ITEM_TODO "Spice" |
| B-23 | Item 3D models (all 507 + 1,918) | A model per item, visible in hand/world | original | `ItemModel.tsx`, `itemModels.json`, `npm run coverage:models` | GUIDE §4; ModelGallery `/dev/models` |
| B-24 | Item gaps (unbuilt) | Unread properties, mods drawn on weapons, placed mines drawn, container protection, rarity tint, ship parts in loot, Strength/Cumbersome on overland pace | — | none | ITEM_TODO "Gaps by group"; GUIDE §10.9; **PLANNED/NOT DONE (doc says)** |

## C: World & exploration (30)

| ID | Feature | Description | Rules source | Entry point | Where found |
|---|---|---|---|---|---|
| C-01 | World generator (galaxy to room) | Deterministic by seed: galaxy, region, system, planet, settlement, building, room | original / house | `POST /api/world/generate`; LI "Generation" (1730) | sw5eRoutes.ts:62; LI:1730 |
| C-02 | Expand / populate / liven / edit | Grow an area, fill with people, migrate old saves by LIFE version | original | `/api/world/expand`, `/populate`, `/liven`, `/occupant`, `/gang`, `livenWorld` | sw5eRoutes.ts:94-123 |
| C-03 | World validation and building audit | Checks all rooms are reachable | original | `/api/world/validate`, `validateWorld`, `auditBuildings`, `walkBuilding` | sw5eRoutes.ts:123; LI:7223-7291 |
| C-04 | Campaign creation and management | Create with local generator, list, delete | original | `/campaigns` (`CampaignView.tsx`, `CampaignGenerator.tsx`, `CampaignManager.tsx`) | App.tsx:98; routes.ts:175-262 |
| C-05 | Galaxy / system / planet map views | 3D star map, system map, planet globe | original | `/map` (`GalacticMapView`), `GalacticMap3D`, `SystemMap`, `PlanetGlobe` | App.tsx:100; Map dir listing |
| C-06 | Hyperspace and sublight travel | Jumps between systems, fuel, time | `travel.json`; house | LI "Travel" (5785); `jumpsBetween` | LI:5785; contracts.ts:162 |
| C-07 | Passage off world | Ticket agent sells a berth | house rule (no fares in books) | LI:5466 | LI banner |
| C-08 | One continuous 3D local map | Real-time walking, tap picks, double-tap opens | original | `LocalMap.tsx`, `babylon.ts`, `models.tsx` | GUIDE §1, §2 |
| C-09 | Settlements, districts, sites | Buildings in districts, "sites" with grounds and props | house rule | LI:366 (Sites), 10195 (Districts), 11187 (Site grounds); `siteAssets.tsx` | LI banners |
| C-10 | Buildings, floors, stairwells, rooms | Multi-storey, landing stairwells, round rooms, towers, catwalks | house rule | LI:1878 (layouts), 2277 (stair blocks), 3492 (levels) | LI banners; GUIDE §4 |
| C-11 | Round buildings, tree/stilt villages, water worlds | Round by default; Kashyyyk/Endor villages; Kamino-style gantry worlds | house rule | LI:15356; architecture kit | RN "The overhaul stage 1"; GUIDE §4 |
| C-12 | Windows, balconies, rooftops | Slits/portholes; palace balconies; roof access | house rule | LI:2353, 10756 | LI banners |
| C-13 | Caves, tunnels, vaults | Cave masks, tunnel runs between rooms | house rule | `caves.ts`, `tunnel.ts` | logic file list |
| C-14 | Arena district | Round bowl with tiers, pens, ramps | house rule | LI:3965; `PitArena.tsx` | LI banner |
| C-15 | Hangars and ships coming/going | Ships land at hangars, sliding roofs | house rule | LI:6543, 6877 | LI banners |
| C-16 | Skies, horizons, day/night, weather | Sky dome by hour, landforms, clock in minutes | house rule | `WorldSky`, `landformsOf`; LI "Time" (5820) | LI:5820, 15192 |
| C-17 | World clock and routines | Day clock; NPCs keep homes and shifts | house rule | LI:5820, 6321 | LI banners |
| C-18 | People: homes, jobs, errands, families | Individuals with routines, shared surnames | house rule | LI "Who and what is where" (915); `World.families`, `errands` | LI:915; GUIDE §6 |
| C-19 | Regard, reputation and kin ties | Per-person -100..100; reputation spreads by kin; unlocks their sheet | house rule | `relations.ts` (`regardOf`, `bump`, `sheetFor`, `kinOf`) | relations.ts:75-170 |
| C-20 | Factions and standing | Faction influence stored per campaign | PHB/original | `factionInfluence` in campaign | GUIDE §6 (**UNVERIFIED** how it is used) |
| C-21 | Law, crime, security response | Law levels, contraband, searches, patrol dispatch, cells, alarmed shops | house rule | LI:4921, 5159, 5384, 8241, 8278 | LI banners |
| C-22 | Slave trade, stop and search | Contraband items and a stop-and-search | house rule | LI:5935, 5979, 6012 | LI banners; RN "Contraband in the shooter" |
| C-23 | Quests, jobs and contracts | Bounties, robberies, data jobs, den-clearing from NPCs; tiers; rewards | house rule | `contracts.ts` (`makeOffers`, `accept`, `progress`); LI "Quests" (7057); GB `Quests` tab | contracts.ts; LI:7057 |
| C-24 | Scripted exchanges | A few hand-made NPC trades | house rule | LI:6280 | LI banner ("to be filled out later"); **PLANNED/NOT DONE (doc says)** |
| C-25 | Economy: prices, rarity, stock | Prices from data, limited stock | house rule | LI "Trade" 5863 | LI:5863 |
| C-26 | Bases | Found, claim, set down pieces, store goods | house rule | `bases.ts` | logic file list; **UNDOCUMENTED** in GUIDE §4 |
| C-27 | Road trip | Speeder trip as 2-5 legs with biome changes | house rule | `roadtrip.ts` (`planTrip`); LI "On the road" (14894) | RN "The trip" |
| C-28 | Ground transport and mounts | Speeders, rides, beasts of burden, sea crossings | `transport.json`; house | LI "Ground transport" (8380), "Over the water" (15408) | LI banners |
| C-29 | Movement: jump, jetpack, hook, climb, gravity | Real-time jump, jetpack, grapple hook, ladders, falling | house rule on PHB numbers | LI:2407, 2513 (`jumpOf`, `fireHook`, `gravityOf`) | LI banners; RN "Jumping..." |
| C-30 | Existing-world gaps | Older campaigns lack genders/families; chandler shop; witness interception; family-tree view | — | none | GUIDE §10.10; **PLANNED/NOT DONE (doc says)** |

## D: Combat & vehicles (28)

| ID | Feature | Description | Rules source | Entry point | Where found |
|---|---|---|---|---|---|
| D-01 | Tabletop combat | Turn-based on a grid, attacks, saves, damage | PHB | `useCombat.ts`, `PlayCombat.tsx`, `FightScene` | CLAUDE.md; LI "The fight" (9356) |
| D-02 | Dice and dice roller | Rolled dice, physics roller on the table | original | `DiceRoller.tsx`, `dice.tsx`, `useDice.ts`, `lib/sw5e/dice.ts` | RN "Dice on the table"; tests/dice |
| D-03 | Stat blocks in a fight (monsters 271) | Foe fight read from actions/traits/reactions | `monsters.json` | `statProfile` (LI ≈945) | LI:945; CLAUDE.md |
| D-04 | Encounters and encounter budgets | Builds foes for a place; uses 5e numbers | `monsters.json`; house | LI (encounters, "The watch" 4826) | LI:4826; GUIDE §11 |
| D-05 | Powers in tabletop combat | Casting force/tech powers in a fight; ~283 of 465 only "cast and described" | `powers.json` | `PlayCombat`, `castPower` (shooter) | GUIDE §11 |
| D-06 | Cover, range, opportunity attacks, area powers | Partial; opportunity attacks and area powers listed as not done | PHB | `useCombat` | GUIDE §11; **PLANNED/NOT DONE (doc says)** |
| D-07 | Gear in a fight | Grenades, mines, medpacs, kits used during combat | equipment text | `gear.ts`; ITEM_TODO | ITEM_TODO; RN "Gear in the shooter" |
| D-08 | Shooter mode (real-time) | KOTOR-style real-time, aim, spread, recoil, reload, no dice | house rule | `shooter.ts`, `Shooter.tsx`, `ShooterHud.tsx` | shooter.ts exports; GUIDE §1 |
| D-09 | Mode choice per campaign | Tabletop vs shooter, set after generating | house rule | `specialRules.mode`, `modeOf` | shooter.ts:13; GUIDE §6 |
| D-10 | Shooter gear and powers | Guns, grenades, blades, scopes, force powers cast live | equipment/powers text | `gunOf`, `grenadeOf`, `castPower`, `applyGear` | shooter.ts:213-1261 |
| D-11 | Shooter AI and perception | Foes with wind-ups, noise, sight, pathing | house rule | `step`, `sees`, `route`, `noise` | shooter.ts:675-1478 |
| D-12 | Lightsaber play | Six kits, forms, combos, parry | `lightsaberForms.json`; house | `saberplay.ts`, `swingPlayer` | RN "Saber fights"; shooter.ts:1222 |
| D-13 | Nemesis system | Foes who survive, learn, hunt, and are mercied | original (inspired by mod) | `nemesis.ts`; `NemesisPanel.tsx`; GB tab "Enemies" | nemesis.ts:395-749 |
| D-14 | The watch (stealth detection) | Hostiles notice by degrees | house rule | LI:4826 | LI banner |
| D-15 | Companions | Hired, freed, bolted droids, tamed beasts; single best attack | Wretched Hives; house | LI "Companions" (8074) | LI:8074; GUIDE §11 |
| D-16 | Mounted combat | Not done | — | none | GUIDE §11; **PLANNED/NOT DONE (doc says)** |
| D-17 | Pit arena fights and betting | Bouts, weekend card, tickets, odds | house rule | `pitbets.ts`, `PitBets.tsx`, `PitArena.tsx` | pitbets.ts exports |
| D-18 | Street fights and road fights | Fight on district ground; roadblock ambush | house rule | LI:11391, `roadFight` in GB | LI banner; RN "On the road" |
| D-19 | Starship stat blocks and sizes | 13 ships, 6 size classes, deployments, ventures | `ships.json`, `starshipSizes.json`, `starshipDeployments.json`, `starshipVentures.json` | `lib/sw5e/starships.ts` | dataset count |
| D-20 | Starship combat (turn-based) | Gunnery, piloting, crew actions | Starships of the Galaxy | LI "Starship combat" (9029) | LI banner |
| D-21 | Dogfight (real-time, space) | Flight, weapons, parts targeting, scenarios | house rule | `dogfight.ts`, `dogfightSim.ts`, `DogfightGame.tsx`, `/dev/dogfight` | logic file list; App.tsx:105 |
| D-22 | Air battles in atmosphere | Defend/bomb a settlement, convoy strike/escort | house rule | `airStart`, `groundVessel` | dogfight.ts:1018, 1044; RN "Air battles" |
| D-23 | Capital ships, corvettes, station interior | Large hulls, decks, boarding space | house rule | `hullSpec`, `StationInterior.tsx`, `CapitalShip.tsx` | dogfight.ts:528-610 |
| D-24 | Shipyard: mods, equipment, upgrades | Install modifications with DC/cost/days, salvage | `starshipModifications.json`, `starshipEquipment.json` | `shipyard.ts` (`canInstall`, `modCost`); `ShipWorks.tsx` | shipyard.ts; datasets (257, 104) |
| D-25 | Ship crew and seats | Roles, gunner/pilot seats, ship in the round | house rule | LI:5522, 5602; `coop.ts` `VEHICLE_ROLES`, `SHIP_ROLES` | LI banners |
| D-26 | Taking a ship that isn't the party's (heist) | Steal a ship | house rule | LI:5710 | LI banner |
| D-27 | Racing and convoy minigames | Three-lap races, rivers/bridges; convoy attack | house rule | LI "Racing" (13274), "The convoy" (15445) | LI banners |
| D-28 | Taxi, delivery, flying minigames | Pilot jobs | house rule | LI:13142 | LI banner |

## E: Social, AI & systems (24)

| ID | Feature | Description | Rules source | Entry point | Where found |
|---|---|---|---|---|---|
| E-01 | Local NPC dialogue (Gemma 4 E2B via Ollama) | Streamed NPC/party replies; colour only, no game state | original | `POST /api/dialogue`, `/api/dialogue/status` | dialogue.ts:212, 222 |
| E-02 | NPC-to-NPC chatter | Two people converse; street talk, arena crowds | original | `POST /api/chatter`; relations.ts `smallTalk` | dialogue.ts:293 |
| E-03 | Speech to text (microphone) | 16 kHz WAV transcribed by Gemma | original | `POST /api/stt`; `TalkPanel.tsx` | dialogue.ts:190 |
| E-04 | Text to speech (Piper, OneCore, browser) | Each speaker has own voice; cached WAV | original | `POST /api/speech`, `/api/speech/status`; `lib/voice.ts` | speech.ts:228-233 |
| E-05 | Non-verbal cues and droid/creature voices | Breaths, growls, bleeps; SeptaBee bank empty | original | `voiceOf`, cue synth; `manifest.json` | GUIDE §8 |
| E-06 | Comms and comlinks | Notes, recordings, translator slots, overheard calls | house rule | `comms.ts`; `CommsPanel.tsx`; GB tab "Comms" | comms.ts exports |
| E-07 | Comms calls (NPC calls the party, ship transceiver) | Planned | — | none | GUIDE §8, §10.7; **PLANNED/NOT DONE (doc says)** |
| E-08 | Talk panel and NPC sheets | Talk, regard-gated sheet, nature and bond | house rule | `TalkPanel.tsx`; `sheetLines`, `natureOf`, `bondOf` | relations.ts:116, 254, 265 |
| E-09 | Dialogue v2 (quests, wares, memory, party voice) | Feed quests/prices into card; memory | — | none | GUIDE §7, §10.7; **PLANNED/NOT DONE (doc says)** |
| E-10 | Manual GM loop | Build report, paste to outside AI, paste reply back | original | GB tab "GM Interface"; `reportHandler.ts`, `GMReportManager.tsx`, `LLMResponseParser.tsx` | GUIDE §7 |
| E-11 | Debriefs | Compile session debrief and store the GM response | original | `POST /api/debriefs`, `PUT /api/debriefs/:id/response`; `debriefCompiler.ts` | routes.ts:298, 325 |
| E-12 | API-based GM | Cloud-model GM | — | none | CLAUDE.md "ask first"; **PLANNED/NOT DONE (doc says)** |
| E-13 | Co-op (up to 4) over WebSocket | Shared campaign by JSON patch, own location per member, crew | house rule | `/ws/coop`, `/api/coop/*`; `CoopJoin.tsx`, `CoopUI.tsx`, `shared/logic/coop.ts` | server/coop.ts:440-467; App.tsx:102 |
| E-14 | Co-op completion | Shared trip minigame, crew roles in starship fights, two players in one fight | — | none | GUIDE §10.11; **PLANNED/NOT DONE (doc says)** |
| E-15 | Sabacc | Table card game with AI players, stools | house/user rules | `sabacc.ts`, `SabaccTable.tsx` | sabacc.ts exports |
| E-16 | Pazaak | Card game, side deck, 20 wins | user-pasted rules | `pazaak.ts`, `PazaakGame.tsx` | pazaak.ts exports |
| E-17 | Dejarik | Holo-chess with species pieces | house rule | `dejarik.ts`, `DejarikGame.tsx` | dejarik.ts exports |
| E-18 | Persistence: characters, campaigns, debriefs | Postgres via drizzle; auto-save | original | `shared/schema.ts`, `server/db.ts`, `storage.ts`, `/api/characters`, `/api/campaigns` | routes.ts:34-262 |
| E-19 | Save controls and world migration | Save UI; old worlds migrated by LIFE version | original | `SaveControls.tsx`, `livenWorld` | ui listing; GUIDE §4 |
| E-20 | Rules-data API | Serves the 41 JSON datasets to the client | sw5e.com import | `GET /api/sw5e`, `/api/sw5e/:dataset`, `/api/sw5e/itemFacts`; `npm run import:sw5e` | sw5eRoutes.ts:19-42 |
| E-21 | Phone / PWA / touch | Phone browser play, stick, compass, tailnet access; manifest/icons and bundle size not done | original | Compass.tsx, `stick.ts`; Phase 4 | GUIDE §10.12; **PLANNED/NOT DONE (doc says)** (PWA part) |
| E-22 | Test menu, model gallery, dev labs | Test-only item/credit giving; `/dev/models`, `/dev/dogfight`, `/dev/loading` | original | `TestMenu.tsx`, `ModelGallery.tsx`, `DogfightLab.tsx`, `LoadingDemo.tsx`; `VITE_TEST_MENU=1` | App.tsx:103-105 |
| E-23 | Graphics tiers and showcase | Lite/full render tiers, performance monitor, showcase server | original | `babylon.ts`, `performance/monitor.tsx`, `server/showcase.ts` | GUIDE §4; file listing (**UNDOCUMENTED**: `showcase.ts`, `GalacticMapView`) |
| E-24 | Tooling and ops | Importer, item audit, model coverage, soundlab, e2e play-through, Windows deploy script, backups | original | `npm run import:sw5e`, `audit:items`, `coverage:models`, `e2e`; `deploy/windows-start.ps1` | GUIDE §5; backups **PLANNED/NOT DONE (doc says)** (§10.13) |

---

## Counts per area
A 22, B 24, C 30, D 28, E 24 = **128 rows**.

## UNVERIFIED:
- Whether any row's feature actually works (Phase 3b).
- All entry points are inferred from file/function names, not opened. I read no function bodies.
- `Archive/REVIVAL_NOTES.md` was read by heading and by the first sentence of subsections only; its roughly 585 KB of detail was not read in full. Some "Play rules" sub-features are therefore merged into broader rows.
- Dataset content (what a species or archetype actually grants) was not opened; only entry counts.
- Multiple features in the client `lib/sw5e/*.ts` views (`exploits.ts`, `npcs.ts`, `vehicles.ts`, `locations.ts`, `starSystems.ts`) were seen as file names only; their role is not listed as separate rows. `lib/llm/campaignGenerator.ts` and `lib/sw5e/campaignGenerator.ts` exist; I did not check which is used.
- The 4 UNDOCUMENTED rows (A-21, A-22, C-26, E-23) are those in code but not named in GUIDE §4. This tag was applied by comparing to the guide text only, not the other docs.
- Whether `factionInfluence` (C-20) does anything beyond being stored.

## REMAINING:
- Read function bodies for entry-point confirmation (needed by 3b).
- Open the `Play rules` section of `Archive/REVIVAL_NOTES.md` (lines 111-500) fully and split broad rows (C-21, B-11, D-18) into one row per rule.
- Split C-10/C-11 into one row per building family (the architecture kit has seven families, see RN line 1088).
- Read the e2e scripts in `e2e/` to see which of these rows an acceptance test touches.
- Check `tests/` names against rows to mark which features have unit tests.
