import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { create } from "zustand";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, Model, useModel, C, shade, mix, FINISHES, MATERIALS, planRect, LampLight, ArchPiece, type V3, type Finish, type Baked } from "./models";
import { treeVillageSpots, villagePieces, VILLAGE_DEPTH } from "./interiors/architecture";
import { groundShader, surfaceMaterial, wallMaterial, SURFACE_GRAIN, type WallSet } from "./surfaces";
import type { PackId } from "./interiors/packs";
import { setRenderTier, shaderPatch } from "./babylon";
import { biomeSky, createRandom, unitOf, packedness, type SiteGrounds, type DistrictPlan, type PropHit, type RaceScenery } from "@shared/logic";

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
// The Babylon renderer draws its shadows and lights by the same tier
setRenderTier(useQuality.getState().tier);
useQuality.subscribe((s) => setRenderTier(s.tier));

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
  // A plainer model for the instances far from the camera (trees: see `Instanced`)
  far?: Build;
  // A model made elsewhere, under client/public (see above)
  gltf?: string;
}

// A conifer (2026-11-03): a solid trunk to the top and whorls of branches radiating from it, each a pair of cards drawn with a spray of
// needles (the finish "needle"), longest at the foot and drooping, shorter and more upright toward the top, a tuft on the leader
// (`fuller` puts more branches in a whorl, for the bigger sizes)
// (a tree's far model, for the instances far from the camera, is the same tree in about a fifth of the geometry: half the whorls, three in
// five of the branches, one card to a branch, a third of the leaf clumps, coarser; `farModel` is set while it is built)
let farModel = false;
function conifer(k: Kit, p: Palette, v: number, height: number, reach: number, fullTiers: number, trunk: number, fuller = 1) {
  const tiers = farModel ? Math.max(5, Math.round(fullTiers / 2)) : fullTiers;
  k.cyl(trunk, height, p.bark, { at: [0, height / 2, 0], top: trunk * 0.18, seg: farModel ? 5 : 7 });
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = height * (0.12 + f * 0.8);
    const length = reach * (1 - f * 0.85) + 0.18;
    const count = Math.max(farModel ? 4 : 5, Math.round((9 - f * 4) * fuller * (farModel ? 0.6 : 1)));
    const colour = t % 2 ? p.leaf2 : shade(p.leaf, 0.92);
    for (let j = 0; j < count; j++) {
      const az = (j / count) * Math.PI * 2 + t * 0.9 + v * 0.7 + Math.sin(t * 7 + j * 3) * 0.2;
      const droop = 0.75 - f * 0.45 + Math.sin(j * 5 + t) * 0.1;
      if (farModel) {
        k.spray(length, length * 1.1, colour, [0, y, 0], az, droop, 0);
        continue;
      }
      k.spray(length, length * 0.85, colour, [0, y, 0], az, droop, 0.4);
      k.spray(length, length * 0.85, colour, [0, y, 0], az, droop, -0.4);
    }
  }
  const tuft = Math.sqrt(height / 3);
  k.spray(0.55 * tuft, 0.4 * tuft, p.leaf, [0, height - 0.12, 0], 0, -Math.PI / 2, 0);
  if (!farModel) k.spray(0.55 * tuft, 0.4 * tuft, p.leaf, [0, height - 0.12, 0], 0, -Math.PI / 2, Math.PI / 2);
}

// A crown of leaves (2026-11-03, the user: smaller leaf meshes and more of them): many small clumps spread through a flattened ball,
// thinner toward its surface, so that light and sky show between them (the leaf finish is cut out as well)
function crown(k: Kit, p: Palette, v: number, at: V3, radius: number, clumps: number, clump: number) {
  for (let i = 0; i < clumps; i++) {
    const y = 1 - 2 * ((i + 0.5) / clumps);
    const ring = Math.sqrt(1 - y * y);
    const a = i * 2.39996 + v;
    const d = radius * (0.55 + 0.45 * ((i * 0.618 + v * 0.13) % 1));
    k.blob(clump * (0.85 + 0.3 * ((i * 0.37) % 1)) * (farModel ? 1.6 : 1), i % 3 ? p.leaf : p.leaf2, { at: [at[0] + Math.cos(a) * ring * d, at[1] + y * d * 0.75, at[2] + Math.sin(a) * ring * d], seed: v + i, rough: 0.3, smooth: true, squash: [1, 0.8, 1], detail: farModel ? 0 : undefined });
  }
}
// A deciduous tree: a trunk, branches radiating from its upper part (more on a bigger tree), a cluster of leaves at the end of each and
// the rest round the top. `s` is the size against the smallest (1); the base says what the smallest is like.
interface Broad { trunk: number; crownY: number; radius: number; girth: number }
function broadleaf(k: Kit, p: Palette, v: number, s: number, base: Broad, branches: number, allClumps: number) {
  const clumps = farModel ? Math.round(allClumps / 3) : allClumps;
  const top = base.trunk * s, g = base.girth * s ** 0.8, rad = base.radius * s, cy = base.crownY * s;
  k.lathe([[g, 0], [g * 0.75, top * 0.21], [g * 0.5, top * 0.74], [g * 0.3, top]], p.bark, { seg: 8 });
  const clump = 0.2;
  const inTips = branches ? Math.round(clumps * 0.6) : 0;
  for (let j = 0; j < branches; j++) {
    const az = j * 2.4 + v;
    const reach = rad * (0.6 + 0.25 * ((j * 0.61) % 1));
    const from: V3 = [0, top * (0.5 + 0.4 * ((j * 0.37) % 1)), 0];
    const tip: V3 = [Math.cos(az) * reach, cy + rad * 0.2 * Math.sin(j * 2.1), Math.sin(az) * reach];
    k.rod(from, tip, 0.045 * s ** 0.7, p.bark, { seg: farModel ? 4 : 6 });
    crown(k, p, v + j * 3, tip, rad * 0.5, Math.round(inTips / branches), clump);
  }
  crown(k, p, v, [0, cy, 0], rad * 0.85, clumps - inTips, clump);
}
const BROAD: Broad = { trunk: 1.9, crownY: 2.25, radius: 0.95, girth: 0.2 };
const TALL: Broad = { trunk: 3.3, crownY: 3.9, radius: 1.25, girth: 0.34 };

// A frond, leaf or branch: a flattened lump laid out from a point
const leafAt = (k: Kit, color: string, at: V3, rot: V3, long: number, seed: number) => k.blob(long * 0.5, color, { at, rot, seed, rough: 0.12, smooth: true, squash: [1, 0.12, 0.34] });

