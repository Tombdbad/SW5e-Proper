import test from "node:test";
import assert from "node:assert/strict";
import { stockLayout, holdsOf, armsFor, armourFor } from "../../client/src/components/Map/interiors/stock";
import { hungWeapon, LENGTH } from "../../client/src/components/Map/interiors/weapons";
import { weaponsOf } from "../helpers";
import { KIT_MODELS } from "../../client/src/components/Map/interiors/kitbash";

test("what holds weapons depends on the shop and the room", () => {
  assert.equal(holdsOf("Weapon rack", "garrison", "Armory"), "rack");
  assert.equal(holdsOf("Display shelf", "armsmith", "Sales floor"), "shelf");
  assert.equal(holdsOf("Display shelf", "curio shop", "Sales floor"), null);
  assert.equal(holdsOf("Display table", "armsmith", "Sales floor"), "case");
  assert.equal(holdsOf("Shelving", "garrison", "Armory"), "crates");
  assert.equal(holdsOf("Shelving", "tenements", "Apartments"), null);
  assert.equal(holdsOf("Bed", "garrison", "Barracks"), null);
});
test("armour, kits, medicine and prostheses stand where a shop of that kind would show them", () => {
  assert.equal(holdsOf("Armor stand", "armsmith", "Sales floor"), "armour");
  assert.equal(holdsOf("Armor stand", "outfitter", "Sales floor"), "armour");
  assert.equal(holdsOf("Droid parts shelf", "tech shop", "Sales floor"), "kits");
  assert.equal(holdsOf("Display case", "tech shop", "Sales floor"), "prosthetics");
  assert.equal(holdsOf("Display case", "armsmith", "Sales floor"), "case");
  assert.equal(holdsOf("Medical cabinet", "apothecary", "Sales floor"), "medical");
  assert.equal(holdsOf("Supply cabinet", "medcenter", "Ward"), "medical");
  assert.equal(holdsOf("Instrument cart", "medcenter", "Ward"), null);
  assert.equal(holdsOf("Workbench", "workshop", "Workfloor"), "tools");
  assert.equal(holdsOf("Workbench", "tenements", "Apartments"), null);
});
test("each stocks with models that exist in kitbash and fit the piece, the same each time", () => {
  const known = new Set(Object.keys(KIT_MODELS));
  for (const [holds, L, b, r] of [["armour", 1, "armsmith", "Sales floor"], ["kits", 3, "tech shop", "Sales floor"], ["medical", 2, "apothecary", "Sales floor"], ["prosthetics", 2, "tech shop", "Sales floor"], ["tools", 3, "workshop", "Workfloor"]] as const) {
    for (const seed of [0, 1, 2, 3]) {
      const items = stockLayout(holds, L, 1, b, r, seed);
      assert.ok(items.length >= 1, `${holds} seed ${seed} is empty`);
      assert.deepEqual(items, stockLayout(holds, L, 1, b, r, seed));
      for (const it of items) {
        assert.ok(it.model && known.has(it.model), `${holds}: ${it.model}`);
        assert.ok(Math.abs(it.x) <= L / 2 + 0.01, `${holds}: ${it.model} at ${it.x} on ${L}`);
      }
    }
  }
  assert.ok(stockLayout("kits", 3, 1, "tech shop", "Sales floor", 1).length >= 6, "a shelf is well stocked");
  assert.ok(armourFor("palace", "Guard post").includes("armour-heavy"));
  assert.ok(armourFor("outfitter", "Sales floor").includes("armour-light"));
});
test("the stock is what the place would keep, and every name is in the rules data", () => {
  const known = new Set(weaponsOf().map((w) => w.name.toLowerCase()));
  for (const [b, r] of [["armsmith", "Sales floor"], ["garrison", "Armory"], ["palace", "Guard post"], ["hideout", "Common room"], ["workshop", "Workfloor"], ["cave", "Den"]]) {
    for (const name of armsFor(b, r)) assert.ok(known.has(name.toLowerCase()), `${name} (${b}/${r}) is not a weapon`);
  }
  assert.ok(armsFor("palace", "Guard post").some((n) => /pike/i.test(n)));
  assert.ok(armsFor("garrison", "Armory").every((n) => /blaster|vibro/i.test(n)));
});
test("a rack is full, within its panel, and the same each time", () => {
  const rack = stockLayout("rack", 2, 1, "garrison", "Armory", 3);
  assert.ok(rack.length >= 6 && rack.length <= 24, `${rack.length} weapons on a 2-square rack`);
  assert.deepEqual(rack, stockLayout("rack", 2, 1, "garrison", "Armory", 3));
  assert.notDeepEqual(rack, stockLayout("rack", 2, 1, "garrison", "Armory", 4));
  for (const it of rack) {
    assert.ok(Math.abs(it.x) <= 1 - 0.2, `x ${it.x}`);
    assert.ok(it.y >= 0.3 && it.y <= 1.2, `y ${it.y}`);
    assert.ok(it.z < 0, "hung at the back");
  }
});
test("weapons on a tier of the rack do not overlap", () => {
  for (const seed of [0, 1, 2, 3, 4, 5]) {
    const rack = stockLayout("rack", 3, 1, "armsmith", "Sales floor", seed).filter((i) => i.weapon && !i.tilt);
    for (const tier of [...new Set(rack.map((i) => i.y))]) {
      const row = rack.filter((i) => i.y === tier).sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        const [a, b] = [row[i - 1], row[i]];
        const [la, lb] = [LENGTH[hungWeapon(a.weapon!).kind], LENGTH[hungWeapon(b.weapon!).kind]];
        assert.ok(b.x - a.x >= (la + lb) / 2 - 0.001, `seed ${seed} tier ${tier}: ${a.weapon} and ${b.weapon} are ${(b.x - a.x).toFixed(2)} apart`);
      }
    }
  }
});
test("pikes and staves hang upright, never in the tiers", () => {
  const rack = stockLayout("rack", 3, 1, "palace", "Guard post", 1);
  const upright = rack.filter((i) => i.tilt);
  assert.ok(upright.length >= 1);
  for (const it of upright) assert.ok(/pike/i.test(it.weapon!));
});
test("shelves, cases and crates hold what they should", () => {
  const shelf = stockLayout("shelf", 2, 1, "armsmith", "Sales floor", 2);
  assert.ok(shelf.length >= 5 && shelf.some((i) => i.weapon) && shelf.some((i) => i.prop));
  const tops = new Set(shelf.map((i) => Math.round(i.y * 10)));
  assert.ok(tops.size >= 3, "on several shelves");
  const glass = stockLayout("case", 2, 1, "armsmith", "Sales floor", 1);
  assert.ok(glass.length >= 2 && glass.every((i) => i.weapon && i.y > 0.7));
  const crates = stockLayout("crates", 2, 1, "garrison", "Armory", 1);
  assert.ok(crates.length >= 2 && crates.every((i) => /^crate-/.test(i.prop!)));
  assert.deepEqual(stockLayout(null, 2, 1, "x", "y", 1), []);
});
