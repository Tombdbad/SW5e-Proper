// Terrain (2026-11-10; the user: "Terrain Studio ... generate realistic terrain for our worlds, settlements, districts and location maps (extend this to
// our atmospheric dog fights maps and speeder races/speeder travel maps)"). One pure module for the ground every outdoor scene stands on: a
// height field made the way the Terrain Studio toolkit (HowdyMoto/terrain-tools, MIT) and the practitioners' notes it follows make one, in this
// order (the skill `.claude/skills/terrain-studio/SKILL.md` says why each pass is where it is):
//   1 sculpt     warped fractal noise: rolling base with its slopes damped (Quilez), ridged mountains where a low noise allows them, the
//                height shaped by a power (flat valleys, sharp tops), dunes, terraces (mesas), craters
//   2 stream     stream-power incision (Braun & Willett 2013): steepest-descent drainage, incision by drainage area and slope, solved from
//                the bottom up, so that the valleys branch like rivers do
//   3 droplets   hydraulic erosion (Lague; Beyer; the Terrain Studio's `erodeTerrain`): droplets with inertia, capacity and evaporation,
//                biting only where the ground is steep, so that flats are not scratched
//   4 thermal    talus: where the slope is past the angle of repose the material slides down
//   5 polish     soft ground is blurred, more where it is flatter (a fixed radius reads as a filter)
//   then         `levelDisc` / `levelRoad` put flat ground where something is built or driven (a pad, a road that follows the contour)
//   and          `terrainColorAt` colours the ground from where the water went and how steep it is (rock, soil, sand, snow, wet), never from a
//                painted mask that ignores the slope; `scatterOn` places rocks and trees on the ground they can stand on
// Everything is seeded: the same seed and spec give the same ground on the server and in every browser (integer hashes, no Math.sin in the
// noise), nothing is stored but the spec. All lengths are metres, heights are metres above the lowest ground, the grid is `n` by `n` vertices.
// The Terrain Studio's own code (WebGPU, one landscape at a time, no seeds in its UI) is not used here; its sculpt and erosion notes are.

