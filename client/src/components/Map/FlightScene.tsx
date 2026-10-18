import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  createRandom, dogfightStart, flightCourse, flightStart, groundAt, inRing, raceCourse, raceDistance, raceLap, raceNextGate, raceOrder, raceResult, raceStart, stepDogfight, stepFlight, stepRace, targetOf,
  RACE, RACE_MODEL_SCALE, SPEEDER_BODY,
  type Craft, type Dogfight, type FlightCourse, type FlightInput, type FlightMode, type Hazard, type Race, type RaceEvent, type RaceGate, type RaceInput, type RaceRamp, type RaceTrack, type SpeederKind, type Vec3,
} from "@shared/logic";
import { ShipModel, SpeederModel } from "./LocalMap";
import { Model, shade, type Kit } from "./models";
import { Scatter, raceScenery, useQuality, type Placed } from "./siteAssets";

// The flying games, the speeder race and the pilot's route, each on a dedicated page (MinigamePage): a
// five-second countdown, then the run. The drag pad steers (yaw, and pitch where the craft can climb);
// Boost, Brake and Fire are the buttons (in a race Boost draws on its meter). The chase camera follows
// the party's craft.

const PAD = 56; // pixels from the pad's centre to its edge
const RACE_RIVAL_MODELS = ["Landspeeder", "Speederbike", "Landspeeder", "Speederbike"];
const TRACERS = 40;
const TRACER_TIME = 0.18;

export type Minigame =
  | { kind: "run"; title: string; seed: number; mode: FlightMode; count?: number; vehicle?: string; ship?: { size: string; role: string } }
  | { kind: "race"; title: string; seed: number; vehicle: string; biome?: string }
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

// ---------------------------------------------------------------------------------------------
// The speeder race (2026-10-18): the course of `raceCourse` (shared/logic) drawn over its own ground,
// the track and the trails as ribbons, gates, ramps, mines and oil, what lines the course from the
// site library (struck as the shapes the library gives), and the racers as their models with a
// shadow under each, the flame of a boost, a hull bar over each rival and sparks where something is
// struck. A chevron over the party's speeder points to the next gate.
// ---------------------------------------------------------------------------------------------

interface RaceLook { sky: string; zenith: string; ground: string; ground2: string; track: string; trail: string }
const RACE_LOOKS: Record<string, RaceLook> = {
  temperate: { sky: "#bcd4e6", zenith: "#4f86c6", ground: "#4f7a3c", ground2: "#6d8f48", track: "#8c7656", trail: "#6f5a42" },
  forest: { sky: "#b4cbd6", zenith: "#477bb0", ground: "#3d6634", ground2: "#55783f", track: "#7f6a4f", trail: "#5f4c39" },
  jungle: { sky: "#c4dbd2", zenith: "#3f8ab0", ground: "#2f6a35", ground2: "#4a8a40", track: "#86684a", trail: "#634c36" },
  swamp: { sky: "#b9c2a8", zenith: "#6a8a8a", ground: "#4f5a38", ground2: "#66704a", track: "#6f6248", trail: "#544a36" },
  desert: { sky: "#f0dcb8", zenith: "#6fa2d6", ground: "#d4b07a", ground2: "#c49a62", track: "#a8835a", trail: "#93704a" },
  ice: { sky: "#dfe9f1", zenith: "#86a9cf", ground: "#e9f0f4", ground2: "#cddbe5", track: "#9fb0bd", trail: "#b4c3cf" },
  volcanic: { sky: "#7a5a50", zenith: "#3a2a2a", ground: "#3d3632", ground2: "#4d3e34", track: "#2c2624", trail: "#3a2e28" },
  barren: { sky: "#d6cdbd", zenith: "#8a9aaa", ground: "#8a7f6c", ground2: "#a0937a", track: "#6f6556", trail: "#7d7060" },
  urban: { sky: "#c4ced8", zenith: "#5a7aa0", ground: "#4f6f45", ground2: "#647f52", track: "#5f6366", trail: "#6a5c48" },
  ocean: { sky: "#c6e0ec", zenith: "#3f86c8", ground: "#5a8a52", ground2: "#c8b88a", track: "#9a8462", trail: "#7a6448" },
};
const raceLook = (biome: string) => RACE_LOOKS[biome] ?? RACE_LOOKS.temperate;
// The gates' posts: drawn by the race (Gate below) and struck as this shape
const GATE_POST = { r: 0.45, h: 8 };
const SPARKS = 48;

