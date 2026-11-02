// The shooter mode has no dice outside a fight either (the user, 2026-11-02: a prompt to roll on landing from a jetpack "is WRONG")
import test from "node:test";
import assert from "node:assert/strict";
import { passiveD20, passiveDamage, passiveFace } from "../../shared/logic/shooter";
import { fallOutcome, fallPlan } from "../../shared/logic";
import { useDice } from "../../client/src/lib/stores/useDice";

test("a check is passive: 10, +5 with advantage, -5 with disadvantage; a die shows its middle face", () => {
  assert.equal(passiveD20(0), 10);
  assert.equal(passiveD20(1), 15);
  assert.equal(passiveD20(-1), 5);
  assert.deepEqual([4, 6, 8, 20, 100].map(passiveFace), [2, 3, 4, 10, 50]);
});

test("a fall's damage is the dice at their average, rounded down", () => {
  assert.equal(passiveDamage(3, 6), 10);
  assert.equal(passiveDamage(2, 8), 9);
  assert.equal(passiveDamage(3, 6, true), 5);
});

test("with no burst offered (the shooter), a fall asks for no check and the pack carried changes nothing", () => {
  const plan = fallPlan(40, 1, { burst: undefined });
  assert.equal(plan.burst, undefined);
  assert.equal(plan.jump, undefined);
  assert.equal(fallOutcome(plan).dice, 4);
  // (the tabletop still offers the burst)
  assert.ok(fallPlan(40, 1, { burst: "Jetpack" }).burst);
});

test("the dice table in the passive mode throws nothing and answers at once", async () => {
  useDice.getState().setPassive(true);
  try {
    assert.deepEqual(await useDice.getState().requestTable("A check", ["d20", "d20", "d6"]), [10, 10, 3]);
    assert.equal(useDice.getState().table, null);
  } finally {
    useDice.getState().setPassive(false);
  }
});
