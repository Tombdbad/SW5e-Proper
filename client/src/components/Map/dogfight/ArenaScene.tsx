// The dogfight's 3D scene: every vessel of the fight from a Tiny drone to a battle station (the fighters with the map's ship models, the
// big ships with the paneled hulls of CapitalShip), the shots in the air (turret bolts, missiles, torpedoes, rockets, bombs), the
// tracers, the blasts, the planet and stars behind, and the chase camera. It steps the rules each frame (shared/logic/dogfightSim.ts),
// and while the party's craft is inside a station it shows StationInterior instead. In the air of a planet (2026-10-26) the stars give way to
// the sky and the ground of the land, and the buildings, flak turrets and convoys of the fight stand and drive on it.
import { useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ARENA, CLASSES, classIndex, frameOf, isCapital, type Dogfight, type DogfightInput, type Fx, type Projectile, type Vessel } from "@shared/logic/dogfight";
import { bombFall, bombRelease, hullPoint, isDown, partVisible, partWorld, stepDogfight } from "@shared/logic/dogfightSim";
import { AIR } from "@shared/logic/dogfight";
import { ShipModel } from "../LocalMap";
import { SpeederModel } from "../models";
import { raceLook } from "../FlightScene";
import { CapitalShip, type CapitalRig } from "./CapitalShip";
import { StationInterior } from "./StationInterior";
import type { Livery } from "./hullSurface";
import type { Mark, OverlayData } from "./DogfightHud";
import { CockpitLayer, placeEye, type View } from "./Cockpit";

export interface ArenaSim {
  state: Dogfight;
  roll: () => number;
  // The scene's own bookkeeping: how long the camera shakes, the party's last hull
  shake: number;
  lastHull: number;
}

const TRACERS = 48;
const BOLTS = 96;
const WARHEADS = 48;
const BLASTS = 64;
const FLASHES = 16;
const DUST = 260;

const SUN = new THREE.Vector3(0.55, 0.4, -0.45).normalize();

export const liveryOf = (v: Vessel): Livery => (v.cls === "Station" ? "station" : v.imperial ? "imperial" : /pirate|black sun|hutt|warlord/i.test(v.owner) ? "pirate" : "republic");

// A ship of Tiny to Medium size: the map's model, scaled from its 6-unit footprint to its length in metres
function Fighter({ v }: { v: Vessel }) {
  const scale = CLASSES[v.cls].length / 6;
  return (
    <group scale={scale}>
      <group position={[-3, -0.4, -2]}>
        <ShipModel ship={{ size: v.cls === "Tiny" ? "Tiny" : v.cls, role: v.role, status: "orbiting", owner: v.owner, name: v.name }} w={6} h={4} />
      </group>
    </group>
  );
}

// The planet behind the fight: banded and cloudy, with a glow of atmosphere, and the sun that lights the scene
function planetTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  const sea = g.createLinearGradient(0, 0, 0, 512);
  sea.addColorStop(0, "#9cc4e8");
  sea.addColorStop(0.3, "#2d6aa8");
  sea.addColorStop(0.55, "#1d4f86");
  sea.addColorStop(1, "#a8cce8");
  g.fillStyle = sea;
  g.fillRect(0, 0, 1024, 512);
  let a = 17;
  const r = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(70,120,70,0.8)" : "rgba(150,130,90,0.7)";
    g.beginPath();
    g.ellipse(r() * 1024, 120 + r() * 280, 20 + r() * 80, 10 + r() * 40, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.2})`;
    g.beginPath();
    g.ellipse(r() * 1024, r() * 512, 30 + r() * 120, 4 + r() * 18, (r() - 0.5) * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ATMOSPHERE_FRAG = `
