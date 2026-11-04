// How a lightsaber is fought with (2026-11-04; the user: "refactor the animations of lightsabre strikes to reflect AAA style combos: slow powerful
// strikes and light fast strikes, jumping strikes, crouching strikes, some interspersed with blocking moves and force powers, and a variety of
// specific ways to combine these ... based on the SW5e lightsabre forms and the type of lightsabre weapon: broadsabre, crossguard (Kylo Ren),
// double-ended staff (Darth Maul), dual wield (Ahsoka), light whip").
//
// Two things decide how someone fights. The FORM (shared/data/sw5e/lightsaberForms.json: limbs.ts `SaberStyle`) says how they stand and what they
// favour: its guard, its pace, and which family of combos it reaches for (`FLAVOUR`): the plain (Shii-Cho, Niman), the dueller's (Makashi, Jar'Kai),
// the guard's (Soresu), the acrobat's (Ataru, Trakata, Sokan), the powerful (Djem So, Shien) and the furious (Juyo, Vaapad). The WEAPON (`SaberKit`,
// from what is in the hand) says what can be done with it: a single blade, a heavy broadsword's, a crossguard's (the Ox guard, hacks, a shoulder
// charge), a double blade's (spins, a staff's thrusts), two blades' (crossed cuts, flurries, a grip turned over) or a whip's (lashes that crack).
//
// A MOVE is keys of a pose over its seconds (the guard at both ends), eased: slow into the wind-up, snapping into the blow (`snap`), a hold at the
// blow (`stop`: the weight of the hit) and out of it (`out`); a COMBO is moves one after another. A fight tells the figure only that it swung
// (`beginSwing`): swings in quick succession are one combo's moves in turn, the next move starting from where the last one was (`chain`), and after
// a pause the next combo begins. Pure: tests/interiors/saberplay.test.ts.
import type { SaberStyle } from "./limbs";

export type J3 = [number, number, number];
// The joints a strike moves, with what the hands hold: `weapon` what the right hand holds, `weaponL` what the left does (two blades), `whip1` and
// `whip2` the bends of a whip's lash
export const JOINTS = ["legR", "legL", "shinR", "shinL", "armR", "armL", "foreR", "foreL", "chest", "weapon", "head", "weaponL", "whip1", "whip2"] as const;
export type Joint = (typeof JOINTS)[number];
export type Joints = Partial<Record<Joint, J3>>;
// A key of a guard or a move: joints as they are, `arms` and `fores` the x of both upper arms and both forearms (a two-handed grip; one hand in a
// one-handed style), `lift` the body off the ground (a leap), `spin` it turned about (a spinning cut), `step` it carried forward (a lunge, metres)
// (`free`: how far the free hand is let go of what both hands hold, 0 to 1: a double blade's second hand follows the shaft unless the move gives
// the left arm a pose of its own)
export interface Key extends Joints { arms?: number; fores?: number; lift?: number; spin?: number; step?: number; free?: number }
export type Ease = "smooth" | "snap" | "out" | "lin";
export type MKey = [number, Key, Ease?];
export type MoveKind = "light" | "heavy" | "leap" | "low" | "guard" | "force" | "spin";
export interface Move { name: string; kind: MoveKind; dur: number; keys: MKey[]; hit: number; stop: number }
export interface Style { guard: Key; combos: Move[][]; oneHand?: boolean; block?: Key; tempo: number; offHand?: boolean }

export type SaberKit = "single" | "broad" | "crossguard" | "staff" | "dual" | "whip";
export const SABER_KITS: SaberKit[] = ["single", "broad", "crossguard", "staff", "dual", "whip"];
// What a weapon is fought as, from its name in the rules data (and the pose it is held in): the book's broadsabre and its kin are heavy, the
// crossguard saber is a crossguard, a doublesaber or lightstaff or splitsaber is a double blade, a saberwhip a whip; a second saber in the other
// hand makes two blades
export function saberKitOf(weapon = "", hand = "", offHand = ""): SaberKit {
  const n = weapon.toLowerCase();
  if (/whip/.test(n) && /saber|light/.test(n)) return "whip";
  if (offHand && /saber|shoto|foil|light/i.test(offHand) && !/staff|double|pike|split/.test(n)) return "dual";
  if (/crossguard|crosssaber|cross-?saber/.test(n)) return "crossguard";
  if (/doublesaber|double-?shoto|lightstaff|saberstaff|splitsaber|splitshoto|inquisitor|pikesaber|lightsaber pike/.test(n) || hand === "saber2") return "staff";
  if (/broadsaber|claymore|great-?saber|warsaber|bustersaber|dual-phase|sith saber|retrosaber/.test(n)) return "broad";
  return "single";
}

// Every move takes this much longer than it was first made to (2026-11-04, the user: "slow down the sabre animations by 15%")
export const PACE = 1.15;

// The hands of a double blade, in the frame of the trunk for a body of bulk 1: the arms are drawn to these (models.tsx `poses.saber2`) and the left
// hand is reached to `gap` along the shaft below the right (limbs.ts `gripStaff`), so that both hold the hilt, at the middle of the staff, whichever
// way it is turned. `dir` is the way the shaft points from the right hand (the model's blade end), as the weapon is drawn
export const STAFF_ARMS = {
  shoulder: [0.19, 0.34, 0] as [number, number, number],
  right: { elbow: [-0.273, 0.118, 0.076] as [number, number, number], hand: [-0.16, 0.2, 0.34] as [number, number, number] },
  left: { elbow: [0.085, 0.122, 0.08] as [number, number, number], hand: [-0.16, 0.112, 0.259] as [number, number, number] },
  dir: [0, 0.6, 0.55] as [number, number, number],
  gap: 0.12,
};

// ---- Joint helpers ----------------------------------------------------------------------------------------------------------------------

const j = (x = 0, y = 0, z = 0): J3 => [x, y, z];
const K = (...parts: Key[]): Key => Object.assign({}, ...parts);
// Legs: a lunge (the left foot forward), the weight on the back foot (a wind-up), crouched, tucked in the air, wide
const lunge = (k = 1): Key => ({ legL: j(-0.65 * k), shinL: j(0.7 * k), legR: j(0.35 * k), shinR: j(0.35 * k) });
const load = (): Key => ({ legL: j(-0.1), shinL: j(0.35), legR: j(0.5), shinR: j(0.75) });
const deep = (): Key => ({ legL: j(-1.15, 0, 0.05), shinL: j(1.65), legR: j(-0.5, 0, -0.1), shinR: j(1.5) });
const tuck = (): Key => ({ legL: j(-1.05, 0, 0.1), shinL: j(1.1), legR: j(-0.75, 0, -0.1), shinR: j(1.25) });
const wide = (): Key => ({ legL: j(-0.55, 0, 0.3), shinL: j(0.5), legR: j(0.3, 0, -0.3), shinR: j(0.5) });
const rear = (): Key => ({ legL: j(-0.05), shinL: j(0.25), legR: j(0.4), shinR: j(0.6) });

const mv = (name: string, kind: MoveKind, dur: number, keys: MKey[], o: { hit?: number; stop?: number } = {}): Move => {
  const snap = keys.findIndex((k) => k[2] === "snap");
  return { name, kind, dur, keys, hit: o.hit ?? (snap >= 0 ? snap : 1), stop: o.stop ?? 0.04 };
};

// ---- The moves of a two-handed blade (a single saber, a broadsaber, a crossguard) --------------------------------------------------------
// `d` 1 cuts from the right to the left, -1 the other way; `h` how heavy (0 a light quick blow, 1 a slow one that is felt: a longer wind-up, the
// weight thrown behind it, a longer hold at the blow)

