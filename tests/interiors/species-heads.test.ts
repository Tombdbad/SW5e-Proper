import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { piecesOf, setBodyParts, setFaceParts, setHairParts, type CreatureParts } from "../../client/src/components/Map/interiors/body";
import { Kit, figureSpec, lookOf, hue, hairStyleOf } from "../../client/src/components/Map/models";
import { GIVEN_NAMES } from "../../shared/logic";
import { LIMB, LIMBS, PARENT, eased, humanPose, motion, personaOf, restPose, standing, type Stride } from "../../client/src/components/Map/interiors/limbs";

// The second pass of the heads (2026-11-04): species with a snout, the machine's head, masks, head-tails, hair that hangs, eyes that blink
const dir = path.resolve(import.meta.dirname, "../../client/public/figures");
const piecesFrom = (name: string): Promise<CreatureParts> => {
  const buf = fs.readFileSync(path.join(dir, name));
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => resolve(piecesOf(g.scene)), reject));
};
const trianglesOf = (p: Record<number, THREE.BufferGeometry>) => Object.values(p).reduce((n, g) => n + g.index!.count / 3, 0);
const boundsOf = (p: Record<number, THREE.BufferGeometry>) => { const b = new THREE.Box3(); for (const g of Object.values(p)) { g.computeBoundingBox(); b.union(g.boundingBox!); } return b; };
const human = lookOf({ name: "Human", skinColorOptions: "Light to dark tones", hairColorOptions: "Black, brown", heightAverage: "4'8\"", heightRollMod: "+2d10\"" } as never);

test("head.glb also holds the heads with a snout, the machine's head, four masks and the head-tails, each with its regions, its occlusion and a budget", async () => {
  const hi = await piecesFrom("head.glb");
  const lo = await piecesFrom("head.lo.glb");
  const regions = (n: string) => Object.keys(hi[n].part).map(Number).sort();
  for (const n of ["head_muzzle", "head_long", "head_short", "head_pig", "head_flat"]) {
    assert.deepEqual(regions(n), [0, 3], `${n}: the face and the ears`);
    assert.ok(hi[n].part[0].attributes.uv && hi[n].part[0].attributes.mark, `${n} has coordinates in the atlas and a mark for the nose and the mouth`);
    const uv = hi[n].part[0].attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 7) assert.ok(!(uv.getX(i) < 0.75 - 1e-4 && uv.getY(i) > 0.25 + 1e-4), `${n}'s cell is not in the people's block`);
    const b = boundsOf(hi[n].part);
    assert.ok(b.max.z > 0.11 && b.max.z < 0.2, `${n}: its snout stands out ${b.max.z}`);
  }
  assert.ok(boundsOf(hi.head_long.part).max.z > boundsOf(hi.head_short.part).max.z + 0.03, "a long snout is longer than a short one");
  const want: Record<string, number[]> = { machine_head: [0, 1], mask_wraps: [0, 1, 2], mask_rebreather: [0, 1], mask_bone: [0], mask_goggles: [0, 1, 2], lekku: [0], montral_top: [0], montral_side: [0], montral_back: [0] };
  for (const [n, r] of Object.entries(want)) {
    assert.deepEqual(regions(n), r, `${n} regions`);
    for (const g of Object.values(hi[n].part)) assert.ok((g.attributes.ao.array as Float32Array).every((v) => v > 0 && v <= 1.0001), `${n} occlusion`);
    const tris = trianglesOf(hi[n].part);
    assert.ok(tris < 2400, `${n}: ${tris} triangles`);
    assert.ok(lo[n] && trianglesOf(lo[n].part) <= tris, `${n} in the file for a phone`);
  }
  const m = boundsOf(hi.machine_head.part);
  assert.ok(m.max.y > 0.11 && m.min.y < -0.1 && m.max.x > 0.1 && m.max.z > 0.1, `machine head ${m.min.toArray()} ${m.max.toArray()}`);
  assert.ok(boundsOf(hi.lekku.part).min.y < -0.4, "a head-tail hangs to the waist");
});

