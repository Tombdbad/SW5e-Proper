---
name: sw5e-architecture
description: Making SW5e's local-map buildings look like Star Wars instead of rounded boxes - round hub-and-spoke plans, drum walls, gantries and skybridges at several levels, kit pieces built in Blender and reviewed in Mixar. Use for any work on building exteriors, room plans, walkways, catwalks, districts or the architecture kit.
---

# SW5e architecture: from boxes to wheels and gantries

Read `REVIVAL_NOTES.md` ("Architecture kit: seven families of building", "Caves, ceilings, vaults, round buildings, water worlds") and `HANDOFF.md` first; use the `mixar` skill for anything in Mixar. This file is the plan and the method for the exterior work the user asked for on 2026-11-05: "much of Star Wars architecture is circular, with side rooms/antechambers arranged around a central hub in a wheel-and-spoke pattern, with exterior walkways/catwalks/gantries joining buildings and rooms at a variety of levels". Exterior first; interiors later.

## Where things stand (audit 2026-11-05, three full worlds, seeds 1, 2, 34: 3,676 buildings, 14,357 rooms)
Re-measure after every step with the stats script below and update these numbers.

| Measure | 2026-11-05 | Target |
|---|---|---|
| Rooms that are rectangles | 95% (median 80 squares, aspect 1.29) | under 70% on round-kind buildings |
| Rooms tagged `round` that come out round | 363 of 1,494 (24%) | over 80% |
| Gas-giant buildings with a round room | 0 of 39 | most |
| Ocean buildings with a round room | 35 of 159 (meant: all) | all |
| Walkways | 385: 317 roof catwalks at level 1, 58 at level 2, 10 elevated walkways between upper floors | gantry rings on round rooms, skybridges at levels 1-3 |
| Buildings with a hub (a round room others radiate from) | 0 | every cantina, medcenter, palace, transit hub; every building on ocean, gas giant, station |

Why it looks the same:
- **Plan** (`shared/logic/index.ts` `planBuilding`): breadth-first from the entrance, each room against a free wall of the room it opens off. It makes chains and blobs of rectangles; nothing knows about a centre.
- **Round rooms lost**: the shaping loop ("Some rooms of the round kinds of building are round or oval") makes a room round only if nothing but corridors stands in the one-square ring round it, and tries one curve. Stair blocks, stacked rooms and corner neighbours veto it. Worst: cantina 191 lost, rooming house 108, tech shop 102, market 91, cookshop 74.
- **Massing** (`models.tsx` `RoomBlock`): a room is its footprint pushed straight up, a slab roof, a parapet, a band. Crowns sit on top (`interiors/architecture.ts` `crownOf`); reliefs are built but never placed; portals are skipped on a curved wall (`Doorway` `!bend`), so round buildings have no door frames.
- **Family by biome only** (`familyOf`): every building on a world is one family; building type matters only through the palace rule.
- **Walkways** (`planDistrict` "Catwalks between roofs"): straight, axis-aligned, same height only, `CATWALK_SPAN` 12, roof to roof. `linkLevels` "Elevated walkway" is rare. No gantry rings above the sea-level `Decks` of ocean worlds, no ramps between levels.
- **Districts**: rows packed in a grid (`ALLEY` 3, `AVENUE` 6). No plaza.
- **Settlement view** (`buildBuilding`, `buildSettlement` in models.tsx): untouched.

## What is in the game (2026-11-05, evening)
- `architecture.glb` has every piece (47; tris in `shared/art/architectureKit.json`): crowns, portals, reliefs, round bays (drum and adobe, plain, window, door), curved portals, gantry arcs (plain, gate, end), metal and stone ramps, bridges, pylon, tube, tiers, the forest set (great broadleaf and conifer, platforms, rope bridge, trunk stair, rustic hut).
- Round rooms that are a circle of radius 3.75 to 6 are built of bays (`models.tsx` `KitRoomBlock`, `drumPlan`, from `storeyPlan`): door bays cut through at each way in, curved frames, window bays where the plan has windows, a storey of bays per storey. Others keep `RoomBlock`.
- Forest, jungle and swamp settlements have two tree villages in the backdrop belt (`siteAssets.tsx` `TreeVillages`, layout `treeVillageSpots`/`villagePieces` in `interiors/architecture.ts`).
- Not yet in the game: gantries, ramps (metal and stone), bridges, tubes, pylons, tiers (they need step 4, the planner's gantry form); openings cut through the walls of square rooms (`RoomBlock` is one extrusion: a door's void covers its wall); steps 1 and 2.
- Export from the open Mixar session without touching the user's scene: paste `import builtins; builtins.ARCH_EXPORT=True;` before the usual exec line (writes `client/public/figures/architecture.glb` and the kit json).

