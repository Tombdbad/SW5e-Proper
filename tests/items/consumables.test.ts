// Enhanced consumables read as the plain item they are a grade of (2026-10-21; index.ts `enhancedConsumableUse`)
import test from "node:test";
import assert from "node:assert/strict";
import { enhancedConsumableUse, baseNameOf, gearUse, itemFactsOf } from "../../shared/logic/index";
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
