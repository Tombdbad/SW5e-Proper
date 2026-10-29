// Nemeses (2026-10-29): who rises from a fight, what mercy does, how time cools a grudge and when they come hunting
import test from "node:test";
import assert from "node:assert/strict";
import type { Occupant } from "../../shared/logic/index";
import {
  BALANCE, activeNemeses, beginHunt, canHunt, describe, emptyNemeses, empower, huntParty, intentOf, notorietyLevel, pickHunter, resolveMercy, settleFight, tauntOf,
  tickNemeses, tierOf, titleOf, type FightFoe, type NemesisRecord, type NemesisState,
} from "../../shared/logic/nemesis";

const trooper = (extra: Partial<Occupant> = {}): Occupant => ({ id: "t", name: "Bounty Hunter", role: "bounty hunter", disposition: "hostile", count: 1, hitPoints: 30, armorClass: 14, xp: 100, attack: { name: "Blaster", bonus: 4, damage: "1d8+2" }, loadout: ["Blaster pistol"], ...extra });
// A fresh enemy of a fight is met under a combat id ("trooper-0"); a nemesis already made fights under the id of its record
const foe = (id: string, extra: Partial<FightFoe> = {}): FightFoe => ({ id, name: id, body: trooper({ id }), hp: 30, maxHp: 30, ...extra });
// The record made from the enemy first met as `orig`, and the id it fights under from then on
const rec = (s: NemesisState, orig: string): NemesisRecord => Object.values(s.records).find((r) => r.body.id === orig)!;
const idOf = (s: NemesisState, orig: string) => rec(s, orig).id;
const DAY = 1440;
const rise = (orig = "f1", extra: Partial<FightFoe> = {}, seed = 7): NemesisState => settleFight(emptyNemeses(seed), { outcome: "victory", now: 1000, foes: [foe(orig, { fled: true, hp: 0, leader: true, struck: { energy: 25 }, ...extra })], settlementId: "mos-eisley" }).state;

test("a leader who runs becomes a named nemesis with a grudge, a fear and a rest", () => {
  const s = rise();
  const r = rec(s, "f1");
  assert.ok(r, "the runner is remembered");
  assert.match(r.id, /^nem-\d+$/, "with an id of its own, not a combat id that is reused");
  assert.equal(r.origin, "fled");
  assert.equal(r.status, "resting");
  assert.ok(r.restUntil > 1000);
  assert.ok(r.hate > 0 && r.fear > 0);
  assert.match(r.name, /^\S+ \S+$/);
  assert.equal(r.fled, 1);
  assert.equal(r.body.count, 1);
});

test("a combat id that is reused later is not mistaken for a nemesis", () => {
  const s = rise("trooper-0");
  const again = settleFight(s, { outcome: "victory", now: 2000, foes: [foe("trooper-0", { hp: 0 })] });
  assert.equal(Object.keys(again.state.records).length, 1, "a plain beaten trooper is not the nemesis");
  assert.equal(rec(again.state, "trooper-0").beaten, 0);
});

test("beasts, horrors and droids never hold a grudge", () => {
  const beast = foe("b", { fled: true, hp: 0, body: trooper({ id: "b", role: "wildlife", creature: "beast" }) });
  const droid = foe("d", { fled: true, hp: 0, body: trooper({ id: "d", creature: "droid" }) });
  const { state } = settleFight(emptyNemeses(), { outcome: "victory", now: 5, foes: [beast, droid] });
  assert.deepEqual(Object.keys(state.records), []);
});

test("the one who brings the party down rises, with a kill of the party, a rank and a longer rest", () => {
  const { state, events } = settleFight(emptyNemeses(3), { outcome: "stable", now: 2000, downedBy: "k1", foes: [foe("k1"), foe("k2")] });
  const r = rec(state, "k1");
  assert.equal(r.origin, "killed-party");
  assert.equal(r.killedParty, 1);
  assert.ok(r.rankXp >= 60);
  assert.equal(r.restUntil, 2000 + BALANCE.restHoursKilledParty * 60);
  assert.equal(rec(state, "k2"), undefined, "only the one who struck the blow");
  assert.ok(events.some((e) => e.id === r.id));
  assert.equal(r.title, "the Butcher");
});

test("a won fight raises the party's notoriety and a defeated nemesis is left at the party's mercy", () => {
  const s0 = rise();
  const id = idOf(s0, "f1");
  const again = settleFight(s0, { outcome: "victory", now: 3000, foes: [foe(id, { hp: 0, struck: { kinetic: 30 } })] });
  assert.equal(again.state.records[id].status, "at-mercy");
  assert.deepEqual(again.state.mercy, [id]);
  assert.ok(again.state.notoriety > s0.notoriety);
  const lostFight = settleFight(s0, { outcome: "dead", now: 3000, foes: [foe(id, { hp: 0 })] });
  assert.equal(lostFight.state.records[id].status, "resting");
  assert.deepEqual(lostFight.state.mercy, []);
});