export interface TerrainPalette { low: string; high: string; rock: string; sand: string; snow: string; wet: string }
// What a kind of land is like. `relief` the metres from the lowest to the highest ground at the scale of `wave` (a share of the map across: the
// broadest swell); `warp` how far the noise is bent by itself (0 straight .. 1.5 twisted); `ridges` how much of the high ground is a mountain
// range; `power` the shape of the heights (1 even, 2 mostly low and flat with sharp tops); `terrace` the number of mesa steps (0 none);
// `dunes` the share of dune crests; `craters` how many on the map; `stream`, `droplets`, `thermal` the erosion (0 none); `talus` the angle
// of repose in degrees; `snow` the share of the height above which snow lies (2 never); `sandy` the share of the flats that is sand
export interface TerrainStyle { relief: number; wave: number; octaves: number; warp: number; ridges: number; power: number; terrace: number; dunes: number; craters: number; stream: number; droplets: number; thermal: number; talus: number; snow: number; sandy: number; palette: TerrainPalette }
export const TERRAIN_STYLES: Record<string, TerrainStyle> = {
  temperate: { relief: 150, wave: 0.45, octaves: 6, warp: 0.55, ridges: 0.35, power: 1.5, terrace: 0, dunes: 0, craters: 0, stream: 14, droplets: 1, thermal: 8, talus: 34, snow: 0.93, sandy: 0.04, palette: { low: "#4d7c3c", high: "#82915a", rock: "#7d766b", sand: "#cdbb8a", snow: "#f2f5f8", wet: "#3b5a30" } },
  forest: { relief: 190, wave: 0.4, octaves: 6, warp: 0.6, ridges: 0.4, power: 1.4, terrace: 0, dunes: 0, craters: 0, stream: 14, droplets: 1, thermal: 8, talus: 34, snow: 0.9, sandy: 0.02, palette: { low: "#2f5e2e", high: "#4e6c3a", rock: "#6f695f", sand: "#a8a070", snow: "#eef2f5", wet: "#27472a" } },
  jungle: { relief: 230, wave: 0.3, octaves: 6, warp: 0.75, ridges: 0.3, power: 1.3, terrace: 0, dunes: 0, craters: 0, stream: 18, droplets: 1.2, thermal: 8, talus: 38, snow: 2, sandy: 0.02, palette: { low: "#2a7a33", high: "#3d8a3c", rock: "#5e6a4c", sand: "#b9a874", snow: "#e6efe6", wet: "#1f5a2c" } },
  swamp: { relief: 34, wave: 0.5, octaves: 5, warp: 0.4, ridges: 0, power: 2.2, terrace: 0, dunes: 0, craters: 0, stream: 5, droplets: 0.3, thermal: 6, talus: 28, snow: 2, sandy: 0.03, palette: { low: "#4b5e38", high: "#5d6a42", rock: "#5e5a4a", sand: "#6a6a48", snow: "#dfe4dc", wet: "#2f4a3c" } },
  ocean: { relief: 110, wave: 0.5, octaves: 5, warp: 0.5, ridges: 0.15, power: 1.8, terrace: 0, dunes: 0, craters: 0, stream: 10, droplets: 0.6, thermal: 8, talus: 32, snow: 2, sandy: 0.25, palette: { low: "#4d8a52", high: "#62804c", rock: "#706b61", sand: "#e0d0a0", snow: "#f2f6f8", wet: "#3c6a48" } },
  desert: { relief: 130, wave: 0.4, octaves: 5, warp: 0.7, ridges: 0.2, power: 1.2, terrace: 5, dunes: 0.5, craters: 0, stream: 4, droplets: 0.3, thermal: 14, talus: 33, snow: 2, sandy: 0.7, palette: { low: "#d4ad6c", high: "#c4945a", rock: "#9a7550", sand: "#e0bf7e", snow: "#efe2c8", wet: "#a8844f" } },
  ice: { relief: 230, wave: 0.38, octaves: 6, warp: 0.5, ridges: 0.6, power: 1.2, terrace: 0, dunes: 0, craters: 0, stream: 8, droplets: 0.6, thermal: 10, talus: 36, snow: 0.3, sandy: 0, palette: { low: "#dfe8ee", high: "#cfdce6", rock: "#7f8b97", sand: "#c8dfee", snow: "#ffffff", wet: "#9fc2dc" } },
  volcanic: { relief: 270, wave: 0.35, octaves: 6, warp: 0.5, ridges: 0.6, power: 1.1, terrace: 0, dunes: 0, craters: 5, stream: 5, droplets: 0.2, thermal: 12, talus: 38, snow: 2, sandy: 0.05, palette: { low: "#4a3c36", high: "#5e4e45", rock: "#6e5e54", sand: "#3a2c26", snow: "#8a7a70", wet: "#2a1a18" } },
  urban: { relief: 28, wave: 0.5, octaves: 4, warp: 0.3, ridges: 0, power: 2.4, terrace: 0, dunes: 0, craters: 0, stream: 0, droplets: 0, thermal: 4, talus: 30, snow: 2, sandy: 0, palette: { low: "#6a707a", high: "#7a808a", rock: "#5a6068", sand: "#8a8a88", snow: "#e8ecf0", wet: "#4a5058" } },
  barren: { relief: 160, wave: 0.4, octaves: 6, warp: 0.55, ridges: 0.4, power: 1.3, terrace: 0, dunes: 0, craters: 14, stream: 3, droplets: 0.2, thermal: 14, talus: 34, snow: 2, sandy: 0.12, palette: { low: "#8f8573", high: "#a0957f", rock: "#6f675b", sand: "#a39879", snow: "#d8d2c6", wet: "#6a6156" } },
  "gas giant": { relief: 0, wave: 0.5, octaves: 3, warp: 0, ridges: 0, power: 1, terrace: 0, dunes: 0, craters: 0, stream: 0, droplets: 0, thermal: 0, talus: 30, snow: 2, sandy: 0, palette: { low: "#c98a52", high: "#d9a36a", rock: "#a8683a", sand: "#e8c99a", snow: "#f6ead8", wet: "#a8683a" } },
};
export const terrainStyleOf = (biome: string): TerrainStyle => TERRAIN_STYLES[biome] ?? TERRAIN_STYLES.temperate;

export interface TerrainSpec {
  seed: number; biome: string;
  // Metres across, and vertices along a side
  size: number; n: number;
  // `relief` replaces the style's, `scale` multiplies it; `erosion` how much of the weathering is done (the cost: "none" 0, "light" about a quarter, "full")
  relief?: number; scale?: number; erosion?: "none" | "light" | "full";
  // Where the ground is brought down to `edge` (a share of the relief) at the rim of the map, so that a flat skirt joins it: the width of the
  // fall as a share of the map's side (0 none)
  rim?: number;
}
export interface Terrain {
  seed: number; biome: string; n: number; size: number; cell: number;
  // The corner of the grid in metres (the map is centred on the origin)
  x0: number; z0: number;
  h: Float32Array; min: number; max: number;
  // How much water has come down to each vertex: 0 for a ridge .. 1 for the biggest river (a log scale), from the stream pass
  flow: Float32Array;
}

