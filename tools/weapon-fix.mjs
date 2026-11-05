// Brings the floating pieces of weapon models to rest on their bodies (2026-11-05; see tools/weapon-audit.mjs, which names them). A piece that does not touch
// the rest, by less than 2 cm, is moved along the shortest way to it until it just sinks into it (half a millimetre of overlap), in the model's own file and in
// its low-detail file. Chains and flails keep their links apart (they hang from each other; the audit lists them, and they are meant to).
//   node tools/weapon-fix.mjs [name,name...]     (the models the audit names, by default)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const models = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/art/itemModels.json"), "utf8"));
const names = (process.argv[2] ?? "bowcaster,bolt-thrower,heavy-bowcaster,shotgun-axe").split(",");
const MAX = 0.02;

async function fix(file) {
  const doc = await io.read(file);
  const items = [];   // { prim, index, p: world position }
  for (const mesh of doc.getRoot().listMeshes()) {
    const node = doc.getRoot().listNodes().find((n) => n.getMesh() === mesh);
    const s = node?.getScale() ?? [1, 1, 1];
    const t = node?.getTranslation() ?? [0, 0, 0];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      const base = items.length;
      const el = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, el); items.push({ pos, i, s, t, p: [el[0] * s[0] + t[0], el[1] * s[1] + t[1], el[2] * s[2] + t[2]] }); }
      prim._base = base;
      prim._idx = idx;
      prim._n = idx ? idx.getCount() : pos.getCount();
    }
  }
  // connected pieces by shared positions
  const key = (v) => `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)},${Math.round(v[2] * 1e4)}`;
  const ids = new Map();
  const parent = [];
  const id = (v) => { const k = key(v); if (!ids.has(k)) { ids.set(k, parent.length); parent.push(parent.length); } return ids.get(k); };
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const of = items.map((it) => id(it.p));
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    for (let i = 0; i + 2 < prim._n; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => prim._base + (prim._idx ? prim._idx.getScalar(i + k) : i + k));
      const r = find(of[a]);
      parent[find(of[b])] = r;
      parent[find(of[c])] = r;
    }
  }
  const groups = new Map();
  items.forEach((it, i) => { const r = find(of[i]); (groups.get(r) ?? groups.set(r, []).get(r)).push(i); });
  const pieces = [...groups.values()].map((list) => {
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const i of list) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], items[i].p[c]); max[c] = Math.max(max[c], items[i].p[c]); }
    return { list, min, max };
  }).sort((a, b) => b.list.length - a.list.length);
  const gap = (a, b) => { const d = [0, 0, 0]; for (let c = 0; c < 3; c++) { if (a.max[c] < b.min[c]) d[c] = b.min[c] - a.max[c]; else if (b.max[c] < a.min[c]) d[c] = b.max[c] - a.min[c]; } return { g: Math.hypot(...d), d }; };
  const joined = [pieces[0]];
  const left = new Set(pieces.slice(1));
  for (let again = true; again;) {
    again = false;
    for (const p of [...left]) if (joined.some((q) => gap(p, q).g < 0.0005)) { joined.push(p); left.delete(p); again = true; }
  }
  let moved = 0;
  for (const p of [...left].sort((a, b) => b.list.length - a.list.length)) {
    const near = joined.map((q) => gap(p, q)).sort((a, b) => a.g - b.g)[0];
    if (near.g > MAX) continue;
    // (the box gap is an upper bound of the way in: sink it 0.5 mm into the body along the same way)
    const len = near.g || 1;
    const delta = near.d.map((v) => v + (v / len) * 0.0005);
    for (const i of p.list) { const it = items[i]; it.moved = delta; }
    for (let c = 0; c < 3; c++) { p.min[c] += delta[c]; p.max[c] += delta[c]; }
    joined.push(p);
    moved++;
  }
  for (const it of items) {
    if (!it.moved) continue;
    const el = [0, 0, 0];
    it.pos.getElement(it.i, el);
    for (let c = 0; c < 3; c++) el[c] += it.moved[c] / it.s[c];
    it.pos.setElement(it.i, el);
  }
  if (moved) await io.write(file, doc);
  return { moved, left: left.size - moved };
}

for (const name of names) {
  const m = models[name];
  if (!m) { console.log(name, "not in the catalogue"); continue; }
  const dir = path.join(ROOT, "client/public/assets", m.pack);
  for (const f of [`${name}.glb`, `${name}.lod.glb`]) {
    const file = path.join(dir, f);
    if (!fs.existsSync(file)) continue;
    const r = await fix(file);
    console.log(f.padEnd(28), "moved", r.moved, "pieces; left apart", r.left);
  }
}
