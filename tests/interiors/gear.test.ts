import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { armourWeight, coverageOf, type Item } from "../../client/src/components/Map/interiors/gear";

const items: Item[] = JSON.parse(fs.readFileSync("shared/data/sw5e/equipment.json", "utf8"));
const named = (name: string) => items.find((i) => i.name === name)!;

test("armour is covered by the rules data's own class, shields by what they are", () => {
  assert.equal(coverageOf(named("Combat suit")).model, "kenney-kitbash/armour-light");
  assert.equal(coverageOf(named("Composite armor")).model, "kenney-kitbash/armour-medium");
  assert.equal(coverageOf(named("Battle armor")).model, "kenney-kitbash/armour-heavy");
  assert.equal(coverageOf(named("Heavy shield generator")).model, "kenney-kitbash/shield-generator");
  assert.equal(coverageOf(named("Heavy physical shield")).model, "kenney-kitbash/shield-physical");
  assert.equal(armourWeight(named("Battle armor")), "heavy");
  assert.equal(armourWeight(named("Blaster rifle")), undefined);
});
test("weapons, kits, tools and prostheses are covered as they are modelled", () => {
  assert.equal(coverageOf(named("Blaster rifle")).bucket, "shared");
  assert.equal(coverageOf(named("Vibroblade")).model, "kenney-kitbash/vibro-blade");
  assert.equal(coverageOf(named("Lightsaber")).bucket, "code");
  assert.equal(coverageOf(named("Mechanic's kit")).bucket, "shared");
  assert.equal(coverageOf(named("Tinker's implements")).model, "kenney-kitbash/tool-roll");
  assert.deepEqual([coverageOf(named("Medpac")).bucket, coverageOf(named("Arm prosthesis")).bucket, coverageOf(named("Torso prosthesis")).bucket], ["dedicated", "dedicated", "none"]);
  assert.equal(coverageOf(named("Datapad")).bucket, "none");
});
test("every model a coverage names exists", () => {
  for (const it of items) {
    const c = coverageOf(it);
    if (c.model) assert.ok(fs.existsSync(`client/public/assets/${c.model}.glb`), `${it.name}: ${c.model}`);
  }
});

import { handOf, wantsOf, type Gear } from "../../client/src/components/Map/interiors/gear";
test("a character's weapon sets their pose and their model; sabers stay in code", () => {
  assert.equal(handOf(named("Blaster pistol")), "pistol");
  assert.equal(handOf(named("Blaster rifle")), "rifle");
  assert.equal(handOf(named("Vibroaxe")), "axe");
  assert.equal(handOf(named("Lightsaber")), "saber");
  assert.equal(handOf(named("Medpac")), undefined);
  const gear: Gear = { weapons: [named("Blaster rifle")], carried: [] };
  const w = wantsOf("rifle", gear)[0];
  assert.equal(w.slot, "weapon");
  assert.match(w.model, /^kenney-blaster\/blaster-/);
  assert.ok(w.scale > 0.3 && w.scale < 1.2);
  assert.deepEqual(wantsOf("saber", { weapons: [named("Lightsaber")], carried: [] }), []);
});
test("shields, kits, medicine and prostheses go where they are worn, each place once", () => {
  const gear: Gear = {
    weapons: [named("Vibroblade")], shield: named("Medium physical shield"),
    carried: [named("Mechanic's kit"), named("Medpac"), named("Tinker's implements"), named("Arm prosthesis"), named("Leg prosthesis"), named("Datapad")],
  };
  const wants = wantsOf("vibro", gear);
  const slots = wants.map((w) => w.slot);
  assert.equal(new Set(slots).size, slots.length, `a slot twice: ${slots}`);
  for (const slot of ["weapon", "shield", "armR", "legL", "hipR", "hipL"]) assert.ok(slots.includes(slot as never), slot);
  assert.ok(slots.length <= 7);
  assert.equal(wants.find((w) => w.slot === "armR")!.model, "kenney-kitbash/prosthesis-arm");
  assert.equal(wants.find((w) => w.slot === "shield")!.model, "kenney-kitbash/shield-physical");
  for (const w of wants) assert.ok(fs.existsSync(`client/public/assets/${w.model}.glb`), w.model);
});
test("an NPC holds what their outfit's pose says and carries what their work suggests", () => {
  assert.equal(wantsOf("pistol", undefined)[0].model.startsWith("kenney-blaster/"), true);
  assert.equal(wantsOf("vibro", undefined)[0].model, "kenney-kitbash/vibro-blade");
  assert.deepEqual(wantsOf("", undefined, "medic").map((w) => w.model), ["kenney-kitbash/medpac"]);
  assert.deepEqual(wantsOf("tool", undefined, "mechanic").map((w) => w.slot), ["hipR"]);
  assert.deepEqual(wantsOf("saber", undefined, "patron"), []);
});

import { gearOf } from "../../client/src/lib/sw5e/characterCalculation";
test("a character's gear is read from what they wield and wear, by the rules data's class", () => {
  const character = { equipment: ["Vibroblade", "Combat suit", "Medium physical shield", "Medpac", "Arm prosthesis", "Mechanic's kit", "Blaster pistol"], armor: { weapons: ["Vibroblade"], body: "Combat suit", shield: "Medium physical shield" }, abilityScores: {} };
  const gear = gearOf(character);
  assert.deepEqual(gear.weapons.map((w) => w.name), ["Vibroblade"]);
  assert.equal(gear.bodyClass, "light");
  assert.equal(gear.shield?.name, "Medium physical shield");
  assert.deepEqual(gear.carried.map((c) => c.name).sort(), ["Arm prosthesis", "Blaster pistol", "Mechanic's kit", "Medpac"].sort());
  assert.equal(gearOf({ equipment: ["Battle armor"], abilityScores: {} }).bodyClass, "heavy");
  assert.deepEqual(gearOf({ equipment: [] }), { weapons: [], bodyClass: undefined, shield: undefined, carried: [] });
});
