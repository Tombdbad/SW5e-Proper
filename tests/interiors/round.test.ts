import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, type Area, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";
import { standing, radiiOf } from "../../shared/logic/footprint";

// Round and oval rooms (shared/logic/footprint.ts) are planned into some new worlds: nothing may be
// placed on a square outside the curve, and every way in must stand
const catalog = await getWorldCatalog();
const worlds: World[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => generateWorld({ seed, partyLevel: 5 }, catalog));
const shaped = worlds.flatMap((w) => Object.values(w.areas).filter((a): a is Area => a.kind === "room" && !!a.layout?.shape));

test("some new rooms are round or oval", () => {
  assert.ok(shaped.length > 0, "no shaped room in six worlds");
});

test("nothing stands outside a round or oval room's curve, and every way in stands", () => {
  for (const room of shaped) {
    const l = room.layout!;
    const grid = standing(l.width, l.height, radiiOf(l.shape!, l.width, l.height));
    for (const a of l.assets) {
      for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) {
        if (a.blocks || a.kind === "door" || a.kind === "exit" || a.kind === "secret") {
          assert.ok(grid[x]?.[y], `${room.name}: ${a.kind} "${a.name}" on a cut square ${x},${y}`);
        }
      }
    }
  }
});

test("a round room is joined to its neighbours only through corridors", () => {
  for (const world of worlds) for (const room of Object.values(world.areas)) {
    if (room.kind !== "room" || !room.tags.includes("round")) continue;
    for (const p of world.paths) {
      const other = p.from === room.id ? world.areas[p.to] : p.to === room.id ? world.areas[p.from] : undefined;
      // (a stairway, lift, pit or the like may be joined directly: those are ways, not rooms set against the curve)
      if (!other || other.kind !== "room" || other.parentId !== room.parentId || other.tags.some((t) => t.startsWith("form:"))) continue;
      assert.fail(`${room.name} joined directly to ${other.name}`);
    }
  }
});
