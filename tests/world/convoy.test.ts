// The convoy (2026-10-30; shared/logic "The convoy", house rules): a column of haulers on a road with the party's craft, raiders that come at
// it in waves, the convoy's own fighters, the haulers' turrets and the party's gun aimed into the sky
import test from "node:test";
import assert from "node:assert/strict";
import { CONVOY, convoyResult, convoyStart, groundAt, raceCourse, roadAt, stepRace, type Race, type RaceInput, type RaceScenery } from "@shared/logic";

const scenery: RaceScenery = { trees: ["tree"], shrubs: [], boulders: ["rock"], hits: { tree: { r: 0.5, h: 6 }, rock: { r: 1.2, h: 2 }, crate_stack: { box: [0.55, 0.45], h: 1, breaks: true, mass: 0.15 }, gate: { r: 0.4, h: 8 } } };
const run = (seed: number, aimer: boolean) => {
  const track = raceCourse(seed, scenery, 1, {});
  let race: Race = convoyStart(track, seed, "Landspeeder", { haulers: 3, hauler: "Landspeeder", level: 5, who: "Black Sun", ally: "Republic" });
  const input: RaceInput = { steer: { x: 0, y: 0 }, throttle: 0, auto: true };
  let low = Infinity;
  for (let i = 0; i < 60 * 8 && !race.over; i++) {
    if (aimer) {
      // At the gun: the sights put on the nearest raider, the trigger held
      const me = race.racers.find((r) => r.party)!;
      const from = [me.craft.p[0], me.craft.p[1] + 1.6, me.craft.p[2]];
      const foe = race.convoy!.flyers.filter((f) => f.side === "raider" && !f.wrecked).sort((a, b) => Math.hypot(a.p[0] - from[0], a.p[2] - from[2]) - Math.hypot(b.p[0] - from[0], b.p[2] - from[2]))[0];
      if (foe) {
        input.aim = Math.atan2(foe.p[2] - from[2], foe.p[0] - from[0]) - me.craft.yaw;
        input.pitch = Math.atan2(foe.p[1] - from[1], Math.hypot(foe.p[0] - from[0], foe.p[2] - from[2]));
        input.fire = true;
      } else input.fire = false;
    }
    race = stepRace(race, track, input, 0.5);
    for (const f of race.convoy!.flyers) if (!f.wrecked) low = Math.min(low, f.p[1] - groundAt(track, f.p[0], f.p[2]));
  }
  return { race, track, low };
};

test("a convoy: haulers ahead of the party's craft in a column on the road, the convoy's fighters over it, the raiders to come in waves", () => {
  const track = raceCourse(3, scenery, 1, {});
  const race = convoyStart(track, 3, "Speederbike", { haulers: 4, level: 9 });
  const me = race.racers.find((r) => r.party)!;
  const haulers = race.racers.filter((r) => r.cargo);
  assert.equal(haulers.length, 4);
  assert.ok(haulers.every((h) => h.convoy && roadAt(track, h) > roadAt(track, me)), "the haulers drive ahead of the party");
  assert.ok(haulers.every((h) => h.hull === CONVOY.haulerHull));
  assert.equal(race.convoy!.flyers.filter((f) => f.side === "escort").length, 2);
  assert.equal(race.convoy!.waves.length, 3);
  assert.ok(race.convoy!.waves[0].bombers > 0, "bombers from 4th level");
});

test("the raiders come and are fought off by the turrets and the convoy's fighters; ships keep off the ground; the end pays by what got through", () => {
  for (const seed of [2, 9]) {
    const { race, low } = run(seed, false);
    assert.ok(race.over, "it ends");
    assert.ok(race.convoy!.wave >= 1, "a wave came");
    assert.ok(low >= CONVOY.floor - 0.01, `lowest ${low}`);
    const r = convoyResult(race);
    assert.equal(r.through + r.lost, r.outcome === "wrecked" ? r.lost : 3);
    assert.equal(r.credits, (r.outcome === "wrecked" ? 0 : r.through * CONVOY.pay.hauler) + r.downed * CONVOY.pay.downed);
    console.log(`seed ${seed}: ${r.note}; ${race.t.toFixed(0)} s`);
  }
});

test("the party at the gun, its sights on the raiders, shoots them down", () => {
  let mine = 0;
  for (const seed of [2, 9, 14]) {
    const { race } = run(seed, true);
    mine += race.log.filter((l) => /^You shoot down/.test(l)).length;
  }
  assert.ok(mine >= 3, `the party shot down ${mine}`);
});
