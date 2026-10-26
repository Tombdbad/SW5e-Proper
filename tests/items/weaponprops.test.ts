// The weapon properties played since 2026-10-26 (second round): bright, biting and corruption strikes that force a save, specialized,
// penetrating shots, switch weapons, smart weapons and modal weapons.
import test from "node:test";
import assert from "node:assert/strict";
import { useCombat, attackPlan, playerSpec, type Combatant } from "../../client/src/lib/stores/useCombat";
import { carriedWeapons } from "../../client/src/lib/sw5e/characterCalculation";

const player = { id: 1, name: "Duelist", currentHp: 30, maxHp: 30, armorClass: 14, level: 5, abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 }, speed: 30, conditions: [] } as any;
const foe = (id: number, x: number, extra: Partial<Combatant> = {}): any => ({ id, name: `Thug ${id}`, hp: 40, maxHp: 40, armorClass: 5, initiative: 0, x, y: 3, attackBonus: 1, damageDice: "1d4", rangedAttacker: false, abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }, saves: { dexterity: 0, constitution: 0, wisdom: 0 }, size: "Medium", ...extra });
const arena = { width: 12, height: 8, assets: [] } as any;
const start = (kit: Partial<Combatant>, foes = [foe(2, 2)]) => {
  useCombat.getState().initiateCombat(player, foes, { meleeDice: "1d6", meleeWeapon: "Saber", meleeAttack: 6, meleeDamage: 3, meleeType: "fire", meleeProps: [], ...kit }, true, arena, { x: 1, y: 3 }, []);
  const s = useCombat.getState();
  const mi = s.combatants.findIndex((c) => c.isPlayer);
  useCombat.setState({ currentTurn: mi, combatants: s.combatants.map((c, i) => (i === mi ? { ...c, actions: 1, bonus: 1, attacksLeft: 0 } : c)), autoEnd: false, targetId: foes[0]?.id ?? null });
};
const me = () => useCombat.getState().combatants.find((c) => c.isPlayer)!;
const them = (id = 2) => useCombat.getState().combatants.find((c) => c.id === id)!;
const withDice = (value: number, run: () => void) => {
  const random = Math.random;
  Math.random = () => value;
  try { run(); } finally { Math.random = random; }
};
const log = () => useCombat.getState().combatLog.join(" | ");

test("bright: the target saves (Dex, DC the lower of 8 + attack and the number); failed, it takes the damage and burns again", () => {
  start({ meleeProps: ["Bright 13", "luminous"], meleeAbility: "dexterity" });
  useCombat.getState().setWeaponMode({ saveStrike: true });
  withDice(0.01, () => useCombat.getState().attack("melee"));
  assert.match(log(), /\(bright 13\): DEX save \d+ against DC 13, failed/);
  assert.ok(them().hp < 40);
  assert.deepEqual(them().afterburn, { amount: 3, type: "fire" });
  // A high roll saves
  start({ meleeProps: ["Bright 13"] });
  useCombat.getState().setWeaponMode({ saveStrike: true });
  withDice(0.99, () => useCombat.getState().attack("melee"));
  assert.match(log(), /saved/);
  assert.equal(them().hp, 40);
});

test("specialized: the property's number is the DC on its own", () => {
  start({ meleeAttack: 2, meleeProps: ["Bright 15", "specialized (bright)"] });
  useCombat.getState().setWeaponMode({ saveStrike: true });
  withDice(0.01, () => useCombat.getState().attack("melee"));
  assert.match(log(), /against DC 15/);
});

test("biting: a failed Con save leaves the target's next attack at disadvantage; corruption: no hit points back", () => {
  start({ meleeType: "acid", meleeProps: ["Biting 13"] });
  useCombat.getState().setWeaponMode({ saveStrike: true });
  withDice(0.01, () => useCombat.getState().attack("melee"));
  assert.equal(them().shaken, true, log());
  const plan = attackPlan(arena, useCombat.getState().combatants, them(), me(), "melee");
  assert.equal(plan.mode, -1);
  assert.ok(plan.reasons.some((r) => /biting/.test(r)));
  start({ meleeType: "necrotic", meleeProps: ["Corruption 13"] });
  useCombat.getState().setWeaponMode({ saveStrike: true });
  withDice(0.01, () => useCombat.getState().attack("melee"));
  assert.equal(them().blighted, me().id, log());
});

test("penetrating: the shot goes on into the creature behind the target", () => {
  start({ rangedDice: "2d6", rangedWeapon: "Beam rifle", rangedAttack: 30, rangedDamage: 2, rangedType: "energy", rangedProps: ["penetrating 2", "power cell (range 100/400)"] }, [foe(2, 4), foe(3, 6)]);
  useCombat.getState().setWeaponMode({ penetrate: true });
  withDice(0.5, () => useCombat.getState().attack("ranged"));
  assert.ok(them(2).hp < 40, log());
  assert.ok(them(3).hp < 40, `the one behind: ${log()}`);
  assert.match(log(), /goes through Thug 2 into Thug 3/);
});

test("switch: the weapon's alternate damage, turned to in turn", () => {
  const c = { rangedDice: "1d8", rangedType: "energy", rangedSwitch: { dice: "2d4", types: ["acid", "cold"] }, switched: 2 } as unknown as Combatant;
  assert.deepEqual([playerSpec(c, "ranged")!.dice, playerSpec(c, "ranged")!.damageType], ["2d4", "cold"]);
  assert.deepEqual([playerSpec({ ...c, switched: 0 }, "ranged")!.dice, playerSpec({ ...c, switched: 0 }, "ranged")!.damageType], ["1d8", "energy"]);
});

test("smart weapons use their own Dexterity and proficiency; a modal weapon is carried as each of its modes", () => {
  const ch = { class: "operative", level: 9, abilityScores: { strength: 10, dexterity: 8, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }, equipment: ["Smart pistol", "Bo-rifle"] };
  const ws = carriedWeapons(ch);
  const smart = ws.find((w) => w.name === "Smart pistol")!;
  assert.ok(smart, ws.map((w) => w.name).join(", "));
  // Dexterity 15 (+2) in place of 8 (-1); +2 proficiency in place of the level's +4 when proficient
  assert.equal(smart.attackBonus, 2 + (smart.proficient ? 2 : 0));
  assert.equal(smart.damageBonus, 2);
  const modes = ws.filter((w) => w.name.startsWith("Bo-rifle ("));
  assert.deepEqual(modes.map((w) => [w.name, w.ranged]), [["Bo-rifle (blaster rifle)", true], ["Bo-rifle (techstaff)", false]]);
});
