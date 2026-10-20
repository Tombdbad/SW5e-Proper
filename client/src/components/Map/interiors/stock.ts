// What a rack or shelf holds (2026-10-19). A weapon rack, a display shelf or case, a stockroom shelf
// is laid out here from where it stands (the kind of building and room), so that an armsmith's rack
// holds blasters, a garrison's armory rifles and a palace guard post pikes, and the same seed fills it
// the same way each time. Pure (tests/interiors/stock.test.ts); StockDraw.tsx draws it, in the frame
// the furniture is built in: lying along x and centred, its back at z = -D/2, y up.
import { hungWeapon, LENGTH, type Kind } from "./weapons";
import { KIT_MODELS } from "./kitbash";
import { ITEM_MODELS } from "./items";

export interface Item {
  // A weapon by its name in the rules data, a prop of the Blaster Kit (clip, grenade, crate) by its file, or a model built from
  // the kits (kitbash.ts: armour, a kit case, a prosthesis) by its name
  weapon?: string;
  prop?: string;
  model?: string;
  // A model of the item catalogue (items.ts), by its name there: stands on its underside like the kit models
  item?: string;
  x: number;
  y: number;
  z: number;
  // Turned about the upright axis (a weapon lies along z in its own frame: pi/2 lays it along x)
  turn: number;
  // Tipped up about the x axis: pi/2 stands a weapon (lying along z) on its end, a pike hung upright
  tilt?: number;
  // Scale, set so that a weapon is as long as its kind
  scale: number;
}

// The weapons a place keeps, by names in shared/data/sw5e/equipment.json
const ARMS: Record<string, string[]> = {
  shop: ["Blaster pistol", "Blaster carbine", "Blaster rifle", "Heavy pistol", "Vibroblade", "Vibrodagger", "Blaster rifle", "Light repeater", "Vibroknife", "Shotgun"],
  garrison: ["Blaster rifle", "Blaster carbine", "Blaster rifle", "Blaster pistol", "Blaster carbine", "Blaster rifle", "Vibroblade", "Blaster carbine"],
  palace: ["Vibropike", "Blaster pistol", "Vibropike", "Vibrosabre", "Vibropike", "Blaster pistol"],
  criminal: ["Slugpistol", "Blaster pistol", "Vibroknife", "Scattergun", "Blaster carbine", "Heavy pistol", "Vibroblade", "Blaster pistol"],
  frontier: ["Hunting rifle", "Blaster carbine", "Shortbow", "Vibrodagger", "Slugpistol", "Vibroaxe"],
  tools: ["Electrostaff", "Vibrocutter", "Techaxe", "Vibromace", "Electroprod", "Vibrocutter"],
};

// How wide each model of the kit lies, in squares (as built; tools/kitbash-recipes.mjs)
const KIT_WIDTH: Record<string, number> = { "kit-case": 0.51, "kit-roll": 0.54, "kit-bag": 0.43, "tool-roll": 0.5, medpac: 0.34, "trauma-case": 0.52, "prosthesis-arm": 0.74, "prosthesis-leg": 0.51, "prosthesis-hand": 0.34, "prosthesis-eye": 0.18 };

const hashOf = (text: string) => Array.from(text).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
// A small repeatable stream of numbers in [0, 1) from a seed
const stream = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

// Which stock a place keeps, from the building and room it is in
export function armsFor(buildingType: string, roomName = ""): string[] {
  const key = `${buildingType}/${roomName}`.toLowerCase();
  if (/palace|royal|estates|manor/.test(key)) return ARMS.palace;
  if (/hideout|camp|slave|raider|cantina|gambl/.test(key)) return ARMS.criminal;
  if (/garrison|command post|guardhouse|gatehouse|gate|barracks|armory|watch|checkpoint|operations/.test(key)) return ARMS.garrison;
  if (/workshop|engineering|junk|scrap|tech shop|forge|workfloor|machine shop/.test(key)) return ARMS.tools;
  if (/armsmith|sales|showroom|pawnshop|general store|curio|market|stall|shop/.test(key)) return ARMS.shop;
  return ARMS.frontier;
}

