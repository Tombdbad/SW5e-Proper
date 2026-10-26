// Rules of the fight that were missing (2026-10-26): exhaustion's levels, grappling and shoving (and a stat block's grapple with its
// escape DC), damage taken while dying, and the weapon properties versatile, thrown, mighty, dire, piercing and defensive.
import test from "node:test";
import assert from "node:assert/strict";
import { useCombat, attackPlan, speedFactor, tradeOf, playerSpec, grappledBy, dyingDamage, LASTING, type Combatant, type AttackSpec } from "../../client/src/lib/stores/useCombat";
import { carriedWeapons } from "../../client/src/lib/sw5e/characterCalculation";
import { statProfile } from "../../shared/logic/index";
import monsters from "../../shared/data/sw5e/monsters.json";

const player = { id: 1, name: "Brawler", currentHp: 30, maxHp: 30, armorClass: 14, level: 5, abilityScores: { strength: 16, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 }, speed: 30, conditions: [] } as any;
const foe = (id: number, x: number, extra: Partial<Combatant> = {}): any => ({ id, name: `Thug ${id}`, hp: 40, maxHp: 40, armorClass: 5, initiative: 0, x, y: 3, attackBonus: 1, damageDice: "1d4", rangedAttacker: false, abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }, saves: { dexterity: 0, constitution: 0, wisdom: 0 }, size: "Medium", ...extra });
const arena = { width: 12, height: 8, assets: [] } as any;
const start = (kit: Partial<Combatant> = {}, foes = [foe(2, 2)]) => {
  useCombat.getState().initiateCombat(player, foes, { meleeDice: "1d8", meleeWeapon: "Vibroblade", meleeAttack: 30, meleeDamage: 3, meleeProps: [], ...kit }, true, arena, { x: 1, y: 3 }, []);
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

test("exhaustion: speed halved at 2 and gone at 5; attacks and saves at disadvantage from 3", () => {
  assert.equal(speedFactor({ exhaustion: 1 }), 1);
  assert.equal(speedFactor({ exhaustion: 2 }), 0.5);
  assert.equal(speedFactor({ exhaustion: 5 }), 0);
  start({ exhaustion: 3 });
  const plan = attackPlan(arena, useCombat.getState().combatants, me(), them(), "melee");
  assert.equal(plan.mode, -1);
  assert.ok(plan.reasons.some((r) => /exhaustion 3/.test(r)), plan.reasons.join(", "));
});

test("a grapple is a contest that holds the target at speed 0; walking away lets go; an escape breaks it", () => {
  start({ athletics: 30 });
  useCombat.getState().grapple("grapple");
  assert.ok(grappledBy(them()), useCombat.getState().combatLog.join(" | "));
  assert.equal(speedFactor(them()), 0);
  // it took the place of an attack: the Attack action is under way
  assert.equal(me().actions, 0);
  // the grappler walks off: the hold ends
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, moved: 0 } : c)) });
  useCombat.getState().moveTo(5, 3);
  assert.equal(grappledBy(them()), undefined, useCombat.getState().combatLog.slice(-3).join(" | "));
});

test("a shove knocks prone or pushes 5 feet; a creature two sizes larger cannot be shoved", () => {
  start({ athletics: 30 });
  useCombat.getState().grapple("shove-prone");
  assert.ok((them().conditions ?? []).some((c) => c.name === "Prone"));
  start({ athletics: 30 });
  useCombat.getState().grapple("shove-away");
  assert.equal(them().x, 3);
  start({ athletics: 30 }, [foe(2, 2, { size: "Huge" })]);
  useCombat.getState().grapple("shove-prone");
  assert.match(useCombat.getState().combatLog.at(-1)!, /too big/);
});

test("a stat block's grapple is read with its escape DC, and the Escape action is made against it", () => {
  const holder = (monsters as any[]).find((m) => JSON.stringify(m).includes("escape DC"));
  const attack = statProfile(holder).attacks.find((a) => a.grapple);
  assert.ok(attack?.grapple?.dc, `${holder.name}: ${JSON.stringify(statProfile(holder).attacks)}`);
  // held by it, the character escapes with a high roll against the DC
  start({ athletics: 30 }, [foe(2, 2)]);
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, conditions: [{ name: "Grappled", rounds: LASTING, by: 2, source: "a grapple", escape: 15 }] } : c)) });
  useCombat.getState().grapple("escape");
  assert.equal(grappledBy(me()), undefined, useCombat.getState().combatLog.at(-1));
});

