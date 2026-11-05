// The architecture families of the local map (2026-11-05; the user: "the buildings and rooms we have in game are all very similar in shape and appearance ... kit pieces in
// Mixar"). A building the player walks round was one rounded footprint pushed up into a box with a slab roof, its look five values (models.tsx `styleOf`); what stands on its roof
// and what frames its ways in now come from seven families of building, by the world it stands on (tools/refs/architecture.md): the pieces are made in Blender
// (tools/blender/build-architecture.py -> figures/architecture.glb) and drawn by models.tsx `ArchPiece`. Pure: nothing here draws (tests/interiors/architecture.test.ts).
import { createRandom, unitOf } from "@shared/logic";

export type Family = "adobe" | "domed" | "deco" | "polar" | "timber" | "hull" | "bunker";

// What each world builds: Tatooine's adobe, Naboo's and Jedha's domes and minarets, Coruscant's deco setbacks, Hoth's buried hatches, Endor's and Kashyyyk's thatch and timber,
// Kamino's, Bespin's and the stations' blisters, Mustafar's and Utapau's bunkers
const OF_BIOME: Record<string, Family> = {
  desert: "adobe", temperate: "domed", urban: "deco", ice: "polar", forest: "timber", jungle: "timber", swamp: "timber",
  ocean: "hull", "gas giant": "hull", station: "hull", volcanic: "bunker", barren: "bunker",
};
// The buildings of rank take the grand look of a world that has one: a palace or a great house of the desert is a domed hall like Jabba's
const GRAND = /palace|estates|manor|archive|temple/;

export function familyOf(biome: string, buildingType = ""): Family {
  if (/starship|station/.test(buildingType)) return "hull";
  const own = OF_BIOME[biome] ?? "adobe";
  return own === "adobe" && GRAND.test(buildingType) ? "domed" : own;
}

// What stands on a room's roof, by the family and by a number from the room (a room's index): a name of the kit, the size of its footprint it takes (of the room's smaller side;
// the kit's crowns are about 2 across) and where it stands (the middle, or a corner). Null where the old roof clutter stays
export interface Crown { piece: string; fit: number; corner?: boolean }
const CROWNS: Record<Family, (Crown | null)[]> = {
  adobe: [{ piece: "crown_adobe", fit: 0.4 }, null, { piece: "crown_adobe", fit: 0.3, corner: true }],
  domed: [{ piece: "crown_domed", fit: 0.4 }, { piece: "crown_minaret", fit: 0.16, corner: true }, { piece: "crown_domed", fit: 0.28, corner: true }],
  deco: [{ piece: "crown_deco", fit: 0.4 }, null, { piece: "crown_deco", fit: 0.3 }],
  polar: [{ piece: "crown_polar", fit: 0.45 }, null, { piece: "crown_polar", fit: 0.35, corner: true }],
  timber: [{ piece: "crown_timber", fit: 0.4 }, null, { piece: "crown_timber", fit: 0.32, corner: true }],
  hull: [{ piece: "crown_hull", fit: 0.4 }, null, { piece: "crown_hull", fit: 0.3, corner: true }],
  bunker: [{ piece: "crown_bunker", fit: 0.42 }, null, { piece: "crown_bunker", fit: 0.3, corner: true }],
};
// (a room too small for a crown keeps the old roof: it would fill the roof)
export const MIN_CROWN_SIDE = 3;
export function crownOf(family: Family, n: number, side: number): Crown | null {
  if (side < MIN_CROWN_SIDE) return null;
  const list = CROWNS[family];
  return list[((n % list.length) + list.length) % list.length];
}

// The frame round a way in from outside
export const portalOf = (family: Family): string => ({ adobe: "portal_adobe", domed: "portal_domed", deco: "portal_deco", polar: "portal_polar", timber: "portal_timber", hull: "portal_hull", bunker: "portal_polar" })[family];

