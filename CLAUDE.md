# CLAUDE.md

Read `SW5E_AI_GUIDE.md` first (current orientation, 2026-11-07). `REVIVAL_NOTES.md`, `HANDOFF.md` and `ITEM_TODO.md` now live in `Archive/`: use the notes as a history to search by heading, not as a briefing; the old Oracle-VM, systemd and Phase 1-3 text in them is out of date.

## Project
Star Wars 5e RPG simulator (Express server on 127.0.0.1:5000, Vite + React client, Postgres via drizzle). Goal: playable from a phone browser, hosted on the user's Windows 11 PC (moved from the Oracle VM on 2026-10-23) and reached over the user's Tailscale tailnet (their choice; public HTTPS is only a possible later development). The GitHub repo is Tombdbad/SW5e-Proper. Ignore the empty Tombdbad/Sw5e repo.

## Rules
- Work on `main` unless the user names another branch (the `revive` branch is old; `audit` is the 2026-11 audit branch). Small commits with clear messages, push to origin. Never force-push; no destructive git commands.
- The repo's git identity is already set (Tombdbad). Do not commit `client/src/components/ui/Alert.tsx`: it holds the user's own uncommitted edit.
- Prefer minimal fixes in code that is actually used. Do not rewrite for style. Ask before removing large amounts of code.
- Ask the user before: exposing anything to the internet or opening ports (Phase 3), building an API-based game master (Phase 5), or changing the storage choice.
- Never print or commit secrets. `.env` (DATABASE_URL) and `~/.git-credentials` (GitHub PAT) hold them.
- Rules content (species, classes, powers, equipment, stat blocks, ...) lives only in `shared/data/sw5e/*.json`, generated from the sw5e.com API by `npm run import:sw5e`. Never edit those files by hand and never write rules content elsewhere; `client/src/lib/sw5e/*.ts` are views over them. The database stores characters, campaigns (with their generated world in `galaxyMap`) and debriefs.
- World generation, travel, quests, ships and world edits are pure functions in `shared/logic/index.ts`; anything that needs the rules data runs on the server (`server/sw5eRoutes.ts`).
- Gear, tools, games, substances, companions (hired, freed, bolted droids, gentled beasts), ground transport (speeders, mounts, rides), downtime activities and starship combat follow the books' texts and the derived `tools.json` / `transport.json` / `downtime.json` / `ships.json`; their pure rules are the last sections of `shared/logic/index.ts` and their play is in `pages/GameBoard.tsx` (the fight in `lib/stores/useCombat.ts`, `components/Combat/PlayCombat.tsx` and the 3D `FightScene` and `SpaceScene` in `components/Map/LocalMap.tsx`). Anything the books leave open is a labelled house rule there and in REVIVAL_NOTES.md ("Gear and tools", "Companions", "Ground transport", "Fight depth", "Downtime", "Starship combat").
- What a character's features do (also in a fight: `combatFeatures`, `maneuverFeature`) and what a level gives is in `client/src/lib/sw5e/characterCalculation.ts`, read from the rules text. Do not hard-code a feature's effect by name; if the wording is regular, parse it there. A stat block's fight is read the same way by `statProfile` in `shared/logic`.
- Where the books give no rule (passage fares, reviving a dead character), the game uses a house rule and says so on screen. Keep the list in REVIVAL_NOTES.md ("Play rules") complete, and label any new one the same way.
- No 2D maps (the user, 2026-10-13). Places, people and things are shown on the 3D map (`client/src/components/Map/LocalMap.tsx`; the models themselves are built in `models.tsx`; see "The 3D map" in REVIVAL_NOTES.md) and are used by tapping them there; a tap picks out, a double tap opens. Do not bring back an SVG or flat plan, in the HUD or in a fight.
- The local map of a building the settlement lists is a site (the building and its satellites, built by `SITES` in shared/logic; open ground, gardens and stalls from the asset library in `components/Map/siteAssets.tsx`; see "Sites" in REVIVAL_NOTES.md). New pieces go in that library; do not draw props one by one in `LocalMap.tsx`.
- The user asked (2026-10-13, for the data import and world generator work) to extend existing files and add new ones only when strictly necessary. Keep to that unless they say otherwise.

