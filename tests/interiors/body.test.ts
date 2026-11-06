import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bodyParts, creatureParts, fitBlock, fitLimb, NOMINAL, partsOf, piecesOf, REGIONS, setBodyParts, setCreatureParts, type BodyParts, type CreatureParts, type PartName } from "../../client/src/components/Map/interiors/body";
import { advance, DEKA, eased, easeMotion, gaitPose, humanPose, LIMB, LIMBS, motion, NEUTRAL, PARENT, personaOf, restPose, standing, climbCycle, climbPhase, RUNG, mountPose, mountPlace, type Pose } from "../../client/src/components/Map/interiors/limbs";
import { Kit, figureSpec, lookOf, creaturePlan, buildCreature, buildDroid, waveOf, UNITS_PER_M, beastMetres, beastScale, beastBuilt, seatFor, constructKind, droidKind, figureTop, HAILFIRE_CAMBER, strideCycle } from "../../client/src/components/Map/models";
import { tokenOf } from "../../client/src/components/Map/sprites";

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

// ---- Beasts and the species with a muzzle (tools/blender/build-creature.py, and the heads in build-body.py) -----------------------------------------

const readFile = (name: string) => {
  const buf = fs.readFileSync(path.resolve(path.dirname(file), name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const piecesFrom = (name: string): Promise<CreatureParts> => new Promise((resolve, reject) => new GLTFLoader().parse(readFile(name), "", (g) => resolve(piecesOf(g.scene)), reject));
const HEADS = ["cat", "dog", "long", "blunt", "reptile", "rhino", "boar", "rancor", "wampa", "ape", "horned", "bird", "tauntaun", "lizard"];
const nearest = (gs: THREE.BufferGeometry[], at: THREE.Vector3) => {
  let best = Infinity;
  const v = new THREE.Vector3();
  for (const g of gs) for (let i = 0; i < g.attributes.position.count; i++) best = Math.min(best, v.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i).distanceTo(at));
  return best;
};

test("creature.glb holds a head for every kind of beast, ears, a jaw and a beak; each with its eyes on the skull, occlusion and marks in range", async () => {
  const all = await piecesFrom("creature.glb");
  for (const n of [...HEADS, "ear_cat", "ear_dog", "ear_long", "ear_round", "rancor_jaw", "beak"]) assert.ok(all[n], `${n} is in the file`);
  for (const n of HEADS) {
    const piece = all[n];
    assert.equal(piece.eyes?.length, 4, `${n} says where its eyes are`);
    const [x, y, z, r] = piece.eyes!;
    assert.ok(x > 0 && r > 0.01 && r < 0.04, `${n}'s eye ${piece.eyes}`);
    const geos = Object.values(piece.part);
    assert.ok(nearest(geos, new THREE.Vector3(x, y, z)) < r * 2.2, `${n}'s eye is on its skull (${nearest(geos, new THREE.Vector3(x, y, z)).toFixed(3)})`);
    for (const g of geos) {
      assert.ok((g.attributes.ao.array as Float32Array).every((v) => v > 0 && v <= 1.0001), `${n} occlusion`);
      assert.ok((g.attributes.mark.array as Float32Array).every((v) => v >= -1.0001 && v <= 1.0001), `${n} marks`);
    }
    assert.ok(trianglesOf(piece.part) < 2600, `${n}: ${trianglesOf(piece.part)} triangles`);
  }
  // the heads are the sizes the code draws them at (a quadruped's head for a body 0.3 thick: a hand's breadth to a forearm long)
  for (const n of ["cat", "dog", "long", "blunt", "reptile", "rhino", "boar"]) {
    const b = boundsOf(Object.values(all[n].part));
    assert.ok(b.max.z > 0.17 && b.max.z < 0.45 && b.max.x > 0.07 && b.max.x < 0.25 && b.min.z > -0.25, `${n} ${b.min.toArray()} ${b.max.toArray()}`);
  }
  const lo = await piecesFrom("creature.lo.glb");
  for (const n of HEADS) assert.ok(trianglesOf(lo[n].part) < trianglesOf(all[n].part) / 3, `${n} on a phone`);
});

test("body.glb carries a head for each kind of muzzle and a beak, made the size of a person's head with the nose and lips left out", async () => {
  const body = await parse("body.glb");
  const more = body.more ?? {};
  for (const n of ["head_muzzle", "head_long", "head_short", "head_pig", "head_flat", "beak"]) assert.ok(more[n], n);
  const human = boundsOf(Object.values(body.head));
  const reach = (n: string) => boundsOf(Object.values(more[n].part)).max.z;
  assert.ok(reach("head_long") > reach("head_muzzle") && reach("head_muzzle") > reach("head_short") && reach("head_short") > human.max.z - 0.01, "a longer snout reaches further");
  assert.ok(reach("head_flat") < human.max.z, "the flat face has no nose");
  assert.ok(Object.values(more.head_muzzle.part).some((g) => g.attributes.mark && (g.attributes.mark.array as Float32Array).some((v) => v > 0.5)), "the nose pad and the nostrils are marked dark");
});

test("a beast is drawn from its sculpted head, its neck, head, ears, jaw and tail on joints of their own, and as primitives before", async () => {
  setCreatureParts(null);
  const build = (name: string) => { const plan = creaturePlan(name); const k = new Kit(); k.animated = true; buildCreature(k, plan, 0); return k; };
  const tris = (k: Kit) => k.parts.reduce((n, p) => n + p.geo.index!.count / 3, 0);
  const before = [build("nexu"), build("rancor"), build("kaadu")];
  setCreatureParts(await piecesFrom("creature.glb"));
  assert.ok(creatureParts());
  const after = [build("nexu"), build("rancor"), build("kaadu")];
  before.forEach((b, i) => assert.ok(tris(after[i]) > tris(b), `${tris(b)} -> ${tris(after[i])} triangles`));
  after.forEach((k) => { assert.ok(tris(k) < 20000); assert.ok(k.parts.every((p) => p.geo.attributes.limb && p.geo.attributes.pivot)); });
  const [nexu, rancor, kaadu] = after;
  for (const l of [LIMB.chest, LIMB.head, LIMB.earR, LIMB.earL, LIMB.tail, LIMB.tail2]) assert.ok(nexu.jointMask & (1 << l), `a cat has limb ${l}`);
  for (const l of [LIMB.chest, LIMB.head, LIMB.jaw]) assert.ok(rancor.jointMask & (1 << l), `a rancor has limb ${l}`);
  for (const l of [LIMB.chest, LIMB.head, LIMB.tail, LIMB.tail2]) assert.ok(kaadu.jointMask & (1 << l), `a runner has limb ${l}`);
  // the beast's colours are shaded by the occlusion and the marks: some vertex of its hide is darker than the hide's colour
  const colours = nexu.parts.flatMap((p) => Array.from(p.geo.attributes.color.array as Float32Array));
  assert.ok(Math.max(...colours) > Math.min(...colours) * 1.5);
  setCreatureParts(null);
});

test("the joints of a beast hang one from another: an ear from the head, the head from the neck, the tail's tip from the tail", () => {
  assert.equal(LIMBS, PARENT.length);
  assert.equal(PARENT[LIMB.head], LIMB.chest);
  assert.equal(PARENT[LIMB.earR], LIMB.head);
  assert.equal(PARENT[LIMB.earL], LIMB.head);
  assert.equal(PARENT[LIMB.jaw], LIMB.head);
  assert.equal(PARENT[LIMB.tail2], LIMB.tail);
  // (the shader follows three parents: an ear turns, then with the head, then with the neck)
  let depth = 0;
  for (let l: number = LIMB.earR; PARENT[l] >= 0; l = PARENT[l]) depth++;
  assert.ok(depth <= 3);
});

const euler = (p: Pose, limb: number) => new THREE.Euler().setFromQuaternion(new THREE.Quaternion(p[limb * 4], p[limb * 4 + 1], p[limb * 4 + 2], p[limb * 4 + 3]), "YXZ");

test("a beast at rest breathes, looks about, flicks an ear now and then and lets its tail follow; at a run its head dips with each step, the ears lay back and the jaw pants", () => {
  const rest = restPose();
  const calm = standing();
  const mine = { ...NEUTRAL, phase: 1.3 };
  let breathMin = 1, breathMax = -1, yaw = 0, flick = 0, jaw = 0;
  for (let t = 0; t < 60; t += 0.1) {
    gaitPose("quad", calm, t, rest, mine);
    breathMin = Math.min(breathMin, euler(rest, LIMB.chest).x);
    breathMax = Math.max(breathMax, euler(rest, LIMB.chest).x);
    yaw = Math.max(yaw, Math.abs(euler(rest, LIMB.head).y));
    flick = Math.max(flick, Math.abs(euler(rest, LIMB.earR).z), Math.abs(euler(rest, LIMB.earL).z));
    jaw = Math.max(jaw, euler(rest, LIMB.jaw).x);
  }
  assert.ok(breathMax - breathMin > 0.015, `it breathes: ${breathMax - breathMin}`);
  assert.ok(yaw > 0.12, `it looks about: ${yaw}`);
  assert.ok(flick > 0.2, `an ear flicks: ${flick}`);
  assert.ok(jaw > 0.02, `its mouth parts a little: ${jaw}`);
  // each beast keeps its own time: the same moment finds two of them in different places
  let apart = 0;
  for (let t = 0; t < 60; t += 0.5) {
    const one = gaitPose("quad", calm, t, restPose(), { ...NEUTRAL, phase: 0.4 });
    const two = gaitPose("quad", calm, t, restPose(), { ...NEUTRAL, phase: 3.9 });
    apart = Math.max(apart, Math.abs(euler(one, LIMB.chest).x - euler(two, LIMB.chest).x), Math.abs(euler(one, LIMB.head).y - euler(two, LIMB.head).y));
  }
  assert.ok(apart > 0.01, `two beasts are not in step: ${apart}`);
  // at a run
  let s = standing();
  for (let i = 0; i < 60; i++) s = advance(s, 0.1, 1 / 30);
  let dip = 0, pant = 0, laid = 0, tip = 0, base = 0;
  for (let ph = 0; ph < Math.PI * 2; ph += 0.2) {
    const run = gaitPose("quad", { ...s, phase: ph }, 5, restPose(), mine);
    dip = Math.max(dip, Math.abs(euler(run, LIMB.head).x));
    pant = Math.max(pant, euler(run, LIMB.jaw).x);
    laid = Math.min(laid, euler(run, LIMB.earR).x);
    tip = Math.max(tip, Math.abs(euler(run, LIMB.tail2).y));
    base = Math.max(base, Math.abs(euler(run, LIMB.tail).y));
  }
  assert.ok(dip > 0.06, `the head dips ${dip}`);
  assert.ok(pant > 0.05, `it pants ${pant}`);
  assert.ok(laid < -0.2, `the ears lay back ${laid}`);
  assert.ok(tip > base, `the tip of the tail swings further than its root: ${tip} against ${base}`);
});

test("creature.glb also holds the brutes' and runners' bodies, the serpents' heads, a hutt and wings, in the sizes the code draws them at", async () => {
  const all = await piecesFrom("creature.glb");
  const size = (n: string) => boundsOf(Object.values(all[n].part));
  for (const n of ["brute_torso", "brute_upper", "brute_fore", "brute_leg", "bird_bone", "bird_foot", "quad_body", "quad_thigh", "hutt", "wing_bird", "wing_bat", "wing_manta", "bug_thorax", "bug_abdomen", "bug_head", "bug_leg_a", "bug_leg_b"]) assert.ok(all[n], n);
  const torso = size("brute_torso");
  assert.ok(torso.min.y > -0.06 && torso.max.y > 0.6 && torso.max.y < 0.7 && torso.max.x > 0.3 && torso.max.x < 0.42, `a brute's trunk ${torso.min.toArray()} ${torso.max.toArray()}`);
  const fore = size("brute_fore");
  assert.ok(fore.min.y < -0.4 && fore.min.y > -0.62, `the hand reaches past the wrist: ${fore.min.y}`);
  const leg = size("brute_leg");
  assert.ok(leg.min.y < -0.27 && leg.max.z > 0.2, `the foot lies forward and its sole is below the ankle: ${leg.min.toArray()} ${leg.max.toArray()}`);
  const foot = size("bird_foot");
  assert.ok(foot.min.y < -0.12 && foot.max.z > 0.12, "a bird's toes spread forward");
  const hutt = size("hutt");
  assert.ok(hutt.max.y > 0.95 && hutt.max.y < 1.2 && hutt.min.z < -1.0 && hutt.max.x > 0.45, `a hutt ${hutt.min.toArray()} ${hutt.max.toArray()}`);
  for (const n of ["wing_bird", "wing_bat", "wing_manta"]) {
    const w = size(n);
    assert.ok(w.min.x > -0.05 && w.max.x > 0.45 && w.max.x < 0.6 && w.max.y - w.min.y < 0.25, `${n} runs out from the shoulder: ${w.min.toArray()} ${w.max.toArray()}`);
  }
  // the heads that say where their eyes are have them on the skull
  for (const n of ["serpent_dragon", "serpent_fish", "serpent_snake", "hutt"]) {
    const [x, y, z, r] = all[n].eyes!;
    assert.ok(nearest(Object.values(all[n].part), new THREE.Vector3(x, y, z)) < r * 2.5, `${n}'s eye is on its surface`);
  }
  const lo = await piecesFrom("creature.lo.glb");
  for (const n of ["hutt", "brute_torso", "serpent_dragon"]) assert.ok(trianglesOf(lo[n].part) < trianglesOf(all[n].part) / 3, `${n} on a phone`);
});

test("every kind of beast is drawn from the sculpted parts when they are in: a brute, a runner, a serpent, a hutt and the fliers, each with more triangles than its primitives and its joints", async () => {
  setCreatureParts(null);
  const build = (name: string) => { const plan = creaturePlan(name); const k = new Kit(); k.animated = true; buildCreature(k, plan, 0); return k; };
  const tris = (k: Kit) => k.parts.reduce((n, p) => n + p.geo.index!.count / 3, 0);
  const names = ["wampa", "kaadu", "krayt dragon", "exogorth", "opee sea killer", "snake", "hutt", "condor dragon", "hawk-bat", "mynock", "acklay", "kinrath", "womp rat", "mucous salamander", "jakrab", "nuna", "mott"];
  const before = names.map(build);
  setCreatureParts(await piecesFrom("creature.glb"));
  const after = names.map(build);
  names.forEach((n, i) => {
    assert.ok(tris(after[i]) > tris(before[i]), `${n}: ${tris(before[i])} -> ${tris(after[i])} triangles`);
    assert.ok(tris(after[i]) < 30000, `${n}: ${tris(after[i])} triangles`);
  });
  const joints = (k: Kit, ...l: number[]) => l.forEach((x) => assert.ok(k.jointMask & (1 << x), `limb ${x}`));
  joints(after[0], LIMB.chest, LIMB.head, LIMB.armL, LIMB.armR, LIMB.legL, LIMB.legR);
  joints(after[1], LIMB.legL, LIMB.legR, LIMB.tail2);
  joints(after[7], LIMB.wingL, LIMB.wingR);
  joints(after[10], LIMB.armL, LIMB.armR, LIMB.legL, LIMB.hindR);
  setCreatureParts(null);
});

test("serpents slither, lizards crawl, and the tails of runners and long-tailed beasts wave: each plan names its gait and its wave", () => {
  const spec = (name: string) => figureSpec("beast", name, { looks: {}, creature: "beast" });
  for (const n of ["Opee Sea Killer", "Exogorth", "Krayt Dragon", "Snake"]) {
    assert.equal(spec(n).gait, "slither", n);
    const w = spec(n).wave!;
    assert.ok(w && w.amp > 0.03 && w.length > 0.5 && w.origin > 0.3, `${n} has a wave that starts at the neck`);
  }
  assert.equal(spec("Ysalamir").gait, "crawl");
  assert.equal(spec("Dewback").gait, "crawl");
  for (const n of ["Ysalamir", "Monkey-lizard", "Kaadu", "Dewback"]) assert.ok(spec(n).wave, `${n} has a wave`);
  assert.ok(figureSpec("hutt", "Hutt Crime Lord", { looks: {}, creature: "beast" }).wave, "a hutt's tail waves");
  assert.ok(spec("Kaadu").wave!.origin < 0 && spec("Monkey-lizard").wave!.origin < 0.1, "a tail's wave starts behind the hips");
  assert.equal(waveOf(creaturePlan("bantha")), undefined, "a short tail does not wave");
  assert.ok(waveOf(creaturePlan("nexu"))!.origin < -0.3, "a cat's long tail does");
});

test("a wave is written into the last slot of a pose, grows with the stride, keeps its own time for each beast, and gives the tail's own swing way", () => {
  const w = { origin: 0.45, amp: 0.1, length: 0.8, idle: 0.3 };
  const slot = (p: Pose) => Array.from(p.slice(LIMB.wave * 4, LIMB.wave * 4 + 4));
  assert.deepEqual(slot(restPose()), [0, 0, 0, 1], "the rest pose has no wave");
  assert.equal(slot(gaitPose("walk", standing(), 1, restPose(), NEUTRAL))[0], 0, "no wave unless asked");
  const still = slot(gaitPose("slither", standing(), 1, restPose(), NEUTRAL, w));
  const going = slot(gaitPose("slither", { phase: 1, amp: 1, speed: 3 }, 1, restPose(), NEUTRAL, w));
  assert.ok(Math.abs(still[0] - 0.03) < 1e-6 && Math.abs(going[0] - 0.1) < 1e-6, `${still[0]} resting, ${going[0]} going`);
  assert.ok(Math.abs(still[1] - (Math.PI * 2) / 0.8) < 1e-5 && Math.abs(still[3] - 0.45) < 1e-6);
  const a = slot(gaitPose("slither", standing(), 1, restPose(), personaOf(1), w))[2];
  const b = slot(gaitPose("slither", standing(), 1, restPose(), personaOf(2), w))[2];
  assert.notEqual(a, b, "two serpents are not in step");
  // by the clock a resting serpent still moves
  const later = slot(gaitPose("slither", standing(), 2, restPose(), NEUTRAL, w))[2];
  assert.notEqual(later, still[2]);
  // the walk's own tail swing gives way to the wave
  const swing = gaitPose("walk", { phase: 1, amp: 1, speed: 3 }, 1, restPose(), NEUTRAL);
  const waved = gaitPose("walk", { phase: 1, amp: 1, speed: 3 }, 1, restPose(), NEUTRAL, w);
  assert.ok(Math.abs(swing[LIMB.tail * 4 + 1]) > 0.01 && waved[LIMB.tail * 4 + 1] === 0 && waved[LIMB.tail2 * 4 + 1] === 0);
  assert.equal(LIMBS, PARENT.length);
});

test("a krayt dragon's six legs step in threes and a lizard's four in pairs, each lifting outward as it comes forward; a serpent has none", () => {
  const at = (gait: "slither" | "crawl", phase: number) => gaitPose(gait, { phase, amp: 1, speed: 3 }, 0, restPose(), NEUTRAL);
  const angleX = (p: Pose, l: number) => 2 * Math.atan2(p[l * 4], p[l * 4 + 3]);
  const angleZ = (p: Pose, l: number) => 2 * Math.atan2(p[l * 4 + 2], p[l * 4 + 3]);
  const p = at("slither", Math.PI / 2);
  // the right fore, left middle and right hind are together, against the others
  assert.ok(Math.abs(angleX(p, LIMB.legR) - angleX(p, LIMB.midL)) < 1e-6 && Math.abs(angleX(p, LIMB.legR) - angleX(p, LIMB.hindR)) < 1e-6);
  assert.ok(Math.abs(angleX(p, LIMB.legR) + angleX(p, LIMB.legL)) < 1e-6 && Math.abs(angleX(p, LIMB.legR)) > 0.2);
  // a leg coming forward (its angle falling) is lifted out to its side, one going back is not
  const forward = at("crawl", (3 * Math.PI) / 4);
  const back = at("crawl", Math.PI / 4);
  // (the right fore and the left hind step together: here they come forward, lifting outward, the left legs to +z and the right to -z)
  assert.ok(angleZ(forward, LIMB.legR) < -0.1 && angleZ(forward, LIMB.hindL) > 0.1 && Math.abs(angleZ(forward, LIMB.legL)) < 1e-6 && Math.abs(angleZ(forward, LIMB.hindR)) < 1e-6);
  assert.ok(angleZ(back, LIMB.legL) > 0.1 && angleZ(back, LIMB.hindR) < -0.1 && Math.abs(angleZ(back, LIMB.legR)) < 1e-6);
  const rest = at("slither", 0);
  assert.ok(Math.abs(angleX(rest, LIMB.legR)) < 1e-6);
});

test("a krayt dragon stands on feet, a hutt has hands, and a serpent that moves is built straight for its wave to bend", async () => {
  setCreatureParts(await piecesFrom("creature.glb"));
  const all = await piecesFrom("creature.glb");
  const size = (n: string) => boundsOf(Object.values(all[n].part));
  const fore = size("hutt_fore");
  assert.ok(fore.min.y < -0.3 && fore.max.x > 0.07, `the hand is past the wrist and has a thumb: ${fore.min.toArray()} ${fore.max.toArray()}`);
  assert.ok(trianglesOf(all.hutt_fore.part) > 400 && trianglesOf(all.hutt_upper.part) > 200);
  const bake = (name: string, animated: boolean) => { const k = new Kit(); k.animated = animated; buildCreature(k, creaturePlan(name), 0); return k; };
  const kinds = (k: Kit) => k.parts.reduce((n, p) => n + p.geo.index!.count / 3, 0);
  const lowest = (k: Kit, limbs: number[]) => {
    let y = Infinity;
    for (const part of k.parts) {
      const g = part.geo, limb = g.attributes.limb as THREE.BufferAttribute | undefined;
      if (!limb) continue;
      for (let i = 0; i < g.attributes.position.count; i++) if (limbs.includes(Math.round(limb.getX(i)))) y = Math.min(y, g.attributes.position.getY(i));
    }
    return y;
  };
  const krayt = bake("krayt dragon", true);
  for (const l of [LIMB.legR, LIMB.legL, LIMB.midR, LIMB.midL, LIMB.hindR, LIMB.hindL]) assert.ok(krayt.jointMask & (1 << l), `krayt limb ${l}`);
  const sole = lowest(krayt, [LIMB.shinR, LIMB.shinL, LIMB.shinMR, LIMB.shinML, LIMB.shinHR, LIMB.shinHL]);
  assert.ok(sole < 0.02 && sole > -0.03, `a krayt dragon's feet are on the ground: ${sole}`);
  const hutt = bake("hutt", true);
  for (const l of [LIMB.armR, LIMB.armL, LIMB.foreR, LIMB.foreL]) assert.ok(hutt.jointMask & (1 << l), `hutt limb ${l}`);
  assert.ok(kinds(hutt) > kinds(bake("snake", true)));
  // a moving serpent is straight (its wave bends it); one that is only looked at keeps its curve
  const spread = (k: Kit) => { let a = Infinity, b = -Infinity; for (const part of k.parts) { const p = part.geo.attributes.position; for (let i = 0; i < p.count; i++) { a = Math.min(a, p.getX(i)); b = Math.max(b, p.getX(i)); } } return b - a; };
  assert.ok(spread(bake("snake", false)) > spread(bake("snake", true)) + 0.1);
  setCreatureParts(null);
});

// Every vertex of a baked animated model, put where the shader puts it in a pose (turned about its limb's pivot, then about each joint it hangs from)
function posedVertices(k: Kit, pose: Pose, only?: Set<number>): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const q = (l: number) => new THREE.Quaternion(pose[l * 4], pose[l * 4 + 1], pose[l * 4 + 2], pose[l * 4 + 3]);
  const pivot = (l: number) => new THREE.Vector3(k.pivots[l * 3], k.pivots[l * 3 + 1], k.pivots[l * 3 + 2]);
  for (const part of k.parts) {
    const p = part.geo.attributes.position, limb = part.geo.attributes.limb as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const l = Math.round(limb.getX(i));
      if (only && !only.has(l)) continue;
      if (l > 0) {
        v.sub(pivot(l)).applyQuaternion(q(l)).add(pivot(l));
        let pa = PARENT[l];
        for (let n = 0; n < 3 && pa >= 0; n++) { v.sub(pivot(pa)).applyQuaternion(q(pa)).add(pivot(pa)); pa = PARENT[pa]; }
      }
      out.push(v);
    }
  }
  return out;
}

