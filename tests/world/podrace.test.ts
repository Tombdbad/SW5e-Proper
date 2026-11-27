// Pod racing (2026-11-27; shared/logic "Pod racing", house rules): the long course and its sections, the pods' heat, fire and repair, rock
// walls that stop a pod at 800 km/h, the field of rivals, and what a race and a bet pay.
import test from "node:test";
import assert from "node:assert/strict";
import { POD, POD_MAKES, POD_PILOTS, biomeSky, canyonWall, groundAt, podWorld, podCourse, podField, podResult, podStart, raceDistance, raceOrder, stepRace, tunnelCeiling, type Race, type RaceInput, type RaceScenery, type RaceTrack } from "@shared/logic";
import { podOdds } from "@shared/logic/pitbets";
import { jobsOf } from "@shared/logic/contracts";

// What stands by a pod course and how it is struck (the library's shapes, siteAssets.tsx, at size 1)
const scenery = (biome: string): RaceScenery => ({
  trees: ["tree"], shrubs: ["shrub"], boulders: ["rock"], crossings: biomeSky(biome).crossings, biome,
  hits: { tree: { r: 0.5, h: 6 }, rock: { r: 1.2, h: 2 }, rock_pillar: { r: 3.6, h: 26 }, rock_arch: { r: 5, pair: 30, h: 34 }, pod_stand: { box: [20, 6], h: 14 }, pod_hangar: { box: [14, 10], h: 16 }, start_arch: { r: 1.5, pair: 25, h: 18 } },
});
const tracks = new Map<number, RaceTrack>();
const course = (seed: number) => tracks.get(seed) ?? (tracks.set(seed, podCourse(seed, scenery(seed % 2 ? "desert" : "barren"))), tracks.get(seed)!);
const still: RaceInput = { steer: { x: 0, y: 0 }, throttle: 0 };
const run = (race: Race, track: RaceTrack, input: RaceInput, seconds: number) => {
  let now = race;
  for (let t = 0; t < seconds && !now.over; t += 1 / 30) now = stepRace(now, track, input, 1 / 30);
  return now;
};
const latOf = (track: RaceTrack, race: Race) => {
  const me = race.racers.find((r) => r.party)!;
  const yaw = track.yaws[me.at];
  return -(me.craft.p[0] - track.points[me.at][0]) * Math.sin(yaw) + (me.craft.p[2] - track.points[me.at][2]) * Math.cos(yaw);
};

test("a pod course is a loop of 10-12 km, 44 m wide, with no bend tighter than about 110 m, its tunnel, canyon, jump and spires, the same on the same seed", () => {
  for (const seed of [1, 2, 3]) {
    const track = course(seed);
    assert.ok(track.pod && track.width === POD.width);
    assert.ok(track.length > 9500 && track.length < 12500, `seed ${seed}: a lap of ${Math.round(track.length)} m`);
    assert.ok(Math.max(...track.bends) < 1 / 100, `seed ${seed}: the tightest bend is ${Math.round(1 / Math.max(...track.bends))} m`);
    const s = track.sections!;
    assert.ok(s.tunnel && s.canyon && s.jump && s.spires, `seed ${seed}: every section is laid`);
    const spans = [s.tunnel!, s.canyon!, s.jump!, s.spires!].sort((a, b) => a[0] - b[0]);
    spans.forEach((span, i) => {
      assert.ok(span[0] > 600 && span[1] < track.length - 300, `seed ${seed}: clear of the start`);
      if (i) assert.ok(span[0] > spans[i - 1][1], `seed ${seed}: the sections do not overlap`);
    });
    assert.equal(track.gates.length, POD.gates);
    assert.ok(!track.features?.some((f) => f.kind === "gorge" || f.kind === "hill"), "no speeder's gorge or hill on a pod course");
    // The stands, the hangars, the start gantry and the arches; spires on the way in the field, each marked for the rivals
    for (const key of ["pod_stand", "pod_hangar", "start_arch", "rock_arch"]) assert.ok(track.props.some((p) => p.key === key), `seed ${seed}: a ${key}`);
    const spires = track.marks.filter((m) => m.prop !== undefined && track.props[m.prop].key === "rock_pillar");
    assert.ok(spires.length >= 4 && spires.every((m) => m.at * track.step > s.spires![0] && m.at * track.step < s.spires![1]));
  }
  const again = podCourse(2, scenery("barren"));
  assert.equal(again.length, course(2).length);
  assert.equal(again.props.length, course(2).props.length);
});

