import { create } from "zustand";
import { useCharacter, Character } from "./useCharacter";
import { rollDice, sumDiceResults } from "@/lib/sw5e/dice";
import { conditionMechanics } from "@/lib/sw5e/rules";
import { conditions as conditionList } from "@/lib/sw5e/conditions";
import type { RoomAsset } from "@shared/logic";
import {
  StarshipCombatManager,
  VehicleCombatManager,
} from "../sw5e/combatmanagers";

const roll = (quantity: number, sides: number) => sumDiceResults(rollDice(quantity, sides));

const shipManager = new StarshipCombatManager();
const vehicleManager = new VehicleCombatManager();

export type CombatType = 'personal' | 'starship' | 'vehicle';

export interface StarshipCombatant {
  id: string;
  name: string;
  shipType: string;
  currentSpeed: number;
  maxSpeed: number;
  shields: number;
  maxShields: number;
  hull: number;
  maxHull: number;
  initiative: number;
  weapons: {
    name: string;
    damage: string;
    range: string;
  }[];
  crew: {
    role: string;
    character?: Combatant;
  }[];
}

export interface Combatant {
  id: number | string;
  name: string;
  hp: number;
  maxHp: number;
  initiative: number;
  armorClass: number;
  isPlayer?: boolean;
  abilities?: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  attackBonus?: number;
  damageBonus?: number;
  // Damage as printed on a stat block or weapon ("1d8 + 3"); used instead of the generic dice
  damageDice?: string;
  // The player's weapons: dice and names for the two kinds of attack
  meleeDice?: string;
  rangedDice?: string;
  meleeWeapon?: string;
  rangedWeapon?: string;
  // The bonus to hit and to damage with each (ability modifier, and proficiency when proficient)
  meleeAttack?: number;
  rangedAttack?: number;
  meleeDamage?: number;
  rangedDamage?: number;
  // The player's powers, ready to cast, and the points left to cast them with
  powers?: CombatPower[];
  powerPoints?: number;
  // Ability modifiers, for saving throws against powers
  saves?: Record<string, number>;
  // Whether a stat block's attack is made at range (melee otherwise)
  rangedAttacker?: boolean;
  // The square it stands on, its speed and how far it has moved this turn (feet), the reach of
  // its melee attack and the normal and long range of its ranged one (feet)
  x?: number;
  y?: number;
  speed?: number;
  moved?: number;
  reach?: number;
  range?: [number, number];
  // For the token drawn on the grid
  size?: string;
  creature?: string;
  role?: string;
  // Conditions in force (what each does is read from the conditions data, see conditionMechanics)
  conditions?: ActiveCondition[];
}

export interface ActiveCondition {
  name: string;
  // Turns of the afflicted creature it still lasts; LASTING for the whole fight
  rounds: number;
  // The saving throw that ends it, made at the end of each of the creature's turns
  save?: { ability: string; dc: number };
  // Who caused it and with what; a concentration power's conditions end when its caster casts another
  by?: number | string;
  source?: string;
  concentration?: boolean;
  // Ends when the creature attacks or casts (invisibility from a power), or when it is hurt (sleep)
  endsOnAttack?: boolean;
  endsOnDamage?: boolean;
}

export const LASTING = 100;

// Where the fight is: a room's plan, or open ground. Squares are 5 feet.
export interface Arena {
  width: number;
  height: number;
  assets: RoomAsset[];
  // What the floor is (the building's type), for drawing it
  floor?: string;
  // Open ground, not a room: there are no walls round it
  open?: boolean;
}
type Square = { x: number; y: number };
const key = (x: number, y: number) => `${x},${y}`;

// Squares between two creatures: a diagonal step counts as one (Player's Handbook grid rule)
export const squaresApart = (a: { x?: number; y?: number }, b: { x?: number; y?: number }) =>
  Math.max(Math.abs((a.x ?? 0) - (b.x ?? 0)), Math.abs((a.y ?? 0) - (b.y ?? 0)));

const covers = (asset: RoomAsset, x: number, y: number) => !asset.side && asset.x <= x && x < asset.x + asset.w && asset.y <= y && y < asset.y + asset.h;
const solid = (arena: Arena, x: number, y: number) =>
  x < 0 || y < 0 || x >= arena.width || y >= arena.height || arena.assets.some((a) => a.blocks && covers(a, x, y));

// Feet a creature can still move this turn, as its conditions allow
export function movementLeft(c: Combatant): number {
  const factor = Math.min(1, ...(c.conditions ?? []).map((x) => conditionMechanics(x.name).speed));
  return Math.max(0, Math.floor(((c.speed ?? 30) * factor) / 5) * 5 - (c.moved ?? 0));
}

