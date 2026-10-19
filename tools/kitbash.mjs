// Takes converted CC0 models apart and builds new ones from the pieces (2026-10-19): the armour, kits, prosthetics and tools that
// no pack has. A model is a list of parts: islands of a converted model (the connected pieces of its mesh: a helmet, a backpack,
// a limb), moved, turned, scaled and recoloured, with plain solids (box, cylinder, cone, sphere) between them. The recipes are in
// tools/kitbash-recipes.mjs; the result is one vertex-coloured mesh per model (and a low-detail one beside it) under the folder the recipe
// names, which assets.test.ts holds to the same rules as a downloaded pack.
// Usage: node tools/kitbash.mjs                   build every model of tools/kitbash-recipes.mjs
//        node tools/kitbash.mjs <name> [...]      build these
//        node tools/kitbash.mjs --list <pack/model>   list a model's islands (index, triangles, box, colour) to write recipes from
import { NodeIO } from "@gltf-transform/core";
import { KHRMaterialsUnlit, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dequantize, dedup, flatten, prune, quantize, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ASSETS = path.join(ROOT, "client/public/assets");
const io = new NodeIO().registerExtensions([KHRMaterialsUnlit, KHRMeshQuantization]);
const quiet = console.warn;
console.warn = () => {};

// A source model as triangles in world units: positions, normals and colours, three vertices each, and its islands
const sources = new Map();
async function source(ref) {
  if (sources.has(ref)) return sources.get(ref);
  const [pack, name] = ref.split("/");
  const file = path.join(ASSETS, `kenney-${pack}`, `${name}.glb`);
  if (!fs.existsSync(file)) throw new Error(`no model ${ref} (${file})`);
  const doc = await io.read(file);
  await doc.transform(dequantize(), flatten());
  const tris = [];
  const m = new THREE.Matrix4();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    m.fromArray(node.getWorldMatrix());
    const normal = new THREE.Matrix3().getNormalMatrix(m);
    for (const prim of mesh.listPrimitives()) {
      const [pos, nor, col, idx] = [prim.getAttribute("POSITION"), prim.getAttribute("NORMAL"), prim.getAttribute("COLOR_0"), prim.getIndices()];
      const count = idx ? idx.getCount() : pos.getCount();
      for (let i = 0; i < count; i += 3) {
        const tri = [];
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx.getScalar(i + k) : i + k;
          const p = new THREE.Vector3(...pos.getElement(v, [])).applyMatrix4(m);
          const n = nor ? new THREE.Vector3(...nor.getElement(v, [])).applyMatrix3(normal).normalize() : new THREE.Vector3(0, 1, 0);
          const c = col ? col.getElement(v, []).slice(0, 3) : [0.6, 0.6, 0.6];
          tri.push({ p, n, c });
        }
        tris.push(tri);
      }
    }
  }
  // Islands: triangles that share a corner (by position) are one piece
  const key = (p) => `${Math.round(p.x * 5000)},${Math.round(p.y * 5000)},${Math.round(p.z * 5000)}`;
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  for (const t of tris) for (const v of t) if (!parent.has(key(v.p))) parent.set(key(v.p), key(v.p));
  for (const t of tris) for (let k = 1; k < 3; k++) parent.set(find(key(t[k].p)), find(key(t[0].p)));
  const order = new Map();
  const islands = [];
  tris.forEach((t, i) => {
    const root = find(key(t[0].p));
    if (!order.has(root)) { order.set(root, islands.length); islands.push({ tris: [] }); }
    islands[order.get(root)].tris.push(i);
  });
  for (const isl of islands) {
    const box = new THREE.Box3();
    const sum = [0, 0, 0];
    for (const i of isl.tris) for (const v of tris[i]) { box.expandByPoint(v.p); for (let c = 0; c < 3; c++) sum[c] += v.c[c]; }
    isl.box = box;
    isl.centre = box.getCenter(new THREE.Vector3());
    isl.colour = sum.map((s) => s / (isl.tris.length * 3));
  }
  const found = { tris, islands };
  sources.set(ref, found);
  return found;
}

const linear = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const rad = (d) => (d * Math.PI) / 180;
const matrixOf = ({ at = [0, 0, 0], rot = [0, 0, 0], scale = 1 }) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(rot[0]), rad(rot[1]), rad(rot[2]), "XYZ")), new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])));

