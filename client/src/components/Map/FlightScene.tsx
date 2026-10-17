import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  alongCourse, createRandom, dogfightStart, flightCourse, flightStart, flightTop, headingOf, inRing, raceOrder, raceStart, stepDogfight, stepFlight, stepRace, targetOf,
  type Craft, type Dogfight, type FlightCourse, type FlightInput, type FlightMode, type Race, type Vec3,
} from "@shared/logic";
import { ShipModel, SpeederModel } from "./LocalMap";

// The flying games and the pilot's route, each on a dedicated page (MinigamePage): a five-second countdown,
// then the run. The drag pad steers (yaw, and pitch where the craft can climb); Boost, Brake and Fire are
// the buttons. The chase camera follows the party's craft.

const PAD = 56; // pixels from the pad's centre to its edge
const RACE_RIVAL_MODELS = ["Landspeeder", "Speederbike", "Landspeeder", "Speederbike"];
const TRACERS = 40;
const TRACER_TIME = 0.18;

export type Minigame =
  | { kind: "run"; title: string; seed: number; mode: FlightMode; count?: number; vehicle?: string; ship?: { size: string; role: string } }
  | { kind: "race"; title: string; seed: number; vehicle: string }
  | { kind: "dogfight"; title: string; seed: number; ship?: { size: string; role: string } };

export type MinigameResult =
  | { kind: "run"; course: FlightCourse; collected: number; timeLeft: number }
  | { kind: "race"; race: Race }
  | { kind: "dogfight"; state: Dogfight };

// The party's craft and its camera: behind and above, looking a little ahead
function place(group: THREE.Group | null, craft: Craft) {
  if (!group) return;
  group.position.set(craft.p[0], craft.p[1], craft.p[2]);
  group.rotation.set(0, -craft.yaw, 0);
}
function chase(camera: THREE.Camera, craft: Craft, back: number, lift: number, dt: number, ahead: THREE.Vector3, behind: THREE.Vector3) {
  const { p, yaw, pitch } = craft;
  const [cy, sy, cp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch)];
  behind.set(p[0] - cy * cp * back, p[1] + lift, p[2] - sy * cp * back);
  ahead.set(p[0] + cy * cp * 10, p[1] + Math.sin(pitch) * 10, p[2] + sy * cp * 10);
  camera.position.lerp(behind, Math.min(1, dt * 8));
  camera.lookAt(ahead);
}

// A speeder, drawn nose along the craft's heading
function Speeder({ model, wrecked }: { model: string; wrecked?: boolean }) {
  return <group rotation={[0, Math.PI / 2, 0]}><SpeederModel model={model} wrecked={wrecked} /></group>;
}
// A ship of the party or a foe, centred on its origin and nose along the heading
function Ship({ size, role, scale = 0.5 }: { size: string; role: string; scale?: number }) {
  return <group scale={scale}><group position={[-3, 0, -2]}><ShipModel ship={{ size, role, status: "orbiting" }} w={6} h={4} /></group></group>;
}

function Sky({ mode }: { mode: FlightMode }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[40, 60, 20]} intensity={1.2} />
      {mode === "speeder" || mode === "airspeeder" ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[900, 900]} />
            <meshLambertMaterial color="#26361f" />
          </mesh>
          <gridHelper args={[900, 90, "#3c5a33", "#2c4327"]} />
        </>
      ) : (
        <Stars radius={300} depth={80} count={2500} factor={4} fade speed={0} />
      )}
    </>
  );
}

// The rings of a course, the next one lit
function Rings({ course, taken }: { course: FlightCourse; taken: number }) {
  return (
    <>
      {course.rings.map((ring, i) => {
        const color = i < taken ? "#7dffa0" : i === taken ? "#ffd24a" : "#7a8799";
        return (
          <mesh key={i} position={ring}>
            <torusGeometry args={[course.radius, i === taken ? 0.6 : 0.35, 8, 32]} />
            <meshBasicMaterial color={color} transparent opacity={i < taken ? 0.35 : 0.9} />
          </mesh>
        );
      })}
    </>
  );
}

