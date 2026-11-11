import fs from "node:fs";
import { terrainFor, terrainHeight, terrainColorAt, scatterOn } from "../../../../shared/logic/terrain.ts";
const out = process.argv[3] ?? ".";
const N = 193, SIZE = 600;
for (const biome of (process.argv[2] ?? "desert,forest").split(",")) {
  const road: [number, number][] = [];
  for (let k = 0; k <= 24; k++) { const u = k / 24; road.push([-280 + u * 560, Math.sin(u * 5) * 60 + 20]); }
  const t = terrainFor({ seed: 11, biome, size: SIZE, n: N, erosion: "full", rim: 0.06 }, { discs: [{ x: 0, z: 40, r: 55, blend: 90 }], roads: [{ line: road, width: 7, blend: 30 }] });
  const col = new Uint8Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = t.x0 + i * t.cell, z = t.z0 + j * t.cell;
    const c = terrainColorAt(t, x, z);
    for (let k = 0; k < 3; k++) col[(j * N + i) * 3 + k] = Math.round(Math.min(1, c[k]) * 255);
  }
  fs.writeFileSync(`${out}/${biome}.h.bin`, Buffer.from(t.h.buffer, t.h.byteOffset, t.h.byteLength));
  fs.writeFileSync(`${out}/${biome}.c.bin`, Buffer.from(col));
  const tall = biome === "desert" ? [] : scatterOn(t, { spacing: 9, density: 0.8, maxSlope: 0.4, maxAlt: 0.7, seed: 3 }, (x, z) => Math.hypot(x, z - 40) > 60);
  const rocks = scatterOn(t, { spacing: 14, density: 0.7, minSlope: 0.25, seed: 5 }, (x, z) => Math.hypot(x, z - 40) > 60);
  fs.writeFileSync(`${out}/${biome}.json`, JSON.stringify({ n: N, size: SIZE, x0: t.x0, z0: t.z0, cell: t.cell, min: t.min, max: t.max, road, trees: tall.map(([x, z]) => [x, z, terrainHeight(t, x, z)]), rocks: rocks.map(([x, z]) => [x, z, terrainHeight(t, x, z)]) }));
  console.log(biome, "h", t.min.toFixed(0), t.max.toFixed(0), "trees", tall.length, "rocks", rocks.length);
}
