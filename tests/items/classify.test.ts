// Every piece of equipment has a use the game applies (2026-10-21): weapons and armour in the fight, everything else through `gearUse`,
// read from its text (gear.ts). The audit (tools/item-audit.ts) counts the same thing; this test fails on any row left without one.
import test from "node:test";
import assert from "node:assert/strict";
import {
  gearUse, ammoFamilyOf, ammoRider, accessoryOf, containerOf, suitOf, airOf, liquidOf, lightOf, generatorOf, calibratorOf,
  foodRule, breathRule, carryRule, lifestyleCost, reloadOf, burstOf, rapidOf, type GearUse,
} from "../../shared/logic/index";
import equipment from "../../shared/data/sw5e/equipment.json";

const rows = equipment as any[];
const row = (name: string) => {
  const r = rows.find((x) => x.name === name);
  assert.ok(r, `no ${name}`);
  return r;
};
const use = (name: string) => gearUse({ name, equipmentCategory: row(name).equipmentCategory, description: row(name).description }) as GearUse & Record<string, any>;

test("every item of the equipment data has a use", () => {
  const missing = rows.filter((e) => !["Weapon", "Armor"].includes(e.equipmentCategory) && !gearUse({ name: e.name, equipmentCategory: e.equipmentCategory, description: e.description })).map((e) => `${e.equipmentCategory}: ${e.name}`);
  assert.deepEqual(missing, []);
});

test("what feeds a weapon, and what a round adds", () => {
  assert.equal(ammoFamilyOf(row("Blaster pistol")), "cell");
  assert.equal(ammoFamilyOf(row("Slugthrower")), "cartridge");
  assert.equal(ammoFamilyOf(row("Compound bow")), "arrow");
  assert.equal(ammoFamilyOf(row("Bolt-thrower")), "bolt");
  assert.equal(ammoFamilyOf(row("Wrist launcher")), "wrist");
  assert.equal(ammoFamilyOf(row("Rocket launcher")), "rocket");
  assert.equal(ammoFamilyOf(row("Vibroblade")), undefined);
  assert.equal(reloadOf(row("Blaster pistol")), 16);
  assert.equal(burstOf(row("Bowcaster")), 4);
  assert.ok(rapidOf(row("Blaster cannon")) >= 0);
  assert.deepEqual([use("Power cell").kind, use("Power cell").family], ["ammo", "cell"]);
  assert.equal(use("Arrow, Combustive").family, "arrow");
  const combustive = ammoRider(row("Arrow, Combustive"));
  assert.deepEqual([combustive.burst?.radius, combustive.burst?.dice, combustive.burst?.type, combustive.burst?.dc], [5, "1d8", "fire", 14]);
  const shock = ammoRider(row("Arrow, Electroshock"));
  assert.deepEqual([shock.save, shock.dice, shock.type, shock.condition, shock.half], ["dexterity", "1d3", "ion", "stunned", true]);
  const cryo = ammoRider(row("Cryo cell"));
  assert.deepEqual([cryo.becomes, cryo.save, cryo.dice, cryo.condition, cryo.finish?.what], ["cold", "constitution", "1d4", "slowed", "frozen"]);
  const panic = ammoRider(row("Bolt, Panic"));
  assert.deepEqual([panic.base?.dice, panic.save, panic.condition, panic.rounds, panic.repeat], ["2d6", "wisdom", "frightened", 10, true]);
  const missile = ammoRider(row("Missile, fragmentation"));
  assert.deepEqual([missile.base?.dice, missile.burst?.radius, missile.burst?.dice, missile.burst?.hitOrMiss], ["1d6", 5, "1d10", true]);
  const flechette = ammoRider(row("Flechette clip, ion"));
  assert.deepEqual([flechette.area?.shape, flechette.area?.length, flechette.area?.dice, flechette.area?.type], ["line", 15, "1d6", "ion"]);
  const canister = ammoRider(row("Projector canister, incendiary"));
  assert.equal(canister.area?.type, "fire");
  const incendiary = ammoRider(row("Incendiary cell"));
  assert.deepEqual([incendiary.becomes, incendiary.fire?.radius, incendiary.fire?.dice], ["fire", 5, "1d8"]);
  assert.equal(ammoRider(row("Corrosive cartridge")).finish?.what, "disintegrated");
  assert.equal(ammoRider(row("Snare")).restrains?.dc, 13);
  const cal = calibratorOf(row("Electrifying calibrator"));
  assert.deepEqual([cal?.weapon, cal?.damage, cal?.property], ["vibroweapon", 1, "shocking 13"]);
  assert.equal(use("Flux collimator").kind, "calibrator");
});

