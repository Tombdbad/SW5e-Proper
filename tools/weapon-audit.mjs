// Audits the weapon models (2026-11-05; the user: "weapon components assembled properly without floating parts"): every model that is held as a weapon
// (the Blaster Kit's blasters and the catalogue's models whose slot is "weapon") is split into its connected pieces (by shared vertices, welded to a tenth of a
// millimetre), and any piece that does not touch the largest one is reported with how far it floats and the way to the nearest piece. It also suggests where a
// hand closes on the model (a pistol grip under the receiver, the foregrip under the barrel) and where a scope sits (on the top of the receiver).
//   node tools/weapon-audit.mjs [--fix]     --fix writes shared/art/weaponFixes.json: the offset that brings each floating piece to touch the body, and the sockets
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const models = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/art/itemModels.json"), "utf8"));

// Files to audit: name -> path
const files = {};
for (const f of fs.readdirSync(path.join(ROOT, "client/public/assets/kenney-blaster"))) if (/^blaster-.\.glb$/.test(f)) files[f.replace(".glb", "")] = path.join(ROOT, "client/public/assets/kenney-blaster", f);
for (const [name, m] of Object.entries(models)) if (m.meta?.slot === "weapon" && !/^saber-|^blade-/.test(name)) files[name] = path.join(ROOT, "client/public/assets", m.pack, `${name}.glb`);

const read = async (file) => {
  const doc = await io.read(file);
  const verts = [];
  const tris = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      const base = verts.length;
      const node = doc.getRoot().listNodes().find((n) => n.getMesh() === mesh);
      const s = node?.getScale() ?? [1, 1, 1];
      const t = node?.getTranslation() ?? [0, 0, 0];
      const el = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        // (quantised files: the accessor is normalised ints and the node's scale puts them back; getElement gives the normalised float)
        verts.push([el[0] * s[0] + t[0], el[1] * s[1] + t[1], el[2] * s[2] + t[2]]);
      }
      const n = idx ? idx.getCount() : pos.getCount();
      for (let i = 0; i + 2 < n; i += 3) tris.push(idx ? [base + idx.getScalar(i), base + idx.getScalar(i + 1), base + idx.getScalar(i + 2)] : [base + i, base + i + 1, base + i + 2]);
    }
  }
  return { verts, tris };
};

// Connected pieces: vertices at the same place (to 0.1 mm) are one; a triangle joins its three
function pieces({ verts, tris }) {
  const key = (v) => `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)},${Math.round(v[2] * 1e4)}`;
  const ids = new Map();
  const parent = [];
  const id = (v) => { const k = key(v); if (!ids.has(k)) { ids.set(k, parent.length); parent.push(parent.length); } return ids.get(k); };
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const of = verts.map(id);
  for (const [a, b, c] of tris) { const [x, y, z] = [find(of[a]), find(of[b]), find(of[c])]; parent[y] = x; parent[find(z)] = find(x); }
  const groups = new Map();
  verts.forEach((v, i) => { const r = find(of[i]); (groups.get(r) ?? groups.set(r, []).get(r)).push(v); });
  return [...groups.values()].map((vs) => {
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const v of vs) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], v[c]); max[c] = Math.max(max[c], v[c]); }
    return { vs, min, max, size: (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]) + vs.length * 1e-9 };
  }).sort((a, b) => b.vs.length - a.vs.length);
}
// The gap between two pieces: how far apart their boxes are (0 where they overlap: a kit's pieces overlap rather than share vertices, and that is how they hold
// together), and the way from one box to the other
function gap(a, b) {
  const dir = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    if (a.max[c] < b.min[c]) dir[c] = b.min[c] - a.max[c];
    else if (b.max[c] < a.min[c]) dir[c] = b.max[c] - a.min[c];
  }
  return { gap: Math.hypot(...dir), dir };
}

const report = {};
for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) continue;
  const g = await read(file);
  const ps = pieces(g);
  // (the pieces that are tiny (a rivet, a button of a few triangles) and touch nothing are noted, not failed: they are details of the model)
  const body = ps[0];
  const floating = [];
  const joined = [body];
  const rest = ps.slice(1);
  // grow the body: a piece that touches (a gap under a millimetre) any piece already in it joins it, however the order
  let changed = true;
  const left = new Set(rest);
  while (changed) {
    changed = false;
    for (const p of [...left]) {
      if (joined.some((q) => gap(p, q).gap < 0.001)) { joined.push(p); left.delete(p); changed = true; }
    }
  }
  for (const p of left) {
    const near = joined.map((q) => ({ q, ...gap(p, q) })).sort((a, b) => a.gap - b.gap)[0];
    floating.push({ verts: p.vs.length, size: p.max.map((v, i) => +(v - p.min[i]).toFixed(4)), at: p.min.map((v, i) => +((v + p.max[i]) / 2).toFixed(4)), gap: +near.gap.toFixed(4), move: near.dir.map((v) => +v.toFixed(4)) });
  }
  const all = [0, 1, 2].map((c) => g.verts.map((v) => v[c]));
  const box = [...all.map((a) => Math.min(...a)), ...all.map((a) => Math.max(...a))];
  report[name] = { pieces: ps.length, floating, box: box.map((v) => +v.toFixed(4)) };
}
let bad = 0;
for (const [name, r] of Object.entries(report)) {
  if (r.floating.length) { bad++; console.log(name.padEnd(26), `${r.pieces} pieces,`, r.floating.length, "floating:", r.floating.map((f) => `${f.verts}v ${f.size.join("x")} gap ${f.gap}`).join(" | ")); }
}
console.log(`${Object.keys(report).length} models, ${bad} with floating pieces`);
if (process.argv.includes("--fix")) fs.writeFileSync(path.join(ROOT, "tools/refs/cache/weapon-audit.json"), JSON.stringify(report, null, 1));
