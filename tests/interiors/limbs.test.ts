import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { advance, angles, applyPose, bob, bodyOf, carrying, ERRAND, errandAt, errandLength, gaitPose, LIMB, LIMBS, limbMaterial, pose, restPose, rollBall, standing, type Pose } from "../../client/src/components/Map/interiors/limbs";
import { Kit, buildDroid, figureSpec, FINISHES, lookOf } from "../../client/src/components/Map/models";

// The angle a limb's quaternion turns about an axis (signed by that axis)
const angleOf = (p: Pose, limb: number, axis: "x" | "y" | "z") => {
  const q = new THREE.Quaternion(p[limb * 4], p[limb * 4 + 1], p[limb * 4 + 2], p[limb * 4 + 3]);
  const a = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  const v = { x: q.x, y: q.y, z: q.z }[axis] * Math.sign(q.w || 1);
  return Math.abs(v) < 1e-9 ? 0 : a * Math.sign(v);
};
const walking = () => {
  let s = standing();
  for (let i = 0; i < 30; i++) s = advance(s, 0.1, 1 / 30);
  return s;
};

test("a figure that stands has still limbs, and one that walks swings legs against each other and arms against their legs", () => {
  let s = standing();
  for (let i = 0; i < 30; i++) s = advance(s, 0, 1 / 30);
  assert.ok(angles(s).every((a) => a === 0));
  // A walk: 3 squares a second for a second
  const seen: number[][] = [];
  for (let i = 0; i < 30; i++) {
    s = advance(s, 0.1, 1 / 30);
    seen.push(angles(s));
  }
  const peak = (limb: number) => Math.max(...seen.map((a) => Math.abs(a[limb])));
  assert.ok(peak(LIMB.legR) > 0.4 && peak(LIMB.legR) < 0.7, `legs swing ${peak(LIMB.legR)}`);
  assert.ok(peak(LIMB.armR) > 0.3 && peak(LIMB.armR) < peak(LIMB.legR), "arms swing less");
  for (const a of seen) {
    assert.ok(Math.abs(a[LIMB.legR] + a[LIMB.legL]) < 1e-9, "the legs swing against each other");
    assert.ok(a[LIMB.armR] * a[LIMB.legR] <= 1e-12, "an arm swings against the leg on its side");
    assert.equal(a[LIMB.body], 0);
  }
});

test("the swing eases in and out, and a figure put somewhere else does not stride", () => {
  let s = standing();
  s = advance(s, 0.05, 1 / 30);
  assert.ok(s.amp < 0.3, "it takes a few frames to get going");
  for (let i = 0; i < 20; i++) s = advance(s, 0.12, 1 / 30);
  assert.ok(s.amp > 0.9);
  const after = advance(s, 50, 1 / 30);
  assert.ok(after.speed < s.speed, "a jump is not speed");
  for (let i = 0; i < 40; i++) s = advance(s, 0, 1 / 30);
  assert.ok(s.amp < 0.02, "and it comes to rest");
  assert.ok(bob({ phase: 1, amp: 1, speed: 3 }) > 0 && bob({ phase: 1, amp: 1, speed: 3 }) < 0.05);
});

