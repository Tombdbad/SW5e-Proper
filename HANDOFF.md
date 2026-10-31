# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-31 (Windows PC). Branch **`babylon`** (made from main at 379299c; main is untouched and still three.js). Nothing is pushed.
Commits this session: 549fe50 (the renderer bridge), 63c63b6 (shader ports, posed shadows, three's brightness, culled cascades, sky reflections, bloom, SSAO, street lamps; it also holds the deletion of public/dice/roller.html), 08a6987 (the dice table), c8f5dfa and 92fddd4 (e2e fixes), cbae6ed (notes), 354d8d6 (dice canvas only after the first roll), 26f81d5 (software renderers drawn as lite), and the notes commit after it.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-10-31: Babylon.js draws the 3D map (REVIVAL_NOTES "Babylon draws the 3D map" has it all)
- R3F builds the scenes; `client/src/components/Map/babylon.ts` is the renderer (`<Canvas gl={babylonGl}>`) mirroring each three scene into Babylon every frame. The user's "not done yet" list is worked through (shader ports, posed shadows, cheaper cascades, sky reflections, bloom, SSAO, clustered street lamps, the dice table, e2e).
- e2e (desktop) compared with main on the same test: the branch now fails only steps main fails too (cantina people, trade, speeders, road trip; travel and allies are flaky). Phone view run on the branch was started last (scratchpad `e2ephone.log`); not yet read.

## Running (stop these when done: Get-NetTCPConnection -LocalPort 5097,5098,5099)
- 5099: dev server of the branch (test DB, scratchpad `devtest.cjs`). 5098: the branch's build in `.babylon-dist/` (test DB, `prodtest.cjs`). 5097: main's build in the worktree `.main-wt` (test DB, `maintest.cjs`); remove the worktree with `git worktree remove .main-wt` when done. Both folders are in .git/info/exclude.
- The user's 5000 is `node dist/index.js` (three.js PRODUCTION build): do NOT `npm run build` into dist/ without their go-ahead (that is the merge).
- The browser pane counts as automated (dice: set `useDice.setState({table})` directly). Night in the game: the HUD's "Until evening" then "Wait 1 h".

## TODO / next, in order
1. Read the phone-view e2e result; compare any new failure with main (VIEW=phone, ONLY=<step> on 5097).
2. Ask the user to check on their phone (lite and full), then ask before merging `babylon` into main and rebuilding their server.
3. Older e2e failures (on main too): cantina people not moving in 20 s, speeders "did not travel", road-trip guards not chasing.
4. Fat lines (drei Line) with their width.

## Open questions for the user
- Merge `babylon` into main and rebuild their server? (Only on their word.)
- (Earlier, still open) every daytime theft to ring at once (security tags)? Piper voices sorted by low/high?
