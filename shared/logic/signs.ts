// Signs (2026-11-16, batch F; the user: signs must be real stylized textures relevant to the building, room, settlement and planet, never
// floating letters). Pure and deterministic: what a sign says and how it looks, from what it hangs on (the building's or room's kind, who
// holds the place, the planet's biome, how well off it is) and a seed. The painting is siteAssets.tsx `paintSign` (a canvas atlas: albedo and
// emission), the mounting LocalMap (over the way in, on the roof, on a room's wall). Nothing here is a rule: a sign changes no game state.
// No real-world or film logos: the marks (clan sigils, crests, pictograms) are made from simple shapes, and the local script is an invented
// alphabet of strokes on a three-by-three grid, the same letter always the same glyph.

export type SignStyle = "neon" | "stencil" | "hutt" | "clan" | "medical" | "bay" | "shop" | "street" | "plate" | "crest";
export type Pictogram = "blaster" | "gear" | "droid" | "speeder" | "needle" | "crate" | "gem" | "coin" | "wrench" | "flask" | "bed" | "bowl" | "dice" | "ship" | "scroll" | "arrow" | "none";
// board: a flat panel on a wall; blade: a narrow panel standing out from the wall, painted on both faces; strip: a long low band; disc: round
export type SignShape = "board" | "blade" | "strip" | "disc";
export type SignMaterial = "metal" | "wood" | "plastoid" | "stone";
export type SignWealth = "squalid" | "poor" | "modest" | "comfortable" | "rich" | "palatial";
const WEALTHS: SignWealth[] = ["squalid", "poor", "modest", "comfortable", "rich", "palatial"];

// A glyph of the script: strokes between the points of a three-by-three grid (0 top left .. 8 bottom right)
export type Glyph = [number, number][];
// A clan's or a house's mark, drawn by the painter from these few shapes (mirrored about the middle)
export interface Sigil { horns: number; bar: boolean; eye: boolean; crescent: boolean; points: number; tilt: number }

export interface SignSpec {
  // what the painter caches the picture by: the same key, the same picture
  key: string;
  style: SignStyle;
  shape: SignShape;
  // the Basic words (the painter upper-cases them where the style does) and a smaller second line
  text: string;
  sub?: string;
  // the same words in the local script, drawn over the Basic where the style shows both
  script?: Glyph[];
  pictogram: Pictogram;
  sigil?: Sigil;
  // the board, the letters, what glows, the frame
  ground: string;
  ink: string;
  glow: string;
  trim: string;
  material: SignMaterial;
  // whether any of it gives off light (neon, a light box, strip lamps), how badly its tubes sputter (0 steady), how worn it is (0 new)
  lit: boolean;
  flicker: number;
  wear: number;
  // its size in squares (width across, height up)
  w: number;
  h: number;
  // the light it throws at night on the wall and the street (a clustered point light, babylon.ts; nothing for an unlit sign)
  light?: { color: string; intensity: number; distance: number };
}

export interface SignPlace {
  // the building's (or room's) name and kind (a building type of shared/logic BUILDINGS, or a room's name)
  name: string;
  type: string;
  room?: string;
  // who holds it (the building's, the settlement's or the system's faction), the planet's biome, how well off it is
  faction?: string;
  biome?: string;
  wealth?: SignWealth;
  seed: number;
  // the width of the wall it hangs on, in squares (a building's front; a room's wall)
  span?: number;
  // a number to show (a bay's; otherwise one is drawn from the seed)
  number?: number;
}

// ---- Seeded numbers (their own stream: the world's dice are untouched) ----
export function signHash(s: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}
const pick = <T>(list: readonly T[], h: number) => list[h % list.length];

