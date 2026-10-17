import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { flightCourse, flightStart, stepFlight, inRing, type Craft, type FlightCourse, type FlightInput, type FlightMode } from "@shared/logic";

// A flying minigame on the 3D map (shared/logic "Flying games"): a landspeeder over a settlement's
// ground, or a ship in the space of its planet. The drag pad steers (yaw, and pitch for a ship); the
// throttle buttons boost and brake. The chase camera follows the craft; the rings are taken in order.

const PAD = 56; // pixels from the pad's centre to its edge

export interface FlightOutcome { course: FlightCourse; collected: number; timeLeft: number }

interface Sim { craft: Craft; next: number; t: number; done: boolean }

function Flight({ course, mode, input, sim, onFinish }: { course: FlightCourse; mode: FlightMode; input: { current: FlightInput }; sim: { current: Sim }; onFinish: () => void }) {
  const craftRef = useRef<THREE.Group>(null);
  const tiltRef = useRef<THREE.Group>(null);
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
    const { p, yaw, pitch } = s.craft;
    if (craftRef.current) {
      craftRef.current.position.set(p[0], p[1], p[2]);
      craftRef.current.rotation.set(0, -yaw, 0);
    }
    if (tiltRef.current) tiltRef.current.rotation.set(0, 0, pitch);
    // The chase camera: behind and above the craft, looking a little ahead of it
    const [cy, sy, cp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch)];
    const back = mode === "speeder" ? 12 : 22;
    behind.set(p[0] - cy * cp * back, p[1] + (mode === "speeder" ? 4 : 6), p[2] - sy * cp * back);
    ahead.set(p[0] + cy * cp * 10, p[1] + Math.sin(pitch) * 10, p[2] + sy * cp * 10);
    camera.position.lerp(behind, Math.min(1, dt * 8));
    camera.lookAt(ahead);
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[40, 60, 20]} intensity={1.2} />
      {mode === "speeder" ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[600, 600]} />
            <meshLambertMaterial color="#26361f" />
          </mesh>
          <gridHelper args={[600, 60, "#3c5a33", "#2c4327"]} />
        </>
      ) : (
        <Stars radius={300} depth={80} count={2500} factor={4} fade speed={0} />
      )}
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
      <group ref={craftRef}>
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
    </>
  );
}

// The drag pad and throttle buttons. The pad's offset from its centre steers; a drag down pitches a ship down.
function Controls({ input, onThrottle }: { input: { current: FlightInput }; onThrottle: (value: -1 | 0 | 1) => void }) {
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
        <button type="button" data-testid="flight-boost" className={button} onPointerDown={() => onThrottle(1)} onPointerUp={() => onThrottle(0)} onPointerCancel={() => onThrottle(0)} onPointerLeave={() => onThrottle(0)}>Boost</button>
        <button type="button" data-testid="flight-brake" className={button} onPointerDown={() => onThrottle(-1)} onPointerUp={() => onThrottle(0)} onPointerCancel={() => onThrottle(0)} onPointerLeave={() => onThrottle(0)}>Brake</button>
      </div>
    </>
  );
}

export default function FlightScene({ mode, seed, onDone }: { mode: FlightMode; seed: number; onDone: (outcome: FlightOutcome) => void }) {
  const course = useMemo(() => flightCourse(seed, mode), [seed, mode]);
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
  const land = () => onDone({ course, collected: sim.current.next, timeLeft: Math.max(0, course.limit - sim.current.t) });
  const title = mode === "speeder" ? "Taxi run" : "Delivery run";

  return (
    <div className="relative h-[60vh] w-full overflow-hidden rounded-lg border border-sky-500/40 bg-black" data-testid="flight">
      <Canvas camera={{ position: [0, 6, -12], fov: 65, far: 2000 }} onCreated={({ gl }) => gl.setClearColor(mode === "speeder" ? "#8fb4d8" : "#02040a")}>
        <Flight course={course} mode={mode} input={input} sim={sim} onFinish={finish} />
      </Canvas>
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-xs text-sky-100" data-testid="flight-hud">
        {title} · rings {hud.next} of {course.rings.length} · {hud.speed} {mode === "speeder" ? "m/s" : "km/s"} · {hud.timeLeft} s left
      </div>
      {!hud.done && <Controls input={input} onThrottle={(v) => (input.current.throttle = v)} />}
      {hud.done && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 text-center" data-testid="flight-over">
          <p className="text-lg font-semibold text-yellow-300">{sim.current.next === course.rings.length ? "Every ring taken." : sim.current.t >= course.limit ? "Out of time." : "Run over."}</p>
          <p className="text-sm text-gray-200">{sim.current.next} of {course.rings.length} rings taken.</p>
          <button type="button" className="rounded border border-sky-400 px-4 py-2 text-sm text-sky-100" onClick={land} data-testid="flight-land">Land</button>
        </div>
      )}
    </div>
  );
}
