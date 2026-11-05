// The sculpted body of a person (2026-11-04; the user: "a more AAA graphical feel to the NPCs/characters/beasts and their animations", and that
// Blender is there "to refine the models"). tools/blender/build-body.py makes the parts (torso, arm, fore, thigh, shin, head) once, with
// per-vertex ambient occlusion (`_AO`) and a region (`_REGION`: which of the person's dressed colours the vertex takes); models.tsx
// `buildHumanoid` draws them in place of the capsules and spheres it used before, once they are loaded (until then, and wherever a prosthesis
// or a species' special body needs the old ones, it draws those). A part is authored hanging from its own joint, along -y, at the size of a
// person of bulk 1; `fit` bends it to the points a pose gives (a shoulder, an elbow, a hand), stretching it between joints and keeping the
// ends (a hand, a boot) at their size. Pure but for THREE: tests/interiors/body.test.ts.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useSyncExternalStore } from "react";

export type PartName = "torso" | "arm" | "fore" | "thigh" | "shin" | "head";
// Which dressed colour a vertex takes, by part (the number is the vertex's `_REGION`)
//   torso: 0 trunk, 1 hips, 2 neck;  arm: 0 sleeve;  fore: 0 sleeve, 1 hand (the glove or the bare hand);  thigh: 0 legs;
//   shin: 0 legs, 1 boot;  head: 0 face, 3 ears
export const REGIONS: Record<PartName, number[]> = { torso: [0, 1, 2], arm: [0], fore: [0, 1], thigh: [0], shin: [0, 1], head: [0, 3] };
// The length of the segment each limb part was made for (from its joint to the next), in model units; what lies beyond (a hand, a boot) keeps its size
export const NOMINAL: Partial<Record<PartName, number>> = { arm: 0.225, fore: 0.19, thigh: 0.25, shin: 0.23 };

// One part: a geometry (position, normal, ao, index, and a mark for a beast's) for each region it has
export type Part = Record<number, THREE.BufferGeometry>;
// A part of a beast and what its file says of it (creature.glb, tools/blender/build-creature.py): where the code puts the eyes (x, y, z, radius,
// on the right side; the left is the mirror), where an ear's base stands, the joint a lower jaw opens about
export interface Piece { part: Part; eyes?: number[]; ear?: number[]; jaw?: number[] }
export type CreatureParts = Record<string, Piece>;
// The parts of a person, and `more`: what else body.glb has (the heads of the species with a muzzle, a snout or a beak, and the beak)
export type BodyParts = Record<PartName, Part> & { more?: CreatureParts };

// A file of parts, fetched once, shared by whatever draws with it: `get` is null before it is in (and for good if it could not be had: the
// figures then draw their primitives), `use` is for a React component that draws figures (it renders again when the parts arrive)
function shelf<T>(file: string, read: (scene: THREE.Object3D) => T) {
  let loaded: T | null = null;
  let pending: Promise<T | null> | null = null;
  const listeners = new Set<() => void>();
  const get = () => loaded;
  const load = (): Promise<T | null> => {
    if (!pending) {
      pending = new GLTFLoader().loadAsync(file).then((gltf) => {
        loaded = read(gltf.scene);
        listeners.forEach((l) => l());
        return loaded;
      }).catch(() => null);
    }
    return pending;
  };
  const use = (): T | null => {
    if (!pending && typeof window !== "undefined") load();
    return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, get, () => null);
  };
  // In tests (no fetch): hand the parts in
  const set = (p: T | null) => { loaded = p; pending = p ? Promise.resolve(p) : null; listeners.forEach((l) => l()); };
  return { get, load, use, set };
}
const TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
export const BODY_FILE = TOUCH ? "/figures/body.lo.glb" : "/figures/body.glb";
export const CREATURE_FILE = TOUCH ? "/figures/creature.lo.glb" : "/figures/creature.glb";
// The heads of people (2026-11-04, tools/blender/build-head.py): `head_m` and `head_f`, each with texture coordinates into one atlas (textures/figure/head),
// and the hair, brows and beards (tools/blender/build-hair.py)
export const HEAD_FILE = TOUCH ? "/figures/head.lo.glb" : "/figures/head.glb";
export const HAIR_FILE = TOUCH ? "/figures/hair.lo.glb" : "/figures/hair.glb";
// The blasters and their scopes (2026-11-05, tools/blender/build-weapons.py): `gun_<design>` and `scope_<size>`, each with its regions; the sockets are in shared/art/weaponKit.json
export const WEAPON_FILE = TOUCH ? "/figures/weapons.lo.glb" : "/figures/weapons.glb";

