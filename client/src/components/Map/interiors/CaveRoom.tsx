// A cave room's walls and rim of formations (see cave.ts): runs of rock in place of the straight walls, and
// stalagmites, columns, crystals, rocks and a pool along the edge, one mesh for all of it. `takenKey` lists the
// squares that have furniture or a way ("x,y;x,y").
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Model, type Kit, type V3 } from "../models";
import { caveFeatures, column, crystals, kitPieceOf, pool, rockPaletteOf, rockRun, rockSurfaces, stalagmite, stream, type CaveFeature, type RockPalette } from "./cave";
import { boxUV, SURFACE_GRAIN, surfaceMaterial } from "../surfaces";
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
      <Model id={`rockrun:${length.toFixed(1)}:${height.toFixed(1)}:${seed}:${biome}:${tier}`} build={(k) => { k.surfaces = rockSurfaces(palette); rockRun(k, length, height, seed, palette, 0.5, tier === "lite" ? 0 : 1); }} />
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
          k.surfaces = rockSurfaces(palette);
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
export function MaskFloor({ mask, width, height, color, onClick, y = -0.1, receive = true }: { mask: string[]; width: number; height: number; color: string; onClick?: (e: ThreeEvent<MouseEvent>) => void; y?: number; receive?: boolean }) {
  const geometry = useMemo(() => maskFloorGeometry(mask, width, height), [mask.join("|"), width, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[width / 2, y, height / 2]} receiveShadow={receive} onClick={onClick} raycast={onClick ? undefined : () => null}>
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

// The rock round a winding floor: along every edge of a standing square that meets rock (or the room's own boundary, but not at a way), a few
// shaped rocks, low at the foot and rising to a lip, in the colours of the world's stone; and a slab of dark rock under the whole room, so
// that what is not floor reads as rock. `ways` are the squares of doors and exits, kept open.
// A stairwell's step, tread or wall in a cave (LocalMap `Ascent`, `Switchback`, `StairsAsset`): a lump of the cave's rock scaled to the box
// it takes, drawn with the stone texture. `onTap` makes a tap on it (a tread walks to its square).
export function CaveSlab({ at, size, biome, variant, onTap }: { at: V3; size: V3; biome: string; variant: number; onTap?: () => void }) {
  const palette = rockPaletteOf(biome);
  const slab = (
    <Model id={`caveslab:${variant % 4}:${biome}`} position={at} scale={size} build={(k) => { k.surfaces = rockSurfaces(palette); k.blob(0.5, palette.rock, { seed: (variant % 4) + 1, rough: 0.25, smooth: true }); }} />
  );
  return onTap ? <group onClick={(e) => { e.stopPropagation(); if (e.delta <= 8) onTap(); }}>{slab}</group> : slab;
}

// The rock of a cave room as one surface (2026-10-30; the user: "there are gaps between the stones that make up cave walls so we can
// see the surroundings - this is WRONG!"). The walls were lumps of rock set along each edge of the floor, and the world showed between
// them. Now the rock is a sheet over the room and a margin round it: level with the floor where the floor is, rising steeply from its
// edge to over the roof, with a wavering lip and a rough face (smooth noise, and the stone texture). A roof of the same rock hangs over
// it in the eye views, lower towards the walls and lumpy, and the walls rise through it, so there is no seam to see through. The ways
// (doors to the next room, the way out) open a throat through the rock out to the margin. `lift` raises the rock with the floor of a
// sloping passage. Pure geometry, made once per room.
export interface Throat { x: number; y: number; side?: Side }
const smooth01 = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const hash2 = (seed: number, x: number, z: number) => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const valueNoise = (seed: number, x: number, z: number) => {
  const [xi, zi] = [Math.floor(x), Math.floor(z)];
  const [u, v] = [smooth01(x - xi), smooth01(z - zi)];
  const [a, b, c, d] = [hash2(seed, xi, zi), hash2(seed, xi + 1, zi), hash2(seed, xi, zi + 1), hash2(seed, xi + 1, zi + 1)];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
// Smooth noise in [0, 1] with three octaves: the rock's bulges, its knobs and its grain
export const rockNoise = (seed: number, x: number, z: number) => valueNoise(seed, x * 1.1, z * 1.1) * 0.58 + valueNoise(seed + 1, x * 2.7, z * 2.7) * 0.3 + valueNoise(seed + 2, x * 6.5, z * 6.5) * 0.12;
const sideOf = (t: Throat, w: number, h: number): Side => t.side ?? (t.x === 0 ? "w" : t.x === w - 1 ? "e" : t.y === 0 ? "n" : "s");
const STEP: Record<Side, [number, number]> = { w: [-1, 0], e: [1, 0], n: [0, -1], s: [0, 1] };

// For each point of a grid over the room and its margin: how far it is from the floor (0 on it) and, on the floor, how far from the rock
function fieldOf(mask: string[], ways: Throat[], w: number, h: number, margin: number) {
  const floor = new Set<string>();
  mask.forEach((row, y) => Array.from(row).forEach((c, x) => { if (c === "#") floor.add(`${x},${y}`); }));
  for (const t of ways) {
    const [dx, dy] = STEP[sideOf(t, w, h)];
    for (let k = 1; k <= margin + 2; k++) floor.add(`${t.x + dx * k},${t.y + dy * k}`);
  }
  return (px: number, pz: number): [number, number] => {
    let d = 9;
    let e = 9;
    const [cx, cz] = [Math.floor(px), Math.floor(pz)];
    for (let sz = cz - 3; sz <= cz + 3; sz++)
      for (let sx = cx - 3; sx <= cx + 3; sx++) {
        const dd = Math.hypot(Math.max(sx - px, 0, px - (sx + 1)), Math.max(sz - pz, 0, pz - (sz + 1)));
        if (floor.has(`${sx},${sz}`)) d = Math.min(d, dd);
        else e = Math.min(e, dd);
      }
    return [d, e];
  };
}

const colourAt = (p: RockPalette, t: number, n: number) => {
  const c = new THREE.Color(p.rockDark).lerp(new THREE.Color(p.rock), smooth01(t * 1.7));
  if (t > 0.45 && n > 0.62) c.lerp(new THREE.Color(p.rockLight), smooth01((n - 0.62) * 4) * 0.7);
  return c;
};

export function caveShellGeometry(o: { mask: string[]; ways: Throat[]; w: number; h: number; seed: number; wall: number; ceiling?: number; lift?: (x: number, z: number) => number; detail: 0 | 1; palette: RockPalette }): { walls: THREE.BufferGeometry; roof?: THREE.BufferGeometry } {
  const M = 2;
  const res = o.detail ? 4 : 2;
  const field = fieldOf(o.mask, o.ways, o.w, o.h, M);
  const lift = o.lift ?? (() => 0);
  const [nx, nz] = [(o.w + 2 * M) * res + 1, (o.h + 2 * M) * res + 1];
  const count = nx * nz;
  const dist = new Float32Array(count);
  const deep = new Float32Array(count);
  const wallPos = new Float32Array(count * 3);
  const wallCol = new Float32Array(count * 3);
  const roofPos = o.ceiling ? new Float32Array(count * 3) : undefined;
  const roofCol = o.ceiling ? new Float32Array(count * 3) : undefined;
  for (let gz = 0; gz < nz; gz++)
    for (let gx = 0; gx < nx; gx++) {
      const i = gz * nx + gx;
      const [px, pz] = [-M + gx / res, -M + gz / res];
      const [d, e] = field(px, pz);
      dist[i] = d;
      deep[i] = e;
      const n = rockNoise(o.seed, px, pz);
      const base = lift(Math.max(0, Math.min(o.w, px)), Math.max(0, Math.min(o.h, pz)));
      // (level with the floor, a hair under it, where the floor is; up from its edge to the lip, and on up beyond it)
      // (and at the foot of the rock, on the floor's own edge, a little rubble, which rounds off the corners of its squares)
      const up = d <= 0 ? (e < 0.45 ? (0.45 - e) * (0.35 + 0.9 * n) : -0.03) : o.wall * (smooth01(d / 0.9) * (0.78 + 0.44 * n) + Math.max(0, d - 0.9) * 0.45) + 0.45 * (0.35 + 0.9 * n) * (1 - smooth01(d / 0.5));
      // (the face is pushed about a little across, so that the grid of the sheet does not show)
      const j = d > 0 ? Math.min(1, d * 2) * 0.22 : 0;
      const [jx, jz] = [(rockNoise(o.seed + 17, px * 2, pz * 2) - 0.5) * j, (rockNoise(o.seed + 29, px * 2, pz * 2) - 0.5) * j];
      wallPos.set([px + jx, base + up, pz + jz], i * 3);
      const c = colourAt(o.palette, up / o.wall, n);
      wallCol.set([c.r, c.g, c.b], i * 3);
      if (roofPos && roofCol && o.ceiling) {
        // The roof: highest over the middle of a chamber, coming down towards the walls and into them, hung with knobs of rock
        const knob = rockNoise(o.seed + 41, px * 1.4, pz * 1.4);
        const down = (d <= 0 ? 0.55 * (1 - smooth01(e / 1.6)) : 0.55 + d * 0.7) + knob * 0.4;
        roofPos.set([px + jx, base + o.ceiling - down, pz + jz], i * 3);
        const r = new THREE.Color(o.palette.rockDark).lerp(new THREE.Color(o.palette.rock), 0.25 + knob * 0.45);
        roofCol.set([r.r, r.g, r.b], i * 3);
      }
    }
  const wallIdx: number[] = [];
  const roofIdx: number[] = [];
  for (let gz = 0; gz + 1 < nz; gz++)
    for (let gx = 0; gx + 1 < nx; gx++) {
      const [a, b, c, d] = [gz * nx + gx, gz * nx + gx + 1, (gz + 1) * nx + gx, (gz + 1) * nx + gx + 1];
      // (the floor itself is drawn by the room; the sheet starts at its edge)
      if (!(dist[a] <= 0 && dist[b] <= 0 && dist[c] <= 0 && dist[d] <= 0) || Math.min(deep[a], deep[b], deep[c], deep[d]) < 0.45) wallIdx.push(a, c, b, b, c, d);
      if (roofPos && Math.max(dist[a], dist[b], dist[c], dist[d]) < 1.7) roofIdx.push(a, b, c, b, d, c);
    }
  const make = (pos: Float32Array, col: Float32Array, idx: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const out = boxUV(g, SURFACE_GRAIN.stone);
    g.dispose();
    return out;
  };
  return { walls: make(wallPos, wallCol, wallIdx), roof: roofPos && roofCol ? make(roofPos, roofCol, roofIdx) : undefined };
}

const rockMaterial = () => surfaceMaterial("stone", "rock_face_03", { vertexColors: true, lift: 1.25, parallax: 0.04, side: THREE.DoubleSide });

// The rock round a winding floor (and the roof over it, `ceiling` high, in the eye views): one sheet, see caveShellGeometry. `ways` are
// the squares of doors and ways out, where the rock opens. It blocks the view and the shot (`solid`, AIM.solids, given by the room).
export function CaveWalls({ mask, ways, w, h, biome, tier, seed, tall = false, ceiling, lift, liftKey = "", solid }: { mask: string[]; ways: Throat[]; w: number; h: number; biome: string; tier: Tier; seed: number; tall?: boolean; ceiling?: number; lift?: (x: number, z: number) => number; liftKey?: string; solid?: (o: THREE.Object3D | null) => void }) {
  const palette = rockPaletteOf(biome);
  const key = `${mask.join("|")}:${ways.map((a) => `${a.x},${a.y}${a.side ?? ""}`).join(";")}:${biome}:${tier}:${seed}:${tall ? "t" : "l"}:${ceiling ?? ""}:${liftKey}`;
  const shell = useMemo(
    () => caveShellGeometry({ mask, ways, w, h, seed, wall: tall ? (ceiling ?? 3) + 0.7 : 1.25, ceiling, lift, detail: tier === "lite" ? 0 : 1, palette }),
    [key],
  );
  useEffect(() => () => { shell.walls.dispose(); shell.roof?.dispose(); }, [shell]);
  return (
    <group ref={solid}>
      <mesh geometry={shell.walls} material={rockMaterial()} receiveShadow castShadow={tier !== "lite"} raycast={solid ? undefined : () => null} />
      {shell.roof && <mesh geometry={shell.roof} material={rockMaterial()} receiveShadow raycast={solid ? undefined : () => null} />}
    </group>
  );
}

// The floor of a sloping passage of a cave: its squares, each as high as the slope is there (`lift`), smooth from end to end; set where
// the plain floor would be (its middle at the room's), so that a tap on it is read by the same arithmetic
export function RampFloor({ mask, width, height, color, lift, liftKey, onClick }: { mask: string[]; width: number; height: number; color: string; lift: (x: number, z: number) => number; liftKey: string; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, height, width * 2, height * 2);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, lift(p.getX(i) + width / 2, p.getZ(i) + height / 2) + (rockNoise(7, p.getX(i), p.getZ(i)) - 0.5) * 0.06);
    g.computeVertexNormals();
    const out = boxUV(g, SURFACE_GRAIN.stone);
    g.dispose();
    return out;
  }, [mask.join("|"), width, height, liftKey]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => surfaceMaterial("stone", "rock_face_03", { tint: color, lift: 2.2, parallax: 0.03 }), [color]);
  return <mesh geometry={geometry} material={material} position={[width / 2, 0, height / 2]} receiveShadow onClick={onClick} raycast={onClick ? undefined : () => null} />;
}


