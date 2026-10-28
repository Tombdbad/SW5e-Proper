# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-27, branch `main`. Last commit: `7981686` (earlier work, committed at the user's word;
not pushed). The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## 2026-10-28 (Windows PC, uncommitted): speeder travel opens the minigame; spoken dialogue from Ollama
- Travel fix: `travel()` in GameBoard.tsx opens the road trip for any unblocked party-speeder ride (it used to for "Fly it yourself" only). See REVIVAL_NOTES "The trip". Not browser-tested.
- Dialogue: `server/dialogue.ts` (POST /api/dialogue NDJSON stream, GET /api/dialogue/status), `client/src/components/Play/TalkPanel.tsx`, used on the NPC card and
  the party member card in GameBoard.tsx. Needs Ollama on 127.0.0.1:11434 with `gemma4:e2b` (env OLLAMA_URL / OLLAMA_MODEL). Not browser-tested; `vite build` ran (dist is rebuilt).
  Details and measurements in REVIVAL_NOTES "Spoken dialogue". Another node process (pid from 26/10, port 5057) is the user's dev server: left alone.

## 2026-10-27 (Windows PC, uncommitted, not pushed): the user's long list, step 1 of 4
The user pasted a big list (walls/mezzanine/roof fixes; jumping, grapple, jetpack and climbing outside fights with every roof reachable
and a ladder animation; speeder travel between settlements as a point-to-point race with biome shifts, chases, roadblocks, gunner seats
and collision with scenery; downtime as real minigames with mission givers: bounty, crime, mercenary, gambling with real card rules and
card assets, pit-fight betting; the downtime menu in the test build only). Order of work: 1 visuals (below), 2 on-foot traversal, 3 speeder
travel, 4 downtime minigames and mission givers. Done in step 1 (LocalMap.tsx RoomShell `biome` + `like` props, models.tsx, Atmosphere):
- Roof, balcony, gallery and looked-into rooms take the building's wall set (they were smooth plaster beside sandstone); a gallery's balustrade
  and a roof's parapet use the host/under room's pack walls (`likeOf`); the balustrade stays 1.0 high in the kit walls too.
- Roof terraces and balconies keep their low parapet (WALL_HEIGHT) in the eye views (`parapet` in RoomShell).
- RoomBlock's parapet and the DomeRoof shell are textured with the room's wall set (`TexturedBody`).
- Atmosphere: motes round and soft, a quarter of the size, ~25% more of them (cap 200); the light shaft and the mist are soft-edged
  sprites (they were a box and hard-rimmed discs); dim rooms' ambient lowered (cave .15, ruin .18, cells/reactor .22, slum .2).
- Not yet done in step 1: the doorway's wall opening (exterior blocks have no hole), rounded corners seen with a hard right angle and no texture,
  mezzanine floors clipping through exterior walls: not found in a screenshot yet (ask the user for a building if it cannot be found).
- Looked at with scratchpad `view.mjs` (BUILDING= AT= LOOKS="name:fx,fy,fz>tx,ty,tz") on the dev server 5057; tsc clean in touched files;
  `tests/interiors/atmosphere.test.ts` 7/7 (mote cap test raised from 160 to 200).
- Step 2 done (traversal outside fights; uncommitted): every roof (ladder or not) is reached by a running leap (a roof one storey up, Strength
  (Athletics) DC 10: `ClimbGear.reach` from `jumpReach`), a hook's line, friction grips or a jetpack/rocket boots running (`outsideClimbs`
  now lists roofs as well as balconies; the way down is the same gear, a repulsor pack, or a jump = a fall). The party is SEEN going up or
  down: `verticalMove` (shared/logic) says when, `useTransit` (LocalMap) asks the scene to walk the party to the foot and carry the figure
  along `interiors/transit.ts` (ladder, grips, line with a rope, flight with a flame, leap, jump), GameBoard `leaveBy` awaits it before
  `travel`. Test builds: localStorage sw5e.transitSlow=N slows it N times. Tests: tests/interiors/transit.test.ts (4), climbing.test.ts (+3).
  Exit list keys now include the label (a roof has two ways down to the same building). The palace has no roof room, so none to climb to.
