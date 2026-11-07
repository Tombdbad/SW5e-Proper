# SW5e Game: AI Briefing and Reference (single-file guide)

Audited 2026-11-07 from the repo at `main` (a658f7b), the 3 older docs (`HANDOFF.md`, `ITEM_TODO.md`, `REVIVAL_NOTES.md`, 585 KB / ~1,200 long lines), `CLAUDE.md`, three project skills, and the code.
**Purpose:** hand this one file to any AI (web chat or coding agent) so it can discuss and plan modules of the SW5e game without the repo. Section 14 lists where this file corrects the older docs. Facts marked *(unverified)* were not exercised in this audit.

---

## 1. What this is, in 10 lines
- A **Star Wars 5e (SW5e) RPG simulator**: character creation, a procedurally generated galaxy → region → system → planet → settlement → building → room world, played on **one continuous 3D map** (no 2D maps, ever: user rule), with two modes chosen per campaign: **tabletop** (dice, turn-based fights) and **real-time shooter** (KOTOR/Battlefront-style, no dice).
- Stack: Express server (127.0.0.1:5000), Vite + React client, **three.js via React Three Fiber builds scenes; Babylon.js 9 actually draws them** (a bridge, `components/Map/babylon.ts`), Postgres via drizzle, TypeScript ESM everywhere, ~119k lines in server/shared/client/tests.
- Runs on the user's **Windows 11 PC** (moved from an Oracle VM on 2026-10-23), reached from phones/friends over **Tailscale Serve (HTTPS)**; no login, loopback-only by default. Goal: playable from a phone browser; up to 4-player LAN/tailnet co-op.
- Rules content (species, classes, powers, 507 items, 1,918 enhanced items, 271 monsters, starships…) comes **only** from the sw5e.com API, imported to `shared/data/sw5e/*.json` (9.5 MB, 36 datasets, data version 199). Never hand-edit; never duplicate rules elsewhere.
- Local AI: **Gemma 4 E2B (via Ollama; NOT gemma3)** writes NPC/party dialogue and transcribes the player's microphone; **Piper TTS** speaks it; SeptaBee (a GUI DAW) is for music/SFX; **Mixar** (Blender 5.2 fork + AI agent, MCP-connected) is the 3D modelling workbench.
- The user is the sole designer; they give long numbered feedback lists with screenshots. The owner of the GitHub repo: `Tombdbad/SW5e-Proper`.

