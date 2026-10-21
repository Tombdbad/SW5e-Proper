import * as THREE from "three";
// Where things are worn on a body, for every species (2026-10-20). The figure (models.tsx `buildHumanoid`) is built upright, facing +z, a
// little over a square tall for a human and then scaled by the species; what a species changes besides that is its bulk (how wide the hips
// and shoulders are), a lean (a hunched species carries everything above the waist forward), wings (a pack must stand clear of them) and
// a long neck (the head sits higher). One place says it, so that a holster, a pack, a buckle and a pauldron sit right on a Wookiee, a Jawa,
// a winged or a hunched species alike. Pure (tests/interiors/anchors.test.ts).
export type V3 = [number, number, number];
export interface BodyTraits {
  bulk: number;
  hunched?: boolean;
  wings?: boolean;
  longNeck?: boolean;
}
// A place on the body: where a model's origin goes and how it is turned (euler angles, XYZ order, as models.tsx's `matrixOf` takes them)
export interface Anchor {
  at: V3;
  rot: V3;
}
export type WornSlot = "hipR" | "hipL" | "back" | "belt" | "shoulder";

// The waist, where the torso begins, and how far a hunched torso leans forward (models.tsx: `k.group([0, 0.56, 0], [0.32, 0, 0], ...)`)
export const WAIST = 0.56;
export const LEAN = 0.32;

// A point and a turn carried on the leaning torso: the point is turned about the waist and the model leans with it
function lean(a: Anchor, hunched: boolean | undefined): Anchor {
  if (!hunched) return a;
  const [x, y, z] = a.at;
  const dy = y - WAIST;
  const [c, s] = [Math.cos(LEAN), Math.sin(LEAN)];
  return { at: [x, WAIST + dy * c - z * s, dy * s + z * c], rot: [a.rot[0] + LEAN, a.rot[1], a.rot[2]] };
}

export function bodyAnchor(slot: WornSlot, t: BodyTraits): Anchor {
  const b = t.bulk;
  switch (slot) {
    // On the hips, outside the hip, its back to the body: below the waist, so it does not lean
    case "hipR": return { at: [-(0.2 * b + 0.04), 0.5, 0], rot: [0, -Math.PI / 2, 0] };
    case "hipL": return { at: [0.2 * b + 0.04, 0.5, 0], rot: [0, Math.PI / 2, 0] };
    // On the back between the shoulder blades, clear of wings
    case "back": return lean({ at: [0, 0.92, -(0.15 * b + 0.07 + (t.wings ? 0.1 : 0))], rot: [0, Math.PI, 0] }, t.hunched);
    // At the front of the belt (the belt is a flattened ring at the waist)
    case "belt": return lean({ at: [0, WAIST + 0.05, 0.098 * b + 0.014], rot: [0, 0, 0] }, t.hunched);
    // On the right shoulder
    case "shoulder": return lean({ at: [-(0.2 * b + 0.03), WAIST + 0.4 + (t.longNeck ? 0 : 0), 0], rot: [0, 0, 0] }, t.hunched);
  }
}

// Where a held weapon or shield goes so that the hand closes on it: its origin and turn (euler XYZ) for a model that lies along +z, held
// along `dir` at `hand`. A model with a `grip` socket (the point of its own frame the hand takes, from the catalogue) is placed so that
// socket is exactly in the hand; one without is placed with the hand `grip` of the way along its length (0 the rear, 1 the point).
export function holdAt(hand: V3, dir: V3, length: number, scale: number, fraction: number, socket?: V3): Anchor {
  const d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  const e = new THREE.Euler().setFromQuaternion(q);
  const at = new THREE.Vector3(...hand);
  if (socket) at.sub(new THREE.Vector3(...socket).multiplyScalar(scale).applyQuaternion(q));
  else at.add(d.clone().multiplyScalar(length * scale * (0.5 - fraction)));
  return { at: [at.x, at.y, at.z], rot: [e.x, e.y, e.z] };
}

// Where the second hand of a two-handed weapon closes (2026-10-21): the weapon's `off_hand` socket, in the frame the figure holds it in (the
// same placement as `holdAt`, so the right hand stays on the grip). Null when the point is farther than an arm reaches from `shoulder`,
// when the hand stays where the pose puts it
export const ARM_REACH = 0.5;
export function offHandAt(hand: V3, dir: V3, length: number, scale: number, fraction: number, grip: V3 | undefined, offHand: V3, shoulder?: V3): V3 | null {
  const d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  const placed = holdAt(hand, dir, length, scale, fraction, grip);
  const at = new THREE.Vector3(...placed.at).add(new THREE.Vector3(...offHand).multiplyScalar(scale).applyQuaternion(q));
  if (shoulder && at.distanceTo(new THREE.Vector3(...shoulder)) > ARM_REACH) return null;
  return [at.x, at.y, at.z];
}

