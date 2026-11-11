// Looking and aiming from inside the map (2026-10-19): the view store (overhead, over the shoulder, first person), the registry
// of what can be aimed at, and the maths of what is under the crosshair. Pure but for three.js objects: tests/interiors/aim.test.ts
// raycasts in node. The crosshair is the middle of the canvas, so the ray is cast from the camera through NDC (0, 0); the game's own
// rules (reach, range, cover: `attackPlan`, `reachable`) are asked by whoever acts on the target, not worked out again here.
import * as THREE from "three";
import { create } from "zustand";
import { motion, type Motion } from "./limbs";

export type ViewMode = "overhead" | "shoulder" | "first";
export const VIEW_MODES: ViewMode[] = ["overhead", "shoulder", "first"];
export const VIEW_LABEL: Record<ViewMode, string> = { overhead: "Overhead", shoulder: "Shoulder", first: "First person" };

const saved = (): ViewMode => {
  try {
    const m = localStorage.getItem("sw5e.view") as ViewMode | null;
    return m && VIEW_MODES.includes(m) ? m : "overhead";
  } catch {
    return "overhead";
  }
};
// The views the campaign's mode allows: all three on the tabletop; in the shooter mode (shared/logic/shooter.ts) there is no top-down view (the user,
// 2026-10-29), only over the shoulder and first person
export const viewsFor = (shooter: boolean): ViewMode[] => (shooter ? VIEW_MODES.filter((m) => m !== "overhead") : VIEW_MODES);
export const coerceView = (mode: ViewMode, shooter: boolean): ViewMode => (viewsFor(shooter).includes(mode) ? mode : "shoulder");
// `eyes` is true while the camera is at the character (ViewRig is mounted), for what is drawn to be read from above (name labels)
export const useView = create<{ mode: ViewMode; eyes: boolean; shooter: boolean; set: (mode: ViewMode) => void; next: () => void; setShooter: (on: boolean) => void }>((set, get) => ({
  mode: saved(),
  eyes: false,
  shooter: false,
  set: (mode) => {
    const next = coerceView(mode, get().shooter);
    if (!get().shooter) try { localStorage.setItem("sw5e.view", next); } catch {}
    set({ mode: next });
  },
  next: () => {
    const views = viewsFor(get().shooter);
    get().set(views[(views.indexOf(get().mode) + 1) % views.length]);
  },
  // Entering the shooter mode takes the view off the overhead at once; leaving it keeps what was chosen
  setShooter: (on) => set({ shooter: on, mode: coerceView(get().mode, on) }),
}));

// What can be aimed at: meshes that carry `userData.aim` ({ label, onTap }), and what blocks the view and the shot (walls)
export const AIM = { targets: new Set<THREE.Object3D>(), solids: new Set<THREE.Object3D>() };
// `plan` asks the game's own rules about the target as it is now (in a fight: `attackPlan`: reach, range, cover), so that the crosshair says
// what the roll would say; `feet` is the rules' own distance, which the crosshair shows in place of its geometric one
export interface AimPlan { ok: boolean; text: string; feet?: number }
export interface AimInfo { label?: string; onTap: () => void; plan?: () => AimPlan }
export const aimInfoOf = (o: THREE.Object3D): AimInfo | undefined => o.userData.aim;

// The direction of a yaw and a pitch: yaw 0 looks along +z (the way a figure faces at rest), a quarter turn towards +x
export const lookDirection = (yaw: number, pitch: number) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
// The way the right hand points when facing `yaw`
export const rightOf = (yaw: number) => new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));

