import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";
import { uniqueKeys } from "../../client/src/lib/uniqueKeys";

const catalog = await getWorldCatalog();

// The audit (2026-11-08, T-004): React logged "two children with the same key" 50 to 111 times in a fight, because a room's assets
// are given ids from two counters that meet (`room-11` twice). The ids stay as they are (old saves hold them); the map keys on these.
test("the keys drawn for a room's assets are unique, in every room of several worlds, though the ids are not", () => {
  let roomsWithTwins = 0;
  for (const seed of [1, 2, 3, 34, 100]) {
    const world = generateWorld({ seed, partyLevel: 5 }, catalog);
    for (const area of Object.values(world.areas)) {
      const assets = area.layout?.assets ?? [];
      if (new Set(assets.map((a) => a.id)).size < assets.length) roomsWithTwins++;
      const keys = uniqueKeys(assets);
      assert.equal(keys.length, assets.length);
      assert.equal(new Set(keys).size, keys.length, `${area.id} has a repeated key`);
    }
  }
  assert.ok(roomsWithTwins > 0, "the worlds still have rooms whose asset ids repeat (if not, this guard can go)");
});

test("uniqueKeys keeps a lone id as it is and numbers the later twins", () => {
  assert.deepEqual(uniqueKeys([{ id: "a-1" }, { id: "a-2" }, { id: "a-1" }, { id: "a-1" }]), ["a-1", "a-2", "a-1~1", "a-1~2"]);
});
