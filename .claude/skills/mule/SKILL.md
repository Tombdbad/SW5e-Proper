---
name: mule
description: Using Mule Create (the 3D sketching program with an MCP server and "Sketch Brief" export) to design SW5e assets - weapons, droids, vehicles, ships, props, buildings, room pieces - and build them into the game through Blender, Mixar and the game's own pipeline. Use when the user mentions Mule, a sketch, a Sketch Brief, a .mule scene, or asks to turn a sketch into a game model.
---

# Mule Create for SW5e

Mule Create (felixbfx/MuleCreate, GPL-3.0, alpha) is a standalone program for sketching in 3D with lines on planes, with notes,
reference pictures, hero cameras and spoken reviews attached to the parts. It exports a **Sketch Brief** (pictures, notes, `brief.json`,
the scene as USD) from which an AI builds the object, and while it is open it serves an MCP server so the AI can look at the scene.
It does not build meshes itself: the build is ours (Blender scripts, Mixar), in the game's formats.

## Where things are (installed 2026-11-22)
- Program: `C:\Users\Admin\Desktop\SW5E\MuleCreate\Mule\Mule.exe`, release v0.99.285 (Alpha 1.7), zip SHA-256 matched GitHub's digest. Unsigned:
  the user starts it (no Python needed). Update: download the new `Mule_Windows.zip` from the releases page and replace the `Mule` folder.
- Reference: `MuleCreate\Mule\AI_HANDBOOK.md` (313 KB, every tool, key and file format; read by heading: `grep -n '^#' AI_HANDBOOK.md`),
  `docs\recipes.md` (brief recipes), `GUIDE.md`.
