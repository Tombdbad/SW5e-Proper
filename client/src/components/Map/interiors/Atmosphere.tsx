// The light and air of a room (see atmosphere.ts): coloured lights that flicker where a flame or a failing tube
// would, lamps you can see, motes drifting in the air, a shaft of light from a window, a ground mist. Drawn for the
// room that is open and nothing else; a phone gets two lights and half the motes.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Model, MATERIALS, C, shade, type Kit } from "../models";
import { budgetOf, flickerAt, moteCount, type LightSpot, type Mood, type Tier } from "./atmosphere";
import { stream } from "./cave";
import type { RoomLook } from "./wealth";

// A lamp you can see: a tallow candle, a bare cage bulb, a glowing globe, a brass lantern
function buildLamp(k: Kit, style: RoomLook["lamp"], light: string) {
  switch (style) {
    case "tallow":
      k.cyl(0.05, 0.14, "#d8cfae", { at: [0, 0.07, 0], seg: 8 });
      k.cone(0.025, 0.07, light, { at: [0, 0.18, 0], seg: 5, finish: "glow" });
      break;
    case "bulb":
      k.cyl(0.02, 0.5, "#2a2f36", { at: [0, 0.25, 0], seg: 5 });
      k.sphere(0.07, light, { at: [0, -0.02, 0], seg: [8, 6], finish: "glow" });
      k.torus(0.08, 0.008, C.steelDark, { at: [0, -0.02, 0], rot: [Math.PI / 2, 0, 0], seg: [4, 10], finish: "sheen" });
      break;
    case "glow":
      k.cyl(0.015, 0.4, "#2a2f36", { at: [0, 0.2, 0], seg: 5 });
      k.sphere(0.12, light, { at: [0, -0.06, 0], seg: [10, 8], finish: "glow" });
      break;
    default:
      k.cyl(0.015, 0.3, C.gold, { at: [0, 0.15, 0], seg: 5, finish: "sheen" });
      k.lathe([[0.1, -0.2], [0.12, -0.1], [0.1, 0.05], [0.04, 0.1], [0, 0.1]], C.gold, { seg: 8, finish: "sheen" });
      k.sphere(0.065, light, { at: [0, -0.06, 0], seg: [8, 6], finish: "glow" });
  }
}

const Spot = ({ spot, w, h, lamp, tier, shadow }: { spot: LightSpot; w: number; h: number; lamp: RoomLook["lamp"]; tier: Tier; shadow?: boolean }) => {
  const light = useRef<THREE.PointLight>(null);
  const at: [number, number, number] = [spot.x * w, spot.h, spot.y * h];
  useFrame(({ clock }) => {
    if (light.current && spot.flicker) light.current.intensity = spot.intensity * flickerAt(spot, clock.elapsedTime);
  });
  return (
    <group position={at}>
      <pointLight ref={light} color={spot.color} intensity={spot.intensity} distance={spot.distance} decay={1.4} castShadow={shadow && tier === "full"} shadow-mapSize-width={512} shadow-mapSize-height={512} />
      <Model id={`lamp:${lamp}:${spot.color}`} shadow={false} build={(k) => buildLamp(k, lamp, spot.color)} />
    </group>
  );
};