// ---- Noise: value noise on an integer lattice with a quintic blend, with the slope (Quilez, "More noise"), in 2D
const hash2 = (x: number, y: number, s: number): number => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const N = new Float64Array(3);
// Writes the value (-1..1) and its slope along x and y to N
function noised(x: number, y: number, s: number): void {
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [x - ix, y - iy];
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const [a, b, c, d] = [hash2(ix, iy, s), hash2(ix + 1, iy, s), hash2(ix, iy + 1, s), hash2(ix + 1, iy + 1, s)];
  const [k1, k2, k4] = [b - a, c - a, a - b - c + d];
  N[0] = (a + k1 * ux + k2 * uy + k4 * ux * uy) * 2 - 1;
  N[1] = 2 * dux * (k1 + k4 * uy);
  N[2] = 2 * duy * (k2 + k4 * ux);
}
// Each octave is turned and shifted, so that the grid's axes do not show (the same lattice at every scale lines up, as a ridge along x)
const turn = (x: number, y: number): [number, number] => [1.97 * (0.8 * x - 0.6 * y) + 5.3, 1.97 * (0.6 * x + 0.8 * y) + 9.1];
// Plain fractal sum, -1..1
export function terrainNoise(x: number, y: number, seed: number, octaves = 5): number {
  let [sum, amp, norm] = [0, 0.5, 0];
  for (let o = 0; o < octaves; o++) {
    noised(x, y, seed + o * 17);
    sum += amp * N[0];
    norm += amp;
    [x, y] = turn(x, y);
    amp *= 0.5;
  }
  return sum / norm;
}
// The fractal sum with each octave damped by the slope the coarser ones have made (Quilez's "erosion-like" fbm): steep ground stays smooth, flat
// ground gets the detail, the way weathered land is
function dampedFbm(x: number, y: number, seed: number, octaves: number): number {
  let [sum, amp, norm, dx, dy] = [0, 1, 0, 0, 0];
  for (let o = 0; o < octaves; o++) {
    noised(x, y, seed + o * 23);
    dx += N[1];
    dy += N[2];
    sum += (amp * N[0]) / (1 + dx * dx + dy * dy);
    norm += amp;
    [x, y] = turn(x, y);
    amp *= 0.5;
  }
  return sum / norm;
}
// Mountain ridges, 0..1: each octave sharp at the crest and weighted by the one before (peaks stay rough, the valleys between them smooth)
function ridgedFbm(x: number, y: number, seed: number, octaves: number): number {
  let [sum, amp, norm, weight] = [0, 0.5, 0, 1];
  for (let o = 0; o < octaves; o++) {
    noised(x, y, seed + o * 29);
    let r = 1 - Math.abs(N[0]);
    r *= r * weight;
    weight = Math.min(1, Math.max(0, r * 2));
    sum += r * amp;
    norm += amp;
    [x, y] = turn(x, y);
    amp *= 0.5;
  }
  return sum / norm;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function rng(seed: number) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Sampling
export function terrainHeight(t: Terrain, x: number, z: number): number {
  const [fx, fz] = [(x - t.x0) / t.cell, (z - t.z0) / t.cell];
  const [gx, gz] = [fx < 0 ? 0 : fx > t.n - 1 ? t.n - 1 : fx, fz < 0 ? 0 : fz > t.n - 1 ? t.n - 1 : fz];
  const [ix, iz] = [Math.min(t.n - 2, Math.floor(gx)), Math.min(t.n - 2, Math.floor(gz))];
  const [u, v] = [gx - ix, gz - iz];
  const i = iz * t.n + ix;
  return (t.h[i] * (1 - u) + t.h[i + 1] * u) * (1 - v) + (t.h[i + t.n] * (1 - u) + t.h[i + t.n + 1] * u) * v;
}
// The slope as rise over run (0 flat, 1 is 45 degrees), the larger of the two directions' pair
export function terrainSlope(t: Terrain, x: number, z: number): number {
  const e = t.cell * 0.75;
  return Math.hypot((terrainHeight(t, x + e, z) - terrainHeight(t, x - e, z)) / (2 * e), (terrainHeight(t, x, z + e) - terrainHeight(t, x, z - e)) / (2 * e));
}
// Which way the ground rises, and how steeply: the rise a metre along x and z
export function terrainGradient(t: Terrain, x: number, z: number): [number, number] {
  const e = t.cell * 0.75;
  return [(terrainHeight(t, x + e, z) - terrainHeight(t, x - e, z)) / (2 * e), (terrainHeight(t, x, z + e) - terrainHeight(t, x, z - e)) / (2 * e)];
}
export function terrainFlow(t: Terrain, x: number, z: number): number {
  const [fx, fz] = [(x - t.x0) / t.cell, (z - t.z0) / t.cell];
  const [ix, iz] = [Math.max(0, Math.min(t.n - 1, Math.round(fx))), Math.max(0, Math.min(t.n - 1, Math.round(fz)))];
  return t.flow[iz * t.n + ix];
}
function refresh(t: Terrain) {
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i < t.h.length; i++) {
    if (t.h[i] < lo) lo = t.h[i];
    if (t.h[i] > hi) hi = t.h[i];
  }
  t.min = lo;
  t.max = hi;
}

