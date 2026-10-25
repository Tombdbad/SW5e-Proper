// The inside of the station (shared/logic/tunnel.ts has the geometry and the rules): a tunnel of paneled walls with lit gates, mines hanging
// in it, turrets on its walls and blast doors that shut like irises; at its end the reactor chamber with the core, and the exhaust shaft
// up out of the chamber's top. The party's craft and the chasers behind it are drawn here; the rules step in dogfightSim.ts.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CLASSES, type Dogfight, type Vessel } from "@shared/logic/dogfight";
import { TUNNEL, crossAxes, doorHole, type Tunnel } from "@shared/logic/tunnel";
import { ShipModel } from "../LocalMap";
import { hullMaterial, worldUV } from "./hullSurface";
import { useQuality } from "../siteAssets";

const TILE = 30;

// The tunnel's wall: a tube round the centre line, its frame carried along it so that it does not twist, texture coordinates in metres
function tubeGeometry(t: Tunnel): THREE.BufferGeometry {
  const seg = 28;
  const n = t.points.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let right = crossAxes(t.tangents[0]).right;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const tan = t.tangents[i];
    const dot = right[0] * tan[0] + right[1] * tan[1] + right[2] * tan[2];
    let r: [number, number, number] = [right[0] - tan[0] * dot, right[1] - tan[1] * dot, right[2] - tan[2] * dot];
    const rl = Math.hypot(...r) || 1;
    r = [r[0] / rl, r[1] / rl, r[2] / rl];
    right = r;
    const up: [number, number, number] = [tan[1] * r[2] - tan[2] * r[1], tan[2] * r[0] - tan[0] * r[2], tan[0] * r[1] - tan[1] * r[0]];
    if (i) s += Math.hypot(t.points[i][0] - t.points[i - 1][0], t.points[i][1] - t.points[i - 1][1], t.points[i][2] - t.points[i - 1][2]);
    const R = t.radii[i];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const d: [number, number, number] = [r[0] * Math.cos(a) + up[0] * Math.sin(a), r[1] * Math.cos(a) + up[1] * Math.sin(a), r[2] * Math.cos(a) + up[2] * Math.sin(a)];
      pos.push(t.points[i][0] + d[0] * R, t.points[i][1] + d[1] * R, t.points[i][2] + d[2] * R);
      nor.push(...d);
      uv.push(((j / seg) * 2 * Math.PI * R) / TILE, s / TILE);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const mineMat = new THREE.MeshStandardMaterial({ color: "#2b3036", roughness: 0.5, metalness: 0.7 });
const mineLight = new THREE.MeshBasicMaterial({ color: "#ff3b2e", toneMapped: false });
const turretMat = new THREE.MeshStandardMaterial({ color: "#3a4048", roughness: 0.5, metalness: 0.6 });
const leafMat = new THREE.MeshStandardMaterial({ color: "#4b535e", roughness: 0.45, metalness: 0.7, emissive: "#ff6a2a", emissiveIntensity: 0.0 });
const coreMat = new THREE.MeshBasicMaterial({ color: "#ffb04a", toneMapped: false });

export function StationInterior({ sim, view }: { sim: { current: { state: Dogfight } }; view?: { current: string } }) {
  const st = sim.current.state;
  const I = st.interior!;
  const T = I.tunnel;
  const tier = useQuality((q) => q.tier);
  const size = tier === "lite" ? 512 : 1024;
  const tube = useMemo(() => tubeGeometry(T), [T]);
  const chamber = useMemo(() => worldUV(new THREE.SphereGeometry(T.chamber.r, 64, 40, 0, Math.PI * 2, 0.345, Math.PI - 0.345), 28), [T]);
  const shaft = useMemo(() => worldUV(new THREE.CylinderGeometry(T.shaft.r, T.shaft.r, TUNNEL.shaft, 40, 24, true), 28), [T]);
  useEffect(() => () => { tube.dispose(); chamber.dispose(); shaft.dispose(); }, [tube, chamber, shaft]);
  const mat = useMemo(() => hullMaterial({ livery: "tunnel", size, parallax: tier === "lite" ? 0 : 0.035, steps: tier === "lite" ? 4 : 10, emissive: 1.8, side: THREE.DoubleSide, seed: 3 }), [size, tier]);
  const craft = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const coreGroup = useRef<THREE.Group>(null);
  const coreLight = useRef<THREE.PointLight>(null);
  const gates = useRef<(THREE.Mesh | null)[]>([]);
  const mines = useRef<(THREE.Group | null)[]>([]);
  const turrets = useRef<(THREE.Group | null)[]>([]);
  const leaves = useRef<(THREE.Group | null)[][]>(T.doors.map(() => []));
  const chasers = useRef<(THREE.Group | null)[]>([]);
  const me = st.vessels.find((v) => v.id === st.me) as Vessel;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const I2 = sim.current.state.interior;
    if (!I2) return;
    const c = I2.craft;
    if (craft.current) {
      craft.current.position.set(c.p[0], c.p[1], c.p[2]);
      craft.current.rotation.set(0, -c.yaw, c.pitch, "YZX");
      // (the pilot looks out of it, not at it)
      craft.current.visible = view?.current !== "cockpit";
    }
    if (light.current) light.current.position.set(c.p[0], c.p[1] + 3, c.p[2]);
    gates.current.forEach((g, i) => {
      if (!g) return;
      const m = g.material as THREE.MeshBasicMaterial;
      m.color.set(i < I2.gates ? "#3fd68a" : i === I2.gates ? "#ffcf5a" : "#6f8fb8");
      g.scale.setScalar(i === I2.gates ? 1 + 0.04 * Math.sin(t * 6) : 1);
    });
    mines.current.forEach((g, i) => {
      if (!g) return;
      g.visible = !I2.mines[i];
      g.rotation.y = t * 0.6 + i;
      const light2 = g.children[1] as THREE.Mesh | undefined;
      if (light2) light2.visible = Math.sin(t * 5 + i * 2) > 0;
    });
    turrets.current.forEach((g, i) => {
      if (!g) return;
      const ts = I2.turrets[i];
      g.visible = true;
      const alive = ts.hp > 0;
      g.scale.setScalar(alive ? 1 : 0.5);
      (g.children[0] as THREE.Mesh).material = alive ? turretMat : coreMatDead;
    });
    T.doors.forEach((d, k) => {
      const hole = doorHole(d, I2.doors[k] ?? 1);
      leaves.current[k].forEach((leaf, j) => {
        if (!leaf) return;
        leaf.position.set(0, 0, 0);
        leaf.children[0].position.x = hole + d.r * 0.5;
        void j;
      });
    });
    I2.pursuers.forEach((p, i) => {
      const g = chasers.current[i];
      if (!g) return;
      g.visible = p.hp > 0;
      g.position.set(p.p[0], p.p[1], p.p[2]);
      g.rotation.set(0, -p.yaw, 0);
    });
    for (let i = I2.pursuers.length; i < chasers.current.length; i++) if (chasers.current[i]) chasers.current[i]!.visible = false;
    if (coreGroup.current) {
      const alive = I2.core.hp > 0;
      coreGroup.current.visible = alive;
      coreGroup.current.rotation.y = t * 0.8;
      coreGroup.current.scale.setScalar(1 + 0.06 * Math.sin(t * 7) * (1.4 - I2.core.hp / I2.core.hpMax));
    }
    if (coreLight.current) {
      const hurt = 1 - Math.max(0, I2.core.hp) / I2.core.hpMax;
      coreLight.current.intensity = (I2.phase === "escape" ? 5 + 4 * Math.sin(t * 10) : 3) * 4e4 * (1 + hurt);
      coreLight.current.color.set(I2.phase === "escape" ? "#ff4a2a" : "#ffb04a");
    }
  });

  const dirQuat = (tan: [number, number, number]) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...tan));
  return (
    <>
      <mesh geometry={tube} material={mat} />
      <mesh geometry={chamber} material={mat} position={T.chamber.p} />
      <mesh geometry={shaft} material={mat} position={[T.shaft.from[0], T.shaft.from[1] + TUNNEL.shaft / 2, T.shaft.from[2]]} />
      {T.gates.map((g, i) => (
        <mesh key={i} ref={(el) => { gates.current[i] = el; }} position={g.p} quaternion={dirQuat(T.tangents[g.s])}>
          <torusGeometry args={[g.r, 0.9, 8, 48]} />
          <meshBasicMaterial color="#6f8fb8" toneMapped={false} />
        </mesh>
      ))}
      {T.mines.map((m, i) => (
        <group key={i} ref={(el) => { mines.current[i] = el; }} position={m.p}>
          <mesh material={mineMat}><icosahedronGeometry args={[2.2, 1]} /></mesh>
          <mesh material={mineLight} position={[0, 2.6, 0]}><sphereGeometry args={[0.7, 8, 6]} /></mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} material={mineMat} rotation={[k * 1.05, k * 0.8, 0]}><boxGeometry args={[7, 0.35, 0.35]} /></mesh>
          ))}
        </group>
      ))}
      {T.turrets.map((tt, i) => (
        <group key={i} ref={(el) => { turrets.current[i] = el; }} position={tt.p} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...tt.n))}>
          <mesh material={turretMat}><cylinderGeometry args={[2.2, 2.8, 2.2, 10]} /></mesh>
          <mesh material={turretMat} position={[0, 2.2, 0]}><boxGeometry args={[3.2, 2.2, 3.2]} /></mesh>
          <mesh material={mineMat} position={[0, 3, 1.8]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.35, 0.35, 5, 6]} /></mesh>
        </group>
      ))}
      {T.doors.map((d, k) => (
        <group key={k} position={d.p} quaternion={dirQuat(d.t)}>
          {Array.from({ length: 6 }, (_, j) => (
            <group key={j} rotation={[0, 0, (j / 6) * Math.PI * 2]} ref={(el) => { leaves.current[k][j] = el; }}>
              <mesh material={leafMat} position={[d.r * 0.5, 0, 0]}><boxGeometry args={[d.r, d.r * 1.15, 2.6]} /></mesh>
            </group>
          ))}
        </group>
      ))}
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(el) => { chasers.current[i] = el; }} visible={false}>
          <group scale={2}><group position={[-3, -0.4, -2]}><ShipModel ship={{ size: "Small", role: "Interceptor", status: "orbiting", owner: "the Empire" }} w={6} h={4} /></group></group>
        </group>
      ))}
      <group ref={coreGroup} position={T.core.p}>
        <mesh material={coreMat}><sphereGeometry args={[T.core.r * 0.55, 24, 16]} /></mesh>
        {[0, 1, 2].map((k) => (
          <mesh key={k} rotation={[k * 1.0, k * 0.7, 0]}><torusGeometry args={[T.core.r * (0.8 + k * 0.14), 0.7, 8, 40]} /><meshBasicMaterial color="#ffd9a0" toneMapped={false} /></mesh>
        ))}
        <mesh><sphereGeometry args={[T.core.r, 24, 16]} /><meshBasicMaterial color="#ff7a2a" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      </group>
      <pointLight ref={coreLight} position={T.core.p} color="#ffb04a" intensity={1.2e5} distance={420} decay={2} />
      <pointLight ref={light} color="#bfe0ff" intensity={4e4} distance={160} decay={2} />
      <group ref={craft}>
        <group scale={CLASSES[me.cls].length / 6}>
          <group position={[-3, -0.4, -2]}>
            <ShipModel ship={{ size: me.cls, role: me.role, status: "orbiting", owner: me.owner, name: me.name }} w={6} h={4} />
          </group>
        </group>
      </group>
    </>
  );
}
const coreMatDead = new THREE.MeshStandardMaterial({ color: "#14100e", roughness: 1 });
