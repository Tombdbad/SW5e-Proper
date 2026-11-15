# AUDIT 03b: Feature trace, AREA E (Social, AI & systems), 2026-11-07, branch `audit`, read-only

## Plain-English summary
- 24 features traced. **WIRED 12, PARTIAL 6, DEAD 1, MISSING 5, UNKNOWN 0.** (PARTIAL: E-01, 03, 04, 10, 11, 24; DEAD: E-19; MISSING: E-07, 09, 12, 14, 21.) E-12 and E-09 are missing by design, not defects.
- Unlike areas B to D, the **AI and voice parts have almost no automated tests.** Neither `server/dialogue.ts` (Gemma dialogue, speech to text) nor `server/speech.ts` (Piper) has a test of its own: `tests/world/voice.test.ts` (7) covers the client's voice choice, and `tests/world/soundlab.test.ts` (5) covers the audio tool. No e2e step hits dialogue, speech or the microphone. The guide itself says "nothing has been *heard* by an AI (only checked for errors)".
- Status rule is the same as the other areas (unit test or browser step that checks the result counts). Nothing was run in this session.
- **Five most important problems:**
  1. **Gemma dialogue, speech-to-text and Piper speech are untested** by any unit test or browser step I could find (E-01, E-03, E-04). They also depend on Ollama and Piper being installed on the PC; I did not check that they are.
  2. **No PWA files exist**: no `manifest` or service worker in `client/public` (a directory listing shows only `assets, audio, figures, fonts, geometries, sounds, textures`) and no manifest link in `client/index.html` or `main.tsx` (grep found none). Phone use is as a web page only (E-21).
  3. **`SaveControls.tsx` is imported by nothing** (grep of `client/src`): dead code (E-19).
  4. **Co-op server tests are skipped unless `DATABASE_URL` points at a `*_test` database** (`tests/server/coop.test.ts:13`). So they only run in a configured environment; whether they run in a normal `npm test` depends on the shell's environment. The shared-state logic has 13 tests that do not need a database (`tests/world/coop.test.ts`).
  5. **Backups on Windows do not exist** (the guide lists it as not done; no backup script in `deploy/` besides the one-off `finish-2026-11-05.ps1`, which backs up files, not the database).
- Card games (sabacc, pazaak, dejarik) have good unit tests (26 in total) but **no browser step**: the e2e only mentions "Sabacc deck" as a tool proficiency.

## Matrix

