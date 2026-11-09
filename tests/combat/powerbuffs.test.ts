// Powers that give the caster a boon (2026-11-09; T-016): a shield's AC, temporary hit points, resistance, advantage on saving throws,
// disadvantage for attackers, read from the power's text (rules.ts powerBuff) and played in the fight as a condition with `mods`.
import test from "node:test";
import assert from "node:assert/strict";
import { useCombat, attackPlan, armorClassNow, damageFactor, type Combatant, type CombatPower } from "../../client/src/lib/stores/useCombat";
import { powerEffect, powerCost, buffMechanics } from "../../client/src/lib/sw5e/rules";
import { forcePowers } from "../../client/src/lib/sw5e/forcePowers";
import { techPowers } from "../../client/src/lib/sw5e/techPowers";

Math.random = () => 0.5;
const named = (name: string): any => [...(forcePowers as any[]), ...(techPowers as any[])].find((p) => p.name === name);
const effectOf = (name: string) => {
  const p = named(name);
  return powerEffect({ level: p.level, description: p.description, duration: p.duration, concentration: p.concentration }, 10);
};
const asPower = (name: string): CombatPower => {
  const p = named(name);
  return { name, cost: powerCost(p), castTime: "action", ...effectOf(name), modifier: 3, attack: 6, dc: 14 } as CombatPower;
};

const player = { id: 1, name: "Adept", currentHp: 30, maxHp: 30, armorClass: 12, level: 10, abilityScores: { strength: 10, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 }, speed: 30, conditions: [] } as any;
const foe = (id: number, x: number): any => ({ id, name: `Trooper ${id}`, hp: 40, maxHp: 40, armorClass: 12, initiative: 0, x, y: 3, attackBonus: 4, damageDice: "1d6", rangedAttacker: false, saves: {} });
const start = (powers: CombatPower[]) => {
  useCombat.getState().initiateCombat(player, [foe(2, 2)], { powers, powerPoints: 20, meleeDice: "1d6", meleeAttack: 5, meleeWeapon: "Vibroblade", reach: 5 } as Partial<Combatant>, true, { width: 14, height: 8, assets: [] } as any, { x: 1, y: 3 }, []);
  const s = useCombat.getState();
  const i = s.combatants.findIndex((c) => c.isPlayer);
  useCombat.setState({ currentTurn: i, autoEnd: false, combatants: s.combatants.map((c, k) => (k === i ? { ...c, actions: 1, bonus: 1, attacksLeft: 0, usedTurn: [] } : c)) });
};
const me = () => useCombat.getState().combatants.find((c) => c.isPlayer)!;
const them = () => useCombat.getState().combatants.find((c) => c.id === 2)!;

test("powerBuff: what a boon gives is read from the text, and a choice of effects or a power that needs a failed save is left to the player", () => {
  assert.equal(effectOf("Energy Shield").kind, "buff");
  assert.equal(effectOf("Energy Shield").buff?.ac, 5);
  assert.equal(effectOf("Buffer").temp, "1d4+4");
  assert.equal(effectOf("Armor of Abeloth").temp, "5");
  assert.deepEqual(effectOf("Ballistic Shield").buff?.resist, ["kinetic", "energy", "ion"]);
  assert.equal(effectOf("Force Blur").buff?.disAgainst, true);
  assert.deepEqual(effectOf("Beacon of Hope").buff?.advSaves, ["wisdom"]);
  const sure = effectOf("Precognition").buff!;
  assert.ok(sure.advAttacks && sure.disAgainst && sure.advSaves?.includes("all"));
  assert.equal(effectOf("Knight Speed").buff?.ac, 2);
  assert.equal(effectOf("Agile Defense").dodge, true);
  // (a power whose boon is bound to a condition, offers a list of effects, or lands only on a failed save, is not read as one)
  assert.notEqual(effectOf("Force Enlightenment").kind, "buff");
  assert.notEqual(effectOf("Reveal Shatterpoint").kind, "buff");
  assert.equal(effectOf("Aura of Purity").buff?.advSaves, undefined);
});

