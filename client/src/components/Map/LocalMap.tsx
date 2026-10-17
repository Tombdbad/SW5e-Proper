import { useRef, useState, useEffect, useMemo, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, useTexture, OrbitControls, PerspectiveCamera, Billboard, Line, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { useKeyboardControls } from "@react-three/drei";
import { create } from "zustand";
import { useMap } from "@/lib/stores/useMap";
import { useCombat, useShipFight, attackPlan, cannotAct, pickTarget, reachable, onPartySide, parseKey } from "@/lib/stores/useCombat";
import { type Companion, type PartyVehicle, type Vehicle, shipReach, SHIP_FACINGS } from "@shared/logic";
import { childrenOf, trailOf, exitsOf, floorPlan, createRandom, counterSides, isCounter, isLocal, formOf, openAir, districtAt, trapsIn, useKindOf, unitOf, ALERT, START_TIME, daylight, hourOf, blockadeAt, type Squad, type Mover, type Area, type Exit, type Occupant, type RoomAsset, type RoomLayout, type Ship, type World, type ResourceNode, nodeAt } from "@shared/logic";
import GalaxyMap, { Probe, Rig, useTaps, tapTime, type MapAction } from "./GalaxyMap";
import { floorOf, tokenOf, SIDE_COLORS, type FloorKind, type TokenKind } from "./sprites";

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

// The sky and the light over a place on a planet's surface, by the hour: a blue sky by day, warm
// light at dawn and dusk, and a dark sky with faint blue moonlight at night
const NIGHT_SKY = new THREE.Color("#05070c");
const DAY_SKY = new THREE.Color("#5d7fa3");
const DUSK_SKY = new THREE.Color("#b8683f");
function Sky({ shadow = 30, cast = true }: { shadow?: number; cast?: boolean }) {
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
      <ambientLight intensity={0.32 + 0.43 * light} color={light < 0.3 ? "#a9b8ff" : "#ffffff"} />
      <directionalLight position={sun} intensity={0.14 + 0.76 * light} color={twilight ? "#ffb27a" : light ? "#fff6e6" : "#8fa6ff"} castShadow={cast} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-shadow} shadow-camera-right={shadow} shadow-camera-top={shadow} shadow-camera-bottom={-shadow} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Models. Places are built from a few plain solids in the look of the setting: sand-coloured
// domes and vaporator masts in the desert, grey towers in the cities, bunkers with turrets,
// landing pads ringed with lights, tents, rock and broken columns in the wild.
// ---------------------------------------------------------------------------------------------

type V3 = [number, number, number];
const Solid = ({ at, color, glow, rot, children }: { at: V3; color: string; glow?: number; rot?: V3; children: ReactNode }) => (
  <mesh position={at} rotation={rot} castShadow>
    {children}
    <meshLambertMaterial color={color} emissive={color} emissiveIntensity={glow ?? 0.08} />
  </mesh>
);
const Box = ({ at, size, color, glow, rot }: { at: V3; size: V3; color: string; glow?: number; rot?: V3 }) => <Solid at={at} color={color} glow={glow} rot={rot}><boxGeometry args={size} /></Solid>;
const Cyl = ({ at, r, h, color, glow, top = r }: { at: V3; r: number; h: number; color: string; glow?: number; top?: number }) => <Solid at={at} color={color} glow={glow}><cylinderGeometry args={[top, r, h, 18]} /></Solid>;
const Dome = ({ at, r, color }: { at: V3; r: number; color: string }) => <Solid at={at} color={color}><sphereGeometry args={[r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></Solid>;
const Mast = ({ at, h = 2.2 }: { at: V3; h?: number }) => (
  <>
    <Cyl at={[at[0], at[1] + h / 2, at[2]]} r={0.06} h={h} color="#d7d2c4" />
    <Box at={[at[0], at[1] + h * 0.75, at[2]]} size={[0.5, 0.06, 0.06]} color="#d7d2c4" />
    <Box at={[at[0], at[1] + h * 0.5, at[2]]} size={[0.36, 0.06, 0.06]} color="#d7d2c4" />
  </>
);
const Tower = ({ at, r, h, color }: { at: V3; r: number; h: number; color: string }) => (
  <>
    <Cyl at={[at[0], h / 2, at[2]]} r={r} h={h} color={color} />
    <Cyl at={[at[0], h + 0.25, at[2]]} r={r * 0.6} h={0.5} color={color} top={0.05} />
    <Box at={[at[0], h * 0.6, at[2] + r]} size={[r * 0.5, 0.12, 0.04]} color="#ffd98a" glow={1} />
  </>
);
const Tent = ({ at, color }: { at: V3; color: string }) => <Solid at={[at[0], 0.6, at[2]]} color={color}><coneGeometry args={[0.8, 1.2, 6]} /></Solid>;
const Rock = ({ at, r, color = "#6d6a66" }: { at: V3; r: number; color?: string }) => <Solid at={[at[0], r * 0.6, at[2]]} color={color}><dodecahedronGeometry args={[r, 0]} /></Solid>;
const Hull = ({ color = "#8b9299" }: { color?: string }) => (
  <group rotation={[0, 0.5, 0.25]}>
    <Solid at={[0, 0.5, 0]} color={color}><capsuleGeometry args={[0.7, 2.2, 6, 12]} /></Solid>
    <Box at={[0.2, 1.1, 0.9]} size={[0.1, 1.2, 1]} color="#59636d" />
    <Box at={[0, 0.2, -0.6]} size={[0.5, 0.3, 0.5]} color="#2b2b2b" />
  </group>
);

// Wall colour by the world the place stands on
const WALLS: Record<string, string> = { desert: "#c9a56e", ice: "#cfd8dc", urban: "#8a94a3", volcanic: "#6b5a55", forest: "#a69f80", jungle: "#9aa080", swamp: "#8f9278", ocean: "#b8c4c8", barren: "#a59c8f", temperate: "#b9ad96", "gas giant": "#8f98a8" };
const GROUND: Record<string, string> = { desert: "#4a3a22", ice: "#39505c", urban: "#1c222b", volcanic: "#2a1a18", forest: "#1f3324", jungle: "#1a3a22", swamp: "#252f22", ocean: "#12303d", barren: "#33302c", temperate: "#26361f", "gas giant": "#1d2233" };
const STEEL = "#7b8794";

// A building of a settlement, by what kind of place it is
function BuildingModel({ type, wall }: { type: string; wall: string }) {
  if (/cantina/.test(type)) return <><Dome at={[0, 0, 0]} r={1.5} color={wall} /><Dome at={[1.3, 0, 0.7]} r={0.8} color={wall} /><Box at={[0, 0.4, 1.45]} size={[0.6, 0.8, 0.3]} color="#3a2c20" /><Box at={[0, 0.9, 1.5]} size={[0.5, 0.12, 0.05]} color="#5ad1ff" glow={1.2} /><Mast at={[-1.3, 0, -0.8]} /></>;
  if (/spaceport|landing|docking/.test(type)) {
    return (
      <>
        <Cyl at={[0, 0.1, 0]} r={2.3} h={0.2} color="#2c333b" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.22, 0]}><ringGeometry args={[1.7, 1.9, 32]} /><meshBasicMaterial color="#f0a03c" /></mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => <Box key={i} at={[Math.cos(i * 1.047) * 2.15, 0.28, Math.sin(i * 1.047) * 2.15]} size={[0.14, 0.14, 0.14]} color="#ff5a5a" glow={1.5} />)}
        {/spaceport|docking/.test(type) && <Tower at={[2.2, 0, -2]} r={0.4} h={2.6} color={/docking/.test(type) ? STEEL : wall} />}
        <group position={[0, 0.5, 0]} scale={0.5}><Hull color="#aeb6bd" /></group>
      </>
    );
  }
  if (/market|promenade/.test(type)) return <>{[[-0.9, -0.8, "#c8663a"], [0.9, -0.7, "#e8dcc0"], [-0.8, 0.9, "#4f8a8b"], [0.9, 0.9, "#c8663a"]].map(([x, z, c], i) => <group key={i}><Box at={[x as number, 0.4, z as number]} size={[1.1, 0.8, 1.1]} color={wall} /><Solid at={[x as number, 1.05, z as number]} color={c as string}><coneGeometry args={[1, 0.5, 4]} /></Solid></group>)}</>;
  if (/garrison|command post|operations|gate/.test(type)) {
    const gate = /gate/.test(type);
    return gate ? <><Box at={[-1.2, 1, 0]} size={[0.8, 2, 1]} color={wall} /><Box at={[1.2, 1, 0]} size={[0.8, 2, 1]} color={wall} /><Box at={[0, 1.9, 0]} size={[3.2, 0.4, 0.8]} color={wall} /><Box at={[0, 0.9, 0]} size={[1.5, 1.6, 0.1]} color="#f0a03c" glow={0.4} /></> : (
      <>
        <Cyl at={[0, 0.6, 0]} r={2} h={1.2} color="#59636d" top={1.6} />
        <Box at={[0, 1.5, 0]} size={[1.6, 0.7, 1.6]} color="#4a545f" />
        <Cyl at={[-1.3, 1.5, 1.1]} r={0.3} h={0.5} color="#2f363d" /><Box at={[-1.3, 1.6, 1.6]} size={[0.1, 0.1, 0.9]} color="#2f363d" />
        <Cyl at={[1.3, 1.5, -1.1]} r={0.3} h={0.5} color="#2f363d" /><Box at={[1.3, 1.6, -1.6]} size={[0.1, 0.1, 0.9]} color="#2f363d" />
        <Mast at={[0.4, 1.8, 0.3]} h={1.8} />
        <Box at={[0, 0.5, 1.95]} size={[0.8, 1, 0.1]} color="#e5484d" glow={0.6} />
      </>
    );
  }
  if (/medcenter/.test(type)) return <><Box at={[0, 0.8, 0]} size={[2.8, 1.6, 2]} color="#e9edf0" /><Dome at={[0, 1.6, 0]} r={0.9} color="#e9edf0" /><Box at={[0, 0.9, 1.02]} size={[2.8, 0.25, 0.05]} color="#5ad1ff" glow={1} /></>;
  if (/workshop|engineering/.test(type)) return <><Box at={[0, 0.7, 0]} size={[2.6, 1.4, 2]} color={/engineering/.test(type) ? STEEL : wall} /><Cyl at={[1.7, 0.7, 0.5]} r={0.5} h={1.4} color="#59636d" /><Cyl at={[-0.8, 1.9, -0.5]} r={0.2} h={1} color="#3b3f45" /><Box at={[0, 0.5, 1.02]} size={[1.2, 1, 0.05]} color="#f0a03c" glow={0.7} /></>;
  if (/residences|habitat/.test(type)) return <><Box at={[-0.6, 0.6, 0]} size={[1.6, 1.2, 1.8]} color={wall} /><Box at={[0.8, 1, -0.3]} size={[1.4, 2, 1.4]} color={wall} /><Dome at={[0.8, 2, -0.3]} r={0.6} color={wall} /><Box at={[-0.4, 1.5, 0.3]} size={[1, 0.6, 1]} color={wall} />{[0, 1, 2].map((i) => <Box key={i} at={[0.8, 0.5 + i * 0.55, 0.42]} size={[0.3, 0.2, 0.05]} color="#ffd98a" glow={1} />)}</>;
  if (/palace/.test(type)) return <><Cyl at={[0, 0.5, 0]} r={2.2} h={1} color={wall} /><Dome at={[0, 1, 0]} r={1.6} color={wall} />{[[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]].map(([x, z], i) => <Tower key={i} at={[x, 0, z]} r={0.35} h={2.4} color={wall} />)}</>;
  if (/warehouse|cargo/.test(type)) return <><Box at={[0, 0.6, 0]} size={[3.2, 1.2, 2]} color={STEEL} /><mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[1, 1, 3.2, 16, 1, false, 0, Math.PI]} /><meshLambertMaterial color="#59636d" /></mesh><Box at={[0, 0.5, 1.02]} size={[1.6, 1, 0.05]} color="#2f363d" /><Box at={[2, 0.3, 0.6]} size={[0.6, 0.6, 0.6]} color="#6f7448" /></>;
  if (/archive/.test(type)) return <><Tower at={[0, 0, 0]} r={1.1} h={3} color={wall} /><Cyl at={[0, 0.25, 0]} r={1.9} h={0.5} color={wall} /></>;
  if (/hideout/.test(type)) return <><Box at={[0, 0.35, 0]} size={[2.8, 0.7, 2.2]} color="#3b3f45" /><Box at={[0.6, 0.8, 0]} size={[1, 0.3, 1]} color="#2b2f34" /><Box at={[0, 0.3, 1.12]} size={[0.7, 0.6, 0.05]} color="#e5484d" glow={0.5} /><Rock at={[-1.8, 0, 0.8]} r={0.5} /></>;
  if (/camp/.test(type)) return <><Tent at={[-1, 0, -0.5]} color="#8a6f4a" /><Tent at={[1, 0, -0.3]} color="#7a6040" /><Tent at={[0, 0, 1.1]} color="#96794f" /><Box at={[0, 0.15, 0]} size={[0.3, 0.3, 0.3]} color="#ffb347" glow={2} /></>;
  if (/cave/.test(type)) return <><Rock at={[0, 0, 0]} r={1.9} /><Rock at={[1.6, 0, 0.8]} r={0.9} color="#5a5753" /><Solid at={[0, 0.6, 1.5]} color="#0a0a0a"><sphereGeometry args={[0.75, 12, 12]} /></Solid></>;
  if (/ruin/.test(type)) return <><Box at={[0, 0.1, 0]} size={[3.4, 0.2, 2.6]} color="#6d6a66" />{[[-1.3, -0.9, 2], [1.3, -0.9, 1.1], [-1.3, 0.9, 0.7], [1.3, 0.9, 1.7], [0, -0.9, 1.4]].map(([x, z, h], i) => <Cyl key={i} at={[x, h / 2 + 0.2, z]} r={0.24} h={h} color="#8a8680" />)}<Rock at={[0.3, 0, 0.5]} r={0.5} /></>;
  if (/wreck/.test(type)) return <><Hull /><Rock at={[1.6, 0, 1]} r={0.4} color="#3a3835" /></>;
  if (/trailhead/.test(type)) return <><Cyl at={[0, 0.8, 0]} r={0.08} h={1.6} color="#8a6f4a" /><Box at={[0.3, 1.3, 0]} size={[0.9, 0.35, 0.06]} color="#c9a56e" /><Rock at={[-0.8, 0, 0.5]} r={0.45} /></>;
  return <><Box at={[0, 0.7, 0]} size={[2.4, 1.4, 2.2]} color={wall} /><Dome at={[0, 1.4, 0]} r={0.8} color={wall} /></>;
}

