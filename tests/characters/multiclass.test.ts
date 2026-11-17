// Multiclassing (Player's Handbook, Customization Options), built 2026-11-17: prerequisites, hit points and Hit Dice, the proficiency
// bonus, the proficiencies a new class gives, features by class level, the casting of several classes, and a level-up into a second
// class. The book's tables come from lookups.json `multiclassing` (derived from the chapter's text by the importer).
import test from "node:test";
import assert from "node:assert/strict";
import lookups from "../../shared/data/sw5e/lookups.json";
import classData from "../../shared/data/sw5e/classes.json";
import { equipment } from "../../client/src/lib/sw5e/equipment";
import {
  applyLevelUp, castingKind, castingPools, characterFeatures, classChoices, classLevels, classSummary, classWeaponProficient, combatChoiceSlots,
  combatFeatures, derivedStats, evalAmount, featureContext, experienceForLevel, hitDicePool, hitDiceLabel, levelUpPlan, multiclassPrerequisiteUnmet, multiclassProficiencies,
  nextHitDie, powerClass, savedPools, superiorityDice, type LevelUpChoices,
} from "../../client/src/lib/sw5e/characterCalculation";

const even = { strength: 14, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 };
const hero = (cls: string, level: number, multiclass: any[] = [], extra: Record<string, any> = {}) => ({
  name: "Test", class: cls, level, multiclass, abilityScores: even, experience: experienceForLevel(Math.min(20, level + 1)),
  maxHp: 12, currentHp: 12, armorClass: 12, speed: 30, maxForcePoints: 0, currentForcePoints: 0, maxOtherPoints: 0, currentOtherPoints: 0,
  forcePowers: [], techPowers: [], skillProficiencies: [], savingThrowProficiencies: [], toolProficiencies: [], equipment: [], ...extra,
});
const table = (cls: string, level: number, column: string) => Number(String((classData as any[]).find((c) => c.id === cls).levelChanges[String(level)][column] ?? "").match(/\d+/)?.[0] ?? 0);
// Everything a level-up asks for, filled with the first choices offered
const fill = (character: any, classId: string, more: LevelUpChoices = {}): LevelUpChoices => {
  const first = levelUpPlan(character, more.archetype, classId)!;
  const archetype = more.archetype ?? first.archetypes[0]?.id;
  const plan = levelUpPlan(character, archetype, classId)!;
  return {
    class: classId,
    ...(archetype ? { archetype } : {}),
    ...(plan.abilityScoreImprovement ? { abilities: ["constitution", "constitution"] } : {}),
    powers: plan.powerOptions.slice(0, plan.powersToLearn).map((p) => p.name),
    ...(plan.proficiencies?.skills.count ? { skills: plan.proficiencies.skills.from.filter((s) => !character.skillProficiencies.includes(s)).slice(0, plan.proficiencies.skills.count) } : {}),
    ...(plan.proficiencies?.tools.count ? { tools: plan.proficiencies.tools.from.slice(0, plan.proficiencies.tools.count) } : {}),
    ...more,
  };
};
const levelUp = (character: any, classId: string, more: LevelUpChoices = {}): any => {
  const done = applyLevelUp(character, fill(character, classId, more));
  assert.deepEqual(done.problems, [], `levelling ${classSummary(character)} in ${classId}`);
  const next = { ...character, ...done.changes };
  return { ...next, experience: experienceForLevel(Math.min(20, next.level + 1)) };
};

test("the book's tables are read from its text: ten classes, the Max Power Level table, the features gained once", () => {
  const mc = (lookups as any).multiclassing;
  assert.equal(Object.keys(mc.prerequisites).length, 10);
  assert.equal(Object.keys(mc.proficiencies).length, 10);
  assert.deepEqual(mc.maxPowerLevel, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9]);
  assert.deepEqual(mc.onceOnly, ["Unarmored Defense"]);
  assert.deepEqual(mc.noStacking, ["Extra Attack"]);
});

