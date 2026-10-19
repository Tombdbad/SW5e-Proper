// How well off a room is (2026-10-19, the interiors overhaul). The same bed, table or chair is drawn
// for a hovel and for a palace; what differs is the wood, the cloth, the metal, the trim and how
// much clutter lies about. Pure: no drawing here, so tests can read it (tests/interiors/wealth.test.ts).

import * as THREE from "three";

export type Wealth = "squalid" | "poor" | "modest" | "comfortable" | "rich" | "palatial";
export const WEALTH: Wealth[] = ["squalid", "poor", "modest", "comfortable", "rich", "palatial"];

export interface RoomLook {
  // Furniture woods: the frame and the darker joinery
  wood: string;
  woodDark: string;
  // Cloth of the cushions and bedding, and a second colour for stripes, hems and cushions
  cloth: string;
  cloth2: string;
  // Metal fittings and the trim of a piece (gold in a palace, rust in a hovel)
  metal: string;
  trim: string;
  // How much clutter lies about (0 none, 1 a great deal), and how much of the trim is worn or bare
  clutter: number;
  wear: number;
  // Whether the lamps are fine (glass and brass) or plain bulbs and tallow
  lamp: "tallow" | "bulb" | "glow" | "lantern";
  // The glow of a lamp
  light: string;
}

export const LOOKS: Record<Wealth, RoomLook> = {
  squalid: { wood: "#6b5a46", woodDark: "#463a2e", cloth: "#6f6657", cloth2: "#524b40", metal: "#6a5a4c", trim: "#5b4a3a", clutter: 0.9, wear: 0.9, lamp: "tallow", light: "#ff9a4a" },
  poor: { wood: "#8a6a48", woodDark: "#5f452e", cloth: "#8a7a62", cloth2: "#6f5f4a", metal: "#7b7468", trim: "#74553a", clutter: 0.7, wear: 0.6, lamp: "bulb", light: "#ffb866" },
  modest: { wood: "#9a6e46", woodDark: "#6a4a2e", cloth: "#8a6f5a", cloth2: "#b0905a", metal: "#8c9299", trim: "#8b5e3c", clutter: 0.45, wear: 0.3, lamp: "bulb", light: "#ffc27a" },
  comfortable: { wood: "#a4784c", woodDark: "#6f4e30", cloth: "#7a5a6a", cloth2: "#c0a46a", metal: "#a7afb6", trim: "#b08a50", clutter: 0.35, wear: 0.15, lamp: "glow", light: "#ffd9a0" },
  rich: { wood: "#6a3f2a", woodDark: "#3f2418", cloth: "#6a2a3a", cloth2: "#d2b05a", metal: "#c9ced2", trim: "#c8a448", clutter: 0.3, wear: 0.05, lamp: "lantern", light: "#ffe2b0" },
  palatial: { wood: "#3a2a22", woodDark: "#21160f", cloth: "#4a2058", cloth2: "#e0bc56", metal: "#e6ecef", trim: "#e0bc56", clutter: 0.2, wear: 0, lamp: "lantern", light: "#fff0cc" },
};

// Rules are read in order; the first whose building and room patterns both match decides.
// A pattern of `.` matches anything.
const RULES: [building: RegExp, room: RegExp, wealth: Wealth][] = [
  // The palace: its servants live more plainly than the throne room
  [/^palace$/, /audience|palatial|grand hall|throne/i, "palatial"],
  [/^palace$/, /guest|offices|petitioners|entrance|tower/i, "rich"],
  [/^palace$/, /servants|kitchens|guard post|security|vault/i, "modest"],
  [/^palace$/, /./, "rich"],
  [/^(estates|manor house)$/, /servants|cellar/i, "modest"],
  [/^(estates|manor house)$/, /./, "rich"],
  [/^(royal hangar)$/, /./, "comfortable"],
  [/^gambling hall$/, /high-stakes/i, "rich"],
  [/^gambling hall$/, /./, "comfortable"],
  [/^cantina$/, /cellar|back room/i, "poor"],
  [/^cantina$/, /private booth|gambling/i, "comfortable"],
  [/^(cantina|promenade|cookshop|rooming house)$/, /./, "modest"],
  // Shops and services
  [/^(armsmith|tech shop|outfitter|curio shop|apothecary|general store|pawnshop)$/, /sales|showroom/i, "comfortable"],
  [/^(medcenter)$/, /./, "comfortable"],
  [/^(archive)$/, /./, "comfortable"],
  [/^(droid dealer|vehicle dealer|shipyard)$/, /showroom|sales/i, "comfortable"],
  // Working places and the military: plain
  [/^(garrison|command post|operations center|guardhouse|gatehouse|city gate|town gate)$/, /./, "modest"],
  [/^(workshop|engineering|warehouse|cargo bay|cargo hangar|refuelling depot|spaceport|public hangar|private hangar|landing field|landing pad|docking ring|transit hub|market)$/, /./, "modest"],
  [/^(residences|habitat ring)$/, /./, "modest"],
  // The poor end of town and the wild
  [/^(tenements|junkyard|scrap dealer)$/, /./, "poor"],
  [/^(hideout|camp)$/, /boss|leader/i, "modest"],
  [/^(hideout|camp)$/, /./, "poor"],
  [/^(cave|ruin|wreck|trailhead)$/, /./, "squalid"],
];