// A run: the rings in order against the clock (taxi, delivery, or a pilot's route)
function RunGame({ game, course, go, input, onFinish, onFrame }: { game: Extract<Minigame, { kind: "run" }>; course: FlightCourse; go: { current: boolean }; input: { current: FlightInput }; onFinish: (sim: { next: number; t: number }) => void; onFrame: (snap: { craft: Craft; next: number; t: number }) => void }) {
  const craftRef = useRef<THREE.Group>(null);
  const sim = useRef({ craft: flightStart(course), next: 0, t: 0, done: false });
  const [next, setNext] = useState(0);
  const { camera } = useThree();
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const s = sim.current;
    if (s.done || !go.current) return;
    const dt = Math.min(delta, 0.25);
    s.craft = stepFlight(s.craft, input.current, dt, game.mode);
    s.t += dt;
    const ring = course.rings[s.next];
    if (ring && inRing(s.craft.p, ring, course.radius)) {
      s.next++;
      setNext(s.next);
    }
    if (s.next >= course.rings.length || s.t >= course.limit) {
      s.done = true;
      onFinish({ next: s.next, t: s.t });
    }
    place(craftRef.current, s.craft);
    chase(camera, s.craft, game.mode === "ship" ? 22 : 12, game.mode === "ship" ? 6 : 4, dt, ahead, behind);
    onFrame({ craft: s.craft, next: s.next, t: s.t });
  });
  return (
    <>
      <Sky mode={game.mode} />
      <Rings course={course} taken={next} />
      <group ref={craftRef}>
        {game.mode === "ship" ? <Ship size={game.ship?.size ?? "Small"} role={game.ship?.role ?? "fighter"} /> : <Speeder model={game.mode === "airspeeder" ? "Airspeeder" : game.vehicle ?? "Landspeeder"} />}
      </group>
    </>
  );
}

// A race: the grid, the start line, the racers, the hazards on the course, and what they bump
function RaceGame({ course, race0, go, input, onFinish, onFrame }: { course: FlightCourse; race0: Race; go: { current: boolean }; input: { current: FlightInput }; onFinish: (race: Race) => void; onFrame: (race: Race) => void }) {
  const raceRef = useRef<Race>(race0);
  const racerRefs = useRef<(THREE.Group | null)[]>([]);
  const hazardRefs = useRef<(THREE.Group | null)[]>([]);
  const [snap, setSnap] = useState<Race>(race0);
  const { camera } = useThree();
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);
  const start = useMemo(() => flightStart(course), [course]);
  const partyIndex = race0.racers.findIndex((racer) => racer.party);
  useFrame((_, delta) => {
    if (!go.current || raceRef.current.over) return;
    const dt = Math.min(delta, 0.25);
    const next = stepRace(raceRef.current, course, input.current, dt);
    raceRef.current = next;
    next.racers.forEach((racer, i) => place(racerRefs.current[i], racer.craft));
    next.hazards.forEach((h, i) => {
      const group = hazardRefs.current[i];
      if (group) group.visible = !(h.kind === "mine" && h.spent);
    });
    const mine = next.racers[partyIndex];
    chase(camera, mine.craft, 12, 4, dt, ahead, behind);
    onFrame(next);
    if (next.over) onFinish(next);
  });
  // The HUD reads the race ten times a second
  useEffect(() => {
    const timer = setInterval(() => setSnap(raceRef.current), 100);
    return () => clearInterval(timer);
  }, []);
  const startYaw = race0.racers[0].craft.yaw;
  return (
    <>
      <Sky mode="speeder" />
      <Rings course={course} taken={snap.racers[partyIndex].next} />
      {/* The start line: across the grid's front, where every racer begins */}
      <group position={[start.p[0], 0.05, start.p[2]]} rotation={[0, -startYaw, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.8, 24]} />
          <meshBasicMaterial color="#f4f4f4" />
        </mesh>
      </group>
      {race0.hazards.map((h, i) => (
        <group key={h.id} ref={(el) => { hazardRefs.current[i] = el; }} position={h.p}>
          {h.kind === "pylon" && (
            <mesh position={[0, 2.5, 0]}>
              <cylinderGeometry args={[0.6, 0.8, 5, 10]} />
              <meshLambertMaterial color="#e8e8e8" emissive="#ff6a3a" emissiveIntensity={0.3} />
            </mesh>
          )}
          {h.kind === "slick" && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
              <circleGeometry args={[10, 24]} />
              <meshBasicMaterial color="#2a1f4a" transparent opacity={0.7} />
            </mesh>
          )}
          {h.kind === "mine" && (
            <mesh position={[0, 1, 0]}>
              <sphereGeometry args={[1.2, 10, 8]} />
              <meshLambertMaterial color="#ff3030" emissive="#ff3030" emissiveIntensity={0.6} />
            </mesh>
          )}
        </group>
      ))}
      {race0.racers.map((racer, i) => (
        <group key={racer.id} ref={(el) => { racerRefs.current[i] = el; }}>
          <Speeder model={racer.model} wrecked={racer.wrecked} />
        </group>
      ))}
    </>
  );
}