test("a shield power raises the caster's AC until it runs out, and its condition shows what it does", () => {
  start([asPower("Energy Shield"), asPower("Knight Speed")]);
  assert.equal(me().conditions?.length ?? 0, 0);
  useCombat.getState().castPower(0);
  const shield = me().conditions!.find((c) => c.name === "Energy Shield")!;
  assert.ok(shield.mods?.ac === 5, "the shield sits on the caster as a condition with its AC");
  assert.match(useCombat.getState().combatLog.join("\n"), /Energy Shield.*\+5 AC/);
  assert.equal(armorClassNow(me()), 17);
});

test("temporary hit points are taken first, and the dice are rolled", () => {
  start([asPower("Buffer")]);
  useCombat.getState().castPower(0);
  assert.ok((me().tempHp ?? 0) >= 5 && (me().tempHp ?? 0) <= 8);
  assert.equal(me().hp, 30);
});

test("resistance halves the damage types it names, and disadvantage for attackers shows in the attack plan", () => {
  start([asPower("Ballistic Shield"), asPower("Force Blur")]);
  assert.equal(damageFactor(me(), "kinetic"), 1);
  useCombat.getState().castPower(0);
  assert.equal(damageFactor(me(), "kinetic"), 0.5);
  assert.equal(damageFactor(me(), "ion"), 0.5);
  assert.equal(damageFactor(me(), "fire"), 1);
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, actions: 1 } : c)) });
  useCombat.getState().castPower(1);
  const plan = attackPlan({ width: 14, height: 8, assets: [] } as any, useCombat.getState().combatants, them(), me(), "melee");
  assert.equal(plan.mode, -1);
});

test("a boon's mechanics give advantage on the saves it names", () => {
  const m = buffMechanics({ advSaves: ["wisdom"], advAttacks: true });
  assert.deepEqual(m.advantageSaves, ["wisdom"]);
  assert.equal(m.ownAttacks.melee, 1);
  assert.equal(m.ownAttacks.ranged, 1);
});

test("a heal of a set amount is read from the power's sentence, and its casting modifier is not added", () => {
  assert.deepEqual([effectOf("Greater Heal").dice, effectOf("Greater Heal").flat], ["70", true]);
  assert.deepEqual([effectOf("Force Mend").dice, effectOf("Force Mend").flat], ["4d8+15", true]);
  assert.equal(effectOf("Master Heal").dice, "9999");
  // (what an aura lets its caster do later with a bonus action is not the cast)
  assert.notEqual(effectOf("Slow-Release Medpac").kind, "heal");
  start([asPower("Greater Heal")]);
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, hp: 5, maxHp: 100 } : c)) });
  useCombat.getState().castPower(0);
  assert.equal(me().hp, 75, "5 + 70, with no modifier");
});

test("a weapon-hit boon adds its dice to each hit of the caster", () => {
  assert.deepEqual(effectOf("Force Focus").buff?.extra, { dice: "1d4", type: "force" });
  assert.deepEqual(effectOf("Dark Aura").buff?.extra, { dice: "1d8", type: "necrotic" });
  start([asPower("Force Focus")]);
  useCombat.getState().castPower(0);
  newTurn();
  const before = them().hp;
  useCombat.getState().attack("melee");
  assert.match(useCombat.getState().combatLog.join("\n"), /more force damage/);
  assert.ok(them().hp < before);
});

const newTurn = () => {
  const s = useCombat.getState();
  const i = s.combatants.findIndex((c) => c.isPlayer);
  useCombat.setState({ currentTurn: i, combatants: s.combatants.map((c, k) => (k === i ? { ...c, actions: 1, bonus: 1, attacksLeft: 0, usedTurn: [] } : c)) });
};
