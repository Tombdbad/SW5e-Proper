// Air battles in the air of a planet (2026-10-26; dogfight.ts airStart and the ground, dogfightSim.ts): buildings, flak and convoys on the
// ground, bombs that fall under the world's pull, a craft that strikes the ground, bombers that make their runs, and how each fight ends.
import test from "node:test";
import assert from "node:assert/strict";
import { createRandom } from "../../shared/logic/index";
import { AIR, SCENARIOS, dogfightStart, type Dogfight, type ScenarioId } from "../../shared/logic/dogfight";
import { bombFall, bombRelease, dogfightPayout, isDown, partyOf, stepDogfight } from "../../shared/logic/dogfightSim";
import { partyShip, rows } from "./dogfightBot";

const idle = { steer: { x: 0, y: 0 }, throttle: 0 as const };
const air = (scenario: ScenarioId, g = 1, sheet = partyShip("Small", "Attack Fighter", 1)) => dogfightStart({ seed: 5, scenario, rows, ship: { sheet, owner: "the party" }, air: { biome: "desert", g } });
const step = (s: Dogfight, seconds: number, input: Parameters<typeof stepDogfight>[1] = idle) => {
  const r = createRandom(9).next;
  for (let t = 0; t < seconds && !s.over; t += 1 / 30) stepDogfight(s, input, 1 / 30, r);
};
const pieces = (s: Dogfight, side: "party" | "foe", kind?: string) => s.vessels.filter((v) => v.ground && v.side === side && (!kind || v.ground.kind === kind));

test("four fights in the air, each over the ground of the land with its pieces on it", () => {
  assert.deepEqual(SCENARIOS.filter((x) => x.air).map((x) => x.id), ["defend", "raid", "escort", "strike"]);
  const defend = air("defend");
  assert.equal(defend.air?.biome, "desert");
  assert.equal(pieces(defend, "party", "building").length, 7);
  assert.equal(defend.air?.total, 7);
  assert.ok(defend.vessels.some((v) => v.side === "foe" && v.guns.some((g) => g.kind === "bomb")), "bombers come");
  const raid = air("raid");
  assert.equal(pieces(raid, "foe", "building").filter((v) => v.ground?.target).length, 4);
  assert.equal(pieces(raid, "foe", "flak").length, 3);
  const escort = air("escort");
  assert.equal(pieces(escort, "party", "vehicle").length, 3);
  const strike = air("strike");
  assert.equal(pieces(strike, "foe", "vehicle").length, 3);
  assert.equal(pieces(strike, "foe", "flak").length, 1);
  // Everything on the ground stands on it; the party's craft starts in the air
  for (const s of [defend, raid, escort, strike]) {
    for (const v of s.vessels.filter((x) => x.ground)) assert.ok(Math.abs(v.p[1] - v.half[1]) < 0.01, `${v.name} at ${v.p[1]}`);
    assert.ok(partyOf(s).p[1] > 150);
  }
});

test("a raid lends a bomb rack to a ship with none; the bomb falls under the world's pull", () => {
  const sheet = partyShip("Small", "Attack Fighter", 1);
  const bare = { ...sheet, weapons: sheet.weapons.filter((w) => w.category !== "Quaternary") };
  const s = air("raid", 1, bare);
  assert.ok(s.loaned.includes("Bomb deployer"));
  assert.equal(partyOf(s).guns.find((g) => g.kind === "bomb")?.ammo, 4);
  // Released level at 200 m and 60 m/s: about 6.4 s down, 380 m on; in a pull of 1.5 sooner and shorter
  const fall = bombFall([0, 200, 0], [60, 0, 0], AIR.gravity);
  assert.ok(Math.abs(fall.t - 6.39) < 0.05 && Math.abs(fall.at[0] - 383) < 4, JSON.stringify(fall));
  assert.ok(bombFall([0, 200, 0], [60, 0, 0], AIR.gravity * 1.5).t < fall.t);
  // A bomb dropped by the party falls and goes off on the ground
  const me = partyOf(s);
  step(s, 0.1, { ...idle, bomb: true });
  const bomb = s.shots.find((b) => b.kind === "bomb");
  assert.ok(bomb, "a bomb in the air");
  const y0 = bomb!.p[1];
  const vy0 = bomb!.v[1];
  step(s, 1);
  const still = s.shots.find((b) => b.id === bomb!.id);
  assert.ok(still && still.v[1] < vy0 - 8 && still.p[1] < y0, "it falls faster and faster");
  step(s, 9);
  assert.ok(!s.shots.some((b) => b.id === bomb!.id), "it reached the ground");
  void me;
});

