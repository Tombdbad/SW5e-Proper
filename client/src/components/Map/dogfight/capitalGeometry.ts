// The hulls of the big ships and the station, built in code from the same measures the rules use (`hullSpec`, `CLASSES`, the parts' places in
// shared/logic/dogfight.ts), so that a turret stands on its deck and a shot at the model meets the hull. Three pieces come back: the hull
// (drawn with the paneled, parallax hull material), dark inset plates and trenches, and the lights (engines, bays, windows).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRandom } from "@shared/logic";
import { CLASSES, deckHalfWidth, hullSpec, type ArenaClass } from "@shared/logic/dogfight";
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
const mirrored = (pts: [number, number][]): [number, number][] => [...pts, ...[...pts].reverse().map(([x, z]) => [x, -z] as [number, number])];
const merge = (parts: THREE.BufferGeometry[], tile: number) => {
  const g = parts.map((p) => worldUV(p, tile));
  for (const p of parts) p.dispose();
  const merged = mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  for (const x of g) x.dispose();
  return merged ?? new THREE.BufferGeometry();
};
const flat = (parts: THREE.BufferGeometry[]) => {
  const g = parts.map((p) => (p.index ? p.toNonIndexed() : p.clone()));
  for (const p of g) {
    for (const name of Object.keys(p.attributes)) if (name !== "position" && name !== "normal") p.deleteAttribute(name);
  }
  const merged = mergeGeometries(g, false);
  return merged ?? new THREE.BufferGeometry();
};

// Small blocks scattered over a deck, inside its outline: the machinery of a big ship
function greebles(rand: () => number, count: number, inside: (x: number, z: number) => boolean, ext: { x: [number, number]; z: [number, number] }, y: number, size: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
    const x = ext.x[0] + rand() * (ext.x[1] - ext.x[0]);
    const z = ext.z[0] + rand() * (ext.z[1] - ext.z[0]);
    if (!inside(x, z)) continue;
    const w = size * (0.3 + rand() * 1.1);
    const d = size * (0.3 + rand() * 1.1);
    const h = size * (0.12 + rand() * 0.5);
    if (!inside(x + w / 2, z + d / 2) || !inside(x - w / 2, z - d / 2)) continue;
    out.push(box(w, h, d, [x, y + h / 2 - 0.3, z], [0, rand() < 0.2 ? 0.4 : 0, 0]));
    i++;
  }
  return out;
}

