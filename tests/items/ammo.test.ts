// Ammunition in a fight (2026-10-21; client/src/lib/stores/useCombat.ts with shared/logic gear.ts): a shot spends a round from the load,
// an empty weapon cannot fire, reloading takes an action or a bonus action (free with a pouch or belt) and spends what it loads, a special
// round changes the damage and brings its rider, burst fire spends its number, burning ground hurts whoever starts a turn in it, and a
// weapon's Strength requirement gives disadvantage.
import test from "node:test";
import assert from "node:assert/strict";
import { useCombat, attackPlan, reloadPlan, propertyRiders, roundSave, type Combatant } from "../../client/src/lib/stores/useCombat";
import { ammoRider } from "../../shared/logic/index";
import equipment from "../../shared/data/sw5e/equipment.json";

const item = (name: string) => (equipment as any[]).find((e) => e.name === name);
const player = { id: 1, name: "Shooter", currentHp: 30, maxHp: 30, armorClass: 14, level: 5, abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 }, speed: 30, conditions: [] } as any;
const foe = (id: number, x: number, extra: Partial<Combatant> = {}): any => ({ id, name: `Trooper ${id}`, hp: 40, maxHp: 40, armorClass: 5, initiative: 0, x, y: 3, attackBonus: 1, damageDice: "1d4", rangedAttacker: false, saves: { dexterity: -5, constitution: -5, wisdom: -5 }, ...extra });
const kit = (ammo: Partial<NonNullable<Combatant["ammo"]>>, extra: Partial<Combatant> = {}): Partial<Combatant> => ({
  rangedDice: "1d6", rangedWeapon: "Blaster pistol", rangedAttack: 30, rangedDamage: 3, rangedProps: ["Power cell (range 50/200)", "reload 16"], rangedType: "energy", range: [50, 200],
  ammo: { weapon: "Blaster pistol", family: "cell", left: 16, max: 16, plain: "Power cell", riders: { "Power cell": {}, "Incendiary cell": ammoRider(item("Incendiary cell")) }, reserves: { "Power cell": 2, "Incendiary cell": 1 }, free: false, shotsPer: { "Power cell": 1, "Incendiary cell": 1 }, ...ammo },
  ...extra,
});
const arena = { width: 12, height: 8, assets: [] } as any;
const start = (ammo: Partial<NonNullable<Combatant["ammo"]>> = {}, extra: Partial<Combatant> = {}, foes = [foe(2, 8)]) => {
  useCombat.getState().initiateCombat(player, foes, kit(ammo, extra), true, arena, { x: 1, y: 3 }, []);
  // The player's turn, whatever the initiative said
  const s = useCombat.getState();
  const me = s.combatants.findIndex((c) => c.isPlayer);
  useCombat.setState({ currentTurn: me, combatants: s.combatants.map((c, i) => (i === me ? { ...c, actions: 1, bonus: 1, attacksLeft: 0 } : c)), autoEnd: false });
};
const me = () => useCombat.getState().combatants.find((c) => c.isPlayer)!;

test("a shot spends a round; an empty weapon cannot fire", () => {
  start();
  useCombat.getState().attack("ranged");
  assert.equal(me().ammo!.left, 15);
  start({ left: 0 });
  useCombat.getState().attack("ranged");
  assert.equal(me().ammo!.left, 0);
  assert.match(useCombat.getState().combatLog.at(-1)!, /out of ammunition/);
});

test("reloading takes an action or a bonus action, or nothing with a belt, and spends what it loads", () => {
  start({ left: 3 });
  assert.equal(reloadPlan(me()).cost, "bonus");
  useCombat.getState().reload();
  assert.deepEqual([me().ammo!.left, me().ammo!.reserves["Power cell"], me().bonus, me().spentAmmo?.["Power cell"]], [16, 1, 0, 1]);
  assert.match(reloadPlan(me()).why, /fully loaded/);
  start({ left: 3, free: true });
  assert.equal(reloadPlan(me()).cost, "free");
  useCombat.getState().reload("Incendiary cell");
  assert.deepEqual([me().ammo!.round, me().ammo!.left, me().bonus, me().actions], ["Incendiary cell", 16, 1, 1]);
  start({ left: 0, reserves: {} });
  assert.match(reloadPlan(me()).why, /no power cell left/);
  // Cartridges go in one a shot, up to the reload number
  start({ family: "cartridge", left: 0, max: 12, plain: "Slug cartridge", reserves: { "Slug cartridge": 5 }, riders: { "Slug cartridge": {} }, shotsPer: { "Slug cartridge": 1 } });
  useCombat.getState().reload();
  assert.deepEqual([me().ammo!.left, me().ammo!.reserves["Slug cartridge"]], [5, 0]);
});

