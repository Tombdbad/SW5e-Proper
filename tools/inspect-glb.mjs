// Prints what is in a glb: its nodes, material names, triangles and bounding box (in the file's own units).
// Usage: node tools/inspect-glb.mjs <file.glb> [...]
import { NodeIO, getBounds } from "@gltf-transform/core";
import { KHRMaterialsUnlit, KHRMeshQuantization, KHRTextureTransform } from "@gltf-transform/extensions";
import path from "node:path";
const io = new NodeIO().registerExtensions([KHRMaterialsUnlit, KHRMeshQuantization, KHRTextureTransform]);
const log = console.warn;
console.warn = () => {};
for (const f of process.argv.slice(2)) {
  const d = await io.read(f);
  const r = d.getRoot();
  const b = getBounds(d.getRoot().listScenes()[0]);
  const fmt = (v) => v.map((x) => x.toFixed(2)).join(",");
  const tris = r.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((c, p) => c + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  log(path.basename(f), `size ${fmt(b.max.map((x, i) => x - b.min[i]))} min ${fmt(b.min)} max ${fmt(b.max)} tris ${tris} mats ${r.listMaterials().map((m) => m.getName()).join(",")}`);
}
