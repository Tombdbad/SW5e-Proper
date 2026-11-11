import { useEffect, useMemo, useRef, useState } from "react";
import { STICK } from "./interiors/stick";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { babylonGl } from "@/components/Map/babylon";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  createRandom, flightCourse, flightStart, groundAt, inRing, raceCourse, convoyStart, convoyResult, raceDistance, raceLap, raceNextGate, raceOrder, raceResult, raceStart, raceWater, skyLook, stepFlight, stepRace, chaseStart, chaseResult, roadStart, roadAt, settleBlock,
  CROSSING, RACE, RACE_MODEL_SCALE, SPEEDER_BODY, terrainSurface,
  type Craft, type FlightCourse, type FlightInput, type FlightMode, type Hazard, type Race, type RaceEvent, type RaceGate, type RaceInput, type Racer, type RaceTrack, type SpeederKind, type Vec3,
} from "@shared/logic";
import { ShipModel, SpeederModel } from "./LocalMap";
import { Model, shade, type Kit, type CrewMember, type GunAim } from "./models";
import { Scatter, Sea, groundTexture, raceScenery, useQuality, type Placed } from "./siteAssets";
import { useGroundMaterial } from "./terrain";
import { WorldSky } from "./scenery";
import { settleStop, type Block, type StopChoice } from "@shared/logic/roadtrip";
import type { Dogfight } from "@shared/logic/dogfight";
import { dogfightPayout } from "@shared/logic/dogfightSim";
import { SCENARIOS, sortieNotes } from "@shared/logic/dogfight";
import { DogfightGame, type DogfightSpec } from "./dogfight/DogfightGame";
import { roadBus } from "@/lib/roadBus";

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
  // A leg of a road trip (shared/logic/roadtrip.ts): open road to its last gate, in the ground of its own biome; `intro` is what the countdown says,
  // `hull` what the party carries from the legs before, `mate` its crewmate (who drives while the party is at the gun), `block` a roadblock across it
  // (and what the party can say to it: the bonuses of Persuasion and Deception), `riders` the riders after the party
  // (`water`: a water craft's leg over open water, shared/logic "Over the water"; `look`: its make's model, `seats` how many it seats, `crew` the
  // companions riding in it, the crewmate first)
  | { kind: "road"; title: string; seed: number; vehicle: string; biome: string; leg: { i: number; n: number }; intro: string[]; hull?: number; mate?: { name: string; pace: number }; block?: Block; riders?: { name: string; model: string }[]; who?: string; talk: { persuasion: number; deception: number }; credits: number; water?: boolean; look?: string; seats?: number; crew?: CrewMember[] }
  // The convoy (shared/logic "The convoy"): the party's craft rides at the back of a column of haulers (`hauler` their class, `haulerLook` their make)
  // down a road in the ground of `biome`, raiders of `who` coming at it in waves, fighters of `ally` over it; the party drives or takes the gun
  | { kind: "convoy"; title: string; seed: number; vehicle: string; biome: string; look?: string; seats?: number; crew?: CrewMember[]; mate?: { name: string; pace: number }; haulers: number; hauler: string; haulerLook?: string; level: number; who: string; ally: string; intro: string[] }
  | ({ kind: "dogfight" } & DogfightSpec);

export type MinigameResult =
  | { kind: "road"; race: Race; metres: number; stop?: { outcome: "open" | "run"; paid: number; note: string } }
  | { kind: "run"; course: FlightCourse; collected: number; timeLeft: number }
  | { kind: "race"; race: Race }
  | { kind: "chase"; race: Race }
  | { kind: "convoy"; race: Race }
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

