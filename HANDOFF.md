# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-02 (Windows PC, a side session started by the main one). Branch **`main`**. origin has main up to e502652; everything after it is local, not pushed (f20b19e, 5df1f3e, f19d3c8, 35ffa4f from 2026-11-01, and this session's commits below).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
Do not push, rebuild 5000 or merge without the user's go-ahead. 5000 still runs the older build e502652.

## 2026-11-02 (5): the pit's weekend card, tickets, staff at posts, underwater bubbles, swimming (REVIVAL_NOTES "The pit's weekend card, bets by ticket, staff at their posts, underwater bubbles")
The user asked for: pit boss and kiosk/stall staff at their posts; NPC bouts at regular intervals reflected in the bets; fights on days 6 and 7 of each week only; talk of high-level results for 2-3 days (0.2/0.1/0.05 after, fewer talks overall) and of the coming bouts on the Friday; adverts at info terminals; no drowning inside an underwater settlement's bubble; no quests starting on the sea floor unless the species is aquatic; the party drawn swimming where the water is. All done, tested, committed with this file (see `git log`); NOT pushed.
- Where: shared/logic/pitbets.ts (calendar, `cardFor`, tickets, `pitNews`/`pitGossip`/`pitLines`), PitBets.tsx (rewritten), GameBoard (`jobsPanel` tickets, `openPit` weekend guard, kiosk card advert, `useTalkWorld` pit/matches effect), LocalMap (`PitBout`, `pitTalk`, `Follower` swimming, `swimmerIn`, `swimsAt`), siteAssets `UnderSea` (district dome), Shooter `swimAt`, shared/logic `placeContents` (own counters), `hazardsAt`, `submergedAt`, `breathesWater`, `worldQuests(..., aquatic)`, contracts `accept(..., aquatic)`, `LIFE` 17.
- Assumptions to confirm with the user: "their multiples" read as every week's days 6 and 7 (13, 14, 20, 21, ...); day 1 a Monday; the weekday for the pit is also the party's own sign-up; same-day talk of a result 3 in 10; "info terminals" = the existing info kiosks and notice boards, plus the arena's odds board; the bubble is the whole ground of an undersea place (no swimming inside it at all).
- Not done / not checked: close-up look at the swimming pose of followers and fight figures; Friday and Monday talk in the browser; the weekday refusal for the party's own pit fight; quests already in a campaign made before stay (campaign 625's "Clear Sunken Ruin"); phone; `npm run e2e`; a build and restart of 5000.
- Learned: an HMR reload of LocalMap/GameBoard leaves two clock stores (the HUD showed Day 1 08:00 while the campaign had day 6): do a full page reload after edits. `import('/src/components/Map/LocalMap.tsx')` from the console is a different module instance after a reload (its stores are fresh): read state from the page text or the API instead. The test server on this PC: load .env with dotenv, set the database name in DATABASE_URL to `sw5e_test` in memory, and spawn `npx tsx server/index.ts` with PORT=5099 and VITE_TEST_MENU=1 (the script I used was a scratch file, not kept; the launcher must wait for the child or the server dies with it). Map taps from the browser tool do not walk the party; dispatching a held `KeyW` keydown on window in the shoulder view does. The test menu's "+8 hours" and "Wait 1 h" move the clock; the clock runs only while the character has hit points.

