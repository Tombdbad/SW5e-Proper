# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-21, branch `revive`. Last commit before this session: `a251506` (table rolls).

## Done this session
- Pushed `revive` to `main` (fast-forward, `87304f8..a251506`). No force push.
- Rebuilt `dist/` from `a251506` (`npm run build`, OK) and restarted the live service `sw5e` on 5000 (`sudo systemctl restart sw5e`). Started cleanly, port 5000 answers 200.
- The 5002 copy (`~/sw5e-plain`, service `sw5e-plain`) was a snapshot of the same `a251506` tree and was left running.
- Downloaded 1K Poly Haven ground sets (CC0) to `client/public/textures/ground/`: `dirt_floor`, `dense_sand`, `dark_rock`, `brown_mud_03`. Each has diffuse, normal (`nor_gl`), height and roughness JPEGs. Credits in the folder `README.md`.
- No e2e run (as asked). No code was changed, so no unit tests were run. Only the texture files and this handoff changed.

## Outstanding TODOs (in order)
1. **Ground noise + hybrid shader (outdoor ground).** Design agreed: normal map plus single-step offset parallax, on `MeshPhongMaterial` (Lambert has no normal map). Bare-earth `dirt_floor` for forest and jungle; recolour it for desert (`dense_sand`) and volcanic (`dark_rock`). Use `brown_mud_03` for sewer sludge only.
2. **Coruscant: no parallax.** Its ground uses flat or noise-only shading. Only the sewers get the sludge parallax (the user's rule).
3. **Hide the outdoor ground squares** (`LocalMap.tsx`, the `lineSegments` near line 2275). Proposed `visible={!underground && !duel}`. Fight-map grids (rooms, starship) stay. Awaiting the user's answer on whether to hide them in fights too.
4. **Ship and speeder wear, damage and age.** Masked overlay (grime, scratch, rust) on base colour and roughness; edge and crevice wear baked in Blender; age as a per-ship seed; damage from HP. Parallax only for hero ships. Needs a check of ship UVs and a search for metal wear sets. Not started.
5. Carried over from the dice work (still open): click through the table-roll overlay on 5002 (`sh deploy/test-plain.sh`, then a check and an attack in Play); convert `stealthRoll` and hazard saves to the table; the e2e play-through once the overlay is checked.

## Open questions for the user
- Hide the outdoor ground squares in fights as well, or only outside them?
- Dice (from the earlier handoff): show physics dice for NPC and enemy rolls? A d3 thrown as a d6? Companion checks throw physical dice, keep?

## Learned
- `deploy/test-plain.sh` copies the working tree into `~/sw5e-plain` and builds it there, so it is a snapshot, not a link.
- Poly Haven public API: `https://api.polyhaven.com/files/<slug>` gives the 1K URLs (`Diffuse`, `nor_gl`, `Displacement`, `Rough`, then `1k` then `jpg`). The fetch script is in `~/sw5e-assets-scratch/` (not in the repo).
- `sudo systemctl restart sw5e` works without a password on this VM.
