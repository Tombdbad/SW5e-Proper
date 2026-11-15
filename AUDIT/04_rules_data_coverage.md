# AUDIT 04: Rules-data coverage (2026-11-07, branch `audit`, read-only)

## Plain-English summary
- There are **41 datasets** in `shared/data/sw5e/` (the manifest lists 41; the "36" in the guide and in the task is stale), 9.8 MB, data version 199.
- **How much the game really uses, by entry:** across the 13 text-driven datasets I could classify (5,392 entries), the code **turns 3,245 (60%) into an in-game effect** and the rest is shown as text only. That 60% is flattered by items: base equipment is 507 of 507 and enhanced items 1,900 of 1,918. For the **character rules text a player reads at the table** (class features, archetype features, species traits, feats, maneuvers, fighting styles, powers: 2,604 entries) only **517 (20%)** get an effect.
- **Five worst datasets:** (1) archetype features 4% (37 of 912); (2) species traits 19% (141 of 739); (3) maneuvers 23% (27 of 119); (4) feats 24% (29 of 119); (5) fighting styles 25% (8 of 32). Next: powers 39% in the turn-based fight, class features 42%.
- **16 of the 41 datasets are not read by any production code at all** (listed below). Most are book text or tables the game does not need to run (for example the five `rules*` chapters), but three are real game options that nothing reads: `fightingMasteries`, `weaponFocuses`, `weaponSupremacies`; and two level-up tables, `multiclassImprovements` and `splashclassImprovements`.
- **What a player would notice first:** playing a Fighter or Consular works well (class features are read); picking almost any archetype or most species gives text and nothing else (for example Cathar "Treeclimber", Toydarian "Flight", Abyssin "Rapidly Regenerative"); about 60% of the 465 powers do nothing mechanical in the turn-based fight (they are described, and the player adjudicates).
- **The guide's stated gaps, checked with numbers:** "~283 of 465 powers only cast and described" is **confirmed (282)**; "archetypes granting casting give no power points" is **confirmed (9 of 137, named below)**; "18 weapon properties unread" is **wrong (at most 4 of 46 do not appear in the fight code)**; "507 items all have a use" is **confirmed (507 of 507)**.
- Method limit, stated once: "mechanical" means the game's own parser produced an effect; "text-only" means it did not. Some text-only rows may be handled by other code that my classifier does not call (a flying speed, a darkvision trait, Exhaustion). Treat the percentages as **lower bounds** for species and archetype features. Nothing here says an effect is *correct*, only that one exists.

## Master table

Columns: "Fields read / total" = fields (including one level of nested fields) whose name appears as a property access or string anywhere in `client/src`, `shared/logic` or `server` (an **upper bound**: a field called `name` or `text` will always count). "Mechanically applied / Text-only" are measured only for the text-driven datasets; "n/a" means the dataset is structured data (prices, tables, stats) where the question is "is the field read", not "is the text parsed". "Ignored" = the whole dataset is not referenced by any production file.