test("a bow draws each arrow from the quiver; none left, no shot", () => {
  start({ weapon: "Compound bow", family: "arrow", max: 0, left: 0, plain: "Arrow", reserves: { Arrow: 1 }, riders: { Arrow: {} }, shotsPer: { Arrow: 1 } }, { rangedWeapon: "Compound bow", rangedProps: ["special (range 75/300)"] });
  useCombat.getState().attack("ranged");
  assert.deepEqual([me().ammo!.reserves.Arrow, me().spentAmmo?.Arrow], [0, 1]);
  start({ weapon: "Compound bow", family: "arrow", max: 0, left: 0, plain: "Arrow", reserves: { Arrow: 0 }, riders: { Arrow: {} }, shotsPer: { Arrow: 1 } }, { rangedWeapon: "Compound bow", rangedProps: ["special (range 75/300)"] });
  useCombat.getState().attack("ranged");
  assert.match(useCombat.getState().combatLog.at(-1)!, /out of ammunition/);
});

test("an incendiary cell turns the damage to fire and leaves the ground burning", () => {
  start({ round: "Incendiary cell" });
  // (no natural 1: the dice roll the middle)
  const random = Math.random;
  Math.random = () => 0.5;
  try {
    useCombat.getState().attack("ranged");
  } finally {
    Math.random = random;
  }
  const s = useCombat.getState();
  assert.ok(s.combatLog.some((l) => /ablaze/.test(l)), s.combatLog.slice(-4).join(" | "));
  assert.equal(s.zones.length, 1);
  assert.equal(s.zones[0].type, "fire");
});

test("riders: a weapon's shocking number and a round's save", () => {
  assert.deepEqual(propertyRiders(["shocking 13"]), [{ dc: 13, ability: "dexterity", damage: "1d4", damageType: "lightning", conditions: ["shocked"], rounds: 1 }]);
  assert.deepEqual(propertyRiders(["finesse"]), []);
  const save = roundSave(ammoRider(item("Arrow, Electroshock")));
  assert.deepEqual([save?.ability, save?.dc, save?.damage, save?.conditions], ["dexterity", 14, "1d3", ["stunned"]]);
});

test("burst fire spends its number and every creature by the target saves", () => {
  start({ left: 16 }, { rangedProps: ["Power cell (range 50/200)", "reload 16", "burst 4"] }, [foe(2, 8), foe(3, 9)]);
  useCombat.getState().spray("burst");
  const s = useCombat.getState();
  assert.equal(me().ammo!.left, 12);
  assert.ok(s.combatLog.filter((l) => /Trooper [23] (fails|saves)/.test(l)).length >= 2, s.combatLog.slice(-5).join(" | "));
});

test("a weapon's Strength requirement gives disadvantage unless braced", () => {
  start({}, { rangedProps: ["Power cell (range 50/200)", "reload 4", "strength 13"] });
  const s = useCombat.getState();
  const target = s.combatants.find((c) => !c.isPlayer)!;
  const plan = attackPlan(s.arena, s.combatants, me(), target, "ranged", { range: [50, 200], props: ["strength 13"] });
  assert.ok(plan.down && plan.reasons.includes("Strength 13 needed"));
  const braced = attackPlan(s.arena, s.combatants, { ...me(), braced: true }, target, "ranged", { range: [50, 200], props: ["strength 13"] });
  assert.ok(!braced.reasons.includes("Strength 13 needed"));
});
