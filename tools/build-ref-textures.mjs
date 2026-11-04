// The detail maps of the figures, from scans (2026-11-04; the user: "refactor the characters to AAA game standards ... reference images ... build
// textures and normal-maps"). A figure's finish is a PALE detail map that the vertex colour is multiplied by (see build-figure-textures.mjs),
// so one set serves every cloth colour and skin tone. The noise-made sets are soft; these are made from photographed materials instead
// (Poly Haven, CC0, the same source as the walls and the hulls: tools/fetch-polyhaven.mjs), reduced to what a figure needs:
//   diffuse.jpg  the scan's light and dark only: colour taken out, the large light and shade divided out (a fold of the cloth in the photograph
//                must not repeat on every sleeve), brought to a mean of about 0.9 so that `lift` in models.tsx MATERIALS still applies
//   normal.jpg   the scan's own normal map (OpenGL, +y up), made smaller and kept to unit length
//   height.jpg   the scan's displacement, made smaller
// The sets and what they are made from are in `tools/refs/figure-sets.json`; the raw scans are kept in tools/refs/cache (not committed:
// run this and they are fetched again).
//
//   node tools/build-ref-textures.mjs            (every set in the file)
//   node tools/build-ref-textures.mjs fabric     (one)
//
// Costume snips (tools/refs/snips.json: a source image, a rectangle) are for what a scan cannot give: the colour grade of a costume and its
// markings. They are not used for detail: a still from a film is a few hundred pixels across and carries its own lighting.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("client/public/textures/figure");
const CACHE = path.resolve("tools/refs/cache");
const SETS = JSON.parse(fs.readFileSync(path.resolve("tools/refs/figure-sets.json"), "utf8"));
const wanted = process.argv.slice(2);

const get = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};
// Poly Haven's files for a slug at 1K: the diffuse, the OpenGL normal and the displacement
async function scan(slug) {
  const dir = path.join(CACHE, slug);
  const have = (n) => path.join(dir, `${n}.jpg`);
  if (["diffuse", "normal", "height"].every((n) => fs.existsSync(have(n)))) return dir;
  fs.mkdirSync(dir, { recursive: true });
  const files = await (await fetch(`https://api.polyhaven.com/files/${slug}`)).json();
  for (const [name, key] of Object.entries({ diffuse: "Diffuse", normal: "nor_gl", height: "Displacement" })) {
    const url = files[key]?.["1k"]?.jpg?.url;
    if (!url) throw new Error(`${slug} has no 1k jpg ${key}`);
    fs.writeFileSync(have(name), await get(url));
  }
  return dir;
}

// Grey light and dark of a diffuse map, the large shade divided out
async function paleDetail(file, size, o) {
  const { data, info } = await sharp(file).resize(size, size, { fit: "cover", kernel: "lanczos3" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const flat = new Float32Array(n);
  for (let i = 0; i < n; i++) flat[i] = data[i] / 255;
  // (the large shade: the picture blurred to a tenth of its width, wrapped round the edges so that the result still tiles)
  const blurred = await blurWrapped(flat, info.width, Math.max(2, Math.round(size / 10)));
  let sum = 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ratio = flat[i] / Math.max(0.04, blurred[i]);
    out[i] = 1 + (ratio - 1) * (o.contrast ?? 1);
    sum += out[i];
  }
  const mean = sum / n;
  const target = o.mean ?? 0.9;
  const px = Buffer.alloc(n);
  for (let i = 0; i < n; i++) px[i] = Math.max(0, Math.min(255, Math.round((out[i] / mean) * target * 255)));
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 1 } });
}
// A blur that wraps: the picture is tiled three by three, blurred and cut out again
async function blurWrapped(values, size, sigma) {
  const S = size * 3;
  const big = Buffer.alloc(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) big[y * S + x] = Math.round(values[(y % size) * size + (x % size)] * 255);
  const b = await sharp(big, { raw: { width: S, height: S, channels: 1 } }).blur(sigma).extract({ left: size, top: size, width: size, height: size }).raw().toBuffer();
  return Float32Array.from(b, (v) => v / 255);
}
// A normal map made smaller: its vectors are made unit length again, and the strength the set asks for is applied
async function normalMap(file, size, strength) {
  const { data, info } = await sharp(file).resize(size, size, { fit: "cover", kernel: "lanczos3" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    let x = (data[i] / 255) * 2 - 1, y = (data[i + 1] / 255) * 2 - 1, z = (data[i + 2] / 255) * 2 - 1;
    x *= strength; y *= strength;
    const l = Math.hypot(x, y, z) || 1;
    out[i] = Math.round(((x / l) * 0.5 + 0.5) * 255);
    out[i + 1] = Math.round(((y / l) * 0.5 + 0.5) * 255);
    out[i + 2] = Math.round(((z / l) * 0.5 + 0.5) * 255);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}

for (const [name, o] of Object.entries(SETS)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const size = o.size ?? 512;
  const dir = await scan(o.scan);
  const to = path.join(OUT, name);
  fs.mkdirSync(to, { recursive: true });
  await (await paleDetail(path.join(dir, "diffuse.jpg"), size, o)).jpeg({ quality: 88 }).toFile(path.join(to, "diffuse.jpg"));
  await (await normalMap(path.join(dir, "normal.jpg"), size, o.strength ?? 1)).jpeg({ quality: 92 }).toFile(path.join(to, "normal.jpg"));
  await sharp(path.join(dir, "height.jpg")).resize(size, size, { fit: "cover" }).greyscale().jpeg({ quality: 85 }).toFile(path.join(to, "height.jpg"));
  console.log("ok", name, "<-", o.scan);
}
