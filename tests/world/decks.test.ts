import test from "node:test";
import assert from "node:assert/strict";
import { shipDeck, SHIP_FOOTPRINT, type RoomLayout } from "@shared/logic";

// The deck of every size of ship can be walked: the floor is one piece with no corner pinched between two pieces of furniture, every seat and
// the boarding ramp can be reached from a free square, and the square a person arrives on (beside the ramp) is in the main floor.
const SIZES = Object.keys(SHIP_FOOTPRINT);

function audit(size: string, layout: RoomLayout): string[] {
  const problems: string[] = [];
  const { width: W, height: H } = layout;
  const free = Array.from({ length: H }, () => Array(W).fill(true));
  for (const a of layout.assets) if (a.blocks) for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) { if (free[y]?.[x] === undefined) problems.push(`${size}: ${a.name} is outside the deck`); else free[y][x] = false; }
  for (const a of layout.assets) for (const b of layout.assets) if (a !== b && a.blocks && b.blocks && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) problems.push(`${size}: ${a.name} and ${b.name} overlap`);
  for (let y = 0; y + 1 < H; y++) for (let x = 0; x + 1 < W; x++) {
    const [p, q, r, t] = [free[y][x], free[y][x + 1], free[y + 1][x], free[y + 1][x + 1]];
    if ((!p && !t && q && r) || (!q && !r && p && t)) problems.push(`${size}: furniture touches only at a corner at ${x},${y}`);
  }
  const seen = new Set<string>();
  let regions = 0;
  const flood = (sx: number, sy: number) => {
    const stack: [number, number][] = [[sx, sy]];
    seen.add(`${sx},${sy}`);
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (free[ny]?.[nx] && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
    }
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (free[y][x] && !seen.has(`${x},${y}`)) { regions++; flood(x, y); }
  if (regions !== 1) problems.push(`${size}: the floor is in ${regions} pieces`);
  for (const a of layout.assets.filter((a) => a.blocks)) {
    const beside: [number, number][] = [];
    for (let y = a.y - 1; y <= a.y + a.h; y++) for (let x = a.x - 1; x <= a.x + a.w; x++) if ((x < a.x || x >= a.x + a.w) !== (y < a.y || y >= a.y + a.h)) beside.push([x, y]);
    if (!beside.some(([x, y]) => free[y]?.[x])) problems.push(`${size}: ${a.name} at ${a.x},${a.y} cannot be reached`);
  }
  const ramp = layout.assets.find((a) => a.ref === "station:ramp");
  if (!ramp) problems.push(`${size}: no boarding ramp`);
  return problems;
}

test("the deck of every size of ship can be walked", () => {
  const found = SIZES.flatMap((size) => audit(size, shipDeck({ id: `ship-${size}`, size })));
  assert.deepEqual(found, []);
});

test("a deck has a place to arrive that is beside the ramp and in the main floor", () => {
  for (const size of SIZES) {
    const l = shipDeck({ id: "x", size });
    const ramp = l.assets.find((a) => a.ref === "station:ramp")!;
    const blocked = (x: number, y: number) => l.assets.some((a) => a.blocks && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
    const next = [[1, 0], [0, 1], [0, -1], [-1, 0]].map(([dx, dy]) => [ramp.x + dx, ramp.y + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < l.width && y < l.height && !blocked(x, y));
    assert.ok(next.length, `${size}: nothing free beside the ramp`);
  }
});
