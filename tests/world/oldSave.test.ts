import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, livenWorld, validateWorld, auditBuildings, LIFE, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// Saved campaigns made before a world-code change (audit T-011, 2026-11-08): the world is stored as JSON in the campaign row, and a campaign saved
// at an older `life` is brought up to date by `livenWorld` when it is opened. Here a stored world is forged into the shape an older save has (its
// life number set back; the fields later versions added taken out; the JSON round trip the database makes), and it must load, pass `validateWorld`,
// reach the current life, and be left alone by a second pass.
// Limit: only the shapes the generator can still make are forged (a life 21 save: no seams, no families, no era). A life 0 to 19 save has one-storey
// buildings, crowds and stair halls that today's generator cannot produce, so forging them from a fresh world gives faults of the forgery, not of the
// migration; those steps are covered where they can be forged (tests/world/access.test.ts, life 19) and by opening a real old save by hand.
const catalog = await getWorldCatalog();
const fresh = (seed: number): World => generateWorld({ seed, partyLevel: 4 }, catalog);
const stored = (w: World): World => JSON.parse(JSON.stringify(w));

function forge(w: World, life: number): World {
  const old = stored(w);
  old.life = life;
  delete old.families;
  delete old.era;
  for (const room of Object.values(old.areas)) {
    for (const a of room.layout?.assets ?? []) delete a.seam;
  }
  return old;
}

test("a fresh world is valid and is at the current life", () => {
  const w = fresh(3);
  assert.equal(w.life, LIFE);
  assert.deepEqual(validateWorld(w, catalog), []);
});

for (const seed of [3, 5, 7]) {
  const life = 21;
  test(`a world (seed ${seed}) saved at life ${life} loads, is valid and is brought to life ${LIFE}`, () => {
    const old = forge(fresh(seed), life);
    const before = JSON.stringify(old);
    const next = livenWorld(old, catalog);
    assert.equal(JSON.stringify(old), before, "the stored world is not changed in place");
    assert.equal(next.life, LIFE);
    assert.deepEqual(validateWorld(next, catalog), []);
    assert.deepEqual(auditBuildings(next), []);
    assert.equal(Object.keys(next.areas).length >= Object.keys(old.areas).length, true, "no area is lost");
    for (const id of Object.keys(old.areas)) assert.ok(next.areas[id], `area ${id} is kept`);
    assert.equal(next.startId, old.startId);
  });
}

test("a world at the current life is not changed by loading it, and loading twice is the same as once", () => {
  const w = stored(fresh(5));
  const once = livenWorld(w, catalog);
  assert.deepEqual(once, w);
  assert.deepEqual(livenWorld(once, catalog), once);
  const old = livenWorld(forge(fresh(5), 21), catalog);
  assert.deepEqual(livenWorld(old, catalog), old);
});