// ---- What a building's or room's kind shows ----
const BAY = /hangar|docking|landing|refuelling|bay\b|berth|speeder platform|shipyard|cargo bay|freight/i;
const MEDICAL = /medcenter|apothecary|ward|surgery|pharmacy|dispensary|clinic|medbay/i;
const MILITARY = /garrison|command post|guardhouse|gatehouse|city gate|town gate|operations center|detention|armory|barracks|checkpoint|guard (room|post)|security/i;
const NIGHTLIFE = /cantina|gambling|gaming floor|rooming house|cookshop|promenade|arena|main bar|dance floor|betting/i;
const NOBLE = /palace|estates|manor house|royal/i;
const SHOP: [RegExp, Pictogram][] = [
  [/armsmith|armory|forge/i, "blaster"], [/tech shop|repair|parts/i, "gear"], [/droid/i, "droid"], [/vehicle|speeder|garage/i, "speeder"],
  [/outfitter|tailor/i, "needle"], [/general store|stockroom|market|stalls|trade/i, "crate"], [/curio/i, "gem"], [/pawnshop|cashier|coin/i, "coin"],
  [/workshop|workfloor|junkyard|scrap|salvage|machine shop/i, "wrench"], [/apothecary|pharmacy|dispensary/i, "flask"], [/rooming|guest|lodging/i, "bed"],
  [/cookshop|dining|kitchen/i, "bowl"], [/gambling|gaming|betting|cantina|bar\b/i, "dice"], [/hangar|docking|spaceport|shipyard|landing/i, "ship"],
  [/archive|records|reading|stacks/i, "scroll"],
];
const QUIET = /residences|tenements|habitat ring|archive|warehouse|cargo bay|transit hub|spaceport|engineering|apartments|quarters|lobby/i;
// Places with no sign: the hostile and the wild (a hideout does not announce itself)
const NONE = /hideout|camp|cave|ruin|wreck|trailhead|stash|tunnel|cellar|basement|hidden|escape|holding cells|slave/i;

export function pictogramOf(type: string): Pictogram {
  for (const [re, p] of SHOP) if (re.test(type)) return p;
  return "none";
}

// The style a place takes: who holds it first (a Hutt's cantina is gaudy in Hutt script, a Mandalorian clan paints its mark), then its kind
export function signStyleOf(type: string, faction = "", room = ""): SignStyle | null {
  // (a room's sign is for what the room is, not what the building is: a cantina's bar has its neon, its entrance and its booths none)
  if (room) {
    if (NONE.test(room)) return null;
    if (BAY.test(room)) return "bay";
    if (MEDICAL.test(room)) return "medical";
    if (MILITARY.test(room)) return /mandalor/i.test(faction) ? "clan" : "stencil";
    if (/main bar|dance floor|gaming floor|gambling room|betting hall|cantina/i.test(room)) return /hutt|black sun|pyke|crymorah|czerka/i.test(faction) ? "hutt" : "neon";
    if (/sales floor|showroom|shopfront|repair counter|stalls/i.test(room)) return "shop";
    return null;
  }
  const what = type;
  if (NONE.test(what)) return null;
  if (BAY.test(room || type)) return "bay";
  if (MEDICAL.test(what)) return "medical";
  if (/mandalor/i.test(faction)) return MILITARY.test(what) || NOBLE.test(what) ? "clan" : NIGHTLIFE.test(what) ? "neon" : "clan";
  if (MILITARY.test(what)) return "stencil";
  if (/hutt|black sun|pyke|crymorah|czerka/i.test(faction) && (NIGHTLIFE.test(what) || /pawnshop|junkyard|scrap|curio/i.test(what))) return "hutt";
  if (NIGHTLIFE.test(what)) return "neon";
  if (NOBLE.test(what)) return "crest";
  if (pictogramOf(what) !== "none" && !QUIET.test(type)) return "shop";
  return "plate";
}