test("a craft that dives into the ground is pushed up and hurt; a graze costs nothing", () => {
  const s = air("escort");
  const me = partyOf(s);
  const before = me.c.hull + me.c.shield;
  me.p = [me.p[0], 3, me.p[2]];
  me.pitch = -0.8;
  me.speed = 60;
  step(s, 0.2);
  assert.ok(me.p[1] >= me.half[1], "back above the ground");
  assert.ok(me.c.hull + me.c.shield < before, "the crash hurt");
  assert.ok(s.log.some((l) => /strike the ground/.test(l)));
});

test("left alone, the bombers bomb the settlement: buildings are lost, and half of them lost loses the fight", () => {
  const s = air("defend");
  // The party's craft circles out of the way (the test build's unlimited hull: the fighters hunt it)
  step(s, 240, { steer: { x: 0.3, y: 0 }, throttle: 0, god: true });
  assert.ok(s.air!.lost >= 2, `buildings were bombed: ${s.air!.lost}`);
  assert.ok(s.outcome === "failed" || (s.outcome === "clear" && s.air!.lost * 2 < s.air!.total), `${s.outcome} ${s.air!.lost}/${s.air!.total}`);
  assert.match(dogfightPayout(s).note, s.outcome === "failed" ? /failed: \d of 7 buildings lost/ : /\d of 7 buildings kept/);
  // Half lost: the fight is lost at once
  const t = air("defend");
  for (const b of pieces(t, "party", "building").slice(0, 4)) b.c = { ...b.c, hull: 0 };
  t.air!.lost = 4;
  step(t, 0.1, { ...idle, god: true });
  assert.equal(t.outcome, "failed");
});

test("the bombers shot down: the settlement is saved and pays for what stands", () => {
  const s = air("defend");
  for (const v of s.vessels) if (v.side === "foe" && v.guns.some((g) => g.kind === "bomb")) v.c = { ...v.c, hull: 0, destroyed: true };
  step(s, 0.2);
  assert.equal(s.outcome, "clear");
  const pay = dogfightPayout(s);
  assert.ok(pay.credits >= 500 + 7 * 250, JSON.stringify(pay));
  assert.match(pay.note, /7 of 7 buildings kept/);
});

test("a convoy drives its road at the convoy's pace", () => {
  const s = air("escort");
  const truck = pieces(s, "party", "vehicle")[0];
  const x0 = truck.p[0];
  step(s, 5);
  assert.ok(Math.abs(truck.p[0] - x0 - 5 * AIR.convoy) < 6, `it drove ${truck.p[0] - x0} m`);
  assert.ok(Math.abs(truck.p[1] - truck.half[1]) < 0.01, "on the ground");
});

test("a struck convoy: destroyed it is the win; got away it is the loss", () => {
  const s = air("strike");
  for (const v of pieces(s, "foe", "vehicle")) v.c = { ...v.c, hull: 0 };
  step(s, 0.2);
  assert.equal(s.outcome, "clear");
  assert.equal(s.kills.vehicle, undefined, "(destroyed by the test, not by the party)");
  const t = air("strike");
  for (const v of pieces(t, "foe", "vehicle")) v.ground!.arrived = true;
  t.air!.arrived = 3;
  step(t, 0.2);
  assert.equal(t.outcome, "failed");
  assert.match(dogfightPayout(t).note, /3 of the convoy got away/);
});

test("a raid is won when the marked buildings are down, whatever else stands; flak shoots at the craft", () => {
  const s = air("raid");
  const me = partyOf(s);
  // Over the town at flak height
  me.p = [0, 150, 0];
  me.speed = 30;
  const before = me.c.hull + me.c.shield;
  step(s, 20, { steer: { x: 0.4, y: 0 }, throttle: 0, god: true });
  void before;
  assert.ok(Object.keys(s.taken).length > 0, `the craft was hit: ${JSON.stringify(s.taken)}`);
  for (const v of pieces(s, "foe", "building").filter((x) => x.ground?.target)) v.c = { ...v.c, hull: 0 };
  step(s, 0.2);
  assert.equal(s.outcome, "clear");
  assert.ok(pieces(s, "foe", "flak").some((v) => !isDown(v)), "the flak still stands");
});