test("damage taken while dying is a failed death save (two on a critical hit), and damage of the hit point maximum kills", () => {
  assert.deepEqual(dyingDamage({ successes: 1, failures: 0 }, 5, 30), { saves: { successes: 1, failures: 1 }, dead: false });
  assert.deepEqual(dyingDamage({ successes: 0, failures: 1 }, 5, 30, true), { saves: { successes: 0, failures: 3 }, dead: true });
  assert.equal(dyingDamage({ successes: 0, failures: 0 }, 30, 30).dead, true);
});

test("dire and piercing trade to hit for damage; defensive trades the turn's first attack for AC", () => {
  const spec = (props: string[]): AttackSpec => ({ name: "W", type: "melee", bonus: 5, dice: "1d8", damageBonus: 3, reach: 5, properties: props });
  assert.deepEqual(tradeOf({ trade: -1 } as Combatant, spec(["dire 1"])), { attack: -1, damage: 1, ac: 0 });
  assert.deepEqual(tradeOf({ trade: 1 } as Combatant, spec(["piercing 1"])), { attack: 1, damage: -1, ac: 0 });
  assert.deepEqual(tradeOf({ trade: -1 } as Combatant, spec(["piercing 1"])), { attack: 0, damage: 0, ac: 0 });
  assert.deepEqual(tradeOf({ defend: 1 } as Combatant, spec(["Defensive 1"])), { attack: -1, damage: -1, ac: 1 });
  assert.deepEqual(tradeOf({ defend: 1, usedTurn: ["did:attack"] } as unknown as Combatant, spec(["Defensive 1"])), { attack: 0, damage: 0, ac: 0 });
});

test("weapons: versatile has its two-handed die, a dagger can be thrown, a bow is mighty", () => {
  const ch = (equipment: string[], scores = { strength: 16, dexterity: 12 }) => ({ class: "fighter", level: 5, abilityScores: { constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, ...scores }, equipment });
  const blade = carriedWeapons(ch(["Dire vibroblade"]))[0];
  assert.equal(blade.versatile, "1d10");
  const dagger = carriedWeapons(ch(["Vibrodagger"]))[0];
  assert.equal(dagger.thrown, true);
  assert.deepEqual(dagger.range, [20, 60]);
  const bow = carriedWeapons(ch(["Shortbow"], { strength: 18, dexterity: 10 }))[0];
  assert.equal(bow.ability, "strength");
  // a thrown weapon's spec is a ranged attack at its range; none left, no throw
  const c = { thrown: { name: "Vibrodagger", dice: "1d4", attack: 5, damage: 3, props: [], range: [20, 60], returning: false, left: 2 } } as unknown as Combatant;
  assert.equal(playerSpec(c, "thrown")?.type, "ranged");
  assert.equal(playerSpec({ ...c, thrown: { ...c.thrown!, left: 0 } }, "thrown"), undefined);
});

test("a thrown weapon is spent from the hand; the last one leaves melee unarmed", () => {
  withDice(0.5, () => {
    start({ athletics: 0, meleeWeapon: "Vibrodagger", thrown: { name: "Vibrodagger", dice: "1d4", attack: 30, damage: 2, props: ["thrown (range 20/60)"], range: [20, 60], returning: false, left: 1 } }, [foe(2, 6)]);
    useCombat.getState().attack("thrown");
  });
  assert.equal(me().thrown?.left, 0, useCombat.getState().combatLog.join(" | "));
  assert.equal(me().meleeWeapon, undefined);
});

test("enhanced items' senses are read from their text: darkvision, stealth, a decoy, a guard against weapons, water", async () => {
  const { parseItemEffects } = await import("../../shared/logic/index");
  const items = (await import("../../shared/data/sw5e/enhancedItems.json")).default as any[];
  const of = (name: string) => parseItemEffects(items.find((x) => x.name === name).text);
  assert.equal(of("Darkvision Goggles").darkvision, 60);
  assert.equal(of("Mandalorian Helmet").darkvision, 60);
  assert.equal(of("Aratech Sound Dampening Boots").stealth, 1);
  assert.equal(of("High-Grade Cybernetic Legs").stealth, -1);
  // a set's bonus (with Jensaarai Armor) is not read
  assert.equal(of("Jensaarai Cloak").stealth, undefined);
  assert.equal(of("Defel Mimicker").decoy, true);
  assert.equal(of("Jensaarai Headgear").weaponGuard, true);
  assert.equal(of("Atmospheric Decanting Vessel").water, true);
});

test("a decoy shadow puts attacks at disadvantage until its wearer is hurt", () => {
  start({}, [foe(2, 2)]);
  const thug = them();
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, decoy: true } : c)) });
  assert.equal(attackPlan(arena, useCombat.getState().combatants, thug, me(), "melee").mode, -1);
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, decoyDown: true } : c)) });
  assert.equal(attackPlan(arena, useCombat.getState().combatants, thug, me(), "melee").mode, 0);
});
