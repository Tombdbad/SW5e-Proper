# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-30 (Windows PC), branch `main`. Commits today: 5f2761e co-op fixes, 2b51591 walk/run, crouch/prone, facing, kick, full screen; the animation work below is the commit after those. Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## 2026-10-30, third batch: jointed people, weapon holds, saber forms, recoil/spread, textures (REVIVAL_NOTES "Jointed people, ...")
- Skeleton: `interiors/limbs.ts` LIMB now 20 limbs (chest, foreR/L, shinR/L, weapon, head added) with PARENT; shader chains each limb through its parents (uniform `uP` pivots, from `Kit.pivots`, kept on the baked geometry's userData).
  `buildHumanoid` (models.tsx) builds thigh+shin, upper arm+forearm, weapon at the wrist, head on its neck; a rifle is built shouldered.
- `humanPose` (limbs.ts): walk/run/crouch/prone/jump, holds (pistol, rifle, saber, melee, pole, carry), recoil, flinch, parry, keyframed strikes; 11 saber styles from the 20 forms (`FORM_STYLE`).
  Scenes say what a figure does through `MotionContext` (models.tsx) with a `Motion` ref: party `partyMotion` (aim.ts), peers/fight `Posture` and `useFightMotions` (LocalMap), shooter `motionOf` (Shooter.tsx).
- Shooter: figures hold the drawn weapon (`wield` on Figure; figureSpec reorders the gear's weapons); floating sabers only in first person. Saber models x2.8 in a hand (gear.ts).
- House rule `gunKick` (shared/logic/shooter.ts): kick and steadiness by gun kind; bloom and cone use them; the view climbs (`recoil` in aim.ts).
- Textures: `node tools/build-figure-textures.mjs skin face droid cyber weave mesh` made new sets; finishes droid/cyber/weave/mesh in models.tsx; droids panelled, prostheses plated, robes woven, undersuits ribbed.
- Gallery `/dev/models?section=moves` (and `&act=prone` etc.) shows it all; `e2e/moves.mjs` shoots views (name=query args).
- Checked: limbs/shooter unit tests; e2e/shooter.mjs and fight-view.mjs play. NOT checked: a phone; the shooter over the shoulder mid-swing; the full `npm test` result is in the commit message.

## Earlier today
- Co-op first play fixes (5f2761e): wi-fi notes, 12/s positions with height, peers' pets, encounter stranger follows one member, speeder gunner seat (`RoadRide`, `lib/roadBus.ts`), roadblock guards.
  The phone on wi-fi still fails (ERR_TOO_MANY_RETRIES on 192.168.0.156:5002, cause not found); Tailscale works.
- Second batch (2b51591): Walk default at half speed, Run restores; Crouch (C) and Prone (Z); peers face and show posture; host Kick; Full screen button.
  Followers attacking: companions already fight as allies; not changed; ask the user for the case they saw.
- 5002 (test copy) is still an OLD build. The user restarts it in an administrator PowerShell: `powershell -ExecutionPolicy Bypass -File deploy\windows-start.ps1 -Mode test -Lan`.
- Process: dev server on 5099 (sw5e_test) is Claude's; stop it (Stop-Process on the pid listening on 5099) when done.

## Next, in order
1. The user tries the new figures on 5002 (and two devices for co-op). 2. Tune poses from what the user says (keys in limbs.ts STYLES / humanPose). 3. Real roles on SHIPS. 4. The co-op shooter fight.
5. Open: can a real-time defeat be death?; road ambushes and the pit arena are still turn-based; the followers report.

## Learned
- Bash heredocs/`node -e` mangle backticks, `${}`, apostrophes and `\r\n`: write patch scripts with the Write tool into the scratchpad (CRLF-aware `rep`, exactly one match) and run them with node.
  FlightScene.tsx, CoopUI.tsx, ViewRig.tsx, stick.ts are CRLF. Python is not installed. `sleep` is blocked: wait with an until-loop.
- Rotating both arms by the same angle about x keeps a two-handed grip (the shoulders share an axis); twist the chest, not the arms, about y.
- Vite HMR makes `import("/src/...")` from a test script return a second module instance: restart the dev server before a run.
- Dev server on the test DB: scratchpad `dev5099.cjs` (reads .env, swaps /sw5e for /sw5e_test, spawns `npx tsx server/index.ts` with PORT=5099 VITE_TEST_MENU=1); recreate it if the scratchpad was cleared.