// The colour and finish of each region of a piece (the kit's `_REGION`): 0 body takes the wall's colour, 1 trim a shade darker, 2 glow, 3 dark glass and slits, 4 timber and thatch
// (2026-11-05, the tree villages: 5 leaf, the canopies and needle cards, cut out by the leaf finish; 6 thatch on a piece that also has timber)
export const ARCH_FINISH: Record<number, "matte" | "sheen" | "glow" | "leaf"> = { 0: "matte", 1: "matte", 2: "glow", 3: "sheen", 4: "matte", 5: "leaf", 6: "matte" };
export function archColour(region: number, wall: string, shade: (c: string, k: number) => string, thatch = false): string {
  if (region === 0) return wall;
  if (region === 1) return shade(wall, 0.68);
  if (region === 2) return "#ffd98a";
  if (region === 3) return "#10141a";
  if (region === 5) return "#3d5a2a";
  if (region === 6) return "#a88e55";
  return thatch ? "#b59a5c" : "#6e4d2e";
}

// ---- Round rooms in bays, their gantries, gates and ramps (2026-11-05; the user: "ramps with radii that fit the round gantries ... logic that adapts
// these as required for procedural generation", and "gantries must follow the same rule as building walls/windows/doors when adjoining other gantries
// that have balustrades, or ramps that adjoin a lower layer to the floor of an upper layer - the balustrades/floor that block the entry must be cut away").
// The kit's pieces for a round room of radius 4 (tools/blender/build-architecture.py) are all built centred at the front (angle pi/2; x = cos, z = sin)
// with their origin at the circle's centre, so a piece goes at an angle by turning it pi/2 - angle about y. A storey is 16 wall bays of 22.5 degrees
// (`drum_bay_r4` window, `_blank_`, `_door_`; adobe `adobe_bay_*` and its parapet `adobe_lip_r4`), a gantry ring is 8 arcs of 45 degrees one storey up
// (`gantry_arc_r4`, `gantry_arc_gate_r4`, `gantry_end_r4`), and a ramp round the room is 6 segments of 22.5 degrees a storey (`ramp_arc_r4` metal under
// the gantry, `ramp_stone_arc_r4` stone against an adobe wall). Pure: tests/interiors/architecture.test.ts.
export const BAYS = 16;
export const BAY = (2 * Math.PI) / BAYS;
export const ARCS = 8;
export const ARC = (2 * Math.PI) / ARCS;
export const RAMP_STEPS = 6;
export const RAMP_SEG = Math.PI / 8;
export const ARCH_STOREY = 3.4;
// (the clear height a figure needs under a deck, and the depth of the gantry from its deck to the foot of its fascia)
export const HEADROOM = 2.2;
const GANTRY_DEPTH = 0.32;
export interface Placed { piece: string; angle: number; y: number; mirror?: boolean }
const TAU = 2 * Math.PI;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;
// the turn about y that puts a piece built at the front at this angle
export const turnFor = (angle: number) => Math.PI / 2 - angle;
// bay k is centred at k * BAY; arc i at pi/2 + i * ARC (its edges are half an arc either side)
export const bayAt = (angle: number) => ((Math.round(norm(angle) / BAY) % BAYS) + BAYS) % BAYS;
export const arcCentre = (i: number) => Math.PI / 2 + i * ARC;
const arcAt = (angle: number) => ((Math.round((norm(angle) - Math.PI / 2) / ARC) % ARCS) + ARCS) % ARCS;
// (an arc edge: a ramp's top or a gap's end lies on one)
const arcEdge = (angle: number) => Math.PI / 2 + ARC / 2 + Math.round((norm(angle) - Math.PI / 2 - ARC / 2) / ARC) * ARC;

// (a bay edge: a stone ramp's top lies on one, so that the parapet it comes up through is one whole bay's lip)
const bayEdge = (angle: number) => BAY / 2 + Math.round((norm(angle) - BAY / 2) / BAY) * BAY;
// A ramp of `steps` segments wound round the room, its top at `top`, climbing toward the larger angle (`dir` 1) or the smaller (-1, the piece mirrored),
// its foot at height `base`: each segment's centre angle and the height of its lower end. A metal ramp's top is taken to the nearest gantry arc's edge
// (where it meets the deck), a stone ramp's to the nearest bay's edge (where it comes up through the parapet)
export interface Ramp { top: number; dir: 1 | -1; base?: number; steps?: number; piece?: string }
export function rampPlan(r: Ramp): Placed[] {
  const steps = r.steps ?? RAMP_STEPS;
  const top = /stone/.test(r.piece ?? "") ? bayEdge(r.top) : arcEdge(r.top);
  const rise = ARCH_STOREY / RAMP_STEPS;
  const out: Placed[] = [];
  for (let k = 0; k < steps; k++) {
    const angle = top - r.dir * (steps - k - 0.5) * RAMP_SEG;
    out.push({ piece: r.piece ?? "ramp_arc_r4", angle: norm(angle), y: (r.base ?? 0) + k * rise, ...(r.dir < 0 ? { mirror: true } : {}) });
  }
  return out;
}