// A dogfight: the party's ship and the foes (ship models), laser tracers for every shot, and the foes' fire
function Fight({ ship, go, input, fire, sim, onFinish, onFrame }: { ship: { size: string; role: string }; go: { current: boolean }; input: { current: FlightInput }; fire: { current: boolean }; sim: { current: { state: Dogfight; roll: () => number; tracers: { from: Vec3; to: Vec3; hit: boolean; by: string; ttl: number }[] } }; onFinish: (state: Dogfight) => void; onFrame: (state: Dogfight) => void }) {
  const craftRef = useRef<THREE.Group>(null);
  const foeRefs = useRef<Map<number, THREE.Group>>(new Map());
  const tracerRefs = useRef<(THREE.Mesh | null)[]>([]);
  const { camera } = useThree();
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);
  const [ids, setIds] = useState(sim.current.state.foes.map((f) => f.id));
  const countRef = useRef(ids.length);
  useFrame((_, delta) => {
    const s = sim.current;
    if (s.state.over || !go.current) return;
    const dt = Math.min(delta, 0.25);
    s.state = stepDogfight(s.state, input.current, fire.current, dt, s.roll);
    // New shots start a tracer each; old tracers fade
    for (const e of s.state.events) s.tracers.push({ from: e.from, to: e.to, hit: e.hit, by: e.by, ttl: TRACER_TIME });
    s.tracers = s.tracers.filter((tr) => (tr.ttl -= dt) > 0).slice(-TRACERS);
    s.tracers.forEach((tr, i) => {
      const mesh = tracerRefs.current[i];
      if (!mesh) return;
      mesh.visible = true;
      const mid = [(tr.from[0] + tr.to[0]) / 2, (tr.from[1] + tr.to[1]) / 2, (tr.from[2] + tr.to[2]) / 2];
      mesh.position.set(mid[0], mid[1], mid[2]);
      mesh.lookAt(tr.to[0], tr.to[1], tr.to[2]);
      const len = Math.hypot(tr.to[0] - tr.from[0], tr.to[1] - tr.from[1], tr.to[2] - tr.from[2]);
      mesh.scale.set(1, 1, len);
      (mesh.material as THREE.MeshBasicMaterial).color.set(tr.by === "player" ? (tr.hit ? "#ffffff" : "#7fe0ff") : "#ff5a5a");
    });
    for (let i = s.tracers.length; i < TRACERS; i++) if (tracerRefs.current[i]) tracerRefs.current[i]!.visible = false;
    place(craftRef.current, s.state.craft);
    chase(camera, s.state.craft, 22, 6, dt, ahead, behind);
    for (const foe of s.state.foes) foeRefs.current.get(foe.id)?.position.set(foe.p[0], foe.p[1], foe.p[2]);
    onFrame(s.state);
    if (s.state.over) onFinish(s.state);
    if (s.state.foes.length !== countRef.current) {
      countRef.current = s.state.foes.length;
      setIds(s.state.foes.map((f) => f.id));
    }
  });
  return (
    <>
      <Sky mode="ship" />
      <group ref={craftRef}><Ship size={ship.size} role={ship.role} /></group>
      {ids.map((id) => {
        const foe = sim.current.state.foes.find((f) => f.id === id);
        return (
          <group key={id} ref={(el) => { if (el) foeRefs.current.set(id, el); else foeRefs.current.delete(id); }} position={foe?.p ?? [0, 0, 0]}>
            <Ship size="Small" role="fighter" />
          </group>
        );
      })}
      {Array.from({ length: TRACERS }, (_, i) => (
        <mesh key={i} ref={(el) => { tracerRefs.current[i] = el; }} visible={false}>
          <boxGeometry args={[0.2, 0.2, 1]} />
          <meshBasicMaterial color="#7fe0ff" />
        </mesh>
      ))}
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

// The reticule in the middle of the view, red when a foe is on it
function Reticule({ locked }: { locked: boolean }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ borderColor: locked ? "#ff3b3b" : "#d6f3ff", boxShadow: locked ? "0 0 8px #ff3b3b" : "none" }} data-testid="reticule" data-locked={locked ? "true" : "false"}>
      <div className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-current" style={{ color: locked ? "#ff3b3b" : "#d6f3ff" }} />
      <div className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2" style={{ background: locked ? "#ff3b3b" : "#d6f3ff" }} />
    </div>
  );
}

