import test from "node:test";
import assert from "node:assert/strict";
import { colonnade } from "../../shared/logic";

test("a hall's pillars stand in two mirrored rows, three squares apart, off the walls", () => {
  for (const [w, h] of [[9, 12], [12, 9], [8, 11], [7, 7], [10, 6]] as const) {
    const spots = colonnade(w, h);
    assert.ok(spots.length >= 2, `${w}x${h} has a colonnade`);
    assert.equal(new Set(spots.map((p) => `${p.x},${p.y}`)).size, spots.length, "no square twice");
    for (const p of spots) assert.ok(p.x >= 1 && p.y >= 1 && p.x <= w - 2 && p.y <= h - 2, `${w}x${h}: ${p.x},${p.y} is off the walls`);
    // mirrored across the room's middle, both ways
    const has = (x: number, y: number) => spots.some((p) => p.x === x && p.y === y);
    for (const p of spots) assert.ok(has(w - 1 - p.x, p.y) || w < h, `${w}x${h}: ${p.x},${p.y} has no twin across`);
    const along = w >= h ? "x" : "y";
    const at = [...new Set(spots.map((p) => p[along]))].sort((a, b) => a - b);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 3 - 1 && at[i] - at[i - 1] <= 3 + 1, "about three squares apart");
  }
  assert.deepEqual(colonnade(3, 3), [], "a closet has none");
});
