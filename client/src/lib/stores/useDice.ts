import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useAudio } from "./useAudio";

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface DieResult {
  type: DieType;
  value: number;
  isSuccess?: boolean;
  isFailure?: boolean;
  isAdvantage?: boolean;
  isDisadvantage?: boolean;
}

export interface RollOptions {
  advantage?: boolean;
  disadvantage?: boolean;
  criticalThreshold?: number;
  failureThreshold?: number;
  bonus?: number;
  target?: number;
  label?: string;
}

export interface RollResult {
  id: string;
  dice: DieResult[];
  total: number;
  success?: boolean;
  timestamp: number;
  options: RollOptions;
  label?: string;
}

interface DiceState {
  history: RollResult[];
  rolling: boolean;
  currentRoll: RollResult | null;
  
  // Actions
  rollDie: (type: DieType) => number;
  rollDice: (
    dice: DieType[],
    options?: RollOptions
  ) => RollResult;
  rollCheck: (
    abilityModifier: number,
    proficiencyBonus: number,
    options?: RollOptions
  ) => RollResult;
  rollSave: (
    abilityModifier: number,
    proficiencyBonus: number,
    hasProficiency: boolean,
    options?: RollOptions
  ) => RollResult;
  rollAttack: (
    attackBonus: number,
    options?: RollOptions
  ) => RollResult;
  rollDamage: (
    diceExpression: string,
    damageModifier: number,
    options?: RollOptions
  ) => RollResult;
  rollForce: (
    forceAbilityModifier: number,
    proficiencyBonus: number,
    options?: RollOptions
  ) => RollResult;
  clearHistory: () => void;
  clearCurrentRoll: () => void;
}

