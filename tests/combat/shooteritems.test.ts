// The items and powers the shooter plays since 2026-11-03 (the user: the unread items and the powers with no logic "need their own rules
// written, visual effects, character animations, and implementation"; the contraband mechanics; the senses): their reading from the texts
// (shared/logic fightFactsOf, client realtimePowers), the riders of a weapon, the party unseen, nets and harpoons, buffs, marks, ground and
// holograms, foe criticals, the stop and search, hidden pockets, the slave trade's price; and the 2026-11-02 rules for monsters and melee
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  KEPT, SHOOT, applyGear, blankUnit, castPower, cloakedNow, firePlayer, hitChance, monstrous, newSim, paceOf, playerOf, step,
  type Env, type Event, type FightGear, type Gun, type RtPower, type Sim, type Unit,
} from "../../shared/logic/shooter";
import { fightFactsOf, hidingPlaces, itemFactsOf, slavePrice, stopBegin, stopBribeWorks, stopSearchTotal, stopTick, stopTrickWorks, STOP } from "../../shared/logic";
import { realtimePowers } from "../../client/src/lib/sw5e/realtimePowers";

const require = createRequire(import.meta.url);
const items: any[] = require("../../shared/data/sw5e/enhancedItems.json");
const equipment: any[] = require("../../shared/data/sw5e/equipment.json");
const powers: any[] = require("../../shared/data/sw5e/powers.json");
const row = (name: string) => items.find((r) => r.name === name)!;
const fight = (name: string) => fightFactsOf(name, row(name).text)!;
const scores = { strength: 10, dexterity: 14, constitution: 12, intelligence: 14, wisdom: 16, charisma: 12 };
const power = (name: string, level = 5) => realtimePowers([powers.find((p) => p.name === name)], level, scores)[0];

const field: Env = { blocks: () => false, walkable: (x, y) => x > -40 && x < 80 && y > -40 && y < 40, floorAt: () => 0 };
const rifle: Gun = { name: "Blaster rifle", damage: 10, type: "energy", interval: 0.2, auto: false, range: 20, long: 80, mag: 40, left: 40, reserve: 8, reload: 1, spent: 0, kick: 0.1, steady: 0.1 };
const player = (extra: Partial<Unit> = {}) => blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 30, maxHp: 50, ac: 10, gun: { ...rifle }, facing: Math.PI / 2, ...extra });
const foe = (id: string, x: number, y: number, extra: Partial<Unit> = {}) => blankUnit({ id, name: id, side: "foe", x, y, hp: 40, maxHp: 40, ac: 12, bonus: 4, gun: { ...rifle, damage: 6, range: 12, long: 40 }, ...extra });
const me = (sim: Sim) => ({ x: playerOf(sim).x, y: playerOf(sim).y, h: 0, facing: playerOf(sim).facing });
const run = (sim: Sim, seconds: number, events: Event[] = [], dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) events.push(...step(sim, dt, field, me(sim)));
  return events;
};
const shoot = (sim: Sim, at: Unit, events: Event[] = []) => {
  firePlayer(sim, { x: 0.5, y: 0.5, h: 1.1 }, { x: at.x, y: at.y, h: at.h + 0.6 }, events, false, false);
  return run(sim, 1, events);
};

test("the items' texts are read into what they do in a fight", () => {
  assert.equal(fight("Quantum Splitter Mk I").extra?.dice, "1d4");
  const ostrine = fight("Ostrine Crystal (Perfect)").extra!;
  assert.ok(["force", "lightning", "necrotic", "poison", "psychic", "sonic"].includes(ostrine.type!), "one type of the list, by the name");
  assert.equal(fight("Ostrine Crystal (Perfect)").extra!.type, ostrine.type, "the same item, the same type");
  assert.deepEqual(fight("Precision Chamber Mk I").range, [10, 40]);
  assert.deepEqual(fight("Ion Amplifying Core").pierce, ["ion"]);
  assert.deepEqual(fight("Overload Shield").overload, { feet: 5, uses: 2, rest: "short" });
  assert.equal(fight("Grappling Harpoon").harpoon?.cable, 60);
  assert.equal(fight("Net (Fine)").snare?.ability, "strength");
  assert.deepEqual(fight("Clandestine Stitching (Fine)").pocket, { lb: 2, dc: 18 });
  assert.equal(fight("Integrated Jetboosters Mk I").flight?.feet, 30);
  assert.equal(fight("Enhanced Endurance").endure, true);
  assert.equal(fight("Reflex Enhancer Mk I").evade, true);
  assert.equal(fight("Bioenhancement Matrix Mk II").hpPerLevel, 2);
  assert.deepEqual(fight("Viir Agathys's Armor").casts, [{ power: "voltaic shielding", uses: 3, rest: "long" }]);
  assert.equal(fight("Forged Ferricite Supremacy Channel").pointDamage?.per, 2);
  assert.equal(itemFactsOf(row("Adapted Armor"))?.effects.resist?.length, 1, "the GM's choice of resistance, by the name");
  // (what is left unread is the RPG's: class features, tools, vocoders)
  const unread = items.filter((r) => { const f = itemFactsOf(r, equipment); return !f || (!Object.keys(f.effects).length && !f.use && !f.timed && !f.properties?.length && !f.chassis && !f.shipPart); });
  assert.ok(unread.length < 80, `unread ${unread.length}`);
});