// A speeder, drawn nose along the craft's heading, with who is aboard in its seats and its guns turned to their aims (models.tsx craftLayout)
function Speeder({ model, wrecked, look, seats, crew, aims, gunner }: { model: string; wrecked?: boolean; look?: string; seats?: number; crew?: (CrewMember | undefined)[]; aims?: { current: GunAim[] }; gunner?: boolean }) {
  return <group rotation={[0, Math.PI / 2, 0]}><SpeederModel model={model} wrecked={wrecked} look={look} seats={seats} crew={crew} aims={aims} gunner={gunner} /></group>;
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


// The ground: one mesh over the course and well past it (the fog hides its edge), made of 128 m squares, fine (a few metres a vertex) near the course
// and coarse far from it, so that a gorge's cliffs and a jump's bluff are cut cleanly where the speeders are and the hills beyond are cheap; the squares
// are drawn with skirts so that no crack shows where the fine meet the coarse. It is the land (shared/logic/terrain.ts under `groundAt`: ramps, gorges and
// rivers included) coloured by its slope and where the water went: rock on the cliffs, wet mud by a river, and the way itself not a marked ribbon but
// a worn, feathered band of the course's own dust (2026-11-10, the user: a less defined road), its edge lost in the verge
function RaceGround({ track, look }: { track: RaceTrack; look: RaceLook }) {
  const lite = useQuality((q) => q.tier === "lite");
  // The layers of the ground (terrain.tsx useGroundMaterial): the hue is the vertex colour below, the photographs lend their pattern and relief
  const material = useGroundMaterial(track.land?.biome ?? "temperate", groundTexture(track.land?.biome ?? "temperate", "", look.ground)?.set ?? "dirt_floor", true);
  const geo = useMemo(() => {
    const half = track.extent + 220;
    const CH = 128;
    const count = Math.ceil((half * 2) / CH);
    const [nearSegs, farSegs] = lite ? [20, 8] : [40, 12];
    const [a, b, verge] = [new THREE.Color(look.ground), new THREE.Color(look.ground2), new THREE.Color(look.track)];
    const [mud, scorched] = [new THREE.Color("#4d4234"), new THREE.Color("#1e1512")];
    const c = new THREE.Color();
    const pos: number[] = [];
    const col: number[] = [];
    const splat: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const land = track.land;
    const w2 = track.width / 2;
    for (let cj = 0; cj < count; cj++) {
      for (let ci = 0; ci < count; ci++) {
        const [ox, oz] = [-half + ci * CH, -half + cj * CH];
        const segs = raceDistance(track, ox + CH / 2, oz + CH / 2) < 150 + CH * 0.72 ? nearSegs : farSegs;
        const step = CH / segs;
        // The heights with a vertex of border, for the normals and the slope
        const side = segs + 3;
        const hs = new Float32Array(side * side);
        for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) hs[j * side + i] = groundAt(track, ox + (i - 1) * step, oz + (j - 1) * step, true);
        const base = pos.length / 3;
        const row = segs + 1;
        for (let j = 0; j <= segs; j++) {
          for (let i = 0; i <= segs; i++) {
            const [x, z] = [ox + i * step, oz + j * step];
            const at = (j + 1) * side + i + 1;
            const y = hs[at];
            const [dx, dz] = [(hs[at + 1] - hs[at - 1]) / (2 * step), (hs[at + side] - hs[at - side]) / (2 * step)];
            const nl = Math.hypot(dx, 1, dz);
            pos.push(x, y, z);
            nor.push(-dx / nl, 1 / nl, -dz / nl);
            const slope = Math.hypot(dx, dz);
            let sp = [0, 0, 0];
            if (land) {
              const around = (hs[at + 1] + hs[at - 1] + hs[at + side] + hs[at - side]) / 4;
              const surf = terrainSurface(land, x, z, { alt: (y - land.min) / Math.max(1, land.max - land.min), slope, curve: (around - y) / step });
              c.setRGB(surf.color[0], surf.color[1], surf.color[2]);
              c.lerp(a, 0.25);
              sp = [surf.rock, surf.pale, surf.wet];
            } else c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(x * 0.045 + Math.cos(z * 0.031) * 2) * Math.cos(z * 0.052 - x * 0.013));
            // The way: the dust of the course, worn most in the middle and gone into the verge past the edge, broken up a little
            const d = raceDistance(track, x, z);
            const worn = (1 - Math.min(1, Math.max(0, (d - w2 * 0.35) / (w2 * 0.65 + 10)))) * (0.5 + 0.2 * Math.sin(x * 0.31 + z * 0.17) * Math.cos(z * 0.23 - x * 0.11)) * (1 - Math.min(1, slope * 1.4));
            if (worn > 0) c.lerp(verge, Math.min(0.7, worn));
            c.multiplyScalar(0.94 + Math.max(-0.08, Math.min(0.12, y * 0.004)));
            // A river's banks are wet mud; a lava flow's are scorched black
            const water = track.rivers?.length ? raceWater(track, x, z) : null;
            if (water) c.lerp(water.lava ? scorched : mud, water.inside ? 0.9 : 0.6);
            col.push(c.r, c.g, c.b);
            // (a river's bank is mud, the way itself soil: the layers' weights, with the water's wet laid over)
            splat.push(sp[0], sp[1], Math.max(sp[2], water ? (water.inside ? 0.9 : 0.6) * (water.lava ? 0 : 1) : 0), 0);
          }
        }
        for (let j = 0; j < segs; j++) {
          for (let i = 0; i < segs; i++) {
            const v = base + j * row + i;
            idx.push(v, v + row, v + 1, v + 1, v + row, v + row + 1);
          }
        }
        // Skirts: the square's four edges let down a few metres (the next square may be coarser, and its edge not quite on this one's)
        const edge: number[][] = [[], [], [], []];
        for (let k = 0; k <= segs; k++) {
          edge[0].push(base + k);
          edge[1].push(base + segs * row + k);
          edge[2].push(base + k * row);
          edge[3].push(base + k * row + segs);
        }
        for (const list of edge) {
          const down = pos.length / 3;
          for (const v of list) {
            pos.push(pos[v * 3], pos[v * 3 + 1] - 4, pos[v * 3 + 2]);
            nor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
            col.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
            splat.push(splat[v * 4], splat[v * 4 + 1], splat[v * 4 + 2], splat[v * 4 + 3]);
          }
          for (let k = 0; k < list.length - 1; k++) idx.push(list[k], down + k, list[k + 1], list[k + 1], down + k, down + k + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("splat", new THREE.Float32BufferAttribute(splat, 4));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    return g;
  }, [track, look, lite]);
  return <mesh geometry={geo} material={material} raycast={() => null} frustumCulled={false} />;
}

// A flowing texture for a river or lava: streaks along it (water) or glowing cracks in a crust (lava), scrolled along the flow
const FLOWS = new Map<string, THREE.Texture>();
function flowTexture(lava: boolean): THREE.Texture {
  const key = lava ? "lava" : "water";
  const have = FLOWS.get(key);
  if (have) return have;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = lava ? "#ff5a14" : "#2f6f9e";
  g.fillRect(0, 0, 128, 128);
  const r = createRandom(lava ? 3 : 5);
  for (let i = 0; i < (lava ? 34 : 60); i++) {
    const [x, y] = [r.next() * 128, r.next() * 128];
    if (lava) {
      // Dark crust plates between the glowing cracks
      g.fillStyle = `rgba(${40 + r.next() * 30},${18 + r.next() * 12},12,0.85)`;
      g.beginPath();
      g.ellipse(x, y, 6 + r.next() * 14, 4 + r.next() * 9, r.next() * 3, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = `rgba(220,240,255,${0.08 + r.next() * 0.18})`;
      g.fillRect(x, y, 10 + r.next() * 30, 1 + r.next() * 1.5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  FLOWS.set(key, t);
  return t;
}
// The rivers and flows of lava across a course (shared/logic "Skies and landforms"), and the bridges that carry the track and the trails
// over them: a deck under the way with piers down into the channel (the rails along the deck are struck pieces, drawn with the props)
function RaceRivers({ track }: { track: RaceTrack }) {
  const strips = useMemo(
    () =>
      (track.rivers ?? []).map((rv) => {
        const bound = track.extent + 220;
        const line = rv.line.filter(([x, z]) => Math.abs(x) < bound && Math.abs(z) < bound);
        const pos: number[] = [];
        const uv: number[] = [];
        const idx: number[] = [];
        let along = 0;
        line.forEach(([x, z], i) => {
          const [p, q] = [line[Math.max(0, i - 1)], line[Math.min(line.length - 1, i + 1)]];
          const yaw = Math.atan2(q[1] - p[1], q[0] - p[0]);
          const [nx, nz] = [-Math.sin(yaw), Math.cos(yaw)];
          if (i) along += Math.hypot(x - line[i - 1][0], z - line[i - 1][1]);
          const level = (raceWater(track, x, z)?.level ?? groundAt(track, x, z, false)) + 0.06;
          const w = rv.half + rv.bank * 0.55;
          pos.push(x - nx * w, level, z - nz * w, x + nx * w, level, z + nz * w);
          uv.push(along / 40, 0, along / 40, 1);
          if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return { g, lava: rv.lava };
      }),
    [track],
  );
  // The bridges: a slab under the deck between each pair of the way's points, piers under its edges
  const spans = useMemo(
    () =>
      (track.bridges ?? []).flatMap((b) =>
        b.points.slice(1).map((q, k) => {
          const p = b.points[k];
          const [mx, mz] = [(p[0] + q[0]) / 2, (p[2] + q[2]) / 2];
          const top = groundAt(track, mx, mz, false);
          const yaw = Math.atan2(q[2] - p[2], q[0] - p[0]);
          const level = raceWater(track, mx, mz)?.level ?? top - CROSSING.riverDrop;
          return { at: [mx, top - 0.55, mz] as Vec3, len: Math.hypot(q[0] - p[0], q[2] - p[2]) + 0.3, wide: b.width + CROSSING.deck * 2, yaw, drop: top - level + 2, lava: b.lava, pier: k % 2 === 1 };
        }),
      ),
    [track],
  );
  const mats = useMemo(() => ({ water: flowTexture(false).clone(), lava: flowTexture(true).clone() }), []);
  useEffect(() => {
    for (const t of [mats.water, mats.lava]) t.needsUpdate = true;
  }, [mats]);
  useFrame((_, dt) => {
    mats.water.offset.x -= dt * 0.12;
    mats.lava.offset.x -= dt * 0.03;
  });
  return (
    <>
      {strips.map((s, i) =>
        s.lava ? (
          <mesh key={i} geometry={s.g} raycast={() => null}>
            <meshBasicMaterial map={mats.lava} toneMapped={false} />
          </mesh>
        ) : (
          <mesh key={i} geometry={s.g} raycast={() => null}>
            <meshStandardMaterial map={mats.water} roughness={0.15} metalness={0.25} transparent opacity={0.88} />
          </mesh>
        ),
      )}
      {spans.map((s, i) => (
        <group key={i} position={s.at} rotation={[0, -s.yaw, 0]}>
          <mesh>
            <boxGeometry args={[s.len, 1.0, s.wide]} />
            <meshLambertMaterial color={s.lava ? "#3a3f46" : "#8a8070"} />
          </mesh>
          {s.pier &&
            [-1, 1].map((side) => (
              <mesh key={side} position={[0, -s.drop / 2, side * (s.wide / 2 - 1)]}>
                <cylinderGeometry args={[0.8, 1.1, s.drop, 10]} />
                <meshLambertMaterial color={s.lava ? "#2b2f36" : "#7a7266"} />
              </mesh>
            ))}
        </group>
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
      if (track.rivers?.length && raceWater(track, x, z)) continue;
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
      (mesh.material as THREE.MeshBasicMaterial).color.set((e.side ? e.side === "us" : e.by === party) ? "#7fe0ff" : "#ff4a3a");
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
// The ships over a convoy (shared/logic "The convoy"): the raiders in their side's look with a red mark over each, so that they are seen far
// off, and the convoy's own fighters; each where the race has it, nose along its heading
function Flyers({ race, snap }: { race: { current: Race }; snap: Race }) {
  const refs = useRef(new Map<number, THREE.Group>());
  useFrame(() => {
    for (const f of race.current.convoy?.flyers ?? []) {
      const g = refs.current.get(f.id);
      if (!g) continue;
      g.visible = !f.wrecked;
      g.position.set(f.p[0], f.p[1], f.p[2]);
      g.rotation.set(0, -f.yaw, f.pitch);
    }
  });
  const air = snap.convoy;
  return (
    <>
      {(air?.flyers ?? []).map((f) => (
        <group key={f.id} ref={(el) => { if (el) { el.rotation.order = "YZX"; refs.current.set(f.id, el); } else refs.current.delete(f.id); }} visible={false}>
          <group scale={f.kind === "bomber" ? 3 : 2}>
            <group position={[-3, 0, -2]}><ShipModel ship={{ size: f.kind === "bomber" ? "Small" : "Tiny", role: f.kind, status: "flying", owner: f.side === "raider" ? air!.who : air!.ally }} w={6} h={4} /></group>
          </group>
          {f.side === "raider" && (
            <mesh position={[0, f.kind === "bomber" ? 9 : 7, 0]}>
              <octahedronGeometry args={[1.5]} />
              <meshBasicMaterial color="#ff4a3a" />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

// Who rides a racer (2026-10-30: real people in the seats, craftLayout): a rival in a flight suit, a patrol's scout trooper, a gang's rider
const riderOf = (racer: Racer, who: string): CrewMember => (racer.hostile || racer.idle ? (/patrol|empire|first order|republic/i.test(who) ? { kind: "trooper", name: "Scout trooper", role: "scout trooper" } : { kind: "person", name: racer.name, role: "mercenary" }) : { kind: "person", name: racer.name, role: "pilot" });
// A guard at a roadblock, on his feet with a blaster (a patrol's white armour, anyone else's black): model units of a person, facing +x
function buildGuard(k: Kit, suit: string) {
  const helmet = shade(suit, 1.25);
  k.pair((s) => k.rod([0, 0.05, s * 0.09], [0, 0.55, s * 0.09], 0.065, shade(suit, 0.75), { seg: 6 }));
  k.rod([0, 0.55, 0], [0, 1.1, 0], 0.17, suit, { seg: 8 });
  k.sphere(0.13, helmet, { at: [0, 1.28, 0], seg: [10, 8], finish: "sheen" });
  k.box([0.08, 0.06, 0.17], "#1b2a38", { at: [0.1, 1.29, 0], round: 0.03, finish: "glass" });
  k.rod([0, 1.0, 0.18], [0.3, 0.95, 0.12], 0.045, suit, { seg: 6 });
  k.rod([0, 1.0, -0.18], [0.34, 0.98, -0.02], 0.045, suit, { seg: 6 });
  k.box([0.6, 0.07, 0.07], "#2f343b", { at: [0.42, 0.97, 0.03], round: 0.02 });
}
// The guards of a roadblock where they stand (those gone to their speeders are not there)
function Guards({ track, guards, who }: { track: RaceTrack; guards?: { gone: boolean }[]; who: string }) {
  const site = track.road?.block;
  if (!site) return null;
  const suit = riderSuit(who);
  return (
    <>
      {site.guards.map((g, i) => !guards?.[i]?.gone && (
        <group key={i} position={[g.x, groundAt(track, g.x, g.z), g.z]} rotation={[0, -g.yaw, 0]}>
          <Model id={`race:guard:${suit}`} build={(k) => buildGuard(k, suit)} scale={1.25} />
        </group>
      ))}
    </>
  );
}

// A racer: its model and who is aboard (the box's middle is the racer's place, the model's origin behind or ahead of it), its gun turned
// to its aim, and the flame of its engines while it boosts. `gunner`: a gun is lent to it for a gunner
function RacerModel({ model, look, kind, wrecked, flame, crew, aims, seats, gunner, empty }: { model: string; look?: string; kind: SpeederKind; wrecked: boolean; flame: (el: THREE.Mesh | null) => void; crew?: (CrewMember | undefined)[]; aims?: { current: GunAim[] }; seats?: number; gunner?: boolean; empty?: boolean }) {
  const body = SPEEDER_BODY[kind];
  return (
    <>
      <group position={[-body.ahead, 0, 0]} scale={RACE_MODEL_SCALE}>
        <Speeder model={model} look={look} wrecked={wrecked} seats={seats} crew={empty ? undefined : crew} aims={aims} gunner={gunner} />
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
// `crew`: who is in the party's craft, by seat (the pilot first; the gunner's seat second when `gunner` lends it a gun); `seats` how many it seats
// (`haulerLook`: the make of a convoy's haulers)
function RaceGame({ track, race0, biome, look: partyLook, go, input, onFinish, onFrame, pause, act, onStop, gunner, remote, crew, seats, haulerLook }: { track: RaceTrack; race0: Race; biome: string; look?: string; go: { current: boolean }; input: { current: RaceInput }; onFinish: (race: Race) => void; onFrame: (race: Race) => void; pause?: { current: boolean }; act?: { current: ((how: "open" | "run") => void) | null }; onStop?: (race: Race) => void; gunner?: boolean; remote?: boolean; crew?: (CrewMember | undefined)[]; seats?: number; haulerLook?: string }) {
  const raceRef = useRef<Race>(race0);
  // Each racer's guns' aims, as the race says (the party's from the pad), for its turrets and gunners to follow
  const aimRefs = useMemo(() => race0.racers.map(() => ({ current: [{ yaw: 0, pitch: 0 }] as GunAim[] })), [race0]);
  // (a convoy's hauler: its driver, and its gunner at its turret)
  const rideCrew = useMemo(() => race0.racers.map((racer): CrewMember[] => (racer.party ? (crew ?? [{ kind: "player", player: true }]) as CrewMember[] : racer.cargo ? [{ kind: "person", name: racer.name, role: "pilot" }, { kind: "person", name: `${racer.name} gunner`, role: "mercenary" }] : [riderOf(racer, race0.chase?.who ?? race0.block?.who ?? "")])), [race0, crew]);
  const lastSnap = useRef<unknown>(null);
  const doneRef = useRef(false);
  // The page's say at a roadblock (the barrier opened, or run at) is done to the race that is running
  useEffect(() => {
    if (act) act.current = (how) => { raceRef.current = settleBlock(raceRef.current, track, how); };
    return () => { if (act) act.current = null; };
  }, [track]);
  const aimRef = useRef<THREE.Group>(null);
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
  // The world's sky and horizon over the course (scenery.tsx), by day
  const sky = useMemo(() => skyLook(biome, track.seed), [biome, track.seed]);
  const lite = useQuality((q) => q.tier === "lite");
  const chequer = useChequer();
  const cover = useMemo(() => raceScenery(biome, !!track.sea).cover, [biome, track]);
  // Over open water the party's craft is its make, and those after it ride hydrospeeders (a bike's body) or bongos
  const lookOf = (racer: Racer) => (racer.party ? partyLook : racer.cargo ? haulerLook : track.sea ? (racer.kind === "bike" ? "hydro" : "bongo") : undefined);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);
  const party = race0.racers.findIndex((racer) => racer.party);
  useFrame((_, delta) => {
    let now = raceRef.current;
    // For test scripts: window.__raceTrack is the course, and window.__raceWarp = s puts the party's speeder on the track s metres round the
    // lap (to look at a bridge, the gorge or a hill), at rest
    const hook = window as unknown as { __raceTrack?: RaceTrack; __raceWarp?: number };
    hook.__raceTrack = track;
    if (hook.__raceWarp !== undefined) {
      const i = Math.round(hook.__raceWarp / track.step) % track.points.length;
      const p = track.points[i];
      delete hook.__raceWarp;
      // (with the gates before it counted as passed, so that it is not towed back to them)
      const gates = track.gates.filter((g) => g.s <= i * track.step).length;
      now = { ...now, racers: now.racers.map((r) => (r.party ? { ...r, craft: { ...r.craft, p: [p[0], groundAt(track, p[0], p[2]) + RACE.hover, p[2]], yaw: track.yaws[i], speed: 0 }, v: [0, 0, 0], gates, at: i, home: i } : r)) };
      raceRef.current = now;
    }
    const absorb = (events: RaceEvent[], at: Race) => {
      for (const e of events) {
        if (e.kind === "hit" || e.kind === "smash" || e.kind === "mine") sparks.current.push(e);
        if (e.kind === "shot") {
          shots.current.push(e);
          if (e.power && e.to) sparks.current.push({ ...e, kind: "hit", p: e.to, power: 8 });
          if (e.power && e.by !== at.racers[party].id) shake.current = Math.max(shake.current, 0.35);
        }
        if (e.by === at.racers[party].id && (e.kind === "hit" || e.kind === "mine" || e.kind === "land")) shake.current = Math.max(shake.current, Math.min(0.8, e.power * 0.02));
      }
    };
    if (remote) {
      // A crew member's screen: the pilot's race as streamed, carried on a little between snapshots by each craft's own speed
      const snapped = roadBus.snap;
      if (snapped) {
        if (snapped !== lastSnap.current) {
          lastSnap.current = snapped;
          absorb(snapped.events, snapped.race);
        }
        const ahead = Math.min(0.3, (performance.now() - snapped.at) / 1000);
        now = ahead < 0.01 || snapped.race.over ? snapped.race : { ...snapped.race, racers: snapped.race.racers.map((rc) => (rc.wrecked || rc.finish !== null ? rc : { ...rc, craft: { ...rc.craft, p: [rc.craft.p[0] + rc.v[0] * ahead, rc.craft.p[1], rc.craft.p[2] + rc.v[2] * ahead] as Vec3 } })) };
        raceRef.current = now;
        onFrame(now);
        if (snapped.race.over && !doneRef.current) {
          doneRef.current = true;
          onFinish(snapped.race);
        }
      }
    } else if (go.current && !now.over && !pause?.current) {
      // Up to half a second a frame (a slow device runs the race slower, never through anything: it steps at 1/60 s)
      now = stepRace(now, track, input.current, Math.min(delta, 0.5));
      raceRef.current = now;
      // Stopped at a roadblock: the race waits for the page's answer
      if (now.block?.state === "stopped" && pause) {
        pause.current = true;
        onStop?.(now);
      }
      absorb(now.events, now);
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
        bar.visible = !rc.wrecked && rc.finish === null && !rc.idle;
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
    now.racers.forEach((rc, i) => {
      const aim = aimRefs[i]?.current[0];
      if (!aim) return;
      const g = rc.party && input.current.aim !== undefined && !remote ? { yaw: input.current.aim, pitch: input.current.pitch ?? rc.gun?.pitch ?? 0 } : rc.gun;
      aim.yaw = g?.yaw ?? 0;
      aim.pitch = g?.pitch ?? 0;
    });
    // The blaster's aim, when the party is at the gun: a flame-coloured arrow round the speeder
    if (aimRef.current) {
      const aim = input.current.aim;
      aimRef.current.visible = aim !== undefined && mine.finish === null && !mine.wrecked && !race0.convoy;
      if (aim !== undefined) {
        aimRef.current.position.set(mine.craft.p[0], mine.craft.p[1] + 1.1, mine.craft.p[2]);
        aimRef.current.rotation.set(0, -(mine.craft.yaw + aim), 0);
      }
    }
    // The chevron over the party's speeder, toward the next gate
    if (chevron.current) {
      const gate = track.gates[raceNextGate(now, mine)];
      chevron.current.position.set(mine.craft.p[0] + Math.cos(mine.craft.yaw) * 1.5, mine.craft.p[1] + 2.1, mine.craft.p[2] + Math.sin(mine.craft.yaw) * 1.5);
      chevron.current.rotation.set(0, -Math.atan2(gate.p[2] - mine.craft.p[2], gate.p[0] - mine.craft.p[0]), 0);
      chevron.current.visible = mine.finish === null && !mine.wrecked;
    }
    // Behind and over the party's speeder, looking well down the track; lifted over a rise behind it. At a convoy's gun: behind the gun, looking
    // where it points (the sights are the middle of the screen)
    const dt = Math.min(delta, 0.25);
    const [cy, sy] = [Math.cos(mine.craft.yaw), Math.sin(mine.craft.yaw)];
    const sights = race0.convoy && !remote ? input.current.aim : remote && race0.convoy && gunner ? mine.gun?.yaw : undefined;
    if (sights !== undefined) {
      const pitch = (remote ? mine.gun?.pitch : input.current.pitch) ?? 0;
      const yaw = mine.craft.yaw + sights;
      const [dx, dy, dz] = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)];
      behind.set(mine.craft.p[0] - dx * 7, mine.craft.p[1] + 3.4 - dy * 7, mine.craft.p[2] - dz * 7);
      ahead.set(mine.craft.p[0] + dx * 60, mine.craft.p[1] + 3.4 + dy * 60, mine.craft.p[2] + dz * 60);
    } else {
      behind.set(mine.craft.p[0] - cy * 11, mine.craft.p[1] + 5.2, mine.craft.p[2] - sy * 11);
      ahead.set(mine.craft.p[0] + cy * 17, mine.craft.p[1] + 0.4, mine.craft.p[2] + sy * 17);
    }
    camera.position.lerp(behind, Math.min(1, dt * (sights !== undefined ? 12 : 5)));
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
      <WorldSky look={sky} light={1} hour={13} radius={1500} fog={[140, 760]} lite={lite} />
      <hemisphereLight args={[look.zenith, look.ground, 0.55]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[120, 220, 80]} intensity={1.1} />
      {track.sea ? (
        <Sea at={[0, 0, 0]} size={(track.extent + 220) * 2} lite={lite} murky={biome === "swamp"} />
      ) : (
        <>
          <RaceGround track={track} look={look} />
          <RaceRivers track={track} />
        </>
      )}
      {track.gates.map((g, i) => <Gate key={i} gate={g} first={i === 0 || (!!track.road && i === track.gates.length - 1)} lit={i === next} chequer={chequer} track={track} />)}
      <Hazards track={track} hazards={snap.hazards} />
      <RaceProps track={track} biome={biome} broken={snap.broken} cover={cover} />
      {race0.racers.map((racer, i) => (
        <group key={racer.id}>
          <group ref={(el) => { racerRefs.current[i] = el; if (el) el.rotation.order = "YZX"; }}>
            <RacerModel model={racer.model} look={lookOf(racer)} kind={racer.kind} wrecked={snap.racers[i].wrecked} flame={(el) => { flameRefs.current[i] = el; }} crew={rideCrew[i]} aims={aimRefs[i]} seats={racer.party ? seats : undefined} gunner={racer.party ? gunner : !!racer.cargo} empty={!!snap.racers[i].idle} />
          </group>
          <group ref={(el) => { shadowRefs.current[i] = el; }}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[SPEEDER_BODY[racer.kind].half[0] * 0.95, SPEEDER_BODY[racer.kind].half[1] * 1.05 + 0.15, 1]}>
              <circleGeometry args={[1, 18]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.4} depthWrite={false} polygonOffset polygonOffsetFactor={-5} polygonOffsetUnits={-5} />
            </mesh>
          </group>
          {!racer.party && (
            <group ref={(el) => { barRefs.current[i] = el; }} visible={!snap.racers[i].idle}>
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
      <group ref={aimRef} visible={false}>
        <mesh position={[4.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.45, 1.5, 8]} />
          <meshBasicMaterial color="#ff5a3c" />
        </mesh>
        <mesh position={[2.6, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 2.4, 6]} />
          <meshBasicMaterial color="#ff5a3c" transparent opacity={0.7} />
        </mesh>
      </group>
      <group ref={chevron}>
        <mesh position={[0.5, 0, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} scale={[1, 1, 0.35]}>
          <coneGeometry args={[0.32, 0.95, 3]} />
          <meshBasicMaterial color="#ffd24a" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      </group>
      <Sparks queue={sparks} />
      {track.road?.block && <Guards track={track} guards={snap.guards} who={race0.block?.who ?? ""} />}
      {(race0.chase || track.road?.block || race0.convoy) && <Bolts queue={shots} party={race0.racers[party].id} />}
      {race0.convoy && <Flyers race={raceRef} snap={snap} />}
    </>
  );
}

// The drag pad, and the buttons: throttle (boost, brake), in a race Boost on its meter, and in a dogfight
// fire. Each button holds its pointer, so that a thumb that slides a little off it does not let go.
// (`rate`: at a convoy's gun the pad turns the gun, left and right, up and down, as far as it is pushed, rather than pointing it)
function Controls({ input, onThrottle, onFire, onBoost, meter, aiming, rate }: { input: { current: RaceInput }; onThrottle?: (value: -1 | 0 | 1) => void; onFire?: (down: boolean) => void; onBoost?: (down: boolean) => void; meter?: number; aiming?: boolean; rate?: { current: { x: number; y: number } } }) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const steer = (e: React.PointerEvent) => {
    const box = pad.current!.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / PAD));
    const dy = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height / 2)) / PAD));
    // At the gun the pad points the blaster (up: ahead, right: to the right, down: behind) and the crewmate drives
    if (rate) rate.current = { x: dx, y: dy };
    else if (aiming) {
      if (Math.hypot(dx, dy) > 0.2) input.current.aim = Math.atan2(dx, -dy);
    } else input.current.steer = { x: dx, y: dy };
    setKnob({ x: dx, y: dy });
  };
  const release = () => {
    if (rate) rate.current = { x: 0, y: 0 };
    else if (!aiming) input.current.steer = { x: 0, y: 0 };
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
        data-testid={aiming || rate ? "flight-pad-aim" : "flight-pad"}
        className={`absolute bottom-4 left-4 touch-none rounded-full border-2 bg-gray-900/50 ${aiming || rate ? "border-orange-400/70" : "border-sky-400/60"}`}
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
// A leg of a trip: its place in the trip and its ground, how far down the road, the hull and boost, the riders after the party if there are any, the
// roadblock ahead, and who is at the wheel
function RoadHud({ race, game, track, seat, toast }: { race: Race; game: Extract<Minigame, { kind: "road" }>; track: RaceTrack; seat: "driver" | "gunner"; toast: string }) {
  const me = race.racers.find((r) => r.party)!;
  const riders = race.racers.filter((r) => r.hostile);
  const hull = me.hull / me.hullMax;
  const done = Math.max(0, Math.min(1, roadAt(track, me) / track.road!.finish));
  const block = track.road?.block;
  const toBlock = block && race.block?.state === "ahead" ? Math.round(block.at - roadAt(track, me)) : null;
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 w-56 space-y-1 rounded bg-gray-900/75 px-2 py-1.5 text-xs text-sky-100" data-testid="road-hud">
        <div className="flex justify-between font-semibold">
          <span>Leg {game.leg.i + 1} of {game.leg.n}</span>
          <span className="capitalize text-sky-200/80">{game.biome}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-700/80" data-testid="road-progress" data-value={Math.round(done * 100)}>
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${done * 100}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-sky-200/80">
          <span>{Math.max(0, Math.round(track.road!.finish - roadAt(track, me)))} m to go</span>
          <span>{Math.round(Math.abs(me.craft.speed) * 3.6)} km/h</span>
        </div>
        <Bar label="Hull" value={me.hull} max={me.hullMax} color={hull > 0.6 ? "#4ade80" : hull > 0.3 ? "#facc15" : "#ef4444"} testid="race-hull" />
        <Bar label="Boost" value={me.boost} max={1} color="#38bdf8" testid="race-boost" lit={me.boosting} />
        {riders.length > 0 && <div className="text-[11px] text-red-300" data-testid="chase-riders">{riders.filter((r) => !r.wrecked).length} of {riders.length} {race.chase?.who ?? "riders"} still after you</div>}
        {game.mate && <div className="text-[11px]" data-testid="road-seat">{seat === "gunner" ? `${game.mate.name} drives; you are at the gun` : `You drive${riders.length ? `; ${game.mate.name} fires` : ""}`}</div>}
      </div>
      {toBlock !== null && toBlock < 260 && me.finish === null && <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded bg-red-900/75 px-3 py-1 text-xs font-semibold text-red-100" data-testid="road-block-warning">Roadblock ahead, {Math.max(0, toBlock)} m: slow down and stop, or ram it</div>}
      {toast && <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded bg-gray-900/70 px-3 py-1 text-sm font-semibold text-yellow-200" data-testid="race-toast">{toast}</div>}
    </>
  );
}
// The convoy's HUD: the road done, the party's hull, each hauler's, the raiders in the sky and the waves to come, who drives and who guns
function ConvoyHud({ race, track, seat, mate, toast }: { race: Race; track: RaceTrack; seat: "driver" | "gunner"; mate?: string; toast: string }) {
  const me = race.racers.find((r) => r.party)!;
  const air = race.convoy!;
  const done = Math.max(0, Math.min(1, roadAt(track, me) / (track.road?.finish ?? 1)));
  const raiders = air.flyers.filter((f) => f.side === "raider" && !f.wrecked).length;
  const hull = me.hull / me.hullMax;
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 w-60 space-y-1 rounded bg-gray-900/75 px-2 py-1.5 text-xs text-sky-100" data-testid="convoy-hud">
        <div className="flex justify-between font-semibold"><span>Convoy</span><span className="text-red-300" data-testid="convoy-raiders">{raiders} raider{raiders === 1 ? "" : "s"} · wave {air.wave} of {air.waves.length}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-700/80" data-testid="road-progress" data-value={Math.round(done * 100)}><div className="h-full rounded-full bg-emerald-400" style={{ width: `${done * 100}%` }} /></div>
        <Bar label="Your hull" value={me.hull} max={me.hullMax} color={hull > 0.6 ? "#4ade80" : hull > 0.3 ? "#facc15" : "#ef4444"} testid="race-hull" />
        {race.racers.filter((r) => r.cargo).map((h) => <Bar key={h.id} label={h.name} value={h.hull} max={h.hullMax} color={h.wrecked ? "#6b7280" : h.hull / h.hullMax > 0.4 ? "#38bdf8" : "#ef4444"} testid={`convoy-hauler-${h.id}`} />)}
        <div className="text-[11px]" data-testid="convoy-downed">{air.downed} shot down</div>
        <div className="text-[11px]" data-testid="road-seat">{seat === "gunner" ? `${mate ?? "The convoy's droid pilot"} drives; you are at the gun` : `You drive${mate ? `; ${mate} is at the gun` : ""}`}</div>
      </div>
      <ConvoyRadar race={race} seat={seat} />
      {seat === "gunner" && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-300/80" data-testid="convoy-sights">
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-300" />
        </div>
      )}
      {toast && <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded bg-gray-900/70 px-3 py-1 text-sm font-semibold text-yellow-200" data-testid="race-toast">{toast}</div>}
    </>
  );
}
// A radar of the sky round the party's craft (400 m out): the raiders red, the convoy's fighters blue; up is the way the gun points at the
// gun, the way the craft goes at the wheel
function ConvoyRadar({ race, seat }: { race: Race; seat: "driver" | "gunner" }) {
  const me = race.racers.find((r) => r.party)!;
  const up = me.craft.yaw + (seat === "gunner" ? me.gun?.yaw ?? 0 : 0);
  const R = 46;
  return (
    <div className="pointer-events-none absolute right-2 top-12 rounded-full border border-sky-400/50 bg-gray-900/60" style={{ width: R * 2, height: R * 2 }} data-testid="convoy-radar">
      <div className="absolute left-1/2 top-0 h-full w-px bg-sky-400/20" />
      <div className="absolute left-0 top-1/2 h-px w-full bg-sky-400/20" />
      {race.convoy!.flyers.filter((f) => !f.wrecked).map((f) => {
        const [dx, dz] = [f.p[0] - me.craft.p[0], f.p[2] - me.craft.p[2]];
        const d = Math.min(1, Math.hypot(dx, dz) / 400);
        const a = Math.atan2(dz, dx) - up;
        return <div key={f.id} className={`absolute h-2 w-2 rounded-full ${f.side === "raider" ? "bg-red-500" : "bg-sky-300"}`} style={{ left: R + Math.sin(a) * d * (R - 4) - 4, top: R - Math.cos(a) * d * (R - 4) - 4 }} />;
      })}
    </div>
  );
}
const convoyHeadline = (race: Race) => ({ through: "The convoy is through.", lost: "The convoy is lost.", wrecked: "Your craft is shot down." })[convoyResult(race).outcome];
// (`water`: a crossing over open water)
const roadHeadline = (r: Extract<MinigameResult, { kind: "road" }>, water = false) => {
  const me = r.race.racers.find((x) => x.party)!;
  if (r.race.chase && chaseResult(r.race).outcome === "caught") return "They have caught you.";
  return me.finish !== null ? (water ? "The last buoy: you are through." : "The road ends here: you are through.") : me.wrecked ? `Your ${water ? "craft" : "speeder"} is wrecked.` : `Out of time on the ${water ? "water" : "road"}.`;
};
const roadNote = (r: Extract<MinigameResult, { kind: "road" }>, water = false) => {
  const me = r.race.racers.find((x) => x.party)!;
  return [me.finish !== null ? `${raceClock(me.finish)} on the ${water ? "water" : "road"}` : "", `hull ${me.hull} of ${me.hullMax}`, r.stop?.note ?? "", r.race.chase ? chaseResult(r.race).note : ""].filter(Boolean).join("; ");
};
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
const scenarioIntro = (g: Extract<Minigame, { kind: "dogfight" }>) => g.intro ?? SCENARIOS.find((x) => x.id === g.scenario)?.intro ?? "";

// The dedicated page of a minigame: a five-second countdown, then the game. Calls onDone with how it ended.
export function MinigamePage({ game, onDone, onExit, coop }: { game: Minigame; onDone: (result: MinigameResult) => void; onExit: () => void; coop?: { pilot: boolean; gunner: boolean } }) {
  // (the page is given a new `game` object each time its parent draws: what is built from it is built again only for another game)
  const gameKey = game.kind === "dogfight" ? "dogfight" : `${game.kind}|${game.seed}|${game.kind === "road" ? `${game.leg.i}|${game.hull}|${game.riders?.length ?? 0}` : ""}`;
  const course = useMemo(() => (game.kind === "run" ? flightCourse(game.seed, game.mode, { count: game.count }) : null), [gameKey]);
  const biome = game.kind === "race" || game.kind === "chase" || game.kind === "road" || game.kind === "convoy" ? game.biome ?? "temperate" : "temperate";
  const track = useMemo(() => (game.kind === "race" ? raceCourse(game.seed, raceScenery(biome)) : game.kind === "chase" ? raceCourse(game.seed, raceScenery(biome), 1, undefined, true) : game.kind === "road" ? raceCourse(game.seed, raceScenery(biome, !!game.water), 1, { block: !!game.block }) : game.kind === "convoy" ? raceCourse(game.seed, raceScenery(biome), 1, {}) : null), [gameKey, biome]);
  const race0 = useMemo(() => (game.kind === "race" && track ? raceStart(track, game.seed, game.vehicle, RACE_RIVAL_MODELS) : game.kind === "chase" && track ? chaseStart(track, game.seed, game.vehicle, game.riders, game.who) : game.kind === "road" && track ? roadStart(track, game.seed, game.vehicle, { riders: game.riders, who: game.who, mate: game.mate, hull: game.hull, block: game.block ? { who: game.block.who, model: game.block.model } : undefined }) : game.kind === "convoy" && track ? { ...convoyStart(track, game.seed, game.vehicle, { haulers: game.haulers, hauler: game.hauler, level: game.level, who: game.who, ally: game.ally }), mate: game.mate } : null), [gameKey, track]);
  const driven = game.kind === "race" || game.kind === "chase" || game.kind === "road" || game.kind === "convoy";
  const [count, setCount] = useState(game.kind === "road" || game.kind === "convoy" ? 4 : 5);
  // At a convoy's gun: the pad (and A, D, W and S, or a drag on the scene) turn it at a rate, all round and up into the sky
  const aimRate = useRef({ x: 0, y: 0 });
  const aimKeys = useRef(new Set<string>());
  const seatNow = useRef<"driver" | "gunner">("driver");
  // A roadblock: the race waits while the page asks what the party does (`pause`); `act` carries the answer to the race
  const pause = useRef(false);
  const act = useRef<((how: "open" | "run") => void) | null>(null);
  const [stopped, setStopped] = useState<{ note: string; raised: boolean; talked: boolean } | null>(null);
  const stopResult = useRef<{ outcome: "open" | "run"; paid: number; note: string } | undefined>(undefined);
  const [seat, setSeat] = useState<"driver" | "gunner">("driver");
  const go = useRef(false);
  // The page, which the dogfight's fullscreen button takes fullscreen (the countdown and the end screen are in it)
  const page = useRef<HTMLDivElement>(null);
  const input = useRef<RaceInput>({ steer: { x: 0, y: 0 }, throttle: 0, auto: (() => { try { return localStorage.getItem("sw5e.autopilot") === "1"; } catch { return false; } })() });
  // The games write their latest snapshot here each frame; the HUD copies it ten times a second
  const latest = useRef<{ race?: Race; run?: { next: number; speed: number } }>({});
  const [hud, setHud] = useState<typeof latest.current>({});
  // What the race says of the party, shown for two seconds; the last lap is announced
  const toast = useRef({ text: "", until: 0, lap: 1 });
  // A co-op pilot streams the leg to the crew riding with them (about fifteen times a second; the events between are sent with it)
  const sent = useRef({ at: 0, events: [] as RaceEvent[] });
  const onRace = (race: Race) => {
    latest.current.race = race;
    if (coop?.pilot && roadBus.send) {
      sent.current.events.push(...race.events);
      const clock = performance.now();
      if (clock - sent.current.at > 66) {
        sent.current.at = clock;
        roadBus.send({ t: "road", race: { ...race, log: [], events: [] }, events: sent.current.events.splice(0) });
      }
    }
    // For test scripts, as the map's window.__map3d: the race as it stands, and what the party does (`__raceInput`)
    (window as unknown as { __race?: Race; __raceInput?: RaceInput }).__race = race;
    (window as unknown as { __raceInput?: RaceInput }).__raceInput = input.current;
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
  // A co-op pilot: the leg is told to the crew (again every few seconds, for one who joins late), and the gunner's aim and trigger are the party's gun
  useEffect(() => {
    if (!coop?.pilot || !roadBus.send) return;
    const tell = () => roadBus.send?.({ t: "road", spec: game });
    tell();
    const timer = setInterval(tell, 2500);
    return () => clearInterval(timer);
  }, [gameKey, !!coop?.pilot]);
  useEffect(() => {
    if (!coop?.pilot || !coop.gunner) return;
    const timer = setInterval(() => {
      const g = roadBus.gun;
      const live = performance.now() - g.at < 1500;
      input.current.aim = live ? g.aim : 0;
      input.current.fire = live && g.fire;
    }, 40);
    return () => {
      clearInterval(timer);
      input.current.aim = undefined;
      input.current.fire = false;
    };
  }, [!!coop?.pilot, !!coop?.gunner]);
  // Keyboard, for a race: W speeds up, S slows down, A and D turn left and right, Right Shift boosts. Each key writes only
  // its own control, so the drag pad's steering and the buttons still work alongside it.
  useEffect(() => {
    if (!driven) return;
    const held = new Set<string>();
    const press = (e: KeyboardEvent, on: boolean) => {
      if (!["KeyW", "KeyS", "KeyA", "KeyD", "ShiftRight", "Space"].includes(e.code)) return;
      if (game.kind === "convoy" && seatNow.current === "gunner" && e.code !== "Space") {
        if (on) aimKeys.current.add(e.code);
        else aimKeys.current.delete(e.code);
        return;
      }
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
  useEffect(() => {
    seatNow.current = seat;
    if (seat === "driver") aimKeys.current.clear();
  }, [seat]);
  useEffect(() => {
    if (game.kind !== "convoy") return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (seatNow.current !== "gunner") return;
      const k = aimKeys.current;
      const x = aimRate.current.x + (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
      const y = aimRate.current.y + (k.has("KeyS") ? 1 : 0) - (k.has("KeyW") ? 1 : 0);
      input.current.aim = ((input.current.aim ?? 0) + Math.max(-1, Math.min(1, x)) * 1.9 * dt + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      input.current.pitch = Math.max(-0.15, Math.min(1.35, (input.current.pitch ?? 0.3) - Math.max(-1, Math.min(1, y)) * 1.3 * dt));
    }, 16);
    return () => clearInterval(timer);
  }, [game.kind]);
  // A drag on the scene at the gun turns it too (the mouse, or a finger off the pad)
  const dragAim = (e: React.PointerEvent) => {
    if (game.kind !== "convoy" || seat !== "gunner" || !e.buttons || (e.target as HTMLElement).tagName !== "CANVAS") return;
    input.current.aim = (input.current.aim ?? 0) + e.movementX * 0.005;
    input.current.pitch = Math.max(-0.15, Math.min(1.35, (input.current.pitch ?? 0.3) - e.movementY * 0.005));
  };
  // Swapping seats with the crewmate: at the gun the pad aims (and the crewmate drives), at the wheel it steers
  const swap = () => {
    const next = seat === "driver" ? "gunner" : "driver";
    setSeat(next);
    input.current.auto = next === "gunner";
    input.current.aim = next === "gunner" ? 0 : undefined;
    input.current.pitch = next === "gunner" && game.kind === "convoy" ? 0.3 : undefined;
    input.current.fire = false;
    aimRate.current = { x: 0, y: 0 };
    input.current.steer = { x: 0, y: 0 };
    input.current.throttle = 0;
    input.current.boost = false;
  };
  // What the party does at the roadblock it is stopped at: a fee, a word (Persuasion or Deception against the barrier's DC), or the ram
  const deal = (choice: StopChoice, skill?: "persuasion" | "deception") => {
    if (game.kind !== "road" || !game.block || !stopped) return;
    const stop = settleStop(game.block, choice, { roll: 1 + Math.floor(Math.random() * 20), bonus: skill ? game.talk[skill] : 0, credits: game.credits, raised: stopped.raised });
    if (stop.outcome === "refused") return setStopped({ note: stop.note, raised: stopped.raised || choice === "talk", talked: stopped.talked || choice === "talk" });
    stopResult.current = { outcome: stop.outcome, paid: stop.paid, note: stop.note };
    act.current?.(stop.outcome);
    pause.current = false;
    setStopped(null);
  };

  // Who is in the party's craft, seat by seat (models.tsx craftLayout): the party at the wheel and the crewmate at the gun (they change places
  // at Swap seats), or a co-op player at the gun; the companions riding along in the other seats. A gun is lent to a craft with a gunner.
  const me: CrewMember = { kind: "player", player: true };
  const mates: CrewMember[] = game.kind === "road" || game.kind === "convoy" ? game.crew ?? (game.mate ? [{ kind: "person", name: game.mate.name, role: "pilot" }] : []) : [];
  // (in a convoy with no crewmate, the convoy's droid pilot takes the wheel while the party is at the gun)
  const wheel = mates[0] ?? (game.kind === "convoy" ? { kind: "droid", name: "RX-series pilot droid" } : undefined);
  const partyCrew = coop?.gunner ? [me, { kind: "person", name: "Gunner", role: "pilot" }, ...mates] : seat === "gunner" && wheel ? [wheel, me, ...mates.slice(1)] : [me, ...mates];
  const lendGun = (game.kind === "road" && (!!game.mate || !!coop?.gunner)) || game.kind === "convoy";
  const title = game.title;
  const counting = count >= 0;
  const headline = count > 0 ? String(count) : count === 0 ? "GO!" : "";
  return (
    <div ref={page} className="fixed inset-0 z-[70] flex flex-col bg-black" data-testid="minigame-page">
      <div className="flex items-center justify-between gap-2 border-b border-sky-500/30 bg-gray-950 px-3 py-2 text-sm text-sky-100">
        <span className="font-semibold" data-testid="minigame-title">{title}</span>
        <button type="button" className="rounded border border-gray-500 px-3 py-1 text-xs" onClick={onExit} data-testid="minigame-exit">Leave it</button>
      </div>
      <div className="relative flex-1 overflow-hidden" data-testid={`minigame-${game.kind}`} onPointerMove={dragAim}>
        {game.kind === "run" && course && (
          <Canvas gl={babylonGl} camera={{ position: [0, 6, -12], fov: 65, far: 2000 }} onCreated={({ gl }) => gl.setClearColor(game.mode === "ship" ? "#02040a" : "#8fb4d8")}>
            <RunGame game={game} course={course} go={go} input={input} onFinish={({ next, t }) => finish({ kind: "run", course, collected: next, timeLeft: Math.max(0, course.limit - t) })} onFrame={(s) => (latest.current.run = { next: s.next, speed: Math.round(s.craft.speed) })} />
          </Canvas>
        )}
        {driven && track && race0 && (
          <Canvas gl={babylonGl} camera={{ position: [0, 6, -12], fov: 62, near: 0.3, far: 2400 }} dpr={[1, 1.5]} onCreated={({ gl }) => gl.setClearColor(raceLook(biome).sky)}>
            <RaceGame track={track} race0={race0} biome={biome} look={game.kind === "road" || game.kind === "convoy" ? game.look : undefined} haulerLook={game.kind === "convoy" ? game.haulerLook : undefined} go={go} input={input} onFinish={(race) => finish(game.kind === "chase" ? { kind: "chase", race } : game.kind === "convoy" ? { kind: "convoy", race } : game.kind === "road" ? { kind: "road", race, metres: track.road?.finish ?? 0, stop: stopResult.current ?? (race.block?.state === "ran" || race.block?.state === "run" ? { outcome: "run", paid: 0, note: "You ran the roadblock" } : undefined) } : { kind: "race", race })} onFrame={onRace} pause={pause} act={act} onStop={() => game.kind === "road" && game.block && setStopped({ note: "", raised: false, talked: false })} gunner={lendGun} crew={partyCrew} seats={game.kind === "road" || game.kind === "convoy" ? game.seats : undefined} />
          </Canvas>
        )}
        {game.kind === "dogfight" && <DogfightGame spec={game} go={go} controls={!counting && !finished} shell={page} onFinish={(state) => finish({ kind: "dogfight", state })} />}
        {game.kind === "race" && hud.race && <RaceHud race={hud.race} toast={hud.race.t < toast.current.until ? toast.current.text : ""} />}
        {game.kind === "chase" && hud.race && <ChaseHud race={hud.race} toast={hud.race.t < toast.current.until ? toast.current.text : ""} />}
        {game.kind === "road" && hud.race && track && <RoadHud race={hud.race} game={game} track={track} seat={seat} toast={hud.race.t < toast.current.until ? toast.current.text : ""} />}
        {game.kind === "convoy" && hud.race && track && <ConvoyHud race={hud.race} track={track} seat={seat} mate={game.mate?.name} toast={hud.race.t < toast.current.until ? toast.current.text : ""} />}
        {game.kind === "convoy" && !finished && !counting && (
          <button type="button" className="absolute right-28 top-2 z-10 max-w-[45vw] rounded border border-sky-400/70 bg-gray-900/80 px-3 py-1 text-xs text-sky-100" onClick={swap} data-testid="road-swap">
            {seat === "driver" ? `Take the gun: ${game.mate?.name ?? "the convoy's droid pilot"} keeps your craft in the column` : "Take the wheel"}
          </button>
        )}
        {game.kind === "road" && game.mate && !finished && (
          <button type="button" className="absolute right-2 top-2 z-10 rounded border border-sky-400/70 bg-gray-900/80 px-3 py-1 text-xs text-sky-100" onClick={swap} data-testid="road-swap">
            {seat === "driver" ? `Swap seats: ${game.mate.name} drives, you take the gun` : `Swap seats: you drive, ${game.mate.name} takes the gun`}
          </button>
        )}
        {game.kind === "road" && game.block && stopped && !finished && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4" data-testid="road-stop">
            <div className="max-w-md space-y-2 rounded border border-yellow-500/60 bg-gray-900 p-4 text-sm text-gray-100">
              <p className="text-base font-semibold text-yellow-300">{game.block.by === "checkpoint" ? "A checkpoint" : "A toll gate"}: {game.block.who}</p>
              <p>{game.block.by === "checkpoint" ? "Guards wave you down at a barrier of crates across the road. Papers, and a fee, they say." : "Riders of a gang hold a barrier across the road. A toll, they say, or you do not pass."}</p>
              {stopped.note && <p className="text-red-300" data-testid="road-stop-note">{stopped.note}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded border border-emerald-400/70 px-3 py-1 text-xs disabled:opacity-40" disabled={game.block.wanted && game.block.by === "checkpoint"} onClick={() => deal("pay")} data-testid="stop-pay">Pay {stopped.raised ? Math.ceil(game.block.fee * 1.5) : game.block.fee} credits (you have {game.credits})</button>
                {!stopped.talked && <button type="button" className="rounded border border-sky-400/70 px-3 py-1 text-xs" onClick={() => deal("talk", "persuasion")} data-testid="stop-persuade">Persuasion {game.talk.persuasion >= 0 ? "+" : ""}{game.talk.persuasion} (DC {game.block.dc})</button>}
                {!stopped.talked && <button type="button" className="rounded border border-sky-400/70 px-3 py-1 text-xs" onClick={() => deal("talk", "deception")} data-testid="stop-deceive">Deception {game.talk.deception >= 0 ? "+" : ""}{game.talk.deception} (DC {game.block.dc})</button>}
                <button type="button" className="rounded border border-red-400/70 px-3 py-1 text-xs" onClick={() => deal("run")} data-testid="stop-run">Ram it (they will come after you)</button>
              </div>
            </div>
          </div>
        )}
        {game.kind === "run" && hud.run && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-gray-900/70 px-2 py-1 text-xs text-sky-100" data-testid="flight-hud">
            {title} · rings {hud.run.next} of {course?.rings.length ?? 0} · {hud.run.speed} {game.mode === "ship" ? "km/s" : "m/s"}
          </div>
        )}
        {counting && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/50" data-testid="countdown">
            <span className="text-8xl font-bold text-yellow-300">{headline}</span>
            {(game.kind === "road" || game.kind === "convoy") && (
              <div className="max-w-md space-y-1 px-4 text-center text-sm text-sky-100" data-testid="road-briefing">
                {game.intro.map((l, i) => <p key={i}>{l}</p>)}
              </div>
            )}
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
            onThrottle={game.kind === "convoy" && seat === "gunner" ? undefined : (v) => (input.current.throttle = driven ? (v < 0 ? -1 : 0) : v)}
            onBoost={driven && !(game.kind === "convoy" && seat === "gunner") ? (down) => (input.current.boost = down) : undefined}
            onFire={game.kind === "chase" || (game.kind === "road" && (!!game.riders?.length || !!game.block) && !coop?.gunner) || (game.kind === "convoy" && seat === "gunner") ? (down) => (input.current.fire = down) : undefined}
            aiming={game.kind === "road" && seat === "gunner"}
            rate={game.kind === "convoy" && seat === "gunner" ? aimRate : undefined}
            meter={hud.race?.racers.find((r) => r.party)?.boost}
          />
        )}
        {finished && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center" data-testid="minigame-over">
            <p className="text-lg font-semibold text-yellow-300">{finished.kind === "convoy" ? convoyHeadline(finished.race) : finished.kind === "road" ? roadHeadline(finished, game.kind === "road" && !!game.water) : finished.kind === "race" ? "The race is over." : finished.kind === "chase" ? (chaseResult(finished.race).outcome === "caught" ? "They have caught you." : "You are clear of them.") : finished.kind === "dogfight" ? dogfightHeadline(finished.state) : "The run is over."}</p>
            {finished.kind === "chase" && <p className="max-w-md text-sm text-sky-100" data-testid="chase-result">{chaseResult(finished.race).note}</p>}
            {finished.kind === "convoy" && <p className="max-w-md text-sm text-sky-100" data-testid="convoy-result">{convoyResult(finished.race).note}: {convoyResult(finished.race).credits} cr</p>}
            {finished.kind === "road" && <p className="max-w-md text-sm text-sky-100" data-testid="road-result">{roadNote(finished, game.kind === "road" && !!game.water)}</p>}
            {finished.kind === "dogfight" && !(game.kind === "dogfight" && game.foes) && <p className="max-w-md text-sm text-sky-100" data-testid="dogfight-result">{dogfightPayout(finished.state).note}: {dogfightPayout(finished.state).credits} cr</p>}
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

// A co-op crew member riding a road leg in someone else's craft (2026-10-30; the user: the gunner's seat did nothing, and the rider sat at a
// menu for the whole journey). The pilot's page runs the leg and streams it (lib/roadBus.ts); this page shows it from behind the same craft.
// The gunner turns the blaster on the pad (or A and D) and fires (Fire, or Space): the pilot's gun does what they say. A passenger watches.
export function RoadRide({ gunner, gunnerAboard, pilotName }: { gunner: boolean; gunnerAboard: boolean; pilotName: string }) {
  const [spec, setSpec] = useState(roadBus.spec);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setSpec((old) => (roadBus.spec && roadBus.spec !== old ? roadBus.spec : old));
      setTick((n) => n + 1);
    }, 300);
    return () => clearInterval(timer);
  }, []);
  const game = spec?.game as Extract<Minigame, { kind: "road" }> | undefined;
  const input = useRef<RaceInput>({ steer: { x: 0, y: 0 }, throttle: 0, aim: gunner ? 0 : undefined });
  const go = useRef(true);
  const biome = game?.biome ?? "temperate";
  const key = game ? `${game.seed}|${game.leg.i}|${game.hull}|${game.riders?.length ?? 0}` : "";
  const track = useMemo(() => (game ? raceCourse(game.seed, raceScenery(biome, !!game.water), 1, { block: !!game.block }) : null), [key, biome]);
  const race0 = useMemo(() => (game && track ? roadStart(track, game.seed, game.vehicle, { riders: game.riders, who: game.who, mate: undefined, hull: game.hull, block: game.block ? { who: game.block.who, model: game.block.model } : undefined }) : null), [key, track]);
  const latest = useRef<Race | undefined>(undefined);
  const [race, setRace] = useState<Race | undefined>(undefined);
  useEffect(() => {
    const timer = setInterval(() => setRace(latest.current), 100);
    return () => clearInterval(timer);
  }, []);
  // The aim and the trigger go to the pilot a dozen times a second, and A and D turn the gun
  useEffect(() => {
    if (!gunner) return;
    const held = new Set<string>();
    const keyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); input.current.fire = true; }
      if (e.code === "KeyA" || e.code === "KeyD") held.add(e.code);
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") input.current.fire = false;
      held.delete(e.code);
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    const timer = setInterval(() => {
      const turn = (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0);
      if (turn) input.current.aim = (input.current.aim ?? 0) + turn * 0.12;
      roadBus.send?.({ t: "gun", aim: input.current.aim ?? 0, fire: !!input.current.fire });
    }, 80);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      clearInterval(timer);
    };
  }, [gunner]);
  const age = roadBus.snap ? (performance.now() - roadBus.snap.at) / 1000 : Infinity;
  const stopped = race?.block?.state === "stopped";
  void tick;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" data-testid="road-ride">
      <div className="flex items-center justify-between gap-2 border-b border-sky-500/30 bg-gray-950 px-3 py-2 text-sm text-sky-100">
        <span className="font-semibold">{game?.title ?? "On the road"}</span>
        <span className="text-xs text-sky-200/80" data-testid="road-ride-role">{gunner ? `You man the gun; ${pilotName} drives` : `You ride with ${pilotName}`}</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {game && track && race0 && (
          <Canvas gl={babylonGl} camera={{ position: [0, 6, -12], fov: 62, near: 0.3, far: 2400 }} dpr={[1, 1.5]} onCreated={({ gl }) => gl.setClearColor(raceLook(biome).sky)}>
            <RaceGame key={key} track={track} race0={race0} biome={biome} look={game?.look} go={go} input={input} onFinish={() => {}} onFrame={(r) => { latest.current = r; }} gunner={gunnerAboard} remote seats={game.seats} crew={[{ kind: "person", name: pilotName, role: "pilot" }, ...(gunner ? [{ kind: "player", player: true }] : gunnerAboard ? [{ kind: "person", name: "Gunner", role: "pilot" }, { kind: "player", player: true }] : [{ kind: "player", player: true }]), ...(game.crew ?? [])]} />
          </Canvas>
        )}
        {game && track && race && <RoadHud race={race} game={{ ...game, mate: undefined }} track={track} seat="gunner" toast="" />}
        {(!game || !roadBus.snap || age > 4) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4 text-center text-sm text-sky-100" data-testid="road-ride-wait">
            {!game ? `${pilotName} is getting the craft ready…` : roadBus.snap?.race.over ? `This leg is over: ${pilotName} is landing` : `Waiting for ${pilotName} to take the road…`}
          </div>
        )}
        {stopped && <div className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 rounded bg-yellow-900/80 px-3 py-1 text-xs font-semibold text-yellow-100">Stopped at the roadblock: {pilotName} is dealing with it</div>}
        {gunner && game && <Controls input={input} aiming onFire={(down) => (input.current.fire = down)} />}
      </div>
    </div>
  );
}
