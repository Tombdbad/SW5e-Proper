// A cave room's walls and rim of formations (see cave.ts): runs of rock in place of the straight walls, and
// stalagmites, columns, crystals, rocks and a pool along the edge, one mesh for all of it. `takenKey` lists the
// squares that have furniture or a way ("x,y;x,y").
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Model, type Kit } from "../models";
import { caveFeatures, column, crystals, kitPieceOf, pool, rockPaletteOf, rockRun, stalagmite, stream, type CaveFeature } from "./cave";
import { useModels } from "./assets";
import { toneOfColours } from "./tones";
import type { Tier } from "./atmosphere";

export type Side = "n" | "s" | "w" | "e";

// A run of rock along a wall of a room w by h squares, from `a` to `b` along the side. The run is built lying along x
// with its back to -z, then turned to its side
const PLACE: Record<Side, (a: number, b: number, w: number, h: number) => { at: [number, number, number]; turn: number }> = {
  n: (a, b, _w, _h) => ({ at: [a, 0, 0], turn: 0 }),
  s: (a, b, _w, h) => ({ at: [b, 0, h], turn: Math.PI }),
  w: (a, b) => ({ at: [0, 0, b], turn: Math.PI / 2 }),
  e: (a, b, w) => ({ at: [w, 0, a], turn: -Math.PI / 2 }),
};

export function RockWall({ side, a, b, w, h, height, seed, biome, tier }: { side: Side; a: number; b: number; w: number; h: number; height: number; seed: number; biome: string; tier: Tier }) {
  const spot = PLACE[side](a, b, w, h);
  const length = b - a;
  const palette = rockPaletteOf(biome);
  return (
    <group position={spot.at} rotation={[0, spot.turn, 0]}>
      <Model id={`rockrun:${length.toFixed(1)}:${height.toFixed(1)}:${seed}:${biome}:${tier}`} build={(k) => rockRun(k, length, height, seed, palette, 0.5, tier === "lite" ? 0 : 1)} />
    </group>
  );
}