// Every square a creature can walk to with the movement it has left, and the feet it costs.
// Furniture that blocks and other creatures are walked around; no cutting corners.
export function reachable(arena: Arena, combatants: Combatant[], mover: Combatant, limit = movementLeft(mover)): Map<string, { cost: number; from?: string }> {
  const taken = new Set(combatants.filter((c) => c.id !== mover.id && c.hp > 0).map((c) => key(c.x ?? -1, c.y ?? -1)));
  const open = (x: number, y: number) => !solid(arena, x, y) && !taken.has(key(x, y));
  const start = { x: mover.x ?? 0, y: mover.y ?? 0 };
  const found = new Map<string, { cost: number; from?: string }>([[key(start.x, start.y), { cost: 0 }]]);
  const queue: Square[] = [start];
  while (queue.length) {
    const at = queue.shift()!;
    const cost = found.get(key(at.x, at.y))!.cost + 5;
    if (cost > limit) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = at.x + dx;
      const y = at.y + dy;
      if ((!dx && !dy) || found.has(key(x, y)) || !open(x, y)) continue;
      if (dx && dy && (solid(arena, at.x + dx, at.y) || solid(arena, at.x, at.y + dy))) continue;
      found.set(key(x, y), { cost, from: key(at.x, at.y) });
      queue.push({ x, y });
    }
  }
  return found;
}

// Cover a target has from an attacker: what it stands behind, that is, cover on the line between
// them and within 5 feet of the target (a ship's hull counts from anywhere on the line). One
// thing in the way is half cover (+2 AC), more is three-quarters (+5).
export function coverBetween(arena: Arena, from: { x?: number; y?: number }, to: { x?: number; y?: number }): { bonus: number; name: string } {
  const [x0, y0, x1, y1] = [from.x ?? 0, from.y ?? 0, to.x ?? 0, to.y ?? 0];
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const inTheWay = new Set<RoomAsset>();
  for (let i = 1; i < steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    const beside = Math.max(Math.abs(x - x1), Math.abs(y - y1)) <= 1;
    for (const asset of arena.assets) if (asset.cover && covers(asset, x, y) && (beside || asset.kind === "ship")) inTheWay.add(asset);
  }
  const names = Array.from(inTheWay).map((a) => a.name.toLowerCase()).join(", ");
  return inTheWay.size === 0 ? { bonus: 0, name: "" } : inTheWay.size === 1 ? { bonus: 2, name: `half cover: ${names}` } : { bonus: 5, name: `three-quarters cover: ${names}` };
}

// Whether an attack can be made from where the attacker stands, and what bears on it: reach and
// range (long range and an enemy within 5 feet give a ranged attack disadvantage), conditions,
// and the target's cover
export function attackPlan(arena: Arena, combatants: Combatant[], attacker: Combatant, target: Combatant, type: "melee" | "ranged") {
  const feet = squaresApart(attacker, target) * 5;
  const odds = attackOdds(attacker, target, type, feet <= 5);
  const reasons = [...odds.reasons];
  let down = odds.down;
  let possible = true;
  let why = "";
  if (type === "melee") {
    possible = feet <= (attacker.reach ?? 5);
    if (!possible) why = `${target.name} is ${feet} ft. away`;
  } else {
    const [normal, long] = attacker.range ?? [80, 320];
    possible = feet <= long;
    if (!possible) why = `${target.name} is ${feet} ft. away, beyond ${long} ft.`;
    if (possible && feet > normal) {
      down = true;
      reasons.push("long range");
    }
    if (combatants.some((c) => c.hp > 0 && !!c.isPlayer !== !!attacker.isPlayer && !cannotAct(c) && squaresApart(c, attacker) <= 1)) {
      down = true;
      reasons.push("an enemy within 5 feet");
    }
  }
  const cover = feet > 5 ? coverBetween(arena, attacker, target) : { bonus: 0, name: "" };
  // Advantage and disadvantage from any number of sources cancel to a straight roll
  const mode = Number(odds.up) - Number(down);
  return { possible, why, mode, crit: odds.crit, barred: odds.barred, reasons, cover, feet };
}

// The nearest free square to where a creature should stand
function freeSquare(arena: Arena, taken: Set<string>, want: Square): Square {
  for (let ring = 0; ring < arena.width + arena.height; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const x = want.x + dx;
      const y = want.y + dy;
      if (!solid(arena, x, y) && !taken.has(key(x, y))) return { x, y };
    }
  }
  return want;
}

