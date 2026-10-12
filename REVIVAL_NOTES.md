# REVIVAL NOTES

Living file. Continuity between sessions lives here (no other memory). Rules for a Claude session are in `CLAUDE.md`.
Branch: `revive`. Goal: play the SW5e simulator from a phone browser, hosted on VM1 (Oracle free tier).

Acceptance test: create a character, it saves and reloads; create a campaign with the local generator; open Play with that character and campaign; move between locations; run a combat encounter; HP changes persist after reload.

## Status (updated 2026-10-12, late evening)
- Phase 0 baseline, Phase 1 boots, Phase 2a backend: DONE (see Done).
- Phase 2b UI wiring: DONE, commit a2d0035. The script applied every patch (no MISSING lines), build exit 0.
- Phase 2c real play-through: DONE. Driving the app in headless Chromium showed the acceptance path was still broken in three places that curl and module checks could not see (creation form never submitted, campaign save hit the wrong endpoint, combat damage was text). All fixed. `npm run e2e` now passes 38 of 38 steps against the production build, in a desktop and in a phone-sized viewport.
- NOT yet tried on a real phone. That needs Phase 3, because nothing is reachable from outside the VM.
- Phase 3 deploy: NOT started. Ask the user before opening any port. Read "Host firewall" below first.
- Phase 4 phone UI, Phase 5 GM: NOT started.

## Environment and ops
- VM: Ubuntu 24.04, aarch64, 1 vCPU, ~8.9 GB RAM, 4 GB swap, ~30 GB free disk, Node v18.19.1, npm 9.2.0. No Docker.
- Postgres 16 on this VM, role and database `sw5e`, listening on 127.0.0.1 only. `DATABASE_URL` is in `.env` (gitignored, mode 600). Do not print it.
- The server listens on 127.0.0.1:5000 unless `HOST` is set (server/index.ts). The app has no login, so keep it that way until Phase 3 puts something in front of it.
- Host firewall is OFF. `iptables -S` shows only ACCEPT policies and `netfilter-persistent` is masked, so the saved rules in `/etc/iptables/rules.v4` (Oracle default: allow 22, reject the rest, plus an old allow for port 8000 from 10.0.0.0/24) are not loaded. Only the Oracle VCN security list protects the VM. rpcbind also listens on port 111. Nothing was changed; decide with the user in Phase 3.
- Test data in the DB: character "Test Pilot" and campaign "Test Campaign" (both id 2, from the 2b script). Delete from Home when no longer wanted.
- Commits need a git identity: `git -c user.name=Tombdbad -c user.email=<account email> commit`. No identity is configured globally.
- Stopping a server by name: `pkill -f "node dist/[i]ndex.js"` or `pkill -f "tsx server/[i]ndex.ts"`. Without the brackets pkill also kills the shell that runs it.
- Old helper scripts: `~/sw5e-phase0/` (historical). Run logs and screenshots: `~/sw5e-logs/` (`e2e/`, `e2e_phone/`, `shots_desktop/`, `shots_phone/`).
- A Claude session on this VM through Telegram needs a one-time code for most writes; the CLI session does not.

## Play-through test (e2e/)
- `npm run e2e` drives the whole acceptance test through the real UI and deletes what it created. It needs a running server: `npm run build`, then `NODE_ENV=production node dist/index.js`.
- Options (env): `VIEW=phone` for a 412x915 touch viewport, `FORCE=0` to skip the second (Consular) character, `KEEP=1` to keep the rows, `OUT=<dir>` for the screenshots (default `e2e/out`, gitignored), `BASE=<url>`.
- `node e2e/shots.mjs` saves a Home screenshot and a mid-combat screenshot.
- Playwright is pinned to 1.58.0 because newer releases need Node 20. The browser is installed once per machine with `npx playwright install --with-deps chromium` (already done here, in `~/.cache/ms-playwright`). It renders WebGL in software, so the 3D map works without a GPU.
- About 4 minutes per run on this VM.