## 2. Repo map (where to look)
| Area | Path | Notes |
|---|---|---|
| World, travel, quests, ships, house rules (pure functions) | `shared/logic/index.ts` (15.7k lines) + `gear.ts`, `shooter.ts`, `nemesis.ts`, `relations.ts`, `comms.ts`, `coop.ts`, `contracts.ts`, `bases.ts`, `dogfight*.ts`, `roadtrip.ts`, `shipyard.ts`, `footprint.ts`, `caves.ts`, `tunnel.ts`, card games `sabacc/pazaak/dejarik.ts` | No I/O. Rules-data-dependent work runs on the server. |
| Rules data | `shared/data/sw5e/*.json`, loader `shared/data/index.ts`, importer `shared/scripts/import-sw5e.ts` | Generated. `travel/lookups/tools/transport/downtime/ships.json` are derived from book text. |
| Server | `server/index.ts, routes.ts, sw5eRoutes.ts` (world gen/expand/populate/validate), `dialogue.ts` (Ollama), `speech.ts` (Piper/OneCore), `coop.ts` (WebSocket `/ws/coop`), `db.ts`, `showcase.ts` | Dev server has no hot reload of server code. |
| Client pages | `client/src/pages/GameBoard.tsx` (11.4k lines: all of Play), `CharacterCreation`, `CharacterManagement`, `CampaignView`, `Home`, `CoopJoin`, `ModelGallery` (`/dev/models`), `DogfightLab` | |
| 3D | `components/Map/LocalMap.tsx` (6.6k), `models.tsx` (6.4k: all procedural models), `siteAssets.tsx` (site/prop library), `babylon.ts`, `FlightScene`, `dogfight/*`, `PitArena` | Taps pick, double-taps open. |
| Figures/animation | `components/Map/interiors/limbs.ts` (joint rig + poses), `saberplay.ts` (saber combos), `body.ts`, `shoot.ts`, `Shooter.tsx`, `architecture.ts`, `stock.ts`, `ItemModel.tsx` | See §9. |
| Character math | `client/src/lib/sw5e/characterCalculation.ts`, `rules.ts` | Feature effects are **parsed from rules text**, never hard-coded by name. |
| Voice | `client/src/lib/voice.ts`, `components/Play/TalkPanel.tsx` | §8. |
| Assets | `client/public/figures/*.glb` (body, head, hair, species, creature, weapons, architecture + `.lo` variants), `textures/`, `audio/voice/` | Built by `tools/blender/*.py`. |
| Tools | `tools/` (item-audit, model-coverage, soundlab, kitbash, texture builders, `mixar-mcp.mjs`) | |
| Tests | `tests/{combat,dice,games,interiors,items,server,ships,world}`, `e2e/*.mjs` (Playwright) | `npm test` ≈ 697 tests (2026-11-06). |
| Deploy | `deploy/windows-start.ps1 -Mode prod|test [-Lan]`, `finish-*.ps1`, old Linux units (`sw5e.service`, backup timer) | Linux files are historical. |
| Skills (agent playbooks) | `.claude/skills/{mixar,septabee,sw5e-architecture}/SKILL.md` | Worth pasting alongside this file for those topics. |

## 3. Hard rules (from `CLAUDE.md`; any proposal must respect them)
1. **No 2D maps/HUD plans.** Everything is on the 3D map; use tap/double-tap. Local maps of settlement buildings are *sites* built from the asset library (`siteAssets.tsx`); new props go in the library, not drawn one-by-one in `LocalMap.tsx`.
2. **Rules content only from `shared/data/sw5e`.** Feature effects parsed from text in `characterCalculation.ts` (and `statProfile` for stat blocks). Where the books are silent, make a **labelled house rule**, show it on screen, and list it in REVIVAL_NOTES "Play rules".
3. Extend existing files; add new files only when strictly necessary (user, 2026-10-13).
4. **Zero warnings and zero type errors**: `npx tsc --noEmit` clean (tests included), `vite build` prints nothing (user: "even silent ones").
5. No secrets in git (`.env`, PAT). Commit as `Tombdbad`; never force-push. The user's own `client/src/components/ui/Alert.tsx` edit must never be committed.
6. Ask first: exposing ports/internet, API-based game master (Phase 5), changing storage, removing large code, `HOST=0.0.0.0`.
7. No AI-generated meshes in the game without the user's word and a `CREDITS.md` line. Original/CC0 assets only.
8. Don't build while `npm run e2e` runs; new DB column ⇒ migrate service DB **and** `sw5e_test` before restart.
9. Verify in a real browser, not curl (module/API checks passed while UI was broken three times).