| ID | Feature | Data | Logic (path:line) | Server | UI (component) | Reachable? | Test(s) | Browser-verified | Status | Evidence / notes |
|---|---|---|---|---|---|---|---|---|---|---|
| E-01 | Local NPC dialogue (Gemma via Ollama) | n/a (prompt in code) | `cardText` dialogue.ts:90, `speechOnly` :55, `tidy` :110; client `speak`/`chatter` in `lib/voice.ts` | `POST /api/dialogue`, `GET /api/dialogue/status` dialogue.ts:212,222 | `TalkPanel.tsx` | YES (talk to a person on the map) | **none for the server**; `voice.test.ts` covers the client side | NO | **PARTIAL** | Wired by imports (`TalkPanel.tsx`, `voice.ts` call `/api/dialogue`). Needs a running Ollama with the model; not checked. |
| E-02 | NPC-to-NPC chatter | n/a | `chatterLine` dialogue.ts:131; `smallTalk` relations.ts:232, `chatScene` :227 | `POST /api/chatter` dialogue.ts:293 | LocalMap `Strollers`/`converse` | YES | `relations.test.ts` (9), `voice.test.ts` (7) | NO | **WIRED** | Server route itself untested (see E-01). |
| E-03 | Speech to text | n/a | `cleanTranscript` dialogue.ts:184; `voice.ts` | `POST /api/stt` dialogue.ts:190 | `TalkPanel.tsx` (microphone) | YES (needs https or localhost) | **none** | NO | **PARTIAL** | Same dependency on Ollama. Browser microphone permission: UNVERIFIED. |
| E-04 | Text to speech (Piper, OneCore, browser) | n/a | `server/speech.ts` | `POST /api/speech`, `GET /api/speech/status` speech.ts:233,228 | `lib/voice.ts` `speak` | YES | `voice.test.ts` (7: the voice choice), `soundlab.test.ts` (5: cue presets) | NO | **PARTIAL** | The server speech path has no test. Piper found automatically from a path outside the repo (`../rhasspy-piper-.../release`, per GUIDE §8): UNVERIFIED that it is present. |
| E-05 | Non-verbal cues; droid/creature voices | `client/public/audio/voice/manifest.json` (empty per GUIDE §8) | `voiceOf` voice.ts, `toneOf` | n/a | `voice.ts` | YES | `voice.test.ts` | NO | **WIRED** | The SeptaBee cue bank is empty; cues are synthesised in code. |
| E-06 | Comms and comlinks | n/a | `comms.ts`: `addNote` :14, `addRecording` :26, `setLanguages` :37, `languageBarrier` :39, `callOverheard` :53, `canCall` :64 | n/a | `CommsPanel.tsx`, GB tab "Comms" (GB:9949) | YES | `tests/items/comms.test.ts` (8) | NO (the e2e only clicks other tabs) | **WIRED** | |
| E-07 | Comms calls (NPC calls the party; ship transceiver) | n/a | none found | n/a | n/a | n/a | none | NO | **MISSING** | GUIDE §8: "comms-call UI" is a gap. |
| E-08 | Talk panel and NPC sheets | n/a | `sheetFor` relations.ts:148, `sheetLines` :116, `natureOf` :254, `bondOf` :265 | n/a | `TalkPanel.tsx` | YES | `relations.test.ts` (9) | NO | **WIRED** | |
| E-09 | Dialogue v2 (quests, wares, memory, party voice) | n/a | none | n/a | n/a | n/a | none | NO | **MISSING** | GUIDE §7: "dialogue is colour; it changes no game state" (by design today); v2 is planned. |
| E-10 | Manual GM loop | n/a | `lib/llm/reportHandler.ts` (`SYSTEM_MARKER`, `applyGameMasterResponse`), `campaignGenerator.ts` | none | `GMReportManager.tsx`, `LLMResponseParser.tsx`, GB tab "GM Interface" | YES | **none** | partial: play step 25 clicks the tab "GM Interface" without crashing (`play.mjs:547-552`) | **PARTIAL** | The copy-paste loop's parsing of replies is not tested. |
| E-11 | Debriefs | `debriefs` table | `debriefCompiler.ts:183,215` | `POST /api/debriefs`, `PUT /api/debriefs/:id/response` routes.ts:298,325 | via GM tab | YES | **none** | NO | **PARTIAL** | `reportHandler.ts:329` says the game does not depend on the record. |
| E-12 | API-based GM | n/a | none | n/a | n/a | n/a | n/a | n/a | **MISSING** | Deliberately absent; CLAUDE.md says ask first. Not a defect. |
| E-13 | Co-op (up to 4) over WebSocket | n/a | `shared/logic/coop.ts` (`MAX_PLAYERS` :9, `applyChanges` :112, `makeCode` :157) | `/ws/coop` and `/api/coop/info|open|code/:code` server/coop.ts:440-467 | `CoopJoin.tsx` (`/coop`), `CoopUI.tsx` | YES (host from Play, join at `/coop`, Home link Home.tsx:169) | `tests/world/coop.test.ts` (13); `tests/server/coop.test.ts` (3, **skipped without a `*_test` DATABASE_URL**) | YES: `e2e/coop.mjs`, `coop-followers.mjs`, `coop-posture.mjs` (two real browsers; need a test-database server) | **WIRED** | |
| E-14 | Co-op completion (shared trip minigame, crew roles in ship fights, two players in one fight) | n/a | partly: `crewIssues` coop.ts:247, `shipSeats` :298 | server/coop.ts | `CoopUI.tsx` | partly | `world/coop.test.ts` | partly | **MISSING** | The three named items are listed as not done in GUIDE §10.11. Each listed piece not re-verified. |
| E-15 | Sabacc | n/a | `sabacc.ts`: `newSabacc` :133, `sabaccDo` :191, `sabaccAi` :390 | n/a | `SabaccTable.tsx` (imported GB:25) | YES (sit at a table on the map) | `games/sabacc.test.ts` (10) | NO | **WIRED** | |
| E-16 | Pazaak | n/a | `pazaak.ts`: `newPazaak` :76, `pazaakDo` :122, `pazaakAi` :190 | n/a | `PazaakGame.tsx` (GB:26) | YES | `games/pazaak.test.ts` (6) | NO | **WIRED** | |
| E-17 | Dejarik | n/a | `dejarik.ts`: `newDejarik` :93, `dejarikDo` :174, `dejarikAi` :262 | n/a | `DejarikGame.tsx` (GB:28) | YES | `games/dejarik.test.ts` (10) | NO | **WIRED** | |
| E-18 | Persistence (characters, campaigns, debriefs) | `shared/schema.ts` (422 lines); 5 files in `migrations/` | `server/storage.ts`, `db.ts` | `/api/characters`, `/api/campaigns` routes.ts:34-262 | all pages | YES | none unit (needs DB) | YES: play steps 14, 19, 20 (saved and kept after reload), 70 | **WIRED** | |
| E-19 | Save controls UI | n/a | `components/ui/SaveControls.tsx` | n/a | `SaveControls.tsx` | **NO: imported by nothing** (grep of `client/src`) | none | NO | **DEAD** | Saving happens through other paths (`saveCharacter`, `saveCampaign` in GB). |
| E-20 | Rules-data API and importer | all 41 datasets | `server/sw5eData.ts`; `shared/scripts/import-sw5e.ts` | `GET /api/sw5e`, `/api/sw5e/:dataset`, `/api/sw5e/itemFacts` sw5eRoutes.ts:19-42 | n/a (client views) | YES | `tests/items/itemwordings.test.ts` etc. read the data | YES: play step 1 (counts, search "trooper" returns 3) | **WIRED** | Importer (`npm run import:sw5e`): not run (it fetches from sw5e.com). |
| E-21 | Phone / PWA / touch | n/a | `interiors/stick.ts`, `Compass.tsx` | n/a | virtual stick and HUD | partly: phone web page via tailnet | `tests/interiors/stick.test.ts`, `compass.test.ts` | phone behaviour: NO (desktop Chromium e2e only) | **MISSING** | Rated MISSING for the **PWA part**: no manifest or service worker file exists. The touch stick exists and is tested (WIRED); the row's PWA/bundle-size promise is GUIDE §10.12's "Phase 4 not done". |
| E-22 | Test menu, gallery, dev labs | n/a | `TestMenu.tsx`, `ModelGallery.tsx`, `DogfightLab.tsx`, `LoadingDemo.tsx` | n/a | `/dev/models`, `/dev/dogfight`, `/dev/loading`; Test tab only if `VITE_TEST_MENU=1` (GB:229) | YES (by URL) | `e2e/gallery-look.mjs`, `interiors.mjs` | YES for the gallery | **WIRED** | |
| E-23 | Graphics tiers, performance monitor, showcase | n/a | `babylon.ts`; `lib/performance/monitor.tsx` (imported GB); `server/showcase.ts` (only when `SW5E_SHOWCASE=1`) | n/a | automatic | YES | `tests/interiors/babylon.test.ts`; `tests/server/showcase.test.ts` (4) | partial | **WIRED** | |
| E-24 | Tooling and ops | n/a | `package.json` scripts; `deploy/windows-start.ps1` (starts Tailscale, Postgres, builds, migrates, serves) | n/a | n/a | n/a | the e2e is itself the tool | not run | **PARTIAL** | Windows backup does not exist (GUIDE §10.13). Restart of production needs an Administrator shell. |