varying vec3 vN; varying vec3 vView;
void main() { float f = pow( 1.0 - abs( dot( normalize( vN ), normalize( vView ) ) ), 3.0 ); gl_FragColor = vec4( vec3( 0.35, 0.62, 1.0 ) * f * 1.6, f ); }`;
const ATMOSPHERE_VERT = `
varying vec3 vN; varying vec3 vView;
void main() { vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vView = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }`;

function Backdrop({ focus }: { focus: { current: THREE.Vector3 } }) {
  const group = useRef<THREE.Group>(null);
  const planet = useMemo(planetTexture, []);
  useFrame(({ camera }) => {
    // The sky is far: it stays put on the screen however the craft flies
    group.current?.position.copy(camera.position);
    void focus;
  });
  return (
    <group ref={group}>
      <Stars radius={7000} depth={900} count={6000} factor={22} saturation={0.1} fade speed={0} />
      <mesh position={[-7600, -3400, 9600]}>
        <sphereGeometry args={[2900, 64, 48]} />
        <meshStandardMaterial map={planet} roughness={0.95} metalness={0} />
      </mesh>
      <mesh position={[-7600, -3400, 9600]}>
        <sphereGeometry args={[2990, 64, 48]} />
        <shaderMaterial vertexShader={ATMOSPHERE_VERT} fragmentShader={ATMOSPHERE_FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.BackSide} toneMapped={false} />
      </mesh>
      <mesh position={SUN.clone().multiplyScalar(11000)}>
        <circleGeometry args={[520, 32]} />
        <meshBasicMaterial color="#fff6dc" toneMapped={false} />
      </mesh>
    </group>
  );
}

// The air of a planet: a dome of sky from the horizon's haze to the zenith, kept round the camera, the ground of the land far out to the
// fog, and the roads the convoys drive
function AirBackdrop({ biome, roads }: { biome: string; roads: [number, number, number][][] }) {
  const group = useRef<THREE.Group>(null);
  const look = raceLook(biome);
  const sky = useMemo(() => {
    const g = new THREE.SphereGeometry(7000, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const [low, high] = [new THREE.Color(look.sky), new THREE.Color(look.zenith)];
    const pos = g.attributes.position;
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const c = low.clone().lerp(high, Math.min(1, Math.max(0, pos.getY(i) / 7000)) ** 0.6);
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [look]);
  const ground = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = look.ground;
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = look.ground2;
      g.globalAlpha = 0.25 + r() * 0.5;
      g.beginPath();
      g.ellipse(r() * 256, r() * 256, 6 + r() * 30, 4 + r() * 18, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [look]);
  useFrame(({ camera }) => {
    group.current?.position.set(camera.position.x, 0, camera.position.z);
  });
  return (
    <>
      <group ref={group}>
        <mesh geometry={sky}>
          <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
        </mesh>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[14000, 14000]} />
        <meshLambertMaterial map={ground} />
      </mesh>
      {roads.map((route, i) =>
        route.slice(1).map((to, k) => {
          const from = route[k];
          const len = Math.hypot(to[0] - from[0], to[2] - from[2]);
          return (
            <mesh key={`${i}-${k}`} position={[(from[0] + to[0]) / 2, 0.05, (from[2] + to[2]) / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(to[2] - from[2], to[0] - from[0])]}>
              <planeGeometry args={[len + 14, 14]} />
              <meshLambertMaterial color={look.track} />
            </mesh>
          );
        }),
      )}
    </>
  );
}

// A piece on the ground: a building (a block with a parapet and lit windows), a flak turret (a armoured base and twin barrels raised at
// the sky), a ground vehicle (a cargo skiff of the party's, an Imperial troop transport or a skiff of the enemy's, scaled up to its size)
function GroundPiece({ v }: { v: Vessel }) {
  const role = v.ground!;
  if (role.kind === "building") {
    const [hx, hy, hz] = v.half;
    const wall = role.target ? "#8a7a6a" : v.side === "party" ? "#9aa4ae" : "#7a7470";
    return (
      <group>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
          <meshLambertMaterial color={wall} />
        </mesh>
        <mesh position={[0, hy + 0.6, 0]}>
          <boxGeometry args={[hx * 2 + 0.6, 1.2, hz * 2 + 0.6]} />
          <meshLambertMaterial color="#5a5550" />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (hx + 0.05), hy * 0.3, 0]}>
            <boxGeometry args={[0.1, hy * 0.25, hz * 1.4]} />
            <meshBasicMaterial color="#ffd27a" toneMapped={false} />
          </mesh>
        ))}
        {role.target && (
          <mesh position={[0, hy + 1.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(hx, hz) * 0.5, Math.max(hx, hz) * 0.62, 32]} />
            <meshBasicMaterial color="#ff3b3b" toneMapped={false} />
          </mesh>
        )}
      </group>
    );
  }
  if (role.kind === "flak" && !role.route) {
    return (
      <group>
        <mesh position={[0, -1, 0]}>
          <cylinderGeometry args={[3, 3.6, 3, 10]} />
          <meshLambertMaterial color="#5c6166" />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshLambertMaterial color="#6d7378" />
        </mesh>
        {[-0.8, 0.8].map((s) => (
          <mesh key={s} position={[2.4, 2.8, s]} rotation={[0, 0, -Math.PI / 2 + 0.7]}>
            <cylinderGeometry args={[0.3, 0.3, 6, 8]} />
            <meshLambertMaterial color="#2b2f36" />
          </mesh>
        ))}
      </group>
    );
  }
  // A vehicle: the speeder models are drawn along +z; the vessel's nose is +x
  const look = role.kind === "flak" ? "itt" : v.side === "party" ? "skiff" : v.imperial ? "itt" : "skiff";
  return (
    <group rotation={[0, Math.PI / 2, 0]} position={[0, -v.half[1], 0]} scale={role.kind === "flak" ? 2.2 : 3.2}>
      <SpeederModel model="Landspeeder" look={look} name={v.name} />
      {role.kind === "flak" && (
        <mesh position={[0, 1.4, 0]} rotation={[0.7, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 2.4, 8]} />
          <meshLambertMaterial color="#2b2f36" />
        </mesh>
      )}
    </group>
  );
}

// Specks of dust around the craft, wrapped about it, so that the speed shows
function Dust() {
  const ref = useRef<THREE.Points>(null);
  const pos = useMemo(() => {
    const a = new Float32Array(DUST * 3);
    for (let i = 0; i < a.length; i++) a[i] = (Math.random() - 0.5) * 600;
    return a;
  }, []);
  useFrame(({ camera }) => {
    const p = ref.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!p) return;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (let i = 0; i < DUST; i++) {
      p.setXYZ(
        i,
        cx + ((((pos[i * 3] - cx + 300) % 600) + 600) % 600) - 300,
        cy + ((((pos[i * 3 + 1] - cy + 300) % 600) + 600) % 600) - 300,
        cz + ((((pos[i * 3 + 2] - cz + 300) % 600) + 600) % 600) - 300,
      );
    }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={pos.slice()} count={DUST} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#cfe4ff" size={0.9} sizeAttenuation transparent opacity={0.7} depthWrite={false} />
    </points>
  );
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

// The field of view in each view: the chase camera's and the pilot's, wider to take in the dash
const FOV: Record<View, number> = { chase: 65, cockpit: 75 };

// `cursor`: where the pilot's cursor is on the screen (-1 to 1 each way, y up) when the guns follow it, else null, and they follow the reticule
export function ArenaScene({ sim, go, input, overlay, view, cursor, onFinish, onFrame }: { sim: { current: ArenaSim }; go: { current: boolean }; input: { current: DogfightInput }; overlay: { current: OverlayData }; view: { current: View }; cursor: { current: { x: number; y: number } | null }; onFinish: (s: Dogfight) => void; onFrame: (s: Dogfight) => void }) {
  const { camera, scene, gl } = useThree();
  const groups = useRef(new Map<number, THREE.Group>());
  const rigs = useRef(new Map<number, CapitalRig>());
  const tracers = useRef<THREE.Mesh[]>([]);
  const tracerData = useRef<{ from: THREE.Vector3; to: THREE.Vector3; hit: boolean; by: string; heavy: boolean; ttl: number }[]>([]);
  const bolts = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const blastMesh = useRef<THREE.InstancedMesh>(null);
  const blastData = useRef<Blast[]>([]);
  const flashMesh = useRef<THREE.InstancedMesh>(null);
  const focus = useRef(new THREE.Vector3());
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);
  const [ids, setIds] = useState<number[]>(sim.current.state.vessels.map((v) => v.id));
  const idsRef = useRef(ids);
  const [inside, setInside] = useState(false);
  const insideRef = useRef(false);
  const vesselOf = useRef(new Map<number, Vessel>());

  useEffect(() => {
    camera.near = 1;
    camera.far = 16000;
    camera.updateProjectionMatrix();
    gl.toneMappingExposure = 1.05;
  }, [camera, gl]);
  const air = sim.current.state.air;
  useEffect(() => {
    scene.fog = air ? new THREE.Fog(raceLook(air.biome).sky, 1400, 6500) : null;
    // For test scripts, as the map's window.__map3d: the scene and camera, to look at what is drawn
    (window as unknown as { __arena?: unknown }).__arena = { scene, camera, gl };
  }, [scene, camera, gl]);

  useFrame((_, delta) => {
    const s = sim.current;
    const st = s.state;
    const dt = Math.min(delta, 0.1);
    // The cursor's ray: from the camera as it was drawn, through the cursor (in the tunnel the guns are always on the reticule)
    const at = cursor.current;
    if (at && !st.interior) {
      camera.updateMatrixWorld();
      _a.set(at.x, at.y, 0.5).unproject(camera).sub(camera.position).normalize();
      input.current.aim = { o: [camera.position.x, camera.position.y, camera.position.z], d: [_a.x, _a.y, _a.z] };
    } else input.current.aim = undefined;
    if (go.current && !st.over) stepDogfight(st, input.current, dt, s.roll);
    const me = st.vessels.find((v) => v.id === st.me)!;
    // Membership of the scene
    const now = st.vessels.map((v) => v.id);
    if (now.length !== idsRef.current.length || now.some((id, i) => id !== idsRef.current[i])) {
      idsRef.current = now;
      for (const v of st.vessels) vesselOf.current.set(v.id, v);
      setIds(now);
    }
    if (!!st.interior !== insideRef.current) {
      insideRef.current = !!st.interior;
      setInside(!!st.interior);
    }
    // The vessels (the party's own is not drawn when the pilot looks out of it)
    const pilot = view.current === "cockpit";
    for (const v of st.vessels) {
      vesselOf.current.set(v.id, v);
      const g = groups.current.get(v.id);
      if (!g) continue;
      g.visible = !(pilot && v.id === st.me);
      g.position.set(v.p[0], v.p[1], v.p[2]);
      if (v.ground) {
        g.rotation.set(0, -v.yaw, 0);
        if (isDown(v)) g.scale.set(1, v.ground.kind === "building" ? 0.35 : 0.5, 1);
        continue;
      }
      g.rotation.set(v.roll, -v.yaw, v.pitch, "YZX");
      // A wreck goes dark and breaks up
      if (v.dying > 0) {
        const k = Math.max(0, v.dying) / 3;
        g.rotation.x += (1 - k) * 0.6 * (v.id % 2 ? 1 : -1);
        g.scale.setScalar(Math.max(0.2, 1 - (1 - Math.min(1, k)) * 0.05));
      }
    }
    // Hit the player: a shake
    if (me.c.hull + me.c.shield < s.lastHull - 0.5) s.shake = Math.min(1, s.shake + 0.35);
    s.lastHull = me.c.hull + me.c.shield;
    s.shake = Math.max(0, s.shake - dt * 1.6);

    const cam = camera as THREE.PerspectiveCamera;
    if (cam.fov !== FOV[view.current]) {
      cam.fov = FOV[view.current];
      cam.updateProjectionMatrix();
    }
    // The camera: behind and above the party's craft (or the craft in the tunnel), looking a little ahead; or in the pilot's seat
    if (st.interior) {
      const c = st.interior.craft;
      if (pilot) placeEye(camera, me, c.p, c.yaw, c.pitch, 0);
      else chase(camera, c.p, c.yaw, c.pitch, 14 + me.reach * 1.6, 4.5 + me.reach * 0.3, dt, ahead, behind);
      focus.current.set(c.p[0], c.p[1], c.p[2]);
    } else {
      if (pilot) placeEye(camera, me, me.p, me.yaw, me.pitch, me.roll);
      else {
        const back = Math.max(22, CLASSES[me.cls].length * 1.5);
        // The chase camera rolls with the craft, so that up is the craft's up
        chase(camera, me.p, me.yaw, me.pitch, back, back * 0.27, dt, ahead, behind, me.roll);
      }
      focus.current.set(me.p[0], me.p[1], me.p[2]);
    }
    if (s.shake > 0 && !pilot) camera.position.add(_v.set((Math.random() - 0.5) * s.shake * 1.4, (Math.random() - 0.5) * s.shake * 1.4, (Math.random() - 0.5) * s.shake * 1.4));

    // Shots in the air
    let nb = 0;
    let nh = 0;
    if (bolts.current && heads.current) {
      for (const b of st.shots) {
        const speed = Math.hypot(b.v[0], b.v[1], b.v[2]) || 1;
        _v.set(b.v[0] / speed, b.v[1] / speed, b.v[2] / speed);
        _q.setFromUnitVectors(Z, _v);
        if (b.kind === "bolt" && nb < BOLTS) {
          _s.set(b.dice.startsWith("6") || b.dice.startsWith("4") ? 1.6 : 1, 1, 14);
          _m.compose(_p.set(b.p[0], b.p[1], b.p[2]), _q, _s);
          bolts.current.setMatrixAt(nb, _m);
          bolts.current.setColorAt(nb, _c.set(b.side === "party" ? "#8fe4ff" : "#ff6a3c"));
          nb++;
        } else if (b.kind !== "bolt" && nh < WARHEADS) {
          const k = b.kind === "bomb" ? 1.4 : b.kind === "torpedo" ? 1.2 : 0.8;
          _s.set(k, k, k * (b.kind === "bomb" ? 1 : 3));
          _m.compose(_p.set(b.p[0], b.p[1], b.p[2]), _q, _s);
          heads.current.setMatrixAt(nh, _m);
          heads.current.setColorAt(nh, _c.set(b.kind === "bomb" ? "#ffcf66" : b.side === "party" ? "#9fe8ff" : "#ff8a4a"));
          nh++;
        }
      }
      bolts.current.count = nb;
      heads.current.count = nh;
      bolts.current.instanceMatrix.needsUpdate = true;
      heads.current.instanceMatrix.needsUpdate = true;
      if (bolts.current.instanceColor) bolts.current.instanceColor.needsUpdate = true;
      if (heads.current.instanceColor) heads.current.instanceColor.needsUpdate = true;
    }

    // Tracers: one per shot fired this step
    for (const e of st.events) tracerData.current.push({ from: new THREE.Vector3(...e.from), to: new THREE.Vector3(...e.to), hit: e.hit, by: e.by, heavy: !!e.heavy, ttl: 0.18 });
    tracerData.current = tracerData.current.filter((t) => (t.ttl -= dt) > 0).slice(-TRACERS);
    tracers.current.forEach((mesh, i) => {
      const t = tracerData.current[i];
      if (!mesh) return;
      if (!t) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.copy(t.from).add(t.to).multiplyScalar(0.5);
      mesh.lookAt(t.to);
      const len = t.from.distanceTo(t.to);
      mesh.scale.set(t.heavy ? 3 : 1, t.heavy ? 3 : 1, Math.max(0.1, len));
      (mesh.material as THREE.MeshBasicMaterial).color.set(t.by === "player" ? (t.hit ? "#ffffff" : "#7fe0ff") : t.hit ? "#ffd0a0" : "#ff5a5a");
    });

    // Blasts and sparks: what the rules say happened this step
    for (const f of st.fx) spawnFx(f, blastData.current, rigs.current, st, me);
    if (blastMesh.current) {
      const alive = blastData.current.filter((b) => (b.t += dt) < b.life);
      blastData.current = alive.slice(-BLASTS - FLASHES);
      let nb2 = 0;
      let nf = 0;
      for (const b of blastData.current) {
        const k = b.t / b.life;
        if (b.shell) {
          // A shield taking a hit: a thin shell round the craft, brightest at its rim
          if (nf >= FLASHES || !flashMesh.current) continue;
          _s.setScalar(b.size * (1 + k * 0.25));
          _m.compose(_p.set(me.p[0], me.p[1], me.p[2]), _q.identity(), _s);
          flashMesh.current.setMatrixAt(nf, _m);
          flashMesh.current.setColorAt(nf, _c.copy(b.color).multiplyScalar(Math.max(0, 1 - k) ** 1.2));
          nf++;
        } else if (nb2 < BLASTS) {
          const grow = 1 - (1 - k) * (1 - k);
          _s.setScalar(Math.max(0.01, b.size * (0.25 + grow)));
          _m.compose(b.p, _q.identity(), _s);
          blastMesh.current.setMatrixAt(nb2, _m);
          blastMesh.current.setColorAt(nb2, _c.copy(b.color).multiplyScalar(Math.max(0, 1 - k) ** 1.5 * 1.6));
          nb2++;
        }
      }
      blastMesh.current.count = nb2;
      blastMesh.current.instanceMatrix.needsUpdate = true;
      if (blastMesh.current.instanceColor) blastMesh.current.instanceColor.needsUpdate = true;
      if (flashMesh.current) {
        flashMesh.current.count = nf;
        flashMesh.current.instanceMatrix.needsUpdate = true;
        if (flashMesh.current.instanceColor) flashMesh.current.instanceColor.needsUpdate = true;
      }
    }
    markers(camera, st, me, overlay.current);
    onFrame(st);
    if (st.over) onFinish(st);
  });

  return (
    <>
      <ambientLight intensity={0.5} color="#9fb4d8" />
      <hemisphereLight args={["#8fb0e0", "#1a1d26", 0.9]} />
      <directionalLight position={SUN.toArray().map((x) => x * 800) as [number, number, number]} intensity={2.4} color="#fff2dc" />
      <directionalLight position={[-300, -120, 200]} intensity={1.0} color="#7aa0dc" />
      {air ? <AirBackdrop biome={air.biome} roads={roadsOf(sim.current.state)} /> : <Backdrop focus={focus} />}
      <Dust />
      {!inside && ids.map((id) => {
        const v = vesselOf.current.get(id) ?? sim.current.state.vessels.find((x) => x.id === id);
        if (!v) return null;
        return (
          <group key={id} ref={(el) => { if (el) groups.current.set(id, el); else groups.current.delete(id); }} position={v.p}>
            {v.ground ? <GroundPiece v={v} /> : isCapital(v.cls) || classIndex(v.cls) >= classIndex("Large") ? <CapitalShip vessel={v} livery={liveryOf(v)} sim={sim} rigs={rigs} /> : <Fighter v={v} />}
          </group>
        );
      })}
      {inside && <StationInterior sim={sim} view={view} />}
      <CockpitLayer sim={sim} input={input} view={view} />
      <instancedMesh ref={bolts} args={[undefined, undefined, BOLTS]} frustumCulled={false}>
        <boxGeometry args={[0.5, 0.5, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, WARHEADS]} frustumCulled={false}>
        <coneGeometry args={[0.7, 1.6, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={blastMesh} args={[undefined, undefined, BLASTS]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={flashMesh} args={[undefined, undefined, FLASHES]} frustumCulled={false} renderOrder={6}>
        <sphereGeometry args={[1, 24, 16]} />
        <shaderMaterial vertexShader={FLASH_VERT} fragmentShader={FLASH_FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      {Array.from({ length: TRACERS }, (_, i) => (
        <mesh key={i} ref={(el) => { if (el) tracers.current[i] = el; }} visible={false}>
          <boxGeometry args={[0.2, 0.2, 1]} />
          <meshBasicMaterial color="#7fe0ff" toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

const _c = new THREE.Color();
// The roads of the fight's convoys (each route once)
function roadsOf(st: Dogfight): [number, number, number][][] {
  const seen = new Set<string>();
  const out: [number, number, number][][] = [];
  for (const v of st.vessels) {
    const r = v.ground?.route;
    if (!r || seen.has(JSON.stringify(r))) continue;
    seen.add(JSON.stringify(r));
    out.push(r);
  }
  return out;
}
const BLAST_COLOR: Record<string, string> = { boom: "#ff9a3c", spark: "#ffd27a", shield: "#6ec8ff", launch: "#ffffff", pd: "#9fe0ff", wreck: "#ff7a2c", port: "#7dffc0" };
interface Blast { p: THREE.Vector3; size: number; t: number; life: number; color: THREE.Color; shell?: boolean }
// (three declares `instanceColor` itself for an instanced mesh that has colours: declaring it again was a compile error, and the shell never showed)
const FLASH_VERT = `
varying vec3 vN; varying vec3 vView; varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
  vN = normalize( normalMatrix * mat3( instanceMatrix ) * normal );
  vView = normalize( - mv.xyz );
#ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
#else
  vCol = vec3( 1.0 );
#endif
  gl_Position = projectionMatrix * mv;
}`;
const FLASH_FRAG = `
varying vec3 vN; varying vec3 vView; varying vec3 vCol;
void main() {
  float f = pow( 1.0 - abs( dot( normalize( vN ), normalize( vView ) ) ), 1.7 );
  gl_FragColor = vec4( vCol * ( 0.18 + f * 1.4 ), clamp( ( 0.1 + f ) * length( vCol ), 0.0, 1.0 ) );
}`;
function spawnFx(f: Fx, list: Blast[], rigs: Map<number, CapitalRig>, st: Dogfight, me: Vessel) {
  // A shield on the party's own craft takes the hit as a shell round it
  if (f.kind === "shield" && Math.hypot(f.p[0] - me.p[0], f.p[1] - me.p[1], f.p[2] - me.p[2]) < me.reach * 1.6) {
    list.push({ p: new THREE.Vector3(f.p[0], f.p[1], f.p[2]), size: Math.max(2.5, me.reach * 1.25), t: 0, life: 0.35, color: new THREE.Color("#6ec8ff"), shell: true });
    return;
  }
  if (f.kind === "shield") {
    // The nearest shielded hull flares at the point
    let best: Vessel | null = null;
    let bd = Infinity;
    for (const v of st.vessels) {
      if (!isCapital(v.cls)) continue;
      const d = Math.hypot(v.p[0] - f.p[0], v.p[1] - f.p[1], v.p[2] - f.p[2]);
      if (d < bd) [bd, best] = [d, v];
    }
    if (best) rigs.get(best.id)?.hit(f.p, f.size);
  }
  const size = f.kind === "launch" ? 3 : f.kind === "spark" ? 1.2 + f.size * 1.4 : f.kind === "shield" ? 2 + f.size * 2 : Math.max(2, f.size * 1.7);
  list.push({ p: new THREE.Vector3(f.p[0], f.p[1], f.p[2]), size, t: 0, life: f.kind === "wreck" || f.kind === "port" ? 1.8 : f.kind === "boom" ? 0.9 : 0.35, color: new THREE.Color(BLAST_COLOR[f.kind] ?? "#ffffff") });
}

// The chase camera: behind and above (above is the craft's own up, rolled), looking a little ahead
export function chase(camera: THREE.Camera, p: [number, number, number], yaw: number, pitch: number, back: number, lift: number, dt: number, ahead: THREE.Vector3, behind: THREE.Vector3, roll = 0) {
  const { f, u } = frameOf(yaw, pitch, roll);
  behind.set(p[0] - f[0] * back + u[0] * lift, p[1] - f[1] * back + u[1] * lift, p[2] - f[2] * back + u[2] * lift);
  ahead.set(p[0] + f[0] * back * 0.6, p[1] + f[1] * back * 0.6, p[2] + f[2] * back * 0.6);
  camera.position.lerp(behind, Math.min(1, dt * 9));
  camera.up.set(u[0], u[1], u[2]);
  camera.lookAt(ahead);
}

// ---- What the HUD lays over the view: where the foes, the objectives and the aimed part are on the screen
const _pv = new THREE.Vector3();
function project(camera: THREE.Camera, p: [number, number, number]): { x: number; y: number; behind: boolean } {
  _pv.set(p[0], p[1], p[2]).applyMatrix4(camera.matrixWorldInverse);
  const behind = _pv.z > 0;
  _pv.applyMatrix4(camera.projectionMatrix);
  return { x: _pv.x, y: _pv.y, behind };
}
const dist3 = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function markers(camera: THREE.Camera, st: Dogfight, me: Vessel, out: OverlayData) {
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const marks: Mark[] = [];
  // Turrets are marked apart from the rest, so that a ship bristling with them does not crowd the other marks out
  const turrets: Mark[] = [];
  out.hullDist = null;
  // Where the nose points on the screen: the reticule sits there (the chase camera is above the craft, so it is not the middle of the view)
  const at = st.interior ? st.interior.craft : me;
  const nose = frameOf(at.yaw, at.pitch).f;
  out.nose = project(camera, [at.p[0] + nose[0] * 600, at.p[1] + nose[1] * 600, at.p[2] + nose[2] * 600]);
  if (st.interior) {
    const I = st.interior;
    const c = I.craft.p;
    I.tunnel.turrets.forEach((t, k) => {
      const d = dist3(t.p, c);
      if (I.turrets[k].hp > 0 && d < 300) marks.push({ ...project(camera, t.p), kind: "turret", label: "TURRET", dist: d, frac: 1 });
    });
    if (I.core.hp > 0) marks.push({ ...project(camera, I.tunnel.core.p), kind: "core", label: "CORE", dist: dist3(I.tunnel.core.p, c), frac: I.core.hp / I.core.hpMax });
    const gate = I.tunnel.gates[I.gates];
    if (gate && I.phase === "run") marks.push({ ...project(camera, gate.p), kind: "port", label: "GATE", dist: dist3(gate.p, c), frac: 1 });
    if (I.phase === "escape") marks.push({ ...project(camera, I.tunnel.shaft.to), kind: "port", label: "EXIT", dist: dist3(I.tunnel.shaft.to, c), frac: 1 });
    out.marks = marks.sort((a, b) => a.dist - b.dist).slice(0, 12);
    out.aim = st.aim ? { ...project(camera, st.aim.point), kind: "locked", label: st.aim.part === -2 ? "TARGET" : "", dist: st.aim.dist, frac: 1 } : null;
    return;
  }
  // In the air: what the party has to keep standing, and where a bomb let go now would fall
  if (st.air) {
    for (const v of st.vessels) {
      if (!v.ground || v.side !== "party" || isDown(v)) continue;
      marks.push({ ...project(camera, v.p), kind: "ally", label: v.name.toUpperCase(), dist: dist3(v.p, me.p), frac: v.c.hull / v.c.sheet.hullMax });
    }
    const bomb = me.guns.find((g) => g.kind === "bomb" && g.ammo > 0);
    if (bomb && me.p[1] > 10) {
      const rel = bombRelease(me);
      const fall = bombFall(rel.p, rel.vel, AIR.gravity * st.air.g);
      if (fall.t < 30) marks.push({ ...project(camera, fall.at), kind: "drop", label: "BOMB", dist: dist3(fall.at, me.p), frac: 1 });
    }
  }
  for (const v of st.vessels) {
    if (v.side !== "foe" || isDown(v)) continue;
    const d = dist3(v.p, me.p);
    const big = isCapital(v.cls) || v.cls === "Large";
    if (d > 2600 && !big) continue;
    const surface = Math.max(0, d - v.reach);
    marks.push({ ...project(camera, v.p), kind: st.lock === v.id ? "locked" : big ? "big" : "foe", label: v.ground?.target ? `TARGET ${v.name}` : v.name, dist: big ? surface : d, frac: v.c.hull / v.c.sheet.hullMax });
    if (big) {
      const hp = hullPoint(v, me.p, 0);
      if (!hp.inside && hp.depth < 0) out.hullDist = Math.min(out.hullDist ?? Infinity, -hp.depth);
      if (d < v.reach + 1400) {
        for (const part of v.parts) {
          if (!part.alive || (part.kind !== "generator" && part.kind !== "hangar" && part.kind !== "port")) continue;
          if (part.kind === "port" && v.parts.some((q) => q.kind === "generator" && q.alive)) continue;
          const w = partWorld(v, part);
          const chosen = st.lock === v.id && st.lockPart === part.id;
          marks.push({ ...project(camera, w), kind: chosen ? "locked" : part.kind === "generator" ? "gen" : part.kind === "hangar" ? "bay" : "port", label: part.kind === "generator" ? "GEN" : part.kind === "hangar" ? "BAY" : "PORT", dist: dist3(w, me.p), frac: part.hp / part.hpMax });
        }
      }
      // The turrets standing and in sight within reach (the hull hides the ones on its far side), the one chosen as the target as the target
      for (const part of v.parts) {
        if (!part.alive || (part.kind !== "battery" && part.kind !== "pd")) continue;
        const w = partWorld(v, part);
        const dd = dist3(w, me.p);
        const chosen = st.lock === v.id && st.lockPart === part.id;
        if ((dd > ARENA.subRange * 1.4 && !chosen) || !partVisible(v, part, me.p)) continue;
        turrets.push({ ...project(camera, w), kind: chosen ? "locked" : "turret", label: chosen ? `${part.kind === "battery" ? "BATTERY" : "PD"} ${Math.round((part.hp / part.hpMax) * 100)}%` : part.kind === "battery" ? "GUN" : "PD", dist: dd, frac: part.hp / part.hpMax });
      }
    }
  }
  const chosenMark = turrets.findIndex((m) => m.kind === "locked");
  const chosenTurret = chosenMark >= 0 ? turrets.splice(chosenMark, 1) : [];
  out.marks = [...chosenTurret, ...marks.sort((a, b) => a.dist - b.dist).slice(0, 14), ...turrets.sort((a, b) => a.dist - b.dist).slice(0, 16)];
  const a = st.aim;
  if (a) {
    const v = st.vessels.find((x) => x.id === a.vessel);
    const part = v && a.part >= 0 ? v.parts[a.part] : null;
    out.aim = { ...project(camera, a.point), kind: "locked", label: part ? part.kind.toUpperCase() + " " + Math.round((part.hp / part.hpMax) * 100) + "%" : v?.name ?? "", dist: a.dist, frac: 1 };
  } else out.aim = null;
}
