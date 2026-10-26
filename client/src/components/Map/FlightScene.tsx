import { useEffect, useMemo, useRef, useState } from "react";
import { STICK } from "./interiors/stick";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  createRandom, flightCourse, flightStart, groundAt, inRing, raceCourse, raceDistance, raceLap, raceNextGate, raceOrder, raceResult, raceStart, stepFlight, stepRace, chaseStart, chaseResult,
  RACE, RACE_MODEL_SCALE, SPEEDER_BODY,
  type Craft, type FlightCourse, type FlightInput, type FlightMode, type Hazard, type Race, type RaceEvent, type RaceGate, type RaceInput, type RaceRamp, type RaceTrack, type SpeederKind, type Vec3,
} from "@shared/logic";
import { ShipModel, SpeederModel } from "./LocalMap";
import { Model, shade, type Kit } from "./models";
import { Scatter, raceScenery, useQuality, type Placed } from "./siteAssets";
import type { Dogfight } from "@shared/logic/dogfight";
import { dogfightPayout } from "@shared/logic/dogfightSim";
import { SCENARIOS, sortieNotes } from "@shared/logic/dogfight";
import { DogfightGame, type DogfightSpec } from "./dogfight/DogfightGame";

// The flying games, the speeder race and the pilot's route, each on a dedicated page (MinigamePage): a
// five-second countdown, then the run. The drag pad steers (yaw, and pitch where the craft can climb);
// Boost, Brake and Fire are the buttons (in a race Boost draws on its meter). The chase camera follows
// the party's craft.

const PAD = STICK.radius; // pixels from the pad's centre to its edge (the pad is the same size as the walking stick: interiors/stick.ts)
const RACE_RIVAL_MODELS = ["Landspeeder", "Speederbike", "Landspeeder", "Speederbike"];

export type Minigame =
  | { kind: "run"; title: string; seed: number; mode: FlightMode; count?: number; vehicle?: string; ship?: { size: string; role: string } }
  | { kind: "race"; title: string; seed: number; vehicle: string; biome?: string }
  // A chase on the road (shared/logic "On the road"): the race's course, one lap to safety, riders after the party
  | { kind: "chase"; title: string; seed: number; vehicle: string; biome?: string; riders: { name: string; model: string }[]; who: string }
  | ({ kind: "dogfight" } & DogfightSpec);

export type MinigameResult =
  | { kind: "run"; course: FlightCourse; collected: number; timeLeft: number }
  | { kind: "race"; race: Race }
  | { kind: "chase"; race: Race }
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
export const raceLook = (biome: string) => RACE_LOOKS[biome] ?? RACE_LOOKS.temperate;
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
  // Laid out again only when something more is broken (the race hands a new list every step)
  const gone = broken.length;
  const placed = useMemo(() => {
    const out = new Set(broken);
    return track.props.filter((p) => p.key !== "gate" && !out.has(p.id)).map((p): Placed => ({ key: p.key, x: p.p[0], y: p.p[2], h: p.p[1], rot: -p.yaw, scale: p.scale, v: p.v }));
  }, [track, gone]);
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
// The riders of a chase: a patrol's white armour, anyone else's black
const riderSuit = (who: string) => (/patrol|empire|first order|republic/i.test(who) ? "#e8e8e4" : "#2b2f36");

