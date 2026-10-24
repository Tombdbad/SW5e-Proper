import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { create } from "zustand";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, Model, useModel, C, shade, mix, FINISHES, MATERIALS, planRect, type V3, type Finish } from "./models";
import { groundShader, surfaceMaterial, wallMaterial, SURFACE_GRAIN, type WallSet } from "./surfaces";
import type { PackId } from "./interiors/packs";
import { createRandom, unitOf, packedness, type SiteGrounds, type DistrictPlan, type PropHit, type RaceScenery } from "@shared/logic";

// ---------------------------------------------------------------------------------------------
// The asset library of the sites (2026-10-18). A site's open ground is laid out by the shared logic
// (the curtain wall, the gardens, the stalls of a market: rectangles of squares); what stands in it is
// chosen here, from a library of pieces known by their tags, and set out by `plantGarden` from a seed,
// so that the same site looks the same each time. Every piece is built in code from the Kit of
// models.tsx (nothing is downloaded, and a phone has less to fetch), baked once into a mesh per
// finish, and drawn with all its copies in one instanced call. Colours follow the world: a Palette
// for each biome turns the same oak into a pale conifer on an ice world and a palm in the desert.
//
// To add a piece: give it a name, tags, a footprint and a `build` in LIBRARY. To use a model made
// elsewhere (a glTF from an asset pack, kept under client/public/assets), give the entry a `gltf`
// path: its meshes are merged into one and drawn instead of `build` once the file has loaded (its
// materials' colours are kept; textures are not), and `build` is drawn until then and if the file
// is missing, so a pack can be added a piece at a time. `piecesTagged("tree")` lists what the
// library has for a tag. A piece that stands in the way gives its `hit`, the shape it is struck by
// at a scale of 1 (the speeder race uses it; see PropHit in shared/logic), drawn round the same
// parts as its `build`, so that what is seen is what is struck.
// ---------------------------------------------------------------------------------------------

// How much a device is asked to draw: "lite" on a phone or a slow device (fewer plants, no
// flowers), "full" otherwise. It starts from what the device reports, is lowered by the render
// scale monitor of the map when frames come slowly, and can be fixed by the player.
export type Tier = "lite" | "full";
interface QualityState {
  tier: Tier;
  // Fixed by the player; absent while the device decides
  fixed?: Tier;
  lower: () => void;
  raise: () => void;
  fix: (tier: Tier | undefined) => void;
}
function detectTier(): Tier {
  try {
    const saved = localStorage.getItem("sw5e.detail");
    if (saved === "lite" || saved === "full") return saved;
  } catch {}
  if (typeof navigator === "undefined") return "full";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  return cores <= 2 || (touch && (cores <= 4 || memory <= 3)) ? "lite" : "full";
}
const savedTier = (): Tier | undefined => {
  try {
    const saved = localStorage.getItem("sw5e.detail");
    return saved === "lite" || saved === "full" ? saved : undefined;
  } catch {
    return undefined;
  }
};
export const useQuality = create<QualityState>((set, get) => ({
  tier: detectTier(),
  fixed: savedTier(),
  lower: () => !get().fixed && set({ tier: "lite" }),
  raise: () => !get().fixed && set({ tier: detectTier() === "lite" ? "lite" : "full" }),
  fix: (tier) => {
    try {
      if (tier) localStorage.setItem("sw5e.detail", tier);
      else localStorage.removeItem("sw5e.detail");
    } catch {}
    set({ fixed: tier, tier: tier ?? detectTier() });
  },
}));

// ---------------------------------------------------------------------------------------------
// Palettes: the colours of the plants, stone and canvas of a world
// ---------------------------------------------------------------------------------------------

export interface Palette {
  leaf: string;
  leaf2: string;
  bark: string;
  bloom: string[];
  lawn: string;
  stone: string;
  water: string;
  canvas: string[];
}
const CANVAS = ["#c8663a", "#e8dcc0", "#4f8a8b", "#a1495a"];
const PALETTES: Record<string, Palette> = {
  temperate: { leaf: "#3f7d3a", leaf2: "#5a9a45", bark: "#6b4a2e", bloom: ["#e5484d", "#f0a03c", "#c084fc", "#fde68a"], lawn: "#3d6b3a", stone: "#b8b2a4", water: "#4aa3d9", canvas: CANVAS },
  forest: { leaf: "#2f6b3a", leaf2: "#467a3a", bark: "#5a3f2a", bloom: ["#fde68a", "#f0abfc", "#ffffff"], lawn: "#2f5a33", stone: "#a8a496", water: "#3f8fb8", canvas: CANVAS },
  jungle: { leaf: "#1f7a3d", leaf2: "#2fa04d", bark: "#5a4630", bloom: ["#ff6b6b", "#ffb347", "#ff7ad1", "#7af0ff"], lawn: "#1f5a2c", stone: "#9a9684", water: "#2f9ab0", canvas: ["#d9752b", "#2f9a6a", "#a1495a", "#e8dcc0"] },
  swamp: { leaf: "#5a7a3a", leaf2: "#7a8a45", bark: "#4a3a28", bloom: ["#e8d36a", "#b9d6a0"], lawn: "#4a5a35", stone: "#8f927a", water: "#5a7a4a", canvas: ["#7a6a3a", "#9a8a5a", "#5a6a4a", "#8a5a3a"] },
  desert: { leaf: "#7f8a4a", leaf2: "#a39a55", bark: "#8a6a42", bloom: ["#e08a3c", "#f2c14e", "#d9534f"], lawn: "#8a8a52", stone: "#d2b88a", water: "#5aaec0", canvas: ["#c8663a", "#e8dcc0", "#b0763a", "#a1495a"] },
  ice: { leaf: "#6f9a8f", leaf2: "#9fc4bd", bark: "#6a5a4a", bloom: ["#e8f4ff", "#bfdcff", "#ffd6e0"], lawn: "#8fb0b8", stone: "#dfeef5", water: "#9fd4f0", canvas: ["#5a8aa8", "#e8f4ff", "#a1495a", "#3f6a8a"] },
  volcanic: { leaf: "#4a4a3a", leaf2: "#6a5a3a", bark: "#2a2020", bloom: ["#ff6a2a", "#ffb347", "#e5484d"], lawn: "#3a3430", stone: "#5a5048", water: "#c8501f", canvas: ["#8a2a1a", "#3a2a2a", "#a1692a", "#5a4a4a"] },
  barren: { leaf: "#6a6a52", leaf2: "#8a8a62", bark: "#5a4a3a", bloom: ["#c9a56e", "#e8dcc0"], lawn: "#6a6455", stone: "#8a847a", water: "#6a8a9a", canvas: ["#8a7a62", "#c9a56e", "#6a5a4a", "#a1495a"] },
  urban: { leaf: "#4a7a4a", leaf2: "#6a9a5a", bark: "#5a4a3a", bloom: ["#f472b6", "#fde68a", "#7dd3fc"], lawn: "#3f6a40", stone: "#9aa0a8", water: "#5aa8d8", canvas: ["#4f8a8b", "#e8dcc0", "#a1495a", "#d9752b"] },
  ocean: { leaf: "#3f8a6a", leaf2: "#5fb08a", bark: "#6b5a3e", bloom: ["#f472b6", "#fde68a", "#ffffff"], lawn: "#3d7a5a", stone: "#c4c8c8", water: "#3f8ad8", canvas: ["#4f8a8b", "#e8f4ff", "#c8663a", "#a1495a"] },
};
PALETTES["gas giant"] = PALETTES.urban;
export const paletteOf = (biome: string): Palette => PALETTES[biome] ?? PALETTES.temperate;

// ---------------------------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------------------------

type Build = (k: Kit, p: Palette, v: number) => void;
export interface Piece {
  tags: string[];
  // The squares it stands on
  size: [number, number];
  // Whether it stands in the way of anyone walking
  blocks: boolean;
  // The shape a speeder strikes, or drags through (at a scale of 1)
  hit?: PropHit;
  build: Build;
  // A model made elsewhere, under client/public (see above)
  gltf?: string;
}

// A frond, leaf or branch: a flattened lump laid out from a point
const leafAt = (k: Kit, color: string, at: V3, rot: V3, long: number, seed: number) => k.blob(long * 0.5, color, { at, rot, seed, rough: 0.12, smooth: true, squash: [1, 0.12, 0.34] });