export function capitalGeometry(cls: ArenaClass, role: string, seed: number): CapitalGeometry {
  const spec = hullSpec(cls, role);
  const [hx, hy, hz] = CLASSES[cls].half;
  const rand = createRandom(seed + 11).next;
  const hull: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const engines: Engine[] = [];
  // A nozzle: a dark housing in the hull geometry, and the engine's flare drawn by the component
  const nozzle = (x: number, y: number, z: number, r: number) => {
    hull.push(cyl(r * 1.18, r * 1.35, r * 0.9, [x + r * 0.2, y, z], [0, 0, Math.PI / 2], 24));
    engines.push({ at: [x - r * 0.3, y, z], r });
  };
  const tile = cls === "Station" ? 260 : cls === "Gargantuan" ? 170 : cls === "Huge" ? 110 : 36;

  switch (spec.style) {
    case "wedge": {
      const wedge = (s: number, sz: number): [number, number][] => [[hx * s, 0], [-hx * s, hz * sz], [-hx * s, -hz * sz]];
      hull.push(prism(wedge(1, 1), -hy * 0.1, hy, 1.2));
      hull.push(prism(wedge(0.86, 0.72), -hy, -hy * 0.1, 1.2));
      // The tower and bridge
      const [tx, th] = spec.tower;
      hull.push(box(18, th * 0.8, 20, [tx, hy + th * 0.4, 0]));
      hull.push(box(52, 8, 22, [tx - 2, hy + th * 0.8 + 3, 0]));
      hull.push(box(6, 9, 30, [tx - 6, hy + th * 0.8 + 10, 0]));
      for (const z of [-17, 17]) hull.push(sphere(3.2, [tx - 4, hy + th * 0.8 + 11, z]));
      // Engines
      hull.push(box(10, hy * 1.7, hz * 1.5, [-hx - 4, -hy * 0.1, 0]));
      for (let i = 0; i < 5; i++) nozzle(-hx - 10, -hy * 0.1, (i - 2) * hz * 0.32, i === 2 ? 11 : 8);
      // The trench down the deck and the lit slots along it
      dark.push(box(hx * 1.3, 1.6, 6, [-hx * 0.1, hy + 0.2, 0]));
      for (let i = 0; i < 12; i++) glow.push(box(4, 0.4, 1.4, [-hx * 0.7 + i * hx * 0.1, hy + 1.1, 4.2]));
      // The deck's machinery
      const half = (x: number) => deckHalfWidth(cls, role, x) * 0.96;
      hull.push(...greebles(rand, 520, (x, z) => x > -hx * 0.96 && x < hx * 0.94 && Math.abs(z) < half(x) && Math.abs(z) > 4, { x: [-hx, hx], z: [-hz, hz] }, hy, 7));
      break;
    }
    case "carrier": {
      const plan: [number, number][] = [[hx, hz * 0.5], [hx * 0.92, hz], [-hx, hz], [-hx, -hz], [hx * 0.92, -hz], [hx, -hz * 0.5]];
      hull.push(prism(plan, -hy, hy, 1.4));
      // The island, the flight deck's lit edges and the bays' mouths
      const [tx, th] = spec.tower;
      hull.push(box(22, th, 16, [tx, hy + th / 2, 0]));
      hull.push(box(30, 8, 40, [tx - 3, hy + th + 3, 0]));
      dark.push(box(hx * 1.1, 0.6, hz * 1.2, [hx * 0.05, hy + 0.15, 0]));
      for (let i = 0; i < 16; i++) for (const z of [-hz * 0.62, hz * 0.62]) glow.push(box(3, 0.5, 1.2, [-hx * 0.5 + i * hx * 0.07, hy + 0.7, z]));
      hull.push(box(10, hy * 1.8, hz * 1.7, [-hx - 4, 0, 0]));
      for (let i = 0; i < 4; i++) nozzle(-hx - 10, 0, (i - 1.5) * hz * 0.4, 9);
      // Hangar mouths under the bow and amidships
      for (const x of [hx * 0.3, -hx * 0.02]) {
        dark.push(box(36, 0.8, 40, [x, -hy - 0.1, 0]));
        glow.push(box(30, 0.5, 34, [x, -hy - 0.5, 0]));
      }
      hull.push(...greebles(rand, 360, (x, z) => x > -hx * 0.94 && x < hx * 0.9 && Math.abs(z) < hz * 0.9 && !(Math.abs(z) < 24 && Math.abs(x - tx) < 22), { x: [-hx, hx], z: [-hz, hz] }, hy, 6));
      break;
    }
    case "citadel": {
      const plan: [number, number][] = [[hx, hz * 0.4], [hx * 0.65, hz], [-hx, hz], [-hx, -hz], [hx * 0.65, -hz], [hx, -hz * 0.4]];
      const small = plan.map(([x, z]) => [x * 0.82, z * 0.74] as [number, number]);
      hull.push(prism(plan, -hy * 0.3, hy, 2));
      hull.push(prism(small, -hy, -hy * 0.3, 2));
      const [tx, th] = spec.tower;
      hull.push(box(46, th * 0.9, 46, [tx, hy + th * 0.45, 0]));
      hull.push(box(110, 14, 52, [tx - 6, hy + th * 0.9 + 6, 0]));
      hull.push(box(10, 36, 10, [tx - 12, hy + th * 0.9 + 28, 0]));
      for (const z of [-0.78, 0.78]) hull.push(box(40, 24, 24, [-hx * 0.2, hy + 10, hz * z]));
      hull.push(box(16, hy * 1.8, hz * 1.5, [-hx - 6, -hy * 0.15, 0]));
      for (let i = 0; i < 7; i++) nozzle(-hx - 14, -hy * 0.15, (i - 3) * hz * 0.28, 15);
      dark.push(box(hx * 1.5, 2, 12, [-hx * 0.1, hy + 0.3, hz * 0.5]), box(hx * 1.5, 2, 12, [-hx * 0.1, hy + 0.3, -hz * 0.5]));
      for (let i = 0; i < 24; i++) for (const z of [-hz * 0.5, hz * 0.5]) glow.push(box(6, 0.6, 2, [-hx * 0.8 + i * hx * 0.065, hy + 1.2, z + 7.5]));
      for (const x of [hx * 0.32, -hx * 0.1]) {
        dark.push(box(60, 1, 70, [x, -hy - 0.1, 0]));
        glow.push(box(50, 0.6, 58, [x, -hy - 0.6, 0]));
      }
      hull.push(...greebles(rand, 760, (x, z) => x > -hx * 0.96 && x < hx * 0.8 && Math.abs(z) < hz * 0.94 && !(Math.abs(z) < 30 && Math.abs(x - tx) < 40), { x: [-hx, hx], z: [-hz, hz] }, hy, 12));
      break;
    }
    case "frigate":
    case "cutter": {
      const plan: [number, number][] = [[hx, hz * 0.25], [hx * 0.7, hz], [-hx, hz], [-hx, -hz], [hx * 0.7, -hz], [hx, -hz * 0.25]];
      hull.push(prism(plan, -hy, hy, 0.6));
      hull.push(box(hx * 0.5, 7, hz * 0.8, [spec.tower[0], hy + 3.5, 0]));
      hull.push(box(12, 9, 14, [spec.tower[0] - 8, hy + 10, 0]));
      hull.push(cyl(hz * 0.55, hz * 0.7, 14, [-hx - 6, 0, 0], [0, 0, Math.PI / 2], 20));
      for (const z of [-hz * 0.4, 0, hz * 0.4]) nozzle(-hx - 12, 0, z, 3.4);
      dark.push(box(hx * 1.3, 0.5, 2.4, [0, hy + 0.1, 0]));
      for (let i = 0; i < 14; i++) glow.push(box(1.6, 0.3, 0.7, [-hx * 0.8 + i * hx * 0.11, hy + 0.5, 2.2]));
      hull.push(...greebles(rand, 90, (x, z) => x > -hx * 0.9 && x < hx * 0.6 && Math.abs(z) < hz * 0.8, { x: [-hx, hx], z: [-hz, hz] }, hy, 2.6));
      break;
    }
    case "station": {
      const R = hx;
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