test("each gait moves its own limbs: a beast trots in diagonal pairs, a bug in threes, wings beat, a droideka steps one leg at a time", () => {
  const s = { ...walking(), phase: Math.PI / 2 };
  const walk = gaitPose("walk", s);
  assert.ok(angleOf(walk, LIMB.legR, "x") > 0.5 && angleOf(walk, LIMB.legL, "x") < -0.5, "a walker's legs swing about the hip");
  const quad = gaitPose("quad", s);
  assert.ok(Math.abs(angleOf(quad, LIMB.legR, "x") - angleOf(quad, LIMB.hindL, "x")) < 1e-6, "the right fore moves with the left hind");
  assert.ok(angleOf(quad, LIMB.legR, "x") * angleOf(quad, LIMB.legL, "x") < 0, "and against the left fore");
  const hexa = gaitPose("hexa", s);
  assert.ok(Math.sign(angleOf(hexa, LIMB.legR, "y")) === Math.sign(angleOf(hexa, LIMB.midL, "y")) && Math.sign(angleOf(hexa, LIMB.legR, "y")) === Math.sign(angleOf(hexa, LIMB.hindR, "y")), "a bug's legs go in threes");
  assert.ok(angleOf(hexa, LIMB.legR, "y") * angleOf(hexa, LIMB.legL, "y") < 0);
  // Wings beat even at rest, the two sides mirrored
  const rest = gaitPose("wings", standing(), 0.3);
  assert.ok(Math.abs(angleOf(rest, LIMB.wingR, "z")) > 0.1 && Math.abs(angleOf(rest, LIMB.wingR, "z") + angleOf(rest, LIMB.wingL, "z")) < 1e-6);
  // A droideka's three legs lift one after another: never all three at once
  for (let i = 0; i < 24; i++) {
    const t = gaitPose("tripod", { ...s, phase: (i / 24) * Math.PI * 2 });
    const lifted = [LIMB.legR, LIMB.legL, LIMB.hindR].filter((l) => Math.abs(angleOf(t, l, "x")) > 0.05).length;
    assert.ok(lifted <= 2, `at most two legs off the ground (${lifted})`);
  }
  // A rider sits astride: the feet out to either side and forward of the hips
  const ride = gaitPose("ride", standing());
  const foot = (limb: number) => new THREE.Vector3(0, -1, 0).applyQuaternion(new THREE.Quaternion(...Array.from(ride.slice(limb * 4, limb * 4 + 4)) as [number, number, number, number]));
  assert.ok(foot(LIMB.legR).x < -0.3 && foot(LIMB.legL).x > 0.3, "astride");
  assert.ok(foot(LIMB.legR).z > 0.3 && foot(LIMB.legL).z > 0.3, "knees forward");
  // A walker standing still has every limb at rest
  assert.ok(Array.from({ length: LIMBS }, (_, l) => l).every((l) => Math.abs(angleOf(gaitPose("walk", standing()), l, "x")) < 1e-9));
});

test("what glides or rolls does not bob, a floater rises and falls and leans into the way it goes", () => {
  const s = walking();
  for (const gait of ["glide", "roll"] as const) for (let i = 0; i < 10; i++) assert.equal(bodyOf(gait, { ...s, phase: i }, i).y, 0, `${gait} keeps level`);
  const ys = Array.from({ length: 20 }, (_, i) => bodyOf("hover", standing(), i * 0.2).y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.05, "a probe droid floats up and down");
  assert.ok(bodyOf("hover", s, 0).pitch > 0.05 && bodyOf("hover", standing(), 0).pitch === 0, "and noses down when it moves");
  assert.ok(bodyOf("walk", { ...s, phase: 1 }).y > 0, "a walker bobs");
});

test("a ball rolls by the ground it covers, about the axis square to its way, and keeps rolling true while its body turns", () => {
  const world = new THREE.Quaternion();
  const level = new THREE.Quaternion();
  // A quarter of its circumference toward +z turns it a quarter turn about +x
  const r = 0.2;
  const q = rollBall(world, { x: 0, z: (Math.PI / 2) * r }, r, level);
  const e = new THREE.Euler().setFromQuaternion(q);
  assert.ok(Math.abs(e.x - Math.PI / 2) < 1e-6 && Math.abs(e.y) < 1e-6 && Math.abs(e.z) < 1e-6, `about x by a quarter (${e.x})`);
  // Toward +x it turns about -z
  const w2 = new THREE.Quaternion();
  const q2 = rollBall(w2, { x: r, z: 0 }, r, level);
  const axis = new THREE.Vector3(q2.x, q2.y, q2.z).normalize();
  assert.ok(axis.z < -0.99, "about -z going +x");
  // The body turning does not turn the ball in the world: in the body's frame it is turned back by as much
  const yawed = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1);
  const w3 = new THREE.Quaternion();
  const inBody = rollBall(w3, { x: 0, z: 0 }, r, yawed);
  assert.ok(Math.abs(inBody.angleTo(yawed.clone().invert())) < 1e-9);
  // A jump (a big step in one frame) is not a roll
  const w4 = new THREE.Quaternion();
  rollBall(w4, { x: 0, z: 10 }, r, level);
  assert.ok(w4.angleTo(new THREE.Quaternion()) < 1e-9);
});