// A cut from high on one side down to low on the other
export const cut = (d: number, h = 0, dur = 0.46 + 0.34 * h): Move => {
  const wind: Key = K({ arms: -2.25, fores: -0.25, chest: j(-0.14 - 0.12 * h, -0.8 * d, 0.3 * d), weapon: j(0.05, 0, -0.4 * d), head: j(0, 0.5 * d, 0) }, load());
  return mv("cut", h > 0.5 ? "heavy" : "light", dur, [
    [0.3, wind], ...(h > 0 ? [[0.3 + 0.12 * h, wind] as MKey] : []),
    [0.56, K({ arms: -0.2, fores: 0, chest: j(0.4, 0.9 * d, -0.24 * d), weapon: j(0.9, 0, 0.38 * d), head: j(0, -0.6 * d, 0), step: 0.1 + 0.16 * h }, lunge()), "snap"],
    [0.84, K({ arms: -0.1, fores: 0, chest: j(0.3, 1.0 * d, -0.2 * d), weapon: j(1.0, 0, 0.35 * d), step: 0.12 + 0.16 * h }, lunge()), "out"],
  ], { stop: 0.04 + 0.08 * h });
};
// A cut straight across
export const sweepH = (d: number, h = 0, spin = 0, dur = 0.46 + 0.3 * h): Move => mv("sweep", spin ? "spin" : h > 0.5 ? "heavy" : "light", dur, [
  [0.3, K({ arms: -1.05, fores: -0.2, chest: j(0.05, -1.1 * d, 0.12 * d), weapon: j(1.05), head: j(0, 0.8 * d, 0), spin: 0 }, load())],
  [0.58, K({ arms: -1.0, fores: -0.1, chest: j(0.18, 1.2 * d, -0.12 * d), weapon: j(1.15), head: j(0, -0.7 * d, 0), spin, step: 0.08 + 0.12 * h }, lunge(0.6)), "snap"],
  [0.84, K({ arms: -0.9, chest: j(0.12, 0.9 * d, 0), weapon: j(1.0), spin }), "out"],
], { stop: 0.04 + 0.06 * h });
// A cut up from low
export const rising = (d: number, h = 0, dur = 0.42 + 0.3 * h): Move => mv("rising", h > 0.5 ? "heavy" : "light", dur, [
  [0.3, K({ arms: 0.25, fores: -0.1, chest: j(0.25, -0.85 * d, -0.22 * d), weapon: j(1.45) }, load())],
  [0.56, K({ arms: -2.1, fores: -0.2, chest: j(-0.18, 0.75 * d, 0.22 * d), weapon: j(-0.05), step: 0.1 + 0.1 * h }, lunge()), "snap"],
  [0.82, K({ arms: -2.3, fores: -0.1, chest: j(-0.22, 0.6 * d, 0.18 * d), weapon: j(-0.1), step: 0.1 }, lunge(0.7)), "out"],
]);
// A lunging thrust
export const thrust = (h = 0, dur = 0.4 + 0.2 * h): Move => mv("thrust", h > 0.5 ? "heavy" : "light", dur, [
  [0.34, K({ arms: -0.75, fores: -1.15, weapon: j(1.55), chest: j(-0.06, 0.35, 0) }, load())],
  [0.52, K({ arms: -1.45, fores: 0.05, weapon: j(1.5), chest: j(0.32, 0.2, 0), step: 0.28 + 0.12 * h }, lunge(1.4)), "snap"],
  [0.82, K({ arms: -1.4, fores: 0.05, weapon: j(1.5), chest: j(0.28, 0.2, 0), step: 0.3 }, lunge(1.3)), "out"],
], { stop: 0.05 + 0.05 * h });
// A quick turn of the wrists
export const flick = (dur = 0.32): Move => mv("flick", "light", dur, [
  [0.4, { arms: -1.1, fores: -0.5, weapon: j(0.3) }],
  [0.62, K({ arms: -1.35, fores: 0, weapon: j(1.4), chest: j(0.2, 0.3, 0), step: 0.08 }, lunge(0.4)), "snap"],
  [0.85, { arms: -1.3, fores: 0, weapon: j(1.3), chest: j(0.15, 0.25, 0) }, "out"],
]);
// The blade hauled up and brought down with the whole body behind it (and a long breath before, so that it is seen coming)
export const overhead = (h = 0.5, dur = 0.5 + 0.5 * h): Move => {
  const wind: Key = K({ arms: -2.8, fores: -0.3, chest: j(-0.3 - 0.15 * h, 0, 0), weapon: j(-0.45), head: j(-0.15, 0, 0) }, load());
  return mv("overhead", h > 0.5 ? "heavy" : "light", dur, [
    [0.3, wind], [0.3 + 0.16 * h, wind],
    [0.58, K({ arms: 0.05, fores: 0, chest: j(0.6, 0, 0), weapon: j(0.8), step: 0.14 + 0.2 * h }, lunge(0.8 + 0.4 * h)), "snap"],
    [0.86, K({ arms: -0.3, fores: 0, chest: j(0.45, 0, 0), weapon: j(0.8), step: 0.16 + 0.2 * h }, lunge()), "out"],
  ], { stop: 0.05 + 0.1 * h });
};
// A wide cleave, the whole body wound round behind it
export const cleave = (d: number, dur = 0.82): Move => mv("cleave", "heavy", dur, [
  [0.3, K({ arms: -1.15, fores: -0.2, chest: j(0.08, -1.6 * d, 0.1 * d), weapon: j(0.95), head: j(0, 1.0 * d, 0) }, wide())],
  [0.42, K({ arms: -1.15, fores: -0.2, chest: j(0.08, -1.7 * d, 0.1 * d), weapon: j(0.95), head: j(0, 1.0 * d, 0) }, wide())],
  [0.62, K({ arms: -1.05, fores: -0.1, chest: j(0.2, 1.5 * d, -0.1 * d), weapon: j(1.1), head: j(0, -0.9 * d, 0), step: 0.2 }, lunge(0.9)), "snap"],
  [0.88, K({ arms: -0.9, chest: j(0.15, 1.2 * d, 0), weapon: j(1.0), step: 0.22 }, lunge(0.8)), "out"],
], { stop: 0.1 });
// The blade driven into the ground, the body folded over it
export const smash = (dur = 0.92): Move => mv("smash", "heavy", dur, [
  [0.3, K({ arms: -2.85, fores: -0.3, chest: j(-0.45, 0, 0), weapon: j(-0.5), head: j(-0.2, 0, 0) }, rear())],
  [0.42, K({ arms: -2.85, fores: -0.3, chest: j(-0.5, 0, 0), weapon: j(-0.5), head: j(-0.2, 0, 0), lift: 0.05 }, rear())],
  [0.6, K({ arms: 0.3, fores: 0, chest: j(0.9, 0, 0), weapon: j(1.2), head: j(0.2, 0, 0), step: 0.26 }, deep()), "snap"],
  [0.9, K({ arms: 0.25, fores: 0, chest: j(0.8, 0, 0), weapon: j(1.15), step: 0.26 }, deep()), "out"],
], { stop: 0.12 });

// A leap with a blow from above: crouched to spring, up with the blade over the head, down on the target
export const leapSlam = (dur = 0.92): Move => mv("leap slam", "leap", dur, [
  [0.18, K({ arms: -0.3, fores: -0.2, chest: j(0.45, 0, 0), weapon: j(0.4) }, deep())],
  [0.4, K({ arms: -2.8, fores: -0.3, chest: j(-0.25, 0, 0), weapon: j(-0.45), lift: 0.62, step: 0.3 }, tuck()), "out"],
  [0.6, K({ arms: 0.1, fores: 0, chest: j(0.65, 0, 0), weapon: j(0.85), lift: 0, step: 0.6 }, lunge(1.1)), "snap"],
  [0.9, K({ arms: -0.3, chest: j(0.45, 0, 0), weapon: j(0.8), step: 0.6 }, lunge(0.9)), "out"],
], { stop: 0.08 });
// A leap that turns over the head of the foe: a cut at the top of it, another coming down (a spin)
export const flipCut = (d: number, dur = 0.86): Move => mv("flip cut", "leap", dur, [
  [0.18, K({ arms: -0.4, fores: -0.3, chest: j(0.4, -0.5 * d, 0), weapon: j(0.6), spin: 0 }, deep())],
  [0.42, K({ arms: -2.0, fores: -0.2, chest: j(-0.1, 0.6 * d, 0.2 * d), weapon: j(0.2, 0, 0.3 * d), lift: 0.55, spin: Math.PI * d, step: 0.25 }, tuck()), "out"],
  [0.66, K({ arms: -1.3, fores: -0.1, chest: j(0.3, 0.9 * d, -0.2 * d), weapon: j(0.9, 0, 0.35 * d), lift: 0, spin: Math.PI * 2 * d, step: 0.5 }, lunge(1.0)), "snap"],
  [0.9, K({ arms: -0.9, chest: j(0.2), weapon: j(1.0), spin: Math.PI * 2 * d, step: 0.5 }, lunge(0.8)), "out"],
], { stop: 0.05 });
// A short spring and a diagonal cut at the top of it
export const vaultCut = (d: number, dur = 0.7): Move => mv("vault cut", "leap", dur, [
  [0.22, K({ arms: -0.5, fores: -0.3, chest: j(0.35, -0.5 * d, 0), weapon: j(0.7) }, deep())],
  [0.44, K({ arms: -2.3, fores: -0.2, chest: j(-0.1, -0.8 * d, 0.28 * d), weapon: j(0.05, 0, -0.4 * d), lift: 0.4, step: 0.25 }, tuck()), "out"],
  [0.62, K({ arms: -0.2, chest: j(0.4, 0.9 * d, -0.24 * d), weapon: j(0.9, 0, 0.38 * d), lift: 0.15, step: 0.42 }, lunge(0.9)), "snap"],
  [0.86, K({ arms: -0.1, chest: j(0.3, 1.0 * d, -0.2 * d), weapon: j(1.0, 0, 0.35 * d), step: 0.42 }, lunge()), "out"],
]);

// A sweep at the height of the knees from a crouch
export const lowSweep = (d: number, dur = 0.62): Move => mv("low sweep", "low", dur, [
  [0.3, K({ arms: -0.2, fores: -0.2, chest: j(0.62, -1.0 * d, 0), weapon: j(0.6), head: j(-0.3, 0.7 * d, 0) }, deep())],
  [0.58, K({ arms: -0.2, fores: -0.1, chest: j(0.62, 1.2 * d, 0), weapon: j(0.6), head: j(-0.3, -0.7 * d, 0), step: 0.12 }, deep()), "snap"],
  [0.84, K({ arms: -0.2, chest: j(0.5, 1.0 * d, 0), weapon: j(0.6), step: 0.12 }, deep()), "out"],
]);
// A thrust from a crouch
export const lowThrust = (dur = 0.5): Move => mv("low thrust", "low", dur, [
  [0.3, K({ arms: -0.5, fores: -1.1, chest: j(0.55, 0.3, 0), weapon: j(1.2) }, deep())],
  [0.54, K({ arms: -1.25, fores: 0.05, chest: j(0.7, 0.2, 0), weapon: j(1.3), step: 0.3 }, deep()), "snap"],
  [0.82, K({ arms: -1.2, fores: 0.05, chest: j(0.65, 0.2, 0), weapon: j(1.3), step: 0.3 }, deep()), "out"],
]);
// Up from a crouch into a rising cut, off the ground
export const springCut = (d: number, dur = 0.66): Move => mv("spring cut", "low", dur, [
  [0.28, K({ arms: 0.3, fores: -0.1, chest: j(0.5, -0.9 * d, -0.2 * d), weapon: j(1.3) }, deep())],
  [0.54, K({ arms: -2.1, fores: -0.2, chest: j(-0.2, 0.8 * d, 0.22 * d), weapon: j(-0.05), lift: 0.14, step: 0.26 }, lunge()), "snap"],
  [0.84, K({ arms: -2.3, chest: j(-0.2, 0.6 * d, 0.15 * d), weapon: j(-0.1), step: 0.26 }, lunge(0.7)), "out"],
]);

// The blade across the body, high, middle or low, and a turn of it to take a blow
export const parry = (side = 1, level: "high" | "mid" | "low" = "mid", dur = 0.5): Move => {
  const p: Key = level === "high" ? { arms: -1.9, fores: -0.5, weapon: j(-0.7, 0, 0.55 * side), chest: j(-0.05, 0.2 * side, 0) }
    : level === "low" ? K({ arms: -0.55, fores: -0.55, weapon: j(1.35, 0, 0.7 * side), chest: j(0.3, 0.25 * side, 0) }, deep())
    : K({ arms: -1.25, fores: -0.35, weapon: j(-0.15, 0, 0.9 * side), chest: j(0, 0.25 * side, 0), head: j(0, -0.2 * side, 0) }, rear());
  return mv("parry", "guard", dur, [
    [0.22, p],
    [0.4, { ...p, weapon: j(p.weapon![0] + 0.1, 0, p.weapon![2] * 0.5), chest: j(p.chest![0], p.chest![1] - 0.12 * side, 0) }, "snap"],
    [0.72, p, "out"],
  ], { stop: 0.05 });
};

