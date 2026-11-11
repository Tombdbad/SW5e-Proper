// The terrain (shared/logic/terrain.ts, 2026-11-10): the same ground for the same seed, a height field of the biome's own kind, weathered without
// losing what it should keep, level where something is built, and the ground of a speeder course and of an air fight made from it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  TERRAIN_STYLES, makeTerrain, terrainFor, terrainHeight, terrainSlope, terrainColorAt, terrainSplat, levelDisc, levelRoad, scatterOn, thermalSettle, streamPower, terrainWater,
  raceCourse, groundAt, biomeSky, RACE, CROSSING, type RaceScenery, type Terrain,
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
