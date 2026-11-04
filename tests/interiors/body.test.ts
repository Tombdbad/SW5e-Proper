import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bodyParts, fitBlock, fitLimb, NOMINAL, partsOf, REGIONS, setBodyParts, type BodyParts, type PartName } from "../../client/src/components/Map/interiors/body";
import { advance, eased, easeMotion, humanPose, motion, NEUTRAL, personaOf, restPose, standing, type Pose } from "../../client/src/components/Map/interiors/limbs";
import { Kit, figureSpec, lookOf } from "../../client/src/components/Map/models";

// The sculpted body (tools/blender/build-body.py), read as the browser reads it
const file = path.resolve(import.meta.dirname, "../../client/public/figures/body.glb");
const parse = (name: string): Promise<BodyParts> => {
  const buf = fs.readFileSync(path.resolve(path.dirname(file), name));
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => resolve(partsOf(g.scene)), reject));
};
const trianglesOf = (p: Record<number, THREE.BufferGeometry>) => Object.values(p).reduce((n, g) => n + g.index!.count / 3, 0);
const boundsOf = (gs: THREE.BufferGeometry[]) => { const b = new THREE.Box3(); for (const g of gs) { g.computeBoundingBox(); b.union(g.boundingBox!); } return b; };
// The volume a closed mesh holds (negative when its faces are turned inside out)
const volumeOf = (g: THREE.BufferGeometry) => {
  const p = g.attributes.position, idx = g.index!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < idx.count; i += 3) { a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i + 1)); c.fromBufferAttribute(p, idx.getX(i + 2)); v += a.dot(b.clone().cross(c)) / 6; }
  return v;
};

test("body.glb holds every part with its regions, a normal and an occlusion in 0 to 1 on each vertex", async () => {
  const body = await parse("body.glb");
  for (const name of Object.keys(REGIONS) as PartName[]) {
    const part = body[name];
    assert.deepEqual(Object.keys(part).map(Number).sort(), REGIONS[name], `${name}'s regions`);
    for (const g of Object.values(part)) {
      const ao = g.attributes.ao.array as Float32Array, n = g.attributes.normal as THREE.BufferAttribute;
      assert.ok(ao.every((v) => v > 0 && v <= 1.0001), `${name} occlusion`);
      for (let i = 0; i < n.count; i += 7) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 0.01, `${name} normals`);
    }
  }
  // (the budget: a whole person's body in about five thousand triangles, the low file in far fewer)
  const lo = await parse("body.lo.glb");
  const total = (b: BodyParts) => trianglesOf(b.torso) + trianglesOf(b.head) + 2 * (trianglesOf(b.arm) + trianglesOf(b.fore) + trianglesOf(b.thigh) + trianglesOf(b.shin));
  assert.ok(total(body) < 7000, `${total(body)} triangles`);
  assert.ok(total(lo) < total(body) / 3, `${total(lo)} triangles on a phone`);
});

test("the parts are made in the code's units: the arm hangs from the shoulder, the leg from the hip, the head about the origin", async () => {
  const body = await parse("body.glb");
  const arm = boundsOf(Object.values(body.arm));
  assert.ok(Math.abs(arm.max.y) < 0.005 && arm.min.y < -NOMINAL.arm! && arm.min.y > -NOMINAL.arm! - 0.06, `arm ${arm.min.y} to ${arm.max.y} (the elbow's ball past the segment)`);
  const fore = boundsOf(Object.values(body.fore));
  assert.ok(fore.min.y < -NOMINAL.fore! - 0.03 && fore.min.y > -0.26, "the hand reaches 0.04 past the hand's centre");
  const shin = boundsOf(Object.values(body.shin));
  assert.ok(shin.min.y < -NOMINAL.shin! - 0.07 && shin.min.y > -0.33, `the boot's sole is 0.08 under the ankle: ${shin.min.y}`);
  assert.ok(shin.max.z > 0.12 && shin.min.z < -0.04, "the foot points forward (+z)");
  const head = boundsOf(Object.values(body.head));
  assert.ok(head.max.z > 0.1 && head.max.z < 0.14 && Math.abs(head.max.y - 0.12) < 0.02 && Math.abs(head.max.x - 0.115) < 0.03, `head ${head.max.toArray()}`);
  const torso = boundsOf(Object.values(body.torso));
  assert.ok(torso.min.y < -0.09 && torso.max.y > 0.44 && torso.max.x < 0.2 && torso.max.z < 0.12, `torso ${torso.min.toArray()} ${torso.max.toArray()}`);
});

