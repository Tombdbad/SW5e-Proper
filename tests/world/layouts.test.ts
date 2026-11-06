import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, auditBuildings, formOf, openAir, trailOf, type Area } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// The audit of every building's rooms (shared/logic auditBuildings): floors that can be walked, ways that stand and are reachable,
// doors and stairs with partners, stacked rooms on their partners' footprints with stairs, galleries whose stairs meet them.
const catalog = await getWorldCatalog();
// (a world with every planet built is large: a few of those, and many worlds with the starting planet built)
const FULL = [1, 2, 34];
const START = Array.from({ length: 20 }, (_, i) => i + 3);

test("every building of every world is sound inside (floors, ways, stairs, stacked rooms, galleries); covered walkways where the air is bad", () => {
  const found: string[] = [];
  let tubes = 0;
  for (const seed of [...FULL, ...START]) {
    const world = generateWorld({ seed, partyLevel: 5, ...(FULL.includes(seed) ? { detail: "all" as const } : {}) }, catalog);
    for (const p of auditBuildings(world)) found.push(`seed ${seed}: ${p}`);
    // (2026-11-06: an elevated walkway on a station or where the air is bad is a tube, enclosed; elsewhere it is open to the sky)
    for (const room of Object.values(world.areas)) {
      if (formOf(room) !== "walkway" || !/walkway to /.test(room.name)) continue;
      const trail = trailOf(world, room.id);
      const bad = trail.some((a) => a.type === "station") || ["volcanic", "ice", "barren", "gas giant", "ocean"].includes(trail.find((a) => a.kind === "planet")?.type ?? "");
      assert.equal(!!room.layout?.tube, bad, `${room.name}: a tube ${!!room.layout?.tube}, the air bad ${bad}`);
      assert.equal(openAir(room), !bad, `${room.name}: open air ${openAir(room)}`);
      if (bad) tubes++;
    }
  }
  assert.ok(tubes > 0, "no covered walkway in the worlds");
  const kinds = new Map<string, number>();
  for (const f of found) {
    const k = f.replace(/^seed \d+: .*? \/ .*? \[[^\]]*\]: /, "").replace(/\d+/g, "N").slice(0, 70);
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  assert.equal(found.length, 0, `${found.length} problems; by kind: ${[...kinds].map(([k, n]) => `${n} x ${k}`).join("; ")}\n${found.slice(0, 12).join("\n")}`);
});

test("some buildings are towers of three floors, each reached by a switchback of its stair block from the one below", () => {
  let towers = 0;
  let deepest = 0;
  for (const seed of [...FULL, ...START]) {
    const world = generateWorld({ seed, partyLevel: 5, ...(FULL.includes(seed) ? { detail: "all" as const } : {}) }, catalog);
    for (const room of Object.values(world.areas)) {
      if (room.kind !== "room" || !room.layout) continue;
      const lower = world.areas[room.tags.find((t) => t.startsWith("stack:"))?.slice(6) ?? ""];
      const below = lower && world.areas[lower.tags.find((t) => t.startsWith("stack:"))?.slice(6) ?? ""];
      if (!below) continue;
      towers++;
      deepest = Math.max(deepest, room.layout.level ?? 0);
      // three floors: the top above the middle above the ground, on one footprint
      assert.ok((room.layout.level ?? 0) > (lower.layout!.level ?? 0) && (lower.layout!.level ?? 0) > (below.layout!.level ?? 0), `${room.name}: floors ${below.layout!.level ?? 0}, ${lower.layout!.level ?? 0}, ${room.layout.level}`);
      // the top floor's doorway opens onto its landing of the stairwell, and a switchback runs from the landing of the floor below up to it (since
      // 2026-11-06, "Stair blocks"); or, in a round tower that climbs inside, the spiral stair goes down from it to the floor below ("Round towers")
      const doorsTo = (a: Area, ok: (o: Area) => boolean) => a.layout!.assets.filter((d) => d.kind === "door" && world.areas[d.to ?? ""] && ok(world.areas[d.to!])).map((d) => d.to!);
      const landings = (a: Area) => doorsTo(a, (o) => o.tags.some((t) => t.startsWith("landing:")));
      const flights = (id: string) => doorsTo(world.areas[id], (o) => !!o.layout?.switchback);
      const spiral = room.layout.assets.some((d) => d.kind === "stairs" && d.name === "Spiral stair down" && d.to === lower.id);
      const stairwell = landings(room).some((top) => flights(top).some((f) => landings(lower).some((under) => flights(under).includes(f))));
      assert.ok(spiral || stairwell, `${room.name}: no switchback between its landing and ${lower.name}'s, nor a spiral stair`);
    }
  }
  assert.ok(towers > 0, "no tower of three floors in any world");
  assert.ok(deepest >= 2);
});

test("caves are organic: every cave room has a winding floor, and there are caves in the worlds", () => {
  let rooms = 0;
  for (const seed of [...FULL, ...START]) {
    const world = generateWorld({ seed, partyLevel: 5, ...(FULL.includes(seed) ? { detail: "all" as const } : {}) }, catalog);
    for (const a of Object.values(world.areas)) if (a.kind === "room" && a.layout?.mask) rooms++;
  }
  assert.ok(rooms >= 8, `${rooms} cave rooms with a winding floor in the test worlds`);
});

