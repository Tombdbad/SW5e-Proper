// A room's walls as tiles of the Space Station Kit (see packs.ts `wallTiles`), merged into one mesh and in the room's palette: the
// straight runs between the ways, and the rounded corners with the tiles bent round their radius. Doorways and windows are the map's own.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WALL_FILES, wallTiles } from "./packs";
import { useModels } from "./assets";
import { AIM } from "./aim";
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

// A rounded corner of radius `r` (the quarter ring `CornerWall` draws): 0 north-west, 1 north-east, 2 south-east, 3 south-west
export interface WallCorner {
  corner: 0 | 1 | 2 | 3;
  r: number;
}
// Where the ring's centre is, in squares from the room's north-west corner, and the angle it starts at (0 points east, a quarter
// turn towards +z is south)
export const cornerCentre = ({ corner, r }: WallCorner, width: number, height: number): [number, number] => [[r, width - r, width - r, r][corner], [r, r, height - r, height - r][corner]];
export const CORNER_START = [Math.PI, Math.PI * 1.5, 0, Math.PI / 2];

// A kit tile bent round an arc: its length (x) laid along `dphi` radians from `phi0` about the centre (cx, cz), its depth (z, the front
// towards the middle of the room) across the ring about the radius `rc`, so that neighbouring tiles meet exactly on the curve
function bend(model: THREE.BufferGeometry, rc: number, phi0: number, dphi: number, cx: number, cz: number, wallH: number, depth: number): THREE.BufferGeometry {
  const g = model.clone();
  const [pos, nor] = [g.getAttribute("position"), g.getAttribute("normal")];
  for (let i = 0; i < pos.count; i++) {
    const phi = phi0 + (pos.getX(i) + 0.5) * dphi;
    const [c, s] = [Math.cos(phi), Math.sin(phi)];
    const rho = rc - pos.getZ(i) * depth;
    if (nor) {
      // x along the arc (the tangent), z towards the centre, y up
      const [nx, ny, nz] = [nor.getX(i), nor.getY(i), nor.getZ(i)];
      nor.setXYZ(i, -s * nx - c * nz, ny, c * nx - s * nz);
    }
    pos.setXYZ(i, cx + rho * c, pos.getY(i) * wallH, cz + rho * s);
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// The tiles of a rounded corner as geometries: a tile to about every square of its arc (two at least), each bent to the ring
export function cornerGeometries(c: WallCorner, width: number, height: number, wallH: number, thick: number, files: Record<string, THREE.BufferGeometry | null>): THREE.BufferGeometry[] | null {
  const [cx, cz] = cornerCentre(c, width, height);
  const n = Math.max(2, Math.round((c.r * Math.PI) / 2));
  const depth = Math.max(thick, 0.2) / KIT_DEPTH;
  const out: THREE.BufferGeometry[] = [];
  for (const [i, tile] of wallTiles(n, c.corner).entries()) {
    const model = files[tile.file] ?? files[WALL_FILES.plain];
    if (!model) return null;
    out.push(bend(model, c.r, CORNER_START[c.corner] + (i * Math.PI) / 2 / n, Math.PI / 2 / n, cx, cz, wallH, depth));
  }
  return out;
}

// The tiles of the runs and rounded corners as one geometry. `files` holds the models that have loaded (by url), each on its floor and centred
export function wallsGeometry(runs: WallRun[], width: number, height: number, wallH: number, thick: number, files: Record<string, THREE.BufferGeometry | null>, corners: WallCorner[] = []): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const c of corners) {
    const bent = cornerGeometries(c, width, height, wallH, thick, files);
    if (!bent) return null;
    parts.push(...bent);
  }
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
export function PackWalls({ runs, corners = [], width, height, wallH, thick, tone, fallback }: { runs: WallRun[]; corners?: WallCorner[]; width: number; height: number; wallH: number; thick: number; tone: Tone; fallback: ReactNode }) {
  const files = useModels(Object.values(WALL_FILES), "base", tone);
  const key = runs.map((r) => `${r.side}${r.a}-${r.b}`).join(",") + corners.map((c) => `c${c.corner}${c.r}`).join(",");
  const geometry = useMemo(() => wallsGeometry(runs, width, height, wallH, thick, files, corners), [key, width, height, wallH, thick, files]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const mesh = useRef<THREE.Mesh>(null);
  // What blocks the view and the shot, for the crosshair (aim.ts)
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    AIM.solids.add(m);
    return () => { AIM.solids.delete(m); };
  }, [geometry]);
  if (!geometry) return <>{fallback}</>;
  return (
    <mesh ref={mesh} geometry={geometry} castShadow receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}
