// The modular building kit on the local map (2026-11-09; the user: "textures, UV & normal maps, parallax where relevant ... import these into the game and update the
// local area map building logic to use these as relevant to the planet/biome/region"). Six exterior packs were built in Mixar (desert, classical, deco, industrial, hull,
// frontier; figures/modular_ext.glb, catalogue shared/art/modularKit.json), each piece with its own texture coordinates (flat faces mapped in squares, one repeat every
// two; domes, drums and columns round their own axis), a per-vertex occlusion and a region per vertex (as architecture.glb: 0 body, 1 trim, 2 glow, 3 dark, 4 timber,
// 5 cloth/green, 6 canvas/metal). Which pack a building takes, what stands on its roof, what shades its doors, and how each region is drawn (the texture set, the colour)
// are decided here. Pure: tests/interiors/modular.test.ts. Drawn by models.tsx `ModPiece`.
import { outline, outlineAt, type Radii } from "@shared/logic/footprint";
import { baysFor, bayFit, type Family } from "./architecture";

export type ExtPack = "desert" | "classical" | "deco" | "industrial" | "hull" | "frontier";

// The finishes a kit region is drawn in: the plain ones of models.tsx and the textured ones that take the piece's own coordinates (Poly Haven's wall sets in
// public/textures/wall, and the two made by tools/build-arch-textures.mjs: adobe_plaster, copper_patina)
export type ModFinish = "matte" | "sheen" | "glow" | "glass" | "cloth" | "plaster" | "adobe" | "sandstone" | "concrete" | "corrugated" | "rustmetal" | "planks" | "copper";
export const MOD_TEXTURED: ReadonlySet<string> = new Set(["plaster", "adobe", "sandstone", "concrete", "corrugated", "rustmetal", "planks", "copper"]);

// Which pack a building takes. Each world's own family names it (a family is by biome: interiors/architecture.ts), then the kind of building shifts it: the trades
// and stores of any rough or ordinary world are tin and planks (the frontier pack), the depots and yards are steel (the industrial). Families with a kit of their own
// (the timber villages, the polar hatches) draw none of this: null.
const FRONTIER = /^(junkyard|scrap dealer|hideout|camp|workshop|tech shop|vehicle dealer|droid dealer|rooming house|tenements|general store|market)$/;
const INDUSTRIAL = /^(warehouse|cargo bay|cargo hangar|refuelling depot|shipyard|spaceport|public hangar|private hangar|engineering|garrison|command post|operations center)$/;
const ROUGH = new Set(["desert", "barren", "swamp", "jungle", "temperate", "volcanic"]);
export function extPackOf(family: Family, biome: string, buildingType = ""): ExtPack | null {
  const type = buildingType.toLowerCase();
  if (family === "timber" || family === "polar") return null;
  if (family === "hull") return "hull";
  if (INDUSTRIAL.test(type)) return "industrial";
  // (a temperate world's markets and homes stay the classical pack's: Theed's, not a shanty town)
  if (FRONTIER.test(type) && ROUGH.has(biome) && !(biome === "temperate" && /^(market|general store|rooming house|tenements)$/.test(type))) return "frontier";
  return ({ adobe: "desert", domed: "classical", deco: "deco", bunker: "industrial" } as const)[family];
}

// What each region is drawn as, by pack: the texture set (the finish) and a colour of its own where the wall's would be wrong (copper is its own green, brass its own gold).
// Regions left out are drawn as the kit's old ones (architecture.ts ARCH_FINISH, archColour)
export interface RegionLook { finish: ModFinish; colour?: string }
export const MOD_REGIONS: Record<ExtPack, Record<number, RegionLook>> = {
  desert: { 0: { finish: "adobe" }, 1: { finish: "sandstone" }, 4: { finish: "planks" }, 6: { finish: "cloth", colour: "#c9b98a" } },
  classical: { 0: { finish: "plaster" }, 1: { finish: "sandstone" }, 4: { finish: "planks" }, 5: { finish: "copper", colour: "#e6fff4" } },
  deco: { 0: { finish: "concrete" }, 1: { finish: "sheen", colour: "#c9a64a" }, 4: { finish: "planks" } },
  industrial: { 0: { finish: "corrugated" }, 1: { finish: "rustmetal" }, 4: { finish: "planks" }, 5: { finish: "concrete" }, 6: { finish: "rustmetal" } },
  hull: { 0: { finish: "plaster", colour: "#e4e9ee" }, 1: { finish: "sheen", colour: "#8c98a6" }, 3: { finish: "glass", colour: "#6fa8c8" } },
  frontier: { 0: { finish: "corrugated" }, 1: { finish: "rustmetal" }, 4: { finish: "planks" }, 5: { finish: "cloth", colour: "#6f7d52" }, 6: { finish: "cloth", colour: "#b79d63" } },
};