// Pips at the edge of the view for each foe that is not on screen, pointing to where it is
function Pips({ state }: { state: Dogfight }) {
  const { p, yaw, pitch } = state.craft;
  const [cy, sy] = [Math.cos(yaw), Math.sin(yaw)];
  return (
    <>
      {state.foes.map((foe) => {
        const d: Vec3 = [foe.p[0] - p[0], foe.p[1] - p[1], foe.p[2] - p[2]];
        const forward = d[0] * cy + d[2] * sy;
        const lateral = -d[0] * sy + d[2] * cy;
        const planar = Math.hypot(forward, lateral) || 1;
        const elevation = Math.atan2(d[1], planar) - pitch;
        const onScreen = forward > 0 && Math.abs(Math.atan2(lateral, forward)) < 0.6 && Math.abs(elevation) < 0.4;
        if (onScreen) return null;
        const len = Math.hypot(lateral, elevation * 40) || 1;
        const [dx, dy] = [lateral / len, -(elevation * 40) / len];
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <div key={foe.id} className="pointer-events-none absolute h-0 w-0" style={{ left: `${50 + dx * 44}%`, top: `${50 + dy * 40}%` }} data-testid="foe-pip">
            <div className="-translate-x-1/2 -translate-y-1/2 text-base leading-none text-red-400" style={{ transform: `translate(-50%, -50%) rotate(${angle + 90}deg)` }}>▲</div>
          </div>
        );
      })}
    </>
  );
}