test("accessories: reloading, drawing, flight, swimming, descent, gloves, stealth, carrying, bracing, detonating, climbing", () => {
  assert.deepEqual(accessoryOf(row("Ammo Pouch")).reload?.families.sort(), ["cartridge", "cell"]);
  assert.ok(accessoryOf(row("Power belt")).reload?.families.includes("cell"));
  assert.ok(accessoryOf(row("Quiver")).reload?.families.includes("arrow"));
  assert.equal(accessoryOf(row("Holster")).draw, "holster");
  const jet = accessoryOf(row("Jetpack"));
  assert.deepEqual([jet.fly, jet.minutes, jet.perCell, jet.maxMinutes], [30, 1, true, 10]);
  assert.deepEqual([accessoryOf(row("Rocket boots")).fly, accessoryOf(row("Rocket boots")).minutes], [25, 1]);
  assert.equal(accessoryOf(row("Propulsion pack")).swim, 30);
  assert.equal(accessoryOf(row("Repulsor pack")).descent, 60);
  assert.deepEqual(accessoryOf(row("Shock gloves")).unarmed, { dice: "1d4", type: "lightning" });
  assert.ok(accessoryOf(row("Stealth field generator")).stealth);
  assert.deepEqual(accessoryOf(row("Tracker utility vest")).carryFree, { items: 10, each: 1 });
  assert.deepEqual(accessoryOf(row("Bipod")).brace, { prone: true, minutes: 0 });
  assert.deepEqual(accessoryOf(row("Tripod")).brace, { prone: false, minutes: 1 });
  assert.deepEqual(accessoryOf(row("Remote detonator")).detonator, { mines: 2, pair: 10, range: 30 });
  assert.deepEqual(accessoryOf(row("Rocketpack")).launcher, { normal: 100, long: 400, reload: 1 });
  assert.ok(accessoryOf(row("Friction-grip gear")).climb);
});

test("containers, suits, air, food, light and generators", () => {
  assert.equal(containerOf(row("Backpack"))?.lb, 30);
  assert.equal(containerOf(row("Chest"))?.lb, 300);
  assert.deepEqual([containerOf(row("Smugglepack"))?.lb, containerOf(row("Smugglepack"))?.hidden, containerOf(row("Smugglepack"))?.hiddenDc], [15, 5, 15]);
  assert.deepEqual([containerOf(row("Camtono"))?.lb, containerOf(row("Camtono"))?.lock], [5, 15]);
  assert.deepEqual([containerOf(row("Hovercart"))?.lb, containerOf(row("Hovercart"))?.speed], [2000, 30]);
  assert.equal(liquidOf(row("Canteen")), 4);
  assert.equal(liquidOf(row("Bottle")), 1.5);
  assert.equal(liquidOf(row("Jug")), 8);
  assert.deepEqual(use("Clothes, clandestine").pockets, { lb: 2, dc: 15 });
  const space = suitOf(row("Space suit"))!;
  assert.deepEqual([space.resist, space.protects.includes("vacuum"), space.air, space.speed], [["necrotic"], true, 8, -15]);
  const hazard = suitOf(row("Hazard suit"))!;
  assert.deepEqual([hazard.resist, hazard.immune, hazard.protects.includes("toxic")], [["poison"], ["poisoned"], true]);
  assert.ok(suitOf(row("Diving suit"))!.protects.includes("pressure"));
  assert.ok(suitOf(row("Water suit"))!.protects.includes("underwater"));
  assert.ok(suitOf(row("Stabilizer suit"))!.advantage.includes("being moved"));
  assert.deepEqual(airOf(row("Respirator")), { hours: 1 });
  assert.deepEqual(airOf(row("Oyxgen tank")), { hours: 8, refill: true });
  assert.deepEqual(airOf(row("Underwater respirator")), { hours: 1, underwater: true, perCell: true });
  assert.deepEqual(use("Field rations (one day's)"), { kind: "food", days: 1 });
  assert.deepEqual(use("Emergency rations (one day's)"), { kind: "food", days: 1 });
  assert.deepEqual(lightOf(row("Glowrod")), { bright: 20, dim: 20, hours: 10 });
  assert.deepEqual(generatorOf(row("Heat generator")), { answers: "cold", minutes: 10 });
  assert.deepEqual(generatorOf(row("Gravity generator")), { answers: "gravity", minutes: 10 });
  assert.equal(use("Personal translator").languages, 5);
  assert.equal(use("Vocoder mask").languages, 15);
  assert.equal(use("Leg prosthesis").part, "leg");
});

test("the rules the gear answers to are read from the Player's Handbook", () => {
  assert.deepEqual(foodRule(), { graceBase: 3, gallons: 1, hotGallons: 2, halfSaveDc: 15 });
  assert.deepEqual(breathRule(2), { minutes: 3, rounds: 2 });
  assert.deepEqual(breathRule(-1), { minutes: 0.5, rounds: 1 });
  assert.deepEqual(carryRule(), { capacity: 15, encumbered: 5, heavily: 10, encumberedSpeed: 10, heavilySpeed: 20 });
  assert.equal(lifestyleCost("Modest"), 10);
  assert.equal(lifestyleCost("Wealthy"), 40);
});