// The timber villages' kit (Endor's and Kashyyyk's: the pieces of tools/blender/build-architecture.py, no pack of their own) drawn in the wood photograph (2026-11-11, the user:
// the tree villages' walls and platforms in "more realistic wood textures", the interiors to match: LocalMap's rooms of such a village take `TIMBER_SET` for their walls):
// the body, the trim and the timbers are planks; the canopy's leaf and the thatch keep their own finishes
export const TIMBER_REGIONS: Record<number, RegionLook> = { 0: { finish: "planks" }, 1: { finish: "planks" }, 4: { finish: "planks" } };

// What stands on a room's roof, by the pack and a number from the room: a piece of the pack, how much of the roof's smaller side it takes (`fit`; a piece about two squares
// across is scaled to it) or, for the things that keep their size (a vaporator, a chimney, a spire), `fixed`; and where it stands (the middle, or a corner)
export interface RoofProp { piece: string; fit?: number; fixed?: true; corner?: boolean }
const ROOFS: Record<ExtPack, (RoofProp | null)[]> = {
  desert: [{ piece: "ext_desert_dome_small", fit: 0.4 }, { piece: "ext_desert_vaporator", fixed: true, corner: true }, { piece: "ext_desert_vent_stack", fixed: true, corner: true }, { piece: "ext_desert_dome_large", fit: 0.27 }],
  classical: [{ piece: "ext_classical_dome_copper", fit: 0.36 }, { piece: "ext_classical_spire", fixed: true, corner: true }, { piece: "ext_classical_dome_copper", fit: 0.24, corner: true }, { piece: "ext_classical_spire", fixed: true, corner: true }],
  deco: [{ piece: "ext_deco_setback", fit: 0.34 }, { piece: "ext_deco_antenna", fixed: true, corner: true }, { piece: "ext_deco_spire", fixed: true, corner: true }, { piece: "ext_deco_setback", fit: 0.26, corner: true }],
  industrial: [{ piece: "ext_industrial_stack", fixed: true, corner: true }, { piece: "ext_industrial_tank", fixed: true, corner: true }, { piece: "ext_industrial_guard_tower", fit: 0.26 }, { piece: "ext_industrial_crane", fixed: true, corner: true }],
  hull: [{ piece: "ext_hull_dome_glass", fit: 0.36 }, { piece: "ext_hull_spire", fixed: true, corner: true }, { piece: "ext_hull_dome_glass", fit: 0.24, corner: true }, { piece: "ext_hull_pod", fixed: true, corner: true }],
  frontier: [{ piece: "ext_frontier_roof_shed", fit: 0.36 }, { piece: "ext_frontier_chimney", fixed: true, corner: true }, { piece: "ext_frontier_water_tank", fixed: true, corner: true }, { piece: "ext_frontier_chimney", fixed: true, corner: true }],
};
// (a room too small for one keeps the old roof clutter: it would fill the roof)
export const MOD_MIN_SIDE = 3;
export function roofPropOf(pack: ExtPack, n: number, side: number): RoofProp | null {
  if (side < MOD_MIN_SIDE) return null;
  const list = ROOFS[pack];
  const prop = list[((n % list.length) + list.length) % list.length];
  // (the guard tower and the great dome are for the bigger roofs)
  if (prop && /guard_tower|dome_large/.test(prop.piece) && side < 5) return list[1];
  return prop;
}
// How a prop is scaled on a roof whose smaller side is `side`
export const propScale = (prop: RoofProp, side: number): number => (prop.fixed ? Math.max(0.9, Math.min(1.5, side / 6)) : side * (prop.fit ?? 0.35));