## The order of work
Each step: code, `npx tsc --noEmit` clean, tests, the stats script, a look in the gallery (`/dev/models?section=architecture`) and in a real campaign, then REVIVAL_NOTES.md and HANDOFF.md.
1. **Stop losing round rooms.** In the shaping loop: let a stair block or a stacked room stand against the corridor, not the curve; try both curves (as the arena floor does); plan round rooms before their neighbours; on gas giants count as ocean. Test: the round count in the table, `tests/world/layouts.test.ts` still clean.
2. **Ring shape and the radial plan.** `footprint.ts`: shape `"ring"` (an annulus: `radiiOf` plus an inner radius; `insideFloor` false inside it; `standing` and `waysStand` follow). `planBuilding`: a radial plan for the hub kinds: the hub (main bar, concourse, audience chamber, lobby) placed first and round, a ring corridor round it, spokes (corridors) on the four sides (the grid is square: keep spokes n/e/s/w), pods (round or oval rooms) at their ends; smaller rooms off the ring on the diagonals. Same `Area`/`paths` model; everything else (stairs, columns, doors) must still pass `auditBuildings`.
3. **Kit pieces for round massing** (`tools/blender/build-architecture.py`, reviewed in Mixar): drum wall bands and ribs for a round room, a battered drum (Tatooine), stepped tiers, a portal bent to a curve, gantry arcs, bridge spans and ramps, pylons, a tube walkway for hostile air. Then place the reliefs that exist.
4. **Walkways at several levels.** Form `"gantry"` (open air like `balcony`: `openAir`, sight and fights already follow): a ring two squares wide round a round room at each upper storey. Skybridges between upper floors of neighbours at any level 1-3, with a ramp or a flight on the bridge when the levels differ. On ocean and gas-giant worlds they are the main ground.
5. **Type by family**: e.g. desert cantina = sunken domed hub; desert hangar = round open pit (Docking Bay 94); temperate = colonnades and arcades (Theed); deco = setback towers joined by skybridges.
6. **Radial districts**: some districts planned round a plaza with the avenues as spokes (Mos Eisley, Cloud City).

## Units and conventions (match the code; do not invent new ones)
- 1 unit = 1 square = 5 ft. A storey is 3.4 (`LEVEL_H` in LocalMap; walls seen from inside 3.0, `FULL_WALL_HEIGHT`). Door 1.0 x 1.42 (`DOOR_W`, `DOOR_H`). Gantry and catwalk width 2 (`GANTRY`).
- Kit axes: the code's y up, +z the front; Blender gets them through `shape.P(x,y,z) = (x,-z,y)`. A crown's origin is the middle of its base; a portal's the middle of its sill on the wall's outer face; a gantry arc's the centre of its circle at deck level; a span's the middle of its near end at deck level.
- Every vertex has `_REGION` (0 body takes the wall colour, 1 trim, 2 glow, 3 dark glass and slits, 4 timber, 5 leaf and needles, 6 thatch) and `_AO`. No materials, no UVs in the file: finishes are applied at run time (`archColour`, `ARCH_FINISH`).
- Pieces that depend on a radius are built for the radii the planner makes (`_r3`, `_r4`, `_r5`): scaling a curve also scales the deck width, which must stay 2.
- Budget: a crown under 1,200 triangles, a portal under 450, a gantry arc under 300, a span under 250. Low-detail copies when the far distance drawing needs them.
- Original shapes, CC0. No AI-generated meshes in the game without the user's word and a CREDITS.md line.

## Iterating in Mixar (the user's open GUI session)
- Headless build, as before: `blender --background --python tools/blender/build-architecture.py -- <ABS out dir>` (or Mixar's exe), copy `architecture.glb` to `client/public/figures/`.
- **Live review**: run the same script inside the open Mixar session and it builds the pieces into a `claude_arch` collection, laid out apart from everything else, coloured by region, with a hub-and-gantry vignette, and prints `overlaps []`. It never resets the scene and never exports. From Mixar's Python console (Scripting workspace):
  `p=r"C:\Users\Admin\Desktop\SW5E\SW5e-Proper\tools\blender\build-architecture.py"; exec(compile(open(p).read(),p,"exec"),{"__file__":p,"__name__":"__main__"})`
  Optional before it: `import builtins; builtins.ARCH_ONLY="gantry_arc_r4,drum_ribs_r4"` to build only some.
- Or through the MCP connector (`node tools/mixar-mcp.mjs`, needs "Connect MCP" on): its sandbox blocks `exec`/`os`, so use the console route for this script.
- Look: frame `claude_arch` (numpad . on the selection), a three-quarter view, solid shading with attribute colour, or `render_viewport {view:"hero", focus_objects:[...]}`. Judge silhouette first, then rhythm (ribs, posts), then the joints (does the arc meet the wall, the span meet the arc).
- Keep the `mixar` skill's failure-modes table current.

## Stats script (re-measure; run from the repo root with `tsx`)
Put it in `tests/_stats.ts`, run `tsx tests/_stats.ts`, delete it (it is not a test). It generates seeds 1, 2, 34 with `detail: "all"` and counts per biome: `layout.shape` (rect/round/oval/ring), `layout.form` (corridor, walkway, gantry, balcony, roof ...), rooms tagged `round` against rooms shaped, walkway names by level, buildings with a hub. About two minutes.

## Rules from CLAUDE.md that bite here
- Extend existing files; a new file only when strictly necessary.
- Rules content stays in `shared/data/sw5e/*.json`. No 2D maps or flat plans. New site props go in `siteAssets.tsx`, not drawn one by one in `LocalMap.tsx`.
- A building planned before a change keeps its plan until replanned: say so, and give a way to replan (as `migrateSites` does).
- Don't push, rebuild 5000 or merge without the user's go-ahead.
