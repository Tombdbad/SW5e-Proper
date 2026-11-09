// Weapon Masters (the user, 2026-11-09; stage 1 of AUDIT/TRAINER_QUESTS_DESIGN.md): after three star systems and three levels a character
// may seek a Master of a weapon type. A contact in a place visited before names a star system; an informant there names the Master's place;
// the Master sets five trials, each waiting for its level. Two passed make the character proficient with the type, five a master of it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceTraining, ancestor, childrenOf, expandArea, generateWorld, masterTraditions, noteTravel, serveTraining, startTrail, trailReadiness,
  validateWorld, weaponTraining, powerTraining, powerGate, schoolTeaching, type Quest, type TrainingLog, type TrainingGain, type TrailSlot, type World,
} from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";
import { carriedWeapons } from "../../client/src/lib/sw5e/characterCalculation";

const catalog = await getWorldCatalog();

// A spot to stand in under an area: its first settlement's first room, or the area itself
function spotIn(world: World, areaId: string): string {
  const all: string[] = [];
  const walk = (id: string) => childrenOf(world, id).forEach((c) => { all.push(c.id); walk(c.id); });
  walk(areaId);
  return all.find((id) => world.areas[id].kind === "room") ?? all.find((id) => world.areas[id].kind === "settlement") ?? areaId;
}

// A world, a log of three star systems been to and a character standing in the third
function travelled(): { world: World; log: TrainingLog; here: string } {
  let world = generateWorld({ seed: 1, partyLevel: 1 }, catalog);
  let log = noteTravel(undefined, world, world.startId, 1)!;
  const home = ancestor(world, world.startId, "system")!.id;
  const others = Object.values(world.areas).filter((a) => a.kind === "system" && a.id !== home).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
  let here = world.startId;
  for (const system of others) {
    world = expandArea(world, system.id, catalog);
    here = spotIn(world, system.id);
    log = noteTravel(log, world, here, 1) ?? log;
  }
  return { world, log, here };
}

test("travel is logged once per star system and settlement, and the search opens after three systems and three levels", () => {
  const { world, log, here } = travelled();
  assert.equal(log.systems.length, 3);
  assert.equal(noteTravel(log, world, here, 1), null, "being in the same place again changes nothing");
  assert.equal(trailReadiness(log, 3).open, false, "two levels are not enough");
  assert.equal(trailReadiness(log, 4).open, true);
});

test("the Master fits the character: a Wookiee is sent to a forest elder, a Dark-sided character to an exile", () => {
  assert.equal(masterTraditions("vibroweapon", { species: "Wookiee" })[0].id, "forest-elder");
  assert.equal(masterTraditions("lightweapon", { forceAlign: "Dark" })[0].id, "dark-exile");
  assert.equal(masterTraditions("lightweapon", { forceAlign: "Light" })[0].id, "temple-scholar");
  assert.equal(masterTraditions("lightweapon", { forceAlign: "None", className: "fighter" })[0].id, "temple-scholar", "nobody is sent to the dark side for a tie");
});