test("an animated build marks every vertex with its limb and pivot, and a plain one carries neither", () => {
  const build = (k: Kit) => {
    k.box([0.2, 0.2, 0.2], "#fff", {});
    k.limb(LIMB.legR, [0.1, 0.5, 0], () => {
      k.box([0.1, 0.4, 0.1], "#f00", { at: [0.1, 0.3, 0] });
      k.group([0, 0, 0.3], undefined, 2, () => k.box([0.1, 0.1, 0.1], "#0f0"));
    });
    k.limb(LIMB.armL, [-0.2, 0.9, 0], () => k.sphere(0.05, "#00f", { at: [-0.2, 0.8, 0] }));
  };
  const plain = new Kit();
  build(plain);
  assert.ok(plain.bake().matte && !plain.bake().matte!.getAttribute("limb"));
  const kit = new Kit();
  kit.animated = true;
  build(kit);
  const g = kit.bake().matte!;
  const [limb, pivot] = [g.getAttribute("limb"), g.getAttribute("pivot")];
  assert.ok(limb && pivot && limb.count === g.getAttribute("position").count);
  const seen = new Set<number>();
  for (let i = 0; i < limb.count; i++) seen.add(limb.getX(i));
  assert.deepEqual([...seen].sort(), [LIMB.body, LIMB.legR, LIMB.armL].sort());
  // The leg's pivot is where it was given, in the frame it was given in; the body's is nothing
  for (let i = 0; i < limb.count; i++) {
    if (limb.getX(i) === LIMB.legR) assert.ok(Math.abs(pivot.getY(i) - 0.5) < 1e-6 && Math.abs(pivot.getX(i) - 0.1) < 1e-6);
    if (limb.getX(i) === LIMB.body) assert.equal(pivot.getX(i), 0);
  }
});

// The limbs a figure's animated build marks
const limbsOf = (build: (k: Kit) => void) => {
  const kit = new Kit();
  kit.animated = true;
  build(kit);
  const out = new Set<number>();
  for (const g of Object.values(kit.bake())) {
    const a = g?.getAttribute("limb");
    for (let i = 0; a && i < a.count; i++) out.add(a.getX(i));
  }
  return out;
};

test("droids and beasts are built for their gaits: a BB's ball rolls, battle droids and beasts have legs that move, a droideka has two forms", () => {
  const spec = (kind: string, name: string, extra: Record<string, string> = {}) => figureSpec(kind, name, { looks: {}, ...extra });
  const bb = spec("droid", "BB-8");
  assert.equal(bb.gait, "roll");
  assert.equal(bb.ball, 0.2);
  assert.ok(limbsOf(bb.build).has(LIMB.roll), "the ball is its own limb");
  const b1 = spec("battledroid", "B1 battle droid");
  assert.equal(b1.gait, "walk");
  assert.ok([LIMB.legR, LIMB.legL].every((l) => limbsOf(b1.build).has(l)), "a battle droid's legs");
  assert.equal(spec("astromech", "R2 unit").gait, "glide", "an astromech glides, no bob");
  assert.equal(spec("droid", "Probe droid").gait, "hover");
  const deka = spec("droid", "Destroyer Droid");
  assert.equal(deka.form, "droideka");
  assert.ok([LIMB.legR, LIMB.legL, LIMB.hindR].every((l) => limbsOf(deka.build).has(l)), "its three legs");
  assert.ok(limbsOf((k) => buildDroid(k, "destroyer-ball", "Destroyer Droid")).has(LIMB.roll), "and its wheel");
  const bantha = spec("beast", "Bantha", { size: "Huge" });
  assert.equal(bantha.gait, "quad");
  assert.ok([LIMB.legR, LIMB.legL, LIMB.hindR, LIMB.hindL, LIMB.tail].every((l) => limbsOf(bantha.build).has(l)), "four legs and a tail");
  assert.ok(bantha.fur && bantha.fur > 0, "a bantha is furry");
  assert.ok((bantha.seat ?? 0) > 0.6, "and can be sat on");
  assert.equal(spec("beast", "Acklay").gait, "hexa");
  assert.equal(spec("beast", "Mynock").gait, "wings");
  assert.ok(limbsOf(spec("beast", "Mynock").build).has(LIMB.wingR));
  assert.equal(spec("beast", "Rancor").gait, "walk");
});

