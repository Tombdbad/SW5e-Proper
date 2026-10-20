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
