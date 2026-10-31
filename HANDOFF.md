# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-31 (Windows PC). Branch **`babylon`** (made from main at 379299c; main is untouched and still three.js). Nothing is pushed.
Commits this session: 549fe50 (the renderer bridge), 63c63b6 (shader ports, posed shadows, three's brightness, culled cascades, sky reflections, bloom, SSAO, street lamps; it also holds the deletion of public/dice/roller.html), 08a6987 (the dice table in the app), c8f5dfa and 92fddd4 (e2e fixes).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-10-31: Babylon.js draws the 3D map (REVIVAL_NOTES "Babylon draws the 3D map" has it all)
- The user: overhaul graphics, shadows and lighting with Babylon.js, every 3D scene, a branch of its own. R3F builds the scenes; `client/src/components/Map/babylon.ts` is the renderer (`<Canvas gl={babylonGl}>`) mirroring each three scene into Babylon every frame.
- Then the user asked to work through the "not done yet" list: done (see the notes) except the fat lines' width and the user's phone check.
- Learned: three's ACES is exposure/0.6 (Babylon's not); Babylon 9 PBR defaults to Oren-Nayar (use Lambert); a map's alpha needs `hasAlpha`; Babylon draws every caster into every cascade (culled per cascade now); CascadedShadowGenerator throws on WebGL 1 (falls back to one map); an InstancedMesh with count 0 must be hidden; Babylon plugin code is asked for inside the base constructor and again for every plugin when another is added (pass data beside it, `SPEC`/`JOINTS`); PBR passes vMainUV1 only for a map without repeats (plugins pass their own `vPatchUV`).

## Running
- My dev server on 5099 (test DB, scratchpad `devtest.cjs`) and my build server on 5098 (`.babylon-dist/`, test DB, `NODE_ENV=production`, scratchpad `prodtest.cjs`): stop both when done (Get-NetTCPConnection -LocalPort 5098,5099). The user's 5000 is `node dist/index.js` (three.js PRODUCTION build): do NOT `npm run build` into dist/.
- A full e2e run on 5098 (desktop) was started at the end of this session; its log is in the scratchpad (`e2efull.log`), not in the repo.
- The browser pane counts as automated (dice: set `useDice.setState({table})` directly). After HMR edits, import app modules by their `?t=` URL or you get a second instance. Night in the game: the HUD's "Until evening" then "Wait 1 h".

## TODO / next, in order
1. Read the full e2e result (desktop); then `VIEW=phone` on 5098; record both in REVIVAL_NOTES.
2. The road trip's "guards did not give chase on the next leg" (logic; check whether main fails the same way).
3. Ask the user to check on their phone (lite and full), then ask before merging `babylon` into main (and before `npm run build` for their server).
4. Fat lines (drei Line) with their width.

## Open questions for the user
- Merge `babylon` into main and rebuild their server? (Only on their word.)
- (Earlier, still open) every daytime theft to ring at once (security tags)? Piper voices sorted by low/high?