// The Force: the free hand thrown out, palm first, as the body turns into it
export const push = (dur = 0.64): Move => mv("push", "force", dur, [
  [0.26, { armL: j(-0.6, 0.3, 0.3), foreL: j(-1.9), chest: j(0, 0.55, 0), head: j(0, -0.3, 0), ...rear() }],
  [0.44, K({ armL: j(-1.55, -0.25, -0.05), foreL: j(0.05), chest: j(0.1, -0.25, 0), head: j(0, 0.15, 0), step: 0.12 }, lunge(1.1)), "snap"],
  [0.8, K({ armL: j(-1.6, -0.25, -0.05), foreL: j(0.05), chest: j(0.1, -0.2, 0), step: 0.12 }, lunge(1.1)), "out"],
], { stop: 0.1 });
// ... or hauled back toward them (the body drawn away)
export const pull = (dur = 0.7): Move => mv("pull", "force", dur, [
  [0.28, K({ armL: j(-1.5, -0.2, 0), foreL: j(0), chest: j(0.15, -0.3, 0), step: 0.08 }, lunge(0.7))],
  [0.62, K({ armL: j(-0.45, 0.2, 0.2), foreL: j(-2.0), chest: j(-0.18, 0.25, 0), head: j(-0.1, 0.1, 0), step: -0.1 }, rear()), "snap"],
  [0.86, K({ armL: j(-0.5, 0.2, 0.2), foreL: j(-1.9), chest: j(-0.1, 0.2, 0), step: -0.1 }, rear()), "out"],
]);

// ---- The spins of a blade held in two hands (a single blade, a broadsaber, a crossguard) -----------------------------------------------------
// Every weapon has one (2026-11-04, the user: "ALL light weapon types should have at least 1 spinning attack: whirling weapons above the head, the
// character spinning with the blade at arm's length")

// The body turned about on the spot, once or twice, the blade held out level at arm's length and cutting all the way round; `h` how much weight
// is behind it (a heavy blade is wound further and held at the end)
export const pirouette = (d = 1, turns = 1, h = 0, dur = 0.78 + 0.22 * h + 0.3 * (turns - 1)): Move => mv("pirouette", "spin", dur, [
  [0.24, K({ arms: -1.5, fores: -0.1, chest: j(0.05, -0.9 * d, 0), weapon: j(2.3), head: j(0, 0.6 * d, 0), spin: 0 }, wide())],
  [0.64, K({ arms: -1.5, fores: -0.05, chest: j(0.05, 0.4 * d, 0), weapon: j(2.3), spin: Math.PI * 2 * turns * d, step: 0.1 + 0.08 * h }, wide()), "snap"],
  [0.9, K({ arms: -1.1, fores: 0, chest: j(0.2, 0.3 * d, 0), weapon: j(1.2), spin: Math.PI * 2 * turns * d, step: 0.12 + 0.08 * h }, lunge(0.6)), "out"],
], { hit: 1, stop: 0.04 + 0.05 * h });
// The blade whirled round above the head in one hand (the other flung out for balance), then brought down on the foe
export const whirlHead = (d = 1, turns = 2, dur = 0.5 + 0.22 * turns): Move => mv("overhead whirl", "spin", dur, [
  [0.2, K({ arms: -2.8, fores: -0.3, armL: j(-0.5, 0, -0.9), foreL: j(-0.3), chest: j(-0.15, 0, 0), weapon: j(0.1, 0, 0), head: j(-0.1, 0, 0) }, wide())],
  [0.64, K({ arms: -2.8, fores: -0.3, armL: j(-0.4, 0, -1.0), foreL: j(-0.2), chest: j(-0.1, 0.3 * d, 0), weapon: j(0.1, -Math.PI * 2 * turns * d, 0) }, wide()), "snap"],
  [0.9, K({ arms: -0.4, fores: 0, armL: j(-0.9, 0, -0.1), foreL: j(-0.5), chest: j(0.45, 0.4 * d, 0), weapon: j(0.9, -Math.PI * 2 * turns * d, 0), step: 0.2 }, lunge(0.9)), "out"],
], { hit: 1, stop: 0.03 });

// ---- The moves of a double blade (a staff: Darth Maul's) -----------------------------------------------------------------------------------
// The blade is held across the body at the middle; its spin is about the hand that has it (`weapon` z), the other hand let go

// (the staff is held turned out of line by `STAFF_TURN`: its rear blade goes out to the figure's right and clears the body, which a shaft held square to the
// hands goes through)
const STAFF_TURN = { yaw: 0.3, roll: -0.3 };
const sj = (x = 0, y = 0, z = 0): J3 => [x, y + STAFF_TURN.yaw, z + STAFF_TURN.roll];

// The staff turned over and over before the body, the free arm out for balance, then a cut from it
export const windmill = (d: number, turns = 1, dur = 0.74): Move => mv("windmill", "spin", dur, [
  [0.18, { armL: j(-0.3, 0, -0.6), foreL: j(-0.3), chest: j(0, -0.3 * d, 0), weapon: sj(-0.75, 0, 0), ...wide() }],
  [0.6, K({ armL: j(-0.2, 0, -0.9), foreL: j(-0.2), chest: j(0.1, 0.5 * d, 0), weapon: sj(-0.5, 0, -Math.PI * 2 * turns * d), step: 0.1 }, wide()), "snap"],
  [0.88, { armL: j(-0.9, 0, -0.1), foreL: j(-0.7), chest: j(0.1, 0.3 * d, 0), weapon: sj(-0.2, 0, -Math.PI * 2 * turns * d) }, "out"],
], { hit: 1, stop: 0.03 });
// A long cut with both blades going round (the front one down, the rear one up behind), the body wound
export const staffCut = (d: number, h = 0, dur = 0.58 + 0.3 * h): Move => mv("staff cut", h > 0.5 ? "heavy" : "light", dur, [
  [0.3, K({ arms: -1.2, fores: -0.3, chest: j(0.0, -1.2 * d, 0.1 * d), weapon: sj(-0.3, 0, -0.5 * d), head: j(0, 0.8 * d, 0) }, wide())],
  [0.58, K({ arms: -1.1, fores: -0.1, chest: j(0.1, 1.2 * d, -0.1 * d), weapon: sj(0.2, 0, 0.5 * d), head: j(0, -0.7 * d, 0), step: 0.15 }, lunge(0.8)), "snap"],
  [0.84, K({ arms: -1.0, chest: j(0.1, 0.9 * d, 0), weapon: sj(0.3, 0, 0.3 * d), step: 0.15 }, lunge(0.7)), "out"],
], { stop: 0.04 + 0.05 * h });
// A two-handed lunge with the blade's whole length behind it
export const staffThrust = (dur = 0.46): Move => mv("staff thrust", "light", dur, [
  [0.34, K({ arms: -0.9, fores: -1.0, weapon: sj(1.2), chest: j(-0.05, 0.45, 0) }, rear())],
  [0.55, K({ arms: -1.4, fores: 0.05, weapon: sj(1.4), chest: j(0.3, 0.25, 0), step: 0.34 }, lunge(1.4)), "snap"],
  [0.84, K({ arms: -1.35, fores: 0.05, weapon: sj(1.4), chest: j(0.26, 0.25, 0), step: 0.34 }, lunge(1.3)), "out"],
]);
// The staff swung over the head and brought down with the rear blade swinging up behind
export const staffSlam = (dur = 0.84): Move => mv("staff slam", "heavy", dur, [
  [0.3, K({ arms: -2.6, fores: -0.3, chest: j(-0.35, 0, 0), weapon: sj(-0.6, 0, 0.3), head: j(-0.15, 0, 0) }, rear())],
  [0.42, K({ arms: -2.6, fores: -0.3, chest: j(-0.4, 0, 0), weapon: sj(-0.6, 0, 0.3), head: j(-0.15, 0, 0) }, rear())],
  [0.6, K({ arms: -0.1, chest: j(0.55, 0, 0), weapon: sj(0.9), step: 0.3 }, lunge(1.1)), "snap"],
  [0.88, K({ arms: -0.2, chest: j(0.45, 0, 0), weapon: sj(0.9), step: 0.3 }, lunge()), "out"],
], { stop: 0.09 });
// A leap with the staff spinning round the body, a blow from each end as it turns
export const staffVault = (d: number, dur = 0.9): Move => mv("staff vault", "leap", dur, [
  [0.18, K({ armL: j(-0.3, 0, -0.6), arms: -0.6, chest: j(0.4, -0.5 * d, 0), weapon: sj(0.2) , spin: 0 }, deep())],
  [0.44, K({ armL: j(-0.2, 0, -1.0), foreL: j(-0.3), arms: -1.8, chest: j(0, 0.5 * d, 0), weapon: sj(-0.4, 0, -Math.PI * d), lift: 0.58, spin: Math.PI * d, step: 0.25 }, tuck()), "out"],
  [0.68, K({ armL: j(-0.8, 0, -0.3), arms: -1.2, chest: j(0.3, 0.8 * d, 0), weapon: sj(0.4, 0, -Math.PI * 2 * d), lift: 0, spin: Math.PI * 2 * d, step: 0.5 }, lunge(1.0)), "snap"],
  [0.92, K({ arms: -1.0, chest: j(0.2), weapon: sj(0.4, 0, -Math.PI * 2 * d), spin: Math.PI * 2 * d, step: 0.5 }, lunge(0.8)), "out"],
]);
// Crouched, the staff turned low round the legs
export const staffLow = (d: number, dur = 0.72): Move => mv("staff low", "low", dur, [
  [0.3, K({ arms: -0.4, fores: -0.3, chest: j(0.6, -1.0 * d, 0), weapon: sj(0.5), head: j(-0.3, 0.7 * d, 0) }, deep())],
  [0.58, K({ arms: -0.4, fores: -0.2, chest: j(0.6, 1.2 * d, 0), weapon: sj(0.5, 0, 0.6 * d), head: j(-0.3, -0.7 * d, 0), step: 0.12 }, deep()), "snap"],
  [0.86, K({ arms: -0.4, chest: j(0.5, 1.0 * d, 0), weapon: sj(0.5), step: 0.12 }, deep()), "out"],
]);
// The staff turned fast across the front to take what comes (a block that is a spin)
export const staffGuard = (dur = 0.66): Move => mv("staff guard", "guard", dur, [
  [0.2, { armL: j(-0.5, 0, -0.5), foreL: j(-0.4), arms: -1.0, weapon: sj(-0.7, 0, 0.0), chest: j(0, 0.2, 0), ...wide() }],
  [0.6, { armL: j(-0.5, 0, -0.6), foreL: j(-0.4), arms: -1.0, weapon: sj(-0.7, 0, -Math.PI * 2), chest: j(0, -0.2, 0), ...wide() }, "snap"],
  [0.8, { armL: j(-0.6, 0, -0.3), foreL: j(-0.5), arms: -1.0, weapon: sj(-0.7, 0, -Math.PI * 2), ...wide() }, "out"],
], { stop: 0.02 });

// ---- The moves of two blades (Ahsoka's) ---------------------------------------------------------------------------------------------------
// The right hand moves `armR`, `foreR`, `weapon`; the left `armL`, `foreL`, `weaponL`. A grip turned over (the blade back along the forearm) is a
// half turn of the hand's `weaponL` x