## 4. State of the game (what exists)
All of the following is implemented and tested unless listed in §11.
- **Creation/sheet**: real SW5e rules (species, classes, archetypes, backgrounds, feats, powers, point buy/array, starting wealth), personality tables, appearance, saves to DB. Level-up, rests/Hit Dice, death saves, powers, maneuvers, fighting styles, conditions.
- **World**: deterministic by seed; buildings with floors, **stairwell columns** (single stack with landings), districts, catwalks/bridges; **round rooms built from kit "bays"**, round towers, tree/stilt villages (Kashyyyk/Endor) that are real settlements, tube walkways, caves, vaults, water worlds, hangars with sliding roofs; arena district with betting; palaces (60% of cities). Saved worlds are migrated by numbered **LIFE** versions (`livenWorld`; currently ~22).
- **People**: individuals with homes/jobs/routines, patrols, errands, gender-aware names, **families** (shared species/surname, reputation spreads by kin tie), per-person **regard** (-100..100) that unlocks their sheet, **Nemesis** system (borrowed from a Shadow-of-Mordor style mod), contracts/mission-givers, comlinks, NPC↔NPC conversations.
- **Law/economy**: eras, clock/day-night, trade with vendor kinds, rarity and limited stock, contraband by law level, security dispatch from garrisons, cells, alarmed shops by night, theft discovery.
- **Gear**: every one of 507 items + 1,918 enhanced rows has a model; 217 weapons/26 armours played in fights; kits/tools/games/substances/modifications (common-mods variant, 4 slots/chassis), cybernetics, droid customisations, companions (hired/freed/tamed), ground transport, sea crossings, downtime activities (`ITEM_TODO.md` regenerates the audit).
- **Movement/fights**: real-time walking, jump, jetpack, grapple hook, climbing (ladders animated); tabletop grid combat with conditions/cover-ish rules, `PlayCombat`; **shooter mode** (pointer-lock aim, bolts, spread/recoil per gun, grenades, saber arcs/guard, AI foes with wind-ups); starship combat (turn-based) and a real-time **dogfight** (space + in-atmosphere), speeder trips with ambushes/chases/roadblocks, race and convoy minigames.
- **Co-op** (≤4): WebSocket session per campaign, shared campaign via JSON patches, each member has their own location, party-level travel "room" (crew/roles), figures of peers on the map.
- **Rendering**: Babylon via bridge: cascaded shadows, reflection probe, bloom, SSAO (desktop), clustered street lamps, PBR from three materials, parallax, fur shells, hull wear, tiers lite/full. Hardware target is modest (Intel HD 530, 1 GB shared; ~30 fps gallery).

## 5. Running, building, testing
```
npm run dev            # tsx server/index.ts, Vite middleware, :5000 (needs .env DATABASE_URL)
npm test               # node --test tests/*/*.test.ts  (~697)
npx tsc --noEmit       # must print nothing
npm run build          # vite build + esbuild server → dist/
npm run e2e            # Playwright play-through vs the production build (25+ min; don't build during)
npm run import:sw5e    # refresh rules JSON (DERIVE_ONLY=1 rebuilds the derived files offline)
npm run audit:items    # regenerates ITEM_TODO.md numbers
npm run coverage:models
deploy\windows-start.ps1 -Mode prod   # prod :5000 (db sw5e) | -Mode test :5002 (db sw5e_test, VITE_TEST_MENU=1) [-Lan]
```
Dev preview for the browser pane: `.claude/launch.json` "dev-5001". Test world: seed 23 has a round Kashyyyk tower. Debug hooks: `window.__map3d.at("sq:X,Y")`, `.world(key)`, `.look(from,to)`, `__street()`, `__gallery`, `__arena`. Gallery: `/dev/models?section=…`. No Python on the PC (use node/sed). Production restart needs an **Administrator** shell (the node process runs elevated).

## 6. Data model in one paragraph
Postgres tables: characters (abilityScores, powers, `armor` equipment slots, `appearance`, companion data), campaigns (`galaxyMap` = whole generated `World` JSON, `specialRules.mode`, `sessionLogs`, `factionInfluence` with Standing/regard, `play_state`), debriefs. `World { areas, paths, startId, antagonist, families, errands, discoveries, life… }`; `Area` has kind, parent, `layout` (level, form, footprint, round/ring, switchback…), `gateway`, `occupants`, `ships`, `loot`; `Path` = hyperlane/sublight/route/street/door/stairs. `validateWorld` + `auditBuildings`/`walkBuilding` check soundness (every room reachable via walkable squares).

