# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-03 (Windows PC). Branch **`main`**. origin/main is at 1277668; everything after it is local, NOT pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
Do not push, rebuild 5000 or merge without the user's go-ahead. Port 5000 runs the OLD build 1277668 (started by hand).

## 2026-11-03 (11): the user's request, shooter first
"Continue with the 'still to do' 325 items + any force/tech powers that we do not yet have logic for ... extend the smuggling/contraband
mechanics (slaves and other illicit items, hiding contraband on ships, stop and search, fly casual, smuggler outfit, hidden pockets, weak
minded force powers) ... cybernetic eyes/ears/binoculars/heightened force/tech senses. Focus on the shooter implementation for now."
Done so far (this commit):
- shared/logic `fightFactsOf` (FightFacts on ItemEffects.fight): 213 enhanced items now carry shooter facts; unread 325 -> 68 (all class-feature
  charge items, class augments, tools, vocoders, droid interface protocols: RPG, later). `chosenResistance` (Adapted Armor by name: house rule).
  Widened: numbered properties ("barbed (1d4)", "thrown (10/30)"), "reduced by N steps" (lowerSteps), "gain darkvision", movement speed, AC 13+Dex chassis.
- shooter.ts: Unit states held/slowed/charmed/oblivious/turned/disarmed/acDown/mark/buffs/decoy/once/cloaked/anchored/channel/senses/imbue;
  Buff; Rider on Gun/Blade (`partyStrike`: extra, opener, pierce, maser, slow, haste, chain, burst, shove, critFollow, doubles); foe crits
  (SHOOT.crit 5%, x1.7) unless critImmune; duplicates/reactions (`warded`), retort; cloaked party unseen beyond 1.8 sq (a shot reveals:
  `reveal`), foes go to `sim.lastSeen`; zones (Field.obscure/slow), holograms; new GearActs snare/harpoon/overload/amplify/cloak/anchor/hidden/
  cast/leap/eye/light; castPower rewritten for 24 kinds + focus/wristpad channel + subroutines.
- realtimePowers.ts: `readMore` reads 156 more powers from text (332/465 play; 133 left are utility/exploration). 18 powers, keys 1-9, 0 pages.
- GameBoard `fightWithItems` (riders, defences, channel, senses), belt from `itemFight` (rest uses in featureUses `item:`/`item~`, short rest
  clears `item~`), `itemPower`/`storedPowers` (rings: by name, house rule), air gear from mods (flight, harpoon hook, leap), fall braces.
- Scene: status rings/nets/words, through-wall sense markers, hologram figures, fog domes, harpoon lines, shield bubble, duplicates, spotlight,
  zoom (Y, camera.zoom), hearing pings; HUD buffs/states/pages/zoom reticle; LocalMap walks at `stance.pace`.
- Checked: tsc 0; tests/combat 65 pass. NOT run: full npm test, vite build, browser.

Then (second commit): contraband in the shooter. shared/logic `STOP`/`stopBegin`/`stopTick`/`stopSearchTotal`/
`stopTrickWorks`/`stopBribe*`; GameBoard `searchParty(areaId, why, d20?)` starts a live stop in the shooter (`stopPanel`, ticks on
`stance.movedAt` set by LocalMap); hidingPlaces takes fitted pockets; collapsible suit not seized; `play.hold` (ship hold, Hidden Storage
suite) searched on landing; `slavePanel` at black-market dealers where a syndicate rules (`slavePrice`, `slaveMarket`). Foe natural 20 =
lowest twentieth of the roll (keeps old seeds). tests/combat/shooteritems.test.ts (10). REVIVAL_NOTES: three new sections.

## 2026-11-03 (12): the dice table's frame rate (the user: "extremely low FPS")
Measured with GPU timer queries (dev server on PORT 5001 via `.claude/launch.json`, untracked; 5000 not touched): table 19 ms GPU -> 6.4
(`ren.look = false`, pixel ratio <= 1.5); the map under it no longer draws while it shows (`COVER` in Map/babylon.ts; checked: 41 map
frames in 1.5 s before, 0 during, 41 after); no physics or drawing between rolls; 8 catch-up steps so the dice keep speed down to 15 fps.

## TODO / next, in order
1. Done: npm test 583 pass, 3 skipped, 0 fail; vite build to scratch clean; tsc 0. Committed.
2. Ask the user: build, restart 5000, push. Browser-check: a fight with powers 1-9/0, a net, a harpoon, Y zoom; a customs stop (shooter
   campaign, carry a blaster rifle into a strict port); the pens at a fence on a Hutt world.
3. Later (RPG): the 68 unread class-feature items, the 133 utility powers, the stop and search for the tabletop (it keeps its roll).