// Soft-edged sprites for the effects below (2026-10-27, the user: the effects looked weird and blocky): a point is a square on the screen and a
// disc or slab has a hard rim, so each is given an alpha that fades to nothing at its edges. Made once, in a browser only.
const SOFT = new Map<string, THREE.CanvasTexture>();
function soft(kind: "dot" | "beam"): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const have = SOFT.get(kind);
  if (have) return have;
  const [w, h] = kind === "beam" ? [32, 128] : [64, 64];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const image = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2 - 1;
      const v = ((y + 0.5) / h) * 2 - 1;
      // a dot and a mist disc: a smooth fall from the middle; a beam: soft across, and fading out at both ends
      const a = kind === "beam" ? Math.pow(Math.max(0, 1 - u * u), 1.6) * Math.pow(Math.max(0, 1 - v * v), 0.8) : Math.pow(Math.max(0, 1 - (u * u + v * v)), 1.5);
      const i = (y * w + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(image, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  SOFT.set(kind, t);
  return t;
}

// Motes in the air: a few dozen points drifting slowly up and across (a quarter of their old size: 2026-10-27, the user: 75% smaller)
const MOTE_SIZE = 0.07 * 0.25;
function Motes({ count, w, h, color }: { count: number; w: number; h: number; color: string }) {
  const points = useRef<THREE.Points>(null);
  const seeds = useMemo(() => {
    const next = stream(count * 31 + Math.round(w * 7 + h));
    return Array.from({ length: count }, () => ({ x: next() * w, y: next() * 3, z: next() * h, vx: (next() - 0.5) * 0.12, vy: 0.02 + next() * 0.08, vz: (next() - 0.5) * 0.12 }));
  }, [count, w, h]);
  const position = useMemo(() => new Float32Array(count * 3), [count]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      position[i * 3] = ((s.x + s.vx * t + Math.sin(t * 0.3 + i) * 0.15) % w + w) % w;
      position[i * 3 + 1] = (s.y + s.vy * t) % 3;
      position[i * 3 + 2] = ((s.z + s.vz * t + Math.cos(t * 0.27 + i) * 0.15) % h + h) % h;
    });
    const attr = points.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (attr) attr.needsUpdate = true;
  });
  if (!count) return null;
  return (
    // (keyed by the count: a buffer cannot be resized, so a room with another number of motes is another set of points. Without the key the old
    // buffer was handed an array of another size and drawing threw on every frame, which stopped the page's other canvases drawing too.)
    <points key={count} ref={points} frustumCulled={false} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={position} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color={color} size={MOTE_SIZE} map={soft("dot") ?? undefined} sizeAttenuation transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

// A slanting shaft of light: a long, faint, additive slab from a high window to the floor
function Shaft({ w, h, color, strength }: { w: number; h: number; color: string; strength: number }) {
  const slab = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = slab.current?.material as THREE.MeshBasicMaterial | undefined;
    if (m) m.opacity = strength * (0.32 + 0.05 * Math.sin(clock.elapsedTime * 0.7));
  });
  const length = Math.hypot(2.8, h * 0.45);
  return (
    <mesh ref={slab} position={[w * 0.35, 1.4, h * 0.3]} rotation={[0.9, 0.3, 0.12]} raycast={() => null} renderOrder={3}>
      <planeGeometry args={[Math.min(2.4, w * 0.3), length]} />
      <meshBasicMaterial color={color} map={soft("beam") ?? undefined} transparent opacity={strength * 0.32} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Low mist over the floor: soft discs of the fog's colour turning slowly
function Mist({ w, h, color, density }: { w: number; h: number; color: string; density: number }) {
  const group = useRef<THREE.Group>(null);
  const discs = useMemo(() => {
    const next = stream(Math.round(w * 13 + h * 7));
    return Array.from({ length: Math.min(6, Math.max(2, Math.round(w * h * density * 0.4))) }, () => ({ x: next() * w, z: next() * h, r: 1.6 + next() * 2, y: 0.25 + next() * 0.5, o: 0.05 + next() * 0.05 }));
  }, [w, h, density]);
  useFrame(({ clock }) => {
    if (group.current) group.current.children.forEach((c, i) => { c.rotation.z = clock.elapsedTime * 0.04 * (i % 2 ? 1 : -1); });
  });
  return (
    <group ref={group}>
      {discs.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={2}>
          <planeGeometry args={[d.r * 2, d.r * 2]} />
          <meshBasicMaterial color={color} map={soft("dot") ?? undefined} transparent opacity={d.o * 1.6} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// `shaft`: how much of the mood's shaft of light is drawn (0 at night, and in a room whose windows let in the real sun)
// `day`: the daylight outside (0 at night): the key light is the sky through the windows, so it is dark at night, and the room's own
// ambient fill dims to under half, that its lamps' shadows show (2026-11-03, the user: interior shadows by the lights within the room)
export function Atmosphere({ mood, look, w, h, tier, shaft = 1, day = 1 }: { mood: Mood; look: RoomLook; w: number; h: number; tier: Tier; shaft?: number; day?: number }) {
  const m = useMemo(() => budgetOf(mood, tier), [mood, tier]);
  const motes = moteCount(m, w, h, tier);
  // Each light gets its own colour from the mood; the lamps you see are of the wealth's style
  return (
    <group>
      <ambientLight color={m.ambient.color} intensity={m.ambient.intensity * 0.55 * (0.4 + 0.6 * day)} />
      {m.key.intensity * day > 0 && <directionalLight color={m.key.color} intensity={m.key.intensity * day} position={[w * 0.3, 14, h * 0.2]} />}
      {m.spots.map((s, i) => <Spot key={i} spot={s} w={w} h={h} lamp={look.lamp} tier={tier} shadow />)}
      <Motes count={motes} w={w} h={h} color={m.mote} />
      {m.shaft && shaft > 0 && <Shaft w={w} h={h} color={m.shaft.color} strength={m.shaft.strength * shaft} />}
      {m.fog && tier === "full" && <Mist w={w} h={h} color={m.fog.color === "#000000" ? "#888888" : shade(m.fog.color, 3)} density={m.fog.density * 20} />}
    </group>
  );
}

export { MATERIALS };