| Dataset | Entries | Fields read / total | Mechanically applied % | Text-only % | Ignored % | Production files naming it |
|---|---|---|---|---|---|---|
| archetypes | 137 | 11/15 | 4% (37) | 96% (875) | 0 measured | prod files: 1 |
| armorProperties | 30 | 4/5 | 83% (25) | 17% (5) | whole dataset unreferenced | prod files: 0 |
| backgrounds | 61 | 29/33 | n/a | n/a | n/a | prod files: 2 |
| characterAdvancement | 20 | 5/6 | n/a | n/a | n/a | prod files: 2 |
| classImprovements | 10 | 5/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| classes | 10 | 26/37 | 42% (92) | 58% (126) | 0 measured | prod files: 2 |
| conditions | 16 | 4/5 | 88% (14) | 13% (2) | 0 measured | prod files: 2 |
| downtime | 10 | 6/6 | n/a | n/a | n/a | prod files: 1 |
| enhancedItems | 1918 | 12/23 | 99% (1900) | 1% (18) | 0 measured | prod files: 3 |
| equipment | 507 | 15/19 | 100% (507) | 0% (0) | 0 measured | prod files: 7 |
| feats | 119 | 6/7 | 24% (29) | 76% (90) | 0 measured | prod files: 1 |
| fightingMasteries | 32 | 4/5 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| fightingStyles | 32 | 4/5 | 25% (8) | 75% (24) | 0 measured | prod files: 2 |
| gear | 4 | 10/28 | n/a | n/a | n/a | prod files: 2 |
| lightsaberForms | 20 | 4/5 | n/a | n/a | n/a | prod files: 2 |
| lookups | 6 | 14/14 | n/a | n/a | n/a | prod files: 5 |
| maneuvers | 119 | 6/7 | 23% (27) | 77% (92) | 0 measured | prod files: 1 |
| manifest | 6 | 42/45 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| monsters | 271 | 50/53 | 89% (240) | 11% (31) | 0 measured | prod files: 5 |
| multiclassImprovements | 10 | 5/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| powers | 465 | 13/14 | 39% (183) | 61% (282) | 0 measured | prod files: 4 |
| referenceTables | 33 | 4/5 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| rulesExpandedContent | 10 | 3/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| rulesPlayersHandbook | 16 | 3/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| rulesStarships | 13 | 3/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| rulesVariant | 40 | 3/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| rulesWretchedHives | 10 | 3/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| ships | 13 | 51/51 | n/a | n/a | n/a | prod files: 3 |
| skills | 18 | 4/5 | n/a | n/a | n/a | prod files: 3 |
| species | 141 | 21/27 | 19% (141) | 81% (598) | 0 measured | prod files: 4 |
| splashclassImprovements | 10 | 5/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| starshipDeployments | 6 | 9/10 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| starshipEquipment | 104 | 17/31 | n/a | n/a | n/a | prod files: 3 |
| starshipModifications | 257 | 7/8 | n/a | n/a | n/a | prod files: 1 |
| starshipSizes | 6 | 11/17 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| starshipVentures | 67 | 5/6 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| tools | 36 | 11/11 | n/a | n/a | n/a | prod files: 1 |
| transport | 4 | 0/0 | n/a | n/a | n/a | prod files: 2 |
| travel | 4 | 9/9 | n/a | n/a | n/a | prod files: 2 |
| weaponFocuses | 8 | 4/5 | n/a | n/a | whole dataset unreferenced | prod files: 0 |
| weaponProperties | 46 | 4/5 | 91% (42) | 9% (4) | 0 measured | prod files: 1 |
| weaponSupremacies | 8 | 4/5 | n/a | n/a | whole dataset unreferenced | prod files: 0 |

Rows for species, classes, archetypes: the percentage is over the **features/traits inside** the dataset (739, 218, 912), not the 141/10/137 top-level entries. `equipment` is "has a use or a fight role", `monsters` is "stat block yields at least one attack the fight can use", `conditions` is "mechanics differ from an unknown condition", `weaponProperties`/`armorProperties` is "name appears in the fight/gear code" (upper bound).

## Overall figures
| Group | Entries | Mechanical | % |
|---|---|---|---|
| Character rules text (class, archetype, species, feats, maneuvers, styles, powers) | 2,604 | 517 | 20% |
| Items, stat blocks, conditions, properties | 2,788 | 2,728 | 98% |
| **All 13 classified datasets** | **5,392** | **3,245** | **60%** |

## Per-dataset detail

