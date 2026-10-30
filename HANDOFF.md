# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-30 (Windows PC), branch `main`. Today's commits: 5f2761e co-op, 2b51591 walk/crouch/prone/kick/full screen, 29a5861 jointed figures, and the commit after that one (caves, ceilings, vaults, round rooms, water worlds). Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## 2026-10-30, fourth batch (REVIVAL_NOTES "Caves, ceilings, vaults, round buildings, water worlds")
- Caves: one sheet of rock per room (`caveShellGeometry` in interiors/CaveRoom.tsx) with a rock roof in the eye views; no gaps. Mouth on the surface, other rooms underground (`levelsOf`), "Sloping passage" ramps between floors (`linkLevels`, `RampFloor`); outside, a rock hill with an arch (`CaveMound`, `RockArch`); rooms round the one stood in drawn as rock (`CaveBeyond`).
- Heights: LEVEL_H 3.4, walls 3.0; the shoulder camera keeps under the roof (`roof` in aim.ts). Palace halls vaulted, 2-3 storeys (`vaultOf`, `Vault`).
- Round rooms in many more kinds of building (`ROUND_BUILDINGS`, `linkRounds`); every building of an ocean world.
- Water worlds (shared/logic end of index.ts; siteAssets.tsx end; `SeaBeasts` in LocalMap): on the sea (gantries, catwalks, waves) or under it (domes, kelp, fog, hazard underwater); swimming (limbs.ts posture 3, half pace); water craft makes (bongo, submersible, hydrospeeder).
- Tests: new tests/world/water.test.ts (decking joined, swim pace, ocean places, caves underground with sloping passages). Full `npm test` result is in the commit message.
- Checked in the browser (dev server 5099, galleries `?section=caves`, `?section=water`, `?section=moves&act=swim|tread`). NOT checked: a real campaign on an ocean world, walking a cave in play, a phone. The e2e screenshot of these gallery sections times out (heavy first load); use the built-in browser.

## Running
- Dev server on 5099 (sw5e_test) is Claude's: scratchpad `dev5099.cjs`; stop it (Stop-Process on the pid listening on 5099) when done.
- 5002 (test copy) is an OLD build. The user restarts it in an administrator PowerShell: `powershell -ExecutionPolicy Bypass -File deploy\windows-start.ps1 -Mode test -Lan`.

## Next, in order
1. The user tries caves, palaces and an ocean world on a new campaign (caves made before today keep their old plan).
2. Not done from the request: crossing an ocean world by boat (the trip is still the road scene), riding the water craft in a district, beasts of encounters put in the water, co-op peers and followers drawn swimming, a species' swimming speed (swimPace exists, not wired).
3. Earlier: tune poses from feedback; real roles on ships; the co-op shooter fight; the followers-attack report; the wi-fi mystery (phone on 192.168.0.156:5002 fails, Tailscale works).

## Learned
- Bash heredocs/`node -e` mangle backticks, `${}`, apostrophes and backslashes: write patch scripts with the Write tool into the scratchpad (exactly-one-match `rep`) and run them with node. `sed -i` in Git Bash drops CRLF.
- CRLF files: CaveRoom.tsx, aim.ts, FlightScene.tsx, CoopUI.tsx, ViewRig.tsx, stick.ts, Shooter.tsx, ModelGallery.tsx. LocalMap.tsx, index.ts, limbs.ts, siteAssets.tsx, models.tsx are LF.
- Rotating both arms by the same angle about x keeps a two-handed grip; twist the chest, not the arms, about y.
- Vite HMR can hold a second module instance: restart the dev server when a change seems not to take.