test("sparing a proud one deepens the grudge, a greedy one cools; execution kills, or they cheat death", () => {
  const find = (p: string) => {
    for (let seed = 1; seed < 300; seed++) {
      const s = rise("f1", {}, seed);
      if (rec(s, "f1").personality === p) return s;
    }
    throw new Error("no " + p);
  };
  const mercy = (s: NemesisState) => settleFight(s, { outcome: "victory", now: 3000, foes: [foe(idOf(s, "f1"), { hp: 0, struck: { energy: 30 } })] }).state;
  const proud = mercy(find("proud"));
  const id = idOf(proud, "f1");
  const hatePride = proud.records[id].hate;
  const sparedProud = resolveMercy(proud, id, "spare", 3000).state.records[id];
  assert.ok(sparedProud.hate > hatePride);
  assert.equal(sparedProud.spared, 1);
  const greedy = mercy(find("greedy"));
  const gid = idOf(greedy, "f1");
  assert.ok(resolveMercy(greedy, gid, "spare", 3000).state.records[gid].hate < greedy.records[gid].hate);
  const fates = new Set<string>();
  for (let seed = 1; seed < 60; seed++) {
    const s = mercy(rise("f1", {}, seed));
    const out = resolveMercy(s, idOf(s, "f1"), "execute", 4000).state;
    assert.deepEqual(out.mercy, []);
    fates.add(rec(out, "f1").status);
  }
  assert.ok(fates.has("dead"), "usually dead");
  assert.ok(fates.has("presumed-dead"), "sometimes not");
});

test("questioning a beaten nemesis frightens them", () => {
  let s = rise("a");
  s = settleFight(s, { outcome: "victory", now: 1100, foes: [foe("b", { fled: true, hp: 0, leader: true })] }).state;
  const a = idOf(s, "a");
  s = settleFight(s, { outcome: "victory", now: 1200, foes: [foe(a, { hp: 0 })] }).state;
  const before = s.records[a].fear;
  const out = resolveMercy(s, a, "interrogate", 1300).state;
  assert.ok(out.records[a].fear > before);
  assert.equal(out.records[a].status, "resting");
});

test("time cools grudges, fades fear, gets the rested up and brings back the 'dead'", () => {
  const s = rise("f1", {}, 11);
  const id = idOf(s, "f1");
  s.records[id].hate = 60;
  s.records[id].fear = 30;
  s.lastTick = 1000;
  const week = tickNemeses(s, 1000 + 7 * DAY);
  assert.ok(week.state.records[id].hate < 60);
  assert.ok(week.state.records[id].fear < 30);
  assert.equal(week.state.records[id].status, "alive");
  assert.equal(tickNemeses(s, 1000 + 100).state, s, "nothing happens inside a day");
  const sleeper = structuredClone(s);
  sleeper.records[id].status = "presumed-dead";
  sleeper.records[id].restUntil = 1000 + 2 * DAY;
  const back = tickNemeses(sleeper, 1000 + 3 * DAY);
  assert.equal(back.state.records[id].status, "alive");
  assert.ok(back.events.some((e) => e.kind === "returns"));
  assert.ok(back.state.news.length > 0);
});

test("only a deep enough grudge with nerve left hunts, and a murderous one finds the party often", () => {
  const s = rise();
  const base = rec(s, "f1");
  const ready = (mut: (r: NemesisRecord) => void) => {
    const r = structuredClone(base);
    r.status = "alive";
    r.restUntil = 0;
    r.huntedAt = -9999999;
    mut(r);
    return r;
  };
  assert.equal(canHunt(ready((r) => { r.hate = 5; }), 5000), false, "no grudge");
  assert.equal(canHunt(ready((r) => { r.hate = 80; r.fear = 90; }), 5000), false, "too afraid");
  assert.equal(canHunt(ready((r) => { r.hate = 40; r.fear = 60; r.aggression = 30; }), 5000), false, "provoked only");
  assert.equal(canHunt(ready((r) => { r.hate = 80; r.fear = 60; r.aggression = 30; }), 5000), true, "murderous is not put off");
  assert.equal(canHunt(ready((r) => { r.hate = 50; r.fear = 10; r.status = "resting"; r.restUntil = 9999; }), 5000), false, "resting");
  assert.equal(intentOf({ fear: 10, aggression: 50 }), "hunts");
  assert.equal(tierOf(80), "murderous");
  assert.equal(notorietyLevel(0), 0);
  assert.equal(notorietyLevel(90), 4);
  const hot = structuredClone(s);
  hot.records[base.id] = ready((r) => { r.hate = 90; r.fear = 0; r.aggression = 80; r.home = "mos-eisley"; });
  let hits = 0;
  for (let t = 0; t < 400; t++) if (pickHunter(hot, { now: 100000 + t * 10, settlementId: "mos-eisley", level: 3 })) hits++;
  assert.ok(hits > 40, `a murderous grudge should find the party often (${hits}/400)`);
  const cold = structuredClone(hot);
  cold.records[base.id].hate = 15;
  let few = 0;
  for (let t = 0; t < 400; t++) if (pickHunter(cold, { now: 100000 + t * 10, settlementId: "mos-eisley", level: 3 })) few++;
  assert.ok(few < hits / 2);
});