const LIBRARY: Record<string, Piece> = {
  tree_broad: {
    tags: ["tree", "garden", "shade"], size: [1, 1], blocks: true, hit: { r: 0.2, h: 2 },
    build: (k, p, v) => {
      k.lathe([[0.2, 0], [0.15, 0.4], [0.1, 1.4], [0.06, 1.9]], p.bark, { seg: 8 });
      k.blob(0.95, p.leaf, { at: [0, 2.25, 0], seed: v + 1, rough: 0.22, smooth: true, squash: [1, 0.85, 1] });
      k.blob(0.62, p.leaf2, { at: [0.5, 2.55, 0.2], seed: v + 5, rough: 0.2, smooth: true });
      k.blob(0.55, p.leaf2, { at: [-0.42, 2.5, -0.25], seed: v + 9, rough: 0.2, smooth: true });
    },
  },
  tree_conifer: {
    tags: ["tree", "garden", "evergreen"], size: [1, 1], blocks: true, hit: { r: 0.22, h: 3, soft: 0.7 },
    build: (k, p, v) => {
      k.cyl(0.09, 0.8, p.bark, { at: [0, 0.4, 0], seg: 6 });
      [[0.85, 1.0, 0.7], [0.68, 1.0, 1.4], [0.5, 0.9, 2.05], [0.3, 0.8, 2.65]].forEach(([r, h, y], i) => k.cone(r, h, i % 2 ? p.leaf2 : p.leaf, { at: [0, y, 0], seg: 8 + (v % 2) * 2 }));
    },
  },
  tree_palm: {
    tags: ["tree", "garden", "arid"], size: [1, 1], blocks: true, hit: { r: 0.16, h: 2.8 },
    build: (k, p, v) => {
      const lean = 0.25 + (v % 3) * 0.12;
      k.tube([[0, 0, 0], [lean * 0.4, 1.1, 0], [lean, 2.2, 0.05], [lean * 1.5, 2.9, 0.05]], (t) => 0.15 - t * 0.07, p.bark, { around: 6 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + v;
        leafAt(k, i % 2 ? p.leaf : p.leaf2, [lean * 1.5 + Math.cos(a) * 0.55, 2.95 - 0.1, Math.sin(a) * 0.55], [0.35 * Math.sin(a), -a, 0.35 * Math.cos(a)], 1.5, v + i);
      }
      k.sphere(0.1, p.bark, { at: [lean * 1.5, 2.85, 0.05], seg: [6, 5] });
    },
  },
  tree_dry: {
    tags: ["tree", "garden", "arid", "dead"], size: [1, 1], blocks: true, hit: { r: 0.14, h: 1.9 },
    build: (k, p, v) => {
      k.tube([[0, 0, 0], [0.05, 0.9, 0], [-0.05, 1.7, 0.05]], (t) => 0.13 - t * 0.07, p.bark, { around: 6 });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + v;
        k.rod([0, 1.2 + i * 0.15, 0], [Math.cos(a) * 0.7, 1.9 + i * 0.12, Math.sin(a) * 0.7], 0.03, p.bark, { seg: 5 });
      }
      k.blob(0.28, p.leaf, { at: [0.2, 2.0, 0.1], seed: v, rough: 0.3, smooth: true });
    },
  },
  shrub: {
    tags: ["plant", "garden", "low"], size: [1, 1], blocks: false, hit: { h: 0.65, soft: 0.45 },
    build: (k, p, v) => {
      for (let i = 0; i < 3; i++) k.blob(0.3 + (i % 2) * 0.08, i % 2 ? p.leaf2 : p.leaf, { at: [Math.cos(i * 2.1 + v) * 0.22, 0.28, Math.sin(i * 2.1 + v) * 0.22], seed: v + i, rough: 0.2, smooth: true });
    },
  },
  hedge: {
    tags: ["hedge", "garden", "wall"], size: [1, 1], blocks: true, hit: { box: [0.5, 0.5], h: 0.85 },
    build: (k, p, v) => {
      k.box([0.98, 0.82, 0.98], p.leaf, { at: [0, 0.41, 0], round: 0.22 });
      k.blob(0.42, p.leaf2, { at: [0.1, 0.84, -0.05], seed: v, rough: 0.15, smooth: true, squash: [1, 0.5, 1] });
    },
  },
  flowerbed: {
    tags: ["flowers", "garden", "low"], size: [1, 1], blocks: false,
    build: (k, p, v) => {
      k.box([0.92, 0.14, 0.92], p.stone, { at: [0, 0.07, 0], round: 0.05 });
      k.box([0.8, 0.16, 0.8], shade(p.bark, 0.7), { at: [0, 0.1, 0] });
      for (let i = 0; i < 7; i++) k.sphere(0.075, p.bloom[(i + v) % p.bloom.length], { at: [((i * 37) % 7) / 10 - 0.3, 0.3 + (i % 3) * 0.04, ((i * 53) % 7) / 10 - 0.3], seg: [6, 5] });
      for (let i = 0; i < 3; i++) k.blob(0.12, p.leaf, { at: [(i - 1) * 0.28, 0.22, (i % 2) * 0.2 - 0.1], seed: i + v, rough: 0.15, smooth: true });
    },
  },
  topiary: {
    tags: ["topiary", "garden", "formal"], size: [1, 1], blocks: true, hit: { r: 0.28, h: 1.9 },
    build: (k, p, v) => {
      k.cyl(0.26, 0.34, shade(p.stone, 0.85), { at: [0, 0.17, 0], seg: 10 });
      k.cyl(0.05, 0.5, p.bark, { at: [0, 0.55, 0], seg: 6 });
      k.sphere(0.4, p.leaf, { at: [0, 1.0, 0], seg: [12, 9] });
      k.sphere(0.27, p.leaf2, { at: [0, 1.58, 0], seg: [10, 8] });
      if (v % 2) k.cone(0.1, 0.3, p.leaf, { at: [0, 1.95, 0], seg: 6 });
    },
  },
  fountain: {
    tags: ["fountain", "garden", "water", "centre"], size: [3, 3], blocks: true, hit: { r: 1.5, h: 1.5 },
    build: (k, p) => {
      k.lathe([[1.5, 0], [1.5, 0.5], [1.38, 0.54], [1.3, 0.46], [0, 0.46]], p.stone, { seg: 28 });
      k.cyl(1.28, 0.03, p.water, { at: [0, 0.4, 0], seg: 28, finish: "glass" });
      k.lathe([[0.3, 0.4], [0.18, 0.5], [0.14, 1.1], [0.55, 1.28], [0.58, 1.4], [0.46, 1.34], [0, 1.3]], p.stone, { seg: 20 });
      k.lathe([[0.1, 1.3], [0.07, 1.7], [0.28, 1.8], [0.3, 1.88], [0.2, 1.84], [0, 1.82]], shade(p.stone, 1.08), { seg: 16 });
      k.cone(0.06, 0.6, "#cfeaff", { at: [0, 2.15, 0], seg: 6, finish: "glass" });
      for (let i = 0; i < 6; i++) k.cone(0.03, 0.5, "#cfeaff", { at: [Math.cos(i * 1.05) * 0.45, 1.55, Math.sin(i * 1.05) * 0.45], rot: [Math.sin(i * 1.05) * 0.5, 0, -Math.cos(i * 1.05) * 0.5], seg: 5, finish: "glass" });
    },
  },
  statue: {
    tags: ["statue", "garden", "formal", "centre"], size: [1, 1], blocks: true, hit: { box: [0.4, 0.4], h: 2.1 },
    build: (k, p, v) => {
      const stone = shade(p.stone, 0.95);
      k.box([0.8, 0.22, 0.8], shade(stone, 0.85), { at: [0, 0.11, 0], round: 0.03 });
      k.box([0.58, 0.8, 0.58], stone, { at: [0, 0.62, 0], round: 0.04 });
      k.capsule(0.17, 0.62, stone, { at: [0, 1.5, 0] });
      k.sphere(0.14, stone, { at: [0, 2.0, 0], seg: [10, 8] });
      // Arms: one raised or both at the sides, by the figure
      const raised = v % 2 === 0;
      k.rod([0.17, 1.65, 0], raised ? [0.46, 2.15, 0.05] : [0.3, 1.2, 0.04], 0.05, stone, { seg: 6 });
      k.rod([-0.17, 1.65, 0], [-0.3, 1.2, 0.04], 0.05, stone, { seg: 6 });
      if (v % 3 === 1) k.pair((s) => leafAt(k, stone, [s * 0.38, 1.75, -0.1], [0, 0, s * 0.5], 0.9, v));
    },
  },
  column: {
    tags: ["statue", "garden", "ruin", "formal"], size: [1, 1], blocks: true, hit: { r: 0.35, h: 2.05 },
    build: (k, p, v) => {
      const stone = shade(p.stone, 0.92);
      k.box([0.7, 0.18, 0.7], stone, { at: [0, 0.09, 0], round: 0.03 });
      k.cyl(0.24, 1.7, stone, { at: [0, 1.03, 0], seg: 12 });
      k.cyl(0.32, 0.14, shade(stone, 1.06), { at: [0, 1.95, 0], seg: 12 });
      if (v % 2) k.blob(0.22, stone, { at: [0.1, 2.02, 0], seed: v, rough: 0.4, squash: [1, 0.5, 1] });
    },
  },
  urn: {
    tags: ["urn", "garden", "formal", "low"], size: [1, 1], blocks: false, hit: { r: 0.3, h: 0.8 },
    build: (k, p) => {
      k.lathe([[0.22, 0], [0.24, 0.05], [0.14, 0.18], [0.3, 0.46], [0.34, 0.62], [0.24, 0.66], [0, 0.6]], shade(p.stone, 0.9), { seg: 12 });
      k.blob(0.2, p.leaf2, { at: [0, 0.76, 0], seed: 3, rough: 0.2, smooth: true });
    },
  },
  planter: {
    tags: ["planter", "garden", "low"], size: [1, 1], blocks: true, hit: { box: [0.42, 0.42], h: 0.9 },
    build: (k, p, v) => {
      k.box([0.84, 0.42, 0.84], p.stone, { at: [0, 0.21, 0], round: 0.05 });
      k.blob(0.38, p.leaf, { at: [0, 0.58, 0], seed: v, rough: 0.2, smooth: true });
      for (let i = 0; i < 3; i++) k.sphere(0.07, p.bloom[(i + v) % p.bloom.length], { at: [(i - 1) * 0.2, 0.84, (i % 2) * 0.12 - 0.06], seg: [6, 5] });
    },
  },
  bench: {
    tags: ["bench", "garden", "seat"], size: [2, 1], blocks: false, hit: { box: [0.9, 0.25], h: 0.8 },
    build: (k, p) => {
      for (const x of [-0.8, 0.8]) k.box([0.12, 0.42, 0.5], p.stone, { at: [x, 0.21, 0], round: 0.03 });
      k.box([1.8, 0.07, 0.46], "#8b5e3c", { at: [0, 0.44, 0], round: 0.02 });
      k.box([1.8, 0.28, 0.06], "#8b5e3c", { at: [0, 0.72, -0.22], round: 0.02 });
    },
  },
  lamp: {
    tags: ["lamp", "garden", "light"], size: [1, 1], blocks: false, hit: { r: 0.1, h: 1.9 },
    build: (k) => {
      k.lathe([[0.1, 0], [0.1, 0.06], [0.04, 0.12], [0.035, 1.5], [0.08, 1.56], [0, 1.58]], C.black, { seg: 8, finish: "sheen" });
      k.sphere(0.12, "#ffe7a8", { at: [0, 1.7, 0], seg: [8, 6], finish: "glow" });
      k.cone(0.16, 0.12, C.black, { at: [0, 1.86, 0], seg: 8, finish: "sheen" });
    },
  },
  // Wild ground (2026-10-18, first for the speeder race's course; any site can plant them): taller and
  // slimmer trees, a cactus, rocks and boulders, fallen wood, and ground cover of grass, wildflowers,
  // ferns, reeds and pebbles. The palette turns them to the world (moss or frost on a boulder's crown).
  tree_tall: {
    tags: ["tree", "wild", "shade"], size: [2, 2], blocks: true, hit: { r: 0.3, h: 3.2 },
    build: (k, p, v) => {
      k.lathe([[0.34, 0], [0.26, 0.25], [0.2, 1.2], [0.15, 2.6], [0.1, 3.3]], p.bark, { seg: 9 });
      k.rod([0, 2.1, 0], [0.9, 2.9, 0.2], 0.07, p.bark, { seg: 6 });
      k.rod([0, 2.4, 0], [-0.7, 3.2, -0.4], 0.06, p.bark, { seg: 6 });
      k.blob(1.25, p.leaf, { at: [0, 3.7, 0], seed: v + 2, rough: 0.25, smooth: true, squash: [1, 0.75, 1] });
      k.blob(0.85, p.leaf2, { at: [1.0, 3.3, 0.3], seed: v + 6, rough: 0.22, smooth: true });
      k.blob(0.8, p.leaf2, { at: [-0.8, 3.5, -0.5], seed: v + 11, rough: 0.22, smooth: true });
      k.blob(0.7, shade(p.leaf, 1.1), { at: [0.2, 4.4, -0.2], seed: v + 15, rough: 0.2, smooth: true });
    },
  },
  tree_pine: {
    tags: ["tree", "wild", "evergreen"], size: [1, 1], blocks: true, hit: { r: 0.18, h: 4, soft: 0.6 },
    build: (k, p, v) => {
      k.cyl(0.13, 1.2, p.bark, { at: [0, 0.6, 0], top: 0.09, seg: 7 });
      [[0.75, 1.1, 1.0], [0.64, 1.0, 1.65], [0.52, 0.95, 2.25], [0.4, 0.85, 2.8], [0.27, 0.75, 3.3], [0.14, 0.55, 3.75]].forEach(([r, h, y], i) => k.cone(r, h, i % 2 ? p.leaf2 : shade(p.leaf, 0.9), { at: [0, y, 0], seg: 9 + (v % 3) }));
    },
  },
  tree_birch: {
    tags: ["tree", "wild", "garden"], size: [1, 1], blocks: true, hit: { r: 0.12, h: 3 },
    build: (k, p, v) => {
      const bend = ((v % 3) - 1) * 0.15;
      k.tube([[0, 0, 0], [bend * 0.5, 1.2, 0], [bend, 2.4, 0.05], [bend * 1.2, 3.1, 0.05]], (t) => 0.11 - t * 0.06, "#e8e4da", { around: 7 });
      for (let i = 0; i < 6; i++) k.box([0.1, 0.03, 0.03], "#2b2722", { at: [bend * (i / 6) * 0.9, 0.4 + i * 0.42, 0.09 - i * 0.004], rot: [0, i * 0.4, 0] });
      k.blob(0.55, p.leaf2, { at: [bend * 1.1, 3.0, 0], seed: v + 3, rough: 0.25, smooth: true, squash: [0.8, 1.2, 0.8] });
      k.blob(0.42, p.leaf, { at: [bend + 0.3, 2.5, 0.15], seed: v + 7, rough: 0.25, smooth: true });
      k.blob(0.38, p.leaf, { at: [bend - 0.3, 2.7, -0.15], seed: v + 9, rough: 0.25, smooth: true });
    },
  },
  cactus: {
    tags: ["plant", "wild", "arid"], size: [1, 1], blocks: true, hit: { r: 0.24, h: 2.1 },
    build: (k, p, v) => {
      const green = mix(p.leaf, "#5f8a4a", 0.5);
      k.capsule(0.22, 1.5, green, { at: [0, 0.97, 0], seg: 10 });
      k.tube([[0.15, 0.9, 0], [0.5, 0.95, 0], [0.55, 1.25, 0], [0.55, 1.6, 0]], 0.12, green, { around: 8 });
      if (v % 2) k.tube([[-0.15, 1.2, 0], [-0.45, 1.25, 0.05], [-0.48, 1.5, 0.05], [-0.48, 1.75, 0.05]], 0.1, green, { around: 8 });
      k.sphere(0.07, p.bloom[v % p.bloom.length], { at: [0, 1.97, 0], seg: [6, 5] });
    },
  },
  rock: {
    tags: ["rock", "wild"], size: [1, 1], blocks: true, hit: { r: 0.55, h: 0.7 },
    build: (k, p, v) => {
      k.blob(0.5, p.stone, { at: [0, 0.22, 0], seed: v + 1, rough: 0.35, squash: [1.15, 0.65, 0.95] });
      k.blob(0.22, shade(p.stone, 0.88), { at: [0.45, 0.08, 0.2], seed: v + 4, rough: 0.4, squash: [1, 0.7, 1] });
    },
  },
  boulder: {
    tags: ["rock", "wild", "large"], size: [2, 2], blocks: true, hit: { r: 0.9, h: 1.3 },
    build: (k, p, v) => {
      k.blob(0.85, p.stone, { at: [0, 0.5, 0], seed: v + 2, rough: 0.32, squash: [1.05, 0.8, 1] });
      k.blob(0.5, shade(p.stone, 0.9), { at: [0.7, 0.25, -0.3], seed: v + 8, rough: 0.35, squash: [1, 0.75, 1] });
      k.blob(0.3, shade(p.stone, 1.08), { at: [-0.6, 0.12, 0.5], seed: v + 5, rough: 0.4 });
      k.blob(0.42, mix(p.stone, p.lawn, 0.55), { at: [0.05, 1.08, 0.05], seed: v + 3, rough: 0.2, smooth: true, squash: [1.2, 0.25, 1.1] });
    },
  },
  rock_small: {
    tags: ["rock", "ground", "low"], size: [1, 1], blocks: false,
    build: (k, p, v) => {
      for (let i = 0; i < 4; i++) k.blob(0.07 + ((i * 37 + v) % 5) * 0.02, shade(p.stone, 0.85 + (i % 3) * 0.1), { at: [Math.cos(i * 1.9 + v) * 0.28, 0.03, Math.sin(i * 1.9 + v) * 0.28], seed: v + i, rough: 0.4, squash: [1, 0.6, 1] });
    },
  },
  log: {
    tags: ["wood", "wild", "low"], size: [2, 1], blocks: true, hit: { box: [1, 0.22], h: 0.45 },
    build: (k, p, v) => {
      k.cyl(0.22, 2.0, p.bark, { at: [0, 0.2, 0], rot: [0, 0, Math.PI / 2], seg: 9 });
      k.pair((s) => k.cyl(0.2, 0.02, shade(p.bark, 1.35), { at: [s * 1.005, 0.2, 0], rot: [0, 0, Math.PI / 2], seg: 9 }));
      k.rod([0.3, 0.3, 0.1], [0.55, 0.62, 0.25], 0.05, p.bark, { seg: 5 });
      k.blob(0.16, p.leaf2, { at: [-0.5, 0.42, 0], seed: v, rough: 0.2, smooth: true, squash: [1.4, 0.4, 1] });
    },
  },
  stump: {
    tags: ["wood", "wild", "low"], size: [1, 1], blocks: true, hit: { r: 0.32, h: 0.45 },
    build: (k, p, v) => {
      k.lathe([[0.42, 0], [0.32, 0.08], [0.27, 0.4], [0, 0.42]], p.bark, { seg: 10 });
      k.cyl(0.25, 0.02, shade(p.bark, 1.4), { at: [0, 0.42, 0], seg: 10 });
      for (let i = 0; i < 3; i++) k.rod([0, 0.1, 0], [Math.cos(i * 2.1 + v) * 0.55, 0, Math.sin(i * 2.1 + v) * 0.55], 0.05, p.bark, { seg: 5 });
    },
  },
  grass_tuft: {
    tags: ["ground", "grass", "low"], size: [1, 1], blocks: false,
    build: (k, p, v) => {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4 + v;
        const lean = 0.25 + (i % 3) * 0.12;
        const h = 0.3 + ((i * 7 + v) % 4) * 0.06;
        k.cone(0.03, h, i % 2 ? p.leaf2 : p.leaf, { at: [Math.cos(a) * (0.06 + lean * h * 0.5), (h / 2) * Math.cos(lean), Math.sin(a) * (0.06 + lean * h * 0.5)], rot: [Math.sin(a) * lean, 0, -Math.cos(a) * lean], seg: 3 });
      }
    },
  },
  wildflowers: {
    tags: ["ground", "flowers", "low"], size: [1, 1], blocks: false,
    build: (k, p, v) => {
      for (let i = 0; i < 6; i++) {
        const a = i * 2.1 + v;
        k.cone(0.025, 0.26, p.leaf2, { at: [Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.1], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], seg: 3 });
      }
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + v;
        const [x, z] = [Math.cos(a) * 0.2, Math.sin(a) * 0.2];
        k.cyl(0.008, 0.32, p.leaf, { at: [x, 0.16, z], seg: 3 });
        k.sphere(0.045, p.bloom[(i + v) % p.bloom.length], { at: [x, 0.34, z], seg: [6, 4] });
      }
    },
  },
  fern: {
    tags: ["plant", "ground", "low", "wild"], size: [1, 1], blocks: false, hit: { h: 0.5, soft: 0.4 },
    build: (k, p, v) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + v;
        leafAt(k, i % 2 ? p.leaf : p.leaf2, [Math.cos(a) * 0.26, 0.2, Math.sin(a) * 0.26], [0.45 * Math.sin(a), -a, 0.45 * Math.cos(a)], 0.7, v + i);
      }
    },
  },
  reeds: {
    tags: ["ground", "water", "low", "wild"], size: [1, 1], blocks: false,
    build: (k, p, v) => {
      for (let i = 0; i < 8; i++) {
        const a = i * 2.2 + v;
        const h = 0.7 + (i % 3) * 0.18;
        const [x, z] = [Math.cos(a) * 0.15, Math.sin(a) * 0.15];
        k.cyl(0.015, h, i % 2 ? p.leaf2 : mix(p.leaf, p.bark, 0.3), { at: [x, h / 2, z], rot: [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12], seg: 3 });
        if (i % 3 === 0) k.capsule(0.03, 0.12, p.bark, { at: [x + Math.cos(a) * h * 0.12, h, z + Math.sin(a) * h * 0.12], seg: 5 });
      }
    },
  },
  // Racing and crowds (2026-10-18): a duracrete barrier in red and white, a stack of crates, a pylon, a
  // grandstand with its crowd under a canopy, and a banner on a pole
  barrier: {
    tags: ["barrier", "race", "wall"], size: [2, 1], blocks: true, hit: { box: [1, 0.2], h: 0.55 },
    build: (k, p, v) => {
      const face = new THREE.Shape();
      face.moveTo(-0.2, 0);
      face.lineTo(0.2, 0);
      face.lineTo(0.12, 0.14);
      face.lineTo(0.07, 0.55);
      face.lineTo(-0.07, 0.55);
      face.lineTo(-0.12, 0.14);
      face.lineTo(-0.2, 0);
      for (let i = 0; i < 2; i++) k.extrude(face, 0.98, i % 2 === v % 2 ? "#c83a32" : "#ece8e0", { at: [-0.99 + i, 0, 0], rot: [0, Math.PI / 2, 0], bevel: 0.02 });
      k.box([2, 0.03, 0.15], "#2b2722", { at: [0, 0.555, 0] });
    },
  },
  crate_stack: {
    tags: ["crates", "cargo", "race"], size: [1, 1], blocks: true, hit: { box: [0.55, 0.45], h: 1, breaks: true, mass: 0.15 },
    build: (k, p, v) => {
      const wood = ["#8b6a43", "#7a5a38", "#9a7a4e"][v % 3];
      const crates: [V3, number][] = [[[-0.27, 0.24, 0], 0], [[0.27, 0.24, 0.05], 0.15], [[0, 0.72, 0], -0.2]];
      crates.forEach(([at, turn], i) => {
        k.box([0.5, 0.48, 0.5], shade(wood, 0.92 + i * 0.07), { at, rot: [0, turn, 0], round: 0.03 });
        k.box([0.52, 0.05, 0.52], "#5a5f66", { at, rot: [0, turn, 0], finish: "sheen" });
      });
    },
  },
  pylon: {
    tags: ["pylon", "race", "marker"], size: [1, 1], blocks: false, hit: { r: 0.14, h: 0.95, breaks: true, mass: 0.05 },
    build: (k) => {
      k.cyl(0.2, 0.06, "#2b2722", { at: [0, 0.03, 0], seg: 10 });
      k.lathe([[0.13, 0.06], [0.05, 0.9], [0, 0.92]], "#ff6a1f", { seg: 12 });
      k.cyl(0.11, 0.1, "#f4f1ea", { at: [0, 0.35, 0], top: 0.1, seg: 12 });
      k.cyl(0.082, 0.08, "#f4f1ea", { at: [0, 0.62, 0], top: 0.075, seg: 12 });
      k.sphere(0.045, "#ffb347", { at: [0, 0.93, 0], seg: [6, 5], finish: "glow" });
    },
  },
  grandstand: {
    tags: ["stand", "seating", "race", "crowd"], size: [6, 3], blocks: true, hit: { box: [3, 1.5], h: 2.6 },
    build: (k, p, v) => {
      // Three tiers rising away from the front (+z), a canopy on posts, and the crowd on the benches
      for (let t = 0; t < 3; t++) {
        const top = 0.4 + t * 0.45;
        k.box([6, top, 0.95], shade(p.stone, 0.95 - t * 0.05), { at: [0, top / 2, 1.0 - t * 0.95], round: 0.03 });
        k.box([6, 0.06, 0.3], "#6b4a33", { at: [0, top + 0.03, 1.2 - t * 0.95] });
        for (let i = 0; i < 13; i++) {
          if ((i * 7 + t * 3 + v) % 5 === 0) continue;
          const x = -2.8 + i * 0.47 + ((i + t) % 2) * 0.08;
          const z = 1.15 - t * 0.95;
          k.capsule(0.11, 0.16, p.canvas[(i + t + v) % p.canvas.length], { at: [x, top + 0.2, z], seg: 6 });
          k.sphere(0.08, ["#e0b08a", "#8a5a3a", "#c88a6a", "#5a3a2a"][(i * 3 + t) % 4], { at: [x, top + 0.42, z], seg: [6, 5] });
        }
      }
      k.box([6.3, 0.08, 3.2], p.canvas[v % p.canvas.length], { at: [0, 2.6, 0.1], rot: [0.08, 0, 0], finish: "cloth" });
      for (const x of [-3, 0, 3]) k.cyl(0.05, 2.6, "#3a3f46", { at: [x, 1.3, -1.4], seg: 6, finish: "sheen" });
      for (const x of [-3, 3]) k.cyl(0.04, 2.4, "#3a3f46", { at: [x, 1.2, 1.55], seg: 6, finish: "sheen" });
    },
  },
  banner: {
    tags: ["banner", "flag", "race"], size: [1, 1], blocks: false, hit: { r: 0.06, h: 2.6 },
    build: (k, p, v) => {
      k.cyl(0.035, 2.6, "#3a3f46", { at: [0, 1.3, 0], seg: 6, finish: "sheen" });
      k.box([0.03, 1.2, 0.5], p.canvas[v % p.canvas.length], { at: [0, 1.85, 0.27], finish: "cloth" });
      k.rod([0, 2.48, 0], [0, 2.48, 0.55], 0.015, "#3a3f46", { seg: 4 });
      k.sphere(0.05, "#ffd24a", { at: [0, 2.64, 0], seg: [6, 5], finish: "glow" });
    },
  },
};