// Both blades brought across from outside to cross in front of the body
export const crossCut = (h = 0, dur = 0.5 + 0.3 * h): Move => mv("cross cut", h > 0.5 ? "heavy" : "light", dur, [
  [0.3, K({ armR: j(-1.25, 0.5, 0.45), foreR: j(-0.3), weapon: j(0.1, 0, 0.5), armL: j(-1.25, -0.5, -0.45), foreL: j(-0.3), weaponL: j(0.1, 0, -0.5), chest: j(-0.1, 0, 0) }, load())],
  [0.55, K({ armR: j(-1.4, -0.45, -0.1), foreR: j(0), weapon: j(0.85, 0, -0.3), armL: j(-1.4, 0.45, 0.1), foreL: j(0), weaponL: j(0.85, 0, 0.3), chest: j(0.3, 0, 0), step: 0.2 + 0.12 * h }, lunge()), "snap"],
  [0.82, K({ armR: j(-1.3, -0.4, -0.1), weapon: j(0.9, 0, -0.25), armL: j(-1.3, 0.4, 0.1), weaponL: j(0.9, 0, 0.25), chest: j(0.25), step: 0.22 }, lunge(0.8)), "out"],
], { stop: 0.04 + 0.08 * h });
// One blade then the other, a turn of the body between
export const flurry = (d: number, dur = 0.66): Move => mv("flurry", "light", dur, [
  [0.2, K({ armR: j(-2.0, 0, 0.1), foreR: j(-0.3), weapon: j(0.1, 0, -0.3 * d), armL: j(-0.9, 0, 0.1), foreL: j(-0.9), weaponL: j(0.6), chest: j(-0.05, -0.6 * d, 0.1 * d) }, load())],
  [0.4, K({ armR: j(-0.3, 0, 0), foreR: j(0), weapon: j(0.9, 0, 0.3 * d), armL: j(-1.0, 0, 0.1), foreL: j(-0.9), weaponL: j(0.6), chest: j(0.3, 0.8 * d, -0.2 * d), step: 0.1 }, lunge()), "snap"],
  [0.58, K({ armR: j(-0.9, 0.1, 0), foreR: j(-0.9), weapon: j(0.6), armL: j(-2.0, 0, -0.1), foreL: j(-0.3), weaponL: j(0.1, 0, 0.3 * d), chest: j(0, 0.4 * d, 0) }, lunge(0.7)), "smooth"],
  [0.78, K({ armR: j(-1.0, 0, 0), foreR: j(-0.9), weapon: j(0.6), armL: j(-0.3, 0, 0), foreL: j(0), weaponL: j(0.9, 0, -0.3 * d), chest: j(0.3, -0.7 * d, 0.2 * d), step: 0.22 }, lunge()), "snap"],
  [0.92, K({ armR: j(-1.0), foreR: j(-0.8), weapon: j(0.6), armL: j(-0.4), weaponL: j(0.9, 0, -0.2 * d), chest: j(0.2, -0.5 * d, 0), step: 0.22 }, lunge(0.8)), "out"],
], { hit: 1, stop: 0.03 });
// Both blades thrust together
export const doubleThrust = (dur = 0.46): Move => mv("double thrust", "light", dur, [
  [0.32, K({ armR: j(-0.8, 0.1, 0), foreR: j(-1.1), weapon: j(1.5), armL: j(-0.8, -0.1, 0), foreL: j(-1.1), weaponL: j(1.5), chest: j(-0.05) }, load())],
  [0.52, K({ armR: j(-1.45, 0.15, 0), foreR: j(0.05), weapon: j(1.5), armL: j(-1.45, -0.15, 0), foreL: j(0.05), weaponL: j(1.5), chest: j(0.3), step: 0.3 }, lunge(1.3)), "snap"],
  [0.82, K({ armR: j(-1.4, 0.15, 0), weapon: j(1.5), armL: j(-1.4, -0.15, 0), weaponL: j(1.5), chest: j(0.26), step: 0.3 }, lunge(1.2)), "out"],
]);
// A spring and a turn in the air, a blade cutting each way
export const spinCut = (d: number, dur = 0.88): Move => mv("spin cut", "leap", dur, [
  [0.2, K({ armR: j(-0.5, 0.3, 0.2), foreR: j(-0.4), weapon: j(0.7), armL: j(-0.5, -0.3, -0.2), foreL: j(-0.4), weaponL: j(0.7), chest: j(0.4, -0.4 * d, 0), spin: 0 }, deep())],
  [0.46, K({ armR: j(-1.5, 0, 0.5), foreR: j(-0.1), weapon: j(0.9), armL: j(-1.5, 0, -0.5), foreL: j(-0.1), weaponL: j(0.9), chest: j(0.1, 0.4 * d, 0), lift: 0.5, spin: Math.PI * d, step: 0.2 }, tuck()), "out"],
  [0.68, K({ armR: j(-1.35, -0.3, 0), weapon: j(0.9), armL: j(-1.35, 0.3, 0), weaponL: j(0.9), chest: j(0.25), lift: 0, spin: Math.PI * 2 * d, step: 0.45 }, lunge()), "snap"],
  [0.92, K({ armR: j(-1.2), weapon: j(0.8), armL: j(-1.2), weaponL: j(0.8), spin: Math.PI * 2 * d, step: 0.45 }, lunge(0.8)), "out"],
]);
// Crouched, both blades swept low as the body winds round
export const lowSpin = (d: number, dur = 0.72): Move => mv("low spin", "low", dur, [
  [0.3, K({ armR: j(-0.3, 0.4, 0.4), foreR: j(-0.2), weapon: j(0.6), armL: j(-0.3, -0.4, -0.4), foreL: j(-0.2), weaponL: j(0.6), chest: j(0.6, -1.0 * d, 0), spin: 0 }, deep())],
  [0.6, K({ armR: j(-0.3, 0.4, 0.4), weapon: j(0.6), armL: j(-0.3, -0.4, -0.4), weaponL: j(0.6), chest: j(0.6, 1.2 * d, 0), spin: Math.PI * 2 * d, step: 0.1 }, deep()), "snap"],
  [0.86, K({ armR: j(-0.3), weapon: j(0.6), armL: j(-0.3), weaponL: j(0.6), chest: j(0.5, 1.0 * d, 0), spin: Math.PI * 2 * d }, deep()), "out"],
]);
// One blade up to take a blow (the left, turned over in the hand), the other cutting across it
export const guardCut = (d: number, dur = 0.62): Move => mv("guard cut", "guard", dur, [
  [0.24, K({ armL: j(-1.4, -0.3, -0.3), foreL: j(-0.6), weaponL: j(Math.PI - 0.2, 0, -0.4), armR: j(-1.7, 0.2, 0), foreR: j(-0.4), weapon: j(0.2, 0, -0.35 * d), chest: j(0, -0.3 * d, 0) }, rear())],
  [0.5, K({ armL: j(-1.4, -0.3, -0.3), foreL: j(-0.6), weaponL: j(Math.PI - 0.2, 0, -0.4), armR: j(-0.3), foreR: j(0), weapon: j(0.9, 0, 0.35 * d), chest: j(0.3, 0.8 * d, -0.1 * d), step: 0.18 }, lunge()), "snap"],
  [0.8, K({ armL: j(-1.2, -0.3, -0.3), foreL: j(-0.6), weaponL: j(Math.PI - 0.2, 0, -0.4), armR: j(-0.4), weapon: j(1.0, 0, 0.3 * d), chest: j(0.25, 0.7 * d, 0), step: 0.18 }, lunge(0.8)), "out"],
]);
// The left hand's blade whirled in the fingers and caught turned over, then a lunge with it from behind
export const reverseStab = (dur = 0.7): Move => mv("reverse stab", "light", dur, [
  [0.26, K({ armR: j(-1.2, 0.2, 0), foreR: j(-0.5), weapon: j(0.8), armL: j(-1.0, -0.2, -0.2), foreL: j(-0.8), weaponL: j(0.6 + Math.PI * 2), chest: j(0, 0.3, 0) }, rear())],
  [0.5, K({ armR: j(-1.2, 0.2, 0), foreR: j(-0.5), weapon: j(0.8), armL: j(-0.6, -0.2, -0.2), foreL: j(-1.2), weaponL: j(Math.PI + 0.6), chest: j(0, 0.3, 0) }, rear()), "smooth"],
  [0.68, K({ armR: j(-1.2, 0.2, 0), foreR: j(-0.5), weapon: j(0.8), armL: j(-0.2, -0.1, -0.1), foreL: j(-0.2), weaponL: j(Math.PI + 0.9), chest: j(0.3, -0.5, 0), step: 0.3 }, lunge(1.3)), "snap"],
  [0.9, K({ armR: j(-1.1), foreR: j(-0.5), weapon: j(0.8), armL: j(-0.3), weaponL: j(Math.PI + 0.9), chest: j(0.25, -0.4, 0), step: 0.3 }, lunge(1.2)), "out"],
]);

// Spinning on the spot with a blade out to each side at arm's length, the body off the ground at the top of it
export const whirlwind = (d = 1, turns = 2, dur = 0.62 + 0.3 * turns): Move => mv("whirlwind", "spin", dur, [
  [0.2, K({ armR: j(-0.6, 0, -1.2), foreR: j(-0.1), weapon: j(0.9), armL: j(-0.6, 0, 1.2), foreL: j(-0.1), weaponL: j(0.9), chest: j(0.1, -0.5 * d, 0), spin: 0 }, wide())],
  [0.7, K({ armR: j(-0.6, 0, -1.2), foreR: j(-0.1), weapon: j(0.9), armL: j(-0.6, 0, 1.2), foreL: j(-0.1), weaponL: j(0.9), chest: j(0.1, 0.5 * d, 0), spin: Math.PI * 2 * turns * d, lift: 0.1, step: 0.15 }, wide()), "snap"],
  [0.92, K({ armR: j(-1.2, 0.1, -0.2), foreR: j(-0.2), weapon: j(0.9), armL: j(-1.2, -0.1, 0.2), foreL: j(-0.2), weaponL: j(0.9), chest: j(0.25), spin: Math.PI * 2 * turns * d, step: 0.2 }, lunge(0.7)), "out"],
], { hit: 1, stop: 0.03 });

// ---- The moves of a whip (a lightwhip: the lash follows the hand; humanPose bends it by where the hand has been) ---------------------------------

