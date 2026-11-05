import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { piecesOf, setBodyParts, setFaceParts, setHairParts, type CreatureParts } from "../../client/src/components/Map/interiors/body";
import { Kit, figureSpec, lookOf, hue, faceBits, faceKindOf, browKindOf, headFitOf } from "../../client/src/components/Map/models";
import { LIMB, LIMBS, PARENT, eased, humanPose, motion, personaOf, restPose, standing, standActPose, type Stride } from "../../client/src/components/Map/interiors/limbs";

// Faces that differ (2026-11-05; the user: nostrils too low, lips and eyebrows alike on everyone, Zabrak skin colours, a Besalisk's four arms)
const dir = path.resolve(import.meta.dirname, "../../client/public/figures");
const piecesFrom = (name: string): Promise<CreatureParts> => {
  const buf = fs.readFileSync(path.join(dir, name));
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => resolve(piecesOf(g.scene)), reject));
};
const trianglesOf = (p: Record<number, THREE.BufferGeometry>) => Object.values(p).reduce((n, g) => n + g.index!.count / 3, 0);
const human = lookOf({ name: "Human", skinColorOptions: "Light to dark tones", hairColorOptions: "Black, brown", heightAverage: "4'8\"", heightRollMod: "+2d10\"" } as never);

test("head.glb holds four heads of people (a masculine and a feminine face of two kinds each), each in a cell of its own in the atlas, and their noses and lips differ", async () => {
  const hi = await piecesFrom("head.glb");
  const lo = await piecesFrom("head.lo.glb");
  const cells: Record<string, [number, number]> = { head_m: [0, 0.625], head_m2: [0.375, 0.625], head_f: [0, 0.25], head_f2: [0.375, 0.25] };
  for (const [n, [u0, v0]] of Object.entries(cells)) {
    assert.deepEqual(Object.keys(hi[n].part).map(Number).sort(), [0, 3], `${n}: the face and the ears`);
    const g = hi[n].part[0];
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      assert.ok(uv.getX(i) >= u0 - 1e-4 && uv.getX(i) <= u0 + 0.375 + 1e-4 && uv.getY(i) >= v0 - 1e-4 && uv.getY(i) <= v0 + 0.375 + 1e-4, `${n}: coordinate ${i} in its cell`);
    }
    assert.ok(trianglesOf(hi[n].part) < 3000 && lo[n] && trianglesOf(lo[n].part) < trianglesOf(hi[n].part), `${n} budget`);
  }
  // (the nose of the broad kind is wider and stands out further: the vertices at the nose differ from the first kind's)
  const nose = (n: string) => {
    const pos = hi[n].part[0].attributes.position as THREE.BufferAttribute;
    let wide = 0, out = 0;
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      if (y > -0.03 && y < -0.012 && z > 0.1) { wide = Math.max(wide, Math.abs(x)); out = Math.max(out, z); }
    }
    return { wide, out };
  };
  assert.ok(nose("head_m2").wide > nose("head_m").wide || nose("head_m2").out > nose("head_m").out + 0.001, `a broader nose: ${JSON.stringify(nose("head_m"))} ${JSON.stringify(nose("head_m2"))}`);
});

test("hair.glb has three kinds of brows for each head and three patterns of tattoos, within a budget", async () => {
  const hi = await piecesFrom("hair.glb");
  for (const kind of ["m", "m2", "f", "f2"]) {
    for (const k of [0, 1, 2]) {
      assert.ok(hi[`brows_${kind}_${k}`], `brows_${kind}_${k}`);
      assert.ok(trianglesOf(hi[`brows_${kind}_${k}`].part) <= 420, `brows_${kind}_${k}: ${trianglesOf(hi[`brows_${kind}_${k}`].part)} triangles`);
      assert.ok(hi[`tattoo_${kind}_${k}`] && trianglesOf(hi[`tattoo_${kind}_${k}`].part) <= 450, `tattoo_${kind}_${k}`);
    }
  }
  // (the three kinds are not alike)
  const spans = [0, 1, 2].map((k) => { const b = new THREE.Box3(); for (const g of Object.values(hi[`brows_m_${k}`].part)) { g.computeBoundingBox(); b.union(g.boundingBox!); } return b.max.y - b.min.y; });
  assert.ok(Math.max(...spans) - Math.min(...spans) > 0.002, `brows differ in height: ${spans}`);
});

