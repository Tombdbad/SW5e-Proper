import test from "node:test";
import assert from "node:assert/strict";
import { stockLayout, holdsOf, armsFor, armourFor, namedArmourFor, POOLS } from "../../client/src/components/Map/interiors/stock";
import { ITEM_MODELS } from "../../client/src/components/Map/interiors/items";
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
  assert.equal(holdsOf("Droid parts shelf", "tech shop", "Sales floor"), "droidparts");
  assert.equal(holdsOf("Display shelf", "tech shop", "Sales floor"), "kits");
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
        // An armour stand holds a named suit of the item catalogue or one of the kit's
        assert.ok(it.item ? ITEM_MODELS[it.item] : it.model && known.has(it.model), `${holds}: ${it.model ?? it.item}`);
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

test("the new shelves are where a shop of that kind would have them", () => {
  assert.equal(holdsOf("Goods shelf", "general store", "Sales floor"), "goods");
  assert.equal(holdsOf("Instrument rack", "curio shop", "Sales floor"), "instruments");
  assert.equal(holdsOf("Herb rack", "apothecary", "Sales floor"), "vials");
  assert.equal(holdsOf("Clothing rack", "outfitter", "Sales floor"), "clothing");
  assert.equal(holdsOf("Bar counter", "cantina", "Main bar"), "bar");
  assert.equal(holdsOf("Display table", "tech shop", "Sales floor"), "devices");
  assert.equal(holdsOf("Holo display", "tech shop", "Sales floor"), null);
  assert.equal(holdsOf("Bar counter", "garrison", "Barracks"), null);
  assert.equal(holdsOf("Clothing rack", "tenements", "Apartments"), null);
});
test("every pool names models of the catalogue, and the stock lies on the furniture it is for, the same each time", () => {
  for (const [name, pool] of Object.entries(POOLS)) {
    assert.ok(pool.length >= 8, `${name} has ${pool.length}`);
    for (const m of pool) assert.ok(ITEM_MODELS[m], `${name}: ${m} is not in the catalogue`);
  }
  for (const where of ["armsmith", "garrison", "palace", "outfitter", "general store", "spaceport", "cave"]) for (const m of namedArmourFor(where, "x")) assert.ok(ITEM_MODELS[m], `${where}: ${m}`);
  for (const [holds, L, b, r] of [["goods", 3, "general store", "Sales floor"], ["instruments", 3, "curio shop", "Sales floor"], ["vials", 2, "apothecary", "Sales floor"], ["clothing", 2, "outfitter", "Sales floor"],
    ["bar", 5, "cantina", "Main bar"], ["devices", 2, "tech shop", "Sales floor"], ["droidparts", 3, "tech shop", "Sales floor"]] as const) {
    for (const seed of [0, 1, 2]) {
      const items = stockLayout(holds, L, 1, b, r, seed);
      assert.ok(items.length >= 2, `${holds} seed ${seed}: ${items.length} items`);
      assert.deepEqual(items, stockLayout(holds, L, 1, b, r, seed));
      for (const it of items) {
        assert.ok(it.item && ITEM_MODELS[it.item], `${holds}: ${it.item}`);
        assert.ok(Math.abs(it.x) <= L / 2 + 0.01, `${holds}: ${it.item} at ${it.x} on ${L}`);
        assert.ok(it.y >= 0 && it.y <= 1.5, `${holds}: ${it.item} at height ${it.y}`);
      }
    }
  }
});
test("things on a shelf do not overlap along it, and an armour stand holds a named suit or a kit one", () => {
  for (const [holds, b] of [["goods", "general store"], ["instruments", "curio shop"], ["droidparts", "tech shop"]] as const) for (const seed of [0, 1, 2, 3]) {
    const items = stockLayout(holds, 3, 1, b, "Sales floor", seed);
    for (const y of new Set(items.map((i) => i.y))) {
      const row = items.filter((i) => i.y === y).sort((p, q) => p.x - q.x);
      for (let i = 1; i < row.length; i++) {
        const half = (m: string, turn: number) => { const bx = ITEM_MODELS[m].box; return (Math.abs(Math.cos(turn)) > 0.7 ? bx[3] - bx[0] : bx[5] - bx[2]) / 2; };
        const gap = row[i].x - row[i - 1].x - half(row[i].item!, row[i].turn) - half(row[i - 1].item!, row[i - 1].turn);
        assert.ok(gap > -0.06, `${holds} seed ${seed}: ${row[i - 1].item} and ${row[i].item} overlap by ${(-gap).toFixed(2)}`);
      }
    }
  }
  const kinds = new Set<string>();
  for (let seed = 0; seed < 30; seed++) {
    const [one] = stockLayout("armour", 1, 1, "garrison", "Armory", seed);
    kinds.add(one.item ? "named" : "kit");
    assert.ok(one.item ? ITEM_MODELS[one.item] : one.model);
  }
  assert.deepEqual([...kinds].sort(), ["kit", "named"]);
});

