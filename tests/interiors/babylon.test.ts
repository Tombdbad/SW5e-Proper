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

test("lights keep their strength in one fixed rig: ambient lights summed into one sky at 1/π, suns in their slots, and a room's lights coming and going change no shader", () => {
  const { scene, draw, mirror } = make();
  scene.add(new THREE.AmbientLight("#ffffff", Math.PI));
  const sun = new THREE.DirectionalLight("#ffeedd", 0.9);
  sun.position.set(0, 10, 0);
  scene.add(sun);
  const lamp = new THREE.PointLight("#ff8800", 2, 6);
  scene.add(lamp);
  draw();
  const lights = () => mirror().lights;
  const kinds = () => lights().map((l) => l.getClassName()).join();
  const before = kinds();
  const sky = lights().find((l) => l.getClassName() === "HemisphericLight") as unknown as { diffuse: { r: number }; intensity: number };
  assert.ok(Math.abs(sky.diffuse.r * sky.intensity - 1) < 1e-6, "the sky is three's ambient at 1/π");
  const suns = lights().filter((l) => l.getClassName() === "DirectionalLight") as unknown as { intensity: number; direction: { y: number } }[];
  assert.ok(Math.abs(suns[0].intensity - 0.9) < 1e-6);
  assert.ok(suns[0].direction.y < -0.99, "the sun shines down at its target");
  assert.ok(suns.slice(1).every((d) => d.intensity === 0), "the other sun slots are dark");
  const point = lights().find((l) => l.name === `p${lamp.id}`) as unknown as { range: number };
  assert.equal(point.range, 6);
  // A room comes with its ambient and key light: the sky is brighter, a slot is used, and the lights are the same lights
  const room = new THREE.Group();
  room.add(new THREE.AmbientLight("#ffffff", Math.PI), new THREE.DirectionalLight("#ffffff", 0.5));
  scene.add(room);
  draw();
  assert.equal(kinds(), before);
  assert.ok(Math.abs(sky.diffuse.r * sky.intensity - 2) < 1e-6, "two ambient lights add up");
  assert.ok(Math.abs(suns[1].intensity - 0.5) < 1e-6);
  scene.remove(room);
  draw();
  assert.equal(kinds(), before);
  assert.equal(suns[1].intensity, 0);
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
  assert.equal((gen as unknown as { getClassName(): string }).getClassName(), "ShadowGenerator");
  assert.deepEqual(gen.getShadowMap()!.renderList!.map((m) => m.name), [`o${box.id}`]);
  box.castShadow = false;
  draw();
  assert.equal(gen.getShadowMap()!.renderList!.length, 0);
});

test("each frame copies only what changed: a reshaped geometry, a new map, a light switched off and on (and a light left on goes through no meshes)", () => {
  const { scene, draw, mirror } = make();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.Mesh(geo, material);
  scene.add(mesh);
  const lamp = new THREE.PointLight("#ffffff", 1, 5);
  scene.add(lamp);
  draw();
  const positions = () => Array.from(meshNamed(mirror(), mesh)!.getVerticesData(VertexBuffer.PositionKind)!);
  assert.deepEqual(positions(), [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  // A new shape set in its place (as the game does when a model is rebuilt) is copied once its version moves
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 1, 0], 3));
  draw();
  assert.equal(positions()[3], 2);
  // A map given later reaches the material
  const babylonMat = () => meshNamed(mirror(), mesh)!.material as PBRMaterial;
  assert.equal(babylonMat().albedoTexture, null);
  const canvas = { width: 4, height: 4 } as unknown as HTMLCanvasElement;
  material.map = new THREE.Texture(canvas);
  draw();
  assert.ok(babylonMat().albedoTexture, "the map is there");
  // The lamp: off with no strength, on again with it; while it stays on Babylon is not asked to go through the meshes again
  const light = () => mirror().lights.find((l) => l.getClassName() === "PointLight")!;
  let resyncs = 0;
  const original = (light() as unknown as { _resyncMeshes: () => void })._resyncMeshes.bind(light());
  (light() as unknown as { _resyncMeshes: () => void })._resyncMeshes = () => { resyncs++; original(); };
  for (let i = 0; i < 5; i++) draw();
  assert.equal(resyncs, 0);
  lamp.intensity = 0;
  draw();
  assert.equal(light().isEnabled(), false);
  lamp.intensity = 1;
  draw();
  assert.equal(light().isEnabled(), true);
  assert.ok(resyncs > 0, "a real change still reaches the meshes");
});