// The arm hauled back over the shoulder and the lash laid down in front: a crack at the end of it
export const lashOver = (d = 1, dur = 0.74): Move => mv("lash", "light", dur, [
  [0.3, K({ armR: j(-2.5, 0.2 * d, 0), foreR: j(-0.7), weapon: j(-0.3), chest: j(-0.2, -0.5 * d, 0), head: j(-0.1, 0.3 * d, 0) }, load())],
  [0.46, K({ armR: j(-1.25, 0, 0), foreR: j(0.0), weapon: j(0.45), chest: j(0.2, 0.4 * d, 0), step: 0.18 }, lunge(0.9)), "snap"],
  [0.82, K({ armR: j(-0.9), foreR: j(-0.1), weapon: j(0.6), chest: j(0.15, 0.2 * d, 0), step: 0.18 }, lunge(0.7)), "out"],
], { stop: 0.02 });
// A cut from the side, flat, the lash wrapping round
export const lashSide = (d = 1, dur = 0.7): Move => mv("side lash", "light", dur, [
  [0.3, K({ armR: j(-1.4, 0.4 * d, 0), foreR: j(-0.3), weapon: j(0.6), chest: j(0.0, -1.0 * d, 0.1 * d), head: j(0, 0.7 * d, 0) }, wide())],
  [0.5, K({ armR: j(-1.35), foreR: j(0), weapon: j(0.7), chest: j(0.1, 1.1 * d, -0.1 * d), head: j(0, -0.6 * d, 0), step: 0.12 }, lunge(0.6)), "snap"],
  [0.84, K({ armR: j(-1.2), weapon: j(0.7), chest: j(0.1, 0.8 * d, 0), step: 0.12 }, lunge(0.5)), "out"],
], { stop: 0.02 });
// The whip whirled round the head, then brought down with the weight of the body: heavy
export const lashCircle = (d = 1, dur = 1.0): Move => mv("whirl lash", "heavy", dur, [
  [0.2, K({ armR: j(-2.5, 0, 0.2 * d), foreR: j(-0.8), weapon: j(-0.5, 0, 0), chest: j(-0.15, -0.3 * d, 0) }, rear())],
  [0.5, K({ armR: j(-2.6, 0, 0.2 * d), foreR: j(-0.8), weapon: j(-0.5, 0, -Math.PI * 4 * d), chest: j(-0.15, 0.3 * d, 0), lift: 0.04 }, rear())],
  [0.66, K({ armR: j(-1.3), foreR: j(0), weapon: j(0.5), chest: j(0.35, 0.3 * d, 0), step: 0.3 }, lunge(1.1)), "snap"],
  [0.9, K({ armR: j(-0.9), foreR: j(-0.1), weapon: j(0.6), chest: j(0.25, 0.2 * d, 0), step: 0.3 }, lunge(0.9)), "out"],
], { stop: 0.04 });
// Low, at the legs, crouched
export const lashLow = (d = 1, dur = 0.66): Move => mv("low lash", "low", dur, [
  [0.3, K({ armR: j(-0.8, 0.5 * d, 0), foreR: j(-0.3), weapon: j(0.8), chest: j(0.5, -0.9 * d, 0), head: j(-0.3, 0.6 * d, 0) }, deep())],
  [0.54, K({ armR: j(-0.6), foreR: j(0), weapon: j(1.1), chest: j(0.55, 1.0 * d, 0), head: j(-0.3, -0.5 * d, 0), step: 0.1 }, deep()), "snap"],
  [0.84, K({ armR: j(-0.5), weapon: j(1.0), chest: j(0.5, 0.8 * d, 0), step: 0.1 }, deep()), "out"],
], { stop: 0.02 });
// A spring and a lash from the top of it, the lash trailing
export const lashLeap = (d = 1, dur = 0.82): Move => mv("leap lash", "leap", dur, [
  [0.2, K({ armR: j(-0.6), foreR: j(-0.3), weapon: j(0.6), chest: j(0.4, 0, 0) }, deep())],
  [0.42, K({ armR: j(-2.5, 0, 0.1 * d), foreR: j(-0.8), weapon: j(-0.4), chest: j(-0.2, -0.4 * d, 0), lift: 0.55, step: 0.25 }, tuck()), "out"],
  [0.6, K({ armR: j(-1.2), foreR: j(0), weapon: j(0.5), chest: j(0.3, 0.5 * d, 0), lift: 0.1, step: 0.5 }, lunge()), "snap"],
  [0.86, K({ armR: j(-0.9), weapon: j(0.6), chest: j(0.2, 0.3 * d, 0), step: 0.5 }, lunge(0.8)), "out"],
], { stop: 0.02 });
// The lash thrown out and drawn in, taking what it has caught (the free hand pulls, too)
export const lashPull = (dur = 0.8): Move => mv("lash and pull", "force", dur, [
  [0.26, K({ armR: j(-1.3), foreR: j(0), weapon: j(0.45), armL: j(-1.4, -0.3, 0), foreL: j(0), chest: j(0.15, 0.2, 0), step: 0.1 }, lunge(0.8))],
  [0.62, K({ armR: j(-0.6), foreR: j(-1.4), weapon: j(0.7), armL: j(-0.5, 0.2, 0.2), foreL: j(-2.0), chest: j(-0.2, 0.25, 0), step: -0.12 }, rear()), "snap"],
  [0.88, K({ armR: j(-0.7), foreR: j(-1.2), weapon: j(0.7), armL: j(-0.55), foreL: j(-1.9), chest: j(-0.1, 0.2, 0), step: -0.12 }, rear()), "out"],
]);

// Turning on the spot with the arm out and the lash flying level behind the hand all the way round, the crack at the end of it
export const lashSpin = (d = 1, turns = 1, dur = 0.74 + 0.3 * (turns - 1)): Move => mv("whirling lash", "spin", dur, [
  [0.22, K({ armR: j(-1.35, 0, -0.5), foreR: j(-0.1), weapon: j(1.7), chest: j(0.05, -0.8 * d, 0), head: j(0, 0.5 * d, 0), spin: 0 }, wide())],
  [0.66, K({ armR: j(-1.35, 0, -0.5), foreR: j(-0.05), weapon: j(1.7), chest: j(0.05, 0.4 * d, 0), spin: Math.PI * 2 * turns * d, step: 0.1 }, wide()), "snap"],
  [0.9, K({ armR: j(-1.0), foreR: j(-0.1), weapon: j(1.0), chest: j(0.2, 0.3 * d, 0), spin: Math.PI * 2 * turns * d, step: 0.12 }, lunge(0.6)), "out"],
], { hit: 1, stop: 0.02 });

// ---- A crossguard's own (Kylo Ren's): the Ox guard, wild hacks, a shoulder charge -----------------------------------------------------------

// A blow that is more fury than fencing: the blade up on the shoulder, hacked down and across, the whole body thrown behind it
export const hack = (d: number, dur = 0.68): Move => mv("hack", "heavy", dur, [
  [0.3, K({ arms: -1.9, fores: -0.9, chest: j(-0.15, -0.9 * d, 0.25 * d), weapon: j(-0.2, 0, -0.5 * d), head: j(0, 0.5 * d, 0) }, load())],
  [0.38, K({ arms: -1.9, fores: -0.9, chest: j(-0.15, -0.95 * d, 0.25 * d), weapon: j(-0.2, 0, -0.5 * d), head: j(0, 0.5 * d, 0) }, load())],
  [0.58, K({ arms: -0.3, fores: 0, chest: j(0.5, 1.0 * d, -0.3 * d), weapon: j(0.95, 0, 0.45 * d), head: j(0, -0.6 * d, 0), step: 0.28 }, lunge(1.1)), "snap"],
  [0.86, K({ arms: -0.2, chest: j(0.4, 1.1 * d, -0.25 * d), weapon: j(1.0, 0, 0.4 * d), step: 0.3 }, lunge(1.0)), "out"],
], { stop: 0.1 });
// Shoulder first into the foe, the blade held back, then out of it
export const charge = (dur = 0.7): Move => mv("charge", "heavy", dur, [
  [0.3, K({ arms: -1.6, fores: -1.0, chest: j(-0.1, 0.7, 0.1), weapon: j(-0.3, 0, 0.2), head: j(0, -0.5, 0) }, rear())],
  [0.52, K({ arms: -1.4, fores: -0.9, chest: j(0.45, -0.5, -0.1), weapon: j(-0.2, 0, 0.1), head: j(0.1, 0.3, 0), step: 0.4 }, lunge(1.4)), "snap"],
  [0.84, K({ arms: -1.4, fores: -0.9, chest: j(0.4, -0.4, 0), weapon: j(-0.2), step: 0.4 }, lunge(1.2)), "out"],
], { stop: 0.08 });

// ---- Guards -----------------------------------------------------------------------------------------------------------------------------

const STANCE = { legL: j(-0.32), legR: j(0.22), shinL: j(0.3), shinR: j(0.35) };
// A blade held up against bolts and blows: across the front, angled, moving a little to meet them
export const BLOCK: Key = { arms: -1.25, fores: -0.35, weapon: j(-0.15, 0, 0.9), chest: j(0, 0.25, 0), head: j(0, -0.2, 0) };

// The ways of holding a single saber, by form (the stances of the forms of the books)
const GUARD: Record<SaberStyle, Key> = {
  shiicho: { ...STANCE, arms: -0.4, chest: j(0.04, 0.12) },
  makashi: { legR: j(-0.28), legL: j(0.18), shinR: j(0.2), shinL: j(0.25), armR: j(-0.95, 0.2), foreR: j(-0.15), weapon: j(0.95), armL: j(0.55, 0, 0.35), foreL: j(-1.5), chest: j(0, -0.7), head: j(0, 0.6) },
  soresu: { ...STANCE, shinL: j(0.55), shinR: j(0.6), arms: -0.6, fores: -0.45, weapon: j(-0.3, 0, 0.25), chest: j(0.08, 0.32), head: j(0, -0.25) },
  ataru: { ...STANCE, arms: -1.65, weapon: j(0.15, 0, -0.2), chest: j(0, 0.45), head: j(0, -0.4) },
  shien: { ...STANCE, arms: -1.15, weapon: j(-1.25), chest: j(0, 0.6), head: j(0, -0.5) },
  djemso: { ...STANCE, arms: -1.35, weapon: j(-0.3), chest: j(0.02, 0.48), head: j(0, -0.4) },
  niman: { ...STANCE, arms: -0.25, weapon: j(0.4), chest: j(0, 0.15) },
  juyo: { ...STANCE, shinL: j(0.7), shinR: j(0.8), legL: j(-0.5), arms: 0.15, weapon: j(1.65), chest: j(0.32, 0.25), head: j(-0.25, -0.2) },
  jarkai: { ...STANCE, arms: -0.75, weapon: j(0.2, 0, 0.3), chest: j(0, 0.05) },
  trakata: { ...STANCE, arms: -0.3, weapon: j(0.3), chest: j(0, 0.2) },
  sokan: { ...STANCE, arms: -0.6, weapon: j(0.5), chest: j(0.06, 0.3) },
};