test("figures are dressed in the textured finishes: skin, a face, cloth, leather, armour plate, scales and fur", () => {
  const finishesOf = (build: (k: Kit) => void) => {
    const kit = new Kit();
    build(kit);
    return new Set(Object.keys(kit.bake()));
  };
  const person = finishesOf(figureSpec("person", "Merchant", { looks: {} }).build);
  for (const f of ["skin", "face", "fabric"]) assert.ok(person.has(f), `a merchant has ${f} (${[...person]})`);
  const trooper = finishesOf(figureSpec("trooper", "Stormtrooper", { looks: {} }).build);
  assert.ok(trooper.has("plate"), "a trooper's armour is plate");
  const droid = finishesOf(figureSpec("battledroid", "B1 battle droid", { looks: {} }).build);
  // (panelled plating since 2026-10-30: seams, rivets and vents)
  assert.ok(droid.has("droid") && !droid.has("sheen"), "a droid's metal is plating");
  // a robe is woven coarse, an armour's undersuit is ribbed
  assert.ok(finishesOf(figureSpec("force", "Jedi Knight", { role: "jedi", looks: {} }).build).has("weave"), "a Jedi's robe is a weave");
  assert.ok(trooper.has("mesh"), "a trooper's undersuit is ribbed");
  assert.ok(finishesOf(figureSpec("beast", "Bantha", { looks: {} }).build).has("fur"), "a bantha's hide is fur");
  assert.ok(finishesOf(figureSpec("beast", "Dewback", { looks: {} }).build).has("scales"), "a dewback's is scales");
  // A furry person: drawn in fur
  const wookiee = figureSpec("person", "Wookiee Berserker", { species: "wookiee", looks: { wookiee: lookOf({ name: "Wookiee", distinctions: "Covered in fur", hairColorOptions: "Brown, black", skinColorOptions: "Gray", heightAverage: "7'0\"" } as never) } });
  assert.ok(finishesOf(wookiee.build).has("fur") && (wookiee.fur ?? 0) > 0);
  assert.ok(FINISHES.includes("fur"));
});

test("a limb material carries its own pose, the program is shared by the copies, and what the material did before is kept", () => {
  const a = limbMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const b = limbMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
  assert.notEqual(a.userData.pose, b.userData.pose);
  assert.equal(a.customProgramCacheKey!(), b.customProgramCacheKey!());
  pose([a], { phase: Math.PI / 2, amp: 1, speed: 2 });
  assert.ok(Math.abs(angleOf(a.userData.pose, LIMB.legR, "x")) > 0.5 && angleOf(b.userData.pose, LIMB.legR, "x") === 0);
  assert.equal(a.userData.pose.length, LIMBS * 4);
  const p = restPose();
  p.set([0, 0, Math.sin(0.2), Math.cos(0.2)], LIMB.wingR * 4);
  applyPose([b], p);
  assert.ok(Math.abs(angleOf(b.userData.pose, LIMB.wingR, "z") - 0.4) < 1e-6);
  const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>" };
  a.onBeforeCompile(shader as never, {} as never);
  assert.ok(shader.uniforms.uQ.value === a.userData.pose);
  assert.match(shader.vertexShader, /attribute float limb/);
  assert.ok(shader.vertexShader.includes(`uniform vec4 uQ[${LIMBS}]`));
  assert.ok(shader.uniforms.uP.value === a.userData.pivots);
  // (a limb is turned about its own joint and then about each joint it hangs from: a forearm with its upper arm and the chest)
  assert.match(shader.vertexShader, /lqParent/);
  assert.match(shader.vertexShader, /objectNormal = lqTurn/);
  const flat = limbMaterial(new THREE.MeshBasicMaterial());
  const s2 = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <common>\n#include <begin_vertex>" };
  flat.onBeforeCompile(s2 as never, {} as never);
  assert.doesNotMatch(s2.vertexShader, /objectNormal/);
  // A surface's own program change runs first, and the copy is handed the maps that come later
  const base = new THREE.MeshPhongMaterial() as THREE.MeshPhongMaterial & { followers?: Set<THREE.Material> };
  base.followers = new Set();
  base.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n// parallax"); };
  const copy = limbMaterial(base);
  const s3 = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>" };
  copy.onBeforeCompile(s3 as never, {} as never);
  assert.match(s3.vertexShader, /parallax/);
  assert.ok(base.followers.has(copy));
  copy.dispose();
  assert.ok(!base.followers.has(copy), "a copy let go is let go");
});

// ---- Sitting, standing and playing at a table (2026-10-27) ----
import { seatedPose, shotPose, blendPose, easeSit, envelope, seatState, SIT_SECONDS, STAND_SECONDS, SIT_LEG } from "../../client/src/components/Map/interiors/limbs";