test("a droideka is one model: folded, every part of it lies within its wheel, standing it is upright on its feet, and halfway it is between", () => {
  const k = new Kit();
  k.animated = true;
  buildDroid(k, "destroyer", "Destroyer Droid");
  const hub = new THREE.Vector3(...DEKA.hub);
  const folded = restPose();
  gaitPose("droideka", standing(), 0, folded, NEUTRAL, undefined, 1);
  const rim = posedVertices(k, folded);
  const farthest = Math.max(...rim.map((v) => v.distanceTo(hub)));
  assert.ok(farthest < DEKA.outer + 0.03, `folded, nothing is outside the wheel: ${farthest} against ${DEKA.outer}`);
  assert.ok(Math.max(...rim.map((v) => Math.abs(v.x))) < 0.2, "and it is a narrow wheel");
  // the rim is all there: the points of the rim round the wheel are each near some vertex (no gap where a plate should be)
  for (let a = 0; a < 360; a += 20) {
    const at = hub.clone().add(new THREE.Vector3(0, Math.sin((a * Math.PI) / 180), Math.cos((a * Math.PI) / 180)).multiplyScalar(DEKA.rim));
    assert.ok(rim.some((v) => v.distanceTo(at) < 0.09), `a plate of the rim at ${a} degrees`);
  }
  const stand = posedVertices(k, restPose());
  assert.ok(Math.min(...stand.map((v) => v.y)) > -0.03 && Math.min(...stand.map((v) => v.y)) < 0.06, "standing, its feet are on the ground");
  assert.ok(Math.max(...stand.map((v) => v.y)) > 0.8, "and it is taller than the wheel");
  // folded it is much lower and smaller than standing; halfway it is in between
  const half = restPose();
  gaitPose("droideka", standing(), 0, half, NEUTRAL, undefined, 0.5);
  const reach = (vs: THREE.Vector3[]) => Math.max(...vs.map((v) => v.distanceTo(hub)));
  const [rs, rr] = [reach(stand), reach(rim)];
  assert.ok(rr < rs, `standing reaches further from the hub (${rs}) than folded (${rr})`);
});