// Does the furniture hold stock, and how: weapons hung on a rack, laid on shelves or in a glass case; crates; armour on its stand;
// kits and tools on shelves and benches; medical cases; prostheses laid out under glass
export type Holds = "rack" | "shelf" | "case" | "crates" | "armour" | "kits" | "medical" | "prosthetics" | "tools" | "goods" | "devices" | "droidparts" | "clothing" | "instruments" | "vials" | "bar" | null;
export function holdsOf(furniture: string, buildingType: string, roomName = ""): Holds {
  const n = furniture.toLowerCase();
  const b = buildingType.toLowerCase();
  const where = `${b}/${roomName}`.toLowerCase();
  if (/weapon rack/.test(n)) return "rack";
  if (/armor stand|armour stand/.test(n)) return "armour";
  if (/display case|display table/.test(n) && /armsmith|pawnshop/.test(b)) return "case";
  if (/display case|display table/.test(n) && /tech shop|droid dealer|medcenter|apothecary/.test(b)) return "prosthetics";
  if (/display shelf|wares rack/.test(n) && /armsmith/.test(b)) return "shelf";
  if (/droid parts shelf/.test(n) && /tech shop|droid dealer/.test(b)) return "droidparts";
  if (/holo display/.test(n) && /tech shop|droid dealer|shipyard/.test(b)) return "devices";
  if (/goods shelf|display shelf|wares rack/.test(n) && /general store|pawnshop|curio/.test(b)) return /curio/.test(b) ? null : "goods";
  if (/instrument rack/.test(n) && /curio shop|pawnshop/.test(b)) return "instruments";
  if (/herb rack/.test(n) && /apothecary|medcenter/.test(b)) return "vials";
  if (/clothing rack/.test(n) && /outfitter/.test(b)) return "clothing";
  if (/bar counter/.test(n) && /cantina|gambling|rooming|cookshop|promenade/.test(b)) return "bar";
  if (/display shelf|wares rack|goods shelf|droid parts shelf/.test(n) && /tech shop|droid dealer|outfitter|general store|workshop|engineering/.test(b)) return "kits";
  if (/display shelf|wares rack|goods shelf|medical cabinet|supply cabinet|shelving/.test(n) && /medcenter|apothecary/.test(b)) return "medical";
  if (/crate stack|shelving/.test(n) && /armory|armsmith|garrison|guardhouse|command post/.test(where)) return "crates";
  if (/shelving/.test(n) && /workshop|engineering|tech shop|general store|junk|scrap/.test(where)) return "kits";
  if (/workbench/.test(n) && /workshop|engineering|tech shop|workfloor|machine shop/.test(where)) return "tools";
  return null;
}

// Which armour stands in an armour stand: by the kind of place (a palace guard's full suit, a garrison's plates, an outfitter's vests),
// one of the models in each. A shield stands in now and then
const ARMOUR_BY_PLACE: [RegExp, string[]][] = [
  [/palace|royal|estates|manor/, ["armour-heavy", "armour-heavy", "armour-medium"]],
  [/garrison|command post|guardhouse|gatehouse|gate|barracks|armory|operations/, ["armour-medium", "armour-heavy", "armour-medium", "shield-physical"]],
  [/outfitter|general store|pawnshop/, ["armour-light", "armour-light", "armour-medium"]],
  [/./, ["armour-light", "armour-medium", "armour-heavy", "shield-physical", "armour-medium", "shield-generator"]],
];
export const armourFor = (buildingType: string, roomName = ""): string[] => ARMOUR_BY_PLACE.find(([m]) => m.test(`${buildingType}/${roomName}`.toLowerCase()))![1];

// The named armours and suits (models of the item catalogue) that stand where a place keeps them: a palace its best, a garrison what
// the soldiers wear, an outfitter the light suits, and a general store or a spaceport's shop the life-support suits
const NAMED_ARMOUR: [RegExp, string[]][] = [
  [/palace|royal|estates|manor/, ["laminanium-assault", "beskar-weave-armor", "assault-armor", "heavy-physical-shield", "composite-armor"]],
  [/garrison|command post|guardhouse|gatehouse|gate|barracks|armory|operations/, ["battle-armor", "composite-armor", "durafiber-battle-armor", "medium-physical-shield", "plastoid-composite", "assault-armor", "light-shield-generator"]],
  [/outfitter|pawnshop/, ["fiber-armor", "combat-suit", "weave-armor", "fleximetal-fiber-armor", "duranium-combat-suit", "duravlex-fiber-armor", "space-suit"]],
  [/general store|spaceport|dock|shipyard|hangar/, ["space-suit", "hazard-suit", "diving-suit", "flame-proof-suit", "water-suit", "chemical-suit", "stabilizer-suit"]],
  [/./, ["mesh-armor", "combat-suit", "mesh-armor", "durasteel-exoskeleton", "bone-light-shield", "neutronium-mesh", "light-physical-shield", "hazard-suit", "heavy-exoskeleton", "dampening-suit", "conductive-suit", "mind-shielding-suit", "crystadium-medium-shield", "quadanium-heavy-shield", "heavy-shield-generator", "medium-shield-generator"]],
];
export const namedArmourFor = (buildingType: string, roomName = ""): string[] => NAMED_ARMOUR.find(([m]) => m.test(`${buildingType}/${roomName}`.toLowerCase()))![1];