// What shades a door from the street, and what runs along the roof's edge (the classical cornice): a piece of the pack, or null
export const awningOf = (pack: ExtPack): string | null => ({ desert: "ext_desert_awning", frontier: "ext_frontier_awning_canvas" } as Partial<Record<ExtPack, string>>)[pack] ?? null;
export const corniceOf = (pack: ExtPack): string | null => (pack === "classical" ? "ext_classical_cornice" : null);
// Where a prop stands on a roof (2026-11-11; the user: the dome was off its building): the spot it wants (a share of the roof across and down, or the middle), kept inside the
// roof's real footprint (the rounded rectangle `radii` make: a round drum is a circle) by at least `clear` squares, its own half width. A corner prop wants 25 or 75 per cent of each
// side, which on a rounded or round roof is out over the edge; it is drawn in towards the middle until it stands on the roof.
// Squares from the roof's north-west corner.
export function roofSpot(w: number, d: number, radii: Radii, want: [number, number], clear = 0): [number, number] {
  const depth = (x: number, z: number) => {
    // (how far inside the outline the point is: a rounded rectangle's signed distance, each corner with its own radius)
    const [hx, hz, px, pz] = [w / 2, d / 2, x - w / 2, z - d / 2];
    const r = px < 0 ? (pz < 0 ? radii[0] : radii[3]) : pz < 0 ? radii[1] : radii[2];
    const [qx, qz] = [Math.abs(px) - (hx - r), Math.abs(pz) - (hz - r)];
    return -(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r);
  };
  const room = Math.min(w, d) / 2;
  const need = Math.min(clear, room * 0.9);
  if (depth(want[0], want[1]) >= need) return want;
  // (towards the middle, in steps of a twentieth, until it stands clear)
  for (let k = 1; k <= 20; k++) {
    const t = k / 20;
    const at: [number, number] = [want[0] + (w / 2 - want[0]) * t, want[1] + (d / 2 - want[1]) * t];
    if (depth(at[0], at[1]) >= need) return at;
  }
  return [w / 2, d / 2];
}
// A piece of a run along a roof's edge is about two squares long: how many fill a side, and how far each is stretched to fill it
export function runOf(length: number, piece = 2): { count: number; stretch: number } {
  const count = Math.max(1, Math.round(length / piece));
  return { count, stretch: length / (count * piece) };
}

// The pieces of a cornice or parapet round a roof (2026-11-11; the user: roof parapets follow the radii of the building they are attached to): the roof's own wall line
// (`outline`, the straight sides and a quarter circle at each rounded corner: a round drum is four arcs) cut into runs of about two squares, each a piece stood at the middle of
// its chord, facing out, stretched to the chord. On a square corner the east and west runs stop `out` short of it, where the north and south runs' ends stand, as the
// four straight runs always did. Squares from the roof's north-west corner, x east and z south; `turn` is the yaw that takes the piece's front (+z) to the way out.
export interface EdgeRun { at: [number, number]; turn: number; stretch: number }
export function roofEdgeRuns(w: number, d: number, radii: Radii = [0, 0, 0, 0], out = 0.3): EdgeRun[] {
  const runs: EdgeRun[] = [];
  const o = outline(w, d, radii);
  for (const piece of o.pieces) {
    let [from, to] = [piece.start, piece.start + piece.length];
    // (a straight east or west side stops short of a corner that is square)
    if (piece.kind === "line" && (piece.side === "e" || piece.side === "w")) {
      const [first, last] = piece.side === "e" ? [radii[1], radii[2]] : [radii[3], radii[0]];
      if (first <= 1e-9) from += out;
      if (last <= 1e-9) to -= out;
    }
    if (to - from < 1e-6) continue;
    const { count } = runOf(to - from);
    for (let i = 0; i < count; i++) {
      const [a, b] = [outlineAt(o, from + ((to - from) * i) / count).p, outlineAt(o, from + ((to - from) * (i + 1)) / count).p];
      const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // (clockwise round the room, the way out is to the left of the way the path goes: the chord turned a quarter to -z)
      const [tx, tz] = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
      runs.push({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], turn: Math.atan2(tz, -tx), stretch: chord / 2 });
    }
  }
  return runs;
}