test("the canyon's cliffs stand by the way and the tunnel has a ceiling 16 m over it", () => {
  const track = course(1);
  const canyon = track.features!.find((f) => f.kind === "canyon")!;
  const i = Math.round(canyon.at / track.step);
  const [p, yaw] = [track.points[i], track.yaws[i]];
  const wall = canyonWall(canyon, canyon.at);
  const at = (lat: number) => [p[0] - Math.sin(yaw) * lat, p[2] + Math.cos(yaw) * lat] as const;
  const ground = (lat: number) => groundAt(track, ...at(lat));
  assert.ok(Math.abs(ground(0) - p[1]) < 1, "the way itself is level with the track");
  assert.ok(ground(wall + 25) - p[1] > canyon.depth * 0.6, `the cliff stands ${Math.round(ground(wall + 25) - p[1])} m over the way`);
  const tunnel = track.features!.find((f) => f.kind === "tunnel")!;
  const j = Math.round(tunnel.at / track.step);
  assert.ok(Math.abs(tunnelCeiling(track, track.points[j][0], track.points[j][2]) - (track.points[j][1] + 16)) < 0.01, "a ceiling 16 m up in the tunnel");
  assert.equal(tunnelCeiling(track, track.points[i][0], track.points[i][2]), Infinity, "none over the canyon");
});
test("boost heats the engines; one that reaches its limit catches fire, pulls the pod to its side and burns the hull until Repair puts it out", () => {
  const track = course(2);
  let race = podStart(track, 2, "ring");
  race = { ...race, racers: race.racers.map((r) => (r.party ? { ...r, heat: [0.97, 0.6] as [number, number] } : r)) };
  race = run(race, track, still, 3);
  const before = race.racers.find((r) => r.party)!;
  assert.ok(before.craft.speed > 60, "under way");
  const hot = run(race, track, { ...still, boost: true }, 2);
  const me = hot.racers.find((r) => r.party)!;
  assert.deepEqual(me.fire, [true, false], "the left engine is alight");
  assert.ok(hot.log.some((l) => /Your left engine catches fire/.test(l)));
  assert.ok(!me.boosting, "no boost on a burning engine");
  // The burning engine gives a third of its thrust: the pod swings toward it (the left: yaw falls) with the stick let go
  assert.ok(me.spin < -0.05, `pulled to the left (${me.spin.toFixed(2)} rad/s)`);
  const burnt = run(hot, track, still, POD.burn * 2 + 0.2);
  assert.ok(burnt.racers.find((r) => r.party)!.hull <= me.hull - 2, "the fire burns the hull");
  const fixing = run(burnt, track, { ...still, repair: true }, 0.2);
  assert.ok(fixing.racers.find((r) => r.party)!.fixing! > 0, "a repair under way");
  const fixed = run(fixing, track, still, POD.repair + 0.2);
  const after = fixed.racers.find((r) => r.party)!;
  assert.deepEqual(after.fire, [false, false]);
  assert.ok(after.heat!.every((h) => h <= POD.after + 0.01));
  assert.ok(fixed.log.some((l) => /You put the fire out/.test(l)));
});

test("a pod driven at full boost into the canyon's cliff is stopped by it and hurt, never carried through the rock", () => {
  const track = course(1);
  const canyon = track.features!.find((f) => f.kind === "canyon")!;
  const i = Math.round(canyon.at / track.step);
  const p = track.points[i];
  const yaw = track.yaws[i] + 0.35;
  let race = podStart(track, 1, "arrow");
  race = { ...race, racers: race.racers.map((r) => (r.party ? { ...r, craft: { ...r.craft, p: [p[0], p[1] + POD.hover, p[2]], yaw, speed: 220 }, v: [Math.cos(yaw) * 220, 0, Math.sin(yaw) * 220], at: i, gates: track.gates.filter((g) => g.s <= i * track.step).length } : r)) };
  let deepest = 0;
  let now = race;
  for (let t = 0; t < 2.5 && !now.over; t += 1 / 30) {
    now = stepRace(now, track, { ...still, boost: true }, 1 / 30);
    const me = now.racers.find((r) => r.party)!;
    deepest = Math.max(deepest, raceDistance(track, me.craft.p[0], me.craft.p[2]));
  }
  const me = now.racers.find((r) => r.party)!;
  assert.ok(deepest < canyonWall(canyon, canyon.at) + 10, `the pod got no further than ${deepest.toFixed(1)} m off the middle`);
  assert.ok(me.hull < me.hullMax, "the cliff hurt it");
  assert.ok(now.log.some((l) => /rock/.test(l)));
});

