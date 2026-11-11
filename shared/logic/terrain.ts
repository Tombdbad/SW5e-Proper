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
export interface TerrainStyle { relief: number; wave: number; octaves: number; warp: number; ridges: number; power: number; terrace: number; dunes: number; craters: number; stream: number; droplets: number; thermal: number; talus: number; snow: number; sandy: number; lakes: number; palette: TerrainPalette }
export const TERRAIN_STYLES: Record<string, TerrainStyle> = {
  temperate: { relief: 150, wave: 0.45, octaves: 6, warp: 0.55, ridges: 0.35, power: 1.5, terrace: 0, dunes: 0, craters: 0, stream: 14, droplets: 1, thermal: 8, talus: 34, snow: 0.93, sandy: 0.04, lakes: 2, palette: { low: "#4d7c3c", high: "#82915a", rock: "#7d766b", sand: "#cdbb8a", snow: "#f2f5f8", wet: "#3b5a30" } },
  forest: { relief: 190, wave: 0.4, octaves: 6, warp: 0.6, ridges: 0.4, power: 1.4, terrace: 0, dunes: 0, craters: 0, stream: 14, droplets: 1, thermal: 8, talus: 34, snow: 0.9, sandy: 0.02, lakes: 3, palette: { low: "#2f5e2e", high: "#4e6c3a", rock: "#6f695f", sand: "#a8a070", snow: "#eef2f5", wet: "#27472a" } },
  jungle: { relief: 230, wave: 0.3, octaves: 6, warp: 0.75, ridges: 0.3, power: 1.3, terrace: 0, dunes: 0, craters: 0, stream: 18, droplets: 1.2, thermal: 8, talus: 38, snow: 2, sandy: 0.02, lakes: 2, palette: { low: "#2a7a33", high: "#3d8a3c", rock: "#5e6a4c", sand: "#b9a874", snow: "#e6efe6", wet: "#1f5a2c" } },
  swamp: { relief: 34, wave: 0.5, octaves: 5, warp: 0.4, ridges: 0, power: 2.2, terrace: 0, dunes: 0, craters: 0, stream: 5, droplets: 0.3, thermal: 6, talus: 28, snow: 2, sandy: 0.03, lakes: 4, palette: { low: "#4b5e38", high: "#5d6a42", rock: "#5e5a4a", sand: "#6a6a48", snow: "#dfe4dc", wet: "#2f4a3c" } },
  ocean: { relief: 110, wave: 0.5, octaves: 5, warp: 0.5, ridges: 0.15, power: 1.8, terrace: 0, dunes: 0, craters: 0, stream: 10, droplets: 0.6, thermal: 8, talus: 32, snow: 2, sandy: 0.25, lakes: 3, palette: { low: "#4d8a52", high: "#62804c", rock: "#706b61", sand: "#e0d0a0", snow: "#f2f6f8", wet: "#3c6a48" } },
  desert: { relief: 130, wave: 0.4, octaves: 5, warp: 0.7, ridges: 0.2, power: 1.2, terrace: 5, dunes: 0.5, craters: 0, stream: 4, droplets: 0.3, thermal: 14, talus: 33, snow: 2, sandy: 0.7, lakes: 0, palette: { low: "#d4ad6c", high: "#c4945a", rock: "#9a7550", sand: "#e0bf7e", snow: "#efe2c8", wet: "#a8844f" } },
  ice: { relief: 230, wave: 0.38, octaves: 6, warp: 0.5, ridges: 0.6, power: 1.2, terrace: 0, dunes: 0, craters: 0, stream: 8, droplets: 0.6, thermal: 10, talus: 36, snow: 0.3, sandy: 0, lakes: 2, palette: { low: "#dfe8ee", high: "#cfdce6", rock: "#7f8b97", sand: "#c8dfee", snow: "#ffffff", wet: "#9fc2dc" } },
  volcanic: { relief: 270, wave: 0.35, octaves: 6, warp: 0.5, ridges: 0.6, power: 1.1, terrace: 0, dunes: 0, craters: 5, stream: 5, droplets: 0.2, thermal: 12, talus: 38, snow: 2, sandy: 0.05, lakes: 0, palette: { low: "#4a3c36", high: "#5e4e45", rock: "#6e5e54", sand: "#3a2c26", snow: "#8a7a70", wet: "#2a1a18" } },
  urban: { relief: 28, wave: 0.5, octaves: 4, warp: 0.3, ridges: 0, power: 2.4, terrace: 0, dunes: 0, craters: 0, stream: 0, droplets: 0, thermal: 4, talus: 30, snow: 2, sandy: 0, lakes: 1, palette: { low: "#6a707a", high: "#7a808a", rock: "#5a6068", sand: "#8a8a88", snow: "#e8ecf0", wet: "#4a5058" } },
  barren: { relief: 160, wave: 0.4, octaves: 6, warp: 0.55, ridges: 0.4, power: 1.3, terrace: 0, dunes: 0, craters: 14, stream: 3, droplets: 0.2, thermal: 14, talus: 34, snow: 2, sandy: 0.12, lakes: 0, palette: { low: "#8f8573", high: "#a0957f", rock: "#6f675b", sand: "#a39879", snow: "#d8d2c6", wet: "#6a6156" } },
  "gas giant": { relief: 0, wave: 0.5, octaves: 3, warp: 0, ridges: 0, power: 1, terrace: 0, dunes: 0, craters: 0, stream: 0, droplets: 0, thermal: 0, talus: 30, snow: 2, sandy: 0, lakes: 0, palette: { low: "#c98a52", high: "#d9a36a", rock: "#a8683a", sand: "#e8c99a", snow: "#f6ead8", wet: "#a8683a" } },
};
export const terrainStyleOf = (biome: string): TerrainStyle => TERRAIN_STYLES[biome] ?? TERRAIN_STYLES.temperate;

