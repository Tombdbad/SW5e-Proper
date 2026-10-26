# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-26 (night), branch `main`. Last commit: `5f9ca7e`. **Nothing of today is committed** (the user has not asked).
Also uncommitted from the sessions before: dogfight controls, figures/fur/gaits, beasts, carrying, bases, spacing, and the user's own
`client/src/components/ui/Alert.tsx` (leave it unless told).

## Done today (details in REVIVAL_NOTES, all under "Play rules" unless said)
1. The user's list with screenshots (carts, speeder makes, walls/doors on curves) and "investigate all failures" (see "Failures and
   missing rules hunted").
2. Third request, all five parts:
   a. Ships leave/arrive in hangars by rising, pitching up and flying off ("Ships leaving and coming into a hangar"; `BayBerth`).
   b. Jumping, climbing, grappling hooks, jetpack bursts, gravity per world, falls by armour and pull ("Jumping, climbing, falling
      and gravity"; shared/logic `jumpReach/fallPlan/fallOutcome/gravityOf`, useCombat `reachable/walk/fall`, GameBoard `fallOutside`).
   c. Air battles: defend/bomb a settlement, escort/strike a convoy ("Air battles"; dogfight.ts `airStart`, dogfightSim ground and bombs,
      ArenaScene `AirBackdrop/GroundPiece`; /dev/dogfight?scenario=defend|raid|escort|strike&biome=desert).
   d. Ambushes on speeder trips with a chase on the race course ("On the road"; shared/logic `roadAmbush/roadAmbushers/chaseStart`,
      FlightScene kind `chase`, GameBoard `roadHit`/`roadFight`; test switch localStorage sw5e.ambush=1).
   e. Weapon properties bright, biting, corruption, specialized, penetrating, switch, smart, modal, luminous ("The rest of the weapon
      properties").

## Checked
- Unit: items+ships+dice 166/166 (new: jumping 7, airfight 8, roadchase 4, weaponprops 6), world 26/26.
- tsc: no new errors in touched files (pre-existing ones in useCombat.ts(2), src/stores/useCombat.ts, CharacterCreator, lib/game).
- Full `e2e/play.mjs` on the dev server: 75/75 after (b); 74/75 after (c)+(d) — the failure ("beast and stable", a stable keeper's
  card) passed when run alone (people wander: a timing flake). Not rerun after (e) (unit tests + a browser fight check only).
- Browser checks with scratchpad scripts: depart.mjs (hangar), airshot.mjs (air fights), roadhit.mjs (ambush, chase, roadside
  fight), modes.mjs (weapon buttons). Screens in e2e/out/{depart,air,road}.
- Test rows of the slice runs deleted (tagged " mvp....."); a few rows of others remain in sw5e_test.

## Processes
- My dev server on 5057 (sw5e_test, VITE_TEST_MENU=1) is still running; stop it when done. 5000 (prod) and 5002 untouched.
- Vite once served a stale shared module after scripted edits: restart the dev server if a page says an export is missing.

## Next
1. The user looks; rebuild 5002 (`deploy/windows-start.ps1 -Mode test`) when asked. Commit/push only when asked.
2. Still not done: Mag-lock Boots and Boots of Bounding (fit the new jump/gravity rules), the other text-only gear (force/tech
   storing rings, class charge items), set bonuses, Respiration Facilitator, shield properties (Anchor, Lambent ...).

## Learned
- Do NOT edit client/shared code while an e2e runs on the dev server: Vite hot-reloads the page under test.
- An e2e script must close its browser in `finally`; ONLY= slices skip cleanup (delete rows tagged " mvp.....").
- Working files have mixed CRLF/LF; edit with the scratchpad's exact-match rep.cjs (shell escaping of regexes in node -e breaks: write
  scripts to files).
- `reachable` relaxes (a fall-free or cheaper way replaces one found first); entries carry `how` and `fall`.
- LocalMap `window.__minuteAt` holds the bay clock for a test; `window.__dogfight`/`__race` expose the minigames.
