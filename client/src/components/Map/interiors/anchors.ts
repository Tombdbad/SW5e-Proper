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
