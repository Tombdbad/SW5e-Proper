import test from "node:test";
import assert from "node:assert/strict";
import { arrivalSquares, createRandom, galleryStairs, stairsApproach, type RoomAsset, type RoomLayout } from "@shared/logic";

// The stairs up to a gallery (shared/logic galleryStairs): placed on squares that stand, clear of every way, leaving the floor whole;
// taken from their foot (stairsApproach), arrived at by the way back (arrivalSquares). The stair blocks between floors are in access.test.ts.
const room = (width: number, height: number, assets: RoomAsset[] = [], extra: Partial<RoomLayout> = {}): RoomLayout => ({ x: 0, y: 0, width, height, assets, ...extra });
const door = (x: number, y: number, side: "n" | "s" | "e" | "w"): RoomAsset => ({ id: `d${x}${y}`, kind: "door", name: "Door", x, y, w: 1, h: 1, side });

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

test("stairs nobody can stand on are taken from their foot, stairs that can be stood on where they are", () => {
  // A flight of 1 by 2 climbing north: its foot is the square south of it, then the squares beside it, never the top
  const flight = { x: 4, y: 3, w: 1, h: 2, blocks: true, toward: "n" as const };
  const goals = stairsApproach(flight);
  assert.deepEqual(goals[0], { x: 4, y: 5 }, "the foot first");
  assert.ok(!goals.some((g) => g.x === 4 && g.y === 2), "not the top, where the flight meets the gallery");
  assert.ok(goals.some((g) => g.x === 3 && g.y === 3) && goals.some((g) => g.x === 5 && g.y === 4), "then beside it");
  // Stairs whose climb is not known: any square touching a side
  assert.equal(stairsApproach({ x: 2, y: 2, w: 2, h: 3, blocks: true }).length, 2 * (2 + 3));
  // Stairs that can be stood on (the top of a flight, the way out of a pit): their own squares
  assert.deepEqual(stairsApproach({ x: 1, y: 1, w: 1, h: 1 }), [{ x: 1, y: 1 }]);
});

test("arriving by a way, the party stands at its partner: a door's square, the foot of the stairs coming down, the top going up", () => {
  const host: RoomLayout = { x: 10, y: 10, width: 9, height: 8, assets: [
    { id: "s", kind: "stairs", name: "Stairs up", x: 4, y: 3, w: 1, h: 2, blocks: true, toward: "n", to: "gallery" },
    { id: "d", kind: "door", name: "Door", x: 0, y: 5, w: 1, h: 1, side: "w", to: "hall" },
  ] };
  assert.deepEqual(arrivalSquares(host, "gallery", { x: 14, y: 12 })[0], { x: 4, y: 5 }, "down from the gallery: the foot of the flight");
  assert.deepEqual(arrivalSquares(host, "hall", { x: 9, y: 15 }), [{ x: 0, y: 5 }], "through the door: on its square");
  assert.deepEqual(arrivalSquares(host, "elsewhere", { x: 0, y: 0 }), [], "no way from there: nothing (the map takes the nearest open square)");
});

