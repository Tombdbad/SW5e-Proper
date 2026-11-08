import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, validateWorld, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// Audit T-045 (2026-11-08): a cantina's main bar whose corners were taken (doorways, windows, the drink dispenser, a stairwell) got no Bandstand
// although it has a band. The generator now falls back to a smaller stage (corner 2x2, then wall 2x1), as `livenWorld` does for older worlds.
const catalog = await getWorldCatalog();

test("every main bar with a band has a Bandstand", () => {
  const faults: string[] = [];
  let bars = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const w: World = generateWorld({ seed, partyLevel: 3 }, catalog);
    for (const a of Object.values(w.areas)) {
      if (!/^(main bar|cantina)$/i.test(a.name) || !a.layout || !a.occupants.some((o) => o.role === "musician")) continue;
      bars++;
      if (!a.layout.assets.some((x) => x.name === "Bandstand")) faults.push(`seed ${seed} ${a.id}`);
    }
  }
  assert.ok(bars > 20, `only ${bars} bars with a band were generated`);
  assert.deepEqual(faults, []);
});

test("a world with the fallback stage still validates", () => {
  for (const seed of [1, 5, 7, 16]) assert.deepEqual(validateWorld(generateWorld({ seed, partyLevel: 3 }, catalog)), []);
});