test("a podrace runs at 1/180 s: three laps for the party on the rivals' driving, finished in time, most of the field still racing", () => {
  const track = course(2);
  let race = podStart(track, 2, "ring");
  assert.equal(race.racers.length, POD_PILOTS.length + 1);
  assert.deepEqual(race.racers.filter((r) => !r.party).map((r) => r.name).sort(), podField(2).map((p) => p.name).sort());
  assert.ok(race.racers.every((r) => r.kind === "pod" && r.hull === POD_MAKES[r.make!].hull));
  race = run(race, track, { ...still, auto: true }, 400);
  const me = race.racers.find((r) => r.party)!;
  assert.ok(race.over && me.finish !== null, "the party finishes");
  assert.ok(me.finish! < race.limit && me.finish! > 120 && me.finish! < 260, `three laps in ${me.finish!.toFixed(0)} s`);
  assert.ok(race.racers.filter((r) => !r.wrecked).length >= 5, `${race.racers.filter((r) => r.wrecked).length} pods wrecked`);
  const order = raceOrder(race);
  assert.equal(order[0].finish !== null ? order[0].id : -1, me.id);
});

test("a podrace pays the purse of the party's place, and a bet on the winner its price", () => {
  const track = course(3);
  const race = podStart(track, 3, "brute");
  const done: Race = { ...race, over: true, racers: race.racers.map((r, k) => ({ ...r, finish: r.party ? 200 : k === 1 ? 190 : null })) };
  const winner = done.racers[1].name;
  const r = podResult(done, { on: winner, stake: 100, pays: 4.5 });
  assert.equal(r.place, 2);
  assert.equal(r.purse, POD.prizes[1]);
  assert.equal(r.winnings, 450);
  assert.equal(r.winner, winner);
  assert.match(r.note, /house rules/);
  assert.equal(podResult(done, { on: "You", stake: 100, pays: 3 }).winnings, 0, "a bet on yourself is lost when you come second");
  const dnf: Race = { ...done, racers: done.racers.map((x) => (x.party ? { ...x, finish: null, wrecked: true } : x)) };
  assert.equal(podResult(dnf).purse, 0);
});

test("the bookmaker's board: every pilot priced, the chances sum to one, the faster pilot the shorter price, a reckless one longer", () => {
  const board = podOdds(podField(4));
  assert.equal(board.length, POD_PILOTS.length + 1);
  assert.equal(board[0].name, "You");
  assert.ok(Math.abs(board.reduce((s, p) => s + p.chance, 0) - 1) < 1e-9);
  const price = (name: string) => board.find((p) => p.name === name)!.pays;
  assert.ok(price("Mira Kesh") < price("Old Tolluk"), "the quickest is the favourite");
  const [a, b] = podOdds([{ name: "steady", pace: 0.97, margin: 0.9 }, { name: "reckless", pace: 0.97, margin: 1.06 }]).slice(1);
  assert.ok(a.pays < b.pays, "the pilot who sets the engines alight is a longer price");
  assert.ok(board.every((p) => p.pays >= 1.1 && p.pays * p.chance <= 0.95 + 0.06), "less the house's cut");
});

test("podraces are held on desert, rocky and volcanic worlds, offered there by pilots, mechanics and promoters", () => {
  assert.ok(podWorld("desert") && podWorld("barren") && podWorld("volcanic"));
  assert.ok(!podWorld("temperate") && !podWorld("ocean") && !podWorld(undefined));
  const person = (role: string) => ({ role, disposition: "friendly" as const });
  assert.ok(jobsOf(person("pilot for hire"), "", "desert").includes("podrace"));
  assert.ok(jobsOf(person("promoter"), "arena", "volcanic").includes("podrace"));
  assert.ok(!jobsOf(person("pilot for hire"), "", "temperate").includes("podrace"), "not on a green world");
  assert.ok(!jobsOf(person("bartender"), "cantina", "desert").includes("podrace"));
});

test("a blow that costs a pod nearly half its hull at once snaps a cable: it is out; a scrape along the cliff only dents it", () => {
  const track = course(1);
  const canyon = track.features!.find((f) => f.kind === "canyon")!;
  const i = Math.round(canyon.at / track.step);
  const p = track.points[i];
  const into = (angle: number, speed: number) => {
    const yaw = track.yaws[i] + angle;
    let race = podStart(track, 1, "arrow");
    race = { ...race, racers: race.racers.map((r) => (r.party ? { ...r, craft: { ...r.craft, p: [p[0], p[1] + POD.hover, p[2]], yaw, speed }, v: [Math.cos(yaw) * speed, 0, Math.sin(yaw) * speed], at: i, gates: track.gates.filter((g) => g.s <= i * track.step).length } : r)) };
    return run(race, track, { ...still, boost: true }, 2.5);
  };
  const hard = into(1.0, 220);
  const me = hard.racers.find((r) => r.party)!;
  assert.ok(me.snapped && me.wrecked && me.hull === 0, "snapped and out");
  assert.ok(hard.log.some((l) => /Your cable snaps!/.test(l)));
  const soft = into(0.12, 160);
  const dented = soft.racers.find((r) => r.party)!;
  assert.ok(!dented.snapped, "a scrape does not snap a cable");
});
