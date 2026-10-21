// Food and water by the day (2026-10-21; shared/logic gear.ts `passDays`): a settlement's lifestyle feeds the party and fills the
// canteens; in the wild a ration a day, or foraging, and the water carried; days beyond 3 + Constitution without food, and too little
// water, bring exhaustion that a rest cannot take off until the character has eaten and drunk.
import test from "node:test";
import assert from "node:assert/strict";
import { passDays, FORAGE_DC, type Supplies, type DayPlace } from "../../shared/logic/index";

const fresh: Supplies = { day: 1, hungry: 0, water: 0, lack: 0, lifestyle: "Modest" };
const wild = (o: Partial<DayPlace> = {}): DayPlace => ({ where: "wild", hot: false, capacity: 8, conMod: 0, survival: -10, forageDc: 99, ...o });
const never = () => 0;

test("a settlement's lifestyle covers food and water and fills the canteens", () => {
  const r = passDays(fresh, 4, { ...wild(), where: "settlement" }, 1000, [], never);
  assert.equal(r.cost, 30);
  assert.equal(r.exhaustion, 0);
  assert.equal(r.supplies.water, 8);
  assert.equal(r.supplies.day, 4);
  const poor = passDays(fresh, 2, { ...wild(), where: "settlement" }, 5, [], never);
  assert.equal(poor.cost, 0);
  assert.equal(poor.supplies.hungry, 1);
});

test("in the wild: a ration a day and a gallon of water; without, exhaustion", () => {
  const fed = passDays({ ...fresh, water: 16 }, 3, wild({ capacity: 16 }), 0, ["Field rations (one day's)", "Field rations (one day's)"], never);
  assert.deepEqual(fed.eaten.length, 2);
  assert.equal(fed.supplies.water, 0);
  assert.equal(fed.exhaustion, 0);
  // No water at all: a level the first day, two after (already exhausted)
  const dry = passDays(fresh, 3, wild(), 0, ["a", "b"], never);
  assert.equal(dry.exhaustion, 3);
  assert.equal(dry.supplies.lack, 3);
  // Days without food: 3 + Constitution modifier of grace, then a level a day
  const starving = passDays({ ...fresh, water: 1000 }, 7, wild({ capacity: 1000 }), 0, [], never);
  assert.equal(starving.supplies.hungry, 6);
  assert.equal(starving.exhaustion, 3);
  // Hot land: two gallons
  const hot = passDays({ ...fresh, water: 8 }, 2, wild({ hot: true }), 0, ["r"], () => 0.99);
  assert.equal(hot.supplies.water, 0);
});

test("foraging finds food and water by the land; aboard a ship the stores give water", () => {
  const forage = passDays(fresh, 2, wild({ survival: 5, forageDc: FORAGE_DC.forest }), 0, [], () => 0.5);
  assert.equal(forage.exhaustion, 0);
  assert.equal(FORAGE_DC.barren, 99);
  const ship = passDays(fresh, 2, { ...wild(), where: "ship", garden: true }, 0, [], never);
  assert.deepEqual([ship.exhaustion, ship.supplies.hungry], [0, 0]);
});
