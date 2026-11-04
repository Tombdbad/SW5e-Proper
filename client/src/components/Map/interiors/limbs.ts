// Moving figures (2026-10-19; gaits for every kind of body 2026-10-26). A figure is baked into one mesh per finish, so its limbs cannot be
// turned by moving parts. Instead every vertex of an animated build carries the limb it belongs to and the point that limb turns about
// (`limb` and `pivot` attributes, written by Kit.limb), and the material turns it in the vertex shader by a rotation per limb (a
// quaternion, so a leg can swing, a wing flap and a ball roll any way): one draw call, however the figure moves. Each moving figure has
// copies of the materials (the rotations are uniforms) that share one compiled program.
//
// The stride follows how far the figure itself moves each frame, so whoever moves the figure (the party, a follower, a stroller in a
// street) moves it without being told. How a body moves is its gait (GAITS): a person or a battle droid walks, a beast trots on four
// legs, a bug on six, a bird flaps, a BB unit rolls its ball under a head that stays level, a droideka rolls up and unfolds on three legs,
// and an astromech, a mouse droid or a slug glides without bobbing. Shadows stay in the pose the figure was built in.
// Pure but for the materials: tests/interiors/limbs.test.ts.
import * as THREE from "three";
import { patchOf, shaderPatch, WAVE_GLSL, WAVE_LIMB } from "../babylon";
import { gunKick } from "@shared/logic/shooter";

// Limbs: 0 the body (still); the legs (front ones on a beast), the arms, a beast's hind and middle legs, a tail, a rolling ball or
// wheel, and wings (right and left by the figure's own sides). A builder marks the parts with Kit.limb.
// A beast (2026-11-04) is jointed a little too: its `chest` carries the neck and, with it, the head (which nods and looks about on its own), the
// head carries the ears (`earR`, `earL`: they flick and lay back) and the lower jaw (`jaw`: it pants and opens), and the tail has a tip (`tail2`)
// that follows the rest of it.
// Knees (2026-11-04, the user: "quadrupeds and bi-peds need knees"): the shin of each leg hangs from its thigh (`shinR`, `shinL` the fore legs'
// and a biped's, `shinHR`, `shinHL` the hind legs', `shinMR`, `shinML` the middle ones': SHIN_OF) and flexes as the leg swings through. A droideka's
// whole body hangs from `roll` (its legs, its chest with the arms and the head), which turns it as a wheel once it has folded onto it.
// The last, `wave`, is no turn at all but a body's undulation (babylon.ts WAVE_GLSL): a serpent's whole length, a lizard's spine and tail, a runner's tail
// are carried sideways by a wave that travels back along them (`setWave`).
// A person (2026-10-30, the user: "the lightsabre just waves with no character arm or body movement at all") is jointed further: the trunk
// above the waist (`chest`, which carries the arms, the head and all worn above it), the forearms below the elbows, the shins below the
// knees, and what the right hand holds (`weapon`, turned at the wrist). These hang one from another (PARENT): a forearm turns about its
// elbow and is then carried by its upper arm, which the chest carries; a shin turns about its knee and then with its thigh.
export const LIMB = { body: 0, legR: 1, legL: 2, armR: 3, armL: 4, hindR: 5, hindL: 6, midR: 7, midL: 8, tail: 9, roll: 10, wingR: 11, wingL: 12, chest: 13, foreR: 14, foreL: 15, shinR: 16, shinL: 17, weapon: 18, head: 19, earR: 20, earL: 21, tail2: 22, jaw: 23, wave: 24, shinHR: 25, shinHL: 26, shinMR: 27, shinML: 28 } as const;
export const LIMBS = 29;
// The limb each one hangs from (-1: from the body itself)
export const PARENT: number[] = [-1, 10, 10, 13, 13, 10, -1, -1, -1, -1, -1, -1, -1, 10, 3, 4, 1, 2, 14, 13, 19, 19, 9, 19, -1, 5, 6, 7, 8];
// The shin of each leg
export const SHIN_OF: Record<number, number> = { [LIMB.legR]: LIMB.shinR, [LIMB.legL]: LIMB.shinL, [LIMB.hindR]: LIMB.shinHR, [LIMB.hindL]: LIMB.shinHL, [LIMB.midR]: LIMB.shinMR, [LIMB.midL]: LIMB.shinML };

// How a stride looks: a leg swings this far forward and back at a walk, an arm a little less, against its leg
const LEG = 0.62;
const ARM = 0.5;
// Squares a second at which the swing is at full, the strides cycled for each square covered (a walk on the map is 3.5 squares a second, which
// came to 3.2 strides a second at one a square, a blur: 2026-11-01, the user) and the quickest a stride is cycled (a run is seven squares a second,
// but a figure's legs do not need to blur)
const FULL = 1.4;
const CYCLES_PER_SQUARE = 0.3;
const MAX_CYCLES = 2.2;

export interface Stride {
  // Where in the cycle (radians), how much of the swing there is now (0 standing, 1 walking), and the speed smoothed over frames
  phase: number;
  amp: number;
  speed: number;
  // (2026-11-04) how fast the speed is changing (squares a second each second, smoothed: a lean into a start and back at a stop) and how fast
  // the figure is turning (radians a second, smoothed: a bank into the turn), with the heading it had last frame
  accel?: number;
  turn?: number;
  heading?: number;
}
export const standing = (): Stride => ({ phase: 0, amp: 0, speed: 0 });

// One frame of a stride for a figure that moved `distance` squares in `dt` seconds. A jump (a figure put somewhere else) is not a walk.
// `cycle` scales how fast the legs go round for the same speed (a beast's long legs go slower, a droideka's three quicker)
export function advance(s: Stride, distance: number, dt: number, cycle = 1, heading?: number): Stride {
  if (dt <= 0) return s;
  const raw = distance / dt;
  const speed = raw > 20 ? 0 : s.speed + (raw - s.speed) * (1 - Math.exp(-dt * 12));
  const accel = (s.accel ?? 0) + ((raw > 20 ? 0 : (speed - s.speed) / dt) - (s.accel ?? 0)) * (1 - Math.exp(-dt * 5));
  // (the heading is where the figure is going; while it stands the last one is kept, and a turn eases away)
  let turn = s.turn ?? 0;
  let kept = s.heading;
  if (heading !== undefined && raw > 0.4 && raw < 20) {
    if (kept !== undefined) {
      let d = heading - kept;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turn += (d / dt - turn) * (1 - Math.exp(-dt * 6));
    }
    kept = heading;
  } else turn *= Math.exp(-dt * 6);
  const target = Math.min(1, speed / FULL);
  const amp = s.amp + (target - s.amp) * (1 - Math.exp(-dt * 10));
  // Standing still, the legs come back to rest rather than freezing mid-stride
  const phase = s.phase + Math.min(speed * CYCLES_PER_SQUARE, MAX_CYCLES) * cycle * dt * Math.PI * 2;
  return { phase, amp, speed, accel, turn, heading: kept };
}

// The angle of each limb of a walker, about the x axis, positive swinging the foot or hand back
export function angles(s: Stride): number[] {
  const swing = Math.sin(s.phase) * s.amp;
  const out = new Array(LIMBS).fill(0);
  out[LIMB.legR] = swing * LEG;
  out[LIMB.legL] = -swing * LEG;
  out[LIMB.armR] = -swing * ARM;
  out[LIMB.armL] = swing * ARM;
  return out;
}
// How far the body rises with each step
export const bob = (s: Stride) => Math.abs(Math.sin(s.phase)) * 0.035 * s.amp;

// ---- Gaits ------------------------------------------------------------------------------------------------------------------------

// How each kind of body moves. `walk`: two legs and two arms (people, battle and protocol droids, brutes, runners); `quad`: four legs in
// diagonal pairs, the tail swaying (beasts); `hexa`: six or eight legs in alternating threes (bugs, spider droids); `wings`: wings that
// beat, faster when it flies on (fliers); `roll`: a ball under a level head (BB units); `droideka`: three legs that step one after another and fold onto a wheel
// (a droideka, which is one model); `glide`: no bob, a lean into a turn (astromechs on their treads, mouse and service droids, slugs, serpents);
// `hover`: floating with a slow rise and fall, tilted into the way it goes (probe droids, spirits)
// `slither` (2026-11-04): a long body carried by a wave, with legs, if it has any, stepping in threes (serpents, a krayt dragon); `crawl`: four
// legs that lift and splay outward as they come forward, the spine and the tail waving (lizards)
export type Gait = "walk" | "birdwalk" | "walker" | "quad" | "hexa" | "wings" | "roll" | "glide" | "hover" | "ride" | "slither" | "crawl" | "droideka";
export interface GaitStyle {
  // How fast the legs go round for the same speed
  cycle: number;
  // How far the body rises with each step (a share of the walker's) and rocks side to side (radians at full stride)
  bob: number;
  rock: number;
  // Floating: how high above the ground, and how far it rises and falls
  hover?: number;
  float?: number;
}
export const GAITS: Record<Gait, GaitStyle> = {
  walk: { cycle: 1, bob: 1, rock: 0 },
  // (2026-11-04) `birdwalk`: a walk on legs whose knee is behind (an AT-ST's, an AT-RT's): the knee bends the other way; `walker`: a heavy four-legged
  // walk, one foot lifted at a time in the order hind left, fore left, hind right, fore right, each foot placed on the ground by the leg's own
  // geometry (WALKER): it never trots and never has all four feet off the ground
  birdwalk: { cycle: 1, bob: 1, rock: 0 },
  walker: { cycle: 0.8, bob: 0, rock: 0.008 },
  quad: { cycle: 0.8, bob: 0.5, rock: 0.015 },
  hexa: { cycle: 1.6, bob: 0.15, rock: 0 },
  wings: { cycle: 1, bob: 0, rock: 0, float: 0.05 },
  roll: { cycle: 1, bob: 0, rock: 0 },
  droideka: { cycle: 1.8, bob: 0.3, rock: 0.02 },
  glide: { cycle: 1, bob: 0, rock: 0.025 },
  slither: { cycle: 1.4, bob: 0, rock: 0 },
  crawl: { cycle: 0.9, bob: 0.3, rock: 0.02 },
  hover: { cycle: 1, bob: 0, rock: 0, hover: 0, float: 0.06 },
  // A rider in the saddle: astride, the knees forward, the hands out on the reins, swaying with the beast's stride
  ride: { cycle: 1, bob: 0.6, rock: 0.03 },
};
const RIDE_E = new THREE.Euler();

// A quaternion per limb, as four numbers each (x, y, z, w)
export type Pose = Float32Array;
export const restPose = (): Pose => {
  const p = new Float32Array(LIMBS * 4);
  for (let i = 0; i < LIMBS; i++) p[i * 4 + 3] = 1;
  return p;
};
const Q = new THREE.Quaternion();
const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
function setLimb(p: Pose, limb: number, axis: THREE.Vector3, angle: number) {
  Q.setFromAxisAngle(axis, angle);
  p.set([Q.x, Q.y, Q.z, Q.w], limb * 4);
}
export function setLimbQuaternion(p: Pose, limb: number, q: THREE.Quaternion) {
  p.set([q.x, q.y, q.z, q.w], limb * 4);
}