test("sitting down takes 0.7 s and standing up 0.55 s, easing between 0 and 1 and no further", () => {
  let a = 0;
  for (let i = 0; i < 100; i++) a = easeSit(a, true, SIT_SECONDS / 100);
  assert.ok(Math.abs(a - 1) < 1e-6);
  assert.equal(easeSit(1, true, 1), 1);
  let b = 1;
  for (let i = 0; i < 100; i++) b = easeSit(b, false, STAND_SECONDS / 100);
  assert.ok(Math.abs(b) < 1e-6);
  assert.equal(easeSit(0, false, 1), 0);
  assert.ok(easeSit(0.5, true, 0.1) > 0.5 && easeSit(0.5, false, 0.1) < 0.5);
});

test("seated: both legs forward about a quarter turn, the arms by the act; the gestures differ from the rest and from each other", () => {
  const rest = seatedPose("rest", 0);
  assert.ok(Math.abs(angleOf(rest, LIMB.legR, "x") - SIT_LEG) < 0.02 && Math.abs(angleOf(rest, LIMB.legL, "x") - SIT_LEG) < 0.02, "thighs forward");
  const hold = seatedPose("hold", 0);
  assert.ok(angleOf(hold, LIMB.armR, "x") < angleOf(rest, LIMB.armR, "x") - 0.3, "the hands come up before the chest to hold cards");
  // the dealing arm sweeps over time
  const swing = [0, 0.2, 0.4, 0.6].map((t) => angleOf(seatedPose("deal", t), LIMB.armR, "z"));
  assert.ok(Math.max(...swing) - Math.min(...swing) > 0.3);
  const shots = (["draw", "bet", "call", "fold", "think"] as const).map((s) => Array.from(shotPose(s)).join());
  assert.equal(new Set(shots).size, 5);
  assert.ok(angleOf(shotPose("call"), LIMB.armR, "x") < -2, "a hand raised to come down on the table");
});

test("blending moves each limb from one pose to the other by the share asked; a gesture's strength rises and falls over its second", () => {
  const a = seatedPose("rest", 0);
  const b = shotPose("call");
  assert.deepEqual(Array.from(blendPose(a, b, 0)).map((v) => Math.round(v * 1e5)), Array.from(a).map((v) => Math.round(v * 1e5)));
  assert.deepEqual(Array.from(blendPose(a, b, 1)).map((v) => Math.round(v * 1e5)), Array.from(b).map((v) => Math.round(v * 1e5)));
  const half = angleOf(blendPose(a, b, 0.5), LIMB.armR, "x");
  assert.ok(half < angleOf(a, LIMB.armR, "x") && half > angleOf(b, LIMB.armR, "x"));
  assert.equal(envelope(-0.1), 0);
  assert.equal(envelope(1.5), 0);
  assert.ok(envelope(0.55) > 0.95);
  assert.ok(envelope(0.1) < envelope(0.3) && envelope(1.0) < envelope(0.7));
  assert.deepEqual(seatState(), { sit: false, act: "rest", drop: 0.22, cards: 0 });
});

// ---- How a person moves and fights (2026-10-30) ----
import { humanPose, eased, easeMotion, motion, holdOf, saberStyleOf, strikeSeconds, kickOf, FORM_STYLE, SABER_STYLES } from "../../client/src/components/Map/interiors/limbs";
import { gunKick } from "../../shared/logic/shooter";
const LEGS = { hip: 0.56, knee: 0.31 };
const settle = (m: ReturnType<typeof motion>) => { const e = eased(); for (let i = 0; i < 120; i++) easeMotion(e, m, 1 / 30); return e; };
const quatOf = (p: Pose, limb: number) => new THREE.Quaternion(p[limb * 4], p[limb * 4 + 1], p[limb * 4 + 2], p[limb * 4 + 3]);

