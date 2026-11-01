# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-01 (Windows PC). Branch **`main`** (the checkout is on main). origin has main up to 98a2178; 5f5121c and this session's commit are local, not pushed (the user has not asked).
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.

## 2026-11-01: the user's list (REVIVAL_NOTES "Walking, balustrades, night, moons, mounts, warm-up" has all of it)
- Stride slower (limbs.ts `CYCLES_PER_SQUARE`), no jump while prone (`beginJump`), keys stop the walk at once on release (`driven` walks, ViewRig `halt`, `stepToward` with a zero push). Checked in the browser on a dev server: no jump prone, a jump standing, the position at a key's release is the position later.
- Balustrade: one `Balustrade` piece for the outside and the inside (gallery sides, a walkway's long sides). Ground parallax 0.065 → 0.045. Night ambient halved under a full moon and less under other phases; moon phases by the clock's days (shared/logic `moonlight` and co). Riders: a quarter of the district's strollers ride a beast with a dismount, shop, load, remount errand at each door. Warm-up of the district's room assets while in the street.
- Tests: 525 pass, 3 skipped (before the last edit to ViewRig's key handler, which is covered by the browser check, not a test). New: stride rate, errand timeline, moon phases, driven walks.
- NOT looked at in the browser: the balustrade (the test campaign is a cave hideout: no walkway), the riders (no district with strolls), the night and the moons. Look at an urban or station world at night. The warm-up cannot be measured by me (no feel for the hitch, and it does not compile shaders): ask the user whether room changes are better.
- Both desktop shortcuts now always listen on the local network (`$Lan = $true` in windows-start.ps1), the user asked.
- Not rebuilt: the server on 5000 runs the build from before the vanishing-assets fix and all of this. "SW5e Production" (desktop shortcut) builds and restarts it.

## Running
- 5000: the user's server, `node dist/index.js` built from main at 4c3a8d8 (Babylon). To restart after a build: `deploy/windows-start.ps1 -Mode prod` (also opens the browser).
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
