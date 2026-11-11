// The ground beyond a place (2026-11-10; the user: "generate realistic terrain for our worlds, settlements, districts and location maps"). Round a
// settlement, a district or a wild place the walkable ground is a plane; beyond it, under an open sky, the land goes on as the biome's own hills,
// ridges and valleys (shared/logic/terrain.ts: weathered height field, coloured by slope and by where the water went), flat under the place and
// rising away from it, dressed with trees or rocks where they can stand. The same seed makes the same land every visit; the horizon's mountains
// (scenery.tsx WorldSky) stand behind it.
import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { scatterOn, terrainColorAt, terrainFor, terrainHeight, terrainSlope, terrainStyleOf, terrainWater, type Terrain } from "@shared/logic";
import { UNITS_PER_M } from "./models";
import { useQuality } from "./siteAssets";

const SIZE_M = 1500;
// Where the land is the place's own flat ground, and how far past it the hills reach their height (units: one square)
const RISE = 320;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// The average colour of the ground's photograph, so that the relief takes up where the textured ground leaves off
function averageOf(image: CanvasImageSource & { width?: number; height?: number }): THREE.Color {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const g = c.getContext("2d")!;
    g.drawImage(image, 0, 0, 1, 1);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, gr / 255, b / 255, THREE.SRGBColorSpace);
  } catch {
    return new THREE.Color("#6d6a58");
  }
}
// What stands on the land far off: trees in a green biome (cones of a few sizes), rocks in a bare one
const TREES: Record<string, number> = { temperate: 0.5, forest: 1, jungle: 1, swamp: 0.45, ocean: 0.25, ice: 0.12 };
const ROCKS: Record<string, number> = { desert: 0.1, volcanic: 0.22, barren: 0.22, ice: 0.15, temperate: 0.05, ocean: 0.05 };

