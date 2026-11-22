# SW5e

A Star Wars 5th Edition role-playing game: characters built by the SW5e rules, a generated galaxy played on one 3D map,
tabletop or real-time fights, card games, races, dogfights and co-op for up to four players. Express + Vite/React,
Babylon.js, Postgres (drizzle). Made to be played from a phone browser.

- Run: `npm run dev` (needs `.env` with `DATABASE_URL`), then http://127.0.0.1:5000.
- Check: `npx tsc --noEmit`, `npm test`, `npm run e2e` (the play-through, in headless Chromium).
- Rules data: `npm run import:sw5e` (from sw5e.com into `shared/data/sw5e`; never edited by hand).

Orientation for developers and AI agents: `CLAUDE.md` and `SW5E_AI_GUIDE.md`. Asset credits and licences: `CREDITS.md`.
Old notes, audits and retired scripts: `Archive/`.