// What the form favours: the family of combos it reaches for
export type Flavour = "basic" | "duel" | "guard" | "acro" | "power" | "fury";
export const FLAVOUR: Record<SaberStyle, Flavour> = { shiicho: "basic", niman: "basic", makashi: "duel", jarkai: "duel", soresu: "guard", ataru: "acro", trakata: "acro", sokan: "acro", shien: "power", djemso: "power", juyo: "fury" };
// How quick it is (a multiple of every move's time): Juyo and Ataru fast, Djem So and Shien measured, the rest as they are
export const TEMPO: Record<SaberStyle, number> = { shiicho: 1, niman: 1, makashi: 0.88, jarkai: 0.85, soresu: 1.05, ataru: 0.85, trakata: 0.82, sokan: 0.92, shien: 1.08, djemso: 1.18, juyo: 0.8 };
const ONE_HAND: ReadonlySet<SaberStyle> = new Set(["makashi"]);

// A combo: its moves in turn, for the families that would reach for it. They run from three moves to ten (2026-11-04, the user: "longer combos of up
// to 10 different strikes in succession"): the short ones are an exchange, the long ones a flurry that wears a defender down
interface Combo { tags: Flavour[]; moves: Move[] }
const heavier = (m: Move, k = 1.35): Move => ({ ...m, dur: m.dur * k, stop: m.stop * 2, kind: m.kind === "light" ? "heavy" : m.kind });

// The combos of a single blade, one or two hands, by what the forms favour. Each starts where the last ended (a chain)
const SINGLE: Combo[] = [
  // plain (Shii-Cho, Niman): honest cuts, a thrust, a sweep, and a turn of the whole body to finish
  { tags: ["basic"], moves: [cut(1), cut(-1), thrust(), parry(1), rising(1), sweepH(-1), flick(), cut(1, 0.5), pirouette(1), overhead(0.6)] },
  { tags: ["basic"], moves: [sweepH(1), sweepH(-1), overhead(0.4), parry(-1), thrust(), cut(1), cut(-1), whirlHead(1, 1), cut(1, 0.6)] },
  { tags: ["basic", "guard"], moves: [cut(-1), parry(1), cut(1), thrust()] },
  // the dueller's (Makashi, Jar'Kai): the point, small quick cuts, the blade taken aside and the thrust that follows
  { tags: ["duel"], moves: [thrust(), flick(), cut(1), parry(-1), thrust(), flick(), parry(1, "high"), thrust(), pirouette(-1), flick()] },
  { tags: ["duel"], moves: [flick(), parry(1, "high"), thrust(), parry(-1), flick()] },
  { tags: ["duel", "guard"], moves: [parry(-1), thrust(), parry(1, "mid"), cut(1), flick(), lowThrust(), rising(-1), pull()] },
  // the guard's (Soresu): everything met first, then answered, and the Force for the foe who will not give way
  { tags: ["guard"], moves: [parry(1), cut(1), parry(-1), thrust(), parry(1, "high"), rising(1), push(), parry(1, "low"), cut(-1), pirouette(1)] },
  { tags: ["guard"], moves: [parry(1, "low"), rising(1), parry(-1, "high"), cut(-1), push()] },
  // the acrobat's (Ataru, Trakata, Sokan): leaps and flips, a low sweep between them, the body turned over the foe
  { tags: ["acro"], moves: [leapSlam(), flipCut(1), cut(-1), vaultCut(1), springCut(-1), pirouette(1), flipCut(-1), lowSweep(1), rising(1), whirlHead(-1)] },
  { tags: ["acro"], moves: [vaultCut(1), flipCut(-1), rising(1), pull(), springCut(1), cut(-1)] },
  { tags: ["acro", "fury"], moves: [springCut(1), flipCut(1), lowSweep(-1), cut(1), pirouette(-1, 2)] },
  // the powerful (Djem So, Shien): each blow felt, the blade brought down from above, the ground driven into at the end
  { tags: ["power"], moves: [overhead(0.8), cleave(1), smash(), parry(1), cut(1, 0.7), cut(-1, 0.7), push(), overhead(1), cleave(-1)] },
  { tags: ["power"], moves: [cut(1, 0.7), cut(-1, 0.7), push(), overhead(1)] },
  { tags: ["power", "guard"], moves: [parry(1), rising(1, 0.7), cleave(-1), pirouette(1, 1, 1), smash()] },
  // the furious (Juyo, Vaapad): one blow on the heels of another, low and high, a turn or two, the Force hauling the foe in
  { tags: ["fury"], moves: [rising(1), cut(-1), lowSweep(1), flipCut(1), cut(1), pull(), cut(-1), pirouette(1, 2), overhead(1), smash()] },
  { tags: ["fury"], moves: [lowSweep(-1), springCut(1), cut(1), sweepH(-1, 0, Math.PI * 2)] },
  { tags: ["fury"], moves: [cut(1), cut(-1), cut(1), pull(), smash()] },
];
// A heavy blade's (a broadsaber, a claymore, a great-saber): every blow is felt, and nothing is quick
const BROAD: Combo[] = [
  { tags: ["basic", "duel"], moves: [cut(1), heavier(cut(-1, 0.6)), overhead(1), parry(1, "mid", 0.6), thrust(), heavier(rising(1)), heavier(pirouette(1, 1, 1), 1.1), cleave(-1)] },
  { tags: ["basic", "guard"], moves: [parry(1, "mid", 0.6), heavier(cut(1, 0.6)), cleave(-1)] },
  { tags: ["guard", "duel"], moves: [parry(1, "high", 0.6), thrust(), parry(-1, "mid", 0.6), overhead(0.8), push(), heavier(cut(1, 0.6)), parry(1, "low", 0.6), rising(-1)] },
  { tags: ["power"], moves: [overhead(1), cleave(1), smash(), parry(1, "mid", 0.6), heavier(pirouette(1, 1, 1), 1.1), cleave(-1), overhead(1), push(), heavier(cut(1, 0.8)), smash()] },
  { tags: ["power", "basic"], moves: [cleave(1), cleave(-1), push(), overhead(1)] },
  { tags: ["acro"], moves: [leapSlam(), heavier(flipCut(1, 1.0), 1.15), smash(), heavier(vaultCut(-1)), cleave(1), heavier(pirouette(-1, 1, 1), 1.1), leapSlam()] },
  { tags: ["acro", "fury"], moves: [heavier(vaultCut(1)), cleave(-1), leapSlam(), pull(), heavier(rising(1)), overhead(1), heavier(pirouette(1, 2, 1), 1.05), smash()] },
  { tags: ["fury"], moves: [heavier(lowSweep(1)), rising(1), cleave(-1), smash(), heavier(cut(1, 0.8)), pull(), heavier(whirlHead(1, 2), 1.15), overhead(1)] },
  { tags: ["fury", "power"], moves: [overhead(1), heavier(cut(1, 0.8)), heavier(cut(-1, 0.8)), pull(), smash()] },
];
// A crossguard's (the Ox guard: the blade up at the shoulder; hacks, a shoulder charge, the Force flung out between blows)
const CROSSGUARD: Combo[] = [
  { tags: ["basic", "power"], moves: [hack(1), hack(-1), overhead(0.9), charge(), hack(1), push(), hack(-1), pirouette(1, 1, 1), hack(1), smash()] },
  { tags: ["basic", "duel"], moves: [flick(), hack(-1), charge(), hack(1), thrust(), parry(1, "high", 0.6), hack(-1), whirlHead(1, 1)] },
  { tags: ["power", "duel"], moves: [overhead(1), push(), hack(1), smash()] },
  { tags: ["power"], moves: [hack(1), cleave(-1), overhead(1), pirouette(-1, 1, 1), hack(1), hack(-1)] },
  { tags: ["guard", "duel"], moves: [parry(1, "high", 0.6), thrust(), charge(), hack(1), parry(-1, "mid", 0.6), hack(-1), push(), overhead(0.9)] },
  { tags: ["guard"], moves: [parry(-1, "mid", 0.6), hack(1), parry(1, "high", 0.6), overhead(0.9), pirouette(1, 1, 1), hack(-1)] },
  { tags: ["acro", "duel"], moves: [leapSlam(), hack(-1), push(), hack(1), vaultCut(1), hack(-1), pirouette(1, 2, 1), overhead(1)] },
  { tags: ["acro", "fury"], moves: [vaultCut(-1), hack(1), pull(), hack(-1), leapSlam(), hack(1)] },
  { tags: ["fury"], moves: [hack(1), thrust(), lowSweep(1), hack(-1), smash(), pull(), hack(1), whirlHead(-1, 2), hack(-1), overhead(1)] },
  { tags: ["fury"], moves: [charge(), hack(1), pull(), overhead(1)] },
];
// A double blade's (a staff: Darth Maul's): spins and long cuts, the free hand letting go, a leap with the whole staff round the body
const STAFF: Combo[] = [
  { tags: ["basic"], moves: [staffCut(1), staffCut(-1), windmill(1), staffThrust(), staffGuard(), staffCut(1, 1), staffLow(-1), push(), staffCut(-1), staffSlam()] },
  { tags: ["basic", "duel"], moves: [staffCut(-1), staffThrust(), staffCut(1), windmill(-1), staffThrust(), staffThrust(), staffCut(1)] },
  { tags: ["duel"], moves: [staffThrust(), staffThrust(), windmill(-1), staffCut(1), staffGuard(), staffThrust(), staffCut(-1), windmill(1, 2)] },
  { tags: ["duel", "guard"], moves: [staffGuard(), staffThrust(), staffGuard(), staffCut(-1)] },
  { tags: ["guard"], moves: [staffGuard(), staffCut(1), staffGuard(), staffThrust(), push(), staffGuard(), staffCut(-1), windmill(1), staffLow(1), staffSlam()] },
  { tags: ["guard", "power"], moves: [staffGuard(), staffCut(1, 0.8), staffSlam()] },
  { tags: ["acro"], moves: [windmill(1, 1), staffVault(1), staffLow(-1), staffCut(1), staffThrust(), windmill(-1, 2), staffVault(-1), staffCut(-1), pull(), staffSlam()] },
  { tags: ["acro"], moves: [staffVault(-1), staffCut(1), windmill(-1, 2), staffVault(1)] },
  { tags: ["power"], moves: [staffSlam(), staffCut(1, 1), staffCut(-1, 1), windmill(1, 2, 1.0), staffGuard(), staffCut(1, 1), push(), staffSlam()] },
  { tags: ["power", "fury"], moves: [staffCut(1, 0.8), push(), staffSlam()] },
  { tags: ["fury"], moves: [windmill(1, 2, 0.9), staffLow(1), staffVault(-1), staffCut(1), staffCut(-1), pull(), windmill(-1, 2, 0.9), staffThrust(), staffVault(1), staffSlam()] },
  { tags: ["fury"], moves: [staffCut(1), staffCut(-1), staffLow(1), staffVault(1), pull()] },
];
// Two blades' (Ahsoka's): crossed cuts and flurries, one blade guarding as the other cuts, a grip turned over, a spin with both out
const DUAL: Combo[] = [
  { tags: ["basic"], moves: [flurry(1), flurry(-1), crossCut(), doubleThrust(), guardCut(1), reverseStab(), flurry(1), whirlwind(1, 1), crossCut(1), smashBoth()] },
  { tags: ["basic", "duel"], moves: [crossCut(), flurry(-1), doubleThrust(), guardCut(-1), flurry(1), reverseStab()] },
  { tags: ["duel"], moves: [doubleThrust(), reverseStab(), flurry(1), guardCut(1), flurry(-1), crossCut(), doubleThrust(), whirlwind(-1, 1)] },
  { tags: ["duel", "guard"], moves: [guardCut(1), guardCut(-1), reverseStab()] },
  { tags: ["guard"], moves: [guardCut(1), crossCut(), guardCut(-1), doubleThrust(), push(), guardCut(1), flurry(-1), reverseStab(), whirlwind(1, 1), crossCut(1)] },
  { tags: ["guard", "power"], moves: [guardCut(1), crossCut(1), push(), guardCut(-1), smashBoth()] },
  { tags: ["acro"], moves: [spinCut(1), flurry(-1), spinCut(-1), whirlwind(1, 2), lowSpin(1), flurry(1), crossCut(), spinCut(1), doubleThrust(), smashBoth()] },
  { tags: ["acro", "fury"], moves: [flurry(1), spinCut(1), lowSpin(-1), whirlwind(-1, 1), flurry(-1), crossCut()] },
  { tags: ["power"], moves: [crossCut(1), crossCut(1), smashBoth(), guardCut(1), whirlwind(1, 1), crossCut(1), push(), smashBoth()] },
  { tags: ["fury"], moves: [flurry(1), lowSpin(1), flurry(-1), spinCut(-1), whirlwind(1, 2), flurry(1), flurry(-1), pull(), crossCut(1), smashBoth()] },
  { tags: ["fury"], moves: [reverseStab(), flurry(1), flurry(-1), pull(), crossCut(1)] },
];
// both blades down together into the ground (a dual's smash)
function smashBoth(): Move {
  return mv("double smash", "heavy", 0.86, [
    [0.3, K({ armR: j(-2.7, 0, 0.35), foreR: j(-0.3), weapon: j(-0.4), armL: j(-2.7, 0, -0.35), foreL: j(-0.3), weaponL: j(-0.4), chest: j(-0.4) }, rear())],
    [0.42, K({ armR: j(-2.7, 0, 0.35), foreR: j(-0.3), weapon: j(-0.4), armL: j(-2.7, 0, -0.35), foreL: j(-0.3), weaponL: j(-0.4), chest: j(-0.45) }, rear())],
    [0.6, K({ armR: j(0.2, 0, 0.2), weapon: j(1.1), armL: j(0.2, 0, -0.2), weaponL: j(1.1), chest: j(0.85), step: 0.25 }, deep()), "snap"],
    [0.88, K({ armR: j(0.15), weapon: j(1.05), armL: j(0.15), weaponL: j(1.05), chest: j(0.75), step: 0.25 }, deep()), "out"],
  ], { stop: 0.1 });
}
// A whip's: lashes laid down at range, a spring, the lash whirled round, and the free hand pulling what the lash has caught
const WHIP: Combo[] = [
  { tags: ["basic"], moves: [lashOver(1), lashOver(-1), lashSide(1), lashSide(-1), parry(1, "mid", 0.5), lashOver(1), lashSpin(1), lashLow(-1), lashPull(), lashCircle()] },
  { tags: ["basic", "duel"], moves: [lashSide(1), lashSide(-1), lashOver(1), lashOver(-1), lashSpin(-1), lashSide(1)] },
  { tags: ["duel"], moves: [lashOver(1), lashPull(), lashSide(-1), lashOver(1), lashOver(-1), lashLow(1), lashSpin(1), lashSide(-1)] },
  { tags: ["duel", "guard"], moves: [lashSide(-1), parry(1, "mid", 0.5), lashOver(1)] },
  { tags: ["guard"], moves: [parry(1), lashOver(1), parry(-1, "high"), lashSide(1), lashPull(), parry(1, "low"), lashLow(-1), lashOver(1), lashSpin(-1), lashCircle(-1)] },
  { tags: ["guard", "power"], moves: [parry(1), lashPull(), lashCircle(), parry(-1), lashSpin(1)] },
  { tags: ["acro"], moves: [lashLeap(1), lashSide(-1), lashLeap(-1), lashSpin(1, 2), lashLow(1), lashSide(1), lashLeap(1), lashOver(-1), lashPull(), lashCircle()] },
  { tags: ["acro", "fury"], moves: [lashSide(1), lashLeap(1), lashLow(-1), lashSpin(-1), lashOver(1)] },
  { tags: ["power"], moves: [lashCircle(1), lashPull(), lashCircle(-1), lashSpin(1, 2), lashOver(1), lashPull(), lashCircle(1)] },
  { tags: ["fury"], moves: [lashOver(1), lashOver(-1), lashLow(1), lashLeap(-1), lashSide(1), lashSide(-1), lashSpin(1, 2), lashPull(), lashOver(1), lashCircle(-1)] },
  { tags: ["fury"], moves: [lashLow(-1), lashSide(1), lashSide(-1), lashCircle(1)] },
];