test("beasts and droids with legs have knees: a shin on its own joint under each thigh, with and without the sculpted parts", async () => {
  const bake = (build: (k: Kit) => void) => { const k = new Kit(); k.animated = true; build(k); return k; };
  const has = (k: Kit, ...l: number[]) => l.forEach((x) => assert.ok(k.jointMask & (1 << x), `limb ${x}`));
  const beast = (name: string) => bake((k) => buildCreature(k, creaturePlan(name), 0));
  const droid = (kind: string) => bake((k) => buildDroid(k, kind, kind));
  const check = () => {
    for (const n of ["bantha", "dewback", "nexu"]) has(beast(n), LIMB.shinR, LIMB.shinL, LIMB.shinHR, LIMB.shinHL);
    has(beast("wampa"), LIMB.shinR, LIMB.shinL);
    has(beast("kaadu"), LIMB.shinR, LIMB.shinL);
    has(beast("acklay"), LIMB.shinR, LIMB.shinL, LIMB.shinHR, LIMB.shinHL);
    has(beast("krayt dragon"), LIMB.shinR, LIMB.shinL, LIMB.shinMR, LIMB.shinML, LIMB.shinHR, LIMB.shinHL);
    for (const kind of ["b1", "bx", "tactical", "b2", "ig", "hk", "kx", "pit"]) has(droid(kind), LIMB.shinR, LIMB.shinL);
    for (const kind of ["spider", "generic"]) has(droid(kind), LIMB.shinR, LIMB.shinL, LIMB.shinHR, LIMB.shinHL);
  };
  setCreatureParts(null);
  check();
  setCreatureParts(await piecesFrom("creature.glb"));
  check();
  setCreatureParts(null);
  // (an acklay walks as a quadruped does; a spider keeps its eight)
  assert.equal(figureSpec("beast", "Acklay, Adult", { looks: {}, creature: "beast" }).gait, "quad");
  assert.equal(figureSpec("beast", "Knobby White Spider", { looks: {}, creature: "beast" }).gait, "hexa");
});

