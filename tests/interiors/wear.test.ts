import test from "node:test";
import assert from "node:assert/strict";
import { hullWear, speederWear } from "../../client/src/components/Map/interiors/wear";

test("a wreck is as worn and as damaged as can be", () => {
  assert.deepEqual(hullWear({ status: "wrecked", role: "freighter" }, false), { age: 2, damage: 2 });
  assert.equal(speederWear("Landspeeder", true).age, 2);
  assert.equal(speederWear("Landspeeder", true).damage, 2);
});
test("damage follows the hull score and a disabled ship", () => {
  assert.equal(hullWear({ status: "orbiting" }, false).damage, 0);
  assert.equal(hullWear({ status: "orbiting", hull: 12 }, false).damage, 1);
  assert.equal(hullWear({ status: "orbiting", hull: 0 }, false).damage, 2);
  assert.equal(hullWear({ status: "orbiting", disabled: true }, false).damage, 2);
});
test("the armed forces keep their ships clean, and a look is always the same", () => {
  for (const name of ["a", "bb", "Star Lance", "Vigil", "TIE-401"]) assert.ok(hullWear({ status: "landed", name, role: "fighter" }, true).age <= 1);
  assert.deepEqual(hullWear({ status: "landed", name: "Golden Promise", role: "freighter" }, false), hullWear({ status: "landed", name: "Golden Promise", role: "freighter" }, false));
  const ages = new Set(["a", "bb", "ccc", "dddd", "eeeee", "ffffff", "Rust Bucket", "Moon", "Ash", "Pike"].map((n) => speederWear(`Landspeeder ${n}`).age));
  assert.ok(ages.size > 1, "all speeders alike");
});
