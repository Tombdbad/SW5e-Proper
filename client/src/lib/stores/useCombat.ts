import { create } from "zustand";
import { useCharacter, Character } from "./useCharacter";
import { rollDice, sumDiceResults } from "@/lib/sw5e/dice";
import { conditionMechanics, motionFeet, sizeRank, type PowerMotion } from "@/lib/sw5e/rules";
import { conditions as conditionList } from "@/lib/sw5e/conditions";
import type { RoomAsset, StatProfile, StatAttack, StatSpecial, StatSave, ShipFight as ShipFightData, ShipSheet as ShipSheetData, ShipHelmAction, ShipBoost } from "@shared/logic";
import { shipCombatant, startShipFight, shipMove, shipTurn, shipFire, shipHelm, shipBoost, shipPatch, shipRegenerate, shipDirect, shipInterfere, shipFlee, endShipTurn, shipAi, shoveAsset, bulkOf, type Bulk } from "@shared/logic";
import { minimumRoll, type CombatFeature, type Amount } from "@/lib/sw5e/characterCalculation";
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
  // How high it stands, in levels (a level is 10 feet): 0 on the ground, above it on a roof or a catwalk
  z?: number;
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
  // Their properties (finesse, light, keen 1, vicious 1 ...) and damage types
  meleeProps?: string[];
  rangedProps?: string[];
  meleeType?: string;
  rangedType?: string;
  // The ability the melee weapon is used with (Strength, or Dexterity for a finesse weapon the character is better with)
  meleeAbility?: "strength" | "dexterity";
  // A second light weapon in the other hand, and the character's unarmed strike (a Martial Arts
  // die or a species' natural weapon), for the bonus action attacks
  offhand?: { name: string; dice: string; attack: number; damage: number; type?: string; props?: string[] };
  unarmed?: { name: string; dice: string; attack: number; damage: number; type?: string };
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
  species?: string;
  // Conditions in force (what each does is read from the conditions data, see conditionMechanics)
  conditions?: ActiveCondition[];
  // Fights on the player's side without being the player: a companion (its id is the companion's)
  ally?: boolean;
  // Temporary hit points, taken before real ones
  tempHp?: number;
  // A substance's high: the ability the extra d3 goes to, the turns it has left and what it gives
  // at the start of each turn
  high?: { name: string; ability?: string; rounds: number; temp?: string; low?: boolean };
  // What the character has prepared or coated: a tool's die for one attack, one damage roll and one
  // attack against the character, and a dose of poison on the weapon (the dice, the DC, and whether
  // it has been spent). Spent ones are listed in the fight's `spent`.
  boons?: { attack?: number; damage?: number; damageFlat?: number; ac?: number; poison?: { dice: string; dc: number } };

  // ---- The turn's economy: what the creature has left of its turn (reset when its turn begins)
  // Actions and bonus actions left, reactions left until its next turn, and the attacks still to be
  // made of an Attack action under way (and the kind it began as, for what may follow it)
  actions?: number;
  bonus?: number;
  reactions?: number;
  reactionsPerRound?: number;
  attacksLeft?: number;
  attackKind?: "melee" | "ranged";
  // Feet of movement added by Dashing
  extraMove?: number;
  disengaged?: boolean;
  dodging?: boolean;
  // Hidden from the other side until it attacks
  hidden?: boolean;
  // Attacks recklessly until its next turn (advantage on its melee attacks, and against it)
  reckless?: boolean;
  // Guarding an ally: attacks against that ally have disadvantage while it stands within 5 feet
  guarding?: number | string;
  // Helped: the next attack it makes has advantage
  helped?: boolean;
  // Once-a-turn things already used this turn ("sneak", "quarry")
  usedTurn?: string[];
  // The creature it has marked as its quarry
  marked?: number | string;
  // Armor class added until the start of its next turn (Force Shield)
  acUntil?: number;

  // ---- What the character can do with its class and archetype features (see combatFeatures)
  features?: CombatFeature[];
  // Uses spent of each pool before the next rest, keyed by the feature's pool key
  uses?: Record<string, number>;
  // Focus points left, and the superiority dice (size and number left)
  focus?: number;
  dice?: { size: number; left: number };
  // A state entered at will (a rage), the turns it has left, and whether anything has happened in
  // it since the creature's last turn (a rage ends when nothing has)
  stance?: { label: string; rounds: number; damage: number; resist: string[]; active: boolean };
  // Force points to spend on the next hit for extra dice (Force-Empowered Strikes)
  empower?: number;
  // The maneuver (a feature key) to apply to the next attack
  maneuver?: string;
  // The hit points of each weapon's magazine
  // ---- What a stat block adds: its attacks, area actions and traits
  profile?: StatProfile;
  // Recharges and uses spent by its area actions, by name
  spentSpecials?: string[];
  // Saving throws it may choose to pass (legendary resistance) and the attack it opens with
  resistanceLeft?: number;
  // Damage types halved, doubled or ignored
  resist?: string[];
  vulnerable?: string[];
  immune?: string[];
  // Where it stood at the start of its turn (for a charge)
  turnStart?: { x: number; y: number };
  // The attacks it still has to make this turn, by name (a computer-run creature)
  queue?: string[];
  // Its Dexterity (Stealth) bonus, for the Hide action
  stealth?: number;
}

// Which side a combatant is on: the player's (with companions) or the enemy's
export const onPartySide = (c: Pick<Combatant, "isPlayer" | "ally">) => !!c.isPlayer || !!c.ally;

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
  // A district's street, with what stands over it: raised floors (roofs, catwalks) at a height in
  // levels, and the ladders and stairs that join one height to another (the foot and the top).
  // The district's id says which map it is, so that the map draws the fight itself.
  platforms?: ArenaPlatform[];
  links?: ArenaLink[];
  district?: string;
}
export interface ArenaPlatform {
  z: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ArenaLink {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
}
type Square = { x: number; y: number; z?: number };
// A square's key; the ground (height 0) is just "x,y", a raised floor "x,y,z"
export const key = (x: number, y: number, z = 0) => (z ? `${x},${y},${z}` : `${x},${y}`);
export const parseKey = (k: string): { x: number; y: number; z: number } => {
  const [x, y, z = 0] = k.split(",").map(Number);
  return { x, y, z };
};

// Squares between two creatures: a diagonal step counts as one (Player's Handbook grid rule); a
// level of height is two squares (10 feet), and the greatest of the three counts, as for a cube
export const squaresApart = (a: { x?: number; y?: number; z?: number }, b: { x?: number; y?: number; z?: number }) =>
  Math.max(Math.abs((a.x ?? 0) - (b.x ?? 0)), Math.abs((a.y ?? 0) - (b.y ?? 0)), Math.round(Math.abs((a.z ?? 0) - (b.z ?? 0)) * 2));

const covers = (asset: RoomAsset, x: number, y: number) => !asset.side && asset.x <= x && x < asset.x + asset.w && asset.y <= y && y < asset.y + asset.h;
// Whether a square cannot be stood on: off the ground (or off the raised floor), or taken by
// something that blocks, at that height
const solid = (arena: Arena, x: number, y: number, z = 0) => {
  if (z === 0) return x < 0 || y < 0 || x >= arena.width || y >= arena.height || arena.assets.some((a) => a.blocks && !a.z && covers(a, x, y));
  const floor = (arena.platforms ?? []).some((p) => p.z === z && x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height);
  return !floor || arena.assets.some((a) => a.blocks && a.z === z && covers(a, x, y));
};

// Feet a creature can still move this turn, as its conditions allow
export function movementLeft(c: Combatant): number {
  const factor = Math.min(1, ...(c.conditions ?? []).map((x) => conditionMechanics(x.name).speed));
  return Math.max(0, Math.floor(((c.speed ?? 30) * factor) / 5) * 5 + (c.extraMove ?? 0) - (c.moved ?? 0));
}

// Every square a creature can walk to with the movement it has left, and the feet it costs.
// Furniture that blocks and other creatures are walked around; no cutting corners.
export function reachable(arena: Arena, combatants: Combatant[], mover: Combatant, limit = movementLeft(mover)): Map<string, { cost: number; from?: string }> {
  const taken = new Set(combatants.filter((c) => c.id !== mover.id && c.hp > 0).map((c) => key(c.x ?? -1, c.y ?? -1, c.z ?? 0)));
  const open = (x: number, y: number, z: number) => !solid(arena, x, y, z) && !taken.has(key(x, y, z));
  const start = { x: mover.x ?? 0, y: mover.y ?? 0, z: mover.z ?? 0 };
  const found = new Map<string, { cost: number; from?: string }>([[key(start.x, start.y, start.z), { cost: 0 }]]);
  const queue: { x: number; y: number; z: number }[] = [start];
  // A ladder or a flight of stairs is walked either way, at 10 feet for each level it rises
  const links = (arena.links ?? []).flatMap((l) => [l, { from: l.to, to: l.from }]);
  while (queue.length) {
    const at = queue.shift()!;
    const here = found.get(key(at.x, at.y, at.z))!.cost;
    if (here + 5 <= limit) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = at.x + dx;
        const y = at.y + dy;
        if ((!dx && !dy) || found.has(key(x, y, at.z)) || !open(x, y, at.z)) continue;
        if (dx && dy && (solid(arena, at.x + dx, at.y, at.z) || solid(arena, at.x, at.y + dy, at.z))) continue;
        found.set(key(x, y, at.z), { cost: here + 5, from: key(at.x, at.y, at.z) });
        queue.push({ x, y, z: at.z });
      }
    }
    for (const link of links) {
      if (link.from.x !== at.x || link.from.y !== at.y || link.from.z !== at.z) continue;
      const cost = here + 10 * Math.max(1, Math.abs(link.to.z - link.from.z));
      const to = link.to;
      if (cost > limit || found.has(key(to.x, to.y, to.z)) || !open(to.x, to.y, to.z)) continue;
      found.set(key(to.x, to.y, to.z), { cost, from: key(at.x, at.y, at.z) });
      queue.push({ ...to });
    }
  }
  return found;
}

// Cover a target has from an attacker: what it stands behind, that is, cover on the line between
// them and within 5 feet of the target (a ship's hull counts from anywhere on the line). One
// thing in the way is half cover (+3 AC, Player's Handbook), more is three-quarters (+5).
export function coverBetween(arena: Arena, from: { x?: number; y?: number; z?: number }, to: { x?: number; y?: number; z?: number }): { bonus: number; name: string; blocked?: string } {
  const [x0, y0, x1, y1] = [from.x ?? 0, from.y ?? 0, to.x ?? 0, to.y ?? 0];
  const [z0, z1] = [from.z ?? 0, to.z ?? 0];
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const inTheWay = new Set<RoomAsset>();
  // Something that stands higher than the line of fire at that square stops it. Whoever stands on
  // top of it (on the roof of a building) shoots over its edge: the squares of the edge do not
  // stop a line from a roof, those further in do
  const standsOn = (a: RoomAsset, x: number, y: number, z: number) => covers(a, x, y) && z >= (a.height ?? 0);
  const edge = (a: RoomAsset, x: number, y: number) => x === a.x || x === a.x + a.w - 1 || y === a.y || y === a.y + a.h - 1;
  let blocked: string | undefined;
  for (let i = 1; i < steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    const level = z0 + ((z1 - z0) * i) / steps;
    const beside = Math.max(Math.abs(x - x1), Math.abs(y - y1)) <= 1;
    for (const asset of arena.assets) {
      const over = asset.height && (standsOn(asset, x0, y0, z0) || standsOn(asset, x1, y1, z1)) && edge(asset, x, y);
      if (asset.height && covers(asset, x, y) && level < asset.height - 0.001 && !over) blocked ??= asset.name.toLowerCase();
      else if (asset.cover && covers(asset, x, y) && (asset.z ?? 0) === z1 && (beside || asset.kind === "ship")) inTheWay.add(asset);
    }
  }
  const names = Array.from(inTheWay).map((a) => a.name.toLowerCase()).join(", ");
  if (blocked) return { bonus: 0, name: "", blocked };
  return inTheWay.size === 0 ? { bonus: 0, name: "" } : inTheWay.size === 1 ? { bonus: 3, name: `half cover: ${names}` } : { bonus: 5, name: `three-quarters cover: ${names}` };
}

// What an attack is made with: its reach or range, which the plan checks it against
export interface WeaponReach {
  reach?: number;
  range?: [number, number];
}

// Whether a creature can act at all: standing, and not held by a condition
const upright = (c: Combatant) => c.hp > 0 && !cannotAct(c);

// Whether an attack can be made from where the attacker stands, and what bears on it: reach and
// range (long range and an enemy within 5 feet give a ranged attack disadvantage), conditions,
// the target's cover, and the turn's own doings: dodging, hiding, reckless attacks, a helper, a
// guard standing by the target, allies at the target's side (pack tactics)
export function attackPlan(arena: Arena, combatants: Combatant[], attacker: Combatant, target: Combatant, type: "melee" | "ranged", weapon: WeaponReach = {}) {
  const feet = squaresApart(attacker, target) * 5;
  const odds = attackOdds(attacker, target, type, feet <= 5);
  const reasons = [...odds.reasons];
  let down = odds.down;
  let up = odds.up;
  let possible = true;
  let why = "";
  if (type === "melee") {
    possible = feet <= (weapon.reach ?? attacker.reach ?? 5);
    if (!possible) why = `${target.name} is ${feet} ft. away`;
  } else {
    const [normal, long] = weapon.range ?? attacker.range ?? [80, 320];
    possible = feet <= long;
    if (!possible) why = `${target.name} is ${feet} ft. away, beyond ${long} ft.`;
    if (possible && feet > normal) {
      down = true;
      reasons.push("long range");
    }
    if (!(attacker.features ?? []).some((f) => f.noCloseRangedPenalty) && combatants.some((c) => c.hp > 0 && onPartySide(c) !== onPartySide(attacker) && !cannotAct(c) && squaresApart(c, attacker) <= 1)) {
      down = true;
      reasons.push("an enemy within 5 feet");
    }
  }
  const cover: { bonus: number; name: string; blocked?: string } = feet > 5 ? coverBetween(arena, attacker, target) : { bonus: 0, name: "" };
  if (cover.blocked) {
    possible = false;
    why = `${cover.blocked} is in the way: ${target.name} cannot be seen from here`;
  }
  // The turn's doings
  if (target.dodging && upright(target)) {
    down = true;
    reasons.push(`${target.name} is dodging`);
  }
  if (target.hidden) {
    down = true;
    reasons.push(`${target.name} is hidden`);
  }
  if (attacker.hidden) {
    up = true;
    reasons.push(`${attacker.name} is hidden`);
  }
  if (attacker.reckless && type === "melee") {
    up = true;
    reasons.push(`${attacker.name} attacks recklessly`);
  }
  if (target.reckless) {
    up = true;
    reasons.push(`${target.name} is reckless`);
  }
  if (attacker.helped) {
    up = true;
    reasons.push("helped");
  }
  const guard = combatants.find((c) => c.id !== target.id && c.guarding === target.id && upright(c) && squaresApart(c, target) <= 1);
  if (guard) {
    down = true;
    reasons.push(`${guard.name} guards ${target.name}`);
  }
  if (attacker.profile?.traits.some((t) => t.kind === "packTactics")) {
    const mate = combatants.find((c) => c.id !== attacker.id && onPartySide(c) === onPartySide(attacker) && upright(c) && squaresApart(c, target) <= 1);
    if (mate) {
      up = true;
      reasons.push(`pack tactics: ${mate.name} is beside ${target.name}`);
    }
  }
  // Advantage and disadvantage from any number of sources cancel to a straight roll
  const mode = Number(up) - Number(down);
  return { possible, why, mode, crit: odds.crit, barred: odds.barred, reasons, cover, feet, up, down };
}