// The droids of the stat blocks, each built as the map builds it and scaled as Figure scales it
type DroidBlock = { name: string; size: string; flavorText?: string; types?: string[] };
const droidBlocks = (JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../shared/data/sw5e/monsters.json"), "utf8")) as DroidBlock[]).filter((m) => (m.types ?? []).includes("droid"));
function droidTop(b: DroidBlock) {
  const spec = figureSpec(tokenOf({ name: b.name, creature: "droid" }), b.name, { creature: "droid", size: b.size, looks: {} });
  const k = new Kit();
  k.animated = true;
  spec.build(k);
  const box = new THREE.Box3();
  for (const p of k.parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox!); }
  return { spec, top: box.max.y * (spec.scale ?? 1), width: (box.max.x - box.min.x) * (spec.scale ?? 1), depth: (box.max.z - box.min.z) * (spec.scale ?? 1) };
}

test("droids are drawn to scale: each stands at its stature, a person is the yardstick, and a rule's size is a band the droid sits in", async () => {
  assert.ok(droidBlocks.length >= 40, "the droid stat blocks are there");
  setBodyParts(null);
  const human = (() => { const spec = figureSpec("humanoid", "Citizen", { role: "civilian", species: "Human", looks: {} }); const k = new Kit(); k.animated = true; spec.build(k); const b = new THREE.Box3(); for (const p of k.parts) { p.geo.computeBoundingBox(); b.union(p.geo.boundingBox!); } return b.max.y; })();
  assert.ok(Math.abs(human / UNITS_PER_M - 1.702) < 0.06, `a person of scale 1 is 1.70 m: ${human / UNITS_PER_M}`);
  const metres = (b: DroidBlock) => droidTop(b).top / UNITS_PER_M;
  const bands: Record<string, [number, number]> = { Tiny: [0.15, 1.0], Small: [0.6, 1.45], Medium: [1.0, 2.4], Large: [1.1, 3.5], Huge: [2.2, 6] };
  for (const b of droidBlocks) {
    const { spec, top } = droidTop(b);
    assert.ok(Math.abs(top - spec.height) < spec.height * 0.04, `${b.name}: it stands where it is meant to (${top} against ${spec.height})`);
    const m = top / UNITS_PER_M, [lo, hi] = bands[b.size];
    assert.ok(m >= lo && m <= hi, `${b.name} (${b.size}) is ${m.toFixed(2)} m: outside the ${lo} to ${hi} m a ${b.size} droid is`);
    assert.ok(spec.foot !== undefined && spec.scale !== undefined, `${b.name} has a scale and a footprint`);
  }
  // The sizes keep their order: the smallest of a bigger size is not smaller than the biggest of a smaller one, except where the book's own
  // stature (a Viper probe, 1.6 m, Large; a JK-13, "chest-high", Large) is smaller than a Medium droid's
  const by = (size: string) => droidBlocks.filter((b) => b.size === size).map(metres);
  assert.ok(Math.max(...by("Tiny")) < Math.min(...by("Medium")), "a Tiny droid is smaller than a Medium one");
  assert.ok(Math.max(...by("Small")) < Math.min(...by("Huge")) && Math.min(...by("Huge")) > Math.max(...by("Medium")), "and a Huge one is bigger than a Medium one");
  // Against each other, as the films have them
  const named = (n: string) => droidBlocks.find((b) => b.name.startsWith(n))!;
  const h = (n: string) => droidTop(named(n)).top;
  assert.ok(h("B1 Series") > human * 1.05, "a B1 is taller than a person");
  assert.ok(h("B2 Series") >= h("B1 Series"), "a B2 is not shorter than a B1");
  assert.ok(Math.abs(h("000 Series") / human - 1) < 0.08, "a protocol droid is a person's height");
  assert.ok(h("R2 Series") / h("3P0 Series") > 0.55 && h("R2 Series") / h("3P0 Series") < 0.75, "R2 is two thirds of 3PO");
  assert.ok(h("BB Series") < h("R2 Series") && h("Pistoeka") < h("BB Series"), "a BB unit is smaller than an R2, a mouse droid smaller than both");
  assert.ok(h("DRK-1") < h("R2 Series"), "a Tiny probe is smaller than a Small astromech");
  assert.ok(h("KX-Series") > h("HK Series") * 0.95 && h("HK Series") > human, "a KX stands over an HK, an HK over a person");
  assert.ok(h("IG-227") > h("Destroyer") * 2, "a hailfire is a machine, much taller than a droideka");
  // What the books state is what is drawn: "stand 1.19 meters tall", "measures 1.6 meters in height"
  let stated = 0;
  for (const b of droidBlocks) {
    const m = (b.flavorText ?? "").match(/(\d+(?:\.\d+)?)\s*meters?\s*(?:tall|in height)/i);
    if (!m) continue;
    stated++;
    assert.ok(Math.abs(metres(b) - Number(m[1])) < Number(m[1]) * 0.05, `${b.name}: the book says ${m[1]} m, it is drawn ${metres(b).toFixed(2)} m`);
  }
  assert.ok(stated >= 2, "the pit droid and the Viper state their heights");
  // The war machines are the walkers and tanks: the droids that were among them (hailfire, vulture, hyena) are droids, with joints that move
  for (const n of ["IG-227 Hailfire-Class Droid", "Vulture-Class Droid", "Hyena-Class Bomber"]) assert.equal(constructKind(n), undefined, n);
  assert.equal(droidKind("SD-K4 Assassin Droid"), "probe", "it floats");
  assert.equal(droidKind("JK-13 Security Droid"), "spider", "it is chest-high and insect-like");
});

