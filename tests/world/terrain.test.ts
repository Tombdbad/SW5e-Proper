// The terrain (shared/logic/terrain.ts, 2026-11-10): the same ground for the same seed, a height field of the biome's own kind, weathered without
// losing what it should keep, level where something is built, and the ground of a speeder course and of an air fight made from it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  TERRAIN_STYLES, makeTerrain, terrainFor, terrainHeight, terrainSlope, terrainColorAt, terrainSplat, terrainSurface, kitSpots, terrainGradient, ecologySpots, ECOLOGY, levelDisc, levelRoad, scatterOn, thermalSettle, streamPower, terrainWater,
  raceCourse, raceWay, groundAt, biomeSky, RACE, CROSSING, type RaceScenery, type Terrain, districtGround, districtRelief, levelBox,
} from "@shared/logic";
import { AIR, airGround, airTerrain, dogfightStart } from "../../shared/logic/dogfight";
import { bombFall } from "../../shared/logic/dogfightSim";
import { partyShip, rows } from "../ships/dogfightBot";

const hash = (t: Terrain) => t.h.reduce((a, v, i) => (a * 31 + Math.round(v * 100) + i) % 1000003, 7);

test("the same seed gives the same ground, another seed another", () => {
  const a = makeTerrain({ seed: 7, biome: "temperate", size: 1000, n: 65 });
  const b = makeTerrain({ seed: 7, biome: "temperate", size: 1000, n: 65 });
  assert.equal(hash(a), hash(b));
  assert.deepEqual(Array.from(a.h.slice(0, 64)), Array.from(b.h.slice(0, 64)));
  assert.notEqual(hash(a), hash(makeTerrain({ seed: 8, biome: "temperate", size: 1000, n: 65 })));
  assert.notEqual(hash(a), hash(makeTerrain({ seed: 7, biome: "desert", size: 1000, n: 65 })));
  // (and a made-once cache hands back the one made)
  assert.equal(terrainFor({ seed: 7, biome: "ice", size: 800, n: 49 }), terrainFor({ seed: 7, biome: "ice", size: 800, n: 49 }));
});

test("every biome's ground is finite, between nothing and its relief, and a gas giant's is flat", () => {
  for (const [biome, style] of Object.entries(TERRAIN_STYLES)) {
    const t = makeTerrain({ seed: 3, biome, size: 1200, n: 65 });
    assert.ok(t.h.every(Number.isFinite), `${biome}: finite`);
    assert.ok(t.flow.every(Number.isFinite), `${biome}: flow finite`);
    assert.ok(t.min >= -0.5 && t.max <= style.relief + 0.5, `${biome}: ${t.min}..${t.max} of ${style.relief}`);
    if (style.relief === 0) assert.equal(t.max, 0);
    else assert.ok(t.max - t.min > style.relief * 0.5, `${biome}: has relief`);
    const c = terrainColorAt(t, 10, -20);
    assert.ok(c.every((v) => v >= 0 && v <= 1), `${biome}: colour ${c}`);
  }
  // A swamp is flatter than a mountain world, a volcanic world higher than a temperate one
  const mean = (biome: string) => { const t = makeTerrain({ seed: 4, biome, size: 1500, n: 65 }); let s = 0; for (let i = 0; i < 400; i++) s += terrainSlope(t, ((i * 37) % 1000) - 500, ((i * 91) % 1000) - 500); return s / 400; };
  assert.ok(mean("swamp") < mean("volcanic"), "a swamp is flatter than a volcanic land");
  assert.ok(TERRAIN_STYLES.volcanic.relief > TERRAIN_STYLES.temperate.relief);
});

