import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { faceParts, hairParts, piecesOf, setFaceParts, setHairParts, setBodyParts, type CreatureParts } from "../../client/src/components/Map/interiors/body";
import { Kit, figureSpec, lookOf, hairStyleOf, beardOf, HAIR_MALE, HAIR_FEMALE, BEARDS } from "../../client/src/components/Map/models";
import { GIVEN_NAMES } from "../../shared/logic";

// The heads (tools/blender/build-head.py) and the hair (tools/blender/build-hair.py), read as the browser reads them
const dir = path.resolve(import.meta.dirname, "../../client/public/figures");
const piecesFrom = (name: string): Promise<CreatureParts> => {
  const buf = fs.readFileSync(path.join(dir, name));
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => resolve(piecesOf(g.scene)), reject));
};
const trianglesOf = (p: Record<number, THREE.BufferGeometry>) => Object.values(p).reduce((n, g) => n + g.index!.count / 3, 0);
const boundsOf = (p: Record<number, THREE.BufferGeometry>) => { const b = new THREE.Box3(); for (const g of Object.values(p)) { g.computeBoundingBox(); b.union(g.boundingBox!); } return b; };
const STYLES = [...new Set([...HAIR_MALE, ...HAIR_FEMALE].filter(Boolean))];
const BEARD_STYLES = [...new Set(BEARDS.filter(Boolean))];

test("head.glb holds a masculine and a feminine head, each a face with texture coordinates in its cell of the atlas and a pair of ears", async () => {
  const hi = await piecesFrom("head.glb");
  for (const [name, [u0, v0]] of [["head_m", [0, 0.625]], ["head_f", [0, 0.25]]] as const) {
    const part = hi[name].part;
    assert.deepEqual(Object.keys(part).map(Number).sort(), [0, 3], `${name}'s regions: the face and the ears`);
    const uv = part[0].attributes.uv as THREE.BufferAttribute;
    assert.ok(uv, `${name} has texture coordinates`);
    for (let i = 0; i < uv.count; i++) {
      assert.ok(uv.getX(i) >= u0 - 1e-4 && uv.getX(i) <= u0 + 0.375 + 1e-4 && uv.getY(i) >= v0 - 1e-4 && uv.getY(i) <= v0 + 0.375 + 1e-4, `${name}'s coordinates are in its cell of the atlas`);
    }
    const ao = part[0].attributes.ao.array as Float32Array;
    assert.ok(ao.every((v) => v > 0 && v <= 1.0001), `${name} occlusion`);
    const n = part[0].attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i += 11) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 0.01, `${name} normals`);
    // the skull's size, as the old head's was: about 0.100 by 0.118 by 0.112, the nose in front
    const b = boundsOf(part);
    assert.ok(Math.abs(b.max.y - 0.118) < 0.012 && b.max.z > 0.11 && b.max.z < 0.14 && b.max.x > 0.1 && b.max.x < 0.125, `${name} ${b.min.toArray()} ${b.max.toArray()}`);
    assert.ok(trianglesOf(part) < 3000, `${name}: ${trianglesOf(part)} triangles`);
  }
  // (and the file for a phone has far fewer)
  const lo = await piecesFrom("head.lo.glb");
  assert.ok(trianglesOf(lo.head_m.part) < trianglesOf(hi.head_m.part) * 0.5, "the phone's head");
});

test("the atlas of the face has its maps, and the strands of hair theirs", () => {
  const f = (p: string) => path.resolve(import.meta.dirname, "../../client/public/textures/figure", p);
  for (const p of ["head/diffuse.jpg", "head/normal.jpg", "hair/strands.webp"]) assert.ok(fs.existsSync(f(p)), p);
  assert.ok(fs.statSync(f("hair/strands.webp")).size > 20000, "the strands have some content");
});

