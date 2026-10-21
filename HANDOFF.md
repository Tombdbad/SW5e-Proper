# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-21, branch `revive`. Last commit before this session: `39566d6` (ground textures, ship-wear TODO). `main` is at `a251506`.

## Done this session
- Grids removed from the 3D map: the room squares (`LocalMap.tsx`), the outdoor ground squares (`LocalMap.tsx`), and the coordinate grid in `LocalAreaMap.tsx`. The starship fight's 50-ft grid (`SpaceScene`) is kept: it is space, not a place. Confirm with the user if they meant that one too.
- Textured ground (`siteAssets.tsx`: `groundTexture`, `GroundSurface`; `LocalMap.tsx` ground block): bare earth for most worlds, recoloured; `dense_sand` for desert; `dark_rock` for volcanic; `brown_mud_03` for sewer systems. Urban (Coruscant) keeps the plain ground.
- Hybrid shader: Phong with the normal map, plus single-step offset parallax from the height map (`PARALLAX` 0.05). Shader injected with `onBeforeCompile`, Three.js 0.170 chunk names checked in `node_modules`.
- Checks: `npx tsc --noEmit` reports no errors in `LocalMap.tsx`, `siteAssets.tsx` or `LocalAreaMap.tsx` (the project has ~600 legacy errors elsewhere). No tests cover these files, so no modular tests were run.
- Not run: e2e (on purpose), a browser render, and a build. The 5000 service still runs the `a251506` build; 5002 runs an older snapshot.
- REVIVAL_NOTES.md has a new section "Ground textures and no grids (2026-10-21)".

## Next (in order)
1. Check the ground on 5002 (`sh deploy/test-plain.sh`, then look at a forest, a desert, a volcanic world, a sewer and Coruscant). Things to look for: a black ground (a shader compile error blanks the plane; check the browser console); swimming (lower `PARALLAX`); bare earth too bright or too dark (tint in `groundTexture`).
2. Once the ground looks right, promote with `npm run build && sudo systemctl restart sw5e` (the 5000 service). Not done yet.
3. Ship and speeder wear, damage and age (masked overlay, edge wear baked in Blender, age as a per-ship seed, damage from HP; parallax only on hero ships). Needs a check of ship UVs and a search for metal wear sets. Not started.
4. Carried over from the dice work: click through the table-roll overlay on 5002 (a check and an attack in Play); convert `stealthRoll` and the hazard saves to the table; the e2e play-through once the overlay is checked by hand.

## Open questions for the user
- Keep the starship fight's grid, or remove it too?
- Dice: show physics dice for NPC and enemy rolls? A d3 thrown as a d6? Companion checks throw physical dice, keep?

## Learned
- `deploy/test-plain.sh` copies the working tree into `~/sw5e-plain` and builds it there, so it is a snapshot, not a link.
- Poly Haven API: `https://api.polyhaven.com/files/<slug>` gives the 1K URLs. The download script is in `~/sw5e-assets-scratch/` (not in the repo).
- Lambert takes no normal map in Three.js 0.170; the ground is Phong for that reason.
- `sudo systemctl restart sw5e` works without a password on this VM.