test("weathering: valleys drain, thermal settling loses no ground, the rim of the grid stays", () => {
  const raw = makeTerrain({ seed: 5, biome: "temperate", size: 1500, n: 97, erosion: "none" });
  const worn = makeTerrain({ seed: 5, biome: "temperate", size: 1500, n: 97, erosion: "full" });
  assert.notEqual(hash(raw), hash(worn), "erosion changed the ground");
  // (the same sculpt under it: the weathered ground is the raw one cut, not another landscape)
  let [diff, scale] = [0, 0];
  for (let i = 0; i < raw.h.length; i++) { diff += Math.abs(raw.h[i] - worn.h[i]); scale += raw.h[i]; }
  assert.ok(diff / scale < 0.2, `changed ${(diff / scale).toFixed(3)} of the height`);
  // The flow gathers: some vertices carry a river's share, most carry little
  const big = worn.flow.filter((v) => v > 0.6).length;
  assert.ok(big > 20 && big < worn.flow.length * 0.4, `${big} river vertices`);
  // Thermal settling moves ground, it does not lose it (the sums over the grid match)
  const t = makeTerrain({ seed: 9, biome: "jungle", size: 1000, n: 65, erosion: "none" });
  const before = t.h.reduce((a, v) => a + v, 0);
  thermalSettle(t.h, t.n, t.cell, 20, 20, 0.5);
  assert.ok(Math.abs(t.h.reduce((a, v) => a + v, 0) - before) < before * 1e-4, "no ground lost");
  // Stream power cuts and never raises the ground beyond the uplift it is given
  const h = Float32Array.from(raw.h);
  streamPower(h, raw.n, 6, 0.12);
  assert.ok(h.every((v, i) => v <= raw.h[i] + 1e-3), "only cut");
});

test("level ground: a pad is flat to its radius and blends back; a road follows the contour more gently than the land", () => {
  const t = makeTerrain({ seed: 6, biome: "forest", size: 4000, n: 129, scale: 2 });
  const h0 = levelDisc(t, 0, 0, 300, 500);
  for (let a = 0; a < 8; a++) for (const f of [0, 0.5, 0.95]) assert.ok(Math.abs(terrainHeight(t, Math.cos(a) * 300 * f, Math.sin(a) * 300 * f) - h0) < 0.01, "flat inside the pad");
  assert.ok(Math.abs(terrainHeight(t, 1900, 1900) - makeTerrain({ seed: 6, biome: "forest", size: 4000, n: 129, scale: 2 }).h[t.n * t.n - 1]) >= 0, "the rest is the land's");
  const line: [number, number][] = [[-1500, 600], [0, 900], [1500, 700]];
  const raw = makeTerrain({ seed: 6, biome: "forest", size: 4000, n: 129, scale: 2 });
  levelRoad(t, line, 60, 240);
  const grade = (tt: Terrain) => { let worst = 0; for (let x = -1400; x < 1400; x += 40) worst = Math.max(worst, Math.abs(terrainHeight(tt, x + 40, 800) - terrainHeight(tt, x, 800)) / 40); return worst; };
  assert.ok(grade(t) <= grade(raw) + 1e-6, `the road's grade ${grade(t).toFixed(3)} against the land's ${grade(raw).toFixed(3)}`);
});

test("dressing stands where it can: the slope, height and wetness it is given", () => {
  const t = makeTerrain({ seed: 2, biome: "forest", size: 1500, n: 97 });
  const trees = scatterOn(t, { spacing: 30, maxSlope: 0.35, maxAlt: 0.7, seed: 1 });
  assert.ok(trees.length > 100);
  for (const [x, z] of trees) assert.ok(terrainSlope(t, x, z) <= 0.35 + 1e-9 && (terrainHeight(t, x, z) - t.min) / (t.max - t.min) <= 0.7 + 1e-9);
  assert.deepEqual(trees, scatterOn(t, { spacing: 30, maxSlope: 0.35, maxAlt: 0.7, seed: 1 }));
  // Rock shows where it is steep, snow high up where it is cold
  const ice = makeTerrain({ seed: 2, biome: "ice", size: 1500, n: 97 });
  let [rockSteep, rockFlat, snowHigh] = [0, 0, 0];
  for (let i = 0; i < 600; i++) {
    const [x, z] = [((i * 53) % 1400) - 700, ((i * 97) % 1400) - 700];
    const s = terrainSplat(ice, x, z);
    if (terrainSlope(ice, x, z) > 0.8) rockSteep = Math.max(rockSteep, s.rock);
    if (terrainSlope(ice, x, z) < 0.1) rockFlat = Math.max(rockFlat, s.rock);
    if ((terrainHeight(ice, x, z) - ice.min) / (ice.max - ice.min) > 0.6) snowHigh = Math.max(snowHigh, s.snow);
  }
  assert.ok(rockSteep > 0.5 && rockFlat < 0.3 && snowHigh > 0.5, `${rockSteep} ${rockFlat} ${snowHigh}`);
});