### Batch 1: character
- **species (141 species, 739 traits).** Fields: 21 of 27 named. Not read (non-empty): `weightRollMod`, `imageUrls`, `colorScheme`, `manufacturer`, `halfHumanTableEntries`. Measured: 141 traits mechanical (19%), 598 text-only (81%). Production: `species.ts`, `models.tsx` (appearance), `sw5eData.ts`. Examples text-only, and the effect the rule text calls for:
  1. Cathar **Treeclimber**: "climbing speed of 30 feet; advantage on Strength saves and Athletics checks that involve climbing" (a climbing speed and an advantage).
  2. Toydarian **Flight**: "flying speed equal to your walking speed; halved in medium or heavy armor".
  3. Kage **Sunlight Sensitivity**: "disadvantage on attack rolls and sight Perception when you or the target is in direct sunlight".
  4. Mustafarian **Lava Dweller**: "resistance to fire damage" plus hot-climate adaptation.
  5. Abyssin **Rapidly Regenerative**: spend a Hit Die as a bonus action to recover HP; reaction to spend one when hit.
  Caveat: other code may read some (the text of "resistance to ... damage" is parsed in `characterCalculation.ts:370` for fight stances; `species.ts` and `gear.ts` mention darkvision); a species trait that is tracked elsewhere shows as text-only here.
- **classes (10 classes, 218 features).** Fields: 26 of 37 named. Not read: `levelChangeHeaders`, `hitPointsAtFirstLevel`, `hitPointsAtHigherLevels` (and the `...Number` fields), `toolProficienciesList`, `archetypeFlavorText`, `archetypeFlavorName`, `imageUrls`, `multiClassProficiencies`. Measured: 92 mechanical (42%), 126 text-only (58%). Text-only examples: Consular **Consular Tradition**, Fighter **Fighter Specialty**, Guardian **Guardian Aura**, Scholar **Academic Pursuit**, Scout **Scout Technique** (these are mostly the "choose an archetype" placeholders, which the archetype pick handles, so they are fairly counted as text). Monk **Unarmored Movement** is handled by a class-table path (`characterCalculation.ts:147-149`), so it is a measurement artifact.
- **archetypes (137 archetypes, 912 features).** Fields: 11 of 15 named. Not read: `classCasterType`, `leveledTableHeaders`, `leveledTable`. Measured: 37 mechanical (4%), 875 text-only (96%). All 137 archetypes belong to a class that exists (0 unreachable). Examples text-only:
  1. Gunslinger Practice **Trick Shooter**: when dealing Sneak Attack damage, forgo two dice to make a trick shot (a choice of effects).
  2. Acquisitions Practice **Deft Hands**: same pattern with "deft hand maneuvers".
  3. Shield Specialist **Bulwark**: extend Indomitable to an ally.
  4. Marauder Approach **Forcecasting**: learn 4 force powers and gain power points (see casting gap below).
  5. Audiotech Engineering **Modified Instrument**.
- **backgrounds (61).** Fields 29 of 33 named; not read: `flavorName`, `flavorDescription`, `flavorOptions`. The e2e creates a Soldier and checks skills, tools, languages and the feat. Background *feature* text is flavour by design.
- **feats (119).** Fields 6 of 7. Measured: 29 mechanical (24%), 90 text-only (76%) (counting "increases an ability score" as mechanical). Text-only examples: **Quick Caster** (cast a bonus-action power and an action power in a turn), **Master Force-Sensitive** (know an at-will power and a 5th-level power cast once per long rest), **Actor** (advantage on Deception and Performance when passing yourself off as someone else; the +1 Charisma part is applied), **Double-Weapon Casting**, **Fighting Styles and Masteries**.
- **skills (18), characterAdvancement (20), lookups (6 keys).** Read (`skills.ts`, `characterCalculation.ts`, `rules.ts`, `constants.ts`). Structured; only `contentType` unread.
- **classImprovements (10), multiclassImprovements (10), splashclassImprovements (10).** **Not referenced by any production file.** `multiclassImprovements` and `splashclassImprovements` back the missing multiclass feature (A-14); `classImprovements` was not traced against `characterAdvancement` (UNVERIFIED which of the two level-up tables is the live one; level-up works, `play.mjs:525`).

