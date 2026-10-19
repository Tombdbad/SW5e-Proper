import test from "node:test";
import assert from "node:assert/strict";
import { kindOfWeapon, hungWeapon, buildWeapon, LENGTH, BLASTER_FILES, type Kind } from "../../client/src/components/Map/interiors/weapons";
import { weaponsOf, baked, sizeOf, trianglesOfBaked } from "../helpers";

const KINDS = Object.keys(LENGTH) as Kind[];

test("every weapon of the rules data has a kind (a few odd ones may be 'other', but not many)", () => {
  const weapons = weaponsOf();
  assert.ok(weapons.length > 200, `${weapons.length} weapons`);
  const other = weapons.filter((w) => kindOfWeapon(w.name, w.weaponClassification) === "other").map((w) => w.name);
  assert.ok(other.length <= 10, `${other.length} left over: ${other.join(", ")}`);
});
test("names are read the way a player would read them", () => {
  const cases: [string, Kind][] = [
    ["Blaster pistol", "pistol"], ["Heavy blaster pistol", "pistol"], ["Blaster carbine", "carbine"], ["Blaster rifle", "rifle"], ["Assault cannon", "heavy"],
    ["Lightsaber", "saber"], ["Doublesaber", "dualsaber"], ["Saberstaff", "dualsaber"], ["Vibroblade", "sword"], ["Vibroknife", "dagger"], ["Vibroaxe", "axe"],
    ["Electrostaff", "staff"], ["Vibropike", "spear"], ["Vibrovoulge", "axe"], ["Shortbow", "bow"], ["Grenade launcher", "heavy"], ["Vibroshield", "shield"],
  ];
  for (const [name, kind] of cases) assert.equal(kindOfWeapon(name), kind, name);
});
test("a blaster hangs as a model, scaled to the length of its kind, always the same design for a name", () => {
  const a = hungWeapon("Blaster rifle");
  assert.equal(a.kind, "rifle");
  assert.ok(a.file && a.scale > 0.3 && a.scale < 1.2, `${a.file} at ${a.scale}`);
  assert.deepEqual(hungWeapon("Blaster rifle"), a);
  const files = new Set(weaponsOf().map((w) => hungWeapon(w.name, w.weaponClassification).file).filter(Boolean));
  assert.ok(files.size >= 8, `${files.size} different designs hang on the racks`);
  assert.equal(hungWeapon("Vibroblade").file, undefined);
});
test("the catalogue's lengths are the right size for a hand", () => {
  for (const kind of KINDS) assert.ok(LENGTH[kind] > 0.08 && LENGTH[kind] < 1.2, `${kind} ${LENGTH[kind]}`);
  assert.ok(LENGTH.pistol < LENGTH.carbine && LENGTH.carbine < LENGTH.rifle && LENGTH.rifle < LENGTH.heavy);
});
test("every kind is built in code, in the length it should be, with the low detail well under the hero", () => {
  for (const kind of KINDS) {
    const hero = baked((k) => buildWeapon(k, kind, LENGTH[kind], "hero"));
    const low = baked((k) => buildWeapon(k, kind, LENGTH[kind], "low"));
    const [heroTris, lowTris] = [trianglesOfBaked(hero), trianglesOfBaked(low)];
    assert.ok(heroTris > 0 && lowTris > 0, kind);
    assert.ok(lowTris <= 120, `${kind} low detail is ${lowTris} triangles`);
    assert.ok(heroTris <= 900, `${kind} hero is ${heroTris} triangles`);
    assert.ok(lowTris <= heroTris, `${kind}: low ${lowTris} <= hero ${heroTris}`);
    const size = sizeOf(low);
    const long = Math.max(size.x, size.y, size.z);
    assert.ok(long > LENGTH[kind] * 0.5 && long < LENGTH[kind] * 1.6, `${kind} is ${long.toFixed(2)} long, should be near ${LENGTH[kind]}`);
  }
});
test("blaster designs are listed once each and cover every length", () => {
  const all = Object.values(BLASTER_FILES).flat().map((d) => d.file);
  assert.equal(new Set(all).size, all.length);
  for (const [kind, list] of Object.entries(BLASTER_FILES)) assert.ok(list.length >= 2, `${kind} has choice`);
});
