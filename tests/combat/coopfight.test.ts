// The co-op shared fight's pure part (2026-11-16, batch G; design-G-coop.md): one sim with a party unit per member, each member's input played
// for them (applyCommand / withActor), the map's walls baked and rebuilt on the server (bakeGrid / gridEnv), and what each member is sent (snapOf)
import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, applySnap, bakeGrid, blankUnit, gridEnv, newSim, playerOf, resultOf, snapOf, step, type Env, type Event, type Gun } from "../../shared/logic/shooter";

const rifle = (): Gun => ({ name: "Rifle", damage: 8, type: "energy", interval: 0.3, auto: false, range: 20, long: 80, mag: 10, left: 10, reserve: 10, reload: 1, spent: 0 });
const member = (id: string, x: number, y: number) => blankUnit({ id, name: id, side: "player", x, y, hp: 30, maxHp: 30, gun: rifle(), mode: "engage" });
const room: Env = {
  blocks: (x, _y, h) => (Math.floor(x) === 10 && h < 3) || (Math.floor(x) === 4 && Math.floor(_y) === 4 && h < 0.9),
  walkable: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 20 && Math.floor(x) !== 10 && !(Math.floor(x) === 4 && Math.floor(y) === 4),
  floorAt: (x) => (x > 15 ? 1 : 0),
};

test("two members in one fight: each one's shots are their own, a foe goes for the nearer, and it is lost only when both are down", () => {
  const foe = blankUnit({ id: "f", name: "Thug", side: "foe", x: 2.5, y: 8.5, hp: 50, maxHp: 50, mode: "engage", wait: 0, speed: 3, reach: 1, blade: { name: "Club", damage: 2, type: "kinetic", saber: false } });
  const sim = newSim([member("ann", 2.5, 2.5), member("bo", 8.5, 2.5), foe], { seed: 4 });
  sim.poses = { ann: { x: 2.5, y: 2.5, h: 0, facing: 0 }, bo: { x: 8.5, y: 2.5, h: 0, facing: 0 } };
  const events: Event[] = [];
  assert.equal(applyCommand(sim, "bo", { k: "fire", from: { x: 8.5, y: 2.5, h: 1 }, to: { x: 2.5, y: 8.5, h: 0.8 }, moving: false, airborne: false }, room, events), "");
  assert.equal(playerOf(sim, "bo").gun!.left, 9);
  assert.equal(playerOf(sim, "ann").gun!.left, 10, "ann's magazine is untouched");
  assert.equal(sim.bolts[0].owner, "bo");
  assert.ok((playerOf(sim, "bo").spreadNow ?? 0) > 0.03, "bo's aim widens");
  assert.equal(playerOf(sim, "ann").spreadNow, undefined, "ann's does not");
  for (let t = 0; t < 3; t += 0.05) step(sim, 0.05, room, sim.poses.ann);
  assert.ok(Math.hypot(foe.x - 2.5, foe.y - 2.5) < Math.hypot(foe.x - 8.5, foe.y - 2.5), "the foe goes for the nearer member");
  playerOf(sim, "ann").dead = true;
  assert.equal(resultOf(sim), "ongoing", "one member down: the fight goes on for the other");
  playerOf(sim, "bo").dead = true;
  assert.equal(resultOf(sim), "down");
});

test("a member's belt is spent by the server; a member's poses are their own", () => {
  const sim = newSim([member("ann", 2.5, 2.5), member("bo", 8.5, 2.5)], { seed: 5 });
  const belt = [{ name: "Medpac", count: 2, act: { act: "heal" as const, amount: 7 } }];
  playerOf(sim, "bo").hp = 10;
  const used: Record<string, number> = {};
  assert.equal(applyCommand(sim, "bo", { k: "gear", name: "Medpac" }, room, [], { gear: belt, used }), "");
  assert.equal(playerOf(sim, "bo").hp, 17);
  assert.equal(belt[0].count, 1);
  assert.deepEqual(used, { Medpac: 1 });
  sim.poses = { ann: { x: 3.5, y: 3.5, h: 0, facing: 1 }, bo: { x: 7.5, y: 5.5, h: 0, facing: 2 } };
  step(sim, 0.05, room, sim.poses.ann);
  assert.deepEqual([playerOf(sim, "bo").x, playerOf(sim, "bo").y, playerOf(sim, "bo").facing], [7.5, 5.5, 2]);
  assert.deepEqual([playerOf(sim, "ann").x, playerOf(sim, "ann").y], [3.5, 3.5]);
});

test("the walls baked from the map are the same walls on the server; what a member is sent", () => {
  const g = bakeGrid(room, 0, 0, 20, 20);
  const env = gridEnv(g);
  for (const [x, y] of [[2.5, 2.5], [10.5, 3.5], [4.5, 4.5], [16.5, 2.5], [19.5, 19.5]]) {
    assert.equal(env.walkable(x, y), room.walkable(x, y), `walkable ${x},${y}`);
    assert.equal(env.floorAt(x, y), room.floorAt(x, y), `floor ${x},${y}`);
    for (const h of [0.5, 2, 5]) assert.equal(env.blocks(x, y, room.floorAt(x, y) + h), room.blocks(x, y, room.floorAt(x, y) + h), `blocks ${x},${y} at ${h}`);
  }
  assert.ok(JSON.stringify(g).length < 4000);
  const sim = newSim([member("ann", 2.5, 2.5), member("bo", 8.5, 2.5)], { seed: 6 });
  playerOf(sim, "bo").powers = [{ id: "p", name: "Shock", cost: 0, kind: "damage", damage: 5, type: "lightning", range: 6, radius: 0, seconds: 0, distance: 0, strike: 0 }];
  const snap = JSON.parse(JSON.stringify(snapOf(sim, [], "ann")));
  assert.equal(snap.units.find((u: any) => u.id === "bo").powers, undefined, "another member's powers are not sent");
  const mine = JSON.parse(JSON.stringify(snapOf(sim, [], "bo")));
  assert.equal(mine.units.find((u: any) => u.id === "bo").powers.length, 1, "one's own are");
  const screen = newSim([member("ann", 0, 0)], { seed: 1 });
  applySnap(screen, mine);
  assert.equal(screen.units.length, 2);
});
