// Field gear in a fight (2026-10-21; client/src/lib/stores/useCombat.ts): a holster's free draw and the turn's one free object
// interaction, a fire extinguisher's cone (fires out, blinded until the start of the next turn, immunity on a save), mines that arm at
// the start of the setter's next turn and go off for the other side, and a remote detonator for the paired ones.
import test from "node:test";
import assert from "node:assert/strict";
import { useCombat, drawPlan, type Combatant } from "../../client/src/lib/stores/useCombat";

const player = { id: 1, name: "Rigger", currentHp: 30, maxHp: 30, armorClass: 14, level: 5, abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 }, speed: 30, conditions: [] } as any;
const foe = (id: number, x: number, y = 3, extra: Partial<Combatant> = {}): any => ({ id, name: `Trooper ${id}`, hp: 40, maxHp: 40, armorClass: 5, initiative: 0, x, y, attackBonus: 1, damageDice: "1d4", rangedAttacker: false, saves: { dexterity: -5, constitution: -5, wisdom: -5 }, ...extra });
const kit = (extra: Partial<Combatant> = {}): Partial<Combatant> => ({
  meleeDice: "1d6", meleeWeapon: "Vibroblade", meleeAttack: 30, meleeDamage: 2, meleeType: "energy", meleeProps: [], reach: 5,
  rangedDice: "1d6", rangedWeapon: "Blaster pistol", rangedAttack: 30, rangedDamage: 3, rangedType: "energy", rangedProps: [], range: [50, 200],
  ...extra,
});
const arena = { width: 14, height: 8, assets: [] } as any;
const start = (extra: Partial<Combatant> = {}, foes: any[] = [foe(2, 4)], at = { x: 1, y: 3 }) => {
  useCombat.getState().initiateCombat(player, foes, kit(extra), true, arena, at, []);
  const s = useCombat.getState();
  const me = s.combatants.findIndex((c) => c.isPlayer);
  useCombat.setState({ currentTurn: me, combatants: s.combatants.map((c, i) => (i === me ? { ...c, actions: 1, bonus: 1, attacksLeft: 0, usedTurn: [] } : c)), autoEnd: false });
};
const me = () => useCombat.getState().combatants.find((c) => c.isPlayer)!;
const them = (id: number) => useCombat.getState().combatants.find((c) => c.id === id)!;
const log = () => useCombat.getState().combatLog;
const newTurn = () => {
  const s = useCombat.getState();
  const i = s.combatants.findIndex((c) => c.isPlayer);
  useCombat.setState({ currentTurn: i, combatants: s.combatants.map((c, k) => (k === i ? { ...c, actions: 1, bonus: 1, attacksLeft: 0, usedTurn: [] } : c)) });
};

test("drawPlan: the first attack is made with the weapon brought in; a change takes the free interaction, a second the action; a holster draws free once", () => {
  const base = { id: 1, name: "x", hp: 1, maxHp: 1, initiative: 0, armorClass: 10 } as Combatant;
  assert.equal(drawPlan(base, "ranged").cost, "none");
  assert.equal(drawPlan({ ...base, inHand: "melee" }, "melee").cost, "none");
  assert.equal(drawPlan({ ...base, inHand: "melee" }, "ranged").cost, "interaction");
  assert.equal(drawPlan({ ...base, inHand: "melee", usedTurn: ["interact"] }, "ranged").cost, "action");
  assert.equal(drawPlan({ ...base, inHand: "melee", usedTurn: ["interact"], holster: { ready: true } }, "ranged").cost, "holster");
  assert.equal(drawPlan({ ...base, inHand: "melee", holster: { ready: false } }, "ranged").cost, "interaction");
});

test("changing weapons in a fight: free once a turn, refused a second time, the action by Switch weapon", () => {
  start({}, [foe(2, 2)]);
  useCombat.getState().attack("ranged");
  assert.equal(me().inHand, "ranged");
  // (an Extra Attack: one more attack in the same Attack action)
  const more = () => useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, attacksLeft: 1 } : c)) });
  more();
  useCombat.getState().attack("melee");
  assert.equal(me().inHand, "melee");
  assert.ok(me().usedTurn!.includes("interact"));
  // Back to the blaster: the interaction is used; the attack is refused with a word about it
  const before = them(2).hp;
  more();
  useCombat.getState().attack("ranged");
  assert.equal(me().inHand, "melee");
  assert.equal(them(2).hp, before);
  assert.match(log().at(-1)!, /takes your action: use Switch weapon/);
  // The next turn has its interaction again
  newTurn();
  useCombat.getState().attack("ranged");
  assert.equal(me().inHand, "ranged");
});

