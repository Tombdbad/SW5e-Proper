// Enhanced consumables read as the plain item they are a grade of (2026-10-21; index.ts `enhancedConsumableUse`)
import test from "node:test";
import assert from "node:assert/strict";
import { enhancedConsumableUse, baseNameOf, gearUse, itemFactsOf, readOutcome } from "../../shared/logic/index";
import enhanced from "../../shared/data/sw5e/enhancedItems.json";
import equipment from "../../shared/data/sw5e/equipment.json";

const rows = enhanced as any[];
const eq = equipment as any[];
const use = (name: string) => enhancedConsumableUse(rows.find((r) => r.name === name), eq) as any;

test("grades: a grenade's DC and dice, a medpac's dice, a round's bonus, a spice's die and hours, a vitapac's Hit Dice", () => {
  assert.equal(baseNameOf("Grenade, Fragmentation (Average)"), "Grenade, Fragmentation");
  assert.equal(baseNameOf("Repair Kit Mk II"), "Repair Kit");
  const g = use("Grenade, Fragmentation (Devastating)");
  assert.deepEqual([g.kind, g.form, g.dc, g.damage[0].dice], ["explosive", "grenade", 24, "12d10"]);
  assert.equal(use("Medpac (Superior)").dice, 4);
  assert.equal(use("Repair Kit Mk II").dice, 2);
  const c = use("Corrosive Cartridge (Deadly)");
  assert.deepEqual([c.kind, c.rider.bonus, c.rider.dc], ["ammo", 3, 20]);
  const sp = use("Glitterstim (Pure)");
  assert.deepEqual([sp.kind, sp.die, sp.highMinutes, sp.lowMinutes, sp.ability], ["substance", 12, 60, 480, "intelligence"]);
  assert.deepEqual(use("Vitapac (Fine)"), { kind: "vitapac", hitDice: 3 });
  assert.equal(use("Computer Spike (Fine)").advantage, true);
  // The plain spice keeps its d3 and ten minutes
  const plain = gearUse(eq.find((e) => e.name === "Andris")) as any;
  assert.equal(plain.die, 3);
});

test("every enhanced consumable has a use: read as its plain item, or a timed effect (stims, adrenals, barriers, collimators)", () => {
  const consumables = rows.filter((r) => r.type === "Consumable");
  const left = consumables.filter((r) => !enhancedConsumableUse(r, eq) && !itemFactsOf(r)?.timed).map((r) => r.name);
  assert.deepEqual(left, []);
});

test("graded plain gear reads as its plain item at the grade's numbers: binders, a camtono, clandestine clothes, a jetpack, rocket boots, a bolt, a chip, a datacron", () => {
  const gear = (name: string) => itemFactsOf(rows.find((r) => r.name === name), eq)!.use as any;
  assert.deepEqual([gear("Binders (Champion)").kind, gear("Binders (Champion)").dc], ["binders", 24]);
  assert.ok(gear("Binders (Fine)").dc < gear("Binders (Champion)").dc);
  const camtono = gear("Camtono (Fine)");
  assert.equal(camtono.kind, "container");
  assert.ok(camtono.lb >= 6);
  const clothes = gear("Clothes, Clandestine (Fine)");
  assert.deepEqual([clothes.kind, clothes.style, clothes.pockets.dc], ["clothing", "clandestine", 18]);
  assert.deepEqual([clothes.pockets.lb, gear("Clothes, Clandestine (Champion)").pockets.dc], [3, 30]);
  assert.equal(gear("Smugglepack (Fine)").kind, "container");
  assert.deepEqual([gear("Datacron Mk III").kind, gear("Datacron Mk III").form], ["data", "cron"]);
  assert.equal(gear("Jetpack (Fine)").kind, "accessory");
  assert.equal(gear("Rocket Boots (Fine)").kind, "accessory");
  assert.equal(gear("Remote Detonator (Fine)").kind, "accessory");
  assert.equal(gear("Restraining Bolt (Fine)").kind, "bolt");
  assert.deepEqual([gear("Credit Chip (Fine)").kind, gear("Credit Chip (Fine)").form, gear("Credit Chip (Fine)").dc], ["data", "chip", 18]);
  // Those with a text of their own and no plain item keep to the text
  assert.equal(itemFactsOf(rows.find((r) => r.name === "Boots of Bounding"), eq)!.use, undefined);
});

test("a blueprint is learned over an hour with an Intelligence check by the rarity it is of; a better one is harder", () => {
  const bp = (name: string) => itemFactsOf(rows.find((r) => r.name === name), eq)!.use as any;
  assert.deepEqual([bp("Blueprint (Standard)").kind, bp("Blueprint (Standard)").form, bp("Blueprint (Standard)").dc, bp("Blueprint (Standard)").rarity], ["data", "blueprint", 10, "Standard"]);
  assert.equal(bp("Blueprint (Advanced)").dc, 22);
  assert.equal(bp("Blueprint (Artifact)").dc, 30);
  assert.equal(readOutcome("blueprint", 1), "blueprint");
  assert.equal(readOutcome("blueprint", 99), "blueprint");
  // The other forms are as they were
  assert.equal(readOutcome("chip", 50), "credits");
  assert.equal(readOutcome("holocron", 90), "blueprint");
});
