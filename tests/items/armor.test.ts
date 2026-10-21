// Armour and shield properties in play (2026-10-21; shared/logic gear.ts armorTraits, and the fight in client/src/lib/stores/useCombat.ts):
// the Strength requirement and Cumbersome cost speed, Bulky, Obtrusive, Silent and the stealth flag steer Stealth, and in a fight Absorptive,
// Regulated, Reactive, Avoidant, Insulated and Imbalanced do what their texts say.
import test from "node:test";
import assert from "node:assert/strict";
import { armorTraits, stealthMode, rigidDex, parseItemEffects, sumEffects, describeEffects } from "../../shared/logic/index";
import { useCombat, rollDamage, type Combatant } from "../../client/src/lib/stores/useCombat";
import enhanced from "../../shared/data/sw5e/enhancedItems.json";
import equipment from "../../shared/data/sw5e/equipment.json";

const row = (name: string) => {
  const r = (equipment as any[]).find((e) => e.name === name);
  assert.ok(r, `no ${name}`);
  return r;
};
const traits = (names: string[], strength: number) => armorTraits(names.map(row), strength);

test("a Strength requirement not met costs 10 feet of speed, Cumbersome 5, and a shield's counts with the armour's", () => {
  assert.equal(traits(["Assault armor"], 15).speed, 0);
  assert.equal(traits(["Assault armor"], 14).speed, -10);
  assert.equal(traits(["Combat suit"], 8).speed, 0, "no requirement");
  assert.equal(traits(["Duranium combat suit"], 10).speed, -5);
  assert.equal(traits(["Laminanium assault"], 12).speed, -15, "cumbersome and too weak");
  assert.equal(traits(["Assault armor", "Heavy physical shield"], 10).speed, -20, "armour and shield each want 15");
  assert.deepEqual(traits(["Assault armor"], 12).notes, ["Assault armor wants Strength 15: speed -10"]);
});

test("stealth: heavy and bulky armour is disadvantage, Silent advantage, a mix cancels", () => {
  assert.equal(traits(["Battle armor"], 20).stealthDisadvantage, true);
  assert.equal(traits(["Heavy physical shield"], 20).stealthDisadvantage, true, "obtrusive");
  assert.equal(traits(["Combat suit"], 10).stealthDisadvantage, false);
  assert.equal(traits(["Duravlex fiber armor"], 10).stealthAdvantage, true);
  assert.equal(stealthMode(traits(["Battle armor"], 20)), -1);
  assert.equal(stealthMode(traits(["Duravlex fiber armor"], 10)), 1);
  assert.equal(stealthMode(traits(["Fiber armor"], 10)), 0);
  assert.equal(stealthMode({ stealthDisadvantage: true, stealthAdvantage: true }), 0);
});

test("the properties are read from the items: absorb, regulated, rigid, reactive, avoidant, insulated, imbalanced", () => {
  const a = traits(["Crystadium medium shield"], 13);
  assert.deepEqual([a.absorb, a.imbalanced, a.shield], [1, true, 0]);
  assert.equal(armorTraits([{ name: "Crystadium medium shield", properties: ["Absorptive 1", "imbalanced"], shieldBonus: 2 }], 13).shield, 2);
  assert.equal(traits(["Beskar weave armor"], 11).regulated, true);
  assert.equal(traits(["Durasteel exoskeleton"], 17).rigid, true);
  assert.equal(traits(["Duranium combat suit"], 10).reactive, 1);
  assert.equal(traits(["Fleximetal fiber armor"], 11).avoidant, 1);
  assert.equal(traits(["Neutronium mesh"], 11).insulated, 5);
  // An enhanced shield's "damage you take is reduced by 2" adds to it
  assert.equal(armorTraits([{ name: "Shield (Champion)", absorb: 2 }], 10).absorb, 2);
  assert.equal(armorTraits([{ name: "x", properties: undefined }], 10).absorb, 0);
});

test("rigid armour halves a Dexterity bonus, never a penalty", () => {
  assert.deepEqual([4, 3, 1, 0, -1, -3].map(rigidDex), [2, 1, 0, 0, -1, -3]);
});