- Step 2b (uncommitted): door fixes (the user, with screenshots): an open doorway showed the neighbour block's wall texture inside its frame
  (exterior to interior, and room to room); now `DoorVoid` (models.tsx) fills the frame with a dark opening on the wall plane (polygon offset), and
  `DoorLeaf` is of the room's own wall set (`wallMaterial`, a little darker, same UV scale as the tiles) instead of planks/metal by set.
  Hangar exterior flashing: `hollow()` in BuildingScene (open-top rooms) had the floor box's side faces in the same plane as the wall boxes' outer
  faces and the E/W boxes overlapping the N/S ones at the corners; floor inset, corners not overlapped, walls now textured with the wall set.
  Research for the card games is in Desktop/SW5e_Games_Research_2026-10-27.txt (no code yet; rules gaps and proposals marked there).
- Step 3a (uncommitted): the card/board games as pure rules, all tested (tests/games, 26): shared/logic/pazaak.ts (the user's pasted rules: 40-card
  main deck, side deck of 10 with 4 dealt, one hand card a turn, stand/end turn, bust over 20, nine cards win, 3 sets), sabacc.ts (classic 76-card,
  Sleeper's procedure with raises and Pure Sabacc = +-23 as house rules; one function per step, `sabaccActions`/`sabaccDo`/`sabaccAi`),
  dejarik.ts (No Name Publishing's copyleft rules, from the user's PDF: 25-space board, 8 creatures, 2 actions a turn, flank/reinforce, push/kill,
  prone, sudden death, Corellian and Imperial variants; credited in CREDITS.md). Each has an AI that plays whole games. NOT built yet: the table
  scene (croupier seated, NPC players, buy-in and bets), the card faces (draw our own; see Desktop/SW5e_Games_Research...), the UI for each
  game, Kirgatz/Chatta-ragul/chance cubes, pit-fight betting, mission givers, and keeping the Downtime menu to test builds.
- Step 3b (uncommitted): seated people at the Sabacc table (the user: the table and a named croupier probably exist; seated NPCs, sit/stand and
  playing animations needed). Found: the 2x2 "Sabacc table" (models.tsx, five stools), the croupier role and outfit, the Life patrons "seated" (they
  only stood at a square beside the table). Now: interiors/limbs.ts `SeatState`/`seatedPose`/`shotPose`/`blendPose`/`easeSit` (legs forward, body
  drops onto the stool, hands up with cards, dealing, and the gestures draw/bet/call/fold/think); `Figure seat={ref} unarmed` (Mover blends the seated
  pose over the walk, hides the ring, shows a fan of cards); `stoolsOf` (models.tsx) gives a table's stools; LocalMap Life: a Setting seat has
  `stools`, patrons choose them (60%), start the scene on them (80%), stay 40-100 s and gesture every 3.5-9 s, get up before they walk (movement waits
  for `sitK`), snap onto the stool (position lerps), and the croupier is a "dealer" brain on stool 0 who deals and calls the game. Patrons and the
  dealer in a room with such a table are `unarmed`. Gallery: `/dev/models?section=table` (?hold=1 freezes it). tests/interiors/limbs.test.ts (+3).
  NOT done: other tables/booths still have standing patrons; the PLAYER's own sit/stand and the game itself (tap the table: walk to a free stool, sit,
  the game panel with cards face up on the felt, the NPC seats bound to game seats, cards sliding when dealt, chips); the croupier works the hours of
  the hall (gambling hall 16:00-06:00), so look for them in a cantina's Gambling room by day.
