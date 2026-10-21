# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-21. Branch `revive`. The commit that carries this file is the one after `8067be6` (`git log -1`). `main` and the live service (5000) are not touched: nothing was built into `dist/` or restarted on 5000. 5001 and 5002 run older builds.

## The task (user, 2026-10-21): replace the dice roller with the pasted physics roller
The overlay covers the map whenever a roll is needed; the die comes from the roll (equipped weapon, check, save); the result is held 2 s before the logic uses it.

## Done (REVIVAL_NOTES "Dice on the table")
- `client/public/dice/roller.html`: the pasted page, changed only to take dice from a message, post the faces back (`ready`, `result`), lock after a result, and hide its selector bar.
- `components/ui/DiceRoller.tsx`: overlay, mounted once in `App.tsx` (z-80). 2 s hold. The Home roller is removed.
- `lib/stores/useDice.ts`: `rollOnTable`, queued requests; `navigator.webdriver` gets faces at once (e2e bypass).
- `lib/sw5e/dice.ts`: `playerRoll`, `NeedDice`, `runOnce` and `throwFor` (replay with Math.random recorded), `pageDice`/`faceValues` (d3 as d6, d100 as 2×d10).
- `lib/stores/useCombat.ts`: `onTable` (busy flag); player attack d20, weapon damage, saves, death save, power attack/damage/heal. `rollDamage` takes a label.
- `PlayCombat.tsx`: attack, end of turn, enemy step, reactions, casting, features, death save go through `onTable`.
- `GameBoard.tsx`: `performCheck` (ability checks, companion checks too), haggling, forcing a door, gentling, play for the room, breaking chains, cold-night save.
- Tests: `tests/dice/tableRolls.test.ts`, 7 pass (run it with `node --import tsx --test tests/dice/tableRolls.test.ts`).
- Checks: `npx vite build` to a scratch folder OK; `tsc` no new errors in touched files; headless check of the page alone (scratch harness, not in the repo) got 3 faces in range with no errors.

## NOT verified
- The overlay inside the app: not opened in a browser, no click-through. Check on 5002: `sh deploy/test-plain.sh`, then a check and an attack in Play. Expect the overlay, a 2 s hold, and a log that matches the faces.
- The replay in combat: only the unit test (a fake action) covers it. Check one hit and one miss: each die is thrown once, the log matches.
- The e2e play-through was not run (it takes about 25 min). Its clicks will pass through the webdriver bypass.

## Still random (REVIVAL_NOTES "Not on the table yet")
`stealthRoll` (lying low, sneaking); hazard saves (`deadlyAt`); gamble; forcecasting d100 (`findCrystal`); Hit Dice and healing in rests and items; `checkFor`; augment fitting; combat boons, maneuvers and the enemies' dice; ship fights.

## Next (in order)
1. Click through the overlay on 5002 (above). Fix the phone layout if the label or iframe overlaps.
2. Convert `stealthRoll` (five sync callers, so it needs them made async) and the hazard saves.
3. Run the e2e play-through once the overlay is checked by hand.

## Open questions for the user
- Should the physics dice also show for NPC and enemy rolls? Now they stay instant (each enemy attack would otherwise cost two overlays).
- A d3 is thrown as a d6 (the page has no d3). OK?
- Companion checks throw physical dice too (the player picks the companion). Keep?

## Learned (so the next agent does not rediscover it)
- Combat store actions run inside zustand `set` updaters. `workOf` copies arrays only, so `onTable` restores a structured-clone snapshot before every re-run.
- Each re-run calls `Math.random` again. Without the recording, an enemy's choice can change between runs (`runOnce` replays it).
- The page reports its faces in its own build order (d4, d6, d8, d10, d12, d20, then request order within a type). `faceValues` reverses that order.
- The iframe must receive the `roll` message after its `ready`. Listen for `ready` from mount on (the overlay does).
