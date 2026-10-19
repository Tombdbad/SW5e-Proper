// What a rack or shelf holds (2026-10-19). A weapon rack, a display shelf or case, a stockroom shelf
// is laid out here from where it stands (the kind of building and room), so that an armsmith's rack
// holds blasters, a garrison's armory rifles and a palace guard post pikes, and the same seed fills it
// the same way each time. Pure (tests/interiors/stock.test.ts); StockDraw.tsx draws it, in the frame
// the furniture is built in: lying along x and centred, its back at z = -D/2, y up.
import { hungWeapon, LENGTH, type Kind } from "./weapons";

export interface Item {
  // A weapon by its name in the rules data, or a prop of the Blaster Kit (clip, grenade, crate) by its file
  weapon?: string;
  prop?: string;
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

// Does the furniture hold weapons, and how: hung on a rack, laid on shelves, or in a glass case
export type Holds = "rack" | "shelf" | "case" | "crates" | null;
export function holdsOf(furniture: string, buildingType: string, roomName = ""): Holds {
  const n = furniture.toLowerCase();
  if (/weapon rack/.test(n)) return "rack";
  if (/display case|display table/.test(n) && /armsmith|pawnshop/.test(buildingType.toLowerCase())) return "case";
  if (/display shelf|wares rack/.test(n) && /armsmith/.test(buildingType.toLowerCase())) return "shelf";
  if (/crate stack|shelving/.test(n) && /armory|armsmith|garrison|guardhouse|command post/.test(`${buildingType}/${roomName}`.toLowerCase())) return "crates";
  return null;
}

// The items of a piece of furniture, `L` long and `D` deep, in the frame it is built in
export function stockLayout(holds: Holds, L: number, D: number, buildingType: string, roomName: string, seed: number): Item[] {
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
          items.push({ weapon: name, x: x + 0.08, y: 0.72, z: back + 0.3, turn: 0, tilt: -Math.PI / 2, scale: 1 });
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