// The pose of a gait at a point of its stride; `t` is the seconds the figure has been about (for wings that beat at rest and a float).
// A ball's roll is not here: it follows the ground covered (`rollBall`)
export function gaitPose(gait: Gait, s: Stride, t = 0, out: Pose = restPose(), persona: Persona = NEUTRAL, wave?: Wave, fold = 0): Pose {
  const swing = Math.sin(s.phase) * s.amp;
  const counter = Math.sin(s.phase + Math.PI) * s.amp;
  const reset = (limb: number) => out.set([0, 0, 0, 1], limb * 4);
  for (let i = 1; i < LIMBS; i++) if (i !== LIMB.roll) reset(i);
  switch (gait) {
    case "walk":
    case "birdwalk": {
      const a = angles(s);
      // (a bird's knee is behind the hip and the foot ahead of it: bending the leg turns the shin the other way about the knee)
      const flex = gait === "birdwalk" ? -1 : 1;
      for (const limb of [LIMB.legR, LIMB.legL, LIMB.armR, LIMB.armL]) setLimb(out, limb, AXIS.x, a[limb]);
      setLimb(out, LIMB.tail, AXIS.y, Math.sin(s.phase) * 0.25 * s.amp);
      // (the knees bend as each leg swings through)
      setLimb(out, LIMB.shinR, AXIS.x, flex * s.amp * (0.12 + 0.6 * Math.max(0, -Math.cos(s.phase))));
      setLimb(out, LIMB.shinL, AXIS.x, flex * s.amp * (0.12 + 0.6 * Math.max(0, Math.cos(s.phase))));
      creatureLife(out, s, t, persona, 0.6);
      break;
    }
    case "walker": {
      // Each foot at its own point of the cycle, a quarter of it after the last
      for (const [thigh, shin, at] of [[LIMB.hindL, LIMB.shinHL, 0], [LIMB.legL, LIMB.shinL, 0.25], [LIMB.hindR, LIMB.shinHR, 0.5], [LIMB.legR, LIMB.shinR, 0.75]] as const) {
        walkerLeg(out, thigh, shin, (((s.phase / TAU + at) % 1) + 1) % 1, s.amp);
      }
      setLimb(out, LIMB.tail, AXIS.y, 0);
      creatureLife(out, s, t, persona, 0.3);
      break;
    }
    case "quad": {
      // Diagonal pairs move together: the right fore with the left hind
      setLimb(out, LIMB.legR, AXIS.x, swing * 0.5);
      setLimb(out, LIMB.hindL, AXIS.x, swing * 0.5);
      setLimb(out, LIMB.legL, AXIS.x, counter * 0.5);
      setLimb(out, LIMB.hindR, AXIS.x, counter * 0.5);
      // (each knee bends as its leg comes forward: the diagonal pairs together)
      const bend = (flip: number) => s.amp * (0.1 + 0.85 * Math.max(0, -Math.cos(s.phase + flip)));
      setLimb(out, LIMB.shinR, AXIS.x, bend(0));
      setLimb(out, LIMB.shinHL, AXIS.x, bend(0));
      setLimb(out, LIMB.shinL, AXIS.x, bend(Math.PI));
      setLimb(out, LIMB.shinHR, AXIS.x, bend(Math.PI));
      // (a mantis's forelimbs, folded, sway a little)
      setLimb(out, LIMB.armR, AXIS.x, Math.sin(t * 1.1 + persona.phase) * 0.08);
      setLimb(out, LIMB.armL, AXIS.x, Math.sin(t * 1.1 + persona.phase + 1.6) * 0.08);
      setLimb(out, LIMB.tail, AXIS.y, Math.sin(s.phase * 0.5 + t * 0.6) * (0.12 + 0.25 * s.amp));
      creatureLife(out, s, t, persona, 1);
      break;
    }
    case "crawl": {
      // Diagonal pairs step, each leg lifting and splaying outward as it comes forward; the head and ears live, the spine and tail wave
      crawlLegs(out, s, [[LIMB.legR, LIMB.hindL, LIMB.midL], [LIMB.legL, LIMB.hindR, LIMB.midR]], 0.7, 0.55);
      setLimb(out, LIMB.tail, AXIS.y, Math.sin(s.phase * 0.5 + t * 0.6) * (0.12 + 0.25 * s.amp));
      creatureLife(out, s, t, persona, 1);
      break;
    }
    case "slither": {
      // (a krayt dragon's six legs, in threes, short steps; a serpent has none and is carried by its wave)
      crawlLegs(out, s, [[LIMB.legR, LIMB.midL, LIMB.hindR], [LIMB.legL, LIMB.midR, LIMB.hindL]], 0.45, 0.35);
      break;
    }
    case "hexa": {
      // Alternating threes: right fore, left middle and right hind against the others; the legs sweep forward and back (about the upright)
      for (const [limb, sign] of [[LIMB.legR, 1], [LIMB.midL, 1], [LIMB.hindR, 1], [LIMB.legL, -1], [LIMB.midR, -1], [LIMB.hindL, -1]] as const) setLimb(out, limb, AXIS.y, swing * 0.35 * sign);
      setLimb(out, LIMB.armR, AXIS.x, swing * 0.2);
      setLimb(out, LIMB.armL, AXIS.x, counter * 0.2);
      break;
    }
    case "wings": {
      // The wings beat all the time (slowly at rest, quicker flying on), the legs tuck up in flight
      const beat = Math.sin(t * (5 + 6 * s.amp)) * (0.45 + 0.25 * s.amp);
      setLimb(out, LIMB.wingR, AXIS.z, beat);
      setLimb(out, LIMB.wingL, AXIS.z, -beat);
      setLimb(out, LIMB.legR, AXIS.x, 0.6 * s.amp);
      setLimb(out, LIMB.legL, AXIS.x, 0.6 * s.amp);
      setLimb(out, LIMB.tail, AXIS.x, Math.sin(t * 3) * 0.08);
      break;
    }
    case "droideka":
      dekaPose(out, fold, s, t, persona);
      break;
    case "ride":
      for (const [limb, side] of [[LIMB.legR, -1], [LIMB.legL, 1]] as const) {
        Q.setFromEuler(RIDE_E.set(-0.75, 0, side * 0.55));
        setLimbQuaternion(out, limb, Q);
      }
      setLimb(out, LIMB.armR, AXIS.x, -0.7 + Math.sin(s.phase) * 0.08 * s.amp);
      setLimb(out, LIMB.armL, AXIS.x, -0.7 + Math.sin(s.phase) * 0.08 * s.amp);
      break;
    case "glide":
    case "hover":
    case "roll":
      // Limbs that only hang (a probe's arms) sway a little
      setLimb(out, LIMB.armR, AXIS.x, Math.sin(t * 1.3) * 0.06 + s.amp * 0.25);
      setLimb(out, LIMB.armL, AXIS.x, Math.sin(t * 1.3 + 1.7) * 0.06 + s.amp * 0.25);
      setLimb(out, LIMB.legR, AXIS.x, Math.sin(t * 1.1 + 0.6) * 0.05 + s.amp * 0.2);
      setLimb(out, LIMB.legL, AXIS.x, Math.sin(t * 1.1 + 2.2) * 0.05 + s.amp * 0.2);
      // (a hutt's forearms, lifting and settling as it talks)
      setLimb(out, LIMB.foreR, AXIS.x, Math.sin(t * 0.9 + persona.phase) * 0.1 - 0.05);
      setLimb(out, LIMB.foreL, AXIS.x, Math.sin(t * 0.8 + persona.phase + 2) * 0.1 - 0.05);
      break;
  }
  // The wave: the tail's own swing gives way to it
  if (wave) {
    reset(LIMB.tail);
    reset(LIMB.tail2);
    setWave(out, wave, s, t, persona.phase);
  }
  return out;
}

// The legs of a walker such as an AT-AT (models.tsx buildConstruct draws them from these numbers): the hip, knee and foot heights, how far ahead of
// the foot the knee is, and how far the foot is put in front of and behind the hip at a full stride and lifted in its swing (all in the model's own units)
export const WALKER = { hip: 0.66, knee: 0.36, foot: 0.05, kneeForward: 0.06, reach: 0.09, lift: 0.07 };
// One leg of the walker at `u` of its cycle (0 to 1): on the ground for three quarters of it, the foot drawn back at an even pace under the body, then
// swung forward and set down. The foot's place is worked out and the two joints solved for it (a two-bone leg, the knee forward), so a foot on the ground
// stays on it, not lifted by the swing of the hip
function walkerLeg(out: Pose, thigh: number, shin: number, u: number, amp: number) {
  const W = WALKER;
  const a = Math.hypot(W.kneeForward, W.hip - W.knee), b = Math.hypot(W.kneeForward, W.knee - W.foot);
  const t0 = Math.atan2(W.knee - W.hip, W.kneeForward), s0 = Math.atan2(W.foot - W.knee, -W.kneeForward);
  const H = W.hip - W.foot;
  const STANCE = 0.75;
  let fz: number, fy = H;
  if (u < STANCE) fz = W.reach * amp * (1 - (2 * u) / STANCE);
  else {
    const x = (u - STANCE) / (1 - STANCE);
    fz = -W.reach * amp + 2 * W.reach * amp * (0.5 - 0.5 * Math.cos(Math.PI * x));
    fy = H - W.lift * amp * Math.sin(Math.PI * x);
  }
  const d = Math.min(Math.hypot(fz, fy), a + b - 1e-4);
  const gamma = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const t = Math.atan2(-fy, fz) + gamma;
  const kz = a * Math.cos(t), ky = a * Math.sin(t);
  const sh = Math.atan2(-fy - ky, fz - kz);
  // (turns about x are clockwise seen from the side with the nose to the right: the opposite of the angle's way)
  setLimb(out, thigh, AXIS.x, -(t - t0));
  setLimb(out, shin, AXIS.x, -(sh - t - (s0 - t0)));
}

// A body's undulation: it starts at `origin` (a z in the figure's own frame) and runs back to the tail, `amp` metres to a side at full (reached
// a wavelength behind the origin), `length` the wavelength in metres. `idle` is the share of the swing it keeps standing (the rest comes with the
// stride), `drive` how far the wave runs for each radian of the stride, `rate` how fast it runs by the clock (radians a second).
export interface Wave { origin: number; amp: number; length: number; idle?: number; drive?: number; rate?: number }
const TAU = Math.PI * 2;
export function setWave(out: Pose, w: Wave, s: Stride, t: number, offset = 0): Pose {
  const idle = w.idle ?? 0.3;
  const amp = w.amp * (idle + (1 - idle) * s.amp);
  const phase = (s.phase * (w.drive ?? 1) + t * (w.rate ?? 1) + offset) % TAU;
  out.set([amp, TAU / w.length, phase, w.origin], LIMB.wave * 4);
  return out;
}
// Legs that step in two alternating sets: each swings fore and aft by `reach` and, coming forward, lifts and splays outward by `splay`
const CRAWL_E = new THREE.Euler();
const LEFT_LIMBS: ReadonlySet<number> = new Set([LIMB.legL, LIMB.midL, LIMB.hindL]);
function crawlLegs(out: Pose, s: Stride, sets: number[][], reach: number, splay: number) {
  sets.forEach((set, i) => {
    const ph = s.phase + i * Math.PI;
    const swing = Math.sin(ph) * s.amp;
    const lift = Math.max(0, -Math.cos(ph)) * s.amp;
    for (const limb of set) {
      Q.setFromEuler(CRAWL_E.set(swing * reach, 0, (LEFT_LIMBS.has(limb) ? 1 : -1) * lift * splay));
      setLimbQuaternion(out, limb, Q);
      // (and the knee bends as it comes forward)
      if (SHIN_OF[limb] !== undefined) setLimb(out, SHIN_OF[limb], AXIS.x, s.amp * 0.1 + lift * 0.9);
    }
  });
}