// ---- Weathering. Heights in `h` are metres; the passes work on a grid of `n` by `n` with the spacing `cell`.
const NB: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
// Stream power (Braun & Willett 2013), implicit: each vertex's receiver is the steepest of its 8 neighbours (the rim drains away); the drainage
// area is gathered from the top down; the incision is solved from the bottom up, so that the receiver already has its new height. Returns the area.
// `k` the strength of one pass, `m` how fast the cut grows with the area, `cap` the most area that counts (one basin does not carve a canyon),
// `uplift` a little raised back on the high ground so that the ridges do not wash flat
export function streamPower(h: Float32Array, n: number, passes: number, k: number, m = 0.5, cap = 250, uplift = 0): Float32Array {
  const size = n * n;
  const recv = new Int32Array(size);
  const area = new Float32Array(size);
  const order = new Uint32Array(size);
  const dist = new Float32Array(size);
  const keys = new Float64Array(size);
  for (let pass = 0; pass < Math.max(1, passes); pass++) {
    // The vertices high to low (a numeric sort of the height, quantised to 1/256 m, with the index in the low bits: much faster than a comparator)
    for (let i = 0; i < size; i++) keys[i] = Math.round(Math.max(0, h[i]) * 256) * 1048576 + i;
    keys.sort();
    for (let q = 0; q < size; q++) order[q] = keys[size - 1 - q] % 1048576;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const at = j * n + i;
        let best = at;
        let drop = 0;
        let d = 1;
        if (i > 0 && j > 0 && i < n - 1 && j < n - 1) {
          for (let k = 0; k < 8; k++) {
            const o = at + NB[k][1] * n + NB[k][0];
            const s = (h[at] - h[o]) / NB[k][2];
            if (s > drop) {
              best = o;
              drop = s;
              d = NB[k][2];
            }
          }
        }
        recv[at] = best;
        dist[at] = d;
      }
    }
    area.fill(1);
    for (let q = 0; q < size; q++) {
      const at = order[q];
      if (recv[at] !== at) area[recv[at]] += area[at];
    }
    if (k > 0) {
      for (let q = size - 1; q >= 0; q--) {
        const at = order[q];
        const r = recv[at];
        if (r === at) continue;
        const F = (k * Math.pow(Math.min(area[at], cap), m)) / dist[at];
        h[at] = (h[at] + F * h[r]) / (1 + F) + uplift;
      }
    }
  }
  return area;
}
// Hydraulic droplets (Lague's loop, as the Terrain Studio's `erodeTerrain` has it, with the gate that keeps flats from being scratched): `count`
// droplets from random places, each following the downhill gradient with some inertia, carrying sediment up to a capacity set by the drop, speed and
// water, taking where the capacity is not met and the ground is steep, leaving where it is exceeded or the ground rises. Works in cells.
export function erodeDroplets(h: Float32Array, n: number, cell: number, count: number, seed: number, o: { inertia?: number; capacity?: number; erode?: number; deposit?: number; evaporation?: number; steps?: number; radius?: number; gate?: [number, number] } = {}): void {
  const [inertia, capacity, erode, deposit, evap, steps, radius] = [o.inertia ?? 0.15, o.capacity ?? 4, o.erode ?? 0.3, o.deposit ?? 0.3, o.evaporation ?? 0.04, o.steps ?? 48, o.radius ?? 2];
  // (the gate is in rise over run: the ground flatter than the first never erodes, steeper than the second erodes fully)
  const [g0, g1] = o.gate ?? [0.18, 0.5];
  const rand = rng(seed);
  const kernel: [number, number, number][] = [];
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const w = Math.max(0, 1 - Math.hypot(dx, dz) / radius);
    if (w > 0) kernel.push([dx, dz, w]);
  }
  let ksum = 0;
  for (const [, , w] of kernel) ksum += w;
  const hc = new Float64Array(n * n);
  for (let i = 0; i < hc.length; i++) hc[i] = h[i] / cell;
  const at = (i: number, j: number) => hc[j * n + i];
  const margin = radius + 1;
  for (let drop = 0; drop < count; drop++) {
    let [x, z] = [margin + rand() * (n - 1 - 2 * margin), margin + rand() * (n - 1 - 2 * margin)];
    let [dx, dz, speed, water, sediment] = [0, 0, 1, 1, 0];
    let drained = false;
    for (let age = 0; age < steps && water > 0.01; age++) {
      const [ix, iz] = [Math.floor(x), Math.floor(z)];
      const [u, v] = [x - ix, z - iz];
      const [a, b, c, d] = [at(ix, iz), at(ix + 1, iz), at(ix, iz + 1), at(ix + 1, iz + 1)];
      const height = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      const [gx, gz] = [(b - a) * (1 - v) + (d - c) * v, (c - a) * (1 - u) + (d - b) * u];
      dx = dx * inertia - gx * (1 - inertia);
      dz = dz * inertia - gz * (1 - inertia);
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) break;
      dx /= len;
      dz /= len;
      const [nx, nz] = [x + dx, z + dz];
      if (nx < margin || nz < margin || nx >= n - 1 - margin || nz >= n - 1 - margin) {
        drained = true;
        break;
      }
      const [jx, jz] = [Math.floor(nx), Math.floor(nz)];
      const [p, q] = [nx - jx, nz - jz];
      const next = at(jx, jz) * (1 - p) * (1 - q) + at(jx + 1, jz) * p * (1 - q) + at(jx, jz + 1) * (1 - p) * q + at(jx + 1, jz + 1) * p * q;
      const dh = next - height;
      const cap = Math.max(-dh, 0.01) * speed * water * capacity;
      if (dh > 0 || sediment > cap) {
        const amount = dh > 0 ? Math.min(sediment, dh) : (sediment - cap) * deposit;
        sediment -= amount;
        hc[iz * n + ix] += amount * (1 - u) * (1 - v);
        hc[iz * n + ix + 1] += amount * u * (1 - v);
        hc[(iz + 1) * n + ix] += amount * (1 - u) * v;
        hc[(iz + 1) * n + ix + 1] += amount * u * v;
      } else {
        const steep = smoothstep(g0, g1, Math.hypot(gx, gz));
        const take = Math.min((cap - sediment) * erode * steep, -dh);
        if (take > 0) {
          for (const [kx, kz, w] of kernel) {
            const i = (iz + kz) * n + ix + kx;
            const part = Math.min(Math.max(0, hc[i] - 0.02), (take * w) / ksum);
            hc[i] -= part;
            sediment += part;
          }
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * 8));
      water *= 1 - evap;
      x = nx;
      z = nz;
    }
    if (!drained && sediment > 0) {
      const [ix, iz] = [Math.floor(x), Math.floor(z)];
      hc[iz * n + ix] += sediment;
    }
  }
  for (let i = 0; i < hc.length; i++) h[i] = hc[i] * cell;
}
// Thermal settling: where two neighbours differ by more than the angle of repose allows, the excess slides from the higher to the lower. Each
// vertex gives at most an eighth of the excess to each neighbour, so nothing overshoots and no material is lost.
export function thermalSettle(h: Float32Array, n: number, cell: number, passes: number, talusDeg: number, rate = 0.5): void {
  const limit = Math.tan((talusDeg * Math.PI) / 180) * cell;
  const delta = new Float32Array(n * n);
  const pairs: [number, number][] = [[1, 0], [0, 1], [1, 1], [-1, 1]];
  for (let pass = 0; pass < passes; pass++) {
    delta.fill(0);
    for (let j = 1; j < n - 1; j++) {
      for (let i = 1; i < n - 1; i++) {
        const at = j * n + i;
        for (const [dx, dz] of pairs) {
          const [ni, nj] = [i + dx, j + dz];
          if (ni < 1 || ni >= n - 1 || nj >= n - 1) continue;
          const o = nj * n + ni;
          const diff = h[at] - h[o];
          const excess = Math.abs(diff) - limit * Math.hypot(dx, dz);
          if (excess <= 0) continue;
          const move = (Math.sign(diff) * excess * rate) / 8;
          delta[at] -= move;
          delta[o] += move;
        }
      }
    }
    for (let i = 0; i < h.length; i++) h[i] += delta[i];
  }
}
// Soft ground is blurred, the more the flatter it is, with a radius that varies by place (one fixed radius makes ground look filtered)
export function polishFlats(h: Float32Array, n: number, cell: number, passes = 2): void {
  const tmp = new Float32Array(h.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let j = 1; j < n - 1; j++) {
      for (let i = 1; i < n - 1; i++) {
        const at = j * n + i;
        const slope = Math.hypot(h[at + 1] - h[at - 1], h[at + n] - h[at - n]) / (2 * cell);
        const flat = 1 - smoothstep(0.04, 0.22, slope);
        if (flat <= 0) {
          tmp[at] = h[at];
          continue;
        }
        const wide = (hash2(i, j, pass + 3) < 0.5 ? 1 : 2) as 1 | 2;
        let sum = 0;
        for (let dz = -wide; dz <= wide; dz++) for (let dx = -wide; dx <= wide; dx++) sum += h[Math.max(0, Math.min(n - 1, j + dz)) * n + Math.max(0, Math.min(n - 1, i + dx))];
        tmp[at] = lerp(h[at], sum / ((2 * wide + 1) ** 2), flat * 0.85);
      }
    }
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) h[j * n + i] = tmp[j * n + i];
  }
}

