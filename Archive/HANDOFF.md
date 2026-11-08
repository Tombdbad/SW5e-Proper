# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-08 by the audit fix session. Branch **`audit`**. Not pushed. Uncommitted and not mine: `CLAUDE.md`, `SW5E_AI_GUIDE.md` (the user's edits), `client/src/components/ui/Alert.tsx` (never commit), `AUDIT/`, `e2e/audit/` (untracked audit work).
(Earlier handoff, 2026-11-06: the `stairwell` branch work and "production is still the old build; the user must restart it as Administrator". Check whether that is still true.)

## This session: audit Batches 2, 3 and 4 (`AUDIT/TRIAGE.md`, sections 8 and 9 are the fix logs)
Batch 2: f6051e9 T-003 speech rename retry; fa26c23 T-004 unique React keys; 3890f49 T-008 opaque Pazaak panel; f978fa7 T-017 five foes' attacks; df9f006 T-029 Drop button. T-006 (Medpac) is not a bug.
Batch 3: 825dcc1 T-027 creation tabs wrap; 6a52a2a T-007 shooter HUD on a phone (partly: see below); 6593f07 T-009 `npm run test:coop`; bc160f1 T-011 old-save test (`tests/world/oldSave.test.ts`); a73ce79 T-013 feature-parser floor test (`tests/items/featureParser.test.ts`).
Batch 4: 5a87252 T-021 dialogue/STT/Piper tests with a fake Ollama; 277cf3e T-022 a player request cuts off the chatter line in flight (first words 13-16 s -> 7-8 s after Say). T-010: the full e2e was run on the dev server 5099 (79 of 90 pass; 5 of the failures also fail on pre-audit main: T-043; 4 not isolated: T-044). T-028 needs the user phone. See TRIAGE section 10. Full npm test: 735 tests, 732 pass, 0 fail, 3 skipped; tsc clean; vite build 0 warnings.
Checks after Batch 3: `tsc --noEmit` clean; `vite build` to a scratch folder 0 warnings; full `env -u DATABASE_URL npm test` 725 tests, 722 pass, 0 fail, 3 skipped (co-op); co-op run on its own against sw5e_test: 3 pass in 5 s; flow 06 on desktop and phone: no overlaps, no keyboard hints on phone.

## Running
- Nothing left running (test server on 5099 stopped). Start it: `DATABASE_URL=<sw5e_test url> PORT=5099 VITE_TEST_MENU=1 npx tsx server/index.ts`, then `BASE=http://127.0.0.1:5099 node e2e/audit/<flow>.mjs`.

## Next steps (from TRIAGE, in order)
1. Batch 1 needs the user's decisions: backup location and schedule (T-001), LAN versus Tailscale (T-002), where HANDOFF.md lives (T-005), git email (T-042).
2. Batches 4 to 6 as in `AUDIT/TRIAGE.md` section 2. Run `08_factcheck.md` on one or two fixed items.
3. T-043 and T-044 are done (the 9 failing e2e steps were stale tests, fixed in e2e/play.mjs, commit after 5751798; see TRIAGE section 11); the full 90-step run after the fixes gave 88 of 90 (road trip and real-time moves time out on slow software 3D, not game bugs; see TRIAGE section 11). T-045 (new): a main bar with a stairwell has no Bandstand (generator; your decision). Then Batch 5 (decisions first). Run the e2e with TIMEOUT=90000 and NOT with windows-start.ps1 -Mode test (it stops production on 5000). Clean sw5e_test first with e2e/audit/99_cleanup.mjs.
4. Still open from Batch 3: T-007's floating exit label ("Passage down to Winding tunnel!") is wider than a phone screen (3D text; not found where it is drawn: not `Label` in LocalMap, or not only).

## Learned
- Python is not installed; edit with the Edit tool or node. A node `-e '...'` script breaks on an apostrophe: write it to a file.
- A room's asset ids are not unique; key React lists with `uniqueKeys`.
- Multiattack reader (`multiattackOf`) takes the first count it finds ("two bite attacks and one tail attack" gives one of each): known limit.
- Co-op tests: `DATABASE_URL=<sw5e_test url> npm run test:coop`; they need a campaign with a world and characters in `sw5e_test` (they read the newest).
- `livenWorld` of lives 0 to 19 cannot be tested by forging from a fresh world (today's generator makes no one-storey buildings); only life 21 is forged.
- Shooter HUD on touch is chosen by `matchMedia("(pointer: coarse)")` in `ShooterHud.tsx`.