// A glTF file as one geometry with vertex colours, loaded once; nothing if it cannot be had
const FILES = new Map<string, Promise<THREE.BufferGeometry | null>>();
function loadFile(path: string): Promise<THREE.BufferGeometry | null> {
  let found = FILES.get(path);
  if (!found) {
    found = new GLTFLoader()
      .loadAsync(path)
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const parts: THREE.BufferGeometry[] = [];
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
          if (!geo.attributes.normal) geo.computeVertexNormals();
          const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          const color = material?.color ?? new THREE.Color("#cccccc");
          const colors = new Float32Array(geo.attributes.position.count * 3);
          for (let i = 0; i < colors.length; i += 3) [colors[i], colors[i + 1], colors[i + 2]] = [color.r, color.g, color.b];
          geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          parts.push(geo.index ? geo.toNonIndexed() : geo);
        });
        return parts.length ? mergeGeometries(parts, false) : null;
      })
      .catch(() => null);
    FILES.set(path, found);
  }
  return found;
}
function useFile(path?: string): THREE.BufferGeometry | null {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    loadFile(path).then((g) => live && setGeo(g));
    return () => { live = false; };
  }, [path]);
  return geo;
}

// What the library has for a tag
export const piecesTagged = (tag: string): string[] => Object.keys(LIBRARY).filter((key) => LIBRARY[key].tags.includes(tag));