// A settlement or wild site on a planet's surface
function SettlementModel({ type, wall }: { type: string; wall: string }) {
  if (/city/.test(type)) return <>{[[0, 0, 3.4, 0.5], [-1.1, 0.6, 2.2, 0.4], [1, -0.6, 2.6, 0.45], [0.9, 1, 1.5, 0.4], [-0.9, -1, 1.8, 0.35]].map(([x, z, h, r], i) => <Tower key={i} at={[x, 0, z]} r={r} h={h} color={i % 2 ? "#8a94a3" : "#a3adba"} />)}<Cyl at={[0, 0.1, 0]} r={2.3} h={0.2} color="#3b4654" /></>;
  if (/town/.test(type)) return <><Dome at={[0, 0, 0]} r={1.1} color={wall} /><Dome at={[1.4, 0, 0.5]} r={0.7} color={wall} /><Dome at={[-1.2, 0, 0.8]} r={0.8} color={wall} /><Box at={[0.3, 0.4, -1.3]} size={[1.2, 0.8, 0.9]} color={wall} /><Mast at={[-0.6, 0, -1.2]} /></>;
  if (/outpost/.test(type)) return <><Cyl at={[0, 0.5, 0]} r={1.6} h={1} color="#59636d" top={1.3} /><Mast at={[0, 1, 0]} h={2} /><Box at={[1.9, 0.3, 0]} size={[0.8, 0.6, 0.8]} color="#6f7448" /><Cyl at={[-2, 0.08, 0.6]} r={0.8} h={0.16} color="#2c333b" /></>;
  if (/station/.test(type)) return <><mesh position={[0, 1.4, 0]} rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[1.8, 0.28, 10, 32]} /><meshLambertMaterial color={STEEL} emissive={STEEL} emissiveIntensity={0.15} /></mesh><Cyl at={[0, 1.4, 0]} r={0.5} h={2.4} color="#a3adba" /><Box at={[0, 2.7, 0]} size={[0.2, 0.2, 0.2]} color="#ff5a5a" glow={2} /></>;
  if (/cave/.test(type)) return <><Rock at={[0, 0, 0]} r={1.6} /><Rock at={[1.5, 0, 0.5]} r={1} color="#5a5753" /><Rock at={[-1.3, 0, 0.9]} r={0.8} /><Solid at={[0.2, 0.5, 1.3]} color="#0a0a0a"><sphereGeometry args={[0.6, 12, 12]} /></Solid></>;
  if (/ruin/.test(type)) return <BuildingModel type="ruin" wall={wall} />;
  if (/crash/.test(type)) return <><Hull /><Box at={[1.8, 0.1, 1.2]} size={[0.8, 0.2, 0.5]} color="#59636d" /><Box at={[-1.6, 0.25, -0.5]} size={[0.3, 0.5, 0.3]} color="#ffb347" glow={1.5} /></>;
  if (/camp/.test(type)) return <BuildingModel type="camp" wall={wall} />;
  return <Dome at={[0, 0, 0]} r={1.4} color={wall} />;
}

// ---------------------------------------------------------------------------------------------
// People, droids and creatures, standing on a ring in the colour of their side. One unit is a
// 5-foot square; a person is a little over a unit tall. They face +z.
// ---------------------------------------------------------------------------------------------

const hue = (text: string) => Array.from(text).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 360, 7);
const SKIN = "#d9b99a";

function Humanoid({ body, head = SKIN, legs = "#2b2f36", robe }: { body: string; head?: string; legs?: string; robe?: boolean }) {
  return (
    <>
      {robe ? <Cyl at={[0, 0.3, 0]} r={0.26} top={0.16} h={0.6} color={body} /> : <><Box at={[-0.09, 0.26, 0]} size={[0.12, 0.52, 0.14]} color={legs} /><Box at={[0.09, 0.26, 0]} size={[0.12, 0.52, 0.14]} color={legs} /></>}
      <Box at={[0, 0.74, 0]} size={[0.36, 0.44, 0.2]} color={body} />
      <Box at={[-0.24, 0.72, 0]} size={[0.09, 0.42, 0.11]} color={body} />
      <Box at={[0.24, 0.72, 0]} size={[0.09, 0.42, 0.11]} color={body} />
      <Solid at={[0, 1.08, 0]} color={head}><sphereGeometry args={[0.13, 12, 10]} /></Solid>
    </>
  );
}

function Figure({ kind, ring, name = "", large, marker }: { kind: TokenKind; ring: string; name?: string; large?: boolean; marker?: boolean }) {
  const tone = `hsl(${hue(name || kind)}, 30%, 42%)`;
  let body: ReactNode;
  if (kind === "astromech") body = <><Cyl at={[0, 0.36, 0]} r={0.2} h={0.44} color="#e9edf0" /><Dome at={[0, 0.58, 0]} r={0.2} color="#3b6fb5" /><Box at={[-0.25, 0.28, 0]} size={[0.08, 0.5, 0.18]} color="#7b8794" /><Box at={[0.25, 0.28, 0]} size={[0.08, 0.5, 0.18]} color="#7b8794" /><Box at={[0, 0.66, 0.17]} size={[0.07, 0.07, 0.05]} color="#e5484d" glow={1.5} /></>;
  else if (kind === "battledroid") body = <><Box at={[-0.08, 0.3, 0]} size={[0.06, 0.6, 0.06]} color="#c9b48a" /><Box at={[0.08, 0.3, 0]} size={[0.06, 0.6, 0.06]} color="#c9b48a" /><Box at={[0, 0.76, 0]} size={[0.24, 0.32, 0.14]} color="#d8c59c" /><Box at={[0, 0.78, -0.12]} size={[0.16, 0.22, 0.1]} color="#a8956c" /><Box at={[-0.17, 0.7, 0.08]} size={[0.05, 0.36, 0.05]} color="#c9b48a" /><Box at={[0.17, 0.7, 0.08]} size={[0.05, 0.36, 0.05]} color="#c9b48a" /><Box at={[0, 1.04, 0.06]} size={[0.1, 0.12, 0.3]} color="#d8c59c" /><Box at={[0.17, 0.6, 0.3]} size={[0.04, 0.05, 0.42]} color="#22262b" /></>;
  else if (kind === "droid") body = <><Solid at={[0, 0.82, 0]} color="#2a2f36"><sphereGeometry args={[0.24, 14, 12]} /></Solid><Box at={[-0.09, 0.86, 0.2]} size={[0.08, 0.08, 0.06]} color="#e5484d" glow={2} /><Box at={[0.1, 0.84, 0.21]} size={[0.06, 0.06, 0.05]} color="#f0a03c" glow={2} />{[0, 1, 2, 3].map((i) => <Box key={i} at={[Math.cos(i * 1.57 + 0.8) * 0.2, 0.36, Math.sin(i * 1.57 + 0.8) * 0.2]} size={[0.04, 0.6, 0.04]} color="#7b8794" rot={[Math.sin(i * 1.57 + 0.8) * 0.3, 0, -Math.cos(i * 1.57 + 0.8) * 0.3]} />)}<Cyl at={[0.06, 1.16, 0]} r={0.012} h={0.3} color="#7b8794" /></>;
  else if (kind === "beast") body = <><Solid at={[0, 0.46, 0]} color={tone} rot={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.2, 0.44, 4, 10]} /></Solid>{[[-0.15, 0.24], [0.15, 0.24], [-0.15, -0.24], [0.15, -0.24]].map(([x, z], i) => <Box key={i} at={[x, 0.16, z]} size={[0.09, 0.32, 0.09]} color={tone} />)}<Solid at={[0, 0.62, 0.42]} color={tone}><sphereGeometry args={[0.17, 12, 10]} /></Solid><Solid at={[-0.1, 0.8, 0.44]} color="#e8dcc0" rot={[0.5, 0, 0.3]}><coneGeometry args={[0.035, 0.18, 6]} /></Solid><Solid at={[0.1, 0.8, 0.44]} color="#e8dcc0" rot={[0.5, 0, -0.3]}><coneGeometry args={[0.035, 0.18, 6]} /></Solid><Solid at={[0, 0.5, -0.5]} color={tone} rot={[-1.1, 0, 0]}><coneGeometry args={[0.05, 0.4, 6]} /></Solid></>;
  else if (kind === "horror") body = <><Solid at={[0, 0.5, 0]} color="#3a2545"><sphereGeometry args={[0.3, 14, 12]} /></Solid>{[0, 1, 2, 3, 4, 5].map((i) => <Solid key={i} at={[Math.cos(i * 1.05) * 0.34, 0.22, Math.sin(i * 1.05) * 0.34]} color="#5b3b6b" rot={[Math.sin(i * 1.05) * 0.9, 0, -Math.cos(i * 1.05) * 0.9]}><coneGeometry args={[0.07, 0.5, 6]} /></Solid>)}<Box at={[-0.1, 0.58, 0.27]} size={[0.07, 0.07, 0.05]} color="#e5484d" glow={2.5} /><Box at={[0.1, 0.58, 0.27]} size={[0.07, 0.07, 0.05]} color="#e5484d" glow={2.5} /></>;
  else if (kind === "swarm") body = <>{[[-0.2, 0.3, -0.1], [0.18, 0.5, -0.16], [0, 0.2, 0.08], [-0.16, 0.6, 0.2], [0.2, 0.34, 0.18], [0.02, 0.74, -0.04]].map(([x, y, z], i) => <Solid key={i} at={[x, y, z]} color={tone}><sphereGeometry args={[0.07, 8, 6]} /></Solid>)}</>;
  else if (kind === "crowd") body = <>{[[-0.2, -0.12, 20], [0.2, -0.06, 140], [0, 0.2, 260]].map(([x, z, h], i) => <group key={i} position={[x, 0, z]} scale={0.72}><Humanoid body={`hsl(${h}, 25%, 50%)`} /></group>)}</>;
  else if (kind === "hutt") body = <><mesh position={[0, 0.4, -0.05]} scale={[0.5, 0.45, 0.62]} castShadow><sphereGeometry args={[1, 16, 12]} /><meshLambertMaterial color="#7c8a4a" /></mesh><Solid at={[0, 0.16, -0.62]} color="#7c8a4a" rot={[-1.4, 0, 0]}><coneGeometry args={[0.2, 0.6, 8]} /></Solid><Solid at={[0, 0.92, 0.12]} color="#8a985a"><sphereGeometry args={[0.26, 14, 12]} /></Solid><Box at={[-0.1, 0.98, 0.35]} size={[0.06, 0.05, 0.04]} color="#f0a03c" glow={1.5} /><Box at={[0.1, 0.98, 0.35]} size={[0.06, 0.05, 0.04]} color="#f0a03c" glow={1.5} /></>;
  else if (kind === "trooper") body = <><Humanoid body="#e9edf0" head="#e9edf0" legs="#e9edf0" /><Box at={[0, 1.1, 0.11]} size={[0.2, 0.05, 0.06]} color="#11161d" /><Box at={[0.24, 0.62, 0.22]} size={[0.05, 0.07, 0.5]} color="#11161d" /></>;
  else if (kind === "officer") body = <><Humanoid body="#56624f" /><Cyl at={[0, 1.2, 0]} r={0.14} h={0.07} color="#3f4a3a" /><Box at={[0, 1.17, 0.14]} size={[0.2, 0.02, 0.1]} color="#3f4a3a" /><Box at={[-0.08, 0.86, 0.11]} size={[0.1, 0.05, 0.02]} color="#e5484d" glow={0.8} /><Box at={[0.24, 0.56, 0.16]} size={[0.04, 0.06, 0.26]} color="#11161d" /></>;
  else if (kind === "force") {
    // A robe and a lit lightsaber: red for the dark side and for anyone hostile, blue otherwise
    const blade = /sith|inquisitor|dark|guard/i.test(name) || ring === SIDE_COLORS.hostile ? "#ff5a5a" : "#7fe3ff";
    body = <><Humanoid body="#4a3626" head="#33251b" robe /><Box at={[0.26, 0.56, 0.12]} size={[0.04, 0.16, 0.04]} color="#9aa3ad" /><mesh position={[0.26, 1, 0.2]} rotation={[0.25, 0, 0]}><cylinderGeometry args={[0.025, 0.025, 0.8, 8]} /><meshBasicMaterial color={blade} /></mesh></>;
  } else if (kind === "player") body = <><Humanoid body="#7a4b2a" legs="#3d4856" /><Box at={[0, 0.76, -0.14]} size={[0.26, 0.34, 0.1]} color="#2f3a48" /><Box at={[0.24, 0.56, 0.16]} size={[0.04, 0.06, 0.26]} color="#11161d" /></>;
  else body = <Humanoid body={tone} />;
  return (
    <group scale={large ? 1.5 : 1}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.34, 0.44, 24]} />
        <meshBasicMaterial color={ring} />
      </mesh>
      {body}
      {marker && <Solid at={[0, 1.55, 0]} color="#facc15" glow={1.2}><octahedronGeometry args={[0.12]} /></Solid>}
    </group>
  );
}