test("a protocol droid is a person's height with the sculpted body in, and a droid's label goes over its head", async () => {
  setBodyParts(await parse("body.glb"));
  const { top } = droidTop(droidBlocks.find((b) => b.name.startsWith("000 Series"))!);
  setBodyParts(null);
  assert.ok(Math.abs(top / UNITS_PER_M - 1.67) < 0.12, `a protocol droid with the sculpted body is ${top / UNITS_PER_M} m`);
  assert.ok(figureTop("droid", "Hailfire", "Huge", true) > 3, "above a hailfire");
  assert.ok(figureTop("droid", "DRK-1 Tracker Droid", "Tiny") < 0.6, "and close over a probe");
  assert.equal(figureTop("humanoid", "Citizen"), 1.2);
});

// The war machines (the constructs of the stat blocks), built as the map builds them and scaled as Figure scales them
const constructBlocks = (JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../shared/data/sw5e/monsters.json"), "utf8")) as DroidBlock[]).filter((m) => (m.types ?? []).includes("construct"));
function machineSize(name: string) {
  const b = constructBlocks.find((c) => c.name.startsWith(name));
  assert.ok(b, name);
  const spec = figureSpec(tokenOf({ name: b.name, creature: "construct" }), b.name, { creature: "construct", size: b.size, looks: {} });
  const k = new Kit();
  k.animated = true;
  spec.build(k);
  const box = new THREE.Box3();
  for (const p of k.parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox!); }
  const s = spec.scale ?? 1;
  return { spec, k, h: (box.max.y * s) / UNITS_PER_M, len: ((box.max.z - box.min.z) * s) / UNITS_PER_M, width: ((box.max.x - box.min.x) * s) / UNITS_PER_M };
}