// The nearest free square to where a creature should stand
function freeSquare(arena: Arena, taken: Set<string>, want: Square): Square {
  const z = want.z ?? 0;
  for (let ring = 0; ring < arena.width + arena.height; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const x = want.x + dx;
      const y = want.y + dy;
      if (!solid(arena, x, y, z) && !taken.has(key(x, y, z))) return z ? { x, y, z } : { x, y };
    }
  }
  return want;
}

// Moves a creature towards a target until it is within the given distance, as far as its
// movement goes. Returns where it ends up and the feet spent.
function stepTowards(arena: Arena, combatants: Combatant[], mover: Combatant, target: Combatant, withinFeet: number): { x: number; y: number; z: number; cost: number } {
  const here = { x: mover.x ?? 0, y: mover.y ?? 0, z: mover.z ?? 0, cost: 0 };
  if (squaresApart(mover, target) * 5 <= withinFeet) return here;
  // How far every square is from the target, walking round furniture
  const field = reachable(arena, combatants.filter((c) => c.id === target.id), { ...target, id: "field" }, 10000);
  const options = reachable(arena, combatants, mover);
  let best = { ...here, score: Infinity };
  options.forEach((step, k) => {
    const { x, y, z } = parseKey(k);
    const apart = squaresApart({ x, y, z }, target) * 5;
    // Close enough is best, and of those the nearest to walk to; otherwise whatever gets nearest
    const score = apart <= withinFeet ? step.cost / 1000 : 100 + (field.get(k)?.cost ?? 9999) + step.cost / 1000;
    if (score < best.score) best = { x, y, z, cost: step.cost, score };
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
  const foes = combatants.filter((c) => onPartySide(c) !== onPartySide(attacker) && c.hp > 0);
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
  const high = c.high && c.high.ability === ability ? roll(1, 3) * (c.high.low ? -1 : 1) : 0;
  return rollD20(all.some((x) => x.m.disadvantageSaves.includes(ability)) ? -1 : 0) + (c.saves?.[ability] ?? 0) + high >= dc;
}

// Adds conditions to a creature; one it already has is replaced
function withConditions(c: Combatant, added: ActiveCondition[]): Combatant {
  const names = added.map((a) => a.name);
  return { ...c, conditions: [...(c.conditions ?? []).filter((x) => !names.includes(x.name)), ...added] };
}

// Takes hit points off a creature; damage ends the conditions that say so (a sleeper wakes)
const hurt = (c: Combatant, amount: number): Combatant => {
  const absorbed = Math.min(c.tempHp ?? 0, amount);
  return {
    ...c,
    tempHp: (c.tempHp ?? 0) - absorbed,
    hp: Math.max(0, c.hp - (amount - absorbed)),
    conditions: c.conditions?.filter((x) => !x.endsOnDamage),
  };
};

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
  // What its casting takes: an action (the default), a bonus action, a reaction, or longer
  castTime?: "action" | "bonus" | "reaction" | "long";
  // It moves a creature or an object (read from its text: rules.ts powerMotion)
  motion?: PowerMotion;
  summary: string;
  // The caster's numbers for this power
  modifier: number;
  attack: number;
  dc: number;
}

export type CombatOutcome = "victory" | "stable" | "dead" | "left" | null;

// What using an item does in a fight. The numbers (the amount healed, the dice and DCs of an
// explosive) are read from the item's text by the caller.
export type ItemEffect =
  | { kind: "heal"; label: string; targetId: number | string; amount: number }
  | { kind: "stabilize"; label: string; targetId: number | string; to: number }
  | { kind: "explosive"; label: string; targetId: number | string; radius: number; maxFeet: number; dc: number; save: string; damage: { dice: string; type: string }[]; conditions: string[]; conditionRounds: number }
  | { kind: "substance"; label: string; ability?: string; temp?: string; rounds: number }
  | { kind: "poison"; label: string; dice: string; dc: number };

// ---------------------------------------------------------------------------------------------
// Dice and damage
// ---------------------------------------------------------------------------------------------

// Rolls "2d6 + 1" or "1d8 + 1d4 - 1": a critical hit rolls the dice twice, and `extraDice` more of
// the first die besides (Brutal Critical); a hit always does at least 1
export function rollDamage(expression: string, isCritical: boolean, extraDice = 0, threshold = false): number {
  const terms = expression.replace(/\s+/g, "").match(/[+-]?[^+-]+/g) ?? [];
  let total = 0;
  let first = true;
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");
    const dice = body.match(/^(\d+)d(\d+)$/);
    if (dice) {
      const count = Number(dice[1]) * (isCritical ? 2 : 1) + (isCritical && first ? extraDice : 0);
      first = false;
      const sides = Number(dice[2]);
      // A minimum roll threshold: a die cannot roll below it (Player's Handbook, chapter 7)
      if (threshold) for (let i = 0; i < count; i++) total += sign * Math.max(dieRoll(sides), minimumRoll(sides));
      else total += sign * roll(count, sides);
    } else total += sign * (Number(body) || 0);
  }
  return Math.max(1, total);
}

// An amount of the kind features give: dice and a flat part
export const rollAmount = (amount: Amount, isCritical = false): number => (amount.dice ? rollDamage(amount.dice, isCritical) : 0) + amount.flat;

// The number of dice in an expression ("2d6 + 3" is 2)
const diceIn = (expression: string) => Number(expression.match(/(\d+)d\d+/)?.[1] ?? 0);

// The size of the first die in an expression ("1d8 + 3" is 8)
const dieSize = (expression: string) => Number(expression.match(/\d+d(\d+)/)?.[1] ?? 0);

const dieRoll = (sides: number) => roll(1, sides);

// A property's number: "keen 1" is 1, "vicious 2" is 2; 0 when the weapon lacks it
export const propertyNumber = (props: string[] | undefined, name: string): number => {
  const found = (props ?? []).map((p) => p.match(new RegExp(`^${name}(?:\\s+(\\d+))?`, "i"))).find(Boolean);
  return found ? Number(found[1] ?? 1) : 0;
};
const hasProperty = (props: string[] | undefined, name: string) => (props ?? []).some((p) => new RegExp(`^${name}\\b`, "i").test(p));

// ---------------------------------------------------------------------------------------------
// What a creature attacks with
// ---------------------------------------------------------------------------------------------

export interface AttackSpec {
  name: string;
  type: "melee" | "ranged";
  // To hit, and the dice and flat bonus of the damage (a stat block's damage is complete in `dice`)
  bonus: number;
  dice: string;
  damageBonus: number;
  damageType?: string;
  reach: number;
  range?: [number, number];
  properties: string[];
  // Strength or Dexterity, for what a rage adds
  ability?: "strength" | "dexterity";
  // From a stat block: its extra damage and the saving throw that comes with the hit
  extra?: { dice: string; type?: string };
  save?: StatSave;
  statBlock?: boolean;
  // A bonus action attack with the weapon in the other hand: no modifier to damage unless negative
  offhand?: boolean;
}

// What the character attacks with, for each kind of attack
export function playerSpec(c: Combatant, kind: "melee" | "ranged" | "unarmed" | "offhand"): AttackSpec | undefined {
  if (kind === "melee") {
    return {
      name: c.meleeWeapon ?? c.unarmed?.name ?? "Unarmed strike",
      type: "melee",
      bonus: c.meleeAttack ?? Math.floor(((c.abilities?.strength ?? 10) - 10) / 2) + (c.attackBonus ?? 2),
      dice: c.meleeDice ?? c.unarmed?.dice ?? "1",
      damageBonus: c.meleeDice ? c.meleeDamage ?? Math.floor(((c.abilities?.strength ?? 10) - 10) / 2) : c.unarmed ? c.unarmed.damage : Math.floor(((c.abilities?.strength ?? 10) - 10) / 2),
      damageType: c.meleeType ?? c.unarmed?.type,
      reach: c.reach ?? 5,
      properties: c.meleeProps ?? [],
      ability: c.meleeAbility ?? "strength",
    };
  }
  if (kind === "ranged") {
    if (!c.rangedDice) return undefined;
    return {
      name: c.rangedWeapon ?? "Ranged weapon",
      type: "ranged",
      bonus: c.rangedAttack ?? Math.floor(((c.abilities?.dexterity ?? 10) - 10) / 2) + (c.attackBonus ?? 2),
      dice: c.rangedDice,
      damageBonus: c.rangedDamage ?? Math.floor(((c.abilities?.dexterity ?? 10) - 10) / 2),
      damageType: c.rangedType,
      reach: 5,
      range: c.range ?? [80, 320],
      properties: c.rangedProps ?? [],
      ability: "dexterity",
    };
  }
  if (kind === "unarmed") {
    const u = c.unarmed ?? { name: "Unarmed strike", dice: "1", attack: Math.floor(((c.abilities?.strength ?? 10) - 10) / 2) + (c.attackBonus ?? 2), damage: Math.floor(((c.abilities?.strength ?? 10) - 10) / 2), type: "kinetic" };
    return { name: u.name, type: "melee", bonus: u.attack, dice: u.dice, damageBonus: u.damage, damageType: u.type, reach: 5, properties: ["finesse"], ability: "strength" };
  }
  const o = c.offhand;
  // The modifier counts for the off hand's damage only when it is negative, or a style says so
  const modifier = (c.features ?? []).some((f) => f.offhandModifier) ? o?.damage ?? 0 : Math.min(0, o?.damage ?? 0);
  return o && { name: o.name, type: "melee", bonus: o.attack, dice: o.dice, damageBonus: modifier, damageType: o.type, reach: 5, properties: o.props ?? [], ability: "strength", offhand: true };
}

// A stat block's attacks as specs; a creature with no profile (an older world, a companion) has the
// one attack its figures give
export function statSpecs(c: Combatant): AttackSpec[] {
  const fromProfile = (c.profile?.attacks ?? []).map((a: StatAttack): AttackSpec => ({
    name: a.name,
    type: a.ranged ? "ranged" : "melee",
    bonus: a.bonus,
    dice: a.damage,
    damageBonus: 0,
    damageType: a.damageType,
    reach: a.ranged ? 5 : a.range,
    range: a.ranged ? [a.range, a.long ?? a.range * 4] : undefined,
    properties: [],
    extra: a.extra,
    save: a.save,
    statBlock: true,
  }));
  if (fromProfile.length) return fromProfile;
  const ranged = c.rangedAttacker !== false;
  return [{
    name: "Attack",
    type: ranged ? "ranged" : "melee",
    bonus: c.attackBonus ?? 3,
    dice: c.damageDice ?? "1d6",
    damageBonus: 0,
    reach: ranged ? 5 : c.reach ?? 5,
    range: ranged ? c.range ?? [80, 320] : undefined,
    properties: [],
    statBlock: true,
  }];
}

// The attacks a creature makes with its Attack action, by name, as many as it can: a stat block's
// Multiattack, else the best attack once
export function attackPlanFor(c: Combatant, specs: AttackSpec[]): AttackSpec[] {
  const named = (c.profile?.multiattack ?? []).map((n) => specs.find((s) => s.name === n)).filter((s): s is AttackSpec => !!s);
  if (named.length) return named;
  const best = [...specs].sort((a, b) => b.bonus - a.bonus || diceIn(b.dice) - diceIn(a.dice))[0];
  return best ? [best] : [];
}

// How a damage type is taken: 0 immune, 0.5 resistant, 2 vulnerable
export const damageFactor = (c: Combatant, type?: string): number => {
  const t = (type ?? "").toLowerCase();
  if (!t) return 1;
  const stance = c.stance?.resist ?? [];
  if ((c.immune ?? []).includes(t) || (c.profile?.immunities ?? []).includes(t)) return 0;
  if ((c.vulnerable ?? []).includes(t) || (c.profile?.vulnerabilities ?? []).includes(t)) return 2;
  if ((c.resist ?? []).includes(t) || (c.profile?.resistances ?? []).includes(t) || stance.includes(t)) return 0.5;
  return 1;
};

