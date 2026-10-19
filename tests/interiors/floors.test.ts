import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, childrenOf, type Area, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// Upper floors are used (2026-10-19): a building of five rooms or more has rooms above the ground, and no room above
// the ground is a dead end (one way in). Ship rooms (hangars, bays) are one way by nature.
const catalog = await getWorldCatalog();
const worlds: World[] = [1, 2, 34].map((seed) => generateWorld({ seed, partyLevel: 5 }, catalog));
// (wild sites, open grounds and the hangars are not built in floors)
const open = /cave|ruin|wreck|camp|trailhead|landing|hangar|shipyard|refuelling/;
const rooms = (w: World, b: Area) => childrenOf(w, b.id).filter((a) => a.kind === "room" && a.layout && !a.tags.some((t) => t.startsWith("form:")));

test("a building of five rooms or more has rooms on an upper floor", () => {
  let big = 0;
  for (const w of worlds) for (const b of Object.values(w.areas)) {
    if (b.kind !== "building" || open.test(b.type) || rooms(w, b).length < 5) continue;
    big++;
    assert.ok(new Set(rooms(w, b).map((r) => r.layout!.level ?? 0)).size > 1, `${b.type} has one floor`);
  }
  assert.ok(big > 0);
});

test("an upper room is stacked on the room below it, or reached by a stairway or lift", () => {
  let stacked = 0;
  for (const w of worlds) for (const b of Object.values(w.areas)) {
    if (b.kind !== "building") continue;
    const all = childrenOf(w, b.id).filter((a): a is Area => a.kind === "room" && !!a.layout);
    for (const r of all) {
      const l = r.layout!;
      if (r.tags.some((t) => t.startsWith("form:")) || (l.level ?? 0) < 1 || l.roof || /roof|gallery/i.test(r.name)) continue;
      const below = all.find((o) => (o.layout!.level ?? 0) === (l.level ?? 0) - 1 && o.layout!.x === l.x && o.layout!.y === l.y && o.layout!.width === l.width && o.layout!.height === l.height);
      if (below) {
        stacked++;
        continue;
      }
      const ways = w.paths.some((p) => p.from === r.id || p.to === r.id);
      assert.ok(ways, `${b.type}/${r.name} on an upper floor is not reached`);
    }
  }
  assert.ok(stacked > 0, "no room is stacked on the one below");
});
