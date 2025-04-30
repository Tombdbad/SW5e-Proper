import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  health: {
    current: number;
    max: number;
  };
  armorClass: number;
  level?: number;
  type: 'pc' | 'npc' | 'monster';
  conditions?: Record<string, any>;
  abilityModifiers?: Record<string, any>;
  additionalDamage?: Array<{
    type: string;
    dice: number;
    sides: number;
    bonus: number;
    oneTime?: boolean;
  }>;
  damageBonus?: number;
  speed?: number;
  originalSpeed?: number;
  forceAlignment?: {
    light: number;
    dark: number;
  };
  [key: string]: any;
}

interface CombatState {
  combatants: Combatant[];
  inCombat: boolean;
  currentTurn: number;
  round: number;

  // Actions
  startCombat: () => void;
  endCombat: () => void;
  nextTurn: () => void;
  addCombatant: (combatant: Omit<Combatant, 'id'>) => string;
  removeCombatant: (id: string) => void;
  updateCombatant: (id: string, updates: Partial<Combatant>) => void;
  sortByInitiative: () => void;
}

export const useCombat = create<CombatState>((set, get) => ({
  combatants: [],
  inCombat: false,
  currentTurn: -1,
  round: 0,

  startCombat: () => set((state) => {
    // Sort combatants by initiative before starting
    const sortedCombatants = [...state.combatants].sort(
      (a, b) => b.initiative - a.initiative
    );

    return {
      combatants: sortedCombatants,
      inCombat: true,
      currentTurn: 0,
      round: 1
    };
  }),

  endCombat: () => set({
    inCombat: false,
    currentTurn: -1,
    round: 0
  }),

  nextTurn: () => set((state) => {
    if (!state.inCombat || state.combatants.length === 0) return state;

    const nextTurn = (state.currentTurn + 1) % state.combatants.length;
    const nextRound = nextTurn === 0 ? state.round + 1 : state.round;

    return {
      currentTurn: nextTurn,
      round: nextRound
    };
  }),

  addCombatant: (combatant) => {
    const id = uuidv4();
    set((state) => ({
      combatants: [...state.combatants, { id, ...combatant }]
    }));
    return id;
  },

  removeCombatant: (id) => set((state) => {
    const combatants = state.combatants.filter((c) => c.id !== id);

    // If we're removing the current combatant, adjust the turn
    let { currentTurn } = state;
    if (state.inCombat) {
      const removedIndex = state.combatants.findIndex((c) => c.id === id);
      if (removedIndex !== -1) {
        if (removedIndex < currentTurn) {
          currentTurn--;
        } else if (removedIndex === currentTurn) {
          // If we're removing the current combatant, stay on the same index
          // but it will point to the next combatant
          if (currentTurn >= combatants.length) {
            currentTurn = 0; // Loop back to the start if needed
          }
        }
      }
    }

    return { combatants, currentTurn };
  }),

  updateCombatant: (id, updates) => set((state) => ({
    combatants: state.combatants.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    )
  })),

  sortByInitiative: () => set((state) => ({
    combatants: [...state.combatants].sort((a, b) => b.initiative - a.initiative)
  }))
}));