// The surfaces of the big ships and the station (2026-10-24, asked by the user: normal maps, enhanced textures and parallax for the larger
// ships). The maps are drawn here, in code, so nothing is downloaded and they are the same for everyone: a panelled hull of plates,
// grooves, rivets, hatches, vents and raised blocks, in four maps that tile.
//   color    the plates' paint, weathered, with accent panels, hazard stripes and scorch, darkened in the grooves
//   height   how high each plate stands (the grooves are low); lit by the normal map and shifted by the parallax
//   normal   the slope of the height, so that light catches every edge
//   light    the windows and strip lights that shine on the night side (the emissive map)
// A hull's material is a standard material whose fragment shader is patched (`parallaxHull`): a tangent-space parallax occlusion march
// through the height map, found from the screen-space derivatives (the baked geometry carries no tangents), so that the plates' edges
// and the vents' depth shift as the camera moves. The same march moves the color, normal and light maps, so they stay together.
// Like the other surface modules this one is browser-only: in a test there is no document and the maps stay flat.
import * as THREE from "three";

export type Livery = "imperial" | "republic" | "pirate" | "station" | "tunnel";
interface LiverySpec {
  base: [number, number, number];
  accent: [number, number, number];
  light: [number, number, number];
  hazard: boolean;
  // How much of the hull is windows
  windows: number;
}
const LIVERIES: Record<Livery, LiverySpec> = {
  imperial: { base: [128, 134, 142], accent: [64, 70, 80], light: [196, 224, 255], hazard: false, windows: 0.16 },
  republic: { base: [206, 206, 200], accent: [168, 52, 46], light: [255, 238, 184], hazard: true, windows: 0.12 },
  pirate: { base: [124, 108, 92], accent: [196, 112, 42], light: [255, 190, 110], hazard: true, windows: 0.07 },
  station: { base: [94, 102, 114], accent: [150, 162, 176], light: [200, 228, 255], hazard: true, windows: 0.2 },
  tunnel: { base: [70, 78, 92], accent: [40, 190, 200], light: [150, 240, 255], hazard: true, windows: 0.04 },
};