// ---- Looks: palettes per style, the board's stuff from the biome, wear from wealth ----
const NEON = [["#0b0712", "#ffd1f5", "#ff3fb4", "#2a1838"], ["#06100f", "#c9fff7", "#29f0d0", "#12302c"], ["#0d0a04", "#fff0c4", "#ffb21f", "#3a2a10"], ["#070a14", "#d6e4ff", "#4f8cff", "#1b2340"], ["#120605", "#ffd9cf", "#ff4a2a", "#3a1410"], ["#0a1206", "#e8ffd0", "#8dff3a", "#203410"]] as const;
const HUTT = [["#3a2410", "#ffe9a8", "#ffb000", "#8a5a10"], ["#2c1a24", "#ffd7a0", "#ff7a00", "#7a4a1a"], ["#1f2a12", "#f6ffb0", "#d8e000", "#5a6a10"]] as const;
const CLAN = [["#2a3a4a", "#e9d38a", "#7fd4ff", "#1a2430"], ["#4a2420", "#f0e0c0", "#ff8a3a", "#2a1410"], ["#2c3a2a", "#d8e0c8", "#9aff9a", "#18221a"], ["#3a3a40", "#ffd04a", "#ffd04a", "#1c1c22"]] as const;
const CREST = [["#2a0f1c", "#e9c46a", "#ffe6a0", "#c9a24a"], ["#0f1c2a", "#dfe6f0", "#cfe2ff", "#a8b8c8"], ["#14281c", "#e9c46a", "#fff0b0", "#c9a24a"]] as const;
// (a faction's colours on its stencilled walls: grey and red for an empire, white and orange for a republic, black and red, blue and violet;
// anyone else a khaki militia)
function stencilColours(faction: string): [string, string, string, string] {
  if (/first order/i.test(faction)) return ["#15161a", "#e8e8ea", "#ff2a1a", "#3a0c0a"];
  if (/empire|imperial/i.test(faction)) return ["#5b6068", "#f2f2f0", "#ff3b30", "#2a2d33"];
  if (/new republic|resistance|rebel/i.test(faction)) return ["#d9d4c8", "#a8361f", "#ff7a3a", "#6a6a60"];
  if (/republic/i.test(faction)) return ["#e6e2d6", "#b2401f", "#ffa040", "#8a8070"];
  if (/separatist|trade federation/i.test(faction)) return ["#3a3550", "#d8d0ff", "#8a6aff", "#1c1a2a"];
  return ["#5a5a3c", "#efe8c8", "#ffd24a", "#33331f"];
}
export function signMaterialOf(biome = "", style: SignStyle): SignMaterial {
  if (style === "neon" || style === "medical") return "plastoid";
  if (/forest|jungle|swamp/i.test(biome)) return "wood";
  if (/desert|barren|volcanic/i.test(biome) && style !== "bay" && style !== "stencil") return style === "crest" ? "stone" : "metal";
  if (/ice|ocean/i.test(biome)) return "plastoid";
  return style === "crest" ? "stone" : "metal";
}
// How worn a sign is: the wealth of the place, and the weather (sand and sun wear a board faster than a city's shelter)
export function signWearOf(wealth: SignWealth = "modest", biome = ""): number {
  const base = [0.85, 0.6, 0.35, 0.18, 0.06, 0][WEALTHS.indexOf(wealth)] ?? 0.35;
  const weather = /desert|barren|volcanic|swamp/i.test(biome) ? 0.12 : /urban/i.test(biome) ? -0.05 : 0;
  return Math.max(0, Math.min(1, base + (base > 0 ? weather : 0)));
}

// ---- The script ----
// Each letter's glyph: two to four strokes on the grid, chosen once from the letter (a script, not a cipher of the seed), never two letters alike
const STROKES: [number, number][] = [[0, 2], [3, 5], [6, 8], [0, 6], [1, 7], [2, 8], [0, 8], [2, 6], [0, 4], [4, 8], [1, 3], [1, 5], [3, 7], [5, 7], [0, 1], [7, 8], [4, 5], [3, 4]];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SCRIPT: Record<string, Glyph> = (() => {
  const out: Record<string, Glyph> = {};
  const seen = new Set<string>();
  for (const ch of ALPHABET) {
    for (let salt = 0; ; salt++) {
      const h = signHash(`glyph:${ch}`, salt);
      const n = 2 + (h % 3);
      const strokes: Glyph = [];
      for (let k = 0; strokes.length < n && k < 12; k++) {
        const s = STROKES[signHash(`${ch}:${k}`, h) % STROKES.length];
        if (!strokes.some((t) => t[0] === s[0] && t[1] === s[1])) strokes.push(s);
      }
      const id = strokes.map((s) => s.join("-")).sort().join(",");
      if (seen.has(id)) continue;
      seen.add(id);
      out[ch] = strokes;
      break;
    }
  }
  return out;
})();
// The words in the script (letters and digits; anything else is a gap)
export function scriptOf(text: string): Glyph[] {
  return Array.from(text.toUpperCase()).map((ch) => SCRIPT[ch] ?? []);
}

