// Maneuvers that add a superiority die to a skill check (2026-11-09; T-012): read from the maneuver's own sentence, kept out of the fight's
// list, and offered to the checks of play (GameBoard spends the die when the check would fail and the die could save it).
import test from "node:test";
import assert from "node:assert/strict";
import { checkManeuvers, combatFeatures } from "../../client/src/lib/sw5e/characterCalculation";
import { maneuvers } from "../../client/src/lib/sw5e/maneuvers";
import { SKILLS } from "../../client/src/lib/sw5e/constants";

const scores = { strength: 14, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 };
const fighter = (names: string[]): any => ({ class: "fighter", level: 20, species: "human", abilityScores: scores, fighterManeuvers: { styles: [], maneuvers: names } });

test("the maneuvers that add a die to a skill check name a skill of the rules data", () => {
  const all = checkManeuvers(fighter((maneuvers as any[]).map((m) => m.name)));
  assert.equal(all.length, 18, "Assist, Conceal, Deceive, Empathize, Flex, Flourish, Handle Animal, Investigate, Naturalize, Perceive, Perform, Persuade, Pilot, Program, Study, Survive, Threaten, Tumble");
  const skills = SKILLS.map((s) => s.name.toLowerCase());
  for (const m of all) assert.ok(skills.includes(m.skill), `${m.name} names ${m.skill}`);
  assert.equal(all.find((m) => m.name === "Persuade")?.skill, "persuasion");
  assert.equal(all.find((m) => m.name === "Program")?.skill, "technology");
});

test("only the chosen ones count, they carry the character's die, and a fight does not list them", () => {
  const ch = fighter(["Persuade", "Tumble", "Parry"]);
  const mine = checkManeuvers(ch);
  assert.deepEqual(mine.map((m) => m.name).sort(), ["Persuade", "Tumble"]);
  assert.ok(mine[0].size >= 4 && mine[0].count >= 1);
  const inFight = combatFeatures(ch).map((f) => f.name);
  assert.ok(!inFight.includes("Persuade") && !inFight.includes("Tumble"));
  assert.ok(inFight.includes("Parry"));
  assert.deepEqual(checkManeuvers({ class: "fighter", level: 20, abilityScores: scores }), []);
});