// The crystals and rocks of the edge from the Space Kit (rock_crystals*, rock_large*, rocks_small*), in the cave's own stone and
// crystal colours and merged into one mesh. `done` says the models are in; until then CaveDressing builds them in code
function KitRocks({ features, seed, biome, urls }: { features: CaveFeature[]; seed: number; biome: string; urls: string[] }) {
  const p = rockPaletteOf(biome);
  const tone = useMemo(() => toneOfColours(`cave:${biome}`, [p.rockDark, p.rock, p.rockLight], p.crystal), [biome]);
  const got = useModels(urls, "base", tone);
  const geometry = useMemo(() => {
    const next = stream(seed + 977);
    const parts: THREE.BufferGeometry[] = [];
    features.forEach((f, i) => {
      const model = got[kitPieceOf(f, i)];
      if (!model) return;
      const g = model.clone();
      g.scale(f.size * 1.5, f.size * 1.5, f.size * 1.5);
      g.rotateY(next() * Math.PI * 2);
      g.translate(f.x, 0, f.y);
      parts.push(g);
    });
    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    return merged;
  }, [features, got, seed]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow raycast={() => null}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

// What stands along the edge: one baked model for the whole room. `takenKey` says which squares have furniture or a way
export function CaveDressing({ w, h, seed, biome, tier, takenKey, mask }: { w: number; h: number; seed: number; biome: string; tier: Tier; takenKey: string; mask?: string[] }) {
  const features = useMemo(() => {
    const taken = new Set(takenKey.split(";"));
    // A winding floor has its rim along the rock: the standing squares with rock beside them
    const stands = (x: number, y: number) => (mask ? mask[y]?.[x] === "#" : x >= 0 && y >= 0 && x < w && y < h);
    const rim: [number, number][] | undefined = mask ? mask.flatMap((row, y) => Array.from(row, (c, x) => [x, y] as [number, number]).filter(([x]) => row[x] === "#" && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !stands(x + dx, y + dy)))) : undefined;
    return caveFeatures(w, h, seed, (x, y) => stands(x, y) && !taken.has(`${x},${y}`), rim).slice(0, tier === "lite" ? 14 : 32);
  }, [w, h, seed, tier, takenKey, mask]);
  const palette = rockPaletteOf(biome);
  // Crystals and rocks are the Space Kit's once its models are in
  const [kitFeatures, builtFeatures] = useMemo(() => [features.filter((f) => f.kind === "crystals" || f.kind === "rock"), features.filter((f) => f.kind !== "crystals" && f.kind !== "rock")], [features]);
  const urls = useMemo(() => [...new Set(kitFeatures.map((f, i) => kitPieceOf(f, i)))], [kitFeatures]);
  const tone = useMemo(() => toneOfColours(`cave:${biome}`, [palette.rockDark, palette.rock, palette.rockLight], palette.crystal), [biome]);
  const loaded = useModels(urls, "base", tone);
  const kitIn = urls.length > 0 && urls.every((u) => loaded[u]);
  const drawn = kitIn ? builtFeatures : features;
  if (!features.length) return null;
  const key = drawn.map((f) => `${f.kind[0]}${f.x.toFixed(1)},${f.y.toFixed(1)},${f.size.toFixed(1)}`).join(";");
  return (
    <>
      {kitIn && <KitRocks features={kitFeatures} seed={seed} biome={biome} urls={urls} />}
      <Model
        id={`cavedress:${biome}:${tier}:${key.length}:${seed}:${kitIn ? "k" : "c"}`}
        build={(k: Kit) => {
          const next = stream(seed);
          drawn.forEach((f, i) => {
            k.group([f.x, 0, f.y], [0, next() * 6.28, 0], undefined, () => {
              if (f.kind === "stalagmite") stalagmite(k, 0.2 * f.size, 1.1 * f.size, seed + i, palette);
              else if (f.kind === "column") column(k, 0.3 * f.size * 0.7, 2.6, seed + i, palette);
              else if (f.kind === "crystals") crystals(k, tier === "lite" ? 3 : 5, f.size, seed + i, palette);
              else if (f.kind === "pool") pool(k, f.size, seed + i, palette);
              else k.blob(f.size * 0.5, palette.rock, { at: [0, f.size * 0.2, 0], seed: seed + i, rough: 0.35, detail: 0, squash: [1.2, 0.6, 1] });
            });
          });
        }}
      />
    </>
  );
}

// The floor of a room whose floor is a winding mask: a slab of every standing square, merged into one mesh and set where the plain floor
// would be (its middle at the room's), so that a tap on it is read by the same arithmetic
export function maskFloorGeometry(mask: string[], width: number, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  mask.forEach((row, y) => Array.from(row).forEach((c, x) => {
    if (c !== "#") return;
    const g = new THREE.BoxGeometry(1, 0.2, 1);
    g.translate(x + 0.5 - width / 2, 0, y + 0.5 - height / 2);
    parts.push(g);
  }));
  const merged = parts.length ? mergeGeometries(parts, false) : new THREE.BoxGeometry(0.01, 0.01, 0.01);
  parts.forEach((g) => g.dispose());
  return merged;
}
export function MaskFloor({ mask, width, height, color, onClick }: { mask: string[]; width: number; height: number; color: string; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const geometry = useMemo(() => maskFloorGeometry(mask, width, height), [mask.join("|"), width, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[width / 2, -0.1, height / 2]} receiveShadow onClick={onClick}>
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

// The rock round a winding floor: along every edge of a standing square that meets rock (or the room's own boundary, but not at a way), a few
// shaped rocks, low at the foot and rising to a lip, in the colours of the world's stone; and a slab of dark rock under the whole room, so
// that what is not floor reads as rock. `ways` are the squares of doors and exits, kept open.
export function CaveWalls({ mask, ways, w, h, biome, tier, seed }: { mask: string[]; ways: { x: number; y: number }[]; w: number; h: number; biome: string; tier: Tier; seed: number }) {
  const palette = rockPaletteOf(biome);
  const key = `${mask.join("|")}:${ways.map((a) => `${a.x},${a.y}`).join(";")}:${biome}:${tier}:${seed}`;
  return (
    <>
      <mesh position={[w / 2, -0.12, h / 2]} raycast={() => null}>
        <boxGeometry args={[w, 0.1, h]} />
        <meshLambertMaterial color={palette.rockDark} />
      </mesh>
      <Model
        id={`caverock:${key.length}:${hashOf(key)}`}
        build={(k: Kit) => {
          const next = stream(seed + 5);
          const stands = (x: number, y: number) => mask[y]?.[x] === "#";
          const way = (x: number, y: number) => ways.some((a) => a.x === x && a.y === y);
          mask.forEach((row, y) => Array.from(row).forEach((c, x) => {
            if (c !== "#") return;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const [nx, ny] = [x + dx, y + dy];
              if (stands(nx, ny)) continue;
              // The room's own boundary is open at a way (the door stands on that square) and rock elsewhere
              if (!(nx >= 0 && ny >= 0 && nx < w && ny < h) && way(x, y)) continue;
              const count = tier === "lite" ? 1 : 2;
              for (let i = 0; i < count; i++) {
                const along = (i + 0.5) / count - 0.5 + (next() - 0.5) * 0.2;
                const [ex, ey] = [x + 0.5 + dx * 0.5 + (dy ? along : 0), y + 0.5 + dy * 0.5 + (dx ? along : 0)];
                const r = 0.34 + next() * 0.2;
                const high = 0.7 + next() * 0.9;
                k.blob(r * 0.95, palette.rockDark, { at: [ex + dx * r * 0.5, r * 0.4, ey + dy * r * 0.5], seed: seed + x * 7 + y * 13 + i, rough: 0.3, detail: 0, squash: [1.1, 0.8, 1.1] });
                k.blob(r * 0.8, (x + y + i) % 3 ? palette.rock : palette.rockLight, { at: [ex + dx * r * 0.7, high * 0.5, ey + dy * r * 0.7], seed: seed * 3 + x + y * 5 + i, rough: 0.34, detail: tier === "lite" ? 0 : 1, squash: [0.95, high / (r * 1.6), 0.95] });
              }
            }
          }));
        }}
      />
    </>
  );
}

const hashOf = (text: string) => Array.from(text).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

// A cave seen from outside: a mound of rock over the squares of its winding floor, low rocks round its foot, and its mouth left open where
// the way out is (the squares within two of an exit are bare floor). `exits` are the squares of ways out of the building.
export function CaveMound({ mask, exits, w, h, biome, tier, seed }: { mask: string[]; exits: { x: number; y: number }[]; w: number; h: number; biome: string; tier: Tier; seed: number }) {
  const palette = rockPaletteOf(biome);
  const key = `${mask.join("|")}:${exits.map((a) => `${a.x},${a.y}`).join(";")}:${biome}:${tier}:${seed}`;
  return (
    <>
      <Model
        id={`cavemound:${key.length}:${hashOf(key)}`}
        position={[0, 0, 0]}
        build={(k: Kit) => {
          const next = stream(seed + 11);
          const mouth = (x: number, y: number) => exits.some((a) => Math.abs(a.x - x) + Math.abs(a.y - y) <= 2);
          mask.forEach((row, y) => Array.from(row).forEach((c, x) => {
            if (c !== "#") return;
            if (mouth(x, y)) {
              // The mouth: bare, dark floor, with a few fallen rocks
              k.box([1, 0.06, 1], palette.rockDark, { at: [x + 0.5, 0.03, y + 0.5] });
              if (next() < 0.3) k.blob(0.18, palette.rock, { at: [x + 0.3 + next() * 0.4, 0.12, y + 0.3 + next() * 0.4], seed: x * 5 + y, rough: 0.35, detail: 0, squash: [1.2, 0.6, 1] });
              return;
            }
            const high = 0.9 + next() * 0.9 + (c === "#" ? 0 : 0);
            const r = 0.6 + next() * 0.25;
            k.blob(r, (x + y) % 3 ? palette.rock : palette.rockLight, { at: [x + 0.5 + (next() - 0.5) * 0.3, high * 0.45, y + 0.5 + (next() - 0.5) * 0.3], seed: seed + x * 7 + y * 13, rough: 0.3, detail: tier === "lite" ? 0 : 1, squash: [1, high / (r * 1.5), 1] });
          }));
        }}
      />
      <mesh position={[w / 2, 0.01, h / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[w, h]} />
        <meshLambertMaterial color={palette.rockDark} transparent opacity={0.0} />
      </mesh>
    </>
  );
}
