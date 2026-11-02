# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-02 (Windows PC, a side session started by the main one). Branch **`main`**. origin has main up to e502652; everything after it is local, not pushed (f20b19e, 5df1f3e, f19d3c8, 35ffa4f from 2026-11-01, and this session's commits below).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
Do not push, rebuild 5000 or merge without the user's go-ahead. 5000 still runs the older build e502652.

## 2026-11-02: talking NPCs, fewer quest-givers, the arena district, smaller stock, rarity
The user's request (via the main session): NPCs talk to one another; fewer quest-givers; pit fights and betting in an arena district (a huge round amphitheatre, a viewing platform of cheering NPCs, a betting room with a kiosk, a sign-up room); vendors stock less, fitting their star system; a rarity on every item, the rarest from mission rewards, rare upgraders few and unlocked by regard.
The user decided (asked 2026-11-02): rarity = the books' rarity for enhanced items + a house tier (Standard/Premium/Prototype) for plain gear by cost; quest-givers 2 a town, 4 a city, 1 elsewhere; stock 2-4 lines a stall, 4-7 a shop; a master artificer in about one city in four, Advanced at Friendly regard, Legendary at Devoted; ordinary technicians capped at Premium (Prototype in a Core city). My default, not asked: an arena in every city and one town in two.

Commits (REVIVAL_NOTES has each in full):
- 14ce06a Few give work (contracts.ts `giversIn`, `workFrom`). REVIVAL_NOTES "Few give work" under "Games at the table, jobs from people".
- 6f34d75 Rarity, smaller stock of the system's goods, rare rewards for jobs (+25 regard with the giver), master artificers. REVIVAL_NOTES "Rarity, smaller stock, master artificers, rare rewards".
- 7a01438 The arena district (generator, jobs, life-15 migration); 596501c people talking, the stands and the cheering crowd on the map and round a pit bout. REVIVAL_NOTES "The arena district, and people who talk to one another". `npm test`: 539 pass, 3 skipped.

Checked in the browser (dev server on 5099 against `sw5e_test`, campaign 626, Naboo): stock with rarities and premium-capped mods at Theed's armsmith; only the chosen bartender offers jobs in the cantina; inventory rarity; the arena (life-15 migration added Theed's and Kaadara's), its stands, crowd cheering, pit, conversation bubbles between spectators, the bookmaker's bets, the pit boss's pit, a bout on open sand with the crowd round it.
NOT checked: a master artificer in the browser (campaign 626 has none: Theed's hash says no; unit-tested only); the reward item paid on reporting a regional job; conversations in a cantina (the pane was hidden, no frames); `npm run e2e`.

Test database: campaign 626 was rolled back once to life 14 without arenas (a first migration had run with older code) and livened again; a copy of the earlier state is in my scratchpad only. The dev server on 5099 (background, `npx tsx server/index.ts`, PORT=5099, VITE_TEST_MENU=1, DATABASE_URL to sw5e_test) is stopped at the end of the session.

Learned:
- The test menu's place list shows 300 at most: type in its search box (`test-find`) to reach the arena's rooms.
- A shooter-mode campaign has no overhead view; for a look from above in the browser: `(await import('/src/components/Map/interiors/aim.ts')).useView.setState({ shooter: false, mode: 'overhead' })` (local only, a reload undoes it).
- The dev server does not reload server code: the `/api/world/liven` migration runs on the server, so restart it after changing shared/logic before letting a page liven a world.
- tests/world/security.test.ts's patrol test picked the first patrol in the world; the arena's areas moved the ids, so it now picks one where a garrison answers.

## TODO / next, in order
1. The user looks at the arena, the talk, the stock and rarity and says what is off; then a build and restart of 5000 if they want it.
2. `npm run e2e` against a build (not run).
3. Older items still open: the user's look at balustrades, night and moons, riders, room changes (2026-11-01 list); phone check over Tailscale; e2e failures (cantina people not moving in 20 s, speeders "did not travel", road-trip guards not chasing); fat lines.

## Open questions for the user
- Arena in every city and one town in two: right, or fewer?
- People in the district's streets do not stop to talk yet (only those in the room the party is in): wanted?
- (Earlier, still open) delete the e2e leftovers in the real database? Moon periods? Every daytime theft to ring at once? Piper voices?
