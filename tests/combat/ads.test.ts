// Aiming down the sights (2026-11-15): the house-rule numbers hold together, and the look is turned down by the zoom held
import test from "node:test";
import assert from "node:assert/strict";
import { SHOOT, opticOf, scopeSizeOf } from "../../shared/logic/shooter";
import { ADS } from "../../client/src/components/Map/interiors/shoot";

test("the sights: iron sights zoom less than any scope, and a scope sights tighter than the irons", () => {
  assert.ok(SHOOT.ads.iron > 1 && SHOOT.ads.iron < 2);
  assert.ok(SHOOT.ads.scoped < 1 && SHOOT.ads.spread < 1);
  for (const z of [2, 3, 4, 6]) assert.equal(scopeSizeOf(z), z);
});

test("a sniper rifle brings a scope of its own, a pistol none", () => {
  assert.equal(opticOf([], { name: "Sniper rifle", range: 30 })?.zoom, 4);
  assert.equal(opticOf([], { name: "Blaster pistol", range: 6 }), undefined);
  assert.equal(opticOf(["Focusing scope"], { name: "Blaster rifle", range: 12 })?.zoom, 2);
});

test("the view starts unzoomed, so a look is not turned down outside a fight", () => {
  assert.equal(ADS.zoom, 1);
  assert.equal(ADS.k, 0);
});
