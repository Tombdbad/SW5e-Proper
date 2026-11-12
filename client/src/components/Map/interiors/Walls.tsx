// A room's walls as tiles of the Space Station Kit (see packs.ts `wallTiles`), merged into one mesh and in the room's palette: the
// straight runs between the ways, and the rounded corners with the tiles bent round their radius. Doorways and windows are the map's own.
import { useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WALL_FILES, isBaked, wallTiles } from "./packs";
import { useModels } from "./assets";
import { AIM } from "./aim";
import { WALL_TILE, WallOrigin, boxUV, wallMaterial, type WallSet } from "../surfaces";
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
export function cornerGeometries(c: WallCorner, width: number, height: number, wallH: number, thick: number, files: Record<string, THREE.BufferGeometry | null>, kit: typeof WALL_FILES = WALL_FILES): THREE.BufferGeometry[] | null {
  const [cx, cz] = cornerCentre(c, width, height);
  const from = c.from ?? CORNER_START[c.corner];
  const arc = (c.to ?? CORNER_START[c.corner] + Math.PI / 2) - from;
  const n = Math.max(c.from === undefined && c.to === undefined ? 2 : 1, Math.round(c.r * arc));
  const depth = Math.max(thick, 0.2) / KIT_DEPTH;
  const out: THREE.BufferGeometry[] = [];
  for (const [i, tile] of wallTiles(n, c.corner, kit).entries()) {
    const model = files[tile.file] ?? files[kit.plain];
    if (!model) return null;
    out.push(bend(model, c.r, from + (i * arc) / n, arc / n, cx, cz, wallH, depth));
  }
  return out;
}

