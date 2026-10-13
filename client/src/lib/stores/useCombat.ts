import { create } from "zustand";
import { useCharacter, Character } from "./useCharacter";
import { rollDice, sumDiceResults } from "@/lib/sw5e/dice";
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
}

// A known power with what the app can resolve of it (see powerEffect in lib/sw5e/rules)
export interface CombatPower {
  name: string;
  cost: number;
  kind: "attack" | "save" | "heal" | "other";
  dice?: string;
  save?: string;
  halfOnSave?: boolean;
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

  // Combat actions
  initiateCombat: (
    player: Character,
    enemies: Omit<Combatant, "isPlayer">[],
    // The player's weapons, powers and power points
    weapons?: Partial<Combatant>,
  ) => void;
  endCombat: () => void;
  nextTurn: () => void;
  rollInitiative: (dexModifier: number) => number;
  attackRoll: (
    targetId: number | string,
    attackValue: number,
    damageValue: number,
    isCritical: boolean,
  ) => void;
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

  initiateCombat: (player, enemies, weapons) => {
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
      ...weapons,
    };

    // Add initiative to enemies
    const enemyCombatants = enemies.map((enemy) => ({
      ...enemy,
      initiative: roll(1, 20) + 1, // +1 as a simple modifier
      isPlayer: false,
    }));

    // Combine and sort by initiative
    const allCombatants = [playerCombatant, ...enemyCombatants].sort(
      (a, b) => b.initiative - a.initiative,
    );
    // Find index of combatant with highest initiative
    const firstTurn = 0;
    set({
      inCombat: true,
      combatants: allCombatants,
      currentTurn: firstTurn,
      round: 1,
      combatLog: ["Combat initiated! Roll for initiative!"],
      deathSaves: { successes: 0, failures: 0 },
      outcome: null,
    });
  },

  endCombat: () => {
    set({
      inCombat: false,
      combatants: [],
      currentTurn: 0,
      round: 1,
      combatLog: [],
      outcome: "left",
    });
  },

  nextTurn: () =>
    set((state) => {
      // Handle end of round
      if (state.currentTurn === state.combatants.length - 1) {
        return {
          currentTurn: 0,
          round: state.round + 1,
          combatLog: [...state.combatLog, `Round ${state.round + 1} begins!`],
        };
      }

      // Move to next combatant
      return {
        currentTurn: state.currentTurn + 1,
        combatLog: [
          ...state.combatLog,
          `${state.combatants[state.currentTurn + 1]?.name}'s turn`,
        ],
      };
    }),

  rollInitiative: (dexModifier) => {
    const result = roll(1, 20) + dexModifier;
    return result;
  },

  attackRoll: (targetId, attackValue, damageValue, isCritical) =>
    set((state) => {
      // Find the target
      const targetIndex = state.combatants.findIndex((c) => c.id === targetId);
      if (targetIndex === -1) return state;

      const target = state.combatants[targetIndex];
      const attacker = state.combatants[state.currentTurn];

      // Create log message
      let logMessage = `${attacker.name} attacks ${target.name} `;

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
        updatedCombatants[targetIndex] = { ...target, hp: newHp };

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

  // Cast one of the player's powers at the first standing enemy (or on themselves, to heal)
  castPower: (index) =>
    set((state) => {
      const caster = state.combatants[state.currentTurn];
      const power = caster?.powers?.[index];
      if (!caster?.isPlayer || !power || (caster.powerPoints ?? 0) < power.cost) return state;
      const combatants = state.combatants.map((c) => (c.id === caster.id ? { ...c, powerPoints: (c.powerPoints ?? 0) - power.cost } : c));
      const log = [...state.combatLog];
      const hit = (targetIndex: number, amount: number) => {
        combatants[targetIndex] = { ...combatants[targetIndex], hp: Math.max(0, combatants[targetIndex].hp - amount) };
        if (combatants[targetIndex].hp === 0) log.push(`${combatants[targetIndex].name} is defeated!`);
      };
      if (power.kind === "heal") {
        const amount = Math.max(1, rollDamage(power.dice!, false) + power.modifier);
        const i = combatants.findIndex((c) => c.id === caster.id);
        combatants[i] = { ...combatants[i], hp: Math.min(combatants[i].maxHp, combatants[i].hp + amount) };
        log.push(`${caster.name} casts ${power.name} and regains ${amount} hit points.`);
      } else if (power.kind === "attack" || power.kind === "save") {
        const targetIndex = combatants.findIndex((c) => !c.isPlayer && c.hp > 0);
        if (targetIndex === -1) return state;
        const target = combatants[targetIndex];
        if (power.kind === "attack") {
          const d = roll(1, 20);
          if (d !== 1 && (d === 20 || d + power.attack >= target.armorClass)) {
            const amount = rollDamage(power.dice!, d === 20);
            log.push(`${caster.name} casts ${power.name} at ${target.name} and hits for ${amount} damage${d === 20 ? " (critical)" : ""}.`);
            hit(targetIndex, amount);
          } else log.push(`${caster.name} casts ${power.name} at ${target.name} but misses.`);
        } else {
          const saved = roll(1, 20) + (target.saves?.[power.save ?? ""] ?? 0) >= power.dc;
          const full = rollDamage(power.dice!, false);
          const amount = saved ? (power.halfOnSave ? Math.floor(full / 2) : 0) : full;
          log.push(`${caster.name} casts ${power.name}: ${target.name} ${saved ? "saves" : "fails the save"} and takes ${amount} damage.`);
          if (amount > 0) hit(targetIndex, amount);
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
