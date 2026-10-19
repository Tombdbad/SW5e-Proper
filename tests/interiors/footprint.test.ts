import test from "node:test";
import assert from "node:assert/strict";
import { radiiOf, standing, insideFloor, waysStand } from "../../shared/logic/footprint";

const count = (g: boolean[][]) => g.flat().filter(Boolean).length;

test("a rectangle stands whole", () => {
  const g = standing(6, 4, radiiOf("rect", 6, 4));
  assert.equal(count(g), 24);
});
test("a round room loses its corners but keeps its ways in", () => {
  const g = standing(9, 9, radiiOf("round", 9, 9));
  assert.equal(g[0][0], false);
  assert.equal(g[8][8], false);
  assert.equal(g[4][4], true);
  assert.equal(g[4][0], true);
  assert.ok(count(g) > 81 * 0.7 && count(g) < 81 * 0.9, `${count(g)} of 81 squares stand`);
  assert.equal(waysStand(9, 9, radiiOf("round", 9, 9)), true);
});
test("every size of round and oval room keeps a way in on the middle of each side", () => {
  for (let w = 5; w <= 16; w++) for (let h = 5; h <= 16; h++) for (const shape of ["round", "oval"] as const) {
    assert.equal(waysStand(w, h, radiiOf(shape, w, h)), true, `${shape} ${w}x${h}`);
    const g = standing(w, h, radiiOf(shape, w, h));
    assert.ok(count(g) >= w * h * 0.6, `${shape} ${w}x${h} keeps most of its floor`);
  }
});
test("a stadium room is a rectangle with half circles at its ends", () => {
  const radii = radiiOf("round", 14, 8);
  assert.deepEqual(radii, [4, 4, 4, 4]);
  assert.equal(insideFloor(14, 8, radii, 7, 0.2), true);
  assert.equal(insideFloor(14, 8, radii, 0.2, 0.2), false);
});
test("a standing square is connected to the rest (the floor is one piece)", () => {
  for (const [w, h] of [[9, 9], [12, 7], [7, 12], [15, 15]]) {
    const g = standing(w, h, radiiOf("oval", w, h));
    const seen = new Set<string>();
    const stack: [number, number][] = [[Math.floor(w / 2), Math.floor(h / 2)]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= w || y >= h || !g[x][y] || seen.has(`${x},${y}`)) continue;
      seen.add(`${x},${y}`);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    assert.equal(seen.size, count(g), `${w}x${h}`);
  }
});
test("points outside the room are outside the floor", () => {
  assert.equal(insideFloor(5, 5, [0, 0, 0, 0], -0.1, 2), false);
  assert.equal(insideFloor(5, 5, [0, 0, 0, 0], 2, 5.1), false);
});