// What each kind of shelf or case keeps, by name in the item catalogue (items.ts); every name is checked by tests/interiors/stock.test.ts
export const POOLS: Record<string, string[]> = {
  goods: ["canteen", "flask", "jug", "bucket", "pot", "tankard", "pouch", "sack", "glowrod", "mess-kit", "bedroll", "blanket", "binders", "fibercord-cable", "chronometer", "mirror", "field-rations", "macrobinoculars", "hydrospanner", "grappling-hook", "pitcher", "vial", "emergency-rations", "respirator", "oxygen-tank", "clothes-common"],
  devices: ["datapad", "commlink", "holocomm", "personal-translator", "pocket-scrambler", "credit-chip", "datacard", "datacron", "holorecorder", "wristpad", "stylus-pen", "comm-jammer", "focus-generator", "holotrace-device", "homing-beacon", "restraining-bolt", "code-cylinder", "commlink-hands-free", "repelling-wristpad", "computer-spike", "security-spike"],
  instruments: ["kloo-horn", "fizzz", "ommni-box", "bandfill", "fanfar", "slitherhorn", "valahorn", "chindinkalu-horn", "shawm", "traz", "xantha", "drum", "flute", "lute", "mandoviol"],
  vials: ["vial", "pitcher", "flask", "canteen", "emergency-battery", "poison", "vial", "tankard", "glitterstim", "andris", "cilona", "karrak"],
  clothing: ["jedi-padawan-robe", "cloak", "flightsuit", "sith-acolyte-robe", "jedi-knight-robe", "clothes-fine", "clothes-travelers", "clothes-dress-uniform", "clothes-costume", "clothes-clandestine", "jedi-master-robe", "sith-warrior-robe"],
  bar: ["deuterium-pyro", "mummergy", "novanian-grog", "raava", "spicebrew", "tihaar", "tsiraki", "vayerbok", "tankard", "jug", "flask"],
  ammo: ["arrow", "arrow-combustive", "arrow-electroshock", "arrow-noisemaker", "bolt", "bolt-deafening", "bolt-electrifying", "bolt-panic", "dart", "deafening-dart", "electrifying-dart", "panic-dart", "grenade-fragmentation", "grenade-stun", "grenade-flash", "grenade-plasma", "grenade-ion", "grenade-gas", "cartridge-slug", "cartridge-electrifying", "cell-cryo", "cell-incendiary", "flechette-clip-ion", "flechette-clip-plasma", "missile-ion", "mine-stun", "mine-flash", "charge-fragmentation", "thermal-detonator", "power-generator", "snare"],
  droidparts: Object.keys(ITEM_MODELS).filter((m) => m.startsWith("droid-")),
};

// How far a catalogue model reaches along x and z (so that it can be laid along a shelf), and how tall it is, at a scale
function reach(model: string, scale: number) {
  const b = ITEM_MODELS[model].box;
  const [w, h, d] = [(b[3] - b[0]) * scale, (b[4] - b[1]) * scale, (b[5] - b[2]) * scale];
  // Laid so that its longer side runs along the shelf
  return d > w ? { along: d, turn: Math.PI / 2, height: h } : { along: w, turn: 0, height: h };
}

// Models of the catalogue laid in rows on shelves (`ys` the tops of the shelves, from the shelf up), left to right, as many as fit
function shelfRows(pool: string[], L: number, ys: number[], next: () => number, o: { scale?: number; gap?: number; z?: number; margin?: number; maxLong?: number } = {}): Item[] {
  const { scale = 1, gap = 0.05, z = 0.02, margin = 0.3, maxLong = 0.9 } = o;
  const items: Item[] = [];
  const usable = pool.filter((m) => ITEM_MODELS[m]);
  for (const y of ys) {
    let x = -L / 2 + margin;
    for (let tries = 0; tries < 24; tries++) {
      const model = usable[Math.floor(next() * usable.length)];
      const r = reach(model, scale);
      if (r.along > maxLong || x + r.along > L / 2 - margin + 0.05) continue;
      items.push({ item: model, x: x + r.along / 2, y: y + 0.04, z, turn: r.turn + (next() - 0.5) * 0.2, scale });
      x += r.along + gap;
    }
  }
  return items;
}

