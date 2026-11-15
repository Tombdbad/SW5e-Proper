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

// The shooter's watchers (2026-11-15): no Stealth check, an awareness that fills (shooter.ts noticeRate, stepNotice)
import { NOTICE, noticeRate, stepNotice, type Sneaker } from "../../shared/logic/shooter";
const sneaker = (o: Partial<Sneaker> = {}): Sneaker => ({ x: 0, y: 0, speed: 1, posture: 0, air: false, stealth: 0, edge: 0, dark: false, ...o });

test("a watcher notices the party faster near, standing, running, in front, and the better its Perception is over the party's Stealth", () => {
  const w = { id: "w", x: 4, y: 0, perception: 10 };
  const walk = noticeRate(w, sneaker());
  assert.ok(walk > 0);
  assert.ok(noticeRate({ ...w, x: 12 }, sneaker()) < walk, "farther");
  assert.equal(noticeRate({ ...w, x: NOTICE.range + 1 }, sneaker()), 0, "out of range");
  assert.ok(noticeRate(w, sneaker({ posture: 1 })) < walk, "crouched");
  assert.ok(noticeRate(w, sneaker({ speed: 5 })) > walk, "running");
  assert.ok(noticeRate(w, sneaker({ dark: true })) < walk, "in the dark");
  assert.ok(noticeRate(w, sneaker({ edge: -1 })) > walk && noticeRate(w, sneaker({ edge: 1 })) < walk, "loud or silent armour");
  assert.ok(noticeRate(w, sneaker({ stealth: 5 })) < walk && noticeRate({ ...w, perception: 15 }, sneaker()) > walk, "the numbers");
  // (it faces away, at angle pi: the party at its back is seen less)
  assert.ok(noticeRate({ ...w, face: 0 }, sneaker()) < noticeRate({ ...w, face: -Math.PI / 2 }, sneaker()), "behind it");
});

test("awareness fills to 1 and stays, and empties out of range", () => {
  const w = { id: "w", x: 2, y: 0, perception: 12 };
  let levels: Record<string, number> = {};
  for (let i = 0; i < 100 && (levels.w ?? 0) < 1; i++) levels = stepNotice(levels, [w], sneaker(), 0.1);
  assert.equal(levels.w, 1);
  assert.equal(stepNotice(levels, [{ ...w, x: 40 }], sneaker(), 1).w, 1, "once seen, seen");
  const fading = stepNotice({ w: 0.5 }, [{ ...w, x: 40 }], sneaker(), 1).w;
  assert.ok(fading < 0.5);
  assert.deepEqual(stepNotice({ gone: 0.7 }, [], sneaker(), 0.1), {}, "those who left are dropped");
});