// The gantry ring one storey up a round room: an arc where a bridge, a tube or a neighbour's gantry joins it (`gates`, angles: each taken to its arc's
// middle) is a gate arc, its rail and lip cut away; the arcs over a ramp's upper run, where a figure on the ramp would not clear the deck, are left out
// (the ramp's top meets the deck with nothing across it); where the ring then stops over the ramp's lower run, a rail closes the end. `level` is the
// gantry's height (a storey by default) and the ramps' bases are their own.
export function gantryPlan(gates: number[], ramps: Ramp[] = [], level = ARCH_STOREY): Placed[] {
  const gone = new Set<number>();
  const rise = ARCH_STOREY / RAMP_STEPS;
  const ends: { edge: number; side: 1 | -1 }[] = [];
  for (const r of ramps) {
    const run = rampPlan(r);
    let lowestCut = -1;
    run.forEach((seg, k) => {
      // (the highest point of this segment against the underside of the deck)
      const high = seg.y + rise;
      if (level - GANTRY_DEPTH - high >= HEADROOM) return;
      lowestCut = lowestCut < 0 ? k : Math.min(lowestCut, k);
      // every arc this segment lies under is cut (a segment is half an arc: it lies under the arc whose span holds its middle)
      gone.add(arcAt(seg.angle));
    });
    // the far end of the gap: the edge of the last arc left standing on the ramp's lower side
    if (lowestCut >= 0) {
      const foot = run[lowestCut];
      const i = arcAt(foot.angle);
      ends.push({ edge: norm(arcCentre(i) - r.dir * (ARC / 2)), side: r.dir });
    }
  }
  const gateArcs = new Set(gates.map(arcAt));
  const out: Placed[] = [];
  for (let i = 0; i < ARCS; i++) {
    if (gone.has(i)) continue;
    out.push({ piece: gateArcs.has(i) ? "gantry_arc_gate_r4" : "gantry_arc_r4", angle: norm(arcCentre(i)), y: level });
  }
  // (the end rail is built at the start edge of an arc as it stands at the front, angle 3 pi / 8: placed so that edge lies on the gap's edge)
  for (const e of ends) if (!gone.has(arcAt(e.edge - e.side * (ARC / 2)))) out.push({ piece: "gantry_end_r4", angle: norm(e.edge + ARC / 2), y: level });
  return out;
}

// A storey of a round room in bays: a door bay wherever a way in or out is (`doors`, angles), else windows in every other bay (`windows`: "alternate", "none")
export function storeyPlan(doors: number[], y = 0, family: "drum" | "adobe" = "drum", windows: "alternate" | "none" = "alternate"): Placed[] {
  const doorBays = new Set(doors.map(bayAt));
  const name = (k: number) => family === "adobe"
    ? doorBays.has(k) ? "adobe_bay_door_r4" : windows === "alternate" && k % 4 === 2 ? "adobe_bay_window_r4" : "adobe_bay_r4"
    : doorBays.has(k) ? "drum_bay_door_r4" : windows === "alternate" && k % 2 ? "drum_bay_r4" : "drum_bay_blank_r4";
  const out: Placed[] = [];
  for (let k = 0; k < BAYS; k++) {
    out.push({ piece: name(k), angle: k * BAY, y });
    if (doorBays.has(k)) out.push({ piece: family === "adobe" ? "portal_adobe_curved_r4" : "portal_curved_r4", angle: k * BAY, y });
  }
  return out;
}