test("hair.glb holds every style of the lists, the beards and the brows, as cards with texture coordinates, a root-to-tip occlusion, and a budget", async () => {
  const hi = await piecesFrom("hair.glb");
  const lo = await piecesFrom("hair.lo.glb");
  for (const name of [...STYLES, ...BEARD_STYLES, "brows_m_0", "brows_f2_2"]) {
    assert.ok(hi[name] && lo[name], `${name} is in both files`);
    const g = hi[name].part[0];
    assert.ok(g.attributes.uv, `${name} has texture coordinates`);
    const ao = g.attributes.ao.array as Float32Array;
    assert.ok(ao.every((v) => v > 0 && v <= 1.0001) && Math.min(...ao) < 0.7, `${name}: roots darker`);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 5) assert.ok(uv.getX(i) >= -1e-4 && uv.getX(i) <= 1 + 1e-4 && uv.getY(i) >= -1e-4 && uv.getY(i) <= 1 + 1e-4, `${name} coordinates`);
    const tris = trianglesOf(hi[name].part);
    assert.ok(tris < 3000, `${name}: ${tris} triangles`);
    assert.ok(trianglesOf(lo[name].part) < tris * 0.75 || tris < 300, `${name} on a phone: ${trianglesOf(lo[name].part)} of ${tris}`);
  }
  // the hair stays near the head: no style stands higher than a hand over the crown or hangs lower than the waist
  for (const name of STYLES) {
    const b = boundsOf(hi[name].part);
    assert.ok(b.max.y < 0.24 && b.min.y > -0.46 && b.max.x < 0.27 && b.min.x > -0.27 && b.max.z < 0.2 && b.min.z > -0.26, `${name} ${b.min.toArray().map((x) => x.toFixed(2))} ${b.max.toArray().map((x) => x.toFixed(2))}`);
  }
  // and never inside the skull (the part of it above the eyes, where the skull is the ellipsoid)
  for (const name of STYLES) {
    const p = hi[name].part[0].attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0.05) continue;
      const f = (p.getX(i) / 0.1) ** 2 + (p.getY(i) / 0.118) ** 2 + (p.getZ(i) / 0.112) ** 2;
      assert.ok(f > 0.97, `${name} has a vertex in the skull (${f.toFixed(3)})`);
    }
  }
});

test("a person's hair comes from their name: both lists are used, a style is in the file, and beards belong to some of the men", () => {
  const seeds = Array.from({ length: 360 }, (_, i) => i);
  for (const fem of [false, true]) {
    const used = new Set(seeds.map((s) => hairStyleOf(s, fem)));
    assert.equal(used.size, new Set(fem ? HAIR_FEMALE : HAIR_MALE).size, "every style of the list is drawn");
  }
  assert.ok(HAIR_MALE.includes("") && !HAIR_FEMALE.includes(""), "some men are bald; the women's list has hair in every place");
  const bearded = seeds.filter((s) => beardOf(s));
  assert.ok(bearded.length > 360 * 0.3 && bearded.length < 360 * 0.6, `${bearded.length} of 360 have beards`);
  // (the given names of the world's lists reach both heads)
  assert.ok(GIVEN_NAMES.male.length && GIVEN_NAMES.female.length);
});

test("a person is drawn with the new head, brows and hair once their files are in, a beard on some men, and with the old ones before", async () => {
  setBodyParts(null);
  setFaceParts(null);
  setHairParts(null);
  const look = lookOf({ name: "Human", skinColorOptions: "Light to dark tones", hairColorOptions: "Black, brown", heightAverage: "4'8\"", heightRollMod: "+2d10\"" } as never);
  const draw = (name: string) => { const spec = figureSpec("person", name, { role: "bartender", looks: { human: look } }); const k = new Kit(); k.animated = true; spec.build(k); return { k, key: spec.key, finishes: new Set(k.parts.map((p) => p.finish)) }; };
  const before = draw("Dax Vos");
  assert.ok(!before.finishes.has("head") && !before.finishes.has("strand"), "before the files, the old head and hair");
  setFaceParts(await piecesFrom("head.glb"));
  setHairParts(await piecesFrom("hair.glb"));
  assert.ok(faceParts() && hairParts());
  const after = draw("Dax Vos");
  assert.notEqual(after.key, before.key, "the model is baked again once the files are in");
  assert.ok(after.finishes.has("head"), "the face is drawn in the head finish");
  assert.ok(after.k.parts.filter((p) => p.finish === "head").every((p) => p.geo.attributes.uv), "with its texture coordinates");
  const strands = after.k.parts.filter((p) => p.finish === "strand");
  assert.ok(strands.every((p) => p.geo.attributes.uv && p.geo.attributes.limb), "hair has its coordinates and rides the head's limb");
  // (a woman has the feminine head: its texture coordinates are in the cells under the masculine heads')
  const woman = draw("Mara Vos");
  const uvx = (k: Kit) => { const g = k.parts.find((p) => p.finish === "head")!.geo.attributes.uv as THREE.BufferAttribute; return g.getY(0); };
  assert.ok(uvx(woman.k) <= 0.625 && uvx(draw("Dax Vos").k) >= 0.625, "the feminine head is in the lower cells of the atlas, the masculine in the upper");
  // the triangles of a whole head with hair stay in the budget (a head about 1.5k, hair up to 2.7k)
  const tris = (k: Kit, finishes: string[]) => k.parts.filter((p) => finishes.includes(p.finish)).reduce((n, p) => n + p.geo.index!.count / 3, 0);
  assert.ok(tris(after.k, ["head", "strand"]) < 5200, `${tris(after.k, ["head", "strand"])} triangles of head and hair`);
  setFaceParts(null);
  setHairParts(null);
});