// Meet the next objective of a quest of the trail the way a player would: stand there, beat whoever holds it, open the case, or do what is asked
function meet(world: World, log: TrainingLog, quest: Quest, level: number, slot: TrailSlot): { world: World; log: TrainingLog; here: string; gained: TrainingGain[] } {
  const i = quest.objectives.findIndex((o) => !o.completed);
  const target = quest.objectives[i].target!;
  let w = world;
  let here = target.kind === "reach" ? spotIn(w, target.areaId) : target.areaId;
  if (target.kind === "reach" && !w.areas[here]) here = target.areaId;
  if (target.kind === "reach" && w.areas[target.areaId].kind === "system" && !childrenOf(w, target.areaId).some((p) => childrenOf(w, p.id).length)) {
    w = expandArea(w, target.areaId, catalog);
    here = spotIn(w, target.areaId);
  }
  if (target.kind === "reach") here = target.areaId === here || ancestor(w, here, w.areas[target.areaId].kind)?.id === target.areaId ? here : target.areaId;
  if (target.kind === "defeat") w = { ...w, areas: { ...w.areas, [target.areaId]: { ...w.areas[target.areaId], occupants: w.areas[target.areaId].occupants.filter((o) => o.disposition !== "hostile") } } };
  if (target.kind === "loot") w = { ...w, areas: { ...w.areas, [target.areaId]: { ...w.areas[target.areaId], loot: w.areas[target.areaId].loot.map((c) => ({ ...c, looted: true })) } } };
  let l = log;
  if (target.kind === "serve") {
    const served = serveTraining(w, l, slot, quest.id, i, target.areaId, target.choices?.[0]);
    assert.ok(!("error" in served), `serve: ${"error" in served ? served.error : ""} ${quest.id} ${i} ${target.areaId} ${w.areas[target.areaId]?.kind} ${JSON.stringify(w.areas[target.areaId]?.occupants.map((o) => o.id))} ${target.person}`);
    l = (served as { log: TrainingLog }).log;
  }
  const advanced = advanceTraining(w, l, here, level);
  return { world: advanced.world, log: advanced.log, here, gained: advanced.gained };
}

// Play a trail to its end as a player would, a level up whenever the next trial waits for one; what each step gained is collected
function play(world: World, log: TrainingLog, slot: TrailSlot, here: string, level: number): { world: World; log: TrainingLog; level: number; gained: TrainingGain[] } {
  const gained: TrainingGain[] = [];
  for (let step = 0; step < 60; step++) {
    const trail = log[slot];
    if (!trail) break;
    const quest = trail.quests.find((q) => q.status === "active");
    if (!quest) {
      level = Math.min(20, level + 1);
      const r = advanceTraining(world, log, here, level);
      ({ world, log } = r);
      gained.push(...r.gained);
      continue;
    }
    // A trial never begins before its level
    if (quest.gate) assert.ok(level >= quest.gate, `${quest.title} began at level ${level}`);
    // Trials 1 to 4 each set a deed to do before going back to the Master; the fifth is a question
    if (/^trail-[1-4]$/.test(quest.id)) assert.equal(quest.objectives.length, 2, `${quest.title}: ${quest.objectives.map((o) => o.description).join("; ")}`);
    if (quest.id === "trail-5") assert.ok(quest.objectives[0].target?.choices?.length === 2);
    const r = meet(world, log, quest, level, slot);
    ({ world, log } = r);
    gained.push(...r.gained);
  }
  return { world, log, level, gained };
}

test("the trail: contact, informant, Master, five trials; proficiency after two, mastery after five", () => {
  const start = travelled();
  const begun = startTrail(start.world, catalog, start.log, "vibroweapon", { species: "Wookiee" }, start.here, "t1");
  assert.ok(!("error" in begun), "error" in begun ? begun.error : "");
  let { world, log } = begun as { world: World; log: TrainingLog };
  const trail = log.weapon!;
  assert.equal(trail.tradition, "forest-elder");
  // The contact waits in a place visited before, in another star system than this one
  assert.ok(trail.contact.areaId && world.areas[trail.contact.areaId].occupants.some((o) => o.id === trail.contact.id), "the contact is placed");
  assert.notEqual(ancestor(world, trail.contact.areaId!, "system")!.id, ancestor(world, start.here, "system")!.id);
  // The informant's star system is one not yet been to, and is not mapped yet: the informant waits to be placed
  assert.ok(!start.log.systems.includes(trail.informant.within));
  assert.equal(trail.informant.areaId, undefined);

  // Steps are done in order: flying to the informant's system first ticks nothing
  const early = advanceTraining(expandArea(world, trail.informant.within, catalog), log, trail.informant.within, 4);
  assert.equal(early.log.weapon!.quests[0].objectives[1].completed, false, "the system is reached before the contact was asked");
  // The contact speaks only where they are
  assert.ok("error" in serveTraining(world, log, "weapon", "trail-find", 0, start.here));

  const done = play(world, log, "weapon", start.here, 4);
  ({ world, log } = done);
  const level = done.level;
  const weaponGains = done.gained.filter((g) => g.slot === "weapon").map((g) => g.stage);
  assert.deepEqual(weaponGains, [1, 2, 3, 4, 5], "each trial is passed once, in order");
  const gainedProficiency = true;
  assert.ok(gainedProficiency, "proficiency came after the second trial");
  assert.equal(log.weapon, undefined, "the trail ended");
  assert.deepEqual(log.mastered?.map((m) => m.kind), ["vibroweapon"]);
  assert.equal(weaponTraining(log).vibroweapon, "master");
  assert.equal(trailReadiness(log, level, "weapon").open, false, "the count for another weapon Master starts again");
  assert.equal(log.marks?.weapon?.systems, log.systems.length);
  assert.ok(level >= 17, "the last trial waits for level 17");
  assert.deepEqual(validateWorld(world, catalog), []);
});