// Plain solids as triangles (counter-clockwise outward)
function solid(part) {
  const tris = [];
  const v = (x, y, z, nx, ny, nz) => ({ p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(nx, ny, nz), c: null });
  const quad = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };
  if (part.box) {
    const [sx, sy, sz] = part.box.map((x) => x / 2);
    for (const [nx, ny, nz, u, w] of [[1, 0, 0, [0, 1, 0], [0, 0, -1]], [-1, 0, 0, [0, 1, 0], [0, 0, 1]], [0, 1, 0, [0, 0, 1], [1, 0, 0]], [0, -1, 0, [0, 0, -1], [1, 0, 0]], [0, 0, 1, [0, 1, 0], [1, 0, 0]], [0, 0, -1, [0, 1, 0], [-1, 0, 0]]]) {
      const corner = (a, b) => v((nx + a * u[0] + b * w[0]) * sx, (ny + a * u[1] + b * w[1]) * sy, (nz + a * u[2] + b * w[2]) * sz, nx, ny, nz);
      // u x w runs along the normal for the faces above
      quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1));
    }
  } else if (part.cyl || part.cone) {
    const [r, h, seg = 12, top = part.cone ? 0 : undefined] = part.cyl || part.cone;
    const r2 = top === undefined ? r : top;
    const ring = (i, y, rr) => [Math.cos((i / seg) * Math.PI * 2) * rr, y, Math.sin((i / seg) * Math.PI * 2) * rr];
    for (let i = 0; i < seg; i++) {
      const [a, b] = [ring(i, -h / 2, r), ring(i + 1, -h / 2, r)];
      const [c, d] = [ring(i + 1, h / 2, r2), ring(i, h / 2, r2)];
      const nA = [Math.cos(((i + 0.5) / seg) * Math.PI * 2), (r - r2) / h, Math.sin(((i + 0.5) / seg) * Math.PI * 2)];
      quad(v(...a, ...nA), v(...d, ...nA), v(...c, ...nA), v(...b, ...nA));
      tris.push([v(0, -h / 2, 0, 0, -1, 0), v(...b, 0, -1, 0), v(...a, 0, -1, 0)]);
      if (r2 > 0) tris.push([v(0, h / 2, 0, 0, 1, 0), v(...d, 0, 1, 0), v(...c, 0, 1, 0)]);
    }
  } else if (part.sphere) {
    const [r, seg = 10] = part.sphere;
    const at = (i, j) => { const a = (i / seg) * Math.PI * 2, b = (j / (seg / 2)) * Math.PI - Math.PI / 2; const n = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]; return v(n[0] * r, n[1] * r, n[2] * r, ...n); };
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg / 2; j++) quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  } else throw new Error(`a part needs from, box, cyl, cone or sphere: ${JSON.stringify(part)}`);
  // Wound to face the way their normals do
  for (const t of tris) {
    const geometric = new THREE.Vector3().subVectors(t[1].p, t[0].p).cross(new THREE.Vector3().subVectors(t[2].p, t[0].p));
    if (geometric.dot(t[0].n) < 0) [t[1], t[2]] = [t[2], t[1]];
  }
  return tris;
}

// The triangles one part adds, in the model's frame
async function partTriangles(part) {
  let tris;
  if (part.from) {
    const src = await source(part.from);
    let pick = part.islands ?? "all";
    if (pick === "all") pick = src.islands.map((_, i) => i);
    if (part.except) pick = pick.filter((i) => !part.except.includes(i));
    if (part.where) {
      const [lo = [-1e9, -1e9, -1e9], hi = [1e9, 1e9, 1e9]] = [part.where.min, part.where.max];
      pick = pick.filter((i) => { const c = src.islands[i].centre; return [c.x, c.y, c.z].every((x, k) => x >= lo[k] && x <= hi[k]); });
    }
    if (!pick.length) throw new Error(`${part.from}: no island picked`);
    // The parts are set on the model's origin (the middle of the picked islands' base) before they are moved
    const box = new THREE.Box3();
    for (const i of pick) box.union(src.islands[i].box);
    // `origin` is a point of the source to set on the model's origin: "keep" the source's own, or a vector
    const origin = part.origin === "keep" ? new THREE.Vector3() : Array.isArray(part.origin) ? new THREE.Vector3(...part.origin) : new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    tris = pick.flatMap((i) => src.islands[i].tris.map((ti) => src.tris[ti].map((v) => ({ p: v.p.clone().sub(origin), n: v.n.clone(), c: v.c }))));
    // `clip` keeps the triangles whose middle lies in the given ranges ({y: [low, high]}, in that frame): a helmet from a body
    if (part.clip) tris = tris.filter((t) => ["x", "y", "z"].every((a) => { const r = part.clip[a]; if (!r) return true; const m = (t[0].p[a] + t[1].p[a] + t[2].p[a]) / 3; return m >= r[0] && m <= r[1]; }));
    if (!tris.length) throw new Error(`${part.from}: nothing left after the clip`);
  } else tris = solid(part);
  const m = matrixOf(part);
  const normal = new THREE.Matrix3().getNormalMatrix(m);
  const own = part.color ? linear(part.color) : null;
  return tris.map((t) => t.map((v) => ({ p: v.p.clone().applyMatrix4(m), n: v.n.clone().applyMatrix3(normal).normalize(), c: own ?? v.c ?? [0.6, 0.6, 0.6] })));
}