## Done
Phase 1: package.json `"type": "module"`, nanoid added, Replit plugin removed (vite.config.ts), tailwind.config.ts uses imports, tsconfig jsx react-jsx, species.ts:13 syntax error, unused nextui imports removed from CharacterCreation.tsx, plural route scheme (/characters, /characters/create, /characters/edit/:id, /characters/:id, /campaigns, /campaigns/:id, /campaigns/create, /map, /game/:campaignId) with all links updated, CampaignView uses lib/queryClient apiRequest, server error handler no longer rethrows, /api/sw5e/* removed (tables never existed; data is bundled client-side), insertDebriefSchema from shared/schema.
Phase 2a: server/db.ts uses node-postgres and seeds user 1 (ensureDefaultUser); routes use the insert schemas from shared/schema.ts; PUT/PATCH characters accept partial; DELETE characters added; /api/star-systems removed; client/src/lib/api/toServerCharacter.ts maps the creation form (abilities, hitPoints, powerPoints) to the DB shape (abilityScores, maxHp, maxForcePoints); schema persists feats/force powers/tech powers/personality; dead CharacterCreationForm.tsx deleted; old migrations replaced by one generated from shared/schema.ts.
Phase 2b: CampaignView finds the character in create mode (?characterId= or first); GameBoard loads the campaign's character by characterId (B6); location buttons PATCH campaign.currentLocation; new components/Combat/PlayCombat.tsx (melee/ranged, enemy auto-turns) replaces CombatTracker in Play; player HP PATCHed to the DB when combat changes it; Rest button; campaigns PUT/PATCH partial; CharacterManagement reads the query result; /characters redirects to /; GalaxyMap no longer calls missing fetchStarSystems; react-query staleTime 0; test enemies given armorClass and string ids.
Phase 2c (found by the browser play-through):
- Creation form never submitted: it validated against shared/unifiedSchema.ts, whose required fields (abilityScores, maxHp, startingLocation, ...) the form does not fill. It now has its own small schema and names what is missing.
- The Equipment step crashed the whole page (Radix Tooltip without a provider). Tooltip removed there.
- Clicking Next on the Equipment step submitted the form: React reused the Next button's DOM node as the submit button during the click. The two buttons have keys now. The Continue buttons, the equipment Add buttons and Enter in a text field also submitted the form; fixed.
- Saved stats were NaN or missing. `deriveStats()` in pages/CharacterCreation.tsx computes them from the full class and species data: HP from the hit die and Constitution, species ability bonuses, AC 10 + Dex, speed, languages, saving throws, power points. The Preview step shows them.
- The class picker used the id/name list `CLASSES`, which has no hit die or skills. It now uses `classes` (the seven with data). Skills can be picked (they could not: SKILLS has no ids). Feats: floor(level / 4), so none at level 1.
- Save Draft / Load Draft buttons removed (the endpoints never existed).
- Saving a generated campaign sent PUT /api/campaigns/create and got a 500. It POSTs now and then shows the saved campaign, with Home and Play links.
- Combat: `rollDice` returns an array of dice; the store added it to a number, so damage was text like "052" and every hit killed. Summed now, in the store and on the character sheet. Test Combat is disabled at 0 HP.
- Character page: the HP, Force point and notes fields called a store function that does not exist. They now collect edits that Save Changes sends as a partial update.
- Home: New Campaign and Delete buttons. Server: DELETE /api/campaigns/:id; deleting a character deletes its campaigns.
- App.tsx no longer loads the legacy stores at startup (one call did not exist, the other threw a ZodError on every page).
- Two orphaned test campaigns (ids 1 and 3, their characters already deleted) were removed from the DB.

## Findings (from the original static review)
Confirmed and fixed: A1-A4, B5, B6, B7, C11, most of C12.
Still open:
- B8 duplicate/competing code: two character stores (lib/stores/useCharacter.ts, useCharacterStore.ts), two combat stores, lib/data vs lib/sw5e, two campaign generators (lib/sw5e/campaignGenerator.ts is what the Campaign UI uses; lib/llm/campaignGenerator.ts is used by useCampaign.generateCampaign and falls back to an empty campaign), three shared schema files (schema.ts is the real one for the server; unifiedSchema.ts and compatSchema.ts are legacy and used by some client code). The acceptance path no longer depends on them. Delete only after confirming unused.
- B9 about 85 of 205 client files unreachable (not re-measured).
- B10 BasicInfo.tsx imports missing ./LoreTooltip; CharacterCreator.tsx imports missing ./CharacterCreator/SaveControls (both unreachable).
- C13 client calls endpoints the server lacks: /api/characters/validate, /api/campaign/:id/save, /api/campaign/generate, /api/sw5e/*. In unreachable or fallback paths.
- C14 repo root has overlapping one-off scripts (migrate.ts, run-migrations.ts, migrations.ts, verify-schema.ts, shared/scripts/migrate-with-verification.ts, fixSpeciesData.*, bulkFormatSpeedFix.ts, db-fix-script.js, convertSpecies.ts, .replit, replit.nix). They import neon and are unused.
- D15 quests are displayed but nothing advances them; combat only starts from the Test Combat button, not from campaign encounters. The galaxy map uses local data.
- D16 there is no built-in GM: lib/llm + GMReportManager + ClipboardIntegration implement a manual copy-paste loop (needs HTTPS or localhost for the clipboard).
- E17 phone readiness, now seen in screenshots (`~/sw5e-logs/e2e_phone`, `shots_phone`): the HUD covers about three quarters of a phone screen, the bottom button bar is wider than the screen (Galaxy Map and Test Combat are cut off), the combat panel lies on top of the HUD. Everything can still be tapped. Also: keyboard-only map controls, h-screen instead of dvh, no PWA manifest, 1.9 MB script bundle.

Gaps in content and rules (the flow works, the game is thin):
- Classes: Operative, Scholar and Sentinel have no data in lib/sw5e/classes.ts, so they are not offered. Scout has data and is offered.
- Backgrounds: the picker lists `BACKGROUNDS` (9), the data is `backgrounds` (8), and they only partly overlap. Background skills and tools are not applied.
- Class skill lists name History, Science and Religion, which SKILLS does not have, so those are not offered.
- Power points use the app's own formula (level + ability modifier, minimum 1), not the SW5e tables. They are stored as maxForcePoints, so an Engineer's tech points show as "Force Points".
- Armor does not change AC. Subclass (archetype) cannot be chosen; ArchetypeSelection.tsx exists but is not used.
- Test Combat is two enemies with 50 HP between them. A level 1 character loses most fights.
- The campaign page (CampaignManager) shows the campaign, but its edit controls only change an in-memory store that is not loaded there. Nothing is saved.
- /characters/edit/:id opens an empty creation form; nothing links to it.
- The Inventory tab on the character page reads `character.inventory`, which does not exist. Equipment shows on the sheet's Equipment tab and in the Play HUD.
- lib/sw5e/combatmanagers.ts (starship and vehicle combat, unused) has the same dice bug the combat store had.
- tsc: 424 errors (was 482), mostly in legacy files. Vite does not typecheck.

## Decisions
- Package is ESM.
- Storage: Postgres on this VM with node-postgres (user accepted the default).
- Deleted CharacterCreationForm.tsx (dead, corrupted, unreferenced); pages/CharacterCreation.tsx is the creation flow.
- The server binds loopback by default (2c). Phase 3 decides what sits in front of it.
- The class picker offers only classes that have data (2c). Revisit when data for the other three is added.
- Playwright is a dev dependency, pinned (2c).

## Next
1. Phase 3 (ask first): systemd service with restart on failure and EnvironmentFile for secrets; Caddy HTTPS reverse proxy to 127.0.0.1:5000, or Tailscale-only; DuckDNS name if public; the app has NO login, so protect it (Caddy basic auth or Tailscale-only); settle the host firewall (see above) before opening 80/443 in the Oracle VCN security list, and explain exactly what; database backup (pg_dump on a timer).
2. First session on a real phone. Fix what breaks.
3. Phase 4 phone UI: bottom-sheet HUD, wrap the button bar, combat panel placement, tap controls, dvh, PWA manifest and icons, lazy-load three.js, 2D map fallback, prune dependencies.
4. Game content: an encounter a level 1 character can survive and combat started from the campaign; quests that advance; the three missing classes; background skills; subclass choice.
5. Phase 5: keep the manual copy-paste GM loop. Do not build an API-based GM without asking.
