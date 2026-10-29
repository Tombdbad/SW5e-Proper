// The shooter mode's keys, buttons and the session the map plays (2026-10-29; shared/logic/shooter.ts has the rules, Shooter.tsx the scene). Fire is
// the left mouse button (held, for an automatic weapon; X on a keyboard), block the right (B), G throws a grenade, R reloads, Q swaps the gun
// for the blade; W A S D walk, Space jumps, F fires the hook, Left Shift the pack's burst (interiors/air.ts) and E or Enter use what the
// crosshair is on, all as before. On a phone the same are buttons beside the stick.
import { create } from "zustand";
import type { GrenadeKind, RtPower, Unit } from "@shared/logic/shooter";

// (the digits 1 to 4 cast the party's powers, C crouches behind cover)
export type ShootKey = "fire" | "grenade" | "reload" | "block" | "swap" | "crouch" | "power0" | "power1" | "power2" | "power3";
export interface UnitMeta { role?: string; species?: string; creature?: string; size?: string; ring?: string }
// Everything a fight needs to begin: who is in it (the party's unit is the one of side "player"), what they look like, and the grenades carried
export interface Session {
  id: number;
  units: Unit[];
  meta: Record<string, UnitMeta>;
  seed: number;
  surprise: boolean;
  grenades: { kind: GrenadeKind; count: number }[];
  // The powers that can be cast in real time (keys 1 to 4), and the force or tech points the party has for them
  powers?: RtPower[];
  points?: number;
}
export interface Hud {
  hp: number; maxHp: number;
  weapon: "gun" | "blade"; hasGun: boolean; hasBlade: boolean; saber: boolean;
  gun?: string; left: number; mag: number; reserve: number; reloading: boolean;
  grenade?: string; grenades: number;
  focus: number; focusMax: number; blocking: boolean;
  foes: number;
  // the points left and the powers on the keys (what each costs, and whether it can be cast now)
  points: number;
  powers: { name: string; cost: number; ready: boolean }[];
  crouching: boolean;
  // when (performance.now) the last hit landed, the party was last hurt, a foe fell, a bolt was turned: the overlay flashes for a moment after each
  hitAt: number; headAt: number; hurtAt: number; killAt: number; deflectAt: number;
  note?: string;
}
export const blankHud = (): Hud => ({ hp: 0, maxHp: 1, weapon: "gun", hasGun: false, hasBlade: false, saber: false, left: 0, mag: 0, reserve: 0, reloading: false, grenades: 0, focus: 0, focusMax: 1, blocking: false, foes: 0, points: 0, powers: [], crouching: false, hitAt: 0, headAt: 0, hurtAt: 0, killAt: 0, deflectAt: 0 });

interface ShootStore {
  session: Session | null;
  // What the last fight used up (grenades thrown, by name), for the game to take out of the pack
  last: { used: Record<string, number> } | null;
  begin: (s: Omit<Session, "id">) => void;
  end: (used?: Record<string, number>) => void;
  taps: Record<ShootKey, number>;
  held: Record<ShootKey, boolean>;
  down: (key: ShootKey) => void;
  up: (key: ShootKey) => void;
  hud: Hud;
  setHud: (hud: Partial<Hud>) => void;
}
let counter = 0;
const KEY_LIST: ShootKey[] = ["fire", "grenade", "reload", "block", "swap", "crouch", "power0", "power1", "power2", "power3"];
const noKeys = () => Object.fromEntries(KEY_LIST.map((k) => [k, false])) as Record<ShootKey, boolean>;
const noTaps = () => Object.fromEntries(KEY_LIST.map((k) => [k, 0])) as Record<ShootKey, number>;
export const useShoot = create<ShootStore>((set, get) => ({
  session: null,
  last: null,
  begin: (s) => set({ session: { ...s, id: ++counter }, last: null, hud: blankHud(), held: noKeys() }),
  end: (used = {}) => set({ session: null, last: { used }, hud: blankHud() }),
  taps: noTaps(),
  held: noKeys(),
  down: (key) => set({ taps: { ...get().taps, [key]: get().taps[key] + 1 }, held: { ...get().held, [key]: true } }),
  up: (key) => set({ held: { ...get().held, [key]: false } }),
  hud: blankHud(),
  setHud: (hud) => set({ hud: { ...get().hud, ...hud } }),
}));

const KEYS: Record<string, ShootKey> = { KeyX: "fire", KeyG: "grenade", KeyR: "reload", KeyB: "block", KeyQ: "swap", KeyC: "crouch", Digit1: "power0", Digit2: "power1", Digit3: "power2", Digit4: "power3" };
// Bound while a fight is on. Not while typing or in a dialog, nor with a modifier
export function bindShootKeys(): () => void {
  const typing = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return /^(input|textarea|select)$/i.test(t?.tagName ?? "") || !!t?.isContentEditable || !!t?.closest?.("[role=dialog],[role=alertdialog]");
  };
  const down = (e: KeyboardEvent) => {
    const key = KEYS[e.code];
    if (!key || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!e.repeat) useShoot.getState().down(key);
  };
  const up = (e: KeyboardEvent) => {
    const key = KEYS[e.code];
    if (key) useShoot.getState().up(key);
  };
  const blur = () => (Object.values(KEYS) as ShootKey[]).forEach((k) => useShoot.getState().up(k));
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
  };
}