test("Switch weapon costs the action when the interaction is gone, and only when nothing was attacked yet", () => {
  start({ inHand: "melee", usedTurn: ["interact"] } as any);
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, usedTurn: ["interact"] } : c)) });
  useCombat.getState().draw("ranged");
  assert.deepEqual([me().inHand, me().actions], ["ranged", 0]);
  // Midway through an Attack action (an attack left) there is no action to spend
  start({ inHand: "melee" });
  useCombat.setState({ combatants: useCombat.getState().combatants.map((c) => (c.isPlayer ? { ...c, usedTurn: ["interact"], attacksLeft: 1 } : c)) });
  useCombat.getState().draw("ranged");
  assert.equal(me().inHand, "melee");
  assert.match(log().at(-1)!, /none to spare/);
});

test("a holster: the draw takes no action and not the interaction; once drawn it is empty until the weapon is stowed (an action)", () => {
  start({ inHand: "melee", holster: { ready: true } });
  useCombat.getState().draw("ranged");
  assert.deepEqual([me().inHand, me().holster!.ready, me().actions, me().usedTurn], ["ranged", false, 1, []]);
  assert.match(log().at(-1)!, /from the holster \(no action\)/);
  // The free interaction is still there for the next change; the holster is not
  useCombat.getState().draw("melee");
  assert.ok(me().usedTurn!.includes("interact"));
  // Stow: an action, and the holster is ready again
  newTurn();
  useCombat.getState().stow();
  assert.deepEqual([me().inHand, me().holster!.ready, me().actions], ["none", true, 0]);
  newTurn();
  useCombat.getState().attack("ranged");
  assert.equal(me().inHand, "ranged");
  assert.equal(me().holster!.ready, false);
  assert.ok(!me().usedTurn!.includes("interact"));
});

test("a fire extinguisher: a cone blinds those who fail until the start of their next turn, the ones who save are immune, fires in it go out", () => {
  start({}, [foe(2, 3, 3), foe(3, 3, 4, { saves: { constitution: 50 } }), foe(4, 1, 6)]);
  useCombat.setState({ zones: [
    { x: 3, y: 3, z: 0, radius: 1, save: "dexterity", dc: 12, dice: "1d6", type: "fire", rounds: 8, source: "Incendiary cell" },
    { x: 3, y: 3, z: 0, radius: 1, save: "dexterity", dc: 14, dice: "2d6", type: "fire", rounds: 8, source: "Incendiary cell (Fine)" },
  ] });
  assert.ok(useCombat.getState().itemEffect({ kind: "extinguish", label: "Fire extinguisher", targetId: 2, cone: 15, dc: 14 }));
  const blind = (id: number) => them(id).conditions?.some((c) => c.name === "Blinded");
  assert.ok(blind(2), "the trooper in the cone fails and is blinded");
  assert.ok(!blind(3) && them(3).immuneTo?.includes("extinguisher"), "one that saves is immune");
  assert.ok(!blind(4) && !them(4).immuneTo, "one out of the cone is untouched");
  // Only the unenhanced fire went out
  assert.deepEqual(useCombat.getState().zones.map((z) => z.source), ["Incendiary cell (Fine)"]);
  assert.equal(me().actions, 0);
  // Blinded until the start of its next turn: gone when that turn begins (the round passes to it)
  useCombat.getState().nextTurn();
  const blindsLeft = () => them(2).conditions?.some((c) => c.name === "Blinded");
  let guard = 0;
  while (blindsLeft() && guard++ < 8) useCombat.getState().nextTurn();
  assert.ok(!blindsLeft());
  assert.ok(guard < 8);
});

const mineEffect = (paired = false): any => ({ kind: "mine", label: "Mine, fragmentation", radius: 15, dc: 14, save: "dexterity", damage: [{ dice: "2d10", type: "kinetic" }], conditions: [], conditionRounds: 10, paired });

test("a mine arms at the start of the setter's next turn and goes off for the other side, not for the party", () => {
  // The trooper is far off; the player sets the mine and ends the turn
  start({}, [foe(2, 12)]);
  assert.ok(useCombat.getState().itemEffect(mineEffect()));
  assert.equal(useCombat.getState().mines.length, 1);
  assert.equal(useCombat.getState().mines[0].armed, false);
  assert.match(log().at(-1)!, /arms at the start of their next turn/);
  // Round on to the player's next turn: armed
  let guard = 0;
  do { useCombat.getState().nextTurn(); } while (!(me().actions === 1 && useCombat.getState().combatants[useCombat.getState().currentTurn].isPlayer) && guard++ < 6);
  assert.equal(useCombat.getState().mines[0].armed, true);
  // The party walking by does not set it off
  useCombat.getState().moveTo(3, 3);
  assert.equal(useCombat.getState().mines.length, 1);
});

