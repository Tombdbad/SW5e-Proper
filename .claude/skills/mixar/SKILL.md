---
name: mixar
description: Using Mixar (the Blender 5.2 fork with an AI agent, layered texture painting and AI 3D generation) to build and improve the game's 3D models (heads, hair, weapons, armour, droids, garments) headless, and keeping a log of what goes wrong with it. Use when the user asks to use Mixar, to iterate on models with it, or when a Blender script for the game needs running, checking or fixing in Mixar.
---

# Mixar for SW5E models

Mixar (Mixar-AI/mixar-app, Adeveda Enterprises) is a fork of Blender 5.2. Sculpting, modelling, UVs, baking, Python and rendering are Blender's. It adds the Mixie chat agent, layer-based painting (a Layers editor), AI 3D generation (text/image to 3D, retopology, auto-UV), moodboards and asset search. Client GPL-3.0-or-later; the AI backend is closed and hosted.

**Sources (2026-11-05):** [repo](https://github.com/Mixar-AI/mixar-app), [wiki](https://github.com/Mixar-AI/mixar-app/wiki), [Hermes plugin page](https://hermes-agent.nousresearch.com/docs/plugins/mixar). No tutorials exist yet; everything under "Learned here" is first-hand.

## Where it is
- Official release v4.4.0 (published 2026-11-04). The MSI is in `C:\Users\Admin\Downloads\mixar-4.4.0\` (SHA-256 7551fd5c...b861, matches GitHub's digest), **extracted, not installed**, with `msiexec /a Mixar-4.4.0-x64.msi /qn TARGETDIR=<dir>\extracted` (928 MB).
- Exe: `C:\Users\Admin\Downloads\mixar-4.4.0\extracted\Mixar\mixar.exe`. Its scripts are readable in `...\Mixar\5.2\scripts\mixar\` (modules: paint, mesh_segment, local_models, sculpt_agent, scene_graph, headless, mcp ...). `modules/paint/paint.md` is the closest thing to a manual.
- **Version**: `--version` prints "Blender 4.4.0", which is Mixar's own version number. `bpy.app.version` is (5, 2, 0), Python 3.13.13.
- Blender 5.2.3 LTS stays at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`; it is the reference.

## Rules for this project
1. **Account**: AI features need a Mixar account and spend credits. Claude does not sign in, enter keys or spend credits. Non-AI tools only, unless the user does it themself and says so.
2. **Headless first**, always with `export MIXAR_USER_RESOURCES='C:\Users\Admin\AppData\Local\Temp\mixar-res'` (keeps the user's profile untouched): `mixar.exe --background --factory-startup --python-exit-code 1 --python <script> -- <args>`. ABSOLUTE paths in args, as with Blender.
3. **The pipeline stays ours**: the formats the game reads (`figures/*.glb`, `shared/art/*.json`, atlas cells, `P(x,y,z)=(x,-z,y)`) come from `tools/blender/*.py`. Mixar is for building, checking and improving, not for changing those formats.
4. **AI-generated meshes are not used** in the game unless the user says so and the licence is recorded in `CREDITS.md`.
5. **MCP connector** (`mixar-mcp`: runs scripts with the user's privileges, sends scene context to third parties): not used without the user's go-ahead.
6. **Never leave models overlapping in the user's scene** (the user, 2026-11-05: one gun sat on a head). After importing anything, lay objects out in a grid by bounding box with a gap, and have the script check pairwise AABB overlap and print `overlaps []` before rendering. Importing puts everything at the origin. One import per call (a call with no visible output still ran: check `scene_overview` before repeating it, or you get `.001` duplicates). Delete only objects you made, never the user's unless asked.
7. Compare every result with the Blender 5.2 output of the same script (sizes, bounds, a rendered preview) before committing it.

## Useful commands
- **Our scripts run unchanged.** `build-weapons.py -- <ABS OUT DIR>` (the arg is a directory; the file goes inside): Mixar 6 s against Blender 5.2's 14.5 s; the glb is the same size and byte-identical except 2 bytes (the exporter's version string). Heads (`build-head.py`, ~10 min) not yet compared: do it before relying on it.
- Present: glTF/FBX/BVH/UV-layout add-ons, Cycles.
- Probing: `bpy.app.version`; `import mixar; pkgutil.iter_modules(mixar.__path__)`; list `bpy.ops` to find operators.

## Driving the running GUI (the user signs in and turns on "Connect MCP")
- `node tools/mixar-mcp.mjs <tool> '<json>'` talks to `~.mixarconnectormixar-mcp.cmd` (stdio JSON-RPC; 65 tools, `--list`, `--schema <tool>`). Images from renders are saved to `$MIXAR_OUT` (default `%TEMP%mixar-out`); Read them. Free tools: `mixar_status`, `scene_overview`, `execute_bpy_script` ({"code": ...}), `render_viewport`, `inspect_uv_map`, `inspect_mesh_seams`, `get_paint_layer_stack`. Credit-spending: `enqueue_generation`, `create_layered_material` (ask `mixar_tool_quote` first and the user before any call; the account had 0 credits on 2026-11-05).
- Pattern that works: `execute_bpy_script` imports (`bpy.ops.import_scene.gltf(filepath=...)`; put new objects in a `claude_*` collection so they can be deleted), then `render_viewport {view:"hero", focus_objects:[...], include_touching:false}`. ~9-13 s a render.
- The script sandbox blocks os/sys/pathlib/subprocess and exec/eval; only the listed modules import. File paths given to bpy operators work.

## Tips (from the docs, not yet confirmed here)
- Work in small steps and render to check; do not trust a script's success message alone.
- Layered painting (Layers editor) suits close-up texture/normal maps for guns and armour; bake to images and export them to `textures/`.
- Auto-UV and seam inspection can check UV overlap and stretch in our box-UV merged meshes.
- `NVIDIA + Wayland` `EGL_BAD_ALLOC` is Linux-only; irrelevant here.

## Failure modes and mitigations
**Add a row every time something goes wrong with Mixar, in the same turn you meet it** (date, symptom, cause if known, what fixed it). Mark guesses as "unconfirmed".

| Date | Symptom | Cause | Mitigation |
|---|---|---|---|
| 2026-11-05 | `Invoke-WebRequest` of the 326 MB MSI showed a 0-byte file and a lock for 10+ minutes | PowerShell 5.1 holds the body and writes at the end; the download was fine and finished | Wait for the task, or use `curl.exe -L -o`. A second curl onto the locked file fails with exit 23. Check size and `Get-FileHash` against the release `digest` |
| 2026-11-05 | WebFetch of the releases page lists no asset names | Assets load lazily | `Invoke-RestMethod https://api.github.com/repos/Mixar-AI/mixar-app/releases/latest` lists them with digests |
| 2026-11-05 | `bpy.ops.layers.create_material` "could not be found" from `layer_stack.initialize_layer_paint_project` | The layered-paint operators are not registered in `--background` runs (the `layers` category exists but is empty); calling `mixar.modules.paint.register()` again errors on duplicate classes | Layered painting looks GUI-only. Use plain `bpy` (bake, nodes) in scripts. Unconfirmed: whether a Dev build or an env var enables it |
| 2026-11-05 | `execute_bpy_script` refused: "unscoped delete" | The sandbox blocks any `bpy.data.objects.remove` loop over a collection without a positive name guard, and imports of unused modules (`glob`) | Delete by explicit names or `startswith('claude_')`; make a new collection each run; drop unused imports. The error appears before anything runs |
| 2026-11-05 | `mixar-mcp.mjs` printed only `(isError)` | The error text is in `content`, which the first version of the client did not print | Fixed: it prints the error body now |
| 2026-11-05 | Node could not read a script written to `/tmp` from Git Bash | Node on Windows reads `/tmp` as `C:\tmp` | Write scratch files under `/c/Users/Admin/AppData/Local/Temp` |
| 2026-11-05 | `mixar.exe --version` says "Blender 4.4.0" | It prints Mixar's version | Ask `bpy.app.version` (5, 2, 0) |
| 2026-11-05 | `mixar.headless.headless_main` looks like a script runner | It is the cloud agent's sandbox worker; needs backend tokens | Do not use; run scripts with `--python` |
| 2026-11-05 | Passing a file path as the weapons script's `-- <out>` made a folder named like the file | The arg is an output directory | Pass a directory; the glb is written inside it |
| 2026-11-05 | `render_viewport` view `front` showed a gun end-on and the default cube hid everything | Our guns lie along Y; the default scene's Cube is in the frame | Use `view:"hero"` with `focus_objects` and `include_touching:false` |
| 2026-11-05 | glb vertex colours not in the imported meshes (`color_attributes` empty) and no materials | The kit's colours are applied at run time by region (`gunGeometry`), not stored in the file | Judge shapes in grey; do not expect finishes from Mixar renders |
| 2026-11-05 | Computer use refused "Mixar" | The app resolves by its file name | Resolve and request access with `Mixar.exe` |
| 2026-11-09 | `mixar_guide` said "Sign in to Mixar", then "connecting to its server" | Mixar was starting | Wait a few seconds and call `mixar_status` again; it connected on the third try |
| 2026-11-09 | `mixar_ui_observe` refused: "Interface control is off" | The user's setting "Let AI apps control Mixar's interface" is off | Not needed for moodboards: they are scene properties a script can write (see Learned here) |
| 2026-11-09 | A capital ship's keel ended up on top of its decks | `h.at(rot=(pi, 0, 0))` turned the keel's -y slab upside down | Place a part below the deck at negative y; do not flip it with a rotation |
| 2026-11-09 | `scene_overview` failed with `document_changed`, and the earlier review tab ("SW5e starship kit") was gone; only the user's "Scene" was left | Another document was opened in Mixar, which replaces the open tabs; the unsaved review tab went with it | Never rely on an unsaved review tab lasting: put the moodboard and review scenes in a `.blend` the user agrees to save, or rebuild them from the scripts. Make a new tab with `mixar_scene_new`; do not touch the user's tab |
| 2026-11-09 | Close-up `render_viewport` with `focus_point` showed a black frame | A kilometre-long ship next to the target filled the camera | Hide every other object (`hide_set`, `hide_render`) before a close-up, or lay big ships out kilometres apart |
| 2026-11-05 | Text typed into Mixar's Python console did not arrive (or `key "plus"` was refused) | The console takes pasted text more reliably than typed keystrokes | Put the line on the clipboard, click the console, Ctrl+V, Return. Up recalls the last line |
| 2026-11-05 | A paste ran an older version of the script | The file on the PC was not the one just written | After writing a script to the PC, check its size or mtime before running it |
| 2026-11-05 | `NameError: math` in the console | The console's namespace has `radians`, `Euler`, `Vector`, not `math` | Import what you use in the pasted line |
| 2026-11-05 | A picture viewer window covered the console and the paste went nowhere ("no app is frontmost") | Another app on top took the click | Click an uncovered part of the console, then paste |
| 2026-11-05 | Exported meshes named `sphead_x.001` | The open scene already had objects of those names (an earlier live review) | The scripts' in-session export (`builtins.ARCH_EXPORT`, `builtins.SPECIES_EXPORT`) renames the old ones `_review` first and refuses to export a wrong name |
| 2026-11-09 | `execute_bpy_script` refused a script containing `globals` (to build a dict of helpers) | The sandbox blocks `globals`, `locals`, `vars`, `eval`, `exec` | List the functions in a dict literal by name |
| 2026-11-09 | "Object.to_mesh is not allowed" on `bm.to_mesh(me)` | `bm` came out of a dict, so it was not traced to `bmesh.new()` | Build the mesh with `me.from_pydata(coords, [], faces)` from the bmesh data, then set `material_index`, `use_smooth` and the `_REGION` attribute with `foreach_set` |
| 2026-11-09 | The overlap check reported every new piece overlapping every other | It used `matrix_world`, which is the identity until the depsgraph updates after `location` is set | Use `matrix_basis` (or call `bpy.context.view_layer.update()` first) |
| 2026-11-09 | `render_viewport` of a long row of pieces showed tiny objects | The focus box was 45 units wide | Lay packs out in rows of about 24 units, or use `focus_point` with a small `focus_radius` |
| 2026-11-09 | `mixar_scene_new`, `mixar_project_open` and `mixar_scene_switch` refused with "ui_busy" (an operation open in the user's GUI) for most of an hour | A dialog or a transform was open in the user's Mixar | Do the headless work meanwhile (build scripts run without the GUI); tell the user; retry later |
| 2026-11-09 | `mixar_project_open` of a recent project refused with "unsaved_changes" | The file already open ("ships 2") had unsaved changes | Never choose `save` or `discard` for the user: ask which. `mixar_projects` shows `current_unsaved_changes`; the project opened first ("ships 2") had no moodboard in it, the board is in another |
| 2026-11-09 | Exported per-vertex colours | `export_scene.gltf(export_vertex_color="ACTIVE")` writes COLOR_0 from the active colour attribute (a FLOAT_COLOR, linear) | Works in Mixar 5.2; check the file with `@gltf-transform/core`; the colours are not seen in the viewport until a material with a Color Attribute node is on the pieces (delete it again with the review objects) |
| 2026-11-11 | The Blender reference path `...\Blender 5.2\blender.exe` does not exist | The installed Blender is 5.3.0 (`C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`); Mixar itself is still 5.2 based | List `C:\Program Files\Blender Foundation` first; compare outputs with the 5.3 binary |
| 2026-11-11 | `render_viewport` with `engine: "cycles"` ignored | The fast capture draws the viewport; an engine applies only with `quality: "final"` | Use it for shape; run Cycles in headless Blender for a lit look |
| 2026-11-05 | A background "command runner" thread in Mixar was refused | Using Mixar as a general shell is not allowed from a helper session | Run only the project's own build scripts in Mixar; git, npm and the deploy go through the user's own terminal or `deploy/finish-2026-11-05.ps1` |

## Learned here
- 2026-11-09 (modular building packs, 232 pieces in 20 collections under `SW5e_Modular_Packs`, plus `VIG_*` demo buildings): the sandbox keeps `bpy.app.driver_namespace` between calls, so a builder library defined once (`NS['SWL']`: `new`, `box`, `lathe`, `slab` with holes via `mathutils.geometry.tessellate_polygon`, `wall`, `done`, `layout`, `start`) is reused by every later call; functions defined in a call keep working after it ends. The sandbox has no classes, no `globals()`, and refuses `bm.to_mesh` on a bmesh held in a dict: read verts and faces out of the bmesh, then `mesh.from_pydata`, add `_REGION` with `mesh.attributes.new('_REGION','FLOAT','POINT')`. Instance the pieces (`bpy.data.objects.new(name, src.data)`) to assemble vignettes. A bounding-box overlap test must use `matrix_basis` right after setting `location` (`matrix_world` is stale until the depsgraph updates). Contact sheets: `numpy` into `bpy.data.images.new`, `.save()` to a scratch path, then Read it. Moodboard images come from `curl` into a scratch folder, `bpy.data.images.load`, `pack()`; official concept art and Commons photos work, ArtStation answers 403 and Wookieepedia is excluded.
- 2026-11-09 (the starship kit): a moodboard can be built by `execute_bpy_script` without the UI. It is `scene.mixie_moodboard_images` (items: `image` a packed `bpy.data.images` image, `position_x/y` the card's bottom-left corner with y up, `scale` of a 700-px-wide base, `frame_id`, `moodboard_item_id`), `scene.mixie_moodboard_frames` (`frame_id`, `name`, `position_x/y` bottom-left, `width`, `height`, `palette_index`) and `scene.mixie_moodboard_textboxes` (`text`, `position_x/y`, `width`, `height`, `font_size`, `frame_id`). `list_moodboard_images` and `inspect_moodboard_image` read what a script added. Work in a tab of your own (`mixar_scene_new`); the tab is not saved to disk until the user saves. A region-coloured preview: Attribute `_REGION` / 5 into a constant ColorRamp, times Attribute `_AO`.
- 2026-11-05: the live GUI loop works for design review: build pieces with a Blender script, `import_scene.gltf` into a `claude_*` collection, lay out and check overlaps, `render_viewport` with `focus_objects`. Region-coloured preview: a material with an Attribute node on `_REGION` into a constant ColorRamp. The architecture kit and the heads were reviewed this way.
- 2026-11-05: Nothing in Mixar's non-AI side beats Blender 5.2 for our scripted pipeline yet, except speed (about 2x on the weapon kit). Of 2620 operators, ~130 are Mixar interface plumbing (agent chat bubble, moodboards, director camera), not modelling tools. The value is in the GUI (Layers editor, Mixie, auto-UV, generation), which needs the user's session and, for AI, their account and credits.