// The dedicated page of a minigame: a five-second countdown, then the game. Calls onDone with how it ended.
export function MinigamePage({ game, onDone, onExit }: { game: Minigame; onDone: (result: MinigameResult) => void; onExit: () => void }) {
  const course = useMemo(() => {
    if (game.kind === "race") return flightCourse(game.seed, "speeder", { laps: 2 });
    if (game.kind === "run") return flightCourse(game.seed, game.mode, { count: game.count });
    return null;
  }, [game]);
  const race0 = useMemo(() => (game.kind === "race" && course ? raceStart(course, game.seed, game.vehicle, RACE_RIVAL_MODELS) : null), [game, course]);
  const dogfight0 = useMemo(() => (game.kind === "dogfight" ? dogfightStart(game.seed) : null), [game]);
  const [count, setCount] = useState(5);
  const go = useRef(false);
  const input = useRef<FlightInput>({ steer: { x: 0, y: 0 }, throttle: 0 });
  const fire = useRef(false);
  const fightSim = useRef({ state: dogfight0 ?? dogfightStart(1), roll: createRandom((game.seed | 0) + 1).next, seen: 0, tracers: [] as { from: Vec3; to: Vec3; hit: boolean; by: string; ttl: number }[] });
  // The games write their latest snapshot here each frame; the HUD copies it ten times a second
  const latest = useRef<{ race?: Race; fight?: Dogfight; run?: { next: number; speed: number } }>({});
  const [hud, setHud] = useState<typeof latest.current>({});
  useEffect(() => {
    const timer = setInterval(() => setHud({ ...latest.current }), 100);
    return () => clearInterval(timer);
  }, []);
  const [finished, setFinished] = useState<MinigameResult | null>(null);

  // Five seconds, then GO, then the game starts
  useEffect(() => {
    const timer = setTimeout(() => {
      if (count > 0) setCount(count - 1);
      else {
        go.current = true;
        setCount(-1);
      }
    }, count > 0 ? 1000 : 700);
    return () => clearTimeout(timer);
  }, [count]);

  const finish = (result: MinigameResult) => setFinished(result);

  const title = game.title;
  const counting = count >= 0;
  const headline = count > 0 ? String(count) : count === 0 ? "GO!" : "";
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" data-testid="minigame-page">
      <div className="flex items-center justify-between gap-2 border-b border-sky-500/30 bg-gray-950 px-3 py-2 text-sm text-sky-100">
        <span className="font-semibold" data-testid="minigame-title">{title}</span>
        <button type="button" className="rounded border border-gray-500 px-3 py-1 text-xs" onClick={onExit} data-testid="minigame-exit">Leave it</button>
      </div>
      <div className="relative flex-1 overflow-hidden" data-testid={`minigame-${game.kind}`}>
        {game.kind === "run" && course && (
          <Canvas camera={{ position: [0, 6, -12], fov: 65, far: 2000 }} onCreated={({ gl }) => gl.setClearColor(game.mode === "ship" ? "#02040a" : "#8fb4d8")}>
            <RunGame game={game} course={course} go={go} input={input} onFinish={({ next, t }) => finish({ kind: "run", course, collected: next, timeLeft: Math.max(0, course.limit - t) })} onFrame={(s) => (latest.current.run = { next: s.next, speed: Math.round(s.craft.speed) })} />
          </Canvas>
        )}
        {game.kind === "race" && course && race0 && (
          <Canvas camera={{ position: [0, 6, -12], fov: 65, far: 2000 }} onCreated={({ gl }) => gl.setClearColor("#8fb4d8")}>
            <RaceGame course={course} race0={race0} go={go} input={input} onFinish={(race) => finish({ kind: "race", race })} onFrame={(race) => (latest.current.race = race)} />
          </Canvas>
        )}
        {game.kind === "dogfight" && (
          <Canvas camera={{ position: [0, 6, -22], fov: 65, far: 2000 }} onCreated={({ gl }) => gl.setClearColor("#02040a")}>
            <Fight ship={game.ship ?? { size: "Small", role: "fighter" }} go={go} input={input} fire={fire} sim={fightSim} onFinish={(state) => finish({ kind: "dogfight", state })} onFrame={(state) => (latest.current.fight = state)} />
          </Canvas>
        )}
        {game.kind === "dogfight" && hud.fight && <Reticule locked={!!targetOf(hud.fight)} />}
        {game.kind === "dogfight" && hud.fight && <Pips state={hud.fight} />}
        {game.kind === "dogfight" && hud.fight && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-xs text-sky-100" data-testid="dogfight-hud">
            hull {hud.fight.hull} · foes {hud.fight.foes.length} left, {hud.fight.kills} down · {Math.round(hud.fight.t)} s
          </div>
        )}
        {game.kind === "race" && hud.race && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-xs text-sky-100" data-testid="race-hud">
            {raceOrder(hud.race).slice(0, 3).map((r, i) => `${i + 1}. ${r.name}${r.wrecked ? " (out)" : ""}`).join(" · ")} · hull {hud.race.racers[0].hull} · {Math.ceil(Math.max(0, hud.race.limit - hud.race.t))} s
          </div>
        )}
        {game.kind === "run" && hud.run && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-xs text-sky-100" data-testid="flight-hud">
            {title} · rings {hud.run.next} of {course?.rings.length ?? 0} · {hud.run.speed} {game.mode === "ship" ? "km/s" : "m/s"}
          </div>
        )}
        {counting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50" data-testid="countdown">
            <span className="text-8xl font-bold text-yellow-300">{headline}</span>
          </div>
        )}
        {!counting && !finished && (
          <Controls
            input={input}
            onThrottle={game.kind === "race" || game.kind === "run" || game.kind === "dogfight" ? (v) => (input.current.throttle = v) : undefined}
            onFire={game.kind === "dogfight" ? (down) => (fire.current = down) : undefined}
          />
        )}
        {finished && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center" data-testid="minigame-over">
            <p className="text-lg font-semibold text-yellow-300">{finished.kind === "race" ? "The race is over." : finished.kind === "dogfight" ? (finished.state.foes.length === 0 ? "The sky is clear." : finished.state.hull <= 0 ? "Your ship is shot down." : "The fight is over.") : "The run is over."}</p>
            <button type="button" className="rounded border border-sky-400 px-4 py-2 text-sm text-sky-100" onClick={() => onDone(finished)} data-testid="minigame-land">Land</button>
          </div>
        )}
      </div>
    </div>
  );
}
