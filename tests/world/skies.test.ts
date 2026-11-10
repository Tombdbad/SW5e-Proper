// Skies, horizons and the land across a course (shared/logic "Skies and landforms", 2026-10-26): what each world shows on its horizon and in
// its sky, the same for a place every time, and the gorges, hills, rivers and lava that a speeder race or a chase on the road meets.
import test from "node:test";
import assert from "node:assert/strict";
import { moonElongation, moonLit, moonPeriod, moonlight, generateWorld, childrenOf, skyLook, worldLook, biomeSky, raceCourse, raceStart, stepRace, groundAt, raceWater, CROSSING, RACE, type Area, type RaceScenery } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

const catalog = await getWorldCatalog();
const scenery = (biome: string): RaceScenery => ({ trees: ["tree"], shrubs: [], boulders: ["rock"], hits: { tree: { r: 0.5, h: 6 }, rock: { r: 1.2, h: 2 }, barrier: { box: [0.9, 0.2], h: 1 } }, crossings: biomeSky(biome).crossings });

test("each biome's horizon has its own land: dunes and mesas in the desert, active volcanoes on a volcanic world, a sea round an ocean world, cloud on a gas giant", () => {
  const kinds = (biome: string) => new Set(Array.from({ length: 12 }, (_, i) => skyLook(biome, i + 1).landforms.map((f) => f.kind)).flat());
  assert.ok(kinds("desert").has("dunes") && kinds("desert").has("mesas") && !kinds("desert").has("sea"));
  const volcanic = Array.from({ length: 6 }, (_, i) => skyLook("volcanic", i + 1).landforms).flat();
  assert.ok(volcanic.some((f) => f.kind === "volcano" && f.active), "a volcanic world's volcanoes smoke");
  assert.equal(skyLook("ocean", 3).landforms[0].kind, "sea");
  assert.deepEqual(skyLook("gas giant", 3).landforms.map((f) => f.kind), ["cloudsea"]);
  assert.ok(kinds("urban").has("towers"), "a city world's skyline");
  assert.ok(kinds("ice").has("ridges") && Array.from({ length: 6 }, (_, i) => skyLook("ice", i + 1).landforms).flat().some((f) => f.snow), "snow on the ice world's peaks");
  // The far ones are drawn first, so the near ones stand in front
  const forms = skyLook("temperate", 9).landforms;
  assert.ok(forms.every((f, i) => i === 0 || f.dist <= forms[i - 1].dist));
  // The same place, the same look; a desert is clearer than a swamp
  assert.deepEqual(skyLook("forest", 5), skyLook("forest", 5));
  assert.ok(skyLook("desert", 5).clouds < skyLook("swamp", 5).clouds);
  // Two suns where the system has them, of the star's colour
  const two = skyLook("desert", 1, { star: "K", binary: true });
  assert.equal(two.suns.length, 2);
  assert.notEqual(two.suns[0].color, two.suns[1].color);
  assert.equal(skyLook("desert", 1, { star: "M" }).suns.length, 1);
});

test("a world's sky: the planet's moons are the same from every settlement on it, the horizon is the settlement's own, the system's worlds are in it", () => {
  const world = generateWorld({ seed: 11, partyLevel: 3 }, catalog);
  const planets = Object.values(world.areas).filter((a): a is Area => a.kind === "planet" && childrenOf(world, a.id).filter((s) => s.kind === "settlement").length >= 2);
  assert.ok(planets.length > 0, "a planet with two settlements");
  const [a, b] = childrenOf(world, planets[0].id).filter((s) => s.kind === "settlement");
  const [la, lb] = [worldLook(world, a.id)!, worldLook(world, b.id)!];
  assert.equal(la.biome, planets[0].type);
  assert.deepEqual(la.moons, lb.moons, "the moons are the planet's");
  assert.notDeepEqual(la.landforms, lb.landforms, "each settlement has its own horizon");
  // A building shares its settlement's horizon
  const building = childrenOf(world, a.id).find((x) => x.kind === "building");
  if (building) assert.deepEqual(worldLook(world, building.id)!.landforms, la.landforms);
  // Every other world of the system is in the sky
  const system = world.areas[planets[0].parentId!];
  assert.equal(la.planets.length, Math.min(4, childrenOf(world, system.id).filter((p) => p.kind === "planet").length - 1));
  assert.equal(worldLook(world, world.rootId), null, "no sky over the galaxy");
});

