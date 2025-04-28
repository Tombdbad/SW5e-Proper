import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type GamePhase = "main_menu" | "character_creation" | "campaign_setup" | "game" | "combat";
export type ViewMode = "galaxy" | "system" | "planet" | "local";

interface GameState {
  phase: GamePhase;
  viewMode: ViewMode;
  isLoading: boolean;
  currentLocationId: string | null;
  
  // Actions
  setPhase: (phase: GamePhase) => void;
  setViewMode: (mode: ViewMode) => void;
  setIsLoading: (loading: boolean) => void;
  setCurrentLocationId: (id: string | null) => void;
}

export const useGame = create<GameState>()(
  subscribeWithSelector((set) => ({
    phase: "main_menu",
    viewMode: "galaxy",
    isLoading: false,
    currentLocationId: null,
    
    setPhase: (phase) => set({ phase }),
    setViewMode: (viewMode) => set({ viewMode }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setCurrentLocationId: (currentLocationId) => set({ currentLocationId }),
  }))
);
