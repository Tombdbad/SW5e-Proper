// Audit T-014 (2026-11-08): nine archetypes give a class without casting its own powers and points (a 1/3 or 1/6 caster table in the archetype's
// `leveledTable`), but the game read only the class's casterType, so a Marauder, a Slicer or a Shield Specialist saw no powers to choose and no
// points. The archetype's table is now used when the class has none.
import test from "node:test";
import assert from "node:assert/strict";
import archetypeData from "../../shared/data/sw5e/archetypes.json";
import { applyLevelUp, castingKind, chooseArchetype, experienceForLevel, levelUpPlan, powerOptions } from "../../client/src/lib/sw5e/characterCalculation";

const scores = { strength: 14, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 };
const CASTING = (archetypeData as any[]).filter((a) => a.casterType !== "None" && a.leveledTable);

test("the nine archetypes that grant casting are found in the data", () => {
  assert.equal(CASTING.filter((a) => a.casterRatio > 0).length, 9);
});

for (const a of CASTING) {
  const cls = String(a.className).toLowerCase();
  const knownAt3 = Number((a.leveledTable["3"] as any[]).find((c) => /Powers Known/.test(c.key)).value);
  const pointsAt3 = Number((a.leveledTable["3"] as any[]).find((c) => /Points/.test(c.key)).value);
  const hero = { class: cls, level: 2, experience: experienceForLevel(3), abilityScores: scores, maxForcePoints: 0, currentForcePoints: 0, forcePowers: [], techPowers: [] };

  test(`${a.name} (${a.className}): taking it at 3rd level gives ${knownAt3} ${a.casterType} powers to learn and its points`, () => {
    const plan = levelUpPlan(hero, a.id)!;
    assert.equal(plan.powersToLearn, knownAt3);
    assert.ok(plan.powerOptions.length >= knownAt3, "too few powers to choose from");
    assert.ok(plan.powerOptions.every((p: any) => p.level <= 1), "a power above the table's maximum level");
    assert.ok(plan.powerOptions.every((p: any) => ("forceAlignment" in p) === (a.casterType === "Force")), "powers of the wrong kind");
    const done = applyLevelUp(hero, { archetype: a.id, abilities: ["strength", "dexterity"], powers: plan.powerOptions.slice(0, knownAt3).map((p: any) => p.name) });
    assert.deepEqual(done.problems.filter((p) => /power/i.test(p)), []);
    assert.equal(done.changes?.maxForcePoints, pointsAt3 + 2, "points: the table's plus the casting modifier (+2)");
  });

  test(`${a.name}: a character already at 3rd level takes it from the sheet and gets the points`, () => {
    const changes = chooseArchetype({ ...hero, level: 3 }, a.id);
    assert.equal(changes?.maxForcePoints, pointsAt3 + 2);
    assert.equal(castingKind({ ...hero, level: 3, subclass: a.id }), a.casterType);
  });
}

test("a class that casts, and one that does not, are as before", () => {
  const consular = { class: "consular", level: 3, abilityScores: scores, forcePowers: [], techPowers: [] };
  assert.ok(powerOptions(consular, 3).length > 0);
  assert.equal(castingKind(consular), "Force");
  const fighter = { class: "fighter", level: 3, abilityScores: scores, forcePowers: [], techPowers: [] };
  assert.equal(powerOptions(fighter, 3).length, 0);
  assert.equal(castingKind(fighter), "None");
});
