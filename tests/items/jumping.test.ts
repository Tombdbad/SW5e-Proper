// Jumping, climbing, falling and gravity (2026-10-26; shared/logic "Jumping, falling and gravity", useCombat reachable and fall)
import test from "node:test";
import assert from "node:assert/strict";
import { useCombat, reachable, type Combatant, type Arena } from "../../client/src/lib/stores/useCombat";
import { jumpReach, fallPlan, fallOutcome, gravityOf, type World } from "../../shared/logic/index";

// Two roofs a level up with a 10-ft. gap between them, and a tower three levels up
const arena: Arena = {
  width: 12,
  height: 8,
  assets: [],
  platforms: [
    { z: 1, x: 0, y: 0, width: 4, height: 8 },
    { z: 1, x: 6, y: 0, width: 6, height: 4 },
    { z: 3, x: 6, y: 5, width: 6, height: 3 },
  ],
};
const player = { id: 1, name: "Jumper", currentHp: 40, maxHp: 40, armorClass: 14, level: 5, abilityScores: { strength: 16, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 }, speed: 30, conditions: [] } as any;
const foe: any = { id: 2, name: "Thug", hp: 40, maxHp: 40, armorClass: 5, initiative: 0, x: 11, y: 4, z: 0, attackBonus: 1, damageDice: "1d4", abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }, saves: {}, size: "Medium" };
const me = (at: { x: number; y: number; z: number }, extra: Partial<Combatant> = {}): Combatant =>
  ({ id: 1, name: "Jumper", hp: 40, maxHp: 40, initiative: 10, armorClass: 14, abilities: player.abilityScores, speed: 30, moved: 0, actions: 1, size: "Medium", ...at, ...extra }) as Combatant;
const start = (at: { x: number; y: number; z: number }, kit: Partial<Combatant> = {}, field: Arena = arena) => {
  useCombat.getState().initiateCombat(player, [foe], { speed: 30, ...kit }, true, field, at as any, []);
  const s = useCombat.getState();
  const mi = s.combatants.findIndex((c) => c.isPlayer);
  useCombat.setState({ currentTurn: mi, combatants: s.combatants.map((c, i) => (i === mi ? { ...c, ...at, actions: 1, bonus: 1, reactions: 1, moved: 0 } : c)), autoEnd: false });
};
const mine = () => useCombat.getState().combatants.find((c) => c.isPlayer)!;
const withDice = (value: number, run: () => void) => {
  const random = Math.random;
  Math.random = () => value;
  try { run(); } finally { Math.random = random; }
};

test("jump distances: the Strength score with a run-up, half standing, and less in a heavier pull", () => {
  assert.deepEqual(jumpReach(16, true), { long: 16, high: 6, reach: 15 });
  assert.deepEqual(jumpReach(16, false), { long: 8, high: 3, reach: 12 });
  assert.equal(jumpReach(16, true, 1.5).long, 10);
  assert.equal(jumpReach(16, true, 0.7).long, 22);
  assert.equal(jumpReach(10, false, 1, "Small").reach, 5.5);
});

test("a fall: 1d6 a 10 ft. to 20d6, times the pull; heavy armour d8s; flight sets down; a burst or a jump softens it", () => {
  assert.equal(fallPlan(30).dice, 3);
  assert.equal(fallPlan(30).die, 6);
  assert.equal(fallPlan(30, 1, { heavy: true }).die, 8);
  assert.equal(fallPlan(30, 1.5).dice, 4);
  assert.equal(fallPlan(30, 1.5).speed, 750);
  assert.equal(fallPlan(1000).dice, 20);
  assert.equal(fallPlan(1000).rounds, 2);
  assert.equal(fallPlan(40, 1, { flying: "their jets" }).dice, 0);
  const burst = fallPlan(60, 1, { burst: "Jetpack" });
  assert.equal(burst.burst?.dc, 13);
  assert.equal(fallOutcome(burst, { burst: 13 }).dice, 0);
  assert.deepEqual([fallOutcome(burst, { burst: 12 }).dice, fallOutcome(burst, { burst: 12 }).half], [6, true]);
  const jump = fallPlan(20, 1, { jumped: true });
  assert.equal(fallOutcome(jump, { jump: 10 }).dice, 1);
  assert.equal(fallOutcome(jump, { jump: 9 }).dice, 2);
});

test("a world's pull: heavy on a gas giant's open platforms, light on a barren world, standard aboard a ship or with a generator", () => {
  const area = (id: string, kind: string, type: string, parentId?: string) => ({ id, kind, type, name: id, parentId, tags: [], occupants: [], ships: [], loot: [], position: { x: 0, y: 0 }, danger: 0 });
  const worldOf = (land: string, building = "cantina") => ({ areas: { p: area("p", "planet", land), s: area("s", "settlement", "city", "p"), b: area("b", "building", building, "s"), r: area("r", "room", "room", "b") }, paths: [] }) as unknown as World;
  assert.equal(gravityOf(worldOf("gas giant"), "s").g, 1.5);
  assert.equal(gravityOf(worldOf("gas giant"), "r").g, 1, "indoors the plating keeps it standard");
  assert.equal(gravityOf(worldOf("gas giant"), "s", true).g, 1, "a gravity generator");
  assert.equal(gravityOf(worldOf("barren"), "s").g, 0.7);
  assert.equal(gravityOf(worldOf("barren", "starship"), "r").g, 1, "aboard a ship");
  assert.ok([0.9, 1, 1.1].includes(gravityOf(worldOf("desert"), "s").g));
});

