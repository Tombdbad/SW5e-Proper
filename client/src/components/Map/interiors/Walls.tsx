// A room's walls as tiles of the Space Station Kit (see packs.ts `wallTiles`), merged into one mesh and in the room's palette: the
// straight runs between the ways, and the rounded corners with the tiles bent round their radius. Doorways and windows are the map's own.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WALL_FILES, wallTiles } from "./packs";
import { useModels } from "./assets";
import { AIM } from "./aim";
import { WALL_TILE, boxUV, wallMaterial, type WallSet } from "../surfaces";
import type { Tone } from "./tones";
import { outlineAt, type Outline } from "@shared/logic/footprint";

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

// A rounded corner of radius `r` (the quarter ring `CornerWall` draws): 0 north-west, 1 north-east, 2 south-east, 3 south-west. `from` and
// `to` (angles about its centre) are the part of it that is wall, when a door or window takes the rest (the whole quarter by default)
export interface WallCorner {
  corner: 0 | 1 | 2 | 3;
  r: number;
  from?: number;
  to?: number;
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
  const from = c.from ?? CORNER_START[c.corner];
  const arc = (c.to ?? CORNER_START[c.corner] + Math.PI / 2) - from;
  const n = Math.max(c.from === undefined && c.to === undefined ? 2 : 1, Math.round(c.r * arc));
  const depth = Math.max(thick, 0.2) / KIT_DEPTH;
  const out: THREE.BufferGeometry[] = [];
  for (const [i, tile] of wallTiles(n, c.corner).entries()) {
    const model = files[tile.file] ?? files[WALL_FILES.plain];
    if (!model) return null;
    out.push(bend(model, c.r, from + (i * arc) / n, arc / n, cx, cz, wallH, depth));
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
export function PackWalls({ runs, corners = [], width, height, wallH, thick, tone, wall, fallback }: { runs: WallRun[]; corners?: WallCorner[]; width: number; height: number; wallH: number; thick: number; tone: Tone; wall: WallSet; fallback: ReactNode }) {
  const files = useModels(Object.values(WALL_FILES), "base", tone);
  const key = runs.map((r) => `${r.side}${r.a}-${r.b}`).join(",") + corners.map((c) => `c${c.corner}${c.r}:${c.from ?? ""}-${c.to ?? ""}`).join(",");
  // The walls (straight and curved) are projected in squares, so that the wall set repeats evenly round the room
  const geometry = useMemo(() => {
    const kit = wallsGeometry(runs, width, height, wallH, thick, files, corners);
    if (!kit) return null;
    const textured = boxUV(kit, 1 / WALL_TILE);
    kit.dispose();
    return textured;
  }, [key, width, height, wallH, thick, files]);
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
      <primitive attach="material" object={wallMaterial(wall, { vertexColors: true })} />
    </mesh>
  );
}

// ---- Doors and windows in the wall (2026-10-26, the user: "ONLY the area of the wall WITHIN the window frame should be transparent";
// doors and windows in curved walls match the radius of the wall) ------------------------------------------------------------------
// Each way in or window takes one square of wall: the wall there is drawn whole round the frame's outer edge (beside it, under it and
// over it), and on a curved wall the piece, the frame and the leaf are bent onto the curve.

// What an opening cuts out of its square of wall: the top and bottom of its frame's outer edge across its width, sampled at `xs`
export interface Hole {
  xs: number[];
  top: number[];
  bottom: number[];
}
// The hole of a closed outline (x along the wall about its middle, y up from the floor): for each x the highest and lowest point of the
// outline there (frames are convex)
export function holeOf(points: [number, number][], samples = 24): Hole {
  const lo = Math.min(...points.map((p) => p[0]));
  const hi = Math.max(...points.map((p) => p[0]));
  const hole: Hole = { xs: [], top: [], bottom: [] };
  for (let i = 0; i <= samples; i++) {
    const x = lo + ((hi - lo) * i) / samples;
    const probe = Math.min(hi - 1e-6, Math.max(lo + 1e-6, x));
    let [bottom, top] = [Infinity, -Infinity];
    for (let j = 0; j < points.length; j++) {
      const [p, q] = [points[j], points[(j + 1) % points.length]];
      if ((probe - p[0]) * (probe - q[0]) > 0 || p[0] === q[0]) continue;
      const y = p[1] + ((q[1] - p[1]) * (probe - p[0])) / (q[0] - p[0]);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y);
    }
    if (top < bottom) continue;
    hole.xs.push(x);
    hole.top.push(top);
    hole.bottom.push(bottom);
  }
  return hole;
}

