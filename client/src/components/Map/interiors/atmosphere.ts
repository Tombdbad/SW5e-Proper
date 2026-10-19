// The mood of a room: the colour and strength of its light, what burns or glows in it, the fog and
// the dust in the air. Pure (tests/interiors/atmosphere.test.ts); `Atmosphere.tsx` draws it. A room's
// mood follows what the room is for, how well off it is and the world it stands on.
import type { Wealth } from "./wealth";

export type Tier = "lite" | "full";

export interface LightSpot {
  // Where, as a share of the room's width and depth (0 to 1) and a height in squares
  x: number;
  y: number;
  h: number;
  color: string;
  intensity: number;
  // How far it carries, in squares
  distance: number;
  // 0 steady; more is the flicker of a flame or a failing tube
  flicker: number;
}
export interface Mood {
  name: string;
  ambient: { color: string; intensity: number };
  // A low key light from above (a window, a skylight); intensity 0 for none
  key: { color: string; intensity: number };
  fog: { color: string; density: number } | null;
  // Motes in the air, 0 to 1
  dust: number;
  // Colour of the motes
  mote: string;
  // A shaft of light slanting in from a window or hole in the roof
  shaft: { color: string; strength: number } | null;
  spots: LightSpot[];
}

interface Recipe {
  name: string;
  match: RegExp;
  // Tested against "<building>/<room>"
  make: (w: Wealth, biome: string) => Omit<Mood, "name" | "spots"> & { spots: LightSpot[] };
}

const lamp = (x: number, y: number, color: string, intensity = 1.4, distance = 7, flicker = 0, h = 2.2): LightSpot => ({ x, y, h, color, intensity, distance, flicker });

const DARK_AMBIENT = { color: "#1b2030", intensity: 0.28 };
const WARM_AMBIENT = { color: "#ffe2c0", intensity: 0.5 };