// The tiles of the runs and rounded corners as one geometry. `files` holds the models that have loaded (by url), each on its floor and centred
export function wallsGeometry(runs: WallRun[], width: number, height: number, wallH: number, thick: number, files: Record<string, THREE.BufferGeometry | null>, corners: WallCorner[] = [], kit: typeof WALL_FILES = WALL_FILES): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const c of corners) {
    const bent = cornerGeometries(c, width, height, wallH, thick, files, kit);
    if (!bent) return null;
    parts.push(...bent);
  }
  const depth = Math.max(thick, 0.2) / KIT_DEPTH;
  for (const run of runs) {
    // A run that meets the room's corner reaches half a wall's thickness past it, as the plain wall does
    const start = run.a - (run.a === 0 ? thick / 2 : 0);
    const end = run.b + ((run.side === "n" || run.side === "s" ? run.b === width : run.b === height) ? thick / 2 : 0);
    const seed = Math.round(run.a * 7) + run.side.charCodeAt(0);
    for (const tile of wallTiles(end - start, seed, kit)) {
      const model = files[tile.file] ?? files[kit.plain];
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
export function PackWalls({ runs, corners = [], width, height, wallH, thick, tone, wall, fallback, kit = WALL_FILES }: { runs: WallRun[]; corners?: WallCorner[]; width: number; height: number; wallH: number; thick: number; tone: Tone; wall: WallSet; fallback: ReactNode; kit?: typeof WALL_FILES }) {
  // (a ship's tiles were coloured when they were built: they are not toned again)
  const files = useModels(Object.values(kit), "base", isBaked(kit.plain) ? undefined : tone);
  const origin = useContext(WallOrigin);
  const key = runs.map((r) => `${r.side}${r.a}-${r.b}`).join(",") + corners.map((c) => `c${c.corner}${c.r}:${c.from ?? ""}-${c.to ?? ""}`).join(",");
  // The walls (straight and curved) are projected in squares, so that the wall set repeats evenly round the room
  const geometry = useMemo(() => {
    const built = wallsGeometry(runs, width, height, wallH, thick, files, corners, kit);
    if (!built) return null;
    const textured = boxUV(built, 1 / WALL_TILE, origin);
    built.dispose();
    return textured;
  }, [key, width, height, wallH, thick, files, origin.join(","), kit.plain]);
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

// (how often a straight piece is cut along its length, squares, so that it can be bent onto a curve)
const BEND_STEP = 0.15;
// The wall between a hole's edge (`run`, points along x) and the wall's top or the floor (`limit`), `thick` deep about z = 0: its two faces, the reveal
// along the hole's edge and its top or foot, a slice for each step along the edge
function bandStrip(run: [number, number][], limit: number, above: boolean, thick: number): THREE.BufferGeometry {
  const h = thick / 2;
  const pos: number[] = [];
  const nor: number[] = [];
  const v = new THREE.Vector3();
  const [e1, e2] = [new THREE.Vector3(), new THREE.Vector3()];
  // a quad a-b-c-d, turned to face `want`
  const quad = (a: number[], b: number[], c: number[], d: number[], want: [number, number, number]) => {
    for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
      e1.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      e2.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
      v.crossVectors(e1, e2);
      if (v.lengthSq() < 1e-14) continue;
      const flip = v.x * want[0] + v.y * want[1] + v.z * want[2] < 0;
      const tri = flip ? [p, r, q] : [p, q, r];
      for (const t of tri) pos.push(t[0], t[1], t[2]);
      for (let k = 0; k < 3; k++) nor.push(...want);
    }
  };
  for (let i = 0; i + 1 < run.length; i++) {
    const [[x0, y0], [x1, y1]] = [run[i], run[i + 1]];
    if (x1 - x0 < 1e-7) continue;
    quad([x0, y0, h], [x1, y1, h], [x1, limit, h], [x0, limit, h], [0, 0, 1]);
    quad([x0, y0, -h], [x1, y1, -h], [x1, limit, -h], [x0, limit, -h], [0, 0, -1]);
    quad([x0, limit, -h], [x1, limit, -h], [x1, limit, h], [x0, limit, h], [0, above ? 1 : -1, 0]);
    // (the reveal faces the hole: away from the band, across the edge)
    const [dx, dy] = [x1 - x0, y1 - y0];
    const len = Math.hypot(dx, dy);
    const out: [number, number, number] = above ? [dy / len, -dx / len, 0] : [-dy / len, dx / len, 0];
    quad([x0, y0, -h], [x1, y1, -h], [x1, y1, h], [x0, y0, h], out);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

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

// A stretch of wall (`width` along x about the middle, or [from, to] along x, `wallH` high, `thick` deep about z = 0) with a hole in it: the
// wall beside the hole, and over and under it wherever the wall reaches past it. A hole taller than the wall leaves only what is beside and under it.
// (2026-11-12, the user: a window seen from outside showed stone inside it. The stretch is as wide as the frame needs: a large or great window is
// wider than the one square it used to be given, and its edges were walled over. Its edges are cut every few hand-widths, so that it bends
// smoothly onto a curved wall instead of cutting across the curve.)
export function piercedWall(hole: Hole | null, wallH: number, thick: number, width: number | [number, number] = 1): THREE.BufferGeometry | null {
  const [lo, hi] = typeof width === "number" ? [-width / 2, width / 2] : width;
  const parts: THREE.BufferGeometry[] = [];
  const box = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, thick, Math.max(1, Math.ceil((x1 - x0) / BEND_STEP))).toNonIndexed();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    parts.push(g);
  };
  if (!hole || hole.xs.length < 2) box(lo, hi, 0, wallH);
  else {
    const xs = hole.xs.map((x) => Math.max(lo, Math.min(hi, x)));
    box(lo, xs[0], 0, wallH);
    box(xs[xs.length - 1], hi, 0, wallH);
    // The wall over the hole (between its top and the wall's) and under it (between the floor and its bottom), in runs where there is any
    const band = (edge: number[], above: boolean) => {
      const limit = above ? wallH : 0;
      const solid = (y: number) => (above ? y < wallH - 1e-4 : y > 1e-4);
      let run: [number, number][] = [];
      const flush = () => {
        // (a strip, a slice from the hole's edge to the wall's top or the floor at each sample along it, so that a band bent onto a curve keeps to it:
        // a shape filled in one went flat across the curve in long slivers)
        if (run.length >= 2) parts.push(bandStrip(run, limit, above, thick));
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
// (the reach is half the widest thing set in a wall, a great window at 1.9 squares across, and its frame: 2026-11-12, the user: a window's frame did not follow the wall's radius.
// A piece reaching onto a curve from a straight stretch was left flat, its far end standing off or sunk into the wall. A bend on a straight stretch moves nothing, so it is wide.)
export function bendOf(o: Outline, s0: number, sigma: number, reach = 1.25): Bend | undefined {
  // only where the stretch it covers runs onto a curve
  const curved = o.pieces.some((p) => p.kind === "arc" && s0 + reach > p.start && s0 - reach < p.start + p.length);
  if (!curved) return undefined;
  return { key: `bend:${o.length.toFixed(3)}:${s0.toFixed(3)}:${sigma}`, apply: (g) => bendAlong(g, o, s0, sigma) };
}

// ---- Openings wider than a square (2026-11-12, the user: through a window seen from outside, stone where the room should be: "The interior should ALSO
// have a window in the same location") ---------------------------------------------------------------------------------------------------------------
// A large window's frame is 1.1 squares across and a great one's 1.6, so the wall each opening takes is its frame's width and a hand's breadth of wall
// round it, a square at least; two openings close together share what lies between them, each up to the middle.
export const OPENING_MARGIN = 0.06;
// (a doorway keeps its square: its frame is a square wide)
export const openingHalf = (hole: Hole, window = true) => (window ? Math.max(0.5, Math.max(...hole.xs.map(Math.abs)) + OPENING_MARGIN) : 0.5);
// The stretch of the wall line each opening takes ([from, to] along the path of `length`, closed round), from where it stands (`s`) and half its width
export function openingSpans(openings: { s: number; half: number }[], length: number): [number, number][] {
  const order = openings.map((o, i) => ({ ...o, i, at: ((o.s % length) + length) % length })).sort((a, b) => a.at - b.at);
  const out: [number, number][] = openings.map((o) => [o.s - o.half, o.s + o.half]);
  order.forEach((o, k) => {
    if (order.length < 2) return;
    const [prev, next] = [order[(k + order.length - 1) % order.length], order[(k + 1) % order.length]];
    const back = (o.at - prev.at + length) % length || length;
    const ahead = (next.at - o.at + length) % length || length;
    out[o.i] = [o.s - Math.min(o.half, back / 2), o.s + Math.min(o.half, ahead / 2)];
  });
  return out;
}
// What is left of the wall line between the openings' stretches (or of the stretch `within`), as [from, to] along it (0 .. length)
export function solidSpans(spans: [number, number][], length: number, within: [number, number] = [0, length]): [number, number][] {
  const wrap = (x: number) => ((x % length) + length) % length;
  const cuts: [number, number][] = [];
  for (const [a, b] of spans) {
    const from = wrap(a);
    const to = from + (b - a);
    if (to > length) cuts.push([from, length], [0, to - length]);
    else cuts.push([from, to]);
  }
  let keep: [number, number][] = [within];
  for (const [a, b] of cuts) keep = keep.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : ([[x, Math.max(x, a)], [Math.min(y, b), y]] as [number, number][]).filter(([p, q]) => q - p > 1e-6)));
  return keep;
}
// Something drawn along x (about x = 0) laid on the wall line of `o` from the point `s0`: each point x along goes to the line at s0 + x, z across it into
// the room (toward the inside), y kept. The result is in the room's plan (squares from its north-west corner), as `outline` gives it.
export function layAlong(source: THREE.BufferGeometry, o: Outline, s0: number): THREE.BufferGeometry {
  const g = source.clone();
  const [pos, nor] = [g.getAttribute("position"), g.getAttribute("normal")];
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const at = outlineAt(o, s0 + x);
    pos.setXYZ(i, at.p[0] + z * at.n[0], y, at.p[1] + z * at.n[1]);
    if (nor) {
      const [nx, ny, nz] = [nor.getX(i), nor.getY(i), nor.getZ(i)];
      nor.setXYZ(i, nx * at.t[0] + nz * at.n[0], ny, nx * at.t[1] + nz * at.n[1]);
    }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}
// A building's outer wall along its wall line, `thick` deep inward from it and `wallH` high, with its doors and windows cut through it: each opening's
// outline (`hole`, x along the wall about where it stands, `s` along the path) in a stretch as wide as its frame, the rest whole, straight or round a
// curve. `within` keeps to a stretch of the line (the bays of a round room's kit that a window falls in), else the whole way round. In the room's plan.
export function shellAlong(o: Outline, thick: number, wallH: number, openings: { s: number; hole: Hole; window?: boolean }[], within?: [number, number]): THREE.BufferGeometry[] {
  const spans = openingSpans(openings.map((h) => ({ s: h.s, half: openingHalf(h.hole, h.window) })), o.length);
  const out: THREE.BufferGeometry[] = [];
  const lay = (g: THREE.BufferGeometry, s0: number) => {
    g.translate(0, 0, thick / 2);
    out.push(layAlong(g, o, s0));
    g.dispose();
  };
  const ranges = within ? (within[1] - within[0] >= o.length ? [[0, o.length] as [number, number]] : solidSpans([[within[1], within[0] + o.length]], o.length)) : [[0, o.length] as [number, number]];
  for (const range of ranges) {
    for (const [a, b] of solidSpans(spans, o.length, range)) {
      lay(new THREE.BoxGeometry(b - a, wallH, thick, Math.max(1, Math.ceil((b - a) / BEND_STEP))).translate(0, wallH / 2, 0).toNonIndexed(), (a + b) / 2);
    }
  }
  openings.forEach((h, i) => {
    // (an opening outside `within` is another piece's)
    const at = ((h.s % o.length) + o.length) % o.length;
    if (within && !ranges.some(([a, b]) => at >= a - 1e-6 && at <= b + 1e-6)) return;
    const g = piercedWall(h.hole, wallH, thick, [spans[i][0] - h.s, spans[i][1] - h.s]);
    if (g) lay(g, h.s);
  });
  return out;
}
