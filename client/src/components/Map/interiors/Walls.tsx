// A room's straight walls as tiles of the Space Station Kit (see packs.ts `wallTiles`), merged into one mesh and in the room's
// palette. Only the solid runs between the ways are drawn here; doorways, windows and rounded corners are the map's own.
import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WALL_FILES, wallTiles } from "./packs";
import { useModels } from "./assets";
import type { Tone } from "./tones";

export type WallSide = "n" | "s" | "w" | "e";
export interface WallRun {
  side: WallSide;
  // The solid stretch along the wall, in squares from the room's north-west corner
  a: number;
  b: number;
}

// The kit's wall is 1 square long, 1 high and 0.3 deep, its front (the detailed face) towards +z
const KIT_DEPTH = 0.3;

// Which way a wall's front looks (into the room), and where the wall stands
const TURN: Record<WallSide, number> = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };

// The tiles of the runs as one geometry. `files` holds the models that have loaded (by url), each on its floor and centred
export function wallsGeometry(runs: WallRun[], width: number, height: number, wallH: number, thick: number, files: Record<string, THREE.BufferGeometry | null>): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const depth = Math.max(thick, 0.2) / KIT_DEPTH;
  for (const run of runs) {
    // A run that meets the room's corner reaches half a wall's thickness past it, as the plain wall does
    const start = run.a - (run.a === 0 ? thick / 2 : 0);
    const end = run.b + ((run.side === "n" || run.side === "s" ? run.b === width : run.b === height) ? thick / 2 : 0);
    const seed = Math.round(run.a * 7) + run.side.charCodeAt(0);
    for (const tile of wallTiles(end - start, seed)) {
      const model = files[tile.file] ?? files[WALL_FILES.plain];
      if (!model) return null;
      const g = model.clone();
      g.scale(tile.length, wallH, depth);
      g.rotateY(TURN[run.side]);
      const along = start + tile.at;
      const [x, z] = run.side === "n" ? [along, 0] : run.side === "s" ? [along, height] : run.side === "w" ? [0, along] : [width, along];
      g.translate(x, 0, z);
      parts.push(g);
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}

// The walls of a room in a pack's palette; `fallback` (the plain walls) stands until the kit has loaded
export function PackWalls({ runs, width, height, wallH, thick, tone, fallback }: { runs: WallRun[]; width: number; height: number; wallH: number; thick: number; tone: Tone; fallback: ReactNode }) {
  const files = useModels(Object.values(WALL_FILES), "base", tone);
  const key = runs.map((r) => `${r.side}${r.a}-${r.b}`).join(",");
  const geometry = useMemo(() => wallsGeometry(runs, width, height, wallH, thick, files), [key, width, height, wallH, thick, files]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return <>{fallback}</>;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}