export interface TerrainSpec {
  seed: number; biome: string;
  // Metres across, and vertices along a side
  size: number; n: number;
  // `relief` replaces the style's, `scale` multiplies it; `erosion` how much of the weathering is done (the cost: "none" 0, "light" about a quarter, "full")
  relief?: number; scale?: number; erosion?: "none" | "light" | "full";
  // `wave` replaces the style's broadest swell (a share of the map across: a district's ground wants swells of a few tens of metres)
  wave?: number;
  // Where the ground is brought down to `edge` (a share of the relief) at the rim of the map, so that a flat skirt joins it: the width of the
  // fall as a share of the map's side (0 none)
  rim?: number;
  // Bowls dug on the flat, wet ground for lakes to stand in (see `carveBasins`)
  basins?: number;
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
  const freq = 1 / (spec.wave ?? st.wave);
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
  if (spec.basins) carveBasins(t, spec.basins, spec.seed);
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
// A box of ground (a building's pad, a paved way between buildings: an axis-aligned rectangle from x, z, `w` by `d`) made level at `h` out to `r`
// past its sides, blended back into the land over `blend` more: `levelDisc` for what is built square
export function levelBox(t: Terrain, x: number, z: number, w: number, d: number, r: number, blend: number, h: number): void {
  const reach = r + blend;
  const [i0, i1, j0, j1] = [Math.max(0, Math.floor((x - reach - t.x0) / t.cell)), Math.min(t.n - 1, Math.ceil((x + w + reach - t.x0) / t.cell)), Math.max(0, Math.floor((z - reach - t.z0) / t.cell)), Math.min(t.n - 1, Math.ceil((z + d + reach - t.z0) / t.cell))];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const [px, pz] = [t.x0 + i * t.cell, t.z0 + j * t.cell];
      const out = Math.hypot(Math.max(x - px, 0, px - (x + w)), Math.max(z - pz, 0, pz - (z + d)));
      const k = 1 - smoothstep(r, reach, out);
      if (k > 0) t.h[j * t.n + i] = lerp(t.h[j * t.n + i], h, k);
    }
  }
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
// What the ground drawn is, where it is not the terrain's own (a course's, flattened near its track, cut by a gorge): the height share (0..1), the
// slope, and the curve (the mean of the ground round it, less its own, over the distance: positive in a hollow)
export interface GroundOver { alt?: number; slope?: number; curve?: number }
// How much of each ground there is at a point (rock, soil, sand, snow, wet: each 0..1, rock and snow taking from the rest)
export function terrainSplat(t: Terrain, x: number, z: number, over: GroundOver = {}): { rock: number; soil: number; sand: number; snow: number; wet: number } {
  const st = terrainStyleOf(t.biome);
  const alt = over.alt ?? (terrainHeight(t, x, z) - t.min) / Math.max(1, t.max - t.min);
  const slope = over.slope ?? terrainSlope(t, x, z);
  // Concave ground (lower than what is round it) collects, convex sheds
  const e = t.cell * 2;
  const curve = over.curve ?? ((terrainHeight(t, x + e, z) + terrainHeight(t, x - e, z) + terrainHeight(t, x, z + e) + terrainHeight(t, x, z - e)) / 4 - terrainHeight(t, x, z)) / e;
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
export function terrainColorAt(t: Terrain, x: number, z: number, over: GroundOver = {}): [number, number, number] {
  return colourOf(t, x, z, over, terrainSplat(t, x, z, over));
}
// What a shader needs at a point (2026-11-11, ground material v2): the palette colour (hue, snow, sand, wet) and the weights of the ground's layers, so that
// the photographs lend only their pattern and relief: rock (steep, convex, high), pale (sand, snow: the light ground) and wet (mud where water gathers); the
// soil is what is left. One call finds the splat once.
export interface TerrainSurface { color: [number, number, number]; rock: number; pale: number; wet: number }
export function terrainSurface(t: Terrain, x: number, z: number, over: GroundOver = {}): TerrainSurface {
  const s = terrainSplat(t, x, z, over);
  const total = s.rock + s.sand + s.snow + s.wet;
  const k = total > 1 ? 1 / total : 1;
  return { color: colourOf(t, x, z, over, s), rock: s.rock * k, pale: clamp01(s.sand + s.snow) * k, wet: s.wet * k };
}
function colourOf(t: Terrain, x: number, z: number, over: GroundOver, s: ReturnType<typeof terrainSplat>): [number, number, number] {
  const st = terrainStyleOf(t.biome);
  const P = st.palette;
  const alt = over.alt ?? (terrainHeight(t, x, z) - t.min) / Math.max(1, t.max - t.min);
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
  const hollow = clamp01(over.curve ?? ((terrainHeight(t, x + e, z) + terrainHeight(t, x - e, z) + terrainHeight(t, x, z + e) + terrainHeight(t, x, z - e)) / 4 - terrainHeight(t, x, z)) / e) * 0.22;
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

// ---- The kit's places (2026-11-11, tools/blender/build-terrain-kit.py): where a boulder, a heap of scree and an overhanging ledge stand on the land. Rules
// from the ground, not noise: boulders on the ground that is not flat (more on a steep one), scree at the foot of a steep slope (steep here, gentle a little
// downhill: where the loose rock comes to rest), and a ledge only on a cliff (past 40 degrees), turned to face downhill, its back sunk into the slope.
export type KitKind = "boulder_a" | "boulder_b" | "boulder_c" | "scree" | "ledge_a" | "ledge_b";
export interface KitSpot { kind: KitKind; x: number; z: number; yaw: number; scale: number; sink: number }
export function kitSpots(t: Terrain, o: { boulders: number; scree?: number; ledges?: number; seed?: number; within?: (x: number, z: number) => boolean; cap?: number }): KitSpot[] {
  const out: KitSpot[] = [];
  const rand = rng((o.seed ?? 1) * 977 + t.seed);
  const room = (x: number, z: number) => !o.within || o.within(x, z);
  for (const [x, z] of scatterOn(t, { spacing: 22, density: o.boulders, minSlope: 0.12, maxSlope: 0.95, seed: 5 }, room)) {
    const slope = terrainSlope(t, x, z);
    out.push({ kind: (["boulder_a", "boulder_b", "boulder_c"] as const)[Math.floor(rand() * 3)], x, z, yaw: rand() * Math.PI * 2, scale: 0.7 + rand() * 0.9 + slope * 0.8, sink: 0.28 });
  }
  if (o.scree) {
    for (const [x, z] of scatterOn(t, { spacing: 26, density: o.scree, minSlope: 0.3, maxSlope: 0.85, seed: 7 }, room)) {
      // The foot: gentle ground a little downhill
      const [gx, gz] = terrainGradient(t, x, z);
      const len = Math.hypot(gx, gz) || 1;
      if (terrainSlope(t, x - (gx / len) * 14, z - (gz / len) * 14) > 0.24) continue;
      out.push({ kind: "scree", x, z, yaw: rand() * Math.PI * 2, scale: 0.9 + rand() * 0.9, sink: 0.05 });
    }
  }
  if (o.ledges) {
    for (const [x, z] of scatterOn(t, { spacing: 30, density: o.ledges, minSlope: 0.85, seed: 9 }, room)) {
      const [gx, gz] = terrainGradient(t, x, z);
      // facing downhill: the piece's front (+z) turned by yaw is (sin, cos)
      out.push({ kind: rand() < 0.5 ? "ledge_a" : "ledge_b", x, z, yaw: Math.atan2(-gx, -gz), scale: 1 + rand() * 0.7, sink: 0.35 });
    }
  }
  return o.cap ? out.slice(0, o.cap) : out;
}

// ---- The ecology (2026-11-11, the Megascans packs: tools/megascans.json, tools/blender/build-megascans-pack.py): what grows or lies where, by what each needs,
// not by noise. Each entry names a piece of its biome's pack, its tier (ground cover is drawn near the place only; mid is palms and dead trees; rock) and what it
// needs of the ground: slope, height share, wetness (the flow). `ecologySpots` is pure and seeded: the same land, the same spots, on the server and in every browser.
export interface EcoEntry { kind: string; tier: "cover" | "mid" | "rock"; spacing: number; density: number; slope?: [number, number]; alt?: [number, number]; flow?: [number, number]; scale: [number, number]; variants: number; sink?: number }
const E = (kind: string, tier: EcoEntry["tier"], spacing: number, density: number, scale: [number, number], o: Partial<EcoEntry> = {}): EcoEntry => ({ kind, tier, spacing, density, scale, variants: tier === "rock" ? 1 : 3, ...o });
const FOREST_ECO: EcoEntry[] = [
  E("bracken_fern", "cover", 6, 0.7, [0.8, 1.4], { slope: [0, 0.5], alt: [0, 0.8] }),
  E("grass_clumps", "cover", 4, 0.6, [0.8, 1.6], { slope: [0, 0.45] }),
  E("forest_boulder", "rock", 22, 0.5, [0.8, 1.8], { slope: [0.08, 0.9], sink: 0.2 }),
  E("mossy_forest_boulder", "rock", 34, 0.5, [0.8, 1.5], { slope: [0.05, 0.8], flow: [0.15, 1], sink: 0.2 }),
  E("dead_tree", "mid", 70, 0.3, [0.9, 1.3], { slope: [0, 0.5], alt: [0, 0.8] }),
];
// Per biome: the pack's name (public/megascans/<pack>.glb), a thinning factor and the entries; a biome with no pack has none here
export const ECOLOGY: Record<string, { pack: string; thin: number; entries: EcoEntry[] }> = {
  forest: { pack: "forest", thin: 1, entries: FOREST_ECO },
  temperate: { pack: "forest", thin: 0.6, entries: FOREST_ECO },
  ocean: { pack: "forest", thin: 0.4, entries: FOREST_ECO },
  jungle: {
    pack: "jungle", thin: 1,
    entries: [
      E("tropical_palm", "mid", 12, 0.7, [0.9, 1.5], { slope: [0, 0.55], alt: [0, 0.75] }),
      E("alexandra_palm", "mid", 20, 0.5, [1.2, 2.2], { slope: [0, 0.5], alt: [0, 0.75] }),
      E("chinese_fan_palm", "mid", 16, 0.5, [0.9, 1.5], { slope: [0, 0.5], alt: [0, 0.75] }),
      E("bracken_fern", "cover", 5, 0.8, [0.8, 1.5], { slope: [0, 0.5] }),
      E("grass_clumps", "cover", 5, 0.5, [0.8, 1.6], { slope: [0, 0.45] }),
      E("mossy_forest_boulder", "rock", 34, 0.5, [0.8, 1.6], { slope: [0.05, 0.8], sink: 0.2 }),
    ],
  },
  swamp: {
    pack: "swamp", thin: 1,
    entries: [
      E("swamp_grass", "cover", 3.5, 0.8, [0.8, 1.6], { slope: [0, 0.25] }),
      E("giant_reed", "cover", 8, 0.7, [0.9, 1.5], { slope: [0, 0.2], flow: [0.3, 1] }),
      E("mossy_forest_boulder", "rock", 40, 0.4, [0.8, 1.5], { slope: [0.03, 0.6], sink: 0.2 }),
      E("dead_tree", "mid", 55, 0.3, [0.9, 1.3], { slope: [0, 0.3] }),
    ],
  },
  desert: {
    pack: "desert", thin: 1,
    entries: [
      // (the wadis, where the water goes, are the green of a desert)
      E("xeric_grass", "cover", 7, 0.5, [0.8, 1.4], { slope: [0, 0.35], flow: [0.2, 1] }),
      E("xeric_grass", "cover", 12, 0.15, [0.7, 1.2], { slope: [0, 0.35], flow: [0, 0.2] }),
      E("rhazya", "cover", 11, 0.4, [0.8, 1.5], { slope: [0, 0.4] }),
      E("dead_shrubs", "cover", 9, 0.35, [0.8, 1.5], { slope: [0, 0.4] }),
      E("canyon_sandstone_boulder", "rock", 24, 0.6, [0.8, 2.0], { slope: [0.1, 0.9], sink: 0.2 }),
      E("desert_western_pile_rock_small_01", "rock", 55, 0.5, [0.8, 1.4], { slope: [0.05, 0.6], sink: 0.1 }),
    ],
  },
  ice: {
    pack: "ice", thin: 1,
    entries: [
      E("icelandic_boulder", "rock", 28, 0.6, [0.8, 1.6], { slope: [0.1, 0.95], sink: 0.25 }),
      E("snow_pile", "rock", 70, 0.5, [0.8, 1.6], { slope: [0, 0.45], sink: 0.15 }),
      E("dead_tree", "mid", 120, 0.2, [0.8, 1.2], { slope: [0, 0.4], alt: [0, 0.5] }),
    ],
  },
  volcanic: {
    pack: "volcanic", thin: 1,
    entries: [
      E("volcanic_dolerite_rocks", "rock", 14, 0.8, [0.8, 1.8], { slope: [0.05, 0.95], sink: 0.2 }),
      E("icelandic_boulder", "rock", 34, 0.5, [0.8, 1.6], { slope: [0.1, 0.95], sink: 0.25 }),
      E("dead_shrubs", "cover", 18, 0.25, [0.8, 1.4], { slope: [0, 0.4] }),
    ],
  },
  barren: {
    pack: "barren", thin: 1,
    entries: [
      E("limestone_rocks", "rock", 28, 0.5, [0.8, 1.6], { slope: [0.05, 0.8], sink: 0.05 }),
      E("icelandic_boulder", "rock", 40, 0.4, [0.8, 1.6], { slope: [0.1, 0.95], sink: 0.25 }),
      E("desert_western_pile_rock_small_01", "rock", 60, 0.4, [0.8, 1.4], { slope: [0.05, 0.6], sink: 0.1 }),
      E("dead_shrubs", "cover", 16, 0.3, [0.8, 1.4], { slope: [0, 0.4] }),
    ],
  },
};
// How much bigger than life the pack's pieces are stood (the user, 2026-11-11: they read too small, "at least 100%"); client/src/components/Map/packs.ts uses this
export const PACK_SCALE = 2;
// What a speeder strikes of the pack's pieces (2026-11-11, the user: "add collision hitboxes to assets in the speeder minigames"): the half-width, height and drag-through radius of
// the piece as the pack has it, before PACK_SCALE and the spot's own scale (the measured size of each model, tools/megascans.json). Ground cover (ferns, grass, shrubs) is struck by nothing.
export const ECO_HIT: Record<string, { r: number; h: number; soft?: number }> = {
  forest_boulder: { r: 0.5, h: 0.85 },
  mossy_forest_boulder: { r: 0.9, h: 1.25 },
  canyon_sandstone_boulder: { r: 0.42, h: 0.4 },
  desert_western_pile_rock_small_01: { r: 0.8, h: 0.3 },
  icelandic_boulder: { r: 0.95, h: 1.4 },
  volcanic_dolerite_rocks: { r: 0.28, h: 0.3 },
  limestone_rocks: { r: 0.8, h: 0.25 },
  snow_pile: { r: 2.6, h: 1.9, soft: 3.2 },
  dead_tree: { r: 0.4, h: 5.9 },
  tropical_palm: { r: 0.22, h: 1.5, soft: 1.0 },
  alexandra_palm: { r: 0.22, h: 1.4, soft: 0.9 },
  chinese_fan_palm: { r: 0.22, h: 1.1, soft: 1.0 },
};
export interface EcoSpot { kind: string; tier: EcoEntry["tier"]; variant: number; x: number; z: number; yaw: number; scale: number; sink: number }
// `within`: where anything may stand (not in water, not on the place); `cover`: where ground cover may (near the place only: far off a fern is a speck); `cap`: the most of
// each tier; `focus`: how far a spot is from what matters (default: the distance from the origin, the place; a race course gives its distance from the track)
export function ecologySpots(t: Terrain, biome: string, o: { within?: (x: number, z: number) => boolean; cover?: (x: number, z: number) => boolean; cap?: Partial<Record<EcoEntry["tier"], number>>; seed?: number; focus?: (x: number, z: number) => number } = {}): EcoSpot[] {
  const eco = ECOLOGY[biome];
  if (!eco) return [];
  const out: Record<string, EcoSpot[]> = { cover: [], mid: [], rock: [] };
  eco.entries.forEach((e, idx) => {
    const rand = rng((o.seed ?? 1) * 977 + t.seed + idx * 131);
    const ok = (x: number, z: number) => (!o.within || o.within(x, z)) && (e.tier !== "cover" || !o.cover || o.cover(x, z));
    const rule: ScatterRule = { spacing: e.spacing, density: e.density * eco.thin, minSlope: e.slope?.[0], maxSlope: e.slope?.[1], minAlt: e.alt?.[0], maxAlt: e.alt?.[1], minFlow: e.flow?.[0], maxFlow: e.flow?.[1], seed: 20 + idx };
    for (const [x, z] of scatterOn(t, rule, ok)) {
      out[e.tier].push({ kind: e.kind, tier: e.tier, variant: Math.floor(rand() * e.variants), x, z, yaw: rand() * Math.PI * 2, scale: e.scale[0] + rand() * (e.scale[1] - e.scale[0]), sink: e.sink ?? 0 });
    }
  });
  // The cap: nearest the place first (the origin: what the party sees), each kind of a tier taking its fair share (the first kind would else take it all)
  const spots: EcoSpot[] = [];
  for (const tier of ["rock", "mid", "cover"] as const) {
    const cap = o.cap?.[tier];
    const far = o.focus ?? ((x: number, z: number) => Math.hypot(x, z));
    const list = out[tier].sort((a, b) => far(a.x, a.z) - far(b.x, b.z));
    if (!cap || list.length <= cap) { spots.push(...list); continue; }
    const share = Math.ceil(cap / new Set(list.map((s) => s.kind)).size);
    const taken = new Map<string, number>();
    const picked: EcoSpot[] = [];
    for (const s of list) {
      const n = taken.get(s.kind) ?? 0;
      if (n >= share) continue;
      taken.set(s.kind, n + 1);
      picked.push(s);
    }
    spots.push(...picked.slice(0, cap));
  }
  return spots;
}

// ---- Water (2026-11-10; the user: "lakes where drainage pools, a river network on the local map"). Where the ground is a bowl the water stands in it (priority-flood
// fill, Barnes 2014: the level of each hollow is the lowest point of its rim), and where a great deal of rain has come down the water runs: the vertices
// of the stream pass with the most drainage (`flow`) are the rivers, followed down to the edge or a lake. `carveBasins` digs a few bowls on the flat, wet
// ground first (noise-made land has few closed hollows of its own), so that a land has lakes where the water would gather.
export interface TerrainWater {
  // The water's surface at each vertex, or NaN where it is dry: a lake's flat level, a river's level a little over its bed
  surface: Float32Array;
  lakes: { cells: number; level: number; x: number; z: number; depth: number }[];
  // The rivers as lines downstream (metres), each with the largest `flow` (0..1) along it, for the width
  rivers: { line: [number, number][]; flow: number }[];
}
// Dig `count` bowls on the flattest, wettest ground (a few metres deep, 60 to 160 m across), so that water will stand in them
export function carveBasins(t: Terrain, count: number, seed: number): void {
  const rand = rng(seed * 7 + t.seed);
  const picks: { i: number; j: number; score: number }[] = [];
  const margin = 8;
  for (let j = margin; j < t.n - margin; j += 2) {
    for (let i = margin; i < t.n - margin; i += 2) {
      const at = j * t.n + i;
      const slope = Math.hypot(t.h[at + 1] - t.h[at - 1], t.h[at + t.n] - t.h[at - t.n]) / (2 * t.cell);
      picks.push({ i, j, score: t.flow[at] * 1.2 - slope * 3 + rand() * 0.25 - ((t.h[at] - t.min) / Math.max(1, t.max - t.min)) * 0.8 });
    }
  }
  picks.sort((a, b) => b.score - a.score);
  const made: { i: number; j: number }[] = [];
  for (const p of picks) {
    if (made.length >= count) break;
    if (made.some((m) => Math.hypot(m.i - p.i, m.j - p.j) * t.cell < 500)) continue;
    made.push(p);
    const radius = 60 + rand() * 100;
    const depth = Math.min(8, 3 + rand() * 4);
    const reach = Math.ceil(radius / t.cell) + 2;
    for (let j = p.j - reach; j <= p.j + reach; j++) {
      for (let i = p.i - reach; i <= p.i + reach; i++) {
        if (i < 1 || j < 1 || i >= t.n - 1 || j >= t.n - 1) continue;
        const d = Math.hypot(i - p.i, j - p.j) * t.cell;
        // A bowl: its bottom `depth` under the rim's own height, the sides eased
        if (d < radius * 1.4) t.h[j * t.n + i] -= depth * (1 - smoothstep(radius * 0.3, radius * 1.4, d));
      }
    }
  }
  refresh(t);
}
// The filled surface of a grid: each vertex's height raised to the lowest rim that holds it (a binary heap flooding in from the edge, lowest first)
function filled(t: Terrain): Float32Array {
  const { n, h } = t;
  const out = Float32Array.from(h);
  const done = new Uint8Array(n * n);
  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (out[heap[p]] <= out[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const [l, r] = [2 * k + 1, 2 * k + 2];
        let m = k;
        if (l < heap.length && out[heap[l]] < out[heap[m]]) m = l;
        if (r < heap.length && out[heap[r]] < out[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (let i = 0; i < n; i++) {
    for (const at of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
      if (!done[at]) {
        done[at] = 1;
        push(at);
      }
    }
  }
  while (heap.length) {
    const at = pop();
    const [x, z] = [at % n, Math.floor(at / n)];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [nx, nz] = [x + dx, z + dz];
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const o = nz * n + nx;
      if (done[o]) continue;
      done[o] = 1;
      out[o] = Math.max(out[o], out[at]);
      push(o);
    }
  }
  return out;
}
// The water of a land: lakes where the filled surface stands over the ground by at least `minDepth`, rivers where the flow passes `riverFlow`
// (`maxLakes` of the broadest, none deeper than `maxDepth`: a land of eroded noise has many pits, and most of them are dry hollows)
export function terrainWater(t: Terrain, o: { minDepth?: number; minCells?: number; riverFlow?: number; maxLakes?: number; maxDepth?: number } = {}): TerrainWater {
  const { n } = t;
  const [minDepth, minCells, riverFlow, maxLakes, maxDepth] = [o.minDepth ?? 1, o.minCells ?? 12, o.riverFlow ?? 0.68, o.maxLakes ?? terrainStyleOf(t.biome).lakes, o.maxDepth ?? 12];
  const top = filled(t);
  const surface = new Float32Array(n * n).fill(NaN);
  // Lakes: the vertices under the filled surface, grouped by flood (4-connected) with their level
  const seen = new Uint8Array(n * n);
  const lakes: TerrainWater["lakes"] = [];
  const found: { cells: number[]; at: number; deep: number }[] = [];
  for (let at = 0; at < n * n; at++) {
    if (seen[at] || top[at] - t.h[at] < minDepth) continue;
    const cells: number[] = [];
    const stack = [at];
    seen[at] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      cells.push(q);
      const [x, z] = [q % n, Math.floor(q / n)];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [nx, nz] = [x + dx, z + dz];
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const p = nz * n + nx;
        if (!seen[p] && top[p] - t.h[p] >= minDepth * 0.5 && Math.abs(top[p] - top[at]) < 0.01) {
          seen[p] = 1;
          stack.push(p);
        }
      }
    }
    if (cells.length < minCells) continue;
    found.push({ cells, at, deep: cells.reduce((m, c) => Math.max(m, top[c] - t.h[c]), 0) });
  }
  for (const lake of found.filter((l) => l.deep <= maxDepth).sort((a, b) => b.cells.length - a.cells.length).slice(0, maxLakes)) {
    let [sx, sz] = [0, 0];
    for (const c of lake.cells) {
      surface[c] = top[c];
      sx += t.x0 + (c % n) * t.cell;
      sz += t.z0 + Math.floor(c / n) * t.cell;
    }
    lakes.push({ cells: lake.cells.length, level: top[lake.at], x: sx / lake.cells.length, z: sz / lake.cells.length, depth: lake.deep });
  }
  // Rivers: from every vertex whose flow passes the line and which nothing upstream of it feeds, down the steepest way over the filled surface to the edge
  // or into a lake, smoothed
  const down = (at: number): number => {
    const [x, z] = [at % n, Math.floor(at / n)];
    let best = -1;
    let drop = 0;
    for (const [dx, dz, len] of NB) {
      const [nx, nz] = [x + dx, z + dz];
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const s = (top[at] - top[nz * n + nx]) / len;
      if (s > drop) {
        best = nz * n + nx;
        drop = s;
      }
    }
    return best;
  };
  // The drainage over the filled surface (the stream pass's own was made before the later passes changed the ground): the area gathered from the top down
  const order = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) order[i] = Math.round(top[i] * 256) * 1048576 + i;
  order.sort();
  const area = new Float32Array(n * n).fill(1);
  for (let q = n * n - 1; q >= 0; q--) {
    const at = order[q] % 1048576;
    const d = down(at);
    if (d >= 0) area[d] += area[at];
  }
  let most = 1;
  for (let i = 0; i < area.length; i++) if (area[i] > most) most = area[i];
  const flowOf = (at: number) => Math.log(area[at]) / Math.log(most);
  const isRiver = (at: number) => flowOf(at) >= riverFlow;
  const fed = new Uint8Array(n * n);
  for (let at = 0; at < n * n; at++) {
    if (!isRiver(at)) continue;
    const d = down(at);
    if (d >= 0 && isRiver(d)) fed[d] = 1;
  }
  const rivers: TerrainWater["rivers"] = [];
  const used = new Uint8Array(n * n);
  const where = (q: number): [number, number] => [t.x0 + (q % n) * t.cell, t.z0 + Math.floor(q / n) * t.cell];
  for (let at = 0; at < n * n; at++) {
    if (!isRiver(at) || fed[at] || used[at]) continue;
    const line: [number, number][] = [];
    const cells: number[] = [];
    let q = at;
    let peak = 0;
    for (let guard = 0; q >= 0 && guard < n * 4; guard++) {
      used[q] = 1;
      cells.push(q);
      line.push(where(q));
      peak = Math.max(peak, flowOf(q));
      if (!Number.isNaN(surface[q]) || !isRiver(q)) break;
      q = down(q);
      if (q >= 0 && used[q]) {
        line.push(where(q));
        break;
      }
    }
    if (line.length < 10 || (maxLakes === 0 && o.riverFlow === undefined)) continue;
    // (a moving average over a few points: the line of cells is staircase-shaped)
    const soft = line.map((_, i) => {
      let [sx, sz] = [0, 0];
      for (let k = -2; k <= 2; k++) {
        const p = line[Math.max(0, Math.min(line.length - 1, i + k))];
        sx += p[0];
        sz += p[1];
      }
      return [sx / 5, sz / 5] as [number, number];
    });
    rivers.push({ line: soft, flow: peak });
    // The surface of the river: a little over its bed
    for (const c of cells) if (Number.isNaN(surface[c])) surface[c] = t.h[c] + 0.15 + 0.35 * flowOf(c);
  }
  return { surface, lakes, rivers };
}

// ---- The ground of a settlement's district (2026-11-11; the user: "realistic terrain undulation WITHIN settlement districts")
// The open ground between the buildings rises and falls as the biome's land does; what is built stays where every room, door and way in of the game
// already is, at the street's level (y 0): each building's box is a level pad (`levelBox`, a square past its walls, blended back over five), the paved
// ways between them are graded to the same level with shoulders of three, a site's gardens, stalls and curtain wall stand on pads of their own, and the
// ground eases back to that level at the rim of the map, where the relief round the place (client terrain.tsx `ReliefGround`) takes over.
// The land is the terrain module's own (sculpt, stream power, droplets, thermal, polish: a 97-vertex field at the style's relief with swells of about
// 47 m, scaled down to a few metres so that its valleys still branch), sampled onto a grid of one square, levelled, and put so that the pads are at 0.
// Measured on the 22 districts of a test world (temperate): the open squares of the walkable ground are a median 0.05-0.3 squares off the street's
// level, a tenth of them 0.5-0.8, the most about 1.3 (1.8 m); the steepest 0.25-0.37 (a pad's shoulder). With the old blend of ten squares and swells
// as broad as the district the median was 0: the land must change within the gaps between the buildings or it is not seen.
// Distances in the spec and from `at` are squares (1.4 m); the Terrain inside is metres, like every other, so that its slope and splat read it.
export const SQUARE_M = 1.4;
// How many metres the open ground of a district rises and falls by (the style's relief, much reduced: a district is a few hundred metres across and
// is built on the gentlest ground about); a paved city and a gas giant's platforms have none
export const districtRelief = (biome: string): number => (biome === "urban" || biome === "gas giant" ? 0 : Math.max(0.6, Math.min(5, terrainStyleOf(biome).relief * 0.033)));
export interface DistrictRect { x: number; y: number; width: number; height: number }
export interface DistrictGroundSpec {
  seed: number; biome: string;
  // The middle of the map and the squares across it (the ground mesh is `size` squares square, centred there)
  cx: number; cz: number; size: number;
  // Level pads (buildings, rooms, gardens, stalls, a curtain wall) and graded ways (avenues, alleys)
  pads: DistrictRect[]; ways: DistrictRect[];
}
export interface DistrictGround {
  // The field in metres (pads at 0); `cx`, `cz` the middle in squares
  t: Terrain; cx: number; cz: number;
  // How high the ground is at a point of the district's grid (squares, continuous: a square's middle is x + 0.5), in squares
  at: (x: number, z: number) => number;
  // The rise over run at a point
  slope: (x: number, z: number) => number;
  // The lowest and highest ground, in squares
  lowest: number; highest: number;
}
// (squares; the swell as a share of a 336 m map: 47 m)
const PAD_FLAT = 1, PAD_BLEND = 5, WAY_FLAT = 0.5, WAY_BLEND = 3, RIM_FLAT = 10, RIM_BLEND = 20, DISTRICT_WAVE = 0.14;
const GROUNDS = new Map<string, DistrictGround>();
export function districtGround(spec: DistrictGroundSpec): DistrictGround | null {
  const relief = districtRelief(spec.biome);
  if (relief <= 0 || spec.size < 8) return null;
  const key = JSON.stringify(spec);
  const have = GROUNDS.get(key);
  if (have) return have;
  const size = Math.round(spec.size);
  const sizeM = size * SQUARE_M;
  // The land: the style's own at its full relief (so that the erosion has slopes to work on), its heights then scaled to the district's
  const land = terrainFor({ seed: (spec.seed ^ 0x2c1b3c6d) | 0, biome: spec.biome, size: sizeM, n: 97, erosion: "light", wave: (DISTRICT_WAVE * 336) / sizeM });
  const k = relief / Math.max(1e-6, land.max - land.min);
  const n = size + 1;
  const t: Terrain = { seed: land.seed, biome: spec.biome, n, size: sizeM, cell: SQUARE_M, x0: -sizeM / 2, z0: -sizeM / 2, h: new Float32Array(n * n), min: 0, max: 0, flow: new Float32Array(n * n) };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [x, z] = [t.x0 + i * t.cell, t.z0 + j * t.cell];
      t.h[j * n + i] = (terrainHeight(land, x, z) - land.min) * k;
      t.flow[j * n + i] = terrainFlow(land, x, z);
    }
  }
  // (rects from the district's squares to the field's metres)
  const toM = (r: DistrictRect) => [(r.x - spec.cx) * SQUARE_M, (r.y - spec.cz) * SQUARE_M, r.width * SQUARE_M, r.height * SQUARE_M] as const;
  // The level of the pads: the mean of the land under them (so that as much is cut as filled)
  let [sum, count] = [0, 0];
  for (const p of spec.pads) {
    const [x, z, w, d] = toM(p);
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) { sum += terrainHeight(t, x + (w * a) / 4, z + (d * b) / 4); count++; }
  }
  const base = count ? sum / count : (land.max - land.min) * k * 0.5;
  for (const p of spec.pads) { const [x, z, w, d] = toM(p); levelBox(t, x, z, w, d, PAD_FLAT * SQUARE_M, PAD_BLEND * SQUARE_M, base); }
  for (const p of spec.ways) { const [x, z, w, d] = toM(p); levelBox(t, x, z, w, d, WAY_FLAT * SQUARE_M, WAY_BLEND * SQUARE_M, base); }
  // The rim: back to the pads' level, so that the relief round the place meets it
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const edge = Math.min(i, j, n - 1 - i, n - 1 - j);
      t.h[j * n + i] = lerp(base, t.h[j * n + i], smoothstep(RIM_FLAT, RIM_FLAT + RIM_BLEND, edge)) - base;
    }
  }
  refresh(t);
  const at = (x: number, z: number) => terrainHeight(t, (x - spec.cx) * SQUARE_M, (z - spec.cz) * SQUARE_M) / SQUARE_M;
  const slope = (x: number, z: number) => terrainSlope(t, (x - spec.cx) * SQUARE_M, (z - spec.cz) * SQUARE_M);
  const out: DistrictGround = { t, cx: spec.cx, cz: spec.cz, at, slope, lowest: t.min / SQUARE_M, highest: t.max / SQUARE_M };
  if (GROUNDS.size >= 4) GROUNDS.delete(GROUNDS.keys().next().value as string);
  GROUNDS.set(key, out);
  return out;
}
