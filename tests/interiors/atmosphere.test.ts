import test from "node:test";
import assert from "node:assert/strict";
import { moodOf, budgetOf, moteCount, flickerAt } from "../../client/src/components/Map/interiors/atmosphere";
import { WEALTH } from "../../client/src/components/Map/interiors/wealth";

const ROOMS: [string, string][] = [
  ["cantina", "Main bar"], ["cave", "Deep chamber"], ["ruin", "Inner sanctum"], ["garrison", "Detention block"], ["medcenter", "Ward"], ["spaceport", "Docking bay"],
  ["palace", "Audience chamber"], ["armsmith", "Sales floor"], ["garrison", "Barracks"], ["tenements", "Apartments"], ["engineering", "Reactor room"], ["somewhere new", "Room"],
];

test("every room has a mood that is in range", () => {
  for (const [b, r] of ROOMS) for (const w of WEALTH) {
    const m = moodOf(b, r, w, "temperate");
    assert.ok(m.ambient.intensity > 0.1 && m.ambient.intensity < 1, `${b}/${r} ambient ${m.ambient.intensity}`);
    assert.ok(m.spots.length >= 1 && m.spots.length <= 4, `${b}/${r} has ${m.spots.length} lights`);
    assert.ok(m.dust >= 0 && m.dust <= 1);
    for (const s of m.spots) {
      assert.ok(s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1, "a light stands in the room");
      assert.ok(s.h > 0.5 && s.h < 4);
      assert.ok(s.intensity > 0 && s.intensity <= 2.5 && s.distance >= 4 && s.distance <= 12);
      assert.match(s.color, /^#[0-9a-f]{6}$/i);
    }
  }
});
test("rooms are lit by what they are for", () => {
  assert.equal(moodOf("cave", "Deep chamber", "squalid").name, "cave");
  assert.ok(moodOf("cave", "Deep chamber", "squalid").fog);
  assert.ok(moodOf("medcenter", "Ward", "comfortable").ambient.intensity > moodOf("cave", "Deep chamber", "squalid").ambient.intensity * 2);
  assert.equal(moodOf("cantina", "Main bar", "modest").name, "tavern");
  assert.equal(moodOf("palace", "Audience chamber", "palatial").name, "palace");
  assert.ok(moodOf("palace", "Audience chamber", "palatial").shaft);
  assert.equal(moodOf("nothing", "nothing", "modest").name, "plain");
});
test("a lava cave burns, an ice cave glows cold", () => {
  assert.notEqual(moodOf("cave", "Den", "squalid", "volcanic").spots[0].color, moodOf("cave", "Den", "squalid", "ice").spots[0].color);
  assert.notEqual(moodOf("cave", "Den", "squalid", "volcanic").fog?.color, moodOf("cave", "Den", "squalid", "temperate").fog?.color);
});
test("the world tints the light that comes through a window", () => {
  assert.notEqual(moodOf("palace", "Audience chamber", "palatial", "desert").key.color, moodOf("palace", "Audience chamber", "palatial", "temperate").key.color);
});
test("a lite device draws fewer lights and motes", () => {
  const m = moodOf("cantina", "Main bar", "modest");
  assert.ok(budgetOf(m, "lite").spots.length <= 2);
  assert.ok(budgetOf(m, "full").spots.length <= 4);
  assert.ok(moteCount(m, 11, 9, "lite") <= moteCount(m, 11, 9, "full"));
  assert.ok(moteCount(m, 40, 40, "full") <= 160);
  assert.equal(moteCount(moodOf("medcenter", "Ward", "modest"), 3, 3, "full") >= 0, true);
});
test("flicker stays between dim and full, and steady lights never move", () => {
  const spot = { flicker: 0.4, x: 0.3, y: 0.6 };
  let lo = 2, hi = 0;
  for (let t = 0; t < 60; t += 0.05) { const v = flickerAt(spot, t); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert.ok(lo >= 1 - 0.4 / 2 - 1e-9 && hi <= 1 + 1e-9);
  assert.ok(hi - lo > 0.05, "it does flicker");
  assert.equal(flickerAt({ flicker: 0, x: 0.1, y: 0.1 }, 12.3), 1);
});
test("moods are deterministic", () => {
  assert.deepEqual(moodOf("cantina", "Main bar", "modest", "desert"), moodOf("cantina", "Main bar", "modest", "desert"));
});
