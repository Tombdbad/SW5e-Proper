import { useRef, useState, useEffect, useMemo, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, useTexture, OrbitControls, PerspectiveCamera, Billboard, Line, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useKeyboardControls } from "@react-three/drei";
import { create } from "zustand";
import { useMap } from "@/lib/stores/useMap";
import { useCombat, attackPlan, cannotAct, pickTarget, reachable } from "@/lib/stores/useCombat";
import { childrenOf, trailOf, exitsOf, floorPlan, createRandom, type Area, type Exit, type Occupant, type RoomAsset, type RoomLayout, type Ship, type World } from "@shared/logic";
import GalaxyMap, { Probe, Rig, useTaps, type MapAction } from "./GalaxyMap";
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

// ---------------------------------------------------------------------------------------------
// Models. Places are built from a few plain solids in the look of the setting: sand-coloured
// domes and vaporator masts in the desert, grey towers in the cities, bunkers with turrets,
// landing pads ringed with lights, tents, rock and broken columns in the wild.
// ---------------------------------------------------------------------------------------------

type V3 = [number, number, number];
const Solid = ({ at, color, glow, rot, children }: { at: V3; color: string; glow?: number; rot?: V3; children: ReactNode }) => (
  <mesh position={at} rotation={rot} castShadow>
    {children}
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow ?? 0.08} roughness={0.9} />
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
  if (/warehouse|cargo/.test(type)) return <><Box at={[0, 0.6, 0]} size={[3.2, 1.2, 2]} color={STEEL} /><mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[1, 1, 3.2, 16, 1, false, 0, Math.PI]} /><meshStandardMaterial color="#59636d" /></mesh><Box at={[0, 0.5, 1.02]} size={[1.6, 1, 0.05]} color="#2f363d" /><Box at={[2, 0.3, 0.6]} size={[0.6, 0.6, 0.6]} color="#6f7448" /></>;
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
  if (/station/.test(type)) return <><mesh position={[0, 1.4, 0]} rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[1.8, 0.28, 10, 32]} /><meshStandardMaterial color={STEEL} emissive={STEEL} emissiveIntensity={0.15} /></mesh><Cyl at={[0, 1.4, 0]} r={0.5} h={2.4} color="#a3adba" /><Box at={[0, 2.7, 0]} size={[0.2, 0.2, 0.2]} color="#ff5a5a" glow={2} /></>;
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
  else if (kind === "hutt") body = <><mesh position={[0, 0.4, -0.05]} scale={[0.5, 0.45, 0.62]} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#7c8a4a" roughness={0.9} /></mesh><Solid at={[0, 0.16, -0.62]} color="#7c8a4a" rot={[-1.4, 0, 0]}><coneGeometry args={[0.2, 0.6, 8]} /></Solid><Solid at={[0, 0.92, 0.12]} color="#8a985a"><sphereGeometry args={[0.26, 14, 12]} /></Solid><Box at={[-0.1, 0.98, 0.35]} size={[0.06, 0.05, 0.04]} color="#f0a03c" glow={1.5} /><Box at={[0.1, 0.98, 0.35]} size={[0.06, 0.05, 0.04]} color="#f0a03c" glow={1.5} /></>;
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
  if (/bacta tank/.test(n)) return <><Cyl at={[cx, 0.1, cz]} r={0.36} h={0.2} color={DARK} /><mesh position={[cx, 0.8, cz]}><cylinderGeometry args={[0.3, 0.3, 1.2, 16]} /><meshStandardMaterial color="#58c9b0" emissive="#58c9b0" emissiveIntensity={0.5} transparent opacity={0.55} /></mesh><Cyl at={[cx, 1.46, cz]} r={0.34} h={0.12} color={DARK} /></>;
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
  if (/command chair/.test(n)) return <><Cyl at={[cx, 0.16, cz]} r={0.1} h={0.32} color={DARK} /><Box at={[cx, 0.36, cz]} size={[0.5, 0.1, 0.5]} color="#3d4856" /><Box at={[cx, 0.72, cz - 0.22]} size={[0.5, 0.7, 0.1]} color="#3d4856" /></>;
  if (/barricade/.test(n)) return <><Box at={[cx, 0.34, cz]} size={[w - 0.1, 0.68, h * 0.3]} color="#59636d" rot={wide ? [0.2, 0, 0] : [0, 0, 0.2]} /><Box at={[cx, 0.5, cz]} size={[w * 0.5, 0.08, h * 0.32]} color={AMBER} /></>;
  if (/lifter droid dock/.test(n)) return <><Box at={[cx, 0.05, cz]} size={[0.8, 0.1, 0.8]} color={DARK} /><Box at={[cx - 0.3, 0.5, cz - 0.3]} size={[0.1, 1, 0.1]} color="#7b8794" /><Box at={[cx - 0.3, 1.02, cz - 0.3]} size={[0.12, 0.08, 0.12]} color="#58c98b" glow={2} /></>;
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

