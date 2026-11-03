import { Suspense, useRef, useState, useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Text, useTexture, OrbitControls, PerspectiveCamera, Billboard, Line, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { useKeyboardControls } from "@react-three/drei";
import { create } from "zustand";
import { useMap } from "@/lib/stores/useMap";
import { useCoop, type Peer } from "@/lib/coop";
import type { Pet } from "@shared/logic/coop";
import { useCombat, useShipFight, attackPlan, cannotAct, pickTarget, reachable, onPartySide, parseKey, squaresApart, type Combatant, type Step } from "@/lib/stores/useCombat";
// A lit square's colour by how it is reached: walked (green), jumped, climbed or flown to (blue), or a fall at the end (orange)
const stepColor = (step: Step) => (step.fall ? "#fb923c" : step.how && /^(jump|climb|hook|fly)$/.test(step.how) ? "#38bdf8" : "#4ade80");
import { deckSquares, waterOf, isWaterCraft, isSubmersible, HELM_PACE, type WaterLife } from "@shared/logic";
import { standsAt, stairsGoals, arrivalSquares, climbAt, canStep, floorsOf, piecesIn, squaresOf, type Companion, type Cart, type PartyVehicle, type Vehicle, shipReach, SHIP_FACINGS } from "@shared/logic";
import { afterHoursLock, alleyAt, alleysOf, ambushIn, bayBerth, bayDoor, gangSpots, gangStarts, lawAt, isSatellite, childrenOf, trailOf, exitsOf, floorPlan, createRandom, counterSides, isCounter, isLocal, formOf, openAir, districtAt, trapsIn, useKindOf, unitOf, ALERT, START_TIME, daylight, hourOf, blockadeAt, type Squad, type Mover, type DistrictPlan, type Rect, type Area, type Exit, type Occupant, type Standing, type RoomAsset, type RoomLayout, type Ship, type World, type ResourceNode, nodeAt, worldLook, type WorldLook, type PartyShip } from "@shared/logic";
import type { VerticalMove } from "@shared/logic";
import { transitMs, transitAt, geomOf, type TransitKind, type TransitGeom, type Edge as TransitEdge } from "./interiors/transit";
import GalaxyMap, { Probe, Rig, useTaps, tapTime, type MapAction } from "./GalaxyMap";
import { floorOf, tokenOf, SIDE_COLORS, type FloorKind } from "./sprites";
import type { Tier } from "./interiors/atmosphere";
import { Atmosphere } from "./interiors/Atmosphere.tsx";
import { Stock } from "./interiors/Stock.tsx";
import { CaveDressing, CaveMound, CaveSlab, CaveWalls, MaskFloor, RampFloor, RockArch, RockWall } from "./interiors/CaveRoom";
import { moodOf } from "./interiors/atmosphere";
import { PACKS, WALL_FILES, facing, hasWalls, packOf, pieceOf, wallPackOf } from "./interiors/packs";
import { loadModel } from "./interiors/assets";
import { PackWalls, cornerCentre, bendOf, holeOf, piercedWall, type Bend, type WallRun } from "./interiors/Walls";
import { AIM, aimAt, aimFrom, partyMotion, roof as viewRoof, stance, useView, type Aimed, type AimPlan } from "./interiors/aim";
import { kickOf, motion, nowSeconds, type Motion } from "./interiors/limbs";
import { useAir, jumpOf, flightOf, reelTo, bindAirKeys, partyHeight, AIR, FEET, type JumpStats } from "./interiors/air";
import { ViewRig } from "./interiors/ViewRig";
import { ShooterLayer, type ShooterCtx } from "./interiors/Shooter";
import { useShoot } from "./interiors/shoot";
import { moonlight, isArenaBowl } from "@shared/logic";
import { bondOf, chatScene, genderOf, smallTalk, talkNotes, talkPlace, townTalk, type TalkLine } from "@shared/logic/relations";
import { chatter, speak, voicePrefs, type ChatPerson } from "@/lib/voice";
import { BOUT_LENGTH, matchState, pitGossip, pitLines, type Match, type PitItem } from "@shared/logic/pitbets";
import { CROUCH_FACTOR, PRONE_FACTOR, stickWalk, useRun, WALK_FACTOR, type Walk } from "./interiors/stick";
import { packTone, toneColour } from "./interiors/tones";
import { lookOf, wealthOf } from "./interiors/wealth";
import { holdsOf } from "./interiors/stock";
import { useDisplay } from "./interiors/display";
import { Decks, FishSchools, Sea, SEA_Y, SWIM_Y, UNDER_FOG, UNDER_SWIM_Y, UnderSea } from "./siteAssets";
import { BasePieceModel, CartModel, CurtainWall, FarGround, GardenGround, GroundSurface, Scatter, StallModel, ambientBackdrop, ambientBlockers, ambientCover, fixturesOf, groundTexture, floorLook, FloorSurface, keeperSpot, paletteOf, stallState, useQuality, type Placed } from "./siteAssets";
import { WallAnchor, WallGeometry, WallMaterial, WALL_TILE, boxUV, wallMaterial, wallSet, type WallSet } from "./surfaces";
import { seatState, easeSit, smooth, carrying, errandAt, errandLength, type SeatState, type Shot } from "./interiors/limbs";
import { useLamps, Figure, MotionContext, seatFor, type CrewMember, stoolsOf, Furniture, Chest, NodeModel, ShipModel, ShipBody, SpeederModel, BuildingModel, SettlementModel, Decor, RoomBlock, DoorLeaf, DoorVoid, RoundedFloor, CornerWall, DomeRoof, Opening, openingOutline, styleOf, hue, type Style } from "./models";
import { WorldSky, PlanetGlobe, globeOf, globeLift, hashText } from "./scenery";
import { radiiOf as shapeRadii, insetAt, outline, outlineAt, outlineOf, wallStretches, type Outline, type Side as FootSide } from "@shared/logic/footprint";

// The flying games draw the same ships and speeders
export { ShipModel, SpeederModel } from "./models";

interface LocalMapProps {
  // The campaign's generated world and where the party is in it
  world?: World | null;
  hereId?: string | null;
  // The place being looked at (a system, planet, settlement or building is shown from the
  // inside, anything above a system as the galaxy); by default the place the party is in
  viewId?: string | null;
  // The place picked out
  selectedId?: string | null;
  // What a tap asks for (see MapAction)
  onAct?: (action: MapAction) => void;
  // Nothing can be done on foot just now (the character is dead, a place is being built)
  locked?: boolean;
  // Show what the party has not seen: any room can be opened up (the atlas)
  reveal?: boolean;
}

// The view that shows where someone standing in an area is: a building for its rooms and its
// street, the place itself for a settlement, planet or system
export function viewOf(world: World, areaId: string): string {
  const area = world.areas[areaId];
  if (!area) return world.rootId;
  if (area.kind === "room") return area.parentId ?? world.rootId;
  return area.kind === "galaxy" || area.kind === "region" ? world.rootId : area.id;
}

// The square the party stands on in the building it is in or in front of, on the building's
// grid of 5-foot squares. Kept outside the scene so that a fight starts and ends where they stand.
export const usePartySpot = create<{ areaId: string | null; x: number; y: number; stand: (areaId: string, x: number, y: number) => void }>((set) => ({
  areaId: null,
  x: 0,
  y: 0,
  stand: (areaId, x, y) => set({ areaId, x, y }),
}));

// The party going up to a roof or down from it (shared/logic verticalMove; the path is interiors/transit.ts): Play asks for it and waits
// until it is over, the scene carries the figure along it, and only then does Play move the party to the roof or the street
export interface TransitRun { id: number; kind: TransitKind; up: boolean; area: string; levels: number; start: number; ms: number }
let transitCount = 0;
// `ask` is the request, which the scene answers by walking the party to the foot of the way and beginning (`now`); the animation is timed by
// the wall clock, not the frames (a slow device still gets on with the game). Where nothing answers (no scene is drawn) the party goes at once.
export const useTransit = create<{ ask: (VerticalMove & { id: number }) | null; now: TransitRun | null; play: (move: VerticalMove) => Promise<void>; claim: (id: number) => void; begin: (id: number) => TransitRun | null; end: () => void }>((set, get) => {
  let finish: (() => void) | null = null;
  let claimTimer: ReturnType<typeof setTimeout> | undefined;
  let capTimer: ReturnType<typeof setTimeout> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  const done = () => {
    clearTimeout(claimTimer);
    clearTimeout(capTimer);
    clearTimeout(endTimer);
    set({ ask: null, now: null });
    const f = finish;
    finish = null;
    f?.();
  };
  return {
    ask: null,
    now: null,
    play: (move) => new Promise<void>((resolve) => {
      if (get().ask || get().now) return resolve();
      finish = resolve;
      set({ ask: { ...move, id: ++transitCount } });
      claimTimer = setTimeout(done, 700);
      capTimer = setTimeout(done, 25000);
    }),
    claim: (id) => { if (get().ask?.id === id) clearTimeout(claimTimer); },
    begin: (id) => {
      const a = get().ask;
      if (!a || a.id !== id) return null;
      // (test builds: localStorage sw5e.transitSlow = 8 makes it eight times slower, to look at a frame of it)
      const slow = (() => { try { return import.meta.env.VITE_TEST_MENU === "1" ? Math.max(1, Number(localStorage.getItem("sw5e.transitSlow")) || 1) : 1; } catch { return 1; } })();
      const run: TransitRun = { id, kind: a.kind, up: a.up, area: a.area, levels: a.levels, start: performance.now(), ms: transitMs(a.kind, a.levels) * slow };
      set({ now: run });
      endTimer = setTimeout(done, run.ms + 40);
      return run;
    },
    end: done,
  };
});

// A base piece being set down (shared/logic bases.ts): Play picks the item, the map shows where it would stand by the party and a tap on
// an open square puts it there (MapAction "place"); `face` is turned by Play's Turn button
export const usePlacing = create<{ piece: { item: string; name: string; w: number; h: number; places: ("outdoors" | "indoors")[]; look: string } | null; face: number; set: (piece: { item: string; name: string; w: number; h: number; places: ("outdoors" | "indoors")[]; look: string } | null) => void; turn: () => void }>((set) => ({
  piece: null,
  face: 0,
  set: (piece) => set({ piece, face: 0 }),
  turn: () => set((s) => ({ face: (s.face + 1) % 4 })),
}));

// What the people of the world know of the party, for their talk (2026-11-02): the party's standing (regard, kept in the campaign, not the
// world) and what it is called. Play keeps it.
// and what the pit is talked of (the news of its bouts) and has on today (its matches, for the bouts the map shows): Play keeps both
export const useTalkWorld = create<{ standing: Standing | null; party: string; pit: PitItem[]; matches: Match[] }>(() => ({ standing: null, party: "the newcomers", pit: [], matches: [] }));
// Two people about to talk, each as the model is told of them: their nature and view of the party, and what the other is to them
// (shared/logic/relations.ts talkNotes, bondOf); and what the town says (townTalk)
function talkersOf(world: World, a: Occupant, b: Occupant): [ChatPerson, ChatPerson] {
  const { standing, party } = useTalkWorld.getState();
  return [
    { ...chatPerson(a), notes: talkNotes(world, standing, a, party), bond: bondOf(world, a, b).text },
    { ...chatPerson(b), notes: talkNotes(world, standing, b, party), bond: bondOf(world, b, a).text },
  ];
}
const newsOf = (world: World, areaId: string) => townTalk(world, useTalkWorld.getState().party, trailOf(world, areaId).find((a) => a.kind === "settlement")?.id);
// A line said aloud in the speaker's own voice (voice.ts `speak`, in the background), as loud as they are near the party: nothing past
// HEAR_SQUARES, or with voices off. Resolves when it has been heard.
const HEAR_SQUARES = 12;
function voiceLine(o: Occupant, text: string, far: number): Promise<void> | undefined {
  if (!(far < HEAR_SQUARES) || !voicePrefs().voice) return undefined;
  const heard = speak(text, { id: o.id, name: o.name, species: o.species, role: o.role, gender: genderOf(o), creature: o.creature, disposition: o.disposition }, { ambient: true, gain: Math.min(1, 1.25 - far / HEAR_SQUARES) });
  // (never waited on for longer than a slow reading of it, whatever the sound does)
  return Promise.race([heard, new Promise<void>((done) => setTimeout(done, (4 + text.split(/\s+/).length * 0.6) * 1000))]);
}

// The campaign clock, in minutes (shared/logic "Time"). Play keeps it; the map lights the scene by it.
export const useClock = create<{ minutes: number; set: (minutes: number) => void }>((set) => ({
  minutes: START_TIME,
  set: (minutes) => set({ minutes }),
}));
// A district's loading screen (BuildingScene): how many of its kinds of room have been got ready, of how many (none: no screen); and
// the districts got ready this session, which do not show it again
export const useWarmup = create<{ total: number; done: number }>(() => ({ total: 0, done: 0 }));
const READY_DISTRICTS = new Set<string>();
// The minute between the clock's ticks (a minute passes each real second while the clock runs), for what is
// drawn moving by the clock: a ship coming down into its berth, the doors of its hangar
let tickedAt = performance.now();
useClock.subscribe((state, before) => { if (state.minutes !== before.minutes) tickedAt = performance.now(); });
// (a test may hold it at a minute of its own, `window.__minuteAt`, to look at a ship coming or going a step at a time)
const minuteNow = () => (typeof window !== "undefined" ? (window as unknown as { __minuteAt?: number }).__minuteAt : undefined) ?? useClock.getState().minutes + Math.min(1, (performance.now() - tickedAt) / 1000);

// The sky and the light over a place on a planet's surface, by the hour: a blue sky by day, warm
// light at dawn and dusk, and a dark sky with faint blue moonlight at night
const NIGHT_SKY = new THREE.Color("#05070c");
const DAY_SKY = new THREE.Color("#5d7fa3");
const DUSK_SKY = new THREE.Color("#b8683f");
// With the look of the place (scenery.tsx WorldSky): the dome, the suns, moons and clouds, and the land on the horizon, in place of a plain
// background colour; `ground` is the height of the ground the horizon's land stands on
function Sky({ shadow = 30, cast = true, indoors = 0, look, ground = 0, fog, floor = true, under = false }: { shadow?: number; cast?: boolean; indoors?: number; look?: WorldLook | null; ground?: number; fog?: [number, number]; floor?: boolean; under?: boolean }) {
  const lite = useQuality((q) => q.tier === "lite");
  const minutes = useClock((c) => Math.round(c.minutes / 5) * 5);
  const light = daylight(minutes);
  const twilight = light > 0 && light < 1;
  // (the street lamps are lit from dusk to dawn: siteAssets.tsx LampLights)
  useEffect(() => { useLamps.setState({ lit: light < 0.3 }); }, [light < 0.3]);
  const background = under ? new THREE.Color(UNDER_FOG[0]).multiplyScalar(0.35 + 0.65 * light) : NIGHT_SKY.clone().lerp(DAY_SKY, light).lerp(DUSK_SKY, twilight ? 0.35 * (1 - Math.abs(light - 0.5) * 2) : 0);
  // The sun's light moves with the instant, not with the five minutes the rest of the sky is drawn for (the user, 2026-10-28: the sun and moon
  // jumped from place to place)
  const sunLight = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    if (!sunLight.current || !(light > 0)) return;
    const a = ((hourOf(minuteNow()) - 6) / 12) * Math.PI;
    sunLight.current.position.set(Math.cos(a) * 30, Math.max(6, Math.sin(a) * 30), 14);
  });
  // The sun crosses from east to west over the day; at night the moon stands high
  const angle = ((hourOf(minutes) - 6) / 12) * Math.PI;
  const sun: V3 = light > 0 ? [Math.cos(angle) * 30, Math.max(6, Math.sin(angle) * 30), 14] : [-10, 30, 8];
  // The night's light (2026-11-01, the user: everything was too lit): half what it was under a full moon, less under the other phases down to
  // about a third of that under a new one (the moons' phases: shared/logic moonlight); indoors the moons do not count, only the half
  const lunar = look ? moonlight(minutes, look.moons) : 0;
  const night = THREE.MathUtils.lerp(0.5 * (0.35 + 0.65 * lunar), 0.5, indoors);
  return (
    <>
      <color attach="background" args={[background]} />
      {/* (under the sea: the water's colour closes in, the light comes down green-blue) */}
      {under && <fog attach="fog" args={[background, UNDER_FOG[1], UNDER_FOG[2]]} />}
      {look && !under && <WorldSky look={look} light={light} hour={(minutes / 60) % 24} now={() => hourOf(minuteNow())} clock={minuteNow} ground={ground} lite={lite} fog={fog} floor={floor} />}
      <ambientLight intensity={(0.42 * night + (0.75 - 0.42 * night) * light) * (1 - 0.5 * indoors)} color={under ? "#9fe0e6" : light < 0.3 ? "#a9b8ff" : "#ffffff"} />
      <directionalLight ref={sunLight} position={sun} intensity={(0.24 * night + (0.9 - 0.24 * night) * light) * (1 - 0.6 * indoors)} color={twilight ? "#ffb27a" : light ? "#fff6e6" : "#8fa6ff"} castShadow={cast && light > 0} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-shadow} shadow-camera-right={shadow} shadow-camera-top={shadow} shadow-camera-bottom={-shadow} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Plain solids for what is built round the models (walls, slabs, rails, ladders, posts). The
// models themselves (people, droids, creatures, furniture, ships, vehicles, buildings) are in
// models.tsx.
// ---------------------------------------------------------------------------------------------

type V3 = [number, number, number];
const Solid = ({ at, color, glow, rot, solid, material, children }: { at: V3; color: string; glow?: number; rot?: V3; solid?: boolean; material?: ReactNode; children: ReactNode }) => {
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m || !solid) return;
    AIM.solids.add(m);
    return () => { AIM.solids.delete(m); };
  }, [solid]);
  return (
    <mesh ref={mesh} position={at} rotation={rot} castShadow>
      {children}
      {material ?? <meshLambertMaterial color={color} emissive={color} emissiveIntensity={glow ?? 0.08} />}
    </mesh>
  );
};
// An unseen box that the crosshair and the hook's line strike (a closed room's block seen from outside: what is drawn of it has no hit-box of its own)
const AimBox = ({ at, size }: { at: V3; size: V3 }) => {
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    AIM.solids.add(m);
    return () => { AIM.solids.delete(m); };
  }, []);
  return <mesh ref={mesh} position={at} visible={false}><boxGeometry args={size} /></mesh>;
};
// A box; with `wall` it is a plain room's wall, textured from its wall set (siteAssets `wallSet`)
const Box = ({ at, size, color, glow, rot, solid, wall }: { at: V3; size: V3; color: string; glow?: number; rot?: V3; solid?: boolean; wall?: WallSet }) =>
  wall ? (
    <Solid at={at} color={color} rot={rot} solid={solid} material={<WallMaterial set={wall} tint={color} />}><WallGeometry size={size} at={at} /></Solid>
  ) : (
    <Solid at={at} color={color} glow={glow} rot={rot} solid={solid}><boxGeometry args={size} /></Solid>
  );
const Cyl = ({ at, r, h, color, glow, top = r }: { at: V3; r: number; h: number; color: string; glow?: number; top?: number }) => <Solid at={at} color={color} glow={glow}><cylinderGeometry args={[top, r, h, 18]} /></Solid>;
// A balustrade run: a top rail, a lower one and posts, in pale steel. The one a walkway, a balcony and a gallery have, seen from outside and from
// within alike (from within it was a wall of the building's texture: 2026-11-01, the user). `at` is the middle of the run on the floor plan.
const RAIL = "#c8ccd2";
const Balustrade = ({ at, length, along, h = 1, base = 0 }: { at: [number, number]; length: number; along: "x" | "z"; h?: number; base?: number }) => {
  const x = along === "x";
  const posts = Math.max(2, Math.round(length / 0.9) + 1);
  const on = (u: number, y: number): V3 => (x ? [u, y, 0] : [0, y, u]);
  return (
    <group position={[at[0], base, at[1]]}>
      <Box at={on(0, h)} size={x ? [length, 0.05, 0.06] : [0.06, 0.05, length]} color={RAIL} />
      <Box at={on(0, h * 0.5)} size={x ? [length, 0.03, 0.03] : [0.03, 0.03, length]} color={RAIL} />
      {Array.from({ length: posts }, (_, i) => <Box key={i} at={on(-length / 2 + (i * length) / (posts - 1), h / 2)} size={[0.05, h, 0.05]} color={RAIL} />)}
    </group>
  );
};
const Mast = ({ at, h = 2.2 }: { at: V3; h?: number }) => (
  <>
    <Cyl at={[at[0], at[1] + h / 2, at[2]]} r={0.06} h={h} color="#d7d2c4" />
    <Box at={[at[0], at[1] + h * 0.75, at[2]]} size={[0.5, 0.06, 0.06]} color="#d7d2c4" />
    <Box at={[at[0], at[1] + h * 0.5, at[2]]} size={[0.36, 0.06, 0.06]} color="#d7d2c4" />
  </>
);
// Wall colour by the world the place stands on
const WALLS: Record<string, string> = { desert: "#c9a56e", ice: "#cfd8dc", urban: "#8a94a3", volcanic: "#6b5a55", forest: "#a69f80", jungle: "#9aa080", swamp: "#8f9278", ocean: "#b8c4c8", barren: "#a59c8f", temperate: "#b9ad96", "gas giant": "#8f98a8" };
const GROUND: Record<string, string> = { desert: "#4a3a22", ice: "#39505c", urban: "#1c222b", volcanic: "#2a1a18", forest: "#1f3324", jungle: "#1a3a22", swamp: "#252f22", ocean: "#12303d", barren: "#33302c", temperate: "#26361f", "gas giant": "#1d2233" };
const STEEL = "#7b8794";

const isLarge = (size?: string) => /large|huge|gargantuan/i.test(size ?? "");
// How far a person's seat is over their feet (the legs turn at 0.56 in `buildHumanoid`; the seat is a little under the hip joint)
const RIDER_HIPS = 0.5;
// A water craft on the water (shared/logic "Over the water"): how far its model sits under the face of the water (it is drawn standing
// 0.28 up, on its repulsors), and the seat of whoever is at its helm
const BOAT_FLOAT = -0.22;
// How far out past the ground of a place on the water a craft can be taken (squares)
const BOAT_REACH = 14;

// A name that turns to face whoever is looking
// Names are sized to be read from above; from the character's eyes they are a third as large (the crosshair names what it is on)
// The other members of a co-op game who stand in this place, as figures that walk to where they were last seen (lib/coop shares where each stands)
// A figure that goes down into a crouch or onto its belly, and gets up again, eased (`to`: 0 standing, 1 crouched, 2 prone; the head the way it faces)
// (since 2026-10-30 the figure itself bends its knees and lies down: its joints, interiors/limbs.ts humanPose; this tells it which, and with
// `act` what else it is doing: a fight's figures aim, fire, strike and flinch)
function Posture({ to, act, children }: { to: number; act?: { current: Motion }; children: ReactNode }) {
  const own = useRef<Motion>(motion());
  const m = act ?? own;
  m.current.posture = (to === 3 ? 3 : to === 2 ? 2 : to === 1 ? 1 : 0);
  return <MotionContext.Provider value={m}>{children}</MotionContext.Provider>;
}
// The motions of a turn-based fight's figures, by combatant: each is ready for the fight, and the log says who attacks (a shot's kick, a blade's
// strike) and who is hit (a flinch). An attack's line begins with the attacker's name ("X attacks Y with ...", "X hits Y with ...")
function useFightMotions(combatants: Combatant[]) {
  const map = useRef(new Map<string, { current: Motion }>());
  const of = (id: string | number) => {
    let m = map.current.get(String(id));
    if (!m) { m = { current: motion({ ready: true }) }; map.current.set(String(id), m); }
    return m;
  };
  const people = useRef(combatants);
  people.current = combatants;
  useEffect(() => {
    let seen = useCombat.getState().combatLog.length;
    return useCombat.subscribe((st) => {
      if (st.combatLog.length < seen) seen = 0;
      const lines = st.combatLog.slice(seen);
      seen = st.combatLog.length;
      const now = nowSeconds();
      const byLength = [...people.current].sort((a, b) => b.name.length - a.name.length);
      for (const line of lines) {
        const who = byLength.find((c) => line.startsWith(`${c.name} `));
        if (!who || !/^\S.*? (attacks|hits|fires|sprays|unloads on|swings|strikes|slashes|shoots) /.test(line.slice(0, who.name.length + 16))) continue;
        const m = of(who.id).current;
        m.firedAt = now;
        m.swingAt = now;
        m.swing++;
        m.kick = kickOf(who.rangedWeapon ?? "", 0);
        const rest = line.slice(who.name.length);
        const struck = / hits /.test(rest.slice(0, 7)) ? byLength.find((c) => c.id !== who.id && rest.includes(` ${c.name}`)) : undefined;
        if (struck) of(struck.id).current.hitAt = now + 0.2;
      }
    });
  }, []);
  return of;
}
// A companion in a seat of a craft (models.tsx CraftCrew)
const crewOf = (c: Companion): CrewMember => ({ kind: tokenOf({ name: c.name, role: c.kind === "droid" ? "utility droid" : c.role, creature: c.creature }), name: c.name, species: c.species, role: c.role, creature: c.creature, size: c.size, modules: c.kind === "droid" ? c.custom : undefined, ring: SIDE_COLORS.friendly });
// The craft a player is at the helm of, said in a line for the other players (co-op `pos`), and read back
const rideKey = (v: PartyVehicle) => [v.look ?? "", v.model, v.seats ?? "", v.name].join("|").slice(0, 90);
const rideOf = (key?: string) => {
  if (!key) return null;
  const [look, model, seats, name] = key.split("|");
  return { look: look || undefined, model: model || "Landspeeder", seats: Number(seats) || undefined, name: name || model };
};
// (`water`: the place's water, for a player at the helm of a craft, drawn in it on the water)
function PeerFigure({ name, color, peer, here, water }: { name: string; color: string; peer?: Peer; here: string; water?: "sea" | "under" | null }) {
  const group = useRef<THREE.Group>(null);
  const yaw = useRef<number | null>(null);
  const at = useRef<{ x: number; y: number; h: number } | null>(null);
  const ride = useMemo(() => rideOf(peer?.r), [peer?.r]);
  useFrame((_, dt) => {
    if (!group.current || !peer || peer.a !== here) return void (group.current && (group.current.visible = false));
    if (!at.current) at.current = { x: peer.x, y: peer.y, h: peer.h ?? 0 };
    const k = Math.min(1, dt * 12);
    at.current.x += (peer.x - at.current.x) * k;
    at.current.y += (peer.y - at.current.y) * k;
    at.current.h += ((peer.h ?? 0) - at.current.h) * Math.min(1, dt * 16);
    group.current.visible = true;
    group.current.position.set(at.current.x + 0.5, at.current.h + (ride ? (water === "under" ? UNDER_SWIM_Y : SEA_Y) + BOAT_FLOAT : 0), at.current.y + 0.5);
    // turns the short way round to the way they face
    const want = peer.f || 0;
    if (yaw.current === null) yaw.current = want;
    const turn = Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current));
    yaw.current += turn * Math.min(1, dt * 14);
    group.current.rotation.y = yaw.current;
  });
  return (
    <group ref={group} visible={false} raycast={() => null}>
      {ride ? (
        <SpeederModel model={ride.model} look={ride.look} name={ride.name} seats={ride.seats} crew={[{ kind: "player", ring: color, name }]} />
      ) : (
        <Posture to={peer?.s ?? 0}>
          <Figure kind="player" ring={color} name={name} marker />
        </Posture>
      )}
    </group>
  );
}
// The companions and beasts of another member, walking behind them on this screen (their owner's screen draws them for real)
function PeerPets({ pets, who, here, open, height }: { pets: Pet[]; who: string; here: string; open: (x: number, y: number) => boolean; height: () => number }) {
  const feet = useRef({ x: 0, y: 0 });
  useFrame(() => {
    const spot = useCoop.getState().peers[who];
    if (spot && spot.a === here) feet.current = { x: spot.x, y: spot.y };
  });
  return (
    <>
      {pets.map((p, i) => (
        <Follower key={`${here}:${who}:${p.id}`} companion={{ ...p, id: `${who}-${p.id}` } as unknown as Companion} index={i + 3} feet={feet} open={open} height={height} />
      ))}
    </>
  );
}
function CoopPeers({ hereId, open, height, water }: { hereId: string; open: (x: number, y: number) => boolean; height: () => number; water?: "sea" | "under" | null }) {
  const members = useCoop((s) => s.members);
  const me = useCoop((s) => s.me);
  const peers = useCoop((s) => s.peers);
  return (
    <>
      {members.filter((m) => m.id !== me && m.connected && m.areaId === hereId).map((m) => (
        <group key={m.id}>
          <PeerFigure name={m.name} color={m.color} peer={peers[m.id]} here={hereId} water={water} />
          {peers[m.id]?.a === hereId && !!m.pets?.length && <PeerPets pets={m.pets} who={m.id} here={hereId} open={open} height={height} />}
        </group>
      ))}
    </>
  );
}

const Label = ({ at, size = 0.34, color = "white", children }: { at: V3; size?: number; color?: string; children: string }) => {
  const eyes = useView((v) => v.eyes);
  const fontSize = eyes ? size * 0.32 : size;
  return (
    <Billboard position={at}>
      <Text fontSize={fontSize} color={color} anchorX="center" anchorY="middle" outlineWidth={fontSize * 0.08} outlineColor="#000000">
        {children}
      </Text>
    </Billboard>
  );
};

// Something to tap that is easier to hit than what is drawn. It is also what the crosshair of the first-person and shoulder views can
// aim at (interiors/aim.ts): `label` says what it is, and the action key calls `onTap` as a tap does
// `person`: someone standing there; a tap under the pointer goes to them before anything else it passes through (2026-10-26: a bench in
// front of a disabled droid took every tap meant for the droid, and the party walked to the bench instead)
const Hit = ({ at, size, onTap, label, plan, person = false }: { at: V3; size: V3; onTap: () => void; label?: string; plan?: () => AimPlan; person?: boolean }) => {
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    m.userData.aim = { label, onTap, plan };
    m.userData.person = person;
    AIM.targets.add(m);
    return () => { AIM.targets.delete(m); };
  });
  return (
    <mesh ref={mesh} position={at} onClick={(e) => {
      if (!person && e.intersections.some((i) => i.object !== mesh.current && i.object.userData?.person)) return;
      e.stopPropagation();
      if (e.delta <= 8) onTap();
    }}>
      <boxGeometry args={size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
};
// A figure that turns to where the camera looks (over the shoulder) and is not drawn from the eyes
const Turner = ({ facing, on, base, hide, children }: { facing: { current: number | null }; on: boolean; base: number; hide: boolean; children: ReactNode }) => {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    g.current.visible = !hide;
    g.current.rotation.y = on && facing.current !== null ? facing.current - base : 0;
  });
  return <group ref={g}>{children}</group>;
};

// Walls drawn as groups (a rounded corner): they block the view and the shot as the boxes do
const Solids = ({ children }: { children: ReactNode }) => {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    AIM.solids.add(g);
    return () => { AIM.solids.delete(g); };
  }, []);
  return <group ref={group}>{children}</group>;
};

const WOOD = "#8b5e3c";
const WOOD_DARK = "#5f3f28";
const DARK = "#27303b";
const GLOW = "#5ad1ff";
const AMBER = "#f0a03c";

// The painted berth of a ship that is not in it: one out on a voyage (its pilot is off with it), the place it
// will come back to, or one kept for visitors, so that a hangar is not drawn empty without saying why
function Berth({ w, h, name, note }: { w: number; h: number; name: string; note: string }) {
  return (
    <>
      <Box at={[w / 2, 0.02, h / 2]} size={[w, 0.04, h]} color="#2f3a45" />
      {[[0.1, 0.1], [w - 0.1, 0.1], [0.1, h - 0.1], [w - 0.1, h - 0.1]].map(([x, z], i) => <Box key={i} at={[x, 0.08, z]} size={[0.5, 0.06, 0.5]} color="#f5d342" />)}
      <Label at={[w / 2, 0.9, h / 2]} size={0.34} color="#f5d342">{`${name}: ${note}`}</Label>
    </>
  );
}

// What a berth of a hangar shows: its ship, which comes in or goes out by the clock (the minute between ticks, see `bayBerth`), or the
// painted berth. `rise` is how high it goes to be clear of the roof. Going out it lifts clear of the roof, then pitches its bow (+x) up
// and climbs away, faster and faster, until it is out of sight; coming in it is the same flight the other way: in from far off astern,
// bow down, levelling out over its berth and settling (2026-10-26, the user: ships vanished once they were over the building)
const BAY_CLIMB = 0.35; // the share of the move spent straight up out of the roof
const BAY_FAR = 260; // how far off (squares) a ship is when it is gone from sight
function BayBerth({ room, asset, based, ceiling, rise: up = 8 }: { room: Pick<Area, "id" | "ships">; asset: RoomAsset; based?: Ship[]; ceiling?: number; rise?: number }) {
  const group = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const [shown, setShown] = useState(() => bayBerth(room, asset, based, minuteNow()));
  const was = useRef("");
  const keyOf = (b: ReturnType<typeof bayBerth>) => `${b.ship?.id ?? ""}|${b.away}`;
  useFrame(() => {
    const b = bayBerth(room, asset, based, minuteNow());
    const g = group.current;
    if (g) {
      if (b.lift <= BAY_CLIMB) {
        g.position.set(0, (b.lift / BAY_CLIMB) * up, 0);
        if (pivot.current) pivot.current.rotation.z = 0;
      } else {
        const t = (b.lift - BAY_CLIMB) / (1 - BAY_CLIMB);
        const away = t * t * BAY_FAR;
        // out along the bow going, in from astern coming
        g.position.set((b.leaving ? 1 : -1) * away, up + away * 0.45, 0);
        if (pivot.current) pivot.current.rotation.z = (b.leaving ? 1 : -1) * Math.min(0.55, t * 2.2);
      }
      g.visible = b.lift < 0.97;
    }
    if (keyOf(b) !== (was.current || keyOf(shown))) setShown(b);
    was.current = keyOf(b);
  });
  return (
    <>
      <group ref={group}>
        {/* the ship turns about its middle */}
        <group ref={pivot} position={[asset.w / 2, 0, asset.h / 2]}>
          <group position={[-asset.w / 2, 0, -asset.h / 2]}>{shown.ship && <ShipModel ship={shown.ship} w={asset.w} h={asset.h} ceiling={ceiling} />}</group>
        </group>
      </group>
      {!shown.ship && <Berth w={asset.w} h={asset.h} name={asset.name} note={shown.away ? "away on a voyage" : "free for visiting ships"} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// A room on its grid of 5-foot squares: the floor, walls cut down to waist height so that the
// room can be looked into, what is set in the walls, and what stands on the floor.
// ---------------------------------------------------------------------------------------------

// A floor of a building is this many squares of height (2026-10-19: 40% more than it was, 2,
// so that the tallest species stands in a room); a room stands on the floor of its level
// (a gallery on half of one), and a stairwell, lift or ladder rises from its lower level.
// A room with a mezzanine (`layout.tall`) is two floors high
// (a storey was 2.8 and a room's walls 2.4 until 2026-10-30; the user: "ceiling and roof textures are too low (when using over the shoulder
// view, the ceiling obscures the view when the player looks down)": now 3.4 and 3.0, and the camera keeps under the ceiling, aim.ts `roof`)
export const LEVEL_H = 3.4;
const levelY = (l?: Pick<RoomLayout, "level">) => (l?.level ?? 0) * LEVEL_H;
const rise = (l?: Pick<RoomLayout, "climb">) => (l?.climb ? l.climb.levels * LEVEL_H : 0);
// How far up the floor of a way between floors is at a point of it (squares from the room's
// north-west corner, the middle of a square being half way into it): evenly up a flight, lift or
// ladder, up one lane of a switchback to its landing and back along the other (shared/logic climbAt)
const rampAt = (l: RoomLayout, x: number, y: number) => climbAt(l, x, y) * rise(l);
// Where the soles of someone standing at a point of a room are, in the building's own height
const floorAt = (l: RoomLayout, x: number, y: number) => levelY(l) + rampAt(l, x, y);
const sameFootprint = (a: RoomLayout, b: RoomLayout) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// The steps of a stairwell, or the rungs of a ladder, rising from one end of a room to the other;
// they are looked at, not tapped (the floor under them takes the tap)
// `rock` (a cave's stairs) draws the steps as the cave's rock instead of boxes
function Ascent({ w, h, toward, up, form, switchback, ramp, onTap, rock }: { w: number; h: number; toward: "n" | "e" | "s" | "w"; up: number; form: string; switchback?: RoomLayout["switchback"]; ramp?: boolean; onTap?: (x: number, y: number) => void; rock?: { biome: string } }) {
  if (switchback) return <Switchback w={w} h={h} toward={toward} up={up} low={switchback.low} ramp={ramp} onTap={onTap} rock={rock} />;
  const along = toward === "e" || toward === "w" ? w : h;
  const across = toward === "e" || toward === "w" ? h : w;
  const count = Math.max(4, Math.round(along * (form === "ladder" ? 3 : 2.4)));
  const sign = toward === "e" || toward === "s" ? 1 : -1;
  const place = (t: number, height: number): V3 => {
    const d = (toward === "e" || toward === "w" ? w : h) * t * sign + (sign > 0 ? 0 : along);
    return toward === "e" || toward === "w" ? [d, height, h / 2] : [w / 2, height, d];
  };
  const none = () => null;
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const t = (i + 0.5) / count;
        const top = (up * (i + 1)) / count;
        if (form === "ladder") {
          return (
            <mesh key={i} position={place(t, top)} raycast={none}>
              <boxGeometry args={toward === "e" || toward === "w" ? [0.06, 0.06, across * 0.55] : [across * 0.55, 0.06, 0.06]} />
              <meshLambertMaterial color="#c8ccd2" />
            </mesh>
          );
        }
        const size: V3 = toward === "e" || toward === "w" ? [along / count + 0.01, Math.max(0.05, top), across * 0.92] : [across * 0.92, Math.max(0.05, top), along / count + 0.01];
        if (rock) return <CaveSlab key={i} at={place(t, top / 2)} size={size} biome={rock.biome} variant={i} />;
        return (
          <mesh key={i} position={place(t, top / 2)} raycast={none} receiveShadow castShadow>
            <boxGeometry args={size} />
            <meshLambertMaterial color={form === "lift" ? "#5a6b7a" : i % 2 ? "#8b8f96" : "#9aa0a8"} />
          </mesh>
        );
      })}
    </group>
  );
}

// The two flights of a switchback and its landing (a stair block's way up or down a floor, see shared/logic "Stair blocks"): treads
// along each lane at the height the floor is there (climbAt), the landing flat across the far row, and a wall between the flights
// with a rail along it, up to the landing
// (`ramp`: a slope, the pit's ramps: thin slices that read as one surface, in packed earth)
function Switchback({ w, h, toward, up, low, ramp, onTap, rock }: { w: number; h: number; toward: "n" | "e" | "s" | "w"; up: number; low: 0 | 1; ramp?: boolean; onTap?: (x: number, y: number) => void; rock?: { biome: string } }) {
  const none = () => null;
  const plan = { width: w, height: h, climb: { toward, levels: 1 }, switchback: { low } };
  const ew = toward === "e" || toward === "w";
  const along = ew ? w : h;
  const TREADS = ramp ? 10 : 3;
  // (a tap on a tread walks to its square: the floor under the flights is far below it)
  const treads: { at: V3; size: V3; top: number; sq: [number, number] }[] = [];
  for (let lane = 0; lane < 2; lane++) {
    for (let k = 0; k < along * TREADS; k++) {
      const a = (k + 0.5) / TREADS;
      const [px, py] = ew ? [a, lane + 0.5] : [lane + 0.5, a];
      const top = Math.max(0.04, climbAt(plan, px, py) * up);
      treads.push({ at: [px, top / 2, py], size: ew ? [1 / TREADS + 0.01, top, 0.92] : [0.92, top, 1 / TREADS + 0.01], top, sq: [Math.floor(px), Math.floor(py)] });
    }
  }
  // The wall between the flights runs from the near end to the landing, as high as the higher flight there and a rail more
  const run = along - 1;
  const near = toward === "e" || toward === "s" ? 0 : along;
  const sign = toward === "e" || toward === "s" ? 1 : -1;
  const wall = Array.from({ length: run }, (_, i) => {
    const mid = near + sign * (i + 0.5);
    const tall = Math.max(climbAt(plan, ew ? mid : 0.5, ew ? 0.5 : mid), climbAt(plan, ew ? mid : 1.5, ew ? 1.5 : mid)) * up + 0.9;
    return { at: (ew ? [mid, tall / 2, 1] : [1, tall / 2, mid]) as V3, size: (ew ? [1.01, tall, 0.06] : [0.06, tall, 1.01]) as V3 };
  });
  return (
    <group>
      {treads.map((t, i) => (rock ? (
        <CaveSlab key={i} at={t.at} size={t.size} biome={rock.biome} variant={i} onTap={onTap ? () => onTap(t.sq[0], t.sq[1]) : undefined} />
      ) : (
        <mesh key={i} position={t.at} raycast={onTap ? undefined : none} receiveShadow castShadow onClick={onTap ? (e) => { e.stopPropagation(); if (e.delta <= 8) onTap(t.sq[0], t.sq[1]); } : undefined}>
          <boxGeometry args={t.size} />
          <meshLambertMaterial color={ramp ? "#7a6447" : i % 2 ? "#8b8f96" : "#9aa0a8"} />
        </mesh>
      )))}
      {wall.map((p, i) => (rock ? <CaveSlab key={`w${i}`} at={p.at} size={p.size} biome={rock.biome} variant={i + 1} /> : <Box key={`w${i}`} at={p.at} size={p.size} color="#c8ccd2" />))}
    </group>
  );
}

// Two panels of a roof that slide apart and together: the door of a hangar on a world whose air is no good
// to breathe, over the ships inside. They are open only for a ship coming or going (`door`, from 0 to 1, is
// read each frame from the clock).
// The roof of a hangar opens from its middle. Each half is three telescoping sections: as it opens the sections slide toward the wall
// and each rises a little over the one below, so they nest and no section reaches past the building. (`door` is how open the roof is:
// 0 shut, 1 open.)
function HangarRoof({ width, height, y, door }: { width: number; height: number; y: number; door: () => number }) {
  const sections = useRef<(THREE.Group | null)[]>([]);
  const span = width / 2 / 3;
  useFrame(() => {
    const open = door();
    for (let side = 0; side < 2; side++) {
      const wall = side === 0 ? 0 : width;
      const sign = side === 0 ? 1 : -1;
      for (let k = 0; k < 3; k++) {
        const g = sections.current[side * 3 + k];
        if (!g) continue;
        // shut, a section sits in its third of the half (k 0 at the wall, 2 at the middle); open, all three are at the wall's third
        const shut = wall + sign * (k + 0.5) * span;
        const opened = wall + sign * span / 2;
        g.position.x = shut + (opened - shut) * open;
        g.position.y = y + k * 0.16 * open;
      }
    }
  });
  return (
    <>
      {[0, 1].map((side) =>
        [0, 1, 2].map((k) => (
          <group key={`${side}-${k}`} ref={(el) => { sections.current[side * 3 + k] = el; }} position={[(side === 0 ? 1 : -1) * (k + 0.5) * span + (side === 0 ? 0 : width), y, height / 2]}>
            <Box at={[0, 0, 0]} size={[span - 0.03, 0.14, height + 0.1]} color="#59636d" />
            <Box at={[0, 0.1, 0]} size={[span - 0.2, 0.06, height - 0.3]} color="#3a434c" />
          </group>
        )),
      )}
    </>
  );
}

// A flight of stairs set in a room's floor, up to a gallery or down from it; where the stairwell is wide enough for two flights (2 by 3
// or more), a switchback: up the first half, round a landing, and back along the second to the floor above. The stairwell lies along its
// longer side (a quarter turn for one that is wider than it is deep)
function StairsAsset({ w, h, up, rock }: { w: number; h: number; up: boolean; rock?: { biome: string } }) {
  const none = () => null;
  const turned = w > h;
  const [C, L] = turned ? [h, w] : [w, h];
  const switchback = C >= 2 && L >= 3;
  const rise = LEVEL_H / 2;
  // A run of steps across `width`, from z = `from` to z = `to`, rising from `low` to `high`
  const steps = (x0: number, width: number, from: number, to: number, low: number, high: number, n: number, key: string) =>
    Array.from({ length: n }, (_, i) => {
      const top = up ? low + (high - low) * ((i + 1) / n) : 0.04;
      const z = from + (to - from) * ((i + 0.5) / n);
      if (rock) return <CaveSlab key={`${key}${i}`} at={[x0 + width / 2, top / 2 + 0.02, z]} size={[width * 0.9, Math.max(0.04, top), Math.abs(to - from) / n + 0.01]} biome={rock.biome} variant={i} />;
      return (
        <mesh key={`${key}${i}`} position={[x0 + width / 2, top / 2 + 0.02, z]} raycast={none}>
          <boxGeometry args={[width * 0.9, Math.max(0.04, top), Math.abs(to - from) / n + 0.01]} />
          <meshLambertMaterial color={up ? "#9aa0a8" : "#2c3138"} />
        </mesh>
      );
    });
  // A doorway at the foot of a flight and at its top (the user's rule: every flight of stairs has one at each end)
  const frame = (z: number, base: number, key: string) => (
    <group key={key}>
      <Box at={[0.05, base + 1.0, z]} size={[0.07, 2.0, 0.07]} color="#c8ccd2" />
      <Box at={[C - 0.05, base + 1.0, z]} size={[0.07, 2.0, 0.07]} color="#c8ccd2" />
      <Box at={[C / 2, base + 2.0, z]} size={[C, 0.08, 0.08]} color="#c8ccd2" />
    </group>
  );
  const body = switchback ? (
    <>
      {steps(0, C / 2, L, 0.6, 0, rise / 2, Math.max(3, Math.round(L * 1.3)), "a")}
      {/* The landing at the far end, and the second flight rising back to the floor above */}
      {up && <mesh position={[C / 2, rise / 4 + 0.02, 0.3]} raycast={none}><boxGeometry args={[C * 0.9, rise / 2, 0.6]} /><meshLambertMaterial color="#9aa0a8" /></mesh>}
      {steps(C / 2, C / 2, 0.6, L, rise / 2, rise, Math.max(3, Math.round(L * 1.3)), "b")}
      <Box at={[C / 2, 0.45, L / 2]} size={[0.05, 0.9, L]} color="#c8ccd2" />
    </>
  ) : (
    <>
      {steps(0, C, L, 0, 0, rise, Math.max(3, Math.round(L * 2.4)), "s")}
      {up && frame(L - 0.04, 0, "foot")}
      {up && frame(0.04, rise, "top")}
    </>
  );
  return (
    <group position={turned ? [0, 0, C] : undefined} rotation={turned ? [0, Math.PI / 2, 0] : undefined}>
      {body}
      <Box at={[0.02, 0.45, L / 2]} size={[0.05, 0.9, L]} color="#c8ccd2" />
      <Box at={[C - 0.02, 0.45, L / 2]} size={[0.05, 0.9, L]} color="#c8ccd2" />
    </group>
  );
}

const FLOORS: Record<FloorKind, string> = { plating: "#1d2530", hangar: "#232a31", sand: "#8f7447", rock: "#3a3835", stone: "#45423d", clay: "#4a3a2d" };
const WAY_COLORS = { door: "#f59e0b", locked: "#f87171", exit: "#4ade80", secret: "#c084fc", window: "#7dd3fc" };
const WALL_HEIGHT = 0.8;
const FULL_WALL_HEIGHT = 3.0;
// The rock roof of a cave in the eye views: highest over the middle of a chamber, lower towards its walls (CaveRoom caveShellGeometry)
const CAVE_ROOF = 3.5;
// The colour of a wall seen while another room is looked into (dimmed) or not
const dimWall = (wall: string, dim: boolean) => new THREE.Color(wall).multiplyScalar(dim ? 0.45 : 1).getStyle();
// An arena's tier (2026-11-02; the user: "Tiers should be mezzanine levels (the arena fighting floor AND combatants MUST remain visible from
// ALL tiers)"): a terrace round the open middle (`well`, the radius of the opening, in squares from the room's middle), a rail along its edge,
// and the outside wall round it, a storey high; the first tier's wall goes on down to the ground (`base`). Drawn in the room's squares.
function Terrace({ w, h, well, wall, base = 0, onTap }: { w: number; h: number; well: number; wall: string; base?: number; onTap?: (e: ThreeEvent<MouseEvent>) => void }) {
  const out = Math.min(w, h) / 2;
  return (
    <group position={[w / 2, 0, h / 2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow onClick={onTap}>
        <ringGeometry args={[well, out, 96, 1]} />
        <meshLambertMaterial color="#6f6a61" />
      </mesh>
      {/* The slab's edge over the open middle, and its underside */}
      <mesh position={[0, -0.12, 0]} raycast={() => null}>
        <cylinderGeometry args={[well, well, 0.28, 96, 1, true]} />
        <meshLambertMaterial color="#59544c" side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.26, 0]} raycast={() => null}>
        <ringGeometry args={[well, out, 96, 1]} />
        <meshLambertMaterial color="#4a463f" />
      </mesh>
      <RingRail r={well + 0.12} h={BALUSTRADE_HEIGHT} />
      {/* The outside wall, a storey high (the first tier's down to the ground) */}
      <mesh position={[0, (LEVEL_H - base) / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[out, out, LEVEL_H + base, 96, 1, true]} />
        <meshLambertMaterial color={wall} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
// A rail round a circle: posts every square or so, a top rail and a lower one (as the Balustrade's, bent round)
function RingRail({ r, h }: { r: number; h: number }) {
  const posts = Math.max(12, Math.round((Math.PI * 2 * r) / 1.1));
  return (
    <group>
      {Array.from({ length: posts }, (_, i) => {
        const a = (i / posts) * Math.PI * 2;
        return <Cyl key={i} at={[Math.cos(a) * r, h / 2, Math.sin(a) * r]} r={0.035} h={h} color="#aeb4bb" />;
      })}
      {[h, h * 0.45].map((y) => (
        <mesh key={y} rotation={[Math.PI / 2, 0, 0]} position={[0, y, 0]} raycast={() => null}>
          <torusGeometry args={[r, y === h ? 0.045 : 0.025, 6, Math.max(48, posts * 2)]} />
          <meshLambertMaterial color="#c8ccd2" />
        </mesh>
      ))}
    </group>
  );
}
// A gallery's balustrade: waist high to a figure, so that the floor below stays open to the ceiling
const BALUSTRADE_HEIGHT = 1.0;
const WALL_THICK = 0.16;
const isWay = (a: RoomAsset) => !!a.side && a.kind !== "window";
// Which sides of a gallery are its balustrade: the one opposite the wall it stands against (it runs flush with its host's wall there), so
// that the rail overlooks the room below. A gallery that stands clear of every wall rails its south side.
const railingOf = (gallery: Area, rooms: Area[]): string => {
  const host = rooms.find((r) => r.id === gallery.tags.find((t) => t.startsWith("host:"))?.slice(5));
  if (formOf(gallery) !== "gallery" || !gallery.layout || !host?.layout) return "";
  const g = gallery.layout;
  const h = host.layout;
  if (g.y === h.y) return "s";
  if (g.y + g.height === h.y + h.height) return "n";
  if (g.x === h.x) return "e";
  if (g.x + g.width === h.x + h.width) return "w";
  return "s";
};

// Where on a room's wall line something set in the wall sits (in the room's own squares), and
// how it is turned
const onWall = (layout: { width: number; height: number }, a: RoomAsset): { x: number; z: number; turn: number } =>
  a.side === "n" ? { x: a.x + 0.5, z: 0, turn: 0 } : a.side === "s" ? { x: a.x + 0.5, z: layout.height, turn: 0 } : a.side === "w" ? { x: 0, z: a.y + 0.5, turn: Math.PI / 2 } : { x: layout.width, z: a.y + 0.5, turn: Math.PI / 2 };

// A door, way out, secret way or window, drawn along x about the origin, its frame in the
// building's style (arched, rounded or square; round windows in hulls)
// (a window by its size: a slit, a small pane, a window one climbs through, a great window; shared/logic "Windows")
const PANE_SCALE: Record<string, V3> = { slit: [0.3, 1.35, 1], small: [0.6, 0.75, 1], large: [1, 1.5, 1], wide: [1.15, 1.8, 1] };
// Where a door, way out or window of a room's wall stands (2026-10-26): on the wall line (`outline`) across from its square, so on the
// curve of a round room; turned along the line there (the turn `onWall` gives on a straight side), and bent onto it where it curves
interface WayPlace {
  a: RoomAsset;
  s: number;
  at: [number, number];
  turn: number;
  bend?: Bend;
}
function wayPlace(line: Outline, width: number, height: number, a: RoomAsset): WayPlace {
  const side = a.side as FootSide;
  const s = outlineOf(line, width, height, side, side === "n" || side === "s" ? a.x : a.y);
  // the way the wall's own x runs along the line: the north and west sides with it, the south and east against it
  const sigma = side === "n" || side === "w" ? 1 : -1;
  const point = outlineAt(line, s);
  return { a, s, at: point.p, turn: Math.atan2(-sigma * point.t[1], sigma * point.t[0]), bend: bendOf(line, s, sigma) };
}
// Where a room stands against a round or oval room of its floor (a corridor to it, 2026-10-26, the user: "Corridors for round/oval
// buildings should meet the curved wall with a matching radius"): the stretch [a, b] of the room's side that the round room's bounding
// square shares (in the room's own squares), how far beyond that side the round room's curve lies at each point along it (`depth`), and
// where a door of the room on that stretch stands: on the round room's curve, as the round room's own door there does
interface Meet {
  side: FootSide;
  a: number;
  b: number;
  depth: (u: number) => number;
  place: (a: RoomAsset) => WayPlace | undefined;
}
const OPPOSITE: Record<FootSide, FootSide> = { n: "s", s: "n", e: "w", w: "e" };
function meetsOf(room: Area, rooms: Area[]): Meet[] {
  const l = room.layout;
  if (!l || l.shape || formOf(room) || l.mask) return [];
  const out: Meet[] = [];
  for (const other of rooms) {
    const m = other.layout;
    if (!m?.shape || other === room || (m.level ?? 0) !== (l.level ?? 0)) continue;
    const radii = shapeRadii(m.shape, m.width, m.height);
    const line = outline(m.width, m.height, radii);
    const sides: [FootSide, boolean][] = [["e", m.x === l.x + l.width], ["w", m.x + m.width === l.x], ["s", m.y === l.y + l.height], ["n", m.y + m.height === l.y]];
    for (const [side, touching] of sides) {
      if (!touching) continue;
      const across = side === "e" || side === "w";
      const [lo, hi] = across ? [Math.max(l.y, m.y), Math.min(l.y + l.height, m.y + m.height)] : [Math.max(l.x, m.x), Math.min(l.x + l.width, m.x + m.width)];
      if (hi - lo <= 0) continue;
      const start = across ? l.y : l.x;
      const otherStart = across ? m.y : m.x;
      const depth = (u: number) => insetAt(m.width, m.height, radii, OPPOSITE[side], u + start - otherStart);
      const shift: [number, number] = [m.x - l.x, m.y - l.y];
      const place = (a: RoomAsset): WayPlace | undefined => {
        if (a.side !== side) return undefined;
        const along = across ? a.y : a.x;
        if (along < lo - start || along >= hi - start) return undefined;
        const theirs = across ? { ...a, side: OPPOSITE[side], x: 0, y: along + start - otherStart } : { ...a, side: OPPOSITE[side], x: along + start - otherStart, y: 0 };
        const p = wayPlace(line, m.width, m.height, theirs as RoomAsset);
        return { ...p, a, at: [p.at[0] + shift[0], p.at[1] + shift[1]] };
      };
      out.push({ side, a: lo - start, b: hi - start, depth, place });
    }
  }
  return out;
}
// What fills the room out to the round room's curve beyond its side: a slab `height` high from `y` (the floor of the room looked into,
// or the body of its closed block), the room's side on one edge and the curve on the other
function MeetFill({ meet, width, height, y, h, color, wall }: { meet: Meet; width: number; height: number; y: number; h: number; color: string; wall?: WallSet }) {
  const geometry = useMemo(() => {
    const n = 16;
    const us = Array.from({ length: n + 1 }, (_, i) => meet.a + ((meet.b - meet.a) * i) / n);
    if (Math.max(...us.map(meet.depth)) < 0.01) return null;
    // points (x, z) of the room's plan: along its side, then back along the curve
    const at = (u: number, d: number): [number, number] => (meet.side === "e" ? [width + d, u] : meet.side === "w" ? [-d, u] : meet.side === "s" ? [u, height + d] : [u, -d]);
    const points = [...us.map((u) => at(u, 0)), ...[...us].reverse().map((u) => at(u, meet.depth(u)))];
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z))), { depth: h, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(Math.PI / 2);
    g.translate(0, h, 0);
    const uv = boxUV(g, 1 / WALL_TILE);
    g.dispose();
    return uv;
  }, [meet.side, meet.a, meet.b, width, height, h]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[0, y, 0]} castShadow receiveShadow>
      {wall ? <primitive attach="material" object={wallMaterial(wall, { tint: color })} /> : <meshLambertMaterial color={color} />}
    </mesh>
  );
}
// The square of wall a door or window is set in: whole but for the frame's outer outline (models.tsx `openingOutline`), so that only
// what is inside the frame is open (a window's square was open from the floor up, beside and under the frame, and an arched doorway's
// square open over the arch); bent onto a curved wall; `lift` raises the opening in a room whose floor climbs
function PiercedWall({ kind, pane, style, wallH, lift = 0, bend, color, wall }: { kind: RoomAsset["kind"]; pane?: RoomAsset["pane"]; style?: Style; wallH: number; lift?: number; bend?: Bend; color: string; wall: WallSet }) {
  const scale = kind === "window" ? PANE_SCALE[pane?.size ?? "small"] ?? [1, 1, 1] : undefined;
  const geometry = useMemo(() => {
    const hole = holeOf(openingOutline(kind, style, scale).map(([x, y]) => [x, y + lift] as [number, number]));
    const flat = piercedWall(hole, wallH, WALL_THICK);
    if (!flat) return null;
    const shaped = bend ? bend.apply(flat) : flat;
    if (shaped !== flat) flat.dispose();
    const textured = boxUV(shaped, 1 / WALL_TILE);
    shaped.dispose();
    return textured;
  }, [kind, style?.arch, style?.porthole, scale?.join(","), wallH, lift, bend?.key]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <Solids><mesh geometry={geometry} material={wallMaterial(wall, { tint: color })} castShadow receiveShadow /></Solids>;
}
// A doorway's leaf swings (or rolls up, for a hangar) when it is tapped, and shuts again when it is tapped once more. Its leaf is of what
// the room's walls are (`wall`, the room's wall set); `bend` lays it and its frame on a curved wall
function Doorway({ kind, color, label, onTap, style, pane, name = "", wall, tint, bend, rock }: { kind: RoomAsset["kind"]; color: string; label?: string; onTap?: () => void; style?: Style; pane?: RoomAsset["pane"]; name?: string; wall?: WallSet; tint?: string; bend?: Bend; rock?: { biome: string; tier: Tier; seed: number; outside?: boolean } }) {
  const [open, setOpen] = useState(false);
  const isDoor = kind === "door" || kind === "exit";
  // A cave's ways (2026-10-30, the user: "The entry to caves (a standard door) looks all wrong"): no frame and no leaf; the way out is an
  // arch of rock (with the dark of the cave behind it, seen from outside), a way between its rooms the rock's own opening
  if (rock && (isDoor || kind === "secret")) {
    return (
      <>
        {kind === "exit" && <RockArch biome={rock.biome} tier={rock.tier} seed={rock.seed} dark={!!rock.outside} />}
        {label && <Label at={[0, kind === "exit" ? 2.9 : 1.9, 0]} size={0.3} color={color}>{label}</Label>}
        {onTap && <Hit at={[0, 0.75, 0]} size={[1, 1.5, 0.9]} onTap={onTap} label={label ?? kind} />}
      </>
    );
  }
  const mode = /hangar|bay|dock/i.test(name) ? "rise" : "hinge";
  const metal = /hangar|bay|dock|gate|vault|cell|airlock/i.test(name);
  const tap = onTap ? () => { setOpen((o) => !o); onTap(); } : undefined;
  return (
    <>
      <Opening kind={kind} color={color} style={style} scale={kind === "window" && pane ? PANE_SCALE[pane.size] : undefined} bend={bend} />
      {isDoor && <DoorVoid style={style} bend={bend} />}
      {isDoor && <DoorLeaf open={open} mode={mode} metal={metal} style={style} wall={wall} tint={tint} bend={bend} />}
      {label && <Label at={[0, kind === "window" || kind === "secret" ? 1.2 : 1.9, 0]} size={0.3} color={color}>{label}</Label>}
      {tap && <Hit at={[0, 0.75, 0]} size={[1, 1.5, 0.9]} onTap={tap} label={label ?? kind} />}
    </>
  );
}

// Something standing on the floor that glides to a new square when it is moved (a crate shoved
// by the Force) instead of jumping there: a short hop and a turn on the way
function Glide({ x, y, z = 0, children }: { x: number; y: number; z?: number; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const move = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number } | null>(null);
  const placed = useRef("");
  const key = `${x},${y},${z}`;
  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const to = new THREE.Vector3(x, z, y);
    if (!placed.current) g.position.copy(to);
    else if (placed.current !== key) move.current = { from: g.position.clone(), to, start: performance.now() };
    placed.current = key;
  }, [key]);
  useFrame(() => {
    const m = move.current;
    const g = group.current;
    if (!m || !g) return;
    const far = m.from.distanceTo(m.to);
    const t = Math.min(1, (performance.now() - m.start) / (260 + far * 90));
    g.position.lerpVectors(m.from, m.to, 1 - (1 - t) ** 3);
    g.position.y += Math.sin(Math.PI * t) * Math.min(0.7, 0.12 + far * 0.08);
    g.rotation.y = Math.sin(Math.PI * t) * 0.3;
    if (t >= 1) {
      move.current = null;
      g.position.copy(m.to);
      g.rotation.y = 0;
    }
  });
  return <group ref={group}>{children}</group>;
}

// A fighter who moves walks to the new square (2026-10-26; before, they were put there at once and never took a step): at `pace` squares
// a second, turned the way they go, then back to `face`; their legs move with it (models.tsx Mover). A deployed droideka steps slowly.
// One put far away (a fight starting, a jump) is set there at once.
function Stepper({ x, y, z = 0, pace = 4, face = 0, turn: turns = true, children }: { x: number; y: number; z?: number; pace?: number; face?: number; turn?: boolean; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const to = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    to.set(x, z, y);
    const far = g.position.distanceTo(to);
    if (far > 12 || !g.userData.placed) {
      g.position.copy(to);
      g.userData.placed = true;
    } else if (far > 0.001) g.position.lerp(to, Math.min(1, (Math.min(delta, 0.1) * pace) / far));
    const r = turn.current;
    if (!r || !turns) return;
    const want = far > 0.05 ? Math.atan2(to.x - g.position.x, to.z - g.position.z) : face;
    r.rotation.y += Math.atan2(Math.sin(want - r.rotation.y), Math.cos(want - r.rotation.y)) * Math.min(1, delta * 10);
  });
  return <group ref={group}><group ref={turn} rotation={[0, face, 0]}>{children}</group></group>;
}
const isDroideka = (name = "") => /droideka|destroyer droid/i.test(name);

export function RoomShell({ width, height, assets, floor, wall, ships = [], bay, walls = true, fullWalls = false, railing = "", tallWalls = false, ceiling = false, wallHeight, looted, nodeOf, wayColor, wayLabel, onFloor, onAsset, plan, corners, style, mood, biome, like, meets = [], children }: {
  width: number;
  // The walls this high, whatever the view (an arena's floor: up to its first tier)
  wallHeight?: number;
  // The world's biome, for the wall set of a room with no mood (a roof, a gallery, a room looked down into): the walls were plaster there,
  // whatever the building was of (2026-10-27, the user: texture clashes on walls)
  biome?: string;
  // A room whose walls are another room's (a gallery's balustrade is its host's, a roof's parapet is the room under it): its pack and wall set
  like?: { buildingType: string; roomName: string };
  // Where the room stands against a round room's curve (`meetsOf`): it is filled out to the curve, and its doors there stand on it
  meets?: Meet[];
  height: number;
  // How far each outside corner is rounded: north-west, north-east, south-east, south-west
  corners?: [number, number, number, number];
  // The building's look, for its doors and windows
  style?: Style;
  // What this room is, for its light, its air and what is in it (interiors/): the kind of building, the room's name, the world
  mood?: { buildingType: string; roomName: string; biome: string };
  // The room's level and what it is, for stairs, lifts and ladders (their floor rises)
  plan?: Pick<RoomLayout, "level" | "form" | "climb" | "width" | "height" | "mask" | "switchback" | "well" | "ramp">;
  assets: RoomAsset[];
  floor: FloorKind;
  wall: string;
  ships?: Ship[];
  // The hangar these are the berths of, whose ships come and go by the clock (with the ships that belong to it)
  bay?: { room: Pick<Area, "id" | "ships">; based?: Ship[] };
  // Open ground has no walls, only posts at its corners
  walls?: boolean;
  // Walls as high as a room's, for the views from the character's eyes (the overhead view keeps them low to look over)
  fullWalls?: boolean;
  // A gallery's walls are its balustrade (BALUSTRADE_HEIGHT)
  // The sides that are a balustrade ("n", "e", "s", "w"): a gallery's edge that overlooks the room below
  railing?: string;
  // A two-storey room is its full height when it is looked into (so that a gallery over it has room above its rail)
  tallWalls?: boolean;
  // A ceiling over the room, for those views too: what is overhead there is the room's own roof, not the sky
  ceiling?: boolean;
  looted?: (asset: RoomAsset) => boolean;
  // The resource node a cache stands for, if it is one
  nodeOf?: (asset: RoomAsset) => ResourceNode | undefined;
  wayColor?: (asset: RoomAsset) => string;
  wayLabel?: (asset: RoomAsset) => string | undefined;
  // A square of the floor, or something in the room, was tapped
  onFloor?: (x: number, y: number) => void;
  onAsset?: (asset: RoomAsset) => void;
  children?: ReactNode;
}) {
  // What the shop shows today (a droid dealer's droids and parts), set by Play
  const onShow = useDisplay();
  // A cave has walls of rock and a rim of formations; every room has the light, the air and the stock its kind of place would
  // (interiors/): its wealth turns the furniture's browns, steels and golds into its own woods, metal and trim
  const detail = useQuality((q) => q.tier);
  const rocky = !!mood && mood.buildingType === "cave";
  // A cave room whose floor winds (layout.mask): floor squares, rock round them, no straight walls; a cave's sloping passage (a stairs
  // room, 2026-10-30) has the whole of its rectangle for floor, and the same rock round it
  const fullMask = useMemo(() => Array.from({ length: height }, () => "#".repeat(width)), [width, height]);
  const mask = rocky ? plan?.mask ?? (plan?.form ? fullMask : undefined) : undefined;
  const ceilingColour = rocky ? "#34302b" : mood && /starship/.test(mood.buildingType) ? "#3a424b" : "#8c8a84";
  const wealth = mood ? wealthOf(mood.buildingType, mood.roomName) : null;
  const look = useMemo(() => (wealth && mood ? lookOf(wealth, mood.biome) : undefined), [wealth, mood?.biome]);
  const atmosphere = useMemo(() => (mood && wealth ? moodOf(mood.buildingType, mood.roomName, wealth, mood.biome) : null), [mood?.buildingType, mood?.roomName, mood?.biome, wealth]);
  // The squares that are taken (furniture, and the ways in and the squares beside them), as a string that only changes when they do
  const takenKey = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      if (a.side) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) set.add(`${a.x + dx},${a.y + dy}`);
      else for (let x = a.x; x < a.x + a.w; x++) for (let y = a.y; y < a.y + a.h; y++) set.add(`${x},${y}`);
    }
    return [...set].sort().join(";");
  }, [assets]);
  // A shaft's walls run up with the floor
  const climbs = plan?.climb ? rise(plan as RoomLayout) : 0;
  // (seen from overhead, a switchback's walls stop at its landing, so that both flights can be looked into)
  // (a roof terrace or a balcony keeps its waist-high parapet in the eye views too: 2026-10-27, the user)
  const parapet = plan?.form === "roof" || plan?.form === "balcony";
  // A grand room is two or three storeys high under a vault, in the eye views (vaultOf)
  const vault = mood && fullWalls && ceiling && !mask && !plan?.form ? vaultOf(mood.buildingType, mood.roomName, width, height) : 0;
  const wallH = (wallHeight ?? (vault ? LEVEL_H * Math.max(vault, tallWalls ? 2 : 1) - 0.2 : tallWalls ? LEVEL_H * 2 - 0.2 : fullWalls && !parapet ? FULL_WALL_HEIGHT : WALL_HEIGHT)) + (plan?.switchback && !fullWalls ? climbs / 2 : climbs);
  // The ceiling stays at the room's height where the walls are a balustrade (a gallery)
  const ramp = (x: number, y: number) => (plan?.climb ? rampAt(plan as RoomLayout, x + 0.5, y + 0.5) : 0);
  // (a cave's way between floors is a slope of rock, not steps: the user, 2026-10-30)
  const sloped = rocky && !!plan?.climb && !plan.switchback;
  const slopeKey = sloped ? `${plan!.climb!.toward}:${climbs}` : "";
  const slope = useMemo(() => (sloped ? (x: number, z: number) => climbAt(plan as RoomLayout, x, z) * climbs : undefined), [slopeKey, width, height]);
  // The camera over the shoulder keeps under the roof (aim.ts `roof`): its height over the floor where one stands
  const roofAbove = ceiling && walls ? (mask ? CAVE_ROOF - 0.55 : wallH - climbs) : null;
  useEffect(() => {
    if (roofAbove === null) return;
    viewRoof.above = roofAbove;
    return () => { if (viewRoof.above === roofAbove) viewRoof.above = null; };
  }, [roofAbove]);
  // The kit this room is furnished and walled from, and its palette
  // (a room that is `like` another has that room's walls but none of its furniture, light or air: `pack` is for the walls only)
  const wallPack = mood && !rocky ? wallPackOf(mood.buildingType) : like ? wallPackOf(like.buildingType) : undefined;
  const pack = mood && !rocky ? packOf(mood.roomName, mood.buildingType) : undefined;
  const wallLook = useMemo(() => (wallPack ? packTone(PACKS[wallPack], wall) : undefined), [wallPack, wall]);
  const packLook = useMemo(() => (pack === wallPack ? wallLook : pack ? packTone(PACKS[pack], wall) : undefined), [pack, wallPack, wallLook, wall]);
  const wallTexture = wallSet(wallPack, mood?.biome ?? biome ?? "");
  const [nw, ne, se, sw] = rocky ? [0, 0, 0, 0] : corners ?? [0, 0, 0, 0];
  const rounded = nw + ne + se + sw > 0;
  const floorTexture = floorLook(floor, mood?.buildingType, plan?.form === "roof");
  // The wall line round the room (straight sides, a quarter circle at each rounded corner: shared/logic footprint `outline`), where each
  // door, way out and window stands on it (on the curve of a round room), and the wall that is left round them: straight runs and arcs
  const wallLine = useMemo(() => outline(width, height, [nw, ne, se, sw]), [width, height, nw, ne, se, sw]);
  const setIn = useMemo(() => assets.filter((a) => a.side).map((a) => meets.map((m) => m.place(a)).find(Boolean) ?? wayPlace(wallLine, width, height, a)), [assets, wallLine, meets]);
  // (a stretch against a round room has no wall of its own: the round room's curve is the wall there)
  const onLine = (side: FootSide, u: number) => {
    const piece = wallLine.pieces.find((p) => p.kind === "line" && p.side === side);
    if (!piece || piece.kind !== "line") return 0;
    const [px, pz] = side === "n" ? [u, 0] : side === "s" ? [u, height] : side === "w" ? [0, u] : [width, u];
    return piece.start + Math.max(0, Math.min(piece.length, (px - piece.from[0]) * piece.dir[0] + (pz - piece.from[1]) * piece.dir[1]));
  };
  const meetGaps = meets.map((m) => [onLine(m.side, m.a), onLine(m.side, m.b)].sort((x, y) => x - y) as [number, number]);
  const met = (p: WayPlace) => meets.some((m) => m.place(p.a));
  const cut = wallStretches(wallLine, width, height, [...setIn.filter((p) => (isWay(p.a) || p.a.kind === "window") && !met(p)).map((p) => [p.s - 0.5, p.s + 0.5] as [number, number]), ...meetGaps]);
  // The rounded corners, each a quarter ring (or what is left of it beside a door or window)
  const cornerList = cut.arcs.map((c) => ({ corner: c.corner, r: c.r, from: c.from, to: c.to }));
  // Each wall runs between its corners, stopping short of a rounded one
  const sides = [
    { side: "n", length: width, ends: [nw, ne], at: (a: number, b: number): [V3, V3] => [[(a + b) / 2, wallH / 2, 0], [b - a + (a === 0 ? WALL_THICK / 2 : 0) + (b === width ? WALL_THICK / 2 : 0), wallH, WALL_THICK]], along: (a: RoomAsset) => a.x },
    { side: "s", length: width, ends: [sw, se], at: (a: number, b: number): [V3, V3] => [[(a + b) / 2, wallH / 2, height], [b - a + (a === 0 ? WALL_THICK / 2 : 0) + (b === width ? WALL_THICK / 2 : 0), wallH, WALL_THICK]], along: (a: RoomAsset) => a.x },
    { side: "w", length: height, ends: [nw, sw], at: (a: number, b: number): [V3, V3] => [[0, wallH / 2, (a + b) / 2], [WALL_THICK, wallH, b - a]], along: (a: RoomAsset) => a.y },
    { side: "e", length: height, ends: [ne, se], at: (a: number, b: number): [V3, V3] => [[width, wallH / 2, (a + b) / 2], [WALL_THICK, wallH, b - a]], along: (a: RoomAsset) => a.y },
  ];
  const floorTap = onFloor
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta > 8) return;
        const p = e.object.worldToLocal(e.point.clone());
        onFloor(Math.max(0, Math.min(width - 1, Math.floor(p.x + width / 2))), Math.max(0, Math.min(height - 1, Math.floor(p.z + height / 2))));
      }
    : undefined;
  return (
    <>
      {/* The floor; a tap on it walks to the square (both floors are centred on the room's middle) */}
      {plan?.well ? (
        // An arena's tier: the terrace round the open middle, with its rail (a tap on it walks to the square)
        <group position={[width / 2, 0, height / 2]} onClick={onFloor ? (e) => { e.stopPropagation(); if (e.delta > 8) return; const p = e.eventObject.worldToLocal(e.point.clone()); onFloor(Math.max(0, Math.min(width - 1, Math.floor(p.x + width / 2))), Math.max(0, Math.min(height - 1, Math.floor(p.z + height / 2)))); } : undefined}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
            <ringGeometry args={[plan.well, Math.min(width, height) / 2, 96, 1]} />
            <meshLambertMaterial color="#6f6a61" />
          </mesh>
          <mesh position={[0, -0.12, 0]} raycast={() => null}>
            <cylinderGeometry args={[plan.well, plan.well, 0.28, 96, 1, true]} />
            <meshLambertMaterial color="#59544c" side={THREE.DoubleSide} />
          </mesh>
          <RingRail r={plan.well + 0.12} h={BALUSTRADE_HEIGHT} />
        </group>
      ) : mask && slope ? (
        <RampFloor mask={mask} width={width} height={height} color={FLOORS[floor]} lift={slope} liftKey={slopeKey} onClick={floorTap} />
      ) : mask ? (
        <MaskFloor mask={mask} width={width} height={height} color={FLOORS[floor]} onClick={floorTap} />
      ) : rounded ? (
        <group onClick={floorTap}>
          <RoundedFloor w={width} d={height} radii={[nw, ne, se, sw]} color={FLOORS[floor]} />
        </group>
      ) : (
        <mesh position={[width / 2, -0.1, height / 2]} receiveShadow onClick={floorTap}>
          <boxGeometry args={[width, 0.2, height]} />
          <meshLambertMaterial color={FLOORS[floor]} />
        </mesh>
      )}
      {/* Over the slab, its texture (siteAssets floorLook); the slab shows until the maps are in */}
      {!mask && !plan?.well && floorTexture && (
        <Suspense fallback={null}>
          <FloorSurface look={floorTexture} w={width} h={height} radii={[nw, ne, se, sw]} onTap={floorTap} />
        </Suspense>
      )}
      {plan?.climb && plan.form && !sloped && <Ascent w={width} h={height} toward={plan.climb.toward} up={climbs} form={plan.form} switchback={plan.switchback} ramp={plan.ramp} onTap={onFloor} rock={rocky ? { biome: mood!.biome } : undefined} />}
      {walls && mask
        ? <Solids><CaveWalls mask={mask} ways={assets.filter((a) => a.side).map((a) => ({ x: a.x, y: a.y, side: a.side }))} w={width} h={height} biome={mood!.biome} tier={detail} seed={width * 31 + height} tall={fullWalls} ceiling={ceiling && fullWalls ? CAVE_ROOF : undefined} lift={slope} liftKey={slopeKey} /></Solids>
        : walls
        ? (() => {
            const runs = cut.runs.filter((r) => r.b - r.a >= 0.01).map((r) => ({ ...r, at: sides.find((s) => s.side === r.side)!.at }));
            // Round each doorway and window the wall stands whole but for the frame's own outline (beside it, under a window and over
            // both), bent onto the curve where the wall curves
            const tint = wallLook && wallPack && hasWalls(wallPack) ? toneColour(wallLook) : wall;
            // (the sides that are a balustrade: a gallery's overlooking edge, and the long sides of a walkway, which has no walls)
            const rails = plan?.form === "walkway" ? ["n", "e", "s", "w"].filter((s) => !assets.some((a) => isWay(a) && a.side === s)).join("") : railing;
            const pierced = rocky ? [] : setIn.filter((p) => (isWay(p.a) || p.a.kind === "window") && !met(p)).map((p) => (
              <group key={`pierced${p.a.id}`} position={[p.at[0], 0, p.at[1]]} rotation={[0, p.turn, 0]}>
                <PiercedWall kind={p.a.kind} pane={p.a.pane} style={style} wallH={rails.includes(p.a.side!) ? BALUSTRADE_HEIGHT : wallH} lift={ramp(p.a.x, p.a.y)} bend={p.bend} color={tint} wall={wallTexture} />
              </group>
            ));
            const solid = (list: typeof runs) => list.map(({ side, a, b, at }) => {
              if (rocky) return <RockWall key={`${side}${a}`} side={side} a={a} b={b} w={width} h={height} height={1.1} seed={Math.round(a * 10) + side.charCodeAt(0) + width} biome={mood!.biome} tier={detail} />;
              const [position, size] = at(a, b);
              if (rails.includes(side)) return <Balustrade key={`${side}${a}`} at={[position[0], position[2]]} length={b - a} along={side === "n" || side === "s" ? "x" : "z"} h={BALUSTRADE_HEIGHT} />;
              const high = wallH;
              return <Box key={`${side}${a}`} at={[position[0], high / 2, position[2]]} size={[size[0], high, size[2]]} color={wall} solid wall={wallTexture} />;
            });
            const plain = solid(runs);
            // (a gallery's balustrade is the kit's wall too, at its own height: it was plaster beside the room's sandstone)
            const railed = runs.filter((r) => rails.includes(r.side));
            const standing = runs.filter((r) => !rails.includes(r.side));
            // A room of a pack with walls has the kit's, straight and bent round its corners, in its palette; the plain ones stand until the kit is in
            const corner = cornerList.map((c) => {
              const [x, z] = cornerCentre(c, width, height);
              return (
                <group key={`corner${c.corner}:${c.from}`} position={[x, 0, z]}>
                  <Solids><CornerWall r={c.r} h={wallH} thick={WALL_THICK} corner={c.corner} from={c.from} to={c.to} color={tint} wall={wallTexture} /></Solids>
                </group>
              );
            });
            return (
              <>
                {wallLook && wallPack && hasWalls(wallPack) && !rocky ? (
                  <>
                    <PackWalls runs={standing} corners={cornerList} width={width} height={height} wallH={wallH} thick={WALL_THICK} tone={wallLook!} wall={wallTexture} fallback={<>{solid(standing)}{corner}</>} />
                    {solid(railed)}
                  </>
                ) : <>{plain}{corner}</>}
                {pierced}
                {/* Out to a round room's curve: the floor, and the side walls carried on to meet it */}
                {meets.map((m, i) => {
                  const across = m.side === "e" || m.side === "w";
                  const length = across ? height : width;
                  const ends = [m.a === 0 ? 0 : undefined, m.b === length ? length : undefined].filter((u): u is number => u !== undefined && m.depth(u) > 0.01);
                  return (
                    <group key={`meet${i}`}>
                      <MeetFill meet={m} width={width} height={height} y={-0.2} h={0.2} color={FLOORS[floor]} />
                      {ends.map((u) => {
                        const d = m.depth(u);
                        const out = m.side === "e" ? width + d / 2 : m.side === "w" ? -d / 2 : m.side === "s" ? height + d / 2 : -d / 2;
                        const at: V3 = across ? [out, wallH / 2, u] : [u, wallH / 2, out];
                        const size: V3 = across ? [d + WALL_THICK / 2, wallH, WALL_THICK] : [WALL_THICK, wallH, d + WALL_THICK / 2];
                        return <Box key={u} at={at} size={size} color={tint} solid wall={wallTexture} />;
                      })}
                    </group>
                  );
                })}
              </>
            );
          })()
        : [[0, 0], [width, 0], [0, height], [width, height]].map(([x, z], i) => <Cyl key={i} at={[x, 0.3, z]} r={0.08} h={0.6} color={wall} />)}
      {setIn.filter((p) => walls || p.a.kind !== "window").map(({ a, at, turn, bend }) => (
        <group key={a.id} position={[at[0], ramp(a.x, a.y), at[1]]} rotation={[0, turn, 0]}>
          <Doorway kind={a.kind} color={wayColor?.(a) ?? WAY_COLORS[a.kind as keyof typeof WAY_COLORS] ?? WAY_COLORS.door} label={wayLabel?.(a)} onTap={onAsset ? () => onAsset(a) : undefined} style={style} pane={a.pane} name={a.name} wall={wallTexture} tint={wallLook && wallPack && hasWalls(wallPack) ? toneColour(wallLook) : wall} bend={bend} rock={rocky ? { biome: mood!.biome, tier: detail, seed: a.x * 7 + a.y * 13 + width } : undefined} />
        </group>
      ))}
      {assets.filter((a) => !a.side && a.kind !== "npc" && a.name !== "Loose flagstone").map((a) => (
        <Glide key={a.id} x={a.x} y={a.y} z={(a.z ?? 0) * LEVEL_H}>
          {a.kind === "ship" ? (bay ? <BayBerth room={bay.room} asset={a} based={bay.based} /> : ships.find((ship) => ship.id === a.ref) ? <ShipModel ship={ships.find((ship) => ship.id === a.ref)!} w={a.w} h={a.h} /> : <Berth w={a.w} h={a.h} name={a.name} note="away on a voyage" />)
            : a.kind === "stairs" ? <StairsAsset w={a.w} h={a.h} up={/up/i.test(a.name)} rock={rocky ? { biome: mood!.biome } : undefined} />
            : a.kind === "loot" ? (nodeOf?.(a) ? <NodeModel node={nodeOf(a)!} empty={looted?.(a)} /> : <Chest looted={looted?.(a)} />)
            : (
              <>
                <Furniture name={a.cell?.open ? `${a.name} (open)` : a.name} w={a.w} h={a.h} seed={hue(a.id)} look={look} pack={pack} tone={pack ? packLook : undefined} face={facing(a, width, height)} bare={!!mood && !!holdsOf(a.name, mood.buildingType, mood.roomName)} />
                {/* A fighting beast in its pen (an arena's pens: models.tsx draws the cage) */}
                {a.name === "Beast pen" && <group position={[a.w / 2, 0.06, a.h / 2]} rotation={[0, hue(a.id) % 6, 0]}><Figure kind="beast" ring="#9ca3af" name={PEN_BEASTS[hue(a.id) % PEN_BEASTS.length]} /></group>}
                {mood && holdsOf(a.name, mood.buildingType, mood.roomName) && <Stock name={a.name} w={a.w} h={a.h} seed={hue(a.id)} buildingType={mood.buildingType} roomName={mood.roomName} tone={packLook} wares={onShow.shelves[a.id]} face={facing(a, width, height)} />}
                {/* A droid for sale on its plinth (the dealer's stock of the day) */}
                {onShow.droids[a.id] && (
                  <group position={[a.w / 2, 0.14, a.h / 2]}>
                    <Figure kind="droid" ring="#fbbf24" name={onShow.droids[a.id].name} creature="droid" />
                  </group>
                )}
              </>
            )}
          {/* Furniture that can be stood on (a bench, the stage) leaves the tap to the floor beneath, so it walks to that square */}
          {onAsset && !(onFloor && a.kind === "furniture" && !a.blocks && !useKindOf(a.name)) && <Hit at={[a.w / 2, 0.5, a.h / 2]} size={[a.w, 1, a.h]} onTap={() => onAsset(a)} label={a.name} />}
        </Glide>
      ))}
      {ceiling && walls && (
        // The roof seen from inside: rock over a cave, a deck head in a ship, a plain ceiling elsewhere, on the room's own footprint
        mask ? null
        : vault ? <Vault w={width} h={height} y={wallH} round={nw > 0 && nw === ne && ne === se && se === sw} color={/palace|estates|manor/.test(mood!.buildingType) ? "#ddd3bf" : "#c9c4b8"} rib={/palace/.test(mood!.buildingType) ? "#b8964e" : "#9a9184"} />
        : rounded ? <RoundedFloor w={width} d={height} radii={[nw, ne, se, sw]} color={ceilingColour} y={wallH} thick={0.1} />
        : (
          <mesh position={[width / 2, wallH + 0.05, height / 2]} raycast={() => null}>
            <boxGeometry args={[width, 0.1, height]} />
            <meshLambertMaterial color={ceilingColour} />
          </mesh>
        )
      )}
      {atmosphere && look && walls && <Atmosphere mood={atmosphere} look={look} w={width} h={height} tier={detail} />}
      {/* (not in a sloping passage, which is walked from wall to wall) */}
      {rocky && !plan?.form && <CaveDressing w={width} h={height} seed={width * 31 + height} biome={mood!.biome} tier={detail} takenKey={takenKey} mask={mask} />}
      {children}
    </>
  );
}

// How many storeys high a grand room stands in the eye views, under a vault (2026-10-30, the user: "Palaces should have high vaulted
// ceilings - double or even triple height in grand, large rooms"): a palace's audience chamber or throne room three, its halls and its
// other large rooms two, a great house's hall and an archive's reading hall two; 0 for a room of the usual height. Only the view from
// inside is raised: a room stacked over it is taken away while it is looked into, as it always was.
export function vaultOf(buildingType: string, roomName: string, w: number, h: number): number {
  if (buildingType === "palace") return /audience|throne/i.test(roomName) ? 3 : /hall/i.test(roomName) || w * h >= 70 ? 2 : 0;
  if (/^(estates|manor house)$/.test(buildingType)) return /hall/i.test(roomName) && w * h >= 36 ? 2 : 0;
  if (buildingType === "archive") return /reading hall/i.test(roomName) ? 2 : 0;
  return 0;
}

// The vault over a grand room: a barrel along its length (a half ellipse across it, as high as a third of its span), closed at each end,
// on ribs a little more than a square apart; over a round room a dome on a ring
function Vault({ w, h, y, round, color, rib }: { w: number; h: number; y: number; round: boolean; color: string; rib: string }) {
  const span = Math.min(w, h);
  const length = Math.max(w, h);
  const alongX = w >= h;
  const rise = span * 0.36;
  const barrel = useMemo(() => {
    if (round) return null;
    const [n, m] = [16, Math.max(2, Math.round(length * 2))];
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= m; i++)
      for (let j = 0; j <= n; j++) {
        const a = (Math.PI * j) / n;
        const [across, up, along] = [Math.cos(a) * span / 2, Math.sin(a) * rise, (i / m - 0.5) * length];
        pos.push(alongX ? along : across, up, alongX ? across : along);
      }
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j; idx.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [w, h, round]);
  // The half ellipse that closes each end of the barrel, and that each rib follows
  const lunette = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(span / 2, 0);
    for (let j = 1; j <= 16; j++) shape.lineTo(Math.cos((Math.PI * j) / 16) * span / 2, Math.sin((Math.PI * j) / 16) * rise);
    return new THREE.ShapeGeometry(shape);
  }, [span, rise]);
  useEffect(() => () => { barrel?.dispose(); lunette.dispose(); }, [barrel, lunette]);
  if (round) {
    return (
      <group position={[w / 2, y, h / 2]}>
        <mesh scale={[w / 2, span * 0.5, h / 2]} raycast={() => null}>
          <sphereGeometry args={[1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshLambertMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[w / 2, h / 2, 1]} raycast={() => null}>
          <torusGeometry args={[0.99, 0.03, 6, 40]} />
          <meshLambertMaterial color={rib} />
        </mesh>
        {/* the lantern at its crown */}
        <mesh position={[0, span * 0.5 - 0.02, 0]} raycast={() => null}><cylinderGeometry args={[span * 0.08, span * 0.08, 0.06, 16]} /><meshBasicMaterial color="#f3e2b0" /></mesh>
      </group>
    );
  }
  const ribs = Math.max(1, Math.floor(length / 2.2));
  return (
    <group position={[w / 2, y, h / 2]}>
      {barrel && <mesh geometry={barrel} raycast={() => null}><meshLambertMaterial color={color} side={THREE.DoubleSide} /></mesh>}
      {[-1, 1].map((end) => (
        <mesh key={end} geometry={lunette} position={alongX ? [end * length / 2, 0, 0] : [0, 0, end * length / 2]} rotation={[0, alongX ? Math.PI / 2 : 0, 0]} raycast={() => null}>
          <meshLambertMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {Array.from({ length: ribs }, (_, i) => {
        const at = ((i + 1) / (ribs + 1) - 0.5) * length;
        return (
          <group key={i} position={alongX ? [at, 0, 0] : [0, 0, at]} rotation={[0, alongX ? Math.PI / 2 : 0, 0]}>
            <mesh scale={[span / 2 - 0.02, rise - 0.02, 1]} raycast={() => null}>
              <torusGeometry args={[1, 0.035, 6, 24, Math.PI]} />
              <meshLambertMaterial color={rib} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// The great beasts of the sea round a place on it or under it (2026-10-30, the user: "water dwelling beasts"): the rules data's own, an opee
// sea killer and (under the sea) a sando aqua monster, cruising slow rings well out beyond the buildings; on the sea the opee rolls up to the
// face of the water and down again
// A swimmer long in the water draws the first of them (2026-10-30, house rule: `exposed` says the party swims, not at the helm of a craft):
// after SEA_BAIT seconds in the water on the sea (twice that under it, where the streets are water) it leaves its ring and comes at the
// party (`onCome` warns), faster than anyone swims; out of the water before it gets there, and it goes back; there, it is a fight
// (`onReach`). Once a minute at most.
const SEA_BAIT = 10;
const SEA_HUNT = 3.6;
function SeaBeasts({ ground, under, feet, exposed, onCome, onReach }: { ground: { x: number; y: number; w: number; h: number }; under: boolean; feet?: { current: { x: number; y: number } }; exposed?: () => boolean; onCome?: (name: string) => void; onReach?: (name: string) => void }) {
  const hunt = useRef({ mode: "circle" as "circle" | "hunt" | "back", wet: 0, dry: 0, rest: 0, x: 0, z: 0 });
  const beasts = useMemo(() => [
    { name: "Opee Sea Killer", r: Math.max(ground.w, ground.h) * 0.62 + 6, speed: 0.05, depth: under ? 3.5 : SEA_Y - 0.9, phase: 0 },
    ...(under ? [{ name: "Sando Aqua Monster", r: Math.max(ground.w, ground.h) * 0.9 + 14, speed: -0.025, depth: 9, phase: 2.2 }] : []),
  ], [ground.w, ground.h, under]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const [cx, cz] = [ground.x + ground.w / 2, ground.y + ground.h / 2];
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.1);
    const h = hunt.current;
    const wet = !!exposed?.() && !!feet;
    h.rest = Math.max(0, h.rest - dt);
    h.wet = wet ? h.wet + dt : 0;
    h.dry = wet ? 0 : h.dry + dt;
    beasts.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = t * b.speed + b.phase;
      const ring = [cx + Math.cos(a) * b.r, cz + Math.sin(a) * b.r];
      // (the first beast hunts a swimmer; the other only circles)
      if (i === 0 && feet && onReach) {
        if (h.mode === "circle" && h.rest <= 0 && h.wet > SEA_BAIT * (under ? 2 : 1)) {
          h.mode = "hunt";
          h.x = ring[0];
          h.z = ring[1];
          onCome?.(b.name);
        }
        if (h.mode === "hunt" && h.dry > 1.5) h.mode = "back";
        if (h.mode !== "circle") {
          const [tx, tz] = h.mode === "hunt" ? [feet.current.x + 0.5, feet.current.y + 0.5] : ring;
          const [dx, dz] = [tx - h.x, tz - h.z];
          const d = Math.hypot(dx, dz);
          const step = Math.min(d, dt * (h.mode === "hunt" ? SEA_HUNT : SEA_HUNT * 1.5));
          if (d > 0.01) {
            h.x += (dx / d) * step;
            h.z += (dz / d) * step;
          }
          g.position.set(h.x, b.depth, h.z);
          g.rotation.set(0, Math.atan2(dx, dz), 0);
          if (h.mode === "hunt" && d < 2.2) {
            h.mode = "back";
            h.rest = 60;
            h.wet = 0;
            onReach(b.name);
          } else if (h.mode === "back" && d < 0.5) h.mode = "circle";
          return;
        }
      }
      g.position.set(ring[0], b.depth + (under ? Math.sin(t * 0.4 + i) * 0.8 : Math.max(0, Math.sin(t * 0.21)) * 0.7 - 0.2), ring[1]);
      // (along its ring, nose first, the body undulating)
      g.rotation.set(Math.sin(t * 0.9 + i) * 0.08, -a + (b.speed > 0 ? Math.PI : 0), Math.sin(t * 1.3 + i) * 0.06);
    });
  });
  return (
    <>
      {beasts.map((b, i) => (
        <group key={b.name} ref={(el) => { refs.current[i] = el; }} scale={under && i === 1 ? 3.2 : 1.6}>
          <Figure kind="beast" ring={SIDE_COLORS.hostile} name={b.name} creature="beast" large size="Huge" />
        </group>
      ))}
    </>
  );
}

// A room of a cave next to the one stood in (2026-10-30): its floor and its rock (with its roof in the eye views), lit by what lights the
// room stood in, so that what is seen through an opening is the cave going on and not the world outside. A sloping passage slopes.
function CaveBeyond({ room, biome, tier, tall, floor }: { room: Area; biome: string; tier: Tier; tall: boolean; floor: FloorKind }) {
  const l = room.layout!;
  const mask = useMemo(() => l.mask ?? Array.from({ length: l.height }, () => "#".repeat(l.width)), [l.mask, l.width, l.height]);
  const climbs = l.climb && !l.switchback ? rise(l) : 0;
  const slopeKey = climbs ? `${l.climb!.toward}:${climbs}` : "";
  const slope = useMemo(() => (climbs ? (x: number, z: number) => climbAt(l, x, z) * climbs : undefined), [slopeKey, l.width, l.height]);
  return (
    <group position={[l.x, levelY(l), l.y]}>
      {slope ? <RampFloor mask={mask} width={l.width} height={l.height} color={FLOORS[floor]} lift={slope} liftKey={slopeKey} /> : <MaskFloor mask={mask} width={l.width} height={l.height} color={FLOORS[floor]} />}
      <Solids><CaveWalls mask={mask} ways={l.assets.filter((a) => a.side).map((a) => ({ x: a.x, y: a.y, side: a.side }))} w={l.width} h={l.height} biome={biome} tier={tier} seed={l.width * 31 + l.height} tall={tall} ceiling={tall ? CAVE_ROOF : undefined} lift={slope} liftKey={slopeKey} /></Solids>
    </group>
  );
}

// Walks over open squares, round what stands in the way and never across a corner, from one
// square to the nearest of the goals (A*, a diagonal step costing more than a straight one, so the
// way is the short one and not a zigzag). With `smooth` the path is then pulled straight: a stretch
// is walked in a line wherever a body a little under a square wide fits between open squares all
// along it (never over a square in `keep`, which has to be stepped on). The squares to step on,
// without the first; null if no way.
function route(open: (x: number, y: number) => boolean, from: { x: number; y: number }, goals: { x: number; y: number }[], smooth?: { keep?: Set<string> }, step?: (a: { x: number; y: number }, b: { x: number; y: number }) => boolean): { x: number; y: number }[] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  const wanted = new Set(goals.map((g) => key(g.x, g.y)));
  if (!goals.length) return null;
  const heuristic = (x: number, y: number) => {
    let best = Infinity;
    for (const g of goals) {
      const [dx, dy] = [Math.abs(g.x - x), Math.abs(g.y - y)];
      best = Math.min(best, Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
    }
    return best;
  };
  const cost = new Map<string, number>([[key(from.x, from.y), 0]]);
  const came = new Map<string, string | null>([[key(from.x, from.y), null]]);
  const closed = new Set<string>();
  const heap: { f: number; g: number; x: number; y: number }[] = [{ f: heuristic(from.x, from.y), g: 0, x: from.x, y: from.y }];
  const push = (n: { f: number; g: number; x: number; y: number }) => {
    heap.push(n);
    for (let i = heap.length - 1; i > 0;) {
      const up = (i - 1) >> 1;
      if (heap[up].f <= heap[i].f) break;
      [heap[up], heap[i]] = [heap[i], heap[up]];
      i = up;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const at = pop();
    const k = key(at.x, at.y);
    if (closed.has(k)) continue;
    closed.add(k);
    if (wanted.has(k)) {
      const steps: { x: number; y: number }[] = [];
      for (let q: string | null = k; q && came.get(q); q = came.get(q)!) steps.unshift({ x: Number(q.split(",")[0]), y: Number(q.split(",")[1]) });
      return smooth ? straighten(open, from, steps, smooth.keep) : steps;
    }
    if (closed.size > 6000) break;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = at.x + dx;
      const y = at.y + dy;
      if ((!dx && !dy) || closed.has(key(x, y)) || !open(x, y)) continue;
      if (dx && dy && (!open(at.x + dx, at.y) || !open(at.x, at.y + dy))) continue;
      // (and only where a step may be taken: never from one flight of a switchback to the other but on its landing)
      if (step && (!step(at, { x, y }) || (dx && dy && (!step(at, { x: at.x + dx, y: at.y }) || !step(at, { x: at.x, y: at.y + dy }))))) continue;
      const g = at.g + (dx && dy ? Math.SQRT2 : 1);
      if (g >= (cost.get(key(x, y)) ?? Infinity)) continue;
      cost.set(key(x, y), g);
      came.set(key(x, y), k);
      push({ f: g + heuristic(x, y), g, x, y });
    }
  }
  return null;
}

// A body of this radius, in squares, walks the straight stretches of a path
const BODY = 0.34;
// Whether a body can walk the line between two squares: every sample along it, and the four
// corners of the body about it, are on open squares
function clear(open: (x: number, y: number) => boolean, a: { x: number; y: number }, b: { x: number; y: number }, keep?: Set<string>): boolean {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const samples = Math.max(1, Math.ceil(length / 0.1));
  for (let i = 0; i <= samples; i++) {
    const px = a.x + ((b.x - a.x) * i) / samples;
    const py = a.y + ((b.y - a.y) * i) / samples;
    if (keep && i > 0 && i < samples && keep.has(`${Math.round(px)},${Math.round(py)}`)) return false;
    for (const ox of [-BODY, BODY]) for (const oy of [-BODY, BODY]) if (!open(Math.round(px + ox), Math.round(py + oy))) return false;
  }
  return true;
}

// Pulls a path of squares straight: from each stop, on to the farthest square that can be walked
// to in a line. A step to the next square is always kept, so that a path the squares allow is
// never lost.
function straighten(open: (x: number, y: number) => boolean, from: { x: number; y: number }, steps: { x: number; y: number }[], keep?: Set<string>): { x: number; y: number }[] {
  const points = [from, ...steps];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length - 1;) {
    let j = i + 1;
    for (let k = points.length - 1; k > i + 1; k--) if (clear(open, points[i], points[k], keep)) { j = k; break; }
    out.push(points[j]);
    i = j;
  }
  return out;
}

// The open square nearest to where someone should stand
function nearestOpen(open: (x: number, y: number) => boolean, want: { x: number; y: number }): { x: number; y: number } {
  for (let ring = 0; ring < 60; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === ring && open(want.x + dx, want.y + dy)) return { x: want.x + dx, y: want.y + dy };
    }
  }
  return want;
}

// The squares round something standing on the given squares
const aroundSquares = (x: number, y: number, w = 1, h = 1) => {
  const squares: { x: number; y: number }[] = [];
  for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) if (i < x || i >= x + w || j < y || j >= y + h) squares.push({ x: i, y: j });
  return squares;
};

// ---------------------------------------------------------------------------------------------
// Life. Everyone in a place is someone of their own and goes about their business: patrons sit
// at their tables and now and then one or two go up to the bar, call on someone at another
// table or take another seat; the band plays on its stage, stops all together for a break and
// mingles, sits in or goes to the bar until the next set; staff keep behind their counters,
// serve whoever comes up to them and come over when called; a service droid waits on customers
// (the party too, if they stand about) and wipes the tables people leave; sentries keep the post
// by the way out while another walks a round and checks in with them, and now and then they
// change places. Hostiles who have noticed the party stop and watch it. This is only what is
// shown: the world keeps everyone's square in the room plan, and a fight starts from where they
// are drawn at that moment (`whereNow`).
// ---------------------------------------------------------------------------------------------

type Sq = { x: number; y: number };
type Brain = "patron" | "staff" | "musician" | "droid" | "post" | "round" | "still" | "dealer" | "spectator";

// What a scene offers the people in it, in its own squares
interface Setting {
  open: (x: number, y: number) => boolean;
  // Where people sit, by the table or booth they sit at
  // (a table with stools of its own, a Sabacc table's: the square each stands nearest, where it is and the way it faces, in the squares'
  // own coordinates: whoever sits there sits on it)
  seats: { id: string; centre: V3; spots: Sq[]; stools?: { spot: Sq; x: number; y: number; face: number }[] }[];
  // Counters: the side customers come up to and the side staff stand on
  counters: { asset: RoomAsset; front: Sq[]; behind: Sq[] }[];
  // The band's stage and how high it stands
  stage: Sq[];
  stageHeight: number;
  // A sentry's round, and where the one on the post keeps watch
  round: Sq[];
  watch: Sq;
  // Where people come in and go out
  doors: Sq[];
  // An arena's stands: how high a square of them stands (the crowd is drawn on top), and the middle of its pit, which they watch
  stands?: (s: Sq) => number | undefined;
  pit?: Sq;
  // What the people here talk about (relations.ts `talkPlace`), and where they are, for the model that makes their lines (relations.ts `chatScene`)
  talk?: string;
  scene?: string;
  // Two people of the scene as the model is told of them (`talkersOf`), and what the town says
  talkers?: (a: Occupant, b: Occupant) => [ChatPerson, ChatPerson];
  news?: string;
}

interface Agent {
  // The plan asset this person stands for
  key: string;
  occupant: Occupant;
  brain: Brain;
  // Their seat, place behind the counter, place on the stage, post or dock
  home: Sq;
  counter?: string;
  x: number;
  y: number;
  path: Sq[];
  goal?: Sq;
  // Seconds to stay once they get where they are going
  wait: number;
  doing: string;
  face?: Sq | (() => Sq | undefined);
  then?: () => void;
  call?: { near: Sq; done: () => void };
  leg: number;
  swap?: boolean;
  phase: number;
  // Their day takes them elsewhere: they are on their way out
  leaving?: boolean;
  // Seconds they have stood on a square the party or a follower stands on (they step aside)
  crowded?: number;
  // Kept in the seat for a game that is on (nothing else takes them away from it)
  held?: boolean;
  // At a table: what the figure is told (sitting, what the hands do), how far down on the stool it is (0 to 1), the stool, and seconds to the next gesture
  pose: { current: SeatState };
  stool?: { spot: Sq; x: number; y: number; face: number };
  sitK: number;
  gesture: number;
  shots: number;
  // Talking with someone (2026-11-02): the lines (they come in from the model as it makes them, voice.ts `chatter`; `done` once all are in),
  // whose turn, seconds to the next, and the clock at the last line said; the one who began it keeps the time and can stop the model
  talk?: { with: Agent; lines: TalkLine[]; i: number; next: number; lead: boolean; done?: boolean; last?: number; cancel?: () => void; speaking?: boolean };
  // A spectator cheering: seconds left
  cheer?: number;
}

// The party at a card table (2026-10-27): where it is to sit (a Sabacc table's stool), whether it has sat, and the gesture its hands make. Play
// asks to sit (the map walks the party there and sits it down), plays the game, and asks to stand.
export const useTable = create<{ at: { areaId: string; assetId: string; stool: number } | null; seated: boolean; shot?: Shot; shotKey: number; sit: (at: { areaId: string; assetId: string; stool: number }) => void; arrived: () => void; stand: () => void; gesture: (shot: Shot) => void }>((set) => ({
  at: null,
  seated: false,
  shotKey: 0,
  sit: (at) => set({ at, seated: false }),
  arrived: () => set({ seated: true }),
  stand: () => set({ at: null, seated: false }),
  gesture: (shot) => set((s) => ({ shot, shotKey: s.shotKey + 1 })),
}));
// What Play may ask of the people of the room the party is in (set while a Life is drawn)
export const lifeLink: { current: LifeApi | null } = { current: null };

export interface LifeApi {
  // The people at a card table's stools and who deals, and which stools are free (in the table's own order)
  table: (assetId: string) => { players: { id: string; name: string; note?: string }[]; dealer?: { id: string; name: string }; free: number[] };
  // Patrons not seated are asked to take free stools of a table, up to `count` of them
  recruit: (assetId: string, count: number) => void;
  // A person at a table makes a gesture, says something, or is kept in their seat while a game is on
  gesture: (occupantId: string, shot: Shot) => void;
  say: (occupantId: string, text: string) => void;
  hold: (occupantIds: string[], on: boolean) => void;
  // The member of staff at a counter, if anyone serves there
  servedBy: (counterId: string) => Occupant | undefined;
  // Ask them over to the side of the counter nearest the party; `done` when they are there
  summon: (counterId: string, near: Sq, done: () => void) => boolean;
}

const sqKey = (s: Sq) => `${s.x},${s.y}`;
const apart = (a: Sq, b: Sq) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const between = (low: number, high: number) => low + Math.random() * (high - low);
const anyOf = <T,>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];
const squareOf = (a: { x: number; y: number }): Sq => ({ x: Math.round(a.x), y: Math.round(a.y) });
const ring = (s: Sq) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: s.x + dx, y: s.y + dy }))).filter((q) => q.x !== s.x || q.y !== s.y);

// Who stands where on the map the party is on (2026-10-26, the user: "followers and party members should be at least one square away
// from the party leader when stationary; npcs, droids, party members should NEVER share the same square when stationary"). The leader,
// the companions and beasts following, the people of the room or street and those of an encounter each claim, by id, the square they
// stand on or the one they are walking to, in the party's squares; a follower or someone going about their day takes a square nobody
// else has claimed, and someone standing where the leader stops steps aside.
const claims = new Map<string, string>();
export const LEADER = "leader";
const claimSquare = (id: string, sq: Sq | null) => (sq ? claims.set(id, sqKey(sq)) : claims.delete(id));
const claimedBy = (sq: Sq, self?: string): string | undefined => {
  const key = sqKey(sq);
  for (const [id, at] of claims) if (id !== self && at === key) return id;
  return undefined;
};
// (read by the play-through test and the tests: who stands on each square)
if (typeof window !== "undefined") (window as unknown as { __claims?: () => Record<string, string> }).__claims = () => Object.fromEntries(claims);
// The squares a follower may stand on round the leader: open, nobody else's, at least `gap` squares from the leader (one clear square
// between them), the nearest to where the follower is now, a little behind the leader; closer in only where the room leaves no such square
function followSpot(open: (x: number, y: number) => boolean, lead: Sq, from: Sq, self: string, behind: Sq, gap = 2): Sq {
  for (const min of [gap, 1]) {
    let best: Sq | null = null;
    let bestScore = Infinity;
    for (let r = min; r <= min + 3; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const q = { x: lead.x + dx, y: lead.y + dy };
        if (!open(q.x, q.y) || claimedBy(q, self)) continue;
        const score = Math.hypot(q.x - from.x, q.y - from.y) * 0.6 + r * 1.2 - (dx * behind.x + dy * behind.y) * 0.5;
        if (score < bestScore) [best, bestScore] = [q, score];
      }
      if (best) return best;
    }
  }
  return nearestOpen((x, y) => open(x, y) && !claimedBy({ x, y }, self) && (x !== lead.x || y !== lead.y), lead);
}

// Where everyone in the room the party is in is drawn just now, by plan asset, in the room's squares
const drawnAt = new Map<string, Sq>();
export const whereNow = (assetId: string): Sq | undefined => drawnAt.get(assetId);

// What a musician plays, held in front of them
function Instrument({ name = "" }: { name?: string }) {
  const n = name.toLowerCase();
  if (/drum/.test(n)) return <Cyl at={[0, 0.62, 0.26]} r={0.16} h={0.22} color="#a33b3b" />;
  if (/lute|mandoviol|xantha/.test(n)) return <><Box at={[0.05, 0.72, 0.2]} size={[0.24, 0.3, 0.07]} color={WOOD} rot={[0, 0, 0.5]} /><Box at={[-0.13, 0.94, 0.2]} size={[0.04, 0.34, 0.04]} color={WOOD_DARK} rot={[0, 0, 0.5]} /></>;
  if (/ommni|bandfill|traz/.test(n)) return <><Box at={[0, 0.7, 0.28]} size={[0.44, 0.08, 0.2]} color={DARK} /><Box at={[0, 0.75, 0.28]} size={[0.36, 0.02, 0.12]} color={GLOW} glow={1.2} /></>;
  // Horns and pipes
  return <Solid at={[0.06, 0.9, 0.28]} color="#d9b45a" rot={[1.2, 0, 0]}><cylinderGeometry args={[0.03, 0.09, 0.5, 10]} /></Solid>;
}

// Which way of life someone has, from who they are and what stands near them
function brainOf(o: Occupant, home: Sq, setting: Setting, guards: number): { brain: Brain; counter?: string } {
  // An arena's crowd stands on the stands and watches the pit
  if (o.role === "spectator" && setting.stands?.(home) !== undefined) return { brain: "spectator" };
  // The croupier of a house with a Sabacc table sits at it and deals
  if (o.role === "croupier" && setting.seats.some((s) => s.stools?.length)) return { brain: "dealer" };
  if (o.role === "guard") return { brain: guards === 0 ? "post" : guards === 1 ? "round" : "still" };
  if (o.disposition === "hostile") return { brain: "still" };
  if (o.role === "musician" && setting.stage.length) return { brain: "musician" };
  if (o.role === "service droid") return { brain: "droid" };
  if (isLocal(o) || /smuggler|bounty|informant|gambler|pilot for hire/.test(o.role)) return { brain: "patron" };
  const counter = setting.counters.find((c) => [...c.behind, ...c.front].some((s) => s.x === home.x && s.y === home.y));
  return counter ? { brain: "staff", counter: counter.asset.id } : { brain: "still" };
}

// Who someone is, for the model that makes what they say (voice.ts `chatter`)
const chatPerson = (o: Pick<Occupant, "id" | "name" | "species" | "role" | "gender">): ChatPerson => ({ id: o.id, name: o.name, species: o.species, role: o.role, gender: o.gender });
// How long a line of talk stays up (a reading pace), and how long two people wait for the model's next line before they give up
const talkSeconds = (text: string) => Math.min(6, Math.max(2.4, text.split(/\s+/).length * 0.33));
const TALK_PATIENCE = 25;
// The town's talk of the party is given to one talk in three (given to every one, the model talks of nothing else): the rest are of their own lives
const gossip = (seed: number, news?: string) => (Math.floor(seed / 7) % 3 === 0 ? news : undefined);
// A talk of the pit (HOUSE RULE, 2026-11-02): by each item's own chance (3 in 10 the day of the bout, 1 in 5 the day after, 1 in 10, 1 in 20; on the
// Friday before, 1 in 8 for each day of the weekend), more in the arena itself; the model is given the news, the stock lines are said where it is not running
function pitTalk(seed: number, boost: number): { news: string; lines: () => TalkLine[] } | undefined {
  const item = pitGossip(useTalkWorld.getState().pit, seed, boost);
  return item ? { news: `${item.kind === "result" ? "Everyone has heard of the pit" : "Everyone is talking of the pit"}: ${item.text}.`, lines: () => pitLines(item, seed) } : undefined;
}

function Life({ people, setting, party, frozen, onTap, api, record, origin = { x: 0, y: 0 } }: {
  // Who is here; `at` is their place in the plan, or none for someone visiting (they take a free seat)
  people: { key: string; occupant: Occupant; at: Sq | null }[];
  setting: Setting;
  // Where the party stands, in the scene's squares (none: it is not here)
  party: () => Sq | null;
  // Whether someone has noticed the party and stands watching it
  frozen: (o: Occupant) => boolean;
  onTap?: (agent: { key: string; occupant: Occupant; at: Sq; counter?: string }) => void;
  api?: { current: LifeApi | null };
  // Keep where everyone is drawn, for a fight that starts here
  record?: boolean;
  // Where the scene's squares start in the party's (a room's corner on its building's grid), for the squares claimed (`claims`)
  origin?: Sq;
}) {
  const signature = people.map((p) => `${p.key}:${p.occupant.id}`).join();
  // Everyone drawn: those here, and those on their way out. Newcomers once the scene is up walk
  // in from the nearest door; those whose day takes them elsewhere walk out by one.
  const roster = useRef<Agent[]>([]);
  const shown = useRef(false);
  const [, redraw] = useState(0);
  useMemo(() => {
    const list = roster.current;
    const wanted = new Set(people.map((p) => p.key));
    for (const a of list) {
      if (wanted.has(a.key) || a.leaving) continue;
      Object.assign(a, { leaving: true, path: [], goal: undefined, then: undefined, call: undefined, wait: 0 });
    }
    let guards = list.filter((a) => a.occupant.role === "guard" && !a.leaving).length;
    const taken = new Set(list.map((a) => sqKey(a.home)));
    for (const p of people) {
      const known = list.find((a) => a.key === p.key);
      if (known) {
        // Turned back before they got out
        if (known.leaving) Object.assign(known, { leaving: false, path: [], wait: 0, doing: known.brain === "patron" ? "back" : known.doing });
        known.occupant = p.occupant;
        continue;
      }
      const seat = setting.seats.flatMap((s) => s.spots).find((q) => !taken.has(sqKey(q)));
      let spot = p.at ?? seat ?? nearestOpen((x, y) => setting.open(x, y) && !taken.has(`${x},${y}`), setting.watch);
      const { brain, counter } = brainOf(p.occupant, spot, setting, guards);
      // (the dealer's stool is the first of a table's, kept for them)
      if (brain === "dealer") {
        const mine = setting.seats.flatMap((s) => (s.stools?.length ? [s.stools[0].spot] : [])).find((q) => !taken.has(sqKey(q)));
        if (mine) spot = mine;
      }
      // Those already in the room when the scene opens are at the tables, most of them (a Sabacc table's stools fill)
      if (brain === "patron" && !(shown.current && setting.doors.length) && Math.random() < 0.8) {
        const free = setting.seats.flatMap((s) => (s.stools ?? []).slice(1).map((t) => t.spot)).filter((q) => !taken.has(sqKey(q)));
        if (free.length) spot = free[Math.floor(Math.random() * free.length)];
      }
      taken.add(sqKey(spot));
      const door = shown.current && setting.doors.length ? [...setting.doors].sort((a, b) => apart(a, spot) - apart(b, spot))[0] : undefined;
      if (p.occupant.role === "guard") guards++;
      const start = door ?? spot;
      const a: Agent = { key: p.key, occupant: p.occupant, brain, counter, home: spot, x: start.x, y: start.y, path: [], wait: door ? 0 : between(1, 12), doing: brain === "patron" ? (door ? "arriving" : "seated") : brain === "spectator" ? "watching" : brain === "musician" ? "playing" : brain === "dealer" ? (door ? "arriving" : "dealing") : brain, leg: 0, phase: Math.random() * 6, pose: { current: { ...seatState(), act: brain === "dealer" ? "deal" : "hold", cards: brain === "dealer" ? 0 : 2 } }, sitK: 0, gesture: between(1, 6), shots: 0 };
      if (door) a.path = route(setting.open, door, [spot]) ?? [];
      list.push(a);
    }
  }, [signature]);
  const agents = roster.current;
  useEffect(() => {
    shown.current = true;
  }, []);
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const band = useRef({ playing: true, timer: between(45, 80) });
  // An arena's crowd roars together now and then
  const roar = useRef(between(6, 14));
  const [playing, setPlaying] = useState(true);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const saying = useRef<Record<string, number>>({});
  const dirty = useRef(new Set<string>());
  const orders = useRef<{ counter: string; at: Sq }[]>([]);
  const still = useRef({ at: "", for: 0, served: -60, clock: 0 });
  const notes = useRef<THREE.Group>(null);

  const say = (a: Agent, text: string, seconds = 3) => {
    saying.current[a.key] = still.current.clock + seconds;
    setBubbles((b) => ({ ...b, [a.key]: text }));
  };
  // Two people talk (2026-11-02; the user: "We need NPCs that talk to one another"): they face each other and take turns at a few lines,
  // made by the local model (voice.ts `chatter`; the stock lines of relations.ts `smallTalk` only when it is not running), the one speaking
  // with a hand that gestures (limbs.ts "talk"); either walking off ends it. The model makes one talk at a time on the page: while another is
  // going, nobody stops to talk.
  const talking = (a: Agent) => !!a.talk;
  const converse = (a: Agent, b: Agent) => {
    if (a === b || talking(a) || talking(b) || a.leaving || b.leaving || a.held || b.held || b.path.length || b.call || frozen(a.occupant) || frozen(b.occupant)) return false;
    const seed = hue(`${a.key}|${b.key}|${Math.floor(still.current.clock / 60)}`);
    const lines: TalkLine[] = [];
    const lead: NonNullable<Agent["talk"]> = { with: b, lines, i: 0, next: 0.3, lead: true, last: still.current.clock };
    const [ta, tb] = setting.talkers?.(a.occupant, b.occupant) ?? [chatPerson(a.occupant), chatPerson(b.occupant)];
    // (a talk of the pit now and then: its bouts of the last days and the coming ones, shared/logic/pitbets.ts pitNews, more in the arena itself)
    const pit = pitTalk(seed, setting.talk === "arena" ? 3 : 1);
    const cancel = chatter({ a: ta, b: tb, scene: setting.scene ?? "", news: pit?.news ?? gossip(seed, setting.news), turns: 2 + (seed % 3), fallback: () => (pit ? pit.lines() : smallTalk(setting.talk ?? "any", seed)), onLine: (line) => lines.push(line), onEnd: () => { lead.done = true; } });
    if (!cancel) return false;
    lead.cancel = cancel;
    a.talk = lead;
    b.talk = { with: a, lines, i: 0, next: 0, lead: false };
    a.face = () => squareOf(b);
    b.face = () => squareOf(a);
    // (kept from their own business until the talk ends, which lets them go again)
    a.wait = Math.max(a.wait, 60);
    b.wait = Math.max(b.wait, 60);
    return true;
  };
  const endTalk = (a: Agent) => {
    const b = a.talk?.with;
    (a.talk?.lead ? a.talk : b?.talk)?.cancel?.();
    for (const x of [a, b]) if (x) {
      x.talk = undefined;
      if (x.pose.current.stand === "talk") x.pose.current.stand = undefined;
      x.wait = Math.min(x.wait, between(2, 6));
    }
  };
  // Someone to talk to: another person here, close by and not busy
  const nearby = (a: Agent, reach: number, ok: (o: Agent) => boolean) =>
    agents.filter((o) => o !== a && !o.leaving && !o.talk && !o.path.length && o.brain === a.brain && apart(squareOf(o), squareOf(a)) <= reach && ok(o)).sort((p, q) => apart(squareOf(p), squareOf(a)) - apart(squareOf(q), squareOf(a)))[0];
  const mapSq = (s: Sq): Sq => ({ x: s.x + origin.x, y: s.y + origin.y });
  // (a square someone else here is going to or standing on, or that the party or a follower has claimed)
  const claimed = (s: Sq, self: Agent) => agents.some((o) => o !== self && ((o.goal && o.goal.x === s.x && o.goal.y === s.y) || (!o.path.length && squareOf(o).x === s.x && squareOf(o).y === s.y))) || !!claimedBy(mapSq(s), `life:${self.key}`);
  const homeOfOther = (s: Sq, self: Agent) => agents.some((o) => o !== self && o.home.x === s.x && o.home.y === s.y);
  // Set off for the nearest free one of the given squares, to do something there for a while
  const goTo = (a: Agent, goals: Sq[], doing: string, wait: number, face?: Agent["face"], then?: () => void) => {
    const me = party();
    const free = goals.filter((g) => setting.open(g.x, g.y) && !claimed(g, a) && !(me && me.x === g.x && me.y === g.y));
    const path = free.length ? route(setting.open, squareOf(a), free) : null;
    if (!path) {
      a.wait = between(2, 5);
      return false;
    }
    a.path = path;
    a.goal = path.length ? path[path.length - 1] : undefined;
    a.doing = doing;
    a.wait = wait;
    a.face = face;
    a.then = path.length ? then : undefined;
    // Already there
    if (!path.length) then?.();
    return true;
  };
  const seatOf = (s: Sq) => setting.seats.find((seat) => seat.spots.some((p) => p.x === s.x && p.y === s.y));
  const leaveSeat = (a: Agent) => {
    const seat = seatOf(squareOf(a));
    if (seat && agents.some((o) => o.brain === "droid")) dirty.current.add(seat.id);
  };
  const freeSeats = (a: Agent) => setting.seats.flatMap((seat) => seat.spots).filter((s) => !homeOfOther(s, a) && !claimed(s, a));
  // A stool of a Sabacc table (2026-10-27): whoever stands at its square sits on it; those who like a game choose one now and then
  const stoolAt = (s: Sq) => setting.seats.flatMap((t) => t.stools ?? []).find((t) => t.spot.x === s.x && t.spot.y === s.y);
  const pickSeat = (a: Agent) => {
    const all = freeSeats(a);
    const stools = all.filter((s) => !!stoolAt(s));
    return stools.length && Math.random() < 0.6 ? anyOf(stools) : anyOf(all);
  };
  const tabled = setting.seats.some((s) => s.stools?.length);
  const facing = (seat?: Setting["seats"][number]): Sq | undefined => (seat ? { x: seat.centre[0] - 0.5, y: seat.centre[2] - 0.5 } : undefined);
  const fronts = setting.counters.flatMap((c) => c.front);
  const counterAt = (s: Sq) => setting.counters.find((c) => c.front.some((f) => f.x === s.x && f.y === s.y));
  const centreOf = (asset: RoomAsset): Sq => ({ x: asset.x + (asset.w - 1) / 2, y: asset.y + (asset.h - 1) / 2 });
  // The middle of the stage, where the music is shown rising, and the room the band plays to
  const audience: Sq = setting.stage.length ? { x: setting.stage.reduce((s, q) => s + q.x, 0) / setting.stage.length, y: setting.stage.reduce((s, q) => s + q.y, 0) / setting.stage.length } : setting.watch;
  const roomCentre = setting.watch;
  const order = (a: Agent) => () => {
    const counter = counterAt(squareOf(a));
    if (!counter) return;
    a.face = centreOf(counter.asset);
    orders.current = [...orders.current.slice(-8), { counter: counter.asset.id, at: squareOf(a) }];
  };

  const think = (a: Agent) => {
    // (kept in their seat by a game that is on)
    if (a.held) return void (a.wait = 3);
    const roll = Math.random();
    const r = roll;
    if (a.leaving) {
      // Taken off the roster after this frame's round
      const gone = () => {
        a.doing = "gone";
      };
      if (!setting.doors.length || !goTo(a, setting.doors, "leaving", 0, undefined, gone)) gone();
      return;
    }
    if (a.brain === "patron") {
      if (a.doing === "seated") {
        const atBar = agents.filter((o) => o.doing === "at the bar").length;
        const others = agents.filter((o) => o !== a && o.brain === "patron" && o.doing === "seated" && !o.path.length);
        // (one at a Sabacc table keeps to the game: they get up much more rarely)
        const r = stoolAt(squareOf(a)) ? 0.45 + Math.random() * 0.55 : roll;
        if (r < 0.3 && fronts.length && atBar < 2) {
          leaveSeat(a);
          goTo(a, fronts, "at the bar", between(8, 16), undefined, order(a));
        } else if (r < 0.45 && others.length) {
          const other = anyOf(others)!;
          leaveSeat(a);
          goTo(a, ring(squareOf(other)), "visiting", between(10, 20), () => squareOf(other), () => void converse(a, other));
        } else if (r < 0.55) {
          const seat = pickSeat(a);
          if (seat) {
            leaveSeat(a);
            a.home = seat;
            goTo(a, [seat], "seated", stoolAt(seat) ? between(40, 100) : between(15, 40), facing(seatOf(seat)));
          } else a.wait = between(10, 25);
        } else if (r < 0.75 && !stoolAt(squareOf(a))) {
          // A word with whoever sits at the same table, or stands close by
          const mate = nearby(a, 2, (o) => o.doing === "seated" && !stoolAt(squareOf(o)));
          if (!mate || !converse(a, mate)) a.wait = between(10, 30);
        } else a.wait = between(10, 30);
      } else {
        // Back to a seat, sometimes another one
        if (Math.random() < 0.25) a.home = pickSeat(a) ?? a.home;
        if (!goTo(a, [a.home], "seated", stoolAt(a.home) ? between(40, 100) : between(15, 40), facing(seatOf(a.home)))) a.home = pickSeat(a) ?? a.home;
      }
    } else if (a.brain === "dealer") {
      // The croupier sits at the table and deals; now and then they call the game
      if (apart(squareOf(a), a.home) > 0) goTo(a, [a.home], "dealing", between(6, 12), facing(seatOf(a.home)));
      else {
        a.doing = "dealing";
        a.face = facing(seatOf(a.home));
        a.wait = between(8, 16);
        if (Math.random() < 0.5) say(a, anyOf(["Place your bets.", "Cards are down.", "Ante up, friends.", "The shift is on.", "Sabacc!", "Last call for bets."])!, 3);
      }
    } else if (a.brain === "staff") {
      const counter = setting.counters.find((c) => c.asset.id === a.counter);
      if (!counter) return void (a.wait = 10);
      const nearest = (to: Sq) => [...counter.behind].filter((s) => setting.open(s.x, s.y)).sort((p, q) => Math.hypot(p.x - to.x, p.y - to.y) - Math.hypot(q.x - to.x, q.y - to.y)).slice(0, 1);
      if (a.call) {
        const { near, done } = a.call;
        a.call = undefined;
        const there = nearest(near);
        const arrive = () => {
          a.doing = "attending";
          say(a, anyOf(["What'll it be?", "What can I get you?", "Yes?", "Need something?"])!);
          done();
        };
        if (!there.length || !goTo(a, there, "attending", 20, near, arrive)) {
          a.path = [];
          a.face = near;
          a.wait = 20;
          arrive();
        }
      } else if (orders.current.some((o) => o.counter === counter.asset.id)) {
        const order = orders.current.splice(orders.current.findIndex((o) => o.counter === counter.asset.id), 1)[0];
        goTo(a, nearest(order.at), "serving", between(3, 6), order.at, () => Math.random() < 0.3 && say(a, anyOf(["Here you go.", "On the house. Not.", "Another?"])!));
      } else if (r < 0.5) {
        const elsewhere = counter.behind.filter((s) => apart(s, squareOf(a)) > 0);
        if (elsewhere.length) goTo(a, [anyOf(elsewhere)!], "pacing", between(5, 12), centreOf(counter.asset));
        else a.wait = between(4, 9);
      }
      else if (r < 0.62) {
        // Two of the staff behind one counter (a pair of bookmakers, two at a bar) pass the time
        const mate = nearby(a, 3, (o) => o.counter === a.counter);
        if (!mate || !converse(a, mate)) a.wait = between(4, 9);
      } else a.wait = between(4, 9);
    } else if (a.brain === "spectator") {
      // On the stands: watching the pit, cheering now and then, a word with a neighbour
      a.face = setting.pit ?? setting.watch;
      if (r < 0.4) {
        a.cheer = between(1.5, 4);
        a.wait = a.cheer + between(1, 4);
        if (Math.random() < 0.15) say(a, anyOf(["Get up!", "Finish it!", "Come on!", "Hit him!", "Again! Again!", "That's my credits!"])!, 2);
      } else if (r < 0.55) {
        const mate = nearby(a, 2, () => true);
        if (!mate || !converse(a, mate)) a.wait = between(3, 8);
      } else a.wait = between(3, 8);
    } else if (a.brain === "musician") {
      if (band.current.playing) {
        if (apart(squareOf(a), a.home) === 0 && !a.path.length) {
          a.doing = "playing";
          a.face = roomCentre;
          a.wait = 2;
        } else goTo(a, [a.home], "playing", 2, roomCentre);
      } else {
        // On a break: mingle with someone, sit in at a table, or go up to the bar
        leaveSeat(a);
        const patrons = agents.filter((o) => o.brain === "patron" && !o.path.length);
        if (r < 0.35 && patrons.length) {
          const other = anyOf(patrons)!;
          goTo(a, ring(squareOf(other)), "mingling", between(10, 20), () => squareOf(other), () => void converse(a, other));
        } else if (r < 0.7 && freeSeats(a).length) {
          const seat = anyOf(freeSeats(a))!;
          goTo(a, [seat], "sitting in", between(12, 22), facing(seatOf(seat)));
        } else if (fronts.length) {
          goTo(a, fronts, "at the bar", between(8, 15), undefined, order(a));
        } else a.wait = between(5, 10);
      }
    } else if (a.brain === "droid") {
      const mess = setting.seats.find((seat) => dirty.current.has(seat.id) && !agents.some((o) => o.brain === "patron" && o.doing === "seated" && seat.spots.some((s) => s.x === o.home.x && s.y === o.home.y && apart(squareOf(o), s) === 0)));
      const me = party();
      if (mess) {
        goTo(a, mess.spots, "cleaning", 4, undefined, () => dirty.current.delete(mess.id));
      } else if (r < 0.2 && me && still.current.for > 5 && still.current.clock - still.current.served > 45) {
        still.current.served = still.current.clock;
        goTo(a, ring(me), "serving", 4, () => party() ?? undefined, () => say(a, anyOf(["Beep-boop? (A drink?)", "Bweep! (Order?)", "Whirr. (Refill?)"])!));
      } else if (r < 0.5) {
        const customer = anyOf(agents.filter((o) => o.brain === "patron" && o.doing === "seated" && !o.path.length));
        if (customer) goTo(a, ring(squareOf(customer)), "serving", 4, () => squareOf(customer));
        else a.wait = between(3, 6);
      } else goTo(a, [a.home], "docked", between(6, 12));
    } else if (a.brain === "post") {
      if (apart(squareOf(a), a.home) > 0) goTo(a, [a.home], "post", 2, setting.watch);
      else {
        a.face = setting.watch;
        a.wait = 2;
      }
    } else if (a.brain === "round") {
      const post = agents.find((o) => o.brain === "post");
      if (a.doing === "checking in" && post) {
        // Change places now and then: the one on the round takes the post
        if (a.swap) {
          a.swap = false;
          a.brain = "post";
          post.brain = "round";
          [a.home, post.home] = [post.home, a.home];
          post.leg = 0;
          post.path = [];
          post.wait = 0.5;
          post.doing = "round";
          say(a, "I'll take the post.", 2.5);
          goTo(a, [a.home], "post", 2, setting.watch);
          return;
        }
        a.doing = "round";
      }
      if (a.leg < setting.round.length) {
        goTo(a, [setting.round[a.leg]], "round", between(1, 3));
        a.leg++;
      } else if (post) {
        a.leg = 0;
        goTo(a, ring(post.home), "checking in", 3.5, () => squareOf(post), () => {
          say(a, anyOf(["All quiet.", "Nothing out there.", "Round's clear."])!, 2.5);
          say(post, anyOf(["Stay sharp.", "Good. Carry on.", "Keep your eyes open."])!, 2.5);
          post.face = squareOf(a);
          a.swap = Math.random() < 0.35;
        });
      } else a.leg = 0;
    } else {
      // Someone who keeps to their place looks about now and then
      a.face = anyOf(ring(a.home));
      a.wait = between(6, 14);
    }
  };

  // Called over by the party
  useEffect(() => {
    if (!api) return;
    const stoolsOfTable = (assetId: string) => setting.seats.find((s) => s.id === assetId)?.stools ?? [];
    const sitsAt = (a: Agent, t: { spot: Sq }) => !a.leaving && (apart(squareOf(a), t.spot) === 0 || (a.goal && apart(a.goal, t.spot) === 0));
    api.current = {
      table: (assetId) => {
        const stools = stoolsOfTable(assetId);
        const players: { id: string; name: string; note?: string }[] = [];
        let dealer: { id: string; name: string } | undefined;
        const free: number[] = [];
        stools.forEach((t, i) => {
          const who = agents.find((a) => sitsAt(a, t));
          if (!who) return void free.push(i);
          if (who.brain === "dealer") dealer = { id: who.occupant.id, name: who.occupant.name };
          else players.push({ id: who.occupant.id, name: who.occupant.name, note: [who.occupant.species, who.occupant.role].filter(Boolean).join(", ") });
        });
        return { players, dealer, free };
      },
      recruit: (assetId, count) => {
        const stools = stoolsOfTable(assetId);
        let need = count;
        for (const t of stools.slice(1)) {
          if (need <= 0) break;
          if (agents.some((a) => sitsAt(a, t) || (a.home.x === t.spot.x && a.home.y === t.spot.y && !a.leaving))) continue;
          const who = agents.filter((a) => a.brain === "patron" && !a.leaving && !a.held && !stoolAt(squareOf(a))).sort((p, q) => apart(squareOf(p), t.spot) - apart(squareOf(q), t.spot))[0];
          if (!who) break;
          who.home = t.spot;
          goTo(who, [t.spot], "seated", between(80, 140), facing(setting.seats.find((s) => s.id === assetId)));
          need--;
        }
      },
      gesture: (occupantId, shot) => {
        const a = agents.find((o) => o.occupant.id === occupantId);
        if (a) Object.assign(a.pose.current, { shot, shotKey: ++a.shots });
      },
      say: (occupantId, text) => {
        const a = agents.find((o) => o.occupant.id === occupantId);
        if (a) say(a, text, 3);
      },
      hold: (ids, on) => {
        for (const a of agents) if (ids.includes(a.occupant.id)) { a.held = on; if (on) a.wait = Math.max(a.wait, 3); }
      },
      servedBy: (counterId) => agents.find((a) => a.brain === "staff" && a.counter === counterId && !a.leaving)?.occupant,
      summon: (counterId, near, done) => {
        const staff = agents.find((a) => a.brain === "staff" && a.counter === counterId && !a.leaving);
        if (!staff) return false;
        staff.call = { near, done };
        staff.path = [];
        staff.goal = undefined;
        staff.then = undefined;
        staff.wait = 0;
        return true;
      },
    };
    lifeLink.current = api.current;
    const mine = api.current;
    return () => {
      if (lifeLink.current === mine) lifeLink.current = null;
      api.current = null;
    };
  }, [agents]);
  useEffect(() => () => {
    if (record) agents.forEach((a) => drawnAt.delete(a.key));
    agents.forEach((a) => claims.delete(`life:${a.key}`));
  }, [agents]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.25);
    const clock = (still.current.clock += dt);
    const me = party();
    // How long the party has stood on one square
    const at = me ? sqKey(me) : "";
    still.current.for = at === still.current.at ? still.current.for + dt : 0;
    still.current.at = at;
    // The band plays a set, then all of them stop together for a break
    const b = band.current;
    if (agents.some((a) => a.brain === "musician") && (b.timer -= dt) <= 0) {
      b.playing = !b.playing;
      b.timer = b.playing ? between(50, 90) : between(30, 55);
      setPlaying(b.playing);
      for (const a of agents.filter((o) => o.brain === "musician")) {
        a.path = [];
        a.goal = undefined;
        a.then = undefined;
        a.wait = between(0, 1.5);
      }
    }
    if (setting.stands && (roar.current -= dt) <= 0) {
      roar.current = between(10, 22);
      const crowd = agents.filter((o) => o.brain === "spectator" && !o.talk);
      for (const o of crowd) o.cheer = Math.max(o.cheer ?? 0, between(2, 4));
      const voice = anyOf(crowd);
      if (voice) say(voice, anyOf(["Blood! Blood!", "Ohhh!", "Did you see that?!", "Down he goes!", "Fight! Fight! Fight!"])!, 2.2);
    }
    const expired = Object.entries(saying.current).filter(([, until]) => until < clock).map(([key]) => key);
    if (expired.length) {
      expired.forEach((key) => delete saying.current[key]);
      setBubbles((old) => Object.fromEntries(Object.entries(old).filter(([key]) => !expired.includes(key))));
    }

    for (const a of agents) {
      const group = groups.current[a.key];
      // At a table: down onto the stool once they have sat, up off it before they go (the figure eases by the same clock: interiors/limbs.ts)
      const atStool = !a.leaving && !a.path.length && (a.doing === "seated" || a.doing === "sitting in" || a.doing === "dealing") ? stoolAt(squareOf(a)) : undefined;
      if (atStool) a.stool = atStool;
      a.pose.current.sit = !!atStool;
      a.sitK = easeSit(a.sitK, !!atStool, dt);
      if (!atStool && a.sitK <= 0) a.stool = undefined;
      if (a.sitK > 0.9) {
        const p = a.pose.current;
        p.act = a.brain === "dealer" ? "deal" : "hold";
        p.cards = a.brain === "dealer" ? 0 : 2;
        // a player draws, bets, thinks, calls or folds now and then
        if (a.brain !== "dealer" && !a.held && (a.gesture -= dt) <= 0) {
          a.gesture = between(3.5, 9);
          p.shot = anyOf<Shot>(["draw", "draw", "bet", "think", "think", "call", "fold"]);
          p.shotKey = ++a.shots;
        }
      }
      // Talking: the one who began it keeps the time; each line in turn, the speaker's hand going (limbs.ts "talk")
      if (a.talk) {
        const t = a.talk;
        const other = t.with;
        if (a.path.length || other.path.length || a.leaving || other.leaving || other.talk?.with !== a || frozen(a.occupant) || frozen(other.occupant)) endTalk(a);
        else if (t.lead && (t.next -= dt) <= 0) {
          // (the last line is still being said aloud)
          if (t.speaking) t.next = 0.2;
          else if (t.i < t.lines.length) {
            const line = t.lines[t.i++];
            const [speaker, listener] = line.who === 0 ? [a, other] : [other, a];
            const seconds = talkSeconds(line.text);
            const heard = voiceLine(speaker.occupant, line.text, me ? Math.hypot(speaker.x - me.x, speaker.y - me.y) : Infinity);
            if (heard) {
              t.speaking = true;
              void heard.finally(() => { t.speaking = false; t.last = still.current.clock; });
            }
            say(speaker, line.text, heard ? seconds + 3 : seconds);
            speaker.pose.current.stand = "talk";
            if (listener.pose.current.stand === "talk") listener.pose.current.stand = undefined;
            t.next = seconds + 0.3;
            t.last = clock;
          } else if (t.done || clock - (t.last ?? clock) > TALK_PATIENCE) endTalk(a);
          // (the next line is still being made)
          else t.next = 0.2;
        }
      }
      // A spectator cheers while their cheer lasts (not while talking)
      if (a.brain === "spectator") {
        a.cheer = Math.max(0, (a.cheer ?? 0) - dt);
        if (!a.talk) a.pose.current.stand = a.cheer > 0 ? "cheer" : undefined;
      }
      if (frozen(a.occupant) && me) {
        // Noticed: they stop where they are and watch the party
        a.path = [];
        a.goal = undefined;
        a.face = me;
      } else if (a.path.length) {
        // (off the stool first)
        let step = a.sitK > 0.02 ? 0 : dt * (a.brain === "droid" ? 1.6 : 2.2);
        while (step > 0 && a.path.length) {
          const next = a.path[0];
          const [dx, dy] = [next.x - a.x, next.y - a.y];
          const far = Math.hypot(dx, dy);
          if (group && far > 0.001) group.rotation.y = Math.atan2(dx, dy);
          if (far <= step) {
            a.x = next.x;
            a.y = next.y;
            a.path.shift();
            step -= far;
          } else {
            a.x += (dx / far) * step;
            a.y += (dy / far) * step;
            step = 0;
          }
        }
        if (!a.path.length) {
          a.goal = undefined;
          const then = a.then;
          a.then = undefined;
          then?.();
        }
      } else {
        a.wait -= dt;
        // Standing where the party or a follower stands still: step aside to a free square close by
        const crowd = claimedBy(mapSq(squareOf(a)), `life:${a.key}`);
        if (crowd && !a.occupant.disabled && !a.occupant.captive && !frozen(a.occupant)) {
          a.crowded = (a.crowded ?? 0) + dt;
          if (a.crowded > 0.4) {
            a.crowded = 0;
            const aside = ring(squareOf(a)).concat(ring(squareOf(a)).flatMap(ring)).filter((q) => setting.open(q.x, q.y) && !claimed(q, a));
            const step = aside.sort((p, q) => apart(p, squareOf(a)) - apart(q, squareOf(a)))[0];
            if (step) {
              const keep = { doing: a.doing, face: a.face };
              goTo(a, [step], keep.doing, between(4, 8), keep.face);
            }
          }
        } else a.crowded = 0;
        // Someone attending to the party goes back to work once the party walks off
        if (a.doing === "attending" && (!me || apart(me, squareOf(a)) > 3)) a.wait = Math.min(a.wait, 0);
        if (a.wait <= 0) think(a);
      }
      if (!group) continue;
      const face = typeof a.face === "function" ? a.face() : a.face;
      const toStool = !!a.stool && a.sitK > 0.3 && !a.path.length;
      if (!a.path.length && (toStool || (face && (face.x !== a.x || face.y !== a.y)))) {
        const want = toStool ? a.stool!.face : Math.atan2(face!.x - a.x, face!.y - a.y);
        let turn = want - group.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        group.rotation.y += turn * Math.min(1, dt * 6);
      }
      const onStage = setting.stage.some((s) => s.x === Math.round(a.x) && s.y === Math.round(a.y));
      const playingNow = a.brain === "musician" && b.playing && !a.path.length && apart(squareOf(a), a.home) === 0;
      // (on a stool, their square is the one beside it: they are carried onto it as they sit)
      const into = a.stool ? smooth(a.sitK) : 0;
      const [px, py] = a.stool ? [a.x + (a.stool.x - a.x) * into, a.y + (a.stool.y - a.y) * into] : [a.x, a.y];
      group.position.set(px + 0.5, (onStage ? setting.stageHeight : 0) + (setting.stands?.(squareOf(a)) ?? 0) + (playingNow ? Math.abs(Math.sin(state.clock.elapsedTime * 5 + a.phase)) * 0.07 : 0), py + 0.5);
      // A droid wiping a table turns on the spot
      if (a.brain === "droid" && a.doing === "cleaning" && !a.path.length) group.rotation.y += dt * 3;
      if (record) drawnAt.set(a.key, squareOf(a));
      claimSquare(`life:${a.key}`, a.doing === "gone" ? null : mapSq(a.goal ?? squareOf(a)));
    }
    if (agents.some((a) => a.doing === "gone")) {
      for (let i = agents.length - 1; i >= 0; i--) {
        if (agents[i].doing !== "gone") continue;
        drawnAt.delete(agents[i].key);
        agents.splice(i, 1);
      }
      redraw((n) => n + 1);
    }
    if (notes.current) {
      notes.current.visible = b.playing && setting.stage.length > 0;
      notes.current.children.forEach((child, i) => {
        child.position.y = 1.7 + ((state.clock.elapsedTime * 0.5 + i / 3) % 1) * 0.9;
        child.position.x = Math.sin(state.clock.elapsedTime * 1.5 + i * 2) * 0.5 + (i - 1) * 0.4;
      });
    }
  });

  const labelled = (o: Occupant) => o.disposition === "hostile" || !isLocal(o) || !!o.captive || !!o.disabled;
  return (
    <>
      {agents.map((a) => (
        <group key={a.key} ref={(g) => { groups.current[a.key] = g; }} position={[a.x + 0.5, 0, a.y + 0.5]} rotation={[0, hue(a.key) % 6, 0]}>
          <group rotation={a.occupant.disabled ? [-Math.PI / 2, 0, 0.4] : [0, 0, 0]} position={[0, a.occupant.disabled ? 0.14 : 0, 0]}>
            <Figure kind={tokenOf(a.occupant)} ring={a.occupant.disabled ? "#6b7280" : SIDE_COLORS[a.occupant.disposition]} name={a.occupant.name} large={isLarge(a.occupant.size)} species={a.occupant.species} role={a.occupant.role} creature={a.occupant.creature} size={a.occupant.size} seat={a.pose} unarmed={tabled && (a.brain === "patron" || a.brain === "dealer")} />
          </group>
          {a.occupant.captive && <><Box at={[-0.2, 0.15, 0]} size={[0.14, 0.1, 0.14]} color="#59636d" /><Box at={[0.2, 0.15, 0]} size={[0.14, 0.1, 0.14]} color="#59636d" /></>}
          {a.brain === "musician" && <Instrument name={a.occupant.loadout[0]} />}
          {a.brain === "droid" && <><Cyl at={[0, 0.82, 0.08]} r={0.2} h={0.03} color="#9aa3ad" /><Cyl at={[0.08, 0.9, 0.1]} r={0.04} h={0.14} color={AMBER} glow={0.8} /></>}
          {labelled(a.occupant) && <Label at={[0, isLarge(a.occupant.size) ? 2.2 : 1.6, 0]} size={0.26} color={SIDE_COLORS[a.occupant.disposition]}>{a.occupant.name}</Label>}
          {bubbles[a.key] && (
            <Html center position={[0, isLarge(a.occupant.size) ? 2.6 : 2.05, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div className="w-max max-w-[13rem] rounded-lg bg-gray-900/90 px-2 py-0.5 text-center text-xs text-amber-200 shadow">{bubbles[a.key]}</div>
            </Html>
          )}
          {onTap && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onTap({ key: a.key, occupant: a.occupant, at: squareOf(a), counter: a.brain === "staff" ? a.counter : undefined })} label={a.occupant.name} person />}
        </group>
      ))}
      {setting.stage.length > 0 && (
        <group ref={notes} position={[audience.x + 0.5, 0, audience.y + 0.5]} visible={playing}>
          {[0, 1, 2].map((i) => <Solid key={i} at={[0, 1.8, 0]} color={["#fde68a", GLOW, "#f472b6"][i]} glow={2}><octahedronGeometry args={[0.07]} /></Solid>)}
        </group>
      )}
    </>
  );
}

// A companion or a beast follows the party (2026-10-26: spaced out): it trails the leader and, when the leader stops, stands on a square
// of its own at least a square clear of the leader (one between them, where the room allows), never on anyone else's (`claims`). It turns
// smoothly toward where it goes. A droideka shuffles on its legs over a short step and rolls up to go further (models.tsx Droideka).
function Follower({ companion, index, feet, open, height, onTap, carts = [], biome = "", onCart, swimming }: { companion: Companion; index: number; feet: React.MutableRefObject<{ x: number; y: number }>; open: (x: number, y: number) => boolean; height: () => number; onTap?: () => void; carts?: Cart[]; biome?: string; onCart?: (id: string) => void; swimming?: () => boolean }) {
  const group = useRef<THREE.Group>(null);
  // (in the water, a companion on foot swims as the party does: a crawl when it moves, treading water when it stands: 2026-11-02, "Party members
  // should be drawn swimming if the environment requires it")
  const motionRef = useRef<Motion>(motion());
  const at = useRef<{ x: number; y: number } | null>(null);
  const goal = useRef<Sq>({ x: 0, y: 0 });
  // The leader's square when the goal was chosen, and which way the leader was going (to stand behind them)
  const anchor = useRef<Sq | null>(null);
  const heading = useRef<Sq>({ x: 0, y: -1 });
  const recheck = useRef(0);
  // The squares it walks to its goal (round what stands in the way: a follower used to glide in a straight line and went through walls)
  const path = useRef<Sq[]>([]);
  const id = `follow:${companion.id}`;
  const droideka = /droideka|destroyer droid/i.test(`${companion.name} ${companion.statBlock ?? ""}`);
  useEffect(() => () => { claims.delete(id); }, [id]);
  useFrame((_, delta) => {
    const lead = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
    const was = anchor.current;
    if (was && (was.x !== lead.x || was.y !== lead.y)) heading.current = { x: Math.sign(lead.x - was.x), y: Math.sign(lead.y - was.y) };
    const here = at.current ? squareOf(at.current) : lead;
    // A new square when the leader has moved on two squares, or the one chosen is someone else's now, or the leader has come up to it
    // (looked at twice a second: where the room is tight, a square next to the leader may be the only one)
    recheck.current -= delta;
    const near = Math.max(Math.abs(goal.current.x - lead.x), Math.abs(goal.current.y - lead.y));
    const tooClose = near < 1 || (near < 2 && recheck.current <= 0);
    if (recheck.current <= 0) recheck.current = 0.5;
    if (!at.current || !was || Math.max(Math.abs(was.x - lead.x), Math.abs(was.y - lead.y)) >= 2 || tooClose || claimedBy(goal.current, id)) {
      // (the order they were in keeps them from all going for the same square in one frame)
      goal.current = followSpot(open, lead, here, id, { x: -heading.current.x, y: -heading.current.y }, index >= 6 ? 1 : 2);
      anchor.current = lead;
      path.current = at.current && open(here.x, here.y) ? route(open, here, [goal.current]) ?? [] : [];
    }
    claimSquare(id, goal.current);
    if (!at.current) at.current = { ...goal.current };
    // (put in a wall by a room that changed, or left too far from the goal to find a way: it is set down at its goal)
    if (!open(Math.round(at.current.x), Math.round(at.current.y))) {
      at.current = { ...goal.current };
      path.current = [];
    }
    while (path.current.length && Math.hypot(path.current[0].x - at.current.x, path.current[0].y - at.current.y) < 0.12) path.current.shift();
    const way = path.current[0] ?? goal.current;
    const [mx, my] = [way.x - at.current.x, way.y - at.current.y];
    const far = Math.hypot(mx, my);
    // A droideka on its legs is slow (15 ft. to the ball's 60): it walks a short step and rolls up for a longer one
    const pace = droideka && far < 2.5 ? 0.9 : 6.5;
    const step = Math.min(far, Math.min(delta, 0.5) * pace);
    if (far > 0.02) {
      at.current = { x: at.current.x + (mx / far) * step, y: at.current.y + (my / far) * step };
      if (group.current) {
        const want = Math.atan2(mx, my);
        const turn = Math.atan2(Math.sin(want - group.current.rotation.y), Math.cos(want - group.current.rotation.y));
        group.current.rotation.y += turn * Math.min(1, delta * 10);
      }
    }
    if (group.current) group.current.position.set(at.current.x + 0.5, height(), at.current.y + 0.5);
    motionRef.current.posture = swimming?.() && companion.kind !== "beast" && companion.kind !== "droid" && companion.hp > 0 ? 3 : 0;
    // (read by the play-through tests: where each follower is drawn)
    ((window as unknown as { __followers?: Record<string, Sq> }).__followers ??= {})[companion.id] = { x: at.current.x, y: at.current.y };
  });
  const down = companion.hp <= 0;
  const beast = companion.kind === "beast";
  return (
    <group ref={group}>
      <group rotation={down ? [-Math.PI / 2, 0, 0.4] : [0, 0, 0]} position={[0, down ? 0.14 : 0, 0]}>
        <MotionContext.Provider value={motionRef}>
          <Figure kind={tokenOf({ name: companion.name, role: companion.kind === "droid" ? "utility droid" : beast ? "wildlife" : companion.role, creature: companion.creature })} ring={beast ? "#a3e635" : SIDE_COLORS.friendly} name={companion.name} large={isLarge(companion.size)} species={companion.species} role={companion.role} creature={companion.creature} size={companion.size} modules={companion.kind === "droid" ? companion.custom : undefined} />
        </MotionContext.Provider>
      </group>
      <Label at={[0, isLarge(companion.size) ? 2.2 : 1.6, 0]} size={0.26} color={beast ? "#a3e635" : SIDE_COLORS.friendly}>{companion.name}</Label>
      {onTap && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={onTap} label={companion.name} person />}
      <HandledCarts carts={carts} biome={biome} reach={isLarge(companion.size) ? 1.7 : 1.05} onTap={onCart} />
    </group>
  );
}
// The carts someone pushes (ahead of them, the push bar toward them) or pulls (behind them, turned about so the bar is toward them), in
// their own turned frame; a second one goes further out
function HandledCarts({ carts, biome, reach = 1.05, onTap }: { carts: Cart[]; biome: string; reach?: number; onTap?: (id: string) => void }) {
  return (
    <>
      {carts.map((c, i) => {
        const z = (c.mode === "push" ? reach - 0.05 : -reach) * (1 + i * 1.35);
        return (
          <group key={c.id} position={[0, 0, z]} rotation={[0, c.mode === "push" ? 0 : Math.PI, 0]}>
            <CartModel full={Math.min(1, c.pack.length / 8)} biome={biome} />
            {onTap && <Hit at={[0, 0.5, 0]} size={[0.8, 0.8, 1.3]} onTap={() => onTap(c.id)} label={c.name} />}
          </group>
        );
      })}
    </>
  );
}

// A person of a street encounter (see "The people in a district"): walks the open ground by `route` to a goal
// that may move (the party, a place), and says when it is within `stop` squares of it. `at` keeps its square
// for the scene to read, and `onArrive` is called once each time it comes up to the goal.
function Wanderer({ id, start, goal, open, stop = 1.6, speed = 3.6, warp = false, at, onArrive, children }: {
  id: string;
  start: Sq;
  goal: () => Sq | null;
  open: (x: number, y: number) => boolean;
  stop?: number;
  speed?: number;
  // One that is left far behind (a slow screen, a fast party) catches up at once, to a square by the goal
  warp?: boolean;
  at: React.MutableRefObject<Record<string, Sq>>;
  onArrive?: () => void;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const pos = useRef<Sq>({ ...start });
  const path = useRef<Sq[]>([]);
  const routedTo = useRef("");
  const arrived = useRef(false);
  const latest = useRef({ open, onArrive, goal });
  latest.current = { open, onArrive, goal };
  // (the people of an encounter on the map, by id and how many of each are standing there: read by the play-through test)
  useEffect(() => {
    const w = window as unknown as { __folk?: Record<string, number> };
    w.__folk = w.__folk ?? {};
    w.__folk[id] = (w.__folk[id] ?? 0) + 1;
    return () => { w.__folk![id] = (w.__folk![id] ?? 1) - 1; claims.delete(`folk:${id}`); };
  }, [id]);
  useFrame((_, delta) => {
    const g = latest.current.goal();
    const p = pos.current;
    if (g) {
      let far = Math.hypot(g.x - p.x, g.y - p.y);
      if (warp && far > 16) {
        pos.current = nearestOpen(latest.current.open, { x: Math.round(g.x) - 1, y: Math.round(g.y) });
        path.current = [];
        routedTo.current = "";
        far = Math.hypot(g.x - pos.current.x, g.y - pos.current.y);
      }
      if (far <= stop) {
        if (!arrived.current) {
          arrived.current = true;
          latest.current.onArrive?.();
        }
      } else {
        if (far > stop + 1.2) arrived.current = false;
        const [gx, gy] = [Math.round(g.x), Math.round(g.y)];
        if (routedTo.current !== `${gx},${gy}`) {
          routedTo.current = `${gx},${gy}`;
          // (one that is to stand on a square goes to that square; one that is to come up to someone, to any square by them)
          // (not a square the party or a follower stands on)
          const goals = stop < 1 && latest.current.open(gx, gy) ? [{ x: gx, y: gy }] : [{ x: gx, y: gy }, ...aroundSquares(gx, gy)].filter((q) => latest.current.open(q.x, q.y) && !claimedBy(q, `folk:${id}`));
          path.current = route(latest.current.open, { x: Math.round(p.x), y: Math.round(p.y) }, goals) ?? [];
        }
        let step = Math.min(delta, 1.5) * speed;
        while (step > 0 && path.current.length) {
          const next = path.current[0];
          const [mx, my] = [next.x - p.x, next.y - p.y];
          const d = Math.hypot(mx, my);
          if (d <= step) {
            pos.current = { x: next.x, y: next.y };
            path.current.shift();
            step -= d;
          } else {
            pos.current = { x: p.x + (mx / d) * step, y: p.y + (my / d) * step };
            if (group.current) group.current.rotation.y = Math.atan2(mx, my);
            step = 0;
          }
        }
      }
    }
    at.current[id] = pos.current;
    claimSquare(`folk:${id}`, path.current.length ? path.current[path.current.length - 1] : squareOf(pos.current));
    if (group.current) group.current.position.set(pos.current.x + 0.5, 0, pos.current.y + 0.5);
  });
  return <group ref={group} position={[start.x + 0.5, 0, start.y + 0.5]}>{children}</group>;
}

// The test machine's switch: with it set, no one comes up to the party and no gang waits in an alley
export const noEncounters = () => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("sw5e.noEncounters") === "1";
  } catch {
    return false;
  }
};

// Says once when a person who has been following the party is close to the party at the place they were to be
// taken to (the front of that building)
function Delivery({ id, at, feet, door, onDeliver }: { id: string; at: React.MutableRefObject<Record<string, Sq>>; feet: React.MutableRefObject<{ x: number; y: number }>; door: Sq; onDeliver: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    const them = at.current[id];
    if (done.current || !them) return;
    if (Math.hypot(feet.current.x - door.x, feet.current.y - door.y) <= 3.5 && Math.hypot(them.x - feet.current.x, them.y - feet.current.y) <= 7) {
      done.current = true;
      onDeliver();
    }
  });
  return null;
}

// Watches for the party walking into an alley (a couple of squares in from both ends), and says so once on each
// entry. The one it stands in when this begins does not count.
function AlleyWatch({ plan, feet, active, onEnter }: { plan?: DistrictPlan; feet: React.MutableRefObject<{ x: number; y: number }>; active: boolean; onEnter: (alley: Rect) => void }) {
  const last = useRef<string | null>(null);
  useFrame(() => {
    const a = alleyAt(plan, Math.round(feet.current.x), Math.round(feet.current.y));
    const key = a ? `${a.x},${a.y}` : "";
    if (last.current === null) last.current = key;
    if (key === last.current) return;
    last.current = key;
    if (a && active) onEnter(a);
  });
  return null;
}

// What bars the ends and the sides of an alley that a gang holds: stacked crates and junk on the open squares
// round it (the squares are barred to the party; this is only how they look)
function AlleyBlock({ squares }: { squares: Sq[] }) {
  return (
    <>
      {squares.map((q, i) => (
        <group key={`${q.x},${q.y}`} position={[q.x + 0.5, 0, q.y + 0.5]} rotation={[0, (i * 0.7) % 1.5, 0]}>
          <Box at={[0, 0.3, 0]} size={[0.8, 0.6, 0.8]} color={i % 3 ? "#6b5a45" : "#4a525c"} />
          {i % 2 === 0 && <Box at={[0.05, 0.8, 0]} size={[0.6, 0.4, 0.6]} color={i % 4 ? "#7a6a52" : "#59636d"} />}
        </group>
      ))}
    </>
  );
}

// (`hover`: kept that far over the ground the view gives, rather than on the straight line between the ends: over a globe's hills)
type Walker = { key: string; from: V3; to: V3; progress: number; kind: "person" | "speeder" | "airspeeder" | "mount" | "hauler" | "ship"; name: string; arc?: number; scale?: number; note?: string; hover?: number };
// People about the street of a district, going between the doors of its buildings by the open ground and back again, at a walking pace.
// Each is one of the district's people (`who`), and two who pass each other may stop and talk (`Strollers`).
// (`mount`: one who rides, a beast of the transport data, between `doors`, the doors they stop at; the path then runs between the beast's
// hitches, a square of its own by each door: see `hitchBy`)
type Stroll = { key: string; path: { x: number; y: number }[]; length: number; offset: number; mount?: string; doors?: [{ x: number; y: number }, { x: number; y: number }]; who?: Occupant };
// Where a rider's beast waits by a door (2026-11-02, the user: "NPC beasts stand on the exact square at the entrance of the buildings their
// riders enter, beasts should not loiter on the same square, and should not stand on the square that shares the building entry"): out from
// the door and to one side, two or three squares from it, never on the square before the door or the line straight out from it (the way
// in stays clear), never where another beast waits (`taken`) or on any building's door square
function hitchBy(door: Sq, outward: Sq, open: (x: number, y: number) => boolean, taken: Set<string>, salt: string): Sq | undefined {
  const across = { x: Math.abs(outward.y), y: Math.abs(outward.x) };
  const spots: { q: Sq; d: number }[] = [];
  for (let k = 0; k <= 3; k++) for (let side = -3; side <= 3; side++) {
    if (side === 0 || Math.max(k, Math.abs(side)) < 2) continue;
    const q = { x: door.x + outward.x * k + across.x * side, y: door.y + outward.y * k + across.y * side };
    spots.push({ q, d: Math.hypot(k, side) + unitOf(`${salt}|${q.x},${q.y}`) * 0.5 });
  }
  return spots.sort((p, q) => p.d - q.d).map((p) => p.q).find((q) => open(q.x, q.y) && !taken.has(`${q.x},${q.y}`));
}
// Where `rest` squares along a path is, and the way it runs there
function along(path: { x: number; y: number }[], rest: number): { x: number; y: number; dx: number; dy: number } {
  let [px, py] = [path[0].x, path[0].y];
  let [dx, dy] = [0, 0];
  for (let i = 1; i < path.length; i++) {
    const [ax, ay, bx, by] = [path[i - 1].x, path[i - 1].y, path[i].x, path[i].y];
    const leg = Math.hypot(bx - ax, by - ay);
    [dx, dy] = [bx - ax, by - ay];
    if (rest <= leg || i === path.length - 1) {
      const k = leg ? Math.min(1, rest / leg) : 0;
      [px, py] = [ax + (bx - ax) * k, ay + (by - ay) * k];
      break;
    }
    rest -= leg;
  }
  return { x: px, y: py, dx, dy };
}
// Someone on a beast who rides between two doors (2026-11-01, the user): gets down before going in, comes out with what they bought, loads it on
// the beast, gets up again and rides on to the other door (interiors/limbs.ts errandAt)
function MountedStroll({ w }: { w: Stroll }) {
  const beast = useRef<THREE.Group>(null);
  const seated = useRef<THREE.Group>(null);
  const foot = useRef<THREE.Group>(null);
  const pack = useRef<THREE.Group>(null);
  const mount = w.mount!;
  const seat = seatFor(mount) - RIDER_HIPS;
  const leg = errandLength(w.length);
  const yaw = useRef(0);
  useFrame(({ clock }) => {
    if (!beast.current || !seated.current || !foot.current || !pack.current) return;
    const t = (clock.elapsedTime + w.offset) % (leg * 2);
    const back = t >= leg;
    const { phase, k, along: ridden } = errandAt(t - (back ? leg : 0), w.length);
    const here = along(w.path, back ? w.length - ridden : ridden);
    const [dx, dy] = back ? [-here.dx, -here.dy] : [here.dx, here.dy];
    if (dx || dy) yaw.current = Math.atan2(dx, dy);
    beast.current.position.set(here.x + 0.5, 0, here.y + 0.5);
    beast.current.rotation.y = yaw.current;
    // The door at the end of the leg, and the way to it from where the beast stands (it walks no further than the door)
    const door = w.doors?.[back ? 0 : 1];
    const [tx, ty] = door ? [door.x - here.x, door.y - here.y] : [Math.sin(yaw.current) * 1.5, Math.cos(yaw.current) * 1.5];
    const reach = Math.min(Math.hypot(tx, ty), 5);
    const [ux, uy] = reach ? [tx / Math.hypot(tx, ty), ty / Math.hypot(tx, ty)] : [0, 1];
    // Down off the saddle to the beast's side, then the walk to the door, out of sight inside, and back
    const side = [-uy * 0.5, ux * 0.5];
    // (half way through mounting, they are in the saddle again)
    const onFoot = phase !== "ride" && !(phase === "up" && k > 0.5);
    seated.current.visible = !onFoot;
    foot.current.visible = onFoot && phase !== "shop";
    if (onFoot) {
      // How far they have gone along the way to the door (0 at the beast, 1 at the door), and how far out to its side (stepping down and up)
      const walk = phase === "in" ? k : phase === "out" ? 1 - k : 0;
      const out = phase === "down" ? k : phase === "up" ? 1 - k : 1;
      foot.current.position.set(here.x + 0.5 + side[0] * out + ux * reach * walk, 0, here.y + 0.5 + side[1] * out + uy * reach * walk);
      // Facing the door going in, the beast (the other way) on coming out and while loading it
      foot.current.rotation.y = phase === "in" || phase === "down" ? Math.atan2(ux, uy) : Math.atan2(-side[0], -side[1]);
    }
    pack.current.visible = carrying(phase, k);
  });
  return (
    <>
      <group ref={beast}>
        <Figure kind="beast" ring="#9ca3af" name={mount} />
        <group ref={seated} position={[0, seat, 0]}>
          <Figure kind="person" ring="#9ca3af" name={w.key} riding />
        </group>
        {/* What they bought, lashed on behind the saddle */}
        <group ref={pack} visible={false} position={[0, seat + RIDER_HIPS - 0.05, -0.32]}>
          <Box at={[0, 0.12, 0]} size={[0.5, 0.26, 0.34]} color="#8a6a43" />
          <Box at={[0.05, 0.3, 0]} size={[0.3, 0.14, 0.26]} color="#b49a6a" />
        </group>
      </group>
      <group ref={foot} visible={false}>
        <Figure kind="person" ring="#9ca3af" name={w.key} />
      </group>
    </>
  );
}
// Two on foot who pass each other in the street may stop, face each other and talk (2026-11-02, the user: "extend the NPC conversations to
// people passing in the street"), with lines made by the local model as in a room (voice.ts `chatter`: one talk at a time on the page); each
// walker's clock is held while they stand (`lag`), so they walk on from where they stopped, and they do not stop again for a while (`cool`)
type StreetTalk = { with: string; lead: boolean; lines: TalkLine[]; i: number; next: number; done?: boolean; last: number; cancel?: () => void; speaking?: boolean };
function Strollers({ strolls, scene, news, talkers, party }: { strolls: Stroll[]; scene: string; news?: string; talkers: (a: Occupant, b: Occupant) => [ChatPerson, ChatPerson]; party: () => { x: number; y: number } | null }) {
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const poses = useMemo(() => Object.fromEntries(strolls.map((w) => [w.key, { current: seatState() }])), [strolls]);
  const state = useRef<Record<string, { lag: number; cool: number; at: { x: number; y: number }; talk?: StreetTalk }>>({});
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const until = useRef<Record<string, number>>({});
  const look = useRef(1);
  const clockNow = useRef(0);
  const endTalk = (key: string) => {
    const t = state.current[key]?.talk;
    if (!t) return;
    for (const k of [key, t.with]) {
      const s = state.current[k];
      if (!s) continue;
      if (s.talk?.lead) s.talk.cancel?.();
      s.talk = undefined;
      s.cool = between(30, 70);
      if (poses[k]?.current.stand === "talk") poses[k].current.stand = undefined;
    }
  };
  // (gone from the street: whatever they were saying stops)
  useEffect(() => () => { for (const s of Object.values(state.current)) if (s.talk?.lead) s.talk.cancel?.(); }, []);
  // (the walkers, where each path ends and who is talking: read by the play-through test)
  useEffect(() => {
    (window as unknown as { __strolls?: unknown }).__strolls = () => strolls.map((w) => ({ key: w.key, mount: w.mount, ends: [w.path[0], w.path[w.path.length - 1]], doors: w.doors, at: state.current[w.key]?.at, who: w.who?.name, talking: state.current[w.key]?.talk ? state.current[w.key]!.talk!.with : undefined, said: bubbles[w.key] }));
  });
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.25);
    const now = (clockNow.current += dt);
    const walkers = strolls.filter((w) => w.length >= 1 && !w.mount);
    for (const w of walkers) {
      const s = (state.current[w.key] ??= { lag: 0, cool: between(4, 25), at: { ...w.path[0] } });
      if (s.talk) s.lag += dt;
      else s.cool -= dt;
      // There and back, at a square and a bit a second
      const run = (((clock.elapsedTime - s.lag + w.offset) * 1.3) % (w.length * 2) + w.length * 2) % (w.length * 2);
      const back = run > w.length;
      const here = along(w.path, back ? w.length * 2 - run : run);
      s.at = { x: here.x, y: here.y };
      const g = groups.current[w.key];
      if (!g) continue;
      g.position.set(here.x + 0.5, 0, here.y + 0.5);
      const mate = s.talk && state.current[s.talk.with];
      g.rotation.y = mate ? Math.atan2(mate.at.x - here.x, mate.at.y - here.y) : Math.atan2(back ? -here.dx : here.dx, back ? -here.dy : here.dy);
    }
    // The talks going: each line in turn, from the one who began it
    for (const w of walkers) {
      const t = state.current[w.key]?.talk;
      if (!t?.lead || (t.next -= dt) > 0) continue;
      // (the last line is still being said aloud)
      if (t.speaking) t.next = 0.2;
      else if (t.i < t.lines.length) {
        const line = t.lines[t.i++];
        const [speaker, listener] = line.who === 0 ? [w.key, t.with] : [t.with, w.key];
        const seconds = talkSeconds(line.text);
        const me = party();
        const at = state.current[speaker]?.at;
        const person = strolls.find((x) => x.key === speaker)?.who;
        const heard = person && at && me ? voiceLine(person, line.text, Math.hypot(at.x - me.x, at.y - me.y)) : undefined;
        if (heard) {
          t.speaking = true;
          void heard.finally(() => { t.speaking = false; t.last = clockNow.current; });
        }
        until.current[speaker] = now + (heard ? seconds + 3 : seconds);
        delete until.current[listener];
        setBubbles((b) => { const next = { ...b, [speaker]: line.text }; delete next[listener]; return next; });
        if (poses[speaker]) poses[speaker].current.stand = "talk";
        if (poses[listener]?.current.stand === "talk") poses[listener].current.stand = undefined;
        t.next = seconds + 0.3;
        t.last = now;
      } else if (t.done || now - t.last > TALK_PATIENCE) endTalk(w.key);
      else t.next = 0.2;
    }
    const expired = Object.entries(until.current).filter(([, at]) => at < now).map(([key]) => key);
    if (expired.length) {
      expired.forEach((key) => delete until.current[key]);
      setBubbles((old) => Object.fromEntries(Object.entries(old).filter(([key]) => !expired.includes(key))));
    }
    // Now and then, two who are passing each other stop to talk
    if ((look.current -= dt) > 0) return;
    look.current = 0.5;
    const free = walkers.filter((w) => w.who && !state.current[w.key]?.talk && (state.current[w.key]?.cool ?? 1) <= 0);
    for (const a of free) {
      const sa = state.current[a.key];
      const b = free.find((o) => o !== a && Math.hypot(state.current[o.key].at.x - sa.at.x, state.current[o.key].at.y - sa.at.y) <= 1.6);
      if (!b || Math.random() > 0.5) continue;
      const sb = state.current[b.key];
      const seed = hue(`${a.key}|${b.key}|${Math.floor(now / 60)}`);
      const lines: TalkLine[] = [];
      const lead: StreetTalk = { with: b.key, lead: true, lines, i: 0, next: 0.3, last: now };
      const [ta, tb] = talkers(a.who!, b.who!);
      const pit = pitTalk(seed, 1);
      const cancel = chatter({ a: ta, b: tb, scene, news: pit?.news ?? gossip(seed, news), turns: 2 + (seed % 3), fallback: () => (pit ? pit.lines() : smallTalk("street", seed)), onLine: (line) => lines.push(line), onEnd: () => { lead.done = true; } });
      if (!cancel) break;
      lead.cancel = cancel;
      sa.talk = lead;
      sb.talk = { with: a.key, lead: false, lines, i: 0, next: 0, last: now };
      break;
    }
  });
  return (
    <>
      {strolls.map((w) => w.mount ? <MountedStroll key={w.key} w={w} /> : (
        <group key={w.key} ref={(g) => { groups.current[w.key] = g; }} position={[w.path[0].x + 0.5, 0, w.path[0].y + 0.5]}>
          <Figure kind="person" ring="#9ca3af" name={w.who?.name ?? w.key} species={w.who?.species} role={w.who?.role} seat={poses[w.key]} />
          {bubbles[w.key] && (
            <Html center position={[0, 2.05, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div className="w-max max-w-[13rem] rounded-lg bg-gray-900/90 px-2 py-0.5 text-center text-xs text-amber-200 shadow">{bubbles[w.key]}</div>
            </Html>
          )}
        </group>
      ))}
    </>
  );
}

// A beast to ride, by the rider's name (the mounts of the transport data)
const pickMount = (name: string) => ["Dewback", "Eopie", "Bantha", "Tauntaun", "Kaadu", "Varactyl"][hue(name) % 6];

// People and ships on the way between places (shared/logic withPresence: `moving`), drawn where
// they are on the way and eased there between the clock's minutes. Not tappable.
function Walkers({ walkers, ground }: { walkers: Walker[]; ground?: (x: number, z: number) => number }) {
  const groups = useRef<Record<string, THREE.Group | null>>({});
  useFrame((_, delta) => {
    for (const w of walkers) {
      const g = groups.current[w.key];
      if (!g) continue;
      const want = new THREE.Vector3(...w.from).lerp(new THREE.Vector3(...w.to), Math.max(0, Math.min(1, w.progress)));
      want.y += (w.arc ?? 0) * Math.sin(Math.PI * Math.max(0, Math.min(1, w.progress)));
      if (ground && w.hover !== undefined) want.y = ground(want.x, want.z) + w.hover;
      if (g.position.distanceTo(want) > 8) g.position.copy(want);
      else g.position.lerp(want, Math.min(1, delta * 3));
      g.rotation.y = Math.atan2(w.to[0] - w.from[0], w.to[2] - w.from[2]);
    }
  });
  return (
    <>
      {walkers.map((w) => (
        <group key={w.key} ref={(g) => { groups.current[w.key] = g; }} position={w.from} scale={w.scale ?? 1}>
          {w.kind === "person" ? <Figure kind="person" ring="#9ca3af" name={w.name} />
            : w.kind === "speeder" || w.kind === "airspeeder" ? <group scale={0.55}><SpeederModel model={w.kind === "airspeeder" ? "Airspeeder" : `Landspeeder ${w.name}`} /></group>
            : w.kind === "mount" ? <Figure kind="beast" ring="#9ca3af" name={pickMount(w.name)} />
            : w.kind === "hauler" ? <><Box at={[0, 0.5, 0.35]} size={[0.8, 0.5, 0.5]} color="#5b6773" /><Box at={[0, 0.62, -0.45]} size={[0.9, 0.8, 1.1]} color="#c9b48a" /><Box at={[0, 0.2, 0]} size={[0.7, 0.12, 1.8]} color="#2a2f36" /></>
            : <group rotation={[0, -Math.PI / 2, 0]} scale={0.3}><group position={[0, -0.9, 0]}><ShipBody ship={{ size: "Small", role: "shuttle", status: "orbiting", name: w.name }} /></group></group>}
          {w.kind !== "person" && <Label at={[0, 1.2, 0]} size={0.5} color="#e8dcc0">{w.name}</Label>}
          {w.note && <Label at={[0, w.kind === "person" ? 1.5 : 1.8, 0]} size={w.kind === "person" ? 0.24 : 0.4} color="#fca5a5">{w.note}</Label>}
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// The officers of a search, walking the district (shared logic "advanceSearch"), and the barricades
// a blockade puts across the ways out of it. A squad stands where its room is: out in front of the
// door of the building it is in, or up on the roof or catwalk it is on; it walks to its next place
// as the search moves it on, and in between it goes up and down a little on the spot.
// ---------------------------------------------------------------------------------------------

type SquadSpot = { key: string; squad: Squad; at: V3; label?: string };

function Squads({ spots, onTap }: { spots: SquadSpot[]; onTap?: (squad: Squad, label?: string) => void }) {
  const groups = useRef<Record<string, THREE.Group | null>>({});
  useFrame(({ clock }, delta) => {
    for (const { key, at } of spots) {
      const g = groups.current[key];
      if (!g) continue;
      const want = new THREE.Vector3(...at);
      // A step or two on the spot while it looks about
      want.x += Math.sin(clock.elapsedTime * 0.7 + key.length) * 0.35;
      want.z += Math.cos(clock.elapsedTime * 0.5 + key.length) * 0.35;
      if (g.position.distanceTo(want) > 12) g.position.copy(want);
      else {
        const before = g.position.clone();
        g.position.lerp(want, Math.min(1, delta * 1.6));
        if (before.distanceTo(g.position) > 0.002) g.rotation.y = Math.atan2(g.position.x - before.x, g.position.z - before.z);
      }
    }
  });
  return (
    <>
      {spots.map(({ key, squad, at, label }) => (
        <group key={key} ref={(g) => { groups.current[key] = g; }} position={at}>
          {Array.from({ length: Math.min(3, squad.count) }, (_, i) => (
            <group key={i} position={[(i - (Math.min(3, squad.count) - 1) / 2) * 0.6, 0, i % 2 ? -0.3 : 0]}>
              <Figure kind={squad.heavy ? "trooper" : "officer"} ring={SIDE_COLORS.hostile} />
            </group>
          ))}
          <Label at={[0, 1.7, 0]} size={0.3} color={SIDE_COLORS.hostile}>{`${squad.heavy ? "Troopers" : "Constables"} x${squad.count}${label ? ` ${label}` : ""}`}</Label>
          {onTap && <Hit at={[0, 0.8, 0]} size={[2, 1.8, 1.6]} onTap={() => onTap(squad, label)} label={label ?? "Squad"} />}
        </group>
      ))}
    </>
  );
}

// A barricade: striped barriers across the squares round a signpost, with two officers behind them
function Barricade({ squares, guards, onTap }: { squares: { x: number; y: number }[]; guards: { x: number; y: number }[]; onTap?: () => void }) {
  return (
    <>
      {squares.map((q) => (
        <group key={`${q.x},${q.y}`} position={[q.x + 0.5, 0, q.y + 0.5]}>
          <Box at={[0, 0.3, 0]} size={[0.96, 0.6, 0.4]} color="#d9a23a" />
          <Box at={[0, 0.45, 0]} size={[0.98, 0.14, 0.42]} color="#1f2328" />
          {onTap && <Hit at={[0, 0.4, 0]} size={[1, 0.9, 1]} onTap={onTap} label="Barricade" />}
        </group>
      ))}
      {guards.map((q, i) => (
        <group key={`guard-${i}`} position={[q.x + 0.5, 0, q.y + 0.5]}>
          <Figure kind={i % 2 ? "officer" : "trooper"} ring={SIDE_COLORS.hostile} />
          {i === 0 && <Label at={[0, 1.7, 0]} size={0.3} color={SIDE_COLORS.hostile}>Blockade</Label>}
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// A building and the ground around it, to the scale of its floor plan. Standing outside, the
// party sees it closed: its ways in, its windows, a secret way once it has been found, and
// signposts to wherever its street leads. Inside, the room they are in is opened up. A tap on
// the ground walks there; a tap on a door, a cache, someone or a ship walks up to it first.
// ---------------------------------------------------------------------------------------------

const MARGIN = 6;
// (the trees and rocks of the open ground are the asset library's, see `ambientBlockers`: what is here stands about the streets)
const DECOR: Record<string, string[]> = { desert: ["mast"], ice: ["ice"], forest: ["lamp", "crate"], jungle: ["lamp", "crate"], swamp: ["crate", "lamp"], temperate: ["lamp", "crate"], urban: ["lamp", "crate", "kiosk", "camera"], "gas giant": ["lamp", "crate"], ocean: ["lamp", "crate"], volcanic: ["crate", "mast"], barren: ["crate", "mast"] };

// The square outside a wall that something set in it opens on to (on the building's grid)
const beyond = (l: RoomLayout, a: RoomAsset) => ({ x: l.x + a.x + (a.side === "e" ? 1 : a.side === "w" ? -1 : 0), y: l.y + a.y + (a.side === "s" ? 1 : a.side === "n" ? -1 : 0) });

function BuildingScene({ world, building, hereId, selectedId, onAct, locked, reveal }: { world: World; building: Area; hereId: string; selectedId?: string | null; onAct?: (action: MapAction) => void; locked?: boolean; reveal?: boolean }) {
  // The buildings that share this one's map: the district it stands in, once the district is
  // planned (shared logic "District plans"); a building of a wild site stands alone
  const district = districtAt(world, building.id);
  const districtPlan = district ? world.districtPlans?.[district.id] : undefined;
  const buildings: Area[] = useMemo(
    () => (district && districtPlan ? district.buildingIds.filter((id) => districtPlan.boxes[id]).map((id) => world.areas[id]).filter((b): b is Area => !!b) : [building]),
    [world, building.id],
  );
  const buildingIds = new Set(buildings.map((b) => b.id));
  // The ships that belong to each hangar, away or in: their comings and goings are drawn by the clock
  const based = (world as World & { based?: Record<string, Ship[]> }).based ?? {};
  const rooms = buildings.flatMap((b) => childrenOf(world, b.id).filter((a) => a.kind === "room"));
  const withPlan = rooms.filter((a) => a.layout);
  const plan = withPlan.length
    ? (() => {
        const x = Math.min(...withPlan.map((a) => a.layout!.x));
        const y = Math.min(...withPlan.map((a) => a.layout!.y));
        return { x, y, width: Math.max(...withPlan.map((a) => a.layout!.x + a.layout!.width)) - x, height: Math.max(...withPlan.map((a) => a.layout!.y + a.layout!.height)) - y };
      })()
    : undefined;
  const planned = !!plan && rooms.every((a) => a.layout);
  const trail = trailOf(world, building.id);
  const biome = trail.find((a) => a.kind === "planet")?.type ?? "";
  const wall = trail.some((a) => a.type === "station") || building.type === "starship" ? STEEL : WALLS[biome] ?? "#b9ad96";
  // The sky and the horizon over the street (none aboard a ship or on a station in space); kept by the building, not rebuilt with the world
  const look = useMemo(() => (building.type === "starship" || (trail.some((a) => a.type === "station") && biome !== "gas giant") ? null : worldLook(world, building.id)), [building.id]);
  const here = world.areas[hereId];
  // The room the party is in, or whether it stands outside; a room opened up to look at (the atlas)
  const inside = planned && here?.kind === "room" && buildingIds.has(here.parentId ?? "") ? here : null;
  const outside = buildingIds.has(hereId);
  const present = planned && (!!inside || outside);
  // While the district is got ready behind its loading screen (see below), the room being got ready is the one opened: one of each kind
  // of room (its building's kind, the pack it is furnished from, its form, above or below ground), which share their shaders and maps
  const [warming, setWarming] = useState<number | null>(null);
  const roomKey = rooms.map((r) => r.id).join(",");
  const warmRooms = useMemo(() => {
    const kinds = new Set<string>();
    return rooms.filter((r) => {
      if (!r.layout) return false;
      const type = world.areas[r.parentId ?? ""]?.type ?? building.type;
      const kind = `${type}|${packOf(r.name, type) ?? ""}|${formOf(r) ?? ""}|${(r.layout.level ?? 0) < 0}`;
      if (kinds.has(kind)) return false;
      kinds.add(kind);
      return true;
    });
  }, [roomKey]);
  const warmRoom = warming !== null ? warmRooms[warming] ?? null : null;
  const opened = warmRoom ?? inside ?? (reveal && planned ? rooms.find((a) => a.id === selectedId) ?? null : null);
  // The building the party is in or in front of (or the one being looked at)
  const me = buildings.find((b) => b.id === (inside?.parentId ?? hereId)) ?? building;
  const tapPlace = useTaps(onAct);
  // A fight in the open of this district is fought here, on its streets, roofs and catwalks
  // (a shooter fight, shared/logic/shooter.ts, is fought while walking: the map stays the walking map)
  const duel = useCombat((state) => state.inCombat && !state.realtime && !!district && state.arena.district === district.id);
  const duelist = useCombat((state) => (state.inCombat && !state.realtime ? state.combatants.find((c) => c.isPlayer) : undefined));
  // The street can be tapped (to walk, to go in, to pick someone out) when not in a fight
  const tappable = outside && !duel;

  // The ground: the district's streets, or the plan and a margin round it
  const ground = districtPlan && plan
    ? { x: Math.min(0, plan.x - 1), y: Math.min(0, plan.y - 1), w: Math.max(districtPlan.width, plan.x + plan.width + 1), h: Math.max(districtPlan.height, plan.y + plan.height + 1) }
    : plan ? { x: plan.x - MARGIN, y: plan.y - MARGIN, w: plan.width + MARGIN * 2, h: plan.height + MARGIN * 2 } : { x: -8, y: -8, w: 16, h: 16 };
  const cx = ground.x + ground.w / 2;
  const cz = ground.y + ground.h / 2;
  // What the site lays out on its open ground (a palace's wall and gardens, a market's stalls): the pieces
  // are drawn from the asset library and the squares they fill cannot be walked over
  const tier = useQuality((q) => q.tier);
  const fixtures = useMemo(() => fixturesOf(districtPlan, biome, tier), [districtPlan, biome, tier]);
  // (a cellar under the street leaves the street above it free to walk on, and so does a roof or
  // a catwalk, which stand over what is below)
  const inRoom = (x: number, y: number) => rooms.some((a) => a.layout && floorsOf(a.layout)[1] >= 0 && formOf(a) !== "gallery" && !openAir(a) && x >= a.layout.x && x < a.layout.x + a.layout.width && y >= a.layout.y && y < a.layout.y + a.layout.height);

  // What is to be seen in the opened room: hidden doors, caches and secret ways only once found
  const seen = (room: Area) =>
    room.layout!.assets.filter((a) => {
      if (a.kind === "door") return !world.paths.find((p) => p.id === a.ref)?.hidden;
      if (a.kind === "secret") return !!room.secretEntry?.found;
      if (a.kind === "loot") return room.loot.some((c) => c.id === a.ref && !c.hidden);
      if (a.kind === "npc") return room.occupants.some((o) => o.id === a.ref);
      return true;
    }).map((a) => (a.kind === "ship" && !bayBerth(room, a, based[room.id], minuteNow()).ship ? { ...a, blocks: false, cover: false } : a));
  const shown = opened ? seen(opened) : [];

  // Outside: where the streets lead (a signpost for each way out of the district), a few things
  // standing about, and whoever and whatever is in front of each building
  const street = useMemo(() => {
    const none = { signs: [] as { exit: Exit; x: number; y: number }[], decor: [] as { kind: string; x: number; y: number }[], folk: [] as { occupant: Occupant; x: number; y: number }[], caches: [] as { cache: Area["loot"][number]; x: number; y: number }[], sentries: [] as { buildingId: string; key: string; occupant: Occupant; at: { x: number; y: number } }[], rigs: [] as { v: Vehicle; mine: boolean; outward: { x: number; y: number }; x: number; y: number }[], doors: {} as Record<string, { door: { x: number; y: number }; outward: { x: number; y: number } }>, ambient: [] as Placed[], ambientBlocked: new Set<string>(), clear: new Set<string>() };
    if (!plan) return none;
    const r = createRandom(Number(buildings[0].id.replace(/\D/g, "") || 1) * 613 + 7);
    const taken = new Set<string>();
    const free = (x: number, y: number) => x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y) && !taken.has(`${x},${y}`) && !fixtures.blocked.has(`${x},${y}`);
    // Somewhere free near where a thing should stand; signposts keep clear of each other, so
    // that a finger can tell them apart
    const kept: { x: number; y: number }[] = [];
    const claim = (want: { x: number; y: number }, clear = 0) => {
      const spot = nearestOpen((x, y) => free(x, y) && !kept.some((k) => Math.max(Math.abs(k.x - x), Math.abs(k.y - y)) < clear), { x: Math.round(want.x), y: Math.round(want.y) });
      taken.add(`${spot.x},${spot.y}`);
      if (clear) kept.push(spot);
      return spot;
    };
    // In front of each building's main way in
    const fronts = buildings.map((b) => {
      const own = rooms.filter((a) => a.parentId === b.id);
      const root = own.find((a) => a.gateway && !formOf(a)) ?? own.find((a) => a.gateway) ?? own[0];
      const wayOut = root?.layout?.assets.find((a) => a.kind === "exit");
      const door = root?.layout && wayOut ? beyond(root.layout, wayOut) : { x: ground.x + 2, y: Math.round(cz) };
      taken.add(`${door.x},${door.y}`);
      const outward = { x: wayOut?.side === "w" ? -1 : wayOut?.side === "e" ? 1 : 0, y: wayOut?.side === "n" ? -1 : wayOut?.side === "s" ? 1 : 0 };
      return { b, root, wayOut, door, outward };
    });
    const doors = Object.fromEntries(fronts.map((f) => [f.b.id, { door: f.door, outward: f.outward }]));
    for (const room of rooms) for (const a of room.layout?.assets ?? []) if (a.side) { const b = beyond(room.layout!, a); taken.add(`${b.x},${b.y}`); }
    // A street leads off towards the place it goes to; the way out of the settlement is the far side
    const signs: { exit: Exit; x: number; y: number }[] = [];
    const lead = new Set<string>();
    for (const b of buildings) {
      for (const exit of exitsOf(world, b.id)) {
        if (exit.via === "enter" || exit.hidden || buildingIds.has(exit.to) || lead.has(`${exit.via}-${exit.to}`)) continue;
        lead.add(`${exit.via}-${exit.to}`);
        const to = world.areas[exit.to];
        let dx = to.position.x - b.position.x;
        let dz = to.position.z - b.position.z;
        if (exit.via === "leave" || (!dx && !dz)) [dx, dz] = [-1, signs.length % 2 ? 0.6 : -0.6];
        const k = Math.min((ground.w / 2 - 1.5) / Math.max(0.001, Math.abs(dx)), (ground.h / 2 - 1.5) / Math.max(0.001, Math.abs(dz)));
        signs.push({ exit, ...claim({ x: cx - 0.5 + dx * k, y: cz - 0.5 + dz * k }, 4) });
      }
    }
    const folk = fronts.flatMap(({ b, door }) => b.occupants.filter((o) => !o.stall).flatMap((o, i) => Array.from({ length: Math.min(o.count, 3) }, (_, j) => ({ occupant: o, ...claim({ x: door.x - 2 - j, y: door.y + (i % 2 ? 2 + i : -2 - i) }) }))));
    const caches = fronts.flatMap(({ b, door }) => b.loot.filter((c) => !c.hidden).map((cache, i) => ({ cache, ...claim({ x: door.x + 1, y: door.y + 3 + i }) })));
    const kinds = DECOR[biome] ?? DECOR.temperate;
    const count = Math.min(46, Math.max(9, Math.round((ground.w * ground.h) / 260)));
    const decor = Array.from({ length: count }, () => ({ kind: r.pick(kinds), x: ground.x + r.int(0, ground.w - 1), y: ground.y + r.int(0, ground.h - 1) }))
      .filter((d) => free(d.x, d.y) && ![-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => inRoom(d.x + dx, d.y + dy) || taken.has(`${d.x + dx},${d.y + dy}`))));
    // The sentries of a way in stand out in front of it: one by the door, the others close by
    // until they set off on their round
    const sentries = fronts.flatMap(({ b, root, wayOut, door }) =>
      (root?.layout?.assets ?? [])
        .map((a) => ({ a, occupant: root!.occupants.find((o) => o.id === a.ref && o.role === "guard") }))
        .filter((s): s is { a: RoomAsset; occupant: Occupant } => s.a.kind === "npc" && !!s.occupant)
        .map(({ a, occupant }, i) => ({ buildingId: b.id, key: `${a.id}-out`, occupant, at: claim({ x: door.x + (i % 2 ? -1 : 1) * (wayOut?.side === "n" || wayOut?.side === "s" ? 1 : 0), y: door.y + (i % 2 ? -1 : 1) * (wayOut?.side === "e" || wayOut?.side === "w" ? 1 : 0) }) })),
    );
    // Speeders: the party's own, parked in this settlement (before the first building), and any
    // kept at a building, a few squares out from its door and to either side
    const settlementId = trail.find((a) => a.kind === "settlement")?.id;
    const mine = (((world as World & { parked?: PartyVehicle[] }).parked ?? []) as PartyVehicle[]).filter((v) => v.areaId === settlementId && !(isWaterCraft(v) && waterOf(world, building.id)));
    const rigs = fronts.flatMap(({ b, door, outward }, n) =>
      [...(n === 0 ? mine.map((v) => ({ v: v as Vehicle, mine: true })) : []), ...(b.vehicles ?? []).map((v) => ({ v, mine: false }))].map((rig, i) => {
        const side = (i % 2 ? 1 : -1) * (1 + Math.floor(i / 2));
        return { ...rig, outward, ...claim({ x: door.x + outward.x * 4 + Math.abs(outward.y) * side * 2, y: door.y + outward.y * 4 + Math.abs(outward.x) * side * 2 }) };
      }),
    );
    // The trees and boulders of the biome (the speeder races' own), on the open ground that is left: clear of
    // every room, of the squares before each way in, the signposts and what stands about them, of the streets
    // between the buildings and of a palace's grounds, so that no one is shut in or walled off from a door.
    // (They block, so they do not depend on the picture quality; the cover and the belt beyond do, below.)
    const clear = new Set<string>();
    const mark = (x: number, y: number, n: number) => { for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) clear.add(`${x + dx},${y + dy}`); };
    const markRect = (r: { x: number; y: number; width: number; height: number }, n = 0) => { for (let y = r.y - n; y < r.y + r.height + n; y++) for (let x = r.x - n; x < r.x + r.width + n; x++) clear.add(`${x},${y}`); };
    for (const key of taken) { const [tx, ty] = key.split(",").map(Number); mark(tx, ty, 2); }
    for (const d of decor) mark(d.x, d.y, 1);
    for (const a of rooms) if (a.layout) markRect(a.layout, 1);
    for (const w of districtPlan?.ways ?? []) markRect(w);
    const grounds = districtPlan?.grounds;
    if (grounds?.wall) markRect(grounds.wall, 1);
    for (const g of grounds?.gardens ?? []) markRect(g, 1);
    for (const st of grounds?.stalls ?? []) markRect({ x: st.x, y: st.y, width: st.w, height: st.h }, 1);
    const inGround = (x: number, y: number) => x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h;
    // (none on or under the sea: the decking is bare, and the open water and the sea floor have their own life, `Sea` and `UnderSea`)
    const ambient = waterOf(world, building.id) ? [] : ambientBlockers({ x: ground.x, y: ground.y, width: ground.w, height: ground.h }, buildings[0].id, biome, (x, y) => inGround(x, y) && !inRoom(x, y) && !clear.has(`${x},${y}`) && !fixtures.blocked.has(`${x},${y}`));
    const ambientBlocked = new Set<string>();
    for (const it of ambient) if (it.fills) for (let j = 0; j < it.fills[3]; j++) for (let i = 0; i < it.fills[2]; i++) ambientBlocked.add(`${it.fills[0] + i},${it.fills[1] + j}`);
    return { signs, decor, folk, caches, sentries, rigs, doors, ambient, ambientBlocked, clear };
  }, [world, district?.id ?? building.id]);
  // What grows low between them, and the belt of trees beyond the ground that can be walked on: only to be seen,
  // and fewer on a slow screen
  const cover = useMemo(
    () => (planned && !waterOf(world, building.id) ? ambientCover({ x: ground.x, y: ground.y, width: ground.w, height: ground.h }, buildings[0].id, biome, tier, (x, y) => x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y) && !street.clear.has(`${x},${y}`) && !street.ambientBlocked.has(`${x},${y}`) && !fixtures.blocked.has(`${x},${y}`)) : []),
    [street, tier, biome],
  );
  const backdrop = useMemo(() => (planned && !waterOf(world, building.id) ? ambientBackdrop({ x: ground.x, y: ground.y, width: ground.w, height: ground.h }, 40, buildings[0].id, biome, tier) : []), [street, tier, biome]);
  // The way in of the building the party is in front of, and which way it faces
  const myFront = street.doors[me.id] ?? Object.values(street.doors)[0] ?? { door: { x: ground.x + 2, y: Math.round(cz) }, outward: { x: -1, y: 0 } };

  // A blockade (shared logic "Criminal reputation") holds the ways out of the settlement while a
  // search is on: the squares two away from each signpost, all the way round it, are barricaded, so
  // that the sign cannot be walked up to. The barricade stands only where the ground is open.
  const minutes = useClock((c) => c.minutes);
  // The shops that are shut for the night (shared logic afterHoursLock): their ways in are drawn locked
  const shut = useMemo(() => new Set(buildings.filter((b) => afterHoursLock(world, b.id, minutes) !== undefined).map((b) => b.id)), [world, buildings, Math.floor(minutes / 5)]);
  const settlementId = trail.find((a) => a.kind === "settlement")?.id;
  const blockade = !!settlementId && blockadeAt(world, settlementId, minutes);
  const barricades = useMemo(() => {
    if (!blockade) return [] as { sign: { x: number; y: number }; squares: { x: number; y: number }[]; guards: { x: number; y: number }[] }[];
    return street.signs.map(({ x, y }) => {
      const squares: { x: number; y: number }[] = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
        const [qx, qy] = [x + dx, y + dy];
        if (qx >= ground.x && qy >= ground.y && qx < ground.x + ground.w && qy < ground.y + ground.h && !inRoom(qx, qy)) squares.push({ x: qx, y: qy });
      }
      // Two officers stand on the side the street comes from
      const toward = (a: { x: number; y: number }) => Math.hypot(a.x - cx, a.y - cz);
      const guards = [...squares].sort((p, q) => toward(p) - toward(q)).slice(0, 2);
      return { sign: { x, y }, squares, guards };
    });
  }, [blockade, street]);
  // The encounter in the street (see "The people in a district"): who is about, and the alley a gang holds. A gang
  // bars every open square round its alley, so that the party cannot leave it until they are dealt with (this is
  // the blockade's own way of closing a road: squares that cannot be walked on).
  const enc = world.encounter && district && world.encounter.districtId === district.id && outside && !duel ? world.encounter : null;
  const gangRing = useMemo(() => {
    const a = enc?.kind === "robbery" ? enc.alley : undefined;
    const out: Sq[] = [];
    if (!a) return out;
    for (let y = a.y - 1; y <= a.y + a.height; y++) for (let x = a.x - 1; x <= a.x + a.width; x++) {
      if (x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height) continue;
      if (x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y)) out.push({ x, y });
    }
    return out;
  }, [enc?.id, enc?.kind, enc?.alley?.x, enc?.alley?.y]);
  const barred = useMemo(() => new Set([...barricades.flatMap((b) => b.squares), ...gangRing].map((q) => `${q.x},${q.y}`)), [barricades, gangRing]);

  // The party's base pieces here (shared/logic bases.ts): those set down out in front of the district's buildings, and those in the room
  // the party is in; they stand in the way, as furniture does
  const piecesHere = piecesIn(world, new Set([...buildingIds, ...rooms.map((r) => r.id)])).filter(({ piece }) => (inside ? piece.areaId === inside.id : buildingIds.has(piece.areaId)));
  const pieceSquares = new Set(piecesHere.flatMap(({ piece }) => squaresOf(piece).map((q) => `${q.x},${q.y}`)));
  const pieceFloor = (p: { x: number; y: number; w: number; h: number }) => (inside?.layout ? floorAt(inside.layout, p.x - inside.layout.x + p.w / 2, p.y - inside.layout.y + p.h / 2) : 0);
  // Where the party can stand: the free floor of the room they are in, or the open ground outside.
  // People step aside, so only furniture (and what the party has set down) stands in the way.
  // (a parked speeder is some two squares long and a square wide: all of it is solid, not the one square it is set on)
  const rigSquares = useMemo(() => new Set(street.rigs.flatMap((r) => [-1, 0, 1].map((k) => `${r.x + Math.round(r.outward.x) * k},${r.y + Math.round(r.outward.y) * k}`))), [street]);
  // A place on the sea or under it (shared/logic "Water worlds", 2026-10-30): the decking of its gantries and catwalks; off it, and
  // off it the party swims (lower in the water, flat, at half its pace). Under the sea the whole of the place's ground is one bubble of air round
  // its buildings (2026-11-02, the user: "Underwater settlements/districts should NOT cause players to drown when WITHIN the bubble of
  // buildings"): the party walks its streets, and swims only where the water is: out past the ground, at the helm of a craft
  const water: WaterLife | null = waterOf(world, building.id);
  const deck = useMemo(() => (water === "sea" && districtPlan ? deckSquares(districtPlan, street.signs.map((g) => ({ x: g.x, y: g.y }))) : null), [water, districtPlan, street.signs.length]);
  const swimsAt = (x: number, y: number) => !!deck && !deck.has(`${x},${y}`);
  // The party's water craft whose helm the party is at, if any (see `boats` below)
  const afloatRef = useRef<{ v: PartyVehicle; x: number; y: number; face: number } | null>(null);
  const outdoors = (x: number, y: number) =>
    x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y) && !barred.has(`${x},${y}`) && !fixtures.blocked.has(`${x},${y}`) && !street.ambientBlocked.has(`${x},${y}`) && !pieceSquares.has(`${x},${y}`) && !rigSquares.has(`${x},${y}`)
    && ![...street.signs, ...street.decor, ...street.folk, ...street.caches, ...street.rigs].some((thing) => thing.x === x && thing.y === y);
  // Where the people of an encounter are (their squares), where one comes in from (a way out of the district, or
  // the edge of the ground), and the squares a gang stands on round the party in its alley
  const folkAt = useRef<Record<string, Sq>>({});
  // (what a hangar's berths and roof doors do at any minute, and where the party and the people of an encounter stand, read by the play-through test)
  useEffect(() => {
    (window as unknown as { __street?: unknown }).__street = Object.assign(() => ({ party: { ...feet.current }, folk: { ...folkAt.current } }), {
      // The hours of a day in which a gang waits in the alley, in a lawless district
      ambushHours: (alley: Rect, day: number) => (district ? Array.from({ length: 24 }, (_, h) => h).filter((h) => ambushIn(world, district, alley, day, h)) : []),
      // On the water: the ground, the craft whose helm the party is at, and whether a square is open to the party, water, and open ground
      water: () => ({ ground, afloat: afloatRef.current?.v.id ?? null, aboard: aboard.map((c) => c.name), open: (x: number, y: number) => open(x, y), swims: (x: number, y: number) => swimsAt(x, y), outdoors: (x: number, y: number) => outdoors(x, y) }),
      // What a tap on the map would do (a script picks out a craft, a person, ...)
      act: (action: MapAction) => onAct?.(action),
    });
    (window as unknown as { __bay?: unknown }).__bay = (roomId: string, minutes: number) => {
      const room = world.areas[roomId];
      if (!room?.layout) return null;
      return {
        door: bayDoor(room, based[roomId], minutes),
        berths: room.layout.assets.filter((a) => a.kind === "ship").map((a) => { const b = bayBerth(room, a, based[roomId], minutes); return { id: a.id, ship: b.ship?.name, visitor: b.visitor, lift: b.lift }; }),
      };
    };
  });
  const encounterSpawn = (): Sq => {
    const sign = enc ? street.signs[hue(enc.id) % Math.max(1, street.signs.length)] : undefined;
    return nearestOpen(outdoors, sign ? { x: sign.x, y: sign.y } : { x: ground.x + 1, y: Math.round(cz) });
  };
  const gangCache = useRef({ key: "", spots: [] as Sq[] });
  const gangSpotsNow = (alley: Rect, n: number): Sq[] => {
    const p = squareOf(feet.current);
    const key = `${alley.x},${alley.y},${n},${p.x},${p.y}`;
    if (gangCache.current.key !== key) gangCache.current = { key, spots: gangSpots(alley, p, n) };
    return gangCache.current.spots;
  };
  const open = (x: number, y: number) => {
    if (inside) {
      const l = inside.layout!;
      const [lx, ly] = [x - l.x, y - l.y];
      return lx >= 0 && ly >= 0 && lx < l.width && ly < l.height && standsAt(l, lx, ly) && !shown.some((a) => !a.side && a.blocks && a.x <= lx && lx < a.x + a.w && a.y <= ly && ly < a.y + a.h) && !pieceSquares.has(`${x},${y}`);
    }
    // (at the helm of a water craft, only the water, and out past the ground)
    if (afloatRef.current) return wetAt(x, y);
    return outdoors(x, y);
  };
  // The water a craft goes on: open water of the ground, and the sea round it out to BOAT_REACH
  const wetAt = (x: number, y: number) => {
    const inGround = x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h;
    if (inGround) return outdoors(x, y) && swimsAt(x, y);
    return x >= ground.x - BOAT_REACH && y >= ground.y - BOAT_REACH && x < ground.x + ground.w + BOAT_REACH && y < ground.y + ground.h + BOAT_REACH;
  };
  // The companions and beasts that follow (a beast ridden is under the character), and the beast ridden
  const scene = world as World & { party?: Companion[]; beasts?: Companion[]; riding?: string; carts?: Cart[]; parked?: PartyVehicle[]; afloat?: string };
  // The party's carts (shared/logic `Cart`): with whoever pushes or pulls them, or parked
  const carts = scene.carts ?? [];
  const cartsOf = (handler: string) => carts.filter((c) => !c.parked && (c.handler ?? "me") === handler);
  const ridden = (scene.beasts ?? []).find((b) => b.id === scene.riding && b.hp > 0);
  const followers = [...(scene.party ?? []), ...(scene.beasts ?? []).filter((b) => b.id !== ridden?.id)];
  // Co-op (2026-10-30; the user: a stranger who came to offer a job followed both players, each on their own screen only): a stranger of an
  // encounter belongs to the whole party, and walks behind ONE member of those standing here, the host if they are here, else the first by id.
  // Every screen picks the same one, so it is in the same place on all. (A player's own companions and beasts follow that player; the others see
  // them as `PeerPets`.)
  const coopWho = useCoop((s) => s.me);
  const coopAll = useCoop((s) => s.members);
  const coopSpots = useCoop((s) => s.peers);
  const leader = (() => {
    if (!coopWho) return null;
    const here = coopAll.filter((m) => m.connected && (m.id === coopWho || coopSpots[m.id]?.a === hereId)).sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0) || (a.id < b.id ? -1 : 1));
    return here.length > 1 && here[0].id !== coopWho ? here[0].id : null;
  })();
  const leaderRef = useRef<string | null>(null);
  leaderRef.current = leader;
  const followFeet = useRef({ x: 0, y: 0 });
  useFrame(() => {
    const id = leaderRef.current;
    const spot = id ? useCoop.getState().peers[id] : undefined;
    followFeet.current = spot ? { x: spot.x, y: spot.y } : feet.current;
  });
  // A base piece being set down (usePlacing): where it would stand by the party, and putting it on a tapped square
  const pieceWanted = usePlacing((s) => s.piece);
  const placing = present && !locked && !duel ? pieceWanted : null;
  const placingFace = usePlacing((s) => s.face);
  const fits = (x: number, y: number) => {
    if (!placing || !placing.places.includes(inside ? "indoors" : "outdoors")) return false;
    const me = squareOf(feet.current);
    return squaresOf({ x, y, w: placing.w, h: placing.h, face: placingFace }).every((q) => open(q.x, q.y) && (q.x !== me.x || q.y !== me.y) && !claimedBy(q, LEADER));
  };
  const ghostSpot = (): Sq | null => {
    if (!placing) return null;
    const me = squareOf(feet.current);
    for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && fits(me.x + dx, me.y + dy)) return { x: me.x + dx, y: me.y + dy };
    return null;
  };
  const placeAt = (x: number, y: number) => {
    if (!placing) return;
    const ghost = ghostSpot();
    // A tap on a square the piece does not fit puts it where the outline shows, if that is close
    const at = fits(x, y) ? { x, y } : ghost && Math.max(Math.abs(ghost.x - x), Math.abs(ghost.y - y)) <= 1 ? ghost : null;
    if (!at) return onAct?.({ type: "note", text: placing.places.includes(inside ? "indoors" : "outdoors") ? `The ${placing.name.toLowerCase()} does not fit there: it needs ${placing.w} by ${placing.h} open squares, clear of everyone.` : `A ${placing.name.toLowerCase()} is set up ${placing.places.join(" or ")} only.` });
    onAct?.({ type: "place", areaId: hereId, x: at.x, y: at.y, face: placingFace, indoors: !!inside });
  };

  // Where they stand on arriving: where they stood, if they came from another part of this
  // building (so through a door they come out just beyond it); else at the way in
  const spot = usePartySpot();
  const entry = useMemo(() => {
    if (!present) return { x: 0, y: 0 };
    const last = usePartySpot.getState();
    const from = last.areaId ? world.areas[last.areaId] : undefined;
    if (from && (buildingIds.has(from.id) || buildingIds.has(from.parentId ?? ""))) {
      // At the way that joins the two rooms: a door's own square, the foot of stairs (or the top, coming up them)
      const l = inside?.layout;
      const at = l ? arrivalSquares(l, from.id, last).map((q) => ({ x: l.x + q.x, y: l.y + q.y })) : [];
      return nearestOpen(open, at.find((q) => open(q.x, q.y)) ?? at[0] ?? last);
    }
    if (!inside) return nearestOpen(open, myFront.door);
    const l = inside.layout!;
    // (a ship's deck has no door: whoever boards arrives beside the boarding ramp, not in the corner of the deck)
    const way = l.assets.find((a) => a.kind === "exit") ?? l.assets.find(isWay) ?? l.assets.find((a) => a.ref === "station:ramp");
    return nearestOpen(open, way ? { x: l.x + way.x, y: l.y + way.y } : { x: l.x, y: l.y });
  }, [hereId, present]);
  const standing = spot.areaId === hereId ? spot : entry;
  const token = useRef<THREE.Group>(null);
  const duelRef = useRef(duel ? duelist : undefined);
  duelRef.current = duel ? duelist : undefined;
  const feet = useRef({ x: standing.x, y: standing.y });
  const leadFeet = leader ? followFeet : feet;
  // Going up to a roof or down from it: the figure is carried along a path (interiors/transit.ts) with a line or a flame where the way
  // has one; where it ends is where the party stands on arriving (`spot` is set for the new place when the way begins)
  const transit = useTransit((s) => s.now);
  const rope = useRef<THREE.Group>(null);
  const hook = useRef<THREE.Mesh>(null);
  const flame = useRef<THREE.Mesh>(null);
  const carried = useRef<{ id: number; g: TransitGeom; start: [number, number] } | null>(null);
  // Where the way up or down is made: a ladder where the roof has its ladder, else (a leap, a line, grips, flight, a jump down) the edge of
  // the roof nearest the party that has open ground under it
  const transitGeom = (run: TransitRun): TransitGeom | null => {
    const roof = world.areas[run.area];
    const l = roof?.layout;
    if (!l) return null;
    const near: [number, number] = [feet.current.x + 0.5, feet.current.y + 0.5];
    const ladder = l.assets.find((a) => a.kind === "exit" && a.side);
    const top = floorAt(l, (ladder?.x ?? 0) + 0.5, (ladder?.y ?? 0) + 0.5) + 0.02;
    if (run.kind === "ladder" && ladder) return geomOf(l, top, { side: ladder.side as TransitEdge, x: ladder.x, y: ladder.y }, near);
    let best: { side: TransitEdge; x: number; y: number; far: number } | null = null;
    const consider = (side: TransitEdge, i: number) => {
      const [wx, wz] = side === "n" ? [l.x + i + 0.5, l.y] : side === "s" ? [l.x + i + 0.5, l.y + l.height] : side === "w" ? [l.x, l.y + i + 0.5] : [l.x + l.width, l.y + i + 0.5];
      const [ox, oz] = side === "n" ? [l.x + i, l.y - 1] : side === "s" ? [l.x + i, l.y + l.height] : side === "w" ? [l.x - 1, l.y + i] : [l.x + l.width, l.y + i];
      if (!outdoors(ox, oz)) return;
      const far = Math.hypot(wx - near[0], wz - near[1]);
      if (!best || far < best.far) best = { side, x: side === "n" || side === "s" ? i : 0, y: side === "w" || side === "e" ? i : 0, far };
    };
    for (let i = 0; i < l.width; i++) { consider("n", i); consider("s", i); }
    for (let i = 0; i < l.height; i++) { consider("w", i); consider("e", i); }
    const pick = best as { side: TransitEdge; x: number; y: number } | null;
    if (pick) return geomOf(l, top, pick, near);
    return ladder ? geomOf(l, top, { side: ladder.side as TransitEdge, x: ladder.x, y: ladder.y }, near) : geomOf(l, top, undefined, near);
  };
  // The figure stays where the way ended until the party is moved to the roof or the street (a few frames; never longer than three seconds)
  const held = useRef<{ from: string; pose: ReturnType<typeof transitAt>; until: number } | null>(null);
  const asked = useTransit((s) => s.ask);
  useEffect(() => {
    if (!asked) return;
    if (!present) return void useTransit.getState().end();
    useTransit.getState().claim(asked.id);
    const g = transitGeom({ ...asked, start: 0, ms: 0 });
    if (!g) return void useTransit.getState().end();
    const begin = () => {
      // The party will stand where the way ends: on the roof's square it climbs onto, or the street square at the foot
      const [to, at] = asked.up ? [asked.area, g.roof] : [world.areas[asked.area]?.parentId ?? "", g.pad];
      carried.current = { id: asked.id, g, start: [feet.current.x + 0.5, feet.current.y + 0.5] };
      if (useTransit.getState().begin(asked.id) && to) usePartySpot.getState().stand(to, Math.floor(at[0]), Math.floor(at[1]));
    };
    // Walked to the foot of the way first (the street's squares, or the roof's), not carried across it
    const foot = asked.up ? g.pad : g.roof;
    if (Math.hypot(feet.current.x + 0.5 - foot[0], feet.current.y + 0.5 - foot[1]) < 0.9) return begin();
    walkTo([{ x: Math.floor(foot[0]), y: Math.floor(foot[1]) }], begin);
    if (!walk.current) begin();
  }, [asked?.id]);
  // At a card table (useTable): the party walks to a stool and sits on it; `sit` is how far down it is (0 to 1) and where the stool is, in the
  // building's squares
  const table = useTable((s) => s.at);
  const partySeat = useRef<SeatState>(seatState());
  const sit = useRef<{ k: number; x: number; y: number; face: number } | null>(null);
  const shotSeen = useRef(0);
  // Where the camera looks when the party is out of doors: at the party
  const eye = useRef<V3 | null>(null);
  // (cleared at once on leaving the street, not at the next frame: the camera is set on the new place in the same step, and with the
  // street's point still here it would be aimed at the street, which put it under a balcony or a roof climbed to)
  if (!(outside && planned) && !duel) eye.current = null;
  // (`pace` is a fraction of the full pace; a tap on the map is the full pace, the stick in the eye views sets its own)
  const walk = useRef<Walk | null>(null);
  // The party's water craft here (shared/logic "Over the water", house rules): moored on the water, where it was left (`berth`) or else off the
  // way in of the first building, its bow out from it. One whose helm the party is at (`afloat`) is under the party, who then goes only over the
  // water, at HELM_PACE; going to the decking, or in through a way in, it moors there and the party steps ashore. Under the sea only a
  // submersible is down there (a craft of the surface waits on the surface over the place).
  const settlementHere = trail.find((a) => a.kind === "settlement")?.id;
  const boatList = (scene.parked ?? []).filter((v) => v.areaId === settlementHere && isWaterCraft(v) && (water !== "under" || isSubmersible(v)));
  const boats = useMemo(() => {
    if (!water || !planned) return [];
    const wet = (x: number, y: number) => outdoors(x, y) && swimsAt(x, y);
    const taken = new Set<string>();
    const first = Object.values(street.doors)[0];
    const out: { v: PartyVehicle; x: number; y: number; face: number }[] = [];
    for (const v of boatList) {
      const berth = (v as PartyVehicle & { berth?: { x: number; y: number } }).berth;
      let at = berth && wet(berth.x, berth.y) && !taken.has(`${berth.x},${berth.y}`) ? berth : null;
      if (!at && first) {
        const o = { x: first.door.x + first.outward.x * 3, y: first.door.y + first.outward.y * 3 };
        for (let r = 0; r < 16 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && wet(o.x + dx, o.y + dy) && !taken.has(`${o.x + dx},${o.y + dy}`)) at = { x: o.x + dx, y: o.y + dy };
        }
      }
      if (!at) continue;
      taken.add(`${at.x},${at.y}`);
      out.push({ v, x: at.x, y: at.y, face: first ? Math.atan2(first.outward.x || 0.0001, first.outward.y || 0.0001) : 0 });
    }
    return out;
  }, [water, planned, street, deck, JSON.stringify(boatList.map((v) => [v.id, (v as { berth?: unknown }).berth, v.status]))]);
  // (stepping ashore is seen at once, before the game has saved it)
  const [ashore, setAshore] = useState<string | null>(null);
  useEffect(() => setAshore(null), [scene.afloat]);
  const afloatBoat = (!inside && boats.find((b) => b.v.id === scene.afloat && b.v.id !== ashore)) || null;
  afloatRef.current = afloatBoat;
  // Who rides in the craft with the party: the followers on their feet who are not beasts and not large, as many as its other seats hold (the
  // rest swim after it)
  const aboard = afloatBoat ? followers.filter((c) => c.kind !== "beast" && c.hp > 0 && !isLarge(c.size)).slice(0, Math.max(0, (afloatBoat.v.seats ?? 2) - 1)) : [];
  partyHeight.ride = afloatBoat ? rideKey(afloatBoat.v) : "";
  const lastOut = useRef<{ x: number; y: number } | null>(null);
  const moor = (at: { x: number; y: number }, id = afloatRef.current?.v.id) => {
    if (!id) return;
    afloatRef.current = null;
    setAshore(id);
    onAct?.({ type: "moor", id, x: at.x, y: at.y });
  };
  // Taking the helm from beside the craft: aboard it; going in through a way in at the helm: moored where the party left the water
  useEffect(() => {
    const b = afloatBoat;
    if (!b || Math.hypot(feet.current.x - b.x, feet.current.y - b.y) > 2.5) return;
    feet.current = { x: b.x, y: b.y };
    walk.current = null;
    spot.stand(hereId, b.x, b.y);
  }, [afloatBoat?.v.id]);
  useEffect(() => {
    if (inside && scene.afloat && scene.afloat !== ashore && lastOut.current && boatList.some((v) => v.id === scene.afloat)) moor(lastOut.current, scene.afloat);
  }, [inside?.id]);
  // Over the shoulder or from the eyes (interiors/ViewRig.tsx), instead of the overhead view; `facing` is the way the character looks then
  const mode = useView((v) => v.mode);
  const tierNow = useQuality((q) => q.tier);
  // The district's rooms are got ready while the party is in the street (2026-11-01, the user: "moving between interior rooms is jarring"): what
  // a room asks for when it is first drawn (the maps of its floor and walls, the kit's walls and the pieces of its pack, each loaded, decoded and
  // tinted) is asked for here, one a moment, so that going in finds it in the caches (surfaces.tsx SURFACES, interiors/assets.ts FILES, drei's
  // texture cache) and not on the road
  const warmKey = rooms.map((r) => r.id).join(",");
  useEffect(() => {
    if (!rooms.length || typeof window === "undefined") return;
    const jobs = new Map<string, () => void>();
    const typeOf = (r: Area) => world.areas[r.parentId ?? ""]?.type ?? building.type;
    for (const b of buildings) {
      for (const look of [floorLook(floorOf(b.type), b.type), floorLook(floorOf(b.type), b.type, true)]) {
        if (look) jobs.set(`floor:${look.dir}/${look.set}`, () => useTexture.preload(["diffuse", "normal", "height"].map((m) => `/textures/${look.dir}/${look.set}/${m}.jpg`)));
      }
    }
    for (const r of rooms) {
      const pack = packOf(r.name, typeOf(r));
      const wallPack = wallPackOf(typeOf(r));
      jobs.set(`wall:${wallSet(wallPack, biome)}`, () => void wallMaterial(wallSet(wallPack, biome), { vertexColors: true }));
      if (wallPack && hasWalls(wallPack)) {
        const wallTone = packTone(PACKS[wallPack], wall);
        for (const url of Object.values(WALL_FILES)) jobs.set(`file:${wallTone.id}|${url}`, () => void loadModel(url, "base", wallTone));
      }
      if (!pack) continue;
      const tone = packTone(PACKS[pack], wall);
      for (const a of r.layout?.assets ?? []) {
        const file = a.kind === "furniture" ? pieceOf(pack, a.name) : undefined;
        if (file) jobs.set(`file:${tone.id}|${file}`, () => void loadModel(file, "base", tone));
      }
    }
    const todo = [...jobs.values()];
    let timer = 0;
    const next = () => {
      todo.shift()?.();
      if (todo.length) timer = window.setTimeout(next, 90);
    };
    timer = window.setTimeout(next, 1500);
    return () => window.clearTimeout(timer);
  }, [warmKey, biome]);
  // The district's loading screen (2026-11-01, the user: "an initial loading screen that does not reappear when moving between
  // rooms/interior/exteriors"): when a district is first entered this session, each kind of room in it is opened in turn behind the
  // screen, the renderer drawing everything whether in view or not (babylon.ts `preparing`), until all it drew is ready (its shaders
  // compiled, its maps on the graphics card; five seconds at most a room). Babylon keeps those for the session, so going in and out
  // afterwards compiles nothing. Not on a renderer drawing in software (the play-through test's browser), which would take minutes.
  const gl = useThree((state) => state.gl) as unknown as { preparing?: boolean; prepared?: () => boolean; software?: boolean };
  const districtKey = district?.id ?? building.id;
  useEffect(() => {
    if (!planned || !warmRooms.length || READY_DISTRICTS.has(districtKey) || !gl.prepared || gl.software) return;
    setWarming(0);
    useWarmup.setState({ total: warmRooms.length, done: 0 });
    return () => {
      gl.preparing = false;
      setWarming(null);
      useWarmup.setState({ total: 0, done: 0 });
    };
  }, [districtKey, planned]);
  useEffect(() => {
    gl.preparing = warming !== null;
  }, [warming !== null]);
  const warmTick = useRef({ at: -1, frames: 0, since: 0 });
  useFrame(() => {
    if (warming === null) return;
    const t = warmTick.current;
    if (t.at !== warming) Object.assign(t, { at: warming, frames: 0, since: performance.now() });
    if (++t.frames < 3 || (!gl.prepared!() && performance.now() - t.since < 5000)) return;
    if (warming + 1 < warmRooms.length) {
      setWarming(warming + 1);
      useWarmup.setState({ done: warming + 1 });
      return;
    }
    READY_DISTRICTS.add(districtKey);
    setWarming(null);
    useWarmup.setState({ total: 0, done: 0 });
  });
  const viewing = mode !== "overhead" && present && !duel;
  const facing = useRef<number | null>(null);
  // How fast the party walks, as a fraction of the pace they have always had (7 squares a second): a tap on the map is the full pace, the stick sets its own
  const pace = useRef(1);
  useEffect(() => {
    if (!present) return;
    walk.current = null;
    // (the air is left behind with the place: a flight that sets down on a roof is standing on it)
    Object.assign(air.current, { mode: "ground", y: 0, vy: 0, burst: null, reel: null, drop: 0, landed: performance.now() });
    feet.current = { x: entry.x, y: entry.y };
    // (at the helm of a water craft, on the water where the craft is)
    const boat = afloatRef.current;
    if (boat && !wetAt(entry.x, entry.y)) feet.current = { x: boat.x, y: boat.y };
    spot.stand(hereId, feet.current.x, feet.current.y);
  }, [hereId, present]);
  // After a fight the party stands where the fight left them
  useEffect(() => {
    if (!walk.current && spot.areaId === hereId) feet.current = { x: spot.x, y: spot.y };
  }, [spot.x, spot.y, spot.areaId]);
  // How high the party stands: on the floor of the room they are in, up the steps of a stairwell
  const heightNow = () => {
    const l = inside?.layout;
    return l ? floorAt(l, feet.current.x - l.x + 0.5, feet.current.y - l.y + 0.5) : afloatRef.current ? (water === "under" ? UNDER_SWIM_Y : SEA_Y) : swimNow() ? (water === "under" ? UNDER_SWIM_Y : SWIM_Y) : 0;
  };
  const swimNow = () => !inside && !afloatRef.current && !!water && swimsAt(Math.round(feet.current.x), Math.round(feet.current.y));
  // ---- Jumping, the hook and the jetpack in real time (interiors/air.ts). Space jumps (held with a pack, it lights it and climbs), F fires the hook
  // where the crosshair or the mouse points, Left Shift fires the pack's burst the same way; their buttons are the phone's; E, Enter and a click activate.
  // A jump is the Handbook's (shared/logic jumpReach) made a hop of that height; what stands low (furniture) is hopped over, a wall is not; the hook
  // reels the party along its line to where it bit (a roof's edge, where there is a way up for its line, is the climb of that way); a running pack flies
  // over what stands low, with its own pace, climb and burst; falling from the air when it gives out is a fall (the game rolls it).
  const sceneGl = useThree((s) => s.gl);
  const sceneCamera = useThree((s) => s.camera);
  const sceneMouse = useThree((s) => s.pointer);
  const mouseAt = useRef(0);
  useEffect(() => {
    const el = sceneGl.domElement;
    const moved = () => { mouseAt.current = performance.now(); };
    el.addEventListener("pointermove", moved);
    return () => el.removeEventListener("pointermove", moved);
  }, [sceneGl]);
  useEffect(() => {
    if (!present || locked || duel) return;
    return bindAirKeys();
  }, [present, locked, !!duel]);
  const air = useRef({
    mode: "ground" as "ground" | "jump" | "fly" | "reel" | "perch", y: 0, vy: 0, t: 0, peak: 0, drop: 0, dir: [0, 0] as [number, number], jump: jumpOf(10) as JumpStats,
    seen: { jump: 0, hook: 0, boost: 0 }, cool: { hook: 0, boost: 0 }, burst: null as { v: [number, number, number]; left: number } | null,
    reel: null as { from: { x: number; y: number }; to: { x: number; y: number }; t: number; length: number; base: number } | null,
    landed: 0, auto: false, ignited: 0, climbing: 0, shot: { until: 0, to: [0, 0, 0] as V3, hit: false },
  });
  const pushAt = useRef({ t: 0, dx: 0, dz: 0 });
  const burstStopped = useRef(false);
  const shotG = useRef<THREE.Group>(null);
  const shotRope = useRef<THREE.Mesh>(null);
  const shotHook = useRef<THREE.Mesh>(null);
  // A square that is blocked by what stands on it (furniture, a bench, a crate) and not by a wall or the edge of the ground: hopped or flown over
  const hoppable = (x: number, y: number) => {
    if (open(x, y)) return false;
    if (inside) {
      const l = inside.layout!;
      const [lx, ly] = [x - l.x, y - l.y];
      return lx >= 0 && ly >= 0 && lx < l.width && ly < l.height && standsAt(l, lx, ly);
    }
    return x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y) && !barred.has(`${x},${y}`);
  };
  // How high what stands on a square of the street reaches: the block of the rooms over it (a storey each, two for a room with a mezzanine) and the
  // balustrade of a roof or balcony at the top; flown over once the party is higher than that
  const topAt = (x: number, y: number) => {
    let top = 0;
    for (const a of rooms) {
      const l = a.layout;
      if (!l || x < l.x || x >= l.x + l.width || y < l.y || y >= l.y + l.height || floorsOf(l)[1] < 0) continue;
      const form = formOf(a);
      top = Math.max(top, form === "roof" || form === "balcony" ? levelY(l) + 0.6 : levelY(l) + LEVEL_H * (l.tall ? 2 : 1) + 0.35);
    }
    return top;
  };
  const overRoof = (x: number, y: number) => !inside && x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && inRoom(x, y) && air.current.y >= topAt(x, y) + 0.1;
  const airPassable = (x: number, y: number) => open(x, y) || (air.current.y >= AIR.hop && hoppable(x, y)) || overRoof(x, y);
  // What is under a square, to come down onto: the top of a building's block (a roof that is not a room of its own is stood on as well: 2026-10-28,
  // the user: the party fell through such a roof and stuck in it), else the ground
  const surfaceAt = (x: number, y: number) => (!inside && x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && inRoom(x, y) ? topAt(x, y) : 0);
  // Walking on such a roof: onto squares of about the height stood at (a step of a hand's breadth up or down); a higher block is a wall, a lower
  // square, the street or the edge is a fall
  const perchPass = (x: number, y: number) => !inside && x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && inRoom(x, y) && Math.abs(topAt(x, y) - air.current.y) <= 0.4;
  const perchDrop = (x: number, y: number) => open(x, y) || (!inside && inRoom(x, y) && topAt(x, y) < air.current.y - 0.4);
  // The roof or balcony room over a square of the street, and the nearest square of it that can be stood on
  const roofAt = (x: number, y: number) => rooms.find((a) => a.layout && (formOf(a) === "roof" || formOf(a) === "balcony") && x >= a.layout.x && x < a.layout.x + a.layout.width && y >= a.layout.y && y < a.layout.y + a.layout.height);
  const standOn = (room: Area, x: number, y: number) => {
    const l = room.layout!;
    const free = (lx: number, ly: number) => lx >= 0 && ly >= 0 && lx < l.width && ly < l.height && standsAt(l, lx, ly) && !l.assets.some((a) => !a.side && a.blocks && a.x <= lx && lx < a.x + a.w && a.y <= ly && ly < a.y + a.h);
    let best: { x: number; y: number } | null = null;
    for (let ly = 0; ly < l.height; ly++) for (let lx = 0; lx < l.width; lx++) if (free(lx, ly) && (!best || Math.hypot(l.x + lx - x, l.y + ly - y) < Math.hypot(best.x - x, best.y - y))) best = { x: l.x + lx, y: l.y + ly };
    return best;
  };
  // A step in the air, slid along what stops it
  const moveBy = (dx: number, dy: number) => {
    const f = feet.current;
    for (const [ax, ay] of [[dx, dy], [dx, 0], [0, dy]] as [number, number][]) {
      if (!ax && !ay) continue;
      const [nx, ny] = [f.x + ax, f.y + ay];
      if (airPassable(Math.round(nx), Math.round(ny))) {
        feet.current = { x: nx, y: ny };
        return true;
      }
    }
    return false;
  };
  const nearBox = (p: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }, margin: number) =>
    Math.hypot(Math.max(box.x - p.x, 0, p.x - (box.x + box.width)), Math.max(box.y - p.y, 0, p.y - (box.y + box.height))) <= margin;
  const frontBox = () => districtPlan?.boxes[me.id] ?? plan;
  // What the crosshair (the eye views), the mouse (overhead, if it has moved) or the way the figure faces points at, as the shot's aim
  const aimNow = (hand: V3): Aimed => {
    const floorY = heightNow();
    const muzzle = new THREE.Vector3(...hand);
    if (viewing) return aimAt(sceneCamera, floorY, muzzle);
    if (performance.now() - mouseAt.current < 6000) return aimAt(sceneCamera, floorY, muzzle, undefined, undefined, sceneMouse.clone());
    const yaw = token.current?.rotation.y ?? 0;
    return aimFrom(muzzle, new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), floorY, muzzle);
  };
  const handNow = (): V3 => [feet.current.x + 0.5 - cx, heightNow() + air.current.y + 1.0 - 0.4 * stance.k, feet.current.y + 0.5 - cz];
  // ---- The shooter mode's fight (interiors/Shooter.tsx, rules in shared/logic/shooter.ts) is played on this map: it asks here what stops a
  // bolt (a wall; low furniture only below the height of its top, so that a counter is cover), where a body can stand, how high the floor is,
  // and where the muzzle and the crosshair are
  const shootSession = useShoot((s) => s.session);
  // (in a shooter fight the figure holds what the fight has drawn: the gun, or the blade)
  const shootWield = useShoot((st) => (!st.session ? undefined : st.hud.weapon === "blade" ? (st.hud.saber ? "saber" : "vibro") : st.hud.gun ? (/rifle|carbine|repeat|cannon|bowcaster|launcher|shotgun|sniper|cycler/i.test(st.hud.gun) ? "rifle" : "pistol") : undefined)) as "saber" | "vibro" | "rifle" | "pistol" | undefined;
  const shootFloor = (x: number, y: number) => {
    if (inside?.layout) return floorAt(inside.layout, x - inside.layout.x, y - inside.layout.y);
    let top = 0;
    for (const a of rooms) {
      const l = a.layout;
      if (!l || x < l.x || x >= l.x + l.width || y < l.y || y >= l.y + l.height) continue;
      const form = formOf(a);
      if (form === "roof" || form === "balcony" || form === "walkway" || form === "gallery") top = Math.max(top, levelY(l));
    }
    return top;
  };
  const shootCtx = useRef<ShooterCtx>(null as unknown as ShooterCtx);
  const shotCache = useRef({ at: 0, shot: null as ReturnType<ShooterCtx["shot"]> });
  shootCtx.current = {
    cx, cz,
    env: {
      blocks: (x, y, h) => {
        const [i, j] = [Math.floor(x), Math.floor(y)];
        if (open(i, j)) return false;
        const floor = shootFloor(x, y);
        if (hoppable(i, j)) return h < floor + 0.9;
        return h < Math.max(floor + 4, inside ? 0 : topAt(i, j) + 0.1);
      },
      walkable: (x, y) => open(Math.floor(x), Math.floor(y)),
      floorAt: shootFloor,
    },
    feet: () => feet.current,
    altitude: () => heightNow() + air.current.y,
    facing: () => facing.current ?? token.current?.rotation.y ?? 0,
    moving: () => !!walk.current,
    airborne: () => ["jump", "fly", "reel"].includes(air.current.mode),
    swimAt: () => (swimNow() && !afloatRef.current ? heightNow() : null),
    // (a portable teleporter in a fight: the party steps out on that square)
    place: (x, y) => {
      if (!open(x, y)) return false;
      walk.current = null;
      feet.current = { x, y };
      spot.stand(hereId, x, y);
      return true;
    },
    shot: (fresh = false) => {
      const c = shotCache.current;
      const t = performance.now();
      if (!fresh && c.shot && t - c.at < 70) return c.shot;
      const hand = handNow();
      const aim = aimNow(hand);
      const to = aim.blocked ?? aim.point;
      c.at = t;
      c.shot = { from: { x: hand[0] + cx, y: hand[2] + cz, h: hand[1] }, to: { x: to.x + cx, y: to.z + cz, h: to.y } };
      return c.shot;
    },
  };
  // The way the stick or keys point, from the walk they have queued
  const heading = (): [number, number] | null => {
    for (const p of walk.current?.path ?? []) {
      const [dx, dy] = [p.x - feet.current.x, p.y - feet.current.y];
      const length = Math.hypot(dx, dy);
      if (length > 0.3) return [dx / length, dy / length];
    }
    return null;
  };
  const land = (floor = 0) => {
    const A = air.current;
    const fell = Math.max(0, A.drop - floor) * FEET;
    const perched = floor > 0.05;
    A.mode = perched ? "perch" : "ground";
    A.y = floor;
    A.vy = 0;
    A.t = 0;
    A.drop = 0;
    A.burst = null;
    A.reel = null;
    A.landed = performance.now();
    // Down on the top of a block: it is stood on where it is (no square of the street is its own)
    if (perched) return void (fell >= 10 && onAct?.({ type: "fall", feet: Math.round(fell) }));
    const q = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
    if (!open(q.x, q.y)) {
      const n = nearestOpen(open, q);
      feet.current = { x: n.x, y: n.y };
    }
    spot.stand(hereId, feet.current.x, feet.current.y);
    if (fell >= 10) onAct?.({ type: "fall", feet: Math.round(fell) });
  };
  const ignite = () => {
    const A = air.current;
    const gear = useAir.getState().gear;
    if (!gear?.fly) return;
    if (!gear.fly.on) {
      A.auto = true;
      onAct?.({ type: "power", name: gear.fly.name, on: true });
    }
    A.ignited = performance.now();
    A.mode = "fly";
    A.drop = 0;
  };
  const beginJump = () => {
    const A = air.current;
    const gear = useAir.getState().gear;
    // (nobody jumps, or leaps at a wall, lying down)
    if (!active || useTransit.getState().now || useTable.getState().seated || useRun.getState().prone) return;
    const dir = heading();
    // Before a building with a way up that a leap reaches, a jump at its wall is the leap
    const box = frontBox();
    const yaw = token.current?.rotation.y ?? 0;
    const ahead = dir ?? [Math.sin(yaw), Math.cos(yaw)];
    if (!inside && A.mode !== "perch" && box && gear?.ways.leap && nearBox({ x: feet.current.x + 0.5 + ahead[0] * 1.3, y: feet.current.y + 0.5 + ahead[1] * 1.3 }, box, 0.3)) return void onAct?.({ type: "climb", how: "leap" });
    const jump = jumpOf(gear?.strength ?? 10, gear?.g ?? 1, gear?.size ?? "Medium", !!dir);
    // (leg reinforcements double the long jump, a jump power triples it: AirGear.leap, stance.jump)
    jump.carry *= (gear?.leap ?? 1) * stance.jump;
    A.y = (A.mode === "perch" ? A.y : 0) + 0.01;
    A.mode = "jump";
    A.jump = jump;
    A.vy = jump.rise;
    A.t = 0;
    A.peak = 0;
    A.drop = 0;
    A.dir = dir ?? [0, 0];
    walk.current = null;
  };
  const fireHook = () => {
    const A = air.current;
    const gear = useAir.getState().gear;
    if (!active || useTransit.getState().now || useTable.getState().seated) return;
    if (!gear?.hook) return void onAct?.({ type: "note", text: "You carry no grappling hook to fire." });
    if (A.cool.hook > 0 || A.mode === "reel") return;
    const hand = handNow();
    const aim = aimNow(hand);
    const from = new THREE.Vector3(...hand);
    const line = (aim.blocked ?? aim.point).clone().sub(from);
    const dist = line.length();
    const target = from.clone().add(line.clone().normalize().multiplyScalar(Math.min(dist, gear.hook.long)));
    A.cool.hook = AIR.hookCooldown;
    const grid = (v: THREE.Vector3): V3 => [v.x + cx, v.y, v.z + cz];
    if (aim.kind === "none" || dist > gear.hook.long || aim.person) {
      A.shot = { until: performance.now() + 450, to: grid(target), hit: false };
      return void onAct?.({ type: "note", text: aim.person ? "The hook is for ledges and walls: at a person it is a weapon, and weapons are drawn in a fight." : `Nothing to bite on within ${Math.round(gear.hook.long * FEET)} ft.` });
    }
    A.shot = { until: performance.now() + 900, to: grid(target), hit: true };
    // A building's wall or roof edge: the way up for the line, if there is one (the game asks for its check and shows the climb)
    const box = frontBox();
    if (!inside && box && nearBox({ x: target.x + cx, y: target.z + cz }, box, 1.8)) {
      if (gear.ways.hook) return void onAct?.({ type: "climb", how: "hook" });
      onAct?.({ type: "note", text: "The hook bites the wall, but its line is too short for the roof." });
    }
    const to = reelTo({ ...feet.current }, { x: target.x + cx - 0.5, y: target.z + cz - 0.5 }, open, hoppable);
    if (!to) return void onAct?.({ type: "note", text: "The hook bites, but there is nowhere to be pulled to." });
    walk.current = null;
    const base = (A.mode as string) === "perch" ? A.y : 0;
    A.mode = "reel";
    A.reel = { from: { ...feet.current }, to, t: 0, length: Math.hypot(to.x - feet.current.x, to.y - feet.current.y), base };
  };
  const fireBurst = () => {
    const A = air.current;
    const gear = useAir.getState().gear;
    if (!active || useTransit.getState().now || useTable.getState().seated) return;
    if (!gear?.fly) return void onAct?.({ type: "note", text: "You carry no jetpack or rocket boots." });
    if (A.cool.boost > 0 || A.mode === "reel") return;
    const hand = handNow();
    const aim = aimNow(hand);
    const d = (aim.blocked ?? aim.point).clone().sub(new THREE.Vector3(...hand)).normalize();
    // From above (overhead) the mouse points along the ground, and the burst climbs a little; from the eyes the pitch of the look counts
    if (!viewing) d.set(d.x, 0, d.z).normalize().setY(0.35).normalize();
    const f = flightOf(gear.fly.feet);
    ignite();
    A.y = Math.max(A.y, 0.05);
    A.burst = { v: [d.x * f.burst.speed, THREE.MathUtils.clamp(d.y * f.burst.speed, -5, 7), d.z * f.burst.speed], left: f.burst.time };
    A.cool.boost = AIR.boostCooldown;
  };
  // One frame of the air: the keys and buttons pressed since the last, then the jump, the flight or the reel in progress
  const airStep = (dt: number) => {
    const A = air.current;
    const store = useAir.getState();
    const gear = store.gear;
    A.cool.hook = Math.max(0, A.cool.hook - dt);
    A.cool.boost = Math.max(0, A.cool.boost - dt);
    if (store.taps.jump !== A.seen.jump) {
      A.seen.jump = store.taps.jump;
      if (A.mode === "ground" || A.mode === "perch") beginJump();
      // (in the shooter mode a fall is not rolled: Space pressed in the air lights the pack carried, and the fall is over)
      else if (A.mode === "jump" && gear?.fly && useView.getState().shooter) ignite();
    }
    if (store.taps.hook !== A.seen.hook) {
      A.seen.hook = store.taps.hook;
      fireHook();
    }
    if (store.taps.boost !== A.seen.boost) {
      A.seen.boost = store.taps.boost;
      fireBurst();
    }
    const face = (dx: number, dy: number) => { if (token.current && !viewing && (dx || dy)) token.current.rotation.y = Math.atan2(dx, dy); };
    // Stuck in a block (put there by a fall through a roof, or a hook's reel that ended in it): out to the nearest open square of the street
    if (A.mode === "ground" && !inside) {
      const q = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
      if (!open(q.x, q.y) && inRoom(q.x, q.y)) {
        const n = nearestOpen(open, q);
        feet.current = { x: n.x, y: n.y };
        walk.current = null;
        spot.stand(hereId, n.x, n.y);
      }
    }
    if (A.mode === "jump") {
      A.t += dt;
      A.vy -= (A.drop ? 9.8 : A.jump.gravity) * dt;
      A.y += A.vy * dt;
      A.peak = Math.max(A.peak, A.y);
      if (A.jump.carry && !A.drop) {
        moveBy(A.dir[0] * A.jump.carry * dt, A.dir[1] * A.jump.carry * dt);
        face(A.dir[0], A.dir[1]);
      }
      // A pack lit by a Space still held once the jump has risen a little
      if (gear?.fly && store.held.jump && A.t > 0.22 && !A.drop) ignite();
      const floor = surfaceAt(Math.round(feet.current.x), Math.round(feet.current.y));
      if (A.y <= floor && A.vy <= 0) land(floor);
    } else if (A.mode === "fly" && gear?.fly) {
      const f = flightOf(gear.fly.feet);
      if (!gear.fly.on && performance.now() - A.ignited > 1500) {
        // The pack has run dry: down from where it was
        A.mode = "jump";
        A.drop = A.y;
        A.vy = Math.min(A.vy, 0);
        A.burst = null;
      } else {
        burstStopped.current = false;
        if (A.burst) {
          A.burst.left -= dt;
          burstStopped.current = !moveBy(A.burst.v[0] * dt, A.burst.v[2] * dt);
          face(A.burst.v[0], A.burst.v[2]);
          A.vy = A.burst.v[1];
          if (A.burst.left <= 0) A.burst = null;
        } else A.vy += ((store.held.jump ? f.climb : -f.sink) - A.vy) * Math.min(1, (store.held.jump ? 7 : 3) * dt);
        // (under a ceiling, the pack stops at it)
        const ceiling = inside && !openAir(inside) ? Math.min(f.ceiling, LEVEL_H - 0.45) : f.ceiling;
        const floorHere = surfaceAt(Math.round(feet.current.x), Math.round(feet.current.y));
        A.y = Math.min(ceiling, Math.max(floorHere, A.y + A.vy * dt));
        if (A.y >= ceiling && A.vy > 0) A.vy = 0;
        // Over a roof or a balcony and down to its height: set down on it (any roof of the district, as high as the balustrade is cleared)
        if (!inside && performance.now() - A.climbing > 1500) {
          const sq = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
          const roof = roofAt(sq.x, sq.y);
          if (roof?.layout && A.y >= levelY(roof.layout) - 0.1 && A.y <= levelY(roof.layout) + 0.9) {
            const at = standOn(roof, sq.x, sq.y);
            if (at) {
              A.climbing = performance.now();
              onAct?.({ type: "alight", areaId: roof.id, x: at.x, y: at.y });
            }
          }
        }
        // Off the edge of a roof, flying: down to the street
        if (inside && (formOf(inside) === "roof" || formOf(inside) === "balcony") && performance.now() - A.climbing > 4000) {
          const push = pushAt.current;
          const pushing = performance.now() - push.t < 250 && Math.hypot(push.dx, push.dz) > 0.2;
          const next = { x: Math.round(feet.current.x + (push.dx / (Math.hypot(push.dx, push.dz) || 1)) * 0.9), y: Math.round(feet.current.y + (push.dz / (Math.hypot(push.dx, push.dz) || 1)) * 0.9) };
          const beyond = !open(next.x, next.y) && !hoppable(next.x, next.y);
          if ((pushing && beyond) || (A.burst && burstStopped.current)) {
            A.climbing = performance.now();
            onAct?.({ type: "climb", how: "fly", down: true });
          }
        }
        if (A.y <= floorHere + 0.001 && A.vy <= 0) land(floorHere);
      }
    } else if (A.mode === "fly") {
      A.mode = "jump";
      A.drop = A.y;
    } else if (A.mode === "reel" && A.reel) {
      const R = A.reel;
      R.t = Math.min(1, R.t + (dt * AIR.reel) / Math.max(1, R.length));
      feet.current = { x: R.from.x + (R.to.x - R.from.x) * R.t, y: R.from.y + (R.to.y - R.from.y) * R.t };
      A.y = R.base + Math.sin(Math.PI * R.t) * 0.6;
      face(R.to.x - R.from.x, R.to.y - R.from.y);
      A.shot.until = Math.max(A.shot.until, performance.now() + 120);
      if (R.t >= 1) land(surfaceAt(Math.round(feet.current.x), Math.round(feet.current.y)));
    } else if (A.mode === "perch") {
      // On the top of a block: the height follows the roof under the feet; off its edge (pushed over it) is a fall
      const sq = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
      const s = surfaceAt(sq.x, sq.y);
      if (s <= 0.05) {
        A.mode = "jump";
        A.drop = A.y;
        A.vy = 0;
      } else {
        A.y += (s - A.y) * Math.min(1, 12 * dt);
        const push = pushAt.current;
        const length = Math.hypot(push.dx, push.dz);
        if (performance.now() - push.t < 150 && length > 0.2) {
          const next = { x: Math.round(feet.current.x + (push.dx / length) * 0.9), y: Math.round(feet.current.y + (push.dz / length) * 0.9) };
          if (!perchPass(next.x, next.y) && perchDrop(next.x, next.y)) {
            walk.current = null;
            feet.current = { x: next.x, y: next.y };
            A.mode = "jump";
            A.drop = A.y;
            A.vy = 0;
            A.dir = [0, 0];
          }
        }
        if (A.auto && gear?.fly?.on && performance.now() - A.landed > 2500) {
          A.auto = false;
          onAct?.({ type: "power", name: gear.fly.name, on: false });
        }
      }
    } else if (A.mode === "ground" && A.auto && gear?.fly?.on && performance.now() - A.landed > 2500) {
      // A pack that was lit for the flight is put out again once the party has stood a while (what charge is left is kept)
      A.auto = false;
      onAct?.({ type: "power", name: gear.fly.name, on: false });
    }
    // The pack's flame and the hook's line
    if (flame.current) {
      const burning = A.mode === "fly" && (!!A.burst || store.held.jump);
      flame.current.visible = burning;
      if (burning) flame.current.scale.y = 0.8 + 0.5 * Math.abs(Math.sin(performance.now() / 45));
    }
    if (shotG.current && shotRope.current && shotHook.current) {
      const now = performance.now() < A.shot.until;
      shotG.current.visible = now;
      if (now) {
        const [hx, hy, hz] = [feet.current.x + 0.5, heightNow() + A.y + 1.0, feet.current.y + 0.5];
        const [tx, ty, tz] = A.shot.to;
        const v = new THREE.Vector3(tx - hx, ty - hy, tz - hz);
        const length = Math.max(0.05, v.length());
        shotRope.current.position.set((hx + tx) / 2, (hy + ty) / 2, (hz + tz) / 2);
        shotRope.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
        shotRope.current.scale.set(1, length, 1);
        shotHook.current.position.set(tx, ty, tz);
        shotHook.current.visible = A.shot.hit;
      }
    }
  };
  const sceneRoot = useThree((s) => s.scene);
  useEffect(() => {
    (window as unknown as { __air?: unknown }).__air = () => ({ ...air.current, feet: { ...feet.current }, height: heightNow() });
    // (a test puts the party in the air over a square, as if the pack had carried it there)
    (window as unknown as { __airAt?: unknown }).__airAt = (x: number, y: number, altitude: number) => {
      feet.current = { x, y };
      Object.assign(air.current, { mode: "fly", y: altitude, vy: 0, ignited: performance.now() + 60000 });
    };
    (window as unknown as { __aimInfo?: unknown }).__aimInfo = () => ({ solids: AIM.solids.size, targets: AIM.targets.size, boxes: [...AIM.solids].filter((o) => (o as THREE.Mesh).isMesh && !o.visible).map((o) => { const b = new THREE.Box3().setFromObject(o); return [b.min.x + cx, b.min.y, b.min.z + cz, b.max.x + cx, b.max.y, b.max.z + cz].map((v) => Math.round(v)); }) });
    // For test scripts: the big meshes of the scene, with what they are drawn with (a wall that shows a flat colour has no `map`)
    (window as unknown as { __bigMeshes?: unknown }).__bigMeshes = () => {
      const out: unknown[] = [];
      sceneRoot.updateMatrixWorld(true);
      sceneRoot.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible) return;
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        if (size.y < 2 || Math.max(size.x, size.z) < 4) return;
        const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshPhongMaterial;
        out.push({ min: [box.min.x + cx, box.min.y, box.min.z + cz].map((v) => Math.round(v * 10) / 10), size: [size.x, size.y, size.z].map((v) => Math.round(v * 10) / 10), mat: mat?.type, map: !!mat?.map, color: mat?.color?.getHexString?.(), solid: AIM.solids.has(m) });
      });
      return out;
    };
  });
  // The leader claims the square they stand on (`claims`): followers keep clear of it, and whoever stands there steps aside
  useEffect(() => () => { claims.delete(LEADER); }, []);
  useFrame((_, delta) => {
    claimSquare(LEADER, present && !duel ? squareOf(feet.current) : null);
    const going = walk.current;
    // Up to a roof or down from it: the figure is carried along its path, with a line or a flame where the way has one
    const run = useTransit.getState().now;
    const lift = run && carried.current?.id === run.id ? carried.current : null;
    if (run && lift && token.current && present) {
      walk.current = null;
      Object.assign(air.current, { mode: "ground", y: 0, vy: 0, burst: null, reel: null, drop: 0 });
      const pose = transitAt(run.kind, run.up, lift.g, lift.start, Math.min(1, (performance.now() - run.start) / run.ms));
      token.current.position.set(pose.x, pose.y, pose.z);
      token.current.rotation.y = pose.yaw;
      token.current.visible = true;
      feet.current = { x: pose.x - 0.5, y: pose.z - 0.5 };
      held.current = { from: hereId, pose, until: performance.now() + 3000 };
      if (rope.current && hook.current) {
        const line = run.kind === "hook";
        rope.current.visible = hook.current.visible = line;
        if (line) {
          const length = Math.max(0.2, lift.g.top - pose.y + 0.12);
          rope.current.scale.y = length;
          hook.current.position.set(0, 1.05 + length, 0.2);
        }
      }
      if (flame.current) {
        flame.current.visible = pose.burning;
        if (pose.burning) flame.current.scale.y = 0.8 + 0.5 * Math.abs(Math.sin(performance.now() / 45));
      }
      eye.current = outside && planned ? [feet.current.x + 0.5 - cx, 0, feet.current.y + 0.5 - cz] : null;
      return;
    }
    if (rope.current?.visible || flame.current?.visible) {
      rope.current && (rope.current.visible = false);
      hook.current && (hook.current.visible = false);
      flame.current && (flame.current.visible = false);
    }
    if (held.current) {
      if (held.current.from === hereId && performance.now() < held.current.until && token.current) {
        const { pose } = held.current;
        token.current.position.set(pose.x, pose.y, pose.z);
        return;
      }
      held.current = null;
    }
    airStep(Math.min(delta, 0.1));
    // (a swimmer's height in the water is shared with the co-op game, so the others see them in it)
    partyHeight.y = air.current.y + (swimNow() ? (water === "under" ? UNDER_SWIM_Y : SWIM_Y) : 0);
    partyHeight.at = air.current.mode === "ground" ? null : { ...feet.current };
    // Down onto the stool they have walked to, and up off it when they leave the table; the hands gesture as the game does
    const tb = useTable.getState();
    if (sit.current) {
      const down = tb.seated && !!tb.at;
      sit.current.k = easeSit(sit.current.k, down, Math.min(delta, 0.1));
      partySeat.current.sit = down;
      if (tb.shotKey !== shotSeen.current) {
        shotSeen.current = tb.shotKey;
        partySeat.current.shot = tb.shot;
        partySeat.current.shotKey = tb.shotKey;
      }
      if (!down && sit.current.k <= 0) sit.current = null;
    }
    if (token.current) {
      const into = sit.current ? smooth(sit.current.k) : 0;
      token.current.position.set(feet.current.x + 0.5 + (sit.current ? (sit.current.x - feet.current.x) * into : 0), heightNow() + air.current.y, feet.current.y + 0.5 + (sit.current ? (sit.current.y - feet.current.y) * into : 0));
      // (crouched behind cover, and leaning into a saber's swing: a shooter fight's stance)
      token.current.rotation.order = "YXZ";
      // (outside a fight, the Crouch button's)
      if (!shootSession) {
        const ease = Math.min(1, Math.min(delta, 0.1) * 8);
        const g = useRun.getState();
        stance.k += ((g.crouch ? 1 : 0) - stance.k) * ease;
        stance.p += ((g.prone ? 1 : 0) - stance.p) * ease;
      }
      // (the figure bends and lies down by itself: its joints, told by the party's motion)
      const pm = partyMotion.current;
      const gr = useRun.getState();
      if (!inside) lastOut.current = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
      pm.posture = swimNow() ? 3 : shootSession ? (stance.k > 0.5 ? 1 : 0) : gr.prone ? 2 : gr.crouch ? 1 : 0;
      pm.air = air.current.mode !== "ground";
      pm.ready = !!shootSession;
      token.current.rotation.x = 0;
      token.current.scale.y = 1;
      partyHeight.f = token.current.rotation.y;
      partyHeight.s = swimNow() ? 3 : stance.p > 0.5 ? 2 : stance.k > 0.5 ? 1 : 0;
      // From the eyes the character is not drawn; over the shoulder they face where the camera looks
      token.current.visible = !(viewing && mode === "first");
      if (viewing && facing.current !== null) token.current.rotation.y = facing.current;
      if (sit.current && into > 0.3) token.current.rotation.y = sit.current.face;
    }
    eye.current = duelRef.current ? [(duelRef.current.x ?? 0) + 0.5 - cx, (duelRef.current.z ?? 0) * LEVEL_H, (duelRef.current.y ?? 0) + 0.5 - cz] : outside && planned ? [feet.current.x + 0.5 - cx, 0, feet.current.y + 0.5 - cz] : null;
    if (!going || air.current.mode === "jump" || air.current.mode === "reel") return;
    // (a tap's walk is a walk, half the pace, unless Run is on; the stick sets its own; crouched is slower still)
    const gait = useRun.getState();
    // (in the water, the character's swimming pace: shared/logic swimPace, their species' swimming speed or half; at the helm of a water craft, HELM_PACE)
    let step = Math.min(delta, 0.5) * 7 * Math.max(0.05, going.pace ?? (gait.run ? 1 : WALK_FACTOR)) * (afloatRef.current ? HELM_PACE : swimNow() ? useAir.getState().gear?.swim ?? 0.5 : shootSession ? 1 : gait.prone ? PRONE_FACTOR : gait.crouch ? CROUCH_FACTOR : 1);
    while (step > 0 && going.path.length) {
      const next = going.path[0];
      const [dx, dy] = [next.x - feet.current.x, next.y - feet.current.y];
      const far = Math.hypot(dx, dy);
      if (token.current && far > 0.001 && facing.current === null) token.current.rotation.y = Math.atan2(dx, dy);
      if (far <= step) {
        feet.current = { ...next };
        going.path.shift();
        step -= far;
        // A loose flagstone gives way under the first foot to step on it
        const trap = inside ? trapsIn(inside, false).find((a) => inside.layout!.x + a.x === next.x && inside.layout!.y + a.y === next.y) : undefined;
        if (trap && inside) {
          walk.current = null;
          spot.stand(hereId, feet.current.x, feet.current.y);
          onAct?.({ type: "trap", areaId: inside.id, id: trap.id });
          return;
        }
      } else {
        feet.current = { x: feet.current.x + (dx / far) * step, y: feet.current.y + (dy / far) * step };
        step = 0;
      }
    }
    if (!going.path.length) {
      walk.current = null;
      spot.stand(hereId, feet.current.x, feet.current.y);
      going.then?.(going.total);
      // Stopping within two squares of a loose flagstone: the game sees whether it is noticed
      if (inside && trapsIn(inside, false).some((a) => Math.max(Math.abs(inside.layout!.x + a.x - feet.current.x), Math.abs(inside.layout!.y + a.y - feet.current.y)) <= 2)) onAct?.({ type: "near", areaId: inside.id });
      // Stopping within two squares of a secret way nobody has found: the game sees whether it is noticed
      for (const room of inside ? [inside] : rooms) {
        const way = room.secretEntry && !room.secretEntry.found ? room.layout?.assets.find((a) => a.kind === "secret") : undefined;
        if (!way) continue;
        const at = inside ? { x: room.layout!.x + way.x, y: room.layout!.y + way.y } : beyond(room.layout!, way);
        if (Math.max(Math.abs(at.x - feet.current.x), Math.abs(at.y - feet.current.y)) <= 2) onAct?.({ type: "near", areaId: room.id });
      }
    }
  });

  // What the people here have to go about their lives with: inside, the opened room's seats,
  // counters and stage; outside, a round about the building for the sentries of the way in
  const lifeApi = useRef<LifeApi | null>(null);
  // (a room's own: the one opened, and in an arena every part of its bowl, the floor and the tiers, which are all in sight of each other)
  const settingOf = (room: Area | null | undefined): Setting | null => {
    const opened = room;
    const l = opened?.layout;
    if (!l) return null;
    const isWayAt = (s: Sq) => l.assets.some((w) => w.side && w.x === s.x && w.y === s.y);
    // (only the squares that are floor: not the curve cut off a round room's corners, nor the open middle of an arena's tier)
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < l.width && y < l.height && standsAt(l, x, y) && !l.assets.some((a) => !a.side && a.blocks && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
    const spots = (squares: Sq[]) => squares.filter((q) => free(q.x, q.y) && !isWayAt(q));
    const uses = opened!.tags.filter((t) => t.startsWith("use:")).map((t) => t.slice(4));
    return {
      open: free,
      seats: l.assets.filter((a) => a.kind === "furniture" && uses.includes(a.name) && !isCounter(a)).map((a) => {
        const around = spots(aroundSquares(a.x, a.y, a.w, a.h));
        // A Sabacc table: each of its stools, with the free square beside the table that is nearest it (no two stools take one)
        const used = new Set<string>();
        const stools = stoolsOf(a.name, a.w, a.h).flatMap((s) => {
          const [x, y] = [a.x + s.x - 0.5, a.y + s.y - 0.5];
          const spot = around.filter((q) => !used.has(sqKey(q))).sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
          if (!spot) return [];
          used.add(sqKey(spot));
          return [{ spot, x, y, face: s.face }];
        });
        return { id: a.id, centre: [a.x + a.w / 2, 0, a.y + a.h / 2] as V3, spots: stools.length ? stools.map((s) => s.spot) : around, ...(stools.length ? { stools } : {}) };
      }),
      counters: l.assets.filter(isCounter).map((a) => ({ asset: a, front: spots(counterSides(l, a).front), behind: spots(counterSides(l, a).behind) })),
      stage: l.assets.filter((a) => a.name === "Bandstand").flatMap((a) => Array.from({ length: a.w * a.h }, (_, i) => ({ x: a.x + (i % a.w), y: a.y + Math.floor(i / a.w) }))),
      stageHeight: 0.22,
      round: [{ x: 1, y: 1 }, { x: l.width - 2, y: 1 }, { x: l.width - 2, y: l.height - 2 }, { x: 1, y: l.height - 2 }].map((c) => nearestOpen((x, y) => free(x, y) && !isWayAt({ x, y }), c)),
      watch: { x: Math.floor(l.width / 2), y: Math.floor(l.height / 2) },
      doors: l.assets.filter((a) => a.kind === "door" || a.kind === "exit").map((a) => ({ x: a.x, y: a.y })),
      // An arena's tier: its crowd stands on its floor (a terrace, flat), watching the middle of the pit over the rail
      ...(l.well ? { stands: (q: Sq) => (standsAt(l, q.x, q.y) ? 0 : undefined), pit: { x: l.width / 2 - 0.5, y: l.height / 2 - 0.5 } } : {}),
      talk: talkPlace(world.areas[opened!.parentId ?? ""]?.type ?? "", opened!.name, opened!.occupants.map((o) => o.role)),
      talkers: (a, b) => talkersOf(world, a, b),
      news: newsOf(world, opened!.id),
      scene: chatScene(talkPlace(world.areas[opened!.parentId ?? ""]?.type ?? "", opened!.name, opened!.occupants.map((o) => o.role)), [opened!.name, ...trailOf(world, opened!.id).filter((x) => x.kind === "building" || x.kind === "settlement" || x.kind === "planet").reverse().map((x) => x.name)], useClock.getState().minutes),
    };
  };
  const roomSetting = useMemo(() => settingOf(opened), [opened?.id, world]);
  // In an arena's bowl, the other parts of it: their people are alive too (they cheer, talk), each with its own setting
  const bowl = !!opened && isArenaBowl(opened) && world.areas[opened.parentId ?? ""]?.type === "arena";
  const bowlSettings = useMemo(() => (bowl ? Object.fromEntries(rooms.filter((a) => a !== opened && a.parentId === opened!.parentId && isArenaBowl(a)).map((a) => [a.id, settingOf(a)])) : {}), [opened?.id, world, bowl]);
  const streetSettings = useMemo(() => {
    if (!plan) return [] as { buildingId: string; setting: Setting; people: typeof street.sentries }[];
    return buildings.flatMap((b) => {
      const people = street.sentries.filter((s) => s.buildingId === b.id);
      const front = street.doors[b.id];
      if (!people.length || !front) return [];
      const box = districtPlan?.boxes[b.id] ?? plan;
      const corners = [{ x: box.x - 2, y: box.y - 2 }, { x: box.x + box.width + 1, y: box.y - 2 }, { x: box.x + box.width + 1, y: box.y + box.height + 1 }, { x: box.x - 2, y: box.y + box.height + 1 }].map((c) => nearestOpen(outdoors, c));
      // The round starts at the corner nearest the way in
      const first = corners.reduce((best, c, i) => (apart(c, front.door) < apart(corners[best], front.door) ? i : best), 0);
      const setting: Setting = { open: outdoors, seats: [], counters: [], stage: [], stageHeight: 0, round: [...corners.slice(first), ...corners.slice(0, first)], watch: { x: front.door.x + front.outward.x * 4, y: front.door.y + front.outward.y * 4 }, doors: [front.door] };
      return [{ buildingId: b.id, setting, people }];
    });
  }, [world, district?.id ?? building.id]);
  const gateOf = (buildingId: string) => rooms.find((a) => a.parentId === buildingId && a.gateway && !formOf(a)) ?? rooms.find((a) => a.parentId === buildingId);
  // People on the street: going out of the door towards the signpost for where they are going,
  // coming in from the one for where they were, between the doors of two buildings of the
  // district, or passing between two other places
  const moving: Mover[] = (world as World & { moving?: Mover[] }).moving ?? [];
  const streetWalkers = useMemo((): Walker[] => {
    if (!plan || opened) return [];
    const buildingOf = (id: string) => trailOf(world, id).find((a) => a.kind === "building")?.id;
    const signTo = (id: string) => {
      const b = buildingOf(id);
      return (b && street.signs.find((sign) => sign.exit.to === b)) || street.signs.find((sign) => sign.exit.via === "leave");
    };
    const doorOf = (id: string): V3 | undefined => {
      const f = street.doors[id];
      return f ? [f.door.x + 0.5, 0, f.door.y + 0.5] : undefined;
    };
    const by = (sign?: { x: number; y: number }): V3 | undefined => (sign ? [sign.x + 1.3, 0, sign.y + 0.5] : undefined);
    return moving.filter((m) => m.kind === "person").flatMap((m) => {
      const [fb, tb] = [buildingOf(m.from), buildingOf(m.to)];
      const [fromHere, toHere] = [!!fb && buildingIds.has(fb), !!tb && buildingIds.has(tb)];
      const ends: [V3 | undefined, V3 | undefined] = fromHere && toHere ? [doorOf(fb!), doorOf(tb!)]
        : fromHere && !toHere ? [doorOf(fb!), by(signTo(m.to))]
        : toHere && !fromHere ? [by(signTo(m.from)), doorOf(tb!)]
        : !fromHere && !toHere && fb && tb ? [by(street.signs.find((sign) => sign.exit.to === fb)), by(street.signs.find((sign) => sign.exit.to === tb))]
        : [undefined, undefined];
      // A blockade stops whoever is going out of the district, or coming into it, at the barricade, where the
      // officers question them
      const crossing = fromHere !== toHere;
      const held = blockade && crossing;
      return ends[0] && ends[1] && ends[0] !== ends[1] ? [{ key: m.id, from: ends[0], to: ends[1], progress: held ? (fromHere ? Math.min(m.progress, 0.8) : 0.08) : m.progress, kind: "person" as const, name: m.name, ...(held ? { note: "Questioned at the blockade" } : {}) }] : [];
    });
  }, [moving, plan, opened, street, blockade]);
  // The search's squads, each where its room is: in front of its building's door (one beside the
  // other), or up on the roof or catwalk it is on
  const squadSpots = useMemo((): SquadSpot[] => {
    if (!plan || opened) return [];
    // The search for the party, and the searches for the people of the settlement who broke the law
    const sources: { squads: Squad[]; label?: string }[] = [];
    const p = world.pursuit;
    // (squads sent from the garrison are in sight from the minute they muster, running to the scene; those with no garrison come when the law does)
    if (p?.squads?.length && minutes < p.searchUntil) {
      const running = p.squads.filter((sq) => sq.to && (sq.from || minutes >= p.arrivesAt));
      const searching = p.squads.filter((sq) => !sq.to && (sq.from || minutes >= p.arrivesAt));
      if (running.length) sources.push({ squads: running, label: "(answering the call)" });
      if (searching.length) sources.push({ squads: searching, label: "(after the party)" });
    }
    for (const i of world.incidents ?? []) if ((i.status === "open" || i.status === "fled") && minutes >= i.arrivesAt && minutes < i.searchUntil && i.squads.length) sources.push({ squads: i.squads, label: `(after ${i.name})` });
    const taken = new Map<string, number>();
    return sources.flatMap(({ squads, label }) => squads.flatMap((squad): SquadSpot[] => {
      const area = world.areas[squad.at];
      const bId = area?.kind === "building" ? area.id : area?.parentId ?? "";
      if (!area || !buildingIds.has(bId)) return [];
      const l = area.layout;
      if (area.kind === "room" && l && openAir(area)) return [{ key: squad.id, squad, label, at: [l.x + l.width / 2, levelY(l), l.y + l.height / 2] }];
      const front = street.doors[bId];
      if (!front) return [];
      const n = taken.get(bId) ?? 0;
      taken.set(bId, n + 1);
      const side = (n % 2 ? 1 : -1) * (1 + Math.floor(n / 2)) * 1.8;
      const spot = nearestOpen(outdoors, { x: Math.round(front.door.x + front.outward.x * 2 + Math.abs(front.outward.y) * side), y: Math.round(front.door.y + front.outward.y * 2 + Math.abs(front.outward.x) * side) });
      return [{ key: squad.id, squad, label, at: [spot.x + 0.5, 0, spot.y + 0.5] }];
    }));
  }, [world, minutes, plan, opened, street, barred]);
  // People about the street of a district, between the doors of its buildings
  const strollFolk = useRef<{ district: string; folk: Occupant[] } | null>(null);
  const strolls = useMemo((): Stroll[] => {
    if (!plan || !districtPlan || buildings.length < 2) return [];
    const doors = buildings.map((b) => street.doors[b.id]?.door).filter((d): d is { x: number; y: number } => !!d);
    if (doors.length < 2) return [];
    const fronts = buildings.map((b) => street.doors[b.id]).filter((d): d is NonNullable<typeof d> => !!d);
    const count = Math.min(8, buildings.length * 2);
    // (the district's own people: each walker is one of them, by name, species and trade, for when they stop to talk; with fewer of them
    // about at this hour than there are walkers, people of the settlement's other districts passing through)
    const peopleOf = (bs: Area[]) => bs.flatMap((b) => childrenOf(world, b.id)).flatMap((r) => r.occupants)
      .filter((o) => isLocal(o) && o.disposition !== "hostile" && !o.captive && !o.disabled && tokenOf(o) === "person")
      .sort((p, q) => unitOf(`${district!.id}|${p.id}`) - unitOf(`${district!.id}|${q.id}`));
    const settlementId = trailOf(world, building.id).find((a) => a.kind === "settlement")?.id;
    // (chosen once for the district: the world changes as the clock goes, and a walker must not turn into someone else on the way)
    const folk = strollFolk.current?.district === district!.id ? strollFolk.current.folk : peopleOf(buildings);
    if (strollFolk.current?.district !== district!.id) {
      if (folk.length < count && settlementId) folk.push(...peopleOf(childrenOf(world, settlementId).filter((a) => a.kind === "building" && !buildings.includes(a))));
      strollFolk.current = { district: district!.id, folk };
    }
    // (every door square, and each beast's hitch once it is given: no beast waits on another's)
    const hitched = new Set(doors.map((d) => `${d.x},${d.y}`));
    const lengthOf = (path: Sq[]) => path.reduce((n, q, k) => n + (k ? Math.hypot(q.x - path[k - 1].x, q.y - path[k - 1].y) : 0), 0);
    const out: Stroll[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(unitOf(`${district!.id}|stroll|${i}|a`) * doors.length);
      let b = Math.floor(unitOf(`${district!.id}|stroll|${i}|b`) * doors.length);
      if (b === a) b = (b + 1) % doors.length;
      const from = nearestOpen(outdoors, doors[a]);
      const to = nearestOpen(outdoors, doors[b]);
      const path = route(outdoors, from, [to]);
      if (!path || !path.length) continue;
      let full = [from, ...path];
      const salt = `${district!.id}|stroll|${i}`;
      // (nobody walks twice: past the people there are, a walker is nobody in particular and does not stop to talk)
      const who = folk[i];
      // (about one in four rides a beast, on a way long enough to be worth it: it has its errand at each door, interiors/limbs.ts errandAt;
      // the beast goes between its hitches by the two doors)
      let mount = lengthOf(full) >= 5 && unitOf(`${salt}|mount`) < 0.25 ? pickMount(salt) : undefined;
      if (mount) {
        const [ha, hb] = [fronts[a], fronts[b]].map((fr, k) => fr && hitchBy(fr.door, fr.outward, outdoors, hitched, `${salt}|${k}`));
        const ridden = ha && hb ? route(outdoors, ha, [hb]) : null;
        if (ha && hb && ridden?.length) {
          full = [ha, ...ridden];
          hitched.add(`${ha.x},${ha.y}`);
          hitched.add(`${hb.x},${hb.y}`);
        } else mount = undefined;
      }
      const run = lengthOf(full);
      out.push({ key: `stroll-${i}`, path: full, length: run, offset: unitOf(`${salt}|t`) * (mount ? errandLength(run) : run) * 2, mount, doors: [doors[a], doors[b]], who });
    }
    return out;
  }, [world, district?.id ?? building.id, street]);
  // Where the street's talk is, for the model that makes it (relations.ts `chatScene`)
  const streetScene = useMemo(() => chatScene("street", [district?.name ?? "", ...trail.filter((x) => x.kind === "settlement" || x.kind === "planet").reverse().map((x) => x.name)], useClock.getState().minutes), [district?.id, world]);
  // Hostiles who have noticed the party stop and watch it
  const watching = (area: Area | undefined, o: Occupant) => !!area && o.disposition === "hostile" && !!o.hitPoints && !area.allowed && (area.alert ?? (area === inside ? ALERT.confronting : -1)) >= ALERT.questioning;

  // Walk to a square, or up to something that stands on the given squares, then do what was asked
  const active = present && !locked && !duel;
  // Which steps can be taken in the room the party is in, on the building's grid (only a switchback has a rule: shared/logic canStep)
  const stepRule = () => {
    const l = inside?.layout;
    return l?.switchback ? (a: { x: number; y: number }, b: { x: number; y: number }) => canStep(l, { x: a.x - l.x, y: a.y - l.y }, { x: b.x - l.x, y: b.y - l.y }) : undefined;
  };
  const walkTo = (goals: { x: number; y: number }[], then?: (squares: number) => void) => {
    if (!active || useTransit.getState().now || useTable.getState().seated || air.current.mode === "jump" || air.current.mode === "reel" || air.current.mode === "perch") return;
    const from = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
    // Loose flagstones have to be stepped on to be felt, so the path is not pulled straight over them
    const traps = inside ? new Set(trapsIn(inside, false).map((t) => `${inside.layout!.x + t.x},${inside.layout!.y + t.y}`)) : undefined;
    // (up a switchback the way is not pulled straight: it would cut across the well from one flight to the other)
    const step = stepRule();
    // (at the helm, to land or a way in: alongside it on the water, then moored there and ashore)
    if (afloatRef.current && !inside && goals.length && !goals.some((g) => open(g.x, g.y))) {
      const landing = goals.flatMap((g) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dx, dy]) => ({ x: g.x + dx, y: g.y + dy }))).filter((q) => open(q.x, q.y) || (q.x === from.x && q.y === from.y));
      const way = landing.length ? route(open, from, landing) : null;
      if (!way) return void onAct?.({ type: "note", text: "The craft cannot come alongside there." });
      walk.current = { path: way, total: way.length, then: () => { moor({ x: Math.round(feet.current.x), y: Math.round(feet.current.y) }); walkTo(goals, then); } };
      return;
    }
    const path = route(open, from, goals.filter((g) => open(g.x, g.y) || (g.x === from.x && g.y === from.y)), step ? undefined : { keep: traps }, step);
    if (!path) onAct?.({ type: "note", text: gangRing.length ? "The gang bars the way out of the alley." : "There is no way through to there." });
    else walk.current = { path, then, total: path.length };
  };
  // A step the way a stick or key points, queued into the walk (so that flagstones, secret ways and arrivals all still happen): the
  // eight directions of the grid (nearest the push first), a diagonal only past two open squares, a blocked one slid along a
  // wall; the rules are in interiors/stick.ts `stickWalk`
  const stepToward = (dx: number, dz: number, speed = 1) => {
    if (!active || useTransit.getState().now || useTable.getState().seated) return;
    const A = air.current;
    // (a push of nothing is the stick or the keys let go: what they were walking ends there, where the party stands)
    if (Math.hypot(dx, dz) < 1e-6) {
      if (walk.current?.driven && (A.mode === "ground" || A.mode === "perch" || A.mode === "fly")) {
        walk.current = null;
        spot.stand(hereId, feet.current.x, feet.current.y);
      }
      return;
    }
    pushAt.current = { t: performance.now(), dx, dz };
    stance.movedAt = pushAt.current.t;
    if (A.mode === "jump" || A.mode === "reel") return;
    // Under a running pack the party flies over what stands low, at the pack's pace
    const gear = useAir.getState().gear;
    const flying = A.mode === "fly";
    // (in a fight the party's pace is what its buffs and states make it: interiors/aim.ts stance.pace)
    walk.current = stickWalk(walk.current, feet.current, dx, dz, speed * (flying && gear?.fly ? flightOf(gear.fly.feet).pace : 1) * Math.max(0.05, stance.pace), A.mode === "perch" ? perchPass : flying ? airPassable : open, stepRule());
  };
  // Sitting down at a card table: walk to the square beside the chosen stool, sit on it, ask the table's patrons to fill the other stools, and
  // hand Play the people who sit there (it opens the game); standing up is Play's `useTable.stand()`
  useEffect(() => {
    const at = useTable.getState().at;
    if (!at || !inside || inside.id !== at.areaId || !inside.layout) return;
    const l = inside.layout;
    const stool = roomSetting?.seats.find((s) => s.id === at.assetId)?.stools?.[at.stool];
    if (!stool) return void useTable.getState().stand();
    const name = l.assets.find((a) => a.id === at.assetId)?.name ?? "Sabacc table";
    const go = () => {
      sit.current = { k: 0, x: l.x + stool.x, y: l.y + stool.y, face: stool.face };
      useTable.getState().arrived();
      lifeApi.current?.recruit(at.assetId, 2);
      // (a moment for those asked to cross the room)
      setTimeout(() => {
        if (useTable.getState().at?.assetId !== at.assetId) return;
        const info = lifeApi.current?.table(at.assetId);
        onAct?.({ type: "table", areaId: inside.id, id: at.assetId, name, players: info?.players ?? [], croupier: info?.dealer });
      }, 2400);
    };
    const goal = { x: l.x + stool.spot.x, y: l.y + stool.spot.y };
    if (apart(squareOf(feet.current), goal) === 0) go();
    else {
      walkTo([goal], go);
      if (!walk.current) go();
    }
  }, [table?.assetId, table?.stool]);
  // Leaving the room stands the party up from the table
  useEffect(() => () => { if (useTable.getState().at) useTable.getState().stand(); }, [hereId]);
  // Which way to look on starting the eye views: into the room if the party has only just come in by a way (not at the door they came through),
  // else the way the figure faces
  const startYaw = () => {
    const l = inside?.layout;
    const rest = token.current?.rotation.y ?? 0;
    if (!l || Math.hypot(feet.current.x - entry.x, feet.current.y - entry.y) > 0.5) return rest;
    const near = l.assets.filter((a) => a.side && (a.kind === "door" || a.kind === "exit" || a.kind === "secret")).sort((a, b) => Math.hypot(a.x + l.x - feet.current.x, a.y + l.y - feet.current.y) - Math.hypot(b.x + l.x - feet.current.x, b.y + l.y - feet.current.y))[0];
    if (!near || Math.hypot(near.x + l.x - feet.current.x, near.y + l.y - feet.current.y) > 3) return rest;
    return { w: Math.PI / 2, e: -Math.PI / 2, n: 0, s: Math.PI }[near.side!];
  };
  const around = aroundSquares;

  // Call whoever serves at a counter over: the party goes up to the near side of it and they come
  // to the other side, so the two talk across it
  const callOver = (counterId: string) => {
    const l = inside?.layout;
    const counter = roomSetting?.counters.find((c) => c.asset.id === counterId);
    const staff = lifeApi.current?.servedBy(counterId);
    if (!l || !counter) return;
    if (!staff) return onAct?.({ type: "note", text: `Nobody is serving at the ${counter.asset.name.toLowerCase()} just now.` });
    const here = { x: Math.round(feet.current.x) - l.x, y: Math.round(feet.current.y) - l.y };
    const close = counter.front.some((f) => apart(f, here) <= 1) ? [here] : counter.front;
    walkTo(close.map((f) => ({ x: l.x + f.x, y: l.y + f.y })), () => {
      const near = { x: Math.round(feet.current.x) - l.x, y: Math.round(feet.current.y) - l.y };
      lifeApi.current?.summon(counterId, near, () => onAct?.({ type: "occupant", id: staff.id }));
    });
  };
  const lastTap = useRef<{ id: string; at: number; note?: ReturnType<typeof setTimeout> }>({ id: "", at: 0 });
  // Someone in the room was tapped: staff are called over to their counter, anyone else walked up to
  const tapPerson = (p: { occupant: Occupant; at: Sq; counter?: string }) => {
    const l = inside?.layout;
    if (!l) return;
    if (p.counter) return callOver(p.counter);
    walkTo(around(l.x + p.at.x, l.y + p.at.y), () => onAct?.({ type: "occupant", id: p.occupant.id }));
  };

  // Something in the room the party is in was tapped
  const actOn = (a: RoomAsset) => {
    const l = inside!.layout!;
    if (a.kind === "furniture" && a.ref?.startsWith("station:")) walkTo(around(l.x + a.x, l.y + a.y, a.w, a.h), () => onAct?.({ type: "station", id: a.ref!.slice(8) }));
    // A Sabacc table: the party takes the free stool nearest it (never the dealer's), and sits; Play opens the game once it has
    else if (a.kind === "furniture" && /sabacc/i.test(a.name) && lifeApi.current && !useTable.getState().at) {
      const info = lifeApi.current.table(a.id);
      const stools = roomSetting?.seats.find((s) => s.id === a.id)?.stools ?? [];
      const me = squareOf(feet.current);
      const free = info.free.filter((i) => i > 0 || !info.dealer).sort((p, q) => apart({ x: l.x + stools[p].spot.x, y: l.y + stools[p].spot.y }, me) - apart({ x: l.x + stools[q].spot.x, y: l.y + stools[q].spot.y }, me));
      if (!free.length) onAct?.({ type: "note", text: "Every stool at the table is taken. Wait for a seat." });
      else useTable.getState().sit({ areaId: inside!.id, assetId: a.id, stool: free[0] });
    }
    else if (a.kind === "furniture" && useKindOf(a.name)) walkTo(around(l.x + a.x, l.y + a.y, a.w, a.h), () => onAct?.({ type: "use", areaId: inside!.id, id: a.id, name: a.name }));
    else if (isCounter(a)) {
      // A double tap on a counter calls whoever serves there; a tap only says who that is
      // The note waits to see whether a second tap follows: on a phone it would cover the counter
      const now = tapTime();
      const again = lastTap.current.id === a.id && now - lastTap.current.at < 500;
      clearTimeout(lastTap.current.note);
      lastTap.current = { id: a.id, at: again ? 0 : now };
      const staff = lifeApi.current?.servedBy(a.id);
      if (again) callOver(a.id);
      else lastTap.current.note = setTimeout(() => onAct?.({ type: "note", text: staff ? `${a.name}: ${staff.name} serves here. Double tap it to call them over.` : a.name }), 500);
    } else if (a.kind === "window") walkTo([{ x: l.x + a.x, y: l.y + a.y }], () => onAct?.({ type: "window", areaId: inside!.id, id: a.id, outside: false }));
    // Stairs nobody can stand on are taken from their foot (or from beside them), stairs that can be stood on where they are
    else if (a.kind === "stairs") {
      const goals = stairsGoals(a, (x, y) => open(l.x + x, l.y + y)).map((q) => ({ x: l.x + q.x, y: l.y + q.y }));
      walkTo(goals, () => a.to && onAct?.({ type: "go", areaId: a.to }));
    }
    else if (a.side) walkTo([{ x: l.x + a.x, y: l.y + a.y }], () => a.to && onAct?.({ type: "go", areaId: a.to, secret: a.kind === "secret" }));
    else if (a.kind === "loot" && a.ref) walkTo(around(l.x + a.x, l.y + a.y), () => onAct?.({ type: "loot", id: a.ref! }));
    else if (a.kind === "ship" && a.ref && bayBerth(inside!, a, based[inside!.id], minuteNow()).visitor) {
      const berth = bayBerth(inside!, a, based[inside!.id], minuteNow());
      onAct?.({ type: "note", text: berth.ship ? `The ${berth.ship.name}, a visiting ${berth.ship.role}: in for a few hours, its crew aboard. It is not for sale.` : `${a.name}: free for a ship that puts down.` });
    } else if (a.kind === "ship" && a.ref && !bayBerth(inside!, a, based[inside!.id], minuteNow()).ship) onAct?.({ type: "note", text: `${a.name}'s berth: the ship is away on a voyage and will be back.` });
    else if (a.kind === "ship" && a.ref) walkTo(around(l.x + a.x, l.y + a.y, a.w, a.h), () => onAct?.({ type: "ship", id: a.ref! }));
    // Any other piece: a card that says what it is (and moves it with the Force, for one who can)
    else if (a.kind === "furniture") onAct?.({ type: "use", areaId: inside!.id, id: a.id, name: a.name });
    else onAct?.({ type: "note", text: a.name });
  };
  // Something in an outside wall was tapped from the street
  const actOutside = (room: Area, a: RoomAsset) => {
    const at = [beyond(room.layout!, a)];
    if (a.kind === "window") walkTo(at, () => onAct?.({ type: "window", areaId: room.id, id: a.id, outside: true }));
    else if (a.kind === "exit" || a.kind === "secret") walkTo(at, (squares) => {
      // Going in at the place a person in need was to be taken to, with them close behind, is taking them there
      const them = enc?.kind === "help" && enc.phase === "follow" && enc.target === room.parentId ? folkAt.current[enc.id] : undefined;
      const delivered = !!them && Math.hypot(them.x - feet.current.x, them.y - feet.current.y) <= 40;
      if (delivered) onAct?.({ type: "encounter", step: "delivered" });
      setTimeout(() => onAct?.({ type: "go", areaId: room.id, secret: a.kind === "secret", squares }), delivered ? 120 : 0);
    });
    else onAct?.({ type: "note", text: `${a.name}: a passage between two parts of the building.` });
  };
  const wayColor = (a: RoomAsset) =>
    (a.kind === "door" && world.paths.find((p) => p.id === a.ref)?.locked) || (a.kind === "window" && a.pane?.latch === "locked" && !a.pane.broken) ? WAY_COLORS.locked
    : a.kind === "window" && (a.pane?.latch === "open" || a.pane?.broken) && (a.pane.size === "large" || a.pane.size === "wide") ? WAY_COLORS.exit
    : WAY_COLORS[a.kind as keyof typeof WAY_COLORS] ?? WAY_COLORS.door;
  const wayLabel = (a: RoomAsset) => {
    if (a.kind === "window") return undefined;
    const lock = a.kind === "door" ? world.paths.find((p) => p.id === a.ref)?.locked : undefined;
    return `${a.kind === "door" ? world.areas[a.to ?? ""]?.name ?? a.name : a.kind === "exit" ? "Outside" : a.name}${lock ? ` (locked, DC ${lock})` : ""}`;
  };

  // The camera looks at the opened room, at the party when it is out of doors, else at the building
  const focus: V3 = duelist && duel ? [(duelist.x ?? 0) + 0.5 - cx, (duelist.z ?? 0) * LEVEL_H, (duelist.y ?? 0) + 0.5 - cz] : opened?.layout ? [opened.layout.x + opened.layout.width / 2 - cx, levelY(opened.layout) + rise(opened.layout) / 2, opened.layout.y + opened.layout.height / 2 - cz] : outside && planned ? [standing.x + 0.5 - cx, 0, standing.y + 0.5 - cz] : [0, 0, 0];
  // The ground hides a cellar: it is taken away while one is looked into
  const underground = !!opened?.layout && (opened.layout.level ?? 0) < 0;
  const reach = duel ? 22 : opened?.layout ? Math.max(opened.layout.width, opened.layout.height) * 1.1 + 6 : outside && planned ? 17 : plan ? Math.max(plan.width, plan.height) * 0.9 + 12 : 22;
  const floor = floorOf((opened ? world.areas[opened.parentId ?? ""] : me)?.type ?? building.type);
  // The rooms that have a roof of their own over them (a platform to climb to, shown on top of them)
  const roofed = new Set<string>();
  for (const room of rooms) {
    if (formOf(room) !== "roof" || !room.layout) continue;
    const under = rooms.find((o) => o !== room && o.layout && !formOf(o) && o.layout.x === room.layout!.x && o.layout.y === room.layout!.y && o.layout.width === room.layout!.width && o.layout.height === room.layout!.height && (o.layout.level ?? 0) + 1 === room.layout!.level);
    if (under) roofed.add(under.id);
  }
  const sizeOfGround = Math.max(240, ground.w + 80, ground.h + 80);
  // The ground round the building: a textured plane where the world has one (siteAssets groundTexture), else the plain colour
  const groundTex = groundTexture(biome, building.type, GROUND[biome] ?? "#1c222b");
  // (the textured plane runs past the ground that can be walked on, so a tap beyond it walks nowhere)
  const walkHere = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const x = Math.floor(e.point.x + cx), y = Math.floor(e.point.z + cz);
    if (e.delta <= 8 && ((x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h) || (afloatRef.current && wetAt(x, y)))) {
      if (placing) placeAt(x, y);
      else walkTo([{ x, y }]);
    }
  };
  // The look of the building's walls by the world it stands on (models.tsx styleOf)
  const style = styleOf(wall === STEEL ? "station" : biome, building.type);
  // How far each outside corner of a room is rounded (north-west, north-east, south-east, south-
  // west): a corner another room touches at the same height stays square, and so does one with a
  // door or window in the wall beside it (it is cut back to the nearest one)
  const radiiOf = (room: Area, most = style.corner): [number, number, number, number] => {
    const l = room.layout;
    // A round or oval room is drawn as its planned curve (shared/logic/footprint.ts), whatever touches it
    if (l?.shape) return shapeRadii(l.shape, l.width, l.height);
    if (!l || most <= 0) return [0, 0, 0, 0];
    const lv = l.level ?? 0;
    const top = lv + 1 + (l.climb?.levels ?? 0);
    const others = rooms.filter((o) => o !== room && o.layout && formOf(o) !== "gallery" && (o.layout.level ?? 0) < top && lv < (o.layout.level ?? 0) + 1 + (o.layout.climb?.levels ?? 0));
    const taken = (x: number, y: number) => others.some((o) => x >= o.layout!.x && x < o.layout!.x + o.layout!.width && y >= o.layout!.y && y < o.layout!.y + o.layout!.height);
    const ways = l.assets.filter((a) => a.side);
    const cap = Math.min(most, l.width / 2.5, l.height / 2.5);
    const corner = (cells: [number, number][], limits: number[]) => (cells.some(([x, y]) => taken(x, y)) ? 0 : Math.max(0, Math.min(cap, ...limits)));
    const { x, y, width: w, height: h } = l;
    const along = (side: string, f: (a: RoomAsset) => number) => ways.filter((a) => a.side === side).map(f);
    return [
      corner([[x - 1, y - 1], [x - 1, y], [x, y - 1]], [...along("n", (a) => a.x), ...along("w", (a) => a.y)]),
      corner([[x + w, y - 1], [x + w, y], [x + w - 1, y - 1]], [...along("n", (a) => w - a.x - 1), ...along("e", (a) => a.y)]),
      corner([[x + w, y + h], [x + w, y + h - 1], [x + w - 1, y + h]], [...along("s", (a) => w - a.x - 1), ...along("e", (a) => h - a.y - 1)]),
      corner([[x - 1, y + h], [x - 1, y + h - 1], [x, y + h]], [...along("s", (a) => a.x), ...along("w", (a) => h - a.y - 1)]),
    ];
  };
  // Inside a room the curve is kept small, so that the corner square stays a square to stand on
  const insideRadii = (room: Area) => (room.layout?.shape ? radiiOf(room) : radiiOf(room).map((r) => Math.min(r, 1.1))) as [number, number, number, number];
  // The room whose walls a roof or a gallery shares (2026-10-27): the roof's is the room under it (same footprint), the gallery's its host
  const roofUnder = (l: RoomLayout) => rooms.find((o) => roofed.has(o.id) && o.layout!.x === l.x && o.layout!.y === l.y && o.layout!.width === l.width && o.layout!.height === l.height);
  const likeOf = (room: Area): { buildingType: string; roomName: string } | undefined => {
    const f = formOf(room);
    const from = f === "gallery" ? rooms.find((r) => room.tags.includes(`host:${r.id}`)) : f === "roof" && room.layout ? roofUnder(room.layout) : undefined;
    return from ? { buildingType: building.type, roomName: from.name } : undefined;
  };

  return (
    <>
      <group position={[-cx, 0, -cz]}>
        {/* The earth round a cellar being looked into */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, levelY(opened?.layout) - 0.22, cz]} visible={underground}>
          <planeGeometry args={[sizeOfGround, sizeOfGround]} />
          <meshBasicMaterial color="#14100c" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.06, cz]} visible={!underground && !groundTex}>
          <planeGeometry args={[sizeOfGround, sizeOfGround]} />
          <meshBasicMaterial color={GROUND[biome] ?? "#1c222b"} />
        </mesh>
        {/* The ground round the building: a tap walks there. The textured plane covers the whole of the ground, so no dark rim shows round it */}
        {water === "sea" ? (
          <group visible={!underground}>
            <Sea at={[cx, SEA_Y, cz]} size={sizeOfGround} lite={tier === "lite"} onTap={tappable ? walkHere : undefined} />
            {deck && <Decks deck={deck} boxes={districtPlan ? buildings.map((b) => districtPlan.boxes[b.id]).filter(Boolean) : []} lite={tier === "lite"} onTap={tappable ? walkHere : undefined} />}
            <FishSchools ground={ground} depth={SEA_Y - 0.45} count={4} lite={tier === "lite"} />
            <SeaBeasts ground={ground} under={false} feet={feet} exposed={() => swimNow() && !afloatRef.current} onCome={(name) => onAct?.({ type: "seaBeast", name, step: "coming" })} onReach={active ? (name) => onAct?.({ type: "seaBeast", name, step: "reached" }) : undefined} />
          </group>
        ) : water === "under" ? (
          <group visible={!underground}>
            <GroundSurface set="dense_sand" tint={new THREE.Color("#8fc0b4")} parallax={groundTex?.parallax ?? 0.03} w={sizeOfGround} h={sizeOfGround} at={[cx, -0.02, cz]} onTap={tappable ? walkHere : undefined} />
            <UnderSea boxes={districtPlan ? buildings.map((b) => districtPlan.boxes[b.id]).filter(Boolean) : []} ground={ground} lite={tier === "lite"} />
            <FishSchools ground={ground} depth={2.6} count={7} lite={tier === "lite"} round />
            <SeaBeasts ground={ground} under feet={feet} exposed={() => swimNow() && !afloatRef.current} onCome={(name) => onAct?.({ type: "seaBeast", name, step: "coming" })} onReach={active ? (name) => onAct?.({ type: "seaBeast", name, step: "reached" }) : undefined} />
          </group>
        ) : groundTex ? (
          <group visible={!underground}>
            <GroundSurface set={groundTex.set} tint={groundTex.tint} parallax={groundTex.parallax} w={sizeOfGround} h={sizeOfGround} at={[cx, -0.02, cz]} onTap={tappable ? walkHere : undefined} />
            {/* Under an open sky the ground goes on, plainly, to the horizon's haze */}
            {look && <FarGround set={groundTex.set} tint={groundTex.tint} size={1000} at={[cx, -0.05, cz]} />}
          </group>
        ) : (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} visible={!underground} receiveShadow onClick={tappable ? walkHere : undefined}>
            <planeGeometry args={[ground.w, ground.h]} />
            <meshLambertMaterial color={new THREE.Color(GROUND[biome] ?? "#1c222b").multiplyScalar(1.5)} />
          </mesh>
        )}
        {/* (on a textured ground nothing is laid under a building: its dark patch was a fixed fake shadow, there by night and pointing
            nowhere; the sun and the lamps cast the real ones) */}
        {districtPlan && !groundTex && buildings.map((b) => {
          const box = districtPlan.boxes[b.id];
          return box ? (
            <mesh key={`lot-${b.id}`} rotation={[-Math.PI / 2, 0, 0]} position={[box.x + box.width / 2, -0.005, box.y + box.height / 2]} visible={!underground && water !== "sea"} raycast={() => null}>
              <planeGeometry args={[box.width + 1, box.height + 1]} />
              <meshLambertMaterial color={new THREE.Color(GROUND[biome] ?? "#1c222b").multiplyScalar(0.9)} />
            </mesh>
          ) : null;
        })}

        {!planned && (
          <group position={[cx, 0, cz]} onClick={(e) => tapPlace(e, building.id)}>
            <group scale={2.4}><BuildingModel type={building.type} wall={wall} /></group>
            <Label at={[0, 8, 0]} size={0.8}>{rooms.length ? building.name : `${building.name} (nobody has been inside)`}</Label>
          </group>
        )}

        {planned && rooms.map((room) => {
          const l = room.layout!;
          // Inside a building the others of its district are not drawn: nobody looks at them from
          // there, and a district is a lot to draw (on a roof, on a catwalk or in the street it is all in sight)
          // (from a roof, a catwalk or a mezzanine the street and the buildings round it are in sight, so they stay)
          if (opened && !openAir(opened) && formOf(opened) !== "gallery" && districtPlan && room.parentId !== opened.parentId) return null;
          if (room === opened) {
            return (
              <group key={room.id} position={[l.x, levelY(l), l.y]}>
                <RoomShell
                  plan={l}
                  corners={formOf(room) || openAir(room) ? undefined : insideRadii(room)}
                  style={style}
                  mood={(formOf(room) && building.type !== "cave") || openAir(room) ? undefined : { buildingType: building.type, roomName: room.name, biome }}
                  biome={biome}
                  like={likeOf(room)}
                  width={l.width}
                  height={l.height}
                  assets={shown}
                  floor={floor}
                  wall={wall}
                  ships={room.ships}
                  bay={{ room, based: based[room.id] }}
                  fullWalls={viewing}
                  railing={railingOf(room, rooms)}
                  meets={meetsOf(room, rooms)}
                  tallWalls={!!l.tall}
                  ceiling={viewing && !openAir(room) && !bowl}
                  wallHeight={bowl && !l.well && viewing ? LEVEL_H : undefined}
                  looted={(a) => { const c = room.loot.find((c) => c.id === a.ref); return !!c && (c.node ? nodeAt(c.node, minutes).charges === 0 : !!c.looted); }}
                  nodeOf={(a) => room.loot.find((c) => c.id === a.ref)?.node}
                  wayColor={wayColor}
                  wayLabel={wayLabel}
                  onFloor={inside ? (x, y) => (placing ? placeAt(l.x + x, l.y + y) : walkTo([{ x: l.x + x, y: l.y + y }])) : undefined}
                  onAsset={inside ? actOn : undefined}
                >
                  {!l.well && /^arena floor$/i.test(room.name) && world.areas[room.parentId ?? ""]?.type === "arena" && <PitBout arena={room.parentId!} width={l.width} height={l.height} />}
                  {roomSetting && !duel && (
                    <Life
                      people={[
                        ...shown.filter((a) => a.kind === "npc").map((a) => ({ key: a.id, occupant: room.occupants.find((o) => o.id === a.ref)!, at: { x: a.x, y: a.y } as Sq | null })),
                        // Someone whose day brings them here from elsewhere takes a free seat
                        ...room.occupants.filter((o) => !l.assets.some((a) => a.kind === "npc" && a.ref === o.id)).map((o) => ({ key: `v-${o.id}`, occupant: o, at: null })),
                      ]}
                      setting={roomSetting}
                      party={() => (inside ? { x: Math.round(feet.current.x) - l.x, y: Math.round(feet.current.y) - l.y } : null)}
                      origin={{ x: l.x, y: l.y }}
                      frozen={(o) => watching(inside ?? undefined, o) || !!o.captive || !!o.disabled}
                      onTap={inside ? tapPerson : undefined}
                      api={lifeApi}
                      record={!!inside}
                    />
                  )}
                </RoomShell>
                <Label at={[l.width / 2, 2.6 + rise(l), l.height / 2]} size={0.5} color="#facc15">{room.name}</Label>
              </group>
            );
          }
          // What is over the room being looked into is taken away, so that it can be seen
          const galleryOfOpened = !!opened && formOf(room) === "gallery" && room.tags.includes(`host:${opened.id}`);
          // (in an arena the tiers over the floor or a lower tier stay: the floor and every tier are in sight of each other)
          const bowlPart = isArenaBowl(room) && world.areas[room.parentId ?? ""]?.type === "arena";
          if (opened?.layout && levelY(l) > levelY(opened.layout) + 0.01 && sameFootprint(l, opened.layout) && !galleryOfOpened && !(bowl && bowlPart)) return null;
          // A room seen from outside it: closed, with what is set in its outside walls
          const form = formOf(room);
          // (a cave: its rooms under the ground are not seen from outside; from inside it, those round the one stood in are its rock)
          if (building.type === "cave" && room.parentId === building.id && (l.mask || form)) {
            const inCave = opened?.parentId === building.id;
            if (!inCave && (l.level ?? 0) < 0) return null;
            if (inCave) return <CaveBeyond key={room.id} room={room} biome={biome} tier={tierNow} tall={viewing} floor={floor} />;
          }
          // A room looked down into from its gallery is seen low, so that the gallery shows over it; so is the room behind a balcony
          // being stood on (its patio doors), which would stand in front of the balcony as a block
          const lookedFrom = opened && ((formOf(opened) === "gallery" && opened.tags.includes(`host:${room.id}`)) || (formOf(opened) === "balcony" && !!opened.layout?.assets.some((a) => a.kind === "door" && a.to === room.id)));
          if (bowlPart) {
            const people = l.assets.filter((a) => a.kind === "npc").map((a) => ({ key: a.id, occupant: room.occupants.find((o) => o.id === a.ref)!, at: { x: a.x, y: a.y } as Sq | null })).filter((p) => p.occupant);
            const setting = bowl ? bowlSettings[room.id] : null;
            return (
              <group key={room.id} position={[l.x, levelY(l), l.y]} onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                {l.well ? (
                  <Terrace w={l.width} h={l.height} well={l.well} wall={dimWall(wall, !!opened && !bowl)} base={l.level === 1 ? levelY(l) : 0} />
                ) : (
                  <RoomShell plan={l} corners={insideRadii(room)} width={l.width} height={l.height} assets={seen(room).filter((a) => a.kind !== "npc")} floor={floor} wall={wall} fullWalls wallHeight={LEVEL_H} wayColor={wayColor} wayLabel={() => undefined} biome={biome} like={{ buildingType: building.type, roomName: room.name }} />
                )}
                {!l.well && /^arena floor$/i.test(room.name) && <PitBout arena={room.parentId!} width={l.width} height={l.height} />}
                {!duel && setting && people.length > 0 && (
                  // (their squares are claimed apart from those of the room the party is in: another floor, the same squares on the map)
                  <Life people={people} setting={setting} party={() => (inside ? { x: Math.round(feet.current.x) - l.x, y: Math.round(feet.current.y) - l.y } : null)} origin={{ x: l.x + 10000 * ((l.level ?? 0) + 2), y: l.y }} frozen={(o) => !!o.captive || !!o.disabled} onTap={inside ? tapPerson : undefined} />
                )}
              </group>
            );
          }
          // (a room with the opened one standing right on it keeps its full height, so that there is no gap under the floor)
          const storeys = l.tall ? 2 : 1;
          const carries = !!opened?.layout && sameFootprint(l, opened.layout) && levelY(opened.layout) >= levelY(l) + LEVEL_H * storeys - 0.01;
          // (a room with a mezzanine is two floors high, so that those on the gallery have the roof well over their heads;
          // while another room is opened it is lowered a little, but still clears a figure on the gallery)
          const tall = lookedFrom ? WALL_HEIGHT : opened && !carries ? (l.tall ? LEVEL_H * 1.3 : LEVEL_H / 2) : LEVEL_H * storeys;
          // (the floor of an opened room above, or of a roof, is a slab 0.2 thick with the same footprint, and
          // sits on this room: the block stops where the slab starts, so that their faces are never in one plane)
          const sunk = carries ? 0.2 : roofed.has(room.id) ? 0.18 : 0;
          // (a flight under the opened one, in a tower's stair block, stops at its floor: its climb would fill the flight above)
          const body = (carries && opened?.layout ? Math.min(tall + rise(l), levelY(opened.layout) - levelY(l)) : tall + rise(l)) - sunk;
          const lift = levelY(l);
          const roof = hue(room.id);
          const wallColor = new THREE.Color(wall).multiplyScalar(opened ? 0.45 : 1).getStyle();
          const slab = (color: string) => <Box at={[l.width / 2, 0.06, l.height / 2]} size={[l.width, 0.12, l.height]} color={color} />;
          const rail = (sides = "nesw") => (
            <>
              {sides.includes("n") && <Balustrade at={[l.width / 2, 0.04]} length={l.width} along="x" h={BALUSTRADE_HEIGHT} base={0.12} />}
              {sides.includes("s") && <Balustrade at={[l.width / 2, l.height - 0.04]} length={l.width} along="x" h={BALUSTRADE_HEIGHT} base={0.12} />}
              {sides.includes("w") && <Balustrade at={[0.04, l.height / 2]} length={l.height} along="z" h={BALUSTRADE_HEIGHT} base={0.12} />}
              {sides.includes("e") && <Balustrade at={[l.width - 0.04, l.height / 2]} length={l.height} along="z" h={BALUSTRADE_HEIGHT} base={0.12} />}
            </>
          );
          // (the four walls of an open-topped room: of the room's wall set, and not overlapping at the corners or the floor, where their faces lay in
          // one plane with another box's and flashed: 2026-10-27, the user's hangar exterior)
          const hollowSet = wallSet(wallPackOf(building.type), biome);
          const hollow = (h: number, color: string) => (
            <>
              <Box at={[l.width / 2, h / 2, 0.08]} size={[l.width, h, 0.16]} color={color} solid wall={hollowSet} />
              <Box at={[l.width / 2, h / 2, l.height - 0.08]} size={[l.width, h, 0.16]} color={color} solid wall={hollowSet} />
              <Box at={[0.08, h / 2, l.height / 2]} size={[0.16, h, l.height - 0.32]} color={color} solid wall={hollowSet} />
              <Box at={[l.width - 0.08, h / 2, l.height / 2]} size={[0.16, h, l.height - 0.32]} color={color} solid wall={hollowSet} />
            </>
          );
          return (
            <WallAnchor key={room.id} at={[l.x, lift, l.y]}><group position={[l.x, lift, l.y]}>
              {/* What an upper floor stands on */}
              {/* What a raised room stands on, in the wall set of the room (it was a plain colour: the flat wall in the middle of the user's street) */}
              {lift > 0.01 && form !== "gallery" && form !== "walkway" && <Box at={[l.width / 2, -lift / 2, l.height / 2]} size={[l.width - 0.1, lift, l.height - 0.1]} color={new THREE.Color(wall).multiplyScalar(0.7).getStyle()} wall={wallSet(wallPackOf(building.type), biome)} solid={!opened} />}
              {form === "roof" ? (
                <group position={[0, 0.02, 0]} onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  <RoomShell plan={l} width={l.width} height={l.height} assets={seen(room).filter((a) => a.kind !== "npc")} floor={floor} wall={wall} wayColor={wayColor} wayLabel={() => undefined} style={style} biome={biome} like={likeOf(room)} corners={(() => { const under = roofUnder(l); return under ? radiiOf(under) : undefined; })()} />
                  {/* Who stands on it, to be seen from the street */}
                  {!duel && l.assets.filter((a) => a.kind === "npc").map((a) => {
                    const o = room.occupants.find((x) => x.id === a.ref);
                    return o ? (
                      <group key={a.id} position={[a.x + 0.5, 0, a.y + 0.5]}>
                        <Figure kind={tokenOf(o)} ring={SIDE_COLORS[o.disposition]} name={o.name} large={isLarge(o.size)} species={o.species} role={o.role} creature={o.creature} size={o.size} />
                        <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS[o.disposition]}>{o.name}</Label>
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} label={o.name} person />
                      </group>
                    ) : null;
                  })}
                  {/* The ladder up the wall from the street, with its pad to be tapped */}
                  {l.assets.filter((a) => a.kind === "exit").map((a) => {
                    const at = onWall(l, a);
                    const step = beyond(l, a);
                    const sign = a.side === "s" || a.side === "e" ? 1 : -1;
                    const top = lift + 0.9;
                    const rungs = Math.max(2, Math.round(top / 0.4));
                    return (
                      <group key={a.id}>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[step.x - l.x + 0.5, -lift - 0.02 + 0.03, step.y - l.y + 0.5]} onClick={tappable ? (e) => { e.stopPropagation(); if (e.delta <= 8) actOutside(room, a); } : undefined}>
                          <planeGeometry args={[0.92, 0.92]} />
                          <meshBasicMaterial color={WAY_COLORS.exit} transparent opacity={0.45} depthWrite={false} />
                        </mesh>
                        <group position={[at.x, -lift - 0.02, at.z]} rotation={[0, at.turn, 0]}>
                          {[-0.28, 0.28].map((x) => <Box key={x} at={[x, top / 2, sign * 0.12]} size={[0.06, top, 0.06]} color="#c8ccd2" />)}
                          {Array.from({ length: rungs }, (_, i) => <Box key={i} at={[0, 0.25 + (i * (top - 0.4)) / rungs, sign * 0.12]} size={[0.56, 0.05, 0.05]} color="#9aa0a8" />)}
                          <Label at={[0, top + 0.5, sign * 0.1]} size={0.3} color={WAY_COLORS.exit}>Ladder to the roof</Label>
                          {tappable && <Hit at={[0, top / 2, sign * 0.3]} size={[0.9, top, 0.8]} onTap={() => actOutside(room, a)} label={a.name} />}
                        </group>
                      </group>
                    );
                  })}
                </group>
              ) : form === "walkway" ? (
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  {slab("#59636d")}
                  {rail()}
                  {/* Posts it stands on, down to the street */}
                  {lift > 0.01 && [[0.1, 0.1], [l.width - 0.1, 0.1], [0.1, l.height - 0.1], [l.width - 0.1, l.height - 0.1]].map(([px, pz], i) => <Box key={i} at={[px, -lift / 2, pz]} size={[0.1, lift, 0.1]} color="#59636d" />)}
                </group>
              ) : form === "balcony" ? (
                // A balcony over the street (shared/logic "Balconies"): its floor and balustrade (reached by its patio doors, or from the street with climbing gear: outsideClimbs)
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  {slab("#6b6f78")}
                  {rail()}
                </group>
              ) : form === "gallery" ? (
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  {galleryOfOpened ? (
                    <mesh position={[l.width / 2, 0.06, l.height / 2]}>
                      <boxGeometry args={[l.width, 0.12, l.height]} />
                      <meshLambertMaterial color="#4a525c" transparent opacity={0.72} />
                    </mesh>
                  ) : slab(opened ? "#2b333c" : "#59636d")}
                  {!duel && l.assets.filter((a) => a.kind === "npc").map((a) => {
                    const o = room.occupants.find((x) => x.id === a.ref);
                    return o ? (
                      <group key={a.id} position={[a.x + 0.5, 0.12, a.y + 0.5]}>
                        <Figure kind={tokenOf(o)} ring={SIDE_COLORS[o.disposition]} name={o.name} large={isLarge(o.size)} species={o.species} role={o.role} creature={o.creature} size={o.size} />
                        <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS[o.disposition]}>{o.name}</Label>
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} label={o.name} person />
                      </group>
                    ) : null;
                  })}
                  {rail(railingOf(room, rooms) || "s")}
                </group>
              ) : lookedFrom ? (
                // The room under a mezzanine is looked down into, not boxed in: its floor, low walls and what is in it
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  <RoomShell plan={l} width={l.width} height={l.height} assets={seen(room).filter((a) => a.kind !== "npc")} floor={floor} wall={wall} ships={room.ships} bay={{ room, based: based[room.id] }} wayColor={wayColor} wayLabel={() => undefined} biome={biome} like={{ buildingType: building.type, roomName: room.name }} />
                  {!duel && l.assets.filter((a) => a.kind === "npc").map((a) => {
                    const o = room.occupants.find((x) => x.id === a.ref);
                    return o ? (
                      <group key={a.id} position={[a.x + 0.5, 0, a.y + 0.5]}>
                        <Figure kind={tokenOf(o)} ring={SIDE_COLORS[o.disposition]} name={o.name} large={isLarge(o.size)} species={o.species} role={o.role} creature={o.creature} size={o.size} />
                        <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS[o.disposition]}>{o.name}</Label>
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} label={o.name} person />
                      </group>
                    ) : null;
                  })}
                </group>
              ) : l.roof ? (
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  {/* Open to the sky, the ships inside it to be seen; where the air is no good, doors in the roof slide back */}
                  <Box at={[l.width / 2, 0.04, l.height / 2]} size={[l.width - 0.1, 0.08, l.height - 0.1]} color={FLOORS.hangar} />
                  {hollow(tall, wallColor)}
                  {l.assets.filter((a) => a.kind === "ship").map((a) => (
                    <group key={a.id} position={[a.x, 0, a.y]}>
                      <BayBerth room={room} asset={a} based={based[room.id]} ceiling={l.roof === "hangar" ? tall - 0.3 : undefined} rise={tall + 5} />
                    </group>
                  ))}
                  {l.roof === "hangar" && !opened && <HangarRoof width={l.width} height={l.height} y={tall + 0.05} door={() => bayDoor(room, based[room.id], minuteNow())} />}
                </group>
              ) : (
                <>
                  <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                    {/* A cave is rock, not a building: a mound over its winding floor, open at its mouth */}
                    {building.type === "cave" && l.mask && !form ? (
                      <CaveMound mask={l.mask} exits={l.assets.filter((a) => a.kind === "exit").map((a) => ({ x: a.x, y: a.y, side: a.side }))} w={l.width} h={l.height} biome={biome} tier={tierNow} seed={l.width * 31 + l.height} />
                    ) : (
                    <RoomBlock w={l.width} d={l.height} height={body} radii={form ? [0, 0, 0, 0] : radiiOf(room)} wall={wallColor} roof={roofed.has(room.id) ? undefined : opened ? "#1a2028" : "#4a525c"} parapet={!opened && !form && !roofed.has(room.id)} band={style.band && !opened && !form} set={wallSet(wallPackOf(building.type), biome)} />
                    )}
                    {!opened && !form && !(building.type === "cave" && l.mask) && <AimBox at={[l.width / 2, body / 2, l.height / 2]} size={[l.width, body, l.height]} />}
                    {/* out to the curve of a round room it stands against */}
                    {!(building.type === "cave" && l.mask) && meetsOf(room, rooms).map((m, i) => <MeetFill key={`meet${i}`} meet={m} width={l.width} height={l.height} y={0} h={body} color={wallColor} wall={wallSet(wallPackOf(building.type), biome)} />)}
                  </group>
                  {!opened && !form && !roofed.has(room.id) && !(building.type === "cave" && l.mask) && (
                    <>
                      {/* What stands on the roof */}
                      {/* (a tower of a palace is capped with a spire, its great hall with a dome) */}
                      {/tower/i.test(room.name) ? <group position={[l.width / 2, tall + 0.1, l.height / 2]}><Cyl at={[0, 1.4, 0]} r={Math.min(l.width, l.height) * 0.42} h={2.8} color={paletteOf(biome).canvas[0]} top={0.03} /><Cyl at={[0, 3.0, 0]} r={0.04} h={0.8} color="#d8b45a" /></group>
                        : /audience chamber/i.test(room.name) && building.type === "palace" ? <group position={[l.width / 2, tall + 0.1, l.height / 2]}><DomeRoof r={Math.min(l.width, l.height) * 0.4} color={wall} set={wallSet(wallPackOf(building.type), biome)} /></group>
                        : room.gateway ? <group position={[l.width / 2, tall + 0.1, l.height / 2]}><DomeRoof r={Math.min(l.width, l.height) * 0.3} color={wall} set={wallSet(wallPackOf(building.type), biome)} /></group>
                        : roof % 3 === 0 ? <><Box at={[l.width * 0.3, tall + 0.35, l.height * 0.35]} size={[1, 0.5, 0.8]} color="#59636d" /><Cyl at={[l.width * 0.3, tall + 0.65, l.height * 0.35]} r={0.25} h={0.1} color="#2b2f36" /></>
                        : roof % 3 === 1 ? <Mast at={[l.width * 0.7, tall + 0.1, l.height * 0.6]} h={1.8} />
                        : <Cyl at={[l.width * 0.6, tall + 0.4, l.height * 0.4]} r={0.5} h={0.6} color="#59636d" />}
                    </>
                  )}
                </>
              )}
              {!opened && form !== "roof" && form !== "balcony" && l.assets.filter((a) => a.side && (a.kind === "exit" || a.kind === "window" || (a.kind === "secret" && room.secretEntry?.found) || (a.kind === "door" && !inRoom(beyond(l, a).x, beyond(l, a).y)))).map((a) => {
                // on the block's own wall line: the curve of a round room's block, not the square round it
                const place = wayPlace(outline(l.width, l.height, form ? [0, 0, 0, 0] : radiiOf(room)), l.width, l.height, a);
                const at = { x: place.at[0], z: place.at[1], turn: place.turn };
                const step = beyond(l, a);
                return (
                  <group key={a.id}>
                  {a.kind !== "window" && a.kind !== "door" && (
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[step.x - l.x + 0.5, 0.02, step.y - l.y + 0.5]} onClick={tappable ? (e) => { e.stopPropagation(); if (e.delta <= 8) actOutside(room, a); } : undefined}>
                      <planeGeometry args={[0.92, 0.92]} />
                      <meshBasicMaterial color={a.kind === "exit" && shut.has(room.parentId ?? "") ? WAY_COLORS.locked : WAY_COLORS[a.kind as keyof typeof WAY_COLORS]} transparent opacity={0.45} depthWrite={false} />
                    </mesh>
                  )}
                  <group position={[at.x, 0, at.z]} rotation={[0, at.turn, 0]}>
                    <Doorway rock={building.type === "cave" && !!l.mask ? { biome, tier: tierNow, seed: a.x * 7 + a.y * 13 + l.width, outside: true } : undefined} name={a.name} pane={a.pane} kind={a.kind} color={a.kind === "exit" && shut.has(room.parentId ?? "") ? WAY_COLORS.locked : a.kind === "window" ? wayColor(a) : WAY_COLORS[a.kind as keyof typeof WAY_COLORS]} label={a.kind === "exit" ? (shut.has(room.parentId ?? "") ? "Locked for the night" : a.name === "Way out" ? "Way in" : "Back way in") : a.kind === "secret" ? a.name : undefined} onTap={tappable ? () => actOutside(room, a) : undefined} style={style} wall={wallSet(wallPackOf(building.type), biome)} tint={wallColor} bend={place.bend} />
                  </group>
                  </group>
                );
              })}
              {(reveal || (opened && shown.some((a) => a.to === room.id))) && <Label at={[l.width / 2, tall + 0.6, l.height / 2]} size={0.36} color="#aabbdd">{room.name}</Label>}
            </group></WallAnchor>
          );
        })}

        {planned && !opened && (
          <>
            {street.signs.map(({ exit, x, y }) => (
              <group key={`${exit.via}-${exit.to}`} position={[x + 0.5, 0, y + 0.5]}>
                <Cyl at={[0, 0.8, 0]} r={0.07} h={1.6} color={WOOD} />
                <Box at={[0, 1.4, 0]} size={[1.1, 0.36, 0.08]} color="#e8dcc0" glow={0.4} />
                <Label at={[0, 2.1, 0]} size={0.36} color="#e8dcc0">{`${exit.via === "leave" ? "Out to" : "To"} ${world.areas[exit.to].name}`}</Label>
                {tappable && <Hit at={[0, 0.8, 0]} size={[1.2, 1.8, 1.2]} onTap={() => (blockade ? onAct?.({ type: "note", text: "The officers hold the way out: barricades across the road until the search is called off." }) : walkTo(around(x, y), () => onAct?.({ type: "exit", exit })))} label="Way out" />}
              </group>
            ))}
            {barricades.map((b) => (
              <Barricade key={`${b.sign.x},${b.sign.y}`} squares={b.squares} guards={b.guards} onTap={tappable ? () => onAct?.({ type: "note", text: "Barricades. The officers are holding this way out until the search is called off." }) : undefined} />
            ))}
            {!duel && <Squads spots={squadSpots} onTap={tappable ? (squad, label) => onAct?.({ type: "note", text: `${squad.heavy ? "Troopers" : "Constables"} (${squad.count}) are searching the district ${label ?? ""}.` }) : undefined} />}
            {districtPlan?.grounds?.wall && <CurtainWall wall={districtPlan.grounds.wall} biome={biome} />}
            {districtPlan?.grounds?.gardens && <GardenGround rects={districtPlan.grounds.gardens} biome={biome} />}
            <Scatter placed={fixtures.placed} biome={biome} />
            <Scatter placed={street.ambient} biome={biome} />
            <Scatter placed={cover} biome={biome} />
            <Scatter placed={backdrop} biome={biome} />
            {fixtures.stalls.map((st) => {
              const keeper = buildings.flatMap((b) => b.occupants).find((o) => o.stall === st.id);
              const spot = keeperSpot(st);
              return (
                <group key={st.id}>
                  <group position={[st.x + st.w / 2, 0, st.y + st.h / 2]} rotation={[0, st.south ? 0 : Math.PI, 0]}>
                    <StallModel trade={st.trade} state={stallState("market", minutes)} canvas={st.canvas} seed={hue(st.id)} />
                  </group>
                  {keeper && stallState("market", minutes) !== "packed" && (
                    <group position={[spot.x, 0, spot.y]} rotation={[0, st.south ? 0 : Math.PI, 0]}>
                      <Figure kind={tokenOf(keeper)} ring={SIDE_COLORS[keeper.disposition]} name={keeper.name} species={keeper.species} role={keeper.role} />
                      <Label at={[0, 1.6, 0]} size={0.26} color={SIDE_COLORS[keeper.disposition]}>{keeper.name}</Label>
                      {tappable && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => walkTo(around(Math.floor(st.x + st.w / 2), st.south ? st.y + st.h : st.y - 1), () => onAct?.({ type: "occupant", id: keeper.id }))} label={keeper.name} />}
                    </group>
                  )}
                  {tappable && !keeper && <Hit at={[st.x + st.w / 2, 0.6, st.y + st.h / 2]} size={[st.w, 1.2, st.h]} onTap={() => onAct?.({ type: "note", text: stallState("market", minutes) === "packed" ? "The stall is packed up for the night; its keeper is gone home. It opens in the morning." : "Nobody keeps this stall just now." })} label="Stall" />}
                </group>
              );
            })}
            {street.decor.map((d, i) => (
              <group key={i} position={[d.x, 0, d.y]}>
                <Decor kind={d.kind} seed={d.x * 7 + d.y * 13} />
                {tappable && (d.kind === "kiosk" || d.kind === "camera") && <Hit at={[0.5, 0.8, 0.5]} size={[1, 1.8, 1]} onTap={() => walkTo(around(d.x, d.y), () => onAct?.({ type: "use", areaId: me.id, id: `street:${d.kind}:${d.x},${d.y}`, name: d.kind === "kiosk" ? "Info kiosk" : "Security camera" }))} label={d.kind === "kiosk" ? "Info kiosk" : "Security camera"} />}
              </group>
            ))}
            {street.folk.map(({ occupant, x, y }, i) => (
              <group key={`${occupant.id}-${i}`} position={[x + 0.5, 0, y + 0.5]}>
                <Figure kind={tokenOf(occupant)} ring={SIDE_COLORS[occupant.disposition]} name={occupant.name} large={isLarge(occupant.size)} species={occupant.species} role={occupant.role} creature={occupant.creature} size={occupant.size} />
                <Label at={[0, 1.6, 0]} size={0.26} color={SIDE_COLORS[occupant.disposition]}>{occupant.name}</Label>
                {tappable && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "occupant", id: occupant.id }))} label={occupant.name} />}
              </group>
            ))}
            {!duel && streetSettings.map(({ buildingId, setting, people }) => (
              <Life
                key={buildingId}
                people={people}
                setting={setting}
                party={() => (outside ? squareOf(feet.current) : null)}
                frozen={(o) => watching(gateOf(buildingId), o) || (!!world.areas[buildingId]?.alarm && o.disposition === "hostile") || !!o.captive || !!o.disabled}
                onTap={tappable ? (p) => walkTo(around(p.at.x, p.at.y), () => onAct?.({ type: "occupant", id: p.occupant.id })) : undefined}
              />
            ))}
            <Walkers walkers={streetWalkers} />
            {/* Alleys: a gang may be waiting in one in a lawless place, and closes in when the party walks into it */}
            <AlleyWatch plan={districtPlan} feet={feet} active={tappable && !locked && !world.encounter && lawAt(world, building.id) === 0 && !noEncounters()} onEnter={(alley) => onAct?.({ type: "alley", alley })} />
            {gangRing.length > 0 && <AlleyBlock squares={gangRing} />}
            {enc && enc.kind !== "robbery" && (
              <Wanderer
                key={`${enc.id}|person`}
                id={enc.id}
                start={enc.phase === "approach" ? encounterSpawn() : nearestOpen(outdoors, { x: squareOf(leadFeet.current).x + 1, y: squareOf(leadFeet.current).y + 1 })}
                goal={() => squareOf(leadFeet.current)}
                stop={enc.phase === "follow" ? 1.9 : 1.6}
                speed={enc.phase === "follow" ? 6.2 : 3.6}
                warp={enc.phase === "follow"}
                open={outdoors}
                at={folkAt}
                onArrive={enc.phase === "approach" && !leader ? () => onAct?.({ type: "encounter", step: "met" }) : undefined}
              >
                <Figure kind="person" ring={SIDE_COLORS.friendly} name={enc.person} />
                <Label at={[0, 1.7, 0]} size={0.28} color="#facc15">{enc.person}</Label>
              </Wanderer>
            )}
            {enc && enc.kind === "help" && enc.phase === "follow" && enc.target && street.doors[enc.target] && (
              <Delivery key={`${enc.id}|delivery`} id={enc.id} at={folkAt} feet={feet} door={street.doors[enc.target].door} onDeliver={() => onAct?.({ type: "encounter", step: "delivered" })} />
            )}
            {enc?.kind === "robbery" && enc.alley && enc.gang?.map((o, i) => {
              const alley = enc.alley!;
              const surround = () => gangSpotsNow(alley, enc.gang!.length)[i] ?? null;
              return (
                <Wanderer
                  key={o.id}
                  id={o.id}
                  start={enc.phase === "surround" ? surround() ?? gangStarts(alley, enc.gang!.length)[i] : gangStarts(alley, enc.gang!.length)[i]}
                  goal={surround}
                  stop={0.35}
                  speed={4.4}
                  open={outdoors}
                  at={folkAt}
                  onArrive={i === 0 ? () => onAct?.({ type: "encounter", step: "surrounded" }) : undefined}
                >
                  <Figure kind={tokenOf(o)} ring={SIDE_COLORS.hostile} name={o.name} role={o.role} creature={o.creature} size={o.size} />
                  <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS.hostile}>{o.name}</Label>
                  {tappable && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "encounter", step: "talk" })} label="Stranger" />}
                </Wanderer>
              );
            })}
            {!duel && <Strollers strolls={strolls} scene={streetScene} news={newsOf(world, building.id)} talkers={(a, b) => talkersOf(world, a, b)} party={() => (outside ? feet.current : null)} />}
            {street.rigs.map(({ v, mine, outward, x, y }) => (
              <group key={v.id} position={[x + 0.5, 0, y + 0.5]} rotation={[0, Math.atan2(outward.x || 0.0001, outward.y || 0.0001), 0]}>
                <SpeederModel model={v.model} wrecked={v.status === "wrecked"} look={v.look} name={v.name} seats={v.seats} />
                <Label at={[0, 1.5, 0]} size={0.26} color={mine ? SIDE_COLORS.player : SIDE_COLORS.neutral}>{`${v.name}${v.status === "wrecked" ? " (wreck)" : ""}`}</Label>
                {tappable && <Hit at={[0, 0.5, 0]} size={[1.6, 1.2, 2.4]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "vehicle", id: v.id }))} label={v.name} />}
              </group>
            ))}
            {boats.filter((b) => b.v.id !== afloatBoat?.v.id).map((b) => (
              <group key={b.v.id} position={[b.x + 0.5, (water === "under" ? UNDER_SWIM_Y : SEA_Y) + BOAT_FLOAT, b.y + 0.5]} rotation={[0, b.face, 0]}>
                <SpeederModel model={b.v.model} wrecked={b.v.status === "wrecked"} look={b.v.look} name={b.v.name} seats={b.v.seats} />
                <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS.player}>{`${b.v.name}${b.v.status === "wrecked" ? " (wreck)" : ""}`}</Label>
                {tappable && <Hit at={[0, 0.5, 0]} size={[1.6, 1.2, 2.4]} onTap={() => walkTo(around(b.x, b.y), () => onAct?.({ type: "vehicle", id: b.v.id }))} label={b.v.name} />}
              </group>
            ))}
            {street.caches.map(({ cache, x, y }) => (
              <group key={cache.id} position={[x, 0, y]}>
                {cache.node ? <NodeModel node={cache.node} empty={nodeAt(cache.node, minutes).charges === 0} /> : <Chest looted={cache.looted} />}
                {tappable && <Hit at={[0.5, 0.4, 0.5]} size={[1, 0.8, 1]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "loot", id: cache.id }))} label="Cache" />}
              </group>
            ))}
            {buildings.map((b) => {
              const box = districtPlan?.boxes[b.id] ?? plan!;
              return <Label key={`name-${b.id}`} at={[box.x + box.width / 2, 4.6, box.y + box.height / 2]} size={0.8}>{b.name}</Label>;
            })}
          </>
        )}

        {present && <CoopPeers hereId={hereId} open={open} height={heightNow} water={inside ? null : water} />}
        {duel && <DuelPieces />}
        {present && !duel && (
          <group ref={token} position={[standing.x + 0.5, 0, standing.y + 0.5]}>
            {/* In the saddle: the beast under the character, who sits on its back */}
            {ridden && <Figure kind="beast" ring={SIDE_COLORS.player} name={ridden.name} large={isLarge(ridden.size)} creature={ridden.creature} size={ridden.size} />}
            {/* At the helm of a water craft: the craft under the character, who sits in its pilot's seat, the followers who fit in the others */}
            {afloatBoat && !ridden && (
              <group position={[0, BOAT_FLOAT, 0]}>
                <SpeederModel model={afloatBoat.v.model} look={afloatBoat.v.look} name={afloatBoat.v.name} seats={afloatBoat.v.seats} crew={[{ kind: "player", player: true, ring: SIDE_COLORS.player }, ...aboard.map(crewOf)]} />
                <mesh position={[0, 1.9, 0]} raycast={() => null}><octahedronGeometry args={[0.12]} /><meshBasicMaterial color="#facc15" /></mesh>
              </group>
            )}
            {/* the rider's seat (not the feet) on the beast's back: a figure's hips are RIDER_HIPS over its feet */}
            <group position={[0, ridden ? seatFor(ridden.name, ridden.creature, ridden.size) * (isLarge(ridden.size) ? 1.5 : 1) - RIDER_HIPS : 0, 0]} visible={!afloatBoat || !!ridden}>
              <MotionContext.Provider value={partyMotion}>
                <Figure kind="player" ring={SIDE_COLORS.player} marker riding={!!ridden} seat={partySeat} unarmed={!!table} wield={shootWield} />
              </MotionContext.Provider>
            </group>
            <HandledCarts carts={cartsOf("me")} biome={biome} reach={ridden && isLarge(ridden.size) ? 1.7 : 1.05} onTap={active ? (id) => onAct?.({ type: "cart", id }) : undefined} />
            {/* A hook's line, held in the hands up to the hook on the edge, and a jetpack's flame at the back (only while a way up or down is made) */}
            <group ref={rope} visible={false} position={[0, 1.05, 0.2]} raycast={() => null}>
              <mesh position={[0, 0.5, 0]} raycast={() => null}><cylinderGeometry args={[0.012, 0.012, 1, 5]} /><meshBasicMaterial color="#d8d2c0" /></mesh>
            </group>
            <mesh ref={hook} visible={false} raycast={() => null}><boxGeometry args={[0.16, 0.06, 0.1]} /><meshBasicMaterial color="#6b7280" /></mesh>
            <mesh ref={flame} visible={false} position={[0, 0.55, -0.18]} rotation={[Math.PI, 0, 0]} raycast={() => null}><coneGeometry args={[0.09, 0.45, 8]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
          </group>
        )}
        {/* The hook fired in the air: its line from the hand, and the hook where it bit */}
        {present && !duel && (
          <group ref={shotG} visible={false}>
            <mesh ref={shotRope} raycast={() => null}><cylinderGeometry args={[0.014, 0.014, 1, 5]} /><meshBasicMaterial color="#d8d2c0" /></mesh>
            <mesh ref={shotHook} raycast={() => null}><boxGeometry args={[0.18, 0.08, 0.12]} /><meshBasicMaterial color="#9ca3af" /></mesh>
          </group>
        )}
        {present && !duel && followers.filter((c) => !aboard.includes(c)).map((c, i) => (
          <Follower key={`${hereId}:${c.id}`} companion={c} index={i} feet={feet} open={open} height={heightNow} onTap={active ? () => onAct?.({ type: "companion", id: c.id }) : undefined} carts={cartsOf(c.id)} biome={biome} onCart={active ? (id) => onAct?.({ type: "cart", id }) : undefined} swimming={() => swimNow() && !afloatRef.current} />
        ))}
        {/* The party's carts left here */}
        {present && !duel && carts.filter((c) => c.parked && (inside ? c.parked.areaId === inside.id : buildingIds.has(c.parked.areaId))).map((c) => (
          <group key={c.id} position={[c.parked!.x + 0.5, pieceFloor({ x: c.parked!.x, y: c.parked!.y, w: 1, h: 1 }), c.parked!.y + 0.5]}>
            <CartModel full={Math.min(1, c.pack.length / 8)} biome={biome} />
            <Label at={[0, 1.2, 0]} size={0.22} color="#fde68a">{c.name}</Label>
            {active && !placing && <Hit at={[0, 0.5, 0]} size={[0.9, 1, 1.3]} onTap={() => walkTo(around(c.parked!.x, c.parked!.y), () => onAct?.({ type: "cart", id: c.id }))} label={c.name} />}
          </group>
        ))}
        {/* The party's base: what it has set down here (shared/logic bases.ts), tapped to be opened */}
        {present && !duel && piecesHere.map(({ piece }) => {
          const [sx, sy] = piece.face % 2 ? [piece.h, piece.w] : [piece.w, piece.h];
          return (
            <group key={piece.id} position={[piece.x, pieceFloor(piece), piece.y]}>
              <BasePieceModel look={piece.look} biome={biome} w={piece.w} h={piece.h} face={piece.face} />
              <Label at={[sx / 2, piece.role === "shelter" ? 1.7 : 1.0, sy / 2]} size={0.22} color="#fde68a">{piece.name}</Label>
              {active && !placing && <Hit at={[sx / 2, 0.5, sy / 2]} size={[sx, 1, sy]} onTap={() => walkTo(around(piece.x, piece.y, sx, sy), () => onAct?.({ type: "piece", id: piece.id }))} label={piece.name} />}
            </group>
          );
        })}
        {present && !duel && placing && ghostSpot() && (
          <group position={[ghostSpot()!.x, inside?.layout ? floorAt(inside.layout, ghostSpot()!.x - inside.layout.x + 0.5, ghostSpot()!.y - inside.layout.y + 0.5) : 0, ghostSpot()!.y]}>
            <BasePieceModel look={placing.look} biome={biome} w={placing.w} h={placing.h} face={placingFace} ghost />
          </group>
        )}
      </group>

      <Probe
        locate={(key) => {
          const [what, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
          // In a fight: the fighters, and the squares of the streets, roofs and catwalks by their height
          if (duelRef.current || (duel && key.startsWith("sq:"))) {
            const fighters = useCombat.getState().combatants;
            const fighter = key === "me" ? fighters.find((c) => c.isPlayer) : key.startsWith("foe:") ? fighters.filter((c) => !onPartySide(c) && c.hp > 0)[Number(id) || 0] : undefined;
            if (fighter) return [(fighter.x ?? 0) + 0.5 - cx, (fighter.z ?? 0) * LEVEL_H + 0.6, (fighter.y ?? 0) + 0.5 - cz];
            const piece = what === "asset" ? useCombat.getState().arena.assets.find((a) => a.id === id) : undefined;
            if (piece) return [piece.x + piece.w / 2 - cx, (piece.z ?? 0) * LEVEL_H + 0.5, piece.y + piece.h / 2 - cz];
            if (what === "sq") {
              const [qx, qy, qz = 0] = id.split(",").map(Number);
              return [qx + 0.5 - cx, qz * LEVEL_H + 0.05, qy + 0.5 - cz];
            }
          }
          if (key === "me") return [feet.current.x + 0.5 - cx, heightNow() + 0.6, feet.current.y + 0.5 - cz];
          if (what === "sq") {
            const [qx, qy] = id.split(",").map(Number);
            const l = inside?.layout;
            return [qx + 0.5 - cx, levelY(l) + (l ? rampAt(l, qx - l.x + 0.5, qy - l.y + 0.5) : 0), qy + 0.5 - cz];
          }
          if (what === "sign") {
            const sign = street.signs.find((s) => s.exit.to === id);
            return sign && [sign.x + 0.5 - cx, 0.8, sign.y + 0.5 - cz];
          }
          if (what === "vehicle") {
            const rig = street.rigs.find((r) => r.v.id === id);
            return rig && [rig.x + 0.5 - cx, 0.6, rig.y + 0.5 - cz];
          }
          // Something in a wall or on a floor, by the kind of thing it is or by what it stands for
          for (const room of rooms) {
            const l = room.layout;
            const a = l?.assets.find((x) => x.id === id || (what !== "asset" && x.kind === what && (x.ref === id || x.to === id || room.id === id)));
            if (!l || !a) continue;
            const now = a.kind === "npc" ? whereNow(a.id) : undefined;
            if (now) return [l.x + now.x + 0.5 - cx, levelY(l) + 0.6, l.y + now.y + 0.5 - cz];
            const at = a.side ? onWall(l, a) : { x: a.x + a.w / 2, z: a.y + a.h / 2 };
            // (up the floor of a flight, where the thing is drawn: a door at the head of a switchback is a floor up)
            return [l.x + at.x - cx, levelY(l) + rampAt(l, a.x + 0.5, a.y + 0.5) + 0.6, l.y + at.z - cz];
          }
          return undefined;
        }}
      />
      {shootSession && <ShooterLayer key={shootSession.id} session={shootSession} ctx={shootCtx} />}
      {mode !== "overhead" && viewing ? (
        <ViewRig mode={mode} start={startYaw()} feet={() => [feet.current.x + 0.5 - cx, heightNow() + air.current.y, feet.current.y + 0.5 - cz]} facing={facing} step={stepToward} />
      ) : (
        <Rig target={focus} offset={opened ? [0, reach * 0.95, reach * 0.75] : [-reach * 0.75, reach * 0.75, reach * 0.6]} min={4} max={120} fov={45} follow={eye} />
      )}
      <Sky indoors={opened && !openAir(opened) && !formOf(opened) ? 1 : 0} look={look} ground={-0.05} fog={[150, 480]} floor={!groundTex && !water} under={water === "under" && !(opened && !openAir(opened))} />
    </>
  );
}

// Whether the character can pick a piece of the ground out for a power to move: they know a
// power that moves objects, and it is loose furniture (on a district's streets, only the crates
// set out as cover: what stands on the roofs is drawn from the world and stays put in a fight)
function usePickable(): (a: RoomAsset) => boolean {
  const mover = useCombat((state) => state.combatants.find((c) => c.isPlayer)?.powers?.some((p) => p.motion && !p.motion.rider && p.motion.objects));
  const district = useCombat((state) => !!state.arena.district);
  return (a) => !!mover && a.kind === "furniture" && !a.side && !a.height && (!district || a.id.startsWith("crate-"));
}

// The outline of a piece picked out for a power to move
function Picked({ asset, high = 0 }: { asset: RoomAsset; high?: number }) {
  const y = high + 0.06;
  const [x0, z0, x1, z1] = [asset.x - 0.05, asset.y - 0.05, asset.x + asset.w + 0.05, asset.y + asset.h + 0.05];
  return <Line points={[[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]]} color="#7dd3fc" lineWidth={3} />;
}

// ---------------------------------------------------------------------------------------------
// A fight on a district's own map (the streets, the roofs and the catwalks, all of it in sight):
// the squares the character can reach are lit at their height, everyone stands on theirs with a
// bar of hit points, and a tap on a lit square moves there and a tap on an enemy picks it out.
// ---------------------------------------------------------------------------------------------

function DuelPieces() {
  const { combatants, currentTurn, arena, targetId, moveTo, setTarget, objectId, setObject } = useCombat();
  const motionOf = useFightMotions(combatants);
  const pickable = usePickable();
  const picked = objectId ? arena.assets.find((a) => a.id === objectId) : undefined;
  const current = combatants[currentTurn];
  const player = combatants.find((c) => c.isPlayer);
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !cannotAct(player!);
  const target = player ? pickTarget(combatants, player, targetId) : undefined;
  const steps = playerTurn && player ? reachable(arena, combatants, player) : new Map<string, Step>();
  const plan = player && target ? attackPlan(arena, combatants, player, target, player.rangedDice ? "ranged" : "melee") : undefined;
  const high = (z?: number) => (z ?? 0) * LEVEL_H;
  return (
    <>
      {/* The crates set out on the street as cover, which a power can shove or hurl */}
      {arena.assets.filter((a) => a.id.startsWith("crate-")).map((a) => (
        <Glide key={a.id} x={a.x} y={a.y} z={high(a.z)}>
          <Furniture name={a.name} w={a.w} h={a.h} seed={hue(a.id)} />
          {pickable(a) && <Hit at={[a.w / 2, 0.5, a.h / 2]} size={[a.w, 1, a.h]} onTap={() => setObject(objectId === a.id ? null : a.id)} label={a.name} />}
        </Glide>
      ))}
      {picked && <Picked asset={picked} high={high(picked.z)} />}
      {Array.from(steps.entries()).filter(([, step]) => step.cost > 0).map(([k, step]) => {
        const { x, y, z } = parseKey(k);
        return (
          <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x + 0.5, high(z) + 0.05, y + 0.5]} onClick={(e) => { e.stopPropagation(); if (e.delta <= 8) moveTo(x, y, z); }}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial color={stepColor(step)} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        );
      })}
      {player && target && target.hp > 0 && (
        <Line
          points={[[(player.x ?? 0) + 0.5, high(player.z) + 1.1, (player.y ?? 0) + 0.5], [(target.x ?? 0) + 0.5, high(target.z) + 1.1, (target.y ?? 0) + 0.5]]}
          color={plan && (!plan.possible || plan.cover.blocked) ? "#6b7280" : plan?.cover.bonus ? "#fbbf24" : "#f87171"}
          lineWidth={2}
          dashed
          dashSize={0.3}
          gapSize={0.2}
        />
      )}
      {combatants.filter((c) => !c.fled).map((c) => {
        const down = c.hp <= 0;
        const large = isLarge(c.size);
        const side = c.isPlayer ? SIDE_COLORS.player : c.ally ? SIDE_COLORS.friendly : SIDE_COLORS.hostile;
        return (
          <Stepper key={String(c.id)} x={(c.x ?? 0) + 0.5} y={(c.y ?? 0) + 0.5} z={high(c.z)} pace={isDroideka(c.name) ? 1.2 : 4} turn={false}>
            <group rotation={down ? [-Math.PI / 2, 0, 0.4] : [0, c.isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]} position={[0, down ? 0.14 : swimmerIn(arena.floor, c) ? SWIM_FIGHT_Y : 0, 0]}>
              <Posture to={swimmerIn(arena.floor, c) ? 3 : !down && (c.braced || (c.conditions ?? []).some((x) => /^prone$/i.test(x.name))) ? 2 : 0} act={motionOf(c.id)}><Figure kind={tokenOf({ name: c.name, role: c.role, creature: c.creature, isPlayer: c.isPlayer, forceUser: c.role === "force" })} ring={side} name={c.name} large={large} marker={c.isPlayer && !down} species={c.species} role={c.role} creature={c.creature} size={c.size} player={!!c.isPlayer} fighting /></Posture>
            </group>
            {!down && current?.id === c.id && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}><ringGeometry args={[0.5, 0.58, 28]} /><meshBasicMaterial color="#fde047" /></mesh>}
            {!down && target?.id === c.id && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}><ringGeometry args={[0.62, 0.7, 4]} /><meshBasicMaterial color="#f87171" /></mesh>}
            {!down && (
              <Billboard position={[0, large ? 2.5 : 1.85, 0]}>
                <mesh><planeGeometry args={[0.9, 0.1]} /><meshBasicMaterial color="#111111" /></mesh>
                <mesh position={[-0.45 * (1 - Math.max(0, Math.min(1, c.hp / c.maxHp))), 0, 0.001]}><planeGeometry args={[0.9 * Math.max(0.001, Math.min(1, c.hp / c.maxHp)), 0.1]} /><meshBasicMaterial color={onPartySide(c) ? "#4ade80" : "#f87171"} /></mesh>
                <Text position={[0, 0.24, 0]} fontSize={0.24} color={side} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">{c.name}</Text>
              </Billboard>
            )}
            {!down && !onPartySide(c) && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => setTarget(c.id)} label={c.name} />}
          </Stepper>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// A fight, on the floor it is fought on: the room as planned, or open ground. Everyone stands
// on their square; on the player's turn the squares they can reach are lit, a tap on one moves
// there and a tap on an enemy picks it out.
// ---------------------------------------------------------------------------------------------

// On a wide screen the combat panel (PlayCombat: 20rem at the left, 0.5rem in) lies over the left of the map, where the party usually
// comes in: the fight is drawn centred in the part of the map beside it (a view offset, so that taps and the probe stay exact).
// 2026-10-26: taps on the character's squares landed on the panel.
const COMBAT_PANEL_PX = 336;
function BesidePanel() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    const wide = typeof window !== "undefined" && window.innerWidth >= 768 && size.width > COMBAT_PANEL_PX * 1.6;
    if (!wide) return;
    camera.setViewOffset(size.width + COMBAT_PANEL_PX, size.height, 0, 0, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
  }, [camera, size.width, size.height]);
  return null;
}

// The crowd round a bout of the pit (2026-11-02; the user: pit fighting "should take place in a physical arena"): the arena's stands, three
// rows of tiers round the fight's floor (siteAssets arena_tier_<row>), with spectators on them cheering (limbs.ts "cheer"); drawn round the
// fight's own squares, outside its walls
const STAND_ROWS = 3;
const STAND_STEP = 0.45;
// The beasts kept in an arena's pens (drawn in the cages: the pens are furniture, the beasts are not people of the room)
const PEN_BEASTS = ["Nexu", "Reek", "Acklay", "Gundark", "Rancor", "Kath hound"];
const CROWD_SPECIES = ["Human", "Twi'lek", "Rodian", "Zabrak", "Trandoshan", "Gran", "Weequay", "Duros", "Human", "Mon Calamari"];
function PitCrowd({ width, height }: { width: number; height: number }) {
  const ring = useMemo(() => {
    const out: { x: number; y: number; row: number }[] = [];
    for (let y = -STAND_ROWS - 1; y < height + STAND_ROWS + 1; y++) for (let x = -STAND_ROWS - 1; x < width + STAND_ROWS + 1; x++) {
      const out_ = Math.max(-1 - x, x - width, -1 - y, y - height);
      if (out_ >= 0 && out_ < STAND_ROWS) out.push({ x, y, row: out_ });
    }
    return out;
  }, [width, height]);
  const crowd = useMemo(() => ring.filter((_, i) => (i * 7919) % 11 < 1).slice(0, 22).map((q, i) => ({ ...q, species: CROWD_SPECIES[i % CROWD_SPECIES.length], seat: { current: { ...seatState(), stand: "cheer" as const } } })), [ring]);
  return (
    <>
      <Scatter placed={ring.map((q): Placed => ({ key: `arena_tier_${q.row}`, x: q.x + 0.5, y: q.y + 0.5, rot: 0, scale: 1, v: (q.x * 7 + q.y * 3 + 30) % 3 }))} biome="desert" />
      {crowd.map((q, i) => (
        <group key={i} position={[q.x + 0.5, (q.row + 1) * STAND_STEP, q.y + 0.5]} rotation={[0, Math.atan2(width / 2 - (q.x + 0.5), height / 2 - (q.y + 0.5)), 0]}>
          <Figure kind={tokenOf({ name: "Spectator", role: "spectator" })} ring="#6b7280" species={q.species} role="spectator" seat={q.seat} />
        </group>
      ))}
    </>
  );
}

// In a fight on open water (2026-11-02, the user: "Party members should be drawn swimming if the environment requires it"): whoever is on foot swims, as on
// the map (a crawl when they move, treading water when they stand), low in the water; beasts and droids are drawn as they are
const SWIM_FIGHT_Y = 0.15;
const swimmerIn = (floor: string | undefined, c: { hp: number; name: string; creature?: string; role?: string }) =>
  floor === "sea" && c.hp > 0 && !/beast|droid|construct/i.test(c.creature ?? "") && !/droid|wildlife|beast/i.test(c.role ?? "") && !isDroideka(c.name);
// A bout of the arena's weekend card, fought on its floor by the clock (shared/logic/pitbets.ts; 2026-11-02, the user: "we also need NPC fights in the
// arena, these should be at regular intervals and accurately reflected in the betting options"). While the clock is within a bout's half hour its two
// fighters are in the pit: they come in from the ramps, trade blows (the blows' timing is the drawing's; who wins is the card's, the same as the
// bets are paid by), and the one who loses goes down at the end. Before and after, the floor is empty of them.
function PitBout({ arena, width, height }: { arena: string; width: number; height: number }) {
  const matches = useTalkWorld((s) => s.matches);
  const minute = useClock((c) => Math.floor(c.minutes));
  const live = matches.find((m) => m.arena === arena && matchState(m, minute) === "live");
  return live ? <PitBoutFight key={live.id} match={live} width={width} height={height} /> : null;
}
function PitBoutFight({ match, width, height }: { match: Match; width: number; height: number }) {
  const spots = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const bodies = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const motions = [useRef<Motion>(motion({ ready: true })), useRef<Motion>(motion({ ready: true }))];
  const nextSwing = useRef([0, 0]);
  const [cx, cz] = [width / 2, height / 2];
  const fighters = [match.a, match.b];
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const now = nowSeconds();
    const p = Math.max(0, Math.min(1, (minuteNow() - match.start) / BOUT_LENGTH));
    for (const i of [0, 1]) {
      const side = i === 0 ? -1 : 1;
      const g = spots[i].current;
      const body = bodies[i].current;
      if (!g || !body) continue;
      const lost = i !== match.winner;
      // In from the ramp at its end of the floor, then circling and lunging at the other
      const entry = Math.min(1, p / 0.1);
      const lunge = Math.max(0, Math.sin(t * 2.3 + i * 1.7)) * 0.35;
      const reach = 1.3 + 0.3 * Math.sin(t * 1.3 + i * 2) - (lost && p > 0.6 ? (p - 0.6) * 0.8 : 0);
      const x = cx + side * (width / 2 - 1 - entry * (width / 2 - 1 - reach)) - side * lunge * (p > 0.1 ? 1 : 0);
      const z = cz + (p > 0.1 ? 0.55 * Math.sin(t * 0.8 + i * 3.1) : 0);
      g.position.set(x, 0.1, z);
      g.rotation.y = Math.atan2(-side, 0);
      // The one who loses goes down at the end, the other stands over them
      const down = lost ? Math.max(0, Math.min(1, (p - 0.86) / 0.06)) : 0;
      body.rotation.x = -Math.PI / 2 * down;
      body.position.y = 0.14 * down;
      const m = motions[i].current;
      m.ready = true;
      if (p > 0.1 && p < 0.88 && t >= nextSwing.current[i]) {
        // (the winner lands the more blows)
        nextSwing.current[i] = t + 0.9 + ((Math.sin(t * 91.7 + i * 13.3) + 1) / 2) * (lost ? 1.3 : 0.8);
        m.swingAt = now;
        m.swing++;
        motions[1 - i].current.hitAt = now + 0.2;
      }
    }
  });
  return (
    <>
      {fighters.map((f, i) => (
        <group key={i} ref={spots[i]} position={[cx + (i === 0 ? -1 : 1) * (width / 2 - 1), 0.1, cz]}>
          <group ref={bodies[i]}>
            <MotionContext.Provider value={motions[i]}>
              <Figure kind={tokenOf({ name: f.stock, role: f.kind === "beast" ? "wildlife" : "pit fighter", creature: f.kind === "beast" ? "beast" : "humanoid" })} ring={i === 0 ? "#60a5fa" : "#f87171"} name={f.stock} />
            </MotionContext.Provider>
          </group>
          <Label at={[0, 2.1 + i * 0.32, 0]} size={0.28} color={i === 0 ? "#93c5fd" : "#fca5a5"}>{f.name}</Label>
        </group>
      ))}
    </>
  );
}

export function FightScene({ wall = STEEL, areaId, origin, crowd }: { wall?: string; areaId?: string | null; origin?: { x: number; y: number }; crowd?: boolean }) {
  const { combatants, currentTurn, arena, targetId, moveTo, setTarget, objectId, setObject } = useCombat();
  const motionOf = useFightMotions(combatants);
  const pickable = usePickable();
  const picked = objectId ? arena.assets.find((a) => a.id === objectId) : undefined;
  const current = combatants[currentTurn];
  const player = combatants.find((c) => c.isPlayer);
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !cannotAct(player!);
  const target = player ? pickTarget(combatants, player, targetId) : undefined;
  const steps = playerTurn && player ? reachable(arena, combatants, player) : new Map<string, Step>();
  const covered = player && target && player.rangedDice ? attackPlan(arena, combatants, player, target, "ranged").cover.bonus > 0 : false;
  const cx = arena.width / 2;
  const lite = useQuality((q) => q.tier === "lite");
  const cz = arena.height / 2;
  const reach = Math.max(arena.width, arena.height) * 1.1 + 6;
  // Over the shoulder or from the eyes of the party's character (interiors/ViewRig.tsx): the fight is still taken a turn at a time, the
  // camera only stands where they stand and looks where it is turned; the crosshair picks out a foe as a tap does and says what the rules
  // say of it (`attackPlan`: reach, range, cover)
  const mode = useView((v) => v.mode);
  const viewing = mode !== "overhead" && !!player && player.hp > 0;
  const facing = useRef<number | null>(null);
  const aimPlan = (c: Combatant) => (): AimPlan => {
    if (!player) return { ok: false, text: "" };
    const p = attackPlan(arena, combatants, player, c, player.rangedDice ? "ranged" : "melee");
    const feet = squaresApart(player, c) * 5;
    if (!p.possible) return { ok: false, text: p.why, feet };
    return { ok: true, text: [p.cover.bonus > 0 ? `${p.cover.name} cover` : "clear", p.down ? "disadvantage" : p.up ? "advantage" : ""].filter(Boolean).join(", "), feet };
  };

  // Where the fight leaves the party is where they stand afterwards
  useEffect(() => {
    if (areaId && origin && player) usePartySpot.getState().stand(areaId, origin.x + (player.x ?? 0), origin.y + (player.y ?? 0));
  }, [player?.x, player?.y, areaId]);

  const tapSquare = (x: number, y: number, z = 0) => {
    const there = combatants.find((c) => c.hp > 0 && c.x === x && c.y === y && (c.z ?? 0) === z);
    if (there && !onPartySide(there)) setTarget(there.id);
    else if (playerTurn && steps.get(z ? `${x},${y},${z}` : `${x},${y}`)?.cost) moveTo(x, y, z);
  };

  return (
    <>
      <color attach="background" args={["#05070c"]} />
      <group position={[-cx, 0, -cz]}>
        {crowd && <PitCrowd width={arena.width} height={arena.height} />}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.22, cz]}>
          <planeGeometry args={[240, 240]} />
          <meshBasicMaterial color="#0b0f16" />
        </mesh>
        {/* A fight at sea (an ambush on the water): knee-deep water over a sandbar, out to the horizon; a tap on it is a tap on the square under it */}
        {arena.floor === "sea" && <Sea at={[arena.width / 2, 0.32, arena.height / 2]} size={Math.max(arena.width, arena.height) + 260} lite={lite} onTap={(e) => { e.stopPropagation(); if (e.delta <= 8) tapSquare(Math.floor(e.point.x + cx), Math.floor(e.point.z + cz)); }} />}
        <RoomShell fullWalls={viewing} ceiling={viewing && !arena.open} width={arena.width} height={arena.height} assets={arena.assets.filter((a) => a.kind !== "npc")} floor={floorOf(arena.floor)} wall={wall} walls={!arena.open} onFloor={tapSquare} onAsset={(a) => !a.side && (pickable(a) ? setObject(objectId === a.id ? null : a.id) : tapSquare(a.x, a.y))}>
          {picked && <Picked asset={picked} high={(picked.z ?? 0) * LEVEL_H} />}
          {/* Raised floors: a gallery over part of the room */}
          {(arena.platforms ?? []).map((p, i) => (
            <group key={`platform-${i}`} position={[p.x, p.z * LEVEL_H, p.y]}>
              <mesh
                position={[p.width / 2, 0.06, p.height / 2]}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.delta > 8) return;
                  const at = e.object.worldToLocal(e.point.clone());
                  tapSquare(p.x + Math.max(0, Math.min(p.width - 1, Math.floor(at.x + p.width / 2))), p.y + Math.max(0, Math.min(p.height - 1, Math.floor(at.z + p.height / 2))), p.z);
                }}
              >
                <boxGeometry args={[p.width, 0.12, p.height]} />
                <meshLambertMaterial color="#59636d" />
              </mesh>
              <Box at={[p.width / 2, 0.45, p.height - 0.04]} size={[p.width, 0.04, 0.05]} color="#c8ccd2" />
              <Box at={[0.04, 0.45, p.height / 2]} size={[0.05, 0.04, p.height]} color="#c8ccd2" />
              <Box at={[p.width - 0.04, 0.45, p.height / 2]} size={[0.05, 0.04, p.height]} color="#c8ccd2" />
            </group>
          ))}
          {Array.from(steps.entries()).filter(([, step]) => step.cost > 0).map(([k, step]) => {
            const { x, y, z } = parseKey(k);
            return (
              <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x + 0.5, z * LEVEL_H + 0.1, y + 0.5]}>
                <planeGeometry args={[0.9, 0.9]} />
                <meshBasicMaterial color={stepColor(step)} transparent opacity={0.28} depthWrite={false} />
              </mesh>
            );
          })}
          {player && target && target.hp > 0 && (
            <Line points={[[(player.x ?? 0) + 0.5, (player.z ?? 0) * LEVEL_H + 0.9, (player.y ?? 0) + 0.5], [(target.x ?? 0) + 0.5, (target.z ?? 0) * LEVEL_H + 0.9, (target.y ?? 0) + 0.5]]} color={covered ? "#fbbf24" : "#f87171"} lineWidth={2} dashed dashSize={0.3} gapSize={0.2} />
          )}
          {combatants.filter((c) => !c.fled).map((c) => {
            const down = c.hp <= 0;
            const large = isLarge(c.size);
            const side = c.isPlayer ? SIDE_COLORS.player : c.ally ? SIDE_COLORS.friendly : SIDE_COLORS.hostile;
            return (
              <Stepper key={String(c.id)} x={(c.x ?? 0) + 0.5} y={(c.y ?? 0) + 0.5} z={(c.z ?? 0) * LEVEL_H + ((c.z ?? 0) ? 0.12 : 0)} pace={isDroideka(c.name) ? 1.2 : 4} turn={false}>
                {/* The fallen lie where they fell */}
                <group rotation={down ? [-Math.PI / 2, 0, 0.4] : [0, c.isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]} position={[0, down ? 0.14 : swimmerIn(arena.floor, c) ? SWIM_FIGHT_Y : 0, 0]}>
                  <Turner facing={facing} on={viewing && !!c.isPlayer && !down} base={Math.PI / 2} hide={viewing && mode === "first" && !!c.isPlayer}>
                  <Posture to={swimmerIn(arena.floor, c) ? 3 : !down && (c.braced || (c.conditions ?? []).some((x) => /^prone$/i.test(x.name))) ? 2 : 0} act={motionOf(c.id)}><Figure kind={tokenOf({ name: c.name, role: c.role, creature: c.creature, isPlayer: c.isPlayer, forceUser: c.role === "force" })} ring={side} name={c.name} large={large} marker={c.isPlayer && !down} species={c.species} role={c.role} creature={c.creature} size={c.size} player={!!c.isPlayer} fighting /></Posture>
                  </Turner>
                </group>
                {!down && current?.id === c.id && (
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}><ringGeometry args={[0.5, 0.58, 28]} /><meshBasicMaterial color="#fde047" /></mesh>
                )}
                {!down && target?.id === c.id && (
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><ringGeometry args={[0.62, 0.7, 4]} /><meshBasicMaterial color="#f87171" /></mesh>
                )}
                {!down && (
                  <Billboard position={[0, large ? 2.5 : 1.85, 0]}>
                    <mesh><planeGeometry args={[0.9, 0.1]} /><meshBasicMaterial color="#111111" /></mesh>
                    <mesh position={[-0.45 * (1 - Math.max(0, Math.min(1, c.hp / c.maxHp))), 0, 0.001]}><planeGeometry args={[0.9 * Math.max(0.001, Math.min(1, c.hp / c.maxHp)), 0.1]} /><meshBasicMaterial color={onPartySide(c) ? "#4ade80" : "#f87171"} /></mesh>
                    <Text position={[0, 0.24, 0]} fontSize={0.24} color={side} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">{c.name}</Text>
                  </Billboard>
                )}
                {!down && !onPartySide(c) && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => setTarget(c.id)} label={c.name} plan={aimPlan(c)} />}
              </Stepper>
            );
          })}
        </RoomShell>
      </group>
      <Probe
        locate={(key) => {
          const [x, y] = key.slice(key.indexOf(":") + 1).split(",").map(Number);
          const who = key === "me" ? player : key.startsWith("foe:") ? combatants.filter((c) => !onPartySide(c) && c.hp > 0)[x || 0] : undefined;
          if (who) return [(who.x ?? 0) + 0.5 - cx, 0.6, (who.y ?? 0) + 0.5 - cz];
          // The square dx, dy over from the character's ("me+1,0"), wherever the camera has put the squares
          if (key.startsWith("me+") && player) {
            const [dx, dy] = key.slice(3).split(",").map(Number);
            return [(player.x ?? 0) + dx + 0.5 - cx, 0.05, (player.y ?? 0) + dy + 0.5 - cz];
          }
          // A piece of the ground (to pick it out for a power that moves things)
          const piece = key.startsWith("asset:") ? arena.assets.find((a) => a.id === key.slice(6)) : undefined;
          if (piece) return [piece.x + piece.w / 2 - cx, (piece.z ?? 0) * LEVEL_H + 0.5, piece.y + piece.h / 2 - cz];
          return key.startsWith("sq:") ? [x + 0.5 - cx, 0, y + 0.5 - cz] : undefined;
        }}
      />
      {viewing && player ? (
        <ViewRig mode={mode} start={Math.PI / 2} feet={() => [(player.x ?? 0) + 0.5 - cx, (player.z ?? 0) * LEVEL_H + ((player.z ?? 0) ? 0.12 : 0), (player.y ?? 0) + 0.5 - cz]} facing={facing} step={() => {}} />
      ) : (
        <>
          <Rig target={[0, 0, 0]} offset={[0, reach * 0.95, reach * 0.75]} min={4} max={90} fov={45} />
          <BesidePanel />
        </>
      )}
      <ambientLight intensity={0.75} />
      <directionalLight position={[10, 26, 12]} intensity={0.9} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// A fight between starships, in open space: a grid of 50-foot squares (shared/logic "Starship
// combat"), the ships on it facing the way they fly, the squares the party's ship can fly to lit
// on its turn, and the forward arc its fixed guns cover. A tap on a lit square flies there, a tap
// on an enemy picks it out.
// ---------------------------------------------------------------------------------------------

const SHIP_FOOTPRINT: Record<string, [number, number]> = { Tiny: [0.9, 0.6], Small: [1.3, 0.9], Medium: [2.1, 1.4], Large: [3.2, 1.9], Huge: [4.4, 2.6], Gargantuan: [6, 3.4] };

export function SpaceScene() {
  const { fight, partyShipId, targetId, move, setTarget } = useShipFight();
  if (!fight) return null;
  const me = fight.ships.find((s) => s.id === partyShipId);
  const current = fight.ships[fight.turn];
  const myTurn = !!me && current?.id === me.id && !me.disabled && !me.destroyed && !fight.outcome;
  const steps = myTurn && me ? shipReach(fight, me.id) : new Map<string, { cost: number }>();
  const cx = fight.width / 2;
  const cz = fight.height / 2;
  const reach = Math.max(fight.width, fight.height) * 0.9 + 4;
  const target = fight.ships.find((s) => s.id === targetId && !s.destroyed && !s.fled);
  const at = (x: number, y: number): V3 => [x + 0.5 - cx, 0, y + 0.5 - cz];
  const arc = me ? SHIP_FACINGS[me.facing] : null;

  const tapSquare = (x: number, y: number) => {
    const there = fight.ships.find((s) => !s.destroyed && !s.fled && s.x === x && s.y === y);
    if (there && there.side === "foe") setTarget(there.id);
    else if (myTurn && steps.get(`${x},${y}`)?.cost) move(x, y);
  };

  return (
    <>
      <color attach="background" args={["#03050a"]} />
      <Stars radius={90} depth={40} count={1400} factor={4} saturation={0} fade speed={0} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} onClick={(e) => {
        e.stopPropagation();
        if (e.delta > 8) return;
        tapSquare(Math.floor(e.point.x + cx), Math.floor(e.point.z + cz));
      }}>
        <planeGeometry args={[fight.width, fight.height]} />
        <meshBasicMaterial color="#080d18" transparent opacity={0.9} />
      </mesh>
      <gridHelper args={[Math.max(fight.width, fight.height), Math.max(fight.width, fight.height), "#1d2a44", "#121a2c"]} position={[0, 0, 0]} />
      {fight.hazards.map((h, i) => (
        <group key={i} position={at(h.x, h.y)}>
          <mesh position={[0, 0.35, 0]}><dodecahedronGeometry args={[0.42, 0]} /><meshLambertMaterial color="#6f6a63" /></mesh>
        </group>
      ))}
      {Array.from(steps.entries()).filter(([, v]) => v.cost > 0).map(([k]) => {
        const [x, y] = k.split(",").map(Number);
        return (
          <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x + 0.5 - cx, 0.02, y + 0.5 - cz]}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        );
      })}
      {me && target && !me.destroyed && (
        <Line points={[[me.x + 0.5 - cx, 0.6, me.y + 0.5 - cz], [target.x + 0.5 - cx, 0.6, target.y + 0.5 - cz]]} color="#f87171" lineWidth={1.5} dashed dashSize={0.4} gapSize={0.3} />
      )}
      {me && arc && !me.destroyed && myTurn && (
        <mesh position={[me.x + 0.5 - cx, 0.03, me.y + 0.5 - cz]} rotation={[-Math.PI / 2, 0, Math.atan2(arc[1], arc[0])]}>
          <circleGeometry args={[10, 12, -Math.PI / 4, Math.PI / 2]} />
          <meshBasicMaterial color="#fde047" transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {fight.ships.map((s) => {
        if (s.fled) return null;
        const [w, h] = SHIP_FOOTPRINT[s.sheet.size] ?? [1.3, 0.9];
        const [dx, dz] = SHIP_FACINGS[s.facing];
        const hullShare = Math.max(0, Math.min(1, s.hull / s.sheet.hullMax));
        const shieldShare = s.sheet.shieldMax ? Math.max(0, Math.min(1, s.shield / s.sheet.shieldMax)) : 0;
        const side = s.side === "party" ? SIDE_COLORS.player : SIDE_COLORS.hostile;
        return (
          <group key={s.id} position={at(s.x, s.y)}>
            {!s.destroyed && (
              <group rotation={[0, -Math.atan2(dz, dx), 0]}>
                <group position={[-w / 2, 0.1, -h / 2]}>
                  <ShipModel ship={{ size: s.sheet.size, role: s.sheet.role, status: s.disabled ? "wrecked" : "orbiting" }} w={w} h={h} />
                </group>
              </group>
            )}
            {s.destroyed && <mesh position={[0, 0.3, 0]}><dodecahedronGeometry args={[0.35, 0]} /><meshLambertMaterial color="#3b3835" emissive="#7c2d12" emissiveIntensity={0.6} /></mesh>}
            {!s.destroyed && current?.id === s.id && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}><ringGeometry args={[Math.max(w, h) * 0.55, Math.max(w, h) * 0.55 + 0.08, 32]} /><meshBasicMaterial color="#fde047" /></mesh>}
            {!s.destroyed && targetId === s.id && s.side === "foe" && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><ringGeometry args={[Math.max(w, h) * 0.62, Math.max(w, h) * 0.62 + 0.08, 4]} /><meshBasicMaterial color="#f87171" /></mesh>}
            {!s.destroyed && (
              <Billboard position={[0, 1.6 + h * 0.4, 0]}>
                <mesh><planeGeometry args={[1.2, 0.1]} /><meshBasicMaterial color="#111111" /></mesh>
                <mesh position={[-0.6 * (1 - Math.max(0.001, hullShare)), 0, 0.001]}><planeGeometry args={[1.2 * Math.max(0.001, hullShare), 0.1]} /><meshBasicMaterial color={s.side === "party" ? "#4ade80" : "#f87171"} /></mesh>
                {s.sheet.shieldMax > 0 && (
                  <>
                    <mesh position={[0, -0.13, 0]}><planeGeometry args={[1.2, 0.07]} /><meshBasicMaterial color="#111111" /></mesh>
                    <mesh position={[-0.6 * (1 - Math.max(0.001, shieldShare)), -0.13, 0.001]}><planeGeometry args={[1.2 * Math.max(0.001, shieldShare), 0.07]} /><meshBasicMaterial color="#38bdf8" /></mesh>
                  </>
                )}
                <Text position={[0, 0.25, 0]} fontSize={0.26} color={side} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">{s.name}</Text>
              </Billboard>
            )}
            {!s.destroyed && s.side === "foe" && <Hit at={[0, 0.6, 0]} size={[Math.max(w, 1.2), 1.4, Math.max(h, 1.2)]} onTap={() => setTarget(s.id)} label={s.name} />}
          </group>
        );
      })}
      <Probe
        locate={(key) => {
          if (key === "me" && me) return [me.x + 0.5 - cx, 0.4, me.y + 0.5 - cz];
          if (key.startsWith("foe:")) {
            const foes = fight.ships.filter((s) => s.side === "foe" && !s.destroyed);
            const who = foes[Number(key.slice(4)) || 0];
            return who ? [who.x + 0.5 - cx, 0.4, who.y + 0.5 - cz] : undefined;
          }
          if (key.startsWith("sq:")) {
            const [x, y] = key.slice(3).split(",").map(Number);
            return [x + 0.5 - cx, 0, y + 0.5 - cz];
          }
          return undefined;
        }}
      />
      <Rig target={[-fight.width * 0.1, 0, 0]} offset={[0, reach * 1.1, reach * 0.62]} min={5} max={110} fov={45} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 26, 12]} intensity={0.9} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// A place seen from above with the places in it: the planets of a system round their star, the
// settlements and wild sites on a planet's globe, the buildings of a settlement along its
// streets. A tap picks a place out; a double tap opens it.
// ---------------------------------------------------------------------------------------------

const BIOME_COLOR: Record<string, string> = { desert: "#d9a55b", ice: "#dfeef5", forest: "#3f8a4a", jungle: "#2f7a3d", swamp: "#5f7048", ocean: "#2f72c4", volcanic: "#b3402e", urban: "#9aa3b5", temperate: "#5fa56a", barren: "#8e867c", "gas giant": "#d8a36a" };
const STAR_COLOR: Record<string, string> = { O: "#9bb0ff", B: "#aabfff", A: "#cad7ff", F: "#f8f7ff", G: "#fff4a3", K: "#ffd2a1", M: "#ffa07a" };
const PARTY_AT: Record<string, string> = { system: "At the jump point", planet: "In orbit", settlement: "On the outskirts" };
const GLOBE = 60;
const UP = new THREE.Vector3(0, 1, 0);

function WorldLayer({ world, view, hereId, selectedId, onAct }: { world: World; view: Area; hereId: string; selectedId?: string | null; onAct?: (action: MapAction) => void }) {
  const tap = useTaps(onAct);
  // (the buildings that belong to a site are on its local map, not on the settlement's)
  const places = childrenOf(world, view.id).filter((a) => !isSatellite(a));
  const ids = new Set(places.map((a) => a.id));
  const paths = world.paths.filter((p) => ids.has(p.from) && ids.has(p.to) && !p.hidden);
  const partyTrail = new Set(trailOf(world, hereId).flatMap((a) => [a.id, ...a.tags.filter((t) => t.startsWith("site:")).map((t) => t.slice(5))]));
  const trail = trailOf(world, view.id);
  const biome = trail.find((a) => a.kind === "planet")?.type ?? "";
  const wall = trail.some((a) => a.type === "station") ? STEEL : WALLS[biome] ?? "#b9ad96";
  const system = view.kind === "system";
  const globe = view.kind === "planet";
  // The open ground of a settlement: a textured plane where the world has one (siteAssets groundTexture)
  const groundTex = groundTexture(biome, "", GROUND[biome] ?? "#0b1220");
  // (a town of an ocean world stands on the sea or under it: its overview is open water, 2026-10-30)
  const seaView = view.kind === "settlement" && !!waterOf(world, view.id);
  const liteSea = useQuality((q) => q.tier === "lite");

  // Fit the places into the view, whatever scale they were generated at. Planets keep their
  // orbits round the star in the middle; a planet's sites lie on the top of its globe.
  const xs = places.map((a) => a.position.x);
  const zs = places.map((a) => a.position.z);
  const centre = system || !places.length ? { x: 0, z: 0 } : { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  const extent = system ? 2 * Math.max(1, ...places.map((a) => Math.hypot(a.position.x, a.position.z))) : Math.max(1, Math.max(...xs, 0) - Math.min(...xs, 0), Math.max(...zs, 0) - Math.min(...zs, 0));
  // The buildings of a settlement are spread until the two nearest stand clear of each other
  const nearest = Math.min(...places.flatMap((a, i) => places.slice(i + 1).map((b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z))), Infinity);
  const scale = system ? Math.min(3, 46 / extent) : globe ? Math.min(4, 40 / extent) : Math.min(6, Math.max(50 / extent, Math.min(11 / Math.max(nearest, 0.1), 120 / extent)));
  const span = Math.max(1, (extent * scale) / 50);
  const lift = (x: number, z: number) => (globe ? Math.sqrt(Math.max(0, GLOBE * GLOBE - x * x - z * z)) - GLOBE : 0);
  const at = (a: Area): V3 => {
    const [x, z] = [(a.position.x - centre.x) * scale, (a.position.z - centre.z) * scale];
    return [x, lift(x, z), z];
  };
  // The look of the world here (scenery.tsx): a settlement's sky and horizon, a planet's clouds; kept by the view, not rebuilt with the world
  const lite = useQuality((q) => q.tier === "lite");
  const look = useMemo(() => (system ? null : worldLook(world, view.id)), [view.id]);
  // A planet's globe has its land on it (scenery.tsx PlanetGlobe), flattened round the places the map stands on it
  const placeKey = places.map((a) => a.id).join(",");
  const land = useMemo(() => (globe ? globeOf(view.type, hashText(view.id), 2.4, places.map((a) => { const p = at(a); return new THREE.Vector3(p[0], p[1] + GLOBE, p[2]); })) : null), [view.id, placeKey]);
  // The ground's height at a point of the view: the globe's curve and its land
  const surface = (x: number, z: number) => { const y = lift(x, z); return land ? y + globeLift(land, new THREE.Vector3(x, y + GLOBE, z).normalize()) : y; };
  // A road over the ground between two places (bent over the curve of a globe and over its hills)
  const road = (from: V3, to: V3): V3[] => Array.from({ length: globe ? 25 : 13 }, (_, i) => {
    const k = i / (globe ? 24 : 12);
    const [x, z] = [from[0] + (to[0] - from[0]) * k, from[2] + (to[2] - from[2]) * k];
    return [x, surface(x, z) + 0.12, z];
  });
  const partySpot: V3 = system ? [extent * scale * 0.5 + 6, 0, 0] : globe ? [0, 13, 0] : [-22 * span, 0, 24 * span];
  // The party's speeders parked at a place
  const parkedAt = (id: string): PartyVehicle[] => ((((world as World & { parked?: PartyVehicle[] }).parked ?? []) as PartyVehicle[])).filter((v) => v.areaId === id);
  // Who and what is on the way between the places of this view: people between buildings,
  // speeders between settlements, ships between ports, planets and systems. Somewhere outside the
  // view is its edge: the jump point, orbit, the outskirts.
  const moving: Mover[] = (world as World & { moving?: Mover[] }).moving ?? [];
  const walkers = useMemo((): Walker[] => {
    const under = (id: string) => trailOf(world, id).find((a) => a.parentId === view.id);
    return moving.flatMap((m) => {
      const [a, b] = [under(m.from), under(m.to)];
      if ((!a && !b) || a === b) return [];
      if (m.kind === "person" && system) return [];
      const [pa, pb] = [a ? at(a) : partySpot, b ? at(b) : partySpot];
      // Between settlements a person rides what their outing goes by (shared logic "Traffic")
      const kind: Walker["kind"] = m.kind === "ship" ? "ship" : globe ? (m.vehicle === "mount" || m.vehicle === "hauler" || m.vehicle === "airspeeder" ? m.vehicle : "speeder") : "person";
      const lift: V3 = kind === "person" ? [0, 0.2, 0] : kind === "speeder" || kind === "mount" || kind === "hauler" ? [0, 0.6, 0] : kind === "airspeeder" ? [0, 1.4, 0] : [0, 2.5, 0];
      return [{ key: `${m.kind}-${m.id}`, from: [pa[0] + lift[0], pa[1] + lift[1], pa[2] + lift[2]] as V3, to: [pb[0] + lift[0], pb[1] + lift[1], pb[2] + lift[2]] as V3, progress: m.progress, kind, name: m.name, arc: kind === "ship" ? 6 : 0, scale: kind === "person" ? 1.6 * span : kind === "ship" ? 1.4 : 1.5, hover: globe && kind !== "ship" ? lift[1] : undefined }];
    });
  }, [moving, view.id, world]);

  return (
    <>
      {system || globe ? <color attach="background" args={["#000000"]} /> : null}
      {(system || globe) && <Stars radius={160} depth={40} count={1500} factor={4} fade speed={0} />}
      {system && (
        <>
          <mesh>
            <sphereGeometry args={[2.6, 24, 24]} />
            <meshBasicMaterial color={STAR_COLOR[view.type] ?? "#fff4a3"} />
          </mesh>
          <mesh>
            <sphereGeometry args={[3.4, 24, 24]} />
            <meshBasicMaterial color={STAR_COLOR[view.type] ?? "#fff4a3"} transparent opacity={0.18} depthWrite={false} />
          </mesh>
          <pointLight position={[0, 0, 0]} intensity={3} distance={0} decay={0} color={STAR_COLOR[view.type] ?? "#ffffff"} />
          {places.map((a) => {
            const r = Math.hypot(a.position.x, a.position.z) * scale;
            return <Line key={a.id} points={Array.from({ length: 65 }, (_, i): V3 => [Math.cos((i / 64) * Math.PI * 2) * r, 0, Math.sin((i / 64) * Math.PI * 2) * r])} color="#31405e" lineWidth={1} />;
          })}
        </>
      )}
      {globe && (
        <>
          {land && <PlanetGlobe globe={land} radius={GLOBE - 0.05} position={[0, -GLOBE, 0]} detail={lite ? 40 : 64} clouds={look?.clouds ?? 0.4} cloudColor={look?.cloudColor} />}
          <mesh position={[0, -GLOBE, 0]}>
            <sphereGeometry args={[GLOBE + 1.6, 48, 32]} />
            <meshBasicMaterial color={BIOME_COLOR[view.type] ?? "#5fa56a"} transparent opacity={0.12} side={THREE.BackSide} depthWrite={false} />
          </mesh>
          {view.ships.map((ship, i) => (
            <group key={ship.id} position={[-16 + i * 8, 10, -14]} rotation={[0, 0.6, 0.1]}>
              <group position={[-3, 0, -2]}><ShipModel ship={ship} w={6} h={4} /></group>
              <Label at={[0, 3.4, 0]} size={0.9} color="#aabbdd">{`${ship.name} (${ship.size.toLowerCase()} ${ship.role.toLowerCase()}, ${ship.status})`}</Label>
            </group>
          ))}
        </>
      )}
      {seaView && (
        <>
          <Sea at={[0, -0.6, 0]} size={900} lite={liteSea} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]}>
            <planeGeometry args={[1400, 1400]} />
            <meshBasicMaterial color="#123848" />
          </mesh>
        </>
      )}
      {!system && !globe && !seaView && (
        <>
          {groundTex ? (
            <>
              <GroundSurface set={groundTex.set} tint={groundTex.tint} parallax={groundTex.parallax} w={600} h={600} at={[0, -0.6, 0]} />
              <FarGround set={groundTex.set} tint={groundTex.tint} size={1400} at={[0, -0.65, 0]} />
            </>
          ) : (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
              <planeGeometry args={[1400, 1400]} />
              <meshBasicMaterial color={GROUND[biome] ?? "#0b1220"} />
            </mesh>
          )}
        </>
      )}

      {paths.map((path) => (
        <Line key={path.id} points={road(at(world.areas[path.from]), at(world.areas[path.to]))} color={path.locked ? "#ff9040" : system ? "#60a0ff" : "#c9b48a"} lineWidth={system ? 1.5 : 4} transparent opacity={system ? 0.7 : 0.55} />
      ))}

      {places.map((area) => {
        const current = partyTrail.has(area.id);
        const hostile = area.occupants.some((o) => o.disposition === "hostile") || area.danger > 0;
        const color = current ? "#ffcc00" : hostile ? "#cc4444" : area.gateway ? "#66ccaa" : "#8899bb";
        const position = at(area);
        const tilt = globe ? new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(position[0], position[1] + GLOBE, position[2]).normalize()) : undefined;
        const giant = area.type === "gas giant";
        const wide = area.kind === "planet" ? 3 : 5;
        return (
          <group key={area.id} position={position} quaternion={tilt} onClick={(e) => tap(e, area.id)}>
            {area.kind === "planet" ? (
              <>
                <mesh>
                  <sphereGeometry args={[giant ? 2.1 : 1.5, 24, 20]} />
                  <meshLambertMaterial color={BIOME_COLOR[area.type] ?? color} emissive={BIOME_COLOR[area.type] ?? color} emissiveIntensity={0.25} />
                </mesh>
                {giant && <mesh rotation={[Math.PI / 2.3, 0, 0]}><torusGeometry args={[3, 0.22, 2, 40]} /><meshBasicMaterial color="#e8c9a0" transparent opacity={0.6} /></mesh>}
                {area.ships.length > 0 && <group position={[2.4, 1.2, 0]} scale={0.22}><group position={[-3, 0, -2]}><ShipModel ship={area.ships[0]} w={6} h={4} /></group></group>}
              </>
            ) : (
              <>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.42, 0]}>
                  <circleGeometry args={[5, 32]} />
                  <meshBasicMaterial color={color} transparent opacity={0.3} />
                </mesh>
                <group position={[0, -0.4, 0]} scale={1.9}>
                  {area.kind === "building" ? <BuildingModel type={area.type} wall={wall} /> : <SettlementModel type={area.type} wall={wall} />}
                </group>
              </>
            )}
            {/* The party's speeders parked at this place */}
            {parkedAt(area.id).map((v, i) => (
              <group key={v.id} position={[-4 + i * 1.8, area.kind === "planet" ? 0 : -0.3, 3]} scale={1.3}>
                <SpeederModel model={v.model} wrecked={v.status === "wrecked"} look={v.look} name={v.name} />
              </group>
            ))}
            {/* A wider target than the model, for a finger */}
            <mesh position={[0, 1, 0]}>
              <sphereGeometry args={[wide, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {(current || selectedId === area.id) && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, area.kind === "planet" ? 0 : -0.38, 0]}>
                <ringGeometry args={[wide + 0.2, wide + (current ? 0.8 : 0.5), 40]} />
                <meshBasicMaterial color={current ? "#ffcc00" : "#7dd3fc"} transparent opacity={0.85} side={THREE.DoubleSide} />
              </mesh>
            )}
            <Label at={[0, area.kind === "planet" ? 3.6 : 7.6, 0]} size={1.3}>{area.name}</Label>
          </group>
        );
      })}

      {/* The party, when it is at this place but in none of the places inside it */}
      {/* In orbit or at the jump point the party is aboard: its own ship if one of its ships is here, else the ride it came by (nobody
          stands in space) */}
      {hereId === view.id && (system || globe) && (
        <PartyCraft at={partySpot} ship={(((world as World & { starships?: PartyShip[] }).starships ?? []) as PartyShip[]).find((s) => s.areaId === view.id && s.status !== "wrecked")} where={PARTY_AT[view.kind] ?? "Here"} />
      )}
      {hereId === view.id && !system && !globe && (
        <group position={partySpot}>
          <group scale={2.6}><Figure kind="player" ring={SIDE_COLORS.player} marker /></group>
          {(((world as World & { party?: Companion[] }).party ?? []) as Companion[]).map((c, i) => (
            <group key={c.id} position={[3.4 + i * 2.8, 0, 0.8]} scale={2.2}>
              <Figure kind={tokenOf({ name: c.name, role: c.kind === "droid" ? "utility droid" : c.kind === "beast" ? "wildlife" : c.role, creature: c.creature })} ring={SIDE_COLORS.friendly} name={c.name} species={c.species} role={c.role} creature={c.creature} size={c.size} />
            </group>
          ))}
          {parkedAt(view.id).map((v, i) => (
            <group key={v.id} position={[-6 - i * 3.4, 0, 1]} scale={2.2}>
              <SpeederModel model={v.model} wrecked={v.status === "wrecked"} look={v.look} name={v.name} />
            </group>
          ))}
          <Label at={[0, 5.4, 0]} size={1.1} color="#facc15">{`${PARTY_AT[view.kind] ?? "Here"} (you are here)`}</Label>
        </group>
      )}
      <Walkers walkers={walkers} ground={globe ? surface : undefined} />
      {!places.length && <Label at={[0, 6, 0]} size={1.6} color="#aabbdd">{`Nobody has mapped ${view.name} yet`}</Label>}
      <Label at={[0, globe ? 20 : 0.5, globe ? -30 : -34 * span - 6]} size={2 * span} color="#aabbdd">{`${LAYER_NAME[view.kind] ?? ""} ${view.name}`}</Label>

      <Probe locate={(key) => {
        const area = places.find((a) => `area:${a.id}` === key);
        return area ? at(area) : undefined;
      }} />
      <Rig target={[0, 0, 0]} offset={globe ? [0, 50, 40] : system ? [0, 40, 34] : [0, 42 * span, 30 * span]} min={10} max={260} />
      {system || globe ? (
        <>
          <ambientLight intensity={0.7} />
          <directionalLight position={[10, 30, 10]} intensity={0.8} />
        </>
      ) : (
        <Sky shadow={60} look={look} ground={-0.6} fog={[220, 640]} floor={!groundTex} />
      )}
    </>
  );
}

const LAYER_NAME: Record<string, string> = { settlement: "Streets of", planet: "Surface of", system: "Orbits of" };

// The party's craft in orbit or at a jump point: its own ship, or a shuttle when it travels as passengers or on a hired ride; it rides
// a little up and down and turns slowly, its engines lit, with a marker ring under it
function PartyCraft({ at, ship, where }: { at: V3; ship?: PartyShip; where: string }) {
  const group = useRef<THREE.Group>(null);
  const look = ship ?? { size: "Small", role: "shuttle", status: "orbiting", name: "Passage shuttle" };
  // Drawn at the size the orbiting ships are, a little larger for a small craft so that it can be picked out
  const scale = /tiny|small/i.test(look.size) ? 1.5 : /medium/i.test(look.size) ? 1.3 : 1.1;
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.position.set(at[0], at[1] + Math.sin(t * 0.7) * 0.35, at[2]);
    group.current.rotation.set(Math.sin(t * 0.5) * 0.04, 0.5 + Math.sin(t * 0.08) * 0.25, Math.sin(t * 0.6) * 0.05);
  });
  return (
    <>
      <group ref={group} position={at}>
        <group scale={scale}>
          <group position={[-3, -1.2, -2]}><ShipModel ship={look} w={6} h={4} /></group>
          <pointLight position={[-3.6, 0, 0]} color="#7fd8ff" intensity={6} distance={8} decay={2} />
        </group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.6, 0]}>
          <ringGeometry args={[4.6, 5.2, 48]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      <Label at={[at[0], at[1] + 5.4, at[2]]} size={1.1} color="#facc15">{ship ? `${where} aboard the ${ship.name} (you are here)` : `${where}, aboard a passage shuttle (you are here)`}</Label>
    </>
  );
}

// The map of the campaign's world: the galaxy, a system, a planet, a settlement, or a building
// and the ground round it, whichever is being looked at; stock scenery for a campaign that has
// no generated world
export default function LocalMap({ world, hereId, viewId, selectedId, onAct, locked, reveal }: LocalMapProps = {}) {
  if (!world || !hereId || !world.areas[hereId]) return <Scenery />;
  const view = world.areas[viewId ?? ""] ?? world.areas[viewOf(world, hereId)];
  // The buildings of a district share one scene, so going from one to the next does not rebuild it
  if (view.kind === "building") return <BuildingScene key={districtAt(world, view.id)?.id ?? view.id} world={world} building={view} hereId={hereId} selectedId={selectedId} onAct={onAct} locked={locked} reveal={reveal} />;
  if (view.kind === "system" || view.kind === "planet" || view.kind === "settlement") return <WorldLayer world={world} view={view} hereId={hereId} selectedId={selectedId} onAct={onAct} />;
  return <GalaxyMap world={world} hereId={hereId} selectedId={selectedId} onAct={onAct} />;
}

// Local map terrain and objects
function Scenery() {
  const { currentLocation } = useMap();
  const terrainRef = useRef<THREE.Mesh>(null);
  const playerRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [subscribe, getKeys] = useKeyboardControls();
  
  // Textures
  const terrainTexture = useTexture("/textures/grass.png");
  terrainTexture.wrapS = terrainTexture.wrapT = THREE.RepeatWrapping;
  terrainTexture.repeat.set(20, 20);
  
  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  
  // Handle player movement
  useFrame((_, delta) => {
    if (!playerRef.current) return;
    
    const keys = getKeys();
    const speed = 5 * delta;
    
    if (keys.forward) {
      playerRef.current.position.z -= speed;
    }
    
    if (keys.backward) {
      playerRef.current.position.z += speed;
    }
    
    if (keys.leftward) {
      playerRef.current.position.x -= speed;
    }
    
    if (keys.rightward) {
      playerRef.current.position.x += speed;
    }
    
    // Limit player to terrain bounds
    const maxDistance = 45;
    playerRef.current.position.x = Math.max(-maxDistance, Math.min(maxDistance, playerRef.current.position.x));
    playerRef.current.position.z = Math.max(-maxDistance, Math.min(maxDistance, playerRef.current.position.z));
    
    // Camera follows player
    camera.position.x = playerRef.current.position.x;
    camera.position.z = playerRef.current.position.z + 10;
    camera.lookAt(
      playerRef.current.position.x,
      playerRef.current.position.y,
      playerRef.current.position.z
    );
  });
  
  // Generate objects based on location description
  const generateObjects = () => {
    if (!currentLocation) return null;
    
    const objects = [];
    const numObjects = Math.floor(Math.random() * 20) + 10;
    
    for (let i = 0; i < numObjects; i++) {
      const type = Math.random() > 0.7 ? "building" : "tree";
      const x = (Math.random() - 0.5) * 80;
      const z = (Math.random() - 0.5) * 80;
      const scale = Math.random() * 0.5 + 0.5;
      
      objects.push(
        <group key={`object-${i}`} position={[x, 0, z]} scale={[scale, scale, scale]}>
          {type === "building" ? (
            <mesh>
              <boxGeometry args={[3, 4, 3]} />
              <meshLambertMaterial color="#888888" />
            </mesh>
          ) : (
            <mesh>
              <cylinderGeometry args={[0, 1.5, 5, 8]} />
              <meshLambertMaterial color="#228822" />
            </mesh>
          )}
        </group>
      );
    }
    
    return objects;
  };

  return (
    <>
      {/* Terrain */}
      <mesh 
        ref={terrainRef} 
        rotation={[-Math.PI / 2, 0, 0]} 
        receiveShadow
      >
        <planeGeometry args={[100, 100, 32, 32]} />
        <meshLambertMaterial 
          map={terrainTexture} 
          color={0x88bb88}
        />
      </mesh>
      
      {/* Player */}
      <mesh ref={playerRef} position={[0, 1, 0]} castShadow>
        <boxGeometry args={[1, 2, 1]} />
        <meshLambertMaterial color="#4444cc" />
      </mesh>
      
      {/* Environment objects */}
      {generateObjects()}
      
      {/* Location marker */}
      {currentLocation && (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.1, 0]}>
            <ringGeometry args={[3, 3.5, 32]} />
            <meshBasicMaterial color="#ffcc00" transparent opacity={0.7} />
          </mesh>
          <Text
            position={[0, 3, 0]}
            fontSize={1.5}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
          >
            {currentLocation.name}
          </Text>
        </group>
      )}
      
      {/* Controls */}
      <OrbitControls 
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={50}
      />
      
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={1} 
        castShadow 
        shadow-mapSize-width={2048} 
        shadow-mapSize-height={2048}
      />
    </>
  );
}