test("prerequisites: a score of 13 in each group, any ability of a group", () => {
  assert.equal(multiclassPrerequisiteUnmet("engineer", { ...even, intelligence: 12 }), "Intelligence 13");
  assert.equal(multiclassPrerequisiteUnmet("engineer", { ...even, intelligence: 13 }), null);
  assert.equal(multiclassPrerequisiteUnmet("fighter", { ...even, strength: 8, dexterity: 13 }), null);
  assert.equal(multiclassPrerequisiteUnmet("guardian", { ...even, constitution: 12, wisdom: 8, charisma: 8 }), "Constitution 13, Wisdom or Charisma 13");
  assert.equal(multiclassPrerequisiteUnmet("guardian", { ...even, constitution: 13, wisdom: 8, charisma: 13 }), null);
  assert.equal(multiclassPrerequisiteUnmet("scout", { ...even, strength: 10, dexterity: 10 }), "Strength or Dexterity 13");
});

test("prerequisites of both the class left and the class entered (the book's berserker into engineer)", () => {
  const weakMind = { ...hero("berserker", 3), abilityScores: { ...even, intelligence: 10 } };
  const into = classChoices(weakMind).find((c) => c.klass.id === "engineer")!;
  assert.deepEqual(into.unmet, ["Engineer: Intelligence 13"]);
  const weakArm = { ...hero("berserker", 3), abilityScores: { ...even, strength: 10 } };
  assert.deepEqual(classChoices(weakArm).find((c) => c.klass.id === "engineer")!.unmet, ["Berserker (to leave it): Strength 13"]);
  // a level in the class already had is always open
  assert.deepEqual(classChoices(weakArm).find((c) => c.klass.id === "berserker")!.unmet, []);
  const refused = applyLevelUp(weakArm, { class: "engineer" });
  assert.match(refused.problems[0], /Multiclassing into Engineer needs Berserker \(to leave it\): Strength 13/);
  assert.equal(refused.changes, undefined);
});

test("hit points: a new class gives the average of its own die, never its 1st-level maximum; Hit Dice are kept by size", () => {
  // Fighter 1 (d10, Con +2): 12 hit points; into operative (d8): 8 / 2 + 1 + 2 = 7 more
  let c: any = hero("fighter", 1);
  c = levelUp(c, "operative");
  assert.equal(c.maxHp, 19);
  assert.equal(c.level, 2);
  assert.deepEqual(c.multiclass.map((e: any) => [e.class, e.level]), [["operative", 1]]);
  // a fighter level: d10 average, 6 + 2
  c = levelUp(c, "fighter");
  assert.equal(c.maxHp, 27);
  // consular (d6) into guardian (d10): 6 + 2
  const sage = levelUp(hero("consular", 1, [], { maxHp: 8, currentHp: 8 }), "guardian");
  assert.equal(sage.maxHp, 16);
  // "If you are a fighter 5/operative 5, for example, you have five d10 Hit Dice and five d8 Hit Dice"
  const both = hero("fighter", 10, [{ class: "operative", level: 5 }]);
  assert.deepEqual(hitDicePool(both), [{ die: 10, count: 5 }, { die: 8, count: 5 }]);
  assert.equal(hitDiceLabel(both), "5d10 + 5d8");
  // "both the fighter and the guardian have a d10 ... you have ten d10 Hit Dice"
  assert.deepEqual(hitDicePool(hero("fighter", 10, [{ class: "guardian", level: 5 }])), [{ die: 10, count: 10 }]);
  // house rule: the largest are spent first
  assert.equal(nextHitDie({ ...both, hitDiceUsed: 4 }), 10);
  assert.equal(nextHitDie({ ...both, hitDiceUsed: 5 }), 8);
  assert.equal(nextHitDie({ ...both, hitDiceUsed: 10 }), null);
});

test("proficiency bonus by the character level: a fighter 3/operative 2 has +3", () => {
  let c: any = hero("fighter", 3);
  c = levelUp(c, "operative");
  c = levelUp(c, "operative");
  assert.equal(c.level, 5);
  assert.equal(classSummary(c), "Fighter 3 / Operative 2");
  assert.equal(c.proficiencyBonus, 3);
  // a feature's numbers read "your proficiency bonus" and "your level" by the character level, "your operative level" by the class's
  const ctx = featureContext(hero("fighter", 9, [{ class: "operative", level: 1 }]), "operative");
  assert.deepEqual([ctx.level, ctx.totalLevel], [1, 9]);
  assert.deepEqual(evalAmount("your proficiency bonus", ctx), { flat: 4 });
  assert.deepEqual(evalAmount("your level", ctx), { flat: 9 });
  assert.deepEqual(evalAmount("your operative level", ctx), { flat: 1 });
});

