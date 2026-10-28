// The trip (2026-10-27; shared/logic/roadtrip.ts and the road in raceCourse): an open road from a start to a last gate, its legs and their ground, the
// roadblock (stopped at, opened, rammed), the crewmate (driving while the party fires, or firing while the party drives), the trip's time.
import test from "node:test";
import assert from "node:assert/strict";
import { CHASE, chaseResult, raceCourse, roadAt, roadStart, settleBlock, stepRace, type Race, type RaceScenery, type RaceTrack, type World } from "../../shared/logic/index";
import { BIOME_LINKS, blockPursuit, crewmate, legCount, legPar, planTrip, settleStop, driveMinutes, type Block } from "../../shared/logic/roadtrip";

const scenery: RaceScenery = {
  trees: ["tree"], shrubs: ["shrub"], boulders: ["rock"],
  hits: { tree: { r: 0.5, h: 6 }, rock: { r: 1.2, h: 2 }, crate_stack: { box: [0.55, 0.45], h: 1, breaks: true, mass: 0.15 }, barrier: { box: [1, 0.2], h: 0.55 } },
};
const area = (id: string, kind: string, type: string, parentId?: string, extra: Record<string, unknown> = {}) => ({ id, kind, type, name: id, parentId, tags: [], occupants: [], ships: [], loot: [], position: { x: 0, y: 0, z: 0 }, danger: 0, ...extra });
const worldIn = (region: string, faction = "") => ({
  era: "galactic-civil-war", antagonist: "Black Sun",
  areas: { g: area("g", "galaxy", "galaxy"), r: area("r", "region", region, "g", { name: region }), y: area("y", "system", "star", "r"), p: area("p", "planet", "forest", "y", { faction }), s: area("s", "settlement", "town", "p") },
  paths: [],
}) as unknown as World;

const auto = { steer: { x: 0, y: 0 }, throttle: 0 as const, auto: true };
const run = (race: Race, track: RaceTrack, input: Parameters<typeof stepRace>[2], seconds: number, until?: (r: Race) => boolean) => {
  let now = race;
  for (let t = 0; t < seconds && !now.over && !(until && until(now)); t += 0.1) now = stepRace(now, track, input, 0.1);
  return now;
};

test("a road is a way from the start to its last gate, not a lap", () => {
  for (const seed of [3, 11, 25, 40]) {
    const track = raceCourse(seed, scenery, 1, {});
    assert.ok(track.road && track.road.finish >= 600 && track.road.finish <= track.length - 100, `finish ${track.road?.finish} of ${track.length}`);
    const last = track.gates[track.gates.length - 1];
    assert.equal(last.s, track.road!.finish);
    assert.ok(track.gates.every((g, i) => i === 0 || g.s > track.gates[i - 1].s), "the gates run in order");
    assert.ok(track.hazards.every((h) => h.kind !== "mine"), "no mines on a public road");
    const start = roadStart(track, seed, "Landspeeder");
    const end = run(start, track, auto, 240);
    const me = end.racers.find((r) => r.party)!;
    assert.ok(me.finish !== null && end.over, `seed ${seed}: reached the last gate (gates ${me.gates} of ${end.gateCount}, hull ${me.hull}, t ${end.t.toFixed(0)})`);
    assert.equal(me.gates, end.gateCount, "the finish is the last gate, not the start line again");
    assert.ok(roadAt(track, me) > track.road!.finish - 30, `it is at the end of the road (${roadAt(track, me).toFixed(0)} of ${track.road!.finish})`);
  }
});

test("a road is the same from the same seed and differs between legs' seeds", () => {
  const a = raceCourse(9, scenery, 1, { block: true });
  const b = raceCourse(9, scenery, 1, { block: true });
  const c = raceCourse(10, scenery, 1, { block: true });
  assert.deepEqual(a.road, b.road);
  assert.notDeepEqual(a.points[40], c.points[40]);
});