### Batch 2: fighting options and powers
- **maneuvers (119).** Measured: 27 mechanical (23%), 92 text-only (77%). Examples: **Calling Card** ("expend a superiority die to throw a sonic charge ... Dexterity saves ... damage"), **Return Fire** (reaction when a ranged attack misses you: attack back, add the die), **Strikeforce** (add the die to the attack and force damage on a hit), **Deathseek**, **Firewall**.
- **fightingStyles (32).** Measured: 8 mechanical (25%), 24 text-only. Examples: **Brawler Style** (proficient with improvised weapons, unarmed die up a step), **Shield Style** (bonus-action shield effects), **Throwing Style** (draw another weapon after a throw), Area, Disruption.
- **fightingMasteries (32), weaponFocuses (8), weaponSupremacies (8).** **Not referenced by any production file**; the class features that grant them exist as text. This answers the open question in matrix A-13: they are unread (by file name and by an identifier search; a generic loader reading them by a computed name was not found).
- **powers (465: Force and tech).** Fields 13 of 14. Turn-based fight (`powerEffect` + `powerMotion` in `rules.ts`): 183 mechanical (39%), **282 text-only (61%)**; by kind: attack 32, save 130, condition 10, heal 9, other 284 (two of the 284 have a movement effect, so 282). Shooter (`realtimePowers`, first 18 offered): 332 of 465 are playable in principle. Text-only examples: **Kill** ("dies instantly if 100 HP or fewer": a "100 hit points or fewer" threshold), **Ruin** (cripples a target with 100 HP or fewer), **Enhance Weapon** (a weapon becomes enhanced for a duration), **Kolto Reserve** (the first time the target would drop to 0 HP, it drops to 1 instead), **Affect Mind**.
- **lightsaberForms (20).** Read by `limbs.ts`, `saberplay.ts`; only `contentType` unread.
- **conditions (16).** 14 of 16 have mechanics that differ from an unknown condition. The two that don't: **Exhaustion** (measurement artifact: exhaustion is handled by its own code, `GameBoard.tsx:2151-2152`, `fightrules.test.ts`) and **Deafened** ("can't hear and fails any check that requires hearing"; no effect found, UNVERIFIED).