// ---- In a fight
const player = { id: 1, name: "Guard", currentHp: 60, maxHp: 60, armorClass: 14, level: 5, abilityScores: { strength: 14, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 }, speed: 30, conditions: [] } as any;
// A trooper that always hits (+50), for a fixed damage, three squares off (it walks up and strikes)
const trooper = (extra: Partial<Combatant> = {}): any => ({ id: 2, name: "Trooper", hp: 200, maxHp: 200, armorClass: 5, initiative: -10, x: 2, y: 3, attackBonus: 50, damageDice: "1d1", rangedAttacker: false, saves: { dexterity: 0, constitution: 0 }, ...extra });
const arena = { width: 12, height: 8, assets: [] } as any;
const fight = (armorProps: Combatant["armorProps"], foe: any = trooper(), extra: Partial<Combatant> = {}) => {
  useCombat.getState().initiateCombat(player, [foe], { armorProps, meleeDice: "1d1", meleeWeapon: "Vibroblade", meleeAttack: 50, meleeDamage: 0, meleeProps: [], reach: 5, ...extra }, false, arena, { x: 1, y: 3 }, []);
  const s = useCombat.getState();
  const me = s.combatants.findIndex((c) => c.isPlayer);
  useCombat.setState({ currentTurn: me, combatants: s.combatants.map((c, i) => (i === me ? { ...c, actions: 1, bonus: 1, attacksLeft: 0, usedTurn: [] } : c)), autoEnd: false });
};
const me = () => useCombat.getState().combatants.find((c) => c.isPlayer)!;
// The trooper takes its turn (one attack: 1d1 plus the bonus damage)
const foeTurn = (dmg = 1) => {
  const s = useCombat.getState();
  const i = s.combatants.findIndex((c) => c.id === 2);
  useCombat.setState({ currentTurn: i, combatants: s.combatants.map((c) => (c.id === 2 ? { ...c, actions: 1, moved: 0, damageDice: `${dmg}d1`, usedTurn: [] } : c)) });
  // (every d20 shows 11: no natural 1 and no critical hit unless the target's state makes it one)
  const real = Math.random;
  Math.random = () => 0.5;
  try { useCombat.getState().aiStep(); } finally { Math.random = real; }
};

test("absorptive armour takes damage from a weapon down but a hit always leaves 1; regulated rerolls a die's best roll", () => {
  fight({ absorb: 0 });
  const hp0 = me().hp;
  foeTurn(5);
  assert.equal(hp0 - me().hp, 5, "no absorb: all of it");
  fight({ absorb: 2 });
  const hp1 = me().hp;
  foeTurn(5);
  assert.equal(hp1 - me().hp, 3, "5 less 2");
  fight({ absorb: 9 });
  const hp2 = me().hp;
  foeTurn(5);
  assert.equal(hp2 - me().hp, 1, "never below 1");
  // Regulated: a d4 that rolls 4 is rolled again (so over many dice the average falls; 4s still turn up from the second roll)
  let plain = 0, regulated = 0;
  for (let i = 0; i < 4000; i++) { plain += rollDamage("1d4", false, 0, false, false); regulated += rollDamage("1d4", false, 0, false, true); }
  assert.ok(Math.abs(plain / 4000 - 2.5) < 0.1, `plain average ${plain / 4000}`);
  // 1/4 of the time the die shows 4 and is rolled again: the mean is 2.5 - 4/4*... = (1+2+3+x)/4 with x = 2.5
  assert.ok(Math.abs(regulated / 4000 - 2.125) < 0.1, `regulated average ${regulated / 4000}`);
});

test("reactive armour: AC against the next attack of whoever hit it, until its own turn begins", () => {
  // The hit is remembered, and forgotten when the character's turn begins (the trooper's turn ends and theirs starts)
  fight({ absorb: 0, reactive: 3 }, trooper({ attackBonus: 8 }));
  foeTurn(1);
  assert.equal(useCombat.getState().combatants[useCombat.getState().currentTurn].isPlayer, true, "the character's turn began");
  assert.equal(me().reactiveFrom, undefined, "forgotten at the start of it");
  // While it stands, three more AC against that attacker: the log says so and the hit needs the higher number
  fight({ absorb: 0, reactive: 3 }, trooper({ attackBonus: 3 }));
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, reactiveFrom: [2] } : c)) });
  foeTurn(1);
  const log = useCombat.getState().combatLog.join("\n");
  // d20 11 + 3 = 14 against AC 14 + 3: a miss that would have been a hit without the armour
  assert.match(log, /misses \(14 against 17\)/);
  fight({ absorb: 0, reactive: 3 }, trooper({ attackBonus: 3 }));
  foeTurn(1);
  assert.match(useCombat.getState().combatLog.join("\n"), /hits Guard/, "without it the same attack hits");
});