## 7. Game master / AI roles
- **Manual GM loop** (still present): GM tab builds a report (`lib/llm/reportHandler.ts`), the user pastes to an external AI, pastes the reply back; `---SYSTEM_DATA_FOLLOWS---` splits story from state changes. House rule: story can't take the last HP. **Do not build an API GM without asking.**
- **Local dialogue** (`server/dialogue.ts`, `POST /api/dialogue` NDJSON stream, `/api/dialogue/status`): Ollama `OLLAMA_URL` (127.0.0.1:11434), model `OLLAMA_MODEL` default **`gemma4:e2b`**.
  - Every request is `[SYSTEM, one CARD]`, never a transcript. Card = scene, speaker (name/species/role/disposition/gender), player, the speaker's own last reply (≤300 chars). SYSTEM constant + fixed `num_ctx` 2048 + a "prime" call make Ollama's prefix cache hit (1.3 s vs 6 s prompt eval). ~10 tok/s out, replies 70-95 words in 11-13 s, streaming from ~1 s; `think:false`.
  - Output rules: speech only, sound cues from a fixed list in brackets (`chuckle laugh sigh breath groan cough wheeze hmm gasp growl beep whistle static`), ≤90 words, ≤3 paragraphs; `speechOnly()` strips narration/markdown.
  - **House rule: dialogue is colour; it changes no game state.** The model doesn't know quests, prices, inventory (a card line for them is the next step).
  - NPC↔NPC street chat and the arena crowds also use it; hostile fight foes don't talk; no memory beyond one reply; known bug: occasionally narrates the player in third person.
