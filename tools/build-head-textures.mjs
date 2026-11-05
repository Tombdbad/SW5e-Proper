// The texture set of the heads (2026-11-04): client/public/textures/figure/head/{diffuse,normal}.jpg, 2048 x 2048, the atlas tools/blender/build-head.py lays out
// (its CELLS, written to <maps>/atlas.json): the masculine head's map on the top left (1024), the feminine on the top right, and under them in 512 cells the heads with
// a snout (muzzle, long, short, pig, flat). Made from what that script bakes
//   node tools/build-head-textures.mjs [<maps-dir>]     (default tools/refs/cache/head-maps)
// normal: the baked tangent-space normals of the high head (lids, folds, lips, a nose pad and its nostrils) with the fine pores of figure/face laid over them
// 2026-11-05 (the user: "borrow HEAVILY from this image ... duplicated eyebrows, weird expressions"): the people's four heads take their colour from photograph scans (tools/face-scans.mjs:
// the lips, the shade of the nostrils, the flush of the cheeks, the grain of real skin, divided by the skin's own colour, with the eyes and the brows taken out: the head has eyeballs, and
// hair cards for brows, over a soft brow bed painted here); without the reference sheet the painted map of the Blender run is used, as before
// diffuse: a PALE map (the vertex colour, the skin, multiplies it): the painted lips, lids, nostrils, nose pad and mouth line, the baked occlusion, and the
//          mottling of figure/face; mean about 0.9 like the other sets
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { available as scans, facePlane } from "./face-scans.mjs";

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

// The head's face plane at a texel of its cell (the same as build-head.py `paint`: the columns crowd to the front, the rows to the middle, the jaw tapers)
const BX = 0.100, BY = 0.118;
function planeOf(u, v, fem) {
  const t = -Math.PI + 2 * Math.PI * u;
  const a = Math.abs(t) / Math.PI;
  const ph = Math.sign(t) * Math.PI * a * (0.55 + 0.45 * a * a);
  const tt = Math.PI * (1 - v);
  const th = tt + 0.12 * Math.sin(2 * tt);
  const dy = Math.cos(th), dx = Math.sin(th) * Math.sin(ph);
  const l0 = Math.max(0, Math.min(1, (dy + 0.05) / -0.9));
  const low = l0 * l0 * (3 - 2 * l0);
  // (`front`: how far the texel faces forward; the plane is the same for the back of the head, which took the face's lips and nostrils too, 2026-11-05)
  return { x: dx * BX * (1 - (0.24 + 0.06 * fem) * low), y: dy * BY - 0.012 * low, front: smoothstep(-0.05, 0.3, Math.cos(ph)) };
}
// A soft brow bed under where the hair cards lie (build-hair.py BROWS): a slight darkening along the arch, 1 at the middle of it
function bed(x, y) {
  const ax = Math.abs(x);
  const s = (ax - 0.019) / 0.046;
  if (s < -0.1 || s > 1.15) return 0;
  const yb = 0.0395 + 0.0070 * Math.sin(Math.PI * Math.min(1, Math.max(0, s) * 1.1) ** 0.9) - 0.004 * Math.max(0, s) ** 3;
  return Math.exp(-0.5 * ((y - yb) / 0.0042) ** 2) * (1 - smoothstep(0.7, 1.15, s)) * smoothstep(-0.1, 0.2, s);
}
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HUMAN = new Set(["m", "m2", "f", "f2"]);
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
  const tiles = size >= 768 ? (1.7 * size) / 1024 : 1.0;
  const photo = scans && HUMAN.has(name) ? await facePlane(name) : null;
  const fem = name.startsWith("f") ? 1 : 0;
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
      // (a person's head: the photograph's colour, a bed under the brows, the occlusion lighter (the photograph has its own shading), a lighter mottle)
      let ratio = null;
      let shade = 0.82 + 0.18 * occ, grain = 0.55 + 0.45 * mottle;
      if (photo) {
        const p = planeOf((x + 0.5) / size, 1 - (y + 0.5) / size, fem);
        ratio = (photo.at(p.x, p.y) ?? [1, 1, 1]).map((r) => 1 + (r - 1) * p.front);
        const b = 1 - 0.16 * bed(p.x, p.y) * p.front;
        ratio = ratio.map((r) => r * b * 0.93);
        shade = 0.95 + 0.05 * occ;
        grain = 0.82 + 0.18 * mottle;
      }
      for (let c = 0; c < 3; c++) {
        const val = (ratio ? ratio[c] : color[i + c] / 255) * shade * grain;
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