const LIBRARY: Record<string, Piece> = {
  tree_broad: {
    tags: ["tree", "garden", "shade"], size: [1, 1], blocks: true, hit: { r: 0.2, h: 2 },
    build: (k, p, v) => broadleaf(k, p, v, 1, BROAD, 3, 48),
  },
  // The sizes of trees (2026-11-03): the ones above are small; medium, large and (conifers only) extra large stand 1.5, 2.1 and 3.2 times
  // as tall. `grownTree` says which of a kind a place grows.
  tree_broad_m: {
    tags: ["tree", "wild", "shade"], size: [1, 1], blocks: true, hit: { r: 0.3, h: 3 },
    build: (k, p, v) => broadleaf(k, p, v, 1.5, BROAD, 5, 100),
  },
  tree_broad_l: {
    tags: ["tree", "wild", "shade"], size: [2, 2], blocks: true, hit: { r: 0.45, h: 4.2 },
    build: (k, p, v) => broadleaf(k, p, v, 2.1, BROAD, 8, 190),
  },
  tree_tall_m: {
    tags: ["tree", "wild", "shade"], size: [2, 2], blocks: true, hit: { r: 0.42, h: 4.6 },
    build: (k, p, v) => broadleaf(k, p, v, 1.4, TALL, 6, 150),
  },
  tree_tall_l: {
    tags: ["tree", "wild", "shade"], size: [3, 3], blocks: true, hit: { r: 0.6, h: 6.4 },
    build: (k, p, v) => broadleaf(k, p, v, 1.9, TALL, 9, 260),
  },
  tree_conifer: {
    tags: ["tree", "garden", "evergreen"], size: [1, 1], blocks: true, hit: { r: 0.22, h: 3, soft: 0.7 },
    build: (k, p, v) => conifer(k, p, v, 3.1, 1.0, 10, 0.11),
  },
  tree_conifer_m: {
    tags: ["tree", "wild", "evergreen"], size: [1, 1], blocks: true, hit: { r: 0.3, h: 4.6, soft: 0.7 },
    build: (k, p, v) => conifer(k, p, v, 4.65, 1.5, 14, 0.16, 1.2),
  },
  tree_conifer_l: {
    tags: ["tree", "wild", "evergreen"], size: [2, 2], blocks: true, hit: { r: 0.42, h: 6.5, soft: 0.7 },
    build: (k, p, v) => conifer(k, p, v, 6.5, 2.1, 18, 0.22, 1.4),
  },
  tree_conifer_xl: {
    tags: ["tree", "wild", "evergreen"], size: [3, 3], blocks: true, hit: { r: 0.6, h: 9.8, soft: 0.7 },
    build: (k, p, v) => conifer(k, p, v, 9.8, 3.1, 24, 0.3, 1.6),
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
    build: (k, p, v) => broadleaf(k, p, v, 1, TALL, 4, 90),
  },
  tree_pine: {
    tags: ["tree", "wild", "evergreen"], size: [1, 1], blocks: true, hit: { r: 0.18, h: 4, soft: 0.6 },
    build: (k, p, v) => conifer(k, p, v, 4.1, 1.15, 14, 0.14),
  },
  tree_pine_m: {
    tags: ["tree", "wild", "evergreen"], size: [1, 1], blocks: true, hit: { r: 0.26, h: 6.2, soft: 0.6 },
    build: (k, p, v) => conifer(k, p, v, 6.2, 1.7, 19, 0.2, 1.2),
  },
  tree_pine_l: {
    tags: ["tree", "wild", "evergreen"], size: [2, 2], blocks: true, hit: { r: 0.38, h: 8.6, soft: 0.6 },
    build: (k, p, v) => conifer(k, p, v, 8.6, 2.3, 24, 0.26, 1.4),
  },
  tree_pine_xl: {
    tags: ["tree", "wild", "evergreen"], size: [3, 3], blocks: true, hit: { r: 0.55, h: 12.5, soft: 0.6 },
    build: (k, p, v) => conifer(k, p, v, 12.5, 3.2, 30, 0.36, 1.6),
  },
  tree_birch: {
    tags: ["tree", "wild", "garden"], size: [1, 1], blocks: true, hit: { r: 0.12, h: 3 },
    build: (k, p, v) => {
      const bend = ((v % 3) - 1) * 0.15;
      k.tube([[0, 0, 0], [bend * 0.5, 1.2, 0], [bend, 2.4, 0.05], [bend * 1.2, 3.1, 0.05]], (t) => 0.11 - t * 0.06, "#e8e4da", { around: 7 });
      for (let i = 0; i < 6; i++) k.box([0.1, 0.03, 0.03], "#2b2722", { at: [bend * (i / 6) * 0.9, 0.4 + i * 0.42, 0.09 - i * 0.004], rot: [0, i * 0.4, 0] });
      crown(k, p, v, [bend * 1.1, 2.85, 0], 0.62, 30, 0.17);
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
      // Moss on the crown: a green cap that hugs the dome, drawn with the leaf texture
      k.blob(0.6, "#4f7a32", { at: [0.05, 1.0, 0.05], seed: v + 3, rough: 0.2, smooth: true, squash: [1.15, 0.3, 1.1], finish: "leaf" });
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
  // Over open water (a water craft's trip, shared/logic "Over the water"): a buoy marking the way, red or green, a lamp on its mast; and a stack
  // of rock standing out of the sea, its foot in the water and weed on it
  buoy: {
    tags: ["buoy", "race", "marker", "sea"], size: [1, 1], blocks: true, hit: { r: 0.36, h: 1.5 },
    build: (k, p, v) => {
      k.lathe([[0, -0.45], [0.3, -0.36], [0.38, -0.05], [0.36, 0.18], [0.22, 0.3], [0, 0.32]], v % 2 ? "#c8372b" : "#2f7d3e", { seg: 12, finish: "sheen" });
      k.cyl(0.385, 0.1, "#f1ede4", { at: [0, 0.06, 0], top: 0.37, seg: 12 });
      k.cyl(0.035, 0.95, C.black, { at: [0, 0.78, 0], seg: 6, finish: "sheen" });
      k.box([0.3, 0.05, 0.3], C.black, { at: [0, 1.1, 0] });
      k.sphere(0.08, "#ffe7a8", { at: [0, 1.32, 0], seg: [8, 6], finish: "glow" });
    },
  },
  sea_stack: {
    tags: ["rock", "sea", "large"], size: [2, 2], blocks: true, hit: { r: 0.85, h: 2.6 },
    build: (k, p, v) => {
      k.blob(0.95, p.stone, { at: [0, 0.1, 0], seed: v + 2, rough: 0.3, squash: [1.1, 0.6, 1] });
      k.blob(0.7, shade(p.stone, 0.92), { at: [0.1, 1.0, -0.05], seed: v + 6, rough: 0.34, squash: [0.85, 1.3, 0.85] });
      k.blob(0.42, shade(p.stone, 1.06), { at: [-0.05, 1.95, 0.1], seed: v + 9, rough: 0.38, squash: [0.8, 1.2, 0.8] });
      k.blob(0.98, "#3f5a34", { at: [0, -0.02, 0], seed: v + 4, rough: 0.25, squash: [1.12, 0.22, 1.02], finish: "leaf" });
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
  // ---- The stands of an arena (shared/logic `standsOf`, 2026-11-02): one square of tier for each of its rows (`standRow`), a STAND_STEP
  // higher each row out from the pit, with a bench along it; the crowd stands on top (LocalMap Life, "spectator")
  arena_tier_0: {
    tags: ["arena", "stand", "seating"], size: [1, 1], blocks: true,
    build: (k, p, v) => {
      k.box([1, 0.45, 1], shade(p.stone, 1.02 - (v % 3) * 0.03), { at: [0, 0.225, 0] });
      k.box([1, 0.05, 0.36], "#6b4a33", { at: [0, 0.475, 0.2] });
    },
  },
  arena_tier_1: {
    tags: ["arena", "stand", "seating"], size: [1, 1], blocks: true,
    build: (k, p, v) => {
      k.box([1, 0.90, 1], shade(p.stone, 0.96 - (v % 3) * 0.03), { at: [0, 0.450, 0] });
      k.box([1, 0.05, 0.36], "#6b4a33", { at: [0, 0.925, 0.2] });
    },
  },
  arena_tier_2: {
    tags: ["arena", "stand", "seating"], size: [1, 1], blocks: true,
    build: (k, p, v) => {
      k.box([1, 1.35, 1], shade(p.stone, 0.90 - (v % 3) * 0.03), { at: [0, 0.675, 0] });
      k.box([1, 0.05, 0.36], "#6b4a33", { at: [0, 1.375, 0.2] });
    },
  },
  // ---- The pieces of a base (shared/logic bases.ts `look`), drawn where the party set them down by BasePieceModel; centred on their
  // footprint, the door or lid to +z
  base_tent: {
    tags: ["base", "shelter"], size: [2, 2], blocks: true,
    build: (k, p, v) => {
      const canvas = p.canvas[(v + 1) % p.canvas.length];
      // An A-frame: two sheets from the ridge pole (RIDGE high) down to the ground at +-HALF, a back wall, the front flaps rolled up and
      // tied at the front edges, the poles at the ends of the ridge, guy lines from the sheets to stakes. Every piece meets the next:
      // a sheet is as long as the slope, so it touches the ridge and the ground
      const [RIDGE, HALF, LONG] = [1.22, 0.82, 1.8];
      const slope = Math.hypot(RIDGE, HALF);
      const tilt = Math.atan2(RIDGE, HALF);
      const onSheet = (y: number) => HALF * (1 - y / RIDGE);
      k.pair((s) => k.box([slope, 0.03, LONG], canvas, { at: [(s * HALF) / 2, RIDGE / 2, 0], rot: [0, 0, -s * tilt], finish: "cloth" }));
      k.extrude(new THREE.Shape([new THREE.Vector2(-HALF, 0), new THREE.Vector2(HALF, 0), new THREE.Vector2(0, RIDGE)]), 0.03, shade(canvas, 0.85), { at: [0, 0, -LONG / 2], finish: "cloth" });
      k.pair((s) => k.rod([s * onSheet(RIDGE - 0.12), RIDGE - 0.12, LONG / 2 - 0.02], [s * onSheet(0.06), 0.06, LONG / 2 - 0.02], 0.045, shade(canvas, 0.9), { seg: 6, finish: "cloth" }));
      k.cyl(0.025, LONG + 0.06, "#6b4a2e", { at: [0, RIDGE, 0], rot: [Math.PI / 2, 0, 0], seg: 6 });
      for (const z of [-LONG / 2, LONG / 2]) k.cyl(0.022, RIDGE + 0.04, "#6b4a2e", { at: [0, (RIDGE + 0.04) / 2, z], seg: 6 });
      k.box([HALF * 2 - 0.08, 0.015, LONG - 0.04], shade(canvas, 0.55), { at: [0, 0.008, 0], finish: "cloth" });
      k.pair((s) => {
        for (const z of [-0.55, 0.55]) {
          k.rod([s * onSheet(0.55), 0.55, z], [s * 0.96, 0.02, z * 1.45], 0.006, "#d8d2c4", { seg: 3 });
          k.cyl(0.02, 0.12, "#4a3a28", { at: [s * 0.96, 0.04, z * 1.45], seg: 5 });
        }
      });
      k.box([0.55, 0.1, 1.2], "#5a4a3a", { at: [0.22, 0.06, -0.15], round: 0.04, finish: "cloth" });
    },
  },
  // A hovercart (shared/logic `Cart`): a flat repulsor sled with a rail round its bed, a push bar at its back (-z) and glowing repulsor
  // pads under it, drawn at the height it floats at; `v` is how many crates are on it (0 to 4, by how full it is)
  cart_hover: {
    tags: ["cart", "vehicle", "cargo"], size: [1, 2], blocks: false,
    build: (k, p, v) => {
      const body = "#7d858e";
      k.box([0.78, 0.1, 1.3], body, { at: [0, 0.42, 0], round: 0.03, finish: "sheen" });
      k.box([0.7, 0.02, 1.2], "#4b5259", { at: [0, 0.48, 0] });
      k.pair((s) => {
        k.box([0.03, 0.12, 1.26], "#c8a23a", { at: [s * 0.38, 0.53, 0], finish: "sheen" });
        k.box([0.06, 0.08, 1.2], "#3a3f46", { at: [s * 0.36, 0.34, 0], round: 0.02, finish: "sheen" });
      });
      for (const z of [-0.45, 0.45]) {
        k.cyl(0.13, 0.05, "#2b2f36", { at: [0, 0.33, z], seg: 14, finish: "sheen" });
        k.cyl(0.1, 0.02, C.glow, { at: [0, 0.3, z], seg: 14, finish: "glow" });
      }
      // the push bar: two uprights and a grip at the back
      k.pair((s) => k.rod([s * 0.3, 0.46, -0.62], [s * 0.3, 0.95, -0.72], 0.018, "#3a3f46", { seg: 6 }));
      k.rod([-0.32, 0.95, -0.72], [0.32, 0.95, -0.72], 0.025, "#1f2328", { seg: 6 });
      k.box([0.12, 0.05, 0.03], C.amber, { at: [0, 0.47, 0.66], finish: "glow" });
      const crates: [number, number, number][] = [[-0.17, 0.21, 0.3], [0.17, 0.21, 0.3], [0, 0.21, -0.2], [0, 0.55, 0.3]];
      crates.slice(0, Math.max(0, Math.min(4, v))).forEach(([x, y, z], i) => {
        const wood = ["#8b6a43", "#5f6b4a", "#7a5a38", "#6d7680"][i];
        k.box([0.32, 0.32, 0.36], wood, { at: [x, 0.5 + y - 0.05, z], rot: [0, (i % 2 ? 0.08 : -0.06), 0], round: 0.02 });
      });
    },
  },
  base_dome: {
    tags: ["base", "shelter"], size: [2, 2], blocks: true,
    build: (k) => {
      // A deployed emergency shelter: a ribbed dome of reflective cloth over a ring, a lit hatch
      k.sphere(0.95, "#d9dde2", { at: [0, 0, 0], half: true, seg: [20, 10], finish: "cloth" });
      for (let i = 0; i < 6; i++) k.torus(0.955, 0.018, "#d9752b", { rot: [0, (i * Math.PI) / 6, 0], arc: Math.PI, seg: [5, 20], finish: "sheen" });
      k.torus(0.95, 0.04, "#59636d", { rot: [Math.PI / 2, 0, 0], seg: [6, 28], finish: "sheen" });
      k.extrude(roundedShape(0.5, 0.62), 0.04, "#3a3f46", { at: [0, 0, 0.86], finish: "sheen" });
      k.box([0.36, 0.05, 0.02], "#9fe7ff", { at: [0, 0.55, 0.92], finish: "glow" });
    },
  },
  base_chest: {
    tags: ["base", "storage"], size: [1, 1], blocks: true,
    build: (k) => {
      k.box([0.7, 0.4, 0.46], "#6b4a2e", { at: [0, 0.2, 0], round: 0.03 });
      k.box([0.72, 0.12, 0.48], "#5a3e26", { at: [0, 0.46, 0], round: 0.05 });
      for (const x of [-0.25, 0.25]) k.box([0.05, 0.54, 0.5], "#59636d", { at: [x, 0.27, 0], finish: "sheen" });
      k.box([0.09, 0.1, 0.03], C.gold, { at: [0, 0.38, 0.24], finish: "sheen" });
    },
  },
  base_crate: {
    tags: ["base", "storage"], size: [1, 1], blocks: true,
    build: (k) => {
      k.box([0.78, 0.66, 0.78], "#8a6a42", { at: [0, 0.33, 0], round: 0.02 });
      for (const y of [0.08, 0.58]) k.box([0.8, 0.07, 0.8], "#6b4a2e", { at: [0, y, 0] });
      k.pair((s) => k.box([0.08, 0.6, 0.8], "#6b4a2e", { at: [s * 0.36, 0.33, 0] }));
      k.box([0.3, 0.12, 0.01], "#e8dcc0", { at: [0, 0.4, 0.4] });
    },
  },
  base_locker: {
    tags: ["base", "storage"], size: [1, 1], blocks: true,
    build: (k) => {
      k.box([0.74, 0.44, 0.48], "#3d4856", { at: [0, 0.22, 0], round: 0.04, finish: "sheen" });
      k.box([0.76, 0.06, 0.5], "#2b2f36", { at: [0, 0.46, 0], round: 0.02, finish: "sheen" });
      k.box([0.12, 0.08, 0.02], C.amber, { at: [0, 0.32, 0.245], finish: "glow" });
      k.pair((s) => k.box([0.1, 0.04, 0.06], "#9aa3ad", { at: [s * 0.4, 0.3, 0], finish: "sheen" }));
    },
  },
};
// A door outline with a rounded top
function roundedShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}

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
// (`water`: a water craft's course over open water, shared/logic "Over the water": no trees or shrubs, rocks and stacks out of the sea)
export function raceScenery(biome: string, water = false): RaceScenery & { cover: string[] } {
  const wild = WILD[biome] ?? WILD.temperate;
  const hits = Object.fromEntries(Object.entries(LIBRARY).filter(([, piece]) => piece.hit).map(([key, piece]) => [key, piece.hit!]));
  if (water) return { trees: [], shrubs: [], boulders: biome === "swamp" ? ["sea_stack", "log", "stump"] : ["sea_stack", "sea_stack", "boulder"], cover: [], hits, crossings: [], sea: true };
  // (and what the world's land puts across the course: shared/logic "Skies and landforms")
  return { ...wild, hits, crossings: biomeSky(biome).crossings };
}

// The trees of every size have a far model (the same build with `farModel` set)
for (const [key, piece] of Object.entries(LIBRARY)) {
  if (!/^tree_(broad|tall|conifer|pine)/.test(key)) continue;
  piece.far = (k, p, v) => {
    farModel = true;
    try { piece.build(k, p, v); } finally { farModel = false; }
  };
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
// A tree of one of the sizes its kind has (see the library): half small, three in ten medium, one in seven large, the rest extra large
// where the kind has one; a kind without sizes stays as it is
function grownTree(r: ReturnType<typeof createRandom>, key: string): string {
  const u = r.next();
  const sizes = u < 0.5 ? [""] : u < 0.8 ? ["_m", ""] : u < 0.95 ? ["_l", "_m", ""] : ["_xl", "_l", "_m", ""];
  for (const size of sizes) if (LIBRARY[key + size]) return key + size;
  return key;
}
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
      const key = grownTree(r, r.pick(keys));
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
    out.push({ key: grownTree(r, r.pick(keys)), x, y, rot: r.next() * Math.PI * 2, scale: 1 + r.next() * 0.6, v: Math.floor(r.next() * 6) });
  }
  return out;
}

// Villages in the great trees beyond the ground of a forest, jungle or swamp settlement (2026-11-05; the user: "for Endor and Kashyyyk ... utilise slightly
// modified versions of the catwalks and gantries, the thatched hut architecture amalgamated with the trees but more rustic", and "utilise some of the
// coniferous trees for the tree villages too"): the architecture kit's forest pieces (tools/blender/build-architecture.py FOREST_BUILDERS and the great
// conifer), laid out as the Mixar review laid them: a first great tree (a broadleaf on a jungle world, a conifer elsewhere) and two great conifers, ring
// platforms at one level joined by rope bridges, stairs round the trunks, wide platforms with rustic huts. Only to be seen, in the belt of the backdrop.
export function TreeVillages({ ground, seed, biome }: { ground: Rect; seed: string; biome: string }) {
  const spots = useMemo(() => treeVillageSpots(ground, seed, biome), [ground.x, ground.y, ground.width, ground.height, seed, biome]);
  const bark = paletteOf(biome).bark;
  return (
    <>
      {spots.map((v, i) => (
        <group key={i} position={[v.x, 0, v.y]} rotation={[0, v.turn, 0]}>
          {villagePieces(v.broadleaf).map(([name, x, y, z, turn], j) => <ArchPiece key={j} name={name} wall={bark} thatch position={[x - 6, y, z + VILLAGE_DEPTH / 2]} rotation={[0, turn, 0]} />)}
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Drawing many copies of a piece in a call or two
// ---------------------------------------------------------------------------------------------

const NO_MODEL = () => {};
// (`far`: a plainer model of the same piece, for the instances far from the camera: the renderer draws each instance in the full model
// inside `near` and in this one beyond it, babylon.ts `thin`)
function Instanced({ id, build, far, items, file }: { id: string; build: (k: Kit) => void; far?: (k: Kit) => void; items: Placed[]; file?: THREE.BufferGeometry | null }) {
  const made = useModel(id, build);
  const distant = useModel(far ? `${id}:far` : `${id}:none`, far ?? NO_MODEL);
  const baked = useMemo(() => (file ? { matte: file } : made), [file, made]);
  const refs = useRef<Record<string, THREE.InstancedMesh | null>>({});
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const [name, mesh] of Object.entries(refs.current)) {
      if (!mesh) continue;
      items.forEach((it, i) => {
        m.compose(pos.set(it.x, it.h ?? 0, it.y), q.setFromEuler(e.set(0, it.rot, 0)), sc.setScalar(it.scale));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [items, baked, distant]);
  const meshes = (models: Baked, band: "near" | "far" | undefined) =>
    FINISHES.map((f) =>
      models[f] ? (
        <instancedMesh key={`${band}-${f}-${items.length}`} ref={(mesh) => { refs.current[`${band}-${f}`] = mesh; }} args={[models[f]!, MATERIALS[f], items.length]} userData={{ lod: band }} castShadow={SOLID_FINISHES.has(f)} receiveShadow={SOLID_FINISHES.has(f)} frustumCulled={false} raycast={() => null} />
      ) : null,
    );
  return (
    <>
      {meshes(baked, far ? "near" : undefined)}
      {far && meshes(distant, "far")}
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
// What makes each kind of plant its own green or bark (a colour mixed into the palette's, by how much), so that a conifer is blue-green,
// a palm yellow-green, a fern bright and a dead tree dry; the plants of a kind vary a little more by their variant (v)
const KIND_TINT: Record<string, { leaf?: [string, number]; leaf2?: [string, number]; bark?: [string, number] }> = {
  tree_broad: { leaf: ["#7fb34a", 0.3] },
  tree_conifer: { leaf: ["#1f4a33", 0.45], leaf2: ["#16392a", 0.4] },
  tree_pine: { leaf: ["#24503a", 0.4], leaf2: ["#183c2c", 0.4] },
  tree_palm: { leaf: ["#8cae3c", 0.35], leaf2: ["#6f9a34", 0.3], bark: ["#7a6a4a", 0.3] },
  tree_dry: { leaf: ["#8a7a3a", 0.45], leaf2: ["#6e5f2a", 0.4], bark: ["#6a5a44", 0.3] },
  tree_birch: { leaf: ["#9cc84a", 0.25], bark: ["#d8d2c4", 0.55] },
  tree_tall: { leaf: ["#2e6b3a", 0.2] },
  shrub: { leaf: ["#4f7a3a", 0.25] },
  hedge: { leaf: ["#3d6a32", 0.25] },
  fern: { leaf: ["#5fae4a", 0.35], leaf2: ["#4f9a3c", 0.3] },
  grass_tuft: { leaf: ["#9bbf5a", 0.4] },
  reeds: { leaf: ["#8c9a4a", 0.35] },
  cactus: { leaf: ["#5e8a4a", 0.35] },
};
export function pieceColours(name: string, v: number, p: Palette): Palette {
  const kind = KIND_TINT[name] ?? KIND_TINT[name.replace(/_(m|l|xl)$/, "")] ?? {};
  const vary = [0.88, 1, 1.12][v % 3];
  const tone = (c: string, t?: [string, number]) => shade(t ? mix(c, t[0], t[1]) : c, vary);
  return { ...p, leaf: tone(p.leaf, kind.leaf), leaf2: tone(p.leaf2, kind.leaf2 ?? kind.leaf), bark: tone(p.bark, kind.bark) };
}
const SOLID_FINISHES = new Set<Finish>(["matte", "sheen", "stone", "bark", "leaf", "needle"]);
function Group({ name, v, items, biome, palette }: { name: string; v: number; items: Placed[]; biome: string; palette: Palette }) {
  const piece = LIBRARY[name];
  const file = useFile(piece.gltf);
  const colours = pieceColours(name, v, palette);
  return (
    <>
      <Instanced id={`site:${name}:${v}:${biome}`} build={(k) => { k.surfaces = plantSurfaces(colours); piece.build(k, colours, v); }} far={piece.far && ((k) => { k.surfaces = plantSurfaces(colours); piece.far!(k, colours, v); })} items={items} file={file} />
      {piece.tags.includes("light") && <LampLights items={items} />}
    </>
  );
}

// A scatter's lamps light up after dark, each at its bulb (models.tsx LampLight)
function LampLights({ items }: { items: Placed[] }) {
  return (
    <>
      {items.map((it, i) => (
        <LampLight key={i} at={[it.x, (it.h ?? 0) + 1.7 * it.scale, it.y]} />
      ))}
    </>
  );
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
const PARALLAX = 0.045; // how far the height map moves the texture, in repeats of GROUND_TILE squares (0.05 and then 30% more, the user, 2026-10-21; down by 30% again, it swam: 2026-11-01)
const NORMAL_SCALE = new THREE.Vector2(1.3, 1.3); // how steep the normal map reads (1 as photographed, 30% more)

// Which texture a building's ground gets, by its world's biome and the building's type (null: plain ground, as on Coruscant)
export function groundTexture(biome: string, buildingType: string, base: string): { set: string; tint: THREE.Color; parallax: number } | null {
  if (buildingType === "sewer system") return { set: "brown_mud_03", tint: new THREE.Color("#ffffff"), parallax: PARALLAX };
  // A city: paving (2026-10-28, the user: the street was a black plane; the concrete of the floors, as ground)
  if (biome === "urban") return { set: "concrete_floor_worn_02", tint: new THREE.Color("#ffffff"), parallax: PARALLAX };
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
  // (the Babylon renderer's parallax, babylon.ts)
  const patch = (mm: THREE.Material | null) => mm && shaderPatch(mm, { kind: "parallax", height: { value: maps.height }, parallax });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={at} receiveShadow onClick={onTap}>
      <planeGeometry args={[w, h]} />
      <meshPhongMaterial map={maps.diffuse} normalMap={maps.normal} color={tint} specular="#000000" shininess={0} normalScale={NORMAL_SCALE} onBeforeCompile={compile} ref={patch} />
    </mesh>
  );
}

// The ground beyond the walkable ground, out to the horizon under an open sky (2026-10-26, scenery.tsx WorldSky): the same photograph and
// tint, but plainly lit (no normal map, no parallax: it is far off and a phone draws a lot of it), drawn before everything else and under it,
// so the near ground and whatever stands on it cover it where they are; the fog fades it into the horizon's haze
export function FarGround({ set, tint, size, at }: { set: string; tint: THREE.Color; size: number; at: [number, number, number] }) {
  const diffuse = useTexture(`/textures/ground/${set}/diffuse.jpg`);
  const map = useMemo(() => {
    const c = diffuse.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(size / GROUND_TILE, size / GROUND_TILE);
    c.colorSpace = THREE.SRGBColorSpace;
    c.needsUpdate = true;
    return c;
  }, [diffuse, size]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={at} renderOrder={-7} raycast={() => null}>
      <planeGeometry args={[size, size]} />
      <meshLambertMaterial map={map} color={tint} depthWrite={false} />
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
  // (the Babylon renderer's parallax, babylon.ts)
  const patch = (mm: THREE.Material | null) => mm && shaderPatch(mm, { kind: "parallax", height: { value: maps.height }, parallax });
  return (
    <mesh geometry={geometry} position={[w / 2, y, h / 2]} receiveShadow onClick={onTap}>
      <meshPhongMaterial map={maps.diffuse} normalMap={maps.normal} color={tint} specular="#000000" shininess={0} normalScale={NORMAL_SCALE} onBeforeCompile={compile} ref={patch} />
    </mesh>
  );
}

// A hovercart (`cart_hover`), floating: it bobs a little on its repulsors. `full` is how laden it is (0 to 1)
export function CartModel({ full, biome }: { full: number; biome: string }) {
  const group = useRef<THREE.Group>(null);
  const crates = full <= 0 ? 0 : Math.min(4, Math.ceil(full * 4));
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = Math.sin(clock.elapsedTime * 2.1) * 0.025;
  });
  return (
    <group ref={group}>
      <Model id={`cart:${crates}:${biome}`} build={(k) => LIBRARY.cart_hover.build(k, paletteOf(biome), crates)} />
    </group>
  );
}

// A piece of the party's base (shared/logic bases.ts), drawn on its own (it is tapped to be opened): its library entry by its `look`
// ("tent" is `base_tent`), centred on the squares it covers and turned by its quarter turns; `ghost` draws it see-through where it
// would stand while it is being set down
export function BasePieceModel({ look, biome, w, h, face, ghost = false }: { look: string; biome: string; w: number; h: number; face: number; ghost?: boolean }) {
  const name = LIBRARY[`base_${look}`] ? `base_${look}` : "base_crate";
  const colours = paletteOf(biome);
  const [sx, sy] = face % 2 ? [h, w] : [w, h];
  if (ghost) return <group position={[sx / 2, 0, sy / 2]} rotation={[0, (face * Math.PI) / 2, 0]}><mesh position={[0, 0.5, 0]}><boxGeometry args={[w * 0.96, 1, h * 0.96]} /><meshBasicMaterial color="#facc15" transparent opacity={0.35} depthWrite={false} /></mesh></group>;
  return <Model id={`base:${name}:${biome}`} build={(k) => LIBRARY[name].build(k, colours, 0)} position={[sx / 2, 0, sy / 2]} rotation={[0, (face * Math.PI) / 2, 0]} />;
}

// ---------------------------------------------------------------------------------------------
// Water worlds (2026-10-30; house rules in shared/logic "Water worlds"). A place on the sea: the sea round it (waves moved in the
// vertex shader of a lit material, so it takes the sun, the specular and the fog), the decking of its gantries and catwalks on piles,
// with a rail along the water, and its buildings' footings going down into the water. A place under the sea: the domes of air over its
// buildings, kelp, rising bubbles, shafts of light from the face of the sea far above, and the sea's own colour round it all.
// The life of the water (both): schools of fish, and the great beasts of the rules data (an opee sea killer, a sando aqua monster)
// cruising beyond the buildings.
// ---------------------------------------------------------------------------------------------
export const SEA_Y = -0.55; // the face of the water, a step under the decking (0)
export const SWIM_Y = -0.72; // a swimmer's feet: a crawl lies along the face of the water, one treading water has its head and shoulders out
export const UNDER_SWIM_Y = 0.5; // a swimmer under the sea, over the sea floor

function waterMaterial(color: string, opacity: number) {
  const time = { value: 0 };
  const m = new THREE.MeshPhongMaterial({ color, shininess: 110, specular: new THREE.Color("#d8ecff"), transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
uniform float uTime;
float waveH(vec2 p) { return 0.07 * sin(p.x * 0.85 + uTime * 1.25) + 0.05 * sin(p.y * 1.21 - uTime * 1.05) + 0.03 * sin((p.x + p.y) * 2.2 + uTime * 2.0) + 0.015 * sin((p.x - p.y) * 4.1 - uTime * 2.9); }`)
      .replace("#include <beginnormal_vertex>", `vec2 wp = (modelMatrix * vec4(position, 1.0)).xz;
  float h0 = waveH(wp);
  vec3 objectNormal = normalize(vec3(-(waveH(wp + vec2(0.06, 0.0)) - h0) / 0.06, 1.0, -(waveH(wp + vec2(0.0, 0.06)) - h0) / 0.06));`)
      .replace("#include <begin_vertex>", `vec3 transformed = vec3(position);
  transformed.y += h0;`);
  };
  m.customProgramCacheKey = () => "sea-waves";
  shaderPatch(m, { kind: "waves", time });
  return { m, time };
}

// The sea: a wide sheet of water at its face, the waves running over it; a tap on it walks (or swims) there
// (`murky`: a swamp's water, brown-green, for a water craft's trip through its channels)
export function Sea({ at, size, lite, onTap, murky }: { at: V3; size: number; lite: boolean; onTap?: (e: ThreeEvent<MouseEvent>) => void; murky?: boolean }) {
  const { m, time } = useMemo(() => waterMaterial(murky ? "#56603e" : "#3a8fb2", murky ? 0.94 : 0.88), [murky]);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, lite ? 90 : 200, lite ? 90 : 200);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [size, lite]);
  useEffect(() => () => { geometry.dispose(); m.dispose(); }, [geometry, m]);
  useFrame((state) => { time.value = state.clock.elapsedTime; });
  return (
    <>
      <mesh geometry={geometry} material={m} position={at} receiveShadow onClick={onTap} />
      {/* the deep under it: dark, so that the water reads as deep */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[at[0], at[1] - 7, at[2]]} raycast={() => null}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color={murky ? "#1f2616" : "#0d3d52"} />
      </mesh>
      {/* and out to the horizon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[at[0], at[1] - 0.03, at[2]]} raycast={() => null}>
        <ringGeometry args={[size * 0.49, 1200, 48, 1]} />
        <meshPhongMaterial color={murky ? "#434c30" : "#1d6384"} shininess={60} specular="#9cc8e8" />
      </mesh>
    </>
  );
}

// The decking of a place on the sea: a plate for each square of `deck` ("x,y"), a lip where it meets the water, a rail along the water
// on posts, and piles down into it; and the footings of the buildings (`boxes`). One mesh for each.
export function Decks({ deck, boxes, lite, onTap }: { deck: Set<string>; boxes: { x: number; y: number; width: number; height: number }[]; lite: boolean; onTap?: (e: ThreeEvent<MouseEvent>) => void }) {
  const key = useMemo(() => [...deck].sort().join(";"), [deck]);
  const [plates, metal] = useMemo(() => {
    const plate: THREE.BufferGeometry[] = [];
    const steel: THREE.BufferGeometry[] = [];
    const has = (x: number, y: number) => deck.has(`${x},${y}`);
    const put = (list: THREE.BufferGeometry[], size: V3, at: V3, colour: string) => {
      const g = new THREE.BoxGeometry(...size).toNonIndexed();
      g.translate(...at);
      const c = new THREE.Color(colour);
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.deleteAttribute("uv");
      list.push(g);
    };
    for (const k of deck) {
      const [x, y] = k.split(",").map(Number);
      // (the plates alternate a little in shade, the seams dark between them)
      put(plate, [0.96, 0.14, 0.96], [x + 0.5, -0.07, y + 0.5], (x + y) % 2 ? "#c6cdd4" : "#bcc4cc");
      if (x % 3 === 0 && y % 3 === 0) put(steel, [0.18, 6.5, 0.18], [x + 0.5, -3.3, y + 0.5], "#5d6872");
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (has(x + dx, y + dy)) continue;
        // the lip and the rail along the water's side of the square
        const [ex, ey] = [x + 0.5 + dx * 0.48, y + 0.5 + dy * 0.48];
        const size: V3 = dx ? [0.06, 0.3, 1] : [1, 0.3, 0.06];
        put(steel, size, [ex, -0.15, ey], "#8c98a4");
        if (!lite) {
          put(steel, dx ? [0.05, 0.05, 1] : [1, 0.05, 0.05], [ex, 0.95, ey], "#dfe6ec");
          put(steel, dx ? [0.04, 0.04, 1] : [1, 0.04, 0.04], [ex, 0.5, ey], "#aab4be");
          put(steel, [0.06, 0.95, 0.06], [ex - (dy ? 0.47 : 0), 0.47, ey - (dx ? 0.47 : 0)], "#dfe6ec");
        }
      }
    }
    // The footings: each building stands on a plinth going down into the water
    for (const b of boxes) put(steel, [b.width - 0.2, 7, b.height - 0.2], [b.x + b.width / 2, -3.65, b.y + b.height / 2], "#4f5a64");
    const merge = (list: THREE.BufferGeometry[]) => {
      const m = list.length ? mergeGeometries(list, false) : new THREE.BufferGeometry();
      list.forEach((g) => g.dispose());
      return m;
    };
    return [merge(plate), merge(steel)];
  }, [key, boxes.map((b) => `${b.x},${b.y},${b.width},${b.height}`).join(";"), lite]);
  useEffect(() => () => { plates.dispose(); metal.dispose(); }, [plates, metal]);
  return (
    <>
      <mesh geometry={plates} receiveShadow castShadow={!lite} onClick={onTap}>
        <meshPhongMaterial vertexColors shininess={40} specular="#6a7480" />
      </mesh>
      <mesh geometry={metal} castShadow={!lite} raycast={() => null}>
        <meshPhongMaterial vertexColors shininess={50} specular="#8a96a2" />
      </mesh>
    </>
  );
}

// A place under the sea: the dome of air over each building, kelp swaying over the sea floor, bubbles rising, shafts of light and the
// face of the sea far above. `boxes` are the buildings' boxes, `ground` the place's ground.
export function UnderSea({ boxes, ground, lite }: { boxes: { x: number; y: number; width: number; height: number }[]; ground: { x: number; y: number; w: number; h: number }; lite: boolean }) {
  const kelp = useRef<THREE.InstancedMesh>(null);
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const r = createRandom(boxes.length * 977 + ground.w);
    // (the kelp grows out past the bubble over the whole ground: inside it there is air and the sea floor is bare)
    const inside = (x: number, y: number) => x > ground.x - 2 && x < ground.x + ground.w + 2 && y > ground.y - 2 && y < ground.y + ground.h + 2;
    const out: { x: number; y: number; h: number; phase: number }[] = [];
    for (let i = 0; out.length < (lite ? 60 : 160) && i < 4000; i++) {
      const [x, y] = [ground.x - 24 + r.next() * (ground.w + 48), ground.y - 24 + r.next() * (ground.h + 48)];
      if (!inside(x, y)) out.push({ x, y, h: 1.5 + r.next() * 4, phase: r.next() * 6.28 });
    }
    return out;
  }, [boxes.length, ground.w, ground.h, lite]);
  // (the bubbles rise outside the dome, from the sea floor round it)
  const rising = useMemo(() => Array.from({ length: lite ? 40 : 120 }, (_, i) => {
    const a = i * 2.399963;
    const reach = 6 + ((i * 7919) % 100) / 100 * 16;
    return { x: ground.x + ground.w / 2 + Math.cos(a) * (ground.w / 2 + reach), y: ground.y + ground.h / 2 + Math.sin(a) * (ground.h / 2 + reach), speed: 0.6 + ((i * 31) % 10) / 10, at: (i * 37) % 30 };
  }), [ground.x, ground.y, ground.w, ground.h, lite]);
  const blade = useMemo(() => { const g = new THREE.ConeGeometry(0.12, 1, 4, 3); g.translate(0, 0.5, 0); return g; }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (kelp.current) {
      spots.forEach((s, i) => {
        dummy.position.set(s.x, 0, s.y);
        dummy.rotation.set(Math.sin(t * 0.7 + s.phase) * 0.18, s.phase, Math.cos(t * 0.5 + s.phase) * 0.14);
        dummy.scale.set(1, s.h, 1);
        dummy.updateMatrix();
        kelp.current!.setMatrixAt(i, dummy.matrix);
      });
      kelp.current.instanceMatrix.needsUpdate = true;
    }
    if (bubbles.current) {
      rising.forEach((b, i) => {
        const y = ((t * b.speed + b.at) % 30);
        dummy.position.set(b.x + Math.sin(t * 2 + i) * 0.15, y, b.y);
        dummy.rotation.set(0, 0, 0);
        const s = 0.04 + (i % 5) * 0.015;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        bubbles.current!.setMatrixAt(i, dummy.matrix);
      });
      bubbles.current.instanceMatrix.needsUpdate = true;
    }
  });
  const [cx, cz] = [ground.x + ground.w / 2, ground.y + ground.h / 2];
  const domeH = Math.max(16, Math.min(ground.w, ground.h) * 0.4);
  return (
    <>
      {/* the bubble of air over the whole place (2026-11-02, the user: nobody drowns within the bubble of buildings): its streets are air, the
          party walks them; the sea is outside it */}
      <group position={[cx, 0, cz]}>
        <mesh scale={[ground.w / 2 + 2, domeH, ground.h / 2 + 2]} raycast={() => null} renderOrder={1}>
          <sphereGeometry args={[1, lite ? 24 : 48, lite ? 10 : 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhongMaterial color="#9fe3ff" emissive="#1e6d8a" emissiveIntensity={0.25} transparent opacity={0.07} shininess={140} specular="#ffffff" side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} scale={[ground.w / 2 + 2, ground.h / 2 + 2, 1]} raycast={() => null}>
          <ringGeometry args={[0.985, 1, lite ? 48 : 96]} />
          <meshBasicMaterial color="#bff0ff" transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {boxes.map((b, i) => {
        const r = Math.hypot(b.width, b.height) / 2 + 1.2;
        return (
          <group key={i} position={[b.x + b.width / 2, 0, b.y + b.height / 2]}>
            {/* the dome of air (a hydrostatic bubble: walked through, the water held off) */}
            <mesh scale={[r, r * 0.8, r]} raycast={() => null} renderOrder={2}>
              <sphereGeometry args={[1, lite ? 20 : 36, lite ? 10 : 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshPhongMaterial color="#9fe3ff" emissive="#1e6d8a" emissiveIntensity={0.35} transparent opacity={0.2} shininess={120} specular="#ffffff" side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} raycast={() => null}>
              <ringGeometry args={[r - 0.12, r + 0.05, lite ? 24 : 48]} />
              <meshBasicMaterial color="#bff0ff" transparent opacity={0.5} />
            </mesh>
          </group>
        );
      })}
      <instancedMesh ref={kelp} args={[blade, undefined, spots.length]} raycast={() => null}>
        <meshLambertMaterial color="#3f7a3a" emissive="#0d2a12" />
      </instancedMesh>
      <instancedMesh ref={bubbles} args={[undefined, undefined, rising.length]} raycast={() => null}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial color="#d8f6ff" transparent opacity={0.55} />
      </instancedMesh>
      {/* the face of the sea far above, seen from under it, and shafts of light coming down */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, 34, cz]} raycast={() => null}>
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial color="#4fb3d6" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      {!lite && [0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[cx + Math.sin(i * 2.4) * ground.w * 0.35, 16, cz + Math.cos(i * 1.7) * ground.h * 0.35]} rotation={[0.18 * Math.sin(i), 0, 0.15 * Math.cos(i)]} raycast={() => null}>
          <cylinderGeometry args={[1.2, 4.5, 34, 12, 1, true]} />
          <meshBasicMaterial color="#bfefff" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

// The sea's colour all round a place under it (as fog: the far buildings fade into blue-green)
export const UNDER_FOG: [string, number, number] = ["#0f4a5e", 16, 110];

// Fish in schools: each school turns on a ring round its own centre, each fish a little off the line, wagging. `depth` is where they swim.
export function FishSchools({ ground, depth, count = 5, lite, round }: { ground: { x: number; y: number; w: number; h: number }; depth: number; count?: number; lite: boolean; round?: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const per = lite ? 10 : 24;
  // (`round`: the schools swim in the sea round the ground, not over it: under the sea the ground is one bubble of air)
  const schools = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: round ? ground.x + ground.w / 2 + Math.cos(i * 2.4) * (ground.w / 2 + 14 + (i % 3) * 4) : ground.x + ((i * 0.37 + 0.15) % 1) * ground.w,
    y: round ? ground.y + ground.h / 2 + Math.sin(i * 2.4) * (ground.h / 2 + 14 + (i % 3) * 4) : ground.y + ((i * 0.61 + 0.3) % 1) * ground.h,
    r: 3 + (i % 3) * 2, speed: 0.25 + (i % 4) * 0.08, dir: i % 2 ? 1 : -1, hue: i,
  })), [count, ground.w, ground.h, round]);
  const fish = useMemo(() => { const g = new THREE.ConeGeometry(0.06, 0.26, 4); g.rotateX(Math.PI / 2); return g; }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!mesh.current) return;
    schools.forEach((s, si) => {
      for (let k = 0; k < per; k++) {
        const a = s.dir * t * s.speed + k * 0.09 + si;
        const off = Math.sin(k * 12.9898) * 0.6;
        dummy.position.set(s.x + Math.cos(a) * (s.r + off), depth + Math.sin(k * 4.1 + t) * 0.25 + ((k % 3) - 1) * 0.2, s.y + Math.sin(a) * (s.r + off));
        dummy.rotation.set(0, -a * s.dir + (s.dir > 0 ? Math.PI : 0) + Math.sin(t * 9 + k) * 0.2, 0);
        dummy.updateMatrix();
        mesh.current!.setMatrixAt(si * per + k, dummy.matrix);
      }
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[fish, undefined, schools.length * per]} raycast={() => null}>
      <meshPhongMaterial color="#c8d8e0" emissive="#203440" shininess={80} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------------------------
// Tree and stilt villages (2026-11-06, the user: "I want the tree villages to REPLACE the standard square rooms on relevant planets (like Kashyyyk and
// Endor)"; shared/logic canopyOf). A room of such a building stands `aloft` metres up: under it, drawn in the room's own frame (its north-west corner
// at the origin, its floor at 0), a deck a little wider than its curve, and what carries the deck down to the ground: a great trunk with its roots
// and four struts to the deck's rim in a tree village, piles and their bracing on a swamp's stilts. A corridor between two huts is a bridge: planks
// and rope rails over the drop, no walls. The way in has a ladder down to the ground outside it.
type CanopyKind = "tree" | "stilts";
const PLANK = "#7a5a3a";
const ROPE = "#b8a27a";
function Cyl({ at, r0, r1, h, color, seg = 10 }: { at: V3; r0: number; r1: number; h: number; color: string; seg?: number }) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <cylinderGeometry args={[r1, r0, h, seg]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
function Plank({ at, size, color = PLANK, turn = 0 }: { at: V3; size: V3; color?: string; turn?: number }) {
  return (
    <mesh position={at} rotation={[0, turn, 0]} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
// (a beam from one point to another, for struts, braces and the ladder's rails)
function Beam({ from, to, thick, color }: { from: V3; to: V3; thick: number; color: string }) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const len = a.distanceTo(b);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return (
    <mesh position={mid} quaternion={q} castShadow>
      <boxGeometry args={[thick, len, thick]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
export function CanopyDeck({ w, d, round, aloft, kind, biome }: { w: number; d: number; round: boolean; aloft: number; kind: CanopyKind; biome: string }) {
  const bark = paletteOf(biome).bark;
  const cx = w / 2;
  const cz = d / 2;
  const rx = w / 2 + 0.35;
  const rz = d / 2 + 0.35;
  const deck = round ? (
    <mesh position={[cx, -0.2, cz]} scale={[rx, 1, rz]} receiveShadow castShadow>
      <cylinderGeometry args={[1, 1, 0.34, 28]} />
      <meshStandardMaterial color={PLANK} roughness={0.85} />
    </mesh>
  ) : (
    <Plank at={[cx, -0.2, cz]} size={[w + 0.7, 0.34, d + 0.7]} />
  );
  const rim = (t: number): V3 => [cx + Math.cos(t) * (rx - 0.3), -0.37, cz + Math.sin(t) * (rz - 0.3)];
  if (kind === "tree") {
    const r = Math.min(1.35, 0.55 + Math.min(w, d) * 0.09);
    return (
      <group>
        {deck}
        <Cyl at={[cx, -aloft / 2 - 0.2, cz]} r0={r * 1.12} r1={r * 0.92} h={aloft} color={bark} seg={12} />
        {/* the roots splaying into the ground */}
        <Cyl at={[cx, -aloft + 0.35, cz]} r0={r * 2.1} r1={r * 1.1} h={0.7} color={bark} seg={12} />
        {/* the struts from the trunk to the deck's rim */}
        {[0.4, 2.0, 3.55, 5.1].map((t, i) => (
          <Beam key={i} from={[cx + Math.cos(t) * r * 0.9, -2.4, cz + Math.sin(t) * r * 0.9]} to={rim(t)} thick={0.22} color={bark} />
        ))}
      </group>
    );
  }
  // (stilts: piles round the rim and one in the middle, braced in pairs)
  const piles = [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3 + 0.3);
  return (
    <group>
      {deck}
      {piles.map((t, i) => <Cyl key={i} at={[rim(t)[0], -aloft / 2 - 0.2, rim(t)[2]]} r0={0.16} r1={0.13} h={aloft + 0.4} color={bark} seg={7} />)}
      <Cyl at={[cx, -aloft / 2 - 0.2, cz]} r0={0.22} r1={0.18} h={aloft + 0.4} color={bark} seg={8} />
      {piles.map((t, i) => {
        const u = piles[(i + 1) % piles.length];
        return <Beam key={`b${i}`} from={[rim(t)[0], -aloft + 0.3, rim(t)[2]]} to={[rim(u)[0], -0.45, rim(u)[2]]} thick={0.09} color={bark} />;
      })}
    </group>
  );
}
// A corridor between huts as a bridge: planks across its length, a rope rail along each long side on posts (it hangs between the decks: no posts down)
export function CanopyBridge({ w, d, kind, biome }: { w: number; d: number; kind: CanopyKind; biome: string }) {
  const along = w >= d ? "x" : "z";
  const len = along === "x" ? w : d;
  const span = along === "x" ? d : w;
  const n = Math.max(2, Math.round(len / 0.32));
  const bark = paletteOf(biome).bark;
  const at = (u: number, v: number, y: number): V3 => (along === "x" ? [u, y, v] : [v, y, u]);
  const sag = kind === "tree" ? 0.18 : 0.04;
  const yAt = (u: number) => -sag * Math.sin((Math.PI * u) / len);
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const u = (i + 0.5) * (len / n);
        return <Plank key={i} at={at(u, span / 2, yAt(u) + 0.04)} size={along === "x" ? [len / n - 0.04, 0.08, span - 0.1] : [span - 0.1, 0.08, len / n - 0.04]} />;
      })}
      {[0.06, span - 0.06].map((v, side) => (
        <group key={side}>
          {Array.from({ length: Math.max(2, Math.round(len / 1.2) + 1) }, (_, i) => {
            const u = (i / (Math.max(2, Math.round(len / 1.2) + 1) - 1)) * len;
            return <Beam key={i} from={at(u, v, yAt(u))} to={at(u, v, yAt(u) + 1.0)} thick={0.07} color={bark} />;
          })}
          {Array.from({ length: 8 }, (_, i) => {
            const u0 = (i / 8) * len;
            const u1 = ((i + 1) / 8) * len;
            return <Beam key={`r${i}`} from={at(u0, v, yAt(u0) + 0.95)} to={at(u1, v, yAt(u1) + 0.95)} thick={0.04} color={ROPE} />;
          })}
        </group>
      ))}
    </group>
  );
}
// A ladder from the floor of the way in down to the ground, outside its square on its side (`at`, `out`: the square's middle on the wall and the way out)
export function CanopyLadder({ at, out, aloft, biome }: { at: [number, number]; out: [number, number]; aloft: number; biome: string }) {
  const bark = paletteOf(biome).bark;
  const x = at[0] + out[0] * 0.75;
  const z = at[1] + out[1] * 0.75;
  const across: [number, number] = [-out[1], out[0]];
  const rails = [-0.28, 0.28].map((s) => [x + across[0] * s, z + across[1] * s] as [number, number]);
  const rungs = Math.max(4, Math.floor(aloft / 0.32));
  return (
    <group>
      {/* the landing outside the door */}
      <Plank at={[at[0] + out[0] * 0.5, -0.1, at[1] + out[1] * 0.5]} size={out[0] ? [0.9, 0.16, 1.0] : [1.0, 0.16, 0.9]} />
      {rails.map(([rx, rz], i) => <Beam key={i} from={[rx, -aloft, rz]} to={[rx, 0.9, rz]} thick={0.08} color={bark} />)}
      {Array.from({ length: rungs }, (_, i) => {
        const y = -aloft + (i + 0.5) * (aloft / rungs);
        return <Beam key={`g${i}`} from={[rails[0][0], y, rails[0][1]]} to={[rails[1][0], y, rails[1][1]]} thick={0.05} color={PLANK} />;
      })}
    </group>
  );
}