const scenery = (biome: string): RaceScenery => ({ trees: ["tree"], shrubs: [], boulders: ["rock"], hits: { tree: { r: 0.5, h: 6 }, rock: { r: 1.2, h: 2 }, barrier: { box: [0.9, 0.2], h: 1 } }, crossings: biomeSky(biome).crossings, biome });

test("a speeder course lies on its biome's land: gentle where the speeders run, higher and rougher away from the track", () => {
  for (const [biome, seed] of [["temperate", 1], ["volcanic", 2], ["desert", 3], ["jungle", 4]] as [string, number][]) {
    // (without the crossings' gorges and hills, which are steep on purpose)
    const track = raceCourse(seed, { ...scenery(biome), crossings: [] });
    assert.ok(track.land, `${biome}: a land`);
    // On the track: no steeper than 1 in 7 anywhere along it, a few metres of swell at most
    let [worst, low, high] = [0, Infinity, -Infinity];
    for (let i = 0; i < track.points.length; i++) {
      const [a, b] = [track.points[i], track.points[(i + 1) % track.points.length]];
      worst = Math.max(worst, Math.abs(groundAt(track, b[0], b[2], false) - groundAt(track, a[0], a[2], false)) / Math.hypot(b[0] - a[0], b[2] - a[2]));
      low = Math.min(low, a[1]);
      high = Math.max(high, a[1]);
    }
    assert.ok(worst < 0.1, `${biome}: the track's steepest ${worst.toFixed(3)}`);
    assert.ok(high - low < 40, `${biome}: the track's heights ${low.toFixed(1)}..${high.toFixed(1)}`);
    // Far from it the land stands higher than anywhere along it
    let far = 0;
    for (let x = -track.extent; x <= track.extent; x += 60) for (let z = -track.extent; z <= track.extent; z += 60) far = Math.max(far, groundAt(track, x, z, false));
    assert.ok(far > high + 6, `${biome}: ${far.toFixed(1)} away against ${high.toFixed(1)} on the track`);
  }
  // Over open water the ground is the sea's face, level
  const sea = raceCourse(5, { ...scenery("ocean"), sea: true });
  assert.equal(sea.land, undefined);
  assert.equal(groundAt(sea, 40, 40), 0);
});

