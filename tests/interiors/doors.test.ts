import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, childrenOf, type Area, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// Doors are physical (2026-10-19): a door in a room's wall is on the square of the wall the room shares with the room it
// leads to, on a floor both stand on, and that room has the door back on the square across. Nothing else is a door.
const catalog = await getWorldCatalog();
const worlds: World[] = [34, 1, 2, 3].map((seed) => generateWorld({ seed, partyLevel: 5 }, catalog));
const DELTA = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;

test("every door sits on the wall it shares with the room it leads to, and that room has the door back", () => {
  let doors = 0;
  for (const w of worlds) for (const b of Object.values(w.areas)) {
    if (b.kind !== "building") continue;
    const rooms = childrenOf(w, b.id).filter((a): a is Area => a.kind === "room" && !!a.layout);
    for (const room of rooms) for (const d of room.layout!.assets.filter((a) => a.kind === "door")) {
      doors++;
      // (a catwalk or roof door of the district joins another building's room: that is laid out by the district, not here)
      const target = rooms.find((o) => o.id === d.to);
      if (!target) continue;
      const [dx, dy] = DELTA[d.side!];
      const sx = room.layout!.x + d.x;
      const sy = room.layout!.y + d.y;
      const tl = target.layout!;
      const across = { x: sx + dx, y: sy + dy };
      const inside = across.x >= tl.x && across.x < tl.x + tl.width && across.y >= tl.y && across.y < tl.y + tl.height;
      assert.ok(inside, `${b.type}: door of ${room.name} opens onto nothing (${across.x},${across.y}) toward ${target.name}`);
      // (a stairway, lift or ladder is the one way between floors: its doors may join them)
      const form = (r: Area) => r.tags.some((t) => t.startsWith("form:"));
      if (!form(room) && !form(target)) assert.equal(tl.level ?? 0, room.layout!.level ?? 0, `${b.type}: door of ${room.name} joins two floors`);
      const back = tl.assets.find((a) => a.kind === "door" && a.ref === d.ref && a.to === room.id);
      assert.ok(back, `${b.type}: ${target.name} has no door back to ${room.name}`);
      assert.equal(tl.x + back.x, across.x, "the door back is on the square across the wall");
      assert.equal(tl.y + back.y, across.y, "the door back is on the square across the wall");
    }
  }
  assert.ok(doors > 0);
});