// ---- The ground
const CACHE = new Map<string, Terrain>();
export function makeTerrain(spec: TerrainSpec): Terrain {
  const st = terrainStyleOf(spec.biome);
  const { n, size } = spec;
  const cell = size / (n - 1);
  const relief = (spec.relief ?? st.relief) * (spec.scale ?? 1);
  const seed = ((spec.seed | 0) * 2654435761) >>> 0;
  const s0 = seed & 0xffff;
  const freq = 1 / st.wave;
  const h = new Float32Array(n * n);
  const t: Terrain = { seed: spec.seed, biome: spec.biome, n, size, cell, x0: -size / 2, z0: -size / 2, h, min: 0, max: 0, flow: new Float32Array(n * n) };
  if (relief <= 0) return t;
  // 1 Sculpt: the base, the ridges and where the ridges are allowed, each normalised to 0..1 over the map before they are mixed
  const [base, ridge, mask] = [new Float64Array(n * n), new Float64Array(n * n), new Float64Array(n * n)];
  const [dir, phase] = (() => { const a = ((seed >>> 8) & 0xff) / 255 * Math.PI * 2; return [[Math.cos(a), Math.sin(a)], (seed >>> 4) & 0xff] as const; })();
  const dune = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [x, y] = [(i / (n - 1)) * freq, (j / (n - 1)) * freq];
      // Warp: the noise is looked up where a noise of its own has pushed the point (nothing then lines up with the grid)
      const [wx, wy] = st.warp ? [terrainNoise(x + 3.1, y + 7.7, s0 + 5, 3) * st.warp, terrainNoise(x + 11.3, y + 1.9, s0 + 9, 3) * st.warp] : [0, 0];
      const [qx, qy] = [x + wx, y + wy];
      const at = j * n + i;
      base[at] = dampedFbm(qx, qy, s0, st.octaves);
      ridge[at] = ridgedFbm(qx * 1.4 + 2.3, qy * 1.4 + 6.1, s0 + 31, st.octaves);
      mask[at] = terrainNoise(x * 0.8 + 9.7, y * 0.8 + 4.2, s0 + 43, 3);
      if (st.dunes) {
        // A dune: a long gentle windward side and a short steep slip face, crests bent by the warp, in fields the mask picks
        const f = (qx * dir[0] + qy * dir[1]) * 9 * 1 + phase + terrainNoise(qx * 2, qy * 2, s0 + 51, 3) * 1.6;
        const fr = f - Math.floor(f);
        dune[at] = fr < 0.72 ? smoothstep(0, 0.72, fr) : 1 - smoothstep(0.72, 1, fr);
      }
    }
  }
  const norm = (a: Float64Array) => {
    let [lo, hi] = [Infinity, -Infinity];
    for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    const span = hi - lo || 1;
    for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / span;
  };
  norm(base);
  norm(ridge);
  norm(mask);
  const craterList = Array.from({ length: st.craters }, (_, k) => {
    const r = rng(seed + 977 * (k + 1));
    return { x: r(), y: r(), r: 0.025 + r() * 0.06, depth: 0.1 + r() * 0.16 };
  });
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const at = j * n + i;
      // Where the mask is high there are mountains: ridged ground mixed in by it
      const m = smoothstep(0.45, 0.8, mask[at]) * st.ridges;
      let e = lerp(base[at], ridge[at], m);
      e = Math.pow(clamp01(e), st.power);
      if (st.terrace) {
        // Mesas: flat tops and cliffs between them, only part of the way
        const stepped = e * st.terrace;
        const fl = Math.floor(stepped);
        const flat = (fl + smoothstep(0.35, 0.65, stepped - fl)) / st.terrace;
        e = lerp(e, flat, 0.55);
      }
      if (st.dunes) e += st.dunes * 0.22 * dune[at] * (1 - smoothstep(0.55, 0.9, e)) * smoothstep(0.2, 0.5, mask[at]);
      for (const c of craterList) {
        const d = Math.hypot(i / (n - 1) - c.x, j / (n - 1) - c.y) / c.r;
        if (d < 1) e -= c.depth * (1 - d * d);
        else if (d < 1.35) e += c.depth * 0.45 * (1 - (d - 1) / 0.35);
      }
      h[at] = e;
    }
  }
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i < h.length; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; }
  for (let i = 0; i < h.length; i++) h[i] = ((h[i] - lo) / (hi - lo || 1)) * relief;
  // 2-5 Weathering
  const level = spec.erosion ?? "full";
  const amount = level === "none" ? 0 : level === "light" ? 0.3 : 1;
  const flow = amount > 0 && st.stream > 0 ? streamPower(h, n, Math.max(2, Math.round(8 * amount)), 0.12 * (st.stream / 14) * (amount < 1 ? 0.6 : 1), 0.5, 250, relief * 0.00012) : streamPower(h, n, 1, 0);
  if (amount > 0 && st.droplets > 0) erodeDroplets(h, n, cell, Math.round(n * n * st.droplets * amount * 0.6), seed + 7, { gate: [Math.tan(0.32), Math.tan(0.6)] });
  if (amount > 0 && st.thermal > 0) thermalSettle(h, n, cell, Math.round(st.thermal * (amount < 1 ? 0.5 : 1)), st.talus);
  if (amount > 0) polishFlats(h, n, cell, amount < 1 ? 1 : 2);
  // The flow for the colouring: the area on a log scale, 0..1
  let top = 1;
  for (let i = 0; i < flow.length; i++) if (flow[i] > top) top = flow[i];
  for (let i = 0; i < flow.length; i++) t.flow[i] = Math.log(flow[i]) / Math.log(top || 1);
  // The rim: brought down to a flat skirt, so that the plain that goes on to the horizon joins it
  if (spec.rim) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const edge = Math.min(i, j, n - 1 - i, n - 1 - j) / (n - 1);
        h[j * n + i] *= smoothstep(0, spec.rim, edge);
      }
    }
  }
  refresh(t);
  return t;
}
// The same spec, the same ground, made once (the cost is the weathering): a few are kept
export function terrainFor(spec: TerrainSpec, ground?: { discs?: LevelDisc[]; roads?: LevelRoad[] }): Terrain {
  const key = JSON.stringify([spec, ground ?? null]);
  const have = CACHE.get(key);
  if (have) return have;
  const t = makeTerrain(spec);
  for (const d of ground?.discs ?? []) levelDisc(t, d.x, d.z, d.r, d.blend, d.h);
  for (const r of ground?.roads ?? []) levelRoad(t, r.line, r.width, r.blend);
  if (ground?.discs?.length || ground?.roads?.length) refresh(t);
  if (CACHE.size >= 6) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, t);
  return t;
}

