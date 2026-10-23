# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-23, branch `main` (CLAUDE.md says `revive`; this PC works on `main`). Last commit: `989b216` (Windows start script).

## Done this session
- `deploy/windows-start.ps1 -Mode prod|test` (commit `989b216`): starts Tailscale and PostgreSQL if stopped, installs packages if missing, stops the old server on its port (only if it is `node dist/index.js`), builds, applies migrations, starts the server hidden, sets Tailscale Serve, opens the browser. Details in REVIVAL_NOTES.md "Environment and ops".
- Desktop shortcuts `C:\Users\Admin\Desktop\SW5e Production.lnk` and `SW5e Test.lnk` run it (`-NoExit`, so the window keeps the output).
- Test start run here: test server on 5002 (sw5e_test, test menu), answers 200 locally and at `https://desktop-dqdsn3q.tailb1e5d7.ts.net:10000`.

## Running now
- Test server on 5002 (started by the script; hidden node process; logs in `%LOCALAPPDATA%\sw5e\logs\test.*.log`). Snapshot in `%USERPROFILE%\sw5e-test`.
- Tailscale Serve: 10000 -> 5002 added. Existing 3000 and 3001 entries are not ours; left alone.
- Production: not started (nothing on 5000). The prod shortcut has not been run.

## Uncommitted in the working tree
- `client/src/components/ui/Alert.tsx`: the user's change, not ours. The test snapshot includes it; the prod build would too.

## Next (in order)
1. Click "SW5e Production" once and check it (port 5000, sw5e DB, Serve on 443). Look at `%LOCALAPPDATA%\sw5e\logs\prod.err.log` if it fails.
2. Ask the user whether the `Alert.tsx` change is meant to go out (commit or drop).
3. Carried over from the Linux work: the e2e run on the test server (`BASE=http://127.0.0.1:5002 npm run e2e`) is not run on this PC yet.

## Open questions for the user
- Keep the starship fight's grid? (REVIVAL_NOTES "Ground textures and no grids")
- Dice: physics dice for NPC and enemy rolls? Companion checks throw physical dice, keep?
- Branch: CLAUDE.md says `revive`; the work is on `main` here. Which one should be used?

## Learned
- No psql on this PC; use `node` with `pg` from node_modules to query.
- `tailscale serve --bg --https=<port> http://127.0.0.1:<port>` works on this PC; `tailscale serve status` lists the 3000 and 3001 entries too.
- `git` warns about CRLF on the script; harmless.
