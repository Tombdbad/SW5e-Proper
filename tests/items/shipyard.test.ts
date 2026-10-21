// Ship upgrades (shared/logic/shipyard.ts and the ship sheet and fight in index.ts): the book's prices, times and checks, what a
// modification does to a ship, the crew actions in a fight, and who sells which parts where.
import test from "node:test";
import assert from "node:assert/strict";
import {
  SHIP_MODS, shipModNamed, shipModEffects, prerequisitesOf, modCost, modDays, installDC, tierUpgrade, canInstall, slotsOf, maxSuitesOf,
  equipmentCost, equipmentDays, partsStock, scrapSellsParts, yardGrade, crewModPlan, partOffer, enhancedShipPart, makeshiftLoss,
  shipSheet, shipCombatant, startShipFight, shipSpecial, shipFire, shipDamage, endShipTurn, shipSpeed, type PartsPlace,
} from "../../shared/logic/index";
import starshipEquipment from "../../shared/data/sw5e/starshipEquipment.json";
import enhancedItems from "../../shared/data/sw5e/enhancedItems.json";

const rows = starshipEquipment as any[];
const mod = (name: string) => {
  const m = shipModNamed(name);
  assert.ok(m, `no modification ${name}`);
  return m!;
};
const fixed = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const ship = (extra: Record<string, unknown> = {}) => ({ id: "s1", name: "Test Ship", size: "Small", role: "Interceptor", tier: 0, equipment: ["Deflection armor"], ...extra });

test("the book's worked examples: a hardpoint on a Small ship, a tier upgrade", () => {
  // "to purchase and install a Hardpoint in a Small ship, it costs 3,000 credits ... with a workforce of two, it takes six days"
  assert.equal(modCost(mod("Hardpoint"), "Small").installed, 3000);
  assert.equal(modCost(mod("Hardpoint"), "Huge").installed, 150000);
  assert.equal(modDays(mod("Hardpoint"), "Small", 2), 6);
  // A crew that provides the workforce pays the material cost, half
  assert.equal(modCost(mod("Hardpoint"), "Small").material, 1500);
  // A grade 2 modification costs twice the grade 0 one
  assert.equal(modCost(mod("Data Core, Mk II"), "Small").installed, 2 * 4000);
  // "to upgrade a Small size ship from Tier 0 to Tier 1, it costs 3,900 credits ... with a workforce of 3, would take 2.6 days"
  const up = tierUpgrade("Small", 1, 3);
  assert.equal(up.cost, 3900);
  assert.equal(up.own, 1950);
  assert.ok(Math.abs(up.days - 2.6) <= 0.25);
  // Storage Compartment's base cost is 500 cr; the Warhead Launcher costs as on a Large ship
  assert.equal(modCost(mod("Storage Compartment"), "Small").installed, 500);
  assert.equal(modCost(mod("Warhead Launcher"), "Tiny").installed, 3500 * 5 * 5);
  // Equipment: "Deflection Armor on a Small size ship ... To purchase and install it on a Huge ship ... (3,100 x 50) ... with a workforce
  // of 1, would take 6.2 days" (the book's example uses 3,100; the equipment data prices it at 3,450)
  const deflection = rows.find((r) => r.name === "Deflection armor");
  assert.equal(equipmentCost(deflection, "Small").installed, deflection.cost);
  assert.equal(equipmentCost(deflection, "Huge").installed, deflection.cost * 50);
  assert.equal(equipmentDays({ type: "Armor", cost: 3100 }, "Small", 1), 6);
  assert.equal(equipmentDays({ type: "Armor", cost: 3100 }, "Huge", 100), 3);
  // Weapons cost the same for any size
  const laser = rows.find((r) => r.type === "Weapon");
  assert.equal(equipmentCost(laser, "Huge").installed, laser.cost);
});

test("the installation DC follows the grade and the tier, harder over capacity", () => {
  assert.equal(installDC(0, 0, "Small"), 10);
  assert.equal(installDC(3, 3, "Small"), 16);
  assert.equal(installDC(5, 5, "Small"), 20);
  assert.equal(installDC(1, 0, "Small", 2), 17 + 4);
  assert.equal(installDC(1, 0, "Large", 2), 17 + 2);
});

