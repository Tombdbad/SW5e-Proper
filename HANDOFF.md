# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-01 (Windows PC). Branch **`main`**. origin has main up to e502652; f20b19e, 5df1f3e and the room-change commit after them are local, not pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-11-01 (last): room changes, district loading screen, nearest first, looks (REVIVAL_NOTES "Room changes, the district's loading screen...")
- babylon.ts: one fixed light rig, `Effect.PersistentMode`, shadow shaders named by source, GPU textures by image, label cards kept, lamp shadow every other frame, materials shared by look, nearest-first draw order. LocalMap BuildingScene: the district loading screen (`useWarmup`, GameBoard `DistrictLoading`). Room changes 1.5 s → under 0.2 s; 52 shaders a session. Tests: babylon.test.ts (11).
- NOT run: `npm run e2e` (needs a build, which would change what 5000 serves). Not seen moving: the nearest-first order (any popping surface), the screen on a real window. 5000 still runs e502652.
## 2026-11-01 (earlier): where the frames go (REVIVAL_NOTES "Where the frame goes", "Fixed", "Next")
- Measured on dev 5099 (`/game/625`, the only campaign in `sw5e_test`) by driving frames from the console (the hidden pane makes none). The GPU is pixel-bound; the old desktop tier was too heavy for the HD 530; the mirror sync was 11 ms of garbage-making.
- Fixed in babylon.ts: lights re-enabled every frame (Babylon walked all meshes per light), string/array signatures per mesh and material, and an `INTEGRATED` (Intel non-Arc) "auto" like a phone: 3x1024 shadows, no SSAO, no parallax occlusion. Sync 11 to 3 ms; GPU by day 26 to 17 ms at 704x720. Test added (babylon.test.ts, 10 pass). NOT rebuilt on 5000.
- The 5099 dev server (background, `npx tsx server/index.ts` on `sw5e_test`) may still run: stop it when done. The pane localStorage has `sw5e.detail=full`, `sw5e.resolution=1` (dev origin only).

## 2026-11-01 (later): walls with two textures, resolution, Options (REVIVAL_NOTES "Wall textures, resolution, Options")
- Walls from one pack a building (`wallPackOf`) and the pattern in the building's frame (boxUV origin, WallAnchor). Options dialog (resolution, detail, effects, display) replaces four buttons of the map strip. `__babylon.timing` splits the frame. NOT rebuilt: 5000 runs e502652; the shortcut or a build and restart brings this.
- Not looked at in a palace (the test campaign is a cave), nor measured on the real window (the browser pane was hidden; its frames throttle). Next: the notes' "Where the frame goes" list.

## 2026-11-01: the user's list (REVIVAL_NOTES "Walking, balustrades, night, moons, mounts, warm-up" has all of it)
- Stride slower (limbs.ts `CYCLES_PER_SQUARE`), no jump while prone (`beginJump`), keys stop the walk at once on release (`driven` walks, ViewRig `halt`, `stepToward` with a zero push). Checked in the browser on a dev server: no jump prone, a jump standing, the position at a key's release is the position later.
- Balustrade: one `Balustrade` piece for the outside and the inside (gallery sides, a walkway's long sides). Ground parallax 0.065 → 0.045. Night ambient halved under a full moon and less under other phases; moon phases by the clock's days (shared/logic `moonlight` and co). Riders: a quarter of the district's strollers ride a beast with a dismount, shop, load, remount errand at each door. Warm-up of the district's room assets while in the street.
- Tests: 525 pass, 3 skipped (before the last edit to ViewRig's key handler, which is covered by the browser check, not a test). New: stride rate, errand timeline, moon phases, driven walks.
- NOT looked at in the browser: the balustrade (the test campaign is a cave hideout: no walkway), the riders (no district with strolls), the night and the moons. Look at an urban or station world at night. The warm-up cannot be measured by me (no feel for the hitch, and it does not compile shaders): ask the user whether room changes are better.
- Both desktop shortcuts now always listen on the local network (`$Lan = $true` in windows-start.ps1), the user asked.
- Rebuilt from e502652 and restarted by hand (not the shortcut: it stops at "Port 5002 is still in use", node pid 15424 with children, access denied, so it was started from an administrator window). 5000 listens on 0.0.0.0. No firewall rule "SW5e game port 5000" exists: it is made once by the shortcut from an administrator window. Wi-fi reachability from another device is untested.

## Running
- 5000: the user's server, `node dist/index.js` built from main at e502652, HOST=0.0.0.0, logs in %LOCALAPPDATA%\sw5e\logs. To restart after a build: `deploy/windows-start.ps1 -Mode prod` (also opens the browser; needs 5002 free).
- The 5099 dev server is stopped. Not ours, left alone: tsx dev servers on 3000 and 5057.
- The browser pane counts as automated (dice: set `useDice.setState({table})` directly). Night in the game: the HUD's "Until evening" then "Wait 1 h". `window.__street()` gives the party's position, `window.__air()` its jump mode.

## TODO / next, in order
1. The user looks at the above (balustrade, night and moons, riders, room changes) and says what is off.
2. The user checks on their phone (lite and full) over Tailscale.
3. Older e2e failures (also with three.js): cantina people not moving in 20 s, speeders "did not travel", road-trip guards not chasing.
4. Fat lines (drei Line) with their width.
5. The real database (`sw5e`) holds e2e leftovers (7 "Gear mvo…" fighters and "E2E gear …" campaigns): ask the user before deleting.

## Open questions for the user
- Delete the e2e leftovers in the real database?
- Moon periods are invented (8 to 24 days by drift): fine, or one lunar month for every world?
- (Earlier, still open) every daytime theft to ring at once (security tags)? Piper voices sorted by low/high?