// What a world's speeder race course is dressed with (its trees, shrubs and boulders, and the ground
// cover drawn between them), and the shape of every piece that has one
const WILD: Record<string, { trees: string[]; shrubs: string[]; boulders: string[]; cover: string[] }> = {
  temperate: { trees: ["tree_broad", "tree_tall", "tree_birch", "tree_conifer"], shrubs: ["shrub", "fern"], boulders: ["rock", "boulder", "log"], cover: ["grass_tuft", "grass_tuft", "wildflowers", "rock_small"] },
  forest: { trees: ["tree_pine", "tree_conifer", "tree_tall", "tree_pine"], shrubs: ["fern", "shrub"], boulders: ["boulder", "rock", "log", "stump"], cover: ["grass_tuft", "rock_small", "wildflowers"] },
  jungle: { trees: ["tree_palm", "tree_tall", "tree_broad"], shrubs: ["fern", "shrub"], boulders: ["boulder", "rock", "log"], cover: ["grass_tuft", "wildflowers", "grass_tuft"] },
  swamp: { trees: ["tree_dry", "tree_broad", "tree_tall"], shrubs: ["shrub", "fern"], boulders: ["log", "stump", "rock"], cover: ["reeds", "grass_tuft", "reeds"] },
  desert: { trees: ["cactus", "tree_palm", "tree_dry", "cactus"], shrubs: ["shrub"], boulders: ["boulder", "rock", "rock"], cover: ["rock_small", "rock_small", "grass_tuft"] },
  ice: { trees: ["tree_pine", "tree_conifer"], shrubs: [], boulders: ["boulder", "rock"], cover: ["rock_small"] },
  volcanic: { trees: ["tree_dry", "stump"], shrubs: [], boulders: ["boulder", "rock"], cover: ["rock_small"] },
  barren: { trees: ["tree_dry", "cactus"], shrubs: ["shrub"], boulders: ["boulder", "rock", "stump"], cover: ["rock_small", "grass_tuft"] },
  urban: { trees: ["tree_broad", "tree_birch", "tree_tall"], shrubs: ["shrub"], boulders: ["rock", "boulder"], cover: ["grass_tuft", "wildflowers"] },
  ocean: { trees: ["tree_palm", "tree_broad", "tree_palm"], shrubs: ["shrub", "fern"], boulders: ["rock", "boulder"], cover: ["grass_tuft", "wildflowers", "rock_small"] },
};
export function raceScenery(biome: string): RaceScenery & { cover: string[] } {
  const wild = WILD[biome] ?? WILD.temperate;
  const hits = Object.fromEntries(Object.entries(LIBRARY).filter(([, piece]) => piece.hit).map(([key, piece]) => [key, piece.hit!]));
  return { ...wild, hits };
}

