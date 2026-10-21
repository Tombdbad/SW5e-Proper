# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-21. Branch `revive`. The commit that carries this file is the one that adds the dice overlay (`git log -1`). `main` and the live service (5000) are not touched: nothing was built into `dist/` or restarted on 5000. 5002 runs an older build; 5001 an old build too.

## The task (user, 2026-10-21): replace the dice roller with the pasted physics roller
Copy the pasted page; the overlay covers the map whenever a roll is needed; read the die the roll needs (equipped weapon, check, save); hold the result 2 s before the logic uses it.

## Done (REVIVAL_NOTES "Dice on the table")
- `client/public/dice/roller.html`: the pasted page, changed only to take dice from a message and post the faces back (`ready`, `result`).
- `components/ui/DiceRoller.tsx`: overlay mounted once in `App.tsx`; 2 s hold; the old Home roller is removed.
- `lib/stores/useDice.ts`: `rollOnTable`, queued requests; webdriver bypass for e2e.
- `lib/sw5e/dice.ts`: `playerRoll`, `NeedDice`, `throwFor` (replay), `pageDice`/`faceValues` (d3 as d6, d100 as 2×d10).
- `lib/stores/useCombat.ts`: `onTable`; player attack d20, weapon damage, saves go on the table. `PlayCombat.tsx`: attack, end of turn, enemy step, reactions go through `onTable`.
- `pages/GameBoard.tsx`: `performCheck` is async and throws its d20s (and the substance die) on the table.
- `tests/dice/tableRolls.test.ts`: 6 pass (`node --import tsx --test tests/dice/tableRolls.test.ts`).
- `npx vite build` into a scratch folder: OK. `tsc`: no new errors in touched files (2 pre-existing ones remain, lines not touched).
- Headless check of the page alone (scratch harness, not in repo): it loads three and cannon from cdnjs, takes a `roll` message, and posts `result` with 3 faces in range. No page errors.

## NOT verified
- The overlay inside the app: not opened in a browser. Check: start a roll (attack in combat, or a check in Play), the overlay covers the map, the dice settle, the total stays 2 s, then the logic continues.
- Nothing deployed. To see it: `sh deploy/test-plain.sh` (5002), then the tailnet URL.
- The replay in combat: only the unit test covers it (a fake action). Check one real attack hit and miss on 5002: the log should show one roll per die, not two.

## Still random (listed in REVIVAL_NOTES "Not on the table yet")
GameBoard's other direct rolls (haggling, performance, animal handling, poison save, Hit Dice, healing, gamble, forcecasting d100); substance and tool boosts in combat; powers and features; death saves; ship fights.

## Next (in order)
1. Click through the overlay on 5002 (above). Fix layout on a phone if the label or iframe overlaps.
2. Decide whether the remaining random rolls go on the table (list above).
3. The e2e play-through: it should pass without the overlay (webdriver bypass). Not run in this session.

## Open questions for the user
- Should the physics dice also show for NPC and enemy rolls? Now they stay instant (to keep each enemy attack from costing overlays).
- A d3 shows as a d6 (the page has no d3). OK?

## Learned (so the next agent does not rediscover it)
- The combat store's actions run inside zustand `set` updaters. A throw inside one leaves the store untouched, but `workOf` copies arrays only, so `onTable` restores a snapshot before every re-run.
- The page reports its faces in its own build order (d4, d6, d8, d10, d12, d20, then request order within a type). `faceValues` reverses that order.
- `/home/ubuntu/SW5e-Proper` working tree had no other changes when this session started.
