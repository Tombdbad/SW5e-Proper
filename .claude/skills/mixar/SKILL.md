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
6. Compare every result with the Blender 5.2 output of the same script (sizes, bounds, a rendered preview) before committing it.

## Useful commands
- **Our scripts run unchanged.** `build-weapons.py -- <ABS OUT DIR>` (the arg is a directory; the file goes inside): Mixar 6 s against Blender 5.2's 14.5 s; the glb is the same size and byte-identical except 2 bytes (the exporter's version string). Heads (`build-head.py`, ~10 min) not yet compared: do it before relying on it.
- Present: glTF/FBX/BVH/UV-layout add-ons, Cycles.
- Probing: `bpy.app.version`; `import mixar; pkgutil.iter_modules(mixar.__path__)`; list `bpy.ops` to find operators.

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
| 2026-11-05 | `mixar.exe --version` says "Blender 4.4.0" | It prints Mixar's version | Ask `bpy.app.version` (5, 2, 0) |
| 2026-11-05 | `mixar.headless.headless_main` looks like a script runner | It is the cloud agent's sandbox worker; needs backend tokens | Do not use; run scripts with `--python` |
| 2026-11-05 | Passing a file path as the weapons script's `-- <out>` made a folder named like the file | The arg is an output directory | Pass a directory; the glb is written inside it |

## Learned here
- 2026-11-05: Nothing in Mixar's non-AI side beats Blender 5.2 for our scripted pipeline yet, except speed (about 2x on the weapon kit). Of 2620 operators, ~130 are Mixar interface plumbing (agent chat bubble, moodboards, director camera), not modelling tools. The value is in the GUI (Layers editor, Mixie, auto-UV, generation), which needs the user's session and, for AI, their account and credits.
