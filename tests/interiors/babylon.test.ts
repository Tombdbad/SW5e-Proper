import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { BabylonRenderer, shaderPatch, patchOf } from "../../client/src/components/Map/babylon";
import { limbMaterial } from "../../client/src/components/Map/interiors/limbs";

// The renderer R3F is given (babylon.ts) mirrors a three scene into a Babylon one each frame; NullEngine draws nothing, so these check
// what is handed to Babylon: the meshes where three has them, their geometry and materials, and that they go when three's objects go.
const make = () => {
  const r = new BabylonRenderer({} as HTMLCanvasElement, new NullEngine());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  return { r, scene, camera, draw: () => r.render(scene, camera), mirror: () => r.mirrorOf(scene)! };
};
const meshNamed = (s: ReturnType<ReturnType<typeof make>["mirror"]>, o: THREE.Object3D) => s.meshes.find((m) => m.name === `o${o.id}`) as Mesh | undefined;

test("a mesh is drawn where three has it, with its vertices, its vertex colours and three's front faces", () => {
  const { scene, draw, mirror } = make();
  const geo = new THREE.BoxGeometry(1, 2, 3);
  geo.setAttribute("color", new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count * 3).fill(0.5), 3));
  const box = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  box.position.set(1, 2, 3);
  box.rotation.set(0.3, 1.1, -0.4);
  scene.add(box);
  draw();
  const mesh = meshNamed(mirror(), box)!;
  assert.ok(mesh, "the box is mirrored");
  assert.equal(mesh.getTotalVertices(), geo.attributes.position.count);
  assert.equal(mesh.getTotalIndices(), geo.index!.count);
  assert.ok(mesh.isVerticesDataPresent(VertexBuffer.ColorKind));
  assert.ok(mesh.useVertexColors);
  // Babylon's matrix has three's numbers in the same places
  const world = mesh.getWorldMatrix().m;
  box.matrixWorld.elements.forEach((v, i) => assert.ok(Math.abs(world[i] - v) < 1e-6, `world matrix ${i}`));
  assert.equal(mesh.sideOrientation, 1, "counter-clockwise faces are the front");
  assert.equal(mirror().useRightHandedSystem, true);
  // It moves when three's does
  box.position.x = 5;
  draw();
  assert.ok(Math.abs(meshNamed(mirror(), box)!.getWorldMatrix().m[12] - 5) < 1e-6);
});

test("materials become physically based ones: Lambert rough, Phong by its shininess, Basic unlit, see-through and two-sided kept", () => {
  const { scene, draw, mirror } = make();
  const geo = new THREE.BoxGeometry();
  const lambert = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: "#ff0000" }));
  const phong = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ shininess: 70, specular: new THREE.Color("#6a6a6a") }));
  const basic = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  scene.add(lambert, phong, basic);
  draw();
  const mat = (o: THREE.Mesh) => meshNamed(mirror(), o)!.material as PBRMaterial;
  assert.equal(mat(lambert).roughness, 0.95);
  assert.equal(mat(lambert).metallic, 0);
  assert.ok(Math.abs(mat(lambert).albedoColor.r - 1) < 1e-6 && mat(lambert).albedoColor.g === 0);
  assert.ok(Math.abs(mat(phong).roughness! - 0.5) < 1e-6);
  assert.ok(mat(phong).metallic! > 0 && mat(phong).metallic! < 0.5);
  assert.equal(mat(basic).unlit, true);
  assert.equal(mat(basic).alpha, 0.25);
  assert.equal(mat(basic).backFaceCulling, false);
  assert.equal(mat(basic).disableDepthWrite, true);
  // A colour changed in three is changed in Babylon the next frame
  (lambert.material as THREE.MeshLambertMaterial).color.set("#00ff00");
  draw();
  assert.ok(mat(lambert).albedoColor.g > 0.99);
});