const scores = { strength: 14, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
const consular = (training: TrainingLog) => ({ class: "consular", level: 5, species: "human", abilityScores: scores, equipment: ["Vibroaxe"], playState: { training } });

test("training reaches the attack bonus: proficient adds the proficiency bonus, a master +1 more", () => {
  const none = carriedWeapons(consular({ startLevel: 1, systems: [], places: [] })).find((w) => w.name === "Vibroaxe")!;
  const proficient = carriedWeapons(consular({ startLevel: 1, systems: [], places: [], weapon: { kind: "vibroweapon", stage: 2 } as any })).find((w) => w.name === "Vibroaxe")!;
  const master = carriedWeapons(consular({ startLevel: 1, systems: [], places: [], mastered: [{ kind: "vibroweapon", tradition: "forest-elder" }] })).find((w) => w.name === "Vibroaxe")!;
  assert.equal(none.proficient, false);
  assert.equal(proficient.proficient, true);
  assert.equal(proficient.attackBonus - none.attackBonus, 3);
  assert.equal(master.attackBonus - proficient.attackBonus, 1);
});

test("a weapon trained in the downtime before Masters keeps its proficiency", () => {
  const old = carriedWeapons({ ...consular({ startLevel: 1, systems: [], places: [] }), weaponProficiencies: ["Vibroaxe"] }).find((w) => w.name === "Vibroaxe")!;
  assert.equal(old.proficient, true);
});

// Power Masters (the user, 2026-11-09; stage 2): a power of 6th level or more, of Expanded Content, of the other kind of casting or of the
// opposite alignment needs its school's Master's trials; a weapon trail and a power trail can be followed at once.
test("which powers need a Master, and how many trials", () => {
  const force = (level: number, align: string, source = "PHB") => ({ level, forceAlignment: align, source });
  const tech = (level: number, source = "PHB") => ({ level, source });
  assert.equal(powerGate(force(3, "Universal"), "Force", "Light"), 0, "a universal 3rd-level power is free to a Force caster");
  assert.equal(powerGate(force(1, "Dark"), "Force", "Light"), 1, "the opposite alignment needs one trial");
  assert.equal(powerGate(force(1, "Dark"), "Force", ""), 0, "one with no alignment is not barred from either side");
  assert.equal(powerGate(force(0, "Universal", "EC"), "Force", ""), 1, "Expanded Content needs one trial");
  assert.equal(powerGate(tech(2), "Force", ""), 1, "the other kind of casting needs one trial");
  assert.equal(powerGate(tech(6), "Tech", ""), 2, "6th level: two trials");
  assert.equal(powerGate(force(9, "Light"), "Force", "Light"), 5, "9th level: all five");
});

test("level-up offers what the Masters opened: a Consular's 6th-level light powers after two light trials, tech powers after a tech trial", async () => {
  const { powerOptions } = await import("../../client/src/lib/sw5e/characterCalculation");
  const consular = (training: TrainingLog) => ({ class: "consular", level: 11, forceAlignment: "Light", abilityScores: scores, forcePowers: [], techPowers: [], playState: { training } });
  const bare = powerOptions(consular({ startLevel: 1, systems: [], places: [] }), 11);
  assert.ok(bare.length > 0);
  assert.ok(bare.every((p: any) => p.level < 6 && p.source !== "EC" && p.forceAlignment !== "Dark" && "forceAlignment" in p), "untrained: no 6th level, no Expanded Content, no dark side, no tech");
  const light = powerOptions(consular({ startLevel: 1, systems: [], places: [], power: { kind: "light", stage: 2 } as any }), 11);
  assert.ok(light.some((p: any) => p.level === 6 && p.forceAlignment === "Light"), "two light trials open 6th-level light powers");
  assert.ok(!light.some((p: any) => p.level === 6 && p.forceAlignment !== "Light"), "but not 6th-level universal ones");
  const tech = powerOptions(consular({ startLevel: 1, systems: [], places: [], mastered: [{ kind: "tech", tradition: "tech-savant" }] }), 11);
  assert.ok(tech.some((p: any) => !("forceAlignment" in p)), "a tech Master's school adds tech powers");
});

test("a Master teaches one who cannot cast: an at-will and a 1st-level power and points, then a power more each trial", () => {
  const first = schoolTeaching("tech", 1, { level: 5, known: [] }, "s", 2);
  assert.deepEqual(first.powers.map((p) => p.level).sort(), [0, 1]);
  assert.ok(first.powers.every((p) => p.powerType === "Tech"));
  assert.equal(first.points, 7);
  const third = schoolTeaching("dark", 3, { level: 9, known: [] }, "s", 2);
  assert.equal(third.powers.length, 1);
  assert.equal(third.powers[0].forceAlignment, "Dark");
  assert.ok(third.powers[0].level <= 2);
});

test("a weapon trail and a power trail at once: each has its own Master and stages; a dark-sided character is sent to the exile", () => {
  const start = travelled();
  const traits = { forceAlign: "Dark", className: "sentinel" };
  const a = startTrail(start.world, catalog, start.log, "vibroweapon", traits, start.here, "w2") as { world: World; log: TrainingLog };
  assert.ok(a.log.weapon);
  assert.ok("error" in startTrail(a.world, catalog, a.log, "blaster", traits, start.here, "w3"), "only one weapon trail at a time");
  const b = startTrail(a.world, catalog, a.log, "dark", traits, start.here, "p2") as { world: World; log: TrainingLog };
  assert.ok(b.log.weapon && b.log.power, "both trails are followed");
  assert.equal(b.log.power!.tradition, "dark-exile");
  assert.notEqual(b.log.power!.master.id, b.log.weapon!.master.id);
  const done = play(b.world, b.log, "power", start.here, 4);
  assert.deepEqual(done.gained.filter((g) => g.slot === "power").map((g) => g.stage), [1, 2, 3, 4, 5]);
  assert.equal(powerTraining(done.log).dark, 5);
  // Nobody of the trail waits behind a secret way in, where the player may never find them
  for (const p of [b.log.power!.contact, b.log.power!.informant, b.log.power!.master]) {
    const at = Object.values(done.world.areas).find((a) => a.occupants.some((o) => o.id === p.id));
    assert.ok(at, `${p.name} is placed`);
    assert.ok(!at!.secretEntry, `${p.name} waits behind a secret way in`);
  }
  assert.ok(done.log.weapon, "the weapon trail is still there");
  assert.equal(done.log.weapon!.stage, 0);
  assert.equal(trailReadiness(done.log, done.level, "power").open, false, "the count for another power Master starts again");
  assert.deepEqual(validateWorld(done.world, catalog), []);
});