test("the arena (2026-11-02, the user's design): tiers over a round floor (three or four in a city, one or two in a town), each a ring set back from the one under it so the floor is in sight from every rail, up the stair tower from the betting hall; the floor reached only by the two ramps up from the pens under it, the pens only from the fighters' gate; older worlds are given theirs, older arenas rebuilt", async () => {
  const { childrenOf, livenWorld, walkBuilding, formOf } = await import("@shared/logic");
  const world = generateWorld({ seed: 34, partyLevel: 5 }, catalog);
  const cities = Object.values(world.areas).filter((a) => a.kind === "settlement" && a.type === "city" && childrenOf(world, a.id).length);
  assert.ok(cities.length);
  for (const city of cities) assert.ok(childrenOf(world, city.id).some((b) => b.type === "arena"), `${city.name} has an arena`);
  const arenas = Object.values(world.areas).filter((a) => a.type === "arena");
  for (const arena of arenas) {
    const town = world.areas[arena.parentId!].type !== "city";
    const rooms = childrenOf(world, arena.id);
    const named = (re: RegExp) => rooms.find((r) => re.test(r.name))!;
    const [hall, floor, pens, gate] = [named(/^betting hall$/i), named(/^arena floor$/i), named(/fighters' pens/i), named(/fighters' gate/i)];
    const tiers = rooms.filter((r) => /^spectator tier/i.test(r.name)).sort((p, q) => p.layout!.level! - q.layout!.level!);
    assert.ok(town ? tiers.length >= 1 && tiers.length <= 2 : tiers.length >= 3 && tiers.length <= 4, `${tiers.length} tiers in a ${town ? "town" : "city"}`);
    // The tiers: rings round the floor's middle, a storey each, each set back; from the front of each, the middle of the floor is seen over
    // the rail of the tier under it (heights in storeys: an eye 0.57 over the floor, a rail 0.36)
    const fl = floor.layout!;
    const middle = { x: fl.x + fl.width / 2, y: fl.y + fl.height / 2 };
    tiers.forEach((t, i) => {
      const l = t.layout!;
      assert.equal(l.level, i + 1);
      assert.deepEqual({ x: l.x + l.width / 2, y: l.y + l.height / 2 }, middle, "round the floor");
      assert.ok(l.well! >= fl.width / 2 && (i === 0 || l.well! > tiers[i - 1].layout!.well!), "set back from the one under it");
      if (i > 0) {
        const lo = tiers[i - 1].layout!;
        assert.ok(((l.level! + 0.57) * lo.well!) / l.well! > lo.level! + 0.36, `the floor in sight from ${t.name}`);
      }
      assert.ok(t.occupants.filter((o) => o.role === "spectator").length >= 8, "a crowd");
      // (at the rail: within two squares of the open middle)
      for (const n of l.assets.filter((a) => a.kind === "npc")) assert.ok(Math.hypot(n.x + 0.5 - l.width / 2, n.y + 0.5 - l.height / 2) < l.well! + 2.01, "at the rail");
    });
    // The floor: round, the pit in its middle, its only ways the two ramps, at opposite ends
    assert.ok(fl.shape === "round");
    const pit = fl.assets.find((a) => a.name === "Fighting pit")!;
    assert.ok(pit && Math.abs(pit.x + pit.w / 2 - fl.width / 2) <= 1 && Math.abs(pit.y + pit.h / 2 - fl.height / 2) <= 1, "the pit in the middle");
    const floorDoors = fl.assets.filter((a) => a.kind === "door" || a.kind === "exit");
    assert.equal(floorDoors.length, 2);
    assert.deepEqual(floorDoors.map((d) => d.side).sort(), ["e", "w"]);
    for (const d of floorDoors) {
      const ramp = world.areas[d.to!];
      assert.ok(formOf(ramp) === "stairs" && ramp.layout!.ramp && ramp.layout!.switchback && ramp.layout!.level === -1, "a switchback ramp up from under the floor");
      assert.ok(ramp.layout!.assets.some((a) => a.to === pens.id), "from the pens");
    }
    // The pens under the floor, with the pit boss, fighters and the beasts' pens; the betting hall with kiosks, bookmakers and refreshments
    const pl = pens.layout!;
    assert.equal(pl.level, -1);
    assert.ok(pl.x <= fl.x && pl.y <= fl.y && pl.x + pl.width >= fl.x + fl.width && pl.y + pl.height >= fl.y + fl.height, "under the floor");
    assert.ok(pl.assets.filter((a) => a.name === "Beast pen").length >= 2 && pens.occupants.some((o) => o.role === "pit boss"));
    const hl = hall.layout!;
    assert.ok(hl.assets.filter((a) => a.name === "Betting kiosk").length >= 1 && hall.occupants.some((o) => o.role === "bookmaker"));
    assert.ok(hl.assets.some((a) => a.name === "Refreshment stall") && hall.occupants.some((o) => o.role === "stallholder" && o.trade === "refreshments"));
    // Two ways in, each its own side: from the hall the tiers and never the floor or the pens; from the gate the pens and the floor, never a tier
    assert.ok(hall.gateway && gate.gateway && !floor.gateway);
    const from = (start: Area) => {
      const w2 = JSON.parse(JSON.stringify(world));
      for (const r of childrenOf(w2, arena.id)) if (r.id !== start.id) {
        r.gateway = false;
        r.layout!.assets = r.layout!.assets.filter((a) => a.kind !== "exit");
      }
      return walkBuilding(w2, arena.id).reached;
    };
    const spectators = from(hall);
    assert.ok(tiers.every((t) => spectators.has(t.id)), "every tier up the stairs from the hall");
    assert.ok(!spectators.has(floor.id) && !spectators.has(pens.id) && !spectators.has(gate.id), "nothing of the fighters' side from the hall");
    const fighters = from(gate);
    assert.ok(fighters.has(pens.id) && fighters.has(floor.id), "the pens, and the floor up the ramps, from the gate");
    assert.ok(tiers.every((t) => !fighters.has(t.id)) && !fighters.has(hall.id), "no tier from the gate");
  }
  // An arena of the first design (a floor with the crowd on it, the betting hall and the sign-up; life 15) is rebuilt, its rooms and people kept
  const first = JSON.parse(JSON.stringify(world)) as typeof world;
  const arena = Object.values(first.areas).find((a) => a.type === "arena")!;
  const rooms = childrenOf(first, arena.id);
  const keep = new Set(rooms.filter((r) => /^(arena floor|betting hall|fighters' pens)$/i.test(r.name)).map((r) => r.id));
  const floor1 = rooms.find((r) => /^arena floor$/i.test(r.name))!;
  const tier1 = rooms.find((r) => r.name === "Spectator tier 1")!;
  floor1.occupants.push(...tier1.occupants);
  const crowd = tier1.occupants.map((o) => o.id);
  for (const r of rooms) if (!keep.has(r.id)) delete first.areas[r.id];
  first.paths = first.paths.filter((p) => first.areas[p.from] && first.areas[p.to]);
  rooms.find((r) => /fighters' pens/i.test(r.name))!.name = "Fighters' sign-up";
  arena.tags = arena.tags.filter((t) => !t.startsWith("tiers:"));
  first.life = 15;
  const rebuilt = livenWorld(first, catalog);
  const again = childrenOf(rebuilt, arena.id);
  for (const id of keep) assert.ok(rebuilt.areas[id], "the hall, the floor and the pens are the rooms they were");
  assert.ok(again.some((r) => r.name === "Fighters' pens") && again.some((r) => r.name === "Fighters' gate") && again.filter((r) => /^spectator tier/i.test(r.name)).length >= 1);
  assert.deepEqual(again.find((r) => r.name === "Spectator tier 1")!.occupants.map((o) => o.id).sort(), crowd.sort(), "the old floor's crowd on the first tier");
  assert.ok(!rebuilt.areas[floor1.id].occupants.some((o) => o.role === "spectator"));
  // A world made before the arenas (life 14) gets them when it is livened
  const old = JSON.parse(JSON.stringify(world));
  const gone = new Set(Object.values(old.areas as Record<string, Area>).filter((a) => a.type === "arena").map((a) => a.id));
  for (const a of Object.values(old.areas as Record<string, Area>)) if (gone.has(a.parentId ?? "")) gone.add(a.id);
  for (const id of gone) delete old.areas[id];
  old.paths = old.paths.filter((p: { from: string; to: string }) => !gone.has(p.from) && !gone.has(p.to));
  old.life = 14;
  const livened = livenWorld(old, catalog);
  for (const city of cities) assert.ok(childrenOf(livened, city.id).some((b) => b.type === "arena"), `${city.name} is given its arena`);
  // The arena comes on top of what was there: no building, no district and no plan of a district (a palace's grounds) goes or changes
  const { districtsOf } = await import("@shared/logic");
  for (const s of Object.values(old.areas as Record<string, Area>).filter((a) => a.kind === "settlement")) {
    const before = childrenOf(old, s.id).map((b) => `${b.id}:${b.type}`);
    const after = new Set(childrenOf(livened, s.id).map((b) => `${b.id}:${b.type}`));
    assert.deepEqual(before.filter((b) => !after.has(b)), [], `${s.name} keeps its buildings`);
    const names = new Set(districtsOf(livened, s.id).map((d) => d.name));
    assert.deepEqual(districtsOf(old, s.id).map((d) => d.name).filter((n) => !names.has(n)), [], `${s.name} keeps its districts`);
  }
  // (since life 19, 2026-11-06, the user: saved games "Re-plan everything", a district whose buildings were planned is planned again with them, to
  // their new round footprints: it is kept, not kept as it was)
  for (const id of Object.keys(old.districtPlans ?? {})) assert.ok(livened.districtPlans?.[id], `the plan of ${id} is kept`);
  assert.ok(Object.values(world.areas).some((a) => a.type === "palace"), "the test world has a palace to keep");
});