const RECIPES: Recipe[] = [
  {
    name: "cave",
    match: /(cave|den|tunnel|crypt|cellar|basement|pit|sewer)/,
    make: (_w, biome) => ({
      ambient: { color: biome === "ice" ? "#6f93b8" : "#3a4a66", intensity: 0.22 },
      key: { color: "#7f9ccc", intensity: 0 },
      fog: { color: biome === "volcanic" ? "#4a2a22" : "#1c2433", density: 0.04 },
      dust: 0.5,
      mote: "#b9c8e0",
      shaft: null,
      spots: [lamp(0.5, 0.5, biome === "volcanic" ? "#ff6a2a" : "#8fb4ff", 1.1, 8, biome === "volcanic" ? 0.35 : 0.08, 1.2), lamp(0.15, 0.2, "#ffb347", 1, 6, 0.4, 1.4)],
    }),
  },
  {
    name: "ruin",
    match: /(ruin|sanctum|temple|sealed vault|relic)/,
    make: () => ({
      ambient: { color: "#26405a", intensity: 0.26 },
      key: { color: "#7ad6c9", intensity: 0.15 },
      fog: { color: "#13222b", density: 0.03 },
      dust: 0.6,
      mote: "#9ae6dc",
      shaft: { color: "#bff5ee", strength: 0.35 },
      spots: [lamp(0.5, 0.5, "#5ad1c0", 1.2, 8, 0.12, 1.8), lamp(0.85, 0.2, "#7ad6c9", 0.8, 6, 0.2, 1.4)],
    }),
  },
  {
    name: "detention",
    match: /(detention|holding cell|cells|slave pens|brig)/,
    make: () => ({
      ambient: { color: "#3a4a4a", intensity: 0.3 },
      key: { color: "#9fc4c4", intensity: 0.18 },
      fog: null,
      dust: 0.15,
      mote: "#cfe6e6",
      shaft: null,
      spots: [lamp(0.3, 0.5, "#d4f0e8", 1.3, 7, 0.22, 2.4), lamp(0.75, 0.5, "#d4f0e8", 1.2, 7, 0.05, 2.4)],
    }),
  },
  {
    name: "medical",
    match: /(medcenter|ward|surgery|pharmacy|dispensary)/,
    make: () => ({
      ambient: { color: "#e6f4ff", intensity: 0.62 },
      key: { color: "#dff1ff", intensity: 0.3 },
      fog: null,
      dust: 0.05,
      mote: "#ffffff",
      shaft: null,
      spots: [lamp(0.3, 0.5, "#e6f6ff", 1.5, 8, 0, 2.5), lamp(0.75, 0.5, "#e6f6ff", 1.5, 8, 0, 2.5)],
    }),
  },
  {
    name: "reactor",
    match: /(reactor|engine|engineering|coolant)/,
    make: () => ({
      ambient: { color: "#243a52", intensity: 0.3 },
      key: { color: "#6fd0ff", intensity: 0 },
      fog: { color: "#16222f", density: 0.015 },
      dust: 0.3,
      mote: "#9fe0ff",
      shaft: null,
      spots: [lamp(0.5, 0.5, "#5ad1ff", 2.2, 9, 0.06, 1.6), lamp(0.15, 0.8, "#f0a03c", 0.7, 5, 0.3, 2)],
    }),
  },
  {
    name: "hangar",
    match: /(hangar|docking|landing|berth|\barm\b|freight hangar|mechanics)/,
    make: (_w, biome) => ({
      ambient: { color: "#c8d4e4", intensity: 0.46 },
      key: { color: "#fff2dc", intensity: 0.35 },
      fog: biome === "desert" ? { color: "#b89a6a", density: 0.01 } : null,
      dust: biome === "desert" ? 0.55 : 0.25,
      mote: biome === "desert" ? "#e8cf9a" : "#dbe6f2",
      shaft: { color: "#fff0d0", strength: 0.4 },
      spots: [lamp(0.25, 0.5, "#e8f0ff", 1.5, 11, 0.02, 3.2), lamp(0.75, 0.5, "#e8f0ff", 1.5, 11, 0.02, 3.2)],
    }),
  },
  {
    name: "tavern",
    match: /(cantina|main bar|bar\b|dance floor|lounge|booth|common room|commons|tavern|gambling|gaming floor|casino|salon)/,
    make: (w) => ({
      ambient: { color: "#ffcf9a", intensity: 0.38 },
      key: { color: "#ffb870", intensity: 0.08 },
      fog: { color: "#3a2a24", density: 0.012 },
      dust: 0.45,
      mote: "#ffd9a8",
      shaft: null,
      spots: [lamp(0.2, 0.3, "#ffb347", 1.6, 7, 0.15, 2.4), lamp(0.8, 0.7, "#f472b6", 1.3, 7, 0.1, 2.2), lamp(0.5, 0.5, w === "rich" || w === "palatial" ? "#fde68a" : "#ff9a4a", 1.3, 7, 0.08, 2.4)],
    }),
  },
  {
    name: "palace",
    match: /(audience|palatial|grand hall|throne|petitioners|guest rooms|bedchambers|salon)/,
    make: (w) => ({
      ambient: { ...WARM_AMBIENT, intensity: 0.5 },
      key: { color: "#fff0d0", intensity: 0.42 },
      fog: null,
      dust: 0.35,
      mote: "#ffe9b8",
      shaft: { color: "#fff4d8", strength: w === "palatial" ? 0.55 : 0.35 },
      spots: [lamp(0.15, 0.2, "#ffd98a", 1.5, 8, 0.05, 3), lamp(0.85, 0.2, "#ffd98a", 1.5, 8, 0.05, 3), lamp(0.5, 0.85, "#ffe9b8", 1.4, 9, 0.02, 3)],
    }),
  },
  {
    name: "shop",
    match: /(sales floor|showroom|stall|trader|shopfront|armsmith|stockroom)/,
    make: () => ({
      ambient: { color: "#ffe9cf", intensity: 0.5 },
      key: { color: "#fff0d8", intensity: 0.22 },
      fog: null,
      dust: 0.2,
      mote: "#ffeacc",
      shaft: null,
      spots: [lamp(0.25, 0.5, "#fff1d6", 1.5, 7, 0.02, 2.5), lamp(0.75, 0.5, "#fff1d6", 1.5, 7, 0.02, 2.5)],
    }),
  },
  {
    name: "barracks",
    match: /(barracks|armory|guard|garrison|checkpoint|operations|command|control|security|watch|gatehouse)/,
    make: () => ({
      ambient: { color: "#c0cad6", intensity: 0.4 },
      key: { color: "#e6eef8", intensity: 0.2 },
      fog: null,
      dust: 0.12,
      mote: "#e0e8f0",
      shaft: null,
      spots: [lamp(0.3, 0.5, "#dce8f8", 1.4, 8, 0.02, 2.6), lamp(0.75, 0.5, "#dce8f8", 1.3, 8, 0.04, 2.6)],
    }),
  },
  {
    name: "slum",
    match: /(tenement|apartments|quarters|junk|scrap|hideout|camp|tents|shack|lean-to)/,
    make: () => ({
      ambient: { color: "#6a5040", intensity: 0.28 },
      key: { color: "#ffb070", intensity: 0.05 },
      fog: { color: "#2a1f1a", density: 0.012 },
      dust: 0.4,
      mote: "#d8b890",
      shaft: { color: "#ffcf9a", strength: 0.2 },
      spots: [lamp(0.35, 0.5, "#ff9a4a", 1.1, 6, 0.35, 1.9), lamp(0.85, 0.2, "#ffb870", 0.7, 5, 0.25, 1.6)],
    }),
  },
];

