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
// creases), shell (white armour plates), plate (armour: hammered dents, scratches, a brushed grain), scales (overlapping scales of a reptile's hide), fur (strands
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
  // (2026-10-30, the user: "extend and enhance the textures/normal-maps for character faces/skin/clothing/armour/humanoid droids + prosthetics
  // and cybernetics": skin has a cross-hatch of fine lines as well as pores and creases, a face finer lines and a blush under the mottle)
  skin: () => {
    const n = periodicNoise(11), pores = worley(12, 120), creases = periodicNoise(13), fine = periodicNoise(14), freckle = worley(15, 40);
    return (u, v) => {
      const p = pores(u, v);
      const pore = 1 - smooth(0.0, 0.32, p.f1);
      const crease = 1 - smooth(0, 0.014, Math.abs(fbm(creases, u, v, 6, 3) - 0.5));
      // the fine lines of skin: two sets of shallow grooves crossing at an angle, broken up by noise
      const lineA = 1 - smooth(0, 0.08, Math.abs(Math.sin((u * 0.8 + v * 0.6) * Math.PI * 70 + fbm(fine, u, v, 8, 2) * 6)));
      const lineB = 1 - smooth(0, 0.08, Math.abs(Math.sin((u * 0.6 - v * 0.8) * Math.PI * 64 + fbm(fine, v, u, 8, 2) * 6)));
      const lines = Math.max(lineA, lineB) * fbm(fine, u, v, 4, 2);
      const mottle = fbm(n, u, v, 4, 4);
      const f = freckle(u, v);
      const spot = (1 - smooth(0.0, 0.18, f.f1)) * (f.id % 5 === 0 ? 1 : 0);
      const h = 0.62 - pore * 0.28 - crease * 0.16 - lines * 0.08 + (mottle - 0.5) * 0.12;
      return { h, d: 0.9 + (mottle - 0.5) * 0.16 - pore * 0.05 - lines * 0.03 - spot * 0.06 };
    };
  },
  face: () => {
    const n = periodicNoise(21), pores = worley(22, 200), fine = periodicNoise(23), blush = periodicNoise(24);
    return (u, v) => {
      const p = pores(u, v);
      const pore = 1 - smooth(0.0, 0.28, p.f1);
      const m = fbm(n, u, v, 5, 4);
      const lines = (1 - smooth(0, 0.06, Math.abs(Math.sin((u + v * 0.15) * Math.PI * 90 + fbm(fine, u, v, 6, 2) * 5)))) * fbm(fine, u, v, 3, 2);
      const warm = fbm(blush, u, v, 2, 3);
      return { h: 0.6 - pore * 0.2 - lines * 0.06 + (m - 0.5) * 0.08, d: 0.93 + (m - 0.5) * 0.1 - pore * 0.03 - lines * 0.02 + (warm - 0.5) * 0.06 };
    };
  },
  // A droid's plating (a humanoid droid's body, a prosthetic limb): panels of different sizes with recessed seams, a rivet at each corner, a
  // vent of slots here and there, worn edges and scuffs
  droid: () => {
    const r = rng(91), n = periodicNoise(92), scuff = periodicNoise(93);
    const grid = 8;
    // each cell of the grid is joined to its right or lower neighbour or not, so panels are of different sizes
    const joinR = Array.from({ length: grid * grid }, () => r() < 0.45);
    const joinD = Array.from({ length: grid * grid }, () => r() < 0.35);
    const vent = Array.from({ length: grid * grid }, () => r() < 0.12);
    return (u, v) => {
      const x = u * grid, y = v * grid;
      const cx = Math.floor(x), cy = Math.floor(y);
      const fx = x - cx, fy = y - cy;
      const id = (cy % grid) * grid + (cx % grid);
      const left = joinR[(cy % grid) * grid + ((cx + grid - 1) % grid)], right = joinR[id];
      const up = joinD[(((cy + grid - 1) % grid)) * grid + (cx % grid)], down = joinD[id];
      const w = 0.025;
      const seamX = (!left && fx < w) || (!right && fx > 1 - w);
      const seamY = (!up && fy < w) || (!down && fy > 1 - w);
      const seam = seamX || seamY ? 1 : 0;
      // rivets just inside the corners of a panel
      let rivet = 0;
      for (const [ax, ay] of [[0.09, 0.09], [0.91, 0.09], [0.09, 0.91], [0.91, 0.91]]) {
        if ((ax < 0.5 ? left : right) || (ay < 0.5 ? up : down)) continue;
        const d = Math.hypot(fx - ax, fy - ay);
        rivet = Math.max(rivet, 1 - smooth(0.0, 0.035, d));
      }
      const slots = vent[id] && fx > 0.2 && fx < 0.8 && fy > 0.25 && fy < 0.75 ? (Math.sin(fy * Math.PI * 9) > 0.35 ? 1 : 0) : 0;
      const s = fbm(scuff, u, v, 6, 4);
      const wear = smooth(0.62, 0.8, s);
      const m = fbm(n, u, v, 12, 3);
      return { h: 0.6 - seam * 0.4 - slots * 0.3 + rivet * 0.3 + (m - 0.5) * 0.04 - wear * 0.05, d: 0.9 - seam * 0.35 - slots * 0.3 + rivet * 0.1 + wear * 0.12 + (m - 0.5) * 0.06 };
    };
  },
  // Cybernetics (implants, a prosthesis's joints and inner works): circuit traces raised on a board, turning at right angles, with pads and vias
  cyber: () => {
    const r = rng(101), n = periodicNoise(102);
    const cells = 32;
    const dirs = Array.from({ length: cells * cells }, () => Math.floor(r() * 6));
    const pads = Array.from({ length: cells * cells }, () => r() < 0.08);
    return (u, v) => {
      const x = u * cells, y = v * cells;
      const cx = Math.floor(x), cy = Math.floor(y);
      const fx = x - cx - 0.5, fy = y - cy - 0.5;
      const d = dirs[(cy % cells) * cells + (cx % cells)];
      const w = 0.09;
      // a trace across the cell, or turning a corner in it, or none
      const across = d === 0 ? Math.abs(fy) < w : d === 1 ? Math.abs(fx) < w : d === 2 ? (Math.abs(fy) < w && fx < 0) || (Math.abs(fx) < w && fy < 0) : d === 3 ? (Math.abs(fy) < w && fx > 0) || (Math.abs(fx) < w && fy > 0) : false;
      const pad = pads[(cy % cells) * cells + (cx % cells)] && Math.hypot(fx, fy) < 0.28;
      const via = pad && Math.hypot(fx, fy) < 0.1;
      const m = fbm(n, u, v, 8, 3);
      const t = across || pad ? 1 : 0;
      return { h: 0.4 + t * 0.35 - (via ? 0.3 : 0) + (m - 0.5) * 0.05, d: 0.62 + t * 0.32 - (via ? 0.3 : 0) + (m - 0.5) * 0.08 };
    };
  },
  // A coarse homespun weave (robes, cloaks, rags): a plain weave of thick, uneven threads with slubs along them
  weave: () => {
    const n = periodicNoise(111), slub = periodicNoise(112);
    const threads = 40;
    return (u, v) => {
      const x = u * threads, y = v * threads;
      const col = Math.floor(x), row = Math.floor(y);
      const over = (col + row) % 2 === 0;
      const fx = x - col, fy = y - row;
      const thick = 0.75 + 0.5 * fbm(slub, over ? u * 0.25 : u, over ? v : v * 0.25, 16, 2);
      const across = Math.pow(over ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI), 0.7) * thick;
      const fuzz = fbm(n, u, v, 48, 3);
      return { h: 0.3 + across * 0.45 + (fuzz - 0.5) * 0.2, d: 0.76 + across * 0.14 + (fuzz - 0.5) * 0.16 };
    };
  },
  // An armour's undersuit or a flight suit: a close rib running down it, quilted in diamonds where it pads
  mesh: () => {
    const n = periodicNoise(121);
    return (u, v) => {
      const rib = Math.pow(Math.abs(Math.sin(u * Math.PI * 96)), 0.6);
      const qa = Math.abs(((u + v) * 8) % 1 - 0.5), qb = Math.abs(((u - v + 8) * 8) % 1 - 0.5);
      const quilt = 1 - smooth(0, 0.05, Math.min(qa, qb));
      const m = fbm(n, u, v, 16, 3);
      return { h: 0.45 + rib * 0.2 - quilt * 0.3 + (m - 0.5) * 0.06, d: 0.82 + rib * 0.06 - quilt * 0.12 + (m - 0.5) * 0.06 };
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
  // Armour of moulded plastoid, white (2026-11-05, the user: "storm trooper armour needs updated normals and textures"): a plate to a tile with a
  // rounded border and a recessed seam between them (the seam a little wavy, grimed), a screw head at each corner, the fine orange peel of moulded plastic, long
  // scuffs and short scratches that show the dark under the white, a few soft blasts of scorch, and a darkening in the seams
  shell: () => {
    const wob = periodicNoise(101), peel = periodicNoise(102), grime = periodicNoise(103), r = rng(104);
    const PLATES = 1;
    // Scratches: short, mostly along one way (a plate is scuffed by what rubs it), a few long ones
    const scratches = Array.from({ length: 70 }, () => { const a = (r() < 0.7 ? 0.5 : r()) * Math.PI + (r() - 0.5) * 0.3; return { x: r(), y: r(), dx: Math.cos(a), dy: Math.sin(a), len: 0.015 + r() * (r() < 0.2 ? 0.2 : 0.07), w: 0.0007 + r() * 0.0009 }; });
    const scorches = Array.from({ length: 5 }, () => ({ x: r(), y: r(), r: 0.025 + r() * 0.045 }));
    return (u, v) => {
      // the seams, a little wavy
      const uu = u + (fbm(wob, u, v, 6, 2) - 0.5) * 0.012;
      const vv = v + (fbm(wob, v, u, 6, 2) - 0.5) * 0.012;
      const fu = (uu * PLATES) % 1, fv = (vv * PLATES) % 1;
      const edge = Math.min(fu, 1 - fu, fv, 1 - fv);              // 0 at a seam, 0.5 in the middle of a plate (in plates)
      const seam = 1 - smooth(0.0, 0.022, edge);
      const bevel = smooth(0.022, 0.10, edge);
      // a screw at each corner of a plate
      const corner = Math.min(Math.hypot(Math.min(fu, 1 - fu) - 0.07, Math.min(fv, 1 - fv) - 0.07), 1);
      const screw = 1 - smooth(0.012, 0.024, corner);
      const orange = fbm(peel, u, v, 90, 2) - 0.5;
      const dirt = fbm(grime, u, v, 5, 4);
      let s = 0;
      for (const k of scratches) {
        for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
          const px = u + ox - k.x, py = v + oy - k.y;
          const along = px * k.dx + py * k.dy;
          if (along < 0 || along > k.len) continue;
          const off = Math.abs(px * -k.dy + py * k.dx);
          if (off < k.w) s = Math.max(s, (1 - off / k.w) * (1 - along / k.len * 0.5));
        }
      }
      let burn = 0;
      for (const b of scorches) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
        const d = Math.hypot(u + ox - b.x, v + oy - b.y) / b.r;
        if (d < 1) burn = Math.max(burn, (1 - d) ** 1.6 * (0.7 + 0.6 * fbm(grime, u * 3, v * 3, 12, 2)));
      }
      const h = 0.62 + bevel * 0.2 - seam * 0.34 + screw * 0.08 + orange * 0.035 - s * 0.16 - burn * 0.05;
      const d = 0.945 + (dirt - 0.5) * 0.07 - seam * (0.2 + 0.12 * dirt) - screw * 0.05 - s * 0.14 - burn * 0.28 + orange * 0.012;
      return { h, d };
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
const STEEP = { skin: 3, face: 2.5, fabric: 5, leather: 4, shell: 5, plate: 4, scales: 4.5, fur: 4, droid: 4, cyber: 3.5, weave: 5, mesh: 4 };

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