test("war machines are drawn at the size the books give them, in the proportions of the films: a walker tall, a tank long and low", () => {
  assert.equal(constructBlocks.length, 14);
  const near = (v: number, want: number, tol: number, what: string) => assert.ok(Math.abs(v - want) <= want * tol, `${what}: ${v.toFixed(2)} m against ${want}`);
  // what the stat blocks state
  near(machineSize("AT-AT").h, 22.5, 0.04, "an AT-AT \"stands 22.5 meters tall\"");
  near(machineSize("AT-RT").h, 3.2, 0.04, "an AT-RT is \"3.2 meters tall\"");
  near(machineSize("TX-225").len, 7.3, 0.04, "an Occupier is \"7.30 meters long\"");
  near(machineSize("TX-225").h, 1.82, 0.12, "and \"1.82 meters tall\"");
  assert.ok(machineSize("1.4 FD").h >= 2.8, "a P-Tower's dish is 2.8 m high");
  // what the databank gives
  near(machineSize("AT-ST").h, 9.04, 0.04, "an AT-ST is 9.04 m");
  near(machineSize("AT-TE").len, 22.02, 0.04, "an AT-TE is 22.02 m long");
  near(machineSize("AT-TE").h, 9.57, 0.15, "and 9.57 m tall");
  near(machineSize("AAT").len, 9.19, 0.04, "an AAT is 9.19 m long");
  near(machineSize("74-Z").len, 3.2, 0.04, "a 74-Z is 3.2 m long");
  // the proportions: a tank is long and low, a walker as tall as it is long
  const tank = machineSize("TX-225"), aat = machineSize("AAT"), te = machineSize("AT-TE"), at = machineSize("AT-AT"), st = machineSize("AT-ST");
  assert.ok(tank.h / tank.len < 0.3 && aat.h / aat.len < 0.4 && aat.h / aat.len > 0.25, "the tanks are low");
  assert.ok(te.h / te.len > 0.33 && te.h / te.len < 0.5, "an AT-TE is low and long");
  assert.ok(at.h / at.len > 0.7 && at.h / at.len < 1.3, "an AT-AT is about as tall as it is long");
  assert.ok(st.h / st.len > 1.1 && st.h / st.len < 1.7, "an AT-ST stands taller than it is long");
  assert.notEqual(aat.spec.key, tank.spec.key, "an AAT is not an Occupier");
  // the order
  assert.ok(at.h > te.h && te.h > machineSize("AT-RT").h && machineSize("AT-RT").h > 1.7, "AT-AT over AT-TE over AT-RT over a person");
  for (const b of constructBlocks) assert.ok(machineSize(b.name).spec.scale !== undefined && machineSize(b.name).spec.foot !== undefined, `${b.name} has its own scale and a footprint`);
});

test("the walkers walk on jointed legs: an AT-ST on two, an AT-AT on four, an AT-TE on six, a brain walker on eight (four limbs), each with knees", () => {
  const joints = (name: string, gait: string, ...limbs: number[]) => {
    const m = machineSize(name);
    assert.equal(m.spec.gait, gait, name);
    for (const l of limbs) assert.ok(m.k.jointMask & (1 << l), `${name} limb ${l}`);
  };
  joints("AT-ST", "birdwalk", LIMB.legR, LIMB.legL, LIMB.shinR, LIMB.shinL);
  joints("AT-RT", "birdwalk", LIMB.legR, LIMB.legL, LIMB.shinR, LIMB.shinL);
  joints("AT-AT", "walker", LIMB.legR, LIMB.legL, LIMB.hindR, LIMB.hindL, LIMB.shinR, LIMB.shinL, LIMB.shinHR, LIMB.shinHL, LIMB.head);
  joints("AT-TE", "hexa", LIMB.legR, LIMB.legL, LIMB.midR, LIMB.midL, LIMB.hindR, LIMB.hindL, LIMB.shinR, LIMB.shinMR, LIMB.shinHR);
  joints("B'omarr", "quad", LIMB.legR, LIMB.legL, LIMB.hindR, LIMB.hindL, LIMB.shinR, LIMB.shinHL);
  // a tank, a turret and a bike do not walk
  for (const n of ["AAT", "TX-225", "Auto-Turret", "74-Z"]) assert.equal(machineSize(n).spec.gait, "glide", n);
});

test("a hailfire is two open hoops (no spokes) leaning out 25 degrees, each turning about its own tilted axle, with slim rims, a drive pod low in each, a small body between and its missile tubes above", () => {
  const k = new Kit();
  k.animated = true;
  buildDroid(k, "hailfire", "IG-227 Hailfire-Class Droid");
  assert.ok(k.jointMask & (1 << LIMB.wingL) && k.jointMask & (1 << LIMB.wingR), "each hoop turns on a limb of its own");
  assert.ok(Math.abs(HAILFIRE_CAMBER - (25 * Math.PI) / 180) < 1e-9, "the camber is 25 degrees");
  const wheels: Record<number, THREE.Vector3[]> = { [LIMB.wingL]: [], [LIMB.wingR]: [] };
  const fixed = new THREE.Box3();
  for (const p of k.parts) {
    const pos = p.geo.attributes.position, limb = p.geo.attributes.limb as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)), l = Math.round(limb.getX(i));
      if (wheels[l]) wheels[l].push(v); else fixed.expandByPoint(v);
    }
  }
  for (const [limb, side] of [[LIMB.wingL, 1], [LIMB.wingR, -1]] as const) {
    const vs = wheels[limb];
    const top = Math.max(...vs.map((v) => v.y)), bottom = Math.min(...vs.map((v) => v.y));
    assert.ok(bottom > -0.01 && bottom < 0.03, "a hoop stands on the ground");
    assert.ok(top > 0.85, "and is as tall as the machine");
    // the hoop leans out at the top (measured at the highest and lowest points of the tread: a little less than the hoop's own lean)
    const at = (y: number) => { const near = vs.filter((v) => Math.abs(v.y - y) < 0.012); return near.reduce((n, v) => n + v.x * side, 0) / near.length; };
    const lean = Math.atan2(at(top) - at(bottom), top - bottom);
    assert.ok(lean > 0.25 && Math.abs(lean - HAILFIRE_CAMBER) < 0.2, `the hoop leans out at the top: ${lean.toFixed(2)} radians against ${HAILFIRE_CAMBER.toFixed(2)}`);
    // the rim is slim: its depth along the axle (the hoop's own plane normal) is 35% less than the 0.12 it was
    const axis = new THREE.Vector3(Math.cos(HAILFIRE_CAMBER), -side * Math.sin(HAILFIRE_CAMBER), 0).multiplyScalar(side);
    const along = vs.map((v) => v.dot(axis));
    assert.ok(Math.max(...along) - Math.min(...along) < 0.12 * 0.65 + 0.045, `the hoop is ${(Math.max(...along) - Math.min(...along)).toFixed(3)} deep`);
  }
  assert.ok(fixed.max.x < 0.8 && fixed.max.y < 0.8, "the body, pods and racks between are smaller than the hoops");
  const spec = figureSpec("droid", "IG-227 Hailfire-Class Droid", { creature: "droid", size: "Huge", looks: {} });
  assert.ok(spec.wheel && spec.ball && spec.ball > 0.45 && spec.camber === HAILFIRE_CAMBER, "it rolls the way it faces on a wheel of the hoop's size, with its camber");
});