- Our folders: `MuleCreate\scenes\` (.mule scenes), `MuleCreate\briefs\` (brief exports; Mule puts `work_<name>\` beside each),
  `MuleCreate\refs\` (`sw5e_scale.usda` and game models to sketch over).
- Mule's data: `%APPDATA%\Mule` (recipes, reviews, `mule.log`, optional Whisper), settings `HKCU\Software\SketchMachine`.
- Wiring (all made by `node tools/mule/setup.mjs`, safe to re-run): the recipe **SW5e game asset** (`tools/mule/recipe` installed to
  `%APPDATA%\Mule\recipes\sw5e`), the Mixar MCP server in `%APPDATA%\Mule\.mcp.json` (Mule copies it into every brief folder), the folders
  above and the scale file. The repo's `.mcp.json` gives sessions here Mule's server `sketch_machine` (http://127.0.0.1:8770/mcp,
  localhost only, no password): **Mule must be open before the session starts** (or reconnect the server).
- Blender bridge: `tools/blender/mule.py` (Blender 5.3 at `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`; Mixar runs it too).

## Units (the one thing that goes wrong)
Mule is metres, Y up, like the game's kits; Blender is Z up (`P(x,y,z) = (x,-z,y)`, as in `tools/blender/shape.py`).
- Map, rooms, doors and the architecture kit are in **units**: 1 unit = 1.4066 m (`UNITS_PER_M = 1.21/1.702` in `models.tsx`: a person
  1.702 m is 1.21 units). Door 1.0 x 1.42 units (1.41 x 2.0 m), storey 3.4 units (4.78 m). A sketch of a building piece is converted
  with `x UNITS_PER_M` when it becomes kit geometry; pass `--units` to `mule.py` for a model in units.
- Ships are built at real size in metres (`build-ships.py`) and scaled at load; droids and beasts are scaled to their stature in metres
  (`DROID_METRES`, `BEAST_METRES`). Weapons and items are in metres. Check the kit's own build script before choosing.
- `sw5e_scale.usda` (Ctrl+I in Mule) holds a 1.702 m person, a doorway, a storey and one unit square, to sketch at the right size.

## The workflow
1. **Sketch** in Mule. Import `refs\sw5e_scale.usda` (and, to sketch over an existing model,
   `blender -b --factory-startup --python tools/blender/mule.py -- refs <MuleCreate\refs> <model.glb> [--units]`; a kit glb such as
   `figures/architecture.glb` keeps every piece at its own origin, so its pieces overlap: hide the ones not wanted in Mule). Put notes on the parts
   that matter (what it is in the game, moving parts, materials), tick "hero camera" on the screenshots that show it best.
2. **Export** (Ctrl+E): one-sentence task, recipe **SW5e game asset**, parent folder `MuleCreate\briefs`. Mule puts the start sentence on
   the clipboard: the user pastes it into a Claude Code session **in this repo** (not the brief folder: our recipe has no hooks and the
   repo session has the rules, skills and pipeline).
3. **First round** (no building): read `brief.md`, open every picture in `views/` and `notes/` (Color-ID pictures `hero_*_ids.png` map
   pixels to part ids through `brief.json` `id_colors`), call `scene_brief`. Ask what the notes leave open: which kit or catalogue it
   joins, where it appears, polygon budget (person ~5k tris; LOD `.lo`; phones matter), moving parts, finish. Write the confirmed answers
   back with `write_clarified`; captions for uncaptioned pictures with `set_image_captions` only as the user confirms them.
4. **Build** in the game's formats: a new or extended `tools/blender/build-*.py` (vertex-colour `_REGION`/`_AO` attributes, no
   materials or UVs in the file, finishes applied at run time; read the kit's script and `.claude/skills/mixar/SKILL.md` first). A sketch to
   model against in Blender or Mixar: `mule.py -- blend <brief dir> <out.blend>`.
5. **Compare** with the sketch from the artist's own cameras:
   `blender -b --factory-startup --python tools/blender/mule.py -- compare <brief dir> <model.glb> <out dir> [--units]` writes
   `hero_<camera>_build.png` (same size as Mule's `views/hero_<camera>.png`, to set side by side) and `hero_<camera>_both.png` (the sketch in
   orange over the build), and prints the build's size in Mule's axes. Mixar's `render_viewport`/`inspect_geometry` for closer checks.
6. **Into the game**: register it where its kind lives (item catalogue `tools/build-item-assets.mjs`; site props in `siteAssets.tsx`;
   architecture/ship kits in their scripts and `shared/art/*.json`), check it in the model gallery `/dev/models?section=...` in a real
   browser, add the `CREDITS.md` line (original work: CC0, made from a Mule sketch), run tsc, the tests and the build check.
7. **Feedback**: the user re-exports with "Builds on" = the brief folder; Mule writes `review_rounds/<n>/review.md` into the same brief.
   Spoken reviews: `review_read`, `review_moment` (picture of the moment), `review_note`/`review_notes` make draft notes the user accepts in Mule.

## Mule's MCP tools (server `sketch_machine`)
`scene_brief` (the open scene as a live brief), `render_view`, `note_images`, `video_frames`, `image_captions`, `set_image_captions`,
`export_brief`, `write_clarified`, `set_hero_prompt`, `dictate_note`, `review_read`, `review_moment`, `review_note`, `review_notes`,
`insert_images`, `edit_note`. They work on the open scene without saving (each undoable in Mule); a modal dialog in Mule blocks every call
(300 s timeout). Write back only what the user confirmed or dictated; change notes only when asked.

## Rules
- Never commit Mule's program, its GPL code (`brief_package`, `vis_map`, `sketch_overlay`), brief folders or `.mule` scenes into the repo;
  they live in `MuleCreate\`. Our recipe and bridge are our own code.
- Precedence: the sketch's forms and the notes > reference photos > generated images. Marks show intent, not dimensions; numbers in
  notes do bind.
- Mule's "Look pre-stage" (image generation) and Mixar generation cost credits or need accounts: only on the user's word.
- The game's own rules still hold: no 2D maps, props go in the asset library, rules content only from `shared/data/sw5e`.

## Learned here
| Date | What | Notes |
|---|---|---|
| 2026-11-22 | `mule.py compare` checked on a hand-made brief (a Y-up plate, a stroke, a perspective and an orthographic camera) with a Kenney blaster | Sketch upright after USD import, ortho scale exact, curves draw. `brief.json` camera fields (`name`, `eye`, `target`, `up`, `fov_vertical_deg`, `aspect`, `orthographic_height`) are from the handbook: confirm on the first real brief, and whether `orthographic_height` is the full height |
| 2026-11-22 | Blender 5.3 headless prints "No Vulkan device found" | The Intel GPU; it falls back to OpenGL and renders. Ignore |