// Attacks the character can make as a bonus action now, and why not
export function bonusAttackKinds(c: Combatant): { kind: "unarmed" | "melee" | "ranged" | "offhand"; label: string; source: string }[] {
  if (!c.isPlayer || (c.bonus ?? 0) <= 0 || (c.attacksLeft ?? 0) < 0) return [];
  const did = (what: string) => (c.usedTurn ?? []).includes(`did:${what}`);
  const out: { kind: "unarmed" | "melee" | "ranged" | "offhand"; label: string; source: string }[] = [];
  for (const f of c.features ?? []) {
    if (!f.bonusAttack || !f.bonusAttack.after.some(did)) continue;
    if (f.bonusAttack.unarmed) out.push({ kind: "unarmed", label: `${c.unarmed?.name ?? "Unarmed strike"}`, source: f.name });
    else out.push({ kind: c.meleeDice || !c.rangedDice ? "melee" : "ranged", label: "Weapon attack", source: f.name });
  }
  // Two-weapon fighting (Player's Handbook): after the Attack action with a light weapon, one with another light weapon
  if (c.offhand && did("attack-light") && !out.some((o) => o.kind === "offhand")) out.push({ kind: "offhand", label: c.offhand.name, source: "Two-weapon fighting" });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The fight's working copy: the creatures, the log and what has ended the fight, changed in place
// by the rules below and then written back to the store in one step
// ---------------------------------------------------------------------------------------------

export interface PendingHit {
  attackerId: number | string;
  targetId: number | string;
  // What was rolled: the attack total against the armor class, the damage and its type, a critical
  attackName: string;
  total: number;
  ac: number;
  damage: number;
  damageType?: string;
  crit: boolean;
  melee: boolean;
  note: string;
  // The saving throw and extra damage that come with the hit
  save?: StatSave;
  extra?: { dice: string; type?: string };
  options: { key: string; label: string; kind: "halve" | "reduce" | "ac" | "acDie"; feature: string }[];
}

interface Work {
  combatants: Combatant[];
  log: string[];
  arena: Arena;
  round: number;
  inCombat: boolean;
  outcome: CombatOutcome;
  deathSaves: { successes: number; failures: number };
  pending: PendingHit | null;
  turnDone: boolean;
  currentTurn: number;
  spent: ("attack" | "damage" | "ac" | "poison")[];
}

const idx = (w: Work, id: number | string) => w.combatants.findIndex((c) => c.id === id);

// Takes hit points off a creature (damage types resisted or doubled, temporary hit points first),
// and settles what that does to the fight: a fallen creature, the party's victory, the character
// down or dead outright. Returns the damage taken.
function damageCreature(w: Work, at: number, amount: number, type?: string, attackerName?: string): number {
  const c = w.combatants[at];
  const adjusted = Math.floor(amount * damageFactor(c, type));
  const before = c.hp;
  w.combatants[at] = { ...hurt(c, adjusted), stance: c.stance ? { ...c.stance, active: true } : c.stance };
  const now = w.combatants[at];
  if (before > 0 && now.hp === 0) {
    w.log.push(`${c.name} is ${c.isPlayer ? "down" : "defeated"}!`);
    if (!w.combatants.some((x) => !onPartySide(x) && x.hp > 0)) {
      w.log.push("Victory! All enemies defeated.");
      w.inCombat = false;
      w.outcome = "victory";
    } else if (c.isPlayer) {
      const massive = adjusted - before >= c.maxHp;
      w.log.push(massive ? "The blow kills you outright." : "You fall unconscious and begin making death saving throws.");
      w.deathSaves = { successes: 0, failures: 0 };
      if (massive) {
        w.inCombat = false;
        w.outcome = "dead";
      }
    }
  }
  void attackerName;
  return adjusted;
}

// A creature's armor class now: what it wears, a tool's prepared die (spent once), and what it
// holds up until its next turn (Force Shield)
const armorClassNow = (c: Combatant) => c.armorClass + (c.acUntil ?? 0);

// Feature uses left in a pool, and whether a feature can be paid for now
const usesLeft = (c: Combatant, f: CombatFeature) => (f.uses ? f.uses.max - (c.uses?.[f.pool] ?? 0) : Infinity);
const canPay = (c: Combatant, f: CombatFeature) =>
  !f.cost || f.cost.pool === "die" || (f.cost.pool === "focus" ? (c.focus ?? 0) >= f.cost.points : (c.powerPoints ?? 0) >= f.cost.points);
const pay = (c: Combatant, f: CombatFeature): Combatant => ({
  ...c,
  uses: f.uses ? { ...(c.uses ?? {}), [f.pool]: (c.uses?.[f.pool] ?? 0) + 1 } : c.uses,
  ...(f.cost?.pool === "focus" ? { focus: (c.focus ?? 0) - f.cost.points } : f.cost && f.cost.pool === "power" ? { powerPoints: (c.powerPoints ?? 0) - f.cost.points } : {}),
});

// A creature that can use a reaction now
const canReact = (c: Combatant) => c.hp > 0 && (c.reactions ?? 1) > 0 && !cannotAct(c);

// What the character could do with a reaction against a hit that has landed
function reactionOptions(target: Combatant, hit: Omit<PendingHit, "options">): PendingHit["options"] {
  if (!target.isPlayer || !canReact(target)) return [];
  const out: PendingHit["options"] = [];
  for (const f of target.features ?? []) {
    if (f.activation !== "reaction" && !f.acDie) continue;
    if (usesLeft(target, f) <= 0 || !canPay(target, f)) continue;
    if (f.reduce) {
      if (f.reduce.against === "ranged" && hit.melee) continue;
      if (f.reduce.against === "melee" && !hit.melee) continue;
      out.push({ key: `reduce:${f.key}`, label: `${f.name}: ${f.reduce.halve ? "halve the damage" : `reduce the damage by ${f.reduce.amount?.dice ?? ""}${f.reduce.amount?.flat ? ` + ${f.reduce.amount.flat}` : ""}`}`, kind: f.reduce.halve ? "halve" : "reduce", feature: f.key });
    }
    if (f.acBonus && hit.total < hit.ac + f.acBonus.flat) {
      out.push({ key: `ac:${f.key}`, label: `${f.name}: +${f.acBonus.flat} to Armor Class (turns this hit into a miss)`, kind: "ac", feature: f.key });
    }
    if (f.acDie && hit.total < hit.ac + dieSize(`1${f.acDie}`) && (target.powerPoints ?? 0) >= (f.cost?.points ?? 1)) {
      out.push({ key: `acDie:${f.key}`, label: `${f.name}: roll a ${f.acDie} and add it to Armor Class`, kind: "acDie", feature: f.key });
    }
  }
  return out;
}

// Lands a hit that has been rolled: the character's chosen reaction (or none) is applied first,
// then damage, then what comes with the hit
function landHit(w: Work, hit: Omit<PendingHit, "options">, choice: PendingHit["options"][number] | null) {
  const ti = idx(w, hit.targetId);
  const ai = idx(w, hit.attackerId);
  if (ti < 0) return;
  let target = w.combatants[ti];
  let damage = hit.damage;
  const parts: string[] = [];
  if (choice) {
    const f = (target.features ?? []).find((x) => x.key === choice.feature);
    if (f) {
      w.combatants[ti] = { ...pay(target, f), reactions: (target.reactions ?? 1) - 1 };
      target = w.combatants[ti];
      if (choice.kind === "halve") {
        damage = Math.floor(damage / 2);
        parts.push(`${f.name}: damage halved`);
      } else if (choice.kind === "reduce" && f.reduce?.amount) {
        const cut = rollAmount(f.reduce.amount);
        damage = Math.max(0, damage - cut);
        parts.push(`${f.name}: -${cut}`);
      } else if (choice.kind === "ac" && f.acBonus) {
        const bonus = f.acBonus.flat;
        w.combatants[ti] = { ...target, acUntil: (target.acUntil ?? 0) + bonus };
        target = w.combatants[ti];
        if (hit.total < hit.ac + bonus) {
          w.log.push(`${hit.attackName} at ${target.name}: ${f.name} (+${bonus} AC) turns the hit into a miss.`);
          return;
        }
        parts.push(`${f.name}: +${bonus} AC, still hits`);
      } else if (choice.kind === "acDie" && f.acDie) {
        const die = dieRoll(dieSize(`1${f.acDie}`));
        if (hit.total < hit.ac + die) {
          w.log.push(`${hit.attackName} at ${target.name}: ${f.name} (+${die} AC) turns the hit into a miss.`);
          return;
        }
        parts.push(`${f.name}: +${die} AC, still hits`);
      }
    }
  }
  const attacker = w.combatants[ai];
  const factor = damageFactor(target, hit.damageType);
  const dealt = Math.floor(damage * factor);
  w.log.push(
    `${attacker?.name ?? "Something"} hits ${target.name}${hit.note ? ` (${hit.note})` : ""} with ${hit.attackName} for ${dealt} damage${hit.crit ? " (critical hit)" : ""}${factor === 0.5 ? ", resisted" : factor === 2 ? ", vulnerable" : factor === 0 ? ", immune" : ""}${parts.length ? `; ${parts.join("; ")}` : ""}.`,
  );
  damageCreature(w, ti, damage, hit.damageType, attacker?.name);
  const after = w.combatants[ti];
  if (!w.inCombat) return;
  // Extra damage and a saving throw that come with the hit (a stat block's stinger, a poison)
  if (hit.extra && after.hp > 0) {
    const extra = rollDamage(hit.extra.dice, hit.crit);
    w.log.push(`${target.name} takes ${Math.floor(extra * damageFactor(after, hit.extra.type))} more ${hit.extra.type ?? ""} damage.`.replace("  ", " "));
    damageCreature(w, ti, extra, hit.extra.type, attacker?.name);
  }
  const now = w.combatants[ti];
  if (hit.save && now.hp > 0 && w.inCombat) riderSave(w, ti, hit.save, attacker?.id, hit.attackName);
}

// A saving throw that comes with a hit or an area action: damage on a failure (half on a success
// when the text says so) and the conditions that go with it
function riderSave(w: Work, at: number, save: StatSave, by: number | string | undefined, source: string) {
  const c = w.combatants[at];
  if (c.hp <= 0) return;
  // A creature that can choose to pass a saving throw does so against a damaging effect
  const passed = c.resistanceLeft && c.resistanceLeft > 0 && (save.damage || save.conditions) && !savingThrow(c, save.ability, save.dc);
  let saved = passed ? true : savingThrow(c, save.ability, save.dc);
  if (passed) w.combatants[at] = { ...c, resistanceLeft: (c.resistanceLeft ?? 0) - 1 };
  // Evasion: no damage on a successful save and half on a failed one (Dexterity)
  const evasive = save.ability === "dexterity" && ((c.features ?? []).some((f) => f.evasion) || (c.profile?.traits ?? []).some((t) => t.kind === "evasion"));
  let amount = 0;
  if (save.damage) {
    const full = rollDamage(save.damage, false);
    amount = saved ? (save.half || evasive ? (evasive ? 0 : Math.floor(full / 2)) : 0) : evasive && save.half ? Math.floor(full / 2) : full;
  }
  const taken = amount > 0 ? damageCreature(w, at, amount, save.damageType) : 0;
  const after = w.combatants[at];
  let landed = "";
  if (!saved && save.conditions?.length && after.hp > 0 && !save.conditions.some((n) => (after.profile?.conditionImmunities ?? []).includes(n))) {
    w.combatants[at] = withConditions(after, save.conditions.map((name) => ({
      name: conditionList.find((x) => x.name.toLowerCase() === name)?.name ?? name,
      rounds: save.rounds ?? 1,
      save: (save.rounds ?? 1) > 1 ? { ability: save.ability, dc: save.dc } : undefined,
      by,
      source,
    })));
    landed = `, and is ${save.conditions.join(" and ")}${(save.rounds ?? 1) > 1 ? ` ${lasts(save.rounds ?? 1)}` : ""}`;
  }
  w.log.push(`${c.name} ${passed ? "chooses to succeed" : saved ? "saves" : "fails the saving throw"} (${save.ability.slice(0, 3).toUpperCase()} DC ${save.dc})${taken ? ` and takes ${taken} damage` : ""}${landed}.`);
}

// ---------------------------------------------------------------------------------------------
// Making an attack
// ---------------------------------------------------------------------------------------------

interface AttackFlags {
  // Part of a stat block's or character's own Attack action; false for an opportunity attack etc.
  viaAction?: boolean;
  // The bonus attack that follows another; an opportunity attack
  opportunity?: boolean;
  // Moved this turn in a straight line (a charge): feet
  charged?: number;
}

// One attack from one creature to another, with everything that bears on it: the plan (reach,
// range, cover, advantage), the roll, prepared dice, the weapon's properties, a rage, sneak attack
// and other extra damage, then the target's reactions before the damage lands.
// Returns false when the attack cannot be made (nothing was spent).
function makeAttack(w: Work, ai: number, ti: number, spec: AttackSpec, flags: AttackFlags = {}): boolean {
  const attacker = w.combatants[ai];
  const target = w.combatants[ti];
  if (!attacker || !target || target.hp <= 0) return false;
  const plan = attackPlan(w.arena, w.combatants, attacker, target, spec.type, { reach: spec.reach, range: spec.range });
  if (plan.barred) {
    w.log.push(`${attacker.name} is ${plan.barred.toLowerCase()} and cannot attack ${target.name}.`);
    return false;
  }
  if (!plan.possible) {
    w.log.push(`${attacker.name} cannot attack: ${plan.why}.`);
    return false;
  }
  const notes: string[] = [];
  if (plan.mode) notes.push(`${plan.mode > 0 ? "advantage" : "disadvantage"}: ${plan.reasons.join(", ")}`);
  if (plan.cover.name) notes.push(plan.cover.name);
  const d = rollD20(plan.mode);
  let bonus = spec.bonus;
  // A substance's extra d3 on attacks made with its ability
  if (attacker.high && attacker.high.ability === spec.ability) {
    const d3 = dieRoll(3) * (attacker.high.low ? -1 : 1);
    bonus += d3;
    notes.push(`${d3 > 0 ? "+" : ""}${d3} ${attacker.high.low ? "low" : "high"}`);
  }
  // A tool's prepared die, once, on an attack
  if (attacker.isPlayer && attacker.boons?.attack && !w.spent.includes("attack")) {
    const die = dieRoll(attacker.boons.attack);
    bonus += die;
    notes.push(`+${die} prepared`);
    w.spent.push("attack");
  }
  // A maneuver applied with the attack roll: its superiority die is added to the roll
  const chosen = attacker.maneuver ? (attacker.features ?? []).find((f) => f.key === attacker.maneuver) : undefined;
  let maneuverUsed: CombatFeature | undefined;
  if (chosen?.maneuver && usesLeft(attacker, chosen) > 0) {
    if (chosen.maneuver.timing === "attack") {
      const die = dieRoll(chosen.maneuver.die);
      bonus += die;
      notes.push(`${chosen.name} +${die}`);
      maneuverUsed = chosen;
    }
  }
  // A prepared die of armor work against one attack
  let guardBonus = 0;
  if (target.isPlayer && target.boons?.ac && !w.spent.includes("ac")) {
    guardBonus = dieRoll(target.boons.ac);
    notes.push(`armor work +${guardBonus} AC`);
    w.spent.push("ac");
  }
  const ac = armorClassNow(target) + plan.cover.bonus + guardBonus;
  const total = d === 1 ? 0 : d + bonus;
  const critRange = 20 - propertyNumber(spec.properties, "keen");
  const critHit = d >= critRange && d !== 1;
  const hit = d !== 1 && (total >= ac || critHit);
  const crit = d !== 1 && (critHit || (hit && plan.crit));
  // A stat block's reaction (a parry) that turns the hit into a miss
  let parried = false;
  if (hit && !crit && !target.isPlayer && canReact(target)) {
    const parry = (target.profile?.reactions ?? []).find((r) => r.kind === "acBonus" && r.amount && (r.against === "any" || r.against === spec.type) && total < ac + r.amount);
    if (parry) {
      w.combatants[ti] = { ...target, reactions: (target.reactions ?? 1) - 1 };
      parried = true;
      w.log.push(`${attacker.name} attacks ${target.name} with ${spec.name}, but ${target.name} uses ${parry.name} (+${parry.amount} AC): miss.`);
    }
  }
  // Attacking gives away a creature that was hidden or invisible by a power
  const revealed = attacker.conditions?.filter((c) => c.endsOnAttack) ?? [];
  const cur = w.combatants[ai];
  w.combatants[ai] = {
    ...cur,
    ...(maneuverUsed ? { ...pay(cur, maneuverUsed), maneuver: undefined } : {}),
    hidden: false,
    helped: false,
    stance: cur.stance ? { ...cur.stance, active: true } : cur.stance,
    conditions: revealed.length ? cur.conditions!.filter((x) => !x.endsOnAttack) : cur.conditions,
  };
  if (revealed.length) w.log.push(`${attacker.name} is no longer ${revealed.map((c) => c.name.toLowerCase()).join(" or ")}.`);
  if (parried) return true;
  if (!hit) {
    w.log.push(`${attacker.name} attacks ${target.name} with ${spec.name}${notes.length ? ` (${notes.join("; ")})` : ""} but misses${d === 1 ? " (a natural 1)" : ` (${total} against ${ac})`}.`);
    return true;
  }

  // ---- Damage
  let extraWeaponDice = 0;
  if (crit) {
    extraWeaponDice += propertyNumber(spec.properties, "brutal");
    if (spec.type === "melee") extraWeaponDice += Math.max(0, ...(attacker.features ?? []).map((f) => f.critDice ?? 0));
  }
  const attackerUsed = [...(w.combatants[ai].usedTurn ?? [])];
  // A fighting style's minimum roll threshold on weapon dice (a two-handed weapon, a blaster up close)
  const threshold = (attacker.features ?? []).some((f) => f.minRoll && (f.minRoll.weapon === "any" || (f.minRoll.weapon === "twoHanded" && hasProperty(spec.properties, "two-handed")) || (f.minRoll.weapon === "blaster" && spec.type === "ranged" && plan.feet <= 30)));
  let damage = rollDamage(spec.dice, crit, extraWeaponDice, threshold);
  damage = Math.max(1, damage + spec.damageBonus);
  const additions: string[] = [];
  const note = (label: string, amount: number) => additions.push(`${label} +${amount}`);
  // Vicious: the maximum on a weapon die adds its number
  const vicious = propertyNumber(spec.properties, "vicious");
  if (vicious && !spec.statBlock) {
    const size = dieSize(spec.dice);
    if (size && roll(1, size) === size) {
      damage += vicious;
      note("vicious", vicious);
    }
  }
  // Heavy: Strength attacks add half the Strength modifier (minimum 1)
  if (hasProperty(spec.properties, "heavy") && spec.ability === "strength" && attacker.abilities) {
    const half = Math.max(1, Math.floor(Math.floor((attacker.abilities.strength - 10) / 2) / 2));
    damage += half;
    note("heavy", half);
  }
  // A rage's bonus on melee weapon attacks with Strength
  if (attacker.stance?.damage && spec.type === "melee" && spec.ability === "strength") {
    damage += attacker.stance.damage;
    note(attacker.stance.label, attacker.stance.damage);
  }
  // Extra damage the character's features add
  if (attacker.isPlayer || attacker.ally) {
    for (const f of attacker.features ?? []) {
      const e = f.extraDamage;
      if (!e) continue;
      const onceKey = `once:${f.key}`;
      if (e.oncePerTurn && attackerUsed.includes(onceKey)) continue;
      if (f.marks && attacker.marked !== target.id) continue;
      if (e.weapon === "finesse" && !(spec.type === "ranged" || hasProperty(spec.properties, "finesse"))) continue;
      if (e.weapon === "melee" && spec.type !== "melee") continue;
      if (e.needs === "advantage") {
        const flanked = w.combatants.some((c) => c.id !== target.id && c.hp > 0 && onPartySide(c) !== onPartySide(target) && !cannotAct(c) && squaresApart(c, target) <= 1);
        if (!(plan.mode > 0 || (flanked && plan.mode >= 0))) continue;
      }
      if (e.perPoint) {
        const n = Math.min(attacker.empower ?? 0, e.maxDice ?? 99, attacker.powerPoints ?? 0);
        if (n <= 0) continue;
        const sum = rollDamage(`${n}${e.dice.replace(/^\d+/, "")}`, crit);
        damage += sum;
        note(f.name, sum);
        w.combatants[ai] = { ...w.combatants[ai], powerPoints: (w.combatants[ai].powerPoints ?? 0) - n, empower: 0 };
        continue;
      }
      // A cost paid per hit (a die of Kinetic Combat, a force point)
      if (f.cost && f.activation === "free") {
        if (usesLeft(w.combatants[ai], f) <= 0 || !canPay(w.combatants[ai], f)) continue;
        w.combatants[ai] = pay(w.combatants[ai], f);
      }
      const sum = rollDamage(e.dice, crit);
      damage += sum;
      note(f.name, sum);
      if (e.oncePerTurn) attackerUsed.push(onceKey);
    }
  }
  // A stat block's own: a sneak attack, a charge, an attack's extra damage
  if (!attacker.isPlayer) {
    const sneak = (attacker.profile?.traits ?? []).find((t) => t.kind === "sneakAttack" && t.dice);
    if (sneak && !attackerUsed.includes("once:sneak")) {
      const flanked = w.combatants.some((c) => c.id !== target.id && c.hp > 0 && onPartySide(c) !== onPartySide(target) && !cannotAct(c) && squaresApart(c, target) <= 1);
      if (plan.mode > 0 || (flanked && plan.mode >= 0)) {
        const sum = rollDamage(sneak.dice!, crit);
        damage += sum;
        note(sneak.name, sum);
        attackerUsed.push("once:sneak");
      }
    }
    const charge = (attacker.profile?.traits ?? []).find((t) => t.kind === "charge" && t.feet);
    if (charge && (flags.charged ?? 0) >= (charge.feet ?? 0) && !attackerUsed.includes("once:charge")) {
      if (charge.dice) {
        const sum = rollDamage(charge.dice, crit);
        damage += sum;
        note(charge.name, sum);
      }
      attackerUsed.push("once:charge");
      if (charge.save) {
        w.combatants[ai] = { ...w.combatants[ai], usedTurn: attackerUsed };
        // The saving throw is made once the hit lands, below
        spec = { ...spec, save: spec.save ?? charge.save };
      }
    }
  }
  // Prepared damage dice and a dose of poison (the character's)
  if (attacker.isPlayer) {
    if (attacker.boons?.damage && !w.spent.includes("damage")) {
      const die = dieRoll(attacker.boons.damage);
      damage += die;
      note("prepared", die);
      w.spent.push("damage");
    }
    if (attacker.boons?.damageFlat && !w.spent.includes("damage")) {
      damage += attacker.boons.damageFlat;
      note("honed", attacker.boons.damageFlat);
      w.spent.push("damage");
    }
    const poison = attacker.boons?.poison;
    if (poison && !w.spent.includes("poison")) {
      const full = rollDamage(poison.dice, false);
      const saved = rollD20(0) + (target.saves?.constitution ?? 0) >= poison.dc;
      const taken = saved ? Math.floor(full / 2) : full;
      damage += taken;
      note(saved ? "poison (saved)" : "poison", taken);
      w.spent.push("poison");
    }
  }
  // A maneuver applied on a hit: its die in damage, and the saving throw that comes with it
  let maneuverSave: StatSave | undefined;
  if (chosen?.maneuver && chosen.maneuver.timing === "hit" && usesLeft(w.combatants[ai], chosen) > 0) {
    const die = dieRoll(chosen.maneuver.die);
    if (chosen.maneuver.damage) {
      damage += die;
      note(chosen.name, die);
    }
    if (chosen.maneuver.save) maneuverSave = { dc: chosen.maneuver.save.dc, ability: chosen.maneuver.save.ability, conditions: chosen.maneuver.save.conditions.length ? chosen.maneuver.save.conditions : undefined, rounds: 1 };
    w.combatants[ai] = { ...pay(w.combatants[ai], chosen), maneuver: undefined };
    if (!chosen.maneuver.damage && !maneuverSave) note(chosen.name, 0);
  }
  // The attacker's once-a-turn record, and what the attack was (for the bonus actions it opens)
  w.combatants[ai] = {
    ...w.combatants[ai],
    usedTurn: Array.from(new Set([...attackerUsed, ...(flags.viaAction ? ["did:attack"] : []), ...(flags.viaAction && hasProperty(spec.properties, "light") ? ["did:attack-light"] : [])])),
    marked: attacker.features?.some((f) => f.marks) && !attacker.marked ? target.id : w.combatants[ai].marked,
  };
  const hitNote = [notes.join("; "), additions.join(", "), `${plan.feet} ft.`].filter(Boolean).join("; ");
  const bare: Omit<PendingHit, "options"> = {
    attackerId: attacker.id,
    targetId: target.id,
    attackName: spec.name,
    total,
    ac,
    damage,
    damageType: spec.damageType,
    crit,
    melee: spec.type === "melee",
    note: hitNote,
    save: spec.save ?? maneuverSave,
    extra: spec.extra,
  };
  const options = reactionOptions(target, bare);
  if (options.length) {
    w.pending = { ...bare, options };
    return true;
  }
  landHit(w, bare, null);
  return true;
}

// Whether a creature leaving a square provokes the attacks of those whose reach it leaves, and
// what happens: each of them that can uses its reaction on one melee attack (Player's Handbook,
// Opportunity Attacks). Returns false when the mover fell on the way and goes no further.
function provoke(w: Work, mi: number, from: { x: number; y: number; z?: number }, to: { x: number; y: number; z?: number }): boolean {
  const mover = w.combatants[mi];
  if (mover.disengaged || (mover.profile?.traits ?? []).some((t) => t.kind === "flyby")) return true;
  for (let i = 0; i < w.combatants.length; i++) {
    const foe = w.combatants[i];
    if (i === mi || onPartySide(foe) === onPartySide(mover) || !canReact(foe) || foe.hp <= 0) continue;
    const reachSquares = Math.max(1, Math.floor((foe.reach ?? 5) / 5));
    if (squaresApart(foe, from) > reachSquares || squaresApart(foe, to) <= reachSquares) continue;
    // Its melee attack, as it would make one on its turn
    const specs = foe.isPlayer ? [playerSpec(foe, "melee")!] : statSpecs(foe).filter((s) => s.type === "melee");
    const spec = specs.sort((a, b) => b.bonus - a.bonus)[0];
    if (!spec) continue;
    w.combatants[i] = { ...foe, reactions: (foe.reactions ?? 1) - 1 };
    w.log.push(`${mover.name} leaves ${foe.name}'s reach: opportunity attack.`);
    // The mover stands where it was while the blow falls
    makeAttack(w, i, mi, spec, { opportunity: true });
    if (w.combatants[mi].hp <= 0 || !w.inCombat || w.pending) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Moving, turns and the stat blocks' own actions
// ---------------------------------------------------------------------------------------------

// Walks a creature to a square it can reach: each square it leaves the reach of an enemy from
// provokes an opportunity attack, and a creature that falls on the way goes no further.
// Returns the feet it walked (0 when it did not move).
function walk(w: Work, mi: number, x: number, y: number, z = 0): number {
  const mover = w.combatants[mi];
  const map = reachable(w.arena, w.combatants, mover);
  const target = map.get(key(x, y, z));
  if (!mover || !target || !target.cost) return 0;
  const path: Square[] = [];
  for (let k: string | undefined = key(x, y, z); k; k = map.get(k)?.from) path.unshift(parseKey(k));
  let at = path[0];
  let feet = 0;
  for (let i = 1; i < path.length; i++) {
    if (!provoke(w, mi, at, path[i])) {
      w.combatants[mi] = { ...w.combatants[mi], x: at.x, y: at.y, z: at.z ?? 0, moved: (mover.moved ?? 0) + feet };
      return feet;
    }
    // (a ladder or stair costs ten feet a level; the cost of the whole walk is what the map said)
    feet += Math.abs((path[i].z ?? 0) - (at.z ?? 0)) > 0 ? 10 * Math.abs((path[i].z ?? 0) - (at.z ?? 0)) : 5;
    at = path[i];
  }
  w.combatants[mi] = { ...w.combatants[mi], x, y, z, moved: (mover.moved ?? 0) + target.cost };
  w.log.push(`${mover.name} moves ${target.cost} ft.`);
  return target.cost;
}

// Closes with a target until within the given feet, as far as movement goes; true when it got there
function approachTarget(w: Work, mi: number, target: Combatant, withinFeet: number): boolean {
  const mover = w.combatants[mi];
  const end = stepTowards(w.arena, w.combatants, mover, target, withinFeet);
  if (end.cost) walk(w, mi, end.x, end.y, end.z);
  return squaresApart(w.combatants[mi], target) * 5 <= withinFeet;
}

// What a creature has when its turn begins
function beginTurn(w: Work, i: number) {
  const c = w.combatants[i];
  if (!c) return;
  const next: Combatant = {
    ...c,
    moved: 0,
    extraMove: 0,
    actions: 1,
    bonus: 1,
    reactions: c.reactionsPerRound ?? 1,
    attacksLeft: 0,
    attackKind: undefined,
    disengaged: false,
    dodging: false,
    reckless: false,
    guarding: undefined,
    acUntil: 0,
    usedTurn: [],
    queue: undefined,
    turnStart: { x: c.x ?? 0, y: c.y ?? 0 },
  };
  const temp = c.high?.temp && !c.high.low && c.hp > 0 ? rollDamage(c.high.temp, false) : 0;
  if (temp) {
    w.log.push(`${c.name} gains ${temp} temporary hit points.`);
    next.tempHp = Math.max(c.tempHp ?? 0, temp);
  }
  // A stat block's regeneration, and its area actions that recharge
  const regen = (c.profile?.traits ?? []).find((t) => t.kind === "regeneration");
  if (regen?.amount && c.hp > 0 && c.hp < c.maxHp) {
    next.hp = Math.min(c.maxHp, c.hp + regen.amount);
    w.log.push(`${c.name} regains ${next.hp - c.hp} hit points.`);
  }
  if (c.spentSpecials?.length) {
    next.spentSpecials = c.spentSpecials.filter((name) => {
      const special = (c.profile?.specials ?? []).find((s) => s.name === name);
      if (special?.recharge && dieRoll(6) >= special.recharge) {
        w.log.push(`${c.name}'s ${name} recharges.`);
        return false;
      }
      return true;
    });
  }
  w.combatants[i] = next;
}

// Ends the turn of whoever's it is: conditions run down, a high wears off, a rage that nothing has
// fed ends; then the next creature's turn begins (and the round, when everyone has had theirs)
function endTurn(w: Work, current: number): number {
  const ending = w.combatants[current];
  if (ending?.conditions?.length && ending.hp > 0) {
    const kept: ActiveCondition[] = [];
    for (const condition of ending.conditions) {
      if (condition.save && savingThrow({ ...ending, conditions: kept.concat(condition) }, condition.save.ability, condition.save.dc)) {
        w.log.push(`${ending.name} saves and is no longer ${condition.name.toLowerCase()}.`);
      } else if (condition.rounds < LASTING && condition.rounds <= 1) {
        w.log.push(`${ending.name} is no longer ${condition.name.toLowerCase()}.`);
      } else kept.push(condition.rounds < LASTING ? { ...condition, rounds: condition.rounds - 1 } : condition);
    }
    w.combatants[current] = { ...ending, conditions: kept };
  }
  const after = w.combatants[current];
  if (after?.high && after.hp > 0) {
    const rounds = after.high.rounds - 1;
    if (rounds <= 0) w.log.push(`${after.name}'s high from ${after.high.name} ends.`);
    w.combatants[current] = { ...after, high: rounds > 0 ? { ...after.high, rounds } : undefined };
  }
  // A rage lasts a minute, and ends when the turn passes with no attack made and no damage taken
  const raging = w.combatants[current];
  if (raging?.stance) {
    const rounds = raging.stance.rounds - 1;
    if (raging.hp <= 0 || rounds <= 0 || !raging.stance.active) {
      w.log.push(`${raging.name}'s ${raging.stance.label.replace(/ing$/, "e")} ends${rounds > 0 && raging.hp > 0 ? " (nothing fed it this turn)" : ""}.`);
      w.combatants[current] = { ...raging, stance: undefined };
    } else w.combatants[current] = { ...raging, stance: { ...raging.stance, rounds, active: false } };
  }
  w.combatants[current] = { ...w.combatants[current], helped: false, queue: undefined };
  const wrapped = current === w.combatants.length - 1;
  const next = wrapped ? 0 : current + 1;
  if (wrapped) {
    w.round += 1;
    w.log.push(`Round ${w.round} begins!`);
  }
  beginTurn(w, next);
  if (!wrapped) w.log.push(`${w.combatants[next]?.name}'s turn`);
  return next;
}

// An area action or a stat block's special: the creatures in its area save, and take what it deals
function useSpecial(w: Work, ai: number, special: StatSpecial, aim: Combatant) {
  const actor = w.combatants[ai];
  const radius = special.size ?? 10;
  const foes = w.combatants
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.hp > 0 && onPartySide(c) !== onPartySide(actor));
  // A cone or line starts at the user; a sphere or cube is centred on the one aimed at
  const centre = special.shape === "cone" || special.shape === "line" || !special.shape ? actor : aim;
  const reach = special.shape === "cone" || special.shape === "line" ? special.size ?? 30 : Math.max(5, special.shape ? radius : 0);
  const hit = special.shape ? foes.filter(({ c }) => squaresApart(c, centre) * 5 <= reach) : foes.filter(({ c }) => c.id === aim.id);
  const who = hit.length ? hit : foes.filter(({ c }) => c.id === aim.id);
  w.log.push(`${actor.name} uses ${special.name}${who.length > 1 ? ` on ${who.length} creatures` : ""}.`);
  const save: StatSave = { dc: special.dc ?? 10, ability: special.ability ?? "dexterity", damage: special.damage, damageType: special.damageType, half: special.half, conditions: special.conditions, rounds: special.rounds };
  for (const { c } of who) {
    const at = idx(w, c.id);
    if (at >= 0 && w.combatants[at].hp > 0 && w.inCombat) riderSave(w, at, save, actor.id, special.name);
  }
  // Limited uses and recharges
  if (special.recharge || special.perFight) {
    w.combatants[ai] = { ...w.combatants[ai], spentSpecials: [...(w.combatants[ai].spentSpecials ?? []), special.name] };
  }
}

// Whether an area action of a stat block is ready: not recharging, uses left
function specialReady(c: Combatant, special: StatSpecial): boolean {
  const spent = (c.spentSpecials ?? []).filter((n) => n === special.name).length;
  if (special.recharge) return spent === 0;
  if (special.perFight) return spent < special.perFight;
  return true;
}

// One step of a computer-run creature's turn (an enemy's, or a companion's): it picks its target,
// closes in, and makes its attacks one by one, or uses an area action; at the end its turn passes
function aiStep(w: Work, surprise: boolean, aimedAt: number | string | null) {
  const i = w.currentTurn;
  const actor = w.combatants[i];
  const finish = () => {
    w.currentTurn = endTurn(w, i);
  };
  if (!actor) return;
  if (actor.hp <= 0) return finish();
  const held = cannotAct(actor);
  if (held) {
    w.log.push(`${actor.name} is ${held.toLowerCase()} and cannot act.`);
    return finish();
  }
  if (surprise && w.round === 1 && !onPartySide(actor)) {
    w.log.push(`${actor.name} is surprised and cannot act.`);
    return finish();
  }
  const target = pickTarget(w.combatants, actor, onPartySide(actor) ? aimedAt : null);
  if (!target) return finish();
  const specs = statSpecs(actor);
  const ti = idx(w, target.id);
  // An area action, when one is ready and there is somebody to use it on (one turn in two)
  if (actor.queue === undefined) {
    const ready = (actor.profile?.specials ?? []).filter((s) => specialReady(actor, s) && (s.range === undefined || squaresApart(actor, target) * 5 <= s.range + (s.size ?? 0)));
    const usable = ready.filter((s) => (s.shape === "cone" || s.shape === "line" ? squaresApart(actor, target) * 5 <= (s.size ?? 30) : true));
    if (usable.length && (specs.length === 0 || Math.random() < 0.5)) {
      useSpecial(w, i, usable[Math.floor(Math.random() * usable.length)], target);
      w.combatants[i] = { ...w.combatants[i], actions: 0, queue: [] };
      return finish();
    }
    const plan = attackPlanFor(actor, specs);
    w.combatants[i] = { ...actor, queue: plan.map((s) => s.name) };
  }
  const now = w.combatants[i];
  const queue = now.queue ?? [];
  if (!queue.length) return finish();
  let spec = specs.find((s) => s.name === queue[0]) ?? specs[0];
  // A melee attack that cannot be reached is swapped for a ranged one the creature has, if any
  const feet = () => squaresApart(w.combatants[i], target) * 5;
  const inRange = (s: AttackSpec) => (s.type === "melee" ? feet() <= s.reach : feet() <= (s.range?.[1] ?? 320));
  if (!inRange(spec)) {
    const want = spec.type === "melee" ? spec.reach : spec.range?.[0] ?? 80;
    approachTarget(w, i, target, want);
    // Still too far: it spends its action to Dash (Player's Handbook) and runs on
    if (!inRange(spec) && (w.combatants[i].actions ?? 0) > 0 && (w.combatants[i].queue?.length ?? 0) > 0 && !(w.combatants[i].usedTurn ?? []).includes("did:dash")) {
      const cur = w.combatants[i];
      const speed = Math.floor((cur.speed ?? 30) / 5) * 5;
      w.combatants[i] = { ...cur, extraMove: (cur.extraMove ?? 0) + speed, actions: 0, usedTurn: [...(cur.usedTurn ?? []), "did:dash"] };
      w.log.push(`${cur.name} dashes.`);
      approachTarget(w, i, target, want);
      if (!inRange(spec)) {
        w.log.push(`${cur.name} closes in on ${target.name} but cannot reach this turn.`);
        return finish();
      }
      // The dash was its action: no attack this turn
      return finish();
    }
  }
  if (!inRange(spec)) {
    const other = specs.filter((s) => s.type !== spec.type && inRange(s)).sort((a, b) => b.bonus - a.bonus)[0];
    if (other) spec = other;
  }
  if (!inRange(spec)) {
    w.log.push(`${actor.name} closes in on ${target.name} but cannot reach this turn.`);
    return finish();
  }
  const charged = Math.max(0, (w.combatants[i].moved ?? 0));
  const made = makeAttack(w, i, ti, spec, { viaAction: true, charged });
  const after = w.combatants[i];
  w.combatants[i] = { ...after, queue: queue.slice(1) };
  if (!made) return finish();
  if (queue.length <= 1 && !w.pending) return finish();
}

// ---------------------------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------------------------

export type StandardAction = "dash" | "disengage" | "dodge" | "help" | "guard" | "hide";

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
  // The same for the companions, when the fight was left
  allyRemains: { id: number | string; hp: number }[];
  surprise: boolean;
  // The ground the fight is on, and the enemy the player has picked out
  arena: Arena;
  targetId: number | string | null;
  // A piece of the ground picked out for a power to move (its asset id)
  objectId: string | null;
  // Prepared boons and doses of poison that were used up in this fight
  spent: ("attack" | "damage" | "ac" | "poison")[];
  // A hit on the character waiting for them to choose a reaction (or none)
  pending: PendingHit | null;
  // The turn ends by itself when nothing is left to do with it
  autoEnd: boolean;

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
    // Companions fighting on the player's side, with where they stand
    allies?: Omit<Combatant, "isPlayer">[],
  ) => void;
  // The player uses an item that acts on the fight (see ItemEffect); the turn is not ended here
  itemEffect: (effect: ItemEffect) => boolean;
  // Marks a boon or a dose of poison as used
  spend: (what: "attack" | "damage" | "ac" | "poison") => void;
  // The creature whose turn it is walks to a square it can reach
  moveTo: (x: number, y: number, z?: number) => void;
  // It closes with a target until within the given feet, as far as its movement goes; true when it got there
  approach: (targetId: number | string, withinFeet: number) => boolean;
  setTarget: (id: number | string) => void;
  setObject: (id: string | null) => void;
  setAutoEnd: (on: boolean) => void;
  endCombat: () => void;
  nextTurn: () => void;
  rollInitiative: (dexModifier: number) => number;
  // The character attacks: part of the Attack action (melee, ranged), or a bonus action attack
  attack: (kind: "melee" | "ranged" | "unarmed" | "offhand") => void;
  // A standard action of the Player's Handbook, as an action or, where a feature allows, a bonus action
  standard: (what: StandardAction, asBonus?: boolean, allyId?: number | string) => void;
  // A class, archetype or species feature with a use, a cost or an effect
  useFeature: (key: string, targetId?: number | string) => void;
  // Force points set aside for the next hit (Force-Empowered Strikes)
  setEmpower: (points: number) => void;
  // The maneuver (by feature key) to apply to the next attack, or none
  setManeuver: (key: string | null) => void;
  // The character's answer to a reaction offered: an option's key, or null to let the blow land
  resolvePending: (choice: string | null) => void;
  // One step of the turn of whoever is not the character (an enemy, a companion)
  aiStep: () => void;
  // The creature whose turn it is does nothing, and why
  pass: (reason: string) => void;
  // Casts one of the character's powers; a power that moves things is told what to move and which way
  castPower: (index: number, choice?: MotionChoice) => void;
  deathSave: () => void;
}

