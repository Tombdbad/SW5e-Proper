import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { armourWeight, coverageOf, type Item } from "../../client/src/components/Map/interiors/gear";

const items: Item[] = JSON.parse(fs.readFileSync("shared/data/sw5e/equipment.json", "utf8"));
const named = (name: string) => items.find((i) => i.name === name)!;

test("every armour and shield has a model of its own, and its weight is the rules data's own class", () => {
  assert.equal(coverageOf(named("Combat suit")).model, "sw5e-armour/combat-suit");
  assert.equal(coverageOf(named("Composite armor")).model, "sw5e-armour/composite-armor");
  assert.equal(coverageOf(named("Battle armor")).model, "sw5e-armour/battle-armor");
  assert.equal(coverageOf(named("Heavy shield generator")).model, "sw5e-armour/heavy-shield-generator");
  assert.equal(coverageOf(named("Heavy physical shield")).model, "sw5e-armour/heavy-physical-shield");
  assert.equal(coverageOf(named("Combat suit")).bucket, "dedicated");
  assert.equal(armourWeight(named("Battle armor")), "heavy");
  assert.equal(armourWeight(named("Blaster rifle")), undefined);
});
test("weapons, kits, tools and prostheses are covered as they are modelled", () => {
  assert.equal(coverageOf(named("Blaster rifle")).bucket, "shared");
  assert.equal(coverageOf(named("Vibroblade")).model, "kenney-kitbash/vibro-blade");
  assert.deepEqual([coverageOf(named("Lightsaber")).bucket, coverageOf(named("Lightsaber")).model], ["dedicated", "sw5e-sabers/saber-straight"]);
  assert.equal(coverageOf(named("Mechanic's kit")).bucket, "shared");
  assert.equal(coverageOf(named("Tinker's implements")).model, "kenney-kitbash/tool-roll");
  assert.deepEqual([coverageOf(named("Medpac")).bucket, coverageOf(named("Arm prosthesis")).bucket, coverageOf(named("Torso prosthesis")).bucket], ["dedicated", "dedicated", "dedicated"]);
  assert.equal(coverageOf(named("Datapad")).model, "sw5e-hybrids/datapad");
  assert.equal(coverageOf(named("Torso prosthesis")).model, "sw5e-ordnance/torso-prosthesis");
});
test("every model a coverage names exists", () => {
  for (const it of items) {
    const c = coverageOf(it);
    if (c.model) assert.ok(fs.existsSync(`client/public/assets/${c.model}.glb`), `${it.name}: ${c.model}`);
  }
});