test("a course meets the world's land: a gorge it drops into, a hill it goes over, a river or lava it crosses on bridges, clear of the start and the gates", () => {
  for (const [biome, seed] of [["forest", 2], ["volcanic", 1], ["desert", 3], ["ice", 4]] as [string, number][]) {
    const track = raceCourse(seed, scenery(biome));
    const wanted = biomeSky(biome).crossings;
    if (wanted.includes("river") || wanted.includes("lava")) {
      assert.ok(track.rivers!.length === 1 && track.bridges!.length >= 2, `${biome}: a river crossed at least twice (a loop crosses a line an even number of times)`);
      assert.equal(track.rivers![0].lava, wanted.includes("lava"));
      for (const b of track.bridges!.filter((x) => x.width === track.width)) {
        const mid = b.points[Math.floor(b.points.length / 2)];
        const s = track.points.indexOf(mid) * track.step;
        assert.ok(s > 140 && track.gates.every((g) => Math.abs(g.s - s) > 30), `${biome}: a bridge at ${Math.round(s)} m is clear of the start and the gates`);
        // On the deck the way is level with the land; off it, beside the bridge, the channel is down at the water
        const water = raceWater(track, mid[0], mid[2]);
        assert.ok(water, `${biome}: the bridge's middle is over the channel`);
        const deck = groundAt(track, mid[0], mid[2]);
        const yaw = track.yaws[track.points.indexOf(mid)];
        const off = track.width / 2 + CROSSING.deck + 3;
        const [sx, sz] = [mid[0] - Math.sin(yaw) * off, mid[2] + Math.cos(yaw) * off];
        const beside = raceWater(track, sx, sz);
        if (beside?.inside) assert.ok(groundAt(track, sx, sz) < deck - CROSSING.riverDrop + 0.5, `${biome}: beside the deck is the water`);
      }
      // Rails on the decks
      assert.ok(track.props.filter((p) => p.key === "barrier").length > 0);
    }
    // The same course without the land's features (the loop and its swells are drawn before them): the track is down in the gorge by its
    // depth, up on the hill by its height
    const plain = raceCourse(seed, { ...scenery(biome), crossings: [] });
    for (const f of track.features ?? []) {
      assert.ok(wanted.includes(f.kind), `${biome}: only the world's own features`);
      const i = Math.round(f.at / track.step) % track.points.length;
      const rise = track.points[i][1] - plain.points[i][1];
      if (f.kind === "gorge") assert.ok(Math.abs(rise + CROSSING.gorgeDepth) < 0.5, `${biome}: the track is down in the gorge (${rise.toFixed(1)} m)`);
      else assert.ok(Math.abs(rise - CROSSING.hillHeight) < 0.5, `${biome}: the track is up on the hill (${rise.toFixed(1)} m)`);
      // Its ends are where they were
      const j = Math.round((f.at - f.len / 2 - 30) / track.step) % track.points.length;
      assert.ok(Math.abs(track.points[j][1] - plain.points[j][1]) < (f.kind === "hill" ? 3.5 : 0.1), `${biome}: the ground before the ${f.kind} is as it was`);
    }
    // The course is still raced: the rivals finish
    let race = raceStart(track, seed, "Landspeeder", ["Landspeeder", "Speeder bike"]);
    while (!race.over && race.t < track.limit) race = stepRace(race, track, { steer: { x: 0, y: 0 }, throttle: 1, auto: true }, 0.25);
    assert.ok(race.racers.some((r) => r.finish !== null && r.finish < 400), `${biome}: a racer finishes in good time (the course is twice as long as it was)`);
  }
  // A gas giant's platforms have none of it
  const giant = raceCourse(1, scenery("gas giant"));
  assert.equal(giant.rivers!.length + giant.features!.length, 0);
});