test("the proficiencies a new class gives: the table's armor and weapons, a skill and a tool chosen", () => {
  assert.deepEqual(multiclassProficiencies("fighter").armor, ["Light armor", "Medium armor"]);
  assert.deepEqual(multiclassProficiencies("fighter").weapons, ["all blasters", "all vibroweapons"]);
  const op = multiclassProficiencies("operative");
  assert.equal(op.skills.count, 1);
  assert.ok(op.skills.from.length >= 18, "any one skill");
  assert.equal(op.tools.count, 1);
  assert.ok(op.tools.from.length > 0 && op.tools.from.every((t) => equipment.find((e) => e.name === t)?.kind === "Kit"), "a specialist's kit");
  assert.equal(multiclassProficiencies("scout").skills.from.length, (classData as any[]).find((c) => c.id === "scout").skillChoicesList.length);
  // the choices are asked for at the level-up, and saved
  const start = hero("consular", 1);
  const missing = applyLevelUp(start, { class: "operative" });
  assert.ok(missing.problems.some((p) => /Choose 1 skill/.test(p)) && missing.problems.some((p) => /Choose 1 tool/.test(p)));
  const c = levelUp(start, "operative", { skills: ["Stealth"] });
  assert.ok(c.skillProficiencies.includes("Stealth"));
  assert.equal(c.toolProficiencies.length, 1);
  assert.deepEqual(c.armorProficiencies, ["Light armor"]);
  assert.deepEqual(c.multiclass[0].skills, ["Stealth"]);
  // saving throws are not gained from a second class
  assert.deepEqual(c.savingThrowProficiencies, []);
});

test("weapons: the first class's full list, a later class's multiclass list (a consular who takes fighter; a monk's techblades)", () => {
  const blaster = equipment.find((e) => e.weaponClassification === "MartialBlaster")!;
  const consular = hero("consular", 1);
  assert.equal(classWeaponProficient(consular, blaster), false);
  assert.equal(classWeaponProficient(hero("consular", 2, [{ class: "fighter", level: 1 }]), blaster), true);
  const techblade = equipment.find((e) => e.name === "Techblade")!;
  const otherBlade = equipment.find((e) => e.weaponClassification === "MartialVibroweapon" && e.name !== "Techblade")!;
  const dabbler = hero("consular", 2, [{ class: "monk", level: 1 }]);
  assert.equal(classWeaponProficient(dabbler, techblade), true);
  assert.equal(classWeaponProficient(dabbler, otherBlade), false);
});

test("features by the level in each class, Extra Attack not adding up, Unarmored Defense once", () => {
  // a fighter 4/monk 1 (5th level) has neither class's Extra Attack; a fighter 5/monk 1 has the fighter's
  const names = (c: any) => characterFeatures(c).map((f) => `${f.source}:${f.name}`);
  assert.ok(!names(hero("fighter", 5, [{ class: "monk", level: 1 }])).some((n) => /Extra Attack$/.test(n)));
  assert.ok(names(hero("fighter", 6, [{ class: "monk", level: 1 }])).includes("Fighter:Extra Attack"));
  assert.ok(!names(hero("fighter", 6, [{ class: "monk", level: 1 }])).includes("Monk:Extra Attack"));
  // fighter 5/guardian 5: two Extra Attacks, still two attacks
  const both = combatFeatures(hero("fighter", 10, [{ class: "guardian", level: 5 }]));
  assert.equal(both.filter((f) => f.attacksPerAction).length, 2);
  assert.equal(Math.max(...both.map((f) => f.attacksPerAction ?? 1)), 2);
  // berserker 2/monk 1: Unarmored Defense from the berserker only, and the AC is the berserker's (10 + Dex + Con)
  const ud = characterFeatures(hero("berserker", 3, [{ class: "monk", level: 1 }])).filter((f) => f.name === "Unarmored Defense");
  assert.deepEqual(ud.map((f) => f.source), ["Berserker"]);
  assert.equal(derivedStats({ ...hero("berserker", 3, [{ class: "monk", level: 1 }]), abilityScores: { ...even, constitution: 16, wisdom: 10 } }).armorClass, 10 + 2 + 3);
  // "your fighter level" and "half your consular level" are the levels in those classes
  const mixed = combatFeatures(hero("fighter", 6, [{ class: "consular", level: 4 }]));
  assert.equal(mixed.find((f) => f.name === "Second Wind")?.heal?.amount.flat, 2);
  assert.equal(mixed.find((f) => f.name === "Force Recovery")?.onRest?.points.flat, 2 + 2);
  // Sneak Attack's dice from the operative table at the operative level
  const sneak = combatFeatures(hero("operative", 7, [{ class: "fighter", level: 4 }])).find((f) => f.name === "Sneak Attack");
  assert.equal(sneak?.extraDamage?.dice, `${table("operative", 3, "Sneak Attack")}d6`);
  // the Monk's Martial Arts die at the monk level
  assert.equal(derivedStats(hero("fighter", 8, [{ class: "monk", level: 3 }])).naturalWeapons[0]?.damage, `1d${table("monk", 3, "Martial Arts")}`);
});

