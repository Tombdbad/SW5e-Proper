// Weapon Masters (the user, 2026-11-09; stage 1 of AUDIT/TRAINER_QUESTS_DESIGN.md): after three star systems and three levels a character
// may seek a Master of a weapon type. A contact in a place visited before names a star system; an informant there names the Master's place;
// the Master sets five trials, each waiting for its level. Two passed make the character proficient with the type, five a master of it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceTraining, ancestor, childrenOf, expandArea, generateWorld, masterTraditions, noteTravel, serveTraining, startWeaponTrail, trailReadiness,
  validateWorld, weaponTraining, type Quest, type TrainingLog, type World,
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
function meet(world: World, log: TrainingLog, quest: Quest, level: number): { world: World; log: TrainingLog; here: string } {
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
    const served = serveTraining(w, l, quest.id, i, target.areaId, target.choices?.[0]);
    assert.ok(!("error" in served), `serve: ${"error" in served ? served.error : ""} ${quest.id} ${i} ${target.areaId} ${w.areas[target.areaId]?.kind} ${JSON.stringify(w.areas[target.areaId]?.occupants.map((o) => o.id))} ${target.person}`);
    l = (served as { log: TrainingLog }).log;
  }
  const advanced = advanceTraining(w, l, here, level);
  return { world: advanced.world, log: advanced.log, here };
}

test("the trail: contact, informant, Master, five trials; proficiency after two, mastery after five", () => {
  const start = travelled();
  const begun = startWeaponTrail(start.world, catalog, start.log, "vibroweapon", { species: "Wookiee" }, start.here, "t1");
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
  assert.ok("error" in serveTraining(world, log, "trail-find", 0, start.here));

  let level = 4;
  let gainedProficiency = false;
  for (let step = 0; step < 60; step++) {
    const weapon = log.weapon;
    if (!weapon) break;
    const quest = weapon.quests.find((q) => q.status === "active");
    if (!quest) {
      level = Math.min(20, level + 1);
      ({ world, log } = advanceTraining(world, log, start.here, level));
      continue;
    }
    // A trial never begins before its level
    if (quest.gate) assert.ok(level >= quest.gate, `${quest.title} began at level ${level}`);
    // Trials 1 to 4 each set a deed to do before going back to the Master; the fifth is a question
    if (/^trail-[1-4]$/.test(quest.id)) assert.equal(quest.objectives.length, 2, `${quest.title}: ${quest.objectives.map((o) => o.description).join("; ")}`);
    if (quest.id === "trail-5") assert.ok(quest.objectives[0].target?.choices?.length === 2);
    ({ world, log } = meet(world, log, quest, level));
    if (log.weapon && log.weapon.stage >= 2 && !gainedProficiency) {
      gainedProficiency = true;
      assert.equal(weaponTraining(log).vibroweapon, "proficient");
    }
  }
  assert.ok(gainedProficiency, "proficiency came after the second trial");
  assert.equal(log.weapon, undefined, "the trail ended");
  assert.deepEqual(log.mastered?.map((m) => m.kind), ["vibroweapon"]);
  assert.equal(weaponTraining(log).vibroweapon, "master");
  assert.equal(log.systems.length, 0, "the log starts again for another Master");
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