test("a hunt brings the nemesis under their record id, scaled by rank, with a crew; beginHunt starts the cooldown", () => {
  const s = rise();
  const r = structuredClone(rec(s, "f1"));
  r.rank = 4;
  r.scars.push({ wound: "a seared stump", location: "hand", from: "energy", prosthesis: "hand", at: 1, byParty: true });
  const { gang, text } = huntParty(r);
  assert.equal(gang[0].id, r.id);
  assert.equal(gang[0].hitPoints, Math.round(30 * (1 + BALANCE.hpPerRank * 4)));
  assert.equal(gang[0].armorClass, 15);
  assert.equal(gang[0].attack!.bonus, 6);
  assert.equal(gang.length, 1 + 3);
  assert.match(text, /stump/);
  assert.equal(empower(r.body, 0).hitPoints, 30);
  assert.equal(beginHunt(s, r.id, 77777).records[r.id].huntedAt, 77777);
  assert.equal(s.records[r.id].huntedAt, 1000, "the old state is not touched");
  assert.ok(tauntOf(r, "ambush").length > 0);
  // and fought again under that id, the same nemesis is found, not a new one
  const back = settleFight(s, { outcome: "stable", now: 9000, downedBy: r.id, foes: [foe(r.id), ...gang.slice(1).map((o) => foe(o.id))] });
  assert.equal(Object.keys(back.state.records).length, 1);
  assert.equal(back.state.records[r.id].killedParty, 1);
});

test("a savage energy beating sometimes takes a hand or an eye: the title and a prosthesis follow", () => {
  let found = false;
  for (let seed = 1; seed < 300 && !found; seed++) {
    const s = settleFight(emptyNemeses(seed), { outcome: "victory", now: 9, foes: [foe("z", { fled: true, hp: 0, leader: true, struck: { energy: 60 } })] }).state;
    const hand = rec(s, "z")?.scars.find((x) => x.prosthesis);
    if (hand) {
      found = true;
      assert.ok(["hand", "eye"].includes(hand.prosthesis!));
      assert.match(rec(s, "z").title ?? "", /Hand-Taker|One-Eye/);
      assert.ok(describe(rec(s, "z")).length > 10);
    }
  }
  assert.ok(found);
  assert.equal(titleOf({ scars: [], killedParty: 0, fled: 0, cheatedDeath: 0, rank: 0 }), undefined);
});

test("when the chief of a side falls their next in rank takes the chair and the news says so", () => {
  let s = rise("boss", { leader: true });
  s = settleFight(s, { outcome: "victory", now: 1100, foes: [foe("lt", { fled: true, hp: 0, leader: true })] }).state;
  const boss = idOf(s, "boss");
  const lt = idOf(s, "lt");
  s.records[boss].rank = 3;
  s.records[boss].gang = s.records[lt].gang = "Black Sun";
  s = settleFight(s, { outcome: "victory", now: 1200, foes: [foe(boss, { hp: 0 })] }).state;
  let ended: NemesisState | undefined;
  for (let seed = 1; seed < 80 && !ended; seed++) {
    const t = { ...structuredClone(s), seed };
    const out = resolveMercy(t, boss, "execute", 1300).state;
    if (out.records[boss].status === "dead") ended = out;
  }
  assert.ok(ended);
  assert.equal(ended!.seats.length, 1);
  assert.equal(ended!.seats[0].successor, lt);
  assert.ok(ended!.news.some((n) => /takes up/.test(n.text)));
  assert.ok(activeNemeses(ended).every((r) => r.status !== "dead"));
});

test("settling is pure and deterministic", () => {
  const before = JSON.stringify(emptyNemeses(4));
  const report = { outcome: "victory" as const, now: 5, foes: [foe("p", { fled: true, hp: 0, leader: true })] };
  const a = settleFight(emptyNemeses(4), report);
  const b = settleFight(emptyNemeses(4), report);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(emptyNemeses(4)), before);
});
