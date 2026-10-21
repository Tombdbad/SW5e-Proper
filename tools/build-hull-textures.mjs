// Builds the hull textures of the ships and speeders (2026-10-21) into client/public/textures/hull/, tileable, from the Poly Haven
// sets in client/public/textures/wear (CC0, fetched with tools/fetch-polyhaven.mjs) and from patterns drawn here:
//   wear.png           R grime and streaks, G scratches and paint chips, B rust (each equalised, so a level of wear L covers about L of the hull)
//   damage.png         scorch and soot blotches (grey), laid at a scale of their own so that they do not repeat with the wear
//   panels_normal.png  plates, grooves, rivets, hatches and vents (OpenGL normal map: green up)
//   panels_height.png  the same as a height map (not used by the game yet: parallax shifts wrongly on curved hulls)
// Usage: node tools/build-hull-textures.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "public", "textures");
const S = 512;
const N = S * S;

const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const wrap = (v) => ((v % S) + S) % S;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const step = (a, b, v) => smooth(clamp01((v - a) / (b - a)));

// Periodic value noise with `freq` cells across, 0..1
function noise(freq, seed) {
  const r = rng(seed);
  const g = Float32Array.from({ length: freq * freq }, () => r());
  const out = new Float32Array(N);
  for (let y = 0; y < S; y++) {
    const fy = (y / S) * freq, iy = Math.floor(fy), ty = smooth(fy - iy);
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * freq, ix = Math.floor(fx), tx = smooth(fx - ix);
      const at = (i, j) => g[(j % freq) * freq + (i % freq)];
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
      out[y * S + x] = a + (b - a) * ty;
    }
  }
  return out;
}
function fbm(base, octaves, seed) {
  const out = new Float32Array(N);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = noise(base * 2 ** o, seed + o * 17);
    for (let i = 0; i < N; i++) out[i] += n[i] * amp;
    total += amp;
    amp /= 2;
  }
  for (let i = 0; i < N; i++) out[i] /= total;
  return out;
}
// Ranks the values 0..1, so that thresholds cover a known share of the surface
function equalise(a) {
  const order = Uint32Array.from({ length: N }, (_, i) => i).sort((i, j) => a[i] - a[j]);
  const out = new Float32Array(N);
  for (let rank = 0; rank < N; rank++) out[order[rank]] = rank / (N - 1);
  return out;
}

// A source set's map, scaled to S, as floats per channel (0..1)
async function source(set, file) {
  const { data, info } = await sharp(path.join(root, "wear", set, file)).resize(S, S).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  const chan = (k) => Float32Array.from({ length: N }, (_, i) => data[i * c + Math.min(k, c - 1)] / 255);
  return { r: chan(0), g: chan(1), b: chan(2), lum: Float32Array.from({ length: N }, (_, i) => (0.3 * data[i * c] + 0.59 * data[i * c + Math.min(1, c - 1)] + 0.11 * data[i * c + Math.min(2, c - 1)]) / 255) };
}

function splat(field, x, y, v) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
    const i = wrap(y0 + dy) * S + wrap(x0 + dx);
    field[i] = Math.max(field[i], v * Math.min(1, w * 1.6));
  }
}
// Thin scratches, mostly along the hull (x), each with a strength that says at what wear it shows
function scratches(count, seed) {
  const r = rng(seed), field = new Float32Array(N);
  for (let n = 0; n < count; n++) {
    const x0 = r() * S, y0 = r() * S, angle = (r() - 0.5) * 0.45 + (r() < 0.2 ? Math.PI / 2 : 0), len = 18 + r() * r() * 190, v = 0.3 + r() * 0.7;
    for (let t = 0; t < len; t += 0.5) splat(field, x0 + Math.cos(angle) * t, y0 + Math.sin(angle) * t, v * (1 - 0.5 * (t / len)));
  }
  return field;
}
// Round blotches of soot, strongest at their middle and broken up by noise
function blotches(count, seed) {
  const r = rng(seed), field = new Float32Array(N), grain = fbm(8, 4, seed + 5);
  for (let n = 0; n < count; n++) {
    const cx = r() * S, cy = r() * S, rad = 40 + r() * 90, stretch = 1 + r() * 1.6;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const x0 = Math.floor(cx + ox - rad * stretch), x1 = Math.ceil(cx + ox + rad * stretch), y0 = Math.floor(cy + oy - rad), y1 = Math.ceil(cy + oy + rad);
      for (let y = Math.max(0, y0); y <= Math.min(S - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(S - 1, x1); x++) {
        const d = Math.hypot((x - cx - ox) / stretch, y - cy - oy) / rad;
        if (d >= 1) continue;
        const v = (1 - d * d) * (0.55 + 0.9 * grain[y * S + x]);
        field[y * S + x] = Math.max(field[y * S + x], v);
      }
    }
  }
  return field;
}

async function save(file, channels, ...planes) {
  const buf = Buffer.alloc(N * channels);
  for (let k = 0; k < channels; k++) for (let i = 0; i < N; i++) buf[i * channels + k] = Math.round(clamp01(planes[k][i]) * 255);
  await sharp(buf, { raw: { width: S, height: S, channels } }).png({ compressionLevel: 9 }).toFile(path.join(root, "hull", file));
  console.log("wrote", file);
}