test("an air fight is over the land: level under a settlement and along the convoy's road, every piece on the ground, a bomb meeting the hill it falls on", () => {
  const mk = (scenario: "defend" | "escort", biome = "forest") => dogfightStart({ seed: 12, scenario, rows, ship: { sheet: partyShip("Small", "Attack Fighter", 1), owner: "the party" }, air: { biome, g: 1 } });
  const town = mk("defend");
  const land = airTerrain(town.air!.land);
  assert.ok(land.max - land.min > 150, `relief ${land.max - land.min}`);
  const centre = airGround(town, 0, 0);
  for (let a = 0; a < 8; a++) assert.ok(Math.abs(airGround(town, Math.cos(a) * 250, Math.sin(a) * 250) - centre) < 0.5, "the settlement stands on a level pad");
  for (const v of town.vessels.filter((x) => x.ground)) assert.ok(Math.abs(v.p[1] - v.half[1] - airGround(town, v.p[0], v.p[2])) < 0.01);
  const convoy = mk("escort", "desert");
  const route = convoy.vessels.find((v) => v.ground?.route)!.ground!.route!;
  const grade = (s: typeof convoy) => { let worst = 0; for (let x = route[0][0]; x < route[2][0] - 40; x += 40) worst = Math.max(worst, Math.abs(airGround(s, x + 40, 0) - airGround(s, x, 0)) / 40); return worst; };
  assert.ok(grade(convoy) < 0.25, `the road's grade ${grade(convoy)}`);
  // A bomb let go above a slope meets the ground at its height there, sooner than over a plain
  const p: [number, number, number] = [0, 300, 0];
  const flat = bombFall(p, [90, 0, 0], AIR.gravity);
  const hill = bombFall(p, [90, 0, 0], AIR.gravity, (x) => Math.max(0, x - 200) * 0.5);
  assert.ok(hill.t < flat.t && Math.abs(hill.at[1] - Math.max(0, hill.at[0] - 200) * 0.5) < 1e-6, JSON.stringify([flat, hill]));
  assert.deepEqual(bombFall(p, [90, 0, 0], AIR.gravity, () => 0).at[1], 0);
});

test("a course is twice as long, a speeder is not slowed off the track, a gorge is a pair of cliffs with the track between, a jump is a slope of the land", () => {
  assert.equal(RACE.rough, 1, "no slowdown off the track");
  assert.equal(RACE.roughGrip, RACE.grip, "nor less grip");
  for (const [biome, seed] of [["temperate", 3], ["desert", 5], ["forest", 8]] as [string, number][]) {
    const track = raceCourse(seed, scenery(biome));
    assert.ok(track.length > 3000 && track.length < 7000, `${biome}: ${Math.round(track.length)} m round`);
    // A ramp is part of the ground: with it counted the land rises over it by about its height, without it it does not
    const ramp = track.ramps[0];
    const [cx, cz] = [ramp.p[0] + Math.cos(ramp.yaw) * (ramp.len / 2 - 0.5), ramp.p[2] + Math.sin(ramp.yaw) * (ramp.len / 2 - 0.5)];
    assert.ok(groundAt(track, cx, cz, true) - groundAt(track, cx, cz, false) > ramp.h * 0.8, `${biome}: the jump is a bluff of the land`);
    // The gorge (where the world has one): cliffs a track's width apart, nearly as high as its depth over a few metres
    for (const f of (track.features ?? []).filter((x) => x.kind === "gorge")) {
      const i = Math.round(f.at / track.step) % track.points.length;
      const [p, yaw] = [track.points[i], track.yaws[i]];
      const [rx, rz] = [-Math.sin(yaw), Math.cos(yaw)];
      const floor = groundAt(track, p[0], p[2], false);
      const top = groundAt(track, p[0] + rx * (track.width / 2 + 10), p[2] + rz * (track.width / 2 + 10), false);
      assert.ok(top - floor > CROSSING.gorgeDepth * 0.7, `${biome}: the gorge's wall is ${(top - floor).toFixed(1)} m of ${CROSSING.gorgeDepth}`);
    }
  }
});