// Moves a creature towards a target until it is within the given distance, as far as its
// movement goes. Returns where it ends up and the feet spent.
function stepTowards(arena: Arena, combatants: Combatant[], mover: Combatant, target: Combatant, withinFeet: number): { x: number; y: number; cost: number } {
  const here = { x: mover.x ?? 0, y: mover.y ?? 0, cost: 0 };
  if (squaresApart(mover, target) * 5 <= withinFeet) return here;
  // How far every square is from the target, walking round furniture
  const field = reachable(arena, combatants.filter((c) => c.id === target.id), { ...target, id: "field" }, 10000);
  const options = reachable(arena, combatants, mover);
  let best = { ...here, score: Infinity };
  options.forEach((step, k) => {
    const [x, y] = k.split(",").map(Number);
    const apart = squaresApart({ x, y }, target) * 5;
    // Close enough is best, and of those the nearest to walk to; otherwise whatever gets nearest
    const score = apart <= withinFeet ? step.cost / 1000 : 100 + (field.get(k)?.cost ?? 9999) + step.cost / 1000;
    if (score < best.score) best = { x, y, cost: step.cost, score };
  });
  return best;
}

const mechanicsOf = (c: Combatant) => (c.conditions ?? []).map((condition) => ({ condition, m: conditionMechanics(condition.name) }));

// The condition that keeps a creature from acting, if any
export const cannotAct = (c: Combatant): string | undefined => mechanicsOf(c).find((x) => x.m.incapacitated)?.condition.name;

// How conditions on either side bear on an attack: advantage (+1) or disadvantage (-1), whether a
// hit is a critical hit, and the condition that forbids the attack altogether
export function attackOdds(attacker: Combatant, target: Combatant, type: "melee" | "ranged", near = type === "melee") {
  const reasons: string[] = [];
  let up = false;
  let down = false;
  for (const { condition, m } of mechanicsOf(attacker)) {
    if (m.ownAttacks[type]) reasons.push(`${attacker.name} is ${condition.name.toLowerCase()}`);
    up ||= m.ownAttacks[type] > 0;
    down ||= m.ownAttacks[type] < 0;
  }
  let crit = false;
  for (const { condition, m } of mechanicsOf(target)) {
    // What a condition says of attackers within 5 feet and of those further off
    const against = m.attacksAgainst[near ? "melee" : "ranged"];
    if (against) reasons.push(`${target.name} is ${condition.name.toLowerCase()}`);
    up ||= against > 0;
    down ||= against < 0;
    crit ||= m.meleeHitsCrit && near;
  }
  const barred = mechanicsOf(attacker).find((x) => x.m.cantAttackSource && x.condition.by === target.id)?.condition.name;
  return { mode: Number(up) - Number(down), up, down, crit, barred, reasons };
}

// Who an attack or power is aimed at: the enemy picked out if it still stands, else the nearest
export function pickTarget(combatants: Combatant[], attacker: Combatant, targetId: number | string | null): Combatant | undefined {
  const foes = combatants.filter((c) => !!c.isPlayer !== !!attacker.isPlayer && c.hp > 0);
  return foes.find((c) => c.id === targetId) ?? [...foes].sort((a, b) => squaresApart(a, attacker) - squaresApart(b, attacker))[0];
}

// Whether a power aimed at an enemy cannot reach it from where the caster stands
export function powerOutOfRange(combatants: Combatant[], caster: Combatant, power: CombatPower, targetId: number | string | null): boolean {
  if (power.range === undefined || power.kind === "heal" || power.kind === "other" || power.onSelf) return false;
  const target = pickTarget(combatants, caster, targetId);
  return !!target && squaresApart(caster, target) * 5 > Math.max(5, power.range);
}

// A d20 with advantage or disadvantage
export const rollD20 = (mode = 0): number => {
  const a = roll(1, 20);
  if (!mode) return a;
  const b = roll(1, 20);
  return mode > 0 ? Math.max(a, b) : Math.min(a, b);
};

// A saving throw against a DC, as the creature's conditions allow it
function savingThrow(c: Combatant, ability: string, dc: number): boolean {
  const all = mechanicsOf(c);
  if (all.some((x) => x.m.autoFailSaves.includes(ability))) return false;
  return rollD20(all.some((x) => x.m.disadvantageSaves.includes(ability)) ? -1 : 0) + (c.saves?.[ability] ?? 0) >= dc;
}

