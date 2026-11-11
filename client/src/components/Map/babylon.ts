// ---------------------------------------------------------------------------------------------
// Babylon.js draws the 3D map (2026-10-31; the user: "overhaul our graphics, shadows and lighting" with Babylon, every scene).
// React Three Fiber still builds each scene as a three.js scene graph, runs the frame loop and handles taps (its raycasting on the three
// objects, so picking, cameras and the e2e hooks are as they were); this module is the renderer it is given (`<Canvas gl={babylonGl}>`).
// Every frame the three scene is mirrored into a Babylon scene and Babylon draws it:
// - meshes keep their three world matrices (the Babylon scene is right-handed, so nothing is turned or flipped); geometry is shared by
//   every mesh that uses it, with its vertex colours and the extra attributes the shaders read (limb, pivot, mark);
// - materials become physically based ones (Lambert: rough; Phong: its shininess as roughness, its specular as a little metal; Basic:
//   unlit), their maps with them; instanced meshes become thin instances; points, lines, sprites and drei's text get their own;
// - lights keep their colours and strengths (an ambient light becomes a hemisphere whose ground is its sky), the sun's shadows are cascaded and follow
//   the camera, a lamp's are a cube map, and each mesh is lit by the lights nearest it.
// What three.js does in its own shader patches (onBeforeCompile) is done here as Babylon material plugins, keyed off `userData`.
// three.js stays for building geometry, for raycasting and for the tests; it never draws.
// ---------------------------------------------------------------------------------------------
import * as THREE from "three";
import { Engine } from "@babylonjs/core/Engines/engine";
import "@babylonjs/core/Engines/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { Geometry } from "@babylonjs/core/Meshes/geometry";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { RenderingGroup } from "@babylonjs/core/Rendering/renderingGroup";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { InternalTexture } from "@babylonjs/core/Materials/Textures/internalTexture";
import { Light } from "@babylonjs/core/Lights/light";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered/clusteredLightContainer";
import "@babylonjs/core/Lights/Clustered/clusteredLightingSceneComponent";
import { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import { SphericalPolynomial } from "@babylonjs/core/Maths/sphericalPolynomial";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";

// ---- The look and its tiers ---------------------------------------------------------------------------------------------------------

// The detail the device can carry (siteAssets.tsx `useQuality`: lite on a phone or when frames drop, else full); a desktop's full is drawn
// finer still (more cascades, bigger shadow maps)
export type RenderTier = "lite" | "full";
const LOOK = { tier: "full" as RenderTier };
const DESKTOP = typeof window !== "undefined" && !("ontouchstart" in window) && (navigator.maxTouchPoints ?? 0) === 0;
const RENDERERS = new Set<BabylonRenderer>();
// What the player has set in Options for each effect ("auto" is what the tier and device give); kept in the browser
export interface Effects {
  shadows: "auto" | "off" | "low" | "high";
  occlusion: "auto" | "off" | "on";
  smoothing: "auto" | "off" | "fxaa" | "msaa";
  bloom: "auto" | "off" | "on";
}
const EFFECT_KEY = "sw5e.effects";
const loadEffects = (): Effects => {
  const base: Effects = { shadows: "auto", occlusion: "auto", smoothing: "auto", bloom: "auto" };
  try {
    const saved = JSON.parse(localStorage.getItem(EFFECT_KEY) ?? "{}") as Partial<Effects>;
    for (const k of Object.keys(base) as (keyof Effects)[]) if (typeof saved[k] === "string") (base as unknown as Record<string, string>)[k] = saved[k]!;
  } catch {}
  return base;
};
export const EFFECTS: Effects = typeof window === "undefined" ? { shadows: "auto", occlusion: "auto", smoothing: "auto", bloom: "auto" } : loadEffects();
const effectListeners = new Set<() => void>();
export function setEffects(change: Partial<Effects>) {
  Object.assign(EFFECTS, change);
  try { localStorage.setItem(EFFECT_KEY, JSON.stringify(EFFECTS)); } catch {}
  for (const r of RENDERERS) r.retier();
  effectListeners.forEach((f) => f());
}
export const onEffects = (f: () => void) => { effectListeners.add(f); return () => void effectListeners.delete(f); };
export function setRenderTier(tier: RenderTier) {
  if (LOOK.tier === tier) return;
  LOOK.tier = tier;
  for (const r of RENDERERS) r.retier();
}
// A device that draws in software (SwiftShader, llvmpipe: the play-through test's browser among them) is drawn as lite whatever its tier
const SOFTWARE = { on: false };
const lite = () => LOOK.tier === "lite" || SOFTWARE.on;
// A desktop drawing on the processor's own graphics (Intel HD, UHD, Iris; not Arc) gets a phone's full look on "auto": measured
// 2026-11-01 on an HD 530, at 704×720, a street by day took 53 ms on the GPU with four 2048 cascades, 26 without them, and parallax
// occlusion and contact shadows another 5 and 3 (REVIVAL_NOTES "Where the frame goes")
const INTEGRATED = { on: false };
const BIG_GPU = () => DESKTOP && !INTEGRATED.on;
function shadowSettings() {
  if (EFFECTS.shadows === "off") return { cascades: 2, size: 1024, quality: ShadowGenerator.QUALITY_LOW, lamps: 0, lights: lite() ? 4 : 6 };
  if (EFFECTS.shadows === "low") return { cascades: 2, size: 1024, quality: ShadowGenerator.QUALITY_LOW, lamps: lite() ? 0 : 1, lights: lite() ? 4 : 6 };
  if (EFFECTS.shadows === "high") return { cascades: 4, size: 2048, quality: ShadowGenerator.QUALITY_HIGH, lamps: 2, lights: 8 };
  if (lite()) return { cascades: 2, size: 1024, quality: ShadowGenerator.QUALITY_LOW, lamps: 0, lights: 4 };
  if (!BIG_GPU()) return { cascades: 3, size: 1024, quality: ShadowGenerator.QUALITY_MEDIUM, lamps: 1, lights: 6 };
  return { cascades: 4, size: 2048, quality: ShadowGenerator.QUALITY_HIGH, lamps: 2, lights: 8 };
}
// A shader compiled once is kept for the session, used or not: Babylon frees one when its last material goes, and walking back into a
// room compiled its shaders again (frames of half a second, 2026-11-01). They are few (one for each kind of surface the game draws)
Effect.PersistentMode = true;
// Both light a white surface at 1/π of a direct light's intensity; but three puts the 1/π on its ambient and hemisphere lights too,
// and Babylon's hemisphere does not
const AMBIENT = 1 / Math.PI;

// ---- Small helpers ------------------------------------------------------------------------------------------------------------------

const c3 = (c: THREE.Color, out = new Color3()) => out.set(c.r, c.g, c.b);
// A three colour in the working (linear) space, as Babylon shows a clear colour or a line: in sRGB
const srgb = (c: THREE.Color) => {
  const s = c.clone().convertLinearToSRGB();
  return new Color3(s.r, s.g, s.b);
};
// three's triangles are counter-clockwise from the front, which a right-handed Babylon scene has to be told (else it shows their backs)
const FRONT = Material.CounterClockWiseSideOrientation;
const sameMatrix = (a: Float32Array, b: number[]) => {
  for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false;
  return true;
};
// An attribute's values as floats, de-quantised and un-interleaved
function floats(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  if (!(attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && attr.array instanceof Float32Array && !attr.normalized && attr.array.length === attr.count * attr.itemSize) return attr.array as Float32Array;
  const n = attr.count, s = attr.itemSize;
  const out = new Float32Array(n * s);
  for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) out[i * s + c] = attr.getComponent(i, c);
  return out;
}
// A three texture's wrapping, repeat and colour space on its Babylon copy
const wrapOf = (w: THREE.Wrapping) => (w === THREE.RepeatWrapping ? Texture.WRAP_ADDRESSMODE : w === THREE.MirroredRepeatWrapping ? Texture.MIRROR_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE);
function settle(tex: Texture, t: THREE.Texture) {
  tex.wrapU = wrapOf(t.wrapS);
  tex.wrapV = wrapOf(t.wrapT);
  tex.uScale = t.repeat.x;
  tex.vScale = t.repeat.y;
  tex.uOffset = t.offset.x;
  tex.vOffset = t.offset.y;
  tex.wAng = -t.rotation;
  tex.anisotropicFilteringLevel = t.anisotropy;
  tex.gammaSpace = t.colorSpace === THREE.SRGBColorSpace;
}
// A picture loaded from a file (its pixels never change); a canvas is drawn on
const fixedImage = (image: unknown) =>
  (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) || (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap);
// A short name for each shader source seen (the map compares the sources, natively)
const SOURCES = new Map<string, string>();
const sourceName = (source: string) => {
  let name = SOURCES.get(source);
  if (!name) SOURCES.set(source, (name = `src${SOURCES.size}`));
  return name;
};
const isText = (o: THREE.Object3D): o is THREE.Mesh & { text: string; fontSize: number; color: unknown; anchorX: unknown; anchorY: unknown; outlineWidth: unknown; outlineColor: unknown; maxWidth: number } =>
  (o as THREE.Mesh).isMesh && typeof (o as unknown as { text?: unknown }).text === "string" && "fontSize" in o && "anchorX" in o;

// ---- The camera: three's matrices as they are ---------------------------------------------------------------------------------------

class MirrorCamera extends Camera {
  view = Matrix.Identity();
  moved = true;
  _getViewMatrix() {
    this.moved = false;
    return this.view;
  }
  _isSynchronizedViewMatrix() {
    return !this.moved && super._isSynchronizedViewMatrix();
  }
}

// ---- Limbs (interiors/limbs.ts `limbMaterial`): every vertex turned about its limb's pivot, then about each joint it hangs from ---------

// A body's undulation (2026-11-04, the user: "a serpent like slithering animation"): the last "limb" of a pose holds a wave, not a turn: x the
// amplitude (metres; 0 for no wave), y the wave number (radians a metre), z the phase, w the z where it starts. Every vertex behind that z is
// carried to one side by a wave that grows to its full size over a wavelength and turned to follow it (a tube stays a tube as it bends); what is
// ahead of it (a serpent's head) keeps its shape and is carried and turned with the neck. A pose without the wave (the rest pose) is not touched.
export const WAVE_LIMB = 24;
export const WAVE_GLSL = `void lqWaveFrame(vec4 w, float z0, out float c, out vec3 t, out vec3 n) {
  float zc = min(z0, w.w);
  float u = w.w - zc;
  float a = w.x * (0.3 + 0.7 * clamp(u * w.y * 0.1591549, 0.0, 1.0));
  float ph = w.y * u - w.z;
  c = a * sin(ph);
  float s = -a * w.y * cos(ph);
  float il = inversesqrt(1.0 + s * s);
  t = vec3(s, 0.0, 1.0) * il;
  n = vec3(1.0, 0.0, -s) * il;
}
vec3 lqWavePoint(vec4 w, vec3 v) {
  if (w.x == 0.0) return v;
  float c; vec3 t; vec3 n;
  lqWaveFrame(w, v.z, c, t, n);
  float zc = min(v.z, w.w);
  return vec3(c, v.y, zc) + n * v.x + t * (v.z - zc);
}
vec3 lqWaveNormal(vec4 w, vec3 nr, float z0) {
  if (w.x == 0.0) return nr;
  float c; vec3 t; vec3 n;
  lqWaveFrame(w, z0, c, t, n);
  return n * nr.x + vec3(0.0, nr.y, 0.0) + t * nr.z;
}`;

// (Babylon asks a plugin for its code while the plugin is being made, before its own fields are set: the joints are passed beside it)
let JOINTS: number[] = [];
class LimbPlugin extends MaterialPluginBase {
  private q: Float32Array;
  private p: Float32Array;
  private parents: number[];
  constructor(material: Material, private source: THREE.Material, parents: number[]) {
    JOINTS = parents;
    super(material, "Limbs", 200, { LIMBS: false });
    this.parents = parents;
    this.q = source.userData.pose as Float32Array;
    this.p = new Float32Array(parents.length * 4);
    this._enable(true);
  }
  private get joints() {
    return this.parents ?? JOINTS;
  }
  prepareDefines(defines: Record<string, unknown>) {
    defines.LIMBS = true;
  }
  getClassName() {
    return "LimbPlugin";
  }
  getAttributes(attributes: string[]) {
    attributes.push("limb", "pivot");
  }
  getUniforms() {
    return { ubo: [{ name: "uQ", size: 4, type: "vec4", arraySize: this.joints.length }, { name: "uP", size: 4, type: "vec4", arraySize: this.joints.length }] };
  }
  bindForSubMesh(ubo: UniformBuffer) {
    const pivots = this.source.userData.pivots as Float32Array;
    for (let i = 0; i < this.parents.length; i++) {
      this.p[i * 4] = pivots[i * 3];
      this.p[i * 4 + 1] = pivots[i * 3 + 1];
      this.p[i * 4 + 2] = pivots[i * 3 + 2];
    }
    ubo.updateArray("uQ", this.q as unknown as number[]);
    ubo.updateArray("uP", this.p as unknown as number[]);
  }
  getCustomCode(shaderType: string) {
    if (shaderType !== "vertex") return null;
    const parents = this.joints.map((p, i) => (p >= 0 ? `if (i == ${i}) return ${p};` : "")).join(" ");
    const chain = (point: boolean, v: string) => `{ int li = int(limb + 0.5); if (li > 0) {
  ${point ? `${v} = pivot + lqTurn(uQ[li], ${v} - pivot);` : `${v} = lqTurn(uQ[li], ${v});`}
  int pa = lqParent(li);
  for (int s = 0; s < 5; s++) { if (pa < 0) break; ${point ? `${v} = uP[pa].xyz + lqTurn(uQ[pa], ${v} - uP[pa].xyz);` : `${v} = lqTurn(uQ[pa], ${v});`} pa = lqParent(pa); }
} }`;
    return {
      CUSTOM_VERTEX_DEFINITIONS: `attribute float limb;\nattribute vec3 pivot;\nvec3 lqTurn(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }\nint lqParent(int i) { ${parents} return -1; }\n${WAVE_GLSL}`,
      CUSTOM_VERTEX_UPDATE_POSITION: `${chain(true, "positionUpdated")}\npositionUpdated = lqWavePoint(uQ[${WAVE_LIMB}], positionUpdated);`,
      CUSTOM_VERTEX_UPDATE_NORMAL: `${chain(false, "normalUpdated")}\nnormalUpdated = lqWaveNormal(uQ[${WAVE_LIMB}], normalUpdated, position.z);`,
    };
  }
}

// The ground layers' fragment code (see GroundLayers). Hooks: the albedo (the vertex colour is in by then), then the normal just before the lights.
const GROUND_GLSL = `uniform sampler2D gSoil;
uniform sampler2D gRock;
uniform sampler2D gPale;
uniform sampler2D gWet;
uniform sampler2D gSoilN;
uniform sampler2D gRockN;
varying vec4 vSplat;
vec3 gNd = vec3(0.0);
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
const mat2 gTurn = mat2(0.344, 0.258, -0.258, 0.344);
vec3 gTap(sampler2D s, vec2 p, vec2 dx, vec2 dy, float scale, bool twice) {
  vec2 q = p * scale; vec2 qx = dx * scale; vec2 qy = dy * scale;
  vec3 a = textureGrad(s, q, qx, qy).rgb;
  if (!twice) return a;
  vec3 b = textureGrad(s, gTurn * q + vec2(0.37, 0.11), gTurn * qx, gTurn * qy).rgb;
  return mix(a, b, smoothstep(0.3, 0.7, gNoise(p * 0.021 + 3.1)));
}
`;
const GROUND_ALBEDO = `{
  vec2 gp = vPositionW.xz;
  vec2 gdx = dFdx(gp); vec2 gdy = dFdy(gp);
  bool lite = gMode.x > 0.5;
  float wr = vSplat.x; float wp = lite ? 0.0 : vSplat.y; float ww = lite ? 0.0 : vSplat.z;
  float ws = max(0.0, 1.0 - wr - wp - ww);
  float macro = 0.82 + 0.36 * (0.6 * gNoise(gp * 0.03) + 0.4 * gNoise(gp * 0.11 + 7.0));
  float near = 1.0 - smoothstep(90.0, 260.0, length(vPositionW - vEyePosition.xyz));
  vec3 ds = vec3(1.0); vec3 dr = vec3(1.0); vec3 dp = vec3(1.0); vec3 dw = vec3(1.0);
  float hs = 0.0; float hr = 0.0; float hp = 0.0; float hw = 0.0;
  vec3 nrm = normalize(vNormalW);
  vec3 nd = vec3(0.0);
  if (ws > 0.02) {
    ds = clamp(gTap(gSoil, gp, gdx, gdy, gTile.x, !lite) / gAvg0.rgb, 0.3, 2.0); hs = dot(ds, vec3(0.1667));
    if (!lite && near > 0.0) { vec3 t = textureGrad(gSoilN, gp * gTile.x, gdx * gTile.x, gdy * gTile.x).xyz * 2.0 - 1.0; nd += (ws + wp + ww) * vec3(t.x, 0.0, t.y); }
  }
  if (wr > 0.02) {
    vec3 bw = pow(abs(nrm), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 P = vPositionW * gTile.y;
    vec3 rt = textureGrad(gRock, P.xz, gdx * gTile.y, gdy * gTile.y).rgb * bw.y;
    rt += textureGrad(gRock, P.xy, dFdx(P.xy), dFdy(P.xy)).rgb * bw.z;
    rt += textureGrad(gRock, P.zy, dFdx(P.zy), dFdy(P.zy)).rgb * bw.x;
    dr = clamp(rt / gAvg1.rgb, 0.3, 2.0); hr = dot(dr, vec3(0.1667));
    if (!lite && near > 0.0) {
      vec3 ty = textureGrad(gRockN, P.xz, gdx * gTile.y, gdy * gTile.y).xyz * 2.0 - 1.0;
      vec3 tz = textureGrad(gRockN, P.xy, dFdx(P.xy), dFdy(P.xy)).xyz * 2.0 - 1.0;
      vec3 tx = textureGrad(gRockN, P.zy, dFdx(P.zy), dFdy(P.zy)).xyz * 2.0 - 1.0;
      nd += wr * (bw.y * vec3(ty.x, 0.0, ty.y) + bw.z * vec3(tz.x, tz.y, 0.0) + bw.x * vec3(0.0, tx.y, tx.x));
    }
  }
  if (wp > 0.02) { dp = clamp(gTap(gPale, gp, gdx, gdy, gTile.z, false) / gAvg2.rgb, 0.3, 2.0); hp = dot(dp, vec3(0.1667)); }
  if (ww > 0.02) { dw = clamp(gTap(gWet, gp, gdx, gdy, gTile.w, false) / gAvg3.rgb, 0.3, 2.0); hw = dot(dw, vec3(0.1667)); }
  float ma = max(max(ws + hs, wr + hr), max(wp + hp, ww + hw)) - 0.3;
  float bs = max(ws + hs - ma, 0.0) * step(0.02, ws); float br = max(wr + hr - ma, 0.0) * step(0.02, wr);
  float bp = max(wp + hp - ma, 0.0) * step(0.02, wp); float bq = max(ww + hw - ma, 0.0) * step(0.02, ww);
  vec3 d = (bs * ds + br * dr + bp * dp + bq * dw) / max(bs + br + bp + bq, 0.001);
  surfaceAlbedo *= mix(vec3(1.0), d * macro, gMode.y * (0.35 + 0.65 * near));
  gNd = nd * near;
}`;

// ---- Three's other shader patches, told to the renderer by whoever makes the material -----------------------------------------------
// (kept beside the material, not in its `userData`, which a copy clones as JSON; limbMaterial hands its base's patch to its copy)

export type ShaderPatch =
  // a textured surface's height map shifting its maps toward the eye (surfaces.tsx parallaxShader, dogfight/hullSurface.ts); `steps`
  // the hull's march through it
  | { kind: "parallax"; height: { value: THREE.Texture | null }; parallax: number; steps?: number }
  // fur: the instance is the shell (models.tsx furShellMaterial)
  | { kind: "fur"; length: number; shells: number; strands: { value: THREE.Texture | null } }
  // a hull's grime, scratches, rust and scorch (models.tsx hullMaterials), `level` its age and damage (0 to 1)
  | { kind: "wear"; wear: THREE.Texture; damage: THREE.Texture; level: [number, number] }
  // the sea's waves (siteAssets.tsx waterMaterial)
  | { kind: "waves"; time: { value: number } }
  // the layered ground (terrain.tsx groundMaterial)
  | { kind: "ground"; layers: GroundLayers };
// The ground's layers (2026-11-11, ground material v2). The vertex colour is the hue (the palette: snow, sand, wet, the biome's own); the vertex attribute
// `splat` (rock, pale, wet) says which layer each point is; the photographs lend only their pattern and relief (each divided by its own average colour),
// blended by height at the seams, broken up by two octaves of world noise and a second, turned and scaled tap against the repeat; the rock is mapped
// along all three axes (so a cliff is not a smear) and the soil's and the rock's normal maps light it. `lite`: soil and rock only, one tap, no normals.
export interface GroundLayers {
  soil: THREE.Texture; rock: THREE.Texture; pale: THREE.Texture | null; wet: THREE.Texture | null;
  soilN: THREE.Texture | null; rockN: THREE.Texture | null;
  // The average colour of each photograph (soil, rock, pale, wet), and the squares of ground in one repeat of it
  avg: [number, number, number][]; tile: [number, number, number, number];
  // How much of the pattern shows (0..1) and how steep the normal maps read
  strength: number; normal: number; lite: boolean;
}
const PATCHES = new WeakMap<THREE.Material, ShaderPatch>();
export function shaderPatch<T extends THREE.Material>(m: T, patch: ShaderPatch): T {
  PATCHES.set(m, patch);
  return m;
}
export const patchOf = (m: THREE.Material) => PATCHES.get(m);

// A plugin made of its code, uniforms and samplers (passed beside it, as the limbs' joints are)
interface PluginSpec {
  name: string;
  ubo: { name: string; size: number; type: string }[];
  samplers?: string[];
  attributes?: string[];
  vertex?: Record<string, string>;
  fragment?: Record<string, string>;
  ready?: () => boolean;
  bind: (ubo: UniformBuffer) => void;
}
let SPEC: PluginSpec;
class CodePlugin extends MaterialPluginBase {
  private spec: PluginSpec;
  // (before the limbs, 200: fur stands out from the body at rest, and is turned with it)
  constructor(material: Material, spec: PluginSpec) {
    SPEC = spec;
    super(material, spec.name, 150, { [spec.name.toUpperCase()]: false });
    this.spec = spec;
    this._enable(true);
  }
  private get s() {
    return this.spec ?? SPEC;
  }
  prepareDefines(defines: Record<string, unknown>) {
    defines[this.s.name.toUpperCase()] = true;
  }
  getClassName() {
    return `${this.s.name}Plugin`;
  }
  getUniforms() {
    return { ubo: this.s.ubo };
  }
  getSamplers(samplers: string[]) {
    samplers.push(...(this.s.samplers ?? []));
  }
  getAttributes(attributes: string[]) {
    attributes.push(...(this.s.attributes ?? []));
  }
  isReadyForSubMesh() {
    return this.s.ready?.() ?? true;
  }
  bindForSubMesh(ubo: UniformBuffer) {
    this.s.bind(ubo);
  }
  getCustomCode(shaderType: string) {
    return (shaderType === "vertex" ? this.s.vertex : this.s.fragment) ?? null;
  }
}
// The mesh's own texture coordinates, passed on to a plugin's fragment code (Babylon passes its own only for a map without repeats)
const PATCH_UV = { definitions: "varying vec2 vPatchUV;", end: "#ifdef UV1\nvPatchUV = uvUpdated;\n#endif" };

// ---- Three's own shader materials (a planet, a shield, drei's stars): their GLSL as it is, with what three declares for it ------------

const declares = (src: string, kind: "attribute" | "uniform", name: string) => new RegExp(`${kind}\\s+\\w+\\s+${name}\\b`).test(src);
// three's chunks: the colour space is written out, the rest (tone mapping, fog) left out
const unchunk = (src: string) =>
  src
    .replace(/#include\s*<(colorspace|encodings)_fragment>/g, "gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));")
    .replace(/#include\s*<[^>]+>/g, "");
function threeShader(m: THREE.ShaderMaterial) {
  const vs = unchunk(m.vertexShader).replace(/\binstanceColor\b/g, "instanceColor.rgb");
  const fs = unchunk(m.fragmentShader);
  const vertex = [
    "precision highp float;",
    "attribute vec3 position;",
    declares(vs, "attribute", "normal") ? "" : "attribute vec3 normal;",
    declares(vs, "attribute", "uv") ? "" : "attribute vec2 uv;",
    m.vertexColors && !declares(vs, "attribute", "color") ? "attribute vec3 color;" : "",
    "uniform mat4 world;\nuniform mat4 view;\nuniform mat4 projection;\nuniform mat4 worldView;\nuniform vec3 cameraPosition;",
    "#define modelMatrix world\n#define viewMatrix view\n#define projectionMatrix projection\n#define modelViewMatrix worldView\n#define normalMatrix mat3(worldView)",
    "#ifdef INSTANCES\nattribute vec4 world0;\nattribute vec4 world1;\nattribute vec4 world2;\nattribute vec4 world3;\n#define instanceMatrix mat4(world0, world1, world2, world3)\n#define USE_INSTANCING\n#else\n#define instanceMatrix mat4(1.0)\n#endif",
    "#ifdef INSTANCESCOLOR\nattribute vec4 instanceColor;\n#define USE_INSTANCING_COLOR\n#endif",
    vs,
  ].join("\n");
  const fragment = ["precision highp float;", "uniform mat4 view;\nuniform vec3 cameraPosition;\n#define viewMatrix view", fs].join("\n");
  const attributes = ["position", "normal", "uv", ...Array.from(vs.matchAll(/attribute\s+\w+\s+(\w+)\s*;/g), (a) => a[1])];
  const samplers = Object.keys(m.uniforms).filter((k) => (m.uniforms[k].value as THREE.Texture | null)?.isTexture);
  const uniforms = ["world", "view", "projection", "worldView", "cameraPosition", ...Object.keys(m.uniforms).filter((k) => !samplers.includes(k))];
  return { vertex, fragment, attributes: Array.from(new Set(attributes)), uniforms, samplers };
}

// ---- The mirror of one three scene ---------------------------------------------------------------------------------------------------

// Frames a geometry stays cached after its last mesh has left the scene (a scene the party goes back to finds its shapes still there)
const IDLE_GEOMETRY = 1800;
// (`spare`: copies of the shape for instanced meshes to take, see `own`)
interface GeoEntry { geo: Geometry; sig: unknown[]; users: number; frame: number; gone: boolean; indexed: boolean; colors: number; spare: Geometry[] }
// What a geometry was copied from: each attribute with its version and count, then the index's (checked every frame for every mesh, so
// without making strings or arrays)
const geometrySig = (g: THREE.BufferGeometry) => {
  const sig: unknown[] = [];
  for (const k in g.attributes) {
    const a = g.attributes[k] as THREE.BufferAttribute;
    sig.push(a, a.version ?? 0, a.count);
  }
  sig.push(g.index, g.index?.version ?? -1, g.index?.count ?? 0);
  return sig;
};
function sameGeometry(sig: unknown[], g: THREE.BufferGeometry) {
  let i = 0;
  for (const k in g.attributes) {
    const a = g.attributes[k] as THREE.BufferAttribute;
    if (sig[i] !== a || sig[i + 1] !== (a.version ?? 0) || sig[i + 2] !== a.count) return false;
    i += 3;
  }
  const x = g.index;
  return i + 3 === sig.length && sig[i] === x && sig[i + 1] === (x?.version ?? -1) && sig[i + 2] === (x?.count ?? 0);
}
// A three material: its own Babylon material, or the look it shares (see `material`)
interface MatEntry { mat?: PBRMaterial; look?: Look; shared: boolean; changes: number; seen: Float32Array; version: number; frame: number; users: number; gone: boolean; maps: unknown[]; far?: Far }
interface Look { key: string; mat: PBRMaterial; users: number; idle: number; far?: Far }
// A material's plainer copy for what is far away (no normal map or parallax, no specular anti-aliasing), made when first wanted
interface Far { mat: PBRMaterial; key: string; frame: number }

// ---- Distance detail (2026-11-03, the user: reduced LOD and draw distance) ---------------------------------------------------------------
// A thing is drawn out to a distance that grows with its size (a few pixels are not worth a draw call and a sync), casts a shadow out to a
// shorter one, and is drawn in plainer materials (and, for the trees, plainer models) past `near`. An instanced scatter is thinned instance
// by instance. Three settings: lite (a phone, or frames dropping), the middle (a desktop on its processor's graphics), and a desktop's full.
interface Detail {
  k: number; floor: number; ceil: number; // draw distance: size times k, within floor and ceil
  shadowK: number; shadowFloor: number; shadowCeil: number; // the same for the shadows it casts
  near: number; // the plainer material, and the plainer model of a tree, from this far
  fur: [number, number]; // a furry figure keeps all its shells inside the first distance, half of them to the second, none beyond it
}
const DETAIL_LITE: Detail = { k: 45, floor: 26, ceil: 120, shadowK: 10, shadowFloor: 14, shadowCeil: 45, near: 26, fur: [10, 20] };
const DETAIL_MID: Detail = { k: 70, floor: 40, ceil: 200, shadowK: 14, shadowFloor: 20, shadowCeil: 70, near: 40, fur: [14, 28] };
const DETAIL_FULL: Detail = { k: 110, floor: 60, ceil: 340, shadowK: 20, shadowFloor: 28, shadowCeil: 100, near: 60, fur: [18, 36] };
const detail = (): Detail => (lite() ? DETAIL_LITE : BIG_GPU() ? DETAIL_FULL : DETAIL_MID);
// What is bigger than this (the ground, a building's shell, the sky) is always drawn
const HUGE = 30;
const reachOf = (r: number, d: Detail) => Math.min(d.ceil, Math.max(d.floor, r * d.k));
const shadowReachOf = (r: number, d: Detail) => Math.min(d.shadowCeil, Math.max(d.shadowFloor, r * d.shadowK));
type Painted = THREE.MeshPhongMaterial & THREE.MeshStandardMaterial & THREE.MeshBasicMaterial & THREE.PointsMaterial;
// The colour, emission and opacity a look was found with
const paintOf = (seen: Float32Array, m: Painted) => {
  seen[0] = m.color?.r ?? -1;
  seen[1] = m.color?.g ?? -1;
  seen[2] = m.color?.b ?? -1;
  seen[3] = m.emissive?.r ?? -1;
  seen[4] = m.emissive?.g ?? -1;
  seen[5] = m.emissive?.b ?? -1;
  seen[6] = m.emissiveIntensity ?? 1;
  seen[7] = m.opacity;
};
const samePaint = (seen: Float32Array, m: Painted) =>
  seen[0] === Math.fround(m.color?.r ?? -1) && seen[1] === Math.fround(m.color?.g ?? -1) && seen[2] === Math.fround(m.color?.b ?? -1) &&
  seen[3] === Math.fround(m.emissive?.r ?? -1) && seen[4] === Math.fround(m.emissive?.g ?? -1) && seen[5] === Math.fround(m.emissive?.b ?? -1) &&
  seen[6] === Math.fround(m.emissiveIntensity ?? 1) && seen[7] === Math.fround(m.opacity);
// The maps a material was made with (each with its version) and the tier, checked every frame the same way
type Mapped = { map?: THREE.Texture | null; normalMap?: THREE.Texture | null; emissiveMap?: THREE.Texture | null; alphaMap?: THREE.Texture | null };
const mapsSig = (m: Mapped, height: THREE.Texture | null) => {
  const sig: unknown[] = [];
  for (const t of [m.map, m.normalMap, m.emissiveMap, m.alphaMap, height]) sig.push(t ?? null, t?.version ?? -1);
  sig.push(LOOK.tier);
  return sig;
};
const sameMap = (sig: unknown[], i: number, t: THREE.Texture | null | undefined) => sig[i] === (t ?? null) && sig[i + 1] === (t?.version ?? -1);
const sameMaps = (sig: unknown[], m: Mapped, height: THREE.Texture | null) =>
  sig.length === 11 && sameMap(sig, 0, m.map) && sameMap(sig, 2, m.normalMap) && sameMap(sig, 4, m.emissiveMap) && sameMap(sig, 6, m.alphaMap) && sameMap(sig, 8, height) && sig[10] === LOOK.tier;
interface TexEntry { tex: Texture; version: number; users: number }
interface Node {
  kind: "mesh" | "lines" | "points" | "sprite" | "text" | "light";
  mesh?: Mesh;
  light?: Light;
  shadow?: ShadowGenerator;
  matrix: Float32Array;
  world: Matrix;
  geometry?: THREE.BufferGeometry;
  // an instanced mesh's own copy of the shape (see `own`)
  own?: { geo: Geometry; sig: unknown[]; entry: GeoEntry };
  material?: THREE.Material | THREE.Material[];
  frame: number;
  casts?: boolean;
  instances?: number;
  colors?: number;
  // distance detail: out of range (not drawn), in the plainer materials, and for a thinned scatter its packed buffers, where the camera
  // stood when it was last thinned, when the mesh last moved, and whether none of it is in range
  culled?: boolean;
  far?: boolean;
  pack?: Float32Array;
  rgba?: Float32Array;
  rgbaPack?: Float32Array;
  packAt?: Float32Array;
  packMoved?: number;
  empty?: boolean;
  label?: string;
  lineSig?: string;
  clustered?: boolean;
}

class Mirror {
  readonly scene: Scene;
  readonly camera: MirrorCamera;
  readonly instrumentation: SceneInstrumentation;
  private nodes = new Map<THREE.Object3D, Node>();
  private geos = new Map<THREE.BufferGeometry, GeoEntry>();
  private mats = new Map<THREE.Material, MatEntry>();
  private texs = new Map<THREE.Texture, TexEntry>();
  private points = new Map<THREE.Object3D, { mat: ShaderMaterial; key: string }>();
  private shaders = new Map<THREE.Material, { mat: ShaderMaterial; key: string }>();
  // the pixels of each image on the graphics card (see gpuOf), the packed normal and height maps likewise, and the textures over them
  private gpu = new Map<string, { tex: InternalTexture; version: number; width: number; height: number; image: unknown }>();
  private packs = new Map<string, { tex: InternalTexture; normal: unknown; height: unknown }>();
  private packWraps = new Map<THREE.Texture, Texture>();
  private frame = 0;
  private stack: THREE.Object3D[] = [];
  private shownStack: boolean[] = [];
  private looks = new Map<string, Look>();
  private cards = new Map<string, { mat: PBRMaterial; quad: VertexData; users: number; idle: number }>();
  private casters = new Set<Mesh>();
  private noToneMapping: ImageProcessingConfiguration;
  // The lights (see makeRig), and what three's lights give them this frame
  private rig?: Rig;
  private skyNow = new Color3();
  private groundNow = new Color3();
  private sunsNow: THREE.DirectionalLight[] = [];
  private shadowLampsNow: THREE.PointLight[] = [];
  // The look on full detail (see look): the sky's reflections, bloom, contact shadows
  private probe?: ReflectionProbe;
  private pipeline?: DefaultRenderingPipeline;
  private ssao?: SSAO2RenderingPipeline;
  // the brightest sun this frame (the sky's reflections are as bright as it)
  private daylight = 0;

  constructor(private engine: Engine, private owner: BabylonRenderer) {
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    // three's taps are R3F's; Babylon picks nothing
    scene.detachControl();
    scene.skipPointerMovePicking = true;
    scene.requireLightSorting = true;
    scene.clearColor = new Color4(0, 0, 0, 0);
    scene.ambientColor = new Color3(0, 0, 0);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.noToneMapping = new ImageProcessingConfiguration();
    this.noToneMapping.toneMappingEnabled = false;
    this.camera = new MirrorCamera("camera", Vector3.Zero(), scene);
    scene.activeCamera = this.camera;
    this.instrumentation = new SceneInstrumentation(scene);
    this.scene = scene;
    // The surfaces drawn nearest first (see nearFirst); the backdrop, group 0, as Babylon orders it
    scene.setRenderingOrder(1, this.nearFirst, this.nearFirst);
  }

  dispose() {
    this.scene.dispose();
  }
  ready() {
    const active = this.scene.getActiveMeshes();
    for (let i = 0; i < active.length; i++) if (!active.data[i].isReady(true)) return false;
    return true;
  }

  retier() {
    this.dropRig();
    this.plain();
  }

  // ---- The order things are drawn in ----

  // Babylon draws the solid surfaces grouped by material, so a far one is often shaded and then drawn over: nearest first, a hidden
  // pixel is never shaded (about a fifth of the GPU's time in a street, 2026-11-01). But two surfaces in one plane show whichever is drawn
  // last, and ordered by distance alone the two would swap as the camera moves, flickering. So the order is by bands of distance (two
  // to each doubling, about 40% wide), a surface leaving its band only a quarter band past the edge, and in a band by material and mesh
  // as before: two surfaces in one plane are next to each other and nearly always share a band, and swap at most once, as the camera
  // crosses, never back and forth. (Walls in one plane draw the same pixels anyway: one wall set a building, its pattern in the
  // building's frame; and a decal is lifted by its polygon offset.)
  private nearFirst = (a: SubMesh, b: SubMesh) => this.band(a) - this.band(b) || RenderingGroup.PainterSortCompare(a, b);
  private band(sm: SubMesh) {
    const s = sm as SubMesh & { _band?: number; _bandFrame?: number };
    if (s._bandFrame === this.frame) return s._band!;
    s._bandFrame = this.frame;
    const c = sm.getBoundingInfo().boundingSphere.centerWorld, p = this.camera.position;
    const at = Math.log2(1 + Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z)) * 2;
    if (s._band === undefined || at < s._band - 0.25 || at > s._band + 1.25) s._band = Math.floor(at);
    return s._band;
  }

  // ---- The look ----

  // On full detail: the backdrop (the sky, its suns and planets, the far land: what three draws first, rendering group 0) seen from the
  // camera in a small cube that the surfaces reflect, as bright as the sun is; bloom round what is drawn near white; and contact shadows
  // on a desktop. Only where the scene is drawn whole (an overlay drawn over another scene, the dogfight's cockpit, gets none).
  private look(sun: number) {
    const full = !lite() && this.owner.autoClear && this.owner.look;
    if (!full) return this.plain();
    const scene = this.scene;
    if (!this.probe) {
      const probe = new ReflectionProbe("sky", DESKTOP ? 128 : 64, scene, true, true);
      probe.refreshRate = 30;
      probe.cubeTexture.renderListPredicate = (m) => m.renderingGroupId === 0 && m.isEnabled();
      // (its ambient part is left out: three's ambient and hemisphere lights give that; only the shine is added)
      const it = probe.cubeTexture.getInternalTexture() as unknown as { _sphericalPolynomial: SphericalPolynomial; _sphericalPolynomialComputed: boolean } | null;
      if (it) {
        it._sphericalPolynomial = new SphericalPolynomial();
        it._sphericalPolynomialComputed = true;
      }
      scene.environmentTexture = probe.cubeTexture;
      this.probe = probe;
    }
    this.probe.position.copyFrom(this.camera.position);
    scene.environmentIntensity = Math.min(1, sun);
    if (!this.pipeline) {
      const p = new DefaultRenderingPipeline("look", false, scene, [this.camera]);
      // (the materials tone-map themselves: the bloom works on what they drew)
      p.imageProcessingEnabled = false;
      const smoothing = EFFECTS.smoothing === "auto" ? (DESKTOP ? "msaa" : "fxaa") : EFFECTS.smoothing;
      p.samples = smoothing === "msaa" ? 4 : 1;
      p.fxaaEnabled = smoothing === "fxaa";
      p.bloomEnabled = EFFECTS.bloom !== "off";
      p.bloomThreshold = 0.98;
      p.bloomWeight = 0.25;
      p.bloomKernel = DESKTOP ? 64 : 32;
      p.bloomScale = 0.5;
      this.pipeline = p;
    }
    if ((EFFECTS.occlusion === "auto" ? BIG_GPU() : EFFECTS.occlusion === "on") && !this.ssao) {
      const ao = new SSAO2RenderingPipeline("contact", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [this.camera], false);
      ao.radius = 0.6;
      ao.totalStrength = 1.1;
      ao.samples = 12;
      ao.maxZ = 60;
      ao.expensiveBlur = true;
      this.ssao = ao;
    }
  }
  private plain() {
    this.ssao?.dispose();
    this.ssao = undefined;
    this.pipeline?.dispose();
    this.pipeline = undefined;
    if (this.probe) {
      this.scene.environmentTexture = null;
      this.probe.dispose();
      this.probe = undefined;
    }
  }

  // ---- Each frame ----

  // Whether the scene being drawn asks for distance detail (a street or a room: LocalMap `DistanceDetail`; a space fight, a galaxy map or a
  // race, where things far away are what is looked at, does not), and what `measure` found of the mesh in hand
  private detailOn = false;
  private lodD = 0;
  private lodR = 0;
  // The distance from the camera to the surface of a mesh's bounding sphere, and its radius in the world, left in `lodD` and `lodR`; false
  // for what is always drawn (the sky and the ground, what is drawn over everything, what is not culled by its bounds)
  private measure(o: THREE.Mesh, g: THREE.BufferGeometry): boolean {
    if (!this.detailOn || (!o.frustumCulled && !o.userData.furShells) || o.renderOrder < 0) return false;
    const m = o.material;
    if (!Array.isArray(m) && !m.depthTest) return false;
    const bs = g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere);
    if (!bs) return false;
    const e = o.matrixWorld.elements;
    const s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
    const r = bs.radius * s;
    if (r > HUGE) return false;
    const c = bs.center;
    const cam = this.camera.position;
    this.lodR = r;
    this.lodD = Math.max(0, Math.hypot(e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12] - cam.x, e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13] - cam.y, e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14] - cam.z) - r);
    return true;
  }

  sync(scene: THREE.Scene, camera: THREE.Camera) {
    // (`__noDetail = true` in the console draws everything, to see what the distance detail saves)
    this.detailOn = !!scene.userData.detail && !(typeof window !== "undefined" && (window as unknown as { __noDetail?: boolean }).__noDetail);
    this.frame++;
    this.daylight = 0;
    this.syncScene(scene);
    this.syncCamera(camera);
    this.scene.skipFrustumClipping = this.owner.preparing;
    // The lights, made again only when the canvas's shadows or the tier change
    const shadows = this.owner.shadowMap.enabled && EFFECTS.shadows !== "off";
    if (this.rig && this.rig.shadows !== shadows) this.dropRig();
    this.rig ??= this.makeRig();
    this.skyNow.set(0, 0, 0);
    this.groundNow.set(0, 0, 0);
    this.sunsNow.length = 0;
    this.shadowLampsNow.length = 0;
    // Everything the scene holds now, with its visibility (two stacks kept from frame to frame: a scene of thousands makes no garbage)
    const stack = this.stack, shownStack = this.shownStack;
    stack.length = 0;
    shownStack.length = 0;
    stack.push(scene);
    shownStack.push(true);
    while (stack.length) {
      const o = stack.pop()!;
      const visible = shownStack.pop()! && o.visible;
      if (o !== scene) this.syncObject(o, visible, camera);
      for (let i = o.children.length - 1; i >= 0; i--) {
        stack.push(o.children[i]);
        shownStack.push(visible);
      }
    }
    stack.length = 0;
    this.lightUp();
    // What has left the scene goes
    for (const [o, node] of this.nodes) if (node.frame !== this.frame) this.drop(o, node);
    for (const [g, entry] of this.geos) if (entry.users <= 0 && (entry.gone || this.frame - entry.frame > IDLE_GEOMETRY)) { entry.geo.dispose(); for (const spare of entry.spare) spare.dispose(); this.geos.delete(g); }
    for (const [m, entry] of this.mats) {
      if (entry.users > 0 || !entry.gone) continue;
      entry.mat?.dispose();
      entry.far?.mat.dispose();
      if (entry.look) this.releaseLook(entry.look);
      this.mats.delete(m);
    }
    // (a look nothing has used for a while goes too, as a shape does)
    if (this.frame % 60 === 0) {
      for (const [key, look] of this.looks) if (look.users <= 0 && this.frame - look.idle > IDLE_GEOMETRY) { look.mat.dispose(); look.far?.mat.dispose(); this.looks.delete(key); }
      for (const [key, card] of this.cards) if (card.users <= 0 && this.frame - card.idle > IDLE_GEOMETRY) { card.mat.dispose(true, true); this.cards.delete(key); }
    }
    this.look(this.daylight);
  }

  private syncScene(scene: THREE.Scene) {
    const s = this.scene;
    const bg = scene.background as THREE.Color | null;
    const clear = bg && (bg as THREE.Color).isColor ? srgb(bg) : this.owner.clearColor;
    const alpha = bg && (bg as THREE.Color).isColor ? 1 : this.owner.clearAlpha;
    s.clearColor.set(clear.r, clear.g, clear.b, alpha);
    s.autoClear = this.owner.autoClear;
    s.autoClearDepthAndStencil = this.owner.autoClear;
    const fog = scene.fog as (THREE.Fog & THREE.FogExp2) | null;
    if (fog) {
      c3(fog.color, s.fogColor);
      if ((fog as THREE.FogExp2).isFogExp2) {
        s.fogMode = Scene.FOGMODE_EXP2;
        s.fogDensity = fog.density;
      } else {
        s.fogMode = Scene.FOGMODE_LINEAR;
        s.fogStart = fog.near;
        s.fogEnd = fog.far;
      }
    } else s.fogMode = Scene.FOGMODE_NONE;
    const ip = s.imageProcessingConfiguration;
    ip.toneMappingEnabled = this.owner.toneMapping !== THREE.NoToneMapping;
    // (three's ACES brightens by 1 / 0.6 before its curve; Babylon's does not)
    ip.exposure = this.owner.toneMappingExposure / (this.owner.toneMapping === THREE.ACESFilmicToneMapping ? 0.6 : 1);
  }

  private syncCamera(camera: THREE.Camera) {
    const cam = this.camera;
    const view = camera.matrixWorldInverse.elements;
    if (!sameMatrix(cam.view.m as unknown as Float32Array, view)) {
      Matrix.FromArrayToRef(view, 0, cam.view);
      cam.moved = true;
    }
    cam.freezeProjectionMatrix(Matrix.FromArray(camera.projectionMatrix.elements));
    const w = camera.matrixWorld.elements;
    cam.position.set(w[12], w[13], w[14]);
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      cam.fov = THREE.MathUtils.degToRad(persp.fov);
      cam.minZ = persp.near;
      cam.maxZ = persp.far;
    }
  }

  private syncObject(o: THREE.Object3D, visible: boolean, camera: THREE.Camera) {
    const light = o as THREE.Light;
    if (light.isLight) return this.syncLight(light, visible);
    const mesh = o as THREE.Mesh;
    if (isText(o)) return this.syncText(o, visible);
    if ((o as THREE.Sprite).isSprite) return this.syncSprite(o as THREE.Sprite, visible, camera);
    if ((o as THREE.Points).isPoints) return this.syncPoints(o as THREE.Points, visible);
    if ((o as THREE.Line).isLine || (o as unknown as { isLineSegments2?: boolean }).isLineSegments2) return this.syncLines(o as THREE.Line, visible);
    if (mesh.isMesh) return this.syncMesh(mesh, visible);
  }

  private nodeOf(o: THREE.Object3D, kind: Node["kind"]): Node {
    let node = this.nodes.get(o);
    if (!node || node.kind !== kind) {
      if (node) this.drop(o, node);
      node = { kind, matrix: new Float32Array(16).fill(NaN), world: Matrix.Identity(), frame: this.frame };
      this.nodes.set(o, node);
    }
    node.frame = this.frame;
    return node;
  }

  private place(node: Node, o: THREE.Object3D, target: Mesh) {
    const e = o.matrixWorld.elements;
    if (sameMatrix(node.matrix, e)) return;
    node.matrix.set(e);
    // (when it last moved, for the lamps' shadow maps: see lightUp)
    (target as unknown as { _movedFrame: number })._movedFrame = this.frame;
    Matrix.FromArrayToRef(e, 0, node.world);
    target.freezeWorldMatrix(node.world);
    (target as unknown as { _worldMatrixDeterminantIsDirty: boolean })._worldMatrixDeterminantIsDirty = true;
  }

  private drop(o: THREE.Object3D, node: Node) {
    if (node.mesh) {
      this.casters.delete(node.mesh);
      for (const g of this.shadowMaps()) g.removeShadowCaster(node.mesh, false);
      // (Mesh.dispose disposes its geometry with the last mesh using it; a cached one is kept for the next scene, and freed by `sync`)
      if (node.geometry) node.mesh.geometry?.releaseForMesh(node.mesh, false);
      // (a text's card is kept for the next label that says the same)
      if (node.kind === "text" && node.label) this.releaseCard(node.label);
      node.mesh.dispose(false, false);
    }
    if (node.light) {
      if (node.clustered && this.rig?.cluster) {
        node.light.intensity = 0;
        this.rig.pool[node.light instanceof SpotLight ? "spot" : "point"].push(node.light as PointLight & SpotLight);
      } else node.light.dispose();
    }
    this.giveBack(node);
    if (node.geometry) this.release(node.geometry);
    this.points.get(o)?.mat.dispose();
    this.points.delete(o);
    for (const m of [node.material ?? []].flat()) this.releaseMaterial(m);
    this.nodes.delete(o);
  }

  // ---- Geometry ----

  private geometry(g: THREE.BufferGeometry): GeoEntry {
    let entry = this.geos.get(g);
    if (entry && sameGeometry(entry.sig, g) && !entry.geo.isDisposed()) return entry;
    // (one whose Babylon geometry was disposed under it is made again, keeping the meshes counted as its users)
    if (!entry || entry.geo.isDisposed()) {
      const users = entry?.users ?? 0;
      entry = { geo: new Geometry(`g${g.id}`, this.scene, undefined, true), sig: [], users, frame: 0, gone: false, indexed: !!g.index, colors: 0, spare: entry?.spare ?? [] };
      this.geos.set(g, entry);
      const e = entry;
      g.addEventListener("dispose", () => { e.gone = true; });
    }
    this.fill(entry.geo, g);
    entry.colors = g.attributes.color ? g.attributes.color.itemSize : 0;
    entry.indexed = !!g.index;
    entry.sig = geometrySig(g);
    // (copies made from the old shape are of no use)
    for (const spare of entry.spare) spare.dispose();
    entry.spare.length = 0;
    return entry;
  }
  // A three geometry's vertices and indices into a Babylon geometry
  private fill(geo: Geometry, g: THREE.BufferGeometry) {
    for (const kind of geo.getVerticesDataKinds()) geo.removeVerticesData(kind);
    const pos = g.attributes.position;
    if (pos) geo.setVerticesData(VertexBuffer.PositionKind, floats(pos), true, 3);
    const normal = g.attributes.normal;
    if (normal) geo.setVerticesData(VertexBuffer.NormalKind, floats(normal), true, 3);
    else if (pos && g.index) {
      const normals: number[] = [];
      VertexData.ComputeNormals(floats(pos), g.index.array as Uint32Array, normals, { useRightHandedSystem: true });
      geo.setVerticesData(VertexBuffer.NormalKind, normals, true, 3);
    }
    const uv = g.attributes.uv;
    if (uv) geo.setVerticesData(VertexBuffer.UVKind, floats(uv), true, 2);
    const color = g.attributes.color;
    if (color) geo.setVerticesData(VertexBuffer.ColorKind, floats(color), true, color.itemSize);
    for (const [name, attr] of Object.entries(g.attributes)) {
      if (["position", "normal", "uv", "color", "uv1", "uv2", "tangent"].includes(name)) continue;
      geo.setVerticesData(name, floats(attr), true, attr.itemSize);
    }
    if (g.index) geo.setIndices(g.index.array as Uint32Array, pos?.count, true);
  }

  // Babylon keeps a thin-instanced mesh's instances on its GEOMETRY's vertex buffers, so two instanced meshes sharing a geometry share their
  // instances: the one set last drew for both. The game draws one piece of the asset library in several places (the open ground's, the
  // cover's and the belt beyond's: one geometry, three instanced meshes), and the ground inside lost its trees, rocks and plants to the
  // belt outside (the user, 2026-11-01: "all rocks and trees missing from within the confines of the local 3d map, drawn OUTSIDE").
  // So an instanced mesh has a copy of the shape of its own, taken from the entry's spares or made, and given back when it goes
  private own(node: Node, entry: GeoEntry, g: THREE.BufferGeometry): Geometry {
    if (node.own && node.own.sig === entry.sig && !node.own.geo.isDisposed()) return node.own.geo;
    this.giveBack(node);
    let geo = entry.spare.pop();
    if (!geo || geo.isDisposed()) {
      geo = new Geometry(`g${g.id}i`, this.scene, undefined, true);
      this.fill(geo, g);
    }
    node.own = { geo, sig: entry.sig, entry };
    return geo;
  }
  private giveBack(node: Node) {
    const own = node.own;
    if (!own) return;
    node.own = undefined;
    if (own.geo.isDisposed()) return;
    // (the instances it carried go: the next mesh to take it brings its own)
    for (const kind of own.geo.getVerticesDataKinds()) if (own.geo.getVertexBuffer(kind)?.getIsInstanced()) own.geo.removeVerticesData(kind);
    if (own.entry.sig === own.sig) own.entry.spare.push(own.geo);
    else own.geo.dispose();
  }
  private use(g: THREE.BufferGeometry) {
    const entry = this.geometry(g);
    entry.users++;
    return entry;
  }
  private release(g: THREE.BufferGeometry) {
    const entry = this.geos.get(g);
    if (!entry) return;
    entry.users--;
    // (the frame it was last used: a geometry nobody has used for a while is freed)
    if (entry.users <= 0) entry.frame = this.frame;
  }

  // ---- Textures ----

  // The game clones a map for each surface it covers (to set its repeat), and a room's surfaces are made again each time it is entered:
  // each clone was a texture of its own, uploaded again (25 ms going back into a palace room, 2026-11-01). As three does, the pixels
  // are kept once for each image (three's `Source`, which the clones share) and settings, on the graphics card for the session; each
  // three texture is a Babylon texture over them, with its own repeat and offset.
  private gpuOf(t: THREE.Texture, image: { width: number; height: number }, mips: boolean, sampling: number) {
    const key = `${t.source.uuid}|${mips}|${sampling}|${t.flipY}`;
    let gpu = this.gpu.get(key);
    if (!gpu || gpu.width !== image.width || gpu.height !== image.height) {
      gpu?.tex.dispose();
      gpu = { tex: this.engine.createDynamicTexture(image.width, image.height, mips, sampling), version: -1, width: image.width, height: image.height, image: null };
      this.gpu.set(key, gpu);
    }
    // (a clone told `needsUpdate` moves the version of the image it shares, 2026-11-01 the ground and floors on every visit: a loaded
    // picture is the same pixels while it is the same picture; a canvas is drawn on, and goes up again)
    if (gpu.version !== t.source.version && !(gpu.image === image && fixedImage(image))) {
      this.engine.updateDynamicTexture(gpu.tex, image as unknown as HTMLCanvasElement, t.flipY, false);
    }
    gpu.version = t.source.version;
    gpu.image = image;
    return gpu.tex;
  }
  // A Babylon texture showing pixels already on the card (it holds them while it lives)
  private over(gpu: InternalTexture, mips: boolean, flipY: boolean, sampling: number) {
    const tex = new Texture(null, this.scene, !mips, flipY, sampling);
    gpu.incrementReferences();
    (tex as unknown as { _texture: InternalTexture })._texture = gpu;
    return tex;
  }

  private texture(t: THREE.Texture | null | undefined): Texture | null {
    if (!t) return null;
    const image = t.image as (HTMLImageElement & { data?: ArrayBufferView; width: number; height: number }) | undefined;
    if (!image || !image.width || (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement && !image.complete)) return null;
    let entry = this.texs.get(t);
    if (entry && entry.version === t.version) return entry.tex;
    const sampling = t.magFilter === THREE.NearestFilter ? Texture.NEAREST_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE;
    const mips = t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter;
    if ((t as THREE.DataTexture).isDataTexture) {
      const data = image.data as Uint8Array;
      const format = t.format === THREE.RedFormat ? Constants.TEXTUREFORMAT_RED : t.format === THREE.RGBFormat ? Constants.TEXTUREFORMAT_RGB : Constants.TEXTUREFORMAT_RGBA;
      const type = data instanceof Float32Array ? Constants.TEXTURETYPE_FLOAT : Constants.TEXTURETYPE_UNSIGNED_BYTE;
      if (entry && entry.tex instanceof RawTexture && entry.tex.getSize().width === image.width) entry.tex.update(data);
      else {
        entry?.tex.dispose();
        entry = { tex: new RawTexture(data, image.width, image.height, format, this.scene, mips, t.flipY, sampling, type), version: 0, users: 0 };
        this.texs.set(t, entry);
      }
    } else {
      const gpu = this.gpuOf(t, image, mips, sampling);
      if (!entry || entry.tex.getInternalTexture() !== gpu) {
        entry?.tex.dispose();
        entry = { tex: this.over(gpu, mips, t.flipY, sampling), version: 0, users: 0 };
        if (!this.texs.has(t)) {
          const map = this.texs;
          t.addEventListener("dispose", () => { map.get(t)?.tex.dispose(); map.delete(t); });
        }
        this.texs.set(t, entry);
      }
    }
    settle(entry.tex, t);
    entry.version = t.version;
    return entry.tex;
  }

  // A normal map with its height map in the alpha, where Babylon's parallax reads the height (made once a pair of images and kept, as
  // the maps are; none while either is a flat stand-in or still loading)
  private packed(normal: THREE.Texture | null | undefined, height: THREE.Texture | null): Texture | null {
    type Img = CanvasImageSource & { width: number; height: number; complete?: boolean };
    const n = normal?.image as Img | undefined, h = height?.image as Img | undefined;
    if (!normal || !height || (normal as THREE.DataTexture).isDataTexture || (height as THREE.DataTexture).isDataTexture) return null;
    if (!n?.width || !h?.width || n.complete === false || h.complete === false || typeof document === "undefined") return null;
    const key = `${normal.source.uuid}|${height.source.uuid}|${normal.flipY}`;
    const made = this.packs.get(key);
    let gpu = made && made.normal === n && made.height === h && fixedImage(n) && fixedImage(h) ? made.tex : undefined;
    if (!gpu) {
      made?.tex.dispose();
      const w = n.width, hh = n.height;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = hh;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(n, 0, 0, w, hh);
      const data = g.getImageData(0, 0, w, hh).data;
      g.drawImage(h, 0, 0, w, hh);
      const heights = g.getImageData(0, 0, w, hh).data;
      for (let i = 3; i < data.length; i += 4) data[i] = heights[i - 3];
      const raw = new RawTexture(new Uint8Array(data.buffer), w, hh, Constants.TEXTUREFORMAT_RGBA, this.scene, true, normal.flipY, Texture.TRILINEAR_SAMPLINGMODE);
      gpu = raw.getInternalTexture()!;
      // (kept by the cache when the RawTexture that made it goes)
      gpu.incrementReferences();
      raw.dispose();
      this.packs.set(key, { tex: gpu, normal: n, height: h });
    }
    let tex = this.packWraps.get(normal);
    if (!tex || tex.getInternalTexture() !== gpu) {
      if (!this.packWraps.has(normal)) normal.addEventListener("dispose", () => { this.packWraps.get(normal)?.dispose(); this.packWraps.delete(normal); });
      tex?.dispose();
      tex = this.over(gpu, true, normal.flipY, Texture.TRILINEAR_SAMPLINGMODE);
      this.packWraps.set(normal, tex);
    }
    settle(tex, normal);
    return tex;
  }

  // ---- Materials ----

  // The Babylon material a three one is drawn with. The game makes a material a model, a box or a colour (about 800 for the 1235
  // meshes of a street, measured 2026-11-01), and Babylon binds each call's own: so three materials that look alike share one Babylon
  // material, a "look", found by what it shows (`lookKey`). A material whose colour or opacity keeps changing (a flickering lamp, a
  // highlight) gets one of its own after its third change, as do those with a plugin of their own (fur, wear, waves, parallax, limbs).
  private material(m: THREE.Material): PBRMaterial {
    let entry = this.mats.get(m);
    if (!entry) {
      const shared = !PATCHES.get(m) && !(m.userData.limbParents && m.userData.pose);
      entry = { version: -1, frame: 0, users: 0, gone: false, maps: [], shared, changes: 0, seen: new Float32Array(9).fill(NaN) };
      this.mats.set(m, entry);
      const e = entry;
      m.addEventListener("dispose", () => { e.gone = true; });
    }
    if (entry.frame === this.frame) return entry.look?.mat ?? entry.mat!;
    entry.frame = this.frame;
    const any = m as Painted;
    const patch = PATCHES.get(m);
    const height = patch?.kind === "parallax" ? patch.height.value : null;
    if (entry.shared) {
      const painted = samePaint(entry.seen, any);
      if (entry.look && painted && entry.version === m.version && sameMaps(entry.maps, any, height)) return entry.look.mat;
      // (a change of colour after the first look counts towards its own; a map arriving or a new version does not)
      if (entry.look && !painted && ++entry.changes >= 3) {
        entry.shared = false;
        this.releaseLook(entry.look);
        entry.look = undefined;
      } else {
        paintOf(entry.seen, any);
        entry.version = m.version;
        entry.maps = mapsSig(any, height);
        const key = this.lookKey(m);
        if (entry.look?.key !== key) {
          if (entry.look) this.releaseLook(entry.look);
          let look = this.looks.get(key);
          if (!look) {
            look = { key, mat: this.newMaterial(`look${this.looks.size}`), users: 0, idle: 0 };
            this.paint(look.mat, any);
            this.dress(look.mat, m, null);
            this.looks.set(key, look);
          }
          look.users++;
          entry.look = look;
        }
        return entry.look.mat;
      }
    }
    // A material of its own
    if (!entry.mat) {
      const mat = (entry.mat = this.newMaterial(`m${m.id}`));
      if (patch) this.plugin(mat, patch);
      const parents = m.userData.limbParents as number[] | undefined;
      if (parents && m.userData.pose) {
        new LimbPlugin(mat, m, parents);
        // its shadow falls as it stands (the shadow maps are drawn with the material's own vertex shader)
        mat.shadowDepthWrapper = new ShadowDepthWrapper(mat, this.scene);
      }
      entry.version = -1;
    }
    const mat = entry.mat;
    this.paint(mat, any);
    if (entry.version === m.version && sameMaps(entry.maps, any, height)) return mat;
    entry.version = m.version;
    entry.maps = mapsSig(any, height);
    this.dress(mat, m, patch);
    return mat;
  }
  private newMaterial(name: string) {
    const mat = new PBRMaterial(name, this.scene);
    mat.enableSpecularAntiAliasing = true;
    mat.maxSimultaneousLights = this.lightCount();
    // three's diffuse is Lambert's (Babylon's own darkens a rough surface)
    mat.brdf.baseDiffuseModel = Constants.MATERIAL_DIFFUSE_MODEL_LAMBERT;
    return mat;
  }
  // What changes from frame to frame: colour, opacity, emission
  private paint(mat: PBRMaterial, any: Painted) {
    if (any.color) c3(any.color, mat.albedoColor);
    else mat.albedoColor.set(1, 1, 1);
    if (any.emissive) {
      const k = any.emissiveIntensity ?? 1;
      mat.emissiveColor.set(any.emissive.r * k, any.emissive.g * k, any.emissive.b * k);
    } else mat.emissiveColor.set(0, 0, 0);
    mat.alpha = any.opacity;
  }
  // The rest, when the three material changes or its maps come
  private dress(mat: PBRMaterial, m: THREE.Material, patch: ShaderPatch | null | undefined) {
    const any = m as Painted;
    const height = patch?.kind === "parallax" ? patch.height.value : null;
    const basic = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial || (m as THREE.PointsMaterial).isPointsMaterial || (m as THREE.SpriteMaterial).isSpriteMaterial || (m as THREE.ShaderMaterial).isShaderMaterial;
    mat.unlit = basic;
    if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      mat.metallic = any.metalness;
      mat.roughness = any.roughness;
    } else if ((m as THREE.MeshPhongMaterial).isMeshPhongMaterial) {
      const spec = any.specular ? (any.specular.r + any.specular.g + any.specular.b) / 3 : 0.07;
      mat.roughness = Math.min(0.95, Math.max(0.12, 1 - (any.shininess ?? 30) / 140));
      mat.metallic = m.transparent ? 0 : Math.min(0.8, Math.max(0, (spec - 0.04) * 1.6));
    } else {
      mat.metallic = 0;
      mat.roughness = 0.95;
    }
    mat.albedoTexture = this.texture(any.map);
    // (a height map goes in the normal map's alpha: Babylon's own parallax, marched through the height on a desktop's full detail)
    const packed = patch?.kind === "parallax" ? this.packed(any.normalMap, height) : null;
    mat.bumpTexture = packed ?? this.texture(any.normalMap);
    if (mat.bumpTexture) {
      mat.bumpTexture.level = any.normalScale?.x ?? 1;
      mat.invertNormalMapY = true;
    }
    mat.useParallax = !!packed;
    mat.useParallaxOcclusion = !!packed && BIG_GPU() && !lite();
    if (patch?.kind === "parallax") mat.parallaxScaleBias = patch.parallax;
    mat.emissiveTexture = this.texture(any.emissiveMap);
    mat.opacityTexture = this.texture(any.alphaMap);
    const add = m.blending === THREE.AdditiveBlending;
    mat.alphaMode = add ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
    mat.transparencyMode = m.transparent || add ? PBRMaterial.PBRMATERIAL_ALPHABLEND : m.alphaTest > 0 ? PBRMaterial.PBRMATERIAL_ALPHATEST : PBRMaterial.PBRMATERIAL_OPAQUE;
    mat.alphaCutOff = m.alphaTest;
    // (Babylon reads a map's alpha only when told it has one)
    if (mat.albedoTexture && (m.transparent || m.alphaTest > 0)) {
      mat.albedoTexture.hasAlpha = true;
      mat.useAlphaFromAlbedoTexture = true;
    }
    mat.disableDepthWrite = !m.depthWrite;
    mat.depthFunction = m.depthTest ? 0 : Constants.ALWAYS;
    mat.backFaceCulling = m.side !== THREE.DoubleSide;
    mat.twoSidedLighting = m.side === THREE.DoubleSide;
    mat.cullBackFaces = m.side !== THREE.BackSide;
    mat.fogEnabled = (m as THREE.MeshLambertMaterial).fog !== false;
    mat.wireframe = !!(m as THREE.MeshBasicMaterial).wireframe;
    if (m.polygonOffset) mat.zOffset = m.polygonOffsetFactor;
    // A lamp's bulb, a screen, a blade: drawn as bright as it is (three's toneMapped: false)
    if (!m.toneMapped) mat.imageProcessingConfiguration = this.noToneMapping;
  }
  // Everything `paint` and `dress` read, as one string: two materials with the same key draw the same
  private lookKey(m: THREE.Material) {
    const a = m as Painted;
    const tex = (t: THREE.Texture | null | undefined) => (t ? `${t.id}.${t.version}` : "-");
    const col = (c: THREE.Color | undefined) => (c ? `${c.r},${c.g},${c.b}` : "-");
    return [
      m.type, col(a.color), col(a.emissive), a.emissiveIntensity ?? 1, m.opacity, a.metalness, a.roughness, col(a.specular), a.shininess,
      tex(a.map), tex(a.normalMap), a.normalScale?.x ?? 1, tex(a.emissiveMap), tex(a.alphaMap),
      m.transparent, m.blending, m.alphaTest, m.depthWrite, m.depthTest, m.side, (m as THREE.MeshLambertMaterial).fog, (m as THREE.MeshBasicMaterial).wireframe,
      m.polygonOffset ? m.polygonOffsetFactor : "-", m.toneMapped,
    ].join("|");
  }
  private releaseLook(look: Look) {
    look.users--;
    if (look.users <= 0) look.idle = this.frame;
  }
  private releaseMaterial(m: THREE.Material) {
    const entry = this.mats.get(m);
    if (entry) entry.users--;
  }

  // What the three material's maker patched into its shader, as a plugin of the Babylon one (parallax is Babylon's own: see material)
  private plugin(mat: PBRMaterial, patch: ShaderPatch) {
    if (patch.kind === "fur") {
      // Each shell pushed out along the surface and drooping, keeping only the strands that reach it
      const strands = () => this.texture(patch.strands.value);
      new CodePlugin(mat, {
        name: "FurShells",
        ubo: [{ name: "uFurLength", size: 1, type: "float" }, { name: "uShells", size: 1, type: "float" }],
        samplers: ["uStrands"],
        vertex: {
          CUSTOM_VERTEX_DEFINITIONS: `varying float vShell;\n${PATCH_UV.definitions}`,
          CUSTOM_VERTEX_MAIN_END: PATCH_UV.end,
          CUSTOM_VERTEX_UPDATE_POSITION: "vShell = (float(gl_InstanceID) + 1.0) / uShells;\npositionUpdated += normalize(normal) * vShell * uFurLength;\npositionUpdated.y -= vShell * vShell * uFurLength * 0.35;",
        },
        fragment: {
          CUSTOM_FRAGMENT_DEFINITIONS: `uniform sampler2D uStrands;\nvarying float vShell;\n${PATCH_UV.definitions}`,
          CUSTOM_FRAGMENT_UPDATE_ALBEDO: "{ float strand = texture2D(uStrands, vPatchUV * 3.0).r; if (strand < vShell * 0.92 + 0.04) discard; surfaceAlbedo *= mix(0.6, 1.08, vShell); }",
        },
        ready: () => !!strands(),
        bind: (ubo) => {
          ubo.updateFloat("uFurLength", patch.length);
          ubo.updateFloat("uShells", patch.shells);
          const t = strands();
          if (t) ubo.setTexture("uStrands", t);
        },
      });
    } else if (patch.kind === "wear") {
      // Grime, rust, bare metal where it is scratched and scorch, each over the share of the masks its level covers
      const wear = () => this.texture(patch.wear), damage = () => this.texture(patch.damage);
      new CodePlugin(mat, {
        name: "HullWear",
        ubo: [{ name: "wearLevel", size: 2, type: "vec2" }],
        samplers: ["wearMap", "damageMap"],
        vertex: { CUSTOM_VERTEX_DEFINITIONS: PATCH_UV.definitions, CUSTOM_VERTEX_MAIN_END: PATCH_UV.end },
        fragment: {
          CUSTOM_FRAGMENT_DEFINITIONS: `uniform sampler2D wearMap;\nuniform sampler2D damageMap;\n${PATCH_UV.definitions}\nfloat hwCover(float m, float amount) { return smoothstep(1.0 - amount, 1.2 - amount, m); }`,
          CUSTOM_FRAGMENT_UPDATE_ALBEDO: `{
  vec3 wm = texture2D(wearMap, vPatchUV * 0.5).rgb;
  float dm = texture2D(damageMap, vPatchUV * 0.35).r;
  float age = wearLevel.x;
  surfaceAlbedo *= 1.0 - 0.5 * hwCover(wm.r, 0.1 * age + 0.75 * age * age);
  surfaceAlbedo = mix(surfaceAlbedo, vec3(0.42, 0.2, 0.1) * (0.7 + 0.6 * wm.r), hwCover(wm.b, 0.26 * age * age) * 0.7);
  surfaceAlbedo = mix(surfaceAlbedo, vec3(0.66, 0.68, 0.7), hwCover(wm.g, age * 0.7) * 0.7);
  surfaceAlbedo *= 1.0 - 0.9 * hwCover(dm, wearLevel.y * 0.9);
}`,
        },
        ready: () => !!wear() && !!damage(),
        bind: (ubo) => {
          ubo.updateFloat2("wearLevel", patch.level[0], patch.level[1]);
          ubo.setTexture("wearMap", wear()!);
          ubo.setTexture("damageMap", damage()!);
        },
      });
    } else if (patch.kind === "waves") {
      // The sea's face raised by its waves where it lies in the world, and turned to their slope
      new CodePlugin(mat, {
        name: "SeaWaves",
        ubo: [{ name: "uTime", size: 1, type: "float" }],
        vertex: {
          CUSTOM_VERTEX_DEFINITIONS: "float waveH(vec2 p) { return 0.07 * sin(p.x * 0.85 + uTime * 1.25) + 0.05 * sin(p.y * 1.21 - uTime * 1.05) + 0.03 * sin((p.x + p.y) * 2.2 + uTime * 2.0) + 0.015 * sin((p.x - p.y) * 4.1 - uTime * 2.9); }",
          CUSTOM_VERTEX_UPDATE_POSITION: "vec2 wvP = (world * vec4(position, 1.0)).xz;\nfloat wvH = waveH(wvP);\npositionUpdated.y += wvH;",
          CUSTOM_VERTEX_UPDATE_NORMAL: "normalUpdated = normalize(vec3(-(waveH(wvP + vec2(0.06, 0.0)) - wvH) / 0.06, 1.0, -(waveH(wvP + vec2(0.0, 0.06)) - wvH) / 0.06));",
        },
        bind: (ubo) => ubo.updateFloat("uTime", patch.time.value),
      });
    } else if (patch.kind === "ground") {
      const L = patch.layers;
      const get = (t: THREE.Texture | null) => this.texture(t);
      new CodePlugin(mat, {
        name: "GroundLayers",
        ubo: [{ name: "gTile", size: 4, type: "vec4" }, { name: "gAvg0", size: 4, type: "vec4" }, { name: "gAvg1", size: 4, type: "vec4" }, { name: "gAvg2", size: 4, type: "vec4" }, { name: "gAvg3", size: 4, type: "vec4" }, { name: "gMode", size: 4, type: "vec4" }],
        samplers: ["gSoil", "gRock", "gPale", "gWet", "gSoilN", "gRockN"],
        attributes: ["splat"],
        vertex: { CUSTOM_VERTEX_DEFINITIONS: "attribute vec4 splat;\nvarying vec4 vSplat;", CUSTOM_VERTEX_MAIN_END: "vSplat = splat;" },
        fragment: {
          CUSTOM_FRAGMENT_DEFINITIONS: GROUND_GLSL,
          CUSTOM_FRAGMENT_UPDATE_ALBEDO: GROUND_ALBEDO,
          CUSTOM_FRAGMENT_BEFORE_LIGHTS: "normalW = normalize(normalW + gNd * gMode.z);",
        },
        ready: () => !!get(L.soil) && !!get(L.rock),
        bind: (ubo) => {
          const soil = get(L.soil)!;
          ubo.setTexture("gSoil", soil);
          ubo.setTexture("gRock", get(L.rock) ?? soil);
          ubo.setTexture("gPale", get(L.pale) ?? soil);
          ubo.setTexture("gWet", get(L.wet) ?? soil);
          ubo.setTexture("gSoilN", get(L.soilN) ?? soil);
          ubo.setTexture("gRockN", get(L.rockN) ?? soil);
          ubo.updateFloat4("gTile", 1 / L.tile[0], 1 / L.tile[1], 1 / L.tile[2], 1 / L.tile[3]);
          L.avg.forEach((a, i) => ubo.updateFloat4(`gAvg${i}`, a[0], a[1], a[2], 1));
          ubo.updateFloat4("gMode", L.lite ? 1 : 0, L.strength, L.normal, 0);
        },
      });
    }
  }

  // A three shader material drawn by its own GLSL; its uniforms are copied over each frame (it may be shared by several meshes)
  private shaderOf(m: THREE.ShaderMaterial, points: boolean): ShaderMaterial {
    const key = `${m.version}|${points}|${m.transparent}|${m.blending}|${m.side}|${m.depthWrite}|${m.depthTest}`;
    let entry = this.shaders.get(m);
    if (!entry || entry.key !== key) {
      entry?.mat.dispose();
      const code = threeShader(m);
      const add = m.blending === THREE.AdditiveBlending;
      const mat = new ShaderMaterial(`sh${m.id}`, this.scene, { vertexSource: code.vertex, fragmentSource: code.fragment }, {
        attributes: code.attributes,
        uniforms: code.uniforms,
        samplers: code.samplers,
        needAlphaBlending: m.transparent || add,
      });
      mat.alphaMode = add ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
      mat.disableDepthWrite = !m.depthWrite;
      mat.depthFunction = m.depthTest ? 0 : Constants.ALWAYS;
      mat.backFaceCulling = m.side !== THREE.DoubleSide;
      mat.cullBackFaces = m.side !== THREE.BackSide;
      mat.pointsCloud = points;
      if (!this.shaders.has(m)) m.addEventListener("dispose", () => { this.shaders.get(m)?.mat.dispose(); this.shaders.delete(m); });
      entry = { mat, key };
      this.shaders.set(m, entry);
      entry.mat.metadata = { frame: -1 };
    }
    const mat = entry.mat;
    if (mat.metadata.frame === this.frame) return mat;
    mat.metadata.frame = this.frame;
    const cam = this.camera.position;
    mat.setVector3("cameraPosition", cam);
    for (const [name, u] of Object.entries(m.uniforms)) {
      const v = u.value as unknown;
      if (typeof v === "number") mat.setFloat(name, v);
      else if (typeof v === "boolean") mat.setInt(name, v ? 1 : 0);
      else if (!v || typeof v !== "object") continue;
      else if ((v as THREE.Texture).isTexture) {
        const t = this.texture(v as THREE.Texture);
        if (t) mat.setTexture(name, t);
      } else if (Array.isArray(v)) {
        if (!v.length) continue;
        const first = v[0] as THREE.Vector4 & THREE.Color;
        if (typeof first === "number") mat.setFloats(name, v as number[]);
        else if (first.isVector4) mat.setArray4(name, (v as THREE.Vector4[]).flatMap((p) => [p.x, p.y, p.z, p.w]));
        else if ((first as unknown as THREE.Vector3).isVector3) mat.setArray3(name, (v as THREE.Vector3[]).flatMap((p) => [p.x, p.y, p.z]));
        else if (first.isColor) mat.setArray3(name, (v as THREE.Color[]).flatMap((c) => [c.r, c.g, c.b]));
        else if ((first as unknown as THREE.Vector2).isVector2) mat.setArray2(name, (v as THREE.Vector2[]).flatMap((p) => [p.x, p.y]));
      } else {
        const o = v as THREE.Vector4 & THREE.Color & THREE.Matrix4 & { isVector2?: boolean; isVector3?: boolean; isMatrix3?: boolean };
        if (o.isColor) mat.setArray3(name, [o.r, o.g, o.b]);
        else if (o.isVector4) mat.setArray4(name, [o.x, o.y, o.z, o.w]);
        else if (o.isVector3) mat.setArray3(name, [o.x, o.y, o.z]);
        else if (o.isVector2) mat.setArray2(name, [o.x, o.y]);
        else if (o.isMatrix4) mat.setMatrix(name, Matrix.FromArray(o.elements));
        else if (o.isMatrix3) mat.setMatrix3x3(name, new Float32Array(o.elements));
      }
    }
    return mat;
  }
  // The plainer copy of a material for what is far away (see Detail): the same colours and albedo map, with no normal map, parallax or
  // specular anti-aliasing. One for each look, or each material of its own; a material that moves limbs, grows fur or waves keeps its own.
  private plainer(m: THREE.Material): PBRMaterial {
    const near = this.material(m);
    const entry = this.mats.get(m);
    const patch = PATCHES.get(m);
    if (!entry || !near.bumpTexture || m.userData.limbParents || (patch && patch.kind !== "parallax")) return near;
    const holder: { far?: Far } = entry.look ?? entry;
    const key = `${m.version}|${near.albedoTexture?.uniqueId ?? 0}`;
    let far = holder.far;
    if (!far) far = holder.far = { mat: this.newMaterial(`far${m.id}`), key: "", frame: -1 };
    if (far.frame === this.frame) return far.mat;
    far.frame = this.frame;
    this.paint(far.mat, m as Painted);
    if (far.key !== key) {
      far.key = key;
      this.dress(far.mat, m, null);
      far.mat.bumpTexture = null;
      far.mat.useParallax = false;
      far.mat.useParallaxOcclusion = false;
      far.mat.enableSpecularAntiAliasing = false;
    }
    return far.mat;
  }

  private bind(node: Node, mesh: Mesh, material: THREE.Material | THREE.Material[], g: THREE.BufferGeometry, colors: number, far = false) {
    if (node.material !== material) {
      const list = [material].flat();
      for (const m of [node.material ?? []].flat()) this.releaseMaterial(m);
      node.material = material;
      for (const m of list) {
        this.material(m);
        this.mats.get(m)!.users++;
      }
      if (Array.isArray(material)) {
        const multi = new MultiMaterial(`mm${mesh.uniqueId}`, this.scene);
        multi.subMaterials = list.map((m) => this.material(m));
        mesh.material = multi;
        mesh.subMeshes = [];
        const total = g.attributes.position.count;
        for (const group of g.groups) new SubMesh(group.materialIndex ?? 0, 0, total, group.start, group.count, mesh);
      }
    }
    // (each frame: a three material's look changes with its colour)
    if (Array.isArray(material)) {
      const multi = mesh.material as MultiMaterial;
      let changed = false;
      for (let i = 0; i < material.length; i++) if (multi.subMaterials[i] !== this.material(material[i])) changed = true;
      if (changed) {
        // (as Babylon does when a mesh's own material is changed: its shaders are looked up again)
        multi.subMaterials = material.map((m) => this.material(m));
        mesh.resetDrawCache();
        (mesh as unknown as { _unBindEffect(): void })._unBindEffect();
      }
    } else mesh.material = far ? this.plainer(material) : this.material(material);
    const first = Array.isArray(material) ? material[0] : material;
    mesh.useVertexColors = !!(first as THREE.MeshBasicMaterial).vertexColors && colors > 0;
    mesh.hasVertexAlpha = mesh.useVertexColors && colors === 4 && first.transparent;
  }

  // ---- Meshes ----

  private meshNode(o: THREE.Object3D, kind: Node["kind"], g: THREE.BufferGeometry): { node: Node; mesh: Mesh; entry: GeoEntry } {
    const node = this.nodeOf(o, kind);
    if (node.geometry !== g || !node.mesh) {
      if (node.geometry) this.release(node.geometry);
      node.geometry = g;
      this.use(g);
      if (!node.mesh) {
        node.mesh = kind === "lines" ? new LinesMesh(`l${o.id}`, this.scene) : new Mesh(`o${o.id}`, this.scene);
        node.mesh.isPickable = false;
        node.mesh.sideOrientation = FRONT;
      }
    }
    const entry = this.geometry(g);
    const geo = (o as THREE.InstancedMesh).isInstancedMesh ? this.own(node, entry, g) : entry.geo;
    if (node.mesh.geometry !== geo) {
      geo.applyToMesh(node.mesh);
      node.mesh.isUnIndexed = !entry.indexed;
      node.matrix.fill(NaN);
      // (a new geometry has none of the instances: they are set again)
      node.instances = undefined;
      node.colors = undefined;
    }
    return { node, mesh: node.mesh, entry };
  }

  private syncMesh(o: THREE.Mesh, visible: boolean) {
    const g = o.geometry;
    if (!g?.attributes.position) return;
    const { node, mesh, entry } = this.meshNode(o, "mesh", g);
    // (an instanced mesh with no instances draws nothing in three; Babylon would draw its one mesh)
    const shown = Array.isArray(o.material) ? o.material.some((m) => m.visible) : o.material.visible;
    const inst = o as THREE.InstancedMesh;
    const set = visible && shown && !(inst.isInstancedMesh && inst.count === 0);
    // Distance detail: how far this is, and so whether it is drawn at all (an instanced scatter is thinned instance by instance, below)
    const D = detail();
    const away = set && !this.owner.preparing && this.measure(o, g) ? this.lodD : -1;
    const fur = !!inst.isInstancedMesh && !!inst.userData.furShells;
    if (away >= 0 && !inst.isInstancedMesh) {
      const out = away > reachOf(this.lodR, D) * (node.culled ? 0.92 : 1);
      node.culled = out;
      if (out) {
        mesh.setEnabled(false);
        this.cast(node, mesh, false);
        return;
      }
    } else node.culled = false;
    // (a scatter's thinned buffers hold none of it, or a furry body is too far for its shells)
    mesh.setEnabled(set && !node.empty);
    if (!visible) return;
    this.place(node, o, mesh);
    const shader = !Array.isArray(o.material) && (o.material as THREE.ShaderMaterial).isShaderMaterial ? (o.material as THREE.ShaderMaterial) : null;
    // (the plainer materials from `near` on, for a scatter's farther model, and for what is far in a street: inside, a room is all near)
    const farBand = inst.isInstancedMesh && inst.userData.lod === "far";
    const plain = farBand || (away >= 0 && away > D.near * (node.far ? 0.9 : 1) && !inst.isInstancedMesh);
    node.far = plain;
    if (shader) mesh.material = this.shaderOf(shader, false);
    else this.bind(node, mesh, o.material, g, entry.colors, plain);
    mesh.renderingGroupId = o.renderOrder < 0 ? 0 : 1;
    mesh.alphaIndex = o.renderOrder;
    mesh.receiveShadows = o.receiveShadow;
    mesh.alwaysSelectAsActiveMesh = !o.frustumCulled;
    // Instancing: three's instance matrices are already in the mesh's own frame, as Babylon's thin instances are. A scatter in a street or a
    // room (a scene asking for distance detail) is thinned to what is in range: its buffers are packed copies, refilled as the camera moves
    if (inst.isInstancedMesh) {
      const thin = this.detailOn && !this.owner.preparing && !fur && inst.count > 1;
      const v = inst.instanceMatrix.version + inst.count * 7 + (thin ? 0.5 : 0);
      if (node.instances !== v) {
        node.instances = v;
        node.packAt = undefined;
        const full = inst.instanceMatrix.array as Float32Array;
        let buffer = full;
        if (thin) {
          if (node.pack?.length !== full.length) node.pack = new Float32Array(full.length);
          node.pack.set(full);
          buffer = node.pack;
        }
        mesh.thinInstanceSetBuffer("matrix", buffer, 16, false);
        mesh.thinInstanceCount = inst.count;
        // (its bounds take in every instance, for the camera's culling and the shadows')
        mesh.thinInstanceRefreshBoundingInfo(false);
      }
      if (inst.instanceColor) {
        const cv = inst.instanceColor.version + (thin ? 0.5 : 0);
        if (node.colors !== cv) {
          node.colors = cv;
          node.packAt = undefined;
          const src = inst.instanceColor.array as Float32Array;
          const rgba = new Float32Array((src.length / 3) * 4);
          for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
            rgba[j] = src[i];
            rgba[j + 1] = src[i + 1];
            rgba[j + 2] = src[i + 2];
            rgba[j + 3] = 1;
          }
          node.rgba = rgba;
          if (thin) {
            node.rgbaPack = new Float32Array(rgba);
            mesh.thinInstanceSetBuffer("color", node.rgbaPack, 4, false);
          } else mesh.thinInstanceSetBuffer("color", rgba, 4, false);
        }
      }
      if (thin) this.thin(node, inst, mesh, g, D);
      else {
        node.empty = false;
        if (fur) this.shells(node, inst, mesh, away, D);
      }
    }
    if (g.drawRange.count !== Infinity && mesh.subMeshes?.length === 1 && !Array.isArray(o.material)) {
      const sm = mesh.subMeshes[0];
      if (entry.indexed) {
        sm.indexStart = g.drawRange.start;
        sm.indexCount = Math.min(g.drawRange.count, g.index!.count - g.drawRange.start);
      } else {
        sm.verticesStart = g.drawRange.start;
        sm.verticesCount = Math.min(g.drawRange.count, g.attributes.position.count - g.drawRange.start);
      }
    }
    // (a shadow is cast from nearer than a thing is drawn)
    this.cast(node, mesh, o.castShadow && (away < 0 || inst.isInstancedMesh || away < shadowReachOf(this.lodR, D) * (node.casts ? 1.15 : 1)));
  }

  // A furry body's shells (the instances of its fur mesh) by distance: all of them near, half of them farther, none beyond
  private shells(node: Node, inst: THREE.InstancedMesh, mesh: Mesh, away: number, D: Detail) {
    const n = away < 0 || away < D.fur[0] ? inst.count : away < D.fur[1] ? Math.ceil(inst.count / 2) : 0;
    mesh.thinInstanceCount = n;
    node.empty = n === 0;
    if (node.empty) mesh.setEnabled(false);
  }

  // A scatter thinned to what is in range: each instance is drawn from the camera to where its size says it is too small to be worth it
  // (`reachOf`), and a scatter with a farther model (`userData.lod`: "near" or "far", siteAssets Instanced) shares its instances with it
  // at `near`. The packed buffers are refilled when the camera has moved a metre and a half, or the scatter has moved.
  private thin(node: Node, inst: THREE.InstancedMesh, mesh: Mesh, g: THREE.BufferGeometry, D: Detail) {
    const cam = this.camera.position;
    const at = (node.packAt ??= new Float32Array([NaN, 0, 0]));
    const moved = (mesh as unknown as { _movedFrame?: number })._movedFrame;
    if (Math.abs(at[0] - cam.x) + Math.abs(at[1] - cam.y) + Math.abs(at[2] - cam.z) < 1.5 && node.packMoved === moved) return;
    at[0] = cam.x;
    at[1] = cam.y;
    at[2] = cam.z;
    node.packMoved = moved;
    const full = inst.instanceMatrix.array as Float32Array;
    const pack = node.pack!;
    const bs = g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere);
    const e = inst.matrixWorld.elements;
    const ws = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
    const band = inst.userData.lod as "near" | "far" | undefined;
    const from = band === "far" ? D.near : 0;
    const to = band === "near" ? D.near : Infinity;
    const rgba = node.rgba, rgbaPack = node.rgbaPack;
    let n = 0;
    for (let i = 0, o = 0; i < inst.count; i++, o += 16) {
      const x = full[o + 12], y = full[o + 13], z = full[o + 14];
      const r = (bs?.radius ?? 1) * Math.hypot(full[o], full[o + 1], full[o + 2]) * ws;
      const d = Math.hypot(e[0] * x + e[4] * y + e[8] * z + e[12] - cam.x, e[1] * x + e[5] * y + e[9] * z + e[13] - cam.y, e[2] * x + e[6] * y + e[10] * z + e[14] - cam.z) - r;
      if (r > HUGE || (d >= from && d < Math.min(to, reachOf(r, D)))) {
        for (let k = 0; k < 16; k++) pack[n * 16 + k] = full[o + k];
        if (rgba && rgbaPack) for (let k = 0; k < 4; k++) rgbaPack[n * 4 + k] = rgba[i * 4 + k];
        n++;
      }
    }
    mesh.thinInstanceCount = n;
    mesh.thinInstanceBufferUpdated("matrix");
    if (rgba && rgbaPack) mesh.thinInstanceBufferUpdated("color");
    node.empty = n === 0;
    if (node.empty) mesh.setEnabled(false);
  }

  private cast(node: Node, mesh: Mesh, casts: boolean) {
    if (node.casts === casts) return;
    node.casts = casts;
    if (casts) this.casters.add(mesh);
    else this.casters.delete(mesh);
    for (const g of this.shadowMaps()) {
      if (casts) g.addShadowCaster(mesh, false);
      else g.removeShadowCaster(mesh, false);
    }
  }
  // The rig's shadow generators: the sun's and the lamp slots'
  private *shadowMaps() {
    if (this.rig?.sunShadow) yield this.rig.sunShadow;
    for (const l of this.rig?.lamps ?? []) yield l.shadow;
  }

  // Points: soft round sprites (or the material's map) each sized as three would, shrinking with distance when in world units
  private syncPoints(o: THREE.Points, visible: boolean) {
    const g = o.geometry;
    if (!g?.attributes.position) return;
    const { node, mesh } = this.meshNode(o, "points", g);
    mesh.setEnabled(visible);
    if (!visible) return;
    this.place(node, o, mesh);
    const m = [o.material].flat()[0] as THREE.PointsMaterial & THREE.ShaderMaterial;
    mesh.renderingGroupId = o.renderOrder < 0 ? 0 : 1;
    mesh.alphaIndex = o.renderOrder;
    mesh.alwaysSelectAsActiveMesh = !o.frustumCulled;
    // (a shader's points, drei's stars among them, are sized by the shader)
    if (m.isShaderMaterial) {
      mesh.material = this.shaderOf(m, true);
      return;
    }
    const color = !!g.attributes.color && m.vertexColors;
    const size = !!g.attributes.size;
    const map = this.texture(m.map);
    const key = `${m.id}|${color}|${size}|${map ? "m" : ""}`;
    let entry = this.points.get(o);
    if (!entry || entry.key !== key) {
      entry?.mat.dispose();
      const defines = [color ? "#define VCOLOR" : "", size ? "#define VSIZE" : "", map ? "#define MAP" : ""].filter(Boolean);
      const mat = new ShaderMaterial(`pt${o.id}`, this.scene, { vertexSource: POINTS_VERTEX, fragmentSource: POINTS_FRAGMENT }, {
        attributes: ["position", ...(color ? ["color"] : []), ...(size ? ["size"] : [])],
        uniforms: ["world", "view", "viewProjection", "pointSize", "scale", "tint", "alpha"],
        samplers: map ? ["map"] : [],
        defines,
        needAlphaBlending: true,
      });
      mat.pointsCloud = true;
      mat.backFaceCulling = false;
      entry = { mat, key };
      this.points.set(o, entry);
      mesh.material = mat;
    }
    const mat = entry.mat;
    if (map) mat.setTexture("map", map);
    // three's sizes: in world units at half the drawing's height a unit away, or in pixels
    const scale = m.sizeAttenuation !== false ? this.engine.getRenderHeight() * 0.5 : 0;
    mat.setFloat("pointSize", m.size ?? 1);
    mat.setFloat("scale", scale);
    mat.setColor3("tint", m.color ? c3(m.color) : new Color3(1, 1, 1));
    mat.setFloat("alpha", m.transparent ? m.opacity ?? 1 : 1);
    mat.alphaMode = m.blending === THREE.AdditiveBlending ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
    mat.disableDepthWrite = !m.depthWrite || m.blending === THREE.AdditiveBlending;
  }

  // Lines (and drei's fat lines, drawn a pixel wide for now)
  private syncLines(o: THREE.Line, visible: boolean) {
    const node = this.nodeOf(o, "lines");
    const g = o.geometry as THREE.BufferGeometry;
    const fat = (o as unknown as { isLineSegments2?: boolean }).isLineSegments2;
    const pos = fat ? (g.attributes as Record<string, THREE.InterleavedBufferAttribute>).instanceStart : g.attributes.position;
    if (!pos) return;
    const sig = `${fat ? "f" : ""}${(pos as THREE.BufferAttribute).version ?? (pos as THREE.InterleavedBufferAttribute).data.version}:${pos.count}:${g.index?.version ?? "-"}`;
    if (!node.mesh || node.lineSig !== sig) {
      node.lineSig = sig;
      node.mesh?.dispose();
      const lines = new LinesMesh(`l${o.id}`, this.scene);
      lines.isPickable = false;
      const points: number[] = [];
      const indices: number[] = [];
      if (fat) {
        const end = (g.attributes as Record<string, THREE.InterleavedBufferAttribute>).instanceEnd;
        for (let i = 0; i < pos.count; i++) {
          points.push(pos.getX(i), pos.getY(i), pos.getZ(i), end.getX(i), end.getY(i), end.getZ(i));
          indices.push(i * 2, i * 2 + 1);
        }
      } else {
        for (let i = 0; i < pos.count; i++) points.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        const count = g.index ? g.index.count : pos.count;
        const at = (i: number) => (g.index ? g.index.getX(i) : i);
        if ((o as THREE.LineSegments).isLineSegments) for (let i = 0; i + 1 < count; i += 2) indices.push(at(i), at(i + 1));
        else {
          for (let i = 0; i + 1 < count; i++) indices.push(at(i), at(i + 1));
          if ((o as THREE.LineLoop).isLineLoop && count > 2) indices.push(at(count - 1), at(0));
        }
      }
      const data = new VertexData();
      data.positions = points;
      data.indices = indices;
      data.applyToMesh(lines);
      node.mesh = lines;
      node.matrix.fill(NaN);
    }
    const lines = node.mesh as LinesMesh;
    lines.setEnabled(visible);
    if (!visible) return;
    this.place(node, o, lines);
    const m = [o.material].flat()[0] as THREE.LineBasicMaterial;
    lines.color = srgb(m.color ?? new THREE.Color(1, 1, 1));
    lines.alpha = m.opacity;
    lines.renderingGroupId = o.renderOrder < 0 ? 0 : 1;
    lines.alwaysSelectAsActiveMesh = !o.frustumCulled;
  }

  // A sprite: a square facing the camera, its map on it
  private syncSprite(o: THREE.Sprite, visible: boolean, camera: THREE.Camera) {
    const node = this.nodeOf(o, "sprite");
    if (!node.mesh) {
      node.mesh = new Mesh(`s${o.id}`, this.scene);
      SPRITE_QUAD.applyToMesh(node.mesh);
      node.mesh.isPickable = false;
      node.mesh.sideOrientation = FRONT;
      this.material(o.material);
      this.mats.get(o.material)!.users++;
      node.material = o.material;
    }
    const mesh = node.mesh;
    mesh.setEnabled(visible && o.material.visible);
    if (!visible) return;
    mesh.material = this.material(o.material);
    // World position and scale from the sprite, turned to face the camera
    const e = o.matrixWorld.elements;
    const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]);
    const r = camera.matrixWorld.elements;
    const m = [r[0] * sx, r[1] * sx, r[2] * sx, 0, r[4] * sy, r[5] * sy, r[6] * sy, 0, r[8], r[9], r[10], 0, e[12], e[13], e[14], 1];
    if (!sameMatrix(node.matrix, m)) {
      node.matrix.set(m);
      Matrix.FromArrayToRef(m, 0, node.world);
      mesh.freezeWorldMatrix(node.world);
    }
    mesh.renderingGroupId = o.renderOrder < 0 ? 0 : 1;
    mesh.alphaIndex = o.renderOrder;
    mesh.alwaysSelectAsActiveMesh = true;
  }

  // drei's Text (troika): its words drawn on a card, in the plane of the text, as big as troika would set them
  private syncText(o: THREE.Mesh & { text: string; fontSize: number; color: unknown; anchorX: unknown; anchorY: unknown; outlineWidth: unknown; outlineColor: unknown }, visible: boolean) {
    const node = this.nodeOf(o, "text");
    const color = new THREE.Color((o.color as THREE.ColorRepresentation) ?? "#ffffff").getStyle();
    const outline = typeof o.outlineWidth === "number" ? o.outlineWidth : 0;
    const outlineColor = new THREE.Color((o.outlineColor as THREE.ColorRepresentation) ?? 0).getStyle();
    const label = `${o.text}|${o.fontSize}|${color}|${outline}|${outlineColor}|${o.anchorX}|${o.anchorY}`;
    if (!node.mesh || node.label !== label) {
      if (node.label) this.releaseCard(node.label);
      node.label = label;
      node.mesh?.dispose();
      const card = this.cardOf(o, label, color, outline, outlineColor);
      card.users++;
      const mesh = new Mesh(`t${o.id}`, this.scene);
      card.quad.applyToMesh(mesh);
      mesh.sideOrientation = FRONT;
      mesh.material = card.mat;
      mesh.isPickable = false;
      node.mesh = mesh;
      node.matrix.fill(NaN);
    }
    node.mesh.setEnabled(visible);
    if (!visible) return;
    this.place(node, o, node.mesh);
    node.mesh.renderingGroupId = 1;
    node.mesh.alphaIndex = 50 + o.renderOrder;
  }
  // A label's words drawn on a card, kept by what it says and how (a room's signs are drawn again each time it is entered: 2.5 ms each)
  private cardOf(o: THREE.Mesh & { text: string; fontSize: number; anchorX: unknown; anchorY: unknown }, label: string, color: string, outline: number, outlineColor: string) {
    let card = this.cards.get(label);
    if (card) return card;
    const lines = o.text.split("\n");
    const px = 48;
    const pad = Math.ceil((outline / o.fontSize) * px) + 2;
    const probe = PROBE.getContext("2d")!;
    probe.font = `600 ${px}px Inter, sans-serif`;
    const width = Math.ceil(Math.max(1, ...lines.map((l) => probe.measureText(l).width))) + pad * 2;
    const height = Math.ceil(lines.length * px * 1.2) + pad * 2;
    const tex = new DynamicTexture(`t${o.id}`, { width, height }, this.scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `600 ${px}px Inter, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    lines.forEach((l, i) => {
      const y = pad + (i + 0.5) * px * 1.2;
      if (outline) {
        ctx.lineWidth = (outline / o.fontSize) * px * 2;
        ctx.strokeStyle = outlineColor;
        ctx.lineJoin = "round";
        ctx.strokeText(l, width / 2, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(l, width / 2, y);
    });
    tex.update(true);
    const w = (width / px) * o.fontSize, h = (height / px) * o.fontSize;
    const ox = o.anchorX === "left" ? w / 2 : o.anchorX === "right" ? -w / 2 : 0;
    const oy = o.anchorY === "top" ? -h / 2 : o.anchorY === "bottom" || o.anchorY === "bottom-baseline" ? h / 2 : 0;
    const quad = new VertexData();
    quad.positions = [ox - w / 2, oy - h / 2, 0, ox + w / 2, oy - h / 2, 0, ox + w / 2, oy + h / 2, 0, ox - w / 2, oy + h / 2, 0];
    quad.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    quad.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    quad.indices = [0, 1, 2, 0, 2, 3];
    const mat = new PBRMaterial(`tm${o.id}`, this.scene);
    mat.unlit = true;
    mat.albedoTexture = tex;
    mat.useAlphaFromAlbedoTexture = true;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.imageProcessingConfiguration = this.noToneMapping;
    card = { mat, quad, users: 0, idle: 0 };
    this.cards.set(label, card);
    return card;
  }
  private releaseCard(label: string) {
    const card = this.cards.get(label);
    if (card && --card.users <= 0) card.idle = this.frame;
  }

  // ---- Lights: one rig, whatever three's scene holds ----

  // Babylon compiles a material's shader for the lights that reach it (how many, of what kind, which cast shadows). three's scenes bring
  // their own and take them away (a room its ambient, a key light and lamps), and each change made Babylon compile every material in
  // sight again: walking into a palace room, 87 new shaders and frames of up to 1.5 s (measured 2026-11-01). So the Babylon scene has one
  // set of lights, made once, that three's lights are poured into each frame (`lightUp`), and a shader made once serves every room:
  // - the sky: every ambient and hemisphere light summed (each is the same from every side but up and down, so they add up exactly);
  // - SUNS directional lights, the one casting shadows first; its shadow generator is kept while the tier gives one, idle when nothing casts;
  // - the tier's lamp slots for the nearest lamps that cast shadows (unused: dark, their maps idle);
  // - every other point and spot light, and a shadow lamp left without a slot, in one clustered light; where the device cannot cluster,
  //   and for a light with no falloff (which clustering cannot draw), a light of its own as before: those scenes compile as they change.
  private makeRig(): Rig {
    const s = shadowSettings();
    const scene = this.scene;
    const shadows = this.owner.shadowMap.enabled && EFFECTS.shadows !== "off";
    const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
    sky.specular.set(0, 0, 0);
    const suns: DirectionalLight[] = [];
    for (let i = 0; i < SUNS; i++) {
      const d = new DirectionalLight(`sun${i}`, new Vector3(0, -1, 0), scene);
      d.intensity = 0;
      suns.push(d);
    }
    const lamps: Rig["lamps"] = [];
    if (shadows) {
      for (let i = 0; i < s.lamps; i++) {
        const light = new PointLight(`lamp${i}`, Vector3.Zero(), scene);
        light.intensity = 0;
        const shadow = new ShadowGenerator(512, light);
        shadow.usePoissonSampling = true;
        // (a lamp's depth is measured over the light's own shadowMinZ..MaxZ, the camera's 0.05..1000 by default: a bias of 0.004 was
        // then 4 m and every shadow began that far from what cast it, 2026-11-03; lightUp sets MaxZ to the lamp's reach)
        shadow.bias = 0.003;
        shadow.normalBias = 0.02;
        light.shadowMinZ = 0.1;
        light.shadowMaxZ = 16;
        const slot: Rig["lamps"][number] = { light, shadow };
        // (only what is within its reach and not too small to show, a hand-span: all six faces share the list, made once a frame; nothing
        // while the slot is unused)
        const near: AbstractMesh[] = [];
        let made = -1;
        shadow.getShadowMap()!.getCustomRenderList = (_face, list, count) => {
          if (!list) return null;
          if (made !== this.frame) {
            made = this.frame;
            near.length = 0;
            if (slot.source) {
              const reach = lampReach(slot.source);
              for (let k = 0; k < count; k++) {
                const b = list[k].getBoundingInfo().boundingSphere;
                // (what is not small, or moves: a street's scatter of stones and tufts casts nothing the eye misses, and was most of the map's cost)
                const moved = this.frame - ((list[k] as unknown as { _movedFrame?: number })._movedFrame ?? -99) <= 2;
                // (nor an instanced scatter, whose bounds take in every instance of the district: its stones and trees were each drawn six times)
                if ((b.radiusWorld > 0.3 || (moved && b.radiusWorld > 0.08)) && b.radiusWorld < 20 && Vector3.Distance(b.centerWorld, light.position) - b.radiusWorld < reach) near.push(list[k]);
              }
            }
          }
          return near;
        };
        lamps.push(slot);
      }
    }
    let cluster: ClusteredLightContainer | null = new ClusteredLightContainer("lamps", [], scene);
    if (!cluster.isSupported) {
      cluster.dispose();
      cluster = null;
    }
    const rig: Rig = { sky, suns, lamps, cluster, shadows, casting: false, pool: { point: [], spot: [] } };
    if (shadows) rig.sunShadow = this.makeSunShadow(suns[0], s);
    for (const g of [rig.sunShadow, ...lamps.map((l) => l.shadow)]) if (g) for (const mesh of this.casters) g.addShadowCaster(mesh, false);
    for (const entry of this.mats.values()) if (entry.mat) entry.mat.maxSimultaneousLights = this.lightCount(rig);
    for (const look of this.looks.values()) look.mat.maxSimultaneousLights = this.lightCount(rig);
    return rig;
  }
  // Every light of the rig reaches every material (and, where lamps cannot be clustered, as many of them as the tier gives)
  private lightCount(rig = this.rig) {
    return Math.max(rig ? 1 + SUNS + rig.lamps.length + (rig.cluster ? 1 : 0) : 0, shadowSettings().lights);
  }
  private dropRig() {
    const rig = this.rig;
    if (!rig) return;
    rig.sunShadow?.dispose();
    for (const l of rig.lamps) l.shadow.dispose();
    for (const l of [rig.sky, ...rig.suns, ...rig.lamps.map((l) => l.light)]) l.dispose();
    // (the clustered lamps go with their container; their nodes make them again)
    for (const [o, node] of this.nodes) if (node.clustered) this.drop(o, node);
    rig.cluster?.dispose();
    this.rig = undefined;
  }

  // The sun's shadows: cascades that follow the camera, finer near it
  private makeSunShadow(light: DirectionalLight, s: ReturnType<typeof shadowSettings>): ShadowGenerator {
    // (an engine that cannot draw cascades, WebGL 1, gets one map over the casters, as three had)
    if (!CascadedShadowGenerator.IsSupported) {
      const plain = new ShadowGenerator(s.size, light);
      plain.usePercentageCloserFiltering = true;
      plain.filteringQuality = s.quality;
      plain.bias = 0.002;
      plain.normalBias = 0.015;
      light.autoUpdateExtends = true;
      const all = plain.getShadowMap()!;
      all.getCustomRenderList = (_layer, list) => (this.rig?.casting || !list ? null : NOTHING);
      return plain;
    }
    const gen = new CascadedShadowGenerator(s.size, light);
    gen.numCascades = s.cascades;
    gen.lambda = 0.85;
    gen.stabilizeCascades = true;
    gen.shadowMaxZ = Math.min(this.camera.maxZ || 200, 120);
    gen.usePercentageCloserFiltering = true;
    gen.filteringQuality = s.quality;
    gen.bias = 0.002;
    gen.normalBias = 0.015;
    gen.cascadeBlendPercentage = 0.08;
    // Each cascade draws only what lies across it (Babylon draws every caster into every one), and the far ones leave out what is too
    // small to show in them (under a 150th of their width); nothing while no sun casts
    const planes = Frustum.GetPlanes(Matrix.Identity());
    const lists: AbstractMesh[][] = [];
    gen.getShadowMap()!.getCustomRenderList = (layer, list, count) => {
      if (!this.rig?.casting) return NOTHING;
      const m = gen.getCascadeTransformMatrix(layer), proj = gen.getCascadeProjectionMatrix(layer);
      if (!m || !proj || !list) return null;
      Frustum.GetPlanesToRef(m, planes);
      const least = layer === 0 ? 0 : 2 / Math.abs(proj.m[0]) / 150;
      const out = (lists[layer] ??= []);
      out.length = 0;
      // (the planes beside the cascade only: what stands between it and the sun still casts into it)
      next: for (let i = 0; i < count; i++) {
        const b = list[i].getBoundingInfo().boundingSphere;
        if (b.radiusWorld < least) continue;
        for (let p = 2; p < 6; p++) if (planes[p].dotCoordinate(b.centerWorld) <= -b.radiusWorld) continue next;
        out.push(list[i]);
      }
      return out;
    };
    return gen;
  }

  // A three light, this frame: summed into the sky, kept for a sun or a lamp slot, or set on its clustered (or own) light
  private syncLight(l: THREE.Light, visible: boolean) {
    const point = l as THREE.PointLight, spot = l as THREE.SpotLight, hemi = l as THREE.HemisphereLight;
    if (!visible || l.intensity <= 0) {
      // (a light of its own or in the cluster stays made, dark, while three hides it)
      const node = this.nodes.get(l);
      if (node?.light) {
        node.frame = this.frame;
        if (node.clustered) node.light.intensity = 0;
        else if (node.light.isEnabled(false)) node.light.setEnabled(false);
      }
      return;
    }
    if (hemi.isHemisphereLight || (l as THREE.AmbientLight).isAmbientLight) {
      const k = l.intensity * AMBIENT;
      const ground = hemi.isHemisphereLight ? hemi.groundColor : l.color;
      this.skyNow.r += l.color.r * k;
      this.skyNow.g += l.color.g * k;
      this.skyNow.b += l.color.b * k;
      this.groundNow.r += ground.r * k;
      this.groundNow.g += ground.g * k;
      this.groundNow.b += ground.b * k;
      return;
    }
    if ((l as THREE.DirectionalLight).isDirectionalLight) {
      this.sunsNow.push(l as THREE.DirectionalLight);
      return;
    }
    if (!point.isPointLight && !spot.isSpotLight) return;
    if (point.isPointLight && point.castShadow && this.rig?.lamps.length) this.shadowLampsNow.push(point);
    const node = this.nodeOf(l, "light");
    const clusterable = !!this.rig?.cluster && point.decay !== 0;
    if (!node.light) {
      // (a clustered light is taken from the rig's pool and given back when three's light goes: making one goes through every mesh in the
      // scene twice, adding it and taking it out again for the cluster, 3 ms a lamp in a palace room)
      const pool = this.rig?.pool[spot.isSpotLight ? "spot" : "point"];
      node.light = (clusterable && pool?.pop()) || (spot.isSpotLight ? new SpotLight(`s${l.id}`, Vector3.Zero(), new Vector3(0, -1, 0), 1, 1, this.scene) : new PointLight(`p${l.id}`, Vector3.Zero(), this.scene));
      if (clusterable) node.light.falloffType = Light.FALLOFF_DEFAULT;
      if (clusterable && !(node.light as unknown as { _clusteredContainer?: unknown })._clusteredContainer) this.rig!.cluster!.addLight(node.light);
      node.clustered = clusterable;
    }
    const light = node.light as PointLight | SpotLight;
    if (!node.clustered && !light.isEnabled(false)) light.setEnabled(true);
    light.intensity = l.intensity;
    c3(l.color, light.diffuse);
    const e = l.matrixWorld.elements;
    light.position.set(e[12], e[13], e[14]);
    light.range = point.distance > 0 ? point.distance : Number.MAX_VALUE;
    if (!node.clustered) light.falloffType = point.decay === 0 ? Light.FALLOFF_STANDARD : Light.FALLOFF_PHYSICAL;
    if (light instanceof SpotLight) {
      spot.target.updateMatrixWorld();
      const t = spot.target.matrixWorld.elements;
      light.direction.set(t[12] - e[12], t[13] - e[13], t[14] - e[14]).normalize();
      light.angle = spot.angle * 2;
      light.exponent = 1 + (1 - spot.penumbra) * 4;
    }
  }

  // The frame's lights into the rig, once three's scene has been walked
  private lightUp() {
    const rig = this.rig!;
    rig.sky.diffuse.copyFrom(this.skyNow);
    rig.sky.groundColor.copyFrom(this.groundNow);
    // The suns: the one casting shadows first, then the brightest (more than SUNS: the faintest left out)
    const suns = this.sunsNow.sort((a, b) => Number(b.castShadow) - Number(a.castShadow) || b.intensity - a.intensity);
    for (let i = 0; i < SUNS; i++) {
      const d = rig.suns[i], l = suns[i];
      if (!l) {
        d.intensity = 0;
        continue;
      }
      d.intensity = l.intensity;
      c3(l.color, d.diffuse);
      this.daylight = Math.max(this.daylight, l.intensity);
      const e = l.matrixWorld.elements;
      l.target.updateMatrixWorld();
      const t = l.target.matrixWorld.elements;
      d.position.set(e[12], e[13], e[14]);
      d.direction.set(t[12] - e[12], t[13] - e[13], t[14] - e[14]).normalize();
    }
    const casting = !!rig.sunShadow && !!suns[0]?.castShadow;
    if (casting !== rig.casting) {
      rig.casting = casting;
      // (an idle map is drawn once more, empty, and then left)
      rig.sunShadow!.getShadowMap()!.refreshRate = casting ? 1 : 0;
    }
    // The lamps that cast shadows: the nearest take the slots, and are dark in the cluster meanwhile
    const at = this.camera.position;
    const near = this.shadowLampsNow.sort((a, b) => dist2(a, at) - dist2(b, at));
    rig.lamps.forEach((slot, i) => {
      const l = near[i];
      const was = slot.source;
      slot.source = l;
      if (!l) {
        slot.light.intensity = 0;
        if (was) slot.shadow.getShadowMap()!.refreshRate = 0;
        slot.mode = undefined;
        return;
      }
      slot.light.intensity = l.intensity;
      c3(l.color, slot.light.diffuse);
      const e = l.matrixWorld.elements;
      slot.light.position.set(e[12], e[13], e[14]);
      slot.light.range = l.distance > 0 ? l.distance : Number.MAX_VALUE;
      slot.light.shadowMaxZ = l.distance > 0 ? l.distance + 2 : 16;
      // Its six faces are drawn every frame while anything that casts a shadow within its reach moves (a figure walking past: drawn every other
      // frame the figure was shadowed by where it had been, and its textures flickered with the lag, 2026-11-03, the user), and once when
      // nothing does, or when it is given another lamp (the map cost 30 ms a frame on an HD 530, and a street of still things needs none)
      const reach = lampReach(l);
      let moving = false;
      for (const m of this.casters) {
        if (this.frame - ((m as unknown as { _movedFrame?: number })._movedFrame ?? -99) > 2) continue;
        const b = m.getBoundingInfo().boundingSphere;
        if (Vector3.Distance(b.centerWorld, slot.light.position) - b.radiusWorld < reach) {
          moving = true;
          break;
        }
      }
      const mode = moving ? 1 : 0;
      if (!was || was !== l || slot.mode !== mode) {
        slot.shadow.getShadowMap()!.refreshRate = mode;
        slot.mode = mode;
      }
      const own = this.nodes.get(l)?.light;
      if (own) own.intensity = 0;
    });
  }
}

const SUNS = 3;
// How far a lamp's shadows are drawn: what is lit by it, but not past 8 m (its light has little left there)
const LAMP_SHADOW_REACH = 8;
const lampReach = (l: THREE.PointLight) => (l.distance > 0 ? Math.min(l.distance, LAMP_SHADOW_REACH) : LAMP_SHADOW_REACH);
// (a shadow map's list when it is to draw nothing)
const NOTHING: AbstractMesh[] = [];
const dist2 = (l: THREE.Object3D, at: Vector3) => {
  const e = l.matrixWorld.elements;
  return (e[12] - at.x) ** 2 + (e[13] - at.y) ** 2 + (e[14] - at.z) ** 2;
};
interface Rig {
  sky: HemisphericLight;
  suns: DirectionalLight[];
  sunShadow?: ShadowGenerator;
  lamps: { light: PointLight; shadow: ShadowGenerator; source?: THREE.PointLight; mode?: number }[];
  cluster: ClusteredLightContainer | null;
  // the clustered lights three no longer uses, dark, for the next ones
  pool: { point: PointLight[]; spot: SpotLight[] };
  // made with shadows (the canvas's and the tier's), and whether a sun casts them now
  shadows: boolean;
  casting: boolean;
}

// The points' own shader: three draws points as sprites sized in the vertex shader, which Babylon's materials do not
const POINTS_VERTEX = `precision highp float;
attribute vec3 position;
#ifdef VCOLOR
attribute vec4 color;
#endif
#ifdef VSIZE
attribute float size;
#endif
uniform mat4 world;
uniform mat4 view;
uniform mat4 viewProjection;
uniform float pointSize;
uniform float scale;
varying vec3 vColor;
void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  gl_Position = viewProjection * wp;
  float s = pointSize;
#ifdef VSIZE
  s *= size;
#endif
  gl_PointSize = scale > 0.0 ? s * scale / max(-(view * wp).z, 0.1) : s;
#ifdef VCOLOR
  vColor = color.rgb;
#else
  vColor = vec3(1.0);
#endif
}`;
const POINTS_FRAGMENT = `precision highp float;
uniform vec3 tint;
uniform float alpha;
#ifdef MAP
uniform sampler2D map;
#endif
varying vec3 vColor;
void main(void) {
#ifdef MAP
  vec4 t = texture2D(map, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y));
#else
  vec4 t = vec4(1.0, 1.0, 1.0, 1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5)));