- Step 4 (uncommitted; the user: "keep going until finished, no more questions"): PLAYABLE GAMES AND JOBS.
  * Sabacc table: tap a "Sabacc table" in a room -> the party walks to the nearest free stool (never the dealer's), sits (`useTable` in LocalMap,
    `partySeat`), Life recruits patrons to fill stools, then Play opens the stake panel and `components/Games/SabaccTable.tsx` (real 76-card hands by
    shared/logic/sabacc.ts; NPCs by `sabaccAi`; seated figures gesture through `lifeLink`; a trained player sees the draw's bust risk). Chips are bought
    in at 20 x the stake and cashed out on leaving (also if the party is moved away: `cashOut`). Cards are SVG (components/Games/cards.tsx), our own art.
  * Pazaak and Dejarik: talk to someone with the gaming set -> "Play it properly" (`gamble-real`): PazaakGame.tsx, DejarikGame.tsx (SVG board, tokens),
    SabaccTable head to head; the stake is put up and the winner paid (`startDuel`/`endDuel`). The old five-check game stays as "Quick game".
  * Contracts (shared/logic/contracts.ts, tests/world/contracts.test.ts 6): bartenders/officers/bounty hunters give bounties; smugglers/informants robberies
    and data jobs; officers den-clearing contracts; tiers open with jobs done for that giver (1/3/6); accepting puts the target+guards, the locked cache or
    the gang into the world (`Occupant.contract`); bounty targets start known only to the system/world/town by tier and are found by "Ask around" checks;
    done is READ from the world (`progress`); "Demand surrender" (Intimidation) takes a target alive for +25%. State: character.playState.contracts.
  * The other downtime activities are people's own (`jobsOf`: pit boss, dockmaster, foreman...): the Trade tab's "Ask X about ..." shows the Downtime panel
    filtered to them (`only`). The Downtime TAB itself exists only when VITE_TEST_MENU=1 (the test copy), as the user asked.
  * Checked in the browser: sit + stake + 3 hands + cash-out; Pazaak match; Dejarik turns; bounty take/ask/report (credits 50 -> 290).
  * Pit betting (shared/logic/pitbets.ts, tests/games/pitbets.test.ts 3; components/Games/PitBets.tsx): ask a pit boss about the pit -> three bouts a day,
    odds from 240 simulated fights less a 5% house cut, one bet a bout a day (playState.pitBets); the bout is fought out on the page. Checked in the browser.
  * NOT done yet: speeder travel overhaul (point-to-point, biome shifts, roadblocks, gunner seats, collisions), Chance cubes/Kirgatz/
    Chatta-ragul as games, the mercenary "defend" variant, mission-giver hours, e2e steps for the new flows, party sit in the eye views.
- Step 5 (uncommitted; the user: "Rebuild and restart 5002, then build the travel overhaul"): 5002 rebuilt and restarted at 16:29 on 2026-10-27 (before the overhaul).
  THE TRIP: "Fly it yourself" is now 2-5 legs of open road (shared/logic/roadtrip.ts; raceCourse(seed, scenery, 1, {block}) gives the road; kind "road" in
  FlightScene.tsx MinigamePage; `trip`/`tripLegDone` in GameBoard): ground shifts by leg, the old ambush on a later leg, a roadblock (stop and pay / Persuasion /
  Deception / ram it; rammed -> its riders chase on the next leg), crewmate seat swap (autopilot drives, pad aims the gun) or the crewmate fires. See REVIVAL_NOTES
  "The trip". FOUND: race scenery was never solid (the prop index was built before the props). Roads and chases are now laid solid (`solid` flag); plain races are left as tuned (solid, the rivals wreck 1 in 5).
  Checked: tests/world/roadtrip.test.ts 10; lab /dev/dogfight?game=road (stop, pay/talk, gun), a five-leg trip through GameBoard on 5057 (scripts in the scratchpad: road.mjs, gun.mjs, trip.mjs).
  5002 (test copy, tailnet :10000) rebuilt at 17:35 on 2026-10-27 WITH the trip; 5057 dev server has it too. e2e step "road trip" passes on 5057 (143 s); full npm test 401/401.
- Step 6 (uncommitted; the user, angry that the wrist hook was missed: real-time jump, hook shots, jetpack): SPACE = jump, F = fire hook, LEFT SHIFT = pack burst,
  E/Enter/click = activate; phone buttons (AirButtons: Jump, Hook, Burst) in the eye views and over the overhead view. interiors/air.ts + LocalMap `airStep` etc.;
  GameBoard `airGear` + `climb`/`power`/`fall` actions. The Wrist-Mounted Grappling Hook was never read as a hook: fixed in gearUse. Details: REVIVAL_NOTES
  "Real-time jump, hook and jetpack on the map". tests/interiors/air.test.ts (5), e2e step "real-time moves" (passes on 5057). 5002 rebuilt after this.
- Process note: on this PC 5000 is the production copy (dist/index.js), 5002 the test copy, 5057 the dev server (Claude's headless one).

## Done this session (details in REVIVAL_NOTES, "Skies, horizons, globes and the land across a course")
The user's request: geographical features in distant views from settlements, clouds, suns/moons/planets in the sky, features met on
the way and in speeder races (gorges, hills, bridges over water/lava), the globe from orbit showing the land, the party drawn as its
ship in space (not standing), and the dogfight's big ships matching the map models.
- shared/logic "Skies and landforms" (`skyLook`, `worldLook`, `landformsOf`, `biomeSky`) + new `components/Map/scenery.tsx`
  (`WorldSky`, `PlanetGlobe`, `PlanetBall`). Used by LocalMap `Sky` (street + settlement, with fog), the planet view's globe,
  FlightScene race/chase, ArenaScene air and space backdrops.
- LocalMap `PartyCraft`: the party in orbit/at a jump point is its ship (campaign `starships` passed in GameBoard's `scene`) or a shuttle.
- Race courses: `layCrossings` (gorge, hill, river/lava + bridges with rails, lava burns), `groundAt` = `landAt` + rivers, `raceWater`.
- Dogfight: `hullSpec(cls, role, imperial)` styles "corvette"/"wedge" after models.tsx; compound hull volume; new capitalGeometry;
  calmer liveries (`busy`), vertex-colour paint, `worldUV` keeps normals.
- Test hooks: atlas `?here=&view=`, `/dev/dogfight?game=race|chase&biome=&seed=`, `window.__raceTrack`, `window.__raceWarp`.

## Checked
- `npm test`: 346/346 (new tests/world/skies.test.ts 4; dogfight hull tests rewritten for wedge + corvette).
- tsc: no errors in touched files.
- Screens (scratchpad scripts, dev server 5057): dogfight cruiser/battleship both looks, orbit globes (volcanic, forest), settlement and
  street horizons (forest, volcanic, swamp), races (volcanic lava bridge, forest river bridge, desert gorge, forest hill), air battles.
- Bot races over the new courses: rivals finish 2:34-2:48.
- e2e on the dev server (5057): 86/88. The two failures (cantina: the bartender called to the bar; trade, which needs it) also fail on the
  pre-session build (5002 baseline: 85/88, the same two plus "a tap on the way out"): frame-rate-bound under software rendering, not new.
  A first run had 83/88 (droid, captive, allies too) before the sky was made cheaper (vertex-coloured dome, fewer clouds, FarGround).
- Frame-rate checks on the dev server are noisy: the first (cold) runs after a change read 3 fps where warm runs read 11-17.

## Processes
- Dev server on 5057 (sw5e_test, VITE_TEST_MENU=1) still running (from the session before). 5000 (prod) untouched.
- Test copy rebuilt from `7981686` and restarted on 5002 (`deploy/windows-start.ps1 -Mode test`, 2026-10-27 02:02); tailnet :10000.
- No e2e running.

## Next
1. The user looks at the test copy (5002 / tailnet :10000). Push to origin only when asked.
2. Not done (in the notes): the street's own ground stays flat (no river or hill on the street map); the horizon is not placed from the
   globe's mountains; the pilot's route and taxi run fly the old flight model over flat ground.

## Learned
- Bash heredocs/`node -e` mangle backticks and `${}`: write patches with the scratchpad `patch.cjs` (blocks @@@ FILE/OLD/NEW/END, CRLF-safe).
- `<fog attach="fog">` inside a group attaches to the group: set `scene.fog` (WorldSky does, and restores it).
- A ShaderMaterial needs `#include <tonemapping_fragment>` and `<colorspace_fragment>` or its colours come out unconverted.
