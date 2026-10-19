// Caves that look like caves (2026-10-19). A cave room keeps its squares for the party to walk on, but
// its walls are runs of rock that bulge and sag, its edges carry stalagmites, columns and crystals,
// and the floor between holds a few rocks and pools. Built from the Kit, from a seed, with no volume
// to evaluate: a wall run is a row of noise-shaped rocks, which is what a phone can afford (the cost
// is counted by tests/interiors/cave.test.ts). Pure: nothing here draws.
import type { Kit } from "../models";

export interface RockPalette {
  rock: string;
  rockDark: string;
  rockLight: string;
  crystal: string;
  wet: string;
}
export const ROCK_PALETTES: Record<string, RockPalette> = {
  temperate: { rock: "#6a655d", rockDark: "#3f3b36", rockLight: "#8a847a", crystal: "#8fd6ff", wet: "#2c4a58" },
  forest: { rock: "#625f55", rockDark: "#37362f", rockLight: "#827e70", crystal: "#8fe3b0", wet: "#2a4a44" },
  desert: { rock: "#9a7e58", rockDark: "#5f4a30", rockLight: "#bda074", crystal: "#ffd27a", wet: "#4a5a58" },
  ice: { rock: "#a8bcc8", rockDark: "#5a6e7c", rockLight: "#d8e8f0", crystal: "#bfe8ff", wet: "#4a7a9a" },
  volcanic: { rock: "#3f3430", rockDark: "#1d1614", rockLight: "#5f4a40", crystal: "#ff8a3a", wet: "#a23a1a" },
  jungle: { rock: "#5a5a4a", rockDark: "#2f3328", rockLight: "#7a7a62", crystal: "#8affc0", wet: "#26504a" },
  swamp: { rock: "#4f5547", rockDark: "#2a2f27", rockLight: "#6f7562", crystal: "#c8e870", wet: "#3a5a3a" },
  barren: { rock: "#6a625a", rockDark: "#3a3530", rockLight: "#8a8076", crystal: "#e8c8a0", wet: "#3a4a52" },
};
export const rockPaletteOf = (biome: string): RockPalette => ROCK_PALETTES[biome] ?? ROCK_PALETTES.temperate;

// A small repeatable stream of numbers in [0, 1) from a seed
export const stream = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

// A run of cave wall `length` squares long, along x from 0, standing on z = 0 and bulging to z < 0 (away from
// the room) by up to `depth` beyond its rocks' own size (a belt of about a square and a quarter). `detail` 0 is
// for a phone (a fifth of the triangles). The run is a row of overlapping rocks of different sizes and heights, darker at
// the foot and lighter at the lip. Never reaches into the room (z > 0.1).
export function rockRun(k: Kit, length: number, height: number, seed: number, p: RockPalette, depth = 0.5, detail: 0 | 1 = 1) {
  const next = stream(seed * 7919 + 13);
  const count = Math.max(2, Math.round(length * 1.5));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const r = 0.3 + next() * 0.22;
    const x = t * length + (next() - 0.5) * 0.3;
    const high = height * (0.55 + next() * 0.6);
    // The foot: a wide, dark lump on the ground; the body: a taller lump that leans out over the room a little
    // Each rock's nearest edge (its radius, stretched by the squash and the roughness of its shape) is kept behind the wall line
    const back = (rad: number, squash: number, more: number) => -(rad * squash * 1.45 + more);
    k.blob(r * 0.95, p.rockDark, { at: [x, r * 0.35, back(r * 0.95, 0.9, next() * depth * 0.25)], seed: seed + i, rough: 0.3, detail: 0, squash: [1.1, 0.7, 0.9] });
    k.blob(r * 0.8, i % 3 ? p.rock : p.rockLight, { at: [x, high * 0.55, back(r * 0.8, 0.8, next() * depth * 0.3)], seed: seed * 3 + i, rough: 0.34, detail, squash: [0.9, high / (r * 1.6), 0.8] });
  }
  // Spurs of lighter rock on the lip
  for (let i = 0; i < Math.round(length / 3); i++) k.blob(0.16 + next() * 0.1, p.rockLight, { at: [next() * length, height * (0.95 + next() * 0.2), -0.5 - next() * 0.2], seed: seed + 100 + i, rough: 0.4, detail });
}

// A stalagmite rising from the floor, tall `h`, `r` wide at the foot (with a thin tip, a few rings of ragged rock)
export function stalagmite(k: Kit, r: number, h: number, seed: number, p: RockPalette, down = false) {
  const sign = down ? -1 : 1;
  const next = stream(seed + 5);
  const profile: [number, number][] = [];
  const rings = 5;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    profile.push([Math.max(0.01, r * (1 - t) ** 1.4 * (0.85 + next() * 0.3)), t * h * sign]);
  }
  if (down) profile.reverse();
  k.lathe(profile, p.rock, { seg: 7 });
  k.lathe(profile.map(([rr, y]) => [rr * 0.55, y] as [number, number]), p.rockLight, { seg: 5, at: [0, 0, 0] });
}