test("the powers with no real-time reading before are read from their texts", () => {
  assert.equal(power("Infiltrate").kind, "buff");
  assert.equal(power("Infiltrate").buff?.cloak, true);
  assert.equal(power("Voltaic Shielding").buff?.retort?.type, "lightning");
  assert.equal(power("Phasewalk").kind, "blink");
  assert.equal(power("Hex").kind, "mark");
  assert.equal(power("Smoke Cloud").kind, "zone");
  assert.equal(power("Smoke Cloud").field?.obscure, true);
  assert.equal(power("Mind Trick").kind, "mind");
  assert.equal(power("Kill").maxHp, 100);
  assert.equal(power("Mirror Image").buff?.images, 3);
  assert.equal(power("Saber Throw").kind, "throw");
  assert.equal(power("Acidic Strike").kind, "imbue");
  const played = powers.filter((p) => realtimePowers([p], 11, scores).length).length;
  assert.ok(played > 320, `played ${played}`);
});

test("a weapon's riders: more dice, and a resistance its shots ignore", () => {
  const plain = newSim([player({ gun: { ...rifle, type: "ion" } }), foe("a", 6.5, 0.5, { resist: ["ion"] })], { seed: 3 });
  shoot(plain, plain.units[1]);
  const lost = 40 - plain.units[1].hp;
  const modded = newSim([player({ gun: { ...rifle, type: "ion", rider: { extra: { damage: 4 }, pierce: ["ion"] } } }), foe("a", 6.5, 0.5, { resist: ["ion"] })], { seed: 3 });
  shoot(modded, modded.units[1]);
  assert.ok(40 - modded.units[1].hp > lost + 4, `${40 - modded.units[1].hp} against ${lost}`);
});

test("the party unseen: a foe beyond arm's reach does not fire on it, and a shot gives it away", () => {
  const sim = newSim([player({ cloaked: true }), foe("a", 8.5, 0.5)], { seed: 5 });
  sim.units[1].mode = "engage";
  const events = run(sim, 4);
  assert.ok(cloakedNow(playerOf(sim)));
  assert.equal(events.filter((e) => e.type === "shot" && e.from === "a").length, 0);
  const after: Event[] = [];
  firePlayer(sim, { x: 0.5, y: 0.5, h: 1.1 }, { x: 8.5, y: 0.5, h: 0.6 }, after, false, false);
  assert.ok(after.some((e) => e.type === "revealed"));
  assert.ok(!cloakedNow(playerOf(sim)), "seen for a moment after the shot");
});

test("a net holds a foe in place; a harpoon reels a smaller one in", () => {
  const sim = newSim([player(), foe("a", 4.5, 0.5, { gun: undefined, blade: { name: "Claws", damage: 3, type: "kinetic", saber: false } })], { seed: 2 });
  const net: FightGear = { name: "Net", count: 2, keep: true, act: { act: "snare", dc: 18 } };
  assert.equal(applyGear(sim, net, field, [], { x: 4.5, y: 0.5, h: 0 }), "");
  run(sim, 1.2);
  const a = sim.units[1];
  assert.ok((a.held ?? 0) > 0, "held");
  const x = a.x;
  run(sim, 1);
  assert.ok(Math.abs(a.x - x) < 0.05, "it cannot move");
  assert.equal(paceOf(a), 0);
  const reel = newSim([player(), foe("b", 7.5, 0.5, { small: true })], { seed: 2 });
  const harpoon: FightGear = { name: "Grappling Harpoon", count: 1, keep: true, act: { act: "harpoon", range: 12, damage: 3.5, cable: 12 } };
  assert.equal(applyGear(reel, harpoon, field, [], { x: 7.5, y: 0.5, h: 0.8 }), KEPT);
  run(reel, 1.5);
  assert.ok(reel.units[1].x < 6.5, `reeled to ${reel.units[1].x}`);
});

