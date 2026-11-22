# AUDIT 05: Play-through tests (2026-11-07 and 08, branch `audit`)

## Plain-English summary
- I wrote 12 browser scripts (in `e2e/audit/`, nothing else in the project was touched) and played the game like a person on a **simulated desktop (1280x720)** and a **simulated phone (390x844, touch)**. All 12 flows finished on both screens, 24 runs in total. "Finished" only means my script got to its end; the notes below say what was and was not actually proved.
- Everything ran against a **separate test copy** of the game (port 5099, the `sw5e_test` database), never the real game on port 5000. One extra test copy (port 5098) was started with the dialogue model pointed at nothing, to see what the game does without it.
- **What works:** creating three kinds of character (including a Force caster), generating two campaigns, walking between rooms and out of buildings, a tabletop fight with a power, a shooter fight, buying and wearing gear, taking a bounty job, a full game of Pazaak, two players in one co-op game (the host's clock change appeared on the guest's screen), talking to a person with the local AI, and a clean fall-back when the AI is switched off.
- **5 real problems found:**
  1. **Speech fails about one time in three.** The server answered `POST /api/speech` with an error 19 times out of 55 requests during this audit: "EBUSY: resource busy or locked" (the file is renamed while Windows still holds it). The page falls back to silence or the browser voice.
  2. **A React warning ("two children with the same key") is logged 50 to 111 times in every fight**, tabletop and shooter, on both screens. It is harmless to play but it is noise in a project that wants zero warnings.
  3. **On a phone, the shooter screen is crowded**: the compass sits on top of the Aim and Grenade buttons, a message is cut off at the left edge, and keyboard hints ([G], [Z], [T]) show on a touch screen.
  4. **The Pazaak table on a phone is see-through:** the HUD tabs show through the card panel.
  5. **Using a Medpac from the inventory did nothing in my run** (HP 12 stayed 12, the Medpac stayed in the pack). It may need a second click to choose who to use it on; I did not find out (UNVERIFIED).
- The AI dialogue works, but is **slow on screen**: the reply took 43 to 47 seconds to appear on screen, against 5 to 7 seconds when the dialogue service is called directly. The test PC uses software graphics and was busy, so a real phone may differ.
- Things I could **not** prove are listed at the end (defeat and respawn in the shooter, completing a quest and its reward, galaxy to system to planet travel, frame rate).