## Running it
- Dev: `npm run dev` (tsx server/index.ts, Vite middleware, port 5000, no reload of server code). Needs `.env` with DATABASE_URL (loaded by dotenv).
- The server listens on loopback only unless `HOST` is set. The app has no login; do not set `HOST=0.0.0.0` without the user's go-ahead.
- Production and the test copy start with `deploy\windows-start.ps1 -Mode prod` (port 5000, database `sw5e`) or `-Mode test` (port 5002, database `sw5e_test`), optionally `-Lan`. Per the AI guide, restarting production needs an Administrator shell. The old Linux files (`sw5e.service`, backup timer, `backup.sh`, `test-*.sh`) are in `Archive/deploy/`; the PC backs up nightly at 03:00 with `deploywindows-backup.ps1` (task "SW5e backup", dumps in `%USERPROFILE%sw5e-backups`, newest 14 kept; `-Verify` restores into `sw5e_test`; only runs while the user is logged on). Do not start `node dist/index.js` by hand. The package is ESM (`"type": "module"`).
- A build replaces the files a running browser test is loading, so do not build while `npm run e2e` runs.
- DB: Postgres on this PC. Schema is `shared/schema.ts`; migrations in `migrations/` are generated with `npx drizzle-kit generate` and applied with `npx drizzle-kit migrate`.
- `npx tsc --noEmit` (also `npm run check`) reports nothing, tests and tools included, and `vite build` prints no warnings (2026-11-02, the user: no warnings or errors, even silent ones). Keep it so: Vite does not typecheck, so run `tsc` before committing and fix what it says. To look at build warnings, build to a scratch folder (`npx vite build --outDir <absolute path> --emptyOutDir`), not into `dist`, which production serves.
- A new database column needs its migration applied to the service's database (`npx drizzle-kit migrate` with the service's DATABASE_URL) before the new build is restarted, and to `sw5e_test` for the test copy (`windows-start.ps1` does not do it).
- Check changes in a real browser, not with curl: with the production server running, `npm run e2e` plays the acceptance test through the UI in headless Chromium (details in REVIVAL_NOTES.md, "Play-through test"). Module checks and API calls passed while the UI was broken in three places.

## Acceptance test
Create a character (saves, reloads); create a campaign with the local generator; open Play with that character and campaign; move between locations; run a combat encounter; HP changes persist after reload.

## Phases
0 baseline, 1 boots, 2 core loop and game depth are done; 3 deploy is now Windows plus Tailscale Serve (HTTPS), with backups still to do; 4 phone UI; 5 GM (a local Gemma 4 model writes NPC dialogue and transcribes speech; the manual copy-paste GM loop stays; an API-based GM still needs the user's go-ahead). Status detail: `SW5E_AI_GUIDE.md` sections 4 and 11. If public access is ever asked for: Caddy HTTPS reverse proxy and a login, after asking.

## Handoff (a session can end at any moment)
- `HANDOFF.md` is the handoff report for the next agent. It is currently in `Archive/` (deleted from the root on 2026-11-07); whether it returns to the root is the user's call, so until then write the handoff to `Archive/HANDOFF.md` only if the user asks. Read it at the start of a session to see what the last session was doing.
- Keep it current as you work, not only at the end: update it after each commit, before starting anything long (a build, the e2e run, a conversion), and whenever the user answers or decides something. A session can end at any moment, so what is not in the file is lost.
- Overwrite it; do not append. The next agent replaces it with its own. Keep it short enough to read in two minutes (under about 80 lines).
- It holds: the date and branch and the last commit; what was done this session (and which commits); what is running or half done (background units such as `sw5e-e2e`, uncommitted files, a test copy built from which commit); outstanding TODOs and next steps in order; open questions and decisions the user has not made; anything learned that the next agent would otherwise rediscover (a failing test and its cause, a command that works).
- Commit it with the work (`git add HANDOFF.md`). Do not put secrets in it.
