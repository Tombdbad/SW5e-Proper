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

// Limbs: 0 the body (still); the legs (front ones on a beast), the arms, a beast's hind and middle legs, a tail, a rolling ball or
// wheel, and wings (right and left by the figure's own sides). A builder marks the parts with Kit.limb.
export const LIMB = { body: 0, legR: 1, legL: 2, armR: 3, armL: 4, hindR: 5, hindL: 6, midR: 7, midL: 8, tail: 9, roll: 10, wingR: 11, wingL: 12 } as const;
export const LIMBS = 13;

// How a stride looks: a leg swings this far forward and back at a walk, an arm a little less, against its leg
const LEG = 0.62;
const ARM = 0.5;
// Squares a second at which the swing is at full, and the quickest a stride is cycled (a run on the map is seven squares a second,
// but a figure's legs do not need to blur)
const FULL = 1.4;
const MAX_CYCLES = 3.2;

export interface Stride {
  // Where in the cycle (radians), how much of the swing there is now (0 standing, 1 walking), and the speed smoothed over frames
  phase: number;
  amp: number;
  speed: number;
}
export const standing = (): Stride => ({ phase: 0, amp: 0, speed: 0 });

// One frame of a stride for a figure that moved `distance` squares in `dt` seconds. A jump (a figure put somewhere else) is not a walk.
// `cycle` scales how fast the legs go round for the same speed (a beast's long legs go slower, a droideka's three quicker)
export function advance(s: Stride, distance: number, dt: number, cycle = 1): Stride {
  if (dt <= 0) return s;
  const raw = distance / dt;
  const speed = raw > 20 ? 0 : s.speed + (raw - s.speed) * (1 - Math.exp(-dt * 12));
  const target = Math.min(1, speed / FULL);
  const amp = s.amp + (target - s.amp) * (1 - Math.exp(-dt * 10));
  // Standing still, the legs come back to rest rather than freezing mid-stride
  const phase = s.phase + Math.min(speed, MAX_CYCLES) * cycle * dt * Math.PI * 2;
  return { phase, amp, speed };
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
// beat, faster when it flies on (fliers); `roll`: a ball under a level head (BB units); `tripod`: three legs that step one after another
// (a deployed droideka); `glide`: no bob, a lean into a turn (astromechs on their treads, mouse and service droids, slugs, serpents);
// `hover`: floating with a slow rise and fall, tilted into the way it goes (probe droids, spirits)
export type Gait = "walk" | "quad" | "hexa" | "wings" | "roll" | "tripod" | "glide" | "hover" | "ride";
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
  quad: { cycle: 0.8, bob: 0.5, rock: 0.015 },
  hexa: { cycle: 1.6, bob: 0.15, rock: 0 },
  wings: { cycle: 1, bob: 0, rock: 0, float: 0.05 },
  roll: { cycle: 1, bob: 0, rock: 0 },
  tripod: { cycle: 1.8, bob: 0.4, rock: 0.02 },
  glide: { cycle: 1, bob: 0, rock: 0.025 },
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
export function gaitPose(gait: Gait, s: Stride, t = 0, out: Pose = restPose()): Pose {
  const swing = Math.sin(s.phase) * s.amp;
  const counter = Math.sin(s.phase + Math.PI) * s.amp;
  const reset = (limb: number) => out.set([0, 0, 0, 1], limb * 4);
  for (let i = 1; i < LIMBS; i++) if (i !== LIMB.roll) reset(i);
  switch (gait) {
    case "walk": {
      const a = angles(s);
      for (const limb of [LIMB.legR, LIMB.legL, LIMB.armR, LIMB.armL]) setLimb(out, limb, AXIS.x, a[limb]);
      setLimb(out, LIMB.tail, AXIS.y, Math.sin(s.phase) * 0.25 * s.amp);
      break;
    }
    case "quad": {
      // Diagonal pairs move together: the right fore with the left hind
      setLimb(out, LIMB.legR, AXIS.x, swing * 0.5);
      setLimb(out, LIMB.hindL, AXIS.x, swing * 0.5);
      setLimb(out, LIMB.legL, AXIS.x, counter * 0.5);
      setLimb(out, LIMB.hindR, AXIS.x, counter * 0.5);
      setLimb(out, LIMB.tail, AXIS.y, Math.sin(s.phase * 0.5 + t * 0.6) * (0.12 + 0.25 * s.amp));
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
    case "tripod": {
      // Three legs (the right, the left and the one behind, marked legR, legL and hindR), lifted and set down in turn: a slow, careful step
      const step = (offset: number) => Math.max(0, Math.sin(s.phase + offset)) * s.amp;
      setLimb(out, LIMB.legR, AXIS.x, -step(0) * 0.45);
      setLimb(out, LIMB.legL, AXIS.x, -step((2 * Math.PI) / 3) * 0.45);
      setLimb(out, LIMB.hindR, AXIS.x, step((4 * Math.PI) / 3) * 0.45);
      setLimb(out, LIMB.armR, AXIS.x, Math.sin(t * 0.8) * 0.04);
      setLimb(out, LIMB.armL, AXIS.x, Math.sin(t * 0.8 + 1) * 0.04);
      break;
    }
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
      break;
  }
  return out;
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
export function limbMaterial<T extends THREE.Material>(base: T): T {
  const m = base.clone() as T;
  const values = restPose();
  m.userData.pose = values;
  const lit = base instanceof THREE.MeshLambertMaterial || base instanceof THREE.MeshPhongMaterial;
  const before = base.onBeforeCompile;
  const beforeKey = base.customProgramCacheKey?.();
  m.onBeforeCompile = (shader, renderer) => {
    before?.call(base, shader, renderer);
    shader.uniforms.uQ = { value: values };
    // A quaternion a limb (body: none); the vertex is turned about its pivot, the normal with it
    const turn = (v: string) => `${v} + 2.0 * cross(lq.xyz, cross(lq.xyz, ${v}) + lq.w * ${v})`;
    const pick = "vec4 lq = limb > 0.5 ? uQ[int(limb + 0.5)] : vec4(0.0, 0.0, 0.0, 1.0);";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float limb;\nattribute vec3 pivot;\nuniform vec4 uQ[${LIMBS}];`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n{ ${pick}\nif (limb > 0.5) { vec3 lp = transformed - pivot; transformed = pivot + ${turn("lp")}; } }`);
    if (lit) shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n{ ${pick}\nif (limb > 0.5) { objectNormal = ${turn("objectNormal")}; } }`);
  };
  m.customProgramCacheKey = () => `limbs:${lit ? "lit" : "flat"}:${beforeKey ?? ""}`;
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
// A walker's pose at a point of its stride, written into its materials
export function pose(materials: Iterable<THREE.Material>, s: Stride) {
  applyPose(materials, gaitPose("walk", s));
}