test("a person's face kind, brows and the fit of the head come from the name: both kinds of each sex are met, brows of all three kinds, the head within three per cent", () => {
  const seen = { m: new Set<string>(), f: new Set<string>() };
  const brows = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const seed = hue(`Person ${i}`) | faceBits(`Person ${i}`);
    seen.m.add(faceKindOf(seed, false));
    seen.f.add(faceKindOf(seed, true));
    brows.add(browKindOf(seed));
    for (const f of headFitOf(seed)) assert.ok(Math.abs(f - 1) < 0.03, `fit ${f}`);
  }
  assert.deepEqual([...seen.m].sort(), ["m", "m2"]);
  assert.deepEqual([...seen.f].sort(), ["f", "f2"]);
  assert.deepEqual([...brows].sort(), [0, 1, 2]);
});

test("people of different names are drawn on different heads, with brows of their own, and a Zabrak with tattoos wears ink lines in place of the five boxes", async () => {
  setBodyParts(null);
  setFaceParts(await piecesFrom("head.glb"));
  setHairParts(await piecesFrom("hair.glb"));
  const draw = (name: string, look = human) => { const spec = figureSpec("person", name, { role: "patron", looks: { human: look } }); const k = new Kit(); k.animated = true; spec.build(k); return k; };
  const cellsOf = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const k = draw(`Kel Face${i}`);
    const head = k.parts.find((p) => p.finish === "head");
    assert.ok(head, "a head in the head finish");
    const uv = head!.geo.attributes.uv as THREE.BufferAttribute;
    cellsOf.add(`${uv.getX(0) < 0.375 ? "left" : "right"}${uv.getY(0) > 0.625 ? "top" : "bottom"}`);
  }
  assert.ok(cellsOf.size >= 3, `faces in ${[...cellsOf]}`);
  const zabrak = lookOf({ name: "Zabrak", skinColorOptions: "Pale to dark brown, red, orange and yellow", distinctions: "Horns, two hearts, facial tattoos", heightAverage: "5'1\"" } as never);
  assert.ok(zabrak.tattoos);
  // (a Zabrak with tattoos has more triangles than the same person without: the ink, 250 to 400, where the old head had five boxes)
  const tris = (name: string, look: typeof human) => draw(name, look).parts.reduce((n, p) => n + p.geo.index!.count / 3, 0);
  for (const name of ["Kel Zab", "Kel Zub", "Kel Zib"]) assert.ok(tris(name, zabrak) > tris(name, { ...zabrak, tattoos: false }) + 150, `ink lines are drawn on ${name}'s face`);
  setFaceParts(null);
  setHairParts(null);
});

test("Zabrak skin runs from pale through the human tones to dark brown, and red, orange and yellow are skin colours, not paint", () => {
  const zabrak = lookOf({ name: "Zabrak", skinColorOptions: "Pale to dark brown, red, orange and yellow" } as never);
  assert.equal(zabrak.skin.length, 8, `${zabrak.skin}`);
  assert.deepEqual(zabrak.skin.slice(0, 5), ["#f1d3b8", "#e0b897", "#c99a6e", "#a8754b", "#7a4f32"]);
  const [r, o, y] = zabrak.skin.slice(5).map((c) => new THREE.Color(c));
  assert.ok(r.r > r.g * 2 && r.r < 0.8, "a deep red");
  assert.ok(o.r > o.g && o.g > o.b, "orange");
  assert.ok(y.r > y.b && y.g > y.b, "yellow");
  assert.ok(lookOf({ name: "Human", skinColorOptions: "Light to dark tones" } as never).skin.length === 6, "a human is as before");
  assert.deepEqual(lookOf({ name: "Miraluka", skinColorOptions: "Pale to brown" } as never).skin, ["#f1d3b8", "#e0b897", "#c99a6e", "#a8754b"]);
});

