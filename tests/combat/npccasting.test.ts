// Casters among the stat blocks and companions in the real-time fight (2026-11-16, batch G): their powers read from their casting trait's text
// (castingOf), and played by the sim on their own (shooter.ts npcCast). No power or creature is named in the code.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { statProfile, castingOf } from "../../shared/logic/index";

const require = createRequire(import.meta.url);
const monsters: any[] = require("../../shared/data/sw5e/monsters.json");

test("a casting trait's powers, level, points, DC and bonus are read from its text", () => {
  const casters = monsters.map((m) => ({ m, c: statProfile(m).casting })).filter((x) => x.c);
  const listed = monsters.filter((m) => (m.behaviors ?? []).some((b: any) => /casting/i.test(b.name) && /at[- ]will\s*:|powers?(?: \([^)]*\))?:/i.test(b.description ?? "")));
  console.log(casters.map(({ m, c }) => `${m.name}: ${c!.tradition} L${c!.level} ${c!.points ?? "-"}pts DC${c!.dc ?? "-"} +${c!.attack ?? "-"} ${c!.powers.map((p) => p.name + (p.perDay ? `(${p.perDay}/day)` : "")).join(", ")}`).join("\n"));
  // every trait that lists powers gives some
  assert.equal(casters.length, listed.length);
  const knight = casters.find(({ m }) => /inquisitor, knight/i.test(m.name))!.c!;
  assert.equal(knight.tradition, "force");
  assert.equal(knight.level, 5);
  assert.equal(knight.points, 18);
  assert.equal(knight.dc, 13);
  assert.equal(knight.attack, 5);
  assert.ok(knight.powers.some((p) => p.name === "Saber Throw" && p.level === 0));
  assert.ok(knight.powers.length >= 8);
  const droid = casters.find(({ m }) => /000 series/i.test(m.name))!.c!;
  assert.equal(droid.tradition, "tech");
  assert.equal(droid.points, 22);
  // a power given so many times a day, in the list or in its head
  const t = castingOf("Innate Tech-casting", "The T-series Tactical droid can innately cast the following tech powers (tech save DC 14): assess the situation, encrypted message, on/off, alarm, element of surprise (3/day), repair droid, stack the deck");
  assert.equal(t?.powers.find((p) => /element of surprise/i.test(p.name))?.perDay, 3);
  const abeloth = casters.find(({ m }) => /manifestation of abeloth/i.test(m.name))!.c!;
  assert.equal(abeloth.powers.find((p) => p.name === "Telekinesis")?.perDay, 3);
  // a trait with no list is not a caster
  assert.equal(castingOf("War Casting", "When the inquisitor uses an action to cast a force power, they can use a bonus action to make a Double Saber attack."), undefined);
});

// ---- The sim plays them (shooter.ts pickCast / npcCast)
import { SHOOT, blankUnit, newSim, playerOf, step, type Env, type Event, type RtPower, type Sim, type Unit } from "../../shared/logic/shooter";
import { realtimePowers } from "../../client/src/lib/sw5e/realtimePowers";
const allPowers: any[] = require("../../shared/data/sw5e/powers.json");
const open: Env = { blocks: () => false, walkable: (x, y) => x > -40 && x < 40 && y > -40 && y < 40, floorAt: () => 0 };
const party = (extra: Partial<Unit> = {}) => blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 60, maxHp: 60, ac: 12, ...extra });
const run = (sim: Sim, seconds: number, dt = 1 / 30) => {
  const out: Event[] = [];
  for (let t = 0; t < seconds; t += dt) { const p = playerOf(sim); out.push(...step(sim, dt, open, { x: p.x, y: p.y, h: 0, facing: 0 })); }
  return out;
};
const power = (name: string, level = 5): RtPower => {
  const row = allPowers.find((p) => p.name === name);
  const read = realtimePowers([row], level, { intelligence: 16, wisdom: 16, charisma: 16 }, 40)[0];
  assert.ok(read, `${name} plays in real time`);
  return read;
};