export const EYE = 1.15;
// How the party stands in a shooter fight: `k` is how far down it has crouched (0 standing, 1 crouched; eased by the fight's frame) and `lunge` a lean
// into a saber's swing; the camera, the muzzle and the figure follow them
// (`p` is how far it has gone prone, 0 to 1: lying on the ground, the eyes a hand's breadth above it)
// (`pace`: the share of its walking pace the party moves at in a fight: haste, a slowed level, anchored feet; `jump`: how far a jump carries: shooter.ts paceOf;
// `movedAt`: when the party last took a step (performance.now), for a stop and search that watches whether it walks off)
export const stance = { k: 0, p: 0, lunge: 0, pace: 1, jump: 1, movedAt: 0 };
// What the party is doing, for its figure (interiors/limbs.ts Motion): the map writes its posture and whether it is in the air, a shooter fight
// its aim, shots, strikes, parries and the blows it takes
export const partyMotion: { current: Motion } = { current: motion() };
// The climb a shot puts on the view (radians still to come): a heavy gun throws the aim up more than a light one (ViewRig takes it in quickly)
export const recoil = { up: 0 };
export const PITCH: Record<Exclude<ViewMode, "overhead">, [number, number]> = { first: [-1.3, 1.3], shoulder: [-0.7, 1.0] };
// The roof over the room being walked, as a height over the floor where the character stands (set by the room drawn with a ceiling, null
// out of doors): over the shoulder the camera keeps under it, so that looking down does not put it through the ceiling (2026-10-30, the user)
export const roof: { above: number | null } = { above: null };

export interface Pose {
  position: THREE.Vector3;
  // Where the camera looks: far down the aim, so that the crosshair is where the shot goes
  look: THREE.Vector3;
  // Where a shot leaves from (the shoulder), in the character's frame
  muzzle: THREE.Vector3;
}
// The camera for a character standing at `feet`: in first person at the eyes; over the shoulder behind and to the right of the head
// and a little above it, looking down the aim. `solids` pull it in when a wall is between the head and where it would stand
export function poseOf(mode: Exclude<ViewMode, "overhead">, feet: THREE.Vector3, yaw: number, pitch: number, solids: Iterable<THREE.Object3D> = []): Pose {
  const dir = lookDirection(yaw, pitch);
  const right = rightOf(yaw);
  const head = feet.clone().add(new THREE.Vector3(0, EYE - 0.4 * stance.k - (EYE - 0.3) * stance.p, 0));
  const muzzle = head.clone().add(right.clone().multiplyScalar(0.18)).add(new THREE.Vector3(0, -0.12, 0));
  if (mode === "first") return { position: head, look: head.clone().add(dir.clone().multiplyScalar(20)), muzzle };
  const pivot = head.clone().add(right.clone().multiplyScalar(0.18));
  let want = pivot.clone().add(dir.clone().multiplyScalar(-2.2)).add(right.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.3, 0));
  // (under the roof: lowered to a hand below it, never below the head)
  if (roof.above !== null) want.y = Math.max(head.y, Math.min(want.y, feet.y + roof.above - 0.22));
  const back = want.clone().sub(head);
  const length = back.length();
  const ray = new THREE.Raycaster(head, back.clone().normalize(), 0, length);
  const hit = ray.intersectObjects([...solids], true)[0];
  if (hit) want = head.clone().add(back.normalize().multiplyScalar(Math.max(0.25, hit.distance - 0.2)));
  return { position: want, look: pivot.clone().add(dir.clone().multiplyScalar(20)), muzzle };
}

export interface Aimed {
  // What the crosshair is on: a target (with its label and handler), the ground or a wall, or nothing within range
  kind: "target" | "ground" | "wall" | "none";
  label?: string;
  onTap?: () => void;
  plan?: () => AimPlan;
  // Where the ray ends, and how far that is from the camera and from the character
  point: THREE.Vector3;
  distance: number;
  // A wall between the muzzle and the aimed point (a shot from where the character stands would not arrive), and where it stops
  blocked?: THREE.Vector3;
  // The target is someone (see `Hit person` in LocalMap)
  person?: boolean;
}