// The items of a piece of furniture, `L` long and `D` deep, in the frame it is built in
export function stockLayout(holds: Holds, L: number, D: number, buildingType: string, roomName: string, seed: number, name = ""): Item[] {
  if (!holds) return [];
  const next = stream(hashOf(`${buildingType}/${roomName}`) + seed * 977);
  const arms = armsFor(buildingType, roomName);
  const back = -D / 2;
  const items: Item[] = [];
  const pick = () => arms[Math.floor(next() * arms.length)];
  const place = (name: string, x: number, y: number, z: number, turn: number, tilt = 0) => {
    const hung = hungWeapon(name);
    items.push({ weapon: name, x, y, z, turn, tilt, scale: hung.file ? hung.scale : 1 });
    return LENGTH[hung.kind];
  };
  if (holds === "rack") {
    // Weapons lie along the back panel on pegs, in tiers, as many as fit
    const usable = L - 0.5;
    for (const y of [1.1, 0.72, 0.36]) {
      let x = -usable / 2;
      while (true) {
        const name = pick();
        const length = LENGTH[hungWeapon(name).kind];
        // Long arms (a pike, a bow) hang upright, so they keep to the top tier and a narrow slot
        if (length > 0.85) {
          if (y !== 1.1 || x + 0.16 > usable / 2) break;
          items.push({ weapon: name, x: x + 0.08, y: 0.72, z: back + 0.3, turn: 0, tilt: -Math.PI / 2, scale: hungWeapon(name).file ? hungWeapon(name).scale : 1 });
          x += 0.2;
          continue;
        }
        if (x + length > usable / 2 + 0.001) break;
        place(name, x + length / 2, y, back + 0.3, Math.PI / 2);
        x += length + 0.06;
      }
    }
  } else if (holds === "shelf") {
    // Laid on the shelves of a shelving unit (as models.tsx draws it), pistols and blades; clips and grenades between
    for (const y of [0.4, 0.78, 1.14]) {
      let x = -L / 2 + 0.3;
      while (x < L / 2 - 0.3) {
        const r = next();
        if (r < 0.2) {
          // Half the clips and grenades are the Blaster Kit's, half ammunition and grenades of the catalogue (every type with its colour)
          if (next() < 0.5) {
            const model = POOLS.ammo[Math.floor(next() * POOLS.ammo.length)];
            const e = reach(model, 1);
            if (e.along < 0.4 && x + e.along < L / 2 - 0.25) { items.push({ item: model, x: x + e.along / 2, y: y + 0.04, z: 0.02, turn: e.turn + next() * 0.6, scale: 1 }); x += e.along + 0.05; }
            continue;
          }
          items.push({ prop: r < 0.1 ? "clip-large" : "grenade-a", x: x + 0.06, y: y + 0.02, z: 0.02, turn: next() * 3, scale: 0.9 });
          x += 0.16;
          continue;
        }
        const name = arms[Math.floor(next() * arms.length)];
        const length = Math.min(0.42, LENGTH[hungWeapon(name).kind]);
        if (x + length > L / 2 - 0.25) break;
        place(name, x + length / 2, y + 0.04, 0.02, Math.PI / 2, 0);
        x += length + 0.05;
      }
    }
  } else if (holds === "case") {
    // Lying on the glass top: pistols, grenades
    let x = -L / 2 + 0.3;
    while (x < L / 2 - 0.3) {
      const name = arms[Math.floor(next() * Math.min(arms.length, 4))];
      const length = Math.min(0.32, LENGTH[hungWeapon(name).kind]);
      if (x + length > L / 2 - 0.2) break;
      place(name, x + length / 2, 0.76, (next() - 0.5) * 0.1, Math.PI / 2 + (next() - 0.5) * 0.4);
      x += length + 0.1;
    }
  } else if (holds === "armour") {
    // One suit, or a shield, on the stand's footprint: a named one three times in four, else one of the kit's by weight
    const named = namedArmourFor(buildingType, roomName);
    const models = armourFor(buildingType, roomName);
    if (next() < 0.75) items.push({ item: named[Math.floor(next() * named.length)], x: 0, y: 0, z: 0, turn: (next() - 0.5) * 0.5, scale: 1 });
    else items.push({ model: models[Math.floor(next() * models.length)], x: 0, y: 0, z: 0, turn: (next() - 0.5) * 0.5, scale: 1 });
  } else if (holds === "goods" || holds === "vials" || holds === "instruments") {
    // Open shelves: a general store's goods, an apothecary's vials, a curio shop's instruments
    const shelves = [0.4, 0.78, 1.14];
    items.push(...shelfRows(POOLS[holds], L, shelves, next, { scale: holds === "instruments" ? 0.9 : 1, maxLong: holds === "instruments" ? 0.95 : 0.4 }));
  } else if (holds === "droidparts") {
    // The modules of a droid dealer's shelf: small, many
    items.push(...shelfRows(POOLS.droidparts, L, [0.4, 0.78, 1.14], next, { scale: 0.85, gap: 0.04, maxLong: 0.2 }));
  } else if (holds === "devices") {
    // On the glass top of a display: devices
    items.push(...shelfRows(POOLS.devices, L, [0.72], next, { scale: 1, gap: 0.08, margin: 0.2, z: 0, maxLong: 0.25 }));
  } else if (holds === "clothing") {
    // Stood along the rack, robes and coats on their mannequins at the scale of the rack
    const pool = POOLS.clothing.filter((m) => ITEM_MODELS[m] && ITEM_MODELS[m].meta.slot === "stand");
    const count = Math.max(1, Math.round(L * 2));
    for (let i = 0; i < count; i++) items.push({ item: pool[Math.floor(next() * pool.length)], x: -L / 2 + 0.35 + (i * (L - 0.7)) / Math.max(1, count - 1), y: 0, z: 0, turn: (next() - 0.5) * 0.4, scale: 0.9 });
  } else if (holds === "bar") {
    // Bottles and tankards along the polished top of the bar counter (0.72 up), as the bar draws its own
    const pool = POOLS.bar.filter((m) => ITEM_MODELS[m]);
    for (let i = 0; i < Math.floor(L) * 2; i++) items.push({ item: pool[Math.floor(next() * pool.length)], x: -L / 2 + 0.4 + i * 0.5, y: 0.72, z: i % 2 ? 0.08 : -0.06, turn: next() * 6, scale: 1 });
  } else if (holds === "kits" || holds === "medical") {
    // Cases, rolls and bags along the shelves, left to right, what fits: the medical cases are small and many
    const pool = holds === "kits" ? ["kit-case", "kit-roll", "kit-bag", "tool-roll", "kit-case", "kit-bag"] : ["medpac", "medpac", "trauma-case", "medpac", "kit-roll"];
    // A cabinet is shut: what it holds lies on its top (1.32 up); a shelving unit's shelves are open
    for (const y of /cabinet/i.test(name) ? [1.3] : [0.4, 0.78, 1.14]) {
      let x = -L / 2 + 0.3;
      while (true) {
        const model = pool[Math.floor(next() * pool.length)];
        const width = KIT_WIDTH[model];
        if (x + width > L / 2 - 0.25) break;
        items.push({ model, x: x + width / 2, y: y + 0.04, z: 0.02, turn: (next() - 0.5) * 0.3, scale: 0.9 });
        x += width + 0.05;
      }
    }
  } else if (holds === "prosthetics") {
    // Laid out along the glass top, long ones first
    const pool = ["prosthesis-arm", "prosthesis-leg", "prosthesis-hand", "prosthesis-eye", "prosthesis-hand", "prosthesis-eye"];
    let x = -L / 2 + 0.25;
    for (let tries = 0; tries < 8; tries++) {
      const model = pool[Math.floor(next() * pool.length)];
      const width = KIT_WIDTH[model] * 0.7;
      if (x + width > L / 2 - 0.15) continue;
      items.push({ model, x: x + width / 2, y: 0.76, z: (next() - 0.5) * 0.12, turn: 0, scale: 0.7 });
      x += width + 0.1;
    }
  } else if (holds === "tools") {
    // On the bench top: a roll, a case, a bag
    const pool = ["tool-roll", "kit-case", "kit-bag", "tool-roll", "kit-roll"];
    const count = Math.max(1, Math.min(3, Math.round(L)));
    for (let i = 0; i < count; i++) items.push({ model: pool[Math.floor(next() * pool.length)], x: -L / 2 + 0.55 + (i * (L - 1.1)) / Math.max(1, count - 1), y: 0.66, z: 0.05, turn: (next() - 0.5) * 0.6, scale: 0.8 });
  } else {
    // Crates of the Blaster Kit stacked along the back
    const files = ["crate-small", "crate-medium", "crate-wide"];
    const count = Math.max(1, Math.round(L * 1.2));
    for (let i = 0; i < count; i++) {
      const file = files[Math.floor(next() * files.length)];
      items.push({ prop: file, x: -L / 2 + 0.35 + (i * (L - 0.7)) / Math.max(1, count - 1), y: (i % 2) * 0.24, z: back + 0.4, turn: (next() - 0.5) * 0.3, scale: 0.5 });
    }
  }
  return items;
}

export const kindOfItem = (item: Item): Kind | undefined => (item.weapon ? hungWeapon(item.weapon).kind : undefined);
export const isKitModel = (name: string) => name in KIT_MODELS;