// The attacks one Attack action makes: the most of Extra Attack, else one
export const attacksPerAction = (c: Combatant): number =>
  Math.max(1, ...(c.features ?? []).map((f) => f.attacksPerAction ?? 1), c.isPlayer ? 1 : c.profile?.multiattack?.length ?? 1);

// What the character can do with a bonus action now
export function bonusFeatures(c: Combatant): CombatFeature[] {
  if (!c.isPlayer || (c.bonus ?? 0) <= 0 || c.hp <= 0) return [];
  return (c.features ?? []).filter((f) => f.activation === "bonus" && !f.bonusAttack && !f.actions && usesLeft(c, f) > 0 && canPay(c, f) && (!f.heal || c.hp < c.maxHp || f.heal.target === "touch"));
}

// Whether the turn has nothing left that the character is likely to do with it
export function turnSpent(c: Combatant): boolean {
  if (!c.isPlayer) return false;
  if ((c.actions ?? 0) > 0 || (c.attacksLeft ?? 0) > 0) return false;
  if ((c.bonus ?? 0) > 0) {
    // Only what the app can do for the character holds the turn open; a feature to be applied by hand does not
    if (bonusAttackKinds(c).length || bonusFeatures(c).some((f) => f.automated)) return false;
    if ((c.features ?? []).some((f) => f.actions?.length)) return false;
  }
  return true;
}