async function build(name, recipe) {
  const all = [];
  for (const part of recipe.parts) all.push(...(await partTriangles(part)));
  // On the floor, middle of the footprint, unless the recipe says otherwise
  const box = new THREE.Box3();
  for (const t of all) for (const v of t) box.expandByPoint(v.p);
  const shift = recipe.origin === "keep" ? new THREE.Vector3() : recipe.origin === "centre" ? box.getCenter(new THREE.Vector3()).negate() : new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const pos = new Float32Array(all.length * 9), nor = new Float32Array(all.length * 9), col = new Float32Array(all.length * 9);
  all.forEach((t, i) => t.forEach((v, k) => {
    const o = i * 9 + k * 3;
    pos.set([v.p.x + shift.x, v.p.y + shift.y, v.p.z + shift.z], o);
    nor.set([v.n.x, v.n.y, v.n.z], o);
    col.set(v.c, o);
  }));
  return { pos, nor, col, size: box.getSize(new THREE.Vector3()) };
}

async function write(dir, name, built, lod) {
  const { Document } = await import("@gltf-transform/core");
  const doc = new Document();
  const buffer = doc.createBuffer();
  const make = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", make("VEC3", built.pos)).setAttribute("COLOR_0", make("VEC3", built.col));
  if (!lod) prim.setAttribute("NORMAL", make("VEC3", built.nor));
  const mesh = doc.createMesh(name).addPrimitive(prim);
  doc.createScene().addChild(doc.createNode(name).setMesh(mesh));
  await doc.transform(weld({ tolerance: lod ? 0.002 : 0.0001 }), dedup(), prune());
  if (lod) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: lod, error: 0.05 }), prune());
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }));
  const target = path.join(dir, lod ? `${name}.lod.glb` : `${name}.glb`);
  await io.write(target, doc);
  return fs.statSync(target).size;
}

const args = process.argv.slice(2);
await MeshoptSimplifier.ready;
if (args[0] === "--list") {
  const src = await source(args[1]);
  quiet(`${args[1]}: ${src.tris.length} triangles, ${src.islands.length} islands`);
  src.islands.forEach((isl, i) => {
    const f = (v) => v.toFixed(2);
    const s = isl.box.getSize(new THREE.Vector3());
    quiet(`  ${String(i).padStart(2)}  ${String(isl.tris.length).padStart(4)} tris  size ${f(s.x)} ${f(s.y)} ${f(s.z)}  centre ${f(isl.centre.x)} ${f(isl.centre.y)} ${f(isl.centre.z)}  colour #${new THREE.Color().setRGB(...isl.colour).getHexString()}`);
  });
} else {
  const recipes = await import("./kitbash-recipes.mjs");
  const dir = path.join(ROOT, recipes.OUT);
  fs.mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const [name, recipe] of Object.entries(recipes.MODELS)) {
    if (args.length && !args.includes(name)) continue;
    const built = await build(name, recipe);
    const bytes = (await write(dir, name, built, 0)) + (await write(dir, name, built, 0.15));
    total += bytes;
    quiet(`${name}: ${built.pos.length / 9} triangles, ${["x", "y", "z"].map((a) => built.size[a].toFixed(2)).join(" x ")}, ${bytes} bytes`);
  }
  quiet(`${(total / 1024).toFixed(0)} KB`);
}
