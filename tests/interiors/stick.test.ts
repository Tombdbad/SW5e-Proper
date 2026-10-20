import test from "node:test";
import assert from "node:assert/strict";
import { DEAD, EXPO, paceOf, RUN_SPEED, shaped, STICK, WALK_FACTOR } from "../../client/src/components/Map/interiors/stick";

test("the stick is big enough for a thumb and its knob fits in it", () => {
  assert.ok(STICK.size >= 160);
  assert.ok(STICK.knob * 0.5 + STICK.travel <= STICK.size / 2 + 1e-9, "the knob stays inside the pad");
  assert.equal(STICK.radius, STICK.size / 2);
});

test("the response is dead in the middle, gentle near it, and full at the edge", () => {
  assert.equal(shaped(0), 0);
  assert.equal(shaped(DEAD * 0.9), 0);
  assert.ok(Math.abs(shaped(1) - 1) < 1e-9, "full deflection is full speed");
  let last = 0;
  for (let d = 0; d <= 1.0001; d += 0.05) {
    const v = shaped(d);
    assert.ok(v >= last - 1e-12, `non-decreasing at ${d}`);
    last = v;
  }
  // Half the stick is well under half the speed (that is what expo is for), but it moves
  assert.ok(shaped(0.5) > 0.05 && shaped(0.5) < 0.3, `half deflection is ${shaped(0.5)} of the speed`);
  // With no expo it is a straight line past the dead zone
  assert.ok(Math.abs(shaped(0.55, 0) - 0.5) < 1e-9);
  assert.ok(EXPO > 0 && EXPO < 1);
});

test("walking is thirty per cent slower than running, and running is the party's old speed", () => {
  assert.equal(RUN_SPEED, 7);
  assert.equal(paceOf(1, true), 1);
  assert.ok(Math.abs(paceOf(1, false) - 0.7) < 1e-9);
  assert.equal(WALK_FACTOR, 0.7);
  assert.ok(Math.abs(paceOf(0.5, false) - paceOf(0.5, true) * 0.7) < 1e-9);
  assert.equal(paceOf(0.05, true), 0);
});