// ---- Wall runs -------------------------------------------------------------------------------------------------------------------
// The plain walls of a rectangular building drawn as runs of the pack's wall modules (2026-11-09; the user: "replace whole walls with module runs"): a skin of two-square panels
// laid on the outside of the block, each stretched a little to fill its stretch of wall, stopping short of the curve at a rounded corner and leaving the old wall, with the
// door frames and windows cut in it, where a way in or a window is (an opening is not the module's: the frames, leaves and panes are drawn by the doorway code for the plan's own
// outline). `side` is the wall's side of the room, `at` the middle of the panel along it (x for n and s, z for e and w), `stretch` how far its width is stretched.
export type Side = "n" | "e" | "s" | "w";
export interface Skin { piece: string; side: Side; at: number; stretch: number }
const WALLS: Record<ExtPack, string[]> = {
  desert: ["ext_desert_wall"],
  classical: ["ext_classical_wall"],
  deco: ["ext_deco_wall", "ext_deco_wall_fins", "ext_deco_wall_band"],
  industrial: ["ext_industrial_wall", "ext_industrial_wall_vent"],
  hull: ["ext_hull_wall", "ext_hull_wall_window_band"],
  frontier: ["ext_frontier_wall_corrugated", "ext_frontier_wall_plank"],
};
// how far either side of an opening's middle the old wall stays (the opening is up to a square and a half across, its frame a little more)
export const OPENING_CLEAR = 1;
export function facadePlan(pack: ExtPack, w: number, d: number, radii: [number, number, number, number], openings: { side: Side; at: number }[]): Skin[] {
  const [nw, ne, se, sw] = radii;
  const sides: { side: Side; length: number; from: number; to: number }[] = [
    { side: "n", length: w, from: nw, to: w - ne },
    { side: "e", length: d, from: ne, to: d - se },
    { side: "s", length: w, from: sw, to: w - se },
    { side: "w", length: d, from: nw, to: d - sw },
  ];
  const out: Skin[] = [];
  const kit = WALLS[pack];
  let k = 0;
  for (const { side, from, to } of sides) {
    // the free stretches: from `from` to `to`, less the zones of the openings
    const cuts = openings.filter((o) => o.side === side).map((o) => o.at).sort((a, b) => a - b);
    const free: [number, number][] = [];
    let at = from;
    for (const c of cuts) {
      if (c - OPENING_CLEAR > at) free.push([at, Math.min(c - OPENING_CLEAR, to)]);
      at = Math.max(at, c + OPENING_CLEAR);
    }
    if (to > at) free.push([at, to]);
    for (const [a, b] of free) {
      const len = b - a;
      if (len < 1.4) continue;
      const { count, stretch } = runOf(len);
      for (let i = 0; i < count; i++) out.push({ piece: kit[k++ % kit.length], side, at: a + (i + 0.5) * (len / count), stretch });
    }
  }
  return out;
}

// ---- Interior bays (2026-11-09) -------------------------------------------------------------------------------------------------------------
// The walls inside a round or oval room's curve: bays of the interior kit (built in Mixar on a circle of radius 4, two faces dressed, 22.5 degrees each), as many as fit the radius,
// stretched to meet, in the style of the room's building. Six styles; which a room takes follows its building's wall pack, else its world.
export type InteriorStyle = "desert" | "imperial" | "palace" | "republic" | "workshop" | "medical";
export function interiorStyleOf(wallPack: string | undefined, biome: string): InteriorStyle {
  switch (wallPack) {
    case "station": return "palace";
    case "industrial": case "criminal": return "workshop";
    case "military": case "hull": return "imperial";
    case "medical": return "medical";
    default: return biome === "urban" || biome === "temperate" ? "republic" : biome === "volcanic" ? "workshop" : biome === "station" ? "imperial" : "desert";
  }
}
export const INTERIOR_LOOK: Record<InteriorStyle, Record<number, RegionLook>> = {
  desert: { 0: { finish: "adobe" }, 1: { finish: "sandstone" }, 4: { finish: "planks" } },
  imperial: { 0: { finish: "concrete" }, 1: { finish: "sheen", colour: "#3a3f46" } },
  palace: { 0: { finish: "plaster" }, 1: { finish: "sheen", colour: "#c9a64a" }, 4: { finish: "planks" } },
  republic: { 0: { finish: "plaster", colour: "#f1ede4" }, 1: { finish: "sheen", colour: "#c9a64a" } },
  workshop: { 0: { finish: "corrugated" }, 1: { finish: "rustmetal" } },
  medical: { 0: { finish: "plaster", colour: "#eef2f4" }, 1: { finish: "sheen", colour: "#7fa4b8" } },
};
// (a ring smaller than this keeps the plain curved wall: the bays are made for a circle of radius 4 and meet badly on a tight one)
export const INTERIOR_BAY_MIN_R = 2.5;
export interface BayPlace { angle: number; across: number; out: number }
// The bays of the quarter ring that starts at `start` (0 east, a quarter turn south), of radius r; `from` and `to` (angles) are the part of it that is wall, where a way in or a
// window takes the rest: a bay is kept where it covers most of its own width of that part
export function bayRing(r: number, start: number, from = start, to = start + Math.PI / 2): BayPlace[] {
  if (r < INTERIOR_BAY_MIN_R) return [];
  const n = baysFor(r);
  const step = (2 * Math.PI) / n;
  const fit = bayFit(r, n);
  const out: BayPlace[] = [];
  for (let j = 0; j < Math.round(n / 4); j++) {
    const angle = start + (j + 0.5) * step;
    const covered = Math.min(angle + step / 2, to) - Math.max(angle - step / 2, from);
    if (covered >= 0.4 * step) out.push({ angle, across: fit.across, out: r - 4 - 0.1 });
  }
  return out;
}
