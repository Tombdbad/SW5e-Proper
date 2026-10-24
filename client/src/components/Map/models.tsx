import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { create } from "zustand";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";
import { speederKind } from "@shared/logic";
import { boxUV, surfaceMaterial, SURFACE_GRAIN, WALL_TILE, wallMaterial, type WallSet } from "./surfaces";
import { skinOf, type RoomLook } from "./interiors/wealth";
import { useModels, splitByFinish, type MarkFinish } from "./interiors/assets";
import { codeTurn, fitPiece, maxHeightOf, pieceOf, stretches, type PackId } from "./interiors/packs";
import type { Tone } from "./interiors/tones";
import { advance, bob, LIMB, limbMaterial, pose as poseLimbs, standing } from "./interiors/limbs";
import { handOf, wantsOf, suitWorn, glovesOf, bootsOf, hasBandolier, type Gear, type Want, type Slot, type SuitStyle } from "./interiors/gear";
import { bodyAnchor, holdAt, offHandAt, headFit, torsoFit, moduleAnchor, type HeadTraits } from "./interiors/anchors";
import { composeSaber, tintGlow, withHalo, modelInfo, itemRef, assetPath } from "./interiors/items";
import { toneNameOf, type KitLook } from "./interiors/kitbash";
import { TONES } from "./interiors/tones";
import { hullWear, speederWear, type Wear } from "./interiors/wear";

// ---------------------------------------------------------------------------------------------
// The 3D models of the map: people, droids, creatures, furniture, ships, vehicles and buildings.
// Nothing is downloaded: every model is built from curved solids (turned profiles, tubes bent
// along a curve, extruded outlines, rounded boxes, rocks shaped by noise) and baked once into one
// mesh per finish (matte, sheen, glow, glass), so that a model is drawn in two or three calls
// however many parts it has. Baked models are shared by everyone drawn with the same key and let
// go a minute after the last of them leaves the map.
// ---------------------------------------------------------------------------------------------

export type V3 = [number, number, number];
// matte: stone, plaster, skin, fur; sheen: metal, armor, polished hulls, carapace; glow: lights,
// screens, blades, eyes; glass: canopies and tanks; haze: force fields, holograms, steam;
// cloth: thin sheets seen from both sides (awnings, capes, sails, wings); stone, bark, leaf: the same parts drawn with a texture
// (rock, tree bark, leaves; surfaces.tsx), for the palette colours a builder names as those (Kit.surfaces)
export type Finish = "matte" | "sheen" | "glow" | "glass" | "haze" | "cloth" | "stone" | "bark" | "leaf";
export const FINISHES: Finish[] = ["matte", "sheen", "glow", "glass", "haze", "cloth", "stone", "bark", "leaf"];

export const MATERIALS: Record<Finish, THREE.Material> = {
  matte: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color("#0a0a0a") }),
  sheen: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 55, specular: new THREE.Color("#5a5a5a"), emissive: new THREE.Color("#0a0a0a") }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.5, shininess: 110, specular: new THREE.Color("#ffffff"), depthWrite: false }),
  haze: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  cloth: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color("#0a0a0a") }),
  stone: surfaceMaterial("stone", "rock_face_03", { vertexColors: true, lift: 1.25, parallax: 0.04 }),
  bark: surfaceMaterial("bark", "bark_brown_02", { vertexColors: true, lift: 1.5, parallax: 0.03 }),
  leaf: surfaceMaterial("leaves", "forest_leaves_02", { vertexColors: true, lift: 1.9, parallax: 0.02, shininess: 4 }),
};

interface PartOptions {
  at?: V3;
  rot?: V3;
  scale?: number | V3;
  finish?: Finish;
}

const matrixOf = (at?: V3, rot?: V3, scale?: number | V3) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...(at ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))),
    typeof scale === "number" ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...(scale ?? [1, 1, 1])),
  );

const noise = new ImprovedNoise();

// A bent tube whose thickness changes along it (a limb, a tail, a horn, a trunk). `radius` is
// given for the way along it, 0 at the first point and 1 at the last.
function taperedTube(points: V3[], radius: number | ((t: number) => number), along = 10, around = 8, caps = true): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(along, false);
  const r = typeof radius === "number" ? () => radius : radius;
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= along; i++) {
    const t = i / along;
    const p = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= around; j++) {
      const v = (j / around) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      const rr = r(t);
      position.push(p.x + rr * nx, p.y + rr * ny, p.z + rr * nz);
      normal.push(nx, ny, nz);
    }
  }
  for (let j = 1; j <= around; j++) {
    for (let i = 1; i <= along; i++) {
      const a = (around + 1) * (i - 1) + (j - 1);
      const b = (around + 1) * i + (j - 1);
      const c = (around + 1) * i + j;
      const d = (around + 1) * (i - 1) + j;
      index.push(a, b, d, b, c, d);
    }
  }
  // A cap on each end: a fan round the end's middle
  if (caps) {
    for (const end of [0, along]) {
      const p = curve.getPointAt(end / along);
      const tangent = curve.getTangentAt(end / along).multiplyScalar(end ? 1 : -1);
      const centre = position.length / 3;
      position.push(p.x, p.y, p.z);
      normal.push(tangent.x, tangent.y, tangent.z);
      for (let j = 0; j < around; j++) {
        const a = end * (around + 1) + j;
        if (end) index.push(centre, a + 1, a);
        else index.push(centre, a, a + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geo.setIndex(index);
  return geo;
}

// A rounded outline: a rectangle whose corners are each cut to its own radius (0 a square corner)
export function roundedRect(w: number, h: number, radii: [number, number, number, number], x = 0, y = 0): THREE.Shape {
  const [a, b, c, d] = radii.map((r) => Math.max(0, Math.min(r, w / 2, h / 2)));
  const s = new THREE.Shape();
  s.moveTo(x + a, y);
  s.lineTo(x + w - b, y);
  if (b) s.quadraticCurveTo(x + w, y, x + w, y + b);
  s.lineTo(x + w, y + h - c);
  if (c) s.quadraticCurveTo(x + w, y + h, x + w - c, y + h);
  s.lineTo(x + d, y + h);
  if (d) s.quadraticCurveTo(x, y + h, x, y + h - d);
  s.lineTo(x, y + a);
  if (a) s.quadraticCurveTo(x, y, x + a, y);
  return s;
}

// An arch: straight sides and a round top, `w` wide and `h` high, standing on y = 0
export function archShape(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, Math.max(0, h - r));
  s.absarc(0, Math.max(0, h - r), r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(-r, 0);
  return s;
}

// The finish a colour is drawn with by a builder's `surfaces`: its own, or a shade of one (`shade` scales a colour in linear light, so
// a shade keeps the ratios of its channels to its base colour)
function surfaceOf(surfaces: Kit["surfaces"], color: string | THREE.Color): Finish | undefined {
  if (!surfaces || typeof color !== "string") return undefined;
  if (surfaces[color]) return surfaces[color];
  const c = new THREE.Color(color);
  const [r, g, b] = [c.r, c.g, c.b];
  for (const [base, finish] of Object.entries(surfaces)) {
    if (!finish) continue;
    const s = new THREE.Color(base);
    const lit = [[r, s.r], [g, s.g], [b, s.b]].filter(([, sv]) => sv > 0.02);
    if (!lit.length) continue;
    const k = lit[0][0] / lit[0][1];
    const dark = [[r, s.r], [g, s.g], [b, s.b]].filter(([, sv]) => sv <= 0.02);
    if (k > 0 && lit.every(([cv, sv]) => Math.abs(cv / sv - k) < 0.03 * k) && dark.every(([cv]) => cv <= 0.03)) return finish;
  }
  return undefined;
}

export class Kit {
  // Built for a walking figure: every vertex is given the limb it belongs to and the point that limb swings about (interiors/limbs.ts)
  animated = false;
  private limbNow = { index: 0, pivot: new THREE.Vector3() };
  readonly parts: { geo: THREE.BufferGeometry; finish: Finish }[] = [];
  // Turns every colour drawn into another (a room's own woods, cloth and metal; see interiors/wealth.ts `skinOf`)
  skin?: (color: THREE.Color, finish: Finish) => THREE.Color;
  // The finish of the parts drawn in each colour, for the colours a builder names as textured (stone, bark, leaf)
  surfaces?: Partial<Record<string, Finish>>;
  private frames: THREE.Matrix4[] = [new THREE.Matrix4()];

  // Draws what `draw` draws moved, turned and scaled together
  group(at: V3 | undefined, rot: V3 | undefined, scale: number | V3 | undefined, draw: () => void) {
    this.frames.push(this.frames[this.frames.length - 1].clone().multiply(matrixOf(at, rot, scale)));
    draw();
    this.frames.pop();
  }

  // Draws a limb that swings about `pivot` (in the current frame) in an animated build: 1 and 2 the legs, 3 and 4 the arms (limbs.ts LIMB)
  limb(index: number, pivot: V3, draw: () => void) {
    const was = this.limbNow;
    this.limbNow = { index, pivot: new THREE.Vector3(...pivot).applyMatrix4(this.frames[this.frames.length - 1]) };
    draw();
    this.limbNow = was;
  }

  // The same thing on both sides: `draw` is given 1 for the right and -1 for the left
  pair(draw: (side: 1 | -1) => void) {
    draw(1);
    draw(-1);
  }

  add(source: THREE.BufferGeometry, color: string | THREE.Color, { at, rot, scale, finish: asked }: PartOptions = {}) {
    // A part takes the finish its builder asked for, else the one its colour is named for in `surfaces` (a palette's bark, leaf or stone), else matte
    const finish = asked ?? surfaceOf(this.surfaces, color) ?? "matte";
    let geo = source;
    for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
    if (!geo.index) {
      const count = geo.attributes.position.count;
      geo.setIndex(Array.from({ length: count }, (_, i) => i));
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const m = this.frames[this.frames.length - 1].clone().multiply(matrixOf(at, rot, scale));
    geo.applyMatrix4(m);
    // A mirrored part is turned inside out: turn its faces back
    if (m.determinant() < 0) {
      const idx = geo.index!.array as Uint16Array | Uint32Array;
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      geo.index!.needsUpdate = true;
    }
    const c = new THREE.Color(color);
    if (this.skin) c.copy(this.skin(c, finish));
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // Every part of an animated build carries the attributes (merged parts must have the same set)
    if (this.animated) {
      const { index, pivot } = this.limbNow;
      geo.setAttribute("limb", new THREE.BufferAttribute(new Float32Array(n).fill(index), 1));
      const pivots = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pivots.set([pivot.x, pivot.y, pivot.z], i * 3);
      geo.setAttribute("pivot", new THREE.BufferAttribute(pivots, 3));
    }
    this.parts.push({ geo, finish });
    return this;
  }

  // A loaded model (a weapon, a case, a limb of a prosthesis) set in the figure: its own colours kept, moved by the current frame and,
  // in an animated build, on the current limb. The model is copied; the shared one is never changed
  addModel(source: THREE.BufferGeometry, o: PartOptions = {}) {
    // An item model says per vertex how it is drawn (metal, matte, glow, cloth): each finish is added as a part of its own
    for (const { finish, geo } of splitByFinish(source, (o.finish ?? "sheen") as MarkFinish)) this.addModelPart(geo, { ...o, finish });
    return this;
  }
  private addModelPart(source: THREE.BufferGeometry, { at, rot, scale, finish = "sheen" }: PartOptions = {}) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", source.getAttribute("position").clone());
    if (source.getAttribute("normal")) geo.setAttribute("normal", source.getAttribute("normal").clone());
    geo.setAttribute("color", source.getAttribute("color").clone());
    const n = geo.attributes.position.count;
    geo.setIndex(Array.from({ length: n }, (_, i) => i));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(this.frames[this.frames.length - 1].clone().multiply(matrixOf(at, rot, scale)));
    if (this.animated) {
      const { index, pivot } = this.limbNow;
      geo.setAttribute("limb", new THREE.BufferAttribute(new Float32Array(n).fill(index), 1));
      const pivots = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pivots.set([pivot.x, pivot.y, pivot.z], i * 3);
      geo.setAttribute("pivot", new THREE.BufferAttribute(pivots, 3));
    }
    this.parts.push({ geo, finish });
    return this;
  }

  // A box; with `round` its edges are rounded off by that much
  box(size: V3, color: string, o: PartOptions & { round?: number } = {}) {
    const round = Math.min(o.round ?? 0, ...size.map((s) => s / 2 - 0.001));
    // Small boxes get a single bevel; it reads as rounded from where the map is looked at
    return this.add(round > 0.004 ? new RoundedBoxGeometry(size[0], size[1], size[2], Math.max(...size) > 0.6 ? 2 : 1, round) : new THREE.BoxGeometry(...size), color, o);
  }

  // A cylinder standing on its middle; `top` gives a cone or a tapered post, `arc` a part of one
  cyl(r: number, h: number, color: string, o: PartOptions & { top?: number; seg?: number; open?: boolean; arc?: number; start?: number } = {}) {
    return this.add(new THREE.CylinderGeometry(o.top ?? r, r, h, o.seg ?? (r > 0.3 ? 16 : 10), 1, o.open ?? false, o.start ?? 0, o.arc ?? Math.PI * 2), color, o);
  }

  // `theta` cuts it from the top down (a cap, a hemisphere), `phi` round the upright axis
  sphere(r: number, color: string, o: PartOptions & { seg?: [number, number]; half?: boolean; theta?: [number, number]; phi?: [number, number] } = {}) {
    const [w, h] = o.seg ?? (r > 0.3 ? [16, 12] : [10, 8]);
    const theta = o.theta ?? (o.half ? [0, Math.PI / 2] : [0, Math.PI]);
    const phi = o.phi ?? [0, Math.PI * 2];
    return this.add(new THREE.SphereGeometry(r, w, h, phi[0], phi[1], theta[0], theta[1]), color, o);
  }

  // A straight rod (a rifle, a staff, a strut) from one point to another
  rod(a: V3, b: V3, r: number, color: string, o: PartOptions & { square?: boolean; seg?: number } = {}) {
    const from = new THREE.Vector3(...a);
    const dir = new THREE.Vector3(...b).sub(from);
    const length = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    const mid = from.add(dir.multiplyScalar(0.5));
    const geo = o.square ? new THREE.BoxGeometry(r * 2, length, r * 2) : new THREE.CylinderGeometry(r, r, length, o.seg ?? 8);
    return this.add(geo, color, { ...o, at: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z] });
  }

  capsule(r: number, length: number, color: string, o: PartOptions & { seg?: number } = {}) {
    return this.add(new THREE.CapsuleGeometry(r, length, 3, o.seg ?? 8), color, o);
  }

  cone(r: number, h: number, color: string, o: PartOptions & { seg?: number } = {}) {
    return this.add(new THREE.ConeGeometry(r, h, o.seg ?? 12), color, o);
  }

  torus(R: number, r: number, color: string, o: PartOptions & { arc?: number; seg?: [number, number] } = {}) {
    const [radial, tubular] = o.seg ?? [6, 18];
    return this.add(new THREE.TorusGeometry(R, r, radial, tubular, o.arc ?? Math.PI * 2), color, o);
  }

  // A shape turned round the upright axis: points are [radius, height] from bottom to top
  lathe(profile: [number, number][], color: string, o: PartOptions & { seg?: number; arc?: number; start?: number } = {}) {
    return this.add(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), o.seg ?? 14, o.start ?? 0, o.arc ?? Math.PI * 2), color, o);
  }

  tube(points: V3[], radius: number | ((t: number) => number), color: string, o: PartOptions & { along?: number; around?: number; caps?: boolean } = {}) {
    return this.add(taperedTube(points, radius, o.along ?? 10, o.around ?? 8, o.caps ?? true), color, o);
  }

  // An outline in the x-y plane pushed out `depth` along z, its edges softened by `bevel` (the
  // softened edge stays inside the outline, so that the solid keeps the size it was drawn at)
  extrude(shape: THREE.Shape, depth: number, color: string, o: PartOptions & { bevel?: number; curve?: number } = {}) {
    const bevel = o.bevel ?? 0;
    return this.add(
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: o.curve ?? 10 }),
      color,
      o,
    );
  }

  // A lump shaped by noise: a rock, a boulder, a body of no fixed shape. `rough` is how far it
  // strays from round, `seed` makes each one its own; `smooth` keeps it soft (a creature), else
  // it is faceted (stone)
  blob(r: number, color: string, o: PartOptions & { seed?: number; rough?: number; detail?: number; smooth?: boolean; squash?: V3 } = {}) {
    const big = r * Math.max(...(o.squash ?? [1, 1, 1])) > 0.25;
    const geo = o.smooth ? new THREE.SphereGeometry(r, big ? 18 : 12, big ? 13 : 9) : new THREE.IcosahedronGeometry(r, o.detail ?? 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const seed = o.seed ?? 1;
    const rough = o.rough ?? 0.25;
    const squash = o.squash ?? [1, 1, 1];
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      const k = 1 + rough * noise.noise(n.x * 1.7 + seed, n.y * 1.7 + seed * 0.37, n.z * 1.7 - seed);
      p.setXYZ(i, v.x * k * squash[0], v.y * k * squash[1], v.z * k * squash[2]);
    }
    geo.deleteAttribute("normal");
    if (o.smooth) geo.computeVertexNormals();
    else {
      const flat = geo.index ? geo.toNonIndexed() : geo;
      flat.computeVertexNormals();
      return this.add(flat, color, o);
    }
    return this.add(geo, color, o);
  }

  // `uv` gives the painted finishes (matte, sheen) the box-projected coordinates that the hull textures are laid by
  bake(uv = 0): Baked {
    const out: Baked = {};
    for (const finish of FINISHES) {
      const geos = this.parts.filter((p) => p.finish === finish).map((p) => p.geo);
      if (!geos.length) continue;
      let merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      if (geos.length > 1) for (const g of geos) g.dispose();
      // The textured finishes are projected at their own scale; the painted ones at the hull's, when a hull asks for it
      const grain = finish === "stone" || finish === "bark" || finish === "leaf" ? SURFACE_GRAIN[finish] : uv && (finish === "matte" || finish === "sheen") ? uv : 0;
      if (grain) {
        const flat = boxUV(merged, grain);
        merged.dispose();
        merged = flat;
      }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      out[finish] = merged;
    }
    return out;
  }
}


export type Baked = Partial<Record<Finish, THREE.BufferGeometry>>;

const CACHE = new Map<string, { model: Baked; users: number; idle?: ReturnType<typeof setTimeout> }>();

// A model by its key, built the first time it is wanted and shared after that
export function useModel(key: string, build: (k: Kit) => void, uv = 0): Baked {
  const entry = useMemo(() => {
    let e = CACHE.get(key);
    if (!e) {
      const kit = new Kit();
      build(kit);
      e = { model: kit.bake(uv), users: 0 };
      CACHE.set(key, e);
    }
    return e;
  }, [key]);
  useEffect(() => {
    entry.users++;
    if (entry.idle) clearTimeout(entry.idle);
    return () => {
      entry.users--;
      if (entry.users > 0) return;
      entry.idle = setTimeout(() => {
        if (entry.users > 0 || CACHE.get(key) !== entry) return;
        for (const g of Object.values(entry.model)) g?.dispose();
        CACHE.delete(key);
      }, 60000);
    };
  }, [entry]);
  return entry.model;
}

// The meshes of a baked model; `shadow` says whether it casts one
// With `wear` the painted finishes (matte, sheen) are drawn as a hull: panel plates in a normal map, and grime, rust, scratches and scorching
// by the wear's steps (see hullMaterials); plain until the textures are in
export function Model({ id, build, shadow = true, position, rotation, scale, wear, children }: { id: string; build: (k: Kit) => void; shadow?: boolean; position?: V3; rotation?: V3; scale?: number | V3; wear?: Wear; children?: ReactNode }) {
  const m = useModel(wear ? `${id}|uv${wear.grain ?? 1}` : id, build, wear ? wear.grain ?? 1 : 0);
  const hull = useHull(wear);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {m.matte && <mesh geometry={m.matte} material={hull?.matte ?? MATERIALS.matte} castShadow={shadow} receiveShadow />}
      {m.sheen && <mesh geometry={m.sheen} material={hull?.sheen ?? MATERIALS.sheen} castShadow={shadow} receiveShadow />}
      {m.glow && <mesh geometry={m.glow} material={MATERIALS.glow} />}
      {m.glass && <mesh geometry={m.glass} material={MATERIALS.glass} renderOrder={1} />}
      {m.haze && <mesh geometry={m.haze} material={MATERIALS.haze} renderOrder={2} />}
      {m.cloth && <mesh geometry={m.cloth} material={MATERIALS.cloth} castShadow={shadow} receiveShadow />}
      {m.stone && <mesh geometry={m.stone} material={MATERIALS.stone} castShadow={shadow} receiveShadow />}
      {m.bark && <mesh geometry={m.bark} material={MATERIALS.bark} castShadow={shadow} receiveShadow />}
      {m.leaf && <mesh geometry={m.leaf} material={MATERIALS.leaf} castShadow={shadow} receiveShadow />}
      {children}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Hull materials (2026-10-21). The textures are generated by tools/build-hull-textures.mjs: `wear` (R grime, G scratches and chips,
// B rust), `damage` (scorch) and `panels_normal`. A material is one of the 3 x 3 steps of age and damage, made once and shared (its
// program is the same for all of them: only the level in its uniform differs). Phong for both finishes, as Lambert takes no normal map.
// ---------------------------------------------------------------------------------------------

type HullMaps = { wear: THREE.Texture; damage: THREE.Texture; panels: THREE.Texture };
const PANEL_TILE = 3; // model units in one repeat of the plates
let hullMaps: HullMaps | undefined;
let hullLoading: Promise<HullMaps> | undefined;
function loadHullMaps(): Promise<HullMaps> {
  hullLoading ??= Promise.all(["wear.png", "damage.png", "panels_normal.png"].map((f) => new THREE.TextureLoader().loadAsync(`/textures/hull/${f}`))).then(([wear, damage, panels]) => {
    for (const t of [wear, damage, panels]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
    }
    panels.repeat.set(1 / PANEL_TILE, 1 / PANEL_TILE);
    hullMaps = { wear, damage, panels };
    return hullMaps;
  });
  return hullLoading;
}

const HULLS = new Map<string, Record<"matte" | "sheen", THREE.Material>>();
function hullMaterials(maps: HullMaps, { age, damage }: Wear) {
  const key = `${age}${damage}`;
  let set = HULLS.get(key);
  if (!set) {
    const make = (finish: "matte" | "sheen") => {
      const m = new THREE.MeshPhongMaterial({
        vertexColors: true,
        shininess: finish === "sheen" ? 55 : 8,
        specular: new THREE.Color(finish === "sheen" ? "#5a5a5a" : "#111111"),
        emissive: new THREE.Color("#0a0a0a"),
        normalMap: maps.panels,
        normalScale: new THREE.Vector2(0.8, 0.8),
      });
      m.onBeforeCompile = (shader) => {
        shader.uniforms.wearMap = { value: maps.wear };
        shader.uniforms.damageMap = { value: maps.damage };
        shader.uniforms.wearLevel = { value: new THREE.Vector2(age / 2, damage / 2) };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec2 vWearUv;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vWearUv = uv;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>
uniform sampler2D wearMap;
uniform sampler2D damageMap;
uniform vec2 wearLevel;
varying vec2 vWearUv;
// How much of a mask a level of wear covers (the masks are ranked, so a level covers about that share)
float cover( float m, float amount ) { return smoothstep( 1.0 - amount, 1.2 - amount, m ); }`)
          .replace("#include <color_fragment>", `#include <color_fragment>
  {
    vec3 wm = texture2D( wearMap, vWearUv * 0.5 ).rgb;
    float dm = texture2D( damageMap, vWearUv * 0.35 ).r;
    float age = wearLevel.x;
    diffuseColor.rgb *= 1.0 - 0.5 * cover( wm.r, 0.1 * age + 0.75 * age * age );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.42, 0.2, 0.1 ) * ( 0.7 + 0.6 * wm.r ), cover( wm.b, 0.26 * age * age ) * 0.7 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.66, 0.68, 0.7 ), cover( wm.g, age * 0.7 ) * 0.7 );
    diffuseColor.rgb *= 1.0 - 0.9 * cover( dm, wearLevel.y * 0.9 );
  }`);
      };
      return m;
    };
    set = { matte: make("matte"), sheen: make("sheen") };
    HULLS.set(key, set);
  }
  return set;
}

// The hull materials for a wear, once the textures have come (undefined before, and for a model that has no wear)
function useHull(wear?: Wear) {
  const [maps, setMaps] = useState(hullMaps);
  useEffect(() => {
    if (!wear || maps) return;
    let live = true;
    loadHullMaps().then((m) => live && setMaps(m)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [!!wear, maps]);
  return wear && maps ? hullMaterials(maps, wear) : undefined;
}

// How many models are baked now (for the play-through test and the gallery)
export const bakedCount = () => CACHE.size;

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

export const hue = (text: string) => Array.from(text).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 360, 7);
export const pickOf = <T,>(list: T[], text: string, salt = 0): T => list[(hue(text) + salt * 7) % list.length];
const shade = (color: string, k: number) => `#${new THREE.Color(color).multiplyScalar(k).getHexString()}`;
const mix = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

export const C = {
  steel: "#7b8794",
  steelLight: "#aeb6bd",
  steelDark: "#59636d",
  gunmetal: "#3a424b",
  black: "#15191e",
  white: "#e9edf0",
  wood: "#8b5e3c",
  woodDark: "#5f3f28",
  olive: "#6f7448",
  rock: "#6d6a66",
  glow: "#5ad1ff",
  amber: "#f0a03c",
  red: "#e5484d",
  green: "#58c98b",
  gold: "#d8b45a",
  cloth: "#8a7a62",
};
export { shade, mix };

// A shape drawn on the floor plan ([x, z] points, z running south as the map's squares do), to be
// stood up with `upright`
export function planShape(points: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  return s;
}
// A rounded rectangle on the floor plan, centred on the origin, `w` along x and `d` along z;
// radii for the north-west, north-east, south-east and south-west corners
export function planRect(w: number, d: number, r: number | [number, number, number, number]): THREE.Shape {
  const [nw, ne, se, sw] = typeof r === "number" ? [r, r, r, r] : r;
  // roundedRect runs from its lowest y, which is the plan's south once z is turned into -y
  return roundedRect(w, d, [sw, se, ne, nw], -w / 2, -d / 2);
}

// Stands a floor-plan outline up from y = `y`, `height` tall (a bevel softens its edges)
function upright(k: Kit, shape: THREE.Shape, height: number, color: string, o: PartOptions & { bevel?: number; y?: number; curve?: number } = {}) {
  const bevel = Math.min(o.bevel ?? 0, height / 3);
  const [x, , z] = o.at ?? [0, 0, 0];
  return k.extrude(shape, Math.max(0.001, height - bevel * 2), color, { ...o, bevel, at: [x, (o.y ?? 0) + bevel, z], rot: [-Math.PI / 2, 0, 0] });
}

// A slab with rounded corners lying flat, centred on the origin
function slab(k: Kit, w: number, d: number, height: number, color: string, o: PartOptions & { r?: number; y?: number; bevel?: number } = {}) {
  return upright(k, planRect(w, d, o.r ?? Math.min(w, d) * 0.2), height, color, { ...o, bevel: o.bevel ?? Math.min(0.03, height / 3) });
}

// A thin curved wall: part of a ring `R` across, `t` thick, `h` high, from `start` round `arc`
// (radians, 0 pointing south, as cylinders are drawn)
function shell(k: Kit, R: number, t: number, h: number, color: string, o: PartOptions & { start?: number; arc?: number; y?: number } = {}) {
  const y = o.y ?? 0;
  return k.lathe([[R, y], [R + t, y], [R + t, y + h], [R, y + h], [R, y]], color, { ...o, seg: 24, start: o.start ?? 0, arc: o.arc ?? Math.PI * 2 });
}

// Small turned things: a stool, a bottle, a drum
function stool(k: Kit, at: V3, color = C.woodDark, top = "#7a3b3b") {
  k.lathe([[0.1, 0], [0.1, 0.02], [0.03, 0.04], [0.025, 0.26], [0.06, 0.28], [0.12, 0.3], [0.12, 0.34], [0, 0.35]], color, { at, seg: 12, finish: "sheen" });
  k.cyl(0.12, 0.05, top, { at: [at[0], at[1] + 0.355, at[2]], seg: 14 });
}
function bottle(k: Kit, at: V3, color: string, glow = false) {
  k.lathe([[0, 0], [0.035, 0], [0.04, 0.02], [0.04, 0.1], [0.015, 0.14], [0.012, 0.19], [0, 0.19]], color, { at, seg: 8, finish: glow ? "glow" : "glass" });
}
function drum(k: Kit, at: V3, r: number, h: number, color: string) {
  k.lathe([[0, 0], [r * 0.92, 0], [r, h * 0.06], [r, h * 0.3], [r * 1.03, h * 0.33], [r, h * 0.36], [r, h * 0.64], [r * 1.03, h * 0.67], [r, h * 0.7], [r, h * 0.94], [r * 0.92, h], [0, h]], color, { at, seg: 14, finish: "sheen" });
}
// A crate with metal bands and a lit latch
function crate(k: Kit, at: V3, size: V3, color: string, latch = C.amber) {
  const [w, h, d] = size;
  k.box(size, color, { at: [at[0], at[1] + h / 2, at[2]], round: 0.04 });
  for (const s of [-1, 1]) k.box([w + 0.012, h * 0.12, d + 0.012], C.steelDark, { at: [at[0], at[1] + h / 2 + s * h * 0.3, at[2]], finish: "sheen" });
  k.box([0.1, 0.06, 0.02], latch, { at: [at[0], at[1] + h * 0.6, at[2] + d / 2 + 0.01], finish: "glow" });
}
// A screen: a lit pane in a dark frame, tipped back by `tilt`
function screen(k: Kit, at: V3, w: number, h: number, tilt: number, color = C.glow, turn = 0) {
  k.group(at, [0, turn, 0], undefined, () =>
    k.group(undefined, [-tilt, 0, 0], undefined, () => {
      k.box([w + 0.04, h + 0.04, 0.03], C.black, { round: 0.012, finish: "sheen" });
      k.box([w, h, 0.01], color, { at: [0, 0, 0.018], finish: "glow" });
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Furniture, by what it is called (the names come from ROOM_PLANS and the ship decks in
// shared/logic), drawn on the squares it stands on: w by h, with its corner at the origin.
// Each piece is built lying along x and centred, then turned to lie along the longer side.
// `seed` gives rocks and crates a shape of their own.
// ---------------------------------------------------------------------------------------------

// A piece of a room's furniture: from the room's pack where the pack has it (turned to face away from its wall, fitted to its
// footprint and the height the piece may reach, repeated along a long side, and in the room's palette: `tone`), else drawn by
// the code (CodeFurniture). Until the pack's file is in, the code's piece stands.
export function Furniture({ name, w, h, seed = 0, look, pack, tone, face = 0, bare }: { name: string; w: number; h: number; seed?: number; look?: RoomLook; pack?: PackId; tone?: Tone; face?: number; bare?: boolean }) {
  const file = pieceOf(pack, name);
  if (file) return <PackPiece file={file} name={name} w={w} h={h} seed={seed} look={look} tone={tone} face={face} />;
  return <CodeFurniture name={name} w={w} h={h} seed={seed} look={look} bare={bare} face={face} />;
}

function PackPiece({ file, name, w, h, seed, look, tone, face }: { file: string; name: string; w: number; h: number; seed: number; look?: RoomLook; tone?: Tone; face: number }) {
  const geometry = useModels([file], "base", tone)[file];
  const placed = useMemo(() => {
    if (!geometry) return null;
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const fit = fitPiece([size.x, size.y, size.z], w, h, face, maxHeightOf(name), stretches(name));
    // The stretch is along the model's axis that ends up on the footprint's longer side
    const quarter = Math.abs(Math.abs(fit.turn) % Math.PI - Math.PI / 2) < 1e-6;
    const stretchX = fit.alongX !== quarter;
    const copies = fit.offsets.map((offset) => {
      const g = geometry.clone();
      g.scale(fit.scale * (stretchX ? fit.stretch : 1), fit.scale, fit.scale * (stretchX ? 1 : fit.stretch));
      g.rotateY(fit.turn);
      g.translate(w / 2 + (fit.alongX ? offset : 0), 0, h / 2 + (fit.alongX ? 0 : offset));
      return g;
    });
    const merged = copies.length === 1 ? copies[0] : mergeGeometries(copies, false);
    if (copies.length > 1) copies.forEach((g) => g.dispose());
    return merged;
  }, [geometry, w, h, face, name]);
  useEffect(() => () => placed?.dispose(), [placed]);
  if (!placed) return <CodeFurniture name={name} w={w} h={h} seed={seed} look={look} />;
  return (
    <mesh geometry={placed} castShadow receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

// `bare` is a piece that carries stock drawn on it (interiors/Stock.tsx): a shelf without the generic wares, a stand without its dummy
function CodeFurniture({ name, w, h, seed = 0, look, bare = false, face = 0 }: { name: string; w: number; h: number; seed?: number; look?: RoomLook; bare?: boolean; face?: number }) {
  const n = name.toLowerCase();
  const varied = /boulder|rubble|rock|crate|pallet|parts bin/.test(n) ? seed % 4 : 0;
  const piece = (
    <Model id={`furn:${n}:${w}x${h}:${varied}${bare ? ":bare" : ""}${look ? `:${look.wood}${look.cloth}${look.metal}` : ""}`} build={(k) => { if (look) k.skin = skinOf(look); k.group([w / 2, 0, h / 2], w >= h ? undefined : [0, Math.PI / 2, 0], undefined, () => buildFurniture(k, n, Math.max(w, h), Math.min(w, h), varied, bare)); }}>
      {furnitureLights(n, w, h)}
    </Model>
  );
  // (the piece is drawn once for all that stand alike, its back to -z; one against a wall on the other side is turned half a turn about
  // its middle out here, not in what is drawn: interiors/packs.ts `codeTurn`)
  const half = Math.abs(codeTurn(face, w, h) - (w >= h ? 0 : Math.PI / 2)) > 1;
  return half ? (
    <group position={[w / 2, 0, h / 2]} rotation={[0, Math.PI, 0]}>
      <group position={[-w / 2, 0, -h / 2]}>{piece}</group>
    </group>
  ) : piece;
}

// The lights and holograms that go with a piece (not baked: they shine or turn)
function furnitureLights(n: string, w: number, h: number): ReactNode {
  if (/bandstand/.test(n)) return <pointLight position={[w / 2, 1.6, h / 2]} color="#f0abfc" intensity={1.4} distance={5} />;
  if (/reactor core/.test(n)) return <pointLight position={[w / 2, 1, h / 2]} color={C.glow} intensity={2} distance={6} />;
  if (/campfire/.test(n)) return <pointLight position={[w / 2, 0.5, h / 2]} color="#ffb347" intensity={2} distance={5} />;
  if (/holo-table/.test(n)) return <Hologram at={[w / 2, 0.95, h / 2]} r={Math.min(w, h) * 0.26} />;
  return null;
}

// A slowly turning hologram of a planet with its ring of moons
function Hologram({ at, r }: { at: V3; r: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (g.current) g.current.rotation.y += Math.min(delta, 0.1) * 0.4;
  });
  return (
    <group ref={g} position={at}>
      <mesh raycast={() => null}><sphereGeometry args={[r, 14, 10]} /><meshBasicMaterial color={C.glow} transparent opacity={0.4} wireframe /></mesh>
      <mesh rotation={[Math.PI / 2.3, 0, 0]} raycast={() => null}><torusGeometry args={[r * 1.5, 0.008, 4, 40]} /><meshBasicMaterial color={C.glow} transparent opacity={0.6} /></mesh>
      <mesh position={[r * 1.5, 0, 0]} raycast={() => null}><sphereGeometry args={[r * 0.14, 8, 6]} /><meshBasicMaterial color="#a5f3fc" /></mesh>
    </group>
  );
}

// A bucket seat on a swivel: a curved back, armrests, and the station's controls before it
function buildSeat(k: Kit, n: string) {
  const gunner = /gunnery/.test(n);
  const upholstery = gunner ? "#4a3d3d" : "#3d4856";
  k.lathe([[0.2, 0], [0.2, 0.03], [0.06, 0.06], [0.05, 0.3], [0, 0.3]], C.black, { seg: 12, finish: "sheen" });
  k.box([0.46, 0.09, 0.44], upholstery, { at: [0, 0.36, 0], round: 0.04 });
  shell(k, 0.24, 0.07, 0.62, upholstery, { at: [0, 0, 0.02], start: Math.PI / 2 + 0.2, arc: Math.PI - 0.4, y: 0.36 });
  k.pair((s) => k.capsule(0.035, 0.3, shade(upholstery, 0.8), { at: [s * 0.24, 0.5, 0.02], rot: [Math.PI / 2, 0, 0] }));
  if (/command/.test(n)) return;
  k.group([0, 0, 0.44], undefined, undefined, () => {
    k.box([0.5, 0.42, 0.22], C.black, { at: [0, 0.3, 0], round: 0.04, finish: "sheen" });
    screen(k, [0, 0.6, -0.02], 0.4, 0.18, 0.6, gunner ? C.red : C.glow);
    if (gunner) k.pair((s) => k.capsule(0.03, 0.12, C.steel, { at: [s * 0.12, 0.6, -0.14], rot: [0.5, 0, 0], finish: "sheen" }));
    else k.torus(0.08, 0.018, C.steel, { at: [0, 0.56, -0.14], rot: [0.4, 0, 0], arc: Math.PI, finish: "sheen" });
  });
}

function buildFurniture(k: Kit, n: string, L: number, D: number, seed: number, bare = false) {
  const back = -D / 2;
  // Posts at the corners of a footprint, inset by `m`
  const corners = (m: number) => [[-L / 2 + m, -D / 2 + m], [L / 2 - m, -D / 2 + m], [-L / 2 + m, D / 2 - m], [L / 2 - m, D / 2 - m]] as [number, number][];
  const stools = (count: number, r: number) => {
    for (let i = 0; i < count; i++) stool(k, [Math.cos(i * ((Math.PI * 2) / count) + 0.6) * r, 0, Math.sin(i * ((Math.PI * 2) / count) + 0.6) * r]);
  };

  if (/pit trap/.test(n)) {
    k.box([L - 0.08, 0.02, D - 0.08], "#05070a", { at: [0, 0.005, 0] });
    for (const [x, z, sx, sz] of [[0, -D / 2 + 0.04, L, 0.08], [0, D / 2 - 0.04, L, 0.08], [-L / 2 + 0.04, 0, 0.08, D], [L / 2 - 0.04, 0, 0.08, D]]) k.box([sx, 0.05, sz], C.amber, { at: [x, 0.03, z], finish: "glow" });
    return;
  }
  if (/curtain wall/.test(n)) {
    // A stone wall with a walk along the top and a toothed parapet, as long as the piece is
    k.box([L, 2.0, D * 0.8], "#9a9288", { at: [0, 1.0, 0], round: 0.04 });
    k.box([L, 0.1, D], "#7a736a", { at: [0, 2.05, 0], round: 0.02 });
    const teeth = Math.max(1, Math.floor(L / 0.9));
    for (let i = 0; i < teeth; i++) k.box([0.5, 0.34, D * 0.34], "#8a8278", { at: [-L / 2 + (i + 0.5) * (L / teeth), 2.3, -D * 0.28], round: 0.02 });
    return;
  }
  if (/sales counter/.test(n)) {
    k.box([L - 0.2, 0.62, D - 0.3], C.woodDark, { at: [0, 0.31, 0], round: 0.04 });
    k.box([L - 0.1, 0.05, D - 0.2], "#c9b48a", { at: [0, 0.64, 0], round: 0.02, finish: "sheen" });
    k.box([L - 0.34, 0.3, D - 0.46], "#bfe8f5", { at: [0, 0.82, 0.02], finish: "glass" });
    screen(k, [L / 2 - 0.45, 0.7, -0.05], 0.3, 0.2, 0.7);
    return;
  }
  if (/display shelf|goods shelf|curio shelf|droid parts shelf|herb rack|instrument rack|wares rack/.test(n)) {
    // A shelving unit against a wall, its shelves loaded with what the shop sells
    const wares = /droid parts/.test(n) ? [C.steel, C.amber, C.steelDark] : /herb/.test(n) ? ["#6a9a4a", "#9aa05a", "#7a5a8a"] : /curio/.test(n) ? [C.gold, "#8a6a9a", "#c8663a"] : /instrument/.test(n) ? [C.wood, "#a1495a", C.gold] : /goods/.test(n) ? ["#c8663a", "#e8dcc0", "#4f8a8b"] : [C.steel, "#5f7a9a", C.amber];
    k.box([L - 0.16, 1.5, 0.06], C.woodDark, { at: [0, 0.75, back + 0.14], round: 0.015 });
    for (const x of [-L / 2 + 0.12, L / 2 - 0.12]) k.box([0.06, 1.5, D - 0.3], C.woodDark, { at: [x, 0.75, 0.02], round: 0.015 });
    for (const [j, y] of [0.04, 0.4, 0.78, 1.14, 1.48].entries()) {
      k.box([L - 0.2, 0.04, D - 0.34], C.wood, { at: [0, y, 0.02], round: 0.01 });
      if (j === 4 || bare) continue;
      const count = Math.max(2, Math.round(L * 2.4));
      for (let i = 0; i < count; i++) {
        const x = -L / 2 + 0.3 + (i * (L - 0.6)) / Math.max(1, count - 1);
        const c = wares[(i + j + seed) % wares.length];
        if ((i + j) % 3 === 0) k.sphere(0.08, c, { at: [x, y + 0.12, 0.02], seg: [8, 6], finish: /droid|curio|instrument/.test(n) ? "sheen" : "matte" });
        else if ((i + j) % 3 === 1) k.cyl(0.06, 0.2, c, { at: [x, y + 0.12, 0.02], seg: 8 });
        else k.box([0.16, 0.18, 0.16], c, { at: [x, y + 0.11, 0.02], round: 0.02 });
      }
    }
    return;
  }
  if (/produce bin/.test(n)) {
    k.box([L - 0.2, 0.28, D - 0.2], C.wood, { at: [0, 0.14, 0], round: 0.03 });
    for (let i = 0; i < (bare ? 0 : 6); i++) k.blob(0.11, ["#c8663a", "#9fbf5a", "#d6a85a", "#a1495a"][(i + seed) % 4], { at: [(i % 3 - 1) * 0.24, 0.32, (Math.floor(i / 3) - 0.5) * 0.24], smooth: true, rough: 0.15, seed: i, squash: [1, 0.85, 1] });
    return;
  }
  if (/cloth bolts/.test(n)) {
    k.box([L - 0.2, 0.5, 0.16], C.woodDark, { at: [0, 0.25, back + 0.16], round: 0.02 });
    for (let i = 0; i < Math.round(L * 2.2); i++) k.cyl(0.1, 0.5, ["#c8663a", "#4f8a8b", "#a1495a", "#e8dcc0", "#5a6a9a"][i % 5], { at: [-L / 2 + 0.25 + i * 0.4, 0.62 + (i % 2) * 0.16, back + 0.2], rot: [Math.PI / 2, 0, 0], seg: 12, finish: "cloth" });
    return;
  }
  if (/display case|display table/.test(n)) {
    k.box([L - 0.2, 0.7, D - 0.2], C.black, { at: [0, 0.35, 0], round: 0.03, finish: "sheen" });
    k.box([L - 0.26, 0.26, D - 0.26], "#bfe8f5", { at: [0, 0.83, 0], finish: "glass" });
    for (let i = 0; i < Math.round(L * 1.6); i++) k.box([0.12, 0.05, 0.1], [C.gold, C.steelLight, "#8a6a9a", C.glow][(i + seed) % 4], { at: [-L / 2 + 0.3 + i * 0.3, 0.74, (i % 2) * 0.1 - 0.05], rot: [0, i, 0], finish: i % 3 ? "sheen" : "glow" });
    return;
  }
  if (/clothing rack/.test(n)) {
    for (const x of [-L / 2 + 0.15, L / 2 - 0.15]) k.cyl(0.025, 1.4, C.steelDark, { at: [x, 0.7, 0], seg: 6 });
    k.cyl(0.02, L - 0.3, C.steelLight, { at: [0, 1.38, 0], rot: [0, 0, Math.PI / 2], seg: 6, finish: "sheen" });
    if (!bare) for (let i = 0; i < Math.round(L * 3); i++) k.box([0.07, 0.56, 0.3], ["#7d3b4a", "#3a6a9a", "#c9a56e", "#4f6b4a", "#e8dcc0"][(i + seed) % 5], { at: [-L / 2 + 0.3 + i * 0.28, 1.08, 0], finish: "cloth" });
    return;
  }
  if (/armor stand/.test(n)) {
    if (bare) return;
    k.lathe([[0.2, 0], [0.2, 0.03], [0.04, 0.06], [0.04, 0.5], [0, 0.5]], C.black, { seg: 10, finish: "sheen" });
    k.box([0.4, 0.46, 0.22], [C.steel, "#6b4f36", "#3f5f7a"][seed % 3], { at: [0, 0.78, 0], round: 0.08, finish: "sheen" });
    k.pair((s) => k.box([0.18, 0.12, 0.2], C.steelDark, { at: [s * 0.28, 0.96, 0], round: 0.04, finish: "sheen" }));
    k.sphere(0.13, C.steelLight, { at: [0, 1.18, 0], finish: "sheen" });
    k.box([0.2, 0.05, 0.02], C.glow, { at: [0, 1.2, 0.12], finish: "glow" });
    return;
  }
  if (/holo display/.test(n)) {
    k.lathe([[0.26, 0], [0.26, 0.04], [0.14, 0.1], [0.12, 0.7], [0.24, 0.76], [0, 0.76]], C.black, { seg: 14, finish: "sheen" });
    k.cone(0.18, 0.5, C.glow, { at: [0, 1.0, 0], finish: "haze" });
    k.sphere(0.09, C.glow, { at: [0, 1.12, 0], finish: "glow" });
    return;
  }
  if (/droid plinth/.test(n)) {
    // A low round display stand with a lit rim: a droid for sale stands on it (drawn by the map, not baked in)
    k.lathe([[0.42, 0], [0.42, 0.06], [0.38, 0.12], [0.36, 0.14], [0, 0.14]], C.steelDark, { seg: 20, finish: "sheen" });
    k.torus(0.4, 0.015, C.glow, { at: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], seg: [4, 28], finish: "glow" });
    k.box([0.26, 0.05, 0.02], C.amber, { at: [0, 0.08, 0.41], finish: "glow" });
    return;
  }
  if (/charging station/.test(n)) {
    k.box([0.5, 1.3, 0.32], C.steelDark, { at: [0, 0.65, -0.05], round: 0.05, finish: "sheen" });
    screen(k, [0, 1.0, 0.12], 0.32, 0.18, 0.6, C.glow);
    k.capsule(0.03, 0.5, C.black, { at: [0.18, 0.5, 0.18], rot: [0.3, 0, 0] });
    k.box([0.6, 0.06, 0.5], C.steel, { at: [0, 0.03, 0.05], round: 0.02, finish: "sheen" });
    return;
  }
  if (/droid repair rig/.test(n)) {
    // A frame with arms over a cradle, a droid's work-stand
    k.box([L - 0.3, 0.3, D - 0.4], C.steelDark, { at: [0, 0.15, 0], round: 0.04, finish: "sheen" });
    for (const [x, z] of corners(0.25)) k.capsule(0.035, 1.6, C.steel, { at: [x, 0.8, z], finish: "sheen" });
    k.box([L - 0.4, 0.06, 0.06], C.steel, { at: [0, 1.6, -D / 2 + 0.25], finish: "sheen" });
    k.box([L - 0.4, 0.06, 0.06], C.steel, { at: [0, 1.6, D / 2 - 0.25], finish: "sheen" });
    k.pair((s) => k.capsule(0.03, 0.5, C.amber, { at: [s * 0.3, 1.32, 0], rot: [0, 0, s * 0.5], finish: "sheen" }));
    k.sphere(0.05, C.red, { at: [0, 1.06, 0], finish: "glow" });
    return;
  }
  if (/statuette plinth/.test(n)) {
    k.box([0.5, 0.6, 0.5], "#b8b2a4", { at: [0, 0.3, 0], round: 0.04 });
    if (bare) return;
    k.capsule(0.07, 0.22, C.gold, { at: [0, 0.82, 0], finish: "sheen" });
    k.sphere(0.06, C.gold, { at: [0, 1.04, 0], finish: "sheen" });
    return;
  }
  if (/starship part/.test(n)) {
    k.box([L - 0.2, 0.18, D - 0.3], C.steelDark, { at: [0, 0.09, 0], round: 0.03, finish: "sheen" });
    if (bare) return;
    k.lathe([[0.16, -0.5], [0.3, -0.3], [0.32, 0.1], [0.2, 0.5], [0.1, 0.7]], C.steel, { at: [0, 0.5, 0], rot: [0, 0, Math.PI / 2], seg: 16, finish: "sheen" });
    if (!bare) k.torus(0.3, 0.03, C.glow, { at: [-0.3, 0.5, 0], rot: [0, Math.PI / 2, 0], seg: [5, 18], finish: "glow" });
    return;
  }
  if (/bandstand/.test(n)) {
    // A rounded stage with an acoustic shell curving round its back and footlights along its edge
    slab(k, L - 0.06, D - 0.06, 0.22, "#3a2f45", { r: 0.45 });
    slab(k, L - 0.3, D - 0.3, 0.02, "#5b4a70", { r: 0.3, y: 0.22 });
    shell(k, D * 0.75, 0.06, 1.3, "#2b2236", { at: [0, 0, D * 0.15], start: Math.PI / 2 + 0.3, arc: Math.PI - 0.6, y: 0.22 });
    for (let i = 0; i < Math.round(L) * 2; i++) k.sphere(0.05, ["#f472b6", C.glow, "#fde68a"][i % 3], { at: [-L / 2 + 0.3 + i * ((L - 0.6) / (Math.round(L) * 2 - 1)), 0.24, D / 2 - 0.08], finish: "glow", seg: [8, 6] });
    return;
  }
  if (/bar counter/.test(n)) {
    // A counter with rounded ends, a polished top, a lit kick strip and bottles along it
    const d = D - 0.24;
    upright(k, planRect(L - 0.12, d, d / 2), 0.66, C.woodDark, { bevel: 0.02 });
    upright(k, planRect(L - 0.02, d + 0.12, (d + 0.12) / 2), 0.06, "#b07a4c", { y: 0.66, bevel: 0.02, finish: "sheen" });
    upright(k, planRect(L - 0.1, d + 0.02, (d + 0.02) / 2), 0.04, C.glow, { y: 0.05, finish: "glow" });
    // (bottles and tankards of the item models stand there instead when the counter carries stock: `bare`, interiors/stock.ts "bar")
    if (!bare) for (let i = 0; i < Math.floor(L) * 2; i++) bottle(k, [-L / 2 + 0.4 + i * 0.5, 0.72, (i % 2 ? 0.08 : -0.06)], [C.glow, C.amber, C.green, "#c084fc"][i % 4], i % 3 === 0);
    return;
  }
  if (/sabacc/.test(n)) {
    const r = D * 0.42;
    k.lathe([[0.32, 0], [0.32, 0.03], [0.1, 0.08], [0.08, 0.44], [0.2, 0.5], [0, 0.5]], C.black, { seg: 16, finish: "sheen" });
    k.cyl(r, 0.06, "#2f6b4a", { at: [0, 0.53, 0], seg: 28 });
    k.torus(r, 0.04, C.gold, { at: [0, 0.56, 0], rot: [Math.PI / 2, 0, 0], finish: "sheen", seg: [8, 32] });
    k.cyl(r * 0.25, 0.012, C.glow, { at: [0, 0.565, 0], finish: "glow" });
    for (let i = 0; i < 5; i++) k.box([0.08, 0.005, 0.11], "#f5f0e1", { at: [Math.cos(i * 1.256) * r * 0.62, 0.565, Math.sin(i * 1.256) * r * 0.62], rot: [0, i * 1.256, 0] });
    stools(5, D * 0.5);
    return;
  }
  if (/holo-table/.test(n)) {
    const r = D * 0.4;
    k.lathe([[r * 1.05, 0], [r * 1.05, 0.06], [r * 0.6, 0.18], [r * 0.55, 0.46], [r, 0.52], [r, 0.56], [0, 0.56]], C.black, { seg: 28, finish: "sheen" });
    k.torus(r * 0.82, 0.02, C.glow, { at: [0, 0.57, 0], rot: [Math.PI / 2, 0, 0], finish: "glow", seg: [6, 32] });
    k.cyl(r * 0.3, 0.01, C.glow, { at: [0, 0.57, 0], finish: "glow" });
    return;
  }
  if (/low table/.test(n)) {
    k.lathe([[0.18, 0], [0.18, 0.02], [0.06, 0.05], [0.05, 0.24], [0, 0.24]], C.black, { seg: 12, finish: "sheen" });
    upright(k, planRect(L - 0.3, D - 0.3, (D - 0.3) * 0.45), 0.05, C.wood, { y: 0.24, bevel: 0.015, finish: "sheen" });
    return;
  }
  if (/table/.test(n)) {
    if (L <= 1) {
      // A round table on a turned pedestal, with three stools
      k.lathe([[0.2, 0], [0.2, 0.02], [0.07, 0.06], [0.05, 0.46], [0.1, 0.5], [0, 0.5]], C.black, { seg: 14, finish: "sheen" });
      k.cyl(0.36, 0.05, C.wood, { at: [0, 0.52, 0], seg: 24, finish: "sheen" });
      k.torus(0.36, 0.02, C.woodDark, { at: [0, 0.52, 0], rot: [Math.PI / 2, 0, 0], seg: [6, 28] });
      stools(3, 0.44);
      return;
    }
    // A long table with rounded corners, two pedestals and a bench down each side
    upright(k, planRect(L - 0.25, D - 0.3, 0.18), 0.05, C.wood, { y: 0.5, bevel: 0.015, finish: "sheen" });
    for (const x of [-L / 4, L / 4]) k.lathe([[0.16, 0], [0.16, 0.02], [0.05, 0.05], [0.045, 0.5], [0, 0.5]], C.black, { at: [x, 0, 0], seg: 12, finish: "sheen" });
    for (const s of [-1, 1]) {
      k.box([L - 0.4, 0.06, 0.2], C.woodDark, { at: [0, 0.3, s * 0.42], round: 0.025 });
      for (const x of [-L / 2 + 0.35, L / 2 - 0.35]) k.box([0.06, 0.28, 0.14], C.black, { at: [x, 0.14, s * 0.42], finish: "sheen" });
    }
    return;
  }
  if (/booth/.test(n)) {
    // A curved booth: a cushioned seat with a high back sweeping round it in a U
    const soft = "#7a3b3b";
    const rx = L / 2 - 0.06;
    const rz = D - 0.12;
    const outer: [number, number][] = [];
    const inner: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * Math.PI;
      outer.push([Math.cos(t) * rx, D / 2 - 0.06 - Math.sin(t) * rz]);
      inner.unshift([Math.cos(t) * (rx - 0.16), D / 2 - 0.06 - Math.sin(t) * (rz - 0.16)]);
    }
    upright(k, planShape([...outer, ...inner]), 0.72, soft, { bevel: 0.03 });
    const seat: [number, number][] = inner.map(([x, z]) => [x * 0.98, z]);
    upright(k, planShape(seat), 0.32, shade(soft, 1.12), { bevel: 0.04 });
    k.box([L - 0.5, 0.02, 0.04], C.amber, { at: [0, 0.72, back + 0.12], finish: "glow" });
    return;
  }
  if (/couch/.test(n)) {
    const soft = "#5b6b8a";
    k.box([L - 0.2, 0.18, D - 0.2], shade(soft, 0.8), { at: [0, 0.12, 0], round: 0.05 });
    for (const s of [-1, 1]) k.box([(L - 0.5) / 2, 0.12, D - 0.4], soft, { at: [s * (L - 0.5) / 4, 0.27, 0.06], round: 0.05 });
    k.box([L - 0.3, 0.4, 0.16], soft, { at: [0, 0.42, back + 0.18], round: 0.07 });
    k.pair((s) => k.capsule(0.09, D - 0.45, shade(soft, 0.9), { at: [s * (L / 2 - 0.16), 0.33, 0.02], rot: [Math.PI / 2, 0, 0] }));
    return;
  }
  if (/bench/.test(n)) {
    k.box([L - 0.2, 0.06, D - 0.5], C.steelDark, { at: [0, 0.32, 0.05], round: 0.025, finish: "sheen" });
    k.box([L - 0.24, 0.28, 0.05], C.steelDark, { at: [0, 0.55, back + 0.22], rot: [-0.18, 0, 0], round: 0.02, finish: "sheen" });
    for (const x of [-L / 2 + 0.3, L / 2 - 0.3]) k.tube([[x, 0, 0.18], [x, 0.18, 0.12], [x, 0.3, 0.02], [x, 0.36, back + 0.2], [x, 0.7, back + 0.18]], 0.025, C.black, { along: 14, around: 6, finish: "sheen" });
    return;
  }
  if (/bunk/.test(n)) {
    for (const [x, z] of corners(0.08)) k.cyl(0.035, 1.05, C.steel, { at: [x, 0.52, z], seg: 8, finish: "sheen" });
    for (const y of [0.24, 0.84]) {
      k.box([L - 0.14, 0.06, D - 0.14], C.steelDark, { at: [0, y - 0.04, 0], finish: "sheen" });
      k.box([L - 0.2, 0.1, D - 0.2], "#56624f", { at: [0, y + 0.04, 0], round: 0.045 });
      k.box([0.3, 0.07, D - 0.3], "#d8d2c0", { at: [-L / 2 + 0.28, y + 0.12, 0], round: 0.03 });
    }
    for (let i = 0; i < 4; i++) k.cyl(0.015, D - 0.2, C.steel, { at: [L / 2 - 0.08, 0.2 + i * 0.2, 0], rot: [Math.PI / 2, 0, 0], seg: 6 });
    return;
  }
  if (/bed/.test(n)) {
    const medical = /medical/.test(n);
    k.box([L - 0.2, 0.26, D - 0.24], medical ? C.white : C.steelDark, { at: [0, 0.15, 0], round: 0.06, finish: medical ? "sheen" : "matte" });
    k.box([L - 0.3, 0.1, D - 0.32], medical ? "#cfe8f0" : "#7d6a8a", { at: [0.04, 0.33, 0], round: 0.05 });
    k.blob(0.13, "#ece6d6", { at: [-L / 2 + 0.32, 0.4, 0], smooth: true, rough: 0.08, squash: [1, 0.45, 1.4], seed: 3 });
    if (medical) {
      // A scanner arching over the bed, lit along its inside
      k.torus(D * 0.42, 0.04, C.white, { at: [0.2, 0.32, 0], rot: [0, Math.PI / 2, 0], arc: Math.PI, finish: "sheen", seg: [8, 20] });
      k.torus(D * 0.38, 0.012, C.glow, { at: [0.2, 0.32, 0], rot: [0, Math.PI / 2, 0], arc: Math.PI, finish: "glow", seg: [4, 20] });
      screen(k, [L / 2 - 0.12, 0.75, 0], 0.26, 0.2, 0.2, C.green, -Math.PI / 2);
    } else k.box([L * 0.45, 0.06, D - 0.28], "#4f5d8a", { at: [L * 0.18, 0.39, 0], round: 0.03 });
    return;
  }
  if (/holding cell/.test(n)) {
    slab(k, L - 0.1, D - 0.1, 0.08, C.black, { r: 0.12 });
    for (const [x, z] of corners(0.1)) {
      k.lathe([[0.08, 0], [0.08, 0.1], [0.05, 0.14], [0.05, 1.3], [0.08, 1.34], [0.08, 1.42], [0, 1.42]], C.steel, { at: [x, 0.04, z], seg: 10, finish: "sheen" });
      k.cyl(0.02, 1.1, C.red, { at: [x, 0.7, z], seg: 6, finish: "glow" });
    }
    slab(k, L - 0.1, D - 0.1, 0.08, C.black, { r: 0.12, y: 1.42 });
    k.box([L - 0.22, 1.28, D - 0.22], C.red, { at: [0, 0.74, 0], finish: "haze" });
    return;
  }
  if (/pilot's seat|co-pilot's seat|gunnery seat|command chair/.test(n)) {
    // A seat at a ship's station faces the bow (+x); a command chair faces into its room
    k.group(undefined, /command/.test(n) ? undefined : [0, Math.PI / 2, 0], undefined, () => buildSeat(k, n));
    return;
  }
  if (/console|terminal/.test(n)) {
    if (L <= 1 && /information|^terminal/.test(n)) {
      // A standing terminal: a turned pedestal with a screen tipped towards whoever uses it
      k.lathe([[0.22, 0], [0.22, 0.03], [0.1, 0.08], [0.07, 0.8], [0.12, 0.86], [0, 0.86]], C.gunmetal, { seg: 16, finish: "sheen" });
      screen(k, [0, 0.98, 0.04], 0.36, 0.26, 0.45);
      return;
    }
    // A console seen from the side: a body whose top curves back into a slanted desk of screens
    const profile = new THREE.Shape();
    profile.moveTo(-D / 2 + 0.12, 0);
    profile.lineTo(D / 2 - 0.12, 0);
    profile.lineTo(D / 2 - 0.12, 0.5);
    profile.quadraticCurveTo(D / 2 - 0.14, 0.62, D / 2 - 0.3, 0.66);
    profile.lineTo(-D / 2 + 0.22, 0.94);
    profile.quadraticCurveTo(-D / 2 + 0.12, 0.96, -D / 2 + 0.12, 0.84);
    profile.lineTo(-D / 2 + 0.12, 0);
    k.extrude(profile, L - 0.24, C.black, { at: [(L - 0.24) / 2, 0, 0], rot: [0, -Math.PI / 2, 0], bevel: 0.025, finish: "sheen" });
    const tilt = Math.atan2(0.28, D - 0.52);
    screen(k, [0, 0.82, 0.02], L - 0.5, 0.22, Math.PI / 2 - tilt, /guard/.test(n) ? C.amber : C.glow);
    for (let i = 0; i < Math.round(L * 3); i++) k.sphere(0.018, [C.red, C.green, C.amber][i % 3], { at: [-L / 2 + 0.3 + i * 0.3, 0.64, D / 2 - 0.24], finish: "glow", seg: [6, 4] });
    return;
  }
  if (/desk/.test(n)) {
    upright(k, planRect(L - 0.16, D - 0.2, [0.05, 0.05, 0.3, 0.3]), 0.06, C.woodDark, { y: 0.52, bevel: 0.015, finish: "sheen" });
    shell(k, (L - 0.4) / 2, 0.05, 0.5, C.black, { at: [0, 0, D / 2 - 0.12 - (L - 0.4) / 2], start: -Math.PI / 2 + 0.4, arc: Math.PI - 0.8 });
    for (const x of [-L / 2 + 0.24, L / 2 - 0.24]) k.box([0.26, 0.5, D - 0.4], C.black, { at: [x, 0.25, 0], round: 0.04, finish: "sheen" });
    screen(k, [0, 0.72, back + 0.25], 0.5, 0.3, 0.2);
    k.box([0.32, 0.015, 0.12], C.steelDark, { at: [0, 0.59, 0.05], round: 0.006 });
    return;
  }
  if (/workbench/.test(n)) {
    k.box([L - 0.2, 0.08, D - 0.2], "#4b5563", { at: [0, 0.6, 0], round: 0.03, finish: "sheen" });
    for (const [x, z] of corners(0.16)) k.box([0.07, 0.58, 0.07], C.black, { at: [x, 0.29, z], finish: "sheen" });
    k.box([L - 0.32, 0.04, D - 0.36], C.steelDark, { at: [0, 0.18, 0] });
    k.box([L - 0.3, 0.6, 0.05], C.black, { at: [0, 0.95, back + 0.12], round: 0.02 });
    for (let i = 0; i < Math.round(L * 2); i++) k.box([0.04, 0.22, 0.03], [C.amber, C.steel, C.red][i % 3], { at: [-L / 2 + 0.35 + i * 0.42, 0.98, back + 0.16], finish: "sheen" });
    k.box([0.26, 0.12, 0.18], C.steel, { at: [-L / 2 + 0.4, 0.7, 0.05], round: 0.02, finish: "sheen" });
    k.tube([[L / 2 - 0.3, 0.64, back + 0.16], [L / 2 - 0.3, 1.1, back + 0.2], [L / 2 - 0.45, 1.25, 0], [L / 2 - 0.5, 1.12, 0.12]], 0.018, C.steelDark, { along: 12, around: 6, finish: "sheen" });
    k.cone(0.07, 0.08, C.black, { at: [L / 2 - 0.5, 1.08, 0.12] });
    k.sphere(0.035, "#fff3c4", { at: [L / 2 - 0.5, 1.04, 0.12], finish: "glow", seg: [8, 6] });
    return;
  }
  if (/reactor core/.test(n)) {
    const r = D * 0.46;
    k.lathe([[r, 0], [r, 0.2], [r * 0.75, 0.32], [0, 0.32]], C.black, { seg: 28, finish: "sheen" });
    k.cyl(r * 0.42, 1.3, C.glow, { at: [0, 0.95, 0], seg: 20, finish: "glow" });
    k.cyl(r * 0.6, 1.3, "#9fe7ff", { at: [0, 0.95, 0], seg: 24, finish: "glass" });
    for (const y of [0.55, 0.95, 1.35]) k.torus(r * 0.64, 0.05, C.steel, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], finish: "sheen", seg: [8, 28] });
    k.lathe([[0, 1.6], [r * 0.9, 1.6], [r * 0.9, 1.7], [r * 0.5, 1.82], [0, 1.84]], C.black, { seg: 28, finish: "sheen" });
    for (let i = 0; i < 4; i++) k.tube([[Math.cos(i * 1.57) * r * 0.9, 0.25, Math.sin(i * 1.57) * r * 0.9], [Math.cos(i * 1.57) * r * 1.0, 0.9, Math.sin(i * 1.57) * r * 1.0], [Math.cos(i * 1.57) * r * 0.85, 1.62, Math.sin(i * 1.57) * r * 0.85]], 0.04, C.steelDark, { along: 10, around: 6, finish: "sheen" });
    return;
  }
  if (/bacta tank/.test(n)) {
    k.lathe([[0.38, 0], [0.38, 0.14], [0.32, 0.22], [0, 0.22]], C.black, { seg: 24, finish: "sheen" });
    k.cyl(0.3, 1.22, "#58c9b0", { at: [0, 0.83, 0], seg: 24, finish: "glass" });
    k.cyl(0.27, 1.1, "#3fbfa0", { at: [0, 0.8, 0], seg: 18, finish: "haze" });
    for (let i = 0; i < 6; i++) k.sphere(0.025, "#d8fff4", { at: [Math.sin(i * 2.1) * 0.12, 0.4 + i * 0.16, Math.cos(i * 2.1) * 0.12], finish: "glow", seg: [6, 4] });
    k.lathe([[0, 1.44], [0.32, 1.44], [0.36, 1.5], [0.36, 1.6], [0.2, 1.68], [0, 1.68]], C.black, { seg: 24, finish: "sheen" });
    return;
  }
  if (/coolant tank|water tank/.test(n)) {
    const water = /water/.test(n);
    const r = water ? D * 0.4 : 0.36;
    if (water) for (const [x, z] of corners(0.25)) k.cyl(0.04, 0.6, C.steelDark, { at: [x * 0.8, 0.3, z * 0.8], seg: 6, finish: "sheen" });
    k.lathe([[0, 0], [r * 0.7, 0], [r, r * 0.3], [r, 1.0 - r * 0.3], [r * 0.7, 1.0], [0, 1.0]], water ? "#8b9aa6" : C.steel, { at: [0, water ? 0.6 : 0.05, 0], seg: 22, finish: "sheen" });
    k.torus(r + 0.005, 0.03, water ? C.steelDark : C.glow, { at: [0, water ? 1.1 : 0.6, 0], rot: [Math.PI / 2, 0, 0], finish: water ? "sheen" : "glow", seg: [6, 24] });
    if (!water) k.tube([[r * 0.8, 0.9, 0], [r + 0.15, 0.9, 0], [r + 0.2, 0.5, 0], [r + 0.2, 0, 0]], 0.04, C.steelDark, { along: 10, around: 6, finish: "sheen" });
    return;
  }
  if (/fuel pump/.test(n)) {
    k.box([0.46, 0.96, 0.34], "#a33b3b", { at: [0, 0.48, 0], round: 0.08, finish: "sheen" });
    k.box([0.3, 0.16, 0.02], C.amber, { at: [0, 0.76, 0.17], finish: "glow" });
    k.tube([[0.2, 0.6, 0], [0.38, 0.5, 0.08], [0.42, 0.2, 0.2], [0.3, 0.06, 0.32]], 0.025, C.black, { along: 12, around: 6 });
    k.box([0.08, 0.06, 0.16], C.steel, { at: [0.3, 0.07, 0.36], round: 0.02, finish: "sheen" });
    return;
  }
  if (/drink dispenser/.test(n)) {
    k.box([0.56, 1.16, 0.46], C.black, { at: [0, 0.58, 0], round: 0.1, finish: "sheen" });
    k.box([0.4, 0.46, 0.02], C.green, { at: [0, 0.78, 0.235], round: 0.04, finish: "glow" });
    k.box([0.3, 0.08, 0.12], C.steel, { at: [0, 0.3, 0.26], round: 0.03, finish: "sheen" });
    return;
  }
  if (/power coupling/.test(n)) {
    k.lathe([[0.3, 0], [0.3, 0.05], [0.24, 0.1], [0.24, 0.6], [0.3, 0.64], [0.3, 0.68], [0.14, 0.72], [0, 0.72]], "#4b5563", { seg: 18, finish: "sheen" });
    for (const y of [0.25, 0.42]) k.torus(0.25, 0.02, C.amber, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], finish: "glow", seg: [5, 20] });
    k.sphere(0.12, C.amber, { at: [0, 0.74, 0], finish: "glow", half: true });
    return;
  }
  if (/sensor mast|antenna mast/.test(n)) {
    k.lathe([[0.26, 0], [0.26, 0.08], [0.12, 0.2], [0, 0.2]], C.black, { seg: 16, finish: "sheen" });
    k.cyl(0.04, 1.6, "#d7d2c4", { at: [0, 1.0, 0], top: 0.025, seg: 8, finish: "sheen" });
    k.sphere(0.24, "#d7d2c4", { at: [0.1, 1.5, 0], rot: [0, 0, -1.1], theta: [0, 1.0], seg: [16, 6], finish: "cloth" });
    k.cyl(0.012, 0.3, C.steel, { at: [0.2, 1.55, 0], rot: [0, 0, -1.1], seg: 4 });
    for (const y of [0.9, 1.25]) k.cyl(0.015, 0.4, "#d7d2c4", { at: [0, y, 0], rot: [0, 0, Math.PI / 2], seg: 4 });
    k.sphere(0.04, C.red, { at: [0, 1.82, 0], finish: "glow", seg: [6, 4] });
    return;
  }
  if (/broken pillar/.test(n)) {
    k.lathe([[0.36, 0], [0.36, 0.08], [0.3, 0.12], [0.27, 0.16], [0.26, 0.62], [0, 0.62]], "#8a8680", { seg: 12 });
    k.blob(0.24, "#8a8680", { at: [0, 0.66, 0], seed: 7 + seed, rough: 0.35, squash: [1, 0.5, 1] });
    k.cyl(0.24, 0.6, "#7e7a74", { at: [0.32, 0.22, 0.3], rot: [0, 0.7, Math.PI / 2], seg: 12 });
    return;
  }
  if (/rock pillar/.test(n)) {
    k.blob(0.38, C.rock, { at: [0, 0.8, 0], seed: 11 + seed, rough: 0.3, squash: [0.85, 2.2, 0.85] });
    k.blob(0.3, "#5f5c58", { at: [0.18, 0.18, 0.1], seed: 3 + seed, rough: 0.35, squash: [1, 0.6, 1] });
    return;
  }
  if (/awning post/.test(n)) {
    k.lathe([[0.16, 0], [0.16, 0.06], [0.08, 0.1], [0.07, 1.62], [0.1, 1.66], [0, 1.68]], C.wood, { seg: 10 });
    return;
  }
  if (/pillar/.test(n)) {
    // A turned column with a stepped base and capital and a lit band
    k.lathe([[0.38, 0], [0.38, 0.1], [0.32, 0.14], [0.32, 0.2], [0.26, 0.26], [0.24, 1.38], [0.3, 1.46], [0.36, 1.5], [0.36, 1.6], [0, 1.6]], "#8a8680", { seg: 20 });
    k.torus(0.245, 0.015, C.glow, { at: [0, 1.2, 0], rot: [Math.PI / 2, 0, 0], finish: "glow", seg: [4, 20] });
    return;
  }
  if (/boulder/.test(n)) {
    k.blob(0.44, C.rock, { at: [0, 0.3, 0], seed: 5 + seed * 3, rough: 0.32, squash: [1.05, 0.75, 0.95] });
    k.blob(0.16, "#5f5c58", { at: [0.32, 0.08, 0.26], seed: 2 + seed, rough: 0.3 });
    return;
  }
  if (/rubble/.test(n)) {
    const count = Math.round(L) * 2 + 1;
    for (let i = 0; i < count; i++) {
      const r = 0.14 + ((i * 7 + seed * 3) % 5) * 0.035;
      k.blob(r, i % 2 ? "#5a5753" : C.rock, { at: [-L / 2 + 0.25 + (i * (L - 0.5)) / Math.max(1, count - 1), r * 0.55, ((i * 37 + seed * 11) % 7) / 7 * (D - 0.5) - (D - 0.5) / 2], seed: i + seed * 5, rough: 0.4 });
    }
    return;
  }
  if (/sarcophagus/.test(n)) {
    k.box([L - 0.28, 0.46, D - 0.24], "#6d6a66", { at: [0, 0.23, 0], round: 0.04 });
    k.group([0, 0.46, 0], undefined, undefined, () => {
      k.cyl((D - 0.22) / 2, L - 0.22, "#8a8680", { rot: [0, 0, Math.PI / 2], arc: Math.PI, start: 0, seg: 16, scale: [0.45, 1, 1] });
      k.cyl((D - 0.22) / 2 + 0.005, 0.04, "#c084fc", { rot: [0, 0, Math.PI / 2], arc: Math.PI, start: 0, seg: 16, scale: [0.45, 1, 1], finish: "glow" });
    });
    return;
  }
  if (/altar/.test(n)) {
    slab(k, L - 0.3, D - 0.3, 0.16, "#5a564f", { r: 0.2 });
    upright(k, planRect(L - 0.5, D - 0.42, (D - 0.42) / 2), 0.44, "#6d6a66", { y: 0.16, bevel: 0.03 });
    k.add(new THREE.OctahedronGeometry(0.14, 0), "#c084fc", { at: [0, 0.84, 0], finish: "glow" });
    k.torus(0.2, 0.012, "#c084fc", { at: [0, 0.84, 0], rot: [Math.PI / 2, 0, 0], finish: "glow", seg: [4, 20] });
    return;
  }
  if (/dais/.test(n)) {
    slab(k, L - 0.04, D - 0.04, 0.08, "#4a4741", { r: 0.25 });
    slab(k, L - 0.3, D - 0.3, 0.06, "#5a564f", { r: 0.2, y: 0.08 });
    return;
  }
  if (/campfire/.test(n)) {
    for (let i = 0; i < 7; i++) k.blob(0.09, C.rock, { at: [Math.cos(i * 0.9) * 0.34, 0.05, Math.sin(i * 0.9) * 0.34], seed: i + 2, rough: 0.35 });
    for (const t of [0.5, 2.1]) k.cyl(0.04, 0.5, C.woodDark, { at: [0, 0.07, 0], rot: [0, t, Math.PI / 2 - 0.2], seg: 6 });
    k.blob(0.13, "#ffb347", { at: [0, 0.16, 0], smooth: true, rough: 0.3, squash: [1, 1.8, 1], seed: 4, finish: "glow" });
    k.blob(0.07, "#fff1a8", { at: [0, 0.14, 0], smooth: true, rough: 0.2, squash: [1, 1.6, 1], seed: 9, finish: "glow" });
    return;
  }
  if (/market stall/.test(n)) {
    // A counter under a curved canvas awning on four poles
    const canvas = ["#c8663a", "#e8dcc0", "#4f8a8b", "#a1495a"][(Math.round(L * 10) + Math.round(D * 3) + seed) % 4];
    k.box([L - 0.3, 0.52, D - 0.4], C.woodDark, { at: [0, 0.26, 0.05], round: 0.04 });
    k.box([L - 0.22, 0.05, D - 0.32], C.wood, { at: [0, 0.54, 0.05], round: 0.02, finish: "sheen" });
    for (const [x, z] of corners(0.12)) k.cyl(0.03, 1.5, C.wood, { at: [x, 0.75, z], seg: 8 });
    k.cyl(D * 0.62, L + 0.06, canvas, { at: [0, 1.15, 0], rot: [0, 0, Math.PI / 2], arc: Math.PI * 0.62, start: Math.PI / 2 - Math.PI * 0.31, seg: 18, open: true, finish: "cloth" });
    for (let i = 0; i < 4; i++) {
      const x = -L / 2 + 0.35 + i * ((L - 0.7) / 3);
      if (i % 2) drum(k, [x, 0.57, 0.08], 0.09, 0.16, [C.amber, C.green][i % 2]);
      else k.blob(0.1, ["#d6a85a", "#9fbf5a"][i % 2 ? 1 : 0], { at: [x, 0.64, 0.05], smooth: true, rough: 0.2, seed: i, squash: [1, 0.7, 1] });
    }
    return;
  }
  if (/crate stack/.test(n)) {
    const s = Math.min(L, D);
    crate(k, [-s * 0.22, 0, -s * 0.22], [s * 0.44, 0.58, s * 0.44], C.olive);
    crate(k, [s * 0.24, 0, -s * 0.2], [s * 0.42, 0.56, s * 0.44], C.steelDark, C.glow);
    crate(k, [-s * 0.2, 0, s * 0.25], [s * 0.48, 0.58, s * 0.4], C.steelDark);
    crate(k, [s * 0.24, 0, s * 0.26], [s * 0.4, 0.5, s * 0.38], C.olive);
    crate(k, [-s * 0.16 + seed * 0.04, 0.58, -s * 0.18], [s * 0.4, 0.48, s * 0.4], C.steel, C.green);
    if (seed % 2) crate(k, [s * 0.2, 0.56, s * 0.12], [s * 0.36, 0.46, s * 0.4], C.olive);
    return;
  }
  if (/cargo pallet/.test(n)) {
    k.box([L - 0.1, 0.1, D - 0.1], C.woodDark, { at: [0, 0.05, 0], round: 0.02 });
    for (let i = 0; i < 3; i++) drum(k, [-L * 0.25 + (i % 2) * 0.36, 0.1, -D * 0.2 + Math.floor(i / 2) * 0.42], 0.17, 0.62, ["#4f6b8a", C.olive, "#a33b3b"][(i + seed) % 3]);
    crate(k, [L * 0.22, 0.1, -D * 0.12], [L * 0.38, 0.5, D * 0.44], C.steelDark);
    crate(k, [L * 0.22, 0.1, D * 0.26], [L * 0.34, 0.36, D * 0.3], C.amber, C.glow);
    return;
  }
  if (/crate|footlocker|parts bin|equipment/.test(n)) {
    const low = /footlocker/.test(n);
    crate(k, [0, 0, 0], [L - 0.32, low ? 0.36 : 0.56, D - 0.32], /parts/.test(n) ? C.steelDark : /equipment/.test(n) ? "#4f6b8a" : C.olive, /parts/.test(n) ? C.green : C.amber);
    if (/parts/.test(n) && !bare) for (let i = 0; i < 4; i++) k.box([0.1, 0.06, 0.08], [C.amber, C.steel, C.red, C.glow][i], { at: [-0.12 + i * 0.08, 0.6, (i % 2) * 0.08 - 0.04], rot: [0, i, 0.3], finish: "sheen" });
    return;
  }
  if (/weapon rack|tool rack|restraint rack/.test(n)) {
    k.box([L - 0.2, 1.3, 0.1], C.black, { at: [0, 0.7, back + 0.15], round: 0.03, finish: "sheen" });
    for (const x of [-L / 2 + 0.15, L / 2 - 0.15]) k.box([0.08, 1.4, 0.3], C.gunmetal, { at: [x, 0.7, back + 0.2], round: 0.02, finish: "sheen" });
    const count = Math.round(L * 2.4);
    for (let i = 0; i < count; i++) {
      const x = -L / 2 + 0.3 + (i * (L - 0.6)) / Math.max(1, count - 1);
      if (/tool/.test(n)) { if (!bare) k.box([0.05, 0.36, 0.04], [C.amber, C.steel, C.red][i % 3], { at: [x, 0.95 - (i % 2) * 0.3, back + 0.24], finish: "sheen" }); }
      else if (/restraint/.test(n)) k.torus(0.06, 0.015, C.steel, { at: [x, 0.95, back + 0.24], finish: "sheen", seg: [5, 12] });
      else {
        k.box([0.05, 0.9, 0.07], C.black, { at: [x, 0.7, back + 0.25], finish: "sheen" });
        k.box([0.06, 0.12, 0.1], C.steelDark, { at: [x, 0.42, back + 0.29], finish: "sheen" });
      }
    }
    return;
  }
  if (/shelving|cabinet|locker/.test(n)) {
    const supply = /supply/.test(n);
    const color = /locker/.test(n) ? C.steelDark : supply ? C.white : C.gunmetal;
    if (/shelving/.test(n)) {
      k.box([L - 0.24, 1.32, 0.05], color, { at: [0, 0.66, back + 0.15], round: 0.02, finish: "sheen" });
      for (const x of [-L / 2 + 0.14, L / 2 - 0.14]) k.box([0.05, 1.32, D - 0.26], color, { at: [x, 0.66, 0.02], round: 0.015, finish: "sheen" });
    } else k.box([L - 0.24, 1.32, D - 0.24], color, { at: [0, 0.66, 0], round: 0.06, finish: "sheen" });
    if (/shelving/.test(n)) {
      for (const y of [0.04, 0.36, 0.76, 1.12]) {
        k.box([L - 0.34, 0.03, D - 0.26], C.steel, { at: [0, y, 0.02], finish: "sheen" });
        for (let i = 0; i < Math.round(L * 2); i++) k.box([0.18, 0.2, 0.2], [C.olive, C.amber, C.steelDark][(i + Math.round(y * 10)) % 3], { at: [-L / 2 + 0.35 + i * 0.45, y + 0.12, 0.06], round: 0.02 });
      }
    } else {
      const doors = Math.max(1, Math.round(L));
      for (let i = 0; i < doors; i++) {
        const x = -L / 2 + 0.12 + (L - 0.24) * ((i + 0.5) / doors);
        k.box([(L - 0.3) / doors - 0.04, 1.2, 0.02], shade(color, 1.15), { at: [x, 0.66, D / 2 - 0.115], round: 0.008, finish: "sheen" });
        k.box([0.02, 0.18, 0.02], supply ? C.glow : C.steelLight, { at: [x + (L - 0.3) / doors / 2 - 0.08, 0.7, D / 2 - 0.1], finish: supply ? "glow" : "sheen" });
      }
      if (supply) k.box([L - 0.36, 0.04, 0.02], C.red, { at: [0, 1.2, D / 2 - 0.1], finish: "glow" });
    }
    return;
  }
  if (/loading crane/.test(n)) {
    k.lathe([[0.22, 0], [0.22, 0.08], [0.12, 0.14], [0, 0.14]], C.black, { at: [-L / 2 + 0.4, 0, 0], seg: 14, finish: "sheen" });
    k.cyl(0.11, 1.7, C.amber, { at: [-L / 2 + 0.4, 0.95, 0], seg: 12, finish: "sheen" });
    k.tube([[-L / 2 + 0.4, 1.75, 0], [-L / 2 + 0.9, 1.92, 0], [L / 2 - 0.25, 1.86, 0]], 0.07, C.amber, { along: 10, around: 8, finish: "sheen" });
    k.cyl(0.015, 0.62, C.black, { at: [L / 2 - 0.3, 1.52, 0], seg: 4 });
    k.torus(0.08, 0.02, C.steel, { at: [L / 2 - 0.3, 1.14, 0], arc: Math.PI * 1.4, rot: [0, 0, -Math.PI * 0.2], finish: "sheen", seg: [5, 12] });
    return;
  }
  if (/pipe run/.test(n)) {
    for (const [y, r, color] of [[0.4, 0.15, C.steel], [0.74, 0.09, C.steelDark]] as [number, number, string][]) {
      k.cyl(r, L - 0.1, color, { at: [0, y, 0], rot: [0, 0, Math.PI / 2], seg: 14, finish: "sheen" });
      for (let i = 0; i < Math.round(L); i++) k.torus(r + 0.01, 0.025, C.black, { at: [-L / 2 + 0.5 + i, y, 0], rot: [0, Math.PI / 2, 0], finish: "sheen", seg: [5, 16] });
    }
    for (const d of [-L / 2 + 0.3, L / 2 - 0.3]) k.box([0.12, 0.82, 0.24], C.black, { at: [d, 0.41, 0], round: 0.02 });
    k.tube([[L / 2 - 0.6, 0.4, 0], [L / 2 - 0.6, 0.6, 0.12], [L / 2 - 0.8, 0.74, 0.04]], 0.04, C.steel, { along: 8, around: 6, finish: "sheen" });
    return;
  }
  if (/cart/.test(n)) {
    const instrument = /instrument/.test(n);
    k.box([0.6, 0.36, 0.44], instrument ? C.white : C.steelDark, { at: [0, 0.34, 0], round: 0.06, finish: "sheen" });
    k.box([0.52, 0.04, 0.36], instrument ? C.glow : C.amber, { at: [0, 0.54, 0], round: 0.015, finish: instrument ? "glow" : "sheen" });
    for (const [x, z] of [[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.16], [0.22, 0.16]]) k.cyl(0.07, 0.05, C.black, { at: [x, 0.07, z], rot: [Math.PI / 2, 0, 0], seg: 12 });
    k.torus(0.16, 0.015, C.steel, { at: [-0.34, 0.6, 0], rot: [0, Math.PI / 2, 0], arc: Math.PI, finish: "sheen", seg: [5, 12] });
    return;
  }
  if (/boarding ramp/.test(n)) {
    k.box([L - 0.1, 0.08, D - 0.1], C.steelDark, { at: [0, 0.04, 0], rot: [0, 0, 0.08], round: 0.02, finish: "sheen" });
    for (let i = 0; i < 4; i++) k.box([0.06, 0.02, D - 0.2], C.amber, { at: [-0.3 + i * 0.2, 0.1 - i * 0.015, 0], finish: "glow" });
    k.box([0.08, 1.4, D - 0.1], C.black, { at: [-L / 2 + 0.06, 0.8, 0], round: 0.03 });
    return;
  }
  if (/barricade/.test(n)) {
    // A bent shield wall, striped in warning colours
    const R = L * 0.7;
    shell(k, R, 0.08, 0.66, C.steelDark, { at: [0, 0, R - D * 0.2], start: Math.PI - Math.asin(Math.min(1, (L - 0.1) / 2 / R)), arc: 2 * Math.asin(Math.min(1, (L - 0.1) / 2 / R)) });
    shell(k, R + 0.005, 0.08, 0.1, C.amber, { at: [0, 0.42, R - D * 0.2], start: Math.PI - Math.asin(Math.min(1, (L - 0.1) / 2 / R)), arc: 2 * Math.asin(Math.min(1, (L - 0.1) / 2 / R)) });
    return;
  }
  if (/lifter droid dock/.test(n)) {
    k.cyl(0.42, 0.08, C.black, { at: [0, 0.04, 0], seg: 20, finish: "sheen" });
    k.tube([[-0.3, 0.04, -0.3], [-0.32, 0.6, -0.32], [-0.2, 0.95, -0.2]], 0.05, C.steel, { along: 8, around: 6, finish: "sheen" });
    k.sphere(0.06, C.green, { at: [-0.2, 0.98, -0.2], finish: "glow", seg: [8, 6] });
    k.torus(0.3, 0.015, C.green, { at: [0, 0.085, 0], rot: [Math.PI / 2, 0, 0], finish: "glow", seg: [4, 24] });
    return;
  }
  // Wall-mounted equipment and kiosks (see useKindOf)
  if (/security camera|camera pole/.test(n)) {
    k.cyl(0.03, 1.5, C.steelDark, { at: [0, 0.75, 0], seg: 8, finish: "sheen" });
    k.capsule(0.09, 0.2, "#2a2f36", { at: [0, 1.5, 0.06], rot: [Math.PI / 2 - 0.3, 0, 0], finish: "sheen" });
    k.sphere(0.05, C.red, { at: [0, 1.46, 0.22], finish: "glow", seg: [8, 6] });
    return;
  }
  if (/alarm panel/.test(n)) {
    k.box([0.36, 0.44, 0.1], "#8f2f35", { at: [0, 1.1, 0], round: 0.04, finish: "sheen" });
    k.sphere(0.08, "#ff6b6b", { at: [0, 1.12, 0.05], half: true, rot: [Math.PI / 2, 0, 0], finish: "glow" });
    return;
  }
  if (/info kiosk|notice board/.test(n)) {
    k.lathe([[0.24, 0], [0.24, 0.04], [0.1, 0.1], [0.08, 0.7], [0, 0.7]], "#2a2f36", { seg: 14, finish: "sheen" });
    k.box([0.56, 0.5, 0.1], C.black, { at: [0, 1.0, 0], round: 0.05, finish: "sheen" });
    k.box([0.48, 0.42, 0.01], C.glow, { at: [0, 1.0, 0.055], round: 0.02, finish: "glow" });
    return;
  }
  if (/access panel/.test(n)) {
    k.box([0.34, 0.44, 0.1], "#2a2f36", { at: [0, 1.05, 0], round: 0.04, finish: "sheen" });
    k.box([0.22, 0.14, 0.01], C.green, { at: [0, 1.14, 0.055], finish: "glow" });
    for (let i = 0; i < 6; i++) k.box([0.05, 0.035, 0.012], C.steelLight, { at: [-0.06 + (i % 3) * 0.06, 0.99 - Math.floor(i / 3) * 0.05, 0.056], finish: "sheen" });
    return;
  }
  if (/vent stack/.test(n)) {
    k.lathe([[0.3, 0], [0.3, 0.06], [0.2, 0.1], [0.18, 0.8], [0.32, 0.86], [0.34, 0.92], [0, 0.98]], C.steelDark, { seg: 16, finish: "sheen" });
    return;
  }
  if (/cooling unit/.test(n)) {
    k.box([L - 0.2, 0.6, D - 0.2], C.steel, { at: [0, 0.3, 0], round: 0.06, finish: "sheen" });
    for (const x of [-L / 4, L / 4]) {
      k.torus(0.26, 0.03, C.black, { at: [x, 0.61, 0], rot: [Math.PI / 2, 0, 0], finish: "sheen", seg: [6, 20] });
      for (let i = 0; i < 4; i++) k.box([0.48, 0.01, 0.06], C.black, { at: [x, 0.61, 0], rot: [0, i * 0.785, 0] });
    }
    return;
  }
  k.box([L - 0.32, 0.5, D - 0.32], "#3d4856", { at: [0, 0.25, 0], round: 0.06 });
}

// ---------------------------------------------------------------------------------------------
// Architecture. A building's look follows the world it stands on: rounded adobe with arches
// and domes in the desert, sleek hulls with portholes on stations and ocean platforms, hard
// corners in the cities and bunkers on volcanic and barren worlds. Rooms keep their squares;
// only the corners a building shows to the outside are rounded (shared walls stay straight).
// ---------------------------------------------------------------------------------------------

export interface Style {
  // How far an outside corner is rounded, in squares
  corner: number;
  // Doors and windows with round tops; round windows in hulls
  arch: boolean;
  porthole: boolean;
  // A dome over the room that holds the way in
  dome: boolean;
  // A band of a darker colour under the roof
  band: boolean;
}

export function styleOf(biome: string, buildingType = ""): Style {
  if (/starship|station/.test(buildingType) || /station|gas giant|ocean/.test(biome)) return { corner: 0.85, arch: false, porthole: true, dome: false, band: true };
  if (/cave|ruin|trailhead/.test(buildingType)) return { corner: 0.6, arch: true, porthole: false, dome: false, band: false };
  if (biome === "desert") return { corner: 1.4, arch: true, porthole: false, dome: true, band: true };
  if (biome === "ice") return { corner: 1.1, arch: true, porthole: true, dome: true, band: false };
  if (/forest|jungle|swamp|temperate/.test(biome)) return { corner: 0.6, arch: true, porthole: false, dome: false, band: true };
  if (/volcanic|barren/.test(biome)) return { corner: 0.25, arch: false, porthole: false, dome: false, band: true };
  return { corner: 0.3, arch: false, porthole: false, dome: false, band: true };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// A closed room seen from outside: walls rising from a rounded footprint (`radii` for the north-
// west, north-east, south-east and south-west corners), a roof slab and, if asked, a parapet
// round it. Drawn with its corner at the origin, w by d squares.
export function RoomBlock({ w, d, height, radii, wall, roof, parapet, band, dim }: { w: number; d: number; height: number; radii: [number, number, number, number]; wall: string; roof?: string; parapet?: boolean; band?: boolean; dim?: boolean }) {
  const r = radii.map(r2) as [number, number, number, number];
  const body = dim ? shade(wall, 0.45) : wall;
  return (
    <Model
      id={`block:${w}x${d}:${r2(height)}:${r.join(",")}:${body}:${roof}:${parapet ? 1 : 0}${band ? 1 : 0}`}
      position={[w / 2, 0, d / 2]}
      build={(k) => {
        upright(k, planRect(w, d, r), height, body, { bevel: 0.04 });
        if (band) upright(k, planRect(w + 0.06, d + 0.06, r.map((x) => (x ? x + 0.03 : 0)) as typeof r), 0.12, shade(body, 0.72), { y: height - 0.3, bevel: 0.02 });
        if (roof) upright(k, planRect(w + 0.2, d + 0.2, r.map((x) => (x ? x + 0.1 : 0)) as typeof r), 0.1, roof, { y: height, bevel: 0.02 });
        if (parapet) {
          const ring = planRect(w + 0.2, d + 0.2, r.map((x) => (x ? x + 0.1 : 0)) as typeof r);
          ring.holes.push(planRect(w - 0.04, d - 0.04, r.map((x) => Math.max(0, x - 0.12)) as typeof r));
          upright(k, ring, 0.3, wall, { y: height + 0.05, bevel: 0.02 });
        }
      }}
    />
  );
}

// The floor of a room with rounded outside corners (the squares stay where they are)
export function RoundedFloor({ w, d, radii, color, y = -0.2, thick = 0.2 }: { w: number; d: number; radii: [number, number, number, number]; color: string; y?: number; thick?: number }) {
  const r = radii.map(r2) as [number, number, number, number];
  return <Model id={`floor:${w}x${d}:${r.join(",")}:${color}:${thick}`} position={[w / 2, y, d / 2]} shadow={false} build={(k) => upright(k, planRect(w, d, r), thick, color, { bevel: 0.01 })} />;
}

// A curved piece of wall at a rounded corner of an opened room: a quarter ring of radius `r`
// whose centre is `r` in from the corner, `h` high. `corner` 0 north-west, 1 north-east,
// 2 south-east, 3 south-west.
// With `wall` the curve is textured with that wall set, projected on the curve (the wall's colour multiplies it through the vertices)
export function CornerWall({ r, h, thick, corner, color, wall }: { r: number; h: number; thick: number; corner: 0 | 1 | 2 | 3; color: string; wall?: WallSet }) {
  // Turned angles run from south (0) through east (pi/2) and north (pi) to west: each corner's
  // quarter turns outwards from the centre it curves round
  const start = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][corner];
  const build = (k: Kit) => shell(k, r - thick / 2, thick, h, color, { start, arc: Math.PI / 2 });
  const curve = useMemo(() => {
    if (!wall) return null;
    const k = new Kit();
    build(k);
    return k.bake(1 / WALL_TILE).matte ?? null;
  }, [wall, r, h, thick, corner, color]);
  useEffect(() => () => curve?.dispose(), [curve]);
  if (!wall) return <Model id={`cornerwall:${r2(r)}:${r2(h)}:${thick}:${corner}:${color}`} build={build} />;
  // The same tint as the straight walls of the room (a plain room's walls are tinted by their colour, see LocalMap)
  return curve ? <mesh geometry={curve} material={wallMaterial(wall, { tint: color })} castShadow receiveShadow /> : null;
}

// A dome over a room: a turned dome with a rim and a lantern on top
export function DomeRoof({ r, color, lit = true }: { r: number; color: string; lit?: boolean }) {
  return (
    <Model
      id={`dome:${r2(r)}:${color}:${lit ? 1 : 0}`}
      build={(k) => {
        const profile: [number, number][] = [];
        for (let i = 0; i <= 10; i++) {
          const t = (i / 10) * (Math.PI / 2);
          profile.push([Math.cos(t) * r, Math.sin(t) * r * 0.85]);
        }
        k.lathe([[r + 0.08, 0], [r + 0.08, 0.08], ...profile.slice(1)], color, { seg: 28 });
        k.torus(r + 0.04, 0.05, shade(color, 0.75), { at: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], seg: [6, 32] });
        k.lathe([[0.12, 0], [0.12, 0.1], [0.06, 0.16], [0.08, 0.3], [0, 0.34]], shade(color, 0.8), { at: [0, r * 0.85 - 0.02, 0], seg: 12 });
        if (lit) k.sphere(0.05, C.amber, { at: [0, r * 0.85 + 0.36, 0], finish: "glow", seg: [8, 6] });
      }}
    />
  );
}

// A door, way out, secret way or window set in a wall, drawn along x about the origin. Doors
// and windows take the shape of the building's style.
export function Opening({ kind, color, style }: { kind: string; color: string; style?: Pick<Style, "arch" | "porthole"> }) {
  const arch = !!style?.arch;
  const port = !!style?.porthole;
  return (
    <Model
      id={`opening:${kind}:${color}:${arch ? 1 : 0}${port ? 1 : 0}`}
      build={(k) => {
        const depth = 0.26;
        if (kind === "window") {
          if (port) {
            k.torus(0.22, 0.045, C.steelDark, { at: [0, 0.66, 0], finish: "sheen", seg: [8, 24] });
            k.cyl(0.2, 0.2, color, { at: [0, 0.66, 0], rot: [Math.PI / 2, 0, 0], seg: 20, finish: "glow" });
            return;
          }
          const outer = arch ? archShape(0.84, 0.56) : roundedRect(0.84, 0.48, [0.08, 0.08, 0.08, 0.08], -0.42, 0);
          const inner = arch ? archShape(0.7, 0.48) : roundedRect(0.7, 0.36, [0.05, 0.05, 0.05, 0.05], -0.35, 0.06);
          outer.holes.push(inner);
          k.extrude(outer, depth, shade(color, 0.35), { at: [0, 0.3, -depth / 2], bevel: 0.015, finish: "sheen" });
          k.extrude(arch ? archShape(0.7, 0.48) : roundedRect(0.7, 0.36, [0.05, 0.05, 0.05, 0.05], -0.35, 0.06), 0.1, mix(color, "#ffffff", 0.15), { at: [0, 0.3, -0.05], finish: "glow" });
          return;
        }
        if (kind === "secret") {
          k.box([0.76, 0.5, depth + 0.08], "#1b1524", { at: [0, 0.3, 0], round: 0.04 });
          for (const x of [-0.24, -0.08, 0.08, 0.24]) k.capsule(0.022, 0.4, color, { at: [x, 0.3, 0], finish: "glow", seg: 6 });
          return;
        }
        // A door: a frame of the building's shape round a lit panel
        const W = 1.0;
        const H = 1.42;
        const outer = arch ? archShape(W, H) : roundedRect(W, H, [0, 0, port ? 0.3 : 0.1, port ? 0.3 : 0.1], -W / 2, 0);
        const inner = arch ? archShape(W - 0.2, H - 0.1) : roundedRect(W - 0.2, H - 0.1, [0, 0, port ? 0.24 : 0.06, port ? 0.24 : 0.06], -(W - 0.2) / 2, 0);
        outer.holes.push(inner);
        k.extrude(outer, depth, C.steelDark, { at: [0, 0, -depth / 2], bevel: 0.02, finish: "sheen" });
        const panel = arch ? archShape(W - 0.2, H - 0.1) : roundedRect(W - 0.2, H - 0.1, [0, 0, port ? 0.24 : 0.06, port ? 0.24 : 0.06], -(W - 0.2) / 2, 0);
        k.extrude(panel, 0.12, mix(color, "#0b0f14", 0.35), { at: [0, 0, -0.06], finish: "glow" });
        k.box([0.3, 0.06, 0.3], color, { at: [0, H + 0.06, 0], round: 0.025, finish: "glow" });
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Caches and resource nodes
// ---------------------------------------------------------------------------------------------

// A strongbox with a curved lid and a lit lock, standing open once it has been emptied
export function Chest({ looted }: { looted?: boolean }) {
  return (
    <Model
      id={`chest:${looted ? 1 : 0}`}
      position={[0.5, 0, 0.5]}
      build={(k) => {
        k.box([0.66, 0.34, 0.46], "#3a3320", { at: [0, 0.17, 0], round: 0.04 });
        for (const x of [-0.22, 0.22]) k.box([0.06, 0.35, 0.47], "#f5d342", { at: [x, 0.175, 0], finish: "sheen" });
        k.group([0, 0.34, -0.23], looted ? [-1.9, 0, 0] : undefined, undefined, () => {
          k.cyl(0.23, 0.66, "#4a4228", { at: [0, 0, 0.23], rot: [0, 0, Math.PI / 2], arc: Math.PI, start: 0, seg: 14, scale: [0.55, 1, 1] });
          for (const x of [-0.22, 0.22]) k.cyl(0.235, 0.06, "#f5d342", { at: [x, 0, 0.23], rot: [0, 0, Math.PI / 2], arc: Math.PI, start: 0, seg: 14, scale: [0.56, 1, 1], finish: "sheen" });
        });
        if (!looted) k.box([0.12, 0.1, 0.03], "#f5d342", { at: [0, 0.3, 0.24], round: 0.02, finish: "glow" });
        else k.box([0.56, 0.02, 0.36], "#1a160c", { at: [0, 0.33, 0] });
      }}
    />
  );
}

export interface NodeLook { family: string; tier: number }
// A resource node (house rule, see "Gathering" in shared/logic): a vein of ore, a patch of plants,
// a crystal cluster or a heap of parts, dull once it has run dry
export function NodeModel({ node, empty }: { node: NodeLook; empty?: boolean }) {
  return <Model id={`node:${node.family}:${node.tier}:${empty ? 1 : 0}`} position={[0.5, 0, 0.5]} build={(k) => buildNode(k, node, !!empty)} />;
}

function buildNode(k: Kit, node: NodeLook, empty: boolean) {
  const lit = empty ? "matte" : "glow";
  if (node.family === "plant") {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      const h = 0.3 + (i % 3) * 0.12;
      k.tube([[Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08], [Math.cos(a) * 0.16, h * 0.6, Math.sin(a) * 0.16], [Math.cos(a) * 0.26, h, Math.sin(a) * 0.26]], (t) => 0.025 * (1 - t * 0.6), empty ? "#4d4a35" : "#4f9a4f", { along: 8, around: 5 });
      k.blob(0.07, empty ? "#5d5a40" : "#5fb35a", { at: [Math.cos(a) * 0.2, h * 0.8, Math.sin(a) * 0.2], smooth: true, squash: [1.6, 0.4, 0.8], rot: [0, a, 0.3], seed: i });
      if (!empty && i % 2 === 0) k.sphere(0.05, "#f0c24b", { at: [Math.cos(a) * 0.27, h + 0.02, Math.sin(a) * 0.27], finish: lit, seg: [8, 6] });
    }
    return;
  }
  if (node.family === "hide") {
    k.blob(0.3, empty ? "#4d4540" : "#6e4b3a", { at: [0, 0.1, 0], smooth: true, squash: [1.4, 0.35, 1], seed: 4, rough: 0.2 });
    for (const d of [-0.2, 0, 0.2]) k.tube([[d, 0.12, -0.18], [d + 0.04, 0.26, 0], [d, 0.12, 0.18]], 0.02, "#d9d2c0", { along: 8, around: 5 });
    k.blob(0.1, "#d9d2c0", { at: [0.34, 0.12, 0], seed: 2, rough: 0.2, squash: [1.3, 0.8, 0.9] });
    return;
  }
  if (node.family === "crystal") {
    const color = ["#9ad1f0", "#c0a0f0", "#5fa8ff", "#ff6fa8"][node.tier] ?? "#9ad1f0";
    k.blob(0.28, "#4a4f58", { at: [0, 0.06, 0], seed: 6, rough: 0.3, squash: [1.2, 0.4, 1] });
    for (const [x, z, h, tx, tz] of [[0, 0, 0.5, 0, 0], [0.12, 0.08, 0.36, 0.35, 0.2], [-0.1, 0.1, 0.3, -0.3, 0.3], [0.04, -0.12, 0.28, 0.1, -0.4]]) {
      k.group([x, 0.12, z], [tz, 0, -tx], undefined, () => {
        k.cyl(0.06, h, empty ? "#6a6f78" : color, { at: [0, h / 2, 0], seg: 6, finish: empty ? "sheen" : "glass" });
        k.cone(0.06, 0.1, empty ? "#6a6f78" : color, { at: [0, h + 0.05, 0], seg: 6, finish: lit });
      });
    }
    return;
  }
  if (node.family === "salvage") {
    shell(k, 0.32, 0.03, 0.24, "#59636d", { at: [-0.05, 0, 0], start: 0.4, arc: 2.2, rot: [0.3, 0, 0.2] });
    k.box([0.3, 0.18, 0.24], "#3d4856", { at: [0.12, 0.12, 0.1], rot: [0.2, 0.5, 0.1], round: 0.03, finish: "sheen" });
    k.tube([[-0.25, 0.04, 0.2], [-0.05, 0.2, 0.25], [0.2, 0.05, 0.3]], 0.03, C.steel, { along: 8, around: 6, finish: "sheen" });
    if (!empty) k.box([0.1, 0.05, 0.1], C.green, { at: [-0.12, 0.26, -0.02], finish: "glow" });
    return;
  }
  const vein = ["#b0b8c0", "#7fd0ff", "#ffb347", "#ff6b6b"][node.tier] ?? "#b0b8c0";
  k.blob(0.36, "#4a4f58", { at: [0, 0.16, 0], seed: 9 + node.tier, rough: 0.3, squash: [1.2, 0.6, 1] });
  for (let i = 0; i < 4; i++) k.blob(0.07, empty ? "#5a5f68" : vein, { at: [Math.cos(i * 1.7) * 0.26, 0.2 + (i % 2) * 0.06, Math.sin(i * 1.7) * 0.2], seed: i, rough: 0.4, finish: empty ? "matte" : lit });
}

// ---------------------------------------------------------------------------------------------
// The street and the wild: trees, rocks, lamps, vaporators
// ---------------------------------------------------------------------------------------------

export function Decor({ kind, seed = 0 }: { kind: string; seed?: number }) {
  const v = seed % 3;
  return <Model id={`decor:${kind}:${v}`} position={[0.5, 0, 0.5]} build={(k) => buildDecor(k, kind, v)} />;
}

function buildDecor(k: Kit, kind: string, v: number) {
  if (kind === "tree") {
    // A bent, tapering trunk with a crown of soft lumps
    const lean = [0.18, -0.12, 0.08][v];
    k.tube([[0, -0.05, 0], [lean * 0.4, 0.5, 0.05], [lean, 1.0, -0.04], [lean * 1.3, 1.3, 0.02]], (t) => 0.11 * (1 - t * 0.55), "#5f3f28", { along: 10, around: 7 });
    k.tube([[lean * 0.6, 0.8, 0], [lean * 0.6 + 0.25, 1.05, 0.15], [lean * 0.6 + 0.38, 1.18, 0.2]], (t) => 0.04 * (1 - t * 0.5), "#5f3f28", { along: 6, around: 5 });
    const leaf = ["#2f6b3a", "#3a7a3f", "#2a5e36"][v];
    k.blob(0.48, leaf, { at: [lean * 1.2, 1.55, 0], smooth: true, rough: 0.25, seed: 3 + v, squash: [1.1, 0.8, 1.1] });
    k.blob(0.32, shade(leaf, 1.15), { at: [lean * 1.2 + 0.3, 1.35, 0.2], smooth: true, rough: 0.3, seed: 7 + v });
    k.blob(0.3, shade(leaf, 0.9), { at: [lean * 1.2 - 0.28, 1.4, -0.18], smooth: true, rough: 0.3, seed: 11 + v });
    return;
  }
  if (kind === "lamp") {
    k.lathe([[0.14, 0], [0.14, 0.05], [0.06, 0.1], [0.04, 1.7], [0, 1.7]], "#59636d", { seg: 10, finish: "sheen" });
    k.tube([[0, 1.6, 0], [0.05, 1.86, 0], [0.25, 1.92, 0], [0.38, 1.82, 0]], 0.025, "#59636d", { along: 10, around: 6, finish: "sheen" });
    k.lathe([[0, 0], [0.1, 0.02], [0.08, 0.1], [0, 0.12]], "#2a2f36", { at: [0.38, 1.7, 0], seg: 12, finish: "sheen" });
    k.sphere(0.07, "#ffd98a", { at: [0.38, 1.7, 0], finish: "glow", seg: [10, 8] });
    return;
  }
  if (kind === "mast") {
    // A moisture vaporator: a ribbed tower with fins near its top
    k.lathe([[0.2, 0], [0.2, 0.1], [0.14, 0.18], [0.1, 0.9], [0.13, 0.95], [0.08, 1.4], [0.11, 1.45], [0.06, 1.9], [0.08, 1.95], [0, 2.05]], "#d7d2c4", { seg: 14, finish: "sheen" });
    for (const y of [0.6, 1.2]) k.torus(0.12, 0.02, "#a8a294", { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], seg: [5, 16], finish: "sheen" });
    for (let i = 0; i < 3; i++) k.box([0.3, 0.03, 0.05], "#d7d2c4", { at: [Math.cos(i * 2.1) * 0.12, 1.55, Math.sin(i * 2.1) * 0.12], rot: [0, -i * 2.1, 0], finish: "sheen" });
    return;
  }
  if (kind === "kiosk") {
    k.lathe([[0.22, 0], [0.22, 0.05], [0.1, 0.12], [0.09, 0.7], [0, 0.7]], "#2a2f36", { seg: 12, finish: "sheen" });
    k.box([0.5, 0.5, 0.1], C.black, { at: [0, 0.98, 0], round: 0.05, finish: "sheen" });
    k.box([0.42, 0.42, 0.01], C.glow, { at: [0, 0.98, 0.055], round: 0.02, finish: "glow" });
    return;
  }
  if (kind === "camera") {
    k.cyl(0.04, 2.4, "#59636d", { at: [0, 1.2, 0], top: 0.03, seg: 8, finish: "sheen" });
    k.capsule(0.1, 0.22, "#2a2f36", { at: [0, 2.3, 0.12], rot: [Math.PI / 2 - 0.35, 0, 0], finish: "sheen" });
    k.sphere(0.05, C.red, { at: [0, 2.26, 0.3], finish: "glow", seg: [8, 6] });
    return;
  }
  if (kind === "crate") {
    crate(k, [0, 0, 0], [0.6, 0.56, 0.6], [C.olive, C.steelDark, "#4f6b8a"][v]);
    return;
  }
  if (kind === "ice") {
    k.blob(0.42, "#cfe3ec", { at: [0, 0.28, 0], seed: 13 + v, rough: 0.35, finish: "sheen", squash: [1, 0.8, 1] });
    k.cone(0.14, 0.6, "#e6f4fa", { at: [0.24, 0.4, 0.1], rot: [0.1, 0, -0.2], seg: 5, finish: "glass" });
    return;
  }
  k.blob(0.4, C.rock, { at: [0, 0.25, 0], seed: 21 + v * 5, rough: 0.35, squash: [1.1, 0.75, 1] });
  k.blob(0.16, "#5f5c58", { at: [0.3, 0.06, 0.22], seed: 4 + v, rough: 0.35 });
}

// ---------------------------------------------------------------------------------------------
// Ships and speeders. A ship is built on 6 by 4 squares with its bow to +x and stretched to its
// footprint by whoever draws it; the Empire's (and the First Order's and the Sith's) are drawn
// in their own manner. A speeder's front is +z.
// ---------------------------------------------------------------------------------------------

export type ShipLook = { size: string; role: string; status: string; owner?: string; name?: string; hull?: number; disabled?: boolean };
const IMPERIAL = /empire|imperial|first order|sith/i;

export function shipClass(ship: Pick<ShipLook, "size" | "role">): "fighter" | "shuttle" | "freighter" | "capital" {
  const role = `${ship.role} ${ship.size}`.toLowerCase();
  if (/fighter|interceptor|skiff|tiny|bomber/.test(role)) return "fighter";
  if (/shuttle|transport|courier|small/.test(role)) return "shuttle";
  if (/freighter|hauler|smuggl|medium/.test(role)) return "freighter";
  return "capital";
}

export function ShipBody({ ship, grain }: { ship: ShipLook; grain?: number }) {
  const kind = shipClass(ship);
  const imperial = IMPERIAL.test(ship.owner ?? "");
  const wrecked = ship.status === "wrecked";
  const tone = kind === "freighter" && !imperial ? pickOf(["#b9b1a0", "#a9b0b5", "#c2b8a3"], ship.name ?? ship.role) : "";
  return <Model id={`ship:${kind}:${imperial ? "imp" : "std"}:${wrecked ? 1 : 0}:${tone}`} build={(k) => buildShip(k, kind, imperial, wrecked, tone)} wear={{ ...hullWear(ship, imperial), grain }} />;
}

// A hull turned round the x axis: points are [radius, x] from stern to bow
function hullAlongX(k: Kit, profile: [number, number][], color: string, o: PartOptions & { seg?: number } = {}) {
  const [x, y, z] = o.at ?? [0, 0, 0];
  k.group([x, y, z], o.rot, o.scale, () => k.lathe(profile, color, { rot: [0, 0, -Math.PI / 2], seg: o.seg ?? 18, finish: o.finish ?? "sheen" }));
}

function buildShip(k: Kit, kind: string, imperial: boolean, wrecked: boolean, tone: string) {
  const hull = wrecked ? "#5a554f" : imperial ? "#8d949b" : tone || "#c3c8cc";
  const dark = wrecked ? "#3a3733" : imperial ? "#2f343a" : "#59636d";
  const accent = wrecked ? "#4a2a26" : imperial ? "#3a4048" : "#b8473e";
  const lit = wrecked ? "matte" : "glow";
  const flame = wrecked ? "#2b2926" : C.glow;
  const glass: Finish = wrecked ? "matte" : "glass";
  const struts = () => {
    if (wrecked) return;
    for (const [x, z] of [[-1.4, -0.9], [-1.4, 0.9], [1.4, 0]]) {
      k.cyl(0.05, 0.42, "#2b2f36", { at: [x, 0.21, z], seg: 6, finish: "sheen" });
      k.cyl(0.12, 0.04, "#2b2f36", { at: [x, 0.02, z], seg: 10 });
    }
  };
  if (kind === "fighter" && imperial) {
    // A ball cockpit between two six-sided wings
    const y = 1.35;
    k.sphere(0.62, hull, { at: [0, y, 0], seg: [20, 14], finish: "sheen" });
    k.torus(0.3, 0.05, dark, { at: [0.55, y, 0], rot: [0, Math.PI / 2, 0], seg: [8, 20], finish: "sheen" });
    k.cyl(0.27, 0.06, "#1b2a38", { at: [0.57, y, 0], rot: [0, 0, Math.PI / 2], seg: 16, finish: glass });
    for (let i = 0; i < 8; i++) k.box([0.02, 0.5, 0.03], dark, { at: [0.6, y, 0], rot: [i * 0.785, 0, 0] });
    k.pair((s) => {
      k.cyl(0.16, 1.0, dark, { at: [0, y, s * 0.95], rot: [Math.PI / 2, 0, 0], top: 0.1, seg: 12, finish: "sheen" });
      const hex = new THREE.Shape();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const [px, py] = [Math.cos(a) * 1.15, Math.sin(a) * 1.25];
        if (i) hex.lineTo(px, py);
        else hex.moveTo(px, py);
      }
      k.extrude(hex, 0.08, "#24292f", { at: [0, y, s * 1.45 - 0.04], bevel: 0.02, finish: "sheen" });
      for (let i = 0; i < 3; i++) k.box([2.2, 0.05, 0.12], dark, { at: [0, y, s * 1.45], rot: [0, 0, (i * Math.PI) / 3 + Math.PI / 2], finish: "sheen" });
    });
    k.pair((s) => k.cyl(0.06, 0.3, "#2b2f36", { at: [-0.1, 0.15, s * 1.45], seg: 6 }));
    return;
  }
  if (kind === "fighter") {
    // A long tapering fuselage, four wings in an X with cannon at their tips, engines at the roots
    hullAlongX(k, [[0, 0], [0.3, 0], [0.36, 0.4], [0.34, 1.6], [0.28, 2.6], [0.16, 3.7], [0.06, 4.3], [0, 4.35]], hull, { at: [-2.1, 0.8, 0] });
    k.box([1.4, 0.06, 0.36], accent, { at: [0.6, 0.98, 0], round: 0.02 });
    k.capsule(0.2, 0.6, "#1b2a38", { at: [0.55, 1.08, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.9], finish: glass });
    k.sphere(0.14, "#3b6fb5", { at: [-0.25, 1.1, 0], half: true, finish: "sheen" });
    for (const [side, up] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      k.group([-1.1, 0.8, 0], [side * up * 0.22, 0, 0], undefined, () => {
        const wing = new THREE.Shape();
        wing.moveTo(0.6, 0.25);
        wing.lineTo(-0.7, 0.25);
        wing.lineTo(-0.4, 2.0);
        wing.lineTo(0.3, 2.0);
        wing.lineTo(0.6, 0.25);
        k.extrude(wing, 0.05, hull, { at: [0, up * 0.0, 0], rot: [side > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0], bevel: 0.015, finish: "sheen" });
        k.box([0.5, 0.055, 0.12], accent, { at: [-0.1, 0, side * 1.2] });
        k.cyl(0.035, 1.9, dark, { at: [0.6, 0, side * 2.0], rot: [0, 0, Math.PI / 2], seg: 6, finish: "sheen" });
        k.cyl(0.06, 0.3, dark, { at: [-0.3, 0, side * 2.0], rot: [0, 0, Math.PI / 2], seg: 8, finish: "sheen" });
        hullAlongX(k, [[0, 0], [0.13, 0], [0.15, 0.1], [0.15, 0.9], [0.1, 1.05], [0, 1.08]], dark, { at: [-0.9, up * 0.0, side * 0.42] });
        k.cyl(0.11, 0.02, flame, { at: [-0.91, 0, side * 0.42], rot: [0, 0, Math.PI / 2], seg: 12, finish: lit });
      });
    }
    return;
  }
  if (kind === "shuttle" && imperial) {
    // A cockpit at the bow, a tall fin and two wings folded up to land
    struts();
    hullAlongX(k, [[0, 0], [0.55, 0], [0.62, 0.3], [0.62, 2.2], [0.5, 2.9], [0.3, 3.3], [0, 3.45]], hull, { at: [-1.9, 1.0, 0], scale: [1, 1, 0.8], seg: 8 });
    k.box([0.6, 0.3, 0.7], "#1b2a38", { at: [1.35, 1.12, 0], round: 0.1, finish: glass });
    const fin = new THREE.Shape();
    fin.moveTo(-1.4, 0);
    fin.lineTo(0.3, 0);
    fin.lineTo(-0.2, 2.2);
    fin.lineTo(-0.9, 2.2);
    fin.lineTo(-1.4, 0);
    k.extrude(fin, 0.07, hull, { at: [0, 1.5, -0.035], bevel: 0.02, finish: "sheen" });
    k.pair((s) => {
      k.group([-0.5, 1.15, s * 0.5], [s * -1.05, 0, 0], undefined, () => {
        const wing = new THREE.Shape();
        wing.moveTo(-1.0, 0);
        wing.lineTo(0.5, 0);
        wing.lineTo(0.1, 1.7);
        wing.lineTo(-0.6, 1.7);
        wing.lineTo(-1.0, 0);
        k.extrude(wing, 0.06, hull, { rot: [s > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0], bevel: 0.02, finish: "sheen" });
      });
    });
    k.pair((s) => k.cyl(0.12, 0.05, flame, { at: [-1.92, 1.0, s * 0.25], rot: [0, 0, Math.PI / 2], seg: 12, finish: lit }));
    return;
  }
  if (kind === "shuttle") {
    // A rounded wedge of a hull seen side on, a canopy at the bow and engines aft
    struts();
    const side = new THREE.Shape();
    side.moveTo(-2.1, 0.45);
    side.lineTo(1.2, 0.45);
    side.quadraticCurveTo(2.5, 0.5, 2.6, 0.95);
    side.quadraticCurveTo(2.2, 1.25, 1.2, 1.5);
    side.lineTo(-1.6, 1.55);
    side.quadraticCurveTo(-2.1, 1.5, -2.1, 1.1);
    side.lineTo(-2.1, 0.45);
    k.extrude(side, 1.3, hull, { at: [0, 0, -0.65], bevel: 0.12, finish: "sheen" });
    k.box([3.2, 0.08, 1.56], accent, { at: [-0.3, 1.0, 0] });
    k.capsule(0.28, 0.5, "#1b2a38", { at: [1.75, 1.18, 0], rot: [0, 0, Math.PI / 2 - 0.35], scale: [1, 1, 1.6], finish: glass });
    k.pair((s) => {
      hullAlongX(k, [[0, 0], [0.26, 0], [0.3, 0.15], [0.3, 1.2], [0.2, 1.45], [0, 1.5]], dark, { at: [-2.3, 0.95, s * 0.95] });
      k.cyl(0.24, 0.02, flame, { at: [-2.31, 0.95, s * 0.95], rot: [0, 0, Math.PI / 2], seg: 14, finish: lit });
      k.box([1.6, 0.06, 0.9], dark, { at: [-0.6, 0.95, s * 1.15], rot: [s * 0.15, 0, 0], round: 0.02, finish: "sheen" });
    });
    return;
  }
  if (kind === "freighter") {
    // A saucer with forward mandibles, a cockpit tube out to starboard, a dish and a band of
    // engine light round its stern
    struts();
    const R = 1.85;
    k.lathe([[0, 0.55], [R * 0.9, 0.55], [R, 0.7], [R, 0.85], [R * 0.82, 1.05], [R * 0.45, 1.18], [R * 0.3, 1.32], [0, 1.34]], hull, { at: [-0.5, 0, 0], seg: 36, finish: "sheen" });
    k.torus(R * 0.62, 0.05, dark, { at: [-0.5, 1.1, 0], rot: [Math.PI / 2, 0, 0], seg: [6, 36], finish: "sheen" });
    k.torus(R + 0.005, 0.09, flame, { at: [-0.5, 0.78, 0], rot: [Math.PI / 2, 0, Math.PI * 0.725], arc: Math.PI * 0.55, seg: [6, 24], finish: lit, scale: [1, 1, 0.6] });
    k.pair((s) => {
      const prong = roundedRect(1.7, 0.6, [0, 0.25, 0.25, 0], 0, -0.3);
      k.extrude(prong, 0.3, hull, { at: [1.0, 1.0, s * 0.5], rot: [Math.PI / 2, 0, 0], bevel: 0.05, finish: "sheen" });
    });
    k.tube([[0.3, 0.9, 1.1], [0.9, 0.92, 1.6], [1.4, 0.92, 1.85]], 0.26, hull, { along: 10, around: 12, finish: "sheen" });
    k.sphere(0.28, "#1b2a38", { at: [1.45, 0.94, 1.87], seg: [14, 10], finish: glass });
    k.sphere(0.36, "#7b8794", { at: [-0.2, 1.5, -1.0], rot: [0, 0, -0.9], theta: [0, 1.1], seg: [16, 6], finish: "cloth" });
    k.cyl(0.03, 0.3, dark, { at: [-0.2, 1.38, -1.0], seg: 6 });
    k.cyl(0.22, 0.12, dark, { at: [-0.4, 1.38, 0], seg: 16, finish: "sheen" });
    k.pair((s) => k.cyl(0.03, 0.5, dark, { at: [-0.15, 1.46, s * 0.07], rot: [0, 0, Math.PI / 2], seg: 6 }));
    return;
  }
  if (imperial) {
    // A wedge of a warship with its tower astern
    struts();
    const wedge = new THREE.Shape();
    wedge.moveTo(2.9, 0);
    wedge.lineTo(-2.4, 1.75);
    wedge.lineTo(-2.6, 0);
    wedge.lineTo(-2.4, -1.75);
    wedge.lineTo(2.9, 0);
    k.extrude(wedge, 0.5, hull, { at: [0, 0.65, 0], rot: [-Math.PI / 2, 0, 0], bevel: 0.08, finish: "sheen" });
    const upper = new THREE.Shape();
    upper.moveTo(2.2, 0);
    upper.lineTo(-2.1, 1.2);
    upper.lineTo(-2.2, -1.2);
    upper.lineTo(2.2, 0);
    k.extrude(upper, 0.3, shade(hull, 0.92), { at: [0, 1.15, 0], rot: [-Math.PI / 2, 0, 0], bevel: 0.06, finish: "sheen" });
    k.box([0.7, 0.5, 0.5], hull, { at: [-1.6, 1.75, 0], round: 0.08, finish: "sheen" });
    k.box([0.3, 0.12, 1.1], dark, { at: [-1.6, 2.05, 0], round: 0.04 });
    k.pair((s) => k.sphere(0.13, hull, { at: [-1.6, 2.18, s * 0.42], seg: [10, 8], finish: "sheen" }));
    for (const z of [-0.6, 0, 0.6]) k.cyl(0.24, 0.04, flame, { at: [-2.65, 0.95, z], rot: [0, 0, Math.PI / 2], seg: 14, finish: lit });
    return;
  }
  // A corvette: a hammerhead bow, a slim neck and a block of engines astern
  struts();
  k.box([1.0, 0.9, 2.4], hull, { at: [2.3, 1.0, 0], round: 0.3, finish: "sheen" });
  hullAlongX(k, [[0.42, 0], [0.42, 0.2], [0.34, 1.0], [0.3, 2.6], [0.36, 3.0], [0.36, 3.2]], hull, { at: [-1.2, 1.0, 0] });
  k.box([1.8, 1.3, 2.6], dark, { at: [-1.9, 1.0, 0], round: 0.25, finish: "sheen" });
  k.box([2.6, 0.02, 0.3], accent, { at: [0.6, 1.31, 0] });
  for (let i = 0; i < 8; i++) {
    const [y, z] = [0.68 + (i % 2) * 0.62, -0.95 + Math.floor(i / 2) * 0.63];
    hullAlongX(k, [[0, 0], [0.2, 0], [0.24, 0.12], [0.24, 0.3], [0.3, 0.4]], dark, { at: [-3.1, y, z], seg: 12 });
    k.cyl(0.2, 0.02, flame, { at: [-3.11, y, z], rot: [0, 0, Math.PI / 2], seg: 12, finish: lit });
  }
  k.box([0.06, 0.24, 1.2], "#1b2a38", { at: [2.82, 1.12, 0], finish: glass });
}

// A ship on the floor, built on 6 by 4 squares with the bow to +x and stretched to its footprint;
// `ceiling` (squares) is the roof it stands under, which the hull is kept below
const HULL_HEIGHT = 2.4;
// (the wear's texture is laid in model units and the hull is stretched to its footprint, so the density is raised by the stretch, in a few
// steps: each step is another baked copy of the hull)
const GRAINS = [1, 1.5, 2.5, 4, 6, 9];
const grainFor = (stretch: number) => GRAINS.reduce((best, g) => (Math.abs(Math.log(g / stretch)) < Math.abs(Math.log(best / stretch)) ? g : best), 1);
export function ShipModel({ ship, w, h, ceiling }: { ship: ShipLook; w: number; h: number; ceiling?: number }) {
  const wrecked = ship.status === "wrecked";
  return (
    <group position={[w / 2, 0, h / 2]} scale={[w / 6, Math.min(w / 6, h / 4, ceiling ? ceiling / HULL_HEIGHT : Infinity), h / 4]} rotation={wrecked ? [0.12, 0, 0.16] : undefined}>
      <ShipBody ship={ship} grain={grainFor(Math.sqrt((w / 6) * (h / 4)))} />
    </group>
  );
}

// A speeder standing on the ground, hovering a hand's breadth up: a bike, a landspeeder with its
// windscreen, or an airspeeder with its canopy. A wreck lies tilted and dark, smoking.
export function SpeederModel({ model, wrecked }: { model: string; wrecked?: boolean }) {
  const kind = speederKind(model);
  return (
    <group position={[0, wrecked ? 0.05 : 0.28, 0]} rotation={wrecked ? [0.12, 0.5, 0.18] : [0, 0, 0]}>
      <Model id={`speeder:${kind}:${wrecked ? 1 : 0}:${pickOf(["a", "b", "c"], model)}`} build={(k) => buildSpeeder(k, kind, !!wrecked, model)} wear={speederWear(model, wrecked)} />
    </group>
  );
}

function buildSpeeder(k: Kit, kind: string, wrecked: boolean, model: string) {
  const paint = wrecked ? "#4b4742" : kind === "bike" ? pickOf(["#c8663a", "#3f5f3a", "#8a8f96"], model) : kind === "air" ? pickOf(["#4a7bd0", "#e8e4dc", "#c84a3a"], model) : pickOf(["#d0a23a", "#b5562f", "#7d8c9a"], model);
  const dark = wrecked ? "#2b2926" : "#2b2f36";
  const lit: Finish = wrecked ? "matte" : "glow";
  const glass: Finish = wrecked ? "matte" : "glass";
  if (kind === "bike") {
    // A long slim body, steering vanes far out in front on two rods, the seat and engine behind
    k.group(undefined, [Math.PI / 2, 0, 0], undefined, () => k.lathe([[0, -0.9], [0.1, -0.85], [0.16, -0.6], [0.15, 0.2], [0.1, 0.6], [0.04, 0.8], [0, 0.82]], paint, { seg: 14, finish: "sheen", scale: [1, 1, 0.8] }));
    k.pair((s) => {
      k.cyl(0.015, 1.0, dark, { at: [s * 0.08, 0.12, 1.15], rot: [Math.PI / 2, 0, 0], seg: 5 });
      k.box([0.03, 0.18, 0.3], paint, { at: [s * 0.12, 0.14, 1.62], round: 0.012, finish: "sheen" });
    });
    k.box([0.24, 0.08, 0.5], "#3a2c20", { at: [0, 0.18, -0.35], round: 0.04 });
    k.torus(0.12, 0.015, dark, { at: [0, 0.3, 0.32], rot: [0.3, 0, 0], arc: Math.PI, seg: [5, 12] });
    k.cyl(0.13, 0.32, dark, { at: [0, 0.04, -0.8], rot: [Math.PI / 2, 0, 0], seg: 12, finish: "sheen" });
    k.cyl(0.1, 0.02, wrecked ? dark : C.glow, { at: [0, 0.04, -0.97], rot: [Math.PI / 2, 0, 0], seg: 12, finish: lit });
  } else if (kind === "air") {
    // A wedge seen from above, its edges rounded, a canopy over two seats, air brakes and engines
    const top = new THREE.Shape();
    top.moveTo(0, 1.5);
    top.quadraticCurveTo(0.5, 1.2, 0.8, 0.2);
    top.lineTo(0.75, -1.2);
    top.lineTo(-0.75, -1.2);
    top.lineTo(-0.8, 0.2);
    top.quadraticCurveTo(-0.5, 1.2, 0, 1.5);
    k.extrude(top, 0.22, paint, { at: [0, 0.34, 0], rot: [Math.PI / 2, 0, 0], bevel: 0.06, finish: "sheen" });
    k.capsule(0.3, 0.6, "#1b2a38", { at: [0, 0.38, -0.05], rot: [Math.PI / 2, 0, 0], scale: [1, 0.55, 1], finish: glass });
    k.pair((s) => {
      k.box([0.45, 0.04, 0.5], dark, { at: [s * 0.95, 0.12, -0.6], round: 0.02 });
      k.cyl(0.13, 0.5, dark, { at: [s * 0.5, 0.1, -1.25], rot: [Math.PI / 2, 0, 0], seg: 12, finish: "sheen" });
      k.cyl(0.1, 0.02, wrecked ? dark : C.glow, { at: [s * 0.5, 0.1, -1.5], rot: [Math.PI / 2, 0, 0], seg: 12, finish: lit });
    });
  } else {
    // An open landspeeder: a body with a rounded nose, a curved windscreen, two seats and three
    // engine pods behind
    const top = roundedRect(1.2, 2.1, [0.15, 0.15, 0.5, 0.5], -0.6, -1.0);
    k.extrude(top, 0.26, paint, { at: [0, 0.36, 0], rot: [Math.PI / 2, 0, 0], bevel: 0.07, finish: "sheen" });
    k.box([0.8, 0.12, 0.8], "#1f1a16", { at: [0, 0.3, -0.05], round: 0.05 });
    k.pair((s) => k.box([0.3, 0.2, 0.26], "#6b4a33", { at: [s * 0.2, 0.36, -0.2], round: 0.06 }));
    k.cyl(0.55, 0.26, "#9fd4ea", { at: [0, 0.48, 0.15], arc: Math.PI * 0.7, start: -Math.PI * 0.35, open: true, seg: 14, finish: glass, scale: [1, 1, 0.5] });
    for (const [x, y] of [[-0.55, 0.15], [0.55, 0.15], [0, 0.45]]) {
      k.group([x, y, -1.1], [Math.PI / 2, 0, 0], undefined, () => k.lathe([[0, -0.4], [0.12, -0.36], [0.15, -0.2], [0.15, 0.25], [0.11, 0.4], [0, 0.42]], dark, { seg: 12, finish: "sheen" }));
      k.cyl(0.1, 0.02, wrecked ? dark : C.glow, { at: [x, y, -1.53], rot: [Math.PI / 2, 0, 0], seg: 12, finish: lit });
    }
  }
  if (wrecked) k.blob(0.22, "#6b6862", { at: [0.1, 0.9, 0], smooth: true, seed: 3, rough: 0.3, finish: "haze" });
}

// ---------------------------------------------------------------------------------------------
// People. What a species looks like is read from the rules data (`species`: skin, hair and eye
// colours, average height and its "distinctions": lekku, montrals, horns, tusks, fur, antennae,
// large eyes, head tentacles, ...), fetched once; what someone wears comes from what they do.
// ---------------------------------------------------------------------------------------------

interface SpeciesRecord { name: string; skinColorOptions?: string; hairColorOptions?: string; eyeColorOptions?: string; distinctions?: string; heightAverage?: string; heightRollMod?: string; size?: string }

export interface Look {
  skin: string[];
  hair: string[];
  eyes: string[];
  scale: number;
  bulk: number;
  fur: boolean;
  scales: boolean;
  carapace: boolean;
  lekku: boolean;
  montrals: boolean;
  headTails: boolean;
  horns: number;
  hornsDown: boolean;
  tusks: boolean;
  snout: "" | "short" | "long" | "trunk" | "beak" | "muzzle" | "pig";
  eyeSize: "small" | "big" | "side";
  eyeCount: number;
  eyeStalks: boolean;
  glowEyes: boolean;
  antennae: boolean;
  ears: "" | "pointed" | "large" | "long" | "floppy";
  headTentacles: boolean;
  faceTentacles: boolean;
  mane: boolean;
  wings: boolean;
  arms: number;
  tail: boolean;
  head: "round" | "cone" | "cranium" | "dome" | "long" | "flat" | "hammer";
  longNeck: boolean;
  hunched: boolean;
  mask: "" | "rebreather" | "wraps" | "bone" | "goggles";
  hooded: boolean;
  slug: boolean;
  crest: boolean;
  spines: boolean;
  tattoos: boolean;
  // A droid built like a person: a metal head with lit eyes
  machine?: boolean;
}

const HUMAN_TONES = ["#f1d3b8", "#e0b897", "#c99a6e", "#a8754b", "#7a4f32", "#53351f"];
const COLOR_WORDS: [RegExp, string][] = [
  [/light blue|pale blue|bluish/, "#8fb6e8"], [/dark blue|deep blue/, "#2f4f8f"], [/blue/, "#4a78c2"], [/turquoise|teal|cyan/, "#3fa9a8"],
  [/light green|pale green/, "#9cc48a"], [/dark green|deep|drag green/, "#3c5e34"], [/olive/, "#6f7a3e"], [/green/, "#5f8f4e"],
  [/dark brown/, "#4e3420"], [/light brown/, "#a07a52"], [/brown|chestnut/, "#7a5233"], [/mahogany/, "#6e3a26"], [/ebony/, "#3a2a22"],
  [/dark gr[ae]y|slate/, "#4f545b"], [/silver/, "#b8c0c8"], [/gr[ae]y/, "#8a8f96"],
  [/orange/, "#d27d3c"], [/salmon/, "#e48e74"], [/light pink|pale pink/, "#f0c4c4"], [/pink/, "#e3a3a8"], [/crimson|scarlet/, "#9b1c2c"], [/red/, "#b9423c"],
  [/purple|violet|magenta/, "#7e5aa6"], [/gold|golden/, "#d4a94a"], [/yellow/, "#d6c057"], [/tan|cream|beige/, "#c7a17a"],
  [/chalk|white|pale|clear|translucent/, "#e8e4dc"], [/black|dark/, "#2a2a2e"], [/blond/, "#d9c27a"], [/auburn/, "#8a3a22"], [/amber|hazel/, "#b8862f"],
];

// The colours named in a list such as "Blue, brown, dark grey, green, or striped"
function colorsIn(text = ""): string[] {
  const t = text.toLowerCase();
  if (!t || /^none|varies|variable/.test(t)) return [];
  if (/light to dark|tones/.test(t)) return /pale|light tones/.test(t) && !/dark/.test(t) ? HUMAN_TONES.slice(0, 3) : HUMAN_TONES;
  const out: string[] = [];
  for (const part of t.split(/,|\bor\b|\band\b|\bto\b|;|\(/)) {
    const found = COLOR_WORDS.find(([re]) => re.test(part));
    if (found && !out.includes(found[1])) out.push(found[1]);
  }
  return out;
}

const inches = (text = "") => {
  const m = text.match(/(\d+)'\s*(\d+)?/);
  return m ? Number(m[1]) * 12 + Number(m[2] ?? 0) : 0;
};

export function lookOf(record?: SpeciesRecord): Look {
  const d = (record?.distinctions ?? "").toLowerCase();
  const name = (record?.name ?? "").toLowerCase();
  const roll = (record?.heightRollMod ?? "").match(/(\d+)d(\d+)/);
  const tall = inches(record?.heightAverage) + (roll ? (Number(roll[1]) * (Number(roll[2]) + 1)) / 2 : 0);
  const fallback = /small/i.test(record?.size ?? "") ? 42 : /tiny/i.test(record?.size ?? "") ? 14 : 67;
  const fur = /\bfur|furry|hair covered|furred|covered in fur|lagomorph|lupine|lion-like/.test(d);
  const skin = colorsIn(record?.skinColorOptions);
  const hair = colorsIn(record?.hairColorOptions);
  return {
    skin: skin.length ? skin : HUMAN_TONES,
    hair,
    eyes: colorsIn(record?.eyeColorOptions),
    scale: Math.max(0.3, Math.min(1.45, (tall || fallback) / 67)),
    bulk: /brawny|stocky|imposing|large frame|massive|bulbous|thick skull|great physical|porcine/.test(d) ? 1.22 : /spindly|long limbs|slender|skeletal|very tall/.test(d) ? 0.85 : 1,
    fur,
    scales: /scal|reptil/.test(d),
    carapace: /carapace|chitin|exoskeleton|insectoid/.test(d),
    lekku: /lekku/.test(d),
    montrals: /montral/.test(d),
    headTails: /head-tails/.test(d),
    horns: /single horn/.test(d) ? 1 : /small horns|chin horns|two transparent horns|horns or horn spots/.test(d) ? 2 : /horns/.test(d) ? 5 : 0,
    hornsDown: /iktotchi/.test(name),
    tusks: /tusk/.test(d),
    snout: /porcine/.test(d) ? "pig" : /trunk/.test(d) ? "trunk" : /beak/.test(d) ? "beak" : /lion-like|lupine|muzzle|canine/.test(d) ? "muzzle" : /long snout|goat-like snout|prehensile snout|long pointed faces/.test(d) ? "long" : /snout/.test(d) ? "short" : fur ? "muzzle" : "",
    eyeSize: /goggle-like eyes/.test(d) ? "side" : /large.{0,20}eyes|bulbous eyes|large red eyes/.test(d) ? "big" : "small",
    eyeCount: /single eye/.test(d) ? 1 : /three eyes/.test(d) ? 3 : /four eyes/.test(d) ? 4 : /six eyes/.test(d) ? 6 : 2,
    eyeStalks: /eye stalks|stalk eyes/.test(d),
    glowEyes: /glowing.{0,10}eyes/.test(d) || /glowing/.test((record?.eyeColorOptions ?? "").toLowerCase()),
    antennae: /antenna/.test(d),
    ears: /long ears/.test(d) ? "long" : /floppy ears/.test(d) ? "floppy" : /large ears|large, pointed ears|sloping, large ears|large pointed ears/.test(d) ? "large" : /pointed ears|elongated ears/.test(d) ? "pointed" : "",
    headTentacles: /head tentacles|head-tendrils|snake-like "hair"|tendrils/.test(d),
    faceTentacles: /tentacle facial|tentacles that protrude|cheek tendrils/.test(d),
    mane: /lion-like|large beards/.test(d),
    wings: /wings|winged/.test(d),
    arms: /four arms|two pairs of arms/.test(d) ? 4 : 2,
    tail: /tail/.test(d),
    head: /curved neck/.test(d) ? "hammer" : /cone-like skull|head cones/.test(d) ? "cone" : /large cranium|large heads/.test(d) ? "cranium" : /domed heads/.test(d) ? "dome" : /elongated heads|elongated, tapered skull/.test(d) ? "long" : /flat\s+heads|horizontal.{0,20}head/.test(d) ? "flat" : "round",
    longNeck: /long necks/.test(d),
    hunched: /hunch/.test(d),
    mask: /wrappings/.test(d) ? "wraps" : /rebreather|breathing apparatus/.test(d) ? "rebreather" : /bone masks/.test(d) ? "bone" : /protective eyewear/.test(d) ? "goggles" : "",
    hooded: /^jawa$/.test(name),
    slug: /slug-like/.test(d),
    crest: /crest|ridged skull|bony and ridged/.test(d),
    spines: /spine|bone spurs|spurs|frills/.test(d),
    tattoos: /tattoo/.test(d),
  };
}

// The species of the rules data, fetched once for the whole map
export const useSpecies = (() => {
  let started = false;
  const listeners = new Set<() => void>();
  let looks: Record<string, Look> = {};
  const load = () => {
    if (started || typeof fetch === "undefined") return;
    started = true;
    fetch("/api/sw5e/species?fields=name,skinColorOptions,hairColorOptions,eyeColorOptions,distinctions,heightAverage,heightRollMod,size")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: SpeciesRecord[] | { data?: SpeciesRecord[] }) => {
        const list = Array.isArray(rows) ? rows : rows.data ?? [];
        looks = Object.fromEntries(list.map((row) => [row.name.toLowerCase(), lookOf(row)]));
        listeners.forEach((l) => l());
      })
      .catch(() => {
        started = false;
      });
  };
  return function useSpeciesLooks(): Record<string, Look> {
    const [, redraw] = useState(0);
    useEffect(() => {
      load();
      const l = () => redraw((n) => n + 1);
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    }, []);
    return looks;
  };
})();

// What someone wears and carries
// A loaded model for a place on a body (interiors/gear.ts `wantsOf` says which; `scale` is how large)
export interface Attach {
  // The model's name (gear.ts), to tell one figure's gear from another's
  id: string;
  slot: Slot;
  geometry: THREE.BufferGeometry;
  scale: number;
  // The point of the model's own frame the hand closes on (its `grip` socket), where it has one, and where the second hand does
  grip?: [number, number, number];
  offHand?: [number, number, number];
  // The model's name in the catalogue, for what is fitted to the body (a mask, an amulet)
  name?: string;
}
export interface Outfit {
  // The weight of armour worn (pauldrons, a heavier plate): from what the character wears
  weight?: "light" | "medium" | "heavy";
  garment: "tunic" | "robe" | "armor" | "jacket" | "vest" | "apron" | "coat" | "labcoat" | "flightsuit" | "overalls" | "uniform" | "rags" | "bare";
  top: string;
  bottom: string;
  accent: string;
  head: "" | "trooper" | "scout" | "pilot" | "tiepilot" | "hood" | "cap" | "bounty" | "guard" | "helmet" | "deathtrooper" | "navy" | "bubble" | "hazmat" | "dive";
  hand: "" | "pistol" | "rifle" | "saber" | "saber2" | "pike" | "gaffi" | "vibro" | "axe" | "bowcaster" | "tool" | "tray" | "datapad" | "staff" | "play";
  blade?: string;
  armor?: string;
  cape?: string;
  belt?: boolean;
  pack?: boolean;
  bandolier?: boolean;
  // A sealed suit worn (a flightsuit's cut with its own helmet, pack and fittings), gloves, and boots (2026-10-21)
  suit?: SuitStyle;
  gloves?: "plain" | "shock";
  boots?: "plain" | "rocket";
}

const TOPS = ["#7a4b2a", "#5b6b8a", "#8a7a62", "#4f6b4a", "#7d3b4a", "#3d4856", "#a0826a", "#6a5a7a", "#9a6a3a", "#4a6a7a"];
const BOTTOMS = ["#3d4856", "#2b2f36", "#5a4a3a", "#4a4f3a", "#3a3530"];

// Clothes by what someone is (a stat block's name, an occupant's role), varied by their name
export function outfitOf(name: string, role = "", look?: Look, force?: { blade: string } | null): Outfit {
  const n = `${name} ${role}`.toLowerCase();
  const top = pickOf(TOPS, name || role);
  const bottom = pickOf(BOTTOMS, name || role, 3);
  const base = { top, bottom, accent: pickOf(["#c8a24a", "#9a3a2a", "#3a6a9a", "#5a8a4a"], name, 5), head: "" as Outfit["head"], hand: "" as Outfit["hand"] };
  const white = "#e9edf0";
  if (force) return { ...base, garment: "robe", top: pickOf(["#6b4f36", "#d9cdb4", "#4a3626", "#2b2522"], name), bottom: "#3a2c20", head: "", hand: "saber", blade: force.blade, belt: true };
  if (/death trooper/.test(n)) return { ...base, garment: "armor", armor: "#1b1d21", head: "deathtrooper", hand: "rifle" };
  if (/purge trooper/.test(n)) return { ...base, garment: "armor", armor: "#202226", accent: "#9b1c2c", head: "helmet", hand: "staff" };
  if (/navy pilot|tie pilot/.test(n)) return { ...base, garment: "flightsuit", top: "#1d1f24", bottom: "#1d1f24", head: "tiepilot", hand: "pistol" };
  if (/navy trooper/.test(n)) return { ...base, garment: "uniform", top: "#4a4f57", bottom: "#2b2f36", head: "navy", hand: "pistol", belt: true };
  if (/trooper|stormtrooper|clone/.test(n)) {
    const scout = /scout/.test(n);
    return { ...base, garment: "armor", armor: /shore/.test(n) ? "#d9cfb8" : white, head: scout ? "scout" : "trooper", hand: scout ? "pistol" : /flame/.test(n) ? "tool" : "rifle", pack: /jump|flame|heavy|demolition/.test(n), accent: /captain|headhunter/.test(n) ? "#d97a2b" : base.accent };
  }
  if (/grand admiral/.test(n)) return { ...base, garment: "uniform", top: white, bottom: white, head: "cap", hand: "", belt: true };
  if (/royal guard|senate guard|shadow guard|guard champion|guard sentinel/.test(n)) {
    const color = /senate/.test(n) ? "#2f4f8f" : /shadow/.test(n) ? "#1d1f24" : "#9b1c2c";
    return { ...base, garment: "robe", top: color, bottom: color, head: "guard", hand: "pike", cape: color };
  }
  if (/inquisitor/.test(n)) return { ...base, garment: "armor", armor: "#1d1d22", accent: "#9b1c2c", head: "", hand: "saber2", blade: "#ff4040" };
  if (/sith|dark lord|dark side/.test(n)) return { ...base, garment: "robe", top: "#18181b", bottom: "#18181b", head: "hood", hand: "saber", blade: "#ff4040" };
  if (/jedi/.test(n)) return { ...base, garment: "robe", top: "#d9cdb4", bottom: "#6b4f36", head: "", hand: "saber", blade: pickOf(["#7fe3ff", "#6ef08a"], name) };
  if (/officer|isb|commander|admiral|moff|captain/.test(n) || role === "officer" || role === "leader") return { ...base, garment: "uniform", top: /isb/.test(n) ? "#1d1f24" : "#56624f", bottom: "#2b2f36", head: "cap", hand: "pistol", belt: true };
  if (/gamorrean/.test(n)) return { ...base, garment: "bare", top: "#5a4a3a", head: "", hand: "axe", bandolier: true, belt: true };
  if (/trandoshan/.test(n)) return { ...base, garment: "flightsuit", top: "#c9b26a", bottom: "#c9b26a", head: "", hand: "rifle" };
  if (/tusken/.test(n)) return { ...base, garment: "robe", top: "#b9a07a", bottom: "#8a7356", head: "", hand: "gaffi", belt: true, bandolier: true };
  if (/wookiee/.test(n) || (look?.fur && look.scale > 1.2)) return { ...base, garment: "bare", head: "", hand: /hunter|berserker/.test(n) || role === "mercenary" ? "bowcaster" : "", bandolier: true };
  if (/jawa/.test(n) || look?.hooded) return { ...base, garment: "robe", top: "#6b4f36", bottom: "#5a4230", head: "hood", hand: /tinkerer/.test(n) ? "tool" : "pistol", belt: true, bandolier: true };
  if (/kolkpravis/.test(n)) return { ...base, garment: "armor", armor: "#6b4f36", head: "helmet", hand: "axe" };
  if (/monk|priest|acolyte|scholar|archivist|sage/.test(n)) return { ...base, garment: "robe", top: pickOf(["#8a7a62", "#5a4a6a", "#4a5a6a"], name), bottom: "#3a3530", head: "hood", hand: "" };
  if (/bounty hunter|headhunter|mandalorian/.test(n)) return { ...base, garment: "armor", armor: pickOf(["#5f6f5a", "#8a8f96", "#6b4f36", "#3f5f7a"], name), head: "bounty", hand: "rifle", cape: pickOf(["#3a3530", "#5a2a2a"], name), pack: true };
  if (/mercenar/.test(n)) return { ...base, garment: "armor", armor: pickOf(["#6f7448", "#59636d", "#7a5a3a"], name), head: pickOf(["helmet", ""], name) as Outfit["head"], hand: "rifle" };
  if (/guard|sentry|sentries|constable|watch|security|patrol|warden|enforcer/.test(n)) return { ...base, garment: "armor", armor: pickOf(["#59636d", "#4a5a6a", "#7b8794"], role || name), head: "helmet", hand: "rifle" };
  if (/bartender|barkeep|cook|chef/.test(n)) return { ...base, garment: "apron", accent: "#e8dcc0", hand: /bartender|barkeep/.test(n) ? "tray" : "" };
  if (/medic|doctor|surgeon|healer/.test(n)) return { ...base, garment: "labcoat", top: white, bottom: "#5b6b8a", head: "", hand: "datapad" };
  if (/dignitary|governor|regent|queen|king|prince|duke|baron|chancellor/.test(n)) return { ...base, garment: "robe", top: pickOf(["#5a2a6a", "#7a2a3a", "#2a4a6a"], name), bottom: "#2b2f36", accent: "#d8b45a", head: "", hand: "", cape: pickOf(["#3a1a4a", "#6a1a2a"], name), belt: true };
  if (/chamberlain|steward|herald/.test(n)) return { ...base, garment: "coat", top: "#3a2a4a", accent: "#d8b45a", head: "", hand: "datapad", belt: true };
  if (/croupier/.test(n)) return { ...base, garment: "vest", top: "#e8e0d0", accent: "#9a2a3a", hand: "", belt: true };
  if (/mechanic|engineer|technician|tinker|repair|attendant|outfitter/.test(n)) return { ...base, garment: "overalls", top: pickOf(["#a0703a", "#5a6a7a", "#7a7a5a"], name), bottom: "", head: "", hand: "tool", belt: true };
  if (/dockmaster|ticket|clerk|agent|official/.test(n)) return { ...base, garment: "coat", top: pickOf(["#3d4856", "#4a3a3a"], name), accent: "#f0a03c", head: "cap", hand: "datapad" };
  if (/pilot/.test(n)) return { ...base, garment: "flightsuit", top: pickOf(["#d9752b", "#6b4f36", "#4a5a3a"], name), bottom: "", head: "", hand: "pistol", belt: true };
  if (/smuggl|scoundrel|gambler/.test(n)) return { ...base, garment: "vest", top: "#e8e0d0", accent: pickOf(["#2b2522", "#4a3a2a", "#3a4a5a"], name), hand: "pistol", belt: true };
  if (/thug|gang|enforcer|bruiser|brawl|pirate|raider/.test(n)) return { ...base, garment: "vest", accent: "#2b2522", hand: "vibro", belt: true };
  if (/fence|spy|informant/.test(n)) return { ...base, garment: "robe", top: "#2b2f36", bottom: "#2b2f36", head: "hood", hand: "" };
  if (/merchant|trader|shop|vendor|dealer|seller|stallholder/.test(n)) return { ...base, garment: "coat", accent: base.accent, head: "", hand: "datapad", belt: true };
  if (/noble|aristocrat|governor|senator|crime lord|boss/.test(n)) return { ...base, garment: "robe", top: pickOf(["#5a2a6a", "#7a5a2a", "#2a4a6a"], name), bottom: "#2b2f36", accent: "#d8b45a", head: "", hand: "", cape: "#3a1a4a" };
  if (/captive|slave|prisoner/.test(n)) return { ...base, garment: "rags", top: "#8a7a62", bottom: "#5a4a3a", head: "", hand: "" };
  if (/musician|singer|performer|dancer/.test(n)) return { ...base, garment: pickOf(["tunic", "vest"], name) as Outfit["garment"], top: pickOf(["#7d3b4a", "#3a6a9a", "#9a6a3a"], name), head: "", hand: /musician/.test(n) ? "play" : "" };
  if (/scaveng|scrapper|farmer|settler|nomad/.test(n)) return { ...base, garment: "rags", top: pickOf(["#a08a6a", "#8a7a62"], name), head: "", hand: "", belt: true };
  if (/hunter/.test(n)) return { ...base, garment: "vest", accent: "#5a4a3a", hand: "rifle", belt: true };
  if (/player/.test(n)) return { ...base, garment: "jacket", top: "#7a4b2a", bottom: "#3d4856", accent: "#e8e0d0", head: "", hand: "pistol", belt: true };
  return { ...base, garment: pickOf(["tunic", "jacket", "tunic", "coat", "vest"], name || role, 1) as Outfit["garment"], head: "", hand: "" };
}

// A person, built standing on the origin facing +z, a little over a square tall for a human.
// Heights and widths follow the look; `skin`, `hair` and `eye` are this one's colours.
export function buildHumanoid(k: Kit, look: Look, o: Outfit, skin: string, hair: string, eye: string, seed = 0, attach: Attach[] = []) {
  const b = look.bulk;
  const fur = look.fur;
  const flesh = fur && hair ? hair : skin;
  const armored = o.garment === "armor";
  const plate = o.armor ?? "#e9edf0";
  const under = "#1b1d21";
  const bare = o.garment === "bare";
  const robe = o.garment === "robe";
  const suit = o.garment === "flightsuit" || o.garment === "overalls";
  const legs = armored ? plate : bare ? flesh : suit ? o.top : o.bottom;
  const torsoColor = armored ? shade(plate, 0.9) : bare ? flesh : o.top;
  const sleeve = armored ? plate : bare || o.garment === "vest" ? flesh : o.top;
  const hipW = 0.085 * b;
  const prosLeg = attach.find((a) => a.slot === "legL");
  k.group(undefined, undefined, look.scale, () => {
    // Legs and feet
    k.pair((s) => k.limb(s > 0 ? LIMB.legL : LIMB.legR, [s * hipW, 0.56, 0], () => {
      // A leg of metal where there is a prosthesis, drawn over with the model
      if (prosLeg && s > 0) alongLimb(k, prosLeg, [s * hipW, 0.56, 0], [s * hipW, 0.05, 0.01], "x");
      k.tube([[s * hipW, 0.56, 0], [s * hipW * 1.05, 0.31, 0.025], [s * hipW, 0.08, -0.01]], (t) => (0.064 - t * 0.02) * b, prosLeg && s > 0 ? "#8a949e" : legs, { along: 6, around: 7, finish: armored ? "sheen" : "matte" });
      const boot = o.boots ? "#2b2f36" : bare ? flesh : armored ? plate : o.garment === "uniform" ? "#15171b" : "#2a2420";
      k.box([0.1 * b, 0.09, 0.2], boot, { at: [s * hipW, 0.045, 0.03], round: 0.035, finish: armored || o.garment === "uniform" || o.boots ? "sheen" : "matte" });
      if (o.garment === "uniform" || o.boots) k.cyl(0.05 * b, 0.2, boot, { at: [s * hipW, 0.16, 0], seg: 10, finish: "sheen" });
      // Rocket boots: a thruster at each heel, glowing
      if (o.boots === "rocket") {
        k.cyl(0.032 * b, 0.07, "#59636d", { at: [s * hipW, 0.06, -0.09], rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" });
        k.sphere(0.022 * b, "#ffb347", { at: [s * hipW, 0.06, -0.13], finish: "glow", seg: [6, 5] });
      }
      if (armored) {
        k.capsule(0.056 * b, 0.1, plate, { at: [s * hipW, 0.43, 0.014], finish: "sheen", seg: 8 });
        k.sphere(0.046 * b, under, { at: [s * hipW * 1.05, 0.31, 0.03], seg: [8, 6] });
      }
    }));
    // A robe or a coat falls from the waist; a tail behind
    if (robe) k.lathe([[0.27 * b, 0.03], [0.28 * b, 0.06], [0.22 * b, 0.28], [0.175 * b, 0.5], [0.15 * b, 0.62]], o.bottom, { seg: 16, scale: [1, 1, 0.85] });
    if (o.garment === "coat" || o.garment === "labcoat") k.lathe([[0.21 * b, 0.28], [0.2 * b, 0.32], [0.17 * b, 0.5], [0.15 * b, 0.62]], o.top, { seg: 14, scale: [1, 1, 0.8] });
    if (o.garment === "rags") k.lathe([[0.19 * b, 0.36], [0.18 * b, 0.4], [0.16 * b, 0.5], [0.145 * b, 0.6]], shade(o.top, 0.85), { seg: 9, scale: [1, 1, 0.8] });
    if (look.tail) k.tube([[0, 0.55, -0.08], [0, 0.38, -0.25], [0.04, 0.12, -0.4], [0.1, 0.03, -0.58]], (t) => 0.05 * (1 - t * 0.7) * b, flesh, { along: 12, around: 7 });
    if (o.cape) k.lathe([[0.3 * b, 0.1], [0.24 * b, 0.4], [0.2 * b, 0.95]], o.cape, { seg: 14, start: Math.PI / 2 + 0.25, arc: Math.PI - 0.5, finish: "cloth", at: [0, 0, -0.02] });
    // Everything above the hips, leaning forward when the species is hunched
    k.group([0, 0.56, 0], look.hunched ? [0.32, 0, 0] : undefined, undefined, () => upper(k, look, o, { b, flesh, torsoColor, sleeve, plate, under, armored, bare, hair, skin, eye, seed, attach }));
    // Kits, tools and gear worn on the hips, the back, the belt and the shoulder, where this species has them (interiors/anchors.ts)
    for (const a of attach) {
      if (a.slot === "hipR" || a.slot === "hipL" || a.slot === "back" || a.slot === "belt" || a.slot === "shoulder") {
        const { at, rot } = bodyAnchor(a.slot, { bulk: b, hunched: look.hunched, wings: look.wings, longNeck: look.longNeck });
        k.addModel(a.geometry, { at, rot, scale: a.scale });
      }
    }
  });
}

// A model lying along a limb: its `axis` end (the hand or foot, +x for the prostheses) at `to`, its other end at `from`, scaled to the
// length between them
function alongLimb(k: Kit, a: Attach, from: V3, to: V3, axis: "x") {
  const g = a.geometry;
  g.boundingBox ?? g.computeBoundingBox();
  const length = g.boundingBox!.max.x - g.boundingBox!.min.x;
  const [p, q] = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
  const dir = q.clone().sub(p);
  const scale = dir.length() / Math.max(length, 0.01);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(axis === "x" ? 1 : 0, 0, 0), dir.normalize()));
  const mid = p.add(q).multiplyScalar(0.5);
  k.addModel(g, { at: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z], scale });
}

// A held weapon or shield set on a hand: `grip` is how far along it (0 the rear, 1 the muzzle or point) the hand takes it, unless the model
// says where its own grip is (its `grip` socket), when the hand closes there exactly
function inHand(k: Kit, a: Attach, hand: V3, dir: V3, grip: number) {
  const g = a.geometry;
  g.boundingBox ?? g.computeBoundingBox();
  const length = g.boundingBox!.max.z - g.boundingBox!.min.z;
  const { at, rot } = holdAt(hand, dir, length, a.scale, grip, a.grip);
  k.addModel(g, { at, rot, scale: a.scale });
}

interface Body { b: number; flesh: string; torsoColor: string; sleeve: string; plate: string; under: string; armored: boolean; bare: boolean; hair: string; skin: string; eye: string; seed: number; attach: Attach[] }

function upper(k: Kit, look: Look, o: Outfit, p: Body) {
  const { b, flesh, torsoColor, sleeve, plate, armored } = p;
  // Hips and the trunk: a turned body, flattened front to back
  k.box([0.3 * b, 0.14, 0.19], armored ? plate : o.garment === "flightsuit" || o.garment === "overalls" ? o.top : p.bare ? flesh : o.bottom, { round: 0.05, finish: armored ? "sheen" : "matte" });
  k.lathe([[0.13 * b, 0], [0.14 * b, 0.06], [0.16 * b, 0.16], [0.185 * b, 0.26], [0.19 * b, 0.32], [0.15 * b, 0.39], [0.06, 0.43], [0, 0.43]], torsoColor, { scale: [1, 1, 0.62], seg: 12, finish: armored ? "sheen" : "matte" });
  // A garment worn over the trunk, following its curve, open at the front by `gap` either side
  const wrap = (color: string, gap: number, from = 0.03, to = 0.39, front = 0) => {
    const r = (y: number) => (y < 0.06 ? 0.15 : y < 0.16 ? 0.15 + (y - 0.06) * 0.2 : y < 0.26 ? 0.17 + (y - 0.16) * 0.25 : y < 0.32 ? 0.197 : 0.197 - (y - 0.32) * 0.5) * b * 1.04;
    const ys = [from, 0.06, 0.16, 0.26, 0.32, to].filter((y) => y >= from && y <= to);
    k.lathe(ys.map((y) => [r(y), y] as [number, number]), color, { scale: [1, 1, 0.64], seg: 16, start: front + gap, arc: Math.PI * 2 - gap * 2, finish: "cloth" });
  };
  // What is worn over it
  const front = 0.12 * b;
  switch (o.garment) {
    case "armor":
      // Medium and heavy armour carries pauldrons, heavy ones a back plate
      if (o.weight === "medium" || o.weight === "heavy") k.pair((s) => k.sphere((o.weight === "heavy" ? 0.085 : 0.07) * b, plate, { at: [s * 0.2 * b, 0.37, 0], scale: [1.05, 0.75, 1.15], finish: "sheen", seg: [8, 6] }));
      if (o.weight === "heavy") k.box([0.26 * b, 0.26, 0.04], shade(plate, 0.85), { at: [0, 0.22, -0.11 * b], round: 0.02, finish: "sheen" });
      k.box([0.32 * b, 0.19, 0.2 * b], plate, { at: [0, 0.27, 0.01], round: 0.07, finish: "sheen" });
      k.box([0.24 * b, 0.11, 0.17 * b], plate, { at: [0, 0.12, 0.01], round: 0.05, finish: "sheen" });
      k.torus(0.15 * b, 0.025, plate, { at: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.65, 1], finish: "sheen", seg: [6, 18] });
      k.box([0.07, 0.05, 0.04], o.accent, { at: [0.08 * b, 0.32, front + 0.02], round: 0.015, finish: "sheen" });
      break;
    case "vest":
      wrap(o.accent, 0.35);
      break;
    case "jacket":
      k.box([0.07 * b, 0.33, 0.02], o.accent, { at: [0, 0.2, front - 0.004], round: 0.01 });
      wrap(o.top, 0.22, 0.03, 0.4);
      break;
    case "apron":
      k.lathe([[0.155 * b, -0.3], [0.15 * b, -0.1], [0.152 * b, 0.0], [0.17 * b, 0.16], [0.19 * b, 0.27], [0.18 * b, 0.32]], o.accent, { scale: [1, 1, 0.68], seg: 12, start: -0.85, arc: 1.7, finish: "cloth" });
      break;
    case "uniform":
      k.pair((s) => k.box([0.012, 0.3, 0.02], shade(o.top, 0.75), { at: [s * 0.03, 0.2, front + 0.004] }));
      for (let i = 0; i < 3; i++) k.box([0.022, 0.016, 0.01], ["#e5484d", "#5ad1ff", "#f0c24b"][i], { at: [0.06 * b + i * 0.026, 0.3, front + 0.008], finish: "glow" });
      break;
    case "flightsuit":
      k.box([0.16 * b, 0.12, 0.06], o.top === "#1d1f24" ? "#3a3f46" : "#d9d2c0", { at: [0, 0.28, front + 0.02], round: 0.02, finish: "sheen" });
      k.pair((s) => k.box([0.025, 0.36, 0.02], "#2b2f36", { at: [s * 0.07 * b, 0.21, front + 0.008] }));
      break;
    case "overalls":
      k.pair((s) => k.box([0.03, 0.3, 0.02], shade(o.top, 0.8), { at: [s * 0.07 * b, 0.25, front + 0.006] }));
      k.box([0.18 * b, 0.12, 0.02], shade(o.top, 0.9), { at: [0, 0.16, front + 0.006], round: 0.01 });
      break;
    case "labcoat":
    case "coat":
      k.box([0.05 * b, 0.33, 0.02], o.garment === "labcoat" ? "#5b6b8a" : o.accent, { at: [0, 0.2, front + 0.003] });
      if (o.accent === "#f0a03c") k.torus(0.155 * b, 0.012, o.accent, { at: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.66, 1], finish: "glow", seg: [4, 18] });
      break;
  }
  if (o.belt || o.garment === "tunic" || o.garment === "robe" || o.garment === "rags") k.torus(0.142 * b, 0.022, o.garment === "rags" ? "#8a7356" : "#2b2522", { at: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.66, 1], seg: [6, 18] });
  if (o.hand === "tool" || o.garment === "overalls") for (let i = 0; i < 3; i++) k.box([0.04, 0.06, 0.03], ["#7b8794", "#f0a03c", "#59636d"][i], { at: [-0.1 + i * 0.1, 0.02, front - 0.01], round: 0.01, finish: "sheen" });
  if (o.bandolier) {
    k.torus(0.2 * b, 0.022, "#4a3626", { at: [0, 0.22, 0], rot: [Math.PI / 2, 0.7, 0], scale: [1, 0.62, 1], seg: [5, 20] });
    for (let i = 0; i < 4; i++) k.box([0.03, 0.035, 0.02], "#9aa3ad", { at: [-0.08 + i * 0.055, 0.12 + i * 0.06, front + 0.01], rot: [0, 0, -0.7], finish: "sheen" });
  }
  if (o.pack) k.box([0.22 * b, 0.26, 0.1], armored ? shade(p.plate, 0.85) : o.suit ? shade(o.accent, 0.8) : "#4a4f3a", { at: [0, 0.24, -0.13 * b], round: 0.04, finish: "sheen" });
  // A sealed suit's fittings: a control panel on the chest; the tanks of a space suit, the hoses of a diving suit, a hazard suit's filter
  if (o.suit) {
    k.box([0.12 * b, 0.09, 0.03], "#2b2f36", { at: [0, 0.27, front + 0.012], round: 0.01, finish: "sheen" });
    k.box([0.08 * b, 0.02, 0.02], C.glow, { at: [0, 0.285, front + 0.03], finish: "glow" });
    if (o.suit === "space") k.pair((s) => k.cyl(0.05, 0.28, "#c9ccd2", { at: [s * 0.08 * b, 0.3, -0.19 * b], seg: 10, finish: "sheen" }));
    if (o.suit === "diving") k.pair((s) => k.tube([[s * 0.05 * b, 0.42, 0.0], [s * 0.13 * b, 0.32, front + 0.05], [s * 0.07 * b, 0.18, front + 0.05]], 0.012, "#b9893a", { along: 8, around: 5, finish: "sheen" }));
    if (o.suit === "hazard") k.cyl(0.035, 0.12, "#59636d", { at: [0.08 * b, 0.36, front + 0.02], seg: 8, finish: "sheen" });
  }
  // What is worn on the trunk and at the throat (a vest, an amulet, a collar), fitted to the build (interiors/anchors.ts)
  for (const a of p.attach) {
    if ((a.slot !== "torso" && a.slot !== "neck") || !a.name) continue;
    const fit = torsoFit(a.name, modelInfo(a.name)?.box ?? [-0.05, -0.05, -0.05, 0.05, 0.05, 0.05], b);
    if (fit) k.addModel(a.geometry, { at: fit.at, rot: fit.rot, scale: fit.scale * a.scale });
  }
  if (look.wings) k.pair((s) => {
    const wing = new THREE.Shape();
    wing.moveTo(0, 0);
    wing.quadraticCurveTo(0.25, 0.25, 0.5, 0.35);
    wing.quadraticCurveTo(0.35, 0.05, 0.4, -0.15);
    wing.quadraticCurveTo(0.2, -0.05, 0, -0.1);
    k.extrude(wing, 0.01, shade(flesh, 0.8), { at: [s * 0.06, 0.3, -0.12], rot: [0, s > 0 ? -0.5 : Math.PI + 0.5, 0], finish: "cloth" });
  });
  // Arms, posed for what is in the hand
  const sh = 0.34;
  const poses: Record<string, { r: V3[]; l: V3[] }> = {
    rifle: { r: [[-0.2 * b, sh, 0], [-0.21 * b, 0.13, 0.04], [-0.1, 0.07, 0.17]], l: [[0.2 * b, sh, 0], [0.2 * b, 0.17, 0.12], [0.05, 0.19, 0.26]] },
    bowcaster: { r: [[-0.2 * b, sh, 0], [-0.21 * b, 0.13, 0.04], [-0.1, 0.07, 0.17]], l: [[0.2 * b, sh, 0], [0.2 * b, 0.17, 0.12], [0.05, 0.19, 0.26]] },
    saber: { r: [[-0.2 * b, sh, 0], [-0.24 * b, 0.13, 0.06], [-0.12, 0.05, 0.2]], l: [[0.2 * b, sh, 0], [0.19 * b, 0.13, 0.08], [-0.06, 0.06, 0.21]] },
    saber2: { r: [[-0.2 * b, sh, 0], [-0.24 * b, 0.13, 0.06], [-0.12, 0.05, 0.2]], l: [[0.2 * b, sh, 0], [0.24 * b, 0.12, 0.02], [0.25 * b, -0.06, 0.06]] },
    tray: { r: [[-0.2 * b, sh, 0], [-0.24 * b, 0.12, -0.01], [-0.22 * b, 0.12, 0.2]], l: [[0.2 * b, sh, 0], [0.25 * b, 0.12, -0.02], [0.25 * b, -0.06, 0.06]] },
    datapad: { r: [[-0.2 * b, sh, 0], [-0.24 * b, 0.12, 0], [-0.1, 0.12, 0.17]], l: [[0.2 * b, sh, 0], [0.24 * b, 0.12, 0], [0.06, 0.13, 0.17]] },
    // Playing an instrument held out in front of the chest in both hands (what a band plays: interiors/gear.ts, `Hand` "play")
    play: { r: [[-0.2 * b, sh, 0], [-0.21 * b, 0.17, 0.07], [-0.07, 0.2, 0.2]], l: [[0.2 * b, sh, 0], [0.2 * b, 0.2, 0.11], [0.09, 0.22, 0.25]] },
  };
  const hang = { r: [[-0.2 * b, sh, 0], [-0.25 * b, 0.12, -0.02], [-0.25 * b, -0.06, 0.06]] as V3[], l: [[0.2 * b, sh, 0], [0.25 * b, 0.12, -0.02], [0.25 * b, -0.06, 0.06]] as V3[] };
  let pose = poses[o.hand] ?? hang;
  // The second hand of a two-handed weapon closes on the weapon's own `off_hand` socket, where an arm can reach it
  const wielded = p.attach.find((a) => a.slot === "weapon");
  if (wielded?.offHand && (o.hand === "rifle" || o.hand === "bowcaster" || o.hand === "play")) {
    const [right, left] = [pose.r[2], pose.l[2]];
    wielded.geometry.boundingBox ?? wielded.geometry.computeBoundingBox();
    const length = wielded.geometry.boundingBox!.max.z - wielded.geometry.boundingBox!.min.z;
    const off = offHandAt(right, [left[0] - right[0], left[1] - right[1], left[2] - right[2]], length, wielded.scale, 0.3, wielded.grip, wielded.offHand, pose.l[0]);
    if (off) pose = { r: pose.r, l: [pose.l[0], pose.l[1], off] };
  }
  const glove = o.gloves ? "#2b2f36" : armored ? p.under : p.bare || o.garment !== "uniform" ? flesh : "#15171b";
  for (const [i, arm] of [pose.r, pose.l].entries()) {
    const s = i ? 1 : -1;
    // An arm that hangs swings with the stride; one that holds something stays where it is
    k.limb(pose === hang ? (i ? LIMB.armL : LIMB.armR) : LIMB.body, [s * 0.19 * b, sh, 0], () => {
    // An arm of metal where there is a prosthesis, drawn over with the model
    const metal = !i && !!p.attach.find((a) => a.slot === "armR");
    const prosthesis = !i ? p.attach.find((a) => a.slot === "armR") : undefined;
    if (prosthesis) alongLimb(k, prosthesis, [s * 0.19 * b, sh, 0], arm[2], "x");
    k.sphere(0.062 * b, armored ? plate : sleeve, { at: [s * 0.19 * b, sh, 0], seg: [8, 6], finish: armored ? "sheen" : "matte" });
    k.tube(arm, (t) => (0.05 - t * 0.014) * b, metal ? "#8a949e" : sleeve, { along: 6, around: 6, finish: armored || metal ? "sheen" : "matte" });
    if (armored) k.sphere(0.042 * b, p.under, { at: arm[1], seg: [8, 6] });
    k.sphere((o.gloves ? 0.05 : 0.044) * b, metal ? "#59636d" : glove, { at: arm[2], scale: [0.85, 1.1, 0.95], seg: [7, 5], finish: o.gloves ? "sheen" : undefined });
    // Shock gloves crackle at the knuckles
    if (o.gloves === "shock") k.sphere(0.02 * b, "#7fe3ff", { at: [arm[2][0], arm[2][1], arm[2][2] + 0.04], finish: "glow", seg: [6, 4] });
    // What the hands hold: the weapon in the right, a shield on the left forearm
    for (const a of p.attach) {
      if (!i && a.slot === "weapon") {
        const [right, left] = [pose.r[2], pose.l[2]];
        if (o.hand === "rifle" || o.hand === "bowcaster" || o.hand === "play") inHand(k, a, right, [left[0] - right[0], left[1] - right[1], left[2] - right[2]], 0.3);
        else if (o.hand === "pike" || o.hand === "staff" || o.hand === "gaffi") inHand(k, a, right, [0, 1, 0.05], 0.35);
        else if (o.hand === "pistol") inHand(k, a, right, [0, 0.08, 1], 0.2);
        else inHand(k, a, right, [0, 0.6, 0.55], 0.15);
      } else if (!i && a.slot === "wrist") {
        // A band round the forearm just above the hand, its axis along the forearm, as wide as the arm is
        const from = new THREE.Vector3(...arm[1]);
        const to = new THREE.Vector3(...arm[2]);
        const dir = to.clone().sub(from);
        const at = from.clone().add(dir.clone().multiplyScalar(0.8));
        const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()));
        k.addModel(a.geometry, { at: [at.x, at.y, at.z], rot: [e.x, e.y, e.z], scale: a.scale * b });
      } else if (i && a.slot === "finger") {
        // A ring on the left hand, small as it is: drawn large enough to be seen
        k.addModel(a.geometry, { at: [arm[2][0], arm[2][1] - 0.012, arm[2][2] + 0.02], rot: [0, 0, 0], scale: 3 });
      } else if (i && a.slot === "shield") {
        // A generator is worn on the forearm with its emitter forward; a physical shield is carried on the arm's outer side
        if (/generator/.test(a.id)) k.addModel(a.geometry, { at: [arm[1][0] + 0.07 * b, arm[1][1] - 0.02, arm[1][2] + 0.06], rot: [Math.PI / 2, 0, 0], scale: a.scale * 0.7 });
        else k.addModel(a.geometry, { at: [arm[2][0] + 0.08, arm[2][1] + 0.05, arm[2][2] + 0.1], rot: [0, 0.35, 0], scale: a.scale });
      }
    }
    if (look.arms === 4) {
      const low = arm.map(([x, y, z]) => [x * 0.95, y - 0.13, z + 0.02] as V3);
      k.tube(low, (t) => (0.044 - t * 0.012) * b, sleeve, { along: 8, around: 6 });
      k.sphere(0.04 * b, glove, { at: low[2], seg: [8, 6] });
    }
    });
  }
  // A modelled weapon is drawn in the hand (above); the code's own is for those that have none
  if (!p.attach.some((a) => a.slot === "weapon")) held(k, o, pose.r[2], pose.l[2]);
  // The neck and the head
  const neckH = look.longNeck ? 0.18 : 0.08;
  k.cyl(0.045 * b, neckH + 0.02, armored && o.head ? p.under : flesh, { at: [0, 0.43 + neckH / 2, 0], seg: 10 });
  k.group([0, 0.525 + (neckH - 0.08), 0.005], undefined, undefined, () => head(k, look, o, p));
}

// What someone holds: a blaster, a rifle across the body, a lit blade, a staff
function held(k: Kit, o: Outfit, right: V3, left: V3) {
  const [rx, ry, rz] = right;
  switch (o.hand) {
    case "pistol":
      k.box([0.04, 0.08, 0.05], "#2b2f36", { at: [rx, ry - 0.03, rz + 0.01], round: 0.01, finish: "sheen" });
      k.box([0.035, 0.04, 0.16], "#15171b", { at: [rx, ry, rz + 0.08], round: 0.01, finish: "sheen" });
      break;
    case "rifle":
    case "bowcaster": {
      const a: V3 = [rx - 0.03, ry - 0.04, rz - 0.06];
      const dir = new THREE.Vector3(...left).sub(new THREE.Vector3(...right)).normalize();
      const b: V3 = [left[0] + dir.x * 0.2, left[1] + dir.y * 0.2, left[2] + dir.z * 0.2];
      k.rod(a, b, 0.026, o.hand === "bowcaster" ? "#6b4f36" : "#15171b", { square: true, finish: "sheen" });
      k.box([0.04, 0.09, 0.04], "#2b2f36", { at: [rx, ry - 0.06, rz + 0.02], round: 0.01 });
      if (o.hand === "bowcaster") k.torus(0.12, 0.012, "#9aa3ad", { at: [b[0], b[1], b[2]], rot: [Math.PI / 2, 0, Math.atan2(dir.x, dir.z)], arc: Math.PI, seg: [4, 12], finish: "sheen" });
      break;
    }
    case "saber":
    case "saber2": {
      const blade = o.blade ?? "#7fe3ff";
      k.cyl(0.018, 0.12, "#9aa3ad", { at: [rx, ry, rz + 0.02], rot: [0.9, 0, 0], seg: 8, finish: "sheen" });
      k.rod([rx, ry + 0.04, rz + 0.06], [rx + 0.02, ry + 0.48, rz + 0.42], 0.016, blade, { finish: "glow", seg: 8 });
      k.rod([rx, ry + 0.04, rz + 0.06], [rx + 0.02, ry + 0.48, rz + 0.42], 0.03, blade, { finish: "haze", seg: 8 });
      if (o.hand === "saber2") k.rod([rx, ry - 0.04, rz - 0.02], [rx - 0.02, ry - 0.42, rz - 0.36], 0.016, blade, { finish: "glow", seg: 8 });
      break;
    }
    case "pike":
    case "staff":
      k.rod([rx, ry - 0.5, rz + 0.02], [rx, ry + 0.75, rz + 0.04], 0.016, o.hand === "staff" ? "#2b2f36" : "#7b6a4a", { finish: "sheen" });
      k.cone(0.03, 0.12, o.hand === "staff" ? "#ffd166" : "#c9ccd2", { at: [rx, ry + 0.8, rz + 0.04], finish: o.hand === "staff" ? "glow" : "sheen", seg: 6 });
      break;
    case "gaffi":
      k.rod([rx, ry - 0.35, rz + 0.02], [rx, ry + 0.6, rz + 0.05], 0.02, "#6b5a3a");
      k.torus(0.08, 0.02, "#6b5a3a", { at: [rx, ry + 0.62, rz + 0.1], rot: [0, Math.PI / 2, 0], arc: Math.PI, seg: [5, 10] });
      break;
    case "vibro":
    case "axe":
      k.cyl(0.018, 0.16, "#3a2c20", { at: [rx, ry, rz + 0.03], seg: 6 });
      k.box(o.hand === "axe" ? [0.02, 0.16, 0.14] : [0.015, 0.4, 0.05], "#c9ccd2", { at: [rx, ry + (o.hand === "axe" ? 0.12 : 0.27), rz + (o.hand === "axe" ? 0.09 : 0.03)], round: 0.006, finish: "sheen" });
      break;
    case "tool":
      k.cyl(0.02, 0.18, "#f0a03c", { at: [rx, ry, rz + 0.06], rot: [1.3, 0, 0], seg: 6, finish: "sheen" });
      break;
    case "tray":
      k.cyl(0.12, 0.012, "#9aa3ad", { at: [rx, ry + 0.03, rz], seg: 16, finish: "sheen" });
      bottle(k, [rx + 0.04, ry + 0.035, rz], "#58c98b");
      break;
    case "datapad":
      k.box([0.12, 0.012, 0.09], "#2b2f36", { at: [(rx + left[0]) / 2, ry + 0.02, rz + 0.01], rot: [0.5, 0, 0], round: 0.005 });
      k.box([0.1, 0.004, 0.07], C.glow, { at: [(rx + left[0]) / 2, ry + 0.028, rz + 0.01], rot: [0.5, 0, 0], finish: "glow" });
      break;
  }
}

// A head at the origin (its middle), with what the species and the outfit put on it
function head(k: Kit, look: Look, o: Outfit, p: Body) {
  const face = p.flesh;
  const helmet = o.head;
  const covered = ["trooper", "scout", "pilot", "tiepilot", "bounty", "guard", "helmet", "deathtrooper"].includes(helmet) || look.mask === "wraps";
  if (look.head === "hammer" && !covered) {
    // A neck that curves forward into a wide head with an eye at either end
    k.tube([[0, -0.08, 0], [0, 0.0, 0.05], [0, 0.04, 0.12]], 0.05, face, { along: 6, around: 8 });
    k.capsule(0.07, 0.2, face, { at: [0, 0.06, 0.15], rot: [0, 0, Math.PI / 2], seg: 12 });
    k.pair((s) => k.sphere(0.022, "#15171b", { at: [s * 0.15, 0.08, 0.2], finish: "sheen", seg: [8, 6] }));
    return;
  }
  // The skull
  const skull: Record<Look["head"], { scale: V3; at: V3; rot?: V3 }> = {
    round: { scale: [0.92, 1.05, 0.98], at: [0, 0, 0] },
    cone: { scale: [0.9, 1.0, 0.95], at: [0, 0, 0] },
    cranium: { scale: [1.08, 1.38, 1.12], at: [0, 0.035, -0.01] },
    dome: { scale: [0.95, 1.3, 1.22], at: [0, 0.03, -0.02], rot: [-0.35, 0, 0] },
    long: { scale: [0.82, 1.25, 1.4], at: [0, 0.03, -0.03], rot: [-0.55, 0, 0] },
    flat: { scale: [1.25, 0.82, 1.08], at: [0, -0.01, 0] },
    hammer: { scale: [1, 1, 1], at: [0, 0, 0] },
  };
  const sk = skull[look.head];
  if (helmet === "trooper" || helmet === "deathtrooper" || helmet === "navy") {
    const shell = helmet === "deathtrooper" || helmet === "navy" ? "#1b1d21" : o.armor ?? "#e9edf0";
    k.sphere(0.128, shell, { scale: [0.95, 1.06, 1.06], finish: "sheen", seg: [18, 14] });
    k.torus(0.125, 0.016, shell, { at: [0, -0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [0.97, 1.08, 1], finish: "sheen", seg: [6, 20] });
    if (helmet !== "navy") {
      k.pair((s) => k.sphere(0.034, helmet === "deathtrooper" ? "#4ade80" : "#101318", { at: [s * 0.045, 0.012, 0.108], scale: [1.2, 0.8, 0.5], finish: helmet === "deathtrooper" ? "glow" : "sheen", seg: [10, 8] }));
      k.box([0.07, 0.04, 0.04], "#2b2f36", { at: [0, -0.06, 0.11], round: 0.015 });
      k.pair((s) => k.cyl(0.03, 0.02, "#9aa3ad", { at: [s * 0.122, -0.01, 0], rot: [0, 0, Math.PI / 2], seg: 10, finish: "sheen" }));
    } else k.box([0.14, 0.05, 0.03], "#101318", { at: [0, 0.0, 0.11], round: 0.02, finish: "sheen" });
    return;
  }
  if (helmet === "scout") {
    k.sphere(0.122, o.armor ?? "#e9edf0", { scale: [0.95, 1.0, 1.05], finish: "sheen", seg: [16, 12] });
    k.box([0.17, 0.045, 0.05], "#101318", { at: [0, 0.015, 0.1], round: 0.018, finish: "sheen" });
    k.box([0.05, 0.06, 0.08], o.armor ?? "#e9edf0", { at: [0, -0.06, 0.11], round: 0.02, finish: "sheen" });
    return;
  }
  if (helmet === "tiepilot") {
    k.sphere(0.13, "#1d1f24", { scale: [0.95, 1.05, 1.05], finish: "sheen", seg: [16, 12] });
    k.pair((s) => k.sphere(0.04, "#0b0d10", { at: [s * 0.05, 0.015, 0.105], finish: "glass", seg: [10, 8] }));
    k.box([0.06, 0.05, 0.05], "#3a3f46", { at: [0, -0.06, 0.11], round: 0.015 });
    k.pair((s) => k.tube([[s * 0.02, -0.07, 0.12], [s * 0.05, -0.16, 0.13], [s * 0.04, -0.24, 0.12]], 0.012, "#3a3f46", { along: 6, around: 5 }));
    return;
  }
  // A sealed suit's helmet: a bubble over the face (a space suit), a brass dome with a window (diving), a hood with a visor and a filter
  // (hazard); the face shows through the bubble, not through the others
  if (helmet === "dive") {
    k.sphere(0.145, "#b9893a", { scale: [1, 1.05, 1.05], finish: "sheen", seg: [18, 14] });
    k.sphere(0.06, "#bfe8f5", { at: [0, 0.01, 0.1], scale: [1.15, 1, 0.5], finish: "glass", seg: [12, 8] });
    k.pair((s) => k.cyl(0.018, 0.02, "#8a6a2a", { at: [s * 0.1, 0.01, 0.07], rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" }));
    k.torus(0.13, 0.02, "#8a6a2a", { at: [0, -0.1, 0], rot: [Math.PI / 2, 0, 0], seg: [6, 18], finish: "sheen" });
    return;
  }
  if (helmet === "hazmat") {
    k.sphere(0.138, o.top, { scale: [0.98, 1.06, 1.06], finish: "cloth", seg: [16, 12] });
    k.box([0.15, 0.06, 0.03], "#1b2a38", { at: [0, 0.02, 0.118], round: 0.02, finish: "glass" });
    k.cyl(0.03, 0.06, "#59636d", { at: [0, -0.06, 0.13], rot: [Math.PI / 2, 0, 0], seg: 10, finish: "sheen" });
    return;
  }
  if (helmet === "guard") {
    k.lathe([[0.13, -0.12], [0.135, -0.05], [0.13, 0.05], [0.1, 0.15], [0.05, 0.22], [0, 0.24]], o.top, { seg: 18, finish: "sheen" });
    k.box([0.09, 0.012, 0.02], "#0b0d10", { at: [0, 0.02, 0.128] });
    return;
  }
  if (helmet === "bounty") {
    k.sphere(0.128, o.armor ?? "#8a8f96", { scale: [0.95, 1.05, 1.05], finish: "sheen", seg: [16, 12] });
    k.box([0.14, 0.03, 0.03], "#0b0d10", { at: [0, 0.03, 0.115], round: 0.008 });
    k.box([0.03, 0.09, 0.03], "#0b0d10", { at: [0, -0.02, 0.118], round: 0.008 });
    k.cyl(0.006, 0.12, "#9aa3ad", { at: [-0.12, 0.08, 0.02], rot: [0.3, 0, 0], seg: 4 });
    return;
  }
  if (helmet === "helmet" || helmet === "pilot") {
    k.sphere(0.13, helmet === "pilot" ? "#d9752b" : o.armor ?? "#59636d", { theta: [0, 1.9], scale: [0.95, 1.05, 1.05], finish: "sheen", seg: [16, 10] });
    k.sphere(0.108, face, { scale: sk.scale, at: sk.at, seg: [14, 10] });
    k.box([0.15, 0.05, 0.03], "#1b2a38", { at: [0, 0.02, 0.105], round: 0.02, finish: "glass" });
    return;
  }
  if (look.machine) {
    k.sphere(0.12, face, { scale: [0.92, 1.0, 0.95], finish: "sheen", seg: [16, 12] });
    k.pair((s) => k.sphere(0.024, p.eye || "#ffd23f", { at: [s * 0.042, 0.02, 0.1], finish: "glow", seg: [8, 6] }));
    k.box([0.05, 0.02, 0.02], "#1b1d21", { at: [0, -0.05, 0.105], round: 0.006 });
    return;
  }
  if (look.mask === "wraps") {
    k.blob(0.12, "#b9a07a", { smooth: true, rough: 0.12, seed: p.seed, squash: [0.95, 1.08, 1.0] });
    k.pair((s) => k.cyl(0.026, 0.05, "#2b2522", { at: [s * 0.042, 0.02, 0.105], rot: [Math.PI / 2, 0, 0], seg: 10, finish: "sheen" }));
    k.cyl(0.022, 0.06, "#6b5a3a", { at: [0, -0.05, 0.11], rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" });
    return;
  }
  if (look.head === "cone") k.lathe([[0, -0.11], [0.095, -0.085], [0.115, 0], [0.095, 0.1], [0.06, 0.2], [0, 0.25]], face, { seg: 16 });
  else k.sphere(0.115, face, { scale: sk.scale, at: sk.at, rot: sk.rot, seg: [12, 9] });
  // Eyes
  const eyeColor = look.glowEyes ? p.eye || "#ff3b30" : look.eyeSize === "small" ? "#15171b" : p.eye && p.eye !== "#2a2a2e" ? shade(p.eye, 0.6) : "#101318";
  const eyeFinish: Finish = look.glowEyes ? "glow" : "sheen";
  const eyes = (positions: V3[], r: number) => positions.forEach((at) => k.sphere(r, eyeColor, { at, finish: eyeFinish, seg: r > 0.03 ? [8, 6] : [5, 4] }));
  if (look.eyeStalks) {
    k.pair((s) => {
      k.tube([[s * 0.03, 0.08, 0.02], [s * 0.05, 0.16, 0.04], [s * 0.06, 0.22, 0.06]], 0.012, face, { along: 6, around: 5 });
      eyes([[s * 0.06, 0.23, 0.07]], 0.028);
    });
  } else if (look.eyeCount === 1) eyes([[0, 0.02, 0.105]], 0.03);
  else if (look.eyeCount === 3) eyes([[-0.045, 0.015, 0.1], [0.045, 0.015, 0.1], [0, 0.06, 0.095]], 0.02);
  else if (look.eyeCount >= 4) eyes([[-0.04, 0.02, 0.1], [0.04, 0.02, 0.1], [-0.07, 0.05, 0.08], [0.07, 0.05, 0.08], ...(look.eyeCount > 4 ? ([[-0.02, 0.06, 0.1], [0.02, 0.06, 0.1]] as V3[]) : [])], 0.016);
  else if (look.eyeSize === "side") eyes([[-0.088, 0.03, 0.05], [0.088, 0.03, 0.05]], 0.042);
  else if (look.eyeSize === "big") eyes([[-0.052, 0.018, 0.085], [0.052, 0.018, 0.085]], 0.036);
  else eyes([[-0.04, 0.015, 0.1], [0.04, 0.015, 0.1]], 0.016);
  // The middle of the face: a snout, a trunk, a beak, a muzzle, or a nose and a mouth
  const fore = shade(face, 1.1);
  if (look.snout === "pig") {
    k.cyl(0.045, 0.05, fore, { at: [0, -0.03, 0.115], rot: [Math.PI / 2, 0, 0], seg: 12 });
    k.pair((s) => k.sphere(0.01, "#15171b", { at: [s * 0.016, -0.03, 0.14], seg: [6, 4] }));
  } else if (look.snout === "trunk") k.tube([[0, -0.01, 0.1], [0, -0.06, 0.15], [0, -0.13, 0.15]], (t) => 0.03 * (1 - t * 0.5), face, { along: 8, around: 6 });
  else if (look.snout === "beak") k.cone(0.03, 0.09, "#c9a24a", { at: [0, -0.02, 0.14], rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" });
  else if (look.snout === "muzzle") k.box([0.08, 0.06, 0.07], fore, { at: [0, -0.04, 0.1], round: 0.03 });
  else if (look.snout === "long") k.capsule(0.035, 0.07, fore, { at: [0, -0.04, 0.12], rot: [Math.PI / 2 + 0.3, 0, 0], seg: 8 });
  else if (look.snout === "short") k.capsule(0.032, 0.03, fore, { at: [0, -0.035, 0.11], rot: [Math.PI / 2, 0, 0], seg: 8 });
  else if (!look.mask) {
    k.sphere(0.017, fore, { at: [0, -0.012, 0.112], scale: [1, 1.2, 1], seg: [8, 6] });
    k.box([0.04, 0.007, 0.01], shade(face, 0.55), { at: [0, -0.052, 0.104] });
  }
  if (look.mask === "rebreather") {
    k.pair((s) => k.cyl(0.026, 0.03, "#101318", { at: [s * 0.042, 0.02, 0.1], rot: [Math.PI / 2, 0, 0], seg: 10, finish: "glass" }));
    k.box([0.09, 0.06, 0.05], "#9aa3ad", { at: [0, -0.05, 0.105], round: 0.02, finish: "sheen" });
    k.pair((s) => k.cyl(0.008, 0.06, "#9aa3ad", { at: [s * 0.05, -0.06, 0.09], rot: [0.4, 0, s * 0.8], seg: 4 }));
  } else if (look.mask === "bone") k.sphere(0.118, "#e8dcc0", { phi: [Math.PI * 0.15, Math.PI * 0.7], theta: [0.6, 1.3], seg: [12, 8], finish: "sheen" });
  else if (look.mask === "goggles") k.pair((s) => k.cyl(0.026, 0.03, "#2b2f36", { at: [s * 0.042, 0.02, 0.105], rot: [Math.PI / 2, 0, 0], seg: 10, finish: "glass" }));
  // What grows out of the head
  if (look.tusks) k.pair((s) => k.tube([[s * 0.035, -0.06, 0.09], [s * 0.045, -0.04, 0.12], [s * 0.05, 0.0, 0.13]], (t) => 0.012 * (1 - t * 0.7), "#e8dcc0", { along: 5, around: 5 }));
  if (look.lekku) k.pair((s) => k.tube([[s * 0.05, 0.01, -0.07], [s * 0.07, -0.12, -0.14], [s * 0.06, -0.3, -0.16], [s * 0.05, -0.44, -0.13]], (t) => 0.045 * (1 - t * 0.6), face, { along: 12, around: 8 }));
  if (look.montrals) {
    const stripe = mix(face, "#f5f5f0", 0.75);
    k.pair((s) => k.tube([[s * 0.06, 0.07, 0], [s * 0.1, 0.17, -0.02], [s * 0.085, 0.27, -0.08]], (t) => 0.04 * (1 - t * 0.7), stripe, { along: 8, around: 7 }));
    k.pair((s) => k.tube([[s * 0.08, -0.02, 0.02], [s * 0.11, -0.16, 0.06], [s * 0.1, -0.3, 0.07]], (t) => 0.036 * (1 - t * 0.6), stripe, { along: 8, around: 7 }));
    k.tube([[0, 0.0, -0.08], [0, -0.14, -0.15], [0, -0.3, -0.16]], (t) => 0.036 * (1 - t * 0.6), stripe, { along: 8, around: 7 });
  }
  if (look.horns === 1) k.cone(0.02, 0.07, "#e8dcc0", { at: [0, 0.12, 0.05], rot: [0.4, 0, 0], seg: 6 });
  else if (look.horns === 2 && !look.hornsDown) k.pair((s) => k.cone(0.018, 0.06, "#d8ccb0", { at: [s * 0.045, 0.11, 0.04], rot: [0.3, 0, s * -0.3], seg: 6 }));
  else if (look.hornsDown) k.pair((s) => k.tube([[s * 0.07, 0.08, 0.02], [s * 0.12, 0.04, 0.03], [s * 0.13, -0.06, 0.05], [s * 0.1, -0.12, 0.07]], (t) => 0.025 * (1 - t * 0.75), "#d8ccb0", { along: 8, around: 6 }));
  else if (look.horns >= 3) for (let i = 0; i < 5; i++) k.cone(0.012, 0.04, "#d8ccb0", { at: [Math.cos(i * 1.256 + 0.3) * 0.06, 0.105, Math.sin(i * 1.256 + 0.3) * 0.06], seg: 5 });
  if (look.antennae) k.pair((s) => {
    k.tube([[s * 0.035, 0.1, 0], [s * 0.06, 0.18, 0.02], [s * 0.075, 0.24, 0.06]], 0.007, face, { along: 6, around: 4 });
    k.sphere(0.014, face, { at: [s * 0.075, 0.245, 0.065], seg: [6, 4] });
  });
  if (look.ears === "pointed") k.pair((s) => k.cone(0.025, 0.08, face, { at: [s * 0.115, 0.01, -0.01], rot: [0, 0, s * -1.3], seg: 6 }));
  else if (look.ears === "large") k.pair((s) => k.sphere(0.06, face, { at: [s * 0.12, 0.03, -0.01], scale: [0.25, 1, 0.75], seg: [10, 8] }));
  else if (look.ears === "long") k.pair((s) => k.tube([[s * 0.08, 0.08, -0.02], [s * 0.14, 0.0, -0.04], [s * 0.15, -0.2, -0.04], [s * 0.13, -0.36, -0.02]], (t) => 0.04 * (1 - t * 0.5), face, { along: 10, around: 6, scale: [0.6, 1, 1] }));
  else if (look.ears === "floppy") k.pair((s) => k.sphere(0.06, face, { at: [s * 0.12, -0.04, -0.01], scale: [0.25, 1.3, 0.7], rot: [0, 0, s * 0.3], seg: [10, 8] }));
  if (look.headTentacles) for (let i = 0; i < 6; i++) {
    const a = -1.2 + i * 0.48;
    k.tube([[Math.sin(a) * 0.08, 0.04, -0.06], [Math.sin(a) * 0.12, -0.1, -0.13], [Math.sin(a) * 0.13, -0.3, -0.14], [Math.sin(a) * 0.12, -0.42, -0.12]], (t) => 0.03 * (1 - t * 0.6), face, { along: 10, around: 6 });
  }
  if (look.faceTentacles) for (let i = 0; i < 4; i++) {
    const x = -0.045 + i * 0.03;
    k.tube([[x, -0.07, 0.08], [x * 1.2, -0.13, 0.1], [x * 1.3, -0.2, 0.08]], (t) => 0.014 * (1 - t * 0.6), face, { along: 6, around: 5 });
  }
  if (look.crest) k.cyl(0.11, 0.02, shade(face, 0.85), { at: [0, 0.07, -0.01], rot: [0, Math.PI / 2, Math.PI / 2], arc: Math.PI, start: -Math.PI / 2, scale: [1, 1, 0.8], seg: 10 });
  if (look.spines) for (let i = 0; i < 4; i++) k.cone(0.012, 0.05, shade(face, 0.8), { at: [0, 0.08 - i * 0.05, -0.1 - (i < 2 ? 0 : 0.01)], rot: [-1.2, 0, 0], seg: 5 });
  if (look.tattoos) for (const [x, y] of [[-0.05, 0.05], [0.05, 0.05], [0, -0.08], [-0.07, -0.02], [0.07, -0.02]]) k.box([0.022, 0.008, 0.01], "#1b1d21", { at: [x, y, 0.105 - Math.abs(x) * 0.25], rot: [0, x * 3, 0] });
  if (look.mane) k.blob(0.15, p.hair || shade(face, 0.7), { at: [0, -0.01, -0.04], smooth: true, rough: 0.25, seed: p.seed + 3, squash: [1.1, 1.05, 0.9] });
  // Hair, a hood or a cap
  const hairColor = p.hair;
  if (helmet === "hood") {
    // Open at the front (+z, where a sphere's angle round its axis is a quarter turn)
    k.sphere(0.145, o.top, { theta: [0, 2.0], phi: [Math.PI / 2 + 0.75, Math.PI * 2 - 1.5], seg: [16, 10], finish: "cloth", rot: [-0.25, 0, 0] });
    if (look.hooded) {
      k.cone(0.06, 0.12, o.top, { at: [0, 0.16, -0.03], rot: [-0.3, 0, 0], seg: 8, finish: "cloth" });
      k.sphere(0.11, "#0b0b0d", { at: [0, -0.005, 0.01], seg: [12, 10] });
      k.pair((s) => k.sphere(0.022, "#ffd23f", { at: [s * 0.04, 0.01, 0.1], finish: "glow", seg: [8, 6] }));
    }
  } else if (helmet === "cap") {
    k.cyl(0.12, 0.06, o.top, { at: [0, 0.1, 0], seg: 18 });
    k.box([0.14, 0.012, 0.07], shade(o.top, 0.7), { at: [0, 0.075, 0.11], round: 0.005 });
  } else if (hairColor && !look.fur && !look.headTentacles && !look.lekku && !look.montrals && look.head === "round") {
    const style = (p.seed >> 2) % 5;
    if (style !== 3) k.sphere(0.123, hairColor, { theta: [0, 1.3], rot: [-0.55, 0, 0], scale: [1.02, 1, 1.05], seg: [14, 7] });
    if (style === 1) k.tube([[0, 0.02, -0.11], [0, -0.1, -0.14], [0, -0.2, -0.12]], (t) => 0.03 * (1 - t * 0.6), hairColor, { along: 6, around: 6 });
    if (style === 2) k.blob(0.1, hairColor, { at: [0, -0.07, -0.07], smooth: true, rough: 0.15, seed: p.seed, squash: [1.1, 1.4, 0.7] });
    if (style === 4) k.sphere(0.05, hairColor, { at: [0, 0.07, -0.1], seg: [10, 8] });
  }
  // A space suit's bubble over the whole head, on its collar ring
  if (helmet === "bubble") {
    k.sphere(0.17, "#cfeaf7", { scale: [1, 1.05, 1.05], finish: "glass", seg: [16, 12] });
    k.torus(0.13, 0.022, "#c9ccd2", { at: [0, -0.1, 0], rot: [Math.PI / 2, 0, 0], seg: [6, 18], finish: "sheen" });
  }
  // What is put on the head (goggles, a mask, an earpiece, a helmet): fitted to the skull this species has (interiors/anchors.ts)
  const traits: HeadTraits = { skull: sk.scale[0], lift: sk.at[1], snout: !!look.snout };
  for (const a of p.attach) {
    if (a.slot !== "head" || !a.name) continue;
    const fit = headFit(a.name, modelInfo(a.name)?.box ?? [-0.05, -0.05, -0.05, 0.05, 0.05, 0.05], traits);
    if (fit) k.addModel(a.geometry, { at: fit.at, rot: fit.rot, scale: fit.scale * a.scale });
  }
}

// ---------------------------------------------------------------------------------------------
// Droids, by series: astromechs (R2, R5, C1, T3 and the BB ball), protocol droids, battle
// droids (B1, B2, BX, tactical), destroyers, probes and seekers, power droids, mouse and pit
// droids, medical units, assassins and security droids; anything else gets a sensor head on legs.
// ---------------------------------------------------------------------------------------------

export function droidKind(name: string): string {
  const n = name.toLowerCase();
  if (/\bbb\b|bb series|bb-/.test(n)) return "bb";
  if (/r5|c1 series/.test(n)) return "r5";
  if (/astromech|r2|t3|blastromech|utility droid|r4/.test(n)) return "astromech";
  if (/protocol|3p0|000 series|l0m|c-3|rx series/.test(n)) return "protocol";
  if (/b2|super battle/.test(n)) return "b2";
  if (/tactical|t-series/.test(n)) return "tactical";
  if (/b1|bx|commando|battle droid/.test(n)) return /bx|commando/.test(n) ? "bx" : "b1";
  if (/destroyer|droideka/.test(n)) return "destroyer";
  if (/probe|seeker|id9|it-o|interrog|drk-1|tracker|marksman|z-58|remote/.test(n)) return "probe";
  if (/gonk|power droid|eg-6/.test(n)) return "gonk";
  if (/mouse|msE|pistoeka|sabotage/.test(n)) return "mouse";
  if (/pit droid|dum-series/.test(n)) return "pit";
  if (/medical|gh-7|2-1b|fx-/.test(n)) return "medical";
  if (/\big\b|ig series|ig-|assassin|sd-k4|hk/.test(n)) return /hk/.test(n) ? "hk" : "ig";
  if (/kx|k-2|security droid|jk-13|enforcer|persuader/.test(n)) return "kx";
  if (/spider|dsd/.test(n)) return "spider";
  if (/junk/.test(n)) return "junk";
  if (/service|server|waiter|bartender|labor|lifter|loader|binary/.test(n)) return "service";
  return "generic";
}

export function buildDroid(k: Kit, kind: string, name: string) {
  const accent = pickOf(["#3b6fb5", "#b8473e", "#3f8f5a", "#d9752b", "#7a4fa8", "#2b2f36"], name);
  const white = "#e3e6e8";
  const metal = "#9aa3ad";
  const dark = "#2b2f36";
  switch (kind) {
    case "astromech":
    case "r5": {
      // A barrel body under a dome (or the flat-topped head of an R5), two legs and a third foot
      k.lathe([[0.17, 0.12], [0.19, 0.16], [0.19, 0.56], [0.185, 0.58]], white, { seg: 20, finish: "sheen" });
      for (let i = 0; i < 3; i++) k.box([0.07, 0.16, 0.02], accent, { at: [Math.sin(i * 0.5 - 0.5) * 0.185, 0.38, Math.cos(i * 0.5 - 0.5) * 0.185], rot: [0, i * 0.5 - 0.5, 0], round: 0.01 });
      if (kind === "r5") {
        k.lathe([[0.185, 0.58], [0.17, 0.66], [0.13, 0.74], [0, 0.75]], metal, { seg: 20, finish: "sheen" });
        k.sphere(0.03, C.red, { at: [0, 0.68, 0.15], finish: "glow", seg: [8, 6] });
      } else {
        k.sphere(0.185, metal, { at: [0, 0.58, 0], half: true, finish: "sheen", seg: [20, 10] });
        k.box([0.12, 0.06, 0.04], accent, { at: [0, 0.68, 0.14], rot: [-0.6, 0, 0], round: 0.01 });
        k.cyl(0.035, 0.04, "#101318", { at: [0.04, 0.66, 0.16], rot: [Math.PI / 2 - 0.6, 0, 0], seg: 10, finish: "sheen" });
        k.sphere(0.018, C.red, { at: [-0.06, 0.7, 0.15], finish: "glow", seg: [6, 4] });
      }
      k.pair((s) => {
        k.box([0.07, 0.48, 0.15], white, { at: [s * 0.23, 0.3, 0], round: 0.03, finish: "sheen" });
        k.box([0.08, 0.06, 0.2], metal, { at: [s * 0.23, 0.03, 0.02], round: 0.02, finish: "sheen" });
        k.cyl(0.05, 0.05, accent, { at: [s * 0.2, 0.5, 0], rot: [0, 0, Math.PI / 2], seg: 10 });
      });
      k.box([0.1, 0.1, 0.12], metal, { at: [0, 0.07, 0.02], round: 0.02, finish: "sheen" });
      return;
    }
    case "bb": {
      k.sphere(0.2, white, { at: [0, 0.2, 0], seg: [20, 14], finish: "sheen" });
      for (const [rx, ry] of [[0, 0], [Math.PI / 2, 0], [0.8, 1.2]]) k.torus(0.2, 0.012, "#d9752b", { at: [0, 0.2, 0], rot: [rx, ry, 0], seg: [5, 24] });
      k.sphere(0.11, white, { at: [0, 0.42, 0], half: true, seg: [16, 8], finish: "sheen" });
      k.cyl(0.11, 0.02, "#d9752b", { at: [0, 0.425, 0], seg: 16 });
      k.sphere(0.03, "#101318", { at: [0, 0.47, 0.08], finish: "sheen", seg: [8, 6] });
      k.cyl(0.004, 0.12, metal, { at: [0.03, 0.56, 0], seg: 4 });
      return;
    }
    case "protocol": {
      const plate = pickOf(["#c9a94a", "#b8bec4", "#8a5a3a", "#5a6a8a"], name);
      buildHumanoid(k, { ...lookOf(), scale: 1.02, bulk: 0.95, skin: [plate], machine: true }, { garment: "armor", armor: plate, top: plate, bottom: plate, accent: dark, head: "", hand: "" }, plate, "", "#ffd23f");
      k.box([0.12, 0.08, 0.06], "#1b1d21", { at: [0, 0.68, 0.06], round: 0.02 });
      return;
    }
    case "b1":
    case "bx":
    case "tactical": {
      // Thin limbs, a narrow chest, a long head reaching forward; a commando is darker and sturdier
      const tan = kind === "bx" ? "#4a4a42" : kind === "tactical" ? "#5a6f9a" : "#c9b48a";
      const thick = kind === "bx" ? 1.5 : 1;
      k.pair((s) => {
        k.tube([[s * 0.07, 0.56, 0], [s * 0.08, 0.3, 0.03], [s * 0.07, 0.06, -0.01]], 0.022 * thick, tan, { along: 6, around: 6, finish: "sheen" });
        k.box([0.06, 0.04, 0.16], tan, { at: [s * 0.07, 0.03, 0.03], round: 0.015, finish: "sheen" });
        k.tube([[s * 0.15, 0.86, 0], [s * 0.18, 0.66, 0.05], [s * 0.12, 0.55, 0.2]], 0.02 * thick, tan, { along: 6, around: 6, finish: "sheen" });
      });
      k.box([0.14, 0.12, 0.1], tan, { at: [0, 0.6, 0], round: 0.03, finish: "sheen" });
      k.cyl(0.02, 0.18, tan, { at: [0, 0.72, 0], seg: 6 });
      k.box([0.26, 0.2, 0.14], tan, { at: [0, 0.86, 0], round: 0.05, finish: "sheen" });
      k.box([0.18, 0.22, 0.1], shade(tan, 0.75), { at: [0, 0.84, -0.12], round: 0.04, finish: "sheen" });
      k.cyl(0.018, 0.12, tan, { at: [0, 1.0, 0.02], rot: [0.4, 0, 0], seg: 6 });
      if (kind === "tactical") k.box([0.18, 0.05, 0.2], tan, { at: [0, 1.1, 0.06], round: 0.02, finish: "sheen" });
      else k.capsule(0.05, 0.2, tan, { at: [0, 1.08, 0.1], rot: [Math.PI / 2 - 0.2, 0, 0], finish: "sheen", seg: 8 });
      k.pair((s) => k.sphere(0.016, kind === "tactical" ? "#ffd23f" : "#101318", { at: [s * 0.03, 1.1, 0.17], finish: kind === "tactical" ? "glow" : "sheen", seg: [6, 4] }));
      k.box([0.03, 0.04, 0.32], "#15171b", { at: [0.12, 0.56, 0.32], round: 0.008, finish: "sheen" });
      return;
    }
    case "b2": {
      const blue = "#5a6a7f";
      k.pair((s) => {
        k.tube([[s * 0.1, 0.56, 0], [s * 0.12, 0.3, 0.04], [s * 0.1, 0.06, 0]], 0.045, blue, { along: 6, around: 7, finish: "sheen" });
        k.box([0.1, 0.06, 0.2], blue, { at: [s * 0.1, 0.03, 0.04], round: 0.02, finish: "sheen" });
        k.tube([[s * 0.24, 0.92, 0], [s * 0.28, 0.72, 0.05], [s * 0.24, 0.58, 0.16]], 0.05, blue, { along: 6, around: 7, finish: "sheen" });
        k.box([0.1, 0.12, 0.22], shade(blue, 0.8), { at: [s * 0.24, 0.56, 0.2], round: 0.03, finish: "sheen" });
      });
      k.box([0.24, 0.14, 0.16], blue, { at: [0, 0.6, 0], round: 0.05, finish: "sheen" });
      k.box([0.42, 0.34, 0.3], blue, { at: [0, 0.88, -0.02], rot: [0.25, 0, 0], round: 0.1, finish: "sheen" });
      k.sphere(0.06, blue, { at: [0, 1.04, 0.08], seg: [10, 8], finish: "sheen" });
      k.sphere(0.02, C.red, { at: [0, 1.04, 0.13], finish: "glow", seg: [6, 4] });
      return;
    }
    case "destroyer": {
      // Three legs under a curved body, the head between its arms, a shield's shimmer round it
      const bronze = "#7a6a4a";
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + Math.PI;
        k.tube([[Math.sin(a) * 0.05, 0.62, Math.cos(a) * 0.05], [Math.sin(a) * 0.25, 0.42, Math.cos(a) * 0.25], [Math.sin(a) * 0.32, 0.02, Math.cos(a) * 0.32]], 0.03, bronze, { along: 8, around: 6, finish: "sheen" });
      }
      k.torus(0.18, 0.08, bronze, { at: [0, 0.8, -0.02], rot: [0, Math.PI / 2, 0], arc: Math.PI * 1.3, finish: "sheen", seg: [10, 18] });
      k.capsule(0.09, 0.14, bronze, { at: [0, 0.82, 0.12], rot: [Math.PI / 2, 0, 0], finish: "sheen" });
      k.pair((s) => {
        k.tube([[s * 0.12, 0.85, 0], [s * 0.2, 0.75, 0.12], [s * 0.16, 0.7, 0.3]], 0.03, bronze, { along: 6, around: 6, finish: "sheen" });
        k.cyl(0.025, 0.14, "#15171b", { at: [s * 0.16, 0.7, 0.38], rot: [Math.PI / 2, 0, 0], seg: 8 });
      });
      k.sphere(0.6, "#7fd0ff", { at: [0, 0.55, 0.05], finish: "haze", seg: [16, 10] });
      return;
    }
    case "probe": {
      // A floating ball with an eye and antennae, and limbs hanging below it
      k.sphere(0.2, dark, { at: [0, 1.0, 0], seg: [16, 12], finish: "sheen" });
      k.torus(0.2, 0.025, metal, { at: [0, 1.0, 0], rot: [Math.PI / 2, 0, 0], finish: "sheen", seg: [6, 20] });
      for (let i = 0; i < 3; i++) k.sphere(0.03, i ? C.amber : C.red, { at: [Math.sin(i * 0.6 - 0.6) * 0.19, 1.03, Math.cos(i * 0.6 - 0.6) * 0.19], finish: "glow", seg: [8, 6] });
      for (let i = 0; i < 5; i++) {
        const a = i * 1.256;
        k.tube([[Math.sin(a) * 0.12, 0.86, Math.cos(a) * 0.12], [Math.sin(a) * 0.2, 0.6, Math.cos(a) * 0.2], [Math.sin(a) * 0.16, 0.32, Math.cos(a) * 0.16]], 0.012, metal, { along: 6, around: 4, finish: "sheen" });
      }
      k.pair((s) => k.cyl(0.006, 0.4, metal, { at: [s * 0.08, 1.35, -0.04], rot: [0, 0, s * 0.3], seg: 4 }));
      return;
    }
    case "gonk": {
      k.box([0.34, 0.42, 0.3], "#8a8f86", { at: [0, 0.5, 0], round: 0.08, finish: "sheen" });
      k.box([0.36, 0.06, 0.32], "#5a5f58", { at: [0, 0.73, 0], round: 0.02 });
      k.pair((s) => {
        k.box([0.08, 0.3, 0.12], "#5a5f58", { at: [s * 0.12, 0.15, 0], round: 0.03, finish: "sheen" });
        k.box([0.12, 0.05, 0.18], "#3a3f38", { at: [s * 0.12, 0.025, 0.02], round: 0.02 });
      });
      k.sphere(0.02, C.green, { at: [0.08, 0.6, 0.155], finish: "glow", seg: [6, 4] });
      return;
    }
    case "mouse":
      k.box([0.26, 0.14, 0.36], dark, { at: [0, 0.1, 0], round: 0.05, finish: "sheen" });
      k.box([0.2, 0.04, 0.2], metal, { at: [0, 0.18, -0.04], round: 0.015, finish: "sheen" });
      k.sphere(0.02, C.red, { at: [0, 0.13, 0.19], finish: "glow", seg: [6, 4] });
      return;
    case "pit":
      k.pair((s) => k.tube([[s * 0.06, 0.36, 0], [s * 0.1, 0.18, 0.05], [s * 0.08, 0.02, 0]], 0.02, "#a8763a", { along: 6, around: 5, finish: "sheen" }));
      k.box([0.12, 0.18, 0.1], "#a8763a", { at: [0, 0.44, 0], round: 0.03, finish: "sheen" });
      k.cyl(0.16, 0.04, "#a8763a", { at: [0, 0.6, 0.02], rot: [0.3, 0, 0], seg: 18, finish: "sheen" });
      k.sphere(0.03, C.red, { at: [0, 0.6, 0.12], finish: "glow", seg: [6, 4] });
      return;
    case "medical": {
      k.lathe([[0.12, 0.05], [0.14, 0.1], [0.12, 0.5], [0.16, 0.7], [0.16, 0.9], [0.1, 1.0], [0, 1.02]], "#c9cdd2", { seg: 14, finish: "sheen" });
      k.cyl(0.11, 0.3, "#9fe7ff", { at: [0, 0.78, 0.02], seg: 14, finish: "glass" });
      k.sphere(0.1, "#c9cdd2", { at: [0, 1.1, 0], scale: [0.9, 1.2, 0.9], finish: "sheen", seg: [12, 10] });
      k.pair((s) => {
        k.tube([[s * 0.15, 0.88, 0], [s * 0.25, 0.7, 0.05], [s * 0.22, 0.55, 0.18]], 0.02, metal, { along: 6, around: 5, finish: "sheen" });
        k.sphere(0.022, "#58c98b", { at: [s * 0.04, 1.12, 0.09], finish: "glow", seg: [6, 4] });
      });
      return;
    }
    case "ig":
    case "hk":
    case "kx": {
      // A tall thin frame; an assassin droid's head a stack of discs, a security droid's a flat oval
      const frame = kind === "ig" ? "#5a5f66" : kind === "hk" ? "#8a4a3a" : "#24272b";
      k.group(undefined, undefined, kind === "kx" ? 1.2 : 1.1, () => {
        k.pair((s) => {
          k.tube([[s * 0.07, 0.56, 0], [s * 0.09, 0.3, 0.04], [s * 0.07, 0.06, 0]], 0.025, frame, { along: 6, around: 6, finish: "sheen" });
          k.box([0.06, 0.04, 0.16], frame, { at: [s * 0.07, 0.02, 0.03], round: 0.015, finish: "sheen" });
          k.tube([[s * 0.17, 0.9, 0], [s * 0.21, 0.66, 0.0], [s * 0.2, 0.46, 0.06]], 0.022, frame, { along: 6, around: 6, finish: "sheen" });
        });
        k.lathe([[0.1, 0.52], [0.12, 0.6], [0.16, 0.78], [0.19, 0.9], [0.06, 0.96]], frame, { seg: 12, finish: "sheen", scale: [1, 1, 0.65] });
        if (kind === "ig") {
          k.cyl(0.02, 0.14, frame, { at: [0, 1.02, 0], seg: 6 });
          for (const [y, r] of [[1.1, 0.09], [1.16, 0.07], [1.21, 0.05]]) k.cyl(r, 0.04, frame, { at: [0, y, 0], seg: 14, finish: "sheen" });
          for (let i = 0; i < 3; i++) k.sphere(0.012, C.red, { at: [Math.sin(i * 2.1) * 0.09, 1.1, Math.cos(i * 2.1) * 0.09], finish: "glow", seg: [6, 4] });
          k.rod([-0.25, 0.48, 0.1], [-0.25, 1.0, 0.3], 0.018, "#15171b", { square: true, finish: "sheen" });
        } else {
          k.sphere(0.11, frame, { at: [0, 1.06, 0], scale: [1.05, 0.85, 1.15], finish: "sheen", seg: [14, 10] });
          k.pair((s) => k.sphere(0.018, kind === "hk" ? "#ffd23f" : "#f5f5f5", { at: [s * 0.04, 1.07, 0.11], finish: "glow", seg: [6, 4] }));
        }
      });
      return;
    }
    case "spider": {
      k.sphere(0.24, "#5a5f58", { at: [0, 0.7, 0], seg: [16, 12], finish: "sheen" });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.571 + 0.785;
        k.tube([[Math.sin(a) * 0.15, 0.65, Math.cos(a) * 0.15], [Math.sin(a) * 0.4, 0.75, Math.cos(a) * 0.4], [Math.sin(a) * 0.5, 0.02, Math.cos(a) * 0.5]], 0.03, "#3a3f38", { along: 8, around: 6, finish: "sheen" });
      }
      k.cyl(0.03, 0.5, "#15171b", { at: [0, 0.7, 0.35], rot: [Math.PI / 2, 0, 0], seg: 8 });
      k.sphere(0.04, C.red, { at: [0, 0.78, 0.2], finish: "glow", seg: [6, 4] });
      return;
    }
    case "junk": {
      for (let i = 0; i < 6; i++) k.box([0.2 + (i % 3) * 0.06, 0.16, 0.18], ["#6a5a4a", "#59636d", "#8a6a3a"][i % 3], { at: [Math.sin(i) * 0.12, 0.2 + i * 0.13, Math.cos(i * 1.7) * 0.06], rot: [i * 0.4, i, i * 0.2], round: 0.03, finish: "sheen" });
      k.sphere(0.03, C.amber, { at: [0.05, 0.98, 0.12], finish: "glow", seg: [6, 4] });
      return;
    }
    case "service": {
      k.lathe([[0.18, 0.06], [0.2, 0.1], [0.16, 0.5], [0.12, 0.7], [0, 0.72]], "#8a8f96", { seg: 16, finish: "sheen" });
      k.cyl(0.2, 0.03, metal, { at: [0, 0.82, 0.04], seg: 18, finish: "sheen" });
      k.sphere(0.09, "#5a5f66", { at: [0, 0.82, 0], half: true, seg: [12, 6], finish: "sheen" });
      k.sphere(0.022, C.glow, { at: [0, 0.85, 0.08], finish: "glow", seg: [6, 4] });
      for (let i = 0; i < 3; i++) k.cyl(0.04, 0.04, "#2b2f36", { at: [Math.sin(i * 2.1) * 0.13, 0.04, Math.cos(i * 2.1) * 0.13], rot: [Math.PI / 2, 0, 0], seg: 10 });
      return;
    }
    default: {
      // A sensor head on four legs, two lights for eyes
      k.sphere(0.22, dark, { at: [0, 0.82, 0], seg: [16, 12], finish: "sheen" });
      k.torus(0.22, 0.02, metal, { at: [0, 0.82, 0], rot: [Math.PI / 2, 0, 0], finish: "sheen", seg: [6, 20] });
      k.sphere(0.035, C.red, { at: [-0.08, 0.86, 0.19], finish: "glow", seg: [8, 6] });
      k.sphere(0.028, C.amber, { at: [0.09, 0.84, 0.2], finish: "glow", seg: [8, 6] });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.571 + 0.785;
        k.tube([[Math.sin(a) * 0.1, 0.7, Math.cos(a) * 0.1], [Math.sin(a) * 0.24, 0.4, Math.cos(a) * 0.24], [Math.sin(a) * 0.26, 0.02, Math.cos(a) * 0.26]], 0.022, metal, { along: 6, around: 5, finish: "sheen" });
      }
      k.cyl(0.008, 0.3, metal, { at: [0.06, 1.15, 0], seg: 4 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Creatures, by body plan. The well-known beasts of the setting are matched by name; the rest
// get a plan from what the stat block says they are and how big, varied by their name.
// ---------------------------------------------------------------------------------------------

type QuadHead = "long" | "blunt" | "cat" | "dog" | "rhino" | "reptile" | "boar";
type Plan =
  | { plan: "quad"; len: number; h: number; girth: number; head: QuadHead; horns?: "curl" | "forward" | "back" | "tusks"; tail: number; fur?: boolean; legs?: number; color: string; belly?: string; spikes?: boolean; neck?: number; stripes?: string }
  | { plan: "brute"; bulk: number; arms: number; head: "rancor" | "ape" | "wampa" | "horned"; color: string; fur?: boolean }
  | { plan: "runner"; head: "bird" | "lizard" | "tauntaun"; color: string; crest?: string; fur?: boolean }
  | { plan: "serpent"; len: number; r: number; head: "dragon" | "maw" | "fish" | "snake"; legs?: number; color: string; belly?: string }
  | { plan: "flyer"; span: number; head: "bat" | "bird" | "dragon" | "manta"; color: string; perch?: boolean }
  | { plan: "bug"; legs: number; color: string; mantis?: boolean; h: number }
  | { plan: "tentacles"; count: number; color: string; eye?: boolean; maw?: boolean; ground?: boolean }
  | { plan: "critter"; kind: "rat" | "frog" | "lizard" | "cat" | "rabbit" | "bird" | "monkey" | "hippo" | "bug"; color: string }
  | { plan: "slug"; color: string; hutt?: boolean }
  | { plan: "spirit"; color: string }
  | { plan: "plant"; kind: "tree" | "shrub" | "vines" | "flytrap"; color: string };

const BEASTS: [RegExp, Plan][] = [
  [/bantha/, { plan: "quad", len: 0.8, h: 0.45, girth: 0.34, head: "blunt", horns: "curl", tail: 0.25, fur: true, color: "#5a4632" }],
  [/dewback/, { plan: "quad", len: 0.9, h: 0.22, girth: 0.24, head: "reptile", tail: 0.8, color: "#6f7a5a", belly: "#a9a07a" }],
  [/reek/, { plan: "quad", len: 0.85, h: 0.42, girth: 0.32, head: "rhino", horns: "forward", tail: 0.3, color: "#8a6a5a", belly: "#b09a7a" }],
  [/ronto|fambaa|ghest|scrange/, { plan: "quad", len: 0.9, h: 0.5, girth: 0.36, head: "reptile", tail: 0.6, color: "#8a7a6a", belly: "#b5a890", neck: 1.4 }],
  [/eopie|fathier|aryx|katarn/, { plan: "quad", len: 0.75, h: 0.55, girth: 0.22, head: "long", tail: 0.35, color: "#c9b8a0", neck: 1.3 }],
  [/shaak|nerf|moof|hrumph|happabore|woodoo/, { plan: "quad", len: 0.75, h: 0.32, girth: 0.3, head: "blunt", horns: "back", tail: 0.15, fur: true, color: "#8a6a4a" }],
  [/nexu|tusk cat|vornskr|tuk'ata|loth|maalraas|veermok|narglatch|voxyn/, { plan: "quad", len: 0.7, h: 0.3, girth: 0.17, head: "cat", tail: 0.6, color: "#b08a5a", stripes: "#3a2a1a", spikes: true }],
  [/kath hound|massiff|anooba|sibian|vulptex|gutkurr|boar-wolf|hound/, { plan: "quad", len: 0.65, h: 0.3, girth: 0.18, head: "dog", tail: 0.35, fur: true, color: "#6a5a4a", spikes: true }],
  [/boar|zalaaca|lylek|blurrg/, { plan: "quad", len: 0.7, h: 0.32, girth: 0.25, head: "boar", horns: "tusks", tail: 0.2, color: "#5a4a3a" }],
  [/rancor/, { plan: "brute", bulk: 1.35, arms: 2, head: "rancor", color: "#6b5a48" }],
  [/wampa/, { plan: "brute", bulk: 1.15, arms: 2, head: "wampa", color: "#ece8e0", fur: true }],
  [/gundark/, { plan: "brute", bulk: 1.0, arms: 4, head: "ape", color: "#6b5a48" }],
  [/terentatek|rakghoul|flesh raider|sando/, { plan: "brute", bulk: 1.05, arms: 2, head: "horned", color: "#6a5a5a" }],
  [/tauntaun/, { plan: "runner", head: "tauntaun", color: "#c9c4b8", fur: true }],
  [/kaadu/, { plan: "runner", head: "bird", color: "#d9b84a" }],
  [/varactyl|dragonsnake/, { plan: "runner", head: "lizard", color: "#5f8f4e", crest: "#d9752b" }],
  [/krayt/, { plan: "serpent", len: 1.8, r: 0.16, head: "dragon", legs: 6, color: "#c9b48a", belly: "#e0d2b0" }],
  [/exogorth|mole serpent|war wyrm|bor gullet/, { plan: "serpent", len: 2.0, r: 0.2, head: "maw", color: "#6a6a62" }],
  [/opee|sea killer|aiwha/, { plan: "serpent", len: 1.4, r: 0.18, head: "fish", color: "#a86a3a" }],
  [/hssiss|snake|serpent/, { plan: "serpent", len: 1.3, r: 0.1, head: "snake", color: "#3f6a3a" }],
  [/mynock/, { plan: "flyer", span: 0.9, head: "manta", color: "#4a4a50" }],
  [/porg/, { plan: "flyer", span: 0.4, head: "bird", color: "#e8dcc8", perch: true }],
  [/condor dragon|battle hydra/, { plan: "flyer", span: 1.8, head: "dragon", color: "#7a5a4a" }],
  [/hawk-bat|bogwing|shyrack|sketto|stintaril/, { plan: "flyer", span: 0.9, head: "bat", color: "#5a4a4a" }],
  [/geejaw|jubba|pelko|steelpecker|twirrl|whisper|flutterplume|convor|bird/, { plan: "flyer", span: 0.7, head: "bird", color: "#5a7a9a" }],
  [/acklay/, { plan: "bug", legs: 6, color: "#6f8a4a", mantis: true, h: 0.7 }],
  [/spider|kinrath|knobby/, { plan: "bug", legs: 8, color: "#d9d4c8", h: 0.35 }],
  [/fexian|orbalisk|brain worm|pelko|rock wart|k'lor/, { plan: "critter", kind: "bug", color: "#4a5a3a" }],
  [/dianoga/, { plan: "tentacles", count: 7, color: "#6a5a7a", eye: true }],
  [/rathtar/, { plan: "tentacles", count: 9, color: "#8a3a2a", maw: true }],
  [/sarlacc/, { plan: "tentacles", count: 8, color: "#c9a07a", maw: true, ground: true }],
  [/womp rat|hive rat|scurrier|greysor|rat/, { plan: "critter", kind: "rat", color: "#6a5a4a" }],
  [/worrt|clodhopper/, { plan: "critter", kind: "frog", color: "#7a6a3a" }],
  [/ysalamir|gizka|lizard(?!-)|mucous salamander/, { plan: "critter", kind: "lizard", color: "#7a8a5a" }],
  [/jakrab|vulptex/, { plan: "critter", kind: "rabbit", color: "#b8a080" }],
  [/monkey-lizard|kowakian/, { plan: "critter", kind: "monkey", color: "#c9a06a" }],
  [/nuna/, { plan: "critter", kind: "bird", color: "#9a7a5a" }],
  [/mott|steep|swamp slug|spotlight sloth/, { plan: "critter", kind: "hippo", color: "#7a6a6a" }],
  [/hutt/, { plan: "slug", color: "#7c8a4a", hutt: true }],
  [/slug|wyyyschokk|worm/, { plan: "slug", color: "#7a6a5a" }],
  [/spirit|abeloth|manifestation|vessel|starweird|ghost/, { plan: "spirit", color: "#9a7aff" }],
  [/\btree\b/, { plan: "plant", kind: "tree", color: "#4a6a3a" }],
  [/shrub/, { plan: "plant", kind: "shrub", color: "#4a7a3a" }],
  [/vines/, { plan: "plant", kind: "vines", color: "#3a6a3a" }],
  [/carnivorous plant|plant/, { plan: "plant", kind: "flytrap", color: "#5a8a3a" }],
];

const NATURAL = ["#6a5a4a", "#7a6a52", "#5a5a52", "#8a7a5a", "#4a5a42", "#7a5a4a", "#5a4a5a"];

export function creaturePlan(name: string, creature = "", size = ""): Plan {
  const n = name.toLowerCase();
  const found = BEASTS.find(([re]) => re.test(n));
  if (found) return found[1];
  const color = pickOf(NATURAL, name);
  const c = creature.toLowerCase();
  if (/undead|elemental/.test(c)) return { plan: "spirit", color: "#9a7aff" };
  if (/plant|tree/.test(c)) return { plan: "plant", kind: hue(name) % 2 ? "shrub" : "flytrap", color: "#4a7a3a" };
  if (/aberration/.test(c)) return hue(name) % 2 ? { plan: "tentacles", count: 6, color: "#5b3b6b", eye: true } : { plan: "brute", bulk: 1, arms: 2, head: "horned", color: "#5b4b5b" };
  if (/tiny/i.test(size)) return { plan: "critter", kind: (["rat", "lizard", "frog", "rabbit"] as const)[hue(name) % 4], color };
  const heads: QuadHead[] = ["dog", "cat", "long", "reptile", "boar", "blunt"];
  return { plan: "quad", len: 0.7, h: 0.32, girth: 0.22, head: heads[hue(name) % heads.length], tail: 0.4, fur: hue(name) % 3 === 0, color };
}

function buildCreature(k: Kit, p: Plan, seed: number) {
  switch (p.plan) {
    case "quad": return quadruped(k, p, seed);
    case "brute": return brute(k, p, seed);
    case "runner": return runner(k, p, seed);
    case "serpent": return serpent(k, p);
    case "flyer": return flyer(k, p);
    case "bug": return bug(k, p);
    case "tentacles": return tentacles(k, p);
    case "critter": return critter(k, p, seed);
    case "slug": return slug(k, p);
    case "spirit": return spirit(k, p);
    case "plant": return plant(k, p, seed);
  }
}

// A beast on four (or six) legs, facing +z
function quadruped(k: Kit, p: Extract<Plan, { plan: "quad" }>, seed: number) {
  const { len, h, girth, color } = p;
  const belly = p.belly ?? shade(color, 1.18);
  const y = h + girth * 0.55;
  const front = len / 2;
  if (p.fur) k.blob(girth * 1.12, color, { at: [0, y, 0], smooth: true, rough: 0.16, seed, squash: [1, 0.92, (len + girth * 1.4) / (girth * 2.2)] });
  else {
    k.capsule(girth, len, color, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], seg: 12 });
    k.capsule(girth * 0.82, len * 0.9, belly, { at: [0, y - girth * 0.22, 0.01], rot: [Math.PI / 2, 0, 0], seg: 10 });
  }
  if (p.stripes) for (let i = 0; i < 4; i++) k.torus(girth * 1.0, girth * 0.08, p.stripes, { at: [0, y + girth * 0.1, front * 0.6 - i * len * 0.25], rot: [0, 0, 0], arc: Math.PI, seg: [4, 12], scale: [1, 1, 0.5] });
  if (p.spikes) for (let i = 0; i < 5; i++) k.cone(girth * 0.12, girth * 0.4, shade(color, 0.7), { at: [0, y + girth * 0.95, front * 0.7 - i * len * 0.3], rot: [-0.3, 0, 0], seg: 5 });
  const legs = p.legs ?? 4;
  const rows = legs / 2;
  for (let r = 0; r < rows; r++) {
    const z = rows === 1 ? 0 : front * 0.85 * (1 - (2 * r) / (rows - 1));
    k.pair((s) => {
      const x = s * girth * 0.72;
      const knee: V3 = [x * 1.05, h * 0.5, z + (r === 0 ? 0.03 : -0.05)];
      k.tube([[x, y - girth * 0.2, z], knee, [x, 0.05, z]], (t) => girth * (0.36 - t * 0.18), r === 0 ? color : shade(color, 0.95), { along: 8, around: 7 });
      k.cyl(girth * 0.2, 0.06, shade(color, 0.5), { at: [x, 0.03, z + 0.01], seg: 8 });
    });
  }
  // The neck and the head
  const neck = p.neck ?? 1;
  const headAt: V3 = [0, y + girth * 0.5 * neck, front + girth * 0.9];
  k.tube([[0, y + girth * 0.2, front], [0, y + girth * 0.45 * neck, front + girth * 0.5], headAt], girth * 0.45, color, { along: 6, around: 8 });
  k.group(headAt, undefined, girth / 0.3, () => quadHead(k, p, color));
  // The tail
  if (p.tail > 0) k.tube([[0, y, -front - girth * 0.6], [0, y * 0.75, -front - girth * 0.6 - p.tail * 0.4], [0.05, y * 0.35, -front - girth * 0.6 - p.tail * 0.85], [0.1, 0.06, -front - girth * 0.6 - p.tail]], (t) => girth * 0.35 * (1 - t * 0.85), color, { along: 10, around: 6 });
}

// The head of a four-legged beast, built for a body 0.3 thick
function quadHead(k: Kit, p: Extract<Plan, { plan: "quad" }>, color: string) {
  const eye = (at: V3, r = 0.03) => k.sphere(r, "#15171b", { at, finish: "sheen", seg: [8, 6] });
  switch (p.head) {
    case "blunt":
      k.blob(0.2, color, { smooth: true, rough: 0.12, seed: 2, squash: [1, 0.95, 1.15] });
      k.box([0.18, 0.14, 0.12], shade(color, 1.2), { at: [0, -0.06, 0.16], round: 0.05 });
      k.pair((s) => eye([s * 0.12, 0.05, 0.14]));
      if (p.horns === "curl") k.pair((s) => k.tube([[s * 0.14, 0.1, 0], [s * 0.26, 0.12, -0.06], [s * 0.3, 0.0, 0.06], [s * 0.22, -0.08, 0.14], [s * 0.2, -0.02, 0.2]], (t) => 0.06 * (1 - t * 0.7), "#c9b8a0", { along: 14, around: 7 }));
      if (p.horns === "back") k.pair((s) => k.tube([[s * 0.1, 0.12, 0], [s * 0.18, 0.2, -0.12], [s * 0.2, 0.18, -0.24]], (t) => 0.04 * (1 - t * 0.7), "#c9b8a0", { along: 8, around: 6 }));
      if (p.fur) k.blob(0.12, shade(color, 0.85), { at: [0, -0.16, 0.06], smooth: true, rough: 0.2, seed: 5, squash: [1, 1.4, 0.8] });
      return;
    case "reptile":
      k.capsule(0.13, 0.26, color, { at: [0, 0, 0.12], rot: [Math.PI / 2, 0, 0], scale: [1, 0.65, 1], seg: 10 });
      k.box([0.2, 0.04, 0.3], shade(color, 0.6), { at: [0, -0.05, 0.16], round: 0.02 });
      k.pair((s) => eye([s * 0.1, 0.06, 0.08]));
      k.pair((s) => k.sphere(0.012, "#15171b", { at: [s * 0.04, 0.02, 0.38], seg: [6, 4] }));
      return;
    case "rhino":
      k.blob(0.2, color, { smooth: true, rough: 0.1, seed: 4, squash: [1.05, 0.85, 1.25] });
      k.cone(0.06, 0.28, "#e8dcc0", { at: [0, 0.04, 0.3], rot: [Math.PI / 2 - 0.3, 0, 0], seg: 8 });
      k.pair((s) => k.cone(0.045, 0.2, "#e8dcc0", { at: [s * 0.14, 0.12, 0.12], rot: [Math.PI / 2 - 0.6, 0, s * -0.4], seg: 7 }));
      k.cyl(0.22, 0.04, shade(color, 0.8), { at: [0, 0.12, -0.08], rot: [Math.PI / 2 + 0.6, 0, 0], arc: Math.PI, start: -Math.PI / 2, seg: 14 });
      k.pair((s) => eye([s * 0.14, 0.06, 0.12], 0.025));
      return;
    case "long":
      k.capsule(0.1, 0.28, color, { at: [0, -0.04, 0.14], rot: [Math.PI / 2 + 0.5, 0, 0], seg: 10 });
      k.pair((s) => k.cone(0.035, 0.12, color, { at: [s * 0.07, 0.14, -0.02], rot: [-0.2, 0, s * -0.3], seg: 6 }));
      k.pair((s) => eye([s * 0.09, 0.05, 0.06], 0.022));
      return;
    case "cat":
      k.sphere(0.15, color, { scale: [1, 0.9, 1.05], seg: [14, 10] });
      k.box([0.12, 0.08, 0.1], shade(color, 1.15), { at: [0, -0.04, 0.13], round: 0.04 });
      k.pair((s) => k.cone(0.04, 0.1, color, { at: [s * 0.09, 0.14, -0.01], rot: [-0.2, 0, s * -0.2], seg: 5 }));
      k.pair((s) => k.sphere(0.028, "#e8d24a", { at: [s * 0.065, 0.04, 0.12], finish: "glow", seg: [8, 6] }));
      k.pair((s) => k.cone(0.012, 0.06, "#f0ece0", { at: [s * 0.04, -0.1, 0.16], rot: [Math.PI, 0, 0], seg: 4 }));
      return;
    case "dog":
      k.sphere(0.14, color, { scale: [1, 0.9, 1.0], seg: [14, 10] });
      k.capsule(0.07, 0.12, shade(color, 1.1), { at: [0, -0.04, 0.17], rot: [Math.PI / 2, 0, 0], seg: 8 });
      k.sphere(0.03, "#15171b", { at: [0, -0.02, 0.29], seg: [6, 4] });
      k.pair((s) => k.cone(0.045, 0.12, color, { at: [s * 0.08, 0.14, -0.02], rot: [-0.1, 0, s * -0.35], seg: 5 }));
      k.pair((s) => eye([s * 0.06, 0.05, 0.11], 0.022));
      return;
    case "boar":
      k.blob(0.17, color, { smooth: true, rough: 0.12, seed: 8, squash: [1, 0.9, 1.15] });
      k.cyl(0.08, 0.08, shade(color, 1.25), { at: [0, -0.04, 0.2], rot: [Math.PI / 2, 0, 0], seg: 12 });
      k.pair((s) => k.tube([[s * 0.06, -0.08, 0.16], [s * 0.1, -0.02, 0.22], [s * 0.1, 0.06, 0.24]], (t) => 0.025 * (1 - t * 0.7), "#e8dcc0", { along: 6, around: 5 }));
      k.pair((s) => eye([s * 0.1, 0.06, 0.1], 0.022));
      return;
  }
}

// A great brute on two legs with long arms: a rancor's jaws, a wampa's horns, a gundark's ears
function brute(k: Kit, p: Extract<Plan, { plan: "brute" }>, seed: number) {
  const b = p.bulk;
  const c = p.color;
  const skin = shade(c, 0.9);
  const hunch = p.head === "rancor" ? 0.55 : 0.25;
  k.pair((s) => {
    k.tube([[s * 0.16 * b, 0.42, -0.05], [s * 0.19 * b, 0.24, 0.07], [s * 0.17 * b, 0.05, -0.02]], (t) => (0.1 - t * 0.04) * b, c, { along: 8, around: 8 });
    k.box([0.14 * b, 0.07, 0.22 * b], skin, { at: [s * 0.17 * b, 0.035, 0.04], round: 0.03 });
    for (let i = -1; i <= 1; i++) k.cone(0.018, 0.06, "#e8dcc0", { at: [s * 0.17 * b + i * 0.04, 0.03, 0.16 * b], rot: [Math.PI / 2, 0, 0], seg: 4 });
  });
  k.group([0, 0.42, 0], [hunch, 0, 0], undefined, () => {
    if (p.fur) k.blob(0.3 * b, c, { at: [0, 0.3, 0], smooth: true, rough: 0.2, seed, squash: [1, 1.15, 0.85] });
    else k.lathe([[0.2 * b, 0], [0.24 * b, 0.12], [0.3 * b, 0.3], [0.32 * b, 0.42], [0.24 * b, 0.56], [0, 0.6]], c, { scale: [1, 1, 0.75], seg: 16 });
    const arms = p.arms === 4 ? [0.42, 0.24] : [0.42];
    for (const ay of arms) k.pair((s) => {
      const hand: V3 = [s * 0.36 * b, ay - (p.head === "rancor" ? 0.72 : 0.5), 0.2];
      k.tube([[s * 0.28 * b, ay, 0], [s * 0.4 * b, ay - 0.25, 0.04], hand], (t) => (0.085 - t * 0.03) * b, c, { along: 8, around: 8 });
      k.sphere(0.07 * b, skin, { at: hand, seg: [10, 8] });
      for (let i = -1; i <= 1; i++) k.cone(0.016, 0.1, "#e8dcc0", { at: [hand[0] + i * 0.035, hand[1] - 0.06, hand[2] + 0.04], rot: [Math.PI - 0.4, 0, 0], seg: 4 });
    });
    k.group([0, 0.62, 0.12], [-hunch * 0.8, 0, 0], undefined, () => {
      if (p.head === "rancor") {
        k.blob(0.18, c, { smooth: true, rough: 0.12, seed: seed + 1, squash: [1.05, 0.9, 1.1] });
        k.box([0.28, 0.08, 0.26], skin, { at: [0, -0.12, 0.08], round: 0.04 });
        for (let i = 0; i < 6; i++) k.cone(0.016, 0.06, "#f0ece0", { at: [-0.1 + i * 0.04, -0.08, 0.2], rot: [Math.PI, 0, 0], seg: 4 });
        k.pair((s) => k.sphere(0.022, "#e8d24a", { at: [s * 0.08, 0.06, 0.14], finish: "glow", seg: [8, 6] }));
      } else if (p.head === "wampa") {
        k.sphere(0.14, c, { scale: [1, 1, 1.05], seg: [14, 10] });
        k.box([0.12, 0.08, 0.06], "#5a4a4a", { at: [0, -0.04, 0.12], round: 0.03 });
        k.pair((s) => k.tube([[s * 0.1, 0.08, 0], [s * 0.2, 0.06, -0.04], [s * 0.2, -0.06, 0.04], [s * 0.15, -0.1, 0.1]], (t) => 0.035 * (1 - t * 0.7), "#c9b8a0", { along: 10, around: 6 }));
        k.pair((s) => k.sphere(0.018, "#15171b", { at: [s * 0.05, 0.03, 0.12], seg: [6, 4] }));
      } else if (p.head === "ape") {
        k.sphere(0.13, c, { seg: [14, 10] });
        k.pair((s) => k.sphere(0.09, shade(c, 0.85), { at: [s * 0.14, 0.04, -0.02], scale: [0.3, 1, 0.8], seg: [10, 8] }));
        k.box([0.14, 0.07, 0.07], skin, { at: [0, -0.05, 0.11], round: 0.03 });
        k.pair((s) => k.sphere(0.02, "#e8d24a", { at: [s * 0.05, 0.03, 0.11], finish: "glow", seg: [6, 4] }));
      } else {
        k.blob(0.13, c, { smooth: true, rough: 0.15, seed: seed + 2 });
        k.pair((s) => k.cone(0.03, 0.14, "#d8ccb0", { at: [s * 0.08, 0.14, 0], rot: [-0.3, 0, s * -0.3], seg: 6 }));
        k.pair((s) => k.sphere(0.022, "#ff5a3a", { at: [s * 0.05, 0.02, 0.11], finish: "glow", seg: [6, 4] }));
      }
    });
  });
}

// A runner on two strong legs with a long neck and a tail for balance
function runner(k: Kit, p: Extract<Plan, { plan: "runner" }>, seed: number) {
  const c = p.color;
  const y = 0.62;
  if (p.fur) k.blob(0.22, c, { at: [0, y, -0.02], smooth: true, rough: 0.14, seed, squash: [0.85, 0.9, 1.35] });
  else k.capsule(0.18, 0.32, c, { at: [0, y, -0.02], rot: [Math.PI / 2 - 0.2, 0, 0], seg: 12 });
  k.pair((s) => {
    k.tube([[s * 0.11, y - 0.05, 0], [s * 0.13, 0.36, 0.12], [s * 0.12, 0.16, -0.06], [s * 0.11, 0.04, 0.02]], (t) => 0.07 * (1 - t * 0.55), shade(c, 0.95), { along: 10, around: 7 });
    k.box([0.06, 0.03, 0.16], shade(c, 0.5), { at: [s * 0.11, 0.015, 0.06], round: 0.01 });
    k.tube([[s * 0.1, y + 0.02, 0.16], [s * 0.12, y - 0.1, 0.24], [s * 0.1, y - 0.16, 0.3]], 0.025, c, { along: 6, around: 5 });
  });
  const headAt: V3 = [0, y + 0.42, 0.34];
  k.tube([[0, y + 0.08, 0.14], [0, y + 0.26, 0.2], headAt], (t) => 0.09 - t * 0.03, c, { along: 8, around: 8 });
  k.tube([[0, y, -0.2], [0, y - 0.05, -0.4], [0, y - 0.15, -0.62]], (t) => 0.1 * (1 - t * 0.8), c, { along: 8, around: 7 });
  k.group(headAt, undefined, undefined, () => {
    if (p.head === "bird") {
      k.sphere(0.09, c, { seg: [12, 10] });
      k.capsule(0.05, 0.12, "#e8a03a", { at: [0, -0.02, 0.12], rot: [Math.PI / 2, 0, 0], scale: [1.3, 0.6, 1], seg: 8 });
    } else if (p.head === "tauntaun") {
      k.capsule(0.07, 0.12, c, { at: [0, 0, 0.05], rot: [Math.PI / 2 + 0.3, 0, 0], seg: 10 });
      k.pair((s) => k.tube([[s * 0.06, 0.04, -0.02], [s * 0.13, 0.06, -0.06], [s * 0.15, -0.04, 0.0], [s * 0.1, -0.08, 0.06]], (t) => 0.03 * (1 - t * 0.6), "#c9b8a0", { along: 10, around: 6 }));
    } else {
      k.capsule(0.07, 0.14, c, { at: [0, 0, 0.08], rot: [Math.PI / 2, 0, 0], scale: [1, 0.75, 1], seg: 10 });
      if (p.crest) for (let i = 0; i < 4; i++) k.cone(0.03, 0.18, p.crest, { at: [0, 0.06, -0.02 - i * 0.05], rot: [-0.9 - i * 0.15, 0, 0], seg: 5 });
    }
    k.pair((s) => k.sphere(0.016, "#15171b", { at: [s * 0.055, 0.03, 0.05], seg: [6, 4] }));
  });
  if (p.crest) for (let i = 0; i < 5; i++) k.cone(0.025, 0.12, p.crest, { at: [0, y + 0.2 - i * 0.02, 0.1 - i * 0.1], rot: [-0.6, 0, 0], seg: 5 });
}

// A long body winding over the ground: a dragon with its legs, a worm's round maw, a fish
function serpent(k: Kit, p: Extract<Plan, { plan: "serpent" }>) {
  const { len, r, color } = p;
  const pts: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([Math.sin(t * Math.PI * 2) * 0.18, r + (p.head === "fish" ? 0.3 : 0) + (i === 0 ? r * 0.6 : 0), 0.45 - t * len]);
  }
  k.tube(pts, (t) => r * (t < 0.15 ? 0.9 + t : 1.05 - t * 0.85), color, { along: 28, around: 10 });
  if (p.belly) k.tube(pts.map(([x, y, z]) => [x, y - r * 0.35, z] as V3), (t) => r * 0.7 * (1.0 - t * 0.85), p.belly, { along: 24, around: 8 });
  if (p.legs) for (let i = 0; i < p.legs / 2; i++) {
    const [x, , z] = pts[1 + i * 2];
    k.pair((s) => k.tube([[x + s * r * 0.8, r, z], [x + s * r * 1.8, r * 0.9, z + 0.04], [x + s * r * 2.0, 0.03, z + 0.08]], (t) => r * 0.4 * (1 - t * 0.5), shade(color, 0.9), { along: 6, around: 6 }));
  }
  const [hx, hy, hz] = pts[0];
  k.group([hx, hy, hz + r * 0.6], undefined, r / 0.16, () => {
    if (p.head === "dragon") {
      k.capsule(0.15, 0.3, color, { at: [0, 0.02, 0.15], rot: [Math.PI / 2, 0, 0], scale: [1, 0.75, 1], seg: 10 });
      k.box([0.24, 0.05, 0.34], shade(color, 0.7), { at: [0, -0.08, 0.2], round: 0.02 });
      for (let i = 0; i < 3; i++) k.pair((s) => k.cone(0.03, 0.18, "#e8dcc0", { at: [s * (0.08 + i * 0.03), 0.12, -0.02 - i * 0.07], rot: [-1.0, 0, s * -0.4], seg: 6 }));
      k.pair((s) => k.sphere(0.022, "#e8d24a", { at: [s * 0.09, 0.07, 0.18], finish: "glow", seg: [6, 4] }));
    } else if (p.head === "maw") {
      k.torus(0.15, 0.06, shade(color, 1.1), { at: [0, 0, 0.06], seg: [8, 18] });
      for (let i = 0; i < 10; i++) k.cone(0.02, 0.08, "#f0ece0", { at: [Math.cos(i * 0.628) * 0.13, Math.sin(i * 0.628) * 0.13, 0.08], rot: [Math.PI / 2, 0, i * 0.628 + Math.PI / 2], seg: 4 });
      k.cyl(0.11, 0.02, "#2a0a0a", { at: [0, 0, 0.04], rot: [Math.PI / 2, 0, 0], seg: 14 });
    } else if (p.head === "fish") {
      k.blob(0.18, color, { smooth: true, rough: 0.1, seed: 3, squash: [0.8, 1, 1.3] });
      k.pair((s) => k.cone(0.06, 0.2, shade(color, 0.8), { at: [s * 0.18, -0.02, -0.05], rot: [0, 0, s * -1.2], seg: 5 }));
      k.pair((s) => k.sphere(0.03, "#e8d24a", { at: [s * 0.1, 0.06, 0.14], finish: "glow", seg: [6, 4] }));
    } else {
      k.capsule(0.08, 0.12, color, { at: [0, 0, 0.08], rot: [Math.PI / 2, 0, 0], scale: [1.1, 0.7, 1], seg: 10 });
      k.pair((s) => k.sphere(0.015, "#e8d24a", { at: [s * 0.05, 0.03, 0.12], finish: "glow", seg: [6, 4] }));
    }
  });
}

// A flyer hovering with its wings spread (a mynock flat as a ray); a porg sits on the ground
function flyer(k: Kit, p: Extract<Plan, { plan: "flyer" }>) {
  const y = p.perch ? 0.14 : 1.05;
  const c = p.color;
  const span = p.span;
  if (p.perch) {
    k.blob(0.13, c, { at: [0, y, 0], smooth: true, rough: 0.05, seed: 2, squash: [1, 1.1, 1] });
    k.blob(0.08, "#c96a3a", { at: [0, y - 0.04, 0.08], smooth: true, rough: 0.05, seed: 3, squash: [1, 0.9, 0.6] });
    k.pair((s) => k.sphere(0.035, "#15171b", { at: [s * 0.05, y + 0.06, 0.1], finish: "sheen", seg: [8, 6] }));
    k.cone(0.025, 0.04, "#e8a03a", { at: [0, y + 0.02, 0.13], rot: [Math.PI / 2, 0, 0], seg: 5 });
    k.pair((s) => k.sphere(0.07, shade(c, 0.85), { at: [s * 0.12, y, -0.02], scale: [0.3, 0.8, 1], seg: [8, 6] }));
    return;
  }
  const wing = new THREE.Shape();
  if (p.head === "manta") {
    wing.moveTo(0, 0.12);
    wing.quadraticCurveTo(span * 0.3, 0.1, span * 0.55, -0.1);
    wing.quadraticCurveTo(span * 0.3, -0.12, 0, -0.25);
  } else {
    wing.moveTo(0, 0.08);
    wing.quadraticCurveTo(span * 0.25, 0.2, span * 0.55, 0.05);
    wing.lineTo(span * 0.45, -0.08);
    wing.quadraticCurveTo(span * 0.35, -0.02, span * 0.3, -0.14);
    wing.quadraticCurveTo(span * 0.2, -0.06, span * 0.12, -0.16);
    wing.quadraticCurveTo(0.06, -0.08, 0, -0.12);
  }
  k.pair((s) => k.extrude(wing, 0.01, shade(c, p.head === "bird" ? 1.15 : 0.85), { at: [s * 0.05, y, 0], rot: [-Math.PI / 2, 0, 0], scale: [s, 1, 1], finish: "cloth" }));
  k.capsule(0.07 * (span / 0.9) ** 0.5, 0.2, c, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], seg: 10 });
  k.tube([[0, y, -0.15], [0, y - 0.02, -0.32], [0.03, y - 0.05, -0.5]], (t) => 0.025 * (1 - t * 0.7), c, { along: 6, around: 5 });
  k.group([0, y + 0.02, 0.18], undefined, (span / 0.9) ** 0.5, () => {
    if (p.head === "bird") {
      k.sphere(0.06, c, { seg: [10, 8] });
      k.cone(0.025, 0.08, "#e8a03a", { at: [0, -0.01, 0.07], rot: [Math.PI / 2, 0, 0], seg: 5 });
    } else if (p.head === "dragon") {
      k.capsule(0.06, 0.14, c, { at: [0, 0, 0.06], rot: [Math.PI / 2, 0, 0], seg: 8 });
      k.pair((s) => k.cone(0.015, 0.08, "#e8dcc0", { at: [s * 0.04, 0.05, -0.02], rot: [-1, 0, 0], seg: 4 }));
    } else if (p.head === "manta") {
      k.sphere(0.06, c, { scale: [1.2, 0.6, 1], seg: [10, 8] });
      k.cyl(0.03, 0.02, "#2a0a0a", { at: [0, -0.01, 0.055], rot: [Math.PI / 2, 0, 0], seg: 10 });
    } else {
      k.sphere(0.06, c, { seg: [10, 8] });
      k.pair((s) => k.cone(0.025, 0.07, c, { at: [s * 0.04, 0.06, 0], seg: 4 }));
    }
    k.pair((s) => k.sphere(0.012, p.head === "manta" ? "#e8d24a" : "#15171b", { at: [s * 0.03, 0.02, 0.05], finish: p.head === "manta" ? "glow" : "sheen", seg: [6, 4] }));
  });
}

// An insect or spider on jointed legs; the acklay rears up on scythed forelimbs
function bug(k: Kit, p: Extract<Plan, { plan: "bug" }>) {
  const c = p.color;
  const y = p.h;
  k.blob(0.16, c, { at: [0, y, -0.05], smooth: true, rough: 0.08, seed: 1, squash: [1, 0.8, 1.3], finish: "sheen" });
  k.blob(0.2, shade(c, 0.85), { at: [0, y + 0.02, -0.3], smooth: true, rough: 0.1, seed: 2, squash: [1, 0.9, 1.3], finish: "sheen" });
  const legs = p.legs - (p.mantis ? 2 : 0);
  for (let i = 0; i < legs / 2; i++) {
    const z = 0.05 - i * 0.12;
    k.pair((s) => k.tube([[s * 0.1, y, z], [s * (0.3 + y * 0.3), y + 0.12, z + 0.04], [s * (0.42 + y * 0.2), 0.02, z + 0.08]], 0.02, shade(c, 0.8), { along: 6, around: 5, finish: "sheen" }));
  }
  const headAt: V3 = p.mantis ? [0, y + 0.4, 0.2] : [0, y, 0.15];
  if (p.mantis) {
    k.tube([[0, y + 0.05, 0.05], [0, y + 0.25, 0.12], headAt], 0.07, c, { along: 6, around: 7, finish: "sheen" });
    k.pair((s) => {
      k.tube([[s * 0.08, y + 0.3, 0.15], [s * 0.18, y + 0.55, 0.25], [s * 0.2, y + 0.2, 0.45]], 0.03, c, { along: 8, around: 6, finish: "sheen" });
      k.cone(0.03, 0.3, "#e8dcc0", { at: [s * 0.2, y + 0.08, 0.5], rot: [Math.PI - 0.4, 0, 0], seg: 5 });
    });
  }
  k.group(headAt, undefined, undefined, () => {
    k.sphere(0.08, c, { scale: [1.1, 0.9, 1.1], seg: [10, 8], finish: "sheen" });
    for (let i = 0; i < (p.legs === 8 ? 6 : 2); i++) k.sphere(0.014, C.red, { at: [(i % 2 ? 1 : -1) * (0.025 + Math.floor(i / 2) * 0.02), 0.03 + Math.floor(i / 2) * 0.015, 0.07], finish: "glow", seg: [6, 4] });
    k.pair((s) => k.cone(0.012, 0.06, "#2a2a2e", { at: [s * 0.03, -0.04, 0.08], rot: [Math.PI / 2 + 0.6, 0, 0], seg: 4 }));
  });
}

// A body of tentacles: a dianoga with its eye on a stalk, a rathtar's ring of teeth, a sarlacc's pit
function tentacles(k: Kit, p: Extract<Plan, { plan: "tentacles" }>) {
  const c = p.color;
  if (p.ground) {
    k.torus(0.42, 0.12, "#c9a87a", { at: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], seg: [8, 24] });
    k.cyl(0.36, 0.02, "#3a1a1a", { at: [0, 0.02, 0], seg: 20 });
    k.cone(0.12, 0.3, "#d98a8a", { at: [0, 0.18, 0], seg: 10 });
  } else k.blob(0.24, c, { at: [0, 0.32, 0], smooth: true, rough: 0.2, seed: 4, squash: [1, 0.85, 1] });
  for (let i = 0; i < p.count; i++) {
    const a = (i / p.count) * Math.PI * 2;
    const [sx, sz] = [Math.sin(a), Math.cos(a)];
    const base = p.ground ? 0.1 : 0.22;
    k.tube([[sx * 0.18, base, sz * 0.18], [sx * 0.38, base + 0.12, sz * 0.38], [sx * 0.52, base - 0.05, sz * 0.5], [sx * 0.62 + sz * 0.1, 0.05, sz * 0.62 - sx * 0.1]], (t) => 0.05 * (1 - t * 0.8), shade(c, i % 2 ? 0.9 : 1.05), { along: 12, around: 6 });
  }
  if (p.eye) {
    k.tube([[0, 0.5, 0], [0.05, 0.75, 0.05], [0.02, 0.95, 0.1]], 0.025, c, { along: 8, around: 6 });
    k.sphere(0.06, "#f0ece0", { at: [0.02, 0.98, 0.12], seg: [10, 8] });
    k.sphere(0.03, "#e84a3a", { at: [0.02, 0.98, 0.17], finish: "glow", seg: [8, 6] });
  }
  if (p.maw && !p.ground) {
    k.torus(0.12, 0.03, "#6a1a1a", { at: [0, 0.4, 0.2], rot: [-0.3, 0, 0], seg: [6, 16] });
    for (let i = 0; i < 8; i++) k.cone(0.014, 0.06, "#f0ece0", { at: [Math.cos(i * 0.785) * 0.11, 0.4 + Math.sin(i * 0.785) * 0.1, 0.22], rot: [Math.PI / 2, 0, i * 0.785 + Math.PI / 2], seg: 4 });
  }
}

// Small things of the wild: rats, frogs, lizards, hares, a kowakian, a fat mott, a crawling bug
function critter(k: Kit, p: Extract<Plan, { plan: "critter" }>, seed: number) {
  const c = p.color;
  const eye = (at: V3, r = 0.02) => k.sphere(r, "#15171b", { at, finish: "sheen", seg: [6, 4] });
  switch (p.kind) {
    case "rat":
      k.blob(0.13, c, { at: [0, 0.14, 0], smooth: true, rough: 0.1, seed, squash: [0.9, 0.85, 1.5] });
      k.cone(0.07, 0.16, c, { at: [0, 0.14, 0.24], rot: [Math.PI / 2, 0, 0], seg: 8 });
      k.pair((s) => k.sphere(0.04, shade(c, 1.2), { at: [s * 0.06, 0.22, 0.14], scale: [0.4, 1, 0.8], seg: [8, 6] }));
      k.tube([[0, 0.12, -0.18], [0.05, 0.08, -0.35], [0.12, 0.03, -0.5]], 0.012, "#c9a0a0", { along: 6, around: 4 });
      k.pair((s) => eye([s * 0.04, 0.17, 0.2]));
      k.pair((s) => k.tube([[s * 0.06, 0.08, 0.08], [s * 0.07, 0.02, 0.1]], 0.014, c, { along: 2, around: 4 }));
      return;
    case "frog":
      k.blob(0.18, c, { at: [0, 0.15, 0], smooth: true, rough: 0.12, seed, squash: [1.1, 0.75, 1] });
      k.pair((s) => k.sphere(0.05, "#d9c04a", { at: [s * 0.08, 0.27, 0.1], finish: "sheen", seg: [8, 6] }));
      k.pair((s) => k.tube([[s * 0.12, 0.1, -0.06], [s * 0.22, 0.1, -0.02], [s * 0.2, 0.02, 0.06]], 0.035, c, { along: 6, around: 5 }));
      return;
    case "lizard":
      k.capsule(0.06, 0.24, c, { at: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], seg: 8 });
      k.tube([[0, 0.07, -0.15], [0.06, 0.05, -0.3], [0.02, 0.03, -0.45]], (t) => 0.04 * (1 - t * 0.8), c, { along: 6, around: 5 });
      k.capsule(0.045, 0.06, c, { at: [0, 0.09, 0.2], rot: [Math.PI / 2, 0, 0], seg: 8 });
      for (const z of [0.08, -0.08]) k.pair((s) => k.tube([[s * 0.05, 0.07, z], [s * 0.1, 0.05, z + 0.02], [s * 0.11, 0.01, z + 0.04]], 0.015, c, { along: 3, around: 4 }));
      k.pair((s) => eye([s * 0.03, 0.12, 0.23], 0.012));
      return;
    case "rabbit":
      k.blob(0.12, c, { at: [0, 0.14, 0], smooth: true, rough: 0.08, seed, squash: [0.9, 1, 1.3] });
      k.sphere(0.07, c, { at: [0, 0.24, 0.12], seg: [10, 8] });
      k.pair((s) => k.capsule(0.022, 0.14, c, { at: [s * 0.03, 0.38, 0.1], rot: [-0.2, 0, s * -0.2], seg: 6 }));
      k.pair((s) => eye([s * 0.035, 0.26, 0.17], 0.014));
      return;
    case "monkey":
      k.blob(0.1, c, { at: [0, 0.3, 0], smooth: true, rough: 0.1, seed, squash: [1, 1.3, 0.9] });
      k.sphere(0.08, c, { at: [0, 0.46, 0.02], seg: [10, 8] });
      k.pair((s) => k.capsule(0.02, 0.14, c, { at: [s * 0.1, 0.52, 0], rot: [0, 0, s * -0.9], seg: 6 }));
      k.pair((s) => k.tube([[s * 0.06, 0.24, 0], [s * 0.08, 0.12, 0.04], [s * 0.06, 0.02, 0]], 0.02, c, { along: 4, around: 4 }));
      k.tube([[0, 0.24, -0.08], [0.08, 0.32, -0.2], [0.1, 0.46, -0.18]], 0.016, c, { along: 6, around: 4 });
      k.pair((s) => eye([s * 0.03, 0.48, 0.08], 0.014));
      return;
    case "bird":
      k.blob(0.13, c, { at: [0, 0.2, 0], smooth: true, rough: 0.06, seed, squash: [1, 0.9, 1.2] });
      k.sphere(0.06, c, { at: [0, 0.3, 0.12], seg: [10, 8] });
      k.cone(0.02, 0.06, "#e8a03a", { at: [0, 0.29, 0.19], rot: [Math.PI / 2, 0, 0], seg: 5 });
      k.pair((s) => k.cyl(0.01, 0.12, "#e8a03a", { at: [s * 0.04, 0.06, 0], seg: 4 }));
      return;
    case "hippo":
      k.blob(0.24, c, { at: [0, 0.24, 0], smooth: true, rough: 0.08, seed, squash: [1, 0.85, 1.35] });
      k.box([0.24, 0.16, 0.18], shade(c, 1.1), { at: [0, 0.22, 0.32], round: 0.07 });
      for (const z of [0.18, -0.18]) k.pair((s) => k.cyl(0.05, 0.12, shade(c, 0.9), { at: [s * 0.14, 0.06, z], seg: 8 }));
      k.pair((s) => eye([s * 0.08, 0.32, 0.3], 0.018));
      return;
    case "bug":
      k.blob(0.1, c, { at: [0, 0.08, 0], smooth: true, rough: 0.1, seed, squash: [1, 0.6, 1.3], finish: "sheen" });
      for (let i = 0; i < 3; i++) k.pair((s) => k.tube([[s * 0.05, 0.07, 0.05 - i * 0.05], [s * 0.12, 0.08, 0.06 - i * 0.05], [s * 0.15, 0.01, 0.07 - i * 0.05]], 0.01, shade(c, 0.7), { along: 3, around: 4 }));
      k.pair((s) => k.sphere(0.014, C.red, { at: [s * 0.03, 0.1, 0.12], finish: "glow", seg: [6, 4] }));
      return;
  }
}

// A slug: a hutt sits up with its arms folded on its belly; others crawl
function slug(k: Kit, p: Extract<Plan, { plan: "slug" }>) {
  const c = p.color;
  if (p.hutt) {
    k.lathe([[0.42, 0], [0.48, 0.1], [0.46, 0.32], [0.38, 0.55], [0.26, 0.72], [0.18, 0.8], [0, 0.82]], c, { at: [0, 0, -0.08], seg: 18, scale: [1, 1, 1.15] });
    k.tube([[0, 0.12, -0.5], [0.12, 0.06, -0.85], [0.3, 0.04, -1.05], [0.42, 0.04, -1.08]], (t) => 0.3 * (1 - t * 0.85), c, { along: 12, around: 9 });
    k.blob(0.26, shade(c, 1.12), { at: [0, 0.9, 0.06], smooth: true, rough: 0.05, seed: 2, squash: [1.25, 0.9, 1.05] });
    k.box([0.32, 0.03, 0.04], "#3a2a1a", { at: [0, 0.82, 0.3], round: 0.012 });
    k.pair((s) => k.sphere(0.035, "#f0a03c", { at: [s * 0.1, 0.98, 0.28], finish: "glow", seg: [8, 6] }));
    k.pair((s) => k.tube([[s * 0.32, 0.6, 0.1], [s * 0.36, 0.45, 0.3], [s * 0.1, 0.42, 0.42]], 0.05, c, { along: 6, around: 6 }));
    k.lathe([[0.36, 0.3], [0.4, 0.42], [0.3, 0.56]], shade(c, 1.2), { at: [0, 0, 0.05], seg: 16, start: -Math.PI / 2 + 0.5, arc: Math.PI - 1.0 });
    return;
  }
  k.tube([[0, 0.12, 0.35], [0.05, 0.13, 0.1], [-0.04, 0.12, -0.15], [0, 0.08, -0.4]], (t) => 0.14 * (1 - t * 0.6), c, { along: 12, around: 9 });
  k.pair((s) => {
    k.tube([[s * 0.04, 0.2, 0.36], [s * 0.07, 0.32, 0.42]], 0.012, c, { along: 2, around: 4 });
    k.sphere(0.022, "#15171b", { at: [s * 0.07, 0.34, 0.43], seg: [6, 4] });
  });
}

// A ghost of the dark side: a robed shape, translucent, lit from within
function spirit(k: Kit, p: Extract<Plan, { plan: "spirit" }>) {
  k.lathe([[0.02, 0.15], [0.26, 0.2], [0.22, 0.5], [0.18, 0.85], [0.08, 0.98], [0, 1.0]], p.color, { seg: 16, finish: "haze" });
  k.sphere(0.12, p.color, { at: [0, 1.08, 0], finish: "haze", seg: [12, 10] });
  k.sphere(0.07, mix(p.color, "#ffffff", 0.6), { at: [0, 0.7, 0], finish: "glow", seg: [10, 8] });
  k.pair((s) => k.sphere(0.02, "#ffffff", { at: [s * 0.04, 1.1, 0.1], finish: "glow", seg: [6, 4] }));
}

// Plants that fight: a walking tree, a thorn bush, a tangle of vines, a snapping flytrap
function plant(k: Kit, p: Extract<Plan, { plan: "plant" }>, seed: number) {
  const c = p.color;
  if (p.kind === "tree") {
    k.tube([[0, 0, 0], [0.05, 0.6, 0.02], [0, 1.2, -0.02]], (t) => 0.16 * (1 - t * 0.5), "#5f3f28", { along: 8, around: 8 });
    k.pair((s) => k.tube([[0, 0.9, 0], [s * 0.3, 1.1, 0.1], [s * 0.45, 0.95, 0.25]], (t) => 0.06 * (1 - t * 0.6), "#5f3f28", { along: 6, around: 6 }));
    k.blob(0.42, c, { at: [0, 1.45, 0], smooth: true, rough: 0.3, seed, squash: [1.2, 0.8, 1.1] });
    k.pair((s) => k.sphere(0.03, "#e8d24a", { at: [s * 0.05, 0.95, 0.12], finish: "glow", seg: [6, 4] }));
    return;
  }
  if (p.kind === "shrub") {
    k.blob(0.3, c, { at: [0, 0.25, 0], smooth: true, rough: 0.35, seed, squash: [1.2, 0.85, 1.2] });
    for (let i = 0; i < 8; i++) k.cone(0.02, 0.1, "#d9d2c0", { at: [Math.sin(i) * 0.3, 0.25 + Math.cos(i * 1.3) * 0.15, Math.cos(i) * 0.3], rot: [Math.cos(i) * 1.2, 0, -Math.sin(i) * 1.2], seg: 4 });
    return;
  }
  if (p.kind === "vines") {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      k.tube([[0, 0, 0], [Math.sin(a) * 0.2, 0.3, Math.cos(a) * 0.2], [Math.sin(a + 0.8) * 0.35, 0.55, Math.cos(a + 0.8) * 0.3], [Math.sin(a + 1.6) * 0.2, 0.85, Math.cos(a + 1.6) * 0.2]], (t) => 0.04 * (1 - t * 0.7), shade(c, 0.9 + (i % 3) * 0.08), { along: 12, around: 5 });
    }
    return;
  }
  k.tube([[0, 0, 0], [0.05, 0.3, 0], [0, 0.55, 0.05]], 0.04, "#4a6a2a", { along: 6, around: 6 });
  for (const s of [1, -1]) {
    k.sphere(0.16, c, { at: [0, 0.65, 0.08], rot: [s * 0.5 - Math.PI / 2, 0, 0], theta: [0, Math.PI / 2], seg: [12, 6], finish: "cloth" });
  }
  for (let i = 0; i < 8; i++) k.cone(0.012, 0.06, "#f0ece0", { at: [Math.cos(i * 0.4 - 1.4) * 0.15, 0.65, 0.08 + Math.sin(i * 0.4 - 1.4) * 0.15 + 0.02], seg: 4 });
  k.pair((s) => k.blob(0.1, c, { at: [s * 0.15, 0.05, 0.05], smooth: true, squash: [1.5, 0.3, 1], seed: s + 3 }));
}

// ---------------------------------------------------------------------------------------------
// War machines with stat blocks of their own: walkers, tanks, turrets
// ---------------------------------------------------------------------------------------------

export function constructKind(name: string): string | undefined {
  const n = name.toLowerCase();
  if (/at-st/.test(n)) return "atst";
  if (/at-rt/.test(n)) return "atrt";
  if (/at-at/.test(n)) return "atat";
  if (/at-te/.test(n)) return "atte";
  if (/aat|tx-225|tank|occupier/.test(n)) return "tank";
  if (/turret|sentry gun|sonic cannon|p-tower|df\.9/.test(n)) return "turret";
  if (/speeder bike|74-z/.test(n)) return "bike";
  if (/brain walker/.test(n)) return "brain";
  if (/hailfire/.test(n)) return "hailfire";
  if (/vulture|hyena/.test(n)) return "vulture";
  return undefined;
}

function buildConstruct(k: Kit, kind: string) {
  const grey = "#8a8f96";
  const dark = "#4a4f56";
  const walkerLeg = (s: number, z: number, top: number) => {
    const knee: V3 = [s * 0.2, top * 0.58, z - 0.2];
    k.rod([s * 0.16, top, z], knee, 0.045, dark, { finish: "sheen" });
    k.rod(knee, [s * 0.18, 0.06, z + 0.03], 0.035, dark, { finish: "sheen" });
    k.sphere(0.06, grey, { at: knee, finish: "sheen", seg: [10, 8] });
    k.box([0.18, 0.04, 0.24], dark, { at: [s * 0.18, 0.02, z + 0.03], round: 0.02, finish: "sheen" });
  };
  switch (kind) {
    case "atst":
      k.pair((s) => walkerLeg(s, 0, 1.0));
      k.box([0.42, 0.3, 0.46], grey, { at: [0, 1.12, 0.02], round: 0.08, finish: "sheen" });
      k.box([0.36, 0.08, 0.1], "#1b2a38", { at: [0, 1.15, 0.25], round: 0.03, finish: "glass" });
      k.pair((s) => k.cyl(0.03, 0.26, "#15171b", { at: [s * 0.24, 1.02, 0.2], rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" }));
      k.cyl(0.04, 0.2, "#15171b", { at: [0, 0.94, 0.28], rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" });
      return;
    case "atrt":
      k.pair((s) => walkerLeg(s, 0, 0.62));
      k.box([0.26, 0.12, 0.3], grey, { at: [0, 0.66, 0], round: 0.04, finish: "sheen" });
      k.cyl(0.03, 0.34, "#15171b", { at: [0, 0.64, 0.3], rot: [Math.PI / 2, 0, 0], seg: 8 });
      k.group([0, 0.42, -0.04], undefined, 0.8, () => buildHumanoid(k, lookOf(), outfitOf("trooper"), HUMAN_TONES[1], "", ""));
      return;
    case "atat":
      for (const z of [0.3, -0.3]) k.pair((s) => k.tube([[s * 0.24, 0.92, z], [s * 0.26, 0.5, z + 0.03], [s * 0.24, 0.05, z]], 0.06, dark, { along: 6, around: 8, finish: "sheen" }));
      k.box([0.6, 0.38, 0.9], grey, { at: [0, 1.08, 0], round: 0.1, finish: "sheen" });
      k.tube([[0, 1.05, 0.45], [0, 1.02, 0.55], [0, 0.98, 0.62]], 0.1, dark, { along: 4, around: 8, finish: "sheen" });
      k.box([0.28, 0.24, 0.36], grey, { at: [0, 0.96, 0.78], round: 0.06, finish: "sheen" });
      k.pair((s) => k.cyl(0.025, 0.2, "#15171b", { at: [s * 0.1, 0.86, 1.0], rot: [Math.PI / 2, 0, 0], seg: 6 }));
      return;
    case "atte":
      for (const z of [0.36, 0, -0.36]) k.pair((s) => k.tube([[s * 0.2, 0.6, z], [s * 0.38, 0.5, z], [s * 0.4, 0.04, z]], 0.04, dark, { along: 6, around: 6, finish: "sheen" }));
      k.box([0.42, 0.22, 0.52], grey, { at: [0, 0.66, 0.26], round: 0.07, finish: "sheen" });
      k.box([0.42, 0.22, 0.5], grey, { at: [0, 0.66, -0.28], round: 0.07, finish: "sheen" });
      k.cyl(0.05, 0.5, dark, { at: [0, 0.86, -0.1], rot: [Math.PI / 2 - 0.4, 0, 0], seg: 10, finish: "sheen" });
      return;
    case "tank": {
      const side = new THREE.Shape();
      side.moveTo(-0.5, 0);
      side.lineTo(0.45, 0);
      side.quadraticCurveTo(0.6, 0.08, 0.5, 0.2);
      side.lineTo(-0.45, 0.24);
      side.lineTo(-0.5, 0);
      k.extrude(side, 0.6, "#7a6a5a", { at: [0, 0.16, -0.3], rot: [0, -Math.PI / 2, 0], bevel: 0.06, finish: "sheen" });
      k.lathe([[0.22, 0], [0.22, 0.08], [0.14, 0.16], [0, 0.17]], "#6a5a4a", { at: [0, 0.48, -0.05], seg: 16, finish: "sheen" });
      k.cyl(0.035, 0.6, "#2b2f36", { at: [0, 0.56, 0.3], rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" });
      k.pair((s) => k.capsule(0.06, 0.3, "#5a4a3a", { at: [s * 0.32, 0.28, 0.1], rot: [Math.PI / 2, 0, 0], finish: "sheen", seg: 8 }));
      return;
    }
    case "turret":
      k.lathe([[0.3, 0], [0.3, 0.06], [0.16, 0.14], [0.12, 0.5], [0, 0.5]], dark, { seg: 16, finish: "sheen" });
      k.sphere(0.2, grey, { at: [0, 0.6, 0], seg: [14, 10], finish: "sheen" });
      k.pair((s) => k.cyl(0.03, 0.5, "#15171b", { at: [s * 0.07, 0.62, 0.32], rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" }));
      k.sphere(0.03, C.red, { at: [0, 0.68, 0.18], finish: "glow", seg: [6, 4] });
      return;
    case "bike":
      buildSpeeder(k, "bike", false, "74-Z");
      k.group([0, 0.12, -0.25], undefined, 0.9, () => buildHumanoid(k, lookOf(), outfitOf("scout trooper"), HUMAN_TONES[1], "", ""));
      return;
    case "brain":
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047;
        k.tube([[Math.sin(a) * 0.1, 0.5, Math.cos(a) * 0.1], [Math.sin(a) * 0.32, 0.55, Math.cos(a) * 0.32], [Math.sin(a) * 0.42, 0.02, Math.cos(a) * 0.42]], 0.02, "#7b8794", { along: 6, around: 5, finish: "sheen" });
      }
      k.cyl(0.16, 0.3, "#9fd4ea", { at: [0, 0.68, 0], seg: 16, finish: "glass" });
      k.blob(0.1, "#d98a9a", { at: [0, 0.68, 0], smooth: true, rough: 0.3, seed: 2 });
      return;
    case "hailfire":
      k.pair((s) => k.torus(0.42, 0.05, "#3a3f46", { at: [s * 0.3, 0.46, 0], rot: [0, Math.PI / 2, 0], seg: [8, 28], finish: "sheen" }));
      k.box([0.4, 0.24, 0.3], grey, { at: [0, 0.5, 0], round: 0.06, finish: "sheen" });
      k.pair((s) => k.cyl(0.08, 0.3, dark, { at: [s * 0.12, 0.72, 0.06], rot: [Math.PI / 2 - 0.3, 0, 0], seg: 10 }));
      return;
    case "vulture":
      for (const z of [0.3, -0.3]) k.pair((s) => k.tube([[s * 0.1, 0.55, z * 0.5], [s * 0.38, 0.5, z], [s * 0.4, 0.04, z]], 0.035, "#7a6a4a", { along: 6, around: 6, finish: "sheen" }));
      k.box([0.26, 0.16, 0.6], "#8a7a5a", { at: [0, 0.6, 0], round: 0.06, finish: "sheen" });
      k.sphere(0.03, C.red, { at: [0, 0.62, 0.31], finish: "glow", seg: [6, 4] });
      return;
  }
}

// ---------------------------------------------------------------------------------------------
// The figure on the map: a ring in the colour of its side and the model of who or what it is.
// `kind` comes from tokenOf (sprites.tsx); the species, role, creature type and name pick the
// model within it. The player's species and whether they use the Force come from Play.
// ---------------------------------------------------------------------------------------------

export const usePartyLook = create<{ species?: string; name?: string; force?: boolean; blade?: string; gear?: Gear; set: (look: { species?: string; name?: string; force?: boolean; blade?: string; gear?: Gear }) => void }>((set) => ({
  set: (look) => set(look),
}));

// The species named in someone's name ("Trandoshan Hunter", "Wookiee Berserker", "Jawa Scrapper")
function speciesInName(name: string, looks: Record<string, Look>): string | undefined {
  const n = name.toLowerCase();
  return Object.keys(looks).find((s) => s.length > 3 && new RegExp(`\\b${s.replace(/[^a-z' -]/g, "")}\\b`).test(n));
}

const HUMAN = lookOf({ name: "Human", skinColorOptions: "Light to dark tones", hairColorOptions: "Black, blond, orange, brown, gray to white", heightAverage: "4'8\"", heightRollMod: "+2d10\"" });

// `wants` are the models this figure carries (interiors/gear.ts), which Figure loads and bakes in
export interface FigureSpec { key: string; build: (k: Kit) => void; height: number; wants?: Want[]; blade?: string }

export function figureSpec(kind: string, name: string, opts: { role?: string; creature?: string; species?: string; size?: string; looks: Record<string, Look>; party?: { species?: string; name?: string; force?: boolean; blade?: string; gear?: Gear }; player?: boolean; attach?: Attach[]; gear?: Gear; modules?: { name: string; geometry: THREE.BufferGeometry }[] }): FigureSpec {
  const { role = "", creature = "", size = "", looks, party } = opts;
  const seed = hue(name || kind);
  const machine = constructKind(name);
  if (machine) return { key: `con:${machine}`, build: (k) => buildConstruct(k, machine), height: 1.3 };
  if (kind === "astromech" || kind === "battledroid" || kind === "droid") {
    const series = droidKind(name || kind) === "generic" && kind === "astromech" ? "astromech" : droidKind(name || kind) === "generic" && kind === "battledroid" ? "b1" : droidKind(name || kind);
    // The customizations it carries are fixed to its body where each belongs (interiors/anchors.ts moduleAnchor)
    const modules = opts.modules ?? [];
    const build = (k: Kit) => {
      buildDroid(k, series, name);
      modules.forEach((m, i) => {
        const a = moduleAnchor(series, m.name, i);
        k.addModel(m.geometry, { at: a.at, rot: a.rot, scale: a.scale });
      });
    };
    return { key: `droid:${series}:${pickOf(["a", "b", "c", "d", "e", "f"], name)}${modules.length ? `:m${modules.map((m) => m.name).join("+")}` : ""}`, build, height: series === "astromech" || series === "r5" || series === "bb" || series === "mouse" || series === "gonk" || series === "pit" ? 0.8 : 1.25 };
  }
  if (kind === "beast" || kind === "horror") {
    const plan = creaturePlan(name, creature, size);
    return { key: `beast:${plan.plan}:${JSON.stringify(plan)}:${seed % 4}`, build: (k) => buildCreature(k, plan, seed % 4), height: plan.plan === "brute" ? 1.4 : plan.plan === "flyer" && !plan.perch ? 1.3 : 1.0 };
  }
  if (kind === "swarm") {
    const plan = creaturePlan(name.replace(/swarm of /i, ""), creature, "tiny");
    const tiny: Plan = plan.plan === "flyer" ? { ...plan, span: 0.35 } : plan.plan === "critter" ? plan : { plan: "critter", kind: "bug", color: pickOf(NATURAL, name) };
    return {
      key: `swarm:${JSON.stringify(tiny)}`,
      build: (k) => {
        for (let i = 0; i < 6; i++) k.group([Math.sin(i * 2.3) * 0.28, tiny.plan === "flyer" ? -0.6 + (i % 3) * 0.15 : 0, Math.cos(i * 1.7) * 0.28], [0, i * 1.1, 0], 0.45, () => buildCreature(k, tiny, i));
      },
      height: 0.8,
    };
  }
  if (kind === "hutt" || /hutt/i.test(name)) return { key: "beast:hutt", build: (k) => slug(k, { plan: "slug", color: "#7c8a4a", hutt: true }), height: 1.2 };
  if (kind === "crowd") {
    return {
      key: `crowd:${seed % 6}`,
      build: (k) => [[-0.2, -0.12], [0.2, -0.06], [0, 0.2]].forEach(([x, z], i) => k.group([x, 0, z], [0, i * 0.8, 0], 0.72, () => buildHumanoid(k, HUMAN, outfitOf(`${name}${i}`), pickOf(HUMAN_TONES, `${name}${i}`), pickOf(HUMAN.hair, `${name}${i}`), ""))),
      height: 1.0,
    };
  }
  // People (the character is told apart from others who use the Force by `player`)
  const player = opts.player ?? kind === "player";
  const speciesName = ((player ? party?.species : opts.species) ?? speciesInName(name, looks) ?? "human").toLowerCase();
  const look = looks[speciesName] ?? (speciesName === "human" ? HUMAN : lookOf({ name: speciesName }));
  const who = player ? party?.name || "player" : name || role || kind;
  const skin = pickOf(look.skin, who);
  // Fur is rarely white where the species has other colours (a Wookiee is brown or black)
  const furs = look.fur ? look.hair.filter((c) => c !== "#e8e4dc") : [];
  const hair = look.hair.length ? pickOf(furs.length ? furs : look.hair, who, 2) : "";
  const eye = look.eyes.length ? pickOf(look.eyes, who, 4) : "";
  const forceUser = kind === "force" || (player && party?.force);
  const blade = forceUser ? (player ? party?.blade : undefined) ?? (/sith|inquisitor|dark|guard/i.test(name) ? "#ff4040" : "#7fe3ff") : undefined;
  let outfit = player ? outfitOf(forceUser ? who : "player", forceUser ? "jedi" : "player", look, forceUser ? { blade: blade! } : null) : outfitOf(name || kind, kind === "officer" ? "officer" : kind === "trooper" ? `trooper ${role}` : role, look, forceUser && !/inquisitor|guard/i.test(name) ? { blade: blade! } : null);
  // What the character has chosen to wield and wear shows on them (the weapon's pose, the weight of armour)
  // A figure given gear (the gallery's species rows) wears it like the player does
  const gear = opts.gear ?? (player ? party?.gear : undefined);
  if (gear) {
    const hand = handOf(gear.weapons[0]);
    if (hand) outfit = { ...outfit, hand };
    if (gear.bodyClass) outfit = { ...outfit, garment: gear.bodyClass === "light" ? "vest" : "armor", armor: gear.bodyClass === "heavy" ? "#59636d" : "#7b8794", weight: gear.bodyClass, cape: gear.bodyClass === "light" ? outfit.cape : undefined };
  }
  // A suit put on is drawn as one; gloves, boots and a bandolier carried are drawn on the figure (the models are pairs and sashes, which a
  // limb that swings could not carry)
  if (gear) {
    const suit = suitWorn(gear);
    if (suit) {
      const colours = { space: ["#e9edf0", "#d9752b"], hazard: ["#d9b324", "#2b2f36"], diving: ["#2f4a63", "#b9893a"] }[suit];
      outfit = { ...outfit, garment: "flightsuit", top: colours[0], bottom: colours[0], accent: colours[1], head: suit === "space" ? "bubble" : suit === "diving" ? "dive" : "hazmat", suit, pack: true, belt: true, armor: undefined, weight: undefined, cape: undefined };
    }
    const [gloves, boots] = [glovesOf(gear), bootsOf(gear) ?? (suit ? "plain" : undefined)];
    outfit = { ...outfit, ...(gloves || suit ? { gloves: gloves ?? "plain" } : {}), ...(boots ? { boots } : {}), ...(hasBandolier(gear) ? { bandolier: true } : {}) };
  }
  const wants = wantsOf(outfit.hand, gear, role || name, name);
  const attach = opts.attach ?? [];
  const key = `hum:${speciesName}:${skin}:${hair}:${eye}:${outfit.garment}:${outfit.top}:${outfit.bottom}:${outfit.accent}:${outfit.head}:${outfit.hand}:${outfit.blade ?? ""}:${outfit.armor ?? ""}:${outfit.cape ?? ""}:${outfit.weight ?? ""}:${outfit.pack ? 1 : 0}${outfit.bandolier ? 1 : 0}${outfit.belt ? 1 : 0}${outfit.suit ?? ""}${outfit.gloves ?? ""}${outfit.boots ?? ""}:${seed & 28}${attach.length ? `:g${attach.map((a) => `${a.slot}=${a.id}@${a.scale}`).join("+")}` : ""}`;
  return { key, build: (k) => buildHumanoid(k, look, outfit, skin, hair, eye, seed, attach), height: 1.25 * look.scale, wants, blade: outfit.blade };
}

// How far this figure walks: the stride follows how far the group itself moves along the ground between frames, so whoever moves it
// (the party, a follower, a stroller in a street, a fighter) walks without being told (interiors/limbs.ts)
function useStride(group: React.RefObject<THREE.Group>, apply: (stride: ReturnType<typeof standing>, g: THREE.Group) => void) {
  const stride = useRef(standing());
  const last = useRef<THREE.Vector3 | null>(null);
  const here = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(here);
    // Only along the ground: a figure that rises onto a stair or a stage is not striding
    const moved = last.current ? Math.hypot(here.x - last.current.x, here.z - last.current.z) : 0;
    (last.current ??= new THREE.Vector3()).copy(here);
    stride.current = advance(stride.current, moved, Math.min(delta, 0.1));
    apply(stride.current, g);
  });
}

// A person who walks: the same body as `Model` bakes, built with its limbs marked (Kit.animated), drawn with materials of its own that
// swing them by the stride
function Walker({ id, build }: { id: string; build: (k: Kit) => void }) {
  const m = useModel(`${id}:walk`, (k) => { k.animated = true; build(k); });
  const mats = useMemo(() => Object.fromEntries(FINISHES.map((f) => [f, limbMaterial(MATERIALS[f])])) as Record<Finish, THREE.Material>, []);
  useEffect(() => () => { Object.values(mats).forEach((x) => x.dispose()); }, [mats]);
  const group = useRef<THREE.Group>(null);
  useStride(group, (stride, g) => {
    poseLimbs(Object.values(mats), stride);
    g.position.y = bob(stride);
  });
  return (
    <group ref={group}>
      {m.matte && <mesh geometry={m.matte} material={mats.matte} castShadow receiveShadow />}
      {m.sheen && <mesh geometry={m.sheen} material={mats.sheen} castShadow receiveShadow />}
      {m.glow && <mesh geometry={m.glow} material={mats.glow} />}
      {m.glass && <mesh geometry={m.glass} material={mats.glass} renderOrder={1} />}
      {m.haze && <mesh geometry={m.haze} material={mats.haze} renderOrder={2} />}
      {m.cloth && <mesh geometry={m.cloth} material={mats.cloth} castShadow receiveShadow />}
    </group>
  );
}

// Anything else that moves (a droid, a beast, a war machine) has no limbs to swing in its baked body: it bobs and rocks with its stride
function Gait({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useStride(group, (stride, g) => {
    g.position.y = bob(stride) * 1.3;
    g.rotation.z = Math.sin(stride.phase) * stride.amp * 0.04;
  });
  return <group ref={group}>{children}</group>;
}

// Sabers made of a hilt and another blade (a model of the hilt and one of the blade, joined once)
const COMPOSED = new Map<string, THREE.BufferGeometry>();

export function Figure({ kind, ring, name = "", large, marker, species, role, creature, size, player, gear, modules }: { kind: string; ring: string; name?: string; large?: boolean; marker?: boolean; species?: string; role?: string; creature?: string; size?: string; player?: boolean; gear?: Gear; modules?: string[] }) {
  const looks = useSpecies();
  const party = usePartyLook();
  const me = player ?? kind === "player";
  const base = figureSpec(kind, name, { role, creature, species, size, looks, party: me ? party : undefined, player: me, gear });
  // What a person holds, wears and carries is loaded (one set of hooks per kind of model, in its own palette) and baked into the body
  // once it is all in; until then the code's own weapon is in the hand
  const wants = base.wants ?? [];
  const toneOf = (look: KitLook) => { const n = toneNameOf(look); return n ? TONES[n] : undefined; };
  // A saber with a blade shape of its own is two files: the hilt and the blade
  const urlsOf = (w: Want) => [`/assets/${w.model}.glb`, ...(w.blade ? [`/assets/${w.blade.model}.glb`] : [])];
  const loaded = Object.fromEntries((["armour", "kit", "medical", "prosthetic", "weapon", "worn", "plain"] as KitLook[]).map((look) => [look, useModels(wants.filter((w) => w.look === look).flatMap(urlsOf), "centre", toneOf(look))]));
  const geometryOfWant = (w: Want): THREE.BufferGeometry | null => {
    const files = loaded[w.look];
    const hilt = files[`/assets/${w.model}.glb`];
    if (!hilt) return null;
    let made: THREE.BufferGeometry | null | undefined = hilt;
    if (w.blade) {
      const blade = files[`/assets/${w.blade.model}.glb`];
      if (!blade) return null;
      const key = `${w.look}|${w.model}|${w.blade.model}|${w.blade.scale}`;
      made = COMPOSED.get(key);
      if (!made) { made = composeSaber(hilt, w.name!, blade, w.blade.name, w.blade.scale); COMPOSED.set(key, made); }
    }
    // A saber's blade takes its wielder's colour (a Jedi's, a Sith's, the character's own)
    if (base.blade && w.slot === "weapon" && w.name?.startsWith("saber-")) {
      const key = `tint:${base.blade}|${w.look}|${w.model}|${w.blade?.model ?? ""}|${w.blade?.scale ?? 1}`;
      let tinted = COMPOSED.get(key);
      if (!tinted) { tinted = tintGlow(made, base.blade); COMPOSED.set(key, tinted); }
      made = tinted;
    }
    // ... and a soft halo (a paler, wider haze round each blade)
    if (w.slot === "weapon" && w.name?.startsWith("saber-")) {
      const key = `halo:${base.blade ?? ""}|${w.look}|${w.model}|${w.blade?.model ?? ""}|${w.blade?.scale ?? 1}`;
      let haloed = COMPOSED.get(key);
      if (!haloed) { haloed = withHalo(made); COMPOSED.set(key, haloed); }
      made = haloed;
    }
    return made;
  };
  // A droid's customizations (the items fitted to it) are models of the catalogue, loaded and fixed to its body
  const moduleFiles = (modules ?? []).map((n) => { const ref = itemRef(n); const path = ref && !ref.model.includes(":") ? assetPath(ref.model) : undefined; return path && ref ? { name: ref.model, url: `/assets/${path}.glb` } : undefined; }).filter((m): m is { name: string; url: string } => !!m);
  const moduleGeo = useModels(moduleFiles.map((m) => m.url), "centre");
  const modulesReady = moduleFiles.length > 0 && moduleFiles.every((m) => moduleGeo[m.url]);
  const ready = wants.length > 0 && wants.every((w) => geometryOfWant(w));
  const spec = ready
    ? figureSpec(kind, name, { role, creature, species, size, looks, party: me ? party : undefined, player: me, gear, attach: wants.map((w) => ({ id: (w.blade ? `${w.model}+${w.blade.name}x${w.blade.scale}` : w.model) + (base.blade && w.name?.startsWith("saber-") ? `~${base.blade}` : ""), slot: w.slot, scale: w.scale, grip: w.grip, offHand: w.offHand, name: w.name, geometry: geometryOfWant(w)! })) })
    : modulesReady
      ? figureSpec(kind, name, { role, creature, species, size, looks, modules: moduleFiles.map((m) => ({ name: m.name, geometry: moduleGeo[m.url]! })) })
      : base;
  return (
    <group scale={large ? 1.5 : 1}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.34, 0.44, 24]} />
        <meshBasicMaterial color={ring} />
      </mesh>
      {spec.key.startsWith("hum:") ? <Walker id={spec.key} build={spec.build} /> : <Gait><Model id={spec.key} build={spec.build} /></Gait>}
      {marker && (
        <mesh position={[0, Math.max(1.55, spec.height + 0.3), 0]}>
          <octahedronGeometry args={[0.12]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Buildings and settlements as seen from above a settlement or a planet: small models of a few
// units across, by what kind of place each is, in the colour of the world's walls.
// ---------------------------------------------------------------------------------------------

function domeOn(k: Kit, at: V3, r: number, color: string, rim = true) {
  const profile: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * (Math.PI / 2);
    profile.push([Math.cos(t) * r, Math.sin(t) * r * 0.9]);
  }
  k.lathe(profile, color, { at, seg: 24 });
  if (rim) k.torus(r, r * 0.05, shade(color, 0.8), { at: [at[0], at[1] + r * 0.03, at[2]], rot: [Math.PI / 2, 0, 0], seg: [6, 24] });
}
function vaporator(k: Kit, at: V3, h = 2.2) {
  k.lathe([[0.14, 0], [0.1, 0.1], [0.06, h * 0.5], [0.08, h * 0.52], [0.04, h], [0, h + 0.08]], "#d7d2c4", { at, seg: 10, finish: "sheen" });
  for (let i = 0; i < 3; i++) k.box([0.36, 0.03, 0.05], "#d7d2c4", { at: [at[0] + Math.cos(i * 2.1) * 0.1, at[1] + h * 0.72, at[2] + Math.sin(i * 2.1) * 0.1], rot: [0, -i * 2.1, 0], finish: "sheen" });
}
function tower(k: Kit, at: V3, r: number, h: number, color: string) {
  k.lathe([[r * 1.15, 0], [r * 1.15, 0.1], [r, 0.2], [r * 0.9, h], [r * 1.1, h + 0.05], [r * 1.1, h + 0.15], [r * 0.6, h + 0.35], [0, h + 0.5]], color, { at, seg: 18 });
  for (let i = 0; i < 3; i++) k.box([r * 0.5, 0.1, 0.04], "#ffd98a", { at: [at[0] + Math.sin(i * 2.1) * r * 0.93, at[1] + h * 0.6, at[2] + Math.cos(i * 2.1) * r * 0.93], rot: [0, i * 2.1, 0], finish: "glow" });
}
function rocks(k: Kit, list: [number, number, number, string?][]) {
  list.forEach(([x, z, r, c], i) => k.blob(r, c ?? C.rock, { at: [x, r * 0.55, z], seed: i * 3 + 1, rough: 0.32, squash: [1, 0.8, 1] }));
}
function hullWreck(k: Kit, color = "#8b9299") {
  k.group([0, 0.4, 0], [0.25, 0.5, 0.2], undefined, () => {
    hullAlongX(k, [[0.2, -1.4], [0.65, -1.2], [0.72, 0], [0.6, 1.0], [0.2, 1.5], [0, 1.55]], color, { at: [0, 0.2, 0] });
    k.box([1.2, 0.08, 0.9], "#59636d", { at: [0.2, 0.6, 0.9], rot: [0.4, 0, 0], round: 0.03 });
    k.box([0.5, 0.3, 0.5], "#2b2b2b", { at: [-0.6, 0.0, -0.4], round: 0.05 });
  });
}

export function BuildingModel({ type, wall }: { type: string; wall: string }) {
  return <Model id={`bldg:${type}:${wall}`} build={(k) => buildBuilding(k, type, wall)} />;
}

function buildBuilding(k: Kit, type: string, wall: string) {
  const trim = shade(wall, 0.75);
  if (/cantina/.test(type)) {
    // A great dome with smaller ones round it, an arched way in under a lit sign, vaporators
    domeOn(k, [0, 0, 0], 1.5, wall);
    domeOn(k, [1.35, 0, 0.75], 0.8, wall);
    domeOn(k, [-1.1, 0, 0.9], 0.6, wall);
    const arch = archShape(0.7, 0.9);
    k.extrude(arch, 0.5, "#3a2c20", { at: [0, 0, 1.15] });
    k.box([0.6, 0.14, 0.06], C.glow, { at: [0, 1.05, 1.42], round: 0.03, finish: "glow" });
    vaporator(k, [-1.3, 0, -0.9]);
    return;
  }
  if (/spaceport|landing|docking|speeder platform/.test(type)) {
    // A round bay sunk into the ground, ringed with lights, a control tower, a ship in it
    k.lathe([[2.4, 0], [2.4, 0.45], [2.2, 0.5], [2.15, 0.12], [0, 0.12]], /docking/.test(type) ? C.steel : wall, { seg: 36 });
    k.cyl(2.12, 0.02, "#2c333b", { at: [0, 0.13, 0], seg: 36 });
    k.torus(1.8, 0.03, C.amber, { at: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0], seg: [4, 40], finish: "glow" });
    for (let i = 0; i < 8; i++) k.sphere(0.07, "#ff5a5a", { at: [Math.cos(i * 0.785) * 2.3, 0.5, Math.sin(i * 0.785) * 2.3], finish: "glow", seg: [6, 4] });
    if (/spaceport|docking/.test(type)) tower(k, [2.2, 0, -2.0], 0.36, 2.4, /docking/.test(type) ? C.steel : wall);
    k.group([0, 0.4, 0], [0, 0.6, 0], 0.5, () => buildShip(k, "freighter", false, false, "#b9b1a0"));
    return;
  }
  if (/market|promenade/.test(type)) {
    for (const [x, z, c] of [[-0.9, -0.8, "#c8663a"], [0.9, -0.7, "#e8dcc0"], [-0.8, 0.9, "#4f8a8b"], [0.9, 0.9, "#a1495a"]] as [number, number, string][]) {
      k.box([1.0, 0.6, 0.9], wall, { at: [x, 0.3, z], round: 0.08 });
      k.cyl(0.7, 1.15, c, { at: [x, 0.62, z], rot: [0, 0, Math.PI / 2], arc: Math.PI, start: 0, open: true, seg: 14, finish: "cloth", scale: [0.5, 1, 1] });
    }
    return;
  }
  if (/garrison|command post|operations|gate/.test(type)) {
    if (/gate/.test(type)) {
      const gate = archShape(1.6, 1.6);
      const outer = archShape(2.8, 2.1);
      outer.holes.push(gate);
      k.extrude(outer, 0.8, wall, { at: [0, 0, -0.4], bevel: 0.05 });
      k.box([1.5, 1.3, 0.1], C.amber, { at: [0, 0.65, 0], finish: "glow" });
      return;
    }
    // A low bunker curving up to a gun deck, with turrets, a mast and a lit door
    k.lathe([[2.1, 0], [2.1, 0.15], [1.9, 0.6], [1.6, 1.0], [1.5, 1.1], [0, 1.12]], "#59636d", { seg: 28, finish: "sheen" });
    k.lathe([[0.9, 1.1], [0.9, 1.5], [0.7, 1.75], [0, 1.78]], "#4a545f", { seg: 20, finish: "sheen" });
    for (const [x, z, r] of [[-1.2, 1.0, 0], [1.2, -1.0, Math.PI]]) {
      k.sphere(0.3, "#2f363d", { at: [x, 1.1, z], half: true, finish: "sheen" });
      k.cyl(0.05, 0.8, "#2f363d", { at: [x + Math.sin(r) * 0.4, 1.2, z + Math.cos(r) * 0.4], rot: [Math.PI / 2, 0, 0], seg: 8 });
    }
    vaporator(k, [0.3, 1.75, 0.2], 1.4);
    k.extrude(archShape(0.8, 0.9), 0.3, C.red, { at: [0, 0, 1.85], finish: "glow" });
    return;
  }
  if (/medcenter/.test(type)) {
    upright(k, planRect(2.8, 2.0, 0.6), 1.5, "#e9edf0", { bevel: 0.06 });
    domeOn(k, [0, 1.5, 0], 0.85, "#e9edf0");
    upright(k, planRect(2.84, 2.04, 0.62), 0.2, C.glow, { y: 0.9, finish: "glow" });
    return;
  }
  if (/workshop|engineering/.test(type)) {
    const color = /engineering/.test(type) ? C.steel : wall;
    upright(k, planRect(2.6, 2.0, 0.3), 1.1, color, { bevel: 0.05 });
    k.cyl(1.0, 2.6, shade(color, 0.85), { at: [0, 1.1, 0], rot: [0, 0, Math.PI / 2], arc: Math.PI, start: 0, seg: 16, scale: [0.6, 1, 1] });
    k.cyl(0.5, 1.4, "#59636d", { at: [1.7, 0.7, 0.5], seg: 16, finish: "sheen" });
    k.cyl(0.2, 1.0, "#3b3f45", { at: [-0.8, 2.0, -0.5], seg: 12, finish: "sheen" });
    k.extrude(archShape(1.0, 0.9), 0.06, C.amber, { at: [0, 0, 1.0], finish: "glow" });
    return;
  }
  if (/residences|habitat/.test(type)) {
    upright(k, planRect(1.6, 1.8, 0.4), 1.2, wall, { at: [-0.6, 0, 0], bevel: 0.05 });
    upright(k, planRect(1.4, 1.4, 0.5), 2.0, wall, { at: [0.8, 0, -0.3], bevel: 0.05 });
    domeOn(k, [0.8, 2.0, -0.3], 0.6, wall);
    domeOn(k, [-0.6, 1.2, 0], 0.5, wall);
    for (let i = 0; i < 3; i++) k.box([0.3, 0.2, 0.05], "#ffd98a", { at: [0.8, 0.5 + i * 0.55, 0.42], round: 0.05, finish: "glow" });
    return;
  }
  if (/palace/.test(type)) {
    k.lathe([[2.3, 0], [2.3, 0.9], [2.2, 1.0], [0, 1.0]], wall, { seg: 32 });
    domeOn(k, [0, 1.0, 0], 1.6, wall);
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) tower(k, [x, 0, z], 0.35, 2.4, wall);
    k.extrude(archShape(0.9, 1.2), 0.4, "#3a2c20", { at: [0, 0, 2.1] });
    k.torus(2.3, 0.06, trim, { at: [0, 0.9, 0], rot: [Math.PI / 2, 0, 0], seg: [6, 40] });
    return;
  }
  if (/estates|manor/.test(type)) {
    // A great house with a tiled roof and a tower, in a walled garden with a gate
    upright(k, planRect(3.4, 3.0, 0.1), 0.32, "#8a8478", { y: 0 });
    upright(k, planRect(3.0, 2.6, 0.1), 0.02, "#5a8a4a", { y: 0.32 });
    upright(k, planRect(1.8, 1.2, 0.2), 0.9, wall, { at: [0, 0, -0.4], y: 0.34, bevel: 0.04 });
    k.cone(1.15, 0.7, "#8a4a3a", { at: [0, 1.58, -0.4], seg: 4, rot: [0, Math.PI / 4, 0] });
    tower(k, [0.95, 0.34, -0.9], 0.22, 1.5, wall);
    for (const [x, z] of [[-1.4, 1.2], [-1.0, 1.25], [1.0, 1.2], [1.4, 1.25]]) k.blob(0.2, "#3f7d3a", { at: [x, 0.5, z], smooth: true, rough: 0.15, seed: x * 3 });
    k.box([0.5, 0.3, 0.08], C.gold, { at: [0, 0.5, 1.5], round: 0.03, finish: "sheen" });
    return;
  }
  if (/junkyard|scrap/.test(type)) {
    // Heaps of scrap, a crane and stacked containers
    rocks(k, [[-1.0, -0.6, 0.9, "#6a5a4a"], [1.0, 0.6, 0.8, "#59636d"], [0.2, 1.1, 0.5, "#7a5a3a"]]);
    for (const [x, z, c, y] of [[-1.5, 1.0, "#a1495a", 0], [-1.5, 1.0, "#4f8a8b", 0.5], [1.7, -0.8, "#c8663a", 0]] as [number, number, string, number][]) k.box([1.0, 0.5, 0.5], c, { at: [x, 0.25 + y, z], round: 0.02 });
    k.cyl(0.06, 2.2, C.steelDark, { at: [0.4, 1.1, -1.0], seg: 8, finish: "sheen" });
    k.rod([0.4, 2.2, -1.0], [1.5, 1.6, -0.4], 0.04, C.amber, { finish: "sheen" });
    k.box([0.18, 0.18, 0.18], C.steelDark, { at: [1.5, 1.4, -0.4], finish: "sheen" });
    return;
  }
  if (/tenements/.test(type)) {
    for (const [x, z, h] of [[-0.9, 0, 2.0], [0.2, -0.3, 2.6], [1.2, 0.2, 1.6]]) {
      upright(k, planRect(0.9, 1.2, 0.1), h, wall, { at: [x, 0, z], bevel: 0.03 });
      for (let i = 0; i < Math.floor(h / 0.5); i++) k.box([0.2, 0.14, 0.04], "#ffd98a", { at: [x, 0.3 + i * 0.5, z + 0.62], round: 0.03, finish: i % 3 ? "matte" : "glow" });
    }
    return;
  }
  if (/warehouse|cargo/.test(type)) {
    k.box([3.2, 1.0, 2.0], C.steel, { at: [0, 0.5, 0], round: 0.06, finish: "sheen" });
    k.cyl(1.0, 3.2, "#59636d", { at: [0, 1.0, 0], rot: [0, 0, Math.PI / 2], arc: Math.PI, start: 0, seg: 18, finish: "sheen" });
    for (let i = 0; i < 5; i++) k.torus(1.0, 0.03, "#3b4148", { at: [-1.4 + i * 0.7, 1.0, 0], rot: [0, Math.PI / 2, 0], arc: Math.PI, seg: [4, 16] });
    k.box([1.6, 0.9, 0.05], "#2f363d", { at: [0, 0.45, 1.02], round: 0.02 });
    crate(k, [2.0, 0, 0.6], [0.6, 0.6, 0.6], C.olive);
    return;
  }
  if (/archive/.test(type)) {
    tower(k, [0, 0, 0], 1.0, 3.0, wall);
    k.lathe([[1.9, 0], [1.9, 0.45], [1.7, 0.5], [0, 0.5]], wall, { seg: 28 });
    return;
  }
  if (/hideout/.test(type)) {
    k.sphere(1.4, "#3b3f45", { at: [0, -0.4, 0], theta: [0, 1.2], seg: [20, 8] });
    k.extrude(archShape(0.7, 0.6), 0.3, C.red, { at: [0, 0, 1.1], finish: "glow" });
    rocks(k, [[-1.8, 0.8, 0.5], [1.6, -0.9, 0.4]]);
    return;
  }
  if (/camp/.test(type)) {
    for (const [x, z, c] of [[-1, -0.5, "#8a6f4a"], [1, -0.3, "#7a6040"], [0, 1.1, "#96794f"]] as [number, number, string][]) k.cone(0.8, 1.2, c, { at: [x, 0.6, z], seg: 9, finish: "cloth" });
    k.blob(0.18, "#ffb347", { at: [0, 0.18, 0], smooth: true, rough: 0.3, seed: 3, squash: [1, 1.6, 1], finish: "glow" });
    return;
  }
  if (/cave/.test(type)) {
    rocks(k, [[0, 0, 1.9], [1.6, 0.8, 0.9, "#5a5753"], [-1.4, 0.6, 0.7]]);
    k.sphere(0.75, "#0a0a0a", { at: [0, 0.4, 1.5], scale: [1, 0.8, 0.5], seg: [12, 10] });
    return;
  }
  if (/ruin/.test(type)) {
    k.box([3.4, 0.2, 2.6], "#6d6a66", { at: [0, 0.1, 0], round: 0.05 });
    for (const [x, z, h] of [[-1.3, -0.9, 2], [1.3, -0.9, 1.1], [-1.3, 0.9, 0.7], [1.3, 0.9, 1.7], [0, -0.9, 1.4]]) {
      k.lathe([[0.3, 0], [0.3, 0.08], [0.24, 0.14], [0.22, h], [0, h]], "#8a8680", { at: [x, 0.2, z], seg: 12 });
      k.blob(0.2, "#8a8680", { at: [x, 0.2 + h, z], seed: x + z, rough: 0.4, squash: [1, 0.5, 1] });
    }
    k.extrude(archShape(1.0, 1.4), 0.3, "#7e7a74", { at: [0, 0.2, -1.05], bevel: 0.04 });
    rocks(k, [[0.3, 0.5, 0.45]]);
    return;
  }
  if (/wreck/.test(type)) {
    hullWreck(k);
    rocks(k, [[1.6, 1, 0.4, "#3a3835"]]);
    return;
  }
  if (/trailhead/.test(type)) {
    k.cyl(0.08, 1.6, "#8a6f4a", { at: [0, 0.8, 0], seg: 8 });
    k.box([0.9, 0.35, 0.06], "#c9a56e", { at: [0.3, 1.3, 0], round: 0.04 });
    rocks(k, [[-0.8, 0.5, 0.45]]);
    return;
  }
  upright(k, planRect(2.4, 2.2, 0.7), 1.4, wall, { bevel: 0.05 });
  domeOn(k, [0, 1.4, 0], 0.8, wall);
}

export function SettlementModel({ type, wall }: { type: string; wall: string }) {
  return <Model id={`town:${type}:${wall}`} build={(k) => buildSettlement(k, type, wall)} />;
}

function buildSettlement(k: Kit, type: string, wall: string) {
  if (/city/.test(type)) {
    // Spires of different heights on a round plaza, lit windows up their sides
    k.cyl(2.3, 0.2, "#3b4654", { at: [0, 0.1, 0], seg: 32 });
    for (const [i, [x, z, h, r]] of ([[0, 0, 3.4, 0.5], [-1.1, 0.6, 2.2, 0.4], [1, -0.6, 2.6, 0.45], [0.9, 1, 1.5, 0.4], [-0.9, -1, 1.8, 0.35]] as const).entries()) tower(k, [x, 0.2, z], r, h, i % 2 ? "#8a94a3" : "#a3adba");
    k.torus(1.2, 0.05, "#59636d", { at: [0, 1.6, 0], rot: [Math.PI / 2, 0, 0], seg: [6, 30], finish: "sheen" });
    return;
  }
  if (/town/.test(type)) {
    domeOn(k, [0, 0, 0], 1.1, wall);
    domeOn(k, [1.4, 0, 0.5], 0.7, wall);
    domeOn(k, [-1.2, 0, 0.8], 0.8, wall);
    upright(k, planRect(1.2, 0.9, 0.3), 0.8, wall, { at: [0.3, 0, -1.3], bevel: 0.04 });
    vaporator(k, [-0.6, 0, -1.2]);
    return;
  }
  if (/outpost/.test(type)) {
    k.lathe([[1.6, 0], [1.6, 0.2], [1.3, 0.9], [1.0, 1.05], [0, 1.08]], "#59636d", { seg: 24, finish: "sheen" });
    vaporator(k, [0, 1.05, 0], 2.0);
    crate(k, [1.9, 0, 0], [0.8, 0.6, 0.8], C.olive);
    k.cyl(0.8, 0.16, "#2c333b", { at: [-2, 0.08, 0.6], seg: 20 });
    return;
  }
  if (/station/.test(type)) {
    k.torus(1.8, 0.28, C.steel, { at: [0, 1.4, 0], rot: [Math.PI / 2.4, 0, 0], seg: [12, 40], finish: "sheen" });
    for (let i = 0; i < 4; i++) k.cyl(0.05, 1.8, "#59636d", { at: [0, 1.4, 0], rot: [Math.PI / 2.4, i * 0.785, Math.PI / 2], seg: 6 });
    k.lathe([[0.3, 0.2], [0.5, 0.5], [0.5, 2.3], [0.3, 2.6], [0, 2.7]], "#a3adba", { seg: 18, finish: "sheen" });
    k.sphere(0.1, "#ff5a5a", { at: [0, 2.75, 0], finish: "glow", seg: [8, 6] });
    return;
  }
  if (/cave/.test(type)) {
    rocks(k, [[0, 0, 1.6], [1.5, 0.5, 1, "#5a5753"], [-1.3, 0.9, 0.8]]);
    k.sphere(0.6, "#0a0a0a", { at: [0.2, 0.4, 1.3], scale: [1, 0.8, 0.5], seg: [12, 10] });
    return;
  }
  if (/ruin/.test(type)) return buildBuilding(k, "ruin", wall);
  if (/crash/.test(type)) {
    hullWreck(k);
    k.box([0.8, 0.2, 0.5], "#59636d", { at: [1.8, 0.1, 1.2], rot: [0, 0.5, 0.2], round: 0.03 });
    k.blob(0.2, "#ffb347", { at: [-1.6, 0.25, -0.5], smooth: true, rough: 0.3, seed: 2, squash: [1, 1.5, 1], finish: "glow" });
    return;
  }
  if (/camp/.test(type)) return buildBuilding(k, "camp", wall);
  domeOn(k, [0, 0, 0], 1.4, wall);
}
