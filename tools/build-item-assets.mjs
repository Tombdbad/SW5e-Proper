// Turns the item models built in Blender (the `blender-sw5e` skill; staged outside the repo) into what the map loads, and writes
// the catalogue the code reads. Usage:
//   node tools/build-item-assets.mjs <staged-dir> [name,name...]
// <staged-dir> holds one folder per group (sabers, armour, ...), each with <name>.glb, <name>.lod.glb and <name>.rig.json, and the
// two indexes INDEX.json and INDEX_ENHANCED.json (item name -> model) made by the skill's tools.
//
// What a file becomes (like tools/convert-assets.mjs, but keeping what the figures and animation need):
//   - one mesh, vertex colours (a material's base colour, or a texture's colour under each vertex baked in), quantised and welded;
//   - `_MARK` per vertex, two bytes: [finish, part]. The finish is 0 sheen (metal), 1 matte, 2 glow (an emissive material), 3 cloth, so a
//     model's lights and screens glow and its metal shines when the Kit draws it (interiors/assets.ts reads it). The part says which of
//     the model's named parts the vertex belongs to; each part's pivot (a node's origin) is kept in the catalogue, so a blade, a bow limb
//     or a flail head can be moved about its hinge later without splitting the mesh;
//   - the low-detail file has no normals and one part (it is drawn small).
// Output: client/public/assets/sw5e-<pack>/<name>.glb + .lod.glb + License.txt, shared/art/itemModels.json (the catalogue) and
// shared/art/itemIndex.json (every item of the rules data that has a model, and which).
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, quantize, prune, dedup } from "@gltf-transform/functions";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [staged, only] = process.argv.slice(2);
if (!staged) throw new Error("usage: build-item-assets.mjs <staged-dir> [names]");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "client/public/assets");
const wanted = only ? new Set(only.split(",")) : null;

// Staged group -> pack folder. One pack per group keeps each under the budget and says what is in it
const PACKS = {
  sabers: "sw5e-sabers", blades: "sw5e-blades", gear: "sw5e-hybrids", weapons2: "sw5e-weapons", worn: "sw5e-worn", instruments: "sw5e-instruments",
  props: "sw5e-props", suits: "sw5e-suits", consumables: "sw5e-ordnance", gaps: "sw5e-devices", armour: "sw5e-armour", droid: "sw5e-droid", mods: "sw5e-mods", misc2: "sw5e-gear",
};
const FINISH = { sheen: 0, matte: 1, glow: 2, cloth: 3 };
const CLOTH = /cloth|fabric|fold|blanket|bag|cord|hood|robe|sash|weave|strap|rope|sack/i;
// Part names that mean "this is meant to move": their pivots go in the catalogue
const ANIMATED_SLOTS = new Set(["weapon", "saber-blade", "shield", "weapon-accessory", "thrown"]);
const ANIMATED_GROUPS = new Set(["sabers", "blades", "weapons2", "instruments"]);

const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
io.setLogger({ debug() {}, info() {}, warn() {}, error: console.error });

function finishOf(material) {
  if (!material) return FINISH.matte;
  const e = material.getEmissiveFactor?.() ?? [0, 0, 0];
  if (Math.max(...e) > 0.05) return FINISH.glow;
  if (CLOTH.test(material.getName())) return FINISH.cloth;
  return (material.getMetallicFactor?.() ?? 0) >= 0.45 ? FINISH.sheen : FINISH.matte;
}

// The model as plain arrays in one frame: node transforms applied, a colour, a finish and a part for every vertex
function flatten(doc, lod) {
  const pos = [], nor = [], col = [], fin = [], part = [], idx = [];
  const parts = [];
  let base = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const name = node.getName() || mesh.getName();
    let pi = parts.findIndex((p) => p.name === name);
    if (pi < 0) { pi = parts.length; parts.push({ name, pivot: node.getWorldTranslation().map((v) => +v.toFixed(4)) }); }
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const p = prim.getAttribute("POSITION");
      const n = prim.getAttribute("NORMAL");
      const uv = prim.getAttribute("TEXCOORD_0");
      const vc = prim.getAttribute("COLOR_0");
      const material = prim.getMaterial();
      const baseColor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const tex = material?.getBaseColorTexture();
      const png = tex?.getImage() ? PNG.sync.read(Buffer.from(tex.getImage())) : null;
      const finish = finishOf(material);
      const count = p.getCount();
      const v = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        p.getElement(i, v);
        pos.push(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]);
        if (n) {
          n.getElement(i, v);
          const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2], y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2], z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2];
          const l = Math.hypot(x, y, z) || 1;
          nor.push(x / l, y / l, z / l);
        } else nor.push(0, 1, 0);
        let rgb = [baseColor[0], baseColor[1], baseColor[2]];
        if (png && uv) {
          const [u, w] = uv.getElement(i, []);
          const px = Math.min(png.width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * png.width)));
          const py = Math.min(png.height - 1, Math.max(0, Math.floor((((w % 1) + 1) % 1) * png.height)));
          const o = (py * png.width + px) * 4;
          rgb = [rgb[0] * srgb(png.data[o] / 255), rgb[1] * srgb(png.data[o + 1] / 255), rgb[2] * srgb(png.data[o + 2] / 255)];
        }
        if (vc) { vc.getElement(i, v); rgb = [rgb[0] * v[0], rgb[1] * v[1], rgb[2] * v[2]]; }
        col.push(rgb[0], rgb[1], rgb[2]);
        fin.push(finish);
        part.push(lod ? 0 : pi);
      }
      const ind = prim.getIndices();
      if (ind) for (let i = 0; i < ind.getCount(); i++) idx.push(base + ind.getScalar(i));
      else for (let i = 0; i < count; i++) idx.push(base + i);
      base += count;
    }
  }
  return { pos, nor, col, fin, part, idx, parts };
}

