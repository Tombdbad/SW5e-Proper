// The item models (2026-10-20): what the code knows of the models made for the rules data's items (tools/build-item-assets.mjs, from the
// Blender work of the `blender-sw5e` skill). Two data files in shared/art say it all: itemModels.json (the catalogue: where each model is,
// its size, sockets, named parts and their pivots, and hints for where it is worn) and itemIndex.json (every item name of the
// rules data that has a model, and which). Nothing here is a rule; it is art. Pure but for the geometry it is given (tests/interiors/items.test.ts).
import * as THREE from "three";
import models from "@shared/art/itemModels.json";
import index from "@shared/art/itemIndex.json";
import { partOf } from "./assets";

export type V3 = [number, number, number];
// Hints a model carries from the Blender side (its `.rig.json`): where on a body it goes and what it is, for the attach logic
export interface ModelMeta {
  // weapon, shield, hipR, hipL, back, belt, head, neck, shoulder, wrist, forearm, finger, feet, hands, hands-knees, torso, body, stand, floor, hand, droid-module, item-mod, ammo, thrown, saber-blade, weapon-accessory
  slot?: string;
  // The pose held in (saber, saber2, bow, rifle, staff, tool, pinch, carry, drink, play, horn, strings, ...)
  hand?: string;
  // true: it goes round a body, so its size and radius should follow the wearer (a band, a collar, gloves)
  wraps?: boolean;
  kind?: string;
  // "none": the colours mean something (a grenade's type, a suit's use, a blade): never retone to a room palette
  tone?: "none" | "palette";
  // "rarity": a grade tints it in code; "blade": the colour of a saber's blade
  tint?: string;
  weight?: "light" | "medium" | "heavy";
  two_handed?: boolean;
  grade?: number;
  mk?: number;
  protocol?: boolean;
  note?: string;
}
export interface ItemModel {
  pack: string;
  tris: number;
  lodTris: number;
  // min x, y, z, max x, y, z in the file's own frame (a weapon lies along z, centred)
  box: [number, number, number, number, number, number];
  sockets?: Record<string, V3>;
  // Named parts, the vertex's `_MARK` part number being the index; the pivot is the node's origin (a hinge, a base)
  parts?: { name: string; pivot: V3 }[];
  meta: ModelMeta;
}
export const ITEM_MODELS = models as unknown as Record<string, ItemModel>;

// An item's entry: a model name, or [model, extras]
type Entry = string | [string, { blade?: string; bladeScale?: number; grade?: string; chassis?: number }];
const INDEX = index as unknown as Record<string, Entry>;

export interface ItemRef {
  // Our model (in the catalogue), a model already in the repo ("kitbash:<name>": the kits of interiors/kitbash.ts), or a weapon the code
  // draws from its base weapon ("weapon:<base weapon name>", picked by hungWeapon)
  model: string;
  // A saber's blade shape (a model "blade-<shape>") and how long it is against that shape's own length
  blade?: string;
  bladeScale?: number;
  // A grade ("Fine", "Mk III") the model is tinted for; a chassis is the unfinished frame an item is built on
  grade?: string;
  chassis?: boolean;
}

// The model an item of the rules data (or an enhanced item) has, by name
export function itemRef(name: string): ItemRef | undefined {
  const e = INDEX[name];
  if (!e) return undefined;
  if (typeof e === "string") return { model: e };
  return { model: e[0], blade: e[1].blade, bladeScale: e[1].bladeScale, grade: e[1].grade, chassis: !!e[1].chassis };
}