const patchOf = (w: Work): Partial<CombatState> => ({
  arena: w.arena,
  combatants: w.combatants,
  combatLog: w.log,
  inCombat: w.inCombat,
  outcome: w.outcome,
  deathSaves: w.deathSaves,
  pending: w.pending,
  currentTurn: w.currentTurn,
  round: w.round,
  spent: w.spent,
});

const workOf = (s: CombatState): Work => ({
  combatants: [...s.combatants],
  log: [...s.combatLog],
  arena: s.arena,
  round: s.round,
  inCombat: s.inCombat,
  outcome: s.outcome,
  deathSaves: s.deathSaves,
  pending: s.pending,
  turnDone: false,
  spent: [...s.spent],
  currentTurn: s.currentTurn,
});

// ---------------------------------------------------------------------------------------------
// Moving creatures and things with a power (rules.ts powerMotion; shared/logic shoveAsset, and
// bulkOf for what furniture weighs). A creature is moved a square at a time along the line,
// stopping before a wall, furniture or someone else (it strikes them) and dropping off the edge
// of a roof or gantry (1d6 per 10 feet and prone, Player's Handbook "Falling").
// ---------------------------------------------------------------------------------------------

export type MotionChoice = { mode: "away" | "toward" | "at"; objectId?: string };

const middleOf = (a: RoomAsset) => ({ x: a.x + (a.w - 1) / 2, y: a.y + (a.h - 1) / 2 });
const cellsOf = (a: RoomAsset) => Array.from({ length: a.w * a.h }, (_, i) => ({ x: a.x + (i % a.w), y: a.y + Math.floor(i / a.w), z: a.z ?? 0 }));
// Squares from a creature to the nearest square of a piece
export const squaresToAsset = (c: Combatant, a: RoomAsset) => Math.min(...cellsOf(a).map((cell) => squaresApart(c, cell)));
const way = (from: { x?: number; y?: number }, to: { x?: number; y?: number }) => ({ x: (to.x ?? 0) - (from.x ?? 0), y: (to.y ?? 0) - (from.y ?? 0) });