// ---- A droideka (destroyer droid) --------------------------------------------------------------------------------------------------------
// One model that folds onto its wheel (2026-11-04, the user: "the droidekaa switching from wheel to standing spawns a different model, this is WRONG:
// the component parts actuate and fold onto the wheel shape"). Standing, three legs go out and down from the hub, each a spoke (the thigh) to a
// knee and a curved plate (the shin: an arc of the wheel's own radius, a third of its circle) hanging from it; folded, each thigh swings round
// to lie along a radius and each shin about its knee onto the rim, the three plates making the whole ring, the thighs its spokes; the arms
// (which point forward on the legs' side) fold down into the wheel and the head and the body stay in the hub. The whole of it hangs from `roll`,
// which turns the wheel. The rotations are worked out here from the two shapes (the thigh turns the spoke onto its radius, the shin the plate
// onto its arc), so the parts the model draws and the pose that folds them cannot disagree.
export const DEKA = { hub: [0, 0.74, 0] as [number, number, number], rim: 0.3, tube: 0.06, outer: 0.36, lift: 0.38 };
export interface DekaLeg { thigh: number; shin: number; phi: number; knee: [number, number, number]; arc: [number, number, number][]; qThigh: THREE.Quaternion; qShin: THREE.Quaternion; axis: THREE.Vector3 }
const v3 = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
export const DEKA_LEGS: DekaLeg[] = (() => {
  const hub = new THREE.Vector3(...DEKA.hub);
  const R = DEKA.rim;
  const e = (28 * Math.PI) / 180;
  const up = new THREE.Vector3(0, 1, 0);
  // (the leg behind, the right fore and the left fore; where on the rim each one's plate begins when folded, in degrees from the front over the top)
  const legs = [[LIMB.hindR, LIMB.shinHR, Math.PI, 120], [LIMB.legR, LIMB.shinR, (Math.PI * 5) / 3, 240], [LIMB.legL, LIMB.shinL, Math.PI / 3, 0]] as const;
  return legs.map(([thigh, shin, phi, deg]) => {
    const u = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
    const spoke = u.clone().multiplyScalar(Math.cos(e)).addScaledVector(up, -Math.sin(e));
    const knee = hub.clone().addScaledVector(spoke, R);
    // (the plate hangs straight down from the knee, bowed outward: an arc of 120 degrees about a centre inside and below the knee)
    const centre = knee.clone().addScaledVector(up, -R * Math.sin(Math.PI / 3)).addScaledVector(u, -R * 0.5);
    const arc: [number, number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const th = Math.PI / 3 - ((Math.PI * 2) / 3) * (i / 12);
      arc.push(v3(centre.clone().addScaledVector(u, R * Math.cos(th)).addScaledVector(up, R * Math.sin(th))));
    }
    const aS = u.clone().multiplyScalar(0.5).addScaledVector(up, Math.sin(Math.PI / 3));
    const tS = u.clone().multiplyScalar(Math.sin(Math.PI / 3)).addScaledVector(up, -0.5);
    const psi = (deg * Math.PI) / 180;
    const aF = new THREE.Vector3(0, Math.sin(psi), Math.cos(psi));
    const tF = new THREE.Vector3(0, Math.cos(psi), -Math.sin(psi));
    const qThigh = new THREE.Quaternion().setFromUnitVectors(spoke, aF);
    // (the plate's frame at the knee, as it hangs and as it lies on the rim: the rotation between them, less the thigh's, is the knee's)
    const mS = new THREE.Matrix4().makeBasis(aS, tS, aS.clone().cross(tS));
    const mF = new THREE.Matrix4().makeBasis(aF, tF, aF.clone().cross(tF));
    const qAll = new THREE.Quaternion().setFromRotationMatrix(mF.multiply(mS.clone().transpose()));
    const qShin = qThigh.clone().invert().multiply(qAll);
    return { thigh, shin, phi, knee: v3(knee), arc, qThigh, qShin, axis: new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)) };
  });
})();
const DEKA_Q = new THREE.Quaternion();
const DEKA_S = new THREE.Quaternion();
const DEKA_ID = new THREE.Quaternion();
const DEKA_E = new THREE.Euler();
// `fold`: 0 standing, 1 a wheel. Standing, the legs lift one after another (a slow, careful step: each thigh lifts, its knee tucking the plate up).
export function dekaPose(out: Pose, fold: number, s: Stride, t: number, persona: Persona = NEUTRAL) {
  const stand = 1 - fold;
  DEKA_LEGS.forEach((leg, i) => {
    const lift = Math.max(0, Math.sin(s.phase + i * 2.094)) * s.amp * stand;
    DEKA_Q.slerpQuaternions(DEKA_ID, leg.qThigh, fold);
    DEKA_Q.premultiply(DEKA_S.setFromAxisAngle(leg.axis, -lift * 0.4));
    setLimbQuaternion(out, leg.thigh, DEKA_Q);
    DEKA_Q.slerpQuaternions(DEKA_ID, leg.qShin, fold);
    DEKA_Q.premultiply(DEKA_S.setFromAxisAngle(leg.axis, -lift * 0.9));
    setLimbQuaternion(out, leg.shin, DEKA_Q);
  });
  // The arms point forward on the legs' side, swaying a little; folded they hang down inside the wheel, the head bowed
  for (const [limb, own] of [[LIMB.armR, 0], [LIMB.armL, 1.4]] as const) {
    Q.setFromEuler(DEKA_E.set(fold * 1.5 + stand * Math.sin(t * 0.8 + own + persona.phase) * 0.04, 0, 0));
    setLimbQuaternion(out, limb, Q);
  }
  Q.setFromEuler(DEKA_E.set(fold * 0.35, 0, 0));
  setLimbQuaternion(out, LIMB.head, Q);
}

// The life of a beast over its gait (2026-11-04: it stood and walked like a toy): the breath lifting its neck, the head dipping with each fore
// step and, at rest, turning to look about and now and then lowered; ears that flick (each its own, now and then) and sweep back at a run; the
// tip of the tail following the rest of it a beat late; a jaw that pants at a run and parts a little now and then. `scale` is how much of
// it a body wears (a brute's head moves less than a beast's). Each beast keeps its own time (the persona's phase), so a herd is not in step.
function creatureLife(out: Pose, s: Stride, t: number, persona: Persona, scale: number) {
  const ph = persona.phase;
  const calm = 1 - s.amp;
  const breath = Math.sin(t * 1.7 + ph);
  // (the glance: a slow turn of the head to one side, then the other, with a pause between)
  const look = Math.sin(t * 0.31 + ph) * Math.max(0, Math.sin(t * 0.13 + ph * 2.1) * 2.2 - 0.9);
  const graze = Math.max(0, Math.sin(t * 0.17 + ph * 3.3)) ** 3;
  const nod = Math.sin(s.phase * 2 + 0.6) * 0.085 * s.amp;
  setEuler(out, LIMB.chest, (breath * 0.012 * (0.5 + calm) - nod * 0.4) * scale, 0, 0);
  setEuler(out, LIMB.head, (nod + graze * 0.22 * calm) * scale, look * 0.5 * calm * scale * Math.min(1.4, persona.fidget), look * 0.04 * calm * scale);
  for (const [limb, side, own] of [[LIMB.earR, -1, 1], [LIMB.earL, 1, 2.3]] as const) {
    const flick = Math.max(0, Math.sin(t * 0.93 + ph * own)) ** 40;
    setEuler(out, limb, (-0.3 * s.amp + Math.sin(t * 0.7 + ph * own) * 0.03) * scale, 0, side * (flick * 0.45 + Math.sin(t * 0.5 + ph + own) * 0.03) * scale);
  }
  setLimb(out, LIMB.tail2, AXIS.y, Math.sin(s.phase * 0.5 + t * 0.6 - 1.2) * (0.2 + 0.4 * s.amp) * scale);
  setEuler(out, LIMB.jaw, (s.amp * 0.1 * (0.5 + 0.5 * Math.sin(t * 13)) + Math.max(0, Math.sin(t * 0.4 + ph)) ** 6 * 0.08 * calm) * scale, 0, 0);
}

// How far the body of a gait rises (from the ground it stands on) and how far it is rocked about its length (z) and pitched about its
// width (x) just now. A floater rises and falls by the clock and leans into the way it goes; nothing that rolls or glides bobs.
export function bodyOf(gait: Gait, s: Stride, t = 0): { y: number; roll: number; pitch: number } {
  const g = GAITS[gait];
  const float = g.float ? Math.sin(t * 1.6) * g.float : 0;
  return {
    y: bob(s) * g.bob + (g.hover ?? 0) + float,
    roll: Math.sin(s.phase) * s.amp * g.rock,
    pitch: gait === "hover" || gait === "wings" ? Math.min(0.35, s.speed * 0.06) : 0,
  };
}

// A ball that rolls without slipping under a body that turns: it keeps its own turn in the world (the body's turning is taken out), and
// is rolled about the level axis square to the way it moved, by the ground covered over its radius. `world` is the ball's turn in the
// world, kept from frame to frame; the result is the ball's turn in the body's frame (for its limb).
const ROLL_AXIS = new THREE.Vector3();
const ROLL_Q = new THREE.Quaternion();
export function rollBall(world: THREE.Quaternion, moved: { x: number; z: number }, radius: number, body: THREE.Quaternion, out = new THREE.Quaternion()): THREE.Quaternion {
  const d = Math.hypot(moved.x, moved.z);
  if (d > 1e-6 && d < 3) {
    // The axis is up x the way it moved: rolling toward +z turns it about +x
    ROLL_AXIS.set(moved.z / d, 0, -moved.x / d);
    ROLL_Q.setFromAxisAngle(ROLL_AXIS, d / radius);
    world.premultiply(ROLL_Q).normalize();
  }
  return out.copy(body).invert().multiply(world);
}

// ---- Materials ----------------------------------------------------------------------------------------------------------------------

