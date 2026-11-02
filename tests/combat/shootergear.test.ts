// The shooter's gear (2026-11-02; the user: every item has its use in the real-time fight, and the foes use theirs): the party's item belt
// (applyGear), the bursts' conditions and lingering ground (blastOf), mines and charges, and the foes' kits (grenades lobbed, cones sprayed,
// medpacs, a call for help that a jammer stops)
import test from "node:test";
import assert from "node:assert/strict";
import {
  KEPT, SHOOT, applyGear, blankUnit, blastOf, newSim, playerOf, step, firePlayer,
  type Env, type Event, type FightGear, type Gun, type Sim, type Unit,
} from "../../shared/logic/shooter";
import { learnKit, type NemesisRecord } from "../../shared/logic/nemesis";

const field: Env = { blocks: () => false, walkable: (x, y) => x > -40 && x < 80 && y > -40 && y < 40, floorAt: () => 0 };
const rifle: Gun = { name: "Blaster rifle", damage: 10, type: "energy", interval: 0.2, auto: false, range: 20, long: 80, mag: 4, left: 4, reserve: 8, reload: 1, spent: 0 };
const player = (extra: Partial<Unit> = {}) => blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 30, maxHp: 50, ac: 10, gun: { ...rifle }, facing: Math.PI / 2, ...extra });
const foe = (id: string, x: number, y: number, extra: Partial<Unit> = {}) => blankUnit({ id, name: id, side: "foe", x, y, hp: 20, maxHp: 20, ac: 12, bonus: 4, gun: { ...rifle, damage: 6, range: 12, long: 40 }, ...extra });
const me = (sim: Sim) => ({ x: playerOf(sim).x, y: playerOf(sim).y, h: 0, facing: playerOf(sim).facing });
const run = (sim: Sim, seconds: number, events: Event[] = [], dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) events.push(...step(sim, dt, field, me(sim)));
  return events;
};
const frag = blastOf("Grenade, fragmentation", { radius: 20, damage: [{ dice: "3d6", type: "kinetic" }], conditions: [] });
const gear = (act: FightGear["act"], count = 1, name = "Thing"): FightGear => ({ name, count, act });

test("a burst is read from the rules: average dice, the heaviest part's type, conditions as seconds, and burning ground", () => {
  assert.equal(frag.damage, 10.5);
  assert.equal(frag.radius, 4);
  const thermal = blastOf("Thermal detonator", { radius: 20, damage: [{ dice: "2d6", type: "fire" }, { dice: "2d10", type: "kinetic" }], conditions: ["Prone"] });
  assert.equal(thermal.damage, 18);
  assert.equal(thermal.type, "kinetic");
  assert.equal(thermal.prone, true);
  const stun = blastOf("Grenade, stun", { radius: 10, damage: [], conditions: ["Stunned"], rounds: 10 });
  assert.equal(stun.stun, SHOOT.power.longest);
  const fire = blastOf("Mine, incendiary", { radius: 15, damage: [{ dice: "2d8", type: "fire" }], conditions: [], lingers: true, fireDice: "2d8" });
  assert.equal(fire.damage, 0, "the ground burns; the burst itself does not");
  assert.equal(fire.lingers, 60);
  assert.equal(fire.type, "fire");
  assert.ok(Math.abs(fire.dps! - 1.5) < 1e-9);
});

test("a medpac heals the party, or the hurt companion in front; a traumakit gets a fallen one up; a repair kit is for droids", () => {
  const ally = blankUnit({ id: "ally", name: "Ally", side: "ally", x: 1.5, y: 0.5, hp: 4, maxHp: 20 });
  const sim = newSim([player(), ally]);
  const events: Event[] = [];
  assert.equal(applyGear(sim, gear({ act: "heal", amount: 7 }), field, events), "");
  assert.equal(ally.hp, 11, "the companion in front first");
  ally.hp = 20;
  playerOf(sim).fire = 0;
  assert.equal(applyGear(sim, gear({ act: "heal", amount: 7 }), field, events), "");
  assert.equal(playerOf(sim).hp, 37);
  assert.match(applyGear(sim, gear({ act: "heal", amount: 7, droid: true }), field, events), /droid/);
  ally.hp = 0;
  ally.dead = true;
  assert.equal(applyGear(sim, gear({ act: "revive", droid: false }), field, events), "");
  assert.equal(ally.dead, false);
  assert.equal(ally.hp, 1);
  assert.ok(events.some((e) => e.type === "use"));
});