// ---- the plates: a height map of panels, grooves, rivets, hatches and vents ---------------------------------------------------
function panels(seed) {
  const r = rng(seed), h = new Float32Array(N).fill(0.5);
  const rows = 4, rowH = S / rows;
  const bump = (cx, cy, rad, v) => {
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d < 1) h[wrap(y) * S + wrap(x)] += v * (1 - d * d);
    }
  };
  for (let row = 0; row < rows; row++) {
    // The row is cut into two to four panels, widths in steps of 16
    const cuts = [0];
    const count = 2 + Math.floor(r() * 3);
    for (let c = 1; c < count; c++) cuts.push(Math.round(((c + (r() - 0.5) * 0.5) / count) * (S / 16)) * 16);
    cuts.push(S);
    for (let c = 0; c < cuts.length - 1; c++) {
      const x0 = cuts[c], x1 = cuts[c + 1], y0 = row * rowH, y1 = y0 + rowH, level = 0.5 + (r() - 0.5) * 0.05;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const d = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
        h[y * S + x] = level - (d < 4 ? 0.26 * (1 - d / 4) ** 1.5 : 0);
      }
      // Rivets along the edges
      for (let x = x0 + 10; x < x1 - 6; x += 20) { bump(x, y0 + 9, 2.6, 0.2); bump(x, y1 - 10, 2.6, 0.2); }
      for (let y = y0 + 30; y < y1 - 20; y += 20) { bump(x0 + 9, y, 2.6, 0.2); bump(x1 - 10, y, 2.6, 0.2); }
      const kind = r();
      const w = x1 - x0;
      if (kind < 0.3 && w >= 96) {
        // A hatch: a raised plate in a groove, a screw at each corner
        const ix0 = x0 + 24, ix1 = x1 - 24, iy0 = y0 + 26, iy1 = y1 - 26;
        for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
          const d = Math.min(x - ix0, ix1 - 1 - x, y - iy0, iy1 - 1 - y);
          h[y * S + x] = level + (d < 3 ? -0.2 * (1 - d / 3) : 0.05);
        }
        for (const [sx, sy] of [[ix0 + 7, iy0 + 7], [ix1 - 8, iy0 + 7], [ix0 + 7, iy1 - 8], [ix1 - 8, iy1 - 8]]) bump(sx, sy, 3, 0.18);
        bump((ix0 + ix1) / 2, (iy0 + iy1) / 2, 4.5, 0.16);
      } else if (kind < 0.5 && w >= 64) {
        // A vent: slots
        for (let s = 0; s < 6; s++) {
          const sy = y0 + 30 + s * 11;
          for (let y = sy; y < sy + 4; y++) for (let x = x0 + 22; x < x1 - 22; x++) h[y * S + x] = level - 0.3;
        }
      } else if (kind < 0.62) {
        // A port: a ring with a dished middle
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        for (let y = Math.floor(cy - 22); y <= cy + 22; y++) for (let x = Math.floor(cx - 22); x <= cx + 22; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d < 22) h[wrap(y) * S + wrap(x)] += d > 16 ? 0.12 : -0.1;
        }
      }
    }
  }
  const grain = noise(64, seed + 99);
  for (let i = 0; i < N; i++) h[i] += (grain[i] - 0.5) * 0.02;
  return h;
}
function normalOf(h, k) {
  const nx = new Float32Array(N), ny = new Float32Array(N), nz = new Float32Array(N);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + wrap(x + 1)] - h[y * S + wrap(x - 1)];
    // The image's y runs down and v up: green is the slope toward +v
    const dy = h[wrap(y + 1) * S + x] - h[wrap(y - 1) * S + x];
    const vx = -dx * k, vy = dy * k, len = Math.hypot(vx, vy, 1), i = y * S + x;
    nx[i] = (vx / len) * 0.5 + 0.5;
    ny[i] = (vy / len) * 0.5 + 0.5;
    nz[i] = (1 / len) * 0.5 + 0.5;
  }
  return [nx, ny, nz];
}

await mkdir(path.join(root, "hull"), { recursive: true });
const streaked = await source("rusty_painted_metal", "diffuse.jpg");
const rusted = await source("rust_coarse_01", "diffuse.jpg");
const peeled = await source("peeling_painted_wall", "diffuse.jpg");

// Grime: low noise with the dark streaks of the painted, rusted metal
const lowGrime = fbm(3, 4, 11);
const grime = equalise(Float32Array.from({ length: N }, (_, i) => 0.45 * lowGrime[i] + 0.55 * (1 - streaked.lum[i])));
// Scratches, and chips where the paint of the peeling wall is lifted (its bright substrate)
const lines = scratches(260, 21), chipOf = equalise(peeled.lum);
const scratchMask = Float32Array.from({ length: N }, (_, i) => Math.max(lines[i], step(0.8, 0.98, chipOf[i]) * 0.85));
// Rust: where the coarse rust is orange rather than grey
const orange = fbm(6, 4, 31);
const rust = equalise(Float32Array.from({ length: N }, (_, i) => 0.65 * clamp01((rusted.r[i] - rusted.b[i]) * 2.2) + 0.35 * orange[i]));
await save("wear.png", 3, grime, scratchMask, rust);
await save("damage.png", 1, blotches(9, 41));
const height = panels(7);
await save("panels_height.png", 1, height);
await save("panels_normal.png", 3, ...normalOf(height, 7));