## 2026-11-02 (4): the arena rebuilt to the user's second design (tiers over the floor, pens under it)
Written up in REVIVAL_NOTES "The arena, second design", committed as d68d6ba.
- What it is: `planArena` in shared/logic (3-4 spectator tiers in a city, 1-2 in a town, round floor with the pit, two ramps up from the pens under the floor, fighters' gate on the far side, `rebuildArena` for life < 16 worlds); "Beast pen" cage model; LocalMap `isArenaBowl` and `PEN_BEASTS`; the arena test in tests/world/layouts.test.ts.
- Tests: the arena test passes (2 s: `node --import tsx --test --test-name-pattern="the arena" tests/world/layouts.test.ts`). The whole file is SLOW (minutes; the audit tests generate 23 worlds): run it in the background, never with a short timeout.
- Browser (dev 5099, test DB, campaign 625, Test tab > Go to "arena"): Rakessos Arena floor and pens render; pens take several seconds to appear after the jump.
- NOT checked: walking the ramps/stairs in play, a pit bout on the new floor, phone, e2e. (Sulolon, a 2-tier arena, was looked at from above: fine.)

## 2026-11-02 (1): talking NPCs, fewer quest-givers, the arena district, smaller stock, rarity
The user decided: rarity = the books' rarity for enhanced items + a house tier (Standard/Premium/Prototype) for plain gear by cost; quest-givers 2 a town, 4 a city, 1 elsewhere; stock 2-4 lines a stall, 4-7 a shop; a master artificer in about one city in four, Advanced at Friendly regard, Legendary at Devoted; an arena in every city and one town in two.
Commits: 14ce06a few give work; 6f34d75 rarity, stock, rewards, artificers; 7a01438 the arena district; 596501c people talking, stands, crowd; 433f580, 77d975d handoff and the palace check (REVIVAL_NOTES has each in full).
NOT checked from that work: a master artificer in the browser (626 has none); the reward item paid on reporting a job; `npm run e2e`.

## 2026-11-02 (2): palace 60%, the model makes NPC talk, street talk, beasts wait apart
The user: "up the roll chance for a palace to 60%, also extend the NPC conversations to people passing in the street, and ensure that these conversations are driven by the Gemma4 (via ollama) llm. Also NPC beasts stand on the exact square at the entrance ..." (and earlier: palaces were not lost, see REVIVAL_NOTES).
- `OPTIONAL_ODDS` (shared/logic, beside SETTLEMENTS): palace 0.6. New worlds only.
- server/dialogue.ts `POST /api/chatter` (one line a request, same SYSTEM so the primed prefix holds, ~3.5 s a line; one talk at a time, 429 otherwise; yields to a waiting player reply); `chatterLine`.
- client/src/lib/voice.ts `chatter` (one lane a page; stock `smallTalk` lines only when the model is not running); relations.ts `chatScene`.
- LocalMap: Life `converse` uses it; `Strollers` walkers are named people of the district who stop and talk; `hitchBy` gives each rider's beast a hitch of its own by each door; `window.__strolls()` for tests.
- REVIVAL_NOTES "The model makes their talk, people in the street talk, beasts wait apart, palaces in 60% of cities".
Checked in the browser (dev 5099 on `sw5e_test`, campaign 626, Ollama with gemma4:e2b): a cantina pair and a street pair talking in model lines; hitches two squares out, none on a door square or shared. Unit tests added (relations, voice). Commit: see `git log` (this handoff is committed with it).
NOT checked: the fallback with Ollama stopped; a phone; `npm run e2e`.

## 2026-11-02 (3): NPCs speak aloud, with natures and bonds from the nemesis system
The user: "Yes NPCs should speak aloud in their own voices, they should also have their own reputation/relationships (use our existing ENRage/nemesis system), which impact their dialogue content". "ENRage" is not in the code: taken to be the nemesis system (personalities, hate tiers, notoriety, news) with regard and families.
- relations.ts `natureOf`, `bondOf`, `partyViewOf`, `townTalk`, `talkNotes`; server/dialogue.ts card lines (bond named, town gossip); TalkPanel `news`; LocalMap `useTalkWorld` (GameBoard sets standing and party name), `talkersOf`, `voiceLine` (ambient speech within 12 squares), gossip in one talk in three; voice.ts `speak` `ambient`/`gain`.
- Fixed: street walkers changed identity when the world changed (now chosen once a district).
- REVIVAL_NOTES "Their own voices, natures and bonds" and a "Play rules" entry.
Checked: relations tests; the route against the live model (siblings vs a grudge); in the browser the arena's spectators' lines went to /api/speech in their voices and the talk carried natures and bonds. Not heard (no sound reaches me); no phone; no e2e.

Running: the dev server on 5099 (background `npx tsx server/index.ts`, PORT=5099, VITE_TEST_MENU=1, DATABASE_URL to sw5e_test) is stopped at the end of the session.

Learned:
- The browser pane must be shown (`show_pane` preview) or the page draws no frames: nobody moves or talks. Background speech needs a first click on the page (the browser holds sound back until then).
- A dev server stopped with TaskStop can live on (its tsx child kept port 5099): check `netstat -ano | grep :5099` and stop that pid before starting another.
- Fastest place to see NPC talk: an arena floor (spectators talk every few seconds); a cantina can be quiet for minutes.
- The map gets the world as the clock has it: at a given hour a district may hold only one or two locals (Theed Market at noon: 1), so walkers are topped up from the settlement.
- `read_network_requests` urlPattern is a substring, not a regex.
- The test menu's place list shows 300 at most: type in its search box (`test-find`).
- For a look from above: `(await import('/src/components/Map/interiors/aim.ts')).useView.setState({ shooter: false, mode: 'overhead' })`.
- The dev server does not reload server code (dialogue routes, `/api/world/liven`): restart it after changing server/ or shared/logic.

## TODO / next, in order
1. The user looks at the talk (cantina, street), the beasts and the arena and says what is off; then a build and restart of 5000 if they want it.
2. `npm run e2e` against a build (not run).
3. Older items still open: balustrades, night and moons, riders, room changes (2026-11-01 list); phone check over Tailscale; e2e failures (cantina people not moving in 20 s, speeders "did not travel", road-trip guards not chasing); fat lines.

## Open questions for the user
- Should bonds between people change with play (now they are worked out from the world each time, nothing is kept), e.g. after the party helps or wrongs one of them?
- (Earlier, still open) delete the e2e leftovers in the real database? Moon periods? Every daytime theft to ring at once?