// What a power can do with a piece of the fight's ground: how far it would move it, or why not
export function objectReach(motion: PowerMotion | undefined, asset: RoomAsset | undefined): { feet: number; bulk?: Bulk; why?: string } {
  if (!motion || motion.rider || !motion.objects || !asset) return { feet: 0, why: "it does not move objects" };
  // A building's block on a district's map stays where it is
  const bulk = asset.height ? { size: "Gargantuan" as const, pounds: Infinity, fixed: true } : bulkOf(asset);
  if (bulk.fixed) return { feet: 0, bulk, why: `the ${asset.name.toLowerCase()} is fixed in place` };
  if (motion.maxPounds !== undefined && bulk.pounds > motion.maxPounds) return { feet: 0, bulk, why: `the ${asset.name.toLowerCase()} is too heavy (about ${bulk.pounds.toLocaleString()} lb)` };
  const feet = motionFeet(motion, bulk.size, true);
  return feet ? { feet, bulk } : { feet: 0, bulk, why: `the ${asset.name.toLowerCase()} is too big (${bulk.size.toLowerCase()})` };
}

// Shoves a creature along a line: where it ends up, what it struck, how far it fell
function shoveCreature(w: Work, at: number, dir: { x: number; y: number }, squares: number, soft?: (x: number, y: number) => boolean): { squares: number; struck?: { what: "wall" | "object" | "creature"; name?: string; index?: number }; fell?: number } {
  const c = w.combatants[at];
  const most = Math.max(Math.abs(dir.x), Math.abs(dir.y));
  if (!most || squares <= 0) return { squares: 0 };
  const [ux, uy] = [dir.x / most, dir.y / most];
  const start = { x: c.x ?? 0, y: c.y ?? 0 };
  let [x, y, z] = [start.x, start.y, c.z ?? 0];
  const arena = w.arena;
  const floorAt = (fx: number, fy: number, fz: number) => (fz === 0 ? fx >= 0 && fy >= 0 && fx < arena.width && fy < arena.height : (arena.platforms ?? []).some((p) => p.z === fz && fx >= p.x && fx < p.x + p.width && fy >= p.y && fy < p.y + p.height));
  const blockAt = (fx: number, fy: number, fz: number) => arena.assets.find((a) => a.blocks && !a.side && (a.z ?? 0) === fz && covers(a, fx, fy));
  const whoAt = (fx: number, fy: number, fz: number) => w.combatants.findIndex((o, j) => j !== at && o.hp > 0 && o.x === fx && o.y === fy && (o.z ?? 0) === fz);
  const stopper = (fx: number, fy: number, fz: number): { what: "wall" | "object" | "creature"; name?: string; index?: number } | "soft" | undefined => {
    if (fz === 0 && !floorAt(fx, fy, 0)) return { what: "wall" };
    const block = blockAt(fx, fy, fz);
    if (block) return { what: "object", name: block.name };
    if (soft?.(fx, fy)) return "soft";
    const j = whoAt(fx, fy, fz);
    return j >= 0 ? { what: "creature", name: w.combatants[j].name, index: j } : undefined;
  };
  let moved = 0;
  let struck: ReturnType<typeof shoveCreature>["struck"];
  let fell: number | undefined;
  for (let k = 1; k <= squares; k++) {
    const [nx, ny] = [Math.round(start.x + ux * k), Math.round(start.y + uy * k)];
    if (nx === x && ny === y) continue;
    const hit = (nx !== x && ny !== y ? stopper(nx, y, z) ?? stopper(x, ny, z) : undefined) ?? stopper(nx, ny, z);
    if (hit) {
      if (hit !== "soft") struck = hit;
      break;
    }
    if (z > 0 && !floorAt(nx, ny, z)) {
      // Over the edge: down to the highest floor below, if there is room to land
      const below = [...new Set((arena.platforms ?? []).map((p) => p.z))].filter((lz) => lz < z).sort((a, b) => b - a).find((lz) => floorAt(nx, ny, lz)) ?? 0;
      const landing = stopper(nx, ny, below);
      if (landing) {
        if (landing !== "soft") struck = landing;
        break;
      }
      fell = z - below;
      [x, y, z] = [nx, ny, below];
      moved++;
      break;
    }
    [x, y] = [nx, ny];
    moved++;
  }
  w.combatants[at] = { ...c, x, y, z };
  return { squares: moved, struck, fell };
}

// A fall of so many levels (10 feet each): 1d6 bludgeoning per 10 feet, and prone
function fall(w: Work, at: number, levels: number): string {
  const amount = damageCreature(w, at, rollDamage(`${levels}d6`, false), "bludgeoning");
  if (w.combatants[at].hp > 0) w.combatants[at] = withConditions(w.combatants[at], [{ name: "Prone", rounds: 1, source: "a fall" }]);
  return `falls ${levels * 10} feet and takes ${amount} damage${w.combatants[at].hp > 0 ? ", landing prone" : ""}`;
}

// What happens when a moved creature or object strikes someone at the end of its move: both
// take the power's damage, unless the one moved keeps its footing (its save; an object always
// fails it) or the one struck dodges half of it (its save)
function strike(w: Work, motion: PowerMotion, dc: number, mover: number | null, struck: number | null): string {
  const s = motion.strike;
  if (!s || (mover === null && struck === null)) return "";
  if (s.save && s.who === "mover" && mover !== null && savingThrow(w.combatants[mover], s.save, dc)) return `, but ${w.combatants[mover].name} rolls with it (${s.save.slice(0, 3).toUpperCase()} save)`;
  const amount = rollDamage(s.dice, false);
  const parts: string[] = [];
  if (struck !== null) {
    const saved = !!(s.save && s.who === "struck" && savingThrow(w.combatants[struck], s.save, dc));
    const taken = damageCreature(w, struck, saved && s.half ? Math.floor(amount / 2) : amount, s.type);
    parts.push(`${w.combatants[struck].name} takes ${taken} ${s.type} damage${saved ? " (half on a save)" : ""}`);
  }
  if (mover !== null) parts.push(`${w.combatants[mover].name} takes ${damageCreature(w, mover, amount, s.type)}`);
  return `: ${parts.join(" and ")}`;
}

// The pieces an area power sweeps aside (Force Repulse, Force Current): those no bigger than it
// moves, within its reach of the caster, pushed straight away from them
function sweepObjects(w: Work, caster: Combatant, motion: PowerMotion): string[] {
  const area = motion.area;
  if (!area) return [];
  const lines: string[] = [];
  for (const asset of w.arena.assets.filter((a) => a.kind === "furniture" && !a.side && !a.height)) {
    const bulk = bulkOf(asset);
    if (bulk.fixed || sizeRank(bulk.size) > sizeRank(area.size) || squaresToAsset(caster, asset) * 5 > area.reach) continue;
    const res = shoveAsset({ ...w.arena, open: !!(w.arena.open || w.arena.district) }, asset.id, way(caster, middleOf(asset)), Math.floor(area.feet / 5), {
      creatureAt: (x, y, z) => {
        const c = w.combatants.find((o) => o.hp > 0 && o.x === x && o.y === y && (o.z ?? 0) === z);
        return c ? { id: String(c.id), name: c.name } : undefined;
      },
    });
    if (!res.squares) continue;
    w.arena = { ...w.arena, assets: w.arena.assets.map((a) => (a.id === asset.id ? { ...a, x: res.x, y: res.y, z: res.z || undefined } : a)) };
    lines.push(`The ${asset.name.toLowerCase()} is swept ${res.squares * 5} feet aside.`);
  }
  return lines;
}