test("nothing on a hailfire floats: every part touches another, all of it one piece", () => {
  const k = new Kit();
  k.animated = true;
  buildDroid(k, "hailfire", "IG-227 Hailfire-Class Droid");
  // the pieces: each mesh island (a box, a tube, a sphere) is a piece with its box; two pieces that come within a hair of each other are joined
  const boxes: THREE.Box3[] = [];
  for (const p of k.parts) {
    const pos = p.geo.attributes.position, idx = p.geo.index!;
    const up = Array.from({ length: pos.count }, (_, i) => i);
    const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
    for (let i = 0; i < idx.count; i += 3) { up[find(idx.getX(i + 1))] = find(idx.getX(i)); up[find(idx.getX(i + 2))] = find(idx.getX(i)); }
    const by = new Map<number, THREE.Box3>();
    for (let i = 0; i < pos.count; i++) { const r = find(i); if (!by.has(r)) by.set(r, new THREE.Box3()); by.get(r)!.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); }
    boxes.push(...by.values());
  }
  const group = boxes.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  const grown = boxes.map((b) => b.clone().expandByScalar(0.004));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (grown[i].intersectsBox(grown[j])) group[root(j)] = root(i);
  const pieces = new Map<number, number>();
  boxes.forEach((_, i) => pieces.set(root(i), (pieces.get(root(i)) ?? 0) + 1));
  const lone = [...pieces.entries()].filter(([, n]) => n < 8).map(([r]) => boxes[r].min.toArray().map((v) => v.toFixed(2)).join(","));
  assert.equal(pieces.size, 1, `the hailfire is ${pieces.size} pieces: loose ones near ${lone.join(" | ")}`);
});

test("the bigger a figure, the slower its legs go round for the ground it covers: a giant walker's step is slow, a tiny droid's quick", () => {
  const person = strideCycle("walk", 1);
  for (const [name, gait] of [["AT-AT", "walker"], ["AT-ST", "birdwalk"], ["AT-TE", "hexa"]] as const) {
    const fit = machineSize(name).spec.scale!;
    const rate = strideCycle(gait, fit);
    assert.ok(rate < strideCycle(gait, 1) / 3, `${name} (x${fit.toFixed(1)}) goes round at ${rate.toFixed(2)}, a person at ${person}: far slower than its model at its own size`);
    assert.ok(rate > 0.05, "but not so slow that its legs do not move in a short walk");
  }
  assert.ok(strideCycle("walk", 0.3) > person && strideCycle("walk", 1.18) < person, "a small droid steps quicker than a person, a B1 a little slower");
});

test("an AT-AT walks: one foot lifted at a time, the others on the ground, never all four off it, none sunk into it", () => {
  const m = machineSize("AT-AT");
  assert.equal(m.spec.gait, "walker");
  const legs: [number, number][] = [[LIMB.legR, LIMB.shinR], [LIMB.legL, LIMB.shinL], [LIMB.hindR, LIMB.shinHR], [LIMB.hindL, LIMB.shinHL]];
  const lowest = (pose: Pose) => legs.map((l) => Math.min(...posedVertices(m.k, pose, new Set(l)).map((v) => v.y)));
  const rest = lowest(restPose());
  const ground = Math.min(...rest);
  assert.ok(Math.abs(ground) < 0.01 && rest.every((y) => Math.abs(y - ground) < 0.01), "standing, the four feet are on the ground");
  let most = 0;
  const lifted = new Set<number>();
  for (let i = 0; i < 160; i++) {
    const pose = restPose();
    gaitPose("walker", { phase: (i / 160) * Math.PI * 2, amp: 1, speed: 3 }, 0, pose);
    const ys = lowest(pose).map((y) => y - ground);
    const off = ys.filter((y) => y > 0.012);
    assert.ok(off.length <= 1, `phase ${i}: ${off.length} feet are off the ground (it is running)`);
    assert.ok(ys.every((y) => y > -0.015), `phase ${i}: a foot is sunk into the ground (${Math.min(...ys)})`);
    ys.forEach((y, n) => y > 0.012 && lifted.add(n));
    most = Math.max(most, ...ys);
  }
  assert.ok(lifted.size === 4, "every foot is lifted in its turn");
  assert.ok(most > 0.04, `a foot that steps is lifted clear (${most})`);
  // the legs bend as they come through, and the feet go to and fro under the body
  const a = restPose(), b = restPose();
  gaitPose("walker", { phase: 0.3, amp: 1, speed: 3 }, 0, a);
  gaitPose("walker", { phase: 2.4, amp: 1, speed: 3 }, 0, b);
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 0.02), "the legs move");
});

test("an AT-ST's stepping leg BENDS at the knee (its knee is behind): the angle at the knee gets smaller, the leg that stands stays as it was", () => {
  const m = machineSize("AT-ST");
  assert.equal(m.spec.gait, "birdwalk");
  const pivot = (l: number) => new THREE.Vector3(m.k.pivots[l * 3], m.k.pivots[l * 3 + 1], m.k.pivots[l * 3 + 2]);
  // the foot: the lowest point of the shin at rest
  let foot = new THREE.Vector3(0, 9, 0);
  for (const p of m.k.parts) {
    const pos = p.geo.attributes.position, limb = p.geo.attributes.limb as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) if (Math.round(limb.getX(i)) === LIMB.shinL && pos.getY(i) < foot.y && pos.getX(i) > 0) foot = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  const q = (pose: Pose, l: number) => new THREE.Quaternion(pose[l * 4], pose[l * 4 + 1], pose[l * 4 + 2], pose[l * 4 + 3]);
  const turn = (v: THREE.Vector3, pose: Pose, l: number, about: THREE.Vector3) => v.clone().sub(about).applyQuaternion(q(pose, l)).add(about);
  const kneeAngle = (pose: Pose) => {
    const hip = pivot(LIMB.legL);
    const knee = turn(pivot(LIMB.shinL), pose, LIMB.legL, hip);
    const f = turn(turn(foot, pose, LIMB.shinL, pivot(LIMB.shinL)), pose, LIMB.legL, hip);
    return knee.clone().sub(hip).angleTo(knee.clone().sub(f));
  };
  const still = restPose();
  const rest = kneeAngle(still);
  // the left leg's knee flexes most at phase 0 (as a walker's does: gaitPose "walk")
  const stepping = restPose(), standing = restPose();
  gaitPose("birdwalk", { phase: 0, amp: 1, speed: 3 }, 0, stepping);
  gaitPose("birdwalk", { phase: Math.PI, amp: 1, speed: 3 }, 0, standing);
  assert.ok(kneeAngle(stepping) < rest - 0.3, `the stepping leg is bent at the knee: ${kneeAngle(stepping).toFixed(2)} against ${rest.toFixed(2)} at rest`);
  assert.ok(kneeAngle(standing) < rest + 0.05 && kneeAngle(standing) > rest - 0.25, "the leg that stands keeps its knee as it was, or bends a little");
  // a person's walk bends it the other way round (the same model walked as a person would straighten the leg)
  const wrong = restPose();
  gaitPose("walk", { phase: 0, amp: 1, speed: 3 }, 0, wrong);
  assert.ok(kneeAngle(wrong) > rest, "the walk of a forward knee straightens a knee that is behind: that was the fault");
});

