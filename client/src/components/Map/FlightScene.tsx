import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  alongCourse, createRandom, dogfightStart, flightCourse, flightStart, flightTop, headingOf, inRing, stepDogfight, stepFlight,
  type Craft, type Dogfight, type FlightCourse, type FlightInput, type FlightMode, type Rival,
} from "@shared/logic";

// The 3D flying shared by the flying games and the pilot's route between settlements (shared/logic
// "Flying"): a run takes rings in order, a race is laps against rivals, a dogfight is against foes that
// fire back. The drag pad steers (yaw, and pitch where the craft can climb); the buttons boost, brake or
// fire. The chase camera follows the craft.

const PAD = 56; // pixels from the pad's centre to its edge

// How a run ended: `time` is when the last ring was taken (null when it was not)
export interface RunOutcome { course: FlightCourse; collected: number; timeLeft: number; time: number | null; rivals: Rival[] }

interface Sim { craft: Craft; next: number; t: number; done: boolean }

// Puts a craft's group where it is, and banks it into its pitch
function place(group: THREE.Group | null, tilt: THREE.Group | null, craft: Craft) {
  const { p, yaw, pitch } = craft;
  if (group) {
    group.position.set(p[0], p[1], p[2]);
    group.rotation.set(0, -yaw, 0);
  }
  if (tilt) tilt.rotation.set(0, 0, pitch);
}

// The chase camera: behind and above the craft, looking a little ahead of it
function chase(camera: THREE.Camera, craft: Craft, mode: FlightMode, dt: number, ahead: THREE.Vector3, behind: THREE.Vector3) {
  const { p, yaw, pitch } = craft;
  const [cy, sy, cp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch)];
  const back = mode === "speeder" ? 12 : 22;
  behind.set(p[0] - cy * cp * back, p[1] + (mode === "speeder" ? 4 : 6), p[2] - sy * cp * back);
  ahead.set(p[0] + cy * cp * 10, p[1] + Math.sin(pitch) * 10, p[2] + sy * cp * 10);
  camera.position.lerp(behind, Math.min(1, dt * 8));
  camera.lookAt(ahead);
}

function Craft3D({ mode, groupRef, tiltRef }: { mode: FlightMode; groupRef: React.RefObject<THREE.Group>; tiltRef: React.RefObject<THREE.Group> }) {
  return (
    <group ref={groupRef}>
      <group ref={tiltRef}>
        {mode === "speeder" ? (
          <>
            <mesh position={[0, 0.6, 0]}>
              <boxGeometry args={[3.2, 0.5, 1.6]} />
              <meshLambertMaterial color="#c9ced6" />
            </mesh>
            <mesh position={[-1.2, 0.9, 0]}>
              <boxGeometry args={[0.6, 0.3, 1.6]} />
              <meshLambertMaterial color="#59636d" />
            </mesh>
          </>
        ) : mode === "airspeeder" ? (
          <>
            <mesh position={[0, 0.3, 0]}>
              <boxGeometry args={[4, 0.4, 1.2]} />
              <meshLambertMaterial color="#d8dde3" />
            </mesh>
            <mesh position={[-0.6, 0.6, 0]}>
              <boxGeometry args={[1.6, 0.2, 5]} />
              <meshLambertMaterial color="#8a949e" />
            </mesh>
          </>
        ) : (
          <>
            <mesh rotation={[0, 0, -Math.PI / 2]}>
              <capsuleGeometry args={[1.2, 4, 6, 12]} />
              <meshLambertMaterial color="#aeb6bd" />
            </mesh>
            <mesh position={[-2.6, 0.9, 0]}>
              <boxGeometry args={[0.8, 1.6, 0.2]} />
              <meshLambertMaterial color="#59636d" />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

function World({ mode }: { mode: FlightMode }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[40, 60, 20]} intensity={1.2} />
      {mode === "speeder" ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[600, 600]} />
            <meshLambertMaterial color="#26361f" />
          </mesh>
          <gridHelper args={[600, 60, "#3c5a33", "#2c4327"]} />
        </>
      ) : (
        <Stars radius={300} depth={80} count={2500} factor={4} fade speed={0} />
      )}
    </>
  );
}

