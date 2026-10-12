# CLAUDE.md

Read `REVIVAL_NOTES.md` first. It is the living record of the revival: current state, verified findings, decisions, what is next. Update it as you go and commit it.

## Project
Star Wars 5e RPG simulator (Express server on 127.0.0.1:5000, Vite + React client, Postgres via drizzle). Goal: playable from a phone browser, hosted on this Oracle free-tier VM. The GitHub repo is Tombdbad/SW5e-Proper. Ignore the empty Tombdbad/Sw5e repo.

## Rules
- Work on branch `revive`. Small commits with clear messages, push to origin. Never force-push; no destructive git commands.
- No git identity is configured. Commit with `git -c user.name=Tombdbad -c user.email=<the user's account email> commit ...`.
- Prefer minimal fixes in code that is actually used. Do not rewrite for style. Ask before removing large amounts of code.
- Ask the user before: exposing anything to the internet or opening ports (Phase 3), building an API-based game master (Phase 5), or changing the storage choice.
- Never print or commit secrets. `.env` (DATABASE_URL) and `~/.git-credentials` (GitHub PAT) hold them.
- Rules content (species, classes, powers, equipment, ...) is bundled in `client/src/lib/sw5e/*.ts`. The database only stores characters, campaigns and debriefs.

## Running it
- Dev: `npm run dev` (tsx server/index.ts, Vite middleware, port 5000, no reload of server code). Needs `.env` with DATABASE_URL (loaded by dotenv).
- The server listens on loopback only unless `HOST` is set. The app has no login; do not set `HOST=0.0.0.0` without the user's go-ahead.
- Build and run production: `npm run build`, then `NODE_ENV=production node dist/index.js`. The package is ESM (`"type": "module"`).
- DB: Postgres 16 on this VM. Schema is `shared/schema.ts`; migrations in `migrations/` are generated with `npx drizzle-kit generate` and applied with `npx drizzle-kit migrate`.
- `npx tsc --noEmit` reports hundreds of errors in legacy or unreachable files. Vite does not typecheck, so they do not block running. Only fix errors in code the app actually uses.
- Check changes in a real browser, not with curl: with the production server running, `npm run e2e` plays the acceptance test through the UI in headless Chromium (details in REVIVAL_NOTES.md, "Play-through test"). Module checks and API calls passed while the UI was broken in three places.

## Acceptance test
Create a character (saves, reloads); create a campaign with the local generator; open Play with that character and campaign; move between locations; run a combat encounter; HP changes persist after reload.

## Phases
0 baseline, 1 boots, 2 core loop: see REVIVAL_NOTES.md for status. 3 deploy (systemd service, Caddy HTTPS reverse proxy, DuckDNS or Tailscale, basic auth or Tailscale-only, DB backup; Oracle blocks inbound twice: VCN security list in the console and iptables on the VM). 4 phone UI. 5 GM (manual copy-paste loop stays for now).
