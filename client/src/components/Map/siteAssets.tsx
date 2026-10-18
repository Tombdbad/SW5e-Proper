import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { create } from "zustand";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, Model, useModel, C, shade, mix, FINISHES, MATERIALS, type V3, type Finish } from "./models";
import { createRandom, unitOf, packedness, type SiteGrounds, type DistrictPlan } from "@shared/logic";

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
// library has for a tag.
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
  build: Build;
  // A model made elsewhere, under client/public (see above)
  gltf?: string;
}

// A frond, leaf or branch: a flattened lump laid out from a point
const leafAt = (k: Kit, color: string, at: V3, rot: V3, long: number, seed: number) => k.blob(long * 0.5, color, { at, rot, seed, rough: 0.12, smooth: true, squash: [1, 0.12, 0.34] });

const LIBRARY: Record<string, Piece> = {
  tree_broad: {
    tags: ["tree", "garden", "shade"], size: [1, 1], blocks: true,
    build: (k, p, v) => {
      k.lathe([[0.2, 0], [0.15, 0.4], [0.1, 1.4], [0.06, 1.9]], p.bark, { seg: 8 });
      k.blob(0.95, p.leaf, { at: [0, 2.25, 0], seed: v + 1, rough: 0.22, smooth: true, squash: [1, 0.85, 1] });
      k.blob(0.62, p.leaf2, { at: [0.5, 2.55, 0.2], seed: v + 5, rough: 0.2, smooth: true });
      k.blob(0.55, p.leaf2, { at: [-0.42, 2.5, -0.25], seed: v + 9, rough: 0.2, smooth: true });
    },
  },
  tree_conifer: {
    tags: ["tree", "garden", "evergreen"], size: [1, 1], blocks: true,
    build: (k, p, v) => {
      k.cyl(0.09, 0.8, p.bark, { at: [0, 0.4, 0], seg: 6 });
      [[0.85, 1.0, 0.7], [0.68, 1.0, 1.4], [0.5, 0.9, 2.05], [0.3, 0.8, 2.65]].forEach(([r, h, y], i) => k.cone(r, h, i % 2 ? p.leaf2 : p.leaf, { at: [0, y, 0], seg: 8 + (v % 2) * 2 }));
    },
  },
  tree_palm: {
    tags: ["tree", "garden", "arid"], size: [1, 1], blocks: true,
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
    tags: ["tree", "garden", "arid", "dead"], size: [1, 1], blocks: true,
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
    tags: ["plant", "garden", "low"], size: [1, 1], blocks: false,
    build: (k, p, v) => {
      for (let i = 0; i < 3; i++) k.blob(0.3 + (i % 2) * 0.08, i % 2 ? p.leaf2 : p.leaf, { at: [Math.cos(i * 2.1 + v) * 0.22, 0.28, Math.sin(i * 2.1 + v) * 0.22], seed: v + i, rough: 0.2, smooth: true });
    },
  },
  hedge: {
    tags: ["hedge", "garden", "wall"], size: [1, 1], blocks: true,
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
    tags: ["topiary", "garden", "formal"], size: [1, 1], blocks: true,
    build: (k, p, v) => {
      k.cyl(0.26, 0.34, shade(p.stone, 0.85), { at: [0, 0.17, 0], seg: 10 });
      k.cyl(0.05, 0.5, p.bark, { at: [0, 0.55, 0], seg: 6 });
      k.sphere(0.4, p.leaf, { at: [0, 1.0, 0], seg: [12, 9] });
      k.sphere(0.27, p.leaf2, { at: [0, 1.58, 0], seg: [10, 8] });
      if (v % 2) k.cone(0.1, 0.3, p.leaf, { at: [0, 1.95, 0], seg: 6 });
    },
  },
  fountain: {
    tags: ["fountain", "garden", "water", "centre"], size: [3, 3], blocks: true,
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
    tags: ["statue", "garden", "formal", "centre"], size: [1, 1], blocks: true,
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
    tags: ["statue", "garden", "ruin", "formal"], size: [1, 1], blocks: true,
    build: (k, p, v) => {
      const stone = shade(p.stone, 0.92);
      k.box([0.7, 0.18, 0.7], stone, { at: [0, 0.09, 0], round: 0.03 });
      k.cyl(0.24, 1.7, stone, { at: [0, 1.03, 0], seg: 12 });
      k.cyl(0.32, 0.14, shade(stone, 1.06), { at: [0, 1.95, 0], seg: 12 });
      if (v % 2) k.blob(0.22, stone, { at: [0.1, 2.02, 0], seed: v, rough: 0.4, squash: [1, 0.5, 1] });
    },
  },
  urn: {
    tags: ["urn", "garden", "formal", "low"], size: [1, 1], blocks: false,
    build: (k, p) => {
      k.lathe([[0.22, 0], [0.24, 0.05], [0.14, 0.18], [0.3, 0.46], [0.34, 0.62], [0.24, 0.66], [0, 0.6]], shade(p.stone, 0.9), { seg: 12 });
      k.blob(0.2, p.leaf2, { at: [0, 0.76, 0], seed: 3, rough: 0.2, smooth: true });
    },
  },
  planter: {
    tags: ["planter", "garden", "low"], size: [1, 1], blocks: true,
    build: (k, p, v) => {
      k.box([0.84, 0.42, 0.84], p.stone, { at: [0, 0.21, 0], round: 0.05 });
      k.blob(0.38, p.leaf, { at: [0, 0.58, 0], seed: v, rough: 0.2, smooth: true });
      for (let i = 0; i < 3; i++) k.sphere(0.07, p.bloom[(i + v) % p.bloom.length], { at: [(i - 1) * 0.2, 0.84, (i % 2) * 0.12 - 0.06], seg: [6, 5] });
    },
  },
  bench: {
    tags: ["bench", "garden", "seat"], size: [2, 1], blocks: false,
    build: (k, p) => {
      for (const x of [-0.8, 0.8]) k.box([0.12, 0.42, 0.5], p.stone, { at: [x, 0.21, 0], round: 0.03 });
      k.box([1.8, 0.07, 0.46], "#8b5e3c", { at: [0, 0.44, 0], round: 0.02 });
      k.box([1.8, 0.28, 0.06], "#8b5e3c", { at: [0, 0.72, -0.22], round: 0.02 });
    },
  },
  lamp: {
    tags: ["lamp", "garden", "light"], size: [1, 1], blocks: false,
    build: (k) => {
      k.lathe([[0.1, 0], [0.1, 0.06], [0.04, 0.12], [0.035, 1.5], [0.08, 1.56], [0, 1.58]], C.black, { seg: 8, finish: "sheen" });
      k.sphere(0.12, "#ffe7a8", { at: [0, 1.7, 0], seg: [8, 6], finish: "glow" });
      k.cone(0.16, 0.12, C.black, { at: [0, 1.86, 0], seg: 8, finish: "sheen" });
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
        m.compose(pos.set(it.x, 0, it.y), q.setFromEuler(e.set(0, it.rot, 0)), sc.setScalar(it.scale));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [items, baked]);
  return (
    <>
      {FINISHES.map((f) =>
        baked[f] ? (
          <instancedMesh key={`${f}-${items.length}`} ref={(mesh) => { refs.current[f] = mesh; }} args={[baked[f]!, MATERIALS[f], items.length]} castShadow={f === "matte" || f === "sheen"} receiveShadow={f === "matte" || f === "sheen"} frustumCulled={false} raycast={() => null} />
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
function Group({ name, v, items, biome, palette }: { name: string; v: number; items: Placed[]; biome: string; palette: Palette }) {
  const piece = LIBRARY[name];
  const file = useFile(piece.gltf);
  return <Instanced id={`site:${name}:${v}:${biome}`} build={(k) => piece.build(k, palette, v)} items={items} file={file} />;
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
        <Model key={i} id={`cwall:${Math.round(run.len * 10)}:${stone}`} build={(k) => wallRun(k, run.len, stone)} position={[run.x, 0, run.y]} rotation={[0, run.turn ? -Math.PI / 2 : 0, 0]} />
      ))}
      {towers.map((t, i) => (
        <Model key={`t${i}`} id={`ctower:${stone}:${roof}`} build={(k) => wallTower(k, stone, roof)} position={[t.x, 0, t.y]} />
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