test("prerequisites, the once-only categories, suites and exclusions are kept", () => {
  assert.deepEqual(prerequisitesOf(mod("Sublight Drive, Mk II")), { abilities: { strength: 11 }, mods: ["Sublight Drive, Mk I"] });
  assert.deepEqual(prerequisitesOf(mod("Turret Mounting")).mods, []);
  assert.deepEqual(prerequisitesOf(mod("Fire-Linked Variable Compensator")).mods, ["Fire-Linked Mounting"]);
  const scores = { strength: 12, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 };
  const base = { id: "s1", size: "Small", tier: 0, equipment: [] as string[], mods: [] as { name: string }[] };
  assert.match(canInstall(base, mod("Sublight Drive, Mk II"), scores), /Sublight Drive, Mk I first/);
  assert.equal(canInstall({ ...base, mods: [{ name: "Sublight Drive, Mk I" }] }, mod("Sublight Drive, Mk II"), scores), "");
  assert.match(canInstall({ ...base, mods: [{ name: "Sublight Drive, Mk I" }] }, mod("Sublight Drive, Mk II"), { ...scores, strength: 10 }), /strength 11/);
  assert.match(canInstall({ ...base, mods: [{ name: "Data Core, Mk I" }] }, mod("Data Core, Mk I"), scores), /taken once/);
  assert.match(canInstall({ ...base, mods: [{ name: "Co-pilot Seat" }] }, mod("Astromech Socket"), scores), /beside Co-Pilot Seat/i);
  assert.match(canInstall({ ...base, size: "Tiny" }, mod("Medbay"), scores), /Small or larger/);
  // A Small ship with a Constitution modifier of +1 takes no suite (-1 + 1); with +2, one
  assert.equal(maxSuitesOf("Small", 1), 0);
  assert.equal(maxSuitesOf("Small", 2), 1);
  assert.match(canInstall(base, mod("Medbay"), scores), /takes 0 suites/);
  assert.match(canInstall(base, mod("Pinpointing Addition, Mk I"), scores), /Choose the weapon/);
  assert.equal(canInstall(base, mod("Pinpointing Addition, Mk I"), scores, "Light laser cannon"), "");
  // An equipment room adds four slots
  assert.equal(slotsOf({ ...base, mods: [{ name: "Equipment Room" }] }).capacity, 24);
});

test("what a modification does is read from its text", () => {
  assert.equal(shipModEffects(mod("Thrusters, Mk I")).abilities.dexterity, 1);
  assert.equal(shipModEffects(mod("Thrusters, Mk V")).maxRaise.dexterity, 2);
  assert.equal(shipModEffects(mod("Thrusters, Makeshift")).makeshift, "dexterity");
  assert.equal(shipModEffects(mod("Plating, Deflection Mk I")).ac, 1);
  assert.equal(shipModEffects(mod("Plating, Reinforced Mk I")).dr, 7);
  assert.deepEqual(shipModEffects(mod("Ablative Plating Layer")).hullResist, ["energy"]);
  assert.deepEqual(shipModEffects(mod("Absorptive Shielding")).shieldResist, ["kinetic"]);
  assert.equal(shipModEffects(mod("Sublight Drive, Mk I")).speed, 50);
  assert.equal(shipModEffects(mod("Combat Thrusters, Mk I")).turning, -50);
  assert.equal(shipModEffects(mod("Adaptive Ailerons")).ac, 0, "only in atmosphere: not applied in space");
  assert.ok(shipModEffects(mod("Plating, Reinforced Mk III")).noCrit);
  assert.deepEqual(shipModEffects(mod("Resilient Thruster")).saves, ["dexterity"]);
  assert.equal(shipModEffects(mod("Extra Fuel Tank")).fuel, 0.5);
  assert.equal(shipModEffects(mod("Hyperdrive Slot")).hyperdrive, "Class 15");
  assert.equal(shipModEffects(mod("Expanded Payload")).weapon?.reload, 1.5);
  assert.ok(shipModEffects(mod("Turret Mounting")).weapon?.turret);
  assert.equal(shipModEffects(mod("Ionizing Rounds")).weapon?.onCrit, "ionized");
  assert.deepEqual(shipModEffects(mod("Damage Control System")).bonus, ["patch"]);
  assert.equal(shipModEffects(mod("Power Backup")).backup, "hull");
  assert.equal(shipModEffects(mod("Feedback Shield")).feedback?.Small, "1d6");
  const quarters = shipModEffects(mod("Quarters, Luxury")).rest;
  assert.equal(quarters?.hitDice, "all");
  assert.equal(quarters?.exhaustion, 2);
  assert.ok(shipModEffects(mod("Armory")).rest?.firstAttack);
  const launcher = shipModEffects(mod("Carbonite Launcher, Mk II")).special;
  assert.deepEqual([launcher?.save, launcher?.area, launcher?.radius, launcher?.range, launcher?.condition], ["dexterity", "point", 50, 900, "slowed"]);
  assert.equal(shipModEffects(mod("Electrical Dischargers")).special?.perTier, true);
  // Most of the modifications have something the game applies; the rest (comms, scanners, cargo) is shown
  const applied = SHIP_MODS.filter((m) => shipModEffects(m).applied.length).length;
  assert.ok(applied >= 130, `${applied} modifications applied`);
});

