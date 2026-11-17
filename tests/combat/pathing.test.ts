// Ways round in the real-time fight (2026-11-16, batch G; the user's reports: foes "stick behind walls", "frightened foes never return"):
// shooter.ts route (A* with diagonals at their length, the nearest reachable square), chase's cut corners, fleeGoal, and fear that passes
import test from "node:test";
import assert from "node:assert/strict";
import { SHOOT, blankUnit, newSim, playerOf, route, step, type Env, type Event, type Sim, type Unit } from "../../shared/logic/shooter";

const box = (wall: (i: number, j: number) => boolean, size = 80): Env => ({
  blocks: (x, y, h) => wall(Math.floor(x), Math.floor(y)) && h < 3,
  walkable: (x, y) => x >= 0 && y >= 0 && x < size && y < size && !wall(Math.floor(x), Math.floor(y)),
  floorAt: () => 0,
});
const party = (extra: Partial<Unit> = {}) => blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 50, maxHp: 50, ...extra });
const run = (sim: Sim, env: Env, seconds: number, dt = 1 / 30) => {
  const out: Event[] = [];
  for (let t = 0; t < seconds; t += dt) { const p = playerOf(sim); out.push(...step(sim, dt, env, { x: p.x, y: p.y, h: 0, facing: 0 })); }
  return out;
};

test("route goes the short way, diagonals and all, and through a long winding way the old search gave up on", () => {
  const open = box(() => false);
  assert.equal(route(open, { x: 0.5, y: 0.5 }, { x: 10.5, y: 10.5 })!.length, 10, "straight along the diagonal");
  // a comb: walls across every fourth row, open at alternate ends, so the way winds back and forth (about 20 x 60 squares of it)
  const comb = box((i, j) => j % 4 === 2 && (Math.floor(j / 4) % 2 ? i > 0 : i < 59), 60);
  const far = route(comb, { x: 1.5, y: 0.5 }, { x: 1.5, y: 57.5 });
  assert.ok(far && far.length > 500, `the whole winding way: ${far?.length}`);
  for (const p of far!) assert.ok(comb.walkable(p.x, p.y));
});

test("a goal that cannot be reached gives the way to the nearest square that can, when asked", () => {
  const shut = box((i) => i === 10);
  assert.equal(route(shut, { x: 2.5, y: 2.5 }, { x: 15.5, y: 2.5 }, 2000), null);
  const near = route(shut, { x: 2.5, y: 2.5 }, { x: 15.5, y: 2.5 }, 2000, true)!;
  assert.ok(near.length > 0);
  const last = near[near.length - 1];
  assert.equal(Math.floor(last.x), 9, "as near as the wall lets it");
});

test("a foe chasing round a wall cuts the corners where the way is clear, and gets there sooner than square by square", () => {
  // an L of wall between the foe and the party
  const env = box((i, j) => (i === 10 && j < 15) || (j === 15 && i >= 4 && i <= 10));
  const foe = () => blankUnit({ id: "f", name: "Brute", side: "foe", x: 5.5, y: 5.5, hp: 30, maxHp: 30, mode: "engage", wait: 0, speed: 4, reach: 1, blade: { name: "Club", damage: 1, type: "kinetic", saber: false } });
  const sim = newSim([party({ x: 14.5, y: 5.5 }), foe()], { seed: 1 });
  let t = 0;
  for (; t < 12; t += 1 / 30) {
    step(sim, 1 / 30, env, { x: 14.5, y: 5.5, h: 0, facing: 0 });
    if (Math.hypot(sim.units[1].x - 14.5, sim.units[1].y - 5.5) < 1.6) break;
  }
  assert.ok(t < 12, "it came round");
  // the way round is about 9.5 + 10 + 9.5 squares; at 4 a second a straight walk of it takes about 7.5 s
  assert.ok(t < 8.5, `in ${t.toFixed(1)} s`);
});

test("one frightened runs by a way it can walk and comes back when its fear is over; one broken by its wounds is gone", () => {
  // the foe has a wall at its back: running straight away from the party would press it into the wall
  const env = box((i, j) => j === 12 && i >= 2 && i <= 18);
  const scared = blankUnit({ id: "s", name: "Thug", side: "foe", x: 10.5, y: 11.5, hp: 30, maxHp: 30, mode: "flee", flee: 4, scared: true, speed: 4, brave: false });
  const sim = newSim([party({ x: 10.5, y: 6.5 }), scared], { seed: 2 });
  const events = run(sim, env, 3);
  const s = sim.units[1];
  assert.ok(Math.hypot(s.x - 10.5, s.y - 6.5) > 7, `it got away: ${s.x.toFixed(1)}, ${s.y.toFixed(1)}`);
  const back = run(sim, env, 2);
  assert.equal(s.mode, "engage");
  assert.equal(s.fled, false);
  assert.ok([...events, ...back].some((e) => e.type === "status" && e.id === "s" && e.text === "comes back"));
  const beaten = blankUnit({ id: "b", name: "Thug", side: "foe", x: 10.5, y: 3.5, hp: 2, maxHp: 30, mode: "flee", flee: SHOOT.fleeTime, speed: 4, brave: false });
  const sim2 = newSim([party({ x: 10.5, y: 6.5 }), beaten], { seed: 3 });
  run(sim2, env, SHOOT.fleeTime + 0.5);
  assert.equal(sim2.units[1].mode, "gone");
  assert.equal(sim2.units[1].fled, true);
});