### Batch 3: items and properties
- **equipment (507).** Fields 15 of 19 (unread: `damageDieModifier`, `damageDiceDieTypeEnum`, `propertiesMap`, `contentType`). 507 of 507 have a use or a fight role: 243 "fight" (weapons and armor), 36 tool, 42 ammo, 27 explosive, 18 accessory, 17 container, 16 substance, 15 instrument, 10 suit and 10 prosthesis, the rest in about 40 smaller kinds; 0 with none. (Counted by calling `gearUse`, the function `tools/item-audit.ts` uses.)
- **enhancedItems (1,918).** Fields 12 of 23 (unread: `rarityOptions`, `rarityText`, `hasPrerequisite`, and the per-type fields `adventuringGearType`, `enhancedArmorType`, `focusType`, `enhancedShieldType`, `enhancedWeaponType`, `itemModificationType`, `valuableType`). `itemFactsOf` yields facts for all 1,918 and an effect, use, mod, chassis or augment for **1,900 (99%)**; **18 are read but give nothing**: 17 of 156 Adventuring Gear and 1 of 12 Shields. Examples: **Boots of Hiding** (disadvantage to track your steps; no footprints on a bonus action), **Circlet of Persistence** and **Mantle of the Anomic** (charges that spend on Force-empowered casting), **Tool (Basic)** / **(Improved)** / **(Exceptional)** (raise your proficiency in a tool by a step). Caveat: "has an effect" is generous (any effect key, use, property or kind counts); it does not show the effect equals the text. `ITEM_TODO.md`'s older counts ("40 adventuring gear, 18 weapons") are stale: Weapons are now 58 of 58.
- **weaponProperties (46).** 42 of 46 names appear in the fight and gear code I searched (`useCombat.ts`, `shooter.ts`, `characterCalculation.ts`, `gear.ts`, `weapons.ts`, `gear.ts` in interiors, `weaponProperties.ts`); **4 do not: Disarming, Disruptive, Interlocking, Luminous.** (Upper bound: a name appearing is not proof it is applied. The notes say Luminous is played; I found the word in none of the files searched, so it may live in another file.)
- **armorProperties (30).** 25 of 30 names appear in gear code; **Gauntleted, Interlocking, Lambent, Responsive, Steadfast** do not (Steadfast: "advantage on Strength checks and saves to avoid being moved"; Lambent: a shield's light). The dataset file itself is not referenced by production code.
- **gear (4 keys), tools (36), transport (4 keys), downtime (10 keys), travel (4 keys), ships (13 keys).** Read by `shared/logic/*` and `GameBoard.tsx`. `gear.json` has 28 field names of which 10 are named literally (the rest are item names used as keys, so the figure is not meaningful).

### Batch 4: stat blocks, ships and books
- **monsters (271).** Fields 50 of 53 named (unread: `behaviors[].numberOfTargets`, `damageVulnerabilitiesOther`, `contentType`). **240 (89%)** yield an attack the fight can use; **31 do not**. Of those 31, **5 have attack-looking text the parser could not read**: Gundark (Alpha), IG-227 Hailfire-Class Droid, Jawa Scrapper, Jawa Shaman, Voxyn. Example: Jawa Scrapper's "Ion Blaster" text is "Ranged Weapon Attack: +4 to hit, range 40/160 ft. ... **Hit 3** (1d4 + 2) ion damage", written "Hit 3" where the parser expects "Hit:" (`attackFrom`, `shared/logic/index.ts:1099-1102`), and its structured `attackType` is "None". The other 26 have no attack-like text at all (turrets, utility droids, e.g. Ax-108 Sentry Gun's "Repeating Blaster Burst" has `attackType` "None"); whether they should attack is UNVERIFIED.
- **ships (13 keys), starshipEquipment (104), starshipModifications (257).** Read (`dogfight.ts`, `shipyard.ts`, `GameBoard.tsx`, `DogfightLab.tsx`). In starshipEquipment these numeric fields are not named in any code: `starshipWeaponCategory`, `armorClassBonus`, `navcomputerBonus`, `attacksPerRound`, `hitPointsPerHitDie`, `centralStorageCapacity`, `capacityMultiplier`, `regenerationRateCoefficient`, `systemStorageCapacity`, `powerDiceRecover`, `fuelCostsModifier` (the game may take these from the text instead; not checked).
- **starshipSizes (6), starshipDeployments (6), starshipVentures (67).** **Not referenced by any production file.** Sizes are carried by `travel.json` (`starships.ts:17`), so the separate dataset is redundant; deployments and ventures are unread (their game use, ship ventures and deployments from the Starships book, is not in the matrix).
- **referenceTables (33), rulesPlayersHandbook (16), rulesStarships (13), rulesVariant (40), rulesWretchedHives (10), rulesExpandedContent (10), manifest.** Book text and tables. Not read as data by production code; the game's `gear.json`, `downtime.json`, `tools.json` etc. are derived from them (`npm run import:sw5e` with `DERIVE_ONLY=1`). Expected: not a defect.

## Confirming or correcting the guide's stated gaps

| Claim (source) | Measured | Verdict |
|---|---|---|
| "~283 of 465 powers only cast and described" (GUIDE §11) | 282 of 465 have no turn-based effect and no movement effect | **Confirmed.** In the shooter 332 of 465 are playable (a different path, first 18 offered). |
| "archetypes granting casting to non-casters (9 of 137) give no power points" (GUIDE §11) | Exactly 9: Adept Specialist (fighter, Force), Aing-Tii Order (monk, Force), Archaeologist Pursuit (scholar, Force), Beguiler Practice (operative, Force), Industrial Approach (berserker, Tech), Marauder Approach (berserker, Force), Saboteur Practice (operative, Tech), Shield Specialist (fighter, Tech), Slicer Pursuit (scholar, Tech). Code: `powerOptions` tests only the class's `casterType` (`characterCalculation.ts:1074-1075`). | **Confirmed.** |
| "18 weapon properties unread" (GUIDE §10.9, ITEM_TODO) | 4 of 46 names not found in the fight code (Disarming, Disruptive, Interlocking, Luminous) | **Corrected: at most 4.** |
| "every one of 507 items has a use" (GUIDE §4, `classify.test.ts`) | 507 of 507 | **Confirmed.** |
| "1,918 enhanced rows ... have a model" | not measured here | UNVERIFIED (see B-23). |
| "36 datasets" (GUIDE §1) | 41 | **Corrected.** |
| "271 monsters" | 271; 240 give a usable attack | Confirmed, with 31 without. |
| "Fighting masteries / weapon focuses / supremacies" (A-13 unknown) | not referenced by production code | **Resolved: unread.** |

