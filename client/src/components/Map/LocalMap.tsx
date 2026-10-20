import { useRef, useState, useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Text, useTexture, OrbitControls, PerspectiveCamera, Billboard, Line, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { useKeyboardControls } from "@react-three/drei";
import { create } from "zustand";
import { useMap } from "@/lib/stores/useMap";
import { useCombat, useShipFight, attackPlan, cannotAct, pickTarget, reachable, onPartySide, parseKey, squaresApart, type Combatant } from "@/lib/stores/useCombat";
import { standsAt, type Companion, type PartyVehicle, type Vehicle, shipReach, SHIP_FACINGS } from "@shared/logic";
import { afterHoursLock, alleyAt, alleysOf, ambushIn, bayBerth, bayDoor, gangSpots, gangStarts, lawAt, isSatellite, childrenOf, trailOf, exitsOf, floorPlan, createRandom, counterSides, isCounter, isLocal, formOf, openAir, districtAt, trapsIn, useKindOf, unitOf, ALERT, START_TIME, daylight, hourOf, blockadeAt, type Squad, type Mover, type DistrictPlan, type Rect, type Area, type Exit, type Occupant, type RoomAsset, type RoomLayout, type Ship, type World, type ResourceNode, nodeAt } from "@shared/logic";
import GalaxyMap, { Probe, Rig, useTaps, tapTime, type MapAction } from "./GalaxyMap";
import { floorOf, tokenOf, SIDE_COLORS, type FloorKind } from "./sprites";
import { Atmosphere } from "./interiors/Atmosphere";
import { Stock } from "./interiors/Stock";
import { CaveDressing, CaveMound, CaveWalls, MaskFloor, RockWall } from "./interiors/CaveRoom";
import { moodOf } from "./interiors/atmosphere";
import { PACKS, facing, hasWalls, packOf } from "./interiors/packs";
import { PackWalls, cornerCentre, type WallRun } from "./interiors/Walls";
import { AIM, useView, type AimPlan } from "./interiors/aim";
import { ViewRig } from "./interiors/ViewRig";
import { packTone, toneColour } from "./interiors/tones";
import { lookOf, wealthOf } from "./interiors/wealth";
import { holdsOf } from "./interiors/stock";
import { CurtainWall, GardenGround, Scatter, StallModel, ambientBackdrop, ambientBlockers, ambientCover, fixturesOf, keeperSpot, paletteOf, stallState, useQuality, type Placed } from "./siteAssets";
import { Figure, Furniture, Chest, NodeModel, ShipModel, ShipBody, SpeederModel, BuildingModel, SettlementModel, Decor, RoomBlock, RoundedFloor, CornerWall, DomeRoof, Opening, styleOf, hue, type Style } from "./models";
import { radiiOf as shapeRadii } from "@shared/logic/footprint";

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

// The campaign clock, in minutes (shared/logic "Time"). Play keeps it; the map lights the scene by it.
export const useClock = create<{ minutes: number; set: (minutes: number) => void }>((set) => ({
  minutes: START_TIME,
  set: (minutes) => set({ minutes }),
}));
// The minute between the clock's ticks (a minute passes each real second while the clock runs), for what is
// drawn moving by the clock: a ship coming down into its berth, the doors of its hangar
let tickedAt = performance.now();
useClock.subscribe((state, before) => { if (state.minutes !== before.minutes) tickedAt = performance.now(); });
const minuteNow = () => useClock.getState().minutes + Math.min(1, (performance.now() - tickedAt) / 1000);

// The sky and the light over a place on a planet's surface, by the hour: a blue sky by day, warm
// light at dawn and dusk, and a dark sky with faint blue moonlight at night
const NIGHT_SKY = new THREE.Color("#05070c");
const DAY_SKY = new THREE.Color("#5d7fa3");
const DUSK_SKY = new THREE.Color("#b8683f");
function Sky({ shadow = 30, cast = true, indoors = 0 }: { shadow?: number; cast?: boolean; indoors?: number }) {
  const minutes = useClock((c) => Math.round(c.minutes / 5) * 5);
  const light = daylight(minutes);
  const twilight = light > 0 && light < 1;
  const background = NIGHT_SKY.clone().lerp(DAY_SKY, light).lerp(DUSK_SKY, twilight ? 0.35 * (1 - Math.abs(light - 0.5) * 2) : 0);
  // The sun crosses from east to west over the day; at night the moon stands high
  const angle = ((hourOf(minutes) - 6) / 12) * Math.PI;
  const sun: V3 = light > 0 ? [Math.cos(angle) * 30, Math.max(6, Math.sin(angle) * 30), 14] : [-10, 30, 8];
  return (
    <>
      <color attach="background" args={[background]} />
      <ambientLight intensity={(0.32 + 0.43 * light) * (1 - 0.5 * indoors)} color={light < 0.3 ? "#a9b8ff" : "#ffffff"} />
      <directionalLight position={sun} intensity={(0.14 + 0.76 * light) * (1 - 0.6 * indoors)} color={twilight ? "#ffb27a" : light ? "#fff6e6" : "#8fa6ff"} castShadow={cast} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-shadow} shadow-camera-right={shadow} shadow-camera-top={shadow} shadow-camera-bottom={-shadow} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Plain solids for what is built round the models (walls, slabs, rails, ladders, posts). The
// models themselves (people, droids, creatures, furniture, ships, vehicles, buildings) are in
// models.tsx.
// ---------------------------------------------------------------------------------------------

type V3 = [number, number, number];
const Solid = ({ at, color, glow, rot, solid, children }: { at: V3; color: string; glow?: number; rot?: V3; solid?: boolean; children: ReactNode }) => {
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
      <meshLambertMaterial color={color} emissive={color} emissiveIntensity={glow ?? 0.08} />
    </mesh>
  );
};
const Box = ({ at, size, color, glow, rot, solid }: { at: V3; size: V3; color: string; glow?: number; rot?: V3; solid?: boolean }) => <Solid at={at} color={color} glow={glow} rot={rot} solid={solid}><boxGeometry args={size} /></Solid>;
const Cyl = ({ at, r, h, color, glow, top = r }: { at: V3; r: number; h: number; color: string; glow?: number; top?: number }) => <Solid at={at} color={color} glow={glow}><cylinderGeometry args={[top, r, h, 18]} /></Solid>;
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

// A name that turns to face whoever is looking
// Names are sized to be read from above; from the character's eyes they are a third as large (the crosshair names what it is on)
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
const Hit = ({ at, size, onTap, label, plan }: { at: V3; size: V3; onTap: () => void; label?: string; plan?: () => AimPlan }) => {
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    m.userData.aim = { label, onTap, plan };
    AIM.targets.add(m);
    return () => { AIM.targets.delete(m); };
  });
  return (
    <mesh ref={mesh} position={at} onClick={(e) => { e.stopPropagation(); if (e.delta <= 8) onTap(); }}>
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

// What a berth of a hangar shows: its ship, which comes down from above or rises out by the clock (the minute
// between ticks, see `bayBerth`), or the painted berth. `rise` is how high it goes to be clear of the roof.
function BayBerth({ room, asset, based, ceiling, rise: up = 8 }: { room: Pick<Area, "id" | "ships">; asset: RoomAsset; based?: Ship[]; ceiling?: number; rise?: number }) {
  const group = useRef<THREE.Group>(null);
  const [shown, setShown] = useState(() => bayBerth(room, asset, based, minuteNow()));
  const was = useRef("");
  const keyOf = (b: ReturnType<typeof bayBerth>) => `${b.ship?.id ?? ""}|${b.away}`;
  useFrame(() => {
    const b = bayBerth(room, asset, based, minuteNow());
    if (group.current) group.current.position.y = b.lift * up;
    if (keyOf(b) !== (was.current || keyOf(shown))) setShown(b);
    was.current = keyOf(b);
  });
  return (
    <>
      <group ref={group}>{shown.ship && <ShipModel ship={shown.ship} w={asset.w} h={asset.h} ceiling={ceiling} />}</group>
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
const LEVEL_H = 2.8;
const levelY = (l?: Pick<RoomLayout, "level">) => (l?.level ?? 0) * LEVEL_H;
const rise = (l?: Pick<RoomLayout, "climb">) => (l?.climb ? l.climb.levels * LEVEL_H : 0);
// How far up the floor of a way between floors is at a point of it (squares from the room's
// north-west corner, the middle of a square being half way into it)
function rampAt(l: RoomLayout, x: number, y: number): number {
  if (!l.climb) return 0;
  const { toward } = l.climb;
  const t = toward === "e" ? x / l.width : toward === "w" ? 1 - x / l.width : toward === "s" ? y / l.height : 1 - y / l.height;
  return Math.max(0, Math.min(1, t)) * rise(l);
}
// Where the soles of someone standing at a point of a room are, in the building's own height
const floorAt = (l: RoomLayout, x: number, y: number) => levelY(l) + rampAt(l, x, y);
const sameFootprint = (a: RoomLayout, b: RoomLayout) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// The steps of a stairwell, or the rungs of a ladder, rising from one end of a room to the other;
// they are looked at, not tapped (the floor under them takes the tap)
function Ascent({ w, h, toward, up, form }: { w: number; h: number; toward: "n" | "e" | "s" | "w"; up: number; form: string }) {
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

// Two panels of a roof that slide apart and together: the door of a hangar on a world whose air is no good
// to breathe, over the ships inside. They are open only for a ship coming or going (`door`, from 0 to 1, is
// read each frame from the clock).
function HangarRoof({ width, height, y, door }: { width: number; height: number; y: number; door: () => number }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  useFrame(() => {
    const slide = door() * (width / 2 - 0.2);
    if (left.current) left.current.position.x = width / 4 - slide;
    if (right.current) right.current.position.x = (3 * width) / 4 + slide;
  });
  return (
    <>
      <group ref={left} position={[width / 4, y, height / 2]}>
        <Box at={[0, 0, 0]} size={[width / 2 - 0.05, 0.14, height + 0.1]} color="#59636d" />
        <Box at={[0, 0.1, 0]} size={[width / 2 - 0.4, 0.06, height - 0.3]} color="#3a434c" />
      </group>
      <group ref={right} position={[(3 * width) / 4, y, height / 2]}>
        <Box at={[0, 0, 0]} size={[width / 2 - 0.05, 0.14, height + 0.1]} color="#59636d" />
        <Box at={[0, 0.1, 0]} size={[width / 2 - 0.4, 0.06, height - 0.3]} color="#3a434c" />
      </group>
    </>
  );
}

// A flight of stairs set in a room's floor, up to a gallery or down from it; where the stairwell is wide enough for two flights (2 by 3
// or more), a switchback: up the first half, round a landing, and back along the second to the floor above. The stairwell lies along its
// longer side (a quarter turn for one that is wider than it is deep)
function StairsAsset({ w, h, up }: { w: number; h: number; up: boolean }) {
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
      return (
        <mesh key={`${key}${i}`} position={[x0 + width / 2, top / 2 + 0.02, z]} raycast={none}>
          <boxGeometry args={[width * 0.9, Math.max(0.04, top), Math.abs(to - from) / n + 0.01]} />
          <meshLambertMaterial color={up ? "#9aa0a8" : "#2c3138"} />
        </mesh>
      );
    });
  const body = switchback ? (
    <>
      {steps(0, C / 2, L, 0.6, 0, rise / 2, Math.max(3, Math.round(L * 1.3)), "a")}
      {/* The landing at the far end, and the second flight rising back to the floor above */}
      {up && <mesh position={[C / 2, rise / 4 + 0.02, 0.3]} raycast={none}><boxGeometry args={[C * 0.9, rise / 2, 0.6]} /><meshLambertMaterial color="#9aa0a8" /></mesh>}
      {steps(C / 2, C / 2, 0.6, L, rise / 2, rise, Math.max(3, Math.round(L * 1.3)), "b")}
      <Box at={[C / 2, 0.45, L / 2]} size={[0.05, 0.9, L]} color="#c8ccd2" />
    </>
  ) : (
    steps(0, C, L, 0, 0, rise, Math.max(3, Math.round(L * 2.4)), "s")
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
const FULL_WALL_HEIGHT = 2.4;
const WALL_THICK = 0.16;
const isWay = (a: RoomAsset) => !!a.side && a.kind !== "window";

// Where on a room's wall line something set in the wall sits (in the room's own squares), and
// how it is turned
const onWall = (layout: { width: number; height: number }, a: RoomAsset): { x: number; z: number; turn: number } =>
  a.side === "n" ? { x: a.x + 0.5, z: 0, turn: 0 } : a.side === "s" ? { x: a.x + 0.5, z: layout.height, turn: 0 } : a.side === "w" ? { x: 0, z: a.y + 0.5, turn: Math.PI / 2 } : { x: layout.width, z: a.y + 0.5, turn: Math.PI / 2 };

// A door, way out, secret way or window, drawn along x about the origin, its frame in the
// building's style (arched, rounded or square; round windows in hulls)
function Doorway({ kind, color, label, onTap, style }: { kind: RoomAsset["kind"]; color: string; label?: string; onTap?: () => void; style?: Style }) {
  return (
    <>
      <Opening kind={kind} color={color} style={style} />
      {label && <Label at={[0, kind === "window" || kind === "secret" ? 1.2 : 1.9, 0]} size={0.3} color={color}>{label}</Label>}
      {onTap && <Hit at={[0, 0.75, 0]} size={[1, 1.5, 0.9]} onTap={onTap} label={label ?? kind} />}
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

// The squares of a wall that are solid, as runs between the gaps for doors
function wallRuns(length: number, gaps: number[]): [number, number][] {
  const runs: [number, number][] = [];
  let from = 0;
  for (const gap of [...gaps].sort((a, b) => a - b)) {
    if (gap > from) runs.push([from, gap]);
    from = gap + 1;
  }
  if (from < length) runs.push([from, length]);
  return runs;
}

export function RoomShell({ width, height, assets, floor, wall, ships = [], bay, walls = true, fullWalls = false, ceiling = false, looted, nodeOf, wayColor, wayLabel, onFloor, onAsset, plan, corners, style, mood, children }: {
  width: number;
  height: number;
  // How far each outside corner is rounded: north-west, north-east, south-east, south-west
  corners?: [number, number, number, number];
  // The building's look, for its doors and windows
  style?: Style;
  // What this room is, for its light, its air and what is in it (interiors/): the kind of building, the room's name, the world
  mood?: { buildingType: string; roomName: string; biome: string };
  // The room's level and what it is, for stairs, lifts and ladders (their floor rises)
  plan?: Pick<RoomLayout, "level" | "form" | "climb" | "width" | "height" | "mask">;
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
  // A cave has walls of rock and a rim of formations; every room has the light, the air and the stock its kind of place would
  // (interiors/): its wealth turns the furniture's browns, steels and golds into its own woods, metal and trim
  const detail = useQuality((q) => q.tier);
  const rocky = !!mood && mood.buildingType === "cave";
  // A cave room whose floor winds (layout.mask): floor squares, rock round them, no straight walls
  const mask = rocky ? plan?.mask : undefined;
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
  // The lines between the squares, as one piece of geometry (of the standing squares only, in a cave that winds)
  const grid = useMemo(() => {
    const points: number[] = [];
    if (mask) {
      const stands = (x: number, y: number) => mask[y]?.[x] === "#";
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (!stands(x, y)) continue;
        points.push(x, 0.012, y, x + 1, 0.012, y, x, 0.012, y, x, 0.012, y + 1);
        if (!stands(x + 1, y)) points.push(x + 1, 0.012, y, x + 1, 0.012, y + 1);
        if (!stands(x, y + 1)) points.push(x, 0.012, y + 1, x + 1, 0.012, y + 1);
      }
      return new Float32Array(points);
    }
    for (let x = 1; x < width; x++) points.push(x, 0.012, 0, x, 0.012, height);
    for (let y = 1; y < height; y++) points.push(0, 0.012, y, width, 0.012, y);
    return new Float32Array(points);
  }, [width, height, mask]);
  // A shaft's walls run up with the floor
  const climbs = plan?.climb ? rise(plan as RoomLayout) : 0;
  const wallH = (fullWalls ? FULL_WALL_HEIGHT : WALL_HEIGHT) + climbs;
  const ramp = (x: number, y: number) => (plan?.climb ? rampAt(plan as RoomLayout, x + 0.5, y + 0.5) : 0);
  // The kit this room is furnished and walled from, and its palette
  const pack = mood && !rocky ? packOf(mood.roomName, mood.buildingType) : undefined;
  const packLook = useMemo(() => (pack ? packTone(PACKS[pack], wall) : undefined), [pack, wall]);
  const [nw, ne, se, sw] = rocky ? [0, 0, 0, 0] : corners ?? [0, 0, 0, 0];
  const rounded = nw + ne + se + sw > 0;
  // The rounded corners, each a quarter ring
  const cornerList = ([[nw, 0], [ne, 1], [se, 2], [sw, 3]] as const).filter(([r]) => r > 0).map(([r, corner]) => ({ r, corner }));
  // Each wall runs between its corners, stopping short of a rounded one
  const sides = [
    { side: "n", length: width, ends: [nw, ne], at: (a: number, b: number): [V3, V3] => [[(a + b) / 2, wallH / 2, 0], [b - a + (a === 0 ? WALL_THICK / 2 : 0) + (b === width ? WALL_THICK / 2 : 0), wallH, WALL_THICK]], along: (a: RoomAsset) => a.x },
    { side: "s", length: width, ends: [sw, se], at: (a: number, b: number): [V3, V3] => [[(a + b) / 2, wallH / 2, height], [b - a + (a === 0 ? WALL_THICK / 2 : 0) + (b === width ? WALL_THICK / 2 : 0), wallH, WALL_THICK]], along: (a: RoomAsset) => a.x },
    { side: "w", length: height, ends: [nw, sw], at: (a: number, b: number): [V3, V3] => [[0, wallH / 2, (a + b) / 2], [WALL_THICK, wallH, b - a]], along: (a: RoomAsset) => a.y },
    { side: "e", length: height, ends: [ne, se], at: (a: number, b: number): [V3, V3] => [[width, wallH / 2, (a + b) / 2], [WALL_THICK, wallH, b - a]], along: (a: RoomAsset) => a.y },
  ];
  const trim = ([a, b]: [number, number], length: number, [first, last]: number[]): [number, number] => [a === 0 && first ? first : a, b === length && last ? length - last : b];
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
      {mask ? (
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
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={grid.length / 3} array={grid} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </lineSegments>
      {plan?.climb && plan.form && <Ascent w={width} h={height} toward={plan.climb.toward} up={climbs} form={plan.form} />}
      {walls && mask
        ? <CaveWalls mask={mask} ways={assets.filter((a) => a.side).map((a) => ({ x: a.x, y: a.y }))} w={width} h={height} biome={mood!.biome} tier={detail} seed={width * 31 + height} tall={fullWalls} />
        : walls
        ? (() => {
            const runs = sides.flatMap(({ side, length, at, along, ends }) =>
              wallRuns(length, assets.filter((a) => a.side === side && isWay(a)).map(along)).flatMap((run) => {
                const [a, b] = trim(run, length, ends);
                return b - a < 0.01 ? [] : [{ side: side as WallRun["side"], a, b, at, run }];
              }),
            );
            const plain = runs.map(({ side, a, b, at, run }) => {
              if (rocky) return <RockWall key={`${side}${run[0]}`} side={side} a={a} b={b} w={width} h={height} height={1.1} seed={Math.round(a * 10) + side.charCodeAt(0) + width} biome={mood!.biome} tier={detail} />;
              const [position, size] = at(a, b);
              return <Box key={`${side}${run[0]}`} at={position} size={size} color={wall} solid />;
            });
            // A room of a pack with walls has the kit's, straight and bent round its corners, in its palette; the plain ones stand until the kit is in
            const corner = cornerList.map((c) => {
              const [x, z] = cornerCentre(c, width, height);
              return (
                <group key={`corner${c.corner}`} position={[x, 0, z]}>
                  <Solids><CornerWall r={c.r} h={wallH} thick={WALL_THICK} corner={c.corner} color={packLook && pack && hasWalls(pack) ? toneColour(packLook) : wall} /></Solids>
                </group>
              );
            });
            return packLook && hasWalls(pack!) && !rocky ? <PackWalls runs={runs} corners={cornerList} width={width} height={height} wallH={wallH} thick={WALL_THICK} tone={packLook} fallback={<>{plain}{corner}</>} /> : <>{plain}{corner}</>;
          })()
        : [[0, 0], [width, 0], [0, height], [width, height]].map(([x, z], i) => <Cyl key={i} at={[x, 0.3, z]} r={0.08} h={0.6} color={wall} />)}
      {assets.filter((a) => a.side && (walls || a.kind !== "window")).map((a) => {
        const spot = onWall({ width, height }, a);
        return (
          <group key={a.id} position={[spot.x, ramp(a.x, a.y), spot.z]} rotation={[0, spot.turn, 0]}>
            <Doorway kind={a.kind} color={wayColor?.(a) ?? WAY_COLORS[a.kind as keyof typeof WAY_COLORS] ?? WAY_COLORS.door} label={wayLabel?.(a)} onTap={onAsset ? () => onAsset(a) : undefined} style={style} />
          </group>
        );
      })}
      {assets.filter((a) => !a.side && a.kind !== "npc" && a.name !== "Loose flagstone").map((a) => (
        <Glide key={a.id} x={a.x} y={a.y} z={(a.z ?? 0) * LEVEL_H}>
          {a.kind === "ship" ? (bay ? <BayBerth room={bay.room} asset={a} based={bay.based} /> : ships.find((ship) => ship.id === a.ref) ? <ShipModel ship={ships.find((ship) => ship.id === a.ref)!} w={a.w} h={a.h} /> : <Berth w={a.w} h={a.h} name={a.name} note="away on a voyage" />)
            : a.kind === "stairs" ? <StairsAsset w={a.w} h={a.h} up={/up/i.test(a.name)} />
            : a.kind === "loot" ? (nodeOf?.(a) ? <NodeModel node={nodeOf(a)!} empty={looted?.(a)} /> : <Chest looted={looted?.(a)} />)
            : (
              <>
                <Furniture name={a.name} w={a.w} h={a.h} seed={hue(a.id)} look={look} pack={pack} tone={packLook} face={facing(a, width, height)} bare={!!mood && !!holdsOf(a.name, mood.buildingType, mood.roomName)} />
                {mood && holdsOf(a.name, mood.buildingType, mood.roomName) && <Stock name={a.name} w={a.w} h={a.h} seed={hue(a.id)} buildingType={mood.buildingType} roomName={mood.roomName} tone={packLook} />}
              </>
            )}
          {/* Furniture that can be stood on (a bench, the stage) leaves the tap to the floor beneath, so it walks to that square */}
          {onAsset && !(onFloor && a.kind === "furniture" && !a.blocks && !useKindOf(a.name)) && <Hit at={[a.w / 2, 0.5, a.h / 2]} size={[a.w, 1, a.h]} onTap={() => onAsset(a)} label={a.name} />}
        </Glide>
      ))}
      {ceiling && walls && (
        // The roof seen from inside: rock over a cave, a deck head in a ship, a plain ceiling elsewhere, on the room's own footprint
        mask ? (
          <mesh position={[width / 2, wallH + 0.05, height / 2]} raycast={() => null}>
            <boxGeometry args={[width + 2, 0.1, height + 2]} />
            <meshLambertMaterial color={ceilingColour} />
          </mesh>
        )
        : rounded ? <RoundedFloor w={width} d={height} radii={[nw, ne, se, sw]} color={ceilingColour} y={wallH} thick={0.1} />
        : (
          <mesh position={[width / 2, wallH + 0.05, height / 2]} raycast={() => null}>
            <boxGeometry args={[width, 0.1, height]} />
            <meshLambertMaterial color={ceilingColour} />
          </mesh>
        )
      )}
      {atmosphere && look && walls && <Atmosphere mood={atmosphere} look={look} w={width} h={height} tier={detail} />}
      {rocky && <CaveDressing w={width} h={height} seed={width * 31 + height} biome={mood!.biome} tier={detail} takenKey={takenKey} mask={mask} />}
      {children}
    </>
  );
}

// Walks over open squares, round what stands in the way and never across a corner, from one
// square to the nearest of the goals (A*, a diagonal step costing more than a straight one, so the
// way is the short one and not a zigzag). With `smooth` the path is then pulled straight: a stretch
// is walked in a line wherever a body a little under a square wide fits between open squares all
// along it (never over a square in `keep`, which has to be stepped on). The squares to step on,
// without the first; null if no way.
function route(open: (x: number, y: number) => boolean, from: { x: number; y: number }, goals: { x: number; y: number }[], smooth?: { keep?: Set<string> }): { x: number; y: number }[] | null {
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
type Brain = "patron" | "staff" | "musician" | "droid" | "post" | "round" | "still";

// What a scene offers the people in it, in its own squares
interface Setting {
  open: (x: number, y: number) => boolean;
  // Where people sit, by the table or booth they sit at
  seats: { id: string; centre: V3; spots: Sq[] }[];
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
}

export interface LifeApi {
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
  if (o.role === "guard") return { brain: guards === 0 ? "post" : guards === 1 ? "round" : "still" };
  if (o.disposition === "hostile") return { brain: "still" };
  if (o.role === "musician" && setting.stage.length) return { brain: "musician" };
  if (o.role === "service droid") return { brain: "droid" };
  if (isLocal(o) || /smuggler|bounty|informant|gambler|pilot for hire/.test(o.role)) return { brain: "patron" };
  const counter = setting.counters.find((c) => [...c.behind, ...c.front].some((s) => s.x === home.x && s.y === home.y));
  return counter ? { brain: "staff", counter: counter.asset.id } : { brain: "still" };
}

function Life({ people, setting, party, frozen, onTap, api, record }: {
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
      const spot = p.at ?? seat ?? nearestOpen((x, y) => setting.open(x, y) && !taken.has(`${x},${y}`), setting.watch);
      taken.add(sqKey(spot));
      const door = shown.current && setting.doors.length ? [...setting.doors].sort((a, b) => apart(a, spot) - apart(b, spot))[0] : undefined;
      const { brain, counter } = brainOf(p.occupant, spot, setting, guards);
      if (p.occupant.role === "guard") guards++;
      const start = door ?? spot;
      const a: Agent = { key: p.key, occupant: p.occupant, brain, counter, home: spot, x: start.x, y: start.y, path: [], wait: door ? 0 : between(1, 12), doing: brain === "patron" ? (door ? "arriving" : "seated") : brain === "musician" ? "playing" : brain, leg: 0, phase: Math.random() * 6 };
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
  const claimed = (s: Sq, self: Agent) => agents.some((o) => o !== self && ((o.goal && o.goal.x === s.x && o.goal.y === s.y) || (!o.path.length && squareOf(o).x === s.x && squareOf(o).y === s.y)));
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
    const r = Math.random();
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
        if (r < 0.3 && fronts.length && atBar < 2) {
          leaveSeat(a);
          goTo(a, fronts, "at the bar", between(8, 16), undefined, order(a));
        } else if (r < 0.45 && others.length) {
          const other = anyOf(others)!;
          leaveSeat(a);
          goTo(a, ring(squareOf(other)), "visiting", between(10, 20), () => squareOf(other));
        } else if (r < 0.55) {
          const seat = anyOf(freeSeats(a));
          if (seat) {
            leaveSeat(a);
            a.home = seat;
            goTo(a, [seat], "seated", between(15, 40), facing(seatOf(seat)));
          } else a.wait = between(10, 25);
        } else a.wait = between(10, 30);
      } else {
        // Back to a seat, sometimes another one
        if (Math.random() < 0.25) a.home = anyOf(freeSeats(a)) ?? a.home;
        if (!goTo(a, [a.home], "seated", between(15, 40), facing(seatOf(a.home)))) a.home = anyOf(freeSeats(a)) ?? a.home;
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
      else a.wait = between(4, 9);
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
          goTo(a, ring(squareOf(other)), "mingling", between(10, 20), () => squareOf(other));
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
    api.current = {
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
    return () => {
      api.current = null;
    };
  }, [agents]);
  useEffect(() => () => {
    if (record) agents.forEach((a) => drawnAt.delete(a.key));
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
    const expired = Object.entries(saying.current).filter(([, until]) => until < clock).map(([key]) => key);
    if (expired.length) {
      expired.forEach((key) => delete saying.current[key]);
      setBubbles((old) => Object.fromEntries(Object.entries(old).filter(([key]) => !expired.includes(key))));
    }

    for (const a of agents) {
      const group = groups.current[a.key];
      if (frozen(a.occupant) && me) {
        // Noticed: they stop where they are and watch the party
        a.path = [];
        a.goal = undefined;
        a.face = me;
      } else if (a.path.length) {
        let step = dt * (a.brain === "droid" ? 1.6 : 2.2);
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
        // Someone attending to the party goes back to work once the party walks off
        if (a.doing === "attending" && (!me || apart(me, squareOf(a)) > 3)) a.wait = Math.min(a.wait, 0);
        if (a.wait <= 0) think(a);
      }
      if (!group) continue;
      const face = typeof a.face === "function" ? a.face() : a.face;
      if (!a.path.length && face && (face.x !== a.x || face.y !== a.y)) {
        const want = Math.atan2(face.x - a.x, face.y - a.y);
        let turn = want - group.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        group.rotation.y += turn * Math.min(1, dt * 6);
      }
      const onStage = setting.stage.some((s) => s.x === Math.round(a.x) && s.y === Math.round(a.y));
      const playingNow = a.brain === "musician" && b.playing && !a.path.length && apart(squareOf(a), a.home) === 0;
      group.position.set(a.x + 0.5, (onStage ? setting.stageHeight : 0) + (playingNow ? Math.abs(Math.sin(state.clock.elapsedTime * 5 + a.phase)) * 0.07 : 0), a.y + 0.5);
      // A droid wiping a table turns on the spot
      if (a.brain === "droid" && a.doing === "cleaning" && !a.path.length) group.rotation.y += dt * 3;
      if (record) drawnAt.set(a.key, squareOf(a));
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
            <Figure kind={tokenOf(a.occupant)} ring={a.occupant.disabled ? "#6b7280" : SIDE_COLORS[a.occupant.disposition]} name={a.occupant.name} large={isLarge(a.occupant.size)} species={a.occupant.species} role={a.occupant.role} creature={a.occupant.creature} size={a.occupant.size} />
          </group>
          {a.occupant.captive && <><Box at={[-0.2, 0.15, 0]} size={[0.14, 0.1, 0.14]} color="#59636d" /><Box at={[0.2, 0.15, 0]} size={[0.14, 0.1, 0.14]} color="#59636d" /></>}
          {a.brain === "musician" && <Instrument name={a.occupant.loadout[0]} />}
          {a.brain === "droid" && <><Cyl at={[0, 0.82, 0.08]} r={0.2} h={0.03} color="#9aa3ad" /><Cyl at={[0.08, 0.9, 0.1]} r={0.04} h={0.14} color={AMBER} glow={0.8} /></>}
          {labelled(a.occupant) && <Label at={[0, isLarge(a.occupant.size) ? 2.2 : 1.6, 0]} size={0.26} color={SIDE_COLORS[a.occupant.disposition]}>{a.occupant.name}</Label>}
          {bubbles[a.key] && (
            <Html center position={[0, isLarge(a.occupant.size) ? 2.6 : 2.05, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div className="whitespace-nowrap rounded-lg bg-gray-900/90 px-2 py-0.5 text-xs text-amber-200 shadow">{bubbles[a.key]}</div>
            </Html>
          )}
          {onTap && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onTap({ key: a.key, occupant: a.occupant, at: squareOf(a), counter: a.brain === "staff" ? a.counter : undefined })} label={a.occupant.name} />}
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

// A companion follows the party: a step or two behind, keeping to open squares
function Follower({ companion, index, feet, open, height, onTap }: { companion: Companion; index: number; feet: React.MutableRefObject<{ x: number; y: number }>; open: (x: number, y: number) => boolean; height: () => number; onTap?: () => void }) {
  const group = useRef<THREE.Group>(null);
  const at = useRef<{ x: number; y: number } | null>(null);
  const goal = useRef({ x: 0, y: 0 });
  const offsets = [[-1, 1], [1, 1], [-2, 0], [2, 0]];
  useFrame((_, delta) => {
    const [dx, dy] = offsets[index % offsets.length];
    const want = { x: Math.round(feet.current.x) + dx, y: Math.round(feet.current.y) + dy };
    // Only look for a free square when the party has moved on
    if (Math.abs(goal.current.x - want.x) + Math.abs(goal.current.y - want.y) > 2 || !at.current) goal.current = nearestOpen(open, want);
    if (!at.current) at.current = { ...goal.current };
    const [mx, my] = [goal.current.x - at.current.x, goal.current.y - at.current.y];
    const far = Math.hypot(mx, my);
    const step = Math.min(far, Math.min(delta, 0.5) * 6.5);
    if (far > 0.02) {
      at.current = { x: at.current.x + (mx / far) * step, y: at.current.y + (my / far) * step };
      if (group.current) group.current.rotation.y = Math.atan2(mx, my);
    }
    if (group.current) group.current.position.set(at.current.x + 0.5, height(), at.current.y + 0.5);
  });
  const down = companion.hp <= 0;
  return (
    <group ref={group}>
      <group rotation={down ? [-Math.PI / 2, 0, 0.4] : [0, 0, 0]} position={[0, down ? 0.14 : 0, 0]}>
        <Figure kind={tokenOf({ name: companion.name, role: companion.kind === "droid" ? "utility droid" : companion.kind === "beast" ? "wildlife" : companion.role, creature: companion.creature })} ring={SIDE_COLORS.friendly} name={companion.name} large={isLarge(companion.size)} species={companion.species} role={companion.role} creature={companion.creature} size={companion.size} />
      </group>
      <Label at={[0, isLarge(companion.size) ? 2.2 : 1.6, 0]} size={0.26} color={SIDE_COLORS.friendly}>{companion.name}</Label>
      {onTap && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={onTap} label={companion.name} />}
    </group>
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
    return () => { w.__folk![id] = (w.__folk![id] ?? 1) - 1; };
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
          const goals = stop < 1 && latest.current.open(gx, gy) ? [{ x: gx, y: gy }] : [{ x: gx, y: gy }, ...aroundSquares(gx, gy)].filter((q) => latest.current.open(q.x, q.y));
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

type Walker = { key: string; from: V3; to: V3; progress: number; kind: "person" | "speeder" | "airspeeder" | "mount" | "hauler" | "ship"; name: string; arc?: number; scale?: number; note?: string };
// People about the street of a district, going between the doors of its buildings by the open
// ground and back again, at a walking pace (purely for life on the street: nobody to talk to)
type Stroll = { key: string; path: { x: number; y: number }[]; length: number; offset: number };
function Strollers({ strolls }: { strolls: Stroll[] }) {
  const groups = useRef<Record<string, THREE.Group | null>>({});
  useFrame(({ clock }) => {
    for (const w of strolls) {
      const g = groups.current[w.key];
      if (!g || w.length < 1) continue;
      // There and back, at a square and a bit a second
      const along = (((clock.elapsedTime + w.offset) * 1.3) % (w.length * 2));
      const back = along > w.length;
      let rest = back ? w.length * 2 - along : along;
      let [px, py] = [w.path[0].x, w.path[0].y];
      let [dx, dy] = [0, 0];
      for (let i = 1; i < w.path.length; i++) {
        const [ax, ay, bx, by] = [w.path[i - 1].x, w.path[i - 1].y, w.path[i].x, w.path[i].y];
        const leg = Math.hypot(bx - ax, by - ay);
        [dx, dy] = [bx - ax, by - ay];
        if (rest <= leg || i === w.path.length - 1) {
          const k = leg ? Math.min(1, rest / leg) : 0;
          [px, py] = [ax + (bx - ax) * k, ay + (by - ay) * k];
          break;
        }
        rest -= leg;
      }
      g.position.set(px + 0.5, 0, py + 0.5);
      g.rotation.y = Math.atan2(back ? -dx : dx, back ? -dy : dy);
    }
  });
  return (
    <>
      {strolls.map((w) => (
        <group key={w.key} ref={(g) => { groups.current[w.key] = g; }} position={[w.path[0].x + 0.5, 0, w.path[0].y + 0.5]}>
          <Figure kind="person" ring="#9ca3af" name={w.key} />
        </group>
      ))}
    </>
  );
}

// A beast to ride, by the rider's name (the mounts of the transport data)
const pickMount = (name: string) => ["Dewback", "Eopie", "Bantha", "Tauntaun", "Kaadu", "Varactyl"][hue(name) % 6];

// People and ships on the way between places (shared/logic withPresence: `moving`), drawn where
// they are on the way and eased there between the clock's minutes. Not tappable.
function Walkers({ walkers }: { walkers: Walker[] }) {
  const groups = useRef<Record<string, THREE.Group | null>>({});
  useFrame((_, delta) => {
    for (const w of walkers) {
      const g = groups.current[w.key];
      if (!g) continue;
      const want = new THREE.Vector3(...w.from).lerp(new THREE.Vector3(...w.to), Math.max(0, Math.min(1, w.progress)));
      want.y += (w.arc ?? 0) * Math.sin(Math.PI * Math.max(0, Math.min(1, w.progress)));
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
  const here = world.areas[hereId];
  // The room the party is in, or whether it stands outside; a room opened up to look at (the atlas)
  const inside = planned && here?.kind === "room" && buildingIds.has(here.parentId ?? "") ? here : null;
  const outside = buildingIds.has(hereId);
  const present = planned && (!!inside || outside);
  const opened = inside ?? (reveal && planned ? rooms.find((a) => a.id === selectedId) ?? null : null);
  // The building the party is in or in front of (or the one being looked at)
  const me = buildings.find((b) => b.id === (inside?.parentId ?? hereId)) ?? building;
  const tapPlace = useTaps(onAct);
  // A fight in the open of this district is fought here, on its streets, roofs and catwalks
  const duel = useCombat((state) => state.inCombat && !!district && state.arena.district === district.id);
  const duelist = useCombat((state) => (state.inCombat ? state.combatants.find((c) => c.isPlayer) : undefined));
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
  const inRoom = (x: number, y: number) => rooms.some((a) => a.layout && (a.layout.level ?? 0) >= 0 && formOf(a) !== "gallery" && !openAir(a) && x >= a.layout.x && x < a.layout.x + a.layout.width && y >= a.layout.y && y < a.layout.y + a.layout.height);

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
    const mine = (((world as World & { parked?: PartyVehicle[] }).parked ?? []) as PartyVehicle[]).filter((v) => v.areaId === settlementId);
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
    const ambient = ambientBlockers({ x: ground.x, y: ground.y, width: ground.w, height: ground.h }, buildings[0].id, biome, (x, y) => inGround(x, y) && !inRoom(x, y) && !clear.has(`${x},${y}`) && !fixtures.blocked.has(`${x},${y}`));
    const ambientBlocked = new Set<string>();
    for (const it of ambient) if (it.fills) for (let j = 0; j < it.fills[3]; j++) for (let i = 0; i < it.fills[2]; i++) ambientBlocked.add(`${it.fills[0] + i},${it.fills[1] + j}`);
    return { signs, decor, folk, caches, sentries, rigs, doors, ambient, ambientBlocked, clear };
  }, [world, district?.id ?? building.id]);
  // What grows low between them, and the belt of trees beyond the ground that can be walked on: only to be seen,
  // and fewer on a slow screen
  const cover = useMemo(
    () => (planned ? ambientCover({ x: ground.x, y: ground.y, width: ground.w, height: ground.h }, buildings[0].id, biome, tier, (x, y) => x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y) && !street.clear.has(`${x},${y}`) && !street.ambientBlocked.has(`${x},${y}`) && !fixtures.blocked.has(`${x},${y}`)) : []),
    [street, tier, biome],
  );
  const backdrop = useMemo(() => (planned ? ambientBackdrop({ x: ground.x, y: ground.y, width: ground.w, height: ground.h }, 40, buildings[0].id, biome, tier) : []), [street, tier, biome]);
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

  // Where the party can stand: the free floor of the room they are in, or the open ground outside.
  // People step aside, so only furniture stands in the way.
  const outdoors = (x: number, y: number) =>
    x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y) && !barred.has(`${x},${y}`) && !fixtures.blocked.has(`${x},${y}`) && !street.ambientBlocked.has(`${x},${y}`)
    && ![...street.signs, ...street.decor, ...street.folk, ...street.caches, ...street.rigs].some((thing) => thing.x === x && thing.y === y);
  // Where the people of an encounter are (their squares), where one comes in from (a way out of the district, or
  // the edge of the ground), and the squares a gang stands on round the party in its alley
  const folkAt = useRef<Record<string, Sq>>({});
  // (what a hangar's berths and roof doors do at any minute, and where the party and the people of an encounter stand, read by the play-through test)
  useEffect(() => {
    (window as unknown as { __street?: unknown }).__street = Object.assign(() => ({ party: { ...feet.current }, folk: { ...folkAt.current } }), {
      // The hours of a day in which a gang waits in the alley, in a lawless district
      ambushHours: (alley: Rect, day: number) => (district ? Array.from({ length: 24 }, (_, h) => h).filter((h) => ambushIn(world, district, alley, day, h)) : []),
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
      return lx >= 0 && ly >= 0 && lx < l.width && ly < l.height && standsAt(l, lx, ly) && !shown.some((a) => !a.side && a.blocks && a.x <= lx && lx < a.x + a.w && a.y <= ly && ly < a.y + a.h);
    }
    return outdoors(x, y);
  };

  // Where they stand on arriving: where they stood, if they came from another part of this
  // building (so through a door they come out just beyond it); else at the way in
  const spot = usePartySpot();
  const entry = useMemo(() => {
    if (!present) return { x: 0, y: 0 };
    const last = usePartySpot.getState();
    const from = last.areaId ? world.areas[last.areaId] : undefined;
    if (from && (buildingIds.has(from.id) || buildingIds.has(from.parentId ?? ""))) return nearestOpen(open, last);
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
  // Where the camera looks when the party is out of doors: at the party
  const eye = useRef<V3 | null>(null);
  const walk = useRef<{ path: { x: number; y: number }[]; then?: (squares: number) => void; total: number } | null>(null);
  // Over the shoulder or from the eyes (interiors/ViewRig.tsx), instead of the overhead view; `facing` is the way the character looks then
  const mode = useView((v) => v.mode);
  const tierNow = useQuality((q) => q.tier);
  const viewing = mode !== "overhead" && present && !duel;
  const facing = useRef<number | null>(null);
  useEffect(() => {
    if (!present) return;
    walk.current = null;
    feet.current = { x: entry.x, y: entry.y };
    spot.stand(hereId, entry.x, entry.y);
  }, [hereId, present]);
  // After a fight the party stands where the fight left them
  useEffect(() => {
    if (!walk.current && spot.areaId === hereId) feet.current = { x: spot.x, y: spot.y };
  }, [spot.x, spot.y, spot.areaId]);
  // How high the party stands: on the floor of the room they are in, up the steps of a stairwell
  const heightNow = () => {
    const l = inside?.layout;
    return l ? floorAt(l, feet.current.x - l.x + 0.5, feet.current.y - l.y + 0.5) : 0;
  };
  useFrame((_, delta) => {
    const going = walk.current;
    if (token.current) {
      token.current.position.set(feet.current.x + 0.5, heightNow(), feet.current.y + 0.5);
      // From the eyes the character is not drawn; over the shoulder they face where the camera looks
      token.current.visible = !(viewing && mode === "first");
      if (viewing && facing.current !== null) token.current.rotation.y = facing.current;
    }
    eye.current = duelRef.current ? [(duelRef.current.x ?? 0) + 0.5 - cx, (duelRef.current.z ?? 0) * LEVEL_H, (duelRef.current.y ?? 0) + 0.5 - cz] : outside && planned ? [feet.current.x + 0.5 - cx, 0, feet.current.y + 0.5 - cz] : null;
    if (!going) return;
    let step = Math.min(delta, 0.5) * 7;
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
  const roomSetting = useMemo((): Setting | null => {
    const l = opened?.layout;
    if (!l) return null;
    const isWayAt = (s: Sq) => l.assets.some((w) => w.side && w.x === s.x && w.y === s.y);
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < l.width && y < l.height && !l.assets.some((a) => !a.side && a.blocks && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
    const spots = (squares: Sq[]) => squares.filter((q) => free(q.x, q.y) && !isWayAt(q));
    const uses = opened!.tags.filter((t) => t.startsWith("use:")).map((t) => t.slice(4));
    return {
      open: free,
      seats: l.assets.filter((a) => a.kind === "furniture" && uses.includes(a.name) && !isCounter(a)).map((a) => ({ id: a.id, centre: [a.x + a.w / 2, 0, a.y + a.h / 2] as V3, spots: spots(aroundSquares(a.x, a.y, a.w, a.h)) })),
      counters: l.assets.filter(isCounter).map((a) => ({ asset: a, front: spots(counterSides(l, a).front), behind: spots(counterSides(l, a).behind) })),
      stage: l.assets.filter((a) => a.name === "Bandstand").flatMap((a) => Array.from({ length: a.w * a.h }, (_, i) => ({ x: a.x + (i % a.w), y: a.y + Math.floor(i / a.w) }))),
      stageHeight: 0.22,
      round: [{ x: 1, y: 1 }, { x: l.width - 2, y: 1 }, { x: l.width - 2, y: l.height - 2 }, { x: 1, y: l.height - 2 }].map((c) => nearestOpen((x, y) => free(x, y) && !isWayAt({ x, y }), c)),
      watch: { x: Math.floor(l.width / 2), y: Math.floor(l.height / 2) },
      doors: l.assets.filter((a) => a.kind === "door" || a.kind === "exit").map((a) => ({ x: a.x, y: a.y })),
    };
  }, [opened?.id, world]);
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
    if (p?.squads?.length && minutes >= p.arrivesAt && minutes < p.searchUntil) sources.push({ squads: p.squads, label: "(after the party)" });
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
  const strolls = useMemo((): Stroll[] => {
    if (!plan || !districtPlan || buildings.length < 2) return [];
    const doors = buildings.map((b) => street.doors[b.id]?.door).filter((d): d is { x: number; y: number } => !!d);
    if (doors.length < 2) return [];
    const count = Math.min(8, buildings.length * 2);
    const out: Stroll[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(unitOf(`${district!.id}|stroll|${i}|a`) * doors.length);
      let b = Math.floor(unitOf(`${district!.id}|stroll|${i}|b`) * doors.length);
      if (b === a) b = (b + 1) % doors.length;
      const from = nearestOpen(outdoors, doors[a]);
      const to = nearestOpen(outdoors, doors[b]);
      const path = route(outdoors, from, [to]);
      if (!path || !path.length) continue;
      const full = [from, ...path];
      let length = 0;
      for (let k = 1; k < full.length; k++) length += Math.hypot(full[k].x - full[k - 1].x, full[k].y - full[k - 1].y);
      out.push({ key: `stroll-${i}`, path: full, length, offset: unitOf(`${district!.id}|stroll|${i}|t`) * length * 2 });
    }
    return out;
  }, [world, district?.id ?? building.id, street]);
  // Hostiles who have noticed the party stop and watch it
  const watching = (area: Area | undefined, o: Occupant) => !!area && o.disposition === "hostile" && !!o.hitPoints && !area.allowed && (area.alert ?? (area === inside ? ALERT.confronting : -1)) >= ALERT.questioning;

  // Walk to a square, or up to something that stands on the given squares, then do what was asked
  const active = present && !locked && !duel;
  const walkTo = (goals: { x: number; y: number }[], then?: (squares: number) => void) => {
    if (!active) return;
    const from = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
    // Loose flagstones have to be stepped on to be felt, so the path is not pulled straight over them
    const traps = inside ? new Set(trapsIn(inside, false).map((t) => `${inside.layout!.x + t.x},${inside.layout!.y + t.y}`)) : undefined;
    const path = route(open, from, goals.filter((g) => open(g.x, g.y) || (g.x === from.x && g.y === from.y)), { keep: traps });
    if (!path) onAct?.({ type: "note", text: gangRing.length ? "The gang bars the way out of the alley." : "There is no way through to there." });
    else walk.current = { path, then, total: path.length };
  };
  // A step the way a stick or key points, queued into the walk (so that flagstones, secret ways and arrivals all still happen): the
  // eight directions of the grid, a diagonal only past two open squares, a blocked one slid along a wall
  const stepToward = (dx: number, dz: number) => {
    if (!active) return;
    const queued = walk.current;
    if (queued && queued.path.length > 1) return;
    const from = queued ? queued.path[queued.path.length - 1] : { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
    const octant = ((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8;
    const [sx, sy] = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]][octant];
    const tries = sx && sy ? [[sx, sy], [sx, 0], [0, sy]] : [[sx, sy]];
    for (const [mx, my] of tries) {
      const next = { x: from.x + mx, y: from.y + my };
      if (!open(next.x, next.y) || (mx && my && !(open(from.x + mx, from.y) && open(from.x, from.y + my)))) continue;
      walk.current = { path: [...(queued?.path ?? []), next], then: queued?.then, total: (queued?.total ?? 0) + 1 };
      return;
    }
  };
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
    } else if (a.kind === "window") onAct?.({ type: "note", text: "A window onto the street outside." });
    else if (a.kind === "stairs") walkTo([{ x: l.x + a.x, y: l.y + a.y }], () => a.to && onAct?.({ type: "go", areaId: a.to }));
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
    if (a.kind === "window") walkTo(at, () => onAct?.({ type: "look", areaId: room.id }));
    else if (a.kind === "exit" || a.kind === "secret") walkTo(at, (squares) => {
      // Going in at the place a person in need was to be taken to, with them close behind, is taking them there
      const them = enc?.kind === "help" && enc.phase === "follow" && enc.target === room.parentId ? folkAt.current[enc.id] : undefined;
      const delivered = !!them && Math.hypot(them.x - feet.current.x, them.y - feet.current.y) <= 40;
      if (delivered) onAct?.({ type: "encounter", step: "delivered" });
      setTimeout(() => onAct?.({ type: "go", areaId: room.id, secret: a.kind === "secret", squares }), delivered ? 120 : 0);
    });
    else onAct?.({ type: "note", text: `${a.name}: a passage between two parts of the building.` });
  };
  const wayColor = (a: RoomAsset) => (a.kind === "door" && world.paths.find((p) => p.id === a.ref)?.locked ? WAY_COLORS.locked : WAY_COLORS[a.kind as keyof typeof WAY_COLORS] ?? WAY_COLORS.door);
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
  // The squares of the ground, as faint lines
  const squares = useMemo(() => {
    const points: number[] = [];
    for (let x = 0; x <= ground.w; x++) points.push(ground.x + x, 0, ground.y, ground.x + x, 0, ground.y + ground.h);
    for (let y = 0; y <= ground.h; y++) points.push(ground.x, 0, ground.y + y, ground.x + ground.w, 0, ground.y + y);
    return new Float32Array(points);
  }, [ground.x, ground.y, ground.w, ground.h]);
  const floor = floorOf((opened ? world.areas[opened.parentId ?? ""] : me)?.type ?? building.type);
  // The rooms that have a roof of their own over them (a platform to climb to, shown on top of them)
  const roofed = new Set<string>();
  for (const room of rooms) {
    if (formOf(room) !== "roof" || !room.layout) continue;
    const under = rooms.find((o) => o !== room && o.layout && !formOf(o) && o.layout.x === room.layout!.x && o.layout.y === room.layout!.y && o.layout.width === room.layout!.width && o.layout.height === room.layout!.height && (o.layout.level ?? 0) + 1 === room.layout!.level);
    if (under) roofed.add(under.id);
  }
  const sizeOfGround = Math.max(240, ground.w + 80, ground.h + 80);
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

  return (
    <>
      <group position={[-cx, 0, -cz]}>
        {/* The earth round a cellar being looked into */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, levelY(opened?.layout) - 0.22, cz]} visible={underground}>
          <planeGeometry args={[sizeOfGround, sizeOfGround]} />
          <meshBasicMaterial color="#14100c" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.06, cz]} visible={!underground}>
          <planeGeometry args={[sizeOfGround, sizeOfGround]} />
          <meshBasicMaterial color={GROUND[biome] ?? "#1c222b"} />
        </mesh>
        {/* The ground round the building: a tap walks there */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} visible={!underground} receiveShadow onClick={tappable ? (e) => { e.stopPropagation(); if (e.delta <= 8) walkTo([{ x: Math.floor(e.point.x + cx), y: Math.floor(e.point.z + cz) }]); } : undefined}>
          <planeGeometry args={[ground.w, ground.h]} />
          <meshLambertMaterial color={new THREE.Color(GROUND[biome] ?? "#1c222b").multiplyScalar(1.5)} />
        </mesh>
        {districtPlan && buildings.map((b) => {
          const box = districtPlan.boxes[b.id];
          return box ? (
            <mesh key={`lot-${b.id}`} rotation={[-Math.PI / 2, 0, 0]} position={[box.x + box.width / 2, -0.005, box.y + box.height / 2]} visible={!underground} raycast={() => null}>
              <planeGeometry args={[box.width + 1, box.height + 1]} />
              <meshLambertMaterial color={new THREE.Color(GROUND[biome] ?? "#1c222b").multiplyScalar(0.9)} />
            </mesh>
          ) : null;
        })}
        <lineSegments visible={!underground}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={squares.length / 3} array={squares} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.07} />
        </lineSegments>

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
                  mood={formOf(room) || openAir(room) ? undefined : { buildingType: building.type, roomName: room.name, biome }}
                  width={l.width}
                  height={l.height}
                  assets={shown}
                  floor={floor}
                  wall={wall}
                  ships={room.ships}
                  bay={{ room, based: based[room.id] }}
                  fullWalls={viewing}
                  ceiling={viewing && !openAir(room)}
                  looted={(a) => { const c = room.loot.find((c) => c.id === a.ref); return !!c && (c.node ? nodeAt(c.node, minutes).charges === 0 : !!c.looted); }}
                  nodeOf={(a) => room.loot.find((c) => c.id === a.ref)?.node}
                  wayColor={wayColor}
                  wayLabel={wayLabel}
                  onFloor={inside ? (x, y) => walkTo([{ x: l.x + x, y: l.y + y }]) : undefined}
                  onAsset={inside ? actOn : undefined}
                >
                  {roomSetting && !duel && (
                    <Life
                      people={[
                        ...shown.filter((a) => a.kind === "npc").map((a) => ({ key: a.id, occupant: room.occupants.find((o) => o.id === a.ref)!, at: { x: a.x, y: a.y } as Sq | null })),
                        // Someone whose day brings them here from elsewhere takes a free seat
                        ...room.occupants.filter((o) => !l.assets.some((a) => a.kind === "npc" && a.ref === o.id)).map((o) => ({ key: `v-${o.id}`, occupant: o, at: null })),
                      ]}
                      setting={roomSetting}
                      party={() => (inside ? { x: Math.round(feet.current.x) - l.x, y: Math.round(feet.current.y) - l.y } : null)}
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
          if (opened?.layout && levelY(l) > levelY(opened.layout) + 0.01 && sameFootprint(l, opened.layout) && !galleryOfOpened) return null;
          // A room seen from outside it: closed, with what is set in its outside walls
          const form = formOf(room);
          // A room looked down into from its gallery is seen low, so that the gallery shows over it
          const lookedFrom = opened && formOf(opened) === "gallery" && opened.tags.includes(`host:${room.id}`);
          // (a room with the opened one standing right on it keeps its full height, so that there is no gap under the floor)
          const storeys = l.tall ? 2 : 1;
          const carries = !!opened?.layout && sameFootprint(l, opened.layout) && levelY(opened.layout) >= levelY(l) + LEVEL_H * storeys - 0.01;
          // (a room with a mezzanine is two floors high, so that those on the gallery have the roof well over their heads;
          // while another room is opened it is lowered a little, but still clears a figure on the gallery)
          const tall = lookedFrom ? WALL_HEIGHT : opened && !carries ? (l.tall ? LEVEL_H * 1.3 : LEVEL_H / 2) : LEVEL_H * storeys;
          // (the floor of an opened room above, or of a roof, is a slab 0.2 thick with the same footprint, and
          // sits on this room: the block stops where the slab starts, so that their faces are never in one plane)
          const sunk = carries ? 0.2 : roofed.has(room.id) ? 0.18 : 0;
          const body = tall + rise(l) - sunk;
          const lift = levelY(l);
          const roof = hue(room.id);
          const wallColor = new THREE.Color(wall).multiplyScalar(opened ? 0.45 : 1).getStyle();
          const slab = (color: string) => <Box at={[l.width / 2, 0.06, l.height / 2]} size={[l.width, 0.12, l.height]} color={color} />;
          const rail = (h: number) => (
            <>
              <Box at={[l.width / 2, h, 0.04]} size={[l.width, 0.04, 0.05]} color="#c8ccd2" />
              <Box at={[l.width / 2, h, l.height - 0.04]} size={[l.width, 0.04, 0.05]} color="#c8ccd2" />
              <Box at={[0.04, h, l.height / 2]} size={[0.05, 0.04, l.height]} color="#c8ccd2" />
              <Box at={[l.width - 0.04, h, l.height / 2]} size={[0.05, 0.04, l.height]} color="#c8ccd2" />
            </>
          );
          const hollow = (h: number, color: string) => (
            <>
              <Box at={[l.width / 2, h / 2, 0.08]} size={[l.width, h, 0.16]} color={color} />
              <Box at={[l.width / 2, h / 2, l.height - 0.08]} size={[l.width, h, 0.16]} color={color} />
              <Box at={[0.08, h / 2, l.height / 2]} size={[0.16, h, l.height]} color={color} />
              <Box at={[l.width - 0.08, h / 2, l.height / 2]} size={[0.16, h, l.height]} color={color} />
            </>
          );
          return (
            <group key={room.id} position={[l.x, lift, l.y]}>
              {/* What an upper floor stands on */}
              {lift > 0.01 && form !== "gallery" && form !== "walkway" && <Box at={[l.width / 2, -lift / 2, l.height / 2]} size={[l.width - 0.1, lift, l.height - 0.1]} color={new THREE.Color(wall).multiplyScalar(0.7).getStyle()} />}
              {form === "roof" ? (
                <group position={[0, 0.02, 0]} onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  <RoomShell plan={l} width={l.width} height={l.height} assets={seen(room).filter((a) => a.kind !== "npc")} floor={floor} wall={wall} wayColor={wayColor} wayLabel={() => undefined} style={style} corners={(() => { const under = rooms.find((o) => roofed.has(o.id) && o.layout!.x === l.x && o.layout!.y === l.y && o.layout!.width === l.width && o.layout!.height === l.height); return under ? radiiOf(under) : undefined; })()} />
                  {/* Who stands on it, to be seen from the street */}
                  {!duel && l.assets.filter((a) => a.kind === "npc").map((a) => {
                    const o = room.occupants.find((x) => x.id === a.ref);
                    return o ? (
                      <group key={a.id} position={[a.x + 0.5, 0, a.y + 0.5]}>
                        <Figure kind={tokenOf(o)} ring={SIDE_COLORS[o.disposition]} name={o.name} large={isLarge(o.size)} species={o.species} role={o.role} creature={o.creature} size={o.size} />
                        <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS[o.disposition]}>{o.name}</Label>
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} label={o.name} />
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
                  {rail(0.5)}
                  {/* Posts it stands on, down to the street */}
                  {lift > 0.01 && [[0.1, 0.1], [l.width - 0.1, 0.1], [0.1, l.height - 0.1], [l.width - 0.1, l.height - 0.1]].map(([px, pz], i) => <Box key={i} at={[px, -lift / 2, pz]} size={[0.1, lift, 0.1]} color="#59636d" />)}
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
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} label={o.name} />
                      </group>
                    ) : null;
                  })}
                  <Box at={[l.width / 2, 0.45, l.height - 0.04]} size={[l.width, 0.04, 0.05]} color="#c8ccd2" />
                  {[0, 1, 2, 3].map((i) => <Box key={i} at={[0.1 + (i * (l.width - 0.2)) / 3, 0.25, l.height - 0.04]} size={[0.05, 0.5, 0.05]} color="#c8ccd2" />)}
                </group>
              ) : lookedFrom ? (
                // The room under a mezzanine is looked down into, not boxed in: its floor, low walls and what is in it
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  <RoomShell plan={l} width={l.width} height={l.height} assets={seen(room).filter((a) => a.kind !== "npc")} floor={floor} wall={wall} ships={room.ships} bay={{ room, based: based[room.id] }} wayColor={wayColor} wayLabel={() => undefined} />
                  {!duel && l.assets.filter((a) => a.kind === "npc").map((a) => {
                    const o = room.occupants.find((x) => x.id === a.ref);
                    return o ? (
                      <group key={a.id} position={[a.x + 0.5, 0, a.y + 0.5]}>
                        <Figure kind={tokenOf(o)} ring={SIDE_COLORS[o.disposition]} name={o.name} large={isLarge(o.size)} species={o.species} role={o.role} creature={o.creature} size={o.size} />
                        <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS[o.disposition]}>{o.name}</Label>
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} label={o.name} />
                      </group>
                    ) : null;
                  })}
                </group>
              ) : l.roof ? (
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  {/* Open to the sky, the ships inside it to be seen; where the air is no good, doors in the roof slide back */}
                  <Box at={[l.width / 2, 0.04, l.height / 2]} size={[l.width, 0.08, l.height]} color={FLOORS.hangar} />
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
                      <CaveMound mask={l.mask} exits={l.assets.filter((a) => a.kind === "exit").map((a) => ({ x: a.x, y: a.y }))} w={l.width} h={l.height} biome={biome} tier={tierNow} seed={l.width * 31 + l.height} />
                    ) : (
                    <RoomBlock w={l.width} d={l.height} height={body} radii={form ? [0, 0, 0, 0] : radiiOf(room)} wall={wallColor} roof={roofed.has(room.id) ? undefined : opened ? "#1a2028" : "#4a525c"} parapet={!opened && !form && !roofed.has(room.id)} band={style.band && !opened && !form} />
                    )}
                  </group>
                  {!opened && !form && !roofed.has(room.id) && !(building.type === "cave" && l.mask) && (
                    <>
                      {/* What stands on the roof */}
                      {/* (a tower of a palace is capped with a spire, its great hall with a dome) */}
                      {/tower/i.test(room.name) ? <group position={[l.width / 2, tall + 0.1, l.height / 2]}><Cyl at={[0, 1.4, 0]} r={Math.min(l.width, l.height) * 0.42} h={2.8} color={paletteOf(biome).canvas[0]} top={0.03} /><Cyl at={[0, 3.0, 0]} r={0.04} h={0.8} color="#d8b45a" /></group>
                        : /audience chamber/i.test(room.name) && building.type === "palace" ? <group position={[l.width / 2, tall + 0.1, l.height / 2]}><DomeRoof r={Math.min(l.width, l.height) * 0.4} color={wall} /></group>
                        : room.gateway ? <group position={[l.width / 2, tall + 0.1, l.height / 2]}><DomeRoof r={Math.min(l.width, l.height) * 0.3} color={wall} /></group>
                        : roof % 3 === 0 ? <><Box at={[l.width * 0.3, tall + 0.35, l.height * 0.35]} size={[1, 0.5, 0.8]} color="#59636d" /><Cyl at={[l.width * 0.3, tall + 0.65, l.height * 0.35]} r={0.25} h={0.1} color="#2b2f36" /></>
                        : roof % 3 === 1 ? <Mast at={[l.width * 0.7, tall + 0.1, l.height * 0.6]} h={1.8} />
                        : <Cyl at={[l.width * 0.6, tall + 0.4, l.height * 0.4]} r={0.5} h={0.6} color="#59636d" />}
                    </>
                  )}
                </>
              )}
              {!opened && form !== "roof" && l.assets.filter((a) => a.side && (a.kind === "exit" || a.kind === "window" || (a.kind === "secret" && room.secretEntry?.found) || (a.kind === "door" && !inRoom(beyond(l, a).x, beyond(l, a).y)))).map((a) => {
                const at = onWall(l, a);
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
                    <Doorway kind={a.kind} color={a.kind === "exit" && shut.has(room.parentId ?? "") ? WAY_COLORS.locked : WAY_COLORS[a.kind as keyof typeof WAY_COLORS]} label={a.kind === "exit" ? (shut.has(room.parentId ?? "") ? "Locked for the night" : a.name === "Way out" ? "Way in" : "Back way in") : a.kind === "secret" ? a.name : undefined} onTap={tappable ? () => actOutside(room, a) : undefined} style={style} />
                  </group>
                  </group>
                );
              })}
              {(reveal || (opened && shown.some((a) => a.to === room.id))) && <Label at={[l.width / 2, tall + 0.6, l.height / 2]} size={0.36} color="#aabbdd">{room.name}</Label>}
            </group>
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
                start={enc.phase === "approach" ? encounterSpawn() : nearestOpen(outdoors, { x: squareOf(feet.current).x + 1, y: squareOf(feet.current).y + 1 })}
                goal={() => squareOf(feet.current)}
                stop={enc.phase === "follow" ? 1.9 : 1.6}
                speed={enc.phase === "follow" ? 6.2 : 3.6}
                warp={enc.phase === "follow"}
                open={outdoors}
                at={folkAt}
                onArrive={enc.phase === "approach" ? () => onAct?.({ type: "encounter", step: "met" }) : undefined}
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
            {!duel && <Strollers strolls={strolls} />}
            {street.rigs.map(({ v, mine, outward, x, y }) => (
              <group key={v.id} position={[x + 0.5, 0, y + 0.5]} rotation={[0, Math.atan2(outward.x || 0.0001, outward.y || 0.0001), 0]}>
                <SpeederModel model={v.model} wrecked={v.status === "wrecked"} />
                <Label at={[0, 1.5, 0]} size={0.26} color={mine ? SIDE_COLORS.player : SIDE_COLORS.neutral}>{`${v.name}${v.status === "wrecked" ? " (wreck)" : ""}`}</Label>
                {tappable && <Hit at={[0, 0.5, 0]} size={[1.6, 1.2, 2.4]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "vehicle", id: v.id }))} label={v.name} />}
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

        {duel && <DuelPieces />}
        {present && !duel && (
          <group ref={token} position={[standing.x + 0.5, 0, standing.y + 0.5]}>
            <Figure kind="player" ring={SIDE_COLORS.player} marker />
          </group>
        )}
        {present && !duel && (((world as World & { party?: Companion[] }).party ?? []) as Companion[]).map((c, i) => (
          <Follower key={c.id} companion={c} index={i} feet={feet} open={open} height={heightNow} onTap={active ? () => onAct?.({ type: "companion", id: c.id }) : undefined} />
        ))}
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
          if (what === "sq") return [Number(id.split(",")[0]) + 0.5 - cx, levelY(inside?.layout), Number(id.split(",")[1]) + 0.5 - cz];
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
            return [l.x + at.x - cx, levelY(l) + 0.6, l.y + at.z - cz];
          }
          return undefined;
        }}
      />
      {mode !== "overhead" && viewing ? (
        <ViewRig mode={mode} start={startYaw()} feet={() => [feet.current.x + 0.5 - cx, heightNow(), feet.current.y + 0.5 - cz]} facing={facing} step={stepToward} />
      ) : (
        <Rig target={focus} offset={opened ? [0, reach * 0.95, reach * 0.75] : [-reach * 0.75, reach * 0.75, reach * 0.6]} min={4} max={120} fov={45} follow={eye} />
      )}
      <Sky cast={!districtPlan || !!opened} indoors={opened && !openAir(opened) && !formOf(opened) ? 1 : 0} />
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
  const pickable = usePickable();
  const picked = objectId ? arena.assets.find((a) => a.id === objectId) : undefined;
  const current = combatants[currentTurn];
  const player = combatants.find((c) => c.isPlayer);
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !cannotAct(player!);
  const target = player ? pickTarget(combatants, player, targetId) : undefined;
  const steps = playerTurn && player ? reachable(arena, combatants, player) : new Map<string, { cost: number }>();
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
      {Array.from(steps.entries()).filter(([, step]) => step.cost > 0).map(([k]) => {
        const { x, y, z } = parseKey(k);
        return (
          <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x + 0.5, high(z) + 0.05, y + 0.5]} onClick={(e) => { e.stopPropagation(); if (e.delta <= 8) moveTo(x, y, z); }}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.35} depthWrite={false} />
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
          <group key={String(c.id)} position={[(c.x ?? 0) + 0.5, high(c.z), (c.y ?? 0) + 0.5]}>
            <group rotation={down ? [-Math.PI / 2, 0, 0.4] : [0, c.isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]} position={[0, down ? 0.14 : 0, 0]}>
              <Figure kind={tokenOf({ name: c.name, role: c.role, creature: c.creature, isPlayer: c.isPlayer, forceUser: c.role === "force" })} ring={side} name={c.name} large={large} marker={c.isPlayer && !down} species={c.species} role={c.role} creature={c.creature} size={c.size} player={!!c.isPlayer} />
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
          </group>
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

export function FightScene({ wall = STEEL, areaId, origin }: { wall?: string; areaId?: string | null; origin?: { x: number; y: number } }) {
  const { combatants, currentTurn, arena, targetId, moveTo, setTarget, objectId, setObject } = useCombat();
  const pickable = usePickable();
  const picked = objectId ? arena.assets.find((a) => a.id === objectId) : undefined;
  const current = combatants[currentTurn];
  const player = combatants.find((c) => c.isPlayer);
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !cannotAct(player!);
  const target = player ? pickTarget(combatants, player, targetId) : undefined;
  const steps = playerTurn && player ? reachable(arena, combatants, player) : new Map<string, { cost: number }>();
  const covered = player && target && player.rangedDice ? attackPlan(arena, combatants, player, target, "ranged").cover.bonus > 0 : false;
  const cx = arena.width / 2;
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
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.22, cz]}>
          <planeGeometry args={[240, 240]} />
          <meshBasicMaterial color="#0b0f16" />
        </mesh>
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
          {Array.from(steps.entries()).filter(([, step]) => step.cost > 0).map(([k]) => {
            const { x, y, z } = parseKey(k);
            return (
              <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x + 0.5, z * LEVEL_H + 0.1, y + 0.5]}>
                <planeGeometry args={[0.9, 0.9]} />
                <meshBasicMaterial color="#4ade80" transparent opacity={0.28} depthWrite={false} />
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
              <group key={String(c.id)} position={[(c.x ?? 0) + 0.5, (c.z ?? 0) * LEVEL_H + ((c.z ?? 0) ? 0.12 : 0), (c.y ?? 0) + 0.5]}>
                {/* The fallen lie where they fell */}
                <group rotation={down ? [-Math.PI / 2, 0, 0.4] : [0, c.isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]} position={[0, down ? 0.14 : 0, 0]}>
                  <Turner facing={facing} on={viewing && !!c.isPlayer && !down} base={Math.PI / 2} hide={viewing && mode === "first" && !!c.isPlayer}>
                  <Figure kind={tokenOf({ name: c.name, role: c.role, creature: c.creature, isPlayer: c.isPlayer, forceUser: c.role === "force" })} ring={side} name={c.name} large={large} marker={c.isPlayer && !down} species={c.species} role={c.role} creature={c.creature} size={c.size} player={!!c.isPlayer} />
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
              </group>
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
        <Rig target={[0, 0, 0]} offset={[0, reach * 0.95, reach * 0.75]} min={4} max={90} fov={45} />
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
  // A road over the ground between two places (bent over the curve of a globe)
  const road = (from: V3, to: V3): V3[] => Array.from({ length: 13 }, (_, i) => {
    const [x, z] = [from[0] + ((to[0] - from[0]) * i) / 12, from[2] + ((to[2] - from[2]) * i) / 12];
    return [x, lift(x, z) + 0.12, z];
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
      return [{ key: `${m.kind}-${m.id}`, from: [pa[0] + lift[0], pa[1] + lift[1], pa[2] + lift[2]] as V3, to: [pb[0] + lift[0], pb[1] + lift[1], pb[2] + lift[2]] as V3, progress: m.progress, kind, name: m.name, arc: kind === "ship" ? 6 : 0, scale: kind === "person" ? 1.6 * span : kind === "ship" ? 1.4 : 1.5 }];
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
          <mesh position={[0, -GLOBE, 0]}>
            <sphereGeometry args={[GLOBE - 0.05, 64, 48]} />
            <meshLambertMaterial color={new THREE.Color(BIOME_COLOR[view.type] ?? "#5fa56a").multiplyScalar(0.5)} />
          </mesh>
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
      {!system && !globe && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
            <planeGeometry args={[600, 600]} />
            <meshBasicMaterial color={GROUND[biome] ?? "#0b1220"} />
          </mesh>
          <gridHelper args={[300, 60, "#1f2a44", "#162036"]} position={[0, -0.5, 0]} />
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
                <SpeederModel model={v.model} wrecked={v.status === "wrecked"} />
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
      {hereId === view.id && (
        <group position={partySpot}>
          <group scale={2.6}><Figure kind="player" ring={SIDE_COLORS.player} marker /></group>
          {(((world as World & { party?: Companion[] }).party ?? []) as Companion[]).map((c, i) => (
            <group key={c.id} position={[3.4 + i * 2.8, 0, 0.8]} scale={2.2}>
              <Figure kind={tokenOf({ name: c.name, role: c.kind === "droid" ? "utility droid" : c.kind === "beast" ? "wildlife" : c.role, creature: c.creature })} ring={SIDE_COLORS.friendly} name={c.name} species={c.species} role={c.role} creature={c.creature} size={c.size} />
            </group>
          ))}
          {parkedAt(view.id).map((v, i) => (
            <group key={v.id} position={[-6 - i * 3.4, 0, 1]} scale={2.2}>
              <SpeederModel model={v.model} wrecked={v.status === "wrecked"} />
            </group>
          ))}
          <Label at={[0, 5.4, 0]} size={1.1} color="#facc15">{`${PARTY_AT[view.kind] ?? "Here"} (you are here)`}</Label>
        </group>
      )}
      <Walkers walkers={walkers} />
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
        <Sky shadow={60} />
      )}
    </>
  );
}

const LAYER_NAME: Record<string, string> = { settlement: "Streets of", planet: "Surface of", system: "Orbits of" };

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
