// Jumping, hooks and jetpacks in real time (2026-10-27; the user: "the entire game is a real-time movement system, ONLY fights are turn based:
// a REAL-TIME aim and fire mechanic for jetpack flight and grapple hook shots, plus a jump button on the space bar; mouse click activates; phone
// controls need a separate button for jump and activate"). The pure parts (what a jump is, what a pack flies like, where a hook line reels the
// party to) and the store the keys, the buttons and the map share. Heights and distances are in squares (5 ft.). tests/interiors/air.test.ts.
import { create } from "zustand";
import { jumpReach } from "@shared/logic";

export const FEET = 5;
// A hop clears what stands about as high as a counter (a little under a yard); a jump lasts 0.7 s at the standard pull
export const AIR = { hop: 0.45, time: 0.7, run: 7, hookCooldown: 1.2, reel: 15, boostCooldown: 1.6, sink: 1.8 };

export interface JumpStats {
  // How high the feet rise (squares), how long the jump lasts, the pull that makes it so (squares a second squared) and the speed up
  apex: number;
  time: number;
  gravity: number;
  rise: number;
  // How fast it carries along the way it was begun (squares a second); a standing jump carries nowhere
  carry: number;
}
// The Player's Handbook's jumps (shared/logic jumpReach: the high jump is 3 + Strength modifier feet, half from a standstill; the long jump the
// Strength score in feet after a run-up, half from a standstill, both divided by the world's pull), made real: a hop of that height in 0.7 s, carried
// along by the long jump's distance over the same time
export function jumpOf(strength: number, g = 1, size = "Medium", moving = true): JumpStats {
  const j = jumpReach(strength, moving, g, size);
  const apex = Math.max(0.15, j.high / FEET);
  const time = AIR.time;
  return { apex, time, gravity: (8 * apex) / (time * time), rise: (4 * apex) / time, carry: moving ? Math.min(AIR.run, j.long / FEET / time) : 0 };
}

export interface Flight {
  // Fraction of the walking pace it moves at (30 ft. of flying speed is the pace on foot), how fast it climbs and sinks (squares a second), the
  // ceiling (squares), and the burst: speed, how long it lasts
  pace: number;
  climb: number;
  sink: number;
  ceiling: number;
  burst: { speed: number; time: number };
}
export function flightOf(feet: number): Flight {
  const k = Math.max(0.5, feet / 30);
  return { pace: k, climb: 3 * k, sink: AIR.sink, ceiling: 4 + feet / 6, burst: { speed: 11 * k, time: 0.55 } };
}

// The pull of a hook: its range in squares (the normal range, and the long one at which the shot may still land) and its cable
export interface HookStats { name: string; range: number; long: number; cable: number }
export const hookStats = (shot: { name: string; range: number; long: number; cable: number }): HookStats => ({ name: shot.name, range: shot.range / FEET, long: Math.min(shot.long, shot.cable) / FEET, cable: shot.cable / FEET });

// Where the party is reeled to along a line from its feet to where the hook bit: the last open square before the line meets what cannot be passed over
// (a wall), squares of what stands low (furniture) are flown over. `open` and `low` are the map's own tests. Returns the square, and null when the
// line is blocked at once or the bite is under two squares away (nothing to be pulled across).
export function reelTo(from: { x: number; y: number }, to: { x: number; y: number }, open: (x: number, y: number) => boolean, low: (x: number, y: number) => boolean): { x: number; y: number } | null {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 2) return null;
  let best: { x: number; y: number } | null = null;
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  for (let d = 0.25; d <= length + 0.01; d += 0.25) {
    const [x, y] = [Math.round(from.x + ((to.x - from.x) * d) / length), Math.round(from.y + ((to.y - from.y) * d) / length)];
    if (x === start.x && y === start.y) continue;
    if (open(x, y)) best = { x, y };
    else if (!low(x, y)) break;
  }
  return best && Math.hypot(best.x - start.x, best.y - start.y) >= 1.5 ? best : null;
}

// What the party carries to do these with (set by Play from the character's gear and the place), and what the keys and buttons say
export interface AirGear {
  strength: number;
  size: string;
  // The world's pull (shared/logic gravityOf)
  g: number;
  hook?: HookStats;
  // A jetpack or rocket boots: its name, flying speed in feet, and whether it is running now
  fly?: { name: string; feet: number; on: boolean };
  // Which ways up to the roof or balcony of the building the party stands before the gear gives (the lowest, in squares up)
  ways: { leap: boolean; hook: boolean; fly: boolean; up?: number };
  // The character's pace in the water, a share of their walking pace (shared/logic swimPace: their species' swimming speed, else half)
  swim?: number;
}
export type AirKey = "jump" | "hook" | "boost";
// How high the party's figure is off its floor now (a jump, a flight, a hook's reel), for the co-op link to show the others
// (`at`: where the feet are while in the air, when the map's shared spot is only set on landing)
// (`f` is the yaw the figure faces and `s` its posture, 0 standing, 1 crouched, 2 prone: shared so that the others see them)
// (`ride`: the craft the party is at the helm of, as rideKey says it, for the other players to draw it under them)
export const partyHeight = { y: 0, f: 0, s: 0, at: null as { x: number; y: number } | null, ride: "" };
interface AirStore {
  gear: AirGear | null;
  setGear: (gear: AirGear | null) => void;
  // Presses counted (an edge), and keys held
  taps: Record<AirKey, number>;
  held: Record<AirKey, boolean>;
  down: (key: AirKey) => void;
  up: (key: AirKey) => void;
}
export const useAir = create<AirStore>((set, get) => ({
  gear: null,
  setGear: (gear) => set({ gear }),
  taps: { jump: 0, hook: 0, boost: 0 },
  held: { jump: false, hook: false, boost: false },
  down: (key) => set({ taps: { ...get().taps, [key]: get().taps[key] + 1 }, held: { ...get().held, [key]: true } }),
  up: (key) => set({ held: { ...get().held, [key]: false } }),
}));

// Space jumps (and holds a pack's thrust), F fires the hook, Left Shift fires the pack's burst; E, Enter and a click activate. Not while typing or in
// a dialog, nor with a modifier; Space is kept from pressing the button that still has the focus from the last click
export function bindAirKeys(): () => void {
  const typing = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return /^(input|textarea|select)$/i.test(t?.tagName ?? "") || !!t?.isContentEditable || !!t?.closest?.("[role=dialog],[role=alertdialog]");
  };
  const keys: Record<string, AirKey> = { Space: "jump", KeyF: "hook", ShiftLeft: "boost" };
  const down = (e: KeyboardEvent) => {
    const key = keys[e.code];
    if (!key || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!e.repeat) useAir.getState().down(key);
  };
  const up = (e: KeyboardEvent) => {
    const key = keys[e.code];
    if (key) useAir.getState().up(key);
  };
  const blur = () => (["jump", "hook", "boost"] as AirKey[]).forEach((k) => useAir.getState().up(k));
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
  };
}