test("a limb fits to the points a pose gives: stretched between its joints, its hand or boot kept at its size, mirrored for the right side, never inside out", async () => {
  const body = await parse("body.glb");
  const hanging = (side: 1 | -1, to: [number, number, number]) => Object.values(body.fore).map((g) => fitLimb(g, { from: [0, 0, 0], to, nominal: NOMINAL.fore!, bulk: 1, side }));
  const rest = boundsOf(hanging(1, [0, -NOMINAL.fore!, 0]));
  const original = boundsOf(Object.values(body.fore));
  assert.ok(rest.min.distanceTo(original.min) < 1e-4 && rest.max.distanceTo(original.max) < 1e-4, "at its own length it is as made");
  // a longer reach stretches the forearm and carries the hand on: the hand's own length is kept
  const longer = boundsOf(hanging(1, [0, -0.3, 0]));
  assert.ok(Math.abs(longer.min.y - (original.min.y - 0.11)) < 1e-4, `the whole is ${longer.min.y - original.min.y} longer, not stretched in the hand`);
  // pointing forward (a rifle's forearm): the part lies along +z
  const forward = boundsOf(hanging(1, [0, 0, 0.19]));
  assert.ok(forward.max.z > 0.2 && Math.abs(forward.min.y) < 0.07, "it points along +z");
  // the right side is the left one mirrored, and is not turned inside out
  const left = boundsOf(hanging(1, [0, -0.19, 0])), right = boundsOf(hanging(-1, [0, -0.19, 0]));
  assert.ok(Math.abs(left.max.x + right.min.x) < 1e-5 && Math.abs(left.min.x + right.max.x) < 1e-5, "mirrored");
  for (const side of [1, -1] as const) for (const g of Object.values(body.arm)) assert.ok(volumeOf(fitLimb(g, { from: [0, 0, 0], to: [0.04, -0.22, 0.03], nominal: NOMINAL.arm!, bulk: 1.2, side })) > 0, `side ${side} faces outward`);
  // the width follows the bulk
  const wide = boundsOf(Object.values(body.thigh).map((g) => fitLimb(g, { from: [0, 0, 0], to: [0, -0.25, 0], nominal: NOMINAL.thigh!, bulk: 1.5 })));
  const thin = boundsOf(Object.values(body.thigh).map((g) => fitLimb(g, { from: [0, 0, 0], to: [0, -0.25, 0], nominal: NOMINAL.thigh!, bulk: 1 })));
  assert.ok(Math.abs(wide.max.x / thin.max.x - 1.5) < 0.01);
  // a trunk takes the bulk across and front to back only
  const block = boundsOf(Object.values(body.torso).map((g) => fitBlock(g, [1.2, 1, 1.2])));
  assert.ok(Math.abs(block.max.x / boundsOf(Object.values(body.torso)).max.x - 1.2) < 1e-4 && Math.abs(block.max.y - boundsOf(Object.values(body.torso)).max.y) < 1e-6);
});