## What `tools/item-audit.ts` and `tools/model-coverage.ts` measure
- `model-coverage.ts` (run in Phase 3b, read-only): whether each of the 507 base items has a 3D model (286 own, 221 shared by kind, 0 none). It does **not** cover enhanced items, and says nothing about whether the item *does* anything.
- `item-audit.ts` (npm `audit:items`): walks the equipment and enhanced items through `gearUse` and `itemFactsOf` and lists what each lacks. **It overwrites `ITEM_TODO.md` in the repository**, so I did not run it; I called the same two functions (`gearUse`, `itemFactsOf`) from a throwaway script and got the same kind of numbers (equipment 507/507, enhanced 1,900/1,918). It misses powers, feats, class/archetype/species features, maneuvers, styles, monsters: those are measured only in this phase.

## Corrections to earlier audit phases from this one
- Matrix A-13: "whether `fightingMasteries`, `weaponFocuses`, `weaponSupremacies` are read anywhere" is now answered: not read.
- Matrix A-10: feats are now measured (24%); the species figure moved from 139 to 141 because this script also counts the haggling traits.
- Matrix B-02/B-24 and the FEATURE_MATRIX contradiction 2: the unread weapon-property count is at most 4, not 18.
- Matrix files say "I did not run any test". The Phase 2 report (`AUDIT/02_health_checks.md`, `AUDIT/tmp/npm-test.txt`) records **697 of 700 tests passed, 0 failed, 3 skipped** (the co-op tests). I did not run `npm test` again, as asked; those results are from an earlier run on this branch and are not repeated in the matrices.

## Files used
Throwaway scripts, kept in `AUDIT/tmp/` (not in any source folder): `fieldscan.mjs`, `datasetrefs.mjs`, `coverage.ts`, `monsters_miss.ts`, `mktable.mjs`; outputs `fieldscan.json`, `datasetrefs.json`, `coverage.json`, `master_rows.md`. To repeat: `node AUDIT/tmp/fieldscan.mjs`, `node AUDIT/tmp/datasetrefs.mjs`, `node --import tsx AUDIT/tmp/coverage.ts`, `node AUDIT/tmp/mktable.mjs` from the project root.

## UNVERIFIED:
- Whether any "mechanical" effect matches its rule text (only that one is produced).
- Species/archetype/class rows flagged text-only that other code may handle (flying and climbing speeds, darkvision, Exhaustion, Monk movement).
- Whether `classImprovements` or `characterAdvancement` is the live level-up table.
- Whether Luminous and Disruptive are played somewhere outside the seven files searched.
- Whether the 26 monsters with no attack text are meant to attack; whether Deafened should have an effect.
- The starship equipment numeric fields (the game may read the text instead).
- Per-field "read" is by name search: an upper bound for common names, and it misses fields read through a computed key.
- Backgrounds, lightsaber forms, skills, lookups, ships, travel, transport, downtime, tools, gear were checked at field level only, not for text parsing.

## REMAINING:
- Run the classifier on `rulesVariant` (the encumbrance and other variant rules) against `gear.json` to confirm the derivation covers the book.
- Re-check the 5 unparsed monsters and the "Hit 3" variant across all 271 stat blocks (how many `Hit` forms are accepted).
- Hand-check 20 species traits marked text-only for hidden handling elsewhere, to turn the lower bound into a number.
- Confirm that the starship fields listed are never used, by reading `shipSheet`.
