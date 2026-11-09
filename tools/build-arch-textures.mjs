// Builds the two texture sets of the modular building kit that the Poly Haven sets in client/public/textures/wall do not cover (2026-11-09), each tileable
// at 512 and written as diffuse.jpg, normal.jpg (OpenGL, green up) and height.jpg, as the Poly Haven ones are:
//   wall/adobe_plaster   rough-cast plaster of the desert's houses: trowel swirls, pits, sun-bleached streaks (the plain plaster set is too smooth for Tatooine)
//   wall/copper_patina   standing-seam copper gone green (Theed's domes and roofs): seams every half square, hammered dimples, brown copper showing at the ridges
// Both are drawn here from noise, so they carry no licence (CC0, original). The kit repeats a map once in 2 squares (surfaces.tsx WALL_TILE).
// Usage: node tools/build-arch-textures.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "public", "textures", "wall");
const S = 512;
const N = S * S;
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Periodic value noise with `fx` by `fy` cells across the tile, 0..1
function noise(fx, fy, seed) {
  const r = rng(seed);
  const g = Float32Array.from({ length: fx * fy }, () => r());
  const out = new Float32Array(N);
  for (let y = 0; y < S; y++) {
    const v = (y / S) * fy, iy = Math.floor(v), ty = smooth(v - iy);
    for (let x = 0; x < S; x++) {
      const u = (x / S) * fx, ix = Math.floor(u), tx = smooth(u - ix);
      const at = (i, j) => g[(j % fy) * fx + (i % fx)];
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
      out[y * S + x] = a + (b - a) * ty;
    }
  }
  return out;
}
function fbm(fx, fy, octaves, seed) {
  const out = new Float32Array(N);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = noise(fx * 2 ** o, fy * 2 ** o, seed + o * 17);
    for (let i = 0; i < N; i++) out[i] += n[i] * amp;
    total += amp;
    amp /= 2;
  }
  for (let i = 0; i < N; i++) out[i] /= total;
  return out;
}
const wrap = (v) => ((v % S) + S) % S;
// A normal map (OpenGL: +y up in the picture's green channel) from a height map; `strength` is how steep a unit of height reads
function normalOf(h, strength) {
  const out = Buffer.alloc(N * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h[y * S + wrap(x + 1)] - h[y * S + wrap(x - 1)]) * strength;
    const dy = (h[wrap(y + 1) * S + x] - h[wrap(y - 1) * S + x]) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * S + x) * 3;
    out[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
    out[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255); // (rows run down the picture: green up is the height falling toward larger y)
    out[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
  }
  return out;
}
async function save(dir, rgb, height, strength) {
  await mkdir(path.join(root, dir), { recursive: true });
  const col = Buffer.alloc(N * 3), hm = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { col[i * 3 + k] = Math.round(clamp(rgb[k][i]) * 255); hm[i * 3 + k] = Math.round(clamp(height[i]) * 255); }
  const raw = { raw: { width: S, height: S, channels: 3 } };
  await sharp(col, raw).jpeg({ quality: 90 }).toFile(path.join(root, dir, "diffuse.jpg"));
  await sharp(hm, raw).jpeg({ quality: 92 }).toFile(path.join(root, dir, "height.jpg"));
  await sharp(normalOf(height, strength), raw).jpeg({ quality: 92 }).toFile(path.join(root, dir, "normal.jpg"));
  console.log("wrote wall/" + dir);
}

// ---- adobe plaster -------------------------------------------------------------------------------------------------------------
{
  const swirl = fbm(5, 5, 4, 11), grain = fbm(48, 48, 2, 21), mid = fbm(14, 14, 3, 31), streak = fbm(10, 2, 3, 41), pits = new Float32Array(N);
  const r = rng(7);
  for (let n = 0; n < 380; n++) {
    const cx = r() * S, cy = r() * S, rad = 1.5 + r() * 3.2;
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d < 1) pits[wrap(y) * S + wrap(x)] = Math.max(pits[wrap(y) * S + wrap(x)], 1 - d * d);
    }
  }
  const h = new Float32Array(N);
  for (let i = 0; i < N; i++) h[i] = clamp(0.5 + (swirl[i] - 0.5) * 0.5 + (mid[i] - 0.5) * 0.28 + (grain[i] - 0.5) * 0.22 - pits[i] * 0.3);
  const base = [0.88, 0.8, 0.66], dark = [0.68, 0.58, 0.44], bleach = [0.95, 0.9, 0.8];
  const rgb = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let i = 0; i < N; i++) {
    let c = mixc(base, dark, clamp((0.55 - h[i]) * 2.2));
    c = mixc(c, bleach, clamp((streak[i] - 0.5) * 1.6));
    const v = 0.9 + (grain[i] - 0.5) * 0.18 - pits[i] * 0.22;
    for (let k = 0; k < 3; k++) rgb[k][i] = c[k] * v;
  }
  await save("adobe_plaster", rgb, h, 2.6);
}

// ---- copper patina (standing seams) ----------------------------------------------------------------------------------------------
{
  const blot = fbm(7, 7, 4, 51), fine = fbm(36, 36, 3, 61), run = fbm(14, 2, 3, 71);
  const h = new Float32Array(N);
  const SEAMS = 4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const t = ((x / S) * SEAMS) % 1;
    const seam = Math.exp(-Math.pow((t < 0.5 ? t : 1 - t) * 24, 2));
    const dimple = Math.sin((x / S) * Math.PI * 2 * 22) * Math.sin((y / S) * Math.PI * 2 * 22) * 0.5 + 0.5;
    h[i] = clamp(0.42 + seam * 0.42 + (fine[i] - 0.5) * 0.18 + dimple * 0.05);
  }
  const teal = [0.34, 0.63, 0.53], deep = [0.16, 0.38, 0.33], copper = [0.5, 0.3, 0.19];
  const rgb = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let i = 0; i < N; i++) {
    let c = mixc(teal, deep, clamp((blot[i] - 0.45) * 2.4));
    // brown copper shows where the seams are raised and where the rain runs
    c = mixc(c, copper, clamp((h[i] - 0.74) * 5) * 0.7 + clamp((run[i] - 0.62) * 3) * 0.45);
    const v = 0.92 + (fine[i] - 0.5) * 0.2;
    for (let k = 0; k < 3; k++) rgb[k][i] = c[k] * v;
  }
  await save("copper_patina", rgb, h, 3.0);
}