// A clan's or house's mark, from its name (the same name, the same mark)
export function sigilOf(name: string): Sigil {
  const h = signHash(`sigil:${name}`);
  return { horns: h % 3, bar: ((h >>> 3) & 1) === 1, eye: ((h >>> 4) & 1) === 1, crescent: ((h >>> 5) & 1) === 1, points: 3 + ((h >>> 6) % 4), tilt: ((h >>> 9) % 5) / 10 };
}

// A short name fits a sign: "The Rusty Mynock Cantina" stays whole, a long room name drops what follows a comma
// (a name too long for a board keeps the part in quotes, the place's own name: 'Rooming house "Wandering Promise"' is "Wandering Promise")
const shortName = (name: string) => {
  const head = name.split(/[,:(]/)[0].trim();
  const own = /"([^"]+)"/.exec(head)?.[1];
  return (head.length > 24 && own ? own : head).slice(0, 28);
};

// ---- The sign of a place ----
export function signOf(p: SignPlace): SignSpec | null {
  const style = signStyleOf(p.type, p.faction, p.room);
  if (!style) return null;
  const h = signHash(`${p.name}|${p.type}|${p.room ?? ""}`, p.seed);
  const wealth = p.wealth ?? "modest";
  const rich = WEALTHS.indexOf(wealth);
  const biome = p.biome ?? "";
  const span = Math.max(1, p.span ?? 4);
  const wear = signWearOf(wealth, biome);
  // (a bar's neon and a shop's board inside show the place's name; a ward's, a hangar's or an armory's door the room's own)
  const name = shortName(p.room && !["neon", "hutt", "shop"].includes(style) ? p.room : p.name);
  let colours: readonly string[];
  let shape: SignShape = "board";
  let text = name;
  let sub: string | undefined;
  let lit = false;
  let w = Math.min(3.4, Math.max(1.2, span * 0.6));
  let hgt = w / 3.6;
  switch (style) {
    case "neon":
      colours = pick(NEON, h);
      lit = true;
      // (a cantina's or gambling hall's sign stands out from the wall; a bar inside hangs flat)
      if (!p.room && (h >>> 4) % 3 !== 0) { shape = "blade"; w = 0.8; hgt = 2.2; }
      break;
    case "hutt":
      colours = pick(HUTT, h);
      lit = true;
      // (a wide gaudy board, never a blade: the script above the Basic is the point of it)
      hgt = w / 2.6;
      break;
    case "stencil":
      colours = stencilColours(p.faction ?? "");
      lit = rich >= 2;
      shape = "strip";
      hgt = w / 5;
      text = name.toUpperCase();
      sub = /detention|armory|command/i.test(`${p.type} ${p.room ?? ""}`) ? "authorised personnel only" : undefined;
      break;
    case "clan":
      colours = pick(CLAN, h);
      sub = `clan ${pick(["Vhett", "Ordo-Kal", "Teras", "Brannic", "Sennar", "Akaan", "Rook", "Vizla-Tor"], h >>> 7)}`;
      break;
    case "medical":
      colours = ["#eef4f6", "#0e3a4a", "#5fe0ff", "#9fb4bc"];
      lit = true;
      shape = p.room ? "board" : "disc";
      if (shape === "disc") { w = 1.3; hgt = 1.3; }
      break;
    case "bay": {
      colours = ["#2a2d31", "#f4f1e8", "#ffd84a", "#ffcc00"];
      lit = true;
      // (the number is the building's: its hangar inside shows the one over its door)
      const n = p.number ?? 1 + (signHash(p.name, p.seed) % 48);
      text = `${n}`;
      sub = p.room ? shortName(p.room) : name;
      w = Math.min(4, Math.max(1.6, span * 0.5));
      hgt = w / 2;
      break;
    }
    case "shop":
      colours = pick([["#2c3e50", "#f5f0e1", "#ffd27a", "#9a7a4a"], ["#3a2a1a", "#f8e8c8", "#ffb85a", "#6a4a2a"], ["#1d3a34", "#e8fff4", "#6affc8", "#3a6a5a"], ["#3a1c24", "#ffe8ec", "#ff7a9a", "#6a3a44"]], h);
      lit = rich >= 3 || /urban/i.test(biome);
      break;
    case "crest":
      colours = pick(CREST, h);
      shape = "blade";
      w = 1.1;
      hgt = 2.0;
      break;
    case "street":
    case "plate":
    default:
      colours = /urban/i.test(biome) ? ["#1d4e89", "#ffffff", "#bfe0ff", "#e8eef4"] : ["#6a5232", "#f2e6c8", "#ffe0a0", "#3a2c1a"];
      lit = /urban/i.test(biome) && rich >= 2;
      w = Math.min(1.6, Math.max(0.9, span * 0.3));
      hgt = w / 3;
      break;
  }
  const flicker = lit && (style === "neon" || style === "hutt") ? Math.max(0, wear - 0.25) : 0;
  const [ground, ink, glow, trim] = colours;
  const spec: SignSpec = {
    key: "",
    style, shape, text, sub, pictogram: style === "bay" ? "none" : pictogramOf(`${p.room ?? ""} ${p.type}`),
    ground, ink, glow, trim,
    material: signMaterialOf(biome, style),
    lit, flicker, wear,
    w: round2(w), h: round2(hgt),
  };
  if (style === "neon" || style === "hutt" || style === "clan" || style === "stencil") spec.script = scriptOf(style === "stencil" ? name.slice(0, 10) : name.slice(0, 14));
  if (style === "clan" || style === "crest") spec.sigil = sigilOf(style === "clan" ? sub ?? name : name);
  if (lit) spec.light = { color: glow, intensity: style === "neon" || style === "hutt" ? 5 : style === "bay" ? 6 : 3, distance: style === "bay" ? 7 : 5 };
  spec.key = signKey(spec);
  return spec;
}

