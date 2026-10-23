// Downloads Poly Haven (CC0) textures at 1K into client/public/textures/<group>/<slug>/ as diffuse.jpg, normal.jpg (OpenGL, `nor_gl`)
// and height.jpg (`Displacement`). Usage: node tools/fetch-polyhaven.mjs <group> <slug> [<slug> ...]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "public", "textures");
const [group, ...slugs] = process.argv.slice(2);
if (!group || !slugs.length) throw new Error("usage: node tools/fetch-polyhaven.mjs <group> <slug> [<slug> ...]");

const MAPS = { diffuse: "Diffuse", normal: "nor_gl", height: "Displacement" };
const get = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
};

for (const slug of slugs) {
  const files = await (await get(`https://api.polyhaven.com/files/${slug}`)).json();
  const dir = path.join(root, group, slug);
  await mkdir(dir, { recursive: true });
  for (const [name, key] of Object.entries(MAPS)) {
    const url = files[key]?.["1k"]?.jpg?.url;
    if (!url) throw new Error(`${slug} has no 1k jpg ${key}`);
    await writeFile(path.join(dir, `${name}.jpg`), Buffer.from(await (await get(url)).arrayBuffer()));
  }
  console.log("ok", group, slug);
}
