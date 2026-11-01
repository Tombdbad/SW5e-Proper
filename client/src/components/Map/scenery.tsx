// Skies, horizons and globes (2026-10-26; the user: "refactor planets surfaces so distant views from settlements show relevant geographical
// features hills, mountains, volcanoes, also add clouds ... add sun/s, moon/s, and celestial bodies to the skies. geographical features
// should show on the planet surface at relevant scale when players are in orbit above a world"). One module for what every outdoor scene
// shares, so that the street, the settlement, the speeder race, the chase on the road and the air battles show the same world:
//   WorldSky     a sky that goes where the camera goes: the dome by the hour, the sun or suns, the moons and the system's other worlds
//                (lit by the sun, so a moon has its phase), stars at night, clouds, and the land on the horizon (shared/logic
//                `landformsOf`: mountains with snow, hills, volcanoes smoking and glowing, mesas, dunes, ridges, spires, a city's towers, a
//                sea), hazed by distance, with the far ground under it out to the horizon
//   PlanetGlobe  the planet seen from orbit: a globe whose ground is raised by the same kind of land (seas and coasts, mountain ranges,
//                volcanoes with lava, canyons, ice caps, a gas giant's bands), flattened under the places on it, with clouds over it
//   PlanetBall   a small planet or moon: the same land painted on a ball, for a sky or the space of a dogfight
// The land is made from noise seeded by the planet (nothing is downloaded or stored). The look of a place is `WorldLook` (shared/logic
// "Skies and landforms"): `worldLook(world, areaId)` where the world is known, `skyLook(biome, seed)` where only the biome is.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Landform, SkyBody, WorldLook } from "@shared/logic";
import { hourOf, moonElongation } from "@shared/logic";

type V3 = [number, number, number];