test("the ship sheet takes its modifications and enhanced parts", () => {
  const plain = shipSheet(ship(), rows, 2);
  const better = shipSheet(ship({ mods: [{ name: "Thrusters, Mk I" }, { name: "Plating, Deflection Mk I" }, { name: "Sublight Drive, Mk I" }, { name: "Ablative Plating Layer" }, { name: "Resilient Hull" }, { name: "Hardpoint" }], enhanced: { armor: { name: "Ship Armor (Fine)", bonus: 1 }, shield: { name: "Ship Shield (Improved)", bonus: 2 } } }), rows, 2);
  assert.equal(better.abilities.dexterity, plain.abilities.dexterity + 1);
  // Deflection armor caps the Dexterity that counts; the plating and the enhanced armor add on top
  assert.ok(better.ac >= plain.ac + 2);
  assert.equal(better.speed, plain.speed + 50);
  assert.deepEqual(better.hullResist, ["energy"]);
  assert.deepEqual(better.saveProficient, ["constitution"]);
  assert.equal(better.saveBonus, 2);
  assert.equal(better.maxWeapons, 5);
  // A makeshift system lowers another score, the same one each time for a ship
  const makeshift = shipSheet(ship({ mods: [{ name: "Reactor, Makeshift" }] }), rows, 2);
  const lost = makeshiftLoss("s1", "strength");
  assert.equal(makeshift.abilities.strength, plain.abilities.strength + 1);
  assert.equal(makeshift.abilities[lost], plain.abilities[lost] - 1);
  // Weapon systems go on the weapon they were fitted to
  const gun = plain.weapons[0];
  if (gun) {
    const ranged = shipSheet(ship({ mods: [{ name: "Pinpointing Addition, Mk I", weapon: gun.name }, { name: "Turret Mounting", weapon: gun.name }], enhanced: { weapons: { [gun.name]: { name: "Ship Weapon (Fine)", bonus: 1 } } } }), rows, 2).weapons[0];
    assert.equal(ranged.far, Math.round(gun.far * 1.5));
    assert.equal(ranged.arc, "turret");
    assert.equal(ranged.attackBonus, 1);
    assert.equal(ranged.damageBonus, 1);
  }
});

