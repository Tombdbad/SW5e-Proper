import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { bearingOf, pointOf } from "../../client/src/components/Map/interiors/compass";
import { facing } from "../../client/src/components/Map/interiors/packs";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const bearingFor = (camera: THREE.PerspectiveCamera) => {
  const look = camera.getWorldDirection(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  return bearingOf({ x: look.x, z: look.z }, { x: up.x, z: up.z });
};
const camera = (at: [number, number, number], to: [number, number, number]) => {
  const c = new THREE.PerspectiveCamera(60, 1.5, 0.1, 100);
  c.position.set(...at);
  c.lookAt(...to);
  c.updateMatrixWorld(true);
  return c;
};

test("north is -z, the edge of a plan at y = 0: looking along it is a bearing of 0, east is a quarter turn clockwise", () => {
  assert.ok(near(bearingOf({ x: 0, z: -1 }, { x: 0, z: 0 }), 0));
  assert.ok(near(bearingOf({ x: 1, z: 0 }, { x: 0, z: 0 }), Math.PI / 2));
  assert.ok(near(Math.abs(bearingOf({ x: 0, z: 1 }, { x: 0, z: 0 })), Math.PI));
  assert.ok(near(bearingOf({ x: -1, z: 0 }, { x: 0, z: 0 }), -Math.PI / 2));
  assert.deepEqual([0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI / 4, 3 * Math.PI / 4].map(pointOf), ["N", "NE", "E", "S", "W", "NW", "SE"]);
});

test("the overhead camera of the map (south of the middle, looking north and down) has north at the top of the screen", () => {
  const c = camera([0, 15, 15], [0, 0, 0]);
  assert.equal(pointOf(bearingFor(c)), "N");
  // Orbited a quarter turn to the east side, looking west: the top of the screen is west
  assert.equal(pointOf(bearingFor(camera([15, 15, 0], [0, 0, 0]))), "W");
  // Straight down with the screen's top toward the east
  const down = camera([0, 20, 0.0001], [0, 0, 0]);
  down.up.set(1, 0, 0);
  down.lookAt(0, 0, 0);
  down.updateMatrixWorld(true);
  assert.equal(pointOf(bearingFor(down)), "E");
});

test("a person standing in a room looks along the way the camera does: yaw 0 is south, a quarter turn is east", () => {
  // (ViewRig: forward is (sin yaw, cos yaw))
  const bearingOfYaw = (yaw: number) => bearingOf({ x: Math.sin(yaw), z: Math.cos(yaw) }, { x: 0, z: 0 });
  assert.equal(pointOf(bearingOfYaw(0)), "S");
  assert.equal(pointOf(bearingOfYaw(Math.PI / 2)), "E");
  assert.equal(pointOf(bearingOfYaw(Math.PI)), "N");
  assert.equal(pointOf(bearingOfYaw(-Math.PI / 2)), "W");
});

test("a piece against the north wall faces south and one against the east wall faces west, by the same compass", () => {
  const room = [10, 8] as const;
  const faces = (a: { x: number; y: number; w: number; h: number }) => pointOf(Math.atan2(Math.sin(facing(a, ...room)), Math.cos(facing(a, ...room)) * -1));
  assert.equal(faces({ x: 3, y: 0, w: 3, h: 1 }), "S");
  assert.equal(faces({ x: 3, y: 7, w: 3, h: 1 }), "N");
  assert.equal(faces({ x: 0, y: 2, w: 1, h: 3 }), "E");
  assert.equal(faces({ x: 9, y: 2, w: 1, h: 3 }), "W");
});
