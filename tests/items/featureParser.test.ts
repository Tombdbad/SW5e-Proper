// The feature-text parser (audit T-013, 2026-11-08): `featureEffects` and `combatFeatures` in client/src/lib/sw5e/characterCalculation.ts read what
// a class's features do from the rules text. Nothing tested them, so an edit to one regex could silently drop a Fighter's Action Surge or a
// Berserker's armor. This is a floor, not a snapshot of every word: for each of the 10 classes at levels 1, 5, 11 and 20, the number of features
// the parser reads, of those in a fight, passive, with uses, and the armor formulas, skill and save proficiencies it finds must not fall below
// what it found when the test was written. A rise is good news: raise the number here (do not lower one without saying why).
import test from "node:test";
import assert from "node:assert/strict";
import { combatFeatures, characterFeatures, featureEffects } from "../../client/src/lib/sw5e/characterCalculation";
import classes from "../../shared/data/sw5e/classes.json";

const scores = { strength: 14, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 12, charisma: 12 };
const make = (cls: string, level: number) => ({ class: cls, level, abilityScores: scores });

// class: [level 1, 5, 11, 20] of [all features, combat features, passive, with uses, armor formulas, save proficiencies]
const FLOOR: Record<string, number[][]> = {
  berserker: [[2, 1, 0, 1, 1, 0], [8, 4, 2, 1, 1, 0], [14, 6, 4, 1, 1, 0], [23, 7, 4, 0, 1, 0]],
  consular: [[2, 1, 1, 1, 0, 0], [7, 2, 1, 2, 0, 0], [11, 2, 1, 2, 0, 0], [18, 2, 1, 2, 0, 0]],
  engineer: [[2, 1, 0, 1, 0, 0], [6, 2, 1, 2, 0, 0], [8, 2, 1, 2, 0, 0], [13, 2, 1, 2, 0, 0]],
  fighter: [[2, 1, 0, 1, 0, 0], [8, 3, 1, 2, 0, 0], [14, 5, 3, 3, 0, 0], [21, 6, 4, 3, 0, 0]],
  guardian: [[2, 3, 1, 3, 0, 0], [8, 4, 2, 3, 0, 0], [14, 5, 3, 3, 0, 0], [22, 6, 3, 3, 0, 0]],
  monk: [[2, 1, 0, 0, 1, 0], [9, 4, 1, 1, 1, 0], [19, 9, 2, 1, 1, 0], [30, 10, 2, 1, 1, 6]],
  operative: [[1, 1, 1, 0, 0, 0], [7, 4, 3, 1, 0, 0], [14, 5, 4, 1, 0, 0], [25, 6, 5, 2, 0, 1]],
  scholar: [[2, 1, 0, 0, 0, 0], [6, 2, 0, 0, 0, 0], [10, 2, 0, 0, 0, 0], [18, 4, 2, 2, 0, 0]],
  scout: [[2, 1, 0, 0, 0, 0], [9, 2, 1, 0, 0, 0], [16, 3, 2, 0, 0, 0], [27, 4, 2, 0, 0, 0]],
  sentinel: [[2, 0, 0, 0, 0, 0], [7, 4, 2, 1, 0, 0], [13, 5, 2, 1, 0, 0], [21, 5, 2, 1, 0, 0]],
};
const LEVELS = [1, 5, 11, 20];

test("the ten classes are all covered by the floor table", () => {
  const ids = ((Array.isArray(classes) ? classes : Object.values(classes as any)) as any[]).map((c) => c.id ?? c.name).sort();
  assert.deepEqual(ids, Object.keys(FLOOR).sort());
});

for (const [cls, rows] of Object.entries(FLOOR)) {
  test(`${cls}: the parser reads at least as much as it did`, () => {
    rows.forEach((floor, i) => {
      const ch = make(cls, LEVELS[i]);
      const all = characterFeatures(ch);
      const cf = combatFeatures(ch);
      const fx = featureEffects(all, ch);
      const got = [all.length, cf.length, cf.filter((x) => x.activation === "passive").length, cf.filter((x) => x.uses).length, fx.armor.length, fx.saves.length];
      got.forEach((n, k) => assert.ok(n >= floor[k], `${cls} level ${LEVELS[i]}: ${["features", "combat features", "passive", "with uses", "armor formulas", "save proficiencies"][k]} ${n} fell below ${floor[k]}`));
    });
  });
}

test("named effects the play depends on are still read", () => {
  const fighter = combatFeatures(make("fighter", 20));
  assert.ok(fighter.some((f) => f.extraAction), "Action Surge gives an extra action");
  assert.ok(fighter.some((f) => (f.attacksPerAction ?? 0) >= 2), "Extra Attack gives more than one attack");
  const berserker = featureEffects(characterFeatures(make("berserker", 1)), make("berserker", 1));
  assert.ok(berserker.armor.some((a) => a.base === 10 && a.abilities.flat().includes("constitution")), "the Berserker's armor class from Constitution");
  const monk = featureEffects(characterFeatures(make("monk", 1)), make("monk", 1));
  assert.ok(monk.armor.some((a) => a.abilities.flat().includes("wisdom")), "the Monk's armor class from Wisdom");
  assert.ok(monk.unarmed, "the Monk's unarmed strike die");
  assert.equal(featureEffects(characterFeatures(make("monk", 20)), make("monk", 20)).saves.length, 6, "Diamond Soul: proficiency in all saving throws");
});