// A copy of a material that turns the limbs of a mesh built with Kit.animated by its pose (set `material.userData.pose`, a quaternion a
// limb). What the material did to its program before (a textured surface's parallax) is kept.
// The joints' pivots (where each limb turns, in the figure's own frame) are in `material.userData.pivots`, three numbers a limb, copied from
// the model (Kit.bake keeps them on its geometry: `geometry.userData.pivots`); a limb's own pivot is also on each of its vertices.
export function limbMaterial<T extends THREE.Material>(base: T): T {
  const m = base.clone() as T;
  const values = restPose();
  const pivots = new Float32Array(LIMBS * 3);
  m.userData.pose = values;
  m.userData.pivots = pivots;
  // the joints each limb hangs from, for the Babylon renderer (babylon.ts LimbPlugin), which turns the limbs in its own shader
  m.userData.limbParents = PARENT;
  const patch = patchOf(base);
  if (patch) shaderPatch(m, patch);
  const lit = base instanceof THREE.MeshLambertMaterial || base instanceof THREE.MeshPhongMaterial;
  const before = base.onBeforeCompile;
  const beforeKey = base.customProgramCacheKey?.();
  const parents = PARENT.map((p, i) => (p >= 0 ? `if (i == ${i}) return ${p};` : "")).join(" ");
  m.onBeforeCompile = (shader, renderer) => {
    before?.call(base, shader, renderer);
    shader.uniforms.uQ = { value: values };
    shader.uniforms.uP = { value: pivots };
    // A quaternion a limb (body: none); the vertex is turned about its pivot, then about each joint it hangs from, the normal with it
    const head = `#include <common>\nattribute float limb;\nattribute vec3 pivot;\nuniform vec4 uQ[${LIMBS}];\nuniform vec3 uP[${LIMBS}];
vec3 lqTurn(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
int lqParent(int i) { ${parents} return -1; }
${WAVE_GLSL}`;
    const chain = (point: boolean, v: string) => `{ int li = int(limb + 0.5); if (li > 0) {
  ${point ? `${v} = pivot + lqTurn(uQ[li], ${v} - pivot);` : `${v} = lqTurn(uQ[li], ${v});`}
  int pa = lqParent(li);
  for (int s = 0; s < 3; s++) { if (pa < 0) break; ${point ? `${v} = uP[pa] + lqTurn(uQ[pa], ${v} - uP[pa]);` : `${v} = lqTurn(uQ[pa], ${v});`} pa = lqParent(pa); }
} }`;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", head)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${chain(true, "transformed")}\ntransformed = lqWavePoint(uQ[${WAVE_LIMB}], transformed);`);
    if (lit) shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${chain(false, "objectNormal")}\nobjectNormal = lqWaveNormal(uQ[${WAVE_LIMB}], objectNormal, position.z);`);
  };
  m.customProgramCacheKey = () => `limbs3:${lit ? "lit" : "flat"}:${beforeKey ?? ""}`;
  // A surface whose maps load later hands them to its copies too (surfaces.tsx surfaceMaterial), until the copy is let go
  const followers = (base as THREE.Material & { followers?: Set<THREE.Material> }).followers;
  if (followers) {
    followers.add(m);
    m.addEventListener("dispose", () => followers.delete(m));
  }
  return m;
}

// Writes a pose into the materials of a moving figure
export function applyPose(materials: Iterable<THREE.Material>, p: Pose) {
  for (const m of materials) (m.userData.pose as Float32Array | undefined)?.set(p);
}
// Writes a model's joint pivots into the materials of a moving figure
export function applyPivots(materials: Iterable<THREE.Material>, p: Float32Array) {
  for (const m of materials) (m.userData.pivots as Float32Array | undefined)?.set(p);
}
// A walker's pose at a point of its stride, written into its materials
export function pose(materials: Iterable<THREE.Material>, s: Stride) {
  applyPose(materials, gaitPose("walk", s));
}

// ---- Sitting, standing and playing at a table (2026-10-27; the user: "we need seated NPC assets and the animations for sitting and standing and
// playing the game") ----------------------------------------------------------------------------------------------------------------
// A person at a card table sits on a stool: the whole body drops to the seat, the legs come forward, and the arms do what the game asks.
// `SeatState` is what the map says about a figure (a ref the figure reads each frame, so the map need not redraw); the figure eases
// into the seat (`easeSit`) and out of it, and blends the seated pose over its walking one (`blendPose`).
// Pure but for THREE's quaternions: tests/interiors/limbs.test.ts.

// What the arms rest in: nothing special (`rest`), cards held up before the chest (`hold`), the croupier dealing (`deal`)
export type Act = "rest" | "hold" | "deal";
// One-shot gestures laid over it, each over about a second: drawing a card, pushing chips in, calling (a hand slammed down), folding (the
// hands spread), and thinking (a hand to the chin)
export type Shot = "draw" | "bet" | "call" | "fold" | "think";
export interface SeatState {
  sit: boolean;
  act: Act;
  // The gesture and a number that changes to start it again
  shot?: Shot;
  shotKey?: number;
  // How far the body drops on the seat (in the figure's own units, before its scale), and how many cards it holds up
  drop: number;
  cards: number;
  // On their feet (or seated, for talk): cheering (the arms thrown up and pumping, a bounce: an arena's crowd) or talking (a hand that
  // gestures as they speak, the head nodding), eased in and out (`STAND_ACT_SECONDS`); see `standActPose`
  stand?: StandAct;
}
// (2026-11-02; the user: "NPCs that talk to one another" and an arena's "viewing platform (populate this with NPCs with cheering animations)")
export type StandAct = "cheer" | "talk";
export const STAND_ACT_SECONDS = 0.4;
// The limbs a standing act moves: the arms, the forearms and the head (the legs keep walking or standing)
const ACT_LIMBS = [LIMB.armR, LIMB.armL, LIMB.foreR, LIMB.foreL, LIMB.head];
// What the arms do in a standing act at clock `t` (`phase` keeps a crowd from moving as one); `out` holds only the limbs of ACT_LIMBS
export function standActPose(act: StandAct, t: number, phase = 0, out: Pose = restPose()): Pose {
  for (let i = 1; i < LIMBS; i++) out.set([0, 0, 0, 1], i * 4);
  const u = t + phase;
  if (act === "cheer") {
    // Both arms high and pumping, the fists shaken, the head thrown back now and then
    const pump = Math.sin(u * 7.5);
    setEuler(out, LIMB.armR, -2.75 + pump * 0.32, 0, -0.32);
    setEuler(out, LIMB.armL, -2.75 - pump * 0.32 * Math.cos(u * 0.7), 0, 0.32);
    setEuler(out, LIMB.foreR, -0.35 - Math.max(0, pump) * 0.4, 0, 0);
    setEuler(out, LIMB.foreL, -0.35 - Math.max(0, -pump) * 0.4, 0, 0);
    setEuler(out, LIMB.head, -0.22 + Math.sin(u * 1.3) * 0.08, 0, 0);
  } else {
    // One hand opens and turns as they speak, the other at rest; the head nods and turns a little
    setEuler(out, LIMB.armR, -0.55 + Math.sin(u * 2.6) * 0.18, 0.15, -0.18 + Math.sin(u * 1.7) * 0.12);
    setEuler(out, LIMB.foreR, -1.0 + Math.sin(u * 3.4) * 0.3, 0, 0);
    setEuler(out, LIMB.armL, -0.12 + Math.sin(u * 1.1) * 0.05, 0, 0.08);
    setEuler(out, LIMB.foreL, -0.25, 0, 0);
    setEuler(out, LIMB.head, Math.sin(u * 3.1) * 0.08, Math.sin(u * 0.9) * 0.12, 0);
  }
  return out;
}
// The limbs of a standing act laid over a pose by `k` (0 to 1): only the arms, forearms and head move
export function overlayAct(base: Pose, act: Pose, k: number, out: Pose = base): Pose {
  for (const i of ACT_LIMBS) {
    QA.set(base[i * 4], base[i * 4 + 1], base[i * 4 + 2], base[i * 4 + 3]);
    QB.set(act[i * 4], act[i * 4 + 1], act[i * 4 + 2], act[i * 4 + 3]);
    QA.slerp(QB, k);
    out.set([QA.x, QA.y, QA.z, QA.w], i * 4);
  }
  return out;
}
export const seatState = (): SeatState => ({ sit: false, act: "rest", drop: 0.22, cards: 0 });
export const SIT_SECONDS = 0.7;
export const STAND_SECONDS = 0.55;
export const SHOT_SECONDS = 1.1;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (v: number) => v * v * (3 - 2 * v);
// How far into the seat a figure is after `dt` more seconds (0 standing, 1 seated)
export const easeSit = (amount: number, sitting: boolean, dt: number) => clamp01(amount + (sitting ? 1 / SIT_SECONDS : -1 / STAND_SECONDS) * dt);
// A one-shot's strength `since` seconds after it began: up and down in a smooth swell, nothing before or after
export const envelope = (since: number, length = SHOT_SECONDS) => (since <= 0 || since >= length ? 0 : Math.sin((since / length) * Math.PI) ** 0.8);

const E = new THREE.Euler();
function setEuler(p: Pose, limb: number, x: number, y: number, z: number) {
  Q.setFromEuler(E.set(x, y, z));
  p.set([Q.x, Q.y, Q.z, Q.w], limb * 4);
}
// Seated: the thighs forward, the knees a little apart; the arms by what they are doing (`t` is the clock, for the small movements)
export const SIT_LEG = -1.38;
export function seatedPose(act: Act, t: number, out: Pose = restPose()): Pose {
  for (let i = 1; i < LIMBS; i++) out.set([0, 0, 0, 1], i * 4);
  setEuler(out, LIMB.legR, SIT_LEG, 0, -0.1);
  setEuler(out, LIMB.legL, SIT_LEG, 0, 0.1);
  const sway = Math.sin(t * 1.1) * 0.03;
  switch (act) {
    case "hold":
      // Both hands up before the chest, the cards held between them
      setEuler(out, LIMB.armR, -1.15 + sway, 0, 0.5);
      setEuler(out, LIMB.armL, -1.15 - sway, 0, -0.5);
      break;
    case "deal":
      // One hand holding the deck, the other sweeping out card after card, side to side
      setEuler(out, LIMB.armL, -1.0, 0, -0.4);
      setEuler(out, LIMB.armR, -1.2 + Math.sin(t * 6) * 0.16, 0, -0.1 + Math.sin(t * 3) * 0.55);
      break;
    default:
      // Resting on the table's edge
      setEuler(out, LIMB.armR, -0.62 + sway, 0, -0.12);
      setEuler(out, LIMB.armL, -0.62 - sway, 0, 0.12);
  }
  return out;
}
// What the arms do for a one-shot at its fullest
export function shotPose(shot: Shot, out: Pose = restPose()): Pose {
  for (let i = 1; i < LIMBS; i++) out.set([0, 0, 0, 1], i * 4);
  setEuler(out, LIMB.legR, SIT_LEG, 0, -0.1);
  setEuler(out, LIMB.legL, SIT_LEG, 0, 0.1);
  switch (shot) {
    case "draw":
      // Reaching out over the table for a card, the other hand holding the rest
      setEuler(out, LIMB.armR, -1.85, 0, 0.12);
      setEuler(out, LIMB.armL, -1.15, 0, -0.5);
      break;
    case "bet":
      // Pushing chips into the middle
      setEuler(out, LIMB.armR, -1.7, 0, 0.18);
      setEuler(out, LIMB.armL, -0.7, 0, 0.12);
      break;
    case "call":
      // A hand raised, to come down on the table
      setEuler(out, LIMB.armR, -2.65, 0, -0.35);
      setEuler(out, LIMB.armL, -0.7, 0, 0.12);
      break;
    case "fold":
      // The hands spread, the cards laid down
      setEuler(out, LIMB.armR, -0.9, 0, -0.75);
      setEuler(out, LIMB.armL, -0.9, 0, 0.75);
      break;
    case "think":
      // A hand to the chin
      setEuler(out, LIMB.armR, -2.0, 0, 0.5);
      setEuler(out, LIMB.armL, -0.62, 0, 0.12);
      break;
  }
  return out;
}
// Aboard a craft (2026-10-30; the user: "characters drawn ACCURATELY within their seats"): how someone sits in a seat of a speeder or a boat
// (`seated`: thighs forward, shins down; `astride`: a bike's saddle, the knees out and the feet back, leaning over the bars; `stand`: on a
// deck), and what the hands do (`pilot`: on the controls, `rider`: in the lap or on a rail, `gunner`: both on the gun's grips, raised and
// lowered with its `pitch`, radians up). The body itself is set by the map so that the hips sit on the seat (models.tsx Mover)
export type SeatPose = "seated" | "astride" | "stand";
export type SeatRole = "pilot" | "rider" | "gunner";
export function crewPose(pose: SeatPose, role: SeatRole, t: number, pitch = 0, out: Pose = restPose()): Pose {
  for (let i = 1; i < LIMBS; i++) out.set([0, 0, 0, 1], i * 4);
  const sway = Math.sin(t * 1.3) * 0.025;
  if (pose === "seated") {
    setEuler(out, LIMB.legR, -1.45, 0, -0.08);
    setEuler(out, LIMB.legL, -1.45, 0, 0.08);
    setEuler(out, LIMB.shinR, 1.4, 0, 0);
    setEuler(out, LIMB.shinL, 1.4, 0, 0);
  } else if (pose === "astride") {
    setEuler(out, LIMB.legR, -1.0, 0, -0.42);
    setEuler(out, LIMB.legL, -1.0, 0, 0.42);
    setEuler(out, LIMB.shinR, 1.7, 0, 0);
    setEuler(out, LIMB.shinL, 1.7, 0, 0);
  } else {
    setEuler(out, LIMB.legR, 0.05, 0, -0.08);
    setEuler(out, LIMB.legL, -0.12, 0, 0.08);
    setEuler(out, LIMB.shinL, 0.15, 0, 0);
  }
  const lean = pose === "astride" ? 0.38 : 0.06;
  if (role === "gunner") {
    // Both hands on the grips: the arms go up and down with the gun, the head and chest follow it a little
    const p = Math.max(-0.6, Math.min(1.2, pitch));
    setEuler(out, LIMB.chest, lean * 0.5 - p * 0.25, 0, 0);
    setEuler(out, LIMB.armR, -1.3 - p * 0.85, 0, 0.18);
    setEuler(out, LIMB.armL, -1.3 - p * 0.85, 0, -0.18);
    setEuler(out, LIMB.foreR, -0.45, 0, 0);
    setEuler(out, LIMB.foreL, -0.45, 0, 0);
    setEuler(out, LIMB.head, -p * 0.45 - lean * 0.5, 0, 0);
  } else if (role === "pilot") {
    setEuler(out, LIMB.chest, lean + sway * 0.5, 0, 0);
    setEuler(out, LIMB.armR, pose === "astride" ? -1.15 : -0.85, 0, pose === "astride" ? -0.3 : 0.05);
    setEuler(out, LIMB.armL, pose === "astride" ? -1.15 : -0.85, 0, pose === "astride" ? 0.3 : -0.05);
    setEuler(out, LIMB.foreR, pose === "astride" ? -0.15 : -0.6, 0, 0);
    setEuler(out, LIMB.foreL, pose === "astride" ? -0.15 : -0.6, 0, 0);
    setEuler(out, LIMB.head, -lean * 0.8, 0, 0);
  } else {
    // A rider looks about now and then; seated, the hands in the lap; standing or astride, a hand on a rail or on the one in front
    setEuler(out, LIMB.chest, lean * 0.6, Math.sin(t * 0.31) * 0.12, 0);
    setEuler(out, LIMB.head, -lean * 0.5, Math.sin(t * 0.23 + 1) * 0.5, 0);
    if (pose === "seated") {
      setEuler(out, LIMB.armR, -0.35 + sway, 0, -0.05);
      setEuler(out, LIMB.armL, -0.35 - sway, 0, 0.05);
      setEuler(out, LIMB.foreR, -1.0, 0, 0);
      setEuler(out, LIMB.foreL, -1.0, 0, 0);
    } else {
      setEuler(out, LIMB.armR, -0.9, 0, -0.25);
      setEuler(out, LIMB.armL, 0.1 + sway, 0, 0.1);
      setEuler(out, LIMB.foreR, -0.5, 0, 0);
    }
  }
  return out;
}

const QA = new THREE.Quaternion();
const QB = new THREE.Quaternion();
// Each limb of `a` turned toward `b` by `k` (0 to 1) into `out` (which may be `a`)
export function blendPose(a: Pose, b: Pose, k: number, out: Pose = restPose()): Pose {
  for (let i = 0; i < LIMBS; i++) {
    QA.set(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]);
    QB.set(b[i * 4], b[i * 4 + 1], b[i * 4 + 2], b[i * 4 + 3]);
    QA.slerp(QB, k);
    out.set([QA.x, QA.y, QA.z, QA.w], i * 4);
  }
  return out;
}

// ---- How a person moves and fights (2026-10-30; the user: "proper character positions for prone/crouch/walk/run/jump movements, with
// relevant arm and body positions for carrying pistols/rifles/carbines/etc, plus recoil animations ... a range of lightsabre animations for
// the variety of lightsabre forms"). A jointed person (the limbs above, built by models.tsx buildHumanoid) is posed each frame from its
// stride and what the scene says it is doing (`Motion`, a ref the scene writes): standing, crouched or prone; in the air; carrying its
// weapon or holding it ready, aimed up or down; the kick of a shot (stronger for a heavier gun); a strike of its blade, in the style of
// the lightsaber form it fights in; a parry held up; a flinch when hit. What the hands hold sets the arms (`Hold`); a two-handed grip
// moves both arms alike, so the hands stay on the weapon. Angles are radians in the figure's frame (it faces +z, its right is -x):
// about x, negative raises a limb forward (and bends an elbow up), positive leans the chest forward; about y, positive turns to the
// figure's left; about z, positive tips the top to the figure's right. Pure but for THREE's quaternions: tests/interiors/limbs.test.ts.

// What the hands hold, from the outfit's `hand`: nothing (the arms swing), something carried before the body (a tray, a datapad, a tool,
// an instrument: the arms keep still), a pistol (one hand, the other free), a rifle or carbine or bowcaster (both hands), a lightsaber
// (both hands on the hilt; one-handed in some forms), a one-handed blade or axe, a staff, pike or gaffi stick
export type Hold = "none" | "carry" | "pistol" | "rifle" | "saber" | "melee" | "pole";
export function holdOf(hand: string): Hold {
  if (hand === "pistol") return "pistol";
  if (hand === "rifle" || hand === "bowcaster") return "rifle";
  if (hand === "saber" || hand === "saber2") return "saber";
  if (hand === "vibro" || hand === "axe") return "melee";
  if (hand === "pike" || hand === "staff" || hand === "gaffi") return "pole";
  return hand ? "carry" : "none";
}

// How a lightsaber is fought with: one movement style for each family of the forms (shared/data/sw5e/lightsaberForms.json), each with its
// guard and its strikes. Shii-Cho sweeps wide; Makashi fences one-handed, side on, the other hand behind the back; Soresu keeps a tight
// guard and short cuts; Ataru leaps and spins; Shien holds the blade back over the shoulder and Djem So high, both striking hard; Niman is
// balanced; Juyo (and Vaapad) low and fast; Jar'Kai cuts crosswise; Trakata flicks and spins; Sokan lunges.
export type SaberStyle = "shiicho" | "makashi" | "soresu" | "ataru" | "shien" | "djemso" | "niman" | "juyo" | "jarkai" | "trakata" | "sokan";
// (each form of the books, by its name, to the style it is drawn in: how it looks, not what it does in the rules)
export const FORM_STYLE: Record<string, SaberStyle> = {
  "Shii-Cho Form": "shiicho", "Makashi Form": "makashi", "Soresu Form": "soresu", "Ataru Form": "ataru", "Shien Form": "shien", "Djem So Form": "djemso",
  "Niman Form": "niman", "Juyo Form": "juyo", "Vaapad Form": "juyo", "Jar'Kai Form": "jarkai", "Trakata Form": "trakata", "Sokan Form": "sokan",
  "Drallig Form": "makashi", "Twilight Form": "makashi", "Ishu Form": "soresu", "Vonil Form": "niman", "Aqinos Form": "niman", "Trispzest Form": "juyo",
  "Bakuuni Hand Form": "sokan", "Ysannanite Form": "jarkai",
};
export const SABER_STYLES: SaberStyle[] = ["shiicho", "makashi", "soresu", "ataru", "shien", "djemso", "niman", "juyo", "jarkai", "trakata", "sokan"];
// The style someone fights in: the first form they know that has one (a feature or feat named for it), else one by who they are (a Sith or
// an inquisitor fights hard and fast, a Jedi in one of the classic forms), picked by their name so it stays the same
export function saberStyleOf(name: string, known: string[] = []): SaberStyle {
  for (const k of known) {
    const hit = Object.keys(FORM_STYLE).find((f) => k.toLowerCase().includes(f.toLowerCase().replace(/ form$/, "")));
    if (hit) return FORM_STYLE[hit];
  }
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool: SaberStyle[] = /sith|dark|inquisitor|vader/i.test(name) ? ["djemso", "juyo", "shien", "jarkai"] : /jedi|knight|master|padawan|guardian|sentinel|consular/i.test(name) ? ["soresu", "ataru", "shiicho", "makashi", "niman", "shien"] : SABER_STYLES;
  return pool[h % pool.length];
}

// What the scene says a person is doing. Times are seconds on `nowSeconds()`'s clock; `swing` counts the strikes (the style's are taken in
// turn), `kick` is how hard the weapon kicks (0 a hold-out, 1 a heavy repeater)
// (posture: 0 standing, 1 crouched, 2 prone, 3 swimming (2026-10-30): a crawl when it moves, treading water when it does not)
export interface Motion {
  posture: 0 | 1 | 2 | 3;
  ready: boolean;
  pitch: number;
  air: boolean;
  firedAt: number;
  kick: number;
  swingAt: number;
  swing: number;
  blocking: boolean;
  hitAt: number;
  style?: SaberStyle;
  // What the hands are about besides the weapon (2026-11-02: a foe's throw, spray, call for help, medpac), begun at `actAt` and lasting
  // `actFor` seconds (its wind-up: shared/logic/shooter.ts SHOOT.act); the follow-through comes after it
  act?: "throw" | "spray" | "call" | "heal";
  actAt?: number;
  actFor?: number;
}
export const motion = (o: Partial<Motion> = {}): Motion => ({ posture: 0, ready: false, pitch: 0, air: false, firedAt: -99, kick: 0.4, swingAt: -99, swing: 0, blocking: false, hitAt: -99, ...o });
export const nowSeconds = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
// How hard a ranged weapon kicks (shared/logic/shooter.ts gunKick: the same rule widens its spread)
export const kickOf = (name: string, damage = 0): number => gunKick(name, damage).kick;

// The motion's states eased over frames (0 to 1): a figure goes into a crouch, up into a guard, onto its belly, over a moment, not at once
export interface Eased { ready: number; crouch: number; prone: number; air: number; block: number; swim: number }
export const eased = (): Eased => ({ ready: 0, crouch: 0, prone: 0, air: 0, block: 0, swim: 0 });
export function easeMotion(e: Eased, m: Motion, dt: number): Eased {
  const k = 1 - Math.exp(-dt * 9);
  e.ready += ((m.ready || m.blocking ? 1 : 0) - e.ready) * k;
  e.crouch += ((m.posture === 1 ? 1 : 0) - e.crouch) * k;
  e.prone += ((m.posture === 2 ? 1 : 0) - e.prone) * (1 - Math.exp(-dt * 6));
  e.air += ((m.air ? 1 : 0) - e.air) * (1 - Math.exp(-dt * 14));
  e.block += ((m.blocking ? 1 : 0) - e.block) * (1 - Math.exp(-dt * 16));
  e.swim += ((m.posture === 3 ? 1 : 0) - e.swim) * (1 - Math.exp(-dt * 5));
  return e;
}

type J3 = [number, number, number];
const JOINTS = ["legR", "legL", "shinR", "shinL", "armR", "armL", "foreR", "foreL", "chest", "weapon", "head"] as const;
type Joint = (typeof JOINTS)[number];
type Joints = Partial<Record<Joint, J3>>;
// A key of a guard or a strike: joints as they are, `arms` and `fores` the x of both upper arms and both forearms (a two-handed grip; one
// hand in a one-handed style), `lift` the body off the ground (a leap) and `spin` it turned about (a spinning cut)
interface Key extends Joints { arms?: number; fores?: number; lift?: number; spin?: number }
interface Strike { dur: number; keys: [number, Key][] }
interface Style { guard: Key; strikes: Strike[]; oneHand?: boolean; block?: Key }

// The strikes, from either side (`d` 1 cuts from the right to the left, -1 the other way)
const overhead = (dur = 0.5, lift = 0): Strike => ({ dur, keys: [[0.38, { arms: -2.7, fores: -0.25, chest: [-0.28, 0, 0], weapon: [-0.35, 0, 0], head: [-0.15, 0, 0], lift }], [0.64, { arms: 0.05, fores: 0, chest: [0.55, 0, 0], weapon: [0.75, 0, 0], legL: [-0.65, 0, 0], shinL: [0.7, 0, 0], legR: [0.35, 0, 0], shinR: [0.35, 0, 0] }], [0.82, { arms: 0, chest: [0.42, 0, 0], weapon: [0.75, 0, 0] }]] });
const sweep = (d: number, dur = 0.45, spin = 0): Strike => ({ dur, keys: [[0.3, { arms: -1.05, fores: -0.2, chest: [0.05, -1.05 * d, 0.12 * d], weapon: [1.05, 0, 0], head: [0, 0.8 * d, 0], spin: 0 }], [0.66, { arms: -1.0, fores: -0.1, chest: [0.18, 1.15 * d, -0.12 * d], weapon: [1.15, 0, 0], head: [0, -0.7 * d, 0], spin }], [0.8, { arms: -0.9, chest: [0.12, 0.9 * d, 0], weapon: [1.0, 0, 0], spin }]] });
const diagonal = (d: number, dur = 0.45): Strike => ({ dur, keys: [[0.32, { arms: -2.2, fores: -0.2, chest: [-0.12, -0.75 * d, 0.28 * d], weapon: [0.1, 0, -0.35 * d], head: [0, 0.5 * d, 0] }], [0.66, { arms: -0.15, fores: 0, chest: [0.38, 0.85 * d, -0.22 * d], weapon: [0.9, 0, 0.35 * d], head: [0, -0.6 * d, 0], legL: [-0.45, 0, 0], shinL: [0.5, 0, 0] }]] });
const rising = (d: number, dur = 0.45): Strike => ({ dur, keys: [[0.32, { arms: 0.25, fores: -0.1, chest: [0.25, -0.85 * d, -0.22 * d], weapon: [1.45, 0, 0] }], [0.66, { arms: -2.1, fores: -0.2, chest: [-0.18, 0.75 * d, 0.22 * d], weapon: [-0.05, 0, 0] }]] });
const thrust = (dur = 0.42): Strike => ({ dur, keys: [[0.36, { arms: -0.75, fores: -1.15, weapon: [1.55, 0, 0], chest: [-0.06, 0.35, 0] }], [0.6, { arms: -1.45, fores: 0.05, weapon: [1.5, 0, 0], chest: [0.32, 0.2, 0], legL: [-0.95, 0, 0], shinL: [0.95, 0, 0], legR: [0.65, 0, 0], shinR: [0.35, 0, 0] }]] });
const flick = (dur = 0.32): Strike => ({ dur, keys: [[0.4, { arms: -1.1, fores: -0.5, weapon: [0.3, 0, 0] }], [0.62, { arms: -1.35, fores: 0, weapon: [1.4, 0, 0], chest: [0.2, 0.3, 0] }]] });

const STANCE = { legL: [-0.32, 0, 0] as J3, legR: [0.22, 0, 0] as J3, shinL: [0.3, 0, 0] as J3, shinR: [0.35, 0, 0] as J3 };
const STYLES: Record<SaberStyle, Style> = {
  shiicho: { guard: { ...STANCE, arms: -0.4, chest: [0.04, 0.12, 0] }, strikes: [sweep(1), sweep(-1), overhead()] },
  makashi: { oneHand: true, guard: { legR: [-0.28, 0, 0], legL: [0.18, 0, 0], shinR: [0.2, 0, 0], shinL: [0.25, 0, 0], armR: [-0.95, 0.2, 0], foreR: [-0.15, 0, 0], weapon: [0.95, 0, 0], armL: [0.55, 0, 0.35], foreL: [-1.5, 0, 0], chest: [0, -0.7, 0], head: [0, 0.6, 0] }, strikes: [thrust(0.38), flick(), diagonal(1, 0.38)] },
  soresu: { guard: { ...STANCE, shinL: [0.55, 0, 0], shinR: [0.6, 0, 0], arms: -0.6, fores: -0.45, weapon: [-0.3, 0, 0.25], chest: [0.08, 0.32, 0], head: [0, -0.25, 0] }, strikes: [diagonal(1, 0.34), diagonal(-1, 0.34), thrust(0.34)], block: { arms: -1.2, fores: -0.3, weapon: [-0.2, 0, 0.95], chest: [0, 0.2, 0] } },
  ataru: { guard: { ...STANCE, arms: -1.65, weapon: [0.15, 0, -0.2], chest: [0, 0.45, 0], head: [0, -0.4, 0] }, strikes: [overhead(0.6, 0.55), sweep(1, 0.55, Math.PI * 2), diagonal(-1, 0.4)] },
  shien: { guard: { ...STANCE, arms: -1.15, weapon: [-1.25, 0, 0], chest: [0, 0.6, 0], head: [0, -0.5, 0] }, strikes: [diagonal(1, 0.5), overhead(0.55), rising(-1, 0.5)] },
  djemso: { guard: { ...STANCE, arms: -1.35, weapon: [-0.3, 0, 0], chest: [0.02, 0.48, 0], head: [0, -0.4, 0] }, strikes: [overhead(0.55), diagonal(1, 0.5), diagonal(-1, 0.5)] },
  niman: { guard: { ...STANCE, arms: -0.25, weapon: [0.4, 0, 0], chest: [0, 0.15, 0] }, strikes: [diagonal(1), sweep(-1), thrust()] },
  juyo: { guard: { ...STANCE, shinL: [0.7, 0, 0], shinR: [0.8, 0, 0], legL: [-0.5, 0, 0], arms: 0.15, weapon: [1.65, 0, 0], chest: [0.32, 0.25, 0], head: [-0.25, -0.2, 0] }, strikes: [rising(1, 0.3), diagonal(-1, 0.3), sweep(1, 0.34, -Math.PI * 2)] },
  jarkai: { guard: { ...STANCE, arms: -0.75, weapon: [0.2, 0, 0.3], chest: [0, 0.05, 0] }, strikes: [diagonal(1, 0.36), diagonal(-1, 0.36), sweep(1, 0.4)] },
  trakata: { guard: { ...STANCE, arms: -0.3, weapon: [0.3, 0, 0], chest: [0, 0.2, 0] }, strikes: [flick(0.3), sweep(-1, 0.5, Math.PI * 2), thrust(0.36)] },
  sokan: { guard: { ...STANCE, arms: -0.6, weapon: [0.5, 0, 0], chest: [0.06, 0.3, 0] }, strikes: [thrust(0.4), sweep(1, 0.42), rising(1, 0.42)] },
};
// A blade held up against bolts and blows: across the front, angled, moving a little to meet them
const BLOCK: Key = { arms: -1.25, fores: -0.35, weapon: [-0.15, 0, 0.9], chest: [0, 0.25, 0], head: [0, -0.2, 0] };
// A one-handed blade (a vibroblade, an axe) and a staff
const MELEE: Style = { oneHand: true, guard: { ...STANCE, armR: [-0.85, 0.15, 0], foreR: [-0.8, 0, 0], weapon: [0.2, 0, 0], armL: [-0.45, 0, -0.2], foreL: [-0.9, 0, 0], chest: [0, 0.25, 0] }, strikes: [overhead(0.5), sweep(1, 0.45), thrust(0.42)] };
const POLE: Style = { oneHand: true, guard: { ...STANCE, armR: [-0.6, 0.1, 0], foreR: [-0.7, 0, 0], weapon: [0.95, 0, 0], armL: [-0.95, -0.3, 0], foreL: [-0.6, 0, 0], chest: [0, 0.3, 0] }, strikes: [thrust(0.45), sweep(1, 0.5), overhead(0.55)] };

const smoothK = (v: number) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
const add3 = (a: J3 | undefined, b: J3, k = 1): J3 => [(a?.[0] ?? 0) + b[0] * k, (a?.[1] ?? 0) + b[1] * k, (a?.[2] ?? 0) + b[2] * k];
// A key as joints: `arms` and `fores` spread over the arms (both in a two-handed grip), keeping the turn the guard gives them about y and z
function jointsOf(key: Key, guard: Joints, oneHand: boolean): Joints {
  const out: Joints = {};
  for (const j of JOINTS) if (key[j]) out[j] = key[j];
  const set = (j: Joint, x: number) => { out[j] = [x, guard[j]?.[1] ?? 0, guard[j]?.[2] ?? 0]; };
  if (key.arms !== undefined) { set("armR", key.arms); if (!oneHand) set("armL", key.arms); }
  if (key.fores !== undefined) { set("foreR", key.fores); if (!oneHand) set("foreL", key.fores); }
  return out;
}
// Where a strike is `u` of the way through (0 to 1): from the guard through its keys and back to the guard, eased between keys
function sampleStrike(strike: Strike, u: number, guard: Joints, oneHand: boolean): { joints: Joints; lift: number; spin: number } {
  const keys: [number, Joints, number, number][] = [[0, guard, 0, 0]];
  let spin = 0;
  for (const [t, k] of strike.keys) {
    if (k.spin !== undefined) spin = k.spin;
    keys.push([t, { ...guard, ...jointsOf(k, guard, oneHand) }, k.lift ?? 0, spin]);
  }
  keys.push([1, guard, 0, spin]);
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [t0, a, l0, s0] = keys[i];
  const [t1, b, l1, s1] = keys[i + 1];
  const f = smoothK((u - t0) / Math.max(1e-6, t1 - t0));
  const joints: Joints = {};
  for (const j of JOINTS) {
    const x = a[j] ?? [0, 0, 0];
    const y = b[j] ?? [0, 0, 0];
    if (a[j] || b[j]) joints[j] = [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f];
  }
  return { joints, lift: l0 + (l1 - l0) * f, spin: u >= 1 ? 0 : s0 + (s1 - s0) * f };
}
const blendJ = (a: Joints, b: Joints, k: number): Joints => {
  if (k <= 0) return a;
  const out: Joints = { ...a };
  for (const j of JOINTS) {
    if (!a[j] && !b[j]) continue;
    const x = a[j] ?? [0, 0, 0];
    const y = b[j] ?? [0, 0, 0];
    out[j] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  }
  return out;
};
export const styleOf = (hold: Hold, saber: SaberStyle): Style | undefined => (hold === "saber" ? STYLES[saber] : hold === "melee" ? MELEE : hold === "pole" ? POLE : undefined);
// How long a strike takes, for the scene to time its blow by
export const strikeSeconds = (hold: Hold, saber: SaberStyle, n: number): number => { const st = styleOf(hold, saber); return st ? st.strikes[((n % st.strikes.length) + st.strikes.length) % st.strikes.length].dur : 0.45; };

// What the pose asks of the body as a whole: how far it is lowered (bent knees), lifted (a leap), turned about (a spin) and tipped onto its front (prone)
// (2026-11-04: `sway` the body's shift sideways over the foot it stands on, `roll` its tilt side to side (hips dropping with the stride, a bank into
// a turn), `pitch` its lean forward and back (into a start, back at a stop))
export interface Root { drop: number; lift: number; spin: number; tip: number; sway: number; roll: number; pitch: number }

// How one person carries themselves (2026-11-04; the user: "a more AAA ... feel to the NPCs/characters ... and their animations"): the same walk is
// not everyone's. A persona is worked out from who they are (a name's hash), so the same person always moves the same way, and a crowd does not
// move as one: how long the stride, how much the hips and shoulders sway, how much the body bobs, how far the shoulders slump forward and the
// head drops (a weary one, a proud one stands tall: negative), how far the arms swing, how much they fidget at rest, and where each is in its own
// slow cycles (so two people standing together do not shift their weight at the same moment)
export interface Persona { stride: number; sway: number; bounce: number; slump: number; swing: number; fidget: number; phase: number }
export const NEUTRAL: Persona = { stride: 1, sway: 1, bounce: 1, slump: 0, swing: 1, fidget: 1, phase: 0 };
export function personaOf(seed: number): Persona {
  // (a small generator from the seed: the same numbers every time)
  let x = (Math.floor(Math.abs(seed)) % 2147483647) + 1;
  const next = () => { x = (x * 48271) % 2147483647; return x / 2147483647; };
  next();
  const range = (a: number, b: number) => a + (b - a) * next();
  return { stride: range(0.9, 1.12), sway: range(0.6, 1.6), bounce: range(0.7, 1.4), slump: range(-0.05, 0.14), swing: range(0.75, 1.3), fidget: range(0.6, 1.5), phase: range(0, Math.PI * 2) };
}
// The lengths of a leg (from the pivots: the hip's height, the knee's), to work out how far bent knees lower the body
export interface LegSize { hip: number; knee: number }
const LIMB_OF: Record<Joint, number> = { legR: 1, legL: 2, shinR: 16, shinL: 17, armR: 3, armL: 4, foreR: 14, foreL: 15, chest: 13, weapon: 18, head: 19 };

// The follow-through after a throw or a spray (seconds), and how a figure without joints (a beast, a plant) shows the same: it rears back over
// the wind-up and snaps forward after (a breath, a spit), and lunges into a blow (`creatureLunge`: the pitch forward and the reach forward)
export const ACT_OUT = 0.3;
export function creatureLunge(now: number, swingAt: number, swingFor: number, actAt: number, actFor: number): { pitch: number; reach: number; rise: number } {
  const s = now - swingAt;
  if (s >= 0 && s < swingFor + 0.25) {
    const k = Math.min(1, s / swingFor);
    // (drawn back, then thrown forward at the instant it lands, then recovering)
    const p = s < swingFor ? -0.12 * Math.sin(Math.PI * k) + 0.3 * k ** 4 : 0.3 * (1 - (s - swingFor) / 0.25);
    return { pitch: p, reach: Math.max(0, p) * 1.2, rise: 0 };
  }
  const a = now - actAt;
  if (a >= 0 && a < actFor + ACT_OUT) {
    if (a < actFor) { const k = smooth(Math.min(1, a / actFor)); return { pitch: -0.32 * k, reach: -0.1 * k, rise: 0.12 * k }; }
    const k = 1 - (a - actFor) / ACT_OUT;
    return { pitch: 0.25 * k, reach: 0.2 * k, rise: 0 };
  }
  return { pitch: 0, reach: 0, rise: 0 };
}
// A person's pose this frame
export function humanPose(s: Stride, t: number, m: Motion, e: Eased, hold: Hold, saber: SaberStyle, now: number, legs: LegSize, out: Pose = restPose(), persona: Persona = NEUTRAL): Root {
  for (let i = 1; i < LIMBS; i++) out.set([0, 0, 0, 1], i * 4);
  const amp = s.amp;
  const run = Math.max(0, Math.min(1, (s.speed - 2.6) / 3));
  const swing = Math.sin(s.phase) * amp;
  const { crouch: c, prone: p, air: a } = e;
  const upright = 1 - p;
  const J: Joints = {};
  const put = (j: Joint, v: J3, k = 1) => { J[j] = add3(J[j], v, k); };
  // At rest the body is alive: it breathes (the ribs lift, the shoulders rise a little, the head settles), shifts its weight from one foot
  // to the other over several seconds (the loaded leg straight, the other eased, the hips dropping to the unloaded side, the shoulders
  // leveling against them), and the head steadies against the trunk. Fades out as the figure walks, aims, crouches, lies down or leaps.
  const calm = (1 - smoothK(amp / 0.3)) * upright * (1 - 0.75 * e.ready) * (1 - 0.6 * c) * (1 - a) * (1 - e.swim);
  const breath = Math.sin(t * 1.9 + persona.phase);
  const shift = Math.sin(t * 0.43 + persona.phase * 1.7);
  const loadL = Math.max(0, shift) * calm * persona.fidget;
  const loadR = Math.max(0, -shift) * calm * persona.fidget;
  put("legR", [-0.07 * loadL, 0, -0.03 * loadL]);
  put("shinR", [0.16 * loadL, 0, 0]);
  put("legL", [-0.07 * loadR, 0, 0.03 * loadR]);
  put("shinL", [0.16 * loadR, 0, 0]);
  // The legs: a stride (longer at a run, shorter crouched), the knee bending as the leg swings through; crouched, the knees deep and the
  // weight forward; in the air, tucked; prone, straight
  const reach = LEG * (1 + 0.4 * run) * (1 - 0.45 * c);
  const flex = 0.55 + 0.85 * run;
  put("legR", [swing * reach, 0, 0]);
  put("legL", [-swing * reach, 0, 0]);
  put("shinR", [amp * (0.12 + flex * Math.max(0, -Math.cos(s.phase))), 0, 0]);
  put("shinL", [amp * (0.12 + flex * Math.max(0, Math.cos(s.phase))), 0, 0]);
  put("legR", [-0.75 * c, 0, -0.08 * c]);
  put("legL", [-1.12 * c, 0, 0.08 * c]);
  put("shinR", [1.5 * c, 0, 0]);
  put("shinL", [1.62 * c, 0, 0]);
  put("legR", [-0.75 * a, 0, -0.1 * a]);
  put("legL", [-1.05 * a, 0, 0.1 * a]);
  put("shinR", [1.25 * a, 0, 0]);
  put("shinL", [1.1 * a, 0, 0]);
  // The trunk: leaning into a run and over a crouch, breathing, twisting a little against the stride (and against the hips, which twist the other
  // way: `spin` below), a slump or a proud chest by who they are, the shoulders leveling against the hips' drop; into a start the trunk leans
  // forward and back at a stop (`accel`)
  const lean = Math.max(-0.1, Math.min(0.14, (s.accel ?? 0) * 0.016)) * Math.min(1, 0.4 + amp);
  // (standing on the left foot (shift > 0) the body tips toward it: a negative roll, about z positive tips the top to the figure's right)
  const hipRoll = -shift * 0.022 * calm * persona.sway;
  put("chest", [0.04 * amp + 0.2 * run * amp + 0.32 * c + breath * 0.014 * (1 - 0.5 * e.ready) + persona.slump * (0.6 * calm + 0.5 * amp) + lean * 0.6, -swing * 0.1 * persona.sway, -hipRoll * 0.8]);
  // (the head steadies against the trunk's lean, the chin drops with a slump, and a breath lifts it a touch)
  put("head", [-0.1 * run * amp - 0.2 * c - 0.5 * (0.04 * amp + 0.2 * run * amp + lean * 0.6) + persona.slump * 0.7 - breath * 0.006, Math.sin(t * 0.31) * Math.sin(t * 0.17) * 0.3 * (1 - e.ready) * persona.fidget, hipRoll * 0.5]);
  // The arms by what the hands hold
  const ready = e.ready;
  const free = (side: "R" | "L", k: number) => {
    const sgn = side === "R" ? -1 : 1;
    const armX = sgn * swing * ARM * (1 + 0.7 * run) * persona.swing;
    // (the ribs lift the arms a touch with a breath, the arms hang a little forward and sway at rest; the elbow flexes as the hand comes forward,
    // relaxing on the back swing)
    put(`arm${side}`, [armX * k - 0.35 * c - 0.6 * a + Math.sin(t * 0.8 + persona.phase + (sgn > 0 ? 1 : 0)) * 0.02 * calm * k, 0, -sgn * (0.08 + 0.35 * a + breath * 0.012 * calm)]);
    put(`fore${side}`, [-(0.1 + 0.15 * amp + 1.0 * run * amp) * k - 0.35 * c - 0.5 * Math.max(0, -armX) * k * (1 - 0.3 * run), 0, 0]);
  };
  const style = styleOf(hold, saber);
  let lift = 0;
  let spin = 0;
  switch (hold) {
    case "none":
      free("R", 1);
      free("L", 1);
      break;
    case "carry":
      put("armR", [Math.sin(t * 1.2) * 0.02, 0, 0]);
      put("armL", [Math.sin(t * 1.2 + 1) * 0.02, 0, 0]);
      break;
    case "pistol": {
      // Down at the side, pointed at the ground; ready, out at shoulder height in both hands, aimed
      free("L", 1 - ready);
      put("armR", [(-swing * ARM * 0.4) * (1 - ready) + (-1.45 - m.pitch) * ready, 0.12 * ready, 0]);
      put("foreR", [-0.3 * (1 - ready), 0, 0]);
      put("weapon", [0.55 * (1 - ready) + 1.45 * ready, 0, 0]);
      put("armL", [(-1.3 - m.pitch) * ready, -0.5 * ready, 0]);
      put("foreL", [-0.55 * ready, 0, 0]);
      put("chest", [0, 0.15 * ready, 0]);
      put("head", [0, -0.12 * ready, 0]);
      break;
    }
    case "rifle": {
      // Carried at the low ready, the muzzle down; ready, at the shoulder, aimed (both arms alike: the hands stay on the gun)
      const arms = 0.72 * (1 - ready) + (-0.2 - m.pitch) * ready + swing * 0.05;
      put("armR", [arms, 0, 0]);
      put("armL", [arms, 0, 0]);
      // (the gun lies inward across the face: the shoulders turn bladed to it and the head looks down the sights)
      put("chest", [0.04 * ready, -0.42 * ready, 0]);
      put("head", [0.06 * ready, 0.36 * ready, 0]);
      break;
    }
    default: {
      if (!style) break;
      // A blade or staff: carried at the side (pointed down and forward) or held in its guard; a strike runs through its keys; a parry
      // blends to the block
      const guard = jointsOf(style.guard, {}, !!style.oneHand);
      for (const j of JOINTS) if (style.guard[j]) guard[j] = style.guard[j];
      const carried: Joints = { armR: [0.35, 0, 0], foreR: [-0.35, 0, 0], weapon: [0.75, 0, 0], ...(style.oneHand ? {} : { armL: [0.35, 0, 0], foreL: [-0.35, 0, 0] }) };
      let joints = blendJ(carried, guard, ready);
      const since = now - m.swingAt;
      const n = style.strikes.length;
      const strike = style.strikes[((m.swing % n) + n) % n];
      if (since >= 0 && since < strike.dur) {
        const sample = sampleStrike(strike, since / strike.dur, guard, !!style.oneHand);
        joints = sample.joints;
        lift = sample.lift;
        spin = sample.spin;
      } else if (e.block > 0.001) {
        const b = style.block ?? BLOCK;
        const held = { ...guard, ...jointsOf(b, guard, !!style.oneHand) };
        // (it shifts to meet what comes)
        held.weapon = add3(held.weapon, [Math.sin(t * 7) * 0.12, 0, Math.sin(t * 4.3) * 0.15]);
        joints = blendJ(joints, held, e.block);
      }
      // (the legs of a stance or a strike are laid over the stride, less the further it walks)
      for (const j of JOINTS) {
        const v = joints[j];
        if (!v) continue;
        const legsOf = j.startsWith("leg") || j.startsWith("shin");
        put(j, v, legsOf ? ready * (1 - amp * 0.7) * (1 - a) : 1);
      }
      if (style.oneHand) free("L", (1 - ready) * 0.6);
      break;
    }
  }
  // The kick of a shot: the gun and the arms jump up, the shoulders back, more for a heavier gun; then they settle
  const sinceShot = now - m.firedAt;
  if (sinceShot >= 0 && sinceShot < 0.45 && (hold === "pistol" || hold === "rifle")) {
    const r = m.kick * Math.exp(-sinceShot * 11) * Math.min(1, sinceShot / 0.025);
    if (hold === "pistol") {
      put("armR", [-0.3 * r, 0, 0]);
      put("foreR", [-0.3 * r, 0, 0]);
      put("weapon", [-0.45 * r, 0, 0]);
      put("armL", [-0.3 * r, 0, 0]);
    } else {
      put("armR", [-0.2 * r, 0, 0]);
      put("armL", [-0.2 * r, 0, 0]);
      put("weapon", [-0.08 * r, 0, 0]);
    }
    put("chest", [-0.16 * r, 0.06 * r, 0]);
    put("head", [-0.08 * r, 0, 0]);
  }
  // A throw (the arm drawn back over the shoulder, the body turned away, then whipped through), a spray (both hands out level, swept across),
  // a call (the comlink at the mouth, the head bent to it), a medpac (both hands at the wound, the head down): laid over the rest, eased in
  // and out (ACT_OUT the follow-through)
  const sinceAct = now - (m.actAt ?? -99);
  const len = m.actFor ?? 0.5;
  if (m.act && sinceAct >= 0 && sinceAct < len + ACT_OUT) {
    const fade = sinceAct > len ? 1 - (sinceAct - len) / ACT_OUT : Math.min(1, sinceAct / 0.12);
    const after = sinceAct > len;
    const over = (j: Joint, v: J3) => { const a = J[j] ?? [0, 0, 0]; J[j] = [a[0] * (1 - fade) + v[0] * fade, a[1] * (1 - fade) + v[1] * fade, a[2] * (1 - fade) + v[2] * fade]; };
    if (m.act === "throw") {
      if (!after) {
        over("armR", [-2.75, 0, 0.25]);
        over("foreR", [-1.5, 0, 0]);
        over("armL", [-1.2, 0, -0.2]);
        over("chest", [-0.15, 0.55, 0]);
        over("head", [0, -0.45, 0]);
      } else {
        over("armR", [-1.05, 0, 0]);
        over("foreR", [-0.1, 0, 0]);
        over("chest", [0.3, -0.45, 0]);
        over("legL", [-0.5, 0, 0]);
        over("shinL", [0.5, 0, 0]);
      }
    } else if (m.act === "spray") {
      const sweep = Math.sin(sinceAct * 9) * 0.25;
      over("armR", [-1.5 - m.pitch, 0.1, 0]);
      over("foreR", [-0.15, 0, 0]);
      over("armL", [-1.35 - m.pitch, -0.45, 0]);
      over("foreL", [-0.5, 0, 0]);
      over("chest", [after ? 0.1 : -0.12, sweep, 0]);
      over("weapon", [1.45, 0, 0]);
    } else if (m.act === "call") {
      over("armL", [-1.25, 0, 0.35]);
      over("foreL", [-2.1, 0, 0]);
      over("head", [0.15, 0.2, 0.22]);
      over("chest", [0.05, 0.15, 0]);
    } else {
      over("armR", [-0.75, 0, 0.1]);
      over("foreR", [-1.05, 0, 0]);
      over("armL", [-0.6, 0, -0.1]);
      over("foreL", [-1.25, 0, 0]);
      over("head", [0.5, 0, 0]);
      over("chest", [0.35, 0, 0]);
    }
  }
  // A flinch when hit
  const sinceHit = now - m.hitAt;
  if (sinceHit >= 0 && sinceHit < 0.4) {
    const f = Math.sin((sinceHit / 0.4) * Math.PI);
    put("chest", [-0.28 * f, 0.15 * f, 0.08 * f]);
    put("head", [-0.25 * f, 0, 0]);
  }
  // Prone: the legs straight out behind, the chest raised on the elbows, the head up to see, the arms forward (a gun held out before the face)
  if (p > 0.001) {
    for (const j of ["legR", "legL", "shinR", "shinL"] as const) if (J[j]) J[j] = [J[j]![0] * upright, J[j]![1] * upright, J[j]![2] * upright];
    put("legR", [0, 0, -0.12 * p]);
    put("legL", [0, 0, 0.12 * p]);
    put("chest", [-0.75 * p, 0, 0]);
    put("head", [-0.55 * p, 0, 0]);
    const armsForward = hold === "rifle" ? -0.55 - (J.armR?.[0] ?? 0) : hold === "pistol" ? -0.15 : -1.6;
    put("armR", [armsForward * p, 0, 0]);
    put("armL", [(hold === "pistol" ? -0.2 : armsForward) * p, 0, 0]);
    put("foreR", [-0.9 * p * (hold === "none" ? 1 : 0), 0, 0]);
    put("foreL", [-0.9 * p * (hold === "none" || hold === "pistol" ? 1 : 0), 0, 0]);
  }
  // Swimming (2026-10-30): moving, a front crawl, the body flat in the water, the arms reaching over in turn and pulling through under it, the
  // legs kicking; still, treading water, upright, the arms sculling and the legs cycling. What the hands hold is held as it can be.
  let flat = 0;
  if (e.swim > 0.001) {
    const k = e.swim;
    const moving = Math.min(1, Math.max(amp * 2.5, s.speed / 0.6));
    flat = k * moving;
    for (const j of JOINTS) if (J[j]) J[j] = [J[j]![0] * (1 - k), J[j]![1] * (1 - k), J[j]![2] * (1 - k)];
    const stroke = t * 3.4;
    // (the crawl: each arm goes round, a half turn apart, the elbow bending as it pulls; the head turns to breathe every other stroke)
    put("armR", [(-1.55 + 1.5 * Math.sin(stroke)) * flat, 0, 0.12 * flat]);
    put("armL", [(-1.55 + 1.5 * Math.sin(stroke + Math.PI)) * flat, 0, -0.12 * flat]);
    put("foreR", [-0.55 * Math.max(0, Math.cos(stroke)) * flat, 0, 0]);
    put("foreL", [-0.55 * Math.max(0, Math.cos(stroke + Math.PI)) * flat, 0, 0]);
    put("legR", [0.28 * Math.sin(stroke * 2) * flat, 0, 0]);
    put("legL", [-0.28 * Math.sin(stroke * 2) * flat, 0, 0]);
    put("shinR", [0.2 * Math.max(0, Math.sin(stroke * 2)) * flat, 0, 0]);
    put("shinL", [0.2 * Math.max(0, -Math.sin(stroke * 2)) * flat, 0, 0]);
    put("chest", [-0.15 * flat, Math.sin(stroke) * 0.18 * flat, 0]);
    put("head", [-0.75 * flat, Math.max(0, Math.sin(stroke / 2)) ** 4 * 0.9 * flat, 0]);
    // (treading water: the arms out, sculling to and fro, the legs pedalling)
    const tread = k * (1 - moving);
    put("armR", [-0.25 * tread, Math.sin(t * 3) * 0.35 * tread, 1.0 * tread]);
    put("armL", [-0.25 * tread, -Math.sin(t * 3) * 0.35 * tread, -1.0 * tread]);
    put("foreR", [-0.5 * tread, 0, 0]);
    put("foreL", [-0.5 * tread, 0, 0]);
    put("legR", [(-0.45 + 0.35 * Math.sin(t * 2.6)) * tread, 0, -0.1 * tread]);
    put("legL", [(-0.45 - 0.35 * Math.sin(t * 2.6)) * tread, 0, 0.1 * tread]);
    put("shinR", [(0.7 + 0.4 * Math.cos(t * 2.6)) * tread, 0, 0]);
    put("shinL", [(0.7 - 0.4 * Math.cos(t * 2.6)) * tread, 0, 0]);
  }
  for (const j of JOINTS) if (J[j]) setEuler(out, LIMB_OF[j], J[j]![0], J[j]![1], J[j]![2]);
  // How far the bent knees lower the body: the standing leg (the longer of the two) holds it up
  const height = (thigh: number, shin: number) => (legs.hip - legs.knee) * Math.cos(thigh) + legs.knee * Math.cos(thigh + shin);
  const stand = Math.max(height(J.legR?.[0] ?? 0, J.shinR?.[0] ?? 0), height(J.legL?.[0] ?? 0, J.shinL?.[0] ?? 0));
  const drop = legs.hip > 0 ? Math.max(0, legs.hip - stand) * upright * (1 - a) * (1 - e.swim) : 0;
  // The body as a whole: it shifts over the foot it stands on (at rest, by the weight shift; walking, once a stride), the hips drop to the
  // unloaded side and twist against the shoulders, it banks into a turn and leans into a start and back at a stop
  const grounded = upright * (1 - a) * (1 - e.swim) * (1 - 0.8 * c);
  const bank = Math.max(-0.12, Math.min(0.12, -(s.turn ?? 0) * 0.03)) * Math.min(1, s.speed / 2) * grounded;
  // (walking, the stance foot is the one swinging back: the right when sin > 0, the figure's right being -x)
  const sway = (shift * 0.012 * calm * persona.sway - Math.sin(s.phase) * 0.011 * amp * persona.sway) * grounded;
  const roll = hipRoll + Math.sin(s.phase) * 0.028 * amp * persona.sway * grounded + bank;
  const pitch = lean * 0.5 * grounded;
  spin += swing * 0.07 * persona.sway * grounded;
  return { drop, lift, spin, tip: Math.max(p, flat), sway, roll, pitch };
}

// ---- A rider's errand ---------------------------------------------------------------------------------------------------------------
// Some of the people about a street come on a beast (2026-11-01, the user): they ride to a building, get down, walk in at its door, come out
// with their purchases, load them onto the beast, get up and ride on. One leg of it by the clock, from the moment the leg begins (the ride, then
// each step in seconds); a stroll is two legs, there and back, each ending at a door.
export const ERRAND = { pace: 2.6, down: 1.2, in: 1.6, shop: 7, out: 1.6, load: 1.8, up: 1.2 };
export type ErrandPhase = "ride" | "down" | "in" | "shop" | "out" | "load" | "up";
export const errandLength = (ride: number): number => ride / ERRAND.pace + ERRAND.down + ERRAND.in + ERRAND.shop + ERRAND.out + ERRAND.load + ERRAND.up;
// Where `t` seconds into a leg of `ride` squares it is: the phase, how far through it (0 to 1) and the squares ridden
export function errandAt(t: number, ride: number): { phase: ErrandPhase; k: number; along: number } {
  const riding = ride / ERRAND.pace;
  if (t < riding) return { phase: "ride", k: riding ? t / riding : 1, along: Math.min(ride, t * ERRAND.pace) };
  let rest = t - riding;
  for (const phase of ["down", "in", "shop", "out", "load", "up"] as const) {
    const span = ERRAND[phase];
    if (rest < span) return { phase, k: rest / span, along: ride };
    rest -= span;
  }
  return { phase: "up", k: 1, along: ride };
}
// What is loaded on the beast: the purchases go on in the loading and stay on through the mounting and the next ride until the next door
export const carrying = (phase: ErrandPhase, k: number): boolean => phase === "ride" || phase === "down" || phase === "up" || (phase === "load" && k > 0.5);