// A ship on the floor, built on 6 by 4 squares with the bow to +x and stretched to its footprint
function ShipModel({ ship, w, h }: { ship: Pick<Ship, "size" | "role" | "status">; w: number; h: number }) {
  const role = `${ship.role} ${ship.size}`.toLowerCase();
  const wrecked = ship.status === "wrecked";
  const hull = wrecked ? "#5a554f" : "#aeb6bd";
  const dark = "#59636d";
  const glass = <meshStandardMaterial color="#1b2a38" emissive={GLOW} emissiveIntensity={0.25} roughness={0.2} />;
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
        <mesh position={[0, 0.62, 0]}><boxGeometry args={[0.76, 0.42, WALL_THICK + 0.08]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.7} /></mesh>
      ) : kind === "secret" ? (
        <><Box at={[0, 0.3, 0]} size={[0.74, 0.5, WALL_THICK + 0.1]} color="#1b1524" />{[-0.24, -0.08, 0.08, 0.24].map((x) => <Box key={x} at={[x, 0.3, 0]} size={[0.05, 0.46, WALL_THICK + 0.14]} color={color} glow={1.2} />)}</>
      ) : (
        <>
          <Box at={[-0.46, 0.7, 0]} size={[0.1, 1.4, 0.26]} color="#59636d" />
          <Box at={[0.46, 0.7, 0]} size={[0.1, 1.4, 0.26]} color="#59636d" />
          <Box at={[0, 1.4, 0]} size={[1.02, 0.1, 0.26]} color="#59636d" />
          <mesh position={[0, 0.68, 0]}><boxGeometry args={[0.82, 1.34, 0.07]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.6} /></mesh>
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

function RoomShell({ width, height, assets, floor, wall, ships = [], walls = true, looted, wayColor, wayLabel, onFloor, onAsset, children }: {
  width: number;
  height: number;
  assets: RoomAsset[];
  floor: FloorKind;
  wall: string;
  ships?: Ship[];
  // Open ground has no walls, only posts at its corners
  walls?: boolean;
  looted?: (asset: RoomAsset) => boolean;
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
  const sides = [
    { side: "n", length: width, at: (a: number, b: number): [V3, V3] => [[(a + b) / 2, WALL_HEIGHT / 2, 0], [b - a + (a === 0 ? WALL_THICK / 2 : 0) + (b === width ? WALL_THICK / 2 : 0), WALL_HEIGHT, WALL_THICK]], along: (a: RoomAsset) => a.x },
    { side: "s", length: width, at: (a: number, b: number): [V3, V3] => [[(a + b) / 2, WALL_HEIGHT / 2, height], [b - a + (a === 0 ? WALL_THICK / 2 : 0) + (b === width ? WALL_THICK / 2 : 0), WALL_HEIGHT, WALL_THICK]], along: (a: RoomAsset) => a.x },
    { side: "w", length: height, at: (a: number, b: number): [V3, V3] => [[0, WALL_HEIGHT / 2, (a + b) / 2], [WALL_THICK, WALL_HEIGHT, b - a]], along: (a: RoomAsset) => a.y },
    { side: "e", length: height, at: (a: number, b: number): [V3, V3] => [[width, WALL_HEIGHT / 2, (a + b) / 2], [WALL_THICK, WALL_HEIGHT, b - a]], along: (a: RoomAsset) => a.y },
  ];
  return (
    <>
      <mesh position={[width / 2, -0.1, height / 2]} receiveShadow onClick={onFloor ? (e) => { e.stopPropagation(); if (e.delta > 8) return; const p = e.object.worldToLocal(e.point.clone()); onFloor(Math.max(0, Math.min(width - 1, Math.floor(p.x + width / 2))), Math.max(0, Math.min(height - 1, Math.floor(p.z + height / 2)))); } : undefined}>
        <boxGeometry args={[width, 0.2, height]} />
        <meshStandardMaterial color={FLOORS[floor]} roughness={0.95} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={grid.length / 3} array={grid} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </lineSegments>
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
          <group key={a.id} position={[spot.x, 0, spot.z]} rotation={[0, spot.turn, 0]}>
            <Doorway kind={a.kind} color={wayColor?.(a) ?? WAY_COLORS[a.kind as keyof typeof WAY_COLORS] ?? WAY_COLORS.door} label={wayLabel?.(a)} onTap={onAsset ? () => onAsset(a) : undefined} />
          </group>
        );
      })}
      {assets.filter((a) => !a.side && a.kind !== "npc").map((a) => (
        <group key={a.id} position={[a.x, 0, a.y]}>
          {a.kind === "ship" ? <ShipModel ship={ships.find((ship) => ship.id === a.ref) ?? { size: "Medium", role: "freighter", status: "landed" }} w={a.w} h={a.h} />
            : a.kind === "loot" ? <Chest looted={looted?.(a)} />
            : <Furniture name={a.name} w={a.w} h={a.h} />}
          {onAsset && <Hit at={[a.w / 2, 0.5, a.h / 2]} size={[a.w, 1, a.h]} onTap={() => onAsset(a)} />}
        </group>
      ))}
      {children}
    </>
  );
}

