// Walking figures (2026-10-19). A person is baked into one mesh per finish, so their limbs cannot be turned by moving parts. Instead
// every vertex of an animated build carries the limb it belongs to and the point that limb swings about (`limb` and `pivot`
// attributes, written by Kit.limb), and the material swings it in the vertex shader by an angle per limb: one draw call, however
// the figure walks. Each walking figure has copies of the materials (the angles are uniforms) that share one compiled program.
// The stride follows how far the figure itself moves each frame, so whoever moves the figure (the party, a follower, a stroller in a
// street) walks without being told. Shadows stay in the pose the figure was built in. Pure but for the materials: tests/interiors/limbs.test.ts.
import * as THREE from "three";

// Limbs: 0 the body (still), 1 and 2 the legs, 3 and 4 the arms (right and left, by the figure's own sides)
export const LIMB = { body: 0, legR: 1, legL: 2, armR: 3, armL: 4 } as const;
export const LIMBS = 5;

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

// One frame of a stride for a figure that moved `distance` squares in `dt` seconds. A jump (a figure put somewhere else) is not a walk
export function advance(s: Stride, distance: number, dt: number): Stride {
  if (dt <= 0) return s;
  const raw = distance / dt;
  const speed = raw > 20 ? 0 : s.speed + (raw - s.speed) * (1 - Math.exp(-dt * 12));
  const target = Math.min(1, speed / FULL);
  const amp = s.amp + (target - s.amp) * (1 - Math.exp(-dt * 10));
  // Standing still, the legs come back to rest rather than freezing mid-stride
  const phase = s.phase + Math.min(speed, MAX_CYCLES) * dt * Math.PI * 2;
  return { phase, amp, speed };
}

// The angle of each limb, about the x axis, positive swinging the foot or hand back
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

// A copy of a material that swings the limbs of a mesh built with Kit.animated by its `angles` (set `material.userData.angles`)
export function limbMaterial<T extends THREE.Material>(base: T): T {
  const m = base.clone() as T;
  const values = new Float32Array(LIMBS);
  m.userData.angles = values;
  const lit = base instanceof THREE.MeshLambertMaterial || base instanceof THREE.MeshPhongMaterial;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uAng = { value: values };
    const swing = (v: string, id: string) =>
      `float la${id} = limb > 0.5 ? uAng[int(limb + 0.5)] : 0.0; float lc${id} = cos(la${id}); float ls${id} = sin(la${id});`;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float limb;\nattribute vec3 pivot;\nuniform float uAng[5];")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${swing("", "p")}\nif (limb > 0.5) { vec3 lp = transformed - pivot; transformed = pivot + vec3(lp.x, lp.y * lcp - lp.z * lsp, lp.y * lsp + lp.z * lcp); }`,
      );
    if (lit) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>\n${swing("", "n")}\nif (limb > 0.5) { objectNormal = vec3(objectNormal.x, objectNormal.y * lcn - objectNormal.z * lsn, objectNormal.y * lsn + objectNormal.z * lcn); }`,
      );
    }
  };
  m.customProgramCacheKey = () => `limbs:${lit ? "lit" : "flat"}`;
  return m;
}

// Writes the limb angles of a stride into the materials of a walking figure
export function pose(materials: Iterable<THREE.Material>, s: Stride) {
  const a = angles(s);
  for (const m of materials) {
    const values = m.userData.angles as Float32Array | undefined;
    if (values) for (let i = 0; i < LIMBS; i++) values[i] = a[i];
  }
}