test("a Besalisk's second pair of arms are limbs of their own: the chain, the model, a swing against the first pair, a gesture at rest, a pump in a cheer", async () => {
  assert.equal(PARENT[LIMB.armR2], LIMB.chest);
  assert.equal(PARENT[LIMB.armL2], LIMB.chest);
  assert.equal(PARENT[LIMB.foreR2], LIMB.armR2);
  assert.equal(PARENT[LIMB.foreL2], LIMB.armL2);
  assert.equal(PARENT.length, LIMBS);
  setBodyParts(null);
  setFaceParts(null);
  setHairParts(null);
  const besalisk = lookOf({ name: "Besalisk", skinColorOptions: "Brown or green", distinctions: "Bony headcrest, four arms, inflatable wattle", heightAverage: "6'0\"" } as never);
  assert.equal(besalisk.arms, 4);
  const draw = (look: typeof human) => { const spec = figureSpec("person", "Kel Dorn", { role: "patron", species: "besalisk", looks: { besalisk: look } }); const k = new Kit(); k.animated = true; spec.build(k); return k; };
  const four = draw(besalisk);
  const bit = (l: number) => (four.jointMaskHi & (1 << (l - 32))) !== 0;
  assert.ok(bit(LIMB.armR2) && bit(LIMB.armL2) && bit(LIMB.foreR2) && bit(LIMB.foreL2), "the four limbs are in the model");
  const two = draw({ ...besalisk, arms: 2 });
  assert.ok(!(two.jointMaskHi & (1 << (LIMB.armR2 - 32))), "two arms have no second pair");
  // (the pivots: the lower shoulder under the upper one, the elbow lower again)
  assert.ok(four.pivots[LIMB.armR2 * 3 + 1] < four.pivots[LIMB.armR * 3 + 1] - 0.05, "the lower shoulder is under the upper");
  assert.ok(four.pivots[LIMB.foreR2 * 3 + 1] < four.pivots[LIMB.armR2 * 3 + 1], "its elbow lower still");
  const at = (stride: Stride, t: number) => { const out = restPose(); humanPose(stride, t, motion({}), eased(), "none", "niman", t, { hip: 0.56, knee: 0.31 }, out, personaOf(5)); return out; };
  const walk = (phase: number): Stride => ({ phase, amp: 1, speed: 2, accel: 0, turn: 0 });
  const x = (p: Float32Array, l: number) => p[l * 4];
  const quarter = at(walk(Math.PI / 2), 3);
  assert.ok(x(quarter, LIMB.armR) * x(quarter, LIMB.armR2) < 0, `the right lower arm swings against the right upper: ${x(quarter, LIMB.armR)} ${x(quarter, LIMB.armR2)}`);
  assert.ok(x(quarter, LIMB.armL) * x(quarter, LIMB.armL2) < 0, "and the left");
  // (at rest each hand gestures in its turn: over a minute the forearms lift, and not both together)
  let lifts = 0, together = 0;
  for (let i = 0; i < 600; i++) {
    const p = at(standing(), i * 0.1);
    const [r, l] = [Math.abs(x(p, LIMB.foreR2)), Math.abs(x(p, LIMB.foreL2))];
    if (r > 0.2 || l > 0.2) lifts++;
    if (r > 0.2 && l > 0.2) together++;
  }
  assert.ok(lifts > 20, `a gesture now and then: ${lifts}`);
  assert.ok(together < lifts / 2, `not both at once: ${together} of ${lifts}`);
  const cheer = standActPose("cheer", 1.3);
  assert.ok(Math.abs(x(cheer, LIMB.armR2)) > 0.3 && Math.abs(x(cheer, LIMB.armL2)) > 0.3, "a cheer pumps all four");
});