test("imbalanced: a critical hit leaves the shield open and takes the reaction away (said in the log); a plain hit does not", () => {
  // An unconscious target is hit as if by a critical hit in melee (the conditions data)
  fight({ absorb: 0, imbalanced: true, shield: 2 }, trooper());
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, conditions: [{ name: "Unconscious", rounds: 5 }] } : c)) });
  foeTurn(1);
  assert.match(useCombat.getState().combatLog.join("\n"), /shield is knocked wide by the critical hit/);
  // No critical hit, no knock
  fight({ absorb: 0, imbalanced: true, shield: 2 }, trooper());
  foeTurn(1);
  assert.doesNotMatch(useCombat.getState().combatLog.join("\n"), /knocked wide/);
  // The open shield costs its AC against the next attack: 11 + 4 = 15 misses AC 14 + 2 only when the shield is on... open it by hand
  fight({ absorb: 0, imbalanced: true, shield: 2 }, trooper({ attackBonus: 3 }));
  foeTurn(1);
  assert.match(useCombat.getState().combatLog.join("\n"), /hits Guard/, "14 against 14 hits");
  fight({ absorb: 0, imbalanced: true, shield: 2 }, trooper({ attackBonus: 3 }));
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, armorClass: 16, open: true } : c)) });
  foeTurn(1);
  assert.match(useCombat.getState().combatLog.join("\n"), /hits Guard \(shield open \(-2 AC\)/, "AC 16 less the open shield's 2 is 14: a hit");
});

test("insulated armour lifts a low d20 against ion and lightning only", () => {
  const grenade = (type: string) => useCombat.getState().itemEffect({ kind: "explosive", label: "Grenade", targetId: 2, radius: 15, maxFeet: 60, dc: 20, save: "dexterity", damage: [{ dice: "1d1", type }], conditions: [], conditionRounds: 1 });
  const real = Math.random;
  Math.random = () => 0.5;
  try {
    // d20 11 against DC 20: a fail, unless the armour counts the die as 20
    fight({ absorb: 0 });
    grenade("ion");
    assert.match(useCombat.getState().combatLog.join("\n"), /Guard fails the save/);
    fight({ absorb: 0, insulated: 20 });
    grenade("ion");
    assert.match(useCombat.getState().combatLog.join("\n"), /Guard saves/);
    fight({ absorb: 0, insulated: 20 });
    grenade("lightning");
    assert.match(useCombat.getState().combatLog.join("\n"), /Guard saves/);
    // Fire is not ion or lightning: the armour does nothing
    fight({ absorb: 0, insulated: 20 });
    grenade("fire");
    assert.match(useCombat.getState().combatLog.join("\n"), /Guard fails the save/);
    // A number below the roll changes nothing
    fight({ absorb: 0, insulated: 5 });
    grenade("ion");
    assert.match(useCombat.getState().combatLog.join("\n"), /Guard fails the save/);
  } finally {
    Math.random = real;
  }
});

test("an enhanced shield's \"damage you take is reduced by N\" is read from its text and adds up", () => {
  const rows = (enhanced as any[]).filter((r) => r.type === "Shield" && /damage you take is reduced by/i.test(r.text));
  assert.ok(rows.length >= 2, `${rows.length} shields reduce damage`);
  for (const r of rows) assert.ok(parseItemEffects(r.text).absorb! >= 1, r.name);
  assert.equal(sumEffects([{ absorb: 1 }, { absorb: 2 }, { ac: 1 }]).absorb, 3);
  assert.match(describeEffects({ absorb: 2 }), /damage taken -2/);
});
