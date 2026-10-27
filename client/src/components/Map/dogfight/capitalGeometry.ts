// The hulls of the big ships and the station, built in code from the same measures the rules use (`hullSpec`, `CLASSES`, the parts' places in
// shared/logic/dogfight.ts), so that a turret stands on its deck and a shot at the model meets the hull. Three pieces come back: the hull
// (drawn with the paneled, parallax hull material), dark inset plates and trenches, and the lights (engines, bays, windows).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRandom } from "@shared/logic";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CLASSES, WEDGE, hullSpec, isCapital, type ArenaClass } from "@shared/logic/dogfight";
import { worldUV } from "./hullSurface";

export interface Engine { at: V3; r: number }
export interface CapitalGeometry { hull: THREE.BufferGeometry; dark: THREE.BufferGeometry; glow: THREE.BufferGeometry; engines: Engine[] }
type V3 = [number, number, number];

const place = (g: THREE.BufferGeometry, at: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  return g;
};
const box = (w: number, h: number, d: number, at: V3, rot?: V3) => place(new THREE.BoxGeometry(w, h, d), at, rot);
const cyl = (rt: number, rb: number, h: number, at: V3, rot?: V3, seg = 20) => place(new THREE.CylinderGeometry(rt, rb, h, seg), at, rot);
const sphere = (r: number, at: V3, scale?: V3, seg = 24) => place(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), at, [0, 0, 0], scale);
// A prism over a plan polygon (x, z) from y0 up to y1, with a small bevel to catch the light
function prism(plan: [number, number][], y0: number, y1: number, bevel = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(plan.map(([x, z]) => new THREE.Vector2(x, -z)));
  const depth = Math.max(0.1, y1 - y0 - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}
// (an empty list merges to an empty geometry)
const merge = (parts: THREE.BufferGeometry[], tile: number) => {
  if (!parts.length) return new THREE.BufferGeometry();
  const g = parts.map((p) => worldUV(p, tile));
  for (const p of parts) p.dispose();
  const merged = mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  for (const x of g) x.dispose();
  return merged ?? new THREE.BufferGeometry();
};
const flat = (parts: THREE.BufferGeometry[]) => {
  if (!parts.length) return new THREE.BufferGeometry();
  const g = parts.map((p) => (p.index ? p.toNonIndexed() : p.clone()));
  for (const p of g) {
    for (const name of Object.keys(p.attributes)) if (name !== "position" && name !== "normal") p.deleteAttribute(name);
  }
  const merged = mergeGeometries(g, false);
  return merged ?? new THREE.BufferGeometry();
};

// Paint over the livery, as vertex colours the hull material multiplies its plates by (the map model's colours: the plain hull, its dark engine
// block and seams, its red stripe, and the wedge's upper tier a shade darker)
const PAINT = { hull: [1, 1, 1], dark: [0.5, 0.53, 0.57], stripe: [0.95, 0.36, 0.3], shade: [0.92, 0.92, 0.92] } as const;
const painted = (g: THREE.BufferGeometry, rgb: readonly number[]) => {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
};
// A hull turned round the x axis, as the map's `hullAlongX`: points are [radius, x] from stern to bow; `phi` limits it to a band round the axis
// (the top is at 3π/2)
const alongX = (profile: [number, number][], at: V3, seg = 40, phi?: [number, number]) => {
  const g = new THREE.LatheGeometry(profile.map(([r, a]) => new THREE.Vector2(r, a)), seg, phi?.[0], phi?.[1]);
  g.rotateZ(-Math.PI / 2);
  g.translate(...at);
  return g;
};
const rounded = (size: V3, r: number, at: V3) => place(new RoundedBoxGeometry(size[0], size[1], size[2], 3, r), at);

// The corvette (models.tsx buildShip, the last kind): built in the map model's units (6 by 4 squares, bow to +x) and stretched to the class
function corvette(half: V3, hull: THREE.BufferGeometry[], dark: THREE.BufferGeometry[], glow: THREE.BufferGeometry[], engines: Engine[]) {
  const [hx, hy, hz] = half;
  const [sx, sy, sz] = [hx / 2.95, hy / 0.65, hz / 1.3];
  const m = new THREE.Matrix4().makeScale(sx, sy, sz).multiply(new THREE.Matrix4().makeTranslation(0.15, -1, 0));
  const fit = (g: THREE.BufferGeometry, paint: readonly number[] = PAINT.hull) => painted(g.applyMatrix4(m), paint);
  const at = (p: V3): V3 => {
    const v = new THREE.Vector3(...p).applyMatrix4(m);
    return [v.x, v.y, v.z];
  };
  // The hammerhead bow, the neck and the engine block
  hull.push(fit(rounded([1.0, 0.9, 2.4], 0.3, [2.3, 1.0, 0])));
  const neck: [number, number][] = [[0.42, 0], [0.42, 0.2], [0.34, 1.0], [0.3, 2.6], [0.36, 3.0], [0.36, 3.2]];
  hull.push(fit(alongX(neck, [-1.2, 1.0, 0])));
  hull.push(fit(rounded([1.8, 1.3, 2.6], 0.25, [-1.9, 1.0, 0]), PAINT.dark));
  // The red stripe along the top of the neck (a band of a hull a little wider than it), and seams round the blocks
  const stripe: [number, number][] = [[0.39 * 1.02, 0.5], [0.34 * 1.02, 1.0], [0.3 * 1.02, 2.6], [0.36 * 1.02, 3.0], [0.36 * 1.02, 3.1]];
  hull.push(fit(alongX(stripe, [-1.2, 1.0, 0], 8, [Math.PI * 1.5 - 0.35, 0.7]), PAINT.stripe));
  for (const x of [-1.45, -2.35]) hull.push(fit(rounded([0.06, 1.32, 2.62], 0.03, [x, 1.0, 0]), PAINT.dark));
  hull.push(fit(rounded([0.05, 0.92, 2.42], 0.03, [2.0, 1.0, 0]), PAINT.dark));
  // Eight engines in two rows, their housings in the hull and their flares drawn by the component
  for (let i = 0; i < 8; i++) {
    const [y, z] = [0.68 + (i % 2) * 0.62, -0.95 + Math.floor(i / 2) * 0.63];
    hull.push(fit(alongX([[0, 0], [0.2, 0], [0.24, 0.12], [0.24, 0.3], [0.3, 0.4]], [-3.1, y, z], 16), PAINT.dark));
    engines.push({ at: at([-3.13, y, z]), r: 0.2 * (sy + sz) / 2 });
  }
  // The bridge's glass across the bow, and rows of lit ports along the bow block and the neck
  dark.push(box(0.06, 0.24, 1.2, [2.82, 1.12, 0]).applyMatrix4(m));
  for (const s of [1, -1]) {
    for (let i = 0; i < 7; i++) for (const y of [0.82, 1.18]) glow.push(box(0.05, 0.03, 0.01, [1.92 + i * 0.12, y, s * 1.203]).applyMatrix4(m));
    for (let i = 0; i < 14; i++) {
      const x = -0.9 + i * 0.2;
      const r = 0.3 + 0.04 * Math.abs(Math.sin(i));
      glow.push(box(0.06, 0.025, 0.01, [x, 1.0, s * (r + 0.006)]).applyMatrix4(m));
    }
  }
}

// The Empire's wedge (models.tsx buildShip, `imperial`): the lower tier and the upper one in the map model's units stretched to the class; the
// tower, the bridge and its domes at the beam's scale so that they keep their shape. `domes`: draw the domes (a ship with shield generators
// has them as its parts, which go dark when they are shot out)
function wedge(half: V3, domes: boolean, hull: THREE.BufferGeometry[], dark: THREE.BufferGeometry[], glow: THREE.BufferGeometry[], engines: Engine[]) {
  const [hx, hy, hz] = half;
  const [sx, sy, sz] = [hx / 2.75, hy / 0.4, hz / 1.75];
  const m = new THREE.Matrix4().makeScale(sx, sy, sz).multiply(new THREE.Matrix4().makeTranslation(-0.15, -1.05, 0));
  const fit = (g: THREE.BufferGeometry, paint: readonly number[] = PAINT.hull) => painted(g.applyMatrix4(m), paint);
  const at = (p: V3): V3 => {
    const v = new THREE.Vector3(...p).applyMatrix4(m);
    return [v.x, v.y, v.z];
  };
  hull.push(fit(prism([[2.9, 0], [-2.6, 1.75], [-2.45, 0], [-2.6, -1.75]], 0.65, 1.15, 0.015)));
  hull.push(fit(prism([[2.2, 0], [-2.1, 1.2], [-2.2, 0], [-2.1, -1.2]], 1.15, 1.45, 0.025), PAINT.shade));
  // Rows of lit ports along the lower tier's flanks
  const edge = Math.atan2(-1.75, -5.5);
  for (const s of [1, -1]) {
    for (let i = 0; i < 30; i++) {
      const t = 0.12 + i * 0.026;
      const [x, z] = [2.9 - 5.5 * t, 1.75 * t * s];
      for (const y of [0.8, 0.98]) glow.push(place(new THREE.BoxGeometry(0.06, 0.012, 0.01), [x + 0.0067, y, z + 0.021 * s], [0, edge * s, 0]).applyMatrix4(m));
    }
  }
  // The tower astern, at the beam's scale on the deck of the upper tier
  const u = sz;
  const tower = new THREE.Matrix4().makeTranslation(WEDGE.tower * hx, hy, 0).multiply(new THREE.Matrix4().makeScale(u, u, u));
  const raise = (g: THREE.BufferGeometry, paint: readonly number[] = PAINT.hull) => painted(g.applyMatrix4(tower), paint);
  hull.push(raise(rounded([0.7, 0.58, 0.5], 0.06, [0, 0.27, 0])));
  hull.push(raise(rounded([0.3, 0.12, 1.1], 0.04, [0, 0.6, 0]), PAINT.dark));
  if (domes) for (const z of [-0.42, 0.42]) hull.push(raise(sphere(0.13, [0, 0.73, z], undefined, 16)));
  glow.push(box(0.01, 0.03, 0.9, [0.152, 0.6, 0]).applyMatrix4(tower));
  // Three engines across the stern
  for (const z of [-0.6, 0, 0.6]) {
    const p = at([-2.62, 0.95, z]);
    hull.push(painted(cyl(0.26 * u, 0.3 * u, 0.14 * u, p, [0, 0, Math.PI / 2], 20), PAINT.dark));
    engines.push({ at: [p[0] - 0.1 * u, p[1], p[2]], r: 0.24 * u });
  }
}

export function capitalGeometry(cls: ArenaClass, role: string, seed: number, imperial = false): CapitalGeometry {
  const spec = hullSpec(cls, role, imperial);
  const half = CLASSES[cls].half;
  const rand = createRandom(seed + 11).next;
  const hull: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const engines: Engine[] = [];
  const tile = cls === "Station" ? 260 : cls === "Gargantuan" ? 170 : cls === "Huge" ? 110 : 36;

  switch (spec.style) {
    case "corvette":
      corvette(half, hull, dark, glow, engines);
      break;
    case "wedge":
      wedge(half, !isCapital(cls), hull, dark, glow, engines);
      break;
    case "station": {
      const R = half[0];
      hull.push(place(new THREE.SphereGeometry(R, 128, 96), [0, 0, 0]));
      // The equatorial trench: a dark band set into the shell, lit along both lips
      dark.push(place(new THREE.CylinderGeometry(R * 1.001, R * 1.001, 70, 160, 1, true), [0, 0, 0]));
      glow.push(...[-36, 36].map((y) => place(new THREE.TorusGeometry(Math.sqrt(R * R - y * y) * 1.002, 1.6, 6, 220), [0, y, 0], [Math.PI / 2, 0, 0])));
      // Plating and machinery all over the shell
      for (let i = 0; i < 1100; i++) {
        const lon = rand() * Math.PI * 2;
        const lat = Math.asin(rand() * 2 - 1);
        if (Math.abs(lat) < 0.045) continue;
        const w = 10 + rand() * 40;
        const d = 10 + rand() * 40;
        const h = 3 + rand() * 12;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)));
        const g = new THREE.BoxGeometry(w, h, d);
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(lat) * Math.cos(lon) * (R + h * 0.3), Math.sin(lat) * (R + h * 0.3), Math.cos(lat) * Math.sin(lon) * (R + h * 0.3)), q, new THREE.Vector3(1, 1, 1)));
        hull.push(g);
      }
      // Lit windows scattered on the shell
      for (let i = 0; i < 700; i++) {
        const lon = rand() * Math.PI * 2;
        const lat = Math.asin(rand() * 2 - 1);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)));
        const g = new THREE.BoxGeometry(5 + rand() * 7, 0.5, 2.4);
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(lat) * Math.cos(lon) * (R + 1.2), Math.sin(lat) * (R + 1.2), Math.cos(lat) * Math.sin(lon) * (R + 1.2)), q, new THREE.Vector3(1, 1, 1)));
        glow.push(g);
      }
      break;
    }
  }
  return { hull: merge(hull, tile), dark: flat(dark), glow: flat(glow), engines };
}
