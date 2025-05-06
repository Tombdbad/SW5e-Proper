
import { create } from 'zustand';
import { CombatState, CombatEntity } from '../../../shared/unifiedSchema';
import { withPerformanceTracking } from './performance';
import { StarshipCombatManager, VehicleCombatManager } from '../sw5e/combatmanagers';

interface CombatStore extends CombatState {
  addCombatant: (combatant: Omit<CombatEntity, 'id'>) => void;
  removeCombatant: (id: string) => void;
  updateCombatant: (id: string, updates: Partial<CombatEntity>) => void;
  startCombat: () => void;
  endCombat: () => void;
  nextTurn: () => void;
  applyDamage: (targetId: string, damage: number) => void;
  healTarget: (targetId: string, amount: number) => void;
  addCondition: (targetId: string, condition: string) => void;
  removeCondition: (targetId: string, condition: string) => void;
}

export const useCombat = create<CombatStore>((set, get) => ({
  active: false,
  round: 1,
  currentTurn: 0,
  entities: [],
  log: [],

  addCombatant: async (combatant) => {
    await withPerformanceTracking('addCombatant', async () => {
      set((state) => ({
        entities: [...state.entities, { ...combatant, id: crypto.randomUUID() }],
      }));
    });
  },

  removeCombatant: (id) => {
    set((state) => ({
      entities: state.entities.filter((e) => e.id !== id),
    }));
  },

  updateCombatant: (id, updates) => {
    set((state) => ({
      entities: state.entities.map((e) => 
        e.id === id ? { ...e, ...updates } : e
      ),
    }));
  },

  startCombat: () => {
    set({ active: true, round: 1, currentTurn: 0 });
  },

  endCombat: () => {
    set({ active: false, round: 1, currentTurn: 0, entities: [] });
  },

  nextTurn: () => {
    set((state) => {
      const newTurn = (state.currentTurn + 1) % state.entities.length;
      return {
        currentTurn: newTurn,
        round: newTurn === 0 ? state.round + 1 : state.round,
      };
    });
  },

  applyDamage: (targetId, damage) => {
    set((state) => ({
      entities: state.entities.map((e) =>
        e.id === targetId
          ? { ...e, hp: Math.max(0, e.hp - damage) }
          : e
      ),
      log: [...state.log, `${damage} damage dealt to ${state.entities.find(e => e.id === targetId)?.name}`],
    }));
  },

  healTarget: (targetId, amount) => {
    set((state) => ({
      entities: state.entities.map((e) =>
        e.id === targetId
          ? { ...e, hp: Math.min(e.maxHp, e.hp + amount) }
          : e
      ),
      log: [...state.log, `${amount} healing applied to ${state.entities.find(e => e.id === targetId)?.name}`],
    }));
  },

  addCondition: (targetId, condition) => {
    set((state) => ({
      entities: state.entities.map((e) =>
        e.id === targetId && !e.conditions.includes(condition)
          ? { ...e, conditions: [...e.conditions, condition] }
          : e
      ),
    }));
  },

  removeCondition: (targetId, condition) => {
    set((state) => ({
      entities: state.entities.map((e) =>
        e.id === targetId
          ? { ...e, conditions: e.conditions.filter((c) => c !== condition) }
          : e
      ),
    }));
  },
}));
