# CLAUDE.md

Read `REVIVAL_NOTES.md` first. It is the living record of the revival: current state, verified findings, decisions, what is next. Update it as you go and commit it.

## Project
Star Wars 5e RPG simulator (Express server on 127.0.0.1:5000, Vite + React client, Postgres via drizzle). Goal: playable from a phone browser, hosted on this Oracle free-tier VM and reached over the user's Tailscale tailnet (their choice; public HTTPS is only a possible later development). The GitHub repo is Tombdbad/SW5e-Proper. Ignore the empty Tombdbad/Sw5e repo.

## Rules
- Work on branch `revive`. Small commits with clear messages, push to origin. Never force-push; no destructive git commands.
- No git identity is configured. Commit with `git -c user.name=Tombdbad -c user.email=<the user's account email> commit ...`.
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
- Production runs as the systemd service `sw5e` (unit files in `deploy/`), which owns port 5000. After `npm run build`, run `sudo systemctl restart sw5e`; do not start `node dist/index.js` by hand. The package is ESM (`"type": "module"`).
- A build replaces the files a running browser test is loading, so do not build while `npm run e2e` runs.
- DB: Postgres 16 on this VM. Schema is `shared/schema.ts`; migrations in `migrations/` are generated with `npx drizzle-kit generate` and applied with `npx drizzle-kit migrate`.
- `npx tsc --noEmit` reports hundreds of errors in legacy or unreachable files. Vite does not typecheck, so they do not block running. Only fix errors in code the app actually uses.
- A new database column needs its migration applied to the service's database (`npx drizzle-kit migrate` with the service's DATABASE_URL) before the new build is restarted, and to `sw5e_test` for the test copy (`deploy/test-copy.sh` does not do it).
- Check changes in a real browser, not with curl: with the production server running, `npm run e2e` plays the acceptance test through the UI in headless Chromium (details in REVIVAL_NOTES.md, "Play-through test"). Module checks and API calls passed while the UI was broken in three places.

## Acceptance test
Create a character (saves, reloads); create a campaign with the local generator; open Play with that character and campaign; move between locations; run a combat encounter; HP changes persist after reload.

## Phases
0 baseline, 1 boots, 2 core loop and game depth, 3 deploy (systemd service, nightly DB backup, Tailscale Serve): see REVIVAL_NOTES.md for status. 4 phone UI. 5 GM (manual copy-paste loop stays for now). If public access is ever asked for: Caddy HTTPS reverse proxy, a login, and note that Oracle blocks inbound twice (VCN security list in the console and iptables on the VM).