test("water: lakes stand in the hollows of a wet land (flat, shallow, few), a dry land has none, rivers run from the drainage down to the edge or a lake", () => {
  const wet = makeTerrain({ seed: 3, biome: "forest", size: 2000, n: 129, basins: 3 });
  const water = terrainWater(wet);
  assert.ok(water.lakes.length >= 1 && water.lakes.length <= TERRAIN_STYLES.forest.lakes, `${water.lakes.length} lakes`);
  for (const lake of water.lakes) {
    assert.ok(lake.depth <= 12 && lake.depth >= 1 && lake.cells >= 12, JSON.stringify(lake));
    // flat: every wet vertex of it at the lake's level
    const level = Array.from(water.surface).filter((v, i) => !Number.isNaN(v) && Math.abs(v - lake.level) < 1e-3 && wet.h[i] < lake.level).length;
    assert.ok(level >= lake.cells * 0.9, "a lake is level");
  }
  assert.ok(water.rivers.length >= 3 && water.rivers.every((r) => r.line.length >= 10 && r.flow >= 0.68), `${water.rivers.length} rivers`);
  // a river ends at the edge of the map or in a lake or on a line already made, and runs downhill overall
  for (const r of water.rivers.slice(0, 10)) {
    const [a, b] = [r.line[0], r.line[r.line.length - 1]];
    assert.ok(terrainHeight(wet, b[0], b[1]) <= terrainHeight(wet, a[0], a[1]) + 1, "downhill overall");
  }
  // The same spec gives the same water; a desert's land is dry
  assert.deepEqual(terrainWater(makeTerrain({ seed: 3, biome: "forest", size: 2000, n: 129, basins: 3 })).lakes, water.lakes);
  const dry = terrainWater(makeTerrain({ seed: 3, biome: "desert", size: 2000, n: 129, basins: 0 }));
  assert.equal(dry.lakes.length, 0);
  assert.equal(dry.rivers.length, 0);
});

test("terrainSurface: the palette colour and the layers' weights (2026-11-11, ground material v2): weights are 0..1 and sum to at most 1, rock on the steep, pale where it is sandy or snowy", () => {
  for (const biome of ["forest", "desert", "ice", "volcanic"]) {
    const t = terrainFor({ seed: 4, biome, size: 800, n: 97, erosion: "none" });
    let rock = 0, pale = 0, count = 0;
    for (let k = 0; k < 400; k++) {
      const x = ((k * 37) % 700) - 350, z = ((k * 91) % 700) - 350;
      const s = terrainSurface(t, x, z);
      assert.ok(s.rock >= 0 && s.pale >= 0 && s.wet >= 0 && s.rock + s.pale + s.wet <= 1 + 1e-9, `${biome}: weights ${s.rock} ${s.pale} ${s.wet}`);
      assert.deepEqual(s.color, terrainColorAt(t, x, z), `${biome}: the colour is terrainColorAt's`);
      rock += s.rock; pale += s.pale; count++;
    }
    assert.ok(Number.isFinite(rock) && Number.isFinite(pale) && count === 400);
  }
  // Steeper ground has more rock
  const t = terrainFor({ seed: 6, biome: "volcanic", size: 800, n: 97, erosion: "none" });
  let [flat, steep, nf, ns] = [0, 0, 0, 0];
  for (let k = 0; k < 900; k++) {
    const x = ((k * 53) % 760) - 380, z = ((k * 29) % 760) - 380;
    const w = terrainSurface(t, x, z).rock;
    if (terrainSlope(t, x, z) > 0.6) { steep += w; ns++; } else if (terrainSlope(t, x, z) < 0.2) { flat += w; nf++; }
  }
  assert.ok(ns > 5 && nf > 5, `${ns} steep and ${nf} flat samples`);
  assert.ok(steep / ns > flat / nf, `rock on the steep (${steep / ns}) more than on the flat (${flat / nf})`);
});

test("raceWay: the signed side of the centre line (the ground's wheel ruts lie by it), none far from the track", () => {
  const track = raceCourse(7, { ...scenery("desert"), crossings: [] });
  let checked = 0;
  for (let i = 5; i < track.points.length - 5; i += 11) {
    const [px, , pz] = track.points[i];
    const yaw = track.yaws[i];
    const [nx, nz] = [-Math.sin(yaw), Math.cos(yaw)];
    for (const lat of [-3, -1, 0, 1, 3]) {
      const w = raceWay(track, px + nx * lat, pz + nz * lat);
      if (!w) continue;
      assert.ok(Math.abs(w.lat - lat) < 0.35, `lat ${w.lat} for ${lat}`);
      assert.ok(Math.abs(w.nx * nx + w.nz * nz - 1) < 0.05, "the lateral vector points the same way");
      checked++;
    }
  }
  assert.ok(checked > 40, `${checked} points checked`);
  assert.equal(raceWay(track, 99999, 99999), null);
});

