// The texture set of the heads (2026-11-04): client/public/textures/figure/head/{diffuse,normal}.jpg, 2048 x 2048, the atlas tools/blender/build-head.py lays out
// (its CELLS, written to <maps>/atlas.json): the masculine head's map on the top left (1024), the feminine on the top right, and under them in 512 cells the heads with
// a snout (muzzle, long, short, pig, flat). Made from what that script bakes
//   node tools/build-head-textures.mjs [<maps-dir>]     (default tools/refs/cache/head-maps)
// normal: the baked tangent-space normals of the high head (lids, folds, lips, a nose pad and its nostrils) with the fine pores of figure/face laid over them
// diffuse: a PALE map (the vertex colour, the skin, multiplies it): the painted lips, lids, nostrils, nose pad and mouth line, the baked occlusion, and the
//          mottling of figure/face; mean about 0.9 like the other sets
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAPS = path.resolve(process.argv[2] ?? "tools/refs/cache/head-maps");
const OUT = path.resolve("client/public/textures/figure/head");
const FACE = path.resolve("client/public/textures/figure/face");
const A = 2048;
const atlas = JSON.parse(fs.readFileSync(path.join(MAPS, "atlas.json"), "utf8"));

const raw = async (file, size, channels = 3) => {
  const { data, info } = await sharp(file).resize(size, size, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== channels) throw new Error(`${file}: ${info.channels} channels`);
  return data;
};
const poreNormal = await raw(path.join(FACE, "normal.jpg"), 512);
const poreLight = await raw(path.join(FACE, "diffuse.jpg"), 512);
// Pores: tiles of the face set (made for 0.2 m) across a cell: 1.7 across a head's, 1 across a snout's (a smaller map of a smaller face)
const pore = (buf, x, y, size, tiles, c) => buf[(((Math.floor((y * tiles * 512) / size) % 512) * 512) + (Math.floor((x * tiles * 512) / size) % 512)) * 3 + c];

const atlasN = Buffer.alloc(A * A * 3, 0);
const atlasD = Buffer.alloc(A * A * 3, 0);
// (the rest of the atlas, where no head is: flat normals and a mid pale)
for (let i = 0; i < A * A; i++) { atlasN[i * 3] = 128; atlasN[i * 3 + 1] = 128; atlasN[i * 3 + 2] = 255; atlasD[i * 3] = atlasD[i * 3 + 1] = atlasD[i * 3 + 2] = 230; }
let sumD = 0, countD = 0;
for (const [name, { cell, size }] of Object.entries(atlas)) {
  const [u0, v0, du, dv] = cell;
  const normal = await raw(path.join(MAPS, `head_${name}_normal.png`), size);
  const ao = await raw(path.join(MAPS, `head_${name}_ao.png`), size);
  const color = await raw(path.join(MAPS, `head_${name}_color.png`), size);
  const tiles = size >= 1024 ? 1.7 : 1.0;
  // the cell's place in the picture: u to the right, v up from the bottom
  const px0 = Math.round(u0 * A), py0 = Math.round((1 - v0 - dv) * A);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const o = ((py0 + y) * A + px0 + x) * 3;
      const bx = normal[i] / 127.5 - 1, by = normal[i + 1] / 127.5 - 1, bz = normal[i + 2] / 127.5 - 1;
      const sx = pore(poreNormal, x, y, size, tiles, 0) / 127.5 - 1, sy = pore(poreNormal, x, y, size, tiles, 1) / 127.5 - 1;
      const nx = bx + 0.75 * sx, ny = by + 0.75 * sy, nz = bz;
      const l = Math.hypot(nx, ny, nz) || 1;
      atlasN[o] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      atlasN[o + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
      atlasN[o + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
      const occ = Math.max(0, Math.min(1, 1 - (1 - ao[i] / 255) * 1.5));
      const mottle = pore(poreLight, x, y, size, tiles, 1) / 255 / 0.9;
      for (let c = 0; c < 3; c++) {
        const val = (color[i + c] / 255) * (0.82 + 0.18 * occ) * (0.55 + 0.45 * mottle);
        atlasD[o + c] = Math.max(0, Math.min(255, Math.round(val * 255)));
        sumD += atlasD[o + c];
        countD++;
      }
    }
  }
}
// (brought to a mean of about 0.9 over the heads' own pixels)
const mean = sumD / (countD * 255);
const gain = Math.min(1.25, 0.9 / mean);
for (let i = 0; i < atlasD.length; i++) atlasD[i] = Math.min(255, Math.round(atlasD[i] * gain));
fs.mkdirSync(OUT, { recursive: true });
await sharp(atlasN, { raw: { width: A, height: A, channels: 3 } }).jpeg({ quality: 85, chromaSubsampling: "4:4:4" }).toFile(path.join(OUT, "normal.jpg"));
await sharp(atlasD, { raw: { width: A, height: A, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(OUT, "diffuse.jpg"));
console.log("ok head textures", Object.keys(atlas).join(" "), "mean", mean.toFixed(3), "gain", gain.toFixed(3));