test("superiority: the dice of the fighter and scholar make one pool; the size from the tables at their levels added", () => {
  const c = hero("fighter", 5, [{ class: "scholar", level: 2 }]);
  const dice = superiorityDice(c)!;
  assert.equal(dice.count, table("fighter", 3, "Superiority Dice Quantity") + table("scholar", 2, "Superiority Dice Quantity"));
  assert.equal(dice.size, Math.max(table("fighter", 5, "Superiority Dice Size"), table("scholar", 5, "Superiority Dice Size")));
  assert.equal(combatChoiceSlots(c).maneuvers, table("fighter", 3, "Maneuvers Known") + table("scholar", 2, "Maneuvers Known"));
});

test("casting of one kind from two classes: the book's Marauder berserker 4/guardian 3 casts at 2nd level; points added, the modifier once", () => {
  const c = hero("berserker", 7, [{ class: "guardian", level: 3 }], { subclass: "marauder-approach" });
  const [force] = castingPools(c);
  assert.equal(force.kind, "Force");
  assert.equal(force.maxLevel, 2);
  assert.deepEqual(force.classes.map((x) => [x.id, x.level]), [["berserker", 4], ["guardian", 3]]);
  assert.equal(force.points, force.tablePoints + 2);
  // consular 3/guardian 2: each class's own table points, added
  const pair = castingPools(hero("consular", 5, [{ class: "guardian", level: 2 }]))[0];
  assert.equal(pair.tablePoints, table("consular", 3, "Force Points") + table("guardian", 2, "Force Points"));
  // consular 9/guardian 9: 9/9 x 9 + 5/9 x 9 = 14th caster level: 7th-level powers
  assert.equal(castingPools(hero("consular", 18, [{ class: "guardian", level: 9 }]))[0].maxLevel, 7);
  // one caster class among others follows its own table ("the rules as described in that class")
  assert.equal(castingPools(hero("fighter", 8, [{ class: "consular", level: 5 }]))[0].maxLevel, table("consular", 5, "Max Power Level"));
});

test("powers known per class, as if single-classed (the book's scout 4/consular 3)", () => {
  const c = hero("scout", 7, [{ class: "consular", level: 3 }]);
  const pools = castingPools(c);
  assert.deepEqual(pools.map((p) => p.kind), ["Tech", "Force"]);
  assert.equal(pools[0].classes[0].known, 6, "the book: 6 tech powers");
  assert.equal(pools[0].maxLevel, 1);
  assert.equal(pools[1].maxLevel, 2);
  assert.equal(pools[1].classes[0].known, table("consular", 3, "Force Powers Known"));
  // a level in consular offers force powers to learn up to the consular's own Max Power Level, counted against the consular's known
  const plan = levelUpPlan(c, undefined, "consular")!;
  assert.equal(plan.classLevel, 4);
  assert.ok(plan.powerOptions.length > 0 && plan.powerOptions.every((p) => "forceAlignment" in p && p.level <= table("consular", 4, "Max Power Level")));
  assert.equal(plan.powersToLearn, table("consular", 4, "Force Powers Known"));
});

