import test from "node:test";
import assert from "node:assert/strict";
import { caveMask, describeMask, caveStyleOf, maskGrid, thickness, MAX_WIDTH, MIN_WIDTH, type CaveStyle, type CaveWay } from "../../shared/logic/caves";

// The floors of caves (shared/logic/caves.ts): winding, two to six squares wide (a chamber may be more), one piece, holding every way in
// and out, and the same each time.
const sizes: [number, number][] = [[7, 6], [8, 7], [9, 8], [10, 8], [11, 9], [12, 10], [7, 9], [9, 6]];
const wayAt = (w: number, h: number, i: number): CaveWay[] => {
  const all: CaveWay[] = [{ x: 0, y: Math.floor(h / 2), side: "w" }, { x: w - 1, y: Math.floor(h / 2) - 1, side: "e" }, { x: Math.floor(w / 2), y: 0, side: "n" }, { x: Math.floor(w / 3), y: h - 1, side: "s" }];
  return [[0], [0, 1], [0, 2], [1, 3], [0, 1, 3], [2, 3]][i % 6].map((k) => all[k]);
};

test("a tunnel, a mouth and a chamber are whole, narrow where they should be, and hold every way", () => {
  let made = 0;
  let whole = 0;
  for (const style of ["tunnel", "mouth", "chamber"] as CaveStyle[]) {
    for (const [w, h] of sizes) {
      for (let seed = 1; seed <= 30; seed++) {
        const ways = wayAt(w, h, seed);
        const mask = caveMask(w, h, ways, style, seed);
        made++;
        assert.equal(mask.length, h);
        assert.ok(mask.every((row) => row.length === w));
        const d = describeMask(mask);
        if (d.total === w * h) { whole++; continue; }
        assert.equal(d.pieces, 1, `${style} ${w}x${h} seed ${seed}: ${d.pieces} pieces`);
        for (const way of ways) assert.equal(mask[way.y][way.x], "#", `${style} ${w}x${h} seed ${seed}: a way is in the rock`);
        assert.ok(d.min >= MIN_WIDTH, `${style} ${w}x${h} seed ${seed}: a passage ${d.min} wide\n${mask.join("\n")}`);
        if (style !== "chamber") assert.ok(d.max <= MAX_WIDTH, `${style} ${w}x${h} seed ${seed}: a passage ${d.max} wide\n${mask.join("\n")}`);
        assert.ok(d.total >= 8, "a floor of some size");
        const g = maskGrid(mask);
        for (let y = 0; y + 1 < h; y++) for (let x = 0; x + 1 < w; x++) {
          const [a, b, c, e] = [g[y][x], g[y][x + 1], g[y + 1][x], g[y + 1][x + 1]];
          assert.ok(!((a && e && !b && !c) || (b && c && !a && !e)), `${style} ${w}x${h} seed ${seed}: floor squares touch only at a corner at ${x},${y}\n${mask.join("\n")}`);
        }
      }
    }
  }
  // (a room too small for a passage is left whole; it is rare)
  assert.ok(whole / made < 0.04, `${whole} of ${made} fell back to a plain rectangle`);
});

test("a cave is mostly narrow, and its walls are not straight", () => {
  let narrow = 0;
  let total = 0;
  const longest: number[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    const mask = caveMask(10, 8, wayAt(10, 8, seed), "tunnel", seed);
    const d = describeMask(mask);
    narrow += d.narrow * d.total;
    total += d.total;
    // The longest straight stretch of wall: squares in a row (or column) of floor with rock on the same side of each
    const g = maskGrid(mask);
    let best = 0;
    for (let y = 0; y < g.length; y++) for (const dy of [-1, 1]) {
      let run = 0;
      for (let x = 0; x < g[0].length; x++) { run = g[y][x] && !g[y + dy]?.[x] && g[y + dy] !== undefined ? run + 1 : 0; best = Math.max(best, run); }
    }
    for (let x = 0; x < g[0].length; x++) for (const dx of [-1, 1]) {
      let run = 0;
      for (let y = 0; y < g.length; y++) { run = g[y][x] && !g[y][x + dx] && g[y][x + dx] !== undefined ? run + 1 : 0; best = Math.max(best, run); }
    }
    longest.push(best);
  }
  longest.sort((a, b) => a - b);
  assert.ok(narrow / total > 0.8, `${(narrow / total).toFixed(2)} of the floor is in passages of five or fewer`);
  assert.ok(longest[20] <= 5, `the median longest straight wall is ${longest[20]} squares`);
  assert.ok(longest[36] <= 8, `a tunnel has a straight wall of ${longest[36]} squares`);
});

test("a tunnel is mostly two or three squares wide, with now and then a bay", () => {
  let thin = 0;
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const mask = caveMask(13, 8, wayAt(13, 8, seed), "tunnel", seed);
    const t = thickness(maskGrid(mask));
    for (const row of t) for (const v of row) if (v) { total++; if (v <= 3) thin++; }
  }
  assert.ok(thin / total > 0.7, `${(thin / total).toFixed(2)} of a tunnel's floor is at most three squares thick`);
});

test("the same cave each time, and a room's style comes from its name", () => {
  const ways = wayAt(9, 8, 1);
  assert.deepEqual(caveMask(9, 8, ways, "tunnel", 7), caveMask(9, 8, ways, "tunnel", 7));
  assert.notDeepEqual(caveMask(9, 8, ways, "tunnel", 7), caveMask(9, 8, ways, "tunnel", 8));
  assert.deepEqual(["Cave mouth", "Winding tunnel", "Den", "Deep chamber", "Crawlway"].map(caveStyleOf), ["mouth", "tunnel", "chamber", "chamber", "tunnel"]);
});