const isLarge = (size?: string) => /large|huge|gargantuan/i.test(size ?? "");

// A name that turns to face whoever is looking
const Label = ({ at, size = 0.34, color = "white", children }: { at: V3; size?: number; color?: string; children: string }) => (
  <Billboard position={at}>
    <Text fontSize={size} color={color} anchorX="center" anchorY="middle" outlineWidth={size * 0.08} outlineColor="#000000">
      {children}
    </Text>
  </Billboard>
);

// Something to tap that is easier to hit than what is drawn
const Hit = ({ at, size, onTap }: { at: V3; size: V3; onTap: () => void }) => (
  <mesh position={at} onClick={(e) => { e.stopPropagation(); if (e.delta <= 8) onTap(); }}>
    <boxGeometry args={size} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>
);

// ---------------------------------------------------------------------------------------------
// Furniture, by what it is called (the names come from ROOM_PLANS in shared/logic). Drawn on
// the squares it stands on: w by h, with its corner at the origin.
// ---------------------------------------------------------------------------------------------

const WOOD = "#8b5e3c";
const WOOD_DARK = "#5f3f28";
const DARK = "#27303b";
const OLIVE = "#6f7448";
const ROCK = "#6d6a66";
const GLOW = "#5ad1ff";
const AMBER = "#f0a03c";