// ---- Noise: value noise on an integer lattice, smoothly blended, and sums of it at finer and finer scales
function hash3(x: number, y: number, z: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x: number, y: number, z: number, s = 0): number {
  const [xi, yi, zi] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const [xf, yf, zf] = [x - xi, y - yi, z - zi];
  const [u, v, w] = [xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf), zf * zf * (3 - 2 * zf)];
  const at = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k, s);
  const x00 = at(0, 0, 0) + (at(1, 0, 0) - at(0, 0, 0)) * u;
  const x10 = at(0, 1, 0) + (at(1, 1, 0) - at(0, 1, 0)) * u;
  const x01 = at(0, 0, 1) + (at(1, 0, 1) - at(0, 0, 1)) * u;
  const x11 = at(0, 1, 1) + (at(1, 1, 1) - at(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
// From -1 to 1, `octaves` of it each twice as fine and half as strong
export function fbm(x: number, y: number, z: number, s: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * (noise3(x, y, z, s + o * 17) * 2 - 1);
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}
// Sharp crests where the noise crosses its middle (mountain ranges, ridges): from 0 to 1
function ridged(x: number, y: number, z: number, s: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise3(x, y, z, s + o * 29) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    x *= 2.1;
    y *= 2.1;
    z *= 2.1;
    amp *= 0.5;
  }
  return sum / norm;
}
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
const hashText = (text: string) => Array.from(text).reduce((n, ch) => (Math.imul(n, 31) + ch.charCodeAt(0)) | 0, 7) >>> 0;

// ---- The land of a planet: height (-1 the deepest sea .. 1 the highest peak; 0 is the sea's level) and colour at a point of the unit
// sphere, by biome. One recipe per biome: how much is sea, how rough the land, mountain ranges, volcanoes, canyons, ice at the poles.
interface Recipe { sea: number; mountains: number; volcanoes: number; canyons: number; ice: number; craters: number; bands?: boolean; city?: boolean; lava?: boolean; colors: Record<string, string> }
const RECIPES: Record<string, Recipe> = {
  temperate: { sea: 0.05, mountains: 0.7, volcanoes: 1, canyons: 0, ice: 0.82, craters: 0, colors: { deep: "#1d4f8a", shallow: "#3d86b8", beach: "#cdbb8a", low: "#4f8a3f", high: "#6f7f4a", rock: "#7a7468", snow: "#f2f5f8" } },
  forest: { sea: 0, mountains: 0.75, volcanoes: 0, canyons: 0, ice: 0.8, craters: 0, colors: { deep: "#1b4a7c", shallow: "#356f9a", beach: "#a8a070", low: "#2f5e2e", high: "#3f6b34", rock: "#6c665c", snow: "#eef2f5" } },
  jungle: { sea: 0.05, mountains: 0.6, volcanoes: 2, canyons: 0.3, ice: 2, craters: 0, colors: { deep: "#16506e", shallow: "#2f8a8a", beach: "#b9a874", low: "#2a7a33", high: "#3a8a3a", rock: "#5e6a4c", snow: "#e6efe6" } },
  swamp: { sea: 0.12, mountains: 0.2, volcanoes: 0, canyons: 0, ice: 2, craters: 0, colors: { deep: "#2f4a3c", shallow: "#4a6a4a", beach: "#6a6a48", low: "#4b5e38", high: "#5a6640", rock: "#5e5a4a", snow: "#dfe4dc" } },
  ocean: { sea: 0.42, mountains: 0.5, volcanoes: 2, canyons: 0, ice: 0.86, craters: 0, colors: { deep: "#123f78", shallow: "#2f8ac0", beach: "#e0d0a0", low: "#4d8a52", high: "#5f7a4a", rock: "#6f6a60", snow: "#f2f6f8" } },
  desert: { sea: -0.6, mountains: 0.6, volcanoes: 0, canyons: 1, ice: 2, craters: 0, colors: { deep: "#8a6a44", shallow: "#a8844f", beach: "#d9b87a", low: "#d4ad6c", high: "#c4945a", rock: "#9a7550", snow: "#efe2c8" } },
  ice: { sea: 0.1, mountains: 0.8, volcanoes: 0, canyons: 0.4, ice: -1, craters: 0, colors: { deep: "#9fc2dc", shallow: "#c8dfee", beach: "#e6eef4", low: "#e9f0f5", high: "#d8e4ec", rock: "#8a96a2", snow: "#ffffff" } },
  volcanic: { sea: 0.32, mountains: 0.9, volcanoes: 12, canyons: 0.4, ice: 2, craters: 0, lava: true, colors: { deep: "#ff6a1a", shallow: "#ff9a3a", beach: "#3a2c26", low: "#5a4a42", high: "#4a3c36", rock: "#6e5e54", snow: "#8a7a70" } },
  urban: { sea: 0.04, mountains: 0.4, volcanoes: 0, canyons: 0, ice: 0.85, craters: 0, city: true, colors: { deep: "#1f3a5a", shallow: "#3a5a7a", beach: "#8a8a88", low: "#6a707a", high: "#7a808a", rock: "#5a6068", snow: "#e8ecf0" } },
  barren: { sea: -0.7, mountains: 0.7, volcanoes: 1, canyons: 0.7, ice: 2, craters: 1, colors: { deep: "#5a5248", shallow: "#6a6156", beach: "#8a8070", low: "#8f8573", high: "#a0957f", rock: "#6f675b", snow: "#d8d2c6" } },
  "gas giant": { sea: -1, mountains: 0, volcanoes: 0, canyons: 0, ice: 2, craters: 0, bands: true, colors: { deep: "#b8763c", shallow: "#d9a36a", beach: "#e8c99a", low: "#c98a52", high: "#f0dcb8", rock: "#a8683a", snow: "#f6ead8" } },
};
const recipeOf = (biome: string) => RECIPES[biome] ?? RECIPES.temperate;
export interface Land {
  biome: string;
  seed: number;
  recipe: Recipe;
  volcanoes: THREE.Vector3[];
  craters: [THREE.Vector3, number][];
  // The planet's axis (the ice caps are round it), tilted off the top of the globe where the map puts its places
  axis: THREE.Vector3;
  colors: Record<string, THREE.Color>;
}
export function landOf(biome: string, seed: number): Land {
  const recipe = recipeOf(biome);
  const rand = (() => {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const dir = () => new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
  const volcanoes = Array.from({ length: recipe.volcanoes }, dir);
  const craters = Array.from({ length: recipe.craters ? 26 : 0 }, () => [dir(), 0.03 + rand() * 0.12] as [THREE.Vector3, number]);
  const axis = new THREE.Vector3(0.9, 0.35, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2).normalize();
  const colors = Object.fromEntries(Object.entries(recipe.colors).map(([k, v]) => [k, new THREE.Color(v)]));
  return { biome, seed: seed % 100000, recipe, volcanoes, craters, axis, colors };
}
// The height of the land at a point of the unit sphere (0 the sea's level, about -1 to 1)
export function landHeight(land: Land, p: THREE.Vector3): number {
  const { recipe: R, seed: s } = land;
  if (R.bands) return 0;
  const [x, y, z] = [p.x, p.y, p.z];
  // Continents, their coasts broken by finer noise
  let h = fbm(x * 1.6, y * 1.6, z * 1.6, s, 5) * 0.9 - R.sea;
  const landness = smooth(-0.05, 0.25, h);
  // Mountain ranges along the crests of a ridged noise, on land
  h += ridged(x * 3.2 + 7, y * 3.2, z * 3.2, s + 3) ** 2 * R.mountains * (0.35 + 0.65 * landness) * smooth(0.3, 0.7, noise3(x * 1.4, y * 1.4, z * 1.4, s + 9));
  // Canyons cut in a winding line
  if (R.canyons) h -= Math.pow(Math.max(0, 1 - Math.abs(fbm(x * 2.4, y * 2.4, z * 2.4, s + 21, 3)) * 7), 3) * 0.35 * R.canyons;
  // Volcanoes: a cone with a crater
  for (const v of land.volcanoes) {
    const d = p.distanceTo(v);
    if (d < 0.16) {
      const cone = 1 - d / 0.16;
      h = Math.max(h, 0.15) + cone * cone * 0.75 - (d < 0.025 ? (1 - d / 0.025) * 0.3 : 0);
    }
  }
  // Craters with a raised rim
  for (const [c, r] of land.craters) {
    const d = p.distanceTo(c) / r;
    if (d < 1.3) h += d < 1 ? -0.25 * (1 - d * d) : 0.1 * (1 - (d - 1) / 0.3);
  }
  return h;
}
// The colour of the land at a point, by its height and where it is
export function landColor(land: Land, p: THREE.Vector3, h: number): THREE.Color {
  const { recipe: R, colors: C, seed: s } = land;
  const fine = noise3(p.x * 40, p.y * 40, p.z * 40, s + 5) - 0.5;
  if (R.bands) {
    // A gas giant: bands along its axis, wavy, with a storm or two
    const lat = p.dot(land.axis);
    const band = Math.sin(lat * 18 + fbm(p.x * 3, p.y * 3, p.z * 3, s, 4) * 2.2);
    const c = mix(C.low, C.high, band * 0.5 + 0.5);
    return mix(c, C.rock, smooth(0.55, 0.9, noise3(p.x * 6, p.y * 6, p.z * 6, s + 2)) * 0.4).multiplyScalar(1 + fine * 0.08);
  }
  const lat = Math.abs(p.dot(land.axis));
  let c: THREE.Color;
  if (h < 0) c = mix(C.deep, C.shallow, smooth(-0.35, 0, h));
  else if (h < 0.04) c = C.beach.clone();
  else {
    c = mix(C.low, C.high, smooth(0.05, 0.4, h + fine * 0.2));
    c = mix(c, C.rock, smooth(0.35, 0.6, h));
    c = mix(c, C.snow, smooth(0.62, 0.8, h + fine * 0.1));
  }
  // A city world's grids of streets and lights
  if (R.city && h >= 0) c = mix(c, new THREE.Color(Math.floor(p.x * 120 + p.z * 40) % 2 ? "#8c93a0" : "#5a616c"), 0.45 * smooth(0.2, 0.6, noise3(p.x * 8, p.y * 8, p.z * 8, s + 11)));
  // Ice round the poles (on an ice world, everywhere but the lowest seas)
  if (lat > R.ice + fine * 0.08) c = mix(c, C.snow, 0.85);
  // Lava in the cracks of a volcanic world, and on the volcanoes' flanks
  if (R.lava && h > 0.05 && ridged(p.x * 9, p.y * 9, p.z * 9, s + 13, 2) > 0.92) c = mix(c, new THREE.Color("#ff5a1a"), 0.8);
  return c.multiplyScalar(1 + fine * 0.12);
}

// ---- Soft round textures, drawn once: a glow (suns, lava, lights), a cloud, a puff of smoke
const TEXTURES = new Map<string, THREE.Texture>();
function canvasTexture(key: string, size: number, draw: (g: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  const have = TEXTURES.get(key);
  if (have) return have;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  TEXTURES.set(key, t);
  return t;
}
const glowTexture = () =>
  canvasTexture("glow", 128, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.22)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  });
// A cloud: overlapping soft puffs, flatter at the bottom (variant `v` of four)
const cloudTexture = (v: number) =>
  canvasTexture(`cloud${v}`, 256, (g, n) => {
    let a = 977 * (v + 1);
    const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const x = n * (0.18 + r() * 0.64);
      const y = n * (0.42 + r() * 0.2 - (Math.abs(x / n - 0.5) < 0.25 ? r() * 0.16 : 0));
      const rad = n * (0.08 + r() * 0.14);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, "rgba(255,255,255,0.55)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.25)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, n, n);
    }
    // A flat, shaded underside
    const under = g.createLinearGradient(0, n * 0.45, 0, n * 0.7);
    under.addColorStop(0, "rgba(0,0,0,0)");
    under.addColorStop(1, "rgba(0,0,0,0.16)");
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = under;
    g.fillRect(0, 0, n, n);
  });

// ---- A planet's painted map (longitude across, latitude down) for a ball in the sky or in space
const MAPS = new Map<string, THREE.Texture>();
// (`wide`: the map's width in pixels, finer for a planet that fills the view)
export function planetMap(biome: string, seed: number, moon = false, wide = 256): THREE.Texture {
  const key = `${biome}:${seed}:${moon ? 1 : 0}:${wide}`;
  const have = MAPS.get(key);
  if (have) return have;
  const [w, h] = [wide, wide / 2];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const land = landOf(moon ? "barren" : biome, seed);
  const p = new THREE.Vector3();
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2;
      p.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const height = landHeight(land, p);
      const col = landColor(land, p, height);
      if (moon) col.lerp(new THREE.Color("#b8b4ac"), 0.65);
      const k = (j * w + i) * 4;
      img.data[k] = Math.min(255, col.r * 255);
      img.data[k + 1] = Math.min(255, col.g * 255);
      img.data[k + 2] = Math.min(255, col.b * 255);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  MAPS.set(key, t);
  return t;
}

// A ball lit from one side (a sun's direction, in the ball's own frame of the scene), with the night side faint and an atmosphere's rim
const BALL_VERT = `
varying vec3 vN; varying vec2 vUv; varying vec3 vView;
void main() {
  vUv = uv;
  vN = normalize( mat3( modelMatrix ) * normal );
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vView = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BALL_FRAG = `
uniform sampler2D uMap; uniform vec3 uSun; uniform vec3 uRim; uniform float uOpacity; uniform float uNight; uniform float uDark; uniform float uGain;
varying vec3 vN; varying vec2 vUv; varying vec3 vView;
void main() {
  vec3 n = normalize( vN );
  float lit = max( dot( n, normalize( uSun ) ), 0.0 );
  vec3 col = texture2D( uMap, vUv ).rgb;
  vec3 c = col * ( uNight + lit * 1.1 ) * uGain;
  float rim = pow( 1.0 - max( dot( n, normalize( vView ) ), 0.0 ), 3.0 );
  c += uRim * rim * ( 0.25 + lit );
  // (in a day sky the dark side is the sky's own colour: only the lit side shows)
  gl_FragColor = vec4( c, uOpacity * mix( uDark, 1.0, smoothstep( 0.0, 0.3, lit ) ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function ballMaterial(map: THREE.Texture, rim: string, night = 0.04) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uSun: { value: new THREE.Vector3(1, 0.4, 0.3) }, uRim: { value: new THREE.Color(rim) }, uOpacity: { value: 1 }, uNight: { value: night }, uDark: { value: 1 }, uGain: { value: 1 } },
    vertexShader: BALL_VERT,
    fragmentShader: BALL_FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
}
const RIMS: Record<string, string> = { desert: "#f0c890", ice: "#bfe0ff", volcanic: "#ff8a5a", "gas giant": "#f0c890", barren: "#5a5048", ocean: "#7ab8ff", urban: "#9ab0d0" };
const rimOf = (biome: string) => RIMS[biome] ?? "#8ac0ff";

// A planet or moon in space or in the sky: `sun` is the direction its light comes from (world frame)
// `dark`: how much of the dark side shows (1 in space, little in a day sky)
export function PlanetBall({ biome, seed, radius, sun, moon = false, ring = false, opacity = 1, dark = 1, position, rotation }: { biome: string; seed: number; radius: number; sun: V3; moon?: boolean; ring?: boolean; opacity?: number; dark?: number; position?: V3; rotation?: V3 }) {
  const mat = useMemo(() => ballMaterial(planetMap(biome, seed, moon, radius > 1000 ? 512 : moon ? 128 : 256), moon ? "#000000" : rimOf(biome)), [biome, seed, moon, radius > 1000]);
  useEffect(() => () => mat.dispose(), [mat]);
  mat.uniforms.uSun.value.set(...sun);
  mat.uniforms.uOpacity.value = opacity;
  mat.uniforms.uDark.value = dark;
  // (a moon is brighter than its photograph: it is the night's light, and a world's moon shows a good part of its face even when it is a crescent)
  mat.uniforms.uGain.value = moon ? 2.1 : 1;
  mat.uniforms.uNight.value = moon ? 0.16 : 0.04;
  return (
    <group position={position} rotation={rotation}>
      <mesh material={mat} raycast={() => null} renderOrder={-8}>
        <sphereGeometry args={[radius, 48, 32]} />
      </mesh>
      {ring && (
        <mesh rotation={[Math.PI / 2.3, 0, 0.2]} raycast={() => null} renderOrder={-7}>
          <ringGeometry args={[radius * 1.35, radius * 2.1, 64]} />
          <meshBasicMaterial color="#e8d2aa" transparent opacity={0.5 * opacity} side={THREE.DoubleSide} depthWrite={false} fog={false} />
        </mesh>
      )}
    </group>
  );
}

// ---- The globe from orbit
// `radius` the globe's; `relief` how far the highest land stands over the sea (the same units); `places` the points of the unit sphere the
// map stands its settlements on (the land is flattened round them); `detail` the mesh's fineness
export interface Globe { land: Land; relief: number; flat: THREE.Vector3[]; height: (p: THREE.Vector3) => number }
export function globeOf(biome: string, seed: number, relief: number, places: THREE.Vector3[]): Globe {
  const land = landOf(biome, seed);
  const flat = places.map((p) => p.clone().normalize());
  const height = (p: THREE.Vector3) => {
    let h = landHeight(land, p);
    // Under a place the land is a little over the sea and level
    for (const q of flat) {
      const d = p.distanceTo(q);
      if (d < 0.14) h = h + (0.06 - h) * smooth(0.14, 0.07, d);
    }
    return h;
  };
  return { land, relief, flat, height };
}
// How high the ground stands over the globe's radius at a point (the sea stands at its level)
export const globeLift = (g: Globe, p: THREE.Vector3) => Math.max(0, g.height(p)) * g.relief;

export function PlanetGlobe({ globe, radius, detail = 64, clouds = 0.5, cloudColor = "#ffffff", position }: { globe: Globe; radius: number; detail?: number; clouds?: number; cloudColor?: string; position?: V3 }) {
  const { land } = globe;
  // The ground: an icosphere raised by the land's height, coloured by it; the sea a smooth ball at its level (lava on a volcanic world)
  const geo = useMemo(() => {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g = mergeVertices(g);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).normalize();
      const h = globe.height(p);
      const c = landColor(land, p, h);
      colors.set([c.r, c.g, c.b], i * 3);
      const r = radius + Math.max(-0.02 * globe.relief, h * globe.relief);
      pos.setXYZ(i, p.x * r, p.y * r, p.z * r);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [globe, radius, detail, land]);
  useEffect(() => () => geo.dispose(), [geo]);
  const sea = land.recipe.sea > -0.5 && !land.recipe.bands;
  const seaColor = land.colors.shallow;
  // Clouds: soft flat puffs over the ground, turning slowly
  const puffs = useMemo(() => {
    let a = land.seed * 31 + 7;
    const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    const count = Math.round(clouds * (detail > 48 ? 140 : 70));
    return Array.from({ length: count }, () => {
      const p = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      return { p, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p), size: radius * (0.06 + r() * 0.12), spin: r() * Math.PI * 2, v: Math.floor(r() * 4) };
    });
  }, [land.seed, clouds, radius, detail]);
  const cloudGroup = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (cloudGroup.current) cloudGroup.current.rotation.y += dt * 0.004;
  });
  return (
    <group position={position}>
      <mesh geometry={geo} raycast={() => null}>
        <meshLambertMaterial vertexColors />
      </mesh>
      {sea &&
        (land.recipe.lava ? (
          <mesh raycast={() => null}>
            <sphereGeometry args={[radius - 0.01 * globe.relief, 96, 64]} />
            <meshBasicMaterial color="#ff6a1a" />
          </mesh>
        ) : (
          <mesh raycast={() => null}>
            <sphereGeometry args={[radius - 0.01 * globe.relief, 96, 64]} />
            <meshStandardMaterial color={seaColor} roughness={0.25} metalness={0.1} transparent opacity={0.92} />
          </mesh>
        ))}
      {/* The volcanoes' glow and smoke */}
      {land.volcanoes.map((v, i) => {
        const top = v.clone().multiplyScalar(radius + Math.max(0, globe.height(v)) * globe.relief + 0.1);
        return (
          <group key={i} position={[top.x, top.y, top.z]}>
            <sprite scale={[globe.relief * 1.6, globe.relief * 1.6, 1]} raycast={() => null}>
              <spriteMaterial map={glowTexture()} color="#ff7a2a" blending={THREE.AdditiveBlending} depthWrite={false} />
            </sprite>
            <sprite position={[v.x * globe.relief * 0.8, v.y * globe.relief * 0.8, v.z * globe.relief * 0.8]} scale={[globe.relief * 2.2, globe.relief * 1.4, 1]} raycast={() => null}>
              <spriteMaterial map={cloudTexture(i % 4)} color="#5a504c" transparent opacity={0.55} depthWrite={false} />
            </sprite>
          </group>
        );
      })}
      <group ref={cloudGroup}>
        {puffs.map((c, i) => (
          <mesh key={i} position={c.p.clone().multiplyScalar(radius + globe.relief * 1.25).toArray() as V3} quaternion={c.q} raycast={() => null} renderOrder={2}>
            <planeGeometry args={[c.size * 2, c.size * 1.2]} />
            <meshLambertMaterial map={cloudTexture(c.v)} color={cloudColor} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---- The sky over a place on a planet's surface
// The colours of the sky by the light of day (0 night, 1 full day): the zenith and the horizon, blending through dusk
const NIGHT = { zenith: new THREE.Color("#04060c"), horizon: new THREE.Color("#0d1424") };
const DUSK = new THREE.Color("#d27a46");
export function skyColors(look: WorldLook, light: number): { zenith: THREE.Color; horizon: THREE.Color; tint: THREE.Color } {
  const twilight = light > 0 && light < 1 ? 1 - Math.abs(light - 0.5) * 2 : 0;
  const zenith = NIGHT.zenith.clone().lerp(new THREE.Color(look.zenith), light);
  const horizon = NIGHT.horizon.clone().lerp(new THREE.Color(look.horizon), light).lerp(DUSK, twilight * 0.55);
  // What the land, the clouds and the bodies far off are multiplied by: white by day, warm at dusk, a dark blue at night
  const tint = new THREE.Color("#2a3450").lerp(new THREE.Color("#ffffff"), light).lerp(new THREE.Color("#ffb88a"), twilight * 0.5);
  return { zenith, horizon, tint };
}
// The sun's direction by the hour (the same arc the map's light takes: up in the east at six, down in the west at eighteen)
export function sunDirection(hour: number): THREE.Vector3 {
  const angle = ((hour - 6) / 12) * Math.PI;
  return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.47).normalize();
}
const toDir = (az: number, el: number) => new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));

// The dome's colour in a direction: the horizon to the zenith, the haze over the far ground under the horizon, a broad glow round the sun
// (the sun's disc and its near glow are sprites). Worked out per vertex, when the light changes: a phone draws the whole sky every frame.
function domeColor(d: THREE.Vector3, sun: THREE.Vector3, c: { zenith: THREE.Color; horizon: THREE.Color; ground: THREE.Color; sun: THREE.Color }, haze: number, out: THREE.Color) {
  const up = Math.max(0, Math.min(1, d.y));
  out.copy(c.horizon).lerp(c.zenith, Math.pow(up, 0.55 - 0.25 * haze));
  out.lerp(c.ground, smooth(0, -0.08, d.y));
  const s = Math.max(0, d.dot(sun));
  return out.add(c.sun.clone().multiplyScalar(Math.pow(s, 24) * (0.18 + 0.3 * haze) + Math.pow(s, 4) * 0.08));
}

// One landform as a curtain round the horizon at its distance: columns from under the horizon up to its height, coloured from its foot
// (hazed) to its top (snow on high peaks); a volcano's crater and lava go to `glow`
function landformGeometry(f: Landform, R: number, look: WorldLook, color: THREE.Color, glow: number[][]): THREE.BufferGeometry | null {
  if (f.kind === "sea" || f.kind === "cloudsea") return null;
  const d = R * (0.55 + 0.42 * f.dist);
  const full = f.width >= Math.PI * 2 - 1e-3;
  const cols = Math.max(16, Math.round((f.width / (Math.PI * 2)) * (f.kind === "towers" ? 900 : 420)));
  const s = f.seed % 1000;
  const haze = new THREE.Color(look.hazeColor);
  const snow = new THREE.Color("#f4f7fa");
  const rock = color.clone();
  const bare = f.kind === "mountains" || f.kind === "ridges" || f.kind === "volcano";
  const stone = new THREE.Color(f.kind === "volcano" ? "#4a3c36" : "#8a8278");
  // The height at a share `t` of the way across (0..1), as an elevation in radians
  const profile = (t: number): number => {
    const env = full ? 1 : Math.pow(Math.sin(Math.PI * t), f.kind === "mesas" || f.kind === "towers" ? 0.25 : 0.7);
    const n = (k: number, o = 0) => noise3(t * k + o, s * 0.37, 0.5, s);
    switch (f.kind) {
      case "mountains":
        return f.height * env * (0.35 + 0.65 * ridged(t * 9, s * 0.1, 0.3, s, 4));
      case "ridges":
        return f.height * env * (0.4 + 0.6 * Math.abs(Math.sin(t * 23 + n(5) * 4)) * (0.6 + 0.4 * n(14)));
      case "hills":
        return f.height * env * (0.45 + 0.55 * n(6)) * (0.8 + 0.2 * n(20));
      case "dunes":
        return f.height * env * (0.5 + 0.5 * Math.sin(t * 30 + n(4) * 6)) * (0.7 + 0.3 * n(9));
      case "volcano": {
        const u = Math.abs(t - 0.5) * 2;
        const cone = Math.pow(1 - u, 1.4);
        const crater = u < 0.1 ? (0.1 - u) * 1.2 : 0;
        return f.height * (cone - crater) * (0.94 + 0.06 * n(25));
      }
      case "mesas": {
        // Flat tops with steep sides where a slow noise is over its middle
        const m = n(5);
        return f.height * env * (smooth(0.48, 0.53, m) * (0.9 + 0.1 * n(40)) + 0.08);
      }
      case "spires": {
        let h = 0.05;
        for (let k = 0; k < 5; k++) {
          const c = 0.12 + k * 0.19 + (noise3(k, s, 1, s) - 0.5) * 0.08;
          h = Math.max(h, Math.exp(-(((t - c) / 0.035) ** 2)) * (0.5 + 0.5 * noise3(k, s, 2, s)));
        }
        return f.height * env * h;
      }
      case "towers": {
        // A skyline: blocks of steps, taller to the middle
        const block = Math.floor(t * 70);
        const h = noise3(block * 1.7, s, 3, s);
        return f.height * env * (0.15 + 0.85 * h * h);
      }
      case "cliffs":
        return f.height * smooth(0, 0.12, t) * smooth(1, 0.88, t) * (0.85 + 0.15 * n(12));
      default:
        return 0;
    }
  };
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rows = 3;
  const tint = (fy: number, t: number, peak: number) => {
    // Green or sand at the foot, bare rock up the high slopes of mountains, ridges and volcanoes, snow on the tops
    const c = (bare && fy > 0.35 ? rock.clone().lerp(stone, smooth(0.35, 0.7, fy)) : rock.clone()).multiplyScalar(0.7 + 0.42 * fy + (noise3(t * 60, fy * 3, 0, s) - 0.5) * 0.14);
    if (f.snow && fy > 0.62 && peak > f.height * 0.55) c.lerp(snow, smooth(0.62, 0.8, fy));
    // Atmospheric haze: far things paler, their feet most
    c.lerp(haze, Math.min(0.75, look.haze * 0.45 + f.dist * 0.2 + (1 - fy) * 0.12));
    return c;
  };
  for (let i = 0; i <= cols; i++) {
    const t = i / cols;
    const az = f.az - f.width / 2 + f.width * t;
    const h = profile(t);
    const [cx, cz] = [Math.cos(az) * d, Math.sin(az) * d];
    for (let r = 0; r < rows; r++) {
      const fy = r / (rows - 1);
      const y = -d * 0.04 + (Math.tan(h) * d + d * 0.04) * fy;
      pos.push(cx, y, cz);
      const c = tint(fy, t, h);
      col.push(c.r, c.g, c.b);
    }
    if (i < cols) {
      for (let r = 0; r < rows - 1; r++) {
        const a = i * rows + r;
        const b = (i + 1) * rows + r;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    // A city's lit windows, for the night
    if (f.kind === "towers" && i % 3 === 0 && noise3(i, s, 7, s) > 0.45) glow.push([cx * 0.999, Math.tan(h) * d * (0.2 + 0.6 * noise3(i, s, 8, s)), cz * 0.999, d * 0.004, 0]);
  }
  if (f.kind === "volcano") {
    const top = Math.tan(f.height * 0.88) * d;
    glow.push([Math.cos(f.az) * d * 0.995, top, Math.sin(f.az) * d * 0.995, d * f.width * 0.08, f.active ? 1 : 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export interface SkyProps {
  look: WorldLook;
  // The light of day (shared/logic daylight: 0 night, 1 day) and the hour (for the sun's and moons' places)
  light: number;
  hour: number;
  // How far off the horizon is (the scene's units; under the camera's far plane), the ground's height under it, and whether it follows the camera
  radius?: number;
  ground?: number;
  lite?: boolean;
  // Draw the far ground under the horizon (off when the scene has ground that reaches it, as the race's under its fog)
  floor?: boolean;
  // Draw the landforms on the horizon (off in space)
  land?: boolean;
  // Fog over the scene's own ground, from `fog[0]` to `fog[1]` off (scene units), in the haze of the horizon: the ground fades into the far land
  fog?: [number, number];
  // The hour as it is this instant (a fraction: the clock's minute and how far through it we are), read each frame, so that the suns and moons
  // sweep across the sky and do not step from place to place with the clock's ticks; without it they stand where `hour` puts them
  now?: () => number;
  // The clock's minutes as it is this instant (not wrapped to the day), for the moons' phases: each is where its phase puts it, opposite the sun
  // when full and beside it when new (shared/logic moonElongation); without it the moons stand where `hour` puts them on the first day
  clock?: () => number;
}
// Where a moon is on the sky: on the sun's own arc, turned on from it by its elongation, a little off it by its own height
const moonDir = (b: SkyBody, minutes: number): THREE.Vector3 => {
  const d = sunDirection(hourOf(minutes) + (24 * moonElongation(minutes, b)) / (Math.PI * 2));
  d.y += (b.el - 0.4) * 0.25;
  return d.normalize();
};
// A moon is drawn this many times larger than its size says (the user, 2026-10-28: "the moon is not big or bright enough")
const MOON_SCALE = 2.6;
// A sky that stays round the camera: everything in it is far off, so it moves with the camera across the ground (not up and down)
export function WorldSky({ look, light, hour, radius = 650, ground = 0, lite = false, floor = true, land = true, fog, now, clock }: SkyProps) {
  const group = useRef<THREE.Group>(null);
  const sunRefs = useRef<(THREE.Group | null)[]>([]);
  const moonRefs = useRef<(THREE.Group | null)[]>([]);
  const camera = useThree((s) => s.camera);
  const R = radius;
  const colors = skyColors(look, light);
  const sun = sunDirection(hour);
  const night = 1 - Math.min(1, light * 1.6);
  const firstSun = new THREE.Color(look.suns[0]?.color ?? "#fff4c8");

  // The dome, its colours per vertex (enough of them for the sun's glow), set again when the light or the sun moves
  const dome = useMemo(() => {
    const g = new THREE.SphereGeometry(R, 48, 24);
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, [R]);
  useEffect(() => () => dome.dispose(), [dome]);
  const groundColor = colors.horizon.clone().lerp(new THREE.Color(look.land).multiply(colors.tint), 0.3);
  const shade = `${look.seed}:${light.toFixed(3)}:${hour.toFixed(2)}`;
  useEffect(() => {
    const pos = dome.attributes.position as THREE.BufferAttribute;
    const col = dome.attributes.color as THREE.BufferAttribute;
    const c = { zenith: colors.zenith, horizon: colors.horizon, ground: groundColor, sun: firstSun.clone().multiplyScalar(sun.y > -0.05 ? Math.min(1, 0.4 + light) : 0) };
    const d = new THREE.Vector3();
    const out = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      domeColor(d, sun, c, look.haze, out);
      col.setXYZ(i, out.r, out.g, out.b);
    }
    col.needsUpdate = true;
  }, [dome, shade]);
  // The fog is the scene's (set here and taken off when the sky goes)
  const scene = useThree((st) => st.scene);
  const haze = useMemo(() => new THREE.Fog("#000000", 1, 2), []);
  useEffect(() => {
    if (!fog) return;
    const before = scene.fog;
    scene.fog = haze;
    return () => {
      scene.fog = before;
    };
  }, [scene, haze, !!fog]);
  haze.color.copy(groundColor);
  if (fog) [haze.near, haze.far] = fog;

  // The landforms, in one mesh, and the glows they carry (volcanoes, city lights)
  const { landGeo, glows } = useMemo(() => {
    const glow: number[][] = [];
    const parts = land ? look.landforms.map((f) => landformGeometry(f, R, look, new THREE.Color(f.kind === "towers" ? "#6a7280" : look.land).lerp(new THREE.Color(f.kind === "volcano" ? "#3a302c" : f.kind === "mesas" ? "#b0703a" : look.land), 0.5), glow)).filter((g): g is THREE.BufferGeometry => !!g) : [];
    let merged: THREE.BufferGeometry | null = null;
    if (parts.length) {
      // (merged by hand: the parts are indexed and share the same attributes)
      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      for (const p of parts) {
        const base = pos.length / 3;
        pos.push(...(p.attributes.position.array as Float32Array));
        col.push(...(p.attributes.color.array as Float32Array));
        for (const i of Array.from(p.index!.array)) idx.push(i + base);
        p.dispose();
      }
      merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      merged.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      merged.setIndex(idx);
    }
    return { landGeo: merged, glows: glow };
  }, [look, R, land]);
  useEffect(() => () => landGeo?.dispose(), [landGeo]);

  // Clouds round the sky: more of them the cloudier it is, low and far ones flatter
  const clouds = useMemo(() => {
    let a = look.seed * 13 + 1;
    const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    // (few and not too big: each is drawn over the sky behind it, and a phone pays for every pixel twice)
    const count = Math.round(look.clouds * (lite ? 10 : 24)) + (look.clouds > 0.05 ? 2 : 0);
    return Array.from({ length: count }, () => {
      const el = 0.03 + Math.pow(r(), 1.6) * 0.5;
      const az = r() * Math.PI * 2;
      const dist = R * (0.7 + r() * 0.22);
      const w = dist * (0.1 + r() * 0.14) * (1 + look.clouds * 0.5);
      return { p: toDir(az, el).multiplyScalar(dist), w, h: w * (0.32 + r() * 0.2), v: Math.floor(r() * 4), shade: 0.85 + r() * 0.15 };
    });
  }, [look.seed, look.clouds, R, lite]);
  const cloudSpin = useRef<THREE.Group>(null);
  const stars = useMemo(() => {
    let a = 4242;
    const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    const n = lite ? 500 : 1200;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = toDir(r() * Math.PI * 2, Math.asin(r() * 0.98 + 0.02)).multiplyScalar(R * 0.98);
      p.set([d.x, d.y, d.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [R, lite]);
  useEffect(() => () => stars.dispose(), [stars]);
  const smoke = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    if (group.current) group.current.position.set(camera.position.x, ground, camera.position.z);
    // The suns and moons at this instant's hour
    if (now) {
      const h = now();
      const base = sunDirection(h);
      look.suns.forEach((s, i) => {
        const g = sunRefs.current[i];
        if (!g) return;
        const d = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.az).add(new THREE.Vector3(0, s.el, 0)).normalize().multiplyScalar(R * 0.98);
        g.position.set(d.x, d.y, d.z);
        g.visible = d.y >= -R * 0.05;
      });
      const turn = ((h % 24) / 24) * Math.PI * 2;
      [...look.planets, ...look.moons].forEach((b, i) => {
        const g = moonRefs.current[i];
        if (!g) return;
        const d = (b.kind === "moon" && clock ? moonDir(b, clock()) : toDir(b.az + turn * b.drift, b.el)).multiplyScalar(R * 0.98);
        g.position.set(d.x, d.y, d.z);
      });
    }
    if (cloudSpin.current) cloudSpin.current.rotation.y += dt * 0.0035;
    if (smoke.current) {
      const t = state.clock.elapsedTime;
      smoke.current.children.forEach((c, i) => {
        const k = ((t * 0.04 + i * 0.137) % 1 + 1) % 1;
        const base = c.userData.base as V3 | undefined;
        if (!base) return;
        c.position.set(base[0] + k * c.userData.drift, base[1] + k * c.userData.rise, base[2]);
        c.scale.setScalar(c.userData.size * (0.6 + k * 1.6));
        ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.55 * Math.sin(Math.PI * k);
      });
    }
  });

  const day = (hour % 24) / 24;
  const body = (b: SkyBody) => (b.kind === "moon" && clock ? moonDir(b, clock()) : toDir(b.az + day * Math.PI * 2 * b.drift, b.el));
  const bodyOpacity = 0.45 + 0.55 * night;
  return (
    <group ref={group}>
      <mesh geometry={dome} renderOrder={-10} raycast={() => null}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>
      {night > 0.05 && (
        <points geometry={stars} renderOrder={-9} raycast={() => null}>
          <pointsMaterial size={1.6} sizeAttenuation={false} color="#ffffff" transparent opacity={night * 0.9} depthWrite={false} fog={false} />
        </points>
      )}
      {/* The suns, up by day */}
      {look.suns.map((s, i) => {
        const d = sun.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.az).add(new THREE.Vector3(0, s.el, 0)).normalize().multiplyScalar(R * 0.98);
        const size = R * 0.98 * s.size;
        return (
          <group key={`sun${i}`} ref={(g) => { sunRefs.current[i] = g; }} position={[d.x, d.y, d.z]} visible={d.y >= -R * 0.05}>
            <sprite scale={[size * 7, size * 7, 1]} renderOrder={-8} raycast={() => null}>
              <spriteMaterial map={glowTexture()} color={s.color} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
            </sprite>
            <sprite scale={[size * 2.4, size * 2.4, 1]} renderOrder={-8} raycast={() => null}>
              <spriteMaterial map={glowTexture()} color="#ffffff" depthWrite={false} fog={false} />
            </sprite>
          </group>
        );
      })}
      {/* The moons and the system's other worlds, lit by the sun (a moon shows its phase), faint by day */}
      {[...look.planets, ...look.moons].map((b, i) => {
        const d = body(b).multiplyScalar(R * 0.98);
        return (
          <group key={`b${i}`} ref={(g) => { moonRefs.current[i] = g; }} position={[d.x, d.y, d.z]}>
            <PlanetBall biome={b.biome ?? "barren"} seed={hashText(`${b.kind}${b.color}${b.biome ?? ""}`) + i} moon={b.kind === "moon"} ring={b.ring} radius={R * 0.98 * b.size * (b.kind === "moon" ? MOON_SCALE : 1)} sun={[sun.x, sun.y, sun.z]} opacity={b.size > 0.1 ? 0.7 + 0.3 * night : bodyOpacity} dark={0.08 + 0.9 * night} position={[0, 0, 0]} />
          </group>
        );
      })}
      <group ref={cloudSpin}>
        {clouds.map((c, i) => (
          <sprite key={i} position={[c.p.x, c.p.y, c.p.z]} scale={[c.w, c.h, 1]} renderOrder={-6} raycast={() => null}>
            <spriteMaterial map={cloudTexture(c.v)} color={new THREE.Color(look.cloudColor).multiply(colors.tint).multiplyScalar(c.shade)} transparent opacity={0.92} depthWrite={false} fog={false} />
          </sprite>
        ))}
      </group>
      {landGeo && (
        <mesh geometry={landGeo} renderOrder={-5} raycast={() => null}>
          <meshBasicMaterial vertexColors color={colors.tint} fog={false} />
        </mesh>
      )}
      {/* Lava in the craters (always lit) and the lights of a city's towers (at night) */}
      {glows.map(([x, y, z, size, active], i) =>
        active || night > 0.3 ? (
          <sprite key={`g${i}`} position={[x, y, z]} scale={[size * (active ? 3 : 1.5), size * (active ? 2 : 1.5), 1]} renderOrder={-4} raycast={() => null}>
            <spriteMaterial map={glowTexture()} color={active ? "#ff6a1a" : "#ffd98a"} transparent opacity={active ? 0.9 : night} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
          </sprite>
        ) : null,
      )}
      {/* Smoke over the active volcanoes */}
      <group ref={smoke}>
        {glows.filter((g) => g[4]).flatMap(([x, y, z, size], i) =>
          [0, 1, 2, 3].map((k) => (
            <sprite key={`s${i}-${k}`} userData={{ base: [x, y + size, z] as V3, rise: size * 14, drift: size * 6, size: size * 5 }} renderOrder={-3} raycast={() => null}>
              <spriteMaterial map={cloudTexture(k)} color={new THREE.Color("#4a403c").multiply(colors.tint)} transparent opacity={0.4} depthWrite={false} fog={false} />
            </sprite>
          )),
        )}
      </group>
      {/* The far ground out to the horizon (a sea's water on an ocean world, a deck of cloud on a gas giant) */}
      {floor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} renderOrder={-7} raycast={() => null}>
          <circleGeometry args={[R * 0.985, 64]} />
          <meshBasicMaterial color={look.landforms[0]?.kind === "sea" ? new THREE.Color("#2f6f9a").multiply(colors.tint).lerp(colors.horizon, 0.35) : look.landforms[0]?.kind === "cloudsea" ? new THREE.Color(look.cloudColor).multiply(colors.tint) : groundColor} fog={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export { hashText };
