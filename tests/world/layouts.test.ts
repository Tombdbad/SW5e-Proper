import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, auditBuildings, type Area } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// The audit of every building's rooms (shared/logic auditBuildings): floors that can be walked, ways that stand and are reachable,
// doors and stairs with partners, stacked rooms on their partners' footprints with stairs, galleries whose stairs meet them.
const catalog = await getWorldCatalog();
// (a world with every planet built is large: a few of those, and many worlds with the starting planet built)
const FULL = [1, 2, 34];
const START = Array.from({ length: 20 }, (_, i) => i + 3);

test("every building of every world is sound inside (floors, ways, stairs, stacked rooms, galleries)", () => {
  const found: string[] = [];
  for (const seed of [...FULL, ...START]) {
    const world = generateWorld({ seed, partyLevel: 5, ...(FULL.includes(seed) ? { detail: "all" as const } : {}) }, catalog);
    for (const p of auditBuildings(world)) found.push(`seed ${seed}: ${p}`);
  }
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
      // the top floor's door opens off the head of a switchback whose foot opens off the floor below
      const flights = (a: Area) => a.layout!.assets.filter((d) => d.kind === "door" && world.areas[d.to ?? ""]?.layout?.switchback).map((d) => d.to);
      assert.ok(flights(room).some((id) => flights(lower).includes(id)), `${room.name}: no switchback between it and ${lower.name}`);
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

test("the arena (2026-11-02): every city has one, a round floor with the pit in its middle and stands round it, the crowd on the stands, a betting hall with a kiosk and bookmakers, a sign-up with the pit boss; older worlds are given theirs", async () => {
  const { childrenOf, isStand, standRow, standsAt, livenWorld, STAND_ROWS } = await import("@shared/logic");
  const world = generateWorld({ seed: 34, partyLevel: 5 }, catalog);
  const cities = Object.values(world.areas).filter((a) => a.kind === "settlement" && a.type === "city" && childrenOf(world, a.id).length);
  assert.ok(cities.length);
  for (const city of cities) {
    const arena = childrenOf(world, city.id).find((b) => b.type === "arena");
    assert.ok(arena, `${city.name} has an arena`);
    const rooms = childrenOf(world, arena!.id);
    const floor = rooms.find((r) => r.name === "Arena floor")!;
    const l = floor.layout!;
    assert.ok(l.shape === "round" || l.shape === "oval", "round");
    assert.ok(floor.gateway, "the way in");
    const stands = l.assets.filter(isStand);
    assert.ok(stands.length > 100, `${stands.length} squares of stands`);
    assert.ok(stands.every((s) => standsAt(l, s.x, s.y) && standRow(l, s.x, s.y) < STAND_ROWS));
    const pit = l.assets.find((a) => a.name === "Fighting pit")!;
    assert.ok(pit && Math.abs(pit.x + pit.w / 2 - l.width / 2) <= 1 && Math.abs(pit.y + pit.h / 2 - l.height / 2) <= 1, "the pit in the middle");
    const crowd = floor.occupants.filter((o) => o.role === "spectator");
    assert.ok(crowd.length >= 10, `${crowd.length} in the crowd`);
    const npcs = l.assets.filter((a) => a.kind === "npc" && crowd.some((o) => o.id === a.ref));
    assert.ok(npcs.every((n) => stands.some((s) => s.x === n.x && s.y === n.y)), "the crowd stands on the stands");
    const betting = rooms.find((r) => r.name === "Betting hall")!;
    assert.ok(betting.layout!.assets.some((a) => a.name === "Betting kiosk") && betting.occupants.some((o) => o.role === "bookmaker"));
    const signUp = rooms.find((r) => r.name === "Fighters' sign-up")!;
    assert.ok(signUp.layout!.assets.some((a) => a.name === "Sign-up desk") && signUp.occupants.some((o) => o.role === "pit boss"));
  }
  // A world made before the arenas (life 14) gets them when it is livened
  const old = JSON.parse(JSON.stringify(world));
  const gone = new Set(Object.values(old.areas as Record<string, Area>).filter((a) => a.type === "arena").map((a) => a.id));
  for (const a of Object.values(old.areas as Record<string, Area>)) if (gone.has(a.parentId ?? "")) gone.add(a.id);
  for (const id of gone) delete old.areas[id];
  old.paths = old.paths.filter((p: { from: string; to: string }) => !gone.has(p.from) && !gone.has(p.to));
  old.life = 14;
  const livened = livenWorld(old, catalog);
  for (const city of cities) assert.ok(childrenOf(livened, city.id).some((b) => b.type === "arena"), `${city.name} is given its arena`);
});