// A chase's blaster bolts: a short-lived streak from the shooter to where the bolt went, red the riders', blue the party's
const BOLT_COUNT = 24;
function Bolts({ queue, party }: { queue: { current: RaceEvent[] }; party: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const ttl = useRef<number[]>(Array(BOLT_COUNT).fill(0));
  const cursor = useRef(0);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    for (const e of queue.current.splice(0)) {
      if (!e.to) continue;
      const k = cursor.current++ % BOLT_COUNT;
      const mesh = refs.current[k];
      if (!mesh) continue;
      a.set(e.p[0], e.p[1], e.p[2]);
      b.set(e.to[0], e.to[1], e.to[2]);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.lookAt(b);
      mesh.scale.set(1, 1, Math.max(0.5, a.distanceTo(b)));
      (mesh.material as THREE.MeshBasicMaterial).color.set(e.by === party ? "#7fe0ff" : "#ff4a3a");
      ttl.current[k] = 0.16;
    }
    refs.current.forEach((mesh, k) => {
      if (!mesh) return;
      ttl.current[k] -= Math.min(delta, 0.1);
      mesh.visible = ttl.current[k] > 0;
    });
  });
  return (
    <>
      {Array.from({ length: BOLT_COUNT }, (_, k) => (
        <mesh key={k} ref={(el) => { refs.current[k] = el; }} visible={false}>
          <boxGeometry args={[0.12, 0.12, 1]} />
          <meshBasicMaterial color="#ff4a3a" toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
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
  const shots = useRef<RaceEvent[]>([]);
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
        if (e.kind === "shot") {
          shots.current.push(e);
          if (e.power && e.to) sparks.current.push({ ...e, kind: "hit", p: e.to, power: 8 });
          if (e.power && e.by !== now.racers[party].id) shake.current = Math.max(shake.current, 0.35);
        }
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
            <RacerModel model={racer.model} kind={racer.kind} wrecked={snap.racers[i].wrecked} suit={racer.hostile ? riderSuit(race0.chase?.who ?? "") : SUITS[racer.id % SUITS.length]} flame={(el) => { flameRefs.current[i] = el; }} />
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
      {race0.chase && <Bolts queue={shots} party={race0.racers[party].id} />}
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
  const button = "h-14 min-w-[5rem] rounded-full border border-sky-400/60 bg-gray-900/70 px-5 text-base font-semibold text-sky-100 select-none touch-none";
  return (
    <>
      <div
        ref={pad}
        data-testid="flight-pad"
        className="absolute bottom-4 left-4 touch-none rounded-full border-2 border-sky-400/60 bg-gray-900/50"
        style={{ width: STICK.size, height: STICK.size }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); steer(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) steer(e); }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="absolute rounded-full bg-sky-300/80" style={{ width: STICK.knob, height: STICK.knob, left: `calc(50% + ${knob.x * STICK.travel}px - ${STICK.knob / 2}px)`, top: `calc(50% + ${knob.y * STICK.travel}px - ${STICK.knob / 2}px)` }} />
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
// A chase's HUD: how far to safety (the gates of the one lap), the riders still after the party, the hull and boost
function ChaseHud({ race, toast }: { race: Race; toast: string }) {
  const me = race.racers.find((r) => r.party)!;
  const riders = race.racers.filter((r) => r.hostile);
  const hull = me.hull / me.hullMax;
  const passed = me.gates === 0 ? 0 : me.gates - 1;
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 w-52 space-y-1 rounded bg-gray-900/75 px-2 py-1.5 text-xs text-sky-100" data-testid="chase-hud">
        <div className="font-semibold text-red-300">{race.chase?.who ?? "Riders"} after you</div>
        <div className="flex justify-between text-[11px] text-sky-200/80">
          <span>safety: gate {Math.min(passed, race.gateCount)}/{race.gateCount}</span>
          <span>{Math.round(Math.abs(me.craft.speed) * 3.6)} km/h</span>
        </div>
        <Bar label="Hull" value={me.hull} max={me.hullMax} color={hull > 0.6 ? "#4ade80" : hull > 0.3 ? "#facc15" : "#ef4444"} testid="race-hull" />
        <Bar label="Boost" value={me.boost} max={1} color="#38bdf8" testid="race-boost" lit={me.boosting} />
        <div className="text-[11px]" data-testid="chase-riders">{riders.filter((r) => !r.wrecked).length} of {riders.length} riders still after you · Fire (Space) shoots ahead, or back at one behind</div>
      </div>
      {toast && <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded bg-gray-900/70 px-3 py-1 text-sm font-semibold text-yellow-200" data-testid="race-toast">{toast}</div>}
    </>
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

// What a dogfight's end screen says, and what the briefing tells the pilot before it begins
const dogfightHeadline = (s: Dogfight) =>
  s.outcome === "station" ? "The station is destroyed!" :
  s.outcome === "clear" && !s.air ? "The sky is clear." :
  s.outcome === "shot-down" ? "Your ship is shot down." :
  s.outcome === "lost-in-station" ? "The reactor takes you with it." :
  s.outcome === "fled" ? "You broke off the fight." :
  s.outcome === "failed" ? `The fight is lost: ${s.air?.why ?? "the goal was not met"}.` :
  s.outcome === "clear" && s.air ? (s.air.goal === "defend" ? "The raid is beaten off." : s.air.goal === "raid" ? "The targets are destroyed." : s.air.goal === "escort" ? "The convoy is through." : "The convoy is destroyed.") : "Time is up: the fight is over.";
const briefing = (g: Extract<Minigame, { kind: "dogfight" }>) => [
  scenarioIntro(g),
  ...sortieNotes(g.ship.sheet, g.scenario),
  "Mouse (V): it turns the nose, left click fires the active weapon, right click (E) switches weapon · A and D roll · W and S, or the wheel, set the throttle (it holds) · C: cockpit view",
  "Pad turns the nose · Fire guns · Missile and Bomb are limited · Target (T) locks the next foe, Part (Y) the next turret, generator or bay of it",
];
const scenarioIntro = (g: Extract<Minigame, { kind: "dogfight" }>) => SCENARIOS.find((x) => x.id === g.scenario)?.intro ?? "";

// The dedicated page of a minigame: a five-second countdown, then the game. Calls onDone with how it ended.
export function MinigamePage({ game, onDone, onExit }: { game: Minigame; onDone: (result: MinigameResult) => void; onExit: () => void }) {
  const course = useMemo(() => (game.kind === "run" ? flightCourse(game.seed, game.mode, { count: game.count }) : null), [game]);
  const biome = game.kind === "race" || game.kind === "chase" ? game.biome ?? "temperate" : "temperate";
  const track = useMemo(() => (game.kind === "race" ? raceCourse(game.seed, raceScenery(biome)) : game.kind === "chase" ? raceCourse(game.seed, raceScenery(biome), 1) : null), [game, biome]);
  const race0 = useMemo(() => (game.kind === "race" && track ? raceStart(track, game.seed, game.vehicle, RACE_RIVAL_MODELS) : game.kind === "chase" && track ? chaseStart(track, game.seed, game.vehicle, game.riders, game.who) : null), [game, track]);
  const driven = game.kind === "race" || game.kind === "chase";
  const [count, setCount] = useState(5);
  const go = useRef(false);
  // The page, which the dogfight's fullscreen button takes fullscreen (the countdown and the end screen are in it)
  const page = useRef<HTMLDivElement>(null);
  const input = useRef<RaceInput>({ steer: { x: 0, y: 0 }, throttle: 0, auto: (() => { try { return localStorage.getItem("sw5e.autopilot") === "1"; } catch { return false; } })() });
  // The games write their latest snapshot here each frame; the HUD copies it ten times a second
  const latest = useRef<{ race?: Race; run?: { next: number; speed: number } }>({});
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
  // Keyboard, for a race: W speeds up, S slows down, A and D turn left and right, Right Shift boosts. Each key writes only
  // its own control, so the drag pad's steering and the buttons still work alongside it.
  useEffect(() => {
    if (!driven) return;
    const held = new Set<string>();
    const press = (e: KeyboardEvent, on: boolean) => {
      if (!["KeyW", "KeyS", "KeyA", "KeyD", "ShiftRight", "Space"].includes(e.code)) return;
      if (e.code === "Space") {
        e.preventDefault();
        input.current.fire = on;
        return;
      }
      if (on) held.add(e.code);
      else held.delete(e.code);
      const c = input.current;
      if (e.code === "KeyW" || e.code === "KeyS") c.throttle = held.has("KeyW") ? 1 : held.has("KeyS") ? -1 : 0;
      if (e.code === "KeyA" || e.code === "KeyD") c.steer = { ...c.steer, x: (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0) };
      if (e.code === "ShiftRight") c.boost = on;
    };
    const keyDown = (e: KeyboardEvent) => press(e, true);
    const keyUp = (e: KeyboardEvent) => press(e, false);
    const lostFocus = () => {
      held.clear();
      input.current.steer = { ...input.current.steer, x: 0 };
      input.current.throttle = 0;
      input.current.boost = false;
      input.current.fire = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", lostFocus);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", lostFocus);
    };
  }, [game.kind]);
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
    <div ref={page} className="fixed inset-0 z-[70] flex flex-col bg-black" data-testid="minigame-page">
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
        {driven && track && race0 && (
          <Canvas camera={{ position: [0, 6, -12], fov: 62, near: 0.3, far: 2400 }} dpr={[1, 1.5]} onCreated={({ gl }) => gl.setClearColor(raceLook(biome).sky)}>
            <RaceGame track={track} race0={race0} biome={biome} go={go} input={input} onFinish={(race) => finish(game.kind === "chase" ? { kind: "chase", race } : { kind: "race", race })} onFrame={onRace} />
          </Canvas>
        )}
        {game.kind === "dogfight" && <DogfightGame spec={game} go={go} controls={!counting && !finished} shell={page} onFinish={(state) => finish({ kind: "dogfight", state })} />}
        {game.kind === "race" && hud.race && <RaceHud race={hud.race} toast={hud.race.t < toast.current.until ? toast.current.text : ""} />}
        {game.kind === "chase" && hud.race && <ChaseHud race={hud.race} toast={hud.race.t < toast.current.until ? toast.current.text : ""} />}
        {game.kind === "run" && hud.run && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-xs text-sky-100" data-testid="flight-hud">
            {title} · rings {hud.run.next} of {course?.rings.length ?? 0} · {hud.run.speed} {game.mode === "ship" ? "km/s" : "m/s"}
          </div>
        )}
        {counting && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/50" data-testid="countdown">
            <span className="text-8xl font-bold text-yellow-300">{headline}</span>
            {game.kind === "dogfight" && (
              <div className="max-w-md space-y-1 px-4 text-center text-sm text-sky-100" data-testid="dogfight-briefing">
                {briefing(game).map((l, i) => <p key={i}>{l}</p>)}
              </div>
            )}
          </div>
        )}
        {!counting && !finished && game.kind !== "dogfight" && (
          <Controls
            input={input}
            onThrottle={(v) => (input.current.throttle = driven ? (v < 0 ? -1 : 0) : v)}
            onBoost={driven ? (down) => (input.current.boost = down) : undefined}
            onFire={game.kind === "chase" ? (down) => (input.current.fire = down) : undefined}
            meter={hud.race?.racers.find((r) => r.party)?.boost}
          />
        )}
        {finished && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center" data-testid="minigame-over">
            <p className="text-lg font-semibold text-yellow-300">{finished.kind === "race" ? "The race is over." : finished.kind === "chase" ? (chaseResult(finished.race).outcome === "caught" ? "They have caught you." : "You are clear of them.") : finished.kind === "dogfight" ? dogfightHeadline(finished.state) : "The run is over."}</p>
            {finished.kind === "chase" && <p className="max-w-md text-sm text-sky-100" data-testid="chase-result">{chaseResult(finished.race).note}</p>}
            {finished.kind === "dogfight" && <p className="max-w-md text-sm text-sky-100" data-testid="dogfight-result">{dogfightPayout(finished.state).note}: {dogfightPayout(finished.state).credits} cr</p>}
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