test("bins, racks, curio shelves, plinths and part stands hold what a place of that kind keeps (2026-10-21)", () => {
  assert.equal(holdsOf("Produce bin", "general store", "Sales floor"), "produce");
  assert.equal(holdsOf("Parts bin", "workshop", "Workfloor"), "parts");
  assert.equal(holdsOf("Parts bin", "tech shop", "Sales floor"), "parts");
  assert.equal(holdsOf("Parts bin", "droid dealer", "Repair bay"), "droidparts");
  assert.equal(holdsOf("Tool rack", "workshop", "Workfloor"), "toolrack");
  assert.equal(holdsOf("Curio shelf", "curio shop", "Sales floor"), "curios");
  assert.equal(holdsOf("Curio shelf", "pawnshop", "Sales floor"), "curios");
  assert.equal(holdsOf("Statuette plinth", "curio shop", "Sales floor"), "relic");
  assert.equal(holdsOf("Starship part", "shipyard", "Upgrade showroom"), "shipparts");
  assert.equal(holdsOf("Parts bin", "tenements", "Apartments"), null);
  assert.equal(holdsOf("Produce bin", "garrison", "Barracks"), null);
  assert.equal(holdsOf("Tool rack", "cantina", "Main bar"), null);
  for (const [holds, L, D, b, r, name] of [["produce", 1, 1, "general store", "Sales floor", "Produce bin"], ["parts", 1, 1, "workshop", "Workfloor", "Parts bin"], ["toolrack", 2, 1, "workshop", "Workfloor", "Tool rack"],
    ["curios", 2, 1, "curio shop", "Sales floor", "Curio shelf"], ["relic", 1, 1, "curio shop", "Sales floor", "Statuette plinth"], ["shipparts", 2, 1, "shipyard", "Upgrade showroom", "Starship part"]] as const) {
    for (const seed of [0, 1, 2, 3]) {
      const items = stockLayout(holds, L, D, b, r, seed, name);
      assert.ok(items.length >= 1, `${holds} seed ${seed} is empty`);
      assert.deepEqual(items, stockLayout(holds, L, D, b, r, seed, name));
      for (const it of items) {
        assert.ok(it.item && ITEM_MODELS[it.item], `${holds}: ${it.item}`);
        assert.ok(Math.abs(it.x) <= L / 2 + 0.01, `${holds}: ${it.item} at ${it.x} on ${L}`);
        assert.ok(it.y >= 0 && it.y <= 1.5, `${holds}: ${it.item} at height ${it.y}`);
      }
    }
  }
  // A plinth holds the one relic; a tool rack hangs tools at the back
  assert.equal(stockLayout("relic", 1, 1, "curio shop", "Sales floor", 1).length, 1);
  assert.ok(stockLayout("toolrack", 2, 1, "workshop", "Workfloor", 1).every((i) => i.z < 0));
  // What a dealer really has (the wares given) is what a bin shows
  const wares = ["droid-astromech-plating", "mod-scope"].filter((m) => ITEM_MODELS[m]);
  assert.ok(stockLayout("parts", 1, 1, "workshop", "Workfloor", 1, "Parts bin", wares).every((i) => wares.includes(i.item!)));
});