test("lava burns a hull point each half second to a speeder down in it, off the bridge", () => {
  const track = raceCourse(1, scenery("volcanic"));
  // Beside the main track's bridge, off its deck, down in the lava (with the gates before it passed, so the racer is not towed back to them)
  const bridge = track.bridges!.find((b) => b.width === track.width)!;
  const mid = bridge.points[Math.floor(bridge.points.length / 2)];
  const i = track.points.indexOf(mid);
  const off = track.width / 2 + CROSSING.deck + 5;
  const spot: [number, number] = [mid[0] - Math.sin(track.yaws[i]) * off, mid[2] + Math.cos(track.yaws[i]) * off];
  assert.ok(raceWater(track, ...spot)?.lava);
  let race = raceStart(track, 1, "Landspeeder", []);
  const me = race.racers[0];
  me.craft.p = [spot[0], groundAt(track, spot[0], spot[1]) + RACE.hover, spot[1]];
  me.craft.yaw = track.yaws[i];
  me.v = [0, 0, 0];
  me.gates = track.gates.filter((g) => g.s <= i * track.step).length;
  // And on the bridge's deck nothing burns
  let safe = raceStart(track, 1, "Landspeeder", []);
  safe.racers[0].craft.p = [mid[0], groundAt(track, mid[0], mid[2]) + RACE.hover, mid[2]];
  safe.racers[0].craft.yaw = track.yaws[i];
  safe.racers[0].v = [0, 0, 0];
  safe.racers[0].gates = me.gates;
  for (let k = 0; k < 10; k++) safe = stepRace(safe, track, { steer: { x: 0, y: 0 }, throttle: -1 }, 0.1);
  assert.equal(safe.racers[0].hull, me.hull, "on the deck the hull is whole");
  for (let k = 0; k < 12; k++) race = stepRace(race, track, { steer: { x: 0, y: 0 }, throttle: -1 }, 0.1);
  assert.equal(race.racers[0].hull, me.hull - 2, "two points in 1.2 seconds");
  assert.ok(race.log.some((l) => /lava/.test(l)));
});

test("the moons go through their phases over the days: new, full, and round again; the night's light follows", () => {
  const moons = [{ drift: 1, az: 0, size: 0.03 }];
  const DAY = 24 * 60;
  const period = moonPeriod(moons[0]);
  assert.ok(period >= 8 && period <= 24, `a period of ${period} days`);
  // new at the start (elongation 0), full half a period on, new again a period on
  assert.ok(moonLit(moonElongation(0, moons[0])) < 1e-9);
  assert.ok(moonLit(moonElongation((period / 2) * DAY, moons[0])) > 1 - 1e-9);
  assert.ok(moonLit(moonElongation(period * DAY, moons[0])) < 1e-6);
  // at midnight (a full moon stands high then, opposite the sun) over a round of phases: the light is greatest near the full moon and least
  // near the new one, and never beyond every moon at its fullest
  const lights = Array.from({ length: Math.ceil(period) }, (_, d) => ({ light: moonlight(d * DAY, moons), lit: moonLit(moonElongation(d * DAY, moons[0])) }));
  const best = lights.reduce((a, b) => (b.light > a.light ? b : a));
  const least = lights.reduce((a, b) => (b.light < a.light ? b : a));
  assert.ok(best.lit > 0.8 && best.light > 0.7, "the most light is at the full moon: " + JSON.stringify(best));
  assert.ok(least.lit < 0.2 && least.light < 0.05, "the least is at the new: " + JSON.stringify(least));
  assert.ok(lights.every((l) => l.light >= 0 && l.light <= 1 + 1e-9));
  assert.equal(moonlight(0, []), 0, "a world with no moon has none of its light");
});
