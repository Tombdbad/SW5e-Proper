# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-23, branch `main` (CLAUDE.md says `revive`; this PC works on `main`). Last commit: `1ec9f67` (race keyboard controls).

## Done this session
- `989b216`: `deploy/windows-start.ps1 -Mode prod|test` and desktop shortcuts "SW5e Production" and "SW5e Test" (details in REVIVAL_NOTES.md "Environment and ops").
- `c52d557`: handoff for that.
- `1ec9f67`: speeder race keyboard controls in `MinigamePage` (`client/src/components/Map/FlightScene.tsx`): W throttle up, S throttle down (brake), A/D steer left/right (`steer.x`), Right Shift boost. The drag pad and buttons still work. Lost focus clears the keys.

## Running now
- Test server on 5002, built from the snapshot with `1ec9f67` (`%USERPROFILE%\sw5e-test`). Tailscale Serve 10000 -> 5002. The hidden node process is pid 3340 at the time of writing.
- Production: not started (nothing on 5000). The prod shortcut has not been run.

## Not verified
- The race keys were type-checked (no errors in FlightScene.tsx) and the test build passes, but NOT played in a browser. Nobody has driven the race with the keyboard yet.
- W does nothing to speed in the rules yet: `drive()` in `shared/logic/index.ts` accelerates toward top speed whenever throttle is not negative, so W (throttle +1) and no key feel the same. Decision needed (below).

## Uncommitted in the working tree
- `client/src/components/ui/Alert.tsx`: the user's change, not ours. Left alone.

## Next (in order)
1. Try the race on the test server (https://<this PC>:10000, a race in Play): A/D, W/S, Right Shift.
2. Decide what W should do (below), then change `drive()` if so.
3. Click "SW5e Production" once and check it.

## Open questions for the user
- W "speed up": the car already accelerates to top speed with no key held. Should W make the pull to top speed faster (a rules change in `drive()`), or is W only meant to be a placeholder?
- S: brake (current behaviour) or reverse?
- Is the `Alert.tsx` change meant to go out?
- Keep the starship fight's grid? (REVIVAL_NOTES "Ground textures and no grids")
- Branch: CLAUDE.md says `revive`; the work is on `main` here.

## Learned
- No psql on this PC; use `node` with `pg` from node_modules to query.
- `windows-start.ps1` piped into `Select-Object` never returns (the hidden node server holds the pipe). Run it from the shortcut or with no pipe.
- `tailscale serve --bg --https=<port> http://127.0.0.1:<port>` works here; `tailscale serve status` also lists the 3000 and 3001 entries (not ours).