test("force and tech pools kept apart: a consular who takes engineer saves the tech points in the second pool", () => {
  let c: any = hero("consular", 2, [], { maxForcePoints: 10, currentForcePoints: 7 });
  const before = castingPools(c)[0].points;
  c = levelUp(c, "engineer");
  assert.equal(castingKind(c), "Force");
  const pools = savedPools(c);
  assert.deepEqual(pools.map((p) => p.kind), ["Force", "Tech"]);
  // the force pool keeps what was spent; the tech pool is the engineer's table + Intelligence
  assert.equal(c.maxForcePoints, 10 + (castingPools(c)[0].points - before));
  assert.equal(c.currentForcePoints, 7);
  assert.equal(c.maxOtherPoints, table("engineer", 1, "Tech Points") + 2);
  assert.equal(c.currentOtherPoints, c.maxOtherPoints);
  // the tech powers learned are the engineer's, the older force powers the consular's
  assert.ok(c.techPowers.length > 0 && c.techPowers.every((p: any) => p.castClass === "engineer"));
  assert.ok(c.techPowers.every((p: any) => powerClass(c, p) === "engineer"));
  assert.ok(c.forcePowers.every((p: any) => powerClass(c, p) === "consular"));
});

test("archetypes per class at 3rd level in that class, and saved with it", () => {
  let c: any = hero("fighter", 3, [], { subclass: undefined });
  // fighter 3 takes its archetype at its own 3rd level; then two operative levels and the operative's at its 3rd
  c = levelUp({ ...c, level: 2 }, "fighter");
  assert.ok(c.subclass);
  c = levelUp(c, "operative");
  c = levelUp(c, "operative");
  const plan = levelUpPlan(c, undefined, "operative")!;
  assert.equal(plan.classLevel, 3);
  assert.ok(plan.archetypes.length > 0 && plan.archetypes.every((a) => a.parentClass === "operative"));
  c = levelUp(c, "operative");
  const op = classLevels(c).find((e) => e.klass.id === "operative")!;
  assert.equal(op.level, 3);
  assert.ok(op.archetype && op.archetype.parentClass === "operative");
  assert.equal(c.multiclass[0].subclass, op.archetype!.id);
  // an Ability Score Improvement at the 4th level in a class, not at the 4th character level
  assert.equal(levelUpPlan({ ...hero("fighter", 3, [{ class: "operative", level: 1 }]) }, undefined, "fighter")!.abilityScoreImprovement, false);
  assert.equal(levelUpPlan({ ...hero("fighter", 4, [{ class: "operative", level: 1 }]) }, undefined, "fighter")!.abilityScoreImprovement, true);
});

test("a single-class character is as before", () => {
  const c = hero("consular", 5);
  assert.deepEqual(classLevels(c).map((e) => [e.klass.id, e.level]), [["consular", 5]]);
  assert.equal(classSummary(c), "Consular");
  assert.equal(hitDiceLabel(c), "d6");
  assert.equal(levelUpPlan(c)!.classId, "consular");
  assert.equal(savedPools(c).length, 1);
});

test("review fixes: a later class does not cast through the first class's archetype; saved points kept; no skill asked that is known", () => {
  // a fighter with a tech archetype (Adept Specialist) who takes operative learns no powers through the operative
  const adept = hero("fighter", 4, [], { subclass: "adept-specialist" });
  assert.equal(levelUpPlan(adept, undefined, "operative")!.powerOptions.length, 0);
  // a fighter with 4 points a Master taught keeps them on becoming a consular
  const taught = levelUp(hero("fighter", 1, [], { maxForcePoints: 4, currentForcePoints: 4 }), "consular");
  assert.equal(taught.maxForcePoints, 4 + castingPools(taught)[0].points);
  // proficient in every skill a scout may take: the level-up asks for none
  const scoutSkills = multiclassProficiencies("scout").skills.from;
  const done = applyLevelUp(hero("fighter", 1, [], { abilityScores: { ...even }, skillProficiencies: scoutSkills }), { class: "scout" });
  assert.ok(!done.problems.some((p) => /skill/.test(p)), done.problems.join("; "));
});
