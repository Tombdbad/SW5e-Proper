import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { advance, angles, bob, LIMB, LIMBS, limbMaterial, pose, standing } from "../../client/src/components/Map/interiors/limbs";
import { Kit } from "../../client/src/components/Map/models";

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

test("a limb material carries its own angles, and the program is shared by the copies", () => {
  const a = limbMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const b = limbMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
  assert.notEqual(a.userData.angles, b.userData.angles);
  assert.equal(a.customProgramCacheKey!(), b.customProgramCacheKey!());
  pose([a], { phase: Math.PI / 2, amp: 1, speed: 2 });
  assert.ok(Math.abs(a.userData.angles[LIMB.legR]) > 0.5 && b.userData.angles[LIMB.legR] === 0);
  assert.equal(a.userData.angles.length, LIMBS);
  const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>" };
  a.onBeforeCompile(shader as never, {} as never);
  assert.ok(shader.uniforms.uAng.value === a.userData.angles);
  assert.match(shader.vertexShader, /attribute float limb/);
  assert.match(shader.vertexShader, /objectNormal = vec3/);
  const flat = limbMaterial(new THREE.MeshBasicMaterial());
  const s2 = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <common>\n#include <begin_vertex>" };
  flat.onBeforeCompile(s2 as never, {} as never);
  assert.doesNotMatch(s2.vertexShader, /objectNormal/);
});