export const isOwnModel = (model: string) => !model.includes(":") && model in ITEM_MODELS;
export const modelInfo = (model: string): ItemModel | undefined => ITEM_MODELS[model];
// Where a model's file is, under /assets (what gear.ts's `Want.model` is), and its URL, hero or low detail
export const assetPath = (model: string): string | undefined => (ITEM_MODELS[model] ? `${ITEM_MODELS[model].pack}/${model}` : undefined);
export const modelUrl = (model: string, detail: "hero" | "low" = "hero"): string | undefined => {
  const m = ITEM_MODELS[model];
  return m ? `/assets/${m.pack}/${model}${detail === "low" ? ".lod" : ""}.glb` : undefined;
};
export const socketOf = (model: string, name: string): V3 | undefined => ITEM_MODELS[model]?.sockets?.[name];
// A socket in the frame of the model as it is loaded (centred on its box: assets.ts geometryOf, anchor "centre"), which is what a figure holds
export function socketCentred(model: string, name: string): V3 | undefined {
  const m = ITEM_MODELS[model];
  const at = m?.sockets?.[name];
  if (!m || !at) return undefined;
  const b = m.box;
  return [at[0] - (b[0] + b[3]) / 2, at[1] - (b[1] + b[4]) / 2, at[2] - (b[2] + b[5]) / 2];
}
export const partOfModel = (model: string, name: string) => ITEM_MODELS[model]?.parts?.findIndex((p) => p.name === name) ?? -1;
export const pivotOf = (model: string, name: string): V3 | undefined => ITEM_MODELS[model]?.parts?.find((p) => p.name === name)?.pivot;

// How a model is toned when the room it is in has a palette: not at all when its colours mean something
export const toned = (model: string) => (ITEM_MODELS[model]?.meta.tone ?? "palette") !== "none";

// ---------------------------------------------------------------------------------------------
// Sabers: a hilt model and a blade shape. Each hilt comes with a standard blade of its own (a part named `blade`, or `blade` and
// `blade_b` for a double); a name that wants another blade (an axe, a ring, a katana's curve, a longer standard one) has that part taken
// out and the shape's own model set at the same hinge. The crossguard's `blade_L` and `blade_R` are kept.
// ---------------------------------------------------------------------------------------------

// Whether a saber name needs its hilt's own blade replaced
export const needsBlade = (ref: ItemRef) => !!ref.blade && (ref.blade !== "standard" || (ref.bladeScale !== undefined && ref.bladeScale !== 1));

// The geometry of a model without the vertices of some of its parts. Expects the non-indexed geometry geometryOf makes
export function withoutParts(geometry: THREE.BufferGeometry, drop: Set<number>): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const keep: number[] = [];
  for (let t = 0; t + 2 < count; t += 3) if (!drop.has(partOf(geometry, t))) keep.push(t);
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const a = geometry.getAttribute(name);
    const arr = new Float32Array(keep.length * 3 * a.itemSize);
    keep.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) arr[(i * 3 + v) * a.itemSize + c] = [a.getX, a.getY, a.getZ, a.getW][c].call(a, t + v); });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

// A hilt with its standard blade(s) swapped for `blade` (a model file read by geometryOf, its base at the origin after `base` is taken
// off), each set at the hinge of the part it replaces and lengthened by `scale` along z. Both are in the frame of their own files
export function composeSaber(hilt: THREE.BufferGeometry, hiltModel: string, blade: THREE.BufferGeometry, bladeModel: string, scale = 1): THREE.BufferGeometry {
  const info = ITEM_MODELS[hiltModel];
  // A loaded model is centred on its box (assets.ts geometryOf, anchor "centre"), the file's sockets and pivots are not
  const centre = (m: string): V3 => { const b = ITEM_MODELS[m]?.box ?? [0, 0, 0, 0, 0, 0]; return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]; };
  const [hc, bc] = [centre(hiltModel), centre(bladeModel)];
  const baseAt = ITEM_MODELS[bladeModel]?.sockets?.base ?? [0, 0, 0];
  const base: V3 = [baseAt[0] - bc[0], baseAt[1] - bc[1], baseAt[2] - bc[2]];
  const hinges = (info?.parts ?? []).map((p, i) => ({ ...p, i })).filter((p) => p.name === "blade" || p.name === "blade_b");
  const stripped = withoutParts(hilt, new Set(hinges.map((h) => h.i)));
  const pieces: THREE.BufferGeometry[] = [stripped];
  for (const h of hinges) {
    const g = blade.clone();
    g.translate(-base[0], -base[1], -base[2]);
    g.scale(1, 1, scale);
    // The second blade of a double points the other way
    if (h.name === "blade_b") g.rotateY(Math.PI);
    g.translate(h.pivot[0] - hc[0], h.pivot[1] - hc[1], h.pivot[2] - hc[2]);
    pieces.push(g);
  }
  return mergeAligned(pieces);
}