test("buffs, marks, ground and holograms from powers", () => {
  const p = (w: RtPower) => ({ ...w, cost: 0 });
  const sim = newSim([player({ points: 20, powers: [p(power("Voltaic Shielding")), p(power("Hex")), p(power("Smoke Cloud")), p(power("Hologram"))] }), foe("a", 5.5, 0.5)], { seed: 4 });
  const events: Event[] = [];
  assert.equal(castPower(sim, 0, field, events), "");
  assert.ok(playerOf(sim).temp >= 5, "temporary hit points");
  playerOf(sim).powerCd = 0;
  assert.equal(castPower(sim, 1, field, events), "");
  assert.equal(sim.units[1].mark?.damage, 3.5);
  playerOf(sim).powerCd = 0;
  assert.equal(castPower(sim, 2, field, events, { x: 5.5, y: 0.5, h: 0 }), "");
  assert.ok(sim.fields.some((f) => f.obscure));
  playerOf(sim).powerCd = 0;
  assert.equal(castPower(sim, 3, field, events, { x: 3.5, y: 2.5, h: 0 }), "");
  assert.ok(sim.units.some((u) => u.decoy));
});

test("a foe's natural 20 is a critical, unless the armour turns it to a normal hit; duplicates take blows", () => {
  const hits = (critImmune: boolean) => {
    let most = 0;
    for (let seed = 1; seed < 400; seed++) {
      const sim = newSim([player({ hp: 500, maxHp: 500, critImmune }), foe("a", 1.3, 0.5, { gun: undefined, bonus: 20, blade: { name: "Claws", damage: 10, type: "kinetic", saber: false } })], { seed });
      sim.units[1].mode = "engage";
      run(sim, 2.5);
      most = Math.max(most, 500 - playerOf(sim).hp);
    }
    return most;
  };
  assert.ok(hits(false) > hits(true), "a critical lands harder than any normal blow");
  const sim = newSim([player({ buffs: [{ name: "Mirror Image", t: 60, images: 3 }] }), foe("a", 1.3, 0.5, { gun: undefined, bonus: 20, blade: { name: "Claws", damage: 10, type: "kinetic", saber: false } })], { seed: 9 });
  sim.units[1].mode = "engage";
  const events = run(sim, 10);
  assert.ok(events.some((e) => e.type === "image"));
});

test("the stop and search: standing still lowers the officer's suspicion, running raises it; a mind trick works on the weak-minded", () => {
  const calm = stopBegin(1, { openContraband: 0, heat: 0, heavyArmour: false, outfit: true, disguised: false, insight: 1, deception: 3 });
  let s = calm;
  for (let t = 0; t < STOP.length + 1; t += 0.1) s = stopTick(s, 0.1, { moving: false, running: false });
  assert.equal(s.outcome, "waved", `suspicion ${s.suspicion}`);
  let r = stopBegin(2, { openContraband: 1, heat: 0, heavyArmour: false, outfit: false, disguised: false, insight: 3, deception: 0 });
  for (let t = 0; t < STOP.length + 1; t += 0.1) r = stopTick(r, 0.1, { moving: true, running: true });
  assert.equal(r.outcome, "searched");
  assert.ok(stopSearchTotal(r) >= 10 + 3 + 5, "a thorough search");
  assert.ok(stopTrickWorks(14, 1), "a weak-minded officer");
  assert.ok(!stopTrickWorks(12, 3), "a strict port's officer is not");
  assert.ok(stopBribeWorks(5, { ...calm, law: 1 }));
});

test("hidden pockets sewn into clothes worn are a hiding place; a person's price", () => {
  const stitched = { source: "Clothes, fine: Clandestine Stitching (Fine)", fight: fight("Clandestine Stitching (Fine)") };
  assert.deepEqual(hidingPlaces([], ["Clothes, fine"], [stitched]), [{ item: stitched.source, lb: 2, dc: 18 }]);
  assert.deepEqual(hidingPlaces([], [], [stitched]), [], "not worn, not there");
  assert.equal(slavePrice("1/4"), 350);
  assert.equal(slavePrice(2), 700);
});

test("monsters, wind-ups and the pace of blows (2026-11-02)", () => {
  assert.ok(monstrous({ creature: "beast" }));
  assert.ok(!monstrous({ creature: "humanoid", role: "guard" }));
  // An adolescent dewback (two attacks, +5) against AC 14: a blow every two seconds at 60%
  assert.equal(Math.max(SHOOT.melee.fastest, SHOOT.melee.round / 2), 2);
  assert.ok(Math.abs(hitChance(5, 14) - 0.6) < 1e-9);
  const sim = newSim([player({ hp: 200, maxHp: 200 }), foe("d", 1.3, 0.5, { gun: undefined, bonus: 5, volley: 2, blade: { name: "Bite", damage: 11, type: "kinetic", saber: false } })], { seed: 11 });
  sim.units[1].mode = "engage";
  const events = run(sim, 20);
  const swings = events.filter((e) => e.type === "swing" && e.id === "d").length;
  assert.ok(swings >= 8 && swings <= 11, `${swings} swings in 20 s`);
});