// The sky: a dome shading from the horizon (the fog's colour) to the zenith
function RaceSky({ look }: { look: RaceLook }) {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(1500, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const [low, high] = [new THREE.Color(look.sky), new THREE.Color(look.zenith)];
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      c.copy(low).lerp(high, Math.pow(Math.max(0, p.getY(i) / 1500), 0.6));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [look]);
  return (
    <mesh geometry={geo} raycast={() => null}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

// The ground: one mesh over the course and well past it (the fog hides its edge), mottled, its
// verges worn to the colour of the track, lighter on the heights
function RaceGround({ track, look }: { track: RaceTrack; look: RaceLook }) {
  const geo = useMemo(() => {
    const size = track.extent + 220;
    const segs = 200;
    const step = (size * 2) / segs;
    const row = segs + 1;
    const pos = new Float32Array(row * row * 3);
    const col = new Float32Array(row * row * 3);
    const [a, b, verge] = [new THREE.Color(look.ground), new THREE.Color(look.ground2), new THREE.Color(look.track)];
    const c = new THREE.Color();
    for (let j = 0; j < row; j++) {
      for (let i = 0; i < row; i++) {
        const [x, z] = [-size + i * step, -size + j * step];
        const y = groundAt(track, x, z, false);
        const k = (j * row + i) * 3;
        pos.set([x, y, z], k);
        const mottle = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.cos(z * 0.031) * 2) * Math.cos(z * 0.052 - x * 0.013);
        c.copy(a).lerp(b, mottle);
        const d = raceDistance(track, x, z);
        if (d < track.width / 2 + 6) c.lerp(verge, 0.6 * (1 - Math.max(0, d - track.width / 2) / 6));
        c.multiplyScalar(0.92 + Math.max(-0.1, Math.min(0.16, y * 0.012)));
        col.set([c.r, c.g, c.b], k);
      }
    }
    const index = new Uint32Array(segs * segs * 6);
    let q = 0;
    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const v = j * row + i;
        index.set([v, v + row, v + 1, v + 1, v + row, v + row + 1], q);
        q += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();
    return g;
  }, [track, look]);
  return (
    <mesh geometry={geo} raycast={() => null}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

// A ribbon laid over the ground along a line: the track with kerbs (red and white stripes on the
// bends), or a trail. Each strip of each stretch is two triangles of one colour, so the stripes are sharp.
function ribbon(track: RaceTrack, points: Vec3[], width: number, closed: boolean, surface: string, kerbs: boolean): THREE.BufferGeometry {
  const n = points.length;
  const rows = closed ? n + 1 : n;
  const strips: [number, number][] = kerbs ? [[-width / 2 - 1, -width / 2], [-width / 2, width / 2], [width / 2, width / 2 + 1]] : [[-width / 2, width / 2]];
  const edges = (r: number) => {
    const i = r % n;
    const [a, b] = [points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]];
    const yaw = Math.atan2(b[2] - a[2], b[0] - a[0]);
    const [rx, rz] = [-Math.sin(yaw), Math.cos(yaw)];
    return (off: number): Vec3 => {
      const [x, z] = [points[i][0] + rx * off, points[i][2] + rz * off];
      return [x, groundAt(track, x, z, false) + 0.07, z];
    };
  };
  const pos: number[] = [];
  const col: number[] = [];
  const [base, red, white, edge] = [new THREE.Color(surface), new THREE.Color("#c83a32"), new THREE.Color("#ece8e0"), new THREE.Color(surface).multiplyScalar(0.78)];
  const c = new THREE.Color();
  let here = edges(0);
  for (let r = 0; r < rows - 1; r++) {
    const next = edges(r + 1);
    const bend = closed ? track.bends[r % n] : 0;
    strips.forEach(([from, to], k) => {
      const kerb = kerbs && k !== 1;
      if (kerb) c.copy(bend > 1 / 90 ? (r % 2 ? red : white) : edge);
      else c.copy(base).multiplyScalar(0.95 + 0.06 * Math.sin(r * 0.7));
      const [a, b, d, e] = [here(from), here(to), next(from), next(to)];
      for (const v of [a, b, d, b, e, d]) {
        pos.push(...v);
        col.push(c.r, c.g, c.b);
      }
    });
    here = next;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function RaceRibbons({ track, look }: { track: RaceTrack; look: RaceLook }) {
  const geos = useMemo(() => [ribbon(track, track.points, track.width, true, look.track, true), ...track.trails.map((t) => ribbon(track, t.points, t.width, false, look.trail, false))], [track, look]);
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} raycast={() => null}>
          <meshLambertMaterial vertexColors polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
    </>
  );
}

// A chequered texture, for the start line and the finish gate
function useChequer(): THREE.Texture {
  return useMemo(() => {
    const data = new Uint8Array(16 * 2 * 4);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) data.set((x + y) % 2 ? [20, 20, 20, 255] : [240, 240, 240, 255], (y * 16 + x) * 4);
    const t = new THREE.DataTexture(data, 16, 2);
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }, []);
}

// A gate: two posts either side of the track and a bar over it with a lit strip, yellow on the next
// gate; the first is the start and finish, chequered, with the line across the track under it
function Gate({ gate, first, lit, chequer, track }: { gate: RaceGate; first: boolean; lit: boolean; chequer: THREE.Texture; track: RaceTrack }) {
  const span = gate.half + 0.5;
  return (
    <group position={gate.p} rotation={[0, -gate.yaw, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, GATE_POST.h / 2 - 0.5, s * span]}>
          <cylinderGeometry args={[GATE_POST.r, GATE_POST.r * 1.2, GATE_POST.h + 1, 10]} />
          <meshLambertMaterial color="#3a3f46" />
        </mesh>
      ))}
      <mesh position={[0, GATE_POST.h - 0.7, 0]}>
        <boxGeometry args={[0.6, 1.3, span * 2 + 0.9]} />
        {first ? <meshBasicMaterial map={chequer} /> : <meshLambertMaterial color="#2b2f36" />}
      </mesh>
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, GATE_POST.h - 0.7, 0]}>
          <boxGeometry args={[0.04, 0.32, span * 2]} />
          <meshBasicMaterial color={lit ? "#ffd24a" : first ? "#f4f4f4" : "#5aa8ff"} />
        </mesh>
      ))}
      {first && (
        <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, groundAt(track, gate.p[0], gate.p[2], false) - gate.p[1] + 0.1, 0]}>
          <planeGeometry args={[track.width, 1.6]} />
          <meshBasicMaterial map={chequer} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
      )}
    </group>
  );
}

