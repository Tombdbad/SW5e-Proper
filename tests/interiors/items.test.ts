import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ROOT, ASSETS, loadGlb, trianglesOf } from "../helpers";
import { FINISH_OF_MARK, geometryOf, splitByFinish } from "../../client/src/components/Map/interiors/assets";
import { ITEM_MODELS, assetPath, composeSaber, itemRef, modelUrl, needsBlade, pivotOf, socketOf, toned, withoutParts } from "../../client/src/components/Map/interiors/items";
import { KIT_MODELS } from "../../client/src/components/Map/interiors/kitbash";
import { LENGTH } from "../../client/src/components/Map/interiors/weapons";

const index: Record<string, string | [string, Record<string, unknown>]> = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/art/itemIndex.json"), "utf8"));
const names = Object.keys(ITEM_MODELS);
const file = (model: string, low = false) => path.join(ASSETS, ITEM_MODELS[model].pack, `${model}${low ? ".lod" : ""}.glb`);
// A model as the game loads it (one geometry, flat, with its marks), read from disk
async function loaded(model: string): Promise<THREE.BufferGeometry> {
  const data = fs.readFileSync(file(model));
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Object3D }>((ok, no) => new GLTFLoader().parse(buffer, "", ok as never, no));
  return geometryOf(gltf.scene, "centre")!;
}

test("the catalogue lists every model file of the sw5e packs, in both detail levels, and each pack has its licence", () => {
  const packs = new Set(names.map((n) => ITEM_MODELS[n].pack));
  assert.ok(names.length > 380, `${names.length} models`);
  for (const pack of packs) assert.match(fs.readFileSync(path.join(ASSETS, pack, "License.txt"), "utf8"), /Creative Commons Zero/);
  for (const pack of fs.readdirSync(ASSETS).filter((d) => d.startsWith("sw5e-"))) {
    const onDisk = fs.readdirSync(path.join(ASSETS, pack)).filter((f) => f.endsWith(".glb") && !f.endsWith(".lod.glb")).map((f) => f.slice(0, -4));
    for (const m of onDisk) assert.ok(ITEM_MODELS[m]?.pack === pack, `${pack}/${m} is not in the catalogue`);
  }
  for (const n of names) {
    assert.ok(fs.existsSync(file(n)) && fs.existsSync(file(n, true)), n);
    assert.equal(modelUrl(n), `/assets/${ITEM_MODELS[n].pack}/${n}.glb`);
    assert.equal(assetPath(n), `${ITEM_MODELS[n].pack}/${n}`);
  }
});
test("every model is small: a hero under 2,000 triangles, a low detail of about 110 and smaller", () => {
  for (const n of names) {
    const m = ITEM_MODELS[n];
    assert.ok(m.tris > 0 && m.tris <= 2000, `${n} hero ${m.tris}`);
    assert.ok(m.lodTris > 0 && m.lodTris <= 150 && m.lodTris <= m.tris, `${n} low ${m.lodTris} of ${m.tris}`);
  }
});
test("every model says where it goes, and a weapon says where the hand and the tip are", () => {
  const SLOTS = new Set(["weapon", "shield", "hipR", "hipL", "back", "belt", "head", "neck", "shoulder", "wrist", "forearm", "finger", "feet", "hands", "hands-knees", "torso", "body", "stand", "floor", "hand", "droid-module", "item-mod", "ammo", "thrown", "saber-blade", "weapon-accessory"]);
  for (const n of names) {
    const meta = ITEM_MODELS[n].meta;
    assert.ok(meta.slot && SLOTS.has(meta.slot), `${n}: slot ${meta.slot}`);
    assert.ok(meta.tone === "none" || meta.tone === "palette", `${n}: tone ${meta.tone}`);
    if (meta.slot === "weapon") assert.ok(socketOf(n, "grip"), `${n} has no grip`);
  }
  for (const n of names.filter((x) => x.startsWith("saber-"))) assert.ok(socketOf(n, "tip") && pivotOf(n, "blade"), n);
});
test("a model's marks name how it is drawn: a saber's blade glows, its hilt is metal, and the parts are numbered", async () => {
  const g = await loaded("saber-straight");
  const mark = g.getAttribute("mark");
  assert.ok(mark, "no marks");
  const finishes = new Set<string>();
  for (let i = 0; i < mark.count; i++) finishes.add(FINISH_OF_MARK[Math.round(mark.getX(i))]);
  assert.ok(finishes.has("glow") && finishes.has("sheen"), [...finishes].join());
  const groups = splitByFinish(g);
  assert.ok(groups.length >= 2);
  assert.equal(groups.reduce((n, x) => n + x.geo.getAttribute("position").count, 0), g.getAttribute("position").count);
  const parts = ITEM_MODELS["saber-straight"].parts!;
  const blade = parts.findIndex((p) => p.name === "blade");
  assert.ok(blade >= 0);
  // Every vertex of the blade glows, and the blade is the only part that does
  for (let i = 0; i < mark.count; i++) assert.equal(Math.round(mark.getX(i)) === 2, Math.round(mark.getY(i)) === blade, `vertex ${i}`);
});
test("the index names a model that exists for every item, and the blades and kit models it names exist too", () => {
  const equipment: { name: string }[] = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/data/sw5e/equipment.json"), "utf8"));
  const enhanced: { name: string }[] = JSON.parse(fs.readFileSync(path.join(ROOT, "shared/data/sw5e/enhancedItems.json"), "utf8"));
  const known = new Set([...equipment, ...enhanced].map((e) => e.name));
  assert.ok(Object.keys(index).length > 2000);
  for (const name of Object.keys(index)) {
    assert.ok(known.has(name), `${name} is not an item of the rules data`);
    const ref = itemRef(name)!;
    if (ref.model.startsWith("kitbash:")) assert.ok(ref.model.slice(8) in KIT_MODELS, `${name}: ${ref.model}`);
    else if (!ref.model.startsWith("weapon:")) assert.ok(ref.model in ITEM_MODELS, `${name}: ${ref.model}`);
    if (ref.blade && ref.blade !== "whip" && ref.blade !== "dark") assert.ok(`blade-${ref.blade}` in ITEM_MODELS, `${name}: blade ${ref.blade}`);
  }
  // Every item of the equipment has a model: its own or one the code gives it by kind (tests/interiors/gear.test.ts)
  for (const e of equipment) assert.ok(itemRef(e.name) || ["Weapon", "Armor", "Kit", "Tool", "Medical", "Explosive", "Ammunition", "Storage"].includes((e as { equipmentCategory?: string }).equipmentCategory ?? ""), e.name);
});
test("a hand-held weapon is as long as its kind, and every bow, saber and blade shape the length it was made for", () => {
  const size = (n: string) => { const b = ITEM_MODELS[n].box; return [b[3] - b[0], b[4] - b[1], b[5] - b[2]]; };
  assert.ok(Math.abs(size("saber-straight")[2] - LENGTH.saber) < 0.02, `${size("saber-straight")}`);
  assert.ok(Math.abs(size("saber-double")[2] - LENGTH.dualsaber * 0.76) < 0.1);
  for (const n of ["shortbow", "compound-bow", "energy-bow", "light-bow"]) assert.ok(size(n)[2] > 0.45 && size(n)[2] < 0.75, n);
  for (const n of names.filter((x) => x.startsWith("blade-"))) assert.ok(socketOf(n, "base") && socketOf(n, "tip"), n);
});
test("type-coloured models are never toned to a room palette", () => {
  for (const n of ["grenade-cryo", "mine-gas", "stim-strength", "arrow-combustive", "space-suit", "blade-axe", "droid-reflex-protocol-mk-2"]) assert.equal(toned(n), false, n);
  for (const n of ["holster", "backpack", "saber-straight"]) assert.equal(toned(n), true, n);
});