// A run: the rings in order, against the clock, with rivals who keep their own pace (a race)
function Run({ course, mode, rivals, input, sim, onFinish }: { course: FlightCourse; mode: FlightMode; rivals: Rival[]; input: { current: FlightInput }; sim: { current: Sim }; onFinish: () => void }) {
  const craftRef = useRef<THREE.Group>(null);
  const tiltRef = useRef<THREE.Group>(null);
  const rivalRefs = useRef<(THREE.Mesh | null)[]>([]);
  const { camera } = useThree();
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const s = sim.current;
    if (s.done) return;
    const dt = Math.min(delta, 0.25);
    s.craft = stepFlight(s.craft, input.current, dt, mode);
    s.t += dt;
    const ring = course.rings[s.next];
    if (ring && inRing(s.craft.p, ring, course.radius)) s.next++;
    if (s.next >= course.rings.length || s.t >= course.limit) {
      s.done = true;
      onFinish();
    }
    place(craftRef.current, tiltRef.current, s.craft);
    chase(camera, s.craft, mode, dt, ahead, behind);
    rivals.forEach((rival, i) => {
      const mesh = rivalRefs.current[i];
      if (!mesh) return;
      const [x, y, z] = alongCourse(course, rival.pace * flightTop(mode) * s.t);
      mesh.position.set(x, y + 1, z);
    });
  });

  return (
    <>
      <World mode={mode} />
      {course.rings.map((ring, i) => {
        const taken = i < sim.current.next;
        const next = i === sim.current.next;
        const color = taken ? "#7dffa0" : next ? "#ffd24a" : "#7a8799";
        return (
          <mesh key={i} position={ring}>
            <torusGeometry args={[course.radius, next ? 0.6 : 0.35, 8, 32]} />
            <meshBasicMaterial color={color} transparent opacity={taken ? 0.35 : 0.9} />
          </mesh>
        );
      })}
      {rivals.map((rival, i) => (
        <mesh key={`${rival.name}-${i}`} ref={(el) => { rivalRefs.current[i] = el; }}>
          <sphereGeometry args={[1.4, 12, 10]} />
          <meshLambertMaterial color={["#ff7070", "#70b0ff", "#ffb070", "#c070ff"][i % 4]} />
        </mesh>
      ))}
      <Craft3D mode={mode} groupRef={craftRef} tiltRef={tiltRef} />
    </>
  );
}

// The fight: the foes (drawn as they stand each frame), the craft's laser bolt, and the chase camera
function Fight({ input, fire, sim, onFinish }: { input: { current: FlightInput }; fire: { current: boolean }; sim: { current: { state: Dogfight; roll: () => number; flash: number } }; onFinish: () => void }) {
  const craftRef = useRef<THREE.Group>(null);
  const tiltRef = useRef<THREE.Group>(null);
  const foeRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const boltRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const s = sim.current;
    if (s.state.over) return;
    const dt = Math.min(delta, 0.25);
    s.state = stepDogfight(s.state, input.current, fire.current, dt, s.roll);
    s.flash = fire.current ? 0.12 : Math.max(0, s.flash - dt);
    const { craft } = s.state;
    place(craftRef.current, tiltRef.current, craft);
    chase(camera, craft, "ship", dt, ahead, behind);
    if (boltRef.current) {
      const h = headingOf(craft.yaw, craft.pitch);
      boltRef.current.visible = s.flash > 0;
      boltRef.current.position.set(craft.p[0] + h[0] * 30, craft.p[1] + h[1] * 30, craft.p[2] + h[2] * 30);
      boltRef.current.lookAt(craft.p[0] + h[0] * 60, craft.p[1] + h[1] * 60, craft.p[2] + h[2] * 60);
    }
    for (const foe of s.state.foes) foeRefs.current.get(foe.id)?.position.set(foe.p[0], foe.p[1], foe.p[2]);
    if (s.state.over) onFinish();
  });

  return (
    <>
      <World mode="ship" />
      {sim.current.state.foes.map((foe) => (
        <mesh key={foe.id} ref={(el) => { if (el) foeRefs.current.set(foe.id, el); else foeRefs.current.delete(foe.id); }} position={foe.p}>
          <coneGeometry args={[1.6, 5, 6]} />
          <meshLambertMaterial color={foe.hull > 1 ? "#ff5a5a" : "#ff9a5a"} />
        </mesh>
      ))}
      <mesh ref={boltRef} visible={false}>
        <cylinderGeometry args={[0.25, 0.25, 12, 6]} />
        <meshBasicMaterial color="#7fe0ff" />
      </mesh>
      <Craft3D mode="ship" groupRef={craftRef} tiltRef={tiltRef} />
    </>
  );
}