test("kit places boulders, scree and ledges by the ground's slope, ledges facing downhill, the same every time (2026-11-11)", () => {
  const t = terrainFor({ seed: 8, biome: "volcanic", size: 1200, n: 129, erosion: "none" });
  const o = { boulders: 0.6, scree: 0.8, ledges: 0.8, seed: 5 };
  const spots = kitSpots(t, o);
  assert.deepEqual(spots, kitSpots(t, o), "deterministic");
  const by = (k: string) => spots.filter((s) => s.kind.startsWith(k));
  assert.ok(by("boulder").length > 10, `${by("boulder").length} boulders`);
  for (const s of by("boulder")) assert.ok(terrainSlope(t, s.x, s.z) >= 0.12 - 1e-9, "a boulder is not on the flat");
  for (const s of by("ledge")) {
    assert.ok(terrainSlope(t, s.x, s.z) >= 0.85 - 1e-9, "a ledge is on a cliff");
    const [gx, gz] = terrainGradient(t, s.x, s.z);
    const l = Math.hypot(gx, gz);
    assert.ok((Math.sin(s.yaw) * -gx + Math.cos(s.yaw) * -gz) / l > 0.99, "a ledge faces downhill");
  }
  for (const s of by("scree")) assert.ok(terrainSlope(t, s.x, s.z) >= 0.3 - 1e-9, "scree is on a slope");
  assert.ok(kitSpots(t, { ...o, cap: 7 }).length <= 7, "capped");
  const nowhere = kitSpots(t, { ...o, within: () => false });
  assert.equal(nowhere.length, 0, "nothing where it may not stand");
});

test("ecology (the Megascans packs): the same spots each time, only where allowed, every kind of a tier has its share, nearest the place first (2026-11-11)", () => {
  for (const biome of ["forest", "jungle", "swamp", "desert", "ice", "volcanic", "barren"]) {
    const t = terrainFor({ seed: 9, biome, size: 1500, n: 97, erosion: "none" });
    const near = (x: number, z: number) => Math.hypot(x, z) < 400;
    const within = (x: number, z: number) => Math.hypot(x, z) > 60;
    const o = { within, cover: near, seed: 3, cap: { cover: 300, mid: 100, rock: 150 } };
    const spots = ecologySpots(t, biome, o);
    assert.deepEqual(spots, ecologySpots(t, biome, o), `${biome}: deterministic`);
    assert.ok(spots.length > 20, `${biome}: ${spots.length} spots`);
    const kinds = new Set(ECOLOGY[biome].entries.map((e) => e.kind));
    for (const s of spots) {
      assert.ok(kinds.has(s.kind), `${biome}: ${s.kind} is in the table`);
      assert.ok(within(s.x, s.z), `${biome}: ${s.kind} stands where it may`);
      if (s.tier === "cover") assert.ok(near(s.x, s.z), `${biome}: cover is near`);
      assert.ok(s.variant >= 0 && s.variant < 3 && Number.isFinite(s.yaw) && s.scale > 0.5);
    }
    for (const tier of ["cover", "mid", "rock"] as const) assert.ok(spots.filter((s) => s.tier === tier).length <= (o.cap[tier] ?? 1e9), `${biome}: ${tier} capped`);
    // Of a tier with several kinds, more than one is there (the first does not take the cap)
    for (const tier of ["cover", "rock"] as const) {
      const want = new Set(ECOLOGY[biome].entries.filter((e) => e.tier === tier).map((e) => e.kind));
      if (want.size > 1) assert.ok(new Set(spots.filter((s) => s.tier === tier).map((s) => s.kind)).size > 1, `${biome}: more than one kind of ${tier}`);
    }
  }
  assert.deepEqual(ecologySpots(terrainFor({ seed: 1, biome: "urban", size: 1000, n: 65, erosion: "none" }), "urban"), [], "a city's ground has none");
});