// Which trees a world grows
const TREES: Record<string, string[]> = {
  temperate: ["tree_broad", "tree_broad", "tree_conifer"], forest: ["tree_conifer", "tree_broad", "tree_conifer"], jungle: ["tree_broad", "tree_palm", "tree_palm"],
  swamp: ["tree_dry", "tree_broad"], desert: ["tree_palm", "tree_palm", "tree_dry"], ice: ["tree_conifer"], volcanic: ["tree_dry"], barren: ["tree_dry", "shrub"],
  urban: ["tree_broad", "tree_broad", "tree_conifer"], ocean: ["tree_palm", "tree_broad"], "gas giant": ["tree_broad"],
};

// ---------------------------------------------------------------------------------------------
// Planting a garden: a pure layout, the same from the same seed
// ---------------------------------------------------------------------------------------------

export interface Placed {
  key: string;
  // The middle of the piece, in squares of the district's grid
  x: number;
  y: number;
  rot: number;
  scale: number;
  v: number;
  // The height of the ground under it (0 when left out)
  h?: number;
  // The squares it fills, if it blocks: x, y, width, height
  fills?: [number, number, number, number];
}
interface Rect { x: number; y: number; width: number; height: number }

export function plantGarden(rect: Rect, seed: string, biome: string, tier: Tier, kept: (x: number, y: number) => boolean = () => false): Placed[] {
  const r = createRandom(Math.floor(unitOf(seed) * 1e9));
  const out: Placed[] = [];
  const used = new Set<string>();
  const inside = (x: number, y: number) => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
  const free = (x: number, y: number, w = 1, h = 1) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!inside(x + i, y + j) || used.has(`${x + i},${y + j}`) || kept(x + i, y + j)) return false;
    return true;
  };
  const put = (key: string, x: number, y: number, o: { rot?: number; scale?: number; v?: number } = {}) => {
    const [w, h] = LIBRARY[key].size;
    if (!free(x, y, w, h)) return false;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used.add(`${x + i},${y + j}`);
    out.push({ key, x: x + w / 2, y: y + h / 2, rot: o.rot ?? 0, scale: o.scale ?? 1, v: o.v ?? Math.floor(r.next() * 6), ...(LIBRARY[key].blocks ? { fills: [x, y, w, h] as [number, number, number, number] } : {}) });
    return true;
  };
  const lite = tier === "lite";
  let [x0, y0, w, h] = [rect.x, rect.y, rect.width, rect.height];
  // A hedge round a garden that is big enough, with a gap for a path every so often
  if (w >= 6 && h >= 6) {
    const gap = (i: number) => i % 8 >= 6;
    for (let i = 0; i < w; i++) for (const y of [y0, y0 + h - 1]) if (!gap(i) && !(i === 0 || i === w - 1)) put("hedge", x0 + i, y, { v: i });
    for (let j = 0; j < h; j++) for (const x of [x0, x0 + w - 1]) if (!gap(j) && !(j === 0 || j === h - 1)) put("hedge", x, y0 + j, { v: j });
    for (const [x, y] of [[x0, y0], [x0 + w - 1, y0], [x0, y0 + h - 1], [x0 + w - 1, y0 + h - 1]]) put("topiary", x, y, { v: x + y });
    [x0, y0, w, h] = [x0 + 1, y0 + 1, w - 2, h - 2];
  }
  // The centre of it: a fountain with beds and benches round it, or a statue
  const cx = Math.floor(x0 + w / 2);
  const cy = Math.floor(y0 + h / 2);
  if (w >= 7 && h >= 7) {
    put("fountain", cx - 1, cy - 1);
    for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) put("flowerbed", cx + dx, cy + dy, { v: dx + dy });
    put("bench", cx - 1, cy + 3, { rot: 0 });
    put("bench", cx - 1, cy - 4, { rot: Math.PI });
  } else if (w >= 4 && h >= 4) {
    put("statue", cx, cy, { v: cx + cy });
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put("flowerbed", cx + dx, cy + dy, { v: dx + dy });
  }
  // Lamps, urns and statues along the edge
  for (let i = 1; i < w - 1; i += 6) {
    put("lamp", x0 + i, y0);
    put("lamp", x0 + i, y0 + h - 1);
  }
  const area = w * h;
  for (let i = 0; i < Math.floor(area / 160); i++) put("statue", x0 + 1 + Math.floor(r.next() * Math.max(1, w - 2)), y0 + 1 + Math.floor(r.next() * Math.max(1, h - 2)), { v: i + 3 });
  if (!lite) for (let i = 0; i < Math.floor(area / 40); i++) put("urn", x0 + Math.floor(r.next() * w), y0 + Math.floor(r.next() * h));
  // Trees, spaced apart, then shrubs and flowerbeds between them
  const trees = TREES[biome] ?? TREES.temperate;
  const spots: { x: number; y: number }[] = [];
  const want = Math.round(area / (lite ? 34 : 18));
  for (let tries = 0; tries < want * 6 && spots.length < want; tries++) {
    const x = x0 + Math.floor(r.next() * w);
    const y = y0 + Math.floor(r.next() * h);
    if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < 3) || !free(x, y)) continue;
    if (put(r.pick(trees), x, y, { rot: r.next() * Math.PI * 2, scale: 0.85 + r.next() * 0.35 })) spots.push({ x, y });
  }
  for (let i = 0; i < Math.round(area / (lite ? 40 : 22)); i++) put("shrub", x0 + Math.floor(r.next() * w), y0 + Math.floor(r.next() * h), { scale: 0.8 + r.next() * 0.5 });
  if (!lite) for (let i = 0; i < Math.round(area / 26); i++) put("flowerbed", x0 + Math.floor(r.next() * w), y0 + Math.floor(r.next() * h));
  return out;
}

// ---------------------------------------------------------------------------------------------
// The ground of a settlement (2026-10-19): the trees, boulders, shrubs and ground cover the speeder
// races are dressed with, set on the open ground between and round the buildings. Pure layouts, the
// same from the same seed. Trees and boulders block (and are kept apart, and clear of the ways in,
// the signs and the streets, so that no one is shut in); the rest is only to be seen.
// ---------------------------------------------------------------------------------------------

// One tree for this many squares of open ground, and one boulder, by world
const GROWTH: Record<string, { tree: number; rock: number }> = {
  temperate: { tree: 70, rock: 220 }, forest: { tree: 40, rock: 240 }, jungle: { tree: 32, rock: 280 }, swamp: { tree: 80, rock: 320 },
  desert: { tree: 230, rock: 170 }, ice: { tree: 260, rock: 190 }, volcanic: { tree: 420, rock: 130 }, barren: { tree: 380, rock: 150 },
  urban: { tree: 300, rock: 650 }, ocean: { tree: 120, rock: 320 }, "gas giant": { tree: 300, rock: 650 },
};
const BLOCKING_CAP = 130;
const wildOf = (biome: string) => WILD[biome === "gas giant" ? "urban" : biome] ?? WILD.temperate;
const sizeFor = (r: ReturnType<typeof createRandom>, key: string) => (LIBRARY[key].size[0] > 1 || LIBRARY[key].size[1] > 1 ? 0.9 + r.next() * 0.15 : 0.85 + r.next() * 0.35);