// Adds conditions to a creature; one it already has is replaced
function withConditions(c: Combatant, added: ActiveCondition[]): Combatant {
  const names = added.map((a) => a.name);
  return { ...c, conditions: [...(c.conditions ?? []).filter((x) => !names.includes(x.name)), ...added] };
}

// Takes hit points off a creature; damage ends the conditions that say so (a sleeper wakes)
const hurt = (c: Combatant, amount: number): Combatant => ({
  ...c,
  hp: Math.max(0, c.hp - amount),
  conditions: c.conditions?.filter((x) => !x.endsOnDamage),
});

const lasts = (rounds: number) => (rounds >= LASTING ? "for the fight" : rounds === 1 ? "for 1 turn" : `for ${rounds} turns`);

// A known power with what the app can resolve of it (see powerEffect in lib/sw5e/rules)
export interface CombatPower {
  name: string;
  cost: number;
  kind: "attack" | "save" | "heal" | "condition" | "other";
  dice?: string;
  save?: string;
  halfOnSave?: boolean;
  conditions?: string[];
  conditionRounds?: number;
  repeatSave?: boolean;
  hitPointPool?: string;
  onSelf?: boolean;
  concentration?: boolean;
  endsOnAttack?: boolean;
  endsOnDamage?: boolean;
  // Feet: 0 the caster only, 5 touch; no figure, no limit
  range?: number;
  summary: string;
  // The caster's numbers for this power
  modifier: number;
  attack: number;
  dc: number;
}

export type CombatOutcome = "victory" | "stable" | "dead" | "left" | null;

// Rolls "2d6 + 1" style damage; a critical hit rolls the dice twice
export function rollDamage(expression: string, isCritical: boolean): number {
  const parts = expression.replace(/\s+/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!parts) return Math.max(1, parseInt(expression) || 1);
  const dice = Number(parts[1]) * (isCritical ? 2 : 1);
  return Math.max(1, roll(dice, Number(parts[2])) + Number(parts[3] ?? 0));
}

interface CombatState {
  inCombat: boolean;
  combatants: Combatant[];
  currentTurn: number;
  round: number;
  combatLog: string[];
  // Death saving throws while the player is at 0 hit points, and how the fight ended
  deathSaves: { successes: number; failures: number };
  outcome: CombatOutcome;
  // How the enemy stood when the party left the fight (the field is cleared then); otherwise
  // the combatants themselves say
  remains: { id: number | string; hp: number }[];
  surprise: boolean;
  // The ground the fight is on, and the enemy the player has picked out
  arena: Arena;
  targetId: number | string | null;

  // Combat actions
  initiateCombat: (
    player: Character,
    enemies: Omit<Combatant, "isPlayer">[],
    // The player's weapons, powers and power points
    weapons?: Partial<Combatant>,
    // The enemies never saw it coming: they do nothing in the first round
    surprise?: boolean,
    // The room's plan and the square the player comes in at; open floor without one
    arena?: Arena,
    playerAt?: { x: number; y: number },
  ) => void;
  // The creature whose turn it is walks to a square it can reach
  moveTo: (x: number, y: number) => void;
  // It closes with a target until within the given feet, as far as its movement goes; true when it got there
  approach: (targetId: number | string, withinFeet: number) => boolean;
  setTarget: (id: number | string) => void;
  endCombat: () => void;
  nextTurn: () => void;
  rollInitiative: (dexModifier: number) => number;
  attackRoll: (
    targetId: number | string,
    attackValue: number,
    damageValue: number,
    isCritical: boolean,
    // Why the roll had advantage or disadvantage, for the log
    note?: string,
  ) => void;
  // The creature whose turn it is does nothing, and why
  pass: (reason: string) => void;
  damageRoll: (attackType: string, isCritical: boolean) => number;
  castPower: (index: number) => void;
  deathSave: () => void;
}