// Merge geometries that may differ in their attributes (the hilt has marks, a blade model too): the ones all have
function mergeAligned(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = Object.keys(list[0].attributes).filter((n) => list.every((g) => g.getAttribute(n)));
  const total = list.reduce((n, g) => n + g.getAttribute("position").count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = list[0].getAttribute(name).itemSize;
    const arr = new Float32Array(total * size);
    let at = 0;
    for (const g of list) {
      const a = g.getAttribute(name);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) arr[(at + i) * size + c] = [a.getX, a.getY, a.getZ, a.getW][c].call(a, i);
      at += a.count;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// A saber's blade is a thin glowing line: this adds the soft halo round it (2026-10-21), a wider, paler copy of each glowing part in the
// translucent `haze` finish (mark 4), widened about the part's own axis (a blade lies along z) and no longer. A geometry with no glow, or
// no marks, comes back as it was
export const HALO_SCALE = 2.6;
export function withHalo(geometry: THREE.BufferGeometry, factor = HALO_SCALE): THREE.BufferGeometry {
  const mark = geometry.getAttribute("mark");
  const pos = geometry.getAttribute("position");
  if (!mark || !pos) return geometry;
  const parts = new Map<number, number[]>();
  for (let t = 0; t + 2 < pos.count; t += 3) {
    if (Math.round(mark.getX(t)) !== 2) continue;
    const p = partOf(geometry, t);
    if (!parts.has(p)) parts.set(p, []);
    parts.get(p)!.push(t);
  }
  if (!parts.size) return geometry;
  const total = [...parts.values()].reduce((n, l) => n + l.length * 3, 0);
  const names = Object.keys(geometry.attributes).filter((n) => ["position", "normal", "color", "mark"].includes(n));
  const arrays = Object.fromEntries(names.map((n) => [n, new Float32Array(total * geometry.getAttribute(n).itemSize)]));
  let at = 0;
  for (const triangles of parts.values()) {
    // The part's axis: the middle of its box in x and y
    const box = new THREE.Box3();
    for (const t of triangles) for (let v = 0; v < 3; v++) box.expandByPoint(new THREE.Vector3(pos.getX(t + v), pos.getY(t + v), pos.getZ(t + v)));
    const [cx, cy] = [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2];
    for (const t of triangles) for (let v = 0; v < 3; v++, at++) {
      for (const n of names) {
        const a = geometry.getAttribute(n);
        for (let c = 0; c < a.itemSize; c++) {
          let value = [a.getX, a.getY, a.getZ, a.getW][c].call(a, t + v);
          if (n === "position") value = c === 0 ? cx + (value - cx) * factor : c === 1 ? cy + (value - cy) * factor : value;
          else if (n === "color") value = value + (1 - value) * 0.5;
          else if (n === "mark" && c === 0) value = 4;
          arrays[n][at * a.itemSize + c] = value;
        }
      }
    }
  }
  const halo = new THREE.BufferGeometry();
  for (const n of names) halo.setAttribute(n, new THREE.BufferAttribute(arrays[n], geometry.getAttribute(n).itemSize));
  return mergeAligned([geometry, halo]);
}

// A copy of a geometry whose glowing vertices (a saber's blade, a lamp) are `hex` coloured: the wielder's blade colour. The marks say which
// vertices glow; nothing else changes
export function tintGlow(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const out = geometry.clone();
  const mark = geometry.getAttribute("mark");
  const src = geometry.getAttribute("color");
  if (!mark || !src) return out;
  const c = new THREE.Color(hex);
  const colours = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) {
    const glow = Math.round(mark.getX(i)) === 2;
    colours.set(glow ? [c.r, c.g, c.b] : [src.getX(i), src.getY(i), src.getZ(i)], i * 3);
  }
  out.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return out;
}