const COMBOS: Record<SaberKit, Combo[]> = { single: SINGLE, broad: BROAD, crossguard: CROSSGUARD, staff: STAFF, dual: DUAL, whip: WHIP };

// How each weapon is held (a guard of its own: what the form says is laid over it where the form has a say)
const KIT_GUARD: Record<Exclude<SaberKit, "single">, Key> = {
  // wide-footed, the blade low and ready, both hands on the grip, the weight forward
  broad: { ...wide(), arms: -0.85, fores: -0.3, weapon: j(0.2), chest: j(0.06, 0.3) },
  // the Ox: hands at the shoulder, the blade standing up beside the head, a wide base
  crossguard: { ...wide(), arms: -1.5, fores: -1.0, weapon: j(-0.15, 0, 0.1), chest: j(0, 0.5), head: j(0, -0.35) },
  // the staff across the body, the front hand light on it, the feet wide and low
  staff: { ...wide(), arms: -0.95, fores: -0.5, weapon: sj(-0.2, 0, 0.1), chest: j(0, 0.4), head: j(0, -0.3), shinL: j(0.65), shinR: j(0.7) },
  // each blade angled out from its hand, the body low between them
  dual: { ...wide(), shinL: j(0.6), shinR: j(0.65), armR: j(-1.05, 0.25, 0.1), foreR: j(-0.6), weapon: j(0.65, 0, 0.25), armL: j(-0.9, -0.2, -0.1), foreL: j(-0.7), weaponL: j(0.65, 0, -0.25), chest: j(0.04, 0.1) },
  // side on, the lash hand forward and the other held back for balance
  whip: { legR: j(-0.28), legL: j(0.18), shinR: j(0.3), shinL: j(0.3), armR: j(0.0, 0.3, -0.3), foreR: j(-0.55), weapon: j(1.5), armL: j(0.35, 0, 0.5), foreL: j(-0.7), chest: j(0, -0.6), head: j(0, 0.5) },
};
const KIT_BLOCK: Partial<Record<SaberKit, Key>> = {
  broad: { arms: -1.3, fores: -0.45, weapon: j(-0.2, 0, 1.0), chest: j(0, 0.3) },
  crossguard: { arms: -1.7, fores: -0.8, weapon: j(-0.5, 0, 0.7), chest: j(0, 0.35), head: j(0, -0.3) },
  staff: { arms: -1.1, fores: -0.5, weapon: sj(-0.6, 0, 0.2), chest: j(0, 0.3) },
  dual: { armR: j(-1.4, 0.3, 0.4), foreR: j(-0.4), weapon: j(0.1, 0, 0.8), armL: j(-1.4, -0.3, -0.4), foreL: j(-0.4), weaponL: j(0.1, 0, -0.8), chest: j(0, 0.1) },
  whip: { armR: j(-1.6, 0.2, 0), foreR: j(-0.5), weapon: j(-0.2, 0, 0.7), chest: j(0, -0.3) },
};

// What a weapon and a form give: the guard, the guard against blows, the pace and the combos the form reaches for (those of the weapon for its
// family, or all of them)
const SETS = new Map<string, Style>();
export function styleFor(kit: SaberKit, style: SaberStyle): Style {
  const key = `${kit}:${style}`;
  const had = SETS.get(key);
  if (had) return had;
  const flavour = FLAVOUR[style];
  const all = COMBOS[kit];
  const picked = all.filter((c) => c.tags.includes(flavour));
  const combos = (picked.length ? picked : all).map((c) => c.moves);
  const built: Style = kit === "single"
    ? { guard: GUARD[style], combos, oneHand: ONE_HAND.has(style), block: style === "soresu" ? { arms: -1.2, fores: -0.3, weapon: j(-0.2, 0, 0.95), chest: j(0, 0.2) } : undefined, tempo: TEMPO[style] * PACE }
    : { guard: kitGuard(kit, style), combos, oneHand: kit === "dual" || kit === "whip" ? true : false, block: KIT_BLOCK[kit], tempo: TEMPO[style] * PACE * (kit === "broad" ? 1.1 : kit === "crossguard" ? 1.12 : 1), offHand: kit === "dual" };
  SETS.set(key, built);
  return built;
}
// The weapon's guard, the form's footing and chest turn laid over it where the weapon leaves them free
function kitGuard(kit: Exclude<SaberKit, "single">, style: SaberStyle): Key {
  const base = KIT_GUARD[kit];
  const form = GUARD[style];
  // (a crouching form keeps its low knees, a forward one its lean; the weapon keeps its arms)
  return { ...base, shinL: form.shinL && kit !== "staff" ? j(Math.max(base.shinL?.[0] ?? 0, form.shinL[0])) : base.shinL, shinR: form.shinR && kit !== "staff" ? j(Math.max(base.shinR?.[0] ?? 0, form.shinR[0])) : base.shinR };
}

// The melee weapons that are no saber: a vibroblade or axe, and a pole
export const MELEE: Style = { oneHand: true, tempo: PACE, guard: { ...STANCE, armR: j(-0.85, 0.15), foreR: j(-0.8), weapon: j(0.2), armL: j(-0.45, 0, -0.2), foreL: j(-0.9), chest: j(0, 0.25) }, combos: [[overhead(0.5), sweepH(1), thrust()]] };
export const POLE: Style = { oneHand: true, tempo: PACE, guard: { ...STANCE, armR: j(-0.6, 0.1), foreR: j(-0.7), weapon: j(0.95), armL: j(-0.95, -0.3), foreL: j(-0.6), chest: j(0, 0.3) }, combos: [[thrust(0.4), sweepH(1), overhead(0.5)]] };

