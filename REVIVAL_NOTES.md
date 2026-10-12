# REVIVAL NOTES

Living file. Continuity between sessions lives here (no other memory).
Branch: `revive`. Goal: play the SW5e simulator from a phone browser, hosted on VM1 (Oracle free tier).

Acceptance test: create a character, it saves and reloads; create a campaign with the local generator; open Play with that character and campaign; move between locations; run a combat encounter; HP changes persist after reload.

## Status (2026-10-12)
- Phase 0 baseline: DONE
- Phase 1 boots: DONE locally (commit f28828c). `npm run build` exits 0; `npm run dev` and `node dist/index.js` both serve on :5000; pages return 200.
- Push of `revive` to origin: BLOCKED, GitHub token returns 403 for Tombdbad/SW5e-Proper (token lacks write access to this repo). Fix token scope, then `git push -u origin revive`.
- Phase 2 core loop: blocked on storage decision (ask user).
- Phase 3 deploy, Phase 4 phone, Phase 5 GM: not started.

## Environment
- Node v18.19.1, npm 9.2.0, 34 GB free disk, no Docker. Registry reachable.
- No DATABASE_URL: db.ts falls back to a localhost URL, but the Neon HTTP driver needs Neon, so /api/characters and /api/campaigns return 500 ("fetch failed ... 127.0.0.1:443").
- Telegram session: writes, git writes, npm need a one-time code. Bundle work into scripts under ~/sw5e-phase0/ (logs in ~/sw5e-logs/).
- Commits need a git identity; none configured. Use `git -c user.name=Tombdbad -c user.email=<account email> commit`.

## Done in Phase 1
- package.json: `"type": "module"`, nanoid ^3.3.8 added, @replit plugin removed (build output dist/index.js is now valid ESM, A3 fixed).
- vite.config.ts: Replit plugin removed. tailwind.config.ts: require() -> imports.
- tsconfig: jsx react-jsx; dead `CharacterCreationForm.tsx` excluded (corrupted imports, nothing imports it).
- species.ts:13 syntax error fixed. CharacterCreation.tsx: unused nextui imports removed (A1 was real but harmless once unused).
- Routes: scheme is plural (`/characters`, `/characters/create`, `/characters/edit/:id`, `/characters/:id`, `/campaigns`, `/campaigns/:id`, `/campaigns/create`, `/map`, `/game/:campaignId`). All links updated.
- CampaignView now uses `lib/queryClient` apiRequest; skips fetch for id `create`.
- server/index.ts error handler no longer rethrows. routes.ts: removed `/api/sw5e/*` block (tables never existed; data is bundled client-side), insertDebriefSchema imported from shared/schema.

## Verified findings
Confirmed: A1-A4, B5, B6 (GameBoard reads nonexistent `character` from useCharacter; bars divide by maxForcePoints), B7, C11 (POST uses insertCharacterSchema with userId 1; client PATCH vs server PUT; uuid vs integer ids), C12 (partly fixed above; star-system routes still reference undefined starSystems/planets tables).
Not yet verified: B8 duplicates, B9 85/205 unreachable, B10 other corrupted imports, C13 missing endpoints, C14 migrations, D15-16, E17.

## Remaining tsc errors: 497 (vite does not typecheck, so they do not block running)
Worst files: lib/stores/useCharacter.ts 61, pages/CharacterCreation.tsx 51, server/routes.ts 42, lib/core/combat.ts 35, lib/api/sw5eApi.ts 26, CharacterManagement/CharacterSheet.tsx 20.
Top codes: TS2339 (missing property) 93, TS2345 (arg mismatch) 86, TS7006 (implicit any) 70, TS2322 41, TS2305 (missing export) 25.
Many are in unreachable files; fix only reachable ones in Phase 2.

## Decisions
- Package is ESM (`"type": "module"`).
- Storage: PENDING user decision (suggested: Postgres on this VM + node-postgres, DATABASE_URL in env file; alternatives Neon free account or SQLite).

## Next
1. User: grant token write access to Tombdbad/SW5e-Proper; push `revive`.
2. User: decide storage.
3. Phase 2: fix B6-B8 and C11-C13 per acceptance test; seed default user; drop or implement missing client endpoints; one clean drizzle migration from shared/schema.ts.