const floatsOf = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size = a.itemSize) => {
  const out = new Float32Array(a.count * size);
  const read = [a.getX, a.getY, a.getZ, a.getW];
  for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) out[i * size + c] = read[c].call(a, i);
  return out;
};

// A mesh's triangles split by region (a triangle takes its first vertex's), each region compacted to the vertices it uses
export function splitRegions(position: Float32Array, normal: Float32Array, ao: Float32Array, region: Float32Array, index: ArrayLike<number>, mark?: Float32Array, uv?: Float32Array): Part {
  const part: Part = {};
  const maps = new Map<number, { remap: Map<number, number>; verts: number[]; tris: number[] }>();
  for (let t = 0; t + 2 < index.length; t += 3) {
    const r = Math.round(region[index[t]]);
    let m = maps.get(r);
    if (!m) maps.set(r, (m = { remap: new Map(), verts: [], tris: [] }));
    for (let k = 0; k < 3; k++) {
      const v = index[t + k];
      let to = m.remap.get(v);
      if (to === undefined) { to = m.verts.length; m.remap.set(v, to); m.verts.push(v); }
      m.tris.push(to);
    }
  }
  for (const [r, m] of maps) {
    const n = m.verts.length;
    const p = new Float32Array(n * 3);
    const nr = new Float32Array(n * 3);
    const a = new Float32Array(n);
    const k = mark ? new Float32Array(n) : undefined;
    const t = uv ? new Float32Array(n * 2) : undefined;
    m.verts.forEach((v, i) => { p.set(position.subarray(v * 3, v * 3 + 3), i * 3); nr.set(normal.subarray(v * 3, v * 3 + 3), i * 3); a[i] = ao[v]; if (k) k[i] = mark![v]; if (t) t.set(uv!.subarray(v * 2, v * 2 + 2), i * 2); });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nr, 3));
    g.setAttribute("ao", new THREE.BufferAttribute(a, 1));
    if (k) g.setAttribute("mark", new THREE.BufferAttribute(k, 1));
    // (a part with texture coordinates keeps them: a head, whose normal map is baked for them, and a hair card, drawn with a strand map)
    if (t) g.setAttribute("uv", new THREE.BufferAttribute(t, 2));
    g.setIndex(m.tris);
    part[r] = g;
  }
  return part;
}

// Every mesh of a loaded file as a piece, named for its mesh
export function piecesOf(scene: THREE.Object3D): CreatureParts {
  const pieces: CreatureParts = {};
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = mesh.name.replace(/[._]d+$/, "");
    const g = mesh.geometry;
    const count = g.attributes.position.count;
    const position = floatsOf(g.attributes.position, 3);
    const normal = g.attributes.normal ? floatsOf(g.attributes.normal, 3) : new Float32Array(count * 3);
    const ao = g.attributes._ao ? floatsOf(g.attributes._ao, 1) : new Float32Array(count).fill(1);
    const region = g.attributes._region ? floatsOf(g.attributes._region, 1) : new Float32Array(count);
    const mark = g.attributes._mark ? floatsOf(g.attributes._mark, 1) : undefined;
    // (glTF counts v down from the top of a picture; the loader here turns pictures over, as three's own textures are, so v counts up)
    const uv = g.attributes.uv ? floatsOf(g.attributes.uv, 2).map((x, i) => (i % 2 ? 1 - x : x)) : undefined;
    const index = g.index ? g.index.array : Array.from({ length: count }, (_, i) => i);
    const u = mesh.userData as { eyes?: number[]; ear?: number[]; jaw?: number[] };
    pieces[name] = { part: splitRegions(position, normal, ao, region, index, mark, uv), eyes: u.eyes, ear: u.ear, jaw: u.jaw };
  });
  return pieces;
}

// The parts of a loaded body.glb (one mesh each, named for the part)
export function partsOf(scene: THREE.Object3D): BodyParts {
  const pieces = piecesOf(scene);
  if (!(["torso", "arm", "fore", "thigh", "shin", "head"] as PartName[]).every((n) => pieces[n])) throw new Error("body.glb lacks a part");
  const body = Object.fromEntries((["torso", "arm", "fore", "thigh", "shin", "head"] as PartName[]).map((n) => [n, pieces[n].part])) as unknown as BodyParts;
  body.more = Object.fromEntries(Object.entries(pieces).filter(([n]) => !(n in body)));
  return body;
}