import { handOf, wantsOf, type Gear } from "../../client/src/components/Map/interiors/gear";
test("a character's weapon sets their pose and their model; a saber has its own", () => {
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
  const saber = wantsOf("saber", { weapons: [named("Lightsaber")], carried: [] });
  assert.deepEqual(saber.map((x) => [x.slot, x.model, x.look, x.blade]), [["weapon", "sw5e-sabers/saber-straight", "weapon", undefined]]);
  // A saber whose name wants another blade is a hilt and a blade shape, joined when they are loaded
  const axe = wantsOf("saber", { weapons: [named("Lightaxe")], carried: [] })[0];
  assert.equal(axe.model, "sw5e-sabers/saber-straight");
  assert.deepEqual(axe.blade, { model: "sw5e-blades/blade-axe", name: "blade-axe", scale: 1 });
  assert.equal(wantsOf("saber", { weapons: [named("Great-saber")], carried: [] })[0].blade?.scale, 1.4);
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
  assert.equal(wants.find((w) => w.slot === "shield")!.model, "sw5e-armour/medium-physical-shield");
  for (const w of wants) assert.ok(fs.existsSync(`client/public/assets/${w.model}.glb`), w.model);
});
test("worn gear with a model goes where the model says, on a free place, and the datapad in the hand is not worn", () => {
  const gear: Gear = { weapons: [], carried: [named("Holster"), named("Ammo Pouch"), named("Backpack"), named("Power belt"), named("Wristpad"), named("Datapad")].filter(Boolean) };
  const wants = wantsOf("", gear);
  const bySlot = Object.fromEntries(wants.map((w) => [w.slot, w.model]));
  assert.equal(bySlot.hipR, "sw5e-worn/holster");
  assert.equal(bySlot.hipL, "sw5e-worn/ammo-pouch");
  assert.equal(bySlot.back, "sw5e-worn/backpack");
  assert.equal(bySlot.belt, "sw5e-worn/power-belt");
  assert.ok(!wants.some((w) => w.model.endsWith("datapad")));
  // Two things for one hip: the second takes the other hip, a third has no place
  const crowded = wantsOf("", { weapons: [], carried: [named("Holster"), named("Holster"), named("Holster")] });
  assert.deepEqual(crowded.map((w) => w.slot).sort(), ["hipL", "hipR"]);
  for (const w of wants) assert.ok(fs.existsSync(`client/public/assets/${w.model}.glb`), w.model);
});
test("an NPC holds what their outfit's pose says and carries what their work suggests", () => {
  assert.equal(wantsOf("pistol", undefined)[0].model.startsWith("kenney-blaster/"), true);
  assert.equal(wantsOf("vibro", undefined)[0].model, "kenney-kitbash/vibro-blade");
  assert.deepEqual(wantsOf("", undefined, "medic").map((w) => w.model), ["kenney-kitbash/medpac"]);
  assert.deepEqual(wantsOf("tool", undefined, "mechanic").map((w) => w.slot), ["hipR"]);
  // Force users hold the saber model; the blade's colour is the figure's (models.tsx tints it by its wielder)
  assert.deepEqual(wantsOf("saber", undefined, "patron").map((w) => w.model), ["sw5e-sabers/saber-straight"]);
  assert.deepEqual(wantsOf("saber2", undefined, "inquisitor").map((w) => w.model), ["sw5e-sabers/saber-double"]);
  assert.deepEqual(wantsOf("", undefined, "patron"), []);
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

test("a weapon with a model says where the hand closes on it, and an enhanced weapon takes its base weapon's design", () => {
  const saber = wantsOf("saber", { weapons: [named("Lightsaber")], carried: [] })[0];
  assert.ok(saber.grip && Math.abs(saber.grip[2]) < 0.1, `grip ${saber.grip}`);
  // A Force user with no saber of their own item still holds one in their pose
  assert.equal(wantsOf("saber", { weapons: [], carried: [] })[0].model, "sw5e-sabers/saber-straight");
  assert.deepEqual(wantsOf("", { weapons: [], carried: [] }), []);
  // The index sends "Charric Rifle" to a sniper rifle, "Flashy" to a heavy pistol: the Blaster Kit's designs
  for (const [name, kind] of [["Charric Rifle", "rifle"], ["Flashy", "pistol"], ["Sparkles", "pistol"], ["Hewey", "sword"]] as const) {
    const w = wantsOf("rifle", { weapons: [{ name, equipmentCategory: "Enhanced" }], carried: [] })[0];
    assert.ok(w && /^kenney-/.test(w.model), `${name}: ${w?.model}`);
    void kind;
  }
  // A bo-rifle has its own model
  assert.equal(wantsOf("staff", { weapons: [{ name: "AB-75 Bo-Rifle", equipmentCategory: "Enhanced" }], carried: [] })[0].model, "sw5e-gear/bo-rifle");
});

test("a musician plays an instrument of the catalogue, the same one each time, and a band is not all one instrument", () => {
  const played = new Set<string>();
  for (const name of ["Figrin", "Doikk", "Tech", "Nalan", "Ickabel", "Tedn", "Lirin"]) {
    const w = wantsOf("play", undefined, "musician", name);
    assert.equal(w.length, 1);
    assert.equal(w[0].slot, "weapon");
    assert.ok(w[0].grip, "it has a grip socket");
    assert.deepEqual(w, wantsOf("play", undefined, "musician", name));
    assert.ok(fs.existsSync(`client/public/assets/${w[0].model}.glb`), w[0].model);
    played.add(w[0].model);
  }
  assert.ok(played.size >= 4, `${played.size} instruments among seven musicians`);
  assert.deepEqual(wantsOf("play", { weapons: [], carried: [] }, "musician", "x"), [], "the player is not a musician");
});