export const useCombat = create<CombatState>((set, get) => ({
  inCombat: false,
  combatants: [],
  currentTurn: 0,
  round: 1,
  combatLog: [],
  deathSaves: { successes: 0, failures: 0 },
  outcome: null,
  remains: [],

  surprise: false,
  arena: { width: 10, height: 7, assets: [] },
  targetId: null,

  moveTo: (x, y) =>
    set((state) => {
      const mover = state.combatants[state.currentTurn];
      const step = mover && reachable(state.arena, state.combatants, mover).get(key(x, y));
      if (!mover || !step || !step.cost) return state;
      return {
        combatants: state.combatants.map((c) => (c.id === mover.id ? { ...c, x, y, moved: (c.moved ?? 0) + step.cost } : c)),
        combatLog: [...state.combatLog, `${mover.name} moves ${step.cost} ft.`],
      };
    }),

  approach: (targetId, withinFeet) => {
    const state = get();
    const mover = state.combatants[state.currentTurn];
    const target = state.combatants.find((c) => c.id === targetId);
    if (!mover || !target) return false;
    const end = stepTowards(state.arena, state.combatants, mover, target, withinFeet);
    if (end.cost) get().moveTo(end.x, end.y);
    return squaresApart(end, target) * 5 <= withinFeet;
  },

  setTarget: (id) => set({ targetId: id }),

  initiateCombat: (player, enemies, weapons, surprise = false, arena = { width: 10, height: 7, assets: [] }, playerAt) => {
    // Calculate initiatives
    const dexModifier = Math.floor((player.abilityScores.dexterity - 10) / 2);
    const playerInitiative = roll(1, 20) + dexModifier;

    // Create player combatant
    const playerCombatant: Combatant = {
      id: player.id,
      name: player.name,

      hp: player.currentHp,
      maxHp: player.maxHp,
      initiative: playerInitiative,
      armorClass: player.armorClass,
      isPlayer: true,
      abilities: player.abilityScores,
      // Proficiency bonus for the character's level
      attackBonus: Math.ceil(1 + (Number((player as any).level) || 1) / 4),
      saves: Object.fromEntries(Object.entries(player.abilityScores ?? {}).map(([ability, score]) => [ability, Math.floor((Number(score) - 10) / 2)])),
      // Conditions the character came into the fight with last through it
      conditions: ((player as any).conditions ?? [])
        .filter((name: string) => conditionList.some((c) => c.name === name))
        .map((name: string) => ({ name, rounds: LASTING })),
      speed: Number((player as any).speed) || 30,
      ...weapons,
    };
    // Everyone gets a square: the player where they came in, the enemy where they stood
    const taken = new Set<string>();
    const stand = <T extends Combatant>(c: T, want: Square): T => {
      const spot = freeSquare(arena, taken, want);
      taken.add(key(spot.x, spot.y));
      return { ...c, ...spot, moved: 0 };
    };
    const middle = Math.floor(arena.height / 2);
    const placedPlayer = stand(playerCombatant, playerAt ?? { x: 0, y: middle });

    // Add initiative to enemies
    const enemyCombatants = enemies.map((enemy) => stand({
      ...enemy,
      initiative: roll(1, 20) + 1, // +1 as a simple modifier
      isPlayer: false,
    }, enemy.x !== undefined && enemy.y !== undefined ? { x: enemy.x, y: enemy.y } : { x: arena.width - 1, y: middle }));

    // Combine and sort by initiative
    const allCombatants = [placedPlayer, ...enemyCombatants].sort(
      (a, b) => b.initiative - a.initiative,
    );
    // Find index of combatant with highest initiative
    const firstTurn = 0;
    set({
      inCombat: true,
      combatants: allCombatants,
      currentTurn: firstTurn,
      round: 1,
      surprise,
      arena,
      targetId: null,
      combatLog: [surprise ? "You strike first: the enemy is surprised." : "Combat initiated! Roll for initiative!"],
      deathSaves: { successes: 0, failures: 0 },
      outcome: null,
      remains: [],
    });
  },

  endCombat: () => {
    set((state) => ({
      remains: state.combatants.filter((c) => !c.isPlayer).map((c) => ({ id: c.id, hp: c.hp })),
      inCombat: false,
      combatants: [],
      currentTurn: 0,
      round: 1,
      combatLog: [],
      outcome: "left",
    }));
  },

  nextTurn: () =>
    set((state) => {
      // The turn that ends: its creature's conditions run down, or end on a saving throw
      const log = [...state.combatLog];
      const combatants = [...state.combatants];
      const ending = combatants[state.currentTurn];
      if (ending?.conditions?.length && ending.hp > 0) {
        const kept: ActiveCondition[] = [];
        for (const condition of ending.conditions) {
          if (condition.save && savingThrow({ ...ending, conditions: kept.concat(condition) }, condition.save.ability, condition.save.dc)) {
            log.push(`${ending.name} saves and is no longer ${condition.name.toLowerCase()}.`);
          } else if (condition.rounds < LASTING && condition.rounds <= 1) {
            log.push(`${ending.name} is no longer ${condition.name.toLowerCase()}.`);
          } else kept.push(condition.rounds < LASTING ? { ...condition, rounds: condition.rounds - 1 } : condition);
        }
        combatants[state.currentTurn] = { ...ending, conditions: kept };
      }

      // The creature whose turn begins has its whole movement again
      const next = state.currentTurn === state.combatants.length - 1 ? 0 : state.currentTurn + 1;
      if (combatants[next]) combatants[next] = { ...combatants[next], moved: 0 };

      // Handle end of round
      if (state.currentTurn === state.combatants.length - 1) {
        return {
          combatants,
          currentTurn: 0,
          round: state.round + 1,
          combatLog: [...log, `Round ${state.round + 1} begins!`],
        };
      }

      // Move to next combatant
      return {
        combatants,
        currentTurn: state.currentTurn + 1,
        combatLog: [...log, `${state.combatants[state.currentTurn + 1]?.name}'s turn`],
      };
    }),

  pass: (reason) => {
    set((state) => ({ combatLog: [...state.combatLog, `${state.combatants[state.currentTurn]?.name} ${reason}.`] }));
    get().nextTurn();
  },

  rollInitiative: (dexModifier) => {
    const result = roll(1, 20) + dexModifier;
    return result;
  },

  attackRoll: (targetId, attackValue, damageValue, isCritical, note) =>
    set((current) => {
      // Find the target
      const targetIndex = current.combatants.findIndex((c) => c.id === targetId);
      if (targetIndex === -1) return current;

      const target = current.combatants[targetIndex];
      const attacker = current.combatants[current.currentTurn];
      // Attacking gives away a creature hidden by a power
      const revealed = attacker.conditions?.filter((c) => c.endsOnAttack) ?? [];
      const state = !revealed.length ? current : {
        ...current,
        combatants: current.combatants.map((c) => (c.id === attacker.id ? { ...c, conditions: c.conditions!.filter((x) => !x.endsOnAttack) } : c)),
        combatLog: [...current.combatLog, `${attacker.name} is no longer ${revealed.map((c) => c.name.toLowerCase()).join(" or ")}.`],
      };

      // Create log message
      let logMessage = `${attacker.name} attacks ${target.name}${note ? ` (${note})` : ""} `;

      if (isCritical) {
        logMessage += `with a critical hit for ${damageValue} damage!`;
      } else if (attackValue >= target.armorClass) {
        logMessage += `and hits for ${damageValue} damage.`;
      } else {
        logMessage += `but misses.`;
      }

      // Update target HP if hit
      if ((attackValue >= target.armorClass || isCritical) && damageValue > 0) {
        const newHp = Math.max(0, target.hp - damageValue);
        const updatedCombatants = [...state.combatants];
        updatedCombatants[targetIndex] = hurt(state.combatants[targetIndex], damageValue);

        // Check if target is defeated
        if (newHp === 0) {
          logMessage += ` ${target.name} is defeated!`;
          // Check if all enemies are defeated
          const remainingEnemies = updatedCombatants.filter(
            (c) => !c.isPlayer && c.hp > 0,
          );
          if (remainingEnemies.length === 0) {
            return {
              ...state,
              combatants: updatedCombatants,
              combatLog: [
                ...state.combatLog,
                logMessage,
                "Victory! All enemies defeated.",
              ],
              inCombat: false,
              outcome: "victory" as CombatOutcome,
            };
          }

          // The player at 0 hit points: dead outright if the blow carried on past their
          // hit point maximum, otherwise down and making death saving throws
          const player = updatedCombatants.find((c) => c.isPlayer);
          if (player && player.hp === 0) {
            const massive = damageValue - target.hp >= target.maxHp;
            return {
              ...state,
              combatants: updatedCombatants,
              combatLog: [
                ...state.combatLog,
                logMessage,
                massive ? "The blow kills you outright." : "You fall unconscious and begin making death saving throws.",
              ],
              deathSaves: { successes: 0, failures: 0 },
              ...(massive ? { inCombat: false, outcome: "dead" as CombatOutcome } : {}),
            };
          }
        }

        return {
          ...state,
          combatants: updatedCombatants,
          combatLog: [...state.combatLog, logMessage],
        };
      }

      return {
        ...state,
        combatLog: [...state.combatLog, logMessage],
      };
    }),

  // Cast one of the player's powers at the first standing enemy (or on themselves, to heal or hide)
  castPower: (index) =>
    set((state) => {
      const caster = state.combatants[state.currentTurn];
      const power = caster?.powers?.[index];
      if (!caster?.isPlayer || !power || (caster.powerPoints ?? 0) < power.cost) return state;
      if (powerOutOfRange(state.combatants, caster, power, state.targetId)) return state;
      const log = [...state.combatLog];
      const combatants = state.combatants.map((c) => {
        // A new concentration power ends the one before it; casting gives a hidden caster away
        const dropped = (c.conditions ?? []).filter((x) => (power.concentration && x.concentration && x.by === caster.id) || (c.id === caster.id && x.endsOnAttack));
        if (dropped.length) log.push(`${c.name} is no longer ${dropped.map((x) => x.name.toLowerCase()).join(" or ")}.`);
        const conditions = dropped.length ? c.conditions!.filter((x) => !dropped.includes(x)) : c.conditions;
        return c.id === caster.id ? { ...c, conditions, powerPoints: (c.powerPoints ?? 0) - power.cost } : dropped.length ? { ...c, conditions } : c;
      });
      const hit = (targetIndex: number, amount: number) => {
        combatants[targetIndex] = hurt(combatants[targetIndex], amount);
        if (combatants[targetIndex].hp === 0) log.push(`${combatants[targetIndex].name} is defeated!`);
      };
      // Puts the power's conditions on a creature that is still standing
      const afflict = (i: number) => {
        if (!power.conditions?.length || combatants[i].hp <= 0) return "";
        const rounds = power.conditionRounds ?? 1;
        combatants[i] = withConditions(combatants[i], power.conditions.map((name) => ({
          name,
          rounds,
          save: power.repeatSave && power.save ? { ability: power.save, dc: power.dc } : undefined,
          by: caster.id,
          source: power.name,
          concentration: power.concentration,
          endsOnAttack: power.endsOnAttack,
          endsOnDamage: power.endsOnDamage,
        })));
        return `${power.conditions.join(" and ").toLowerCase()} ${lasts(rounds)}`;
      };
      const selfIndex = combatants.findIndex((c) => c.id === caster.id);
      if (power.kind === "heal") {
        const amount = Math.max(1, rollDamage(power.dice!, false) + power.modifier);
        combatants[selfIndex] = { ...combatants[selfIndex], hp: Math.min(combatants[selfIndex].maxHp, combatants[selfIndex].hp + amount) };
        log.push(`${caster.name} casts ${power.name} and regains ${amount} hit points.`);
      } else if (power.kind === "condition" && power.onSelf) {
        log.push(`${caster.name} casts ${power.name} and is ${afflict(selfIndex)}.`);
      } else if (power.kind === "attack" || power.kind === "save" || power.kind === "condition") {
        const targetIndex = combatants.indexOf(pickTarget(combatants, combatants[selfIndex], state.targetId)!);
        if (targetIndex === -1) return state;
        const target = combatants[targetIndex];
        if (power.kind === "condition") {
          const pool = power.hitPointPool ? rollDamage(power.hitPointPool, false) : Infinity;
          if (target.hp <= pool) log.push(`${caster.name} casts ${power.name}: ${target.name} is ${afflict(targetIndex)}.`);
          else log.push(`${caster.name} casts ${power.name} (${pool}), but ${target.name} has too many hit points left to be affected.`);
        } else if (power.kind === "attack") {
          // A touch power is a melee attack; any other is made at range, with all that goes with it
          const odds = attackPlan(state.arena, combatants, { ...combatants[selfIndex], reach: 5, range: [power.range ?? 1000, power.range ?? 1000] }, target, power.range === 5 ? "melee" : "ranged");
          const d = rollD20(odds.mode);
          const note = `${odds.mode ? ` with ${odds.mode > 0 ? "advantage" : "disadvantage"}` : ""}${odds.cover.bonus ? ` (${odds.cover.name})` : ""}`;
          if (d !== 1 && (d === 20 || d + power.attack >= target.armorClass + odds.cover.bonus)) {
            const amount = rollDamage(power.dice!, d === 20);
            log.push(`${caster.name} casts ${power.name} at ${target.name}${note} and hits for ${amount} damage${d === 20 ? " (critical)" : ""}.`);
            hit(targetIndex, amount);
            if (power.conditions?.length && combatants[targetIndex].hp > 0) {
              if (power.save && savingThrow(target, power.save, power.dc)) log.push(`${target.name} saves against the rest.`);
              else log.push(`${target.name} is ${afflict(targetIndex)}.`);
            }
          } else log.push(`${caster.name} casts ${power.name} at ${target.name}${note} but misses.`);
        } else {
          const saved = savingThrow(target, power.save ?? "", power.dc);
          const full = power.dice ? rollDamage(power.dice, false) : 0;
          const amount = saved ? (power.halfOnSave ? Math.floor(full / 2) : 0) : full;
          log.push(`${caster.name} casts ${power.name}: ${target.name} ${saved ? "saves" : "fails the save"}${power.dice ? ` and takes ${amount} damage` : ""}.`);
          if (amount > 0) hit(targetIndex, amount);
          const landed = saved ? "" : afflict(targetIndex);
          if (landed) log.push(`${target.name} is ${landed}.`);
        }
      } else {
        log.push(`${caster.name} casts ${power.name}. Its effect is described in its text.`);
      }
      const won = !combatants.some((c) => !c.isPlayer && c.hp > 0);
      if (won) log.push("Victory! All enemies defeated.");
      return { ...state, combatants, combatLog: log, ...(won ? { inCombat: false, outcome: "victory" as CombatOutcome } : {}) };
    }),

  // A death saving throw: 10 or more succeeds, a 1 counts twice, a 20 puts the player back up with 1 hit point
  deathSave: () =>
    set((state) => {
      const player = state.combatants.find((c) => c.isPlayer);
      if (!player || player.hp > 0) return state;
      const d = roll(1, 20);
      if (d === 20) {
        return {
          ...state,
          combatants: state.combatants.map((c) => (c.isPlayer ? { ...c, hp: 1 } : c)),
          deathSaves: { successes: 0, failures: 0 },
          combatLog: [...state.combatLog, "Death save: 20! You regain 1 hit point and get back up."],
        };
      }
      const saves = {
        successes: state.deathSaves.successes + (d >= 10 ? 1 : 0),
        failures: state.deathSaves.failures + (d === 1 ? 2 : d < 10 ? 1 : 0),
      };
      const line = `Death save: ${d}, ${d >= 10 ? "success" : d === 1 ? "two failures" : "failure"} (${saves.successes} of 3 successes, ${Math.min(3, saves.failures)} of 3 failures).`;
      if (saves.failures >= 3) return { ...state, deathSaves: saves, combatLog: [...state.combatLog, line, "You die."], inCombat: false, outcome: "dead" as CombatOutcome };
      if (saves.successes >= 3) return { ...state, deathSaves: saves, combatLog: [...state.combatLog, line, "You are stable, and left for dead."], inCombat: false, outcome: "stable" as CombatOutcome };
      return { ...state, deathSaves: saves, combatLog: [...state.combatLog, line] };
    }),

  damageRoll: (attackType, isCritical) => {
    let diceCount = isCritical ? 2 : 1; // Double dice on critical
    let diceType = 6; // Default to d6
    let modifier = 0;

    const { currentTurn, combatants } = get();
    const attacker = combatants[currentTurn];

    // A stat block's own damage, or the weapon the player is holding
    if (!attacker.isPlayer && attacker.damageDice) return rollDamage(attacker.damageDice, isCritical);
    const weaponDice = attackType === "melee" ? attacker.meleeDice : attackType === "ranged" ? attacker.rangedDice : undefined;
    if (attacker.isPlayer && weaponDice && attacker.abilities) {
      const ability = attackType === "melee" ? attacker.abilities.strength : attacker.abilities.dexterity;
      const bonus = (attackType === "melee" ? attacker.meleeDamage : attacker.rangedDamage) ?? Math.floor((ability - 10) / 2);
      return Math.max(1, rollDamage(weaponDice, isCritical) + bonus);
    }
    // An unarmed strike does 1 + Strength modifier
    if (attacker.isPlayer && attackType === "melee" && attacker.abilities) {
      return Math.max(1, 1 + Math.floor((attacker.abilities.strength - 10) / 2));
    }

    // Set dice type based on attack type
    switch (attackType) {
      case "melee":
        diceType = 8; // d8 for melee
        modifier =
          attacker.isPlayer && attacker.abilities
            ? Math.floor((attacker.abilities.strength - 10) / 2)
            : attacker.damageBonus || 2;
        break;
      case "ranged":
        diceType = 6; // d6 for ranged
        modifier =
          attacker.isPlayer && attacker.abilities
            ? Math.floor((attacker.abilities.dexterity - 10) / 2)
            : attacker.damageBonus || 2;
        break;
      case "force":
        diceType = 10; // d10 for force powers
        modifier =
          attacker.isPlayer && attacker.abilities
            ? Math.floor((attacker.abilities.wisdom - 10) / 2)
            : attacker.damageBonus || 2;
        break;
    }

    // Roll damage (a hit always does at least 1)
    return Math.max(1, roll(diceCount, diceType) + modifier);
  },
}));
