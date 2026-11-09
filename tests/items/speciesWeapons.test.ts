// Audit T-015 (2026-11-09): weapon proficiency was read from the class's list only. A species that names its weapons ("You have proficiency
// with the heavy pistol and sniper rifle") and the Weapon Expert feat ("proficiency with all blasters") were ignored, so the attack bonus
// left out the proficiency bonus. Choices ("two vibroweapons of your choice") are not stored on a character and stay with the player.
import test from "node:test";
import assert from "node:assert/strict";
import { carriedWeapons } from "../../client/src/lib/sw5e/characterCalculation";

const scores = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
const hero = (extra: object, gun: string) => ({ class: "consular", level: 5, abilityScores: scores, equipment: [gun], ...extra });
const gun = (c: any, name: string) => carriedWeapons(c).find((w) => w.name === name)!;

test("a Chiss is proficient with the heavy pistol, a human is not", () => {
  const chiss = gun(hero({ species: "chiss" }, "Heavy pistol"), "Heavy pistol");
  const human = gun(hero({ species: "human" }, "Heavy pistol"), "Heavy pistol");
  assert.equal(human.proficient, false);
  assert.equal(chiss.proficient, true);
  assert.equal(chiss.attackBonus - human.attackBonus, 3, "the proficiency bonus at 5th level");
});

test("a species that names other weapons does not grant this one", () => {
  assert.equal(gun(hero({ species: "chiss" }, "Vibroaxe"), "Vibroaxe").proficient, false);
  assert.equal(gun(hero({ species: "gamorrean" }, "Vibroaxe"), "Vibroaxe").proficient, true);
});

test("a named weapon is not matched inside a longer name (Voss: blaster rifle, not heavy blaster rifle)", () => {
  assert.equal(gun(hero({ species: "voss" }, "Blaster rifle"), "Blaster rifle").proficient, true);
  assert.equal(gun(hero({ species: "voss" }, "Heavy blaster rifle"), "Heavy blaster rifle").proficient, false);
});

test("the Weapon Expert feat gives all blasters", () => {
  assert.equal(gun(hero({ species: "human", feats: [] }, "Heavy blaster rifle"), "Heavy blaster rifle").proficient, false);
  assert.equal(gun(hero({ species: "human", feats: ["Weapon Expert"] }, "Heavy blaster rifle"), "Heavy blaster rifle").proficient, true);
  assert.equal(gun(hero({ species: "human", feats: ["Weapon Expert"] }, "Vibroaxe"), "Vibroaxe").proficient, true, "all vibroweapons too");
});