// Walks over open squares, round what stands in the way and never across a corner, from one
// square to the nearest of the goals. The squares to step on, without the first; null if no way.
function route(open: (x: number, y: number) => boolean, from: { x: number; y: number }, goals: { x: number; y: number }[]): { x: number; y: number }[] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  const wanted = new Set(goals.map((g) => key(g.x, g.y)));
  const came = new Map<string, string | null>([[key(from.x, from.y), null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (wanted.has(key(at.x, at.y))) {
      const steps: { x: number; y: number }[] = [];
      for (let k: string | null = key(at.x, at.y); k && came.get(k); k = came.get(k)!) steps.unshift({ x: Number(k.split(",")[0]), y: Number(k.split(",")[1]) });
      return steps;
    }
    if (came.size > 4000) break;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = at.x + dx;
      const y = at.y + dy;
      if ((!dx && !dy) || came.has(key(x, y)) || !open(x, y)) continue;
      if (dx && dy && (!open(at.x + dx, at.y) || !open(at.x, at.y + dy))) continue;
      came.set(key(x, y), key(at.x, at.y));
      queue.push({ x, y });
    }
  }
  return null;
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

// ---------------------------------------------------------------------------------------------
// A building and the ground around it, to the scale of its floor plan. Standing outside, the
// party sees it closed: its ways in, its windows, a secret way once it has been found, and
// signposts to wherever its street leads. Inside, the room they are in is opened up. A tap on
// the ground walks there; a tap on a door, a cache, someone or a ship walks up to it first.
// ---------------------------------------------------------------------------------------------

const MARGIN = 6;
const DECOR: Record<string, string[]> = { desert: ["rock", "mast"], ice: ["ice"], forest: ["tree", "rock"], jungle: ["tree", "tree", "rock"], swamp: ["tree", "rock"], temperate: ["tree", "rock"], urban: ["lamp", "crate"], "gas giant": ["lamp", "crate"], ocean: ["lamp", "rock"], volcanic: ["rock"], barren: ["rock"] };

function Decor({ kind }: { kind: string }) {
  if (kind === "tree") return <><Cyl at={[0.5, 0.4, 0.5]} r={0.1} h={0.8} color="#5f3f28" /><Solid at={[0.5, 1.4, 0.5]} color="#2f6b3a"><coneGeometry args={[0.5, 1.5, 7]} /></Solid></>;
  if (kind === "lamp") return <><Cyl at={[0.5, 0.9, 0.5]} r={0.05} h={1.8} color="#59636d" /><Box at={[0.5, 1.84, 0.5]} size={[0.3, 0.1, 0.3]} color="#ffd98a" glow={2} /></>;
  if (kind === "mast") return <Mast at={[0.5, 0, 0.5]} h={2} />;
  if (kind === "crate") return <Box at={[0.5, 0.28, 0.5]} size={[0.6, 0.56, 0.6]} color={OLIVE} />;
  return <Rock at={[0.5, 0, 0.5]} r={0.4} color={kind === "ice" ? "#cfe3ec" : ROCK} />;
}

// The square outside a wall that something set in it opens on to (on the building's grid)
const beyond = (l: RoomLayout, a: RoomAsset) => ({ x: l.x + a.x + (a.side === "e" ? 1 : a.side === "w" ? -1 : 0), y: l.y + a.y + (a.side === "s" ? 1 : a.side === "n" ? -1 : 0) });

function BuildingScene({ world, building, hereId, selectedId, onAct, locked, reveal }: { world: World; building: Area; hereId: string; selectedId?: string | null; onAct?: (action: MapAction) => void; locked?: boolean; reveal?: boolean }) {
  const rooms = childrenOf(world, building.id).filter((a) => a.kind === "room");
  const plan = floorPlan(world, building.id);
  const planned = !!plan && rooms.every((a) => a.layout);
  const trail = trailOf(world, building.id);
  const biome = trail.find((a) => a.kind === "planet")?.type ?? "";
  const wall = trail.some((a) => a.type === "station") ? STEEL : WALLS[biome] ?? "#b9ad96";
  const here = world.areas[hereId];
  // The room the party is in, or whether it stands outside; a room opened up to look at (the atlas)
  const inside = planned && here?.kind === "room" && here.parentId === building.id ? here : null;
  const outside = hereId === building.id;
  const present = planned && (!!inside || outside);
  const opened = inside ?? (reveal && planned ? rooms.find((a) => a.id === selectedId) ?? null : null);
  const tapPlace = useTaps(onAct);

  // The ground: the plan and a margin round it
  const ground = plan ? { x: plan.x - MARGIN, y: plan.y - MARGIN, w: plan.width + MARGIN * 2, h: plan.height + MARGIN * 2 } : { x: -8, y: -8, w: 16, h: 16 };
  const cx = ground.x + ground.w / 2;
  const cz = ground.y + ground.h / 2;
  const inRoom = (x: number, y: number) => rooms.some((a) => a.layout && x >= a.layout.x && x < a.layout.x + a.layout.width && y >= a.layout.y && y < a.layout.y + a.layout.height);

  // What is to be seen in the opened room: hidden doors, caches and secret ways only once found
  const seen = (room: Area) =>
    room.layout!.assets.filter((a) => {
      if (a.kind === "door") return !world.paths.find((p) => p.id === a.ref)?.hidden;
      if (a.kind === "secret") return !!room.secretEntry?.found;
      if (a.kind === "loot") return room.loot.some((c) => c.id === a.ref && !c.hidden);
      if (a.kind === "npc") return room.occupants.some((o) => o.id === a.ref);
      if (a.kind === "ship") return room.ships.some((ship) => ship.id === a.ref);
      return true;
    });
  const shown = opened ? seen(opened) : [];

  // Outside: where the street leads (a signpost for each way), a few things standing about, and
  // whoever and whatever is in front of the building
  const street = useMemo(() => {
    if (!plan) return { signs: [], decor: [], folk: [], caches: [], door: { x: 0, y: 0 } };
    const r = createRandom(Number(building.id.replace(/\D/g, "") || 1) * 613 + 7);
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
    // In front of the main way in
    const root = rooms.find((a) => a.gateway) ?? rooms[0];
    const wayOut = root?.layout?.assets.find((a) => a.kind === "exit");
    const door = root?.layout && wayOut ? beyond(root.layout, wayOut) : { x: ground.x + 2, y: Math.round(cz) };
    taken.add(`${door.x},${door.y}`);
    for (const room of rooms) for (const a of room.layout?.assets ?? []) if (a.side) { const b = beyond(room.layout!, a); taken.add(`${b.x},${b.y}`); }
    // A street leads off towards the place it goes to; the way out of the settlement is the far side
    const leads = exitsOf(world, building.id).filter((e) => e.via !== "enter" && !e.hidden);
    const signs = leads.map((exit, index) => {
      const to = world.areas[exit.to];
      let dx = to.position.x - building.position.x;
      let dz = to.position.z - building.position.z;
      if (exit.via === "leave" || (!dx && !dz)) [dx, dz] = [-1, index % 2 ? 0.6 : -0.6];
      const k = Math.min((ground.w / 2 - 1.5) / Math.max(0.001, Math.abs(dx)), (ground.h / 2 - 1.5) / Math.max(0.001, Math.abs(dz)));
      return { exit, ...claim({ x: cx - 0.5 + dx * k, y: cz - 0.5 + dz * k }, 4) };
    });
    const folk = building.occupants.flatMap((o, i) => Array.from({ length: Math.min(o.count, 3) }, (_, j) => ({ occupant: o, ...claim({ x: door.x - 2 - j, y: door.y + (i % 2 ? 2 + i : -2 - i) }) })));
    const caches = building.loot.filter((c) => !c.hidden).map((cache, i) => ({ cache, ...claim({ x: door.x + 1, y: door.y + 3 + i }) }));
    const kinds = DECOR[biome] ?? DECOR.temperate;
    const decor = Array.from({ length: 9 }, () => ({ kind: r.pick(kinds), x: ground.x + r.int(0, ground.w - 1), y: ground.y + r.int(0, ground.h - 1) }))
      .filter((d) => free(d.x, d.y) && ![-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => inRoom(d.x + dx, d.y + dy) || taken.has(`${d.x + dx},${d.y + dy}`))));
    return { signs, decor, folk, caches, door };
  }, [world, building.id]);

  // Where the party can stand: the free floor of the room they are in, or the open ground outside
  const open = (x: number, y: number) => {
    if (inside) {
      const l = inside.layout!;
      const [lx, ly] = [x - l.x, y - l.y];
      return lx >= 0 && ly >= 0 && lx < l.width && ly < l.height && !shown.some((a) => !a.side && (a.blocks || a.kind === "npc") && a.x <= lx && lx < a.x + a.w && a.y <= ly && ly < a.y + a.h);
    }
    return x >= ground.x && y >= ground.y && x < ground.x + ground.w && y < ground.y + ground.h && !inRoom(x, y)
      && ![...street.signs, ...street.decor, ...street.folk, ...street.caches].some((thing) => thing.x === x && thing.y === y);
  };

  // Where they stand on arriving: where they stood, if they came from another part of this
  // building (so through a door they come out just beyond it); else at the way in
  const spot = usePartySpot();
  const entry = useMemo(() => {
    if (!present) return { x: 0, y: 0 };
    const last = usePartySpot.getState();
    const from = last.areaId ? world.areas[last.areaId] : undefined;
    if (from && (from.id === building.id || from.parentId === building.id)) return nearestOpen(open, last);
    if (!inside) return nearestOpen(open, street.door);
    const l = inside.layout!;
    const way = l.assets.find((a) => a.kind === "exit") ?? l.assets.find(isWay);
    return nearestOpen(open, way ? { x: l.x + way.x, y: l.y + way.y } : { x: l.x, y: l.y });
  }, [hereId, present]);
  const standing = spot.areaId === hereId ? spot : entry;
  const token = useRef<THREE.Group>(null);
  const feet = useRef({ x: standing.x, y: standing.y });
  // Where the camera looks when the party is out of doors: at the party
  const eye = useRef<V3 | null>(null);
  const walk = useRef<{ path: { x: number; y: number }[]; then?: () => void } | null>(null);
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
  useFrame((_, delta) => {
    const going = walk.current;
    if (token.current) token.current.position.set(feet.current.x + 0.5, 0, feet.current.y + 0.5);
    eye.current = outside && planned ? [feet.current.x + 0.5 - cx, 0, feet.current.y + 0.5 - cz] : null;
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
      } else {
        feet.current = { x: feet.current.x + (dx / far) * step, y: feet.current.y + (dy / far) * step };
        step = 0;
      }
    }
    if (!going.path.length) {
      walk.current = null;
      spot.stand(hereId, feet.current.x, feet.current.y);
      going.then?.();
      // Stopping within two squares of a secret way nobody has found: the game sees whether it is noticed
      for (const room of inside ? [inside] : rooms) {
        const way = room.secretEntry && !room.secretEntry.found ? room.layout?.assets.find((a) => a.kind === "secret") : undefined;
        if (!way) continue;
        const at = inside ? { x: room.layout!.x + way.x, y: room.layout!.y + way.y } : beyond(room.layout!, way);
        if (Math.max(Math.abs(at.x - feet.current.x), Math.abs(at.y - feet.current.y)) <= 2) onAct?.({ type: "near", areaId: room.id });
      }
    }
  });

  // Walk to a square, or up to something that stands on the given squares, then do what was asked
  const active = present && !locked;
  const walkTo = (goals: { x: number; y: number }[], then?: () => void) => {
    if (!active) return;
    const from = { x: Math.round(feet.current.x), y: Math.round(feet.current.y) };
    const path = route(open, from, goals.filter((g) => open(g.x, g.y) || (g.x === from.x && g.y === from.y)));
    if (!path) onAct?.({ type: "note", text: "There is no way through to there." });
    else walk.current = { path, then };
  };
  const around = (x: number, y: number, w = 1, h = 1) => {
    const squares: { x: number; y: number }[] = [];
    for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) if (i < x || i >= x + w || j < y || j >= y + h) squares.push({ x: i, y: j });
    return squares;
  };

  // Something in the room the party is in was tapped
  const actOn = (a: RoomAsset) => {
    const l = inside!.layout!;
    if (a.kind === "window") onAct?.({ type: "note", text: "A window onto the street outside." });
    else if (a.side) walkTo([{ x: l.x + a.x, y: l.y + a.y }], () => a.to && onAct?.({ type: "go", areaId: a.to, secret: a.kind === "secret" }));
    else if (a.kind === "loot" && a.ref) walkTo(around(l.x + a.x, l.y + a.y), () => onAct?.({ type: "loot", id: a.ref! }));
    else if (a.kind === "ship" && a.ref) walkTo(around(l.x + a.x, l.y + a.y, a.w, a.h), () => onAct?.({ type: "ship", id: a.ref! }));
    else onAct?.({ type: "note", text: a.name });
  };
  // Something in an outside wall was tapped from the street
  const actOutside = (room: Area, a: RoomAsset) => {
    const at = [beyond(room.layout!, a)];
    if (a.kind === "window") walkTo(at, () => onAct?.({ type: "look", areaId: room.id }));
    else if (a.kind === "exit" || a.kind === "secret") walkTo(at, () => onAct?.({ type: "go", areaId: room.id, secret: a.kind === "secret" }));
    else onAct?.({ type: "note", text: `${a.name}: a passage between two parts of the building.` });
  };
  const wayColor = (a: RoomAsset) => (a.kind === "door" && world.paths.find((p) => p.id === a.ref)?.locked ? WAY_COLORS.locked : WAY_COLORS[a.kind as keyof typeof WAY_COLORS] ?? WAY_COLORS.door);
  const wayLabel = (a: RoomAsset) => {
    if (a.kind === "window") return undefined;
    const lock = a.kind === "door" ? world.paths.find((p) => p.id === a.ref)?.locked : undefined;
    return `${a.kind === "door" ? world.areas[a.to ?? ""]?.name ?? a.name : a.kind === "exit" ? "Outside" : a.name}${lock ? ` (locked, DC ${lock})` : ""}`;
  };

  // The camera looks at the opened room, at the party when it is out of doors, else at the building
  const focus: V3 = opened?.layout ? [opened.layout.x + opened.layout.width / 2 - cx, 0, opened.layout.y + opened.layout.height / 2 - cz] : outside && planned ? [standing.x + 0.5 - cx, 0, standing.y + 0.5 - cz] : [0, 0, 0];
  const reach = opened?.layout ? Math.max(opened.layout.width, opened.layout.height) * 1.1 + 6 : outside && planned ? 17 : plan ? Math.max(plan.width, plan.height) * 0.9 + 12 : 22;
  // The squares of the ground, as faint lines
  const squares = useMemo(() => {
    const points: number[] = [];
    for (let x = 0; x <= ground.w; x++) points.push(ground.x + x, 0, ground.y, ground.x + x, 0, ground.y + ground.h);
    for (let y = 0; y <= ground.h; y++) points.push(ground.x, 0, ground.y + y, ground.x + ground.w, 0, ground.y + y);
    return new Float32Array(points);
  }, [ground.x, ground.y, ground.w, ground.h]);
  const floor = floorOf(building.type);

  return (
    <>
      <color attach="background" args={["#05070c"]} />
      <group position={[-cx, 0, -cz]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.06, cz]}>
          <planeGeometry args={[240, 240]} />
          <meshBasicMaterial color={GROUND[biome] ?? "#1c222b"} />
        </mesh>
        {/* The ground round the building: a tap walks there */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} receiveShadow onClick={outside ? (e) => { e.stopPropagation(); if (e.delta <= 8) walkTo([{ x: Math.floor(e.point.x + cx), y: Math.floor(e.point.z + cz) }]); } : undefined}>
          <planeGeometry args={[ground.w, ground.h]} />
          <meshStandardMaterial color={new THREE.Color(GROUND[biome] ?? "#1c222b").multiplyScalar(1.5)} roughness={1} />
        </mesh>
        <lineSegments>
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
          if (room === opened) {
            return (
              <group key={room.id} position={[l.x, 0, l.y]}>
                <RoomShell
                  width={l.width}
                  height={l.height}
                  assets={shown}
                  floor={floor}
                  wall={wall}
                  ships={room.ships}
                  looted={(a) => !!room.loot.find((c) => c.id === a.ref)?.looted}
                  wayColor={wayColor}
                  wayLabel={wayLabel}
                  onFloor={inside ? (x, y) => walkTo([{ x: l.x + x, y: l.y + y }]) : undefined}
                  onAsset={inside ? actOn : undefined}
                >
                  {shown.filter((a) => a.kind === "npc").map((a) => {
                    const occupant = room.occupants.find((o) => o.id === a.ref)!;
                    return (
                      <group key={a.id} position={[a.x + 0.5, 0, a.y + 0.5]} rotation={[0, hue(a.id) % 6, 0]}>
                        <Figure kind={tokenOf(occupant)} ring={SIDE_COLORS[occupant.disposition]} name={occupant.name} large={isLarge(occupant.size)} />
                        <Label at={[0, isLarge(occupant.size) ? 2.2 : 1.6, 0]} size={0.26} color={SIDE_COLORS[occupant.disposition]}>{a.name}</Label>
                        {inside && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => walkTo(around(l.x + a.x, l.y + a.y), () => onAct?.({ type: "occupant", id: occupant.id }))} />}
                      </group>
                    );
                  })}
                </RoomShell>
                <Label at={[l.width / 2, 2.6, l.height / 2]} size={0.5} color="#facc15">{room.name}</Label>
              </group>
            );
          }
          // A room seen from outside it: closed, with what is set in its outside walls
          const tall = opened ? 1 : 2;
          const roof = hue(room.id);
          return (
            <group key={room.id} position={[l.x, 0, l.y]}>
              <mesh position={[l.width / 2, tall / 2, l.height / 2]} castShadow onClick={reveal ? (e) => tapPlace(e, room.id) : undefined}>
                <boxGeometry args={[l.width, tall, l.height]} />
                <meshStandardMaterial color={opened ? new THREE.Color(wall).multiplyScalar(0.45) : wall} roughness={0.95} />
              </mesh>
              <Box at={[l.width / 2, tall + 0.05, l.height / 2]} size={[l.width + 0.2, 0.1, l.height + 0.2]} color={opened ? "#1a2028" : "#4a525c"} />
              {!opened && (
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
              {!opened && l.assets.filter((a) => a.side && (a.kind === "exit" || a.kind === "window" || (a.kind === "secret" && room.secretEntry?.found) || (a.kind === "door" && !inRoom(beyond(l, a).x, beyond(l, a).y)))).map((a) => {
                const at = onWall(l, a);
                const step = beyond(l, a);
                return (
                  <group key={a.id}>
                  {a.kind !== "window" && a.kind !== "door" && (
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[step.x - l.x + 0.5, 0.02, step.y - l.y + 0.5]} onClick={outside ? (e) => { e.stopPropagation(); if (e.delta <= 8) actOutside(room, a); } : undefined}>
                      <planeGeometry args={[0.92, 0.92]} />
                      <meshBasicMaterial color={WAY_COLORS[a.kind as keyof typeof WAY_COLORS]} transparent opacity={0.45} depthWrite={false} />
                    </mesh>
                  )}
                  <group position={[at.x, 0, at.z]} rotation={[0, at.turn, 0]}>
                    <Doorway kind={a.kind} color={WAY_COLORS[a.kind as keyof typeof WAY_COLORS]} label={a.kind === "exit" ? (a.name === "Way out" ? "Way in" : "Back way in") : a.kind === "secret" ? a.name : undefined} onTap={outside ? () => actOutside(room, a) : undefined} />
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
                {outside && <Hit at={[0, 0.8, 0]} size={[1.2, 1.8, 1.2]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "exit", exit }))} />}
              </group>
            ))}
            {street.decor.map((d, i) => <group key={i} position={[d.x, 0, d.y]}><Decor kind={d.kind} /></group>)}
            {street.folk.map(({ occupant, x, y }, i) => (
              <group key={`${occupant.id}-${i}`} position={[x + 0.5, 0, y + 0.5]}>
                <Figure kind={tokenOf(occupant)} ring={SIDE_COLORS[occupant.disposition]} name={occupant.name} large={isLarge(occupant.size)} />
                <Label at={[0, 1.6, 0]} size={0.26} color={SIDE_COLORS[occupant.disposition]}>{occupant.name}</Label>
                {outside && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "occupant", id: occupant.id }))} />}
              </group>
            ))}
            {street.caches.map(({ cache, x, y }) => (
              <group key={cache.id} position={[x, 0, y]}>
                <Chest looted={cache.looted} />
                {outside && <Hit at={[0.5, 0.4, 0.5]} size={[1, 0.8, 1]} onTap={() => walkTo(around(x, y), () => onAct?.({ type: "loot", id: cache.id }))} />}
              </group>
            ))}
            <Label at={[cx, 4.6, cz]} size={0.8}>{building.name}</Label>
          </>
        )}

        {present && (
          <group ref={token} position={[standing.x + 0.5, 0, standing.y + 0.5]}>
            <Figure kind="player" ring={SIDE_COLORS.player} marker />
          </group>
        )}
      </group>

      <Probe
        locate={(key) => {
          const [what, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
          if (key === "me") return [feet.current.x + 0.5 - cx, 0.6, feet.current.y + 0.5 - cz];
          if (what === "sq") return [Number(id.split(",")[0]) + 0.5 - cx, 0, Number(id.split(",")[1]) + 0.5 - cz];
          if (what === "sign") {
            const sign = street.signs.find((s) => s.exit.to === id);
            return sign && [sign.x + 0.5 - cx, 0.8, sign.y + 0.5 - cz];
          }
          // Something in a wall or on a floor, by the kind of thing it is or by what it stands for
          for (const room of rooms) {
            const l = room.layout;
            const a = l?.assets.find((x) => x.id === id || (what !== "asset" && x.kind === what && (x.ref === id || x.to === id || room.id === id)));
            if (!l || !a) continue;
            const at = a.side ? onWall(l, a) : { x: a.x + a.w / 2, z: a.y + a.h / 2 };
            return [l.x + at.x - cx, 0.6, l.y + at.z - cz];
          }
          return undefined;
        }}
      />
      <Rig target={focus} offset={opened ? [0, reach * 0.95, reach * 0.75] : [-reach * 0.75, reach * 0.75, reach * 0.6]} min={4} max={120} fov={45} follow={eye} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[12, 30, 14]} intensity={0.9} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
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

  const tapSquare = (x: number, y: number) => {
    const there = combatants.find((c) => c.hp > 0 && c.x === x && c.y === y);
    if (there && !there.isPlayer) setTarget(there.id);
    else if (playerTurn && steps.get(`${x},${y}`)?.cost) moveTo(x, y);
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
          {Array.from(steps.entries()).filter(([, step]) => step.cost > 0).map(([k]) => {
            const [x, y] = k.split(",").map(Number);
            return (
              <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x + 0.5, 0.02, y + 0.5]}>
                <planeGeometry args={[0.9, 0.9]} />
                <meshBasicMaterial color="#4ade80" transparent opacity={0.28} depthWrite={false} />
              </mesh>
            );
          })}
          {player && target && target.hp > 0 && (
            <Line points={[[(player.x ?? 0) + 0.5, 0.9, (player.y ?? 0) + 0.5], [(target.x ?? 0) + 0.5, 0.9, (target.y ?? 0) + 0.5]]} color={covered ? "#fbbf24" : "#f87171"} lineWidth={2} dashed dashSize={0.3} gapSize={0.2} />
          )}
          {combatants.map((c) => {
            const down = c.hp <= 0;
            const large = isLarge(c.size);
            const side = c.isPlayer ? SIDE_COLORS.player : SIDE_COLORS.hostile;
            return (
              <group key={String(c.id)} position={[(c.x ?? 0) + 0.5, 0, (c.y ?? 0) + 0.5]}>
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
                    <mesh position={[-0.45 * (1 - Math.max(0, Math.min(1, c.hp / c.maxHp))), 0, 0.001]}><planeGeometry args={[0.9 * Math.max(0.001, Math.min(1, c.hp / c.maxHp)), 0.1]} /><meshBasicMaterial color={c.isPlayer ? "#4ade80" : "#f87171"} /></mesh>
                    <Text position={[0, 0.24, 0]} fontSize={0.24} color={side} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">{c.name}</Text>
                  </Billboard>
                )}
                {!down && !c.isPlayer && <Hit at={[0, 0.7, 0]} size={[0.9, 1.4, 0.9]} onTap={() => setTarget(c.id)} />}
              </group>
            );
          })}
        </RoomShell>
      </group>
      <Probe
        locate={(key) => {
          const [x, y] = key.slice(key.indexOf(":") + 1).split(",").map(Number);
          const who = key === "me" ? player : key.startsWith("foe:") ? combatants.filter((c) => !c.isPlayer && c.hp > 0)[x || 0] : undefined;
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

  return (
    <>
      <color attach="background" args={["#000000"]} />
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
            <meshStandardMaterial color={new THREE.Color(BIOME_COLOR[view.type] ?? "#5fa56a").multiplyScalar(0.5)} roughness={1} />
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
                  <meshStandardMaterial color={BIOME_COLOR[area.type] ?? color} emissive={BIOME_COLOR[area.type] ?? color} emissiveIntensity={0.25} roughness={0.9} />
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
          <Label at={[0, 5.4, 0]} size={1.1} color="#facc15">{`${PARTY_AT[view.kind] ?? "Here"} (you are here)`}</Label>
        </group>
      )}
      {!places.length && <Label at={[0, 6, 0]} size={1.6} color="#aabbdd">{`Nobody has mapped ${view.name} yet`}</Label>}
      <Label at={[0, globe ? 20 : 0.5, globe ? -30 : -34 * span - 6]} size={2 * span} color="#aabbdd">{`${LAYER_NAME[view.kind] ?? ""} ${view.name}`}</Label>

      <Probe locate={(key) => {
        const area = places.find((a) => `area:${a.id}` === key);
        return area ? at(area) : undefined;
      }} />
      <Rig target={[0, 0, 0]} offset={globe ? [0, 50, 40] : system ? [0, 40, 34] : [0, 42 * span, 30 * span]} min={10} max={260} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 30, 10]} intensity={0.8} />
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
  if (view.kind === "building") return <BuildingScene key={view.id} world={world} building={view} hereId={hereId} selectedId={selectedId} onAct={onAct} locked={locked} reveal={reveal} />;
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
              <meshStandardMaterial color="#888888" />
            </mesh>
          ) : (
            <mesh>
              <cylinderGeometry args={[0, 1.5, 5, 8]} />
              <meshStandardMaterial color="#228822" />
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
        <meshStandardMaterial 
          map={terrainTexture} 
          color={0x88bb88}
        />
      </mesh>
      
      {/* Player */}
      <mesh ref={playerRef} position={[0, 1, 0]} castShadow>
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial color="#4444cc" />
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
