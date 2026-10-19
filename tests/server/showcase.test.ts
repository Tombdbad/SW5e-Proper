import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, validateWorld, exitsOf, trailOf, childrenOf, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";
import { showcaseScore, showcaseWorld, trimToShowcase, SHOWCASE_BUILDINGS } from "../../server/showcase";

const catalog = await getWorldCatalog();
const make = (seed: number): World => generateWorld({ seed, partyLevel: 5 }, catalog);

test("the showcase is a single planet with its city and wild sites, valid, and every place reachable", () => {
  const started = Date.now();
  // The world the test copy ships (deploy/test-copy.sh) is the one checked
  process.env.SW5E_SHOWCASE_SEED = "34";
  const world = showcaseWorld(make, 1);
  delete process.env.SW5E_SHOWCASE_SEED;
  const planets = Object.values(world.areas).filter((a) => a.kind === "planet");
  assert.equal(planets.length, 1);
  assert.equal(Object.values(world.areas).filter((a) => a.kind === "system").length, 1);
  const settlements = Object.values(world.areas).filter((a) => a.kind === "settlement");
  assert.ok(settlements.length >= 2 && settlements.length <= 4, `${settlements.length} settlements`);
  assert.ok(settlements.filter((s) => !/cave system|ruins/.test(s.type)).length === 1, "one city");
  assert.ok(settlements.some((s) => s.type === "cave system"));
  assert.ok(showcaseScore(world) >= 9, `shows ${showcaseScore(world)} things`);
  assert.ok(Object.values(world.areas).some((a) => a.kind === "building" && a.type === "palace"), "a palace");
  assert.deepEqual(validateWorld(world, catalog), []);
  assert.ok(world.areas[world.startId]);
  console.log(`showcase made in ${Date.now() - started} ms: ${settlements.map((s) => `${s.type} (${childrenOf(world, s.id).map((b) => b.type).join(", ")})`).join("; ")}`);
});
test("the buildings of the city are a short way from each other, and the settlements a kilometre apart", () => {
  const world = showcaseWorld(make, 1);
  const home = trailOf(world, world.startId).find((a) => a.kind === "settlement")!;
  const buildings = childrenOf(world, home.id).filter((a) => SHOWCASE_BUILDINGS.includes(a.type));
  assert.ok(buildings.length >= 5);
  for (const a of buildings) {
    const exits = exitsOf(world, a.id).filter((e) => e.via === "path");
    for (const b of buildings.filter((o) => o !== a)) assert.ok(exits.some((e) => e.to === b.id && /10 m/.test(e.travel)), `${a.name} to ${b.name}`);
  }
  const routes = exitsOf(world, home.id).filter((e) => e.via === "path");
  assert.ok(routes.length >= 1 && routes.every((e) => /^1 km/.test(e.travel)));
});
test("trimming does not change the world it was given, and keeps what is lived in", () => {
  const world = make(5);
  const copy = JSON.stringify(world);
  const trimmed = trimToShowcase(world);
  assert.equal(JSON.stringify(world), copy);
  assert.ok(Object.keys(trimmed.areas).length < Object.keys(world.areas).length);
  assert.ok(Object.values(trimmed.areas).every((a) => !a.parentId || trimmed.areas[a.parentId]));
});
test("the flag decides: the service never has it", async () => {
  const { showcaseOn } = await import("../../server/showcase");
  const was = process.env.SW5E_SHOWCASE;
  delete process.env.SW5E_SHOWCASE;
  assert.equal(showcaseOn(), false);
  process.env.SW5E_SHOWCASE = "1";
  assert.equal(showcaseOn(), true);
  if (was === undefined) delete process.env.SW5E_SHOWCASE; else process.env.SW5E_SHOWCASE = was;
});