test("an antidote clears the poison (or guards against it), and poison makes the aim worse", () => {
  const sim = newSim([player({ poisoned: 5 })]);
  assert.equal(applyGear(sim, gear({ act: "cure" }), field, []), "");
  assert.equal(playerOf(sim).poisoned, 0);
  playerOf(sim).fire = 0;
  applyGear(sim, gear({ act: "cure" }), field, []);
  assert.ok(playerOf(sim).condImmune?.includes("poisoned"));
  // a poisoned shot spreads wider: fired a hundred times each way, the poisoned bolts stray further from the line
  const spreadOf = (poisoned: number) => {
    const s = newSim([player({ poisoned, gun: { ...rifle, mag: 999, left: 999 } })], { seed: 3 });
    let off = 0;
    for (let i = 0; i < 100; i++) {
      s.spread = SHOOT.spread.base;
      playerOf(s).fire = 0;
      firePlayer(s, { x: 0.5, y: 0.5, h: 1 }, { x: 20.5, y: 0.5, h: 1 }, [], false, false);
      const b = s.bolts.pop()!;
      off += Math.abs(Math.atan2(b.vy, b.vx));
    }
    return off;
  };
  assert.ok(spreadOf(9) > spreadOf(0) * 1.2);
});

test("a mine arms, then goes off for the first foe that comes near; a charge goes off on its timer; paired ones only to the detonator", () => {
  const f = foe("f", 6.5, 0.5, { mode: "idle" });
  const sim = newSim([player(), f], { seed: 1 });
  assert.equal(applyGear(sim, gear({ act: "set", blast: frag, mine: true }, 1, "Mine, fragmentation"), field, []), "");
  assert.equal(sim.mines.length, 1);
  run(sim, 2);
  assert.equal(sim.mines.length, 1, "nobody near");
  f.x = 1.2;
  const events = run(sim, 0.2);
  assert.equal(sim.mines.length, 0);
  assert.ok(events.some((e) => e.type === "explode"));
  assert.ok(f.hp < 20);

  const s2 = newSim([player()], { seed: 1 });
  applyGear(s2, gear({ act: "set", blast: frag, mine: false }, 1, "Charge, fragmentation"), field, []);
  run(s2, SHOOT.mine.timer - 0.5);
  assert.equal(s2.mines.length, 1);
  run(s2, 1);
  assert.equal(s2.mines.length, 0, "the charge went off on its six seconds");

  const s3 = newSim([player(), foe("g", 1.4, 0.5, { mode: "idle" })], { seed: 1 });
  applyGear(s3, gear({ act: "set", blast: frag, mine: true, pairs: 2 }, 1, "Mine, fragmentation"), field, []);
  run(s3, 3);
  assert.equal(s3.mines.length, 1, "paired: it waits for the detonator");
  playerOf(s3).x = 4.5;
  playerOf(s3).fire = 0;
  assert.equal(applyGear(s3, gear({ act: "detonate", range: 6, pairs: 2 }), field, []), KEPT, "the detonator is not used up");
  assert.equal(s3.mines.length, 0);
});

test("binders take a beaten foe alive, not a fresh one; a restraining bolt does the same to a droid", () => {
  const f = foe("f", 1.5, 0.5);
  const sim = newSim([player(), f, foe("other", 30, 0.5, { mode: "idle" })]);
  assert.match(applyGear(sim, gear({ act: "bind", droid: false }), field, []), /too strong/);
  f.hp = 4;
  assert.equal(applyGear(sim, gear({ act: "bind", droid: false }), field, []), "");
  assert.equal(f.bound, true);
  assert.equal(f.dead, false);
  assert.equal(f.mode, "gone");
  playerOf(sim).fire = 0;
  assert.match(applyGear(sim, gear({ act: "bind", droid: true }), field, []), /droid/);
});