## Tally
WIRED: E-02, 05, 06, 08, 13, 15, 16, 17, 18, 20, 22, 23 = **12**.
PARTIAL: E-01, 03, 04, 10, 11, 24 = **6**. DEAD: E-19 = **1**. MISSING: E-07, 09, 12, 14, 21 = **5**. UNKNOWN 0. Total 24.

## Contradictions
- No PWA files exist (E-21); this agrees with GUIDE §10.12, which lists the PWA as to do.
- GUIDE §4 says "Co-op (≤4) ... implemented and tested"; the server-side tests are skipped without a test database (E-13).
- E-12 (API GM) and E-09 are not defects: both are deliberately not built.

## UNVERIFIED:
- No test or e2e was run.
- Whether Ollama, the `gemma4:e2b` model and Piper are installed on this PC, and whether `/api/dialogue/status` and `/api/speech/status` say so.
- Whether the microphone path works on the phone over Tailscale Serve.
- Whether the 3 server co-op tests run in `npm test` (depends on the environment variable).
- What `E-23`'s tier switching does in a browser.
- The importer's output (not run).

## REMAINING:
- Call `GET /api/dialogue/status` and `/api/speech/status` on the running server (read-only) to see if the AI parts are alive; I did not touch the running server.
- Read `reportHandler.ts` to see which replies the GM parser accepts and rejects.
