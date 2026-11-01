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
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
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
  for (int s = 0; s < 3; s++) { if (pa < 0) break; ${point ? `${v} = uP[pa].xyz + lqTurn(uQ[pa], ${v} - uP[pa].xyz);` : `${v} = lqTurn(uQ[pa], ${v});`} pa = lqParent(pa); }
} }`;
    return {
      CUSTOM_VERTEX_DEFINITIONS: `attribute float limb;\nattribute vec3 pivot;\nvec3 lqTurn(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }\nint lqParent(int i) { ${parents} return -1; }`,
      CUSTOM_VERTEX_UPDATE_POSITION: chain(true, "positionUpdated"),
      CUSTOM_VERTEX_UPDATE_NORMAL: chain(false, "normalUpdated"),
    };
  }
}

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
  | { kind: "waves"; time: { value: number } };
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
interface GeoEntry { geo: Geometry; sig: unknown[]; users: number; frame: number; gone: boolean; indexed: boolean; colors: number }
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
interface MatEntry { mat: PBRMaterial; version: number; frame: number; users: number; gone: boolean; maps: unknown[] }
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
  material?: THREE.Material | THREE.Material[];
  frame: number;
  casts?: boolean;
  instances?: number;
  colors?: number;
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
  private packs = new Map<string, Texture>();
  private frame = 0;
  private stack: THREE.Object3D[] = [];
  private shownStack: boolean[] = [];
  private sun?: { light: DirectionalLight; shadow: ShadowGenerator };
  private casters = new Set<Mesh>();
  private noToneMapping: ImageProcessingConfiguration;
  private lampShadows = 0;
  // The look on full detail (see look): the sky's reflections, bloom, contact shadows; and the lamps gathered into one clustered light
  private probe?: ReflectionProbe;
  private pipeline?: DefaultRenderingPipeline;
  private ssao?: SSAO2RenderingPipeline;
  private lamps?: ClusteredLightContainer | null;
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
  }

  dispose() {
    this.scene.dispose();
  }

  retier() {
    const s = shadowSettings();
    if (this.sun) {
      this.sun.shadow.dispose();
      this.sun = undefined;
    }
    for (const node of this.nodes.values()) if (node.shadow && node.kind === "light" && !(node.light instanceof DirectionalLight)) { node.shadow.dispose(); node.shadow = undefined; }
    this.lampShadows = 0;
    for (const entry of this.mats.values()) entry.mat.maxSimultaneousLights = s.lights;
    for (const node of this.nodes.values()) node.casts = undefined;
    this.plain();
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

  // Lamps by the hundred (street lamps after dark: siteAssets.tsx LampLights) are lit together, clustered by where they fall on the screen,
  // so a street of them costs about one light (none where the device cannot cluster: they are then lights of their own)
  private cluster(): ClusteredLightContainer | null {
    if (this.lamps === undefined) {
      const c = new ClusteredLightContainer("lamps", [], this.scene);
      this.lamps = c.isSupported ? c : null;
      if (!this.lamps) c.dispose();
    }
    return this.lamps;
  }

  // ---- Each frame ----

  sync(scene: THREE.Scene, camera: THREE.Camera) {
    this.frame++;
    this.daylight = 0;
    this.syncScene(scene);
    this.syncCamera(camera);
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
    // What has left the scene goes
    for (const [o, node] of this.nodes) if (node.frame !== this.frame) this.drop(o, node);
    for (const [g, entry] of this.geos) if (entry.users <= 0 && (entry.gone || this.frame - entry.frame > IDLE_GEOMETRY)) { entry.geo.dispose(); this.geos.delete(g); }
    for (const [m, entry] of this.mats) if (entry.users <= 0 && entry.gone) { entry.mat.dispose(); this.mats.delete(m); }
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
    Matrix.FromArrayToRef(e, 0, node.world);
    target.freezeWorldMatrix(node.world);
    (target as unknown as { _worldMatrixDeterminantIsDirty: boolean })._worldMatrixDeterminantIsDirty = true;
  }

  private drop(o: THREE.Object3D, node: Node) {
    if (node.mesh) {
      this.casters.delete(node.mesh);
      if (this.sun) this.sun.shadow.removeShadowCaster(node.mesh, false);
      // (Mesh.dispose disposes its geometry with the last mesh using it; a cached one is kept for the next scene, and freed by `sync`)
      if (node.geometry) node.mesh.geometry?.releaseForMesh(node.mesh, false);
      node.mesh.dispose(false, node.kind === "text");
    }
    if (node.shadow && !(node.light instanceof DirectionalLight)) {
      node.shadow.dispose();
      this.lampShadows--;
    }
    if (node.light) {
      if (node.clustered) this.lamps?.removeLight(node.light);
      if (this.sun && this.sun.light === node.light) {
        this.sun.shadow.dispose();
        this.sun = undefined;
      }
      node.light.dispose();
    }
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
      entry = { geo: new Geometry(`g${g.id}`, this.scene, undefined, true), sig: [], users, frame: 0, gone: false, indexed: !!g.index, colors: 0 };
      this.geos.set(g, entry);
      const e = entry;
      g.addEventListener("dispose", () => { e.gone = true; });
    }
    const geo = entry.geo;
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
    entry.colors = color ? color.itemSize : 0;
    if (color) geo.setVerticesData(VertexBuffer.ColorKind, floats(color), true, color.itemSize);
    for (const [name, attr] of Object.entries(g.attributes)) {
      if (["position", "normal", "uv", "color", "uv1", "uv2", "tangent"].includes(name)) continue;
      geo.setVerticesData(name, floats(attr), true, attr.itemSize);
    }
    entry.indexed = !!g.index;
    if (g.index) geo.setIndices(g.index.array as Uint32Array, pos?.count, true);
    entry.sig = geometrySig(g);
    return entry;
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

  private texture(t: THREE.Texture | null | undefined): Texture | null {
    if (!t) return null;
    const image = t.image as (HTMLImageElement & { data?: ArrayBufferView; width: number; height: number }) | undefined;
    if (!image || !image.width || (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement && !image.complete)) return null;
    let entry = this.texs.get(t);
    if (entry && entry.version === t.version) return entry.tex;
    const engine = this.engine;
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
      if (!entry || entry.tex.getSize().width !== image.width || entry.tex.getSize().height !== image.height) {
        entry?.tex.dispose();
        const tex = new Texture(null, this.scene, !mips, t.flipY, sampling);
        (tex as unknown as { _texture: unknown })._texture = engine.createDynamicTexture(image.width, image.height, mips, sampling);
        entry = { tex, version: 0, users: 0 };
        this.texs.set(t, entry);
        const e = entry, map = this.texs;
        t.addEventListener("dispose", () => { e.tex.dispose(); map.delete(t); });
      }
      engine.updateDynamicTexture((entry.tex as unknown as { _texture: never })._texture, image as unknown as HTMLCanvasElement, t.flipY, false);
    }
    settle(entry.tex, t);
    entry.version = t.version;
    return entry.tex;
  }

  // A normal map with its height map in the alpha, where Babylon's parallax reads the height (made once a pair; none while either is
  // a flat stand-in or still loading)
  private packed(normal: THREE.Texture | null | undefined, height: THREE.Texture | null): Texture | null {
    type Img = CanvasImageSource & { width: number; height: number; complete?: boolean };
    const n = normal?.image as Img | undefined, h = height?.image as Img | undefined;
    if (!normal || !height || (normal as THREE.DataTexture).isDataTexture || (height as THREE.DataTexture).isDataTexture) return null;
    if (!n?.width || !h?.width || n.complete === false || h.complete === false || typeof document === "undefined") return null;
    const key = `${normal.id}:${normal.version}|${height.id}:${height.version}`;
    let tex = this.packs.get(key);
    if (!tex) {
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
      tex = new RawTexture(new Uint8Array(data.buffer), w, hh, Constants.TEXTUREFORMAT_RGBA, this.scene, true, normal.flipY, Texture.TRILINEAR_SAMPLINGMODE);
      this.packs.set(key, tex);
      normal.addEventListener("dispose", () => { tex!.dispose(); this.packs.delete(key); });
    }
    settle(tex, normal);
    return tex;
  }

  // ---- Materials ----

  private material(m: THREE.Material, colors: number): PBRMaterial {
    let entry = this.mats.get(m);
    if (!entry) {
      const mat = new PBRMaterial(`m${m.id}`, this.scene);
      mat.enableSpecularAntiAliasing = true;
      mat.maxSimultaneousLights = shadowSettings().lights;
      // three's diffuse is Lambert's (Babylon's own darkens a rough surface)
      mat.brdf.baseDiffuseModel = Constants.MATERIAL_DIFFUSE_MODEL_LAMBERT;
      entry = { mat, version: -1, frame: 0, users: 0, gone: false, maps: [] };
      this.mats.set(m, entry);
      const e = entry;
      m.addEventListener("dispose", () => { e.gone = true; });
      const patch = PATCHES.get(m);
      if (patch) this.plugin(mat, patch);
      const parents = m.userData.limbParents as number[] | undefined;
      if (parents && m.userData.pose) {
        new LimbPlugin(mat, m, parents);
        // its shadow falls as it stands (the shadow maps are drawn with the material's own vertex shader)
        mat.shadowDepthWrapper = new ShadowDepthWrapper(mat, this.scene);
      }
    }
    if (entry.frame === this.frame) return entry.mat;
    entry.frame = this.frame;
    const mat = entry.mat;
    const any = m as THREE.MeshPhongMaterial & THREE.MeshStandardMaterial & THREE.MeshBasicMaterial & THREE.PointsMaterial;
    // What changes from frame to frame: colour, opacity, emission
    if (any.color) c3(any.color, mat.albedoColor);
    else mat.albedoColor.set(1, 1, 1);
    if (any.emissive) {
      const k = any.emissiveIntensity ?? 1;
      mat.emissiveColor.set(any.emissive.r * k, any.emissive.g * k, any.emissive.b * k);
    } else mat.emissiveColor.set(0, 0, 0);
    mat.alpha = m.opacity;
    // The maps, when they come
    const patch = PATCHES.get(m);
    const height = patch?.kind === "parallax" ? patch.height.value : null;
    if (entry.version === m.version && sameMaps(entry.maps, any, height)) return mat;
    entry.version = m.version;
    entry.maps = mapsSig(any, height);
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
    return mat;
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
  private bind(node: Node, mesh: Mesh, material: THREE.Material | THREE.Material[], g: THREE.BufferGeometry, colors: number) {
    if (node.material !== material) {
      const list = [material].flat();
      for (const m of [node.material ?? []].flat()) this.releaseMaterial(m);
      node.material = material;
      for (const m of list) {
        this.material(m, colors);
        this.mats.get(m)!.users++;
      }
      if (Array.isArray(material)) {
        const multi = new MultiMaterial(`mm${mesh.uniqueId}`, this.scene);
        multi.subMaterials = list.map((m) => this.mats.get(m)!.mat);
        mesh.material = multi;
        mesh.subMeshes = [];
        const total = g.attributes.position.count;
        for (const group of g.groups) new SubMesh(group.materialIndex ?? 0, 0, total, group.start, group.count, mesh);
      } else mesh.material = this.mats.get(material)!.mat;
    } else if (Array.isArray(material)) for (const m of material) this.material(m, colors);
    else this.material(material, colors);
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
      const entry = this.use(g);
      if (!node.mesh) {
        node.mesh = kind === "lines" ? new LinesMesh(`l${o.id}`, this.scene) : new Mesh(`o${o.id}`, this.scene);
        node.mesh.isPickable = false;
        node.mesh.sideOrientation = FRONT;
      }
      entry.geo.applyToMesh(node.mesh);
      node.mesh.isUnIndexed = !entry.indexed;
      node.matrix.fill(NaN);
    }
    const entry = this.geometry(g);
    if (node.mesh.geometry !== entry.geo) {
      entry.geo.applyToMesh(node.mesh);
      node.mesh.isUnIndexed = !entry.indexed;
      node.matrix.fill(NaN);
    }
    return { node, mesh: node.mesh, entry };
  }

  private syncMesh(o: THREE.Mesh, visible: boolean) {
    const g = o.geometry;
    if (!g?.attributes.position) return;
    const { node, mesh, entry } = this.meshNode(o, "mesh", g);
    // (an instanced mesh with no instances draws nothing in three; Babylon would draw its one mesh)
    const shown = Array.isArray(o.material) ? o.material.some((m) => m.visible) : o.material.visible;
    mesh.setEnabled(visible && shown && !((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 0));
    if (!visible) return;
    this.place(node, o, mesh);
    const shader = !Array.isArray(o.material) && (o.material as THREE.ShaderMaterial).isShaderMaterial ? (o.material as THREE.ShaderMaterial) : null;
    if (shader) mesh.material = this.shaderOf(shader, false);
    else this.bind(node, mesh, o.material, g, entry.colors);
    mesh.renderingGroupId = o.renderOrder < 0 ? 0 : 1;
    mesh.alphaIndex = o.renderOrder;
    mesh.receiveShadows = o.receiveShadow;
    mesh.alwaysSelectAsActiveMesh = !o.frustumCulled;
    // Instancing: three's instance matrices are already in the mesh's own frame, as Babylon's thin instances are
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      const v = inst.instanceMatrix.version + inst.count * 7;
      if (node.instances !== v) {
        node.instances = v;
        mesh.thinInstanceSetBuffer("matrix", inst.instanceMatrix.array as Float32Array, 16, false);
        mesh.thinInstanceCount = inst.count;
        // (its bounds take in every instance, for the camera's culling and the shadows')
        mesh.thinInstanceRefreshBoundingInfo(false);
      }
      if (inst.instanceColor) {
        const cv = inst.instanceColor.version;
        if (node.colors !== cv) {
          node.colors = cv;
          const src = inst.instanceColor.array as Float32Array;
          const rgba = new Float32Array((src.length / 3) * 4);
          for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
            rgba[j] = src[i];
            rgba[j + 1] = src[i + 1];
            rgba[j + 2] = src[i + 2];
            rgba[j + 3] = 1;
          }
          mesh.thinInstanceSetBuffer("color", rgba, 4, false);
        }
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
    this.cast(node, mesh, o.castShadow);
  }

  private cast(node: Node, mesh: Mesh, casts: boolean) {
    if (node.casts === casts) return;
    node.casts = casts;
    if (casts) this.casters.add(mesh);
    else this.casters.delete(mesh);
    if (this.sun) {
      if (casts) this.sun.shadow.addShadowCaster(mesh, false);
      else this.sun.shadow.removeShadowCaster(mesh, false);
    }
    for (const n of this.nodes.values()) {
      if (!n.shadow || n.light instanceof DirectionalLight) continue;
      const list = n.shadow.getShadowMap()?.renderList;
      if (!list) continue;
      const at = list.indexOf(mesh);
      if (casts && at < 0) list.push(mesh);
      if (!casts && at >= 0) list.splice(at, 1);
    }
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
      this.material(o.material, 0);
      this.mats.get(o.material)!.users++;
      node.material = o.material;
      node.mesh.material = this.mats.get(o.material)!.mat;
    }
    const mesh = node.mesh;
    mesh.setEnabled(visible && o.material.visible);
    if (!visible) return;
    this.material(o.material, 0);
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
      node.label = label;
      node.mesh?.material?.dispose(true, true);
      node.mesh?.dispose();
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
      const mesh = new Mesh(`t${o.id}`, this.scene);
      const quad = new VertexData();
      quad.positions = [ox - w / 2, oy - h / 2, 0, ox + w / 2, oy - h / 2, 0, ox + w / 2, oy + h / 2, 0, ox - w / 2, oy + h / 2, 0];
      quad.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
      quad.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
      quad.indices = [0, 1, 2, 0, 2, 3];
      quad.applyToMesh(mesh);
      mesh.sideOrientation = FRONT;
      const mat = new PBRMaterial(`tm${o.id}`, this.scene);
      mat.unlit = true;
      mat.albedoTexture = tex;
      mat.useAlphaFromAlbedoTexture = true;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      mat.disableDepthWrite = true;
      mat.backFaceCulling = false;
      mat.imageProcessingConfiguration = this.noToneMapping;
      mesh.material = mat;
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

  // ---- Lights ----

  private syncLight(l: THREE.Light, visible: boolean) {
    const node = this.nodeOf(l, "light");
    const dir = l as THREE.DirectionalLight, point = l as THREE.PointLight, spot = l as THREE.SpotLight, hemi = l as THREE.HemisphereLight;
    if (!node.light) {
      if (dir.isDirectionalLight) node.light = new DirectionalLight(`d${l.id}`, new Vector3(0, -1, 0), this.scene);
      else if (spot.isSpotLight) node.light = new SpotLight(`s${l.id}`, Vector3.Zero(), new Vector3(0, -1, 0), 1, 1, this.scene);
      else if (point.isPointLight && l.userData.cluster && this.cluster()) {
        node.light = new PointLight(`p${l.id}`, Vector3.Zero(), this.scene);
        node.light.falloffType = Light.FALLOFF_DEFAULT;
        this.lamps!.addLight(node.light);
        node.clustered = true;
      } else if (point.isPointLight) node.light = new PointLight(`p${l.id}`, Vector3.Zero(), this.scene);
      else if (hemi.isHemisphereLight || (l as THREE.AmbientLight).isAmbientLight) node.light = new HemisphericLight(`h${l.id}`, new Vector3(0, 1, 0), this.scene);
      else return;
    }
    const light = node.light;
    // (only when it changes: Babylon's light goes through every mesh in the scene each time it is told, on or off)
    const on = visible && l.intensity > 0;
    if (light.isEnabled(false) !== on) light.setEnabled(on);
    if (!visible) return;
    light.intensity = light instanceof HemisphericLight ? l.intensity * AMBIENT : l.intensity;
    c3(l.color, light.diffuse);
    const e = l.matrixWorld.elements;
    if (light instanceof HemisphericLight) {
      // An ambient light is the same from everywhere: a hemisphere whose ground is its sky
      c3(hemi.isHemisphereLight ? hemi.groundColor : l.color, light.groundColor);
      light.specular.set(0, 0, 0);
      return;
    }
    if (light instanceof DirectionalLight) {
      this.daylight = Math.max(this.daylight, l.intensity);
      dir.target.updateMatrixWorld();
      const t = dir.target.matrixWorld.elements;
      light.position.set(e[12], e[13], e[14]);
      light.direction.set(t[12] - e[12], t[13] - e[13], t[14] - e[14]).normalize();
      this.sunShadow(light, dir.castShadow && this.owner.shadowMap.enabled);
      return;
    }
    const pl = light as PointLight;
    pl.position.set(e[12], e[13], e[14]);
    pl.range = point.distance > 0 ? point.distance : Number.MAX_VALUE;
    if (node.clustered) return;
    pl.falloffType = point.decay === 0 ? Light.FALLOFF_STANDARD : Light.FALLOFF_PHYSICAL;
    if (light instanceof SpotLight) {
      spot.target.updateMatrixWorld();
      const t = spot.target.matrixWorld.elements;
      light.direction.set(t[12] - e[12], t[13] - e[13], t[14] - e[14]).normalize();
      light.angle = spot.angle * 2;
      light.exponent = 1 + (1 - spot.penumbra) * 4;
    }
    // A lamp casts shadows only where the tier allows (the nearest few rooms' lamps)
    const wants = point.castShadow && this.owner.shadowMap.enabled && (node.shadow ? true : this.lampShadows < shadowSettings().lamps);
    if (wants && !node.shadow) {
      const gen = new ShadowGenerator(Math.min(1024, point.shadow?.mapSize?.x ?? 512), light as PointLight);
      gen.usePoissonSampling = true;
      gen.bias = 0.004;
      for (const mesh of this.casters) gen.addShadowCaster(mesh, false);
      // (only what is within its reach: all six faces share the list, made once a frame)
      const near: AbstractMesh[] = [];
      let made = -1;
      gen.getShadowMap()!.getCustomRenderList = (_face, list, count) => {
        if (!list) return null;
        if (made !== this.frame) {
          made = this.frame;
          near.length = 0;
          const reach = point.distance > 0 ? point.distance : 12;
          const at = (light as PointLight).position;
          for (let i = 0; i < count; i++) {
            const s = list[i].getBoundingInfo().boundingSphere;
            if (Vector3.Distance(s.centerWorld, at) - s.radiusWorld < reach) near.push(list[i]);
          }
        }
        return near;
      };
      node.shadow = gen;
      this.lampShadows++;
    } else if (!wants && node.shadow) {
      node.shadow.dispose();
      node.shadow = undefined;
      this.lampShadows--;
    }
  }

  // The sun's shadows: cascades that follow the camera, finer near it
  private sunShadow(light: DirectionalLight, on: boolean) {
    if (!on || EFFECTS.shadows === "off") {
      if (this.sun?.light === light) {
        this.sun.shadow.dispose();
        this.sun = undefined;
      }
      return;
    }
    if (this.sun && this.sun.light !== light) return;
    if (this.sun) return;
    const s = shadowSettings();
    // (an engine that cannot draw cascades, WebGL 1, gets one map over the casters, as three had)
    if (!CascadedShadowGenerator.IsSupported) {
      const plain = new ShadowGenerator(s.size, light);
      plain.usePercentageCloserFiltering = true;
      plain.filteringQuality = s.quality;
      plain.bias = 0.002;
      plain.normalBias = 0.015;
      light.autoUpdateExtends = true;
      for (const mesh of this.casters) plain.addShadowCaster(mesh, false);
      this.sun = { light, shadow: plain };
      return;
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
    for (const mesh of this.casters) gen.addShadowCaster(mesh, false);
    // Each cascade draws only what lies across it (Babylon draws every caster into every one), and the far ones leave out what is too
    // small to show in them (under a 150th of their width)
    const planes = Frustum.GetPlanes(Matrix.Identity());
    const lists: AbstractMesh[][] = [];
    gen.getShadowMap()!.getCustomRenderList = (layer, list, count) => {
      const m = gen.getCascadeTransformMatrix(layer), proj = gen.getCascadeProjectionMatrix(layer);
      if (!m || !proj || !list) return null;
      Frustum.GetPlanesToRef(m, planes);
      const least = layer === 0 ? 0 : 2 / Math.abs(proj.m[0]) / 150;
      const out = (lists[layer] ??= []);
      out.length = 0;
      // (the planes beside the cascade only: what stands between it and the sun still casts into it)
      next: for (let i = 0; i < count; i++) {
        const s = list[i].getBoundingInfo().boundingSphere;
        if (s.radiusWorld < least) continue;
        for (let p = 2; p < 6; p++) if (planes[p].dotCoordinate(s.centerWorld) <= -s.radiusWorld) continue next;
        out.push(list[i]);
      }
      return out;
    };
    this.sun = { light, shadow: gen };
  }
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
    if (this.engine.isDisposed) return;
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
    RENDERERS.delete(this);
    for (const m of this.mirrors.values()) m.dispose();
    this.mirrors.clear();
    this.engine.dispose();
  }
}

// `<Canvas gl={babylonGl}>`: R3F hands it the canvas and draws through what it returns
export const babylonGl = (canvas: HTMLCanvasElement | OffscreenCanvas) => new BabylonRenderer(canvas as HTMLCanvasElement) as unknown as THREE.WebGLRenderer;
