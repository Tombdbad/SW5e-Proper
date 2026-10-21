// A search by the law (2026-10-21; house rules for when, the books' DCs for the hiding places): contraband carried openly is seized,
// what is hidden in a smugglepack's compartment or clandestine clothes' pockets only if the searcher's Investigation meets the DC;
// customs posts and checkpoints are where it happens.
import test from "node:test";
import assert from "node:assert/strict";
import { hidingPlaces, hidingRoom, lawSearch, searchedAt, isContraband, SEARCH_BONUS } from "../../shared/logic/index";
import equipment from "../../shared/data/sw5e/equipment.json";

const row = (name: string) => {
  const r = (equipment as any[]).find((e) => e.name === name);
  assert.ok(r, `no ${name}`);
  return r;
};

test("hiding places: a smugglepack carried, clandestine clothes only while worn", () => {
  const items = [row("Smugglepack"), row("Clothes, clandestine"), row("Backpack")];
  assert.deepEqual(hidingPlaces(items, []), [{ item: "Smugglepack", lb: 5, dc: 15 }]);
  assert.deepEqual(hidingPlaces(items, ["Clothes, clandestine"]), [{ item: "Smugglepack", lb: 5, dc: 15 }, { item: "Clothes, clandestine", lb: 2, dc: 15 }]);
  const places = hidingPlaces(items, ["Clothes, clandestine"]);
  assert.equal(hidingRoom(places, { "Thermal detonator": 2 }, () => 1), 5);
});

test("the search: open contraband is seized; hidden only when the Investigation meets the DC", () => {
  const law = 2;
  const spike = row("Security spike");
  assert.ok(isContraband(spike, law) && !isContraband(row("Backpack"), law));
  const carried = [{ name: "Security spike", contraband: true }, { name: "Security spike", contraband: true }, { name: "Backpack", contraband: false }];
  const places = [{ item: "Smugglepack", lb: 5, dc: 15 }];
  // Nothing hidden: both seized
  assert.deepEqual(lawSearch(carried, {}, places, law, 20).seized, ["Security spike", "Security spike"]);
  // One hidden, the searcher rolls low: the hidden one stays
  const low = lawSearch(carried, { "Security spike": 1 }, places, law, 5);
  assert.deepEqual([low.seized, low.found, low.total, low.dc], [["Security spike"], false, 5 + SEARCH_BONUS[2], 15]);
  // Rolls high: found and seized too
  const high = lawSearch(carried, { "Security spike": 1 }, places, law, 12);
  assert.deepEqual([high.seized.length, high.found], [2, true]);
  // Hidden with no hiding place left (the smugglepack sold): as good as open
  assert.equal(lawSearch(carried, { "Security spike": 1 }, [], law, 1).seized.length, 2);
  // Nothing contraband: nothing seized, found or not
  assert.deepEqual(lawSearch([{ name: "Backpack", contraband: false }], { Backpack: 1 }, places, 3, 20), { seized: [], found: false, roll: 20, total: 25, dc: 15 });
});

test("customs posts and checkpoints are searched, other rooms not", () => {
  assert.ok(searchedAt({ kind: "room", name: "Customs office" }));
  assert.ok(searchedAt({ kind: "room", name: "Customs lock" }));
  assert.ok(searchedAt({ kind: "room", name: "Customs and security checkpoint" }));
  assert.ok(searchedAt({ kind: "room", name: "Security checkpoint" }));
  assert.ok(!searchedAt({ kind: "room", name: "Customs bond store" }));
  assert.ok(!searchedAt({ kind: "building", name: "Checkpoint" }));
});