function Furniture({ name, w, h }: { name: string; w: number; h: number }) {
  const n = name.toLowerCase();
  const cx = w / 2;
  const cz = h / 2;
  const wide = w >= h;
  const span = Math.max(w, h);
  // A box that fills the footprint less a margin, standing on the floor
  const block = (height: number, color: string, margin = 0.1, glow?: number) => <Box at={[cx, height / 2, cz]} size={[w - margin * 2, height, h - margin * 2]} color={color} glow={glow} />;
  // A lit screen leaning back on top of something
  const screen = (y: number, color = GLOW) => <Box at={[cx, y, cz]} size={[wide ? w * 0.6 : 0.06, 0.3, wide ? 0.06 : h * 0.6]} color={color} glow={1.2} rot={wide ? [-0.4, 0, 0] : [0, 0, 0.4]} />;
  const stools = (count: number, r: number) => Array.from({ length: count }, (_, i) => <Cyl key={i} at={[cx + Math.cos(i * (6.28 / count) + 0.6) * r, 0.16, cz + Math.sin(i * (6.28 / count) + 0.6) * r]} r={0.11} h={0.32} color={WOOD} />);

  if (/pit trap/.test(n)) return <><Box at={[cx, 0.005, cz]} size={[w - 0.08, 0.02, h - 0.08]} color="#05070a" />{[[cx, 0.03, 0.04, w, 0.06, 0.08], [cx, 0.03, h - 0.04, w, 0.06, 0.08], [0.04, 0.03, cz, 0.08, 0.06, h], [w - 0.04, 0.03, cz, 0.08, 0.06, h]].map(([x, y, z, sx, sy, sz], i) => <Box key={i} at={[x, y, z]} size={[sx, sy, sz]} color={AMBER} glow={0.6} />)}</>;
  if (/bandstand/.test(n)) return <><Box at={[cx, 0.11, cz]} size={[w - 0.06, 0.22, h - 0.06]} color="#3a2f45" /><Box at={[cx, 0.225, cz]} size={[w - 0.24, 0.01, h - 0.24]} color="#5b4a70" />{Array.from({ length: Math.round(w) }, (_, i) => <Cyl key={i} at={[0.5 + i, 0.24, 0.08]} r={0.06} h={0.04} color={["#f472b6", GLOW, "#fde68a"][i % 3]} glow={2} />)}<pointLight position={[cx, 1.6, cz]} color="#f0abfc" intensity={1.4} distance={5} /></>;
  if (/bar counter/.test(n)) return <>{block(0.7, WOOD_DARK, 0.12)}<Box at={[cx, 0.73, cz]} size={[w - 0.06, 0.06, h - 0.1]} color={WOOD} />{Array.from({ length: Math.floor(span) }, (_, i) => <Cyl key={i} at={[wide ? 0.5 + i : cx, 0.86, wide ? cz : 0.5 + i]} r={0.05} h={0.2} color={[GLOW, AMBER, "#58c98b"][i % 3]} glow={0.9} />)}</>;
  if (/sabacc/.test(n)) return <><Cyl at={[cx, 0.25, cz]} r={0.2} h={0.5} color={DARK} /><Cyl at={[cx, 0.53, cz]} r={Math.min(w, h) * 0.42} h={0.07} color="#2f6b4a" glow={0.25} />{stools(5, Math.min(w, h) * 0.5)}</>;
  if (/holo-table/.test(n)) return <><Cyl at={[cx, 0.27, cz]} r={Math.min(w, h) * 0.4} h={0.54} color={DARK} /><mesh position={[cx, 0.95, cz]}><sphereGeometry args={[Math.min(w, h) * 0.26, 12, 10]} /><meshBasicMaterial color={GLOW} transparent opacity={0.45} wireframe /></mesh><Cyl at={[cx, 0.56, cz]} r={Math.min(w, h) * 0.3} h={0.03} color={GLOW} glow={1.5} /></>;
  if (/low table/.test(n)) return <><Cyl at={[cx, 0.13, cz]} r={0.1} h={0.26} color={DARK} /><Box at={[cx, 0.29, cz]} size={[w - 0.3, 0.05, h - 0.3]} color={WOOD} /></>;
  if (/table/.test(n)) return <><Cyl at={[cx, 0.25, cz]} r={0.08} h={0.5} color={DARK} />{span > 1 ? <Box at={[cx, 0.52, cz]} size={[w - 0.25, 0.06, h - 0.25]} color={WOOD} /> : <Cyl at={[cx, 0.52, cz]} r={0.36} h={0.06} color={WOOD} />}{span > 1 ? [-1, 1].flatMap((side) => Array.from({ length: Math.floor(span) }, (_, i) => <Cyl key={`${side}${i}`} at={wide ? [0.5 + i, 0.16, cz + side * 0.42] : [cx + side * 0.42, 0.16, 0.5 + i]} r={0.1} h={0.32} color={WOOD_DARK} />)) : stools(3, 0.44)}</>;
  if (/booth|couch|bench/.test(n)) {
    const soft = /bench/.test(n) ? "#59636d" : "#7a3b3b";
    return <>{block(0.3, soft, 0.1)}<Box at={wide ? [cx, 0.42, 0.14] : [0.14, 0.42, cz]} size={wide ? [w - 0.2, 0.6, 0.14] : [0.14, 0.6, h - 0.2]} color={soft} /></>;
  }
  if (/bunk/.test(n)) return <><Box at={[cx, 0.24, cz]} size={[w - 0.16, 0.12, h - 0.16]} color="#56624f" /><Box at={[cx, 0.84, cz]} size={[w - 0.16, 0.12, h - 0.16]} color="#56624f" />{[[0.1, 0.1], [w - 0.1, 0.1], [0.1, h - 0.1], [w - 0.1, h - 0.1]].map(([x, z], i) => <Box key={i} at={[x, 0.5, z]} size={[0.07, 1, 0.07]} color="#7b8794" />)}</>;
  if (/bed/.test(n)) {
    const medical = /medical/.test(n);
    return <>{block(0.34, medical ? "#e9edf0" : "#59636d", 0.12)}<Box at={wide ? [0.32, 0.4, cz] : [cx, 0.4, 0.32]} size={[0.34, 0.08, 0.34]} color={medical ? GLOW : "#e8dcc0"} glow={medical ? 0.5 : undefined} />{medical && <Box at={wide ? [w - 0.16, 0.6, cz] : [cx, 0.6, h - 0.16]} size={[0.08, 0.7, 0.3]} color={DARK} />}</>;
  }
  if (/holding cell/.test(n)) return <><Box at={[cx, 0.04, cz]} size={[w - 0.1, 0.08, h - 0.1]} color={DARK} />{[[0.1, 0.1], [w - 0.1, 0.1], [0.1, h - 0.1], [w - 0.1, h - 0.1]].map(([x, z], i) => <Box key={i} at={[x, 0.7, z]} size={[0.1, 1.4, 0.1]} color="#7b8794" />)}<Box at={[cx, 1.42, cz]} size={[w - 0.1, 0.08, h - 0.1]} color={DARK} /><mesh position={[cx, 0.72, cz]}><boxGeometry args={[w - 0.22, 1.3, h - 0.22]} /><meshBasicMaterial color="#e5484d" transparent opacity={0.16} depthWrite={false} /></mesh></>;
  if (/console|terminal/.test(n)) return <>{block(0.6, DARK, 0.14)}{screen(0.78, /guard/.test(n) ? AMBER : GLOW)}<Box at={[cx, 0.62, cz]} size={[w - 0.4, 0.03, h - 0.4]} color={GLOW} glow={0.6} /></>;
  if (/desk/.test(n)) return <><Box at={[cx, 0.54, cz]} size={[w - 0.16, 0.08, h - 0.2]} color={WOOD_DARK} /><Box at={wide ? [0.22, 0.26, cz] : [cx, 0.26, 0.22]} size={[0.24, 0.52, 0.5]} color={DARK} /><Box at={wide ? [w - 0.22, 0.26, cz] : [cx, 0.26, h - 0.22]} size={[0.24, 0.52, 0.5]} color={DARK} />{screen(0.72)}</>;
  if (/workbench/.test(n)) return <>{block(0.6, "#4b5563", 0.12)}<Box at={[cx - 0.3, 0.66, cz]} size={[0.3, 0.1, 0.2]} color={AMBER} /><Box at={[cx + 0.4, 0.68, cz]} size={[0.16, 0.14, 0.16]} color="#7b8794" /><Box at={wide ? [cx, 0.95, 0.12] : [0.12, 0.95, cz]} size={wide ? [w - 0.3, 0.6, 0.06] : [0.06, 0.6, h - 0.3]} color={DARK} /></>;
  if (/reactor core/.test(n)) return <><Cyl at={[cx, 0.15, cz]} r={Math.min(w, h) * 0.46} h={0.3} color={DARK} /><Cyl at={[cx, 0.9, cz]} r={Math.min(w, h) * 0.3} h={1.3} color={GLOW} glow={1.4} /><Cyl at={[cx, 1.6, cz]} r={Math.min(w, h) * 0.4} h={0.14} color={DARK} /><pointLight position={[cx, 1, cz]} color={GLOW} intensity={2} distance={6} /></>;
  if (/bacta tank/.test(n)) return <><Cyl at={[cx, 0.1, cz]} r={0.36} h={0.2} color={DARK} /><mesh position={[cx, 0.8, cz]}><cylinderGeometry args={[0.3, 0.3, 1.2, 16]} /><meshLambertMaterial color="#58c9b0" emissive="#58c9b0" emissiveIntensity={0.5} transparent opacity={0.55} /></mesh><Cyl at={[cx, 1.46, cz]} r={0.34} h={0.12} color={DARK} /></>;
  if (/coolant tank/.test(n)) return <><Cyl at={[cx, 0.6, cz]} r={0.36} h={1.2} color="#7b8794" /><Cyl at={[cx, 0.6, cz]} r={0.37} h={0.1} color={GLOW} glow={1} /></>;
  if (/fuel pump/.test(n)) return <><Box at={[cx, 0.5, cz]} size={[0.5, 1, 0.36]} color="#a33b3b" /><Box at={[cx, 0.8, cz + 0.19]} size={[0.3, 0.16, 0.02]} color={AMBER} glow={1} /><Cyl at={[cx + 0.3, 0.4, cz]} r={0.03} h={0.7} color="#11161d" /></>;
  if (/drink dispenser/.test(n)) return <><Box at={[cx, 0.6, cz]} size={[0.6, 1.2, 0.5]} color={DARK} /><Box at={[cx, 0.8, cz + 0.26]} size={[0.4, 0.4, 0.02]} color="#58c98b" glow={1.2} /></>;
  if (/power coupling/.test(n)) return <><Cyl at={[cx, 0.35, cz]} r={0.3} h={0.7} color="#4b5563" /><Cyl at={[cx, 0.75, cz]} r={0.14} h={0.14} color={AMBER} glow={1.6} /></>;
  if (/sensor mast/.test(n)) return <><Cyl at={[cx, 0.1, cz]} r={0.26} h={0.2} color={DARK} /><Mast at={[cx, 0.2, cz]} h={1.6} /></>;
  if (/broken pillar/.test(n)) return <><Cyl at={[cx, 0.35, cz]} r={0.3} h={0.7} color="#8a8680" /><Rock at={[cx + 0.3, 0, cz + 0.28]} r={0.16} color="#8a8680" /></>;
  if (/rock pillar/.test(n)) return <Cyl at={[cx, 0.8, cz]} r={0.36} top={0.22} h={1.6} color={ROCK} />;
  if (/pillar|awning post/.test(n)) return <><Cyl at={[cx, 0.8, cz]} r={/awning/.test(n) ? 0.1 : 0.28} h={1.6} color={/awning/.test(n) ? WOOD : "#8a8680"} /><Cyl at={[cx, 0.06, cz]} r={0.36} h={0.12} color="#6d6a66" /></>;
  if (/boulder/.test(n)) return <Rock at={[cx, 0, cz]} r={0.44} />;
  if (/rubble/.test(n)) return <>{Array.from({ length: Math.round(span) + 1 }, (_, i) => <Rock key={i} at={[wide ? 0.3 + i * 0.6 : cx + (i % 2 ? 0.14 : -0.14), 0, wide ? cz + (i % 2 ? 0.14 : -0.14) : 0.3 + i * 0.6]} r={0.2 + (i % 3) * 0.06} color={i % 2 ? "#5a5753" : ROCK} />)}</>;
  if (/sarcophagus/.test(n)) return <>{block(0.5, "#6d6a66", 0.14)}<Box at={[cx, 0.56, cz]} size={[w - 0.2, 0.12, h - 0.2]} color="#8a8680" /></>;
  if (/altar/.test(n)) return <>{block(0.6, "#6d6a66", 0.16)}<Solid at={[cx, 0.8, cz]} color="#c084fc" glow={1.5}><octahedronGeometry args={[0.14]} /></Solid></>;
  if (/dais/.test(n)) return block(0.14, "#5a564f", 0.04);
  if (/campfire/.test(n)) return <>{[0, 1, 2, 3, 4, 5].map((i) => <Rock key={i} at={[cx + Math.cos(i * 1.05) * 0.34, 0, cz + Math.sin(i * 1.05) * 0.34]} r={0.1} />)}<Solid at={[cx, 0.2, cz]} color="#ffb347" glow={2.5}><coneGeometry args={[0.18, 0.4, 6]} /></Solid><pointLight position={[cx, 0.5, cz]} color="#ffb347" intensity={2} distance={5} /></>;
  if (/market stall/.test(n)) return <>{block(0.55, WOOD_DARK, 0.14)}{[[0.12, 0.12], [w - 0.12, 0.12], [0.12, h - 0.12], [w - 0.12, h - 0.12]].map(([x, z], i) => <Box key={i} at={[x, 0.75, z]} size={[0.05, 1.5, 0.05]} color={WOOD} />)}<Box at={[cx, 1.52, cz]} size={[w, 0.05, h]} color={["#c8663a", "#e8dcc0", "#4f8a8b"][hue(`${w}${h}${name.length}`) % 3]} rot={wide ? [0.14, 0, 0] : [0, 0, 0.14]} /><Box at={[cx - 0.3, 0.63, cz]} size={[0.2, 0.12, 0.2]} color={AMBER} /><Box at={[cx + 0.3, 0.62, cz]} size={[0.24, 0.1, 0.2]} color="#58c98b" /></>;
  if (/crate stack/.test(n)) return <><Box at={[cx - w * 0.22, 0.3, cz - h * 0.22]} size={[w * 0.46, 0.6, h * 0.46]} color={OLIVE} /><Box at={[cx + w * 0.24, 0.3, cz - h * 0.2]} size={[w * 0.42, 0.6, h * 0.46]} color="#59636d" /><Box at={[cx - w * 0.2, 0.3, cz + h * 0.25]} size={[w * 0.5, 0.6, h * 0.4]} color="#59636d" /><Box at={[cx + w * 0.24, 0.26, cz + h * 0.26]} size={[w * 0.4, 0.52, h * 0.38]} color={OLIVE} /><Box at={[cx - w * 0.2, 0.86, cz - h * 0.2]} size={[w * 0.4, 0.5, h * 0.4]} color="#7b8794" /><Box at={[cx + w * 0.2, 0.84, cz + h * 0.1]} size={[w * 0.36, 0.5, h * 0.4]} color={OLIVE} /></>;
  if (/cargo pallet/.test(n)) return <><Box at={[cx, 0.06, cz]} size={[w - 0.1, 0.12, h - 0.1]} color={WOOD_DARK} /><Box at={[cx - w * 0.2, 0.42, cz]} size={[w * 0.44, 0.6, h * 0.8]} color="#59636d" /><Box at={[cx + w * 0.24, 0.36, cz - h * 0.16]} size={[w * 0.36, 0.48, h * 0.44]} color={OLIVE} /><Box at={[cx + w * 0.24, 0.3, cz + h * 0.26]} size={[w * 0.34, 0.36, h * 0.3]} color={AMBER} /></>;
  if (/crate|footlocker|parts bin/.test(n)) return <>{block(/footlocker/.test(n) ? 0.36 : 0.56, /parts/.test(n) ? "#59636d" : OLIVE, 0.16)}<Box at={[cx, /footlocker/.test(n) ? 0.2 : 0.3, cz + (h - 0.3) / 2]} size={[0.16, 0.1, 0.03]} color={AMBER} glow={0.8} /></>;
  if (/weapon rack|tool rack|restraint rack/.test(n)) return <><Box at={[cx, 0.7, cz]} size={wide ? [w - 0.2, 1.3, 0.12] : [0.12, 1.3, h - 0.2]} color={DARK} />{Array.from({ length: Math.round(span * 2) }, (_, i) => <Box key={i} at={wide ? [0.3 + i * 0.42, 0.75, cz + 0.1] : [cx + 0.1, 0.75, 0.3 + i * 0.42]} size={[0.06, 0.8, 0.06]} color={/tool/.test(n) ? AMBER : "#11161d"} />)}</>;
  if (/shelving|cabinet|locker/.test(n)) return <>{block(1.3, /locker/.test(n) ? "#59636d" : DARK, 0.16)}{[0.4, 0.8, 1.15].map((y) => <Box key={y} at={[cx, y, cz]} size={[w - 0.28, 0.03, h - 0.28]} color={/supply/.test(n) ? GLOW : "#7b8794"} glow={/supply/.test(n) ? 0.8 : undefined} />)}</>;
  if (/loading crane/.test(n)) return <><Cyl at={[0.4, 0.9, cz]} r={0.12} h={1.8} color={AMBER} /><Box at={[cx, 1.75, cz]} size={[w - 0.2, 0.12, 0.14]} color={AMBER} /><Cyl at={[w - 0.3, 1.4, cz]} r={0.02} h={0.6} color="#11161d" /><Box at={[w - 0.3, 1.08, cz]} size={[0.14, 0.1, 0.14]} color="#11161d" /></>;
  if (/pipe run/.test(n)) return <><Solid at={[cx, 0.4, cz]} color="#7b8794" rot={wide ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.16, 0.16, span - 0.1, 12]} /></Solid><Solid at={[cx, 0.72, cz]} color="#59636d" rot={wide ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.09, 0.09, span - 0.1, 10]} /></Solid>{[0.3, span - 0.3].map((d) => <Box key={d} at={wide ? [d, 0.4, cz] : [cx, 0.4, d]} size={[0.14, 0.8, 0.14]} color={DARK} />)}</>;
  if (/cart/.test(n)) return <><Box at={[cx, 0.34, cz]} size={[0.6, 0.4, 0.44]} color={/instrument/.test(n) ? "#e9edf0" : "#59636d"} /><Box at={[cx, 0.57, cz]} size={[0.5, 0.05, 0.36]} color={/instrument/.test(n) ? GLOW : AMBER} glow={0.6} />{[[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.16], [0.22, 0.16]].map(([x, z], i) => <Cyl key={i} at={[cx + x, 0.07, cz + z]} r={0.07} h={0.06} color="#11161d" />)}</>;
  if (/pilot's seat|co-pilot's seat/.test(n)) return <><Cyl at={[cx, 0.16, cz]} r={0.1} h={0.32} color={DARK} /><Box at={[cx, 0.38, cz]} size={[0.5, 0.1, 0.5]} color="#3d4856" /><Box at={[cx - 0.24, 0.74, cz]} size={[0.1, 0.7, 0.5]} color="#3d4856" /><Box at={[cx + 0.42, 0.55, cz]} size={[0.34, 0.5, 0.5]} color={DARK} /><Box at={[cx + 0.42, 0.84, cz]} size={[0.34, 0.06, 0.4]} color={GLOW} glow={1.4} rot={[0, 0, -0.5]} /></>;
  if (/gunnery seat/.test(n)) return <><Cyl at={[cx, 0.16, cz]} r={0.1} h={0.32} color={DARK} /><Box at={[cx, 0.38, cz]} size={[0.46, 0.1, 0.46]} color="#4a3d3d" /><Box at={[cx - 0.22, 0.7, cz]} size={[0.1, 0.6, 0.46]} color="#4a3d3d" /><Box at={[cx + 0.3, 0.7, cz]} size={[0.06, 0.06, 0.5]} color="#e5484d" glow={0.8} /><Box at={[cx + 0.3, 0.52, cz]} size={[0.2, 0.3, 0.2]} color={DARK} /></>;
  if (/boarding ramp/.test(n)) return <><Box at={[cx, 0.04, cz]} size={[w - 0.1, 0.08, h - 0.1]} color="#59636d" />{[0, 1, 2, 3].map((i) => <Box key={i} at={[0.2 + i * 0.2, 0.09, cz]} size={[0.06, 0.02, h - 0.2]} color={AMBER} glow={0.7} />)}<Box at={[0.06, 0.8, cz]} size={[0.08, 1.4, h - 0.1]} color={DARK} /></>;
  if (/command chair/.test(n)) return <><Cyl at={[cx, 0.16, cz]} r={0.1} h={0.32} color={DARK} /><Box at={[cx, 0.36, cz]} size={[0.5, 0.1, 0.5]} color="#3d4856" /><Box at={[cx, 0.72, cz - 0.22]} size={[0.5, 0.7, 0.1]} color="#3d4856" /></>;
  if (/barricade/.test(n)) return <><Box at={[cx, 0.34, cz]} size={[w - 0.1, 0.68, h * 0.3]} color="#59636d" rot={wide ? [0.2, 0, 0] : [0, 0, 0.2]} /><Box at={[cx, 0.5, cz]} size={[w * 0.5, 0.08, h * 0.32]} color={AMBER} /></>;
  if (/lifter droid dock/.test(n)) return <><Box at={[cx, 0.05, cz]} size={[0.8, 0.1, 0.8]} color={DARK} /><Box at={[cx - 0.3, 0.5, cz - 0.3]} size={[0.1, 1, 0.1]} color="#7b8794" /><Box at={[cx - 0.3, 1.02, cz - 0.3]} size={[0.12, 0.08, 0.12]} color="#58c98b" glow={2} /></>;
  // Wall-mounted equipment and kiosks (see useKindOf)
  if (/security camera|camera pole/.test(n)) return <><Box at={[cx, 1.5, cz]} size={[0.22, 0.2, 0.34]} color="#2a2f36" /><Box at={[cx, 1.5, cz + 0.2]} size={[0.1, 0.1, 0.06]} color="#e5484d" glow={2} /><Cyl at={[cx, 0.75, cz]} r={0.03} h={1.5} color="#59636d" /></>;
  if (/alarm panel/.test(n)) return <><Box at={[cx, 1.1, cz]} size={[0.36, 0.44, 0.1]} color="#8f2f35" /><Box at={[cx, 1.1, cz + 0.06]} size={[0.14, 0.14, 0.04]} color="#ff6b6b" glow={1.4} /></>;
  if (/info kiosk|notice board/.test(n)) return <>{block(0.7, "#2a2f36", 0.2)}<Box at={[cx, 1.05, cz]} size={[0.5, 0.5, 0.12]} color={GLOW} glow={1.1} /></>;
  if (/access panel/.test(n)) return <><Box at={[cx, 1.05, cz]} size={[0.34, 0.44, 0.1]} color="#2a2f36" /><Box at={[cx, 1.12, cz + 0.06]} size={[0.2, 0.14, 0.03]} color="#58c98b" glow={1.2} /><Box at={[cx, 0.98, cz + 0.06]} size={[0.2, 0.16, 0.03]} color="#59636d" /></>;
  return block(0.5, "#3d4856", 0.16);
}

