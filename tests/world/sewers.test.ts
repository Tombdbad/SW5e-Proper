// The drains (2026-11-10, shared/logic markDrains / linkDrains; the user: sewers "should be accessed through hidden entrances in EXISTING settlement
// districts (NOT given a dedicated district), and connect to districts for covert methods to move around hostile settlements"): a few buildings of a city
// or a town have a hidden hatch down to a sewer access, a channel and a junction, and the junctions are joined by drain tunnels under the streets.
import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, childrenOf, districtsOf, formOf, type Area, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

const catalog = await getWorldCatalog();
const worlds = [1, 2, 3, 4].map((seed) => generateWorld({ seed, partyLevel: 4, detail: "all" }, catalog));
const built = (w: World) => Object.values(w.areas).filter((a): a is Area => a.kind === "settlement" && (a.type === "city" || a.type === "town"));
const drainsOf = (w: World, s: Area) => childrenOf(w, s.id).filter((b) => b.kind === "building" && b.tags.includes("drain"));

test("no settlement is made of sewers, no building is a sewer; the sewers are in existing buildings of cities and towns", () => {
  let nodes = 0;
  for (const w of worlds) {
    for (const a of Object.values(w.areas)) {
      assert.notEqual(a.type, "sewer system");
      assert.ok(!(a.kind === "building" && /^sewer/.test(a.type)), `${a.name}: a sewer building`);
    }
    for (const s of built(w)) {
      const drains = drainsOf(w, s);
      nodes += drains.length;
      assert.ok(drains.length <= (s.type === "city" ? 4 : 2), `${s.name}: ${drains.length} ways down`);
      // Each is an ordinary building of the settlement (not a satellite of one, not a gateway)
      for (const b of drains) assert.ok(!b.gateway && !b.tags.some((t) => t.startsWith("site:")), `${b.name} is a plain listed building`);
    }
  }
  assert.ok(nodes >= 6, `${nodes} buildings with a way down in ${worlds.length} worlds`);
});

test("the way down is hidden: a hatch off an open room, found by searching, to a junction under the ground that is a room of the building", () => {
  let [checked, open] = [0, 0];
  for (const w of worlds) for (const s of built(w)) for (const b of drainsOf(w, s)) {
    const rooms = childrenOf(w, b.id);
    const junction = rooms.find((r) => r.name === "Sewer junction");
    assert.ok(junction, `${b.name}: the drain's junction`);
    // From the rest of the building the junction has a hidden way (the hatch) and no open one: the ways it has to ordinary rooms of the building are
    // all hidden (the stairs the building's planner puts the hatch under are rooms of the way, not rooms)
    const own = w.paths.filter((p) => (p.from === junction!.id || p.to === junction!.id) && w.areas[p.from === junction!.id ? p.to : p.from].parentId === b.id);
    assert.ok(own.length >= 1 && own.some((p) => p.hidden && /hatch/i.test(p.label)), `${b.name}: no hidden hatch`);
    // (a building with no free ground room to put the column's stairs under has the junction set under a lower room, and the floors' own stairs are open:
    // a known limit, kept to a few buildings)
    for (const p of own) if (!formOf(w.areas[p.from === junction!.id ? p.to : p.from]) && !p.hidden) open++;
    assert.ok((junction!.layout?.level ?? 0) < 0 || junction!.layout === undefined, `the junction is under the ground`);
    checked++;
  }
  assert.ok(checked >= 6);
  assert.ok(open <= Math.ceil(checked * 0.25), `${open} of ${checked} drains have an open way down`);
});

test("the drains join the districts: the junctions are linked across buildings, so that the party can cross the settlement without the streets", () => {
  let joined = 0;
  for (const w of worlds) for (const s of built(w)) {
    const drains = drainsOf(w, s);
    if (drains.length < 2) continue;
    const junctions = drains.map((b) => childrenOf(w, b.id).find((r) => r.name === "Sewer junction")!.id);
    // From the first junction the others are reached by drain tunnels alone (paths between sewer rooms)
    const sewerRoom = new Set(drains.flatMap((b) => childrenOf(w, b.id).filter((r) => /^Sewer /.test(r.name)).map((r) => r.id)));
    const seen = new Set<string>([junctions[0]]);
    const queue = [junctions[0]];
    while (queue.length) {
      const at = queue.pop()!;
      for (const p of w.paths) {
        const o = p.from === at ? p.to : p.to === at ? p.from : undefined;
        if (o && sewerRoom.has(o) && !seen.has(o)) { seen.add(o); queue.push(o); }
      }
    }
    for (const j of junctions) assert.ok(seen.has(j), `${s.name}: every junction is on the network`);
    // They stand in more than one district where the settlement has more than one
    const districts = new Set(drains.map((b) => districtsOf(w, s.id).find((d) => d.buildingIds.includes(b.id))?.id));
    if (districtsOf(w, s.id).length > 1) assert.ok(districts.size > 1, `${s.name}: the drains are in ${districts.size} district of ${districtsOf(w, s.id).length}`);
    joined++;
  }
  assert.ok(joined >= 3, `${joined} settlements with a network`);
});