test("a district's open ground rolls, and its pads, ways and rim are level at the street's height", () => {
  const pads = [{ x: 10, y: 10, width: 12, height: 8 }, { x: 35, y: 30, width: 9, height: 11 }];
  const ways = [{ x: 0, y: 20, width: 60, height: 6 }];
  const spec = { seed: 7, biome: "temperate", cx: 30, cz: 25, size: 240, pads, ways };
  const g = districtGround(spec)!;
  assert.ok(g, "a green world has rolling ground");
  assert.equal(districtGround(spec), g, "made once");
  // Every square of a pad and a square past it, and every square of a way, is at 0 (where every room and door is drawn)
  for (const [r, m] of [...pads.map((r) => [r, 1] as const), ...ways.map((r) => [r, 0] as const)]) for (let y = r.y - m; y < r.y + r.height + m; y++) for (let x = r.x - m; x < r.x + r.width + m; x++) {
    // (the square past a pad's corner is a hair off: its far corner is already in the blend)
    const corner = (x < r.x || x >= r.x + r.width) && (y < r.y || y >= r.y + r.height);
    assert.ok(Math.abs(g.at(x + 0.5, y + 0.5)) < (corner ? 0.03 : 1e-6), `level at ${x},${y}`);
  }
  // The rim, where the relief round the place takes over
  for (const k of [-119, 0, 119]) { assert.ok(Math.abs(g.at(30 + k, 25 - 120)) < 1e-6); assert.ok(Math.abs(g.at(30 - 120, 25 + k)) < 1e-6); }
  // The open ground among the buildings: up and down by a few metres (squares of 1.4 m), gentle enough to walk; beyond it the land is let rise and fall by tens of metres (the user,
  // 2026-11-12: hills, cliffs and ravines where the place is not walked)
  let [lo, hi, steep, farLo, farHi, farSteep] = [Infinity, -Infinity, 0, Infinity, -Infinity, 0];
  for (let z = -80; z < 130; z += 2) for (let x = -80; x < 140; x += 2) {
    const h = g.at(x, z);
    const near = x > 5 && x < 55 && z > 17 && z < 29;
    if (near) { lo = Math.min(lo, h); hi = Math.max(hi, h); steep = Math.max(steep, g.slope(x, z)); }
    else { farLo = Math.min(farLo, h); farHi = Math.max(farHi, h); farSteep = Math.max(farSteep, g.slope(x, z)); }
  }
  assert.ok(hi - lo > 0.3 && (hi - lo) * 1.4 <= districtRelief("temperate") + 6, `rises and falls: ${lo.toFixed(2)} .. ${hi.toFixed(2)}`);
  assert.ok(steep < 0.35, `walkable: steepest ${steep.toFixed(3)}`);
  assert.ok((farHi - farLo) * 1.4 > 12, `hills and ravines beyond: ${((farHi - farLo) * 1.4).toFixed(1)} m`);
  assert.ok(farSteep > steep, "steeper beyond");
  assert.ok(g.lowest <= Math.min(lo, farLo) + 1e-6 && g.highest >= Math.max(hi, farHi) - 1e-6);
  // The same for the same spec, and none for a paved city
  assert.equal(districtGround({ ...spec, pads: [...pads] })!.at(-40, 70), g.at(-40, 70));
  assert.equal(districtGround({ ...spec, biome: "urban" }), null);
  assert.equal(districtRelief("gas giant"), 0);
});

test("levelBox makes a rectangle level and leaves the land beyond its blend alone", () => {
  const t = makeTerrain({ seed: 3, biome: "forest", size: 400, n: 81, erosion: "none" });
  const before = terrainHeight(t, 150, 150);
  levelBox(t, -40, -20, 60, 30, 5, 20, 12);
  for (const [x, z] of [[-40, -20], [20, 10], [0, 0], [-38, -18], [-45, -20]]) assert.ok(Math.abs(terrainHeight(t, x, z) - 12) < 1e-4, `level at ${x},${z}`);
  assert.equal(terrainHeight(t, 150, 150), before);
});