test("the teleporter steps the party along its aim to free ground in sight within its reach", () => {
  const sim = newSim([player()]);
  let at: [number, number] | null = null;
  const place = (x: number, y: number) => ((at = [x, y]), true);
  assert.equal(applyGear(sim, gear({ act: "blink", range: 6 }), field, [], { x: 20.5, y: 0.5, h: 0 }, place), "");
  assert.deepEqual(at, [6, 0]);
});

test("ground set ablaze burns whoever stands in it, and the extinguisher puts it out and blinds the foes in its cone, once", () => {
  const fire = blastOf("Grenade, incendiary", { radius: 10, damage: [{ dice: "2d8", type: "fire" }], conditions: [], lingers: true, fireDice: "2d8" });
  const f = foe("f", 3.5, 0.5, { mode: "idle", gun: undefined, blade: undefined, speed: 0 });
  const sim = newSim([player({ x: -20.5 }), f]);
  sim.fields.push({ id: 1, owner: "me", x: 3.5, y: 0.5, h: 0, radius: fire.radius, t: 60, dps: fire.dps!, type: "fire" });
  run(sim, 2);
  assert.ok(f.hp < 20 && f.burning > 0);
  playerOf(sim).x = 0.5;
  const spray = gear({ act: "spray", range: 3, blind: 6 }, 5, "Fire extinguisher");
  assert.equal(applyGear(sim, spray, field, []), "");
  assert.equal(sim.fields.length, 0);
  assert.equal(f.burning, 0);
  assert.ok(f.blind > 0);
  f.blind = 0;
  playerOf(sim).fire = 0;
  applyGear(sim, spray, field, []);
  assert.equal(f.blind, 0, "immune after the first");
});

test("resistances halve, vulnerabilities double, immunities ignore; temporary hit points and armour's absorb go first", () => {
  const f = foe("f", 2.5, 0.5, { resist: ["energy"], mode: "idle" });
  const g = foe("g", 2.5, 3.5, { vulnerable: ["energy"], mode: "idle" });
  const h = foe("h", 2.5, -2.5, { immune: ["energy"], mode: "idle" });
  const sim = newSim([player(), f, g, h], { seed: 2 });
  for (const t of [f, g, h]) {
    sim.bolts.push({ id: sim.seq++, owner: "me", side: "player", x: t.x - 0.6, y: t.y, h: 0.6, vx: 24, vy: 0, vh: 0, damage: 10, type: "energy", life: 1, cell: [Math.floor(t.x - 0.6), Math.floor(t.y)] });
  }
  run(sim, 0.1);
  assert.equal(f.hp, 15);
  assert.equal(g.hp, 0);
  assert.equal(h.hp, 20);
  const p = player({ temp: 5, absorb: 2, hp: 30 });
  const s2 = newSim([p, foe("x", 30, 0.5, { mode: "idle" })]);
  s2.bolts.push({ id: 1, owner: "x", side: "foe", x: 1.1, y: 0.5, h: 0.6, vx: -24, vy: 0, vh: 0, damage: 10, type: "energy", life: 1, cell: [1, 0] });
  run(s2, 0.1);
  assert.equal(p.temp, 0);
  assert.equal(p.hp, 27, "10 less 2 absorbed, 5 of it on the temporary hit points");
});

test("a foe with a grenade lobs it at the party, one with a flamethrower's cone sets it burning, one hurt uses its medpac", () => {
  const thrower = foe("t", 7.5, 0.5, { kit: { blasts: [{ kind: frag, thrown: true, range: 8, left: 1, every: 8, cd: 0 }], medpacs: 0, heal: 0 } });
  const sim = newSim([player(), thrower], { seed: 4 });
  const events = run(sim, 3);
  assert.ok(events.some((e) => e.type === "lob"));
  assert.ok(events.some((e) => e.type === "explode"));
  assert.ok(playerOf(sim).hp < 30);

  const flame = blastOf("Flamethrower", { radius: 5, damage: [{ dice: "4d6", type: "fire" }], conditions: [] });
  const torch = foe("torch", 3.5, 0.5, { gun: undefined, blade: { name: "x", damage: 1, type: "kinetic", saber: false }, kit: { blasts: [{ kind: flame, thrown: false, range: 3, left: 1, every: 12, cd: 0 }], medpacs: 0, heal: 0 } });
  const s2 = newSim([player(), torch], { seed: 4 });
  const e2 = run(s2, 2);
  assert.ok(e2.some((e) => e.type === "spray"));
  assert.ok(playerOf(s2).burning > 0 || playerOf(s2).hp < 30 - 10);

  const medic = foe("m", 8.5, 0.5, { hp: 5, brave: true, kit: { blasts: [], medpacs: 1, heal: 8 } });
  const s3 = newSim([player({ gun: undefined }), medic], { seed: 4 });
  const e3 = run(s3, 3);
  assert.ok(e3.some((e) => e.type === "use" && e.id === "m"));
  assert.ok(medic.hp >= 13);
  assert.equal(medic.kit!.medpacs, 0);
});