test("an enemy that comes within the radius sets an armed mine off: a save for half, the blast hurts everyone near, the mine is spent", () => {
  start({}, [foe(2, 8, 3, { speed: 60 })]);
  // An armed mine where the character stands; the trooper (a failed save, 2d10 kinetic) walks up to it
  useCombat.setState({ mines: [{ id: "m1", label: "Mine, fragmentation", x: 3, y: 3, z: 0, radius: 15, dc: 14, save: "dexterity", damage: [{ dice: "2d10", type: "kinetic" }], conditions: [], conditionRounds: 10, by: 1, party: true, armed: true, paired: false }] });
  const before = them(2).hp;
  const s = useCombat.getState();
  const i = s.combatants.findIndex((c) => c.id === 2);
  useCombat.setState({ currentTurn: i, combatants: s.combatants.map((c) => (c.id === 2 ? { ...c, actions: 1, moved: 0 } : c)) });
  useCombat.getState().moveTo(7, 3);
  // 7 is 4 squares from the mine at 3: outside 15 ft. (3 squares)
  assert.equal(useCombat.getState().mines.length, 1);
  useCombat.getState().moveTo(6, 3);
  assert.equal(useCombat.getState().mines.length, 0, "it went off");
  assert.ok(them(2).hp < before, "and hurt the one who set it off");
  assert.ok(log().some((l) => /goes off!/.test(l)));
});

test("a mine that kills the last enemy ends the fight in victory", () => {
  start({}, [foe(2, 8, 3, { hp: 3, speed: 60 })]);
  useCombat.setState({ mines: [{ id: "m1", label: "Mine, fragmentation", x: 5, y: 3, z: 0, radius: 15, dc: 14, save: "dexterity", damage: [{ dice: "2d10", type: "kinetic" }], conditions: [], conditionRounds: 10, by: 1, party: true, armed: true, paired: false }] });
  const s = useCombat.getState();
  const i = s.combatants.findIndex((c) => c.id === 2);
  useCombat.setState({ currentTurn: i, combatants: s.combatants.map((c) => (c.id === 2 ? { ...c, actions: 1, moved: 0 } : c)) });
  useCombat.getState().moveTo(7, 3);
  assert.equal(useCombat.getState().inCombat, false);
  assert.equal(useCombat.getState().outcome, "victory");
});

test("a mine's conditions on a failed save (an ion or stun mine)", () => {
  start({}, [foe(2, 8, 3, { speed: 60 })]);
  useCombat.setState({ mines: [{ id: "m1", label: "Mine, stun", x: 5, y: 3, z: 0, radius: 15, dc: 14, save: "constitution", damage: [], conditions: ["Stunned"], conditionRounds: 10, by: 1, party: true, armed: true, paired: false }] });
  const s = useCombat.getState();
  const i = s.combatants.findIndex((c) => c.id === 2);
  useCombat.setState({ currentTurn: i, combatants: s.combatants.map((c) => (c.id === 2 ? { ...c, actions: 1, moved: 0 } : c)) });
  useCombat.getState().moveTo(7, 3);
  assert.ok(them(2).conditions?.some((c) => c.name === "Stunned"));
});

test("a paired mine ignores who walks by and goes off to the detonator, within its reach, as an action", () => {
  start({ detonator: { range: 30, paired: ["Mine, fragmentation"] } }, [foe(2, 9, 3)]);
  assert.ok(useCombat.getState().itemEffect(mineEffect(true)));
  assert.equal(useCombat.getState().mines[0].paired, true);
  assert.deepEqual(me().detonator!.paired, []);
  // Not armed yet: the detonator finds nothing
  newTurn();
  useCombat.getState().detonate();
  assert.match(log().at(-1)!, /No paired mine is armed/);
  assert.equal(useCombat.getState().mines.length, 1);
  // Armed, with the foe walked up beside it: a paired mine does not trip by itself
  useCombat.setState({ mines: useCombat.getState().mines.map((m) => ({ ...m, armed: true })) });
  const s = useCombat.getState();
  const i = s.combatants.findIndex((c) => c.id === 2);
  useCombat.setState({ currentTurn: i, combatants: s.combatants.map((c) => (c.id === 2 ? { ...c, actions: 1, moved: 0, speed: 60 } : c)) });
  useCombat.getState().moveTo(2, 3);
  assert.equal(useCombat.getState().mines.length, 1);
  // The character steps back out of reach of the detonator? (here, in reach: 1 square) and presses it
  newTurn();
  const before = them(2).hp;
  useCombat.getState().detonate();
  assert.equal(useCombat.getState().mines.length, 0);
  assert.ok(them(2).hp < before);
  assert.equal(me().actions, 0);
});

test("the detonator does not reach a mine beyond its range", () => {
  start({ detonator: { range: 30, paired: [] } }, [foe(2, 12)]);
  useCombat.setState({
    mines: [{ id: "m1", label: "Mine, fragmentation", x: 12, y: 7, z: 0, radius: 15, dc: 14, save: "dexterity", damage: [{ dice: "2d10", type: "kinetic" }], conditions: [], conditionRounds: 10, by: 1, party: true, armed: true, paired: true }],
  });
  useCombat.getState().detonate();
  assert.match(log().at(-1)!, /beyond 30 ft/);
  assert.equal(useCombat.getState().mines.length, 1);
});