- **Speech-to-text**: `POST /api/stt` sends a 16 kHz WAV to the same Gemma (it accepts audio *in*; it cannot produce audio). Needs https/localhost for the mic (Tailscale Serve works; plain LAN http doesn't).

## 8. Voice pipeline (Piper TTS)
- `server/speech.ts`: `GET /api/speech/status`, `POST /api/speech` → WAV cached in `.cache/speech`. **Piper** (release 2023.11.14-2, in `../rhasspy-piper-38917ff/release`, voice `en_US-libritts_r-medium`, **904 speakers**, 22.05 kHz) found automatically (`PIPER_EXE`/`PIPER_MODEL`/`PIPER_DIR`). One process per pace, kept warm (first line ~2.6 s, then ~0.5 s). Fallback: Windows OneCore (George/Hazel/Susan, British) via a resident PowerShell; last fallback: browser speech.
- `client/src/lib/voice.ts` `voiceOf(speaker)`: deterministic from id/name → speaker number, species, role, gender; pitch via playback rate, EQ, gravel; droids bleep (subtitles translate), Wookiees growl, Jawas/Ewoks gibberish, helmets/masks filtered, moods (`toneOf`). Non-verbal **cues** synthesised in code until a SeptaBee-made bank is listed in `client/public/audio/voice/manifest.json` (empty).
- `tools/soundlab.mjs`: renders cue presets from JSON, inspects WAVs (waveform/spectrogram PNG so an AI can "see" audio), imports SeptaBee exports. SeptaBee is GUI-only (no CLI); the user builds sounds, the AI wires files. See skill `septabee`.
- Gaps: gender for people met only by seed; accents; comms-call UI; party member's own spoken voice; nothing has been *heard* by an AI (only checked for errors).

## 9. 3D art pipeline, Mixar, and animation

### 9.1 How the art is made
Mostly **procedural**: `models.tsx` builds people/droids/beasts/ships/buildings in code; Blender scripts in `tools/blender/` (`build-body/head/hair/species/creature/weapons/architecture/gear.py`, `shape.py` with the `P(x,y,z)=(x,-z,y)` axis map) bake `.glb` kits with **vertex-colour `_REGION`/`_AO` attributes, no materials/UVs in file**; finishes are applied at run time. Textures from noise/Poly Haven CC0 scans (`tools/build-*.mjs`). Budgets: person ≈5k tris (8k near / 3k mid / 1k far), crown <1200, portal <450.

### 9.2 Animation system today (important for planning)
- **There is no skeletal animation.** Figures are rigid parts rotated in the **vertex shader** by 13-32 quaternion uniforms (`limbs.ts`: `LIMB`, `PARENT`, `uQ`, `uP` pivots; chain depth 5; mirrored in the Babylon bridge via `LimbPlugin`).
- `humanPose(stride, Motion, persona)` computes poses procedurally: walk/run/crouch/prone/jump, holds (pistol/rifle/saber/staff), recoil, flinch, parry, breathing, weight shift, per-person "persona" (tempo/sway/swing/slump/fidget derived from the name hash). `Mover` gaits: walk, quad, hexa, wings, roll, tripod (droideka), glide.
- `saberplay.ts`: **moves are keyframed poses with easing, hit-stop, kinds (light/heavy/leap/low/spin/guard)**, six saber kits (single/broad/crossguard/staff/dual/whip), per-form flavour/tempo, combo chaining (`COMBO_GAP` 1.5 s).
- Not done: weapon animation channels (swing/draw/ignite/recoil of the weapon *model*), facial/eye animation (blinks), cloth, foot planting, enemy saber swings, cheering/seated/instrument-playing poses, death animations (bodies fall over), thrown-projectile flight, animated barriers/teleport portals.

### 9.3 Mixar MCP audit (tools connected to this session)
Mixar = Blender 5.2 fork with the Mixie agent, layered texture painting, AI 3D generation, moodboards. **Only generation (and `create_layered_material`) cost credits; everything else is free** (get a quote with `mixar_tool_quote`; the account had 0 credits on 2026-11-05; the user decides any spend). During this audit the connector replied *"Mixar is starting or unavailable"* (desktop not open/signed in), so the list below comes from the tool schemas and the project's earlier tests, not a live run.

| Group | Tools | Use for SW5e |
|---|---|---|
| Orientation | `mixar_status`, `mixar_credit_balance`, `mixar_guide(topic)`, `mixar_tool_catalog`, `search_documentation` | Start every session; guide topics: build, generate, characters, environments, materials, delivery, limits, recovery |
| Scenes/projects | `mixar_scene_new/switch/close`, `mixar_scenes`, `mixar_projects`, `mixar_project_open` | One tab per task; never `bpy.data.scenes.new` |
| Inspect | `scene_overview`, `scene_hierarchy`, `get_object_details`, `roots/children/descendants/ancestors`, `list_scene_meshes`, `describe_object`, `inspect_assembly` | Check imports; kit part names |
| Build | **`execute_bpy_script`** (sandbox: no os/sys/pathlib/subprocess/exec/eval, numpy+bmesh+mathutils OK, <32 KB, whole-object deletes need a name guard, `steps[]` for batches), `render_viewport` (fast/final; `focus_objects`, hero/top/front views) | Run/import our `tools/blender` output, render to review |
| Verify | `inspect_geometry` (rests_on/contact/surface/clearance), `inspect_spatial_constraints`, `inspect_mesh_seams`, `inspect_uv_map`, `measure_groups`, `move_groups` | Fit checks for doors/portals/stairs; UV overlap |
| Materials | `create_layered_material` ($), `get_paint_channels`, `get_paint_layer_stack`, `set_paint_layer_parameters`, `set_layer_channel_override`, `toggle_layer_visibility`, `remove_paint_layer` | Layered painting is GUI-only headless; useful for hand-painted face/armour atlases |
| Generation ($) | `enqueue_generation`, `poll_generation`, `get_generation_params`, `get_generation_concurrency`, `get_all_queue_status`, `detect_turnaround_views` | Text/image→3D, retopo, auto-UV. **Forbidden for shipped game meshes without the user's word + CREDITS line**; fine for concept/reference |
| Assets | `search_asset_library`, `list_library_assets`, `append_library_asset`, `list_terrain_assets`, `import_terrain_asset` | Check licence before using anything in game (CC0 only so far) |
| Moodboard/render | `render_scene_image`, `render_scene_video`, `*_moodboard_*`, `view_image` | Reference sheets, turntables for review |
| Delivery | `export_scene`, `export_asset` | glb/fbx out |
| Rules/history | `add/list/update/remove_rule`, `operation_history_summary`, `list_operations`, `get_operation`, `operations_for_object`, `read_agent_history` | Persist Mixie house style; audit trail |
| Animation | `find_animation_presets(object_name, query)` | **Only ranks Tripo-preset clips for a Tripo-rigged skeleton** (pair with a `tripo_retarget` generation op, credits). Our figures are not Tripo-rigged ⇒ not directly usable |
| Native UI | `mixar_ui_context/observe/act/wait/call_status` | Only when the user allows; never OS-level computer-use on Mixar |

**Verdict:** Mixar is valuable for *review and QA* (render, fit/clearance, seams, UV) and for running our Blender scripts about 2× faster than stock Blender; it adds no animation pipeline we can use as-is. Standing rules (skill `mixar`): never overlap models in the user's scene (grid layout + AABB check), `claude_*` collections, delete only your own objects, one import per call, log every failure in the skill's table, sandbox errors appear before anything runs.

### 9.4 ActionForge.app as an animation source
What it is (landing page read 2026-11-07, docs not read): **a browser/desktop animation editor, "Mixamo alternative"**: pose, adjust, and export character animation; library tabs Animations/Poses/Characters/Props (clips CC0 from Quaternius; code © CGstuff); bundled characters Mannequin/Manny/Quinn; **export GLB or FBX**, options in-place, frame range, include mesh, one file per clip (zip); skeleton export presets *Default, UE5, UE4, Reallusion, Mixamo*; "Motion Lab" reshapes a clip (curves, style, eight directions); runs locally ("nothing is uploaded"). No pricing, API, CLI or BVH import stated.

**Fit with our engine.** Our animation is shader-driven joint rotation, so an ActionForge clip cannot be dropped in; it must be *baked into our pose format*. Recommended pipeline (nothing built yet):
1. Pick/shape a clip in ActionForge (e.g. cheer, sit, kneel, throw, draw, drink, death, climb, instrument poses), export **GLB, in place, Mixamo-skeleton preset**, no mesh.
2. Offline converter (`tools/bake-clip.mjs` using three.js `GLTFLoader` + `AnimationMixer`, or a Blender headless script) samples each frame, maps Mixamo bones → our ~13 humanoid joints (`LIMB`: body/chest/head/upper+lower arms/legs/weapon hand) as local quaternions relative to the rest pose, resamples to ~15-30 keys/s, writes `shared/art/clips/<name>.json` (keys in the same shape `saberplay.ts` moves use, so easing/hit-stop/blend code is reused).
3. `humanPose` gets a `Motion.clip` channel (`name`, `startedAt`, loop); non-humanoids (beasts, droids with their own gaits) remain procedural. Root motion stripped (we move the figure ourselves).
4. Test like `tests/interiors/limbs.test.ts` + gallery section `moves`; licence CC0 recorded in `CREDITS.md`.
Alternatives: author in Blender/Mixar with `execute_bpy_script` keyframes and bake the same JSON; or Mixar's Tripo retarget (credits, mesh-gen dependency, rejected by rule 7). Risks: Mixamo-style skeleton proportions vs our stylised species (scale to limb lengths; ignore finger/face bones), 4-armed and quadruped species unsupported, shader joint limit (32 `LIMBS`).

## 10. Module planning menu (ready-to-discuss, ordered by user pull)
Each is a self-contained plan topic for an external AI. "Touch" lists the files.
1. **Clip-baking animation pipeline** (§9.4): cheers/seats/death/throw/instrument/draw. Touch `limbs.ts`, `models.tsx` Mover, new `tools/bake-clip.mjs`, `shared/art/clips`.
2. **Weapon animation channel**: swing/draw/ignite/recoil of the weapon model via a `part` attribute + shader about named pivots (`itemModels.json` `parts/sockets`). Touch `limbs.ts`, `ItemModel.tsx`, `weapons.ts`.
3. **Projectiles & visible gear effects**: thrown items flying, placed mines (hidden until noticed), barriers/portals drawn, fire spread. Touch `FightScene` in `LocalMap.tsx`, `gear.ts`.
4. **Architecture follow-ups**: gantry rings on round rooms (`gantryPlan` radius 4 only), kit ramps/bridges/pylons/tiers as real pieces, openings in square walls, radial districts/plazas, building family by type (skill `sw5e-architecture`). Known glitch: a foliage blot can touch the lowest flight in seed 23.
5. **Species heads**: Ithorian, Duros, Bith, Gran, Kel Dor, Quarren, Weequay, Cerean; blink/eye movement; cloth; foot-planting on stairs; AAA character LOD.
6. **Shooter depth**: Force powers, class features, maneuvers in real time; crouch/cover; enemy path-finding (foes can stick behind walls); bolt sounds/impacts; enemy saber swings; co-op shared fights.
7. **AI dialogue v2**: feed quests/rumours/wares into the card; short conversation memory; Gemma-driven barks in fights; fix third-person narration; **party-member voice**; comms calls (NPC calling the party; ship transceiver between worlds).
8. **Audio**: SeptaBee-authored cue bank, music, weapon/ship/UI SFX, helmet/comlink IRs; positional audio; nothing has been auditioned by an AI.
9. **Items**: `ITEM_TODO.md` gaps: 18 weapon properties unread (auto, penetrating, dire, piercing, thrown/versatile two-hand), enhanced text-only rows (40 adventuring gear, 18 weapons…), container protection, mods shown on items (`mod` sockets), inventory 3D viewer, rarity tint, ship parts in loot, Strength/Cumbersome on overland pace.
10. **World/economy**: regard from contracts/theft/gifts; family-tree view; existing campaigns lack genders/families; chandler shop type; witness interception; palace summons known to dialogue.
11. **Co-op completion**: trip minigame shared (gunner/passenger actually aim), crew roles in starship fights, two players in one fight.
12. **Phone/PWA (Phase 4)**: manifest/icons, bundle size, shelf-stock lazy loading (50 files ≈30 s in software rendering), touch HUD polish.
13. **Ops**: restart prod elevated; encrypted backups on Windows (old nightly pg_dump timer was Linux); optional public HTTPS only if asked (Caddy + login).
14. **Housekeeping** (ask first): ~85 of 205 client files unreachable, duplicate legacy stores/schemas (`unifiedSchema/compatSchema`), root-level one-off scripts (`migrate.ts`, `fixSpecies*`, `.replit`…), `attached_assets/`.

## 11. Known open issues / honest "not done" list (cross-module)
- Prod is likely still the **old build** until the user restarts it as Administrator (`HANDOFF` 2026-11-06); confirm with `/api/…` build id or the app.
- Browser checks never done: drum walls at several radii, tube walkway from in/outside, mount/climb animations, beast sizes vs riders (a dewback may be under 1.8 m: raise `MAX_SPAN.large`), spiral stair on a station, water-craft helm-mount animation, phone behaviour of many recent features, e2e not re-run after the architecture work. Saved buildings keep old columns.
- Dice-heavy flows (lock picking, Sleight of Hand, door sensors) verified by tests/reading, not end-to-end in the browser.
- Rules gaps: multiclassing; archetypes granting casting to non-casters (9 of 137) give no power points; weapon proficiency from species/feats; exotic weapons; ~283 of 465 powers only "cast and described"; powers with delayed damage; creatures larger than a square; opportunity attacks; area powers; encounter budgets use 5e numbers.
- Companion limits: single best attack, no leveling/powers; no mounted combat.
- Disease isn't a hazard; carried lights don't light the map; fire doesn't spread.
- Rendering: Babylon bridge draws fat lines 1 px; software-rendering frame rates are low; cube-shadow lamps only on desktop tier.

## 12. Conventions an outside AI must follow when proposing code
- Units: 1 grid square = 1 unit = 5 ft; storey 3.4 (`LEVEL_H`), seen-from-inside wall 3.0; door 1.0×1.42; gantry/catwalk width 2. World coords = grid − (32, 36) in generated worlds. Y up, +z front in kit space.
- Pure logic goes in `shared/logic` (no I/O, deterministic with the world seed; extra dice use their own streams so old seeds regenerate identically); server for anything needing rules JSON; client for rendering.
- New world features need: a `LIFE` migration for saved worlds (`livenWorld`), an audit/`validateWorld` check, a test in `tests/world`, and an entry in "Play rules" if it is a house rule.
- Tests use `node --test` with tsx; DB tests only against `sw5e_test`.
- Commit style: small commits, descriptive subject; HANDOFF.md updated after each commit.

## 13. User working style (so an AI's plan lands)
Gives long lists with quotes and screenshots, wants explicit "done / not done" lists, checks result in the browser, dislikes warnings, placeholder looks ("WRONG!"), duplicated assets, and aesthetic-only backdrops that aren't real play space. Prefers star-wars-authentic references (will supply or ask for web research). Hardware is modest; mobile-first play over Tailscale. Decisions on file: tree villages **replace** square rooms on relevant planets; round by default; shooter has no top-down view; Postgres storage; Tailscale-only access; local-model GM only (API GM needs approval).

## 14. Where the older docs are wrong or stale (corrections)
| Doc claim | Reality |
|---|---|
| REVIVAL_NOTES header: branch `revive`, Oracle VM, systemd `sw5e`, `journalctl`, apt Tailscale | Work is on **`main`** (also branches `babylon`, `nov5-wiring`, `stairwell`, `revive` remote); hosting is the **Windows PC** (`windows-start.ps1`). VM/systemd/backup-timer text is historical. |
| "Phase 5 GM: NOT started" | A **local Gemma 4 E2B** dialogue/STT system exists; the manual copy-paste GM tab remains; only an *API* GM is gated. |
| "tsc: several hundred errors" | tsc is clean (rule 4, verified by earlier sessions; re-check before committing). |
| "Piper NOT installed" (voices §625) | Installed 2026-10-30 and is the active engine (same file, line 633). |
| three.js renders the 3D map | **Babylon** draws; three builds/raycasts (merged 2026-10-31). |
| HANDOFF 2026-11-06: stairwell branch "not merged yet" | Commit a658f7b on `main` is the stairwell work and **is on `main`** (verified: `git branch --contains` lists main and stairwell); only the user's admin restart of prod is outstanding. |
| REVIVAL_NOTES "Status" top bullets (10-13…10-19) | Superseded by later sections; "Done/Next/Findings/crosscheck" sections describe Phase 1-2 and the **original code review** (many items fixed). The "sw5e.com crosscheck" lists wrongs that the data import fixed. |
| ITEM_TODO "Rewritten 2026-10-21" | Numbers are tool-generated, but prose gaps predate the 11-02/03 shooter-gear work; run `npm run audit:items` and re-read gaps before trusting. |
| CLAUDE.md: ".replit/Replit" files, `migrate.ts` etc. | Dead legacy at repo root. |
| Mixar skill: "MCP connector not used without go-ahead; account 0 credits" | MCP is now connected in this environment (user enabled); credits still not to be spent without the user. |
| Entire REVIVAL_NOTES (585 KB) | Use as an *archive/index by heading* (`grep -n '^## '`), not a briefing. This file replaces it for orientation. |

## 15. How to use this file with an external AI
Paste this file first, then: (a) the specific `SKILL.md` for art/audio/architecture topics, (b) the named source files for a module (use the "Touch" lists), (c) ask for a plan that states: house rules introduced, `LIFE` migration need, tests, how it behaves on a phone, and what it asks of the user. For code changes ask for diffs against the paths above and remind it of §3. For anything in REVIVAL_NOTES, give the heading (e.g. "Spoken dialogue", "Co-op", "Babylon draws the 3D map") and paste just that section.