export interface HullMaps {
  color: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  light: THREE.Texture;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rect { x: number; y: number; w: number; h: number }
// The plates: the square is cut in two again and again, along the longer side, into plates of 40 to 200 pixels
function plates(size: number, rnd: () => number): Rect[] {
  const out: Rect[] = [];
  const min = size / 22;
  const max = size / 5;
  const cut = (r: Rect) => {
    const tooBig = r.w > max || r.h > max;
    const canW = r.w >= min * 2;
    const canH = r.h >= min * 2;
    if ((!canW && !canH) || (!tooBig && rnd() < 0.2)) {
      out.push(r);
      return;
    }
    const alongX = canW && (!canH || r.w > r.h * (0.8 + rnd() * 0.4));
    const len = alongX ? r.w : r.h;
    const at = Math.round((min + rnd() * (len - 2 * min)) / 4) * 4;
    const k = Math.max(min, Math.min(len - min, at));
    if (alongX) {
      cut({ x: r.x, y: r.y, w: k, h: r.h });
      cut({ x: r.x + k, y: r.y, w: r.w - k, h: r.h });
    } else {
      cut({ x: r.x, y: r.y, w: r.w, h: k });
      cut({ x: r.x, y: r.y + k, w: r.w, h: r.h - k });
    }
  };
  cut({ x: 0, y: 0, w: size, h: size });
  return out;
}

const gray = (v: number) => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${c},${c},${c})`;
};

// Draws the four maps for a livery at a resolution and seed
export function drawHullMaps(livery: Livery, size: number, seed: number): { color: HTMLCanvasElement; height: HTMLCanvasElement; normal: HTMLCanvasElement; light: HTMLCanvasElement } {
  const L = LIVERIES[livery];
  const rnd = mulberry(seed * 2654435761);
  const make = () => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  };
  const height = make();
  const color = make();
  const light = make();
  const normal = make();
  const H = height.getContext("2d")!;
  const C = color.getContext("2d")!;
  const G = light.getContext("2d")!;
  H.fillStyle = gray(0.5);
  H.fillRect(0, 0, size, size);
  C.fillStyle = `rgb(${L.base.join(",")})`;
  C.fillRect(0, 0, size, size);
  G.fillStyle = "#000";
  G.fillRect(0, 0, size, size);
  const k = size / 1024;
  const panels = plates(size, rnd);
  const tint = (amount: number, rgb = L.base) => `rgb(${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * amount)))).join(",")})`;

  for (const p of panels) {
    const level = 0.5 + (rnd() - 0.5) * 0.14;
    const inset = Math.max(2, Math.round(3 * k));
    // The plate: stands at its own height inside a groove
    H.fillStyle = gray(level);
    H.fillRect(p.x + inset, p.y + inset, p.w - inset * 2, p.h - inset * 2);
    H.fillStyle = gray(0.2);
    H.fillRect(p.x, p.y, p.w, inset);
    H.fillRect(p.x, p.y, inset, p.h);
    // The light edge on the plate's top and left
    H.fillStyle = gray(level + 0.14);
    H.fillRect(p.x + inset, p.y + inset, p.w - inset * 2, Math.max(1, k));
    H.fillRect(p.x + inset, p.y + inset, Math.max(1, k), p.h - inset * 2);
    // Paint: each plate a little different; now and then an accent plate or a dark one
    const roll = rnd();
    const paint = roll < 0.07 ? tint(0.95, L.accent) : roll < 0.13 ? tint(0.7) : tint(0.9 + rnd() * 0.2);
    C.fillStyle = paint;
    C.fillRect(p.x, p.y, p.w, p.h);

    const feature = rnd();
    const ix = p.x + 10 * k;
    const iy = p.y + 10 * k;
    const iw = p.w - 20 * k;
    const ih = p.h - 20 * k;
    if (iw < 12 || ih < 12) continue;
    if (feature < 0.22) {
      // A raised block with its own groove
      const bx = ix + rnd() * iw * 0.3;
      const by = iy + rnd() * ih * 0.3;
      const bw = iw * (0.4 + rnd() * 0.5);
      const bh = ih * (0.4 + rnd() * 0.5);
      H.fillStyle = gray(0.25);
      H.fillRect(bx - 2 * k, by - 2 * k, bw + 4 * k, bh + 4 * k);
      H.fillStyle = gray(0.72 + rnd() * 0.12);
      H.fillRect(bx, by, bw, bh);
      C.fillStyle = tint(0.8 + rnd() * 0.3);
      C.fillRect(bx, by, bw, bh);
    } else if (feature < 0.36) {
      // Slats
      const step = Math.max(4, Math.round(7 * k));
      for (let y = iy; y < iy + ih; y += step) {
        H.fillStyle = gray(0.3);
        H.fillRect(ix, y, iw, step / 2);
        C.fillStyle = tint(0.55);
        C.fillRect(ix, y, iw, step / 2);
      }
    } else if (feature < 0.47) {
      // A vent, with weathering below it
      const r = Math.min(iw, ih) * (0.18 + rnd() * 0.18);
      const cx = ix + iw / 2;
      const cy = iy + ih / 2;
      H.fillStyle = gray(0.14);
      H.beginPath();
      H.arc(cx, cy, r, 0, Math.PI * 2);
      H.fill();
      H.strokeStyle = gray(0.82);
      H.lineWidth = Math.max(2, 3 * k);
      H.beginPath();
      H.arc(cx, cy, r + 3 * k, 0, Math.PI * 2);
      H.stroke();
      C.fillStyle = "rgba(0,0,0,0.55)";
      C.beginPath();
      C.arc(cx, cy, r, 0, Math.PI * 2);
      C.fill();
      const streak = C.createLinearGradient(0, cy, 0, Math.min(p.y + p.h, cy + r * 5));
      streak.addColorStop(0, "rgba(0,0,0,0.3)");
      streak.addColorStop(1, "rgba(0,0,0,0)");
      C.fillStyle = streak;
      C.fillRect(cx - r * 0.6, cy, r * 1.2, r * 5);
    } else if (feature < 0.57) {
      // Rivets along the plate's edge
      const gap = Math.max(6, Math.round(13 * k));
      H.fillStyle = gray(0.85);
      C.fillStyle = tint(1.25);
      for (let x = p.x + 8 * k; x < p.x + p.w - 6 * k; x += gap) {
        for (const y of [p.y + 7 * k, p.y + p.h - 7 * k]) {
          H.fillRect(x, y, Math.max(2, 2.4 * k), Math.max(2, 2.4 * k));
          C.fillRect(x, y, Math.max(1, 1.6 * k), Math.max(1, 1.6 * k));
        }
      }
    } else if (feature < 0.64) {
      // A hatch
      const hw = Math.min(iw, ih) * 0.6;
      const hx = ix + (iw - hw) / 2;
      const hy = iy + (ih - hw) / 2;
      H.fillStyle = gray(0.3);
      H.fillRect(hx - 3 * k, hy - 3 * k, hw + 6 * k, hw + 6 * k);
      H.fillStyle = gray(0.64);
      H.fillRect(hx, hy, hw, hw);
      H.fillStyle = gray(0.4);
      H.fillRect(hx + hw * 0.4, hy + hw * 0.4, hw * 0.2, hw * 0.2);
      C.fillStyle = tint(0.65);
      C.fillRect(hx, hy, hw, hw);
    } else if (L.hazard && feature < 0.68) {
      // Hazard stripes
      C.save();
      C.beginPath();
      C.rect(ix, iy, iw, ih * 0.3);
      C.clip();
      C.fillStyle = "#d8b21c";
      C.fillRect(ix, iy, iw, ih * 0.3);
      C.fillStyle = "#1c1c1c";
      for (let x = ix - ih; x < ix + iw + ih; x += 16 * k) {
        C.beginPath();
        C.moveTo(x, iy);
        C.lineTo(x + 8 * k, iy);
        C.lineTo(x + 8 * k - ih * 0.3, iy + ih * 0.3);
        C.lineTo(x - ih * 0.3, iy + ih * 0.3);
        C.fill();
      }
      C.restore();
    }
    // Windows
    if (rnd() < L.windows * 1.6 && p.w > 50 * k && p.h > 50 * k) {
      const pitchX = Math.max(5, Math.round(8 * k));
      const pitchY = Math.max(5, Math.round(7 * k));
      const warm = rnd() < 0.5 ? 1 : 0.8;
      for (let y = iy + 4 * k; y < iy + ih - 4 * k; y += pitchY) {
        for (let x = ix + 4 * k; x < ix + iw - 4 * k; x += pitchX) {
          if (rnd() < 0.3) continue;
          const b = (0.6 + rnd() * 0.4) * warm;
          G.fillStyle = `rgb(${L.light.map((v) => Math.round(v * b)).join(",")})`;
          G.fillRect(x, y, Math.max(2, 3.4 * k), Math.max(1, 2.2 * k));
        }
      }
    } else if (rnd() < 0.05) {
      // A strip light along the plate
      G.fillStyle = `rgb(${L.accent.map((v) => Math.round(v * 0.9)).join(",")})`;
      G.fillRect(p.x + 6 * k, p.y + p.h / 2, p.w - 12 * k, Math.max(2, 2.5 * k));
    }
  }
  // Greebles: small blocks scattered over the plates
  for (let i = 0; i < 160 * k * k + 60; i++) {
    const w = (4 + rnd() * 14) * k;
    const h = (3 + rnd() * 10) * k;
    const x = rnd() * size;
    const y = rnd() * size;
    H.fillStyle = gray(0.62 + rnd() * 0.22);
    H.fillRect(x, y, w, h);
    C.fillStyle = tint(0.75 + rnd() * 0.4);
    C.fillRect(x, y, w, h);
  }
  // Scratches and scorch in the paint
  C.globalAlpha = 0.18;
  for (let i = 0; i < 90; i++) {
    C.strokeStyle = rnd() < 0.5 ? "#000" : "#fff";
    C.lineWidth = Math.max(1, rnd() * 1.6 * k);
    C.beginPath();
    const x = rnd() * size;
    const y = rnd() * size;
    C.moveTo(x, y);
    C.lineTo(x + (rnd() - 0.5) * 60 * k, y + (rnd() - 0.5) * 12 * k);
    C.stroke();
  }
  C.globalAlpha = 1;
  // The grooves are dark in the paint too (ambient occlusion from the height), and the normal map is the height's slope
  const hd = H.getImageData(0, 0, size, size).data;
  const cd = C.getImageData(0, 0, size, size);
  const nd = normal.getContext("2d")!.createImageData(size, size);
  const at = (x: number, y: number) => hd[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  const strength = 2.6 * (size / 1024) + 1.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const h0 = hd[i] / 255;
      const ao = 0.55 + 0.45 * Math.min(1, h0 * 1.7);
      cd.data[i] = cd.data[i] * ao;
      cd.data[i + 1] = cd.data[i + 1] * ao;
      cd.data[i + 2] = cd.data[i + 2] * ao;
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(nx, ny, 1);
      nd.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      nd.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      nd.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nd.data[i + 3] = 255;
    }
  }
  C.putImageData(cd, 0, 0);
  normal.getContext("2d")!.putImageData(nd, 0, 0);
  return { color, height, normal, light };
}

const MAPS = new Map<string, HullMaps>();
function textureOf(canvas: HTMLCanvasElement, colour: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// The maps of a livery, drawn once per page (`size` 1024, or 512 on a phone)
export function hullMaps(livery: Livery, size = 1024, seed = 7): HullMaps {
  const key = `${livery}:${size}:${seed}`;
  const have = MAPS.get(key);
  if (have) return have;
  const c = drawHullMaps(livery, size, seed);
  const maps: HullMaps = { color: textureOf(c.color, true), height: textureOf(c.height, false), normal: textureOf(c.normal, false), light: textureOf(c.light, true) };
  MAPS.set(key, maps);
  return maps;
}

// ---- The parallax: a tangent-space march through the height map, patched into a standard material
export interface HullMaterialOptions {
  livery: Livery;
  // How far the height map moves the texture, as a share of one tile (0.03 reads as plates standing a metre proud on a 40 m tile)
  parallax?: number;
  steps?: number;
  emissive?: number;
  metalness?: number;
  roughness?: number;
  side?: THREE.Side;
  size?: number;
  seed?: number;
}
const MATERIALS = new Map<string, THREE.MeshStandardMaterial>();
export function hullMaterial(o: HullMaterialOptions): THREE.MeshStandardMaterial {
  const size = o.size ?? 1024;
  const key = [o.livery, size, o.seed ?? 7, o.parallax ?? 0.03, o.steps ?? 10, o.emissive ?? 1.2, o.metalness ?? 0.35, o.roughness ?? 0.55, o.side ?? 0].join("|");
  const have = MATERIALS.get(key);
  if (have) return have;
  const maps = hullMaps(o.livery, size, o.seed ?? 7);
  const m = new THREE.MeshStandardMaterial({
    map: maps.color,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    emissiveMap: maps.light,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: o.emissive ?? 1.2,
    metalness: o.metalness ?? 0.35,
    roughness: o.roughness ?? 0.55,
    side: o.side ?? THREE.FrontSide,
  });
  const uniforms = { uHeight: { value: maps.height }, uParallax: { value: o.parallax ?? 0.03 }, uSteps: { value: o.steps ?? 10 } };
  m.onBeforeCompile = (shader) => parallaxHull(shader, uniforms);
  m.customProgramCacheKey = () => "hullparallax";
  m.userData.uniforms = uniforms;
  MATERIALS.set(key, m);
  return m;
}

export function parallaxHull(shader: THREE.WebGLProgramParametersWithUniforms, u: { uHeight: { value: THREE.Texture }; uParallax: { value: number }; uSteps: { value: number } }) {
  shader.uniforms.uHeight = u.uHeight;
  shader.uniforms.uParallax = u.uParallax;
  shader.uniforms.uSteps = u.uSteps;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform sampler2D uHeight;\nuniform float uParallax;\nuniform float uSteps;")
    .replace(
      "#include <map_fragment>",
      `
  // Parallax occlusion mapping in tangent space. The geometry has no tangents, so the frame is found from the derivatives of the position and
  // the texture coordinates (three's own getTangentFrame), and the surface normal from the derivatives of the position.
  vec3 pDx = dFdx( vViewPosition );
  vec3 pDy = dFdy( vViewPosition );
  vec3 pN = normalize( cross( pDx, pDy ) );
  mat3 pFrame = getTangentFrame( - vViewPosition, pN, vMapUv );
  vec3 pEye = normalize( vViewPosition );
  vec3 pView = vec3( dot( pEye, normalize( pFrame[ 0 ] ) ), dot( pEye, normalize( pFrame[ 1 ] ) ), dot( pEye, pN ) );
  float pLayers = mix( uSteps * 1.6, uSteps * 0.5, clamp( pView.z, 0.0, 1.0 ) );
  float pLayerDepth = 1.0 / pLayers;
  vec2 pDelta = ( pView.xy / max( pView.z, 0.18 ) ) * uParallax / pLayers;
  vec2 pUvDx = dFdx( vMapUv );
  vec2 pUvDy = dFdy( vMapUv );
  vec2 pUv = vMapUv;
  float pDepth = 0.0;
  float pSurface = 1.0 - textureGrad( uHeight, pUv, pUvDx, pUvDy ).r;
  vec2 pPrevUv = pUv;
  float pPrevSurface = pSurface;
  float pPrevDepth = 0.0;
  for ( int i = 0; i < 24; i ++ ) {
    if ( float( i ) >= pLayers || pDepth >= pSurface ) break;
    pPrevUv = pUv;
    pPrevSurface = pSurface;
    pPrevDepth = pDepth;
    pUv -= pDelta;
    pSurface = 1.0 - textureGrad( uHeight, pUv, pUvDx, pUvDy ).r;
    pDepth += pLayerDepth;
  }
  float pAfter = pSurface - pDepth;
  float pBefore = pPrevSurface - pPrevDepth;
  pUv = mix( pUv, pPrevUv, clamp( pAfter / ( pAfter - pBefore - 1e-5 ), 0.0, 1.0 ) );
  vec4 sampledDiffuseColor = texture2D( map, pUv );
  diffuseColor *= sampledDiffuseColor;
`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `
  vec3 mapN = texture2D( normalMap, pUv ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `
  vec4 emissiveColor = texture2D( emissiveMap, pUv );
  totalEmissiveRadiance *= emissiveColor.rgb;
`,
    );
}

// Texture coordinates by world size: each triangle is projected along the axis its normal points most along, at `1 / tile` repeats a metre
// (a box mapping; the triangles are unjoined, so a seam between faces reads as a panel line)
export function worldUV(source: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source.clone();
  geo.computeVertexNormals();
  const p = geo.attributes.position as THREE.BufferAttribute;
  const n = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  const inv = 1 / tile;
  for (let t = 0; t < p.count; t += 3) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let k = 0; k < 3; k++) {
      nx += n.getX(t + k);
      ny += n.getY(t + k);
      nz += n.getZ(t + k);
    }
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    for (let k = 0; k < 3; k++) {
      const i = t + k;
      const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
      uv[i * 2] = u * inv;
      uv[i * 2 + 1] = v * inv;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}