export function ReliefGround({ biome, seed, inner, at, set, tint }: { biome: string; seed: number; inner: number; at: [number, number, number]; set: string; tint: THREE.Color }) {
  const diffuse = useTexture(`/textures/ground/${set}/diffuse.jpg`);
  const lite = useQuality((q) => q.tier === "lite");
  const built = useMemo(() => {
    const st = terrainStyleOf(biome);
    const t: Terrain = terrainFor({ seed: (seed ^ 0x5bd1e995) | 0, biome, size: SIZE_M, n: lite ? 97 : 145, scale: 1, erosion: "light", basins: st.lakes });
    const unit = UNITS_PER_M;
    const half = (SIZE_M / 2) * unit;
    // The ground's own colour where the textured ground ends, the land's colour from there out
    const ground = averageOf(diffuse.image as HTMLImageElement).multiply(tint);
    const floor = t.min + (t.max - t.min) * 0.2;
    const heightAt = (xm: number, zm: number) => {
      const d = Math.max(Math.abs(xm), Math.abs(zm)) * unit;
      return Math.max(0, terrainHeight(t, xm, zm) - floor) * unit * smooth(inner, inner + RISE, d);
    };
    const n = lite ? 97 : 145;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const c = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [xm, zm] = [t.x0 + i * t.cell, t.z0 + j * t.cell];
        const y = heightAt(xm, zm);
        const k = (j * n + i) * 3;
        pos.set([xm * unit, y, zm * unit], k);
        const d = Math.max(Math.abs(xm), Math.abs(zm)) * unit;
        const [r, g, b] = terrainColorAt(t, xm, zm, { alt: (terrainHeight(t, xm, zm) - t.min) / Math.max(1, t.max - t.min), slope: terrainSlope(t, xm, zm) * smooth(inner, inner + RISE, d) });
        c.setRGB(r, g, b);
        c.lerp(ground, 1 - smooth(inner, inner + 140, d));
        col.set([c.r, c.g, c.b], k);
      }
    }
    const index = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const v = j * n + i;
        index.set([v, v + n, v + 1, v + 1, v + n, v + n + 1], q);
        q += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    // Dressing: where it stands, outside the place and its first foothills, on ground it can stand on
    // The water first, so that nothing is planted in it
    const wet = terrainWater(t);
    const dry = (xm: number, zm: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([i, j]) => Number.isNaN(wet.surface[Math.max(0, Math.min(t.n - 1, Math.round((zm - t.z0) / t.cell) + j)) * t.n + Math.max(0, Math.min(t.n - 1, Math.round((xm - t.x0) / t.cell) + i))]));
    const away = (xm: number, zm: number) => Math.max(Math.abs(xm), Math.abs(zm)) * unit > inner + 40 && Math.max(Math.abs(xm), Math.abs(zm)) * unit < half - 20 && dry(xm, zm);
    const dress = (rule: Parameters<typeof scatterOn>[1], cap: number) => scatterOn(t, rule, away).slice(0, cap);
    const trees = TREES[biome] ? dress({ spacing: lite ? 34 : 24, density: TREES[biome], maxSlope: 0.5, maxAlt: 0.8, seed: 3 }, lite ? 900 : 2600) : [];
    const rocks = ROCKS[biome] ? dress({ spacing: 40, density: ROCKS[biome] * 2.5, maxSlope: 0.9, seed: 5 }, 600) : [];
    const place = (list: [number, number][], scale: (i: number) => [number, number, number], color: (i: number) => THREE.Color, geometry: THREE.BufferGeometry, lift: number) => {
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial(), list.length);
      const m = new THREE.Matrix4();
      list.forEach(([xm, zm], i) => {
        const [sx, sy, sz] = scale(i);
        m.compose(new THREE.Vector3(xm * unit, heightAt(xm, zm) + sy * lift, zm * unit), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 2.4, 0)), new THREE.Vector3(sx, sy, sz));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color(i));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.raycast = () => null;
      return mesh;
    };
    const P = st.palette;
    const jitter = (i: number) => 0.8 + 0.4 * ((i * 2654435761) % 1000) / 1000;
    const treeMesh = place(trees, (i) => [2.4 * jitter(i) + 1, 7 * jitter(i * 3) + 2.5, 2.4 * jitter(i) + 1], (i) => new THREE.Color(P.low).multiplyScalar(0.5 * jitter(i * 7)), new THREE.ConeGeometry(1, 2, 6), 1);
    const rockMesh = place(rocks, (i) => [1.5 * jitter(i * 5) + 1, 1.1 * jitter(i * 11) + 0.6, 1.5 * jitter(i * 13) + 1], (i) => new THREE.Color(P.rock).multiplyScalar(0.8 * jitter(i * 17)), new THREE.DodecahedronGeometry(1, 0), 0.4);
    // The water drawn (shared/logic/terrain.ts terrainWater): lakes where the ground is a bowl, rivers where the drainage gathers, away from the place
    const level = (xm: number, zm: number, y: number) => Math.max(0, y - floor) * unit * smooth(inner, inner + RISE, Math.max(Math.abs(xm), Math.abs(zm)) * unit) + 0.08;
    const lakePos: number[] = [];
    const lakeIdx: number[] = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const corners = [j * n + i, j * n + i + 1, (j + 1) * n + i, (j + 1) * n + i + 1];
        const vals = corners.map((c) => wet.surface[c]);
        if (vals.some((v) => Number.isNaN(v))) continue;
        const [xm, zm] = [t.x0 + (i + 0.5) * t.cell, t.z0 + (j + 0.5) * t.cell];
        if (Math.max(Math.abs(xm), Math.abs(zm)) * unit < inner + 50) continue;
        const base = lakePos.length / 3;
        for (const [k, c] of corners.entries()) lakePos.push((t.x0 + ((c % n)) * t.cell) * unit, level(xm, zm, vals[k]), (t.z0 + Math.floor(c / n) * t.cell) * unit);
        lakeIdx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    let lakes: THREE.BufferGeometry | null = null;
    if (lakeIdx.length) {
      lakes = new THREE.BufferGeometry();
      lakes.setAttribute("position", new THREE.Float32BufferAttribute(lakePos, 3));
      lakes.setIndex(lakeIdx);
      lakes.computeVertexNormals();
    }
    const ribbonPos: number[] = [];
    const ribbonIdx: number[] = [];
    for (const river of wet.rivers) {
      // (only the part of the line away from the place, a ribbon of two vertices a step, as wide as the river is big)
      const line = river.line.filter(([xm, zm]) => Math.max(Math.abs(xm), Math.abs(zm)) * unit >= inner + 50);
      if (line.length < 2) continue;
      const first = ribbonPos.length / 3;
      line.forEach(([xm, zm], i) => {
        const [p, q] = [line[Math.max(0, i - 1)], line[Math.min(line.length - 1, i + 1)]];
        const yaw = Math.atan2(q[1] - p[1], q[0] - p[0]);
        const w = (3 + 12 * river.flow) * 0.5;
        const [nx, nz] = [-Math.sin(yaw) * w, Math.cos(yaw) * w];
        const y = level(xm, zm, terrainHeight(t, xm, zm)) + 0.12;
        ribbonPos.push((xm - nx) * unit, y, (zm - nz) * unit, (xm + nx) * unit, y, (zm + nz) * unit);
        if (i) {
          const v = first + i * 2;
          ribbonIdx.push(v - 2, v - 1, v, v - 1, v + 1, v);
        }
      });
    }
    let rivers: THREE.BufferGeometry | null = null;
    if (ribbonIdx.length) {
      rivers = new THREE.BufferGeometry();
      rivers.setAttribute("position", new THREE.Float32BufferAttribute(ribbonPos, 3));
      rivers.setIndex(ribbonIdx);
      rivers.computeVertexNormals();
    }
    return { geo, treeMesh, rockMesh, lakes, rivers };
  }, [biome, seed, inner, lite, diffuse, tint]);
  useEffect(() => () => {
    built.geo.dispose();
    built.lakes?.dispose();
    built.rivers?.dispose();
    built.treeMesh?.geometry.dispose();
    built.rockMesh?.geometry.dispose();
  }, [built]);
  return (
    <group position={at}>
      <mesh geometry={built.geo} raycast={() => null}>
        <meshLambertMaterial vertexColors />
      </mesh>
      {built.lakes && (
        <mesh geometry={built.lakes} raycast={() => null}>
          <meshLambertMaterial color="#3f7fb0" transparent opacity={0.88} side={THREE.DoubleSide} />
        </mesh>
      )}
      {built.rivers && (
        <mesh geometry={built.rivers} raycast={() => null}>
          <meshLambertMaterial color="#3f7fb0" transparent opacity={0.88} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      )}
      {built.treeMesh && <primitive object={built.treeMesh} />}
      {built.rockMesh && <primitive object={built.rockMesh} />}
    </group>
  );
}
