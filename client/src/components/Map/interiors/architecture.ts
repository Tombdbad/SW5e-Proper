// The architecture families of the local map (2026-11-05; the user: "the buildings and rooms we have in game are all very similar in shape and appearance ... kit pieces in
// Mixar"). A building the player walks round was one rounded footprint pushed up into a box with a slab roof, its look five values (models.tsx `styleOf`); what stands on its roof
// and what frames its ways in now come from seven families of building, by the world it stands on (tools/refs/architecture.md): the pieces are made in Blender
// (tools/blender/build-architecture.py -> figures/architecture.glb) and drawn by models.tsx `ArchPiece`. Pure: nothing here draws (tests/interiors/architecture.test.ts).
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
export const ARCH_FINISH: Record<number, "matte" | "sheen" | "glow"> = { 0: "matte", 1: "matte", 2: "glow", 3: "sheen", 4: "matte" };
export function archColour(region: number, wall: string, shade: (c: string, k: number) => string, thatch = false): string {
  if (region === 0) return wall;
  if (region === 1) return shade(wall, 0.68);
  if (region === 2) return "#ffd98a";
  if (region === 3) return "#10141a";
  return thatch ? "#b59a5c" : "#6e4d2e";
}
