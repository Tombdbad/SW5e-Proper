# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-31 (Windows PC). Branch **`babylon`** (made from main at 379299c; main is untouched and still three.js). Nothing is pushed.
Commits this session: 549fe50 (the renderer bridge), 63c63b6 (shader ports, posed shadows, three's brightness, culled cascades, sky reflections, bloom, SSAO, street lamps; it also holds the deletion of public/dice/roller.html), 08a6987 (the dice table), c8f5dfa and 92fddd4 (e2e fixes), cbae6ed (notes), 354d8d6 (dice canvas only after the first roll), 26f81d5 (software renderers drawn as lite), and the notes commit after it.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-10-31: Babylon.js draws the 3D map (REVIVAL_NOTES "Babylon draws the 3D map" has it all)
- R3F builds the scenes; `client/src/components/Map/babylon.ts` is the renderer (`<Canvas gl={babylonGl}>`) mirroring each three scene into Babylon every frame. The user's "not done yet" list is worked through (shader ports, posed shadows, cheaper cascades, sky reflections, bloom, SSAO, clustered street lamps, the dice table, e2e).
- e2e compared with main (three.js) on the same test, desktop and phone view: the branch fails only steps main fails too (desktop: cantina people, trade, speeders, road trip, plus flaky travel/allies; phone adds the map trail's Galaxy click and the dogfight's right click). Details in REVIVAL_NOTES.

## Running
- 5098: the branch's build in `.babylon-dist/` (test DB, NODE_ENV=production, scratchpad `prodtest.cjs`), left running for the user to try on this PC; stop it when done (Get-NetTCPConnection -LocalPort 5098). 5097 and 5099 are stopped.
- `.main-wt/` is a leftover folder of main's worktree (unregistered; could not be deleted while the session sat in it): delete it. It and `.babylon-dist/` are in .git/info/exclude. Creating that worktree copied the user's modified Alert.tsx into it (same hash): their own copy in the main checkout is untouched.
- The user's 5000 is `node dist/index.js` (three.js PRODUCTION build): do NOT `npm run build` into dist/ without their go-ahead (that is the merge).
- The browser pane counts as automated (dice: set `useDice.setState({table})` directly). Night in the game: the HUD's "Until evening" then "Wait 1 h".

## TODO / next, in order
1. (done: phone view read and compared)
2. Ask the user to check on their phone (lite and full), then ask before merging `babylon` into main and rebuilding their server.
3. Older e2e failures (on main too): cantina people not moving in 20 s, speeders "did not travel", road-trip guards not chasing.
4. Fat lines (drei Line) with their width.

## Open questions for the user
- Merge `babylon` into main and rebuild their server? (Only on their word.)
- (Earlier, still open) every daytime theft to ring at once (security tags)? Piper voices sorted by low/high?