test("a person is built jointed: knees, elbows, a trunk, a neck and a wrist, each with its pivot kept for the joints it carries", () => {
  const spec = figureSpec("trooper", "Stormtrooper", { role: "trooper", looks: {} });
  const k = new Kit();
  k.animated = true;
  spec.build(k);
  for (const l of [LIMB.legR, LIMB.shinR, LIMB.armR, LIMB.foreR, LIMB.chest, LIMB.head, LIMB.weapon]) assert.ok(k.jointMask & (1 << l), `limb ${l}`);
  // the knee is below the hip, the elbow below the shoulder, the shoulder above the waist
  assert.ok(k.pivots[LIMB.shinR * 3 + 1] < k.pivots[LIMB.legR * 3 + 1]);
  assert.ok(k.pivots[LIMB.foreR * 3 + 1] < k.pivots[LIMB.armR * 3 + 1]);
  assert.ok(k.pivots[LIMB.armR * 3 + 1] > k.pivots[LIMB.chest * 3 + 1]);
  assert.equal(spec.hold, "rifle");
  const baked = k.bake();
  assert.ok(Object.values(baked).some((g) => g?.userData.pivots && g.userData.joints === k.jointMask));
});

test("crouched, the knees bend and the body is lowered; prone, it is tipped onto its front; in the air the legs tuck", () => {
  const out = restPose();
  const stand = humanPose(standing(), 0, motion(), settle(motion()), "none", "niman", 10, LEGS, out);
  assert.ok(stand.drop < 0.01 && stand.tip === 0);
  const crouch = humanPose(standing(), 0, motion({ posture: 1 }), settle(motion({ posture: 1 })), "none", "niman", 10, LEGS, out);
  assert.ok(crouch.drop > 0.1, `drop ${crouch.drop}`);
  assert.ok(angleOf(out, LIMB.shinR, "x") > 1);
  const prone = humanPose(standing(), 0, motion({ posture: 2 }), settle(motion({ posture: 2 })), "rifle", "niman", 10, LEGS, out);
  assert.ok(prone.tip > 0.95 && prone.drop < 0.01);
  humanPose(standing(), 0, motion({ air: true }), settle(motion({ air: true })), "none", "niman", 10, LEGS, out);
  assert.ok(angleOf(out, LIMB.legL, "x") < -0.8 && angleOf(out, LIMB.shinL, "x") > 0.8);
});

test("a running stride swings further and bends the knee more than a walk", () => {
  const out = restPose();
  const walk = { phase: Math.PI, amp: 1, speed: 3.5 };
  const run = { phase: Math.PI, amp: 1, speed: 7 };
  humanPose(walk, 0, motion(), eased(), "none", "niman", 10, LEGS, out);
  const kneeWalk = angleOf(out, LIMB.shinR, "x");
  humanPose(run, 0, motion(), eased(), "none", "niman", 10, LEGS, out);
  assert.ok(angleOf(out, LIMB.shinR, "x") > kneeWalk + 0.3);
});

test("a long gun is held in both hands: both arms turn alike, carried low and raised to aim; a shot kicks it up, harder for a heavier gun", () => {
  const out = restPose();
  const carried = motion();
  humanPose(standing(), 0, carried, settle(carried), "rifle", "niman", 10, LEGS, out);
  assert.ok(quatOf(out, LIMB.armR).angleTo(quatOf(out, LIMB.armL)) < 2e-3);
  const low = angleOf(out, LIMB.armR, "x");
  const ready = motion({ ready: true });
  humanPose(standing(), 0, ready, settle(ready), "rifle", "niman", 10, LEGS, out);
  const up = angleOf(out, LIMB.armR, "x");
  assert.ok(up < low - 0.5, `${up} ${low}`);
  const kicked = (kick: number) => { const m = motion({ ready: true, firedAt: 9.95, kick }); humanPose(standing(), 0, m, settle(m), "rifle", "niman", 10, LEGS, out); return angleOf(out, LIMB.armR, "x"); };
  assert.ok(kicked(0.9) < kicked(0.2) && kicked(0.2) < up);
  assert.ok(quatOf(out, LIMB.armR).angleTo(quatOf(out, LIMB.armL)) < 2e-3);
});