// A street's name, for the plates on the corners (the district's own words and a kind of way, from the seed)
export function streetNameOf(district: string, seed: number): string {
  const h = signHash(`street:${district}`, seed);
  const base = district.replace(/\b(district|quarter|grounds|field|the)\b/gi, "").trim().split(/\s+/)[0] || pick(["Dune", "Lantern", "Spice", "Old Market", "Ironworks", "Copper", "Glass", "Long"], h);
  return `${base} ${pick(["Way", "Row", "Lane", "Walk", "Run", "Street", "Crossing"], h >>> 5)}`;
}
// The board of a signpost at a way out: where it leads, with an arrow
export function signpostOf(to: string, leave: boolean, biome = "", seed = 0): SignSpec {
  const urban = /urban/i.test(biome);
  const spec: SignSpec = {
    key: "",
    style: "street", shape: "board",
    text: shortName(to), sub: leave ? "way out" : undefined,
    pictogram: "arrow",
    ground: urban ? "#1d4e89" : "#e8dcc0", ink: urban ? "#ffffff" : "#2a2116", glow: "#bfe0ff", trim: urban ? "#e8eef4" : "#5a4630",
    material: signMaterialOf(biome, "street"),
    lit: false, flicker: 0, wear: signWearOf("modest", biome) * (0.6 + (signHash(to, seed) % 40) / 100),
    w: 1.1, h: 0.36,
  };
  spec.wear = round2(spec.wear);
  spec.key = signKey(spec);
  return spec;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
function signKey(s: SignSpec): string {
  return [s.style, s.shape, s.text, s.sub ?? "", s.pictogram, s.ground, s.ink, s.glow, s.trim, s.material, s.lit ? 1 : 0, s.flicker, s.wear, s.w, s.h].join("|");
}