// A cache: a strongbox with a lit lock, standing open once it has been emptied
function Chest({ looted }: { looted?: boolean }) {
  return (
    <>
      <Box at={[0.5, 0.2, 0.5]} size={[0.66, 0.4, 0.46]} color="#3a3320" />
      <Box at={[0.5, 0.2, 0.5]} size={[0.7, 0.06, 0.5]} color="#f5d342" glow={0.3} />
      {looted ? <Box at={[0.5, 0.56, 0.3]} size={[0.66, 0.06, 0.46]} color="#3a3320" rot={[1.2, 0, 0]} /> : <><Box at={[0.5, 0.44, 0.5]} size={[0.68, 0.1, 0.48]} color="#4a4228" /><Box at={[0.5, 0.36, 0.74]} size={[0.12, 0.12, 0.03]} color="#f5d342" glow={2} /></>}
    </>
  );
}

// A resource node (house rule, see "Gathering" in shared/logic): a vein of ore, a patch of plants,
// a crystal cluster or a heap of parts, dull once it has run dry
function NodeModel({ node, empty }: { node: ResourceNode; empty?: boolean }) {
  const glow = empty ? 0 : 0.5 + node.tier * 0.5;
  if (node.family === "plant") {
    return <>{[[0.3, 0.35, 0.5], [0.55, 0.5, 0.3], [0.7, 0.3, 0.65], [0.45, 0.4, 0.7]].map(([x, h, z], i) => <Box key={i} at={[x, h / 2, z]} size={[0.1, h, 0.1]} color={empty ? "#4d4a35" : "#4f9a4f"} />)}{!empty && [[0.3, 0.38, 0.5], [0.55, 0.52, 0.3], [0.7, 0.33, 0.65]].map(([x, y, z], i) => <Box key={i} at={[x, y, z]} size={[0.16, 0.12, 0.16]} color="#f0c24b" glow={glow} />)}</>;
  }
  if (node.family === "hide") {
    return <><Box at={[0.5, 0.12, 0.5]} size={[0.8, 0.24, 0.5]} color={empty ? "#4d4540" : "#6e4b3a"} rot={[0, 0.3, 0]} />{[-0.25, 0, 0.25].map((d, i) => <Box key={i} at={[0.5 + d, 0.3, 0.5]} size={[0.04, 0.2, 0.4]} color="#d9d2c0" rot={[0, 0.3, 0.2]} />)}</>;
  }
  if (node.family === "crystal") {
    const color = ["#9ad1f0", "#c0a0f0", "#5fa8ff", "#ff6fa8"][node.tier] ?? "#9ad1f0";
    return <><Box at={[0.5, 0.08, 0.5]} size={[0.7, 0.16, 0.6]} color="#4a4f58" />{[[0.4, 0.45, 0.45, 0.5], [0.62, 0.35, 0.55, 0.4], [0.5, 0.3, 0.7, 0.3]].map(([x, h, z, r], i) => <Box key={i} at={[x, 0.16 + h / 2, z]} size={[0.14, h, 0.14]} color={empty ? "#6a6f78" : color} glow={glow} rot={[0, r, r - 0.4]} />)}</>;
  }
  if (node.family === "salvage") {
    return <><Box at={[0.45, 0.14, 0.5]} size={[0.7, 0.28, 0.5]} color="#59636d" rot={[0, 0.3, 0]} /><Box at={[0.6, 0.34, 0.4]} size={[0.3, 0.2, 0.3]} color="#3d4856" rot={[0.2, 0.5, 0]} />{!empty && <Box at={[0.35, 0.34, 0.6]} size={[0.14, 0.06, 0.14]} color="#58c98b" glow={glow} />}</>;
  }
  const vein = ["#b0b8c0", "#7fd0ff", "#ffb347", "#ff6b6b"][node.tier] ?? "#b0b8c0";
  return <><Box at={[0.5, 0.2, 0.5]} size={[0.8, 0.4, 0.6]} color="#4a4f58" rot={[0, 0.2, 0]} /><Box at={[0.5, 0.32, 0.5]} size={[0.5, 0.1, 0.62]} color={empty ? "#5a5f68" : vein} glow={glow} rot={[0, 0.2, 0.1]} /></>;
}

// The painted berth of a ship that is out on a voyage (its pilot is off with it): the place it
// will come back to, so that a hangar is not drawn empty without saying why
function Berth({ w, h, name }: { w: number; h: number; name: string }) {
  return (
    <>
      <Box at={[w / 2, 0.02, h / 2]} size={[w, 0.04, h]} color="#2f3a45" />
      {[[0.1, 0.1], [w - 0.1, 0.1], [0.1, h - 0.1], [w - 0.1, h - 0.1]].map(([x, z], i) => <Box key={i} at={[x, 0.08, z]} size={[0.5, 0.06, 0.5]} color="#f5d342" />)}
      <Label at={[w / 2, 0.9, h / 2]} size={0.34} color="#f5d342">{`${name}: away on a voyage`}</Label>
    </>
  );
}

// A ship on the floor, built on 6 by 4 squares with the bow to +x and stretched to its footprint
function ShipModel({ ship, w, h }: { ship: Pick<Ship, "size" | "role" | "status">; w: number; h: number }) {
  const role = `${ship.role} ${ship.size}`.toLowerCase();
  const wrecked = ship.status === "wrecked";
  const hull = wrecked ? "#5a554f" : "#aeb6bd";
  const dark = "#59636d";
  const glass = <meshLambertMaterial color="#1b2a38" emissive={GLOW} emissiveIntensity={0.25} />;
  const struts = [[-1.4, -0.9], [-1.4, 0.9], [1.4, 0]].map(([x, z], i) => <Cyl key={i} at={[x, 0.2, z]} r={0.07} h={0.4} color="#2b2f36" />);
  let body: ReactNode;
  if (/fighter|interceptor|skiff|tiny/.test(role)) {
    // A snub fighter: a long nose, four foils with cannon at the tips, engines aft
    body = <><Box at={[0.3, 0.75, 0]} size={[4.2, 0.5, 0.6]} color={hull} /><Solid at={[2.7, 0.75, 0]} color={hull} rot={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.3, 0.8, 8]} /></Solid><mesh position={[0.6, 1.02, 0]}><sphereGeometry args={[0.28, 10, 8]} />{glass}</mesh>{[[1, 0.22], [1, -0.22], [-1, 0.22], [-1, -0.22]].map(([side, tilt], i) => <group key={i}><Box at={[-1, 0.75 + tilt * 2.2, side * 1.15]} size={[1.5, 0.06, 1.7]} color={dark} rot={[side * tilt, 0, 0]} /><Box at={[-0.6, 0.75 + tilt * 4, side * 1.9]} size={[1.9, 0.06, 0.06]} color="#e5484d" /></group>)}{[[0.26, 0.2], [0.26, -0.2], [-0.26, 0.2], [-0.26, -0.2]].map(([y, z], i) => <Cyl key={i} at={[-1.9, 0.75 + y, z]} r={0.16} h={0.1} color={GLOW} glow={2} />)}</>;
  } else if (/shuttle|transport|courier|small/.test(role)) {
    // A shuttle: a wedge of a hull, a tall fin, wings folded up for landing
    body = <><Box at={[-0.3, 0.95, 0]} size={[3.6, 1.1, 1.5]} color={hull} /><Box at={[1.9, 0.82, 0]} size={[1.2, 0.7, 1.1]} color={hull} rot={[0, 0, -0.25]} /><mesh position={[2.2, 1.05, 0]}><boxGeometry args={[0.5, 0.3, 0.9]} />{glass}</mesh><Box at={[-0.8, 2.3, 0]} size={[2, 1.8, 0.08]} color={dark} /><Box at={[-0.7, 0.9, 1.5]} size={[2.2, 0.08, 1.7]} color={dark} rot={[0.35, 0, 0]} /><Box at={[-0.7, 0.9, -1.5]} size={[2.2, 0.08, 1.7]} color={dark} rot={[-0.35, 0, 0]} /><Box at={[-2.12, 0.95, 0]} size={[0.06, 0.6, 1.1]} color={GLOW} glow={1.6} /></>;
  } else if (/freighter|hauler|smuggl|medium/.test(role)) {
    // A light freighter: a saucer with forward mandibles and a cockpit pod on the starboard side
    body = <><Cyl at={[-0.5, 0.9, 0]} r={1.9} h={0.6} color={hull} /><Cyl at={[-0.5, 1.26, 0]} r={0.8} h={0.14} color={dark} /><Box at={[1.9, 0.9, 0.5]} size={[1.8, 0.4, 0.5]} color={hull} /><Box at={[1.9, 0.9, -0.5]} size={[1.8, 0.4, 0.5]} color={hull} /><Solid at={[0.9, 0.95, 1.7]} color={dark} rot={[0, 0.5, Math.PI / 2]}><cylinderGeometry args={[0.28, 0.28, 1.5, 10]} /></Solid><mesh position={[1.55, 0.98, 2.05]}><sphereGeometry args={[0.27, 10, 8]} />{glass}</mesh><Cyl at={[-0.2, 1.42, -1]} r={0.36} top={0.5} h={0.14} color="#7b8794" /><Box at={[-2.36, 0.9, 0]} size={[0.08, 0.3, 1.9]} color={GLOW} glow={1.8} /></>;
  } else {
    // A corvette: a hammerhead bow, a slim neck, a block of engines aft
    body = <><Box at={[2.3, 1, 0]} size={[1, 0.9, 2.4]} color={hull} /><Box at={[0.4, 1, 0]} size={[3, 0.6, 0.9]} color={hull} /><Box at={[-1.9, 1, 0]} size={[1.6, 1.3, 2.6]} color={dark} /><Box at={[0.4, 1.02, 0]} size={[2.8, 0.1, 0.94]} color="#e5484d" />{[-0.9, -0.3, 0.3, 0.9].map((z) => <Cyl key={z} at={[-2.74, 1, z]} r={0.22} h={0.1} color={GLOW} glow={2} />)}<mesh position={[2.82, 1.1, 0]}><boxGeometry args={[0.06, 0.24, 1.2]} />{glass}</mesh></>;
  }
  return (
    <group position={[w / 2, 0, h / 2]} scale={[w / 6, Math.min(w / 6, h / 4), h / 4]} rotation={wrecked ? [0.12, 0, 0.16] : undefined}>
      {!wrecked && struts}
      {body}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// A room on its grid of 5-foot squares: the floor, walls cut down to waist height so that the
// room can be looked into, what is set in the walls, and what stands on the floor.
// ---------------------------------------------------------------------------------------------

// A floor of a building is this many squares of height; a room stands on the floor of its level
// (a gallery on half of one), and a stairwell, lift or ladder rises from its lower level
const LEVEL_H = 2;
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

// Two panels of a roof that slide apart and together: the door of a hangar on a world whose air
// is no good to breathe, over the ships inside
function HangarRoof({ width, height, y }: { width: number; height: number; y: number }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const slide = (0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.45)) * (width / 2 - 0.2);
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

// A flight of stairs set in a room's floor, up to a gallery or down from it
function StairsAsset({ w, h, up }: { w: number; h: number; up: boolean }) {
  const none = () => null;
  const count = Math.max(3, Math.round(h * 2.4));
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const top = up ? (LEVEL_H / 2) * ((i + 1) / count) : 0.04;
        return (
          <mesh key={i} position={[w / 2, top / 2 + 0.02, up ? h - (i + 0.5) * (h / count) : (i + 0.5) * (h / count)]} raycast={none}>
            <boxGeometry args={[w * 0.9, Math.max(0.04, top), h / count + 0.01]} />
            <meshLambertMaterial color={up ? "#9aa0a8" : "#2c3138"} />
          </mesh>
        );
      })}
      <Box at={[0.02, 0.45, h / 2]} size={[0.05, 0.9, h]} color="#c8ccd2" />
      <Box at={[w - 0.02, 0.45, h / 2]} size={[0.05, 0.9, h]} color="#c8ccd2" />
    </group>
  );
}

