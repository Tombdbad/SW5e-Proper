# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-02 (Windows PC). Branch **`main`**. origin/main is at 1277668; everything after it is local, NOT pushed: 5240b30, 71151e7, 402355a (shooter gear) and this session's last commit (item wordings, tabletop gaps, this file).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
Do not push, rebuild 5000 or merge without the user's go-ahead.

## Running
- Port 5000: build 1277668 (OLD), started BY HAND (`node dist/index.js`, NODE_ENV=production, loopback). `deploy/windows-start.ps1 -Mode prod` could not kill an old test server on 5002 (pid 9468, Access denied): run it from an administrator window.
- No dev server is running (the 5099 test one was stopped; start it with `DATABASE_URL=<.env's, /sw5e -> /sw5e_test> PORT=5099 VITE_TEST_MENU=1 npx tsx server/index.ts`). The test campaign 625's clock is back on day 1 (the pit is shut on weekdays): patch `timeElapsed` from a non-game page to reopen it.

## 2026-11-02 (9): every item a use in the shooter; foes and nemeses use gear; enhanced wordings read
The user: "ensure EVERY item has an in-game function relevant to the item's intended use case ... generate NPC behaviours ... (utilise/extend the nemesis) ... deepen the games functionality as a shooter". Write-up: REVIVAL_NOTES "Gear in the shooter, and foes that use theirs" and "Enhanced items' wordings read, and the tabletop's gaps"; two Play rules lines.
- 402355a: the shooter's item belt (Z use, T next; `applyGear`, `FightGear`, GameBoard `fightGear`), all explosives by `gearUse` (`blastOf`), mines/charges/detonator, teleporter (`ShooterCtx.place`), extinguisher, binders/bolt, jammer, rocketpack rockets, grenade launcher, bipod/tripod, resistances/temp/absorb/regen/conditions/burning ground (`seep`), foe kits (`foeKit`: stat block area actions lobbed or sprayed, grenades, medpacs), calls for backup (`callForHelp`, reserves `backup-N`), nemesis `learnKit` / `NemesisRecord.kit`. Fight end: kits lose uses, substances run their high/low.
- Last commit: `parseItemEffects` reads proficiency steps/tiers, power attack/DC bonuses, robe damage, resistances, lost/lowered weapon properties, plain augments, clothing armour properties (unread 714 -> 325); applied in checks, saves, powers, resistances, `carriedWeapons` (`reshaped`), `wornTraits` (armour/clothing mods' properties: were never counted). Rocketpack launcher in the tabletop fight; focus generator card; vest read from its text and worn.
- Checked: tsc 0; tests (shootergear 14, itemwordings 4; full `npm test` 573 pass + 3 skipped; vite build clean); browser (test DB, campaign 625, pit bout): belt items used and settled after the fight. NOT checked in a browser: foes throwing/spraying/healing/calling, teleporter, binders on a live foe, a clothing pattern on a check, a focus mod on a power, the rocketpack option, phone, e2e.
- Test DB side effects: character 510 carries medpacs, explosives, kits (equipment patched), hp 1-30; campaign 625 is at Rakessos Arena.

## TODO / next, in order
1. Ask the user: build and restart 5000; push.
2. Browser-check a soldierly fight (grenade lobs, a medpac, a call for backup and the jammer).
3. Balance: a level-3 character standing still loses a pit bout to an adolescent dewback in ~5 s (melee foes hit every 1.2 s with no roll). Not changed; ask the user.
4. Left unread (325): class-feature charges, droid protocols/parts, powers cast from items. Each needs its own rule, not a parse.
5. `npm run e2e` against a build.

## Learned
- Per-frame damage must go through `seep` (hurt() deals at least 1 a call: fire at 1.5/s was 30/s).
- A pit bout in the test DB starts from the pit boss: tap Teric Jarek, "Ask ... about fighting in the pit", Pit arena, Enter the bout. `window.__shooter` is the live sim.
- Patch the test campaign from a NON-game page: leaving Play saves its own clock over a patched `timeElapsed`.
- The browser pane must be shown or the page runs about a frame a second. No python on this PC.

## Open questions for the user
- Should a real-time defeat ever be death (open since 2026-10-29)? Melee balance in the shooter (see TODO 3).