// The mouth of a cave as it is seen from outside (2026-10-30; the user: "The entry to caves (a standard door) looks all wrong - it is a
// CAVE, it should have a proper organic looking entrance"): an arch of piled, weathered rock, wider at the foot, with a dark throat inside
// it going into the hill. It stands on the wall line where a door would, in the doorway's frame (x along the wall, +z into the room).
// `dark` (seen from outside) puts the dark of the cave inside it; from inside the light of day shows through it.
export function RockArch({ biome, tier, seed, wide = 1.7, high = 2.5, dark = false }: { biome: string; tier: Tier; seed: number; wide?: number; high?: number; dark?: boolean }) {
  const palette = rockPaletteOf(biome);
  const throat = useMemo(() => {
    // the dark of the passage beyond: an arch-shaped hole, a little inside
    const s = new THREE.Shape();
    s.moveTo(-wide / 2, 0);
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI - (i / 16) * Math.PI;
      s.lineTo(Math.cos(a) * wide / 2, Math.sin(a) ** 0.8 * high * 0.92);
    }
    s.lineTo(wide / 2, 0);
    return new THREE.ShapeGeometry(s, 8);
  }, [wide, high]);
  useEffect(() => () => throat.dispose(), [throat]);
  return (
    <>
      <Model
        id={`rockarch:${biome}:${tier}:${seed % 7}:${wide.toFixed(1)}:${high.toFixed(1)}`}
        build={(k: Kit) => {
          k.surfaces = rockSurfaces(palette);
          const next = stream(seed * 13 + 3);
          const detail = tier === "lite" ? 0 : 1;
          // The jambs and the lintel: rocks close along an arch (each overlapping the next), larger and darker at the foot
          const n = tier === "lite" ? 12 : 20;
          for (let i = 0; i <= n; i++) {
            const a = Math.PI - (i / n) * Math.PI;
            const foot = 1 - Math.sin(a);
            const r = 0.3 + foot * 0.22 + next() * 0.12;
            const [x, y] = [Math.cos(a) * (wide / 2 + r * 0.7), Math.sin(a) ** 0.8 * high + r * 0.35];
            k.blob(r, foot > 0.5 ? palette.rockDark : i % 3 ? palette.rock : palette.rockLight, { at: [x, Math.max(r * 0.6, y), (next() - 0.5) * 0.25], seed: seed + i, rough: 0.34, detail, squash: [1, 1.1, 0.9 + next() * 0.3] });
            // a second, outer course, so that the arch is thick and the hill closes round it
            k.blob(r * 1.2, palette.rock, { at: [x * 1.25, Math.max(r * 0.7, y * 1.1 + 0.2), 0.35 + next() * 0.2], seed: seed + 50 + i, rough: 0.3, detail: 0, squash: [1, 1, 1] });
          }
          // Fallen rocks at the foot, out in front
          for (let i = 0; i < 4; i++) k.blob(0.12 + next() * 0.14, palette.rockDark, { at: [(next() - 0.5) * (wide + 1.4), 0.06, -0.3 - next() * 0.6], seed: seed + 90 + i, rough: 0.35, detail: 0, squash: [1.2, 0.6, 1] });
        }}
      />
      {dark && (
        <>
          <mesh geometry={throat} position={[0, 0.01, 0.55]} raycast={() => null}>
            <meshBasicMaterial color="#050608" side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0.9]} raycast={() => null}>
            <planeGeometry args={[wide, 1.2]} />
            <meshBasicMaterial color="#0b0c0e" />
          </mesh>
        </>
      )}
    </>
  );
}

