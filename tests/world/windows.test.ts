import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, childrenOf, livenWorld, auditBuildings, formOf, type Area } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// More windows (2026-11-03, the user: rooms were too dark by day): every outside wall of a room that would have windows has one, a long
// one two; worlds made before are given them when they are livened, once.
const catalog = await getWorldCatalog();
const windows = (w: ReturnType<typeof generateWorld>) => Object.values(w.areas).flatMap((a: Area) => (a.layout?.assets ?? []).filter((x) => x.kind === "window").map((x) => `${a.id}/${x.id}`));

test("a new world's rooms have more windows, none on a doorway's square, and its audit is as sound as before", () => {
  const world = generateWorld({ seed: 7, partyLevel: 5 }, catalog);
  const rooms = Object.values(world.areas).filter((a) => a.kind === "room" && a.layout && !formOf(a) && !/vault|cellar|basement|armory|detention|stash|compartment|crypt|tunnel|reactor|hold|stor/i.test(a.name) && (a.layout.level ?? 0) >= 0 && world.areas[a.parentId ?? ""]?.type !== "cave");
  assert.ok(rooms.length > 20);
  const two = rooms.filter((r) => r.layout!.assets.filter((a) => a.kind === "window").length >= 2);
  assert.ok(two.length >= 5, `${two.length} rooms with two windows or more`);
  for (const room of rooms) {
    const l = room.layout!;
    const spots = l.assets.filter((a) => a.side).map((a) => `${a.side}${a.x},${a.y}`);
    assert.equal(new Set(spots).size, spots.length, `${room.name}: two ways or windows on one square`);
  }
  assert.deepEqual(auditBuildings(world), [], "the buildings are still sound inside");
});

test("an older world is given its windows when livened, and only once", () => {
  const world = generateWorld({ seed: 7, partyLevel: 5 }, catalog);
  const old = JSON.parse(JSON.stringify(world)) as typeof world;
  // (as it was made before: the extra windows taken away again, only the first window of each side kept)
  for (const a of Object.values(old.areas)) {
    if (!a.layout) continue;
    const seen = new Set<string>();
    a.layout.assets = a.layout.assets.filter((x) => {
      if (x.kind !== "window") return true;
      if (seen.has(x.side!)) return false;
      seen.add(x.side!);
      return true;
    });
  }
  const before = windows(old).length;
  old.life = 17;
  const once = livenWorld(old, catalog);
  assert.ok(windows(once).length > before, "livened, the rooms have more windows");
  const twice = livenWorld({ ...once, life: 17 }, catalog);
  // (livened again from before the windows, the walls take no second window on a square that has one. Since life 19, 2026-11-06, the buildings
  // and their districts are planned again on the way, so a wall a neighbour stood against may be clear and take one: the count may grow, not double)
  for (const a of Object.values(twice.areas)) {
    const at = (a.layout?.assets ?? []).filter((x) => x.kind === "window").map((x) => `${x.x},${x.y},${x.side}`);
    assert.equal(new Set(at).size, at.length, `${a.name}: no window twice`);
  }
  assert.ok(windows(twice).length < windows(once).length * 1.2, "livened again, the windows are not added again");
  assert.deepEqual(auditBuildings(once), []);
  assert.ok(childrenOf(once, Object.values(once.areas).find((a) => a.kind === "building")!.id).length);
});