// One square of wall (`width` along x about the middle, `wallH` high, `thick` deep about z = 0) with a hole in it: the wall beside the
// hole, and over and under it wherever the wall reaches past it. A hole taller than the wall leaves only what is beside and under it
export function piercedWall(hole: Hole | null, wallH: number, thick: number, width = 1): THREE.BufferGeometry | null {
  const half = width / 2;
  const parts: THREE.BufferGeometry[] = [];
  const box = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, thick).toNonIndexed();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    parts.push(g);
  };
  if (!hole || hole.xs.length < 2) box(-half, half, 0, wallH);
  else {
    const xs = hole.xs.map((x) => Math.max(-half, Math.min(half, x)));
    box(-half, xs[0], 0, wallH);
    box(xs[xs.length - 1], half, 0, wallH);
    // The wall over the hole (between its top and the wall's) and under it (between the floor and its bottom), in runs where there is any
    const band = (edge: number[], above: boolean) => {
      const limit = above ? wallH : 0;
      const solid = (y: number) => (above ? y < wallH - 1e-4 : y > 1e-4);
      let run: [number, number][] = [];
      const flush = () => {
        if (run.length >= 2) {
          const pts = above ? [[run[0][0], limit], [run[run.length - 1][0], limit], ...[...run].reverse()] : [[run[0][0], limit], ...run, [run[run.length - 1][0], limit]];
          const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: thick, bevelEnabled: false, curveSegments: 1 });
          g.translate(0, 0, -thick / 2);
          parts.push(g.index ? g.toNonIndexed() : g);
        }
        run = [];
      };
      for (let i = 0; i < xs.length; i++) {
        const y = Math.min(wallH, Math.max(0, edge[i]));
        const here = solid(y);
        const before = i > 0 && solid(Math.min(wallH, Math.max(0, edge[i - 1])));
        if (here !== before && i > 0) {
          // where the edge crosses the wall's top (or the floor), between the last sample and this one
          const t = (limit - edge[i - 1]) / (edge[i] - edge[i - 1]);
          if (t > 0 && t < 1) run.push([xs[i - 1] + (xs[i] - xs[i - 1]) * t, limit]);
        }
        if (here) run.push([xs[i], y]);
        else flush();
      }
      flush();
    };
    band(hole.top, true);
    band(hole.bottom, false);
  }
  if (!parts.length) return null;
  for (const g of parts) for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}

// Something set in the wall (drawn along x about its middle, z across the wall) bent onto the wall line of `o` round the point `s0` along
// it: each point x along goes to the line at s0 + sigma x, kept as far off the line as it was. `sigma` is the way the wall's own x runs
// along the path (+1 on the north and west sides, -1 on the south and east). The result is in the frame of the point s0 (its x along the
// line there, z across it), so that it is placed and turned as a straight one is. On a straight stretch nothing moves.
export function bendAlong(source: THREE.BufferGeometry, o: Outline, s0: number, sigma: number): THREE.BufferGeometry {
  const g = source.clone();
  const base = outlineAt(o, s0);
  const ax = [sigma * base.t[0], sigma * base.t[1]];
  const az = [sigma * base.n[0], sigma * base.n[1]];
  const [pos, nor] = [g.getAttribute("position"), g.getAttribute("normal")];
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const at = outlineAt(o, s0 + sigma * x);
    const wx = at.p[0] + sigma * z * at.n[0] - base.p[0];
    const wz = at.p[1] + sigma * z * at.n[1] - base.p[1];
    pos.setXYZ(i, wx * ax[0] + wz * ax[1], y, wx * az[0] + wz * az[1]);
    if (nor) {
      const [nx, ny, nz] = [nor.getX(i), nor.getY(i), nor.getZ(i)];
      const vx = sigma * (nx * at.t[0] + nz * at.n[0]);
      const vz = sigma * (nx * at.t[1] + nz * at.n[1]);
      nor.setXYZ(i, vx * ax[0] + vz * ax[1], ny, vx * az[0] + vz * az[1]);
    }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// How a piece set in the wall is bent (undefined where the wall is straight): `key` names the bend, for caches
export interface Bend {
  key: string;
  apply: (g: THREE.BufferGeometry) => THREE.BufferGeometry;
}
export function bendOf(o: Outline, s0: number, sigma: number, reach = 0.6): Bend | undefined {
  // only where the stretch it covers runs onto a curve
  const curved = o.pieces.some((p) => p.kind === "arc" && s0 + reach > p.start && s0 - reach < p.start + p.length);
  if (!curved) return undefined;
  return { key: `bend:${o.length.toFixed(3)}:${s0.toFixed(3)}:${sigma}`, apply: (g) => bendAlong(g, o, s0, sigma) };
}