const FLOORS: Record<FloorKind, string> = { plating: "#1d2530", hangar: "#232a31", sand: "#8f7447", rock: "#3a3835", stone: "#45423d", clay: "#4a3a2d" };
const WAY_COLORS = { door: "#f59e0b", locked: "#f87171", exit: "#4ade80", secret: "#c084fc", window: "#7dd3fc" };
const WALL_HEIGHT = 0.8;
const WALL_THICK = 0.16;
const isWay = (a: RoomAsset) => !!a.side && a.kind !== "window";

// Where on a room's wall line something set in the wall sits (in the room's own squares), and
// how it is turned
const onWall = (layout: { width: number; height: number }, a: RoomAsset): { x: number; z: number; turn: number } =>
  a.side === "n" ? { x: a.x + 0.5, z: 0, turn: 0 } : a.side === "s" ? { x: a.x + 0.5, z: layout.height, turn: 0 } : a.side === "w" ? { x: 0, z: a.y + 0.5, turn: Math.PI / 2 } : { x: layout.width, z: a.y + 0.5, turn: Math.PI / 2 };

// A door, way out, secret way or window, drawn along x about the origin
function Doorway({ kind, color, label, onTap }: { kind: RoomAsset["kind"]; color: string; label?: string; onTap?: () => void }) {
  return (
    <>
      {kind === "window" ? (
        <mesh position={[0, 0.62, 0]}><boxGeometry args={[0.76, 0.42, WALL_THICK + 0.08]} /><meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.7} /></mesh>
      ) : kind === "secret" ? (
        <><Box at={[0, 0.3, 0]} size={[0.74, 0.5, WALL_THICK + 0.1]} color="#1b1524" />{[-0.24, -0.08, 0.08, 0.24].map((x) => <Box key={x} at={[x, 0.3, 0]} size={[0.05, 0.46, WALL_THICK + 0.14]} color={color} glow={1.2} />)}</>
      ) : (
        <>
          <Box at={[-0.46, 0.7, 0]} size={[0.1, 1.4, 0.26]} color="#59636d" />
          <Box at={[0.46, 0.7, 0]} size={[0.1, 1.4, 0.26]} color="#59636d" />
          <Box at={[0, 1.4, 0]} size={[1.02, 0.1, 0.26]} color="#59636d" />
          <mesh position={[0, 0.68, 0]}><boxGeometry args={[0.82, 1.34, 0.07]} /><meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.6} /></mesh>
          <Box at={[0, 1.5, 0]} size={[0.3, 0.08, 0.3]} color={color} glow={2} />
        </>
      )}
      {label && <Label at={[0, kind === "window" || kind === "secret" ? 1.2 : 1.9, 0]} size={0.3} color={color}>{label}</Label>}
      {onTap && <Hit at={[0, 0.75, 0]} size={[1, 1.5, 0.9]} onTap={onTap} />}
    </>
  );
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

function RoomShell({ width, height, assets, floor, wall, ships = [], walls = true, looted, nodeOf, wayColor, wayLabel, onFloor, onAsset, plan, children }: {
  width: number;
  height: number;
  // The room's level and what it is, for stairs, lifts and ladders (their floor rises)
  plan?: Pick<RoomLayout, "level" | "form" | "climb" | "width" | "height">;
  assets: RoomAsset[];
  floor: FloorKind;
  wall: string;
  ships?: Ship[];
  // Open ground has no walls, only posts at its corners
  walls?: boolean;
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
  // The lines between the squares, as one piece of geometry
  const grid = useMemo(() => {
    const points: number[] = [];
    for (let x = 1; x < width; x++) points.push(x, 0.012, 0, x, 0.012, height);
    for (let y = 1; y < height; y++) points.push(0, 0.012, y, width, 0.012, y);
    return new Float32Array(points);
  }, [width, height]);
  // A shaft's walls run up with the floor
  const climbs = plan?.climb ? rise(plan as RoomLayout) : 0;
  const wallH = WALL_HEIGHT + climbs;
  const ramp = (x: number, y: number) => (plan?.climb ? rampAt(plan as RoomLayout, x + 0.5, y + 0.5) : 0);
  const sides = [
    { side: "n", length: width, at: (a: number, b: number): [V3, V3] => [[(a + b) / 2, wallH / 2, 0], [b - a + (a === 0 ? WALL_THICK / 2 : 0) + (b === width ? WALL_THICK / 2 : 0), wallH, WALL_THICK]], along: (a: RoomAsset) => a.x },
    { side: "s", length: width, at: (a: number, b: number): [V3, V3] => [[(a + b) / 2, wallH / 2, height], [b - a + (a === 0 ? WALL_THICK / 2 : 0) + (b === width ? WALL_THICK / 2 : 0), wallH, WALL_THICK]], along: (a: RoomAsset) => a.x },
    { side: "w", length: height, at: (a: number, b: number): [V3, V3] => [[0, wallH / 2, (a + b) / 2], [WALL_THICK, wallH, b - a]], along: (a: RoomAsset) => a.y },
    { side: "e", length: height, at: (a: number, b: number): [V3, V3] => [[width, wallH / 2, (a + b) / 2], [WALL_THICK, wallH, b - a]], along: (a: RoomAsset) => a.y },
  ];
  return (
    <>
      <mesh position={[width / 2, -0.1, height / 2]} receiveShadow onClick={onFloor ? (e) => { e.stopPropagation(); if (e.delta > 8) return; const p = e.object.worldToLocal(e.point.clone()); onFloor(Math.max(0, Math.min(width - 1, Math.floor(p.x + width / 2))), Math.max(0, Math.min(height - 1, Math.floor(p.z + height / 2)))); } : undefined}>
        <boxGeometry args={[width, 0.2, height]} />
        <meshLambertMaterial color={FLOORS[floor]} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={grid.length / 3} array={grid} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </lineSegments>
      {plan?.climb && plan.form && <Ascent w={width} h={height} toward={plan.climb.toward} up={climbs} form={plan.form} />}
      {walls
        ? sides.flatMap(({ side, length, at, along }) =>
            wallRuns(length, assets.filter((a) => a.side === side && isWay(a)).map(along)).map(([a, b]) => {
              const [position, size] = at(a, b);
              return <Box key={`${side}${a}`} at={position} size={size} color={wall} />;
            }),
          )
        : [[0, 0], [width, 0], [0, height], [width, height]].map(([x, z], i) => <Cyl key={i} at={[x, 0.3, z]} r={0.08} h={0.6} color={wall} />)}
      {assets.filter((a) => a.side && (walls || a.kind !== "window")).map((a) => {
        const spot = onWall({ width, height }, a);
        return (
          <group key={a.id} position={[spot.x, ramp(a.x, a.y), spot.z]} rotation={[0, spot.turn, 0]}>
            <Doorway kind={a.kind} color={wayColor?.(a) ?? WAY_COLORS[a.kind as keyof typeof WAY_COLORS] ?? WAY_COLORS.door} label={wayLabel?.(a)} onTap={onAsset ? () => onAsset(a) : undefined} />
          </group>
        );
      })}
      {assets.filter((a) => !a.side && a.kind !== "npc" && a.name !== "Loose flagstone").map((a) => (
        <group key={a.id} position={[a.x, (a.z ?? 0) * LEVEL_H, a.y]}>
          {a.kind === "ship" ? (ships.find((ship) => ship.id === a.ref) ? <ShipModel ship={ships.find((ship) => ship.id === a.ref)!} w={a.w} h={a.h} /> : <Berth w={a.w} h={a.h} name={a.name} />)
            : a.kind === "stairs" ? <StairsAsset w={a.w} h={a.h} up={/up/i.test(a.name)} />
            : a.kind === "loot" ? (nodeOf?.(a) ? <NodeModel node={nodeOf(a)!} empty={looted?.(a)} /> : <Chest looted={looted?.(a)} />)
            : <Furniture name={a.name} w={a.w} h={a.h} />}
          {/* Furniture that can be stood on (a bench, the stage) leaves the tap to the floor beneath, so it walks to that square */}
          {onAsset && !(onFloor && a.kind === "furniture" && !a.blocks && !useKindOf(a.name)) && <Hit at={[a.w / 2, 0.5, a.h / 2]} size={[a.w, 1, a.h]} onTap={() => onAsset(a)} />}
        </group>
      ))}
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
            <Figure kind={tokenOf(a.occupant)} ring={a.occupant.disabled ? "#6b7280" : SIDE_COLORS[a.occupant.disposition]} name={a.occupant.name} large={isLarge(a.occupant.size)} />
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
          {onTap && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onTap({ key: a.key, occupant: a.occupant, at: squareOf(a), counter: a.brain === "staff" ? a.counter : undefined })} />}
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

// People and ships on the way between places (shared/logic withPresence: `moving`), drawn where
// they are on the way and eased there between the clock's minutes. Not tappable.
// A speeder standing on the ground, hovering a hand's breadth up: a bike, a landspeeder with its
// canopy, or an airspeeder with its fins. A wreck lies tilted and dark, smoking.
function SpeederModel({ model, wrecked }: { model: string; wrecked?: boolean }) {
  const kind = /bike/i.test(model) ? "bike" : /air/i.test(model) ? "air" : "land";
  const hull = wrecked ? "#4b4742" : kind === "bike" ? "#c8663a" : kind === "air" ? "#4a7bd0" : "#d0a23a";
  const dark = wrecked ? "#2b2926" : "#2b2f36";
  const lift = wrecked ? 0.05 : 0.28;
  return (
    <group position={[0, lift, 0]} rotation={wrecked ? [0.12, 0.5, 0.18] : [0, 0, 0]}>
      {kind === "bike" ? (
        <>
          <Box at={[0, 0.2, 0]} size={[0.3, 0.2, 1.7]} color={hull} />
          <Box at={[0, 0.34, 0.5]} size={[0.5, 0.06, 0.1]} color={dark} />
          <Box at={[0, 0.4, -0.5]} size={[0.3, 0.12, 0.5]} color={dark} />
          <Cyl at={[0, 0.16, -0.95]} r={0.16} h={0.2} color={dark} />
          {!wrecked && <Box at={[0, 0.16, -1.08]} size={[0.2, 0.12, 0.06]} color={GLOW} glow={1.4} />}
        </>
      ) : kind === "air" ? (
        <>
          <Box at={[0, 0.25, 0]} size={[1.3, 0.3, 2.6]} color={hull} />
          <Box at={[0, 0.5, -0.2]} size={[0.9, 0.34, 1.2]} color="#1b2a38" />
          <Box at={[-0.85, 0.3, -0.7]} size={[0.5, 0.06, 1]} color={dark} />
          <Box at={[0.85, 0.3, -0.7]} size={[0.5, 0.06, 1]} color={dark} />
          <Box at={[0, 0.55, -1.2]} size={[0.08, 0.5, 0.5]} color={dark} />
          {!wrecked && [-0.4, 0.4].map((x) => <Box key={x} at={[x, 0.18, -1.35]} size={[0.3, 0.2, 0.08]} color={GLOW} glow={1.4} />)}
        </>
      ) : (
        <>
          <Box at={[0, 0.25, 0]} size={[1.2, 0.3, 2.2]} color={hull} />
          <Box at={[0, 0.5, -0.1]} size={[0.9, 0.28, 0.9]} color="#1b2a38" />
          <Box at={[0, 0.34, 0.95]} size={[0.8, 0.14, 0.4]} color={dark} />
          {[-0.5, 0.5].map((x) => <Cyl key={x} at={[x, 0.1, -0.9]} r={0.17} h={0.22} color={dark} />)}
          {!wrecked && [-0.5, 0.5].map((x) => <Box key={x} at={[x, 0.1, -1.05]} size={[0.22, 0.14, 0.06]} color={GLOW} glow={1.4} />)}
        </>
      )}
      {wrecked && <Solid at={[0.1, 0.9, 0]} color="#6b6862"><sphereGeometry args={[0.22, 8, 8]} /></Solid>}
    </group>
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
        <Figure kind={tokenOf({ name: companion.name, role: companion.kind === "droid" ? "utility droid" : companion.kind === "beast" ? "wildlife" : companion.role, creature: companion.creature })} ring={SIDE_COLORS.friendly} name={companion.name} large={isLarge(companion.size)} />
      </group>
      <Label at={[0, isLarge(companion.size) ? 2.2 : 1.6, 0]} size={0.26} color={SIDE_COLORS.friendly}>{companion.name}</Label>
      {onTap && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={onTap} />}
    </group>
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
          <Figure kind="person" ring="#9ca3af" />
        </group>
      ))}
    </>
  );
}

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
            : w.kind === "speeder" || w.kind === "airspeeder" ? <><Box at={[0, 0.3, 0]} size={[0.6, 0.25, 1.2]} color={w.kind === "airspeeder" ? "#3d7fb0" : "#c8663a"} /><Box at={[0, 0.48, -0.15]} size={[0.4, 0.2, 0.4]} color={GLOW} glow={0.8} /></>
            : w.kind === "mount" ? <><Solid at={[0, 0.5, 0]} color="#8a6a46" rot={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.22, 0.6, 4, 10]} /></Solid>{[[-0.14, 0.28], [0.14, 0.28], [-0.14, -0.28], [0.14, -0.28]].map(([x, z], i) => <Box key={i} at={[x, 0.2, z]} size={[0.09, 0.4, 0.09]} color="#6b4f33" />)}<Box at={[0, 0.82, 0.42]} size={[0.14, 0.34, 0.2]} color="#8a6a46" /><Box at={[0, 0.78, -0.05]} size={[0.3, 0.14, 0.4]} color="#b9424a" /></>
            : w.kind === "hauler" ? <><Box at={[0, 0.5, 0.35]} size={[0.8, 0.5, 0.5]} color="#5b6773" /><Box at={[0, 0.62, -0.45]} size={[0.9, 0.8, 1.1]} color="#c9b48a" /><Box at={[0, 0.2, 0]} size={[0.7, 0.12, 1.8]} color="#2a2f36" /></>
            : <><Solid at={[0, 0, 0]} color="#d9dde2" rot={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.5, 1.6, 8]} /></Solid><Box at={[0, 0, -0.5]} size={[1.4, 0.1, 0.5]} color="#9aa3ad" /><Box at={[0, 0, -0.85]} size={[0.3, 0.2, 0.1]} color={AMBER} glow={2} /></>}
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
          {onTap && <Hit at={[0, 0.8, 0]} size={[2, 1.8, 1.6]} onTap={() => onTap(squad, label)} />}
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
          {onTap && <Hit at={[0, 0.4, 0]} size={[1, 0.9, 1]} onTap={onTap} />}
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
const DECOR: Record<string, string[]> = { desert: ["rock", "mast"], ice: ["ice"], forest: ["tree", "rock"], jungle: ["tree", "tree", "rock"], swamp: ["tree", "rock"], temperate: ["tree", "rock"], urban: ["lamp", "crate", "kiosk", "camera"], "gas giant": ["lamp", "crate"], ocean: ["lamp", "rock"], volcanic: ["rock"], barren: ["rock"] };