test("in a fight: resistances, the power backup, crew actions and conditions", () => {
  const sheet = shipSheet(ship({ mods: [{ name: "Ablative Plating Layer" }, { name: "Power Backup" }] }), rows, 2);
  const me = shipCombatant("p", "party", sheet, { x: 0, y: 0, facing: 0 });
  // Energy to the hull is halved; a blow that would leave 0 hull leaves 1, once
  const bare = { ...me, shield: 0 };
  assert.equal(shipDamage(bare, 10, "energy", { attack: false }).hull, 5);
  const saved = shipDamage({ ...bare, hull: 3 }, 6, "kinetic", { attack: false }).ship;
  assert.equal(saved.hull, 1);
  assert.equal(shipDamage({ ...saved, hull: 1 }, 6, "kinetic", { attack: false }).ship.hull, 0, "the backup is spent");

  // A crew action: an interdiction drive slows every foe within 300 feet on a failed Strength save
  const launcherShip = shipSheet(ship({ tier: 1, mods: [{ name: "Interdiction Drive" }] }), rows, 2);
  const foeSheet = shipSheet({ id: "f", name: "Foe", size: "Small", role: "Interceptor", tier: 0, equipment: [] }, rows, 2);
  const fight = startShipFight([shipCombatant("p", "party", launcherShip, { x: 0, y: 0, facing: 0 })], [shipCombatant("f", "foe", foeSheet, { x: 0, y: 0, facing: 4 })], fixed([0.99, 0.01]));
  const placed = { ...fight, ships: fight.ships.map((s) => (s.id === "p" ? { ...s, x: 5, y: 5, actions: 2 } : { ...s, x: 8, y: 5 })) };
  const index = launcherShip.specials!.findIndex((x) => x.name === "Interdiction Drive");
  // A natural 1 on the save: slowed
  const after = shipSpecial(placed, "p", index, "f", fixed([0]));
  const foe = after.ships.find((s) => s.id === "f")!;
  assert.ok((foe.conds ?? []).some((c) => c.name === "slowed"), after.log.slice(-2).join(" "));
  assert.ok(shipSpeed(foe) < foeSheet.speed);
  assert.equal(after.ships.find((s) => s.id === "p")!.specialUses?.["Interdiction Drive"], 1);
  // Its use a tier (tier 1): none left
  assert.match(shipSpecial(after, "p", index, "f", fixed([0])).log.at(-1)!, /no use left/);
  // The condition ends with the foe's next turn
  let f2 = { ...after, turn: after.ships.findIndex((s) => s.id === "f") };
  f2 = endShipTurn(f2, fixed([0.5]));
  assert.ok(!(f2.ships.find((s) => s.id === "f")!.conds ?? []).some((c) => c.name === "slowed"));
});

test("scrapyards sell low grades only where a port is, far from the Core; shipyards sell more in richer places", () => {
  const equipment = rows;
  const enhanced = (enhancedItems as any[]).filter((e) => /^Ship/.test(e.type)).map((e) => ({ ...e, value: 5000 }));
  const place = (p: Partial<PartsPlace>): PartsPlace => ({ seed: "t1", day: 3, kind: "salvage", region: "Outer Rim", settlementType: "city", law: 1, hasPort: true, factor: 1, ...p });
  assert.equal(scrapSellsParts(place({ hasPort: false })), false);
  assert.equal(scrapSellsParts(place({ region: "Core", law: 3 })), false);
  assert.equal(scrapSellsParts(place({ region: "Core", law: 0 })), true);
  assert.deepEqual(partsStock(place({ region: "Core", law: 3 }), "Small", equipment, enhanced), []);
  for (let day = 0; day < 12; day++) {
    const scrap = partsStock(place({ day }), "Small", equipment, enhanced);
    assert.ok(scrap.length > 0);
    assert.ok(scrap.every((l) => l.part.kind !== "mod" || (l.part.grade ?? 0) <= 1), "grade 0 and 1 at a scrapyard");
    assert.ok(scrap.every((l) => l.part.kind !== "enhanced" || /premium/i.test(l.part.rarity ?? "")), "premium at best");
    assert.ok(scrap.every((l) => l.installed === undefined), "a scrapyard does not install");
    for (const l of scrap.filter((x) => x.part.kind === "mod")) assert.equal(l.price, Math.round(modCost(mod(l.part.name), "Small").material * 0.6));
  }
  assert.equal(yardGrade({ region: "Core", settlementType: "city" }), 5);
  assert.equal(yardGrade({ region: "Outer Rim", settlementType: "town" }), 2);
  const core = partsStock(place({ kind: "yard", region: "Core" }), "Small", equipment, enhanced);
  const far = partsStock(place({ kind: "yard", region: "Wild Space", settlementType: "town" }), "Small", equipment, enhanced);
  assert.ok(core.some((l) => l.part.kind === "enhanced" && /advanced/i.test(l.part.rarity ?? "")));
  assert.ok(!far.some((l) => l.part.kind === "enhanced" && /prototype|advanced/i.test(l.part.rarity ?? "")));
  assert.ok(far.every((l) => l.part.kind !== "mod" || (l.part.grade ?? 0) <= 2));
  assert.ok(core.filter((l) => l.part.kind === "mod").every((l) => l.installed! > l.price && (l.days ?? 0) > 0));
  assert.equal(partOffer({ worth: 1000 }, "salvage"), 400);
  assert.equal(partOffer({ worth: 1000 }, "yard"), 500);
});