test("the trip's legs: two to five by the kilometres, the planet's own ground at both ends, its neighbours between", () => {
  assert.equal(legCount(3), 2);
  assert.equal(legCount(14), 2);
  assert.equal(legCount(28), 4);
  assert.equal(legCount(400), 5);
  const world = worldIn("Core");
  const seen = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) {
    const legs = planTrip(world, "s", { km: 35, biome: "forest", level: 3, seed });
    assert.equal(legs.length, 5);
    assert.equal(legs[0].biome, "forest");
    assert.equal(legs[4].biome, "forest");
    assert.ok(legs[3].biome === "forest" || BIOME_LINKS.forest.includes(legs[3].biome), "the leg before the last joins the planet's own ground");
    for (let i = 1; i < legs.length; i++) assert.ok(legs[i].biome === legs[i - 1].biome || BIOME_LINKS[legs[i - 1].biome].includes(legs[i].biome), `${legs[i - 1].biome} to ${legs[i].biome}`);
    legs.forEach((l) => seen.add(l.biome));
    assert.deepEqual(legs, planTrip(world, "s", { km: 35, biome: "forest", level: 3, seed }), "the same trip is the same");
  }
  assert.ok(seen.size >= 3, `the ground changes along the way: ${[...seen].join(", ")}`);
});

test("what is met: roadblocks more often where the law is, checkpoints of the law or a gang's gate; never on the last leg; the ambush not on its pursuit's leg", () => {
  const rate = (w: World, o: Partial<Parameters<typeof planTrip>[2]> = {}) => {
    const trips = Array.from({ length: 300 }, (_, i) => planTrip(w, "s", { km: 28, biome: "desert", level: 3, seed: i + 1, ...o }));
    return { blocks: trips.map((t) => t.find((l) => l.block)?.block).filter(Boolean) as Block[], trips };
  };
  const core = rate(worldIn("Core", "Galactic Empire"));
  const wild = rate(worldIn("Wild Space", "Hutt Cartel"));
  assert.ok(core.blocks.length > 0 && core.blocks.every((b) => b.by === "checkpoint"), "the law keeps checkpoints");
  assert.ok(wild.blocks.length > 0 && wild.blocks.every((b) => b.by === "toll"), "a lawless road has toll gates");
  const wanted = rate(worldIn("Core", "Galactic Empire"), { wanted: true });
  assert.ok(wanted.blocks.length > core.blocks.length, "a wanted party meets more of them");
  assert.ok(wanted.blocks.every((b) => b.wanted));
  for (const t of [...core.trips, ...wild.trips, ...wanted.trips]) {
    assert.equal(t.filter((l) => l.block).length <= 1, true);
    assert.ok(!t[t.length - 1].block, "the roadblock is never on the last leg");
    const blockAt = t.findIndex((l) => l.block);
    if (blockAt >= 0 && t.length > 2) assert.ok(!t[blockAt + 1].ambush, "the leg the roadblock's riders chase on holds no other ambush");
  }
  const forced = planTrip(worldIn("Core", "Galactic Empire"), "s", { km: 20, biome: "forest", level: 3, seed: 5, always: "both" });
  assert.ok(forced.some((l) => l.block) && forced.some((l) => l.ambush));
});

test("at a roadblock: pay (not when the law knows the party), talk against the DC, or run", () => {
  const fee: Block = { by: "checkpoint", who: "x checkpoint", fee: 40, dc: 13, wanted: false, model: "Speederbike" };
  assert.deepEqual(settleStop(fee, "pay", { roll: 0, bonus: 0, credits: 100 }), { outcome: "open", paid: 40, note: "40 credits paid; the barrier is opened." });
  assert.equal(settleStop(fee, "pay", { roll: 0, bonus: 0, credits: 10 }).outcome, "refused");
  assert.equal(settleStop({ ...fee, wanted: true }, "pay", { roll: 0, bonus: 0, credits: 1000 }).outcome, "refused");
  assert.equal(settleStop(fee, "talk", { roll: 10, bonus: 3, credits: 0 }).outcome, "open");
  assert.equal(settleStop(fee, "talk", { roll: 9, bonus: 3, credits: 0 }).outcome, "refused");
  assert.equal(settleStop(fee, "pay", { roll: 0, bonus: 0, credits: 100, raised: true }).paid, 60, "a failed talk raises the fee by half");
  assert.equal(settleStop(fee, "run", { roll: 0, bonus: 0, credits: 0 }).outcome, "run");
  const world = worldIn("Core", "Galactic Empire");
  assert.equal(blockPursuit(world, fee).by, "patrol");
  assert.equal(blockPursuit(world, { ...fee, by: "toll" }).by, "pirates");
});