function Decor({ kind }: { kind: string }) {
  if (kind === "tree") return <><Cyl at={[0.5, 0.4, 0.5]} r={0.1} h={0.8} color="#5f3f28" /><Solid at={[0.5, 1.4, 0.5]} color="#2f6b3a"><coneGeometry args={[0.5, 1.5, 7]} /></Solid></>;
  if (kind === "lamp") return <><Cyl at={[0.5, 0.9, 0.5]} r={0.05} h={1.8} color="#59636d" /><Box at={[0.5, 1.84, 0.5]} size={[0.3, 0.1, 0.3]} color="#ffd98a" glow={2} /></>;
  if (kind === "mast") return <Mast at={[0.5, 0, 0.5]} h={2} />;
  if (kind === "kiosk") return <><Box at={[0.5, 0.4, 0.5]} size={[0.5, 0.8, 0.4]} color="#2a2f36" /><Box at={[0.5, 0.95, 0.5]} size={[0.5, 0.5, 0.1]} color="#5ad1ff" glow={1} /></>;
  if (kind === "camera") return <><Cyl at={[0.5, 1.2, 0.5]} r={0.04} h={2.4} color="#59636d" /><Box at={[0.5, 2.3, 0.62]} size={[0.24, 0.2, 0.36]} color="#2a2f36" /><Box at={[0.5, 2.3, 0.82]} size={[0.1, 0.1, 0.05]} color="#e5484d" glow={2} /></>;
  if (kind === "crate") return <Box at={[0.5, 0.28, 0.5]} size={[0.6, 0.56, 0.6]} color={OLIVE} />;
  return <Rock at={[0.5, 0, 0.5]} r={0.4} color={kind === "ice" ? "#cfe3ec" : ROCK} />;
}

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
    }).map((a) => (a.kind === "ship" && !room.ships.some((ship) => ship.id === a.ref) ? { ...a, blocks: false, cover: false } : a));
  const shown = opened ? seen(opened) : [];

  // Outside: where the streets lead (a signpost for each way out of the district), a few things
  // standing about, and whoever and whatever is in front of each building
  const street = useMemo(() => {
    const none = { signs: [] as { exit: Exit; x: number; y: number }[], decor: [] as { kind: string; x: number; y: number }[], folk: [] as { occupant: Occupant; x: number; y: number }[], caches: [] as { cache: Area["loot"][number]; x: number; y: number }[], sentries: [] as { buildingId: string; key: string; occupant: Occupant; at: { x: number; y: number } }[], rigs: [] as { v: Vehicle; mine: boolean; outward: { x: number; y: number }; x: number; y: number }[], doors: {} as Record<string, { door: { x: number; y: number }; outward: { x: number; y: number } }> };
    if (!plan) return none;
    const r = createRandom(Number(buildings[0].id.replace(/\D/g, "") || 1) * 613 + 7);
    const taken = new Set<string>();
    const free = (x: number, y: number) => x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y) && !taken.has(`${x},${y}`);
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
    const folk = fronts.flatMap(({ b, door }) => b.occupants.flatMap((o, i) => Array.from({ length: Math.min(o.count, 3) }, (_, j) => ({ occupant: o, ...claim({ x: door.x - 2 - j, y: door.y + (i % 2 ? 2 + i : -2 - i) }) }))));
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
    return { signs, decor, folk, caches, sentries, rigs, doors };
  }, [world, district?.id ?? building.id]);
  // The way in of the building the party is in front of, and which way it faces
  const myFront = street.doors[me.id] ?? Object.values(street.doors)[0] ?? { door: { x: ground.x + 2, y: Math.round(cz) }, outward: { x: -1, y: 0 } };

  // A blockade (shared logic "Criminal reputation") holds the ways out of the settlement while a
  // search is on: the squares two away from each signpost, all the way round it, are barricaded, so
  // that the sign cannot be walked up to. The barricade stands only where the ground is open.
  const minutes = useClock((c) => c.minutes);
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
  const barred = useMemo(() => new Set(barricades.flatMap((b) => b.squares.map((q) => `${q.x},${q.y}`))), [barricades]);

  // Where the party can stand: the free floor of the room they are in, or the open ground outside.
  // People step aside, so only furniture stands in the way.
  const outdoors = (x: number, y: number) =>
    x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y) && !barred.has(`${x},${y}`)
    && ![...street.signs, ...street.decor, ...street.folk, ...street.caches, ...street.rigs].some((thing) => thing.x === x && thing.y === y);
  const open = (x: number, y: number) => {
    if (inside) {
      const l = inside.layout!;
      const [lx, ly] = [x - l.x, y - l.y];
      return lx >= 0 && ly >= 0 && lx < l.width && ly < l.height && !shown.some((a) => !a.side && a.blocks && a.x <= lx && lx < a.x + a.w && a.y <= ly && ly < a.y + a.h);
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
    const way = l.assets.find((a) => a.kind === "exit") ?? l.assets.find(isWay);
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
    if (token.current) token.current.position.set(feet.current.x + 0.5, heightNow(), feet.current.y + 0.5);
    eye.current = duelRef.current ? [(duelRef.current.x ?? 0) + 0.5 - cx, (duelRef.current.z ?? 0) * LEVEL_H, (duelRef.current.y ?? 0) + 0.5 - cz] : outside && planned ? [feet.current.x + 0.5 - cx, 0, feet.current.y + 0.5 - cz] : null;
    if (!going) return;
    let step = Math.min(delta, 0.5) * 7;
    while (step > 0 && going.path.length) {
      const next = going.path[0];
      const [dx, dy] = [next.x - feet.current.x, next.y - feet.current.y];
      const far = Math.hypot(dx, dy);
      if (token.current && far > 0.001) token.current.rotation.y = Math.atan2(dx, dy);
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
    if (!path) onAct?.({ type: "note", text: "There is no way through to there." });
    else walk.current = { path, then, total: path.length };
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
    else if (a.kind === "ship" && a.ref && !inside!.ships.some((ship) => ship.id === a.ref)) onAct?.({ type: "note", text: `${a.name}'s berth: the ship is away on a voyage and will be back.` });
    else if (a.kind === "ship" && a.ref) walkTo(around(l.x + a.x, l.y + a.y, a.w, a.h), () => onAct?.({ type: "ship", id: a.ref! }));
    else onAct?.({ type: "note", text: a.name });
  };
  // Something in an outside wall was tapped from the street
  const actOutside = (room: Area, a: RoomAsset) => {
    const at = [beyond(room.layout!, a)];
    if (a.kind === "window") walkTo(at, () => onAct?.({ type: "look", areaId: room.id }));
    else if (a.kind === "exit" || a.kind === "secret") walkTo(at, (squares) => onAct?.({ type: "go", areaId: room.id, secret: a.kind === "secret", squares }));
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
                  width={l.width}
                  height={l.height}
                  assets={shown}
                  floor={floor}
                  wall={wall}
                  ships={room.ships}
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
          const carries = !!opened?.layout && sameFootprint(l, opened.layout) && levelY(opened.layout) >= levelY(l) + LEVEL_H - 0.01;
          const tall = lookedFrom ? 0.8 : opened && !carries ? 1 : 2;
          const body = tall + rise(l);
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
                  <RoomShell plan={l} width={l.width} height={l.height} assets={seen(room).filter((a) => a.kind !== "npc")} floor={floor} wall={wall} wayColor={wayColor} wayLabel={() => undefined} />
                  {/* Who stands on it, to be seen from the street */}
                  {!duel && l.assets.filter((a) => a.kind === "npc").map((a) => {
                    const o = room.occupants.find((x) => x.id === a.ref);
                    return o ? (
                      <group key={a.id} position={[a.x + 0.5, 0, a.y + 0.5]}>
                        <Figure kind={tokenOf(o)} ring={SIDE_COLORS[o.disposition]} name={o.name} large={isLarge(o.size)} />
                        <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS[o.disposition]}>{o.name}</Label>
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} />
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
                          {tappable && <Hit at={[0, top / 2, sign * 0.3]} size={[0.9, top, 0.8]} onTap={() => actOutside(room, a)} />}
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
                        <Figure kind={tokenOf(o)} ring={SIDE_COLORS[o.disposition]} name={o.name} large={isLarge(o.size)} />
                        <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS[o.disposition]}>{o.name}</Label>
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} />
                      </group>
                    ) : null;
                  })}
                  <Box at={[l.width / 2, 0.45, l.height - 0.04]} size={[l.width, 0.04, 0.05]} color="#c8ccd2" />
                  {[0, 1, 2, 3].map((i) => <Box key={i} at={[0.1 + (i * (l.width - 0.2)) / 3, 0.25, l.height - 0.04]} size={[0.05, 0.5, 0.05]} color="#c8ccd2" />)}
                </group>
              ) : lookedFrom ? (
                // The room under a mezzanine is looked down into, not boxed in: its floor, low walls and what is in it
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  <RoomShell plan={l} width={l.width} height={l.height} assets={seen(room).filter((a) => a.kind !== "npc")} floor={floor} wall={wall} ships={room.ships} wayColor={wayColor} wayLabel={() => undefined} />
                  {!duel && l.assets.filter((a) => a.kind === "npc").map((a) => {
                    const o = room.occupants.find((x) => x.id === a.ref);
                    return o ? (
                      <group key={a.id} position={[a.x + 0.5, 0, a.y + 0.5]}>
                        <Figure kind={tokenOf(o)} ring={SIDE_COLORS[o.disposition]} name={o.name} large={isLarge(o.size)} />
                        <Label at={[0, 1.7, 0]} size={0.26} color={SIDE_COLORS[o.disposition]}>{o.name}</Label>
                        <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => onAct?.({ type: "occupant", id: o.id })} />
                      </group>
                    ) : null;
                  })}
                </group>
              ) : l.roof ? (
                <group onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                  {/* Open to the sky, the ships inside it to be seen; where the air is no good, doors in the roof slide back */}
                  <Box at={[l.width / 2, 0.04, l.height / 2]} size={[l.width, 0.08, l.height]} color={FLOORS.hangar} />
                  {hollow(tall, wallColor)}
                  {l.assets.filter((a) => a.kind === "ship").map((a) => {
                    const ship = room.ships.find((x) => x.id === a.ref);
                    return <group key={a.id} position={[a.x, 0, a.y]}>{ship ? <ShipModel ship={ship} w={a.w} h={a.h} /> : <Berth w={a.w} h={a.h} name={a.name} />}</group>;
                  })}
                  {l.roof === "hangar" && !opened && <HangarRoof width={l.width} height={l.height} y={tall + 0.05} />}
                </group>
              ) : (
                <>
                  <mesh position={[l.width / 2, body / 2, l.height / 2]} castShadow onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                    <boxGeometry args={[l.width, body, l.height]} />
                    <meshLambertMaterial color={wallColor} />
                  </mesh>
                  {!roofed.has(room.id) && <Box at={[l.width / 2, body + 0.05, l.height / 2]} size={[l.width + 0.2, 0.1, l.height + 0.2]} color={opened ? "#1a2028" : "#4a525c"} />}
                  {!opened && !form && !roofed.has(room.id) && (
                    <>
                      {/* A parapet round the roof, and what stands on it */}
                      <Box at={[l.width / 2, tall + 0.2, 0.06]} size={[l.width + 0.2, 0.3, 0.12]} color={wall} />
                      <Box at={[l.width / 2, tall + 0.2, l.height - 0.06]} size={[l.width + 0.2, 0.3, 0.12]} color={wall} />
                      <Box at={[0.06, tall + 0.2, l.height / 2]} size={[0.12, 0.3, l.height]} color={wall} />
                      <Box at={[l.width - 0.06, tall + 0.2, l.height / 2]} size={[0.12, 0.3, l.height]} color={wall} />
                      {room.gateway ? <Dome at={[l.width / 2, tall + 0.1, l.height / 2]} r={Math.min(l.width, l.height) * 0.3} color={wall} />
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
                      <meshBasicMaterial color={WAY_COLORS[a.kind as keyof typeof WAY_COLORS]} transparent opacity={0.45} depthWrite={false} />
                    </mesh>
                  )}
                  <group position={[at.x, 0, at.z]} rotation={[0, at.turn, 0]}>
                    <Doorway kind={a.kind} color={WAY_COLORS[a.kind as keyof typeof WAY_COLORS]} label={a.kind === "exit" ? (a.name === "Way out" ? "Way in" : "Back way in") : a.kind === "secret" ? a.name : undefined} onTap={tappable ? () => actOutside(room, a) : undefined} />
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
                {tappable && <Hit at={[0, 0.8, 0]} size={[1.2, 1.8, 1.2]} onTap={() => (blockade ? onAct?.({ type: "note", text: "The officers hold the way out: barricades across the road until the search is called off." }) : walkTo(around(x, y), () => onAct?.({ type: "exit", exit })))} />}
              </group>
            ))}
            {barricades.map((b) => (
              <Barricade key={`${b.sign.x},${b.sign.y}`} squares={b.squares} guards={b.guards} onTap={tappable ? () => onAct?.({ type: "note", text: "Barricades. The officers are holding this way out until the search is called off." }) : undefined} />
            ))}
            {!duel && <Squads spots={squadSpots} onTap={tappable ? (squad, label) => onAct?.({ type: "note", text: `${squad.heavy ? "Troopers" : "Constables"} (${squad.count}) are searching the district ${label ?? ""}.` }) : undefined} />}
            {street.decor.map((d, i) => (
              <group key={i} position={[d.x, 0, d.y]}>
                <Decor kind={d.kind} />
                {tappable && (d.kind === "kiosk" || d.kind === "camera") && <Hit at={[0.5, 0.8, 0.5]} size={[1, 1.8, 1]} onTap={() => walkTo(around(d.x, d.y), () => onAct?.({ type: "use", areaId: me.id, id: `street:${d.kind}:${d.x},${d.y}`, name: d.kind === "kiosk" ? "Info kiosk" : "Security camera" }))} />}
              </group>
            ))}
            {street.folk.map(({ occupant, x, y }, i) => (
              <group key={`${occupant.id}-${i}`} position={[x + 0.5, 0, y + 0.5]}>
                <Figure kind={tokenOf(occupant)} ring={SIDE_COLORS[occupant.disposition]} name={occupant.name} large={isLarge(occupant.size)} />
                <Label at={[0, 1.6, 0]} size={0.26} color={SIDE_COLORS[occupant.disposition]}>{occupant.name}</Label>
                {tappable && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "occupant", id: occupant.id }))} />}
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
            {!duel && <Strollers strolls={strolls} />}
            {street.rigs.map(({ v, mine, outward, x, y }) => (
              <group key={v.id} position={[x + 0.5, 0, y + 0.5]} rotation={[0, Math.atan2(outward.x || 0.0001, outward.y || 0.0001), 0]}>
                <SpeederModel model={v.model} wrecked={v.status === "wrecked"} />
                <Label at={[0, 1.5, 0]} size={0.26} color={mine ? SIDE_COLORS.player : SIDE_COLORS.neutral}>{`${v.name}${v.status === "wrecked" ? " (wreck)" : ""}`}</Label>
                {tappable && <Hit at={[0, 0.5, 0]} size={[1.6, 1.2, 2.4]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "vehicle", id: v.id }))} />}
              </group>
            ))}
            {street.caches.map(({ cache, x, y }) => (
              <group key={cache.id} position={[x, 0, y]}>
                {cache.node ? <NodeModel node={cache.node} empty={nodeAt(cache.node, minutes).charges === 0} /> : <Chest looted={cache.looted} />}
                {tappable && <Hit at={[0.5, 0.4, 0.5]} size={[1, 0.8, 1]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "loot", id: cache.id }))} />}
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
      <Rig target={focus} offset={opened ? [0, reach * 0.95, reach * 0.75] : [-reach * 0.75, reach * 0.75, reach * 0.6]} min={4} max={120} fov={45} follow={eye} />
      <Sky cast={!districtPlan || !!opened} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// A fight on a district's own map (the streets, the roofs and the catwalks, all of it in sight):
