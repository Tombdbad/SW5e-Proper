// The ground beyond a place (2026-11-10; the user: "generate realistic terrain for our worlds, settlements, districts and location maps"). Round a
// settlement, a district or a wild place the walkable ground is a plane; beyond it, under an open sky, the land goes on as the biome's own hills,
// ridges and valleys (shared/logic/terrain.ts: weathered height field, coloured by slope and by where the water went), flat under the place and
// rising away from it, dressed with trees or rocks where they can stand. The same seed makes the same land every visit; the horizon's mountains
// (scenery.tsx WorldSky) stand behind it.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { kitSpots, scatterOn, terrainFor, terrainHeight, terrainSlope, terrainStyleOf, terrainSurface, terrainWater, type Terrain } from "@shared/logic";
import { UNITS_PER_M } from "./models";
import { useQuality } from "./siteAssets";
import { shaderPatch, type GroundLayers } from "./babylon";
import { meanOf } from "./surfaces";

// The layers of the ground (2026-11-11, ground material v2: see GroundLayers in babylon.ts). The soil is the place's own photograph (so that the land takes up
// where the walkable ground ends); rock, pale ground (sand, snow) and wet ground (mud) are Poly Haven sets in public/textures. The hue is the biome's palette
// (vertex colour); the photographs lend their pattern and relief only.
const ROCK_SET = (biome: string) => (biome === "volcanic" ? "ground/dark_rock" : "stone/rock_face_03");
const PALE_SET = (biome: string) => (biome === "ice" ? "ground/snow_02" : "ground/dense_sand");
const WET_SET = (biome: string) => (biome === "ice" ? "ground/snow_02" : "ground/brown_mud_03");
// The water's material (see the "water" patch in babylon.ts): its depth tint and foam are the shader's, its geometry carries `shore` (the depth in metres)
const WATER_COLOURS: Record<string, [string, string]> = { default: ["#2f6f95", "#0e3a58"], swamp: ["#5b7a4a", "#2a3d26"], ice: ["#9cc8e0", "#2c6d96"], jungle: ["#3f8a78", "#124a45"], desert: ["#4d93a8", "#14506a"] };
export function useWaterMaterial(biome: string): THREE.Material {
  const [shallow, deep] = WATER_COLOURS[biome] ?? WATER_COLOURS.default;
  const time = useMemo(() => ({ value: 0 }), []);
  useFrame((_, dt) => { time.value += Math.min(dt, 0.1); });
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.12, metalness: 0, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
    const [s, d] = [new THREE.Color(shallow), new THREE.Color(deep)];
    return shaderPatch(m, { kind: "water", time, shallow: [s.r, s.g, s.b], deep: [d.r, d.g, d.b] });
  }, [shallow, deep, time]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}
// The material of the layered ground for a biome and a soil set (shared by the relief round a place and the ground of a race)
export function useGroundMaterial(biome: string, soilSet: string, double = false): THREE.Material {
  const lite = useQuality((q) => q.tier === "lite");
  const urls = [`/textures/ground/${soilSet}/diffuse.jpg`, `/textures/${ROCK_SET(biome)}/diffuse.jpg`, `/textures/${PALE_SET(biome)}/diffuse.jpg`, `/textures/${WET_SET(biome)}/diffuse.jpg`, `/textures/ground/${soilSet}/normal.jpg`, `/textures/${ROCK_SET(biome)}/normal.jpg`];
  const maps = useTexture(urls) as THREE.Texture[];
  const material = useMemo(() => {
    for (const t of maps) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
    }
    const [soil, rock, pale, wet, soilN, rockN] = maps;
    const layers: GroundLayers = {
      soil, rock, pale: lite ? null : pale, wet: lite ? null : wet, soilN: lite ? null : soilN, rockN: lite ? null : rockN,
      avg: [soil, rock, pale, wet].map((t) => meanOf(t.image as CanvasImageSource)),
      tile: [9, 14, 10, 7], strength: 0.9, normal: 0.9, lite,
    };
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: double ? THREE.DoubleSide : THREE.FrontSide });
    return shaderPatch(m, { kind: "ground", layers });
  }, [maps, lite, double]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

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