test("a foe that knows a stunning power winds it up, then holds the party for no more than the house rule's short hold", () => {
  const stun = power("Stun");
  assert.equal(stun.kind, "stun");
  const caster = blankUnit({ id: "inq", name: "Inquisitor", side: "foe", x: 0.5, y: 6.5, hp: 40, maxHp: 40, mode: "engage", wait: 0, blade: { name: "Saber", damage: 8, type: "energy", saber: true }, reach: 1, powers: [stun], points: 20, castT: 0 });
  const sim = newSim([party(), caster], { seed: 3 });
  const events = run(sim, 2);
  const act = events.find((e) => e.type === "act" && e.id === "inq");
  assert.ok(act && act.type === "act" && act.act === "cast" && act.name === "Stun", "the wind-up is shown first");
  assert.ok(events.some((e) => e.type === "power" && e.id === "inq" && e.kind === "stun"));
  assert.ok(playerOf(sim).stagger > 0 && playerOf(sim).stagger <= SHOOT.npc.partyHold + 1e-6);
  assert.ok(sim.units[1].points! < 20, "it paid its points");
});

test("a wind-up broken by a hard blow does not cast; uses a day run out", () => {
  const blast = power("Force Lightning");
  const caster = blankUnit({ id: "s", name: "Starweird", side: "foe", x: 0.5, y: 8.5, hp: 40, maxHp: 40, mode: "engage", wait: 0, powers: [{ ...blast, cost: 0 }], points: 0, perDay: { [blast.id]: 1 }, castT: 0 });
  const sim = newSim([party(), caster], { seed: 5 });
  run(sim, 0.2);
  assert.equal(sim.units[1].act?.kind, "cast");
  sim.units[1].stagger = SHOOT.act.breaks + 0.1;
  const events = run(sim, 1);
  assert.ok(!events.some((e) => e.type === "power" && e.id === "s"), "stopped short");
  assert.equal(sim.units[1].perDay![blast.id], 0);
  const later = run(sim, 10);
  assert.ok(!later.some((e) => e.type === "power" && e.id === "s"), "its one use a day is spent");
});

test("a companion that knows a healing power heals the hurt party; one with a damaging power uses it on the foes", () => {
  const heal = power("Heal");
  assert.equal(heal.kind, "heal");
  const medic = blankUnit({ id: "jawa", name: "Jawa shaman", side: "ally", x: 1.5, y: 0.5, hp: 20, maxHp: 20, mode: "engage", powers: [heal], points: 10, castT: 0 });
  const foe = blankUnit({ id: "f", name: "Thug", side: "foe", x: 0.5, y: 12.5, hp: 30, maxHp: 30, mode: "idle" });
  const sim = newSim([party({ hp: 20 }), medic, foe], { seed: 7 });
  run(sim, 1.5);
  assert.ok(playerOf(sim).hp > 20, "healed");
  const shock = power("Shock");
  const hand = blankUnit({ id: "ally2", name: "Adept", side: "ally", x: 1.5, y: 0.5, hp: 20, maxHp: 20, mode: "engage", powers: [shock], points: 0, castT: 0 });
  const foe2 = blankUnit({ id: "f2", name: "Thug", side: "foe", x: 1.5, y: 6.5, hp: 30, maxHp: 30, mode: "engage", wait: 5 });
  const sim2 = newSim([party(), hand, foe2], { seed: 8 });
  const events = run(sim2, 1.5);
  assert.ok(events.some((e) => e.type === "power" && e.id === "ally2"));
  assert.ok(sim2.units[2].hp < 30, "the foe took it");
});

test("a foe's push sends the party along the shove (the scene moves it), at most the house rule's squares", () => {
  const push = power("Force Push/Pull");
  const caster = blankUnit({ id: "inq", name: "Inquisitor", side: "foe", x: 0.5, y: 3.5, hp: 40, maxHp: 40, mode: "engage", wait: 0, powers: [{ ...push, kind: "push" }], points: 0, castT: 0 });
  const sim = newSim([party(), caster], { seed: 9 });
  const events = run(sim, 1.5);
  const reel = events.find((e) => e.type === "reel");
  assert.ok(reel && reel.type === "reel" && reel.id === "me");
  assert.ok(reel.type === "reel" && Math.hypot(reel.x - 0.5, reel.y - 0.5) <= SHOOT.npc.partyShove + 0.71);
});
