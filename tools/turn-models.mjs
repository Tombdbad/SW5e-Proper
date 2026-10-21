// Turns models half a turn about the upright axis (x and z negated), in place, by turning the nodes under the scene: for a pack whose
// models point the wrong way. The loader bakes node transforms into the vertices (interiors/assets.ts geometryOf), so nothing else changes.
// Usage: node tools/turn-models.mjs <dir> <name,name,...>     (names without ".glb"; each also turns its ".lod.glb")
// Run it once for a file: a second run turns it back. 2026-10-21: the Blaster Kit's eighteen blasters (kenney-blaster/blaster-a..r) came
// with their barrels to -z, where the game holds, hangs and aims every weapon with the barrel to +z (checked on renders: the grips rake back
// toward +z); they were turned with `node tools/turn-models.mjs client/public/assets/kenney-blaster blaster-a,blaster-b,...,blaster-r`.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import fs from "node:fs";
import path from "node:path";

const [dir, names] = process.argv.slice(2);
if (!dir || !names) throw new Error("usage: turn-models.mjs <dir> <name,name,...>");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const name of names.split(",")) {
  for (const file of [`${name}.glb`, `${name}.lod.glb`]) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    const doc = await io.read(full);
    for (const scene of doc.getRoot().listScenes()) {
      for (const node of scene.listChildren()) {
        const [x, y, z, w] = node.getRotation();
        // (0,1,0,0) * (x,y,z,w) = (w*0 + 0*x + 1*z - 0*y, w*1 + 0*y + 0*z - 0*x ... ) written out below
        node.setRotation([z, w, -x, -y]);
        const [tx, ty, tz] = node.getTranslation();
        node.setTranslation([-tx, ty, -tz]);
      }
    }
    await io.write(full, doc);
    console.log("turned", file);
  }
}