const people = shelf(BODY_FILE, partsOf);
const beasts = shelf(CREATURE_FILE, piecesOf);
const faces = shelf(HEAD_FILE, piecesOf);
const hairs = shelf(HAIR_FILE, piecesOf);
const guns = shelf(WEAPON_FILE, piecesOf);
export const loadBody = people.load;
// The parts, once they are in (null before, and for good if they could not be had: the figures then draw their primitives)
export const bodyParts = people.get;
// For a React component that draws people: it renders again when the parts arrive
export const useBodyParts = people.use;
export const setBodyParts = people.set;
// The same for the heads of beasts (and what the species with a muzzle or a beak are drawn with)
export const loadCreature = beasts.load;
export const creatureParts = beasts.get;
export const useCreatureParts = beasts.use;
export const setCreatureParts = beasts.set;
// The heads of people (`head_m`, `head_f`) and the hair (`hair_*`, `beard_*`, `brows`), once they are in
export const faceParts = faces.get;
export const useFaceParts = faces.use;
export const setFaceParts = faces.set;
export const hairParts = hairs.get;
export const useHairParts = hairs.use;
export const setHairParts = hairs.set;
// The blasters and scopes, once they are in
export const gunParts = guns.get;
export const useGunParts = guns.use;
export const setGunParts = guns.set;

// ---- Fitting ---------------------------------------------------------------------------------------------------------------------

const DOWN = new THREE.Vector3(0, -1, 0);
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const D = new THREE.Vector3();
export interface Fit {
  // Where the part's joint goes and where its segment ends (a shoulder and an elbow), in the frame it is drawn in
  from: [number, number, number];
  to: [number, number, number];
  // The part's own segment length (NOMINAL), and the width of the person (their bulk) and a mirror (-1 the right side: the parts are made for the left)
  nominal: number;
  bulk: number;
  side?: 1 | -1;
}
// A copy of a region of a limb part laid along `from` -> `to`: the length between the joints is stretched to fit, what lies past the far joint
// is carried on at its own size, the cross-section scaled by the bulk. Normals turn with the limb.
export function fitLimb(g: THREE.BufferGeometry, fit: Fit): THREE.BufferGeometry {
  const out = g.clone();
  const p = out.attributes.position as THREE.BufferAttribute;
  const n = out.attributes.normal as THREE.BufferAttribute;
  D.set(fit.to[0] - fit.from[0], fit.to[1] - fit.from[1], fit.to[2] - fit.from[2]);
  const length = D.length();
  Q.setFromUnitVectors(DOWN, length > 1e-6 ? D.clone().normalize() : DOWN);
  const stretch = length / fit.nominal;
  const side = fit.side ?? 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * side * fit.bulk;
    const d = -p.getY(i);
    const z = p.getZ(i) * fit.bulk;
    // before the joint nothing stretches; between the joints it does; past the far joint the part keeps its size
    const along = d <= 0 ? d : d <= fit.nominal ? d * stretch : length + (d - fit.nominal);
    V.set(x, -along, z).applyQuaternion(Q);
    p.setXYZ(i, V.x + fit.from[0], V.y + fit.from[1], V.z + fit.from[2]);
    V.set(n.getX(i) * side, n.getY(i), n.getZ(i)).applyQuaternion(Q);
    n.setXYZ(i, V.x, V.y, V.z);
  }
  if (side < 0) flip(out);
  return out;
}
// A copy of a region of the trunk or the head: the width and depth scaled by the bulk, a mirror when asked, moved by `at`; the head is scaled
// the way its skull is
export function fitBlock(g: THREE.BufferGeometry, scale: [number, number, number], at: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const out = g.clone();
  const p = out.attributes.position as THREE.BufferAttribute;
  const n = out.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * scale[0] + at[0], p.getY(i) * scale[1] + at[1], p.getZ(i) * scale[2] + at[2]);
    // (a normal of a stretched shape turns by the inverse scale)
    V.set(n.getX(i) / scale[0], n.getY(i) / scale[1], n.getZ(i) / scale[2]).normalize();
    n.setXYZ(i, V.x, V.y, V.z);
  }
  return out;
}
function flip(g: THREE.BufferGeometry) {
  const idx = g.index!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.index!.needsUpdate = true;
}
