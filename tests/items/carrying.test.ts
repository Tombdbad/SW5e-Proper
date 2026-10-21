// Weight and carrying (2026-10-21; gear.ts `loadOf`): capacity Strength x 15 (by size), the variant's encumbered levels, containers and
// what is carried loose, a utility vest's free items, what the others carry
import test from "node:test";
import assert from "node:assert/strict";
import { loadOf, weightOf, containerOf } from "../../shared/logic/index";
import equipment from "../../shared/data/sw5e/equipment.json";

const item = (name: string) => (equipment as any[]).find((e) => e.name === name);
const it = (name: string) => ({ name, weight: item(name).weight, containerLb: containerOf(item(name))?.lb });

test("the variant's levels and the capacity", () => {
  const strength = 10;
  const light = loadOf([{ name: "a", weight: 40 }, { name: "Backpack", weight: 5, containerLb: 30 }], { strength, variant: true });
  assert.deepEqual([light.capacity, light.level, light.speed], [150, 0, 0]);
  const enc = loadOf([{ name: "a", weight: 60 }, { name: "Backpack", weight: 5, containerLb: 300 }], { strength, variant: true });
  assert.deepEqual([enc.level, enc.speed, enc.disadvantage], [1, -10, false]);
  const heavy = loadOf([{ name: "a", weight: 110 }, { name: "Chest", weight: 25, containerLb: 300 }], { strength, variant: true });
  assert.deepEqual([heavy.level, heavy.speed, heavy.disadvantage], [2, -20, true]);
  const over = loadOf([{ name: "a", weight: 200 }], { strength, variant: true });
  assert.equal(over.level, 3);
  // Without the variant only the capacity counts (and the loose rule)
  assert.equal(loadOf([{ name: "a", weight: 110 }, { name: "Chest", weight: 25, containerLb: 300 }], { strength, variant: false }).level, 0);
  // A Large creature carries twice as much
  assert.equal(loadOf([], { strength, size: "Large", variant: true }).capacity, 300);
});

test("containers, loose gear, a vest and the party's carriers", () => {
  assert.equal(weightOf("0.5"), 0.5);
  assert.equal(weightOf("—"), 0);
  const loose = loadOf([{ name: "rifle", weight: 12 }, { name: "armor", weight: 15 }], { strength: 16, variant: true });
  assert.ok(loose.awkward && loose.level === 1, "27 lb with nothing to pack it in");
  const packed = loadOf([{ name: "rifle", weight: 12 }, { name: "armor", weight: 15 }, it("Backpack")], { strength: 16, variant: true });
  assert.ok(!packed.awkward && packed.level === 0);
  const vest = loadOf(Array.from({ length: 10 }, (_, i) => ({ name: `cell${i}`, weight: 1 })), { strength: 8, variant: true, freeItems: { items: 10, each: 1 } });
  assert.equal(vest.weight, 0);
  const cart = loadOf([{ name: "crates", weight: 400 }], { strength: 10, variant: true, others: 2000 });
  assert.ok(cart.weight <= 75 && cart.shared > 0);
});