// An adobe drum's parapet: a lip on every bay but the one a stone ramp comes up onto the roof over (its top segment), which is cut away
export function parapetPlan(ramps: Ramp[] = [], y = 0): Placed[] {
  const cut = new Set(ramps.map((r) => bayAt(rampPlan(r)[(r.steps ?? RAMP_STEPS) - 1].angle)));
  const out: Placed[] = [];
  for (let k = 0; k < BAYS; k++) if (!cut.has(k)) out.push({ piece: "adobe_lip_r4", angle: k * BAY, y });
  return out;
}

// ---- Villages in the great trees (2026-11-05) ----------------------------------------------------------------------------------------------
// What the comment on siteAssets.tsx TreeVillages says: where a forest settlement's villages stand and the pieces of one, pure for the tests
export interface TreeVillageSpot { x: number; y: number; turn: number; broadleaf: boolean }
export const TREE_VILLAGE_BIOMES = new Set(["forest", "jungle", "swamp"]);
export function treeVillageSpots(rect: { x: number; y: number; width: number; height: number }, seed: string, biome: string): TreeVillageSpot[] {
  if (!TREE_VILLAGE_BIOMES.has(biome)) return [];
  const r = createRandom(Math.floor(unitOf(`${seed}|treevillage`) * 1e9));
  const out: TreeVillageSpot[] = [];
  // (two villages, on two different sides, 18 to 26 squares out from the ground: the village is about 18 across, so it stands clear of it)
  const sides = [0, 1, 2, 3].sort(() => r.next() - 0.5).slice(0, 2);
  for (const side of sides) {
    const out_ = 18 + r.next() * 8;
    const along = r.next();
    const x = side === 0 ? rect.x - out_ : side === 1 ? rect.x + rect.width + out_ : rect.x + along * rect.width;
    const y = side === 2 ? rect.y - out_ : side === 3 ? rect.y + rect.height + out_ : rect.y + along * rect.height;
    out.push({ x, y, turn: r.next() * Math.PI * 2, broadleaf: biome === "jungle" });
  }
  return out;
}
const TRUNK_R = 1.2;
const VILLAGE_LEVEL = 4.2;
const VILLAGE_STOREY = 3.4;
const TCZ = -(TRUNK_R + 2.0 + 5.5 + TRUNK_R + 3.6);
// (how deep the village is, from the first tree back to the third: it is drawn centred on its spot)
export const VILLAGE_DEPTH = -TCZ;
// (piece, x, y, z, turn): the Mixar vignette's layout, about the first tree's foot
const VILLAGE: [string, number, number, number, number][] = [
  ["tree_great_conifer", 12, 0, 0, 0], ["tree_great_conifer_needles", 12, 0, 0, 0], ["tree_great_conifer", 12, 0, TCZ, 0.7], ["tree_great_conifer_needles", 12, 0, TCZ, 0.7],
  ["platform_ring", 0, VILLAGE_LEVEL, 0, 0], ["platform_ring", 12, VILLAGE_LEVEL, 0, 0],
  ["trunk_stair", 0, VILLAGE_LEVEL - VILLAGE_STOREY, 0, 0.6], ["rope_bridge", TRUNK_R + 2.05, VILLAGE_LEVEL, 0, Math.PI / 2],
  ["trunk_stair", 12, VILLAGE_LEVEL, 0, 2.4], ["platform_wide", 12, VILLAGE_LEVEL + VILLAGE_STOREY, 0, 0],
  ["hut_rustic", 12, VILLAGE_LEVEL + VILLAGE_STOREY, TRUNK_R + 2.1, 0], ["hut_rustic", 9.4, VILLAGE_LEVEL + VILLAGE_STOREY, -2.2, 4.0],
  ["rope_bridge", 12, VILLAGE_LEVEL, -(TRUNK_R + 2.05), Math.PI], ["platform_wide", 12, VILLAGE_LEVEL, TCZ, 0.3], ["hut_rustic", 15.3, VILLAGE_LEVEL, TCZ - 0.4, -0.1],
];
export const villagePieces = (broadleaf: boolean): [string, number, number, number, number][] => [
  ...(broadleaf ? [["tree_great", 0, 0, 0, 0], ["tree_great_canopy", 0, 0, 0, 0]] as [string, number, number, number, number][] : [["tree_great_conifer", 0, 0, 0, 0], ["tree_great_conifer_needles", 0, 0, 0, 0]] as [string, number, number, number, number][]),
  ...VILLAGE,
];