test("the party's own work needs the workforce, takes the book's time, twice away from a port", () => {
  const s = { id: "s1", size: "Small", tier: 0, equipment: [] as string[], mods: [] };
  const one = crewModPlan(s, mod("Hardpoint"), 1, true);
  assert.equal(one.enough, false);
  assert.match(one.reason, /workforce of 2/);
  const two = crewModPlan(s, mod("Hardpoint"), 2, true);
  assert.deepEqual([two.enough, two.days, two.dc], [true, 6, 10]);
  const wild = crewModPlan(s, mod("Hardpoint"), 2, false);
  assert.deepEqual([wild.days, wild.dc], [12, 15]);
  assert.deepEqual(enhancedShipPart({ name: "Ship Armor (Superior)", type: "ShipArmor", text: "Your ship has a +3 bonus to AC while this armor is installed." }), { name: "Ship Armor (Superior)", bonus: 3, slot: "armor" });
});

test("fitting a part: modifications go in, equipment replaces its kind or takes a hardpoint, the old part goes to the hold", async () => {
  const { fitShipPart } = await import("../../shared/logic/index");
  const base = { id: "s9", name: "Hauler", size: "Small", role: "Interceptor", tier: 0, status: "landed" as const, owner: "party", value: 1, equipment: ["Deflection armor", "Assault laser cannon"] };
  const armor = fitShipPart(base, { id: "p1", kind: "equipment", name: "Reinforced armor", size: "Small", type: "Armor", worth: 1850 }, rows);
  assert.deepEqual(armor.ship.equipment.sort(), ["Assault laser cannon", "Reinforced armor"]);
  assert.equal(armor.returned[0].name, "Deflection armor");
  assert.equal(armor.returned[0].worth, Math.round(3450 / 2));
  const drive = fitShipPart(base, { id: "p2", kind: "equipment", name: "Hyperdrive, class 2", size: "Small", type: "Hyperdrive", worth: 5000 }, rows);
  assert.equal(drive.ship.hyperdriveClass, "2");
  const slot = fitShipPart(base, { id: "p3", kind: "mod", name: "Hyperdrive Slot", size: "Small", grade: 0, type: "Operation", worth: 1750 }, rows);
  assert.equal(slot.ship.hyperdriveClass, "15");
  const full = { ...base, equipment: ["Deflection armor", "Assault laser cannon", "Assault laser cannon", "Assault laser cannon", "Assault laser cannon"] };
  assert.match(fitShipPart(full, { id: "p4", kind: "equipment", name: "Assault laser cannon", type: "Weapon", worth: 1 }, rows).error ?? "", /hardpoint/);
  const withMount = { ...full, mods: [{ name: "Hardpoint" }] };
  assert.equal(fitShipPart(withMount, { id: "p5", kind: "equipment", name: "Assault laser cannon", type: "Weapon", worth: 1 }, rows).error, undefined);
  const enh = fitShipPart(base, { id: "p6", kind: "enhanced", name: "Ship Weapon (Fine)", type: "ShipWeapon", bonus: 1, worth: 900 }, rows, "Assault laser cannon");
  assert.deepEqual(enh.ship.enhanced?.weapons?.["Assault laser cannon"], { name: "Ship Weapon (Fine)", bonus: 1 });
});

test("a wreck gives up a piece of its equipment one time in two, salvaged, the same each time", async () => {
  const { wreckParts } = await import("../../shared/logic/index");
  let some = 0;
  for (let i = 0; i < 40; i++) {
    const wreck = { id: `w${i}`, size: "Small", equipment: ["Deflection armor", "Assault laser cannon"] };
    const parts = wreckParts(wreck, rows);
    assert.deepEqual(parts, wreckParts(wreck, rows));
    if (parts.length) {
      some++;
      assert.ok(parts[0].salvaged && wreck.equipment.includes(parts[0].name));
    }
  }
  assert.ok(some > 8 && some < 32, `${some} of 40`);
});