// When the character's action leaves nothing worth doing, the turn passes
function settle(w: Work, autoEnd: boolean) {
  if (!w.inCombat || w.pending) return;
  const me = w.combatants[w.currentTurn];
  if (autoEnd && me?.isPlayer && me.hp > 0 && turnSpent(me)) w.currentTurn = endTurn(w, w.currentTurn);
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
  allyRemains: [],
  pending: null,
  autoEnd: true,

  surprise: false,
  arena: { width: 10, height: 7, assets: [] },
  targetId: null,

  setAutoEnd: (on) => set({ autoEnd: on }),

  moveTo: (x, y, z = 0) =>
    set((state) => {
      if (state.pending) return state;
      const w = workOf(state);
      const moved = walk(w, state.currentTurn, x, y, z);
      if (!moved && w.log.length === state.combatLog.length) return state;
      return patchOf(w);
    }),

  approach: (targetId, withinFeet) => {
    const state = get();
    const target = state.combatants.find((c) => c.id === targetId);
    if (!target || state.pending) return false;
    const w = workOf(state);
    const got = approachTarget(w, state.currentTurn, target, withinFeet);
    set(patchOf(w));
    return got;
  },

  setTarget: (id) => set({ targetId: id }),

  objectId: null,
  setObject: (id) => set({ objectId: id }),

  spent: [],

  spend: (what) => set((state) => ({ spent: state.spent.includes(what) ? state.spent : [...state.spent, what] })),

  initiateCombat: (player, enemies, weapons, surprise = false, arena = { width: 10, height: 7, assets: [] }, playerAt, allies = []) => {
    // Calculate initiatives
    const dexModifier = Math.floor((player.abilityScores.dexterity - 10) / 2);
    const advantage = (weapons?.features ?? []).some((f) => f.initiativeAdvantage);
    const playerInitiative = Math.max(roll(1, 20), advantage ? roll(1, 20) : 0) + dexModifier;

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
      taken.add(key(spot.x, spot.y, spot.z ?? 0));
      return { ...c, ...spot, z: spot.z ?? 0, moved: 0 };
    };
    const middle = Math.floor(arena.height / 2);
    const placedPlayer = stand(playerCombatant, playerAt ?? { x: 0, y: middle });

    // Companions stand close by the player, and roll for themselves
    const allyCombatants = allies.map((ally) =>
      stand({ ...ally, ally: true, isPlayer: false, initiative: roll(1, 20) + (ally.saves?.dexterity ?? 0) }, ally.x !== undefined && ally.y !== undefined ? { x: ally.x, y: ally.y, z: ally.z } : { x: placedPlayer.x ?? 0, y: placedPlayer.y ?? 0, z: placedPlayer.z }),
    );

    // Add initiative to enemies: a die and the stat block's Dexterity modifier
    const enemyCombatants = enemies.map((enemy) => stand({
      ...enemy,
      initiative: roll(1, 20) + (enemy.saves?.dexterity ?? 1),
      isPlayer: false,
    }, enemy.x !== undefined && enemy.y !== undefined ? { x: enemy.x, y: enemy.y, z: enemy.z } : { x: arena.width - 1, y: middle }));

    // Combine and sort by initiative
    const allCombatants = [placedPlayer, ...allyCombatants, ...enemyCombatants].sort(
      (a, b) => b.initiative - a.initiative,
    ).map((c) => ({
      ...c,
      actions: 1,
      bonus: 1,
      reactions: 1,
      attacksLeft: 0,
      usedTurn: [] as string[],
      resistanceLeft: (c.profile?.traits ?? []).find((t) => t.kind === "legendaryResistance")?.amount,
    }));
    const w: Work = {
      combatants: allCombatants,
      log: [surprise ? "You strike first: the enemy is surprised." : "Combat initiated! Roll for initiative!"],
      arena,
      round: 1,
      inCombat: true,
      outcome: null,
      deathSaves: { successes: 0, failures: 0 },
      pending: null,
      turnDone: false,
      spent: [],
      currentTurn: 0,
    };
    beginTurn(w, 0);
    set({
      ...patchOf(w),
      surprise,
      arena,
      targetId: null,
      objectId: null,
      remains: [],
    });
  },

  endCombat: () => {
    set((state) => ({
      remains: state.combatants.filter((c) => !onPartySide(c)).map((c) => ({ id: c.id, hp: c.hp })),
      allyRemains: state.combatants.filter((c) => c.ally).map((c) => ({ id: c.id, hp: c.hp })),
      inCombat: false,
      combatants: [],
      currentTurn: 0,
      round: 1,
      combatLog: [],
      outcome: "left",
      pending: null,
    }));
  },

  nextTurn: () =>
    set((state) => {
      if (!state.inCombat || state.pending) return state;
      const w = workOf(state);
      w.currentTurn = endTurn(w, state.currentTurn);
      return patchOf(w);
    }),

  pass: (reason) => {
    set((state) => ({ combatLog: [...state.combatLog, `${state.combatants[state.currentTurn]?.name} ${reason}.`] }));
    get().nextTurn();
  },

  rollInitiative: (dexModifier) => {
    const result = roll(1, 20) + dexModifier;
    return result;
  },

  attack: (kind) =>
    set((state) => {
      if (!state.inCombat || state.pending) return state;
      const w = workOf(state);
      const mi = state.currentTurn;
      const me = w.combatants[mi];
      if (!me?.isPlayer || me.hp <= 0 || cannotAct(me)) return state;
      const spec = playerSpec(me, kind);
      const foe = pickTarget(w.combatants, me, state.targetId);
      if (!spec || !foe) return state;
      const viaAction = kind === "melee" || kind === "ranged";
      if (viaAction && (me.attacksLeft ?? 0) <= 0 && (me.actions ?? 0) <= 0) {
        w.log.push("No action left this turn.");
        return patchOf(w);
      }
      if (!viaAction && !bonusAttackKinds(me).some((o) => o.kind === kind)) return state;
      const before = w.log.length;
      const made = makeAttack(w, mi, idx(w, foe.id), spec, { viaAction });
      if (!made) return { ...patchOf(w), combatLog: w.log.length === before ? [...w.log, "That attack cannot be made from here."] : w.log };
      const cur = w.combatants[mi];
      if (viaAction) {
        const fresh = (me.attacksLeft ?? 0) <= 0;
        w.combatants[mi] = { ...cur, actions: fresh ? (cur.actions ?? 1) - 1 : cur.actions, attacksLeft: (fresh ? attacksPerAction(me) : me.attacksLeft ?? 0) - 1, attackKind: spec.type };
      } else {
        w.combatants[mi] = { ...cur, bonus: (cur.bonus ?? 1) - 1 };
      }
      settle(w, state.autoEnd);
      return patchOf(w);
    }),

  standard: (what, asBonus = false, allyId) =>
    set((state) => {
      if (!state.inCombat || state.pending) return state;
      const w = workOf(state);
      const mi = state.currentTurn;
      const me = w.combatants[mi];
      if (!me || me.hp <= 0 || cannotAct(me)) return state;
      const capital = what.charAt(0).toUpperCase() + what.slice(1);
      if (asBonus) {
        if ((me.bonus ?? 0) <= 0 || !(me.features ?? []).some((f) => f.actions?.includes(capital))) return state;
      } else if ((me.actions ?? 0) <= 0 && (me.attacksLeft ?? 0) <= 0) {
        w.log.push("No action left this turn.");
        return patchOf(w);
      }
      let next: Combatant = { ...me, usedTurn: [...(me.usedTurn ?? []), `did:${what}`] };
      if (asBonus) next.bonus = (me.bonus ?? 1) - 1;
      else next = { ...next, actions: (me.actions ?? 1) - 1, attacksLeft: 0 };
      const speed = Math.floor(((me.speed ?? 30) * Math.min(1, ...(me.conditions ?? []).map((x) => conditionMechanics(x.name).speed))) / 5) * 5;
      if (what === "dash") {
        next.extraMove = (me.extraMove ?? 0) + speed;
        w.log.push(`${me.name} dashes: ${speed} ft. more movement this turn.`);
      } else if (what === "disengage") {
        next.disengaged = true;
        w.log.push(`${me.name} disengages: movement this turn provokes no opportunity attacks.`);
      } else if (what === "dodge") {
        next.dodging = true;
        w.log.push(`${me.name} dodges: attacks against them have disadvantage until their next turn.`);
      } else if (what === "hide") {
        const sight = Math.max(0, ...w.combatants.filter((c) => c.hp > 0 && onPartySide(c) !== onPartySide(me)).map((c) => 10 + (c.saves?.wisdom ?? 0)));
        const d = rollD20(0);
        const total = d + (me.stealth ?? Math.floor(((me.abilities?.dexterity ?? 10) - 10) / 2));
        next.hidden = total >= sight;
        w.log.push(`${me.name} tries to hide: Stealth ${total} against ${sight}${next.hidden ? ", unseen: the next attack has advantage and attacks against them have disadvantage" : ", seen"}.`);
      } else if (what === "help" || what === "guard") {
        const friend = w.combatants.find((c) => c.id === allyId) ?? w.combatants.find((c) => c.id !== me.id && onPartySide(c) && c.hp > 0);
        if (!friend) {
          w.log.push("There is nobody to " + what + ".");
          return patchOf(w);
        }
        if (what === "help") {
          const fi = idx(w, friend.id);
          w.combatants[fi] = { ...w.combatants[fi], helped: true };
          w.log.push(`${me.name} helps ${friend.name}: their next attack has advantage.`);
        } else {
          next.guarding = friend.id;
          w.log.push(`${me.name} guards ${friend.name}: attacks against them have disadvantage while they are within 5 feet.`);
        }
      }
      w.combatants[mi] = next;
      settle(w, state.autoEnd);
      return patchOf(w);
    }),

  setEmpower: (points) =>
    set((state) => ({
      combatants: state.combatants.map((c) => (c.isPlayer ? { ...c, empower: Math.max(0, Math.min(points, c.powerPoints ?? 0)) } : c)),
    })),

  setManeuver: (maneuverKey) =>
    set((state) => ({
      combatants: state.combatants.map((c) => (c.isPlayer ? { ...c, maneuver: maneuverKey ?? undefined } : c)),
    })),

  useFeature: (featureKey, targetId) =>
    set((state) => {
      if (!state.inCombat || state.pending) return state;
      const w = workOf(state);
      const mi = state.currentTurn;
      const me = w.combatants[mi];
      const f = (me?.features ?? []).find((x) => x.key === featureKey);
      if (!me || !f || me.hp <= 0) return state;
      if (cannotAct(me) && f.activation !== "reaction") return state;
      // A maneuver for the attack roll or a hit is chosen now and spent when the attack is made
      if (f.maneuver && f.maneuver.timing !== "use") {
        w.combatants[mi] = { ...me, maneuver: me.maneuver === f.key ? undefined : f.key };
        return patchOf(w);
      }
      // A state already entered is ended for nothing
      if (f.stance && me.stance) {
        w.combatants[mi] = { ...me, stance: undefined };
        w.log.push(`${me.name} ends their ${f.stance.label.replace(/ing$/, "e")}.`);
        return patchOf(w);
      }
      if (usesLeft(me, f) <= 0) {
        w.log.push(`${f.name}: no uses left before a rest.`);
        return patchOf(w);
      }
      if (!canPay(me, f)) {
        w.log.push(`${f.name}: not enough ${f.cost?.pool === "focus" ? "focus" : "power"} points.`);
        return patchOf(w);
      }
      const needs = f.activation;
      if (needs === "action" && (me.actions ?? 0) <= 0) {
        w.log.push(`${f.name}: no action left.`);
        return patchOf(w);
      }
      if (needs === "bonus" && (me.bonus ?? 0) <= 0) {
        w.log.push(`${f.name}: no bonus action left.`);
        return patchOf(w);
      }
      let user: Combatant = pay(me, f);
      const spendEconomy = (c: Combatant): Combatant =>
        needs === "action" ? { ...c, actions: (c.actions ?? 1) - 1, attacksLeft: 0 } : needs === "bonus" ? { ...c, bonus: (c.bonus ?? 1) - 1 } : c;
      // A state entered at will (a rage), or left again
      if (f.stance) {
        user = spendEconomy({ ...user, stance: { label: f.stance.label, rounds: 10, damage: f.stance.damage, resist: f.stance.resist, active: true } });
        w.log.push(`${me.name} enters a ${f.stance.label.replace(/ing$/, "e")}${f.stance.damage ? ` (+${f.stance.damage} damage with Strength melee attacks)` : ""}${f.stance.resist.length ? `, resisting ${f.stance.resist.join(" and ")} damage` : ""}.`);
      } else if (f.heal) {
        const who = f.heal.target === "touch" ? w.combatants.find((c) => c.id === targetId) ?? me : me;
        const amount = Math.max(1, rollAmount(f.heal.amount));
        const wi = idx(w, who.id);
        if (who.id === me.id) user = { ...user, hp: Math.min(me.maxHp, me.hp + amount) };
        else w.combatants[wi] = { ...w.combatants[wi], hp: Math.min(who.maxHp, who.hp + amount) };
        user = spendEconomy(user);
        w.log.push(`${me.name} uses ${f.name}: ${who.id === me.id ? "regains" : `${who.name} regains`} ${amount} hit points.`);
      } else if (f.maneuver?.heal) {
        // A maneuver that heals or shields: the superiority die and the maneuver's modifier
        const who = w.combatants.find((c) => c.id === targetId) ?? me;
        const amount = Math.max(1, dieRoll(f.maneuver.die) + f.maneuver.modifier);
        const wi = idx(w, who.id);
        const apply = (c: Combatant): Combatant => (f.maneuver!.heal === "temp" ? { ...c, tempHp: Math.max(c.tempHp ?? 0, amount) } : { ...c, hp: Math.min(c.maxHp, c.hp + amount) });
        if (who.id === me.id) user = apply(user);
        else w.combatants[wi] = apply(w.combatants[wi]);
        user = spendEconomy(user);
        w.log.push(`${me.name} uses ${f.name}: ${who.id === me.id ? "gains" : `${who.name} gains`} ${amount} ${f.maneuver.heal === "temp" ? "temporary hit points" : "hit points"}.`);
      } else if (f.extraAction) {
        user = { ...user, actions: (user.actions ?? 0) + 1 };
        w.log.push(`${me.name} uses ${f.name}: one more action this turn.`);
      } else if (f.reckless) {
        user = { ...user, reckless: true };
        w.log.push(`${me.name} attacks recklessly: advantage on melee attacks this turn, and attacks against them have advantage until their next turn.`);
      } else if (f.save) {
        const foe = pickTarget(w.combatants, me, targetId ?? state.targetId);
        if (!foe || squaresApart(me, foe) * 5 > f.save.range) {
          w.log.push(`${f.name}: no enemy within ${f.save.range} ft.`);
          return patchOf(w);
        }
        user = spendEconomy(user);
        w.combatants[mi] = user;
        w.log.push(`${me.name} uses ${f.name} on ${foe.name}.`);
        const damage = rollAmount(f.save.damage);
        riderSave(w, idx(w, foe.id), { dc: f.save.dc, ability: f.save.ability, damage: `${damage}`, damageType: f.save.type, half: true }, me.id, f.name);
        settle(w, state.autoEnd);
        return patchOf(w);
      } else {
        // Everything else: its use is spent, and what it says is for the player to apply
        user = spendEconomy(user);
        const dice = f.rolls.map((d) => `${d}: ${rollDamage(d, false)}`);
        w.log.push(`${me.name} uses ${f.name}${dice.length ? ` (rolled ${dice.join(", ")})` : ""}: ${f.text.replace(/\s+/g, " ").slice(0, 160)}${f.text.length > 160 ? "…" : ""}`);
      }
      w.combatants[mi] = user;
      settle(w, state.autoEnd);
      return patchOf(w);
    }),

  resolvePending: (choice) =>
    set((state) => {
      const p = state.pending;
      if (!p) return state;
      const w = workOf(state);
      w.pending = null;
      const picked = p.options.find((o) => o.key === choice) ?? null;
      const { options: _options, ...hit } = p;
      landHit(w, hit, picked);
      settle(w, state.autoEnd);
      return patchOf(w);
    }),

  aiStep: () =>
    set((state) => {
      if (!state.inCombat || state.pending) return state;
      const actor = state.combatants[state.currentTurn];
      if (!actor || actor.isPlayer) return state;
      const w = workOf(state);
      aiStep(w, state.surprise, state.targetId);
      return patchOf(w);
    }),

  // The player uses an item in the fight. False when it cannot be used as asked (the target is out of throwing range).
  itemEffect: (effect) => {
    const state = get();
    const user = state.combatants[state.currentTurn];
    if (!user?.isPlayer) return false;
    // Using an object takes the action (Player's Handbook, Use an Object)
    if ((user.actions ?? 0) <= 0 && (user.attacksLeft ?? 0) <= 0) {
      set({ combatLog: [...state.combatLog, "No action left this turn."] });
      return false;
    }
    const log = [...state.combatLog];
    let combatants = [...state.combatants];
    const at = combatants.findIndex((c) => c.id === (effect as any).targetId);
    const commit = (extra: Partial<CombatState> = {}) => {
      const ui = combatants.findIndex((c) => c.isPlayer);
      combatants[ui] = { ...combatants[ui], actions: (combatants[ui].actions ?? 1) - 1, attacksLeft: 0 };
      const w = workOf({ ...get(), combatants, combatLog: log, ...extra } as CombatState);
      settle(w, state.autoEnd);
      set({ ...patchOf(w), ...extra });
    };
    if (effect.kind === "heal") {
      if (at < 0) return false;
      const target = combatants[at];
      combatants[at] = { ...target, hp: Math.min(target.maxHp, target.hp + effect.amount) };
      log.push(`${user.name} uses ${effect.label} on ${target.name}: ${effect.amount} hit points${target.hp <= 0 ? ", back on their feet" : ""}.`);
    } else if (effect.kind === "stabilize") {
      if (at < 0) return false;
      const target = combatants[at];
      combatants[at] = { ...target, hp: Math.max(target.hp, effect.to) };
      log.push(`${user.name} uses ${effect.label} on ${target.name}, who is stable again.`);
    } else if (effect.kind === "explosive") {
      if (at < 0) return false;
      const centre = combatants[at];
      if (squaresApart(user, centre) * 5 > effect.maxFeet) {
        log.push(`${centre.name} is ${squaresApart(user, centre) * 5} ft. away, beyond the ${effect.maxFeet} ft. a throw reaches.`);
        set({ combatLog: log });
        return false;
      }
      log.push(`${user.name} throws ${effect.label} at ${centre.name}.`);
      combatants = combatants.map((c) => {
        if (c.hp <= 0 || squaresApart(c, centre) * 5 > effect.radius) return c;
        const saved = savingThrow(c, effect.save, effect.dc);
        const full = effect.damage.reduce((sum, d) => sum + rollDamage(d.dice, false), 0);
        const amount = saved ? Math.floor(full / 2) : full;
        let next = amount > 0 ? hurt(c, amount) : c;
        const afflicted = !saved && effect.conditions.length > 0 && next.hp > 0;
        if (afflicted) next = withConditions(next, effect.conditions.map((name) => ({ name, rounds: effect.conditionRounds, save: { ability: effect.save, dc: effect.dc }, by: user.id, source: effect.label })));
        log.push(`${c.name} ${saved ? "saves" : "fails the save"}${amount > 0 ? ` and takes ${amount} damage` : ""}${afflicted ? `, and is ${effect.conditions.join(" and ").toLowerCase()}` : ""}${next.hp <= 0 && c.hp > 0 ? ` (${c.isPlayer ? "down" : "defeated"})` : ""}.`);
        return next;
      });
      const won = !combatants.some((c) => !onPartySide(c) && c.hp > 0);
      if (won) log.push("Victory! All enemies defeated.");
      commit(won ? { inCombat: false, outcome: "victory" as CombatOutcome } : {});
      return true;
    } else if (effect.kind === "substance") {
      combatants = combatants.map((c) => (c.id === user.id ? { ...c, high: { name: effect.label, ability: effect.ability, rounds: effect.rounds, temp: effect.temp } } : c));
      log.push(`${user.name} takes ${effect.label}: a high for ${effect.rounds} turns.`);
    } else if (effect.kind === "poison") {
      combatants = combatants.map((c) => (c.id === user.id ? { ...c, boons: { ...c.boons, poison: { dice: effect.dice, dc: effect.dc } } } : c));
      log.push(`${user.name} coats their weapon with ${effect.label}.`);
    }
    commit();
    return true;
  },

  // Cast one of the player's powers at the first standing enemy (or on themselves, to heal or hide).
  // Casting is an action, or a bonus action for the powers whose casting time says so. A power
  // that moves things moves the enemy picked out or, when one is given, a piece of the ground:
  // away from the caster, towards them, or (a piece) at the enemy picked out.
  castPower: (index, choice) =>
    set((state) => {
      const caster = state.combatants[state.currentTurn];
      const power = caster?.powers?.[index];
      if (!caster?.isPlayer || !power || (caster.powerPoints ?? 0) < power.cost) return state;
      const bonusCast = power.castTime === "bonus";
      if (bonusCast ? (caster.bonus ?? 0) <= 0 : (caster.actions ?? 0) <= 0 && (caster.attacksLeft ?? 0) <= 0) {
        return { ...state, combatLog: [...state.combatLog, `${power.name}: no ${bonusCast ? "bonus " : ""}action left this turn.`] };
      }
      const motion = power.motion;
      const objectId = choice ? choice.objectId : state.objectId;
      const picked = motion && !motion.rider && motion.objects && objectId ? state.arena.assets.find((a) => a.id === objectId) : undefined;
      if (picked ? squaresToAsset(caster, picked) * 5 > Math.max(5, power.range ?? 1000) : powerOutOfRange(state.combatants, caster, power, state.targetId)) {
        return picked ? { ...state, combatLog: [...state.combatLog, `${power.name}: the ${picked.name.toLowerCase()} is out of range.`] } : state;
      }
      const log = [...state.combatLog];
      const combatants = state.combatants.map((c) => {
        // A new concentration power ends the one before it; casting gives a hidden caster away
        const dropped = (c.conditions ?? []).filter((x) => (power.concentration && x.concentration && x.by === caster.id) || (c.id === caster.id && x.endsOnAttack));
        if (dropped.length) log.push(`${c.name} is no longer ${dropped.map((x) => x.name.toLowerCase()).join(" or ")}.`);
        const conditions = dropped.length ? c.conditions!.filter((x) => !dropped.includes(x)) : c.conditions;
        return c.id === caster.id
          ? {
              ...c,
              conditions,
              powerPoints: (c.powerPoints ?? 0) - power.cost,
              hidden: false,
              ...(bonusCast ? { bonus: (c.bonus ?? 1) - 1 } : { actions: (c.actions ?? 1) - 1, attacksLeft: 0 }),
              usedTurn: [...(c.usedTurn ?? []), "did:cast"],
            }
          : dropped.length ? { ...c, conditions } : c;
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
      // Whom the power's own save or hit leaves to be pushed or pulled (Force Repulse, Wire Line)
      let pushed: number | null = null;
      if (motion && !motion.rider && (picked || motion.creatures)) {
        const w = workOf({ ...state, combatants, combatLog: log } as CombatState);
        const me = idx(w, caster.id);
        const mode = choice?.mode ?? "away";
        const meNow = w.combatants[me];
        const creatureAt = (x: number, y: number, z: number) => {
          const c = w.combatants.find((o) => o.hp > 0 && o.x === x && o.y === y && (o.z ?? 0) === z);
          return c ? { id: String(c.id), name: c.name } : undefined;
        };
        const mine = mode === "toward" ? (x: number, y: number) => x === meNow.x && y === meNow.y : undefined;
        if (picked) {
          const reach = objectReach(motion, picked);
          if (!reach.feet) w.log.push(`${caster.name} casts ${power.name}, but ${reach.why}.`);
          else {
            const target = mode === "at" ? pickTarget(w.combatants, meNow, state.targetId) : undefined;
            const from = middleOf(picked);
            const dir = mode === "at" && target ? way(from, target) : mode === "toward" ? way(from, meNow) : way(meNow, from);
            const res = shoveAsset({ ...w.arena, open: !!(w.arena.open || w.arena.district) }, picked.id, dir, Math.floor(reach.feet / 5), { creatureAt, soft: mine });
            w.arena = { ...w.arena, assets: w.arena.assets.map((a) => (a.id === picked.id ? { ...a, x: res.x, y: res.y, z: res.z || undefined } : a)) };
            let line = `${caster.name} casts ${power.name}: the ${picked.name.toLowerCase()} (${reach.bulk!.size.toLowerCase()}) ${res.squares ? `${mode === "at" ? "flies" : mode === "toward" ? "slides" : "is shoved"} ${res.squares * 5} feet${mode === "at" && target ? ` at ${target.name}` : mode === "toward" ? ` towards ${caster.name}` : ""}` : "does not move"}`;
            if (res.struck?.what === "creature") {
              const struck = w.combatants.findIndex((c) => String(c.id) === res.struck!.id);
              line += ` and strikes ${res.struck.name}${strike(w, motion, power.dc, null, struck >= 0 ? struck : null)}`;
            } else if (res.struck) line += res.struck.what === "wall" ? " and hits the wall" : ` and crashes into the ${(res.struck.name ?? "").toLowerCase()}`;
            if (res.blocked) line += " (it will not go where it would block the way)";
            if (res.fell) line += ` and drops ${res.fell * 10} feet`;
            w.log.push(`${line}.`);
          }
        } else {
          const ti = w.combatants.indexOf(pickTarget(w.combatants, meNow, state.targetId)!);
          if (ti < 0) return state;
          const t = w.combatants[ti];
          const feet = motionFeet(motion, t.size ?? "Medium", false);
          if (!feet) w.log.push(`${caster.name} casts ${power.name}, but ${t.name} is too large to move.`);
          else if (motion.save && savingThrow(t, motion.save, power.dc)) w.log.push(`${caster.name} casts ${power.name}: ${t.name} resists (${motion.save.slice(0, 3).toUpperCase()} save, DC ${power.dc}).`);
          else {
            const res = shoveCreature(w, ti, mode === "toward" ? way(t, meNow) : way(meNow, t), Math.floor(feet / 5), mine);
            let line = `${caster.name} casts ${power.name}: ${t.name} ${res.squares ? `is ${mode === "toward" ? "pulled" : "thrown"} ${res.squares * 5} feet` : "does not budge"}`;
            if (res.struck) line += ` and strikes ${res.struck.what === "creature" ? res.struck.name : res.struck.what === "object" ? `the ${(res.struck.name ?? "").toLowerCase()}` : "a wall"}${strike(w, motion, power.dc, ti, res.struck.index ?? null)}`;
            if (res.fell) line += `, goes over the edge and ${fall(w, ti, res.fell)}`;
            w.log.push(`${line}.`);
            if (power.conditions?.length && w.combatants[ti].hp > 0) {
              w.combatants[ti] = withConditions(w.combatants[ti], power.conditions.map((name) => ({ name, rounds: power.conditionRounds ?? 1, by: caster.id, source: power.name, concentration: power.concentration })));
              w.log.push(`${t.name} is ${power.conditions.join(" and ").toLowerCase()} ${lasts(power.conditionRounds ?? 1)}.`);
            }
          }
        }
        settle(w, state.autoEnd);
        return { ...state, ...patchOf(w), objectId: null };
      }
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
          if (d !== 1 && (d === 20 || d + power.attack >= armorClassNow(target) + odds.cover.bonus)) {
            const amount = rollDamage(power.dice!, d === 20);
            log.push(`${caster.name} casts ${power.name} at ${target.name}${note} and hits for ${amount} damage${d === 20 ? " (critical)" : ""}.`);
            hit(targetIndex, amount);
            pushed = targetIndex;
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
          if (!saved) pushed = targetIndex;
          const landed = saved ? "" : afflict(targetIndex);
          if (landed) log.push(`${target.name} is ${landed}.`);
        }
      } else {
        log.push(`${caster.name} casts ${power.name}. Its effect is described in its text.`);
      }
      const won = !combatants.some((c) => !onPartySide(c) && c.hp > 0);
      if (won) log.push("Victory! All enemies defeated.");
      const w = workOf({ ...state, combatants, combatLog: log, inCombat: won ? false : state.inCombat, outcome: won ? ("victory" as CombatOutcome) : state.outcome } as CombatState);
      // A push or pull that comes with the hit or the failed save, and the pieces an area power sweeps aside
      if (motion?.rider && pushed !== null && w.combatants[pushed]?.hp > 0) {
        const t = w.combatants[pushed];
        const feet = motionFeet(motion, t.size ?? "Medium", false);
        const meNow = w.combatants[idx(w, caster.id)];
        const toward = motion.way === "toward" || choice?.mode === "toward";
        if (feet) {
          const res = shoveCreature(w, pushed, toward ? way(t, meNow) : way(meNow, t), Math.floor(feet / 5), toward ? (x, y) => x === meNow.x && y === meNow.y : undefined);
          if (res.squares || res.fell) w.log.push(`${t.name} is ${toward ? "pulled" : "pushed"} ${res.squares * 5} feet${res.struck ? ` up against ${res.struck.what === "creature" ? res.struck.name : res.struck.what === "object" ? `the ${(res.struck.name ?? "").toLowerCase()}` : "a wall"}` : ""}${res.fell ? `, goes over the edge and ${fall(w, pushed, res.fell)}` : ""}.`);
        }
      }
      if (motion?.area) for (const line of sweepObjects(w, w.combatants[idx(w, caster.id)], motion)) w.log.push(line);
      settle(w, state.autoEnd);
      return { ...state, ...patchOf(w) };
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
}));