test("off a roof: a gap is jumped with a run-up, not standing; a level down is climbed; a tall drop is a fall", () => {
  // Standing at the roof's edge with no room for a run-up: 8 ft. of long jump does not clear the 10-ft. gap
  let steps = reachable(arena, [], me({ x: 3, y: 2, z: 1 }, { speed: 15 }));
  assert.equal(steps.get("6,2,1"), undefined);
  // After 10 ft. on foot: it does, for 15 ft. of movement
  steps = reachable(arena, [], me({ x: 3, y: 2, z: 1 }, { moved: 10 }));
  assert.deepEqual([steps.get("6,2,1")?.how, steps.get("6,2,1")?.cost], ["jump", 15]);
  // Down a level beside the roof: within reach, climbed at double cost, no fall
  steps = reachable(arena, [], me({ x: 3, y: 2, z: 1 }));
  assert.deepEqual([steps.get("4,2")?.how, steps.get("4,2")?.cost, steps.get("4,2")?.fall], ["climb", 20, undefined]);
  // A small creature does not reach: it jumps down (a fall of a level)
  steps = reachable(arena, [], me({ x: 3, y: 2, z: 1 }, { size: "Small" }));
  assert.deepEqual([steps.get("4,2")?.how, steps.get("4,2")?.fall], ["drop", 1]);
  // Off the tower (30 ft.): a fall
  steps = reachable(arena, [], me({ x: 6, y: 6, z: 3 }));
  assert.deepEqual([steps.get("5,6")?.how, steps.get("5,6")?.fall], ["drop", 3]);
});

test("up a wall: the reach of a high jump, a climbing speed, a grappling hook's line for higher; a flyer flies up", () => {
  let steps = reachable(arena, [], me({ x: 4, y: 2, z: 0 }));
  assert.deepEqual([steps.get("3,2,1")?.how, steps.get("3,2,1")?.cost], ["climb", 20]);
  // The tower is out of reach without gear
  assert.equal(reachable(arena, [], me({ x: 5, y: 6, z: 0 })).get("6,6,3"), undefined);
  // With a hook and 50 ft. of line: 30 ft. up at double cost, if the movement is there
  steps = reachable(arena, [], me({ x: 5, y: 6, z: 0 }, { speed: 60, climber: { hookFeet: 50 } }));
  assert.deepEqual([steps.get("6,6,3")?.how, steps.get("6,6,3")?.cost], ["hook", 60]);
  // Not without an action to throw it
  assert.equal(reachable(arena, [], me({ x: 5, y: 6, z: 0 }, { speed: 60, actions: 0, climber: { hookFeet: 50 } })).get("6,6,3"), undefined);
  // Friction grips: the climb at the feet
  assert.equal(reachable(arena, [], me({ x: 5, y: 6, z: 0 }, { climber: { speed: true } })).get("6,6,3")?.cost, 30);
  // A jetpack running: 10 ft. a level
  assert.deepEqual([reachable(arena, [], me({ x: 5, y: 6, z: 0 }, { fly: 30 })).get("6,6,3")?.how], ["fly"]);
});

test("in a fight: the jump down hurts and lands prone; a jetpack's burst lands on the feet; heavy armour lands harder", () => {
  start({ x: 6, y: 6, z: 3 });
  withDice(0.99, () => useCombat.getState().moveTo(5, 6, 0));
  let log = useCombat.getState().combatLog.join(" | ");
  assert.equal(mine().z, 0);
  assert.ok(/jumps down: falls 30 feet/.test(log), log);
  // (a rolled 20 lands well: two dice of 6, but prone after damage)
  assert.equal(mine().hp, 40 - 12, log);
  assert.ok(mine().conditions?.some((c) => c.name === "Prone"));

  start({ x: 6, y: 6, z: 3 }, { burst: "Jetpack" });
  withDice(0.99, () => useCombat.getState().moveTo(5, 6, 0));
  log = useCombat.getState().combatLog.join(" | ");
  assert.equal(mine().hp, 40, log);
  assert.ok(/burst just above the ground/.test(log), log);
  assert.equal(mine().reactions, 0);

  start({ x: 6, y: 6, z: 3 }, { heavyArmor: true, acrobatics: -20 });
  withDice(0.99, () => useCombat.getState().moveTo(5, 6, 0));
  log = useCombat.getState().combatLog.join(" | ");
  assert.equal(mine().hp, 40 - 24, log);
  assert.ok(/heavy armour: d8s/.test(log), log);
});

test("in a fight: the hook takes the action; the pull of a heavy world is told and shortens the jump", () => {
  start({ x: 5, y: 6, z: 0 }, { speed: 60, climber: { hookFeet: 50 } });
  useCombat.getState().moveTo(6, 6, 3);
  assert.equal(mine().z, 3, useCombat.getState().combatLog.join(" | "));
  assert.equal(mine().actions, 0);
  assert.ok(/grappling hook up/.test(useCombat.getState().combatLog.join(" | ")));
  start({ x: 3, y: 2, z: 1 }, {}, { ...arena, gravity: 1.5 });
  assert.ok(/pull here is 1.5× standard/.test(useCombat.getState().combatLog.join(" | ")));
  // With a run-up, 16 ft. clears the 10-ft. gap; in a pull of 2, 8 ft. does not
  assert.ok(reachable({ ...arena, gravity: 1.5 }, [], me({ x: 3, y: 2, z: 1 }, { moved: 10 })).get("6,2,1"));
  assert.equal(reachable({ ...arena, gravity: 2 }, [], me({ x: 3, y: 2, z: 1 }, { moved: 10 })).get("6,2,1"), undefined);
});
