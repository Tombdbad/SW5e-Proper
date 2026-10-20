// Looking and aiming from inside the map (2026-10-19): the view store (overhead, over the shoulder, first person), the registry
// of what can be aimed at, and the maths of what is under the crosshair. Pure but for three.js objects: tests/interiors/aim.test.ts
// raycasts in node. The crosshair is the middle of the canvas, so the ray is cast from the camera through NDC (0, 0); the game's own
// rules (reach, range, cover: `attackPlan`, `reachable`) are asked by whoever acts on the target, not worked out again here.
import * as THREE from "three";
import { create } from "zustand";

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
// `eyes` is true while the camera is at the character (ViewRig is mounted), for what is drawn to be read from above (name labels)
export const useView = create<{ mode: ViewMode; eyes: boolean; set: (mode: ViewMode) => void; next: () => void }>((set, get) => ({
  mode: saved(),
  eyes: false,
  set: (mode) => {
    try { localStorage.setItem("sw5e.view", mode); } catch {}
    set({ mode });
  },
  next: () => get().set(VIEW_MODES[(VIEW_MODES.indexOf(get().mode) + 1) % VIEW_MODES.length]),
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
export const PITCH: Record<Exclude<ViewMode, "overhead">, [number, number]> = { first: [-1.3, 1.3], shoulder: [-0.7, 1.0] };

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
  const head = feet.clone().add(new THREE.Vector3(0, EYE, 0));
  const muzzle = head.clone().add(right.clone().multiplyScalar(0.18)).add(new THREE.Vector3(0, -0.12, 0));
  if (mode === "first") return { position: head, look: head.clone().add(dir.clone().multiplyScalar(20)), muzzle };
  const pivot = head.clone().add(right.clone().multiplyScalar(0.18));
  let want = pivot.clone().add(dir.clone().multiplyScalar(-2.2)).add(right.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.3, 0));
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
}

const RANGE = 40;
// What is under the crosshair of `camera`. `floorY` is the height of the floor being walked; `muzzle` (over the shoulder) is where
// a shot leaves from, and a wall between it and the aimed point marks the aim blocked. Matrices are as of the last frame
export function aimAt(camera: THREE.Camera, floorY: number, muzzle?: THREE.Vector3, targets: Iterable<THREE.Object3D> = AIM.targets, solids: Iterable<THREE.Object3D> = AIM.solids): Aimed {
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  ray.far = RANGE;
  const nearest = (list: Iterable<THREE.Object3D>, deep: boolean) => ray.intersectObjects([...list], deep)[0];
  const [target, wall] = [nearest(targets, false), nearest(solids, true)];
  const floor = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), new THREE.Vector3());
  const floorAt = floor ? floor.distanceTo(ray.ray.origin) : Infinity;
  const stops: [number, Aimed["kind"], THREE.Object3D?][] = [[floorAt, "ground"], [wall?.distance ?? Infinity, "wall"], [target?.distance ?? Infinity, "target", target?.object]];
  const [distance, kind, object] = stops.reduce((best, s) => (s[0] < best[0] ? s : best));
  if (!isFinite(distance) || distance > RANGE) return { kind: "none", point: ray.ray.at(RANGE, new THREE.Vector3()), distance: RANGE };
  const point = ray.ray.at(distance, new THREE.Vector3());
  const info = object && aimInfoOf(object);
  const out: Aimed = { kind, point, distance, ...(info ? { label: info.label, onTap: info.onTap, plan: info.plan } : {}) };
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