// What is left over: a plain room, lit by what its wealth can afford
const PLAIN = (w: Wealth): ReturnType<Recipe["make"]> => ({
  ambient: { color: "#ffe6c8", intensity: 0.36 + 0.04 * ["squalid", "poor", "modest", "comfortable", "rich", "palatial"].indexOf(w) },
  key: { color: "#fff0d8", intensity: 0.12 },
  fog: null,
  dust: 0.2,
  mote: "#ffe6c8",
  shaft: null,
  spots: [lamp(0.5, 0.5, w === "squalid" || w === "poor" ? "#ffa860" : "#ffe0b0", 1.3, 8, w === "squalid" ? 0.3 : 0.05, 2.4)],
});

// How the light is toned by the world outside, for a room with an opening to it: a flush of the star's
// colour at the key light and in the air
const BIOME_TINT: Record<string, string> = { desert: "#ffd29a", ice: "#cfe6ff", volcanic: "#ff9a6a", jungle: "#d4ffc0", swamp: "#d8e8a0", ocean: "#c8f0ff" };

export function moodOf(buildingType: string, roomName: string, wealth: Wealth, biome = ""): Mood {
  const key = `${buildingType}/${roomName}`.toLowerCase();
  const recipe = RECIPES.find((r) => r.match.test(key));
  const made = (recipe?.make ?? PLAIN)(wealth, biome);
  const tint = BIOME_TINT[biome];
  return { name: recipe?.name ?? "plain", ...made, key: tint && made.key.intensity ? { ...made.key, color: tint } : made.key };
}

// What a device draws: lite keeps two lights and half the motes, no flicker work beyond the first
export function budgetOf(mood: Mood, tier: Tier): Mood {
  if (tier === "full") return { ...mood, spots: mood.spots.slice(0, 4) };
  return { ...mood, spots: mood.spots.slice(0, 2), dust: mood.dust * 0.5, shaft: mood.shaft ? { ...mood.shaft, strength: mood.shaft.strength * 0.7 } : null };
}

// Motes to draw for a room of this size
export const moteCount = (mood: Mood, w: number, h: number, tier: Tier): number => Math.round(Math.min(160, Math.max(0, mood.dust * w * h * 0.6)) * (tier === "lite" ? 0.5 : 1));

// The brightness of a flickering light at a time, from 1 (steady) down to 1 - flicker/2 at the dimmest;
// pure, so a test can read it
export const flickerAt = (spot: Pick<LightSpot, "flicker" | "x" | "y">, t: number): number => {
  if (!spot.flicker) return 1;
  const phase = spot.x * 17.3 + spot.y * 9.1;
  const wave = (Math.sin(t * 7.3 + phase) * 0.5 + Math.sin(t * 13.1 + phase * 1.7) * 0.3 + Math.sin(t * 3.1 + phase * 0.6) * 0.2 + 1) / 2;
  return 1 - spot.flicker * 0.5 * (1 - wave);
};
