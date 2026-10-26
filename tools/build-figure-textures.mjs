// The textures of the figures (2026-10-26, asked by the user: "textures and normal maps for character facial features, skin, clothing,
// armour etc.; give hairy creatures a more realistic look"). Made here from noise, not downloaded (CC0, this project's own): each set in
// client/public/textures/figure/<set>/ has diffuse.jpg (a pale detail map the vertex colour is multiplied by, so one set serves every
// skin tone, cloth colour and plate), normal.jpg (OpenGL, +y up) and height.jpg. Every map tiles. `fur/strands.png` is the density map of
// the shell fur (models.tsx FurShells): each texel a hair, its brightness how far up the shells it reaches.
//
//   node tools/build-figure-textures.mjs            (all sets)
//   node tools/build-figure-textures.mjs skin fur   (some)
//
// The sets: skin (pores, fine creases, a mottle), face (finer pores, for heads), fabric (a twill weave), leather (pebbled grain and
// creases), plate (armour: hammered dents, scratches, a brushed grain), scales (overlapping scales of a reptile's hide), fur (strands
// along the hair, for the base of a furry body under its shells).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SIZE = 512;
const OUT = path.resolve("client/public/textures/figure");

// ---- Tiling noise -------------------------------------------------------------------------------------------------------------------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
// Gradient noise that repeats every `period` cells
function periodicNoise(seed) {
  const r = rng(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i).sort(() => r() - 0.5);
  const grads = Array.from({ length: 256 }, () => { const a = r() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; });
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const g = (ix, iy) => grads[perm[(perm[((ix % period) + period) % period % 256] + ((iy % period) + period) % period) % 256]];
    const dot = (ix, iy, dx, dy) => { const [gx, gy] = g(ix, iy); return gx * dx + gy * dy; };
    const u = fade(xf), v = fade(yf);
    const a = dot(xi, yi, xf, yf), b = dot(xi + 1, yi, xf - 1, yf), c = dot(xi, yi + 1, xf, yf - 1), d = dot(xi + 1, yi + 1, xf - 1, yf - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 0.7071 + 0.5;
  };
}
// Fractal noise over [0,1)^2 that tiles: `base` cells across at the first octave
function fbm(noise, u, v, base, octaves, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = base;
  for (let o = 0; o < octaves; o++) {
    sum += noise(u * f, v * f, f) * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}
// Cellular noise that tiles: distances to the nearest and second-nearest of `cells` x `cells` jittered points
function worley(seed, cells) {
  const r = rng(seed);
  const pts = Array.from({ length: cells * cells }, () => [r(), r()]);
  return (u, v) => {
    const cx = Math.floor(u * cells), cy = Math.floor(v * cells);
    let f1 = 9, f2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iy = cy + dy;
      const p = pts[(((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells)];
      const px = (ix + p[0]) / cells, py = (iy + p[1]) / cells;
      const d = Math.hypot(u - px, v - py) * cells;
      if (d < f1) { f2 = f1; f1 = d; id = (((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells); }
      else if (d < f2) f2 = d;
    }
    return { f1, f2, id };
  };
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---- The sets: each gives the height (0..1) and the diffuse brightness (and an optional tint) of a texel ---------------------------
const SETS = {
  skin: () => {
    const n = periodicNoise(11), pores = worley(12, 96), creases = periodicNoise(13);
    return (u, v) => {
      const p = pores(u, v);
      const pore = 1 - smooth(0.0, 0.35, p.f1);
      const crease = Math.abs(fbm(creases, u, v, 6, 3) - 0.5) < 0.012 ? 0.6 : 0;
      const mottle = fbm(n, u, v, 4, 4);
      const h = 0.62 - pore * 0.3 - crease * 0.18 + (mottle - 0.5) * 0.12;
      return { h, d: 0.9 + (mottle - 0.5) * 0.16 - pore * 0.05 };
    };
  },
  face: () => {
    const n = periodicNoise(21), pores = worley(22, 160);
    return (u, v) => {
      const p = pores(u, v);
      const pore = 1 - smooth(0.0, 0.3, p.f1);
      const m = fbm(n, u, v, 5, 4);
      return { h: 0.6 - pore * 0.22 + (m - 0.5) * 0.08, d: 0.93 + (m - 0.5) * 0.1 - pore * 0.03 };
    };
  },
  fabric: () => {
    const n = periodicNoise(31);
    const threads = 64;
    return (u, v) => {
      // A twill: the weft passes over two warps and under two, stepping one along each row
      const x = u * threads, y = v * threads;
      const col = Math.floor(x), row = Math.floor(y);
      const over = ((col + row) % 4 + 4) % 4 < 2;
      const fx = x - col, fy = y - row;
      const across = over ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
      const fuzz = fbm(n, u, v, 32, 3);
      const h = 0.35 + across * 0.45 + (fuzz - 0.5) * 0.15;
      return { h, d: 0.82 + across * 0.12 + (fuzz - 0.5) * 0.12 };
    };
  },
  leather: () => {
    const grain = worley(41, 48), n = periodicNoise(42), creases = periodicNoise(43);
    return (u, v) => {
      const g = grain(u, v);
      const pebble = smooth(0.0, 0.08, g.f2 - g.f1);
      const crease = 1 - smooth(0, 0.01, Math.abs(fbm(creases, u, v, 5, 3) - 0.5));
      const m = fbm(n, u, v, 6, 4);
      return { h: 0.3 + pebble * 0.5 - crease * 0.15 + (m - 0.5) * 0.1, d: 0.82 + pebble * 0.08 - crease * 0.06 + (m - 0.5) * 0.12 };
    };
  },
  plate: () => {
    const dents = periodicNoise(51), brush = periodicNoise(52), r = rng(53);
    // Scratches: short straight lines at random
    const scratches = Array.from({ length: 140 }, () => { const a = r() * Math.PI; return { x: r(), y: r(), dx: Math.cos(a), dy: Math.sin(a), len: 0.02 + r() * 0.12, w: 0.0008 + r() * 0.0012 }; });
    return (u, v) => {
      let s = 0;
      for (const k of scratches) {
        for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
          const px = u + ox - k.x, py = v + oy - k.y;
          const along = px * k.dx + py * k.dy;
          if (along < 0 || along > k.len) continue;
          const off = Math.abs(px * -k.dy + py * k.dx);
          if (off < k.w) s = Math.max(s, 1 - off / k.w);
        }
      }
      const dent = fbm(dents, u, v, 3, 4);
      const grain = fbm(brush, u * 16, v, 64, 2);
      return { h: 0.55 + (dent - 0.5) * 0.45 - s * 0.35 + (grain - 0.5) * 0.05, d: 0.9 + (grain - 0.5) * 0.12 + s * 0.15 - (dent - 0.5) * 0.08 };
    };
  },
  scales: () => {
    const n = periodicNoise(61);
    const rows = 24;
    return (u, v) => {
      // Rows of rounded scales, each row offset by half a scale and overlapping the one below
      const y = v * rows;
      const row = Math.floor(y);
      const x = u * rows + (row % 2) * 0.5;
      const fx = x - Math.floor(x) - 0.5, fy = y - row;
      const d = Math.hypot(fx * 1.1, (fy - 0.15) * 0.9);
      const scale = clamp(1 - d / 0.62);
      const edge = smooth(0.0, 0.12, scale);
      const m = fbm(n, u, v, 8, 3);
      return { h: 0.25 + Math.sqrt(scale) * 0.6 + (m - 0.5) * 0.08, d: 0.75 + edge * 0.2 + (m - 0.5) * 0.15 };
    };
  },
  fur: () => {
    const n = periodicNoise(71), streak = periodicNoise(72);
    return (u, v) => {
      // Strands running down the texture (along v): noise stretched along them
      const s = fbm(streak, u * 1, v * 1, 48, 3);
      const strand = fbm(streak, u, v * 0.125, 64, 2);
      const clump = fbm(n, u, v, 6, 3);
      return { h: 0.3 + strand * 0.5 + (clump - 0.5) * 0.2, d: 0.7 + strand * 0.25 + (s - 0.5) * 0.1 + (clump - 0.5) * 0.15 };
    };
  },
};

// The normal map of a height field (OpenGL: green up), `steep` how hard it reads
function normals(height, size, steep) {
  const out = Buffer.alloc(size * size * 3);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * steep;
    const dy = (at(x, y + 1) - at(x, y - 1)) * steep;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 3;
    out[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
    out[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
    out[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
  }
  return out;
}
const STEEP = { skin: 3, face: 2.5, fabric: 5, leather: 4, plate: 4, scales: 4.5, fur: 4 };

async function build(name) {
  const texel = SETS[name]();
  const height = new Float32Array(SIZE * SIZE);
  const diffuse = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const { h, d } = texel(x / SIZE, y / SIZE);
    height[y * SIZE + x] = clamp(h);
    const g = Math.round(clamp(d) * 255);
    diffuse.set([g, g, g], (y * SIZE + x) * 3);
  }
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  const raw = (buf, channels) => sharp(buf, { raw: { width: SIZE, height: SIZE, channels } });
  const h8 = Buffer.from(Array.from(height, (h) => Math.round(h * 255)));
  await raw(diffuse, 3).jpeg({ quality: 88 }).toFile(path.join(dir, "diffuse.jpg"));
  await raw(normals(height, SIZE, STEEP[name] * SIZE / 256), 3).jpeg({ quality: 92 }).toFile(path.join(dir, "normal.jpg"));
  await raw(h8, 1).jpeg({ quality: 88 }).toFile(path.join(dir, "height.jpg"));
  console.log(`figure/${name}: diffuse, normal, height`);
}

// The shell fur's strands: a hair in each of many cells, its brightness how far up it reaches (0 none); tiles
async function strands() {
  const size = 256;
  const cells = worley(81, 128);
  const r = rng(82);
  const reach = Array.from({ length: 128 * 128 }, () => 0.45 + r() * 0.55);
  const buf = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = cells(x / size, y / size);
    // A hair is thickest at its root: the cell's middle carries it, its edge is bare
    const thick = clamp(1 - c.f1 / 0.55);
    buf[y * size + x] = Math.round(clamp(thick * 1.4) * reach[c.id] * 255);
  }
  fs.mkdirSync(path.join(OUT, "fur"), { recursive: true });
  await sharp(buf, { raw: { width: size, height: size, channels: 1 } }).png().toFile(path.join(OUT, "fur", "strands.png"));
  console.log("figure/fur: strands");
}

const asked = process.argv.slice(2);
for (const name of asked.length ? asked.filter((n) => SETS[n]) : Object.keys(SETS)) await build(name);
if (!asked.length || asked.includes("fur")) await strands();