test("a foe with a comlink calls for backup, who come in from out of sight; the party's jammer stops the call", () => {
  const make = () => newSim([player(), foe("boss", 8.5, 0.5, { caller: true, brave: true }), foe("b0", 0, 0, { reserve: true })], { seed: 5 });
  const sim = make();
  assert.equal(sim.units[2].mode, "gone");
  const events = run(sim, SHOOT.backup.after + SHOOT.backup.delay + 1);
  assert.ok(events.some((e) => e.type === "call" && !e.jammed));
  assert.ok(events.some((e) => e.type === "arrive"));
  assert.notEqual(sim.units[2].mode, "gone");
  assert.ok(Math.hypot(sim.units[2].x - playerOf(sim).x, sim.units[2].y - playerOf(sim).y) >= 11);

  const jammed = make();
  assert.equal(applyGear(jammed, gear({ act: "jam" }), field, []), KEPT);
  const e2 = run(jammed, SHOOT.backup.after + SHOOT.backup.delay + 1);
  assert.ok(e2.some((e) => e.type === "call" && e.jammed));
  assert.equal(jammed.units[2].mode, "gone");
});

test("a stat block's poisoned bite poisons; poison on the party's blade goes in with its next blow", () => {
  const rider = blastOf("Bite", { radius: 0, damage: [], conditions: ["poisoned"], rounds: 1 });
  const biter = foe("b", 1.3, 0.5, { gun: undefined, blade: { name: "Bite", damage: 3, type: "kinetic", saber: false }, rider });
  const sim = newSim([player({ blade: { name: "Vibroblade", damage: 5, type: "kinetic", saber: false } }), biter], { seed: 6 });
  run(sim, 2);
  assert.ok(playerOf(sim).poisoned > 0);
  const target = foe("t", 1.3, 0.5, { mode: "idle", hp: 40, maxHp: 40, condImmune: [] });
  const s2 = newSim([player({ blade: { name: "Vibroblade", damage: 5, type: "kinetic", saber: false } }), target], { seed: 6 });
  assert.equal(applyGear(s2, gear({ act: "coat", damage: 5 }), field, []), "");
  playerOf(s2).fire = 0;
  playerOf(s2).facing = Math.PI / 2;
  s2.units[0].swing = SHOOT.saber.swing;
  run(s2, 0.5);
  assert.equal(playerOf(s2).venom, undefined);
  assert.ok(target.hp <= 30 && target.poisoned > 0);
});

test("a nemesis comes back with what it learned: an extinguisher after fire, the party's own grenade, medpacs after a beating", () => {
  const rec = { id: "nem-1", kit: [] } as unknown as NemesisRecord;
  const learned = learnKit(rec, { id: "nem-1", name: "x", body: {} as never, hp: 0, maxHp: 20, struck: { fire: 12, energy: 3 } }, { partyUsed: ["Grenade, fragmentation", "Medpac"] }, true);
  assert.deepEqual(learned.sort(), ["Fire extinguisher", "Grenade, fragmentation", "Medpac"].sort());
  assert.deepEqual(learnKit(rec, { id: "nem-1", name: "x", body: {} as never, hp: 0, maxHp: 20, struck: { fire: 12 } }, {}, true), ["Medpac"], "a second medpac, not a second extinguisher");
  assert.deepEqual(learnKit(rec, { id: "nem-1", name: "x", body: {} as never, hp: 0, maxHp: 20, struck: { fire: 12 } }, {}, true), [], "two medpacs at most");
});
