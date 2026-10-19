// Converts a downloaded CC0 pack model into what the map loads: one mesh with vertex colours and no
// textures (the colour under each vertex's UV is baked into it), quantised and welded, so a piece
// is a few kilobytes. Usage: node tools/convert-assets.mjs <pack-dir> <out-dir> <name[,name...]|all>
// With tone=gunmetal the colours are turned into a ramp of steel (the toy-bright blasters of the Blaster Kit). The pack is read from <pack-dir>/**/GLB format (or GLTF format); the credits are kept in CREDITS.md.
import { NodeIO } from "@gltf-transform/core";
import { KHRMaterialsUnlit, KHRMeshQuantization } from "@gltf-transform/extensions";
import { weld, quantize, prune, dedup, flatten, join, simplify } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

const [pack, out, which = "all", toneArg = ""] = process.argv.slice(2);
const tone = toneArg.replace(/^tone=/, "");
if (!pack || !out) throw new Error("usage: convert-assets.mjs <pack-dir> <out-dir> <names|all>");

const find = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? find(path.join(dir, e.name)) : e.name.endsWith(".glb") ? [path.join(dir, e.name)] : []));
const files = find(pack).filter((f) => which === "all" || which.split(",").includes(path.basename(f, ".glb")));
fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions([KHRMaterialsUnlit, KHRMeshQuantization]);
// Steel: a dark gunmetal at the bottom of the lightness, pale steel at the top (linear colour)
const RAMP = [[0.005, 0.006, 0.008], [0.045, 0.055, 0.068], [0.2, 0.22, 0.25]];
const steel = ([r, g, b]) => {
  const l = Math.min(1, 0.2126 * r + 0.7152 * g + 0.0722 * b);
  const t = Math.min(1, l * 1.6);
  const [a, c, f] = t < 0.5 ? [RAMP[0], RAMP[1], t * 2] : [RAMP[1], RAMP[2], (t - 0.5) * 2];
  return [0, 1, 2].map((i) => a[i] + (c[i] - a[i]) * f);
};
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

const lod = Number(process.env.LOD || 0);
await MeshoptSimplifier.ready;
let total = 0;
for (const file of files) for (const ratio of lod ? [0, lod] : [0]) {
  const doc = await io.read(file);
  await doc.transform(flatten(), join());
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const position = prim.getAttribute("POSITION");
      const uv = prim.getAttribute("TEXCOORD_0");
      const tex = material?.getBaseColorTexture();
      const base = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const color = position.clone().setType("VEC3").setArray(new Float32Array(position.getCount() * 3));
      const png = tex?.getImage() ? PNG.sync.read(Buffer.from(tex.getImage())) : null;
      for (let i = 0; i < position.getCount(); i++) {
        let rgb = [base[0], base[1], base[2]];
        if (png && uv) {
          const [u, v] = uv.getElement(i, []);
          const x = Math.min(png.width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * png.width)));
          const y = Math.min(png.height - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * png.height)));
          const p = (y * png.width + x) * 4;
          rgb = [rgb[0] * srgb(png.data[p] / 255), rgb[1] * srgb(png.data[p + 1] / 255), rgb[2] * srgb(png.data[p + 2] / 255)];
        }
        color.setElement(i, tone === "gunmetal" ? steel(rgb) : rgb);
      }
      prim.setAttribute("COLOR_0", color);
      prim.setAttribute("TEXCOORD_0", null);
      prim.setAttribute("TANGENT", null);
      prim.setMaterial(null);
    }
  }
  const root = doc.getRoot();
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) m.dispose();
  // The low detail is built without normals (the loader works them out): flat-shaded faces have none
  // in common, and the simplifier can only merge what shares its vertices
  if (ratio) for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute("NORMAL", null);
  await doc.transform(weld({ tolerance: ratio ? 0.002 : 0.0001 }), dedup(), prune());
  if (ratio) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.05 }), prune());
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }));
  const target = path.join(out, ratio ? path.basename(file, ".glb") + ".lod.glb" : path.basename(file));
  await io.write(target, doc);
  total += fs.statSync(target).size;
  console.log(path.basename(file), fs.statSync(target).size);
}
console.log(files.length, "models,", (total / 1024).toFixed(0), "KB");
