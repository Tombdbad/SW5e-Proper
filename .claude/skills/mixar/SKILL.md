---
name: mixar
description: Using Mixar (the Blender 5.x fork with an AI agent, layered texture painting and AI 3D generation) to build and improve the game's 3D models (heads, hair, weapons, armour, droids, garments) headless, and keeping a log of what goes wrong with it. Use when the user asks to use Mixar, to iterate on models with it, or when a Blender script for the game needs running, checking or fixing in Mixar.
---

# Mixar for SW5E models

Mixar (Mixar-AI/mixar-app, Adeveda Enterprises) is a fork of Blender (the wiki says 5.2, the README says 5.0; **check `--version`**). Sculpting, modelling, UVs, baking, Python and rendering are Blender's. It adds the Mixie chat agent, layer-based painting (a Layers editor), AI 3D generation (text/image to 3D, retopology, auto-UV), moodboards and asset search. Client GPL-3.0-or-later; the AI backend is closed and hosted.

**Sources (2026-11-05):** [repo](https://github.com/Mixar-AI/mixar-app), [wiki](https://github.com/Mixar-AI/mixar-app/wiki), [Hermes plugin page](https://hermes-agent.nousresearch.com/docs/plugins/mixar). No tutorials exist yet; everything under "Learned here" is first-hand.

## Where it is
- Downloaded from the official release v4.4.0 (published 2026-11-04) to `C:\Users\Admin\Downloads\mixar-4.4.0\`, extracted (not installed) with `msiexec /a`. Update the path below once verified.
- Exe: `C:\Users\Admin\Downloads\mixar-4.4.0\extracted\...\mixar.exe` (**fill in after extraction**).
- Blender 5.2 stays at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. It is the reference: if a script behaves differently in Mixar, compare against it.

## Rules for this project
1. **Account**: AI features need a Mixar account and spend credits. Claude does not sign in, enter keys or spend credits. Non-AI tools only, unless the user does it themself and says so.
2. **Headless first**: `mixar.exe --background --factory-startup --python-exit-code 1 --python <script> -- <args>`. Use ABSOLUTE paths in args, as with Blender (see CLAUDE.md / REVIVAL_NOTES.md). Set `MIXAR_USER_RESOURCES` to a scratch folder so it does not touch the user's profile.
3. **The pipeline stays ours**: rules for output files (`figures/*.glb`, `shared/art/*.json`, atlas cells, `P(x,y,z)=(x,-z,y)`) come from `tools/blender/*.py`. Mixar is for building, checking and improving, not for changing the file formats the game reads.
4. **AI-generated meshes are not used** in the game unless the user says so and the licence is recorded in `CREDITS.md`.
5. **MCP connector** (`mixar-mcp`, runs scripts with the user's privileges, sends scene context to third parties): not used without the user's go-ahead.
6. Compare every result against the Blender 5.2 output of the same script before committing it (vertex counts, bounds, file size, a rendered preview).

## Useful commands
- Version: `mixar.exe --background --version`
- Smoke test from the repo (no account): `mixar --background --factory-startup --python-exit-code 1 --python tests/qa/linux_build_smoke.py` (source repo only; not in the MSI).
- Our scripts, e.g. weapons: `mixar.exe --background --python tools/blender/build-weapons.py -- <abs out>`; heads take ~10 min (run in the background, `--only`/`--fast` for quick looks).

## Tips (from the docs, not yet confirmed here)
- Work in small steps and render to check; do not trust a script's success message alone.
- Layered painting (Layers editor) suits close-up texture/normal maps for guns and armour; bake to images and export them to `textures/`.
- Auto-UV and seam inspection are good for checking UV overlap and stretch in our box-UV merged meshes.
- `NVIDIA + Wayland` `EGL_BAD_ALLOC` is Linux-only; irrelevant here.

## Failure modes and mitigations
**Add a row every time something goes wrong with Mixar, in the same turn you meet it** (symptom, cause if known, what fixed it, date). Mark guesses as "unconfirmed".

| Date | Symptom | Cause | Mitigation |
|---|---|---|---|
| 2026-11-05 | `Invoke-WebRequest` of the 326 MB MSI left a 0-byte file for 10+ minutes, with a file lock | PowerShell 5.1's progress handling / stalled stream (unconfirmed) | Download with `curl.exe -L -o` instead; stop the stuck powershell first |
| 2026-11-05 | WebFetch of the releases page lists no asset names | Assets load lazily | `Invoke-RestMethod https://api.github.com/repos/Mixar-AI/mixar-app/releases/latest` lists them |

## Learned here
(Notes on what Mixar does better or worse than Blender 5.2 for our models: add as found.)