test("a person is drawn from the sculpted body once it is loaded, with its colours multiplied by the occlusion, and as primitives before", async () => {
  setBodyParts(null);
  const look = lookOf({ name: "Human", skinColorOptions: "Light to dark tones", hairColorOptions: "Black, brown", heightAverage: "4'8\"", heightRollMod: "+2d10\"" } as never);
  const build = () => { const spec = figureSpec("person", "Dax bartender", { role: "bartender", looks: { human: look } }); const k = new Kit(); k.animated = true; spec.build(k); return { k, key: spec.key }; };
  const before = build();
  const trisBefore = before.k.parts.reduce((n, p) => n + p.geo.index!.count / 3, 0);
  setBodyParts(await parse("body.glb"));
  assert.ok(bodyParts());
  const after = build();
  const trisAfter = after.k.parts.reduce((n, p) => n + p.geo.index!.count / 3, 0);
  assert.notEqual(before.key, after.key, "the model is rebuilt when the body arrives");
  assert.ok(trisAfter > trisBefore, `${trisBefore} -> ${trisAfter} triangles`);
  assert.ok(trisAfter < 12000, `${trisAfter} triangles in a figure`);
  // every vertex is on a limb and keeps its pivot; the joints are all there
  assert.ok(after.k.parts.every((p) => p.geo.attributes.limb && p.geo.attributes.pivot));
  for (const l of [1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19]) assert.ok(after.k.jointMask & (1 << l), `limb ${l}`);
  // the occlusion darkens: some vertex of a skin part is darker than the part's colour
  const skin = after.k.parts.find((p) => p.finish === "skin" || p.finish === "face");
  assert.ok(skin);
  const c = skin!.geo.attributes.color.array as Float32Array;
  assert.ok(Math.max(...c) > Math.min(...c) * 1.05, "shaded by the occlusion");
  // a prosthetic leg is still drawn the old way, so the part list differs only in the leg
  setBodyParts(null);
});

test("a person keeps their own way of moving, the same each time, and no two are alike", () => {
  assert.deepEqual(personaOf(1234), personaOf(1234));
  const some = [1, 2, 3, 99, 4242, 123456].map(personaOf);
  for (const p of some) {
    assert.ok(p.stride >= 0.9 && p.stride <= 1.12 && p.sway >= 0.6 && p.sway <= 1.6 && p.slump >= -0.05 && p.slump <= 0.14 && p.swing >= 0.75 && p.swing <= 1.3 && p.fidget >= 0.6 && p.fidget <= 1.5);
  }
  assert.equal(new Set(some.map((p) => p.phase.toFixed(4))).size, some.length, "each is in their own phase");
});

const angleX = (p: Pose, limb: number) => { const q = new THREE.Quaternion(p[limb * 4], p[limb * 4 + 1], p[limb * 4 + 2], p[limb * 4 + 3]); return new THREE.Euler().setFromQuaternion(q, "XYZ").x; };
const LEGS = { hip: 0.56, knee: 0.31 };
const calmed = () => { const e = eased(); for (let i = 0; i < 90; i++) easeMotion(e, motion(), 1 / 30); return e; };

test("at rest a person breathes and shifts their weight: the unloaded knee eases, the body moves over the loaded foot, and none of it is there on the move", () => {
  const out = restPose();
  const p = { ...NEUTRAL };
  // the weight shift is a slow sine: left loaded a quarter of the way into it, the right loaded three quarters in
  const quarter = Math.PI / 2 / 0.43;
  const left = humanPose(standing(), quarter, motion(), calmed(), "none", "niman", 10, LEGS, out, p);
  assert.ok(left.sway > 0.008, `the body moves over the left foot: ${left.sway}`);
  assert.ok(angleX(out, 16) > 0.1 && Math.abs(angleX(out, 17)) < 0.02, "the right knee (the unloaded one) is eased and the left is straight");
  assert.ok(left.roll < 0, "the body tips toward the loaded side");
  const right = humanPose(standing(), 3 * quarter, motion(), calmed(), "none", "niman", 10, LEGS, out, p);
  assert.ok(right.sway < -0.008 && angleX(out, 17) > 0.1, "and the other way a while later");
  // a person with a lively fidget shifts more than a still one
  const lively = humanPose(standing(), quarter, motion(), calmed(), "none", "niman", 10, LEGS, out, { ...p, sway: 1.6, fidget: 1.5 });
  const still = humanPose(standing(), quarter, motion(), calmed(), "none", "niman", 10, LEGS, out, { ...p, sway: 0.6, fidget: 0.6 });
  assert.ok(Math.abs(lively.sway) > Math.abs(still.sway));
  // walking, the idle weight shift is gone (the stride is what the legs do) and aiming holds the body still
  let s = standing();
  for (let i = 0; i < 40; i++) s = advance(s, 0.1, 1 / 30);
  humanPose({ ...s, phase: 0 }, quarter, motion(), calmed(), "none", "niman", 10, LEGS, out, p);
  assert.ok(Math.abs(angleX(out, 16)) < 0.4);
  const aiming = motion({ ready: true });
  const e = eased(); for (let i = 0; i < 90; i++) easeMotion(e, aiming, 1 / 30);
  const held = humanPose(standing(), quarter, aiming, e, "rifle", "niman", 10, LEGS, out, p);
  assert.ok(Math.abs(held.sway) < Math.abs(left.sway) * 0.4, `aiming sways ${held.sway}`);
});