// ---------------------------------------------------------------------------------------------
// A fight between starships (shared/logic "Starship combat"): the store keeps the fight and what
// came into it (which world ship each is), and runs the engine's rules with the real dice.
// ---------------------------------------------------------------------------------------------

interface ShipFightState {
  fight: ShipFightData | null;
  // The party's ship in the campaign's list, and the world ship behind each of the enemy's
  partyShipId: string | null;
  foeRefs: Record<string, string>;
  // The area the fight is in
  areaId: string | null;
  targetId: string | null;
  // Whether the helm's crewmember or a gunner at the guns makes the attacks
  start: (party: { id: string; ref: string; sheet: ShipSheetData; crew: number; gunners?: number; hull?: number }, foes: { id: string; ref: string; sheet: ShipSheetData; hull?: number }[], areaId: string) => void;
  setTarget: (id: string) => void;
  move: (x: number, y: number) => void;
  turn: (steps: number) => void;
  fire: (weapon: number, disable?: boolean) => void;
  helm: (action: ShipHelmAction) => void;
  boost: (what: ShipBoost) => void;
  patch: () => void;
  regenerate: () => void;
  direct: () => void;
  interfere: () => void;
  flee: () => void;
  endTurn: () => void;
  // One step of a computer-run ship's turn; false when it is the character's
  aiStep: () => boolean;
  leave: () => void;
}

export const useShipFight = create<ShipFightState>((set, get) => {
  const rng = Math.random;
  const update = (fn: (fight: ShipFightData) => ShipFightData) => set((s) => (s.fight ? { fight: fn(s.fight) } : s));
  const mine = (s: ShipFightState) => s.fight?.ships.find((x) => x.id === s.partyShipId);
  return {
    fight: null,
    partyShipId: null,
    foeRefs: {},
    areaId: null,
    targetId: null,
    start: (party, foes, areaId) => {
      const fight = startShipFight(
        [shipCombatant(party.id, "party", party.sheet, { x: 0, y: 0, facing: 0 }, party.crew, party.hull, party.gunners)],
        foes.map((f) => shipCombatant(f.id, "foe", f.sheet, { x: 0, y: 0, facing: 0 }, f.sheet.weapons.length, f.hull)),
        rng,
      );
      set({ fight, partyShipId: party.id, foeRefs: { [party.id]: party.ref, ...Object.fromEntries(foes.map((f) => [f.id, f.ref])) }, areaId, targetId: foes[0]?.id ?? null });
    },
    setTarget: (id) => set({ targetId: id }),
    move: (x, y) => {
      const s = get();
      const me = mine(s);
      if (!me || s.fight!.ships[s.fight!.turn].id !== me.id) return;
      update((f) => shipMove(f, me.id, x, y));
    },
    turn: (steps) => {
      const me = mine(get());
      if (me) update((f) => shipTurn(f, me.id, steps));
    },
    fire: (weapon, disable) => {
      const s = get();
      const me = mine(s);
      const target = s.targetId ?? s.fight?.ships.find((x) => x.side === "foe" && !x.destroyed && !x.fled)?.id;
      if (!me || !target || !s.fight) return;
      // A gunner other than the helm fires without the helm's disadvantage when the crew has one to spare
      const out = shipFire(s.fight, me.id, weapon, target, rng, { disable, gunner: me.gunners > 0 });
      set({ fight: out.fight });
    },
    helm: (action) => {
      const me = mine(get());
      if (me) update((f) => shipHelm(f, me.id, action));
    },
    boost: (what) => {
      const me = mine(get());
      if (me) update((f) => shipBoost(f, me.id, what, rng));
    },
    patch: () => {
      const me = mine(get());
      if (me) update((f) => shipPatch(f, me.id, rng));
    },
    regenerate: () => {
      const me = mine(get());
      if (me) update((f) => shipRegenerate(f, me.id, rng));
    },
    direct: () => {
      const me = mine(get());
      if (me) update((f) => shipDirect(f, me.id, me.id));
    },
    interfere: () => {
      const s = get();
      const me = mine(s);
      if (me && s.targetId) update((f) => shipInterfere(f, me.id, s.targetId!, rng));
    },
    flee: () => {
      const me = mine(get());
      if (me) update((f) => shipFlee(f, me.id));
    },
    endTurn: () => update((f) => (f.outcome ? f : endShipTurn(f, rng))),
    aiStep: () => {
      const s = get();
      if (!s.fight || s.fight.outcome) return false;
      const current = s.fight.ships[s.fight.turn];
      if (!current || current.id === s.partyShipId) return false;
      if (current.destroyed || current.fled) {
        set({ fight: endShipTurn(s.fight, rng) });
        return true;
      }
      const out = shipAi(s.fight, current.id, rng);
      set({ fight: out.fight.outcome ? out.fight : endShipTurn(out.fight, rng) });
      return true;
    },
    leave: () => set({ fight: null, partyShipId: null, foeRefs: {}, areaId: null, targetId: null }),
  };
});
