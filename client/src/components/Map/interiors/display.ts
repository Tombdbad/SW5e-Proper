// What a shop shows that changes from day to day (2026-10-21): the droids for sale standing on a droid dealer's plinths, and the
// customizations it sells on its parts shelves, by the furniture's asset id. Play sets it for the room the party is in (from the dealer's
// stock of the day, shared/logic `droidDisplay`); the map draws it. A piece with nothing set keeps its usual stock.
import { create } from "zustand";

export interface OnShow {
  // A droid's stat block name (drawn by the figure builder) and its price, by plinth
  droids: Record<string, { name: string; price: number }>;
  // The item catalogue's models on a parts shelf, by shelf
  shelves: Record<string, string[]>;
}
export const useDisplay = create<OnShow & { set: (next: Partial<OnShow>) => void }>((set) => ({
  droids: {},
  shelves: {},
  set: (next) => set(next),
}));
// For test scripts: what the shop the party is in shows
if (typeof window !== "undefined") (window as any).__display = useDisplay;
