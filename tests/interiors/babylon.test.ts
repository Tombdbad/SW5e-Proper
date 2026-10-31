import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { BabylonRenderer } from "../../client/src/components/Map/babylon";
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