// A ramp: a steel wedge with yellow treads and a lit lip, sunk into the ground behind
function buildRamp(k: Kit, { len, wid, h }: RaceRamp) {
  const side = new THREE.Shape();
  side.moveTo(-len / 2, -0.8);
  side.lineTo(-len / 2, 0);
  side.lineTo(len / 2, h);
  side.lineTo(len / 2, -0.8);
  side.lineTo(-len / 2, -0.8);
  k.extrude(side, wid, "#7d858f", { at: [0, 0, -wid / 2], bevel: 0.05, finish: "sheen" });
  const slope = Math.atan2(h, len);
  for (let t = 0.12; t < 0.95; t += 0.2) k.box([0.45, 0.04, wid * 0.86], "#f2c14e", { at: [-len / 2 + len * t, h * t + 0.03, 0], rot: [0, 0, slope] });
  k.box([0.3, 0.06, wid], "#e8483a", { at: [len / 2 - 0.15, h + 0.02, 0], finish: "glow" });
}
function RampModel({ ramp, track }: { ramp: RaceRamp; track: RaceTrack }) {
  return (
    <group position={[ramp.p[0], groundAt(track, ramp.p[0], ramp.p[2], false), ramp.p[2]]} rotation={[0, -ramp.yaw, 0]}>
      <Model id={`race:ramp:${ramp.len}:${ramp.wid}:${ramp.h}`} build={(k) => buildRamp(k, ramp)} shadow={false} />
    </group>
  );
}