// The kit's meshes by name (public/figures/terrain-kit.glb, tools/blender/build-terrain-kit.py): vertex colours are the rock's tone times its occlusion
function useTerrainKit(): Record<string, THREE.BufferGeometry> {
  const gltf = useGLTF("/figures/terrain-kit.glb");
  return useMemo(() => {
    const out: Record<string, THREE.BufferGeometry> = {};
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) out[mesh.name] = mesh.geometry;
    });
    return out;
  }, [gltf]);
}

export function ReliefGround({ biome, seed, inner, at, set, tint }: { biome: string; seed: number; inner: number; at: [number, number, number]; set: string; tint: THREE.Color }) {
  const diffuse = useTexture(`/textures/ground/${set}/diffuse.jpg`);
  const lite = useQuality((q) => q.tier === "lite");
  const material = useGroundMaterial(biome, set);
  const water = useWaterMaterial(biome);
  const kit = useTerrainKit();
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
    const splat = new Float32Array(n * n * 4);
    const c = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [xm, zm] = [t.x0 + i * t.cell, t.z0 + j * t.cell];
        const y = heightAt(xm, zm);
        const k = (j * n + i) * 3;
        pos.set([xm * unit, y, zm * unit], k);
        const d = Math.max(Math.abs(xm), Math.abs(zm)) * unit;
        const surf = terrainSurface(t, xm, zm, { alt: (terrainHeight(t, xm, zm) - t.min) / Math.max(1, t.max - t.min), slope: terrainSlope(t, xm, zm) * smooth(inner, inner + RISE, d) });
        c.setRGB(surf.color[0], surf.color[1], surf.color[2]);
        const away = smooth(inner, inner + 140, d);
        c.lerp(ground, 1 - away);
        col.set([c.r, c.g, c.b], k);
        // (the layers fade to the soil, the place's own photograph, where the walkable ground ends)
        splat.set([surf.rock * away, surf.pale * away, surf.wet * away, 0], (j * n + i) * 4);
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
    geo.setAttribute("splat", new THREE.BufferAttribute(splat, 4));
    geo.setAttribute("way", new THREE.BufferAttribute(new Float32Array(n * n * 4), 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    // Dressing: where it stands, outside the place and its first foothills, on ground it can stand on
    // The water first, so that nothing is planted in it
    const wet = terrainWater(t);
    const dry = (xm: number, zm: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([i, j]) => Number.isNaN(wet.surface[Math.max(0, Math.min(t.n - 1, Math.round((zm - t.z0) / t.cell) + j)) * t.n + Math.max(0, Math.min(t.n - 1, Math.round((xm - t.x0) / t.cell) + i))]));
    const away = (xm: number, zm: number) => Math.max(Math.abs(xm), Math.abs(zm)) * unit > inner + 40 && Math.max(Math.abs(xm), Math.abs(zm)) * unit < half - 20 && dry(xm, zm);
    const dress = (rule: Parameters<typeof scatterOn>[1], cap: number) => scatterOn(t, rule, away).slice(0, cap);
    const trees = TREES[biome] ? dress({ spacing: lite ? 34 : 24, density: TREES[biome], maxSlope: 0.5, maxAlt: 0.8, seed: 3 }, lite ? 900 : 2600) : [];
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
    // The kit: boulders on the ground that is not flat, scree at the foot of a steep slope, overhanging ledges on the cliffs (shared/logic kitSpots)
    const dryAway = (xm: number, zm: number) => away(xm, zm);
    const spots = kitSpots(t, { boulders: (ROCKS[biome] ?? 0.04) * 2.5, scree: (ROCKS[biome] ?? 0.04) * 3, ledges: st.ridges >= 0.35 ? 0.35 : 0.1, seed: 5, within: dryAway, cap: lite ? 500 : 1400 });
    const kitMeshes: THREE.InstancedMesh[] = [];
    const rockTone = new THREE.Color(P.rock).multiplyScalar(4.2); // (the kit's vertex colours are the rock's tone in light, about 0.2: the biome's own rock colour over it)
    for (const kind of ["boulder_a", "boulder_b", "boulder_c", "scree", "ledge_a", "ledge_b"]) {
      const list = spots.filter((s) => s.kind === kind);
      const geometry = kit[kind];
      if (!list.length || !geometry) continue;
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, color: rockTone, roughness: 0.95, metalness: 0 }), list.length);
      const m = new THREE.Matrix4();
      list.forEach((s, i) => {
        const size = s.scale * unit * 1.4;
        // (stood on the land, sunk by its share of its height, the cliff's ledges with their backs in the slope)
        m.compose(new THREE.Vector3(s.x * unit, heightAt(s.x, s.z) - s.sink * size * (kind.startsWith("ledge") ? 1.2 : 1), s.z * unit), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(size, size, size));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.raycast = () => null;
      kitMeshes.push(mesh);
    }
    // The water drawn (shared/logic/terrain.ts terrainWater): lakes where the ground is a bowl, rivers where the drainage gathers, away from the place
    const level = (xm: number, zm: number, y: number) => Math.max(0, y - floor) * unit * smooth(inner, inner + RISE, Math.max(Math.abs(xm), Math.abs(zm)) * unit) + 0.08;
    const lakePos: number[] = [];
    const lakeShore: number[] = [];
    const lakeIdx: number[] = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const corners = [j * n + i, j * n + i + 1, (j + 1) * n + i, (j + 1) * n + i + 1];
        const vals = corners.map((c) => wet.surface[c]);
        // (a cell with any wet corner: the level is the highest of them, and a dry corner's depth goes negative, so that the shader cuts the shore where the ground comes up through the water)
        if (vals.every((v) => Number.isNaN(v))) continue;
        const surface = Math.max(...vals.filter((v) => !Number.isNaN(v)));
        const [xm, zm] = [t.x0 + (i + 0.5) * t.cell, t.z0 + (j + 0.5) * t.cell];
        if (Math.max(Math.abs(xm), Math.abs(zm)) * unit < inner + 50) continue;
        const base = lakePos.length / 3;
        for (const [k, c] of corners.entries()) {
          const [cx, cz] = [t.x0 + (c % n) * t.cell, t.z0 + Math.floor(c / n) * t.cell];
          lakePos.push(cx * unit, level(xm, zm, surface), cz * unit);
          lakeShore.push(surface - t.h[c]);
        }
        lakeIdx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    let lakes: THREE.BufferGeometry | null = null;
    if (lakeIdx.length) {
      lakes = new THREE.BufferGeometry();
      lakes.setAttribute("position", new THREE.Float32BufferAttribute(lakePos, 3));
      lakes.setAttribute("shore", new THREE.Float32BufferAttribute(lakeShore, 1));
      lakes.setIndex(lakeIdx);
      lakes.computeVertexNormals();
    }
    const ribbonPos: number[] = [];
    const ribbonShore: number[] = [];
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
        // (three vertices across: the banks shallow, the middle as deep as the river is big)
        ribbonPos.push((xm - nx) * unit, y, (zm - nz) * unit, xm * unit, y, zm * unit, (xm + nx) * unit, y, (zm + nz) * unit);
        ribbonShore.push(0, 0.5 + 2.2 * river.flow, 0);
        if (i) {
          const v = first + i * 3;
          ribbonIdx.push(v - 3, v - 2, v, v - 2, v + 1, v, v - 2, v - 1, v + 1, v - 1, v + 2, v + 1);
        }
      });
    }
    let rivers: THREE.BufferGeometry | null = null;
    if (ribbonIdx.length) {
      rivers = new THREE.BufferGeometry();
      rivers.setAttribute("position", new THREE.Float32BufferAttribute(ribbonPos, 3));
      rivers.setAttribute("shore", new THREE.Float32BufferAttribute(ribbonShore, 1));
      rivers.setIndex(ribbonIdx);
      rivers.computeVertexNormals();
    }
    return { geo, treeMesh, kitMeshes, lakes, rivers };
  }, [biome, seed, inner, lite, diffuse, tint, kit]);
  useEffect(() => () => {
    built.geo.dispose();
    built.lakes?.dispose();
    built.rivers?.dispose();
    built.treeMesh?.geometry.dispose();
    built.kitMeshes.forEach((m) => (m.material as THREE.Material).dispose());
  }, [built]);
  return (
    <group position={at}>
      <mesh geometry={built.geo} material={material} raycast={() => null} />
      {built.lakes && (
        <mesh geometry={built.lakes} material={water} raycast={() => null} renderOrder={2} />
      )}
      {built.rivers && (
        <mesh geometry={built.rivers} material={water} raycast={() => null} renderOrder={2} />
      )}
      {built.treeMesh && <primitive object={built.treeMesh} />}
      {built.kitMeshes.map((m) => <primitive key={m.uuid} object={m} />)}
    </group>
  );
}
