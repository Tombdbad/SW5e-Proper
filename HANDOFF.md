# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-30 (Windows PC), branch `main`. Nothing is pushed. Last session's commits today: 9042b8b, f6dade7, c1676ba (sound lab, Piper), 1f40c6f, 34d446f (people, regard, comlinks, microphone), then the commit for the law in person (below).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-10-30, the law in person, cells, shops, errands (REVIVAL_NOTES "The law in person, cells, shops by day and night, errands")
- The user's list: captives in physical locked cells; NPCs walking to homes, jobs, traders, the palace, the garrison to report crimes; security physically dispatched from the garrison unless a patrol is nearer; troopers not reacting to hacking and theft from locked boxes; shop stock that can be stolen (day: immediate dispatch, night: alarms and cameras to disable).
- Done in shared/logic/index.ts (LIFE 14): `reportCrime(.., via)` dispatches squads from `lawBase` (the garrison) after a turnout, they run a room a minute (`townPath`, `Squad.to`); `nearestPatrol` goes first if closer; `ReportVia` (law/alarm/shopkeeper/camera/call/witness), a witness without a commlink walks to the garrison (`World.errands`, `errandAt`, `withPresence`); `Routine.patrol` and `Routine.visits` (palace calls, trader rounds); cells (`cellOf`, `openCells`, `RoomAsset.cell`); shops (`STOCK_PIECES`, `shelfStock`, `shopArmed`, `disarmShop`, `noteTheft`, `advanceDiscoveries`, `Ledger.stolen`); `pullPatrols`, wider `isLawman`.
- GameBoard: `slipped()` now guards locks, caches, panels, cells, shelves and the shop door whatever the danger of the place (the troopers-do-not-react bug); cell card, shelf card (Buy / Take it), shop alarm disarm on the alarm panel, door sensor in `breakIn`, discoveries effect. LocalMap: squads seen from the muster, open cell drawn open (models.tsx), shelves show what is left of the stock (`useDisplay`).
- Tests: tests/world/security.test.ts (8). Full suite run once during the work (see the commit message for the count); `npm run e2e` NOT run.
- Browser-checked on dev 5099 / `sw5e_test`, campaign 498 (its world was replaced by generated seeds 3, 11): the cell card, an open cell, a shelf card with real stock, lawmen seeing the console, squads leaving the garrison, running to the scene and finding the party. The dice rolls (throttled pane) were not waited out, so pick/Sleight/door-sensor results were not seen end to end.

- Latent bug seen, not fixed: with the dice shifted, seed 34 (detail all) puts a gambling hall's High-stakes room out of reach (its corridor stops short of it, the cashier's cage in between). Any change that draws from the generator's stream may bring it back: fittings use their own dice (`fitBuilding`).

## Running
- A dev server of mine on 5099 (test database) may still be running (`node --import tsx server/index.ts`, started from the scratchpad `devtest.cjs`); stop it if it is. The game server the user runs needs a restart for the new server code (patrol/visit generation lives in shared logic, so new worlds).
- Old campaigns get patrols, visits and shop alarm panels when opened (livenWorld life 14), but no new cell furniture in rooms already built.

## TODO / next, in order
1. Run `npm run e2e` against a fresh build when the user is not playing (the captive step uses a synthetic captive with no cell: legacy path; the pursuit text now says "sent from ...").
2. Settlements' own crimes (`rollIncident` squads) could be dispatched from the garrison too.
3. Security tags on stock; a witness stopped on the way should stop the report.
4. From earlier today (still open): real microphone, co-op message between two clients, a phone; Piper voices matched to gender needs listening.

## Open questions for the user
- By day an UNSEEN theft is found when the keeper counts the stock before closing (and reported then); only a SEEN theft (or a camera) sends the law at once. Say if they want every daytime theft to ring at once (security tags).
- Piper voices are random per person (seed): should the model's speakers be sorted into low/high voices so a Hutt or a woman gets a fitting one? (needs listening)

## Learned
- A heredoc with an apostrophe or backtick breaks the Bash tool's quoting: write patch scripts and text blocks with the Write tool and read them with `fs` in a `.cjs`.
- The dice in the browser pane roll very slowly (hidden/throttled): a check dialog can take over a minute to settle; reading the state through `/api/campaigns/:id` shows the saved result.
- Dev server on another port against the test DB: derive DATABASE_URL from `.env` in a script (never print it).