// ---- The chain: which move a figure is at ---------------------------------------------------------------------------------------------------

// What a figure says of its swings (limbs.ts `Motion`): when the last began, how many there have been, which move of its combo it is on (`chain`),
// which combo it is on (`combo`: it moves to the next when a pause has let the last one end) and when the swing before began
export interface Swinging { swingAt: number; swing: number; chain?: number; combo?: number; prevAt?: number }
// Swings closer together than this (seconds from the start of one to the start of the next) are one combo
export const COMBO_GAP = 1.5;
// A swing begins now: the next move of the combo, or the first of the next one
export function beginSwing(m: Swinging, now: number): void {
  const chained = now - m.swingAt < COMBO_GAP && m.swingAt > -50;
  m.prevAt = m.swingAt;
  m.chain = chained ? (m.chain ?? 0) + 1 : 0;
  m.combo = chained ? m.combo ?? 0 : (m.combo ?? -1) + 1;
  m.swingAt = now;
  m.swing++;
}
// The combo and the move a figure is at, `seed` setting where each figure's combos begin (people do not all open the same way)
export function comboOf(set: Style, m: Pick<Swinging, "combo" | "chain">, seed = 0): Move[] {
  const n = set.combos.length;
  return set.combos[(((m.combo ?? 0) + seed) % n + n) % n];
}
export function moveOf(set: Style, m: Pick<Swinging, "combo" | "chain">, back = 0, seed = 0): Move {
  const c = comboOf(set, m, seed);
  const i = (m.chain ?? 0) - back;
  return c[((i % c.length) + c.length) % c.length];
}
// A move's seconds in a form's pace
export const moveSeconds = (set: Style, move: Move): number => move.dur * set.tempo;

// ---- Sampling ---------------------------------------------------------------------------------------------------------------------------

// An angle's difference taken the short way round when it is more than a half turn and a bit (the end of a spin: whole turns are not turned back)
export const wrapTurn = (x: number): number => (Math.abs(x) > Math.PI + 0.3 ? x - Math.PI * 2 * Math.round(x / (Math.PI * 2)) : x);
const smoothK = (v: number) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
const EASE: Record<Ease, (x: number) => number> = { smooth: smoothK, snap: (x) => Math.max(0, Math.min(1, x)) ** 2.3, out: (x) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 2.2, lin: (x) => Math.max(0, Math.min(1, x)) };
// A key as joints: `arms` and `fores` spread over the arms (both in a two-handed grip), keeping the turn the guard gives them about y and z; joints
// named in the key itself win
function jointsOf(key: Key, guard: Joints, oneHand: boolean): Joints {
  const out: Joints = {};
  const set = (jn: Joint, x: number) => { out[jn] = [x, guard[jn]?.[1] ?? 0, guard[jn]?.[2] ?? 0]; };
  if (key.arms !== undefined) { set("armR", key.arms); if (!oneHand) set("armL", key.arms); }
  if (key.fores !== undefined) { set("foreR", key.fores); if (!oneHand) set("foreL", key.fores); }
  for (const jn of JOINTS) if (key[jn]) out[jn] = key[jn];
  return out;
}
export const guardJoints = (set: Style): Joints => {
  const g = jointsOf(set.guard, {}, !!set.oneHand);
  return g;
};
export interface Sample { joints: Joints; lift: number; spin: number; step: number; free: number }
interface Frame { t: number; joints: Joints; lift: number; spin: number; step: number; free: number; ease: Ease }
// Where a move is `u` of the way through (0 to 1): from the guard through its keys and back to the guard, each segment eased as its key says, the
// hold at the blow (`stop`) taken out of the middle. Before it begins, the guard.
export function sampleMove(move: Move, u: number, guard: Joints, oneHand: boolean, stopScale = 1): Sample {
  const hit = move.keys[move.hit];
  const stop = Math.min(0.2, (move.stop * stopScale) / Math.max(0.05, move.dur));
  let v = u;
  if (hit && stop > 0) { const th = hit[0]; v = u <= th ? u : u <= th + stop ? th : th + ((u - th - stop) * (1 - th)) / Math.max(1e-3, 1 - th - stop); }
  const frames: Frame[] = [{ t: 0, joints: guard, lift: 0, spin: 0, step: 0, free: 0, ease: "smooth" }];
  let spin = 0;
  for (const [t, k, e] of move.keys) {
    if (k.spin !== undefined) spin = k.spin;
    frames.push({ t, joints: { ...guard, ...jointsOf(k, guard, oneHand) }, lift: k.lift ?? 0, spin, step: k.step ?? 0, free: k.armL ? 1 : k.free ?? 0, ease: e ?? "smooth" });
  }
  frames.push({ t: 1, joints: guard, lift: 0, spin, step: 0, free: 0, ease: "out" });
  if (v <= 0) return { joints: guard, lift: 0, spin: 0, step: 0, free: 0 };
  let i = 0;
  while (i < frames.length - 2 && v > frames[i + 1].t) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const f = EASE[b.ease]((v - a.t) / Math.max(1e-6, b.t - a.t));
  const joints: Joints = {};
  for (const jn of JOINTS) {
    const x = a.joints[jn];
    const y = b.joints[jn];
    if (!x && !y) continue;
    const p = x ?? ([0, 0, 0] as J3);
    const q = y ?? ([0, 0, 0] as J3);
    const last = i + 1 === frames.length - 1;
    const to = (c: number) => (last ? p[c] + wrapTurn(q[c] - p[c]) : q[c]);
    joints[jn] = [p[0] + (to(0) - p[0]) * f, p[1] + (to(1) - p[1]) * f, p[2] + (to(2) - p[2]) * f];
  }
  return { joints, lift: a.lift + (b.lift - a.lift) * f, spin: v >= 1 ? 0 : a.spin + (b.spin - a.spin) * f, step: a.step + (b.step - a.step) * f, free: a.free + (b.free - a.free) * f };
}

// ---- A duel laid out (the gallery's `saberCombo`: an attacker and a defender, to see each attack and each defence) ---------------------------------

export interface Fighter { kit: SaberKit; style: SaberStyle }
// How the defender answers: parries each blow with a guard move of its own form and weapon (`parry`), stands in its guard (`guard`), takes every blow and
// reels (`hit`), or trades combos with the attacker, each defending while the other attacks (`trade`)
export type DuelMode = "parry" | "guard" | "hit" | "trade";
export const DUEL_MODES: DuelMode[] = ["parry", "guard", "hit", "trade"];
export interface DuelEvent { who: "a" | "d"; move: Move; at: number; prev?: { move: Move; at: number } }
export interface DuelPlan {
  events: DuelEvent[];
  // when a blow lands on someone who does not parry it (or is thrown back by the Force)
  flinches: { who: "a" | "d"; at: number }[];
  // when someone stands in their block
  holds: { who: "a" | "d"; from: number; to: number }[];
  // the blows that land and who answers each: the attacker, the move, when it lands, and the defender's guard move (if there is one) and when it meets it
  exchanges: { who: "a" | "d"; move: Move; hit: number; answer?: { move: Move; at: number } }[];
  length: number;
}

// The guard moves of a style, each once, in the order its combos have them
const guardsOf = (set: Style): Move[] => [...new Set(set.combos.flat().filter((m) => m.kind === "guard"))];
// The combos a duel plays for a fighter: the one asked for, or each in turn
const combosFor = (set: Style, pick?: number): Move[][] => (pick !== undefined && set.combos.length ? [set.combos[((pick % set.combos.length) + set.combos.length) % set.combos.length]] : set.combos);

export function planDuel(a: Fighter, d: Fighter, mode: DuelMode, pick?: number): DuelPlan {
  const sets = { a: styleFor(a.kit, a.style), d: styleFor(d.kit, d.style) };
  const events: DuelEvent[] = [];
  const flinches: DuelPlan["flinches"] = [];
  const holds: DuelPlan["holds"] = [];
  const exchanges: DuelPlan["exchanges"] = [];
  const last: Partial<Record<"a" | "d", DuelEvent>> = {};
  const used = { a: 0, d: 0 };
  const play = (who: "a" | "d", move: Move, at: number) => {
    const p = last[who];
    const ev: DuelEvent = { who, move, at, ...(p && at - p.at < COMBO_GAP ? { prev: { move: p.move, at: p.at } } : {}) };
    events.push(ev);
    last[who] = ev;
    return ev;
  };
  const hitOf = (who: "a" | "d", ev: { move: Move; at: number }) => ev.at + ev.move.keys[ev.move.hit][0] * moveSeconds(sets[who], ev.move);
  // One fighter attacks with a combo from `from`; the other answers each blow as the mode says. Returns when the combo is over
  const attack = (att: "a" | "d", combo: Move[], from: number): number => {
    const def = att === "a" ? "d" : "a";
    let at = from;
    let end = from;
    for (const move of combo) {
      const ev = play(att, move, at);
      const dur = moveSeconds(sets[att], move);
      const hit = hitOf(att, ev);
      end = Math.max(end, at + dur);
      const guards = guardsOf(sets[def]);
      if (mode === "hit" || (mode !== "guard" && (move.kind === "force" || !guards.length))) {
        flinches.push({ who: def, at: hit });
        exchanges.push({ who: att, move, hit });
      } else if (mode !== "guard") {
        // (the answer begins so that its own blow, the meeting of the blades, falls as the attacker's does)
        const g = guards[used[def]++ % guards.length];
        const start = hit - g.keys[g.hit][0] * moveSeconds(sets[def], g);
        const busy = last[def];
        if (!busy || start > busy.at + 0.05) {
          const answer = play(def, g, Math.max(0.05, start));
          exchanges.push({ who: att, move, hit, answer: { move: g, at: hitOf(def, answer) } });
          end = Math.max(end, answer.at + moveSeconds(sets[def], g));
        } else exchanges.push({ who: att, move, hit });
      } else exchanges.push({ who: att, move, hit });
      at += dur * 0.82;
    }
    if (mode === "guard") holds.push({ who: def, from: Math.max(0, from - 0.3), to: end + 0.2 });
    return end;
  };
  let t = 0.6;
  if (mode === "trade") {
    const mine = combosFor(sets.a, pick);
    const theirs = combosFor(sets.d, undefined);
    const rounds = pick !== undefined ? 1 : Math.max(mine.length, theirs.length);
    for (let r = 0; r < rounds; r++) {
      t = attack("a", mine[r % mine.length], t) + 0.25;
      t = attack("d", theirs[r % theirs.length], t) + 0.25;
    }
  } else {
    for (const combo of combosFor(sets.a, pick)) t = attack("a", combo, t) + 1.0;
  }
  events.sort((x, y) => x.at - y.at);
  return { events, flinches, holds, exchanges, length: t + 0.8 };
}