// A mine: a disc with its prongs and a red light that blinks; once gone off, a scorch on the ground
function buildMine(k: Kit) {
  k.cyl(0.8, 0.14, "#3a3f46", { at: [0, 0.07, 0], seg: 14, finish: "sheen" });
  k.sphere(0.35, "#5a5f66", { at: [0, 0.14, 0], half: true, seg: [12, 6], finish: "sheen" });
  for (let i = 0; i < 4; i++) k.box([0.5, 0.06, 0.12], "#2b2722", { at: [Math.cos(i * 1.57) * 0.75, 0.1, Math.sin(i * 1.57) * 0.75], rot: [0, -i * 1.57, 0] });
}
// Oil on the ground, laid over its rise and fall
function slickGeometry(track: RaceTrack, h: Hazard): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(h.r, 28, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const wobble = 1 + 0.18 * Math.sin(i * 1.7);
    const [x, z] = [p.getX(i) * wobble, p.getZ(i) * wobble];
    p.setXYZ(i, x, groundAt(track, h.p[0] + x, h.p[2] + z, false) - h.p[1] + 0.09, z);
  }
  return g;
}
function Hazards({ track, hazards }: { track: RaceTrack; hazards: Hazard[] }) {
  const lights = useRef<(THREE.Mesh | null)[]>([]);
  const slicks = useMemo(() => track.hazards.map((h) => (h.kind === "slick" ? slickGeometry(track, h) : null)), [track]);
  useFrame(({ clock }) => {
    const on = Math.sin(clock.elapsedTime * 7) > 0;
    for (const m of lights.current) if (m) m.scale.setScalar(on ? 1 : 0.4);
  });
  return (
    <>
      {hazards.map((h, i) => (
        <group key={h.id} position={h.p}>
          {h.kind === "slick" && slicks[i] && (
            <mesh geometry={slicks[i]!}>
              <meshStandardMaterial color="#14101e" roughness={0.15} metalness={0.6} transparent opacity={0.85} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
            </mesh>
          )}
          {h.kind === "mine" && !h.spent && (
            <>
              <Model id="race:mine" build={buildMine} shadow={false} />
              <mesh ref={(el) => { lights.current[i] = el; }} position={[0, 0.5, 0]}>
                <sphereGeometry args={[0.16, 8, 6]} />
                <meshBasicMaterial color="#ff2a2a" />
              </mesh>
            </>
          )}
          {h.kind === "mine" && h.spent && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
              <circleGeometry args={[2.6, 16]} />
              <meshBasicMaterial color="#1a1512" transparent opacity={0.7} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

// What lines the course, from the site library: struck pieces as the race placed them (less what was
// broken), and ground cover between them, more of it on a device that can draw it
function RaceProps({ track, biome, broken, cover }: { track: RaceTrack; biome: string; broken: number[]; cover: string[] }) {
  const tier = useQuality((q) => q.tier);
  const placed = useMemo(() => {
    const gone = new Set(broken);
    return track.props.filter((p) => p.key !== "gate" && !gone.has(p.id)).map((p): Placed => ({ key: p.key, x: p.p[0], y: p.p[2], h: p.p[1], rot: -p.yaw, scale: p.scale, v: p.v }));
  }, [track, broken]);
  const ground = useMemo(() => {
    if (!cover.length) return [];
    const r = createRandom(track.seed + 77);
    const out: Placed[] = [];
    const want = tier === "lite" ? 260 : 900;
    for (let tries = 0; tries < want * 4 && out.length < want; tries++) {
      const x = (r.next() * 2 - 1) * (track.extent - 20);
      const z = (r.next() * 2 - 1) * (track.extent - 20);
      const d = raceDistance(track, x, z);
      if (d < track.width / 2 + 1.6 || d > 150 || (d > 60 && r.next() < 0.6)) continue;
      out.push({ key: r.pick(cover), x, y: z, h: groundAt(track, x, z, false), rot: r.next() * Math.PI * 2, scale: 1.6 + r.next() * 1.2, v: Math.floor(r.next() * 6) });
    }
    return out;
  }, [track, cover, tier]);
  return (
    <>
      <Scatter placed={placed} biome={biome} />
      <Scatter placed={ground} biome={biome} />
    </>
  );
}

// A racer's pilot in a flight suit and helmet: astride a bike leaning to the bars, at the stick of a
// landspeeder behind its windscreen, or a helmet under an airspeeder's canopy (model units, nose to +x)
const SUITS = ["#c8663a", "#3f6fb0", "#d0a23a", "#5a8a52", "#8a3a8a", "#2b2f36", "#b5362f"];
function buildPilot(k: Kit, kind: SpeederKind, suit: string) {
  const helmet = shade(suit, 1.25);
  const visor = "#1b2a38";
  if (kind === "bike") {
    k.rod([-0.32, 0.56, 0], [-0.02, 0.95, 0], 0.13, suit, { seg: 8 });
    k.sphere(0.12, helmet, { at: [0.06, 1.1, 0], seg: [10, 8], finish: "sheen" });
    k.box([0.08, 0.07, 0.18], visor, { at: [0.15, 1.1, 0], round: 0.03, finish: "glass" });
    k.pair((s) => {
      k.rod([0, 0.92, s * 0.13], [0.3, 0.62, s * 0.12], 0.04, suit, { seg: 6 });
      k.rod([-0.3, 0.55, s * 0.1], [-0.04, 0.42, s * 0.17], 0.055, suit, { seg: 6 });
      k.rod([-0.04, 0.42, s * 0.17], [-0.26, 0.2, s * 0.16], 0.045, shade(suit, 0.7), { seg: 6 });
    });
    return;
  }
  if (kind === "air") {
    k.sphere(0.12, helmet, { at: [0.05, 0.66, 0], seg: [10, 8], finish: "sheen" });
    k.box([0.07, 0.06, 0.16], visor, { at: [0.14, 0.66, 0], round: 0.03, finish: "glass" });
    return;
  }
  k.rod([-0.28, 0.66, 0.2], [-0.2, 1.0, 0.2], 0.13, suit, { seg: 8 });
  k.sphere(0.12, helmet, { at: [-0.17, 1.16, 0.2], seg: [10, 8], finish: "sheen" });
  k.box([0.07, 0.06, 0.16], visor, { at: [-0.08, 1.16, 0.2], round: 0.03, finish: "glass" });
  k.pair((s) => k.rod([-0.2, 0.95, 0.2 + s * 0.12], [0.12, 0.82, 0.2 + s * 0.08], 0.04, suit, { seg: 6 }));
}

// A racer: its model and pilot (the box's middle is the racer's place, the model's origin behind or
// ahead of it), and the flame of its engines while it boosts
function RacerModel({ model, kind, wrecked, suit, flame }: { model: string; kind: SpeederKind; wrecked: boolean; suit: string; flame: (el: THREE.Mesh | null) => void }) {
  const body = SPEEDER_BODY[kind];
  return (
    <>
      <group position={[-body.ahead, 0, 0]} scale={RACE_MODEL_SCALE}>
        <Speeder model={model} wrecked={wrecked} />
        {!wrecked && <Model id={`race:pilot:${kind}:${suit}`} build={(k) => buildPilot(k, kind, suit)} />}
      </group>
      {!wrecked && (
        <mesh ref={flame} position={[-body.half[0] - 0.7, 0.6, 0]} rotation={[0, 0, Math.PI / 2]} visible={false}>
          <coneGeometry args={[Math.min(0.26, body.half[1] * 0.6), 1.8, 10, 1, true]} />
          <meshBasicMaterial color="#7fd0ff" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}

// Sparks and debris where something was struck, and the fire of a mine
interface Spark { p: THREE.Vector3; v: THREE.Vector3; ttl: number; life: number }
const SPARK_MATS: Record<string, THREE.MeshBasicMaterial> = {
  hit: new THREE.MeshBasicMaterial({ color: "#ffd27a" }),
  smash: new THREE.MeshBasicMaterial({ color: "#a0703a" }),
  mine: new THREE.MeshBasicMaterial({ color: "#ff6a2a" }),
};
function Sparks({ queue }: { queue: { current: RaceEvent[] } }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const sparks = useMemo<Spark[]>(() => Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), ttl: 0, life: 1 })), []);
  const cursor = useRef(0);
  const flash = useRef<THREE.Mesh>(null);
  const flashT = useRef(0);
  useFrame((_, delta) => {
    for (const e of queue.current.splice(0)) {
      const count = e.kind === "mine" ? 18 : e.kind === "smash" ? 10 : Math.min(10, 3 + Math.round(e.power / 6));
      const speed = e.kind === "mine" ? 14 : 4 + Math.min(10, e.power * 0.3);
      for (let i = 0; i < count; i++) {
        const k = cursor.current++ % SPARKS;
        const s = sparks[k];
        s.p.set(e.p[0], e.p[1], e.p[2]);
        s.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
        s.ttl = s.life = 0.4 + Math.random() * 0.5;
        const mesh = refs.current[k];
        if (mesh) mesh.material = SPARK_MATS[e.kind] ?? SPARK_MATS.hit;
      }
      if (e.kind === "mine" && flash.current) {
        flash.current.position.set(e.p[0], e.p[1] + 1, e.p[2]);
        flashT.current = 0.5;
      }
    }
    const dt = Math.min(delta, 0.1);
    sparks.forEach((s, k) => {
      const mesh = refs.current[k];
      if (!mesh) return;
      s.ttl -= dt;
      mesh.visible = s.ttl > 0;
      if (s.ttl <= 0) return;
      s.v.y -= 18 * dt;
      s.p.addScaledVector(s.v, dt);
      mesh.position.copy(s.p);
      mesh.scale.setScalar(0.5 + (s.ttl / s.life) * 0.8);
    });
    if (flash.current) {
      flashT.current = Math.max(0, flashT.current - dt);
      flash.current.visible = flashT.current > 0;
      flash.current.scale.setScalar(1 + (0.5 - flashT.current) * 12);
      (flash.current.material as THREE.MeshBasicMaterial).opacity = flashT.current * 1.6;
    }
  });
  return (
    <>
      {sparks.map((_, k) => (
        <mesh key={k} ref={(el) => { refs.current[k] = el; }} visible={false} material={SPARK_MATS.hit}>
          <boxGeometry args={[0.16, 0.16, 0.16]} />
        </mesh>
      ))}
      <mesh ref={flash} visible={false}>
        <sphereGeometry args={[0.6, 12, 8]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}

// A race: the world, the racers on the grid, the race stepped each frame once the countdown is done, and
// the chase camera (wider while boosting, shaken by a hit)
function RaceGame({ track, race0, biome, go, input, onFinish, onFrame }: { track: RaceTrack; race0: Race; biome: string; go: { current: boolean }; input: { current: RaceInput }; onFinish: (race: Race) => void; onFrame: (race: Race) => void }) {
  const raceRef = useRef<Race>(race0);
  const racerRefs = useRef<(THREE.Group | null)[]>([]);
  const shadowRefs = useRef<(THREE.Group | null)[]>([]);
  const flameRefs = useRef<(THREE.Mesh | null)[]>([]);
  const barRefs = useRef<(THREE.Group | null)[]>([]);
  const fillRefs = useRef<(THREE.Mesh | null)[]>([]);
  const chevron = useRef<THREE.Group>(null);
  const sparks = useRef<RaceEvent[]>([]);
  const shake = useRef(0);
  const [snap, setSnap] = useState<Race>(race0);
  const { camera } = useThree();
  const look = raceLook(biome);
  const chequer = useChequer();
  const cover = useMemo(() => raceScenery(biome).cover, [biome]);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);
  const party = race0.racers.findIndex((racer) => racer.party);
  useFrame((_, delta) => {
    let now = raceRef.current;
    if (go.current && !now.over) {
      // Up to half a second a frame (a slow device runs the race slower, never through anything: it steps at 1/60 s)
      now = stepRace(now, track, input.current, Math.min(delta, 0.5));
      raceRef.current = now;
      for (const e of now.events) {
        if (e.kind === "hit" || e.kind === "smash" || e.kind === "mine") sparks.current.push(e);
        if (e.by === now.racers[party].id && (e.kind === "hit" || e.kind === "mine" || e.kind === "land")) shake.current = Math.max(shake.current, Math.min(0.8, e.power * 0.02));
      }
      onFrame(now);
      if (now.over) onFinish(now);
    }
    now.racers.forEach((rc, i) => {
      const group = racerRefs.current[i];
      if (group) {
        group.position.set(rc.craft.p[0], rc.craft.p[1], rc.craft.p[2]);
        group.rotation.set(rc.bank, -rc.craft.yaw, rc.craft.pitch);
      }
      const shadow = shadowRefs.current[i];
      if (shadow) {
        const ground = groundAt(track, rc.craft.p[0], rc.craft.p[2]);
        shadow.position.set(rc.craft.p[0], ground + 0.12, rc.craft.p[2]);
        shadow.rotation.set(0, -rc.craft.yaw, 0);
        const fade = Math.max(0.1, 1 - (rc.craft.p[1] - ground) / 8);
        ((shadow.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.3 * fade;
      }
      const flame = flameRefs.current[i];
      if (flame) {
        flame.visible = rc.boosting;
        if (rc.boosting) flame.scale.set(1, 0.9 + Math.random() * 0.3, 1);
      }
      const bar = barRefs.current[i];
      if (bar) {
        bar.position.set(rc.craft.p[0], rc.craft.p[1] + 2.6, rc.craft.p[2]);
        bar.visible = !rc.wrecked && rc.finish === null;
        bar.quaternion.copy(camera.quaternion);
        const fill = fillRefs.current[i];
        const share = rc.hull / rc.hullMax;
        if (fill) {
          fill.scale.x = Math.max(0.001, share);
          fill.position.x = -0.8 * (1 - share);
          (fill.material as THREE.MeshBasicMaterial).color.set(share > 0.6 ? "#4ade80" : share > 0.3 ? "#facc15" : "#ef4444");
        }
      }
    });
    const mine = now.racers[party];
    // The chevron over the party's speeder, toward the next gate
    if (chevron.current) {
      const gate = track.gates[raceNextGate(now, mine)];
      chevron.current.position.set(mine.craft.p[0] + Math.cos(mine.craft.yaw) * 1.5, mine.craft.p[1] + 2.1, mine.craft.p[2] + Math.sin(mine.craft.yaw) * 1.5);
      chevron.current.rotation.set(0, -Math.atan2(gate.p[2] - mine.craft.p[2], gate.p[0] - mine.craft.p[0]), 0);
      chevron.current.visible = mine.finish === null && !mine.wrecked;
    }
    // Behind and over the party's speeder, looking well down the track; lifted over a rise behind it
    const dt = Math.min(delta, 0.25);
    const [cy, sy] = [Math.cos(mine.craft.yaw), Math.sin(mine.craft.yaw)];
    behind.set(mine.craft.p[0] - cy * 11, mine.craft.p[1] + 5.2, mine.craft.p[2] - sy * 11);
    ahead.set(mine.craft.p[0] + cy * 17, mine.craft.p[1] + 0.4, mine.craft.p[2] + sy * 17);
    camera.position.lerp(behind, Math.min(1, dt * 5));
    camera.lookAt(ahead);
    const floor = groundAt(track, camera.position.x, camera.position.z) + 1.4;
    if (camera.position.y < floor) camera.position.y = floor;
    if (shake.current > 0.01) {
      camera.position.x += (Math.random() - 0.5) * shake.current;
      camera.position.y += (Math.random() - 0.5) * shake.current;
      shake.current *= Math.exp(-7 * dt);
    }
    // Wider on a phone held upright, and wider again with speed and boost
    const cam = camera as THREE.PerspectiveCamera;
    const fov = (cam.aspect < 1 ? 74 : 60) + (mine.boosting ? 8 : 0) + Math.max(0, Math.min(20, Math.abs(mine.craft.speed) - 30)) * 0.15;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
  });
  // What is drawn from the race (wrecks, broken props, spent mines, the next gate) is read ten times a second
  useEffect(() => {
    const timer = setInterval(() => setSnap(raceRef.current), 100);
    return () => clearInterval(timer);
  }, []);
  const next = raceNextGate(snap, snap.racers[party]);
  return (
    <>
      <RaceSky look={look} />
      <fog attach="fog" args={[look.sky, 140, 760]} />
      <hemisphereLight args={[look.zenith, look.ground, 0.55]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[120, 220, 80]} intensity={1.1} />
      <RaceGround track={track} look={look} />
      <RaceRibbons track={track} look={look} />
      {track.gates.map((g, i) => <Gate key={i} gate={g} first={i === 0} lit={i === next} chequer={chequer} track={track} />)}
      {track.ramps.map((ramp, i) => <RampModel key={i} ramp={ramp} track={track} />)}
      <Hazards track={track} hazards={snap.hazards} />
      <RaceProps track={track} biome={biome} broken={snap.broken} cover={cover} />
      {race0.racers.map((racer, i) => (
        <group key={racer.id}>
          <group ref={(el) => { racerRefs.current[i] = el; if (el) el.rotation.order = "YZX"; }}>
            <RacerModel model={racer.model} kind={racer.kind} wrecked={snap.racers[i].wrecked} suit={SUITS[racer.id % SUITS.length]} flame={(el) => { flameRefs.current[i] = el; }} />
          </group>
          <group ref={(el) => { shadowRefs.current[i] = el; }}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[SPEEDER_BODY[racer.kind].half[0] * 0.95, SPEEDER_BODY[racer.kind].half[1] * 1.05 + 0.15, 1]}>
              <circleGeometry args={[1, 18]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.4} depthWrite={false} polygonOffset polygonOffsetFactor={-5} polygonOffsetUnits={-5} />
            </mesh>
          </group>
          {!racer.party && (
            <group ref={(el) => { barRefs.current[i] = el; }}>
              <mesh>
                <planeGeometry args={[1.7, 0.22]} />
                <meshBasicMaterial color="#111827" />
              </mesh>
              <mesh ref={(el) => { fillRefs.current[i] = el; }} position={[0, 0, 0.02]}>
                <planeGeometry args={[1.6, 0.14]} />
                <meshBasicMaterial color="#4ade80" />
              </mesh>
            </group>
          )}
        </group>
      ))}
      <group ref={chevron}>
        <mesh position={[0.5, 0, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} scale={[1, 1, 0.35]}>
          <coneGeometry args={[0.32, 0.95, 3]} />
          <meshBasicMaterial color="#ffd24a" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      </group>
      <Sparks queue={sparks} />
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

// The drag pad, and the buttons: throttle (boost, brake), in a race Boost on its meter, and in a dogfight
// fire. Each button holds its pointer, so that a thumb that slides a little off it does not let go.
function Controls({ input, onThrottle, onFire, onBoost, meter }: { input: { current: FlightInput }; onThrottle?: (value: -1 | 0 | 1) => void; onFire?: (down: boolean) => void; onBoost?: (down: boolean) => void; meter?: number }) {
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
  const hold = (set: (down: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      set(true);
    },
    onPointerUp: () => set(false),
    onPointerCancel: () => set(false),
    onLostPointerCapture: () => set(false),
  });
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
        {onFire && <button type="button" data-testid="flight-fire" className={button} {...hold(onFire)}>Fire</button>}
        {onBoost && (
          <button type="button" data-testid="flight-boost" className={button} style={{ background: `linear-gradient(to top, rgba(56,189,248,0.55) ${Math.round((meter ?? 0) * 100)}%, rgba(17,24,39,0.7) ${Math.round((meter ?? 0) * 100)}%)` }} {...hold(onBoost)}>Boost</button>
        )}
        {onThrottle && !onBoost && <button type="button" data-testid="flight-boost" className={button} {...hold((down) => onThrottle(down ? 1 : 0))}>Boost</button>}
        {onThrottle && <button type="button" data-testid="flight-brake" className={button} {...hold((down) => onThrottle(down ? -1 : 0))}>Brake</button>}
      </div>
    </>
  );
}

// The race's HUD: place, lap, gates, the clock, the hull and boost bars and the speed; the standings;
// the finish window once the winner is home; and what just happened to the party
const ordinal = (n: number) => `${n}${["st", "nd", "rd"][n - 1] ?? "th"}`;
const raceClock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
function Bar({ label, value, max, color, testid, lit }: { label: string; value: number; max: number; color: string; testid: string; lit?: boolean }) {
  const share = Math.max(0, Math.min(1, value / max));
  return (
    <div className="flex items-center gap-1.5" data-testid={testid} data-value={Math.round(max === 1 ? value * 100 : value)} data-max={max === 1 ? 100 : max}>
      <span className="w-9 text-[10px] uppercase tracking-wide text-sky-200/80">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-700/80" style={{ boxShadow: lit ? `0 0 6px ${color}` : "none" }}>
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
      </div>
    </div>
  );
}
function RaceHud({ race, toast }: { race: Race; toast: string }) {
  const me = race.racers.find((r) => r.party)!;
  const order = raceOrder(race);
  const place = order.indexOf(me) + 1;
  const hull = me.hull / me.hullMax;
  const passed = me.gates === 0 ? 0 : ((me.gates - 1) % race.gateCount) + (me.finish !== null ? race.gateCount : 0);
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 w-48 space-y-1 rounded bg-gray-900/75 px-2 py-1.5 text-xs text-sky-100" data-testid="race-hud">
        <div className="flex justify-between font-semibold">
          <span>{ordinal(place)} of {race.racers.length}</span>
          <span>Lap {raceLap(race, me)}/{race.laps}</span>
        </div>
        <div className="flex justify-between text-[11px] text-sky-200/80">
          <span>gate {Math.min(passed, race.gateCount)}/{race.gateCount}</span>
          <span>{Math.round(Math.abs(me.craft.speed) * 3.6)} km/h</span>
          <span>{raceClock(race.t)}</span>
        </div>
        <Bar label="Hull" value={me.hull} max={me.hullMax} color={hull > 0.6 ? "#4ade80" : hull > 0.3 ? "#facc15" : "#ef4444"} testid="race-hull" />
        <Bar label="Boost" value={me.boost} max={1} color="#38bdf8" testid="race-boost" lit={me.boosting} />
      </div>
      <div className="pointer-events-none absolute right-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-[11px] leading-4 text-sky-100" data-testid="race-standings">
        {order.map((r, i) => (
          <div key={r.id} className={r.party ? "font-semibold text-yellow-300" : r.wrecked ? "text-gray-500 line-through" : ""}>
            {i + 1}. {r.name}{r.finish !== null ? ` ${raceClock(r.finish)}` : ""}
          </div>
        ))}
      </div>
      {race.first !== null && me.finish === null && !me.wrecked && (
        <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded bg-red-900/70 px-2 py-0.5 text-xs text-red-100">The winner is home: {Math.max(0, Math.ceil(race.first + RACE.grace - race.t))} s to finish</div>
      )}
      {toast && <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded bg-gray-900/70 px-3 py-1 text-sm font-semibold text-yellow-200" data-testid="race-toast">{toast}</div>}
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
  const course = useMemo(() => (game.kind === "run" ? flightCourse(game.seed, game.mode, { count: game.count }) : null), [game]);
  const biome = game.kind === "race" ? game.biome ?? "temperate" : "temperate";
  const track = useMemo(() => (game.kind === "race" ? raceCourse(game.seed, raceScenery(biome)) : null), [game, biome]);
  const race0 = useMemo(() => (game.kind === "race" && track ? raceStart(track, game.seed, game.vehicle, RACE_RIVAL_MODELS) : null), [game, track]);
  const dogfight0 = useMemo(() => (game.kind === "dogfight" ? dogfightStart(game.seed) : null), [game]);
  const [count, setCount] = useState(5);
  const go = useRef(false);
  const input = useRef<RaceInput>({ steer: { x: 0, y: 0 }, throttle: 0, auto: (() => { try { return localStorage.getItem("sw5e.autopilot") === "1"; } catch { return false; } })() });
  const fire = useRef(false);
  const fightSim = useRef({ state: dogfight0 ?? dogfightStart(1), roll: createRandom((game.seed | 0) + 1).next, seen: 0, tracers: [] as { from: Vec3; to: Vec3; hit: boolean; by: string; ttl: number }[] });
  // The games write their latest snapshot here each frame; the HUD copies it ten times a second
  const latest = useRef<{ race?: Race; fight?: Dogfight; run?: { next: number; speed: number } }>({});
  const [hud, setHud] = useState<typeof latest.current>({});
  // What the race says of the party, shown for two seconds; the last lap is announced
  const toast = useRef({ text: "", until: 0, lap: 1 });
  const onRace = (race: Race) => {
    latest.current.race = race;
    // For test scripts, as the map's window.__map3d: the race as it stands
    (window as unknown as { __race?: Race }).__race = race;
    const me = race.racers.find((r) => r.party);
    if (!me) return;
    const said = race.said.filter((line) => line.startsWith("You "));
    const lap = raceLap(race, me);
    if (lap > toast.current.lap && lap === race.laps && me.finish === null) toast.current = { text: "Last lap!", until: race.t + 2.5, lap };
    else if (lap > toast.current.lap) toast.current.lap = lap;
    if (said.length) toast.current = { ...toast.current, text: said[said.length - 1], until: race.t + 2.2 };
  };
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
        {game.kind === "race" && track && race0 && (
          <Canvas camera={{ position: [0, 6, -12], fov: 62, near: 0.3, far: 2400 }} dpr={[1, 1.5]} onCreated={({ gl }) => gl.setClearColor(raceLook(biome).sky)}>
            <RaceGame track={track} race0={race0} biome={biome} go={go} input={input} onFinish={(race) => finish({ kind: "race", race })} onFrame={onRace} />
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
        {game.kind === "race" && hud.race && <RaceHud race={hud.race} toast={hud.race.t < toast.current.until ? toast.current.text : ""} />}
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
            onThrottle={(v) => (input.current.throttle = game.kind === "race" ? (v < 0 ? -1 : 0) : v)}
            onBoost={game.kind === "race" ? (down) => (input.current.boost = down) : undefined}
            meter={hud.race?.racers.find((r) => r.party)?.boost}
            onFire={game.kind === "dogfight" ? (down) => (fire.current = down) : undefined}
          />
        )}
        {finished && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center" data-testid="minigame-over">
            <p className="text-lg font-semibold text-yellow-300">{finished.kind === "race" ? "The race is over." : finished.kind === "dogfight" ? (finished.state.foes.length === 0 ? "The sky is clear." : finished.state.hull <= 0 ? "Your ship is shot down." : "The fight is over.") : "The run is over."}</p>
            {finished.kind === "race" && (
              <div className="text-sm text-sky-100" data-testid="race-result">
                <p className="mb-1">{raceResult(finished.race).note}{raceResult(finished.race).credits ? `: ${raceResult(finished.race).credits} cr` : ""}</p>
                {raceOrder(finished.race).map((r, i) => (
                  <p key={r.id} className={r.party ? "font-semibold text-yellow-300" : ""}>{i + 1}. {r.name} {r.finish !== null ? raceClock(r.finish) : r.wrecked ? "out" : "did not finish"}</p>
                ))}
              </div>
            )}
            <button type="button" className="rounded border border-sky-400 px-4 py-2 text-sm text-sky-100" onClick={() => onDone(finished)} data-testid="minigame-land">Land</button>
          </div>
        )}
      </div>
    </div>
  );
}
