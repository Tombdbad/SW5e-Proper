import test from "node:test";
import assert from "node:assert/strict";
import { radiiOf, standing, insideFloor, waysStand, outline, outlineAt, outlineOf, wallStretches } from "../../shared/logic/footprint";

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

// The wall line (2026-10-26): doors and windows of a round room stand on its curve, and the wall is cut only where they are
test("a rectangle's outline is its four sides, and a way stands on its edge", () => {
  const o = outline(6, 4, radiiOf("rect", 6, 4));
  assert.equal(o.length, 20);
  const s = outlineOf(o, 6, 4, "s", 2);
  const at = outlineAt(o, s);
  assert.deepEqual(at.p.map((v) => Math.round(v * 1e6) / 1e6), [2.5, 4]);
  assert.deepEqual(at.n.map((v) => Math.round(v) + 0), [0, -1]);
});
test("a door of a round room is on the curve, facing the middle", () => {
  const [w, h] = [6, 6];
  const radii = radiiOf("round", w, h);
  const o = outline(w, h, radii);
  assert.ok(Math.abs(o.length - Math.PI * 6) < 1e-9);
  for (const [side, along] of [["n", 1], ["n", 4], ["e", 2], ["s", 1], ["w", 3]] as const) {
    const at = outlineAt(o, outlineOf(o, w, h, side, along));
    // on the circle, and the way in points at its centre
    assert.ok(Math.abs(Math.hypot(at.p[0] - 3, at.p[1] - 3) - 3) < 1e-9, `${side}${along} on the curve`);
    const toCentre = [(3 - at.p[0]) / 3, (3 - at.p[1]) / 3];
    assert.ok(Math.abs(toCentre[0] - at.n[0]) < 1e-9 && Math.abs(toCentre[1] - at.n[1]) < 1e-9, `${side}${along} faces in`);
    // across from its square: the same x on the north and south sides, the same z on the others
    if (side === "n" || side === "s") assert.ok(Math.abs(at.p[0] - (along + 0.5)) < 1e-9);
    else assert.ok(Math.abs(at.p[1] - (along + 0.5)) < 1e-9);
  }
});
test("the wall is left whole but for the gaps cut in it", () => {
  const [w, h] = [10, 6];
  const radii = radiiOf("round", w, h);
  const o = outline(w, h, radii);
  const door = outlineOf(o, w, h, "n", 4);
  const curved = outlineOf(o, w, h, "w", 2);
  const parts = wallStretches(o, w, h, [[door - 0.5, door + 0.5], [curved - 0.5, curved + 0.5]]);
  const total = parts.runs.reduce((n, r) => n + r.b - r.a, 0) + parts.arcs.reduce((n, a) => n + (a.to - a.from) * a.r, 0);
  assert.ok(Math.abs(total - (o.length - 2)) < 1e-9, `${total} of ${o.length - 2}`);
  assert.ok(parts.runs.some((r) => r.side === "n" && Math.abs(r.b - 4) < 1e-9), "the north run stops at the door");
});
test("a room set against a round one fills to its curve", async () => {
  const { insetAt } = await import("../../shared/logic/footprint");
  const radii = radiiOf("round", 6, 6);
  assert.equal(insetAt(6, 6, radii, "w", 3), 0);
  assert.ok(Math.abs(insetAt(6, 6, radii, "w", 2) - (3 - Math.sqrt(8))) < 1e-9);
  assert.equal(insetAt(6, 6, radii, "e", 0), 3);
  assert.equal(insetAt(6, 4, radiiOf("rect", 6, 4), "n", 1), 0);
});