test("walking, the hips drop and the body shifts over the foot it stands on once a stride, the hips and the shoulders twist against each other, the elbow flexes as the hand comes forward", () => {
  const out = restPose();
  let s = standing();
  for (let i = 0; i < 60; i++) s = advance(s, 0.1, 1 / 30);
  const at = (phase: number) => ({ ...s, phase });
  const a = humanPose(at(Math.PI / 2), 0, motion(), eased(), "none", "niman", 10, LEGS, out);
  const b = humanPose(at(-Math.PI / 2), 0, motion(), eased(), "none", "niman", 10, LEGS, out);
  assert.ok(a.sway < -0.005 && b.sway > 0.005, "over the right foot, then the left");
  assert.ok(a.roll > 0.01 && b.roll < -0.01, "the body tips to the foot it stands on");
  assert.ok(a.spin * b.spin < 0, "the hips twist one way and then the other");
  // the arm forward bends more at the elbow than the arm back
  humanPose(at(Math.PI / 2), 0, motion(), eased(), "none", "niman", 10, LEGS, out);
  const [armR, foreR, armL, foreL] = [angleX(out, 3), angleX(out, 14), angleX(out, 4), angleX(out, 15)];
  const [forward, back] = armR < armL ? [foreR, foreL] : [foreL, foreR];
  assert.ok(forward < back - 0.1, `fore ${forward} against ${back}`);
});

test("a start leans the body forward, a stop back; a turn banks it into the turn; none of this at a standstill", () => {
  let s = standing();
  const out = restPose();
  for (let i = 0; i < 6; i++) s = advance(s, 0.1, 1 / 30, 1, 0);
  assert.ok((s.accel ?? 0) > 2, `accelerating ${s.accel}`);
  const start = humanPose(s, 0, motion(), eased(), "none", "niman", 10, LEGS, out);
  assert.ok(start.pitch > 0.01, `leans forward ${start.pitch}`);
  // at a steady pace the lean fades; stopping, it goes back
  for (let i = 0; i < 90; i++) s = advance(s, 0.1, 1 / 30, 1, 0);
  assert.ok(Math.abs(s.accel ?? 0) < 0.3);
  for (let i = 0; i < 4; i++) s = advance(s, 0, 1 / 30, 1, 0);
  assert.ok(humanPose(s, 0, motion(), eased(), "none", "niman", 10, LEGS, out).pitch < 0, "back at a stop");
  // turning to the figure's left (the heading grows) banks the top to the left: a negative roll
  let t = standing();
  let heading = 0;
  for (let i = 0; i < 60; i++) { heading += 0.06; t = advance(t, 0.1, 1 / 30, 1, heading); }
  assert.ok((t.turn ?? 0) > 1, `turning ${t.turn}`);
  const banked = humanPose({ ...t, phase: 0 }, 0, motion(), eased(), "none", "niman", 10, LEGS, out);
  assert.ok(banked.roll < -0.03, `banks ${banked.roll}`);
  // a jump of the figure is neither a turn nor a start
  const jumped = advance({ ...standing(), heading: 0 }, 50, 1 / 30, 1, 2);
  assert.ok(Math.abs(jumped.turn ?? 0) < 0.01);
});