test("a moving figure's material turns its limbs in Babylon's shader too", () => {
  const { scene, draw, mirror } = make();
  const geo = new THREE.BoxGeometry();
  const n = geo.attributes.position.count;
  geo.setAttribute("limb", new THREE.Float32BufferAttribute(new Array(n).fill(1), 1));
  geo.setAttribute("pivot", new THREE.Float32BufferAttribute(new Array(n * 3).fill(0), 3));
  const figure = new THREE.Mesh(geo, limbMaterial(new THREE.MeshLambertMaterial({ vertexColors: true })));
  scene.add(figure);
  draw();
  const mesh = meshNamed(mirror(), figure)!;
  assert.ok(mesh.isVerticesDataPresent("limb") && mesh.isVerticesDataPresent("pivot"), "the limb attributes are handed over");
  assert.ok((mesh.material as PBRMaterial).pluginManager?.getPlugin("Limbs"), "the limb plugin is on its material");
});

test("instanced meshes become thin instances; what leaves three's scene leaves Babylon's", () => {
  const { scene, draw, mirror } = make();
  const many = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial(), 5);
  for (let i = 0; i < 5; i++) many.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i, 0, 0));
  many.count = 3;
  scene.add(many);
  draw();
  assert.equal(meshNamed(mirror(), many)!.thinInstanceCount, 3);
  scene.remove(many);
  draw();
  assert.equal(meshNamed(mirror(), many), undefined);
});

test("a shape kept by the game is drawn again when the scene that used it comes back (going from the settlement to a building)", () => {
  const { scene, draw, mirror } = make();
  // (the game builds its shapes once and every scene that needs one is given the same geometry)
  const shared = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial();
  const first = new THREE.Mesh(shared, material);
  scene.add(first);
  draw();
  assert.equal(meshNamed(mirror(), first)!.getTotalVertices(), shared.attributes.position.count);
  // The scene goes, some frames pass with nothing drawn, and a new scene uses the shape again
  scene.remove(first);
  for (let i = 0; i < 5; i++) draw();
  const second = new THREE.Mesh(shared, material);
  scene.add(second);
  draw();
  const mesh = meshNamed(mirror(), second)!;
  assert.equal(mesh.getTotalVertices(), shared.attributes.position.count, "the shape still has its vertices");
  assert.equal(mesh.getTotalIndices(), shared.index!.count);
  assert.equal(mesh.geometry!.isDisposed(), false);
});

test("lights keep their strength (an ambient light becomes a hemisphere at 1/π, as three lights with it)", () => {
  const { scene, draw, mirror } = make();
  scene.add(new THREE.AmbientLight("#ffffff", Math.PI));
  const sun = new THREE.DirectionalLight("#ffeedd", 0.9);
  sun.position.set(0, 10, 0);
  scene.add(sun);
  const lamp = new THREE.PointLight("#ff8800", 2, 6);
  scene.add(lamp);
  draw();
  const lights = mirror().lights;
  const kinds = lights.map((l) => l.getClassName()).sort();
  assert.deepEqual(kinds, ["DirectionalLight", "HemisphericLight", "PointLight"]);
  const hemi = lights.find((l) => l.getClassName() === "HemisphericLight")!;
  assert.ok(Math.abs(hemi.intensity - 1) < 1e-6);
  const dir = lights.find((l) => l.getClassName() === "DirectionalLight") as unknown as { intensity: number; direction: { y: number } };
  assert.ok(Math.abs(dir.intensity - 0.9) < 1e-6);
  assert.ok(dir.direction.y < -0.99, "the sun shines down at its target");
  const point = lights.find((l) => l.getClassName() === "PointLight") as unknown as { range: number };
  assert.equal(point.range, 6);
});

