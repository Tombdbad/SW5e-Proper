import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, expandArea, validateWorld } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

const catalog = await getWorldCatalog();

// The play-through test expands an unvisited planet of a campaign with a random seed; with seed 170810146 two of the expansions
// (the world's counter 1104 and 1115 on Coruscant) put a stairwell between two rooms that already shared a corridor
test("a tower's stairwell never doubles a passage the rooms already share", () => {
  const world = generateWorld({ seed: 170810146, partyLevel: 1, partySize: 1 }, catalog);
  const planet = Object.values(world.areas).find((a) => a.kind === "planet" && a.name === "Coruscant");
  assert.ok(planet, "the seed still makes Coruscant");
  for (const counter of [1104, 1115, 1090, 1100, 1110, 1120]) {
    const next = expandArea(world, planet.id, catalog, world.seed + counter);
    assert.deepEqual(validateWorld(next, catalog), [], `counter ${counter}`);
  }
});
