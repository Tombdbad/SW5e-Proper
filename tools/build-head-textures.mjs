// The texture set of the head (2026-11-04): client/public/textures/figure/head/{diffuse,normal}.jpg, 2048 x 1024, the masculine head's map on
// the left half and the feminine's on the right (the atlas tools/blender/build-head.py lays out). Made from what that script bakes
//   node tools/build-head-textures.mjs [<maps-dir>]     (default tools/refs/cache/head-maps)
// normal: the baked tangent-space normals of the high head (lids, folds, lips) with the fine pores of figure/face laid over them
// diffuse: a PALE map (the vertex colour, the skin, multiplies it): the painted lips, lids, nostrils and mouth line, the baked occlusion, and
//          the mottling of figure/face; mean about 0.9 like the other sets
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAPS = path.resolve(process.argv[2] ?? "tools/refs/cache/head-maps");
const OUT = path.resolve("client/public/textures/figure/head");
const FACE = path.resolve("client/public/textures/figure/face");
const N = 1024;

const raw = async (file, channels = 3, size = N) => {
  const { data, info } = await sharp(file).resize(size, size, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== channels) throw new Error(`${file}: ${info.channels} channels`);
  return data;
};
const poreNormal = await raw(path.join(FACE, "normal.jpg"), 3, 512);
const poreLight = await raw(path.join(FACE, "diffuse.jpg"), 3, 512);
// Pores: one tile of the face set across about 1.4 of the face's width on the map (the face set is made for a tile of 0.2 m; the face is 0.17 m wide and fills 0.6 of the map)
const TILES = 1.7;
const pore = (buf, x, y, c) => buf[(((Math.floor((y * TILES * 512) / N) % 512) * 512) + (Math.floor((x * TILES * 512) / N) % 512)) * 3 + c];

const atlasN = Buffer.alloc(2 * N * N * 3);
const atlasD = Buffer.alloc(2 * N * N * 3);
let sumD = 0;
for (const [half, v] of [[0, "m"], [1, "f"]]) {
  const normal = await raw(path.join(MAPS, `head_${v}_normal.png`));
  const ao = await raw(path.join(MAPS, `head_${v}_ao.png`));
  const color = await raw(path.join(MAPS, `head_${v}_color.png`));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 3;
      const o = (y * 2 * N + half * N + x) * 3;
      // the normal: the baked one, the pores' slopes added, made unit again
      const bx = normal[i] / 127.5 - 1, by = normal[i + 1] / 127.5 - 1, bz = normal[i + 2] / 127.5 - 1;
      const px = pore(poreNormal, x, y, 0) / 127.5 - 1, py = pore(poreNormal, x, y, 1) / 127.5 - 1;
      let nx = bx + 0.75 * px, ny = by + 0.75 * py, nz = bz;
      const l = Math.hypot(nx, ny, nz) || 1;
      atlasN[o] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      atlasN[o + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
      atlasN[o + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
      // the light: the baked occlusion made stronger (what is a little dark is a good deal darker), the pores' mottling, the painted colour
      const occ = Math.max(0, Math.min(1, 1 - (1 - ao[i] / 255) * 3));
      const mottle = pore(poreLight, x, y, 1) / 255 / 0.9;
      for (let c = 0; c < 3; c++) {
        const val = (color[i + c] / 255) * (0.62 + 0.38 * occ) * (0.55 + 0.45 * mottle);
        atlasD[o + c] = Math.max(0, Math.min(255, Math.round(val * 255)));
        sumD += atlasD[o + c];
      }
    }
  }
}
// (brought to a mean of about 0.9 over the face's own pixels; the back of the head is plain)
const mean = sumD / (atlasD.length * 255);
const gain = Math.min(1.25, 0.9 / mean);
for (let i = 0; i < atlasD.length; i++) atlasD[i] = Math.min(255, Math.round(atlasD[i] * gain));
fs.mkdirSync(OUT, { recursive: true });
await sharp(atlasN, { raw: { width: 2 * N, height: N, channels: 3 } }).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toFile(path.join(OUT, "normal.jpg"));
await sharp(atlasD, { raw: { width: 2 * N, height: N, channels: 3 } }).jpeg({ quality: 90 }).toFile(path.join(OUT, "diffuse.jpg"));
console.log("ok head textures, mean", mean.toFixed(3), "gain", gain.toFixed(3));