test("three's shader patches become Babylon's: fur, hull wear and sea waves as plugins, parallax as Babylon's own, and a copy keeps its base's", () => {
  const { scene, draw, mirror } = make();
  const geo = new THREE.BoxGeometry();
  const fur = shaderPatch(new THREE.MeshLambertMaterial(), { kind: "fur", length: 0.05, shells: 6, strands: { value: null } });
  const wear = shaderPatch(new THREE.MeshPhongMaterial(), { kind: "wear", wear: new THREE.Texture(), damage: new THREE.Texture(), level: [0.5, 0] });
  const sea = shaderPatch(new THREE.MeshPhongMaterial(), { kind: "waves", time: { value: 0 } });
  const wall = shaderPatch(new THREE.MeshPhongMaterial(), { kind: "parallax", height: { value: null }, parallax: 0.03 });
  const limbs = limbMaterial(fur);
  assert.equal(patchOf(limbs), patchOf(fur), "a moving figure's copy keeps the fur");
  const meshes = [fur, wear, sea, wall, limbs].map((m) => new THREE.Mesh(geo, m));
  scene.add(...meshes);
  draw();
  const plugins = (o: THREE.Mesh) => ((meshNamed(mirror(), o)!.material as PBRMaterial).pluginManager as unknown as { _plugins: { name: string }[] })._plugins.map((p) => p.name);
  assert.ok(plugins(meshes[0]).includes("FurShells"));
  assert.ok(plugins(meshes[1]).includes("HullWear"));
  assert.ok(plugins(meshes[2]).includes("SeaWaves"));
  assert.ok(!plugins(meshes[3]).some((n) => /Fur|Wear|Waves/.test(n)), "parallax is no plugin");
  assert.deepEqual(plugins(meshes[4]).filter((n) => /Fur|Limbs/.test(n)).sort(), ["FurShells", "Limbs"]);
  // (no height map loaded yet: no parallax)
  assert.equal((meshNamed(mirror(), meshes[3])!.material as PBRMaterial).useParallax, false);
});

test("a three shader material runs its own GLSL, given what three declares, its uniforms copied each frame", () => {
  const { scene, draw, mirror } = make();
  const shield = new THREE.ShaderMaterial({
    vertexShader: "varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; void main() { gl_FragColor = vec4(uColor, uOpacity); #include <colorspace_fragment> }",
    uniforms: { uColor: { value: new THREE.Color(0.2, 0.6, 1) }, uOpacity: { value: 0.5 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), shield);
  scene.add(mesh);
  draw();
  const mat = meshNamed(mirror(), mesh)!.material as unknown as { getClassName(): string; _options: { uniforms: string[]; attributes: string[] }; _shaderPath: { vertexSource: string; fragmentSource: string }; _floats: Record<string, number>; _vectors3Arrays?: unknown; disableDepthWrite: boolean; alphaMode: number };
  assert.equal(mat.getClassName(), "ShaderMaterial");
  assert.ok(mat._options.uniforms.includes("uColor") && mat._options.uniforms.includes("worldView"));
  assert.ok(mat._shaderPath.vertexSource.includes("#define modelViewMatrix worldView"));
  assert.ok(!mat._shaderPath.fragmentSource.includes("#include"), "three's chunks are written out");
  assert.ok(mat._shaderPath.fragmentSource.includes("pow(max(gl_FragColor.rgb"));
  assert.equal(mat._floats.uOpacity, 0.5);
  assert.equal(mat.disableDepthWrite, true);
  shield.uniforms.uOpacity.value = 0.2;
  draw();
  assert.equal(mat._floats.uOpacity, 0.2);
});

test("the sun's shadow: cascades where the engine draws them, else one map over its casters", () => {
  const { r, scene, draw, mirror } = make();
  r.shadowMap.enabled = true;
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  scene.add(sun, sun.target);
  const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  box.castShadow = true;
  scene.add(box);
  draw();
  const gen = mirror().lights.find((l) => l.getClassName() === "DirectionalLight")!.getShadowGenerator()!;
  // (the NullEngine cannot draw cascades)
  assert.equal(gen.getClassName(), "ShadowGenerator");
  assert.deepEqual(gen.getShadowMap()!.renderList!.map((m) => m.name), [`o${box.id}`]);
  box.castShadow = false;
  draw();
  assert.equal(gen.getShadowMap()!.renderList!.length, 0);
});
