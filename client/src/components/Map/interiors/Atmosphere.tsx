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

// Motes in the air: a few dozen points drifting slowly up and across
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
    <points ref={points} frustumCulled={false} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={position} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.07} sizeAttenuation transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

// A slanting shaft of light: a long, faint, additive slab from a high window to the floor
function Shaft({ w, h, color, strength }: { w: number; h: number; color: string; strength: number }) {
  const slab = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = slab.current?.material as THREE.MeshBasicMaterial | undefined;
    if (m) m.opacity = strength * (0.1 + 0.015 * Math.sin(clock.elapsedTime * 0.7));
  });
  const length = Math.hypot(2.8, h * 0.45);
  return (
    <mesh ref={slab} position={[w * 0.35, 1.4, h * 0.3]} rotation={[0.9, 0.3, 0.12]} raycast={() => null} renderOrder={3}>
      <boxGeometry args={[Math.min(2.4, w * 0.3), length, 0.02]} />
      <meshBasicMaterial color={color} transparent opacity={strength * 0.1} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
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
          <circleGeometry args={[d.r, 20]} />
          <meshBasicMaterial color={color} transparent opacity={d.o} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function Atmosphere({ mood, look, w, h, tier }: { mood: Mood; look: RoomLook; w: number; h: number; tier: Tier }) {
  const m = useMemo(() => budgetOf(mood, tier), [mood, tier]);
  const motes = moteCount(m, w, h, tier);
  // Each light gets its own colour from the mood; the lamps you see are of the wealth's style
  return (
    <group>
      <ambientLight color={m.ambient.color} intensity={m.ambient.intensity * 0.55} />
      {m.key.intensity > 0 && <directionalLight color={m.key.color} intensity={m.key.intensity} position={[w * 0.3, 14, h * 0.2]} />}
      {m.spots.map((s, i) => <Spot key={i} spot={s} w={w} h={h} lamp={look.lamp} tier={tier} shadow={i === 0} />)}
      <Motes count={motes} w={w} h={h} color={m.mote} />
      {m.shaft && <Shaft w={w} h={h} color={m.shaft.color} strength={m.shaft.strength} />}
      {m.fog && tier === "full" && <Mist w={w} h={h} color={m.fog.color === "#000000" ? "#888888" : shade(m.fog.color, 3)} density={m.fog.density * 20} />}
    </group>
  );
}

export { MATERIALS };