// The drag pad, and the buttons: throttle (boost, brake) and, in a dogfight, fire
function Controls({ input, onThrottle, onFire }: { input: { current: FlightInput }; onThrottle?: (value: -1 | 0 | 1) => void; onFire?: (down: boolean) => void }) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const steer = (e: React.PointerEvent) => {
    const box = pad.current!.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / PAD));
    const dy = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height / 2)) / PAD));
    input.current.steer = { x: dx, y: dy };
    setKnob({ x: dx, y: dy });
  };
  const release = () => {
    input.current.steer = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
  };
  const button = "h-12 rounded-full border border-sky-400/60 bg-gray-900/70 px-4 text-sm font-semibold text-sky-100 select-none touch-none";
  return (
    <>
      <div
        ref={pad}
        data-testid="flight-pad"
        className="absolute bottom-4 left-4 h-28 w-28 touch-none rounded-full border-2 border-sky-400/60 bg-gray-900/50"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); steer(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) steer(e); }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="absolute h-8 w-8 rounded-full bg-sky-300/80" style={{ left: `calc(50% + ${knob.x * 36}px - 16px)`, top: `calc(50% + ${knob.y * 36}px - 16px)` }} />
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        {onFire && <button type="button" data-testid="flight-fire" className={button} onPointerDown={() => onFire(true)} onPointerUp={() => onFire(false)} onPointerCancel={() => onFire(false)} onPointerLeave={() => onFire(false)}>Fire</button>}
        {onThrottle && (
          <>
            <button type="button" data-testid="flight-boost" className={button} onPointerDown={() => onThrottle(1)} onPointerUp={() => onThrottle(0)} onPointerCancel={() => onThrottle(0)} onPointerLeave={() => onThrottle(0)}>Boost</button>
            <button type="button" data-testid="flight-brake" className={button} onPointerDown={() => onThrottle(-1)} onPointerUp={() => onThrottle(0)} onPointerCancel={() => onThrottle(0)} onPointerLeave={() => onThrottle(0)}>Brake</button>
          </>
        )}
      </div>
    </>
  );
}