test("species with a snout, a mask, a machine's head or head-tails are drawn from the new pieces once they are in, and as before until then", async () => {
  setBodyParts(null);
  setFaceParts(null);
  setHairParts(null);
  const tris = (k: Kit) => k.parts.reduce((n, p) => n + p.geo.index!.count / 3, 0);
  const draw = (look: typeof human) => { const spec = figureSpec("person", "Kel Dax", { role: "patron", looks: { human: look } }); const k = new Kit(); k.animated = true; spec.build(k); return k; };
  const cases: [string, Partial<typeof human>, string][] = [
    ["pig", { snout: "pig" }, "head"],
    ["muzzle, skinned", { snout: "muzzle" }, "head"],
    ["wraps", { mask: "wraps", hair: [] }, "weave"],
    ["rebreather", { mask: "rebreather" }, "sheen"],
    ["bone", { mask: "bone" }, "matte"],
    ["goggles", { mask: "goggles" }, "leather"],
    ["machine", { machine: true, hair: [] }, "droid"],
    ["lekku", { lekku: true, hair: [] }, "face"],
  ];
  const before = cases.map(([, o]) => tris(draw({ ...human, ...o })));
  setFaceParts(await piecesFrom("head.glb"));
  setHairParts(await piecesFrom("hair.glb"));
  cases.forEach(([name, o, finish], i) => {
    const k = draw({ ...human, ...o });
    assert.ok(k.parts.some((p) => p.finish === finish), `${name}: a part in ${finish}`);
    assert.notEqual(tris(k), before[i], `${name}: drawn from the file once it is in`);
  });
  const pig = draw({ ...human, snout: "pig" });
  assert.ok(pig.parts.filter((p) => p.finish === "head").every((p) => p.geo.attributes.uv && !p.geo.attributes.mark), "a skinned snout: baked, with no mark on top of the baked paint");
  setFaceParts(null);
  setHairParts(null);
});

test("hair that hangs and the lids of the eyes are limbs of their own: the chain, the vertices handed to them, a swing with the stride, a blink", async () => {
  assert.equal(LIMBS, PARENT.length);
  assert.equal(PARENT[LIMB.hairA], LIMB.head);
  assert.equal(PARENT[LIMB.hairB], LIMB.hairA);
  assert.equal(PARENT[LIMB.lids], LIMB.head);
  setBodyParts(null);
  setFaceParts(await piecesFrom("head.glb"));
  setHairParts(await piecesFrom("hair.glb"));
  const named = (fem: boolean, style: string) => {
    for (const g of fem ? GIVEN_NAMES.female : GIVEN_NAMES.male) for (let i = 0; i < 40; i++) { const n = `${g} V${i}`; if (hairStyleOf(hue(n), fem) === style) return n; }
    throw new Error(style);
  };
  const draw = (name: string) => { const spec = figureSpec("person", name, { role: "patron", looks: { human } }); const k = new Kit(); k.animated = true; spec.build(k); return k; };
  const longK = draw(named(true, "hair_long"));
  assert.ok(longK.jointMaskHi & (1 << (LIMB.hairA - 32)) && longK.jointMaskHi & (1 << (LIMB.hairB - 32)), "the hair's limbs are in the model");
  assert.ok(longK.jointMaskHi & (1 << (LIMB.lids - 32)), "so are the lids");
  const handed = { a: 0, b: 0 };
  for (const p of longK.parts.filter((p) => p.finish === "strand")) {
    const limb = p.geo.attributes.limb as THREE.BufferAttribute, pivot = p.geo.attributes.pivot as THREE.BufferAttribute;
    for (let i = 0; i < limb.count; i++) {
      const l = Math.round(limb.getX(i));
      if (l === LIMB.hairA) handed.a++;
      if (l === LIMB.hairB) handed.b++;
      if (l === LIMB.hairA || l === LIMB.hairB) assert.ok(Math.abs(pivot.getY(i) - longK.pivots[l * 3 + 1]) < 1e-6, "a vertex carries its limb's pivot");
    }
  }
  assert.ok(handed.a > 100 && handed.b > 30, `long hair: ${handed.a} vertices on the upper limb, ${handed.b} on the lower`);
  const crop = draw(named(false, "hair_crop"));
  assert.ok(!(crop.jointMaskHi & (1 << (LIMB.hairA - 32))), "a crop does not swing");
  const at = (stride: Stride, t: number) => { const out = restPose(); humanPose(stride, t, motion({}), eased(), "none", "niman", t, { hip: 0.56, knee: 0.31 }, out, personaOf(5)); return out; };
  const angle = (p: Float32Array, limb: number) => 2 * Math.acos(Math.min(1, Math.abs(p[limb * 4 + 3])));
  const walk = (phase: number): Stride => ({ phase, amp: 1, speed: 2, accel: 0, turn: 0 });
  const spread = [0, 1, 2, 3, 4, 5].map((i) => at(walk(i), 3)[LIMB.hairA * 4]);   // (the turn about x, which is how it swings forward and back)
  assert.ok(Math.max(...spread) - Math.min(...spread) > 0.05, `the hair swings with the stride: ${spread.map((x) => x.toFixed(3))}`);
  assert.ok(angle(at(walk(1.3), 3), LIMB.hairB) > 0.02, "the lower limb moves too");
  assert.ok(angle(at(standing(), 3), LIMB.hairA) < 0.15, "standing still it only drifts");
  const lids = Array.from({ length: 800 }, (_, i) => angle(at(standing(), i * 0.01), LIMB.lids));
  assert.ok(Math.max(...lids) > 0.9 && lids.filter((a) => a > 0.3).length < 100, "the lids close for a blink: a moment in every few seconds");
  setFaceParts(null);
  setHairParts(null);
});