// A column where a stalactite and a stalagmite have met
export function column(k: Kit, r: number, h: number, seed: number, p: RockPalette) {
  const next = stream(seed + 41);
  const pts: [number, number][] = [[r * 1.5, 0], [r * 1.05, h * 0.12], [r * 0.7, h * 0.4], [r * 0.62, h * 0.55], [r * 0.8, h * 0.85], [r * 1.4, h]];
  k.lathe(pts.map(([rr, y]) => [rr * (0.92 + next() * 0.16), y] as [number, number]), p.rock, { seg: 9 });
}

// A cluster of crystals, glowing: `n` prisms in a fan
export function crystals(k: Kit, n: number, h: number, seed: number, p: RockPalette) {
  const next = stream(seed + 71);
  for (let i = 0; i < n; i++) {
    const a = next() * Math.PI * 2;
    const lean = 0.15 + next() * 0.45;
    const len = h * (0.5 + next() * 0.7);
    k.cone(0.07 + next() * 0.05, len, p.crystal, { at: [Math.sin(a) * lean * 0.3, len * 0.45, Math.cos(a) * lean * 0.3], rot: [Math.cos(a) * lean, 0, -Math.sin(a) * lean], seg: 5, finish: "glow" });
  }
  k.blob(0.18, p.rockDark, { at: [0, 0.04, 0], seed, rough: 0.3, squash: [1.3, 0.4, 1.3] });
}

// A pool: a dark flat of water in a rim of rock
export function pool(k: Kit, r: number, seed: number, p: RockPalette) {
  k.cyl(r, 0.04, p.wet, { at: [0, 0.02, 0], seg: 14, finish: "glass" });
  const next = stream(seed + 9);
  const n = Math.max(6, Math.round(r * 9));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    k.blob(0.1 + next() * 0.08, p.rockDark, { at: [Math.cos(a) * r, 0.06, Math.sin(a) * r], seed: seed + i, rough: 0.35, detail: 0, squash: [1.2, 0.6, 1] });
  }
}

export interface CaveFeature {
  kind: "stalagmite" | "stalactite" | "column" | "crystals" | "pool" | "rock";
  x: number;
  y: number;
  size: number;
}

// Which model of the Space Kit stands for a crystal cluster or a rock (the file under /assets), by its place in the list: the
// same cave is the same each time
const KIT_CRYSTALS = ["rock_crystals", "rock_crystalsLargeA", "rock_crystalsLargeB"];
const KIT_ROCKS = ["rock_largeA", "rock_largeB", "rocks_smallA", "rocks_smallB"];
export function kitPieceOf(f: Pick<CaveFeature, "kind">, index: number): string {
  const list = f.kind === "crystals" ? KIT_CRYSTALS : KIT_ROCKS;
  return `/assets/kenney-space/${list[index % list.length]}.glb`;
}

// What stands in a cave room of w by h squares: features on the squares along its edge (never the middle, which
// is walked) so that the cave has a rim. `open(x, y)` says whether a square is free of furniture and ways.
export function caveFeatures(w: number, h: number, seed: number, open: (x: number, y: number) => boolean = () => true): CaveFeature[] {
  const next = stream(seed * 31 + 7);
  const out: CaveFeature[] = [];
  const edge: [number, number][] = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge.push([x, y]);
  for (const [x, y] of edge) {
    if (!open(x, y)) continue;
    const r = next();
    const [fx, fy] = [x + 0.15 + next() * 0.7, y + 0.15 + next() * 0.7];
    if (r < 0.22) out.push({ kind: "stalagmite", x: fx, y: fy, size: 0.5 + next() * 0.9 });
    else if (r < 0.3) out.push({ kind: "column", x: fx, y: fy, size: 0.9 + next() * 0.4 });
    else if (r < 0.38) out.push({ kind: "crystals", x: fx, y: fy, size: 0.45 + next() * 0.4 });
    else if (r < 0.43) out.push({ kind: "rock", x: fx, y: fy, size: 0.3 + next() * 0.3 });
  }
  // A pool in the middle of a large room, off the squares that are walked: only inside, in the largest chamber
  if (w * h >= 40 && next() < 0.5) out.push({ kind: "pool", x: w / 2 + (next() - 0.5) * (w / 3), y: h / 2 + (next() - 0.5) * (h / 3), size: 0.9 + next() * 0.7 });
  return out;
}