## How it was run
- Server: `tsx server/index.ts` on port 5099 with `DATABASE_URL` pointed at `sw5e_test` and `VITE_TEST_MENU=1` (a development server, so first loads compile on demand). Port 5000 was left alone; the harness refuses to run against it.
- Scripts: `e2e/audit/h.mjs` (shared helpers) and `01_create_character`, `02_create_campaign`, `03_travel` (flows 3 and 4 together), `05_tabletop_fight`, `06_shooter_fight`, `07_inventory_trade`, `08_quests`, `09_dialogue_voice`, `10_persistence`, `11_coop`, `12_card_game`, `99_cleanup`. Each is run once per screen size.
- Settings borrowed from the project's own e2e: software 3D (SwiftShader), automatic skill checks on, no random street encounters. These hide the "who rolls" dialog and the encounter flow, so those two things were **not** exercised.
- Setup shortcuts: characters and worlds for flows 3 to 12 were made through the API (as the project's own e2e does); the flow under test was driven through the screens. Flow 1 (characters) and flow 2 (campaigns) used the screens for the whole flow.
- Artifacts: screenshots, JSON per flow and screen in `AUDIT/05_artifacts/<flow>/`, and logs `AUDIT/05_artifacts/NN.log`.
- Evidence of isolation: the test server listed 6 campaigns and 2 characters at the start; the real database had 8 and 4 (`AUDIT/tmp/dbcheck.mjs` output).

## Results table

"Console errors" means browser console errors and page errors; "Failed requests" means HTTP 4xx/5xx and requests that failed. A dev-server note: `net::ERR_ABORTED` on `/src/...` files is the page navigating away while files were still loading; it is not a game fault. The "GPU stall due to ReadPixels" warning appears once per run and comes from the software graphics.

| Flow | Desktop result | Phone result | Console errors | Failed requests | Screenshot paths | Notes (what felt broken or confusing) |
|---|---|---|---|---|---|---|
| 1 Create character (Human Fighter, Zabrak Consular, Mirialan Scout) | PASS: all 3 saved and read back equal (HP 12 / 9 / 11, AC 13 / 12 / 13, 4 power points for the Consular) in 130 s | PASS for the 2 tried (Fighter, Consular) in 47 s | none | 5 aborted module loads (dev server) | `AUDIT/05_artifacts/01_create_character/` (19 desktop, 13 phone) | Phone: the creation tab strip is cut at the right edge (the "Background" tab shows only as "B"). |
| 2 Create campaign, tabletop and shooter | PASS both: generated in about 1.6 s, saved in about 3 s, "Map is sound", mode saved as chosen; game open in 13 to 21 s | PASS both (game open 14 to 15 s) | none | none | `02_campaign_tabletop/`, `02_campaign_shooter/` | Mode is asked in a dialog on first play, and was saved correctly each time. |
| 3 and 4 World, travel, enter buildings, stairs, leave | PASS: 8 hops through corridor, entrance, roof, street, market; world made in 0.9 s, 569 areas, validate: no problems | PASS (same route) | none | none | `03_travel_and_buildings/` | Only local moves were walked; **galaxy to system to planet travel was not exercised** (UNVERIFIED). My route bounced between "Roof" and "Ulatx Market" (my walker's choice, not a game fault). |
| 5 Tabletop fight (Consular, a power, melee) | PASS: fight started, Force Push/Pull cast, damage both ways, death saves rolled. Desktop ended with the character **Dead** (HP 0) after a Hive Rat; no XP gained | PASS: ended at 1 HP; no XP | 68 / 50 React duplicate-key errors | none | `05_tabletop_fight/` | A level 3 caster with 28 HP went down to a Hive Rat (22 HP, bites of 5 to 8) in about 5 rounds, and on desktop died. Possibly harsh for the level; not judged. Dice, "Round N begins", death saves and conditions (grappled, unconscious) all appeared. 0 Force points spent (the power is at-will). |
| 6 Shooter fight | PASS: session started, moved, aimed and fired (12 to 9 rounds in the magazine), foe died within about 12 s ("victory"), saved XP 50 | PASS: took a hit (40 to 33), same win, XP 50 | 79 / 79 React duplicate-key errors | none | `06_shooter_fight/` | **Defeat and respawn were not exercised:** the fight was already won when I forced the player to 1 HP (my script's "HP 40 to 0" reading is the HUD resetting after the win, not damage). Phone layout problems: see the list below. |
| 7 Inventory (buy, equip, unequip, use, drop) | PASS: bought Novanian grog (1,500 to 1,436 credits), weapon "Put away" and "Wield", armor off AC 14 to 13 and back to 14 | same | 3 / 0 (speech 500) | 3 x `POST /api/speech` 500 (desktop) | `07_inventory_trade/` | **No drop control exists** (searched for "drop" and "discard"). **Medpac "Use" had no visible effect** (HP and pack unchanged; see problem 5). Item names wrap awkwardly in the narrow side panel. |
| 8 Quest / contract | PARTIAL: the quests tab lists the generated bounty ("Zan Yarro, pays 220 cr, ask around DC 10"); the bartender's job controls appeared and the job was **accepted** into the Jobs list | same | 2 (speech 500) | 2 x speech 500 | `08_quests/` | The API-made campaign had no story quests, so the quest tab started empty. **Progress, completion and reward were not reached** (UNVERIFIED). |
| 9 Dialogue and voice, AI on | PASS: dialogue service first byte 1.0 to 1.2 s, whole reply in 5 to 7 s; speech file 55 KB in 0.7 s; on screen the reply appeared after 43 s (desktop) and 47 s (phone) | same | none | speech 500 seen elsewhere | `09_dialogue_ai_on2/` | Reply sounds in character ("Work? (hmm) Not much but the usual drudgery"). The first version of my script read the "is thinking..." placeholder as a reply; fixed and re-run as `ai_on2`. |
| 9 Dialogue and voice, Ollama switched off (second test server) | PASS (graceful): the service answers a clear "The dialogue model is not running (is Ollama started?)." and the page shows its "talk off" notice instead of the talk box; speech still works | same | 1 (speech 500) | 1 x speech 500 | `09_dialogue_ollama_off/` | No crash. Piper stayed up; I did not test Piper missing. |
| 10 Persistence (clock, exit, equipment, reload) | PASS: after a reload HP, credits, location, equipment and conditions were all the same; the world clock had moved on a few minutes (it runs while the page is open) | same | none | none | `10_persistence/` | Quest state: not tested (no quests on this campaign). |
| 11 Co-op (two browser contexts) | PASS: host code shown, guest joined with the code, host saw both members, the host's "until evening" appeared on the guest's clock, campaign clock saved | PASS (both contexts phone-sized) | none | none | `11_coop/` | The co-op panel tells the host to restart with `deploy\windows-start.ps1 -Mode prod -Lan`, but that script says `-Lan` now does nothing (LAN is always on); stale wording. |
| 12 Card game (Pazaak) | PASS: from the gambler's card through 3 sets to "Dollo wins the match, 3 sets to 0"; credits 2,000 to 1,900 (stake lost) | same | none | none | `12_card_game/` | Phone: the panel is see-through (see list). Only Pazaak was played; sabacc and dejarik were not. |

Run-to-run timings (software graphics on a busy PC, not a phone): game open 7 to 21 s; first screenshot of a 3D scene sometimes took longer than the default wait. **Frame rate was not measured** (the project's frame counter was not installed by my harness).

## Things that look wrong in screenshots
- **Phone, character creation** (`01_create_character/phone_02_Fighter_2_species.png`): the tab strip is clipped at the right edge; "Background" shows as "B". It may scroll sideways, but nothing shows that it does.
- **Phone, shooter** (`06_shooter_fight/phone_02_fight_start.png`): the compass overlaps the "Aim" and "Grenade, co..." buttons at the top right; a message at the left reads "...sage down to Winding tunnel!" with its start cut off; the hint text "Grenades x1: Grenade, corrosive next [G]" sits across the centre of the screen over the character; the keyboard letters [G], [Z], [T] are shown on a touch screen; button labels are cut ("Grenade, co...").
- **Phone, talking to a person** (`07_inventory_trade/phone_03_inventory.png`): a gold speech bubble sits on top of the person's name card so both are hard to read; the map behind is nearly black.
- **Phone, Pazaak** (`12_card_game/phone_02_pazaak_start.png`): the card panel is translucent, so the HUD tab names ("Party", "Trade", "Quests", "Enemies", "Comms", "Downtime", "GM Interface", "Test") and the Dollo card show through the panel, behind the cards and text.
- **Desktop, first view of a cantina** (`03_travel_and_buildings/desktop_02_hop0_Corridor_to_Main_bar.png`): large flat solid-black shapes fill the neighbouring rooms ("Entrance", "Private booth") in the overhead view. In the same cantina in other screenshots (`08_quests/desktop_04_quests_after.png`) the room shows lit detail, so the black shapes may be unlit or hidden rooms; it looks unfinished either way. Whether a real phone's graphics show the same is for the phone checklist.
- **Desktop and phone, side panel:** the exits list is rows of buttons packed with no gap ("Doorway to Entrance (10 ft.)" and the next rows touch), and the "Test" tab is visible because this was a test build.
- **Co-op panel, phone** (`11_coop/phone_04_host_sees_guest.png`): readable and complete; the wording about `-Lan` is out of date (above).

## Other things noticed
- `server/speech.ts` writes the speech to a temporary file and renames it; on this Windows PC that rename is refused about a third of the time. It cached 36 good answers and returned 19 errors in this audit.
- The running production server (port 5000) is listening on **all network interfaces** (`0.0.0.0:5000`, from `netstat`), which matches `deploy/windows-start.ps1` ("always on the local network ... HOST=0.0.0.0", user's decision of 2026-11-01). `CLAUDE.md` still says "loopback only unless HOST is set; do not set HOST=0.0.0.0 without the user's go-ahead". The two documents disagree; the script and the live server agree with each other.
- The audit left the cache `.cache/speech/` (ignored by git) with new speech files, and 59 rows (33 characters, 26 campaigns) in `sw5e_test`. `99_cleanup.mjs` removed all 59 (0 failed); afterwards the test database again held 6 campaigns and 2 characters, as at the start, and the real database was unchanged at 8 and 4.

## UNVERIFIED:
- Defeat and respawn in the shooter (the fight was won before the forced defeat); the shooter's damage-taking was seen only on the phone run.
- Quest progress, completion and reward; story quests (none existed on the API-made campaign).
- Galaxy to system to planet to settlement travel (only moves between places inside one town were walked); double-tap drill-down on the map.
- Whether a Medpac heals (my click showed no change).
- Frame rate and lag; first-render time of the 3D scene on a real device (only software-graphics timings were taken).
- Sabacc and dejarik; stairs by tapping the 3D map; dropping items (no control found).
- The skill-check dialog and street encounters (switched off by the harness settings).
- Piper missing (only Ollama was switched off); the microphone path; spoken audio quality (nothing was listened to).
- Real touch behaviour: Playwright's simulated taps are not a finger.

## REMAINING:
- Re-run flows 6 and 8 with a tougher foe and with a campaign that has story quests (the project's `e2e/shooter-defeat.mjs` and `play.mjs` quest steps may be reused).
- Walk the galaxy view (`/map` and the Galaxy/System buttons) and a speeder route.
- Find out why the speech rename is refused and whether the duplicate-key warning comes from the combat log or the map.
- Run `AUDIT/05_phone_checklist.md` on a real phone.