// ---- Level ground where something is built or driven
export interface LevelDisc { x: number; z: number; r: number; blend: number; h?: number }
export interface LevelRoad { line: [number, number][]; width: number; blend: number }
// A disc of ground made level at `h` (the mean of what was there by default) out to `r`, blended back into the land over `blend` more
export function levelDisc(t: Terrain, x: number, z: number, r: number, blend: number, h?: number): number {
  let target = h;
  if (target === undefined) {
    let [sum, count] = [0, 0];
    for (let a = 0; a < 12; a++) for (const f of [0, 0.5, 1]) { sum += terrainHeight(t, x + Math.cos((a / 12) * Math.PI * 2) * r * f, z + Math.sin((a / 12) * Math.PI * 2) * r * f); count++; }
    target = sum / count;
  }
  const reach = r + blend;
  const [i0, i1, j0, j1] = [Math.max(0, Math.floor((x - reach - t.x0) / t.cell)), Math.min(t.n - 1, Math.ceil((x + reach - t.x0) / t.cell)), Math.max(0, Math.floor((z - reach - t.z0) / t.cell)), Math.min(t.n - 1, Math.ceil((z + reach - t.z0) / t.cell))];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(t.x0 + i * t.cell - x, t.z0 + j * t.cell - z);
      const w = 1 - smoothstep(r, reach, d);
      if (w > 0) t.h[j * t.n + i] = lerp(t.h[j * t.n + i], target, w);
    }
  }
  return target;
}
// A road laid over the land following its contour: the heights along the line are smoothed (a long moving average), and the ground within half the
// width of it is brought to that height, blended back into the land over `blend`. Cuts and fills are as deep as the smoothing makes them.
export function levelRoad(t: Terrain, line: [number, number][], width: number, blend: number): void {
  const pts: [number, number][] = [];
  for (let k = 1; k < line.length; k++) {
    const [a, b] = [line[k - 1], line[k]];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / t.cell));
    for (let s = 0; s < steps; s++) pts.push([lerp(a[0], b[0], s / steps), lerp(a[1], b[1], s / steps)]);
  }
  pts.push(line[line.length - 1]);
  const raw = pts.map(([x, z]) => terrainHeight(t, x, z));
  const window = Math.max(2, Math.round(260 / t.cell));
  const prof = raw.map((_, i) => {
    let [sum, count] = [0, 0];
    for (let o = -window; o <= window; o++) { const q = raw[Math.max(0, Math.min(raw.length - 1, i + o))]; sum += q; count++; }
    return sum / count;
  });
  const reach = width / 2 + blend;
  const best = new Float32Array(t.h.length).fill(Infinity);
  const target = new Float32Array(t.h.length);
  for (let k = 1; k < pts.length; k++) {
    const [a, b] = [pts[k - 1], pts[k]];
    const [i0, i1, j0, j1] = [Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - t.x0) / t.cell)), Math.min(t.n - 1, Math.ceil((Math.max(a[0], b[0]) + reach - t.x0) / t.cell)), Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - t.z0) / t.cell)), Math.min(t.n - 1, Math.ceil((Math.max(a[1], b[1]) + reach - t.z0) / t.cell))];
    const [sx, sz] = [b[0] - a[0], b[1] - a[1]];
    const len2 = sx * sx + sz * sz || 1;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const [px, pz] = [t.x0 + i * t.cell, t.z0 + j * t.cell];
        const u = clamp01(((px - a[0]) * sx + (pz - a[1]) * sz) / len2);
        const d = Math.hypot(px - (a[0] + sx * u), pz - (a[1] + sz * u));
        if (d < best[j * t.n + i]) {
          best[j * t.n + i] = d;
          target[j * t.n + i] = lerp(prof[k - 1], prof[k], u);
        }
      }
    }
  }
  for (let i = 0; i < t.h.length; i++) {
    if (best[i] >= reach) continue;
    t.h[i] = lerp(t.h[i], target[i], 1 - smoothstep(width / 2, reach, best[i]));
  }
}

