// Class features and maneuvers in the real-time fight (2026-11-16, batch G): what combatFeatures reads in their texts becomes the belt's uses and
// the party's own (realtimeFeatures), and the sim plays them (shooter.ts applyGear rally/stance/surge/wave/strike, partyStrike's knack, reacted).
// Nothing is named in the code; the classes below are only the test's characters.
import test from "node:test";
import assert from "node:assert/strict";
import { combatFeatures } from "../../client/src/lib/sw5e/characterCalculation";
import { realtimeFeatures } from "../../client/src/lib/sw5e/realtimePowers";
import { SHOOT, applyGear, blankUnit, extraAttackShare, firePlayer, newSim, playerOf, step, swingPlayer, type Env, type Event, type FightGear, type Gun, type Sim, type Unit } from "../../shared/logic/shooter";

const scores = { strength: 14, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 12, charisma: 12 };
const make = (cls: string, level: number, maneuvers: string[] = []) => ({ class: cls, level, abilityScores: scores, fighterManeuvers: { maneuvers, styles: [] } });
const open: Env = { blocks: () => false, walkable: (x, y) => x > -40 && x < 40 && y > -40 && y < 40, floorAt: () => 0 };
const rifle: Gun = { name: "Blaster rifle", damage: 10, type: "energy", interval: 0.5, auto: false, range: 20, long: 80, mag: 20, left: 20, reserve: 0, reload: 1, spent: 0 };
const party = (extra: Partial<Unit> = {}) => blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 40, maxHp: 40, ac: 10, ...extra });
const dummy = (id: string, x: number, y: number, extra: Partial<Unit> = {}) => blankUnit({ id, name: id, side: "foe", x, y, hp: 200, maxHp: 200, ac: 10, mode: "engage", wait: 99, ...extra });
const run = (sim: Sim, seconds: number, facing = 0, dt = 1 / 30) => {
  const out: Event[] = [];
  for (let t = 0; t < seconds; t += dt) { const p = playerOf(sim); out.push(...step(sim, dt, open, { x: p.x, y: p.y, h: 0, facing })); }
  return out;
};
const gearOf = (list: FightGear[], act: string) => list.find((g) => g.act.act === act);

test("features read into the belt and the party's own: uses left for the rest, one pool for the maneuvers, extra attacks", () => {
  const fighter = realtimeFeatures(combatFeatures(make("fighter", 5, ["Trip Attack", "Rally", "Menacing Attack"])), {});
  assert.equal(fighter.attacks, 2);
  assert.equal(extraAttackShare(fighter.attacks), 1 + SHOOT.feature.extraAttack);
  assert.ok(gearOf(fighter.gear, "surge"), "an extra action");
  assert.ok(gearOf(fighter.gear, "rally"), "hit points for oneself");
  const strikes = fighter.gear.filter((g) => g.act.act === "strike");
  assert.ok(strikes.length >= 2);
  assert.equal(new Set(strikes.map((g) => g.pool)).size, 1, "the maneuvers share their superiority dice");
  const trip = strikes.find((g) => g.act.act === "strike" && g.act.afflict?.prone);
  assert.ok(trip, "a maneuver whose save knocks down carries it");
  // (uses spent this rest are not on the belt again)
  const pool = strikes[0].pool!;
  const tired = realtimeFeatures(combatFeatures(make("fighter", 5, ["Trip Attack", "Rally", "Menacing Attack"])), { [pool]: 99 });
  assert.equal(tired.gear.filter((g) => g.pool === pool).length, 0);
  const berserker = realtimeFeatures(combatFeatures(make("berserker", 5)), {});
  const rage = gearOf(berserker.gear, "stance");
  assert.ok(rage && rage.act.act === "stance" && rage.act.melee > 0 && rage.act.resist.length > 0);
  const operative = realtimeFeatures(combatFeatures(make("operative", 5)), {});
  assert.equal(operative.knack.extra?.needs, "advantage");
  assert.equal(operative.knack.extra?.every, SHOOT.feature.turn);
  assert.ok(operative.knack.react?.halve);
});