// ---- Things worn on the head, neck and trunk (2026-10-21). Their models are made a little over life size for a human head (a goggle band
// 0.12 wide, a helmet 0.2 tall); here each is fitted to the head the species has: as wide as the skull (the figure's `head()` scales a
// round skull to 0.92-1.25 of its width), at the eyes, the mouth, an ear or over the whole head, and carried forward by a snout, a beak or
// a muzzle. The coordinates are in the head's own frame (its centre at the origin, the face toward +z) for the head, in the torso's for the
// neck and the trunk. `box` is the model's own box (the catalogue): min x, y, z, max x, y, z.
export interface HeadTraits {
  // How wide the skull is against a round one (1), and how far it is lifted
  skull: number;
  lift?: number;
  // A snout, a beak, a muzzle or a trunk carries the mouth forward
  snout?: boolean;
}
export interface Fit {
  at: V3;
  rot: V3;
  scale: number;
}
type Box = number[];
const boxWidth = (box: Box) => Math.max(0.001, box[3] - box[0]);
const boxHeight = (box: Box) => Math.max(0.001, box[4] - box[1]);
export type HeadPlace = "eyes" | "mouth" | "earR" | "earL" | "cheek" | "helmet";
export const HEAD_PLACE: Record<string, HeadPlace> = {
  goggles: "eyes", sunshades: "eyes",
  respirator: "mouth", "underwater-respirator": "mouth", "vocoder-mask": "mouth",
  "commlink-hands-free": "earR", "ear-prosthesis": "earL", "facial-prosthesis": "cheek",
  "mandalorian-helmet": "helmet", "jensaarai-headgear": "helmet",
};
export function headFit(model: string, box: Box, t: HeadTraits): Fit | undefined {
  const place = HEAD_PLACE[model];
  if (!place) return undefined;
  const w = 0.115 * 2 * t.skull;
  const up = t.lift ?? 0;
  const out = t.snout ? 0.07 : 0;
  switch (place) {
    // A band across the eyes, as wide as the face
    case "eyes": return { at: [0, 0.025 + up, 0.078], rot: [0, 0, 0], scale: (w * 0.95) / boxWidth(box) };
    // Over the nose and mouth, forward of a snout
    case "mouth": return { at: [0, -0.04 + up, 0.082 + out], rot: [0, 0, 0], scale: Math.min(1.4, Math.max(1, (w * 0.7) / boxWidth(box))) };
    // An earpiece on the right ear, a prosthesis on the left
    case "earR": return { at: [-(0.115 * t.skull + 0.004), up, 0], rot: [0, 0, 0], scale: 1.2 };
    case "earL": return { at: [0.115 * t.skull + 0.004, up, 0], rot: [0, 0, 0], scale: 1.2 };
    case "cheek": return { at: [0.05 * t.skull, -0.015 + up, 0.098 + out * 0.5], rot: [0, 0, 0.2], scale: 1.1 };
    // A helmet covers the whole head, as wide as the skull and a little more
    case "helmet": return { at: [0, 0.012 + up, 0], rot: [0, 0, 0], scale: Math.min(1.9, (w * 1.12) / boxWidth(box)) };
  }
}
export type TorsoPlace = "chest" | "neck" | "collar";
export const TORSO_PLACE: Record<string, TorsoPlace> = { "torso-prosthesis": "chest", "tracker-utility-vest": "chest", amulet: "neck", "throat-prosthesis": "collar" };
// In the torso's frame (the origin at the waist): the chest 0.22 up, the throat 0.465 up
export function torsoFit(model: string, box: Box, bulk: number): Fit | undefined {
  const place = TORSO_PLACE[model];
  if (!place) return undefined;
  switch (place) {
    case "chest": return { at: [0, 0.22, 0.004], rot: [0, 0, 0], scale: Math.max(1, (0.4 * bulk) / boxWidth(box)) };
    // An amulet hangs on the chest from the neck, in front of the breastbone
    case "neck": return { at: [0, 0.34, 0.125 * bulk], rot: [0.12, 0, 0], scale: 1.6 };
    case "collar": return { at: [0, 0.465, 0], rot: [0, 0, 0], scale: Math.max(1, (0.11 * bulk) / boxWidth(box)) };
  }
}
export const heightOf = boxHeight;

// ---- Droid customizations drawn on the droid (2026-10-21). Each of the 48 module models (a chip about 0.1 across, a `mount` socket on its
// back) is fixed to the droid's body where its kind belongs: a sentry's dome on the top, repulsor lifts under the base, the rest in a ring
// round the barrel or the chest, facing out, a row of six at each height. The droid series says where the body is (droids are 0.8 or
// 1.25 tall: models.tsx figureSpec).
export type DroidBody = "barrel" | "biped";
export const bodyOfSeries = (series: string): DroidBody => (["astromech", "r5", "bb", "mouse", "gonk", "pit"].includes(series) ? "barrel" : "biped");
export interface ModuleAnchor extends Anchor {
  scale: number;
}
export function moduleAnchor(series: string, model: string, index: number): ModuleAnchor {
  const body = bodyOfSeries(series);
  const [height, radius, y0] = body === "barrel" ? [0.8, 0.2, 0.34] : [1.25, 0.17, 0.82];
  if (/sentry/.test(model)) return { at: [0, height + 0.02, 0], rot: [-Math.PI / 2, 0, 0], scale: 2.4 };
  if (/repulsor-lifts/.test(model)) return { at: [0, 0.03, 0], rot: [0, 0, 0], scale: 3 };
  const angle = Math.PI / 2 + (index % 6) * (Math.PI / 3);
  const lift = Math.floor(index / 6) * 0.12;
  return { at: [Math.sin(angle) * radius, y0 + lift, Math.cos(angle) * radius], rot: [0, angle, 0], scale: 2 };
}
