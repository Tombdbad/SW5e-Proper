# Trainer quests: masters who teach weapons (stage 1) and powers (stage 2)

Design draft, 2026-11-09, from the owner's answers. NOT built yet. Edit it; then stage 1 starts.
Owner's decisions: the chain REPLACES the paid "Learn from them" encounter and the Training downtime for weapons (and later for powers); 5 quests, level-gated; the Master is found through a travel-and-rumour trail; weapons first, powers second.

## 1. What it replaces (found in the code)
- `optionsOf` / `teachingFor` in `shared/logic/index.ts` (~10405-10455): a road master teaches for 200 x level credits and two days. Kept only for taking up a path (Force or tech) the first time; no weapon or power training from it any more.
- `trainingOptions` (~8957): the book's Training downtime, kind "weapon" (10 weeks, 250 cr/week). The "weapon" option is removed from the list the player sees (the books' text stays in the data; house rule, labelled on screen and in REVIVAL_NOTES "Play rules"). Nothing is deleted from the data files. Language, tool, skill, saving throw and feat training stay.
- Class and species/feat proficiency (T-015, commit 7e318ee) stays: the chain adds what those do not give.

## 2. What the chain gives (weapon types, not single weapons)
A "weapon type" is a classification kind from the data: blasters, vibroweapons, lightweapons, and exotic weapons one by one. Character stores `training: { [type]: { stage: 0-5, masterId?, done: string[] } }` (inside the character's existing JSON, no schema change; to confirm).
- Stage 2 done: proficiency in that type (simple + martial).
- Stage 5 done: mastery. House rule (the books have none for weapons): +1 to attack rolls with that type, and exotic weapons of the type unlock. Needs the owner's number.
- Which type is offered: first the character's class's own types are skipped (already proficient); candidates are ranked by class, species, homeworld, location and alignment (e.g. a Wookiee: bowcaster; a Sith: lightweapons if Dark-aligned).

## 3. Finding the Master (the trail)
Unlocked when BOTH hold: the character has visited at least 3 different star systems, and has gained 3 levels since the campaign began (character level >= start level + 3).
1. A "Find a Master" quest appears in the log: "Someone back at <earlier location> has heard of a teacher of <type>."
2. The player returns to an EARLIER visited settlement; its contact NPC gives a rumour that names a SYSTEM (not the place).
3. In that system a second NPC (the Informant) gives the ACTUAL location of the Master (settlement and building).
4. Reaching the Master marks the Master as found. ONLY then do the 5 training quests exist.
The Master, the contact and the informant are NPCs the generator places when the trail starts (pure function in shared/logic, seeded, so a world and its save agree). Rumour and informant lines come from the dialogue card as now (the local model may voice them; the text on the card is fixed).

## 4. The five training quests (level-gated)
Gates (proposal): quest 1 at level 3, 2 at 5, 3 at 9, 4 at 13, 5 at 17. A gate can be skipped by a GREAT FEAT or a SERVICE the Master names (a fixed list per Master kind, e.g. defeat a named rival, return a stolen weapon). Each quest reuses the existing quest model (`Quest`, objectives with defeat / loot / reach), plus one new target kind `serve` (hand over / deliver / speak to a named NPC) that the later quests need. Templates by flavour: trial of skill (duel the Master's pupil), a hunt (defeat a creature of the planet), a recovery (a cache), an errand between two places, a test of conscience (alignment-shaped: the Master asks different things of Light and Dark).
Rewards: the Master's stage (not credits). Credits stay small.

## 5. Stage 2: powers
Same machine: a Master per power FAMILY (the owner picks the families: T-016), the trail, the five quests. A power the class cannot learn at level-up is "taught only": it appears in the power list as "needs a Master" until stage N of its family. Powers the class learns normally are unchanged.

## 6. Code map (about 6 files for stage 1)
`shared/logic/index.ts` (trail, Master placement, quest templates, gates, `serve` target); `client/src/lib/sw5e/characterCalculation.ts` (read `training` for proficiency, mastery bonus); `client/src/pages/GameBoard.tsx` (log, dialogue buttons, hide weapon Training); `server/sw5eRoutes.ts` (only if the Master needs rules data); `tests/` (trail gating by systems and levels, one chain end to end, replaced options). Needs no migration if `training` lives in the character JSON.

## 7. Inspiration from the films, shows, games, books and fan fiction (2026-11-09 web search)
Ideas only, retold in our own words; no names or text are copied into the game. Each idea is tagged with the quest target it needs (`defeat`, `loot`, `reach`, new `serve`) so it can be built from the existing quest model.

### 7.1 The trail to the Master (section 3), patterns that recur
- **A message left behind** (Fallen Order: a hidden master's recorded message sends the hero to three old tombs). Our step 2: the rumour can be a recording or a note in a cache, not only a person (`loot`, then `reach`).
- **A map found in an enemy's camp** (Legends, the Bane novels: the scroll that names an old lord's tomb is found among a rival's things). Step 3 variant: the informant is dead or hostile, and the location is taken from their belongings (`defeat` + `loot`).
- **A vision that names only a planet** (Rebels: a master's vision gives a world, no more). That fits our "the rumour names a SYSTEM, not the place".
- **Rite sites that open rarely** (Clone Wars "The Gathering": a temple whose door opens only now and then). Optional house rule: the Master's site can be entered only at certain hours of the game clock (the world already has a clock).
- **The Master hides** (Cordova in the Unknown Regions, Yoda on a swamp world, Luke on an island). Masters are placed at low-traffic places: ruins, wilds, an island settlement, a wreck. Never in a capital.

### 7.2 The five trials (section 4), one family per stage
Many sources share a five-trial frame (the Legends Jedi Trials: skill, courage, flesh, spirit, insight). Using it as the backbone gives every Master the same five, flavoured per tradition:
1. **Skill**, level 3: beat the Master's pupil or a training droid in a fight that ends at 0 HP without death (Rebels and Clone Wars sparring; the Bounty Hunter "melee" before the hunt in SWTOR). `defeat` at the Master's site.
2. **Courage**, level 5: go into a feared place and come out (the Dagobah cave, the Ahch-To mirror cave, Kashyyyk's dangerous forest floor in the Wookiee coming-of-age rite). `reach` a dangerous area (a high `danger` area on the planet), then return. Gives PROFICIENCY.
3. **Flesh**, level 9: endure. A hunt of the planet's worst creature alone, or a crossing of a hazard (Tusken desert rite in the Boba Fett show; Wookiee hunt). `defeat` of a creature, or `reach` through a hazard the world already models (heat, cold, underwater).
4. **Spirit / service**, level 13: the Master's own need. Recover a stolen weapon, save a pupil, deliver a relic (Mandalorian forge: the armorer melts a weapon down and forges it into something new; Cal's crystal). `loot` + `serve`. Also the gate that a GREAT FEAT can replace.
5. **Insight**, level 17: a choice, not a fight (KOTOR, Rey and Luke: the lesson is what you choose). The Master asks something that tests alignment (spare a beaten rival, or not). The answer sets the mastery's flavour (Light or Dark side power families in stage 2; for weapons, which mastery bonus) and may change Force alignment. `serve` with two endings.

### 7.3 Masters by tradition (who teaches what, ranked by the character's class, species, homeworld, alignment)
| Tradition (inspiration) | Teaches (stage 1 / stage 2) | Who is pointed to them | Trial flavour |
|---|---|---|---|
| Hidden Jedi archaeologist (Fallen Order) | lightweapons / universal and Light powers | Force users, Light alignment | tombs, puzzles, a crystal to find |
| Exiled Sith or dark sage (Legends Bane; Acolyte) | lightweapons, saberwhip / Dark powers | Dark alignment, Sith Pureblood | rivals, betrayal, a holocron |
| Guardians of a temple (Rogue One, Jedha) | staves, bows (lightbow), unarmed / Force sense powers | any alignment, faith, blind or monk backgrounds | pilgrims to protect, a bow to build |
| Mandalorian armorer (Mandalorian) | blasters, vibroweapons, exotic Mandalorian arms | Mandalorians, fighters, bounty hunters | a creed, forging, a duel for a blade |
| Desert tribe (Book of Boba Fett, Tuskens) | vibro-staves (gaffi), cycler rifle | Tuskens, desert homeworlds, outcasts | survival in the desert, a vision, carving your own weapon |
| Wookiee elder (Legends Hrrtayyk rite) | bowcaster, vibroaxe | Wookiees, Trandoshan rivals, forest worlds | the forest floor, a hunt, rope-making |
| Martial artist (Teräs Käsi, Echani) | unarmed, vibroblades | Echani, monks, operatives | sparring ladders, an arena |
| Old gunslinger (Solo: Beckett) | blasters, pistols | scoundrels, operatives, smugglers | a heist, a debt, a code of keeping your word |
| Rebel cell leader (Saw Gerrera, Onderon) | rifles, explosives | anyone against the Empire, war-torn homeworlds | sabotage, raids, a ruthless order to refuse or obey |
| Nightsister (Clone Wars, Jedi Survivor) | Dark and illusion powers (stage 2) | Dathomir, Zabraks, Dark alignment | ichor rituals, a coven's test, a bargain |
| Tech master or droid smith (SW5e engineers, slicers) | tech powers (stage 2), tool-like weapons | engineers, scouts, droids | rebuild a droid, slice a vault |

### 7.4 Fan fiction patterns worth using
Master-and-pupil stories (Qui-Gon and Obi-Wan fiction, Claudia Gray's *Master and Apprentice*) dwell on the RELATIONSHIP: the Master doubts the pupil, a first wound, a first shared meal, a quarrel over methods. Cheap to add: the Master's dialogue card (the local model voices it) carries a "regard" that rises with each trial and with services, and the Master's lines change from cold to warm. A Master can also refuse at first (the pupil must prove worth: a service before stage 1).

### 7.5 What not to copy
No named characters, places or lines from the films and books in the game; generated Masters get generated names and planets. The rites are retold as kinds of trial.

## 8. Open points for the owner
1. Mastery bonus (+1 attack? something else?) and whether exotic weapons need mastery.
2. Level gates 3/5/9/13/17 fine?
3. Old saves: characters already trained through the downtime keep what they have.
4. Does the 3-systems / 3-levels test count systems visited by any party member or by the active character? (I would use the party's travel log.)
5. Stage 2 families for T-016.
6. Use the five-trial backbone of 7.2 (skill, courage, flesh, spirit/service, insight) for every Master, with per-tradition flavour from 7.3?
7. May the Insight trial change Force alignment?

## Sources looked at (2026-11-09)
starwars.com (The Gathering rewatch; Book of Boba Fett chapter 2 highlights; databank: bowcaster, the Armorer, the Stranger, Jedi texts), Wikipedia (Darth Bane; Guardians of the Whills; Tobias Beckett), Wookieepedia and archivum.wiki (Jedi Trials, Gathering, Hrrtayyk/Rryatt Trail, Teräs Käsi, Eno Cordova and the Zeffo tombs, Qordis, Lothal Jedi Temple, Saw Gerrera, Mandalorian Creed, Sacred Jedi texts), reviews and recaps (Den of Geek, TVLine, Gizmodo, AV Club, Looper, GamesRadar, Slashfilm), game guides (KOTOR I/II walkthroughs, SWTOR Bounty Hunter story recap at vulkk.com, Jedi Survivor guides), Fanlore (Qui-Gon/Obi-Wan fan fiction: Lineage, Master and Apprentice, Learning Curve).