export function wealthOf(buildingType: string, roomName = ""): Wealth {
  const b = buildingType.toLowerCase();
  for (const [building, room, wealth] of RULES) if (building.test(b) && room.test(roomName)) return wealth;
  return "modest";
}

// A step richer or poorer, held within the scale
export const shiftWealth = (w: Wealth, by: number): Wealth => WEALTH[Math.max(0, Math.min(WEALTH.length - 1, WEALTH.indexOf(w) + by))];

// The look of a room: its wealth's look, with the colour of the cloth turned by the world (a desert
// house is dyed in the colours of the dust, an ice dwelling in the colours of furs and slate)
const CLOTH_BY_BIOME: Record<string, [string, string]> = {
  desert: ["#a87a4a", "#d8b878"],
  ice: ["#5a6f80", "#c9d6de"],
  jungle: ["#4a6a3a", "#c9a24a"],
  volcanic: ["#6a2a22", "#a07a4a"],
  swamp: ["#5a6a46", "#a89a5a"],
};
export function lookOf(wealth: Wealth, biome = ""): RoomLook {
  const base = LOOKS[wealth];
  const dye = CLOTH_BY_BIOME[biome];
  // Only the poorer rooms are dyed by the land; a palace brings its own colours
  return dye && WEALTH.indexOf(wealth) <= WEALTH.indexOf("comfortable") ? { ...base, cloth: dye[0], cloth2: dye[1] } : base;
}

// A skin for the Kit (`Kit.skin`): turns the colours a piece of furniture was drawn in into the room's own. The
// furniture is drawn once, in browns, steels and golds; wealth turns the browns into the room's woods, the steels
// into its metal, the golds into its trim and any other soft colour into its cloth, whatever it was dyed. Lights,
// glass and haze are left as they are, and so are blacks and the darkest greys (they are shadow, not material).
const hsl = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
export function skinOf(look: RoomLook): (c: THREE.Color, finish: string) => THREE.Color {
  const [wood, woodDark, metal, trim, cloth, cloth2] = [look.wood, look.woodDark, look.metal, look.trim, look.cloth, look.cloth2].map((x) => hsl(new THREE.Color(x)));
  // `target` keeps its hue and saturation; the piece's own lightness decides how light, a little less strongly
  const toward = (c: THREE.Color, own: { h: number; s: number; l: number }, ref: number, target: { h: number; s: number; l: number }, spread = 0.8) =>
    c.setHSL(target.h, target.s, Math.max(0.03, Math.min(0.92, target.l + (own.l - ref) * spread)), THREE.SRGBColorSpace);
  return (c, finish) => {
    if (finish === "glow" || finish === "glass" || finish === "haze") return c;
    const own = hsl(c);
    // Near black and dark greys: shadow, left alone
    if (own.l < 0.2) return c;
    const brown = own.h >= 0.03 && own.h <= 0.11 && own.s >= 0.2 && own.s <= 0.8 && own.l <= 0.6;
    if (brown) return own.l < 0.31 ? toward(c, own, 0.26, woodDark) : toward(c, own, 0.38, wood);
    // Steel is grey, or a grey with a blue in it; a dull green or red is cloth
    if (own.s < 0.06 || (own.s < 0.18 && own.h > 0.5 && own.h < 0.68)) return own.l > 0.3 ? toward(c, own, 0.5, metal, 0.9) : c;
    if (own.h > 0.1 && own.h < 0.17 && own.s > 0.4 && own.l > 0.4) return toward(c, own, 0.6, trim);
    // Any other dyed, soft colour: the room's cloth, or its second colour for the brighter ones
    return own.l > 0.55 ? toward(c, own, 0.65, cloth2) : toward(c, own, 0.4, cloth);
  };
}
