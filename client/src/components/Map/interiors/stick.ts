// The on-screen stick (2026-10-20): its size, how its deflection becomes a speed, and the run toggle. One place for the three scenes that
// have one (walking in the shoulder and first-person views, the speeder race and the dogfight). Pure: tests/interiors/stick.test.ts.
import { create } from "zustand";

// A thumb has room on a phone: the pad is 176 px across, its knob 64 px, and the knob travels 56 px from the middle
export const STICK = { size: 176, knob: 64, travel: 56, radius: 88 };

// How the stick's deflection (0 to 1, the length of the vector from its middle) maps to a fraction of top speed: a small dead zone, then a
// curve that is gentle near the middle and steep at the edge (`expo` 0 is a straight line, 1 a cube), so that creeping is easy and the edge
// is still full speed
export const DEAD = 0.1;
export const EXPO = 0.6;
export function shaped(deflection: number, expo = EXPO, dead = DEAD): number {
  const d = Math.max(0, Math.min(1, deflection));
  if (d <= dead) return 0;
  const u = (d - dead) / (1 - dead);
  return (1 - expo) * u + expo * u * u * u;
}

// Squares a second on the map: running is the full speed the party has always walked at, walking is 30% slower
export const RUN_SPEED = 7;
export const WALK_FACTOR = 0.7;
export const paceOf = (deflection: number, run: boolean): number => shaped(deflection) * (run ? 1 : WALK_FACTOR);

// The Run button: on at the start (the speed the party has always had), remembered
const saved = (): boolean => {
  try {
    return localStorage.getItem("sw5e.run") !== "0";
  } catch {
    return true;
  }
};
export const useRun = create<{ run: boolean; toggle: () => void }>((set, get) => ({
  run: saved(),
  toggle: () => {
    const run = !get().run;
    try { localStorage.setItem("sw5e.run", run ? "1" : "0"); } catch {}
    set({ run });
  },
}));
