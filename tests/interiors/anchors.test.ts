import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEAN, WAIST, ARM_REACH, bodyAnchor, holdAt, offHandAt, type WornSlot } from "../../client/src/components/Map/interiors/anchors";

const SLOTS: WornSlot[] = ["hipR", "hipL", "back", "belt", "shoulder"];
const human = { bulk: 1 };

test("a body's things sit on the right side, the right way round, and widen with the bulk", () => {
  const [r, l] = [bodyAnchor("hipR", human), bodyAnchor("hipL", human)];
  assert.ok(r.at[0] < 0 && l.at[0] > 0 && Math.abs(r.at[0] + l.at[0]) < 1e-9, "the hips are either side");
  assert.ok(bodyAnchor("hipR", { bulk: 1.4 }).at[0] < r.at[0], "a bulky body is wider across the hips");
  assert.ok(bodyAnchor("shoulder", { bulk: 1.4 }).at[0] < bodyAnchor("shoulder", human).at[0]);
  assert.ok(bodyAnchor("back", human).at[2] < 0 && bodyAnchor("belt", human).at[2] > 0, "a pack is behind, a buckle in front");
  assert.equal(bodyAnchor("back", human).rot[1], Math.PI, "a pack faces away from the body");
  assert.ok(bodyAnchor("belt", human).at[1] > WAIST && bodyAnchor("hipR", human).at[1] < WAIST);
});
test("a pack stands clear of wings, and a hunched torso carries what is on it forward", () => {
  assert.ok(bodyAnchor("back", { bulk: 1, wings: true }).at[2] < bodyAnchor("back", human).at[2] - 0.05);
  for (const slot of ["back", "belt", "shoulder"] as WornSlot[]) {
    const [straight, bent] = [bodyAnchor(slot, human), bodyAnchor(slot, { bulk: 1, hunched: true })];
    assert.ok(Math.abs(bent.rot[0] - straight.rot[0] - LEAN) < 1e-9, `${slot} leans with the torso`);
    assert.ok(bent.at[2] > straight.at[2], `${slot} moves forward`);
  }
  // Below the waist nothing leans
  for (const slot of ["hipR", "hipL"] as WornSlot[]) assert.deepEqual(bodyAnchor(slot, { bulk: 1, hunched: true }), bodyAnchor(slot, human));
  // The lean keeps the distance from the waist
  const [a, b] = [bodyAnchor("back", human), bodyAnchor("back", { bulk: 1, hunched: true })];
  assert.ok(Math.abs(Math.hypot(a.at[1] - WAIST, a.at[2]) - Math.hypot(b.at[1] - WAIST, b.at[2])) < 1e-9);
});
test("every slot is on the body: between the knee and above the head, not off to one side", () => {
  for (const slot of SLOTS) for (const traits of [human, { bulk: 0.7 }, { bulk: 1.5, hunched: true, wings: true }, { bulk: 1, longNeck: true }]) {
    const { at } = bodyAnchor(slot, traits);
    assert.ok(at[1] > 0.3 && at[1] < 1.2, `${slot} at height ${at[1]}`);
    assert.ok(Math.abs(at[0]) < 0.5 && Math.abs(at[2]) < 0.5, `${slot} at ${at}`);
  }
});

test("a hand closes exactly on a model's grip socket, whichever way the weapon points and however it is scaled", () => {
  const grip: [number, number, number] = [0, 0.01, -0.06];
  for (const dir of [[0, 0.6, 0.55], [0, 0, 1], [0.3, -0.5, 0.8], [1, 0, 0]] as [number, number, number][]) for (const scale of [0.5, 0.85, 1.2]) {
    const hand: [number, number, number] = [-0.12, 0.6, 0.25];
    const { at, rot } = holdAt(hand, dir, 0.28, scale, 0.15, grip);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3().setScalar(scale));
    const p = new THREE.Vector3(...grip).applyMatrix4(m);
    assert.ok(p.distanceTo(new THREE.Vector3(...hand)) < 1e-6, `${dir} x${scale}: ${p.toArray()}`);
    // The weapon's length axis points along the way it is held
    const along = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
    assert.ok(along.dot(new THREE.Vector3(...dir).normalize()) > 0.999);
  }
  // Without a socket the hand takes it a fraction of the way along: the middle of the weapon at 0.5
  const mid = holdAt([0, 1, 0], [0, 0, 1], 0.4, 1, 0.5);
  assert.deepEqual(mid.at.map((v) => +v.toFixed(9)), [0, 1, 0]);
  assert.ok(holdAt([0, 1, 0], [0, 0, 1], 0.4, 1, 0.2).at[2] > 0, "the rear is in the hand: the weapon sits forward of it");
});

test("the second hand of a two-handed weapon closes exactly on its off_hand socket, whichever way it points, and only where an arm reaches", () => {
  const [grip, off]: [[number, number, number], [number, number, number]] = [[0, 0.01, -0.2], [0.01, -0.02, 0.15]];
  for (const dir of [[0, 0, 1], [0.3, -0.2, 0.9], [-0.4, 0.1, 0.8]] as [number, number, number][]) for (const scale of [0.85, 1]) {
    const hand: [number, number, number] = [-0.1, 0.07, 0.17];
    const at = offHandAt(hand, dir, 0.9, scale, 0.3, grip, off)!;
    // The same transform as the right hand's: the off_hand point of the model lands where the function says
    const placed = holdAt(hand, dir, 0.9, scale, 0.3, grip);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...placed.at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...placed.rot)), new THREE.Vector3().setScalar(scale));
    const p = new THREE.Vector3(...off).applyMatrix4(m);
    assert.ok(p.distanceTo(new THREE.Vector3(...at)) < 1e-6, `${dir} x${scale}`);
    // The right hand still holds the grip
    assert.ok(new THREE.Vector3(...grip).applyMatrix4(m).distanceTo(new THREE.Vector3(...hand)) < 1e-6);
    // The two hands are as far apart as the sockets are, along the weapon
    assert.ok(Math.abs(new THREE.Vector3(...at).distanceTo(new THREE.Vector3(...hand)) - new THREE.Vector3(...off).sub(new THREE.Vector3(...grip)).length() * scale) < 1e-6);
  }
  // Out of reach of the shoulder: the pose's own hand stays
  const toLeft: [number, number, number] = [0.15, 0.12, 0.09];
  assert.equal(offHandAt([-0.1, 0.07, 0.17], toLeft, 0.9, 1, 0.3, grip, [0, 0, 1.2], [0.2, 0.34, 0]), null);
  assert.ok(offHandAt([-0.1, 0.07, 0.17], toLeft, 0.9, 1, 0.3, grip, off, [0.2, 0.34, 0]) !== null, "a rifle held as the pose holds it reaches");
  assert.ok(ARM_REACH > 0.3 && ARM_REACH < 0.7);
});