async function write(model, target, lod) {
  const out = new Document();
  const buffer = out.createBuffer();
  const acc = (type, array) => out.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = out.createPrimitive()
    .setAttribute("POSITION", acc("VEC3", new Float32Array(model.pos)))
    .setAttribute("COLOR_0", acc("VEC3", new Float32Array(model.col)))
    .setAttribute("_MARK", acc("VEC2", Uint8Array.from(model.fin.flatMap((f, i) => [f, model.part[i]]))))
    .setIndices(acc("SCALAR", new Uint32Array(model.idx)));
  if (!lod) prim.setAttribute("NORMAL", acc("VEC3", new Float32Array(model.nor)));
  const mesh = out.createMesh("m").addPrimitive(prim);
  out.createScene().addChild(out.createNode("m").setMesh(mesh));
  await out.transform(weld({ tolerance: lod ? 0.002 : 0.0001 }), dedup(), prune());
  await out.transform(quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8, pattern: /^(POSITION|NORMAL|COLOR_0)$/ }));
  await io.write(target, out);
  return fs.statSync(target).size;
}

const trianglesOf = (model) => model.idx.length / 3;
const boxOf = (pos) => {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], pos[i + c]); hi[c] = Math.max(hi[c], pos[i + c]); }
  return [...lo, ...hi].map((v) => +v.toFixed(4));
};

const catalogue = {};
const sizes = {};
let n = 0;
for (const [group, pack] of Object.entries(PACKS)) {
  const dir = path.join(staged, "built", group);
  if (!fs.existsSync(dir)) continue;
  const out = path.join(ASSETS, pack);
  fs.mkdirSync(out, { recursive: true });
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".glb") && !f.endsWith(".lod.glb")).sort()) {
    const name = path.basename(file, ".glb");
    if (wanted && !wanted.has(name)) continue;
    if (catalogue[name]) throw new Error(`two models called ${name} (${catalogue[name].pack} and ${pack})`);
    const rigFile = path.join(dir, `${name}.rig.json`);
    const rig = fs.existsSync(rigFile) ? JSON.parse(fs.readFileSync(rigFile, "utf8")) : { meta: {}, sockets: {} };
    const model = flatten(await io.read(path.join(dir, file)), false);
    const bytes = await write(model, path.join(out, file), false);
    const lodFile = path.join(dir, `${name}.lod.glb`);
    let lodTris = 0;
    if (fs.existsSync(lodFile)) {
      const low = flatten(await io.read(lodFile), true);
      lodTris = trianglesOf(low);
      await write(low, path.join(out, `${name}.lod.glb`), true);
    }
    const animated = ANIMATED_GROUPS.has(group) || ANIMATED_SLOTS.has(rig.meta?.slot);
    catalogue[name] = {
      pack,
      tris: trianglesOf(model),
      lodTris,
      box: boxOf(model.pos),
      ...(Object.keys(rig.sockets ?? {}).length ? { sockets: rig.sockets } : {}),
      ...(animated && model.parts.length > 1 ? { parts: model.parts } : {}),
      meta: rig.meta ?? {},
    };
    sizes[pack] = (sizes[pack] ?? 0) + bytes + (lodTris ? fs.statSync(path.join(out, `${name}.lod.glb`)).size : 0);
    n++;
  }
  fs.writeFileSync(path.join(out, "License.txt"), [
    `\t${pack}`,
    "",
    "\tItem models made for this project in Blender, from primitives and from pieces of CC0 packs: Kenney (www.kenney.nl:",
    "\tSurvival Kit, Food Kit, Pirate Kit) and Quaternius (quaternius.com: LowPoly Medieval Weapons). Converted by tools/build-item-assets.mjs.",
    "",
    "\t\t\t------------------------------",
    "",
    "\tLicense: (Creative Commons Zero, CC0)",
    "\thttp://creativecommons.org/publicdomain/zero/1.0/",
    "",
  ].join("\n"));
}

// The catalogue and the index. Existing entries stay when only some models are rebuilt
const artDir = path.join(ROOT, "shared/art");
const modelsFile = path.join(artDir, "itemModels.json");
const previous = wanted && fs.existsSync(modelsFile) ? JSON.parse(fs.readFileSync(modelsFile, "utf8")) : {};
const merged = { ...previous, ...catalogue };
fs.writeFileSync(modelsFile, JSON.stringify(merged));

// itemIndex.json: item name -> model name (a string), or [model, extras]: extras say the blade, the scale of it, the grade, a chassis
const base = JSON.parse(fs.readFileSync(path.join(staged, "INDEX.json"), "utf8"));
const enhanced = JSON.parse(fs.readFileSync(path.join(staged, "INDEX_ENHANCED.json"), "utf8"));
const index = {};
for (const [name, v] of Object.entries({ ...enhanced, ...base })) {
  if (!v.model) continue;
  const extra = {};
  if (v.blade) extra.blade = v.blade;
  if (v.bladeScale && v.bladeScale !== 1) extra.bladeScale = v.bladeScale;
  if (v.grade) extra.grade = v.grade;
  if (v.chassis) extra.chassis = 1;
  index[name] = Object.keys(extra).length ? [v.model, extra] : v.model;
}
fs.writeFileSync(path.join(artDir, "itemIndex.json"), JSON.stringify(index));
console.log(`${n} models in ${Object.keys(sizes).length} packs;`, Object.entries(sizes).map(([p, b]) => `${p} ${(b / 1048576).toFixed(2)} MB`).join(", "));
console.log(`catalogue ${Object.keys(merged).length} models, index ${Object.keys(index).length} items`);
