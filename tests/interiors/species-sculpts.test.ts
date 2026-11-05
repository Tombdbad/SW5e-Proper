import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { piecesOf, setBodyParts, setFaceParts, setHairParts, setSpeciesParts, type CreatureParts } from "../../client/src/components/Map/interiors/body";
import { Kit, figureSpec, lookOf, SPECIES_HEADS } from "../../client/src/components/Map/models";

// The species' own heads and the sculpted horns and head-tails (2026-11-05, tools/blender/build-species.py, figures/species.glb; the user: "use these
// images as inspiration to update the head meshes and textures, normal maps")
const buf = fs.readFileSync(path.resolve(import.meta.dirname, "../../client/public/figures/species.glb"));
const parts = await new Promise<CreatureParts>((resolve, reject) =>
  new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => resolve(piecesOf(g.scene)), reject));
const tris = (p: Record<number, THREE.BufferGeometry>) => Object.values(p).reduce((n, g) => n + g.index!.count / 3, 0);
const look = (name: string, distinctions: string, extra: Record<string, string> = {}) => lookOf({ name, distinctions, heightAverage: "5'6\"", ...extra } as never);

test("species.glb has each species' head in its own cell of the atlas, and the horns and head-tails, within budget", () => {
  for (const [key, spec] of Object.entries(SPECIES_HEADS)) {
    const head = parts[`sphead_${key}`];
    assert.ok(head, `sphead_${key}`);
    const g = head.part[0];
    assert.ok(g.attributes.uv && g.attributes.ao, `${key}: coordinates and occlusion`);
    const [u0, v0, du, dv] = spec.cell;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 5) assert.ok(uv.getX(i) >= u0 - 1e-3 && uv.getX(i) <= u0 + du + 1e-3 && uv.getY(i) >= v0 - 1e-3 && uv.getY(i) <= v0 + dv + 1e-3, `${key}: in its cell`);
    assert.ok(tris(head.part) < 3500, `${key}: ${tris(head.part)} triangles`);
    assert.equal(spec.eyes.length, 4, `${key}: where its eyes are`);
  }
  for (const n of ["horns_crown", "horns_curl", "horns_sweep", "head_tentacles"]) {
    assert.ok(parts[n], n);
    assert.ok(tris(parts[n].part) < 3200, `${n}: ${tris(parts[n].part)} triangles`);
  }
  // (a Mon Calamari's dome is taller than a person's head, a Rodian's snout stands well out in front)
  const box = (n: string) => { const b = new THREE.Box3(); for (const g of Object.values(parts[n].part)) { g.computeBoundingBox(); b.union(g.boundingBox!); } return b; };
  assert.ok(box("sphead_moncal").max.y > 0.14, "a high dome");
  assert.ok(box("sphead_rodian").max.z > 0.15, "a snout");
});

test("a species is given its own head and horns by its name and what the rules data says of it", () => {
  assert.equal(look("Mon Calamari", "Large, goggle-like eyes, high-domed heads, webbed hands").speciesHead, "moncal");
  assert.equal(look("Rodian", "Large and round pupil-less eyes, snouts, pointed ears, antennae").speciesHead, "rodian");
  assert.equal(look("Human", "").speciesHead, undefined);
  assert.equal(look("Zabrak", "Horns, two hearts, facial tattoos").hornStyle, "crown");
  assert.equal(look("Devaronian", "Horns or horn spots, long pointed ears").hornStyle, "curl");
  assert.equal(look("Iktotchi", "Horns, precognition, telepathy, thick pink skin").hornStyle, "sweep");
  assert.equal(look("Twi'lek", "Lekku, sharp claw-like nails").hornStyle, undefined);
});

test("a figure of such a species is drawn with its own head in the species finish once the file is in, and as before until then", () => {
  setBodyParts(null);
  setFaceParts(null);
  setHairParts(null);
  setSpeciesParts(null);
  const draw = (l: ReturnType<typeof look>) => { const spec = figureSpec("person", "Kel Dax", { role: "patron", looks: { human: l } }); const k = new Kit(); k.animated = true; spec.build(k); return k; };
  const moncal = look("Mon Calamari", "Large, goggle-like eyes, high-domed heads, webbed hands");
  const zabrak = look("Zabrak", "Horns, two hearts, facial tattoos");
  const nautolan = look("Nautolan", "Extrasensory head tentacles capable of detecting chemicals");
  assert.ok(!draw(moncal).parts.some((p) => p.finish === "species"), "no species head before the file");
  const before = [zabrak, nautolan].map((l) => draw(l).parts.reduce((n, p) => n + p.geo.index!.count, 0));
  setSpeciesParts(parts);
  const k = draw(moncal);
  const own = k.parts.filter((p) => p.finish === "species");
  assert.ok(own.length && own.every((p) => p.geo.attributes.uv), "the Mon Calamari's own head, with its coordinates");
  [zabrak, nautolan].forEach((l, i) => assert.notEqual(draw(l).parts.reduce((n, p) => n + p.geo.index!.count, 0), before[i], "drawn with the sculpted horns and head-tails"));
  setSpeciesParts(null);
});
