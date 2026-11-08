# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-08 by the audit fix session. Branch **`audit`**. Not pushed. Uncommitted and not mine: `CLAUDE.md`, `SW5E_AI_GUIDE.md` (the user's edits), `client/src/components/ui/Alert.tsx` (never commit), `AUDIT/`, `e2e/audit/` (untracked audit work).
(The previous handoff, 2026-11-06, is in git history: the `stairwell` branch work and "production is still the old build; the user must restart it as Administrator". Check whether that is still true.)

## This session: audit Batch 2 (`AUDIT/TRIAGE.md`, section 8 is the fix log)
Commits on `audit`: f6051e9 T-003 speech rename retry; fa26c23 T-004 unique React keys for room assets; 3890f49 T-008 opaque Pazaak panel; f978fa7 T-017 five foes' attacks read; df9f006 T-029 Drop button.
T-006 (Medpac) is NOT a bug: "Use" opens a chooser, "Use on yourself" heals. Only the audit script was wrong (fixed in `e2e/audit/07`, untracked).
Checks: `tsc --noEmit` clean; `vite build` to a scratch folder 0 warnings; new tests pass (speech 3, assetKeys 2, monsterAttacks 3); the 213 items and combat tests pass; flows 05 and 06 show 0 "same key" warnings (were 50 to 111). Full `npm test` (`env -u DATABASE_URL npm test`, about 15 minutes): 708 tests, 705 pass, 0 fail, 3 skipped (the co-op ones, T-009).

## Running
- Nothing left running: the dev test copy on port 5099 (sw5e_test) was stopped. Start it with `PORT=5099 VITE_TEST_MENU=1 npx tsx server/index.ts` and the sw5e_test DATABASE_URL to rerun the audit flows.

## Next steps (from TRIAGE, in order)
1. Batch 1 needs the user's decisions first: backup location and schedule (T-001), LAN versus Tailscale (T-002), where HANDOFF.md lives (T-005), git email (T-042).
2. Batch 3: T-007 shooter phone layout, T-027 creation tab strip, T-009 co-op tests, T-011 old-save migration test, T-013 feature-parser test.
3. Then Batches 4 to 6 as in `AUDIT/TRIAGE.md` section 2. Run `08_factcheck.md` on one or two fixed items.

## Learned
- Python is not installed on this PC; edit with the Edit tool or node.
- `e2e/audit/*.mjs` run against a test server: `BASE=http://127.0.0.1:5099 node e2e/audit/<flow>.mjs` (refuse port 5000). `STOP_AFTER_START=1` stops flow 12 after the Pazaak table opens.
- A room's asset ids are not unique (two counters meet, `shared/logic/index.ts`); never key React lists by `asset.id` alone (use `uniqueKeys`). The ids are left as they are because old saves hold them.
- Multiattack reader (`multiattackOf`) takes the first count it finds ("two bite attacks and one tail attack" gives one of each): a known limit, not fixed.