// The trees and boulders of a settlement's open ground. `free` says whether a square is open ground
// that may be built on. They do not depend on the picture quality, because what blocks must not.
export function ambientBlockers(rect: Rect, seed: string, biome: string, free: (x: number, y: number) => boolean): Placed[] {
  const r = createRandom(Math.floor(unitOf(`${seed}|ambient`) * 1e9));
  const grown = GROWTH[biome] ?? GROWTH.temperate;
  const wild = wildOf(biome);
  const area = rect.width * rect.height;
  const trees = wild.trees.filter((k) => LIBRARY[k]?.blocks);
  const rocks = wild.boulders.filter((k) => LIBRARY[k]?.blocks);
  const wants: [string[], number][] = [[trees, Math.round(area / grown.tree)], [rocks, Math.round(area / grown.rock)]];
  const total = wants.reduce((n, [, w]) => n + w, 0);
  const out: Placed[] = [];
  const used = new Set<string>();
  const centres: { x: number; y: number }[] = [];
  for (const [keys, wanted] of wants) {
    const want = total > BLOCKING_CAP ? Math.round((wanted * BLOCKING_CAP) / total) : wanted;
    if (!keys.length) continue;
    let placed = 0;
    for (let tries = 0; tries < want * 10 && placed < want; tries++) {
      const key = r.pick(keys);
      const [w, h] = LIBRARY[key].size;
      const x = rect.x + r.int(0, Math.max(0, rect.width - w));
      const y = rect.y + r.int(0, Math.max(0, rect.height - h));
      let ok = true;
      for (let j = 0; ok && j < h; j++) for (let i = 0; ok && i < w; i++) if (used.has(`${x + i},${y + j}`) || !free(x + i, y + j)) ok = false;
      // Far enough from the others that a way between any two is two squares wide at least
      if (!ok || centres.some((c) => Math.hypot(c.x - (x + w / 2), c.y - (y + h / 2)) < 4 + (w - 1))) continue;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used.add(`${x + i},${y + j}`);
      centres.push({ x: x + w / 2, y: y + h / 2 });
      out.push({ key, x: x + w / 2, y: y + h / 2, rot: r.next() * Math.PI * 2, scale: sizeFor(r, key), v: Math.floor(r.next() * 6), fills: [x, y, w, h] });
      placed++;
    }
  }
  return out;
}

// What grows low between them: shrubs, ferns, small rocks, grass, flowers and reeds, none of which
// is in anyone's way. `free` is as above, and also true of the squares the blockers fill.
export function ambientCover(rect: Rect, seed: string, biome: string, tier: Tier, free: (x: number, y: number) => boolean): Placed[] {
  const r = createRandom(Math.floor(unitOf(`${seed}|cover`) * 1e9));
  const wild = wildOf(biome);
  const keys = [...wild.shrubs, ...wild.cover].filter((k) => LIBRARY[k] && !LIBRARY[k].blocks);
  if (!keys.length) return [];
  const want = Math.min(tier === "lite" ? 150 : 420, Math.round((rect.width * rect.height) / (tier === "lite" ? 55 : 24)));
  const out: Placed[] = [];
  for (let tries = 0; tries < want * 5 && out.length < want; tries++) {
    const x = rect.x + r.int(0, rect.width - 1);
    const y = rect.y + r.int(0, rect.height - 1);
    if (!free(x, y)) continue;
    out.push({ key: r.pick(keys), x: x + 0.15 + r.next() * 0.7, y: y + 0.15 + r.next() * 0.7, rot: r.next() * Math.PI * 2, scale: 0.8 + r.next() * 0.5, v: Math.floor(r.next() * 6) });
  }
  return out;
}