test("a saber whose name wants another blade is its hilt without the blade and the blade shape at the hilt's hinge", async () => {
  const ref = itemRef("Lightaxe")!;
  assert.equal(ref.model, "saber-straight");
  assert.equal(ref.blade, "axe");
  assert.ok(needsBlade(ref) && !needsBlade(itemRef("Lightsaber")!));
  const hilt = await loaded("saber-straight");
  const blade = await loaded("blade-axe");
  const joined = composeSaber(hilt, "saber-straight", blade, "blade-axe", 1);
  // The hilt's own blade is gone: nothing of the hilt model glows any more but the axe's blade does, wider than a standard blade is
  const mark = joined.getAttribute("mark");
  assert.ok(mark.count > 0);
  const box = new THREE.Box3().setFromBufferAttribute(joined.getAttribute("position") as THREE.BufferAttribute);
  assert.ok(box.max.x - box.min.x > 0.1, `the axe head is ${(box.max.x - box.min.x).toFixed(3)} wide`);
  const hiltBox = new THREE.Box3().setFromBufferAttribute(hilt.getAttribute("position") as THREE.BufferAttribute);
  // The blade starts where the hilt's emitter ends: the whole stays about as long as the original saber
  const [h, j] = [hiltBox.max.z - hiltBox.min.z, box.max.z - box.min.z];
  assert.ok(Math.abs(h - j) < 0.05, `hilt+blade ${h.toFixed(3)} against ${j.toFixed(3)}`);
  // Taking a part away takes whole triangles
  const bladePart = ITEM_MODELS["saber-straight"].parts!.findIndex((p) => p.name === "blade");
  const stripped = withoutParts(hilt, new Set([bladePart]));
  assert.ok(stripped.getAttribute("position").count < hilt.getAttribute("position").count && stripped.getAttribute("position").count % 3 === 0);
  // A double has a blade at each end, both replaced
  const double = composeSaber(await loaded("saber-double"), "saber-double", blade, "blade-axe", 1);
  const db = new THREE.Box3().setFromBufferAttribute(double.getAttribute("position") as THREE.BufferAttribute);
  assert.ok(db.max.z > 0.1 && db.min.z < -0.1);
});
test("loading is by the file as converted: one mesh, vertex colours, normals in the hero and none in the low detail, no texture", async () => {
  for (const n of ["bowcaster", "heavy-exoskeleton", "tent-two-person", "grenade-plasma"]) {
    const [hero, low] = [await loadGlb(file(n)), await loadGlb(file(n, true))];
    assert.ok(hero.attributes.color && hero.attributes.normal, n);
    assert.ok(low.attributes.color && !low.attributes.normal, n);
    assert.ok(trianglesOf(low) < trianglesOf(hero) || trianglesOf(hero) <= 110, `${n}: ${trianglesOf(low)} of ${trianglesOf(hero)}`);
    const json = JSON.parse(fs.readFileSync(file(n)).subarray(20, 20 + fs.readFileSync(file(n)).readUInt32LE(12)).toString("utf8"));
    assert.ok(!json.images && !json.textures && !json.materials?.length, `${n} carries a material or a texture`);
  }
});