test("a saber strike moves the arms and the trunk, each style its own guard and strikes; a parry raises the blade", () => {
  const out = restPose();
  const guardOf = (style: (typeof SABER_STYLES)[number]) => { const m = motion({ ready: true }); humanPose(standing(), 0, m, settle(m), "saber", style, 10, LEGS, out); return Array.from(out); };
  const guards = SABER_STYLES.map(guardOf);
  // no two styles stand alike
  for (let i = 0; i < guards.length; i++) for (let j = i + 1; j < guards.length; j++) assert.ok(guards[i].some((v, n) => Math.abs(v - guards[j][n]) > 1e-3), `${SABER_STYLES[i]} ${SABER_STYLES[j]}`);
  const m = motion({ ready: true });
  const e = settle(m);
  humanPose(standing(), 0, m, e, "saber", "djemso", 10, LEGS, out);
  const rest = angleOf(out, LIMB.armR, "x");
  m.swingAt = 10 - strikeSeconds("saber", "djemso", 0) * 0.38;
  humanPose(standing(), 0, m, e, "saber", "djemso", 10, LEGS, out);
  assert.ok(angleOf(out, LIMB.armR, "x") < rest - 0.8, "the overhead cut's wind-up raises the arms");
  // both hands stay on the hilt in a two-handed style
  assert.ok(quatOf(out, LIMB.armR).angleTo(quatOf(out, LIMB.armL)) < 2e-3);
  const b = motion({ ready: true, blocking: true });
  humanPose(standing(), 0, b, settle(b), "saber", "niman", 10, LEGS, out);
  assert.ok(Math.abs(angleOf(out, LIMB.weapon, "z")) > 0.5);
});

test("the style comes from a form the character knows, else from who they are, the same each time", () => {
  assert.equal(saberStyleOf("Kira", ["Feat: Soresu Form"]), "soresu");
  assert.equal(saberStyleOf("Kira", ["Vaapad Form"]), "juyo");
  assert.equal(saberStyleOf("Darth Kira"), saberStyleOf("Darth Kira"));
  assert.ok(["djemso", "juyo", "shien", "jarkai"].includes(saberStyleOf("Sith Marauder")));
  for (const style of Object.values(FORM_STYLE)) assert.ok(SABER_STYLES.includes(style));
  assert.equal(holdOf("bowcaster"), "rifle");
  assert.equal(holdOf("saber2"), "saber");
  assert.equal(holdOf("tray"), "carry");
});

test("a gun kicks and spreads by its kind and the weight of its shot", () => {
  assert.ok(kickOf("Hold-out blaster") < kickOf("Blaster pistol"));
  assert.ok(kickOf("Blaster pistol") < kickOf("Blaster rifle"));
  assert.ok(kickOf("Blaster rifle") < kickOf("Heavy repeating blaster"));
  assert.ok(gunKick("Sniper rifle").steady < gunKick("Blaster rifle").steady && gunKick("Blaster rifle").steady < gunKick("Blaster pistol").steady);
  assert.ok(gunKick("Shotgun").steady > 1.5);
  assert.ok(kickOf("Blaster rifle", 14) > kickOf("Blaster rifle", 7));
});

test("the legs cycle at a walker's pace, not a blur: a walk on the map is about a stride a second, a run about two", () => {
  const cycles = (speed: number) => {
    let s = standing();
    for (let i = 0; i < 60; i++) s = advance(s, speed / 30, 1 / 30);
    const start = s.phase;
    for (let i = 0; i < 30; i++) s = advance(s, speed / 30, 1 / 30);
    return (s.phase - start) / (Math.PI * 2);
  };
  assert.ok(cycles(3.5) > 0.8 && cycles(3.5) < 1.3, `a walk strides ${cycles(3.5)} a second`);
  assert.ok(cycles(2.1) < cycles(3.5), "crouched is slower");
  assert.ok(cycles(7) <= 2.2 + 1e-6, "a run is capped");
});

test("a rider's errand: the ride, down, in, a while inside, out, the load on the beast, up, and the purchases ride with them", () => {
  const ride = 13;
  const at = (t: number) => errandAt(t, ride);
  assert.equal(at(0).phase, "ride");
  assert.ok(Math.abs(at(ride / ERRAND.pace / 2).along - ride / 2) < 1e-9);
  const order: string[] = [];
  for (let t = 0; t < errandLength(ride); t += 0.1) if (order[order.length - 1] !== at(t).phase) order.push(at(t).phase);
  assert.deepEqual(order, ["ride", "down", "in", "shop", "out", "load", "up"]);
  // they are never in the saddle and in the shop at once, and the beast stays where the ride ended
  assert.equal(at(ride / ERRAND.pace + 3).along, ride);
  assert.ok(carrying("ride", 0.1) && carrying("down", 0.5) && carrying("up", 0.5), "the load is on for the ride and while getting down and up");
  assert.ok(!carrying("in", 0.5) && !carrying("shop", 0.5) && !carrying("out", 0.5), "it is not on while they are in the shop");
  assert.ok(!carrying("load", 0.2) && carrying("load", 0.8), "it goes on during the loading");
});