test("three materials that look alike share one Babylon material; one whose colour keeps changing gets its own", () => {
  const { scene, draw, mirror } = make();
  const geo = new THREE.BoxGeometry();
  const red = () => new THREE.MeshLambertMaterial({ color: "#aa2200" });
  const a = new THREE.Mesh(geo, red()), b = new THREE.Mesh(geo, red()), c = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: "#0022aa" }));
  scene.add(a, b, c);
  draw();
  const mat = (o: THREE.Mesh) => meshNamed(mirror(), o)!.material as PBRMaterial;
  assert.equal(mat(a), mat(b), "two alike, one material");
  assert.notEqual(mat(a), mat(c));
  // b turns blue: it now looks like c
  (b.material as THREE.MeshLambertMaterial).color.set("#0022aa");
  draw();
  assert.equal(mat(b), mat(c));
  assert.notEqual(mat(a), mat(b));
  // and keeps changing (a flicker): after a third change it has a material of its own, which follows its colour each frame
  for (const hex of ["#111111", "#222222", "#333333"]) {
    (b.material as THREE.MeshLambertMaterial).color.set(hex);
    draw();
  }
  assert.notEqual(mat(b), mat(a));
  assert.notEqual(mat(b), mat(c));
  (b.material as THREE.MeshLambertMaterial).color.setRGB(0.5, 0.25, 0);
  draw();
  assert.ok(Math.abs(mat(b).albedoColor.g - 0.25) < 1e-6);
  // A material with a plugin of its own is never shared
  const fur = () => shaderPatch(new THREE.MeshLambertMaterial(), { kind: "fur", length: 0.05, shells: 6, strands: { value: null } });
  const f1 = new THREE.Mesh(geo, fur()), f2 = new THREE.Mesh(geo, fur());
  scene.add(f1, f2);
  draw();
  assert.notEqual(mat(f1), mat(f2));
});

test("two instanced meshes of one shape keep their own instances (the open ground's trees and the belt beyond's, one piece in two places)", () => {
  const { scene, draw, mirror } = make();
  // (the game draws one piece of the asset library in several places: one three geometry and material, an instanced mesh each)
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial();
  const make2 = (at: number[]) => {
    const mesh = new THREE.InstancedMesh(geo, material, at.length);
    at.forEach((x, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, 0)));
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  };
  const inner = make2([1, 2, 3]);
  const belt = make2([50, 60]);
  scene.add(inner, belt);
  draw();
  const a = meshNamed(mirror(), inner)!, b = meshNamed(mirror(), belt)!;
  assert.notEqual(a.geometry, b.geometry, "each has a geometry of its own: Babylon keeps the instances on it");
  // (each instance is a 4 by 4 matrix: its world0..3 rows are one buffer)
  const instancesOf = (m: Mesh) => (m.getVertexBuffer("world0")!.getData() as Float32Array).length / 16;
  assert.equal(instancesOf(a), 3);
  assert.equal(instancesOf(b), 2);
  assert.equal(a.thinInstanceCount, 3);
  assert.equal(b.thinInstanceCount, 2);
  // the plain mesh of the shape still shares one, and a mesh going gives its copy back for the next
  const plain = new THREE.Mesh(geo, material);
  scene.add(plain);
  draw();
  scene.remove(belt);
  draw();
  const again = make2([7, 8, 9, 10]);
  scene.add(again);
  draw();
  const c = meshNamed(mirror(), again)!;
  assert.equal(instancesOf(c), 4, "a copy taken again carries only its new instances");
  assert.equal(instancesOf(a), 3);
});

test("distance detail (a scene that asks for it): a far mesh is not drawn, a scatter is thinned instance by instance, and a far model takes the far instances", () => {
  const { scene, draw, mirror } = make();
  scene.userData.detail = true;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial();
  const at = (x: number) => new THREE.Matrix4().makeTranslation(x, 0, 0);
  const near = new THREE.Mesh(geo, material);
  const far = new THREE.Mesh(geo, material);
  far.position.x = 400;
  const scatter = (x: number[], lod?: string) => {
    const mesh = new THREE.InstancedMesh(geo, material, x.length);
    x.forEach((v, i) => mesh.setMatrixAt(i, at(v)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    if (lod) mesh.userData.lod = lod;
    return mesh;
  };
  const all = scatter([1, 2, 400]);
  const closer = scatter([1, 2, 50, 400], "near");
  const farther = scatter([1, 2, 50, 400], "far");
  scene.add(near, far, all, closer, farther);
  draw();
  const m = (o: THREE.Object3D) => meshNamed(mirror(), o)!;
  assert.equal(m(near).isEnabled(), true);
  assert.equal(m(far).isEnabled(), false, "a small thing 400 away is not drawn");
  assert.equal(m(all).thinInstanceCount, 2, "the instance 400 away is left out");
  assert.equal(m(closer).thinInstanceCount, 2, "the near model keeps those inside the near distance");
  assert.equal(m(farther).thinInstanceCount, 1, "the far model keeps those between it and the draw distance");
  // Everything is drawn while a district is got ready, and when the scene does not ask
  scene.userData.detail = false;
  draw();
  assert.equal(m(far).isEnabled(), true);
  assert.equal(m(all).thinInstanceCount, 3);
});