export const useDice = create<DiceState>()(
  subscribeWithSelector((set, get) => ({
    history: [],
    rolling: false,
    currentRoll: null,
    
    // Roll a single die of the given type
    rollDie: (type: DieType): number => {
      const sides = parseInt(type.substring(1));
      return Math.floor(Math.random() * sides) + 1;
    },
    
    // Roll multiple dice with options
    rollDice: (dice: DieType[], options: RollOptions = {}): RollResult => {
      set({ rolling: true });
      
      const { playHit } = useAudio.getState();
      playHit(); // Play sound effect for dice roll
      
      // Generate results for each die
      let diceResults: DieResult[] = dice.map(dieType => {
        const result = get().rollDie(dieType);
        return {
          type: dieType,
          value: result
        };
      });
      
      // Handle advantage/disadvantage for d20 rolls
      if ((options.advantage || options.disadvantage) && dice.includes('d20')) {
        // Roll a second d20
        const secondD20 = get().rollDie('d20');
        const firstD20 = diceResults.find(d => d.type === 'd20')!.value;
        
        // Keep higher for advantage, lower for disadvantage
        if (options.advantage && !options.disadvantage) {
          const finalValue = Math.max(firstD20, secondD20);
          diceResults = diceResults.map(d => 
            d.type === 'd20' 
              ? { 
                  ...d, 
                  value: finalValue,
                  isAdvantage: true
                } 
              : d
          );
          // Add the unused die to the results to show both
          diceResults.push({
            type: 'd20',
            value: finalValue === firstD20 ? secondD20 : firstD20,
            isAdvantage: false
          });
        } else if (options.disadvantage && !options.advantage) {
          const finalValue = Math.min(firstD20, secondD20);
          diceResults = diceResults.map(d => 
            d.type === 'd20' 
              ? { 
                  ...d, 
                  value: finalValue,
                  isDisadvantage: true
                } 
              : d
          );
          // Add the unused die to the results to show both
          diceResults.push({
            type: 'd20',
            value: finalValue === firstD20 ? secondD20 : firstD20,
            isDisadvantage: false
          });
        } 
        // If both advantage and disadvantage are true, they cancel out
      }
      
      // Apply critical success/failure markers
      diceResults = diceResults.map(d => {
        if (d.type === 'd20') {
          const critThreshold = options.criticalThreshold || 20;
          const failThreshold = options.failureThreshold || 1;
          
          return {
            ...d,
            isSuccess: d.value >= critThreshold,
            isFailure: d.value <= failThreshold
          };
        }
        return d;
      });
      
      // Calculate total with bonus
      const bonus = options.bonus || 0;
      const diceTotal = diceResults
        .filter(d => d.isAdvantage !== false && d.isDisadvantage !== false) // Filter out unused advantage/disadvantage dice
        .reduce((sum, die) => sum + die.value, 0);
      const total = diceTotal + bonus;
      
      // Determine success/failure based on target
      let success = undefined;
      if (options.target !== undefined) {
        success = total >= options.target;
      }
      
      const result: RollResult = {
        id: Date.now().toString(),
        dice: diceResults,
        total,
        success,
        timestamp: Date.now(),
        options
      };
      
      if (options.label) {
        result.label = options.label;
      }
      
      set(state => ({
        history: [result, ...state.history.slice(0, 19)], // Keep last 20 rolls
        currentRoll: result,
        rolling: false
      }));
      
      return result;
    },
    
    // Roll an ability check (d20 + ability modifier + proficiency bonus if applicable)
    rollCheck: (abilityModifier: number, proficiencyBonus: number, options: RollOptions = {}): RollResult => {
      const combinedOptions = {
        ...options,
        bonus: (options.bonus || 0) + abilityModifier + proficiencyBonus,
        label: options.label || 'Ability Check'
      };
      
      return get().rollDice(['d20'], combinedOptions);
    },
    
    // Roll a saving throw
    rollSave: (abilityModifier: number, proficiencyBonus: number, hasProficiency: boolean, options: RollOptions = {}): RollResult => {
      const saveProficiencyBonus = hasProficiency ? proficiencyBonus : 0;
      
      const combinedOptions = {
        ...options,
        bonus: (options.bonus || 0) + abilityModifier + saveProficiencyBonus,
        label: options.label || 'Saving Throw'
      };
      
      return get().rollDice(['d20'], combinedOptions);
    },
    
    // Roll an attack (d20 + attack bonus)
    rollAttack: (attackBonus: number, options: RollOptions = {}): RollResult => {
      const combinedOptions = {
        ...options,
        bonus: (options.bonus || 0) + attackBonus,
        label: options.label || 'Attack Roll',
        criticalThreshold: options.criticalThreshold || 20
      };
      
      return get().rollDice(['d20'], combinedOptions);
    },
    
    // Roll damage based on a dice expression string (e.g. "2d8+1d6")
    rollDamage: (diceExpression: string, damageModifier: number, options: RollOptions = {}): RollResult => {
      // Parse the dice expression
      const diceRegex = /(\d+)d(\d+)/g;
      const dice: DieType[] = [];
      
      let match;
      while ((match = diceRegex.exec(diceExpression)) !== null) {
        const count = parseInt(match[1]);
        const sides = match[2];
        const dieType = `d${sides}` as DieType;
        
        // Add the appropriate number of dice
        for (let i = 0; i < count; i++) {
          dice.push(dieType);
        }
      }
      
      const combinedOptions = {
        ...options,
        bonus: (options.bonus || 0) + damageModifier,
        label: options.label || 'Damage Roll'
      };
      
      return get().rollDice(dice, combinedOptions);
    },
    
    // Roll a Force power check
    rollForce: (forceAbilityModifier: number, proficiencyBonus: number, options: RollOptions = {}): RollResult => {
      const combinedOptions = {
        ...options,
        bonus: (options.bonus || 0) + forceAbilityModifier + proficiencyBonus,
        label: options.label || 'Force Power Check'
      };
      
      return get().rollDice(['d20'], combinedOptions);
    },
    
    clearHistory: () => set({ history: [] }),
    
    clearCurrentRoll: () => set({ currentRoll: null })
  }))
);
