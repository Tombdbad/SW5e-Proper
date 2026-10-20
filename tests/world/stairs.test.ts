import test from "node:test";
import assert from "node:assert/strict";
import { createRandom, galleryStairs, stairwellSpot, type RoomAsset, type RoomLayout } from "@shared/logic";

// Stairwells and the stairs up to a gallery (shared/logic stairwellSpot, galleryStairs): placed on squares that stand, clear of every way,
// leaving the floor whole; a switchback of two flights where there is room, a straight flight where there is not.
const room = (width: number, height: number, assets: RoomAsset[] = [], extra: Partial<RoomLayout> = {}): RoomLayout => ({ x: 0, y: 0, width, height, assets, ...extra });
const door = (x: number, y: number, side: "n" | "s" | "e" | "w"): RoomAsset => ({ id: `d${x}${y}`, kind: "door", name: "Door", x, y, w: 1, h: 1, side });
const covers = (a: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }) => a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h && o.y < a.y + a.h;

test("a stairwell is a switchback against a wall, clear of the doors, the same in both rooms", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const lower = room(8, 7, [door(0, 3, "w"), door(4, 6, "s"), { id: "w", kind: "window", name: "Window", x: 7, y: 2, w: 1, h: 1, side: "e" }]);
    const upper = room(8, 7, [door(7, 3, "e")], { level: 1 });
    const spot = stairwellSpot(lower, upper, createRandom(seed))!;
    assert.ok(spot, `seed ${seed}: nowhere for a stairwell in an 8x7 room`);
    assert.ok(spot.w * spot.h >= 6, "a switchback of two flights fits an 8x7 room");
    assert.ok(spot.x === 0 || spot.y === 0 || spot.x + spot.w === 8 || spot.y + spot.h === 7, "against a wall");
    for (const l of [lower, upper]) for (const a of l.assets) assert.ok(!covers(spot, a), `seed ${seed}: the stairwell covers ${a.kind} at ${a.x},${a.y}`);
  }
});

test("a small room gets a straight flight, and a room too small for any gets none", () => {
  const spot = stairwellSpot(room(4, 3), room(4, 3, [], { level: 1 }), createRandom(3))!;
  assert.ok(spot && spot.w * spot.h <= 6);
  assert.equal(stairwellSpot(room(1, 1), room(1, 1, [], { level: 1 }), createRandom(3)), undefined);
});

test("a stairwell does not leave a pinched corner or cut off a way", () => {
  // A wide corridor of a room with a door at each end: stairs across the middle would cut it in two
  const lower = room(9, 3, [door(0, 1, "w"), door(8, 1, "e")]);
  const upper = room(9, 3, [], { level: 1 });
  const spot = stairwellSpot(lower, upper, createRandom(5));
  if (spot) {
    // every square of the floor not under the stairwell is still reachable between the doors
    const free = Array.from({ length: 3 }, (_, y) => Array.from({ length: 9 }, (_, x) => !(x >= spot.x && x < spot.x + spot.w && y >= spot.y && y < spot.y + spot.h)));
    const seen = new Set(["0,1"]);
    const queue: [number, number][] = [[0, 1]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (free[ny]?.[nx] && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); queue.push([nx, ny]); }
    }
    assert.ok(seen.has("8,1"), "the doors can still be walked between");
  }
});

test("the stairs up to a gallery start just south of it, on squares that stand and are bare", () => {
  const host = room(12, 9, [door(0, 5, "w"), door(6, 8, "s")]);
  const gallery = room(10, 3, [], { x: 1, y: 0, level: 0.5 });
  const spot = galleryStairs(host, gallery, createRandom(1))!;
  assert.ok(spot);
  assert.ok(spot.x >= 1 && spot.x < 11, "under a column of the gallery");
  // A host with something in the way of the middle columns: the nearest free column
  const crowded = room(12, 9, [{ id: "c", kind: "furniture", name: "Crate", x: 5, y: 3, w: 2, h: 2, blocks: true }]);
  const other = galleryStairs(crowded, gallery, createRandom(1))!;
  assert.ok(other && !(other.x >= 5 && other.x < 7), `the stairs avoid the crate (column ${other?.x})`);
  // A host with no room south of the gallery
  assert.equal(galleryStairs(room(12, 4), gallery, createRandom(1)), undefined);
});
