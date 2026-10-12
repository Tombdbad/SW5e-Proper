# REVIVAL NOTES

Living file. Continuity between sessions lives here (no other memory).
Branch: `revive`. Goal: play the SW5e simulator from a phone browser, hosted on VM1 (Oracle free tier).

Acceptance test: create a character, it saves and reloads; create a campaign with the local generator; open Play with that character and campaign; move between locations; run a combat encounter; HP changes persist after reload.

## Status
- Phase 0 baseline: script written (`~/sw5e-phase0/phase0.sh`), awaiting run
- Phase 1 boot fixes: not started
- Phase 2 core loop: blocked on storage decision (ask user)
- Phase 3 deploy, Phase 4 phone, Phase 5 GM: not started

## Environment
- Node v18.19.1, 34 GB free disk, no Docker. Registry reachability to be confirmed by `npm ci`.
- Telegram session: approvals gated; writes, git writes, npm need a one-time code. Bundle work into scripts.

## Findings verified against the code (static read only; nothing compiled yet)
Confirmed:
- A1 `client/src/pages/CharacterCreation.tsx:8-9` imports `@nextui-org/react` (not in package.json).
- A2 undeclared imports: nanoid (server/vite.ts), jsonwebtoken (server/middleware/auth.ts), postgres (migrate.ts), @heroicons/react (ValidationProgress.tsx), @react-spring/three (GalacticMap3D/StarSystem.tsx), react-query devtools/persist-client/sync-storage-persister (lib/api/QueryClient.ts, QueryProvider.tsx).
- A3 `"type": "commonjs"` with `--format=esm` server build.
- A4 tsconfig `"jsx": "react"`; vite.config.ts:4 imports the Replit plugin.
- B5 routes: App.tsx defines /characters/create, /characters/edit/:id, /characters, /campaigns/:id, /map, /game/:campaignId. Links use /character/create, /character/manage/:id, /campaign/:id, /campaign/create, /map/galaxy, /characters/:id, /campaigns. Nearly all links hit NotFound.
- B6 GameBoard.tsx:34 destructures `character` from useCharacter(); store has only characters / activeCharacterId / derived.activeCharacter. Bars divide by maxForcePoints (lines 177, 190).
- B7 two apiRequest helpers: lib/utils.ts (url, options) vs lib/queryClient.ts (method, url, body); CampaignView.tsx:4 imports the wrong one.
- C11 server/routes.ts:195 POST uses insertCharacterSchema, userId hard-coded 1; only PUT for characters (line 232) but lib/api/character.ts:49 sends PATCH. Store ids are uuidv4 strings, DB ids integers.
- C12 (partial) no starSystems/planets/species/classes/backgrounds/powers/equipment tables are exported from shared/ (only npcs, schema.ts:294); insertDebriefSchema exists only in shared/schema.ts:330; server/index.ts:59 `throw err` after responding; sw5eRoutes not registered.

Not yet verified: B8 (duplicate stores/schemas), B9 (85/205 unreachable files), B10 (corrupted imports in CharacterCreationForm), C13 (missing endpoints), C14 (migrations), D15-16, E17.

## Decisions
- (none yet) Storage decision pending: keep Postgres + node-postgres on VM (suggested default), Neon free account, or SQLite.

## Next
1. Run `bash ~/sw5e-phase0/phase0.sh`; paste results here (error counts, worst categories).
2. Phase 1: fix A1-A4, routes (B5), remove Replit plugin; get `npm run dev` to render Home.
