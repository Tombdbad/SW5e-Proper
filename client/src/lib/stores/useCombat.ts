import { create } from "zustand";
import { useCharacter, Character } from "./useCharacter";
import { rollDice } from "@/lib/sw5e/dice";
import {
  StarshipCombatManager,
  VehicleCombatManager,
} from "@/lib/sw5e/combatManagers";

const shipManager = new StarshipCombatManager();
const vehicleManager = new VehicleCombatManager();

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
}

interface CombatState {
  inCombat: boolean;
  combatants: Combatant[];
  currentTurn: number;
  round: number;
  combatLog: string[];

  // Combat actions
  initiateCombat: (
    player: Character,
    enemies: Omit<Combatant, "isPlayer">[],
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
}

export const useCombat = create<CombatState>((set, get) => ({
  inCombat: false,
  combatants: [],
  currentTurn: 0,
  round: 1,
  combatLog: [],

  initiateCombat: (player, enemies) => {
    // Calculate initiatives
    const dexModifier = Math.floor((player.abilityScores.dexterity - 10) / 2);
    const playerInitiative = rollDice(1, 20) + dexModifier;

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
    };

    // Add initiative to enemies
    const enemyCombatants = enemies.map((enemy) => ({
      ...enemy,
      initiative: rollDice(1, 20) + 1, // +1 as a simple modifier
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
    });
  },

  endCombat: () => {
    set({
      inCombat: false,
      combatants: [],
      currentTurn: 0,
      round: 1,
      combatLog: [],
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
    const result = rollDice(1, 20) + dexModifier;
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
        logMessage += `with a 
critical hit for ${damageValue} damage!`;
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
            };
          }

          // Check if player is defeated
          const player = updatedCombatants.find((c) => c.isPlayer);
          if (player && player.hp === 0) {
            return {
              ...state,
              combatants: updatedCombatants,
              combatLog: [
                ...state.combatLog,
                logMessage,
                "Defeat! You have been defeated.",
              ],
              inCombat: false,
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

  damageRoll: (attackType, isCritical) => {
    let diceCount = isCritical ? 2 : 1; // Double dice on critical
    let diceType = 6; // Default to d6
    let modifier = 0;

    const { currentTurn, combatants } = get();
    const attacker = combatants[currentTurn];

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

    // Roll damage
    let totalDamage = 0;
    for (let i = 0; i < diceCount; i++) {
      totalDamage += rollDice(1, diceType);
    }

    return totalDamage + modifier;
  },
}));