// ---- Colour: from where the water went and how steep the ground is
const HEX = new Map<string, [number, number, number]>();
const rgb = (hex: string): [number, number, number] => {
  let c = HEX.get(hex);
  if (!c) HEX.set(hex, (c = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]));
  return c;
};
// How much of each ground there is at a point (rock, soil, sand, snow, wet: each 0..1, rock and snow taking from the rest)
export function terrainSplat(t: Terrain, x: number, z: number, over: { alt?: number; slope?: number } = {}): { rock: number; soil: number; sand: number; snow: number; wet: number } {
  const st = terrainStyleOf(t.biome);
  const alt = over.alt ?? (terrainHeight(t, x, z) - t.min) / Math.max(1, t.max - t.min);
  const slope = over.slope ?? terrainSlope(t, x, z);
  // Concave ground (lower than what is round it) collects, convex sheds
  const e = t.cell * 2;
  const around = (terrainHeight(t, x + e, z) + terrainHeight(t, x - e, z) + terrainHeight(t, x, z + e) + terrainHeight(t, x, z - e)) / 4;
  const curve = (around - terrainHeight(t, x, z)) / e;
  const flow = terrainFlow(t, x, z);
  const noise = terrainNoise(x * 0.02, z * 0.02, t.seed + 71, 3) * 0.5;
  let rock = smoothstep(0.42, 0.85, slope + noise * 0.15) * (1 - 0.5 * smoothstep(0.1, 0.3, curve)) + smoothstep(0.6, 1, alt) * 0.25 * smoothstep(0.2, 0.5, slope);
  rock = clamp01(rock);
  const wet = clamp01(smoothstep(0.55, 0.9, flow) * (1 - smoothstep(0.15, 0.4, slope)) * 0.9);
  const snow = clamp01(smoothstep(st.snow, st.snow + 0.12, alt + noise * 0.08) * (1 - 0.75 * smoothstep(0.55, 0.95, slope)));
  const sand = clamp01((st.sandy + wet * 0.35 + smoothstep(0.1, 0.4, curve) * 0.2 * (1 - st.sandy)) * (1 - smoothstep(0.25, 0.5, slope)) * (1 - rock));
  return { rock, soil: clamp01(1 - rock - sand - snow), sand, snow, wet };
}
// The colour (0..1 each) of the ground at a point
// (`over`: the height share and slope where the ground drawn is not the terrain's own, as a course's, flattened near its track)
export function terrainColorAt(t: Terrain, x: number, z: number, over: { alt?: number; slope?: number } = {}): [number, number, number] {
  const st = terrainStyleOf(t.biome);
  const P = st.palette;
  const alt = over.alt ?? (terrainHeight(t, x, z) - t.min) / Math.max(1, t.max - t.min);
  const s = terrainSplat(t, x, z, over);
  const [low, high, rock, sand, snow, wet] = [rgb(P.low), rgb(P.high), rgb(P.rock), rgb(P.sand), rgb(P.snow), rgb(P.wet)];
  // Grass or soil is greener low and drier with altitude
  const soil = [0, 1, 2].map((k) => lerp(low[k], high[k], smoothstep(0.1, 0.7, alt)));
  const out = [0, 1, 2].map((k) => {
    let c = soil[k] * s.soil + sand[k] * s.sand + rock[k] * s.rock;
    const w = s.soil + s.sand + s.rock;
    c = w > 0 ? c / w : soil[k];
    c = lerp(c, wet[k], s.wet * 0.7);
    return lerp(c, snow[k], s.snow);
  });
  // A little variation, and the dark of the hollows (ambient occlusion from the curve)
  const fine = 1 + terrainNoise(x * 0.15, z * 0.15, t.seed + 83, 3) * 0.07;
  const e = t.cell * 2;
  const hollow = clamp01(((terrainHeight(t, x + e, z) + terrainHeight(t, x - e, z) + terrainHeight(t, x, z + e) + terrainHeight(t, x, z - e)) / 4 - terrainHeight(t, x, z)) / e) * 0.22;
  return [clamp01(out[0] * fine * (1 - hollow)), clamp01(out[1] * fine * (1 - hollow)), clamp01(out[2] * fine * (1 - hollow))];
}