test("a stance adds to each blow of the blade, not the gun; a surge makes the shots come quicker", () => {
  const sim = newSim([party({ blade: { name: "Vibrosword", damage: 6, type: "kinetic", saber: false }, gun: { ...rifle } }), dummy("a", 0.5, 1.6)], { seed: 1 });
  const p = playerOf(sim);
  assert.equal(applyGear(sim, { name: "Rage", count: 1, act: { act: "stance", seconds: 60, melee: 2, resist: ["kinetic"] } }, open, []), "");
  swingPlayer(sim, []);
  const events = run(sim, 0.5);
  const blows = events.filter((e) => e.type === "hit" && e.target === "a").map((e) => (e.type === "hit" ? e.amount : 0));
  assert.deepEqual(blows, [6, 2], "the blow, and the rage's own");
  assert.ok(p.buffs?.some((b) => b.resist?.includes("kinetic")));
  applyGear(sim, { name: "Action Surge", count: 1, act: { act: "surge", seconds: 6 } }, open, []);
  firePlayer(sim, { x: p.x, y: p.y, h: 1 }, { x: 0.5, y: 10, h: 1 }, [], false, false);
  assert.ok(p.fire <= rifle.interval * 0.5 + 1e-9);
});

test("a maneuver rides on the next hit with what its save brings; an area feature hurts the foes near and in sight", () => {
  const sim = newSim([party({ gun: { ...rifle } }), dummy("a", 0.5, 5.5)], { seed: 2 });
  const p = playerOf(sim);
  applyGear(sim, { name: "Trip Attack", count: 1, act: { act: "strike", damage: 4.5, afflict: { name: "Trip Attack", radius: 0, damage: 0, type: "kinetic", blinds: false, prone: true } }, pool: "Maneuver:dice" }, open, []);
  assert.ok(p.imbue);
  firePlayer(sim, { x: p.x, y: p.y, h: 1 }, { x: 0.5, y: 5.5, h: 0.8 }, [], false, false);
  sim.spread = 0;
  const events = run(sim, 0.6);
  assert.ok(events.some((e) => e.type === "hit" && e.target === "a" && e.amount === 5), "the superiority die's average, rounded");
  assert.ok(sim.units[1].stagger > 0, "knocked down: a stagger");
  assert.equal(p.imbue, undefined, "spent on that hit");
  const sim2 = newSim([party(), dummy("near", 0.5, 2.5), dummy("far", 0.5, 20.5)], { seed: 3 });
  assert.equal(applyGear(sim2, { name: "Cause Harm", count: 1, act: { act: "wave", damage: 9, type: "necrotic", range: 6 } }, open, []), "");
  assert.equal(sim2.units[1].hp, 191);
  assert.equal(sim2.units[2].hp, 200);
});

test("extra dice once a turn need the edge the text asks for; a reaction cuts a blow once a turn", () => {
  const knack = { extra: { damage: 10, every: SHOOT.feature.turn, needs: "advantage" as const, melee: true, t: 0, name: "Sneak Attack" }, react: { halve: true, against: "any" as const, every: SHOOT.feature.turn, t: 0, name: "Uncanny Dodge" } };
  const blade = { name: "Vibrodagger", damage: 3, type: "kinetic", saber: false };
  // a foe that has its eyes on the party, alone: no edge
  const sim = newSim([party({ blade, knack: structuredClone(knack) }), dummy("a", 0.5, 1.6)], { seed: 4 });
  swingPlayer(sim, []);
  let hits = run(sim, 0.5).filter((e) => e.type === "hit" && e.target === "a");
  assert.equal(hits.length, 1);
  // staggered: the dice land, then not again for six seconds
  sim.units[1].stagger = 2;
  swingPlayer(sim, []);
  hits = run(sim, 0.5).filter((e) => e.type === "hit" && e.target === "a");
  assert.deepEqual(hits.map((e) => (e.type === "hit" ? e.amount : 0)), [3, 10]);
  sim.units[1].stagger = 2;
  swingPlayer(sim, []);
  hits = run(sim, 0.5).filter((e) => e.type === "hit" && e.target === "a");
  assert.equal(hits.length, 1, "once a turn");
  // the reaction: half of the first blow, the next whole
  const brute = blankUnit({ id: "b", name: "Brute", side: "foe", x: 0.5, y: 1.5, hp: 50, maxHp: 50, ac: 10, bonus: 30, mode: "engage", wait: 0, reach: 1, blade: { name: "Club", damage: 10, type: "kinetic", saber: false } });
  const sim2 = newSim([party({ knack: structuredClone(knack), ac: 10 }), brute], { seed: 5 });
  const taken = run(sim2, 6).filter((e) => e.type === "hit" && e.target === "me").map((e) => (e.type === "hit" ? e.amount : 0));
  assert.ok(taken.length >= 2, `${taken}`);
  assert.equal(taken[0], 5);
  assert.equal(taken[1], 10);
});