// the squares the character can reach are lit at their height, everyone stands on theirs with a
// bar of hit points, and a tap on a lit square moves there and a tap on an enemy picks it out.
// ---------------------------------------------------------------------------------------------

function DuelPieces() {
  const { combatants, currentTurn, arena, targetId, moveTo, setTarget } = useCombat();
  const current = combatants[currentTurn];
  const player = combatants.find((c) => c.isPlayer);
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !cannotAct(player!);
  const target = player ? pickTarget(combatants, player, targetId) : undefined;
  const steps = playerTurn && player ? reachable(arena, combatants, player) : new Map<string, { cost: number }>();
  const plan = player && target ? attackPlan(arena, combatants, player, target, player.rangedDice ? "ranged" : "melee") : undefined;
  const high = (z?: number) => (z ?? 0) * LEVEL_H;
  return (
    <>
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
      {combatants.map((c) => {
        const down = c.hp <= 0;
        const large = isLarge(c.size);
        const side = c.isPlayer ? SIDE_COLORS.player : c.ally ? SIDE_COLORS.friendly : SIDE_COLORS.hostile;
        return (
          <group key={String(c.id)} position={[(c.x ?? 0) + 0.5, high(c.z), (c.y ?? 0) + 0.5]}>
            <group rotation={down ? [-Math.PI / 2, 0, 0.4] : [0, c.isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]} position={[0, down ? 0.14 : 0, 0]}>
              <Figure kind={tokenOf({ name: c.name, role: c.role, creature: c.creature, isPlayer: c.isPlayer, forceUser: c.role === "force" })} ring={side} name={c.name} large={large} marker={c.isPlayer && !down} />
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
            {!down && !onPartySide(c) && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => setTarget(c.id)} />}
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
  const { combatants, currentTurn, arena, targetId, moveTo, setTarget } = useCombat();
  const current = combatants[currentTurn];
  const player = combatants.find((c) => c.isPlayer);
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !cannotAct(player!);
  const target = player ? pickTarget(combatants, player, targetId) : undefined;
  const steps = playerTurn && player ? reachable(arena, combatants, player) : new Map<string, { cost: number }>();
  const covered = player && target && player.rangedDice ? attackPlan(arena, combatants, player, target, "ranged").cover.bonus > 0 : false;
  const cx = arena.width / 2;
  const cz = arena.height / 2;
  const reach = Math.max(arena.width, arena.height) * 1.1 + 6;

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
        <RoomShell width={arena.width} height={arena.height} assets={arena.assets.filter((a) => a.kind !== "npc")} floor={floorOf(arena.floor)} wall={wall} walls={!arena.open} onFloor={tapSquare} onAsset={(a) => !a.side && tapSquare(a.x, a.y)}>
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
          {combatants.map((c) => {
            const down = c.hp <= 0;
            const large = isLarge(c.size);
            const side = c.isPlayer ? SIDE_COLORS.player : c.ally ? SIDE_COLORS.friendly : SIDE_COLORS.hostile;
            return (
              <group key={String(c.id)} position={[(c.x ?? 0) + 0.5, (c.z ?? 0) * LEVEL_H + ((c.z ?? 0) ? 0.12 : 0), (c.y ?? 0) + 0.5]}>
                {/* The fallen lie where they fell */}
                <group rotation={down ? [-Math.PI / 2, 0, 0.4] : [0, c.isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]} position={[0, down ? 0.14 : 0, 0]}>
                  <Figure kind={tokenOf({ name: c.name, role: c.role, creature: c.creature, isPlayer: c.isPlayer, forceUser: c.role === "force" })} ring={side} name={c.name} large={large} marker={c.isPlayer && !down} />
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
                {!down && !onPartySide(c) && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => setTarget(c.id)} />}
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
          return key.startsWith("sq:") ? [x + 0.5 - cx, 0, y + 0.5 - cz] : undefined;
        }}
      />
      <Rig target={[0, 0, 0]} offset={[0, reach * 0.95, reach * 0.75]} min={4} max={90} fov={45} />
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
            {!s.destroyed && s.side === "foe" && <Hit at={[0, 0.6, 0]} size={[Math.max(w, 1.2), 1.4, Math.max(h, 1.2)]} onTap={() => setTarget(s.id)} />}
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
  const places = childrenOf(world, view.id);
  const ids = new Set(places.map((a) => a.id));
  const paths = world.paths.filter((p) => ids.has(p.from) && ids.has(p.to) && !p.hidden);
  const partyTrail = new Set(trailOf(world, hereId).map((a) => a.id));
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
              <Figure kind={tokenOf({ name: c.name, role: c.kind === "droid" ? "utility droid" : c.kind === "beast" ? "wildlife" : c.role, creature: c.creature })} ring={SIDE_COLORS.friendly} name={c.name} />
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