// A road with a roadblock, and a crewmate to drive it: the autopilot brakes short of the barrier and the party is stopped there
const blocked = () => {
  for (let seed = 1; seed < 40; seed++) {
    const track = raceCourse(seed, scenery, 1, { block: true });
    if (track.road?.block) return { track, seed };
  }
  throw new Error("no roadblock laid");
};

test("a roadblock: crates across the road; stopped at it the party opens it and goes on to the last gate", () => {
  const { track, seed } = blocked();
  const blk = track.road!.block!;
  assert.ok(blk.props.length >= 6, `${blk.props.length} crates across ${track.width} m`);
  assert.ok(blk.at < track.road!.finish - 100, "it stands well before the end");
  const race = roadStart(track, seed, "Landspeeder", { mate: { name: "Mira", pace: 0.95 } });
  assert.equal(race.block?.state, "ahead");
  const stopped = run(race, track, auto, 200, (r) => r.block?.state !== "ahead");
  assert.equal(stopped.block?.state, "stopped", `stopped short of it (${stopped.block?.state}, at ${roadAt(track, stopped.racers[0]).toFixed(0)} of ${blk.at.toFixed(0)}, t ${stopped.t.toFixed(0)})`);
  const me = stopped.racers.find((r) => r.party)!;
  assert.ok(roadAt(track, me) < blk.at + 1 && me.hull === me.hullMax, "no damage taken: it stopped, it did not crash");
  assert.ok(Math.abs(me.craft.speed) < 2.6, `at rest when the page is asked (${me.craft.speed.toFixed(1)} m/s): a step that stops the party takes no more ticks`);
  assert.equal(stepRace(stopped, track, auto, 0.5).t, stopped.t, "a race stopped at the roadblock takes no more ticks until it is answered");
  // The sim is not run while the page asks; once it is opened the crates are gone and the road goes on
  const open = settleBlock(stopped, track, "open");
  assert.equal(open.block?.state, "open");
  assert.ok(blk.props.every((id) => open.broken.includes(id)));
  const end = run(open, track, auto, 240);
  assert.ok(end.racers.find((r) => r.party)!.finish !== null, "it reached the last gate");
});

test("a roadblock rammed at speed is broken through, at a cost in hull", () => {
  const { track, seed } = blocked();
  // No crewmate: the autopilot drives at full pace and does not stop
  const end = run(roadStart(track, seed, "Landspeeder"), track, auto, 240);
  const me = end.racers.find((r) => r.party)!;
  assert.ok(["ran", "run"].includes(end.block!.state) || me.finish !== null, end.block!.state);
  assert.ok(end.log.some((l) => /smash through a crate/.test(l)), end.log.join(" | "));
  assert.ok(me.finish !== null || me.wrecked, "and drives on");
  // Stopped and then ramming it: the choice 'run'
  const { track: t2, seed: s2 } = blocked();
  const stopped = run(roadStart(t2, s2, "Landspeeder", { mate: { name: "Mira", pace: 0.95 } }), t2, auto, 200, (r) => r.block?.state !== "ahead");
  const go = settleBlock(stopped, t2, "run");
  assert.equal(go.block?.state, "run");
  assert.ok(t2.road!.block!.props.every((id) => !go.broken.includes(id)), "its crates are still there to be hit");
  assert.equal(settleBlock(go, t2, "open"), go, "once chosen it is not chosen again");
});