#endif
  vec3 c = tint * vColor * t.rgb;
  gl_FragColor = vec4(pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)), alpha * t.a);
}`;
const PROBE = typeof document !== "undefined" ? document.createElement("canvas") : (null as unknown as HTMLCanvasElement);
// A unit square about its middle (three's sprites are centred)
const SPRITE_QUAD = (() => {
  const q = new VertexData();
  q.positions = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
  q.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  q.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  q.indices = [0, 1, 2, 0, 2, 3];
  return q;
})();

// ---- The renderer R3F is given -------------------------------------------------------------------------------------------------------

// While the dice table (ui/dice.tsx) covers the whole screen, every other canvas keeps its last picture instead of drawing again under it:
// on an HD 530 the map behind took more of the frame than the dice (2026-11-03). Its frame hooks still run.
export const COVER = { by: null as BabylonRenderer | null };

export class BabylonRenderer {
  readonly domElement: HTMLCanvasElement;
  readonly engine: Engine;
  // What R3F and the scenes set on three's renderer
  shadowMap = { enabled: false, type: THREE.PCFSoftShadowMap as THREE.ShadowMapType, autoUpdate: true, needsUpdate: false };
  toneMapping: THREE.ToneMapping = THREE.ACESFilmicToneMapping;
  toneMappingExposure = 1;
  outputColorSpace: THREE.ColorSpace = THREE.SRGBColorSpace;
  autoClear = true;
  // the full look (Mirror.look) where the tier allows; a small canvas turns it off
  look = true;
  // While a district is got ready behind its loading screen (LocalMap, BuildingScene): everything in the scene is drawn, in view or not,
  // so that each shader is compiled and each map is on the card before the party sees it (see `prepared`)
  preparing = false;
  clearColor = new Color3(0, 0, 0);
  clearAlpha = 0;
  info = { autoReset: true, render: { frame: 0, calls: 0, triangles: 0, points: 0, lines: 0 }, memory: { geometries: 0, textures: 0 }, programs: null, reset() {} };
  capabilities = { isWebGL2: true, getMaxAnisotropy: () => 4, maxTextures: 16, precision: "highp" };
  private mirrors = new Map<THREE.Scene, Mirror>();
  // Where a frame's time goes, in milliseconds (a running average): the three scene's matrix update, the mirror's sync into Babylon, and
  // Babylon's draw (its culling and the GL calls); the game's own frame hooks run before this. For the console: `__babylon.timing`
  timing = { update: 0, sync: 0, draw: 0 };
  private pixelRatio = 1;
  private width = 1;
  private height = 1;

  // (the tests pass an engine of their own: Babylon's NullEngine, which draws nothing)
  constructor(canvas: HTMLCanvasElement, engine?: Engine) {
    this.domElement = canvas;
    this.engine = engine ?? new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "default", audioEngine: false, alpha: true } as never, false);
    // A moving figure's shadow is drawn with its material's own shader (ShadowDepthWrapper), which Babylon names with a random token for
    // each figure and each shadow it falls in, so its shader cache never finds the last one: walking into a palace room compiled 257 of
    // them, 8 of them different (2026-11-01). Named by their source instead, the same shader is compiled once
    const make = this.engine.createEffect.bind(this.engine);
    this.engine.createEffect = ((base: unknown, ...rest: unknown[]) => {
      const b = base as { vertexSource?: string; fragmentSource?: string; vertexToken?: string };
      if (b && typeof b === "object" && b.vertexToken && b.vertexSource !== undefined) {
        const token = sourceName(`${b.vertexSource}\u0000${b.fragmentSource ?? ""}`);
        base = { ...b, vertexToken: token, fragmentToken: token };
      }
      return (make as (...a: unknown[]) => ReturnType<Engine["createEffect"]>)(base, ...rest);
    }) as Engine["createEffect"];
    if (engine) this.look = false;
    else {
      const gpu = this.engine.getGlInfo().renderer;
      if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) SOFTWARE.on = true;
      else if (/intel/i.test(gpu) && !/\barc\b/i.test(gpu)) INTEGRATED.on = true;
    }
    RENDERERS.add(this);
    // The last one made, for looking into from the console and the tests
    if (typeof window !== "undefined") (window as unknown as { __babylon?: BabylonRenderer }).__babylon = this;
  }
  // Whether everything drawn last frame was ready to draw (its shaders compiled); a renderer drawing in software is never got ready
  prepared() {
    for (const m of this.mirrors.values()) if (!m.ready()) return false;
    return true;
  }
  get software() {
    return SOFTWARE.on;
  }
  // The Babylon scene a three scene is drawn into (for the tests)
  mirrorOf(scene: THREE.Scene) {
    return this.mirrors.get(scene)?.scene;
  }

  getContext() {
    return this.engine._gl;
  }
  getPixelRatio() {
    return this.pixelRatio;
  }
  setPixelRatio(dpr: number) {
    this.pixelRatio = dpr;
    this.setSize(this.width, this.height, false);
  }
  getSize(target: THREE.Vector2) {
    return target.set(this.width, this.height);
  }
  getDrawingBufferSize(target: THREE.Vector2) {
    return target.set(Math.floor(this.width * this.pixelRatio), Math.floor(this.height * this.pixelRatio));
  }
  setSize(width: number, height: number, updateStyle = true) {
    this.width = width;
    this.height = height;
    if (updateStyle) {
      this.domElement.style.width = `${width}px`;
      this.domElement.style.height = `${height}px`;
    }
    this.engine.setHardwareScalingLevel(1 / this.pixelRatio);
    this.engine.setSize(Math.max(1, Math.floor(width * this.pixelRatio)), Math.max(1, Math.floor(height * this.pixelRatio)));
  }
  setClearColor(color: THREE.ColorRepresentation, alpha = 1) {
    this.clearColor = srgb(new THREE.Color(color));
    this.clearAlpha = alpha;
  }
  getClearColor(target: THREE.Color) {
    return target.setRGB(this.clearColor.r, this.clearColor.g, this.clearColor.b, THREE.SRGBColorSpace);
  }
  getClearAlpha() {
    return this.clearAlpha;
  }
  clear() {
    this.engine.clear(new Color4(this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearAlpha), true, true, true);
  }
  clearDepth() {
    this.engine.clear(null, false, true, true);
  }
  retier() {
    for (const m of this.mirrors.values()) m.retier();
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.engine.isDisposed || (COVER.by && COVER.by !== this)) return;
    const t0 = performance.now();
    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
    if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
    let mirror = this.mirrors.get(scene);
    if (!mirror) {
      mirror = new Mirror(this.engine, this);
      this.mirrors.set(scene, mirror);
    }
    const t1 = performance.now();
    mirror.sync(scene, camera);
    const t2 = performance.now();
    this.engine.beginFrame();
    mirror.scene.render();
    this.engine.endFrame();
    const t3 = performance.now();
    this.timing.update += (t1 - t0 - this.timing.update) * 0.1;
    this.timing.sync += (t2 - t1 - this.timing.sync) * 0.1;
    this.timing.draw += (t3 - t2 - this.timing.draw) * 0.1;
    const r = this.info.render;
    r.frame++;
    r.calls = mirror.instrumentation.drawCallsCounter.current;
    r.triangles = Math.round(mirror.scene.getActiveIndices() / 3);
    this.info.memory.geometries = mirror.scene.geometries.length;
    this.info.memory.textures = mirror.scene.textures.length;
  }

  compile() {}
  forceContextLoss() {
    this.dispose();
  }
  dispose() {
    if (COVER.by === this) COVER.by = null;
    RENDERERS.delete(this);
    for (const m of this.mirrors.values()) m.dispose();
    this.mirrors.clear();
    this.engine.dispose();
  }
}

// `<Canvas gl={babylonGl}>`: R3F hands it the canvas and draws through what it returns
export const babylonGl = (canvas: HTMLCanvasElement | OffscreenCanvas) => new BabylonRenderer(canvas as HTMLCanvasElement) as unknown as THREE.WebGLRenderer;