test("on a ladder (2026-11-06) the arms reach up hand over hand and the knees come up in turn, the right hand with the left foot; off it, none of it", () => {
  const turn = (p: Pose, limb: number) => 2 * Math.acos(Math.min(1, Math.abs(p[limb * 4 + 3])));
  const e = eased();
  for (let i = 0; i < 60; i++) easeMotion(e, motion({ climb: 0 }), 1 / 30);
  assert.ok(e.climb > 0.95, `eased onto the ladder: ${e.climb}`);
  const out = restPose();
  humanPose(standing(), 1, motion({ climb: Math.PI / 2 }), e, "rifle", "niman", 10, LEGS, out);
  // (a quarter of the way round, the right hand at its highest reach and the left at the shoulder; the left knee up with the right hand)
  assert.ok(turn(out, LIMB.armR) > 2.6, `right arm up ${turn(out, LIMB.armR)}`);
  assert.ok(turn(out, LIMB.armL) > 1.8 && turn(out, LIMB.armL) < turn(out, LIMB.armR), `left arm lower ${turn(out, LIMB.armL)}`);
  assert.ok(turn(out, LIMB.legL) > turn(out, LIMB.legR), "the left knee is the one up");
  const [r, l] = climbCycle(0.7);
  assert.ok(Math.abs(r + l) < 1e-9, "the hands half a cycle apart");
  assert.ok(Math.abs(climbPhase(2 * RUNG) - 2 * Math.PI) < 1e-9, "once round every two rungs");
  // off the ladder the arms hang
  const off = restPose();
  humanPose(standing(), 1, motion(), calmed(), "none", "niman", 10, LEGS, off);
  assert.ok(turn(off, LIMB.armR) < 0.6, `arms down off it: ${turn(off, LIMB.armR)}`);
});

test("getting on a mount (2026-11-06): from beside its left side, a foot in the stirrup, a leg over, down into the rider's seat; off it the same back", () => {
  const start = mountPlace(0), top = mountPlace(0.7), end = mountPlace(1);
  assert.deepEqual([start.side, start.up, start.face], [1, 0, 0], "standing at its side, on the ground, facing its flank");
  assert.ok(top.up > 1, "over the saddle at the top of the swing");
  assert.deepEqual([end.side, end.up, end.face], [0, 1, 1], "in the seat, facing ahead");
  // the left foot up first, then the right leg swung out and over, then the rider's pose (gaitPose "ride")
  assert.ok(mountPose(0.35).legL![0] < -1.2 && Math.abs(mountPose(0.35).legR![2]) < 0.2);
  assert.ok(mountPose(0.7).legR![2] < -1.2, "the right leg out over the back");
  assert.deepEqual(mountPose(1).legR, [-0.75, 0, -0.55]);
  assert.deepEqual(mountPose(1).legL, [-0.75, 0, 0.55]);
  // and smoothly: no jump between two moments a frame apart
  for (let u = 0; u < 1; u += 0.02) {
    const [a, b] = [mountPose(u), mountPose(u + 0.02)];
    for (const j of Object.keys(b) as (keyof typeof b)[]) for (let i = 0; i < 3; i++) assert.ok(Math.abs((b[j]![i] ?? 0) - (a[j]?.[i] ?? 0)) < 0.2, `${String(j)} at ${u.toFixed(2)}`);
  }
});

test("beasts at their size (2026-11-06): the setting's own heights, smaller or bigger by the stat block's size, a mount's seat where its back is", () => {
  const tall = (name: string, size: string) => beastBuilt(creaturePlan(name, "", size)).h * beastScale(name, "", size) / UNITS_PER_M;
  // (Wookieepedia: a bantha 2.5 m, a rancor over 5 m, a tauntaun 2.5 m, a dewback 1.8 m high; SW5e: bantha and rancor Huge, the others Large)
  assert.ok(Math.abs(tall("Bantha, Adult", "Huge") - 2.5) < 0.05, `bantha ${tall("Bantha, Adult", "Huge")}`);
  assert.ok(Math.abs(tall("Rancor, Adult", "Huge") - 5) < 0.1, `rancor ${tall("Rancor, Adult", "Huge")}`);
  assert.ok(Math.abs(tall("Tauntaun", "Large") - 2.5) < 0.05);
  // (a dewback is long as well as low, so the map's room for a Large beast (MAX_SPAN) may hold it a little under its 1.8 m, never over)
  assert.ok(tall("Dewback, Adult", "Large") <= 1.8 + 0.05 && tall("Dewback, Adult", "Large") > 1.8 * 0.6, `dewback ${tall("Dewback, Adult", "Large")}`);
  // a juvenile rancor (Medium) a third of an adult (Huge), by the squares their sizes take
  assert.ok(Math.abs(beastMetres("Rancor, Juvenile", "Medium").m - 5 / 3) < 1e-9);
  // a Huge beast with no figure of its own stands over a Large one, which stands over a Medium one
  assert.ok(tall("Unknown grazer", "Huge") > tall("Unknown grazer", "Large") && tall("Unknown grazer", "Large") > tall("Unknown grazer", "Medium"));
  // nothing spans more than its size's room on the map: a greater krayt dragon is held to it
  const krayt = creaturePlan("Krayt Dragon, Greater", "", "Gargantuan");
  assert.ok(beastBuilt(krayt).span * beastScale("Krayt Dragon, Greater", "", "Gargantuan") <= 11 + 1e-9);
  // the rider sits on the beast's back at its scale
  const plan = creaturePlan("Bantha, Adult", "", "Huge");
  assert.ok(seatFor("Bantha, Adult", "", "Huge") > 0.8 * UNITS_PER_M && seatFor("Bantha, Adult", "", "Huge") < beastBuilt(plan).h * beastScale("Bantha, Adult", "", "Huge"));
  // and the figure is drawn at that scale
  assert.equal(figureSpec("beast", "Bantha, Adult", { size: "Huge", looks: {} }).scale, beastScale("Bantha, Adult", "", "Huge"));
});