// A run (taxi, delivery, race, or a pilot's route). Calls onDone with how it ended, once it does.
export function FlightRun({ mode, seed, laps = 1, count, rivals = [], title, onDone }: { mode: FlightMode; seed: number; laps?: number; count?: number; rivals?: Rival[]; title: string; onDone: (outcome: RunOutcome) => void }) {
  const course = useMemo(() => flightCourse(seed, mode, { laps, count }), [seed, mode, laps, count]);
  const input = useRef<FlightInput>({ steer: { x: 0, y: 0 }, throttle: 0 });
  const sim = useRef<Sim>({ craft: flightStart(course), next: 0, t: 0, done: false });
  const [hud, setHud] = useState({ speed: 0, next: 0, timeLeft: course.limit, done: false });

  // The HUD reads the simulation ten times a second; the scene itself is drawn each frame
  useEffect(() => {
    const timer = setInterval(() => {
      const s = sim.current;
      setHud((h) => ({ speed: Math.round(s.craft.speed), next: s.next, timeLeft: Math.max(0, Math.ceil(course.limit - s.t)), done: h.done || s.done }));
    }, 100);
    return () => clearInterval(timer);
  }, [course]);

  const finish = () => setHud((h) => ({ ...h, done: true }));
  const finished = sim.current.next === course.rings.length;
  const land = () => onDone({ course, collected: sim.current.next, timeLeft: Math.max(0, course.limit - sim.current.t), time: finished ? sim.current.t : null, rivals });

  return (
    <div className="relative h-[60vh] w-full overflow-hidden rounded-lg border border-sky-500/40 bg-black" data-testid="flight">
      <Canvas camera={{ position: [0, 6, -12], fov: 65, far: 2000 }} onCreated={({ gl }) => gl.setClearColor(mode === "ship" ? "#02040a" : "#8fb4d8")}>
        <Run course={course} mode={mode} rivals={rivals} input={input} sim={sim} onFinish={finish} />
      </Canvas>
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-xs text-sky-100" data-testid="flight-hud">
        {title} · rings {hud.next} of {course.rings.length} · {hud.speed} {mode === "ship" ? "km/s" : "m/s"} · {hud.timeLeft} s left
      </div>
      {!hud.done && <Controls input={input} onThrottle={(v) => (input.current.throttle = v)} />}
      {hud.done && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 text-center" data-testid="flight-over">
          <p className="text-lg font-semibold text-yellow-300">{finished ? "Every ring taken." : sim.current.t >= course.limit ? "Out of time." : "Run over."}</p>
          <p className="text-sm text-gray-200">{sim.current.next} of {course.rings.length} rings taken.</p>
          <button type="button" className="rounded border border-sky-400 px-4 py-2 text-sm text-sky-100" onClick={land} data-testid="flight-land">Land</button>
        </div>
      )}
    </div>
  );
}

// A dogfight in the space of a planet. Calls onDone with the fight as it ended.
export function DogfightScene({ seed, onDone }: { seed: number; onDone: (state: Dogfight) => void }) {
  const input = useRef<FlightInput>({ steer: { x: 0, y: 0 }, throttle: 0 });
  const fire = useRef(false);
  const sim = useRef<{ state: Dogfight; roll: () => number; flash: number }>({ state: dogfightStart(seed), roll: createRandom(seed + 1).next, flash: 0 });
  const [hud, setHud] = useState({ hull: sim.current.state.hull, kills: 0, foes: sim.current.state.foes.length, t: 0, done: false });

  useEffect(() => {
    const timer = setInterval(() => {
      const s = sim.current.state;
      setHud((h) => ({ hull: s.hull, kills: s.kills, foes: s.foes.length, t: Math.round(s.t), done: h.done || s.over }));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const finish = () => setHud((h) => ({ ...h, done: true }));
  const { state } = sim.current;

  return (
    <div className="relative h-[60vh] w-full overflow-hidden rounded-lg border border-red-500/40 bg-black" data-testid="dogfight">
      <Canvas camera={{ position: [0, 6, -22], fov: 65, far: 2000 }} onCreated={({ gl }) => gl.setClearColor("#02040a")}>
        <Fight input={input} fire={fire} sim={sim} onFinish={finish} />
      </Canvas>
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-xs text-sky-100" data-testid="dogfight-hud">
        Dogfight · hull {hud.hull} · foes {hud.foes} left, {hud.kills} down · {hud.t} s
      </div>
      {!hud.done && <Controls input={input} onThrottle={(v) => (input.current.throttle = v)} onFire={(down) => (fire.current = down)} />}
      {hud.done && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 text-center" data-testid="dogfight-over">
          <p className="text-lg font-semibold text-yellow-300">{state.foes.length === 0 ? "The sky is clear." : state.hull <= 0 ? "Your ship is shot down." : "The fight is over."}</p>
          <p className="text-sm text-gray-200">{state.kills} foes down, {state.hits} of {state.shots} shots hit.</p>
          <button type="button" className="rounded border border-sky-400 px-4 py-2 text-sm text-sky-100" onClick={() => onDone(state)} data-testid="dogfight-land">Land</button>
        </div>
      )}
    </div>
  );
}
