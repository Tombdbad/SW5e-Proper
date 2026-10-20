import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { AIM, aimAt, lookDirection, poseOf, rightOf, EYE } from "../../client/src/components/Map/interiors/aim";

const box = (at: [number, number, number], size: [number, number, number], aim?: { label: string; onTap: () => void }) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
  m.position.set(...at);
  if (aim) m.userData.aim = aim;
  m.updateMatrixWorld(true);
  return m;
};
const cameraFor = (pose: ReturnType<typeof poseOf>) => {
  const camera = new THREE.PerspectiveCamera(70, 1.5, 0.05, 100);
  camera.position.copy(pose.position);
  camera.lookAt(pose.look);
  camera.updateMatrixWorld(true);
  return camera;
};

test("yaw 0 looks along +z, a quarter turn towards +x, and the right hand is opposite the left", () => {
  assert.ok(lookDirection(0, 0).distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9);
  assert.ok(lookDirection(Math.PI / 2, 0).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-9);
  assert.ok(rightOf(0).distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-9, "facing +z, the right hand is -x");
  assert.ok(Math.abs(lookDirection(0.7, 0.3).length() - 1) < 1e-9);
});

test("the crosshair picks the target it is on, however far it is turned, and not the one beside it", () => {
  const hit = { label: "Guard", onTap: () => {} };
  const near = { label: "Crate", onTap: () => {} };
  const guard = box([0, 0.7, 6], [0.9, 1.4, 0.9], hit);
  const crate = box([3, 0.7, 6], [0.9, 1.4, 0.9], near);
  for (const yaw of [0, 0.4, -0.6]) {
    const feet = new THREE.Vector3(0, 0, 0);
    // Stand so that the guard lies on the aim for this yaw, the crate off to the side
    const dir = lookDirection(yaw, 0);
    guard.position.set(dir.x * 6, 0.7, dir.z * 6);
    crate.position.set(dir.x * 6 + 3, 0.7, dir.z * 6);
    guard.updateMatrixWorld(true);
    crate.updateMatrixWorld(true);
    const pose = poseOf("first", feet, yaw, 0);
    guard.position.y = pose.position.y;
    guard.updateMatrixWorld(true);
    const aimed = aimAt(cameraFor(pose), 0, undefined, [guard, crate], []);
    assert.equal(aimed.kind, "target", `yaw ${yaw}`);
    assert.equal(aimed.label, "Guard");
    assert.ok(aimed.distance > 5 && aimed.distance < 6, `distance ${aimed.distance}`);
    assert.ok(aimed.point.distanceTo(pose.position.clone().add(dir.clone().multiplyScalar(aimed.distance))) < 1e-6, "the point is on the ray");
  }
  // Looking off to the side of both: the ground
  const pose = poseOf("first", new THREE.Vector3(0, 0, 0), 2.5, -0.3);
  const aimed = aimAt(cameraFor(pose), 0, undefined, [guard, crate], []);
  assert.equal(aimed.kind, "ground");
  assert.ok(Math.abs(aimed.point.y) < 1e-6, "the ground is at the floor's height");
});

test("a wall between the camera and a target hides it", () => {
  const guard = box([0, 1.15, 6], [0.9, 1.4, 0.9], { label: "Guard", onTap: () => {} });
  const wall = box([0, 1, 3], [6, 2, 0.2]);
  const pose = poseOf("first", new THREE.Vector3(0, 0, 0), 0, 0);
  const aimed = aimAt(cameraFor(pose), 0, undefined, [guard], [wall]);
  assert.equal(aimed.kind, "wall");
  assert.equal(aimed.label, undefined);
  assert.ok(Math.abs(aimed.distance - 2.9) < 0.05);
});

test("over the shoulder, a wall between the shoulder and the aimed point blocks the shot though the camera sees the target", () => {
  // The camera stands behind and a little right of the character (x -0.68), looking down the aim: the guard is on that line
  const guard = box([-0.43, 1.15, 9], [0.9, 1.4, 0.9], { label: "Guard", onTap: () => {} });
  // A narrow post just in front of the character, across the line from the shoulder (x -0.2) but not the camera's (x -0.6 there)
  const screen = box([-0.2, 1.0, 1.0], [0.4, 2.0, 0.1]);
  const pose = poseOf("shoulder", new THREE.Vector3(0, 0, 0), 0, 0, []);
  assert.ok(pose.position.z < -1.5, "the camera stands behind the character");
  assert.ok(pose.position.x < -0.5 + 1e-6 || pose.position.x > 0, "and to one side");
  const camera = cameraFor(pose);
  const free = aimAt(camera, 0, pose.muzzle, [guard], []);
  assert.equal(free.kind, "target");
  assert.equal(free.blocked, undefined, "nothing in the way");
  const shut = aimAt(camera, 0, pose.muzzle, [guard], [screen]);
  assert.ok(shut.blocked, "the screen blocks it");
  assert.ok(Math.abs(shut.blocked!.z - 0.95) < 0.1, `stops at the screen, z ${shut.blocked!.z}`);
});

test("the shoulder camera is pulled in by a wall behind the character, and the eyes are at head height", () => {
  const wall = box([0, 1, -1.2], [6, 2, 0.2]);
  const free = poseOf("shoulder", new THREE.Vector3(0, 0, 0), 0, 0, []);
  const pulled = poseOf("shoulder", new THREE.Vector3(0, 0, 0), 0, 0, [wall]);
  assert.ok(pulled.position.z > free.position.z, `${pulled.position.z} vs ${free.position.z}`);
  assert.ok(pulled.position.z > -1.2, "in front of the wall");
  assert.equal(poseOf("first", new THREE.Vector3(2, 3, 4), 1, 0).position.y, 3 + EYE);
  assert.ok(AIM.targets instanceof Set && AIM.solids instanceof Set);
});

test("a target's own plan (in a fight, the rules' word on reach and cover) comes through the crosshair with its distance", () => {
  const plan = () => ({ ok: false, text: "out of range", feet: 120 });
  const foe = box([0, 1.15, 5], [0.9, 1.4, 0.9], { label: "Trooper", onTap: () => {}, plan } as never);
  const pose = poseOf("first", new THREE.Vector3(0, 0, 0), 0, 0);
  const aimed = aimAt(cameraFor(pose), 0, undefined, [foe], []);
  assert.equal(aimed.kind, "target");
  assert.deepEqual(aimed.plan?.(), { ok: false, text: "out of range", feet: 120 });
});
