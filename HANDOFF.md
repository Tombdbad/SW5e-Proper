# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-11-03 (Windows PC). Branch **`main`**. origin/main is at 1277668; everything after it is local, NOT pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told, never commit it.
`.claude/launch.json` (untracked) starts a dev server on PORT 5001 for browser checks (port 5000 is not running; nothing built or deployed).
Do not push, rebuild 5000 or merge without the user's go-ahead.

## This session (all local commits after the shooter items/contraband work 1827645)
- 72fae35 dice table frame rate (COVER in Map/babylon.ts, look off, pixel ratio 1.5)
- 86aa4d0 shadows: no fixed white sun/ambient on the GameBoard canvas, sun shadows in streets by day only, fake dark lot patch gone, lamps cast
- fe6f4f0 lamp shadow depth over the lamp's own near/far (bias was 4 m)
- 46be7af room shadows: ceilings cast, room lamps are shadow candidates, night dimming, shaft only by day
- (uncommitted until the test run ends) windows + indoor light: `moreWindows` (shared/logic, LIFE 18), bigger PANE_SCALE, scattered daylight,
  `fixturesFor` and LAMP_GAIN 2.5 in interiors/atmosphere.ts, night ambient 60%; tests/world/windows.test.ts (2).

## Open
- The user said the OUTDOOR daylight was broken by the room-shadow commit ("like a roof on the outside"). Not reproduced: outdoor frame brightness
  is identical with and without it (open ground 9:30 and 12:30; street 11:07 looked right). Ask where and when (street between buildings, a roof
  terrace or balcony, the tabletop view, a low morning or evening sun?). Suspects: the opened room's ceiling now casts (its shadow falls across the
  street at a low sun), `Sky` takes the party for indoors while a room is `opened` though they stand outside (ambient x0.5).
- A full `npm test` run after the windows change (world generation changed): see the last run's output.
- Ask: build, restart 5000 (the new campaign worlds are life 18: migrations not needed, the world is JSON), push.

## Useful
- Dev server for checks: `mcp preview_start dev-5001` (.claude/launch.json); server code is not reloaded, restart it after changing shared/logic.
- Set the game clock in the page: import the LocalMap module URL from `performance.getEntriesByType('resource')` and `useClock.getState().set(minutes)`.
- Frame brightness probe: hook `engine.endFrame` and `gl.readPixels`; rig lights: `[...__babylon.mirrors.values()][0].rig`.