test("a chase on a road is out to its last gate; the party at the gun with a crewmate driving fires round the circle; at the wheel with a crewmate firing", () => {
  const track = raceCourse(6, scenery, 1, {});
  const mate = { name: "Mira", pace: 0.95 };
  const riders = [{ name: "Rider A", model: "Swoop bike" }, { name: "Rider B", model: "Swoop bike" }];
  // The crewmate drives; the party shoots at a rider behind it (aim round to the tail)
  let race = roadStart(track, 6, "Landspeeder", { riders, who: "swoop gang", mate });
  assert.equal(race.chase?.who, "swoop gang");
  let hits = 0;
  let shots = 0;
  for (let t = 0; t < 60 && !race.over; t += 0.1) {
    const me = race.racers.find((r) => r.party)!;
    const near = race.racers.filter((r) => r.hostile && !r.wrecked).sort((a, b) => Math.hypot(a.craft.p[0] - me.craft.p[0], a.craft.p[2] - me.craft.p[2]) - Math.hypot(b.craft.p[0] - me.craft.p[0], b.craft.p[2] - me.craft.p[2]))[0];
    const aim = near ? Math.atan2(near.craft.p[2] - me.craft.p[2], near.craft.p[0] - me.craft.p[0]) - me.craft.yaw : 0;
    race = stepRace(race, track, { ...auto, fire: true, aim }, 0.1);
    for (const e of race.events) if (e.kind === "shot" && e.by === me.id) { shots++; hits += e.power; }
  }
  assert.ok(shots > 3, `the gun fired (${shots})`);
  assert.ok(hits > 0, `and hit something (${hits} of ${shots})`);
  // The party drives (no `auto`); the crewmate's gun fires on the riders in reach
  race = roadStart(track, 6, "Landspeeder", { riders, who: "swoop gang", mate });
  const me = race.racers.find((r) => r.party)!;
  const rider = race.racers.find((r) => r.hostile)!;
  rider.craft.p = [me.craft.p[0] - Math.cos(me.craft.yaw) * 18, me.craft.p[1], me.craft.p[2] - Math.sin(me.craft.yaw) * 18];
  let mateShots = 0;
  for (let t = 0; t < 20 && !race.over; t += 0.1) {
    const m = race.racers.find((r) => r.party)!;
    race.racers.filter((r) => r.hostile).forEach((r, i) => { r.craft.p = [m.craft.p[0] - Math.cos(m.craft.yaw) * (14 + i * 3), r.craft.p[1], m.craft.p[2] - Math.sin(m.craft.yaw) * (14 + i * 3)]; });
    race = stepRace(race, track, { steer: { x: 0, y: 0 }, throttle: 1 }, 0.1);
    mateShots += race.events.filter((e) => e.kind === "shot" && e.by === m.id).length;
  }
  assert.ok(mateShots >= 3, `the crewmate fired without the party's fire button (${mateShots})`);
  assert.ok(CHASE.mate.hit < CHASE.partyHit, "but not as true as the party's own aim");
  assert.ok(["escaped", "beaten", "caught"].includes(chaseResult(race).outcome));
});

test("the crewmate: the first companion on their feet that is not a beast; droids drive best", () => {
  assert.equal(crewmate([]), undefined);
  assert.deepEqual(crewmate([{ name: "Rex", kind: "beast" }, { name: "R2", kind: "droid" }]), { name: "R2", pace: 0.97 });
  assert.equal(crewmate([{ name: "Down", hp: 0 }, { name: "Ana", kind: "hired" }])?.name, "Ana");
});

test("the trip's time: quicker for a clean drive, slower for a wrecked leg, never beyond a fifth less or half again", () => {
  const par = legPar(1500);
  assert.ok(par > 55 && par < 65, `${par}`);
  assert.equal(driveMinutes(100, [{ par, took: par }, { par, took: par }]), 100);
  assert.equal(driveMinutes(100, [{ par, took: par * 0.5 }, { par, took: par * 0.5 }]), 80);
  assert.equal(driveMinutes(100, [{ par, took: par }, { par, took: null }]), 125);
  assert.equal(driveMinutes(100, [{ par, took: null }]), 150);
  assert.equal(driveMinutes(100, []), 100);
});