// A cave seen from outside: a hill of rock over its mouth's floor (its foot running out a little round it), one surface with a rough
// face, low and broken where the way in is so that the arch (RockArch, drawn by the map on the wall line) stands in a hollow of it.
// The rooms under the ground are not drawn from outside. `exits` are the squares of ways out of the building.
export function CaveMound({ mask, exits, w, h, biome, tier, seed }: { mask: string[]; exits: Throat[]; w: number; h: number; biome: string; tier: Tier; seed: number }) {
  const palette = rockPaletteOf(biome);
  const key = `${mask.join("|")}:${exits.map((a) => `${a.x},${a.y}`).join(";")}:${biome}:${tier}:${seed}`;
  const geometry = useMemo(() => {
    const M = 2;
    const res = tier === "lite" ? 2 : 3;
    const field = fieldOf(mask, [], w, h, M);
    const [nx, nz] = [(w + 2 * M) * res + 1, (h + 2 * M) * res + 1];
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const top = 2.6 + Math.min(w, h) * 0.18;
    for (let gz = 0; gz < nz; gz++)
      for (let gx = 0; gx < nx; gx++) {
        const i = gz * nx + gx;
        const [px, pz] = [-M + gx / res, -M + gz / res];
        const [d, e] = field(px, pz);
        // signed: how far inside the floor (towards its middle), less how far outside it
        const signed = d > 0 ? -d : e;
        const n = rockNoise(seed, px, pz);
        let y = top * smooth01((signed + 1.4) / 3.4) * (0.75 + 0.5 * n) + (n - 0.5) * 0.25;
        // the hollow the mouth stands in: low in front of the way and just inside it
        for (const x of exits) {
          const [dx, dy] = STEP[sideOf(x, w, h)];
          const [mx, mz] = [x.x + 0.5 + dx * 0.5, x.y + 0.5 + dy * 0.5];
          const m = Math.hypot(px - mx, pz - mz);
          y *= 0.15 + 0.85 * smooth01((m - 0.9) / 1.8);
        }
        pos.set([px, Math.max(0, y), pz], i * 3);
        const c = colourAt(palette, y / top, n);
        col.set([c.r, c.g, c.b], i * 3);
      }
    const idx: number[] = [];
    for (let gz = 0; gz + 1 < nz; gz++)
      for (let gx = 0; gx + 1 < nx; gx++) {
        const [a, b, c, d] = [gz * nx + gx, gz * nx + gx + 1, (gz + 1) * nx + gx, (gz + 1) * nx + gx + 1];
        if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]) <= 0.001) continue;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const out = boxUV(g, SURFACE_GRAIN.stone);
    g.dispose();
    return out;
  }, [key]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={rockMaterial()} castShadow={tier !== "lite"} receiveShadow />;
}
