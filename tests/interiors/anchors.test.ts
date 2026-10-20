import test from "node:test";
import assert from "node:assert/strict";
import { LEAN, WAIST, bodyAnchor, type WornSlot } from "../../client/src/components/Map/interiors/anchors";

const SLOTS: WornSlot[] = ["hipR", "hipL", "back", "belt", "shoulder"];
const human = { bulk: 1 };

test("a body's things sit on the right side, the right way round, and widen with the bulk", () => {
  const [r, l] = [bodyAnchor("hipR", human), bodyAnchor("hipL", human)];
  assert.ok(r.at[0] < 0 && l.at[0] > 0 && Math.abs(r.at[0] + l.at[0]) < 1e-9, "the hips are either side");
  assert.ok(bodyAnchor("hipR", { bulk: 1.4 }).at[0] < r.at[0], "a bulky body is wider across the hips");
  assert.ok(bodyAnchor("shoulder", { bulk: 1.4 }).at[0] < bodyAnchor("shoulder", human).at[0]);
  assert.ok(bodyAnchor("back", human).at[2] < 0 && bodyAnchor("belt", human).at[2] > 0, "a pack is behind, a buckle in front");
  assert.equal(bodyAnchor("back", human).rot[1], Math.PI, "a pack faces away from the body");
  assert.ok(bodyAnchor("belt", human).at[1] > WAIST && bodyAnchor("hipR", human).at[1] < WAIST);
});
test("a pack stands clear of wings, and a hunched torso carries what is on it forward", () => {
  assert.ok(bodyAnchor("back", { bulk: 1, wings: true }).at[2] < bodyAnchor("back", human).at[2] - 0.05);
  for (const slot of ["back", "belt", "shoulder"] as WornSlot[]) {
    const [straight, bent] = [bodyAnchor(slot, human), bodyAnchor(slot, { bulk: 1, hunched: true })];
    assert.ok(Math.abs(bent.rot[0] - straight.rot[0] - LEAN) < 1e-9, `${slot} leans with the torso`);
    assert.ok(bent.at[2] > straight.at[2], `${slot} moves forward`);
  }
  // Below the waist nothing leans
  for (const slot of ["hipR", "hipL"] as WornSlot[]) assert.deepEqual(bodyAnchor(slot, { bulk: 1, hunched: true }), bodyAnchor(slot, human));
  // The lean keeps the distance from the waist
  const [a, b] = [bodyAnchor("back", human), bodyAnchor("back", { bulk: 1, hunched: true })];
  assert.ok(Math.abs(Math.hypot(a.at[1] - WAIST, a.at[2]) - Math.hypot(b.at[1] - WAIST, b.at[2])) < 1e-9);
});
test("every slot is on the body: between the knee and above the head, not off to one side", () => {
  for (const slot of SLOTS) for (const traits of [human, { bulk: 0.7 }, { bulk: 1.5, hunched: true, wings: true }, { bulk: 1, longNeck: true }]) {
    const { at } = bodyAnchor(slot, traits);
    assert.ok(at[1] > 0.3 && at[1] < 1.2, `${slot} at height ${at[1]}`);
    assert.ok(Math.abs(at[0]) < 0.5 && Math.abs(at[2]) < 0.5, `${slot} at ${at}`);
  }
});
