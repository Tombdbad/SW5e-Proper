// A cave room's walls and rim of formations (see cave.ts): runs of rock in place of the straight walls, and
// stalagmites, columns, crystals, rocks and a pool along the edge, one mesh for all of it. `takenKey` lists the
// squares that have furniture or a way ("x,y;x,y").
import { useEffect, useMemo } from "react";
import * as THREE from "three";
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
export function CaveDressing({ w, h, seed, biome, tier, takenKey }: { w: number; h: number; seed: number; biome: string; tier: Tier; takenKey: string }) {
  const features = useMemo(() => {
    const taken = new Set(takenKey.split(";"));
    return caveFeatures(w, h, seed, (x, y) => !taken.has(`${x},${y}`)).slice(0, tier === "lite" ? 14 : 32);
  }, [w, h, seed, tier, takenKey]);
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
