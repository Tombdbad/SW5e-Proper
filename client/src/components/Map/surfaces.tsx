// The textures of the 3D map's surfaces (2026-10-24): Poly Haven sets (CC0, public/textures, see CREDITS.md) for the stone of caves,
// rocks and stone walls, the bark of trees and logs, the leaves of canopies and fronds, and the walls of rooms. Each is lit by its
// normal map and shifted by its height map (offset parallax, as the ground is). A material is made once and shared. Its maps are put
// in when they load: until then a surface is drawn in its vertex colour alone, and the placeholders are flat, so nothing is black.
// This module is shared by models.tsx and siteAssets.tsx, so it imports neither.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { V3 } from "./models";

export const NORMAL_SCALE = new THREE.Vector2(1.3, 1.3); // how steep the normal maps read (as the ground's)
export const WALL_TILE = 2; // squares of wall in one repeat of a wall texture

// Texture coordinates for a mesh that has none: each triangle is projected along the axis its normal points most along (a box
// mapping), in model units times `grain`. The triangles are unjoined, so the seams between faces show as breaks in a pattern.
export function boxUV(source: THREE.BufferGeometry, grain: number): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source.clone();
  const p = geo.attributes.position as THREE.BufferAttribute;
  const n = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let t = 0; t < p.count; t += 3) {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) {
      nx += n.getX(t + k);
      ny += n.getY(t + k);
      nz += n.getZ(t + k);
    }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (let k = 0; k < 3; k++) {
      const i = t + k;
      const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
      uv[i * 2] = u * grain;
      uv[i * 2 + 1] = v * grain;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Offset parallax for a Phong material: the height at a point (0.5 is level) moves the maps toward the viewer. The height map is
// passed as a uniform object, so that it can be filled in when it loads.
export function parallaxShader(shader: THREE.WebGLProgramParametersWithUniforms, heightMap: { value: THREE.Texture | null }, parallax: number) {
  shader.uniforms.heightMap = heightMap;
  shader.uniforms.parallax = { value: parallax };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
    .replace("#include <project_vertex>", "#include <project_vertex>\n  vWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform sampler2D heightMap;\nuniform float parallax;\nvarying vec3 vWorld;")
    .replace("#include <map_fragment>", `
  // Offset parallax: the height here (0.5 is level) moves the texture toward the viewer
  vec3 toEye = normalize( cameraPosition - vWorld );
  vec2 shift = - toEye.xz / max( toEye.y, 0.2 ) * ( texture2D( heightMap, vMapUv ).r - 0.5 ) * parallax;
  vec4 sampledDiffuseColor = texture2D( map, vMapUv + shift );
  diffuseColor *= sampledDiffuseColor;`)
    .replace("#include <normal_fragment_maps>", `
  vec3 mapN = texture2D( normalMap, vNormalMapUv + shift ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );`);
}

// The ground's version of the same, with its height map at hand
export function groundShader(shader: THREE.WebGLProgramParametersWithUniforms, heightMap: THREE.Texture, parallax: number) {
  parallaxShader(shader, { value: heightMap }, parallax);
}

const loader = new THREE.TextureLoader();
const flat = (rgb: [number, number, number]) => {
  const t = new THREE.DataTexture(new Uint8Array([...rgb, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};
// One map of a set; a map that does not load stays flat (the surface stays as it was)
function loadMap(url: string, colour: boolean): Promise<THREE.Texture | null> {
  return new Promise((done) => {
    loader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        if (colour) t.colorSpace = THREE.SRGBColorSpace;
        done(t);
      },
      undefined,
      () => done(null),
    );
  });
}

export interface SurfaceOptions {
  vertexColors?: boolean; // the colours of the vertices multiply the photograph (a model's parts, a room's walls)
  tint?: string; // else the photograph as it is
  lift?: number; // brightens the photograph (a dark one, such as leaf litter, reads as a plant's green)
  parallax: number; // how far the height map shifts the maps (in repeats; see parallaxShader)
  shininess?: number;
}
const SURFACES = new Map<string, THREE.MeshPhongMaterial>();
// The material of a texture set (public/textures/<folder>/<set>): shared by everyone asking for the same one
export function surfaceMaterial(folder: string, set: string, o: SurfaceOptions): THREE.MeshPhongMaterial {
  const key = [folder, set, o.vertexColors ? "v" : "", o.tint ?? "", o.lift ?? 1, o.parallax, o.shininess ?? 8].join("|");
  const have = SURFACES.get(key);
  if (have) return have;
  const height = { value: flat([128, 128, 128]) as THREE.Texture | null };
  const m = new THREE.MeshPhongMaterial({
    vertexColors: o.vertexColors ?? false,
    color: new THREE.Color(o.tint ?? "#ffffff").multiplyScalar(o.lift ?? 1),
    map: flat([255, 255, 255]),
    normalMap: flat([128, 128, 255]),
    normalScale: NORMAL_SCALE,
    specular: new THREE.Color("#202020"),
    shininess: o.shininess ?? 8,
  });
  m.onBeforeCompile = (shader) => parallaxShader(shader, height, o.parallax);
  // The maps come in a browser only: the tests import this module without a document, and there the surfaces stay flat
  if (typeof document !== "undefined") {
    const base = `/textures/${folder}/${set}`;
    Promise.all([loadMap(`${base}/diffuse.jpg`, true), loadMap(`${base}/normal.jpg`, false), loadMap(`${base}/height.jpg`, false)]).then(([d, n, h]) => {
      if (d) m.map = d;
      if (n) m.normalMap = n;
      if (h) height.value = h;
      m.needsUpdate = true;
    });
  }
  SURFACES.set(key, m);
  return m;
}

// The walls of rooms: which set a room's plain walls get, by its pack style (`packOf`), else by its world (sandstone on the desert,
// plaster elsewhere). `wallSet` is pure; the sets are the Poly Haven wall sets in public/textures/wall.
export type WallSet = "painted_plaster_wall" | "brick_wall_001" | "concrete_wall_003" | "corrugated_iron_02" | "rusty_metal_02" | "sandstone_blocks_05";
export function wallSet(pack: string | undefined, biome: string): WallSet {
  switch (pack) {
    case "industrial": return "corrugated_iron_02";
    case "hull": return "rusty_metal_02";
    case "criminal": return "brick_wall_001";
    case "station":
    case "military": return "concrete_wall_003";
    default: return biome === "desert" ? "sandstone_blocks_05" : "painted_plaster_wall";
  }
}
// A wall's material: the photograph in the room's wall colour (lightened toward white so the photograph shows), or the kit's own colours
export function wallMaterial(set: WallSet, o: { tint?: string; vertexColors?: boolean } = {}): THREE.MeshPhongMaterial {
  const tint = o.tint ? new THREE.Color(o.tint).lerp(new THREE.Color("#ffffff"), 0.5).getStyle() : undefined;
  return surfaceMaterial("wall", set, { vertexColors: o.vertexColors, tint, lift: 1.5, parallax: 0.03 });
}
// A plain wall's box, with texture coordinates in squares
export function WallGeometry({ size }: { size: V3 }) {
  const geo = useMemo(() => boxUV(new THREE.BoxGeometry(...size), 1 / WALL_TILE), [size.join(",")]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <primitive attach="geometry" object={geo} />;
}
export function WallMaterial({ set, tint }: { set: WallSet; tint: string }) {
  return <primitive attach="material" object={wallMaterial(set, { tint })} />;
}

// The finishes that are drawn with a texture (models.tsx MATERIALS): the stone of rock, the bark of trees and logs, the leaves of
// canopies and fronds. Their texture coordinates are box-projected at this many repeats per model unit.
export const SURFACE_GRAIN = { stone: 1, bark: 1.5, leaf: 1.5 } as const;
