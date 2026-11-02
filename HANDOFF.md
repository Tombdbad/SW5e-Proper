# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-02 (Windows PC, a side session started by the main one). Branch **`main`**. origin has main up to e502652; everything after it is local, not pushed (f20b19e, 5df1f3e, f19d3c8, 35ffa4f from 2026-11-01, and this session's commits below).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
Do not push, rebuild 5000 or merge without the user's go-ahead. 5000 still runs the older build e502652.

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

Running: the dev server on 5099 (background `npx tsx server/index.ts`, PORT=5099, VITE_TEST_MENU=1, DATABASE_URL to sw5e_test) is stopped at the end of the session.

Learned:
- The browser pane must be shown (`show_pane` preview) or the page draws no frames: nobody moves or talks.
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
- Should NPC talk be spoken aloud in their voices (Piper), or stay as bubbles?
- (Earlier, still open) delete the e2e leftovers in the real database? Moon periods? Every daytime theft to ring at once?