// A belt of trees, boulders and shrubs beyond the ground that can be walked on, only to be seen
export function ambientBackdrop(rect: Rect, belt: number, seed: string, biome: string, tier: Tier): Placed[] {
  const r = createRandom(Math.floor(unitOf(`${seed}|backdrop`) * 1e9));
  const wild = wildOf(biome);
  const keys = [...wild.trees, ...wild.trees, ...wild.boulders, ...wild.shrubs].filter((k) => LIBRARY[k]);
  if (!keys.length) return [];
  const want = tier === "lite" ? 80 : 220;
  const out: Placed[] = [];
  for (let tries = 0; tries < want * 6 && out.length < want; tries++) {
    const x = rect.x - belt + r.next() * (rect.width + belt * 2);
    const y = rect.y - belt + r.next() * (rect.height + belt * 2);
    if (x > rect.x - 1 && x < rect.x + rect.width + 1 && y > rect.y - 1 && y < rect.y + rect.height + 1) continue;
    out.push({ key: r.pick(keys), x, y, rot: r.next() * Math.PI * 2, scale: 1 + r.next() * 0.6, v: Math.floor(r.next() * 6) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Drawing many copies of a piece in a call or two
// ---------------------------------------------------------------------------------------------

function Instanced({ id, build, items, file }: { id: string; build: (k: Kit) => void; items: Placed[]; file?: THREE.BufferGeometry | null }) {
  const made = useModel(id, build);
  const baked = useMemo(() => (file ? { matte: file } : made), [file, made]);
  const refs = useRef<Partial<Record<Finish, THREE.InstancedMesh | null>>>({});
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const f of FINISHES) {
      const mesh = refs.current[f];
      if (!mesh) continue;
      items.forEach((it, i) => {
        m.compose(pos.set(it.x, it.h ?? 0, it.y), q.setFromEuler(e.set(0, it.rot, 0)), sc.setScalar(it.scale));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [items, baked]);
  return (
    <>
      {FINISHES.map((f) =>
        baked[f] ? (
          <instancedMesh key={`${f}-${items.length}`} ref={(mesh) => { refs.current[f] = mesh; }} args={[baked[f]!, MATERIALS[f], items.length]} castShadow={SOLID_FINISHES.has(f)} receiveShadow={SOLID_FINISHES.has(f)} frustumCulled={false} raycast={() => null} />
        ) : null,
      )}
    </>
  );
}

// The pieces of a site, set out: grouped by kind and drawn in one go each
export function Scatter({ placed, biome }: { placed: Placed[]; biome: string }) {
  const palette = paletteOf(biome);
  const groups = useMemo(() => {
    const by = new Map<string, Placed[]>();
    for (const it of placed) {
      const key = `${it.key}:${it.v % 3}`;
      by.set(key, [...(by.get(key) ?? []), it]);
    }
    return [...by.entries()];
  }, [placed]);
  return (
    <>
      {groups.map(([key, items]) => (
        <Group key={key} name={key.split(":")[0]} v={Number(key.split(":")[1])} items={items} biome={biome} palette={palette} />
      ))}
    </>
  );
}
// The parts of a plant or stone in its palette's bark, leaves and stone are drawn with their textures (surfaces.tsx); its flowers stay flat
const plantSurfaces = (p: Palette): Partial<Record<string, Finish>> => ({ [p.bark]: "bark", [p.leaf]: "leaf", [p.leaf2]: "leaf", [p.stone]: "stone" });
const SOLID_FINISHES = new Set<Finish>(["matte", "sheen", "stone", "bark", "leaf"]);
function Group({ name, v, items, biome, palette }: { name: string; v: number; items: Placed[]; biome: string; palette: Palette }) {
  const piece = LIBRARY[name];
  const file = useFile(piece.gltf);
  return <Instanced id={`site:${name}:${v}:${biome}`} build={(k) => { k.surfaces = plantSurfaces(palette); piece.build(k, palette, v); }} items={items} file={file} />;
}

// ---------------------------------------------------------------------------------------------
// A curtain wall: stone runs with a toothed parapet, round towers at the corners and by the gates
// ---------------------------------------------------------------------------------------------

function wallRun(k: Kit, len: number, stone: string) {
  k.box([len, 2.2, 0.8], stone, { at: [len / 2, 1.1, 0], round: 0.05 });
  k.box([len, 0.1, 1.0], shade(stone, 0.85), { at: [len / 2, 2.25, 0], round: 0.02 });
  const teeth = Math.max(1, Math.floor(len / 0.9));
  for (let i = 0; i < teeth; i++) {
    k.box([0.5, 0.36, 0.26], shade(stone, 0.92), { at: [(i + 0.5) * (len / teeth), 2.5, 0.38], round: 0.02 });
    k.box([0.5, 0.36, 0.26], shade(stone, 0.92), { at: [(i + 0.5) * (len / teeth), 2.5, -0.38], round: 0.02 });
  }
  for (let i = 0; i < Math.floor(len / 3); i++) k.box([0.1, 0.34, 0.04], "#2a2a2a", { at: [1.5 + i * 3, 1.5, 0.42] });
}
function wallTower(k: Kit, stone: string, roof: string) {
  k.lathe([[0.95, 0], [0.95, 0.12], [0.88, 0.2], [0.82, 3.1], [1.02, 3.2], [1.02, 3.55], [0.9, 3.6], [0.9, 3.4]], stone, { seg: 16 });
  k.cone(1.0, 1.1, roof, { at: [0, 4.15, 0], seg: 16 });
  k.sphere(0.07, C.gold, { at: [0, 4.78, 0], seg: [6, 5], finish: "sheen" });
  for (let i = 0; i < 4; i++) k.box([0.14, 0.3, 0.04], "#ffd98a", { at: [Math.sin(i * 1.571) * 0.86, 2.2, Math.cos(i * 1.571) * 0.86], rot: [0, i * 1.571, 0], finish: "glow" });
}

export function CurtainWall({ wall, biome }: { wall: NonNullable<SiteGrounds["wall"]>; biome: string }) {
  const stone = paletteOf(biome).stone;
  const roof = paletteOf(biome).canvas[0];
  const runs: { x: number; y: number; len: number; turn: number }[] = [];
  const towers: { x: number; y: number }[] = [];
  const { x, y, width, height } = wall;
  // (a run is drawn along x from its start; those down the sides are turned a quarter)
  for (const side of ["n", "s", "w", "e"] as const) {
    const length = side === "n" || side === "s" ? width : height;
    const gates = wall.gates.filter((g) => g.side === side).sort((a, b) => a.at - b.at);
    let from = 0;
    for (const end of [...gates.map((g) => [g.at, g.at + g.width] as const), [length, length] as const]) {
      if (end[0] > from) {
        const len = end[0] - from;
        if (side === "n") runs.push({ x: x + from, y: y + 0.5, len, turn: 0 });
        else if (side === "s") runs.push({ x: x + from, y: y + height - 0.5, len, turn: 0 });
        else if (side === "w") runs.push({ x: x + 0.5, y: y + from, len, turn: Math.PI / 2 });
        else runs.push({ x: x + width - 0.5, y: y + from, len, turn: Math.PI / 2 });
      }
      from = end[1];
    }
    for (const g of gates) {
      const [a, b] = [g.at - 0.2, g.at + g.width + 0.2];
      const at = (t: number): [number, number] => (side === "n" ? [x + t, y + 0.5] : side === "s" ? [x + t, y + height - 0.5] : side === "w" ? [x + 0.5, y + t] : [x + width - 0.5, y + t]);
      towers.push({ x: at(a)[0], y: at(a)[1] }, { x: at(b)[0], y: at(b)[1] });
    }
  }
  for (const [tx, ty] of [[x + 0.5, y + 0.5], [x + width - 0.5, y + 0.5], [x + 0.5, y + height - 0.5], [x + width - 0.5, y + height - 0.5]]) towers.push({ x: tx, y: ty });
  return (
    <>
      {runs.map((run, i) => (
        <Model key={i} id={`cwall:${Math.round(run.len * 10)}:${stone}`} build={(k) => { k.surfaces = { [stone]: "stone" }; wallRun(k, run.len, stone); }} position={[run.x, 0, run.y]} rotation={[0, run.turn ? -Math.PI / 2 : 0, 0]} />
      ))}
      {towers.map((t, i) => (
        <Model key={`t${i}`} id={`ctower:${stone}:${roof}`} build={(k) => { k.surfaces = { [stone]: "stone" }; wallTower(k, stone, roof); }} position={[t.x, 0, t.y]} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Market stalls: open with their wares out, being packed up, or packed away
// ---------------------------------------------------------------------------------------------

export type StallState = "open" | "packing" | "packed";
export const stallState = (marketType: string, minutes: number): StallState => {
  const p = packedness(marketType, minutes);
  return p <= 0.01 ? "open" : p >= 0.99 ? "packed" : "packing";
};

function stallWares(k: Kit, trade: string, seed: number) {
  const pick = <T,>(list: T[], i: number) => list[(i + seed) % list.length];
  if (trade === "arms") {
    k.box([2.0, 0.5, 0.06], C.black, { at: [0, 1.0, -0.4], round: 0.02, finish: "sheen" });
    for (let i = 0; i < 6; i++) k.rod([-0.85 + i * 0.34, 0.7, -0.36], [-0.85 + i * 0.34, 1.2, -0.36], 0.025, pick([C.steelDark, C.black, "#6b4f36"], i), { finish: "sheen" });
    k.box([0.3, 0.3, 0.22], C.steel, { at: [0.7, 0.7, 0.1], round: 0.05, finish: "sheen" });
  } else if (trade === "tech") {
    for (let i = 0; i < 4; i++) k.box([0.3, 0.2, 0.24], pick([C.steelDark, C.steel, "#3d4856"], i), { at: [-0.8 + i * 0.5, 0.67, 0.0], round: 0.03, finish: "sheen" });
    k.box([0.4, 0.26, 0.04], C.glow, { at: [0.4, 0.95, -0.2], rot: [-0.5, 0, 0], finish: "glow" });
    k.sphere(0.13, C.steelLight, { at: [-0.4, 0.88, 0.1], finish: "sheen" });
  } else if (trade === "medical") {
    for (let i = 0; i < 3; i++) k.box([0.34, 0.22, 0.28], C.white, { at: [-0.7 + i * 0.5, 0.68, 0.0], round: 0.03 });
    k.box([0.1, 0.02, 0.02], C.red, { at: [-0.7, 0.8, 0.15], finish: "glow" });
    for (let i = 0; i < 5; i++) k.cyl(0.04, 0.2, pick([C.glow, C.green, C.amber], i), { at: [0.2 + i * 0.14, 0.7, 0.05], seg: 6, finish: "glass" });
  } else if (trade === "outfit") {
    for (let i = 0; i < 5; i++) k.box([0.07, 0.6, 0.32], pick(["#7d3b4a", "#3a6a9a", "#c9a56e", "#4f6b4a", "#e8dcc0"], i), { at: [-0.8 + i * 0.4, 1.0, -0.2], finish: "cloth" });
    k.box([0.5, 0.18, 0.4], "#e8dcc0", { at: [0.6, 0.67, 0.05], round: 0.05 });
  } else if (trade === "leisure") {
    for (let i = 0; i < 3; i++) {
      k.capsule(0.12, 0.2, C.wood, { at: [-0.7 + i * 0.5, 0.78, 0.02], rot: [0, 0, 0.3 * (i - 1)], finish: "sheen" });
      k.rod([-0.7 + i * 0.5, 0.88, 0.02], [-0.7 + i * 0.5 + 0.1 * (i - 1), 1.4, 0.0], 0.02, C.woodDark);
    }
    k.box([0.5, 0.04, 0.4], "#2f6b4a", { at: [0.7, 0.62, 0.05] });
  } else if (trade === "black") {
    for (let i = 0; i < 4; i++) k.box([0.34, 0.26, 0.3], C.black, { at: [-0.8 + i * 0.5, 0.69, 0.0], round: 0.03, finish: "sheen" });
    k.box([0.2, 0.04, 0.02], C.red, { at: [0.4, 0.78, 0.17], finish: "glow" });
  } else {
    for (let i = 0; i < 4; i++) k.blob(0.16, pick(["#c8663a", "#9fbf5a", "#d6a85a", "#a1495a"], i), { at: [-0.75 + i * 0.5, 0.7, 0.02], smooth: true, rough: 0.15, seed: i + seed, squash: [1, 0.8, 1] });
    k.cyl(0.14, 0.3, C.wood, { at: [0.6, 0.77, 0.15], seg: 10 });
  }
}

function buildStall(k: Kit, state: StallState, trade: string, canvas: string, seed: number) {
  // Faces +z: the counter is on that side, the keeper stands behind it. 3 squares wide, 2 deep.
  if (state === "packed") {
    // Canopy rolled up on the poles, laid along the counter; wares in crates, stacked
    k.box([2.6, 0.5, 0.7], C.woodDark, { at: [0, 0.25, 0.1], round: 0.04 });
    k.box([2.7, 0.06, 0.8], C.wood, { at: [0, 0.53, 0.1], round: 0.02, finish: "sheen" });
    k.cyl(0.16, 2.6, canvas, { at: [0, 0.74, 0.1], rot: [0, 0, Math.PI / 2], seg: 12, finish: "cloth" });
    for (let i = 0; i < 3; i++) k.box([0.5, 0.4, 0.4], C.wood, { at: [-0.9 + i * 0.9, 0.2, -0.55], round: 0.03 });
    k.box([0.5, 0.36, 0.4], shade(C.wood, 0.85), { at: [0, 0.58, -0.55], round: 0.03 });
    return;
  }
  k.box([2.6, 0.52, 0.7], C.woodDark, { at: [0, 0.26, 0.35], round: 0.04 });
  k.box([2.7, 0.05, 0.8], C.wood, { at: [0, 0.54, 0.35], round: 0.02, finish: "sheen" });
  for (const x of [-1.3, 1.3]) for (const z of [-0.35, 0.7]) k.cyl(0.035, 1.7, C.wood, { at: [x, 0.85, z], seg: 6 });
  k.cyl(0.9, 2.8, canvas, { at: [0, 1.5, 0.15], rot: [0, 0, Math.PI / 2], arc: Math.PI * 0.62, start: Math.PI / 2 - Math.PI * 0.31, seg: 18, open: true, finish: "cloth" });
  if (state === "packing") {
    // The wares are in crates, some stacked up at the back
    for (let i = 0; i < 3; i++) k.box([0.46, 0.34, 0.4], C.wood, { at: [-0.8 + i * 0.8, 0.72, 0.4], round: 0.03 });
    for (let i = 0; i < 2; i++) k.box([0.5, 0.4, 0.42], shade(C.wood, 0.85), { at: [-0.5 + i * 1.0, 0.2, -0.45], round: 0.03 });
    return;
  }
  k.group([0, 0, 0.35], undefined, undefined, () => stallWares(k, trade, seed));
}

export function StallModel({ trade, state, canvas, seed = 0 }: { trade: string; state: StallState; canvas: string; seed?: number }) {
  // (a packed stall is the same whatever it sold)
  const sold = state === "packed" ? "-" : trade;
  return <Model id={`stall:${sold}:${state}:${canvas}:${seed % 4}`} build={(k) => buildStall(k, state, trade, canvas, seed)} />;
}

// ---------------------------------------------------------------------------------------------
// A site's whole open ground
// ---------------------------------------------------------------------------------------------

// Everything a site lays out, worked out once from its plan: the pieces set in its gardens, and the
// squares that nothing can be walked through (the wall, the stalls, the pieces that block)
export interface Fixtures {
  placed: Placed[];
  blocked: Set<string>;
  // The stall each stands at, facing the lane
  stalls: { id: string; x: number; y: number; w: number; h: number; trade: string; south: boolean; canvas: string }[];
}
export function fixturesOf(plan: DistrictPlan | undefined, biome: string, tier: Tier): Fixtures {
  const out: Fixtures = { placed: [], blocked: new Set(), stalls: [] };
  const g = plan?.grounds;
  if (!plan || !g) return out;
  const palette = paletteOf(biome);
  if (g.wall) {
    const w = g.wall;
    const gap = (side: string, along: number) => w.gates.some((gt) => gt.side === side && along >= gt.at && along < gt.at + gt.width);
    for (let i = 0; i < w.width; i++) {
      if (!gap("n", i)) out.blocked.add(`${w.x + i},${w.y}`);
      if (!gap("s", i)) out.blocked.add(`${w.x + i},${w.y + w.height - 1}`);
    }
    for (let j = 0; j < w.height; j++) {
      if (!gap("w", j)) out.blocked.add(`${w.x},${w.y + j}`);
      if (!gap("e", j)) out.blocked.add(`${w.x + w.width - 1},${w.y + j}`);
    }
  }
  const lanes = (x: number, y: number) => out.blocked.has(`${x},${y}`);
  for (const [i, rect] of (g.gardens ?? []).entries()) {
    for (const it of plantGarden(rect, `${plan.id}|garden|${i}`, biome, tier, lanes)) {
      out.placed.push(it);
      if (it.fills) for (let j = 0; j < it.fills[3]; j++) for (let q = 0; q < it.fills[2]; q++) out.blocked.add(`${it.fills[0] + q},${it.fills[1] + j}`);
    }
  }
  for (const [i, s] of (g.stalls ?? []).entries()) {
    out.stalls.push({ ...s, south: s.y + s.h / 2 < plan.height / 2, canvas: palette.canvas[i % palette.canvas.length] });
    for (let j = 0; j < s.h; j++) for (let q = 0; q < s.w; q++) out.blocked.add(`${s.x + q},${s.y + j}`);
  }
  return out;
}

// Where the stallholder stands: behind the counter, on the side away from the lane
export const keeperSpot = (s: Fixtures["stalls"][number]) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 + (s.south ? -0.2 : 0.2) });

// Lawn and gravel under a site's gardens: flat patches, one mesh each
export function GardenGround({ rects, biome }: { rects: NonNullable<SiteGrounds["gardens"]>; biome: string }) {
  const p = paletteOf(biome);
  return (
    <>
      {rects.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[r.x + r.width / 2, 0.012, r.y + r.height / 2]} raycast={() => null}>
          <planeGeometry args={[r.width, r.height]} />
          <meshLambertMaterial color={mix(p.lawn, "#000000", 0.05 * (i % 3))} />
        </mesh>
      ))}
    </>
  );
}

// The ground round a building (2026-10-21): a Poly Haven texture (public/textures/ground, see the README there), lit by its normal
// map and shifted toward the viewer by its height map (single-step offset parallax). The city has none of it: it keeps the plain ground
export const GROUND_TILE = 8; // squares of ground in one repeat of a texture
const EARTH_LIGHT = 1.2; // how bright the bare earth is (1 leaves the texture as photographed)
const PARALLAX = 0.065; // how far the height map moves the texture, in repeats of GROUND_TILE squares (0.05 and then 30% more, the user, 2026-10-21)
const NORMAL_SCALE = new THREE.Vector2(1.3, 1.3); // how steep the normal map reads (1 as photographed, 30% more)

// Which texture a building's ground gets, by its world's biome and the building's type (null: plain ground, as on Coruscant)
export function groundTexture(biome: string, buildingType: string, base: string): { set: string; tint: THREE.Color; parallax: number } | null {
  if (buildingType === "sewer system") return { set: "brown_mud_03", tint: new THREE.Color("#ffffff"), parallax: PARALLAX };
  if (biome === "urban") return null;
  if (biome === "desert") return { set: "dense_sand", tint: new THREE.Color("#ffffff"), parallax: PARALLAX };
  if (biome === "volcanic") return { set: "dark_rock", tint: new THREE.Color(3, 3, 3), parallax: PARALLAX };
  if (biome === "ice") return { set: "snow_02", tint: new THREE.Color("#ffffff"), parallax: PARALLAX };
  if (biome === "barren") return { set: "rocks_ground_02", tint: new THREE.Color("#ffffff"), parallax: PARALLAX };
  // Forest, jungle and the rest: bare earth in the hue of the world's ground. The texture is dark already, so the tint keeps the hue at
  // full strength (half washed toward white) instead of darkening it with the ground colour, which made it black
  const hue = new THREE.Color(base);
  hue.multiplyScalar(1 / Math.max(hue.r, hue.g, hue.b, 0.001)).lerp(new THREE.Color("#ffffff"), 0.5);
  return { set: "dirt_floor", tint: hue.multiplyScalar(EARTH_LIGHT), parallax: PARALLAX };
}

export function GroundSurface({ set, tint, parallax, w, h, at, onTap }: { set: string; tint: THREE.Color; parallax: number; w: number; h: number; at: [number, number, number]; onTap?: (e: ThreeEvent<MouseEvent>) => void }) {
  const [diffuse, normal, height] = useTexture([`/textures/ground/${set}/diffuse.jpg`, `/textures/ground/${set}/normal.jpg`, `/textures/ground/${set}/height.jpg`]);
  // The three maps share one repeat, so a shift found in the height map lines up on the others
  const maps = useMemo(() => {
    const repeat = (t: THREE.Texture) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(w / GROUND_TILE, h / GROUND_TILE);
      c.needsUpdate = true;
      return c;
    };
    const d = repeat(diffuse);
    d.colorSpace = THREE.SRGBColorSpace;
    return { diffuse: d, normal: repeat(normal), height: repeat(height) };
  }, [diffuse, normal, height, w, h]);
  const compile = (shader: THREE.WebGLProgramParametersWithUniforms) => groundShader(shader, maps.height, parallax);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={at} receiveShadow onClick={onTap}>
      <planeGeometry args={[w, h]} />
      <meshPhongMaterial map={maps.diffuse} normalMap={maps.normal} color={tint} specular="#000000" shininess={0} normalScale={NORMAL_SCALE} onBeforeCompile={compile} />
    </mesh>
  );
}

// The floors of rooms and roofs (2026-10-21): the same lit, shifted texture as the ground, from public/textures/floor, laid over the
// flat slab of a room (which stays as what shows while the maps load). `tile` is the squares in one repeat; `tint` multiplies the
// photograph (dark sets are brought up, the plating is a steel version of the metal plate, made by tools/build-hull-textures.mjs)
// `dir` is the folder under public/textures the set is in: the floors ("floor") or the ground's sets ("ground"), which the sand and rock floors share
export type FloorLook = { set: string; tint: THREE.Color; tile: number; parallax: number; dir: "floor" | "ground" };
const FLOOR_PARALLAX = 0.04;
const floorSet = (set: string, tile: number, tint: string | THREE.Color = "#ffffff", parallax = FLOOR_PARALLAX, dir: "floor" | "ground" = "floor"): FloorLook => ({ set, tile, tint: new THREE.Color(tint), parallax, dir });

// What a room's floor is made of, by the floor kind its building gives it (sprites.tsx floorOf), the building's type and whether it is a roof
export function floorLook(kind: string, buildingType = "", roof = false): FloorLook | null {
  if (roof) return floorSet("concrete_floor_worn_02", 6, "#ffffff", 0.03);
  switch (kind) {
    case "plating": return floorSet("deck_plate", 3);
    case "hangar": return floorSet("hangar_concrete_floor", 6, new THREE.Color(2.4, 2.4, 2.5), 0.03);
    case "sand": return floorSet("dense_sand", GROUND_TILE, "#ffffff", PARALLAX, "ground");
    case "rock": return floorSet("dark_rock", GROUND_TILE, new THREE.Color(3, 3, 3), PARALLAX, "ground");
    case "stone": return /ruin/.test(buildingType) ? floorSet("stone_tiles", 4, new THREE.Color(1.6, 1.6, 1.6)) : floorSet("marble_tiles", 4, "#d8d2c6", 0.02);
    case "clay": return /market|gate/.test(buildingType) ? floorSet("terracotta_floor_tiles", 4, new THREE.Color(1.5, 1.5, 1.5), 0.02) : floorSet("dirty_carpet", 3, new THREE.Color(2.3, 2.1, 1.9), 0.05);
    default: return null;
  }
}

// A floor of a room laid flat at `y` over its footprint (w by h squares, corners rounded by `radii`, centred on the point it stands at,
// so that a tap lands as it does on the slab under it)
export function FloorSurface({ look: { set, tint, tile, parallax, dir }, w, h, radii, y = 0.004, onTap }: { look: FloorLook; w: number; h: number; radii: [number, number, number, number]; y?: number; onTap?: (e: ThreeEvent<MouseEvent>) => void }) {
  const [diffuse, normal, height] = useTexture([`/textures/${dir}/${set}/diffuse.jpg`, `/textures/${dir}/${set}/normal.jpg`, `/textures/${dir}/${set}/height.jpg`]);
  // (the outline's own coordinates are the texture's, so a repeat is 1 / tile)
  const maps = useMemo(() => {
    const repeat = (t: THREE.Texture) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(1 / tile, 1 / tile);
      c.anisotropy = 4;
      c.needsUpdate = true;
      return c;
    };
    const d = repeat(diffuse);
    d.colorSpace = THREE.SRGBColorSpace;
    return { diffuse: d, normal: repeat(normal), height: repeat(height) };
  }, [diffuse, normal, height, tile]);
  const geometry = useMemo(() => {
    const g = new THREE.ShapeGeometry(planRect(w, h, radii));
    g.rotateX(-Math.PI / 2);
    return g;
  }, [w, h, radii.join(",")]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const compile = (shader: THREE.WebGLProgramParametersWithUniforms) => groundShader(shader, maps.height, parallax);
  return (
    <mesh geometry={geometry} position={[w / 2, y, h / 2]} receiveShadow onClick={onTap}>
      <meshPhongMaterial map={maps.diffuse} normalMap={maps.normal} color={tint} specular="#000000" shininess={0} normalScale={NORMAL_SCALE} onBeforeCompile={compile} />
    </mesh>
  );
}