const RANGE = 40;
// The floor under the aim: a level floor's height, or the height of the ground at a point (x, z in the scene's frame: the open ground of a district,
// shared/logic districtGround), which the ray is marched over
export type FloorY = number | ((x: number, z: number) => number);
// Where a ray first meets the ground (how far along it), or Infinity: steps of a quarter square, then halved down to a hundredth
function groundHit(ray: THREE.Ray, floor: (x: number, z: number) => number, far: number): number {
  const p = new THREE.Vector3();
  const above = (t: number) => (ray.at(t, p), p.y - floor(p.x, p.z));
  if (above(0) < 0) return Infinity;
  let [lo, prev] = [0, 0];
  for (let t = 0.25; t <= far + 0.25; t += 0.25) {
    if (above(t) < 0) {
      let hi = t;
      lo = prev;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid) < 0) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    prev = t;
  }
  return Infinity;
}
// What is under the crosshair of `camera`. `floorY` is the height of the floor being walked; `muzzle` (over the shoulder) is where
// a shot leaves from, and a wall between it and the aimed point marks the aim blocked. Matrices are as of the last frame
// (`ndc`: where on the screen it is asked, the middle by default; the overhead view's mouse is aimed with its own)
export function aimAt(camera: THREE.Camera, floorY: FloorY, muzzle?: THREE.Vector3, targets: Iterable<THREE.Object3D> = AIM.targets, solids: Iterable<THREE.Object3D> = AIM.solids, ndc = new THREE.Vector2(0, 0)): Aimed {
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  return castAim(ray, floorY, muzzle, targets, solids);
}
// What is along a ray from a point, as a crosshair would say (the hook's shot with nothing on the screen to aim by: straight ahead of the figure)
export function aimFrom(origin: THREE.Vector3, direction: THREE.Vector3, floorY: FloorY, muzzle?: THREE.Vector3, targets: Iterable<THREE.Object3D> = AIM.targets, solids: Iterable<THREE.Object3D> = AIM.solids): Aimed {
  return castAim(new THREE.Raycaster(origin, direction.clone().normalize()), floorY, muzzle, targets, solids);
}
function castAim(ray: THREE.Raycaster, floorY: FloorY, muzzle: THREE.Vector3 | undefined, targets: Iterable<THREE.Object3D>, solids: Iterable<THREE.Object3D>): Aimed {
  ray.far = RANGE;
  const nearest = (list: Iterable<THREE.Object3D>, deep: boolean) => ray.intersectObjects([...list], deep)[0];
  const [target, wall] = [nearest(targets, false), nearest(solids, true)];
  const floor = typeof floorY === "number" ? ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), new THREE.Vector3()) : null;
  const floorAt = typeof floorY === "number" ? (floor ? floor.distanceTo(ray.ray.origin) : Infinity) : groundHit(ray.ray, floorY, RANGE);
  const stops: [number, Aimed["kind"], THREE.Object3D?][] = [[floorAt, "ground"], [wall?.distance ?? Infinity, "wall"], [target?.distance ?? Infinity, "target", target?.object]];
  const [distance, kind, object] = stops.reduce((best, s) => (s[0] < best[0] ? s : best));
  if (!isFinite(distance) || distance > RANGE) return { kind: "none", point: ray.ray.at(RANGE, new THREE.Vector3()), distance: RANGE };
  const point = ray.ray.at(distance, new THREE.Vector3());
  const info = object && aimInfoOf(object);
  const out: Aimed = { kind, point, distance, ...(info ? { label: info.label, onTap: info.onTap, plan: info.plan } : {}), ...(object?.userData?.person ? { person: true } : {}) };
  if (muzzle) {
    const to = point.clone().sub(muzzle);
    const length = to.length();
    const shot = new THREE.Raycaster(muzzle, to.normalize(), 0, Math.max(0, length - 0.06));
    const stop = shot.intersectObjects([...solids], true)[0];
    if (stop) out.blocked = stop.point.clone();
  }
  return out;
}

// What the crosshair says now, for the overlay (a DOM element over the canvas): kept in a store so that the 3D scene need not render it
export interface Reticle { kind: Aimed["kind"]; label?: string; feet?: number; blocked: boolean; note?: string }
export const useReticle = create<Reticle>(() => ({ kind: "none", blocked: false }));
// Squares are five feet across
export const FEET_PER_SQUARE = 5;
