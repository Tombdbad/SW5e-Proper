import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createSelectors } from '@/lib/stores/selectors';
import { AppState, initialState } from './types';

const useStoreBase = create(
  persist(
    immer<AppState>((set) => ({
      ...initialState,
      setGameState: (state) => set((store) => { store.gameState = state; }),
      setCombatState: (state) => set((store) => { store.combatState = state; }),
      setAudioState: (state) => set((store) => { store.audioState = state; }),
      resetState: () => set(initialState),
    })),
    {
      name: 'sw5e-game-store',
      version: 1,
    }
  )
);

export const useStore = createSelectors(useStoreBase);