// ---- Dressing: rocks and trees where they can stand. A jittered grid (blue-noise-like, never in clumps or rows), kept where the slope, the height and
// the wetness allow, thinned by `density`
export interface ScatterRule { spacing: number; density?: number; minSlope?: number; maxSlope?: number; minAlt?: number; maxAlt?: number; minFlow?: number; maxFlow?: number; seed?: number }
export function scatterOn(t: Terrain, rule: ScatterRule, within?: (x: number, z: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  const rand = rng((rule.seed ?? 1) * 131 + t.seed);
  const per = Math.ceil(t.size / rule.spacing);
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const [x, z] = [t.x0 + (i + rand()) * rule.spacing, t.z0 + (j + rand()) * rule.spacing];
      const keep = rand();
      if (keep > (rule.density ?? 1)) continue;
      if (within && !within(x, z)) continue;
      const slope = terrainSlope(t, x, z);
      if (slope < (rule.minSlope ?? 0) || slope > (rule.maxSlope ?? 9)) continue;
      const alt = (terrainHeight(t, x, z) - t.min) / Math.max(1, t.max - t.min);
      if (alt < (rule.minAlt ?? 0) || alt > (rule.maxAlt ?? 1)) continue;
      const flow = terrainFlow(t, x, z);
      if (flow < (rule.minFlow ?? 0) || flow > (rule.maxFlow ?? 1)) continue;
      out.push([x, z]);
    }
  }
  return out;
}
